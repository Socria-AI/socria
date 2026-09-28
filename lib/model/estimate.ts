// lib/model/estimate.ts
//
// FITTING A SPECIFICATION TO DATA — the arithmetic, and none of the judgement.
//
// THE RULE THIS FILE EXISTS TO ENFORCE. An economist told us the thing that
// matters most here: the researcher chooses the method, from theory, and a
// product that answers "what model should I use?" by picking one has taken the
// part that was the research. So `estimate` REFUSES to choose. With no method
// declared it returns the candidates, what each one needs, what each one assumes
// and what each one gives — and stops. With a method declared it does the
// arithmetic exactly and reports what it did.
//
// That is not obstruction. Explaining the alternatives, exposing an assumption,
// computing the fit, showing the residuals, comparing two specifications and
// pointing out that a variable is collinear are all help. Deciding that this is a
// fixed-effects panel question rather than a time-series one is not help; it is
// the answer to somebody else's question.
//
// WHAT IS REAL IN HERE. Ordinary least squares by Gaussian elimination with
// partial pivoting on the normal equations, classical and HC1 standard errors,
// R² and adjusted R², residual standard error, the within transform for unit
// fixed effects, and lag construction for a time-series specification. Every
// number returned was computed from the supplied data. There are no p-values
// fabricated from a distribution nobody checked, no significance stars, and no
// causal language anywhere — a fitted coefficient is a conditional association
// and this file never says otherwise.
//
// WHAT IS NOT IN HERE, and is not pretended to be: instrumental variables,
// clustered or Driscoll–Kraay errors, random effects, GLS, ARIMA, cointegration,
// any test statistic with a critical value. They are absences, listed, not
// silent gaps — see `UNSUPPORTED`.
//
// PURE: arrays in, numbers out.

import type { DataBlock, EstimationDecl, Model, ModelObject } from './schema';
import type { Missing } from './system';

/** Cap on what one fit may chew through, because a slider is attached. */
export const FIT_CAPS = { rows: 20_000, terms: 24 } as const;

export interface Term {
  name: string;
  /** the estimate */
  value: number;
  /** its standard error, on the basis named by `se` */
  se: number;
  /** value / se. Reported as such, with no threshold implied. */
  t: number;
  /**
   * A 95% interval on the normal approximation, and ONLY when there are enough
   * degrees of freedom for that approximation to be reasonable. Below that it is
   * absent rather than wrong — an interval computed from a distribution nobody
   * checked is fabricated precision, which is the failure this whole layer is
   * built against.
   */
  ci95?: [number, number];
}

export interface Fit {
  method: 'ols' | 'ols-fe' | 'ols-lag';
  /** what it says it is, in one line, for a caption or a provenance entry */
  says: string;
  terms: Term[];
  n: number;
  /** number of estimated coefficients, including the intercept */
  k: number;
  /** residual degrees of freedom */
  df: number;
  r2: number;
  adjR2: number;
  /** residual standard error */
  sigma: number;
  residuals: number[];
  fitted: number[];
  /** the y actually used, after any transform or row dropping */
  y: number[];
  se: 'classical' | 'HC1';
  /** rows left out, and why — never silently */
  dropped: { rows: number; why: string } | null;
  /** what a reader should know before trusting it */
  warnings: string[];
  /** units the fit ran in, when the data block says */
  units?: string;
}

export const UNSUPPORTED = [
  'instrumental variables and two-stage least squares',
  'clustered, Newey–West or Driscoll–Kraay standard errors',
  'random effects and GLS',
  'ARIMA, unit-root and cointegration testing',
  'any hypothesis test with a critical value',
] as const;

// ── linear algebra, only as much as is needed ───────────────────────

/** Solve A x = b for symmetric positive-definite-ish A. Null when A is singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (!f) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** The inverse of a small symmetric matrix, for the covariance of the estimates. */
function invert(A: number[][]): number[][] | null {
  const n = A.length;
  const out: number[][] = [];
  for (let j = 0; j < n; j++) {
    const e = Array.from({ length: n }, (_, i) => (i === j ? 1 : 0));
    const col = solve(A, e);
    if (!col) return null;
    out.push(col);
  }
  // `out` is built by columns; transpose into rows.
  return out[0].map((_, i) => out.map((col) => col[i]));
}

