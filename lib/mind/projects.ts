// lib/mind/projects.ts
//
// Projects, as regions of the one Mind Graph.
//
// THE INVARIANT: Projects organise attention, not memory ownership. There is
// one connected graph underneath Socria, and a Project is a place in it — a
// `Project` node like any other, with edges running to it. Nothing here keeps
// a second store, copies a memory into a Project, or decides what Core may
// know. It decides what Core LOOKS AT FIRST.
//
// So a Project is two things, and they are kept apart on purpose:
//
//   - the CONTAINER, a row in mind_projects: name, description, instructions,
//     archived. Workspace configuration. Core does not "know" any of it; it
//     is handed to Core as the frame of a conversation.
//   - the ANCHOR, a node in mind_nodes. Its neighbourhood is the Project.
//     "Visual learning" created while working on Calculus and discussed again
//     while working on Socria is one node with two edges, never two nodes.
//
// Pure: no storage, no clock, no model. Everything here is a graph in and a
// graph (or a number, or a string) out, which is what lets the cross-project
// behaviour be tested rather than asserted.

import {
  fingerprintEdge, isForgotten, normalize, clip,
  type MindEdge, type MindGraph, type MindNode, type NodeStatus, type Provenance,
} from './types';

// ── membership ──────────────────────────────────────────────────────

/**
 * The edges a Project's container is responsible for.
 *
 * Any edge to an anchor connects a node to that Project — an extracted
 * "Logos part_of Socria" does as much as a mechanical `belongs_to`. But only
 * these are PROJECT relationships in the sense deletion cares about: they
 * say where something was worked on, not what it is. Deleting a Project
 * removes these and leaves the rest, because "Logos is part of Socria" is
 * knowledge about the world and survives the workspace being tidied away.
 */
export const MEMBERSHIP_RELATIONSHIPS = new Set<string>([
  'belongs_to', 'relevant_to', 'created_in', 'discussed_in',
]);

/** One justification for a Project tie: which conversation, file, or hand. */
function sourceKey(p: Pick<Provenance, 'conversationId' | 'sourceNodeId' | 'surface'>): string {
  return p.conversationId ? `c:${p.conversationId}` : p.sourceNodeId ? `f:${p.sourceNodeId}` : `s:${p.surface}`;
}

/** What created a node's tie to a Project, from the apply() report. */
export type TouchAction = 'created' | 'reinforced' | 'revised' | 'superseded' | 'conflicted';

export interface AssociateOptions {
  now: number;
  nextId: () => string;
  /** where the association came from — a conversation, or a file */
  provenance: Omit<Provenance, 'kind' | 'at'>;
}

/**
 * Tie what a turn (or a file) touched to the Project it happened in.
 *
 * Something NEW here `belongs_to` the Project. Something that already existed
 * and came up again here is `relevant_to` it — which is how a concept learned
 * in one Project becomes connected to another without being duplicated into
 * it. A tie that already exists is reinforced rather than repeated.
 *
 * Membership is structural rather than a claim about the person, so it does
 * not pass the gate. It DOES respect tombstones: somebody who removed a
 * node's tie to a Project from the Memory page has said it does not belong
 * there, and the next turn in that Project must not quietly put it back.
 */
