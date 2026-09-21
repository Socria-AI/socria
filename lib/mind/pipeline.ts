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
import { loadGraph, persistGraph, touchNodes } from './store';
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

export interface RecallResult {
  /** the block for the system prompt; '' when nothing was activated */
  block: string;
  subgraph: ActivatedSubgraph;
  graph: MindGraph;
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
  }
): Promise<RecallResult> {
  const empty: RecallResult = {
    block: '',
    subgraph: { nodes: [], edges: [], seeds: [], scores: {} },
    graph: { nodes: [], edges: [], tombstones: [], pending: [] },
  };
  try {
    const graph = await loadGraph(userId);
    if (!graph.nodes.length) return { ...empty, graph };

    const win = windowFor(opts.plan);
    const subgraph = activate(graph, message, {
      now: opts.now,
      limit: win.nodes,
      // Logos never receives private nodes: its map can be exported as an
      // image and shown to someone.
      excludePrivate: opts.surface === 'logos',
      focus: opts.focus,
    });

    // Recall strengthens memory. Best-effort and not awaited on the hot path.
    void touchNodes(userId, touch(subgraph, opts.now));

    return {
      block: renderMindGraph(subgraph, { now: opts.now, maxTokens: win.tokens }),
      subgraph,
      graph,
    };
  } catch {
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
  }
): Promise<RememberResult> {
  try {
    const before = await loadGraph(userId);

    // A ceiling, not a plan boundary: nobody reaches it, and no tier stores
    // more than another.
    if (before.nodes.length >= MAX_NODES || before.edges.length >= MAX_EDGES) {
      return { report: null, persisted: false };
    }

    const candidates =
      opts.candidates ?? (await extract(opts.apiKey, text, opts.existing ?? null));
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
          conversationId: opts.conversationId,
          sourceNodeId: opts.sourceNodeId,
        },
      }
    );

    const saved = await persistGraph(userId, before, after);
    return { report, persisted: saved.ok };
  } catch {
    return { report: null, persisted: false };
  }
}

export { FILE_BUDGET, TURN_BUDGET };
