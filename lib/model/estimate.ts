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

import type { DataBlock, EstimationDecl, Model, ModelObject, Provenance } from './schema';
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
    if (withIntercept && i === 0) return INTERCEPT;
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
  const block = decl.data ? model.data?.[decl.data] : undefined;
  const cols = columnsOf(block);
  const missing: Missing[] = [];
  if (!block) {
    // NAMED PRECISELY, because the two cases are different states of the work
    // and a person reading this should be able to tell which they are in. No
    // data block at all means the specification is written and nothing has
    // been measured yet; a named block that is not there means something was
    // meant to be attached and is not.
    missing.push(
      decl.data
        ? { what: `the data block “${decl.data}”`, unlocks: 'any estimate at all' }
        : {
            what: `observations — ${[decl.y, ...decl.x].join(', ')} for each case`,
            unlocks: 'estimating the coefficients. Until then the specification stands and its coefficients are symbols, which is a real state and not a failure',
          }
    );
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
    // THE REASON GOES IN `what`, BECAUSE `what` IS THE HALF THAT IS SHOWN.
    //
    // This said `what: 'a fit'` and put the real explanation in `unlocks` — and
    // the pre-draw guard (compile.ts) reports `what` and discards `unlocks`, so
    // the picture read "not computed — it needs a fit", which answers "why is
    // there no fit?" with "because it needs a fit". The estimator already knows
    // the specific obstruction: one observation cannot identify two
    // coefficients, a regressor with no variation, columns of different lengths.
    return {
      ok: false,
      missing: [
        {
          what: 'a fit',
          because: fitted.why,
          unlocks: 'the coefficients, their standard errors and the fitted relationship',
        },
      ],
    };
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

// ── a specification as objects ──────────────────────────────────────

/**
 * Turn a specification into the things it is made of.
 *
 * WHY THIS EXISTS. `Wage = β0 + β1·Education + u` has parts, and a person who
 * asked for a model wants to point at them: select the outcome, inspect a
 * coefficient, add a regressor, take one away. Before this the whole
 * specification was ONE object with a declaration inside it — so there was
 * nothing to select, nothing to rename, and nothing for the map to link to.
 * A mechanism has had this since it existed (`expand` in mechanism.ts) and so
 * does a gravitating system (`expandGravity`); this is the same move for the
 * third kind of declaration, and the pattern is now the rule rather than a
 * special case: a declaration is a compact way to write down objects, and the
 * engine unpacks it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not give a coefficient a value.
 * With no data the coefficients are SYMBOLS — that is what an unfitted
 * specification is — and a number here would be a fabricated estimate wearing
 * the engine's stamp. It also never writes a causal relation: a specification
 * says what is being explained by what, and `causes` is a claim about the
 * world that no amount of algebra establishes (see CAUSAL_RELATIONS in
 * schema.ts, which exists for exactly this).
 *
 * Idempotent, like the other expanders: expanding twice adds nothing.
 */
export function expandEstimation(model: Model): Model {
  const carriers = model.objects.filter((o) => !!o.estimation);
  if (!carriers.length) return model;

  const have = new Set(model.objects.map((o) => o.id));
  const added: ModelObject[] = [];
  /** a variable the person named, rather than anything Socria chose */
  const SPOKEN: Provenance = { origin: 'user', detail: 'named in the specification you gave' };

  for (const carrier of carriers) {
    const decl = carrier.estimation!;
    const fitted = decl.data ? estimate(model, carrier) : null;
    const terms = fitted && fitted.ok ? fitted.fit.terms : null;
    // Where a coefficient's value comes from, said once so every object below
    // agrees: a fit that ran, or nothing at all.
    const value = (name: string): number | undefined =>
      terms?.find((t) => t.name === name)?.value;
    const from: Provenance = terms
      ? { origin: 'computation', detail: `least squares on “${decl.data}” (${decl.method})` }
      : {
          // NOT 'inference'. Nobody guessed this coefficient — it is a symbol
          // the specification declares, and reading it as a proposal would
          // invite somebody to "confirm" a value that does not exist yet.
          origin: 'equation',
          detail: 'a symbol in the specification — nothing has been estimated',
        };

    const put = (o: ModelObject) => {
      if (!have.has(o.id)) added.push(o);
    };
    const wants = decl.intercept !== false;

    // The outcome.
    put({
      id: `${carrier.id}__y`,
      kind: 'variable',
      label: decl.y,
      meaning: `the outcome: what this specification explains`,
      relations: [{ to: carrier.id, as: 'contains', why: 'it is the dependent variable of this specification' }],
      meta: { spec: carrier.id, role: 'outcome', column: decl.y },
      provenance: SPOKEN,
    });

    // Each regressor, and the coefficient that carries it.
    decl.x.forEach((x, i) => {
      put({
        id: `${carrier.id}__x${i}`,
        kind: 'variable',
        label: x,
        meaning: 'an explanatory variable in this specification',
        relations: [
          { to: carrier.id, as: 'contains', why: 'it is one of the regressors of this specification' },
          // NOT `causes`. The specification relates them; whether one causes
          // the other is a separate claim needing assumptions this model does
          // not carry.
          {
            to: `${carrier.id}__y`,
            as: 'correlates-with',
            why: 'the specification relates them; it does not by itself establish that one causes the other',
          },
        ],
        meta: { spec: carrier.id, role: 'regressor', column: x, position: i },
        provenance: SPOKEN,
      });
      const b = `b${wants ? i + 1 : i}`;
      const beta = coefficientLabel(i, wants);
      put({
        id: `${carrier.id}__${b}`,
        kind: 'coefficient',
        label: beta,
        meaning: `how much ${decl.y} differs, in the fitted relationship, per unit of ${x} with the other regressors held where they are`,
        ...(value(x) !== undefined ? { defs: { value: String(value(x)) } } : {}),
        relations: [
          { to: `${carrier.id}__x${i}`, as: 'parameterizes', why: 'it is the coefficient on this variable' },
        ],
        meta: {
          spec: carrier.id,
          role: 'coefficient',
          on: x,
          ...(value(x) !== undefined ? { value: value(x) } : {}),
          // THE BINDING, CARRIED ON THE QUANTITY. symbolTable reads this to
          // find the control driving this coefficient, so the inspector, the
          // conversation, Trace and the evaluator all resolve the same thing.
          ...(decl.coefficients?.[x] ? { control: decl.coefficients[x] } : {}),
        },
        provenance: from,
      });
    });

    if (wants) {
      put({
        id: `${carrier.id}__b0`,
        kind: 'coefficient',
        label: 'β₀',
        meaning: `the intercept: fitted ${decl.y} where every regressor is zero, which is only meaningful where that is a case that could occur`,
        ...(value(INTERCEPT) !== undefined ? { defs: { value: String(value(INTERCEPT)) } } : {}),
        relations: [{ to: carrier.id, as: 'contains', why: 'it is the intercept of this specification' }],
        meta: {
        spec: carrier.id,
        role: 'intercept',
        ...(value(INTERCEPT) !== undefined ? { value: value(INTERCEPT) } : {}),
        ...(decl.coefficients?.intercept ? { control: decl.coefficients.intercept } : {}),
      },
        provenance: from,
      });
    }

    // ── THE PART THAT CAN BE EVALUATED WITHOUT ANY DATA AT ALL ─────
    //
    // THE FAILURE THIS ANSWERS. A wage equation with β₁ and β₂ set to
    // hypothetical values built correctly, refused to pretend it had been
    // estimated — correctly — and then drew nothing, announcing that nothing
    // in it computed. It was wrong: β₀ + β₁·education + β₂·experience is an
    // ordinary expression, and the sampler would have evaluated it the moment
    // anything asked. Nothing asked, because a specification's only registered
    // operation is `estimate` and `estimate` needs observations.
    //
    // NOT ESTIMATED IS NOT NOT COMPUTABLE. So the declaration also produces
    // the thing it can compute: a surface whose height is what the model says
    // the outcome is, over the regressors, at whatever coefficient values
    // exist. It routes to the sampler like any other expression, with no
    // knowledge anywhere that econometrics was involved.
    //
    // WHAT IT IS AND IS NOT. It is the model-implied DETERMINISTIC COMPONENT.
    // It is not the conditional expectation — that identification needs the
    // zero-conditional-mean assumption, which nobody here has stated — and it
    // is not a fit, a prediction or an observation. The label and the meaning
    // say so, and the fidelity is `model-derived`: computed from the model's
    // own equation and from nothing measured.
    //
    // A COEFFICIENT WITH NO VALUE LEAVES ITS NAME IN THE EXPRESSION. If a
    // control of that name exists the surface is manipulable through it; if
    // neither a value nor a control exists, the expression mentions a name the
    // sampler cannot bind and it reports exactly that one missing degree of
    // freedom. Nothing is invented to make it draw.
    const axes = decl.x.slice(0, 2);
    if (axes.length) {
      // Each coefficient resolves to a control (manipulable), then to a fitted
      // or user-set value, and otherwise stays as its own name so the gap is
      // reported rather than filled.
      // THE THREE DECLARED WAYS A COEFFICIENT GETS A VALUE, in the order that
      // lets a person override the model — and no fourth, guessing way. The
      // expression carries whichever name the binding resolves to, so what is
      // written is what can be evaluated.
      const coefficient = (i: number): string => {
        const b = `${carrier.id}__b${wants ? i + 1 : i}`;
        // 1. the declaration names a control for this regressor.
        const named = decl.coefficients?.[decl.x[i]];
        if (named && model.params.some((p) => p.id === named)) return named;
        // 2. a control whose id IS the canonical id.
        if (model.params.some((p) => p.id === b)) return b;
        // 3. a value the fit produced or an edit wrote.
        const v = value(decl.x[i]);
        if (v !== undefined) return String(v);
        const set = model.objects.find((o) => o.id === b)?.defs?.value;
        if (set) return set;
        // Unbound: the canonical name stays in the expression, and the sampler
        // reports it BY ITS DISPLAY NAME through the symbol table.
        return b;
      };
      const intercept = (): string => {
        const b = `${carrier.id}__b0`;
        if (!wants) return '0';
        const named = decl.coefficients?.intercept;
        if (named && model.params.some((p) => p.id === named)) return named;
        if (model.params.some((p) => p.id === b)) return b;
        const v = value(INTERCEPT);
        if (v !== undefined) return String(v);
        const set = model.objects.find((o) => o.id === b)?.defs?.value;
        if (set) return set;
        // A FIT THAT RAN AND REPORTED NO INTERCEPT GENUINELY HAS NONE — the
        // within transform removes it by construction. Leaving the symbol in
        // would put a name in the expression that nothing can bind, and the
        // sampler would report a missing value for something that is absent on
        // purpose rather than waiting to be chosen. Where no fit has run, the
        // symbol STAYS, because then it really is the remaining degree of
        // freedom and naming it is the whole point.
        return terms ? '0' : b;
      };

      // x and y are the axes; a third regressor and beyond are held at their
      // own coefficient's value only if somebody said where to hold them, and
      // otherwise contribute their symbol, which the sampler will report.
      // `slopeTerms`, NOT `terms`. It was `terms`, which SHADOWED the fit's own
      // `terms` a hundred lines up — so `intercept()`'s "has a fit run?" test
      // read an array of regressor strings that is always non-empty, and β₀
      // silently became 0 on a model nobody had fitted. The remaining degree of
      // freedom the whole feature exists to name was quietly filled in.
      const slopeTerms = decl.x.map((name, i) => {
        const c = coefficient(i);
        const at = i === 0 ? 'x' : i === 1 ? 'y' : name;
        return `(${c}) * ${at}`;
      });
      const expr = [intercept(), ...slopeTerms].join(' + ');

      // A THIRD REGRESSOR IS HELD, AND THE PICTURE HAS TO SAY SO.
      //
      // Two axes and four regressors means the other two sit at some value while
      // the surface is drawn, and only the first two vary. The expression already
      // carries their own names — so a control of that name holds them, which is
      // correct — but nothing anywhere SAID it: "wage, as the model implies it"
      // over education and experience, with tenure quietly fixed at whatever a
      // slider happened to read. A slice presented as the whole surface.
      const held = decl.x.slice(2).map((name) => {
        const p = model.params.find((q) => q.id.toLowerCase() === name.toLowerCase());
        if (p) return `${name} at ${p.value}${p.units ? ` ${p.units}` : ''} (the control ${p.id})`;
        const v = value(name);
        if (v !== undefined) return `${name} at ${v}`;
        return `${name} — which nothing has given a value, so this cannot be drawn until something does`;
      });
      const hypothetical = decl.x.some((name, i) => {
        const b = `${carrier.id}__b${wants ? i + 1 : i}`;
        const named = decl.coefficients?.[name];
        return (
          (!!named && model.params.some((p) => p.id === named)) ||
          model.params.some((p) => p.id === b) ||
          !!model.objects.find((o) => o.id === b)?.defs?.value
        );
      });

      put({
        id: `${carrier.id}__response`,
        kind: axes.length > 1 ? 'surface' : 'curve',
        label: `${decl.y}, as the model implies it`,
        meaning:
          `the model-implied deterministic component: ${specificationLine(carrier)}, ` +
          `with the error term left out. ` +
          (held.length
            ? `Only ${axes.join(' and ')} vary here; ${held.join('; ')}. It is a SLICE of the relationship, not the whole of it. `
            : '') +
          (slopeTerms.length
            ? `It is NOT a conditional expectation — that reading needs an assumption about the error nobody here has stated — ` +
              `and it is not a fit, a prediction or an observation.`
            : ''),
        defs: { z: expr },
        ...(decl.over
          ? {
              over: {
                x: decl.over[decl.x[0]],
                ...(axes.length > 1 && decl.over[decl.x[1]] ? { y: decl.over[decl.x[1]] } : {}),
              },
            }
          : {}),
        relations: [
          { to: carrier.id, as: 'derived-from', why: 'it is what this specification says, with the error term left out' },
        ],
        meta: {
          spec: carrier.id,
          role: 'response',
          axes: axes.join(','),
          ...(held.length ? { held: decl.x.slice(2).join(','), heldSays: held.join('; ') } : {}),
          // What the reader must be told about these numbers, carried on the
          // object rather than left to a caption somebody might not write.
          basis: hypothetical
            ? 'user-set hypothetical coefficients'
            : terms
              ? 'coefficients estimated from the data'
              : 'coefficients as written in the specification',
        },
        fidelity: 'model-derived',
        provenance: hypothetical
          ? {
              origin: 'user',
              detail: 'drawn at coefficient values you set as hypotheses — nothing here is estimated from data',
            }
          : terms
            ? { origin: 'computation', detail: `drawn at the coefficients least squares produced from “${decl.data}”` }
            : { origin: 'equation', detail: 'drawn from the specification as written' },
      });
    }

    // The error term — the part of the outcome the specification does not
    // explain. Named because leaving it out is how a specification starts
    // reading as a claim that these regressors are the whole story.
    put({
      id: `${carrier.id}__u`,
      kind: 'residual',
      label: 'u',
      meaning: `everything about ${decl.y} this specification does not account for`,
      relations: [{ to: carrier.id, as: 'contains', why: 'it is the error term of this specification' }],
      meta: { spec: carrier.id, role: 'error' },
      provenance: { origin: 'equation', detail: 'part of the specification as written' },
    });
  }

  if (!added.length) return model;
  return { ...model, objects: [...model.objects, ...added] };
}

/**
 * The name the fit gives the intercept term.
 *
 * Referred to by this constant rather than spelled out at each site: it was
 * written as '(intercept)' where the fit calls it 'intercept', so the expanded
 * β₀ silently never found its value and stayed a symbol on a model that had
 * been estimated. A string compared in two places is a constant.
 */
export const INTERCEPT = 'intercept';

/** Subscript digits, so β1 and β₀ do not sit in the same line looking unrelated. */
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n: number): string =>
  String(n).split('').map((d) => SUB[Number(d)] ?? d).join('');

/** The label a coefficient carries, wherever one is written. */
export function coefficientLabel(i: number, withIntercept: boolean): string {
  return `β${sub(withIntercept ? i + 1 : i)}`;
}

/** The specification written out, for a reader and for the conversation. */
export function specificationLine(o: ModelObject): string | null {
  const d = o.estimation;
  if (!d) return null;
  const wants = d.intercept !== false;
  const terms = d.x.map((x, i) => `${coefficientLabel(i, wants)}·${x}`);
  return `${d.y} = ${[...(wants ? ['β₀'] : []), ...terms, 'u'].join(' + ')}`;
}
