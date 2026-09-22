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
}

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
 * The state, as the model reads it.
 *
 * Deliberately terse. This is not a briefing to be summarised back at the
 * person — it is a note to the model about where the conversation stands, and
 * anything ornamental here ends up quoted in a reply.
 */
export function renderState(s: CognitiveState): string {
  if (!hasStateContent(s)) return '';
  const parts: string[] = ['\n=== Where this conversation stands ==='];
  if (s.currentGoal) parts.push(`Trying to: ${s.currentGoal}`);
  if (s.currentFocus) parts.push(`Right now: ${s.currentFocus}`);
  parts.push(`Kind of work: ${s.taskKind}`);
  parts.push(
    `They have shown: ${s.demonstratedUnderstanding} understanding` +
      (s.attempt !== 'none' ? `; their attempt was ${s.attempt}` : '; no attempt yet')
  );
  if (s.urgency !== 'none') parts.push(`Urgency: ${s.urgency}`);
  const bullets = (label: string, xs: string[]) =>
    xs.length ? parts.push(`${label}:\n${xs.map((x) => `  - ${x}`).join('\n')}`) : undefined;
  bullets('Stuck on', s.confusions);
  bullets('They have committed to (do not hand these back as new)', s.positions);
  bullets('Taking for granted', s.assumptions);
  bullets('Pulling against each other', s.tensions);
  bullets('Bounded by', s.constraints);
  bullets('Still open', s.openThreads);
  if (s.newRelation) parts.push(`They just connected: ${s.newRelation}`);
  if (s.resolved) parts.push('Their last message answered what you asked. Use the answer.');
  if (s.blockingUnknown) parts.push(`Cannot usefully proceed without: ${s.blockingUnknown}`);
  if (s.recentChanges.length) {
    parts.push(
      'Moved during this conversation:\n' +
        s.recentChanges.map((c) => `  - ${c.what}: ${c.from} → ${c.to}`).join('\n')
    );
  }
  return parts.join('\n') + '\n';
}
