// lib/cognition/router.ts
//
// Compatibility surface over the Core 4 decision path.
//
// This file used to BE the router: a first-match rule table whose defaults
// were Socratic (ASK when nothing had taken shape, a withholding CHALLENGE
// for any wrong attempt, HINT for all debugging) and whose question limit
// priced only the move labelled ASK. That policy is gone. The decision is now
// made in lib/core4:
//
//   allocation.ts  who does which part of the thinking, and the only reasons
//                  anything may be withheld
//   budget.ts      the question budget over ANY interrogative content, and
//                  diminishing returns
//   intervene.ts   the move, with its reason, intended outcome, what is
//                  preserved, what Socria does, and its question allowance
//
// `route()` remains so callers and tests that hold a CognitiveState can get a
// Move from the same path production uses. Pure.

import type { CognitiveState } from './state';
import { allocate } from '../core4/allocation';
import { budgetFrom, diminishingReturns } from '../core4/budget';
import { selectIntervention, renderDecision } from '../core4/intervene';
import { NO_SIGNALS } from '../core4/signals';
import { asksAnything, questionPressure } from '../core4/questions';
import { INTERVENTIONS_V2, type Allocation, type ExplicitSignals, type InterventionDecision, type InterventionType } from '../core4/types';

export const INTERVENTIONS = INTERVENTIONS_V2;
export type Intervention = InterventionType;

export interface Move {
  intervention: Intervention;
  /** what the model is being asked to achieve this turn */
  objective: string;
  /** the cognitive work that must remain the person's this turn, or null */
  withholds: string | null;
  /** why — the allocation's rationale and the decision's reason */
  because: string;
  /** may the reply hand the turn back with a question? (maxQuestions > 0) */
  endsOpen: boolean;
  /** questions the reply may put to the person */
  maxQuestions: 0 | 1;
  /** buffered and read by the Answer Guard before anybody sees it */
  guard: boolean;
  decision: InterventionDecision;
  allocation: Allocation;
}

export interface History {
  /** Socria's most recent replies in a row that put interrogative work to the person */
  questionStreak: number;
  /** share of recent replies that did (defaults from the streak) */
  density?: number;
}

export const NO_HISTORY: History = { questionStreak: 0 };

export function toMove(decision: InterventionDecision, allocation: Allocation): Move {
  return {
    intervention: decision.type,
    objective: decision.objective,
    withholds: allocation.withhold?.what ?? null,
    because: `${allocation.rationale} ${decision.reason}`.trim(),
    endsOpen: decision.maxQuestions > 0,
    maxQuestions: decision.maxQuestions,
    guard: decision.guardRequired,
    decision,
    allocation,
  };
}

export function route(
  s: CognitiveState,
  h: History = NO_HISTORY,
  signals: ExplicitSignals = NO_SIGNALS,
  contract: ExplicitSignals = NO_SIGNALS,
  considered: string[] = []
): Move {
  const diminishing = diminishingReturns(s, signals, []);
  const density = h.density ?? (h.questionStreak > 0 ? Math.min(1, h.questionStreak / 3 + 0.34) : 0);
  const budget = budgetFrom(s, signals, h.questionStreak, density, diminishing);
  const allocation = allocate({ state: s, signals, contract });
  const decision = selectIntervention({ state: s, allocation, budget, diminishing, signals, considered });
  return toMove(decision, allocation);
}

/** Does this reply put interrogative work to the person (a question, or one in disguise)? */
export function asksQuestion(text: string): boolean {
  return asksAnything(text);
}

/** How many of Socria's most recent replies in a row did. */
export function questionStreak(messages: readonly { role: string; content: string }[]): number {
  return questionPressure(messages).streak;
}

export function renderMove(m: Move): string {
  return renderDecision(m.decision, m.allocation);
}
