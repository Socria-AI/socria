// lib/model/kinds.ts
//
// WHAT RANGE A FREE INPUT IS LOOKED AT OVER — one rule, for the symbol table
// and the expander both.
//
// TWO COPIES OF THIS RULE EXISTED: symbols.ts domainFor() for the registry and
// the controls, and estimate.ts window() for the response surface's own `over`.
// They agreed by luck. This is the one place, and both read it.
//
// AND THE RULE HAS TWO MORE CLAUSES THAN IT DID. A log-wage relationship in
// education and a female dummy, with no `kinds` declared, drew an empty frame
// with "FEMALE — needs a range" under it. The old position was principled —
// "a column called female is not assumed to be an indicator, because the next
// one called female_share is not" — and it produced a blank picture in the
// product, over and over, because the declaration it waited for comes from a
// language model that forgets. So:
//
//   · A NAME THAT IS AN INDICATOR BY CONVENTION IS READ AS ONE, and the reading
//     is SAID. `female`, `married`, `union`, `is_x`, `has_x`, `x_dummy` — exact
//     names, never substrings, so `female_share` is still not an indicator. A
//     declared kind always wins: `kinds: {female: 'continuous'}` turns it off.
//   · A CONTINUOUS INPUT WITH NO RANGE GETS AN ASSUMED WINDOW, and that too is
//     said — on the slider, in the picture's note, in the inspector. The old
//     fallback was [−3, 3] in silence, which drew education over minus three
//     years; the objection was to the silence and to the window, not to the
//     existence of a default. 0 to 10 draws any shape legibly and is visibly a
//     default, which is the point: a range you can see is one you will fix.
//
// PURE.

import type { DataBlock, EstimationDecl, Model, ModelObject } from './schema';

/**
 * Names that mean yes-or-no wherever they appear in an empirical model.
 *
 * The textbook list (Wooldridge's running examples), plus the ones a person
 * writes without thinking. EXACT MATCH ONLY, after lowercasing.
 */
export const INDICATOR_NAMES: ReadonlySet<string> = new Set([
  'female', 'male', 'married', 'single', 'divorced', 'widowed', 'union', 'urban', 'rural',
  'south', 'north', 'east', 'west', 'black', 'white', 'hispanic', 'nonwhite', 'minority',
  'foreign', 'immigrant', 'citizen', 'veteran', 'employed', 'unemployed', 'retired',
  'student', 'college', 'hsgrad', 'graduate', 'treated', 'treat', 'treatment', 'control',
  'post', 'after', 'smoker', 'smokes', 'insured', 'owner', 'renter', 'parent', 'kids',
  'disabled', 'pregnant', 'religious', 'member', 'parttime', 'fulltime', 'metro',
  'public', 'private', 'female_head', 'dummy', 'd', 'indicator',
]);

/** Kinds a variable may be declared as. */
export type VariableKind = 'continuous' | 'binary' | 'categorical' | 'count';

/**
 * What a name alone says a variable is. `binary` for a conventional indicator
 * name or an indicator spelling (is_, has_, d_, _dummy, _dum, _ind, _indicator);
 * null for everything else — no other kind is ever read from a name.
 */
export function impliedKind(name: string): 'binary' | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  if (INDICATOR_NAMES.has(n)) return 'binary';
  if (/^(is|has|d|dum|dummy)_[a-z0-9_]+$/.test(n)) return 'binary';
  if (/^[a-z0-9_]+_(dummy|dum|ind|indicator|d)$/.test(n)) return 'binary';
  return null;
}

/** The window a continuous input with no stated range is drawn over. Said wherever it is used. */
export const ASSUMED_WINDOW: [number, number] = [0, 10];

/** Where an input's range came from. The last two are the engine's readings, and are always said. */
export type DomainFrom = 'object' | 'specification' | 'control' | 'data' | 'type' | 'name' | 'assumed';

export interface InputDomain {
  domain: [number, number];
  from: DomainFrom;
}

/**
 * The range a free input of a specification is evaluated over, and where it
 * came from. ALWAYS answers: the last clause is the assumed window.
 *
 * Order: what it IS (declared kind, indicator term) → what was written (the
 * object's own window, the declaration's `over`, a control of that name) →
 * what was measured (a data column) → what the name says → the default.
 */
export function inputDomain(
  model: Pick<Model, 'params'>,
  decl: Pick<EstimationDecl, 'kinds' | 'terms' | 'over'>,
  column: string,
  own?: ModelObject['over'],
  block?: DataBlock
): InputDomain {
  const kind = decl.kinds?.[column];
  const term = decl.terms?.[column];
  if (kind === 'binary' || term?.op === 'indicator') return { domain: [0, 1], from: 'type' };
  const mine = own?.x ?? own?.[column];
  if (mine) return { domain: mine as [number, number], from: 'object' };
  const stated = decl.over?.[column];
  if (stated) return { domain: stated as [number, number], from: 'specification' };
  const p = model.params.find((q) => q.id.toLowerCase() === column.toLowerCase());
  if (p) return { domain: [p.min, p.max], from: 'control' };
  const col = block?.columns?.[column];
  const finite = (col ?? []).filter((v) => Number.isFinite(v));
  // A CONSTANT COLUMN HAS NO EXTENT. [12, 12] is not a window to draw over.
  if (finite.length >= 2 && Math.max(...finite) > Math.min(...finite)) {
    return { domain: [Math.min(...finite), Math.max(...finite)], from: 'data' };
  }
  if (kind === undefined && impliedKind(column) === 'binary') return { domain: [0, 1], from: 'name' };
  return { domain: ASSUMED_WINDOW, from: 'assumed' };
}

/** One clause saying what the engine read rather than was told, for the picture's note. Null when it read nothing. */
export function domainSays(column: string, d: InputDomain): string | null {
  if (d.from === 'name') return `${column} is read as an indicator (0 or 1) from its name — declare its kind to say otherwise`;
  if (d.from === 'assumed') return `${column} has no stated range and is drawn over ${d.domain[0]} to ${d.domain[1]} — say what range matters`;
  return null;
}

/** How the inspector words a range's origin. */
export const DOMAIN_FROM_SAYS: Record<DomainFrom, string> = {
  object: 'the object’s own window',
  specification: 'the range you stated',
  control: 'a control of that name',
  data: 'the extent of the data',
  type: 'what it is',
  name: 'its name, read as an indicator',
  assumed: 'an assumed default — say the range',
};
