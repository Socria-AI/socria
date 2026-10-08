// lib/mind/atlas.ts
//
// EVERYTHING SOCRIA REMEMBERS, CONNECTED: the Mind graph, and every chat,
// every Thinking Map, every plot, model and object of thought, and every
// Project, drawn as one graph.
//
// A PROJECTION, NEVER A STORE. Nothing here is written back, and nothing here
// becomes a memory. The Mind graph stays what Core reads (lib/mind/types.ts:
// "if a node is not in the graph, Core does not know it"); the chats stay in
// `conversations`; each map stays in its own row. This joins them by what
// they already record about each other:
//
//   a memory → the chats it was learned in     provenance.conversationId
//   a chat → its Project                        conversations.project_id
//   a map node → its chat                       it is in that chat's map
//   a plot, model or object → its chat          the same
//   two chats → each other                      a map node, a plot or a
//                                               memory they share
//
// THE LAST LINE IS THE POINT. A concept on the map in March and the same
// concept on a map today are ONE node here, with an edge to each chat — so
// "what else have I thought about this in" is a walk, not a search. Map nodes
// join by their normalised label; a map node whose label is a memory's label
// (or one of its aliases) IS that memory here, so a chat drawn in Logos and a
// fact Core learned meet at the same point.
//
// WHAT IS NOT JOINED, on purpose:
//   — objects of thought ("A", "f") stay per chat. Two matrices both called A
//     are two matrices.
//   — the mechanics of one worked problem (step, transformation, verification,
//     error, result, inference) stay on that problem's map. They are the
//     shape of one solution, and joining "x = 3" across homework sets would
//     draw connections that are coincidences.
//
// PRIVATE STAYS PRIVATE (invariant 3 in lib/mind/types.ts). In the 'logos'
// scope — a surface whose maps can be exported as images — private memories
// are left out, and so is every chat that produced one: a weighty
// conversation's title is not something to put on a map either. The filter
// runs where the atlas is built, on the server, never in the browser.
//
// PURE: no React, no storage, no network, no clock.

import type { LogosNode, ThinkingMap } from '@/lib/logos';
import { normalize, privateElsewhere, type MindEdge, type MindNode } from './types';

// ── the shapes ──────────────────────────────────────────────────────

export type AtlasKind = 'memory' | 'project' | 'chat' | 'idea' | 'plot' | 'model' | 'object';

export interface AtlasNode {
  id: string;
  kind: AtlasKind;
  /** the folder it is drawn in: a Mind type for memories, or Chat, Plot, Model, Object… */
  type: string;
  label: string;
  /** one line under the label */
  sub?: string;
  /** the chats it appears in, by conversation id, most recent first */
  chats: string[];
  /** the Mind row it is, when it is one */
  mindId?: string;
  /** a memory's status, so a superseded one can be drawn as superseded */
  status?: string;
  /** chats only */
  surface?: 'core' | 'logos';
  projectId?: string | null;
  at?: number;
}

/**
 * How two things stand. The Mind's own relationships pass through unchanged;
 * these are the ones the atlas adds, and each names the fact it was read from.
 */
export type AtlasRel =
  | 'learned_in'  // a memory → the chat it was learned (or reinforced) in
  | 'filed_in'    // a chat → its Project
  | 'on_map'      // an idea or a memory → a chat whose map holds it
  | 'drawn_in'    // a plot → the chat it was drawn in
  | 'built_in'    // a model → the chat it was built in
  | 'worked_in'   // an object of thought → the chat it was worked in
  | (string & {});

export interface AtlasEdge {
  from: string;
  to: string;
  rel: AtlasRel;
  /** how many times the underlying record says so */
  n: number;
}

export interface AtlasStats {
  memories: number;
  projects: number;
  chats: number;
  ideas: number;
  plots: number;
  models: number;
  objects: number;
  /** ideas, plots and memories that appear in more than one chat */
  shared: number;
  /** what was left out to stay legible — never silent */
  dropped: number;
}

export interface Atlas {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  stats: AtlasStats;
}

export interface AtlasChat {
  id: string;
  title: string;
  kind: 'chat' | 'logos';
  projectId?: string | null;
  updatedAt: number;
  /** a Logos chat's map; null for an ordinary chat */
  map?: ThinkingMap | null;
}

