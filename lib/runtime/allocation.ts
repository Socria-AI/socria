// lib/runtime/allocation.ts — COGNITIVE ALLOCATION.
//
// Who does what this turn. Core 4's CognitiveSplit, inherited rather than
// re-derived: eight dimensions of the work (reasoning, metacognition,
// judgment, creativity, retrieval, representation, verification, mechanical),
// each owned by Socria (perform), shared, scaffolded, or kept with the person
// (human) — decided by `splitFor` and `ownershipRead` exactly as Core 4
// decides them, over a state built in code (state.ts) instead of by Core 4's
// model reader. The move — inform, explain, verify, construct, challenge,
// perspective, ask, give room — is the Logos 4 engine's (`chooseAssist`),
// which already reads the evidence a move needs: the math engine's verdicts,
// the question budget, their map, what they selected.
//
// WHAT THE SPLIT MEANS IN PRACTICE, which is the whole of Human-First and no
// more:
//   Socria performs   retrieval, checking, organising and formatting,
//                     calculation — always; reasoning, when the work is a means
//                     to something else
//   Socria supports   reasoning they are building themselves: the next step, a
//                     check of theirs — the full solution when they ask for it
//   theirs            a consequential decision (laid out, and Socria's read
//                     given when asked — the call stays theirs), and the
//                     substance of writing that will be theirs
//
// AN EXPLICIT HAND-OVER IS HONOURED. "You decide", "just write it for me",
// "I need the finished version": they have made the call about the call, and
// overruling it would be the paternalism this exists to avoid. Only the Answer
// Guard — which they switch on — withholds anything.
//
// Pure. No model, no network, no clock.

import { splitFor } from '../core4/split';
import { ownershipRead } from '../core4/allocation';
import { EMPTY_STATE, type CognitiveState } from '../cognition/state';
import { chooseAssist, renderAssist, type AssistDecision, type AssistInput } from '../cognition/assist';
import { TALK, type Exchange } from '../cognition/register';
import type { CognitiveSplit, ExplicitSignals } from '../core4/types';
import type { TurnState } from './state';

export interface RuntimeAllocation {
  split: CognitiveSplit;
  /** Core 4's read of whose work this is: handed over, scoped, theirs, unclear, or not a question */
  ownership: 'delegated' | 'scoped' | 'theirs' | 'ambiguous' | null;
  /** the move this turn (the Logos 4 engine) */
  assist: AssistDecision;
  /** in words a reply can act on */
  does: string[];
  supports: string[];
  theirs: string[];
}

const explicit = <T,>(value: T) => ({ value, source: 'explicit' as const, confidence: 1 });

/** The Core 4 state the split reads, built from the runtime's state and their own words — no model. */
export function coreStateFor(st: TurnState, s: ExplicitSignals): CognitiveState {
  const taskKind: CognitiveState['taskKind'] =
    st.work === 'judgment'
      ? 'decide'
      : st.work === 'creation'
        ? 'create'
        : st.work === 'information'
          ? 'lookup'
          : st.work === 'diagnosis'
            ? 'debug'
            : st.work === 'reflection'
              ? s.vent
                ? 'vent'
                : 'explore'
              : st.work === 'practice' || s.learningGoal === true
                ? 'learn'
                : 'explore';
  return {
    ...EMPTY_STATE,
    work: st.work,
    taskKind,
    learningGoal: s.learningGoal === true ? explicit('yes') : s.learningGoal === false ? explicit('no') : EMPTY_STATE.learningGoal,
    expertise: s.expertise ? explicit(s.expertise) : EMPTY_STATE.expertise,
    directness: s.directness !== 'none' ? explicit(s.directness) : EMPTY_STATE.directness,
    authorship: s.ownWork ? explicit('theirs') : s.delegate ? explicit('shared') : EMPTY_STATE.authorship,
  };
}

export interface AllocateInput {
  state: TurnState;
  signals: ExplicitSignals;
  /** everything chooseAssist reads — the caller already has it */
  assist: Omit<AssistInput, 'signals'>;
}

export function allocate(i: AllocateInput): RuntimeAllocation {
  const text = i.assist.lastUserText;
  const core = coreStateFor(i.state, i.signals);
  const ownership = ownershipRead(text, i.signals, core);
  let split = splitFor({ state: core, signals: i.signals, text, ownership });
  if (ownership === 'delegated') {
    // Core 4 performs a handed-over task with its supporting split; the same here.
    split = { ...split, creativity: 'share', judgment: 'share', reasoning: split.reasoning === 'scaffold' && i.state.preferences.learning ? 'scaffold' : 'perform' };
  }
  const assist = chooseAssist({ ...i.assist, signals: i.signals, exchange: i.state.exchange.kind });

  const does = ['look things up from what you were given, check, organise and format, and do the arithmetic'];
  const supports: string[] = [];
  const theirs: string[] = [];
  if (split.reasoning === 'perform') does.push('work the problem through');
  else if (split.reasoning === 'scaffold') supports.push('their reasoning: the next step, or a check of theirs — the full solution only if they ask for it');
  else supports.push('the reasoning, worked through together');
  if (split.judgment === 'human') theirs.push('the decision: lay out what it rests on and the alternatives; give your own read if they ask; the call is theirs');
  if (split.creativity === 'human') theirs.push('the substance of what they are writing or making: build on their ideas with structure, options and critique, and improve their own sentences — do not hand them a finished piece from nothing');
  return { split, ownership, assist, does, supports, theirs };
}

