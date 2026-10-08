// lib/science/glm.ts
//
// COUNT REGRESSION, the way a field ecologist needs it:
//
//   log λᵢ = β₀ + β₁ x₁ᵢ + … + log(effortᵢ)      yᵢ ~ Poisson(λᵢ)
//
// fitted by iteratively reweighted least squares, with standard errors from
// the inverse Fisher information, deviance, AIC and Pearson dispersion. The
// effort offset turns a count into a rate per unit effort — meaningful only
// when effort was recorded comparably, which the caller must have checked
// (lib/science/ecology.ts helps).
//
// Counts are often more variable than Poisson allows. So:
//
//   negBinGlm    NB2: Var y = μ + μ²/θ, with θ estimated by maximum
//                likelihood (Newton on the profile score, as MASS's theta.ml)
//   overdispersion  Pearson φ, the excess of zeros over what the fitted means
//                predict, and the likelihood-ratio test of Poisson within NB
//                (on the boundary: half a χ²₁ tail)
//
// Nothing here decides what a covariate means. A coefficient is 'modeled'
// (lib/science/provenance.ts) and comes with its uncertainty or not at all.
//
// PURE.

import { inverse, solve } from '../numeric/linalg';
import { chiSquareSf, digamma, lgamma, normalQuantile, normalSf, trigamma } from './special';

export interface GlmFit {
  family: 'poisson' | 'negbin';
  names: string[];
  coef: number[];
  se: number[];
  z: number[];
  p: number[];
  /** 95% Wald intervals on the link (log) scale */
  ci: [number, number][];
  mu: number[];
  n: number;
  k: number;
  df: number;
  logLik: number;
  deviance: number;
  nullDeviance: number;
  aic: number;
  /** Pearson χ² / residual df */
  dispersion: number;
  converged: boolean;
  iterations: number;
  offset: boolean;
  /** NB2 size parameter and its standard error */
  theta?: number;
  thetaSe?: number;
  warnings: string[];
}

export interface GlmOptions {
  offset?: readonly number[];
  names?: readonly string[];
  maxIter?: number;
  tol?: number;
}

function checkCounts(y: readonly number[]) {
  for (const v of y) {
    if (!(Number.isFinite(v) && v >= 0 && Number.isInteger(v))) throw new Error(`counts must be non-negative whole numbers; got ${v}`);
  }
}

/** A design matrix from named columns, with an intercept first unless asked not to. */
export function design(columns: Record<string, readonly number[]>, opts: { intercept?: boolean } = {}): { X: number[][]; names: string[] } {
  const names = Object.keys(columns);
  const n = names.length ? columns[names[0]].length : 0;
  const withI = opts.intercept !== false;
  const X = Array.from({ length: n }, (_, i) => [...(withI ? [1] : []), ...names.map((c) => columns[c][i])]);
  return { X, names: [...(withI ? ['(Intercept)'] : []), ...names] };
}

/** One weighted least-squares step: β = (XᵀWX)⁻¹ XᵀWz, and the inverse for the covariance. */
function wls(X: readonly number[][], w: readonly number[], z: readonly number[]): { beta: number[] | null; XtWXinv: number[][] | null } {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    const xi = X[i], wi = w[i];
    for (let r = 0; r < k; r++) {
      b[r] += xi[r] * wi * z[i];
      for (let c = r; c < k; c++) A[r][c] += xi[r] * wi * xi[c];
    }
  }
  for (let r = 0; r < k; r++) for (let c = 0; c < r; c++) A[r][c] = A[c][r];
  const beta = solve(A, b);
  return { beta, XtWXinv: beta ? inverse(A) : null };
}

const xlogy = (x: number, y: number) => (x === 0 ? 0 : x * Math.log(y));

function poissonDeviance(y: readonly number[], mu: readonly number[]) {
  let d = 0;
  for (let i = 0; i < y.length; i++) d += 2 * (xlogy(y[i], y[i] / mu[i]) - (y[i] - mu[i]));
  return d;
}

function nbLogLik(y: readonly number[], mu: readonly number[], theta: number) {
  let ll = 0;
  for (let i = 0; i < y.length; i++) {
    ll += lgamma(y[i] + theta) - lgamma(theta) - lgamma(y[i] + 1) + theta * Math.log(theta / (theta + mu[i])) + xlogy(y[i], mu[i] / (theta + mu[i]));
  }
  return ll;
}

