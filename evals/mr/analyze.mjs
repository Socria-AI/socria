// evals/mr/analyze.mjs — THE STATISTICS, KEPT HONEST.
//
// Small, dependency-free, deterministic: a seeded bootstrap for confidence
// intervals, paired differences by scenario (or by participant, for real
// data), and a label on every comparison saying what kind of evidence it is.
//
//   simulation     a fixed simulated assistant (sim-model.mjs): differences
//                  describe the CONTROL PLANE's effect on that simulator —
//                  not a model's behaviour, not a person's
//   randomized     units assigned to arms by lib/mr/experiment.ts with
//                  consent: a difference is an estimate of a causal effect
//                  on what was measured, within its confidence interval
//   observational  anything else: an association, never a cause
//
// Used by run.mjs on simulated runs, and written to be pointed at a consented
// research export (lib/mr/research.ts) later — the same functions, a
// different label.

/** mulberry32: a tiny seeded PRNG, so the same data always gives the same interval. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
export const median = (xs) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * A percentile bootstrap interval for the mean. NaN-free inputs only.
 * n < 2 gives the value and no interval (lo and hi NaN): resampling one value
 * returns that value every time, and "[1.00, 1.00]" would read as certainty.
 */
export function bootstrapCI(xs, { iters = 2000, alpha = 0.05, seed = 7 } = {}) {
  const vals = xs.filter((x) => Number.isFinite(x));
  const n = vals.length;
  if (!n) return { mean: NaN, lo: NaN, hi: NaN, n: 0 };
  if (n === 1) return { mean: vals[0], lo: NaN, hi: NaN, n: 1 };
  const r = rng(seed);
  const means = [];
  for (let i = 0; i < iters; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += vals[Math.floor(r() * n)];
    means.push(s / n);
  }
  means.sort((a, b) => a - b);
  const lo = means[Math.floor((alpha / 2) * iters)];
  const hi = means[Math.min(iters - 1, Math.floor((1 - alpha / 2) * iters))];
  return { mean: mean(vals), lo, hi, n };
}

/** Paired differences b − a over the keys both have (scenarios, or participants). */
export function pairedDiff(a, b, opts) {
  const keys = Object.keys(a).filter((k) => k in b && Number.isFinite(a[k]) && Number.isFinite(b[k]));
  return { ...bootstrapCI(keys.map((k) => b[k] - a[k]), opts), keys: keys.length };
}

/** Whether an interval excludes zero, in which direction. */
export function direction(ci) {
  if (!Number.isFinite(ci.lo) || !Number.isFinite(ci.hi)) return 'undetermined';
  if (ci.lo > 0) return 'higher';
  if (ci.hi < 0) return 'lower';
  return 'includes_zero';
}

export const DESIGN_NOTES = {
  simulation:
    'SIMULATION. A deterministic simulated assistant stands in for the model. Differences describe the effect of MR\'s control plane on that simulator — what it instructs and what it enforces in code. They are not evidence about a real model\'s behaviour, and not evidence that anybody\'s thinking, learning or autonomy changed.',
  randomized:
    'RANDOMIZED. Units were assigned to arms by a stable salted hash with consent (lib/mr/experiment.ts). A difference estimates the effect of the arm on the measured quantity, within its interval — on that population, those tasks and that version.',
  observational: 'OBSERVATIONAL. Not randomized: any difference is an association and may be confounded. No causal claim.',
};

/** Fold per-run metrics into per-arm summaries with intervals. */
export function summarizeArms(runs, metrics, { seed = 7 } = {}) {
  const arms = [...new Set(runs.map((r) => r.arm))];
  const out = {};
  for (const arm of arms) {
    const rs = runs.filter((r) => r.arm === arm);
    out[arm] = {};
    for (const m of metrics) out[arm][m] = bootstrapCI(rs.map((r) => r.metrics[m]).filter((x) => x !== null && x !== undefined), { seed });
  }
  return out;
}
