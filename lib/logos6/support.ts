// lib/logos6/support.ts — WHAT AN IDEA RESTS ON, AND WHAT RESTS ON IT (Logos 6; pure).
//
// One reading of the map's lines, shared by the challenge engine (how much rests on a weakness decides which
// is shown first) and by Focus (one idea, with what holds it up to one side and what it holds up to the other).
//
// A line means what its relation says it means, and only some relations carry weight:
//   A supports / justifies / implies B      B rests on A
//   A leads_to / causes B                   B follows from A, so B rests on A
//   A depends on B                          A rests on B
//   A conflicts with B                      each pulls against the other
// Everything else — precedes, part_of, flows_to, relates, applies_to … — places things without holding them up,
// and is read as connected, not as support.

import type { LogosEdge, LogosNode, ThinkingMap } from '../logos';

type MapLike = Pick<ThinkingMap, 'nodes' | 'edges'>;

const HOLDS_UP = new Set(['supports', 'justifies', 'implies', 'leads_to', 'causes']);

/** For an edge that carries weight: [the one holding up, the one resting on it]. Null for one that does not. */
export function supportOf(e: Pick<LogosEdge, 'from' | 'to' | 'relation'>): [string, string] | null {
  if (HOLDS_UP.has(e.relation)) return [e.from, e.to];
  if (e.relation === 'depends') return [e.to, e.from];
  return null;
}

const byIdOf = (m: MapLike) => new Map(m.nodes.map((n) => [n.id, n]));

/** What `id` rests on, directly. */
export function restsOn(m: MapLike, id: string): LogosNode[] {
  const by = byIdOf(m);
  const out: LogosNode[] = [];
  for (const e of m.edges) {
    const s = supportOf(e);
    if (s && s[1] === id && s[0] !== id) {
      const n = by.get(s[0]);
      if (n && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

/** What rests on `id`, directly. */
export function restingOn(m: MapLike, id: string): LogosNode[] {
  const by = byIdOf(m);
  const out: LogosNode[] = [];
  for (const e of m.edges) {
    const s = supportOf(e);
    if (s && s[0] === id && s[1] !== id) {
      const n = by.get(s[1]);
      if (n && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

/** What pulls against `id`: either end of a 'conflicts' line, and any tension or counterpoint aimed at it. */
export function pulledAgainst(m: MapLike, id: string): LogosNode[] {
  const by = byIdOf(m);
  const out: LogosNode[] = [];
  for (const e of m.edges) {
    const other = e.from === id ? e.to : e.to === id ? e.from : null;
    if (!other || other === id) continue;
    const n = by.get(other);
    if (!n) continue;
    if (e.relation === 'conflicts' || ((n.type === 'tension' || n.type === 'counterpoint') && e.relation !== 'supports')) {
      if (!out.includes(n)) out.push(n);
    }
  }
  return out;
}

/** Connected, without holding up or pulling against: the rest of an idea's neighbourhood. */
export function besides(m: MapLike, id: string): LogosNode[] {
  const taken = new Set([...restsOn(m, id), ...restingOn(m, id), ...pulledAgainst(m, id)].map((n) => n.id));
  const by = byIdOf(m);
  const out: LogosNode[] = [];
  for (const e of m.edges) {
    const other = e.from === id ? e.to : e.to === id ? e.from : null;
    if (!other || other === id || taken.has(other)) continue;
    const n = by.get(other);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** How much rests on `id`, all the way down (to `depth` steps): the reason to look at one weakness before another. */
export function weightOf(m: MapLike, id: string, depth = 4): number {
  const down = new Map<string, string[]>();
  for (const e of m.edges) {
    const s = supportOf(e);
    if (s) down.set(s[0], [...(down.get(s[0]) ?? []), s[1]]);
  }
  const seen = new Set<string>([id]);
  let frontier = [id];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const x of frontier) for (const y of down.get(x) ?? []) if (!seen.has(y)) (seen.add(y), next.push(y));
    frontier = next;
  }
  return seen.size - 1;
}

/** The chain an idea stands on, upward, as far as it goes: for breadcrumbs and for "what this rests on". */
export function foundations(m: MapLike, id: string, depth = 4): LogosNode[] {
  const out: LogosNode[] = [];
  const seen = new Set<string>([id]);
  let frontier = [id];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const x of frontier) {
      for (const n of restsOn(m, x)) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        out.push(n);
        next.push(n.id);
      }
    }
    frontier = next;
  }
  return out;
}

/** A card of the person's reasoning, as opposed to Socria's drawing of a subject, their material, or a finding. */
export function isTheirs(n: LogosNode & { finding?: unknown }): boolean {
  return n.origin !== 'drawn' && n.origin !== 'source' && n.origin !== 'computed' && !n.finding;
}
