// lib/mr/policy.ts — THE INTERVENTION POLICY ENGINE.
//
// Given what was observed at one turn (lib/mr/ifr.ts) and the adjustments
// already in force, decide whether to regulate the help Socria is giving —
// and most of the time, decide not to. Every rule here is deterministic, reads
// only typed observations, and emits a typed decision with its evidence, its
// scope, its expiry and how it would be rolled back (lib/mr/types.ts).
//
// HOW THE RULES ARE ORDERED, and why:
//
//   1. THEIR WORDS FIRST. An explicit request — "just show me the steps",
//      "stop asking me questions", "quiz me", "shorter" — is acted on the
//      turn it is said, with no dwell and no confidence threshold: it is not a
//      reading of them, it is an instruction from them. Their newest word
//      revokes an older one ("you can ask questions again").
//   2. THEN WHAT THE TRANSCRIPT SHOWS, and only from moderate evidence:
//      questions that kept not helping, an explanation that did not land
//      twice, attempts the engine refuted twice, the same request made again,
//      replies far longer than anything they asked for. These hold for a few
//      turns and then end on their own; they may not change a strategy MR set
//      less than `minDwellTurns` ago (oscillation is a failure mode, not
//      responsiveness).
//   3. NEVER FROM WEAK SIGNALS. A short "ok" is a hypothesis about nothing in
//      particular. It is recorded (state.uncertainty) and never acted on.
//
// HUMAN-FIRST IS NOT QUESTION-FIRST, so the rules move in both directions on
// purpose: fewer questions and the answer first when that is what serves
// them, and the difficulty KEPT when they asked to be quizzed (a quiz is not
// friction — scenario B). Rules that would only ever reduce challenge would
// be an engagement optimiser pointed the other way.
//
// WHAT THIS DOES NOT DO: decide anything a higher layer owns. Safety, their
// settings, the Answer Guard, a Core 4 withhold and graded-work integrity are
// applied over these decisions in lib/mr/execute.ts, which records what they
// took out (MRDecision.constrainedBy).
//
// IFR AND THE REST OF MR. Each rule says which family it belongs to: 'ifr'
// rules regulate friction (directness, questioning, verbosity, failed
// explanations, routine work); 'mr' rules regulate method in other ways (keep
// a quiz a quiz, a worked example after repeated engine-refuted attempts,
// simplify, verify, edit only what was asked). LOGOS_IFR=off turns the first
// family off, which is the IFR-on/off comparison of the proposal.
//
// Pure. Deterministic: the same observations, state and policy give the same
// decisions with the same ids.

import { createHash } from 'node:crypto';
import type { AssistDecision } from '../cognition/assist';
import type { CoreView } from '../runtime/allocation';
import type { StrategyParams } from './config';
import type {
  Action,
  ControlKey,
  EvaluationPlan,
  EvidenceRef,
  InterventionRecord,
  MRDecision,
  Observation,
  ObservationCode,
  Scope,
  Target,
  TypedControls,
} from './types';

// ── the rules ────────────────────────────────────────────────────────

export type RuleFamily = 'ifr' | 'mr';

export interface RuleContext {
  turn: number;
  obs: readonly Observation[];
  params: Readonly<StrategyParams>;
  /** they said it is standing ("from now on") this turn */
  standing: boolean;
  /** ...and held it to this conversation ("for the rest of this chat"): never carried across */
  bounded: boolean;
  /** standing preferences may be carried across conversations (their consent) */
  carryAcross: boolean;
  /** only at the newest turn: what ACS decided, and the route's ceiling */
  now: PolicyNow | null;
}

export interface PolicyNow {
  assist: AssistDecision;
  core: CoreView | null;
  maxReply: number;
}

interface Rule {
  id: string;
  family: RuleFamily;
  /** any of these at this turn fires the rule */
  on: readonly ObservationCode[];
  action: Action;
  target: readonly Target[];
  /** the controls this rule may set — the integrity monitor rejects a decision that sets any other */
  may: readonly ControlKey[];
  controls: (c: RuleContext) => TypedControls;
  scope: (c: RuleContext) => Scope;
  /** codes that end it early */
  onRevoke: readonly ObservationCode[];
  plan: EvaluationPlan;
  /** optional extra condition */
  when?: (c: RuleContext) => boolean;
}

