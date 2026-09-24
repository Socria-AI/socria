// lib/core4/types.ts
//
// The structured state Core 4 reasons over, in one place.
//
// Core 4's loop is UNDERSTAND → ALLOCATE → INTERVENE → MEASURE → LEARN. Each
// stage owns one of the shapes below, and each shape is small on purpose: it
// is rebuilt or merged every turn, persisted, shown to the person where it is
// about them, and read by deterministic code. A field that nothing reads is a
// field that should not exist.
//
// Pure types and constants. No runtime dependencies.

// ── provenance of anything Socria believes about the person ──────────

/**
 * Where a belief about the person came from.
 *
 *   explicit  they said it ("I'm learning this", "just give me the answer")
 *   observed  they did it in this conversation (a correct attempt, a question)
 *   inferred  a model read it between the lines
 *   default   nobody knows; the value is the cautious default
 *
 * The distinction is load-bearing: explicit beats inferred in every decision,
 * inferred values below a confidence floor are treated as unknown, and only
 * explicit and observed values may be shown back to the person as facts.
 */
export type FieldSource = 'explicit' | 'observed' | 'inferred' | 'default';

export interface Inferred<T> {
  value: T;
  source: FieldSource;
  /** 0..1 — for explicit values, 1 */
  confidence: number;
  /** the words or the behaviour it rests on, short, for the rationale and for correction */
  evidence?: string;
  /** the turn it was set on, for values that fade */
  since?: number;
}

/** Below this an inferred value is not allowed to change behaviour. */
export const INFERENCE_FLOOR = 0.6;

// ── UNDERSTAND: explicit signals ─────────────────────────────────────

/** What the person asked for, in so many words, about how directly to help. */
export const DIRECTNESS = ['answer', 'guidance', 'no_answer', 'none'] as const;
export type Directness = (typeof DIRECTNESS)[number];

export interface ExplicitSignals {
  /** "just tell me" → answer; "hints only" → guidance; "don't tell me" → no_answer */
  directness: Directness;
  /** they said they are learning / practising this (true) or explicitly not (false) */
  learningGoal: boolean | null;
  /** they said what they are: a novice, or an expert in this */
  expertise: 'novice' | 'expert' | null;
  /** graded work, an exam, something they will submit as their own */
  assessment: boolean;
  /** "I already said that", "I know", "I've considered that" */
  redundancy: boolean;
  /** "I've been stuck for an hour", "this isn't helping" */
  frustration: boolean;
  /** "stop asking me questions" */
  stopQuestions: boolean;
  /** "quiz me", "ask me questions", "test me on this" — questions are what they want */
  wantsQuestions: boolean;
  /** "that's not what I meant", "I never said that" */
  correction: boolean;
  /** "that helped" / "not useful" */
  feedback: 'positive' | 'negative' | null;
  /**
   * STRONG practice intent — the only learning evidence that can back a
   * practice_goal withhold (council D2): "I want to work it out myself",
   * "let me try it first", "I need to be able to do these cold". "I'm
   * studying X" or "help me understand" is context, not intent (learningGoal).
   */
  practiceIntent: boolean;
  /** an emergency or safety-relevant harm now: overrides every contract (council D1 safety gate) */
  safety: boolean;
  /** "what would you do", "which should I pick", "your pick" */
  recommendationRequested: boolean;
  /** "idk", "no idea", "I don't know" — anchored at the start of a short message */
  dontKnow: boolean;
  /** "you gave it away", "I wanted to figure that out", "spoiler" */
  tooDirect: boolean;
  /** "off the record", "don't remember this" */
  offRecord: boolean;
  /** "you can remember this (again)", "back on the record" */
  onRecord: boolean;
  /**
   * "only tell me if I've gone off the rails", "do NOT tell me what's wrong,
   * finding it is the point": a verdict only — not where, not what kind
   * (council D2 feedbackPreference = flag_only). Implies a refusal of the fix.
   */
  flagOnly: boolean;
  /** "answers only, no explanations", "just the command": the answer and nothing around it (run 5, adversarial-005) */
  answersOnly: boolean;
  /** "why", "explain", "walk me through": this turn they want the reasoning, whatever they said before */
  explainAsked: boolean;
  /** "from now on", "always", "in general", "stop being Socratic": makes a loosening directness STANDING (council D2) */
  horizon: boolean;
  /** "got it, thanks" with nothing new: a short close (council D5 DONE) */
  done: boolean;
  /** a requested length in tokens ("in 300 words" ≈ 420; "the full file" = 3000), or 0 (council D17) */
  requestedTokens: number;
  /** "in one sentence", "two sentences": an exact sentence count, or 0 (run 6: expert-004, expert-009) */
  sentences: number;
  /** "I just need to vent", "I don't want advice", "just listen": being heard, said explicitly (run 1: an INFERRED "reflection" withheld practical help) */
  vent: boolean;
  /** "let's stop there", "that's enough for today": ends a quiz without being frustration */
  endQuiz: boolean;
  /** "I was computing the wrong thing", "scratch that", "I've changed my mind": they withdraw what they just held */
  revision: boolean;
  /** a sensitive subject (health, grief, divorce, immigration, debt, …): council D14 */
  sensitive: boolean;
  /** the request is FOR questions (quiz items, interview questions, practice problems): they are content, not interrogation */
  requestsQuestions: boolean;
  /** "you do it", "write it for me" */
  delegate: boolean;
  /** "don't rewrite it", "I want to write it myself", "don't tell me what to conclude" */
  ownWork: boolean;
  /** real time pressure stated in words: "prod is down", "due in an hour" */
  urgent: boolean;
  /** the phrases that matched, for the rationale */
  evidence: string[];
}

