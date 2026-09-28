// lib/workspace/object.ts
//
// ONE WAY OF SAYING WHAT A THING IS, for a product that had three.
//
// Socria already stores intellectual objects in three places, and all three
// are good:
//
//   the Reasoning Ledger (lib/core4/types.ts)  claims, assumptions, evidence,
//     questions — with an OWNER, a STANCE, a BASIS and a revision history.
//     The most careful of the three about where a thing came from.
//   the Thinking Map (lib/logos.ts)            the same vocabulary drawn as
//     nodes and edges, with a type and a status.
//   the model engine (lib/model/schema.ts)     surfaces, trajectories,
//     parameters — with provenance and an earned fidelity.
//
// What none of them has is a way to say that a claim in the ledger, a node on
// the map and a parameter in a model are the SAME KIND OF THING to a person
// looking at them: something you can select, trace, challenge, research and
// change. So each surface grew its own selection, its own inspector and its
// own idea of "where did this come from", and a question asked in one could
// not be answered from another.
//
// This file is that missing vocabulary. It is NOT a fourth store: nothing
// here persists anything. The three stores project into it (adapters.ts),
// keeping their own ids, and what comes back is a view they can all be asked
// questions about.
//
// THREE THINGS KEPT SEPARATE, on purpose, because collapsing them is the
// commonest way a research tool starts lying:
//
//   TYPE        what kind of thing it is            a claim
//   PROVENANCE  where it came from                  the person wrote it
//   EPISTEMIC   how well it is held                 assumed, not yet supported
//
// A user-written claim that is merely assumed and a user-written claim that
// three sources support are the same type with the same provenance and
// entirely different standing. One field for all three would make them look
// identical, which is exactly the confusion this product exists to remove.

// ── what kind of thing ──────────────────────────────────────────────

/**
 * The types. Long, flat, and a superset of what the three stores already use
 * — the ledger's twelve kinds, the map's node types, the engine's object
 * kinds — so nothing has to be renamed to be spoken about here.
 */
export const OBJECT_TYPES = [
  // reasoning
  'idea', 'claim', 'assumption', 'question', 'hypothesis', 'evidence',
  'objection', 'alternative', 'inference', 'conclusion', 'decision',
  'criterion', 'constraint', 'option', 'uncertainty', 'tension',
  'goal', 'value', 'belief', 'consequence', 'concept', 'misconception',
  // material
  'source', 'dataset', 'datapoint', 'annotation', 'draft-section', 'research-result',
  // modelling
  'variable', 'parameter', 'definition', 'equation', 'model', 'simulation',
  'simulation-run', 'observation', 'component', 'event', 'state', 'visual-object',
  // research method
  'method', 'population', 'measurement', 'limitation',
  // the durable ones — things in the world and things about a life, which the
  // Mind Graph has always kept and the reasoning vocabulary had no word for.
  // Without these a Person or a Project arriving from durable memory would be
  // flattened to 'concept', and "who" would stop being distinguishable from
  // "what".
  'person', 'organization', 'place', 'project', 'preference', 'plan',
  'insight', 'experience', 'conversation',
] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

/**
 * Claims are not one thing.
 *
 * "Sales fell 12%" and "the price rise caused sales to fall" are both claims
 * and one of them is a statement about mechanism. A tool that treats them
 * interchangeably will eventually draw a correlation as a cause, so the
 * distinction is a field rather than a convention.
 */
export const CLAIM_KINDS = [
  'observation', 'description', 'assumption', 'hypothesis',
  'statistical-association', 'causal-claim', 'prediction', 'inference', 'conclusion',
] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

// ── where it came from ──────────────────────────────────────────────

/**
 * Provenance classes. A thing may have SEVERAL — that is the point.
 *
 * A claim the person wrote, supported by two papers, is user-authored AND
 * source-supported, and flattening that to one label loses the fact that
 * makes it interesting. So provenance is a list, each entry with its own
 * detail and its own moment.
 */
export const ORIGINS = [
  'user', 'socria-inference', 'socria-generated', 'research-source',
  'connected-source', 'uploaded-source', 'dataset', 'computation',
  'simulation', 'imported', 'system',
] as const;
export type Origin = (typeof ORIGINS)[number];

export interface ProvenanceEntry {
  origin: Origin;
  /** a citation, a file name, a solver, the turn it was said in */
  detail?: string;
  /** the person's own words this rests on, where it rests on words */
  quote?: string;
  at?: number;
  /** the object this came out of — a source, a dataset, a model */
  from?: string;
}

