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

const placed = (n: LogosNode) => !!n.hand || !!n.finding;

/** The landed map, with what the person placed kept and what the pass cannot know carried over. */
export function keepPlaced(prev: Pick<ThinkingMap, 'nodes' | 'edges' | 'removed'> | null | undefined, next: ThinkingMap): ThinkingMap {
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
    if (!Object.keys(add).length) return n;
    changed = true;
    return { ...n, ...add };
  });

  // what it dropped, is put back — while there is room
  const ids = new Set(nodes.map((n) => n.id));
  const keys = new Set(nodes.map((n) => keyOf(n.label)));
  const room = Math.max(0, mapCaps({ ...next, nodes }).nodes - nodes.length);
  const back = prev.nodes.filter((n) => placed(n) && !ids.has(n.id) && !keys.has(keyOf(n.label)) && !removed.has(keyOf(n.label))).slice(0, room);
  if (!back.length && !changed) return next;
  for (const n of back) {
    nodes.push(n);
    ids.add(n.id);
  }

  // and its lines, to whatever is still on the map
  const edges: LogosEdge[] = [...next.edges];
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
