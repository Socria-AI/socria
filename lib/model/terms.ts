// lib/model/terms.ts
//
// A QUANTITY BUILT OUT OF ANOTHER QUANTITY, STRUCTURALLY.
//
// THE FAILURE THIS FILE ANSWERS, reproduced exactly before it was written:
//
//   wage = β₀ + β₁·educ + β₂·exper + β₃·exper²
//   β₀ = 5, β₁ = 2.5, β₂ = 1.2, β₃ = −0.03   (the person's own hypotheses)
//
//   built            : yes
//   capability       : mathematical
//   says             : "nothing in it computes yet … needs observations —
//                       wage, educ, exper, exper2 for each case"
//   response surface : b0 + (b1) * x + (b2) * y + (b3) * exper2
//   primitives drawn : 0
//
// No observations are required to EVALUATE that function. The reason the engine
// asked for them is that `EstimationDecl.x` was a list of COLUMN NAMES, so the
// only way to say `exper²` was to declare a third, independent regressor called
// `exper2` — and then nothing could bind it, because there is no such quantity.
// `exper²` is not a variable. It is a TRANSFORMATION OF `exper`, and the IR had
// no way to say so.
//
// THE GENERAL PRIMITIVE, and it is not an econometrics feature. The digest's
// chapter 6 needs logs, quadratics and interactions; chapter 7 needs categorical
// indicators; chapters 10–11 need lags and trends; chapter 13 needs differences;
// chapter 14 needs within-group demeaning; chapter 18 needs differencing again.
// Every one of those is the same shape: A QUANTITY DEFINED BY A NAMED OPERATION
// OVER OTHER QUANTITIES. One structure covers all of them, and the same
// structure is a squared radius in a physics model, a log-return in finance and
// a per-capita rate in demography.
//
// THE DISTINCTION THAT MATTERS MOST — and it is what makes the failure above a
// failure rather than a limitation:
//
//   POINTWISE terms (pow, log, exp, sqrt, inverse, interact) are EXPRESSIONS.
//   They can be evaluated at any values of their inputs, with no data at all.
//
//   SAMPLE terms (lag, lead, diff, demean, indicator) are relationships OVER A
//   SET OF OBSERVATIONS AND AN INDEX. `lag(c, 1)` is not a function of `c`; it
//   is the value of `c` at the previous time, and without an ordering there is
//   no previous time.
//
// So a specification made of pointwise terms is EVALUABLE and a specification
// containing a lag is not — which is exactly "model capability is not operation
// readiness", enforced at the level of the term rather than the model.
//
// A LAG IS NOT A VARIABLE WHOSE NAME CONTAINS "t-1". It is `{op:'lag', of:'c',
// by:1, over:'time'}`, and the index it runs over is named, so the engine can
// say "this needs a time index and the data has none" instead of silently
// treating a label as a relationship.
//
// PURE. No data is fetched here; a column is built from numbers handed in.

import { NAME } from './ids';
import { derivativeOf, parse, print, type Expr } from './expr';

/** The operations a term may be. Recursive: a term's source may be a term. */
export type TermOp =
  /** the quantity itself */
  | 'ref'
  /** x^n — a polynomial term */
  | 'pow'
  /** natural log, and the one people mean when they write log in a model */
  | 'log'
  | 'exp'
  | 'sqrt'
  /** 1/x */
  | 'inverse'
  /** x·z — an interaction, which is what makes one effect depend on another */
  | 'interact'
  /** the value at an earlier position along an index */
  | 'lag'
  /** the value at a later one */
  | 'lead'
  /** x − lag(x, by) */
  | 'diff'
  /** x minus its mean within each group of an index — the within transform */
  | 'demean'
  /** 1 when a categorical quantity takes a level, 0 otherwise */
  | 'indicator';

export interface TermDecl {
  op: TermOp;
  /** what it is built from: a quantity's name, or another term */
  of?: string | TermDecl;
  /** for `interact`, the two or more things multiplied */
  with?: (string | TermDecl)[];
  /** the exponent for `pow`, the distance for `lag`/`lead`/`diff` */
  by?: number;
  /** the index dimension a lag, difference or demeaning runs over */
  over?: string;
  /** the level an indicator is 1 at */
  level?: string;
  /** what to call it for a reader, when the derived name is not what they wrote */
  label?: string;
}