/** What a domain asks of a colleague, in a line. */
const DOMAIN_LINE: Record<TurnState['domain'], string> = {
  business: 'Work like a sharp operator: numbers, trade-offs, customers, risks, and the next concrete step.',
  research: 'Work like a careful researcher: what the evidence shows, how strong it is, and what would change the conclusion.',
  engineering: 'Work like a senior engineer: concrete, correct and runnable; name assumptions and edge cases; code in fenced blocks.',
  writing: 'Work like a good editor: specific changes to their text, in their voice.',
  learning: 'Work like a good tutor: meet them where they are, explain plainly, and check understanding only when it helps.',
  creative: 'Work like a creative collaborator: build on their idea, offer real options, and keep it theirs.',
  math: 'Show the reasoning step by step; exact results come from the engine when it gives them.',
  everyday: 'Be practical and warm: the useful answer first.',
};

/**
 * What an exchange that is not a task asks for, in a line. Each names the kind
 * of exchange and the one or two things a help desk would do in its place —
 * the redirect to work, the tip list, the explained joke — because those are
 * what this replaces.
 */
const EXCHANGE_LINE = {
  social: "Small talk, not a task: answer like a person — brief and warm, in kind. Don't steer it toward work, offer help, or ask what they're working on.",
  playful: "They're joking around: play along — quick, and actually funny if you can. Don't explain the joke or turn it into help.",
  joke: 'They want a joke: tell one good one, original if you can, with no preamble.',
  down: "Something hard, in their words: answer the person first, plainly and kindly — no pep talk, no \"it's normal to feel…\", no list of tips. Help with the problem only if they ask or clearly want it.",
  up: "Good news, in their words: be glad with them — specifically, briefly — and don't turn it into next steps.",
  brainstorm: "Brainstorming: be generous and loose — several genuinely different ideas, a couple unexpected — and build on theirs. Don't grade every idea or wrap up; they choose.",
  discussion: 'Ideas to think about together: engage as a thinker — a position if you have one, and why; the other side at its strongest; follow the thread. No closing summary.',
  disagreement: "They're pushing back: decide it on the merits — concede what's right, hold what isn't with your reason, once — and let a real difference of opinion stand.",
} as const;
const ABOUT_SOCRIA_LINE = 'They asked about you: answer honestly and lightly, in a sentence — no claimed feelings or experiences, no disclaimer speech — and move on.';
/** On a task, a feeling or a joke they brought with it: a word for it, then the work. */
const ON_TASK = {
  down: "They said they're having a hard time: one plain, human word for that, then the work.",
  up: 'They sound glad: let it show in a word, then the work.',
  joking: "They're being playful: a light touch is welcome.",
} as const;

function exchangeLine(x: Exchange): string {
  switch (x.kind) {
    case 'social':
      return EXCHANGE_LINE.social;
    case 'playful':
      return x.wantsJoke ? EXCHANGE_LINE.joke : EXCHANGE_LINE.playful;
    case 'personal':
      return x.saidFeeling === 'up' ? EXCHANGE_LINE.up : EXCHANGE_LINE.down;
    case 'brainstorm':
    case 'discussion':
    case 'disagreement':
      return EXCHANGE_LINE[x.kind];
    default:
      return '';
  }
}

/**
 * A few words in, a few words out: their message's length and manner, when it
 * is talk — small talk, joking, something personal. Not for a discussion ("is
 * free will real?" is short and deserves more than a line), not for an opening
 * thought, and not for work, whose length the work decides.
 */
function mannerLine(x: Exchange): string {
  if (x.manner.words > 12 || !TALK.has(x.kind)) return '';
  return x.manner.casual ? 'Their message is short and casual; so is the answer — a line or two.' : 'Their message is short; so is the answer.';
}

/**
 * The turn's block: what kind of exchange this is, who does what, and the
 * move. Short, because it is read every turn and it rides after the history,
 * outside the cache.
 *
 * WORK GETS THE ALLOCATION; TALK GETS ITS OWN LINE. "You do: look things up,
 * check, organise and format, and do the arithmetic" and "the useful answer
 * first" rode on every turn, a hello included, and told the reply that every
 * message was a job. A task still gets all of it. Small talk, joking and
 * something personal get one line about the exchange instead — there is no
 * labour to divide in a hello. What stays theirs — a decision, the substance
 * of their writing — is said whenever the split reserves it, whatever the
 * exchange, because Human-First does not lapse in a friendly register.
 */
export function renderAllocation(a: RuntimeAllocation, st: TurnState): string {
  const x = st.exchange;
  const lines: string[] = [];
  if (x.kind === 'task') {
    lines.push(DOMAIN_LINE[st.domain], `You do: ${a.does.join('; ')}.`);
    if (a.supports.length) lines.push(`You support: ${a.supports.join('; ')}.`);
    if (a.theirs.length) lines.push(`Theirs: ${a.theirs.join('; ')}.`);
    if (st.preferences.answerFirst) lines.push('They asked for the answer: give it first.');
    if (x.saidFeeling) lines.push(ON_TASK[x.saidFeeling]);
    else if (x.joking) lines.push(ON_TASK.joking);
  } else {
    const line = exchangeLine(x);
    if (line) lines.push(line);
    if (x.aboutSocria) lines.push(ABOUT_SOCRIA_LINE);
    if (a.supports.length && !TALK.has(x.kind)) lines.push(`You support: ${a.supports.join('; ')}.`);
    if (a.theirs.length && x.kind !== 'social' && x.kind !== 'playful') lines.push(`Theirs: ${a.theirs.join('; ')}.`);
    const manner = mannerLine(x);
    if (manner) lines.push(manner);
  }
  const move = renderAssist(a.assist).replace(/^\s+/, '');
  if (!lines.length && !move) return '';
  return `\n\n=== This turn ===\n${lines.join('\n')}\n${move}`;
}
