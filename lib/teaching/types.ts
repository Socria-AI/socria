// lib/teaching/types.ts — WHAT SOCRIA KNOWS ABOUT HOW A COURSE TEACHES AND ASSESSES.
//
// A course profile is built from materials the student adds: a syllabus,
// slides and notes, past quizzes and exams they are allowed to use, study
// guides and assignments. Each material is read once (lib/docs) and digested
// (lib/teaching/materials.ts) into units — an exam's questions, a deck's
// slides, a handout's sections — with what can be counted about each. The
// profile's observations (lib/teaching/observe.ts) are worked out from those
// digests, every one with:
//
//   · its EVIDENCE: the places in the materials that support it — the file, the
//     page, the passage's own words — so a student can check it;
//   · its BASIS: OBSERVED (counted in the materials: "7 of 10 past questions are
//     multiple choice"), STATED (what the syllabus says the course will do —
//     the course's own claim, not something seen), or INFERRED (a pattern read
//     from what was observed: "the course asks you to apply ideas more than
//     recall them");
//   · its CONFIDENCE: low, moderate or high, from how much separate evidence
//     there is, how many materials it spans and how consistent it is — never
//     from how confident it sounds. A syllabus alone never makes a teaching
//     style more than low.
//
// The profile is what the runtime retrieves during a conversation
// (lib/teaching/use.ts): typed codes for the explanation engine and MR, the
// course's own terms, the concepts it keeps coming back to, and the reasoning
// its questions demand — combined with what this student has shown they know
// (the learning ledger). It never claims to know what will be on an exam.
//
// PURE TYPES. Shared by the browser, the routes and the tests.

