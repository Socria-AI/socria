// lib/model/compile.ts
//
// THE ENGINE. A model is data; this is what turns it into something drawable,
// and it is the only file that knows how to do so.
//
// WHY THIS CAN BE GENERAL AT ALL. A model's objects carry their mathematics as
// TEXT — 'x^2 - y^2', 'sigma*(y - x)' — and Logos already has an evaluator for
// that (lib/logos-math.ts compileExpr), built for the plot renderer and sound
// enough to be worth reusing rather than reinventing. So a surface is not a
// component: it is an object of kind `surface` whose definition compiles over
// (x, y, and this model's controls). A trajectory is an object whose `defs`
// are the right-hand sides of a system, integrated by the one integrator. Two
// domains that produce the same shape of object get the same picture without
// either of them being known here.
//
// FIDELITY IS ASSIGNED HERE, BY WHAT ACTUALLY HAPPENED. Not by what the model
// claims: a surface evaluated from an expression comes back `model-derived`, a
// trajectory that went through Runge–Kutta comes back `numerically-computed`,
// a mesh read off supplied numbers comes back `data-derived`, and an object
// with geometry and no definition stays `conceptual`. A model cannot talk its
// way up this ladder, which is the point — the label has to be earned by the
// code path, or it is decoration.
//
// WHAT IT REFUSES. An expression that will not compile produces no primitive
// and a note saying so. Half-understanding an expression and drawing the half
// is how a picture comes to be confidently wrong.

import { compileExpr } from '@/lib/logos-math';
import type { Range } from '@/lib/logos-viz3d';
import {
  contour,
  crossSection,
  dataSurface,
  integrate,
  levelSets,
  parametricSurface,
  scatter,
  surfaceMesh,
  trajectoryLine,
  vectorField,
  type Sampled,
} from './sample';
import { LIMITS, type P3, type Primitive } from './primitives';
import type { Fidelity, Model, ModelObject } from './schema';

/** What compiling one object produced, and what may be said about it. */
export interface Built {
  of: string;
  primitives: Primitive[];
  /** what the engine actually did — the string the object's `state` carries */
  note: string;
  /** earned, not claimed */
  fidelity: Fidelity;
  /** set when nothing could be drawn, and why */
  problem?: string;
  /** the z extent, where the object has one; used to fit the box */
  z?: Range | null;
}

/** The scope an expression is evaluated in: the controls, plus time. */
export function scopeOf(model: Model, extra?: Record<string, number>): Record<string, number> {
  const scope: Record<string, number> = {};
  for (const p of model.params) scope[p.id.toLowerCase()] = p.value;
  if (model.time) scope.t = model.time.t;
  for (const [k, v] of Object.entries(extra ?? {})) scope[k.toLowerCase()] = v;
  return scope;
}

/** The names an expression in this model may use, beyond its own variables. */
function names(model: Model, vars: string[]): string[] {
  return [...new Set([...vars, ...model.params.map((p) => p.id.toLowerCase()), 't'])];
}

/** The extent of a name: what the object says, else a control, else a default. */
function rangeOf(model: Model, o: ModelObject, name: string, fallback: [number, number]): Range {
  const own = o.over?.[name];
  if (own) return { min: own[0], max: own[1] };
  const p = model.params.find((q) => q.id.toLowerCase() === name.toLowerCase());
  if (p) return { min: p.min, max: p.max };
  return { min: fallback[0], max: fallback[1] };
}

const NOTHING = (o: ModelObject, why: string): Built => ({
  of: o.id,
  primitives: [],
  note: '',
  fidelity: o.fidelity ?? 'conceptual',
  problem: why,
});

/**
 * One object, compiled.
 *
 * The switch is over KINDS, not over domains, and every branch below would
 * serve any subject that produces that kind of thing. Adding a kind means one
 * branch here; adding a domain means none.
 */
