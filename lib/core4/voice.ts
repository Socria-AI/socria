// lib/core4/voice.ts
//
// How Socria meets the person on THIS turn. Not who Socria is.
//
//   Cognitive State  what is happening in the human's thinking
//   Personality State  how Socria should meet them there   ← this file
//   Core Personality  who Socria remains throughout        ← the system prompt
//
// The identity lives in the prompt because it never changes; putting it here
// would mean recomputing a constant every turn and inviting it to drift. What
// varies is the register, and only the register.
//
// FOUR DIMENSIONS, NOT NINE. Warmth, directness, playfulness, intensity,
// formality, skepticism, emotional sensitivity, intellectual density and energy
// were all candidates. Most of them move together — intensity, skepticism and
// directness are one thing seen from three angles, and formality is almost
// perfectly anti-correlated with playfulness — so nine dials would produce a
// long block of instructions that mostly repeat each other, and no test could
// show that any single one of them did anything. Four dimensions that are
// genuinely orthogonal, each mapping to something observable in the prose:
//
//   warmth    how much of the person, rather than the problem, is addressed
//   edge      how hard a weak claim gets pushed on
//   play      whether dry humour is available at all
//   density   how much is packed into each sentence
//
// "Energy" for an exciting result is play at its top with edge held at the
// middle: interested and quick, not celebratory. That is a combination, not a
// fifth dial.
//
// NO MODEL CALL. Every input is already computed by the time this runs —
// explicit signals, the merged state, and the intervention decision. A model
// call to classify tone would be a second opinion about text the reply model is
// already holding, which is the exact pattern three audits found produces
// nothing.
//
// IT DOES NOT MIRROR. Someone writing "bro we're cooked" does not get slang
// back; they get a looser, drier Socria. Matching register is impersonation and
// it reads as mockery from a machine. The dimensions describe Socria's RESPONSE
// to a situation, never a copy of its surface.
//
// IT NEVER ADDS LENGTH. `proportion` decides how much is said and this decides
// how it sounds. The rendered block is deliberately short and says nothing that
// could be read as licence to write more — a personality that needs a paragraph
// to be visible is not a personality.

import type { CognitiveState } from '../cognition/state';
import type { ExplicitSignals, InterventionDecision, CommunicationPrefs, Readability } from './types';
import { DEFAULT_COMMUNICATION } from './types';

export type Warmth = 'cool' | 'neutral' | 'warm';
export type Edge = 'soft' | 'measured' | 'sharp';
export type Play = 'none' | 'dry' | 'light';
export type Density = 'spare' | 'normal' | 'dense';

export interface Voice {
  warmth: Warmth;
  edge: Edge;
  play: Play;
  density: Density;
  /** why it landed here — for the trace, never for the person */
  because: string;
}

export interface VoiceInput {
  state: CognitiveState;
  signals: ExplicitSignals;
  decision: InterventionDecision;
  /** their standing preference for how the answer is expressed, not how it is reached */
  prefs?: CommunicationPrefs;
}

/** Moves whose whole job is to push on something. */
const CHALLENGING = new Set(['CHALLENGE', 'CRITIQUE', 'CORRECT']);
/** Moves that hand over a result and get out of the way. */
const TRANSACTIONAL = new Set(['ANSWER', 'CALCULATE', 'EXECUTE', 'RETRIEVE', 'GET_OUT_OF_THE_WAY']);

/**
 * Something went well and they are telling us about it.
 *
 * Deliberately narrow: a result, a fix, a thing that finally worked. Not
 * "excited language", which would catch someone who writes with exclamation
 * marks about everything, and not praise directed at Socria, which is not a
 * discovery and deserves no energy at all.
 */
const BREAKTHROUGH = /\b(?:it works|working now|finally|turns out|figured (?:it )?out|nailed it|shipped it|fixed it|that did it|got it working|solved)\b/i;

/**
 * How Socria meets them, this turn.
 *
 * Read in precedence order: safety first, then their stated preferences, then
 * the emotional reading, then the work. Anything earlier wins, because a
 * register chosen for a person in difficulty must not be overridden by the fact
 * that the topic happens to be technical.
 */
