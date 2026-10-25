// lib/mr/types.ts — THE METACOGNITIVE REGULATION CONTRACT (docs/MR.md).
//
// MR is a supervisory control plane around the Logos 5 runtime. It watches
// whether the help Socria is giving is working and, when there is evidence it
// is not, issues a TYPED, SCOPED, EXPIRING decision that the runtime enforces
// in code. Everything MR does is one of these types. Nothing in here is a
// prompt; the few lines of text a decision adds to a turn are rendered from a
// decision, never the other way round, and no model output can widen one.
//
// THREE RULES THE TYPES CARRY:
//   • Provenance on every belief. An observation is 'observed' (counted from
//     the transcript or the engine), 'explicit' (their words), an 'estimate'
//     (a computed proxy) or a 'hypothesis' (a weak reading MR may not act on).
//     A psychological state is never 'observed': "frustrated" exists only as
//     their word for it, or as a hypothesis.
//   • Content-free records. Evidence is a turn index, a role and a code —
//     never a quote — so the ledger, the headers and the research export hold
//     no words of anybody's.
//   • Unknown is a value. An outcome dimension that one conversation cannot
//     measure (retention, autonomy, most of independent performance) is
//     'unknown', not a score.
//
// Pure types. No runtime code here except constant tables.

import type { AssistDecision } from '../cognition/assist';
import type { CognitiveSplit, ExplicitSignals, ReplyLength } from '../core4/types';
import type { CoreView } from '../runtime/allocation';
import type { TurnState } from '../runtime/state';

// ── versions ─────────────────────────────────────────────────────────

/** The policy every decision is attributed to. Bump on ANY rule or threshold change (lib/mr/config.ts STRATEGIES). */
export const MR_POLICY_VERSION = 'mr-2026.10.1';
/** The shape of MRState and of a ledger record. */
export const MR_STATE_VERSION = 1;

// ── modes and conditions ─────────────────────────────────────────────

/**
 * off     MR does not run: the route is byte-for-byte what it was.
 * shadow  MR runs and decides, the decision is traced, nothing it decides
 *         reaches the reply. For measuring how often it would act.
 * on      MR runs and its decisions are enforced.
 */
export type MRMode = 'off' | 'shadow' | 'on';

/**
 * The comparison conditions of the proposal's benchmark (docs/MR.md §Causal):
 *   baseline            Logos as it is, MR off
 *   prompt_reflection   a fixed self-reflection instruction in the turn, no state, nothing enforced
 *   state_only          MR's state rendered into the turn as context, nothing enforced
 *   full                state, policy, and typed controls enforced
 * IFR is a second factor inside `full` (and only meaningful there).
 */
export const ARMS = ['baseline', 'prompt_reflection', 'state_only', 'full'] as const;
export type Arm = (typeof ARMS)[number];

export interface Condition {
  arm: Arm;
  /** Interaction Friction Regulation on (only read when arm === 'full') */
  ifr: boolean;
  /** shadow: decide and trace, enforce nothing (arm is then what WOULD have run) */
  shadow: boolean;
  /**
   * Why this condition: the deployment's switch, an experiment the person is
   * enrolled in (with consent), their own "off" in settings, or MR unavailable
   * (a settings read that failed — fail closed to baseline).
   */
  source: 'deployment' | 'experiment' | 'user_off' | 'unavailable' | 'excluded';
  experimentId?: string;
  /** an experiment's registered policy version: its arms run under exactly these rules, whatever the deployment's */
  policyVersion?: string;
}

// ── evidence ─────────────────────────────────────────────────────────

export type Provenance = 'observed' | 'explicit' | 'estimate' | 'hypothesis';
export type Strength = 'strong' | 'moderate' | 'weak';

/** A pointer into the conversation: which message, whose, and what was found there. Never its words. */
export interface EvidenceRef {
  /** user-turn index (0-based) the evidence belongs to */
  turn: number;
  role: 'user' | 'assistant';
  /** what was found, as a code (an ObservationCode, an engine verdict, a count) */
  code: string;
}

