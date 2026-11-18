// lib/logos6/graph.ts — ONE CANONICAL GRAPH, THREE WAYS OF WORKING WITH IT (Logos 6 Mind Map 2.0; pure).
//
// A line of thinking has one map (lib/logos.ts ThinkingMap): its cards and its lines. Ideas, Logic and Structure are
// three ways of looking at and working on that same map — never three copies:
//   • IDEAS: cards where the person puts them, quick to add and connect, grouped as they like;
//   • LOGIC: the lines made explicit — what supports, conflicts with, depends on, causes what — each line with why it
//     holds, what bears it out, and whether the person confirmed it or Socria suggested it;
//   • STRUCTURE: a hierarchy — what sits inside what — laid out as a tree and an outline, folded and reordered.
//
// What is kept where:
//   • a card's own data (meaning, why it matters, notes, tags, sources, assumptions, properties, tone) is on the card
//     (LogosNode.mind) and is the same in every way of working;
//   • where the person put a card is kept per way of working (mind.pos.i, mind.pos.l): moving it in Ideas never
//     moves it in Logic, and switching never loses either; Structure is laid out from the tree, so nothing there can
//     be lost by switching;
//   • a line of STRUCTURE ("Derivatives" sits inside "Calculus": kind 'structure') is a different line from a line of
//     MEANING between the same cards ("Derivatives help solve optimisation"): both can exist, neither is the other.
//
// The structure is a projection, deterministic and never destructive:
//   1. a card the person put at the top level stays there;
//   2. otherwise its parent is its first line of structure that does not close a loop;
//   3. otherwise the map's own containment is read — part of, a kind of, applies to, supports, justifies, is needed
//      by — as an INFERRED parent, drawn as such, and never written into the map;
//   4. a loop is never made: a line of structure that would close one is refused (wouldCycle), an inferred one is
//      skipped.
// Every other line stays exactly as it is.

import type { LogosEdge, LogosNode, LogosRelation, NodeMind, ThinkingMap } from '../logos';

export type CanvasMode = 'ideas' | 'logic' | 'structure';
export const CANVAS_MODES: readonly CanvasMode[] = ['ideas', 'logic', 'structure'];
export const MODE_LABEL: Record<CanvasMode, string> = { ideas: 'Ideas', logic: 'Logic', structure: 'Structure' };
export const MODE_SAID: Record<CanvasMode, string> = {
  ideas: 'Brainstorm: put ideas anywhere, connect them, group them.',
  logic: 'Reasoning: why ideas connect — support, tension, dependency, cause.',
  structure: 'Organise: what sits inside what, as a tree and an outline.',
};

// ── lines: identity, family, status ──────────────────────────────────

/** A short stable hash of a string (FNV-1a), for a line's derived id. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** A line's identity: its own when it has one, else derived from its ends, its relation and its kind (stable). */
export function edgeIdOf(e: Pick<LogosEdge, 'id' | 'from' | 'to' | 'relation' | 'kind'>): string {
  return e.id ?? `e_${hash(`${e.from}>${e.to}:${e.kind === 'structure' ? 'structure' : e.relation}`)}`;
}

/** The kinds of meaning a line can carry, as the canvas shows and filters them. */
export type Family = 'support' | 'tension' | 'dependency' | 'cause' | 'sequence' | 'containment' | 'association';
export const FAMILY_OF: Record<LogosRelation, Family> = {
  supports: 'support',
  justifies: 'support',
  implies: 'support',
  equivalent_to: 'support',
  conflicts: 'tension',
  inhibits: 'tension',
  revises: 'tension',
  depends: 'dependency',
  applies_to: 'dependency',
  causes: 'cause',
  leads_to: 'cause',
  flows_to: 'sequence',
  becomes: 'sequence',
  precedes: 'sequence',
  transforms_to: 'sequence',
  part_of: 'containment',
  is_a: 'containment',
  relates: 'association',
};
export const FAMILY_LABEL: Record<Family, string> = {
  support: 'Support',
  tension: 'Tension',
  dependency: 'Dependency',
  cause: 'Cause and effect',
  sequence: 'Sequence',
  containment: 'Containment',
  association: 'Related',
};

