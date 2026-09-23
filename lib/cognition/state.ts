// lib/cognition/state.ts
//
// Working memory. What is happening in THIS conversation, right now.
//
// The Mind Graph is the other half: what Socria understands about a person
// across everything, persistent, edge-connected, correctable. This is the
// opposite in every dimension — it lives for one conversation, it is
// recomputed every turn, and nothing here is ever written to the graph as
// truth. A wrong entry in the graph is a false permanent belief; a wrong
// entry here costs one awkward turn.
//
// WHY IT EXISTS. Core 4's prompt tells it to adapt intervention to
// demonstrated knowledge, effort, confidence, uncertainty and urgency — and
// then leaves the model to work all of that out from the transcript on every
// turn, while also answering. That is the crack: under load the model reads
// the last message, decides it looks like a question, and answers it. Naming
// the state explicitly, before the reply is written, is what makes the
// adaptation the prompt asks for something the system does rather than
// something it hopes for.
//
// Pure: no model, no network, no clock. The extraction that fills it lives in
// engine.ts; everything about its SHAPE and how it reads is here, so it can
// be tested without an API key.

export const TASK_KINDS = [
  'learn',    // building a skill or understanding — independence is the goal
  'decide',   // weighing something — their judgement is the goal
  'create',   // making something — their authorship is the goal
  'lookup',   // they want a fact
  'debug',    // something is broken and they want it working
  'explore',  // thinking out loud, no destination yet
  'vent',     // they want to be heard, not helped
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** The work kind a coarse task kind implies, when the reader gives only the latter. */
const WORK_FROM_TASK: Record<TaskKind, WorkKind> = {
  learn: 'explanation',
  decide: 'judgment',
  create: 'creation',
  lookup: 'information',
  debug: 'diagnosis',
  explore: 'conversation',
  vent: 'reflection',
};

export const SUPPORT_LEVELS = [
  'listen', 'question', 'hint', 'partial', 'explain', 'demonstrate',
] as const;
export type SupportLevel = (typeof SUPPORT_LEVELS)[number];

export const UNDERSTANDING = ['none', 'partial', 'solid'] as const;
export type Understanding = (typeof UNDERSTANDING)[number];

export const URGENCY = ['none', 'some', 'high'] as const;
export type Urgency = (typeof URGENCY)[number];

/** Did they try, and how did it go? */
export const ATTEMPT = ['none', 'wrong', 'partial', 'right'] as const;
export type Attempt = (typeof ATTEMPT)[number];

/**
 * What the person's LATEST message did.
 *
 * The router needs this more than anything else in the state, and it was the
 * one thing the state did not record. Without it, "want to be an
 * entrepreneur long term" — which answers the question Socria just asked AND
 * ties two things already on the table together — read as "no position yet",
 * and "no position yet" routed to another question. Every answer became the
 * occasion for the next question.
 */
export const LATEST = ['answer', 'information', 'question', 'attempt', 'reaction', 'request', 'other'] as const;
export type Latest = (typeof LATEST)[number];

/**
 * When producing something themselves IS the learning — the operations
 * retrieval-practice research is about. The one place where asking is not a
 * way of continuing the conversation but the point of it.
 */
export const PRACTICE = ['none', 'retrieval', 'prediction', 'self-explanation', 'application'] as const;
export type Practice = (typeof PRACTICE)[number];

import {
  DIRECTNESS,
  LEDGER_KINDS,
  OUTCOME_LABELS,
  STUCK,
  STANCES,
  WORK_KINDS,
  INFERENCE_FLOOR,
  type Directness,
  type Inferred,
  type LedgerKind,
  type OutcomeReading,
  type Stance,
  type Stuck,
  type WorkKind,
} from '../core4/types';

export const LEARNING_GOAL = ['yes', 'no', 'unknown'] as const;
export type LearningGoal = (typeof LEARNING_GOAL)[number];
export const EXPERTISE = ['novice', 'intermediate', 'expert', 'unknown'] as const;
export type Expertise = (typeof EXPERTISE)[number];
export const STAKES = ['low', 'medium', 'high'] as const;
export type Stakes = (typeof STAKES)[number];
export const AUTHORSHIP = ['theirs', 'shared', 'none'] as const;
export type Authorship = (typeof AUTHORSHIP)[number];

/** Something the PERSON raised in their latest message — their territory now. */
export interface ConsideredNow {
  kind: LedgerKind;
  text: string;
  /** their exact words it rests on — checked against their message before it is ever attributed to them */
  quote: string;
  stance: Stance;
  /** why, when they rejected or changed it */
  reason: string;
}

/** One past turn, as the engine needs to remember it: what Socria did and how it landed. */
export interface TurnMemo {
  turn: number;
  type: string;
  family: string;
  /** interrogative load of what was actually sent */
  questions: number;
  /** was something deliberately held back this turn */
  withheld?: boolean;
  /** their attempt this turn was wrong or partial (for the practice ladder's bottom-out, council D6) */
  failed?: boolean;
  outcome?: OutcomeReading;
}

export interface RecentChange {
  what: string;
  from: string;
  to: string;
}

export interface CognitiveState {
  /** what they are ultimately trying to do */
  currentGoal: string;
  /** what is on the table this minute */
  currentFocus: string;
  taskKind: TaskKind;

  /** how much of the thing they have actually shown they understand */
  demonstratedUnderstanding: Understanding;
  /** whether they have attempted it, and whether the attempt was right */
  attempt: Attempt;
  /** the specific thing they are stuck on, in their terms */
  confusions: string[];

  /** what they have committed to — never restate these back as new */
  positions: string[];
  /** what they are taking for granted without saying so */
  assumptions: string[];
  /** where their own statements pull against each other */
  tensions: string[];
  /** what bounds the answer: time, money, a lease, a person */
  constraints: string[];
  /** what remains unresolved and worth returning to */
  openThreads: string[];
  /** how their position moved during this conversation */
  recentChanges: RecentChange[];

  /** what their latest message did — see LATEST */
  latest: Latest;
  /** did it resolve what Socria last asked? then the answer must be USED */
  resolved: boolean;
  /**
   * A connection their latest message makes between things already on the
   * table, as "A → how → B". This is the answer to "why does that matter to
   * you", arriving; the move is to use it, not to ask for it again.
   */
  newRelation: string;
  /**
   * The one thing Socria genuinely cannot usefully proceed without, if there
   * is one. Empty whenever something useful can be done with what is already
   * here — which is most of the time. The strongest reason to ask.
   */
  blockingUnknown: string;
  /** whether producing something themselves is the learning right now */
  practice: Practice;

  urgency: Urgency;
  /**
   * The rung of Core 4's own ladder this conversation currently sits on:
   * question → hint → stronger hint → partial → explanation → demonstration.
   * Derived, not guessed fresh each turn — see engine.ts.
   */
  supportLevel: SupportLevel;

  // ── Core 4 v2: what the allocation reads ─────────────────────────
  //
  // Each belief about the PERSON carries where it came from and how sure it
  // is. Explicit (they said so) beats observed beats inferred; inferred below
  // INFERENCE_FLOOR is treated as unknown by every decision.

  /** the cognitive operation THIS request involves */
  work: WorkKind;
  /** is building this capability the point, for them? */
  learningGoal: Inferred<LearningGoal>;
  /** task-relevant expertise in what is on the table (never a trait) */
  expertise: Inferred<Expertise>;
  /** what rides on getting it right */
  stakes: Inferred<Stakes>;
  /** how directly they asked to be helped */
  directness: Inferred<Directness>;
  /** must the product be theirs (their essay, their decision)? */
  authorship: Inferred<Authorship>;
  stuck: Stuck;
  /** what they have shown they can do, in this conversation */
  masteryEvidence: string[];
  /** considerations the person raised in their latest message */
  consideredNow: ConsideredNow[];
  /** how the previous Socria turn landed, read from their reply */
  lastOutcome: OutcomeReading | null;
  /** the last few turns: what Socria did, how much it asked, how it landed */
  history: TurnMemo[];
  /**
   * Questions, as the person has asked for them in THIS conversation:
   * 'stop' after "stop asking me questions", 'wanted' after "quiz me".
   * Explicit only, and it stands until they say otherwise.
   */
  questionsPreference: 'stop' | 'wanted' | 'none';
  /**
   * What may be kept from this conversation (council D15). 'none' after "off
   * the record" until "you can remember this": no ledger, no capability
   * evidence, no free text in the saved state, no Mind Graph write.
   */
  persistPolicy: 'full' | 'conversation_only' | 'none';
  /** turns so far in this conversation */
  turn: number;
}

const unknown = <T,>(value: T): Inferred<T> => ({ value, source: 'default', confidence: 0 });

export const EMPTY_STATE: CognitiveState = {
  currentGoal: '',
  currentFocus: '',
  taskKind: 'explore',
  demonstratedUnderstanding: 'none',
  attempt: 'none',
  confusions: [],
  positions: [],
  assumptions: [],
  tensions: [],
  constraints: [],
  openThreads: [],
  recentChanges: [],
  latest: 'other',
  resolved: false,
  newRelation: '',
  blockingUnknown: '',
  practice: 'none',
  urgency: 'none',
  supportLevel: 'question',
  work: 'conversation',
  learningGoal: unknown<LearningGoal>('unknown'),
  expertise: unknown<Expertise>('unknown'),
  stakes: unknown<Stakes>('low'),
  directness: unknown<Directness>('none'),
  authorship: unknown<Authorship>('none'),
  stuck: 'no',
  masteryEvidence: [],
  consideredNow: [],
  lastOutcome: null,
  history: [],
  questionsPreference: 'none',
  persistPolicy: 'full',
  turn: 0,
};

// ── bounds ──────────────────────────────────────────────────────────

const MAX_LINE = 220;
const MAX_LIST = 6;

function line(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE) : '';
}