const has = (c: RuleContext, code: ObservationCode) => c.obs.some((o) => o.code === code);
/** Across conversations only when they said it open-ended AND agreed to have it carried; the scope they stated is never widened. */
const openEnded = (c: RuleContext): Scope => ({ kind: c.standing && !c.bounded && c.carryAcross ? 'standing' : 'conversation' });
const momentary = (c: RuleContext): Scope => (c.standing ? openEnded(c) : { kind: 'turns', turns: c.params.momentaryTurns });
const forTurns = (n: number): Scope => ({ kind: 'turns', turns: n });
const plan = (primary: EvaluationPlan['primary'], expect: string[], window = 1): EvaluationPlan => ({ primary, expect, window });

/**
 * The rule table, in priority order (a later rule never overrides an earlier
 * one's control at the same turn; see merge()). Ids are 'ifr.<code>' or
 * 'mr.<code>' after the observation that fires them, so a trace says why.
 */
export const RULES: readonly Rule[] = [
  // ── their words ────────────────────────────────────────────────────
  // "Stop asking" first: in "stop asking me questions, just give me your
  // take" it is the stronger control on questions (hard, for the
  // conversation), and the direct request that follows sets the strategy.
  {
    id: 'ifr.explicit.stop_questions',
    family: 'ifr',
    on: ['explicit.stop_questions'],
    action: 'fewer_questions',
    target: ['acs', 'behavior'],
    may: ['questionBudget'],
    // Hard: they told it to stop. Every interrogative sentence is taken out of
    // the reply, not only a closing one (lib/mr/execute.ts gate).
    controls: () => ({ questionBudget: { max: 0, enforcement: 'hard' } }),
    // Stopping holds until they say otherwise — in this conversation, or in
    // every one when they said "from now on" and agreed to carry it.
    scope: openEnded,
    onRevoke: ['explicit.revoke', 'explicit.wants_questions', 'explicit.quiz'],
    plan: plan('friction', ['questions=0', 'no_complaint'], 2),
  },
  {
    id: 'ifr.explicit.show_steps',
    family: 'ifr',
    on: ['explicit.show_steps'],
    action: 'direct',
    target: ['acs', 'behavior'],
    may: ['strategy', 'answerFirst', 'questionBudget'],
    controls: () => ({ strategy: 'direct', answerFirst: true, questionBudget: { max: 0, enforcement: 'tail' } }),
    scope: momentary,
    // (a mention of learning — "I'm learning Spanish, what's the word for apple?" — is not taking it back)
    onRevoke: ['explicit.revoke', 'explicit.quiz', 'explicit.wants_questions'],
    plan: plan('taskCompletion', ['steps_delivered', 'questions=0']),
  },
  {
    id: 'ifr.explicit.direct_answer',
    family: 'ifr',
    on: ['explicit.direct_answer'],
    action: 'direct',
    target: ['acs', 'behavior'],
    may: ['strategy', 'answerFirst', 'questionBudget'],
    controls: () => ({ strategy: 'direct', answerFirst: true, questionBudget: { max: 0, enforcement: 'tail' } }),
    scope: momentary,
    onRevoke: ['explicit.revoke', 'explicit.quiz', 'explicit.wants_questions'],
    plan: plan('taskCompletion', ['answer_first', 'questions=0']),
    // a quiz (or "let me try it first") asked for in the same breath: MR acts on neither ("quiz me, or just tell me")
    when: (c) => !has(c, 'explicit.quiz') && !has(c, 'explicit.own_try'),
  },
  {
    id: 'mr.explicit.quiz',
    family: 'mr',
    // Only a quiz they asked for. "You can ask me questions again" is not a
    // quiz: it revokes a "stop asking", and ACS's own budget lets a question
    // back in (chooseAssist reads wantsQuestions).
    on: ['explicit.quiz'],
    action: 'preserve_challenge',
    target: ['acs', 'behavior'],
    may: ['strategy', 'noRevealAnswers', 'questionBudget'],
    // A quiz is the one place a question is the help. Kept as a quiz until they
    // end it ("that's enough for today", "let's switch") or ask for the answer.
    controls: () => ({ strategy: 'preserve_challenge', noRevealAnswers: true, questionBudget: { max: 1, enforcement: 'tail' } }),
    scope: () => ({ kind: 'conversation' }),
    onRevoke: ['explicit.direct_answer', 'explicit.show_steps', 'explicit.stop_questions', 'explicit.end_practice', 'explicit.revoke'],
    plan: plan('independentPerformance', ['asks_one', 'no_reveal'], 2),
    // a quiz and the answer asked for in one breath, neither the newer
    // (lib/mr/ifr.ts quizTakenBack): MR acts on neither, and ACS reads the message
    when: (c) => !has(c, 'explicit.direct_answer'),
  },
  {
    id: 'mr.explicit.own_try',
    family: 'mr',
    // "Let me try it first", "hints only", "don't tell me the answer": the
    // answer to THIS problem stays theirs for a turn or two. Not a quiz — no
    // question is added, and their "stop asking" stands — and not for the rest
    // of the conversation: what they ask next is asked for.
    on: ['explicit.own_try'],
    action: 'guided_discovery',
    target: ['acs', 'behavior'],
    may: ['strategy', 'noRevealAnswers'],
    controls: () => ({ strategy: 'guided', noRevealAnswers: true }),
    // until they ask for it, end it, or move on to a question about something else (lib/mr/state.ts), and a few turns at most
    scope: () => forTurns(6),
    onRevoke: ['explicit.direct_answer', 'explicit.show_steps', 'explicit.end_practice', 'explicit.revoke'],
    plan: plan('independentPerformance', ['no_reveal']),
    // "let me try it, or just tell me": MR acts on neither
    when: (c) => !has(c, 'explicit.direct_answer'),
  },
  {
    id: 'ifr.explicit.shorter',
    family: 'ifr',
    on: ['explicit.shorter'],
    action: 'shorter',
    target: ['behavior', 'orchestration'],
    may: ['verbosity'],
    controls: (c) => ({ verbosity: { ceilingTokens: Math.min(c.params.shorterCeiling, c.now?.maxReply ?? c.params.shorterCeiling) } }),
    // How Socria talks to them ("too long", "keep it short"): until they say
    // otherwise. A length asked of ONE reply ("a 100-word bio") is that reply's.
    scope: (c) =>
      c.obs.some((o) => o.code === 'explicit.shorter' && o.refs.some((r) => r.code === 'length.once')) ? { kind: 'turn' } : openEnded(c),
    onRevoke: ['explicit.longer', 'explicit.revoke'],
    plan: plan('friction', ['shorter'], 2),
  },
  {
    id: 'mr.explicit.simpler',
    family: 'mr',
    on: ['explicit.simpler'],
    action: 'simplify',
    target: ['acs', 'behavior'],
    may: ['simplify', 'scaffolding'],
    controls: () => ({ simplify: true, scaffolding: 'more' }),
    scope: (c) => forTurns(c.params.observedTurns),
    onRevoke: ['explicit.revoke', 'explicit.longer'],
    plan: plan('taskCompletion', ['simpler']),
  },
  {
    id: 'mr.explicit.verify',
    family: 'mr',
    on: ['explicit.verify'],
    action: 'verify',
    target: ['epistemic'],
    may: ['verification'],
    controls: () => ({ verification: 'explicit' }),
    scope: () => ({ kind: 'turn' }),
    onRevoke: [],
    plan: plan('taskCompletion', ['says_what_was_checked']),
  },
  {
    id: 'mr.explicit.edit_only',
    family: 'mr',
    on: ['explicit.edit_only'],
    action: 'task_specific',
    target: ['acs', 'behavior'],
    may: ['strategy', 'questionBudget'],
    // Scenario E: their essay, their level of help. Only the edits they asked
    // for — not a lesson about writing, not a rewrite.
    controls: () => ({ strategy: 'edit_as_asked', questionBudget: { max: 0, enforcement: 'tail' } }),
    scope: (c) => forTurns(c.params.observedTurns),
    // "now rewrite it", "add a conclusion": the edit-only scope is over
    onRevoke: ['explicit.revoke', 'explicit.wants_questions', 'explicit.rewrite'],
    plan: plan('taskCompletion', ['edits_only']),
  },
  // ── what the transcript shows (moderate evidence, expiring) ────────
  {
    id: 'ifr.observed.unproductive_questions',
    family: 'ifr',
    on: ['observed.unproductive_questions'],
    action: 'fewer_questions',
    target: ['acs', 'behavior'],
    may: ['questionBudget', 'questionWindow', 'answerFirst'],
    // Not only fewer questions: the useful move after questions that did not
    // help is an answer from what they HAVE said, with any assumption stated.
    controls: (c) => ({ questionBudget: { max: 0, enforcement: 'tail' }, questionWindow: { max: 1, turns: c.params.observedTurns }, answerFirst: true }),
    scope: (c) => forTurns(c.params.observedTurns),
    onRevoke: ['explicit.wants_questions', 'explicit.quiz', 'explicit.revoke'],
    plan: plan('friction', ['questions=0', 'progress'], 2),
  },
  {
    id: 'ifr.observed.repeated_confusion',
    family: 'ifr',
    on: ['observed.repeated_confusion'],
    action: 'worked_example',
    target: ['acs', 'behavior'],
    may: ['strategy', 'questionBudget', 'scaffolding', 'simplify'],
    // Scenario D: the explanation is not landing. Change the explanation — one
    // worked example, step by step — then let guided exploration resume.
    controls: () => ({ strategy: 'worked_example', scaffolding: 'more', simplify: true, questionBudget: { max: 0, enforcement: 'tail' } }),
    scope: (c) => forTurns(c.params.workedExampleTurns),
    onRevoke: ['explicit.revoke', 'explicit.quiz'],
    plan: plan('taskCompletion', ['worked_example'], 2),
  },
  {
    id: 'mr.observed.failed_attempts',
    family: 'mr',
    on: ['observed.failed_attempts'],
    action: 'worked_example',
    target: ['acs'],
    may: ['strategy', 'questionBudget', 'scaffolding'],
    // The engine refuted their attempts twice: a worked example (of an
    // analogous problem when the answer is being kept with them), then theirs.
    controls: () => ({ strategy: 'worked_example', scaffolding: 'more', questionBudget: { max: 0, enforcement: 'tail' } }),
    scope: (c) => forTurns(c.params.workedExampleTurns),
    onRevoke: ['explicit.revoke'],
    plan: plan('independentPerformance', ['worked_example'], 2),
  },
  {
    id: 'ifr.observed.repeated_request',
    family: 'ifr',
    on: ['observed.repeated_request'],
    action: 'direct',
    target: ['acs', 'behavior'],
    may: ['answerFirst', 'questionBudget'],
    // They asked for the same thing again: the last reply did not advance it.
    controls: () => ({ answerFirst: true, questionBudget: { max: 0, enforcement: 'tail' } }),
    scope: () => ({ kind: 'turn' }),
    onRevoke: ['explicit.revoke'],
    plan: plan('friction', ['answer_first', 'no_repeat_request']),
  },
  {
    id: 'ifr.observed.verbose_replies',
    family: 'ifr',
    on: ['observed.verbose_replies'],
    action: 'shorter',
    target: ['behavior', 'orchestration'],
    may: ['verbosity'],
    controls: (c) => ({ verbosity: { ceilingTokens: Math.min(c.params.shorterCeiling, c.now?.maxReply ?? c.params.shorterCeiling) } }),
    scope: (c) => forTurns(c.params.observedTurns),
    onRevoke: ['explicit.longer', 'explicit.revoke'],
    plan: plan('friction', ['shorter'], 2),
  },
  {
    id: 'ifr.observed.routine_task',
    family: 'ifr',
    on: ['observed.routine_task'],
    action: 'execute',
    target: ['acs'],
    may: ['strategy', 'questionBudget'],
    // Scenario C: a routine computation or lookup is done, not turned into an
    // exercise — but only where ACS was about to make it one (it usually is
    // not, and then this rule decides nothing).
    controls: () => ({ strategy: 'execute', questionBudget: { max: 0, enforcement: 'tail' } }),
    scope: () => ({ kind: 'turn' }),
    onRevoke: [],
    plan: plan('taskCompletion', ['executed', 'questions=0']),
    when: (c) => !!c.now && makesItAnExercise(c.now.assist),
  },
];