export function buildObject(model: Model, o: ModelObject, opts?: { detail?: number }): Built {
  const detail = Math.max(4, Math.min(400, o.detail ?? opts?.detail ?? 48));
  const scope = scopeOf(model);
  const layer = o.layer;

  switch (o.kind) {
    // ── a surface: z = f(x, y), or r(u, v), or a grid of measurements ──
    case 'surface':
    case 'volume': {
      if (o.data) return fromData(model, o, layer);
      if (o.defs?.px && o.defs?.py && o.defs?.pz) {
        const ex = compileExpr(o.defs.px, names(model, ['u', 'v']));
        const ey = compileExpr(o.defs.py, names(model, ['u', 'v']));
        const ez = compileExpr(o.defs.pz, names(model, ['u', 'v']));
        if (!ex || !ey || !ez) return NOTHING(o, 'one of the parametric components would not compile');
        const ur = rangeOf(model, o, 'u', [0, Math.PI * 2]);
        const vr = rangeOf(model, o, 'v', [0, Math.PI * 2]);
        const out = parametricSurface(
          o.id,
          (u, v) => ({
            x: ex.eval({ ...scope, u, v }),
            y: ey.eval({ ...scope, u, v }),
            z: ez.eval({ ...scope, u, v }),
          }),
          ur,
          vr,
          detail,
          { layer, tone: 'accent' }
        );
        return { of: o.id, primitives: [out.value], note: out.note, fidelity: 'model-derived' };
      }
      const def = o.definition;
      if (!def) return NOTHING(o, 'a surface needs a definition, parametric components or data');
      const e = compileExpr(def, names(model, ['x', 'y']));
      if (!e) return NOTHING(o, `“${def}” would not compile`);
      const xr = rangeOf(model, o, 'x', [-3, 3]);
      const yr = rangeOf(model, o, 'y', [-3, 3]);
      const out = surfaceMesh(o.id, (x, y) => e.eval({ ...scope, x, y }), xr, yr, detail, {
        layer,
        tone: 'accent',
      });
      return { of: o.id, primitives: [out.value], note: out.note, fidelity: 'model-derived', z: out.z };
    }

    // ── a curve: y = f(x), or r(t) ────────────────────────────────
    case 'curve':
    case 'line':
    case 'ray': {
      const xr = rangeOf(model, o, 'x', [-3, 3]);
      if (o.defs?.px && o.defs?.py) {
        const ex = compileExpr(o.defs.px, names(model, ['s']));
        const ey = compileExpr(o.defs.py, names(model, ['s']));
        const ez = o.defs.pz ? compileExpr(o.defs.pz, names(model, ['s'])) : null;
        if (!ex || !ey) return NOTHING(o, 'the parametric components would not compile');
        const sr = rangeOf(model, o, 's', [0, 1]);
        const n = Math.min(LIMITS.runPoints, detail * 8);
        const at: P3[] = [];
        for (let i = 0; i <= n; i++) {
          const s = sr.min + ((sr.max - sr.min) * i) / n;
          const p = {
            x: ex.eval({ ...scope, s }),
            y: ey.eval({ ...scope, s }),
            z: ez ? ez.eval({ ...scope, s }) : 0,
          };
          if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) at.push(p);
        }
        return {
          of: o.id,
          primitives: [{ p: 'polyline', of: o.id, at, layer, tone: 'primary' }],
          note: `${at.length} samples of the parameter`,
          fidelity: 'model-derived',
        };
      }
      const def = o.definition;
      if (!def) return NOTHING(o, 'a curve needs a definition');
      const e = compileExpr(def, names(model, ['x']));
      if (!e) return NOTHING(o, `“${def}” would not compile`);
      const n = Math.min(LIMITS.runPoints, detail * 8);
      const at: P3[] = [];
      for (let i = 0; i <= n; i++) {
        const x = xr.min + ((xr.max - xr.min) * i) / n;
        const y = e.eval({ ...scope, x });
        if (Number.isFinite(y)) at.push({ x, y, z: 0 });
      }
      return {
        of: o.id,
        primitives: [{ p: 'polyline', of: o.id, at, layer, tone: 'primary' }],
        note: `${at.length} samples over x`,
        fidelity: 'model-derived',
      };
    }

    // ── a field: arrows from component expressions ─────────────────
    case 'field': {
      const fx = o.defs?.fx;
      const fy = o.defs?.fy;
      if (!fx || !fy) return NOTHING(o, 'a field needs at least fx and fy');
      const has3 = !!o.defs?.fz;
      const vars = has3 ? ['x', 'y', 'z'] : ['x', 'y'];
      const ex = compileExpr(fx, names(model, vars));
      const ey = compileExpr(fy, names(model, vars));
      const ez = has3 ? compileExpr(o.defs!.fz!, names(model, vars)) : null;
      if (!ex || !ey || (has3 && !ez)) return NOTHING(o, 'a component would not compile');
      const xr = rangeOf(model, o, 'x', [-3, 3]);
      const yr = rangeOf(model, o, 'y', [-3, 3]);
      const zr = has3 ? rangeOf(model, o, 'z', [-3, 3]) : undefined;
      const out = vectorField(
        o.id,
        has3
          ? (x: number, y: number, z: number) => ({
              x: ex.eval({ ...scope, x, y, z }),
              y: ey.eval({ ...scope, x, y, z }),
              z: ez!.eval({ ...scope, x, y, z }),
            })
          : (x: number, y: number) => ({ x: ex.eval({ ...scope, x, y }), y: ey.eval({ ...scope, x, y }) }),
        { x: xr, y: yr, ...(zr ? { z: zr } : {}) },
        Math.max(4, Math.min(24, Math.round(detail / 4))),
        { layer, tone: 'muted' }
      );
      return { of: o.id, primitives: [out.value], note: out.note, fidelity: 'model-derived' };
    }

    // ── a trajectory: a system integrated forward ──────────────────
    //
    // FOUR STATE COMPONENTS, AND A STATED MAP FROM STATE TO PLACE. Those two
    // together are what make this one branch cover a chaotic attractor, a
    // double pendulum, a two-body orbit and a light ray past a black hole.
    //
    // The state is (x, y, z, w) and the equations are dx…dw, which is enough
    // for every second-order system worth drawing in a figure. The map is the
    // part that matters: a pendulum's state is two angles, and an angle is not
    // a position — so the model says where the bob IS
    // (`px: 'sin(x) + sin(z)'`), in its own words, and the engine evaluates
    // that per step. Without it the engine would have to know what a pendulum
    // is, which is the thing this whole design refuses to do.
    case 'trajectory': {
      const keys = ['dx', 'dy', 'dz', 'dw'] as const;
      const ds = keys.map((k) => o.defs?.[k]).filter(Boolean) as string[];
      if (ds.length < 2) return NOTHING(o, 'a trajectory needs at least dx and dy');
      const vars = ['x', 'y', 'z', 'w'];
      const fns = ds.map((d) => compileExpr(d, names(model, vars)));
      if (fns.some((f) => !f)) return NOTHING(o, 'a right-hand side would not compile');

      // WHERE IT STARTS, and the three ways a model may say so. An initial
      // condition that could only be a literal would make "start it at 1/b"
      // impossible to state — and a trajectory whose start does not move with
      // the controls is a trajectory nobody can experiment with. So an
      // expression wins, then a fixed extent, then a control of that name.
      const start = ['x0', 'y0', 'z0', 'w0'].map((k) => {
        const expr = o.defs?.[k];
        if (expr) {
          const e = compileExpr(expr, names(model, vars));
          const v = e ? e.eval(scope) : NaN;
          if (Number.isFinite(v)) return v;
        }
        const fromOver = o.over?.[k];
        if (fromOver) return fromOver[0];
        const p = model.params.find((q) => q.id.toLowerCase() === k);
        return p ? p.value : 1;
      });
      const y0 = start.slice(0, ds.length);
      const dt = typeof o.meta?.dt === 'number' ? (o.meta.dt as number) : 0.01;
      const steps = Math.min(200_000, typeof o.meta?.steps === 'number' ? (o.meta.steps as number) : 3000);
      const stateOf = (y: readonly number[], t: number) => ({
        ...scope,
        x: y[0] ?? 0,
        y: y[1] ?? 0,
        z: y[2] ?? 0,
        w: y[3] ?? 0,
        t,
      });
      // WHERE IT ENDS. `stop` is an expression in the same state, and the
      // convention is the one an inequality already has: integration stops
      // when it becomes positive. A ray that crossed a horizon and a body
      // that escaped have both ended, and integrating past the end produces
      // numbers that look like a result and are not one.
      const stopExpr = o.defs?.stop ? compileExpr(o.defs.stop, names(model, [...vars, 't'])) : null;
      const run = integrate(
        (t, y) => fns.map((f) => f!.eval(stateOf(y, t))),
        y0,
        {
          dt,
          steps,
          ...(stopExpr ? { until: (t, y) => stopExpr.eval(stateOf(y, t)) > 0 } : {}),
        }
      );

      // Where the state IS, if the model says. Compiled once, evaluated per
      // step, and falling back to "the first three components are the place"
      // — which is true of an attractor and of nothing else, so a model that
      // means something different has to say so.
      const px = o.defs?.px ? compileExpr(o.defs.px, names(model, [...vars, 't'])) : null;
      const py = o.defs?.py ? compileExpr(o.defs.py, names(model, [...vars, 't'])) : null;
      const pz = o.defs?.pz ? compileExpr(o.defs.pz, names(model, [...vars, 't'])) : null;
      const mapped = !!(px && py);
      const place = mapped
        ? (y: readonly number[], t: number) => {
            const sc = stateOf(y, t);
            return { x: px!.eval(sc), y: py!.eval(sc), z: pz ? pz.eval(sc) : 0 };
          }
        : (y: readonly number[]) => ({ x: y[0] ?? 0, y: y[1] ?? 0, z: y[2] ?? 0 });

      const line = trajectoryLine(o.id, run.value, place, { layer, tone: 'primary', width: 1.4 });
      const lastState = run.value.y[run.value.y.length - 1] ?? [];
      const head = place(lastState, run.value.t[run.value.t.length - 1] ?? 0);
      return {
        of: o.id,
        primitives: [
          line.value,
          { p: 'points', of: o.id, at: [head], r: 2.6, layer, tone: 'tension' },
        ],
        // THE ONE PLACE THIS LABEL IS EARNED: a real integrator ran.
        fidelity: 'numerically-computed',
        note:
          `${run.note}; ${line.note}` +
          (mapped ? '; drawn through the position map this model states' : '; drawn as the first components of the state'),
      };
    }

    // ── points: particles, observations, nodes ─────────────────────
    case 'point':
    case 'particle':
    case 'node':
    case 'dataset':
    case 'measurement': {
      if (o.data) return fromData(model, o, layer);
      if (typeof o.value === 'number') {
        return {
          of: o.id,
          primitives: [{ p: 'points', of: o.id, at: [{ x: o.value, y: 0, z: 0 }], r: 3, layer, tone: 'primary' }],
          note: 'a single value',
          fidelity: o.fidelity ?? 'conceptual',
        };
      }
      return NOTHING(o, 'nothing to draw: no data block and no value');
    }

    // ── a vector: one arrow, from its components ───────────────────
    case 'vector': {
      const at = {
        x: o.over?.x?.[0] ?? 0,
        y: o.over?.y?.[0] ?? 0,
        z: o.over?.z?.[0] ?? 0,
      };
      const comp = ['fx', 'fy', 'fz'].map((k) => {
        const d = o.defs?.[k];
        if (!d) return 0;
        const e = compileExpr(d, names(model, ['x', 'y', 'z']));
        return e ? e.eval({ ...scope, ...at }) : NaN;
      });
      if (comp.every((c) => c === 0) || comp.some((c) => !Number.isFinite(c))) {
        return NOTHING(o, 'the components would not evaluate');
      }
      return {
        of: o.id,
        primitives: [
          { p: 'vectors', of: o.id, at: [at], dir: [{ x: comp[0], y: comp[1], z: comp[2] }], scale: 1, layer, tone: 'tension' },
        ],
        note: `(${comp.map((c) => c.toPrecision(3)).join(', ')})`,
        fidelity: 'model-derived',
      };
    }

    // ── things that are said rather than drawn ─────────────────────
    default:
      return { of: o.id, primitives: [], note: '', fidelity: o.fidelity ?? 'conceptual' };
  }
}

