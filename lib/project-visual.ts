// lib/project-visual.ts
//
// THE PROJECT VISUAL — the same project drawn the way its content asks to be
// drawn (lib/project-home.ts chooseVisual decides which; the person can
// switch). Every layout here reads the Project's atlas (lib/mind/atlas.ts):
// nothing is drawn that is not in its conversations, its maps or its goals.
//
//   ideas / concepts   the Project in the middle, its conversations around
//                      it, and what they hold on the outside — a shared idea
//                      sits between the conversations that share it
//   evidence           claims on the left, the evidence that bears on them on
//                      the right, supporting and conflicting lines told apart
//   roadmap            the goals the person set, then each conversation in
//                      the order it began with the steps and constraints it
//                      holds — progress only where they marked it
//   timeline           conversations along time, and arcs for what one
//                      carried into another
//   models             every model, plot and object of thought, and where
//
// PURE. Positions only; the component draws.

import { neighbourhoodOf, radialAround, type Atlas, type AtlasNode, type RadialPlace } from '@/lib/mind/atlas';

export interface Placed {
  id: string;
  x: number;
  y: number;
}

// ── ideas and concepts ──────────────────────────────────────────────

const CONCEPTUAL = new Set(['Concept', 'Question', 'Given', 'Idea', 'Belief', 'Assumption', 'Theme']);

/** The atlas around the Project, optionally held to concepts and questions. */
export function webOf(atlas: Atlas, anchor: string, concepts: boolean, limit = 72): Atlas {
  const keep = concepts
    ? atlas.nodes.filter((n) => n.kind === 'chat' || n.kind === 'project' || CONCEPTUAL.has(n.type))
    : atlas.nodes;
  const ids = new Set(keep.map((n) => n.id));
  const narrowed: Atlas = { nodes: keep, edges: atlas.edges.filter((e) => ids.has(e.from) && ids.has(e.to)), stats: atlas.stats };
  return neighbourhoodOf(narrowed, anchor, limit);
}

export function webLayout(atlas: Atlas, anchor: string, concepts: boolean, W: number, H: number): { nb: Atlas; place: Record<string, RadialPlace> } {
  const nb = webOf(atlas, anchor, concepts);
  return { nb, place: radialAround(nb, anchor, W, H) };
}

// ── evidence ────────────────────────────────────────────────────────

const EVIDENCE = new Set(['Evidence', 'Source']);

export interface EvidenceLayout {
  claims: Placed[];
  evidence: Placed[];
  links: { from: string; to: string; rel: string }[];
}

/** Evidence on the right, what it bears on at the left, in the order that keeps lines short. */
export function evidenceLayout(atlas: Atlas, W: number, H: number): EvidenceLayout {
  const byId = new Map(atlas.nodes.map((n) => [n.id, n]));
  const links = atlas.edges
    .filter((e) => {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      return !!a && !!b && a.kind !== 'chat' && b.kind !== 'chat' && a.kind !== 'project' && b.kind !== 'project'
        && (EVIDENCE.has(a.type) !== EVIDENCE.has(b.type));
    })
    .map((e) => {
      const aEv = EVIDENCE.has(byId.get(e.from)!.type);
      return { from: aEv ? e.from : e.to, to: aEv ? e.to : e.from, rel: e.rel };
    });
  const evIds = [...new Set(links.map((l) => l.from))];
  const claimIds = [...new Set(links.map((l) => l.to))];
  // order claims by how much evidence bears on them, then evidence by the
  // mean position of what it bears on — fewer crossings, no solver needed
  claimIds.sort((a, b) => links.filter((l) => l.to === b).length - links.filter((l) => l.to === a).length || a.localeCompare(b));
  const cy = (i: number, n: number) => (n <= 1 ? H / 2 : 40 + (i * (H - 80)) / (n - 1));
  const claims = claimIds.map((id, i) => ({ id, x: W * 0.3, y: cy(i, claimIds.length) }));
  const at = new Map(claims.map((c) => [c.id, c.y]));
  const mean = (id: string) => {
    const ys = links.filter((l) => l.from === id).map((l) => at.get(l.to) ?? H / 2);
    return ys.reduce((s, y) => s + y, 0) / Math.max(1, ys.length);
  };
  evIds.sort((a, b) => mean(a) - mean(b) || a.localeCompare(b));
  const evidence = evIds.map((id, i) => ({ id, x: W * 0.72, y: cy(i, evIds.length) }));
  return { claims, evidence, links };
}

