// lib/numeric/dynamics.ts
//
// THE QUALITATIVE THEORY OF DYNAMICAL SYSTEMS, COMPUTED.
//
// For any flow ẋ = f(x) or map x ↦ g(x) — written by a person, proposed by
// a model, never looked up — this answers the questions a dynamics course
// asks of it:
//
//   fixedPoints        where it rests: every equilibrium in a box, each with
//                      its Jacobian, eigenvalues and type (node, spiral,
//                      saddle, centre; for maps attracting, repelling, flip)
//   continuation       those equilibria followed along a parameter, with
//                      the bifurcations between steps detected and named
//                      (fold — saddle-node/transcritical/pitchfork — or Hopf,
//                      with its frequency)
//   lyapunovFlow/Map   the Lyapunov spectrum (Benettin with QR re-
//                      orthonormalization), its running estimate for showing
//                      convergence, the sum checked against the mean
//                      divergence, and the Kaplan–Yorke dimension
//   poincare           crossings of a plane, located exactly (ode events)
//   bifurcationMap/Flow  the attractor as a parameter sweeps: a map's orbit
//                      after transients, a flow's section or maxima
//   orbit, cobweb      iterating a map, and its cobweb
//   periodicPoints     period-k points of a map, grouped into cycles, with
//                      the cycle's multipliers
//   superstable        the superstable parameters of a unimodal map, and
//                      from them Feigenbaum's δ and α — estimated, with the
//                      sequence that gives them, never assumed
//   twin               two nearby starts and their separation over time
//
// Every result carries what it took to get it. Nothing here knows the name
// of any system.
//
// PURE.

import { eigenvalues, type Complex } from './linalg';
import { integrate } from './ode';
import { brent, multiStart, newton, numJacobian } from './roots';

export interface Flow {
  dim: number;
  names?: string[];
  f: (y: readonly number[], t: number) => number[];
  jac?: (y: readonly number[], t: number) => number[][];
}

export interface DiscreteMap {
  dim: number;
  names?: string[];
  g: (x: readonly number[]) => number[];
  jac?: (x: readonly number[]) => number[][];
}

const flowJ = (s: Flow, y: readonly number[], t = 0) => (s.jac ? s.jac(y, t) : numJacobian((z) => s.f(z, t), y));
const mapJ = (s: DiscreteMap, x: readonly number[]) => (s.jac ? s.jac(x) : numJacobian(s.g, x));

// ── classification ──────────────────────────────────────────────────

export interface Stability {
  /** plain words: 'stable spiral', 'saddle', 'attracting', 'non-hyperbolic' … */
  type: string;
  /** true, false, or null when the linearization cannot decide */
  stable: boolean | null;
  hyperbolic: boolean;
  /** counts of eigen-directions */
  dims: { stable: number; unstable: number; centre: number };
  /** some eigenvalues are complex: trajectories turn as they approach or leave */
  rotating: boolean;
  /** flows: the slowest decay/growth time 1/min|Re λ|; maps: undefined */
  timescale?: number;
  /** flows with complex eigenvalues: Im λ / 2π */
  frequency?: number;
}

export function classifyFlow(eigs: readonly Complex[]): Stability {
  const scale = Math.max(1, ...eigs.map((z) => Math.hypot(z.re, z.im)));
  const tol = 1e-9 * scale;
  const pos = eigs.filter((z) => z.re > tol).length;
  const neg = eigs.filter((z) => z.re < -tol).length;
  const zero = eigs.length - pos - neg;
  const rotating = eigs.some((z) => Math.abs(z.im) > tol);
  const n = eigs.length;
  const nonzeroRe = eigs.map((z) => Math.abs(z.re)).filter((v) => v > tol);
  const timescale = nonzeroRe.length ? 1 / Math.min(...nonzeroRe) : undefined;
  const im = eigs.map((z) => Math.abs(z.im)).filter((v) => v > tol);
  const frequency = im.length ? Math.max(...im) / (2 * Math.PI) : undefined;
  let type: string;
  if (zero > 0) {
    if (pos === 0 && neg === 0 && rotating && n === 2) type = 'centre (linearly)';
    else type = 'non-hyperbolic';
  } else if (pos === 0) type = rotating ? (n === 2 ? 'stable spiral' : 'stable focus') : 'stable node';
  else if (neg === 0) type = rotating ? (n === 2 ? 'unstable spiral' : 'unstable focus') : 'unstable node';
  else type = rotating ? 'saddle-focus' : 'saddle';
  return {
    type,
    stable: zero === 0 ? pos === 0 : pos > 0 ? false : null,
    hyperbolic: zero === 0,
    dims: { stable: neg, unstable: pos, centre: zero },
    rotating,
    ...(timescale !== undefined ? { timescale } : {}),
    ...(frequency !== undefined ? { frequency } : {}),
  };
}

