// lib/runtime/representation.ts — THE REPRESENTATION LAYER.
//
// One model of the workspace: every conversation, message, document and
// passage, artifact (a scene, a model, an object or display, a practice set,
// the writing), map node and writing card, as a typed entity with a stable id,
// its provenance, and the links that already exist between them.
//
// DERIVED, NOT STORED. Each of these already lives somewhere with its own
// shape and its own history — `conversations.map`, `conversations.draft`, the
// device's document store — and a second copy would be a second thing to keep
// in step and to get wrong. This reads them and returns the index, so it can
// never disagree with the data; search (Cmd/Ctrl+K), the Content view and the
// provenance shown under a reply all read the same one.
//
// THE IDS
//   conv:<session>                     a line of thinking
//   msg:<session>/<message id | index>  one of its turns
//   doc:<doc id>                       a document (its content hash — stable)
//   blk:<doc id>#<block id>            a passage (positional within its reading)
//   obj:<session>/<object id>          an object or display in the workspace
//   model:<session>/<model id>         a model document
//   scene:<session>                    the picture on screen
//   write:<session>                    the writing
//   card:<session>/<card id>           a card in the Draft Space
//   node:<session>/<node id>           a node of the Thinking Map
//
// THE LINKS (each one is a field that already exists — nothing is inferred)
//   contains     a conversation holds its turns, artifacts, nodes, writing
//   attaches     a turn brought a document
//   stands_for   a node is an object in the workspace (node.obj)
//   relates      two nodes, with the map's relation (supports, conflicts, …)
//   drafted_from a paragraph of the writing came from a card (block.from)
//   cites        the writing cites a passage (block.cites); a card links one
//   links        a card links a node or another card
//
// Pure.

import type { LogosSession } from '../logos-sessions';

export type EntityKind = 'conversation' | 'message' | 'document' | 'passage' | 'artifact' | 'node' | 'writing' | 'card';

export type Provenance = 'person' | 'socria' | 'source' | 'computed';

export interface Entity {
  id: string;
  kind: EntityKind;
  /** what it is called */
  title: string;
  /** the words to search, clipped */
  text: string;
  /** the line of thinking it belongs to, when it belongs to one */
  session?: string;
  /** which view shows it */
  view: 'chat' | 'content' | 'artifacts' | 'logic_map';
  provenance: Provenance;
  /** when it was last changed, when that is known */
  at?: number;
  /** for an artifact: what kind of thing it is */
  sub?: string;
}

export type RelationType = 'contains' | 'attaches' | 'stands_for' | 'relates' | 'drafted_from' | 'cites' | 'links';

export interface Relation {
  from: string;
  to: string;
  type: RelationType;
  /** the map's own relation word, on `relates` */
  label?: string;
}

export interface WorkspaceIndex {
  entities: Map<string, Entity>;
  relations: Relation[];
}

/** A document as the index needs it — the device's SourceDoc satisfies this. */
export interface IndexDoc {
  id: string;
  name: string;
  blocks?: readonly { id: string; text: string; kind?: string }[];
}

const clip = (t: unknown, n: number) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** At most this many passages per document reach the index: enough to find a sentence, not a second copy. */
const PASSAGES_PER_DOC = 400;

