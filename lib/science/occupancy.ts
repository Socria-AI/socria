// lib/science/occupancy.ts
//
// PRESENCE WHEN DETECTION IS IMPERFECT (single-season occupancy, after
// MacKenzie et al. 2002):
//
//   zᵢ ~ Bernoulli(ψᵢ)            is site i occupied?
//   yᵢⱼ | zᵢ ~ Bernoulli(zᵢ pᵢⱼ)    was it detected on survey j?
//
// "Not seen" is not "absent": a site visited three times with p = 0.3 is
// missed altogether a third of the time even when occupied ((1 − 0.3)³ ≈ 0.34).
// Repeated surveys are what separate the two probabilities; with a single
// visit per site they are not identifiable, and this module says so rather
// than returning a number.
//
// ψ and p each take a logit-linear model in covariates (site covariates for
// ψ, survey covariates for p), fitted by maximum likelihood (BFGS on the
// logit scale), with standard errors from the observed information and 95%
// intervals transformed back to the probability scale.
//
// A survey not carried out is null — skipped, never a non-detection.
//
// PURE.

import { inverse } from '../numeric/linalg';
import { normalQuantile } from './special';
import type { Rng } from './random';

/** yᵢⱼ: 1 detected, 0 surveyed and not detected, null not surveyed */
export type History = readonly (0 | 1 | null)[];

export interface OccupancyData {
  histories: readonly History[];
  /** per site: covariate values for ψ (no intercept — it is added) */
  siteCovariates?: readonly (readonly number[])[];
  siteNames?: readonly string[];
  /** per site, per survey: covariate values for p (no intercept) */
  surveyCovariates?: readonly (readonly (readonly number[])[])[];
  surveyNames?: readonly string[];
}

export interface OccupancyFit {
  identifiable: boolean;
  reason?: string;
  psiNames: string[];
  pNames: string[];
  /** logit-scale coefficients and standard errors */
  psiCoef: number[];
  psiSe: number[];
  pCoef: number[];
  pSe: number[];
  /** at the covariates' zero (or with none): ψ and p, with 95% intervals */
  psi: { estimate: number; low: number; high: number };
  p: { estimate: number; low: number; high: number };
  /** the fraction of sites with at least one detection — biased low when p < 1 */
  naiveOccupancy: number;
  logLik: number;
  aic: number;
  converged: boolean;
  iterations: number;
  sites: number;
  surveys: number;
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const softplus = (x: number) => (x > 30 ? x : Math.log1p(Math.exp(x)));

function negLogLik(theta: readonly number[], d: OccupancyData, kPsi: number): number {
  let nll = 0;
  for (let i = 0; i < d.histories.length; i++) {
    const sc = d.siteCovariates?.[i] ?? [];
    let eta = theta[0];
    for (let c = 0; c < sc.length; c++) eta += theta[1 + c] * sc[c];
    const logPsi = -softplus(-eta), log1mPsi = -softplus(eta);
    let logDet = 0;
    let any = false;
    let surveyed = 0;
    const h = d.histories[i];
    for (let j = 0; j < h.length; j++) {
      const y = h[j];
      if (y === null || y === undefined) continue;
      surveyed++;
      const vc = d.surveyCovariates?.[i]?.[j] ?? [];
      let e = theta[kPsi];
      for (let c = 0; c < vc.length; c++) e += theta[kPsi + 1 + c] * vc[c];
      if (y === 1) {
        any = true;
        logDet += -softplus(-e);
      } else logDet += -softplus(e);
    }
    if (!surveyed) continue;
    // occupied and this history, or (for an all-zero history) unoccupied
    const ll = any ? logPsi + logDet : Math.log(Math.exp(logPsi + logDet) + Math.exp(log1mPsi));
    nll -= ll;
  }
  return nll;
}

function gradient(f: (t: number[]) => number, x: number[]): number[] {
  return x.map((_, i) => {
    const h = 1e-5 * Math.max(1, Math.abs(x[i]));
    const a = x.slice(), b = x.slice();
    a[i] += h;
    b[i] -= h;
    return (f(a) - f(b)) / (2 * h);
  });
}

function hessian(f: (t: number[]) => number, x: number[]): number[][] {
  const n = x.length;
  const H = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    const h = 1e-4 * Math.max(1, Math.abs(x[i]));
    const a = x.slice(), b = x.slice();
    a[i] += h;
    b[i] -= h;
    const ga = gradient(f, a), gb = gradient(f, b);
    for (let j = 0; j < n; j++) H[i][j] = (ga[j] - gb[j]) / (2 * h);
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) H[i][j] = H[j][i] = (H[i][j] + H[j][i]) / 2;
  return H;
}

