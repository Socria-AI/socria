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
  const assist = chooseAssist({ ...i.assist, signals: i.signals });

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
 * The turn's block: the context, who does what, and the move. Short, because
 * it is read every turn and it rides after the history, outside the cache.
 */
export function renderAllocation(a: RuntimeAllocation, st: TurnState): string {
  const lines = [DOMAIN_LINE[st.domain], `You do: ${a.does.join('; ')}.`];
  if (a.supports.length) lines.push(`You support: ${a.supports.join('; ')}.`);
  if (a.theirs.length) lines.push(`Theirs: ${a.theirs.join('; ')}.`);
  if (st.preferences.answerFirst) lines.push('They asked for the answer: give it first.');
  const move = renderAssist(a.assist);
  return `\n\n=== This turn ===\n${lines.join('\n')}\n${move.replace(/^\s+/, '')}`;
}