/** Which controls each rule may set — what the integrity monitor checks a decision against. */
export const RULE_CONTROLS: Readonly<Record<string, readonly ControlKey[]>> = Object.freeze(
  Object.fromEntries([
    ...RULES.map((r) => [r.id, r.may] as const),
    ['mr.revert', [] as ControlKey[]],
    ['none', [] as ControlKey[]],
    // the deliberative loop picks from a menu whose actions set only these (lib/mr/deliberate.ts ACTION_CONTROLS)
    ['mr.deliberate', ['strategy', 'scaffolding', 'simplify', 'questionBudget', 'answerFirst', 'verbosity'] as ControlKey[]],
  ])
);

/** ACS was about to put a routine task back to them: a question, a hint, or a challenge. */
function makesItAnExercise(a: AssistDecision): boolean {
  return a.mode === 'ask' || a.mode === 'challenge' || a.scaffold === 'hint' || (a.questions > 0 && a.mode !== 'inform' && a.mode !== 'construct');
}

// ── ids ──────────────────────────────────────────────────────────────

/** Deterministic: the same policy, conversation, turn, rule and action give the same id. */
export function interventionIdFor(policyVersion: string, conversationKey: string | null, turn: number, trigger: string, action: Action): string {
  return createHash('sha256').update(`${policyVersion}|${conversationKey ?? '-'}|${turn}|${trigger}|${action}`).digest('hex').slice(0, 20);
}