export function voiceFor(input: VoiceInput): Voice {
  return applyReadability(situationalVoice(input), (input.prefs ?? DEFAULT_COMMUNICATION).readability);
}

/** The register the SITUATION asks for, before their standing preference. */
function situationalVoice(input: VoiceInput): Voice {
  const { state: s, signals: sig, decision: dec } = input;
  const text = s.currentFocus ?? '';

  // SAFETY. No warmth performance, no humour, nothing but the thing they need.
  if (sig.safety || dec.reasonCode === 'safety') {
    return { warmth: 'neutral', edge: 'measured', play: 'none', density: 'spare', because: 'safety' };
  }

  // THEIR WORDS. "Stop being so blunt" and "just tell me" are instructions
  // about register, and an instruction outranks any reading of the situation.
  if (sig.tooDirect) {
    return { warmth: 'warm', edge: 'soft', play: 'dry', density: 'normal', because: 'they said it landed too hard' };
  }

  // DIFFICULTY. Frustrated, stuck, venting, out of their depth, or a sensitive
  // subject: quieter and warmer, and the edge comes off. Not therapy — warmth
  // here means addressing the person as well as the problem, not discussing
  // their feelings.
  // `work === 'reflection'` is the route to this register, and it has to be.
  // The explicit signals cannot get here: DONT_KNOW is anchored and capped at
  // 40 characters because it exists for "idk" as an answer, so "I honestly
  // don't know if I'm cut out for this" does not match it, and VENT wants
  // something closer to an outburst. Reflection is the reader's own word for
  // thinking aloud about oneself, which is exactly the turn that wants a lower
  // voice — and reading it here costs nothing and changes no shared signal.
  const struggling = sig.frustration || sig.vent || sig.dontKnow || sig.sensitive
    || s.stuck === 'stalled' || s.stuck === 'looping'
    || s.work === 'reflection';
  if (struggling) {
    return {
      warmth: 'warm',
      edge: 'soft',
      play: 'none',
      density: 'spare',
      because: sig.sensitive ? 'a sensitive subject' : s.work === 'reflection' && !sig.frustration && !sig.vent ? 'thinking aloud about themselves' : 'they are finding this hard',
    };
  }

  // URGENCY. Someone in a hurry gets the thing, in as few words as carry it.
  if (sig.urgent || s.urgency === 'high') {
    return { warmth: 'neutral', edge: 'measured', play: 'none', density: 'spare', because: 'real time pressure' };
  }

  const highStakes = s.stakes.value === 'high';
  const expert = s.expertise.value === 'expert';
  const analytic = s.work === 'judgment' || s.work === 'diagnosis' || s.taskKind === 'decide';

  // SERIOUS WORK AT STAKE. Composed and compressed, and the scepticism is
  // earned rather than adversarial: the point is the weak joint in the
  // argument, not a demonstration of rigour.
  if (highStakes && analytic) {
    return {
      warmth: 'cool',
      edge: 'sharp',
      play: 'none',
      density: expert || dec.coverage === 'complete' ? 'dense' : 'normal',
      because: 'a consequential call',
    };
  }

  // A DISAGREEMENT, OR A CLAIM WORTH PUSHING ON. Sharper, and dry humour is
  // available — understatement is the most efficient way to disagree without
  // escalating, which is the whole difference between sharp and combative.
  if (CHALLENGING.has(dec.type) || s.tensions.length > 0) {
    return { warmth: 'neutral', edge: 'sharp', play: 'dry', density: expert ? 'dense' : 'normal', because: 'there is something worth pushing on' };
  }

  // SOMETHING WORKED. Genuine interest and a bit of pace. Not congratulation:
  // the interesting part is what it means, and the fastest way to sound like a
  // hype bot is to celebrate before asking that.
  if (BREAKTHROUGH.test(text)) {
    return { warmth: 'warm', edge: 'measured', play: 'light', density: 'normal', because: 'something they were working on came good' };
  }

  // A PRACTICAL ASK. Hand it over and stop.
  if (TRANSACTIONAL.has(dec.type) && (s.work === 'information' || s.work === 'execution')) {
    return { warmth: 'neutral', edge: 'measured', play: 'none', density: 'spare', because: 'they asked for a thing' };
  }

  // CASUAL. Looser and drier — which is not the same as matching them. Someone
  // writing in fragments and slang gets a Socria that is relaxed and still
  // recognisably itself.
  const casual = s.work === 'conversation' || s.taskKind === 'explore';
  if (casual && !highStakes) {
    return { warmth: 'warm', edge: 'measured', play: 'light', density: 'normal', because: 'ordinary conversation' };
  }

  return { warmth: 'neutral', edge: 'measured', play: 'dry', density: expert ? 'dense' : 'normal', because: 'default' };
}

