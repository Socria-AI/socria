// lib/numeric/ode.ts
//
// INTEGRATING ODEs, WITH THE ERROR CONTROLLED AND SAID.
//
//   integrate    Dormand–Prince 5(4) — the method behind MATLAB's ode45 and
//                SciPy's RK45 — with adaptive steps under a relative and an
//                absolute tolerance, the 4th-order continuous extension
//                (dense output) for sampling at any time, and EVENTS: the
//                exact moment a function of the state crosses zero, located
//                on the dense output (a Poincaré section is an event)
//   rk4          the classical fixed step, for when reproducibility of a
//                particular dt is the point
//
// Each run reports what it did — steps accepted and rejected, the smallest
// step it needed, and whether the step size collapsed (the honest sign of a
// stiff problem, which an explicit method should not pretend to have solved).
//
// PURE.

export type RHS = (t: number, y: readonly number[]) => number[];

export interface EventSpec {
  /** g(t, y): the event is a zero crossing of this */
  g: (t: number, y: readonly number[]) => number;
  /** +1 only rising crossings, −1 only falling, 0 both */
  direction?: 1 | -1 | 0;
  /** stop the integration at the first one */
  terminal?: boolean;
}

export interface EventHit {
  index: number;
  t: number;
  y: number[];
}

export interface IntegrateOptions {
  rtol?: number;
  atol?: number;
  /** first step; chosen from the problem when absent */
  h0?: number;
  hmax?: number;
  /** a hard ceiling on work */
  maxSteps?: number;
  /** sample the solution at these times (dense output), instead of the steps */
  tEval?: readonly number[];
  events?: readonly EventSpec[];
  /** keep every accepted step (default when there is no tEval) */
  keepSteps?: boolean;
}

export interface IntegrateResult {
  t: number[];
  y: number[][];
  events: EventHit[];
  stats: {
    accepted: number;
    rejected: number;
    fevals: number;
    hmin: number;
    hmax: number;
    /** the integration stopped before t1 */
    stopped: 'done' | 'event' | 'max-steps' | 'step-collapse' | 'non-finite';
    method: string;
  };
}

// Dormand–Prince coefficients
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
// 5th-order weights are A[6]; the error estimate is b5 − b4
const E = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40];
// Hairer's dense output coefficients
const D = [-12715105075 / 11282082432, 0, 87487479700 / 32700410799, -10690763975 / 1880347072, 701980252875 / 199316789632, -1453857185 / 822651844, 69997945 / 29380423];

interface Dense {
  t0: number;
  h: number;
  r: number[][]; // 5 × n
}

function denseAt(d: Dense, t: number): number[] {
  const th = (t - d.t0) / d.h;
  const th1 = 1 - th;
  const [r1, r2, r3, r4, r5] = d.r;
  return r1.map((_, i) => r1[i] + th * (r2[i] + th1 * (r3[i] + th * (r4[i] + th1 * r5[i]))));
}