// ── roadmap ─────────────────────────────────────────────────────────

const ROAD = new Set(['Goal', 'Plan', 'Constraint', 'Decision']);

export interface RoadStop {
  chatId: string;
  x: number;
  /** the steps, constraints and decisions on this conversation's map, in its order */
  items: { id: string; label: string; type: string }[];
}

/**
 * The goals as their own lane, then each conversation as a stop in the order
 * it began, carrying the road-shaped things its map holds. A stop with
 * nothing road-shaped still appears — it is where the work happened.
 */
export function roadmapLayout(atlas: Atlas, chatOrder: string[], W: number): { stops: RoadStop[] } {
  const byChat = new Map<string, { id: string; label: string; type: string }[]>();
  for (const n of atlas.nodes) {
    if (n.kind !== 'idea' && n.kind !== 'memory') continue;
    if (!ROAD.has(n.type)) continue;
    for (const c of n.chats) {
      const list = byChat.get(c) ?? [];
      if (list.length < 5) list.push({ id: n.id, label: n.label, type: n.type });
      byChat.set(c, list);
    }
  }
  const order = chatOrder.filter((id) => atlas.nodes.some((n) => n.id === `c:${id}`));
  const n = order.length;
  const stops = order.map((chatId, i) => ({
    chatId,
    x: n <= 1 ? W / 2 : 70 + (i * (W - 140)) / (n - 1),
    items: byChat.get(chatId) ?? [],
  }));
  return { stops };
}

// ── timeline ────────────────────────────────────────────────────────

export interface TimelinePoint extends Placed {
  at: number;
  /** above the line or below it, alternating so labels never collide */
  up: boolean;
}

export function timelineLayout(
  chats: { id: string; at: number }[],
  atlas: Atlas,
  W: number,
  H: number
): { points: TimelinePoint[]; arcs: { from: string; to: string; label: string; n: number }[]; ticks: { x: number; at: number }[] } {
  const list = [...chats].filter((c) => c.at > 0).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const lo = list[0]?.at ?? 0;
  const hi = list[list.length - 1]?.at ?? 0;
  const span = Math.max(1, hi - lo);
  const left = 60;
  const right = W - 60;
  // by time, but never closer than a label needs: evenly spaced when crowded
  const minGap = 44;
  const raw = list.map((c) => left + ((c.at - lo) / span) * (right - left));
  for (let i = 1; i < raw.length; i++) if (raw[i] - raw[i - 1] < minGap) raw[i] = raw[i - 1] + minGap;
  const over = raw.length ? raw[raw.length - 1] - right : 0;
  const xs = over > 0 ? list.map((_, i) => (list.length === 1 ? W / 2 : left + (i * (right - left)) / (list.length - 1))) : raw;
  const points = list.map((c, i) => ({ id: c.id, x: xs[i], y: H / 2, at: c.at, up: i % 2 === 0 }));
  // what one conversation carried into a later one: an idea or memory in both
  const arcs = new Map<string, { from: string; to: string; label: string; n: number }>();
  const pos = new Map(points.map((p, i) => [p.id, i]));
  for (const node of atlas.nodes) {
    if (node.kind === 'chat' || node.kind === 'project' || node.chats.length < 2) continue;
    const cs = node.chats.filter((c) => pos.has(c)).sort((a, b) => pos.get(a)! - pos.get(b)!);
    for (let i = 1; i < cs.length; i++) {
      const k = `${cs[i - 1]}|${cs[i]}`;
      const a = arcs.get(k);
      if (a) a.n++;
      else arcs.set(k, { from: cs[i - 1], to: cs[i], label: node.label, n: 1 });
    }
  }
  const ticks: { x: number; at: number }[] = [];
  if (list.length >= 2 && over <= 0) {
    for (let k = 0; k <= 4; k++) ticks.push({ x: left + (k / 4) * (right - left), at: lo + (k / 4) * span });
  }
  return { points, arcs: [...arcs.values()].slice(0, 40), ticks };
}

// ── models ──────────────────────────────────────────────────────────

export function madeThings(atlas: Atlas): AtlasNode[] {
  const order = { model: 0, plot: 1, object: 2 } as Record<string, number>;
  return atlas.nodes
    .filter((n) => n.kind === 'model' || n.kind === 'plot' || n.kind === 'object')
    .sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || b.chats.length - a.chats.length || a.label.localeCompare(b.label));
}
