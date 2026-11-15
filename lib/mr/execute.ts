// lib/mr/execute.ts — THE REGULATORY EXECUTION LAYER.
//
// A decision is worth what the runtime enforces of it. This module turns the
// decision in force into the four things the Logos route can act on:
//
//   assist    ACS's move, narrowed (AssistDecision: mode, questions, scaffold,
//             reasons). Everything downstream already obeys it: the per-turn
//             block renders it, the presentation planner and the inline gate
//             read its question budget, and the stream gate enforces that
//             budget on the reply (lib/core4/stream-gate.ts).
//   ceiling   a lower max_tokens — a hard limit the model cannot exceed.
//   gate      code-level filters on the reply: every interrogative sentence
//             dropped when they told it to stop asking (hard, not tail-only),
//             and improvement claims with no evidence behind them dropped.
//   block     the few instruction lines the controls that live only in the
//             prompt need (a worked example first, simpler words). These are
//             measured afterwards (lib/mr/outcome.ts), never assumed.
//
// PRECEDENCE IS APPLIED HERE, in a fixed order, before anything is compiled
// (lib/mr/types.ts PRECEDENCE). Each layer can only take something OUT of the
// decision, and what it took is recorded as `layer:control`
// (MRDecision.constrainedBy) — so a trace says not only what MR did, but
// what it was not allowed to do and why:
//
//   safety            a safety turn is left exactly as ACS made it
//   user_instruction  their words THIS turn — as IFR confirmed them — beat any
//                     carried adjustment: they ask for questions → MR does
//                     not lower the budget; they want to work it out → MR
//                     does not hand it over; they ask for questions as
//                     CONTENT (a list for an interview, a draft to a friend)
//                     → a carried "stop asking" keeps questions to THEM out
//                     at the tail, but does not cut what they asked for.
//                     Under a policy with params.precision, also what they
//                     asked for earlier and still in force ("show me the
//                     steps"), their written instructions (a closing
//                     question, thorough answers) and a request this turn for
//                     a full piece, code or writing: each takes MR's OWN
//                     narrowing back (a precision "no question", a ceiling MR
//                     set), never theirs, and never past ACS or the route
//   app_policy        the Answer Guard and a Core 4 withhold (their own quoted
//                     words, their Project, graded work) are never loosened:
//                     MR may lower questions or change the explanation under
//                     them, never give away what they keep
//   acs               (a policy with params.precision) a diagnose or a next
//                     step that ACS's move cannot carry is taken out
//   acs → mr          what is left narrows ACS's move
//
// MR NEVER LOOSENS ACS EXCEPT ON THEIR WORDS: the one widening — a question
// allowed back in a quiz they asked for — rests on the user-instruction layer
// above ACS, and is marked as such.
//
// Pure.

import type { AssistDecision } from '../cognition/assist';
import type { ExplicitSignals, ReplyLength } from '../core4/types';
import type { CoreView } from '../runtime/allocation';
import type { GateControls, MRDecision, ObservationCode, TypedControls } from './types';

export interface ExecuteInput {
  decision: MRDecision;
  /** ACS's move before MR */
  acs: AssistDecision;
  core: CoreView | null;
  /** readSignals on their newest message (safety, and the two narrow directness readings) */
  signals: ExplicitSignals;
  /**
   * Their words this turn as IFR confirmed them (the newest turn's explicit.*
   * codes). readSignals' raw fields read "don't quiz me", "the exam will test
   * me" and "let me know" as the opposite of what was said; precedence acts
   * on what was said. Absent: nothing said this turn.
   */
  said?: ReadonlySet<ObservationCode>;
  /** they asked for questions as content, or for writing addressed to someone else (lib/mr/ifr.ts writingForOthers) */
  questionsAsContent?: boolean;
  /** the Answer Guard is up */
  guard: boolean;
  /** the turn reads as mathematics (recorded; the Answer Guard binds on every turn it is up) */
  math: boolean;
  length: ReplyLength | null;
  /** the route's own ceiling */
  maxReply: number;
  /** Socria's recent replies that asked something, newest last (for questionWindow) */
  recentAsking: readonly boolean[];
  /** working it out is theirs, with Socria's support (Core 4's split: reasoning, scaffold) */
  scaffold?: boolean;
  /**
   * The rule ids of the decisions composed into this one. Passed only under a
   * policy with params.precision: their presence switches on the precision
   * takes in constrain() and the lines keyed to a trigger in renderControls,
   * so a policy without it compiles exactly as before.
   */
  triggers?: readonly string[];
  /** the decision's evidenceRefs codes (precision only), e.g. request.missing_referent */
  evidence?: readonly string[];
  /**
   * What their standing written instructions ask for (MRTurnInput.context.style;
   * precision only): a closing question takes back a "no question" that only
   * MR's precision readings set, thorough answers take back MR's own ceilings.
   */
  style?: { questions?: boolean; length?: boolean };
  /**
   * Their message this turn asks for a full piece, code or writing, or for more
   * of one (lib/mr/index.ts fullPieceAsked; precision only): MR's own ceilings
   * do not stand against it.
   */
  fullPiece?: boolean;
  /**
   * Their own try or their quiz is read as practice this turn (observed.practice;
   * precision only), whether or not its rule is in force: "I want to try it
   * myself, just give me hints" also reads as a request for the answer, and the
   * two rules stand each other down. The lines keep their answer theirs.
   */
  ownTry?: boolean;
}

