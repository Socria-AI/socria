import 'server-only';
// lib/mind/waiting.ts
//
// The join between a change to durable memory and what that change reached.
//
// The graph walk itself is pure and lives in lib/workspace/impact.ts, which
// knows nothing about Postgres; the store knows nothing about traversal. This
// file is the only place that knows both, and it is deliberately thin: project
// the graph, ask what a change reaches, write the marks.
//
// Why the marks are written at the moment of the change rather than computed on
// read: the walk answers "what depends on this NOW", and the thing a person
// needs to know is what depended on it WHEN THEY CHANGED IT. Computing it later
// would quietly drop anything that has since been rewired, which is exactly the
// case where somebody most needs telling.

import { projectMind } from '@/lib/workspace/adapters';
import { planImpact } from '@/lib/workspace/impact';
import { emptyWorkspace } from '@/lib/workspace/store';
import { clearStale, writeStale, type StaleMark } from './store';
import type { MindGraph } from './types';

/** Workspace ids are namespaced; the store speaks in Mind ids. */
const bare = (id: string) => (id.startsWith('mind:') ? id.slice(5) : id);

/**
 * Record what changing this node reached.
 *
 * Private nodes are INCLUDED here, unlike every projection bound for Logos or
 * an export: this runs server-side for the person themselves, and a private
 * claim that rests on something they just corrected still needs looking at.
 * Nothing about these marks ever leaves their own account.
 *
 * The changed node's own mark is cleared, because they have just looked at it.
 */
export async function recordImpact(
  userId: string,
  graph: MindGraph,
  changedId: string,
  at: number
): Promise<{ marks: StaleMark[]; say: string }> {
  const ws = projectMind(emptyWorkspace(), graph);
  const plan = planImpact(ws, `mind:${changedId}`);
  if (!plan) return { marks: [], say: '' };

  const marks: StaleMark[] = plan.affected.map((a) => ({
    nodeId: bare(a.id),
    becauseId: changedId,
    becauseLabel: plan.label,
    kind: a.kind,
    distance: a.distance,
    at,
  }));

  await Promise.all([writeStale(userId, marks), clearStale(userId, changedId)]);
  return { marks, say: plan.say };
}

/**
 * The same walk, without writing anything — for showing somebody what an edit
 * would reach before they make it. Exported separately so the two can never
 * disagree about what counts as affected.
 */
export function wouldReach(graph: MindGraph, changedId: string) {
  return planImpact(projectMind(emptyWorkspace(), graph), `mind:${changedId}`);
}
