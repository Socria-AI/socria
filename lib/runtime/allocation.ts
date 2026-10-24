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
// CORE 4'S ALLOCATOR, WHOLE (replay.ts). Where the route hands over the
// conversation, the split is no longer taken alone: Core 4's `allocate` runs
// over Core 4's state, replayed from the transcript — its eight modes, the
// person's explicit words carried through the conversation, a withhold only
// on their words and always with what they can have instead, the practice
// ladder that bottoms out on repeated failure, graded work, the safety
// override. The Logos move is kept (it reads evidence the allocator does not:
// the engine's verdicts, their map, what they selected) and made to obey the
// allocation: nothing withheld is ever informed.
//
// A HAND-OVER MOVES THE SERVICE, NOT THE COGNITION. Under Core 4's allocator
// "you decide" and "just write it for me" get no questions, full length and
// everything around the work — Socria's view, plainly; every part of a draft
// but its substance — and the choice and the substance stay theirs: that is
// Core 4's invariant, and it came with the allocator. A practical brief ("an
// email to my landlord about the heater") is still simply written.
//
// Without the conversation — LOGOS_ALLOCATION=lite — this is the split and
// the move as they were: an explicit hand-over honoured in full, and only the
// Answer Guard withholding.
//
// Pure. No model, no network, no clock.

import { splitFor, mustNotPerform, CONTRIBUTION } from '../core4/split';
import { ownershipRead } from '../core4/allocation';
import { EMPTY_STATE, type CognitiveState } from '../cognition/state';
import { chooseAssist, renderAssist, type AssistDecision, type AssistInput } from '../cognition/assist';
import { TALK, type Exchange } from '../cognition/register';
import { EVIDENCE_WITHHELD, type Allocation, type AllocationMode, type CognitiveSplit, type ExplicitSignals } from '../core4/types';
import type { TurnState } from './state';
import { replayConversation, type ReplayInput } from './replay';

export interface RuntimeAllocation {
  split: CognitiveSplit;
  /** Core 4's read of whose work this is: handed over, scoped, theirs, unclear, or not a question */
  ownership: 'delegated' | 'scoped' | 'theirs' | 'ambiguous' | null;
  /** the move this turn (the Logos 4 engine), made to obey the allocation */
  assist: AssistDecision;
  /** in words a reply can act on */
  does: string[];
  supports: string[];
  theirs: string[];
  /** Core 4's allocation over the replayed conversation; null without it (LOGOS_ALLOCATION=lite) */
  core: CoreView | null;
}

/** What the reply needs of Core 4's allocation — never shown to the person, never named in a reply. */
export interface CoreView {
  mode: AllocationMode;
  reasonCode: string;
  /** what stays with them and why, on their words — Core 4 sets it on nothing else */
  withhold: Allocation['withhold'];
  /** the first time anything is held back in this conversation */
  announce: boolean;
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
  /**
   * The conversation, for Core 4's allocator (replay.ts): their engine-checked
   * claims this turn, whether the engine computed the answer to what they
   * asked, and their Project's standing instructions. Absent, the split and
   * the move stand alone, as before (LOGOS_ALLOCATION=lite).
   */
  replay?: Pick<ReplayInput, 'checked' | 'asked' | 'instructions'>;
}

/**
 * The move, made to obey the allocation. The Logos engine picks what helps;
 * Core 4 decides what may be given. Where they disagree the allocation wins,
 * and it only ever narrows one thing: a thing they asked to produce is never
 * informed. Safety is never touched.
 */