export interface Executed {
  assist: AssistDecision;
  block: string;
  ceiling: number | null;
  gate: GateControls;
  /** the decision with what precedence took out of it — its controls are the ones that survived */
  decision: MRDecision;
  /** something reached the turn: a control survived precedence and the decision is not 'none' */
  enforced: boolean;
  /** a safety turn: left exactly as ACS made it, the reply filters included */
  safety: boolean;
}

const NO_GATE: GateControls = { hardNoQuestions: false, dropUnsupportedClaims: false };

/**
 * ACS's moves that can carry a diagnose: an explanation, an open reply or a
 * perspective lead with substance and have room for one question about what
 * they mean. A fact given (inform), a check of their work (verify), a
 * question put to them (ask), a challenge to an assumption, room to be heard
 * (space) or a build (construct) cannot, and a move about something they
 * pointed at (assist.target) already knows what they mean.
 */
const DIAGNOSABLE: ReadonlySet<string> = new Set(['explain', 'open', 'perspective']);
/**
 * The precision rules whose "no question this turn" (tail) their written
 * instructions can take back: a correction, a question asked for something
 * already said or asked again, stuck with their work shown, and stuck again.
 * Readings of MR's, each of them, never a request of theirs.
 */
const PRECISION_NO_QUESTION: ReadonlySet<string> = new Set(['ifr.explicit.corrected', 'ifr.observed.redundant_question', 'mr.observed.repeated_stuck', 'mr.explicit.stuck']);
/**
 * The rules that set nothing lowering questions: with these beside the rules
 * above, the "no question" is still only MR's own reading. Any other trigger
 * (their stop, "show me the steps", questions that were not helping, a
 * routine task, a deliberation, a trigger this list does not know) keeps it.
 */
const SETS_NO_QUESTION_LIMIT: ReadonlySet<string> = new Set([
  'mr.explicit.quiz',
  'mr.explicit.own_try',
  'ifr.explicit.shorter',
  'mr.explicit.simpler',
  'mr.explicit.verify',
  'mr.explicit.knows_that',
  'ifr.observed.late_answer',
  'ifr.observed.verbose_replies',
  'ifr.observed.repeated_background',
  'mr.observed.fix_failed',
  'ifr.explicit.stuck',
  'ifr.observed.open_request',
]);
/** The rules that set a ceiling. A diagnose the ACS layer takes out keeps any ceiling one of the others set. */
const CEILING_RULES: ReadonlySet<string> = new Set([
  'ifr.explicit.shorter',
  'ifr.observed.verbose_replies',
  'ifr.observed.late_answer',
  'ifr.observed.repeated_background',
  'ifr.observed.open_request',
  'mr.deliberate',
]);

/**
 * A broad open request (precision only): a diagnose resting on a vague outcome or a broad subject, with no problem
 * of theirs in hand — no withhold, no own try or quiz in force (noRevealAnswers), and not a missing referent. There
 * is no answer of theirs to keep, so neither the Answer Guard nor the scaffold layer keeps one: constrain records no
 * keeps_answer for its diagnose, and its lines are the open ones (renderControls broadOpen). One test for both, so
 * the trace never claims a kept answer the prompt does not carry (N8, N9).
 */
function broadOpenOf(i: ExecuteInput, c: TypedControls): boolean {
  const evidence = i.evidence ?? [];
  return (
    !!i.triggers &&
    !i.core?.withhold &&
    !c.noRevealAnswers &&
    !i.ownTry &&
    (evidence.includes('request.vague_outcome') || evidence.includes('request.broad_subject')) &&
    !evidence.includes('request.missing_referent')
  );
}