/**
 * Everything IFR and the state engine can observe. 'explicit.*' are their
 * words, read by deterministic patterns; 'observed.*' are counts over the
 * transcript and the engine's verdicts; 'weak.*' are readings that are
 * recorded and never acted on alone.
 */
export const OBSERVATION_CODES = [
  // their words
  'explicit.direct_answer', // "just tell me", "give me the answer"
  'explicit.show_steps', // "just show me the steps"
  'explicit.stop_questions', // "stop asking me questions"
  'explicit.wants_questions', // "ask me questions", "keep asking"
  'explicit.quiz', // "quiz me", "test me", "give me a practice problem"
  'explicit.own_try', // "let me try it first", "hints only", "don't tell me the answer" — this problem's answer stays theirs for a turn or two
  'explicit.shorter', // "too long", "shorter", "tl;dr"
  'explicit.longer', // "more detail", "explain more"
  'explicit.simpler', // "simpler", "explain like I'm five", "in plain English"
  'explicit.verify', // "double-check", "are you sure", "cite your sources"
  'explicit.own_work', // "it's my essay", "don't write it for me"
  'explicit.edit_only', // "just fix the grammar", "only proofread"
  'explicit.rewrite', // "rewrite it", "add a conclusion", "change my wording" — ends an edit-only scope
  'explicit.learning_goal', // "I want to learn / understand / work it out myself"
  'explicit.confused', // "I still don't get it", "that doesn't make sense"
  'explicit.revoke', // "you can ask questions again", "never mind, go back"
  'explicit.end_practice', // "that's enough for today", "let's switch" — the quiz or practice is over
  'explicit.positive', // "thanks, that helped" — satisfaction, never evidence of learning
  'explicit.negative', // "that's not helpful", "that's wrong"
  'explicit.frustration', // their word for it: "this is frustrating", "ugh", "come on"
  'explicit.standing', // "from now on", "always" — the preference this turn is standing
  // counted from the transcript and the engine
  'observed.question_streak', // Socria's last replies kept asking
  'observed.unproductive_questions', // asked, and their next turn did not advance (no attempt, "idk", repeat)
  'observed.repeated_confusion', // confusion after an explanation, twice or more
  'observed.failed_attempts', // engine-refuted attempts, repeatedly
  'observed.repeated_request', // they asked for the same thing again
  'observed.verbose_replies', // replies far longer than their messages and their length setting
  'observed.routine_task', // a computation, lookup or execution with nothing to learn in it
  'observed.writing_task', // their own writing is on the table
  'observed.practice', // they are practising (a stated goal or a quiz under way)
  'observed.verified_correct', // the engine verified their attempt
  'observed.verified_incorrect', // the engine refuted their attempt
  // weak: recorded, never sufficient
  'weak.short_reply', // "ok", "k", "sure", "hm"
  'weak.terse_run', // several very short replies in a row
] as const;
export type ObservationCode = (typeof OBSERVATION_CODES)[number];

export interface Observation {
  code: ObservationCode;
  provenance: Provenance;
  strength: Strength;
  /** user-turn index it was observed at */
  turn: number;
  refs: EvidenceRef[];
  /** 0..1, how sure the reader is that the pattern means what its code says */
  confidence: number;
  /** their words made it standing ("from now on"), or it is a standing kind (stop asking) */
  standing?: boolean;
}

// ── decisions ────────────────────────────────────────────────────────

/** The proposal's intervention vocabulary, plus `preserve_challenge` (scenario B) and `execute` (scenario C). */
export const ACTIONS = [
  'none',
  'direct', // more direct explanation; answer first
  'fewer_questions',
  'guided_discovery',
  'worked_example',
  'more_scaffolding',
  'less_scaffolding',
  'simplify',
  'verify', // explicit verification
  'shorter', // reduced verbosity
  'task_specific', // e.g. edit only what was asked in their writing
  'preserve_challenge', // a quiz: keep the difficulty, never reveal
  'execute', // a routine task: just do it
  'revert', // back to the default behaviour
] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * THE CONTROLS THE RUNTIME ENFORCES. Each says how it is enforced:
 *   hard    in code, after generation or as a ceiling the model cannot pass
 *   tail    the stream gate's tail-only question cap (a question followed by
 *           exposition can still ship — lib/core4/stream-gate.ts)
 *   prompt  an instruction in the turn; the model may not comply, and
 *           compliance is measured afterwards (lib/mr/outcome.ts)
 */
