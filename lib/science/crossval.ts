// lib/science/crossval.ts
//
// HOLDING DATA OUT, honestly.
//
// Nearby records resemble each other (spatial autocorrelation). Split them at
// random and every test point has a near-twin in training: the score measures
// memory of the neighbourhood, not prediction somewhere new. Blocked folds
// put whole spatial blocks on one side of the split, so the score answers the
// question a map is used for — how well does this predict where we did not
// look?
//
//   spatialBlocks   a block id per record, from a lat/lon grid
//   blockedFolds    whole blocks to k folds, balanced by record count, seeded
//   randomFolds     the naive split, for comparison
//   crossValidate   fit on k−1 folds, score the held-out one, every fold
//
// PURE (the shuffles take a seed).

import { rng } from './random';
import type { LatLon } from './geo';

export function spatialBlocks(points: readonly LatLon[], blockDeg: number): string[] {
  if (!(blockDeg > 0)) throw new Error('blockDeg must be positive');
  return points.map((p) => `${Math.floor(p.lat / blockDeg)}:${Math.floor(p.lon / blockDeg)}`);
}

function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const r = rng(seed);
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Fold per record (0…k−1): whole blocks assigned, largest first, each to the currently smallest fold. */
export function blockedFolds(blocks: readonly string[], k: number, seed = 1): number[] {
  const sizes = new Map<string, number>();
  for (const b of blocks) sizes.set(b, (sizes.get(b) ?? 0) + 1);
  if (sizes.size < k) throw new Error(`only ${sizes.size} blocks for ${k} folds: use smaller blocks or fewer folds`);
  // seeded order among equal sizes, then largest first
  const order = shuffled([...sizes.keys()], seed).sort((a, b) => sizes.get(b)! - sizes.get(a)!);
  const load = new Array(k).fill(0);
  const foldOf = new Map<string, number>();
  for (const b of order) {
    let f = 0;
    for (let i = 1; i < k; i++) if (load[i] < load[f]) f = i;
    foldOf.set(b, f);
    load[f] += sizes.get(b)!;
  }
  return blocks.map((b) => foldOf.get(b)!);
}

export function randomFolds(n: number, k: number, seed = 1): number[] {
  const idx = shuffled(Array.from({ length: n }, (_, i) => i), seed);
  const out = new Array(n).fill(0);
  idx.forEach((i, rank) => (out[i] = rank % k));
  return out;
}

export interface CvResult {
  perFold: { fold: number; n: number; score: number }[];
  mean: number;
  /** the spread of the fold scores, not a confidence interval */
  sd: number;
}

/**
 * Cross-validation over the given folds. `fitPredict` receives the training
 * and test row indices and returns predictions for the test rows, in order;
 * `score` compares truth and prediction for a fold.
 */
export function crossValidate(
  folds: readonly number[],
  fitPredict: (train: number[], test: number[]) => number[],
  truth: readonly number[],
  score: (y: number[], yhat: number[]) => number
): CvResult {
  const k = Math.max(...folds) + 1;
  const perFold: CvResult['perFold'] = [];
  for (let f = 0; f < k; f++) {
    const test = folds.map((v, i) => (v === f ? i : -1)).filter((i) => i >= 0);
    const train = folds.map((v, i) => (v !== f ? i : -1)).filter((i) => i >= 0);
    if (!test.length || !train.length) continue;
    const yhat = fitPredict(train, test);
    perFold.push({ fold: f, n: test.length, score: score(test.map((i) => truth[i]), yhat) });
  }
  const mean = perFold.reduce((s, x) => s + x.score, 0) / Math.max(1, perFold.length);
  const sd = Math.sqrt(perFold.reduce((s, x) => s + (x.score - mean) ** 2, 0) / Math.max(1, perFold.length - 1));
  return { perFold, mean, sd };
}

export const rmse = (y: number[], yhat: number[]) => Math.sqrt(y.reduce((s, v, i) => s + (v - yhat[i]) ** 2, 0) / Math.max(1, y.length));