/** Apply the layers above MR. Returns the controls that survive and what was taken out. */
export function constrain(i: ExecuteInput): { controls: TypedControls; constrainedBy: string[] } {
  const c: TypedControls = JSON.parse(JSON.stringify(i.decision.controls ?? {}));
  const by: string[] = [];
  const take = (layer: string, ...keys: (keyof TypedControls)[]) => {
    for (const k of keys) {
      if (c[k] === undefined) continue;
      delete c[k];
      by.push(`${layer}:${k}`);
    }
  };
  const s = i.signals;

  // 1. SAFETY: nothing changes.
  if (s.safety || i.acs.reasons.includes('safety')) {
    take('safety', ...(Object.keys(c) as (keyof TypedControls)[]));
    return { controls: c, constrainedBy: by };
  }

  // 2. THEIR WORDS THIS TURN.
  const said = i.said ?? new Set<ObservationCode>();
  // (a quiz asked for together with the answer is neither: their stop holds that turn too)
  const askingForQuestions = !(said.has('explicit.quiz') && said.has('explicit.direct_answer')) && (said.has('explicit.wants_questions') || said.has('explicit.quiz'));
  if (askingForQuestions && c.questionBudget?.max === 0) take('user_instruction', 'questionBudget', 'questionWindow');
  else if (i.questionsAsContent && c.questionBudget?.max === 0 && c.questionBudget.enforcement === 'hard') {
    c.questionBudget = { max: 0, enforcement: 'tail' };
    by.push('user_instruction:questionBudget.hard');
  }
  // (a learning goal stated is not one: "I'm learning Spanish. What's the word for apple?" asks for the word — round-5 #14)
  // (readSignals' own directness only where IFR did not confirm a request for the answer: "give me the answer, not
  // just a hint" is one)
  const keepingItTheirs = said.has('explicit.own_work') || (!said.has('explicit.direct_answer') && (s.directness === 'no_answer' || s.directness === 'guidance'));
  if (keepingItTheirs) {
    if (c.strategy === 'direct' || c.strategy === 'execute') take('user_instruction', 'strategy');
    if (c.answerFirst && !said.has('explicit.direct_answer')) take('user_instruction', 'answerFirst');
  }
  // Their newest words ask for the answer or the steps: nothing is kept back
  // this turn (the policy revokes a quiz on these words; this is the backstop).
  if (said.has('explicit.direct_answer') || said.has('explicit.show_steps')) {
    if (c.strategy === 'preserve_challenge') take('user_instruction', 'strategy');
    if (c.noRevealAnswers) take('user_instruction', 'noRevealAnswers');
    // a locating question or a single step hands over less than they asked for
    if (c.strategy === 'diagnose' || c.strategy === 'next_step') take('user_instruction', 'strategy');
  }
  // ("more detail" this turn revokes a carried "shorter" in the policy itself: explicit.longer is on its onRevoke list)
  // A ceiling MR set itself (repeated background, a re-ask, an open request) does not stand against their "detailed"
  // setting, their request for the answer or the steps (this turn, or earlier and still in force), written
  // instructions that ask for thorough answers, or a request this turn for a full piece, code or writing ("now turn
  // those bullet points into a full study guide", "write the script that benchmarks it"). Their own "shorter",
  // carried or said now, is theirs and stays.
  if (
    i.triggers &&
    c.verbosity &&
    !i.triggers.includes('ifr.explicit.shorter') &&
    !said.has('explicit.shorter') &&
    (i.length === 'detailed' ||
      said.has('explicit.direct_answer') ||
      said.has('explicit.show_steps') ||
      i.triggers.includes('ifr.explicit.direct_answer') ||
      i.triggers.includes('ifr.explicit.show_steps') ||
      i.style?.length === true ||
      i.fullPiece === true)
  ) {
    take('user_instruction', 'verbosity');
  }
  // Their written instructions ask for a closing question (one that checks their understanding, a quiz): a "no
  // question this turn" that only MR's own precision readings set goes back to ACS's budget, never above it. Their
  // stop (hard), and a lowering any other rule or their own words made, stand: one such trigger and nothing is taken.
  if (
    i.triggers &&
    i.style?.questions === true &&
    c.questionBudget?.max === 0 &&
    c.questionBudget.enforcement === 'tail' &&
    i.triggers.some((t) => PRECISION_NO_QUESTION.has(t)) &&
    i.triggers.every((t) => PRECISION_NO_QUESTION.has(t) || SETS_NO_QUESTION_LIMIT.has(t))
  ) {
    delete c.questionBudget;
    by.push('user_instruction:questionBudget.style');
    if (c.questionWindow) {
      delete c.questionWindow;
      by.push('user_instruction:questionWindow.style');
    }
  }

  // 3. APPLICATION POLICY: the Answer Guard and a Core 4 withhold are never loosened.
  // The guard's block is in the prompt whenever it is up, so it binds on every
  // turn — "just tell me the answer" is a turn with no maths in it, and the
  // one where loosening it matters most.
  const guarded = i.guard;
  const withheld = !!i.core?.withhold;
  // …and a turn they are working through with Socria keeps its scaffold, unless their words this turn ask for the
  // whole answer or the full working (second adversarial round, November 2026)
  const scaffolded = !!i.scaffold && !said.has('explicit.direct_answer') && !said.has('explicit.show_steps');
  if (guarded || withheld || scaffolded) {
    const layer = withheld ? 'app_policy:withhold' : guarded ? 'app_policy:guard' : 'app_policy:scaffold';
    if (c.strategy === 'direct' || c.strategy === 'execute') {
      delete c.strategy;
      by.push(`${layer}:strategy`);
    }
    if (c.answerFirst) {
      delete c.answerFirst;
      by.push(`${layer}:answerFirst`);
    }
    if (c.scaffolding === 'less') {
      delete c.scaffolding;
      by.push(`${layer}:scaffolding`);
    }
    // a worked example stays: of an ANALOGOUS problem only (renderControls), never theirs
    if (c.strategy === 'worked_example') by.push(`${layer}:strategy.analogous`);
    // fewer questions stays, as hints rather than "give your best answer now" (renderControls)
    if (c.questionWindow) by.push(`${layer}:questionWindow.hint`);
    // a locating question or a next step stays, as a pointer that gives nothing of their answer away (renderControls);
    // a broad open request has no answer of theirs to keep, and its diagnose is the open one (broadOpenOf)
    if ((c.strategy === 'diagnose' && !broadOpenOf(i, c)) || c.strategy === 'next_step') by.push(`${layer}:strategy.keeps_answer`);
  }

  // 3b. ACS'S MOVE (precision only). MR narrows the move ACS chose; it does not
  // replace it. A diagnose needs a move that leads with substance and has room
  // for one question about what they mean: on any other move (a fact given, a
  // check of their work, a question already put, a move about something they
  // pointed at) the diagnose goes, with the question it allowed and the
  // ceiling it brought; a ceiling another rule set stays. A next step is not
  // given on room to be heard or on a build. A missing referent stays on a
  // check or a fact given ("Can you check this?", "Translate this" with
  // nothing there): its line asks for the thing, or says what is needed when
  // ACS put no question, and a check of nothing or a translation of nothing is
  // no move to keep (F24). Never above ACS's budget: its question is ACS's own.
  if (i.triggers) {
    const missingReferent = (i.evidence ?? []).includes('request.missing_referent') && (i.acs.mode === 'verify' || i.acs.mode === 'inform') && !i.acs.target;
    if (c.strategy === 'diagnose' && !missingReferent && (!DIAGNOSABLE.has(i.acs.mode) || !!i.acs.target)) {
      take('acs', 'strategy');
      if (c.questionBudget?.max === 1) take('acs', 'questionBudget');
      if (c.verbosity && i.triggers.filter((t) => CEILING_RULES.has(t)).every((t) => t === 'ifr.observed.open_request')) take('acs', 'verbosity');
    }
    if (c.strategy === 'next_step' && (i.acs.mode === 'space' || i.acs.mode === 'construct')) take('acs', 'strategy');
  }

  // A heard turn ("I just need to vent") is room, whatever was carried.
  if (i.core?.mode === 'HUMAN_REFLECTS') {
    take('app_policy:heard', 'strategy', 'answerFirst', 'verification', 'simplify', 'scaffolding');
  }
  return { controls: c, constrainedBy: by };
}

