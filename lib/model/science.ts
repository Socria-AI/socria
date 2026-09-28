// lib/model/science.ts
//
// WHAT IS TRUE, SAID SEPARATELY FROM HOW IT IS DRAWN.
//
// Socria's surfaces are abstract on purpose: thin lines on cream paper, not a
// NASA render. That is a decision about REPRESENTATION, and it is only defensible
// if the MODEL underneath is exact and says so in a form that can be checked.
// Accuracy is not photorealism; a beautiful figure and a wrong model look the
// same from the outside, and this file is what makes them different from the
// inside.
//
// The chain every advanced model runs through:
//
//     ScienceMeta        what is claimed: equations, constants, ranges, methods
//         ↓              validateScience — refuses what cannot be supported
//     computed state     produced by the domain code, which owns the numbers
//         ↓              canCompute — refuses to draw what was not computed
//     representation     the semantic layer: what each mark stands for
//         ↓
//     the renderer       which may simplify APPEARANCE, never MEANING
//
// THE RULES THIS FILE ENFORCES, and each exists because the failure it prevents
// is one a reader cannot see:
//
//   1. NOTHING MAY CLAIM MORE THAN IT CAN SUPPORT. An output labelled
//      numerically-computed must name a solver that exists in the same block;
//      one labelled model-derived must name an equation. A model's own fidelity
//      is the WEAKEST of its outputs, computed rather than declared, so a single
//      illustrative element cannot ride along under a computed headline.
//   2. A CONTROL MAY NOT LEAVE THE MODEL'S DOMAIN OF VALIDITY. If a slider can
//      be dragged where the equations do not hold, the picture is wrong at the
//      end of the slider and nothing says so. The offered range must sit inside
//      the valid range.
//   3. AN ILLUSTRATIVE ELEMENT MUST SAY WHAT IT IS NOT. A coordinate grid drawn
//      around a black hole is a representation of geometry; a reader may well
//      take it for a physical surface, and the only cure is for the model to
//      carry the sentence that says it is not one.
//   4. A FAILED COMPUTATION IS NOT A DRAWING. canCompute returns refusals, and a
//      surface that gets them must say the model could not be computed rather
//      than render something plausible.
//
// PURE. No React, no clock, no network. Everything is a function of its
// arguments, so the whole of it is checkable by the suite.

import { FIDELITY_SAYS, type Fidelity } from './schema';

/** Where a claim comes from, outside this product. */
export interface Reference {
  id: string;
  /** how a reader would name it: 'Bardeen 1973' */
  label: string;
  /** the full citation, or the standard's designation */
  where: string;
  kind: 'paper' | 'book' | 'standard' | 'dataset' | 'software';
  year?: number;
  doi?: string;
  url?: string;
}

export interface Equation {
  id: string;
  /** the mathematics, as text or TeX */
  text: string;
  /** one sentence: what it says */
  says: string;
  /** reference ids */
  from?: string[];
  /** where it holds, in words: 'equatorial orbits only' */
  valid?: string;
}

export interface Constant {
  symbol: string;
  value: number;
  units: string;
  /** which body's value, or which measurement */
  source: string;
}

/**
 * A parameter, a variable or an initial condition — anything the model takes as
 * a number rather than derives.
 *
 * `range` is what a control offers. `valid` is where the mathematics holds. They
 * are separate fields because the whole point is that they can disagree, and
 * validateScience refuses when they do.
 */
export interface Quantity {
  id: string;
  symbol?: string;
  says: string;
  units: string;
  /** what a control offers */
  range?: [number, number];
  /** where the model is valid. Absent means the model does not bound it. */
  valid?: [number, number];
  /** what goes wrong outside `valid` */
  outside?: string;
}

/** A numerical method, and the settings that decide whether to trust it. */
export interface Numeric {
  id: string;
  /** 'RK4 on the second-order radial equation' */
  method: string;
  /** the order of the scheme, where it has one */
  order?: number;
  /** fixed count, or the rule when the step is adaptive */
  steps?: number | string;
  tolerance?: number;
  /** what ends the integration: 'crossing the horizon', 'r > r₀ and outbound' */
  stopsOn?: string[];
  /** the analytic result it is compared against, and where that check lives */
  checkedAgainst?: string;
  /** what the method cannot resolve, stated rather than hidden */
  fails?: string;
}

/** Something the model produces. Its fidelity is the claim being made about it. */
export interface Output {
  id: string;
  says: string;
  fidelity: Fidelity;
  units?: string;
  /** equation ids, numeric ids or reference ids it rests on */
  from?: string[];
}