// ── the decision ─────────────────────────────────────────────────────

export interface PolicyInput {
  turn: number;
  observations: readonly Observation[];
  /** adjustments in force before this turn's decisions */
  active: readonly InterventionRecord[];
  params: Readonly<StrategyParams>;
  policyVersion: string;
  conversationKey: string | null;
  /**
   * The IFR family is ENFORCED. Its rules decide either way (the fold records
   * what they would have done, for the IFR on/off comparison); with IFR off
   * they do not take a control away from an MR rule at the same turn.
   */
  ifr: boolean;
  /** integrity freeze: observed rules may not act (their words still count) */
  frozen: boolean;
  /** standing scope may cross conversations (their consent) */
  carryAcross: boolean;
  /** the newest turn only */
  now: PolicyNow | null;
  /** the last strategy change MR made itself, for the dwell rule */
  lastMrStrategyChange: number | null;
}

export interface PolicyOutput {
  /** new decisions made at this turn (usually none) */
  decisions: MRDecision[];
  /** active interventions their words ended at this turn */
  revoked: { id: string; reason: string }[];
  /** content-free notes for the trace and state.uncertainty */
  notes: string[];
}

const STRATEGY_SETTING: ReadonlySet<ControlKey> = new Set(['strategy']);

/** A decision that keeps questions out (what "you can ask me questions again" takes back). */
export function lowersQuestions(d: MRDecision): boolean {
  return d.controls.questionBudget?.max === 0 || d.action === 'fewer_questions' || !!d.controls.questionWindow;
}