// ── UNDERSTAND: the kind of cognitive work in THIS request ───────────

/**
 * The cognitive operation the latest request involves. Not the kind of
 * conversation (taskKind) — the thing being asked for right now. A learner
 * can ask a plain factual question; an expert can ask to be checked.
 */
export const WORK_KINDS = [
  'information',   // a fact, a definition, what something means
  'execution',     // do this: compute, convert, write the code, run it
  'explanation',   // how/why does this work
  'practice',      // they are producing it themselves as the point
  'verification',  // check my work / is this right
  'diagnosis',     // why is this broken / what is wrong
  'judgment',      // weigh this, decide
  'creation',      // make this (theirs or shared)
  'research',      // find out, gather evidence
  'reflection',    // think out loud / be heard
  'conversation',  // acknowledgement, small talk, reaction
] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

export const STUCK = ['no', 'stalled', 'looping', 'frustrated'] as const;
export type Stuck = (typeof STUCK)[number];

// ── MEASURE/LEARN: how an intervention landed ────────────────────────

export const OUTCOME_LABELS = [
  'HELPED',
  'PARTIALLY_HELPED',
  'WAS_REDUNDANT',
  'CONFUSED_USER',
  'FRUSTRATED_USER',
  'WAS_TOO_DIRECT',
  'WAS_TOO_INDIRECT',
  'UNLOCKED_PROGRESS',
  'REVEALED_MASTERY',
  'REVEALED_MISUNDERSTANDING',
  'UNKNOWN',
] as const;
export type OutcomeLabel = (typeof OUTCOME_LABELS)[number];

/** Outcomes that say the last move was too much friction. */
export const FRICTION_OUTCOMES = new Set<OutcomeLabel>(['WAS_REDUNDANT', 'FRUSTRATED_USER', 'WAS_TOO_INDIRECT']);

export interface OutcomeReading {
  label: OutcomeLabel;
  confidence: number;
  /** explicit (they said so) beats inferred (the reader's judgement) */
  source: 'explicit' | 'inferred';
  evidence?: string;
}

// ── ALLOCATE ─────────────────────────────────────────────────────────

export const ALLOCATION_MODES = [
  'AI_EXECUTES',      // Socria does it: mechanical, informational, or delegated
  'AI_EXPLAINS',      // Socria gives the understanding, not only the result
  'AI_ASSISTS',       // Socria does most, the person steers
  'AI_VERIFIES',      // the person did it; Socria checks it
  'SHARED_REASONING', // both think; Socria contributes what they have not
  'HUMAN_LEADS',      // their judgement or authorship; Socria informs, critiques
  'HUMAN_PRACTICES',  // producing it is the point; Socria scaffolds
  'HUMAN_REFLECTS',   // they want to be heard; Socria gets out of the way
] as const;
export type AllocationMode = (typeof ALLOCATION_MODES)[number];

/** The ONLY reasons Socria may deliberately keep something back. */
export const WITHHOLD_REASONS = [
  'practice_goal',        // they are deliberately learning/practising this
  'requested_no_answer',  // they asked not to be told
  'authorship',           // the product must be theirs (their essay, their decision)
  'assessment_integrity', // graded work they will submit as their own
  'agency_boundary',      // a standing instruction (Project) says so
] as const;
export type WithholdReason = (typeof WITHHOLD_REASONS)[number];

