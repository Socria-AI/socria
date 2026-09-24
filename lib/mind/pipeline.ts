import { nameCandidate, nameFrom } from './self';
import 'server-only';
// lib/mind/pipeline.ts
//
// The two things the rest of Socria actually calls.
//
//   recall()   — before a reply: load, activate, render, and note that these
//                memories were used.
//   remember() — after a turn: extract, gate, resolve, apply, persist.
//
// Both are deliberately narrow. Everything interesting is in the pure modules
// or in the store; this file is the seam where they meet, and keeping it thin
// is what lets Logos use the same graph later by calling the same two
// functions with a different surface.

import { activate, touch, type ActivatedSubgraph } from './activate';
import { applyCandidates, type ApplyReport, type EdgeCandidate, type NodeCandidate } from './apply';
import { extract } from './extract';
import { FILE_BUDGET, TURN_BUDGET, type Budget } from './gate';
import { renderMindGraph } from './serialize';
import {
  associate, projectGoals, renderProjectContext, type ProjectContainer,
} from './projects';
import {
  getProject, listProjects, listSources, loadGraph, persistGraph, touchNodes,
} from './store';
import { MAX_EDGES, MAX_NODES, type MindGraph, type ProvenanceSurface } from './types';

/**
 * How much of the graph reaches a conversation.
 *
 * A plan is a WINDOW, never a deletion — the rule the rest of Socria's memory
 * already follows. Both accounts store the same graph; a member simply sees
 * more of it at once.
 */
export interface RecallWindow {
  nodes: number;
  tokens: number;
}
export const FREE_WINDOW: RecallWindow = { nodes: 15, tokens: 500 };
export const ONE_WINDOW: RecallWindow = { nodes: 40, tokens: 1200 };

export function windowFor(plan: 'free' | 'one'): RecallWindow {
  return plan === 'one' ? ONE_WINDOW : FREE_WINDOW;
}

/**
 * How long a reply will wait for memory before going without it.
 *
 * recall() sits on the hot path of every Core 4 turn and reads a whole
 * graph. A failure it already survives; SLOWNESS it did not — a database
 * having a bad minute would have held every reply for as long as the
 * connection took to give up, which is the same outage from the person's
 * side and harder to diagnose. Two seconds, then the turn goes on without
 * memory, which is how Socria worked until recently.
 */
export const RECALL_TIMEOUT_MS = 2_000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn(`[socria/mind] recall exceeded ${ms}ms; replying without memory`);
      resolve(fallback);
    }, ms);
    p.then(
      (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } },
      () => { if (!settled) { settled = true; clearTimeout(timer); resolve(fallback); } }
    );
  });
}

export interface RecallResult {
  /** the block for the system prompt; '' when nothing was activated */
  block: string;
  subgraph: ActivatedSubgraph;
  graph: MindGraph;
  /** the Project frame for the system prompt; '' outside a Project */
  projectBlock: string;
  /** the Project this conversation is in — verified to be theirs, or null */
  project: ProjectContainer | null;
}

/**
 * What this person's graph has to say about what they just said.
 *
 * Never throws. A graph that cannot be read means a conversation without
 * memory, which is how Socria worked until recently; a conversation that
 * breaks because memory failed is a regression nobody accepts.
 */
