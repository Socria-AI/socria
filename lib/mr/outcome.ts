// lib/mr/outcome.ts — THE COGNITIVE OUTCOME MODEL.
//
// After a decision, did it work? The answer is six separate readings
// (OUTCOME_DIMENSIONS in lib/mr/types.ts), never summed into one score,
// because they measure different things and a sum would let one stand in for
// another: a reply that pleased somebody is not one that taught them, and a
// conversation with no friction may be one where the challenge was simply
// taken away.
//
// WHAT ONE CONVERSATION CAN MEASURE, AND WHAT IT CANNOT.
//   taskCompletion   whether the reply did, structurally, what the decision
//                    asked of it (no questions, steps, answer first, short
//                    enough, …) — a check on the text, not on its quality
//   satisfaction     their stated reaction, and only that: "thanks, that
//                    helped" is satisfaction, never evidence of learning
//   friction         counts: questions the reply asked, a repeated request,
//                    their own words of complaint, turns to useful help
//   independentPerformance
//                    an attempt of theirs decided by the engine — ONLY when
//                    the decision kept the answer back, or the attempt may
//                    just repeat what they were told; a single observation,
//                    never a capability
//   retention        needs a delayed, independent check across sessions
//   autonomy         needs a study instrument
// The last two are always 'unknown' here. Unknown is a value: nothing is
// estimated to fill it.
//
// REGULATION (keep / revert / inconclusive) is for MR's own control loop —
// whether a decision stays in force — and is never reported as a claim that
// the person improved. THE PROXY GUARD: 'keep' needs the reply to have
// delivered what was asked, structurally, and no complaint after it.
// Satisfaction is never consulted for 'keep', so "thanks!" after a reply
// that did not do what the decision required cannot keep it.
//
// WHAT COUNTS AS THE ANSWER GIVEN. A reply "gave the answer" when it says
// "the answer is …" other than to confirm their attempt ("Right, the answer
// is 56. Now 7 × 9?" keeps the next one theirs), or when it states the very
// thing they then type ("so x = 4" … "x = 4"). Either way their next attempt
// is not independent performance.
//
// Content-free: refs are turn indices, roles and codes.
//
// Pure. Deterministic. No model, no network, no clock.

import { speech } from '../core4/signals';
import { interrogatives, questionLoad, sentencesOf } from '../core4/questions';
import { paramsFor, type StrategyParams } from './config';
import type { TurnView } from './ifr';
import type { Dimension, EvidenceRef, FrictionReading, MRDecision, Observation, ObservationCode, OutcomeVector, TypedControls } from './types';

/** Words: whitespace-separated runs with a letter or a digit in them. Markdown bullets and lone symbols are not words. */
export function wordCount(text: string): number {
  let n = 0;
  for (const w of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(w)) n++;
  return n;
}

// ── did the reply do what the decision asked? ────────────────────────

/** The structural tests deliveredFor knows. */
export type DeliveryTest = 'no_questions' | 'one_question' | 'steps' | 'answer_first' | 'shorter' | 'worked_example' | 'execute' | 'preserve_challenge' | 'edit_as_asked' | 'verify';

/**
 * EvaluationPlan.expect codes that name a structural test, for a decision
 * whose action and controls alone do not (e.g. "show me the steps" decided as
 * strategy 'direct' with expect 'steps_delivered').
 */
export const DELIVERY_EXPECTS: Readonly<Record<string, DeliveryTest>> = Object.freeze({
  'questions=0': 'no_questions',
  'questions<=1': 'one_question',
  steps_delivered: 'steps',
  answer_first: 'answer_first',
  shorter: 'shorter',
  worked_example: 'worked_example',
  executed: 'execute',
  challenge_preserved: 'preserve_challenge',
  edit_as_asked: 'edit_as_asked',
  verification_stated: 'verify',
  // the policy's own names for the same tests (lib/mr/policy.ts RULES plans)
  asks_one: 'preserve_challenge',
  no_reveal: 'preserve_challenge',
  edits_only: 'edit_as_asked',
  says_what_was_checked: 'verify',
});