/** A data block, as whichever primitive its shape calls for. */
function fromData(model: Model, o: ModelObject, layer?: string): Built {
  const block = o.data ? model.data?.[o.data] : undefined;
  if (!block) return NOTHING(o, `no data block called “${o.data}”`);
  if (block.xs && block.ys && block.z) {
    const out = dataSurface(o.id, block.xs, block.ys, block.z, { layer, tone: 'accent' });
    return { of: o.id, primitives: [out.value], note: out.note, fidelity: 'data-derived' };
  }
  if (block.points) {
    const out = scatter(o.id, block.points.map(([x, y, z]) => ({ x, y, z })), { layer, tone: 'accent', r: 2 });
    return { of: o.id, primitives: [out.value], note: out.note, fidelity: 'data-derived' };
  }
  if (block.t && block.v) {
    const n = Math.min(block.t.length, block.v.length);
    const at: P3[] = [];
    for (let i = 0; i < n; i++) at.push({ x: block.t[i], y: block.v[i], z: 0 });
    return {
      of: o.id,
      primitives: [{ p: 'polyline', of: o.id, at, layer, tone: 'primary' }],
      note: `${n} points of a series`,
      fidelity: 'data-derived',
    };
  }
  return NOTHING(o, 'the data block has no grid, points or series in it');
}