export async function recall(
  userId: string,
  message: string,
  opts: {
    now: number;
    plan: 'free' | 'one';
    surface: ProvenanceSurface;
    focus?: string[];
    /** the conversation, so what it already wrote is recalled on its next turn */
    conversationId?: string;
    /**
     * The Project the conversation is in. A WEIGHTING on retrieval, never a
     * filter: see lib/mind/projects.ts. An id that is not this person's —
     * or no longer exists — reads as no Project, never as an error.
     */
    projectId?: string | null;
  }
): Promise<RecallResult> {
  const none: MindGraph = { nodes: [], edges: [], tombstones: [], pending: [] };
  const empty: RecallResult = {
    block: '',
    subgraph: { nodes: [], edges: [], seeds: [], scores: {} },
    graph: none,
    projectBlock: '',
    project: null,
  };
  try {
    // Everything retrieval needs, in one round of reads under one deadline.
    // The Project list is read even outside a Project: retrieval needs to
    // know which nodes ARE Projects so that none of them can flood a
    // conversation with its whole neighbourhood (the hub rule).
    //
    // listProjects throws when mind_projects is missing — a database that
    // has not re-run schema.sql since Projects arrived. That must cost this
    // turn its Projects, not its memory, so it is caught on its own.
    const loaded = await withTimeout(
      Promise.all([
        loadGraph(userId),
        listProjects(userId).catch(() => [] as ProjectContainer[]),
        opts.projectId
          ? listSources(userId, { projectId: opts.projectId }).catch(() => [])
          : Promise.resolve([]),
      ]),
      RECALL_TIMEOUT_MS,
      null
    );
    if (!loaded) return empty;
    const [graph, projects, files] = loaded;

    const present = new Set(graph.nodes.map((n) => n.id));
    const anchors = new Set(projects.map((p) => p.nodeId).filter((id) => present.has(id)));
    const project = opts.projectId ? projects.find((p) => p.id === opts.projectId) ?? null : null;
    const current = project && anchors.has(project.nodeId) ? project.nodeId : null;

    // The frame is built whether or not anything else is remembered: a new
    // Project with no memories yet still has a name, instructions and goals.
    const projectBlock = project
      ? renderProjectContext(project, current ? projectGoals(graph, current) : [], files)
      : '';

    if (!graph.nodes.length) return { ...empty, graph, projectBlock, project };

    const win = windowFor(opts.plan);
    const subgraph = activate(graph, message, {
      now: opts.now,
      limit: win.nodes,
      // Logos never receives private nodes: its map can be exported as an
      // image and shown to someone.
      excludePrivate: opts.surface === 'logos',
      focus: opts.focus,
      conversationId: opts.conversationId,
      project: anchors.size ? { current, anchors } : undefined,
    });

    // Anchor ids -> Project names, for anything that surfaced from a Project
    // other than this one.
    const names = new Map(projects.map((p) => [p.nodeId, p.name]));
    const origin: Record<string, string> = {};
    for (const [id, from] of Object.entries(subgraph.elsewhere ?? {})) {
      const label = from.map((a) => names.get(a)).filter(Boolean).join(', ');
      if (label) origin[id] = label;
    }

    // Recall strengthens memory. Best-effort and not awaited on the hot path.
    void touchNodes(userId, touch(subgraph, opts.now));

    return {
      block: renderMindGraph(subgraph, { now: opts.now, maxTokens: win.tokens, origin }),
      subgraph,
      graph,
      projectBlock,
      project,
    };
  } catch (e) {
    // Still swallowed — a conversation must never break because memory did —
    // but no longer SILENT. The store logs the specific table and reason; this
    // records that a turn went out with no memory behind it, which is the
    // line somebody reads when asking why Socria does not remember anything.
    console.error('[socria/mind] recall failed; this turn has no memory', e);
    return empty;
  }
}

export interface RememberResult {
  report: ApplyReport | null;
  persisted: boolean;
}

/**
 * Learn from a turn.
 *
 * Fire-and-forget by design. A failure here means the graph did not learn
 * from one turn — recoverable, and invisible. The only thing that must never
 * happen is a reply failing because of it.
 */
