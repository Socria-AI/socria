// lib/core4/budget.ts
//
// How much more asking this conversation can bear, and whether the current
// strategy has stopped paying.
//
// QUESTION BUDGET. Measured from what the person actually received (any
// interrogative work, whatever the move was called — questions.ts), not from
// move labels. When the budget is spent, NO move may put a question to the
// person this turn: not a HINT phrased as a question, not a CHALLENGE ending
// "what would happen if…?". The engine must change strategy instead.
//
// DIMINISHING RETURNS. The signals that the current way of helping has
// stopped moving the reasoning: they asked for directness or said stop;
// the last move landed as redundant or too indirect; the same family of move
// twice without progress; short answers that add nothing; saying the same
// thing again; demonstrated mastery while Socria keeps probing. Explicit
// signals are enough on their own; inferred ones need to agree.
//
// Pure.

import type { CognitiveState } from '../cognition/state';
import type { Diminishing, ExplicitSignals, QuestionBudget } from './types';
import { FRICTION_OUTCOMES } from './types';
import { questionPressure, asksAnything } from './questions';

/** Which strategy a move belongs to — what diminishing returns are measured over. */
export function familyOf(type: string): string {
  switch (type) {
    case 'QUESTION':
    case 'CLARIFY':
    case 'ASK':
      return 'asking';
    case 'HINT':
      return 'guiding';
    case 'CHALLENGE':
    case 'CRITIQUE':
      return 'pressing';
    case 'CONTRIBUTE':
    case 'CONNECT':
    case 'SYNTHESIZE':
    case 'OBSERVE':
      return 'contributing';
    case 'REFLECT':
    case 'LISTEN':
    case 'REFINE':
    case 'GET_OUT_OF_THE_WAY':
      return 'mirroring';
    default:
      return 'telling';
  }
}

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
}

function overlap(a: string, b: string): number {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

export function diminishingReturns(
  state: CognitiveState,
  signals: ExplicitSignals,
  messages: readonly { role: string; content: string }[]
): Diminishing {
  const explicit: string[] = [];
  const inferred: string[] = [];
  const last = state.history[state.history.length - 1];
  const prev = state.history[state.history.length - 2];

  if (signals.directness === 'answer') explicit.push('they asked for the answer');
  if (signals.stopQuestions) explicit.push('they asked Socria to stop asking');
  if (signals.frustration) explicit.push('they said they are frustrated or stuck');
  if (signals.redundancy) explicit.push('they said Socria repeated what they already had');

  if (state.lastOutcome && FRICTION_OUTCOMES.has(state.lastOutcome.label) && state.lastOutcome.confidence >= 0.6) {
    (state.lastOutcome.source === 'explicit' ? explicit : inferred).push(`the last move landed as ${state.lastOutcome.label}`);
  }
  if (last && prev && familyOf(last.type) === familyOf(prev.type) && familyOf(last.type) !== 'telling') {
    const progressed = [last.outcome?.label, prev.outcome?.label].some((l) => l === 'HELPED' || l === 'UNLOCKED_PROGRESS');
    if (!progressed) inferred.push(`two ${familyOf(last.type)} moves in a row without visible progress`);
  }

  // Short replies to questions, twice in a row.
  const turns = messages.slice(-5);
  let shortAnswers = 0;
  for (let i = 1; i < turns.length; i++) {
    if (turns[i].role === 'user' && turns[i - 1].role === 'assistant' && asksAnything(turns[i - 1].content)) {
      if (words(turns[i].content).length <= 4) shortAnswers++;
    }
  }
  if (shortAnswers >= 2) inferred.push('short answers to consecutive questions');

  // Their answer added nothing the state did not already hold.
  if (last && last.questions > 0 && state.latest === 'answer' && !state.newRelation && !state.consideredNow.length && !state.recentChanges.length) {
    inferred.push('the answer to the last question added nothing new');
  }

  // Saying the same thing again.
  const users = messages.filter((m) => m.role === 'user').slice(-2);
  if (users.length === 2 && overlap(users[0].content, users[1].content) >= 0.7 && words(users[1].content).length >= 4) {
    inferred.push('they repeated themselves');
  }

  // Mastery shown while Socria keeps probing.
  if ((state.attempt === 'right' || state.demonstratedUnderstanding === 'solid') && last && ['asking', 'guiding', 'pressing'].includes(familyOf(last.type))) {
    inferred.push('they have shown they have it');
  }

  const detected = explicit.length > 0 || inferred.length >= 2;
  return { detected, signals: [...explicit, ...inferred], from: detected && last ? familyOf(last.type) : null };
}

/**
 * The question budget for this turn: how many questions the reply may put to
 * the person, and why. `streak`/`density` come from the transcript
 * (questionPressure) — never from move labels.
 */
export function budgetFrom(
  state: CognitiveState,
  signals: ExplicitSignals,
  streak: number,
  density: number,
  diminishing: Diminishing,
  recent = 0
): QuestionBudget {
  const reasons: string[] = [];
  let allowed: 0 | 1 = 1;

  if (state.questionsPreference === 'stop' || signals.stopQuestions) {
    return { streak, density, allowed: 0, reasons: ['they asked Socria to stop asking questions'] };
  }
  // They asked to be quizzed: questions ARE the help, and the budget does not
  // price them — but still one at a time.
  // A quiz contract ignores streak, density and INFERRED diminishing returns
  // (council D4/D5); only their words end it (stop, just tell me, frustration).
  if (state.questionsPreference === 'wanted' && signals.directness !== 'answer' && !signals.frustration && state.stuck !== 'frustrated') {
    return { streak, density, allowed: 1, reasons: ['they asked to be quizzed'] };
  }
  if (streak >= 2) {
    allowed = 0;
    reasons.push(`${streak} replies in a row already asked something`);
  } else if (streak === 1 && density >= 0.5) {
    allowed = 0;
    reasons.push(`the last reply asked, and ${Math.round(density * 100)}% of recent replies did`);
  }
  if (diminishing.detected) {
    allowed = 0;
    reasons.push(`diminishing returns: ${diminishing.signals.join('; ')}`);
  }
  if (state.stuck === 'frustrated') {
    allowed = 0;
    reasons.push('they are frustrated');
  }
  if (signals.directness === 'answer') {
    allowed = 0;
    reasons.push('they asked for the answer');
  }
  // Outside practice, at most one question-bearing reply in any four.
  const practising = state.learningGoal.source === 'explicit' && state.learningGoal.value === 'yes';
  if (!practising && recent >= 1 && allowed === 1) {
    allowed = 0;
    reasons.push('a recent reply already asked something');
  }
  // No blocker re-grant (council D4): a missing piece is handled by
  // proceeding under a stated assumption, never by another question after
  // the budget is spent — the re-grant overrode frustration and redundancy.
  if (!reasons.length) reasons.push('no recent questioning pressure');
  return { streak, density, allowed, reasons };
}

export function questionBudget(
  state: CognitiveState,
  signals: ExplicitSignals,
  messages: readonly { role: string; content: string }[],
  diminishing: Diminishing
): QuestionBudget {
  const { streak, density, recent } = questionPressure(messages);
  return budgetFrom(state, signals, streak, density, diminishing, recent);
}