/** Which ops are functions of their inputs, and which need a sample and an index. */
export const POINTWISE: readonly TermOp[] = ['ref', 'pow', 'log', 'exp', 'sqrt', 'inverse', 'interact'];
export const OVER_SAMPLE: readonly TermOp[] = ['lag', 'lead', 'diff', 'demean', 'indicator'];

export function isPointwise(t: TermDecl): boolean {
  if (!POINTWISE.includes(t.op)) return false;
  const kids = sourcesOf(t);
  return kids.every((k) => typeof k === 'string' || isPointwise(k));
}

function sourcesOf(t: TermDecl): (string | TermDecl)[] {
  if (t.op === 'interact') return t.with ?? [];
  return t.of === undefined ? [] : [t.of];
}

/** The base quantity names a term ultimately rests on. */
export function basesOf(t: TermDecl): string[] {
  const out: string[] = [];
  const walk = (s: string | TermDecl) => {
    if (typeof s === 'string') {
      if (!out.includes(s)) out.push(s);
      return;
    }
    sourcesOf(s).forEach(walk);
  };
  sourcesOf(t).forEach(walk);
  return out;
}

/**
 * A stable id for a term, derived from its structure.
 *
 * DERIVED RATHER THAN INVENTED BY THE AUTHOR, because the author cannot be
 * asked to keep two spellings in step — and DERIVED FROM THE STRUCTURE rather
 * than from a counter, so the same transformation has the same id every time and
 * the dependency graph joins up across rebuilds. It is a legal identifier by
 * construction, because it reaches the evaluator.
 */