function list(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(line).filter(Boolean).slice(0, MAX_LIST);
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function clamp01(v: unknown, d = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d;
}

/**
 * An inferred field as a model returned it. A model can never mint an
 * EXPLICIT value — only code that read the person's words can — so whatever
 * the source claims, a model's value is recorded as inferred.
 */
function inferred<T extends string>(v: unknown, allowed: readonly T[], fallback: T): Inferred<T> {
  if (v && typeof v === 'object') {
    const r = v as Record<string, unknown>;
    const value = oneOf(r.value, allowed, fallback);
    const confidence = value === fallback && r.value !== fallback ? 0 : clamp01(r.confidence, 0.5);
    return { value, source: confidence ? 'inferred' : 'default', confidence, ...(line(r.evidence) ? { evidence: line(r.evidence) } : {}) };
  }
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) {
    return { value: v as T, source: 'inferred', confidence: 0.5 };
  }
  return unknown(fallback);
}

function outcomeOf(v: unknown): OutcomeReading | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const label = oneOf(r.label, OUTCOME_LABELS, 'UNKNOWN');
  if (label === 'UNKNOWN' && !r.label) return null;
  return { label, confidence: clamp01(r.confidence, 0.4), source: 'inferred', ...(line(r.evidence) ? { evidence: line(r.evidence) } : {}) };
}

