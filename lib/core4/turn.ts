import 'server-only';
// lib/core4/turn.ts
//
// One Core 4 turn: UNDERSTAND → ALLOCATE → INTERVENE → MEASURE → LEARN.
//
//   prepareTurn()  before the reply. Reads the person's explicit words,
//                  loads last turn's state and the ledger (in parallel), runs
//                  the state reader (one cheap call, with a timeout), merges,
//                  applies corrections, allocates the work, prices questions,
//                  detects diminishing returns, chooses the move, and — when
//                  their attempt needs checking and the answer must stay
//                  private — runs Verify Mode. Returns the blocks the reply
//                  model reads.
//
//   guardReply()   after the draft. Answer Guard 2.0: deterministic first,
//                  the cheap model only for what structure cannot decide.
//
//   finishTurn()   after the reply is sent. Writes the ledger (attributed in
//                  code), the carried-forward state, the previous turn's
//                  outcome, this turn's content-free trace and any capability
//                  evidence.
//
// Everything here fails soft. The failure directions are chosen: no state →
// carry the last one forward; no guard model → keep the deterministic
// verdict; no store → lose one turn of continuity, never the reply.

import { EMPTY_STATE, type CognitiveState } from '../cognition/state';
import { readState, guardModel, checkWork, COGNITION_MODEL } from '../cognition/engine';
import { testDependencies, renderCounterfactual, testContradictions, renderContradictions, type Counterfactual, type ContradictionTest } from './counterfactual';
import { calibrate as sampleClaim, renderCalibration, type Calibration } from './calibration';
import { readSignals, readContract } from './signals';
import { mergeState, recordTurn, gapCheck } from './merge';
import { allocate } from './allocation';
import { diminishingReturns, questionBudget, familyOf } from './budget';
import { selectIntervention, renderDecision } from './intervene';
import { guardStructure, leaksHidden, type GuardInput } from './guard2';
import { exactCheck, renderCheck, hiddenValues, computeAsked, statedSlips, type CheckResult, CHECK_FLOOR } from './verify';
import { consideredView, entriesFromPerson, entriesFromSocria, mergeEntries, disputeTurn, supersedeRestated, raisable, echoesSocria, grounding, linksFromRelations } from './ledger';
import { calibrate, conceptKey, evidenceFromTurn, taskCompetence } from './capability';
import { buildProblem, renderProblem, type ProblemModel } from './problem';
import { detectMissing, gateContributions, renderMissing, type MissingContribution } from './contribution';
import { buildTrace } from './trace';
import { questionLoad, stripInterrogatives, deleteSentences } from './questions';
export { SentenceGate } from './stream-gate';
import * as store from './store';
import { similarity } from './considered';
import type {
  Allocation,
  Diminishing,
  ExplicitSignals,
  GuardOutcome,
  InterventionDecision,
  LedgerEntry,
  LedgerLink,
  CapabilityEvidence,
  NoveltyVerdict,
  QuestionBudget,
} from './types';

// Council D17: the reader has 2 s; on timeout the prior state carries forward.
const STATE_TIMEOUT_MS = 2000;

export interface TurnInput {
  apiKey: string;
  userId: string | null;
  conversationId: string | null;
  projectId: string | null;
  /** the transcript, words only (attachments named, not included) */
  brief: { role: 'user' | 'assistant'; content: string }[];
  /** the latest user message, words only */
  lastUserText: string;
  /** the Project's standing instructions, if any */
  instructions: string;
  now: number;
}

export interface PreparedTurn {
  input: TurnInput;
  prior: CognitiveState | null;
  state: CognitiveState;
  readOk: boolean;
  signals: ExplicitSignals;
  contract: ExplicitSignals;
  allocation: Allocation;
  budget: QuestionBudget;
  diminishing: Diminishing;
  decision: InterventionDecision;
  ledger: LedgerEntry[];
  considered: { lines: string[]; items: string[] };
  disputed: LedgerEntry[];
  /** their earlier positions this turn's restatement replaced */
  superseded: LedgerEntry[];
  verify: CheckResult | null;
  hidden: string[];
  /** how much structure extraction produced, and how much resolved to edges */
  structure: { relations: number; edges: number; items: number };
  /** what they have shown on THIS concept, from verified events */
  competence: ReturnType<typeof taskCompetence>;
  /** what was measured by ablation, when the gate opened */
  counterfactual: Counterfactual | null;
  /** what independent re-derivation said, when it disagreed with itself */
  calibration: Calibration | null;
  /** candidate contradictions that survived a direct test */
  contradictions: ContradictionTest[];
  /** the findings actually rendered, after measured results superseded asserted ones */
  missingShown: MissingContribution[];
  /**
   * The expertise BEFORE task calibration — what is persisted.
   *
   * `state.expertise` is calibrated for this turn's decision and must not be
   * written back: see the note at the `recordTurn` call in finishTurn.
   */
  baseExpertise: CognitiveState['expertise'];
  /** the problem as a connected structure, this turn */
  problem: ProblemModel;
  /** what the structure says is absent, novelty-gated and expertise-gated */
  missing: MissingContribution[];
  /** the prompt blocks, in order: state, verify, move */
  blocks: { state: string; verify: string; move: string };
  ms: Record<string, number>;
}

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