const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

// ── the estimator ───────────────────────────────────────────────────

export interface OlsOptions {
  intercept?: boolean;
  robust?: boolean;
  /** extra degrees of freedom spent elsewhere — the units absorbed by a within transform */
  spent?: number;
  method?: Fit['method'];
  says?: string;
  names?: string[];
}

/**
 * Ordinary least squares, done properly and reported honestly.
 *
 * β = (X′X)⁻¹X′y by elimination rather than by inverting anything twice; the
 * covariance is σ²(X′X)⁻¹, or the HC1 sandwich when asked. A singular X′X is
 * REFUSED — two columns carrying the same information have no separate
 * coefficients, and returning numbers for them anyway is the most common way a
 * regression lies.
 */
export function ols(
  y: readonly number[],
  X: readonly number[][],
  opts: OlsOptions = {}
): { ok: true; fit: Fit } | { ok: false; why: string } {
  const withIntercept = opts.intercept !== false;
  const rows = Math.min(y.length, X.length, FIT_CAPS.rows);
  if (!rows) return { ok: false, why: 'there are no observations to fit' };
  const cols = (X[0]?.length ?? 0) + (withIntercept ? 1 : 0);
  if (!cols) return { ok: false, why: 'there are no regressors' };
  if (cols > FIT_CAPS.terms) return { ok: false, why: `more than ${FIT_CAPS.terms} terms is past what this fits` };
  if (rows <= cols) {
    return { ok: false, why: `${rows} observations cannot identify ${cols} coefficients` };
  }

  const design: number[][] = [];
  const yy: number[] = [];
  let dropped = 0;
  for (let i = 0; i < rows; i++) {
    const row = withIntercept ? [1, ...X[i]] : [...X[i]];
    if (!Number.isFinite(y[i]) || row.some((v) => !Number.isFinite(v))) {
      dropped++;
      continue;
    }
    design.push(row);
    yy.push(y[i]);
  }
  const n = yy.length;
  if (n <= cols) return { ok: false, why: `only ${n} usable observations for ${cols} coefficients` };

  const XtX: number[][] = Array.from({ length: cols }, (_, a) =>
    Array.from({ length: cols }, (_, b) => design.reduce((s, r) => s + r[a] * r[b], 0))
  );
  const Xty = Array.from({ length: cols }, (_, a) => design.reduce((s, r, i) => s + r[a] * yy[i], 0));
  const beta = solve(
    XtX.map((r) => [...r]),
    [...Xty]
  );
  if (!beta) {
    return {
      ok: false,
      why: 'the regressors are collinear — two or more carry the same information, so they have no separate coefficients',
    };
  }

  const fitted = design.map((r) => dot(r, beta));
  const residuals = yy.map((v, i) => v - fitted[i]);
  const ybar = yy.reduce((s, v) => s + v, 0) / n;
  const tss = yy.reduce((s, v) => s + (v - ybar) ** 2, 0);
  const rss = residuals.reduce((s, e) => s + e * e, 0);
  const spent = Math.max(0, Math.floor(opts.spent ?? 0));
  const df = n - cols - spent;
  const sigma2 = df > 0 ? rss / df : NaN;
  const inv = invert(XtX.map((r) => [...r]));
  if (!inv) return { ok: false, why: 'the design matrix could not be inverted, so no standard errors exist' };

  let cov: number[][];
  if (opts.robust) {
    // HC1: (X′X)⁻¹ (Σ eᵢ² xᵢxᵢ′) (X′X)⁻¹, scaled by n/(n−k).
    const meat: number[][] = Array.from({ length: cols }, () => Array(cols).fill(0));
    for (let i = 0; i < n; i++) {
      const e2 = residuals[i] ** 2;
      for (let a = 0; a < cols; a++) for (let b = 0; b < cols; b++) meat[a][b] += e2 * design[i][a] * design[i][b];
    }
    const scale = df > 0 ? n / df : 1;
    cov = inv.map((_row, a) =>
      inv.map((__, b) => {
        let s = 0;
        for (let p = 0; p < cols; p++) for (let q = 0; q < cols; q++) s += inv[a][p] * meat[p][q] * inv[q][b];
        return s * scale;
      })
    );
  } else {
    cov = inv.map((row) => row.map((v) => v * sigma2));
  }

  const names = opts.names ?? [];
  const label = (i: number) => {
    if (withIntercept && i === 0) return 'intercept';
    const j = withIntercept ? i - 1 : i;
    return names[j] ?? `x${j + 1}`;
  };

  const terms: Term[] = beta.map((value, i) => {
    const se = Math.sqrt(Math.max(0, cov[i][i]));
    const t = se > 0 ? value / se : NaN;
    // 1.96 is the normal quantile, and it is only used where the normal
    // approximation is defensible. Below thirty degrees of freedom the interval
    // is left OUT rather than computed from a distribution nobody checked.
    const ci95: [number, number] | undefined =
      df >= 30 && se > 0 ? [value - 1.96 * se, value + 1.96 * se] : undefined;
    return { name: label(i), value, se, t, ...(ci95 ? { ci95 } : {}) };
  });

  const warnings: string[] = [];
  if (df < 30) warnings.push(`${df} residual degrees of freedom: too few for the normal approximation, so no intervals are reported`);
  if (dropped) warnings.push(`${dropped} row${dropped === 1 ? '' : 's'} had a missing or non-finite value and were left out`);
  if (tss <= 0) warnings.push('the outcome does not vary, so R² is not defined');
  // Collinearity that is severe but not singular still deserves saying.
  const diag = inv.map((r, i) => r[i] * XtX[i][i]);
  const worst = Math.max(...diag.filter(Number.isFinite));
  if (worst > 10) warnings.push(`one regressor’s variance is inflated about ${worst.toFixed(0)}-fold by its correlation with the others`);

  const r2 = tss > 0 ? 1 - rss / tss : NaN;
  return {
    ok: true,
    fit: {
      method: opts.method ?? 'ols',
      says: opts.says ?? `least squares on ${n} observations`,
      terms,
      n,
      k: cols,
      df,
      r2,
      adjR2: tss > 0 && df > 0 ? 1 - (rss / df) / (tss / (n - 1)) : NaN,
      sigma: Math.sqrt(Math.max(0, sigma2)),
      residuals,
      fitted,
      y: yy,
      se: opts.robust ? 'HC1' : 'classical',
      dropped: dropped ? { rows: dropped, why: 'a missing or non-finite value in the row' } : null,
      warnings,
    },
  };
}

