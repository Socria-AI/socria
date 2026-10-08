// lib/model/iterate.ts
//
// A SYSTEM THAT STEPS RATHER THAN FLOWS — the `map` block, read, refused, run
// and looked at the ways a map is looked at.
//
// x_{n+1} = f(x_n) is the other half of dynamics: a population counted once a
// generation, compound interest, a discretized controller, the logistic map
// and the Hénon map. Its time is a count, and the pictures that are its own
// are the cobweb — the orbit walked between the graph and the diagonal — and
// the bifurcation diagram, where one parameter swept across its range shows a
// fixed point split into two, four, eight … and then into chaos.
//
// The numerics are lib/numeric/dynamics.ts, tested there against Feigenbaum's
// constants and the known Lyapunov exponents; this file reads a declaration
// into them. It also gives a flow of three or more states its Poincaré
// section, which is the map hidden inside a flow.
//
// REFUSING IS THE FEATURE, as everywhere in the engine: a state nobody
// started, a next value nobody gave, a parameter to sweep that is not one —
// each is named, and nothing is assumed.
//
// PURE.

import { compileExpr } from '@/lib/logos-math';
import { bifurcationMap, cobweb, describeFixedPoint, fixedPoints, lyapunovMap, periodOf, poincare, superstable, type DiscreteMap, type Flow } from '@/lib/numeric/dynamics';
import { scopeOf } from './compile';
import { namesIn } from './deps';
import type { P3, Primitive } from './primitives';
import { MODEL_CAPS, type Model, type ModelObject } from './schema';
import { readSystem, runFor, type Missing } from './system';

export const MAP_CAPS = {
  states: MODEL_CAPS.mapStates,
  steps: 20_000,
  /** steps when none are given — said */
  defaultSteps: 200,
  /** columns of a bifurcation diagram, steps settled in each before keeping, and points kept */
  columns: 400,
  transient: 400,
  keep: 96,
} as const;

const fmt = (v: number) => String(Number(v.toPrecision(4))).replace(/^-/, '−');

/** The controls without the clock. */
function paramsOf(model: Model): Record<string, number> {
  const s = scopeOf(model);
  delete s.t;
  return s;
}

const nextOf = (o: ModelObject, name: string): string | undefined => {
  const next = o.map?.next ?? {};
  const k = Object.keys(next).find((x) => x.toLowerCase() === name.toLowerCase());
  return k ? next[k] : undefined;
};

/** The parameter a bifurcation diagram sweeps: the one named, else the first `next` uses. */
export function sweepOf(model: Model, o: ModelObject): { id: string; label: string; range: [number, number]; units?: string } | null {
  const want = o.map?.sweep?.toLowerCase();
  const used = new Set(Object.values(o.map?.next ?? {}).flatMap((e) => namesIn(e)));
  const p = want ? model.params.find((q) => q.id.toLowerCase() === want) : model.params.find((q) => used.has(q.id.toLowerCase()));
  if (!p || !(p.max > p.min)) return null;
  return { id: p.id, label: p.label ?? p.id, range: [p.min, p.max], ...(p.units ? { units: p.units } : {}) };
}

/** Read a map, or say exactly what is missing. */
export function readMap(model: Model, o: ModelObject): { ok: true; names: string[] } | { ok: false; missing: Missing[] } {
  const decl = o.map;
  if (!decl || !Array.isArray(decl.states) || !decl.states.length) {
    return { ok: false, missing: [{ what: 'the states the map steps', unlocks: 'anything: a map of nothing has nothing to step' }] };
  }
  if (decl.states.length > MAP_CAPS.states) {
    return { ok: false, missing: [{ what: `a map of at most ${MAP_CAPS.states} states — this one has ${decl.states.length}`, unlocks: 'a run; stepping some of them would be stepping a different map' }] };
  }
  const names = decl.states.map((s) => s.name);
  const params = paramsOf(model);
  const known = [...Object.keys(params), ...names, 'n'];
  const missing: Missing[] = [];
  for (const s of decl.states) {
    const nx = nextOf(o, s.name);
    if (!nx) missing.push({ what: `${s.name} at the next step`, unlocks: `how ${s.means ?? s.name} moves on — without it this state cannot step` });
    else if (!compileExpr(nx, known)) missing.push({ what: `a readable next value for ${s.name}`, unlocks: 'a run; the one given does not compile in the states, n and the parameters' });
    if (s.init === undefined) missing.push({ what: `a starting value for ${s.name}`, unlocks: 'a run: where a map starts is not something to assume' });
    else if (typeof s.init === 'string') {
      const e = compileExpr(s.init, Object.keys(params));
      if (!e || !Number.isFinite(e.eval(params))) missing.push({ what: `a starting value for ${s.name}`, unlocks: 'a run; the one given is not a number from the parameters' });
    }
  }
  if (decl.sweep && !model.params.some((q) => q.id.toLowerCase() === decl.sweep!.toLowerCase())) {
    missing.push({ what: `a parameter called ${decl.sweep} to sweep`, unlocks: 'the bifurcation diagram: it sweeps one of the model’s controls across its range' });
  }
  return missing.length ? { ok: false, missing } : { ok: true, names };
}