/**
 * Their readability preference, applied to the register the situation chose.
 *
 * ONLY DENSITY, and that is deliberate. Readability is about how hard the
 * prose is to read: vocabulary, sentence length, how much is packed in.
 * It is not about warmth, and a person who prefers plain language has not
 * asked to be handled more gently or to be disagreed with less — mapping the
 * setting onto those would be a different and patronising product.
 *
 * Simple never means a worse answer. It cannot reach the allocator, the move,
 * verification or the measuring stages, because it is applied here and nowhere
 * else. The finding is the same finding; the sentence carrying it is plainer.
 */
export function applyReadability(v: Voice, r: Readability): Voice {
  if (r === 'standard') return v;
  if (r === 'simple') return { ...v, density: 'spare', because: `${v.because}; plain language preferred` };
  // Advanced does not force density onto a turn the situation made spare — an
  // urgent practical answer stays short for someone who reads papers for a
  // living. It lifts the ordinary case.
  return v.density === 'normal' ? { ...v, density: 'dense', because: `${v.because}; dense language preferred` } : v;
}

const WARMTH: Record<Warmth, string> = {
  cool: 'Address the problem rather than the person. No warmth for its own sake.',
  neutral: 'Talk to them as a colleague: the problem first, them acknowledged in passing if at all.',
  warm: 'Speak to the person as well as the problem — plainly, in a lower voice. No naming of their feelings back at them, no reassurance, no therapy vocabulary. Warmth here is attention, not comfort.',
};

const EDGE: Record<Edge, string> = {
  soft: 'Do not push on anything this turn. If something is wrong it can wait, unless acting on it would cost them.',
  measured: 'Say plainly where you disagree, once, and move on.',
  sharp: 'Go at the weakest joint in the argument directly. Understate rather than escalate — a flat sentence lands harder than an emphatic one, and the target is the claim, never them.',
};

const PLAY: Record<Play, string> = {
  none: 'No humour this turn.',
  dry: 'Dry humour is available if it arrives on its own — understated, in passing, never signposted. If none arrives, say nothing funny.',
  light: 'You can be light, and quick. Still dry: no exclamation marks, no enthusiasm as a performance, and do not match their slang back at them.',
};

const DENSITY: Record<Density, string> = {
  spare: 'Short sentences. One idea each. Nothing subordinate. Plain words wherever a plain word exists — and where a technical term is the only accurate one, use it and give it a half-line gloss rather than reaching for a vaguer word that is easier to read and less true.',
  normal: 'Ordinary conversational rhythm — vary the sentence length so it reads as speech.',
  dense: 'Pack it: every sentence carries a distinct load, no run-up, no summary. Use the exact domain term rather than a paraphrase of it, and assume they can follow a compressed argument, because they can.',
};

/**
 * The register for this turn, as instructions about sound rather than about
 * substance.
 *
 * NEVER NAMES A MODE. Not "warmth: warm" and not "you are in supportive mode" —
 * a model given a label performs the label, and a person reading the result can
 * feel the gear change. The block describes what to do with the sentences.
 *
 * Deliberately gives no permission to write more: `proportion` owns length and
 * a register that needed a paragraph to be visible would not be a register.
 */
export function renderVoice(v: Voice): string {
  return (
    `\n=== Register for this turn (how it sounds, not how much you say) ===\n` +
    `${WARMTH[v.warmth]}\n${EDGE[v.edge]}\n${PLAY[v.play]}\n${DENSITY[v.density]}\n` +
    `This is a shift of register, not of character: you are the same person in every one of these. ` +
    `Do not name or hint at any of it, do not explain how you are adapting, and do not let it add a single sentence — ` +
    `how you sound is settled here, how much you say is settled above.\n`
  );
}