// ── what a method needs, and what it commits you to ─────────────────

export interface MethodCandidate {
  method: NonNullable<EstimationDecl['method']>;
  label: string;
  /** what the data must have for this to be possible */
  needs: string[];
  /** what choosing it commits you to believing */
  assumes: string[];
  /** what it gives back */
  gives: string;
}

export const METHODS: MethodCandidate[] = [
  {
    method: 'ols',
    label: 'Ordinary least squares',
    needs: ['one outcome column and one or more regressor columns', 'more rows than coefficients'],
    assumes: [
      'the relationship is linear in the parameters',
      'the errors are uncorrelated with the regressors — which is the assumption that decides whether the coefficient means anything beyond association',
      'the observations are comparable: no unit or period effects worth separating',
    ],
    gives: 'coefficients, standard errors, residuals and R² for one cross-section',
  },
  {
    method: 'ols-fe',
    label: 'Least squares with unit fixed effects (within)',
    needs: ['a column identifying the unit', 'more than one observation per unit for at least some units'],
    assumes: [
      'anything that differs between units and not over time is absorbed, and you are asking about variation WITHIN units',
      'the effect being estimated is the same across units',
      'the errors are uncorrelated with the regressors after demeaning',
    ],
    gives: 'within-unit coefficients, with the between-unit variation removed rather than explained',
  },
  {
    method: 'ols-lag',
    label: 'Least squares with lags of the outcome',
    needs: ['a column identifying the period, in order', 'enough periods to lose the first few to the lags'],
    assumes: [
      'the past enters only through the lags you included',
      'the series is stable enough that one set of coefficients describes the whole of it',
      'the errors are not themselves autocorrelated once the lags are in — which this does not test',
    ],
    gives: 'coefficients on the lags and the regressors, on the rows that survive lagging',
  },
];