function consideredOf(v: unknown): ConsideredNow[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      kind: oneOf(c.kind, LEDGER_KINDS, 'claim'),
      text: line(c.text),
      quote: typeof c.quote === 'string' ? c.quote.replace(/\s+/g, ' ').trim().slice(0, 200) : '',
      // Never 'asserts' by default: raising an idea is not holding it.
      stance: oneOf(c.stance, STANCES, 'entertains'),
      reason: line(c.reason),
    }))
    .filter((c) => c.text)
    .slice(0, 8);
}

/** Is this inferred/explicit value strong enough to act on? */
export function usable<T>(f: Inferred<T>): boolean {
  return f.source === 'explicit' || f.source === 'observed' || (f.source === 'inferred' && f.confidence >= INFERENCE_FLOOR);
}

/**
 * What a model returned, made safe.
 *
 * Every unknown enum value falls to the CAUTIOUS end rather than a neutral
 * one: unknown understanding is 'none', unknown attempt is 'none', unknown
 * urgency is 'none'. Those defaults push the router toward asking rather than
 * toward answering, which is the direction an error should fail in here.
 */
export function sanitizeState(raw: unknown): CognitiveState {
  if (!raw || typeof raw !== 'object') return EMPTY_STATE;
  const r = raw as Record<string, unknown>;
  return {
    currentGoal: line(r.currentGoal),
    currentFocus: line(r.currentFocus),
    taskKind: oneOf(r.taskKind, TASK_KINDS, 'explore'),
    demonstratedUnderstanding: oneOf(r.demonstratedUnderstanding, UNDERSTANDING, 'none'),
    attempt: oneOf(r.attempt, ATTEMPT, 'none'),
    confusions: list(r.confusions),
    positions: list(r.positions),
    assumptions: list(r.assumptions),
    tensions: list(r.tensions),
    constraints: list(r.constraints),
    openThreads: list(r.openThreads),
    recentChanges: Array.isArray(r.recentChanges)
      ? (r.recentChanges as unknown[])
          .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
          .map((c) => ({ what: line(c.what), from: line(c.from), to: line(c.to) }))
          .filter((c) => c.what)
          .slice(0, 4)
      : [],
    // Unknown means "we do not know what it did", never "it answered": an
    // answer changes what the router does, so it has to be read, not assumed.
    latest: oneOf(r.latest, LATEST, 'other'),
    resolved: r.resolved === true,
    newRelation: line(r.newRelation),
    blockingUnknown: line(r.blockingUnknown),
    practice: oneOf(r.practice, PRACTICE, 'none'),
    urgency: oneOf(r.urgency, URGENCY, 'none'),
    supportLevel: oneOf(r.supportLevel, SUPPORT_LEVELS, 'question'),
    // The reader reports both; when it gives only the coarse task kind, the
    // work kind follows from it rather than collapsing to 'conversation'.
    work: oneOf(r.work, WORK_KINDS, WORK_FROM_TASK[oneOf(r.taskKind, TASK_KINDS, 'explore')]),
    learningGoal: inferred(r.learningGoal, LEARNING_GOAL, 'unknown'),
    expertise: inferred(r.expertise, EXPERTISE, 'unknown'),
    stakes: inferred(r.stakes, STAKES, 'low'),
    // Directness is never inferred into existence: only the person's words
    // set it (lib/core4/signals.ts). A model's guess is dropped.
    directness: unknown<Directness>('none'),
    authorship: inferred(r.authorship, AUTHORSHIP, 'none'),
    stuck: oneOf(r.stuck, STUCK, 'no'),
    masteryEvidence: list(r.masteryEvidence),
    consideredNow: consideredOf(r.consideredNow),
    lastOutcome: outcomeOf(r.lastOutcome),
    history: [],
    questionsPreference: 'none',
    persistPolicy: 'full',
    turn: 0,
  };
}

