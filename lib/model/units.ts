// lib/model/units.ts
//
// WHAT A QUANTITY IS MEASURED IN, read from the model and never guessed.
//
// A figure that says "educ" against "lwage" is a picture of a shape. One that
// says "educ (years)" against "wage ($/hour)" is a picture of a quantity, and
// the difference is the whole reason to draw rather than describe. Every unit
// a surface prints — on an axis, a slider, a readout, a table head, the
// inspector — resolves through `unitOf` here, from what the model actually
// declares: a parameter's own units, an object's, a state variable's, an
// unknown's in an equations block, a specification's columns, the model's own
// dictionary of names, the clock. Nothing below invents one: a name the model
// has not measured is printed alone, which is the honest state.
//
// DERIVED UNITS FOLLOW THE MATHEMATICS. The slope ∂y/∂x is in y's units per
// x's; a value read at a point is in the outcome's units; a response implied
// by a specification is in the outcome's. Only those: a product of two
// dimensioned quantities, a log, an exponent, a residual's standard error are
// left unlabelled rather than labelled wrongly.
//
// DIMENSIONLESS IS A UNIT TOO, and it is written by leaving the unit out. An
// author who writes "1", "none" or "dimensionless" means exactly that, so those
// read as absent rather than as a word on an axis.
//
// PURE.

import type { Model, ModelObject } from './schema';

/** The spellings of "this has no unit". */
const NONE = new Set(['', '1', '-', '—', 'none', 'dimensionless', 'unitless', 'n/a', 'na', 'null']);

/** A unit as written, or nothing: trimmed, bounded, and "dimensionless" read as absent. */
export function cleanUnit(u: unknown): string | undefined {
  if (typeof u !== 'string') return undefined;
  const t = u.replace(/\s+/g, ' ').trim();
  if (!t || NONE.has(t.toLowerCase())) return undefined;
  return t.slice(0, 24);
}

/** "educ (years)" — or "educ", when there is nothing honest to add. */
export function withUnit(name: string, unit?: string | null): string {
  const u = cleanUnit(unit);
  return u ? `${name} (${u})` : name;
}

/**
 * The unit of a ratio: y per x.
 *
 * Written in words rather than as a fraction because the units themselves may
 * be fractions — "$/hour per year" reads; "$/hour/year" has two slashes and
 * two meanings. A dimensionless numerator over a dimensioned one is "per x";
 * a dimensioned numerator over a dimensionless one is just the numerator.
 */
export function perUnit(num?: string | null, den?: string | null): string | undefined {
  const n = cleanUnit(num);
  // "per year", not "per years": a plain plural word is read in the singular
  // after "per". Anything with a symbol in it — $/hour, m/s, N·m — is left as
  // written, because it is already a unit and not a word.
  const raw = cleanUnit(den);
  const d = raw && /^[a-z]+s$/.test(raw) && !/ss$/.test(raw) ? raw.slice(0, -1) : raw;
  if (n && d) return `${n} per ${d}`;
  if (n) return n;
  if (d) return `per ${d}`;
  return undefined;
}

/** A value with its unit, for a readout: "1.24 N/m", or "1.24". */
export function valueWithUnit(v: number | string, unit?: string | null): string {
  const u = cleanUnit(unit);
  return u ? `${v} ${u}` : String(v);
}

function fromDictionary(dict: Record<string, string> | undefined, name: string): string | undefined {
  if (!dict) return undefined;
  const hit = dict[name] ?? dict[Object.keys(dict).find((k) => k.toLowerCase() === name.toLowerCase()) ?? ''];
  return cleanUnit(hit);
}

/**
 * The unit of a named quantity, from everywhere the model can say it.
 *
 * The name is a CANONICAL one — a column, a state, an unknown, a parameter id,
 * an object id — or a display label, since the inspector asks by what it
 * shows. Order: the model's own dictionary (an author's explicit word
 * outranks a derived one), then the thing itself, then the structures that
 * declare their quantities, then the clock.
 */
export function unitOf(model: Model, name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const n = name.trim();
  if (!n) return undefined;
  const lower = n.toLowerCase();

  const dict = fromDictionary(model.units, n);
  if (dict) return dict;

  for (const p of model.params) {
    if (p.id === n || p.id.toLowerCase() === lower || p.label === n) {
      const u = cleanUnit(p.units);
      if (u) return u;
    }
  }

  for (const o of model.objects) {
    if (o.id === n || o.label === n) {
      const u = cleanUnit(o.units);
      if (u) return u;
    }
  }

  for (const o of model.objects) {
    const est = o.estimation;
    if (est) {
      const u = fromDictionary(est.units, n);
      if (u) return u;
    }
    const st = o.system?.states.find((s) => s.name === n || s.name.toLowerCase() === lower);
    if (st) {
      const u = cleanUnit(st.units);
      if (u) return u;
    }
    const eq = o.equations?.units;
    if (eq) {
      const u = fromDictionary(eq, n);
      if (u) return u;
    }
  }

  if (lower === 't' && model.time?.units) return cleanUnit(model.time.units);
  return undefined;
}

/** The unit an object's own quantity carries, by declaration or by what it is derived from. */
export function unitOfObject(model: Model, o: ModelObject): string | undefined {
  const own = cleanUnit(o.units);
  if (own) return own;
  const outcome = typeof o.meta?.outcome === 'string' ? o.meta.outcome : null;
  if (outcome) return unitOf(model, outcome);
  return undefined;
}

/**
 * Round numbers for an axis: 3–5 ticks at a step of 1, 2 or 5 × 10ⁿ that
 * cover the range. The ends of the box are not ticks unless they are round,
 * because a reader scales by the round ones.
 */
export function niceTicks(lo: number, hi: number, want = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi < lo) [lo, hi] = [hi, lo];
  const span = hi - lo;
  if (span === 0) return [lo];
  const raw = span / Math.max(1, want);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / mag;
  // The usual thresholds: a raw step of 1.4 rounds to 1, 2.8 to 2, 6 to 5.
  const step = (r >= 7 ? 10 : r >= 3 ? 5 : r >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  const first = Math.ceil(lo / step - 1e-9) * step;
  for (let v = first; v <= hi + step * 1e-9 && out.length < 12; v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  }
  return out;
}

/** A tick's number as a reader wants it: short, no float noise. */
export function tickLabel(v: number): string {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(1).replace('e+', 'e');
  return String(Number(v.toPrecision(6)));
}
