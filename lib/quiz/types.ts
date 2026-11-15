// lib/quiz/types.ts — A QUIZ, AS SOCRIA KEEPS IT.
//
// A quiz is one artifact in the conversation (a display in the session's map, lib/objects/display-quiz.ts): its
// questions, the student's answers, what each answer was graded, where they are, and the review at the end. The
// same state is drawn in the Everything view and in the expanded workspace, so the two can never disagree.
//
// TWO HALVES OF A QUESTION. What the student may see — the stem, the options, the figure, the topic, the
// sources — is public and lives in the display. What would give the answer away — which option is right, the
// number and its tolerance, the accepted answers, the explanation, what each wrong option suggests — is the
// KEY, and it never reaches the browser in the clear: the server seals it (lib/quiz/seal.ts) and opens it only
// to grade a submitted answer (app/api/logos/quiz/grade/route.ts). The browser holds an opaque string per
// question. What a grading returns is kept, signed by the server, so an answer once graded is a record.
//
// PURE TYPES and sanitisers. Shared by the browser, the routes and the tests.

/** The kinds of question. Each is graded exactly (lib/quiz/grade.ts); none exists only to add a format. */
export const QUESTION_TYPES = ['single', 'multi', 'truefalse', 'numeric', 'expression', 'short'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_SAID: Record<QuestionType, string> = {
  single: 'Multiple choice',
  multi: 'Choose all that apply',
  truefalse: 'True or false',
  numeric: 'Numerical answer',
  expression: 'Expression',
  short: 'Short answer',
};

/** What a question asks of the student: to recall, to apply, or to carry an idea somewhere new. */
export const DEMANDS = ['recall', 'application', 'transfer'] as const;
export type Demand = (typeof DEMANDS)[number];

/** 1 easier, 2 at the level of the course, 3 harder. */
export type Difficulty = 1 | 2 | 3;

/**
 * HOW THE QUIZ GIVES FEEDBACK.
 *   practice   after each answer: right or not, and on a miss a short cue and one more try; the answer after that
 *   marks      after each answer: right or not only; explanations wait for the review
 *   exam       nothing until the end: an exam simulation; every answer is final when given
 */
export const QUIZ_MODES = ['practice', 'marks', 'exam'] as const;
export type QuizMode = (typeof QUIZ_MODES)[number];

export const QUIZ_MODE_SAID: Record<QuizMode, string> = {
  practice: 'Guided practice',
  marks: 'Marks as you go, explanations at the end',
  exam: 'Exam simulation',
};

/** Where a question comes from: a passage of the student's own material, by file, page and block. */
export interface SourceRef {
  /** the document's id in the browser's library (lib/docs) */
  doc: string;
  /** the file's name, as shown */
  title: string;
  page?: number;
  /** the block id within the document (lib/docs/types.ts) */
  block?: string;
  /** a few of the passage's own words, cut from the block (never the model's paraphrase) */
  quote?: string;
}

/** A picture a question is asked about: curves drawn from their own expressions, so what is drawn is what is graded. */
export interface QuizFigure {
  kind: 'curves';
  title?: string;
  /** axis names: "Quantity", "Price" */
  x: { label: string; min: number; max: number };
  y: { label: string; min: number; max: number };
  /** each curve, an expression in x ("100 - 2*x"), with its name ("D", "S", "MC") */
  curves: { id: string; label: string; expr: string; dashed?: boolean }[];
  /** points marked on it, with a letter ("A") — never the answer itself */
  points?: { label: string; x: number; y: number }[];
}

/** One option of a choice question. Ids are positional (a, b, c …) after shuffling: an id says nothing. */
export interface QuizOption {
  id: string;
  text: string;
}

/** What the student sees of a question. */
export interface QuizQuestion {
  id: string;
  type: QuestionType;
  /** the question, in plain words; $…$ for mathematics */
  stem: string;
  options?: QuizOption[];
  /** for a numerical answer: the unit it is asked in ("$", "units", "%"), shown beside the box */
  unit?: string;
  figure?: QuizFigure;
  /** the topic as the course names it ("Monopoly pricing") */
  topic: string;
  /** a stable key for the concept (lower case), shared by questions on the same idea: the unit of mastery */
  concept: string;
  difficulty: Difficulty;
  demand: Demand;
  sources: SourceRef[];
  /** the opaque, server-sealed key (lib/quiz/seal.ts). Without the server, it is noise. */
  sealed: string;
  /** another question on the same concept, kept back for a retest after a miss (never shown otherwise) */
  variantOf?: string;
}

/** How an answer was graded. "close" is a slip (a spelling, a rounding); "partial" is some of a multi-select. */
export const GRADES = ['right', 'close', 'partial', 'wrong', 'unsure'] as const;
export type Grade = (typeof GRADES)[number];

/** How sure Socria is about what a wrong answer shows: a confirmed slip, a plausible misconception, or nothing yet. */
export type Evidence = 'confirmed' | 'plausible' | 'insufficient';

/** What a wrong answer may show, said carefully. */
export interface MistakeRead {
  /** a short code: "calculation-slip", "unit", "sign", or a misconception tag from the question's key */
  tag: string;
  /** one sentence, in plain words, framed as a possibility unless confirmed */
  note: string;
  evidence: Evidence;
}

/** The server's word on one submitted answer. Signed, so it is a record and not a claim. */
export interface Graded {
  grade: Grade;
  /** the right answer, as the student should read it (shown only when the mode reveals it) */
  correct?: string;
  /** one or two sentences: why */
  why?: string;
  /** a cue to reason with, given on a first miss in practice instead of the answer */
  cue?: string;
  mistake?: MistakeRead;
  /** HMAC over quiz, question, answer and grade (lib/quiz/seal.ts signGrade) */
  sig: string;
  at: number;
}

/** One answer the student gave. Never rewritten: a second try is a second attempt. */
export interface Attempt {
  /** what they gave: an option id, ids joined by ",", a number as typed, an expression, or words */
  answer: string;
  /** asked for a hint, or a second try after a cue: the answer was not independent */
  helped: boolean;
  /** graded by the server, or (in exam mode) waiting for the end */
  graded: Graded | null;
  at: number;
}

/** The record of one question in this quiz: its attempts, and how it stands. */
export interface QuestionRecord {
  attempts: Attempt[];
  /** they chose to see the answer before getting it right */
  revealed: boolean;
  /** for an open answer the grader could not be sure of: their own check against the model answer */
  selfMark?: 'right' | 'wrong';
  /** the right answer and why, once the server has shown them (a reveal, or the review) */
  shown?: { correct: string; why: string };
}

/** What a quiz was made from, said honestly. */
export interface QuizBasis {
  /** the course and instructor, when one applies */
  course: string | null;
  instructor: string | null;
  /** the materials the questions are drawn from */
  sources: { doc: string; title: string; kind?: string }[];
  /** "grounded": every question from the student's material; "mixed": some from general knowledge (said so); "general": none */
  grounding: 'grounded' | 'mixed' | 'general';
  /** what was asked for and could not be used ("the Lecture 9 slides are not in your library") */
  missing: string[];
  /** how the professor's style was used, with its basis */
  style: { basis: 'observed' | 'inferred' | 'unknown'; said: string } | null;
  /** what the quiz aims at: the concepts it targets first, and why */
  targets: { concept: string; why: 'asked' | 'missed' | 'due' | 'emphasis' | 'unseen' | 'scope' }[];
}

/** Where the quiz is. */
export type QuizPhase = 'taking' | 'review';

/** The links between quizzes: a practice of weak spots, or another on the same scope, knows where it came from. */
export interface QuizLinks {
  /** the quiz this one follows on from */
  parent?: string;
  /** why it was made */
  reason?: 'weak-spots' | 'another' | 'retest' | 'request';
}

export const QUIZ_LIMITS = {
  questions: 25,
  pool: 40,
  options: 6,
  stem: 900,
  option: 240,
  why: 420,
  cue: 260,
  topic: 60,
  concept: 60,
  title: 90,
  sources: 4,
  quote: 240,
  answer: 400,
  attempts: 3,
  curves: 5,
  points: 6,
  expr: 160,
} as const;
