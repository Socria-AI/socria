// lib/core4/allocation.ts
//
// CognitiveAllocation: before choosing HOW to intervene, decide WHO does
// which part of the thinking this turn.
//
// THE FAILURE IT FIXES. The old router decided allocation implicitly, and its
// implicit answer was "the human thinks": a wrong attempt meant the
// correction was withheld, debugging meant a hint instead of the fix, an open
// request meant a question. Human-First had been turned into "do not answer",
// which is the cheapest thing to implement and the least valuable.
//
// THE RULE (Cognitive Design Council #1, D6). Socria performs the work by
// default. Work stays with the person only when THEY have said so, for one of
// five reasons (types.ts WITHHOLD_REASONS): they are deliberately practising
// it, they asked not to be told, the product must be their own, it is graded
// work they will submit, or their Project's standing instructions say so. The
// source must be EXPLICIT — their words now, their words earlier in this
// conversation, or the Project. An inference ("looks like homework", "seems
// to want to learn") never withholds anything; at most it shapes delivery.
//
// The error costs are asymmetric: wrongly withholding from an expert costs
// their trust and their time; wrongly answering a learner costs one practice
// opportunity, recoverable on the next problem.
//
// AGENCY INCLUDES THE RIGHT TO DELEGATE. An explicit "just tell me" or
// "write it for me" beats everything except graded work they will submit —
// and even then Socria explains the method fully and says why. The latest
// explicit statement wins over a standing Project instruction, and the
// rationale records the override.
//
// Pure.

import type { CognitiveState } from '../cognition/state';
import type { Allocation, AllocationMode, ExplicitSignals, Inferred, WithholdReason } from './types';

interface Ctx {
  state: CognitiveState;
  signals: ExplicitSignals;
  contract: ExplicitSignals;
}

type Hold = NonNullable<Allocation['withhold']>;

function sourceOf(f: Inferred<unknown>, saidNow: boolean): Hold['source'] {
  if (saidNow) return 'message';
  return f.evidence?.startsWith('Project:') ? 'project' : 'conversation';
}

function alloc(
  mode: AllocationMode,
  reasonCode: string,
  rationale: string,
  confidence: number,
  humanWork: string[],
  aiWork: string[],
  withhold: Omit<Hold, 'quote' | 'alternative'> & { quote?: string; alternative?: string } | null,
  s: CognitiveState
): Allocation {
  // The first time anything is held back in a conversation, the reply says so
  // and says how to get it. Silent withholding cannot be overridden by
  // someone who does not know it is happening.
  const w: Hold | null = withhold
    ? {
        ...withhold,
        quote: (withhold.quote ?? withhold.evidence ?? '').slice(0, 200),
        alternative: withhold.alternative ?? 'everything around it — the method, where their attempt goes wrong, an analogous worked example — and the full answer the moment they ask for it',
      }
    : null;
  let hold = w;
  // Council D6: a withhold must rest on their words and offer an
  // alternative. Without a quote it is not a withhold at all — in tests that
  // is a bug to fail loudly on; in production it degrades to helping.
  if (hold && !hold.quote.trim()) {
    if (process.env.NODE_ENV === 'test' || process.env.CORE4_STRICT === '1') throw new Error(`withhold without a quote: ${reasonCode}`);
    hold = null;
  }
  const announce = !!hold && !s.history.some((h) => h.withheld);
  return { mode, reasonCode, rationale, confidence: Math.round(Math.min(1, confidence) * 100) / 100, humanWork, aiWork, withhold: hold, announce };
}