export function indexWorkspace(sessions: readonly LogosSession[], docs: readonly IndexDoc[] = []): WorkspaceIndex {
  const entities = new Map<string, Entity>();
  const relations: Relation[] = [];
  const put = (e: Entity) => {
    if (!entities.has(e.id)) entities.set(e.id, e);
  };
  const rel = (from: string, to: string, type: RelationType, label?: string) => relations.push({ from, to, type, ...(label ? { label } : {}) });

  const docNames = new Map<string, string>();
  for (const d of docs) {
    docNames.set(d.id, d.name);
    put({ id: `doc:${d.id}`, kind: 'document', title: clip(d.name, 120) || 'Document', text: clip(d.name, 120), view: 'content', provenance: 'source' });
    for (const b of (d.blocks ?? []).slice(0, PASSAGES_PER_DOC)) {
      const text = clip(b.text, 400);
      if (!text) continue;
      put({ id: `blk:${d.id}#${b.id}`, kind: 'passage', title: clip(d.name, 80), text, view: 'content', provenance: 'source' });
      rel(`doc:${d.id}`, `blk:${d.id}#${b.id}`, 'contains');
    }
  }

  for (const s of sessions) {
    const conv = `conv:${s.id}`;
    put({ id: conv, kind: 'conversation', title: clip(s.title, 120) || 'Untitled', text: clip(s.title, 120), session: s.id, view: 'chat', provenance: 'person', at: s.updatedAt });

    s.messages.forEach((m, i) => {
      const id = `msg:${s.id}/${m.id ?? i}`;
      const text = clip(m.content, 600);
      if (!text && !m.attachments?.length) return;
      put({ id, kind: 'message', title: clip(s.title, 80), text, session: s.id, view: 'chat', provenance: m.role === 'user' ? 'person' : 'socria', ...(m.at ? { at: m.at } : {}) });
      rel(conv, id, 'contains');
      for (const a of m.attachments ?? []) {
        const docId = (a as { doc?: string }).doc;
        if (!docId) continue;
        if (!entities.has(`doc:${docId}`)) {
          // a document this device has not read: known by its name on the turn
          put({ id: `doc:${docId}`, kind: 'document', title: clip((a as { name?: string }).name, 120) || 'Document', text: clip((a as { name?: string }).name, 120), view: 'content', provenance: 'source' });
        }
        rel(id, `doc:${docId}`, 'attaches');
        rel(conv, `doc:${docId}`, 'contains');
      }
    });

    const map = s.map;
    for (const n of map?.nodes ?? []) {
      const id = `node:${s.id}/${n.id}`;
      put({ id, kind: 'node', title: clip(n.label, 120), text: clip(`${n.label} ${n.note ?? ''}`, 300), session: s.id, view: 'logic_map', provenance: (n.origin as Provenance | undefined) ?? 'person', sub: n.type });
      rel(conv, id, 'contains');
      if (n.obj) rel(id, `obj:${s.id}/${n.obj}`, 'stands_for');
    }
    for (const e of map?.edges ?? []) rel(`node:${s.id}/${e.from}`, `node:${s.id}/${e.to}`, 'relates', e.relation);

    for (const o of (map?.objects as { objs?: { id: string; kind: string; name: string; origin?: string }[] } | undefined)?.objs ?? []) {
      const id = `obj:${s.id}/${o.id}`;
      put({ id, kind: 'artifact', title: clip(o.name, 120) || o.kind, text: clip(`${o.name} ${o.kind}`, 200), session: s.id, view: 'artifacts', provenance: (o.origin as Provenance | undefined) ?? 'socria', sub: o.kind });
      rel(conv, id, 'contains');
    }
    for (const d of (map?.models as { docs?: { id: string; title: string; at?: number }[] } | undefined)?.docs ?? []) {
      const id = `model:${s.id}/${d.id}`;
      put({ id, kind: 'artifact', title: clip(d.title, 120) || 'Model', text: clip(d.title, 200), session: s.id, view: 'artifacts', provenance: 'computed', sub: 'model', ...(d.at ? { at: d.at } : {}) });
      rel(conv, id, 'contains');
    }
    if (map?.viz) {
      const v = map.viz as { title?: string; kind?: string };
      const id = `scene:${s.id}`;
      put({ id, kind: 'artifact', title: clip(v.title, 120) || 'The picture', text: clip(`${v.title ?? ''} ${v.kind ?? ''}`, 200), session: s.id, view: 'artifacts', provenance: 'socria', sub: 'scene' });
      rel(conv, id, 'contains');
    }

    const w = s.draft?.doc;
    if (w && (w.blocks.some((b) => b.text.trim()) || w.cards.length)) {
      const write = `write:${s.id}`;
      put({ id: write, kind: 'writing', title: clip(w.title, 120) || 'Writing', text: clip(w.blocks.map((b) => b.text).join(' '), 600), session: s.id, view: 'artifacts', provenance: 'person', at: w.updatedAt });
      rel(conv, write, 'contains');
      for (const c of w.cards) {
        const id = `card:${s.id}/${c.id}`;
        put({ id, kind: 'card', title: clip(c.text, 80), text: clip(c.text, 300), session: s.id, view: 'artifacts', provenance: 'person', at: c.at });
        rel(write, id, 'contains');
        for (const l of c.links ?? []) {
          if (l.k === 'doc' && l.doc) rel(id, `blk:${l.doc}#${l.id}`, 'cites');
          else if (l.k === 'node') rel(id, `node:${s.id}/${l.id}`, 'links');
          else if (l.k === 'card') rel(id, `card:${s.id}/${l.id}`, 'links');
        }
      }
      for (const b of w.blocks) {
        for (const from of b.from ?? []) rel(write, `card:${s.id}/${from}`, 'drafted_from');
        for (const c of b.cites ?? []) rel(write, `blk:${c.doc}#${c.block}`, 'cites');
      }
    }
  }
  return { entities, relations };
}