export function associate(
  graph: MindGraph,
  anchorId: string,
  touched: readonly { id: string; action: TouchAction }[],
  opts: AssociateOptions
): { graph: MindGraph; created: number; reinforced: number } {
  const anchor = graph.nodes.find((n) => n.id === anchorId);
  if (!anchor) return { graph, created: 0, reinforced: 0 };

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = [...graph.edges];
  let created = 0;
  let reinforced = 0;
  const seen = new Set<string>();

  for (const t of touched) {
    if (t.id === anchorId || seen.has(t.id)) continue;
    seen.add(t.id);
    const node = byId.get(t.id);
    if (!node) continue;

    const existing = edges.findIndex(
      (e) =>
        MEMBERSHIP_RELATIONSHIPS.has(e.relationship) &&
        ((e.sourceId === t.id && e.targetId === anchorId) ||
          (e.sourceId === anchorId && e.targetId === t.id))
    );
    if (existing >= 0) {
      const e = edges[existing];
      // Record WHAT reinforced it, once per distinct source — a conversation,
      // a file, or the person's own hand. A tie justified by several must
      // survive one of them going away (see releaseConversation), and it can
      // only do that if all of them are written down. The first version
      // recorded only conversations, so a tie a chat created and a FILE then
      // reinforced was deleted outright when the chat was moved out.
      const key = sourceKey(opts.provenance);
      const known = e.provenance.some((p) => sourceKey(p) === key);
      edges[existing] = {
        ...e,
        strength: Math.min(1, e.strength + 0.05),
        provenance: known
          ? e.provenance
          : [...e.provenance, { ...opts.provenance, kind: 'calculated' as const, at: opts.now, note: 'came up again in this project' }].slice(-20),
        updatedAt: opts.now,
        lastReinforced: opts.now,
      };
      reinforced++;
      continue;
    }

    const fresh = t.action === 'created' || t.action === 'superseded' || t.action === 'conflicted';
    const relationship = fresh ? 'belongs_to' : 'relevant_to';
    if (isForgotten(graph, fingerprintEdge(node.type, node.label, relationship, anchor.type, anchor.label))) {
      continue;
    }
    const p: Provenance = {
      ...opts.provenance,
      // Not something the person said; something that was worked out from
      // where the conversation took place. `calculated` is the honest register.
      kind: 'calculated',
      at: opts.now,
      note: fresh ? 'first came up in this project' : 'came up again in this project',
    };
    edges.push({
      id: opts.nextId(),
      sourceId: t.id,
      targetId: anchorId,
      relationship,
      confidence: 1,
      strength: fresh ? 0.6 : 0.5,
      provenance: [p],
      createdAt: opts.now,
      updatedAt: opts.now,
      lastReinforced: opts.now,
    });
    created++;
  }

  return { graph: { ...graph, edges }, created, reinforced };
}

/**
 * A conversation moved INTO a Project, after the fact.
 *
 * Everything learned in it is already in the graph — every node records the
 * conversation it came from — so filing the conversation under a Project
 * ties what it taught to that Project exactly as if it had been held there
 * from the start. Something first learned in this conversation `belongs_to`
 * the Project; something that existed before it is `relevant_to` it.
 */
export function adoptConversation(
  graph: MindGraph,
  anchorId: string,
  conversationId: string,
  opts: { now: number; nextId: () => string }
): { graph: MindGraph; tied: number } {
  const touched = graph.nodes
    .filter((n) => n.id !== anchorId && n.provenance.some((p) => p.conversationId === conversationId))
    .map((n) => ({
      id: n.id,
      action: (n.provenance[0]?.conversationId === conversationId ? 'created' : 'reinforced') as TouchAction,
    }));
  const out = associate(graph, anchorId, touched, {
    now: opts.now, nextId: opts.nextId, provenance: { surface: 'core', conversationId },
  });
  return { graph: out.graph, tied: out.created + out.reinforced };
}

/**
 * A conversation moved OUT of a Project.
 *
 * Unties exactly what that conversation tied, and nothing else. A membership
 * edge that other conversations in the Project — or a file, or a goal the
 * person typed — also justify stays, minus this conversation's entry. Only a
 * tie that came from this conversation alone is removed.
 *
 * No tombstones and no memories touched. Moving a chat is filing, not
 * forgetting: what it taught stays in the graph, simply no longer filed here.
 */
export function releaseConversation(
  graph: MindGraph,
  anchorId: string,
  conversationId: string
): { graph: MindGraph; untied: number } {
  let untied = 0;
  const edges: MindEdge[] = [];
  for (const e of graph.edges) {
    const touches = e.sourceId === anchorId || e.targetId === anchorId;
    if (!touches || !MEMBERSHIP_RELATIONSHIPS.has(e.relationship)) { edges.push(e); continue; }
    const mine = e.provenance.filter((p) => p.conversationId === conversationId);
    if (!mine.length) { edges.push(e); continue; }
    const rest = e.provenance.filter((p) => p.conversationId !== conversationId);
    if (!rest.length) { untied++; continue; }
    edges.push({ ...e, provenance: rest });
  }
  return { graph: { ...graph, edges }, untied };
}

