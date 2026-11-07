// lib/logos5/ideas.ts — EVERYTHING IN ONE SPACE. (Logos 5.5, Revision III.)
//
// A line of thinking is one space, not four screens. What was brought (files,
// photos), the ideas on the Logic Map, what Socria made (tables, charts,
// drawings) and the conversation itself sit together on one canvas, laid out
// left to right by how they connect: what frames the question first, then each
// idea after what it rests on, then what was made from them. Each kind has its
// own look, every card says which turn of the conversation made it, and the
// lines between them say how (a file "read from", a table "made", an idea "so",
// "but", "because"). One idea is open — the one the newest reply put there —
// and Socria's reply is read inside it, with the question it asks; the chatbox
// at the foot of the space is where the answer goes. The row under the header
// is not tabs: it brings one kind forward (Ideas, Brought, Made, or Words — the
// conversation, each turn shown beside what it made) and nothing moves.
//
// Pure: no React, no storage, no clock. components/logos5/L5Space.tsx draws it.

import { litBy } from './oneView';

export interface IdeaNodeLite {
  id: string;
  type: string;
  role?: string | null;
  label: string;
  origin?: string;
}

export interface IdeaEdgeLite {
  from: string;
  to: string;
  relation: string;
  label?: string;
  op?: string;
}

export interface TurnLite {
  askedId?: string;
  replyId?: string;
  pending?: boolean;
}

// ── which way a line runs ────────────────────────────────────────────

/** Relations that run from the earlier idea to the later one, as written. */
const FORWARD = new Set(['supports', 'leads_to', 'causes', 'precedes', 'implies', 'justifies', 'transforms_to', 'flows_to', 'becomes', 'inhibits', 'applies_to', 'revises']);
/** Relations written the other way round: "A depends on B" puts B first; a whole comes before its parts, a kind before its cases. */
const BACKWARD = new Set(['depends', 'part_of', 'is_a']);

/**
 * Which idea comes first along a line, for laying the page out left to right: [earlier, later].
 * Null for a line with no direction — a conflict, a loose relation, an equivalence — which is drawn but not ranked.
 */
export function flowOf(e: IdeaEdgeLite): [string, string] | null {
  if (e.from === e.to) return null;
  if (FORWARD.has(e.relation)) return [e.from, e.to];
  if (BACKWARD.has(e.relation)) return [e.to, e.from];
  return null;
}

/** What a line says, read from the earlier idea to the later one. Empty when it needs no word. */
const WORDS: Record<string, string> = {
  supports: 'supports',
  conflicts: 'but',
  depends: 'needed for',
  leads_to: 'so',
  causes: 'causes',
  precedes: 'then',
  implies: 'so',
  justifies: 'because',
  becomes: 'becomes',
  inhibits: 'holds back',
  part_of: 'includes',
  is_a: 'such as',
  revises: 'revises',
  equivalent_to: 'same as',
};
export function edgeWord(e: IdeaEdgeLite, max = 28): string {
  // a line's own words are written for its own direction; a reversed relation reads in ours
  const own = BACKWARD.has(e.relation) ? '' : (e.label ?? e.op ?? '').trim();
  const w = own || WORDS[e.relation] || '';
  return w.length > max ? `${w.slice(0, max - 1).trimEnd()}…` : w;
}

// ── the page, left to right ──────────────────────────────────────────

/** What frames the thinking rather than following from it: the question asked, what was given, what is unknown. */
export function framesIt(n: IdeaNodeLite, hasIncoming: boolean): boolean {
  if (n.type === 'given' || n.type === 'unknown') return true;
  return n.type === 'question' && !hasIncoming;
}

export interface IdeaLayout {
  /** the first column: the question, the givens (what was brought sits under them) */
  frame: string[];
  /** then each idea after what it rests on, one column per step along the lines */
  columns: string[][];
}

/**
 * The page's columns. Every idea after the ideas it rests on (the longest way along the lines, so a
 * chain reads as a row); within a column, each idea beside the ideas it comes from; ideas nothing leads
 * to start the page. A loop in the lines is cut where it closes. Stable: the same map lays out the same.
 */
