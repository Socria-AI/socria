// lib/teaching/materials.ts — A COURSE MATERIAL, READ INTO WHAT A PROFILE NEEDS.
//
// A material arrives as a SourceDoc (lib/docs): every block verbatim, with its
// page. Here it is
//
//   · CLASSIFIED — syllabus, slides, notes, past exam or quiz, assignment, study
//     guide — from its name and its own words; the person can always say
//     otherwise;
//   · IDENTIFIED — the course code, title, instructor and term it names, so two
//     instructors' sections of one course are two profiles, and later exams can
//     be told from earlier ones;
//   · CUT INTO UNITS — an exam into its questions (with their options, parts and
//     points), a deck into its slides, notes into their sections — and each unit
//     described in codes: its format, the thinking its verbs ask for, numbers,
//     graphs, the wording that trips people up, how a topic is opened;
//   · COUNTED — sentences, definitions, examples, analogies, links back to
//     earlier ideas, worked steps;
//   · and its TERMS gathered: the phrases it keeps using, the abbreviations it
//     defines, the terms it defines in so many words.
//
// The digest keeps only short verbatim excerpts (as evidence) and hashes of a
// question's five-word runs (so practice can be checked for copied wording
// without keeping the wording). The profile is worked out from digests alone
// (lib/teaching/observe.ts), so the file is not needed again.
//
// PURE. Deterministic: the same file reads the same way.

import type { DocBlock, SourceDoc } from '@/lib/docs/types';
import {
  MATERIAL_KINDS,
  type Evidence,
  type Material,
  type MaterialDigest,
  type MaterialKind,
  type MaterialStats,
  type Unit,
} from './types';

// ── small text helpers ───────────────────────────────────────────────

