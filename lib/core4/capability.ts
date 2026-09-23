// lib/core4/capability.ts
//
// The smallest honest Capability Model: observable evidence of what a person
// can do, per concept, and how much help preceded it.
//
// WHAT IT IS NOT. It does not estimate intelligence, aptitude or any trait.
// It never says "you are good at X". It records EVENTS — "got the chain rule
// right with no help in this conversation", "needed the answer given",
// "caught their own sign error" — each tied to a concept and a turn, each
// with a confidence, each deletable. Conclusions are drawn only by counting
// events, and only in the three separate senses that must not be conflated:
//
//   TASK PERFORMANCE      did they get this task done (session-level; evals)
//   AUGMENTED PERFORMANCE how far they got WITH Socria (assistance > 0)
//   INDEPENDENT CAPABILITY what they later do WITHOUT help on a concept they
//                         previously needed help with — and only across
//                         conversations, because correct-right-after-a-hint
//                         in the same conversation is performance, not
//                         learning (Cognitive Design Council #1, D12).
//
// Pure.

import type { CognitiveState, TurnMemo } from '../cognition/state';
import type { CapabilityEvent, CapabilityEvidence } from './types';
import { conceptTerms } from './considered';
import { ledgerId } from './ledger';
import type { CheckResult } from './verify';

/** A stable, task-scoped key for "what they were working on": a few concept terms. */
export function conceptKey(focus: string): string {
  return [...conceptTerms(focus)].slice(0, 5).sort().join(' ');
}

/** How much help the previous turn gave, as the person experienced it. */
export function assistanceOf(prev: TurnMemo | undefined): 0 | 1 | 2 | 3 {
  if (!prev) return 0;
  switch (prev.type) {
    case 'ANSWER':
    case 'CORRECT':
    case 'EXECUTE':
    case 'CALCULATE':
      return 3;
    case 'EXPLAIN':
      return 2;
    case 'VERIFY':
      return 2;
    case 'HINT':
    case 'QUESTION':
    case 'CLARIFY':
      return 1;
    default:
      return 0;
  }
}

/**
 * Evidence from this turn, if any. Conservative: only attempts and explicit
 * statements count; a model's opinion of their understanding does not.
 */
export function evidenceFromTurn(
  s: CognitiveState,
  prior: CognitiveState | null,
  ctx: { conversationId: string; turn: number; now: number },
  verify: CheckResult | null = null
): CapabilityEvidence[] {
  // Council D12: an event is recorded only on a real VERDICT — computed
  // exactly, or a checker at ≥0.85 — never the reader's opinion of their
  // attempt, and never their own say-so.
  if (!verify || verify.verdict === 'unknown' || (verify.method === 'checker' && verify.confidence < 0.85)) return [];
  const concept = conceptKey(s.currentFocus || s.currentGoal);
  if (!concept) return [];
  const prev = s.history[s.history.length - 1];
  const assistance = assistanceOf(prev);
  const out: CapabilityEvidence[] = [];
  const add = (event: CapabilityEvent, confidence: number, a: 0 | 1 | 2 | 3 = assistance) =>
    out.push({ id: ledgerId('cap', ctx.now), concept, event, assistance: a, conversationId: ctx.conversationId, turn: ctx.turn, confidence, at: ctx.now });

  {
    if (verify.verdict === 'correct') {
      if (prior?.attempt === 'wrong' && prev?.type === 'VERIFY') add('self_corrected', 0.7, 2);
      else add(assistance === 0 ? 'demonstrated_unassisted' : 'demonstrated_assisted', 0.7);
    } else {
      add('misunderstanding', 0.6, 0);
    }
  }
  // "needed_answer" was removed (council D12): asking for the answer is a
  // preference, not a deficit, and recording it as one is a privacy harm.
  return out;
}

export interface ConceptSummary {
  concept: string;
  assisted: number;
  unassisted: number;
  misunderstandings: number;
  /** unassisted success in a LATER conversation after earlier help or error on the same concept */
  independentAfterHelp: boolean;
}

/** Counting, nothing more. What the Memory page may show, and what evals read. */
export function summarize(evidence: CapabilityEvidence[]): ConceptSummary[] {
  const by = new Map<string, CapabilityEvidence[]>();
  for (const e of evidence) by.set(e.concept, [...(by.get(e.concept) ?? []), e]);
  return [...by.entries()].map(([concept, es]) => {
    const sorted = [...es].sort((a, b) => a.at - b.at);
    const helpedIn = new Set(sorted.filter((e) => e.assistance > 0 || e.event === 'misunderstanding' || e.event === 'needed_answer').map((e) => e.conversationId));
    const firstHelp = sorted.find((e) => helpedIn.has(e.conversationId));
    const independentAfterHelp = !!firstHelp && sorted.some(
      (e) => e.event === 'demonstrated_unassisted' && e.at > firstHelp.at && e.conversationId !== firstHelp.conversationId
    );
    return {
      concept,
      assisted: es.filter((e) => e.event === 'demonstrated_assisted').length,
      unassisted: es.filter((e) => e.event === 'demonstrated_unassisted' || e.event === 'self_corrected').length,
      misunderstandings: es.filter((e) => e.event === 'misunderstanding').length,
      independentAfterHelp,
    };
  });
}