export interface AtlasProject {
  id: string;
  /** its anchor node in the Mind graph */
  nodeId: string;
  name: string;
  archived?: boolean;
}

export interface AtlasInput {
  graph: { nodes: MindNode[]; edges: MindEdge[] };
  chats: AtlasChat[];
  projects: AtlasProject[];
  /** 'logos' leaves out every private memory and every chat that made one */
  scope: 'all' | 'logos';
}

// ── limits — legibility, not storage ────────────────────────────────

/** The most recent chats drawn. Older ones are counted in `dropped`. */
export const MAX_CHATS = 200;
/** Per map: past this a map is a diagram, and the atlas only needs its spine. */
export const MAX_MAP_NODES = 24;
/** The whole atlas. Single-chat ideas from the oldest chats go first. */
export const MAX_ATLAS_NODES = 1500;

/** One worked problem's mechanics — kept on that problem's map. */
const MECHANICS = new Set(['step', 'transformation', 'verification', 'error', 'result', 'inference', 'equation']);

/**
 * A map node's type, as the folder it joins.
 *
 * Into the Mind's own vocabulary where the two mean the same thing — so a
 * question on a map and a Question Core remembers sit in one folder — and a
 * folder of its own where they do not.
 */
const FOLDER: Record<string, string> = {
  question: 'Question', unknown: 'Question',
  goal: 'Goal', decision: 'Decision', value: 'Preference', belief: 'Belief',
  assumption: 'Assumption', evidence: 'Evidence', source: 'Source',
  concept: 'Concept', definition: 'Concept', theorem: 'Concept', axiom: 'Concept', lemma: 'Concept',
  misconception: 'Concept',
  idea: 'Idea', claim: 'Idea', counterpoint: 'Idea', conjecture: 'Idea', counterexample: 'Idea',
  tension: 'Tension', consequence: 'Idea',
  constraint: 'Constraint', milestone: 'Plan', theme: 'Theme', character: 'Person',
  given: 'Given',
};
export const folderOf = (t: string): string => FOLDER[t] ?? 'Idea';

/** Which map nodes to carry when a map has more than MAX_MAP_NODES. */
const RANK: Record<string, number> = {
  question: 6, goal: 6, decision: 5, concept: 5, definition: 5, theorem: 5,
  assumption: 4, belief: 4, value: 4, claim: 4, idea: 4, tension: 4,
  evidence: 3, source: 3, constraint: 3, milestone: 3, given: 3, unknown: 3,
};

const PLOT_NAME: Record<string, string> = {
  function: 'Function plot', limit: 'Limit', derivative: 'Derivative', riemann: 'Riemann sum',
  taylor: 'Taylor series', sequence: 'Sequence', vectors: 'Vectors', matrix: 'Matrix picture',
  distribution: 'Distribution', ode: 'Differential equation', 'supply-demand': 'Supply and demand',
  ppc: 'Production possibilities', 'ad-as': 'AD–AS', scene: 'Scene', model: 'Model picture',
  simulation: 'Simulation', surface: 'Surface plot', parametric: 'Parametric curve', polar: 'Polar plot',
  field: 'Field',
};
const SIM_NAME: Record<string, string> = {
  'black-hole': 'Black hole simulation', 'big-bang': 'Big Bang simulation', orbit: 'Orbit simulation',
  oscillator: 'Oscillator simulation', projectile: 'Projectile simulation',
};
const titleCase = (s: string) => s.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** The name a plot type goes by, and the key every chat that drew one shares. */
export function plotOf(viz: unknown): { key: string; label: string; sub?: string } | null {
  if (!viz || typeof viz !== 'object') return null;
  const v = viz as { kind?: unknown; expr?: unknown; sim?: { object?: unknown } };
  const kind = typeof v.kind === 'string' ? v.kind : '';
  if (!kind) return null;
  if (kind === 'simulation' && typeof v.sim?.object === 'string') {
    const o = v.sim.object;
    return { key: `v:simulation:${normalize(o)}`, label: SIM_NAME[o] ?? `${titleCase(o)} simulation` };
  }
  const expr = typeof v.expr === 'string' && v.expr.trim() ? v.expr.trim().slice(0, 60) : undefined;
  return { key: `v:${normalize(kind)}`, label: PLOT_NAME[kind] ?? titleCase(kind), ...(expr ? { sub: expr } : {}) };
}