export interface TypedControls {
  /** questions the reply may put to them. 'hard' drops every interrogative sentence; 'tail' is the gate's cap. */
  questionBudget?: { max: 0 | 1; enforcement: 'hard' | 'tail' };
  /** at most `max` asking replies in the last `turns` replies (spent → budget 0 this turn) */
  questionWindow?: { max: number; turns: number };
  /** how the turn's help is composed — maps onto the ACS move (enforcement: prompt + the move's own budget) */
  strategy?: 'direct' | 'execute' | 'worked_example' | 'guided' | 'preserve_challenge' | 'edit_as_asked';
  scaffolding?: 'less' | 'more';
  simplify?: boolean;
  /** a hard ceiling on the reply's tokens (max_tokens), never above the route's own */
  verbosity?: { ceilingTokens: number };
  /** say what was checked and what was not; the engine's held path where it is maths */
  verification?: 'explicit';
  /** lead with the thing they asked for */
  answerFirst?: boolean;
  /** a quiz or practice: never give the answer away, keep one question allowed */
  noRevealAnswers?: boolean;
}

export type ControlKey = keyof TypedControls;

/** Which runtime component a decision regulates. */
export type Target = 'acs' | 'behavior' | 'epistemic' | 'orchestration';

export interface Scope {
  /** turn: this reply only; turns: the next `turns` replies; conversation: until revoked here; standing: across conversations (consent only) */
  kind: 'turn' | 'turns' | 'conversation' | 'standing';
  turns?: number;
}

export interface Expiration {
  /** the last user-turn index it applies to; null = until revoked */
  afterTurn: number | null;
  /** codes that end it early when observed */
  onRevoke: ObservationCode[];
}

export interface EvaluationPlan {
  /** the outcome dimension the decision is meant to move (an OutcomeDimension) */
  primary: OutcomeDimension;
  /** content-free expectations, e.g. 'questions=0', 'steps_delivered', 'no_repeat_request' */
  expect: string[];
  /** how many following user turns to judge it on */
  window: number;
}

export interface Rollback {
  revertTo: 'acs_default';
  /** codes that revert it: an outcome or integrity finding */
  when: string[];
}

export interface MRDecision {
  policyVersion: string;
  /** deterministic: the same conversation, turn, policy and action give the same id */
  interventionId: string;
  action: Action;
  /** the rule that fired (a RuleId), or 'none' */
  trigger: string;
  evidenceRefs: EvidenceRef[];
  target: Target[];
  controls: TypedControls;
  scope: Scope;
  expiration: Expiration;
  /** 0..1 — the weakest evidence it rests on */
  confidence: number;
  /** what MR does not know that bears on the decision, as codes */
  uncertainty: string[];
  evaluationPlan: EvaluationPlan;
  rollback: Rollback;
  loop: 'fast' | 'deliberative' | 'longitudinal';
  /** user-turn index the decision was made at */
  issuedAtTurn: number;
  /** a decision carried from an earlier turn (still in force), not made now */
  carried?: boolean;
  /** what a higher layer took out of the decision, as `layer:control` codes */
  constrainedBy?: string[];
  /** a decision in force composed of several active ones: their interventionIds, newest last */
  composedOf?: string[];
}

export type InterventionStatus = 'active' | 'expired' | 'revoked' | 'rolled_back' | 'superseded';

export interface InterventionRecord {
  decision: MRDecision;
  status: InterventionStatus;
  endedAtTurn?: number;
  /** why it ended, as a code */
  endReason?: string;
}

// ── outcomes ─────────────────────────────────────────────────────────

/** The six dimensions the proposal separates. They are never summed into one score. */
export const OUTCOME_DIMENSIONS = ['taskCompletion', 'satisfaction', 'friction', 'independentPerformance', 'retention', 'autonomy'] as const;
export type OutcomeDimension = (typeof OUTCOME_DIMENSIONS)[number];