/** What a line says, read from `from` to `to`, in plain words. */
export const RELATION_SAID: Record<LogosRelation, string> = {
  supports: 'supports',
  conflicts: 'conflicts with',
  depends: 'depends on',
  relates: 'relates to',
  leads_to: 'leads to',
  revises: 'revises',
  precedes: 'comes before',
  part_of: 'sits inside',
  transforms_to: 'becomes',
  implies: 'implies',
  justifies: 'justifies',
  equivalent_to: 'is equivalent to',
  applies_to: 'applies to',
  causes: 'causes',
  inhibits: 'holds back',
  is_a: 'is a kind of',
  flows_to: 'flows to',
  becomes: 'turns into',
};

/** The relations a person can choose for a line, in the order the canvas offers them. */
export const CHOOSABLE: readonly LogosRelation[] = ['supports', 'conflicts', 'depends', 'causes', 'leads_to', 'part_of', 'is_a', 'applies_to', 'implies', 'precedes', 'relates'];

export type LineStatus = 'confirmed' | 'suggested' | 'read';
/** Whether a line is the person's (confirmed, or one of structure they made), Socria's suggestion, or read from the conversation. */
export function lineStatus(e: Pick<LogosEdge, 'status' | 'kind'>): LineStatus {
  if (e.status === 'confirmed' || e.kind === 'structure') return 'confirmed';
  if (e.status === 'suggested') return 'suggested';
  return 'read';
}
export const STATUS_SAID: Record<LineStatus, string> = {
  confirmed: 'Confirmed by you',
  suggested: 'Suggested by Socria',
  read: 'Read from the conversation',
};

// ── structure: the tree, deterministic, never a loop ─────────────────

/** Containment read from a line of meaning: [child, parent], in priority order (the lower the stronger). */
const INFER: Partial<Record<LogosRelation, { rank: number; child: 'from' | 'to' }>> = {
  part_of: { rank: 1, child: 'from' },
  is_a: { rank: 2, child: 'from' },
  applies_to: { rank: 3, child: 'from' },
  supports: { rank: 4, child: 'from' },
  justifies: { rank: 4, child: 'from' },
  // "A depends on B": B is what A needs, so it sits under A
  depends: { rank: 5, child: 'to' },
};

/** The explicit lines of structure for a card, in order: [parent ids]. */
export function structuralParents(map: Pick<ThinkingMap, 'edges'>, id: string): string[] {
  return map.edges.filter((e) => e.kind === 'structure' && e.from === id).map((e) => e.to);
}

/** Whether putting `child` inside `parent` would close a loop (through the lines of structure and itself). */
export function wouldCycle(map: Pick<ThinkingMap, 'edges'>, child: string, parent: string): boolean {
  if (child === parent) return true;
  // walk up from the parent along lines of structure: reaching the child is a loop
  const seen = new Set<string>();
  const stack = [parent];
  while (stack.length) {
    const at = stack.pop()!;
    if (at === child) return true;
    if (seen.has(at)) continue;
    seen.add(at);
    for (const p of structuralParents(map, at)) stack.push(p);
  }
  return false;
}

export interface TreeRow {
  id: string;
  depth: number;
  parent: string | null;
  /** the parent was read from a line of meaning, not set by the person */
  inferred: boolean;
  children: number;
  folded: boolean;
  /** hidden under a folded branch */
  hidden: boolean;
}

/** Cards ranked for the top of a structure: what is being worked towards first (a goal, a question, a claim). */
const TOP_RANK: Partial<Record<string, number>> = { goal: 0, objective: 0, question: 1, decision: 1, claim: 2, thesis: 2, theorem: 2, category: 3, concept: 4 };

/**
 * THE STRUCTURE, as rows in reading order: each card once, with its depth, its parent (and whether that parent was
 * inferred), how many children it has, and whether it is folded or under a fold. Deterministic for the same map.
 */