export function reconcile(assist: AssistDecision, a: Allocation): AssistDecision {
  if (assist.reasons.includes('safety')) return assist;
  const why = [...assist.reasons, `alloc:${a.reasonCode}`];
  // They want to be heard, and said so: room, not advice.
  if (a.mode === 'HUMAN_REFLECTS') return { ...assist, mode: 'space', forced: true, questions: 0, scaffold: 'none', reasons: why };
  // The ladder bottomed out, or they are learning and stuck: this one, worked through.
  if (a.reasonCode === 'practice.bottom_out' || (a.reasonCode === 'practice.stuck' && !a.withhold)) {
    return { ...assist, mode: 'explain', forced: true, questions: 0, scaffold: 'steps', reasons: why };
  }
  if (a.withhold) {
    const stuck = a.reasonCode.endsWith('.stuck');
    if (a.withhold.reason === 'assessment_integrity') {
      // The method in full and an analogous example — the submittable answer stays theirs.
      return { ...assist, mode: 'explain', forced: true, questions: 0, scaffold: 'none', reasons: why };
    }
    // Their own writing: the move stands — critique, structure, craft — and the
    // block says what is theirs. A hint toward "the answer" means nothing here.
    if (a.withhold.reason === 'authorship') return { ...assist, ...(assist.mode === 'inform' ? { mode: 'open' as const, forced: false } : {}), reasons: why };
    if (assist.mode === 'verify') return { ...assist, scaffold: stuck ? 'steps' : 'hint', reasons: why };
    if (assist.mode === 'inform' || assist.mode === 'explain' || assist.mode === 'open') {
      return { ...assist, mode: a.mode === 'AI_VERIFIES' ? 'verify' : 'explain', forced: true, scaffold: stuck ? 'steps' : 'hint', reasons: why };
    }
    return { ...assist, reasons: why };
  }
  // Their attempt, and nothing they asked to keep: the correction itself, not a hint toward it.
  if (a.reasonCode === 'verify.correct' && assist.mode === 'verify') return { ...assist, scaffold: 'none', reasons: why };
  // They handed it over in so many words — "you decide", "just write it", "just
  // tell me": nothing is asked (Core 4: "what changes when they ask this way is
  // that nothing is held back and nothing is asked").
  if (HANDED.has(a.reasonCode) && assist.questions > 0) return { ...assist, questions: 0, reasons: why };
  return assist;
}

const HANDED = new Set(['answer.requested', 'answer.requested.overrides_contract', 'judgment.theirs.asked', 'creation.asked.to.finish']);

/** The split in words a reply can act on. */
function wordsFor(split: CognitiveSplit): Pick<RuntimeAllocation, 'does' | 'supports' | 'theirs'> {
  const does = ['look things up from what you were given, check, organise and format, and do the arithmetic'];
  const supports: string[] = [];
  const theirs: string[] = [];
  if (split.reasoning === 'perform') does.push('work the problem through');
  else if (split.reasoning === 'scaffold') supports.push('their reasoning: the next step, or a check of theirs — the full solution only if they ask for it');
  else supports.push('the reasoning, worked through together');
  if (split.judgment === 'human') theirs.push('the decision: lay out what it rests on and the alternatives; give your own read if they ask; the call is theirs');
  if (split.creativity === 'human') theirs.push('the substance of what they are writing or making: build on their ideas with structure, options and critique, and improve their own sentences — do not hand them a finished piece from nothing');
  return { does, supports, theirs };
}

export function allocate(i: AllocateInput): RuntimeAllocation {
  const text = i.assist.lastUserText;
  const chosen = chooseAssist({ ...i.assist, signals: i.signals, exchange: i.state.exchange.kind });
  if (i.replay) {
    const { allocation: a } = replayConversation({
      history: i.assist.history,
      text,
      signals: i.signals,
      checked: i.replay.checked,
      asked: i.replay.asked,
      instructions: i.replay.instructions,
      intent: i.state.intent,
    });
    return {
      split: a.split,
      ownership: a.ownership,
      assist: reconcile(chosen, a),
      ...wordsFor(a.split),
      core: { mode: a.mode, reasonCode: a.reasonCode, withhold: a.withhold, announce: a.announce },
    };
  }
  const core = coreStateFor(i.state, i.signals);
  const ownership = ownershipRead(text, i.signals, core);
  let split = splitFor({ state: core, signals: i.signals, text, ownership });
  if (ownership === 'delegated') {
    // Core 4 performs a handed-over task with its supporting split; the same here.
    split = { ...split, creativity: 'share', judgment: 'share', reasoning: split.reasoning === 'scaffold' && i.state.preferences.learning ? 'scaffold' : 'perform' };
  }
  return { split, ownership, assist: chosen, ...wordsFor(split), core: null };
}

/**
 * What Core 4 decided, in the few lines a reply needs — Core 4's own wording
 * where it has one (intervene.ts renderDecision, turn.ts). Empty on most
 * turns: a fact, a fix, a draft they handed over decide nothing worth a line.
 */