export function classifyMap(eigs: readonly Complex[]): Stability {
  const mod = eigs.map((z) => Math.hypot(z.re, z.im));
  const tol = 1e-9;
  const inside = mod.filter((m) => m < 1 - tol).length;
  const outside = mod.filter((m) => m > 1 + tol).length;
  const on = mod.length - inside - outside;
  const rotating = eigs.some((z) => Math.abs(z.im) > 1e-9 * Math.max(1, Math.hypot(z.re, z.im)));
  const flips = eigs.some((z) => Math.abs(z.im) <= 1e-12 && z.re < 0);
  let type: string;
  if (on > 0) type = 'non-hyperbolic';
  else if (outside === 0) type = 'attracting';
  else if (inside === 0) type = 'repelling';
  else type = 'saddle';
  if (on === 0 && flips) type += ' (orbit alternates sides)';
  return { type, stable: on === 0 ? outside === 0 : outside > 0 ? false : null, hyperbolic: on === 0, dims: { stable: inside, unstable: outside, centre: on }, rotating };
}

// ── fixed points ────────────────────────────────────────────────────

export interface FixedPoint {
  x: number[];
  jacobian: number[][];
  eigenvalues: Complex[];
  stability: Stability;
  /** |f(x*)| (flows) or |g(x*) − x*| (maps) */
  residual: number;
}

export type Box = readonly (readonly [number, number])[];

export function fixedPoints(sys: Flow | DiscreteMap, box: Box, opts: { maxStarts?: number } = {}): FixedPoint[] {
  const isMap = 'g' in sys;
  const F = isMap ? (x: readonly number[]) => (sys as DiscreteMap).g(x).map((v, i) => v - x[i]) : (y: readonly number[]) => (sys as Flow).f(y, 0);
  const JF = isMap
    ? (x: readonly number[]) => mapJ(sys as DiscreteMap, x).map((r, i) => r.map((v, j) => v - (i === j ? 1 : 0)))
    : (y: readonly number[]) => flowJ(sys as Flow, y, 0);
  const sols = multiStart(F, box, { J: JF, maxStarts: opts.maxStarts ?? Math.min(729, 9 ** sys.dim) });
  return sols.map((x) => describeFixedPoint(sys, x));
}

export function describeFixedPoint(sys: Flow | DiscreteMap, x: number[]): FixedPoint {
  const isMap = 'g' in sys;
  const J = isMap ? mapJ(sys as DiscreteMap, x) : flowJ(sys as Flow, x, 0);
  const eig = eigenvalues(J);
  const r = isMap ? (sys as DiscreteMap).g(x).map((v, i) => v - x[i]) : (sys as Flow).f(x, 0);
  return { x, jacobian: J, eigenvalues: eig, stability: isMap ? classifyMap(eig) : classifyFlow(eig), residual: Math.hypot(...r) };
}

/** Divergence of a flow (trace of the Jacobian): < 0 contracts phase-space volume, = 0 conserves it. */
export function divergence(sys: Flow, y: readonly number[], t = 0): number {
  const J = flowJ(sys, y, t);
  return J.reduce((s, r, i) => s + r[i], 0);
}

// ── continuation and local bifurcations ─────────────────────────────

export interface BranchPoint {
  p: number;
  x: number[];
  eigenvalues: Complex[];
  stable: boolean | null;
}

export interface Bifurcation {
  /** between two parameter steps, refined by bisection */
  p: number;
  kind: 'fold' | 'hopf' | 'flip' | 'neimark-sacker' | 'stability change';
  /** Hopf: the frequency of the cycle that is born, Im λ / 2π, and the angular frequency */
  frequency?: number;
  omega?: number;
  x: number[];
  says: string;
}

export interface Continuation {
  branches: BranchPoint[][];
  bifurcations: Bifurcation[];
}