export function structureRows(map: Pick<ThinkingMap, 'nodes' | 'edges'>): TreeRow[] {
  const ids = new Set(map.nodes.map((n) => n.id));
  const index = new Map(map.nodes.map((n, i) => [n.id, i]));
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const parentOf = new Map<string, { id: string; inferred: boolean }>();
  // a parent link would close a loop through the links chosen so far?
  const loops = (child: string, parent: string) => {
    for (let at: string | undefined = parent, n = 0; at && n <= map.nodes.length; at = parentOf.get(at)?.id, n++) if (at === child) return true;
    return false;
  };
  // 1–2: explicit structure, first line that does not loop
  for (const n of map.nodes) {
    if (n.mind?.top) continue;
    for (const p of structuralParents(map, n.id)) {
      if (ids.has(p) && !loops(n.id, p)) {
        parentOf.set(n.id, { id: p, inferred: false });
        break;
      }
    }
  }
  // 3: inferred containment, strongest first, in the map's own order
  const candidates: { child: string; parent: string; rank: number; at: number }[] = [];
  map.edges.forEach((e, at) => {
    if (e.kind === 'structure') return;
    const rule = INFER[e.relation];
    if (!rule) return;
    const child = rule.child === 'from' ? e.from : e.to, parent = rule.child === 'from' ? e.to : e.from;
    if (ids.has(child) && ids.has(parent) && child !== parent) candidates.push({ child, parent, rank: rule.rank, at });
  });
  candidates.sort((a, b) => a.rank - b.rank || a.at - b.at);
  for (const c of candidates) {
    if (parentOf.has(c.child) || byId.get(c.child)?.mind?.top) continue;
    if (loops(c.child, c.parent)) continue;
    parentOf.set(c.child, { id: c.parent, inferred: true });
  }
  // children, ordered by their place (mind.order), then by the map's order
  const kids = new Map<string | null, string[]>();
  for (const n of map.nodes) {
    const p = parentOf.get(n.id)?.id ?? null;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p)!.push(n.id);
  }
  const ord = (id: string) => byId.get(id)?.mind?.order;
  const sortKids = (list: string[], top: boolean) =>
    list.sort((a, b) => {
      const oa = ord(a), ob = ord(b);
      if (oa !== undefined || ob !== undefined) return (oa ?? Infinity) - (ob ?? Infinity) || index.get(a)! - index.get(b)!;
      if (top) {
        const ra = TOP_RANK[byId.get(a)!.type] ?? 9, rb = TOP_RANK[byId.get(b)!.type] ?? 9;
        if (ra !== rb) return ra - rb;
      }
      return index.get(a)! - index.get(b)!;
    });
  const rows: TreeRow[] = [];
  const walk = (id: string, depth: number, hidden: boolean) => {
    const list = sortKids([...(kids.get(id) ?? [])], false);
    const folded = !!byId.get(id)?.mind?.folded && list.length > 0;
    const p = parentOf.get(id);
    rows.push({ id, depth, parent: p?.id ?? null, inferred: !!p?.inferred, children: list.length, folded, hidden });
    for (const k of list) walk(k, depth + 1, hidden || folded);
  };
  for (const r of sortKids([...(kids.get(null) ?? [])], true)) walk(r, 0, false);
  return rows;
}

/** The structure as an indented outline (for copying, and for Socria). Folded branches are included. */
export function outlineOf(map: Pick<ThinkingMap, 'nodes' | 'edges' | 'title'>): string {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const lines = structureRows(map).map((r) => `${'  '.repeat(r.depth)}- ${byId.get(r.id)!.label}${byId.get(r.id)!.mind?.subtitle ? ` — ${byId.get(r.id)!.mind!.subtitle}` : ''}`);
  return [map.title ? `${map.title}\n` : '', ...lines].join('\n').trim();
}

// ── where things are, in each way of working ─────────────────────────

export type Placed = Map<string, { x: number; y: number; manual: boolean }>;
const CARD_W = 180, CARD_H = 64, GAP_X = 56, GAP_Y = 48;

/**
 * IDEAS: where the person put each card; the rest laid out in a calm grid by group (cards of a group together),
 * then by connection (a card near the ones it connects to), so a new map is never a pile.
 */
export function ideasPlaces(map: Pick<ThinkingMap, 'nodes' | 'edges'>): Placed {
  const out: Placed = new Map();
  for (const n of map.nodes) if (n.mind?.pos?.i) out.set(n.id, { x: n.mind.pos.i[0], y: n.mind.pos.i[1], manual: true });
  const loose = map.nodes.filter((n) => !out.has(n.id));
  if (!loose.length) return out;
  // order: by group, then by first appearance in the lines (connected cards next to each other)
  const touch = new Map<string, number>();
  map.edges.forEach((e, i) => {
    if (!touch.has(e.from)) touch.set(e.from, i);
    if (!touch.has(e.to)) touch.set(e.to, i);
  });
  const order = [...loose].sort((a, b) => (a.group ?? '~').localeCompare(b.group ?? '~') || (touch.get(a.id) ?? 1e9) - (touch.get(b.id) ?? 1e9));
  const cols = Math.max(2, Math.min(5, Math.ceil(Math.sqrt(order.length * 1.6))));
  // below the cards already placed by hand
  const floor = out.size ? Math.max(...[...out.values()].map((p) => p.y)) + CARD_H + GAP_Y * 1.5 : 0;
  order.forEach((n, i) => out.set(n.id, { x: (i % cols) * (CARD_W + GAP_X), y: floor + Math.floor(i / cols) * (CARD_H + GAP_Y + 12), manual: false }));
  return out;
}