/**
 * Which Projects each node sits in: node id → anchor ids.
 *
 * ANY edge to an anchor counts here, not only membership edges. This is the
 * question retrieval asks — "is this near that Project?" — and an extracted
 * `used_by` answers it as well as a mechanical `belongs_to` does.
 */
export function projectIndex(
  graph: MindGraph,
  anchors: ReadonlySet<string>
): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  const add = (node: string, anchor: string) => {
    if (node === anchor) return;
    (idx.get(node) ?? idx.set(node, new Set()).get(node)!).add(anchor);
  };
  for (const e of graph.edges) {
    if (anchors.has(e.targetId)) add(e.sourceId, e.targetId);
    if (anchors.has(e.sourceId)) add(e.targetId, e.sourceId);
  }
  return idx;
}

// ── retrieval weighting ─────────────────────────────────────────────

/**
 * How much being in the current Project raises a node's priority.
 *
 * A multiplier on its score, never a filter. Substantial on purpose: inside
 * Calculus, Calculus should come first nearly every time.
 */
export const HERE_BOOST = 1.6;

/**
 * How much being ONLY in some other Project lowers it.
 *
 * Paired with CROSS_MIN_ACTIVATION, which is the half that matters. The
 * penalty alone would let a node from another Project in whenever the window
 * had room; the threshold means it has to have EARNED its way in.
 */
export const ELSEWHERE_FACTOR = 0.55;

/**
 * The activation a node from another Project needs before it may surface at
 * all.
 *
 * Calibrated against seedActivation: a direct match on a node's name lands
 * around 0.4–0.85, a label containing the term around 0.3–0.6, and a single
 * hop from a strong seed around 0.1–0.2. So this admits what the message is
 * actually ABOUT, and something reached along several strong paths at once,
 * and refuses what is merely one hop from something that is. That is the
 * difference between "your calculus experience is relevant here" and "your
 * calculus project exists".
 */
export const CROSS_MIN_ACTIVATION = 0.3;

/**
 * The second way in for a node from another Project: ONE STRONG HOP from
 * something the message directly named.
 *
 * Needed because the threshold alone was measured to be wrong. New edges are
 * born at strength 0.5 and a hop halves activation, so a memory one
 * `evidence_for` away from a strong seed lands near 0.15 — well under
 * CROSS_MIN_ACTIVATION. Inside Socria, asked how Core should help someone
 * struggling with derivatives, the threshold on its own admitted the concept
 * "derivatives" and refused every experience of HOW the person learned
 * derivatives: the very memories the question needed.
 *
 * So relevance is structural as well as numeric. A node qualifies if it is
 * directly tied — by a relationship that means something (evidence, cause,
 * dependency, what was learned from what; not "associated with" or
 * "mentioned in") — to a thing the message named outright. Two hops never
 * qualify this way, and neither does anything reached through a Project
 * anchor, because anchors are not message seeds.
 */
export const STRONG_RELATION = 0.7;
export const STRONG_EDGE = 0.4;
/** How strong a message seed must be for its neighbours to ride along. */
export const SEED_FLOOR = 0.3;

/** How strongly the current Project's anchor is lit before spreading. */
export const ANCHOR_SEED = 0.5;

export type Affinity = 'here' | 'global' | 'elsewhere';

export function affinity(
  nodeId: string,
  index: ReadonlyMap<string, ReadonlySet<string>>,
  current: string | null,
  anchors: ReadonlySet<string>
): Affinity {
  if (current && nodeId === current) return 'here';
  const inProjects = index.get(nodeId);
  if (current && inProjects?.has(current)) return 'here';
  // Another Project's anchor is itself "elsewhere" — the Project as a thing
  // is part of that neighbourhood.
  if (anchors.has(nodeId)) return current ? 'elsewhere' : 'global';
  if (!inProjects || !inProjects.size) return 'global';
  // Outside any Project, no region is preferred — and none is penalised.
  return current ? 'elsewhere' : 'global';
}

export function affinityFactor(a: Affinity): number {
  return a === 'here' ? HERE_BOOST : a === 'elsewhere' ? ELSEWHERE_FACTOR : 1;
}