/**
 * Natural-parameter continuation: at each p, Newton from each point found at
 * the previous p, plus a fresh multi-start every few steps to catch branches
 * that appear. A change of stability between steps is located by bisection
 * on the eigenvalue that crossed and named from what crossed.
 */
export function continuation(make: (p: number) => Flow | DiscreteMap, ps: readonly number[], box: Box, opts: { reseedEvery?: number } = {}): Continuation {
  const reseed = opts.reseedEvery ?? 10;
  const isMap = 'g' in make(ps[0]);
  const branches: BranchPoint[][] = [];
  const bifurcations: Bifurcation[] = [];
  let prev: { x: number[]; branch: number }[] = [];
  const crit = (eig: readonly Complex[]) => (isMap ? Math.max(...eig.map((z) => Math.hypot(z.re, z.im))) - 1 : Math.max(...eig.map((z) => z.re)));
  ps.forEach((p, k) => {
    const sys = make(p);
    const F = isMap ? (x: readonly number[]) => (sys as DiscreteMap).g(x).map((v, i) => v - x[i]) : (y: readonly number[]) => (sys as Flow).f(y, 0);
    const found: { x: number[]; branch: number }[] = [];
    for (const q of prev) {
      const r = newton(F, q.x);
      if (r.converged && !found.some((f) => dist(f.x, r.x) < 1e-6 * Math.max(1, norm(r.x)))) found.push({ x: r.x, branch: q.branch });
    }
    if (k % reseed === 0) {
      for (const x of fixedPoints(sys, box).map((fp) => fp.x)) {
        if (found.some((f) => dist(f.x, x) < 1e-6 * Math.max(1, norm(x)))) continue;
        branches.push([]);
        found.push({ x, branch: branches.length - 1 });
      }
    }
    for (const fpt of found) {
      const d = describeFixedPoint(sys, fpt.x);
      const pt: BranchPoint = { p, x: d.x, eigenvalues: d.eigenvalues, stable: d.stability.stable };
      const br = branches[fpt.branch];
      // compare with the last point whose stability was decided: a grid that lands exactly on
      // the bifurcation (eigenvalue on the boundary, stability undecided) must not hide it
      const last = [...br].reverse().find((q) => q.stable !== null);
      if (last && pt.stable !== null && last.stable !== pt.stable) {
        // locate the crossing by bisection on the critical eigenvalue
        let a = last.p;
        let b = p;
        let xa = last.x;
        const ca = crit(last.eigenvalues);
        for (let it = 0; it < 40; it++) {
          const m = (a + b) / 2;
          const sm = make(m);
          const Fm = isMap ? (x: readonly number[]) => (sm as DiscreteMap).g(x).map((v, i) => v - x[i]) : (y: readonly number[]) => (sm as Flow).f(y, 0);
          const r = newton(Fm, xa);
          if (!r.converged) break;
          const em = describeFixedPoint(sm, r.x).eigenvalues;
          if (Math.sign(crit(em)) === Math.sign(ca)) {
            a = m;
            xa = r.x;
          } else b = m;
        }
        const at = (a + b) / 2;
        const sAt = make(at);
        const dAt = describeFixedPoint(sAt, xa);
        const critical = [...dAt.eigenvalues].sort((u, v) => (isMap ? Math.abs(Math.hypot(u.re, u.im) - 1) - Math.abs(Math.hypot(v.re, v.im) - 1) : Math.abs(u.re) - Math.abs(v.re)))[0];
        const complex = Math.abs(critical.im) > 1e-6 * Math.max(1, Math.abs(critical.re));
        let kind: Bifurcation['kind'];
        if (isMap) kind = complex ? 'neimark-sacker' : critical.re < 0 ? 'flip' : 'fold';
        else kind = complex ? 'hopf' : 'fold';
        const omega = complex ? Math.abs(critical.im) : undefined;
        bifurcations.push({
          p: at,
          kind,
          x: xa,
          ...(kind === 'hopf' && omega !== undefined ? { omega, frequency: omega / (2 * Math.PI) } : {}),
          says:
            kind === 'hopf'
              ? `A pair of eigenvalues crosses the imaginary axis at p ≈ ${at.toPrecision(6)}, with ω ≈ ${omega!.toPrecision(5)} — a Hopf bifurcation; a cycle of period ≈ ${((2 * Math.PI) / omega!).toPrecision(5)} is born or dies there.`
              : kind === 'fold'
                ? `A real eigenvalue passes through ${isMap ? '+1' : 'zero'} at p ≈ ${at.toPrecision(6)} — a fold (saddle-node, transcritical or pitchfork: which one depends on how many equilibria meet there).`
                : kind === 'flip'
                  ? `An eigenvalue passes through −1 at p ≈ ${at.toPrecision(6)} — a period-doubling (flip) bifurcation.`
                  : `A complex pair leaves the unit circle at p ≈ ${at.toPrecision(6)} — a Neimark–Sacker bifurcation (an invariant circle).`,
        });
      }
      br.push(pt);
    }
    prev = found;
  });
  return { branches: branches.filter((b) => b.length), bifurcations: bifurcations.sort((a, b) => a.p - b.p) };
}

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
const norm = (a: readonly number[]) => Math.hypot(...a);