/**
 * A visible mark, and what it stands for.
 *
 * THE FIELD THAT MATTERS IS `notA`. Some things a model shows cannot literally
 * be seen — a coordinate grid, an orbit's trace, a probability cloud — and a
 * reader is entitled to assume a drawn surface is a surface unless told.
 */
export interface Representation {
  id: string;
  /** how it was obtained */
  is: 'computed' | 'mathematical' | 'illustrative';
  /** what it stands for */
  shows: string;
  /** what it must not be mistaken for. Required when `is` is illustrative. */
  notA?: string;
  /** what its colour, width or motion encodes, where any of them do */
  encodes?: string;
}

export interface ScienceMeta {
  name: string;
  version: string;
  domain: string;
  /**
   * The model's own fidelity. NOT declared freely: validateScience requires it
   * to equal the weakest of the outputs, so a headline cannot outrun the parts.
   */
  fidelity: Fidelity;
  coordinates?: { system: string; note?: string };
  units?: { lengths?: string; times?: string; note?: string };
  equations: Equation[];
  constants?: Constant[];
  parameters?: Quantity[];
  initial?: string[];
  boundary?: string[];
  assumptions: string[];
  numerics?: Numeric[];
  outputs: Output[];
  representations?: Representation[];
  limitations: string[];
  references?: Reference[];
  /** the observer's situation, where the model has one */
  observer?: string;
}

// ── how much a claim claims ─────────────────────────────────────────

/** Weakest first. An output may not claim more than what produced it. */
export const FIDELITY_RANK: readonly Fidelity[] = [
  'conceptual',
  'model-derived',
  'data-derived',
  'simulated',
  'numerically-computed',
];

export function rankOf(f: Fidelity): number {
  const i = FIDELITY_RANK.indexOf(f);
  return i < 0 ? 0 : i;
}

/**
 * The strongest fidelity a model may honestly claim: the weakest of its outputs.
 *
 * Deliberately pessimistic. A picture is read as a whole, so one illustrative
 * element inside a "numerically computed" figure makes the figure's headline
 * false for the part a reader happens to be looking at.
 */
export function honestFidelity(outputs: readonly Output[]): Fidelity {
  if (!outputs.length) return 'conceptual';
  let worst = outputs[0].fidelity;
  for (const o of outputs) if (rankOf(o.fidelity) < rankOf(worst)) worst = o.fidelity;
  return worst;
}

/**
 * The range of claims a model makes, and which outputs sit at each end.
 *
 * WHY BOTH ENDS. A single headline is wrong either way for a model with mixed
 * parts: "numerically computed" flatters the drawn thickness of a disc, and
 * "conceptual" — which is what the honest floor gives — buries the fact that the
 * light paths are integrated. So the floor is what the block DECLARES (nothing
 * may exceed it), and a reader is told both ends and which parts they are.
 */
export function fidelitySpread(outputs: readonly Output[]): {
  weakest: Fidelity;
  strongest: Fidelity;
  weakestOf: string[];
  strongestOf: string[];
} {
  const weakest = honestFidelity(outputs);
  let strongest: Fidelity = weakest;
  for (const o of outputs) if (rankOf(o.fidelity) > rankOf(strongest)) strongest = o.fidelity;
  return {
    weakest,
    strongest,
    weakestOf: outputs.filter((o) => o.fidelity === weakest).map((o) => o.id),
    strongestOf: outputs.filter((o) => o.fidelity === strongest).map((o) => o.id),
  };
}

export interface Problem {
  /** the id, or the field, the problem is about */
  where: string;
  says: string;
  /**
   * 'refuses' means the block must not be presented as science until it is
   * fixed — it is claiming something it cannot support. 'warns' means a reader
   * is under-served but nothing is false.
   */
  severity: 'refuses' | 'warns';
}

const COMPUTED: readonly Fidelity[] = ['numerically-computed', 'simulated'];

/**
 * Check a science block against the rules in the header.
 *
 * Returns problems rather than throwing, because the caller is usually a test or
 * a build step that wants all of them at once, and because a block with a
 * warning is still usable.
 */
