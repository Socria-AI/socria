// lib/mr/index.ts — METACOGNITIVE REGULATION, ONE TURN (docs/MR.md).
//
// The fast loop, end to end, as the Logos route calls it:
//
//   OBSERVE → ESTIMATE → DECIDE   foldConversation (state.ts): the conversation
//                                 folded turn by turn through IFR's readers,
//                                 the outcome model, the policy and the
//                                 integrity checks
//   ENFORCE                       execute (execute.ts): precedence, then the
//                                 typed controls compiled into ACS's move, a
//                                 token ceiling, the reply gate and a few
//                                 prompt lines
//   MEASURE                       afterReply (below), on the reply actually
//                                 sent; the outcome of this turn's decision is
//                                 read next turn, from their reply
//   LEARN                         nothing automatic: the ledger feeds offline
//                                 evaluation (evals/mr) and a human promotion
//                                 decision (adaptation.ts)
//
// NO MODEL CALL. The deliberative loop (deliberate.ts) is separate, off by
// default, and only ever asked when this loop names a reason to.
//
// THE COMPARISON ARMS run the same fold — every rule family, the same
// outcome model — so every arm logs the same outcome measures; they differ
// only in what reaches the reply:
//   baseline           nothing (the fold is measurement only)
//   prompt_reflection  a fixed self-reflection instruction, nothing enforced
//   state_only         MR's state as context, nothing enforced
//   full               the decision, enforced (with IFR off, IFR's decisions
//                      are folded and recorded as not enforced)
// and `shadow` enforces nothing in any arm — it records what WOULD have run.
// What the comparison arms record is what the full condition would decide
// given the replies as they were actually sent: an estimate, not a replay of
// the full arm (its replies would have been different).
//
// Pure, apart from reading the clock for MR's own timing (injectable).

import { planTurn } from '../accuracy/accuracy';
import { interrogatives, questionLoad, sentencesOf } from '../core4/questions';
import { looksMathematical } from '../runtime/state';
import { paramsFor, policyPinInvalid, policyVersion, STRATEGIES } from './config';
import { execute } from './execute';
import { REFLECTION_BLOCK, stateBlock } from './experiment';
import { questionsAsContent, writingAsked, writingForOthers, type TurnView } from './ifr';
import { checkLatency, unsupportedClaim } from './integrity';
import { questionsPutTo } from './outcome';
import { noneDecision } from './policy';
import { emptyState, foldConversation } from './state';
import type { AssistDecision } from '../cognition/assist';
import type { GateControls, IntegrityFinding, MRDecision, MRState, MRTurnInput, MRTurnResult, TranscriptMessage } from './types';

export interface MRRegulation extends MRTurnResult {
  /** a reason for the deliberative loop to look at this turn, or null */
  needsDeliberation: string | null;
  /** decisions made at this turn */
  fresh: MRDecision[];
  /** what reached the reply: false in shadow, and for everything but the decision in a non-full arm */
  enforced: boolean;
  /** questions are the content they asked for this turn (lib/mr/ifr.ts questionsAsContent, writingForOthers): not counted as put to them */
  contentTurn?: boolean;
  /** the folded turns (in memory only — they hold text, and are never logged or stored) */
  turns: TurnView[];
}

const NO_GATE: GateControls = { hardNoQuestions: false, dropUnsupportedClaims: false };
/** earlier user turns whose claims the engine re-checks, as Core 4's replay does (LADDER_WINDOW) */
const VERDICT_WINDOW = 4;

/**
 * The engine's verdicts on their claims at earlier turns — the only evidence
 * that an attempt failed. Only for turns that read as mathematics (the engine
 * decides nothing else), and only the last few, so a long prose conversation
 * costs nothing here.
 */
export function verdictsFor(messages: readonly TranscriptMessage[]): Record<number, { status: string }[]> {
  const out: Record<number, { status: string }[]> = {};
  const users = messages.map((m, at) => (m.role === 'user' ? at : -1)).filter((at) => at >= 0);
  // the newest is the route's own (input.context.accuracy.theirs)
  const earlier = users.slice(0, -1);
  const from = Math.max(0, earlier.length - VERDICT_WINDOW);
  for (let u = from; u < earlier.length; u++) {
    const at = earlier[u];
    const text = String(messages[at].content ?? '');
    // the engine decides only mathematics: a turn with no maths words and no equation is skipped unread
    if (!looksMathematical([text]) && !/\d\s*[=+\-*/^×÷]|[=+\-*/^×÷]\s*\d/.test(text)) continue;
    try {
      const p = planTurn({ lastUserText: text, history: messages.slice(0, at).map((m) => ({ role: m.role, content: m.content })), withhold: false });
      if (p.theirs.length) out[u] = p.theirs.map((v) => ({ status: v.status }));
    } catch {
      // an engine failure is no verdict, never a refuted one
    }
  }
  return out;
}

/** Socria's replies, oldest first: did each ask something? */
export function recentAskingOf(turns: readonly TurnView[]): boolean[] {
  return turns.map((t) => t.prevReply).filter((r): r is string => typeof r === 'string').map((r) => questionLoad(r) > 0);
}

/** The content-free trace for X-Socria-MR and the [mr] log line. Short, codes only. */
export function traceOf(r: Pick<MRRegulation, 'condition' | 'decision' | 'enforced' | 'timing' | 'state' | 'ceiling' | 'gate' | 'assist' | 'integrity'>): string {
  const d = r.decision;
  const c = d.controls;
  const ctl = [
    c.questionBudget ? `q${c.questionBudget.max}${c.questionBudget.enforcement === 'hard' ? 'h' : 't'}` : '',
    c.questionWindow ? `qw${c.questionWindow.max}/${c.questionWindow.turns}` : '',
    c.strategy ? `s:${c.strategy}` : '',
    c.scaffolding ? `sc:${c.scaffolding}` : '',
    c.simplify ? 'simple' : '',
    c.verbosity ? `v${c.verbosity.ceilingTokens}` : '',
    c.verification ? 'verify' : '',
    c.answerFirst ? 'first' : '',
    c.noRevealAnswers ? 'noreveal' : '',
  ].filter(Boolean);
  const blocks = r.integrity.filter((f) => f.severity !== 'info').map((f) => f.code);
  return [
    'mr1',
    `arm=${r.condition.arm}`,
    `ifr=${r.condition.ifr ? 1 : 0}`,
    `src=${r.condition.source}`,
    `enf=${r.enforced ? 1 : 0}`,
    // the reply filters armed: h = every question out (their "stop asking"), k = check-ins out anywhere, c = unsupported claims out
    ...(r.gate.hardNoQuestions || r.gate.dropUnsupportedClaims || r.gate.dropCheckIns
      ? [`g=${r.gate.hardNoQuestions ? 'h' : ''}${r.gate.dropCheckIns ? 'k' : ''}${r.gate.dropUnsupportedClaims ? 'c' : ''}`]
      : []),
    `pv=${d.policyVersion}`,
    `a=${d.action}`,
    `t=${d.trigger}`,
    `id=${d.interventionId.slice(0, 10)}`,
    ...(d.composedOf ? [`n=${d.composedOf.length}`] : []),
    ...(d.carried ? ['carried'] : []),
    `c=${ctl.join(',') || '-'}`,
    `exp=${d.expiration.afterTurn ?? 'revoke'}`,
    ...(d.constrainedBy?.length ? [`con=${d.constrainedBy.join(',')}`] : []),
    ...(r.state.frozenUntilTurn !== null && r.state.frozenUntilTurn >= r.state.turn ? [`frozen=${r.state.frozenUntilTurn}`] : []),
    ...(blocks.length ? [`int=${[...new Set(blocks)].join(',')}`] : []),
    `ms=${Math.round(r.timing.ms)}`,
  ]
    .join(';')
    .slice(0, 400);
}

