// lib/new-logos/model.ts — THE NODE: one shape for every cognitive object in New Logos.
//
// New Logos (route /new-logos, an internal name; docs/NEW-LOGOS.md) organises work as nodes. Six types to begin with
// — objective, conversation, question, knowledge, decision, artifact — share ONE row shape: identity, owner, type,
// title, description, containment (parent), type-specific content, state, provenance, ordering, archive mark, version
// and timestamps. What differs between types lives in `content` and in the states a type may take, both checked here.
//
// TWO KINDS OF STRUCTURE, KEPT APART.
//   • Containment is a tree: a node has at most one parent, and only an objective can be a parent. The nested matrix
//     draws it. A cycle is impossible by rule (lib/new-logos/rules.ts) and a parent cannot be deleted from under its
//     children (and the database refuses it too: the parent_id foreign key).
//   • Relations are a graph: typed edges between any two of a person's nodes ("informs", "answers", …). This is how a
//     knowledge node or an artifact informs several objectives without being copied.
//
// CONVERSATIONS ARE NOT COPIED. A conversation node holds only the canonical conversation's id (conversations.id);
// the title and the messages stay in the conversations table, which the existing application reads and writes too.
//
// Pure: no I/O, safe on the server and in the browser.

export const NODE_TYPES = ['objective', 'conversation', 'question', 'knowledge', 'decision', 'artifact'] as const;
export type NodeType = (typeof NODE_TYPES)[number];
export const isNodeType = (v: unknown): v is NodeType => typeof v === 'string' && (NODE_TYPES as readonly string[]).includes(v);

/** What a person sees a type called, singular and plural. Neutral words only. */
export const TYPE_LABEL: Record<NodeType, { one: string; many: string }> = {
  objective: { one: 'Objective', many: 'Objectives' },
  conversation: { one: 'Conversation', many: 'Conversations' },
  question: { one: 'Question', many: 'Questions' },
  knowledge: { one: 'Knowledge', many: 'Knowledge' },
  decision: { one: 'Decision', many: 'Decisions' },
  artifact: { one: 'Artifact', many: 'Artifacts' },
};

/** The states each type may be in, the first being where a new one starts. */
export const STATES: Record<NodeType, readonly string[]> = {
  objective: ['active', 'paused', 'achieved', 'abandoned'],
  conversation: ['active'],
  question: ['open', 'exploring', 'resolved', 'dropped'],
  knowledge: ['current', 'disputed', 'superseded'],
  // `accepted` is reached only through the explicit accept action (rules.ts), never by an ordinary edit
  decision: ['proposed', 'accepted', 'rejected', 'superseded'],
  artifact: ['draft', 'ready'],
};
export const defaultState = (t: NodeType): string => STATES[t][0];
export const validState = (t: NodeType, s: unknown): s is string => typeof s === 'string' && STATES[t].includes(s);

/** Who or what a node's content came from. */
export const ORIGINS = ['human', 'ai', 'external'] as const;
export type Origin = (typeof ORIGINS)[number];

export interface Provenance {
  origin: Origin;
  /** the conversation it was taken from, when it was taken from one */
  conversationId?: string;
  /** …and the message */
  messageId?: string;
  /** an external source: what it is called, and where it is when it has an address */
  source?: { label: string; url?: string };
  /** when the person accepted it (decisions): the only way a decision becomes theirs */
  approvedAt?: number;
}

export const RELATION_KINDS = [
  'informs',
  'supports',
  'contradicts',
  'answers',
  'investigates',
  'depends_on',
  'derived_from',
  'references',
  'related_to',
] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];
export const isRelationKind = (v: unknown): v is RelationKind => typeof v === 'string' && (RELATION_KINDS as readonly string[]).includes(v);
export const RELATION_LABEL: Record<RelationKind, string> = {
  informs: 'informs',
  supports: 'supports',
  contradicts: 'contradicts',
  answers: 'answers',
  investigates: 'investigates',
  depends_on: 'depends on',
  derived_from: 'derived from',
  references: 'references',
  related_to: 'related to',
};

/**
 * Artifact subtypes. The architecture holds many; the first release renders one. A subtype that is not available is
 * listed (so the shape is visible) but cannot be created.
 */
export const ARTIFACT_SUBTYPES = [
  { id: 'document', label: 'Document', available: true },
  { id: 'table', label: 'Table', available: false },
  { id: 'diagram', label: 'Diagram', available: false },
  { id: 'visualization', label: 'Visualisation', available: false },
  { id: 'model', label: 'Mathematical model', available: false },
  { id: 'simulation', label: 'Simulation', available: false },
  { id: 'calculator', label: 'Calculator', available: false },
  { id: 'dataset', label: 'Dataset', available: false },
  { id: 'code', label: 'Code', available: false },
  { id: 'prototype', label: 'Prototype', available: false },
  { id: 'design', label: 'Design', available: false },
  { id: 'structure', label: 'Structural representation', available: false },
] as const;
export type ArtifactSubtype = (typeof ARTIFACT_SUBTYPES)[number]['id'];
export const availableSubtype = (v: unknown): v is ArtifactSubtype =>
  ARTIFACT_SUBTYPES.some((s) => s.id === v && s.available);