/** Which of two connected cards sits ABOVE in a reasoning layout: what is supported, needed, caused from. */
function upper(e: LogosEdge): [string, string] | null {
  const fam = FAMILY_OF[e.relation];
  if (e.kind === 'structure') return [e.to, e.from];
  switch (fam) {
    case 'support':
      return e.relation === 'implies' ? [e.from, e.to] : [e.to, e.from];
    case 'containment':
      return [e.to, e.from];
    case 'dependency':
      return e.relation === 'depends' ? [e.from, e.to] : [e.to, e.from];
    case 'cause':
    case 'sequence':
      return [e.from, e.to];
    default:
      return null;
  }
}

/**
 * LOGIC: where the person put each card; the rest in layers — what is supported, needed or caused from above what
 * supports, is needed for or follows from it — ordered within a layer to keep lines short. Loops are broken, never
 * drawn as layers that climb back.
 */
export function logicPlaces(map: Pick<ThinkingMap, 'nodes' | 'edges'>): Placed {
  const out: Placed = new Map();
  const ids = map.nodes.map((n) => n.id);
  const below = new Map<string, string[]>(ids.map((id) => [id, []]));
  const aboveCount = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const e of map.edges) {
    const u = upper(e);
    if (!u || !below.has(u[0]) || !below.has(u[1]) || u[0] === u[1]) continue;
    below.get(u[0])!.push(u[1]);
    aboveCount.set(u[1], (aboveCount.get(u[1]) ?? 0) + 1);
  }
  // layers by longest path from the tops, loops cut by visiting each card once on the current path
  const layer = new Map<string, number>();
  const onPath = new Set<string>();
  const visit = (id: string, depth: number) => {
    if (onPath.has(id)) return;
    if ((layer.get(id) ?? -1) >= depth) return;
    layer.set(id, depth);
    onPath.add(id);
    for (const k of below.get(id) ?? []) visit(k, depth + 1);
    onPath.delete(id);
  };
  const tops = ids.filter((id) => (aboveCount.get(id) ?? 0) === 0);
  for (const t of tops.length ? tops : ids.slice(0, 1)) visit(t, 0);
  for (const id of ids) if (!layer.has(id)) visit(id, 0);
  const rows = new Map<number, string[]>();
  for (const id of ids) {
    const l = Math.min(layer.get(id) ?? 0, 12);
    if (!rows.has(l)) rows.set(l, []);
    rows.get(l)!.push(id);
  }
  // within a layer: by the average place of what they connect to above (barycentre), else the map's order
  const xOf = new Map<string, number>();
  const sorted = [...rows.keys()].sort((a, b) => a - b);
  for (const l of sorted) {
    const row = rows.get(l)!;
    const bary = (id: string) => {
      const ups = map.edges.map(upper).filter((u): u is [string, string] => !!u && u[1] === id && xOf.has(u[0])).map((u) => xOf.get(u[0])!);
      return ups.length ? ups.reduce((s, v) => s + v, 0) / ups.length : null;
    };
    const ranked = row.map((id, i) => ({ id, b: bary(id), i })).sort((a, b) => (a.b ?? a.i * 1000) - (b.b ?? b.i * 1000) || a.i - b.i);
    const width = ranked.length * (CARD_W + GAP_X) - GAP_X;
    ranked.forEach((r, i) => {
      const x = i * (CARD_W + GAP_X) - width / 2;
      xOf.set(r.id, x);
    });
  }
  for (const n of map.nodes) {
    const manual = n.mind?.pos?.l;
    if (manual) out.set(n.id, { x: manual[0], y: manual[1], manual: true });
    else out.set(n.id, { x: xOf.get(n.id) ?? 0, y: (layer.get(n.id) ?? 0) * (CARD_H + GAP_Y + 30), manual: false });
  }
  return out;
}

