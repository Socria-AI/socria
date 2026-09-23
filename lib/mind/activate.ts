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
  ANCHOR_SEED, CROSS_MIN_ACTIVATION, MEMBERSHIP_RELATIONSHIPS, SEED_FLOOR, STRONG_EDGE,
  STRONG_RELATION, affinity, affinityFactor, projectIndex,
} from './projects';
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
/**
 * How much of the message's own activation makes a node part of what the
 * message is ABOUT, rather than background. About two ordinary hops' worth:
 * the faint third-hop trickle does not promote something over the Project's
 * own context.
 */
export const QUERY_TIER_MIN = 0.02;

export interface ActivateOptions {
  now: number;
  /** how many nodes may be carried into the conversation — the plan's window */
  limit: number;
  /** Logos never receives private nodes: its map can be exported as an image */
  excludePrivate?: boolean;
  /** extra terms beyond the message — the Cognitive State's currentFocus */
  focus?: string[];
  /**
   * The conversation this turn belongs to. What THIS conversation has already
   * written is relevant to its next turn even when the next message shares no
   * words with it ("Angry, mostly." after naming a colleague) — without it,
   * recall came back empty and the extractor, told nothing was there, could
   * mint duplicates (found by the Core 4 eval players).
   */
  conversationId?: string;
  /**
   * The Project this conversation is in, and every Project anchor there is.
   *
   * A WEIGHTING, never a filter. Being in the current Project raises a
   * node's score; being only in another Project lowers it and sets a bar it
   * must clear; nothing is excluded for where it came from if it is strongly
   * enough related to what was just said. See lib/mind/projects.ts.
   */
  project?: { current: string | null; anchors: ReadonlySet<string> };
}

