// lib/cognition/guard.ts
//
// Compatibility surface over Answer Guard 2.0 (lib/core4/guard2.ts).
//
// The first guard asked one question — did the draft give away what the move
// withheld? — and ran only on "guarded" moves. Guard 2.0 looks both ways
// (overreach AND underhelp), plus novelty and voice, on every Core 4 reply.
// This file keeps the old names for callers that hold a Move.
//
// Pure.

import type { Move } from './router';
import { guardStructure, looksWorked as worked, givesThenAsks as gives } from '../core4/guard2';
import type { GuardOutcome } from '../core4/types';

export type GuardVerdict = 'approve' | 'revise' | 'regenerate';

export interface GuardResult {
  verdict: GuardVerdict;
  reason: string;
  revised?: string;
  by: 'structure' | 'model' | 'none';
  outcome?: GuardOutcome;
}

export const APPROVED: GuardResult = { verdict: 'approve', reason: '', by: 'none' };

export const looksWorked = worked;
export const givesThenAsks = gives;

/** The deterministic guard, in the old vocabulary. Null when it has no opinion. */
export function checkStructure(move: Move, draft: string, considered: string[] = []): GuardResult | null {
  const g = guardStructure({ decision: move.decision, allocation: move.allocation, draft, considered });
  if (g.action === 'ALLOW') return null;
  const reason = g.findings.map((f) => f.detail).join(' ') || g.action;
  if (g.revised) return { verdict: 'revise', reason, revised: g.revised, by: 'structure', outcome: g };
  return { verdict: 'regenerate', reason: g.retryNote ?? reason, by: 'structure', outcome: g };
}

/** The draft with closing questions removed; null if nothing would be left. */
export { stripInterrogatives } from '../core4/questions';