/** What links to and from an entity — for "where did this come from" and "what uses this". */
export function neighbours(ix: WorkspaceIndex, id: string): { out: Relation[]; in: Relation[] } {
  return { out: ix.relations.filter((r) => r.from === id), in: ix.relations.filter((r) => r.to === id) };
}

// ── search ───────────────────────────────────────────────────────────

export interface Hit {
  entity: Entity;
  score: number;
  /** the words around the match, for the result line */
  snippet: string;
}

const KIND_WEIGHT: Record<EntityKind, number> = {
  conversation: 3,
  artifact: 2.4,
  writing: 2.2,
  node: 2,
  document: 2,
  card: 1.4,
  passage: 1,
  message: 1,
};

const fold = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** How well a query's words land in a text: whole words, then prefixes, then letters in order (a typo-tolerant last resort). */
export function fuzzyScore(query: string, text: string): number {
  const q = fold(query);
  if (!q) return 0;
  const t = fold(text);
  if (!t) return 0;
  if (t.includes(q)) return 1 + (t.startsWith(q) ? 0.5 : 0);
  const words = t.split(' ');
  const parts = q.split(' ');
  let sum = 0;
  for (const p of parts) {
    if (words.includes(p)) sum += 1;
    else if (words.some((w) => w.startsWith(p))) sum += 0.75;
    else if (p.length >= 4 && words.some((w) => slip(p, w))) sum += 0.4;
    else return 0;
  }
  return (sum / parts.length) * 0.9;
}

/**
 * A slip of the finger, within one word: a letter wrong, missing, extra or two
 * swapped (two slips in a long word) — of the word, or of its beginning
 * ("pricng" finds "pricing", "accural" finds "accruals"). Never letters
 * strung across a whole sentence: "denver" does not find "depends … never".
 */
function slip(p: string, w: string): boolean {
  const max = p.length >= 8 ? 2 : 1;
  if (Math.abs(p.length - w.length) <= max && edits(p, w, max) <= max) return true;
  return w.length > p.length && edits(p, w.slice(0, p.length), max) <= max;
}

/** Edits between two short words (optimal string alignment), given up past `max`. */
function edits(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

function snippetOf(text: string, query: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const at = t.toLowerCase().indexOf(query.toLowerCase().split(/\s+/)[0] ?? '');
  if (at < 0 || t.length <= 120) return t.slice(0, 120);
  const start = Math.max(0, at - 40);
  return `${start ? '…' : ''}${t.slice(start, start + 120)}${start + 120 < t.length ? '…' : ''}`;
}

/** The best matches across the whole workspace, ranked: title matches over body matches, recent over old. */
export function searchWorkspace(ix: WorkspaceIndex, query: string, { limit = 24, now = 0 }: { limit?: number; now?: number } = {}): Hit[] {
  if (!query.trim()) return [];
  const hits: Hit[] = [];
  for (const e of ix.entities.values()) {
    const inTitle = fuzzyScore(query, e.title);
    const inText = e.text !== e.title ? fuzzyScore(query, e.text) * 0.8 : 0;
    const base = Math.max(inTitle, inText);
    if (base <= 0) continue;
    const recency = now && e.at ? Math.max(0, 1 - (now - e.at) / (90 * 86_400_000)) * 0.3 : 0;
    hits.push({ entity: e, score: base * KIND_WEIGHT[e.kind] + recency, snippet: snippetOf(inTitle >= inText ? e.title : e.text, query) });
  }
  hits.sort((a, b) => b.score - a.score);
  // one line per message at most, and no more than a handful of passages from one document
  const out: Hit[] = [];
  const perDoc = new Map<string, number>();
  for (const h of hits) {
    if (h.entity.kind === 'passage') {
      const doc = h.entity.id.slice(4, h.entity.id.indexOf('#'));
      const n = perDoc.get(doc) ?? 0;
      if (n >= 3) continue;
      perDoc.set(doc, n + 1);
    }
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}