/** What the full arm enforces of a decision this turn (execute, plus the reply filters). The deliberative loop enforces through the same path. */
export function enforceDecision(
  r: { state: MRState; turns: readonly TurnView[] },
  input: MRTurnInput,
  d: MRDecision
): { decision: MRDecision; assist: AssistDecision; block: string; ceiling: number | null; gate: GateControls; enforced: boolean; contentTurn: boolean } {
  const turn = r.state.turn;
  const newest = r.turns[r.turns.length - 1];
  // their words this turn, as IFR confirmed them
  const said = new Set(r.state.observations.filter((o) => o.turn === turn && o.code.startsWith('explicit.')).map((o) => o.code));
  // the earlier messages, newest first, for a revision of a draft ("make it warmer")
  const previous = r.turns.slice(Math.max(0, r.turns.length - 4), -1).map((x) => x.text).reverse();
  const forOthers = !!newest && writingForOthers(newest.text, previous);
  // any writing asked for ("a card for my son saying how much he has improved"): a claim in it is the writing's own
  const drafting = forOthers || (!!newest && writingAsked(newest.text, previous));
  // questions are what they asked for (a list, a draft to somebody): not questions put to them
  const contentTurn = !!newest && (forOthers || (questionsAsContent(newest.text) && !said.has('explicit.wants_questions') && !said.has('explicit.quiz')));
  const ex = execute({
    decision: d,
    acs: input.acs.assist,
    core: input.acs.core,
    signals: input.signals,
    said,
    questionsAsContent: contentTurn,
    guard: input.context.guard,
    math: input.context.accuracy.math,
    length: input.context.length,
    maxReply: input.context.maxReply,
    recentAsking: recentAskingOf(r.turns),
  });
  // The integrity monitor's claim filter runs on every regulated turn,
  // whether or not an adjustment is in force (a claim that they improved
  // needs evidence whatever MR decided) — except where the reply is not
  // Socria speaking to them: a safety turn is left exactly as ACS made it,
  // and in writing they asked for (a draft for somebody else, a card, a
  // speech) "you" is its reader and a claim is the writing's. The trace says
  // the filter was armed (g=…c), and a sentence it drops is an integrity row
  // (afterReply).
  return { decision: ex.decision, assist: ex.assist, block: ex.block, ceiling: ex.ceiling, gate: { ...ex.gate, dropUnsupportedClaims: !ex.safety && !drafting }, enforced: ex.enforced, contentTurn };
}

/** Sources under which MR keeps nothing about them and decides nothing: their own "off", unreadable settings, a shared conversation. */
const DECIDES_NOTHING: ReadonlySet<string> = new Set(['user_off', 'unavailable', 'excluded']);

/** One turn of MR: decide, and compile what is enforced. Never throws on a well-formed input; the route still guards it. */
export function regulateTurn(input: MRTurnInput): MRRegulation {
  const clock = input.now ?? (() => Date.now());
  const t0 = clock();
  const env = input.env ?? (typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {});
  // A fault the route tests inject to prove an MR failure is the route without
  // MR. Never honoured in production.
  if (env.MR_TEST_FAULT === 'throw' && env.NODE_ENV !== 'production') throw new Error('mr test fault');
  const condition = input.condition;
  // an experiment's arms run under the policy it registered; otherwise the deployment's (or its pin)
  const pv = condition.policyVersion && STRATEGIES[condition.policyVersion] ? condition.policyVersion : policyVersion(env);
  const params = paramsFor(pv);
  const pinFinding: IntegrityFinding[] = policyPinInvalid(env)
    ? [{ code: 'unauthorized_policy', severity: 'warn', turn: 0, detail: 'pin_unknown_version', action: 'none' }]
    : [];

  // THEIR "OFF" IS NOT MEASURED EITHER. With MR switched off by them (or
  // settings that could not be read: their "off" may be what failed), nothing
  // of theirs is folded — not even as a would-be decision — and nothing is
  // enforced. The exposure row records the condition and nothing else.
  if (DECIDES_NOTHING.has(condition.source)) {
    const turn = Math.max(0, input.messages.filter((m) => m.role === 'user').length - 1);
    const none = noneDecision(pv, input.conversationKey, turn, [`source:${condition.source}`]);
    const quiet: MRRegulation = {
      condition,
      state: { ...emptyState(pv, input.conversationKey), turn, uncertainty: [`source:${condition.source}`] },
      decision: none,
      assist: input.acs.assist,
      block: '',
      ceiling: null,
      gate: { ...NO_GATE },
      trace: '',
      integrity: pinFinding.map((f) => ({ ...f, turn })),
      timing: { ms: clock() - t0, deliberated: false },
      needsDeliberation: null,
      fresh: [],
      enforced: false,
      turns: [],
    };
    quiet.trace = traceOf(quiet);
    return quiet;
  }

  // Every arm folds the same rules (state.ts): the comparison arms estimate
  // what the full condition with IFR would decide; only the full arm's IFR
  // factor changes what is enforced.
  const fold = foldConversation({
    input,
    params,
    policyVersion: pv,
    ifr: condition.arm === 'full' ? condition.ifr : true,
    carryAcross: Array.isArray(input.carried),
    verdictsByTurn: verdictsFor(input.messages),
  });
  const turn = fold.state.turn;
  const enforce = !condition.shadow;

  let assist = input.acs.assist;
  let block = '';
  let ceiling: number | null = null;
  let gate: GateControls = { ...NO_GATE };
  let decision = fold.current;
  let enforced = false;
  let contentTurn = false;

  if (condition.arm === 'full') {
    const ex = enforceDecision({ state: fold.state, turns: fold.turns }, input, fold.current);
    decision = ex.decision;
    if (enforce) {
      assist = ex.assist;
      block = ex.block;
      ceiling = ex.ceiling;
      gate = ex.gate;
      enforced = ex.enforced;
    }
    contentTurn = ex.contentTurn;
  } else if (condition.arm === 'prompt_reflection') {
    if (enforce) {
      block = `\n\n${REFLECTION_BLOCK.trim()}\n`;
      enforced = true;
    }
  } else if (condition.arm === 'state_only') {
    const s = stateBlock(fold.state);
    if (enforce && s.trim()) {
      block = s.startsWith('\n') ? s : `\n\n${s}\n`;
      enforced = true;
    }
  }

  const ms = clock() - t0;
  const integrity = [
    ...pinFinding.map((f) => ({ ...f, turn })),
    ...fold.findings.filter((f) => f.turn === turn),
    ...checkLatency(ms, params, turn),
  ];
  const result: MRRegulation = {
    condition,
    state: fold.state,
    decision,
    assist,
    block,
    ceiling,
    gate,
    trace: '',
    integrity,
    timing: { ms, deliberated: false },
    // the deliberative loop only ever acts where something can be enforced: the full arm, not shadow
    needsDeliberation: condition.arm === 'full' && enforce ? fold.deliberation : null,
    fresh: fold.fresh,
    enforced,
    contentTurn,
    turns: fold.turns,
  };
  result.trace = traceOf(result);
  return result;
}

/**
 * The reply as sent, measured against what was enforced in code and what was
 * only asked for. Content-free findings; nothing about the reply is kept.
 * Under a decision that took questions away, EVERY interrogative counts — a
 * mid-reply "Does that make sense?" is a question put to them, and the tail
 * cap cannot catch it; otherwise the count is ACS's (offers excluded).
 */