// ── what Core is told about the Project ─────────────────────────────

export interface ProjectContainer {
  id: string;
  nodeId: string;
  name: string;
  description: string;
  instructions: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export const MAX_PROJECT_NAME = 80;
export const MAX_PROJECT_DESCRIPTION = 600;
export const MAX_PROJECT_INSTRUCTIONS = 2000;
export const MAX_GOALS_SHOWN = 8;
/** Enough to organise a life's worth of work; few enough to stay a list. */
export const MAX_PROJECTS = 50;

/** One line, trimmed, bounded — applied on the server whatever the client did. */
export function cleanProjectName(raw: unknown): string {
  return typeof raw === 'string' ? clip(raw.replace(/\s+/g, ' ').trim(), MAX_PROJECT_NAME) : '';
}
export const MAX_FILES_SHOWN = 12;

/** Goals in the Project's neighbourhood that are still live. */
export function projectGoals(graph: MindGraph, anchorId: string): MindNode[] {
  const near = new Set<string>();
  for (const e of graph.edges) {
    if (e.targetId === anchorId) near.add(e.sourceId);
    if (e.sourceId === anchorId) near.add(e.targetId);
  }
  const live: NodeStatus[] = ['active', 'tentative', 'uncertain'];
  return graph.nodes
    .filter((n) => near.has(n.id) && (n.type === 'Goal' || n.type === 'Plan') && live.includes(n.status))
    .sort((a, b) => b.importance - a.importance || b.updatedAt - a.updatedAt);
}

/**
 * The frame of a conversation that happens inside a Project.
 *
 * Deliberately small. Not the Project: its name, what the person said it is
 * for, their instructions, its live goals and the NAMES of its files. What
 * the Project contains reaches Core the ordinary way — through activation,
 * bounded by the plan's window — so a large Project costs the prompt exactly
 * what a small one does. Serialising a whole Project into the prompt is the
 * thing this exists instead of.
 *
 * Plain text with a fixed shape, so the frontier model underneath can change
 * without anything here changing.
 */
export function renderProjectContext(
  p: Pick<ProjectContainer, 'name' | 'description' | 'instructions'>,
  goals: readonly MindNode[],
  files: readonly { name: string }[]
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`=== Current Project: ${clip(p.name, MAX_PROJECT_NAME)} ===`);
  lines.push(
    `This conversation is happening inside the person's Project "${clip(p.name, MAX_PROJECT_NAME)}". ` +
      'Give its context priority. Their memory is still one connected whole: an item below marked ' +
      '[from project: …] surfaced from another of their Projects because it is strongly related to ' +
      'what they just said. Use it when it genuinely helps, and say where it comes from when you do. ' +
      'Do not bring in material from other Projects that is not relevant to this conversation.'
  );
  const description = clip(p.description ?? '', MAX_PROJECT_DESCRIPTION);
  if (description) lines.push(`What it is: ${description}`);
  const instructions = clip(p.instructions ?? '', MAX_PROJECT_INSTRUCTIONS);
  if (instructions) {
    lines.push(
      'How they want this Project handled (their words; these shape this Project\'s conversations ' +
        'and do not replace who you are or how you work):'
    );
    lines.push(instructions);
  }
  const shownGoals = goals.slice(0, MAX_GOALS_SHOWN);
  if (shownGoals.length) {
    lines.push('Project goals:');
    for (const g of shownGoals) {
      const s = g.status === 'active' ? '' : ` (${g.status})`;
      lines.push(`- ${g.label}${s}${g.content && normalize(g.content) !== normalize(g.label) ? ` — ${clip(g.content, 200)}` : ''}`);
    }
  }
  const shownFiles = files.slice(0, MAX_FILES_SHOWN);
  if (shownFiles.length) {
    const more = files.length > shownFiles.length ? ` and ${files.length - shownFiles.length} more` : '';
    lines.push(`Files in this Project: ${shownFiles.map((f) => clip(f.name, 80)).join(', ')}${more}.`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * A goal the person typed into a Project.
 *
 * Direct, like createAnchor: they wrote it down as a goal, which is not an
 * inference to corroborate or a remark to weigh for substance. "Ship it" is
 * a short goal and a real one. But not a duplicate — if they already hold
 * this goal (from another Project, or from a conversation), that node is
 * reused and tied to this Project as well. One goal can serve two Projects.
 */
export function addGoal(
  graph: MindGraph,
  anchorId: string,
  text: string,
  opts: { now: number; nextId: () => string }
): { graph: MindGraph; nodeId: string; reused: boolean } | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || !graph.nodes.some((n) => n.id === anchorId)) return null;
  const label = clip(clean, 120);
  const want = normalize(label);
  const existing = graph.nodes.find(
    (n) => (n.type === 'Goal' || n.type === 'Plan') &&
      (normalize(n.label) === want || n.aliases.some((a) => normalize(a) === want))
  );

  let g = graph;
  let nodeId: string;
  if (existing) {
    nodeId = existing.id;
    // Revived if it had been set aside: adding it again is saying it is live.
    g = {
      ...g,
      nodes: g.nodes.map((n) => n.id === existing.id
        ? { ...n, status: n.status === 'active' ? n.status : 'active', seen: n.seen + 1, updatedAt: opts.now }
        : n),
    };
  } else {
    const node: MindNode = {
      id: opts.nextId(),
      type: 'Goal',
      label,
      content: clip(clean, 400),
      aliases: [],
      status: 'active',
      confidence: 1,
      certainty: 1,
      importance: 0.7,
      activation: 0.5,
      seen: 1,
      private: false,
      provenance: [{ kind: 'stated', surface: 'user', at: opts.now, note: 'added as a Project goal' }],
      createdAt: opts.now,
      updatedAt: opts.now,
      lastAccessed: opts.now,
    };
    g = { ...g, nodes: [...g.nodes, node] };
    nodeId = node.id;
  }

  const tied = associate(g, anchorId, [{ id: nodeId, action: existing ? 'reinforced' : 'created' }], {
    now: opts.now, nextId: opts.nextId, provenance: { surface: 'user' },
  });
  return { graph: tied.graph, nodeId, reused: !!existing };
}

// ── lifecycle ───────────────────────────────────────────────────────

/**
 * An existing Project node with this name, if there is one and nothing owns
 * it yet.
 *
 * Creating "Socria" when the graph already holds a Project node called Socria
 * — because it came up in a conversation weeks ago — ADOPTS that node. A
 * second "Socria" beside the first would split everything known about it in
 * two, which is exactly the duplication a single graph exists to avoid.
 */
export function findAdoptable(
  graph: MindGraph,
  name: string,
  anchors: ReadonlySet<string>
): MindNode | null {
  const want = normalize(name);
  if (!want) return null;
  return (
    graph.nodes.find(
      (n) =>
        !anchors.has(n.id) &&
        normalize(n.type) === 'project' &&
        (normalize(n.label) === want || n.aliases.some((a) => normalize(a) === want))
    ) ?? null
  );
}

/**
 * The node a new Project stands on: an existing one adopted, or a fresh one.
 *
 * Created DIRECTLY rather than through the gate. Creating a Project is the
 * most explicit statement a person makes to Socria — they typed its name and
 * pressed a button — so it is not an inference to be corroborated. It also
 * means a tombstone left by an extracted "Socria" node the person once
 * removed cannot stop them making a Project called Socria.
 */
export function createAnchor(
  graph: MindGraph,
  name: string,
  description: string,
  anchors: ReadonlySet<string>,
  opts: { now: number; nextId: () => string }
): { graph: MindGraph; nodeId: string; adopted: boolean } {
  const existing = findAdoptable(graph, name, anchors);
  if (existing) {
    const next = syncAnchor(graph, existing.id, {
      // Keep the words it already has unless the person gave better ones.
      description: description.trim() ? description : undefined,
      status: 'active',
    }, opts.now);
    return { graph: next, nodeId: existing.id, adopted: true };
  }
  const label = clip(name, MAX_PROJECT_NAME);
  const node: MindNode = {
    id: opts.nextId(),
    type: 'Project',
    label,
    content: clip(description, MAX_PROJECT_DESCRIPTION) || `A Project they are working on in Socria: ${label}.`,
    aliases: [],
    status: 'active',
    confidence: 1,
    certainty: 1,
    importance: 0.7,
    activation: 0.5,
    seen: 1,
    private: false,
    provenance: [{ kind: 'stated', surface: 'user', at: opts.now, note: 'created as a Project' }],
    createdAt: opts.now,
    updatedAt: opts.now,
    lastAccessed: opts.now,
  };
  return { graph: { ...graph, nodes: [...graph.nodes, node] }, nodeId: node.id, adopted: false };
}

/** Keep the anchor in step with its container: its name and what it is. */
export function syncAnchor(
  graph: MindGraph,
  anchorId: string,
  patch: { name?: string; description?: string; status?: NodeStatus },
  now: number
): MindGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      if (n.id !== anchorId) return n;
      const label = patch.name !== undefined ? clip(patch.name, MAX_PROJECT_NAME) : n.label;
      return {
        ...n,
        label,
        // The old name is still a name it has been called. Keeping it as an
        // alias means a conversation that uses it still reaches this node.
        aliases:
          normalize(label) !== normalize(n.label)
            ? [...new Set([...n.aliases, n.label])].slice(0, 12)
            : n.aliases,
        content: patch.description !== undefined && patch.description.trim()
          ? clip(patch.description, MAX_PROJECT_DESCRIPTION)
          : n.content,
        status: patch.status ?? n.status,
        updatedAt: now,
      };
    }),
  };
}