function finish(
  family: GlmFit['family'],
  X: readonly number[][],
  y: readonly number[],
  beta: number[],
  cov: number[][] | null,
  mu: number[],
  extra: { offset: boolean; names: string[]; iterations: number; converged: boolean; theta?: number; thetaSe?: number; logLik: number; deviance: number; nullDeviance: number; warnings: string[] }
): GlmFit {
  const n = y.length, k = beta.length;
  const se = cov ? cov.map((r, i) => Math.sqrt(Math.max(0, r[i]))) : beta.map(() => NaN);
  const z = beta.map((b, i) => b / se[i]);
  const p = z.map((v) => (Number.isFinite(v) ? 2 * normalSf(Math.abs(v)) : NaN));
  const q = normalQuantile(0.975);
  const ci = beta.map((b, i) => [b - q * se[i], b + q * se[i]] as [number, number]);
  const variance = (m: number) => (family === 'poisson' ? m : m + (m * m) / extra.theta!);
  let pearson = 0;
  for (let i = 0; i < n; i++) pearson += (y[i] - mu[i]) ** 2 / variance(mu[i]);
  const params = k + (family === 'negbin' ? 1 : 0);
  return {
    family,
    names: extra.names,
    coef: beta,
    se,
    z,
    p,
    ci,
    mu,
    n,
    k,
    df: n - k,
    logLik: extra.logLik,
    deviance: extra.deviance,
    nullDeviance: extra.nullDeviance,
    aic: -2 * extra.logLik + 2 * params,
    dispersion: n > k ? pearson / (n - k) : NaN,
    converged: extra.converged,
    iterations: extra.iterations,
    offset: extra.offset,
    ...(extra.theta !== undefined ? { theta: extra.theta, thetaSe: extra.thetaSe } : {}),
    warnings: extra.warnings,
  };
}

/** IRLS for a log-link GLM with variance function V(μ) = μ + μ²/θ (θ = ∞ is Poisson). */
function irls(X: readonly number[][], y: readonly number[], off: readonly number[], theta: number, start: number[] | null, maxIter: number, tol: number) {
  const n = y.length;
  let mu = start ? X.map((xi, i) => Math.exp(xi.reduce((s, v, j) => s + v * start[j], 0) + off[i])) : y.map((v) => v + 0.1);
  let beta: number[] = start ?? new Array(X[0].length).fill(0);
  let cov: number[][] | null = null;
  let dev = Infinity;
  let converged = false;
  let it = 0;
  for (; it < maxIter; it++) {
    const w = mu.map((m) => (Number.isFinite(theta) ? m / (1 + m / theta) : m));
    const zz = mu.map((m, i) => Math.log(m) - off[i] + (y[i] - m) / m);
    const step = wls(X, w, zz);
    if (!step.beta) return { beta, cov: null, mu, converged: false, iterations: it, singular: true };
    beta = step.beta;
    cov = step.XtWXinv;
    mu = X.map((xi, i) => Math.exp(Math.min(700, xi.reduce((s, v, j) => s + v * beta[j], 0) + off[i])));
    let d = 0;
    for (let i = 0; i < n; i++) {
      d += Number.isFinite(theta)
        ? 2 * (xlogy(y[i], y[i] / mu[i]) - (y[i] + theta) * Math.log((y[i] + theta) / (mu[i] + theta)))
        : 2 * (xlogy(y[i], y[i] / mu[i]) - (y[i] - mu[i]));
    }
    if (Math.abs(d - dev) < tol * (Math.abs(d) + 0.1)) {
      dev = d;
      converged = true;
      it++;
      break;
    }
    dev = d;
  }
  return { beta, cov, mu, converged, iterations: it, singular: false };
}

/** Poisson regression with a log link and an optional offset (log effort). */
export function poissonGlm(X: readonly number[][], y: readonly number[], opts: GlmOptions = {}): GlmFit {
  checkCounts(y);
  if (!X.length || X.length !== y.length) throw new Error('X and y must have the same number of rows');
  const off = opts.offset ? [...opts.offset] : new Array(y.length).fill(0);
  if (off.some((o) => !Number.isFinite(o))) throw new Error('the offset must be finite — log of a positive effort');
  const names = opts.names ? [...opts.names] : X[0].map((_, j) => `x${j}`);
  const r = irls(X, y, off, Infinity, null, opts.maxIter ?? 50, opts.tol ?? 1e-10);
  const warnings: string[] = [];
  if (r.singular) warnings.push('the design is singular: a covariate is constant or a combination of others');
  if (!r.converged) warnings.push('IRLS did not converge — look for separation (a covariate that perfectly predicts zeros)');
  let logLik = 0;
  for (let i = 0; i < y.length; i++) logLik += xlogy(y[i], r.mu[i]) - r.mu[i] - lgamma(y[i] + 1);
  // the null model: intercept and offset only
  const sumY = y.reduce((s, v) => s + v, 0);
  const sumE = off.reduce((s, o) => s + Math.exp(o), 0);
  const muNull = off.map((o) => (Math.exp(o) * sumY) / sumE);
  return finish('poisson', X, y, r.beta, r.cov, r.mu, {
    offset: !!opts.offset, names, iterations: r.iterations, converged: r.converged, logLik,
    deviance: poissonDeviance(y, r.mu), nullDeviance: poissonDeviance(y, muNull), warnings,
  });
}

