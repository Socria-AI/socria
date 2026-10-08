// lib/real-power.ts
//
// POWERS OF NEGATIVE NUMBERS, ANSWERED THE WAY MATHEMATICS IS TAUGHT.
//
// Math.pow(-8, 2/3) is NaN. JavaScript gives a negative base a real power only
// when the exponent is an integer, because in general (−8)^(2/3) is a complex
// number. But x^(2/3) written by a person means the real cube root, squared:
// defined for every x, even, with a cusp at the origin — and every evaluator
// in Socria went through Math.pow, so the plotter drew only its right half.
//
// The convention of every textbook and graphing tool, for an exponent that is
// a fraction p/q in lowest terms:
//
//   q odd    x^(p/q) is the real q-th root of x, raised to the p — real for
//            negative x too: (−8)^(1/3) = −2, (−8)^(2/3) = 4, (−8)^(−1/3) = −½
//   q even   no real value for x < 0: (−4)^(1/2), (−16)^(3/4)
//
// and an exponent that is no fraction at all (π, √2) has no real value for
// x < 0 either.
//
// THE FRACTION IS RECOVERED, NOT GUESSED. By the time a power is evaluated,
// 2/3 is the float 0.6666666666666666 — the structure is gone. But that float
// is the one nearest to exactly one fraction with a small denominator, and
// the continued-fraction expansion finds it. It is accepted only when it
// matches to within a few units in the last place, with a denominator of at
// most 10 000. So:
//
//   - an exponent written as a fraction is that fraction: 2/3, −1/3, 5/3;
//   - one computed from fractions is too — the 2/3 − 1 = −1/3 of a derivative;
//   - a typed decimal is the fraction it spells: 0.2 is 1/5 (odd, so real
//     for x < 0), 0.25 is 1/4 and 0.7 is 7/10 (even, so not);
//   - anything that is no such fraction (π, a fitted 0.6180339887) stays a
//     real power, defined for x ≥ 0 only.
//
// Integers never reach any of this: Math.pow already handles (−2)^3.
//
// PURE.

/** The largest denominator an exponent is recognised as a fraction with. */
export const MAX_DENOMINATOR = 10_000;

export interface Fraction {
  /** numerator, carrying the sign */
  p: number;
  /** denominator, positive; 1 for an integer */
  q: number;
}

/**
 * The fraction p/q (lowest terms, q ≤ maxDen) that `v` is the float for, or
 * null when there is none. Continued fractions give the best approximations in
 * order of denominator, so the first convergent within a few ulps of `v` is
 * the fraction — and in lowest terms, because convergents always are.
 */
export function fractionOf(v: number, maxDen = MAX_DENOMINATOR): Fraction | null {
  if (!Number.isFinite(v)) return null;
  if (Number.isInteger(v)) return { p: v, q: 1 };
  const x = Math.abs(v);
  // Past this every float is an integer or a fraction too fine to be meant.
  if (x > 1e9) return null;
  // A few units in the last place — enough for a fraction that went through an
  // operation or two (2/3 − 1), far too little to mistake one number for another.
  const tol = 8 * Number.EPSILON * x;
  let hm2 = 0;
  let hm1 = 1;
  let km2 = 1;
  let km1 = 0;
  let r = x;
  for (let i = 0; i < 48; i++) {
    const a = Math.floor(r);
    const h = a * hm1 + hm2;
    const k = a * km1 + km2;
    if (k > maxDen) return null;
    if (Math.abs(x - h / k) <= tol) return { p: v < 0 ? -h : h, q: k };
    const rest = r - a;
    if (!(rest > 0)) return null;
    r = 1 / rest;
    hm2 = hm1;
    hm1 = h;
    km2 = km1;
    km1 = k;
  }
  return null;
}

/** Is p/q in lowest terms with q odd — a power with a real value for every real base? */
function oddRoot(exp: number): Fraction | null {
  const f = fractionOf(exp);
  return f && f.q % 2 === 1 ? f : null;
}

/**
 * base^exp with the real-valued convention for rational exponents.
 *
 * Identical to Math.pow wherever Math.pow is real: a base ≥ 0, an integer
 * exponent, a non-finite operand. For a negative base and a fractional
 * exponent p/q with q odd it is (−1)^p · |base|^exp; with q even, or an
 * exponent that is no fraction, it is NaN — "no real value", which every
 * renderer already treats as "draw nothing here".
 */
export function realPow(base: number, exp: number): number {
  if (!(base < 0) || Number.isInteger(exp) || !Number.isFinite(exp)) return Math.pow(base, exp);
  const f = oddRoot(exp);
  if (!f) return NaN;
  const m = Math.pow(-base, exp);
  return f.p % 2 === 0 ? m : -m;
}

/**
 * A power evaluated over a whole column with one exponent: the fraction is
 * recovered once rather than at every entry. Same answers as realPow.
 */
export function realPowInto(base: ArrayLike<number>, exp: number, out: Float64Array): void {
  const n = out.length;
  if (Number.isInteger(exp) || !Number.isFinite(exp)) {
    for (let i = 0; i < n; i++) out[i] = Math.pow(base[i], exp);
    return;
  }
  const f = oddRoot(exp);
  const flip = !!f && f.p % 2 !== 0;
  for (let i = 0; i < n; i++) {
    const b = base[i];
    if (!(b < 0)) out[i] = Math.pow(b, exp);
    else if (!f) out[i] = NaN;
    else {
      const m = Math.pow(-b, exp);
      out[i] = flip ? -m : m;
    }
  }
}

/** Where x^exp has a real value: for every x, or only for x ≥ 0. */
export function powerDomain(exp: number): 'all' | 'nonnegative' {
  if (Number.isInteger(exp)) return 'all';
  return oddRoot(exp) ? 'all' : 'nonnegative';
}

/**
 * The convention, in words — for a model explaining a curve the plotter drew,
 * so its account of where the curve exists is the plotter's account. Fixed
 * text: a convention, never a result about anybody's function. Short lines,
 * because a picture's stated assumptions are each capped (lib/viz-model.ts).
 */
export const POWER_CONVENTION_LINES: readonly string[] = [
  'Powers here are real-valued: x^(p/q), with the fraction in lowest terms, is the real q-th root of x raised to the p.',
  'With q odd it is real for negative x too — (−8)^(1/3) = −2, (−8)^(2/3) = 4 — so x^(1/3), x^(2/3) and x^(−1/3) are drawn left of 0.',
  'With q even (x^(1/2), x^(3/4)), or an exponent that is no fraction at all (x^π), x < 0 has no real value and nothing is drawn there.',
  'A curve is never joined across a pole or a jump: a gap is where it has no real value, runs off to infinity, or jumps. Describe the curve as drawn.',
];

/** The same, as one paragraph. */
export const POWER_CONVENTION = POWER_CONVENTION_LINES.join(' ');
