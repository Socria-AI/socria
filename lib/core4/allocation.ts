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
  ownership: Allocation['ownership'] = null
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
  return { mode, reasonCode, rationale, confidence: Math.round(Math.min(1, confidence) * 100) / 100, humanWork, aiWork, withhold: hold, announce, ownership };
}

// ── WHOSE WORK IS THIS? ──────────────────────────────────────────────
//
// THE FAILURE THIS FIXES. "Make a story" produced a whole story. Every layer
// behaved as designed: nothing was withheld (correct — council D6 withholds
// only on an explicit statement, and "you probably wanted to write this
// yourself" is exactly the paternal inference the allocator exists to stop),
// the move was ANSWER (correct — they asked), and the ceiling was the full one
// (a request, and requests are exempt from the length policy). No layer asked
// the question Human-First exists to ask: IS THIS PERSON HANDING ME THIS WORK,
// OR DOING IT?
//
// SELECTIVE COGNITIVE OFFLOADING, which is the whole point. Socria can do
// enormous amounts of work and should. What it must not do is take over
// cognition somebody meant to exercise, by accident, because their sentence
// was short. Those are different failures with different costs: doing work
// that was offered costs nothing, and doing work that was not costs them the
// thing they came for.
//
// SO IT IS A QUESTION ABOUT OWNERSHIP, NOT ABOUT SCOPE. "Yours, or mine?" is
// one line and settles it. A scope interview ("who is it for? how long?
// what tone?") is four lines and settles something they may not have decided
// yet — and is how a helpful system becomes an exhausting one.
//
// AND IT FIRES ON ALMOST NOTHING. Three gates stand in front of it: the work
// has to be substantial (COGNITIVE below — a lookup, a conversion, a format
// fix never reaches it), the ownership has to be genuinely unclear (anything
// they have said, now or earlier or in their Project, settles it), and a
// question has to be available. The failure on the other side is on record
// from runs 4-6: an expert asking for a thing and getting an interview.

/** Asking Socria to PRODUCE an artifact, rather than to answer, fix or explain. */
// NOT `build`: "why does this build keep failing" is a debugging turn, and a
// verb that is more often a noun in this product's traffic costs more than it
// earns. "Build me a X" still reaches this through `make`.
const PRODUCE = /\b(?:write|draft|compose|create|generate|make|design|come up with|put together|produce|script|outline)\b/i;

/**
 * Asking Socria to do the THINKING: solve it, judge it, work it out.
 *
 * The same ownership question applies to a problem as to a paragraph — "solve
 * this" from somebody studying for an exam and from somebody with a deadline
 * are the same words and opposite requests — and it is the half a
 * generation-only reading misses, because it looks for artifacts.
 */
const REASON_FOR_THEM = /\b(?:solve|work (?:it|this|that) out|figure (?:it|this|that) out|analy[sz]e|evaluate|assess|weigh (?:up|the)|decide|choose between|prove|derive|plan out|reason (?:about|through))\b/i;

/**
 * Transformations of material they already have. "Summarise this", "rewrite my
 * intro", "translate it" — the artifact is determined by the thing in front of
 * them, so there is nothing to be unscoped about.
 */
const TRANSFORM = /\b(?:summari[sz]e|rewrite|revise|edit|shorten|tighten|sharpen|strengthen|improve|polish|clean up|translate|reformat|convert|proofread|fix)\b/i;

/**
 * They said the OUTPUT is what they want. Deliberately narrow, and "for me"
 * is deliberately NOT on it: "write an email for me" is the everyday phrasing
 * of an ordinary ask, not a statement that they want no part in it.
 */
const DELEGATED = /\b(?:(?:decide|choose|pick|answer|solve|write|draft|do|handle|make) (?:it |this |that |them )?for me|just (?:need|want|give|write|do|make)|i (?:just )?need (?:the )?(?:finished|final|full|complete|whole)|finished (?:thing|version|piece|draft)|final (?:version|draft|copy)|ready to (?:send|ship|post|publish)|don'?t ask|no questions|you (?:decide|choose|pick)|your (?:call|choice)|whatever you think|as you see fit|i don'?t (?:care|mind)|do it all)\b/i;

/**
 * The things people ask to have made. Needed because the verb alone is not
 * enough in either direction: "help me figure out why this build fails" is a
 * debugging turn that happens to start with "help me figure", and answering it
 * with three directions instead of the fix would be the same failure in the
 * opposite direction.
 */
