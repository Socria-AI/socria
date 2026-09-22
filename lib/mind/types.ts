// lib/mind/types.ts
//
// The Mind Graph's vocabulary. Pure: no React, no storage, no network, no
// clock of its own.
//
// THE ARCHITECTURAL COMMITMENT, because everything here depends on it: there
// is no memory store behind this graph. A node IS a memory. Nothing extracts
// memories into a list and then draws a graph of them — extraction produces
// nodes and edges directly, retrieval walks edges, and the Memory page reads
// the same rows the prompt was built from. If a node is not in the graph,
// Core does not know it.
//
// What that rules out is the shape this replaces: lib/person-memory.ts, a
// flat list of typed one-liners scored against the current message and cut at
// k. That store cannot say a constraint CAUSED a decision, cannot hold a
// belief becoming another belief, and lives inside a jsonb array on one row
// where nothing can be indexed or joined.
//
// Four invariants come across from it unchanged, because each was learned the
// hard way and each would be easy to lose in a rewrite:
//
//   1. FORGETTING HOLDS. A deleted node leaves a tombstone, and every write
//      path checks tombstones before creating. Otherwise the next extraction
//      notices the same thing again and resurrects it.
//   2. STATED IS NOT INFERRED. Now one axis of a wider provenance taxonomy.
//   3. PRIVATE STAYS PRIVATE. Nodes from weighty Core conversations never
//      reach Logos, whose map can be exported as an image.
//   4. A PLAN IS A WINDOW. Every account stores the same amount; a plan
//      changes how much is carried into a conversation, never what is kept.

// ── what a node can be ───────────────────────────────────────────────

/**
 * The seed ontology. `type` is a STRING, not a union, on purpose: the brief
 * asks for extensibility and a closed set would mean a migration every time
 * the ontology grows. This list drives the picker, the colours and the
 * extractor's suggestions; an unrecognised type still stores and still
 * renders, in a neutral colour.
 */
export const KNOWN_NODE_TYPES = [
  'Person', 'Organization', 'Project', 'Place', 'Concept', 'Goal', 'Plan',
  'Decision', 'Preference', 'Belief', 'Assumption', 'Question', 'Uncertainty',
  'Insight', 'Evidence', 'Source', 'Event', 'Experience', 'Conversation',
] as const;

export type KnownNodeType = (typeof KNOWN_NODE_TYPES)[number];
/** A node's type. Known ones are listed above; anything else is allowed. */
export type NodeType = KnownNodeType | (string & {});

export function isKnownType(t: string): t is KnownNodeType {
  return (KNOWN_NODE_TYPES as readonly string[]).includes(t);
}

/**
 * Types that record something that HAPPENED, or name something in the world.
 *
 * The list is inverted on purpose, and this is the important part: `type` is
 * an open string, so a list of what DOES generalise can be stepped over by
 * inventing a word. Measured, before this changed: Belief, Preference and
 * Assumption were held back, while the identical claim typed Trait, Pattern,
 * Tendency, Characteristic, Insight or Concept was believed on one
 * conversation's evidence. The gate's central rule was one synonym from
 * being optional.
 *
 * So anything NOT here — including every type nobody has thought of yet — is
 * treated as a claim about the person and needs corroboration. An unfamiliar
 * word now fails toward caution instead of toward belief.
 *
 * What is exempt: things that happened (Event, Experience, Conversation),
 * things that exist (Person, Organization, Place, Project, Source,
 * Evidence), and things explicitly open rather than asserted (Question,
 * Uncertainty). None of those says anything durable about who somebody is.
 */
export const OCCURRENCE_TYPES = new Set<string>([
  'Event', 'Experience', 'Conversation',
  'Person', 'Organization', 'Place', 'Project', 'Source', 'Evidence',
  'Question', 'Uncertainty',
]);

/**
 * Does this type assert something durable about the person?
 *
 * Asked of NORMALISED names, because a fingerprint stores "project", not
 * "Project", and a raw `Set.has` on the ontology's casing would have answered
 * "generalising" for every occurrence type arriving from a tombstone. That is
 * the same casing mismatch that killed typesCompatible silently, and it is
 * worth closing here before a caller depends on it rather than after.
 */
