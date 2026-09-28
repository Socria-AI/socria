// lib/workspace/impact.ts
//
// WHAT A CHANGE DOES TO EVERYTHING DOWNSTREAM OF IT.
//
// The workspace could already answer "what rests on this?" (trace.ts). That is
// a question about structure. This file is about TIME: something changed at
// 14:02, and the things resting on it were last looked at when it said
// something else. Nobody has decided whether they still hold.
//
// The distinction the whole file turns on is between a thing a machine may
// settle by itself and a thing only the person may settle:
//
//   RECOMPUTE  the object was produced by a computation — a value derived from
//              a parameter, a surface compiled from a model. Re-running the
//              computation is not an opinion, so this is allowed to happen
//              without asking, and the result is as true as it was before.
//   REVIEW     the object is a claim, a decision, a conclusion. It may still
//              be perfectly right; what is certain is only that its ground
//              moved. Nothing here re-decides it, re-words it, or lowers its
//              standing. The mark says WHERE TO LOOK and nothing more.
//
// Two things this deliberately is not. It is not a confidence system: no score
// moves, and `stale` carries no number. And it is not a cascade of automatic
// edits — the second kind of mark is inert by construction, because a product
// that quietly revises somebody's conclusions when an input changes has taken
// over the part that was theirs.

import { type Stale, type WObject } from './object';
import { update, type Workspace } from './store';
import { TRACE_LIMITS, downstream, type Linked, type TraceLimits } from './trace';

/**
 * Object types a computation produced, and only these.
 *
 * Read from `epistemic` too — computed and simulated standings are earned by
 * the code path that produced them (lib/model/compile.ts), which makes them a
 * better witness than the type alone.
 */
const DERIVED_TYPES: ReadonlySet<string> = new Set([
  'datapoint', 'observation', 'simulation-run', 'visual-object', 'measurement',
  'inference', 'research-result',
]);

export function isDerived(o: WObject): boolean {
  if (o.epistemic === 'computed' || o.epistemic === 'simulated') return true;
  if (o.surface === 'model' && DERIVED_TYPES.has(o.type)) return true;
  return false;
}

/** How a downstream object is affected. */
export interface Affected {
  id: string;
  label: string;
  kind: Stale['kind'];
  distance: number;
  /** the relationship that carried the change */
  via: string;
}

export interface ImpactPlan {
  /** what changed */
  because: string;
  label: string;
  affected: Affected[];
  /** the ones a machine may settle on its own */
  recompute: Affected[];
  /** the ones only the person may settle */
  review: Affected[];
  truncated: boolean;
  /** one sentence, countable rather than alarming */
  say: string;
}

function affectedFrom(l: Linked): Affected {
  return {
    id: l.object.id,
    label: l.object.label,
    kind: isDerived(l.object) ? 'recompute' : 'review',
    distance: l.distance,
    via: l.via.type,
  };
}

/**
 * Plan the consequences of a change, without making any.
 *
 * Separate from marking on purpose: a surface can show the plan before the
 * person commits ("this reaches four things"), and the same function decides
 * what gets marked afterwards — so what they were shown and what happened
 * cannot drift apart.
 */
export function planImpact(ws: Workspace, changed: string, limits: TraceLimits = TRACE_LIMITS): ImpactPlan | null {
  const object = ws.objects.get(changed);
  if (!object) return null;
  const found = downstream(ws, changed, limits).map(affectedFrom);
  const recompute = found.filter((a) => a.kind === 'recompute');
  const review = found.filter((a) => a.kind === 'review');
  const bits: string[] = [];
  if (recompute.length) bits.push(`${recompute.length} to recompute`);
  if (review.length) bits.push(`${review.length} to look at again`);
  return {
    because: changed,
    label: object.label,
    affected: found,
    recompute,
    review,
    truncated: found.length >= limits.breadth,
    say: found.length
      ? `Changing “${object.label}” reaches ${bits.join(' and ')}.`
      : `Nothing rests on “${object.label}”.`,
  };
}