export function decide(i: PolicyInput): PolicyOutput {
  const ctx: RuleContext = {
    turn: i.turn,
    obs: i.observations,
    params: i.params,
    standing: i.observations.some((o) => o.code === 'explicit.standing'),
    bounded: i.observations.some((o) => o.code === 'explicit.standing' && o.refs.some((r) => r.code === 'horizon.conversation')),
    carryAcross: i.carryAcross,
    now: i.now,
  };
  const notes: string[] = [];
  const codes = new Set(i.observations.map((o) => o.code));

  // Their newest words end whatever they contradict. "You can ask me
  // questions again" takes back the question rules only, not a "shorter" —
  // the revocation says which (ifr.ts IFR_REF_CODES.revokeQuestions / revokeAll).
  const revoked: PolicyOutput['revoked'] = [];
  const revoke = i.observations.find((o) => o.code === 'explicit.revoke');
  const questionsOnly = !!revoke && revoke.refs.some((r) => r.code === 'revoke.questions') && !revoke.refs.some((r) => r.code === 'revoke.all');
  // A quiz and the answer asked for in one breath: MR acts on neither half, so neither half ends anything either
  // (their "stop asking" stands; a quiz running stands).
  const conflict = (codes.has('explicit.quiz') || codes.has('explicit.own_try')) && codes.has('explicit.direct_answer');
  const halves: ReadonlySet<string> = new Set(['explicit.quiz', 'explicit.direct_answer', 'explicit.wants_questions']);
  // IFR reads a request for questions after a stop as one taking it back (ifr.ts revokedByAsking): it ends the
  // stop here, but it is not their words taking a "from now on" back, so it is recorded as what they said
  const asked = !!revoke && revoke.refs.some((r) => r.code === 'explicit.wants_questions');
  for (const r of i.active) {
    const hit = r.decision.expiration.onRevoke.find((c) => codes.has(c) && !(conflict && halves.has(c)) && !(c === 'explicit.revoke' && questionsOnly && !lowersQuestions(r.decision)));
    if (hit) revoked.push({ id: r.decision.interventionId, reason: `revoke:${hit === 'explicit.revoke' && asked ? 'explicit.wants_questions' : hit}` });
  }

  const decisions: MRDecision[] = [];
  // Controls taken at this turn: by any rule (what the full condition would
  // do), and by the rules this condition enforces.
  const claimedAll = new Set<ControlKey>();
  const claimedEnforced = new Set<ControlKey>();
  for (const rule of RULES) {
    const enforced = rule.family !== 'ifr' || i.ifr;
    const claimed = enforced ? claimedEnforced : claimedAll;
    const fired = i.observations.filter((o) => rule.on.includes(o.code));
    if (!fired.length) continue;
    const explicit = fired.some((o) => o.provenance === 'explicit');
    const observedOnly = !explicit;
    // Never on weak evidence: a rule fires on explicit words or on moderate/strong observations.
    const usable = fired.filter((o) => o.provenance === 'explicit' || (o.provenance === 'observed' && o.strength !== 'weak'));
    if (!usable.length) {
      notes.push(`weak:${rule.id}`);
      continue;
    }
    if (rule.when && !rule.when(ctx)) continue;
    if (observedOnly && i.frozen) {
      notes.push(`frozen:${rule.id}`);
      continue;
    }
    const controls = rule.controls(ctx);
    // An observed rule may not move a strategy MR itself set within the dwell window.
    if (
      observedOnly &&
      controls.strategy &&
      i.lastMrStrategyChange !== null &&
      i.turn - i.lastMrStrategyChange < i.params.minDwellTurns
    ) {
      delete controls.strategy;
      notes.push(`dwell:${rule.id}`);
    }
    // A control an earlier (higher-priority) rule already set this turn is not set twice.
    for (const k of Object.keys(controls) as ControlKey[]) if (claimed.has(k)) delete (controls as Record<string, unknown>)[k];
    if (!Object.keys(controls).length) continue;
    // The same rule already in force (and not being revoked) is carried, not re-issued — unless their words repeat it.
    const already = i.active.find(
      (r) => r.decision.trigger === rule.id && !revoked.some((x) => x.id === r.decision.interventionId)
    );
    if (already && observedOnly) continue;
    for (const k of Object.keys(controls) as ControlKey[]) {
      claimedAll.add(k);
      if (enforced) claimedEnforced.add(k);
    }
    const scope = rule.scope(ctx);
    const refs: EvidenceRef[] = usable.flatMap((o) => o.refs).slice(0, 12);
    decisions.push({
      policyVersion: i.policyVersion,
      interventionId: interventionIdFor(i.policyVersion, i.conversationKey, i.turn, rule.id, rule.action),
      action: rule.action,
      trigger: rule.id,
      evidenceRefs: refs.length ? refs : usable.map((o) => ({ turn: o.turn, role: 'user' as const, code: o.code })),
      target: [...rule.target],
      controls,
      scope,
      expiration: { afterTurn: expiryOf(scope, i.turn), onRevoke: [...rule.onRevoke] },
      confidence: Math.min(...usable.map((o) => o.confidence)),
      uncertainty: observedOnly ? ['inferred_from_transcript'] : [],
      evaluationPlan: rule.plan,
      rollback: { revertTo: 'acs_default', when: ['outcome:revert', 'integrity:revert', 'integrity:freeze', ...rule.onRevoke.map((c) => `revoke:${c}`)] },
      loop: 'fast',
      issuedAtTurn: i.turn,
    });
  }

  // Their words ended something and asked for nothing new: a revert, recorded as a decision of its own.
  if (revoked.length && !decisions.length) {
    decisions.push(revertDecision(i, revoked.map((r) => r.reason)));
  }
  if (!decisions.length && i.observations.some((o) => o.strength === 'weak')) notes.push('ambiguous_signal');
  return { decisions, revoked, notes };
}

