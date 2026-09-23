// lib/core4/merge.ts
//
// The Cognitive State, carried forward.
//
// Core 4's state used to be rebuilt from nothing every turn, from the last
// 8,000 characters of transcript, by a cheap model. A learning goal stated at
// turn 2 was gone by turn 20; an expert who said so once was re-guessed every
// turn; nothing Socria did last turn was remembered at all. This merges four
// things, with a fixed precedence, into the state the rest of the turn reads:
//
//   1. what the person said THIS turn, in so many words (signals.ts)
//   2. the standing instructions of their Project (the agency contract)
//   3. what the state was last turn (persisted per conversation)
//   4. what the reader inferred this turn
//
// EXPLICIT beats everything and persists until they say otherwise. INFERRED
// values are sticky: a new inference replaces an old one only if it is at
// least as confident, or it agrees — so one noisy reading cannot flip "this
// person is an expert" back and forth. Directness is never inferred.
//
// Pure.

import { similarity } from './considered';
import { EMPTY_STATE, type CognitiveState, type TurnMemo } from '../cognition/state';
import type { Directness, ExplicitSignals, Inferred, OutcomeReading } from './types';

const HISTORY = 8;
/** "just tell me" applies to the moment it was said in; it fades after this many turns unless restated. */
const ANSWER_REQUEST_TURNS = 2;

function explicit<T>(value: T, evidence: string): Inferred<T> {
  return { value, source: 'explicit', confidence: 1, evidence: evidence.slice(0, 120) };
}

/** Keep the stronger of two readings of the same thing. */
function sticky<T>(prior: Inferred<T> | undefined, next: Inferred<T>): Inferred<T> {
  if (!prior) return next;
  if (prior.source === 'explicit') return prior;
  if (next.source === 'explicit' || next.source === 'observed') return next;
  if (next.source === 'default') return prior;
  if (prior.source === 'default') return next;
  if (next.value === prior.value) return { ...next, confidence: Math.max(next.confidence, prior.confidence) };
  // A different inferred value must be at least as confident to replace it.
  return next.confidence >= prior.confidence ? next : prior;
}

export interface MergeInput {
  prior: CognitiveState | null;
  read: CognitiveState;
  signals: ExplicitSignals;
  contract: ExplicitSignals;
  /** was the reader actually available this turn? */
  readOk: boolean;
}

/**
 * How the last move landed, from what the person said about it. Explicit
 * statements outrank the reader's judgement; one turn is never read as more
 * than it is (confidence is capped for inferences).
 */
export function explicitOutcome(signals: ExplicitSignals, last: TurnMemo | undefined): OutcomeReading | null {
  if (!last) return null;
  const e = signals.evidence[0];
  const asked = last.questions > 0;
  if (signals.redundancy) return { label: 'WAS_REDUNDANT', confidence: 0.9, source: 'explicit', evidence: e };
  if (signals.stopQuestions) return { label: 'FRUSTRATED_USER', confidence: 0.95, source: 'explicit', evidence: e };
  if (signals.directness === 'answer' && (asked || last.withheld || ['HINT', 'QUESTION', 'CHALLENGE', 'CLARIFY'].includes(last.type)))
    return { label: 'WAS_TOO_INDIRECT', confidence: 0.9, source: 'explicit', evidence: e };
  if ((signals.tooDirect || signals.directness === 'no_answer' || signals.directness === 'guidance') && ['ANSWER', 'EXPLAIN', 'EXECUTE', 'CORRECT', 'CALCULATE'].includes(last.type))
    return { label: 'WAS_TOO_DIRECT', confidence: 0.85, source: 'explicit', evidence: e };
  if (signals.frustration) return { label: 'FRUSTRATED_USER', confidence: 0.85, source: 'explicit', evidence: e };
  if (signals.correction) return { label: 'CONFUSED_USER', confidence: 0.6, source: 'explicit', evidence: e };
  if (signals.feedback === 'positive') return { label: 'HELPED', confidence: 0.85, source: 'explicit', evidence: e };
  if (signals.feedback === 'negative') return { label: asked ? 'WAS_TOO_INDIRECT' : 'PARTIALLY_HELPED', confidence: 0.7, source: 'explicit', evidence: e };
  return null;
}

