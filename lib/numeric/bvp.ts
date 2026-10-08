// lib/numeric/bvp.ts
//
// BOUNDARY-VALUE PROBLEMS BY SHOOTING — and every solution, not the first.
//
//   y'' = f(x, y, y')  on [a, b],  y or y' given at each end.
//
// The missing starting value (the slope, or the height when the slope is
// given) is a number s, and integrating from a with it lands somewhere at b:
// the miss r(s) is a function of one variable. Its zeros are the solutions.
// This scans s across a range, refines every sign change by Brent's method,
// and integrates each solution once more for its curve — so a nonlinear
// problem with two solutions (Bratu's equation below its fold) returns both,
// and one with none (above the fold) returns none and says so, rather than
// the first thing a Newton iteration happened to settle on.
//
// The integrator is Dormand–Prince with error control (ode.ts); a start that
// blows up before b is a miss of NaN, skipped.
//
// PURE.

import { integrate } from './ode';
import { brent } from './roots';

export type End = { y: number } | { yp: number };

export interface BVP {
  /** y'' = f(x, y, y′) */
  f: (x: number, y: number, yp: number) => number;
  a: number;
  b: number;
  left: End;
  right: End;
}

export interface BVPSolution {
  /** the starting value that was found: y′(a), or y(a) when y′(a) was given */
  start: number;
  x: number[];
  y: number[];
  yp: number[];
  /** how far the far end misses its condition */
  residual: number;
}

export interface Shooting {
  solutions: BVPSolution[];
  /** the range scanned and how finely */
  scanned: { range: [number, number]; samples: number };
  says: string;
}

const isY = (e: End): e is { y: number } => 'y' in e;

export function shoot(p: BVP, opts: { scan?: [number, number]; samples?: number; points?: number; rtol?: number } = {}): Shooting {
  const range = opts.scan ?? [-10, 10];
  const samples = Math.max(8, opts.samples ?? 120);
  const points = Math.max(3, opts.points ?? 101);
  const rtol = opts.rtol ?? 1e-10;
  const rhs = (x: number, z: readonly number[]) => [z[1], p.f(x, z[0], z[1])];
  const start = (s: number): [number, number] => (isY(p.left) ? [p.left.y, s] : [s, p.left.yp]);
  const land = (s: number): number => {
    const r = integrate(rhs, p.a, start(s), p.b, { rtol, atol: 1e-12, tEval: [p.b], maxSteps: 200000 });
    const end = r.y[r.y.length - 1];
    if (r.stats.stopped !== 'done' || !end || !end.every(Number.isFinite)) return NaN;
    return isY(p.right) ? end[0] - p.right.y : end[1] - p.right.yp;
  };
  const ss = Array.from({ length: samples + 1 }, (_, i) => range[0] + ((range[1] - range[0]) * i) / samples);
  const rs = ss.map(land);
  const found: number[] = [];
  for (let i = 0; i < samples; i++) {
    const r0 = rs[i];
    const r1 = rs[i + 1];
    if (!Number.isFinite(r0) || !Number.isFinite(r1)) continue;
    if (r0 === 0) found.push(ss[i]);
    else if (r0 * r1 < 0) {
      const s = brent(land, ss[i], ss[i + 1], 1e-13);
      if (s !== null) found.push(s);
    }
  }
  if (Number.isFinite(rs[samples]) && rs[samples] === 0) found.push(ss[samples]);
  const distinct = found.filter((s, i) => found.findIndex((t) => Math.abs(t - s) < 1e-8 * Math.max(1, Math.abs(s))) === i);
  const xs = Array.from({ length: points }, (_, i) => p.a + ((p.b - p.a) * i) / (points - 1));
  const solutions: BVPSolution[] = distinct.map((s) => {
    const r = integrate(rhs, p.a, start(s), p.b, { rtol, atol: 1e-12, tEval: xs });
    return { start: s, x: r.t, y: r.y.map((z) => z[0]), yp: r.y.map((z) => z[1]), residual: Math.abs(land(s)) };
  });
  const what = isY(p.left) ? 'y′(a)' : 'y(a)';
  return {
    solutions,
    scanned: { range, samples },
    says: solutions.length
      ? `${solutions.length} solution${solutions.length === 1 ? '' : 's'}: ${what} = ${solutions.map((x) => Number(x.start.toPrecision(6))).join(', ')} — every sign change of the miss across ${what} ∈ [${range[0]}, ${range[1]}], refined by Brent`
      : `no solution with ${what} in [${range[0]}, ${range[1]}]: the far end is missed the same way from every start scanned`,
  };
}