export interface MethodChoice {
  /** what is being asked of the person, in their terms */
  says: string;
  candidates: MethodCandidate[];
  /** what the data appears to have, as evidence for THEIR decision, not ours */
  observed: string[];
  /** what this module cannot do at all, so the choice is made knowing it */
  unsupported: readonly string[];
}

// ── reading columns out of a data block ─────────────────────────────

function columnsOf(block: DataBlock | undefined): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  if (!block) return out;
  if (block.t && block.v) {
    out.t = [...block.t];
    out.v = [...block.v];
  }
  if (block.points?.length) {
    out.x = block.points.map((p) => p[0]);
    out.y = block.points.map((p) => p[1]);
    out.z = block.points.map((p) => p[2]);
  }
  // Named columns, which is how a real table arrives.
  for (const [k, v] of Object.entries(block.columns ?? {})) {
    if (Array.isArray(v) && v.every((n) => typeof n === 'number')) out[k] = [...v];
  }
  return out;
}

/**
 * Fit the specification an object declares — or hand the methodological choice
 * back to the person, which is the more important half of this function.
 */
export function estimate(
  model: Model,
  o: ModelObject
):
  | { ok: true; fit: Fit }
  | { ok: false; missing: Missing[] }
  | { ok: false; choice: MethodChoice } {
  const decl = o.estimation;
  if (!decl) {
    return { ok: false, missing: [{ what: 'a specification', unlocks: 'fitting: which column is the outcome, which are the regressors, and which data block they are in' }] };
  }
  const block = model.data?.[decl.data];
  const cols = columnsOf(block);
  const missing: Missing[] = [];
  if (!block) {
    missing.push({ what: `the data block “${decl.data}”`, unlocks: 'any estimate at all' });
    return { ok: false, missing };
  }
  const need = (name: string, why: string) => {
    if (!cols[name]?.length) missing.push({ what: `a column “${name}”`, unlocks: why });
  };
  need(decl.y, 'the outcome to explain');
  for (const x of decl.x) need(x, 'a regressor in the specification');
  if (decl.method === 'ols-fe') need(decl.unit ?? '', 'the unit each observation belongs to');
  if (decl.method === 'ols-lag') need(decl.time ?? '', 'the period each observation belongs to');
  if (missing.length) return { ok: false, missing };

  // THE CHOICE IS THEIRS. No method declared means no estimate: the candidates
  // and what the data appears to be come back instead.
  if (!decl.method) {
    const observed: string[] = [];
    const n = cols[decl.y].length;
    observed.push(`${n} rows and ${decl.x.length} regressor${decl.x.length === 1 ? '' : 's'}`);
    if (decl.unit && cols[decl.unit]) {
      const units = new Set(cols[decl.unit]).size;
      observed.push(`${units} distinct values in “${decl.unit}”, so it could be treated as a panel`);
    }
    if (decl.time && cols[decl.time]) {
      const periods = new Set(cols[decl.time]).size;
      observed.push(`${periods} distinct values in “${decl.time}”, so it has a time dimension`);
    }
    return {
      ok: false,
      choice: {
        says:
          'Which method, and why? The specification is the part that decides what the estimate means, so it is yours to choose — tell me the method and I will fit it exactly and show you what it does and does not support.',
        candidates: METHODS,
        observed,
        unsupported: UNSUPPORTED,
      },
    };
  }

  const yRaw = cols[decl.y];
  const xNames = [...decl.x];
  let y = [...yRaw];
  let X = yRaw.map((_, i) => decl.x.map((c) => cols[c][i]));
  let spent = 0;
  let says = '';
  let droppedWhy = '';

  if (decl.method === 'ols-fe') {
    // THE WITHIN TRANSFORM. Each unit's mean is subtracted from its own rows, so
    // whatever is fixed about a unit leaves the estimate — which is the point of
    // the method and also its cost: the coefficient is now about variation
    // WITHIN units and says nothing about differences between them.
    const unit = cols[decl.unit!];
    const groups = new Map<number, number[]>();
    unit.forEach((u, i) => {
      const list = groups.get(u);
      if (list) list.push(i);
      else groups.set(u, [i]);
    });
    const yOut: number[] = [];
    const xOut: number[][] = [];
    for (const rows of groups.values()) {
      const ym = rows.reduce((s, i) => s + y[i], 0) / rows.length;
      const xm = xNames.map((_, j) => rows.reduce((s, i) => s + X[i][j], 0) / rows.length);
      for (const i of rows) {
        yOut.push(y[i] - ym);
        xOut.push(X[i].map((v, j) => v - xm[j]));
      }
    }
    y = yOut;
    X = xOut;
    spent = groups.size;
    says = `least squares with ${groups.size} unit fixed effects, on within-unit variation`;
    droppedWhy = 'units with a single observation contribute nothing after demeaning';
  } else if (decl.method === 'ols-lag') {
    // Lags of the outcome, in the order the time column gives. The first rows
    // are lost, which is reported rather than absorbed.
    const time = cols[decl.time!];
    const order = time.map((t, i) => [t, i] as const).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    const L = Math.max(1, Math.min(12, decl.lags ?? 1));
    const yOut: number[] = [];
    const xOut: number[][] = [];
    for (let p = L; p < order.length; p++) {
      const i = order[p];
      const lagged = Array.from({ length: L }, (_, l) => y[order[p - l - 1]]);
      yOut.push(y[i]);
      xOut.push([...lagged, ...X[i]]);
    }
    for (let l = 0; l < L; l++) xNames.unshift(`${decl.y}(t−${l + 1})`);
    y = yOut;
    X = xOut;
    says = `least squares with ${L} lag${L === 1 ? '' : 's'} of ${decl.y}, on ${yOut.length} of ${order.length} periods`;
    droppedWhy = `the first ${L} period${L === 1 ? '' : 's'} have no lag to use`;
  } else {
    says = `ordinary least squares on ${y.length} observations`;
  }

  const fitted = ols(y, X, {
    intercept: decl.intercept !== false && decl.method !== 'ols-fe',
    robust: decl.robust,
    spent,
    method: decl.method,
    says,
    names: xNames,
  });
  if (!fitted.ok) {
    return { ok: false, missing: [{ what: 'a fit', unlocks: fitted.why }] };
  }
  const fit = fitted.fit;
  if (droppedWhy && decl.method === 'ols-lag') {
    fit.warnings.unshift(droppedWhy);
  }
  if (decl.method === 'ols-fe') {
    fit.warnings.unshift(
      'the coefficients are within-unit: anything that differs between units and not over time has been removed, not explained'
    );
    if (droppedWhy) fit.warnings.push(droppedWhy);
  }
  if (block.units) fit.units = block.units;
  // The one sentence this module will not let a caller forget.
  fit.warnings.push(
    'a fitted coefficient is a conditional association; whether it is an effect depends on the assumptions you chose, not on the fit'
  );
  return { ok: true, fit };
}

