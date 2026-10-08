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
import { Surface3D, snap, type RenderArgs, type SurfaceRender } from '@/components/surfaces/Surface3D';
import { boxLines, place, type Camera, type Frame3, type Pt2 } from '@/lib/logos-viz3d';
import { niceTicks, tickLabel } from '@/lib/model/units';
import { contour } from '@/lib/model/sample';
import type { P3, Primitive } from '@/lib/model/primitives';
import { buildSlice } from '@/lib/model/compile';
import { inputsAwaiting, inputsOf } from '@/lib/model/derive';
import { Understand } from './Understand';
import { panelMarks } from './panelMarks';
import { frameFor, panelFor, viewById } from '@/lib/model/viewdata';
import { unpack } from '@/lib/model/unpack';
import { buildSpec, type VisualizationSpec } from '@/lib/model/spec';
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

/** A frame that maps the spec's box onto the unit cube the projection uses. */
function frameOf(spec: VisualizationSpec): Frame3 {
  return {
    x: { min: spec.box.x[0], max: spec.box.x[1] },
    y: { min: spec.box.y[0], max: spec.box.y[1] },
    z: { min: spec.box.z[0], max: spec.box.z[1] },
  };
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
  const frame = useMemo(() => frameOf(spec), [spec]);

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
          right: set.right ?? '',
          note: `${openv?.label ?? 'This view'} — ${set.note}`,
          label: `${openv?.label ?? 'A view'}. ${set.label}`,
          live: {},
        };
      }

      const flat = spec.dimensionality === 2;
      const nodes: { z: number; node: React.ReactNode }[] = [];
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
      const panelH = panels.length ? Math.min(96, Math.max(54, a.H * 0.24)) : 0;
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
      const centre = { x: a.W / 2, y: a.H / 2 };
      const spread = Math.min(a.W, a.H) * 0.42 * zoom;
      const at = (p: P3): Pt2 & { depth: number } => {
        if (flat) return { x: sx(p.x), y: sy(p.y), depth: 0 };
        // place() returns the unit box projected into [-1, 1]; the view puts
        // that on the page, so zooming is one multiplication rather than a
        // second projection.
        const q = place(p, frame, cam);
        return { x: centre.x + q.x * spread, y: centre.y - q.y * spread, depth: q.depth };
      };

      const put = (depth: number, node: React.ReactNode) => nodes.push({ z: depth, node });

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
        const box = boxLines(frame, cam).map((line) =>
          line.map((q) => ({ x: centre.x + q.x * spread, y: centre.y - q.y * spread }))
        );
        put(1e9, (
          <g key="box" className="eng-box">
            {box.map((line, i) => (
              <path key={i} d={d2(line)} />
            ))}
          </g>
        ));
        // The edge each axis is read along, chosen on the page rather than in
        // the model: x and y along their lowest edge, z along the leftmost.
        const bx = spec.box;
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
        put(1e9 - 1, <g key="scale">{marks}</g>);
      } else {
        // the rules run along the box's own edges — the frame's edges, unless a plane is drawn to scale
        const left = sx(spec.box.x[0]);
        const right = sx(spec.box.x[1]);
        const base = sy(spec.box.y[0]);
        const top = sy(spec.box.y[1]);
        put(1e9, (
          <g key="axes" className="eng-box">
            <path d={`M${left.toFixed(1)},${base.toFixed(1)} L${right.toFixed(1)},${base.toFixed(1)}`} />
            <path d={`M${left.toFixed(1)},${top.toFixed(1)} L${left.toFixed(1)},${base.toFixed(1)}`} />
          </g>
        ));
        const xt = niceTicks(spec.box.x[0], spec.box.x[1], a.W > 420 ? 5 : 3);
        const yt = niceTicks(spec.box.y[0], spec.box.y[1], a.H > 260 ? 4 : 2);
        put(1e9 - 1, (
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
        ));
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
                put(-1, (
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
                put(-1e9, (
                  <g key={`cb${pi}`} className="eng-colorbar" style={{ pointerEvents: 'none' }}>
                    <defs>
                      <linearGradient id={`${frameId}-cbg-${pi}`} x1="0" x2="1" y1="0" y2="0">{stops}</linearGradient>
                    </defs>
                    <text x={xName} y={cy + 3} textAnchor="end" className="eng-axis">{nameOf(2) || 'value'}</text>
                    <text x={xLo} y={cy + 3} textAnchor="end" className="eng-tick-label">{loT}</text>
                    <rect x={barL} y={cy - 4} width={bw} height={8} fill={`url(#${frameId}-cbg-${pi})`} />
                    <text x={barR + 5} y={cy + 3} textAnchor="start" className="eng-tick-label">{hiT}</text>
                  </g>
                ));
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
            // In space: a wireframe, both families, broken at holes so a line
            // is never drawn across something the function does not contain.
            const paths: string[] = [];
            const runs = (pts: (P3 | null)[]) => {
              let run: (Pt2 & { depth: number })[] = [];
              for (const p of pts) {
                if (!p) {
                  if (run.length > 1) paths.push(d2(run));
                  run = [];
                  continue;
                }
                run.push(at(p));
              }
              if (run.length > 1) paths.push(d2(run));
            };
            for (const row of prim.rows) runs(row);
            const cols = prim.rows[0]?.length ?? 0;
            for (let i = 0; i < cols; i++) runs(prim.rows.map((r) => r[i]));
            const mid = prim.rows[Math.floor(prim.rows.length / 2)]?.[Math.floor(cols / 2)];
            // A WIREFRAME IS ALMOST UNCLICKABLE, and selection is how "what
            // is this?" gets an antecedent. A stroke-only path is only hit
            // ON the stroke, so each line is drawn twice: once at its own
            // weight, and once transparent and wide, which is the hit area.
            // The visible copy takes no pointer events, so the two never
            // fight over a click.
            put(mid ? at(mid).depth : 0, (
              <g key={`m${pi}`} data-obj={prim.of} opacity={dim ? 0.3 : 1}>
                <g className="eng-hit">
                  {paths.map((dd, i) => (
                    <path key={i} d={dd} />
                  ))}
                </g>
                <g style={{ pointerEvents: 'none' }}>
                  {paths.map((dd, i) => (
                    <path key={i} d={dd} fill="none" stroke={stroke} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              </g>
            ));
            break;
          }

          case 'polyline': {
            const pts = prim.at.map(at);
            if (pts.length < 2) break;
            const depth = pts.reduce((s, p) => s + p.depth, 0) / pts.length;
            const dd = d2(pts);
            put(depth, (
              <g key={`l${pi}`} data-obj={prim.of}>
                <path className="eng-hit" d={dd} />
                <path
                  d={dd}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={prim.width ?? 1.6}
                  strokeDasharray={prim.dashed ? '4 3' : undefined}
                  opacity={dim ? 0.3 : (prim.alpha ?? 1)}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            ));
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
            put(-1e9, (
              <text key={`t${pi}`} data-obj={prim.of} className="sfx-l" x={snap(q.x)} y={snap(q.y)} textAnchor={prim.anchor ?? 'middle'}>
                {prim.text}
              </text>
            ));
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
          put(-1e8, (
            <path
              key={`s${pts.length}${pts[0].x}`}
              data-obj={slice.of}
              d={d2(pts)}
              fill="none"
              stroke={TONE.tension}
              strokeWidth={2.2}
              vectorEffect="non-scaling-stroke"
            />
          ));
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
          const px = (v: number) => x0 + ((v - xa) / Math.max(1e-9, xb - xa)) * pw;
          const py = (v: number) => top + ph - ((v - ya) / spanY) * ph;
          const dd = panel.at
            .map((q, k) => `${k ? 'L' : 'M'}${px(q.x).toFixed(1)},${py(q.y).toFixed(1)}`)
            .join(' ');
          const tNow = spec.time?.t ?? null;
          const chosen = view.selected === panel.of;
          put(-1e9, (
            <g key={`panel${panel.id}`} data-obj={panel.of} className="eng-panel">
              <rect x={x0} y={top} width={pw} height={ph} className="eng-panel-plate" />
              {/* zero, where the series crosses it — a displacement's sign is the
                  thing a reader is looking for */}
              {ya < 0 && yb > 0 && (
                <path d={`M${x0},${py(0).toFixed(1)} L${(x0 + pw).toFixed(1)},${py(0).toFixed(1)}`} className="eng-panel-zero" />
              )}
              <path d={dd} className={`eng-panel-line${chosen ? ' on' : ''}`} />
              {tNow !== null && tNow >= xa && tNow <= xb && (
                <path d={`M${px(tNow).toFixed(1)},${top} L${px(tNow).toFixed(1)},${(top + ph).toFixed(1)}`} className="eng-panel-cursor" />
              )}
              <text x={x0 + 4} y={top + 11} className="eng-panel-label">{panel.label}</text>
              <text x={x0 + pw - 4} y={top + ph - 4} className="eng-panel-axis" textAnchor="end">{panel.x}</text>
            </g>
          ));
        });
      }

      nodes.sort((p, q) => q.z - p.z);

      const chosen = spec.notes.find((n) => n.of === (view.selected ?? ''));
      const selectedLabel = view.selected ? objectOf(model, view.selected)?.label : null;
      return {
        content: nodes.map((n) => n.node),
        left: `${spec.dimensionality}D · ${spec.coordinateSystem}${view.slice ? ` · cut at ${view.slice.axis} = ${Number(view.slice.at.toPrecision(3))}` : ''}`,
        right: selectedLabel ? `selected: ${selectedLabel}` : spec.title,
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
              bits.push(`${drewNothing.length} are read rather than looked at`);
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

  // ── THE PICTURE AND THE UNDERSTAND LAYER, STACKED ──────────────────
  //
  // A WRAPPER, AND IT HAD TO BE ONE. The hole this is mounted in
  // (.lg-viz-surface) is a ROW flex expecting a single child, so returning the
  // surface and the panel as siblings put them side by side: the panel took its
  // content width, the surface was squeezed to nothing, and the 3D view
  // disappeared. Reported, and correctly — the picture is the thing.
  //
  // So they stack, the surface takes the room, and the panel is a strip at the
  // bottom that only opens when somebody opens it.
  return (
    <div className="eng-stack">
    <Surface3D
      title={model.title}
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
      initialCam={spec.dimensionality === 3 ? { yaw: 0.6, pitch: 0.5, dist: 3.4 } : { yaw: 0, pitch: 0, dist: 3 }}
      distRange={[1.4, 14]}
      animated={!!model.time}
      render={render}
      fill={fill}
    />
    {/* THE UNDERSTAND LAYER, beneath the picture rather than inside it.
        The picture is one view of the model; so is this. It adds no renderer and
        knows no domain — it is the surface of lib/model/views.ts and
        lib/model/inspect.ts, and its whole job is to put what the model already
        knows within reach. Closed by default: the figure is what somebody came
        to look at. */}
    {understand && <Understand model={pinnedView !== undefined ? { ...full, view: pinnedView ?? undefined } : full} onSelect={select} onView={openView} onAsk={onAsk} />}
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