export interface DeletionPlan {
  graph: MindGraph;
  /** membership edges removed — the Project relationships */
  unlinked: number;
  /** nodes that were in the Project and are still in the graph, untouched */
  memoriesKept: number;
  /** what happened to the Project's own node */
  anchor: 'kept-historical' | 'removed' | 'missing';
}

/**
 * What deleting a Project does to the graph — and, as importantly, what it
 * does not.
 *
 * Four things could be meant by "delete this Project", and only the first
 * three are done here:
 *
 *   1. the container — the caller removes the mind_projects row;
 *   2. its files — the caller's choice, and even then only the stored text:
 *      what was learned from a file is a claim that can be true on its own;
 *   3. its RELATIONSHIPS — the membership edges, removed below;
 *   4. the memories themselves — NEVER. A node that came up in this Project
 *      may be tied to three others, or be simply true about the person. It
 *      stays, and remains removable one at a time from Memory, where the
 *      person can see what they are removing.
 *
 * No tombstones are written. Deleting a workspace is not a statement that
 * any of it was wrong; a tombstone here would stop Socria ever re-learning
 * that the person works on Socria.
 *
 * The anchor survives as `historical` if anything other than membership
 * still ties it to the graph — "Logos is part of Socria" is knowledge — and
 * is removed only when the Project was all it ever was.
 */