/**
 * MR decides before the reply's shape is planned, so its direct line names "the answer, or the steps in order"
 * whatever is offered. Fitted to the block the turn offers (second adversarial round, November 2026): a decision
 * laid out to weigh gets the read once, after it; steps get the steps; any other block carries the rest; with
 * nothing offered, the answer.
 */
const DIRECT_LINE = 'THEY ASKED FOR IT DIRECTLY. Give it now and first — the answer, or the steps in order (as the block below, when one is offered) — with no diagnostic question before it.';
export function fitControlsToForms(block: string, p: { forms: readonly string[]; lean?: boolean }): string {
  if (!block || !block.includes(DIRECT_LINE)) return block;
  const line = p.forms.includes('decide')
    ? 'THEY ASKED FOR IT DIRECTLY. The decide block below lays out what it rests on; give your read once, after it, marked as yours — with no diagnostic question before it.'
    : p.forms.some((k) => k === 'sequence' || k === 'steps')
      ? 'THEY ASKED FOR IT DIRECTLY. Give it now and first — the steps in order, as the block below — with no diagnostic question before it.'
      : p.forms.length
        ? 'THEY ASKED FOR IT DIRECTLY. The answer now and first; the block below carries the rest — with no diagnostic question before it.'
        : 'THEY ASKED FOR IT DIRECTLY. Give it now and first — the answer, or the steps in order — with no diagnostic question before it.';
  return block.replace(DIRECT_LINE, line);
}

// The lines of a precision policy (params.precision). Each is rendered from the
// FINAL question budget, after compose, the window, their stop and ACS's own
// budget, so a line that asks can never stand beside "no questions this turn".
// The _KEPT variants are for a turn whose answer stays theirs (the Answer
// Guard, a withhold, and under a precision policy also their own try or a quiz
// in force and the scaffold layer): a pointer, never the answer.

/**
 * The open-request lines outrank the shape and explanation notes placed after MR's block ("Give the chain of causes in
 * order"), which would pull a short point into a long walk-through and, under the ceiling, cut the question off.
 */
const DIAGNOSE_FIRST = ' This outranks the shape and explanation notes below: the point and the question, not a walk through every cause.';
const DIAGNOSE_STATE_FIRST = ' This outranks the shape and explanation notes below: the point and the likeliest reading, not a walk through every cause.';
/** diagnose with a question to spend: the point that holds either way, then the one question that decides the rest */
const DIAGNOSE_ASK =
  'ONE THING THEY HAVE NOT SAID DECIDES THE ANSWER. Lead with the one point that holds whichever way they mean it, in two or three plain sentences — no survey of every reading, no background. Then ask the single question whose answer would most change what you say next, as a plain question about what they mean (not an offer of more help), and end there. If that point already gives them what they need, ask nothing.' +
  DIAGNOSE_FIRST;
const DIAGNOSE_ASK_KEPT =
  'ONE THING THEY HAVE NOT SAID DECIDES THE ANSWER. Lead with one general pointer that holds whichever way they mean it and gives nothing of their answer away, in two or three plain sentences. Then ask the single question whose answer would most change what you say next, as a plain question about what they mean (not an offer of more help), and end there. If that point already gives them what they need, ask nothing.' +
  DIAGNOSE_FIRST;
/** diagnose with no question to spend: the point, then an answer for the likeliest reading, named so they can redirect */
const DIAGNOSE_STATE =
  'ONE THING THEY HAVE NOT SAID DECIDES THE ANSWER, AND THIS TURN ASKS NOTHING. Lead with the one point that holds whichever way they mean it, in two or three plain sentences; then answer for the likeliest reading, naming that reading in a few words so they can redirect you.' +
  DIAGNOSE_STATE_FIRST;
const DIAGNOSE_STATE_KEPT =
  'ONE THING THEY HAVE NOT SAID DECIDES THE ANSWER, AND THIS TURN ASKS NOTHING. Lead with one general pointer that gives nothing of their answer away; then the likeliest next move, naming the reading you took in a few words.' +
  DIAGNOSE_STATE_FIRST;