export interface Dimension<T> {
  value: T | 'unknown';
  provenance: Provenance | 'none';
  refs: EvidenceRef[];
  /** why unknown, or what the value does not show, as a code */
  note?: string;
}

export interface FrictionReading {
  /** asking sentences in the reply(ies) judged */
  questionsAsked: number;
  /** they asked for the same thing again */
  repeatRequests: number;
  /** their own words of complaint (shorter, stop asking, frustrated) */
  complaints: number;
  /** replies before the thing they asked for was delivered; null when nothing was asked for */
  turnsToUseful: number | null;
}

export interface OutcomeVector {
  interventionId: string;
  /** user-turn index the outcome was read at */
  turn: number;
  taskCompletion: Dimension<'delivered' | 'partial' | 'not_delivered'>;
  /** their stated reaction. NOT evidence of learning (proxy gaming guard). */
  satisfaction: Dimension<'positive' | 'negative' | 'neutral'>;
  friction: Dimension<FrictionReading>;
  /** an attempt of theirs, made without the answer in between, decided by the engine — a single observation */
  independentPerformance: Dimension<'verified_correct' | 'verified_incorrect'>;
  /** needs a delayed, independent check across sessions: unknown inside a conversation */
  retention: Dimension<'retained' | 'not_retained'>;
  /** needs a study instrument: unknown in the product */
  autonomy: Dimension<'increased' | 'decreased'>;
  /**
   * For REGULATION only — whether to keep, expire or revert the decision.
   * Never reported as a claim that the person improved.
   */
  regulation: 'keep' | 'revert' | 'inconclusive';
}

// ── state ────────────────────────────────────────────────────────────

export interface Fact<T = string> {
  key: string;
  value: T;
  provenance: Provenance;
  turn: number;
  refs: EvidenceRef[];
  confidence: number;
  /** last turn it holds for; null = until revoked */
  expiresAfterTurn: number | null;
}

export const INTEGRITY_CODES = [
  'unsupported_claim', // the reply claimed they improved / mastered something with no evidence
  'proxy_gaming', // a success read from satisfaction or friction alone
  'excessive_intervention', // MR acting on too many turns
  'oscillation', // strategy flipping back and forth
  'goal_drift', // MR's strategy contradicts their stated goal or instruction
  'privacy_boundary', // a write or read across a boundary it may not cross
  'latency_budget', // MR's own time over budget
  'cost_budget', // model-assisted deliberation over its call budget
  'task_regression', // an MR turn that failed to deliver what was asked
  'unauthorized_policy', // a decision from an unknown policy or outside its rule's controls
  'contract_invalid', // a decision missing evidence, expiry or rollback
  'control_violation', // the reply broke a control that is only prompt- or tail-enforced (measured after it was sent)
] as const;
export type IntegrityCode = (typeof INTEGRITY_CODES)[number];

export interface IntegrityFinding {
  code: IntegrityCode;
  severity: 'info' | 'warn' | 'block';
  turn: number;
  /** a short code-level detail — never content */
  detail: string;
  /** what was done about it */
  action: 'none' | 'freeze' | 'revert' | 'drop_sentence' | 'block_write' | 'reject_decision';
}

export interface StrategyState {
  current: NonNullable<TypedControls['strategy']> | 'default';
  /** user-turn index it took effect */
  since: number;
  source: 'default' | 'mr' | 'user';
  /** strategy changes in the recent window, oldest first: [turn, strategy] */
  changes: [number, string][];
}

export interface MRState {
  version: typeof MR_STATE_VERSION;
  policyVersion: string;
  /** cleanId(conversation id) — never shown to anybody */
  conversationKey: string | null;
  /** the newest user-turn index */
  turn: number;
  /** what they are trying to do: the runtime's objective is an estimate; a goal they stated is explicit */
  goals: Fact[];
  /** how they asked to be helped — explicit only; a preference is never inferred */
  preferences: Fact[];
  strategy: StrategyState;
  observations: Observation[];
  /** what MR does not know, as codes (goal_unstated, no_outcome_signal, ...) */
  uncertainty: string[];
  interventions: InterventionRecord[];
  outcomes: OutcomeVector[];
  /** integrity freeze: MR takes no new action until after this turn */
  frozenUntilTurn: number | null;
  integrity: IntegrityFinding[];
  /** the first user turn after their last reset, in this conversation (MRTurnInput.resetTurn), when there was one */
  resetTurn?: number;
}

