// lib/logos5/universe.ts — EVERY LINE OF THINKING AS A MIND GRAPH, ON ONE MAP.
//
// The Universal Map (Logos 5): each conversation drawn as its own small
// graph — the Thinking Map it grew, or the topics its files were sorted into
// — and the ideas that more than one conversation shares drawn as bridges
// between them. It is read from the sessions as they are; nothing is made up
// for a conversation that has no map: it is shown as itself, a single card,
// and says it has no map yet.
//
// Every position is computed here, deterministically: the same sessions draw
// the same picture on every screen.
//
// PURE.

import { wordsOf } from './linking';

export interface UniverseIn {
  id: string;
  title: string;
  updatedAt: number;
  map?: { nodes?: { id: string; label: string; type?: string }[]; edges?: { from: string; to: string }[]; objects?: { objs?: { kind: string; states: unknown[]; at: number }[] } } | null;
  messages?: { role: string }[];
}

export interface UNode {
  id: string;
  label: string;
  /** 'idea' from the map; 'topic' from a study */
  from: 'idea' | 'topic';
  x: number;
  y: number;
  /** how many lines meet here, for its size */
  degree: number;
}

export interface Cluster {
  id: string;
  title: string;
  at: number;
  /** its centre on the universal map */
  x: number;
  y: number;
  r: number;
  nodes: UNode[];
  edges: { from: string; to: string }[];
  /** turns said in it */
  turns: number;
  /** nodes it holds that are not drawn (past the cap) */
  more: number;
}

export interface Bridge {
  a: { cluster: string; node: string };
  b: { cluster: string; node: string };
  /** the shared words */
  says: string;
}

export interface Universe {
  clusters: Cluster[];
  bridges: Bridge[];
  width: number;
  height: number;
}

const MAX_CLUSTERS = 60;
const MAX_NODES = 14;
const MAX_BRIDGES = 48;
const CELL = 300;

/**
 * What a session holds to draw: the topics its files were sorted into, then
 * the ideas its map grew — both are its thinking, and a study's topics lead.
 */
function graphOf(s: UniverseIn): { nodes: { id: string; label: string; from: UNode['from'] }[]; edges: { from: string; to: string }[] } {
  const study = s.map?.objects?.objs?.find((o) => o.kind === 'study');
  const st = study?.states?.[study.at] as { topics?: { id: string; title: string; after?: string[] }[] } | undefined;
  const topics = (st?.topics ?? []).filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string');
  const ideas = (s.map?.nodes ?? []).filter((n) => n && typeof n.id === 'string' && typeof n.label === 'string' && n.label.trim());
  const ids = new Set(ideas.map((n) => n.id));
  // a topic's id ("t1") is kept apart from a card's, so the two never meet by accident
  return {
    nodes: [...topics.map((t) => ({ id: `topic:${t.id}`, label: t.title, from: 'topic' as const })), ...ideas.map((n) => ({ id: n.id, label: n.label, from: 'idea' as const }))],
    edges: [
      ...topics.flatMap((t) => (t.after ?? []).filter((a) => topics.some((x) => x.id === a)).map((a) => ({ from: `topic:${a}`, to: `topic:${t.id}` }))),
      ...(s.map?.edges ?? []).filter((e) => ids.has(e.from) && ids.has(e.to)),
    ],
  };
}

/**
 * A graph laid out in its own circle: the most connected idea at the middle,
 * the rest on rings around it in order of how connected they are.
 */
function layoutCluster(nodes: { id: string; label: string; from: UNode['from'] }[], edges: { from: string; to: string }[], r: number): UNode[] {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const order = [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || nodes.indexOf(a) - nodes.indexOf(b));
  const out: UNode[] = [];
  const hub = order.length > 2 && (degree.get(order[0].id) ?? 0) > 1;
  if (hub) out.push({ ...order[0], x: 0, y: 0, degree: degree.get(order[0].id) ?? 0 });
  const rest = hub ? order.slice(1) : order;
  const inner = Math.min(rest.length, 6);
  rest.forEach((n, i) => {
    const ring = i < inner ? 0 : 1;
    const k = ring === 0 ? inner : rest.length - inner;
    const at = ring === 0 ? i : i - inner;
    const radius = (ring === 0 ? (rest.length > 6 ? 0.45 : 0.55) : 0.85) * r;
    const turn = (2 * Math.PI * at) / Math.max(1, k) - Math.PI / 2 + (ring ? Math.PI / Math.max(1, k) : 0);
    out.push({ ...n, x: Math.round(Math.cos(turn) * radius), y: Math.round(Math.sin(turn) * radius * 0.82), degree: degree.get(n.id) ?? 0 });
  });
  return out;
}

/** Labels two conversations share in meaning: most of the shorter one's words in the other. */
function shared(a: string, b: string): string | null {
  const wa = [...new Set(wordsOf(a))];
  const wb = new Set(wordsOf(b));
  if (!wa.length || !wb.size) return null;
  const both = wa.filter((w) => wb.has(w));
  const least = Math.min(wa.length, wb.size);
  if (!both.length || both.length / least < 0.6) return null;
  // one short common word is not a shared idea
  if (both.length === 1 && both[0].length < 6) return null;
  return both.join(' ');
}

/**
 * The universe of these sessions: newest first, laid out in rows `cols`
 * wide, each with its graph; bridges between ideas that recur.
 */
export function universeOf(sessions: readonly UniverseIn[], cols = 4): Universe {
  const list = [...sessions]
    .filter((s) => s && typeof s.id === 'string')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX_CLUSTERS);
  const c = Math.max(1, cols);
  const clusters: Cluster[] = list.map((s, i) => {
    const g = graphOf(s);
    const kept = g.nodes.slice(0, MAX_NODES);
    const ids = new Set(kept.map((n) => n.id));
    const edges = g.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    const r = kept.length ? 92 : 40;
    return {
      id: s.id,
      title: s.title || 'A line of thinking',
      at: s.updatedAt || 0,
      x: (i % c) * CELL + CELL / 2,
      y: Math.floor(i / c) * CELL + CELL / 2,
      r,
      nodes: layoutCluster(kept, edges, r),
      edges,
      turns: (s.messages ?? []).filter((m) => m.role === 'user').length,
      more: Math.max(0, g.nodes.length - kept.length),
    };
  });
  const bridges: Bridge[] = [];
  const seen = new Set<string>();
  outer: for (let i = 0; i < clusters.length; i++)
    for (let j = i + 1; j < clusters.length; j++) {
      for (const a of clusters[i].nodes)
        for (const b of clusters[j].nodes) {
          const says = shared(a.label, b.label);
          if (!says) continue;
          const key = `${clusters[i].id}|${clusters[j].id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          bridges.push({ a: { cluster: clusters[i].id, node: a.id }, b: { cluster: clusters[j].id, node: b.id }, says });
          if (bridges.length >= MAX_BRIDGES) break outer;
        }
    }
  const rows = Math.max(1, Math.ceil(clusters.length / c));
  return { clusters, bridges, width: Math.min(clusters.length || 1, c) * CELL, height: rows * CELL };
}