/** The map as a function of the state, with any parameter overridden — for sweeping one. */
export function mapOf(model: Model, o: ModelObject, override?: Record<string, number>): { sys: DiscreteMap; init: number[]; clocked: boolean } | null {
  const read = readMap(model, o);
  if (!read.ok) return null;
  const names = read.names;
  const params = { ...paramsOf(model), ...(override ?? {}) };
  for (const [k, v] of Object.entries(override ?? {})) params[k.toLowerCase()] = v;
  const known = [...Object.keys(params), ...names, 'n'];
  const fns = names.map((n) => compileExpr(nextOf(o, n)!, known)!);
  const lower = names.map((n) => n.toLowerCase());
  const clocked = Object.values(o.map!.next).some((e) => namesIn(e).includes('n'));
  let step = 0;
  const g = (x: readonly number[]) => {
    const sc: Record<string, number> = { ...params, n: step };
    lower.forEach((n, i) => (sc[n] = x[i]));
    return fns.map((f) => f.eval(sc));
  };
  const init = o.map!.states.map((s) => (typeof s.init === 'number' ? s.init : compileExpr(s.init as string, Object.keys(params))!.eval(params)));
  return {
    sys: {
      dim: names.length,
      names,
      g: (x) => {
        const y = g(x);
        step++;
        return y;
      },
    },
    init,
    clocked,
  };
}

export interface MapRun {
  names: string[];
  /** x[k] is the state after k steps; x[0] is the start */
  x: number[][];
  /** the step at which it left the numbers, when it did */
  stopped: number | null;
  steps: number;
  note: string;
  chose: string[];
}

const RUNS = new Map<string, { ok: true; run: MapRun } | { ok: false; missing: Missing[] }>();
const LOOKS = new Map<string, unknown>();

