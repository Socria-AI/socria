// lib/runtime/replay.ts — CORE 4'S STATE, CARRIED THROUGH THE CONVERSATION.
//
// Core 4 keeps a CognitiveState per conversation. Each turn its model reader
// reads the message, `mergeState` folds that reading into what was already
// known — their explicit words win, a standing "don't tell me" holds until
// they say otherwise, a bare "just tell me" fades, a learning goal they stated
// stays stated, being heard holds until they ask for something — and
// `recordTurn` notes what the turn held back and whether their attempt landed.
// `allocate` reads all of it: the practice ladder counts attempts that failed
// under a withhold, a withhold has to quote the words it rests on, and the
// first one in a conversation is announced.
//
// LOGOS 5 KEPT NONE OF THAT. Its state (state.ts) is recomputed every turn and
// written nowhere, and its signals were read from the newest message alone —
// so "I want to work these out myself" on the first message was forgotten by
// the third, and nothing could ever bottom out, because nothing remembered the
// attempts before this one.
//
// This is Core 4's state without its store and without its model reader. The
// conversation the client already sends is replayed through Core 4's own
// `mergeState`, `allocate` and `recordTurn`, one message of theirs at a time,
// with Logos 5's deterministic readers standing in for the model: the same
// rules, decided by the same code, and nothing kept anywhere — the transcript
// is the state. A Project's standing instructions are the contract, exactly as
// Core 4 reads them.
//
// WHAT THE READERS CANNOT SEE, they leave at Core 4's defaults rather than
// guess: there is no inferred learning goal, no inferred expertise, no
// inferred stakes. Core 4's allocator was built for that — an inference never
// withholds anything — so a missing reading only ever means more help.
//
// Pure. No model, no network, no clock.

import { planTurn } from '../accuracy/accuracy';
import { EMPTY_STATE, type Attempt, type CognitiveState, type Latest } from '../cognition/state';
import { allocate as coreAllocate } from '../core4/allocation';
import { mergeState, recordTurn } from '../core4/merge';
import { questionLoad } from '../core4/questions';
import { readContract, readSignals } from '../core4/signals';
import { mustNotPerform } from '../core4/split';
import type { Allocation, ExplicitSignals, WorkKind } from '../core4/types';
import { routeTurn, type Intent } from './orchestrate';
import { readTurnState, type TurnState } from './state';

export interface ReplayMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ReplayInput {
  /** the conversation before this turn, oldest first */
  history: readonly ReplayMessage[];
  /** their message this turn */
  text: string;
  /** this turn's signals, already read by the route */
  signals: ExplicitSignals;
  /** this turn's claims of theirs, as the math engine decided them */
  checked?: readonly { status: string }[];
  /** the engine computed the answer to what they asked this turn (accuracy.computed) */
  asked?: boolean;
  /** this turn's intent, already read by the route (routeTurn); read here if absent */
  intent?: Intent;
  /** their Project's standing instructions, when the conversation is in one */
  instructions?: string | null;
}

export interface Replayed {
  /** Core 4's state for this turn, with the conversation behind it */
  state: CognitiveState;
  /** Core 4's allocation for this turn */
  allocation: Allocation;
  /** the Project's standing instructions, read as Core 4 reads them */
  contract: ExplicitSignals;
}

/** How many of their earlier messages have their claims re-checked, for the ladder. */
export const LADDER_WINDOW = 4;
/**
 * How many of their latest messages are read in full and allocated. Core 4
 * remembers eight turns (merge.ts HISTORY); what was said before these is
 * folded in for its words alone — a learning goal, "don't tell me", graded
 * work — which is all Core 4 carries that far either.
 */
export const FULL_WINDOW = 12;
/** Long messages are read for signals by their first part; a pasted chapter is not an instruction. */
const READ_CHARS = 6000;

/** How their attempt went, by the engine's verdicts on their claims. */
export function attemptOf(checked: readonly { status: string }[]): Attempt {
  const wrong = checked.some((c) => c.status === 'refuted');
  const right = checked.some((c) => c.status === 'verified');
  return wrong && right ? 'partial' : wrong ? 'wrong' : right ? 'right' : 'none';
}

