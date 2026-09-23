// lib/core4/trace.ts
//
// The per-turn trace: STATE → ALLOCATION → INTERVENTION → OUTCOME, as
// enums and numbers, with NO content.
//
// This is what lets the questions that matter be answered later, across
// people, without reading anybody's conversation: which interventions work
// for which kinds of work and expertise; when questioning stops helping; when
// direct explanation beats guidance; how often Socria repeats something
// already considered; what precedes frustration; whether assistance falls as
// capability grows.
//
// PRIVACY (Cognitive Design Council #1, D15): no text from the person or from
// Socria is stored here — no focus, no goal, no quotes, no evidence strings.
// Reason CODES only. The row is deleted with the account, included in the
// export, and not used for research or training without explicit consent
// (docs/CORE-4-ARCHITECTURE.md, "Privacy").
//
// Pure.

import type { CognitiveState } from '../cognition/state';
import type { Allocation, Diminishing, GuardOutcome, InterventionDecision, NoveltyVerdict, OutcomeReading, QuestionBudget } from './types';
import type { CheckResult } from './verify';

export const TRACE_VERSION = 1;

export interface TurnTrace {
  v: number;
  turn: number;
  state: {
    taskKind: string;
    work: string;
    latest: string;
    attempt: string;
    stuck: string;
    learningGoal: [string, string];
    expertise: [string, string];
    stakes: [string, string];
    directness: [string, string];
    authorship: [string, string];
    questionsPreference: string;
    readOk: boolean;
  };
  allocation: { mode: string; reasonCode: string; withhold: string | null; withholdSource: string | null; confidence: number };
  intervention: { type: string; reasonCode: string; maxQuestions: number; switchedFrom: string | null; confidence: number };
  budget: { streak: number; density: number; allowed: number };
  diminishing: { detected: boolean; count: number };
  novelty: { checked: number; redundant: number; uncertain: number; partial: number };
  guard: { action: string; codes: string[]; by: string; regenerated: boolean };
  verify: { method: string; verdict: string } | null;
  sent: { questions: number; chars: number };
  ledger: { user: number; socria: number; unknown: number; disputed: number; superseded?: number };
  considered: number;
  ms: Record<string, number>;
  models: { reply: string | null; cognition: string | null };
  versions: { prompt: string; trace: number };
}

const pair = (f: { value: string; source: string }): [string, string] => [f.value, f.source];

export function buildTrace(x: {
  state: CognitiveState;
  readOk: boolean;
  allocation: Allocation;
  decision: InterventionDecision;
  budget: QuestionBudget;
  diminishing: Diminishing;
  novelty: NoveltyVerdict[];
  guard: GuardOutcome | null;
  regenerated: boolean;
  verify: CheckResult | null;
  sentQuestions: number;
  sentChars: number;
  ledger: { user: number; socria: number; unknown: number; disputed: number; superseded?: number };
  considered: number;
  ms: Record<string, number>;
  models: { reply: string | null; cognition: string | null };
  promptVersion: string;
}): TurnTrace {
  const s = x.state;
  return {
    v: TRACE_VERSION,
    turn: s.turn,
    state: {
      taskKind: s.taskKind,
      work: s.work,
      latest: s.latest,
      attempt: s.attempt,
      stuck: s.stuck,
      learningGoal: pair(s.learningGoal),
      expertise: pair(s.expertise),
      stakes: pair(s.stakes),
      directness: pair(s.directness),
      authorship: pair(s.authorship),
      questionsPreference: s.questionsPreference,
      readOk: x.readOk,
    },
    allocation: {
      mode: x.allocation.mode,
      reasonCode: x.allocation.reasonCode,
      withhold: x.allocation.withhold?.reason ?? null,
      withholdSource: x.allocation.withhold?.source ?? null,
      confidence: x.allocation.confidence,
    },
    intervention: {
      type: x.decision.type,
      reasonCode: x.decision.reasonCode,
      maxQuestions: x.decision.maxQuestions,
      switchedFrom: x.decision.switchedFrom,
      confidence: x.decision.confidence,
    },
    budget: { streak: x.budget.streak, density: Math.round(x.budget.density * 100) / 100, allowed: x.budget.allowed },
    diminishing: { detected: x.diminishing.detected, count: x.diminishing.signals.length },
    novelty: {
      checked: x.novelty.length,
      redundant: x.novelty.filter((v) => v.verdict === 'REDUNDANT').length,
      uncertain: x.novelty.filter((v) => v.verdict === 'UNCERTAIN').length,
      partial: x.novelty.filter((v) => v.verdict === 'PARTIALLY_NOVEL').length,
    },
    guard: {
      action: x.guard?.action ?? 'ALLOW',
      codes: (x.guard?.findings ?? []).map((f) => `${f.side}:${f.code}`).slice(0, 8),
      by: x.guard?.by ?? 'none',
      regenerated: x.regenerated,
    },
    verify: x.verify ? { method: x.verify.method, verdict: x.verify.verdict } : null,
    sent: { questions: x.sentQuestions, chars: x.sentChars },
    ledger: x.ledger,
    considered: x.considered,
    ms: x.ms,
    models: x.models,
    versions: { prompt: x.promptVersion, trace: TRACE_VERSION },
  };
}

export function outcomeColumns(o: OutcomeReading | null) {
  return o ? { outcome_label: o.label, outcome_confidence: o.confidence, outcome_source: o.source } : null;
}