export function validateScience(meta: ScienceMeta): Problem[] {
  const out: Problem[] = [];
  const refuse = (where: string, says: string) => out.push({ where, says, severity: 'refuses' });
  const warn = (where: string, says: string) => out.push({ where, says, severity: 'warns' });

  // IDS ARE UNIQUE WITHIN A LIST, AND MAY REPEAT ACROSS LISTS ON PURPOSE.
  //
  // An output and the representation that draws it are one thing seen twice, and
  // an equation and the number it produces usually want the same name — `isco`
  // is the formula and the radius. So the check is per list, and `from` resolves
  // only against the lists that can GROUND something: equations, methods and
  // references. That is what stops the ambiguity that matters, which is a claim
  // citing itself.
  const seen = (kind: string, items: readonly { id: string }[]) => {
    const held = new Set<string>();
    for (const it of items) {
      if (!it.id) refuse(kind, 'something here has no id, so nothing can point at it');
      else if (held.has(it.id)) refuse(it.id, `two ${kind}s share this id, so a reference to it is ambiguous`);
      else held.add(it.id);
    }
  };
  seen('equation', meta.equations);
  seen('method', meta.numerics ?? []);
  seen('output', meta.outputs);
  seen('reference', meta.references ?? []);
  seen('parameter', meta.parameters ?? []);
  seen('representation', meta.representations ?? []);

  /** What a `from` may point at: the things that can ground a claim. */
  const grounds = new Set<string>([
    ...meta.equations.map((e) => e.id),
    ...(meta.numerics ?? []).map((n) => n.id),
    ...(meta.references ?? []).map((r) => r.id),
  ]);

  if (!meta.name.trim()) refuse('name', 'the model has no name, so nothing can say which model ran');
  if (!meta.version.trim()) refuse('version', 'no version, so two runs cannot be told apart');
  if (!meta.equations.length) refuse('equations', 'no equations: nothing states what is being solved');
  if (!meta.outputs.length) refuse('outputs', 'nothing is produced, so there is nothing to draw honestly');
  if (!meta.assumptions.length) warn('assumptions', 'nothing is held fixed? Say what is, even if it is little');
  if (!meta.limitations.length) warn('limitations', 'every model has a boundary; this one does not state its own');

  // Rule 1: nothing claims more than it can support.
  const honest = honestFidelity(meta.outputs);
  if (meta.fidelity !== honest) {
    refuse(
      'fidelity',
      `the block claims ${meta.fidelity} while its weakest output is ${honest} — a headline may not outrun its parts`
    );
  }
  const methods = new Set((meta.numerics ?? []).map((n) => n.id));
  const equations = new Set(meta.equations.map((e) => e.id));
  const datasets = new Set(
    (meta.references ?? []).filter((r) => r.kind === 'dataset').map((r) => r.id)
  );
  for (const o of meta.outputs) {
    const from = o.from ?? [];
    for (const f of from) {
      if (!grounds.has(f)) {
        refuse(o.id, `points at “${f}”, which is not an equation, a method or a source in this block`);
      }
    }
    if (COMPUTED.includes(o.fidelity) && !from.some((f) => methods.has(f))) {
      refuse(
        o.id,
        `claims to be ${o.fidelity} but names no numerical method — a computed result has to say what computed it`
      );
    }
    if (o.fidelity === 'model-derived' && !from.some((f) => equations.has(f))) {
      refuse(o.id, 'claims to follow from the mathematics but names no equation');
    }
    if (o.fidelity === 'data-derived' && !from.some((f) => datasets.has(f))) {
      refuse(o.id, 'claims to come from data but names no dataset');
    }
  }

  // Rule 2: a control may not leave the domain of validity.
  for (const p of meta.parameters ?? []) {
    if (!p.units.trim()) refuse(p.id, 'no units: a number without them cannot be checked or converted');
    if (p.range && p.range[0] > p.range[1]) refuse(p.id, 'its offered range runs backwards');
    if (p.range && p.valid) {
      if (p.range[0] < p.valid[0] - 1e-12 || p.range[1] > p.valid[1] + 1e-12) {
        refuse(
          p.id,
          `can be set to ${p.range[0]}…${p.range[1]} while the model holds only over ${p.valid[0]}…${p.valid[1]}`
        );
      }
    }
    if (p.valid && !p.outside) {
      warn(p.id, 'says where it is valid but not what goes wrong outside');
    }
  }

  // Rule 3: an illustrative element must say what it is not.
  for (const r of meta.representations ?? []) {
    if (!r.shows.trim()) refuse(r.id, 'a visible mark that stands for nothing: either say what it shows or remove it');
    if (r.is === 'illustrative' && !r.notA?.trim()) {
      refuse(r.id, 'is illustrative and does not say what it must not be mistaken for');
    }
  }

  // An output and the representation that draws it must agree. A computed result
  // drawn as an illustration, or an illustration presented as computed, is the
  // exact confusion this whole file exists to prevent — and it is invisible to a
  // reader, who sees one mark and one caption.
  for (const r of meta.representations ?? []) {
    const o = meta.outputs.find((x) => x.id === r.id);
    if (!o) continue;
    const computed = COMPUTED.includes(o.fidelity);
    if (computed && r.is === 'illustrative') {
      refuse(r.id, 'the output is computed while the mark that shows it is illustrative — one of the two is wrong');
    }
    if (o.fidelity === 'conceptual' && r.is === 'computed') {
      refuse(r.id, 'the mark claims to be computed while the output it draws is conceptual');
    }
  }

  // Methods have to be checkable.
  for (const n of meta.numerics ?? []) {
    if (!n.method.trim()) refuse(n.id, 'a method with no method');
    if (!n.stopsOn?.length) warn(n.id, 'does not say what ends it, so a truncated result cannot be told from a finished one');
    if (!n.checkedAgainst) warn(n.id, 'names no check against a known result — an integrator nobody verified is a guess with decimals');
  }

  for (const e of meta.equations) {
    if (!e.text.trim()) refuse(e.id, 'an equation with no equation');
    if (!e.says.trim()) warn(e.id, 'no sentence saying what it means, so only a specialist can read it');
    for (const f of e.from ?? []) {
      if (!grounds.has(f)) refuse(e.id, `cites “${f}”, which is not a source in this block`);
    }
  }

  for (const c of meta.constants ?? []) {
    if (!c.units.trim()) refuse(c.symbol, 'a constant without units');
    if (!c.source.trim()) warn(c.symbol, 'a constant with no source');
    if (!Number.isFinite(c.value)) refuse(c.symbol, 'a constant that is not a number');
  }

  if (COMPUTED.includes(meta.fidelity) && !meta.coordinates) {
    warn('coordinates', 'a computed model that does not say which coordinates it computed in');
  }

  return out;
}