export interface Allocation {
  mode: AllocationMode;
  /** the cognitive work that stays with the person this turn */
  humanWork: string[];
  /** the cognitive work Socria performs this turn */
  aiWork: string[];
  /**
   * What stays with the person, and why. Only ever set on an EXPLICIT source —
   * their words now, their words earlier in this conversation, or their
   * Project's standing instructions. An inference never withholds.
   */
  withhold: {
    what: string;
    reason: WithholdReason;
    evidence: string;
    source: 'message' | 'conversation' | 'project';
    /** their words the withhold rests on — required (council D6) */
    quote: string;
    /** what they can have instead, and how to get the rest — required, non-empty (council D6) */
    alternative: string;
  } | null;
  /** first time something is held back in this conversation: say so, and how to get it */
  announce: boolean;
  /** machine-readable */
  reasonCode: string;
  /** one line a person could read */
  rationale: string;
  confidence: number;
}

// ── INTERVENE ────────────────────────────────────────────────────────

export const INTERVENTIONS_V2 = [
  'ANSWER',             // give the answer / the fix / the result
  'EXPLAIN',            // give the understanding
  'CORRECT',            // say what is wrong and what is right
  'VERIFY',             // check their work; verdict and where
  'CRITIQUE',           // specific, useful critique of their work or argument
  'CHALLENGE',          // press on a specific weakness worth pressing
  'CONTRIBUTE',         // the thing they have not considered
  'CONNECT',            // relate this to something they already hold
  'SYNTHESIZE',         // pull their material into one shape
  'QUESTION',           // one question, earned
  'CLARIFY',            // resolve an ambiguity that blocks progress
  'HINT',               // the smallest nudge (practice only)
  'EXECUTE',            // do the mechanical work
  'CALCULATE',          // compute exactly (verified arithmetic)
  'RETRIEVE',           // bring back what was said/decided before
  'REFLECT',            // say back, precisely; acknowledge
  'GET_OUT_OF_THE_WAY', // a brief acknowledgement; let them carry on
  // RESEARCH, MODEL and VISUALIZE were removed (council D7): there are no
  // tools in this path, and a move nothing can perform is dead code. Their
  // privacy contract, for when tools exist, is in tools-contract.ts.
] as const;
export type InterventionType = (typeof INTERVENTIONS_V2)[number];

/** Interventions the engine may choose today. */
export const SELECTABLE = new Set<InterventionType>(INTERVENTIONS_V2);

export interface QuestionBudget {
  /** Socria's most recent replies in a row that put interrogative work to the person */
  streak: number;
  /** share of the last few Socria replies that did */
  density: number;
  /** questions the reply may contain this turn */
  allowed: 0 | 1;
  reasons: string[];
}

export interface Diminishing {
  detected: boolean;
  signals: string[];
  /** the strategy family that stopped paying */
  from: string | null;
}

/**
 * minimal — short by nature, or a length they asked for.
 * normal  — the prompt's default: the least language the move needs.
 * complete — cover every non-obvious consideration that would change what
 *            they do or conclude, each once, as tightly as it can be said.
 */
export type Coverage = 'minimal' | 'normal' | 'complete';

/**
 * brief  — they said something short and open; the shortest useful reply wins.
 * normal — they gave enough to work with; length follows the move.
 */
export type Proportion = 'brief' | 'normal';

/**
 * WHAT THE PERSON CONTROLS, and what they deliberately do not.
 *
 * Core 3.1 had a thinking-depth dial: the user chose how hard the system
 * worked. Core 4 removed it, because the per-turn decision already answers
 * that question from evidence and a dial set in advance is a second,
 * contradictory instruction about the same thing.
 *
 * These two replace it, and they control COMMUNICATION rather than cognition.
 * Nothing here reaches the allocator, the move, verification, the measuring
 * stages or the question budget — Simple must never mean a worse answer, only
 * a more readable one. That separation is the whole point of the setting, and
 * it is enforced structurally: `readability` is consumed only by the register
 * and `length` only by the proportion, and neither of those decides what work
 * gets done.
 *
 * They are PREFERENCES, not templates: automatic adaptation stays the default
 * and these bias it. Someone who set Concise and then asks for the full
 * derivation gets the full derivation.
 */
export type Readability = 'simple' | 'standard' | 'advanced';
export type ReplyLength = 'concise' | 'standard' | 'detailed';

export interface CommunicationPrefs {
  readability: Readability;
  length: ReplyLength;
}