export const KNOWLEDGE_KINDS = ['finding', 'evidence', 'observation', 'research', 'understanding'] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const LIMITS = {
  title: 200,
  description: 4000,
  outcome: 500,
  text: 20_000,
  document: 100_000,
  item: 300,
  items: 20,
  note: 500,
  label: 200,
  url: 2000,
  nodesPerUser: 5000,
  relationsPerUser: 20_000,
  versionsKept: 50,
} as const;

/** A stored node, as the database holds it (snake_case, like every other table here). */
export interface NodeRow {
  id: string;
  user_id: string;
  type: NodeType;
  title: string;
  description: string;
  parent_id: string | null;
  conversation_id: string | null;
  content: Record<string, unknown>;
  state: string;
  provenance: Provenance;
  position: number;
  archived_at: number | null;
  version: number;
  created_at: number;
  updated_at: number;
}

export interface RelationRow {
  id: string;
  user_id: string;
  from_id: string;
  to_id: string;
  kind: RelationKind;
  note: string;
  provenance: Provenance;
  created_at: number;
}

/** What a node was before an edit: enough to show it and to put it back. */
export interface Snapshot {
  title: string;
  description: string;
  parent_id: string | null;
  content: Record<string, unknown>;
  state: string;
  provenance: Provenance;
}

export interface VersionRow {
  id: string;
  node_id: string;
  user_id: string;
  version: number;
  snapshot: Snapshot;
  created_at: number;
}

// ── cleaning ─────────────────────────────────────────────────────────

/** A string, trimmed of control characters and capped; anything else is ''. */
export function cleanText(v: unknown, max: number, opts: { multiline?: boolean } = {}): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  let s = v.replace(opts.multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]+/g, opts.multiline ? '' : ' ');
  if (!opts.multiline) s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
}

const cleanList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => cleanText(x, LIMITS.item)).filter(Boolean).slice(0, LIMITS.items) : [];

/** http(s) only: never a script address. */
export function cleanUrl(v: unknown): string | undefined {
  const s = cleanText(v, LIMITS.url);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** An id this system made, or a canonical conversation id: letters, digits, _ and -, and not too long. */
export const cleanId = (v: unknown): string | null => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(v) ? v : null);

export function sanitizeProvenance(raw: unknown, fallback: Origin = 'human'): Provenance {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const origin: Origin = (ORIGINS as readonly string[]).includes(r.origin as string) ? (r.origin as Origin) : fallback;
  const out: Provenance = { origin };
  const conversationId = cleanId(r.conversationId);
  if (conversationId) out.conversationId = conversationId;
  const messageId = cleanId(r.messageId);
  if (messageId) out.messageId = messageId;
  const s = (r.source && typeof r.source === 'object' ? r.source : null) as Record<string, unknown> | null;
  if (s) {
    const label = cleanText(s.label, LIMITS.label);
    const url = cleanUrl(s.url);
    if (label || url) out.source = { label: label || (url ?? ''), ...(url ? { url } : {}) };
  }
  if (typeof r.approvedAt === 'number' && Number.isFinite(r.approvedAt) && r.approvedAt > 0) out.approvedAt = Math.floor(r.approvedAt);
  return out;
}

/** The content a type keeps, and nothing else. */
export function sanitizeContent(type: NodeType, raw: unknown): Record<string, unknown> {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  switch (type) {
    case 'objective': {
      const outcome = cleanText(r.outcome, LIMITS.outcome);
      return outcome ? { outcome } : {};
    }
    case 'conversation':
      return {};
    case 'question': {
      const resolution = cleanText(r.resolution, LIMITS.description, { multiline: true });
      return resolution ? { resolution } : {};
    }
    case 'knowledge': {
      const kind = (KNOWLEDGE_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as KnowledgeKind) : 'finding';
      return { kind, body: cleanText(r.body, LIMITS.text, { multiline: true }) };
    }
    case 'decision':
      return {
        rationale: cleanText(r.rationale, LIMITS.description, { multiline: true }),
        alternatives: cleanList(r.alternatives),
        uncertainties: cleanList(r.uncertainties),
      };
    case 'artifact': {
      const subtype = availableSubtype(r.subtype) ? r.subtype : 'document';
      return { subtype, format: 'markdown', body: cleanText(r.body, LIMITS.document, { multiline: true }) };
    }
  }
}

/** A snapshot of what a node holds now, for its version history. */
export const snapshotOf = (n: NodeRow): Snapshot => ({
  title: n.title,
  description: n.description,
  parent_id: n.parent_id,
  content: n.content,
  state: n.state,
  provenance: n.provenance,
});

/** A new id: a short prefix saying what it names, then randomness. */
export function newId(prefix: 'n' | 'r' | 'v'): string {
  const rnd =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `${prefix}_${rnd.slice(0, 24)}`;
}
