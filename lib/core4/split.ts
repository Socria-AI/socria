// lib/core4/split.ts
//
// WHICH PART OF THIS THINKING IS THEIRS TO DO?
//
// The invariant is in types.ts above CognitiveSplit: Socria must not replace
// meaningful human cognition, in any domain. This file is the only place that
// decides what "meaningful" means on a given turn, and it decides it eight
// times — once per dimension — rather than once for the turn.
//
// WHY A SPLIT AND NOT A GATE. A gate has to answer "should Socria do this?",
// and for almost every real message the honest answer is "most of it, yes".
// "Solve this integral for the pricing model" wants the algebra done, the
// method named, the result checked, and the modelling judgement left alone.
// One verdict over the whole turn has to choose between being useless and
// being a substitute; a split does not.
//
// WHAT IS ALWAYS SOCRIA'S. Retrieval, verification, representation and
// mechanical execution are supporting work by construction — there is no
// version of "look it up", "check it", "draw it", "convert it" where doing it
// takes something from the person. They are 'perform' unconditionally, and
// that is most of the traffic. Nothing here can make Socria withhold a fact,
// a definition, a source, a calculation or a verdict on correctness.
//
// WHAT IS NEVER SIMPLY SOCRIA'S. Originating the substance of creative work,
// making the judgement in a decision, and taking the reasoning step somebody
// is building capability in. These are not withheld — everything around them
// is given, at length — but they are not supplied in Socria's words either.
//
// PERSISTENCE, AND WHY "JUST DO IT" DOES NOT MOVE IT. An instruction can move
// how much Socria does, how long the reply is and whether it asks anything. It
// cannot move who does the meaningful cognition, because that is not a
// preference about service level: somebody who says "you do the thinking" is
// asking for exactly the thing that costs them the capability they came for.
// So delegation silences the questions and raises the effort, and the substance
// stays theirs. See allocation.ts, where the delegation branch consults this.
//
// Pure: no model, no clock, no I/O. Everything here is a state and a sentence
// in, and eight labels out, so the whole judgement is testable without a model
// and readable without running anything.

import type { CognitiveState } from '../cognition/state';
import { DIMENSIONS, type CognitiveSplit, type Dimension, type ExplicitSignals, type Role } from './types';

/**
 * Work whose substance is a reasoning path somebody is meant to traverse.
 *
 * NOT the same as "a hard question". "What is the quotient rule" is a
 * knowledge gap and the bottleneck is Socria's to remove; "differentiate this
 * and show me" is a path, and which step of it is theirs depends on what they
 * are doing with it.
 */
const PROBLEM = /\b(?:solve|prove|derive|integrate|differentiate|factor|simplify|show that|work (?:out|through)|figure out|compute the (?:proof|derivation)|do (?:this|these|my) (?:problem|problems|homework|exercise|exercises|assignment)|answer (?:this|these) question)\b/i;

/**
 * Asking for the judgement itself, rather than for what bears on it.
 *
 * The reader's `work`/`taskKind` is the primary signal and this is the floor
 * under it, because the reader is a cheap model on a two-second deadline. Widened
 * by the takeover audit, which found three phrasings that reserved nothing:
 * "what is the play on pricing here", "what should our positioning be", "tell me
 * the conclusion from this data".
 *
 * DELIBERATELY VERB-SPECIFIC on the "what should" family. "What should I expect
 * from this API" is an information question, and reserving the judgement on it
 * would hold back an answer nobody was deciding anything with — the under-help
 * failure, arriving through the mechanism meant to prevent the other one.
 */
