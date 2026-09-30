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
import { contour } from '@/lib/model/sample';
import type { P3, Primitive } from '@/lib/model/primitives';
import { buildSlice } from '@/lib/model/compile';
import { inputsAwaiting, inputsOf } from '@/lib/model/derive';
import { Understand } from './Understand';
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

export function ModelView({
  model: initial,
  edits,
  fill,
  onRead,
  ops,
  onModel,
  onAsk,
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
}) {
  // THE MODEL IS THE STATE. The frame holds the camera and the clock; this
  // holds the thing being looked at, so a control moved in the chrome and a
  // control moved from the conversation land in the same place.
  const [model, setModel] = useState<Model>(initial);
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
  }, [stamp, initial]);

  const spec = useMemo(
    () => buildSpec(model, { view: view.as ?? 'auto' }),
    [model, view.as]
  );
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
  const inputs = useMemo(() => inputsOf(model), [model]);
  // …and the ones that cannot be moved yet, shown rather than omitted. The thing
  // standing between this model and a picture was invisible in the one place a
  // person would look for it.
  const awaiting = useMemo(() => inputsAwaiting(model), [model]);

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
              step: (q.max - q.min) / 100,
              read: (v: number) => `${Number(v.toPrecision(4))}${q.units ? ` ${q.units}` : ''}`,
              help: `a free input: the relationship is evaluated over it, and moving this reads it at a different point rather than changing it`,
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
          read: (v: number) => `${Number(v.toPrecision(4))}${p.units ? ` ${p.units}` : ''}`,
          ...(p.means ? { help: p.means } : {}),
        })),
      },
    ],
    [model.params]
  );
  const layers = useMemo(
    () => (model.layers ?? []).map((l) => ({ id: l.id, label: l.label })),
    [model.layers]
  );
  const initialVals = useMemo(
    () => ({
      ...Object.fromEntries(initial.params.map((p) => [p.id, p.value])),
      ...Object.fromEntries(inputsOf(initial).map((q) => [`at:${q.id}`, q.at])),
    }),
    [initial]
  );

  const entities: VizEntity[] = useMemo(
    () => modelStateFrom(model, spec).entities,
    [model, spec]
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
  const sync = useCallback(
    (vals: Record<string, number>, t: number) => {
      let next = model;
      for (const p of model.params) {
        const v = vals[p.id];
        if (typeof v === 'number' && v !== p.value) next = setParam(next, p.id, v);
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
      if (model.time && t !== model.time.t) next = setTime(next, Math.min(model.time.max, t));
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

  const render = useCallback(
    (a: RenderArgs): SurfaceRender => {
      sync(a.vals, a.t);
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
      const sx = (x: number) =>
        pad + ((x - spec.box.x[0]) / (spec.box.x[1] - spec.box.x[0])) * (a.W - pad * 2);
      const sy = (y: number) =>
        a.H - pad - ((y - spec.box.y[0]) / (spec.box.y[1] - spec.box.y[0])) * (a.H - pad * 2);
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
      } else {
        put(1e9, (
          <g key="axes" className="eng-box">
            <path d={`M${pad},${a.H - pad} L${a.W - pad},${a.H - pad}`} />
            <path d={`M${pad},${pad} L${pad},${a.H - pad}`} />
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
      const panels = spec.panels ?? [];
      if (panels.length) {
        const gap = 10;
        const pw = (a.W - gap * (panels.length + 1)) / panels.length;
        const ph = Math.min(96, Math.max(54, a.H * 0.24));
        const top = a.H - ph - gap;
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
          (spec.panels?.length
            ? `The ${spec.panels.length} panels below are the same run, not separate ones. `
            : '') +
          fidelityLine(spec),
        label: `${spec.title}: ${spec.primitives.length} drawn objects in ${spec.dimensionality} dimensions.`,
        live: Object.fromEntries(spec.notes.map((n) => [n.of, n.problem ? `not drawn: ${n.problem}` : n.note])),
      };
    },
    [spec, frame, slice, view.selected, view.slice, model, sync]
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
      surface={`m-${model.id}`}
      entities={entities}
      model={model.domain ?? ''}
      assumptions={model.assumptions ?? []}
      equations={model.equations ?? []}
      can={['slice', 'view', 'time', 'compare']}
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
    <Understand model={model} onSelect={select} onAsk={onAsk} />
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