const OCCURRENCE_NORMALIZED: ReadonlySet<string> = new Set(
  [...OCCURRENCE_TYPES].map((t) => normalize(t))
);

export function isGeneralising(type: string): boolean {
  return !OCCURRENCE_NORMALIZED.has(normalize(type));
}

// ── status ──────────────────────────────────────────────────────────

export const NODE_STATUSES = [
  'active', 'tentative', 'uncertain', 'historical',
  'superseded', 'contradicted', 'archived',
] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

/**
 * How much a status discounts a node during retrieval.
 *
 * Note what this is NOT: a filter. `superseded` is 0.5 rather than 0
 * deliberately — "you used to think A, and moved to B in March when the
 * lease fell through" is frequently the most useful thing in the graph, and
 * excluding it would make preserving evolution pointless. Status changes how
 * a node scores and how it is LABELLED in the prompt, never whether it can
 * be reached.
 */
export const STATUS_WEIGHT: Record<NodeStatus, number> = {
  active: 1.0,
  tentative: 0.8,
  uncertain: 0.7,
  contradicted: 0.7,
  historical: 0.6,
  superseded: 0.5,
  archived: 0.2,
};

// ── relationships ───────────────────────────────────────────────────

export const KNOWN_RELATIONSHIPS = [
  'supports', 'contradicts', 'depends_on', 'part_of', 'caused',
  'motivated_by', 'constrained_by', 'changed_into', 'superseded_by',
  'evidence_for', 'associated_with', 'belongs_to', 'resulted_in',
  'version_of', 'works_on', 'learned_from', 'mentioned_in', 'derived_from',
] as const;
export type KnownRelationship = (typeof KNOWN_RELATIONSHIPS)[number];
export type Relationship = KnownRelationship | (string & {});

/**
 * How well a relationship conducts activation.
 *
 * Not all relationships carry recall equally. Being told about a decision
 * should bring to mind what caused it and what it superseded; it should bring
 * to mind something merely "associated with" it much more weakly, or the
 * graph floods on every hop. Unlisted relationships take the default.
 */
export const REL_WEIGHT: Record<string, number> = {
  superseded_by: 1.0,
  contradicts: 1.0,
  caused: 0.95,
  motivated_by: 0.95,
  resulted_in: 0.9,
  evidence_for: 0.9,
  supports: 0.85,
  constrained_by: 0.85,
  depends_on: 0.8,
  part_of: 0.8,
  works_on: 0.8,
  belongs_to: 0.75,
  changed_into: 0.9,
  version_of: 0.7,
  learned_from: 0.7,
  derived_from: 0.6,
  mentioned_in: 0.4,
  associated_with: 0.4,
};
export const REL_WEIGHT_DEFAULT = 0.5;

export function relWeight(r: Relationship): number {
  return REL_WEIGHT[r] ?? REL_WEIGHT_DEFAULT;
}

/** Relationships that mean "this node has a partner you must not show alone". */
export const PARTNER_RELATIONSHIPS = new Set<string>([
  'superseded_by', 'contradicts', 'changed_into',
]);

// ── provenance ──────────────────────────────────────────────────────

/**
 * WHERE a claim came from, and in what register it was offered.
 *
 * The register half is the brief's §3 and it does real work rather than
 * sitting in the record: see gate.ts, where `joke`, `hypothetical` and
 * `example` are refused a node at all, and `inferred` is refused the right to
 * mint a belief about the person on first sight.
 */
export const PROVENANCE_KINDS = [
  'stated',       // said in so many words
  'inferred',     // read between the lines
  'hypothesis',   // Socria's own guess, offered as one
  'temporary',    // true right now and not after — never persists
  'joke',
  'hypothetical', // "suppose I did move to Berlin"
  'example',      // offered to illustrate, not to assert
  'tentative',    // a position being tried on
  'established',  // held and repeated
  'researched',   // fetched from a source
  'calculated',   // computed
] as const;
export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];

