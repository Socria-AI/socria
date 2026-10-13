// lib/accuracy/numeric-check.ts
//
// THE ARITHMETIC UNDER EVERY VERDICT.
//
// A claim is checked by computing, never by asking a model whether it looks
// right. Two expressions are compared by evaluating both at fixed points; an
// integral is a quadrature; a limit is approached from both sides; a solution
// is substituted back. Everything here evaluates through the same compiler
// the graphs use (lib/logos-math.ts), with the same real-valued powers
// (lib/real-power.ts), so a claim about x^(2/3) at x = −8 is judged by the
// same arithmetic that draws the curve.
//
// WHAT "EQUAL" MEANS HERE, HONESTLY. Two expressions that agree at nineteen
// unrelated points, to seven significant figures, across two settings of any
// parameter, are the same function for every expression a reply contains —
// an analytic function cannot agree with a different one at that many generic
// points by accident. It is still evidence rather than a proof, and the docs
// say so (docs/ACCURACY.md). DIFFERENT is the strong direction: one point
// where they disagree is a counterexample, and it is reported with the point.
//
// The points avoid integers, simple fractions and multiples of π/2, where
// tan, sec, csc, cot, log and 1/x have their poles; a pole that does land near
// one is dropped as non-comparable, never counted as a disagreement.
//
// PURE.

import { compileExpr } from '@/lib/logos-math';
import { allRoots } from '@/lib/numeric/roots';
import { fractionOf } from '@/lib/real-power';

export type Scope = Record<string, number>;
export type Evaluator = (scope: Scope) => number;

/** Where an expression is compared. Away from 0, ±1, ±π/2, ±π, ±3π/2, ±2π. */
export const POINTS: readonly number[] = [
  -3.71, -2.93, -2.17, -1.61, -1.13, -0.67, -0.29, 0.31, 0.53, 0.87, 1.21, 1.43, 1.97, 2.41, 2.83, 3.37, 4.19, 5.3, 7.9,
];

/** Two settings for every other name in an expression, so a parameter cannot cancel by luck. */
const PARAMS: readonly number[][] = [
  [1.37, 0.83, 2.29, 0.61, 1.73, 2.71, 0.47, 1.19],
  [0.71, 1.91, 0.57, 2.13, 1.07, 0.39, 2.47, 1.61],
];

/** Compile a grammar string over the given names, or null. */
export function compile(grammar: string, names: readonly string[]): Evaluator | null {
  const c = compileExpr(grammar, [...names]);
  return c ? c.eval : null;
}

/** A numeric expression with no free names, evaluated, or null. */
export function evalNumber(grammar: string): number | null {
  const c = compileExpr(grammar, []);
  if (!c || c.vars.length) return null;
  const v = c.eval({});
  return Number.isFinite(v) ? v : null;
}

export interface Agreement {
  verdict: 'equal' | 'differ' | 'unknown';
  /** how many points both sides were finite at */
  compared: number;
  /** the first point they disagree at, for the reply to quote */
  witness?: { at: Scope; a: number; b: number };
  /** b ÷ a when that is the same number everywhere it was compared */
  ratio?: number;
  /** b − a when that is the same number everywhere it was compared */
  offset?: number;
  /** one side is defined at points where the other is not */
  partial?: boolean;
}

const BIG = 1e9;

/** Every scope a comparison runs over: each point, under each parameter setting. */
export function scopes(main: string, params: readonly string[]): Scope[] {
  const sets = params.length ? PARAMS : [[]];
  const out: Scope[] = [];
  for (const set of sets) {
    for (const x of POINTS) {
      const s: Scope = { [main]: x };
      params.forEach((p, i) => (s[p] = set[i % set.length]));
      out.push(s);
    }
  }
  return out;
}

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * Do two expressions describe the same function?
 *
 * `a` is the reference (computed), `b` the claim. Points where either side is
 * not finite, or is enormous (beside a pole), are skipped; fewer than five
 * comparable points and nothing is decided.
 */
export function agree(a: Evaluator, b: Evaluator, main: string, params: readonly string[], tol = 1e-7): Agreement {
  let compared = 0;
  let disagree = 0;
  let oneSided = 0;
  let witness: Agreement['witness'];
  const ratios: number[] = [];
  const offsets: number[] = [];
  for (const s of scopes(main, params)) {
    const va = a(s);
    const vb = b(s);
    const fa = Number.isFinite(va) && Math.abs(va) < BIG;
    const fb = Number.isFinite(vb) && Math.abs(vb) < BIG;
    if (fa !== fb) oneSided++;
    if (!fa || !fb) continue;
    compared++;
    offsets.push(vb - va);
    if (Math.abs(va) > 1e-9) ratios.push(vb / va);
    if (!close(va, vb, tol)) {
      disagree++;
      witness ??= { at: s, a: va, b: vb };
    }
  }
  const constant = (xs: number[]) => (xs.length >= 4 && xs.every((x) => close(x, xs[0], 1e-6)) ? xs[0] : undefined);
  const base = { compared, ...(oneSided ? { partial: true } : {}) };
  if (compared < 5) return { verdict: 'unknown', ...base };
  if (disagree === 0) return { verdict: 'equal', ...base };
  if (disagree >= 2 && disagree >= 0.25 * compared) {
    const ratio = constant(ratios);
    const offset = constant(offsets);
    return {
      verdict: 'differ',
      ...base,
      ...(witness ? { witness } : {}),
      ...(ratio !== undefined ? { ratio } : {}),
      ...(offset !== undefined ? { offset } : {}),
    };
  }
  return { verdict: 'unknown', ...base };
}