/** Only the problems that stop it being presented as science. */
export function refusals(meta: ScienceMeta): Problem[] {
  return validateScience(meta).filter((p) => p.severity === 'refuses');
}

export function isSound(meta: ScienceMeta): boolean {
  return refusals(meta).length === 0;
}

// ── can this actually be computed, with these numbers ───────────────

export interface ComputeCheck {
  ok: boolean;
  /** what stopped it, in the reader's words */
  refusals: string[];
  /** values that were clamped to stay inside the model, and to what */
  clamped: { id: string; from: number; to: number; why: string }[];
}

/**
 * Check the values a surface is about to compute with.
 *
 * WHAT THIS IS FOR: the alternative to it is a picture. A missing parameter, a
 * NaN out of a slider, a value past the end of the model's validity — each of
 * those produces geometry of some kind, and geometry is read as a result. So the
 * check runs first and a surface that fails it says the model could not be
 * computed.
 *
 * Clamping is reported, never silent. A hole spun past the Thorne limit is held
 * at it, and the reader is told that is what happened rather than being shown a
 * hole at a spin nobody asked for.
 */
export function canCompute(meta: ScienceMeta, values: Record<string, number>): ComputeCheck {
  const refuse: string[] = [];
  const clamped: ComputeCheck['clamped'][number][] = [];
  for (const p of meta.parameters ?? []) {
    const v = values[p.id];
    if (v === undefined) {
      refuse.push(`${p.says} (${p.id}) was not given, and the model needs it`);
      continue;
    }
    if (!Number.isFinite(v)) {
      refuse.push(`${p.says} (${p.id}) is not a number`);
      continue;
    }
    if (p.valid) {
      const to = Math.min(p.valid[1], Math.max(p.valid[0], v));
      if (to !== v) {
        clamped.push({
          id: p.id,
          from: v,
          to,
          why: p.outside ?? `outside where this model holds (${p.valid[0]}…${p.valid[1]})`,
        });
      }
    }
  }
  return { ok: refuse.length === 0, refusals: refuse, clamped };
}

// ── saying it to a person ───────────────────────────────────────────

/**
 * What one named thing in the model is, in a sentence or two.
 *
 * The answer to "what is the blue thing?" and "why is that there?" when Logos
 * itself drew it. Nothing here hedges: if the id is in the block, the block
 * knows what it is, and if it is not, this says so plainly rather than guessing.
 */