export async function prepareTurn(input: TurnInput): Promise<PreparedTurn> {
  const t0 = Date.now();
  const ms: Record<string, number> = {};
  const signals = readSignals(input.lastUserText);
  const contract = readContract(input.instructions);

  // Last turn's state and the ledger, together.
  const canStore = !!(input.userId && input.conversationId);
  const [prior, ledger, priorLinks, capability] = await Promise.all([
    canStore ? store.loadState(input.userId!, input.conversationId!) : Promise.resolve(null),
    input.userId ? store.loadLedger(input.userId, { conversationId: input.conversationId ?? '', projectId: input.projectId }) : Promise.resolve([] as LedgerEntry[]),
    input.userId ? store.loadLinks(input.userId) : Promise.resolve([] as LedgerLink[]),
    input.userId ? store.listCapability(input.userId) : Promise.resolve([] as CapabilityEvidence[]),
  ]);
  ms.load = Date.now() - t0;

  const focus = `${prior?.currentFocus ?? ''} ${input.lastUserText}`.slice(0, 600);
  const preView = consideredView(ledger, { focus, conversationId: input.conversationId ?? '', projectId: input.projectId });

  const t1 = Date.now();
  const transcript = input.brief.map((m) => `${m.role === 'user' ? 'Them' : 'Socria'}: ${m.content}`).join('\n\n').slice(-8000);
  const read = await withTimeout(
    readState(input.apiKey, { transcript, prior, considered: preView.lines, instructions: input.instructions }),
    STATE_TIMEOUT_MS,
    { state: EMPTY_STATE, ok: false }
  );
  ms.state = Date.now() - t1;

  const merged = mergeState({ prior: prior ? gapCheck(prior, input.now) : null, read: read.state, signals, contract, readOk: read.ok });
  // "Their last message answered what Socria asked" only when Socria asked
  // something: the reader's word alone told the model to use an answer to a
  // question nobody put (run 4, direct-answer-003).
  const settled = merged.resolved && questionLoad(lastSocria(input)) === 0 ? { ...merged, resolved: false } : merged;
  // Task-scoped competence: what they have SHOWN on this concept, from
  // verified events only, overriding a global guess made from one message.
  // The events have been recorded since the capability model was built and
  // nothing ever read them back on the reply path.
  const competence = taskCompetence(capability, conceptKey(settled.currentFocus || settled.currentGoal));
  const state = { ...settled, expertise: calibrate(settled.expertise, competence) };

  // "That's not what I meant": what was recorded as theirs last turn is disputed.
  // A correction of Socria, or their own revision ("I was computing the wrong
  // thing"): what was recorded as theirs last turn no longer stands.
  const disputed = (signals.correction || signals.revision) && prior && input.conversationId
    ? disputeTurn(ledger, input.conversationId, prior.turn, input.now, signals.evidence.join('; '))
    : [];

  // A position they restate replaces the one they held (run 4, learning-012).
  const superseded = input.conversationId
    ? supersedeRestated(ledger, state.consideredNow.filter((c) => grounding(c, input.lastUserText) !== 'inferred' || echoesSocria(c, lastSocria(input))), input.conversationId, state.turn, input.now)
    : [];

  // The considered record, with this turn's own contributions from the
  // person included (they raised them a moment ago).
  const considered = consideredView(ledger, { focus: `${state.currentFocus} ${input.lastUserText}`, conversationId: input.conversationId ?? '', projectId: input.projectId });
  // The move block shows everything on the table; the novelty gate deletes
  // only for repeating what can be raised (ledger.ts raisable).
  const gateItems = [...new Set([...state.consideredNow.filter((c) => raisable(c.kind, 'user')).map((c) => c.text), ...considered.gate])];
  // Only what is grounded in THEIR words, and is not an echo of Socria's last
  // reply, is shown as "they raised just now" (council D10; run 3).
  const groundedNow = state.consideredNow.filter((c) => !echoesSocria(c, lastSocria(input)) && grounding(c, input.lastUserText) !== 'inferred');
  // An echo of Socria is never recorded as their own idea (council D10). But
  // it is where they now stand, so a position they state in their own words
  // is shown — as what they SAID, with no claim about whose idea it was:
  // lexical echo detection is too loose to credit Socria either (run 5 found
  // their own conclusions and questions labelled "accepted Socria's point").
  const acceptedNow = state.consideredNow.filter((c) => (c.stance === 'asserts' || c.stance === 'accepts') && c.kind !== 'question' && c.kind !== 'uncertainty' && echoesSocria(c, lastSocria(input)) && grounding(c, input.lastUserText) !== 'inferred');
  const allLines = [...new Set([
    ...groundedNow.map((c) => `they ${c.stance === 'rejects' ? 'ruled out' : 'raised'} just now: ${c.text}${c.reason ? ` (because: ${c.reason})` : ''}`),
    ...acceptedNow.map((c) => `they said just now: ${c.text}`),
    ...considered.lines,
  ])];

  // ── the problem, as a structure, and what the structure says is absent ──
  //
  // Built from the ledger plus the items of THIS message (provisional, since
  // the real entries are written in finishTurn) — otherwise the detector is
  // always a turn behind, and the commonest case, a conclusion stated now
  // resting on an assumption made earlier, could never fire.
  //
  // Everything here is pure: no model call, no I/O, no added latency.
  const provisional = input.conversationId
    ? entriesFromPerson(state.consideredNow, input.lastUserText, { conversationId: input.conversationId, projectId: input.projectId, turn: state.turn, now: input.now }, lastSocria(input))
    : [];
  const problemEntries = [...ledger, ...provisional];
  const freshEdges = linksFromRelations(state.relations, problemEntries, input.now);
  const problem = buildProblem(
    problemEntries,
    [...priorLinks, ...freshEdges],
    state,
    { conversationId: input.conversationId ?? '', projectId: input.projectId }
  );
  const missing = gateContributions(detectMissing(problem, state), considered.items, state.expertise.value);

  const diminishing = diminishingReturns(state, signals, input.brief);
  const budget = questionBudget(state, signals, input.brief, diminishing);

  // Verify Mode, part one: arithmetic in their attempt is checked EXACTLY,
  // before anything is decided — a computed verdict outranks the reader's
  // opinion of whether they got it right, and the move depends on it.
  const attempting = state.latest === 'attempt' || state.attempt !== 'none' || state.work === 'verification';
  // The PERSON's words only (council D13): an expression in one of Socria's
  // replies is never "the problem".
  const posedText = input.brief.filter((m) => m.role === 'user').slice(-3).map((m) => m.content).join('\n');
  let verify: CheckResult | null = attempting ? exactCheck(posedText, input.lastUserText) : null;
  if (verify) state.attempt = verify.verdict === 'correct' ? 'right' : 'wrong';

  const decide = () => {
    const a = allocate({ state, signals, contract });
    return { allocation: a, decision: selectIntervention({ state, allocation: a, budget, diminishing, signals, considered: allLines.slice(0, 12) }) };
  };
  let { allocation, decision } = decide();

  // Verify Mode, part two: when arithmetic could not settle it, a SEPARATE
  // checker call judges the attempt. Under a withhold its solution never
  // reaches the reply model (renderCheck, hiddenValues). A confident verdict
  // that contradicts the reader re-decides the move.
  //
  // IT USED TO REQUIRE A WITHHOLD, and that was the wrong gate. Measured over
  // run 6: the person offered checkable work on 38 of 82 turns and the
  // checker ran on 6 — the 6 with a withhold. On the other 32 the cheap
  // reader's GUESS went into the prompt as fact, and it was visibly wrong:
  // a correct statement of Keeler–Cretin arrived as "their latest attempt:
  // partial" and the reply opened "two things to tighten"; arithmetic that
  // was wrong arrived as "partial" with no check and the reply said "the
  // arithmetic holds". Withholding is about who does the work. Whether the
  // work is RIGHT is a different question and it is always worth asking.
  //
  // The cost is bounded and lands where it is wanted: only turns where they
  // actually offered something to check, only when exact arithmetic could not
  // already settle it, 1.5 s at worst, on a turn whose whole point is "is
  // this right".
  //
  // The gate is what they DID, not the reader's `attempt` field alone: that
  // field comes back non-none on planning questions and status updates, so
  // gating on it alone fired the checker on turns with nothing to check —
  // a 1.5 s call that can only answer "unknown". Found by a run-8 player
  // within minutes of the change, which is the cost of widening a gate
  // without tightening what it reads.
  const showedWork = state.latest === 'attempt' || state.work === 'verification' || state.work === 'practice';
  if (!verify && showedWork && state.attempt !== 'none') {
    const t2 = Date.now();
    verify = await withTimeout(checkWork(input.apiKey, input.brief.slice(-5).map((m) => `${m.role === 'user' ? 'Them' : 'Socria'}: ${m.content}`).join('\n'), input.lastUserText), 1500, null);
    ms.verify = Date.now() - t2;
    if (verify && verify.confidence >= CHECK_FLOOR && verify.verdict !== 'unknown') {
      const judged = verify.verdict === 'correct' ? 'right' : verify.verdict === 'partial' ? 'partial' : 'wrong';
      if (judged !== state.attempt) {
        state.attempt = judged;
        ({ allocation, decision } = decide());
      }
    }
  }
  // ── MEASURED, NOT ASSERTED ──────────────────────────────────────
  //
  // The two stages that are not a re-reading of the transcript. Everything
  // else in this pipeline hands a weaker model text the reply model already
  // holds, which is why an adversarial audit reproduced sixteen of nineteen
  // claimed remainders with a prompt (docs/CORE-4-ARCHITECTURE.md §5″). These
  // two run the model on inputs the conversation never contained — a premise
  // set with one premise removed, and the same question asked independently
  // several times — so what they produce is generated, not recalled.
  //
  // GATED TO WHERE IT IS WORTH THE MONEY. `coverage === 'complete'` already
  // means high stakes AND demonstrated expertise on a substantive move with
  // nothing withheld: the turns where someone is about to act on their own
  // reasoning. On everything else these never fire, so D17's per-turn cost
  // ceiling holds for the ordinary turn and is deliberately exceeded here.
  //
  // Both fail to null, in parallel, behind hard timeouts. A turn is never
  // worse for either being unavailable — the same failure direction every
  // other optional stage takes.
  let counterfactual: Counterfactual | null = null;
  let calibration: Calibration | null = null;
  let contradictions: ContradictionTest[] = [];
  if (decision.coverage === 'complete' && problem.live.length >= 2 && !allocation.withhold) {
    const t3 = Date.now();
    [counterfactual, calibration, contradictions] = await Promise.all([
      withTimeout(testDependencies(input.apiKey, problem, state).catch(() => null), 2500, null),
      withTimeout(sampleClaim(input.apiKey, problem, transcript).catch(() => null), 2500, null),
      withTimeout(testContradictions(input.apiKey, problem).catch(() => []), 2500, [] as ContradictionTest[]),
    ]);
    ms.measure = Date.now() - t3;
  }
  // A MEASURED RELATION SUPERSEDES AN ASSERTED ONE. Where the ablation
  // actually tested what a conclusion rests on, the reader's guess about the
  // same thing is not also shown: two blocks making the same point, one of
  // them weaker, is how a person learns to discount both. Same for a
  // contradiction that was put to the test.
  const measuredDependency = !!counterfactual?.ablations.some((a) => a.dependence === 'load_bearing');
  const measuredContradiction = contradictions.length > 0;
  const supersededKinds = new Set<string>([
    ...(measuredDependency ? ['HIDDEN_ASSUMPTION'] : []),
    ...(measuredContradiction ? ['CONTRADICTION'] : []),
  ]);
  const missingShown = supersededKinds.size ? missing.filter((m) => !supersededKinds.has(m.kind)) : missing;

  // Nothing the person wrote themselves is a secret (run 2, direct-answer-012:
  // they asked "is the answer definitely 7?" and the sentence saying yes was
  // deleted because 7 was the checker's expected value).
  const hidden = allocation.withhold ? hiddenValues(verify).filter((v) => leaksHidden(input.lastUserText, [v]).length === 0) : [];

  const verifyBlock = allocation.withhold
    ? renderCheck(verify)
    : verify && verify.confidence >= CHECK_FLOOR && verify.verdict !== 'unknown'
      ? `\n=== Their attempt was checked ===\nVERDICT: ${verify.verdict}${verify.method === 'exact' ? ' (computed exactly)' : ''}${verify.expected ? `\nCORRECT ANSWER: ${verify.expected}` : ''}\n`
      : '';

  // A verdict that was COMPUTED or confidently CHECKED is a fact, not a
  // guess: a correction or confirmation resting on it is imposed (council D1).
  if ((decision.type === 'CORRECT' || decision.type === 'VERIFY') && verify && verify.verdict !== 'unknown' && (verify.method === 'exact' || verify.confidence >= CHECK_FLOOR)) {
    decision = { ...decision, forced: true };
  }
  // CALCULATE only when the value was actually computed (council D7);
  // otherwise it is an ANSWER, which may not claim to have calculated.
  let computed = '';
  if (decision.type === 'CALCULATE') {
    const c = computeAsked(input.lastUserText);
    if (c) {
      computed = `\n=== Computed exactly (use this value) ===\n${c.expr} = ${c.value}\n`;
      decision = { ...decision, forced: true };
    }
    else decision = { ...decision, type: 'ANSWER', reasonCode: `${decision.reasonCode}.not_computed` };
  }

  // Arithmetic they wrote out, checked exactly (run 6, decision-015). Under
  // a withhold, only that the line does not compute — never the value.
  const slips = statedSlips(input.lastUserText);
  if (slips.length) {
    computed += `\n=== Arithmetic in their message, computed exactly ===\n${slips
      .map((s) => (allocation.withhold ? `${s.line} — does not compute (do not give the right value; say which line to recheck)` : `${s.line} — the right value is ${s.actual}, not ${s.stated}`))
      .join('\n')}\nSay this plainly and early, and carry the corrected figure through anything that depends on it.\n`;
    decision = { ...decision, forced: true };
  }

  let move = renderDecision({ ...decision, avoid: allLines.slice(0, 12) }, allocation) + renderMissing(missingShown);
  if (signals.offRecord && !signals.onRecord) {
    move += '\nThey asked for this to be off the record: say in one clause that Socria will not keep anything from this conversation from now on, and that "you can remember this" turns it back on. Then carry on.\n';
  }
  if (allocation.announce) {
    move += '\nThis is the first time you are holding something back in this conversation: say so once, in a clause, and that they can have it by asking (e.g. "say the word and I\'ll give you the answer"). Do not repeat this in later turns.\n';
  }

  ms.prepare = Date.now() - t0;
  return {
    input,
    prior,
    state,
    readOk: read.ok,
    signals,
    contract,
    allocation,
    budget,
    diminishing,
    decision: { ...decision, avoid: gateItems.slice(0, 12) },
    ledger,
    considered: { lines: allLines, items: gateItems },
    problem,
    missing,
    competence,
    baseExpertise: settled.expertise,
    structure: { relations: state.relations.length, edges: freshEdges.length, items: problem.live.length },
    counterfactual,
    calibration,
    contradictions,
    missingShown,
    disputed,
    superseded,
    verify,
    hidden,
    blocks: { state: renderStateBlock(state) + renderProblem(problem) + renderCounterfactual(counterfactual) + renderContradictions(contradictions) + renderCalibration(calibration) + lastTime(ledger, input, state.turn), verify: verifyBlock + computed, move },
    ms,
  };
}