/** A number as a person would write it: a short fraction when it is one, otherwise six figures. */
export function show(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : 'undefined';
  if (Math.abs(v) < 1e-12) return '0';
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
  // A short decimal that is exactly the number (0.53, 2.5) stays a decimal;
  // a repeating one that is a short fraction (1/3, 2/3) is written as one.
  const dec = String(Number(v.toPrecision(6)));
  if (Number(dec) === v) return dec;
  const f = fractionOf(v, 1000);
  if (f && f.q > 1 && Math.abs(f.p / f.q - v) < 1e-12 * Math.max(1, Math.abs(v))) return `${f.p}/${f.q}`;
  return dec;
}

// ── quadrature ─────────────────────────────────────────────────────────

// Gauss–Kronrod 7–15 (QUADPACK's qk15). The nodes are interior, so an
// integrable singularity AT an endpoint (1/√x on [0, 1]) is never evaluated.
const XGK = [
  0.991455371120812639206854697526329, 0.949107912342758524526189684047851,
  0.864864423359769072789712788640926, 0.741531185599394439863864773280788,
  0.586087235467691130294144845693013, 0.405845151377397166906606412076961,
  0.207784955007898467600689403773245, 0,
];
const WGK = [
  0.022935322010529224963732008058970, 0.063092092629978553290700663189204,
  0.104790010322250183839876322541518, 0.140653259715525918745189590510238,
  0.169004726639267902826583426598550, 0.190350578064785409913256402421014,
  0.204432940075298892414161999234649, 0.209482141084727828012999174891714,
];
const WG = [0.129484966168869693270611432679082, 0.279705391489276667901467771423780, 0.381830050505118944950369775488975, 0.417959183673469387755102040816327];

function gk15(f: (x: number) => number, a: number, b: number): { k: number; err: number } | null {
  const c = (a + b) / 2;
  const h = (b - a) / 2;
  const fc = f(c);
  if (!Number.isFinite(fc)) return null;
  let k = fc * WGK[7];
  let g = fc * WG[3];
  for (let j = 0; j < 7; j++) {
    const dx = h * XGK[j];
    const f1 = f(c - dx);
    const f2 = f(c + dx);
    if (!Number.isFinite(f1) || !Number.isFinite(f2)) return null;
    k += WGK[j] * (f1 + f2);
    if (j % 2 === 1) g += WG[(j - 1) / 2] * (f1 + f2);
  }
  return { k: k * h, err: Math.abs((k - g) * h) };
}

/**
 * Tanh–sinh (double-exponential) quadrature: nodes crowd towards both ends
 * so fast that an integrable singularity AT an endpoint costs nothing — ∫₀¹
 * 1/√x comes out to 2 to machine precision, where adaptive Gauss–Kronrod
 * stalls a few digits short and would have "refuted" an exact answer of 2.
 * Points beside the endpoints are computed from the complement, so they never
 * round onto the endpoint itself. Null when successive halvings do not agree.
 */
function tanhSinh(f: (x: number) => number, a: number, b: number): number | null {
  const half = (b - a) / 2;
  const at = (t: number): number => {
    const u = (Math.PI / 2) * Math.sinh(t);
    const c = Math.cosh(u);
    const w = ((Math.PI / 2) * Math.cosh(t)) / (c * c);
    if (!(w > 0) || !Number.isFinite(w)) return 0;
    // x' measured from the nearer endpoint, without cancellation
    const e = Math.exp(-2 * Math.abs(u));
    const off = (b - a) * (e / (1 + e));
    const x = u < 0 ? a + off : b - off;
    if (x <= a || x >= b) return 0;
    const v = f(x);
    return Number.isFinite(v) ? v * w : NaN;
  };
  let h = 1;
  let sum = at(0);
  for (let k = 1; k <= 40; k++) {
    const p = at(k * h) + at(-k * h);
    if (Number.isNaN(p)) return null;
    sum += p;
    if (k > 3 && Math.abs(p) < 1e-18 * Math.max(1, Math.abs(sum))) break;
  }
  let prev = sum * h * half;
  for (let level = 1; level <= 9; level++) {
    h /= 2;
    // only the new, odd-numbered nodes
    for (let k = 1; k <= 40 * (1 << level); k += 2) {
      const p = at(k * h) + at(-k * h);
      if (Number.isNaN(p)) return null;
      sum += p;
      if (k * h > 4.5) break;
    }
    const cur = sum * h * half;
    if (Math.abs(cur - prev) <= 1e-12 * Math.max(1, Math.abs(cur))) return cur;
    prev = cur;
  }
  return null;
}