/**
 * A cross-section of an object, computed from its own definition.
 *
 * "Hold y constant" has to produce a curve that is exactly as true as the
 * surface it came from, so this recompiles the definition rather than reading
 * values off the mesh — a slice interpolated from the drawing would be an
 * artefact of the resolution, and would move when the resolution did.
 */
export function buildSlice(
  model: Model,
  o: ModelObject,
  axis: 'x' | 'y',
  at: number
): Sampled<Primitive[]> | null {
  if (o.kind !== 'surface' || !o.definition) return null;
  const e = compileExpr(o.definition, names(model, ['x', 'y']));
  if (!e) return null;
  const scope = scopeOf(model);
  const along = rangeOf(model, o, axis === 'x' ? 'y' : 'x', [-3, 3]);
  const out = crossSection(o.id, (x, y) => e.eval({ ...scope, x, y }), axis, at, along, 240, {
    tone: 'tension',
  });
  return { value: out.value, note: out.note };
}

/** Level sets of a surface object, as contours at its own scale. */
export function buildContours(model: Model, o: ModelObject, count = 8): Sampled<Primitive[]> | null {
  if (o.kind !== 'surface' || !o.definition) return null;
  const e = compileExpr(o.definition, names(model, ['x', 'y']));
  if (!e) return null;
  const scope = scopeOf(model);
  const xr = rangeOf(model, o, 'x', [-3, 3]);
  const yr = rangeOf(model, o, 'y', [-3, 3]);
  const grid = surfaceMesh(o.id, (x, y) => e.eval({ ...scope, x, y }), xr, yr, 64);
  const out = levelSets(o.id, grid.rows, count, { tone: 'muted', z: 'level' });
  return { value: out.value, note: out.note };
}