export function ideaLayout(nodes: readonly IdeaNodeLite[], edges: readonly IdeaEdgeLite[]): IdeaLayout {
  const ids = new Set(nodes.map((n) => n.id));
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const flows: [string, string][] = [];
  for (const e of edges) {
    const f = flowOf(e);
    if (f && ids.has(f[0]) && ids.has(f[1])) flows.push(f);
  }
  const incoming = new Set(flows.map(([, b]) => b));
  const frameIds = new Set(nodes.filter((n) => framesIt(n, incoming.has(n.id))).map((n) => n.id));
  const rest = nodes.filter((n) => !frameIds.has(n.id));
  const preds = new Map<string, string[]>();
  for (const [a, b] of flows) {
    if (frameIds.has(a) || frameIds.has(b)) continue;
    preds.set(b, [...(preds.get(b) ?? []), a]);
  }
  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const rankOf = (id: string): number => {
    const known = rank.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return -1; // the line that closes a loop is not followed
    visiting.add(id);
    let r = 0;
    for (const p of preds.get(id) ?? []) {
      const pr = rankOf(p);
      if (pr >= 0) r = Math.max(r, pr + 1);
    }
    visiting.delete(id);
    rank.set(id, r);
    return r;
  };
  for (const n of rest) rankOf(n.id);
  const columns: string[][] = [];
  for (const n of rest) {
    const r = rank.get(n.id) ?? 0;
    (columns[r] ??= []).push(n.id);
  }
  // within a column, each idea beside the ideas it comes from (their average place), ties in the map's own order
  const place = new Map<string, number>();
  columns.forEach((col, ci) => {
    if (ci > 0) {
      const score = (id: string) => {
        const ps = (preds.get(id) ?? []).filter((p) => place.has(p));
        return ps.length ? ps.reduce((s, p) => s + place.get(p)!, 0) / ps.length : Number.POSITIVE_INFINITY;
      };
      col.sort((a, b) => score(a) - score(b) || order.get(a)! - order.get(b)!);
    }
    col.forEach((id, i) => place.set(id, col.length > 1 ? i / (col.length - 1) : 0.5));
  });
  return { frame: nodes.filter((n) => frameIds.has(n.id)).map((n) => n.id), columns: columns.filter((c) => c && c.length) };
}

// ── the open idea ────────────────────────────────────────────────────

/**
 * The idea a turn opens: of the ideas it put on the map, one it put there first (not one an earlier turn
 * already had), not the question or a given when it has anything else, and of those the last in the map's
 * order — the newest, usually where the turn arrived. Null while the turn is still being answered, or when
 * it put nothing on the map (small talk, a thank-you): then the reply is read on its own.
 */
export function openIdeaOf(i: {
  nodes: readonly IdeaNodeLite[];
  turns: readonly TurnLite[];
  fromMsg: ReadonlyMap<string, readonly string[]> | null | undefined;
  at: number | null;
}): string | null {
  const { nodes, turns, fromMsg, at } = i;
  if (at === null || at < 0 || at >= turns.length) return null;
  const turn = turns[at];
  if (!turn || turn.pending) return null;
  const known = new Set(nodes.map((n) => n.id));
  const lit = [...litBy(turn, fromMsg)].filter((id) => known.has(id));
  if (!lit.length) return null;
  const seen = new Set<string>();
  for (let k = 0; k < at; k++) for (const id of litBy(turns[k], fromMsg)) seen.add(id);
  const fresh = lit.filter((id) => !seen.has(id));
  let pool = new Set(fresh.length ? fresh : lit);
  const framing = (id: string) => {
    const t = nodes.find((n) => n.id === id)?.type;
    return t === 'question' || t === 'given' || t === 'unknown';
  };
  const beyond = [...pool].filter((id) => !framing(id));
  if (beyond.length) pool = new Set(beyond);
  for (let k = nodes.length - 1; k >= 0; k--) if (pool.has(nodes[k].id)) return nodes[k].id;
  return null;
}

/** The turn an idea came from: the first that put it on the map; null when none can be traced. */
export function firstTurnOf(id: string, turns: readonly TurnLite[], fromMsg: ReadonlyMap<string, readonly string[]> | null | undefined): number | null {
  for (let k = 0; k < turns.length; k++) if (litBy(turns[k], fromMsg).has(id)) return k;
  return null;
}

// ── around one idea (a phone shows one at a time) ────────────────────

export interface Around {
  /** what it rests on, comes from, or follows */
  before: string[];
  /** what follows from it */
  after: string[];
  /** what stands against it */
  against: string[];
}