/** Negative binomial (NB2) regression: IRLS for β alternating with ML for θ. */
export function negBinGlm(X: readonly number[][], y: readonly number[], opts: GlmOptions = {}): GlmFit {
  const pois = poissonGlm(X, y, opts);
  const off = opts.offset ? [...opts.offset] : new Array(y.length).fill(0);
  const names = pois.names;
  // moment start for θ
  const n = y.length;
  let mu = pois.mu;
  let s = 0;
  for (let i = 0; i < n; i++) s += ((y[i] - mu[i]) ** 2 - mu[i]) / (mu[i] * mu[i]);
  let theta = s > 0 ? n / s : 1e6;
  let beta = pois.coef;
  let cov: number[][] | null = null;
  let converged = false;
  let outer = 0;
  const warnings: string[] = [];
  let ll = -Infinity;
  for (; outer < 50; outer++) {
    const r = irls(X, y, off, theta, beta, opts.maxIter ?? 50, opts.tol ?? 1e-10);
    if (r.singular) {
      warnings.push('the design is singular');
      break;
    }
    beta = r.beta;
    cov = r.cov;
    mu = r.mu;
    // θ by Newton on the score, on the log scale for stability
    for (let it = 0; it < 50; it++) {
      let score = 0, info = 0;
      for (let i = 0; i < n; i++) {
        score += digamma(y[i] + theta) - digamma(theta) + Math.log(theta) + 1 - Math.log(theta + mu[i]) - (y[i] + theta) / (theta + mu[i]);
        info += -(trigamma(y[i] + theta) - trigamma(theta) + 1 / theta - 2 / (theta + mu[i]) + (y[i] + theta) / (theta + mu[i]) ** 2);
      }
      // Newton in log θ: d/dlogθ = θ·score
      const g = theta * score;
      const h = -(theta * theta * info) + g;
      let step = h !== 0 ? -g / h : 0;
      if (!Number.isFinite(step)) break;
      step = Math.max(-2, Math.min(2, step));
      theta = Math.min(1e8, Math.max(1e-8, theta * Math.exp(step)));
      if (Math.abs(step) < 1e-10) break;
    }
    const next = nbLogLik(y, mu, theta);
    if (Math.abs(next - ll) < 1e-9 * (Math.abs(next) + 1)) {
      ll = next;
      converged = r.converged;
      outer++;
      break;
    }
    ll = next;
  }
  let info = 0;
  for (let i = 0; i < n; i++) info += -(trigamma(y[i] + theta) - trigamma(theta) + 1 / theta - 2 / (theta + mu[i]) + (y[i] + theta) / (theta + mu[i]) ** 2);
  const thetaSe = info > 0 ? Math.sqrt(1 / info) : NaN;
  const meanMu = mu.reduce((a, m) => a + m, 0) / Math.max(1, n);
  // μ²/θ negligible beside μ: the extra variance NB adds is under a thousandth of the Poisson part
  if (theta > 1000 * Math.max(1, meanMu)) warnings.push('θ is very large: there is no overdispersion for NB to model; Poisson suffices');
  if (!converged) warnings.push('the negative binomial fit did not converge');
  let dev = 0;
  for (let i = 0; i < n; i++) dev += 2 * (xlogy(y[i], y[i] / mu[i]) - (y[i] + theta) * Math.log((y[i] + theta) / (mu[i] + theta)));
  return finish('negbin', X, y, beta, cov, mu, {
    offset: !!opts.offset, names, iterations: outer, converged, theta, thetaSe, logLik: ll,
    deviance: dev, nullDeviance: pois.nullDeviance, warnings,
  });
}

/** Is a Poisson fit's variance believable? */
export function overdispersion(fit: GlmFit, y: readonly number[], nb?: GlmFit) {
  const expectedZeros = fit.mu.reduce((s, m) => s + Math.exp(-m), 0);
  const observedZeros = y.filter((v) => v === 0).length;
  const lr = nb ? Math.max(0, 2 * (nb.logLik - fit.logLik)) : null;
  return {
    dispersion: fit.dispersion,
    overdispersed: fit.dispersion > 1.5,
    zeros: { observed: observedZeros, expected: expectedZeros, ratio: expectedZeros > 0 ? observedZeros / expectedZeros : null },
    /** Poisson is NB at θ = ∞, on the boundary: the p-value is half the χ²₁ tail */
    lrTest: lr === null ? null : { statistic: lr, p: 0.5 * chiSquareSf(lr, 1) },
  };
}

/** Likelihood-ratio test of a smaller model nested in a larger one. */
export function lrTest(small: GlmFit, big: GlmFit) {
  const stat = Math.max(0, 2 * (big.logLik - small.logLik));
  const df = big.k + (big.family === 'negbin' ? 1 : 0) - (small.k + (small.family === 'negbin' ? 1 : 0));
  return { statistic: stat, df, p: df > 0 ? chiSquareSf(stat, df) : NaN };
}