/** BFGS with a backtracking line search. */
function bfgs(f: (t: number[]) => number, x0: number[], maxIter = 500): { x: number[]; fx: number; converged: boolean; iterations: number } {
  const n = x0.length;
  let x = x0.slice();
  let fx = f(x);
  let g = gradient(f, x);
  let Hinv: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let it = 0; it < maxIter; it++) {
    const gnorm = Math.sqrt(g.reduce((s, v) => s + v * v, 0));
    if (gnorm < 1e-6) return { x, fx, converged: true, iterations: it };
    const d = Hinv.map((r) => -r.reduce((s, v, j) => s + v * g[j], 0));
    let step = 1;
    let xn = x, fn = fx;
    const slope = d.reduce((s, v, i) => s + v * g[i], 0);
    for (let k = 0; k < 40; k++) {
      xn = x.map((v, i) => v + step * d[i]);
      fn = f(xn);
      if (Number.isFinite(fn) && fn <= fx + 1e-4 * step * slope) break;
      step /= 2;
    }
    const gn = gradient(f, xn);
    const s = xn.map((v, i) => v - x[i]);
    const y = gn.map((v, i) => v - g[i]);
    const sy = s.reduce((a, v, i) => a + v * y[i], 0);
    if (Math.abs(fn - fx) < 1e-12 * (Math.abs(fx) + 1) && step < 1e-8) return { x: xn, fx: fn, converged: true, iterations: it + 1 };
    if (sy > 1e-12) {
      const Hy = Hinv.map((r) => r.reduce((a, v, j) => a + v * y[j], 0));
      const yHy = y.reduce((a, v, i) => a + v * Hy[i], 0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        Hinv[i][j] += ((sy + yHy) * s[i] * s[j]) / (sy * sy) - (Hy[i] * s[j] + s[i] * Hy[j]) / sy;
      }
    }
    x = xn;
    fx = fn;
    g = gn;
  }
  return { x, fx, converged: false, iterations: maxIter };
}

export function fitOccupancy(d: OccupancyData): OccupancyFit {
  const S = d.histories.length;
  const J = Math.max(0, ...d.histories.map((h) => h.length));
  const kSite = d.siteCovariates?.[0]?.length ?? 0;
  const kSurvey = d.surveyCovariates?.[0]?.[0]?.length ?? 0;
  const psiNames = ['(Intercept)', ...(d.siteNames ?? Array.from({ length: kSite }, (_, c) => `site${c + 1}`))];
  const pNames = ['(Intercept)', ...(d.surveyNames ?? Array.from({ length: kSurvey }, (_, c) => `survey${c + 1}`))];
  const detectedSites = d.histories.filter((h) => h.some((y) => y === 1)).length;
  const surveyedSites = d.histories.filter((h) => h.some((y) => y !== null && y !== undefined)).length;
  const naive = surveyedSites ? detectedSites / surveyedSites : NaN;
  const repeated = d.histories.filter((h) => h.filter((y) => y !== null && y !== undefined).length >= 2).length;
  const blank = (reason: string): OccupancyFit => ({
    identifiable: false, reason, psiNames, pNames, psiCoef: [], psiSe: [], pCoef: [], pSe: [],
    psi: { estimate: NaN, low: NaN, high: NaN }, p: { estimate: NaN, low: NaN, high: NaN },
    naiveOccupancy: naive, logLik: NaN, aic: NaN, converged: false, iterations: 0, sites: S, surveys: J,
  });
  if (!repeated) return blank('no site was surveyed more than once: occupancy and detection cannot be told apart');
  if (!detectedSites) return blank('nothing was detected anywhere: detection probability cannot be estimated');
  const kPsi = 1 + kSite;
  const f = (t: number[]) => negLogLik(t, d, kPsi);
  const start = new Array(kPsi + 1 + kSurvey).fill(0);
  start[0] = Math.log(Math.max(0.05, Math.min(0.95, naive)) / (1 - Math.max(0.05, Math.min(0.95, naive))));
  const r = bfgs(f, start);
  const H = hessian(f, r.x);
  const cov = inverse(H);
  const se = r.x.map((_, i) => (cov && cov[i][i] > 0 ? Math.sqrt(cov[i][i]) : NaN));
  const q = normalQuantile(0.975);
  const back = (b: number, s: number) => ({ estimate: logistic(b), low: logistic(b - q * s), high: logistic(b + q * s) });
  const logLik = -r.fx;
  return {
    identifiable: true,
    psiNames, pNames,
    psiCoef: r.x.slice(0, kPsi), psiSe: se.slice(0, kPsi),
    pCoef: r.x.slice(kPsi), pSe: se.slice(kPsi),
    psi: back(r.x[0], se[0]),
    p: back(r.x[kPsi], se[kPsi]),
    naiveOccupancy: naive,
    logLik,
    aic: -2 * logLik + 2 * r.x.length,
    converged: r.converged,
    iterations: r.iterations,
    sites: S,
    surveys: J,
  };
}

/** The chance an occupied site goes undetected in every one of `surveys` visits. */
export const missedEntirely = (p: number, surveys: number) => (1 - p) ** surveys;

/**
 * Detection histories drawn from known ψ and p. SIMULATED — for tests and
 * teaching; never a stand-in for surveys that were not done.
 */
export function simulateOccupancy(r: Rng, opts: { sites: number; surveys: number; psi: number; p: number }) {
  const z = Array.from({ length: opts.sites }, () => r.bernoulli(opts.psi));
  const histories = z.map((occ) => Array.from({ length: opts.surveys }, () => (occ && r.bernoulli(opts.p) ? 1 : 0) as 0 | 1));
  return { z, histories };
}
