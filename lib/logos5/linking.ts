// lib/logos5/linking.ts — WHICH MESSAGES A CARD CAME FROM, AND WHICH CARDS A
// MESSAGE MADE.
//
// Logos 5 links the conversation and the workspace both ways: select a card
// and the turns it came from are marked in the thread; a reply says what it
// did to the map, and pressing that lights the cards. Nothing new is stored
// for this — every saved conversation keeps exactly its old shape. It is read
// from what is already there:
//
//   1. THE MAP'S OWN RECORD (lib/map-history.ts). Every change carries its
//      time and cause. A 'turn' change is made by the map pass that runs after
//      the person's message, so the cards it added or reworded belong to the
//      latest message of theirs sent at or before the change. An 'edit' change
//      was made by hand, by the command in the person's latest message.
//   2. THEIR WORDS, for cards older than the kept record (30 changes) or never
//      in it. A card whose label shares enough of its words with one of the
//      person's messages is linked to it — only above a threshold, and never
//      more than two messages, so a common word does not light the thread up.
//
// It is a reading, not a claim: the thread says "from this conversation", the
// map is never rebuilt from it, and a card with no link is simply not linked.
//
// PURE.

import type { MapChange, MapHistory } from '@/lib/map-history';

export interface LinkMsg {
  id?: string;
  at?: number;
  role: 'user' | 'assistant';
  content: string;
}

export interface LinkNode {
  id: string;
  label: string;
}

export interface Links {
  /** card id → the ids of the person's messages it came from, oldest first */
  fromNode: Map<string, string[]>;
  /** a message id (the person's, or the reply under it) → the cards that turn added or reworded */
  fromMsg: Map<string, string[]>;
}

const STOP = new Set(
  'a an and are as at be but by for from has have i if in into is it its me my of on or our so than that the their them then there these they this to too was we were what when which who why will with you your not no do does did can could should would just about more most very really'.split(
    ' '
  )
);

/** The words that carry meaning, folded: case, accents, plurals' final s. */
export function wordsOf(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/** How much of a card's label is in a message: the share of the label's words found there (0–1). */
export function overlap(label: string, message: string): number {
  const want = [...new Set(wordsOf(label))];
  if (!want.length) return 0;
  const have = new Set(wordsOf(message));
  return want.filter((w) => have.has(w)).length / want.length;
}

/** The share of a label's words a message must hold to be linked by words alone. */
export const WORD_LINK_MIN = 0.6;
/** A label of one meaningful word links by words only when that word is rare enough to mean something: this long. */
const ONE_WORD_MIN = 6;

/** The latest message of the person's sent at or before `at` (and the reply right after it, when there is one). */
function turnAt(msgs: readonly LinkMsg[], at: number): { user: LinkMsg; reply?: LinkMsg } | null {
  let u = -1;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role === 'user' && typeof m.at === 'number' && m.at <= at) u = i;
  }
  if (u < 0) return null;
  const reply = msgs.slice(u + 1).find((m) => m.role === 'assistant');
  return { user: msgs[u], reply };
}

const push = (m: Map<string, string[]>, k: string, v: string) => {
  const list = m.get(k);
  if (!list) m.set(k, [v]);
  else if (!list.includes(v)) list.push(v);
};

/**
 * Both directions at once, for one line of thinking. `history` may be absent
 * (a map from before the record existed); then the words alone link.
 */
export function linksOf(msgs: readonly LinkMsg[], nodes: readonly LinkNode[], history?: MapHistory | null): Links {
  const fromNode = new Map<string, string[]>();
  const fromMsg = new Map<string, string[]>();
  const live = new Set(nodes.map((n) => n.id));

  // 1. the record
  for (const c of (history?.changes ?? []) as MapChange[]) {
    const t = turnAt(msgs, c.at);
    if (!t?.user.id) continue;
    const touched = [...c.added.map((a) => a.id), ...c.renamed.map((r) => r.id)].filter((id) => live.has(id));
    for (const id of touched) {
      push(fromNode, id, t.user.id);
      push(fromMsg, t.user.id, id);
      if (t.reply?.id) push(fromMsg, t.reply.id, id);
    }
  }

  // 2. their words, for cards the record does not cover
  const mine = msgs.filter((m) => m.role === 'user' && m.id && m.content);
  for (const n of nodes) {
    if (fromNode.has(n.id)) continue;
    const words = [...new Set(wordsOf(n.label))];
    if (!words.length || (words.length === 1 && words[0].length < ONE_WORD_MIN)) continue;
    const scored = mine
      .map((m) => ({ id: m.id!, s: overlap(n.label, m.content) }))
      .filter((x) => x.s >= WORD_LINK_MIN)
      .sort((a, b) => b.s - a.s)
      .slice(0, 2);
    for (const x of scored) push(fromNode, n.id, x.id);
  }
  // keep each card's messages in conversation order
  const order = new Map(msgs.map((m, i) => [m.id ?? '', i]));
  for (const [k, ids] of fromNode) fromNode.set(k, [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)));
  return { fromNode, fromMsg };
}

/** What a reply's effect line says about the cards its turn touched: "＋3 on the map", "1 card reworded". */
export function effectSaid(added: number, renamed: number): string | null {
  if (!added && !renamed) return null;
  if (added && !renamed) return `+${added} on the map`;
  if (!added) return `${renamed} ${renamed === 1 ? 'card' : 'cards'} reworded`;
  return `+${added} on the map · ${renamed} reworded`;
}

/** For the effect line: how many of a turn's linked cards it added, and how many it reworded. */
export function turnEffect(msgId: string, msgs: readonly LinkMsg[], history?: MapHistory | null, live?: ReadonlySet<string>): { added: string[]; renamed: string[] } {
  const added: string[] = [];
  const renamed: string[] = [];
  for (const c of history?.changes ?? []) {
    const t = turnAt(msgs, c.at);
    if (!t || (t.user.id !== msgId && t.reply?.id !== msgId)) continue;
    for (const a of c.added) if ((!live || live.has(a.id)) && !added.includes(a.id)) added.push(a.id);
    for (const r of c.renamed) if ((!live || live.has(r.id)) && !renamed.includes(r.id) && !added.includes(r.id)) renamed.push(r.id);
  }
  return { added, renamed };
}