/** what they point at ("fix this") is not in the conversation */
const MISSING_ASK =
  'WHAT THEY POINT AT IS NOT IN THE CONVERSATION. In a sentence or two, say how you would go about it in general; then ask for the one thing you need to see (the text, the error, the step) as a plain question, and end there.';
const MISSING_STATE =
  'WHAT THEY POINT AT IS NOT IN THE CONVERSATION. In a sentence or two, say how you would go about it in general, and say plainly what you would need to see to help (the text, the error, the step), as a statement, not a question.';
/** "I'm stuck" with nothing of the work visible */
const STUCK_ASK =
  'THEY ARE STUCK AND THE WORK IS NOT IN THE CONVERSATION. In a sentence or two, give one pointer that helps with most blocks of this kind; then ask the single question that would show where they are stuck (or ask them to paste the step), as a plain question, and end there.';
const STUCK_ASK_KEPT =
  'THEY ARE STUCK AND THE WORK IS NOT IN THE CONVERSATION. In a sentence or two, give one general pointer that gives nothing of their answer away; then ask the single question that would show where they are stuck (or ask them to paste the step), as a plain question, and end there.';
const STUCK_STATE =
  'THEY ARE STUCK AND THE WORK IS NOT IN THE CONVERSATION, AND THIS TURN ASKS NOTHING. Give one pointer that helps with most blocks of this kind and the likeliest first move, naming in a few words what you assumed about where they are.';
const STUCK_STATE_KEPT =
  'THEY ARE STUCK AND THE WORK IS NOT IN THE CONVERSATION, AND THIS TURN ASKS NOTHING. Give one general pointer that gives nothing of their answer away and the likeliest first move, naming in a few words what you assumed about where they are.';
/**
 * "I'm stuck" with nothing before it in the conversation (stuck.first): no kind
 * of block is known, so no pointer for one and no guessed first move — ask what
 * they are working on, or say plainly what would let you help. Nothing of an
 * answer is in either, so they serve a kept turn as they are.
 */
const STUCK_FIRST_ASK =
  'THEY ARE STUCK AND THE WORK IS NOT IN THE CONVERSATION. Nothing yet says what they are working on: ask what it is, or ask them to paste the step they are on, in one plain question, and end there.';
const STUCK_FIRST_STATE =
  'THEY ARE STUCK AND THE WORK IS NOT IN THE CONVERSATION, AND THIS TURN ASKS NOTHING. Nothing yet says what they are working on: say plainly what would let you help (the problem, the step they are on, or the error), as a statement, not a question. Do not guess at the task or a first move.';
/**
 * The next step outranks the shape, form and explanation notes placed after MR's block (a graph to use "unless one
 * sentence fully answers them", a method named): what they offer may carry the one step, never more of the work (N3).
 */
const NEXT_STEP_FIRST = ' This outranks the shape and form notes below: a block or element offered there may carry this one step, and nothing past it.';
/** "I'm stuck" with their own work on the table: one step, no question back */
const NEXT_STEP =
  'THEY ARE STUCK WITH WORK ON THE TABLE. Give the one concrete next step that gets them moving from where they are, with its reason in a sentence and how they can tell it worked; if it rests on an assumption about their work, name the assumption in a few words. Then stop: one step, not a walk through the rest, and no question back.' +
  NEXT_STEP_FIRST;
const NEXT_STEP_KEPT =
  'THEY ARE STUCK WITH WORK ON THE TABLE. Give the next step as a hint they can act on from where they are, and how they can tell it worked — the answer itself stays theirs; if it rests on an assumption about their work, name it in a few words. No question back.' +
  NEXT_STEP_FIRST;
/** …with a question left to spend (their written instructions asked for a closing one): the step, and no "no question back" against them */
const NEXT_STEP_ASKS =
  'THEY ARE STUCK WITH WORK ON THE TABLE. Give the one concrete next step that gets them moving from where they are, with its reason in a sentence and how they can tell it worked; if it rests on an assumption about their work, name the assumption in a few words. Then stop: one step, not a walk through the rest.' +
  NEXT_STEP_FIRST;
const NEXT_STEP_ASKS_KEPT =
  'THEY ARE STUCK WITH WORK ON THE TABLE. Give the next step as a hint they can act on from where they are, and how they can tell it worked — the answer itself stays theirs; if it rests on an assumption about their work, name it in a few words.' +
  NEXT_STEP_FIRST;
/**
 * "No, I meant …": the answer to the question as they now put it. It opens by
 * naming what the turn is, because the runtime reads the same message as
 * pushback and its lines ask to weigh an objection and hold a reading: this
 * is a clarification, and there is nothing to hold.
 */
const CORRECTED_LINE =
  'This is a clarification, not a disagreement: THEY CORRECTED YOUR READING OF THE QUESTION. Lead with what they asked for, as they now put it: take the correction as given, do not defend the earlier reading, and do not ask again.';
const CORRECTED_KEPT =
  'This is a clarification, not a disagreement: THEY CORRECTED YOUR READING OF THE QUESTION. Work from the question as they now put it — do not defend the earlier reading, and do not ask again.';
/** their re-ask for the point after a long reply */
const REASKED_LINE = 'THEY ASKED AGAIN FOR THE POINT. Lead with what they asked for in the first sentence; background after it, and only what they need.';
const KNOWS_LINE = 'THEY KNOW THE BACKGROUND. Skip what they have said they know; start at what is new to them.';
/**
 * verification 'suggest': a check they can run before another fix. It opens by naming what the turn is, as the
 * correction line does: the runtime reads "still the same" as pushback and asks to hold a reading with its reason.
 */
