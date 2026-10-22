'use client';

// components/model/ModelView.tsx
//
// ONE RENDERER FOR EVERY MODEL, in two dimensions or three.
//
// It knows points, lines, meshes, arrows, regions and words. It does not know
// what a volatility surface is, what a pendulum is, or what a geodesic is —
// those are models (lib/model/library.ts), and a model that needed its own
// component would mean this design had failed.
//
// WHY 2D AND 3D ARE ONE COMPONENT AND NOT TWO. "Flatten this" and "hold y
// constant" have to keep the same model, the same controls, the same
// selection and the same conversation; two components would mean two of each,
// drifting. So the dimensionality is a property of the VIEW, the primitives
// are the same primitives either way, and flattening a surface draws its level
// sets rather than a different object — which is what a contour map IS.
//
// WHAT IT REUSES. The frame (Surface3D) for the camera, the clock, the
// controls, full screen, selection and the seam to the conversation; the
// projection and the box from lib/logos-viz3d. Nothing here is a second copy
// of either.

import './model-view.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PALETTE, Surface3D, snap, type RenderArgs, type SurfaceRender } from '@/components/surfaces/Surface3D';
import { place, project3, toUnit, type Camera, type Frame3, type Pt2 } from '@/lib/logos-viz3d';
import { niceTicks, tickLabel } from '@/lib/model/units';
import { contour } from '@/lib/model/sample';
import type { P3, Primitive } from '@/lib/model/primitives';
import { buildSlice } from '@/lib/model/compile';
import { inputsAwaiting, inputsOf } from '@/lib/model/derive';
import { ModelAside, ViewSwitch } from './Understand';
import { inspectModel } from '@/lib/model/inspect';
import { panelMarks } from './panelMarks';
import { frameFor, panelFor, viewById } from '@/lib/model/viewdata';
import { unpack } from '@/lib/model/unpack';
import { buildSpec, type VisualizationSpec } from '@/lib/model/spec';
import { FACING } from '@/lib/model/solid';
import { modelStateFrom, applyOps, type ViewState } from '@/lib/model/state';
import { objectOf, setParam, setTime, type Model } from '@/lib/model/schema';
import type { VizEntity, VizModelState, VizOp } from '@/lib/viz-model';

/** The palette, by role. The same five the rest of Logos draws with. */
const TONE: Record<string, string> = {
  primary: 'var(--lg-primary)',
  accent: 'var(--lg-accent)',
  tension: 'var(--lg-tension)',
  muted: 'var(--lg-ink-40)',
  ghost: 'var(--lg-ink-24)',
  u1: '#7C6A9C',
  u2: '#3F7F6E',
  u3: '#B07C3A',
  u4: '#5A7BA6',
};
const strokeOf = (prim: Primitive) => prim.color || TONE[prim.tone ?? 'primary'] || TONE.primary;

/**
 * Where a figure in space is first seen from: a little round from the front,
 * a little above. Its yaw is the one a solid's dimension lines are drawn to
 * face (lib/model/solid.ts FACING), so they open on the near side of the part.
 */
const CAM3 = { yaw: FACING, pitch: 0.5, dist: 3.4 };

/** A frame that maps the spec's box onto the unit cube the projection uses. */
function frameOf(spec: VisualizationSpec): Frame3 {
  return {
    x: { min: spec.box.x[0], max: spec.box.x[1] },
    y: { min: spec.box.y[0], max: spec.box.y[1] },
    z: { min: spec.box.z[0], max: spec.box.z[1] },
  };
}

/**
 * IN SPACE, THE ROOM IS A LITTLE BIGGER THAN WHAT IT HOLDS — a tenth each
 * way across the floor and above — so the walls, the floor's grid and the
 * numbers along its edges stand clear of the thing rather than under it. Not
 * below: a solid stands on its floor. The flat view keeps its box exact, since
 * there the box IS the plotted range.
 */
function roomOf(spec: VisualizationSpec): VisualizationSpec['box'] {
  if (spec.dimensionality !== 3) return spec.box;
  const pad = (r: [number, number], lo: number, hi: number): [number, number] => {
    const span = r[1] - r[0] || 1;
    return [r[0] - span * lo, r[1] + span * hi];
  };
  return { x: pad(spec.box.x, 0.1, 0.1), y: pad(spec.box.y, 0.1, 0.1), z: pad(spec.box.z, 0, 0.08) };
}

const d2 = (pts: { x: number; y: number }[]) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

// ── A FIELD AS COLOUR ─────────────────────────────────────────────────
//
// A mesh that carries a value at every point (`scalar`) and asks to be filled
// is drawn, flat, as that value in colour — one pixel a sample, scaled by the
// browser — rather than as level sets. The colours are viridis, which reads in
// order and in grey; a value that runs both sides of zero gets a diverging
// scale centred on zero, so the sign is what the eye sees first.

const VIRIDIS = ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];
const DIVERGING = ['#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b'];
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const RAMP_V = VIRIDIS.map(rgbOf);
const RAMP_D = DIVERGING.map(rgbOf);
function rampAt(ramp: number[][], f: number): number[] {
  const g = Math.min(1, Math.max(0, Number.isFinite(f) ? f : 0)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(g));
  const w = g - i;
  return ramp[i].map((c, k) => Math.round(c + w * (ramp[i + 1][k] - c)));
}

interface HeatImage {
  href: string;
  x: [number, number];
  y: [number, number];
  lo: number;
  hi: number;
  diverging: boolean;
}
const HEAT = new WeakMap<object, HeatImage | null>();
/** Ids inside one frame's SVG must not meet another frame's on the same page: url(#…) takes the first in the document. */
let FRAMES = 0;

/** A colour the page names by variable, as a canvas can paint it. */
function resolveColor(css: string): string {
  const m = /^var\((--[\w-]+)(?:,\s*([^)]+))?\)$/.exec(css.trim());
  if (!m || typeof document === 'undefined') return css;
  const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  return v || m[2] || '#354620';
}

const CLOUDS = new WeakMap<object, { key: string; href: string }>();

/** Thousands of points as one image the size of the frame, at the screen's own resolution; made once per size. */
function cloudImage(prim: Extract<Primitive, { p: 'points' }>, W: number, H: number, place: (p: P3) => { x: number; y: number }, color: string): string | null {
  const key = `${Math.round(W)}x${Math.round(H)}:${color}`;
  const held = CLOUDS.get(prim);
  if (held && held.key === key) return held.href;
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(W * dpr));
  cv.height = Math.max(1, Math.round(H * dpr));
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = color;
  const r = prim.r ?? 1;
  for (const p of prim.at) {
    const q = place(p);
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
    ctx.beginPath();
    ctx.arc(q.x, q.y, r, 0, 2 * Math.PI);
    ctx.fill();
  }
  const href = cv.toDataURL();
  CLOUDS.set(prim, { key, href });
  return href;
}

/** An end of a colour scale, to three figures — and zero when it is round-off against the range. */
function scaleEnd(v: number, span: number): string {
  if (Math.abs(v) < 1e-9 * Math.max(Math.abs(span), 1e-300)) return '0';
  return String(Number(v.toPrecision(3))).replace(/^-/, '−');
}