/**
 * "From their last conversation": at the start of a conversation, their own
 * standing entries from their most recent OTHER conversation in the same
 * scope (same Project, or both outside Projects), within 30 days — never
 * private ones. Council D14's reversal condition, triggered by runs 1 and 2:
 * cross-session continuity from relevance-ranked recall alone fell below a
 * baseline given the plain earlier transcript (expert-010: a decisive
 * caveat from session 1 never reached session 2).
 */
function lastTime(ledger: LedgerEntry[], input: TurnInput, turn: number): string {
  if (!input.conversationId) return '';
  const cutoff = input.now - 30 * 86_400_000;
  const earlier = ledger.filter(
    (e) => e.conversationId !== input.conversationId && (e.owner === 'user' || e.owner === 'socria') && !e.private &&
      e.status !== 'disputed' && e.status !== 'retracted' && e.status !== 'superseded' && (e.projectId ?? null) === (input.projectId ?? null) && e.updatedAt >= cutoff
  );
  const theirs = earlier.filter((e) => e.owner === 'user');
  if (!theirs.length) return '';
  const latest = theirs.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
  const same = earlier.filter((e) => e.conversationId === latest.conversationId).sort((a, b) => a.turn - b.turn);
  // On the first turn it opens the conversation. Later it stays only while
  // what they are saying touches it — run 5 (longitudinal-005,
  // debugging-001) lost the cross-session connection on session two's
  // SECOND turn, after the block had gone.
  if (turn > 1 && !same.filter((e) => e.owner === 'user').slice(0, 8).some((e) => similarity(e.text, input.lastUserText) >= 0.5)) return '';
  const when = new Date(latest.updatedAt).toISOString().slice(0, 10);
  const word: Record<string, string> = { asserts: 'held', entertains: 'raised the possibility', asks: 'asked', rejects: 'ruled out', accepts: 'accepted', resolved: 'settled' };
  const lines = [
    ...same.filter((e) => e.owner === 'user').slice(0, 8).map((e) => `  - they ${word[e.stance] ?? 'raised'}: ${e.text}${e.reason ? ` (because: ${e.reason})` : ''}`),
    // Socria's own suggestions, as Socria's: so it can own them when asked
    // ("was that your idea or mine?") instead of evading (longitudinal-005).
    ...same.filter((e) => e.owner === 'socria' && e.kind !== 'question').slice(0, 4).map((e) => `  - Socria suggested: ${e.text}`),
  ];
  // WHAT THIS BLOCK IS NOT. Run 9, power-calibration-008: a beginner asked a
  // plain "how do I make Postgres use my index" question, and the reply
  // closed with "the fresh stats and exact predicate match you'd already
  // verified carry over; no need to redo them". She had verified neither —
  // those were another conversation's checks, on another database. So the
  // block did not merely mis-attribute: it told someone a diagnostic step was
  // already done and could be skipped, and that step was the one that would
  // have found her problem. Recall that licenses skipping work is worse than
  // no recall, because the person cannot see what it is resting on.
  return `\n=== From their last conversation (${when}) — attributed as recorded; use what matters now ===\n${lines.join('\n')}\nThis is what they were working on THEN, in a different conversation. It is context, not established fact here: never tell them something has already been checked, tried, ruled out or verified on the strength of these lines, and never let one stand in for a step this conversation still needs. If it matters now, it is to be established now.\n`;
}