const CHECK_LINE =
  'This is a report that the fix did not work, not a disagreement: CHECK BEFORE ANOTHER FIX. What was suggested has not worked: name in a few words the assumption it rested on, give one quick check they can run to confirm or rule it out, and say what to do for each result. Do not repeat a fix they already tried.';
/**
 * The ceiling's line. "They asked for less" is true only where they did (their
 * "shorter", their concise setting); a ceiling MR set on its own reading says
 * what it rests on instead. Without the precision context it is always the
 * first, as it always was.
 */
const SHORT_ASKED = 'SHORT: a few sentences. They asked for less.';
const SHORT_OBSERVED = 'SHORT: a few sentences. The point first; nothing this conversation has already said, and no background they did not ask for.';

/**
 * A line with the length it prescribes taken out, for a turn whose length is
 * theirs to set (their "detailed" setting, written instructions that ask for
 * thorough answers): "In a sentence or two," before a pointer, "in two or
 * three plain sentences" after the point, and "and only what they need" after
 * the background. What the line asks for stays — one point, one question, one
 * step (a single next step is the move, not a length).
 */
function lengthNeutral(line: string): string {
  return line
    .replace('In a sentence or two, say', 'Say')
    .replace('In a sentence or two, give', 'Give')
    .replace(', in two or three plain sentences', '')
    .replace('; background after it, and only what they need.', '; background after it.');
}

/**
 * The few lines the turn's context carries for controls that live in the prompt. '' when none.
 *
 * The optional context (a policy with params.precision only): `questions` is the final budget the diagnose lines are
 * rendered from; `triggers` and `evidence` key a line to the rule behind it (a correction, a re-ask, a missing
 * referent, "I'm stuck", "I'm stuck" with nothing before it); `lengthAsked` false says the ceiling is MR's reading,
 * not their request; `answerKept` says a higher layer took answerFirst out; `detailed` says the length is theirs to
 * set (the lines drop the length they prescribe); `broadOpen` says the diagnose is a broad open request under the
 * Answer Guard alone, with no problem of theirs to keep (its lines are the open ones). Without them the lines are
 * exactly what they were.
 */
