// lib/mind/activate.ts
//
// Remembering, as spreading activation rather than search.
//
// The thing this replaces scored every memory against the current message and
// returned the best k. That finds memories that SOUND like the message, which
// is not the same as the memories that matter — and it returns them as a bag
// of unrelated lines, so the model is never told that the constraint caused
// the decision, only that both exist.
//
// Here a few nodes light up from the message, activation flows outward along
// edges, and what comes back is a connected region. Mentioning a project
// brings its goals, the decision that shaped it, the evidence behind that
// decision and the belief it superseded — not because any of them matched the
// words, but because they are attached to something that did.
//
// Pure, and deliberately so: no clock, no database, no model. A fixture graph
// and a sentence in, a subgraph out, which is what makes the behaviour
// testable rather than merely plausible.

import { resolveNode } from './resolve';
import {
  PARTNER_RELATIONSHIPS, STATUS_WEIGHT, normalize, relWeight,
  type MindEdge, type MindGraph, type MindNode,
} from './types';

/** How far activation travels. Three hops is already an eighth strength. */
export const MAX_DEPTH = 3;
/** Decay per hop. */
export const GAMMA = 0.5;
/** Most nodes a message may light up directly. */
export const MAX_SEEDS = 8;

export interface ActivateOptions {
  now: number;
  /** how many nodes may be carried into the conversation — the plan's window */
  limit: number;
  /** Logos never receives private nodes: its map can be exported as an image */
  excludePrivate?: boolean;
  /** extra terms beyond the message — the Cognitive State's currentFocus */
  focus?: string[];
}

export interface ActivatedSubgraph {
  nodes: MindNode[];
  edges: MindEdge[];
  /** which nodes the message lit up directly, for explaining recall */
  seeds: string[];
  /** every node's score, for the Memory page's "why did this come up" */
  scores: Record<string, number>;
}

/** Pull the nouns worth matching out of a message. */
function terms(text: string): string[] {
  const stop = new Set([
    'the', 'and', 'that', 'this', 'with', 'for', 'was', 'were', 'have', 'has',
    'but', 'not', 'you', 'your', 'are', 'from', 'what', 'about', 'would',
    'could', 'should', 'there', 'they', 'them', '其', 'its', 'been', 'than',
    'then', 'when', 'where', 'which', 'into', 'more', 'some', 'like', 'just',
  ]);
  const all = normalize(text).split(' ').filter(Boolean);
  // Pairs come from the FULL word list, before short words are dropped.
  // Filtering first would mean a label like "Core 4" could never be seeded:
  // the "4" goes, the pair never forms, and the node is unreachable by name.
  const out: string[] = [];
  for (let i = 0; i < all.length - 1; i++) out.push(`${all[i]} ${all[i + 1]}`);
  for (let i = 0; i < all.length - 2; i++) out.push(`${all[i]} ${all[i + 1]} ${all[i + 2]}`);
  // Single words still have to earn their place, or "the" matches everything
  // — but the bar was length > 3, which made any node whose whole label is
  // three characters or fewer ("GPT", "Ada", "ML") permanently unreachable by
  // name. A short word that is not a stopword is exactly the kind of label
  // that matters.
  for (const w of all) if (w.length >= 2 && !stop.has(w)) out.push(w);
  return out;
}

/**
 * Which nodes does this message touch directly?
 *
 * The seam where embeddings would go, if they are ever added: this function's
 * signature is the whole interface. Everything downstream walks edges, so a
 * semantic seeder would change what lights up first and nothing else about
 * how memory works. That is the difference between an index into the graph
 * and a vector store pretending to be memory.
 */
export function seedActivation(
  graph: MindGraph,
  message: string,
  focus: string[] = []
): Map<string, number> {
  const seeds = new Map<string, number>();
  const pool = [...focus, ...terms(message)];

  for (const term of pool) {
    for (const node of graph.nodes) {
      const label = normalize(node.label);
      if (!label) continue;
      let strength = 0;
      if (label === term) strength = 1;
      else if (node.aliases.some((a) => normalize(a) === term)) strength = 0.9;
      else if (term.length >= 5 && label.includes(term)) strength = 0.7;
      else if (label.length >= 5 && term.includes(label)) strength = 0.65;
      if (!strength) continue;
      // A term in the Cognitive State's focus is worth more than one that
      // merely appeared in the message.
      const weighted = strength * (focus.includes(term) ? 1 : 0.85) * (0.4 + 0.6 * node.importance);
      seeds.set(node.id, Math.max(seeds.get(node.id) ?? 0, weighted));
    }
  }

  return new Map([...seeds.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_SEEDS));
}

/** How recently a node was touched, 1 at now, halving every 30 days. */
function recency(lastAccessed: number, now: number): number {
  const days = Math.max(0, (now - lastAccessed) / 86_400_000);
  return Math.pow(0.5, days / 30);
}