/** The ideas next to one: before it along the lines, after it, and against it — each in the map's own order. */
export function aroundOf(id: string, nodes: readonly IdeaNodeLite[], edges: readonly IdeaEdgeLite[], max = 3): Around {
  const before = new Set<string>();
  const after = new Set<string>();
  const against = new Set<string>();
  for (const e of edges) {
    if (e.relation === 'conflicts') {
      if (e.from === id && e.to !== id) against.add(e.to);
      else if (e.to === id && e.from !== id) against.add(e.from);
      continue;
    }
    const f = flowOf(e);
    if (!f) continue;
    if (f[1] === id) before.add(f[0]);
    else if (f[0] === id) after.add(f[1]);
  }
  const inOrder = (s: Set<string>) => nodes.filter((n) => s.has(n.id)).map((n) => n.id).slice(0, max);
  return { before: inOrder(before), after: inOrder(after), against: inOrder(against) };
}

// ── the trail: the words, kept ───────────────────────────────────────

export interface TrailRow {
  index: number;
  asked: string;
  /** Socria's question, when the reply ends on one; else the reply's first words */
  said: string;
  /** the ideas this turn put on the map first, by name */
  made: { id: string; label: string }[];
  pending: boolean;
}

export function trailRows(
  turns: readonly (TurnLite & { asked: string; said: string; asks?: string })[],
  fromMsg: ReadonlyMap<string, readonly string[]> | null | undefined,
  nodes: readonly IdeaNodeLite[]
): TrailRow[] {
  const seen = new Set<string>();
  const label = new Map(nodes.map((n) => [n.id, n.label]));
  return turns.map((t, index) => {
    const made: { id: string; label: string }[] = [];
    for (const id of litBy(t, fromMsg)) {
      if (seen.has(id) || !label.has(id)) continue;
      seen.add(id);
      made.push({ id, label: label.get(id)! });
    }
    return { index, asked: t.asked, said: t.asks || t.said, made, pending: !!t.pending };
  });
}

// ── the chatbox ──────────────────────────────────────────────────────

/**
 * What the chatbox says it is answering: the open idea, when it is the newest turn's and Socria's reply
 * ended on a question — and nothing has been chosen to ask about instead. Null otherwise.
 */
export function answeringOf(i: { newest: boolean; asks: boolean; pending: boolean; about: boolean; label: string | null }): string | null {
  if (!i.newest || !i.asks || i.pending || i.about) return null;
  return i.label?.trim() || 'Socria’s question';
}

/** "1 idea", "7 ideas" */
export function ideasCount(n: number): string {
  return `${n} ${n === 1 ? 'idea' : 'ideas'}`;
}

/** What an idea is, as its card says it: its part in the shape when it has one, else what it is. */
export function ideaKind(n: { type: string; role?: string | null }): string {
  const k = String(n.role || n.type || 'idea').replace(/_/g, ' ');
  return k.charAt(0).toUpperCase() + k.slice(1);
}

// ── the space: what links to what, beyond the map's own lines ────────

/** The kinds the row under the header brings forward. */
export type SpaceKind = 'all' | 'ideas' | 'brought' | 'made' | 'words';
export const SPACE_KINDS: readonly SpaceKind[] = ['all', 'ideas', 'brought', 'made', 'words'];

/** Something brought or made, and the turn it came with (null when no turn can be named). */
export interface SpaceThingLite {
  key: string;
  turn: number | null;
}

export interface SpaceLink {
  from: string;
  to: string;
  word: string;
  kind: 'map' | 'read' | 'made';
  /** a conflict: drawn dashed */
  dashed?: boolean;
}

/** Keys on the canvas: an idea, a thing brought, a thing made; the open card stands for its idea, or for itself. */
export const ideaKey = (id: string) => `n:${id}`;
export const broughtKey = (key: string) => `c:${key}`;
export const madeKey = (key: string) => `m:${key}`;
export const OPEN_KEY = 'open';

/** The ideas a turn put on the map first, in the map's order; else the ideas it lit at all. */
export function ideasOfTurn(
  at: number,
  turns: readonly TurnLite[],
  fromMsg: ReadonlyMap<string, readonly string[]> | null | undefined,
  nodes: readonly IdeaNodeLite[]
): string[] {
  if (at < 0 || at >= turns.length) return [];
  const seen = new Set<string>();
  for (let k = 0; k < at; k++) for (const id of litBy(turns[k], fromMsg)) seen.add(id);
  const lit = litBy(turns[at], fromMsg);
  const inOrder = nodes.filter((n) => lit.has(n.id)).map((n) => n.id);
  const fresh = inOrder.filter((id) => !seen.has(id));
  return fresh.length ? fresh : inOrder;
}