// ── the fast loop's input and output ─────────────────────────────────

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** What the route already has when MR runs. Nothing here costs a model call. */
export interface MRTurnInput {
  /** cleanId(sessionId); null for a turn with no conversation id */
  conversationKey: string | null;
  /** the whole conversation as the client sent it, oldest first, ending with their newest message */
  messages: readonly TranscriptMessage[];
  /** readSignals on their newest message */
  signals: ExplicitSignals;
  /** what ACS (Cognitive Allocation) decided, before MR */
  acs: { assist: AssistDecision; core: CoreView | null; split: CognitiveSplit | null };
  turnState: Pick<TurnState, 'work' | 'domain' | 'intent' | 'exchange' | 'preferences' | 'objective' | 'understanding'>;
  context: {
    /** the Answer Guard is up (an application policy MR may not loosen) */
    guard: boolean;
    /** their length setting (a user instruction MR may not lengthen past) */
    length: ReplyLength | null;
    /** the route's own reply ceiling, before MR */
    maxReply: number;
    /** more than one person, or a shared line of thinking: MR keeps no per-person state */
    shared: boolean;
    /** the engine's plan this turn */
    accuracy: { check: boolean; computed: boolean; math: boolean; theirs: { status: string }[] };
    /** their attempts at earlier turns as the engine decided them, by user-turn index (optional; the replay's) */
    verdicts?: Record<number, { status: string }[]>;
  };
  condition: Condition;
  /** standing preferences carried across conversations — only with their consent (lib/mr/adaptation.ts) */
  carried?: Fact[];
  /**
   * This conversation's earlier exposure rows, as (turn, ids carried in at
   * that turn) — lib/mr/ledger.ts carriedInOf. A carried preference holds here
   * from the first turn it was carried in, so words said here before it
   * existed ("feel free to ask me questions", then elsewhere "from now on,
   * stop asking") never end it, and words said since ("quiz me") end it here
   * for good. Absent (nothing recorded here): from the newest turn.
   */
  carriedIn?: { turn: number; ids: string[] }[];
  /**
   * The first user-turn index of this conversation after they last reset MR
   * (lib/mr/ledger.ts resetTurnOf), or null. Adjustments MR made on its own
   * before it end there; what they asked for in their own words still holds
   * in this conversation.
   */
  resetTurn?: number | null;
  /** env for switches, injectable for tests */
  env?: Record<string, string | undefined>;
  /** clock for budgets; injectable for tests */
  now?: () => number;
}

export interface GateControls {
  /** drop every interrogative sentence (an explicit, standing "stop asking") */
  hardNoQuestions: boolean;
  /** drop sentences that claim the person improved without evidence */
  dropUnsupportedClaims: boolean;
  /**
   * drop a check-in or offer ("Does that make sense?", "Want me to go on?")
   * ANYWHERE in the reply, not only at its close — when the decision in force
   * took questions away. Explicit questions still follow the tail budget.
   */
  dropCheckIns?: boolean;
}

export interface MRTurnResult {
  condition: Condition;
  state: MRState;
  /** the decision in force this turn (a 'none' decision when nothing is) */
  decision: MRDecision;
  /** ACS's move after MR (identical to the input when nothing is enforced) */
  assist: AssistDecision;
  /** text for the turn's context block ('' when nothing is said) */
  block: string;
  /** a lower max_tokens, or null */
  ceiling: number | null;
  gate: GateControls;
  /** content-free trace for the X-Socria-MR header and the [mr] log line */
  trace: string;
  integrity: IntegrityFinding[];
  /**
   * MR's own cost this turn. deliberated: the deliberative loop ran (its
   * deterministic path included). modelDeliberated: a model was actually
   * asked — the only thing the per-conversation deliberation budget counts.
   */
  timing: { ms: number; deliberated: boolean; modelDeliberated?: boolean; modelDeliberations?: number };
}