export interface ActivatedSubgraph {
  nodes: MindNode[];
  edges: MindEdge[];
  /** which nodes the message lit up directly, for explaining recall */
  seeds: string[];
  /** every node's score, for the Memory page's "why did this come up" */
  scores: Record<string, number>;
  /**
   * For nodes that surfaced from ANOTHER Project: which Project anchors they
   * sit near. So the prompt can say "this came from Calculus" rather than
   * presenting it as though it belonged here.
   */
  elsewhere?: Record<string, string[]>;
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
  if (opts.conversationId) {
    const mine = visible
      .filter((n) => n.provenance.some((p) => p.conversationId === opts.conversationId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6);
    for (const n of mine) seeds.set(n.id, Math.max(seeds.get(n.id) ?? 0, 0.5 * (0.4 + 0.6 * n.importance)));
  }

  const anchors: ReadonlySet<string> = opts.project?.anchors ?? new Set();
  const current = opts.project?.current && allowed.has(opts.project.current) ? opts.project.current : null;
  const index = anchors.size ? projectIndex(graph, anchors) : new Map<string, Set<string>>();

  // Inside a Project, its anchor is lit whatever the message says. "What
  // should I do next?" names nothing, and still has an answer inside the
  // Project — its goals, its open questions — so the Project has to be able
  // to supply context without the message having to earn it lexically. It is
  // spread SEPARATELY from the message's seeds (below), so it can never
  // displace, or outrank, something the message actually named.
  // What the MESSAGE named. The Project's anchor is deliberately NOT one of
  // these: see the two spreads below.
  const named = new Map(seeds);
  if (!named.size && !current) return { nodes: [], edges: [], seeds: [], scores: {} };

  // Adjacency, both ways: a project reaches its goals, and a goal reaches the
  // project it belongs to.
  const out = new Map<string, MindEdge[]>();
  for (const e of graph.edges) {
    if (!allowed.has(e.sourceId) || !allowed.has(e.targetId)) continue;
    (out.get(e.sourceId) ?? out.set(e.sourceId, []).get(e.sourceId)!).push(e);
    (out.get(e.targetId) ?? out.set(e.targetId, []).get(e.targetId)!).push(e);
  }

  /**
   * Spread activation outward from some starting nodes. Activation SUMS over
   * all paths reaching a node, so something pulled in from three directions
   * outranks something reached once — the associative behaviour the whole
   * design is for.
   */
  const spread = (start: Map<string, number>) => {
    const activation = new Map<string, number>(start);
    /** One strong hop from something the message named — see STRONG_RELATION. */
    const strongHop = new Set<string>();
    let frontier = [...start.entries()];
    for (let depth = 1; depth <= MAX_DEPTH && frontier.length; depth++) {
      const next = new Map<string, number>();
      for (const [id, a] of frontier) {
        // THE HUB RULE. A Project anchor is connected to everything in its
        // Project, so letting activation fan out of one would light the whole
        // Project the moment any single thing in it was relevant: one calculus
        // memory mentioned inside Socria would drag in all of Calculus. An
        // anchor may RECEIVE activation from anywhere. It passes it on only if
        // it is the current Project, or if the message named it directly — in
        // which case the person is asking about that Project and its contents
        // are what they want.
        if (anchors.has(id) && id !== current && !named.has(id)) continue;
        for (const e of out.get(id) ?? []) {
          const other = e.sourceId === id ? e.targetId : e.sourceId;
          if (
            depth === 1 &&
            (named.get(id) ?? 0) >= SEED_FLOOR &&
            relWeight(e.relationship) >= STRONG_RELATION &&
            e.strength >= STRONG_EDGE &&
            // Membership is where something was worked on, not what it is. A
            // concept's tie to the Project it came up in is not a reason for
            // that Project to surface — the [from project] tag already says
            // where it came from.
            !MEMBERSHIP_RELATIONSHIPS.has(e.relationship)
          ) {
            strongHop.add(other);
          }
          const delta = a * e.strength * relWeight(e.relationship) * Math.pow(GAMMA, depth);
          if (delta < 0.01) continue;
          activation.set(other, (activation.get(other) ?? 0) + delta);
          next.set(other, Math.max(next.get(other) ?? 0, delta));
        }
      }
      frontier = [...next.entries()];
    }
    return { activation, strongHop };
  };

  // TWO spreads, kept apart, because they answer different questions.
  //
  // From what the MESSAGE named: what is this about? From the current
  // Project's ANCHOR: what does this Project hold? They used to be one
  // spread, with the anchor as just another seed — and then an unrelated
  // Project node that received a trickle of spillover from the anchor
  // competed on equal terms with the exact thing the person asked about.
  // Measured through the real chat route: inside Socria, asked about
  // derivatives, a goal called "Ship it" and two file nodes outranked the
  // memory of how the person learned derivatives, and the prompt's token
  // ceiling cut that memory out. Relevance to the message has to come first;
  // the Project fills whatever room is left.
  const fromMessage = named.size ? spread(named) : { activation: new Map<string, number>(), strongHop: new Set<string>() };
  const fromProject = current ? spread(new Map([[current, ANCHOR_SEED]])).activation : new Map<string, number>();
  const strongHop = fromMessage.strongHop;

  // Score and bound.
  //
  // Project affinity is applied HERE, as a multiplier, after spreading —
  // never as a filter on what may be reached. A node from another Project
  // must first clear CROSS_MIN_ACTIVATION on relevance it earned from THIS
  // MESSAGE (not from the current Project's spillover), or be one strong hop
  // from something the message named. Then it competes at a discount against
  // what is in the current Project.
  //
  // The integer part of a score is its TIER: 1 if the message reached it, 0
  // if only the Project did. The fraction is how much it matters. Sorting on
  // that puts everything the message is about ahead of everything that is
  // merely nearby, and the prompt's token ceiling trims from the bottom — so
  // what gets cut is Project background, never the answer to the question.
  const scores: Record<string, number> = {};
  const elsewhere: Record<string, string[]> = {};
  const ids = new Set([...fromMessage.activation.keys(), ...fromProject.keys()]);
  for (const id of ids) {
    // The current Project's own node is the frame of the conversation, and
    // the frame is already in the prompt; as a memory block it was a list of
    // every "belongs_to" edge, which is bookkeeping and cost real budget.
    if (id === current) continue;
    const n = byId.get(id);
    if (!n) continue;
    const q = fromMessage.activation.get(id) ?? 0;
    const b = fromProject.get(id) ?? 0;
    const aff = anchors.size ? affinity(id, index, current, anchors) : 'global';
    if (aff === 'elsewhere' && q < CROSS_MIN_ACTIVATION && !strongHop.has(id)) continue;
    const tier = q >= QUERY_TIER_MIN ? 1 : 0;
    scores[id] = tier + scoreNode(n, q + b, opts.now) * affinityFactor(aff);
    if (aff === 'elsewhere') {
      elsewhere[id] = anchors.has(id) ? [id] : [...(index.get(id) ?? [])];
    }
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

  const outside: Record<string, string[]> = {};
  for (const n of nodes) if (elsewhere[n.id]) outside[n.id] = elsewhere[n.id];

  return {
    nodes, edges, seeds: [...seeds.keys()], scores,
    ...(Object.keys(outside).length ? { elsewhere: outside } : {}),
  };
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

/**
 * What the extractor is shown as "already in the graph": the recalled
 * subgraph plus every live node this conversation has already written.
 * Recall is ranked for the REPLY and capped, so a conversation that wrote
 * eighteen nodes showed the extractor five, and it minted near-duplicates of
 * the rest (reported by players in runs 3, 4 and 5). The extractor's job is
 * reuse, so it sees the conversation's own nodes whether or not they are
 * relevant to this message.
 */
export function extractionContext(
  sub: ActivatedSubgraph | null,
  graph: { nodes: MindNode[] } | null,
  conversationId: string | null | undefined,
  limit = 40
): ActivatedSubgraph | null {
  if (!graph || !conversationId) return sub;
  const base: ActivatedSubgraph = sub ?? { nodes: [], edges: [], seeds: [], scores: {} };
  const have = new Set(base.nodes.map((n) => n.id));
  const own = graph.nodes
    .filter((n) => !have.has(n.id) && (n.status === 'active' || n.status === 'tentative' || n.status === 'uncertain'))
    .filter((n) => n.provenance.some((p) => p.conversationId === conversationId));
  if (!own.length) return sub;
  const room = Math.max(0, limit - base.nodes.length);
  return { ...base, nodes: [...base.nodes, ...own.slice(-room)] };
}