export function renderControls(
  c: TypedControls,
  ctx: {
    withheld: boolean;
    hardNoQuestions: boolean;
    ceiling: number | null;
    questions?: 0 | 1;
    triggers?: readonly string[];
    evidence?: readonly string[];
    lengthAsked?: boolean;
    answerKept?: boolean;
    detailed?: boolean;
    broadOpen?: boolean;
  }
): string {
  const lines: string[] = [];
  const neutral = (line: string) => (ctx.detailed ? lengthNeutral(line) : line);
  switch (c.strategy) {
    case 'direct':
      // "the steps in order", not "numbered": with a sequence offered this turn the steps are the block's
      // (lib/runtime/presentation.ts), and a numbered list beside it said them twice
      lines.push(DIRECT_LINE);
      break;
    case 'execute':
      lines.push('A ROUTINE TASK. Do it, plainly and correctly. Do not turn it into an exercise or ask them to work it out.');
      break;
    case 'worked_example':
      lines.push(
        ctx.withheld
          ? 'THE EXPLANATION HAS NOT LANDED. Change the approach: one fully worked example of an ANALOGOUS problem, step by step in plain words — not the one they are working, whose answer stays theirs — then hand their problem back.'
          : 'THE EXPLANATION HAS NOT LANDED. Change the approach: one fully worked example, step by step in plain words; then offer, without requiring it, a similar one for them to try.'
      );
      break;
    case 'preserve_challenge':
      // a practice set asked for is a set, held back — not one question and a wait (evals/explain, §8.11): "quiz me"
      // is asked one at a time; "give me some practice problems" is a short graded set to work through
      lines.push(
        'THEY ASKED TO BE QUIZZED OR TO PRACTISE. Keep the challenge theirs: do not give the answers away unless they ask. "Quiz me" is one question at a time, then wait; practice problems asked for are a short graded set (three to five, easiest first), answers held back, with an offer to check them.'
      );
      break;
    case 'edit_as_asked':
      lines.push('THEIR WRITING, THEIR LEVEL OF HELP. Make only the edits they asked for — no rewrite, no lesson, nothing new in their voice.');
      break;
    case 'guided':
      lines.push(
        c.noRevealAnswers
          ? 'THEY WANT TO TRY IT FIRST. Do not give the answer away: offer the next move or a hint, and let them take it.'
          : 'Let them take the next step: offer the next move, not the finished answer.'
      );
      break;
    case 'diagnose': {
      // from the final budget: with no question left to spend the line states the reading instead of asking
      const q = ctx.questions ?? 0;
      // a broad open request under the guard alone has no answer of theirs to keep: the guard's own rule is to give it
      const kept = ctx.withheld && !ctx.broadOpen;
      if (ctx.evidence?.includes('request.missing_referent')) lines.push(neutral(q ? MISSING_ASK : MISSING_STATE));
      else if (ctx.triggers?.includes('ifr.explicit.stuck') && ctx.evidence?.includes('stuck.first')) lines.push(q ? STUCK_FIRST_ASK : STUCK_FIRST_STATE);
      else if (ctx.triggers?.includes('ifr.explicit.stuck')) lines.push(neutral(q ? (kept ? STUCK_ASK_KEPT : STUCK_ASK) : kept ? STUCK_STATE_KEPT : STUCK_STATE));
      else lines.push(neutral(q ? (kept ? DIAGNOSE_ASK_KEPT : DIAGNOSE_ASK) : kept ? DIAGNOSE_STATE_KEPT : DIAGNOSE_STATE));
      break;
    }
    case 'next_step':
      // (a question left to spend only where their written instructions took the "no question" back: constrain)
      lines.push(ctx.questions === 1 ? (ctx.withheld ? NEXT_STEP_ASKS_KEPT : NEXT_STEP_ASKS) : ctx.withheld ? NEXT_STEP_KEPT : NEXT_STEP);
      break;
    default:
      break;
  }
  // Under the Answer Guard or a withhold the answer stays theirs: fewer questions, never "give your best answer now"
  if (c.questionWindow)
    lines.push(
      ctx.withheld
        ? 'THE QUESTIONS HAVE NOT BEEN HELPING. Stop asking; give them the next step or a hint they can use from what they have already said — the answer itself stays theirs.'
        : 'THE QUESTIONS HAVE NOT BEEN HELPING. Give your best answer now from what they have already said; where something is missing, state the assumption in a few words instead of asking.'
    );
  // (a diagnose line already leads with the point; a correction or a re-ask says what the lead is for; a correction
  // whose answer stays theirs — their own try in force — is worked from as they put it, never answered for them)
  else if (c.answerFirst && c.strategy !== 'direct' && c.strategy !== 'diagnose')
    lines.push(
      ctx.triggers?.includes('ifr.explicit.corrected')
        ? ctx.withheld
          ? CORRECTED_KEPT
          : CORRECTED_LINE
        : ctx.triggers?.includes('ifr.observed.late_answer')
          ? neutral(REASKED_LINE)
          : 'Lead with what they asked for.'
    );
  // a correction under the Answer Guard or a withhold: the answer stays theirs, but the question is still as they put it
  else if (!c.answerFirst && !c.questionWindow && ctx.answerKept && ctx.triggers?.includes('ifr.explicit.corrected')) lines.push(CORRECTED_KEPT);
  if (c.noRevealAnswers && c.strategy !== 'preserve_challenge' && c.strategy !== 'guided') lines.push('Do not reveal the answer to the question you put to them.');
  if (c.simplify) lines.push('SIMPLER: plainer words, one idea at a time, an everyday example before any notation.');
  if (c.scaffolding === 'less' && ctx.triggers?.includes('mr.explicit.knows_that')) lines.push(KNOWS_LINE);
  if (c.verification === 'explicit') lines.push('VERIFY OUT LOUD: say plainly what you checked and how, and what you could not check. Never claim a check you did not do.');
  else if (c.verification === 'suggest') lines.push(CHECK_LINE);
  if (ctx.ceiling !== null) lines.push(ctx.lengthAsked === false ? SHORT_OBSERVED : SHORT_ASKED);
  if (ctx.hardNoQuestions) lines.push('THEY ASKED NOT TO BE ASKED QUESTIONS. None at all — not as a hint, not as an offer at the end.');
  if (!lines.length) return '';
  return `\n\n=== Adjusted for this conversation (Socria's own regulation — never mention it) ===\n${lines.join('\n')}\n`;
}