const REQUESTS: ReadonlySet<WorkKind> = new Set(['information', 'explanation', 'execution', 'creation', 'research', 'diagnosis', 'judgment', 'practice']);

/** What their message did, in Core 4's words, as far as code can tell. */
export function latestOf(text: string, work: WorkKind, attempt: Attempt): Latest {
  if (attempt !== 'none' || work === 'verification') return 'attempt';
  if (/\?\s*$/.test(text.trim())) return 'question';
  if (REQUESTS.has(work)) return 'request';
  if (work === 'conversation') return 'reaction';
  return 'other';
}

/** Core 4's task kind, from the runtime's reading of the work. */
export function taskKindOf(st: Pick<TurnState, 'work'>, s: ExplicitSignals): CognitiveState['taskKind'] {
  switch (st.work) {
    case 'judgment':
      return 'decide';
    case 'creation':
      return 'create';
    case 'information':
      return 'lookup';
    case 'diagnosis':
      return 'debug';
    case 'reflection':
      return s.vent ? 'vent' : 'explore';
    case 'practice':
      return 'learn';
    default:
      return s.learningGoal === true ? 'learn' : 'explore';
  }
}

/**
 * The reading Core 4's model would have made of one message — the parts code
 * can make, and Core 4's defaults for the rest. Explicit preferences are NOT
 * set here: `mergeState` sets them from the signals, with their words as the
 * evidence, which is what lets a withhold quote them.
 */
export function readFor(
  text: string,
  before: readonly ReplayMessage[],
  signals: ExplicitSignals,
  checked: readonly { status: string }[],
  // An earlier message's intent changes nothing Core 4 decides — a picture
  // asked for is work, never a withhold — and reading it is the costliest
  // thing here (routeTurn), so earlier messages are read as conversation.
  intent: Intent = 'conversation'
): CognitiveState {
  const st = readTurnState({ text, history: before, signals, intent, checked });
  const attempt = attemptOf(checked);
  return {
    ...EMPTY_STATE,
    currentGoal: st.objective,
    currentFocus: text.replace(/\s+/g, ' ').trim().slice(0, 200),
    taskKind: taskKindOf(st, signals),
    work: st.work,
    attempt,
    latest: latestOf(text, st.work, attempt),
    stuck: signals.frustration ? 'frustrated' : signals.dontKnow ? 'stalled' : 'no',
    urgency: signals.urgent ? 'high' : 'none',
  };
}

/** An earlier message, decided again by the engine: their claims (the only way to know an attempt failed) and whether it asked for something computable. */
function engineAt(text: string, before: readonly ReplayMessage[]): { checked: { status: string }[]; asked: boolean } {
  try {
    const p = planTurn({ lastUserText: text, history: before, withhold: false });
    return { checked: p.theirs.map((v) => ({ status: v.status })), asked: p.computed.some((c) => !!c.result) };
  } catch {
    return { checked: [], asked: false };
  }
}

/**
 * A COMPUTATION THEY ASKED FOR, WHILE PRACTISING, IS THE EXERCISE. "What is
 * the derivative of x³ sin x?" reads to the runtime's readers as a question of
 * fact, and Core 4 never holds a plain fact back — so someone who had said
 * they want to work these out themselves was handed the answer to the
 * exercise. Where the engine computed an answer to what they asked AND they
 * have said, in so many words, that they are practising (a learning goal they
 * stated, or "don't tell me" / "hints"), it is read as the practice it is.
 * Anyone else asking the same thing still gets a fact's answer.
 */
function practising(s: CognitiveState): boolean {
  const learning = s.learningGoal.source === 'explicit' && s.learningGoal.value === 'yes';
  const boundary = s.directness.source === 'explicit' && (s.directness.value === 'no_answer' || s.directness.value === 'guidance');
  return learning || boundary;
}