export const PROVENANCE_SURFACES = ['core', 'logos', 'file', 'import', 'tool', 'user'] as const;
export type ProvenanceSurface = (typeof PROVENANCE_SURFACES)[number];

export interface Provenance {
  kind: ProvenanceKind;
  surface: ProvenanceSurface;
  at: number;
  conversationId?: string;
  messageId?: string;
  /** the Source node a file-derived claim came from */
  sourceNodeId?: string;
  /** where in that file, so the Memory page can show the sentence */
  charStart?: number;
  charEnd?: number;
  /** what the person said when they challenged or corrected it */
  note?: string;
}

// ── the objects themselves ──────────────────────────────────────────

export interface MindNode {
  id: string;
  type: NodeType;
  /** short canonical name: the resolution key and the UI label */
  label: string;
  /** the claim itself, a sentence or two */
  content: string;
  /** other surface forms seen for the same thing */
  aliases: string[];
  status: NodeStatus;
  /** 0..1 — how sure SOCRIA is this is true */
  confidence: number;
  /** 0..1 — how sure THE PERSON seemed. A different question. */
  certainty: number;
  /** 0..1 — how much it matters to them */
  importance: number;
  /** 0..1 — decayed recall strength, written on access */
  activation: number;
  /** distinct extractions that reinforced it; never below 1 */
  seen: number;
  /** from a weighty conversation: never carried into Logos */
  private: boolean;
  /** grounds, oldest first. An ARRAY because grounds accumulate. */
  provenance: Provenance[];
  createdAt: number;
  updatedAt: number;
  lastAccessed: number;
}

export interface MindEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: Relationship;
  confidence: number;
  /** 0..1 — how strongly activation flows across it */
  strength: number;
  provenance: Provenance[];
  createdAt: number;
  updatedAt: number;
  lastReinforced: number;
}

/**
 * A claim about the person that has been noticed once and is not yet
 * believed.
 *
 * This is what makes "a generalisation needs a second sighting" implementable
 * rather than merely stated. Without somewhere to record the first sighting,
 * the rule blocks every sighting forever: nothing is created, so nothing can
 * be matched, so the second sighting looks exactly like the first and a real
 * pattern could never be learned. Holding the candidate here — not as a node,
 * invisible to retrieval, never reaching a prompt — lets corroboration
 * accumulate without anything being believed on one afternoon's evidence.
 */
export interface PendingClaim {
  fingerprint: string;
  type: NodeType;
  label: string;
  content: string;
  /**
   * The DISTINCT conversations that have proposed it.
   *
   * Counting extractions would not do. Ten turns of one conversation about
   * one difficult meeting will have the model concluding the same thing
   * about the person ten times, and that is one afternoon read ten times
   * over, not ten pieces of evidence. The brief's word is "isolated", and
   * isolation is per conversation, not per turn.
   */
  sources: string[];
  firstAt: number;
  lastAt: number;
}

/**
 * The source id recorded when a sighting arrives with no conversation.
 *
 * It can never corroborate anything: isolation is per conversation, and an
 * unknown conversation is not a second one. Named rather than inlined so the
 * ledger and the gate cannot drift apart about what it means — which they
 * did once, and the rule failed open.
 */
export const UNKNOWN_SOURCE = '?';

/** How long a lone sighting waits for corroboration before it is dropped. */
export const PENDING_TTL_MS = 60 * 86_400_000;
export const MAX_PENDING = 200;

/** A whole graph, as the pure functions take it. */
export interface MindGraph {
  nodes: MindNode[];
  edges: MindEdge[];
  /** fingerprints of what has been forgotten; only ever grows */
  tombstones: string[];
  /** noticed once, not yet believed — see PendingClaim */
  pending: PendingClaim[];
}

export const EMPTY_GRAPH: MindGraph = { nodes: [], edges: [], tombstones: [], pending: [] };

// ── identity and forgetting ─────────────────────────────────────────