/** What a material is. The person can always correct what was read from the file. */
export const MATERIAL_KINDS = ['syllabus', 'slides', 'notes', 'exam', 'quiz', 'assignment', 'study-guide', 'other'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

export const MATERIAL_LABEL: Record<MaterialKind, string> = {
  syllabus: 'Syllabus',
  slides: 'Lecture slides',
  notes: 'Notes',
  exam: 'Past exam',
  quiz: 'Past quiz',
  assignment: 'Assignment',
  'study-guide': 'Study guide',
  other: 'Other material',
};

/** Which side of the course a material shows: how it teaches, how it assesses, or what it says of itself. */
export type MaterialSide = 'teaching' | 'assessment' | 'stated';

export const SIDE_OF: Record<MaterialKind, MaterialSide> = {
  syllabus: 'stated',
  slides: 'teaching',
  notes: 'teaching',
  exam: 'assessment',
  quiz: 'assessment',
  assignment: 'assessment',
  'study-guide': 'assessment',
  other: 'teaching',
};

/** Kinds whose use needs the person's word that they are allowed to use them. */
export const NEEDS_PERMISSION: ReadonlySet<MaterialKind> = new Set(['exam', 'quiz']);

export interface Material {
  /** the document's id (SourceDoc.id, a hash of its bytes) */
  doc: string;
  name: string;
  kind: MaterialKind;
  /** chosen by the person, or read from the file */
  kindFrom: 'person' | 'read';
  /** what the file names, when it names it */
  course?: string;
  title?: string;
  instructor?: string;
  term?: string;
  /** a sortable key for the time the file comes from ("Fall 2025", "Exam 2"), for trends; absent when nothing says */
  order?: number;
  pages: number;
  addedAt: number;
  /** the person said they are allowed to use it (past exams and quizzes) */
  allowed?: boolean;
  /** the original file, kept for the preview (lib/file-originals.ts), so evidence opens on its page */
  file?: string;
}

/** One place in a material, in its own words. */
export interface Evidence {
  /** the document's id */
  doc: string;
  /** the block's id ("p3.12") */
  block: string;
  page: number;
  /** verbatim, clipped (≤ 160 characters) */
  quote: string;
  /** an assessment item's label ("Q3", "Question 2(b)") or a slide's title */
  unit?: string;
}

/** A unit of a material: one question of an exam, one slide, one section of notes. */
export interface Unit {
  /** "Q3", "Slide 4", or the section's heading */
  label: string;
  kind: 'item' | 'section';
  block: string;
  page: number;
  quote: string;
  /** what can be said of it, as codes (UNIT_CODES) */
  codes: string[];
  /** the points it is worth, when it says */
  points?: number;
  /** its content words and phrases, for what the course keeps coming back to */
  terms: string[];
  /** hashes of its five-word runs, so practice can be checked for copied wording without keeping the wording */
  shingles?: number[];
}

/** What can be counted across a material's prose. */
export interface MaterialStats {
  sentences: number;
  words: number;
  /** words of nine letters or more: a rough measure of how technical the prose is */
  longWords: number;
  equations: number;
  definitions: number;
  examples: number;
  analogies: number;
  applications: number;
  links: number;
  objectives: number;
  recaps: number;
  checks: number;
  worked: number;
  why: number;
}

/** A material, digested: everything the profile needs from it, so the file itself is not needed again. */
export interface MaterialDigest {
  material: Material;
  units: Unit[];
  /** the material's terms and how often each occurs, most frequent first */
  terms: [string, number][];
  /** abbreviations it defines: "marginal revenue (MR)" */
  abbreviations: [string, string][];
  /** terms it defines in so many words */
  defined: string[];
  stats: MaterialStats;
  /** what the syllabus says about how the course is assessed or taught, as codes with their evidence */
  stated: { code: string; evidence: Evidence }[];
}

/** The aspects of teaching and assessment a profile describes. */
export const DIMENSIONS = {
  depth: 'Explanation depth',
  terms: 'Terminology',
  emphasis: 'Concepts or practice',
  examples: 'Examples, analogies and applications',
  intro: 'How topics are introduced',
  links: 'Connections it draws',
  structure: 'How lessons are built',
  formats: 'Question formats',
  difficulty: 'Difficulty',
  recall: 'Understanding or recall',
  numeric: 'Numbers and application',
  graphs: 'Graphs and diagrams',
  wording: 'Wording and traps',
  topics: 'What keeps coming up',
  trend: 'How it has changed',
} as const;
export type Dimension = keyof typeof DIMENSIONS;

export const SIDE_OF_DIMENSION: Record<Dimension, 'teaching' | 'assessment'> = {
  depth: 'teaching',
  terms: 'teaching',
  emphasis: 'teaching',
  examples: 'teaching',
  intro: 'teaching',
  links: 'teaching',
  structure: 'teaching',
  formats: 'assessment',
  difficulty: 'assessment',
  recall: 'assessment',
  numeric: 'assessment',
  graphs: 'assessment',
  wording: 'assessment',
  topics: 'assessment',
  trend: 'assessment',
};

export type Basis = 'observed' | 'stated' | 'inferred';
export type Confidence = 'low' | 'moderate' | 'high';

export const BASIS_LABEL: Record<Basis, string> = {
  observed: 'Seen in your materials',
  stated: 'The syllabus says so',
  inferred: 'Socria’s reading of a pattern',
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: 'Low confidence',
  moderate: 'Moderate confidence',
  high: 'High confidence',
};

export interface Observation {
  /** stable across rebuilds: the dimension and what it says ("formats:mcq") */
  id: string;
  dimension: Dimension;
  /** a typed, content-free code the runtime acts on ("format.mcq", "intro.example-first", "trap.negation") */
  code: string;
  /** what was found, as a student reads it */
  said: string;
  basis: Basis;
  confidence: Confidence;
  /** 0..1, under the label */
  score: number;
  /** how much separate evidence there is: units that show it, out of units that could have, across materials of these kinds */
  support: { units: number; of: number; materials: number; kinds: MaterialKind[] };
  /** where it shows, at most six places */
  evidence: Evidence[];
  /** where a share is meant (the share of questions with a graph), 0..1 */
  share?: number;
  /** for terms and topics: the words themselves */
  terms?: string[];
  /** what it does not show, or what would make it surer */
  caveat?: string;
}

/** A concept the course keeps coming back to, and where. */
export interface CourseConcept {
  term: string;
  /** 0..1, relative to the course's most emphasised concept */
  weight: number;
  /** assessment items and teaching units it appears in */
  inAssessment: number;
  inTeaching: number;
  evidence: Evidence[];
}

/** The person's word on an observation. */
export interface Correction {
  verdict: 'wrong' | 'right';
  note?: string;
  at: number;
}

/** What changed in the profile, and when — so a student sees how the picture moved as materials came in. */
export interface ProfileChange {
  at: number;
  kind: 'added' | 'removed' | 'new' | 'gone' | 'stronger' | 'weaker' | 'shifted' | 'corrected' | 'restored';
  /** the material it came with */
  material?: string;
  /** the observation it is about */
  obs?: string;
  said: string;
}

export interface CourseProfile {
  v: 1;
  /** the course and instructor, normalised: different instructors of one course are different profiles */
  id: string;
  /** "ECO 304K", or the name the person gave it */
  course: string;
  title?: string;
  instructor?: string;
  term?: string;
  digests: MaterialDigest[];
  observations: Observation[];
  concepts: CourseConcept[];
  /** the course's preferred terms and abbreviations, for explanations in its own words */
  vocabulary: { terms: string[]; abbreviations: [string, string][] };
  corrections: Record<string, Correction>;
  history: ProfileChange[];
  createdAt: number;
  updatedAt: number;
}

/** The never-predict line, said wherever practice or the profile is shown. */
export const NO_PREDICTION =
  'This shows how the course has taught and asked questions in the materials you added. It cannot tell you what will be on an exam.';