// ── Lyapunov exponents ──────────────────────────────────────────────

export interface Lyapunov {
  /** descending */
  exponents: number[];
  /** the running estimates, for showing that they settled */
  history: { t: number; exponents: number[] }[];
  /** Σλ, which for a full spectrum equals the time-averaged divergence */
  sum: number;
  meanDivergence?: number;
  /** Kaplan–Yorke (Lyapunov) dimension, when the spectrum is complete */
  kaplanYorke?: number;
  method: string;
}

function orthonormalize(V: number[][]): { Q: number[][]; logs: number[] } {
  // modified Gram–Schmidt on the columns of V (n × k)
  const n = V.length;
  const k = V[0].length;
  const Q = V.map((r) => r.slice());
  const logs: number[] = [];
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < j; i++) {
      let d = 0;
      for (let r = 0; r < n; r++) d += Q[r][i] * Q[r][j];
      for (let r = 0; r < n; r++) Q[r][j] -= d * Q[r][i];
    }
    let nr = 0;
    for (let r = 0; r < n; r++) nr += Q[r][j] * Q[r][j];
    nr = Math.sqrt(nr);
    logs.push(Math.log(nr || 1e-300));
    for (let r = 0; r < n; r++) Q[r][j] /= nr || 1;
  }
  return { Q, logs };
}

export function kaplanYorke(exps: readonly number[]): number | undefined {
  let s = 0;
  for (let j = 0; j < exps.length; j++) {
    if (s + exps[j] < 0) return j === 0 ? 0 : j + s / Math.abs(exps[j]);
    s += exps[j];
  }
  return exps.length;
}

export function lyapunovFlow(sys: Flow, y0: readonly number[], opts: { transient?: number; time?: number; tau?: number; k?: number; rtol?: number } = {}): Lyapunov {
  const n = sys.dim;
  const k = Math.min(n, opts.k ?? n);
  const tau = opts.tau ?? 0.5;
  const T = opts.time ?? 200;
  const rtol = opts.rtol ?? 1e-9;
  let y = y0.slice();
  if (opts.transient) {
    const r = integrate((t, z) => sys.f(z, t), 0, y, opts.transient, { rtol, keepSteps: false });
    y = r.events.length ? y : lastOf(r) ?? y;
    if (!r.y.length) {
      const r2 = integrate((t, z) => sys.f(z, t), 0, y, opts.transient, { rtol, tEval: [opts.transient] });
      y = r2.y.at(-1) ?? y;
    }
  }
  let V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
  const sums = new Array(k).fill(0);
  const history: { t: number; exponents: number[] }[] = [];
  let divSum = 0;
  let divCount = 0;
  const steps = Math.max(1, Math.round(T / tau));
  let t = 0;
  const aug = (tt: number, z: readonly number[]) => {
    const ys = z.slice(0, n);
    const f = sys.f(ys, tt);
    const J = flowJ(sys, ys, tt);
    const out = f.slice();
    for (let j = 0; j < k; j++)
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let r = 0; r < n; r++) s += J[i][r] * z[n + r * k + j];
        out.push(s);
      }
    // reorder: out[n + i*k + j]
    const res = f.slice();
    for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) res.push(0);
    let idx = n;
    for (let j = 0; j < k; j++)
      for (let i = 0; i < n; i++) {
        res[n + i * k + j] = out[idx++];
      }
    return res;
  };
  for (let s = 0; s < steps; s++) {
    const z0 = [...y, ...V.flat()];
    const r = integrate(aug, t, z0, t + tau, { rtol, atol: 1e-12, tEval: [t + tau] });
    const z = r.y.at(-1);
    if (!z || z.some((v) => !Number.isFinite(v))) break;
    y = z.slice(0, n);
    const Vn = Array.from({ length: n }, (_, i) => Array.from({ length: k }, (_, j) => z[n + i * k + j]));
    const { Q, logs } = orthonormalize(Vn);
    V = Q;
    logs.forEach((l, j) => (sums[j] += l));
    t += tau;
    divSum += divergence(sys, y, t);
    divCount++;
    if (s % Math.max(1, Math.floor(steps / 200)) === 0 || s === steps - 1) history.push({ t, exponents: sums.map((v) => v / t) });
  }
  const exponents = sums.map((v) => v / (t || 1)).sort((a, b) => b - a);
  return {
    exponents,
    history,
    sum: exponents.reduce((s, v) => s + v, 0),
    ...(divCount ? { meanDivergence: divSum / divCount } : {}),
    ...(k === n ? { kaplanYorke: kaplanYorke(exponents) } : {}),
    method: `Benettin: tangent vectors carried with the trajectory (Dormand–Prince, rtol ${rtol}), re-orthonormalized every τ = ${tau}, averaged over t = ${t.toFixed(0)}${opts.transient ? ` after a transient of ${opts.transient}` : ''}`,
  };
}

