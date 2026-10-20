// lib/logos5/universe.ts — EVERY CHAT, MERGED INTO ONE MIND MAP.
//
// The Universal Map is Logos 5's home: every line of thinking drawn as its
// own small graph — the topics its files were sorted into and the ideas its
// Thinking Map grew — and every Core chat as a point of its own, all on one
// map. The ideas two of them share are drawn as bridges, and the bridges pull
// what they join together: related thinking ends up near itself, so the map
// reads as one map, not a grid of chats.
//
// It is read from the conversations as they are. Nothing is made up for a
// conversation with no map: it is drawn as itself, a single point, and says
// it has no map yet. A line of thinking with nothing said in it is not drawn.
//
// Every position is computed here, deterministically — no randomness, no
// clock — so the same conversations draw the same map on every screen.
//
// PURE.

import { wordsOf } from './linking';

export interface UniverseIn {
  id: string;
  title: string;
  updatedAt: number;
  /** a Logos line of thinking (the default), or a Core chat */
  kind?: 'logos' | 'core';
  projectId?: string | null;
  map?: { nodes?: { id: string; label: string; type?: string }[]; edges?: { from: string; to: string }[]; objects?: { objs?: { kind: string; states: unknown[]; at: number }[] } } | null;
  messages?: { role: string }[];
}

export interface UNode {
  id: string;
  label: string;
  /** 'idea' from the map; 'topic' from a study */
  from: 'idea' | 'topic';
  /** its place within its cluster, from the cluster's centre */
  x: number;
  y: number;
  /** how many lines meet here, for its size */
  degree: number;
}

export interface Cluster {
  id: string;
  kind: 'logos' | 'core';
  title: string;
  at: number;
  projectId: string | null;
  /** its centre on the map */
  x: number;
  y: number;
  r: number;
  nodes: UNode[];
  edges: { from: string; to: string }[];
  /** the person's turns in it */
  turns: number;
  /** nodes it holds that are not drawn (past the cap) */
  more: number;
}

export interface Bridge {
  a: { cluster: string; node: string | null };
  b: { cluster: string; node: string | null };
  /** the shared words */
  says: string;
}

export interface Universe {
  clusters: Cluster[];
  bridges: Bridge[];
  width: number;
  height: number;
}

const MAX_CLUSTERS = 80;
const MAX_NODES = 14;
const MAX_BRIDGES = 64;
const MARGIN = 40;

/**
 * What a line of thinking holds to draw: the topics its files were sorted
 * into, then the ideas its map grew — both are its thinking, a study's lead.
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
    const radius = rest.length === 1 ? 0 : (ring === 0 ? (rest.length > 6 ? 0.45 : 0.58) : 0.86) * r;
    const turn = (2 * Math.PI * at) / Math.max(1, k) - Math.PI / 2 + (ring ? Math.PI / Math.max(1, k) : 0);
    out.push({ ...n, x: Math.round(Math.cos(turn) * radius), y: Math.round(Math.sin(turn) * radius * 0.84), degree: degree.get(n.id) ?? 0 });
  });
  return out;
}

/** Two labels that share an idea: most of the shorter one's meaningful words in the other. */
export function shared(a: string, b: string): string | null {
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

/** A cluster's size from what it holds: a bare chat is a point, a full map a disc. */
function radiusOf(n: number, kind: 'logos' | 'core'): number {
  if (!n) return kind === 'core' ? 16 : 22;
  return Math.min(96, 40 + 7 * Math.min(n, 8));
}

/**
 * The room a cluster takes: its disc, and its name and what it holds written
 * under it — a name is wider than a small disc, so the room is a box.
 */
function boxOf(c: Cluster): { hw: number; top: number; bottom: number } {
  const bare = !c.nodes.length;
  return { hw: Math.max(c.r + 18, bare ? (c.kind === 'core' ? 92 : 104) : 128), top: c.r + 18, bottom: c.r + (bare ? 46 : 58) };
}

/**
 * The places of the clusters: a spiral to begin (newest in the middle), then
 * a few hundred steps of a small, fixed simulation — bridges pull what they
 * join toward each other, a weak pull to the middle keeps the map in one
 * piece, and boxes that overlap are pushed apart along the shorter way out.
 * The last steps only part what still overlaps, so nothing ends on top of
 * anything else.
 */
function settle(clusters: Cluster[], bridges: Bridge[]): void {
  const n = clusters.length;
  if (!n) return;
  const index = new Map(clusters.map((c, i) => [c.id, i]));
  const box = clusters.map(boxOf);
  clusters.forEach((c, i) => {
    const a = i * 2.399963;
    const d = 90 * Math.sqrt(i);
    c.x = Math.cos(a) * d;
    c.y = Math.sin(a) * d;
  });
  const links = bridges.map((b) => [index.get(b.a.cluster)!, index.get(b.b.cluster)!] as const).filter(([i, j]) => i !== undefined && j !== undefined && i !== j);
  const GAP = 18;
  const part = (i: number, j: number, fx: Float64Array, fy: Float64Array, strength: number) => {
    const bi = box[i], bj = box[j];
    // the boxes' centres: the name sits under the disc, so a box's middle is below the disc's
    const dx = clusters[j].x - clusters[i].x;
    const dy = clusters[j].y + (bj.bottom - bj.top) / 2 - (clusters[i].y + (bi.bottom - bi.top) / 2);
    const ox = bi.hw + bj.hw + GAP - Math.abs(dx);
    const oy = (bi.top + bi.bottom) / 2 + (bj.top + bj.bottom) / 2 + GAP - Math.abs(dy);
    if (ox <= 0 || oy <= 0) return false;
    // out along the shorter way; two in one place part along a fixed direction of their own
    if (ox < oy) {
      const sx = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);
      fx[i] -= (sx * ox * strength) / 2;
      fx[j] += (sx * ox * strength) / 2;
    } else {
      const sy = dy === 0 ? (j % 2 ? 1 : -1) : Math.sign(dy);
      fy[i] -= (sy * oy * strength) / 2;
      fy[j] += (sy * oy * strength) / 2;
    }
    return true;
  };
  const STEPS = 300;
  for (let s = 0; s < STEPS; s++) {
    const heat = 1 - s / STEPS;
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        if (part(i, j, fx, fy, 0.5)) continue;
        // apart already: a little push, less the further
        const dx = clusters[j].x - clusters[i].x;
        const dy = clusters[j].y - clusters[i].y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const push = 2400 / (d * d);
        fx[i] -= (dx / d) * push;
        fy[i] -= (dy / d) * push;
        fx[j] += (dx / d) * push;
        fy[j] += (dy / d) * push;
      }
    for (const [i, j] of links) {
      const dx = clusters[j].x - clusters[i].x;
      const dy = clusters[j].y - clusters[i].y;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      const rest = box[i].hw + box[j].hw + GAP;
      const pull = (d - rest) * 0.12;
      fx[i] += (dx / d) * pull;
      fy[i] += (dy / d) * pull;
      fx[j] -= (dx / d) * pull;
      fy[j] -= (dy / d) * pull;
    }
    for (let i = 0; i < n; i++) {
      fx[i] -= clusters[i].x * 0.01;
      fy[i] -= clusters[i].y * 0.014;
      const cap = 40 * heat + 2;
      clusters[i].x += Math.max(-cap, Math.min(cap, fx[i]));
      clusters[i].y += Math.max(-cap, Math.min(cap, fy[i]));
    }
  }
  // then only parting, until nothing overlaps
  for (let s = 0; s < 200; s++) {
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);
    let any = false;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) any = part(i, j, fx, fy, 1.02) || any;
    if (!any) break;
    for (let i = 0; i < n; i++) {
      clusters[i].x += fx[i];
      clusters[i].y += fy[i];
    }
  }
}