// renderState is imported lazily to keep the dependency direction clean.
import { renderState } from '../cognition/state';
function renderStateBlock(s: CognitiveState): string {
  return renderState(s);
}

/** Socria's most recent reply in this conversation. */
function lastSocria(input: TurnInput): string {
  for (let i = input.brief.length - 1; i >= 0; i--) if (input.brief[i].role === 'assistant') return input.brief[i].content;
  return '';
}

/** Their problem, in their words: the last few things they wrote. */
function targetOf(p: PreparedTurn): string {
  return p.input.brief.filter((m) => m.role === 'user').slice(-3).map((m) => m.content).join('\n');
}

export interface GuardedReply {
  text: string;
  outcome: GuardOutcome;
  novelty: NoveltyVerdict[];
  /** a regeneration is needed with this note (the caller runs the frontier model once more) */
  retryNote?: string;
}

/** Answer Guard 2.0 on a complete draft. */
export async function guardReply(p: PreparedTurn, draft: string): Promise<GuardedReply> {
  const input: GuardInput = { decision: p.decision, allocation: p.allocation, draft, considered: p.considered.items, hidden: p.hidden, target: targetOf(p) };
  const g = guardStructure(input);
  let text = g.revised ?? draft;
  let outcome: GuardOutcome = { action: g.action, findings: g.findings, by: g.by, ...(g.revised ? { revised: g.revised } : {}), ...(g.retryNote ? { retryNote: g.retryNote } : {}) };
  let novelty = g.novelty;
  if (g.retryNote) return { text, outcome, novelty, retryNote: g.retryNote };

  if (g.needsModel && p.input.apiKey) {
    const t = Date.now();
    const m = await withTimeout(guardModel(p.input.apiKey, { ...input, draft: text }, p.input.lastUserText), 1500, null);
    p.ms.guardModel = Date.now() - t;
    if (m) {
      // Coerce: without anything withheld there is no overreach to fix.
      const action = !p.allocation.withhold && m.action === 'MODIFY_FOR_MORE_AGENCY' ? 'ALLOW' : m.action;
      // The cheap model's prose never ships (Council D8). Its fixes are
      // deletions of the exact sentences it named, or a regeneration by the
      // frontier model.
      if (m.redundant.length) {
        const kept = deleteSentences(text, m.redundant);
        if (kept && kept.split(/\s+/).length >= 6) text = kept;
        novelty = [...novelty, ...m.redundant.map((s) => ({ sentence: s, verdict: 'REDUNDANT' as const, match: null, score: 1, method: 'model' as const }))];
      }
      const needsRetry = action !== 'ALLOW' && !m.redundant.length;
      outcome = {
        action: action === 'ALLOW' && text !== draft ? 'MODIFY_FOR_MORE_HELP' : action,
        findings: [...g.findings, ...m.findings],
        by: 'model',
        ...(needsRetry
          ? { retryNote: `A check found: ${m.findings.map((f) => f.detail).join(' ') || action}. Fix exactly that and nothing else.` }
          : {}),
      };
      if (needsRetry) return { text, outcome, novelty, retryNote: outcome.retryNote };
    }
  }
  return { text, outcome, novelty };
}