/**
 * Only what the atlas reads off a stored map: node labels and types, edges,
 * the plot's kind, model titles, object names and step counts. Bounded and
 * typed here, so a large or odd row costs nothing and can say nothing else —
 * and so the full map sanitiser, which re-validates every model and
 * re-computes every object's history, is not run two hundred times to read
 * some labels.
 */
export function atlasMapOf(raw: unknown): ThinkingMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const nodes = (Array.isArray(r.nodes) ? r.nodes : []).slice(0, 80)
    .map((n: any) => ({
      id: str(n?.id, 40), type: str(n?.type, 24), label: str(n?.label, 120),
      // whose it is and whether it is settled — Project Home never counts a
      // suggestion of Socria's as the person's own idea
      ...(n?.origin ? { origin: str(n.origin, 16) } : {}),
      ...(n?.status ? { status: str(n.status, 16) } : {}),
    }))
    .filter((n: { id: string; label: string }) => n.id && n.label);
  const edges = (Array.isArray(r.edges) ? r.edges : []).slice(0, 160)
    .map((e: any) => ({ from: str(e?.from, 40), to: str(e?.to, 40), relation: str(e?.relation, 24) }))
    .filter((e: { from: string; to: string; relation: string }) => e.from && e.to && e.relation);
  const viz = r.viz && typeof r.viz === 'object'
    ? {
        kind: str(r.viz.kind, 24),
        expr: str(r.viz.expr, 80),
        ...(r.viz.sim && typeof r.viz.sim === 'object' ? { sim: { object: str(r.viz.sim.object, 24) } } : {}),
      }
    : undefined;
  const docs = (Array.isArray(r.models?.docs) ? r.models.docs : []).slice(0, 12)
    .map((d: any) => ({ id: str(d?.id, 40), title: str(d?.title, 90) }))
    .filter((d: { title: string }) => d.title);
  const objs = (Array.isArray(r.objects?.objs) ? r.objects.objs : []).slice(0, 12)
    .map((o: any) => ({ id: str(o?.id, 40), kind: str(o?.kind, 24), name: str(o?.name, 24), steps: Array.isArray(o?.steps) ? o.steps.slice(0, 200).map(() => ({})) : [] }))
    .filter((o: { id: string }) => o.id);
  const context = str(r.context, 24);
  const building = r.building && typeof r.building === 'object' ? str(r.building.kind, 24) : '';
  return {
    nodes, edges,
    ...(context ? { context } : {}),
    ...(building ? { building: { kind: building } } : {}),
    ...(viz && viz.kind ? { viz } : {}),
    ...(docs.length ? { models: { docs, active: null } } : {}),
    ...(objs.length ? { objects: { objs } } : {}),
  } as unknown as ThinkingMap;
}

// ── building it ─────────────────────────────────────────────────────

const clipLabel = (s: unknown, n = 90) =>
  typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '';