/**
 * ∫_a^b f, or null when it does not converge — a pole inside the interval,
 * an oscillation too fast to resolve, a value that will not settle. Never a
 * number it does not believe. Tanh–sinh first; adaptive Gauss–Kronrod when
 * that does not settle.
 */
export function integrate(f: (x: number) => number, a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a === b) return 0;
  if (a > b) {
    const v = integrate(f, b, a);
    return v === null ? null : -v;
  }
  const ts = tanhSinh(f, a, b);
  const gk = adaptiveGk(f, a, b);
  // Both converged: they must agree, or neither is believed.
  if (ts !== null && gk !== null) return Math.abs(ts - gk) <= 1e-6 * Math.max(1, Math.abs(ts)) ? ts : null;
  return ts ?? gk;
}

function adaptiveGk(f: (x: number) => number, a: number, b: number): number | null {
  const stack: [number, number, number][] = [[a, b, 0]];
  let total = 0;
  let pieces = 0;
  while (stack.length) {
    const [lo, hi, depth] = stack.pop()!;
    const r = gk15(f, lo, hi);
    if (!r) return null;
    const scale = Math.max(1e-10, Math.abs(r.k));
    if (r.err <= 1e-10 * scale || r.err <= 1e-13 || hi - lo < 1e-9 * (b - a)) {
      total += r.k;
      continue;
    }
    if (depth > 40 || ++pieces > 4000) return null;
    const mid = (lo + hi) / 2;
    stack.push([lo, mid, depth + 1], [mid, hi, depth + 1]);
  }
  return Number.isFinite(total) ? total : null;
}

// ── limits ─────────────────────────────────────────────────────────────

export type Limit = { kind: 'finite'; value: number } | { kind: 'infinite'; sign: 1 | -1 } | { kind: 'none' };

/**
 * The limit of f at `at` from one side (+1 from above, −1 from below), or at
 * ±∞, approached along a geometric sequence. `none` when it does not settle:
 * an oscillation, a slow divergence, a value still moving at the last step.
 * Null when f cannot be evaluated near the point at all.
 */
export function limitFrom(f: (x: number) => number, at: number, side: 1 | -1): Limit | null {
  const xs: number[] = [];
  if (!Number.isFinite(at)) {
    for (const p of [2, 3, 4, 5, 6]) xs.push((at > 0 ? 1 : -1) * Math.pow(10, p));
  } else {
    const scale = Math.max(1, Math.abs(at));
    for (const p of [2, 3, 4, 5]) xs.push(at + side * scale * Math.pow(10, -p));
  }
  const vs = xs.map(f);
  if (vs.some((v) => Number.isNaN(v))) return null;
  const last = vs[vs.length - 1];
  const prev = vs[vs.length - 2];
  // Growing without bound: every step bigger than the last, and big by the end.
  const growing = vs.every((v, i) => i === 0 || (Math.abs(v) >= 2 * Math.abs(vs[i - 1]) && Math.sign(v) === Math.sign(vs[i - 1])));
  if ((growing && Math.abs(last) > 1e3) || !Number.isFinite(last)) return { kind: 'infinite', sign: last > 0 ? 1 : -1 };
  const step = Math.abs(last - prev);
  const before = Math.abs(prev - vs[vs.length - 3]);
  if (step <= 1e-4 * Math.max(1, Math.abs(last)) && step <= before * 1.5 + 1e-12) return { kind: 'finite', value: last };
  return { kind: 'none' };
}

/** A two-sided limit, which exists only when both sides agree. */
export function limitAt(f: (x: number) => number, at: number): Limit | null {
  if (!Number.isFinite(at)) return limitFrom(f, at, at > 0 ? -1 : 1);
  const lo = limitFrom(f, at, -1);
  const hi = limitFrom(f, at, 1);
  if (!lo || !hi) return lo ?? hi ?? null;
  if (lo.kind === 'finite' && hi.kind === 'finite') {
    return close(lo.value, hi.value, 1e-3) ? { kind: 'finite', value: (lo.value + hi.value) / 2 } : { kind: 'none' };
  }
  if (lo.kind === 'infinite' && hi.kind === 'infinite' && lo.sign === hi.sign) return lo;
  return { kind: 'none' };
}

// ── roots ──────────────────────────────────────────────────────────────

/**
 * The real solutions of f(x) = 0 on a window, polished and snapped to a short
 * fraction when they are one. The window is part of the answer: a periodic
 * equation has infinitely many, and a polynomial's may lie outside it, so the
 * caller says which window was searched.
 */
export function realRoots(f: (x: number) => number, lo: number, hi: number): number[] {
  const roots = allRoots(f, lo, hi, { samples: 8000 });
  return roots.map((r) => {
    const f2 = fractionOf(r.x, 1000);
    if (f2 && Math.abs(f2.p / f2.q - r.x) < 1e-9 * Math.max(1, Math.abs(r.x))) return f2.p / f2.q;
    return r.x;
  });
}