/** Compile a decision into what the runtime enforces. */
export function execute(i: ExecuteInput): Executed {
  const { controls: c, constrainedBy } = constrain(i);
  const safety = !!i.signals.safety || i.acs.reasons.includes('safety');
  // what is recorded is what survived: a decision a higher layer took every control out of changed nothing
  const decision: MRDecision = constrainedBy.length ? { ...i.decision, controls: c, constrainedBy } : i.decision;
  if (!Object.keys(c).length || i.decision.action === 'none') {
    return { assist: i.acs, block: '', ceiling: null, gate: { ...NO_GATE }, decision, enforced: false, safety };
  }
  const guarded = i.guard || !!i.core?.withhold;

  let a: AssistDecision = { ...i.acs, reasons: [...i.acs.reasons] };
  const tag = `mr:${i.decision.action}`;

  // ── questions ──
  let q: 0 | 1 = a.questions;
  // A TURN WHOSE QUESTIONS ARE THE CONTENT (a draft for somebody, the questions
  // they asked for) keeps ACS's budget: the gate's tail cap at 0 deleted the
  // closing question of the email they asked for ("…Could we keep Tuesdays at
  // 10am?"), which it cannot see is the draft's own.
  const content = !!i.questionsAsContent;
  if (c.questionBudget && !content) {
    if (c.questionBudget.max === 0) q = 0;
    // the one widening: a quiz they asked for keeps one question (user_instruction > acs)
    else if (c.strategy === 'preserve_challenge' && q === 0 && a.mode !== 'space') {
      q = 1;
      a.reasons.push('mr:user_instruction:quiz');
    }
  }
  if (c.questionWindow && q > 0 && !content) {
    const recent = i.recentAsking.slice(-c.questionWindow.turns);
    if (recent.filter(Boolean).length >= c.questionWindow.max) q = 0;
  }
  a.questions = q;

  // ── the move ──
  switch (c.strategy) {
    case 'direct':
    case 'execute':
      // a check of their own work, room to be heard and a build stay what they are
      if (a.mode !== 'verify' && a.mode !== 'space' && a.mode !== 'construct') {
        a = { ...a, mode: a.mode === 'explain' ? 'explain' : 'inform', forced: true, scaffold: 'none', selfExplain: false, retrieval: false };
      }
      break;
    case 'worked_example':
      // Under the Answer Guard or a withhold, ACS's check of their own attempt
      // stays the move; the example (of an analogous problem) is shown inside it.
      if (guarded && a.mode === 'verify') a = { ...a, scaffold: 'steps' };
      else if (a.mode !== 'space') a = { ...a, mode: 'explain', forced: true, scaffold: 'steps', selfExplain: false, retrieval: false };
      break;
    case 'preserve_challenge':
      // the quiz is the move; ACS's own practice reading stays (Core 4 holds the answer when they asked it to)
      if (a.mode === 'inform') a = { ...a, mode: 'ask', forced: false };
      break;
    case 'edit_as_asked':
      if (a.mode === 'ask' || a.mode === 'challenge' || a.mode === 'perspective') a = { ...a, mode: 'open', forced: false, scaffold: 'none' };
      break;
    case 'guided':
      if (a.mode === 'inform' && !i.core?.withhold) a = { ...a, scaffold: 'hint' };
      break;
    case 'diagnose':
      // the one question it allows is the locating one: no self-explanation or recall question beside it
      // (check-ins are not dropped: an offer-shaped diagnostic is the route's to hold back and restore)
      a = { ...a, selfExplain: false, retrieval: false };
      break;
    case 'next_step':
      // one step from where they are, as a hint (or the steps ACS already chose); a challenge to an assumption, a
      // perspective, room to be heard and a build stay what they are
      if (a.mode !== 'space' && a.mode !== 'construct' && a.mode !== 'challenge' && a.mode !== 'perspective')
        a = { ...a, scaffold: a.scaffold === 'steps' ? 'steps' : 'hint', selfExplain: false, retrieval: false };
      break;
    default:
      break;
  }
  if (c.scaffolding === 'more' && a.mode !== 'space') a = { ...a, scaffold: 'steps' };
  if (c.scaffolding === 'less' && a.scaffold === 'hint') a = { ...a, scaffold: 'none' };
  // verification is said, not imposed as a move: the engine's held path already checks what is mathematics
  a.questions = q;
  a.reasons = [...a.reasons, tag, `mr:${i.decision.interventionId.slice(0, 8)}`];

  const ceiling = c.verbosity ? Math.max(120, Math.min(c.verbosity.ceilingTokens, i.maxReply)) : null;
  const hardNoQuestions = c.questionBudget?.max === 0 && c.questionBudget.enforcement === 'hard' && q === 0;
  // Under a precision policy (triggers passed) the SHORT line says "they asked for less" only where they did, and a
  // correction whose answerFirst a higher layer took out still gets its line. q is final here: compose, the window,
  // their stop and ACS's budget have all had their say.
  const lengthAsked = !i.triggers || i.triggers.includes('ifr.explicit.shorter') || i.length === 'concise';
  const answerKept = constrainedBy.some((x) => /^app_policy:(?:guard|withhold|scaffold):answerFirst$/.test(x));
  // The Answer Guard keeps their problem theirs exactly as a withhold does. Under a precision policy the lines keep it
  // wherever the controls do: their own try or a quiz in force (noRevealAnswers survived compose), the scaffold
  // layer, whose keeps_answer constrain records, and their own try read as practice though its rule stood down (said
  // with "just give me hints", which also reads as a request for the answer) — so a worked example is of an analogous
  // problem, fewer questions are hints, a correction is worked from, and the trace never claims a kept answer the
  // prompt does not carry.
  const scaffoldKept = constrainedBy.some((x) => x.startsWith('app_policy:scaffold:'));
  const keptLines = guarded || (!!i.triggers && (!!c.noRevealAnswers || scaffoldKept || !!i.ownTry));
  // a broad open request (no problem of theirs in hand) kept only by the Answer Guard or the scaffold layer: there is
  // no answer of theirs to keep, so its lines are the open ones — and constrain recorded no keeps_answer for it
  const broadOpen = broadOpenOf(i, c);
  // the length is theirs to set: their "detailed" setting, or written instructions that ask for thorough answers
  const detailed = !!i.triggers && (i.length === 'detailed' || i.style?.length === true);
  const block = renderControls(c, {
    withheld: keptLines,
    hardNoQuestions,
    ceiling,
    questions: q,
    triggers: i.triggers,
    evidence: i.evidence,
    lengthAsked,
    answerKept,
    ...(i.triggers ? { detailed, broadOpen } : {}),
  });
  return {
    assist: a,
    block,
    ceiling: ceiling !== null && ceiling < i.maxReply ? ceiling : null,
    // with questions taken away (and not cut wholesale), a mid-reply check-in is dropped too: the tail cap cannot reach it
    // (not where questions are the content they asked for, or the reply is a draft for somebody else: its offers are its own)
    gate: { hardNoQuestions, dropUnsupportedClaims: true, dropCheckIns: c.questionBudget?.max === 0 && q === 0 && !hardNoQuestions && !i.questionsAsContent },
    decision: { ...decision, controls: c },
    enforced: true,
    safety,
  };
}