/** The last turn a scope covers. */
export function expiryOf(scope: Scope, turn: number): number | null {
  if (scope.kind === 'turn') return turn;
  if (scope.kind === 'turns') return turn + Math.max(1, scope.turns ?? 1) - 1;
  return null;
}

/** Back to how ACS would help with nothing adjusted. */
export function revertDecision(i: Pick<PolicyInput, 'policyVersion' | 'conversationKey' | 'turn'>, why: string[], loop: MRDecision['loop'] = 'fast'): MRDecision {
  return {
    policyVersion: i.policyVersion,
    interventionId: interventionIdFor(i.policyVersion, i.conversationKey, i.turn, 'mr.revert', 'revert'),
    action: 'revert',
    trigger: 'mr.revert',
    evidenceRefs: why.map((w) => ({ turn: i.turn, role: 'user' as const, code: w })),
    target: ['acs'],
    controls: {},
    scope: { kind: 'turn' },
    expiration: { afterTurn: i.turn, onRevoke: [] },
    confidence: 1,
    uncertainty: [],
    evaluationPlan: { primary: 'friction', expect: ['default_behaviour'], window: 1 },
    rollback: { revertTo: 'acs_default', when: [] },
    loop,
    issuedAtTurn: i.turn,
  };
}

/** Nothing in force. Still a decision — the ledger records no-action turns too, which is what makes a comparison possible. */
export function noneDecision(policyVersion: string, conversationKey: string | null, turn: number, why: string[] = []): MRDecision {
  return {
    policyVersion,
    interventionId: interventionIdFor(policyVersion, conversationKey, turn, 'none', 'none'),
    action: 'none',
    trigger: 'none',
    evidenceRefs: [],
    target: [],
    controls: {},
    scope: { kind: 'turn' },
    expiration: { afterTurn: turn, onRevoke: [] },
    confidence: 1,
    uncertainty: why,
    evaluationPlan: { primary: 'friction', expect: [], window: 0 },
    rollback: { revertTo: 'acs_default', when: [] },
    loop: 'fast',
    issuedAtTurn: turn,
  };
}