/**
 * Every conversation on one map: lines of thinking with something in them
 * and Core chats, newest first, at most eighty; bridges between the ideas
 * they share; every position computed.
 */
export function universeOf(conversations: readonly UniverseIn[]): Universe {
  const list = [...conversations]
    .filter((s) => s && typeof s.id === 'string')
    // a line of thinking with nothing said in it holds nothing to draw
    .filter((s) => s.kind === 'core' || (s.messages ?? []).length > 0 || (s.map?.nodes ?? []).length > 0)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX_CLUSTERS);
  const clusters: Cluster[] = list.map((s) => {
    const kind = s.kind === 'core' ? 'core' : 'logos';
    const g = kind === 'core' ? { nodes: [], edges: [] } : graphOf(s);
    const kept = g.nodes.slice(0, MAX_NODES);
    const ids = new Set(kept.map((n) => n.id));
    const edges = g.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    const r = radiusOf(kept.length, kind);
    return {
      id: s.id,
      kind,
      title: s.title || (kind === 'core' ? 'A chat' : 'A line of thinking'),
      at: s.updatedAt || 0,
      projectId: s.projectId ?? null,
      x: 0,
      y: 0,
      r,
      nodes: layoutCluster(kept, edges, r),
      edges,
      turns: (s.messages ?? []).filter((m) => m.role === 'user').length,
      more: Math.max(0, g.nodes.length - kept.length),
    };
  });
  // what each cluster can be bridged by: its ideas, or — for a bare chat — its name
  const handles = clusters.map((c) => (c.nodes.length ? c.nodes.map((n) => ({ node: n.id as string | null, label: n.label })) : [{ node: null, label: c.title }]));
  const bridges: Bridge[] = [];
  outer: for (let i = 0; i < clusters.length; i++)
    for (let j = i + 1; j < clusters.length; j++) {
      // two Core chats are not bridged by their names alone
      if (clusters[i].kind === 'core' && clusters[j].kind === 'core') continue;
      found: for (const a of handles[i])
        for (const b of handles[j]) {
          const says = shared(a.label, b.label);
          if (!says) continue;
          bridges.push({ a: { cluster: clusters[i].id, node: a.node }, b: { cluster: clusters[j].id, node: b.node }, says });
          if (bridges.length >= MAX_BRIDGES) break outer;
          break found;
        }
    }
  settle(clusters, bridges);
  // onto the page: the top left of everything at the margin
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of clusters) {
    const b = boxOf(c);
    x0 = Math.min(x0, c.x - b.hw);
    x1 = Math.max(x1, c.x + b.hw);
    y0 = Math.min(y0, c.y - b.top);
    y1 = Math.max(y1, c.y + b.bottom);
  }
  if (!clusters.length) return { clusters, bridges, width: 0, height: 0 };
  for (const c of clusters) {
    c.x = Math.round(c.x - x0 + MARGIN);
    c.y = Math.round(c.y - y0 + MARGIN);
  }
  return { clusters, bridges, width: Math.round(x1 - x0 + 2 * MARGIN), height: Math.round(y1 - y0 + 2 * MARGIN) };
}

/** Does a cluster answer a search: its name, or any idea or topic in it. */
export function clusterMatches(c: Pick<Cluster, 'title' | 'nodes'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return c.title.toLowerCase().includes(q) || c.nodes.some((n) => n.label.toLowerCase().includes(q));
}