export function scoreNode(node: MindNode, activation: number, now: number): number {
  const base =
    0.40 * activation +
    0.20 * node.importance +
    0.15 * node.confidence +
    0.15 * recency(node.lastAccessed, now) +
    0.10 * (Math.min(node.seen, 5) / 5);
  return base * (STATUS_WEIGHT[node.status] ?? 0.5);
}

export function activate(
  graph: MindGraph,
  message: string,
  opts: ActivateOptions
): ActivatedSubgraph {
  const visible = opts.excludePrivate ? graph.nodes.filter((n) => !n.private) : graph.nodes;
  const allowed = new Set(visible.map((n) => n.id));
  const byId = new Map(visible.map((n) => [n.id, n]));

  const seeds = seedActivation({ ...graph, nodes: visible }, message, opts.focus ?? []);
  if (!seeds.size) return { nodes: [], edges: [], seeds: [], scores: {} };

  // Adjacency, both ways: a project reaches its goals, and a goal reaches the
  // project it belongs to.
  const out = new Map<string, MindEdge[]>();
  for (const e of graph.edges) {
    if (!allowed.has(e.sourceId) || !allowed.has(e.targetId)) continue;
    (out.get(e.sourceId) ?? out.set(e.sourceId, []).get(e.sourceId)!).push(e);
    (out.get(e.targetId) ?? out.set(e.targetId, []).get(e.targetId)!).push(e);
  }

  // Spread. Activation SUMS over all paths reaching a node, so something
  // pulled in from three directions outranks something reached once — which
  // is the associative behaviour the whole design is for.
  const activation = new Map<string, number>(seeds);
  let frontier = [...seeds.entries()];
  for (let depth = 1; depth <= MAX_DEPTH && frontier.length; depth++) {
    const next = new Map<string, number>();
    for (const [id, a] of frontier) {
      for (const e of out.get(id) ?? []) {
        const other = e.sourceId === id ? e.targetId : e.sourceId;
        const delta = a * e.strength * relWeight(e.relationship) * Math.pow(GAMMA, depth);
        if (delta < 0.01) continue;
        activation.set(other, (activation.get(other) ?? 0) + delta);
        next.set(other, Math.max(next.get(other) ?? 0, delta));
      }
    }
    frontier = [...next.entries()];
  }

  // Score and bound.
  const scores: Record<string, number> = {};
  for (const [id, a] of activation) {
    const n = byId.get(id);
    if (n) scores[id] = scoreNode(n, a, opts.now);
  }
  const chosen = new Set(
    Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(0, opts.limit))
      .map(([id]) => id)
  );

  // A belief shown without the belief it replaced is misleading, so a partner
  // comes along even if it scored below the line.
  //
  // ONE HOP, AND BOUNDED. This used to test membership against the set it was
  // adding to, so each partner made ITS partner eligible on a later edge and
  // a chain of superseded beliefs dragged in the whole graph — measured:
  // limit=15 returned all 200 nodes of a supersession chain, and the token
  // ceiling downstream could not save it because it trims whole blocks. The
  // scored set is snapshotted, and the number of partners is capped in
  // proportion to the window: showing what a belief replaced is worth a
  // little of the budget and not all of it.
  const scored = new Set(chosen);
  const partnerCap = Math.max(3, Math.ceil(opts.limit / 3));
  let added = 0;
  for (const e of graph.edges) {
    if (added >= partnerCap) break;
    if (!PARTNER_RELATIONSHIPS.has(e.relationship)) continue;
    const s = scored.has(e.sourceId);
    const t = scored.has(e.targetId);
    if (s === t) continue;
    const missing = s ? e.targetId : e.sourceId;
    if (allowed.has(missing) && !chosen.has(missing)) {
      chosen.add(missing);
      added++;
    }
  }

  const nodes = visible.filter((n) => chosen.has(n.id));
  // Only edges whose BOTH ends are present, so what Core receives is a
  // connected subgraph rather than dangling arrows.
  const edges = graph.edges.filter((e) => chosen.has(e.sourceId) && chosen.has(e.targetId));

  return { nodes, edges, seeds: [...seeds.keys()], scores };
}

/**
 * Recall strengthens memory.
 *
 * Returns the nodes to write back with a bumped activation and a fresh
 * lastAccessed. Unused regions fade, which is what makes `activation` worth
 * storing at all rather than recomputing.
 */
export function touch(sub: ActivatedSubgraph, now: number): { id: string; activation: number; lastAccessed: number }[] {
  return sub.nodes.map((n) => ({
    id: n.id,
    activation: Math.min(1, n.activation + 0.15),
    lastAccessed: now,
  }));
}