const lastOf = (r: { y: number[][] }) => r.y[r.y.length - 1];

export function lyapunovMap(sys: DiscreteMap, x0: readonly number[], opts: { transient?: number; n?: number; k?: number } = {}): Lyapunov {
  const d = sys.dim;
  const k = Math.min(d, opts.k ?? d);
  let x = x0.slice();
  for (let i = 0; i < (opts.transient ?? 1000); i++) x = sys.g(x);
  let V: number[][] = Array.from({ length: d }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
  const sums = new Array(k).fill(0);
  const N = opts.n ?? 100000;
  const history: { t: number; exponents: number[] }[] = [];
  let done = 0;
  for (let i = 0; i < N; i++) {
    const J = mapJ(sys, x);
    const Vn = J.map((row) => Array.from({ length: k }, (_, j) => row.reduce((s, v, r) => s + v * V[r][j], 0)));
    const { Q, logs } = orthonormalize(Vn);
    V = Q;
    logs.forEach((l, j) => (sums[j] += l));
    x = sys.g(x);
    done++;
    if (!x.every(Number.isFinite)) break;
    if (i % Math.max(1, Math.floor(N / 200)) === 0 || i === N - 1) history.push({ t: done, exponents: sums.map((v) => v / done) });
  }
  const exponents = sums.map((v) => v / (done || 1)).sort((a, b) => b - a);
  return {
    exponents,
    history,
    sum: exponents.reduce((s, v) => s + v, 0),
    ...(k === d ? { kaplanYorke: kaplanYorke(exponents) } : {}),
    method: `products of Jacobians along the orbit, re-orthonormalized every step, averaged over ${done} iterates after ${opts.transient ?? 1000}`,
  };
}

// ── sections, orbits, cobwebs ───────────────────────────────────────

export interface Section {
  /** the full state at each crossing */
  points: number[][];
  times: number[];
  /** the plane: coordinate index = value, crossed in this direction */
  plane: { coord: number; value: number; direction: 1 | -1 | 0 };
}

export function poincare(sys: Flow, y0: readonly number[], plane: { coord: number; value: number; direction?: 1 | -1 | 0 }, opts: { transient?: number; count?: number; tMax?: number; rtol?: number } = {}): Section {
  const count = opts.count ?? 500;
  const tMax = opts.tMax ?? 5000;
  const transient = opts.transient ?? 0;
  const r = integrate((t, z) => sys.f(z, t), 0, y0, tMax, {
    rtol: opts.rtol ?? 1e-9,
    atol: 1e-11,
    keepSteps: false,
    maxSteps: 2_000_000,
    events: [{ g: (t, z) => z[plane.coord] - plane.value, direction: plane.direction ?? 1 }],
  });
  const hits = r.events.filter((e) => e.t >= transient).slice(0, count);
  return { points: hits.map((h) => h.y), times: hits.map((h) => h.t), plane: { coord: plane.coord, value: plane.value, direction: plane.direction ?? 1 } };
}

export function orbit(sys: DiscreteMap, x0: readonly number[], n: number): number[][] {
  const out: number[][] = [x0.slice()];
  let x = x0.slice();
  for (let i = 0; i < n; i++) {
    x = sys.g(x);
    if (!x.every(Number.isFinite)) break;
    out.push(x);
  }
  return out;
}

/** The cobweb of a 1D map from x0: vertical to the graph, horizontal to the diagonal, n times. */
export function cobweb(g: (x: number) => number, x0: number, n: number): [number, number][] {
  const pts: [number, number][] = [[x0, x0]];
  let x = x0;
  for (let i = 0; i < n; i++) {
    const y = g(x);
    if (!Number.isFinite(y)) break;
    pts.push([x, y], [y, y]);
    x = y;
  }
  return pts;
}

// ── bifurcation diagrams ────────────────────────────────────────────

export interface BifurcationColumn {
  p: number;
  values: number[];
  /** smallest period found among the kept points; 0 when none repeats (aperiodic) */
  period: number;
}

/** The asymptotic orbit of a map as a parameter sweeps, starting each p where the last ended. */
export function bifurcationMap(make: (p: number) => DiscreteMap, ps: readonly number[], x0: readonly number[], opts: { transient?: number; keep?: number; coord?: number; carry?: boolean } = {}): BifurcationColumn[] {
  const transient = opts.transient ?? 500;
  const keep = opts.keep ?? 200;
  const coord = opts.coord ?? 0;
  let x = x0.slice();
  return ps.map((p) => {
    const sys = make(p);
    if (opts.carry === false) x = x0.slice();
    for (let i = 0; i < transient; i++) {
      x = sys.g(x);
      if (!x.every(Number.isFinite)) break;
    }
    const vals: number[] = [];
    for (let i = 0; i < keep && x.every(Number.isFinite); i++) {
      x = sys.g(x);
      vals.push(x[coord]);
    }
    if (!x.every(Number.isFinite)) x = x0.slice();
    return { p, values: vals.filter(Number.isFinite), period: periodOf(vals) };
  });
}

/** The smallest k ≤ 64 with x_{i+k} ≈ x_i across the sample; 0 if none. */
export function periodOf(xs: readonly number[], tol?: number): number {
  const n = xs.length;
  if (n < 4) return 0;
  const span = Math.max(...xs) - Math.min(...xs);
  const t = tol ?? Math.max(1e-9, 1e-6 * span);
  for (let k = 1; k <= Math.min(64, Math.floor(n / 2)); k++) {
    let okk = true;
    for (let i = 0; i + k < n; i++)
      if (Math.abs(xs[i + k] - xs[i]) > t) {
        okk = false;
        break;
      }
    if (okk) return k;
  }
  return 0;
}

/** A flow's attractor as a parameter sweeps: the values of one coordinate at its local maxima (or a section). */
export function bifurcationFlow(make: (p: number) => Flow, ps: readonly number[], y0: readonly number[], opts: { coord?: number; transient?: number; time?: number; keep?: number; carry?: boolean } = {}): BifurcationColumn[] {
  const coord = opts.coord ?? 0;
  const transient = opts.transient ?? 100;
  const time = opts.time ?? 200;
  const keep = opts.keep ?? 100;
  let y = y0.slice();
  return ps.map((p) => {
    const sys = make(p);
    if (opts.carry === false) y = y0.slice();
    // local maxima of x_coord: dx/dt crosses zero from + to −
    const r = integrate((t, z) => sys.f(z, t), 0, y, transient + time, {
      rtol: 1e-8,
      atol: 1e-10,
      keepSteps: false,
      maxSteps: 1_000_000,
      tEval: [transient + time],
      events: [{ g: (t, z) => sys.f(z, t)[coord], direction: -1 }],
    });
    const vals = r.events.filter((e) => e.t > transient).slice(-keep).map((e) => e.y[coord]);
    const end = r.y.at(-1);
    y = end && end.every(Number.isFinite) ? end : y0.slice();
    return { p, values: vals, period: periodOf(vals) };
  });
}

// ── periodic points, superstable cycles, Feigenbaum ─────────────────

export interface Cycle {
  points: number[][];
  period: number;
  /** eigenvalues of the cycle's monodromy (the product of Jacobians around it) */
  multipliers: Complex[];
  stability: Stability;
}

export function periodicPoints(sys: DiscreteMap, k: number, box: Box): Cycle[] {
  const gk = (x: readonly number[]) => {
    let y = x.slice();
    for (let i = 0; i < k; i++) y = sys.g(y);
    return y;
  };
  const sols = multiStart((x) => gk(x).map((v, i) => v - x[i]), box, { maxStarts: Math.min(2000, 40 ** sys.dim) });
  const cycles: Cycle[] = [];
  for (const x of sols) {
    // the least period of this point
    let per = k;
    let y = x.slice();
    for (let i = 1; i <= k; i++) {
      y = sys.g(y);
      if (dist(y, x) < 1e-7 * Math.max(1, norm(x))) {
        per = i;
        break;
      }
    }
    if (per !== k) continue;
    if (cycles.some((c) => c.points.some((q) => dist(q, x) < 1e-7 * Math.max(1, norm(x))))) continue;
    const pts: number[][] = [x];
    for (let i = 1; i < k; i++) pts.push(sys.g(pts[i - 1]));
    let M: number[][] = Array.from({ length: sys.dim }, (_, i) => Array.from({ length: sys.dim }, (_, j) => (i === j ? 1 : 0)));
    for (const p of pts) {
      const J = mapJ(sys, p);
      M = J.map((row) => M[0].map((_, j) => row.reduce((s, v, r) => s + v * M[r][j], 0)));
    }
    const mult = eigenvalues(M);
    cycles.push({ points: pts, period: k, multipliers: mult, stability: classifyMap(mult) });
  }
  return cycles;
}

export interface Feigenbaum {
  /** p̄_n: the parameter at which a 2ⁿ-cycle is superstable (contains the critical point) */
  superstable: number[];
  /** δ_n = (p̄_n − p̄_{n−1}) / (p̄_{n+1} − p̄_n) */
  delta: number[];
  /** α_n = d_n / d_{n+1}, d_n the signed distance from the critical point to its nearest cycle neighbour */
  alpha: number[];
  criticalPoint: (p: number) => number;
  method: string;
}

/**
 * For a 1D map f(x; p) with one critical point x_c(p) (∂f/∂x = 0 there):
 * p̄_n solves f^{2ⁿ}(x_c; p) = x_c. The first is scanned for; each next is
 * predicted from the ratio of the last two gaps and found in a bracket
 * around the prediction — so δ comes out of the map, not out of a table.
 */
export function superstable(f: (x: number, p: number) => number, domain: [number, number], pRange: [number, number], opts: { levels?: number; criticalPoint?: (p: number) => number } = {}): Feigenbaum {
  const levels = opts.levels ?? 9;
  const xc =
    opts.criticalPoint ??
    ((p: number) => {
      // a fourth-order stencil: the critical point must be accurate to ~1e-13, because an error δ
      // there moves the superstable condition by δ while f itself barely changes (it is flat there)
      const h = 1e-3 * Math.max(1e-3, domain[1] - domain[0]);
      const df = (x: number) => (f(x - 2 * h, p) - 8 * f(x - h, p) + 8 * f(x + h, p) - f(x + 2 * h, p)) / (12 * h);
      // the interior extremum of f
      const n = 400;
      let best = (domain[0] + domain[1]) / 2;
      let prevV = df(domain[0] + (domain[1] - domain[0]) * 0.001);
      for (let i = 1; i <= n; i++) {
        const x = domain[0] + ((domain[1] - domain[0]) * i) / n;
        const v = df(x);
        if (prevV * v < 0) {
          const r = brent(df, x - (domain[1] - domain[0]) / n, x, 1e-16);
          if (r !== null) {
            best = r;
            break;
          }
        }
        prevV = v;
      }
      return best;
    });
  const iter = (p: number, m: number) => {
    const c = xc(p);
    let x = c;
    for (let i = 0; i < m; i++) x = f(x, p);
    return x - c;
  };
  const sup: number[] = [];
  // p̄_0 and p̄_1 by scanning the parameter range
  const scanFirst = (m: number, from: number): number | null => {
    const n = 4000;
    let prevP = from;
    let prevV = iter(from, m);
    for (let i = 1; i <= n; i++) {
      const p = from + ((pRange[1] - from) * i) / n;
      const v = iter(p, m);
      if (Number.isFinite(prevV) && Number.isFinite(v) && prevV * v <= 0) return brent((q) => iter(q, m), prevP, p, 1e-15);
      prevP = p;
      prevV = v;
    }
    return null;
  };
  const p0 = scanFirst(1, pRange[0]);
  if (p0 === null) return { superstable: [], delta: [], alpha: [], criticalPoint: xc, method: 'no superstable fixed point in the range' };
  sup.push(p0);
  const p1 = scanFirst(2, p0 + 1e-9 * Math.max(1, Math.abs(p0)) + (pRange[1] - p0) * 1e-6);
  if (p1 !== null) sup.push(p1);
  for (let n = 2; n < levels && sup.length === n; n++) {
    const m = 2 ** n;
    const gap = sup[n - 1] - sup[n - 2];
    const d = n >= 3 ? (sup[n - 2] - sup[n - 3]) / gap : 4;
    const pred = sup[n - 1] + gap / d;
    // search a bracket around the prediction for the first root above p̄_{n−1}
    const lo = sup[n - 1] + (gap / d) * 0.2;
    const hi = sup[n - 1] + (gap / d) * 2.5;
    const steps = 400;
    let found: number | null = null;
    let prevP = lo;
    let prevV = iter(lo, m);
    for (let i = 1; i <= steps && found === null; i++) {
      const p = lo + ((hi - lo) * i) / steps;
      const v = iter(p, m);
      if (prevV * v <= 0) found = brent((q) => iter(q, m), prevP, p, 1e-16);
      prevP = p;
      prevV = v;
    }
    void pred;
    if (found === null) break;
    sup.push(found);
  }
  const delta: number[] = [];
  for (let n = 1; n + 1 < sup.length; n++) delta.push((sup[n] - sup[n - 1]) / (sup[n + 1] - sup[n]));
  const alpha: number[] = [];
  const dn = sup.map((p, n) => {
    const c = xc(p);
    let x = c;
    for (let i = 0; i < 2 ** (n - 1 >= 0 ? n - 1 : 0); i++) x = f(x, p);
    return n === 0 ? NaN : x - c;
  });
  for (let n = 1; n + 1 < dn.length; n++) alpha.push(dn[n] / dn[n + 1]);
  return {
    superstable: sup,
    delta,
    alpha,
    criticalPoint: xc,
    method: `superstable 2ⁿ-cycles found by root-finding f^{2ⁿ}(x_c; p) = x_c (Brent), each bracketed from the ratio of the previous two gaps; ${sup.length} levels`,
  };
}

// ── sensitivity: two nearby starts ──────────────────────────────────

export interface Twin {
  t: number[];
  a: number[][];
  b: number[][];
  separation: number[];
  /** slope of log separation over its growth phase, before it saturates at the attractor's size */
  growthRate: number;
  fitWindow: [number, number];
}

export function twin(sys: Flow, y0: readonly number[], delta: number, T: number, samples = 2000): Twin {
  const ts = Array.from({ length: samples + 1 }, (_, i) => (T * i) / samples);
  const yb = y0.slice();
  yb[0] += delta;
  const ra = integrate((t, z) => sys.f(z, t), 0, y0, T, { rtol: 1e-11, atol: 1e-13, tEval: ts });
  const rb = integrate((t, z) => sys.f(z, t), 0, yb, T, { rtol: 1e-11, atol: 1e-13, tEval: ts });
  const n = Math.min(ra.y.length, rb.y.length);
  const sep = Array.from({ length: n }, (_, i) => dist(ra.y[i], rb.y[i]));
  // growth phase: from the first time the separation has grown 10× to the first time it reaches 10% of the attractor size
  const size = Math.max(...ra.y.map((p) => norm(p))) || 1;
  const i0 = sep.findIndex((s) => s > 10 * delta);
  const i1 = sep.findIndex((s) => s > 0.1 * size);
  let growthRate = NaN;
  let win: [number, number] = [0, 0];
  if (i0 > 0 && i1 > i0 + 5) {
    const xs = ts.slice(i0, i1);
    const ys = sep.slice(i0, i1).map((s) => Math.log(s));
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
    const my = ys.reduce((s, v) => s + v, 0) / ys.length;
    let sxx = 0;
    let sxy = 0;
    xs.forEach((x, i) => {
      sxx += (x - mx) ** 2;
      sxy += (x - mx) * (ys[i] - my);
    });
    growthRate = sxy / sxx;
    win = [ts[i0], ts[i1]];
  }
  return { t: ts.slice(0, n), a: ra.y.slice(0, n), b: rb.y.slice(0, n), separation: sep, growthRate, fitWindow: win };
}