export function termId(t: TermDecl): string {
  const part = (s: string | TermDecl): string => (typeof s === 'string' ? s.toLowerCase() : termId(s));
  switch (t.op) {
    case 'ref':
      return part(t.of ?? 'x');
    case 'pow':
      return `${part(t.of ?? 'x')}_pow${String(t.by ?? 2).replace(/[.\-]/g, '')}`;
    case 'interact':
      return (t.with ?? []).map(part).join('_x_');
    case 'lag':
    case 'lead':
    case 'diff':
      return `${part(t.of ?? 'x')}_${t.op}${t.by ?? 1}`;
    case 'demean':
      return `${part(t.of ?? 'x')}_within`;
    case 'indicator':
      return `${part(t.of ?? 'x')}_is_${(t.level ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    default:
      return `${t.op}_${part(t.of ?? 'x')}`;
  }
}

/** What a reader should see. Unicode is fine here; it never reaches an evaluator. */
export function termLabel(t: TermDecl): string {
  if (t.label) return t.label;
  const part = (s: string | TermDecl): string => (typeof s === 'string' ? s : termLabel(s));
  const sup = (n: number) =>
    String(n).replace(/[-0-9]/g, (c) => ({ '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }[c] ?? c));
  switch (t.op) {
    case 'ref': return part(t.of ?? 'x');
    case 'pow': return `${part(t.of ?? 'x')}${sup(t.by ?? 2)}`;
    case 'log': return `log(${part(t.of ?? 'x')})`;
    case 'exp': return `exp(${part(t.of ?? 'x')})`;
    case 'sqrt': return `√${part(t.of ?? 'x')}`;
    case 'inverse': return `1/${part(t.of ?? 'x')}`;
    case 'interact': return (t.with ?? []).map(part).join('·');
    case 'lag': return `${part(t.of ?? 'x')}(−${t.by ?? 1})`;
    case 'lead': return `${part(t.of ?? 'x')}(+${t.by ?? 1})`;
    case 'diff': return `Δ${t.by && t.by > 1 ? `${t.by} ` : ''}${part(t.of ?? 'x')}`;
    case 'demean': return `${part(t.of ?? 'x')} − mean by ${t.over ?? 'group'}`;
    case 'indicator': return `${part(t.of ?? 'x')} = ${t.level}`;
  }
}

/**
 * The term as an expression over its base quantities, when it IS one.
 *
 * Returns null for the sample operations, and that null is load-bearing: it is
 * what tells the operation planner that this specification cannot be evaluated
 * pointwise however many values it is handed.
 */
export function termExpr(t: TermDecl): string | null {
  if (!isPointwise(t)) return null;
  const part = (s: string | TermDecl): string | null => {
    if (typeof s === 'string') return s;
    return termExpr(s);
  };
  const one = () => part(t.of ?? 'x');
  switch (t.op) {
    case 'ref': {
      const a = one();
      return a;
    }
    case 'pow': {
      const a = one();
      return a === null ? null : `(${a})^${t.by ?? 2}`;
    }
    case 'log': {
      const a = one();
      return a === null ? null : `ln(${a})`;
    }
    case 'exp': {
      const a = one();
      return a === null ? null : `exp(${a})`;
    }
    case 'sqrt': {
      const a = one();
      return a === null ? null : `sqrt(${a})`;
    }
    case 'inverse': {
      const a = one();
      return a === null ? null : `1 / (${a})`;
    }
    case 'interact': {
      const parts = (t.with ?? []).map(part);
      if (!parts.length || parts.some((p) => p === null)) return null;
      return parts.map((p) => `(${p})`).join(' * ');
    }
    default:
      return null;
  }
}

export interface TermNeed {
  /** what is absent, as a noun phrase */
  what: string;
  /** the sentence, where naming the thing would be circular */
  because?: string;
}

/**
 * What this term needs before it can produce numbers.
 *
 * Three kinds, and they are genuinely different things to tell somebody: a
 * pointwise term needs only its inputs; a lag needs an ORDERING; an indicator
 * needs the level to actually occur. This is the per-term half of operation
 * readiness, and it is why `β₀ + β₁·educ + β₂·exper + β₃·exper²` is evaluable
 * and `c = β₀ + β₁·y + β₂·lag(c,1)` is not.
 */
export function termNeeds(t: TermDecl): TermNeed[] {
  const out: TermNeed[] = [];
  const kids = sourcesOf(t);
  if (!kids.length) {
    out.push({ what: `something for ${t.op} to act on` });
  }
  for (const k of kids) if (typeof k !== 'string') out.push(...termNeeds(k));
  switch (t.op) {
    case 'lag':
    case 'lead':
    case 'diff':
      if (!t.over) {
        out.push({
          what: `the index ${t.op === 'diff' ? 'a difference' : 'a lag'} runs over`,
          because: `“${termLabel(t)}” is a relationship between one observation and another, so it needs an ordering — a time column, a period, a sequence. Without one there is no previous value to take.`,
        });
      }
      break;
    case 'demean':
      if (!t.over) {
        out.push({
          what: 'the grouping to take the mean within',
          because: `“${termLabel(t)}” subtracts a mean, and which mean depends on the groups — entities, firms, people, periods. Naming the grouping is the modelling decision here.`,
        });
      }
      break;
    case 'indicator':
      if (!t.level) out.push({ what: `the level ${termLabel(t)} should be 1 at` });
      break;
    case 'pow':
      if (t.by === undefined) out.push({ what: 'the exponent' });
      break;
    default:
      break;
  }
  return out;
}

// ── building a column from observations ─────────────────────────────

export interface Sample {
  /** every named column of the observations, as given */
  columns: Record<string, readonly number[]>;
  /** the index columns, by dimension name: 'time', 'entity', 'group', … */
  index?: Record<string, readonly (number | string)[]>;
  /** how many observations there are */
  n: number;
}

export interface Built {
  values: (number | null)[];
  /** what the engine did, for the note and for Trace */
  note: string;
}

/**
 * A term's column, over a sample.
 *
 * `null` where the value does not exist — the first observation of a lag, a
 * group with one member for a difference — rather than zero, because a lag with
 * no predecessor is ABSENT and a zero there is a fabricated observation. The
 * estimator drops incomplete rows and says how many; that is the honest chain.
 */
export function termColumn(t: TermDecl, s: Sample): { ok: true; built: Built } | { ok: false; why: string } {
  const source = (k: string | TermDecl): { ok: true; values: (number | null)[] } | { ok: false; why: string } => {
    if (typeof k === 'string') {
      const col = s.columns[k] ?? s.columns[k.toLowerCase()];
      if (!col) return { ok: false, why: `there is no column “${k}” in these observations` };
      return { ok: true, values: [...col] };
    }
    const inner = termColumn(k, s);
    return inner.ok ? { ok: true, values: inner.built.values } : inner;
  };

  const pointwise = (f: (...v: number[]) => number, kids: (string | TermDecl)[]): { ok: true; built: Built } | { ok: false; why: string } => {
    const cols: (number | null)[][] = [];
    for (const k of kids) {
      const got = source(k);
      if (!got.ok) return got;
      cols.push(got.values);
    }
    const values: (number | null)[] = [];
    for (let i = 0; i < s.n; i++) {
      const row = cols.map((c) => c[i]);
      if (row.some((v) => v === null || v === undefined || !Number.isFinite(v))) { values.push(null); continue; }
      const v = f(...(row as number[]));
      values.push(Number.isFinite(v) ? v : null);
    }
    return { ok: true, built: { values, note: `${termLabel(t)}, computed row by row` } };
  };

  switch (t.op) {
    case 'ref':
      return pointwise((a) => a, [t.of ?? 'x']);
    case 'pow':
      return pointwise((a) => Math.pow(a, t.by ?? 2), [t.of ?? 'x']);
    case 'log':
      // A LOG OF A NON-POSITIVE NUMBER IS ABSENT, NOT ZERO. Substituting
      // log(x + 1) is a modelling decision and would be ours to make, which it
      // is not — so the row goes missing and the estimator says how many did.
      return pointwise((a) => (a > 0 ? Math.log(a) : NaN), [t.of ?? 'x']);
    case 'exp':
      return pointwise((a) => Math.exp(a), [t.of ?? 'x']);
    case 'sqrt':
      return pointwise((a) => (a >= 0 ? Math.sqrt(a) : NaN), [t.of ?? 'x']);
    case 'inverse':
      return pointwise((a) => (a === 0 ? NaN : 1 / a), [t.of ?? 'x']);
    case 'interact':
      return pointwise((...v) => v.reduce((p, q) => p * q, 1), t.with ?? []);

    case 'lag':
    case 'lead':
    case 'diff': {
      const need = termNeeds(t);
      if (need.length) return { ok: false, why: need[0].because ?? `it needs ${need[0].what}` };
      const order = s.index?.[t.over!];
      if (!order) {
        return {
          ok: false,
          why: `these observations carry no “${t.over}” index, so there is no ordering along which to take ${termLabel(t)}`,
        };
      }
      const got = source(t.of ?? 'x');
      if (!got.ok) return got;
      const by = Math.max(1, Math.floor(t.by ?? 1));
      // ORDER BY THE INDEX, not by the order the rows arrived in. A time series
      // handed over shuffled would otherwise produce a lag of whatever happened
      // to be printed above it.
      const rank = [...Array(s.n).keys()].sort((i, j) => {
        const a = order[i];
        const b = order[j];
        return a === b ? i - j : a < b ? -1 : 1;
      });
      const shifted: (number | null)[] = Array(s.n).fill(null);
      for (let r = 0; r < rank.length; r++) {
        const here = rank[r];
        const from = t.op === 'lead' ? r + by : r - by;
        if (from < 0 || from >= rank.length) continue;
        const prev = got.values[rank[from]];
        if (prev === null || prev === undefined) continue;
        const now = got.values[here];
        if (t.op === 'diff') {
          shifted[here] = now === null || now === undefined ? null : now - prev;
        } else {
          shifted[here] = prev;
        }
      }
      const lost = shifted.filter((v) => v === null).length;
      return {
        ok: true,
        built: {
          values: shifted,
          note: `${termLabel(t)}, taken along the ${t.over} index${lost ? `; ${lost} observation${lost === 1 ? '' : 's'} have no ${t.op === 'lead' ? 'successor' : 'predecessor'} and are absent rather than zero` : ''}`,
        },
      };
    }

    case 'demean': {
      const need = termNeeds(t);
      if (need.length) return { ok: false, why: need[0].because ?? `it needs ${need[0].what}` };
      const groups = s.index?.[t.over!];
      if (!groups) {
        return { ok: false, why: `these observations carry no “${t.over}” index, so there are no groups to take a mean within` };
      }
      const got = source(t.of ?? 'x');
      if (!got.ok) return got;
      const sums = new Map<string, { sum: number; n: number }>();
      for (let i = 0; i < s.n; i++) {
        const v = got.values[i];
        if (v === null || v === undefined) continue;
        const g = String(groups[i]);
        const cur = sums.get(g) ?? { sum: 0, n: 0 };
        sums.set(g, { sum: cur.sum + v, n: cur.n + 1 });
      }
      const values = got.values.map((v, i) => {
        if (v === null || v === undefined) return null;
        const cur = sums.get(String(groups[i]));
        return cur && cur.n ? v - cur.sum / cur.n : null;
      });
      const singles = [...sums.values()].filter((g) => g.n === 1).length;
      return {
        ok: true,
        built: {
          values,
          note:
            `${termLabel(t)}: each observation minus the mean of its ${t.over} group, over ${sums.size} group${sums.size === 1 ? '' : 's'}` +
            (singles ? `; ${singles} group${singles === 1 ? ' has' : 's have'} one observation, so this is exactly zero there and carries no information` : ''),
        },
      };
    }

    case 'indicator': {
      if (!t.level) return { ok: false, why: `it needs the level ${termLabel(t)} should be 1 at` };
      const of = t.of;
      if (typeof of !== 'string') return { ok: false, why: 'an indicator is of a named categorical quantity' };
      const levels = s.index?.[of] ?? s.columns[of];
      if (!levels) return { ok: false, why: `there is no column or index “${of}” in these observations` };
      const want = String(t.level).toLowerCase();
      let hit = 0;
      const values = [...levels].map((v) => {
        const is = String(v).toLowerCase() === want;
        if (is) hit++;
        return is ? 1 : 0;
      });
      if (!hit) {
        // A COLUMN OF ZEROS IS NOT AN INDICATOR. It carries no information, and
        // an estimator handed it reports collinearity rather than the real
        // problem, which is that the level does not occur.
        const seen = [...new Set([...levels].map((v) => String(v)))].slice(0, 8);
        return {
          ok: false,
          why: `“${t.level}” does not occur in ${of}. The levels present are ${seen.join(', ')}${seen.length === 8 ? ', …' : ''}`,
        };
      }
      return {
        ok: true,
        built: { values, note: `${termLabel(t)}: 1 for ${hit} of ${s.n} observations, 0 for the rest` },
      };
    }
  }
}

// ── differentiating through a term ──────────────────────────────────

/**
 * ∂term/∂name, symbolically, when the term is an expression.
 *
 * THIS IS WHY TERMS AND THE EXPRESSION TREE BELONG TOGETHER. A quadratic term
 * exists so that a marginal effect is not constant, and an interaction exists so
 * that one effect depends on another — both are claims about a derivative. A
 * term that is only a column name cannot answer either; a term that is a
 * structure can.
 */
export function termDerivative(
  t: TermDecl,
  wrt: string,
  names: readonly string[]
): { ok: true; expr: string; tree: Expr } | { ok: false; why: string } {
  const e = termExpr(t);
  if (e === null) {
    return {
      ok: false,
      why: `“${termLabel(t)}” is a relationship over the observations rather than a function of its inputs, so it has no pointwise derivative`,
    };
  }
  return derivativeOf(e, wrt, names);
}

/** Does this parse over the given names? Used to refuse a term early. */
export function termCompiles(t: TermDecl, names: readonly string[]): boolean {
  const e = termExpr(t);
  if (e === null) return true;
  return !!parse(e, names);
}

/** One line per term, for the inspector, for Trace and for the conversation. */
export function termLines(terms: Record<string, TermDecl>): string[] {
  return Object.entries(terms).map(([name, t]) => {
    const e = termExpr(t);
    const needs = termNeeds(t);
    return (
      `${name} = ${termLabel(t)}` +
      (e ? ` — ${e}, a function of ${basesOf(t).join(', ')}` : ` — over the observations, along ${t.over ?? 'an index nobody named'}`) +
      (needs.length ? `; not ready: ${needs.map((x) => x.because ?? x.what).join('; ')}` : '')
    );
  });
}

/** A legal, collision-free name for a term, given what is taken already. */
export function nameFor(t: TermDecl, taken: readonly string[]): string {
  const base = termId(t).slice(0, 44).replace(/[^a-z0-9_]/gi, '_').replace(/^([^a-z])/i, 't$1');
  if (!NAME.test(base)) return `term_${taken.length + 1}`;
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 99; i++) if (!taken.includes(`${base}_${i}`)) return `${base}_${i}`;
  return `${base}_x`;
}