/**
 * How well the thing is held. SEPARATE FROM PROVENANCE, because a research
 * source can support something weakly and a person can assert something
 * flatly, and neither fact is about where it came from.
 *
 * Nothing here is a percentage. A number between 0 and 1 attached to a claim
 * is a confidence nobody measured, and this product does not manufacture
 * those — `confidence` exists only where a mechanism actually produced one
 * (a matcher's score, a checker's threshold) and says which.
 */
export const EPISTEMIC_STATES = [
  'known', 'observed', 'user-asserted', 'source-supported',
  'multi-source-supported', 'inferred', 'assumed', 'disputed',
  'uncertain', 'unknown', 'computed', 'simulated', 'illustrative',
  // Replaced, not refuted, and not the same as disputed: "you thought A until
  // March" is frequently the most useful thing in a workspace, and a
  // vocabulary that can only say `disputed` turns a change of mind into an
  // argument. Durable memory has tracked this all along (NODE_STATUSES in
  // lib/mind/types.ts); the workspace could not say it until now.
  'superseded',
] as const;
export type EpistemicState = (typeof EPISTEMIC_STATES)[number];

export const EPISTEMIC_SAYS: Record<EpistemicState, string> = {
  known: 'established well enough not to be in question here',
  observed: 'observed or measured rather than argued',
  'user-asserted': 'you stated it',
  'source-supported': 'one source supports it',
  'multi-source-supported': 'more than one source supports it',
  inferred: 'Socria inferred it, and nothing has confirmed it',
  assumed: 'taken as given for now, with nothing behind it yet',
  disputed: 'sources or claims disagree about it',
  uncertain: 'held loosely; the evidence does not settle it',
  unknown: 'nobody here has said where this stands',
  computed: 'produced by a computation',
  simulated: 'produced by a simulation',
  illustrative: 'there to make something legible, not to be relied on',
  superseded: 'replaced by a later version of itself, and kept',
};

/** States that mean "this is not settled", for the health and gap passes. */
export const UNSETTLED: readonly EpistemicState[] = [
  'assumed', 'inferred', 'disputed', 'uncertain', 'unknown',
];

/**
 * Something upstream changed, and this has not been looked at since.
 *
 * NOT A JUDGEMENT ABOUT TRUTH, which is why it is its own field and not an
 * epistemic state: a claim resting on an assumption the person just corrected
 * is not thereby wrong, it is UNCHECKED. Collapsing the two would either
 * quietly demote work that is still fine or quietly keep work that isn't.
 *
 * `kind` is the only part a machine may act on by itself. A `recompute` mark
 * sits on something a computation produced, and re-running the computation is
 * not an opinion. A `review` mark sits on a claim, and nothing here is allowed
 * to decide a claim on the person's behalf — the mark exists to tell them
 * where to look, and only they can clear it.
 */
export interface Stale {
  /** the object whose change caused this */
  because: string;
  /** its label at the time, so the mark still reads after a rename */
  label?: string;
  at: number;
  kind: 'recompute' | 'review';
  /** how far from the change: 1 is directly attached */
  distance?: number;
}

export interface Uncertainty {
  plusMinus?: number;
  range?: [number, number];
  /** what the interval means: '95% CI', 'across the ensemble' */
  says?: string;
  /** in words, where there is no number and pretending otherwise would lie */
  note?: string;
}

// ── the object ──────────────────────────────────────────────────────

/**
 * One intellectual object.
 *
 * FIVE REQUIRED FIELDS. The temptation with a schema like this is to require
 * everything and end up with a god-object nobody can construct; the opposite
 * failure is a bag of optionals that means nothing. So: an id, a type, a
 * label, where it came from, and how it is held. Everything else is carried
 * when a surface has it.
 */
export interface WObject {
  id: string;
  type: ObjectType;
  label: string;
  provenance: ProvenanceEntry[];
  epistemic: EpistemicState;

  /** the full text, where the label is a summary of something longer */
  content?: string;
  /** one sentence: what it IS. Never what it proves. */
  meaning?: string;
  /** for a claim: which kind of claim. See CLAIM_KINDS. */
  claimKind?: ClaimKind;
  /** for a question: where it stands */
  question?: QuestionState;

  value?: number;
  units?: string;
  uncertainty?: Uncertainty;

  /** which surface holds the canonical copy: 'ledger', 'map', 'model', 'draft' */
  surface?: string;
  /** the id it has in that surface, when it differs */
  surfaceId?: string;

  createdBy?: Actor;
  createdAt?: number;
  modifiedBy?: Actor;
  modifiedAt?: number;