// ── what is in force ─────────────────────────────────────────────────

const isExplicitTrigger = (d: MRDecision) => d.trigger.includes('.explicit.');

/**
 * Several adjustments can be in force at once — "stop asking" from three
 * turns ago and "shorter" from this one. They combine into the one decision
 * the runtime enforces: the tightest question budget, the lowest ceiling, and
 * for the strategy their newest WORDS, else the newest observation.
 */
export function compose(active: readonly MRDecision[], turn: number, policyVersion: string, conversationKey: string | null): MRDecision {
  const live = active.filter((d) => d.action !== 'none' && d.action !== 'revert');
  if (!live.length) {
    const reverting = active.find((d) => d.action === 'revert' && d.issuedAtTurn === turn);
    return reverting ?? noneDecision(policyVersion, conversationKey, turn);
  }
  // carried: made at an earlier turn, or brought in from an earlier conversation
  if (live.length === 1) return { ...live[0], carried: !!live[0].carried || live[0].issuedAtTurn !== turn };
  const ordered = [...live].sort((a, b) => a.issuedAtTurn - b.issuedAtTurn);
  const newest = ordered[ordered.length - 1];
  const controls: TypedControls = {};
  for (const d of ordered) {
    const c = d.controls;
    if (c.questionBudget) {
      const cur = controls.questionBudget;
      if (!cur || c.questionBudget.max < cur.max) controls.questionBudget = { ...c.questionBudget };
      else if (c.questionBudget.max === cur.max && c.questionBudget.enforcement === 'hard') controls.questionBudget = { ...cur, enforcement: 'hard' };
    }
    if (c.questionWindow && !controls.questionWindow) controls.questionWindow = { ...c.questionWindow };
    if (c.verbosity) controls.verbosity = { ceilingTokens: Math.min(c.verbosity.ceilingTokens, controls.verbosity?.ceilingTokens ?? Infinity) };
    if (c.simplify) controls.simplify = true;
    if (c.verification) controls.verification = c.verification;
    if (c.answerFirst) controls.answerFirst = true;
    if (c.noRevealAnswers) controls.noRevealAnswers = true;
    if (c.scaffolding) controls.scaffolding = c.scaffolding;
  }
  const strategic = ordered.filter((d) => d.controls.strategy);
  // Their newest words set the strategy — except that a worked example made
  // THIS turn (the explanation failed, or the engine refuted their attempts)
  // takes the turn it was made for: it changes how a quiz or a guided problem
  // is explained for one reply, and any answer they keep stays kept
  // (noRevealAnswers, the withhold), so it does not overrule them.
  const freshExample = strategic.find((d) => d.controls.strategy === 'worked_example' && d.issuedAtTurn === turn);
  const pick = freshExample ?? [...strategic].reverse().find(isExplicitTrigger) ?? strategic[strategic.length - 1];
  if (pick?.controls.strategy) controls.strategy = pick.controls.strategy;
  // A quiz they asked for keeps its one question while it stands — over an
  // older "fewer questions" observation, and over a worked example taking a
  // turn inside it (the example, then their problem handed back as the next
  // question). Their explicit "stop asking" (hard) is never overruled: the quiz
  // rule revokes on it.
  // Only while the quiz is the move this turn (or a worked example taking one
  // turn inside it): a newer instruction of theirs that set another strategy
  // ("just fix the grammar") is not edited as a quiz — no question bumped back
  // in, no "do not reveal the answer" on an essay.
  const quizInForce = ordered.some((d) => d.controls.strategy === 'preserve_challenge' && isExplicitTrigger(d));
  const quizIsTheMove = controls.strategy === 'preserve_challenge' || (controls.strategy === 'worked_example' && freshExample !== undefined);
  if (quizInForce && quizIsTheMove && controls.questionBudget?.max === 0 && controls.questionBudget.enforcement !== 'hard') {
    controls.questionBudget = { max: 1, enforcement: 'tail' };
  }
  // "let me try it first" keeps its answer back the same way: while it is the move, or a worked example takes one turn inside it
  const ownTryInForce = ordered.some((d) => d.controls.strategy === 'guided' && d.controls.noRevealAnswers && isExplicitTrigger(d));
  const ownTryIsTheMove = ownTryInForce && (controls.strategy === 'guided' || (controls.strategy === 'worked_example' && freshExample !== undefined));
  if (controls.noRevealAnswers && !quizIsTheMove && !ownTryIsTheMove) delete controls.noRevealAnswers;
  const ids = ordered.map((d) => d.interventionId);
  return {
    ...newest,
    interventionId: createHash('sha256').update(ids.join('+')).digest('hex').slice(0, 20),
    controls,
    evidenceRefs: ordered.flatMap((d) => d.evidenceRefs).slice(-16),
    confidence: Math.min(...ordered.map((d) => d.confidence)),
    uncertainty: [...new Set(ordered.flatMap((d) => d.uncertainty))],
    target: [...new Set(ordered.flatMap((d) => d.target))],
    expiration: {
      afterTurn: ordered.every((d) => d.expiration.afterTurn !== null) ? Math.min(...ordered.map((d) => d.expiration.afterTurn as number)) : null,
      onRevoke: [...new Set(ordered.flatMap((d) => d.expiration.onRevoke))],
    },
    carried: ordered.every((d) => !!d.carried || d.issuedAtTurn !== turn),
    composedOf: ids,
  };
}

/** Strategy changes count toward oscillation; a question budget or a ceiling does not. */
export function setsStrategy(d: MRDecision): boolean {
  return Object.keys(d.controls).some((k) => STRATEGY_SETTING.has(k as ControlKey));
}

/** The family a trigger belongs to. */
export function ruleFamily(trigger: string): RuleFamily | null {
  const r = RULES.find((x) => x.id === trigger);
  return r ? r.family : null;
}
