// lib/ux-v0/graphics/director/record.ts — what an artboard remembers of its creative direction.
//
// A conversation about one design is one continuous project. The record kept with the artboard is what makes that
// true across turns, reloads and versions: the idea the design was made from (in a sentence, with its reasons), and a
// journal of the turns since — what was asked, what was done, whether it was applied or turned down, and exactly what
// each applied turn replaced (the palette, the faces, the ground, and the changed properties of the objects it
// touched). The journal is what the creative director reads to keep an approved decision, to stay away from a
// rejected one, and to put an earlier state back exactly ("go back to the original colours") — restored by code from
// these values, never re-imagined.

export interface Snapshot {
  /** the palette and faces before the turn, when it changed them */
  colors?: Record<string, string>;
  accent2?: string | null;
  fonts?: { display: string; body: string };
  /** the artboard's ground before the turn, when it changed */
  ground?: string | null;
  /** for each object the turn changed: the properties it changed, as they were */
  nodes?: Record<string, Record<string, unknown>>;
  /** objects the turn removed, as they were, with where they sat (so a restore can put them back) */
  removed?: { node: Record<string, unknown>; index: number }[];
  /** objects the turn added (so a restore can take them out) */
  added?: string[];
}

export interface JournalEntry {
  /** the person's words */
  said: string;
  /** what was done, in a sentence */
  did: string;
  at: number;
  status: 'applied' | 'rejected';
  /** what the change was, at the level it was asked */
  level?: string;
  /** what the turn replaced (applied turns only) */
  before?: Snapshot;
}

export interface DirectedRecord {
  /** the idea the design was made from, in a sentence */
  idea?: string;
  /** why it is designed this way: the decisions with their reasons */
  rationale?: string[];
  /** what the person said must hold from now on ("always keep the logo top left"), newest last */
  standing?: string[];
  journal?: JournalEntry[];
}

export const MAX_JOURNAL = 12;
const MAX_SNAPSHOT_NODES = 40;
const MAX_SNAPSHOT_BYTES = 24_000;

const o = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const s = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max) : '');
const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const ID = /^[A-Za-z][\w-]{0,47}$/;

function normalizeSnapshot(v: unknown): Snapshot | undefined {
  const r = o(v);
  const out: Snapshot = {};
  const colors = Object.fromEntries(Object.entries(o(r.colors)).filter(([k, c]) => /^[a-zA-Z0-9]{1,16}$/.test(k) && typeof c === 'string' && HEX.test(c)).slice(0, 10)) as Record<string, string>;
  if (Object.keys(colors).length) out.colors = colors;
  if (typeof r.accent2 === 'string' && HEX.test(r.accent2)) out.accent2 = r.accent2;
  else if (r.accent2 === null) out.accent2 = null;
  const f = o(r.fonts);
  if (s(f.display, 60) && s(f.body, 60)) out.fonts = { display: s(f.display, 60), body: s(f.body, 60) };
  if (typeof r.ground === 'string' && HEX.test(r.ground)) out.ground = r.ground;
  else if (r.ground === null) out.ground = null;
  const nodes = Object.entries(o(r.nodes))
    .filter(([id, p]) => ID.test(id) && p && typeof p === 'object' && !Array.isArray(p))
    .slice(0, MAX_SNAPSHOT_NODES);
  if (nodes.length) out.nodes = Object.fromEntries(nodes) as Snapshot['nodes'];
  const removed = (Array.isArray(r.removed) ? r.removed : [])
    .map((x) => o(x))
    .filter((x) => typeof o(x.node).id === 'string' && typeof o(x.node).type === 'string')
    .slice(0, MAX_SNAPSHOT_NODES)
    .map((x) => ({ node: o(x.node), index: typeof x.index === 'number' && Number.isFinite(x.index) ? Math.max(0, Math.round(x.index)) : 0 }));
  if (removed.length) out.removed = removed;
  const added = (Array.isArray(r.added) ? r.added : []).filter((id): id is string => typeof id === 'string' && ID.test(id)).slice(0, 120);
  if (added.length) out.added = added;
  if (!Object.keys(out).length) return undefined;
  // a snapshot is a memory, not an archive: one too large to carry is kept without its objects (the palette, faces
  // and ground still restore; the version history holds the rest)
  if (JSON.stringify(out).length > MAX_SNAPSHOT_BYTES) {
    delete out.nodes;
    delete out.removed;
  }
  return out;
}

/** A record held to its shape (from a stored document, or an operation); undefined when there is nothing in it. */
export function normalizeDirected(v: unknown): DirectedRecord | undefined {
  const r = o(v);
  const out: DirectedRecord = {};
  if (s(r.idea, 300)) out.idea = s(r.idea, 300);
  const rationale = (Array.isArray(r.rationale) ? r.rationale : []).map((x) => s(x, 240)).filter(Boolean).slice(0, 8);
  if (rationale.length) out.rationale = rationale;
  const standing = (Array.isArray(r.standing) ? r.standing : []).map((x) => s(x, 200)).filter(Boolean).slice(-6);
  if (standing.length) out.standing = standing;
  const journal = (Array.isArray(r.journal) ? r.journal : [])
    .map((x) => o(x))
    .filter((x) => s(x.said, 600))
    .slice(-MAX_JOURNAL)
    .map((x): JournalEntry => {
      const before = x.status === 'rejected' ? undefined : normalizeSnapshot(x.before);
      return { said: s(x.said, 600), did: s(x.did, 400), at: typeof x.at === 'number' && Number.isFinite(x.at) ? x.at : 0, status: x.status === 'rejected' ? 'rejected' : 'applied', ...(s(x.level, 24) ? { level: s(x.level, 24) } : {}), ...(before ? { before } : {}) };
    });
  if (journal.length) out.journal = journal;
  return Object.keys(out).length ? out : undefined;
}

/** The record with one more turn (the oldest dropped past the bound; older snapshots thinned so the record stays small). */
export function withTurn(rec: DirectedRecord | undefined, entry: JournalEntry): DirectedRecord {
  const journal = [...(rec?.journal ?? []), entry].slice(-MAX_JOURNAL);
  // the first turn's snapshot is the original state: it is always kept; of the others, the newest six keep theirs
  const keepFrom = Math.max(1, journal.length - 6);
  const thinned = journal.map((e, i) => (i === 0 || i >= keepFrom || !e.before ? e : { ...e, before: { ...e.before, nodes: undefined, removed: undefined } }));
  return { ...(rec ?? {}), journal: thinned.map((e) => (e.before ? { ...e, before: normalizeSnapshot(e.before) } : e)) as JournalEntry[] };
}