export function buildAtlas(input: AtlasInput): Atlas {
  const logos = input.scope === 'logos';

  // 1. What may be shown at all.
  const privateChats = new Set<string>();
  const memories: MindNode[] = [];
  for (const n of input.graph.nodes ?? []) {
    if (logos && privateElsewhere(n, undefined, true)) {
      for (const p of n.provenance ?? []) if (p.conversationId) privateChats.add(p.conversationId);
      continue;
    }
    memories.push(n);
  }
  const allChats = [...(input.chats ?? [])]
    .filter((c) => c && typeof c.id === 'string' && c.id && !privateChats.has(c.id))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const chats = allChats.slice(0, MAX_CHATS);
  let dropped = allChats.length - chats.length;
  const chatIds = new Set(chats.map((c) => c.id));
  const recency = new Map(chats.map((c, i) => [c.id, i]));

  const nodes = new Map<string, AtlasNode>();
  const edges = new Map<string, AtlasEdge>();
  const link = (from: string, to: string, rel: AtlasRel, n = 1) => {
    if (from === to || !nodes.has(from) || !nodes.has(to)) return;
    const k = `${from}|${rel}|${to}`;
    const e = edges.get(k);
    if (e) e.n += n;
    else edges.set(k, { from, to, rel, n });
  };
  const inChat = (node: AtlasNode, chatId: string) => {
    if (!node.chats.includes(chatId)) node.chats.push(chatId);
  };

  // 2. Projects — their anchor IS a Mind node, so a Project is one point
  //    whether you reach it from a memory or from a chat filed in it.
  const anchors = new Map<string, string>(); // project id → atlas id
  const anchorNodes = new Set<string>();
  for (const p of input.projects ?? []) anchorNodes.add(p.nodeId);

  // 3. Memories, as themselves.
  const byLabel = new Map<string, string>(); // normalised label or alias → atlas id
  for (const m of memories) {
    const id = `m:${m.id}`;
    const isAnchor = anchorNodes.has(m.id);
    nodes.set(id, {
      id,
      kind: isAnchor ? 'project' : 'memory',
      type: isAnchor ? 'Project' : String(m.type || 'Concept'),
      label: clipLabel(m.label),
      sub: clipLabel(m.content, 140) || undefined,
      chats: [],
      mindId: m.id,
      status: m.status,
    });
    for (const key of [m.label, ...(m.aliases ?? [])].map(normalize)) {
      if (key && !byLabel.has(key)) byLabel.set(key, id);
    }
  }
  for (const p of input.projects ?? []) {
    const id = nodes.has(`m:${p.nodeId}`) ? `m:${p.nodeId}` : `p:${p.id}`;
    if (!nodes.has(id)) {
      nodes.set(id, { id, kind: 'project', type: 'Project', label: clipLabel(p.name) || 'Project', chats: [] });
    }
    anchors.set(p.id, id);
  }
  for (const e of input.graph.edges ?? []) {
    link(`m:${e.sourceId}`, `m:${e.targetId}`, e.relationship);
  }

  // 4. Chats.
  for (const c of chats) {
    nodes.set(`c:${c.id}`, {
      id: `c:${c.id}`,
      kind: 'chat',
      type: 'Chat',
      label: clipLabel(c.title) || 'Untitled',
      sub: c.kind === 'logos' ? 'Logos' : 'Core',
      chats: [c.id],
      surface: c.kind === 'logos' ? 'logos' : 'core',
      projectId: c.projectId ?? null,
      at: c.updatedAt,
    });
    const proj = c.projectId ? anchors.get(c.projectId) : undefined;
    if (proj) {
      link(`c:${c.id}`, proj, 'filed_in');
      inChat(nodes.get(proj)!, c.id);
    }
  }

  // 5. What each memory was learned in.
  for (const m of memories) {
    const id = `m:${m.id}`;
    const node = nodes.get(id)!;
    for (const p of m.provenance ?? []) {
      if (!p.conversationId || !chatIds.has(p.conversationId)) continue;
      link(id, `c:${p.conversationId}`, 'learned_in');
      inChat(node, p.conversationId);
    }
  }

  // 6. Every Logos map: its spine, its plot, its models, its objects.
  for (const c of chats) {
    const map = c.map;
    if (c.kind !== 'logos' || !map || !Array.isArray(map.nodes)) continue;
    const chatNode = `c:${c.id}`;
    const deg = new Map<string, number>();
    for (const e of map.edges ?? []) {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    }
    const spine = map.nodes
      .filter((n): n is LogosNode => !!n && typeof n.label === 'string' && !!normalize(n.label) && !MECHANICS.has(n.type))
      .map((n, i) => ({ n, i, w: (RANK[n.type] ?? 2) + Math.min(3, deg.get(n.id) ?? 0) * 0.5 }))
      .sort((a, b) => b.w - a.w || a.i - b.i);
    if (spine.length > MAX_MAP_NODES) dropped += spine.length - MAX_MAP_NODES;
    const local = new Map<string, string>(); // map node id → atlas id
    for (const { n } of spine.slice(0, MAX_MAP_NODES)) {
      const key = normalize(n.label);
      const mem = byLabel.get(key);
      const id = mem ?? `i:${key}`;
      if (!nodes.has(id)) {
        nodes.set(id, { id, kind: 'idea', type: folderOf(n.type), label: clipLabel(n.label), chats: [] });
      }
      inChat(nodes.get(id)!, c.id);
      link(id, chatNode, 'on_map');
      local.set(n.id, id);
    }
    for (const e of map.edges ?? []) {
      const a = local.get(e.from);
      const b = local.get(e.to);
      if (a && b) link(a, b, e.relation);
    }

    const plot = plotOf(map.viz);
    if (plot) {
      if (!nodes.has(plot.key)) {
        nodes.set(plot.key, { id: plot.key, kind: 'plot', type: 'Plot', label: plot.label, sub: plot.sub, chats: [] });
      }
      inChat(nodes.get(plot.key)!, c.id);
      link(plot.key, chatNode, 'drawn_in');
    }

    for (const d of map.models?.docs ?? []) {
      const title = clipLabel(d?.title);
      if (!title) continue;
      const id = `d:${normalize(title)}`;
      if (!nodes.has(id)) nodes.set(id, { id, kind: 'model', type: 'Model', label: title, chats: [] });
      inChat(nodes.get(id)!, c.id);
      link(id, chatNode, 'built_in');
    }

    for (const o of map.objects?.objs ?? []) {
      if (!o || typeof o.id !== 'string') continue;
      const id = `o:${c.id}:${o.id}`;
      const kind = typeof o.kind === 'string' ? o.kind : 'object';
      nodes.set(id, {
        id,
        kind: 'object',
        type: 'Object',
        label: `${titleCase(kind)} ${clipLabel(o.name, 24)}`.trim(),
        sub: `${(o.steps?.length ?? 0)} step${o.steps?.length === 1 ? '' : 's'}`,
        chats: [c.id],
      });
      link(id, chatNode, 'worked_in');
    }
  }

  // 7. Most recent chat first in every list of chats.
  for (const n of nodes.values()) {
    n.chats.sort((a, b) => (recency.get(a) ?? 1e9) - (recency.get(b) ?? 1e9));
  }

  // 8. Legible. Over the ceiling, the ideas that connect nothing — on one
  //    map, in an old chat — go first. Never a memory, a chat or a Project.
  if (nodes.size > MAX_ATLAS_NODES) {
    const lonely = [...nodes.values()]
      .filter((n) => n.kind === 'idea' && n.chats.length <= 1)
      .sort((a, b) => (recency.get(b.chats[0]) ?? 0) - (recency.get(a.chats[0]) ?? 0));
    for (const n of lonely) {
      if (nodes.size <= MAX_ATLAS_NODES) break;
      nodes.delete(n.id);
      dropped++;
    }
    for (const [k, e] of edges) if (!nodes.has(e.from) || !nodes.has(e.to)) edges.delete(k);
  }

  const list = [...nodes.values()];
  const count = (k: AtlasKind) => list.filter((n) => n.kind === k).length;
  return {
    nodes: list,
    edges: [...edges.values()],
    stats: {
      memories: count('memory'),
      projects: count('project'),
      chats: count('chat'),
      ideas: count('idea'),
      plots: count('plot'),
      models: count('model'),
      objects: count('object'),
      shared: list.filter((n) => n.kind !== 'chat' && n.kind !== 'project' && n.chats.length > 1).length,
      dropped,
    },
  };
}

