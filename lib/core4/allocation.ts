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
  /**
   * Their actual words this turn.
   *
   * `state.currentFocus` is the cheap reader's one-line summary, and summaries
   * are uniformly abstract: it renders "write me a story" and a four-paragraph
   * brief with an audience, a deadline and a word count as similar short
   * phrases. Deciding how much of somebody's work to take over on a paraphrase
   * of what they said is exactly the wrong input. Optional, and it falls back
   * to the summary, because a caller that cannot supply it should lose the
   * distinction rather than the allocation.
   */
  lastUserText?: string;
}

type Hold = NonNullable<Allocation['withhold']>;

function sourceOf(f: Inferred<unknown>, saidNow: boolean): Hold['source'] {
  if (saidNow) return 'message';
  return f.evidence?.startsWith('Project:') ? 'project' : 'conversation';
}

// How many of their attempts in a row, under a withhold, have failed —
// counting this one.
function failedAttempts(s: CognitiveState): number {
  const wrongNow = s.attempt === 'wrong' || s.attempt === 'partial';
  let n = wrongNow ? 1 : 0;
  for (let i = s.history.length - 1; i >= 0 && wrongNow; i--) {
    const h = s.history[i];
    if (h.withheld && h.failed) n++;
    else break;
  }
  return n;
}

