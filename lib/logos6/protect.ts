// lib/logos6/protect.ts — WHAT THE PERSON PLACED STAYS PLACED (Logos 6; pure).
//
// The map pass is told to REORGANIZE the map every turn (lib/logos.ts), and it rebuilds it from the transcript.
// Until Logos 6 only a removal by hand was protected from that (lib/map-edit.ts dropRemoved), so a card someone
// added themselves — "Add as idea", a typed "add a card called…", a suggestion they kept, a finding they kept —
// could quietly vanish two turns later because the transcript did not say it loudly enough.
//
// This runs on every map that lands, beside dropRemoved: a card the person placed (`hand`) or a finding they
// kept (`finding`) that the pass dropped is put back, with its lines to whatever is still there; and what the
// pass cannot know about — the hand mark, a finding's record, the evidence a card rests on — is carried over to
// the same card when the pass kept it (same id, or the same words). A card the person removed stays removed:
// that rule is older, and theirs too. And the map's own size still holds — what fits is put back.

import { keyOf } from '../map-edit';
import { mapCaps, type LogosEdge, type LogosNode, type ThinkingMap } from '../logos';
import { authored } from './graph';

// MIND MAP 2.0: a card the person wrote about (what it means, their notes, tags, sources…) is theirs as much as one
// they placed — the pass keeps it, and keeps what it carries: where it was put, its tone, its place in the structure.
// And a line the person confirmed or a line of structure they made is theirs too: the pass cannot drop it, and what
// a line carries (its id, why it holds, what bears it out, its status) follows it to the pass's own line.
const placed = (n: LogosNode) => !!n.hand || !!n.finding || authored(n.mind);
const theirs = (e: LogosEdge) => e.status === 'confirmed' || e.kind === 'structure';

/** The landed map, with what the person placed kept and what the pass cannot know carried over. */
export function keepPlaced(prev: (Pick<ThinkingMap, 'nodes' | 'edges' | 'removed'> & Partial<Pick<ThinkingMap, 'objective'>>) | null | undefined, next: ThinkingMap): ThinkingMap {
  const kept = keepPlacedCards(prev, next);
  // THE OBJECTIVE (lib/logos6/objective.ts) is the chat's, never the pass's: the chat's own is carried over every pass —
  // including the first map of a chat that has no cards yet — and whatever a pass's output said about one is dropped.
  // A map with nothing to change is returned as it came.
  if (prev?.objective) return kept.objective === prev.objective ? kept : { ...kept, objective: prev.objective };
  if (!kept.objective) return kept;
  const { objective: _fromPass, ...out } = kept;
  return out;
}

function keepPlacedCards(prev: Pick<ThinkingMap, 'nodes' | 'edges' | 'removed'> | null | undefined, next: ThinkingMap): ThinkingMap {
  if (!prev?.nodes?.length) return next;
  const removed = new Set([...(prev.removed ?? []), ...(next.removed ?? [])]);
  const prevById = new Map(prev.nodes.map((n) => [n.id, n]));
  const prevByKey = new Map(prev.nodes.map((n) => [keyOf(n.label), n]));
  let changed = false;

  // what the pass kept, it keeps with its marks
  const nodes: LogosNode[] = next.nodes.map((n) => {
    const was = prevById.get(n.id) ?? prevByKey.get(keyOf(n.label));
    if (!was) return n;
    const add: Partial<LogosNode> = {};
    if (was.hand && !n.hand) add.hand = true;
    if (was.finding && !n.finding) {
      add.finding = was.finding;
      add.origin = 'socria';
    }
    if (was.evidence?.length && !n.evidence?.length) add.evidence = was.evidence;
    if (was.mind && !n.mind) add.mind = was.mind;
    if (!Object.keys(add).length) return n;
    changed = true;
    return { ...n, ...add };
  });

  // what it dropped, is put back — while there is room
  const ids = new Set(nodes.map((n) => n.id));
  const keys = new Set(nodes.map((n) => keyOf(n.label)));
  const room = Math.max(0, mapCaps({ ...next, nodes }).nodes - nodes.length);
  // a card the person built structure with, or drew a confirmed line to, is theirs as well
  const touched = new Set(prev.edges.filter(theirs).flatMap((e) => [e.from, e.to]));
  const back = prev.nodes.filter((n) => (placed(n) || touched.has(n.id)) && !ids.has(n.id) && !keys.has(keyOf(n.label)) && !removed.has(keyOf(n.label))).slice(0, room);
  for (const n of back) {
    nodes.push(n);
    ids.add(n.id);
  }

  // the cards' ids before and after the pass (a card it kept may have a new id, matched by its words)
  const byKeyNow = new Map(nodes.map((n) => [keyOf(n.label), n.id]));
  const now = (id: string) => (ids.has(id) ? id : (() => {
    const was = prevById.get(id);
    return was ? byKeyNow.get(keyOf(was.label)) : undefined;
  })());

  // what a line carries follows it to the pass's own line between the same cards
  const carried: LogosEdge[] = next.edges.map((e) => {
    const was = prev.edges.find((p) => now(p.from) === e.from && now(p.to) === e.to && (p.kind === 'structure' ? e.kind === 'structure' : p.relation === e.relation));
    if (!was) return e;
    const add: Partial<LogosEdge> = {};
    for (const k of ['id', 'why', 'evidence', 'status', 'confidence', 'label'] as const) if (was[k] !== undefined && e[k] === undefined) (add as Record<string, unknown>)[k] = was[k];
    if (!Object.keys(add).length) return e;
    changed = true;
    return { ...e, ...add };
  });
  // the person's lines the pass dropped, put back between cards still there
  const edgeCap0 = mapCaps({ ...next, nodes }).edges;
  for (const p of prev.edges) {
    if (!theirs(p) || carried.length >= edgeCap0) continue;
    const from = now(p.from), to = now(p.to);
    if (!from || !to || from === to) continue;
    if (carried.some((e) => e.from === from && e.to === to && (p.kind === 'structure' ? e.kind === 'structure' : e.relation === p.relation))) continue;
    carried.push({ ...p, from, to });
    changed = true;
  }
  if (!back.length && !changed) return next;

  // and the placed cards' lines, to whatever is still on the map
  const edges: LogosEdge[] = carried;
  const has = (a: string, b: string) => edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
  const backIds = new Set(back.map((n) => n.id));
  const edgeCap = mapCaps({ ...next, nodes }).edges;
  for (const e of prev.edges) {
    if (edges.length >= edgeCap) break;
    if (!(backIds.has(e.from) || backIds.has(e.to))) continue;
    if (!ids.has(e.from) || !ids.has(e.to) || has(e.from, e.to)) continue;
    edges.push(e);
  }
  return { ...next, nodes, edges };
}