// ── reading it ──────────────────────────────────────────────────────

export interface RelatedChat {
  id: string;
  label: string;
  surface?: 'core' | 'logos';
  /** what the two chats share, most connective first */
  shared: string[];
  /** they are filed in the same Project */
  sameProject: boolean;
  score: number;
}

/**
 * The other chats this one connects to, and through what.
 *
 * A shared idea or plot counts once; a shared memory counts more, because it
 * is something Socria actually holds rather than two maps happening to use
 * one word; being filed in the same Project counts on its own.
 */
export function relatedChats(atlas: Atlas, chatId: string, limit = 12): RelatedChat[] {
  const here = atlas.nodes.find((n) => n.id === `c:${chatId}`);
  if (!here) return [];
  const byId = new Map(atlas.nodes.map((n) => [n.id, n]));
  const out = new Map<string, RelatedChat>();
  const bump = (other: string, why: string | null, w: number) => {
    if (other === chatId) return;
    const c = byId.get(`c:${other}`);
    if (!c) return;
    const r = out.get(other) ?? { id: other, label: c.label, surface: c.surface, shared: [], sameProject: false, score: 0 };
    if (why && !r.shared.includes(why)) r.shared.push(why);
    r.score += w;
    out.set(other, r);
  };
  for (const n of atlas.nodes) {
    if (n.kind === 'chat' || n.kind === 'object' || !n.chats.includes(chatId)) continue;
    if (n.kind === 'project') {
      for (const other of n.chats) {
        bump(other, null, 1.5);
        const r = out.get(other);
        if (r) r.sameProject = true;
      }
      continue;
    }
    const w = n.kind === 'memory' ? 2 : 1;
    for (const other of n.chats) bump(other, n.label, w);
  }
  return [...out.values()].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, limit);
}