export function allocate({ state: s, signals, contract }: Ctx): Allocation {
  const expertInferred = s.expertise.value === 'expert' && (s.expertise.source !== 'inferred' || s.expertise.confidence >= 0.6);
  const learningExplicit = s.learningGoal.source === 'explicit' && s.learningGoal.value === 'yes';
  const ownWorkExplicit = s.authorship.source === 'explicit' && s.authorship.value === 'theirs';
  const directness = s.directness.value;
  const directnessNow = signals.directness !== 'none';
  const frustrated = s.stuck === 'frustrated' || s.stuck === 'looping';
  const attemptingProblem = s.latest === 'attempt' || s.attempt !== 'none' || s.work === 'practice' || s.work === 'verification';

  // ── the safety gate: harm now overrides every contract, and only ever
  // produces MORE help (council D1). A hints-only Project does not apply to
  // "my 2-year-old swallowed a button battery".
  if (signals.safety) {
    return alloc('AI_EXECUTES', 'safety', 'Possible harm now: clear, immediate, direct instructions; every contract is suspended for this.', 1,
      [], ['immediate direct instructions', 'when to call emergency services'], null, s);
  }

  // ── an explicit request for the answer / for the work ── (evaluated before
  // "being heard": "just tell me" in a venting message is still a request —
  // council D2)
  if (directness === 'answer' || signals.delegate) {
    if (signals.assessment || contract.assessment) {
      return alloc('AI_EXPLAINS', 'answer.requested.assessment',
        'They asked for the answer to graded work they will submit as their own; Socria explains the method fully, works an analogous example, and says once why it holds back the submittable answer.',
        1, ['the submittable answer to the graded item'], ['the full method', 'an analogous worked example', 'checking their attempt'],
        { what: 'the submittable answer to the graded item', reason: 'assessment_integrity', evidence: signals.evidence.join('; '), source: signals.assessment ? 'message' : 'project' }, s);
    }
    const override = contract.directness === 'no_answer' || contract.directness === 'guidance';
    return alloc(signals.delegate ? 'AI_EXECUTES' : s.work === 'explanation' ? 'AI_EXPLAINS' : 'AI_EXECUTES',
      override ? 'answer.requested.overrides_contract' : 'answer.requested',
      override
        ? 'They asked for the answer now; their latest explicit instruction overrides the Project’s standing "hints only".'
        : 'They asked for the answer (or for Socria to do it); their right to delegate wins.',
      1, [], ['the answer / the work', 'the reasoning that matters for using it'], null, s);
  }

  // ── being heard — only when they SAID so (run 1: an inferred "reflection"
  // gave four turns of acknowledgement to someone who wanted a plan; the
  // baseline simply helped). An inference never narrows help.
  if (signals.vent && directness !== 'no_answer' && directness !== 'guidance') {
    return alloc('HUMAN_REFLECTS', 'reflect.heard', 'They are thinking out loud or want to be heard; Socria follows.', 0.7,
      ['their own processing'], ['precise acknowledgement', 'at most one observation'], null, s);
  }

  // How many of their attempts in a row, under a withhold, have failed —
  // counting this one. The practice ladder bottoms out after two: a full
  // worked solution with the principle labelled, then the next item is
  // theirs again (council D6). Endless hints are not help.
  const wrongNow = s.attempt === 'wrong' || s.attempt === 'partial';
  let failedRun = wrongNow ? 1 : 0;
  for (let i = s.history.length - 1; i >= 0 && wrongNow; i--) {
    const h = s.history[i];
    if (h.withheld && h.failed) failedRun++;
    else break;
  }
  const bottomOut = failedRun >= 3 || (failedRun >= 2 && (signals.dontKnow || frustrated));
  const withholdable = !bottomOut;

  // ── an explicit request NOT to be given the answer (now, earlier, or Project) ──
  // Scoped to working a problem: a standing "don't tell me" never covers a
  // plain fact, a definition or mechanical work they ask for (council D6).
  const plainAsk = (s.work === 'information' || s.work === 'execution') && !directnessNow;
  if ((directness === 'no_answer' || directness === 'guidance') && !plainAsk) {
    const source = sourceOf(s.directness, directnessNow);
    const reason: WithholdReason = source === 'project' ? 'agency_boundary' : 'requested_no_answer';
    if (!withholdable) {
      return alloc('AI_EXPLAINS', 'practice.bottom_out',
        'Several attempts on this item have not landed: work it fully, with the principle named, and give the next item back to them.', 1,
        ['the next item'], ['the worked solution'], null, s);
    }
    // Verification first: an attempt under "hints only" still hears whether it is right.
    if (s.latest === 'attempt' || s.attempt !== 'none') {
      return alloc('AI_VERIFIES', s.attempt === 'right' ? 'verify.confirm' : 'verify.practice',
        s.attempt === 'right' ? 'Their attempt is right: say so first and why.' : 'They asked not to be told: say whether it is right and exactly where and what kind of error; the redo is theirs.',
        1, s.attempt === 'right' ? [] : ['the corrected answer'], ['the verdict', 'where and what kind of error'],
        s.attempt === 'right' ? null : { what: 'the corrected final answer', reason, evidence: s.directness.evidence ?? '', source }, s);
    }
    return alloc('HUMAN_PRACTICES', frustrated ? `${reason}.stuck` : reason,
      frustrated
        ? 'They asked not to be told, and they are stuck: much stronger support inside that boundary.'
        : directness === 'guidance' ? 'They asked for hints, not the answer.' : 'They asked not to be given the answer.',
      1, ['producing the answer'], frustrated ? ['an analogous worked example', 'the next step outright'] : ['checking, pointing, hinting'],
      { what: 'the answer', reason, evidence: s.directness.evidence ?? '', source }, s);
  }

  // ── they did it; check it ── (not for creative work or judgement, which
  // gets critique, never "the correct version" — run 1, creative-002)
  const openWork = s.work === 'creation' || s.work === 'judgment' || s.taskKind === 'create' || s.taskKind === 'decide';
  if (!openWork && (s.work === 'verification' || (s.latest === 'attempt' && s.attempt !== 'none'))) {
    // Practising on purpose — said so, explicitly — keeps the redo. Everyone
    // else gets the correction. Frustration ends the holding back.
    if (learningExplicit && s.attempt !== 'right' && !frustrated && withholdable) {
      return alloc('AI_VERIFIES', 'verify.practice',
        'They said they are learning this: Socria says whether it is right and exactly where it goes wrong, and leaves the redo to them.',
        1, ['the corrected answer'], ['the verdict', 'where and what kind of error'],
        { what: 'the corrected final answer', reason: 'practice_goal', evidence: s.learningGoal.evidence ?? '', source: sourceOf(s.learningGoal, signals.learningGoal === true) }, s);
    }
    return alloc('AI_VERIFIES', s.attempt === 'right' ? 'verify.confirm' : 'verify.correct',
      s.attempt === 'right'
        ? 'Their attempt is right: say so plainly and specifically.'
        : 'A wrong or partial attempt gets the correction: where it goes wrong and what is right.',
      0.8, [], ['the verdict', 'the correction'], null, s);
  }

  // ── they are practising, said so, and are working a problem ──
  if (learningExplicit && attemptingProblem && s.work === 'practice') {
    if (frustrated || !withholdable) {
      return alloc('AI_EXPLAINS', 'practice.stuck', 'They are learning but stuck and frustrated: explain this one; practice resumes on the next problem.',
        1, ['applying it to the next problem'], ['the explanation'], null, s);
    }
    return alloc('HUMAN_PRACTICES', 'practice.goal', 'They said they are learning this and are working a problem: producing it is the point.',
      1, ['producing the answer'], ['support at the exact point they are stuck'],
      { what: 'the answer', reason: 'practice_goal', evidence: s.learningGoal.evidence ?? '', source: sourceOf(s.learningGoal, signals.learningGoal === true) }, s);
  }

  // ── judgement: the decision stays theirs; information does not ──
  if (s.work === 'judgment' || s.taskKind === 'decide') {
    return alloc('HUMAN_LEADS', 'judgment.theirs',
      'The decision is theirs: Socria surfaces evidence, assumptions, tradeoffs and what they have not considered, and gives its view if asked.',
      0.75, ['the decision'], ['evidence', 'tradeoffs', 'what is missing'], null, s);
  }

  // ── creation: their work stays theirs when they have said so ──
  if (s.work === 'creation' || s.taskKind === 'create') {
    return ownWorkExplicit
      ? alloc('HUMAN_LEADS', 'creation.theirs', 'They said the work must stay theirs: specific critique and options, not a rewrite.',
          1, ['the text itself'], ['critique', 'options', 'craft knowledge'],
          { what: 'a replacement version of their work', reason: 'authorship', evidence: s.authorship.evidence ?? '', source: sourceOf(s.authorship, signals.ownWork) }, s)
      : alloc('AI_ASSISTS', 'creation.shared', 'Making something: Socria drafts, develops or critiques as asked; they steer.', 0.6,
          ['direction'], ['drafting', 'developing', 'critique'], null, s);
  }

  // ── the machinery ──
  if (s.work === 'information' || s.taskKind === 'lookup') {
    return alloc('AI_EXECUTES', 'information', 'Information: provide it.', 0.9, [], ['the information'], null, s);
  }
  if (s.work === 'execution') {
    return alloc('AI_EXECUTES', 'execution', 'Mechanical work: do it.', 0.9, [], ['the work'], null, s);
  }
  if (s.work === 'diagnosis' || s.taskKind === 'debug') {
    return alloc(expertInferred || s.urgency === 'high' ? 'AI_EXECUTES' : 'AI_EXPLAINS', 'diagnosis.fix',
      'Something is broken: the fix, and why it works.', 0.8, [], ['the diagnosis', 'the fix'], null, s);
  }
  if (s.work === 'explanation') {
    return alloc('AI_EXPLAINS', 'explanation', 'They asked how or why: explain.', 0.85, [], ['the explanation'], null, s);
  }
  if (s.work === 'research') {
    return alloc('SHARED_REASONING', 'research.interpretation',
      'Research: Socria supplies what it knows and says what it cannot verify; interpretation stays with them.', 0.7,
      ['interpreting the evidence'], ['information', 'methods', 'what is uncertain'], null, s);
  }
  if (s.work === 'practice' && !learningExplicit) {
    // It looks like practice but they never said so: help, do not withhold.
    return alloc('AI_EXPLAINS', 'practice.unconfirmed',
      'It looks like a practice problem, but they have not said they want to work it themselves: help fully.', 0.6,
      [], ['the explanation', 'the solution'], null, s);
  }

  // ── thinking together ──
  return alloc('SHARED_REASONING', 'shared',
    'Thinking together: Socria contributes what they have not already considered and does not re-ask what they have.', 0.6,
    ['their line of thought'], ['contribution', 'connection', 'critique'], null, s);
}