/**
 * Mark what the change reached.
 *
 * Every mark is an ordinary `update` event by `system`, so it lands in the log
 * with everything else and undo reaches it. A mark that already names the same
 * cause is left alone rather than re-stamped — otherwise every read of the
 * graph would rewrite the workspace and nothing would ever look settled.
 *
 * It does NOT mark the changed object itself. The person just looked at that
 * one; telling them it needs another look is noise.
 */
export function markImpact(
  ws: Workspace,
  changed: string,
  at: number,
  limits: TraceLimits = TRACE_LIMITS
): { workspace: Workspace; plan: ImpactPlan | null } {
  const plan = planImpact(ws, changed, limits);
  if (!plan) return { workspace: ws, plan: null };

  let next = ws;
  for (const a of plan.affected) {
    const cur = next.objects.get(a.id);
    if (!cur) continue;
    if (cur.stale?.because === changed && cur.stale.at >= at) continue;
    // A closer cause wins: if something is already stale because of a change
    // one hop away, a three-hop cause tells the person less about where to
    // look, so it does not overwrite it.
    if (cur.stale && (cur.stale.distance ?? 99) < a.distance && cur.stale.at >= at) continue;
    const stale: Stale = {
      because: changed,
      label: plan.label,
      at,
      kind: a.kind,
      distance: a.distance,
    };
    next = update(next, a.id, { stale }, 'system', at);
  }
  return { workspace: next, plan };
}

/** Everything currently waiting, nearest cause first. */
export function pending(ws: Workspace): { object: WObject; stale: Stale }[] {
  const out: { object: WObject; stale: Stale }[] = [];
  for (const o of ws.objects.values()) if (o.stale) out.push({ object: o, stale: o.stale });
  return out.sort(
    (a, b) => (a.stale.distance ?? 99) - (b.stale.distance ?? 99) || b.stale.at - a.stale.at
  );
}

/**
 * Clear a mark.
 *
 * `by` matters and is recorded: a `review` mark may only be cleared by the
 * person, because clearing it means "I have looked and it still holds", and
 * nothing else is in a position to say that. A machine asking to clear one is
 * refused rather than obeyed quietly.
 */
export function settle(
  ws: Workspace,
  id: string,
  by: 'user' | 'system',
  at: number
): { workspace: Workspace; ok: boolean; say: string } {
  const o = ws.objects.get(id);
  if (!o?.stale) return { workspace: ws, ok: false, say: 'Nothing was waiting on that.' };
  if (o.stale.kind === 'review' && by !== 'user') {
    return {
      workspace: ws,
      ok: false,
      say: 'Only you can say whether that still holds.',
    };
  }
  return {
    workspace: update(ws, id, { stale: undefined }, by, at),
    ok: true,
    say: o.stale.kind === 'recompute' ? `Recomputed “${o.label}”.` : `“${o.label}” still holds.`,
  };
}

/**
 * Recompute what a computation produced.
 *
 * The computation itself is INJECTED. lib/workspace knows nothing about
 * marching squares or integrators, and the moment it imported the model engine
 * to do this the two would be welded together; instead the caller passes
 * something that can re-derive one object (app side: recompile the model and
 * read the object back out — lib/model/compile.ts), and this file handles what
 * is common to every such pass: which objects qualify, what to write, what to
 * do when a recompute fails.
 *
 * A failed recompute LEAVES THE MARK. Clearing it would say the thing is
 * current when nobody managed to make it current.
 */
export function recompute(
  ws: Workspace,
  redo: (o: WObject) => { value?: number; content?: string; units?: string } | null,
  at: number
): { workspace: Workspace; done: string[]; failed: string[] } {
  let next = ws;
  const done: string[] = [];
  const failed: string[] = [];
  for (const { object } of pending(ws)) {
    if (object.stale?.kind !== 'recompute') continue;
    let fresh: { value?: number; content?: string; units?: string } | null = null;
    try {
      fresh = redo(object);
    } catch {
      fresh = null;
    }
    if (!fresh) {
      failed.push(object.id);
      continue;
    }
    next = update(next, object.id, { ...fresh, stale: undefined }, 'system', at);
    done.push(object.id);
  }
  return { workspace: next, done, failed };
}