/**
 * After a long absence, momentary state is stale (council D1 gap check):
 * after 6 hours, being stuck, urgency, a momentary "just tell me", the last
 * outcome and the recent-move history no longer describe them; after 14
 * days, inferred readings also lose half their confidence. Explicit,
 * standing statements survive.
 */
export function gapCheck(prior: CognitiveState, now: number): CognitiveState {
  const last = prior.lastAt ?? now;
  const gap = now - last;
  if (gap < 6 * 3_600_000) return prior;
  const momentaryAnswer = prior.directness.value === 'answer' && prior.directness.since !== 0;
  const halve = <T>(f: Inferred<T>): Inferred<T> => (gap >= 14 * 86_400_000 && f.source === 'inferred' ? { ...f, confidence: f.confidence / 2 } : f);
  return {
    ...prior,
    stuck: 'no',
    urgency: 'none',
    directness: momentaryAnswer ? { value: 'none', source: 'default', confidence: 0 } : prior.directness,
    lastOutcome: null,
    history: [],
    learningGoal: halve(prior.learningGoal),
    expertise: halve(prior.expertise),
    stakes: halve(prior.stakes),
    authorship: halve(prior.authorship),
  };
}

export function mergeState({ prior, read, signals, contract, readOk }: MergeInput): CognitiveState {
  const p = prior ?? EMPTY_STATE;
  const turn = (prior?.turn ?? 0) + 1;
  // With no reader this turn, the inferred parts of last turn's state are the
  // best available reading — far better than an empty state that routes
  // toward asking.
  const base: CognitiveState = readOk ? read : { ...p, latest: 'other', resolved: false, newRelation: '', consideredNow: [], lastOutcome: null, work: p.work };

  // ── directness: only ever from words ──
  let directness: Inferred<Directness>;
  if (signals.directness !== 'none') {
    // "From now on, just give me answers" is standing; a bare "just tell me"
    // is about this moment (council D2). since=0 marks it standing.
    directness = { ...explicit(signals.directness, signals.evidence.join('; ')), since: signals.horizon ? 0 : turn };
  } else if (p.directness.source === 'explicit' && p.directness.value !== 'none') {
    // A standing "don't tell me" holds until they say otherwise. A "just tell
    // me" is about the moment it was said in, and fades unless restated.
    const stale = p.directness.value === 'answer' && p.directness.since !== 0 && turn - (p.directness.since ?? turn) > ANSWER_REQUEST_TURNS;
    directness = stale ? { value: 'none', source: 'default', confidence: 0 } : p.directness;
  } else if (contract.directness !== 'none') {
    directness = explicit(contract.directness, `Project: ${contract.evidence.join('; ')}`);
  } else {
    directness = { value: 'none', source: 'default', confidence: 0 };
  }

  // ── learning goal ──
  // Only STRONG practice intent ("I want to work it out myself", "let me try
  // it first", "hints only") — or a Project's standing learning contract —
  // makes the learning goal EXPLICIT, and only an explicit goal can back a
  // practice_goal withhold. "I'm studying X" or "help me understand" is
  // context: an inference at 0.7, which can shape delivery and nothing more
  // (council D2; "I'm studying the effect of statins" is not a request to be
  // quizzed).
  let learningGoal = sticky(p.learningGoal, base.learningGoal);
  if (contract.learningGoal !== null) learningGoal = explicit(contract.learningGoal ? 'yes' : 'no', `Project: ${contract.evidence.join('; ')}`);
  if (signals.learningGoal === false) learningGoal = explicit('no', signals.evidence.join('; '));
  else if (signals.practiceIntent) learningGoal = explicit('yes', signals.evidence.join('; '));
  else if (signals.learningGoal === true && learningGoal.source !== 'explicit') {
    learningGoal = sticky(learningGoal, { value: 'yes', source: 'inferred', confidence: 0.7, evidence: signals.evidence.join('; ').slice(0, 120) });
  }
  // Asking for the answer outright is evidence they are not practising THIS,
  // but not that they stopped wanting to learn — so it lowers an inferred
  // goal and leaves an explicit one alone (allocation weighs the request).
  if (signals.directness === 'answer' && learningGoal.source === 'inferred') {
    learningGoal = { ...learningGoal, confidence: Math.min(learningGoal.confidence, 0.4) };
  }

  // ── expertise ──
  let expertise = sticky(p.expertise, base.expertise);
  if (contract.expertise) expertise = explicit(contract.expertise, `Project: ${contract.evidence.join('; ')}`);
  if (signals.expertise) expertise = explicit(signals.expertise, signals.evidence.join('; '));

  // ── stakes and authorship: inferred, sticky; urgency in words raises stakes ──
  let stakes = sticky(p.stakes, base.stakes);
  if (signals.urgent && stakes.value !== 'high') stakes = { value: 'high', source: 'explicit', confidence: 1, evidence: signals.evidence.join('; ') };
  let authorship = sticky(p.authorship, base.authorship);
  if (contract.ownWork) authorship = explicit('theirs', `Project: ${contract.evidence.join('; ')}`);
  if (signals.ownWork) authorship = explicit('theirs', signals.evidence.join('; '));
  // Asking Socria to write it hands authorship over, explicitly.
  if (signals.delegate) authorship = explicit('shared', signals.evidence.join('; '));

  // "idk" is being stuck, said plainly: support goes up (council D5/D6).
  const stuck = signals.frustration ? 'frustrated' : signals.dontKnow ? 'stalled' : base.stuck;
  const questionsPreference = signals.stopQuestions ? 'stop' : signals.wantsQuestions ? 'wanted' : signals.endQuiz ? 'none' : p.questionsPreference;
  // Off the record is sticky for the conversation until they say otherwise.
  // A sensitive subject makes the conversation conversation-only, and that
  // is sticky (council D14): what is said here is not used elsewhere.
  const prev = p.persistPolicy ?? 'full';
  const persistPolicy: CognitiveState['persistPolicy'] = signals.offRecord ? 'none'
    : signals.onRecord ? (prev === 'none' ? (p.persistPolicy === 'none' && signals.sensitive ? 'conversation_only' : 'full') : prev)
    : prev === 'full' && signals.sensitive ? 'conversation_only' : prev;
  const urgency = signals.urgent ? 'high' : base.urgency;

  const lastMemo = p.history[p.history.length - 1];
  const lastOutcome = explicitOutcome(signals, lastMemo) ??
    (base.lastOutcome && lastMemo ? { ...base.lastOutcome, confidence: Math.min(base.lastOutcome.confidence, 0.7) } : null);

  // The outcome belongs to the previous turn's memo.
  const history = p.history.map((h, i) => (i === p.history.length - 1 && lastOutcome ? { ...h, outcome: lastOutcome } : h)).slice(-HISTORY);

  // Mastery shown earlier in the conversation is not forgotten because the
  // reader's window moved.
  // Near-duplicates collapse (run 5, learning-008: the same mastery restated
  // each turn filled the list).
  const masteryEvidence = [...base.masteryEvidence, ...p.masteryEvidence]
    .filter((m, i, all) => all.findIndex((x) => x === m || similarity(x, m) >= 0.8) === i)
    .slice(0, 6);

  const merged: CognitiveState = {
    ...base,
    urgency,
    directness,
    learningGoal,
    expertise,
    stakes,
    authorship,
    stuck,
    masteryEvidence,
    questionsPreference,
    persistPolicy,
    flagOnly: signals.directness === 'answer' ? false : signals.flagOnly || !!p.flagOnly,
    lastOutcome,
    history,
    turn,
  };
  return merged;
}

/** Append this turn's memo after the reply has been decided and sent. */
export function recordTurn(s: CognitiveState, memo: Omit<TurnMemo, 'turn'>): CognitiveState {
  return { ...s, history: [...s.history, { ...memo, turn: s.turn }].slice(-HISTORY) };
}