/**
 * The part of the atlas around one chat: the chat, everything in it, and
 * whatever those things lead to — other chats, the Project, the memories
 * they touch. Bounded, so a hub never pulls in the whole graph.
 */
export function neighbourhood(atlas: Atlas, chatId: string, limit = 80): Atlas {
  return neighbourhoodOf(atlas, `c:${chatId}`, limit);
}

/** The same, around any node — a Project's home is drawn around the Project. */
export function neighbourhoodOf(atlas: Atlas, root: string, limit = 80): Atlas {
  const keep = new Set<string>();
  if (!atlas.nodes.some((n) => n.id === root)) {
    return { nodes: [], edges: [], stats: { ...atlas.stats } };
  }
  keep.add(root);
  const adj = new Map<string, AtlasEdge[]>();
  for (const e of atlas.edges) {
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e);
    (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e);
  }
  // ring 1: what is in this chat
  const ring1 = (adj.get(root) ?? []).map((e) => (e.from === root ? e.to : e.from));
  for (const id of ring1) if (keep.size < limit) keep.add(id);
  // ring 2: where those lead — other chats first, they are the connections
  const byId = new Map(atlas.nodes.map((n) => [n.id, n]));
  const next: { id: string; w: number }[] = [];
  for (const id of ring1) {
    for (const e of adj.get(id) ?? []) {
      const other = e.from === id ? e.to : e.from;
      if (keep.has(other)) continue;
      const n = byId.get(other);
      const w = n?.kind === 'chat' ? 3 : n?.kind === 'project' ? 2.5 : n?.kind === 'memory' ? 2 : 1;
      next.push({ id: other, w });
    }
  }
  next.sort((a, b) => b.w - a.w);
  for (const { id } of next) {
    if (keep.size >= limit) break;
    keep.add(id);
  }
  const nodes = atlas.nodes.filter((n) => keep.has(n.id));
  const edges = atlas.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  return { nodes, edges, stats: atlas.stats };
}

/** How an atlas relationship reads in a sentence: "learned in", "on the map in". */
export function relLabel(rel: string): string {
  const own: Record<string, string> = {
    learned_in: 'learned in', filed_in: 'filed in', on_map: 'on the map in',
    drawn_in: 'drawn in', built_in: 'built in', worked_in: 'worked in',
  };
  return own[rel] ?? rel.replace(/_/g, ' ');
}

// ── drawing one chat's neighbourhood ────────────────────────────────

export interface RadialPlace {
  x: number;
  y: number;
  /** 0 the chat, 1 what is in it, 2 where that leads */
  ring: 0 | 1 | 2;
  /** radians, so a label can be set outward from the middle */
  angle: number;
}

const KIND_ORDER: Record<AtlasKind, number> = { project: 0, memory: 1, idea: 2, plot: 3, model: 4, object: 5, chat: 6 };

/**
 * The chat in the middle; what is in it on the inner ring, grouped by kind so
 * memories sit with memories; and on the outer ring whatever those lead to —
 * other chats, the Project, memories — each placed toward the things it is
 * reached through, so a chat that shares three ideas sits beside those three.
 *
 * Deterministic, so the same neighbourhood is drawn the same way twice; and
 * spaced, so no two places on a ring are closer than the ring allows.
 */
export function radialLayout(nb: Atlas, chatId: string, W: number, H: number): Record<string, RadialPlace> {
  return radialAround(nb, `c:${chatId}`, W, H);
}