/**
 * Two fits, compared.
 *
 * WHY THIS IS HERE AND NOT IN A VIEW. "What changed between these two
 * specifications" is a question about numbers, and answering it in a renderer
 * means answering it differently in each renderer. The comparison is computed
 * once, and every view shows the same one.
 */
export function compareFits(a: Fit, b: Fit): {
  says: string;
  terms: { name: string; from: number | null; to: number | null; change: number | null }[];
  r2: { from: number; to: number };
  n: { from: number; to: number };
} {
  const names = [...new Set([...a.terms.map((t) => t.name), ...b.terms.map((t) => t.name)])];
  const terms = names.map((name) => {
    const from = a.terms.find((t) => t.name === name)?.value ?? null;
    const to = b.terms.find((t) => t.name === name)?.value ?? null;
    return { name, from, to, change: from !== null && to !== null ? to - from : null };
  });
  const gone = terms.filter((t) => t.to === null).map((t) => t.name);
  const added = terms.filter((t) => t.from === null).map((t) => t.name);
  const bits = [`${a.method} → ${b.method}`];
  if (added.length) bits.push(`added ${added.join(', ')}`);
  if (gone.length) bits.push(`dropped ${gone.join(', ')}`);
  bits.push(`R² ${a.r2.toFixed(3)} → ${b.r2.toFixed(3)} on ${a.n} → ${b.n} observations`);
  return { says: bits.join('; '), terms, r2: { from: a.r2, to: b.r2 }, n: { from: a.n, to: b.n } };
}
