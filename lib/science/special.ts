// lib/science/special.ts
//
// The handful of special functions the statistics need, written out:
//
//   lgamma         ln Γ(x), Lanczos (g = 7, n = 9): ~15 significant digits
//   digamma, trigamma   ψ(x), ψ′(x): recurrence up to x ≥ 6, then asymptotic series
//   normalCdf, normalSf, normalQuantile   Φ, 1 − Φ (tail-accurate via erfc), Φ⁻¹ (Acklam + one Newton step)
//   gammaP, gammaQ the regularised incomplete gamma (series / continued fraction)
//   chiSquareSf    P(X > x) for X ~ χ²(k)
//
// PURE.

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lgamma(x: number): number {
  if (!(x > 0)) {
    if (Number.isInteger(x)) return Infinity;
    // reflection: Γ(x)Γ(1−x) = π / sin(πx)
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  }
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export function digamma(x: number): number {
  let r = 0;
  while (x < 6) {
    r -= 1 / x;
    x += 1;
  }
  const f = 1 / (x * x);
  return r + Math.log(x) - 0.5 / x - f * (1 / 12 - f * (1 / 120 - f * (1 / 252 - f * (1 / 240 - f / 132))));
}

export function trigamma(x: number): number {
  let r = 0;
  while (x < 6) {
    r += 1 / (x * x);
    x += 1;
  }
  const f = 1 / (x * x);
  return r + 1 / x + f / 2 + (f / x) * (1 / 6 - f * (1 / 30 - f * (1 / 42 - f / 30)));
}

/** erfc(x), with relative accuracy ~1.2e-7 everywhere (Numerical Recipes' Chebyshev fit). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z - 1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? r : 2 - r;
}

export const normalCdf = (z: number) => 0.5 * erfc(-z / Math.SQRT2);
/** 1 − Φ(z), accurate in the far tail where 1 − normalCdf would round to 0. */
export const normalSf = (z: number) => 0.5 * erfc(z / Math.SQRT2);

/** Φ⁻¹(p) (Acklam's rational approximation, refined by one Newton step). */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  let x: number;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - lo) {
    const q = p - 0.5, r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/** The regularised lower incomplete gamma P(a, x). */
export function gammaP(a: number, x: number): number {
  if (!(x > 0)) return 0;
  if (x < a + 1) {
    let sum = 1 / a, del = sum, ap = a;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return Math.min(1, sum * Math.exp(-x + a * Math.log(x) - lgamma(a)));
  }
  return 1 - gammaQ(a, x);
}

/** The regularised upper incomplete gamma Q(a, x) = 1 − P(a, x), by continued fraction where that converges. */
export function gammaQ(a: number, x: number): number {
  if (!(x > 0)) return 1;
  if (x < a + 1) return 1 - gammaP(a, x);
  const tiny = 1e-300;
  let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.max(0, Math.exp(-x + a * Math.log(x) - lgamma(a)) * h);
}

/** P(X > x) for X ~ χ²(k). */
export const chiSquareSf = (x: number, k: number) => gammaQ(k / 2, x / 2);