export const DEFAULT_COMMUNICATION: CommunicationPrefs = { readability: 'standard', length: 'standard' };

export interface InterventionDecision {
  type: InterventionType;
  reasonCode: string;
  reason: string;
  intendedOutcome: string;
  humanWorkPreserved: string | null;
  aiWorkPerformed: string;
  confidence: number;
  guardRequired: boolean;
  /**
   * Questions the reply may put to the person (0 or 1).
   *
   * WHERE IT IS A HARD CAP AND WHERE IT IS NOT. On a buffered turn (anything
   * withheld) the guard reads the whole draft and the cap holds absolutely.
   * On a STREAMED turn the sentence gate can only drop what it is still
   * holding when the stream ends, so the cap binds the TAIL: a question
   * followed by more exposition is released in order and ships, because
   * council D4 ruled that nothing is cut from the middle of a reply — an
   * excision mid-stream produces text that does not read. So `maxQuestions:
   * 0` on a streamed turn means "will not END on a question, an offer or a
   * comprehension check", not "contains no question mark".
   *
   * In practice the model complies with the instruction and the measured rate
   * is 0.00 questions per reply across runs 4-9 (the baseline arm runs 0.05),
   * so the gap has never been observed to matter. It is written down because
   * the field name promises more than the streamed path can deliver, and a
   * later reader should not assume a guarantee that is only a tail guarantee.
   */
  maxQuestions: 0 | 1;
  /** what the model is asked to achieve, rendered into the move block */
  objective: string;
  /** considered items the reply must not re-raise as new */
  avoid: string[];
  /** set when diminishing returns forced a change of strategy */
  switchedFrom: string | null;
  /** generation budget for this move */
  maxTokens: number;
  /**
   * How much of what matters this reply should cover.
   *
   * WHY THIS IS A FIELD AND NOT A SENTENCE IN THE PROMPT. The Core 4 prompt
   * already carries the rule — "a consequential decision or an expert's
   * analysis is the exception: there, completeness on what matters beats
   * brevity" — and it sat next to a nearer, more concrete default ("1–3 short
   * paragraphs"). Run 8 measured which one wins: Core 4 replied in 280 words
   * where the prompt-only baseline used 425, lost 6 of 8 scenarios, and every
   * loss was written up as the baseline carrying more substance. Meanwhile the
   * trace for those same turns says `stakes: high, expertise: expert`. The
   * system knew; nothing carried the knowledge to the length policy.
   *
   * So coverage is computed where the evidence lives and rendered inside the
   * move block, which the prompt's Precedence section says outranks the
   * general guidance. It is not permission to pad: it fires only on high
   * stakes AND demonstrated expertise, only on moves that carry substance,
   * and never when something is being held back — "cover everything" beside
   * "keep this from them" is a contradiction that invites a leak.
   */
  coverage: Coverage;
  /**
   * How much the person actually put on the table this turn.
   *
   * THE MIRROR OF `coverage`, AND THE MORE COMMON CASE. Coverage raises the
   * ceiling when high stakes and demonstrated expertise earn it. This lowers
   * it when the turn did not: "I'm worried about whether I'm doing enough for
   * McCombs" was reaching CONTRIBUTE at maxTokens 1200 — the same ceiling as a
   * full analytical answer — with an objective asking for "the overlooked
   * assumption, the missing variable, the stronger counterargument". A person
   * saying they are worried gets a paragraph of reassurance and generic advice,
   * which is what a chatbot does and not what a person does.
   *
   * Length is NOT the signal, and this is the trap the obvious fix falls into:
   * the worry above is ten words and "Here are my churn numbers and the raise
   * timing, what breaks?" is eleven. The signal is what they gave you to work
   * WITH — concrete material, and whether they posed something answerable.
   */
  proportion: Proportion;
  /** the person asked FOR questions (a quiz, interview questions): they are content, not interrogation */
  questionsAreContent: boolean;
  /**
   * Is the move IMPOSED? Only on explicit or verified evidence (council D1;
   * run 1): a withhold, the person's own request, a contract, safety, a
   * computed or checked verdict. Otherwise the model receives constraints
   * (budget, what is already raised, what they established) and chooses the
   * move itself — a cheap reader's guess must not narrow a stronger model.
   */
  forced: boolean;
}

// ── the already-considered record & the reasoning ledger ─────────────