export function explain(meta: ScienceMeta, id: string): string | null {
  const out = meta.outputs.find((o) => o.id === id);
  const rep = meta.representations?.find((r) => r.id === id);
  const par = meta.parameters?.find((p) => p.id === id);
  const eq = meta.equations.find((e) => e.id === id);
  const cite = (ids?: string[]) => {
    const refs = (ids ?? [])
      .map((f) => meta.references?.find((r) => r.id === f)?.label)
      .filter(Boolean);
    return refs.length ? ` (${refs.join('; ')})` : '';
  };

  if (out) {
    const how = (out.from ?? [])
      .map((f) => {
        const n = meta.numerics?.find((x) => x.id === f);
        if (n) return n.method;
        const e = meta.equations.find((x) => x.id === f);
        if (e) return e.text;
        const r = meta.references?.find((x) => x.id === f);
        return r?.label ?? null;
      })
      .filter(Boolean);
    const parts = [`${out.says}.`, `It is ${FIDELITY_SAYS[out.fidelity]}.`];
    if (how.length) parts.push(`From ${how.join(', ')}.`);
    if (rep?.notA) parts.push(`It is not ${rep.notA}.`);
    return parts.join(' ');
  }
  if (rep) {
    const parts = [
      `${rep.shows}.`,
      rep.is === 'computed'
        ? 'It is drawn from a computed result.'
        : rep.is === 'mathematical'
          ? 'It is drawn from the stated mathematics.'
          : 'It is drawn to make something legible, and is not itself a result.',
    ];
    if (rep.encodes) parts.push(`Its appearance carries meaning: ${rep.encodes}.`);
    if (rep.notA) parts.push(`It is not ${rep.notA}.`);
    return parts.join(' ');
  }
  if (par) {
    const bits = [`${par.says}, in ${par.units}.`];
    if (par.range) bits.push(`You can set it between ${par.range[0]} and ${par.range[1]}.`);
    if (par.valid && par.outside) bits.push(`Outside ${par.valid[0]}…${par.valid[1]}, ${par.outside}.`);
    return bits.join(' ');
  }
  if (eq) return `${eq.says}: ${eq.text}${cite(eq.from)}.${eq.valid ? ` Holds for ${eq.valid}.` : ''}`;
  return null;
}

/**
 * The block as lines a model reads, bounded.
 *
 * Ordered by what a reader is most likely to be misled about: what model this
 * is, in what coordinates, computed how, and what it is NOT. The limitations
 * come before the equations on purpose — a prompt that runs out of room should
 * lose the algebra rather than the caveats.
 */
export function scienceLines(meta: ScienceMeta, limit = 28): string[] {
  const lines: string[] = [];
  const spread = fidelitySpread(meta.outputs);
  lines.push(`Model: ${meta.name} v${meta.version} (${meta.domain}).`);
  lines.push(
    spread.weakest === spread.strongest
      ? `Everything here is ${FIDELITY_SAYS[spread.weakest]}.`
      : `Mixed: ${spread.strongestOf.join(', ')} ${spread.strongestOf.length === 1 ? 'is' : 'are'} ${FIDELITY_SAYS[spread.strongest]}, while ${spread.weakestOf.join(', ')} ${spread.weakestOf.length === 1 ? 'is' : 'are'} ${FIDELITY_SAYS[spread.weakest]}. Every output below says which it is.`
  );
  if (meta.coordinates) {
    lines.push(`Coordinates: ${meta.coordinates.system}${meta.coordinates.note ? ` — ${meta.coordinates.note}` : ''}`);
  }
  if (meta.units) {
    const u = [meta.units.lengths && `lengths in ${meta.units.lengths}`, meta.units.times && `times in ${meta.units.times}`]
      .filter(Boolean)
      .join(', ');
    if (u) lines.push(`Units: ${u}${meta.units.note ? ` — ${meta.units.note}` : ''}`);
  }
  if (meta.observer) lines.push(`Observer: ${meta.observer}`);
  for (const n of meta.numerics ?? []) {
    lines.push(
      `Computed by: ${n.method}${n.order ? ` (order ${n.order})` : ''}${
        n.stopsOn?.length ? `, stopping on ${n.stopsOn.join(' or ')}` : ''
      }${n.checkedAgainst ? `; checked against ${n.checkedAgainst}` : ''}.`
    );
    if (n.fails) lines.push(`  Where it cannot resolve: ${n.fails}`);
  }
  for (const o of meta.outputs) lines.push(`Output — ${o.id}: ${o.says} [${o.fidelity}]`);
  for (const r of meta.representations ?? []) {
    if (r.notA) lines.push(`Representation — ${r.id}: ${r.shows}. NOT ${r.notA}.`);
  }
  for (const l of meta.limitations) lines.push(`Limitation: ${l}`);
  for (const a of meta.assumptions) lines.push(`Assumption: ${a}`);
  for (const e of meta.equations) lines.push(`Equation — ${e.id}: ${e.text} (${e.says})`);
  for (const r of meta.references ?? []) lines.push(`Source: ${r.label} — ${r.where}`);
  return lines.slice(0, limit);
}