/** STRUCTURE: the tree laid out left to right, a row per visible card, indented by depth. */
export function structurePlaces(rows: readonly TreeRow[]): Placed {
  const out: Placed = new Map();
  let y = 0;
  for (const r of rows) {
    if (r.hidden) continue;
    out.set(r.id, { x: r.depth * (CARD_W * 0.62 + 24), y, manual: false });
    y += CARD_H * 0.62 + 18;
  }
  return out;
}

// ── a card, inspected ────────────────────────────────────────────────

export interface Connection {
  edge: LogosEdge;
  id: string;
  other: LogosNode;
  /** the line read from this card: "supports", "is supported by" */
  said: string;
  family: Family;
  status: LineStatus;
  outgoing: boolean;
}

/** What a line says read from the other end ("is supported by", "contains"). */
const INVERSE: Partial<Record<LogosRelation, string>> = {
  supports: 'is supported by',
  depends: 'is needed by',
  leads_to: 'follows from',
  precedes: 'comes after',
  part_of: 'contains',
  implies: 'follows from',
  justifies: 'is justified by',
  applies_to: 'is shaped by',
  causes: 'is caused by',
  inhibits: 'is held back by',
  is_a: 'has as a kind',
  flows_to: 'receives from',
  becomes: 'comes from',
  transforms_to: 'comes from',
  revises: 'is revised by',
};

/** Everything a card connects to, each line with what it says from here, its kind and its status. */
export function connectionsOf(map: Pick<ThinkingMap, 'nodes' | 'edges'>, id: string): Connection[] {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const out: Connection[] = [];
  for (const e of map.edges) {
    const outgoing = e.from === id;
    if (!outgoing && e.to !== id) continue;
    const other = byId.get(outgoing ? e.to : e.from);
    if (!other) continue;
    const said = e.kind === 'structure' ? (outgoing ? 'sits inside' : 'contains') : outgoing ? RELATION_SAID[e.relation] : (INVERSE[e.relation] ?? RELATION_SAID[e.relation]);
    out.push({ edge: e, id: edgeIdOf(e), other, said, family: e.kind === 'structure' ? 'containment' : FAMILY_OF[e.relation], status: lineStatus(e), outgoing });
  }
  return out;
}

/** Whether a card carries anything the person wrote beyond its label (what protects it from the map pass). */
export function authored(mind: NodeMind | undefined): boolean {
  if (!mind) return false;
  return !!(mind.subtitle || mind.meaning || mind.why || mind.notes || mind.tags?.length || mind.sources?.length || mind.assumptions?.length || mind.props?.length);
}

/** The cards and lines a Logic filter brings forward (the rest step back). */
export type LogicFilter = 'all' | 'tensions' | 'evidence' | 'assumptions' | 'suggested';
export function logicFocus(map: Pick<ThinkingMap, 'nodes' | 'edges'>, f: LogicFilter): { nodes: Set<string>; edges: Set<string> } | null {
  if (f === 'all') return null;
  const nodes = new Set<string>(), edges = new Set<string>();
  for (const e of map.edges) {
    const fam = e.kind === 'structure' ? 'containment' : FAMILY_OF[e.relation];
    const hit = f === 'tensions' ? fam === 'tension' : f === 'evidence' ? fam === 'support' : f === 'suggested' ? lineStatus(e) === 'suggested' : false;
    if (hit) {
      edges.add(edgeIdOf(e));
      nodes.add(e.from);
      nodes.add(e.to);
    }
  }
  if (f === 'assumptions') for (const n of map.nodes) if (n.type === 'assumption' || n.mind?.assumptions?.length) nodes.add(n.id);
  return { nodes, edges };
}

/** A path of reasoning between two cards (shortest, any direction), as card ids — for "how does this lead to that". */
export function pathBetween(map: Pick<ThinkingMap, 'edges'>, a: string, b: string): string[] | null {
  if (a === b) return [a];
  const next = new Map<string, string[]>();
  for (const e of map.edges) {
    next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
    next.set(e.to, [...(next.get(e.to) ?? []), e.from]);
  }
  const prev = new Map<string, string>([[a, '']]);
  const queue = [a];
  while (queue.length) {
    const at = queue.shift()!;
    for (const k of next.get(at) ?? []) {
      if (prev.has(k)) continue;
      prev.set(k, at);
      if (k === b) {
        const path = [b];
        for (let p = at; p; p = prev.get(p)!) path.unshift(p);
        return path;
      }
      queue.push(k);
    }
  }
  return null;
}
