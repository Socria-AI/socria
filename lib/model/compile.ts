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
import { runFor, seriesOf, stateAt } from './system';
import { estimate } from './estimate';
import { restOf, statesOf } from './mechanism';
import { unpack } from './unpack';

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
      // THE ROUTER AND THE COMPILER HAD TO AGREE, AND DID NOT. `SAMPLING.requires`
      // (solve.ts) accepts EITHER `definition` or a `defs.z`, so a surface
      // declared the second way routed `runnable` and graded the model
      // `computational` — and this line then read only `definition`, refused,
      // and drew nothing. A model that claims to compute and produces no marks
      // is the worst of both answers. Both spellings are read here, which is
      // what the router already promised.
      const def = o.definition ?? o.defs?.z;
      if (!def) return NOTHING(o, 'a surface needs a definition (z = …), parametric components or data');
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
      // THE SAME SPELLINGS THE ROUTER ACCEPTS. SAMPLING.requires takes
      // `definition` OR a `defs` entry, so a curve written either way routes
      // runnable; this read only the first, so the second routed `runnable`
      // and then refused to draw. `f` is the curve's own name for its
      // expression and `z` is what a response surface collapses to when there
      // is one regressor rather than two.
      const def = o.definition ?? o.defs?.f ?? o.defs?.z;
      if (!def) return NOTHING(o, 'a curve needs a definition (y = …), parametric components or data');
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

    // ── a system of differential equations, integrated ─────────────
    //
    // ANY NUMBER OF NAMED STATES, which is the whole point of system.ts. What is
    // DRAWN is a choice the model makes: a position map (px, py, pz) if it has
    // one, otherwise the first two or three states against each other — the phase
    // portrait, which is where a dynamical system's shape actually lives. Either
    // way the curve is the integrator's output, not a sketch of it.
    case 'system': {
      if (!o.system) return NOTHING(o, 'a system object with no system declared');
      const got = runFor(model, o);
      if (!got.ok) {
        return NOTHING(
          o,
          `not computed: ${got.missing.map((m) => m.what).join(', ')} — supplying ${
            got.missing.length === 1 ? 'it' : 'them'
          } would let this run`
        );
      }
      const run = got.run;
      const known = [...Object.keys(scope), ...run.names, 't'];
      const mapX = o.defs?.px ? compileExpr(o.defs.px, known) : null;
      const mapY = o.defs?.py ? compileExpr(o.defs.py, known) : null;
      const mapZ = o.defs?.pz ? compileExpr(o.defs.pz, known) : null;
      const mapped = !!(mapX && mapY);
      const at = (i: number): P3 => {
        const sc: Record<string, number> = { ...scope, t: run.t[i] };
        // Both spellings, because the expression grammar is case-insensitive —
        // see the note on the scope in system.ts.
        run.names.forEach((n, k) => {
          sc[n] = run.y[i][k];
          sc[n.toLowerCase()] = run.y[i][k];
        });
        if (mapped) return { x: mapX!.eval(sc), y: mapY!.eval(sc), z: mapZ ? mapZ.eval(sc) : 0 };
        return { x: run.y[i][0] ?? 0, y: run.y[i][1] ?? 0, z: run.y[i][2] ?? 0 };
      };
      const stride = Math.max(1, Math.ceil(run.t.length / LIMITS.runPoints));
      const pts: P3[] = [];
      for (let i = 0; i < run.t.length; i += stride) pts.push(at(i));
      const head = at(run.t.length - 1);
      const note =
        `${run.note}; ${run.names.length} states` +
        (mapped ? ', drawn through the position map this model states' : ', drawn as the first components of the state') +
        (run.stopped ? `; stopped at the ${run.stopped}` : '');
      return {
        of: o.id,
        primitives: [
          { p: 'polyline', of: o.id, at: pts, layer, tone: 'primary', width: 1.4 },
          { p: 'points', of: o.id, at: [head], r: 2.6, layer, tone: 'tension' },
        ],
        fidelity: 'numerically-computed',
        note,
      };
    }

    // ── the parts of a mechanism, placed by the computed state ─────
    //
    // A body is drawn where the integration says it is at this instant: its rest
    // position plus its computed displacement. Nothing here moves by a formula
    // that resembles the motion, which is the difference between an animation of
    // a mechanism and a mechanism.
    case 'body':
    case 'spring':
    case 'damper':
    case 'force': {
      // ── AN OBJECT THAT SAYS WHICH STATES HOLD ITS POSITION ─────────
      //
      // GENERAL, AND DELIBERATELY NOT ABOUT GRAVITY. An object may name the
      // states carrying its own x and y (`meta.sx`, `meta.sy`) and the system
      // those states belong to (`meta.of`). Anything that can say that is
      // drawn where the integration puts it — a gravitating body today, and a
      // particle, an agent or a node on a moving network with no change here.
      //
      // WHY IT EXISTS. The branch below resolves a part through `meta.mech`
      // and a one-dimensional `x_<part>` state, which is the mechanism
      // assembler's own convention. Gravitating bodies are four-state and
      // planar, so every one of them fell through to "a mechanism part whose
      // mechanism is not in this model" — a model that routed, integrated and
      // graded `dynamic` while drawing absolutely nothing. The fix is not a
      // gravity case; it is letting an object state where it is.
      const holder = typeof o.meta?.of === 'string' ? o.meta.of : null;
      const sx = typeof o.meta?.sx === 'string' ? o.meta.sx : null;
      const sy = typeof o.meta?.sy === 'string' ? o.meta.sy : null;
      if (holder && sx && sy) {
        const owner = model.objects.find((x) => x.id === holder);
        if (!owner?.system) return NOTHING(o, `the system holding ${o.label}'s position is not in this model`);
        const run = runFor(model, owner);
        if (!run.ok) return NOTHING(o, `not computed: ${run.missing.map((m) => m.what).join(', ')}`);
        const at = stateAt(run.run, scope.t ?? 0);
        const x = at[sx];
        const y = at[sy];
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return NOTHING(o, `${o.label}'s position did not come out finite at t = ${(scope.t ?? 0).toFixed(2)}`);
        }
        // The path it has taken, from the same run — not a drawn ellipse. An
        // orbit here is the integration's own answer, which is the whole point
        // of computing it rather than illustrating it.
        // Read through the same accessor every other series uses, so the two
        // cannot disagree about what the run contains.
        const px = seriesOf(run.run, sx);
        const py = seriesOf(run.run, sy);
        const trail: P3[] = [];
        if (px && py) {
          const n = Math.min(px.v.length, py.v.length);
          for (let i = 0; i < n; i++) {
            if (Number.isFinite(px.v[i]) && Number.isFinite(py.v[i])) {
              trail.push({ x: px.v[i], y: py.v[i], z: 0 });
            }
          }
        }
        return {
          of: o.id,
          primitives: [
            ...(trail.length > 1
              ? [{ p: 'polyline' as const, of: o.id, at: trail, layer, tone: 'muted' as const, width: 1 }]
              : []),
            { p: 'points' as const, of: o.id, at: [{ x, y, z: 0 }], layer, tone: 'primary' as const, r: 4 },
          ],
          fidelity: 'numerically-computed',
          note: `where the integration puts it at t = ${(scope.t ?? 0).toFixed(2)}, with the path it has taken`,
        };
      }

      const parentId = typeof o.meta?.mech === 'string' ? o.meta.mech : '';
      const parent = parentId ? model.objects.find((x) => x.id === parentId) : null;
      if (!parent?.system) return NOTHING(o, 'a mechanism part whose mechanism is not in this model');
      const got = runFor(model, parent);
      if (!got.ok) {
        return NOTHING(o, `not computed: ${got.missing.map((m) => m.what).join(', ')}`);
      }
      const now = stateAt(got.run, scope.t ?? 0);
      const place = (part: string): number => {
        if (part === 'ground') return 0;
        const obj = model.objects.find(
          (x) => x.meta?.mech === parentId && x.meta?.part === part && x.kind === 'body'
        );
        const rest = obj ? restOf(obj) : 0;
        return rest + (now[statesOf(part).x] ?? 0);
      };

      if (o.kind === 'body') {
        const part = String(o.meta?.part ?? '');
        const x = place(part);
        // A square, because a body has extent and a dot does not read as one.
        const h = 0.34;
        const box: P3[] = [
          { x: x - h, y: -h, z: 0 },
          { x: x + h, y: -h, z: 0 },
          { x: x + h, y: h, z: 0 },
          { x: x - h, y: h, z: 0 },
        ];
        return {
          of: o.id,
          primitives: [
            { p: 'region', of: o.id, at: box, layer, tone: 'primary', alpha: 0.16 },
            { p: 'polyline', of: o.id, at: [...box, box[0]], layer, tone: 'primary', width: 1.4 },
          ],
          fidelity: 'numerically-computed',
          note: `placed at its rest position plus its computed displacement at t = ${(scope.t ?? 0).toFixed(2)}`,
        };
      }

      const from = place(String(o.meta?.from ?? 'ground'));
      const to = place(String(o.meta?.to ?? 'ground'));
      if (o.kind === 'spring') {
        // A zigzag whose LENGTH is the computed separation: it visibly compresses
        // and extends because the two ends are where the integration puts them.
        const coils = 7;
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        const span = hi - lo;
        const pts: P3[] = [{ x: lo, y: 0, z: 0 }];
        const inset = Math.min(0.3, span * 0.15);
        for (let i = 0; i <= coils; i++) {
          const f = i / coils;
          pts.push({ x: lo + inset + f * Math.max(0, span - 2 * inset), y: (i % 2 ? 0.22 : -0.22), z: 0 });
        }
        pts.push({ x: hi, y: 0, z: 0 });
        return {
          of: o.id,
          primitives: [{ p: 'polyline', of: o.id, at: pts, layer, tone: 'accent', width: 1.2 }],
          fidelity: 'numerically-computed',
          note: `drawn between the computed positions of its two ends; its extension is ${(to - from).toFixed(3)} at this instant`,
        };
      }
      if (o.kind === 'damper') {
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        const mid = (lo + hi) / 2;
        return {
          of: o.id,
          primitives: [
            { p: 'polyline', of: o.id, at: [{ x: lo, y: 0, z: 0 }, { x: mid - 0.12, y: 0, z: 0 }], layer, tone: 'muted', width: 1.2 },
            {
              p: 'polyline', of: o.id,
              at: [
                { x: mid - 0.12, y: -0.18, z: 0 },
                { x: mid + 0.12, y: -0.18, z: 0 },
                { x: mid + 0.12, y: 0.18, z: 0 },
                { x: mid - 0.12, y: 0.18, z: 0 },
                { x: mid - 0.12, y: -0.18, z: 0 },
              ],
              layer, tone: 'muted', width: 1.1,
            },
            { p: 'polyline', of: o.id, at: [{ x: mid + 0.12, y: 0, z: 0 }, { x: hi, y: 0, z: 0 }], layer, tone: 'muted', width: 1.2 },
          ],
          fidelity: 'numerically-computed',
          note: `drawn between the computed positions of its two ends; the rate across it is ${(
            (now[statesOf(String(o.meta?.to ?? '')).v] ?? 0) - (now[statesOf(String(o.meta?.from ?? '')).v] ?? 0)
          ).toFixed(3)} at this instant`,
        };
      }
      // A force: an arrow whose LENGTH is the computed value at this instant.
      const onPart = String(o.meta?.on ?? '');
      const x = place(onPart);
      const known2 = [...Object.keys(scope), ...got.run.names, 't'];
      const exprText = (parent.mechanism?.forces ?? []).find((q) => q.id === o.meta?.part)?.expr ?? '0';
      const fn = compileExpr(exprText, known2);
      const value = fn ? fn.eval({ ...scope, ...now }) : 0;
      return {
        of: o.id,
        primitives: [
          {
            p: 'vectors', of: o.id,
            at: [{ x, y: 0.5, z: 0 }],
            dir: [{ x: value, y: 0, z: 0 }],
            scale: 0.4,
            layer, tone: 'tension',
          },
        ],
        fidelity: 'numerically-computed',
        note: `the force evaluates to ${value.toFixed(3)} at t = ${(scope.t ?? 0).toFixed(2)}, and the arrow is drawn to that value`,
      };
    }

    // ── a fitted specification, drawn as what it actually is ───────
    //
    // ONE REGRESSOR gets the fitted line over the range of the data, because that
    // IS the estimate made visible. SEVERAL get a coefficient plot — each estimate
    // as a point with its interval — because a plane through a cloud in three
    // dimensions shows two of the regressors and hides the rest, and a
    // seven-regressor model has no honest surface at all. That is the
    // "3D must earn its existence" rule deciding a case where it does not.
    //
    // A specification with no method chosen draws NOTHING, and says why.
    case 'specification':
    case 'estimator': {
      const got = estimate(model, o);
      if (!got.ok) {
        if ('choice' in got) {
          return NOTHING(
            o,
            'no method has been chosen, so nothing is fitted — the alternatives and what each one assumes are offered instead'
          );
        }
        return NOTHING(o, `not fitted: ${got.missing.map((m) => m.what).join(', ')}`);
      }
      const fit = got.fit;
      const decl = o.estimation!;
      const block = decl.data ? model.data?.[decl.data] : undefined;
      const cols = block?.columns ?? {};

      if (decl.x.length === 1 && cols[decl.x[0]] && fit.terms.length === 2) {
        const xs = cols[decl.x[0]];
        const lo = Math.min(...xs);
        const hi = Math.max(...xs);
        const b0 = fit.terms[0].value;
        const b1 = fit.terms[1].value;
        const at: P3[] = [
          { x: lo, y: b0 + b1 * lo, z: 0 },
          { x: hi, y: b0 + b1 * hi, z: 0 },
        ];
        return {
          of: o.id,
          primitives: [{ p: 'polyline', of: o.id, at, layer, tone: 'primary', width: 1.6 }],
          fidelity: 'data-derived',
          note: `the fitted line from ${fit.says}: intercept ${b0.toFixed(4)}, slope ${b1.toFixed(4)}`,
        };
      }

      // A coefficient plot: value against term, with the interval where the
      // degrees of freedom support one. Intervals that do not exist are simply
      // not drawn, which is the honest form of not having them.
      const pts: P3[] = [];
      const bars: Primitive[] = [];
      fit.terms.forEach((t, i) => {
        const y = fit.terms.length - i;
        pts.push({ x: t.value, y, z: 0 });
        if (t.ci95) {
          bars.push({
            p: 'polyline', of: o.id,
            at: [{ x: t.ci95[0], y, z: 0 }, { x: t.ci95[1], y, z: 0 }],
            layer, tone: 'muted', width: 1.1,
          });
        }
      });
      return {
        of: o.id,
        primitives: [
          ...bars,
          { p: 'points', of: o.id, at: pts, r: 3, layer, tone: 'primary' },
          {
            p: 'polyline', of: o.id,
            at: [{ x: 0, y: 0.4, z: 0 }, { x: 0, y: fit.terms.length + 0.6, z: 0 }],
            layer, tone: 'ghost', width: 0.8, dashed: true,
          },
        ],
        fidelity: 'data-derived',
        note:
          `${fit.terms.length} estimates from ${fit.says}, as a coefficient plot rather than a surface — ` +
          `a plane through ${decl.x.length} regressors would show two of them and hide the rest` +
          (fit.terms.some((t) => t.ci95) ? '; the bars are 95% intervals on the normal approximation' : '; no intervals, because there are too few degrees of freedom for one'),
      };
    }

    // ── points: particles, observations, nodes ─────────────────────
    case 'point':
    case 'particle':
    case 'node':
    case 'dataset':
    case 'measurement':
    // `series` and `distribution` ARE HERE BECAUSE THE ROUTER SAYS THEY ARE.
    // DATA.handles (solve.ts) lists all four, so both routed `runnable` and
    // graded a model `computational` — and then fell through to the silent
    // default and drew nothing. The same disagreement the surface had: the
    // router promising what the compiler had no case for.
    case 'series':
    case 'distribution': {
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
    //
    // SILENCE IS NOT AN ANSWER, AND THIS BRANCH USED TO BE SILENT. It returned
    // an empty `Built` with no `note` and, crucially, no `problem` — so an
    // object of a kind no renderer handles simply was not there, and nothing
    // anywhere said why. Twenty-eight of the forty-eight kinds land here,
    // including `region`, `plane`, `boundary`, `mesh`, `series`, `graph`,
    // `distribution`, `objective` and `constraint`: a model could be built,
    // routed, graded and drawn with most of its contents invisible and no
    // account of their absence.
    //
    // A `problem` is what makes a gap discoverable — by the reader, by the
    // conversation (state.ts reads it) and by a test. Two cases, distinguished
    // because they need different things from different people:
    default: {
      // Some kinds are MEANT to be read rather than looked at. Saying those
      // "have no renderer" would report a gap that is not one — so each is
      // listed with what it is, and the note carries that rather than a shrug.
      const said = SAID_NOT_DRAWN.get(o.kind);
      if (said) {
        return {
          of: o.id,
          primitives: [],
          note: typeof o.value === 'number' ? `${said} — ${o.value}${o.units ? ` ${o.units}` : ''}` : said,
          fidelity: o.fidelity ?? 'conceptual',
        };
      }
      return NOTHING(
        o,
        `nothing in this engine draws ${/^[aeiou]/.test(o.kind) ? 'an' : 'a'} ${o.kind} yet — the object is in the model and can be inspected, and what is missing is a way to show it`
      );
    }
  }
}