/** The mesh's values as an image, made once per mesh. Null where there is no canvas (on the server) or nothing to show. */
function heatImage(prim: Extract<Primitive, { p: 'mesh' }>): HeatImage | null {
  if (HEAT.has(prim)) return HEAT.get(prim)!;
  let made: HeatImage | null = null;
  const sc = prim.scalar;
  const R = prim.rows.length;
  const C = prim.rows[0]?.length ?? 0;
  if (typeof document !== 'undefined' && sc && R > 1 && C > 1) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const row of sc) for (const v of row) if (v !== null && Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (Number.isFinite(lo)) {
      const diverging = lo < 0 && hi > 0 && Math.min(-lo, hi) / Math.max(-lo, hi) > 0.1;
      if (diverging) { const m = Math.max(-lo, hi); lo = -m; hi = m; }
      if (hi - lo < 1e-300) { hi = lo + 1; }
      const cv = document.createElement('canvas');
      cv.width = C;
      cv.height = R;
      const ctx = cv.getContext('2d');
      if (ctx) {
        const img = ctx.createImageData(C, R);
        for (let r = 0; r < R; r++) {
          // the first row is the lowest y, and the top of an image is its first row
          const line = R - 1 - r;
          for (let c = 0; c < C; c++) {
            const v = sc[r]?.[c];
            const k = 4 * (line * C + c);
            if (v === null || v === undefined || !Number.isFinite(v)) { img.data[k + 3] = 0; continue; }
            const [rr, gg, bb] = rampAt(diverging ? RAMP_D : RAMP_V, (v - lo) / (hi - lo));
            img.data[k] = rr; img.data[k + 1] = gg; img.data[k + 2] = bb; img.data[k + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
        const first = prim.rows[0];
        const last = prim.rows[R - 1];
        made = {
          href: cv.toDataURL(),
          x: [first[0]?.x ?? 0, first[C - 1]?.x ?? 1],
          y: [first[0]?.y ?? 0, last[0]?.y ?? 1],
          lo,
          hi,
          diverging,
        };
      }
    }
  }
  HEAT.set(prim, made);
  return made;
}

// ── COLOUR, MIXED ─────────────────────────────────────────────────────
//
// A shaded face is arithmetic on a colour, so the theme's colours arrive
// resolved (RenderArgs.palette) and are mixed here. Any CSS colour the page
// can hold comes back as numbers; anything else falls back to the moss.

type RGB = [number, number, number];
function rgbOfCss(css: string | undefined): RGB {
  const c = (css ?? '').trim();
  let m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as RGB;
  m = /^#([0-9a-f]{6})/i.exec(c);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as RGB;
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  if (m) return [+m[1], +m[2], +m[3]];
  return [53, 70, 32];
}
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
/** How light a colour is, 0–1: whether the ground is paper or night. */
const lightness = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

/**
 * The light, fixed to the viewer — up and to the left, a little in front —
 * so the lit side of a thing is the same side however it is turned.
 */
const LIGHT = (() => {
  const l = [-0.38, 0.6, 0.7];
  const n = Math.hypot(l[0], l[1], l[2]);
  return l.map((v) => v / n) as [number, number, number];
})();

/** A normal (in the box's unit space) as the viewer sees it, by the projection's own rotation. */
function viewNormal(n: { x: number; y: number; z: number }, cam: Camera): [number, number, number] {
  const q = project3(n, cam);
  return [q.x, q.y, q.depth];
}

export function ModelView({
  model: initial,
  edits,
  fill,
  onRead,
  ops,
  onModel,
  onAsk,
  pinnedView,
  onPinView,
  understand = true,
}: {
  model: Model;
  /**
   * What document this model is a revision OF, when it is one.
   *
   * Passed straight through to the state the conversation reads, which is what
   * turns the model's own verbs on (lib/viz-model.ts, MODEL_OPS) and what lets a
   * reply say "the same model, one revision later". A model with no document —
   * a benchmark opened from the library — simply has none, and the edit verbs
   * are then not offered rather than offered and ignored.
   */
  edits?: VizModelState['edits'];
  fill?: boolean;
  onRead?: (read: (() => VizModelState) | null) => void;
  ops?: { seq: number; ops: VizOp[] } | null;
  /** so a host can keep the manipulated model — a session, a comparison */
  onModel?: (model: Model) => void;
  /**
   * "Ask about this", carrying the object's CANONICAL IDENTITY.
   *
   * The host turns it into a turn of conversation. What it is handed is an id
   * the model owns — never a pixel, never a screenshot, never a guess about what
   * the reader was looking at.
   */
  onAsk?: (id: string) => void;
  /**
   * A representation pinned to THIS view rather than opened on the model.
   *
   * The Logos 3 workspace can show one model several ways at once — its
   * surface in one panel, its level sets in another — and which way a panel is
   * looking is that panel's business, not the model's. So a pinned view is
   * read here instead of `model.view`, and opening a view from this panel's
   * row tells the host (`onPinView`) instead of writing the model. Selection
   * is still written to the model: every view of it agrees on what "this" is.
   * Undefined means "follow the model", which is how every other host uses it.
   */
  pinnedView?: string | null;
  onPinView?: (id: string | null) => void;
  /** the layer of views and the account beneath the figure; a panel pinned to one representation can leave it out */
  understand?: boolean;
}) {
  // THE MODEL IS THE STATE. The frame holds the camera and the clock; this
  // holds the thing being looked at, so a control moved in the chrome and a
  // control moved from the conversation land in the same place.
  const [model, setModel] = useState<Model>(initial);
  const frameRef = useRef<string | null>(null);
  if (!frameRef.current) frameRef.current = `mv${++FRAMES}`;
  const frameId = frameRef.current;
  const [view, setView] = useState<ViewState>({});
  const [held, setHeld] = useState<Model | null>(null);

  // …BUT THE DOCUMENT OUTRANKS IT WHEN THE DOCUMENT MOVES.
  //
  // `initial` is recomputed by the host on every render, so this cannot key on
  // its identity — that would reset the model mid-drag. It keys on the model's
  // id and version, which change exactly when the host hands over a DIFFERENT
  // revision: a reply that set a control, removed a part, dropped a relation, or
  // undid any of those. Without this the seeded copy was kept forever, so an
  // edit applied to the document left the picture showing the revision before
  // it and the two disagreed with no way to tell which was current.
  const stamp = `${initial.id}@${initial.version ?? 0}`;
  const shown = useRef(stamp);
  useEffect(() => {
    if (shown.current === stamp) return;
    shown.current = stamp;
    setModel(initial);
    // …and the view's selection follows the revision: an object a reply
    // removed used to stay selected, and everything else dimmed to nothing.
    setView((v) => ({ ...v, selected: initial.selected ?? null }));
  }, [stamp, initial]);

  // ── WHICH REPRESENTATION IS OPEN ───────────────────────────────────
  //
  // `Model.view` is canonical (schema.ts), so this reads it rather than holding
  // its own copy — and falls back to nothing when it names a view this model no
  // longer offers, which happens the moment a parameter change makes a fit stop
  // running. Unset means "whichever the engine would choose", which is what
  // buildSpec already does.
  // ── THE MODEL AS THE COMPILER SEES IT ──────────────────────────────
  //
  // `unpack` is what turns a mechanism into bodies, a specification into a
  // response surface and coefficients, an equation system into its solution and
  // a relationship into its slopes. `buildSpec` has always done it; the registry
  // and the inspector had not — so the PICTURE was drawn from twelve objects
  // while the row of views and the account beside it were derived from one, and
  // a saddle's own derivatives were missing from the list of things you could
  // look at although they were sitting in the figure.
  //
  // The stated model stays canonical: edits, selection and the open view are
  // written to `model`, which is what a document holds. This is the projection
  // everything that only READS should read.
  const full = useMemo(() => unpack(model), [model]);

  const viewId = pinnedView !== undefined ? pinnedView : model.view;
  const openv = useMemo(() => (viewId ? viewById(full, viewId) : null), [full, viewId]);

  // A READ VIEW: its content, derived by lib/model/viewdata.ts and set into the
  // same frame by panelMarks. Null for a view that puts marks in the frame.
  const panel = useMemo(
    () => (openv && !openv.marks ? panelFor(full, openv.id) : null),
    [full, openv]
  );

  const spec = useMemo(() => {
    // A FRAME VIEW REPLACES THE PICTURE; A READ VIEW DOES NOT TOUCH IT. The
    // panel is drawn instead of the primitives below, but the spec still has to
    // exist — the box, the layers and the entities the conversation reads all
    // come from it, and a read view is a different way of looking at the same
    // computed state rather than a different state.
    if (openv?.marks) {
      const only = frameFor(full, openv.id);
      if (only) return only;
    }
    return buildSpec(model, { view: view.as ?? 'auto' });
  }, [model, full, view.as, openv]);
  // the room's box: the spec's own, with a margin round it in space (roomOf)
  const room = useMemo(() => roomOf(spec), [spec]);
  const frame = useMemo(() => frameOf({ ...spec, box: room }), [spec, room]);

  // A cross-section, computed from the definition rather than read off the
  // mesh — see lib/model/compile.ts buildSlice for why that distinction is
  // not pedantry.
  const slice = useMemo(() => {
    if (!view.slice) return null;
    for (const o of model.objects) {
      const cut = buildSlice(model, o, view.slice.axis, view.slice.at);
      if (cut?.value.length) return { of: o.id, prims: cut.value, note: cut.note };
    }
    return null;
  }, [model, view.slice]);

  // ── FREE INPUTS ARE CONTROLS TOO, AND DIFFERENT ONES ──────────────
  //
  // The interface offered sliders for the coefficients and none for education
  // and experience — although a wage relationship is evaluated OVER those, and
  // the reply had just promised they would be adjustable. They are a different
  // kind of control and belong in their own group: moving β₁ changes the
  // FUNCTION, moving education changes WHERE ON it you are reading. Both write
  // to the model, because the model is authoritative and this is a projection.
  // FROM THE EXPANDED MODEL. A specification's inputs are objects the expander
  // creates, so a model stored unexpanded — a benchmark, a fresh proposal —
  // offered no input sliders at all, and the Inputs group simply did not exist.
  const inputs = useMemo(() => inputsOf(full), [full]);
  // …and the ones that cannot be moved yet, shown rather than omitted. The thing
  // standing between this model and a picture was invisible in the one place a
  // person would look for it.
  const awaiting = useMemo(() => inputsAwaiting(full), [full]);

  const groups = useMemo(
    () => [
      ...(inputs.length || awaiting.length
        ? [{
            id: 'inputs',
            label: 'Inputs',
            ctls: [
              ...awaiting.map((q) => ({
                // A CONTROL WITH NOWHERE TO GO, and that is the point: it is
                // present, named, and its help says what it is waiting for. A
                // range is a modelling decision and the engine will not make it.
                id: `wait:${q.id}`,
                label: q.label,
                min: 0,
                max: 1,
                step: 1,
                read: () => 'needs a range',
                help: q.why,
              })),
              ...inputs.map((q) => ({
              id: `at:${q.id}`,
              label: q.label,
              min: q.min,
              max: q.max,
              // An indicator is 0 or 1, not 0.37 — the handle snaps.
              step: q.from === 'name' || q.from === 'type' ? 1 : (q.max - q.min) / 100,
              read: (v: number) =>
                `${Number(v.toPrecision(4))}${q.units ? ` ${q.units}` : ''}${
                  q.from === 'assumed' ? ' (range assumed)' : q.from === 'name' ? ' (0 or 1, by name)' : ''
                }`,
              // WHAT THE ENGINE READ RATHER THAN WAS TOLD, on the control itself.
              help:
                q.from === 'assumed'
                  ? `no range was given for ${q.label}, so it is drawn over ${q.min} to ${q.max} — say what range matters`
                  : q.from === 'name'
                    ? `${q.label} is read as an indicator (0 or 1) from its name — declare its kind to say otherwise`
                    : `a free input: the relationship is evaluated over it, and moving this reads it at a different point rather than changing it`,
              })),
            ],
          }]
        : []),
      {
        id: 'model',
        label: 'Model',
        ctls: model.params.map((p) => ({
          id: p.id,
          label: p.label,
          min: p.min,
          max: p.max,
          step: p.step ?? (p.max - p.min) / 100,
          // A placeholder reads as one on the slider, until it is moved.
          read: (v: number) =>
            `${Number(v.toPrecision(4))}${p.units ? ` ${p.units}` : ''}${p.assumed === 'value' ? ' (placeholder)' : ''}`,
          ...(p.means ? { help: p.means } : {}),
        })),
      },
    ],
    // `inputs` and `awaiting` are read above, so they are dependencies: a
    // revision that changes objects without touching the params reference
    // used to leave the Inputs group stale.
    [model.params, inputs, awaiting]
  );
  // `on` travels too: a layer the model declares off starts off.
  const layers = useMemo(
    () => (model.layers ?? []).map((l) => ({ id: l.id, label: l.label, ...(l.on === false ? { on: false } : {}) })),
    [model.layers]
  );
  const initialVals = useMemo(
    () => ({
      ...Object.fromEntries(initial.params.map((p) => [p.id, p.value])),
      // Expanded, for the same reason `inputs` is: the inputs of a stored,
      // unexpanded specification do not exist until unpack runs, and a slider
      // whose initial value was never set reads its minimum.
      ...Object.fromEntries(inputsOf(unpack(initial)).map((q) => [`at:${q.id}`, q.at])),
      // THE MODEL'S OWN PLAYBACK RATE. The frame's clock runs at `rate` model-time units a second, and a model
      // never handed it one: a rod heating for two hours replayed in two hours. A parameter called rate keeps its name.
      ...(initial.time?.rate && !initial.params.some((p) => p.id === 'rate') ? { rate: initial.time.rate } : {}),
    }),
    [initial]
  );

  const told = useMemo(() => modelStateFrom(model, spec), [model, spec]);
  const entities: VizEntity[] = told.entities;
  // WHAT THE CONVERSATION MUST NOT MISSTATE, lifted out of the model state the
  // frame never saw: placeholders, ranges the engine read or assumed, a
  // specification that is not estimated. Everything else in `readouts` the
  // picture's own captions already carry.
  const notes = useMemo(
    () =>
      told.readouts
        .filter((s) => /^(PLACEHOLDER COEFFICIENTS|READ OR ASSUMED BY THE ENGINE|SPECIFIED BUT NOT|THESE ARE FREE INPUTS WITH NO RANGE)/.test(s))
        .map((s) => s.slice(0, 200)),
    [told]
  );

  /** Ops the frame does not own: slice, flatten, time, compare. */
  const takeOps = useCallback(
    (list: VizOp[]) => {
      const applied = applyOps(model, list, view);
      setModel(applied.model);
      setView(applied.view);
      onModel?.(applied.model);
    },
    [model, view, onModel]
  );

  // The frame owns the controls, so a slider move arrives here as `vals`.
  // Writing it back into the model is what makes one control move one object:
  // everything downstream reads the model, and the model knows what depends
  // on what.
  const lastVals = useRef<Record<string, number>>(initialVals);
  /** the last clock value the frame itself wrote into the model */
  const syncedT = useRef<number | undefined>(initial.time?.t);
  // THE HOST'S CLOCK, ONLY WHEN THE HOST MOVED IT. Passing model.time.t
  // straight through made the frame follow its own ticks a render late, and
  // the clock crawled back toward zero. A value the frame wrote is not news
  // to it; a value an op wrote is.
  const hostTime = model.time && model.time.t !== syncedT.current ? model.time.t : undefined;
  const sync = useCallback(
    (vals: Record<string, number>, t: number) => {
      let next = model;
      for (const p of model.params) {
        const v = vals[p.id];
        if (typeof v === 'number' && v !== p.value) next = setParam(next, p.id, v);
      }
      // A PLACEHOLDER PUT BACK IS A PLACEHOLDER AGAIN. Moving one makes it
      // the person's (setParam clears the mark); "Reset all" returns it to
      // the value nobody chose, and the mark returns with it — otherwise the
      // slider read "1" where the revision reads "1 (placeholder)".
      if (next !== model) {
        const restored = next.params.map((p) => {
          const was = initial.params.find((q) => q.id === p.id);
          return was?.assumed === 'value' && !p.assumed && p.value === was.value ? { ...p, assumed: 'value' as const } : p;
        });
        if (restored.some((p, i) => p !== next.params[i])) next = { ...next, params: restored };
      }
      // A free input's cursor, written into canonical state. Prefixed `at:` so a
      // control for an input and a control for a parameter of the same name
      // cannot collide — an id is a promise about identity and two different
      // kinds of quantity must not share one.
      for (const q of inputs) {
        const v = vals[`at:${q.id}`];
        if (typeof v === 'number' && v !== q.at) {
          next = {
            ...next,
            version: (next.version ?? 0) + 1,
            at: { ...(next.at ?? {}), [q.id]: Math.min(q.max, Math.max(q.min, v)) },
          };
        }
      }
      if (model.time && t !== model.time.t) {
        next = setTime(next, Math.min(model.time.max, t));
        // The frame's own tick, remembered, so it is not handed back to the
        // frame as a host change on the next render.
        syncedT.current = Math.min(model.time.max, t);
      }
      if (next !== model) {
        lastVals.current = vals;
        // Deferred: the frame is mid-render when this runs, and React will
        // not have a component update another during one. A microtask is
        // enough, and the next frame draws the new model.
        queueMicrotask(() => {
          setModel(next);
          onModel?.(next);
        });
      }
    },
    [model, onModel, inputs]
  );

  // ── SELECTION IS CANONICAL, AND IT IS WHAT "THIS" MEANS ────────────
  //
  // Written into the model rather than into this component, so the picture, the
  // panels, the inspector and the conversation all mean the same thing by it —
  // and so "ask about this" is handed an identity rather than a description of
  // what a picture looks like near a pixel.
  const select = useCallback(
    (id: string | null) => {
      const next: Model = id
        ? { ...model, version: (model.version ?? 0) + 1, selected: id }
        : (() => {
            const { selected: _gone, ...rest } = model;
            return { ...rest, version: (model.version ?? 0) + 1 } as Model;
          })();
      setModel(next);
      setView((v) => ({ ...v, selected: id }));
      onModel?.(next);
    },
    [model, onModel]
  );

  // ── OPENING A REPRESENTATION IS CANONICAL TOO ──────────────────────
  //
  // The row of views wrote nothing: clicking "level sets" selected the surface
  // and left the figure exactly as it was. It writes here now, into the model,
  // for the same reason the selection does — a reply can open a view, `undo`
  // undoes it, and a saved document comes back to the view it was left in.
  //
  // ONE WRITE PER CLICK, AND THAT IS NOT A DETAIL. The first version of this
  // had the button call `onView` and then `onSelect`, which looked right and did
  // not work: both handlers computed their next model from the SAME captured
  // `model`, so the second overwrote the first and the view was lost every time.
  // The browser found it; no test in test/ could, because none of them render.
  // Opening a view of an object therefore selects it HERE, in one revision.
  const openView = useCallback(
    (id: string) => {
      const v = viewById(full, id);
      // Pinned: the panel changes how it looks; the model is not told, except
      // for the selection, which every view of it shares.
      if (onPinView) {
        onPinView(id);
        if (v?.of && v.of !== model.selected) {
          const sel: Model = { ...model, version: (model.version ?? 0) + 1, selected: v.of };
          setModel(sel);
          setView((s) => ({ ...s, selected: v.of }));
          onModel?.(sel);
        }
        return;
      }
      const next: Model = {
        ...model,
        version: (model.version ?? 0) + 1,
        view: id,
        ...(v?.of ? { selected: v.of } : {}),
      };
      setModel(next);
      setView((s) => (v?.of ? { ...s, selected: v.of } : s));
      onModel?.(next);
    },
    [model, full, onModel, onPinView]
  );

  const render = useCallback(
    (a: RenderArgs): SurfaceRender => {
      sync(a.vals, a.t);

      // ── A VIEW THAT IS READ TAKES THE WHOLE FRAME ────────────────
      //
      // Not a corner of it, and not a second surface beside it: the frame is
      // where the current representation goes, and for a table or a dependency
      // graph the current representation is text and rules. The chrome around
      // it — the controls, the clock, the fidelity line, the selection — is the
      // same chrome, because it belongs to the model and not to the picture.
      if (panel) {
        const set = panelMarks(panel, a, select);
        return {
          content: set.content,
          left: set.left ?? openv?.label ?? '',
          // the columns, the count of edges: the view itself already says them
          right: '',
          note: `${openv?.label ?? 'This view'} — ${set.note}`,
          label: `${openv?.label ?? 'A view'}. ${set.label}`,
          live: {},
        };
      }

      const flat = spec.dimensionality === 2;
      // WHAT IS DRAWN, IN WHAT ORDER. Three layers — the room (walls, floor,
      // grid), the model, and what is read over it (labels, ticks, insets, a
      // cut) — and within the model, far to near by `depth`, which grows
      // toward the viewer (lib/logos-viz3d project3). Shaded faces need that
      // to be right; wireframes never showed that it was not.
      const nodes: { layer: number; z: number; node: React.ReactNode }[] = [];
      const pal = a.palette ?? DEFAULT_PALETTE;
      const paper = rgbOfCss(pal.paper);
      const night = lightness(paper) < 0.45;
      const on = (prim: Primitive) => !prim.layer || a.layers[prim.layer] !== false;

      // ── where a model point lands on the page ──
      //
      // Three dimensions go through the projection the plot renderer already
      // uses; two are a straight linear map with the camera's distance as the
      // zoom, so the same primitives draw either way and a flattened view is
      // the same picture seen square on.
      // The projection is ORTHOGRAPHIC and takes no distance: a graph drawn
      // in perspective makes equal quantities look unequal, which is a lie a
      // figure must not tell. The frame's `dist` is the zoom, applied below.
      const cam: Camera = { yaw: a.cam.yaw, pitch: a.cam.pitch };
      const zoom = 3.4 / Math.max(0.6, a.cam.dist);
      const pad = 28;
      // The secondary panels sit along the bottom of the frame (drawn below);
      // their strip is known here so nothing with numbers on it is put under it.
      const panels = spec.panels ?? [];
      const panelGap = 10;
      const panelH = panels.length ? Math.min(96, Math.max(54, a.H * 0.22)) : 0;
      const panelTop = panels.length ? a.H - panelH - panelGap : a.H;
      // Flat, the floor of the plot is the bottom of the frame — or the top of
      // the panel strip, so the x axis and its numbers are not under it.
      const floor = panels.length ? panelTop - panelGap - 14 : a.H - pad;
      // TO SCALE, a plane is one scale both ways, centred in the frame; otherwise each axis fills its side
      const spanX = spec.box.x[1] - spec.box.x[0];
      const spanY = spec.box.y[1] - spec.box.y[0];
      const kx = (a.W - pad * 2) / spanX;
      const ky = (floor - pad) / spanY;
      const k1 = Math.min(kx, ky);
      const offX = spec.toScale ? (a.W - pad * 2 - k1 * spanX) / 2 : 0;
      const offY = spec.toScale ? (floor - pad - k1 * spanY) / 2 : 0;
      const sx = (x: number) => pad + offX + (x - spec.box.x[0]) * (spec.toScale ? k1 : kx);
      const sy = (y: number) => floor - offY - (y - spec.box.y[0]) * (spec.toScale ? k1 : ky);
      // FITTED TO THE STAGE, numbers and names included. The room's widest
      // reach on the page, whichever way it is turned, is √2 of its unit box;
      // its tallest is measured at the pitch it opens at, not the current one,
      // so the figure does not swell and shrink as it is tilted. It sits clear
      // of the hint above it and of the panel strip below; zoom is the
      // reader's, on top.
      const roomTop = Math.min(38, a.H * 0.1);
      const roomBottom = (panels.length ? panelTop - 8 : a.H) - Math.min(26, a.H * 0.08);
      const reachY = Math.cos(CAM3.pitch) + Math.SQRT2 * Math.sin(CAM3.pitch);
      const fit = Math.min((a.W - 2 * Math.min(56, a.W * 0.12)) / (2 * Math.SQRT2), (roomBottom - roomTop) / (2 * reachY));
      const centre = { x: a.W / 2, y: (roomTop + roomBottom) / 2 };
      const spread = Math.max(36, fit) * zoom;
      const at = (p: P3): Pt2 & { depth: number } => {
        if (flat) return { x: sx(p.x), y: sy(p.y), depth: 0 };
        // place() returns the unit box projected into [-1, 1]; the view puts
        // that on the page, so zooming is one multiplication rather than a
        // second projection.
        const q = place(p, frame, cam);
        return { x: centre.x + q.x * spread, y: centre.y - q.y * spread, depth: q.depth };
      };

      const put = (depth: number, node: React.ReactNode, layer = 1) => nodes.push({ layer, z: depth, node });

      // The box. In three dimensions it is the cube the projection implies;
      // flat, it is two rules, because a rectangle around a plot is furniture.
      //
      // AND THE NUMBERS ON IT. A box with no scale is geometry; a reader
      // cannot tell twenty years of schooling from two, or a wage from a log
      // of one. Each axis gets round ticks along one edge of the cage — the
      // edge nearest the viewer for x and y, the leftmost post for z — and its
      // name, in its units, from the spec (lib/model/units.ts). Flat, the two
      // rules carry the same ticks and names.
      const nameOf = (i: 0 | 1 | 2) => spec.axisNames[i] ?? '';
      if (!flat) {
        // THE ROOM, NOT A CAGE. Twelve edges drawn whole read as wire around
        // the model; a figure reads by its back walls and its floor, each with
        // a light grid at the round numbers, so the eye has a ground and two
        // planes to measure against, and nothing is drawn in front of the
        // thing. Which walls are at the back depends on the turn: for each
        // axis, the side further from the viewer.
        const bx0 = room;
        const mid3 = { x: (bx0.x[0] + bx0.x[1]) / 2, y: (bx0.y[0] + bx0.y[1]) / 2, z: (bx0.z[0] + bx0.z[1]) / 2 };
        const farSide = (ax: 'x' | 'y' | 'z'): number => {
          const lo = at({ ...mid3, [ax]: bx0[ax][0] });
          const hi = at({ ...mid3, [ax]: bx0[ax][1] });
          return lo.depth < hi.depth ? bx0[ax][0] : bx0[ax][1];
        };
        const pane = (ax: 'x' | 'y' | 'z', key: string, tone: 'floor' | 'wall') => {
          const at0 = farSide(ax);
          const [u, v] = (['x', 'y', 'z'] as const).filter((k) => k !== ax);
          const P = (uu: number, vv: number) => at({ [ax]: at0, [u]: uu, [v]: vv } as unknown as P3);
          const [u0, u1] = bx0[u];
          const [v0, v1] = bx0[v];
          const ring = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
          const grid: string[] = [];
          for (const t of niceTicks(u0, u1, 4)) if (t > u0 && t < u1) grid.push(d2([P(t, v0), P(t, v1)]));
          for (const t of niceTicks(v0, v1, 4)) if (t > v0 && t < v1) grid.push(d2([P(u0, t), P(u1, t)]));
          return (
            <g key={key} className={`eng-pane is-${tone}`}>
              <path className="eng-pane-fill" d={`${d2(ring)} Z`} />
              {grid.map((dd, i) => (
                <path key={i} className="eng-pane-grid" d={dd} />
              ))}
              <path className="eng-pane-edge" d={`${d2(ring)} Z`} />
            </g>
          );
        };
        put(0, (
          <g key="room" className="eng-room">
            {pane('x', 'wx', 'wall')}
            {pane('y', 'wy', 'wall')}
            {pane('z', 'fz', 'floor')}
          </g>
        ), 0);
        // The edge each axis is read along, chosen on the page rather than in
        // the model: x and y along their lowest edge, z along the leftmost.
        const bx = room;
        const corners = (ax: 'x' | 'y' | 'z'): [P3, P3][] => {
          const lo = { x: bx.x[0], y: bx.y[0], z: bx.z[0] };
          const hi = { x: bx.x[1], y: bx.y[1], z: bx.z[1] };
          const others = (['x', 'y', 'z'] as const).filter((k) => k !== ax);
          const out: [P3, P3][] = [];
          for (const a0 of [lo, hi]) for (const b0 of [lo, hi]) {
            const base: P3 = { x: 0, y: 0, z: 0 };
            base[others[0]] = a0[others[0]];
            base[others[1]] = b0[others[1]];
            out.push([{ ...base, [ax]: lo[ax] }, { ...base, [ax]: hi[ax] }]);
          }
          return out;
        };
        const marks: React.ReactNode[] = [];
        const centreOnPage = at({ x: (bx.x[0] + bx.x[1]) / 2, y: (bx.y[0] + bx.y[1]) / 2, z: (bx.z[0] + bx.z[1]) / 2 });
        (['x', 'y', 'z'] as const).forEach((ax, i) => {
          const edges = corners(ax).map((e) => ({ e, p0: at(e[0]), p1: at(e[1]) }));
          // The lowest edge for x and y, the leftmost post for z — but never
          // one that lies under the panel strip, where its numbers would be
          // covered. Among the uncovered, the same preference; if every edge
          // is covered, the highest one.
          const midY = (q: (typeof edges)[number]) => (q.p0.y + q.p1.y) / 2;
          const clear = edges.filter((q) => Math.max(q.p0.y, q.p1.y) < panelTop - 16);
          const pool = clear.length ? clear : edges;
          const pick = pool.reduce((best, cur) => {
            const score = (q: typeof cur) =>
              ax === 'z' ? -(q.p0.x + q.p1.x) / 2 : clear.length ? midY(q) : -midY(q);
            return score(cur) > score(best) ? cur : best;
          });
          const dx = pick.p1.x - pick.p0.x;
          const dy = pick.p1.y - pick.p0.y;
          const len = Math.hypot(dx, dy) || 1;
          // Outward: perpendicular to the edge, pointing away from the box.
          let nx = -dy / len, ny = dx / len;
          const mx = (pick.p0.x + pick.p1.x) / 2, my = (pick.p0.y + pick.p1.y) / 2;
          if ((mx - centreOnPage.x) * nx + (my - centreOnPage.y) * ny < 0) { nx = -nx; ny = -ny; }
          const lo = bx[ax][0], hi = bx[ax][1];
          const ticks = len < 60 ? [] : niceTicks(lo, hi, len < 140 ? 2 : 3);
          for (const v of ticks) {
            const q = at({ ...pick.e[0], [ax]: v });
            marks.push(
              <g key={`tk-${ax}-${v}`} className="eng-tick">
                <path d={`M${q.x.toFixed(1)},${q.y.toFixed(1)} L${(q.x + nx * 4).toFixed(1)},${(q.y + ny * 4).toFixed(1)}`} />
                <text x={(q.x + nx * 10).toFixed(1)} y={(q.y + ny * 10 + 3).toFixed(1)} textAnchor={nx > 0.3 ? 'start' : nx < -0.3 ? 'end' : 'middle'}>
                  {tickLabel(v)}
                </text>
              </g>
            );
          }
          // The name goes PAST THE END of its edge, the way an axis is read,
          // rather than beside its middle — where three names on three edges
          // of one cage met each other and the z post's own numbers.
          const name = nameOf(i as 0 | 1 | 2);
          if (name && len >= 40) {
            const ux = dx / len, uy = dy / len;
            // The end of the edge that is further from the box's centre on the
            // page is the one with room beyond it.
            const endIsP1 = Math.hypot(pick.p1.x - centreOnPage.x, pick.p1.y - centreOnPage.y) >= Math.hypot(pick.p0.x - centreOnPage.x, pick.p0.y - centreOnPage.y);
            const end = endIsP1 ? pick.p1 : pick.p0;
            // The vertical post's far end is the top of the frame, where a name
            // past it is clipped; z is named beside its middle instead, on the
            // outward side, where its numbers already are.
            const vertical = ax === 'z';
            const ox = vertical ? 0 : endIsP1 ? ux : -ux;
            const oy = vertical ? 0 : endIsP1 ? uy : -uy;
            // …and clear of them: the widest tick label sets how far out.
            const widest = ticks.reduce((w, v) => Math.max(w, tickLabel(v).length), 1);
            // The tick labels sit 10px out and run `widest` characters back
            // from there; the name starts a gap beyond that.
            const clearance = 10 + widest * 5.8 + 10;
            const tx = vertical ? mx + nx * clearance : end.x + ox * 10 + nx * 6;
            const ty = (vertical ? my + ny * clearance : end.y + oy * 10 + ny * 6) + 3;
            marks.push(
              <text
                key={`ax-${ax}`}
                className="eng-axis"
                x={tx.toFixed(1)}
                y={ty.toFixed(1)}
                textAnchor={vertical ? (nx > 0.3 ? 'start' : nx < -0.3 ? 'end' : 'middle') : ox > 0.3 ? 'start' : ox < -0.3 ? 'end' : 'middle'}
              >
                {name}
              </text>
            );
          }
        });
        put(0, <g key="scale">{marks}</g>, 2);
      } else {
        // the rules run along the box's own edges — the frame's edges, unless a plane is drawn to scale
        const left = sx(spec.box.x[0]);
        const right = sx(spec.box.x[1]);
        const base = sy(spec.box.y[0]);
        const top = sy(spec.box.y[1]);
        const xt = niceTicks(spec.box.x[0], spec.box.x[1], a.W > 420 ? 5 : 3);
        const yt = niceTicks(spec.box.y[0], spec.box.y[1], a.H > 260 ? 4 : 2);
        // a light grid at the round numbers: the plane has a scale to read against
        put(0, (
          <g key="grid" className="eng-grid">
            {xt.filter((v) => sx(v) > left + 0.5 && sx(v) < right - 0.5).map((v) => (
              <path key={`gx${v}`} d={`M${sx(v).toFixed(1)},${top.toFixed(1)} L${sx(v).toFixed(1)},${base.toFixed(1)}`} />
            ))}
            {yt.filter((v) => sy(v) < base - 0.5 && sy(v) > top + 0.5).map((v) => (
              <path key={`gy${v}`} d={`M${left.toFixed(1)},${sy(v).toFixed(1)} L${right.toFixed(1)},${sy(v).toFixed(1)}`} />
            ))}
          </g>
        ), 0);
        put(1, (
          <g key="axes" className="eng-box">
            <path d={`M${left.toFixed(1)},${base.toFixed(1)} L${right.toFixed(1)},${base.toFixed(1)}`} />
            <path d={`M${left.toFixed(1)},${top.toFixed(1)} L${left.toFixed(1)},${base.toFixed(1)}`} />
          </g>
        ), 0);
        put(0, (
          <g key="scale">
            {xt.map((v) => (
              <g key={`x${v}`} className="eng-tick">
                <path d={`M${sx(v).toFixed(1)},${base.toFixed(1)} L${sx(v).toFixed(1)},${(base + 4).toFixed(1)}`} />
                <text x={sx(v).toFixed(1)} y={(base + 14).toFixed(1)} textAnchor="middle">{tickLabel(v)}</text>
              </g>
            ))}
            {yt.map((v) => (
              <g key={`y${v}`} className="eng-tick">
                <path d={`M${(left - 4).toFixed(1)},${sy(v).toFixed(1)} L${left.toFixed(1)},${sy(v).toFixed(1)}`} />
                <text x={(left - 7).toFixed(1)} y={(sy(v) + 3).toFixed(1)} textAnchor="end">{tickLabel(v)}</text>
              </g>
            ))}
            {nameOf(0) && (
              <text className="eng-axis" x={right.toFixed(1)} y={(base + 24).toFixed(1)} textAnchor="end">{nameOf(0)}</text>
            )}
            {nameOf(1) && (
              <text className="eng-axis" x={(left + 6).toFixed(1)} y={(top - 8).toFixed(1)} textAnchor="start">{nameOf(1)}</text>
            )}
          </g>
        ), 2);
      }

      // INDEXED, BECAUSE ONE OBJECT MAY DRAW SEVERAL MARKS OF THE SAME KIND.
      //
      // The keys here were `${kind}${prim.of}`, which assumed at most one mesh,
      // one polyline and one label per object. A solved system of equations
      // breaks that assumption properly: its carrier emits a line per relation,
      // a segment per offset and a label for each, all with the same `of`. React
      // would then see repeated keys and keep one of each, so a figure with two
      // relations drew one line — a wrong picture produced by a key collision
      // rather than by any mistake in the geometry.
      for (let pi = 0; pi < spec.primitives.length; pi++) {
        const prim = spec.primitives[pi];
        if (!on(prim)) continue;
        const stroke = strokeOf(prim);
        const dim = view.selected && view.selected !== prim.of;

        switch (prim.p) {
          case 'mesh': {
            // A FIELD, FLAT, IS ITS COLOUR: one sample a pixel, and a scale that says what the colours are
            if (flat && prim.fill && prim.scalar) {
              const img = heatImage(prim);
              if (img) {
                const tl = at({ x: img.x[0], y: img.y[1], z: 0 });
                const br = at({ x: img.x[1], y: img.y[0], z: 0 });
                put(-Infinity, (
                  <g key={`m${pi}`} data-obj={prim.of} opacity={dim ? 0.4 : 1}>
                    <image href={img.href} x={tl.x.toFixed(1)} y={tl.y.toFixed(1)} width={Math.max(1, br.x - tl.x).toFixed(1)} height={Math.max(1, br.y - tl.y).toFixed(1)} preserveAspectRatio="none" />
                  </g>
                ));
                // THE SCALE, IN THE TOP MARGIN — above the picture, never over it: name, low end, colours, high end
                const bw = 84;
                const loT = scaleEnd(img.lo, img.hi - img.lo);
                const hiT = scaleEnd(img.hi, img.hi - img.lo);
                const cy = Math.max(10, pad / 2);
                const xHi = a.W - pad;
                const barR = xHi - hiT.length * 5.2 - 5;
                const barL = barR - bw;
                const xLo = barL - 4;
                const xName = xLo - loT.length * 5.2 - 9;
                const stops = (img.diverging ? DIVERGING : VIRIDIS).map((c, i, all) => <stop key={i} offset={`${(100 * i) / (all.length - 1)}%`} stopColor={c} />);
                put(0, (
                  <g key={`cb${pi}`} className="eng-colorbar" style={{ pointerEvents: 'none' }}>
                    <defs>
                      <linearGradient id={`${frameId}-cbg-${pi}`} x1="0" x2="1" y1="0" y2="0">{stops}</linearGradient>
                    </defs>
                    <text x={xName} y={cy + 3} textAnchor="end" className="eng-axis">{nameOf(2) || 'value'}</text>
                    <text x={xLo} y={cy + 3} textAnchor="end" className="eng-tick-label">{loT}</text>
                    <rect x={barL} y={cy - 4} width={bw} height={8} fill={`url(#${frameId}-cbg-${pi})`} />
                    <text x={barR + 5} y={cy + 3} textAnchor="start" className="eng-tick-label">{hiT}</text>
                  </g>
                ), 2);
                break;
              }
            }
            // FLATTENED, A SURFACE IS ITS LEVEL SETS. Not a wireframe seen
            // from above, which is a grid; the contours are what a surface
            // means in the plane, and they are computed from the same rows.
            if (flat) {
              const rows = prim.rows.map((row) =>
                row.map((v) => ({ x: v?.x ?? 0, y: v?.y ?? 0, z: v ? v.z : null }))
              );
              const levels: Primitive[] = [];
              const zs = rows.flatMap((r) => r.map((s) => s.z)).filter((z): z is number => z !== null);
              if (zs.length) {
                const lo = Math.min(...zs);
                const hi = Math.max(...zs);
                for (let k = 1; k <= 9; k++) {
                  levels.push(...contour(prim.of, rows, lo + ((hi - lo) * k) / 10, { tone: prim.tone }).value);
                }
              }
              put(0, (
                <g key={`m${pi}`} data-obj={prim.of} opacity={dim ? 0.35 : 1}>
                  {levels.map((l, i) =>
                    l.p === 'polyline' ? (
                      <path key={i} d={d2(l.at.map(at))} fill="none" stroke={stroke} strokeWidth={1} />
                    ) : null
                  )}
                </g>
              ));
              break;
            }
            // IN SPACE: SHADED FACES, LIT FROM THE VIEWER'S UPPER LEFT, DRAWN
            // FAR TO NEAR — and each face carries its own edge, so the grid is
            // still there and is hidden where the surface hides it. A surface
            // is tinted by its height, primary at the bottom to accent at the
            // top, so a rise reads before a number does; a closed solid (`fill`)
            // is one colour, with no grid on it, its outline left to its edges.
            // A hole in the function is a face that is not drawn, never a face
            // stretched across it.
            const R = prim.rows.length;
            const C = prim.rows[0]?.length ?? 0;
            if (R < 2 || C < 2) break;
            // At most ~3600 faces: past that a turn would redraw thousands of
            // paths a frame, and the eye cannot tell the difference.
            const step = Math.max(1, Math.ceil(Math.sqrt(((R - 1) * (C - 1)) / 3600)));
            const ri: number[] = [];
            for (let r = 0; r < R; r += step) ri.push(r);
            if (ri[ri.length - 1] !== R - 1) ri.push(R - 1);
            const ci: number[] = [];
            for (let c = 0; c < C; c += step) ci.push(c);
            if (ci[ci.length - 1] !== C - 1) ci.push(C - 1);
            const solid = !!prim.fill;
            const base = rgbOfCss(prim.color ? resolveColor(prim.color) : (pal as unknown as Record<string, string>)[prim.tone ?? 'primary'] ?? pal.primary);
            const accent = rgbOfCss(pal.accent);
            const white: RGB = [255, 255, 255];
            const black: RGB = [0, 0, 0];
            const proj = ri.map((r) => ci.map((c) => {
              const p = prim.rows[r]?.[c];
              return p ? { q: at(p), u: toUnit(p, frame) } : null;
            }));
            const faces: { z: number; d: string; fill: string; edge: string }[] = [];
            for (let i = 0; i + 1 < ri.length; i++) {
              for (let j = 0; j + 1 < ci.length; j++) {
                const A = proj[i][j], B = proj[i][j + 1], Cc = proj[i + 1][j + 1], D = proj[i + 1][j];
                if (!A || !B || !Cc || !D) continue;
                // the face's normal, from its diagonals, in the box's own space
                const e1 = { x: Cc.u.x - A.u.x, y: Cc.u.y - A.u.y, z: Cc.u.z - A.u.z };
                const e2 = { x: D.u.x - B.u.x, y: D.u.y - B.u.y, z: D.u.z - B.u.z };
                const n = { x: e1.y * e2.z - e1.z * e2.y, y: e1.z * e2.x - e1.x * e2.z, z: e1.x * e2.y - e1.y * e2.x };
                const len = Math.hypot(n.x, n.y, n.z);
                if (!(len > 1e-12)) continue;
                const v = viewNormal({ x: n.x / len, y: n.y / len, z: n.z / len }, cam);
                const lit = Math.abs(v[0] * LIGHT[0] + v[1] * LIGHT[1] + v[2] * LIGHT[2]);
                const k = 0.38 + 0.62 * lit;
                // a surface rises from primary to accent; a solid is its own colour
                const h = solid ? 0 : Math.min(1, Math.max(0, ((A.u.z + B.u.z + Cc.u.z + D.u.z) / 4 + 1) / 2));
                const tint = solid ? base : mixRGB(base, accent, h * 0.75);
                const light = night ? mixRGB(tint, white, 0.18) : mixRGB(tint, white, 0.62);
                const dark = night ? mixRGB(tint, black, 0.55) : mixRGB(tint, black, 0.12);
                const col = mixRGB(dark, light, k);
                faces.push({
                  z: (A.q.depth + B.q.depth + Cc.q.depth + D.q.depth) / 4,
                  d: `M${A.q.x.toFixed(1)},${A.q.y.toFixed(1)} L${B.q.x.toFixed(1)},${B.q.y.toFixed(1)} L${Cc.q.x.toFixed(1)},${Cc.q.y.toFixed(1)} L${D.q.x.toFixed(1)},${D.q.y.toFixed(1)} Z`,
                  fill: css(col),
                  edge: solid ? css(col) : css(mixRGB(col, night ? white : black, night ? 0.22 : 0.2)),
                });
              }
            }
            faces.sort((f, g) => f.z - g.z);
            const mid = prim.rows[Math.floor(R / 2)]?.[Math.floor(C / 2)];
            put(mid ? at(mid).depth : faces.length ? faces[faces.length >> 1].z : 0, (
              <g key={`m${pi}`} data-obj={prim.of} className={`eng-faces${solid ? ' is-solid' : ''}`} opacity={dim ? 0.3 : 1}>
                {faces.map((f, i) => (
                  <path key={i} d={f.d} fill={f.fill} stroke={f.edge} strokeWidth={solid ? 0.6 : 0.55} strokeLinejoin="round" />
                ))}
              </g>
            ));
            break;
          }

          case 'polyline': {
            const pts = prim.at.map(at);
            if (pts.length < 2) break;
            const depth = pts.reduce((s, p) => s + p.depth, 0) / pts.length;
            const dd = d2(pts);
            // A MUTED LINE IS AN ANNOTATION — a dimension, a guide — and is read
            // over the model, the way a drawing's dimensions are, rather than
            // hidden behind the body it measures.
            const note = prim.tone === 'muted' && !flat;
            put(depth, (
              <g key={`l${pi}`} data-obj={prim.of}>
                <path className="eng-hit" d={dd} />
                <path
                  d={dd}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={prim.width ?? 1.6}
                  strokeDasharray={prim.dashed ? '4 4' : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={dim ? 0.3 : (prim.alpha ?? 1)}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            ), note ? 2 : 1);
            break;
          }

          case 'points': {
            // A CLOUD OF THOUSANDS — a bifurcation diagram, an attractor — is drawn as one image in the plane: tens of
            // thousands of circles are a document too heavy to redraw when a control moves
            if (flat && prim.at.length > 4000 && typeof document !== 'undefined') {
              const href = cloudImage(prim, a.W, a.H, (p) => at(p), resolveColor(stroke));
              if (href) {
                put(0, (
                  <g key={`p${pi}`} data-obj={prim.of} opacity={dim ? 0.3 : 1}>
                    <image href={href} x={0} y={0} width={a.W} height={a.H} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />
                  </g>
                ));
                break;
              }
            }
            put(0, (
              <g key={`p${pi}`} data-obj={prim.of} opacity={dim ? 0.3 : 1}>
                {prim.at.map((p, i) => {
                  const q = at(p);
                  return (
                    <circle key={i} cx={snap(q.x)} cy={snap(q.y)} r={prim.sized?.[i] ?? prim.r ?? 2} fill={stroke} />
                  );
                })}
              </g>
            ));
            break;
          }

          case 'vectors': {
            put(0, (
              <g key={`v${pi}`} data-obj={prim.of} opacity={dim ? 0.3 : 1}>
                {prim.at.map((p, i) => {
                  const dir = prim.dir[i];
                  const tip = {
                    x: p.x + dir.x * prim.scale,
                    y: p.y + dir.y * prim.scale,
                    z: p.z + (dir.z ?? 0) * prim.scale,
                  };
                  const a0 = at(p);
                  const a1 = at(tip);
                  const ang = Math.atan2(a1.y - a0.y, a1.x - a0.x);
                  const h = 4;
                  return (
                    <g key={i}>
                      <path d={`M${a0.x.toFixed(1)},${a0.y.toFixed(1)} L${a1.x.toFixed(1)},${a1.y.toFixed(1)}`} stroke={stroke} strokeWidth={1} fill="none" />
                      <path
                        d={`M${a1.x.toFixed(1)},${a1.y.toFixed(1)} L${(a1.x - h * Math.cos(ang - 0.4)).toFixed(1)},${(a1.y - h * Math.sin(ang - 0.4)).toFixed(1)} M${a1.x.toFixed(1)},${a1.y.toFixed(1)} L${(a1.x - h * Math.cos(ang + 0.4)).toFixed(1)},${(a1.y - h * Math.sin(ang + 0.4)).toFixed(1)}`}
                        stroke={stroke}
                        strokeWidth={1}
                        fill="none"
                      />
                    </g>
                  );
                })}
              </g>
            ));
            break;
          }

          case 'region': {
            const pts = prim.at.map(at);
            put(0, (
              <path
                key={`r${pi}`}
                data-obj={prim.of}
                d={`${d2(pts)} Z`}
                fill={stroke}
                fillOpacity={prim.alpha ?? 0.12}
                stroke={stroke}
                strokeWidth={0.8}
              />
            ));
            break;
          }

          case 'label': {
            const q = at(prim.at);
            // ON A TAG, so it reads over a face, a grid or a line alike: a
            // plate sized from the words (about 6.6 px a character at this
            // size), anchored where the words are.
            const tw = prim.text.length * 6.6 + 14;
            const anchor = prim.anchor ?? 'middle';
            const tx = anchor === 'middle' ? q.x - tw / 2 : anchor === 'end' ? q.x - tw + 7 : q.x - 7;
            put(0, (
              <g key={`t${pi}`} data-obj={prim.of} className={`eng-tag${prim.tone === 'muted' ? ' is-quiet' : ''}`}>
                <rect x={snap(tx)} y={snap(q.y - 13)} width={snap(tw)} height={18} rx={9} />
                <text className="eng-label" x={snap(q.x)} y={snap(q.y)} textAnchor={anchor}>
                  {prim.text}
                </text>
              </g>
            ), 2);
            break;
          }

          case 'axes':
            break;
        }
      }

      // The cross-section, over everything, in the colour of a cut.
      if (slice) {
        for (const prim of slice.prims) {
          if (prim.p !== 'polyline') continue;
          const pts = prim.at.map(at);
          if (pts.length < 2) continue;
          put(1, (
            <path
              key={`s${pts.length}${pts[0].x}`}
              data-obj={slice.of}
              d={d2(pts)}
              fill="none"
              stroke={TONE.tension}
              strokeWidth={2.2}
              vectorEffect="non-scaling-stroke"
            />
          ), 2);
        }
      }

      // ── SECONDARY VIEWS, ON THE SAME PLATE ────────────────────────
      //
      // A mechanism beside its displacement and its energy is one model shown
      // three ways, and they are only the same model if they come from one run —
      // which they do: the panels are built from the run the main view was drawn
      // from (buildPanels in lib/model/spec.ts). The vertical rule in each panel
      // is the clock, so scrubbing time moves the bodies and the cursor together.
      //
      // Insets rather than a second component, because this is how an academic
      // figure does it and because a panel strip that lives in the chrome would
      // not be part of the figure a reader exports.
      if (panels.length) {
        const gap = panelGap;
        const pw = (a.W - gap * (panels.length + 1)) / panels.length;
        const ph = panelH;
        const top = panelTop;
        panels.forEach((panel, i) => {
          const x0 = gap + i * (pw + gap);
          const [xa, xb] = panel.range.x;
          const [ya, yb] = panel.range.y;
          const spanY = Math.max(1e-9, yb - ya);
          // the series inside the plate rather than along its edges: clear of its name at the top
          const inX = 10, inTop = 24, inBottom = 10;
          const px = (v: number) => x0 + inX + ((v - xa) / Math.max(1e-9, xb - xa)) * (pw - inX * 2);
          const py = (v: number) => top + ph - inBottom - ((v - ya) / spanY) * (ph - inTop - inBottom);
          const dd = panel.at
            .map((q, k) => `${k ? 'L' : 'M'}${px(q.x).toFixed(1)},${py(q.y).toFixed(1)}`)
            .join(' ');
          const tNow = spec.time?.t ?? null;
          const chosen = view.selected === panel.of;
          put(2, (
            <g key={`panel${panel.id}`} data-obj={panel.of} className="eng-panel">
              <rect x={x0} y={top} width={pw} height={ph} rx={10} className="eng-panel-plate" />
              {/* zero, where the series crosses it — a displacement's sign is the
                  thing a reader is looking for */}
              {ya < 0 && yb > 0 && (
                <path d={`M${x0 + inX},${py(0).toFixed(1)} L${(x0 + pw - inX).toFixed(1)},${py(0).toFixed(1)}`} className="eng-panel-zero" />
              )}
              <path d={dd} className={`eng-panel-line${chosen ? ' on' : ''}`} />
              {tNow !== null && tNow >= xa && tNow <= xb && (
                <path d={`M${px(tNow).toFixed(1)},${top + inTop - 6} L${px(tNow).toFixed(1)},${(top + ph - inBottom + 4).toFixed(1)}`} className="eng-panel-cursor" />
              )}
              <text x={x0 + 10} y={top + 16} className="eng-panel-label">{panel.label}</text>
              <text x={x0 + pw - 10} y={top + ph - 8} className="eng-panel-axis" textAnchor="end">{panel.x}</text>
            </g>
          ), 2);
        });
      }

      nodes.sort((p, q) => p.layer - q.layer || p.z - q.z);

      const chosen = spec.notes.find((n) => n.of === (view.selected ?? ''));
      return {
        content: nodes.map((n) => n.node),
        left: `${spec.dimensionality}D · ${spec.coordinateSystem.charAt(0).toUpperCase()}${spec.coordinateSystem.slice(1)}${view.slice ? ` · cut at ${view.slice.axis} = ${Number(view.slice.at.toPrecision(3))}` : ''}`,
        // The name is in the header and the selection is its chip there; the
        // figure is left to the figure. (The conversation is told both apart:
        // its state carries the title and the selection by name.)
        right: '',
        note:
          (slice ? `${slice.note}. ` : '') +
          // THE REASON A THING IS NOT THERE REACHES THE PLATE, and until now it
          // did not: this concatenated only `.note`, so a selected object the
          // engine had refused to draw showed whatever note it happened to
          // carry — often nothing — while the refusal went only to the chat
          // channel on the line below. Somebody looking at the picture and
          // wondering where their object was had no way to find out from the
          // picture.
          (chosen?.problem ? `Not drawn: ${chosen.problem}. ` : chosen?.note ? `${chosen.note}. ` : '') +
          // …and how much of the model is absent, at all times rather than only
          // when something is selected. A picture showing four of eleven
          // objects looks exactly like a picture showing all four.
          (() => {
            // THE DENOMINATOR WAS EVERY NOTE, and most notes are for things that
            // were never marks: a coefficient, a solved value, a slope that is a
            // number, an error term. "2 of 12 objects are not on this picture"
            // read as ten drawn when none were. The count that means something is
            // how many were REFUSED, and separately how many are read rather than
            // looked at.
            const refused = spec.notes.filter((n) => n.problem);
            const drewNothing = spec.notes.filter(
              (n) => !n.problem && !spec.primitives.some((p) => p.of === n.of)
            );
            const bits: string[] = [];
            if (refused.length) {
              bits.push(
                `${refused.length} object${refused.length === 1 ? ' is' : 's are'} in the model and could not be drawn`
              );
            }
            if (drewNothing.length) {
              bits.push(`${drewNothing.length} ${drewNothing.length === 1 ? 'is a value' : 'are values'} rather than a shape, listed rather than drawn`);
            }
            return bits.length ? `${bits.join('; ')}. ` : '';
          })() +
          // WHAT STANDS IN, said on the picture itself and not only on the
          // selected object: placeholder coefficients, and ranges the engine
          // read from a name or assumed. A drawn shape must never read as a
          // drawn claim.
          (() => {
            const ph = model.params.filter((p) => p.assumed === 'value').map((p) => p.label);
            const read = inputs.filter((q) => q.from === 'name' || q.from === 'assumed');
            return (
              (ph.length ? `${ph.join(', ')} ${ph.length === 1 ? 'is a placeholder' : 'are placeholders'} — the shape is drawn, the numbers are not yet anybody's. ` : '') +
              (read.length
                ? `${read
                    .map((q) => (q.from === 'name' ? `${q.label} read as 0 or 1 from its name` : `${q.label} over an assumed ${q.min}–${q.max}`))
                    .join('; ')}. `
                : '')
            );
          })() +
          (spec.panels?.length
            ? `The ${spec.panels.length} panels below are the same run, not separate ones. `
            : '') +
          fidelityLine(spec),
        label: `${spec.title}: ${spec.primitives.length} drawn objects in ${spec.dimensionality} dimensions.`,
        live: Object.fromEntries(spec.notes.map((n) => [n.of, n.problem ? `not drawn: ${n.problem}` : n.note])),
      };
    },
    [spec, frame, slice, view.selected, view.slice, model, sync, panel, openv, select, inputs]
  );

  // ── WHAT THE HEADER SAYS UNDER THE NAME ────────────────────────────
  // How far the model got and what computed it, in the inspection's own words,
  // and its field first when it has one: "Mechanics · Dynamic · Numerically
  // computed". The reason after the dash is kept for the tooltip.
  const grade = useMemo(() => inspectModel(full).grade ?? '', [full]);
  const subtitle = [model.domain ? model.domain.charAt(0).toUpperCase() + model.domain.slice(1) : '', grade.split(' — ')[0]].filter(Boolean).join(' · ');
  // the views and the account read the model as the panel shows it
  const shownModel = useMemo(() => (pinnedView !== undefined ? { ...full, view: pinnedView ?? undefined } : full), [full, pinnedView]);

  // ── ONE FRAME: THE NAME, THE PICTURE, AND THE SIDE ──────────────────
  //
  // The picture, the ways of looking at it and the account of it used to be
  // stacked — the frame, then a strip under it with a sentence, a row of
  // views and a toggle — and a floating composer covered the strip. They are
  // the frame's own places now: the views in its header beside the name, the
  // controls, the values the model computes and its account in its side panel
  // (components/surfaces/Surface3D.tsx), so nothing about the model sits
  // anywhere the picture or the conversation can cover it.
  //
  // A WRAPPER STILL, AND IT HAS TO BE ONE. The hole this is mounted in
  // (.lg-viz-surface) is a ROW flex expecting a single child.
  return (
    <div className="eng-stack">
    <Surface3D
      title={model.title}
      subtitle={subtitle || undefined}
      // At most 32 characters, which is what sanitizeModelState accepts: a longer
      // id made the whole picture state unreadable to the chat, which then fell
      // back to describing the old scene and offered no edit verbs.
      surface={`m-${model.id}`.slice(0, 32)}
      entities={entities}
      model={model.domain ?? ''}
      assumptions={model.assumptions ?? []}
      equations={model.equations ?? []}
      // Not `compare`: the op is accepted and sets a flag nothing reads, so a
      // reply described a comparison that never appeared. Offered again when
      // something draws it.
      can={['slice', 'view', 'time']}
      // The selection is the model's; the frame mirrors it and reports clicks.
      selected={view.selected ?? model.selected ?? null}
      onSelect={select}
      time={hostTime}
      notes={notes}
      edits={edits}
      onOps={takeOps}
      onRead={onRead}
      ops={ops}
      groups={groups}
      layers={layers}
      initial={initialVals}
      initialCam={spec.dimensionality === 3 ? CAM3 : { yaw: 0, pitch: 0, dist: 3 }}
      distRange={[1.4, 14]}
      animated={!!model.time}
      // a flat figure is not turned or zoomed, so it is not offered the camera's tools
      turnable={spec.dimensionality === 3 && !panel}
      render={render}
      fill={fill}
      // THE UNDERSTAND LAYER, in the frame's own places. It adds no renderer
      // and knows no domain — it is the surface of lib/model/views.ts and
      // lib/model/inspect.ts. A panel pinned to one representation leaves it
      // out: that panel IS one of the views.
      headExtra={understand ? <ViewSwitch model={shownModel} onView={openView} /> : undefined}
      aside={understand ? <ModelAside model={shownModel} onSelect={select} onAsk={onAsk} /> : undefined}
    />
    </div>
  );
}

const SAYS: Record<string, string> = {
  'numerically-computed': 'computed by a numerical method — the shape is a result',
  simulated: 'stepped forward by this model’s own simulation',
  'model-derived': 'evaluated from the relationships this model states',
  'data-derived': 'read from the supplied data, not computed here',
  conceptual: 'drawn to make the idea legible, not computed',
};

/**
 * How real this picture is — and, where its parts differ, BOTH ends of that.
 *
 * The view's own label is the modest one, because a picture is only as
 * computed as its least computed part. Said alone, though, it undersells: an
 * integrated orbit beside a fixed centre would read as "drawn", which is as
 * wrong in the other direction. So when the parts disagree, the line says the
 * floor and then says what the rest of it is.
 */
function fidelityLine(spec: VisualizationSpec): string {
  // NOTHING DRAWN IS NOT "DRAWN TO MAKE THE IDEA LEGIBLE". An empty frame
  // captioned as a deliberate illustration is the most misleading sentence this
  // component can print: it reads as a choice somebody made rather than as a
  // computation that did not happen.
  if (!spec.primitives.length) {
    return 'Nothing is drawn here yet — the notes above say what each object is waiting for.';
  }
  const kinds = [...new Set(spec.notes.filter((n) => !n.problem).map((n) => n.fidelity))];
  const floor = SAYS[spec.fidelity] ?? SAYS.conceptual;
  const others = kinds.filter((k) => k !== spec.fidelity);
  const capital = floor.charAt(0).toUpperCase() + floor.slice(1);
  if (!others.length) return `${capital}.`;
  return `${capital} — and the rest is ${others.map((k) => SAYS[k] ?? k).join(', ')}.`;
}