/** One contour at a named level — "show me where this equals 3". */
export function buildLevel(model: Model, o: ModelObject, level: number): Sampled<Primitive[]> | null {
  if (o.kind !== 'surface' || !o.definition) return null;
  const e = compileExpr(o.definition, names(model, ['x', 'y']));
  if (!e) return null;
  const scope = scopeOf(model);
  const xr = rangeOf(model, o, 'x', [-3, 3]);
  const yr = rangeOf(model, o, 'y', [-3, 3]);
  const grid = surfaceMesh(o.id, (x, y) => e.eval({ ...scope, x, y }), xr, yr, 64);
  const out = contour(o.id, grid.rows, level, { tone: 'tension', z: 'level' });
  return { value: out.value, note: out.note };
}

/**
 * The whole model, compiled.
 *
 * `only` is how a manipulation stays local: given the ids a change reached
 * (schema.ts affectedBy), the caller recompiles those and keeps the rest of
 * the primitives it already had. Nothing here regenerates a picture that did
 * not move.
 */
export function buildModel(model: Model, opts?: { only?: readonly string[]; detail?: number }): Built[] {
  const want = opts?.only ? new Set(opts.only) : null;
  const out: Built[] = [];
  let budget = LIMITS.primitives;
  for (const o of model.objects) {
    if (want && !want.has(o.id)) continue;
    const built = buildObject(model, o, { detail: opts?.detail });
    if (built.primitives.length > budget) {
      built.primitives = built.primitives.slice(0, Math.max(0, budget));
      built.note = `${built.note}; truncated to fit the view's budget`;
    }
    budget -= built.primitives.length;
    out.push(built);
    if (budget <= 0) break;
  }
  return out;
}