/**
 * A retry that STILL fails the deterministic guard is never shipped as is.
 * The fallback is the safest version available: the retry with questions
 * stripped; if even that leaks a hidden value or is empty, a minimal reply
 * built from the verify verdict.
 */
export function fallbackReply(p: PreparedTurn, first: string, retry: string | null): { text: string; codes: string[] } {
  const codes: string[] = [];
  for (const candidate of [retry, first]) {
    if (!candidate) continue;
    const g = guardStructure({ decision: p.decision, allocation: p.allocation, draft: candidate, considered: p.considered.items, hidden: p.hidden, target: targetOf(p) });
    const text = g.revised ?? candidate;
    if (!g.retryNote) return { text, codes: [...codes, 'fallback:passed'] };
    const leaks = g.findings.some((f) => f.side === 'overreach');
    if (!leaks) {
      const stripped = stripInterrogatives(text, p.decision.maxQuestions).text;
      if (stripped) return { text: stripped, codes: [...codes, 'fallback:stripped'] };
    }
    codes.push(`fallback:rejected:${g.findings.map((f) => f.code).join(',')}`);
  }
  // Nothing is held back: never canned text. Ship the draft with only its
  // over-budget questions removed (council D8).
  if (!p.allocation.withhold) {
    const base = retry ?? first;
    return { text: stripInterrogatives(base, p.decision.maxQuestions).text ?? base, codes: [...codes, 'fallback:original'] };
  }
  const v = p.verify;
  const where = v?.location ? ` Look again at ${v.location}.` : '';
  const kind = v?.errorType ? ` The problem is ${v.errorType.replace(/^the /, '')}.` : '';
  const text = v && v.verdict === 'correct'
    ? 'That is right.'
    : v
      ? `Not quite yet.${where}${kind}`
      : 'Take the next step from where you are, and send it over — I will tell you exactly where it goes wrong, if it does.';
  return { text, codes: [...codes, 'fallback:minimal'] };
}