export const LEDGER_KINDS = [
  'claim', 'assumption', 'evidence', 'question', 'hypothesis',
  'alternative', 'objection', 'decision', 'uncertainty', 'conclusion',
  // council D10
  'constraint', 'option',
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_RELATIONS = [
  'supports', 'contradicts', 'depends_on', 'assumes', 'responds_to',
  'rejected_because', 'changed_because', 'resolves', 'reopens', 'derived_from',
] as const;
export type LedgerRelation = (typeof LEDGER_RELATIONS)[number];

/** Who introduced it. Socria's ideas are never recorded as the person's. */
export const OWNERS = ['user', 'socria', 'external', 'unknown'] as const;
export type Owner = (typeof OWNERS)[number];

export const LEDGER_STATUSES = ['active', 'resolved', 'rejected', 'superseded', 'retracted', 'disputed'] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

export interface LedgerRevision {
  at: number;
  by: 'user' | 'socria' | 'system';
  change: 'created' | 'status' | 'text' | 'owner' | 'corrected';
  from?: string;
  to?: string;
  reason?: string;
}

/**
 * The stance the person took toward it — the difference between raising an
 * idea and holding it. Defaults to 'entertains' when unclear: never
 * 'asserts' without an assertive first-person form in their own words.
 */
export const STANCES = ['asserts', 'entertains', 'asks', 'rejects', 'accepts', 'resolved'] as const;
export type Stance = (typeof STANCES)[number];

/** How the entry is grounded: in their exact words, a close paraphrase, or an inference. */
export const BASES = ['quoted', 'paraphrased', 'inferred'] as const;
export type Basis = (typeof BASES)[number];

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  text: string;
  owner: Owner;
  stance: Stance;
  basis: Basis;
  /** the verbatim span of their words it rests on (≤200 chars) — required for owner=user */
  quote: string;
  /** why they rejected it / why it changed, when known */
  reason: string;
  status: LedgerStatus;
  confidence: number;
  conversationId: string;
  projectId: string | null;
  turn: number;
  createdAt: number;
  updatedAt: number;
  revisions: LedgerRevision[];
  /** from a sensitive or conversation-only conversation: never shown outside it (council D14/D15) */
  private?: boolean;
}

export interface LedgerLink {
  id: string;
  from: string;
  to: string;
  rel: LedgerRelation;
  owner: Owner;
  reason: string;
  createdAt: number;
}

export const NOVELTY = ['NOVEL', 'PARTIALLY_NOVEL', 'REDUNDANT', 'UNCERTAIN'] as const;
export type Novelty = (typeof NOVELTY)[number];

export interface NoveltyVerdict {
  sentence: string;
  verdict: Novelty;
  /** the considered item it overlaps, when it does */
  match: string | null;
  score: number;
  method: 'lexical' | 'model';
}

// ── ANSWER GUARD 2.0 ─────────────────────────────────────────────────

export const GUARD_ACTIONS = [
  'ALLOW',
  'MODIFY_FOR_MORE_AGENCY',
  'MODIFY_FOR_MORE_HELP',
  'OVERRIDE_WITH_DIRECT_ANSWER',
  'REQUEST_CLARIFICATION',
] as const;
export type GuardAction = (typeof GUARD_ACTIONS)[number];

export interface GuardFinding {
  side: 'overreach' | 'underhelp' | 'novelty' | 'voice';
  code: string;
  detail: string;
}

export interface GuardOutcome {
  action: GuardAction;
  findings: GuardFinding[];
  /** a deterministic rewrite that already fixes the problem, when one exists */
  revised?: string;
  /** what a regeneration must fix, when a rewrite is not enough */
  retryNote?: string;
  by: 'structure' | 'model' | 'none';
}

// ── CAPABILITY ───────────────────────────────────────────────────────

export const CAPABILITY_EVENTS = [
  'demonstrated_unassisted', // got it right with no help on this concept in this conversation
  'demonstrated_assisted',   // got it right after a hint/explanation
  'self_corrected',          // caught and fixed their own error
  'explained_reasoning',     // explained why, correctly, in their own words
  'needed_answer',           // needed the answer given to proceed
  'misunderstanding',        // a wrong attempt / revealed misunderstanding
] as const;
export type CapabilityEvent = (typeof CAPABILITY_EVENTS)[number];

export interface CapabilityEvidence {
  id: string;
  concept: string;
  event: CapabilityEvent;
  /** 0 none … 3 the answer was given — how much help preceded it */
  assistance: 0 | 1 | 2 | 3;
  conversationId: string;
  turn: number;
  confidence: number;
  at: number;
}