  /**
   * The person has said what this is, and Socria may not re-decide it.
   *
   * THE SINGLE MOST IMPORTANT FLAG IN THIS FILE. An extractor that keeps
   * re-typing a corrected object is a product that argues with its user about
   * their own reasoning, and the user is right by construction: it is their
   * thinking. See correct() in store.ts.
   */
  locked?: LockedField[];

  /** something it rests on changed; see Stale */
  stale?: Stale;

  /** free, uninterpreted, bounded — a surface's own note to itself */
  meta?: Record<string, string | number | boolean>;
}

export type Actor = 'user' | 'socria' | 'system' | 'collaborator';
export type LockedField = 'type' | 'epistemic' | 'label' | 'claimKind';

export const QUESTION_STATES = [
  'open', 'partially-resolved', 'resolved', 'deferred', 'abandoned',
] as const;
export type QuestionState = (typeof QUESTION_STATES)[number];

// ── relationships, which are objects too ────────────────────────────

/**
 * The relation vocabulary, and it is a superset of the three that exist:
 * the ledger's ten, the map's four, the engine's nineteen. A relation named
 * in any of them is nameable here without translation loss.
 */
export const RELATION_TYPES = [
  'supports', 'contradicts', 'depends-on', 'derived-from', 'assumes',
  'constrains', 'causes', 'influences', 'correlates-with', 'measures',
  'defines', 'parameterizes', 'uses', 'evidence-for', 'evidence-against',
  'part-of', 'precedes', 'follows', 'transforms-into', 'compared-with',
  'alternative-to', 'generated-by', 'computed-from', 'simulated-from',
  'responds-to', 'resolves', 'reopens', 'rejected-because', 'changed-because',
  'relates-to',
  // One thing, held on two surfaces. Deliberately NOT traversed by upstream or
  // downstream walks: the remembered copy of a claim is not a thing the claim
  // rests on, and following it would mix one surface's grounds into another's
  // as though they were the same evidence. Trace reports it separately.
  'same-as',
  // A reason FOR something, which durable memory has always recorded
  // (motivated_by) and this vocabulary could only flatten to 'influences' —
  // losing the fact that a decision rests on its reasons, so a trace of the
  // decision never reached them.
  'motivated-by',
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

/** Relations that assert a mechanism. Never inferred from co-occurrence. */
export const CAUSAL_RELATIONS: readonly RelationType[] = ['causes', 'influences'];

/** Relations followed when asking what something rests on. */
export const UPSTREAM_RELATIONS: readonly RelationType[] = [
  'depends-on', 'derived-from', 'assumes', 'computed-from', 'simulated-from',
  'generated-by', 'uses', 'part-of', 'follows', 'motivated-by',
];

/** Relations that carry evidential weight, in each direction. */
export const SUPPORTING: readonly RelationType[] = ['supports', 'evidence-for'];
export const OPPOSING: readonly RelationType[] = ['contradicts', 'evidence-against'];

/**
 * A relationship. It has its own id and its own provenance, because
 * "Socria thinks A supports B" and "the person drew that arrow" are different
 * claims about the world and a workspace that cannot tell them apart will
 * present the first as the second.
 */
export interface Relationship {
  id: string;
  type: RelationType;
  from: string;
  to: string;
  provenance: ProvenanceEntry[];
  /** in the person's words: why this holds */
  why?: string;
  /** only where a mechanism produced one, and it says which */
  confidence?: { value: number; by: string };
  createdBy?: Actor;
  createdAt?: number;
  locked?: boolean;
}

// ── sanitising, because all of this crosses boundaries ──────────────

export const WS_LIMITS = {
  label: 300,
  content: 20_000,
  meaning: 500,
  provenance: 8,
  quote: 400,
  detail: 300,
  meta: 16,
} as const;

// Ids are opaque and are GENERATED, not typed: a projected object carries its
// surface and its own id ("model:saddle:param:a") and a relationship carries
// both ends ("model:saddle:z~depends-on~model:saddle:param:a"). The separators
// are part of that, and a pattern that refused them silently dropped every
// dependency edge a model declared — which the suite caught as "a control
// reaches nothing".
const ID = /^[a-z0-9][a-z0-9_:.~>-]{0,159}$/i;
const text = (v: unknown, n: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  (list as readonly string[]).includes(v as string) ? (v as T) : fallback;

export function sanitizeProvenance(raw: unknown): ProvenanceEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ProvenanceEntry[] = [];
  for (const r of raw.slice(0, WS_LIMITS.provenance)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    // AN UNKNOWN ORIGIN IS 'system', not 'user'. The direction that fails
    // safe is the one that never credits a person with something they did
    // not say.
    const entry: ProvenanceEntry = { origin: oneOf(o.origin, ORIGINS, 'system') };
    const detail = text(o.detail, WS_LIMITS.detail);
    if (detail) entry.detail = detail;
    const quote = text(o.quote, WS_LIMITS.quote);
    if (quote) entry.quote = quote;
    const at = num(o.at);
    if (at !== null) entry.at = at;
    const from = text(o.from, 160);
    if (ID.test(from)) entry.from = from;
    out.push(entry);
  }
  return out;
}

export function sanitizeObject(raw: unknown): WObject | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 160);
  const label = text(r.label, WS_LIMITS.label);
  if (!ID.test(id) || !label) return null;

  const out: WObject = {
    id,
    type: oneOf(r.type, OBJECT_TYPES, 'idea'),
    label,
    provenance: sanitizeProvenance(r.provenance),
    // UNKNOWN IS THE DEFAULT, and it is an honest one: a thing whose standing
    // nobody has said anything about is not "known", it is unsaid.
    epistemic: oneOf(r.epistemic, EPISTEMIC_STATES, 'unknown'),
  };

  const opt = (k: keyof WObject, v: unknown) => {
    if (v !== undefined && v !== '' && v !== null) {
      (out as unknown as Record<string, unknown>)[k] = v;
    }
  };
  opt('content', text(r.content, WS_LIMITS.content));
  opt('meaning', text(r.meaning, WS_LIMITS.meaning));
  opt('surface', text(r.surface, 32));
  opt('surfaceId', text(r.surfaceId, 64));
  opt('units', text(r.units, 24));
  if (r.claimKind !== undefined) out.claimKind = oneOf(r.claimKind, CLAIM_KINDS, 'description');
  if (r.question !== undefined) out.question = oneOf(r.question, QUESTION_STATES, 'open');
  const value = num(r.value);
  if (value !== null) out.value = value;
  for (const k of ['createdBy', 'modifiedBy'] as const) {
    const a = oneOf(r[k], ['user', 'socria', 'system', 'collaborator'] as const, 'system');
    if (r[k] !== undefined) out[k] = a;
  }
  for (const k of ['createdAt', 'modifiedAt'] as const) {
    const t = num(r[k]);
    if (t !== null) out[k] = t;
  }

  const u = r.uncertainty as Record<string, unknown> | undefined;
  if (u && typeof u === 'object') {
    const unc: Uncertainty = {};
    const pm = num(u.plusMinus);
    if (pm !== null) unc.plusMinus = Math.abs(pm);
    if (Array.isArray(u.range) && u.range.length === 2) {
      const a = num(u.range[0]);
      const b = num(u.range[1]);
      if (a !== null && b !== null) unc.range = a <= b ? [a, b] : [b, a];
    }
    const says = text(u.says, 120);
    if (says) unc.says = says;
    const note = text(u.note, 240);
    if (note) unc.note = note;
    if (Object.keys(unc).length) out.uncertainty = unc;
  }

  if (Array.isArray(r.locked)) {
    const locked = r.locked.filter((x): x is LockedField =>
      ['type', 'epistemic', 'label', 'claimKind'].includes(x as string)
    );
    if (locked.length) out.locked = [...new Set(locked)];
  }

  const st = r.stale as Record<string, unknown> | undefined;
  if (st && typeof st === 'object') {
    const because = text(st.because, 160);
    const at = num(st.at);
    if (ID.test(because) && at !== null) {
      out.stale = {
        because,
        at,
        kind: oneOf(st.kind, ['recompute', 'review'] as const, 'review'),
        ...(text(st.label, WS_LIMITS.label) ? { label: text(st.label, WS_LIMITS.label) } : {}),
        ...(num(st.distance) !== null ? { distance: Math.max(1, Math.round(num(st.distance) as number)) } : {}),
      };
    }
  }

  if (r.meta && typeof r.meta === 'object' && !Array.isArray(r.meta)) {
    const meta: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(r.meta as Record<string, unknown>).slice(0, WS_LIMITS.meta)) {
      const key = text(k, 24);
      if (!/^[a-z][a-z0-9_-]{0,23}$/i.test(key)) continue;
      if (typeof v === 'number' && Number.isFinite(v)) meta[key] = v;
      else if (typeof v === 'boolean') meta[key] = v;
      else if (typeof v === 'string' && text(v, 200)) meta[key] = text(v, 200);
    }
    if (Object.keys(meta).length) out.meta = meta;
  }
  return out;
}