// ── after the reply ─────────────────────────────────────────────────

/** The state with every free-text field emptied: only enums, numbers and memos survive. */
function withoutText(s: CognitiveState): CognitiveState {
  const bare = <T>(f: { value: T; source: string; confidence: number }) => ({ ...f, evidence: '' });
  return {
    ...s,
    currentGoal: '', currentFocus: '', confusions: [], positions: [], assumptions: [], tensions: [], constraints: [],
    openThreads: [], recentChanges: [], newRelation: '', blockingUnknown: '', masteryEvidence: [], consideredNow: [],
    // `relations` carries the person's own sentences as `from`/`to` text.
    // Adding a field to CognitiveState without adding it here writes their
    // words into core4_state after they asked for nothing to be kept — the
    // exact failure this function exists to prevent, and one an audit caught
    // within an hour of the field being added.
    relations: [],
    learningGoal: bare(s.learningGoal), expertise: bare(s.expertise), stakes: bare(s.stakes), directness: bare(s.directness), authorship: bare(s.authorship),
    lastOutcome: s.lastOutcome ? { ...s.lastOutcome, evidence: '' } : null,
    history: s.history.map((h) => (h.outcome ? { ...h, outcome: { ...h.outcome, evidence: '' } } : h)),
  } as CognitiveState;
}