export function hasStateContent(s: CognitiveState): boolean {
  return !!(
    s.currentGoal ||
    s.currentFocus ||
    s.confusions.length ||
    s.positions.length ||
    s.assumptions.length ||
    s.tensions.length ||
    s.openThreads.length ||
    s.newRelation ||
    s.blockingUnknown
  );
}

/**
 * The state, as the reply model reads it.
 *
 * Deliberately terse, and it keeps the two kinds of knowledge apart: what the
 * person SAID (explicit) and what Socria has only INFERRED, which is labelled
 * as a reading that may be wrong — so the model never states an inference
 * about the person as fact.
 */
export function renderState(s: CognitiveState): string {
  const parts: string[] = ['\n=== Where this conversation stands ==='];
  if (s.currentGoal) parts.push(`Trying to: ${s.currentGoal}`);
  if (s.currentFocus) parts.push(`Right now: ${s.currentFocus}`);

  const said: string[] = [];
  const read: string[] = [];
  const place = (label: string, f: Inferred<string>, show: (v: string) => string | null) => {
    const text = show(f.value);
    if (!text) return;
    if (f.source === 'explicit') said.push(text + (f.evidence && !f.evidence.startsWith('Project:') ? '' : f.evidence ? ' (their Project instructions)' : ''));
    else if (f.source === 'observed') said.push(`${text} (shown in this conversation)`);
    else if (f.source === 'inferred' && f.confidence >= INFERENCE_FLOOR) read.push(`${label}: ${show(f.value)} (${Math.round(f.confidence * 100)}%)`);
  };
  // Behavioural directions only, never labels for the person (council D3):
  // "novice", "expert", "frustrated" leak into replies as condescension or
  // therapy tone, and they are guesses presented as facts.
  place('learning', s.learningGoal, (v) =>
    v === 'yes'
      ? 'building this skill themselves is the point for them — this shapes how to explain, and is never on its own a reason to hold anything back'
      : v === 'no' ? 'they need it done, not taught' : null
  );
  place('register', s.expertise, (v) =>
    v === 'expert' ? 'terse and technical: skip the basics, use precise terms, go straight to what is non-obvious'
      : v === 'novice' ? 'scaffolded: define terms the first time, concrete before general'
        : v === 'intermediate' ? 'standard: explain the non-obvious steps only' : null
  );
  place('directness', s.directness, (v) =>
    v === 'answer' ? 'they asked for the answer directly' : v === 'no_answer' ? 'they asked NOT to be given the answer' : v === 'guidance' ? 'they asked for hints, not the answer' : null
  );
  place('authorship', s.authorship, (v) => (v === 'theirs' ? 'the work must remain their own' : null));
  place('stakes', s.stakes, (v) => (v === 'high' ? 'the stakes are high' : null));
  if (s.questionsPreference === 'stop') said.push('they asked Socria to stop asking questions');
  if (s.questionsPreference === 'wanted') said.push('they asked to be quizzed');
  if (said.length) parts.push(`They have said:\n${said.map((x) => `  - ${x}`).join('\n')}`);
  if (read.length) parts.push(`Socria's reading (inferred — may be wrong, never state it to them as fact):\n${read.map((x) => `  - ${x}`).join('\n')}`);

  parts.push(`Kind of work: ${s.work}${s.taskKind ? ` (${s.taskKind})` : ''}`);
  if (s.attempt !== 'none') parts.push(`Their latest attempt: ${s.attempt}`);
  if (s.stuck === 'frustrated') parts.push('Support: go straight to the most useful help — the answer or a worked step — with no questions.');
  else if (s.stuck !== 'no') parts.push('Support: more than last time — a concrete next step or a worked example, not another pointer.');
  if (s.urgency !== 'none') parts.push(`Urgency: ${s.urgency}`);
  const bullets = (label: string, xs: string[]) =>
    xs.length ? parts.push(`${label}:\n${xs.map((x) => `  - ${x}`).join('\n')}`) : undefined;
  bullets('They have shown they can', s.masteryEvidence);
  bullets('Where they got stuck', s.confusions);
  bullets('Positions as Socria read them (may be wrong; do not hand back as new)', s.positions);
  bullets('Pulling against each other', s.tensions);
  bullets('Bounded by', s.constraints);
  bullets('Still open', s.openThreads);
  if (s.newRelation) parts.push(`They just connected: ${s.newRelation}`);
  if (s.resolved) parts.push('Their last message answered what Socria asked. Use the answer.');
  if (s.recentChanges.length) {
    parts.push('Moved during this conversation:\n' + s.recentChanges.map((c) => `  - ${c.what}: ${c.from} → ${c.to}`).join('\n'));
  }
  return parts.length > 1 ? parts.join('\n') + '\n' : '';
}