export function sanitizeRelationship(raw: unknown): Relationship | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 160);
  const from = text(r.from, 160);
  const to = text(r.to, 160);
  if (!ID.test(id) || !ID.test(from) || !ID.test(to) || from === to) return null;
  const out: Relationship = {
    id,
    type: oneOf(r.type, RELATION_TYPES, 'relates-to'),
    from,
    to,
    provenance: sanitizeProvenance(r.provenance),
  };
  const why = text(r.why, 300);
  if (why) out.why = why;
  const c = r.confidence as Record<string, unknown> | undefined;
  if (c && typeof c === 'object') {
    const v = num(c.value);
    const by = text(c.by, 60);
    // A confidence with no mechanism named is a number somebody made up.
    if (v !== null && by) out.confidence = { value: Math.min(1, Math.max(0, v)), by };
  }
  const by = r.createdBy;
  if (by !== undefined) out.createdBy = oneOf(by, ['user', 'socria', 'system', 'collaborator'] as const, 'system');
  const at = num(r.createdAt);
  if (at !== null) out.createdAt = at;
  if (r.locked === true) out.locked = true;
  return out;
}

// ── reading an object ───────────────────────────────────────────────

/** Did a person put this here? Asked often enough to be worth one answer. */
export function isUsers(o: WObject): boolean {
  return o.provenance.some((p) => p.origin === 'user') || o.createdBy === 'user';
}