function digest(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
const keyOf = (model: Model, o: ModelObject, extra = '') => {
  const p = paramsOf(model);
  return `${model.id}:${o.id}:${digest(JSON.stringify({ m: o.map, s: o.system, p: Object.keys(p).sort().map((k) => [k, p[k]]) }))}${extra}`;
};
function cached<T>(key: string, make: () => T): T {
  if (LOOKS.has(key)) return LOOKS.get(key) as T;
  const v = make();
  if (LOOKS.size > 48) LOOKS.clear();
  LOOKS.set(key, v);
  return v;
}

export function mapRunFor(model: Model, o: ModelObject): { ok: true; run: MapRun } | { ok: false; missing: Missing[] } {
  const key = keyOf(model, o);
  const held = RUNS.get(key);
  if (held) return held;
  const made = ((): { ok: true; run: MapRun } | { ok: false; missing: Missing[] } => {
    const read = readMap(model, o);
    if (!read.ok) return read;
    const m = mapOf(model, o)!;
    const chose: string[] = [];
    const steps = Math.min(MAP_CAPS.steps, o.map!.steps ?? MAP_CAPS.defaultSteps);
    if (o.map!.steps === undefined) chose.push(`${steps} steps, as none were given`);
    const x: number[][] = [m.init.slice()];
    let cur = m.init.slice();
    let stopped: number | null = null;
    for (let k = 1; k <= steps; k++) {
      cur = m.sys.g(cur);
      if (!cur.every(Number.isFinite)) {
        stopped = k;
        break;
      }
      x.push(cur);
    }
    return {
      ok: true,
      run: {
        names: read.names,
        x,
        stopped,
        steps,
        note: `${x.length - 1} steps of the map from its stated start${stopped !== null ? `; it left the numbers at step ${stopped} and stopped there` : ''}`,
        chose,
      },
    };
  })();
  if (RUNS.size > 48) RUNS.clear();
  RUNS.set(key, made);
  return made;
}

export function forgetMapRuns(): void {
  RUNS.clear();
  LOOKS.clear();
}

/** The main picture: a one-state map's iterates against n; a map of more, its first two states against each other. */
export function mapPrimitives(o: ModelObject, run: MapRun, layer?: string): { primitives: Primitive[]; note: string } {
  const one = run.names.length === 1;
  const pts: P3[] = one ? run.x.map((v, k) => ({ x: k, y: v[0], z: 0 })) : run.x.map((v) => ({ x: v[0], y: v[1], z: v[2] ?? 0 }));
  const prims: Primitive[] = one
    ? [
        { p: 'polyline', of: o.id, at: pts, layer, tone: 'muted', width: 0.8 },
        { p: 'points', of: o.id, at: pts, layer, tone: 'primary', r: 1.8 },
      ]
    : [{ p: 'points', of: o.id, at: pts.slice(Math.min(20, Math.floor(pts.length / 10))), layer, tone: 'primary', r: 1.2 }];
  return {
    primitives: prims,
    note: `${run.note}${one ? '' : `; drawn in ${run.names[0]} and ${run.names[1]}, the first few steps left out as it settles`}${run.chose.length ? `; ${run.chose.join('; ')}` : ''}`,
  };
}

export interface MapBehaviour {
  /** the period the orbit settles into; 0 when none repeats within 64 */
  period: number;
  lyapunov: number[] | null;
  fixed: { at: number[]; type: string; stable: boolean | null; multipliers: string }[];
  says: string;
}

/** What the map does: the period it settles into, how fast nearby starts separate, and its fixed points. */
export function mapBehaviour(model: Model, o: ModelObject): MapBehaviour | null {
  return cached(keyOf(model, o, ':behaviour'), () => {
    const got = mapRunFor(model, o);
    const m = mapOf(model, o);
    if (!got.ok || !m) return null;
    const run = got.run;
    const tail = run.x.slice(-Math.min(128, Math.floor(run.x.length / 2))).map((v) => v[0]);
    const period = run.stopped === null ? periodOf(tail) : 0;
    let lyapunov: number[] | null = null;
    if (!m.clocked && run.stopped === null) {
      const L = lyapunovMap(mapOf(model, o)!.sys, run.x[run.x.length - 1], { transient: 200, n: 4000 });
      if (L.exponents.every(Number.isFinite)) lyapunov = L.exponents;
    }
    // fixed points, looked for in the box the orbit visits, widened
    const fixed: MapBehaviour['fixed'] = [];
    if (!m.clocked) {
      const box = run.names.map((_, i) => {
        const v = run.x.map((x) => x[i]);
        const lo = Math.min(...v);
        const hi = Math.max(...v);
        const pad = Math.max(0.5 * (hi - lo), 1e-3 * Math.max(1, Math.abs(lo), Math.abs(hi)));
        return [lo - pad, hi + pad] as [number, number];
      });
      const sys = mapOf(model, o)!.sys;
      for (const fp of fixedPoints(sys, box, { maxStarts: 60 }).slice(0, 6)) {
        const d = describeFixedPoint(sys, fp.x);
        fixed.push({
          at: d.x,
          type: d.stability.type,
          stable: d.stability.stable ?? null,
          multipliers: d.eigenvalues.map((e) => (Math.abs(e.im) < 1e-12 ? fmt(e.re) : `${fmt(e.re)} ${e.im < 0 ? '−' : '+'} ${fmt(Math.abs(e.im))}i`)).join(', '),
        });
      }
    }
    const l1 = lyapunov?.[0];
    const says = [
      period ? (period === 1 ? 'it settles to a fixed point' : `it settles into a cycle of period ${period}`) : run.stopped !== null ? 'it leaves the numbers' : 'it does not repeat within 64 steps',
      l1 !== undefined ? `largest Lyapunov exponent ${fmt(l1)} per step${l1 > 0.01 ? ' — nearby starts separate exponentially: chaos' : ''}` : '',
    ]
      .filter(Boolean)
      .join('; ');
    return { period, lyapunov, fixed, says };
  });
}

/** The cobweb of a one-state map: the orbit walked between the graph y = f(x) and the diagonal. */
export function cobwebOf(model: Model, o: ModelObject): { primitives: Primitive[]; box: { x: [number, number]; y: [number, number] }; note: string } | null {
  return cached(keyOf(model, o, ':cobweb'), () => {
    const got = mapRunFor(model, o);
    const m = mapOf(model, o);
    if (!got.ok || !m || got.run.names.length !== 1) return null;
    const run = got.run;
    const g1 = (x: number) => mapOf(model, o)!.sys.g([x])[0];
    const xs = run.x.map((v) => v[0]);
    let lo = Math.min(...xs);
    let hi = Math.max(...xs);
    const pad = Math.max(0.15 * (hi - lo), 1e-3);
    lo -= pad;
    hi += pad;
    const curve: P3[] = [];
    for (let i = 0; i <= 240; i++) {
      const x = lo + ((hi - lo) * i) / 240;
      const y = g1(x);
      if (Number.isFinite(y)) curve.push({ x, y, z: 0 });
    }
    const web = cobweb(g1, xs[0], Math.min(80, xs.length - 1)).map(([x, y]) => ({ x, y, z: 0 }));
    const ys = [...curve.map((p) => p.y), ...web.map((p) => p.y)].filter(Number.isFinite);
    const ylo = Math.min(lo, ...ys);
    const yhi = Math.max(hi, ...ys);
    return {
      primitives: [
        { p: 'polyline', of: o.id, at: [{ x: Math.min(lo, ylo), y: Math.min(lo, ylo), z: 0 }, { x: Math.max(hi, yhi), y: Math.max(hi, yhi), z: 0 }], tone: 'muted', dashed: true, width: 1 },
        { p: 'polyline', of: o.id, at: curve, tone: 'primary', width: 1.8 },
        { p: 'polyline', of: o.id, at: web, tone: 'tension', width: 1 },
        { p: 'points', of: o.id, at: [web[0]], tone: 'tension', r: 3 },
      ],
      box: { x: [lo, hi], y: [ylo, yhi] },
      note: `the orbit from ${fmt(xs[0])}, walked up to the graph and across to the diagonal ${Math.min(80, xs.length - 1)} times — where the walk closes on itself is a cycle, where it spirals in is a fixed point`,
    };
  });
}

/** The bifurcation diagram: where the map settles, as one parameter sweeps its range. */
export function bifurcationOf(model: Model, o: ModelObject): { primitives: Primitive[]; box: { x: [number, number]; y: [number, number] }; param: { id: string; label: string; units?: string }; note: string } | null {
  return cached(keyOf(model, o, ':bifurcation'), () => {
    const m = mapOf(model, o);
    const sw = sweepOf(model, o);
    if (!m || !sw || m.clocked) return null;
    const ps = Array.from({ length: MAP_CAPS.columns }, (_, i) => sw.range[0] + ((sw.range[1] - sw.range[0]) * i) / (MAP_CAPS.columns - 1));
    const cols = bifurcationMap((p) => mapOf(model, o, { [sw.id]: p })!.sys, ps, m.init, { transient: MAP_CAPS.transient, keep: MAP_CAPS.keep, coord: 0, carry: true });
    const pts: P3[] = [];
    for (const c of cols) for (const v of c.values) pts.push({ x: c.p, y: v, z: 0 });
    if (!pts.length) return null;
    const ys = pts.map((p) => p.y);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const pad = Math.max(0.04 * (hi - lo), 1e-6);
    // WHERE THE PERIOD FIRST DOUBLES, read off the columns — counting a cycle only when its values are visibly
    // apart. Near a bifurcation the orbit settles slowly: just below r = 3 the logistic map is still alternating
    // about its fixed point at 4×10⁻⁹ after 400 steps, which a tolerance reads as period 2.
    const span = (c: (typeof cols)[number]) => (c.values.length ? Math.max(...c.values) - Math.min(...c.values) : 0);
    const visible = 1e-3 * Math.max(hi - lo, 1e-12);
    const firstTwo = cols.find((c) => c.period === 2 && span(c) > visible);
    const chaos = cols.filter((c) => c.period === 0 && span(c) > visible * 10).length;
    const now = model.params.find((q) => q.id === sw.id)?.value;
    const prims: Primitive[] = [{ p: 'points', of: o.id, at: pts, tone: 'primary', r: 0.7 }];
    if (now !== undefined) prims.push({ p: 'polyline', of: o.id, at: [{ x: now, y: lo - pad, z: 0 }, { x: now, y: hi + pad, z: 0 }], tone: 'tension', dashed: true, width: 1 });
    return {
      primitives: prims,
      box: { x: [sw.range[0], sw.range[1]], y: [lo - pad, hi + pad] },
      param: { id: sw.id, label: sw.label, ...(sw.units ? { units: sw.units } : {}) },
      note: `${MAP_CAPS.columns} values of ${sw.label} across its range; at each, ${MAP_CAPS.transient} steps to settle, then ${MAP_CAPS.keep} kept — the dashed line is its value now${firstTwo ? `; the period first doubles near ${sw.label} = ${fmt(firstTwo.p)}` : ''}${chaos ? `; in ${chaos} of the columns it spreads over many values and repeats within no period up to 64 — chaos, or a cycle longer than that` : ''}`,
    };
  });
}

/** A flow's Poincaré section: the state each time the third crosses its mean, upward — the map hidden inside the flow. */
export function sectionOf(model: Model, o: ModelObject): { primitives: Primitive[]; box: { x: [number, number]; y: [number, number] }; names: [string, string]; note: string } | null {
  return cached(keyOf(model, o, ':section'), () => {
    if (!o.system || o.system.states.length < 3) return null;
    const read = readSystem(model, o);
    const got = runFor(model, o);
    if (!read.ok || !got.ok) return null;
    const names = got.run.names;
    const scope = paramsOf(model);
    const known = [...Object.keys(scope), ...names, 't'];
    const fns = names.map((n) => compileExpr(o.system!.rhs[n], known));
    if (fns.some((f) => !f)) return null;
    if (Object.values(o.system.rhs).some((e) => namesIn(e).includes('t'))) return null;
    const lower = names.map((n) => n.toLowerCase());
    const flow: Flow = {
      dim: names.length,
      f: (y) => {
        const sc: Record<string, number> = { ...scope };
        lower.forEach((n, i) => (sc[n] = y[i]));
        return fns.map((f) => f!.eval(sc));
      },
    };
    const z = got.run.y.map((r) => r[2]);
    const value = z.reduce((a, b) => a + b, 0) / z.length;
    const span = got.run.t[got.run.t.length - 1] - got.run.t[0];
    const sec = poincare(flow, got.run.y[0], { coord: 2, value, direction: 1 }, { transient: 0.1 * Math.max(span, 10) * 10, count: 600, tMax: Math.max(span, 10) * 10 });
    if (sec.points.length < 3) return null;
    const pts = sec.points.map((p) => ({ x: p[0], y: p[1], z: 0 }));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = (a: number[]) => Math.max(0.06 * (Math.max(...a) - Math.min(...a)), 1e-6);
    return {
      primitives: [{ p: 'points', of: o.id, at: pts, tone: 'primary', r: 1.4 }],
      box: { x: [Math.min(...xs) - pad(xs), Math.max(...xs) + pad(xs)], y: [Math.min(...ys) - pad(ys), Math.max(...ys) + pad(ys)] },
      names: [names[0], names[1]],
      note: `${pts.length} crossings of ${names[2]} = ${fmt(value)} (its mean over the run), upward, after a settling time; each is where the path pierces that plane — a few points are a cycle, a curve is a torus, a dust of points that never repeats is a strange attractor`,
    };
  });
}

/**
 * Feigenbaum's constants, out of this map: the parameters at which its 2ⁿ-cycles
 * are superstable, and the ratios of their gaps. For any smooth one-humped map
 * the ratios tend to δ = 4.6692…, whatever the map — which is the point of
 * computing them here rather than quoting them.
 */
export function feigenbaumOf(model: Model, o: ModelObject): { superstable: number[]; delta: number[]; says: string } | null {
  return cached(keyOf(model, o, ':feigenbaum'), () => {
    const m = mapOf(model, o);
    const sw = sweepOf(model, o);
    const run = mapRunFor(model, o);
    if (!m || !sw || m.clocked || !run.ok || run.run.names.length !== 1) return null;
    const xs = run.run.x.map((v) => v[0]);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const span = Math.max(hi - lo, 1e-6);
    // compiled once: the search evaluates f tens of thousands of times
    const params = paramsOf(model);
    const name = run.run.names[0].toLowerCase();
    const fn = compileExpr(nextOf(o, run.run.names[0])!, [...Object.keys(params), run.run.names[0], 'n']);
    if (!fn) return null;
    const sc: Record<string, number> = { ...params, n: 0 };
    const key = sw.id.toLowerCase();
    const f = (x: number, p: number) => {
      sc[name] = x;
      sc[key] = p;
      sc[sw.id] = p;
      return fn.eval(sc);
    };
    // the first superstable cycle — the fixed point through the hump's top — usually lies below where the doubling
    // is interesting (r = 2 for the logistic map), so the search starts a range's width below the control's
    const width = sw.range[1] - sw.range[0];
    try {
      const fb = superstable(f, [lo - 0.25 * span, hi + 0.25 * span], [sw.range[0] - width, sw.range[1]], { levels: 8 });
      const delta = fb.delta.filter(Number.isFinite);
      if (fb.superstable.length < 3 || !delta.length) return null;
      return {
        superstable: fb.superstable,
        delta,
        says: `its 2ⁿ-cycles are superstable at ${sw.label} = ${fb.superstable.slice(0, 4).map(fmt).join(', ')}, …; the ratio of successive gaps tends to ${fmt(delta[delta.length - 1])} — Feigenbaum's δ = 4.6692 for every smooth one-humped map`,
      };
    } catch {
      return null;
    }
  });
}