export const clip = (s: string, n = 160): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:\-–\s]+$/, '')}…`;
};

const wordsOf = (s: string) => s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));

/** Sentences, roughly: enough to measure their length. */
export function sentencesOf(s: string): string[] {
  return s
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(“"])/)
    .map((x) => x.trim())
    .filter((x) => wordsOf(x).length >= 3);
}

/** A name, spaced out for reading: "ECO304K_Midterm1_Fall2025.pdf" → "ECO 304 K Midterm 1 Fall 2025". */
export function nameWords(name: string): string {
  return name
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[_\-.+]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 32-bit FNV-1a: a stable, small hash of a string. */
export function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Hashes of a text's five-word runs (lower-cased, punctuation dropped): what copied wording would share. */
export function shinglesOf(text: string, n = 5, cap = 80): number[] {
  const w = text
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const out = new Set<number>();
  for (let i = 0; i + n <= w.length && out.size < cap; i++) out.add(fnv(w.slice(i, i + n).join(' ')));
  return [...out];
}

// ── what a material is ───────────────────────────────────────────────

const NAME_HINTS: [MaterialKind, RegExp][] = [
  ['syllabus', /\bsyllab|\bcourse (outline|info|information|policies|overview|guide)\b/i],
  ['study-guide', /\bstudy guide\b|\breview (sheet|guide|packet|session)?\b|\bcheat sheet\b|\bexam review\b|\bkey terms\b/i],
  ['quiz', /\bquiz(zes)?\b/i],
  ['exam', /\b(exam|midterm|mid term|final|test|prelim)\b/i],
  ['assignment', /\b(hw|homework|assignment|problem set|pset|ps|lab|worksheet|exercises?)\b/i],
  // "Lecture 5 notes" is notes; "Lecture 5" alone, or "Week 3 slides", is a deck
  ['notes', /\b(notes|chapter|ch|reading|handout|summary|textbook)\b/i],
  ['slides', /\b(slides?|lecture|lec|deck|week|class|session|module|unit)\b/i],
];

const CUES: Record<'syllabus' | 'exam' | 'quiz' | 'assignment' | 'study-guide', RegExp[]> = {
  syllabus: [
    /\boffice hours?\b/i,
    /\bgrading\b|\bgrade (breakdown|distribution|scale)\b/i,
    /\bcourse description\b/i,
    /\bprerequisites?\b/i,
    /\brequired (text|textbook|materials?|readings?)\b/i,
    /\battendance\b/i,
    /\bacademic (integrity|honesty|dishonesty|misconduct)\b/i,
    /\blearning (outcomes|objectives)\b/i,
    /\blate (work|policy|submissions?|assignments?)\b/i,
    /\bcourse (schedule|calendar)\b/i,
    /\bdisabilit(y|ies)\b/i,
  ],
  exam: [
    /\b(midterm|final) (exam|examination)\b|\bexamination\b/i,
    /\bname\s*[:_]{1,}/i,
    /\b(student )?id\s*[:_]{2,}/i,
    /\btime (allowed|limit)\b|\b\d{2,3} minutes\b/i,
    /\btotal (points|marks)\b/i,
    /\bdo not (open|turn)\b/i,
    /\bclosed[- ]book\b|\bopen[- ]book\b/i,
    /\bshow (all )?your work\b/i,
    /\banswer (all|each|every) (of the )?(questions?|following)\b/i,
    /\bcircle (the|your)\b|\bfill in the bubble\b|\bscantron\b/i,
  ],
  quiz: [/\bquiz\b/i],
  assignment: [/\bdue\s*(date|by|:)/i, /\bsubmit\b|\bsubmission\b/i, /\b(homework|problem set|assignment)\b/i],
  'study-guide': [/\bstudy guide\b/i, /\breview\b/i, /\byou should be able to\b/i, /\bpractice (problems|questions)\b/i, /\btopics (covered|to know)\b/i, /\bkey (terms|concepts)\b/i],
};

const cueCount = (text: string, cues: RegExp[]) => cues.filter((r) => r.test(text)).length;

const usable = (b: DocBlock) => b.kind !== 'header' && b.kind !== 'footer' && b.text.trim().length > 0;

/** What a material is, from its name and its own words. */
export function kindOf(doc: Pick<SourceDoc, 'name' | 'format' | 'blocks' | 'pageCount'>): MaterialKind {
  const blocks = doc.blocks.filter(usable);
  const head = blocks
    .slice(0, 60)
    .map((b) => b.text)
    .join('\n');
  const all = blocks
    .slice(0, 600)
    .map((b) => b.text)
    .join('\n');
  const name = nameWords(doc.name);
  const items = blocks.filter((b) => Q_START.test(b.text)).length;
  const syllabus = cueCount(all, CUES.syllabus);
  if (syllabus >= 4) return 'syllabus';
  for (const [kind, re] of NAME_HINTS) {
    if (!re.test(name)) continue;
    // a "practice exam" is an exam's shape; a "review" with questions in it is still a study guide
    if (kind === 'slides' && (doc.format === 'pptx' || doc.format === 'odp')) return 'slides';
    if (kind === 'notes' && items >= 5 && cueCount(head, CUES.exam) >= 2) return 'exam';
    return kind;
  }
  if (syllabus >= 3) return 'syllabus';
  if (doc.format === 'pptx' || doc.format === 'odp') return 'slides';
  if (cueCount(head, CUES.quiz) && items >= 2) return 'quiz';
  if (cueCount(head, CUES.exam) >= 2 && items >= 3) return 'exam';
  if (cueCount(head, CUES['study-guide']) >= 2) return 'study-guide';
  if (cueCount(head, CUES.assignment) >= 2 && items >= 2) return 'assignment';
  if (items >= 6 && blocks.some((b) => OPTION.test(b.text))) return 'exam';
  // a deck: many pages, a few short blocks on each
  const pages = Math.max(1, doc.pageCount);
  if (pages >= 5 && blocks.length / pages <= 9 && all.length / pages < 700) return 'slides';
  return blocks.length ? 'notes' : 'other';
}

export const isMaterialKind = (k: unknown): k is MaterialKind => typeof k === 'string' && (MATERIAL_KINDS as readonly string[]).includes(k);

// ── whose course, and when ───────────────────────────────────────────

const NOT_A_SUBJECT = new Set([
  'FALL', 'SPRING', 'SUMMER', 'WINTER', 'AUTUMN', 'ROOM', 'PAGE', 'EXAM', 'TERM', 'YEAR', 'UNIT', 'WEEK', 'DAY', 'MAY', 'JUNE', 'JULY', 'MARCH', 'APRIL', 'TOTAL',
  'QUIZ', 'TEST', 'PART', 'NOTE', 'NOTES', 'LAB', 'HW', 'PS', 'CH', 'SEC', 'LEC', 'ID', 'NO', 'PM', 'AM', 'FINAL', 'MIDTERM', 'CLASS', 'SLIDE', 'SLIDES', 'MODULE',
]);

/** "ECO 304K", "ACCT 2301", "MATH 408C" — the course code a file names, normalised. */
export function courseCodeIn(text: string): string | null {
  const re = /\b([A-Z]{2,5})[ \t]?[-–]?[ \t]?(\d{3,4})(?:[ \t]?([A-Z]{1,2}))?\b/g;
  for (const m of text.matchAll(re)) {
    if (NOT_A_SUBJECT.has(m[1])) continue;
    if (/^(19|20)\d\d$/.test(m[2]) && !m[3]) continue;
    return `${m[1]} ${m[2]}${m[3] ?? ''}`;
  }
  return null;
}

const TITLE_PREFIX = /^(?:dr|prof|professor|mr|mrs|ms|mx)\.?\s+/i;

/** The instructor a file names after "Instructor:", "Professor:", "Prof." or "Dr." — just the name. */
export function instructorIn(text: string): string | null {
  const labelled = /\b(?:[Ii]nstructor|[Pp]rofessor|[Ll]ecturer|[Ff]aculty|[Tt]aught by|[Tt]eacher)s?[ \t]*[:–-][ \t]*((?:[Dd]r\.?|[Pp]rof(?:essor)?\.?)[ \t]+)?([A-Z][a-zA-Z'’-]+(?:[ \t]+[A-Z]\.)?(?:[ \t]+[A-Z][a-zA-Z'’-]+){0,2})/;
  const titled = /\b(?:Dr|Prof|Professor)\.?[ \t]+([A-Z][a-zA-Z'’-]+(?:[ \t]+[A-Z]\.)?(?:[ \t]+[A-Z][a-zA-Z'’-]+){0,2})/;
  const lines = text.split(/\n+/);
  let name: string | undefined;
  for (const l of lines) {
    const m = labelled.exec(l);
    if (m) {
      name = m[2];
      break;
    }
  }
  if (!name) for (const l of lines) if ((name = titled.exec(l)?.[1])) break;
  if (!name) return null;
  const clean = name.replace(TITLE_PREFIX, '').replace(/\s+(Office|Email|E-mail|Phone|Hours|Room|Course)\b.*$/i, '').trim();
  if (clean.split(/\s+/).length > 3 || clean.length < 2) return null;
  if (/^(Office|Email|Hours|Course|The|And)$/i.test(clean)) return null;
  return clean;
}

const SEASON: Record<string, number> = { spring: 0.1, summer: 0.2, fall: 0.3, autumn: 0.3, winter: 0.4 };

/** "Fall 2025", and a key that sorts terms in time. */
export function termIn(text: string): { term: string; order: number } | null {
  const m = /\b(Fall|Spring|Summer|Winter|Autumn)\s*(?:semester|term|session|quarter)?\s*['’]?(\d{4}|\d{2})\b/i.exec(text);
  if (!m) return null;
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  if (year < 1990 || year > 2100) return null;
  const season = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  return { term: `${season} ${year}`, order: year + (SEASON[season.toLowerCase()] ?? 0) };
}

/** Which exam of the term: "Midterm 2", "Exam 3", the final — a fraction to sort within a term. */
function sittingOf(text: string): number {
  if (/\bfinal\b/i.test(text)) return 0.009;
  const m = /\b(?:exam|midterm|test|quiz|prelim)\s*#?\s*(\d)\b/i.exec(text);
  return m ? Number(m[1]) * 0.001 : 0;
}

export interface Identity {
  course?: string;
  title?: string;
  instructor?: string;
  term?: string;
  order?: number;
}

/** The course, title, instructor and term a file names (in its name or its first pages). */
export function identityOf(doc: Pick<SourceDoc, 'name' | 'title' | 'blocks'>): Identity {
  const blocks = doc.blocks.filter(usable).slice(0, 40);
  const head = [doc.title ?? '', ...blocks.map((b) => b.text), nameWords(doc.name)].join('\n');
  const out: Identity = {};
  const course = courseCodeIn(head);
  if (course) {
    out.course = course;
    // a title beside the code: "ECO 304K: Introduction to Microeconomics"
    const near = blocks.map((b) => b.text).find((t) => courseCodeIn(t) === course);
    const after = near ? /[:–—-]\s*([A-Z][A-Za-z,&' ]{6,70})$/.exec(near.replace(/\s+/g, ' ').trim())?.[1] : undefined;
    if (after && !/\b(exam|midterm|final|quiz|syllabus|fall|spring|summer|winter)\b/i.test(after)) out.title = after.trim();
  }
  const who = instructorIn(head);
  if (who) out.instructor = who;
  const term = termIn(head);
  if (term) {
    out.term = term.term;
    out.order = Math.round((term.order + sittingOf(head)) * 1000) / 1000;
  }
  return out;
}

// ── questions, slides, sections ──────────────────────────────────────

/** Where a question starts: "1.", "2)", "Question 3", "Q4", "Problem 5". */
export const Q_START = /^\s*(?:(?:Q(?:uestion)?|Problem|Exercise|Item)\s*\.?\s*#?\s*(\d{1,3})\b[\s.:)\-–]*|(\d{1,3})\s*[.)]\s+(?=\S))/i;
/** A multiple-choice option: "a) …", "(B) …", "C. …". */
export const OPTION = /^\s*\(?([a-eA-E])[.)]\s+\S/;
/** A part of a question: "(a) …", "b) …", "(iii) …". */
const PART = /^\s*\(?([a-hA-H]|i{1,3}|iv|vi{0,3}|ix|x)\)\s+\S/;
/**
 * Lettered pieces written on one line ("… a) income b) the price of tea c) …", as Markdown and some PDFs hold an
 * exam): options, when they are short and in order from a; parts, when they tell you to do something.
 */
export function lettered(text: string): { options: number; parts: number; asks: string } {
  const marks = [...text.matchAll(/(?:^|\s)\(?([a-hA-H])[.)]\s+/g)];
  if (marks.length < 2) return { options: 0, parts: 0, asks: '' };
  // in order from a: a, b, c… (a stray "Plan B)" is not a list)
  const seq: RegExpMatchArray[] = [];
  for (const m of marks) if (m[1].toLowerCase().charCodeAt(0) - 97 === seq.length) seq.push(m);
  if (seq.length < 2) return { options: 0, parts: 0, asks: '' };
  const pieces = seq.map((m, i) => text.slice((m.index ?? 0) + m[0].length, i + 1 < seq.length ? seq[i + 1].index : undefined).trim());
  const doing = pieces.filter((x) => IMPERATIVE_WORD.test(x) || x.length > 140);
  return { options: doing.length ? 0 : pieces.length, parts: doing.length ? pieces.length : 0, asks: doing.join('\n') };
}
const IMPERATIVE_WORD = /^(calculate|compute|draw|sketch|shade|label|explain|show|find|determine|describe|discuss|use|identify|write|state|give|suppose|assume|derive|prove|evaluate|compare|graph|plot|illustrate|justify|what|why|how|which|if|briefly)\b/i;

/** A line that tells you to do something is a part of a question, not an option to choose. */
const IMPERATIVE = /^\s*\(?(?:[a-hA-H]|i{1,3}|iv|vi{0,3})[.)]\s+(calculate|compute|draw|sketch|shade|label|explain|show|find|determine|describe|discuss|use|identify|write|state|give|suppose|assume|derive|prove|evaluate|compare|graph|plot|illustrate|justify|what|why|how|which|if|briefly)\b/i;
const INSTRUCTIONS = /\b(write your name|show (all )?your work|calculators? (are|is|may)|no notes|time allowed|answer all|read each question|do not open|honor code|scantron|you have \d+ minutes)\b/i;
const POINTS = /\(\s*(\d{1,3})\s*(?:points?|pts?\.?|marks?)\s*\)|\[\s*(\d{1,3})\s*(?:points?|pts?\.?|marks?)\s*\]|\b(\d{1,3})\s*(?:points?|pts)\b/i;

/** The verbs that say what thinking a question asks for, lowest to highest. */
const BLOOM: [string, RegExp][] = [
  ['remember', /\b(define|list|identify|name|state|recall|label|(is|are) defined as|the definition of|which of the following (is|are) (the )?(definition|term)|what is the (definition|term)|true or false)\b/i],
  ['understand', /\b(explain|describe|summari[sz]e|interpret|classify|illustrate|give an example|paraphrase|in your own words|what does .{1,40} mean)\b/i],
  ['apply', /\b(calculate|compute|solve|use|apply|determine|find|estimate|how (much|many)|what (is|will be) the (value|price|quantity|amount|cost|rate))\b/i],
  ['analyze', /\b(analy[sz]e|compare|contrast|distinguish|differentiate|examine|what (would|will) happen|predict|why does|why do|what explains|infer|relationship between)\b/i],
  ['evaluate', /\b(evaluate|justify|assess|critique|argue|defend|recommend|judge|is it (better|worse|justified)|do you agree|to what extent)\b/i],
  ['create', /\b(design|construct|propose|develop|formulate|devise|create|write a (plan|proposal|policy|model))\b/i],
];

const GRAPH = /\b(graph|diagram|curve|plot|draw|sketch|axis|axes|figure|chart|shifts?|shifted|slope|intercept|equilibrium point)\b/i;
const CALC = /\b(calculate|compute|find|determine|solve|how (much|many)|what is the value|round (to|your))\b/i;
const PROOF = /\b(prove|show that|derive|demonstrate that)\b/i;
const ESSAY = /\b(discuss|evaluate|justify|explain why|explain how|argue|critique|assess|to what extent|compare and contrast)\b/i;
const NEGATION = /\b(NOT|EXCEPT|LEAST|FALSE|INCORRECT)\b|\bwhich (of the following )?(is|are) not\b|\bis not true\b/;
const ABSOLUTE = /\b(always|never|only|must|all|none|every|cannot)\b/i;
const ALL_ABOVE = /\b(all|none|both) of the (above|following)\b|\bboth (a|b|i|ii) and\b|\b[a-d] and [a-d] only\b/i;
const CONTRAST = /\b(difference between|distinguish|versus|vs\.?|rather than|instead of|as opposed to|confus(e|ed|ing) with)\b/i;
const BEST = /\b(best (explains?|describes?|answer|represents?)|most (likely|accurate|appropriate)|primarily|main reason)\b/i;
const SCALE = /\b(percentage points?|basis points?|in (thousands|millions|billions)|per unit|per capita|annuali[sz]ed)\b/i;
const SCENARIO = /^\s*(?:\d{1,3}[.)]\s*)?(suppose|consider|imagine|assume|a (firm|company|country|consumer|student|patient|researcher)|in (a|an|the) (economy|market|town|study|experiment))\b/i;
const JUSTIFY = /\b(explain your (answer|reasoning)|justify|show (all )?your work|briefly explain|support your answer)\b/i;
const NUMBERS = /(?:[$£€]\s?\d|\d+(?:\.\d+)?\s?%|\b\d+(?:,\d{3})*(?:\.\d+)?\b)/g;

function numberCount(text: string): number {
  return (text.match(NUMBERS) ?? []).length;
}

const STOP = new Set(
  (
    'a an the of to in on for and or but if then than that this these those is are was were be been being it its as at by with from into onto over under about after before between ' +
    'during through without within upon each every any all some most more less least few many much such which what who whom whose when where why how not no nor so too very can could ' +
    'would should will shall may might must do does did done have has had having i you he she we they them their our your his her my me us there here also just only own same other ' +
    'one two three four five six seven eight nine ten first second third next last new old high low large small given shown following follow following above below true false yes ' +
    'answer answers question questions point points page pages example examples figure figures table tables chapter section slide slides lecture lectures class course exam exams quiz ' +
    'quizzes midterm final student students professor instructor homework assignment problem problems part parts explain describe discuss calculate compute find determine show use using ' +
    'based case cases way ways thing things lot type types form forms kind kinds number numbers value values amount total rate level change changes increase increases decrease decreases ' +
    'effect effects result results reason reasons important correct incorrect best likely likely following week weeks day days time times today note notes review study guide key term terms ' +
    'concept concepts idea ideas let make made makes see seen say said get gets got take takes taken give gives work works working need needs want wants well good better within because ' +
    'therefore thus however although while since unless whether either neither both cannot circle choose select write written read draw label sketch graph diagram ' +
    'suppose supposed assume assumed consider imagine happens happen happened falls fall fell rises rise rose raises raise raised affect affects affected using used explain explains ' +
    'shows shown describes described called known means mean minus plus equals equal depends depend stay stays remain remains likely unlikely certain whole half'
  ).split(/\s+/)
);

/** The content words and phrases in a text: runs of words that are not stop words, as one, two and three words. */
export function phrasesIn(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/'s\b/g, '')
    .split(/[^a-z0-9\-]+/)
    .map((w) => w.replace(/^-+|-+$/g, ''))
    .filter(Boolean);
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    for (let i = 0; i < run.length; i++) {
      const w = run[i];
      if (w.length >= 5 && !/^\d/.test(w)) out.push(w);
      if (i + 1 < run.length) out.push(`${w} ${run[i + 1]}`);
      if (i + 2 < run.length) out.push(`${w} ${run[i + 1]} ${run[i + 2]}`);
    }
    run = [];
  };
  for (const w of words) {
    if (STOP.has(w) || w.length < 3 || /^\d+$/.test(w)) flush();
    else run.push(w);
  }
  flush();
  return out;
}

const DEFINITION = /\b(is defined as|are defined as|refers to|is called|are called|is known as|are known as|we call (this|it|these)|definition|means that|is the (amount|value|change|ratio|rate|process|study|measure))\b/i;
const EXAMPLE = /\b(for example|for instance|e\.g\.|example\s*\d*\s*[:.]|consider (a|an|the)|suppose|imagine|case study)\b/i;
const ANALOGY = /\b(like a|like an|as if|think of (it|this) as|analog(y|ous)|similar to how|is like)\b/i;
const APPLICATION = /\b(real[- ]world|in practice|in the real|application|applied to|case study|in the news|policy|businesses|firms? (use|do)|everyday|for a (firm|company|business|patient|country))\b/i;
const LINK = /\b(recall (that|from)|remember (that|from)|as we saw|as we discussed|builds? on|previously|last (week|lecture|class|time)|earlier (we|in)|compare (this|with|to)|unlike|in contrast|related to|connects? (to|with)|leads? to|in turn|this is why|because of this)\b/i;
const OBJECTIVE = /\b(learning (objectives?|outcomes?|goals?)|by the end of (this|the|today)|you should be able to|objectives?\s*[:.]|goals? for today|today we will)\b/i;
const RECAP = /\b(summary|recap|key (takeaways?|points|ideas)|in summary|to summari[sz]e|main points|wrap[- ]up|review of)\b/i;
const CHECK = /\b(check your understanding|try (this|it)|practice (problem|question)|quick (quiz|check)|clicker|think[- ]pair|pause and|your turn|test yourself)\b/i;
const WORKED = /^\s*(step\s*\d|solution\b|answer\s*:|worked example|therefore\b|thus\b|so,?\s+the answer)/i;
const WHY = /\b(because|the reason|this is why|which is why|so that|in order to|why)\b/i;
const MOTIVATION = /\b(why (do|does|should|would|is)|what if|have you ever|puzzle|question for today|how can|how do we)\b/i;
const EQUATION = /[=≈≤≥∑∫√]|\b[A-Za-z]\s*=\s*[-\dA-Za-z(]/;
const STRUCTURAL = /^(learning objectives?|objectives?|goals?|summary|key (takeaways?|points|ideas)|recap|note|notes|recall|example|answer|solution|agenda|outline|today|review|reminder|warning|tip)\s*:/i;

/** A unit's codes, from what its words say (lib/teaching/types.ts Unit.codes). */
export function itemCodes(stem: string, body: string, opts: { options: number; parts: number; hasFigure: boolean; asks?: string; optionText?: string }): string[] {
  // what a question says, its parts included (on one line or many); never its options, for the thinking it asks for
  const all = `${stem}\n${body}\n${opts.asks ?? ''}`;
  const asks = `${stem}\n${opts.asks ?? ''}`;
  const codes: string[] = [];
  const mcq = opts.options >= 3;
  const tf = /\btrue\s*(or|\/)\s*false\b|\bT\s*\/\s*F\b/i.test(all);
  if (tf) codes.push('format.tf');
  else if (mcq) codes.push('format.mcq');
  else codes.push('format.free');
  if (/\bmatch (each|the following)\b/i.test(all)) codes.push('format.match');
  if (/_{4,}/.test(stem) && !mcq) codes.push('format.fill');
  if (CALC.test(all)) codes.push('format.calc');
  if (PROOF.test(all)) codes.push('format.proof');
  if (!mcq && !tf && ESSAY.test(all)) codes.push('format.essay');
  if (!mcq && !tf && wordsOf(stem).length <= 18 && !CALC.test(all) && !ESSAY.test(all)) codes.push('format.short');
  if (opts.parts >= 2) codes.push('parts');
  if (opts.parts >= 3) codes.push('parts.3');
  // the highest thinking the question's own verbs ask for; with none, understanding
  let level = -1;
  BLOOM.forEach(([, re], i) => {
    if (re.test(asks)) level = Math.max(level, i);
  });
  codes.push(`bloom.${BLOOM[level < 0 ? 1 : level][0]}`);
  const nums = numberCount(all.replace(Q_START, '').replace(POINTS, ''));
  if (nums >= 2 || /[$£€%]/.test(all)) codes.push('num');
  if (GRAPH.test(all) || opts.hasFigure) codes.push('graph');
  if (NEGATION.test(stem)) codes.push('trap.negation');
  if (mcq && ABSOLUTE.test(`${body}\n${opts.optionText ?? ''}`.replace(ALL_ABOVE, ' '))) codes.push('trap.absolute');
  if (ALL_ABOVE.test(`${body}\n${opts.optionText ?? ''}`)) codes.push('trap.allabove');
  if (CONTRAST.test(all)) codes.push('trap.contrast');
  if (BEST.test(stem)) codes.push('trap.best');
  if (SCALE.test(all)) codes.push('trap.scale');
  if (SCENARIO.test(stem) || wordsOf(stem).length >= 45) codes.push('scenario');
  if (JUSTIFY.test(all)) codes.push('justify');
  return codes;
}

/** A teaching unit's codes: how it opens, and what it does. */
export function sectionCodes(first: string, all: string, opts: { hasFigure: boolean; equations: number }): string[] {
  const codes: string[] = [];
  const f = first.trim();
  if (f) {
    if (EXAMPLE.test(f.slice(0, 80)) || /^(example|e\.g\.)/i.test(f)) codes.push('intro.example');
    else if (/\?\s*$/.test(f) || MOTIVATION.test(f.slice(0, 90))) codes.push('intro.question');
    else if (DEFINITION.test(f) || (/^[A-Z][A-Za-z\- ]{2,40}:\s+\S/.test(f) && !STRUCTURAL.test(f))) codes.push('intro.definition');
    else codes.push('intro.statement');
  }
  if (EXAMPLE.test(all)) codes.push('example');
  if (ANALOGY.test(all)) codes.push('analogy');
  if (APPLICATION.test(all)) codes.push('application');
  if (WORKED.test(all) || /\n\s*(step\s*\d|solution)/i.test(all)) codes.push('worked');
  if (opts.equations > 0 || EQUATION.test(all)) codes.push('equation');
  if (LINK.test(all)) codes.push('link');
  if (OBJECTIVE.test(all)) codes.push('objective');
  if (RECAP.test(all)) codes.push('recap');
  if (CHECK.test(all)) codes.push('check');
  if (WHY.test(all)) codes.push('why');
  if (DEFINITION.test(all)) codes.push('definition');
  if (GRAPH.test(all) || opts.hasFigure) codes.push('graph');
  if (numberCount(all) >= 3) codes.push('num');
  return codes;
}

/** The terms a unit uses most, deduplicated (the profile counts in how many units each appears): at most 30. */
export function unitTerms(text: string, cap = 30): string[] {
  const n = new Map<string, number>();
  for (const p of phrasesIn(text)) n.set(p, (n.get(p) ?? 0) + 1);
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].split(' ').length - a[0].split(' ').length || a[0].localeCompare(b[0]))
    .slice(0, cap)
    .map(([t]) => t);
}

/** An assessment, cut into its questions. */
export function itemsOf(blocks: DocBlock[], cap = 60): Unit[] {
  const units: Unit[] = [];
  let cur: { start: DocBlock; label: string; stem: string; body: string[]; asks: string[]; options: number; parts: number; figure: boolean; optionText: string } | null = null;
  const close = () => {
    if (!cur) return;
    const body = cur.body.join('\n');
    const text = `${cur.stem}\n${body}`;
    if (!(INSTRUCTIONS.test(cur.stem) && !/\?/.test(text))) {
      const pts = POINTS.exec(text);
      const points = pts ? Number(pts[1] ?? pts[2] ?? pts[3]) : undefined;
      units.push({
        label: cur.label,
        kind: 'item',
        block: cur.start.id,
        page: cur.start.page,
        quote: clip(cur.stem.replace(Q_START, '').trim() || cur.stem),
        codes: itemCodes(cur.stem, body, { options: cur.options, parts: cur.parts, hasFigure: cur.figure, asks: cur.asks.join('\n'), optionText: cur.optionText }),
        terms: unitTerms(text),
        ...(points && points > 0 && points <= 500 ? { points } : {}),
        shingles: shinglesOf(text),
      });
    }
    cur = null;
  };
  for (const b of blocks) {
    if (units.length >= cap) break;
    const t = b.text.trim();
    const q = Q_START.exec(t);
    const option = OPTION.test(t) && t.length <= 160;
    const part = PART.test(t);
    // a numbered line inside a question's options is an option, not a new question
    if (q && !(cur && option && /^\s*\(?[a-e][.)]/i.test(t))) {
      close();
      const n = q[1] ?? q[2];
      // the stem up to its first lettered piece; the pieces themselves counted as options or parts
      const inline = lettered(t);
      const cut = inline.options || inline.parts ? t.search(/(?:^|\s)\(?[aA][.)]\s+/) : -1;
      cur = {
        start: b,
        label: `Q${n}`,
        stem: cut > 0 ? t.slice(0, cut).trim() : t,
        body: [],
        asks: inline.asks ? [inline.asks] : [],
        options: inline.options,
        parts: inline.parts,
        figure: b.kind === 'figure' || b.kind === 'table',
        optionText: inline.options ? t.slice(cut) : '',
      };
      continue;
    }
    if (!cur) continue;
    if (b.kind === 'heading' && /^(part|section)\s+([ivx]+|\d+|[a-d])\b/i.test(t)) {
      close();
      continue;
    }
    const inline = lettered(t);
    if (inline.options >= 3) {
      cur.options += inline.options;
      cur.optionText += `\n${t}`;
    } else if (inline.parts >= 2) {
      cur.parts += inline.parts;
      cur.asks.push(inline.asks);
    } else if (option && !IMPERATIVE.test(t) && t.length <= 110) cur.options++;
    else if (part || IMPERATIVE.test(t)) {
      cur.parts++;
      cur.asks.push(t);
    } else if (!option) cur.asks.push(t);
    if (b.kind === 'figure' || b.kind === 'table' || b.kind === 'equation') cur.figure = cur.figure || b.kind !== 'equation';
    if (cur.body.join('\n').length < 2400) cur.body.push(t);
  }
  close();
  return units;
}

/** Teaching material, cut into its slides (one a page) or its sections (by heading). */
export function sectionsOf(blocks: DocBlock[], bySlide: boolean, cap = 60): Unit[] {
  const groups: DocBlock[][] = [];
  if (bySlide) {
    const byPage = new Map<number, DocBlock[]>();
    for (const b of blocks) byPage.set(b.page, [...(byPage.get(b.page) ?? []), b]);
    groups.push(...[...byPage.keys()].sort((a, b) => a - b).map((p) => byPage.get(p)!));
  } else {
    let g: DocBlock[] = [];
    for (const b of blocks) {
      const heading = (b.kind === 'heading' && (b.level ?? 1) <= 3) || b.kind === 'title';
      if ((heading && g.length) || g.length >= 14) {
        groups.push(g);
        g = [];
      }
      g.push(b);
    }
    if (g.length) groups.push(g);
  }
  const units: Unit[] = [];
  for (const g of groups) {
    if (units.length >= cap) break;
    const head = g.find((b) => b.kind === 'heading' || b.kind === 'title');
    const body = g.filter((b) => b !== head && b.kind !== 'caption');
    const first = body.find((b) => b.kind === 'paragraph' || b.kind === 'list' || b.kind === 'quote')?.text ?? '';
    const text = g.map((b) => b.text).join('\n');
    if (wordsOf(text).length < 4) continue;
    const anchor = head ?? body[0] ?? g[0];
    const title = head ? clip(head.text, 70) : '';
    units.push({
      label: bySlide ? `Slide ${g[0].page}${title ? `: ${title}` : ''}` : title || `Page ${g[0].page}`,
      kind: 'section',
      block: anchor.id,
      page: anchor.page,
      quote: clip(first || text),
      codes: sectionCodes(first, text, { hasFigure: g.some((b) => b.kind === 'figure' || b.kind === 'table'), equations: g.filter((b) => b.kind === 'equation').length }),
      terms: unitTerms(text),
    });
  }
  return units;
}

// ── what a material says, counted ────────────────────────────────────

export function statsOf(blocks: DocBlock[]): MaterialStats {
  const s: MaterialStats = { sentences: 0, words: 0, longWords: 0, equations: 0, definitions: 0, examples: 0, analogies: 0, applications: 0, links: 0, objectives: 0, recaps: 0, checks: 0, worked: 0, why: 0 };
  for (const b of blocks) {
    if (b.kind === 'equation' || b.tex) s.equations++;
    if (b.kind === 'table' || b.kind === 'figure') continue;
    const t = b.text;
    const sents = sentencesOf(t);
    s.sentences += Math.max(sents.length, b.kind === 'list' ? 1 : 0);
    const ws = wordsOf(t);
    s.words += ws.length;
    s.longWords += ws.filter((w) => w.replace(/[^A-Za-z]/g, '').length >= 9).length;
    if (DEFINITION.test(t)) s.definitions++;
    if (EXAMPLE.test(t)) s.examples++;
    if (ANALOGY.test(t)) s.analogies++;
    if (APPLICATION.test(t)) s.applications++;
    if (LINK.test(t)) s.links++;
    if (OBJECTIVE.test(t)) s.objectives++;
    if (RECAP.test(t)) s.recaps++;
    if (CHECK.test(t)) s.checks++;
    if (WORKED.test(t)) s.worked++;
    if (WHY.test(t)) s.why++;
  }
  return s;
}

/** Abbreviations a material defines: "marginal revenue (MR)" — the letters must match the words. */
export function abbreviationsIn(text: string): [string, string][] {
  const out = new Map<string, string>();
  for (const m of text.matchAll(/\b([A-Za-z][A-Za-z\- ]{3,60}?)\s*\(([A-Z]{2,6})\)/g)) {
    const abbr = m[2];
    const words = m[1].trim().split(/\s+/);
    // take as many trailing words as the abbreviation has letters (skipping "of", "the", "and")
    const picked: string[] = [];
    for (let i = words.length - 1; i >= 0 && picked.filter((w) => !/^(of|the|and|in|to|for)$/i.test(w)).length < abbr.length; i--) picked.unshift(words[i]);
    const initials = picked
      .filter((w) => !/^(of|the|and|in|to|for)$/i.test(w))
      .map((w) => w[0].toUpperCase())
      .join('');
    if (initials === abbr && !out.has(abbr)) out.set(abbr, picked.join(' ').toLowerCase());
  }
  return [...out.entries()].slice(0, 24);
}

/** Terms a material defines in so many words. */
export function definedIn(blocks: DocBlock[]): string[] {
  const out = new Set<string>();
  const add = (t: string | undefined) => {
    const v = (t ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (v.length >= 4 && v.length <= 40 && v.split(' ').length <= 4 && !STOP.has(v)) out.add(v);
  };
  for (const b of blocks) {
    const t = b.text.trim();
    const gloss = /^([A-Z][A-Za-z\- ]{2,38})\s*[:–—]\s+(the|a|an|when|how|what|any|it|this)\b/i.exec(t);
    if (gloss && (b.kind === 'list' || b.kind === 'paragraph')) add(gloss[1]);
    for (const m of t.matchAll(/\b([a-z][a-z\- ]{2,38}?)\s+(?:is|are)\s+(?:defined as|called|known as)\b/gi)) add(m[1].split(/\s+/).slice(-3).join(' '));
    for (const m of t.matchAll(/\b(?:we call (?:this|it|these)|known as|is called|are called)\s+(?:a |an |the )?([a-z][a-z\- ]{2,38}?)(?=[.,;:)]|\s+(?:and|or|which|that|because)\b|$)/gi)) add(m[1]);
    for (const m of t.matchAll(/\b([a-z][a-z\- ]{2,38}?)\s+refers to\b/gi)) add(m[1].split(/\s+/).slice(-3).join(' '));
    if (out.size >= 40) break;
  }
  return [...out];
}

/** The terms a material keeps using, by in how many of its units they appear (then how often). */
export function termsOf(units: Unit[], cap = 60): [string, number][] {
  const df = new Map<string, number>();
  for (const u of units) for (const t of u.terms) df.set(t, (df.get(t) ?? 0) + 1);
  const ranked = [...df.entries()].filter(([t, n]) => n >= 2 || (t.includes(' ') && n >= 1 && units.length <= 3)).sort((a, b) => b[1] - a[1] || b[0].split(' ').length - a[0].split(' ').length || a[0].localeCompare(b[0]));
  // a word is dropped when a phrase holding it is about as common (keep "marginal cost", not "marginal" as well)
  const kept: [string, number][] = [];
  for (const [t, n] of ranked) {
    if (!t.includes(' ') && ranked.some(([p, m]) => p !== t && p.split(' ').includes(t) && m >= n * 0.6)) continue;
    if (t.split(' ').length === 3 && ranked.some(([p, m]) => p !== t && t.startsWith(`${p} `) && m >= n && p.split(' ').length === 2)) continue;
    kept.push([t, n]);
    if (kept.length >= cap) break;
  }
  return kept;
}

// ── what a syllabus says ─────────────────────────────────────────────

const STATED: [string, RegExp][] = [
  ['stated.format.mcq', /\bmultiple[- ]choice\b/i],
  ['stated.format.free', /\b(short[- ]answer|free[- ]response|written (responses?|answers?)|essay questions?|problems? to solve|problem[- ]solving questions?)\b/i],
  ['stated.format.essay', /\bessays?\b/i],
  ['stated.cumulative', /\bcumulative\b|\bcomprehensive (final|exam)\b/i],
  ['stated.calculator', /\bcalculators?\b/i],
  ['stated.graphs', /\b(graphs?|graphing|diagrams?)\b/i],
  ['stated.closed-book', /\bclosed[- ](book|notes)\b|\bno notes\b/i],
  ['stated.open-book', /\bopen[- ](book|notes)\b|\bformula sheet\b|\bcheat sheet\b|\bnote card\b/i],
  ['stated.applied', /\b(apply|application of) (the )?(concepts|material|theory)\b|\breal[- ]world (problems|applications|cases)\b/i],
  ['stated.conceptual', /\bconceptual (understanding|questions)\b|\bunderstand(ing)? (rather|not just)\b/i],
  ['stated.discussion', /\b(class )?discussions?\b|\bsocratic\b|\bactive learning\b|\bflipped\b|\bin[- ]class (activities|exercises|problems)\b/i],
  ['stated.cases', /\bcase stud(y|ies)\b/i],
  ['stated.objectives', /\blearning (outcomes|objectives)\b|\bstudents will be able to\b/i],
  ['stated.weights', /\b(exams?|midterms?|final|quiz(zes)?|homework|participation|projects?|labs?)\b[^.\n]{0,40}?\b\d{1,2}\s?%/i],
];

/** What a syllabus says about how the course will teach and assess, each with the block that says it. */
export function statedIn(doc: Pick<SourceDoc, 'id' | 'blocks'>): { code: string; evidence: Evidence }[] {
  const out: { code: string; evidence: Evidence }[] = [];
  const seen = new Set<string>();
  for (const b of doc.blocks.filter(usable)) {
    for (const [code, re] of STATED) {
      if (seen.has(code) || !re.test(b.text)) continue;
      // "graphs" and "calculators" count only where assessment is being described
      if ((code === 'stated.graphs' || code === 'stated.calculator') && !/\b(exam|quiz|test|midterm|final|assessment|question|allowed|permitted)\b/i.test(b.text)) continue;
      seen.add(code);
      out.push({ code, evidence: { doc: doc.id, block: b.id, page: b.page, quote: clip(b.text) } });
    }
  }
  return out;
}

// ── the digest ───────────────────────────────────────────────────────

export interface DigestOptions {
  /** what the person says it is (else read from the file) */
  kind?: MaterialKind;
  /** the person said they may use it (past exams and quizzes) */
  allowed?: boolean;
  now: number;
}

/** A material, digested: what the profile needs from it, so the file is not needed again. */
export function digestMaterial(doc: SourceDoc, opts: DigestOptions): MaterialDigest {
  const blocks = doc.blocks.filter(usable);
  const kind = opts.kind && isMaterialKind(opts.kind) ? opts.kind : kindOf(doc);
  const id = identityOf(doc);
  const material: Material = {
    doc: doc.id,
    name: doc.name.slice(0, 120),
    kind,
    kindFrom: opts.kind ? 'person' : 'read',
    ...(id.course ? { course: id.course } : {}),
    ...(id.title ? { title: id.title } : {}),
    ...(id.instructor ? { instructor: id.instructor } : {}),
    ...(id.term ? { term: id.term } : {}),
    ...(id.order ? { order: id.order } : {}),
    pages: Math.max(1, doc.pageCount || 1),
    addedAt: opts.now,
    ...(opts.allowed ? { allowed: true } : {}),
  };
  let units: Unit[];
  if (kind === 'exam' || kind === 'quiz' || kind === 'assignment') units = itemsOf(blocks);
  else if (kind === 'study-guide') {
    const items = itemsOf(blocks);
    units = items.length >= 3 ? items : sectionsOf(blocks, false);
  } else units = sectionsOf(blocks, kind === 'slides' && Math.max(1, doc.pageCount) > 1);
  const text = blocks.map((b) => b.text).join('\n');
  return {
    material,
    units,
    terms: termsOf(units),
    abbreviations: abbreviationsIn(text),
    defined: definedIn(blocks),
    stats: statsOf(blocks),
    stated: kind === 'syllabus' ? statedIn(doc) : [],
  };
}