/** Did Socria infer it, with nothing since confirming it? */
export function isInferred(o: WObject): boolean {
  return (
    !isUsers(o) &&
    o.provenance.some((p) => p.origin === 'socria-inference' || p.origin === 'socria-generated')
  );
}

/** Is it standing on something outside this conversation? */
export function hasSource(o: WObject): boolean {
  return o.provenance.some(
    (p) =>
      p.origin === 'research-source' ||
      p.origin === 'connected-source' ||
      p.origin === 'uploaded-source' ||
      p.origin === 'dataset'
  );
}

/**
 * Where it came from, in one sentence a person can read.
 *
 * Mixed provenance is said as mixed: "you wrote it, and two sources support
 * it" rather than picking whichever origin happens to be first.
 */
export function originLine(o: WObject): string {
  if (!o.provenance.length) return 'Nothing here records where this came from.';
  const by = (origin: Origin): string => {
    switch (origin) {
      case 'user': return 'you wrote it';
      case 'socria-inference': return 'Socria inferred it';
      case 'socria-generated': return 'Socria wrote it';
      case 'research-source': return 'it came from research';
      case 'connected-source': return 'it came from a connected source';
      case 'uploaded-source': return 'it came from something you uploaded';
      case 'dataset': return 'it came from data';
      case 'computation': return 'a computation produced it';
      case 'simulation': return 'a simulation produced it';
      case 'imported': return 'it was imported';
      case 'system': return 'the system put it there';
    }
  };
  const seen: string[] = [];
  for (const p of o.provenance) {
    const said = by(p.origin) + (p.detail ? ` (${p.detail})` : '');
    if (!seen.includes(said)) seen.push(said);
  }
  const head = seen.slice(0, 3).join('; and ');
  return `${head.charAt(0).toUpperCase()}${head.slice(1)}.`;
}

// ── schema version, because this will change ────────────────────────

/**
 * The version a stored workspace was written at.
 *
 * Logos will keep moving and somebody's dissertation should not break when it
 * does. `migrate` is the only door in: every load goes through it, unknown
 * futures are refused rather than half-read, and each step is small enough to
 * be read in one sitting.
 */
export const SCHEMA_VERSION = 1;

export interface StoredWorkspace {
  version: number;
  objects: unknown[];
  relationships: unknown[];
  [k: string]: unknown;
}

export function migrate(raw: unknown): { objects: WObject[]; relationships: Relationship[]; from: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as StoredWorkspace;
  const from = typeof s.version === 'number' ? s.version : 0;
  // A file from a LATER version is not read at all: guessing at fields that
  // did not exist yet is how a newer project comes back subtly wrong.
  if (from > SCHEMA_VERSION) return null;
  const objects = (Array.isArray(s.objects) ? s.objects : []).map(sanitizeObject).filter(Boolean) as WObject[];
  const relationships = (Array.isArray(s.relationships) ? s.relationships : [])
    .map(sanitizeRelationship)
    .filter(Boolean) as Relationship[];
  // Version 0 had no relationship ids; sanitize already refuses those, which
  // is the correct loss — an edge nobody can name cannot be corrected later.
  return { objects, relationships, from };
}