export function integrate(f: RHS, t0: number, y0: readonly number[], t1: number, opts: IntegrateOptions = {}): IntegrateResult {
  const n = y0.length;
  const dir = t1 >= t0 ? 1 : -1;
  const rtol = opts.rtol ?? 1e-8;
  const atol = opts.atol ?? 1e-10;
  const maxSteps = opts.maxSteps ?? 200000;
  const span = Math.abs(t1 - t0);
  const hmaxAbs = Math.min(opts.hmax ?? span, span || 1);
  const keep = opts.keepSteps ?? !opts.tEval;
  const tEval = opts.tEval ? [...opts.tEval].filter((x) => (dir > 0 ? x >= t0 && x <= t1 : x <= t0 && x >= t1)).sort((a, b) => dir * (a - b)) : null;
  let evalIdx = 0;
  const T: number[] = [];
  const Y: number[][] = [];
  const events: EventHit[] = [];
  let fevals = 0;
  const F = (t: number, y: readonly number[]) => {
    fevals++;
    return f(t, y);
  };
  const scale = (y: readonly number[], z: readonly number[]) => y.map((v, i) => atol + rtol * Math.max(Math.abs(v), Math.abs(z[i])));

  let t = t0;
  let y = y0.slice();
  let k1 = F(t, y);
  if (keep) {
    T.push(t);
    Y.push(y.slice());
  }
  if (tEval) while (evalIdx < tEval.length && tEval[evalIdx] === t0) {
    T.push(t0);
    Y.push(y.slice());
    evalIdx++;
  }

  // initial step (Hairer's heuristic)
  let h = opts.h0 ?? (() => {
    const sc = scale(y, y);
    const d0 = Math.sqrt(y.reduce((s, v, i) => s + (v / sc[i]) ** 2, 0) / n);
    const d1 = Math.sqrt(k1.reduce((s, v, i) => s + (v / sc[i]) ** 2, 0) / n);
    let h0 = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 : (0.01 * d0) / d1;
    h0 = Math.min(h0, hmaxAbs);
    const y1 = y.map((v, i) => v + dir * h0 * k1[i]);
    const k2 = F(t + dir * h0, y1);
    const d2 = Math.sqrt(k2.reduce((s, v, i) => s + ((v - k1[i]) / sc[i]) ** 2, 0) / n) / h0;
    const h1 = Math.max(d1, d2) <= 1e-15 ? Math.max(1e-6, h0 * 1e-3) : (0.01 / Math.max(d1, d2)) ** (1 / 5);
    return Math.min(100 * h0, h1, hmaxAbs);
  })();
  h = Math.max(Math.abs(h), 1e-14 * Math.max(1, Math.abs(t)));

  const gPrev = (opts.events ?? []).map((ev) => ev.g(t, y));
  let accepted = 0;
  let rejected = 0;
  let hmin = Infinity;
  let hmaxSeen = 0;
  let stopped: IntegrateResult['stats']['stopped'] = 'done';
  const k: number[][] = new Array(7);

  while (dir * (t1 - t) > 0) {
    if (accepted + rejected >= maxSteps) {
      stopped = 'max-steps';
      break;
    }
    if (dir * (t + dir * h - t1) > 0) h = Math.abs(t1 - t);
    k[0] = k1;
    for (let s = 1; s < 7; s++) {
      const ys = y.slice();
      for (let j = 0; j < s; j++) {
        const a = A[s][j];
        if (a) for (let i = 0; i < n; i++) ys[i] += dir * h * a * k[j][i];
      }
      k[s] = F(t + dir * C[s] * h, ys);
    }
    // the 5th-order solution is the 7th stage's input; k[6] = f(t + h, y_new)
    const ynew = y.slice();
    for (let j = 0; j < 6; j++) {
      const a = A[6][j];
      if (a) for (let i = 0; i < n; i++) ynew[i] += dir * h * a * k[j][i];
    }
    const sc = scale(y, ynew);
    let err = 0;
    for (let i = 0; i < n; i++) {
      let e = 0;
      for (let j = 0; j < 7; j++) e += E[j] * k[j][i];
      err += ((h * e) / sc[i]) ** 2;
    }
    err = Math.sqrt(err / n);
    if (!Number.isFinite(err) || ynew.some((v) => !Number.isFinite(v))) {
      if (h < 1e-12 * Math.max(1, Math.abs(t))) {
        stopped = 'non-finite';
        break;
      }
      h /= 10;
      rejected++;
      continue;
    }
    if (err <= 1) {
      const tnew = t + dir * h;
      hmin = Math.min(hmin, h);
      hmaxSeen = Math.max(hmaxSeen, h);
      const dense: Dense = {
        t0: t,
        h: dir * h,
        r: [
          y.slice(),
          ynew.map((v, i) => v - y[i]),
          [],
          [],
          [],
        ],
      };
      dense.r[2] = k[0].map((v, i) => dir * h * v - dense.r[1][i]);
      dense.r[3] = dense.r[1].map((v, i) => v - dir * h * k[6][i] - dense.r[2][i]);
      dense.r[4] = y.map((_, i) => {
        let s = 0;
        for (let j = 0; j < 7; j++) s += D[j] * k[j][i];
        return dir * h * s;
      });
      // events on this step
      let stopAt: EventHit | null = null;
      (opts.events ?? []).forEach((ev, ei) => {
        const gNew = ev.g(tnew, ynew);
        const gOld = gPrev[ei];
        const rising = gOld < 0 && gNew >= 0;
        const falling = gOld > 0 && gNew <= 0;
        const want = ev.direction ?? 0;
        if ((rising && want >= 0) || (falling && want <= 0)) {
          const te = locate((tt) => ev.g(tt, denseAt(dense, tt)), t, tnew, gOld, gNew);
          const hit = { index: ei, t: te, y: denseAt(dense, te) };
          events.push(hit);
          if (ev.terminal && (!stopAt || dir * (te - stopAt.t) < 0)) stopAt = hit;
        }
        gPrev[ei] = gNew;
      });
      if (tEval) {
        const end = stopAt ? (stopAt as EventHit).t : tnew;
        while (evalIdx < tEval.length && dir * (tEval[evalIdx] - end) <= 0) {
          T.push(tEval[evalIdx]);
          Y.push(denseAt(dense, tEval[evalIdx]));
          evalIdx++;
        }
      }
      accepted++;
      if (stopAt) {
        const hit = stopAt as EventHit;
        if (keep) {
          T.push(hit.t);
          Y.push(hit.y.slice());
        }
        t = hit.t;
        y = hit.y.slice();
        stopped = 'event';
        break;
      }
      t = tnew;
      y = ynew;
      k1 = k[6];
      if (keep) {
        T.push(t);
        Y.push(y.slice());
      }
      const fac = err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * err ** -0.2));
      h = Math.min(h * fac, hmaxAbs);
    } else {
      rejected++;
      h *= Math.max(0.2, 0.9 * err ** -0.25);
    }
    if (h < 1e-12 * Math.max(1, Math.abs(t))) {
      stopped = 'step-collapse';
      break;
    }
  }
  return {
    t: T,
    y: Y,
    events,
    stats: {
      accepted,
      rejected,
      fevals,
      hmin: Number.isFinite(hmin) ? hmin : 0,
      hmax: hmaxSeen,
      stopped,
      method: `Dormand–Prince 5(4), adaptive, rtol ${rtol}, atol ${atol}`,
    },
  };
}