export function planDeletion(graph: MindGraph, anchorId: string, now: number): DeletionPlan {
  const anchor = graph.nodes.find((n) => n.id === anchorId);
  if (!anchor) return { graph, unlinked: 0, memoriesKept: 0, anchor: 'missing' };

  const members = new Set<string>();
  const kept: MindEdge[] = [];
  let unlinked = 0;
  for (const e of graph.edges) {
    const touches = e.sourceId === anchorId || e.targetId === anchorId;
    if (touches) members.add(e.sourceId === anchorId ? e.targetId : e.sourceId);
    if (touches && MEMBERSHIP_RELATIONSHIPS.has(e.relationship)) {
      unlinked++;
      continue;
    }
    kept.push(e);
  }

  const stillTied = kept.some((e) => e.sourceId === anchorId || e.targetId === anchorId);
  const nodes = stillTied
    ? graph.nodes.map((n) => (n.id === anchorId ? { ...n, status: 'historical' as const, updatedAt: now } : n))
    : graph.nodes.filter((n) => n.id !== anchorId);

  return {
    graph: { ...graph, nodes, edges: kept },
    unlinked,
    memoriesKept: [...members].filter((id) => nodes.some((n) => n.id === id)).length,
    anchor: stillTied ? 'kept-historical' : 'removed',
  };
}