function alloc(
  mode: AllocationMode,
  reasonCode: string,
  rationale: string,
  confidence: number,
  humanWork: string[],
  aiWork: string[],
  withhold: Omit<Hold, 'quote' | 'alternative'> & { quote?: string; alternative?: string } | null,
  s: CognitiveState,
  generation: Allocation['generation'] = null
): Allocation {
  // The first time anything is held back in a conversation, the reply says so
  // and says how to get it. Silent withholding cannot be overridden by
  // someone who does not know it is happening. An analogous worked example
  // is on offer only once they are stuck: for someone who asked to fight the
  // problem, an example that maps one-to-one onto it is the answer (council
  // D6's ladder; run 3, debugging-005). Repeated failure bottoms out anyway.
  const w: Hold | null = withhold
    ? {
        ...withhold,
        quote: (withhold.quote ?? withhold.evidence ?? '').slice(0, 200),
        alternative: withhold.alternative ?? (s.stuck === 'frustrated' || s.stuck === 'looping'
          ? 'everything around it — the method, where their attempt goes wrong, an analogous worked example — and the full answer the moment they ask for it'
          : 'everything around it — the principle, whether their attempt is right and where it goes wrong — and the full answer the moment they ask for it'),
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
  return { mode, reasonCode, rationale, confidence: Math.round(Math.min(1, confidence) * 100) / 100, humanWork, aiWork, withhold: hold, announce, generation };
}

// ── IS THIS A REQUEST TO PRODUCE SOMETHING, AND DOES IT SAY WHAT? ────
//
// THE FAILURE THIS FIXES. "Write me a story" produced a long generic story.
// Every layer behaved as designed: nothing was withheld (correct — council D6
// withholds only on an explicit statement), the move was ANSWER (correct —
// they asked), and the ceiling was 1200 (a request, and requests get the full
// ceiling). The gap was that no layer asked the question Human-First exists to
// ask: would producing this take over the work that was the point?
//
// It is NOT a withhold and NOT a refusal. Nothing is held back and nothing is
// declined; the reply still contains real work. What changes is its SIZE:
// enough to be useful immediately, not a finished artifact built on a guess
// about what somebody wanted.
//
// AND IT MUST NOT BECOME A GATE ON EVERY GENERATIVE TURN. The failure on the
// other side is on record from runs 4-6 — an expert asking for a thing and
// getting an interview instead. So delegation is honoured, a request that
// carries its own brief is honoured, and only a bare imperative with nothing
// to determine the artifact gets the smaller first move.

/** Asking Socria to PRODUCE an artifact, rather than to answer, fix or explain. */
// NOT `build`: "why does this build keep failing" is a debugging turn, and a
// verb that is more often a noun in this product's traffic costs more than it
// earns. "Build me a X" still reaches this through `make`.
const PRODUCE = /\b(?:write|draft|compose|create|generate|make|design|come up with|put together|produce|script|outline)\b/i;

/**
 * Transformations of material they already have. "Summarise this", "rewrite my
 * intro", "translate it" — the artifact is determined by the thing in front of
 * them, so there is nothing to be unscoped about.
 */
const TRANSFORM = /\b(?:summari[sz]e|rewrite|revise|edit|shorten|tighten|translate|reformat|convert|proofread|fix)\b/i;

/**
 * They said the OUTPUT is what they want. Deliberately narrow, and "for me"
 * is deliberately NOT on it: "write an email for me" is the everyday phrasing
 * of an ordinary ask, not a statement that they want no part in it.
 */
const DELEGATED = /\b(?:just (?:need|want|give|write|do|make)|i (?:just )?need (?:the )?(?:finished|final|full|complete|whole)|finished (?:thing|version|piece|draft)|final (?:version|draft|copy)|ready to (?:send|ship|post|publish)|don'?t ask|no questions|you (?:decide|choose|pick)|your (?:call|choice)|whatever you think|as you see fit|i don'?t (?:care|mind)|do it all)\b/i;

/**
 * The things people ask to have made. Needed because the verb alone is not
 * enough in either direction: "help me figure out why this build fails" is a
 * debugging turn that happens to start with "help me figure", and answering it
 * with three directions instead of the fix would be the same failure in the
 * opposite direction.
 */
const ARTIFACT = /\b(?:story|essay|email|e-?mail|post|article|letter|message|draft|script|poem|speech|pitch|proposal|outline|chapter|blurb|caption|copy|bio|r[ée]sum[ée]|resume|cv|cover letter|presentation|deck|slides?|paper|report|memo|ad|advert|tagline|headline|premise|idea|concept|angle|argument|analysis|case|newsletter|thread|plan|curriculum|syllabus|agenda|itinerary|recipe|song|lyrics?|novel|screenplay)\b/i;

/** The authorship is the activity: they asked to work on it, not to receive it. */
const DEVELOP = /\b(?:help me (?:develop|think|work|figure|brainstorm|plan|shape|structure|decide)|think (?:this |it )?through|brainstorm|work (?:this |it )?out with me|bounce|develop (?:my|this|the|a|an) (?:idea|thought|argument|concept|angle|premise)|what do you think (?:about|of) my)\b/i;

/** Things that pin an artifact down: who it is for, how long, how many, about what. */
const DETERMINERS = [
  /\b(?:for|to) (?:my|our|a|an|the) [a-z]/i,           // an audience or a recipient
  /\b(?:about|on|regarding|covering|re:) \w/i,          // a subject
  /\b\d+\b|\b(?:two|three|four|five|six|ten)\b/i,       // a count or a length
  /\b(?:words?|paragraphs?|pages?|sentences?|lines?|minutes?|slides?)\b/i,
  /\b(?:because|so that|in order to|they need|we need|deadline|due)\b/i, // a purpose
  /["“”']{1}[^"“”']{8,}["“”']{1}/,                       // material they quoted
  /```|\n\s*[-*]\s+\w/,                                 // pasted material or a list of givens
];

/**
 * How much of what determines the artifact is actually in the message.
 *
 * Exported because it is the whole judgement, and a judgement that decides how
 * much of somebody's work Socria takes over should be readable on its own and
 * testable without a model.
 */
export function generationRead(text: string, signals: ExplicitSignals, s: CognitiveState): Allocation['generation'] {
  const t = (text ?? '').trim();
  if (!t) return null;
  // IS THIS EVEN A TURN ABOUT MAKING SOMETHING? Everything below is silent
  // otherwise, which is what keeps this out of the way of the debugging,
  // judgement, practice and information turns that are most of the product.
  if (!PRODUCE.test(t) && !TRANSFORM.test(t) && !ARTIFACT.test(t)) return null;
  // Work they are checking, practising or debugging is not a generative ask,
  // whatever verb it happens to contain. The state knows; the words do not.
  if (s.work === 'diagnosis' || s.taskKind === 'debug' || s.work === 'verification' || s.work === 'practice' || s.latest === 'attempt') return null;

  // Their words first, always. "Just tell me", "stop asking me questions" and
  // "I just need the finished thing" are instructions about this exact
  // behaviour, and an instruction outranks any reading of the request.
  if (DELEGATED.test(t) || signals.directness === 'answer' || signals.stopQuestions) return 'delegated';
  // Developing needs an artifact in the sentence, not only the words "help me
  // think": "help me figure out why this keeps failing" is a debugging turn
  // wearing the same opening, and answering it with three directions instead
  // of the fix is the same failure pointed the other way.
  if (DEVELOP.test(t) && ARTIFACT.test(t)) return 'developing';
  // A transformation of material they supplied is scoped by the material.
  if (TRANSFORM.test(t)) return 'scoped';
  if (!PRODUCE.test(t)) return null;
  if (s.attempt !== 'none') return 'scoped';
  const determiners = DETERMINERS.filter((re) => re.test(t)).length;
  // A subject alone is thin but real ("write a competitive analysis of the EV
  // market" is not the same ask as "write me a story"), so one determiner plus
  // some length counts as scoped. Nothing at all does not.
  const words = t.split(/\s+/).length;
  if (determiners >= 2 || (determiners >= 1 && words >= 12)) return 'scoped';
  return 'unscoped';
}

/**
 * The read reaches every branch, not only the two that act on it.
 *
 * A generative ask does not always arrive classified as creation: "help me
 * think through what this email should say" reads as conversation, and the
 * branch that answers it would otherwise carry `generation: null` and the
 * intervention engine would never know the turn was about making something.
 * So the body decides, and anything it left unset takes the read.
 */
export function allocate(ctx: Ctx): Allocation {
  const a = allocateFor(ctx);
  if (a.generation !== null) return a;
  const gen = generationRead(ctx.lastUserText ?? ctx.state.currentFocus ?? '', ctx.signals, ctx.state);
  return gen === null ? a : { ...a, generation: gen };
}

function allocateFor({ state: s, signals, contract, lastUserText }: Ctx): Allocation {
  const gen = generationRead(lastUserText ?? s.currentFocus ?? '', signals, s);
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
  if (((signals.vent && s.latest !== 'question' && s.latest !== 'request') || s.heardOnly) && directness !== 'no_answer' && directness !== 'guidance') {
    return alloc('HUMAN_REFLECTS', 'reflect.heard', 'They are thinking out loud or want to be heard; Socria follows.', 0.7,
      ['their own processing'], ['precise acknowledgement', 'at most one observation'], null, s);
  }

  // The practice ladder bottoms out after two failed attempts: a full
  // worked solution with the principle labelled, then the next item is
  // theirs again (council D6). Endless hints are not help.
  const failedRun = failedAttempts(s);
  const bottomOut = failedRun >= 3 || (failedRun >= 2 && (signals.dontKnow || frustrated));
  const withholdable = !bottomOut;

  // ── an explicit request NOT to be given the answer (now, earlier, or Project) ──
  // Scoped to working a problem: a standing "don't tell me" never covers a
  // plain fact, a definition or mechanical work they ask for (council D6).
  const plainAsk = (s.work === 'information' || s.work === 'execution') && !directnessNow;
  if ((directness === 'no_answer' || directness === 'guidance') && !plainAsk) {
    const source = sourceOf(s.directness, directnessNow);
    const reason: WithholdReason = source === 'project' ? 'agency_boundary' : 'requested_no_answer';
    // Several attempts have not landed. Under THEIR explicit "don't tell
    // me", the ladder no longer bottoms out into the solution on its own:
    // run 5's judges, reading as the person, marked that as overreach every
    // time (learning-002, learning-009) while the baseline stayed inside the
    // boundary. The strongest support inside it — an analogous worked
    // example or the next step outright — and a plain reminder that the full
    // answer is theirs the moment they ask (council D6, the Agency
    // Advocate's position over the hard cap).
    // Only for a boundary they drew: "don't tell me" or "hints ONLY" — not a
    // one-off "give me a hint", which still bottoms out (review before run 6).
    const boundary = directness === 'no_answer' || /\b(?:hints? only|only (?:a )?hints?|just hints|no (?:answers?|solutions?|spoilers))\b/i.test(s.directness.evidence ?? '');
    if (!withholdable && !boundary) {
      return alloc('AI_EXPLAINS', 'practice.bottom_out',
        'Several attempts on this item have not landed: work it fully, with the principle named, and give the next item back to them.', 1,
        ['the next item'], ['the worked solution'], null, s);
    }
    if (!withholdable) {
      return alloc('HUMAN_PRACTICES', `${reason}.stuck`,
        'Several attempts have not landed, and they asked to keep it: much stronger support inside that boundary, and the full answer the moment they ask.', 1,
        ['the final step'], ['an analogous worked example', 'the next step outright'],
        { what: 'the final answer and the full fix', reason, evidence: s.directness.evidence ?? '', source,
          alternative: 'an analogous worked example or the next step outright, and the full answer the moment they ask for it' }, s);
    }
    // "I'm lost" inside the boundary: much stronger support now, verdict first
    // (run 6, learning-020: another discovery exercise after "I'm lost now"
    // drove "just give me the whole thing").
    if (signals.dontKnow && s.attempt !== 'right') {
      return alloc('HUMAN_PRACTICES', `${reason}.stuck`,
        'They said they are lost, and they asked to keep it: much stronger support inside that boundary, and the full answer the moment they ask.', 1,
        ['the final step'], ['an analogous worked example', 'the next step outright'],
        { what: 'the final answer and the full fix', reason, evidence: s.directness.evidence ?? '', source,
          alternative: 'an analogous worked example or the next step outright, and the full answer the moment they ask for it' }, s);
    }
    // Verification first: an attempt under "hints only" still hears whether it is right.
    if (s.latest === 'attempt' || s.attempt !== 'none') {
      return alloc('AI_VERIFIES', s.attempt === 'right' ? 'verify.confirm' : 'verify.practice',
        s.attempt === 'right' ? 'Their attempt is right: say so first and why.' : 'They asked not to be told: say whether it is right and exactly where and what kind of error; the redo is theirs.',
        1, s.attempt === 'right' ? [] : ['the corrected answer'], ['the verdict', 'where and what kind of error'],
        s.attempt === 'right' ? null : { what: 'the corrected answer, and the corrected step, code or setup that produces it', reason, evidence: s.directness.evidence ?? '', source }, s);
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
    if (ownWorkExplicit) {
      return alloc('HUMAN_LEADS', 'creation.theirs', 'They said the work must stay theirs: specific critique and options, not a rewrite.',
        1, ['the text itself'], ['critique', 'options', 'craft knowledge'],
        { what: 'a replacement version of their work', reason: 'authorship', evidence: s.authorship.evidence ?? '', source: sourceOf(s.authorship, signals.ownWork) }, s, 'developing');
    }
    // How much of the work would producing it be? See generationRead.
    if (gen === 'delegated') {
      return alloc('AI_EXECUTES', 'creation.delegated', 'They said the finished thing is what they want: make it.', 0.9,
        [], ['the artifact itself'], null, s, 'delegated');
    }
    if (gen === 'developing') {
      return alloc('AI_ASSISTS', 'creation.developing', 'They asked to develop it, not to receive it: build on what they have and give them something to push against.', 0.8,
        ['the piece itself'], ['material to work with', 'options', 'craft knowledge'], null, s, 'developing');
    }
    if (gen === 'unscoped') {
      return alloc('AI_ASSISTS', 'creation.unscoped',
        'A request to make something, with nothing in it that decides what the thing should be: a small real start, and the one thing that would settle the rest.',
        0.7, ['what it is for and what it must carry'], ['a small real piece of it', 'the question that decides the rest'], null, s, 'unscoped');
    }
    return alloc('AI_ASSISTS', 'creation.shared', 'Making something: Socria drafts, develops or critiques as asked; they steer.', 0.6,
      ['direction'], ['drafting', 'developing', 'critique'], null, s, gen ?? 'scoped');
  }

  // ── the machinery ──
  if (s.work === 'information' || s.taskKind === 'lookup') {
    return alloc('AI_EXECUTES', 'information', 'Information: provide it.', 0.9, [], ['the information'], null, s);
  }
  if (s.work === 'execution') {
    // The same read applies here, because the reader does not always call a
    // request to make something "creation": "write me a script", "make me a
    // table" arrive as execution, and a bare imperative with nothing to
    // determine the artifact is the same guess whatever the label on it.
    if (gen === 'unscoped') {
      return alloc('AI_ASSISTS', 'creation.unscoped',
        'A request to make something, with nothing in it that decides what the thing should be: a small real start, and the one thing that would settle the rest.',
        0.7, ['what it is for and what it must carry'], ['a small real piece of it', 'the question that decides the rest'], null, s, 'unscoped');
    }
    return alloc('AI_EXECUTES', 'execution', 'Mechanical work: do it.', 0.9, [], ['the work'], null, s, gen);
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