export function afterReply(r: MRRegulation, reply: string, dropped: { questions: number; claims: number; offersRestored?: number }): IntegrityFinding[] {
  const out: IntegrityFinding[] = [];
  const turn = r.state.turn;
  if (r.condition.arm !== 'full' || r.condition.shadow) return out;
  if (dropped.claims > 0) out.push({ code: 'unsupported_claim', severity: 'warn', turn, detail: `dropped:${dropped.claims}`, action: 'drop_sentence' });
  if (!r.enforced) return out;
  const c = r.decision.controls;
  const noneWanted = c.questionBudget?.max === 0;
  const asked = noneWanted ? questionsPutTo(reply) : questionLoad(reply);
  const budget = r.assist.questions;
  // the questions they asked for as content are not questions put to them
  if (asked > budget && !r.contentTurn) {
    out.push({ code: 'control_violation', severity: 'warn', turn, detail: `questions:${asked}>${budget}`, action: 'none' });
  }
  if ((c.answerFirst || c.strategy === 'direct') && reply.trim()) {
    const first = sentencesOf(reply).find((x) => x.trim());
    if (first && /\?\s*$/.test(first.trim())) out.push({ code: 'control_violation', severity: 'warn', turn, detail: 'answer_first:opened_with_question', action: 'none' });
  }
  if (dropped.questions > 0 && r.gate.hardNoQuestions) out.push({ code: 'control_violation', severity: 'info', turn, detail: `questions_removed:${dropped.questions}`, action: 'drop_sentence' });
  if ((dropped.offersRestored ?? 0) > 0) out.push({ code: 'control_violation', severity: 'info', turn, detail: `offers_restored:${dropped.offersRestored}`, action: 'none' });
  return out;
}

/** What MR's reply filters did to one reply: counted, never logged. */
export interface ReplyGate {
  /**
   * A SentenceGate `rewrite`: what of the chunk the gate cut may go out — the
   * chunk itself, '' (nothing, or nothing yet), or what is left of it once a
   * sentence of Socria's own is taken out, with the line and paragraph breaks
   * around it kept. Two things wait for the next chunk instead of going out:
   * a list's number ("2. ", which goes or stays with its item) and a question
   * the next sentence may answer.
   */
  filter: (sentence: string) => string;
  /**
   * A SentenceGate `rewriteAll` (the route's): `filter`, given back as the
   * pieces the gate should read — none when the chunk was taken out (or a
   * question is held), one empty piece for a list number held (the chunk is
   * still text after what the gate holds), and a held number apart from its
   * item when nothing of the item was taken out, so the gate reads "2. " and
   * "Want me to list them?" as it would without MR.
   */
  filterAll: (sentence: string) => string[];
  /** a SentenceGate `drop`: true takes the whole chunk out (filter left nothing, and holds no list number) */
  drop: (sentence: string) => boolean;
  /**
   * What the last '' from `filter` was: a list number held for its item
   * ('marker' — the chunk must not be dropped: without MR it was text after the
   * questions the gate holds, and it lets them go out in order), a question
   * held for its answer ('question'), or nothing (null: taken out).
   */
  lastHold: () => 'marker' | 'question' | null;
  /**
   * A SentenceGate `keep`. Under their "stop asking" MR's filter has taken
   * every question of Socria's own out already, so a question still in a
   * chunk is somebody else's words (a quoted draft, a table cell, a listed
   * question they asked for) or one Socria answers itself — never one the
   * gate's tail cap should delete as put to them.
   */
  exempt: (sentence: string) => boolean;
  /**
   * A SentenceGate `see`: a piece that is only whitespace never reaches
   * `filter`, but it ends the line the filter is following; what it returns
   * goes out in its place (what was waiting before it, then the break).
   */
  see: (whitespace: string) => string;
  /**
   * A fenced block the gate sent past the filter (its `block` hook). The
   * stream gate sends a fence that arrives in pieces as a block of its own
   * ("```", then the code as ordinary chunks, then "```"), so the filter
   * counts the fences it is told about and keeps what lies between them.
   * Returns what was waiting and must go out before the block.
   */
  sawBlock: (chunk: string) => string;
  /** The end of the reply: a list number with no item after it ("42.") is returned, with the break before it, to go out last. */
  settle: () => string;
  dropped: { questions: number; claims: number; offersRestored: number };
  /** offer-only sentences the question filters took out, in order (for emptyReplyFallback) */
  offers: string[];
}