/**
 * What an explicit.revoke took back, as the ref code IFR puts on it
 * (lib/mr/ifr.ts IFR_REF_CODES): the question rules only ("you can ask me
 * questions again"), or every adjustment ("go back to how you were").
 */
export const REVOKE_SCOPE = Object.freeze({ questions: 'revoke.questions', all: 'revoke.all' } as const);

/** A numbered, bulleted or "Step n" line, markdown included: "1. …", "**1.** …", "- …", "### Step 1: …", "**Step 2:** …". */
export const STEP_LINE = /^\s*(?:#{1,6}\s+)?(?:\*\*|__)?(?:\d{1,2}[.)](?:\*\*|__)?\s|[-*•+]\s|step\s*\d+\b)/i;
/** Handing the work back where the decision said to do it. */
export const HANDS_BACK = /\b(?:let'?s think|what do you think|your turn|over to you|have a go|(?:can|could) you try|try (?:it|this|that) yourself|you try)\b/i;
/** Saying the answer out loud ("the answer is 63"; not "the answer isn't 54"). */
export const REVEALS_ANSWER = /\b(?:the (?:final |correct |right )?answer is(?!n'?t\b)(?!\s+not\b)|the solution is(?!n'?t\b)(?!\s+not\b)|the answer:\s)/i;
/** A sentence that confirms their attempt: "Right, …", "Correct!", "Yes — …". Not "good try, but …". */
const CONFIRMS = /^[\W_]*(?:yes|yep|yeah|right|correct|exactly|good|great|nice|perfect|spot on|well done|that'?s (?:right|correct|it)|you got it|you'?re right)\b(?!\s+(?:try|attempt|effort|guess|start|idea|thinking|question|direction))/i;
const BUT = /\b(?:but|however|not quite|actually|close|almost)\b/i;
/** A full rewrite where an edit was asked for. */
export const REWRITE = /\b(?:here'?s (?:a |the |your )?(?:rewrite|rewritten (?:version|draft|essay|text)|revised version|new version|polished version)|(?:a |the )?rewritten version|i(?:'ve| have) rewritten|i rewrote)\b/i;
/** Saying what was checked, or what could not be. */
export const STATES_CHECKED = /\b(?:i (?:checked|verified|confirmed|re-?ran|recomputed|could(?: not|n'?t) (?:check|verify|confirm))|checked|verified|confirmed|unverified|not verified|unchecked|not checked|(?:can'?t|cannot|couldn'?t|could not) (?:verify|confirm|check)|according to|sources?:)/i;

type Result = 'pass' | 'partial' | 'fail';

const lines = (reply: string) => reply.split('\n').filter((l) => STEP_LINE.test(l)).length;

/**
 * Every sentence that puts something to them: explicit, disguised, and a
 * check-in or offer ANYWHERE BUT THE CLOSE ("Step 1 … Does that make sense?
 * Step 2 …"). A decision that took questions away is judged on all of them:
 * a mid-reply check-in interrupts with a question, and a tail-only cap
 * cannot catch it. A closing offer of more help ("Want me to show the
 * working?") hands nothing back and is not counted — the stream gate drops
 * trailing offers anyway, so one is in a sent reply only when it was all
 * there was to send.
 */
export function questionsPutTo(reply: string): number {
  const q = interrogatives(reply);
  const close = last(reply);
  return q.explicit.length + q.disguised.length + q.offers.filter((o) => o !== close).length;
}

function first(reply: string): string {
  return sentencesOf(reply.trim())[0]?.trim() ?? '';
}

function last(reply: string): string {
  const s = sentencesOf(reply.trim());
  return s[s.length - 1]?.trim() ?? '';
}

function asksAt(sentence: string): boolean {
  return /\?["'’”)\]]*\s*$/.test(sentence) || questionLoad(sentence) > 0;
}

/**
 * Does the reply give the answer away? "The answer is …" counts unless the
 * sentence (or a short one right before it) confirms their attempt — a quiz
 * reply that says "Right, the answer is 56. Now, what is 7 × 9?" kept the
 * open question theirs. "Not quite — the answer is 63" gave it away.
 */
export function revealsAnswer(reply: string): boolean {
  const ss = sentencesOf(reply.trim()).map((x) => x.trim());
  return ss.some((x, i) => {
    if (!REVEALS_ANSWER.test(x)) return false;
    const confirms = (y: string) => CONFIRMS.test(y) && !BUT.test(y);
    return !(confirms(x) || (i > 0 && wordCount(ss[i - 1]) <= 4 && confirms(ss[i - 1])));
  });
}

/** Their attempt, as compared with the reply: lowercase, no spaces, no closing punctuation. */
const squash = (x: string) => x.toLowerCase().replace(/\s+/g, '').replace(/[.!?,;]+$/, '');

/**
 * Did the reply state the very thing they then typed? Only for a short
 * attempt with a digit or an operator in it (a number, an expression, an
 * equation), and only where the reply gives it as a result: after "=",
 * "is" or ":", or the whole equation ("so x = 4" … "x = 4"). Copying it back
 * is not an independent attempt.
 */
export function attemptStatedIn(reply: string, attempt: string): boolean {
  const a = squash(speech(attempt));
  if (!a || a.length > 60 || !/[\d=+*/^√]/.test(a)) return false;
  const r = squash(reply);
  if (a.includes('=')) return r.includes(a);
  return ['=', 'is', ':'].some((p) => r.includes(p + a));
}

/** The tests that apply to this decision, from its action, its controls and its expectations. */
function testsFor(d: MRDecision): DeliveryTest[] {
  const c = d.controls;
  const t = new Set<DeliveryTest>();
  if (c.questionBudget?.max === 0) t.add('no_questions');
  if (c.questionBudget?.max === 1 && d.action === 'fewer_questions') t.add('one_question');
  if (c.answerFirst || d.action === 'direct') t.add('answer_first');
  if (d.action === 'shorter' || c.verbosity) t.add('shorter');
  if (d.action === 'worked_example' || c.strategy === 'worked_example') t.add('worked_example');
  if (d.action === 'execute' || c.strategy === 'execute') t.add('execute');
  if (d.action === 'preserve_challenge' || c.strategy === 'preserve_challenge' || c.noRevealAnswers) t.add('preserve_challenge');
  if (c.strategy === 'edit_as_asked') t.add('edit_as_asked');
  if (d.action === 'verify' || c.verification === 'explicit') t.add('verify');
  for (const e of d.evaluationPlan?.expect ?? []) if (DELIVERY_EXPECTS[e]) t.add(DELIVERY_EXPECTS[e]);
  // preserve_challenge allows one question; no_questions would contradict it.
  if (t.has('preserve_challenge')) t.delete('no_questions');
  return [...t];
}

function run(test: DeliveryTest, d: MRDecision, reply: string, params: StrategyParams): Result {
  switch (test) {
    case 'no_questions':
      return questionsPutTo(reply) === 0 ? 'pass' : 'fail';
    case 'one_question':
      return questionsPutTo(reply) <= 1 ? 'pass' : 'fail';
    case 'steps':
      return lines(reply) >= 2 ? 'pass' : 'fail';
    case 'answer_first': {
      const f = first(reply);
      return f && !asksAt(f) ? 'pass' : 'fail';
    }
    case 'shorter': {
      // Words ≈ 0.75 × tokens; the decision's own ceiling, else its policy's.
      const ceiling = d.controls.verbosity?.ceilingTokens ?? params.shorterCeiling;
      return wordCount(reply) <= ceiling * 0.75 ? 'pass' : 'fail';
    }
    case 'worked_example': {
      // Numbered steps, or worked in plain words — the instruction asks for
      // "step by step in plain words" — with at least two sentences that do a
      // step of the working ("7 × 4 doubled is 56", "6 × 10 minus 6"). An
      // explanation with no working in it is partial: not what was asked,
      // not nothing either (it is not rolled back on that alone).
      if (lines(reply) >= 2 && /=|\bstep\b/i.test(reply)) return 'pass';
      const working = sentencesOf(reply).filter((x) => /\d\s*(?:[=+\-*/^×÷]|times|minus|plus|divided by|doubled|halved)|[=×÷]\s*\d/i.test(x)).length;
      if (working >= 2) return 'pass';
      return sentencesOf(reply).filter((x) => wordCount(x) >= 5).length >= 3 ? 'partial' : 'fail';
    }
    case 'execute': {
      // A closing offer ("Want me to show the working?") is not handing the
      // task back — the task is done — as it is not a question for
      // no_questions either.
      const l = last(reply);
      const offer = !!l && interrogatives(l).offers.length > 0;
      return l && (offer || !asksAt(l)) && !HANDS_BACK.test(reply) ? 'pass' : 'fail';
    }
    case 'preserve_challenge': {
      if (revealsAnswer(reply)) return 'fail';
      const n = questionLoad(reply);
      // Kept the answer back but either posed nothing or asked more than one: half done.
      return n === 1 ? 'pass' : 'partial';
    }
    case 'edit_as_asked':
      return REWRITE.test(reply) ? 'fail' : 'pass';
    case 'verify':
      return STATES_CHECKED.test(reply) ? 'pass' : 'fail';
  }
}

/** Each structural test the decision implies, and how the reply did on it. Exported for the Integrity Monitor's task_regression. */
export function deliveryChecks(decision: MRDecision, reply: string, params: StrategyParams = paramsFor(decision.policyVersion)): { test: DeliveryTest; result: Result }[] {
  const empty = !reply.trim();
  return testsFor(decision).map((test) => ({ test, result: empty ? 'fail' : run(test, decision, reply, params) }));
}

function verdictOf(checks: readonly { result: Result }[]): 'delivered' | 'partial' | 'not_delivered' | 'unknown' {
  if (!checks.length) return 'unknown';
  if (checks.every((c) => c.result === 'pass')) return 'delivered';
  if (checks.every((c) => c.result === 'fail')) return 'not_delivered';
  return 'partial';
}

/**
 * Did the reply do what the decision asked of it? Structural only: every
 * applicable test passed → 'delivered'; every one failed → 'not_delivered';
 * otherwise 'partial'. 'unknown' when no structural test exists for the
 * decision (a 'none', 'simplify' or 'more_scaffolding' decision has none:
 * whether a text is simpler is not a structural fact).
 */
export function deliveredFor(decision: MRDecision, reply: string): 'delivered' | 'partial' | 'not_delivered' | 'unknown' {
  return verdictOf(deliveryChecks(decision, reply));
}

// ── the outcome of a decision ────────────────────────────────────────

export interface OutcomeInput {
  decision: MRDecision;
  /**
   * The controls actually in force when the reply was written, when they
   * differ from the decision's own (it was one member of a composition): the
   * structural tests judge the reply against these. Everything else — what
   * their words revoke, what contradicts it — is about the decision itself.
   */
  enforced?: TypedControls;
  /** the questions in that reply were the content they asked for (a list, a draft to somebody): no question test applies */
  questionsWereContent?: boolean;
  /** the reply that followed the decision's turn */
  reply: string | null;
  /** their next turn, if it exists */
  next: TurnView | null;
  /** observeTurn at the next turn */
  nextObservations: readonly Observation[];
  params: StrategyParams;
}

/** Their own words of complaint, read from the next turn's observations. */
export const OUTCOME_COMPLAINTS: readonly ObservationCode[] = ['explicit.shorter', 'explicit.stop_questions', 'explicit.frustration', 'explicit.confused', 'explicit.negative'];

const unknown = <T>(note: string): Dimension<T> => ({ value: 'unknown', provenance: 'none', refs: [], note });

const keepsAnswerBack = (d: MRDecision) => !!d.controls.noRevealAnswers || d.action === 'guided_discovery' || d.action === 'preserve_challenge';
const keepsQuestions = (d: MRDecision) => keepsAnswerBack(d) || d.controls.strategy === 'guided' || d.controls.strategy === 'preserve_challenge';
const lowersQuestions = (d: MRDecision) => d.controls.questionBudget?.max === 0 || d.action === 'fewer_questions' || !!d.controls.questionWindow;
const shortens = (d: MRDecision) => d.action === 'shorter' || !!d.controls.verbosity;

/**
 * An explicit preference at the next turn that says the decision went the
 * wrong way: asking for questions or a quiz after MR lowered questions; for
 * more length after MR shortened; for the answer, the steps, or no questions
 * after MR held the answer back. Returns the code that contradicts, or null.
 */
export function contradictingPreference(decision: MRDecision, next: ReadonlySet<ObservationCode>): ObservationCode | null {
  if (lowersQuestions(decision)) {
    if (next.has('explicit.wants_questions')) return 'explicit.wants_questions';
    // a quiz asked for together with the answer is not a wish to be asked (MR acts on neither, and their stop stands)
    if (next.has('explicit.quiz') && !next.has('explicit.direct_answer')) return 'explicit.quiz';
  }
  if (shortens(decision) && next.has('explicit.longer')) return 'explicit.longer';
  if (keepsQuestions(decision)) {
    if (next.has('explicit.direct_answer')) return 'explicit.direct_answer';
    // "show me the steps" in a quiz is asking for the solution (the policy's
    // quiz rule is revoked by it too)
    if (next.has('explicit.show_steps')) return 'explicit.show_steps';
    if (next.has('explicit.stop_questions')) return 'explicit.stop_questions';
  }
  return null;
}

/**
 * Does their revocation take THIS decision back? "Go back to how you were"
 * takes back everything; "you can ask me questions again" takes back only a
 * decision that lowered questions — not a "keep it short" or a quiz. A
 * revocation without a scope ref (not read by IFR) is read as everything.
 */
function revokes(d: MRDecision, next: readonly Observation[]): boolean {
  const r = next.find((o) => o.code === 'explicit.revoke');
  if (!r) return false;
  const questionsOnly = r.refs.some((x) => x.code === REVOKE_SCOPE.questions) && !r.refs.some((x) => x.code === REVOKE_SCOPE.all);
  return !questionsOnly || lowersQuestions(d);
}

/**
 * What decided the regulation reading, as a code — for the State Engine's
 * endReason, and to tell a revert their own words caused (an 'explicit.*'
 * code: the decision is REVOKED) from one the outcome caused
 * ('delivery.not_delivered': it is ROLLED BACK). 'delivery.delivered' for a
 * keep; null when inconclusive.
 */
export function regulationCause(i: OutcomeInput): string | null {
  return regulate(i).cause;
}

interface Regulated {
  regulation: OutcomeVector['regulation'];
  cause: string | null;
  delivered: 'delivered' | 'partial' | 'not_delivered' | 'unknown' | null;
  codes: Set<ObservationCode>;
  complaints: ObservationCode[];
  repeats: number;
}

function regulate(i: OutcomeInput): Regulated {
  const d = i.decision;
  const codes = new Set<ObservationCode>(i.next ? i.nextObservations.map((o) => o.code) : []);
  const judged = i.enforced ? { ...d, controls: i.enforced } : d;
  const checks = i.reply === null ? [] : deliveryChecks(judged, i.reply, i.params).filter((c) => !(i.questionsWereContent && (c.test === 'no_questions' || c.test === 'one_question')));
  const delivered = i.reply === null ? null : verdictOf(checks);
  const complaints = OUTCOME_COMPLAINTS.filter((c) => codes.has(c));
  const repeats = i.next ? i.nextObservations.filter((o) => o.code === 'observed.repeated_request').length : 0;
  const base = { delivered, codes, complaints, repeats };
  // Revert on their word or a failed delivery; keep only on a delivered
  // reply with nothing said against it; otherwise wait. Satisfaction is not
  // read here at all — that is the proxy guard.
  if (i.next && revokes(d, i.nextObservations)) return { ...base, regulation: 'revert', cause: 'explicit.revoke' };
  if (codes.has('explicit.negative')) return { ...base, regulation: 'revert', cause: 'explicit.negative' };
  const against = contradictingPreference(d, codes);
  if (against) return { ...base, regulation: 'revert', cause: against };
  if (delivered === 'not_delivered') return { ...base, regulation: 'revert', cause: 'delivery.not_delivered' };
  if (i.next && delivered === 'delivered' && complaints.length === 0 && repeats === 0) return { ...base, regulation: 'keep', cause: 'delivery.delivered' };
  return { ...base, regulation: 'inconclusive', cause: null };
}

/**
 * Read the outcome of one decision from the reply that followed it and the
 * turn of theirs after that. Without a next turn, everything that rests on
 * their reaction is 'unknown', and regulation is 'inconclusive' unless the
 * reply itself failed every structural test (then 'revert': that needs no
 * reaction to see).
 */
export function evaluateOutcome(i: OutcomeInput): OutcomeVector {
  const d = i.decision;
  const at = d.issuedAtTurn;
  const next = i.next;
  const { regulation, delivered, codes, complaints, repeats } = regulate(i);
  const nextRef = (code: string): EvidenceRef => ({ turn: next!.index, role: 'user', code });

  // taskCompletion — structural, on the reply
  let taskCompletion: OutcomeVector['taskCompletion'];
  if (delivered === null) taskCompletion = unknown('no_reply');
  else if (delivered === 'unknown') taskCompletion = unknown('no_structural_test');
  else taskCompletion = { value: delivered, provenance: 'observed', refs: [{ turn: at, role: 'assistant', code: `delivery.${delivered}` }] };

  // satisfaction — their stated reaction, nothing else. Silence is not
  // neutrality: with no word either way it is unknown.
  let satisfaction: OutcomeVector['satisfaction'];
  if (!next) satisfaction = unknown('no_next_turn');
  else if (codes.has('explicit.negative')) satisfaction = { value: 'negative', provenance: 'explicit', refs: [nextRef('explicit.negative')], note: 'satisfaction_is_not_learning' };
  else if (codes.has('explicit.positive')) satisfaction = { value: 'positive', provenance: 'explicit', refs: [nextRef('explicit.positive')], note: 'satisfaction_is_not_learning' };
  else satisfaction = unknown('no_stated_reaction');

  // friction — counts over the reply and their next turn
  let friction: OutcomeVector['friction'];
  if (i.reply === null) friction = unknown('no_reply');
  else if (!next) friction = unknown('no_next_turn');
  else {
    const asked = questionsPutTo(i.reply);
    const value: FrictionReading = {
      questionsAsked: asked,
      repeatRequests: repeats,
      complaints: complaints.length,
      turnsToUseful: delivered === 'delivered' ? 0 : delivered === 'not_delivered' ? 1 : null,
    };
    const refs: EvidenceRef[] = [{ turn: at, role: 'assistant', code: `questions.${asked}` }];
    for (const c of complaints) refs.push(nextRef(c));
    if (repeats) refs.push(nextRef('observed.repeated_request'));
    friction = { value, provenance: 'observed', refs };
  }

  // independentPerformance — an engine-decided attempt, only where the answer
  // was kept back (and the reply did not give it anyway: said "the answer
  // is", or stated the very thing they then typed).
  let independentPerformance: OutcomeVector['independentPerformance'];
  const given = i.reply !== null && (revealsAnswer(i.reply) || (!!next && attemptStatedIn(i.reply, next.text)));
  if (!keepsAnswerBack(d) || given) independentPerformance = unknown('answer_may_have_been_given');
  else if (!next) independentPerformance = unknown('no_next_turn');
  else {
    const right = codes.has('observed.verified_correct');
    const wrong = codes.has('observed.verified_incorrect');
    if (right === wrong) independentPerformance = unknown(right ? 'mixed_verdicts' : 'no_decided_attempt');
    else {
      const code = right ? 'observed.verified_correct' : 'observed.verified_incorrect';
      independentPerformance = { value: right ? 'verified_correct' : 'verified_incorrect', provenance: 'observed', refs: [nextRef(code)], note: 'single_observation_not_capability' };
    }
  }

  return {
    interventionId: d.interventionId,
    turn: next ? next.index : at,
    taskCompletion,
    satisfaction,
    friction,
    independentPerformance,
    retention: unknown('needs_delayed_independent_check'),
    autonomy: unknown('needs_study_instrument'),
    regulation,
  };
}