/**
 * Every line in the space: the map's own (named where they touch the open idea, or carry their own words),
 * a file to the first idea its turn put there ("read from"), and an idea to what its turn made ("made") —
 * the open idea, for the turn that opened it.
 */
export function spaceLinks(i: {
  nodes: readonly IdeaNodeLite[];
  edges: readonly IdeaEdgeLite[];
  brought: readonly SpaceThingLite[];
  made: readonly SpaceThingLite[];
  turns: readonly TurnLite[];
  fromMsg: ReadonlyMap<string, readonly string[]> | null | undefined;
  openId: string | null;
  openTurn: number | null;
}): SpaceLink[] {
  const ids = new Set(i.nodes.map((n) => n.id));
  const out: SpaceLink[] = [];
  const seen = new Set<string>();
  for (const e of i.edges) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    // a loose relation says nothing worth a line here; a conflict is drawn both ways round
    const f = flowOf(e) ?? (e.relation === 'conflicts' ? [e.from, e.to] : null);
    if (!f) continue;
    const k = `${f[0]}>${f[1]}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const touchesOpen = !!i.openId && (e.from === i.openId || e.to === i.openId);
    const own = !!(e.label || e.op) && !BACKWARD.has(e.relation);
    out.push({ from: ideaKey(f[0]), to: ideaKey(f[1]), word: touchesOpen || own || e.relation === 'conflicts' ? edgeWord(e) : '', kind: 'map', ...(e.relation === 'conflicts' ? { dashed: true } : {}) });
  }
  const firstIdea = (t: number | null) => (t === null ? null : ideasOfTurn(t, i.turns, i.fromMsg, i.nodes)[0] ?? null);
  for (const b of i.brought) {
    const id = firstIdea(b.turn);
    if (id) out.push({ from: broughtKey(b.key), to: ideaKey(id), word: 'read from', kind: 'read' });
  }
  for (const m of i.made) {
    if (m.turn === null) continue;
    const id = m.turn === i.openTurn && i.openId ? i.openId : firstIdea(m.turn);
    const from = id ? ideaKey(id) : m.turn === i.openTurn ? OPEN_KEY : null;
    if (from) out.push({ from, to: madeKey(m.key), word: 'made', kind: 'made' });
  }
  return out;
}

/**
 * Where each turn's words sit when Words is chosen: beside the first thing it made — an idea, else a file it
 * brought, else something made — or on the open card for the turn it opened. Null for a turn that left nothing.
 */
export function wordTargets(i: {
  nodes: readonly IdeaNodeLite[];
  brought: readonly SpaceThingLite[];
  made: readonly SpaceThingLite[];
  turns: readonly TurnLite[];
  fromMsg: ReadonlyMap<string, readonly string[]> | null | undefined;
  openId: string | null;
  openTurn: number | null;
}): (string | null)[] {
  const used = new Set<string>();
  return i.turns.map((_, t) => {
    const pick = (k: string | null) => {
      if (!k || used.has(k)) return null;
      used.add(k);
      return k;
    };
    if (t === i.openTurn) return pick(i.openId ? ideaKey(i.openId) : OPEN_KEY);
    for (const id of ideasOfTurn(t, i.turns, i.fromMsg, i.nodes)) {
      const k = pick(id === i.openId ? null : ideaKey(id));
      if (k) return k;
    }
    for (const b of i.brought) if (b.turn === t) { const k = pick(broughtKey(b.key)); if (k) return k; }
    for (const m of i.made) if (m.turn === t) { const k = pick(madeKey(m.key)); if (k) return k; }
    return null;
  });
}

/** Whether a card of a kind stays forward under the row's choice: everything forward on Everything, nothing on Words. */
export function forwardIn(kind: SpaceKind, card: 'idea' | 'brought' | 'made' | 'open'): boolean {
  if (kind === 'all') return true;
  if (kind === 'words') return false;
  if (kind === 'ideas') return card === 'idea' || card === 'open';
  return kind === card;
}