/**
 * Kinds that are read rather than looked at, and what each one is.
 *
 * Small and explicit, so that everything NOT on it reports its absence. The
 * temptation is to grow this list whenever a kind is noisy; resist it — an
 * entry here is a promise that a reader wanting to SEE the thing is wrong to
 * want that, and that is true of very few kinds.
 *
 * The specification's parts are here on exactly that test. A coefficient is a
 * number somebody reads, an error term is a statement about what the model does
 * not explain, and a named variable appears on a fitted plot as an axis rather
 * than as a mark of its own. All three are inspectable, carry provenance, and
 * are what `add variable` and `remove` act on — they are not missing from the
 * picture, they were never marks.
 *
 * Axes and grids are the frame's, drawn by spec.ts rather than as objects.
 */
const SAID_NOT_DRAWN = new Map<ModelObject['kind'], string>([
  ['annotation', 'a note on the model'],
  ['assumption', 'something the model holds fixed'],
  ['source', 'where something came from'],
  ['axis', 'part of the frame; the view draws it'],
  ['grid', 'part of the frame; the view draws it'],
  ['variable', 'a named quantity in the specification; on a fitted plot it is an axis'],
  ['coefficient', 'a number in the fitted relationship'],
  ['residual', 'what the specification does not explain'],
]);

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

  // NAMED COLUMNS — a table, which is how data for a fitted model arrives.
  //
  // Which two columns are drawn is the MODEL's statement (`defs.x`, `defs.y`),
  // not a guess: a table of eight columns has twenty-eight possible scatters and
  // choosing one silently would be choosing what the figure is about. With two
  // columns and nothing said, there is only one pair, so that one is drawn — and
  // the note says which.
  const cols = block.columns;
  if (cols) {
    const names = Object.keys(cols);
    const xn = o.defs?.x && cols[o.defs.x] ? o.defs.x : names.length === 2 ? names[0] : null;
    const yn = o.defs?.y && cols[o.defs.y] ? o.defs.y : names.length === 2 ? names[1] : null;
    if (!xn || !yn) {
      return NOTHING(
        o,
        `the block has ${names.length} columns (${names.join(', ')}) and the model does not say which two to draw — name them as defs.x and defs.y`
      );
    }
    const n = Math.min(cols[xn].length, cols[yn].length, LIMITS.points);
    const at: P3[] = [];
    for (let i = 0; i < n; i++) at.push({ x: cols[xn][i], y: cols[yn][i], z: 0 });
    const asSeries = xn === 'time' || xn === 't' || o.kind === 'series';
    return {
      of: o.id,
      primitives: [
        asSeries
          ? { p: 'polyline', of: o.id, at, layer, tone: 'primary', width: 1.2 }
          : { p: 'points', of: o.id, at, r: 1.8, layer, tone: 'accent' },
      ],
      note: `${n} observations, ${yn} against ${xn}${asSeries ? ', in order' : ''}`,
      fidelity: 'data-derived',
    };
  }

  return NOTHING(o, 'the data block has no grid, points, series or columns in it');
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
export function buildModel(modelIn: Model, opts?: { only?: readonly string[]; detail?: number }): Built[] {
  // Mechanisms become objects before anything is drawn, so a body, a spring and a
  // damper are ordinary model objects by the time the compiler sees them.
  const model = unpack(modelIn);
  const want = opts?.only ? new Set(opts.only) : null;
  const out: Built[] = [];
  let budget = LIMITS.primitives;
  for (const o of model.objects) {
    if (want && !want.has(o.id)) continue;
    const built = buildObject(model, o, { detail: opts?.detail });
    if (built.primitives.length > budget) {
      built.primitives = built.primitives.slice(0, Math.max(0, budget));
      built.note = `${built.note}; truncated to fit the view's budget`;
      // A TRUNCATION IS A PROBLEM, not a note. It was only a note, so an object
      // showing half of itself looked exactly like an object showing all of
      // itself to everything downstream.
      built.problem = built.problem ?? "more detail than the view's primitive budget allows; what is drawn is part of it";
    }
    budget -= built.primitives.length;
    out.push(built);
    if (budget <= 0) break;
  }

  // …AND EVERYTHING THE BUDGET CUT OFF ENTIRELY. The loop `break`s when the
  // budget runs out, so every remaining object was dropped with no record at
  // all — a large model quietly showed a prefix of itself. Each one now says
  // so, which costs nothing (they carry no primitives) and is the difference
  // between "that is the whole model" and "that is as much as fitted".
  const drawn = new Set(out.map((b) => b.of));
  for (const o of model.objects) {
    if (want && !want.has(o.id)) continue;
    if (drawn.has(o.id)) continue;
    out.push(
      NOTHING(o, "the view's primitive budget ran out before this object; it is in the model and is not on the picture")
    );
  }
  return out;
}