const ARTIFACT = /\b(?:stor(?:y|ies)|essays?|e-?mails?|posts?|articles?|letters?|messages?|drafts?|scripts?|poems?|speech(?:es)?|pitch(?:es)?|proposals?|outlines?|chapters?|blurbs?|captions?|copy|bios?|r[ée]sum[ée]s?|resumes?|cv|cover letters?|presentations?|decks?|slides?|papers?|reports?|memos?|ads?|adverts?|taglines?|headlines?|premises?|ideas?|concepts?|angles?|arguments?|analys[ei]s|cases?|newsletters?|threads?|plans?|curricul(?:um|a)|syllab(?:us|i)|agendas?|itinerar(?:y|ies)|recipes?|songs?|lyrics?|novels?|screenplays?|paragraphs?|sentences?|sections?|intros?|introductions?|conclusions?|abstracts?|summar(?:y|ies))\b/i;

/** The authorship is the activity: they asked to work on it, not to receive it. */
const DEVELOP = /\b(?:help me (?:develop|think|work|figure|brainstorm|plan|shape|structure|decide|understand)|think (?:this |it )?through (?:with me|together)|brainstorm|work (?:this |it )?out with me|think out loud|bounce|develop (?:my|this|the|a|an) (?:idea|thought|argument|concept|angle|premise)|what do you think (?:about|of) my|walk me through|talk me through|let'?s (?:work|think|figure))\b/i;

/** "Give me three premises" is a commission; it just does not use a making verb. */
const ASKS_FOR = /\b(?:give me|send me|hand me|show me|i need|i want|can i (?:get|have))\b/i;

/**
 * Work whose doing is not cognition anybody meant to keep.
 *
 * Nobody wants to be asked whether they meant to look up the default isolation
 * level themselves. The friction of a clarification is only worth paying when
 * the work being clarified is worth owning, and this is the line: retrieval,
 * conversion, formatting, arithmetic and mechanical edits are below it.
 */
const MECHANICAL = /\b(?:what is|what'?s|when is|when'?s|where is|who is|how do i|look up|remind me|convert|format|reformat|rename|translate|spell|capitali[sz]e|indent|lint|sort|count|add up|multiply|calculate|what does .{1,30} mean|definition of)\b/i;

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
export function ownershipRead(text: string, signals: ExplicitSignals, s: CognitiveState): Allocation['ownership'] {
  const t = (text ?? '').trim();
  if (!t) return null;

  // GATE 1 — WHAT HAVE THEY ALREADY SAID?
  //
  // First, and before any reading of the request, because this is where
  // standing contracts do their work: an instruction outranks every inference
  // below it, and nothing here re-decides something the person has decided.
  // It runs ahead of the substantiality gate too — "just do it" and "don't do
  // it for me" are instructions whatever the work turns out to be.
  //
  // ownWork is checked FIRST. "Don't do it for me" contains "do it for me",
  // and the reading that preserves their work is the one that survives being
  // wrong.
  if (signals.ownWork || (s.authorship.source === 'explicit' && s.authorship.value === 'theirs')) return 'theirs';
  if (signals.practiceIntent || (s.learningGoal.source === 'explicit' && s.learningGoal.value === 'yes')) return 'theirs';
  if (
    signals.delegate ||
    signals.directness === 'answer' ||
    (s.directness.source === 'explicit' && s.directness.value === 'answer') ||
    signals.stopQuestions ||
    DELEGATED.test(t) ||
    // ALREADY ANSWERED, ON AN EARLIER TURN. mergeState writes
    // authorship = explicit('shared') when somebody hands the work over, and
    // nothing read it back: they said "yours", Socria wrote the thing, and on
    // the next request it asked whose it was all over again. A settled
    // contract that gets re-litigated every turn is worse than never asking.
    (s.authorship.source === 'explicit' && s.authorship.value !== 'theirs')
  ) {
    return 'delegated';
  }

  // GATE 2 — IS THERE ENOUGH COGNITION HERE TO BE WORTH ASKING ABOUT?
  //
  // Everything below is silent otherwise, and that silence is most of the
  // product: the information, retrieval, formatting and arithmetic turns where
  // an ownership question would be pure friction. Nobody wants to be asked
  // whether they meant to look up a date themselves.
  // A VERB DIRECTED AT SOCRIA, not merely the name of a thing. "I don't know
  // if the essay angle is right" contains an artifact and asks for nothing; it
  // is somebody thinking aloud, and an ownership question there would be the
  // interview this gate exists to prevent. Caught by core4-brevity, which is
  // exactly the suite that should have caught it.
  const collaborative = DEVELOP.test(t);
  const commissioned = ASKS_FOR.test(t) && ARTIFACT.test(t);
  // A transformation of their own material is substantial too — and gate 4
  // settles it immediately, so it never reaches the question.
  const substantial = collaborative || PRODUCE.test(t) || REASON_FOR_THEM.test(t) || commissioned || TRANSFORM.test(t);
  if (!substantial) return null;
  if (MECHANICAL.test(t) && !collaborative && !PRODUCE.test(t)) return null;
  // Work they are checking, practising or debugging has its own machinery
  // above, and that machinery already knows whose the work is.
  if (s.work === 'diagnosis' || s.taskKind === 'debug' || s.work === 'verification' || s.work === 'practice' || s.latest === 'attempt') return null;

  // GATE 3 — DID THEY ASK TO WORK ON IT, OR TO RECEIVE IT?
  if (collaborative) return 'theirs';

  // GATE 4 — DOES THE ASK ITSELF SETTLE IT? A transformation of material they
  // supplied, or a brief detailed enough that commissioning is the only
  // reading of it, is delegation expressed as detail rather than as a sentence
  // about who does what.
  if (TRANSFORM.test(t)) return 'scoped';
  if (s.attempt !== 'none') return 'scoped';
  const determiners = DETERMINERS.filter((re) => re.test(t)).length;
  const words = t.split(/\s+/).length;
  // A COUNT OF A NAMED THING IS A COMMISSION. "Three story premises" says
  // what to make and how many of it: there is nothing left for an ownership
  // question to settle, and asking one would be the interview this gate
  // exists to prevent.
  const counted = /\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(t) && ARTIFACT.test(t);
  if (counted || determiners >= 2 || (determiners >= 1 && words >= 12)) return 'scoped';

  // Nothing settled it, and the work is worth owning.
  return 'ambiguous';
}

export function allocate(ctx: Ctx): Allocation {
  const a = allocateFor(ctx);
  if (a.ownership !== null) return a;
  const own = ownershipRead(ctx.lastUserText ?? ctx.state.currentFocus ?? '', ctx.signals, ctx.state);
  return own === null ? a : { ...a, ownership: own };
}

function allocateFor({ state: s, signals, contract, lastUserText }: Ctx): Allocation {
  const own = ownershipRead(lastUserText ?? s.currentFocus ?? '', signals, s);
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
      // WHAT IS HELD BACK IS THE ORIGINATION, NOT ONLY THE REWRITE.
      //
      // This said 'a replacement version of their work', and originating a
      // premise is not a replacement of anything — so nothing in the withhold
      // forbade it. Somebody said "mine" and got a protagonist, a setting, a
      // discovery and a conflict, none of which they had written: their work
      // was not replaced, it was pre-empted. The substantive creative content
      // — the plot, the characters, the premise, the angle, the direction — is
      // theirs to originate, and that is what this names.
      return alloc('HUMAN_LEADS', 'creation.theirs',
        'They said the work stays theirs: develop what THEY put down, and never originate the substance of it.',
        1, ['originating the substance: the premise, the characters, the direction, the argument'],
        ['eliciting what they already have', 'developing and connecting their material', 'critique', 'craft knowledge'],
        {
          what: 'any substantive creative content of your own — a plot, a character, a premise, a theme, a title, a concept, an angle, a direction, or a "what if" that supplies one',
          reason: 'authorship',
          evidence: s.authorship.evidence ?? '',
          source: sourceOf(s.authorship, signals.ownWork),
          alternative: 'everything around it — what is already latent in what they have written, the tension between two of their own pieces, a targeted question, critique, craft knowledge, organisation of their material, and the whole thing the moment they hand it over',
        }, s, 'theirs');
    }
    // How much of the work would producing it be? See generationRead.
    if (own === 'delegated') {
      return alloc('AI_EXECUTES', 'creation.delegated', 'They handed it over: make it.', 0.9,
        [], ['the artifact itself'], null, s, 'delegated');
    }
    if (own === 'theirs') {
      // NOT 'options', and not 'material to work with'. Both readings let
      // Socria supply the ideas — "brainstorm with me" became "generate ideas
      // for me", which is the same takeover in a friendlier register.
      return alloc('AI_ASSISTS', 'creation.theirs.developing',
        'The doing is the point: draw out what they have and push on it. The substance stays theirs to originate.', 0.8,
        ['originating the substance: the ideas, the premise, the direction'],
        ['eliciting what they have', 'developing and connecting it', 'tensions already latent in it', 'critique', 'craft knowledge'], null, s, 'theirs');
    }
    if (own === 'ambiguous') {
      return alloc('AI_ASSISTS', 'ownership.unclear',
        'Substantial work, and nothing said whose it is: one short question settles whether Socria takes it or works on it with them.',
        0.7, ['the choice of who does this'], ['whatever they choose, in full'], null, s, 'ambiguous');
    }
    return alloc('AI_ASSISTS', 'creation.shared', 'Making something: Socria drafts, develops or critiques as asked; they steer.', 0.6,
      ['direction'], ['drafting', 'developing', 'critique'], null, s, own);
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
    if (own === 'ambiguous') {
      return alloc('AI_ASSISTS', 'ownership.unclear',
        'Substantial work, and nothing said whose it is: one short question settles whether Socria takes it or works on it with them.',
        0.7, ['the choice of who does this'], ['whatever they choose, in full'], null, s, 'ambiguous');
    }
    return alloc('AI_EXECUTES', 'execution', 'Mechanical work: do it.', 0.9, [], ['the work'], null, s, own);
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
