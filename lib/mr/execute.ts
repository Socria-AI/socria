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
//                     at the tail, but does not cut what they asked for
//   app_policy        the Answer Guard and a Core 4 withhold (their own quoted
//                     words, their Project, graded work) are never loosened:
//                     MR may lower questions or change the explanation under
//                     them, never give away what they keep
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
  }
  // ("more detail" this turn revokes a carried "shorter" in the policy itself: explicit.longer is on its onRevoke list)

  // 3. APPLICATION POLICY: the Answer Guard and a Core 4 withhold are never loosened.
  // The guard's block is in the prompt whenever it is up, so it binds on every
  // turn — "just tell me the answer" is a turn with no maths in it, and the
  // one where loosening it matters most.
  const guarded = i.guard;
  const withheld = !!i.core?.withhold;
  if (guarded || withheld) {
    const layer = withheld ? 'app_policy:withhold' : 'app_policy:guard';
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
  }
  // A heard turn ("I just need to vent") is room, whatever was carried.
  if (i.core?.mode === 'HUMAN_REFLECTS') {
    take('app_policy:heard', 'strategy', 'answerFirst', 'verification', 'simplify', 'scaffolding');
  }
  return { controls: c, constrainedBy: by };
}

/** The few lines the turn's context carries for controls that live in the prompt. '' when none. */
export function renderControls(c: TypedControls, ctx: { withheld: boolean; hardNoQuestions: boolean; ceiling: number | null }): string {
  const lines: string[] = [];
  switch (c.strategy) {
    case 'direct':
      lines.push('THEY ASKED FOR IT DIRECTLY. Give it now and first — the answer, or the steps numbered in order — with no diagnostic question before it.');
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
      lines.push('THEY ASKED TO BE QUIZZED. Keep it a quiz: one question at a time, then wait. Do not give the answer away unless they ask for it.');
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
  else if (c.answerFirst && c.strategy !== 'direct') lines.push('Lead with what they asked for.');
  if (c.noRevealAnswers && c.strategy !== 'preserve_challenge' && c.strategy !== 'guided') lines.push('Do not reveal the answer to the question you put to them.');
  if (c.simplify) lines.push('SIMPLER: plainer words, one idea at a time, an everyday example before any notation.');
  if (c.verification === 'explicit') lines.push('VERIFY OUT LOUD: say plainly what you checked and how, and what you could not check. Never claim a check you did not do.');
  if (ctx.ceiling !== null) lines.push('SHORT: a few sentences. They asked for less.');
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
  // the Answer Guard keeps their problem theirs exactly as a withhold does
  const block = renderControls(c, { withheld: guarded, hardNoQuestions, ceiling });
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