/** The same drawing, around any node. */
export function radialAround(nb: Atlas, root: string, W: number, H: number): Record<string, RadialPlace> {
  const out: Record<string, RadialPlace> = {};
  const cx = W / 2;
  const cy = H / 2;
  if (!nb.nodes.some((n) => n.id === root)) return out;
  out[root] = { x: cx, y: cy, ring: 0, angle: 0 };

  // Ellipses, not circles: a panel is wider than it is tall, and the labels
  // run sideways — the room is at the left and right, so the rings use it.
  const ry = Math.max(40, H / 2 - 30);
  const rx = Math.max(40, W / 2 - 150);
  const r1 = { x: rx * 0.42, y: ry * 0.46 };
  const r2 = { x: rx * 0.9, y: ry * 0.9 };
  const byId = new Map(nb.nodes.map((n) => [n.id, n]));
  const touching = new Set<string>();
  const adj = new Map<string, Set<string>>();
  for (const e of nb.edges) {
    (adj.get(e.from) ?? adj.set(e.from, new Set()).get(e.from)!).add(e.to);
    (adj.get(e.to) ?? adj.set(e.to, new Set()).get(e.to)!).add(e.from);
    if (e.from === root) touching.add(e.to);
    if (e.to === root) touching.add(e.from);
  }

  const inner = [...touching]
    .filter((id) => byId.has(id))
    .sort((a, b) => {
      const ka = KIND_ORDER[byId.get(a)!.kind] ?? 9;
      const kb = KIND_ORDER[byId.get(b)!.kind] ?? 9;
      return ka - kb || byId.get(a)!.label.localeCompare(byId.get(b)!.label) || a.localeCompare(b);
    });
  const n1 = inner.length;
  inner.forEach((id, i) => {
    const angle = -Math.PI / 2 + (n1 ? (i / n1) * Math.PI * 2 : 0);
    out[id] = { x: cx + Math.cos(angle) * r1.x, y: cy + Math.sin(angle) * r1.y, ring: 1, angle };
  });

  // The outer ring: each toward the mean direction of what it is reached through.
  const outer = nb.nodes
    .filter((n) => !out[n.id])
    .map((n) => {
      const via = [...(adj.get(n.id) ?? [])].filter((id) => out[id]?.ring === 1);
      let sx = 0;
      let sy = 0;
      for (const v of via) {
        sx += Math.cos(out[v].angle);
        sy += Math.sin(out[v].angle);
      }
      const want = via.length && (sx || sy) ? Math.atan2(sy, sx) : Math.PI / 2;
      return { id: n.id, want };
    })
    .sort((a, b) => a.want - b.want || a.id.localeCompare(b.id));
  const n2 = outer.length;
  if (n2) {
    // At least this far apart, or labels sit on one another; never more than
    // an even share of the circle, or a crowded ring would not close.
    const gap = Math.min((Math.PI * 2) / n2, 0.32);
    const ang = outer.map((o) => o.want);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < n2; i++) if (ang[i] - ang[i - 1] < gap) ang[i] = ang[i - 1] + gap;
      // wrap: the last must also clear the first, a full turn on
      const over = ang[n2 - 1] - (ang[0] + Math.PI * 2 - gap);
      if (over > 0) for (let i = 0; i < n2; i++) ang[i] -= over * ((i + 1) / n2);
    }
    outer.forEach((o, i) => {
      const angle = ang[i];
      out[o.id] = { x: cx + Math.cos(angle) * r2.x, y: cy + Math.sin(angle) * r2.y, ring: 2, angle };
    });
  }
  return out;
}

// ── a Project's part of the graph ───────────────────────────────────

/**
 * The slice of a Mind graph a Project's home may draw.
 *
 * For the OWNER: the anchor, everything tied to it, and the edges between
 * them — the Project as their memory holds it, private memories left out
 * (a home can be screen-shared and, once shared, read by others).
 *
 * For ANYBODY ELSE — a collaborator — only the anchor and the goals set on
 * it. What Socria learned about the owner while they worked here is the
 * owner's, not the Project's; a collaborator sees the Project's own content
 * (its conversations, maps, plots, models and goals) and nothing of the
 * person who made it.
 */
export function projectGraph(
  graph: { nodes: MindNode[]; edges: MindEdge[] },
  anchorId: string,
  personal: boolean
): { nodes: MindNode[]; edges: MindEdge[] } {
  const nodes = graph.nodes ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (!byId.has(anchorId)) return { nodes: [], edges: [] };
  const keep = new Set<string>([anchorId]);
  for (const e of graph.edges ?? []) {
    const other = e.sourceId === anchorId ? e.targetId : e.targetId === anchorId ? e.sourceId : null;
    if (!other) continue;
    const n = byId.get(other);
    if (!n || n.private) continue;
    if (!personal && !(n.type === 'Goal' || n.type === 'Plan')) continue;
    keep.add(other);
  }
  return {
    nodes: nodes.filter((n) => keep.has(n.id)),
    edges: (graph.edges ?? []).filter((e) => keep.has(e.sourceId) && keep.has(e.targetId)),
  };
}