/**
 * GRADED STAYS GRADED. Core 4 reads "this is for my graded assignment" from the
 * message that says it (or a Project), and its state has nowhere to keep it — so
 * the next "just give me the answer" found nothing graded and handed the
 * submittable answer over. Work they said they will submit is still that work
 * two messages later. Once said, it rides on every later request for the answer,
 * with their own words as the evidence, until they say otherwise.
 */
function graded(signals: ExplicitSignals, said: string | null): ExplicitSignals {
  if (!said || signals.assessment) return signals;
  const asking = signals.directness === 'answer' || signals.delegate || signals.answersOnly;
  return asking ? { ...signals, assessment: true, evidence: [...signals.evidence, said].slice(0, 8) } : signals;
}

/** "It's not graded", "this isn't for a grade": the conversation's graded work, taken back. */
const NOT_GRADED = /\b(?:(?:it|this|that)(?:'s| is)? not (?:graded|for (?:a )?(?:grade|marks?|credit))|(?:isn'?t|not) (?:graded|being graded|for (?:a )?grade)|ungraded|practice (?:problem|question|set), not (?:graded|homework))\b/i;

/**
 * The conversation, replayed through Core 4: every message of theirs merged
 * into the state in turn, each earlier turn allocated and recorded, and this
 * turn allocated last.
 */
export function replayConversation(i: ReplayInput): Replayed {
  const contract = readContract(i.instructions ?? null);
  const turns: ReplayMessage[] = [...i.history.filter((m) => m.role === 'user' || m.role === 'assistant'), { role: 'user', content: i.text }];
  const mine = turns.map((m, at) => (m.role === 'user' ? at : -1)).filter((at) => at >= 0);
  const recheckFrom = Math.max(0, mine.length - 1 - LADDER_WINDOW);
  const fullFrom = Math.max(0, mine.length - FULL_WINDOW);
  let state: CognitiveState | null = null;
  // their words the first time they said the work is graded
  let gradedSaid: string | null = null;
  for (let k = 0; k < mine.length; k++) {
    const at = mine[k];
    const now = k === mine.length - 1;
    const text = String(turns[at].content ?? '');
    const before = turns.slice(0, at);
    const read0 = now ? i.signals : readSignals(text.slice(0, READ_CHARS));
    if (NOT_GRADED.test(text)) gradedSaid = null;
    const signals = graded(read0, gradedSaid);
    if (read0.assessment && !gradedSaid) gradedSaid = (read0.evidence.join('; ') || text).slice(0, 120);
    if (k < fullFrom) {
      // Long ago: what they said, and nothing else.
      state = mergeState({ prior: state, read: EMPTY_STATE, signals, contract, readOk: true });
      continue;
    }
    const engine = now ? { checked: [...(i.checked ?? [])], asked: !!i.asked } : k >= recheckFrom ? engineAt(text, before) : { checked: [], asked: false };
    const read = readFor(text, before, signals, engine.checked, now ? (i.intent ?? routeTurn({ text }).intent) : 'conversation');
    const once: CognitiveState = mergeState({ prior: state, read, signals, contract, readOk: true });
    const merged: CognitiveState =
      engine.asked && once.work === 'information' && practising(once) ? { ...once, work: 'practice', taskKind: 'learn' } : once;
    const allocation = coreAllocate({ state: merged, signals, contract, lastUserText: text });
    if (now) return { state: merged, allocation, contract };
    // What the turn actually did, from what was actually sent: the reply that
    // followed this message, if there was one.
    const next = mine[k + 1] ?? turns.length;
    const reply = turns.slice(at + 1, next).find((m) => m.role === 'assistant');
    state = recordTurn(merged, {
      type: allocation.mode,
      family: 'logos5',
      reason: allocation.reasonCode,
      questions: reply ? questionLoad(reply.content) : 0,
      withheld: !!allocation.withhold,
      failed: read.attempt === 'wrong' || read.attempt === 'partial',
      reserved: mustNotPerform(allocation.split),
    });
  }
  // Unreachable: the loop always reaches this turn's message, which returns.
  throw new Error('replayConversation: no message of theirs');
}
