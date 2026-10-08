// lib/science/sensitivity.ts
//
// HOW MUCH DOES THE ANSWER MOVE when an input moves?
//
//   derivative, elasticity   ∂y/∂x and ∂ln y/∂ln x at a point, by central
//                            differences on whatever function computes y
//   oneAtATime               each input swept across its stated range with the
//                            others held: the data behind a tornado chart
//   linearTrend              y = a + b x by least squares with the slope's
//                            standard error and 95% interval — e.g. a timing
//                            (day of year) against a temperature, where b is
//                            "days per degree"
//
// A sensitivity is a property of a MODEL. When the model is a regression on
// observational data, b is an association: it is reported with its interval
// and that word, never as what warming does.
//
// PURE.

import { normalQuantile } from './special';

export function derivative(f: (x: number) => number, x: number, h?: number): number {
  const step = h ?? 1e-5 * Math.max(1, Math.abs(x));
  return (f(x + step) - f(x - step)) / (2 * step);
}

/** ∂ln y/∂ln x: the percent change in y per percent change in x. */
export function elasticity(f: (x: number) => number, x: number): number {
  const y = f(x);
  if (!(x !== 0 && y !== 0)) return NaN;
  return (derivative(f, x) * x) / y;
}

export function oneAtATime<P extends Record<string, number>>(
  f: (p: P) => number,
  base: P,
  ranges: Partial<Record<keyof P, readonly [number, number]>>,
  steps = 11
) {
  const y0 = f(base);
  const out: { input: keyof P; low: number; high: number; yLow: number; yHigh: number; swing: number; curve: { x: number; y: number }[] }[] = [];
  for (const key of Object.keys(ranges) as (keyof P)[]) {
    const [lo, hi] = ranges[key]!;
    const curve = Array.from({ length: steps }, (_, i) => {
      const x = lo + ((hi - lo) * i) / (steps - 1);
      return { x, y: f({ ...base, [key]: x }) };
    });
    const yLow = curve[0].y, yHigh = curve[curve.length - 1].y;
    out.push({ input: key, low: lo, high: hi, yLow, yHigh, swing: Math.abs(yHigh - yLow), curve });
  }
  out.sort((a, b) => b.swing - a.swing);
  return { baseline: y0, inputs: out };
}

export function linearTrend(x: readonly number[], y: readonly number[]) {
  const pairs = x.map((v, i) => [v, y[i]] as const).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const n = pairs.length;
  if (n < 3) throw new Error('at least three paired values are needed for a slope with an interval');
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, sxy = 0;
  for (const [a, b] of pairs) {
    sxx += (a - mx) ** 2;
    sxy += (a - mx) * (b - my);
  }
  if (!(sxx > 0)) throw new Error('x does not vary: no slope can be estimated');
  const b = sxy / sxx;
  const a = my - b * mx;
  let rss = 0;
  for (const [u, v] of pairs) rss += (v - (a + b * u)) ** 2;
  const sigma2 = rss / (n - 2);
  const seB = Math.sqrt(sigma2 / sxx);
  const seA = Math.sqrt(sigma2 * (1 / n + (mx * mx) / sxx));
  // normal quantile: adequate for the sample sizes this is used at; small n is said by n
  const q = normalQuantile(0.975);
  return {
    n,
    intercept: a,
    slope: b,
    seIntercept: seA,
    seSlope: seB,
    slopeCi: [b - q * seB, b + q * seB] as [number, number],
    residualSd: Math.sqrt(sigma2),
    predict: (x0: number) => ({ value: a + b * x0, se: Math.sqrt(sigma2 * (1 / n + (x0 - mx) ** 2 / sxx)) }),
    reading: 'association in the data, not a causal effect',
  };
}