export async function remember(
  userId: string,
  text: string,
  opts: {
    now: number;
    apiKey: string;
    surface: ProvenanceSurface;
    conversationId?: string;
    /** what was activated for this turn, so the extractor sees what exists */
    existing?: ActivatedSubgraph | null;
    /** pre-extracted candidates — the TXT path supplies its own */
    candidates?: { nodes: NodeCandidate[]; edges: EdgeCandidate[] };
    budget?: Budget;
    sourceNodeId?: string;
    private?: boolean;
    /** the Project the turn happened in; what it touched is tied to it */
    projectId?: string | null;
  }
): Promise<RememberResult> {
  try {
    const [before, project] = await Promise.all([
      loadGraph(userId),
      // Scoped to the owner inside getProject, so a foreign id is null here.
      opts.projectId ? getProject(userId, opts.projectId).catch(() => null) : Promise.resolve(null),
    ]);

    // A ceiling, not a plan boundary: nobody reaches it, and no tier stores
    // more than another.
    if (before.nodes.length >= MAX_NODES || before.edges.length >= MAX_EDGES) {
      return { report: null, persisted: false };
    }

    const candidates =
      opts.candidates ?? (await extract(opts.apiKey, text, opts.existing ?? null));

    // ── WHAT THEY SAID ABOUT THEMSELVES, WITHOUT ASKING A MODEL ──────
    //
    // "My name is X" is a regex, and a regex cannot be talked out of it, cost
    // a call, or decide the turn was not worth remembering. The extractor
    // frequently answered {} for exactly this turn — its own instructions say
    // most turns add nothing and name pleasantries as the example — and the
    // name was then lost while the reply said "Got it, Pradeep."
    //
    // Only the USER's half of the turn is read: `text` is "User: …\n\nSocria: …",
    // and a name Socria used in its reply is Socria repeating them, not a
    // second source.
    const saidByThem = text.split(/\n\nSocria:/)[0];
    const name = nameFrom(saidByThem);
    if (name) {
      const already = candidates.nodes.some((n) => n.label.trim().toLowerCase() === name.toLowerCase());
      if (!already) candidates.nodes.unshift(nameCandidate(name));
    }

    if (!candidates.nodes.length && !candidates.edges.length) {
      return { report: null, persisted: false };
    }

    let n = 0;
    const { graph: after, report } = applyCandidates(
      before,
      opts.private ? candidates.nodes.map((c) => ({ ...c, private: true })) : candidates.nodes,
      candidates.edges,
      {
        now: opts.now,
        nextId: () => `m_${opts.now.toString(36)}_${(n++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        budget: opts.budget ?? TURN_BUDGET,
        provenance: {
          surface: opts.surface,
          // Bounded like any other field off a request body. It is the key
          // the isolation rule counts distinct conversations by, so an
          // unbounded string would sit in the pending ledger for ever and a
          // varying one would let a single conversation pose as many.
          conversationId:
            typeof opts.conversationId === 'string' && opts.conversationId.trim()
              ? opts.conversationId.trim().slice(0, 120)
              : undefined,
          sourceNodeId: opts.sourceNodeId,
        },
      }
    );

    // The ONE graph learns normally — everything above is identical inside a
    // Project and out of it. What the Project adds is only this: what the
    // turn touched is tied to the Project it happened in, so next time the
    // Project is open, attention starts there.
    let graph = after;
    if (project && after.nodes.some((node) => node.id === project.nodeId)) {
      graph = associate(
        after,
        project.nodeId,
        report.nodes.map((r) => ({ id: r.id, action: r.action })),
        {
          now: opts.now,
          nextId: () => `m_${opts.now.toString(36)}_p${(n++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          provenance: { surface: opts.surface, conversationId: opts.conversationId },
        }
      ).graph;
    }

    const saved = await persistGraph(userId, before, graph);
    if (!saved.ok) {
      // persistGraph has already logged which write failed and why. This says
      // what was lost, which is the part that matters when a whole session of
      // conversation has apparently taught Socria nothing.
      console.error(
        `[socria/mind] nothing was saved from this turn: ${report.nodes.length} node change(s) dropped`
      );
    }
    return { report, persisted: saved.ok };
  } catch (e) {
    console.error('[socria/mind] remember failed; the graph did not learn from this turn', e);
    return { report: null, persisted: false };
  }
}

export { FILE_BUDGET, TURN_BUDGET };