const REASON_LINE: Record<string, string> = {
  'verify.confirm': 'Their attempt is right: say so plainly, first, and why.',
  'verify.correct': 'Their attempt gets the correction: where it first goes wrong, and what is right.',
  'verify.practice': 'They are practising this: say whether it is right, and exactly where and what kind of error — the redo is theirs.',
  'practice.goal': 'Producing it is the point for them: support at the exact point they are stuck — a check, a pointer, a hint — never the answer.',
  'practice.bottom_out': 'Several attempts on this one have not landed: work it through fully, name the principle, and give the next one back to them.',
  'practice.stuck': 'They are learning this and stuck: explain this one fully; practice resumes on the next.',
  'answer.requested.assessment': 'This is graded work they will submit as their own: explain the method fully and work an analogous example, and say once, plainly, why you are not handing over the submittable answer.',
  'answer.requested.overrides_contract': 'Their newest instruction outranks their standing one: give them what they asked for.',
  'reflect.heard': 'They want to be heard: precise acknowledgement and at most one observation — no advice, no question.',
  'judgment.theirs.asked': 'They asked you to decide: give your view plainly, marked as yours, with the reasons and the one value that would flip it — no questions. The choice itself stays theirs.',
  'creation.asked.to.finish': 'They asked for it finished: do every part that is not the substance, at full length, and ask nothing — and say in one sentence what is still theirs to put in.',
};

function reasonLine(code: string): string {
  if (REASON_LINE[code]) return REASON_LINE[code];
  if (code.endsWith('.stuck')) return 'Several attempts have not landed, or they are lost, and they asked to keep it: much stronger support inside that boundary — an analogous worked example, or the next step outright, stopping before the final one.';
  if (code === 'requested_no_answer' || code === 'agency_boundary') return 'They asked not to be given the answer: check, point and hint — never the answer itself.';
  return '';
}

/** Core 4's lines for this turn: the reason, the withhold in their words, the announcement, what is owed. */
function renderCore(a: RuntimeAllocation, st: TurnState): string[] {
  const c = a.core;
  if (!c) return [];
  const lines: string[] = [];
  const reason = reasonLine(c.reasonCode);
  if (reason) lines.push(reason);
  if (c.withhold) {
    const w = c.withhold;
    lines.push(
      `KEEP WITH THEM: ${w.what}.`,
      w.quote === EVIDENCE_WITHHELD ? 'BECAUSE THEY ASKED FOR THAT, earlier in this conversation.' : `BECAUSE THEY SAID: "${w.quote}"`,
      `THEY CAN HAVE: ${w.alternative}.`,
      `They have a reason to produce it themselves (${w.reason.replace(/_/g, ' ')}). Do not produce it, not even inside an example, a hint or a "for instance". Everything else you can give, give.`
    );
    if (c.announce) {
      lines.push('This is the first time you are holding something back in this conversation: say so once, in a clause, and that they can have it by asking. Do not repeat this in later turns.');
    }
  }
  // PRESERVATION WITHOUT AUGMENTATION IS UNDER-HELP (Core 4, split.ts): a turn
  // that keeps something with them owes a specific contribution, named. Under
  // a withhold, THEY CAN HAVE has already named it.
  const [lead] = mustNotPerform(a.split);
  if (lead && !c.withhold && st.exchange.kind === 'task') lines.push(`What you owe them instead: ${CONTRIBUTION[lead]}.`);
  return lines;
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
  const core = renderCore(a, st);
  if (x.kind === 'task') {
    lines.push(DOMAIN_LINE[st.domain], `You do: ${a.does.join('; ')}.`);
    if (a.supports.length) lines.push(`You support: ${a.supports.join('; ')}.`);
    if (a.theirs.length) lines.push(`Theirs: ${a.theirs.join('; ')}.`);
    // "They asked for the answer" beside a withhold is one instruction arguing with another.
    if (st.preferences.answerFirst && !a.core?.withhold) lines.push('They asked for the answer: give it first.');
    lines.push(...core);
    if (x.saidFeeling) lines.push(ON_TASK[x.saidFeeling]);
    else if (x.joking) lines.push(ON_TASK.joking);
  } else {
    const line = exchangeLine(x);
    if (line) lines.push(line);
    if (x.aboutSocria) lines.push(ABOUT_SOCRIA_LINE);
    if (a.supports.length && !TALK.has(x.kind)) lines.push(`You support: ${a.supports.join('; ')}.`);
    if (a.theirs.length && x.kind !== 'social' && x.kind !== 'playful') lines.push(`Theirs: ${a.theirs.join('; ')}.`);
    // Talk gets Core 4's lines only when they hold something back or ask to be heard.
    if (a.core?.withhold || a.core?.reasonCode === 'reflect.heard') lines.push(...core);
    const manner = mannerLine(x);
    if (manner) lines.push(manner);
  }
  const move = renderAssist(a.assist).replace(/^\s+/, '');
  if (!lines.length && !move) return '';
  return `\n\n=== This turn ===\n${lines.join('\n')}\n${move}`;
}