// ── precedence ───────────────────────────────────────────────────────

/**
 * Top wins. MR is last: it acts only inside the room every layer above leaves
 * it, and a higher layer's constraint is recorded on the decision
 * (MRDecision.constrainedBy) rather than silently ignored.
 *
 *   safety            signals.safety, the 'safety' reason: nothing changes it
 *   user_instruction  their words in this conversation, their length setting,
 *                     their MR switch, consent and privacy choices
 *   app_policy        the Answer Guard, a Core 4 withhold (resting on their own
 *                     quoted words or their Project), graded-work integrity,
 *                     plan limits, tool permissions
 *   acs               Cognitive Allocation: chooseAssist + reconcile
 *   mr                this module
 */
export const PRECEDENCE = ['safety', 'user_instruction', 'app_policy', 'acs', 'mr'] as const;
export type Layer = (typeof PRECEDENCE)[number];

// ── settings and consent ─────────────────────────────────────────────

/**
 * The person's own MR settings (user_profiles.mr). Defaults are the most
 * private ones that still let MR help inside a conversation.
 */
export interface MRSettings {
  version: 1;
  /** MR may regulate how Socria helps them. Their "off" is a user instruction: it wins over any arm. */
  enabled: boolean;
  /**
   * Consent to carry STANDING preferences they stated ("from now on, no
   * questions") into later conversations. Off by default: without it nothing
   * MR learned in one conversation reaches another.
   */
  carryAcross: boolean;
  /**
   * Research participation, set only by an approved study's consent flow
   * (never by a product default, never by MR). Null = not a participant.
   */
  research: { studyId: string; consentedAt: number } | null;
  /** the last time they reset MR: nothing recorded before it is read */
  resetAt: number | null;
  /**
   * The "from now on" preferences their words took back, by rule and time
   * (newest per rule). Kept here, not only on the ledger row of the turn
   * they said it, so deleting that conversation does not bring the
   * preference back everywhere. Written by the server only; absent when
   * there are none.
   */
  revokedStanding?: { trigger: string; at: number }[];
  /**
   * Conversations whose MR rows were just deleted, as a hash of the key and
   * the time, kept for a day: a turn of that conversation still in flight
   * writes its rows after the delete, and these are how it knows not to.
   * Written by the server only; absent when there are none.
   */
  forgotten?: { conversation: string; at: number }[];
}

export const DEFAULT_MR_SETTINGS: MRSettings = Object.freeze({
  version: 1,
  enabled: true,
  carryAcross: false,
  research: null,
  resetAt: null,
}) as MRSettings;

// ── the ledger ───────────────────────────────────────────────────────

/**
 * One row of the intervention ledger (table mr_ledger). Append-only and
 * CONTENT-FREE: codes, counts, turn indices — never a word anybody wrote.
 *
 *   exposure   the condition this turn ran under (arm, ifr, shadow, source)
 *   decision   a decision made or carried this turn (MRDecision, minus nothing — it holds no text)
 *   outcome    an OutcomeVector read for an earlier decision
 *   integrity  an IntegrityFinding
 */
export type LedgerKind = 'exposure' | 'decision' | 'outcome' | 'integrity';

export interface LedgerRow {
  user_id: string;
  /** deterministic: `${kind}:${conversationKey}:${turn}:${interventionId|code}` hashed */
  id: string;
  conversation_id: string | null;
  turn: number;
  kind: LedgerKind;
  policy_version: string;
  arm: Arm;
  /** the record: ExposureRecord | MRDecision | OutcomeVector | IntegrityFinding, all content-free */
  record: Record<string, unknown>;
  /** epoch ms */
  created_at: number;
}

export interface ExposureRecord {
  v: typeof MR_STATE_VERSION;
  arm: Arm;
  ifr: boolean;
  shadow: boolean;
  source: Condition['source'];
  experimentId?: string;
  /** MR's own time this turn, ms (rounded) */
  ms: number;
  /** the turn ran in a conversation kept to itself: nothing from it crosses into another */
  local?: boolean;
}