/** An opening quote mark: after a space, the start, an opening bracket, a colon, a comma, emphasis or a slash, and before a word — never an inch mark ("12\"") or an apostrophe ("don't"). */
const OPENS_BEFORE = /[\s([{:,—–\-*_/]/;
/** A leading apostrophe that opens nothing: "the '90s", "the ‘90s", "'cause", "'cos", "'em", "'til". */
const ELISION = /^['’‘](?:\d|(?:cause|cos|cuz|em|til|tis|twas|n|bout|round|kay|sup)\b)/i;
/** Socria asking something of THEM, not a question it answers itself ("**Should I buy AppleCare?** Only if…"). */
const PUT_TO_THEM = /\b(?:you|your|you'?re|you'?d|you'?ll|you'?ve|yours|yourself)\b|^\W*(?:want|wanna|shall i|should i (?:make|send|write|draw|show|give|put|walk|do) (?:you|that|it|one)|let me know|does that|is that|sound good|ready|any questions)\b/i;
/**
 * The answer the next sentence gives a question Socria asked itself: "…? Only
 * if you drop things.", "…? No, and…", "…? Because…", "…? It depends." — and
 * the forms that answer only the question they fit: "It is, until 36 weeks"
 * after "Is it safe…?" or "What is…?" (never after "Do you have room for
 * it?"), "You do" after "Do you…?", "There are" after "Are there…?". None
 * after a question about their own things ("…your shelf?").
 */
const ANSWER_LABEL = String.raw`(?:\*\*|__)?(?:(?:a|answer)\s*[:.)]\s*(?:\*\*|__)?\s*)?`;
const STRONG_ANSWER = new RegExp(String.raw`^\s*${ANSWER_LABEL}(?:\*\*|__)?(?:yes|no|yep|nope|nah|only(?: if| when| with| for| on| in| after| before| until| by| up to| at| the)?|not (?:really|usually|much|if|always|necessarily|at all|for|unless|quite|by much|until|before|yet)|because|that depends|it depends|depends|in most cases|for most)\b`, 'i');
/** An adverb answers only standing as one: "Usually, yes.", "Usually not." — never "Always do that before an update." */
const WEAK_ANSWER = new RegExp(String.raw`^\s*${ANSWER_LABEL}(?:\*\*|__)?(?:usually|probably|possibly|definitely|absolutely|generally|mostly|rarely|never|always|sometimes|often)\b(?=\s*(?:[,.;:!—–-]|$|(?:yes|no|not|so)\b))`, 'i');
/** A question put to "you" (generic or not): the answer forms below fit only questions that are not. */
const TO_YOU = /\b(?:you|your|you'?re|you'?d|you'?ll|you'?ve|yours|yourself)\b/i;
const ANSWER_FORMS: [RegExp, RegExp][] = [
  [new RegExp(String.raw`^\s*${ANSWER_LABEL}(?:it (?:is|does|can|will|was|might|should|isn'?t|doesn'?t|can'?t|won'?t)|it'?s)\b`, 'i'), /\b(?:is|does|can|will|was|would|should|could|might|did|isn'?t|doesn'?t) (?:it|this|that)\b|^\W*(?:what|which|who|how (?:much|long|many|big|far|often|old))\b/i],
  [/^\s*(?:\*\*|__)?you (?:do|don'?t|won'?t|will|can|can'?t|should|shouldn'?t|need|needn'?t|must)\b/i, /\b(?:do|does|will|would|should|can|could|must|need|did) you\b/i],
  [/^\s*(?:\*\*|__)?they (?:do|don'?t|can|can'?t|are|aren'?t|will|won'?t)\b/i, /\b(?:they|these|those|them)\b|\b(?:do|are|can|will|should|would) (?:the |most |all |some )?[a-z]+s\b/i],
  [/^\s*(?:\*\*|__)?there (?:is|are|isn'?t|aren'?t)\b/i, /\b(?:is|are) there\b/i],
];
/**
 * A question about THEIR mind — what they feel, think, want, plan or know,
 * their budget or their view — which only they can answer, whatever follows
 * it: "How do you feel about that? It is about 4800 a year." loses the
 * question. ("Do you need a visa? Yes, if…" asks a fact, and stays.)
 */
const ASKS_THEIR_MIND = /\byou(?:'re|'d|'ll|'ve)?\s+(?:really\s+|still\s+|actually\s+|already\s+|even\s+|personally\s+)?(?:feel|think|prefer|want|wanna|like|love|wish|reckon|mean|plan|hope|expect|imagine|guess|remember|agree|mind|care|believe|decide|sure|ready|comfortable|happy|okay|ok|worried|excited|interested|considering|leaning|planning)\b|\bhow (?:are|do) you\b|\byour (?:take|view|views|opinion|thoughts|preference|preferences|budget|goal|goals|plan|plans|timeline|situation|experience|level|sense|gut|feeling|feelings|reason|reasons|priority|priorities)\b/i;
/**
 * A next sentence that only continues the question as an offer: "Then I will
 * lay it out", "If so, I can write one", "I can send it", "Just say so". It
 * goes with the question. Never advice: "Then leave it in longer", "If you
 * want a crispier crust, leave it in".
 */
const OFFER_FOLLOWS = /^\s*(?:\*\*|__)?(?:(?:then|if so|if not|if you do|if you(?:'d| would) like|if you want|if that helps|either way)\b,?\s*(?:i can|i could|i'?ll|i will|i'?d be happy|i'?d (?:love|gladly)|let me|just (?:say|tell|let)|say (?:so|the word)|tell me|happy to|we can)\b|i can\b|i could\b|i'?ll\b|i will\b|i'?d be happy\b|i'?m happy\b|let me\b|just say\b|say so\b|say the word\b|tell me\b|let me know\b|happy to\b)/i;
/** A condition put as a question, answered by the advice after it: "Want a crispier crust? Leave it in…" — never "Want me to…?", never "Got it?". */
const CONDITION_ASKED = /^\s*(?:\*\*)?(?:want|need|prefer|looking for|short on|tight on|worried about|in a hurry|pressed for time|craving|planning on|hoping for)\b(?! (?:anything|something) else\b| (?:more |any )?help\b| a hand\b)(?![^?]*\b(?:me|i|us)\b)/i;
/** A line of a markdown list, and a heading (a question as a heading is a label: "### Do you need a visa?"). */
const LIST_ITEM = /^\s*(?:[-*+•]|\d{1,3}[.)])\s+/;
const HEADING = /^\s*#{1,6}\s/;
/** A chunk the gate cut that is nothing but a list's number ("2. "), with no line break after it. */
const MARKER_ONLY = /^[ \t]*\d{1,3}[.)][ \t]*$/;
/** A label that hands them somebody else's words in its sentence: "Ask: When will…?", "At the end, ask: …?", "Say: …", "You could text: …". */
const LABEL = String.raw`(?:\*\*|__)?(?:ask(?: them| him| her| your [a-z]+| the [a-z]+)?|say|text|write|reply|you could (?:ask|say|write|text)|something like|consider asking|make sure (?:you |to )?ask|be sure to ask|(?:here'?s |here is )?(?:a |an |the |one )?(?:text|message|email|note|dm|reply|line|script|opener|opening line)(?: (?:you|they) (?:can|could|might) (?:send|use|say|try)| to send| to use))(?:\*\*|__)?\s*:`;
const INTRODUCES = new RegExp(String.raw`(?:^\s*|[.!?]\s+|[,;]\s*|\b(?:then|and|also|just|simply)\s+)${LABEL}\s*\S`, 'i');
/** The same label ending its line: the next line is what to say ("At the end, you could ask:\nWhat does success look like…?"). */
const INTRODUCES_END = new RegExp(String.raw`(?:^\s*|[.!?]\s+|[,;]\s*|\b(?:then|and|also|just|simply)\s+)${LABEL}\s*(?:\*\*|__)?\s*$`, 'i');
/**
 * A line that introduces a list of questions as content — to ask somebody,
 * or asked for as such: "Ask these:", "Questions to ask your doctor:",
 * "Consider asking:", "Here are some questions for you to ask the
 * landlord:", "Interview questions:". Never Socria's own ("Before I pick
 * one, a few questions for you:", "Questions for your situation:", "Quick
 * questions:", "Questions to ask yourself:").
 */
/** Who a list of questions can be for: "Questions for your doctor:", "Questions the interviewer may ask". */
const ROLE = String.raw`(?:doctor|gp|surgeon|dentist|nurse|midwife|pharmacist|vet|therapist|counsell?or|physio(?:therapist)?|optician|specialist|consultant|landlord|letting agent|agent|realtor|lawyer|solicitor|accountant|advis[eo]r|interviewer|recruiter|hiring manager|manager|boss|employer|teacher|tutor|professor|lecturer|coach|mentor|supervisor|mechanic|plumber|electrician|contractor|builder|bank|lender|insurer|seller|buyer|host|school|nursery|daycare|airline|hotel|council|panel|committee)`;
const INTRO_BODY = String.raw`(?:ask (?:these|them|him|her|your|the|this|about|for)|(?:questions?|things) (?:to (?:ask|raise|put to|bring up|clarify|check)|(?:you|they) (?:could|can|might|should|may) ask|worth (?:asking|raising)|for (?:your|the|a|an) ${ROLE}s?)|questions? (?:the|your|an?) ${ROLE} (?:may|might|will|could|would|is likely to|tends to|usually|often) ask|(?:common|typical|frequent|usual) questions (?:${ROLE}s|people|patients|customers|tenants|candidates) (?:get|ask|often ask|usually ask)|questions i(?:'d| would) ask|what to ask|(?:you could|you can|you might|you should|you may|you'?ll want to|you might want to) ask|consider asking|make sure (?:you |to )?ask|be sure to ask|worth asking (?:the|your)|have these (?:questions )?ready|icebreakers?|riddles?|conversation starters|interview questions|faqs?|survey questions|quiz questions|practice questions|trivia questions|here are (?:some |a few )?questions for you to ask)`;
const QUESTIONS_INTRO = new RegExp(String.raw`\b${INTRO_BODY}\b[^:]*:\s*(?:\*\*|__)?\s*$`, 'i');
/** …or as a heading or a bold label of its own, with no colon: "### Questions to ask your doctor", "**Questions to ask your surgeon**". */
const QUESTIONS_LABEL = new RegExp(String.raw`^\s*(?:#{1,6}\s+(?:\*\*|__)?|\*\*|__)[^.!?]*\b${INTRO_BODY}\b[^.!?]*$`, 'i');
const NOT_INTRO = /\b(?:ask|asking|raise with) (?:yourself|yourselves)\b|\bbefore i\b|\blet me ask\b|\bquick questions?\b|\bfor you(?! to ask)\b|\bto help me\b|\bi need to know\b/i;
/** A word whose s' closes a quotation, not a plural possessive ("'thanks for having us' when you leave"). */
const NOT_PLURAL = /^(?:us|his|its|this|was|yes|is|as|plus|bus|gas|less|unless|thus|always|perhaps|ours|yours|theirs|hers|series|thanks|congrats|regards|cheers|apologies|please)$/;
const FUNCTION_WORD = /^(?:when|and|or|but|to|on|in|at|for|with|as|if|then|so|because|before|after|while|is|was|are|were|the|a|an|that|this|you|i|we|they|he|she|it|from|by|of|into|until|unless|instead|again|too|now)$/;
/** A quotation mark that is not an apostrophe inside a word ("don't", "you’ve"). */
const QUOTE_MARK = /["“”‘]|(?<![A-Za-z])['’]|['’](?![A-Za-z])/;
/** An emoji, and what may follow it inside one (a variation selector, a joiner, a skin tone). */
const EMOJI = /\p{Extended_Pictographic}/u;
const EMOJI_TAIL = /[\uFE0F\u200D]|[\u{1F3FB}-\u{1F3FF}]/u;

/**
 * MR's reply filters, chunk by chunk, in the order the stream gate cuts them
 * (lib/core4/stream-gate.ts): every interrogative when they told it to stop
 * asking; a check-in ("Does that make sense?", "Want me to compare?")
 * anywhere in the reply when the decision in force took questions away (the
 * gate's tail cap only reaches the close) — one offer-shaped question put to
 * them, on its own, never a sentence of advice that starts "if you want" or a
 * question Socria answers itself; and a claim that THEY improved, which one
 * conversation cannot show. Emphasis does not hide a question:
 * "**What is your budget?**" is one. Each SENTENCE is judged by itself, also
 * where the stream gate did not cut (after "?**", an emoji, inside a
 * parenthesis): "**Do you have a stud finder?** Mark the studs first" loses
 * the question and keeps the advice.
 *
 * WHAT IS NEVER TOUCHED. These lines stay whole: a '>' line; a table row
 * ('|'); a heading; a line inside fenced code (an unclosed fence too); a line
 * inside a quotation; a list right after a line that introduces questions as
 * content ("Ask these:", "Bring your results. Questions to ask your doctor:"),
 * and the line after a label that ends its line ("At the end, you could
 * ask:"); the sentence after a label ("Ask: When will the leak be fixed?"). A
 * quotation is followed across chunks, nested ones too: “…” always; ‘…’ and
 * straight quotes only where one can open (after a space, a colon, a comma, a
 * bracket, emphasis or a slash, before a word — never "the '90s", "the ‘90s",
 * "'cause", "'cos") and close (before a space or an end — never the plural
 * possessive "the kids' bikes", while 'spices' and 'thanks for having us'
 * close); a quote inside `inline code` is code. A blank line closes anything
 * left open.
 *
 * WHAT IS TAKEN OUT LEAVES THE TEXT WHOLE. A sentence goes, and the rest of its
 * line stays; a whole line goes with its own line break and leaves the others;
 * a chunk taken out whole leaves the break it carried for the next chunk,
 * exactly as it was (spaces and indentation too); a numbered item goes with
 * its number, and a number with no item after it ("42.") goes out as written.
 * A question Socria answers itself stays with its answer — in the same breath,
 * the next sentence or the next line ("Do you need a visa?\nYes, if you stay
 * longer than 90 days."), or a condition put as a question ("Want a crispier
 * crust? Leave it in five more minutes.") — but not one the next sentence only
 * continues as an offer ("Sound good? Then I will lay it out.", "Want the
 * list? I can send it.").
 */
export function replyGate(r: Pick<MRRegulation, 'gate'>): ReplyGate {
  const dropped = { questions: 0, claims: 0, offersRestored: 0 };
  const offers: string[] = [];
  const hard = r.gate.hardNoQuestions;
  // NOTHING ARMED (shadow, the comparison arms, a turn MR left alone): every chunk goes out as it came, in the gate's own cuts
  const armed = hard || !!r.gate.dropCheckIns || r.gate.dropUnsupportedClaims;
  let atLineStart = true;
  /** the line under way (across chunks) is one that is never touched */
  let lineKept = false;
  /** the next line is kept whole (after a label that ended its line) */
  let nextLineKept = false;
  let inFence = false;
  /** the last line introduced questions as content, and a list after it is content */
  let listIntro = false;
  /** the current line's text so far (what it introduces is read at its end) */
  let curLine = '';
  /** quotation marks open, innermost last, and whether the quoted span holds a space yet */
  const quotes: { mark: string; spaced: boolean }[] = [];
  let before = '\n';
  /** the whitespace a chunk taken out whole carried, exactly, for the next chunk */
  let pendingSep = '';
  /** a list's number waiting for its item */
  let marker = '';
  /** a question of Socria's own, ending its chunk, that the next chunk may answer */
  let heldQ: { text: string; keepOnDrop: string; offer: string | null; ownLine: boolean; item: string } | null = null;
  /** a question aside opened by a dash was taken out: the dash that closes it, starting the next chunk, goes too */
  let asideOpen = false;
  let hold: 'marker' | 'question' | null = null;
  /** where a held list number ends in what filter last returned, when it came back with its item untouched */
  let splitAt = 0;

  const top = () => quotes[quotes.length - 1]?.mark;
  const popTo = (mark: string) => {
    for (let k = quotes.length - 1; k >= 0; k--) if (quotes[k].mark === mark) return void (quotes.length = k);
  };
  /** "the kids' bikes": a plural noun, the mark, a space and a word that is not a function word — inside a quoted phrase */
  const possessive = (line: string, i: number) => {
    if (!/[sS]/.test(line[i - 1] ?? '') || line[i + 1] !== ' ' || !/[a-z]/.test(line[i + 2] ?? '') || !quotes[quotes.length - 1]?.spaced) return false;
    const word = (/([A-Za-z]+)$/.exec(line.slice(0, i))?.[1] ?? '').toLowerCase();
    if (word.length < 3 || NOT_PLURAL.test(word)) return false;
    return !FUNCTION_WORD.test(/^\s*([a-z]+)/.exec(line.slice(i + 1))?.[1] ?? '');
  };

  /** One piece of a line: its own words (outside quotations), advancing the quotation state. */
  const ownOf = (raw: string): string => {
    const line = raw.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
    let own = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1] ?? ' ';
      const t = top();
      const opens = OPENS_BEFORE.test(before) && /\S/.test(next);
      const closes = /[\s.,;:!?)\]*_]/.test(next) || i === line.length - 1;
      if (ch === '“') quotes.push({ mark: '“', spaced: false });
      else if (ch === '”') popTo('“');
      else if (ch === '‘' && opens && !ELISION.test(line.slice(i))) quotes.push({ mark: '‘', spaced: false });
      else if (ch === '’' && t === '‘' && closes && !possessive(line, i)) quotes.pop();
      else if (ch === '"') {
        if (quotes.some((q) => q.mark === '"')) popTo('"');
        else if (opens) quotes.push({ mark: '"', spaced: false });
      } else if (ch === "'" && t === "'" && closes && !possessive(line, i)) quotes.pop();
      else if (ch === "'" && t !== "'" && opens && !ELISION.test(line.slice(i))) quotes.push({ mark: "'", spaced: false });
      else if (!quotes.length) own += ch;
      else if (/\s/.test(ch)) quotes[quotes.length - 1].spaced = true;
      before = ch;
    }
    return own;
  };

  /** Emphasis off: "**What is your budget?**" is a question; snake_case stays a word. */
  const plain = (s: string) => s.replace(/\*\*|__/g, '').replace(/(^|\s)[*_](?=\S)/g, '$1').replace(/(?<=\S)[*_](?=\s|$|[.,!?;:])/g, '');

  /** What the filters take out of one sentence of Socria's own: 'question' | 'claim' | null. */
  const verdict = (raw: string): 'question' | 'claim' | null => {
    const own = plain(raw).replace(/^\s*(?:[-*+•]|\d{1,3}[.)])\s+/, '');
    if (!own.trim()) return null;
    if (hard || r.gate.dropCheckIns) {
      const q = interrogatives(own);
      const asks = /\?["'’”)\]]*\s*$/.test(own.trim());
      const offerOnly = q.offers.length > 0 && !q.explicit.length && !q.disguised.length;
      const checkIn = offerOnly && asks && PUT_TO_THEM.test(own);
      const isHard = hard && (q.explicit.length > 0 || q.disguised.length > 0 || q.offers.length > 0);
      if (isHard || (r.gate.dropCheckIns && checkIn)) return 'question';
    }
    if (r.gate.dropUnsupportedClaims && unsupportedClaim(own)) return 'claim';
    return null;
  };

  const isOffer = (raw: string) => {
    const q = interrogatives(plain(raw));
    return q.offers.length > 0 && !q.explicit.length && !q.disguised.length;
  };
  /** One sentence taken out, counted; an offer is kept for emptyReplyFallback (and returned). */
  const count = (raw: string, v: 'question' | 'claim'): string | null => {
    if (v === 'claim') {
      dropped.claims++;
      return null;
    }
    dropped.questions++;
    if (!isOffer(raw)) return null;
    const o = raw.trim() + ' ';
    offers.push(o);
    return o;
  };
  /**
   * A sentence that only continues a question taken out as an offer goes with it ("Want the list? I can send
   * it."): short, one sentence, and nothing it says after a colon — "I'll walk you through it: it moves heat…"
   * and "Then I'd get the Air" are content.
   */
  const continues = (text: string) => {
    const t = plain(text).trim();
    return OFFER_FOLLOWS.test(t) && !/[.!?]["'’”)\]*_]*\s+\S/.test(t) && !/:/.test(t) && t.split(/\s+/).length <= 12;
  };
  /**
   * The question answered by what follows it. In so many words ("Yes, if…", "No, not until…", "Only with a
   * permit", "Because…") it is answered, whatever it asked: taking it out would leave an answer to nothing. A
   * question about THEIR mind or their own things is answered by nothing less. An adverb answers standing as
   * one ("Usually, yes."); "It is…", "There are…", "You do…" fit only a question they fit that is not put to
   * them ("Is it safe…? It is, until 36 weeks."); and on the same line, after a condition put as a question,
   * the advice ("Want a crispier crust? Leave it in…").
   */
  const answeredBy = (q: string, next: string, sameLine: boolean) => {
    const a = plain(next);
    const asked = plain(q);
    if (!a.trim() || OFFER_FOLLOWS.test(a)) return false;
    if (STRONG_ANSWER.test(a)) return true;
    if (ASKS_THEIR_MIND.test(asked)) return false;
    if (WEAK_ANSWER.test(a)) return true;
    if (!TO_YOU.test(asked) && ANSWER_FORMS.some(([form, fits]) => form.test(a) && fits.test(asked))) return true;
    return sameLine && CONDITION_ASKED.test(asked);
  };
  /** A straight or curly double quotation is open at `at` in the line (a bracket inside one is somebody else's). */
  const insideQuote = (line: string, at: number) => {
    const head = line.slice(0, at);
    return (head.match(/"/g) ?? []).length % 2 === 1 || (head.match(/“/g) ?? []).length > (head.match(/”/g) ?? []).length;
  };
  /**
   * An improvement claim that is one clause of a sentence goes, and the sentence stays: between dashes
   * ("6/8 — you've really improved — and the next…"), in emphasis ("7/8, **you've really improved**, and…"),
   * or a clause after a comma, a semicolon or a dash ("…= 7/8 — correct, you've clearly improved here.",
   * "You've really improved, so here is a harder one: …"). Null when it cannot be told apart.
   */
  const trimClaim = (piece: string): string | null => {
    const ws = /\s*$/.exec(piece)![0];
    const s0 = piece.slice(0, piece.length - ws.length);
    const lead = /^\s*(?:(?:[-*+•]|\d{1,3}[.)])\s+)?/.exec(s0)![0];
    const body = s0.slice(lead.length);
    const term = /[.!?…]*["'’”)\]]*$/.exec(body)![0];
    const isClaim = (x: string) => unsupportedClaim(plain(x));
    const hasWords = (x: string) => /[\p{L}\p{N}]/u.test(x);
    const done = (b: string) => (b !== body && hasWords(b) && !isClaim(b) ? lead + b + ws : null);
    const paired = body.replace(/\s+[—–]\s+([^—–]+?)\s+[—–]\s+/g, (m, x: string) => (isClaim(x) ? ' ' : m));
    if (done(paired)) return done(paired);
    const bold = body
      .replace(/(,\s*)?(?:\*\*|__)([^*_]+)(?:\*\*|__)(\s*,)?/g, (m, c1: string | undefined, x: string, c2: string | undefined) => (isClaim(x) ? (c1 && c2 ? ',' : '') : m))
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;!?])/g, '$1');
    if (done(bold)) return done(bold);
    const parts = body.slice(0, body.length - term.length).split(/(,\s+|;\s+|\s+[—–]\s+)/);
    if (parts.length < 3) return null;
    const clauses = parts.filter((_, i) => i % 2 === 0);
    const claims = clauses.map(isClaim);
    if (!claims.some(Boolean) || claims.every(Boolean)) return null;
    let out = '';
    let first = true;
    for (let i = 0; i < parts.length; i += 2) {
      if (claims[i / 2]) continue;
      out += first ? parts[i] : parts[i - 1] + parts[i];
      first = false;
    }
    if (claims[0]) out = out.replace(/^(?:so|and|but|which|now|then)\s+/i, '').replace(/^\p{Ll}/u, (c) => c.toUpperCase());
    return done(out + term);
  };

  /** Where a line breaks into sentences the stream gate did not cut: after "?**" / "!*" / "._", and after an emoji. */
  const piecesOf = (line: string): string[] => {
    const out: string[] = [];
    let start = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      let j = -1;
      if (/[.!?…]/.test(ch)) {
        let k = i;
        while (k < line.length && /[.!?…]/.test(line[k])) k++;
        let closed = false;
        while (k < line.length && /["'’”)\]*_]/.test(line[k])) {
          if (/[*_]/.test(line[k])) closed = true;
          k++;
        }
        if (closed && (k >= line.length || /\s/.test(line[k]))) j = k;
        else i = k - 1;
      } else {
        const cp = line.codePointAt(i)!;
        if (EMOJI.test(String.fromCodePoint(cp))) {
          let k = i + (cp > 0xffff ? 2 : 1);
          for (;;) {
            const t = line.codePointAt(k);
            if (t === undefined || !EMOJI_TAIL.test(String.fromCodePoint(t))) break;
            k += t > 0xffff ? 2 : 1;
          }
          if (/\s/.test(line[k] ?? '')) j = k;
          else i = k - 1;
        }
      }
      if (j >= 0) {
        while (j < line.length && /\s/.test(line[j])) j++;
        out.push(line.slice(start, j));
        start = j;
        i = j - 1;
      }
    }
    if (start < line.length) out.push(line.slice(start));
    return out.length ? out : [line];
  };

  /**
   * The chunk with what the filters take out removed. Sentence by sentence
   * inside each line of Socria's own; a whole line that goes takes its own line
   * break, and the first line (begun in an earlier chunk) and the last leave
   * theirs. `hold` is set instead when the chunk's only words are one question
   * of Socria's own, at its end, which the next chunk may answer: nothing is
   * counted for it here (filter counts it as held).
   */
  const judge = (chunk: string, begins: boolean): { text: string; removed: boolean; hold: { keepOnDrop: string; ownLine: boolean; item: string } | null } => {
    const lines = chunk.split('\n');
    const n = lines.length;
    const out: (string | null)[] = [];
    /** per line that went whole, its pieces that went, with their verdicts: counted once the chunk's fate is known */
    const gone: [string, 'question' | 'claim'][][] = [];
    let removed = false;
    /** pieces taken out of lines that stay (bracketed ones too), counted as they go */
    let counted = 0;
    lines.forEach((raw, li) => {
      gone.push([]);
      const startsLine = li > 0 || begins;
      if (li > 0) before = '\n';
      if (startsLine) {
        curLine = '';
        if (/^\s*(?:```|~~~)/.test(raw)) {
          inFence = !inFence;
          lineKept = true;
        } else lineKept = inFence || /^\s*[>|]/.test(raw) || HEADING.test(raw) || (listIntro && LIST_ITEM.test(raw)) || (nextLineKept && !!raw.trim());
        if (raw.trim()) nextLineKept = false;
      }
      curLine = (curLine + raw).slice(-400);
      const atEnd = () => {
        if (li < n - 1 && curLine.trim()) {
          listIntro = ((QUESTIONS_INTRO.test(curLine.trim()) || QUESTIONS_LABEL.test(curLine)) && !NOT_INTRO.test(curLine)) || (listIntro && LIST_ITEM.test(curLine));
          if (INTRODUCES_END.test(curLine.trim())) nextLineKept = true;
        }
      };
      if (lineKept || INTRODUCES.test(raw)) {
        if (lineKept) before = raw.slice(-1) || before;
        else ownOf(raw);
        out.push(raw);
        atEnd();
        return;
      }
      // a question or claim in brackets goes, and the sentence around it stays: "Pick the Air (do you edit video?) unless…"
      // (never brackets inside a quotation)
      let line = raw;
      if (!quotes.length) {
        const content = /^\s*(?:(?:[-*+•]|\d{1,3}[.)])\s+)?/.exec(raw)![0].length;
        line = raw.replace(/(\s*)\(([^()\n]{1,200})\)(\s*)/g, (m: string, pre: string, inner: string, post: string, off: number) => {
          if (/[.!?]\s+\S/.test(inner) || insideQuote(raw, off) || /["“”‘]/.test(inner)) return m;
          const v = verdict(inner);
          if (!v) return m;
          count(inner, v);
          counted++;
          removed = true;
          // at the start of the line its indentation stays; elsewhere the space after it does
          return off + pre.length <= content ? pre : post;
        });
      }
      const pieces = piecesOf(line);
      const verdicts = pieces.map((p) => verdict(ownOf(p)));
      // a question answered by the piece after it, on its line ("**Do you need a visa?** Yes, if…")
      for (let k = 0; k + 1 < pieces.length; k++) {
        if (verdicts[k] === 'question' && !verdicts[k + 1] && answeredBy(pieces[k], pieces[k + 1], true)) verdicts[k] = null;
      }
      // …or on the next line of the chunk ("Do you need a visa?\nYes, if…")
      const last = pieces.length - 1;
      if (verdicts[last] === 'question' && li + 1 < n && answeredBy(pieces[last], lines[li + 1], false)) verdicts[last] = null;
      // an offer that only continues a question that goes, goes with it (not counted again)
      const follows = new Set<number>();
      for (let k = 1; k < pieces.length; k++) if (verdicts[k - 1] === 'question' && !verdicts[k] && continues(pieces[k])) follows.add(k);
      let trimmed = false;
      for (let k = 0; k < pieces.length; k++) {
        if (verdicts[k] === 'question' && !QUOTE_MARK.test(pieces[k])) {
          // a question aside, opened by a dash or a bracket in the sentence it interrupts, goes alone: "Pick the
          // Air — do you really need ports? — unless…", "Book the train early (why? prices double…) and…"
          const m = /^([\s\S]*?[\p{L}\p{N}][^—–(]*?)(\s+)([—–]|\()\s*([^—–()]+\?["'’”*_]*\s*)$/u.exec(pieces[k]);
          if (m && /[\p{L}\p{N}]+\W+[\p{L}\p{N}]+/u.test(m[1]) && !verdict(m[1])) {
            count(m[4], 'question');
            counted++;
            pieces[k] = m[1] + m[2] + (m[3] === '(' ? '(' : '');
            verdicts[k] = null;
            if (m[3] !== '(') asideOpen = true;
            trimmed = true;
          }
        } else if (verdicts[k] === 'claim') {
          // a claim that is one clause of its sentence goes alone
          const t = trimClaim(pieces[k]);
          if (t !== null) {
            count(pieces[k], 'claim');
            counted++;
            pieces[k] = t;
            verdicts[k] = null;
            trimmed = true;
          }
        }
      }
      if (trimmed) removed = true;
      if (!verdicts.some(Boolean)) {
        out.push(pieces.join(''));
        atEnd();
        return;
      }
      removed = true;
      // the first piece going takes its words, not the item's number or indentation ("1. **Do you overpronate?** Get…")
      const lead = verdicts[0] ? /^\s*(?:(?:[-*+•]|\d{1,3}[.)])\s+)?/.exec(pieces[0])![0] : '';
      const kept = lead + pieces.filter((_, k) => !verdicts[k] && !follows.has(k)).join('');
      if (!kept.replace(/^\s*(?:[-*+•]|\d{1,3}[.)])\s*/, '').trim()) {
        // the whole line goes (with its number)
        out.push(null);
        pieces.forEach((p, k) => verdicts[k] && gone[li].push([p, verdicts[k]!]));
      } else {
        pieces.forEach((p, k) => {
          if (!verdicts[k]) return;
          count(p, verdicts[k]!);
          counted++;
        });
        out.push(kept);
      }
      atEnd();
    });
    if (/\n\s*\n\s*$/.test(chunk)) quotes.length = 0;
    if (!removed) return { text: chunk, removed: false, hold: null };
    // one question of Socria's own is all the chunk says, and it ends the chunk: the next chunk may answer it
    const filled = lines.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0);
    const qi = filled.length === 1 ? filled[0] : -1;
    if (hard && qi >= 0 && counted === 0 && out[qi] === null && gone[qi].length === 1 && gone[qi][0][1] === 'question') {
      const lead = lines.slice(0, qi).map((l) => l + '\n').join('');
      const trail = qi < n - 1 ? '\n' + lines.slice(qi + 1).join('\n') : '';
      const ownLine = begins || qi > 0;
      // a question opening a list item whose line goes on in the next chunk: the item's number stays if it does
      const item = qi === n - 1 && (begins || qi > 0) ? (/^\s*(?:[-*+•]|\d{1,3}[.)])\s+/.exec(lines[qi])?.[0] ?? '') : '';
      // taken out, it leaves what came before it, and — when it did not start a line — the break after it
      return { text: '', removed: true, hold: { keepOnDrop: lead + (ownLine ? '' : trail), ownLine, item } };
    }
    for (const list of gone) for (const [p, v] of list) count(p, v);
    const parts: string[] = [];
    for (let li = 0; li < n; li++) {
      const x = out[li];
      if (x !== null) parts.push(x);
      else if (li === n - 1 || (li === 0 && !begins)) parts.push('');
    }
    return { text: parts.join('\n'), removed: true, hold: null };
  };

  /** A held question: back with its answer (the count undone), or left out — returning what of it stays. */
  const resolve = (answered: boolean): string => {
    const h = heldQ;
    heldQ = null;
    if (!h) return '';
    if (!answered) return h.keepOnDrop;
    dropped.questions--;
    if (h.offer !== null) {
      const k = offers.lastIndexOf(h.offer);
      if (k >= 0) offers.splice(k, 1);
    }
    return h.text;
  };

  const filter = (sentence: string): string => {
    hold = null;
    splitAt = 0;
    if (!armed) return sentence;
    if (asideOpen) {
      asideOpen = false;
      sentence = sentence.replace(/^\s*[—–]\s*/, '');
      if (!sentence) return '';
    }
    // a list's number on its own waits for its item, and is judged with it (a question still held before it was
    // its own item: a number is no answer to it)
    if (!marker && atLineStart && MARKER_ONLY.test(sentence)) {
      const pre = heldQ ? resolve(false) : '';
      marker = sentence;
      atLineStart = false;
      hold = 'marker';
      return pre;
    }
    const chunk = marker + sentence;
    const begins = marker ? true : atLineStart;
    const joined = marker.length;
    marker = '';
    // a list's number at the end of a chunk ("Summary:\n1. ") waits for its item too
    const tail = /\n[ \t]*\d{1,3}[.)][ \t]*$/.test(chunk) ? /\d{1,3}[.)][ \t]*$/.exec(chunk)![0] : '';
    const body = tail ? chunk.slice(0, chunk.length - tail.length) : chunk;
    const { text: kept, removed, hold: h } = judge(body, begins);
    atLineStart = tail ? false : /\n\s*$/.test(body);
    let text = kept;
    if (heldQ) {
      // answered by a sentence that is not a question, and not an offer that only continues it: on the next
      // line, an answer in so many words; on the same line, that or (after a condition) the advice
      const q = interrogatives(plain(text));
      const was = heldQ;
      // on its line only when this chunk did not begin with the line's break (small stream pieces send it apart)
      const sameLine = !begins && !/^[ \t]*\n/.test(text);
      const answered = h === null && !!text.trim() && !q.explicit.length && !q.disguised.length && !q.offers.length && answeredBy(was.text, text, sameLine);
      // an offer that only continues it, on its line, goes with it ("Want the list? " … "I can send it. ")
      if (!answered && h === null && sameLine && continues(text)) text = /\s*$/.exec(text)![0];
      let back = resolve(answered);
      if (!answered) {
        // a question on a line of its own goes with its line break, wherever the stream cut that
        if (was.ownLine && !/\n\s*$/.test(was.text)) text = text.replace(/^[ \t]*\n/, '');
        // the item it opened goes on: its number stays ("1. Do you overpronate? " … "Get a stability shoe.")
        if (was.item && sameLine && text.trim()) back += was.item;
      }
      text = back + text;
    }
    if (h !== null) {
      const own = body.trim();
      heldQ = { text: body, keepOnDrop: h.keepOnDrop, offer: count(own, 'question'), ownLine: h.ownLine, item: h.item };
      if (tail) marker = tail;
      hold = 'question';
      // what waited before it goes out now (a break, or an earlier question's lead)
      const out = pendingSep + text;
      pendingSep = '';
      return out;
    }
    if (tail) marker = tail;
    if (!removed && text === body && !pendingSep) {
      if (!text && tail) hold = 'marker';
      splitAt = joined;
      return text;
    }
    if (!text.trim()) {
      // taken out whole: the whitespace it carried waits, exactly, for the next chunk
      pendingSep += text;
      if (tail) hold = 'marker';
      return '';
    }
    const lead = pendingSep;
    pendingSep = '';
    return lead + text;
  };
  const drop = (sentence: string): boolean => filter(sentence) === '' && hold !== 'marker';
  const filterAll = (sentence: string): string[] => {
    const out = filter(sentence);
    if (out === '') return hold === 'marker' ? [''] : [];
    return splitAt > 0 && splitAt < out.length ? [out.slice(0, splitAt), out.slice(splitAt)] : [out];
  };
  const exempt = (sentence: string): boolean => {
    if (!hard || !sentence.trim()) return false;
    const q = interrogatives(plain(sentence));
    return q.explicit.length > 0 || q.disguised.length > 0 || q.offers.length > 0;
  };
  /** What waits, in the order it came: a break a chunk taken out carried, a held question's lead, a list number. */
  const waiting = () => {
    const pre = pendingSep + resolve(false) + marker;
    pendingSep = '';
    marker = '';
    return pre;
  };
  const see = (ws: string): string => {
    if (!armed) return ws;
    if (/\n/.test(ws)) {
      atLineStart = true;
      curLine = '';
      lineKept = inFence;
    }
    if (/\n\s*\n/.test(ws)) quotes.length = 0;
    if (heldQ && !marker) {
      // a question still waiting may be answered after the break: the break goes with it (and stays, where
      // the question did not start its line, if it is left out)
      heldQ.text += ws;
      if (!heldQ.ownLine) heldQ.keepOnDrop += ws;
      return '';
    }
    return waiting() + ws;
  };

  const sawBlock = (chunk: string): string => {
    if (!armed) return '';
    const pre = waiting();
    if ((chunk.match(/```|~~~/g) ?? []).length % 2) inFence = !inFence;
    lineKept = inFence;
    atLineStart = /\n\s*$/.test(chunk);
    curLine = '';
    return pre;
  };
  const settle = (): string => {
    const lead = resolve(false);
    const rest = marker ? pendingSep + lead + marker : '';
    marker = '';
    pendingSep = '';
    return rest;
  };
  return { filter, filterAll, drop, lastHold: () => hold, exempt, see, sawBlock, settle, dropped, offers };
}

/**
 * THE INTEGRITY MONITOR'S ONLY WORDS. When MR's filters would leave a reply
 * empty, the person still gets a turn — never a question their "stop asking"
 * ruled out, and never the claim that was taken out:
 *   • offers that are not questions ("Let me know if you want the
 *     comparison."), or any offer when no "stop asking" is in force, go out
 *     as written (the stream gate's own neverEmpty rule);
 *   • otherwise one fixed line: an acknowledgement, or — when what was taken
 *     out was a claim that they improved — the honest reason there is none.
 */
export const EMPTY_REPLY_LINES = Object.freeze({
  questions: 'Understood.',
  claims: "From one conversation I can't tell how much you've improved — trying a new problem on your own would show it.",
});

export function emptyReplyFallback(g: ReplyGate, hardNoQuestions: boolean): { text: string; restored: number; fallback: boolean } | null {
  if (!g.dropped.questions && !g.dropped.claims) return null;
  const restorable = hardNoQuestions ? g.offers.filter((o) => !/\?/.test(o)) : g.offers;
  if (restorable.length) {
    g.dropped.questions -= restorable.length;
    g.dropped.offersRestored += restorable.length;
    return { text: restorable.join('').trim(), restored: restorable.length, fallback: false };
  }
  return { text: g.dropped.claims && !g.dropped.questions ? EMPTY_REPLY_LINES.claims : EMPTY_REPLY_LINES.questions, restored: 0, fallback: true };
}