/** A zero of g on [a, b] given g(a)·g(b) ≤ 0: Illinois-modified regula falsi, to machine precision in t. */
function locate(g: (t: number) => number, a: number, b: number, ga: number, gb: number): number {
  if (ga === 0) return a;
  if (gb === 0) return b;
  let side = 0;
  for (let it = 0; it < 80; it++) {
    const c = (a * gb - b * ga) / (gb - ga);
    const gc = g(c);
    if (gc === 0 || Math.abs(b - a) <= 4 * Number.EPSILON * Math.max(1, Math.abs(c))) return c;
    if (gc * gb < 0) {
      a = b;
      ga = gb;
      b = c;
      gb = gc;
      side = 0;
    } else {
      b = c;
      gb = gc;
      if (side === 1) ga /= 2;
      side = 1;
    }
  }
  return (a + b) / 2;
}

/** Classical RK4 with a fixed step; returns every step. */
export function rk4(f: RHS, t0: number, y0: readonly number[], t1: number, dt: number): { t: number[]; y: number[][] } {
  const steps = Math.max(1, Math.round(Math.abs(t1 - t0) / Math.abs(dt)));
  const h = (t1 - t0) / steps;
  const T = [t0];
  const Y = [y0.slice()];
  let y = y0.slice();
  let t = t0;
  for (let s = 0; s < steps; s++) {
    const k1 = f(t, y);
    const k2 = f(t + h / 2, y.map((v, i) => v + (h / 2) * k1[i]));
    const k3 = f(t + h / 2, y.map((v, i) => v + (h / 2) * k2[i]));
    const k4 = f(t + h, y.map((v, i) => v + h * k3[i]));
    y = y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    t = t0 + (s + 1) * h;
    T.push(t);
    Y.push(y.slice());
  }
  return { t: T, y: Y };
}