export async function finishTurn(
  p: PreparedTurn,
  sent: string,
  guard: GuardOutcome | null,
  regenerated: boolean,
  novelty: NoveltyVerdict[],
  served: string | null,
  promptVersion: string
): Promise<void> {
  const { input, state, allocation, decision } = p;
  if (!input.userId || !input.conversationId) return;
  const ctx = { conversationId: input.conversationId, projectId: input.projectId, turn: state.turn, now: input.now };

  // The ledger: the person's items attributed by grounding in their words;
  // Socria's from what was actually sent.
  const fromPerson = entriesFromPerson(state.consideredNow, input.lastUserText, ctx, lastSocria(input));
  const fromSocria = entriesFromSocria(sent, decision.type, ctx);
  const privateHere = state.persistPolicy === 'conversation_only';
  const merged = mergeEntries(p.ledger, [...fromPerson, ...fromSocria].map((e) => (privateHere ? { ...e, private: true } : e)), input.now);
  // No lexical auto-links (council D10): a link drawn from word overlap is
  // structure presented as the person's reasoning that they never stated.
  // Links come only from relations they state or the reader cites — which is
  // what this is. The reader names both ends by text and linksFromRelations
  // matches them back to ids exactly or not at all, so the JUDGEMENT that two
  // things stand in a relation is semantic and only the LOOKUP is lexical.
  // Until now nothing filled this slot, so `depends_on` existed in the schema
  // and never in the data, and nothing could notice a conclusion resting on
  // an unchecked assumption (lib/core4/problem.ts).
  const links = linksFromRelations(state.relations, [...p.ledger, ...merged.created], input.now);

  // THE CALIBRATED VALUE IS FOR THIS TURN AND IS NOT PERSISTED.
  //
  // `state.expertise` was calibrated at the top of prepareTurn from
  // capability_evidence, with source 'observed'. Persisting that made the
  // person's own deletion ineffective: deleteCapability drops the evidence
  // rows and the Memory page stops showing the concept, but the conclusion
  // drawn from them was already copied into core4_state — and mergeState's
  // stickiness keeps an 'observed' value ahead of every later inference, in
  // every conversation that recorded it, for as long as the row lives. A
  // deletion that leaves the judgement running is not a deletion (council
  // D15). Found by an adversarial audit of the capability path.
  //
  // Nothing is lost by dropping it: taskCompetence recomputes the calibration
  // from capability_evidence on every turn, so the effect persists exactly as
  // long as the evidence does, which is the behaviour the person controls.
  const next = recordTurn({ ...state, expertise: p.baseExpertise, lastAt: input.now }, {
    type: decision.type,
    family: familyOf(decision.type),
    questions: questionLoad(sent),
    withheld: !!allocation.withhold,
    failed: state.attempt === 'wrong' || state.attempt === 'partial',
  });

  const trace = buildTrace({
    state,
    readOk: p.readOk,
    allocation,
    decision,
    budget: p.budget,
    diminishing: p.diminishing,
    novelty,
    guard,
    regenerated,
    verify: p.verify,
    sentQuestions: questionLoad(sent),
    sentChars: sent.length,
    ledger: {
      user: merged.created.filter((e) => e.owner === 'user').length,
      socria: merged.created.filter((e) => e.owner === 'socria').length,
      unknown: merged.created.filter((e) => e.owner === 'unknown').length,
      disputed: p.disputed.length,
      superseded: p.superseded.length,
    },
    considered: p.considered.items.length,
    missing: p.missing,
    competence: p.competence,
    counterfactual: p.counterfactual,
    calibration: p.calibration,
    contradictions: p.contradictions,
    superseded: p.missing.length - p.missingShown.length,
    structure: p.structure,
    ms: p.ms,
    models: { reply: served, cognition: COGNITION_MODEL },
    promptVersion,
  });

  const evidence = evidenceFromTurn(state, p.prior, ctx, p.verify);
  // Off the record (council D15): no ledger, no capability evidence, no free
  // text in the saved state. The content-free trace is still written.
  const offRecord = state.persistPolicy === 'none';
  const writes: Promise<unknown>[] = [
    store.saveState(input.userId, input.conversationId, offRecord ? withoutText(next) : next, input.now),
    offRecord ? Promise.resolve() : store.saveLedger(input.userId, [...merged.created, ...merged.touched, ...p.disputed, ...p.superseded], links),
    store.insertTurn(input.userId, input.conversationId, trace, input.now),
    offRecord || privateHere ? Promise.resolve() : store.insertCapability(input.userId, evidence),
  ];
  // How the PREVIOUS turn landed belongs on its own row.
  if (p.prior && state.lastOutcome) writes.push(store.recordOutcome(input.userId, input.conversationId, p.prior.turn, state.lastOutcome));
  await Promise.all(writes);

  // For evaluation harnesses only: the decision path, observable without a database.
  // Eval hooks do nothing in production (council D15).
  const sink = process.env.NODE_ENV === 'production' ? undefined : (globalThis as { __socriaTrace?: unknown[] }).__socriaTrace;
  if (Array.isArray(sink)) {
    sink.push({
      trace,
      allocation,
      decision: { ...decision, objective: decision.objective },
      state: { work: state.work, taskKind: state.taskKind, learningGoal: state.learningGoal, expertise: state.expertise, directness: state.directness, consideredNow: state.consideredNow, lastOutcome: state.lastOutcome },
      budget: p.budget,
      diminishing: p.diminishing,
      considered: p.considered.lines,
      guard,
      verify: p.verify ? { method: p.verify.method, verdict: p.verify.verdict, location: p.verify.location } : null,
    });
  }
}