/** Casefold, strip punctuation, collapse whitespace. */
export function normalize(s: unknown): string {
  return typeof s === 'string'
    ? s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

/**
 * What a tombstone remembers about a node.
 *
 * Type plus normalised label, NOT the id: an id is regenerated on every
 * extraction, so an id-keyed tombstone would stop nothing. The point is that
 * re-deriving the same thing under a new id is still refused.
 */
export function fingerprintNode(type: string, label: string): string {
  return `n:${normalize(type)}|${normalize(label)}`;
}

/**
 * The key a not-yet-believed claim is held under.
 *
 * TYPE-AGNOSTIC, unlike a node fingerprint, and for a reason that is the
 * mirror of why node tombstones include the type: the same claim arriving as
 * a Belief, then a Preference, then an Assumption is the SAME sighting seen
 * twice, and keying on the type meant it never accumulated — a genuine
 * pattern could recur across a dozen conversations and stay permanently
 * unbelievable because the extractor kept picking a different word for it.
 *
 * Conflation is handled at corroboration instead, by comparing what the two
 * sightings actually said (see claimsAgree). Putting content in the key
 * would be worse: wording varies between extractions, so the key would
 * almost never match and nothing would ever corroborate at all.
 */
export function fingerprintClaim(label: string): string {
  return `g:${normalize(label)}`;
}

/**
 * Are two sightings the same claim, or two claims that share a name?
 *
 * Token overlap, deliberately loose. "They avoid conflict" and "They tend to
 * avoid disagreeing openly" should count as one claim seen twice; "Deadlines
 * are slipping" and "They resent deadlines" should not.
 */
export function claimsAgree(a: string, b: string): boolean {
  const toks = (t: string) =>
    new Set(normalize(t).split(' ').filter((w) => w.length > 3));
  const x = toks(a);
  const y = toks(b);
  if (!x.size || !y.size) return true; // nothing to disagree about
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / Math.min(x.size, y.size) >= 0.34;
}

export function fingerprintEdge(
  sourceType: string, sourceLabel: string,
  relationship: string,
  targetType: string, targetLabel: string
): string {
  return `e:${fingerprintNode(sourceType, sourceLabel)}|${normalize(relationship)}|${fingerprintNode(targetType, targetLabel)}`;
}

export function isForgotten(graph: MindGraph, fingerprint: string): boolean {
  return graph.tombstones.includes(fingerprint);
}

/** Read a node tombstone back into the type and label it was made from. */
export function parseNodeTombstone(fp: string): { type: string; label: string } | null {
  if (!fp.startsWith('n:')) return null;
  const bar = fp.indexOf('|', 2);
  if (bar < 0) return null;
  return { type: fp.slice(2, bar), label: fp.slice(bar + 1) };
}

// ── limits ──────────────────────────────────────────────────────────

export const MAX_LABEL = 80;
export const MAX_CONTENT = 400;
export const MAX_ALIASES = 8;
/** Per user. Not a plan boundary — see the header's invariant 4. */
export const MAX_NODES = 5_000;
export const MAX_EDGES = 20_000;

export function clamp01(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Keep a provenance list bounded WITHOUT losing what matters in it.
 *
 * A blind tail slice was wrong: the entries that carry a `note` are the
 * record of a supersession, a correction or a challenge — the history the
 * whole design exists to preserve — and twenty ordinary reinforcements would
 * push the reason somebody disagreed off the front, leaving a node marked
 * `contradicted` with nothing saying why. The first entry goes too, because
 * where a claim originally came from is not replaceable by a later sighting.
 */
export const MAX_PROVENANCE = 20;

export function boundProvenance(list: Provenance[]): Provenance[] {
  if (list.length <= MAX_PROVENANCE) return list;
  const first = list[0];
  const noted = list.filter((p) => p.note && p !== first);
  const plain = list.filter((p) => !p.note && p !== first);
  const room = Math.max(0, MAX_PROVENANCE - 1 - noted.length);
  // Notes are never dropped; ordinary sightings are, oldest first.
  const kept = [first, ...plain.slice(-room), ...noted];
  // Back into the order they happened in, so the record still reads forward.
  return kept.sort((a, b) => a.at - b.at).slice(-Math.max(MAX_PROVENANCE, noted.length + 1));
}

export function clip(s: unknown, n: number): string {
  return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '';
}