const DECISION = /\b(?:should i|which should|decide|choose|pick|recommend|best option|which one|go with|worth it|pros and cons of (?:my|our)|strategy for (?:my|our)|what should (?:i|we|our team) (?:do|choose|pick|go with|prioriti[sz]e|focus on|build|charge|launch|say|write)|what should (?:our|my) (?:positioning|strategy|pricing|price|approach|plan) be|what(?:'s| is) the (?:play|move|call|right (?:call|move|choice|option|approach)|best (?:call|move|choice|option|approach|strategy))|tell me (?:the conclusion|what to (?:do|think|believe|choose)|which (?:one|option))|what would you (?:do|choose|pick))\b/i;

/** Asking for something to be originated. */
const ORIGINATION = /\b(?:write|draft|compose|create|generate|make|invent|come up with|brainstorm|think up|design|name|title)\b/i;

/**
 * Work that is instrumental: they are not building capability in it, they are
 * using it to get somewhere else.
 *
 * This is the difference between a student's integral and an engineer's, and
 * it is the whole reason this file is not a refusal engine. The engineer's
 * integral is plumbing for the thing they actually own; performing it whole is
 * the correct, useful answer and Core 4 gives it.
 */
function instrumental(s: CognitiveState, signals: ExplicitSignals): boolean {
  const expert = s.expertise.value === 'expert' &&
    (s.expertise.source !== 'inferred' || s.expertise.confidence >= 0.6);
  const learning = s.learningGoal.source === 'explicit' && s.learningGoal.value === 'yes';
  // 1. THEY SAID THEY ARE LEARNING IT. Nothing below moves that, and no later
  //    "just give me the answer" moves it either: the ladder in allocation.ts
  //    bottoms out on repeated failure, which is a principled exit, and an
  //    impatient sentence is not.
  if (learning || (s.authorship.source === 'explicit' && s.authorship.value === 'theirs')) return false;
  // 2. THEY ASKED FOR THE ANSWER AND NOTHING SAYS THIS IS THEIR EXERCISE.
  //
  //    This is where reasoning differs from creativity and judgement, and the
  //    difference is not a compromise. A story somebody else originated is not
  //    their story and a decision somebody else made is not their decision —
  //    the cognition is constitutive of the thing, so no instruction can move
  //    it. An integral somebody else computed is still the right number, and
  //    whether computing it was this person's job depends entirely on what they
  //    are doing with it. With no sign that they are exercising it and an
  //    explicit request for the answer, treating their problem as homework is
  //    the paternal inference the allocator exists to prevent — and withholding
  //    a method they asked for is Core 3.1, which was replaced for good reason.
  if (signals.directness === 'answer' || signals.delegate || signals.stopQuestions) return true;
  // 3. The shape of practice, without the words.
  if (s.work === 'practice' || s.taskKind === 'learn') return false;
  return expert || s.urgency === 'high' || s.work === 'execution' || s.work === 'information';
}

export interface SplitInput {
  state: CognitiveState;
  signals: ExplicitSignals;
  text: string;
  /**
   * What allocation.ts's ownershipRead made of the message, when the caller has
   * it. Used rather than duplicated: that read already knows that "format this",
   * "convert this" and "rename these files" are mechanical, and that a
   * transformation of their own material or a brief detailed enough to commission
   * is settled — judgements this file would otherwise have to make a second time,
   * differently, and get wrong on the boundary between authorship and plumbing.
   */
  ownership?: 'delegated' | 'scoped' | 'theirs' | 'ambiguous' | null;
}

/**
 * The eight roles for this turn.
 *
 * Deliberately readable top to bottom rather than clever: four dimensions are
 * unconditional, and the three that carry the invariant each turn on one
 * question about what the person is doing.
 */
export function splitFor({ state: s, signals, text, ownership }: SplitInput): CognitiveSplit {
  const t = (text ?? '').trim();
  const learning = s.learningGoal.source === 'explicit' && s.learningGoal.value === 'yes';
  const ownWork = signals.ownWork || (s.authorship.source === 'explicit' && s.authorship.value === 'theirs');

  // Creation: originating the substance is theirs whenever the turn is about
  // making something. 'share' otherwise — Socria can contribute an idea inside
  // a conversation that is not about producing anything.
  //
  // NOT KEYED ON THE READER'S LABEL ALONE. The cheap reader calls "write me a
  // script" execution and "write my code" creation on the same day, so a rule
  // that trusted the label handed one of them over. `ownership` is the read that
  // already draws the line: null for mechanical work, 'scoped' when their own
  // material or a detailed brief settles it, and anything else for work whose
  // substance is somebody's to originate. Absent (a caller with no read), the
  // label is the fallback.
  // `ownership` null means the read found nothing worth owning — a lookup, a
  // conversion, a format fix. 'scoped' means their own material or a brief
  // detailed enough to commission already settles it. Either way the substance
  // is not Socria's to originate because there is none, and that overrides the
  // label: "summarise this paper" arrives as creation often enough.
  const mechanicalAsk = ownership === null || ownership === 'scoped';
  //
  // WHY `execution` IS EXCLUDED, since it is the line somebody will want to
  // move. Code, scripts, tables and queries are usually the artifact of a
  // decision somebody has already made, and scaffolding them is the under-help
  // failure: "write a script to rename these files" has no substance to
  // originate, and a reply that protects one is a reply that does not work. The
  // person for whom the code IS the exercise is caught by the reasoning
  // dimension instead — learningGoal, practice, taskKind 'learn' — which is the
  // honest signal for "am I building this capability" and does not depend on
  // guessing from the noun.
  //
  // THE LABEL PERSISTS; THE MESSAGE DOES NOT HAVE TO REPEAT ITSELF. This read
  // the current message only, and "I don't care" is not a request for anything —
  // so ownershipRead returned null, the veto fired, creativity came back 'share'
  // and the fourth turn of a creative conversation lost its protection entirely.
  // Measured: four messages of ordinary impatience ("just make one" / "you
  // choose" / "I don't care") and the turn was a generic answer with no clause
  // on it. A contentless follow-up must inherit what the conversation already
  // established, so the conversation's own work label decides, and only their
  // own material ('scoped') settles it from there.
  const creating = s.work === 'creation' || s.taskKind === 'create'
    ? ownership !== 'scoped'
    : ORIGINATION.test(t) && !mechanicalAsk &&
      s.work !== 'information' && s.work !== 'execution' && s.work !== 'diagnosis';

  // Judgement: the choice is theirs whenever the turn is a decision. Their
  // asking for Socria's view does not move this — the view is given (see
  // recommendation.requested in intervene.ts) and the choice is still theirs.
  //
  // `&& !creating` BECAUSE OF A MEASURED FAILURE. "you choose" in the middle of
  // a creative conversation matched DECISION on the word "choose", judgment came
  // out 'human', and judgment sorts before creativity — so the leading dimension
  // became judgement on a turn that was about a story, the creative branch in
  // intervene.ts was skipped, and the turn fell through to a generic answer with
  // no clause and no buffering. Three messages of ordinary impatience and Socria
  // would have written the story. A word in their sentence must not be able to
  // relabel what kind of work this is.
  //
  // The regex is a FLOOR under an absent or vague label, not an override of a
  // specific one. "What should I expect from this API" and "what should I read
  // about elasticity" both match the `should i` family and are both information
  // questions; when the reader has said information, explanation, verification,
  // execution or diagnosis, it has said the bottleneck is knowledge, and
  // reserving the judgement there withholds an answer nobody is deciding with.
  const labelled = s.work === 'information' || s.work === 'explanation' ||
    s.work === 'verification' || s.work === 'execution' || s.work === 'diagnosis';
  const deciding = s.work === 'judgment' || s.taskKind === 'decide' ||
    (DECISION.test(t) && !creating && !labelled);

  // Reasoning: 'scaffold' when the path is the point and they are building
  // capability in it; 'share' when it is instrumental — Socria reasons openly
  // and the conclusion is theirs to accept; 'perform' when there is no path,
  // only a fact or an operation.
  //
  // NOT `taskKind === 'learn'`. That is a mode the person is in, not a shape the
  // task has, and including it scaffolded "what is the quotient rule?" — a pure
  // knowledge gap, where the bottleneck is what Socria knows and the answer is
  // the whole of the help. A path is a problem to traverse: their own practice,
  // a judgement, research to interpret, or a message that asks for one to be
  // worked. Measured: with 'learn' in here, 278 of the policy suite's decisions
  // reserved a dimension they had no business reserving.
  const path = PROBLEM.test(t) || s.work === 'practice' || s.work === 'judgment' ||
    s.work === 'research' || s.taskKind === 'decide';
  const reasoning: Role = !path ? 'perform' : learning || !instrumental(s, signals) ? 'scaffold' : 'share';

  return {
    // ── never withheld, whatever anybody said ──
    retrieval: 'perform',
    verification: 'perform',
    representation: 'perform',
    mechanical: 'perform',
    // ── surfaced by Socria, read by them ──
    metacognition: 'share',
    // ── the three that carry the invariant ──
    reasoning,
    judgment: deciding ? 'human' : 'share',
    creativity: creating ? 'human' : ownWork ? 'human' : 'share',
  };
}

/**
 * The dimensions Socria may not simply perform this turn, strongest first.
 *
 * 'scaffold' counts: setting a step up and then taking it is the same
 * substitution as taking it outright, done more politely.
 */
export function mustNotPerform(split: CognitiveSplit | undefined): Dimension[] {
  // Tolerant of a missing split: Allocation gained the field, and a stored
  // trace or a hand-built fixture from before it will not carry one. Callers
  // that need a conservative default supply it themselves — see guard2.ts,
  // which falls back to the dimension this invariant was first written for.
  if (!split) return [];
  const rank: Record<Role, number> = { human: 0, scaffold: 1, share: 2, perform: 3 };
  return DIMENSIONS.filter((d) => split[d] === 'human' || split[d] === 'scaffold')
    .sort((a, b) => rank[split[a]] - rank[split[b]]);
}

/** Is any meaningful cognition this person's this turn? */
export function humanOwned(split: CognitiveSplit | undefined): boolean {
  return mustNotPerform(split).length > 0;
}

/**
 * What is kept with them, in words a reply can act on — and what they get
 * instead, which is always the longer list.
 *
 * One dimension, not all of them: a withhold naming four things at once reads
 * as a refusal, and the leading dimension is the one the turn is actually
 * about. Council D6 requires the alternative, and it is not a formality here:
 * every line of it is work Socria performs in the same reply.
 */
export function keptBack(
  split: CognitiveSplit,
  s: CognitiveState
): { dimension: Dimension; what: string; alternative: string } | null {
  const [lead] = mustNotPerform(split);
  if (!lead) return null;
  if (lead === 'creativity') {
    return {
      dimension: lead,
      what:
        'any substantive creative content of your own — a plot, a character, a premise, a theme, a title, a concept, an angle, a direction, or a "what if" that supplies one',
      alternative:
        'everything around it — what is already latent in what they have written, the tension between two of their own pieces, a targeted question, critique, craft knowledge, organisation of their material, and the whole thing the moment they hand it over',
    };
  }
  if (lead === 'judgment') {
    return {
      dimension: lead,
      what: 'the choice itself — which option, which strategy, which way to go',
      alternative:
        'everything the choice rests on — the evidence, what each way costs, the assumption each one needs, what they have not considered, what would settle it, and Socria’s own view with the value that would flip it, the moment they ask for it',
    };
  }
  return {
    dimension: lead,
    what:
      s.work === 'practice' || (s.learningGoal.source === 'explicit' && s.learningGoal.value === 'yes')
        ? 'the step they are working on, and the finished answer'
        : 'the reasoning step that is the point of this — the one they are doing',
    alternative:
      'everything around it — what the method is and why it applies, the facts and notation, the arithmetic, a worked analogous case, whether each step of theirs is right and exactly where it goes wrong, and the whole of it the moment they say they want it',
  };
}
