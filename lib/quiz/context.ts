// lib/quiz/context.ts — FINDING WHAT A QUIZ SHOULD BE MADE FROM, AND SAYING IT HONESTLY.
//
// The browser holds the student's materials (lib/docs) and course profiles (lib/teaching); a quiz request is
// matched against them here, before anything is sent:
//
//   named material   "from the Lecture 7 slides", "chapter 3", "my notes": the files whose names carry the same
//                    numbers and words (a number must match exactly: Lecture 7 is never Lecture 17). Nothing
//                    named that is not there is replaced by something else; it is said to be missing
//   past questions   past exams and quizzes shape the professor's style (lib/quiz/style.ts) but are never what a
//                    quiz is made from, so their questions are not copied into new ones
//   the notes        what Socria says when it makes a quiz, when it cannot, and when it needs to know which course
//
// PURE.

import type { SourceDoc } from '@/lib/docs/types';

const GENERIC = new Set(['the', 'my', 'a', 'an', 'of', 'from', 'slides', 'slide', 'deck', 'notes', 'note', 'reading', 'readings', 'file', 'files', 'pdf', 'only', 'on']);
const KIND_WORDS: Record<string, string[]> = { slides: ['slides', 'slide', 'deck'], notes: ['notes', 'note'], assignment: ['homework', 'hw', 'problem set', 'pset', 'assignment'], 'study-guide': ['study guide', 'review sheet'] };
const ALIAS: Record<string, string[]> = { lecture: ['lecture', 'lec', 'l'], chapter: ['chapter', 'ch', 'chap'], week: ['week', 'wk', 'w'], unit: ['unit', 'u'], module: ['module', 'mod', 'm'], section: ['section', 'sec', 's'] };

/** Does a file answer to what the student named ("lecture 7", "chapter 3 notes", "the slides")? */
export function docNamed(named: string, doc: Pick<SourceDoc, 'name' | 'title'>, kind?: string): boolean {
  const n = named.toLowerCase();
  const name = `${doc.title ?? ''} ${doc.name}`.toLowerCase().replace(/[_.-]+/g, ' ');
  const nums = n.match(/\d+/g) ?? [];
  // every number named is in the file's name, as a number on its own or glued to its word ("lec07", "L7", "ch3")
  for (const num of nums) {
    const v = String(Number(num));
    if (!new RegExp(`(?:^|[^0-9])0*${v}(?:[^0-9]|$)`).test(name)) return false;
  }
  // the word before a number ("lecture 7") must be the file's word for it, in any of its short forms
  const unitWord = Object.keys(ALIAS).find((w) => ALIAS[w].some((a) => new RegExp(`\\b${a}\\b`).test(n)));
  if (nums.length && unitWord && !ALIAS[unitWord].some((a) => new RegExp(`(?:\\b|\\d)${a}\\s*0*\\d`).test(name) || new RegExp(`\\b${a}\\w*\\b`).test(name))) return false;
  if (nums.length) return true;
  // no number: the material's kind ("the slides", "my notes"), or its distinctive words
  for (const [k, words] of Object.entries(KIND_WORDS)) if (words.some((w) => n.includes(w)) && (kind === k || words.some((w) => name.includes(w)))) return true;
  const words = n.split(/\s+/).filter((w) => w.length > 2 && !GENERIC.has(w));
  return words.length > 0 && words.every((w) => name.includes(w));
}

/** "A", "A and B", "A, B and C". */
export function listed(xs: readonly string[]): string {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** What Socria says when a quiz is ready: how many, on what, from what, in which mode — one or two lines. */
export function readyNote(q: { count: number; title: string; mode: 'practice' | 'marks' | 'exam'; sources: string[]; grounding: 'grounded' | 'mixed' | 'general'; style: 'observed' | 'inferred' | 'unknown'; course: string | null; missing: string[]; reason?: string }): string {
  // "an 8-question", "an 11-question", "an 18-question": the article goes by how the number is said
  const an = /^(8|11|18|8\d)$/.test(String(q.count)) ? 'an' : 'a';
  const what = q.reason === 'weak-spots' ? `${an === 'an' ? 'An' : 'A'} ${q.count}-question practice on what you missed` : q.reason === 'retest' ? `${q.count} questions like the one you missed` : `Here's ${an} ${q.count}-question quiz on ${q.title.toLowerCase()}`;
  const from = q.sources.length ? `, from ${listed(q.sources.slice(0, 2))}${q.sources.length > 2 ? ` and ${q.sources.length - 2} more` : ''}` : q.grounding === 'general' ? ', from general knowledge of the subject (no course material was available)' : '';
  const style = q.style === 'observed' && q.course ? ` The questions follow how ${q.course} has asked before — new questions, not a forecast of the exam.` : '';
  const mode = q.mode === 'exam' ? ' Exam conditions: results at the end.' : q.mode === 'marks' ? ' You\'ll see right or wrong as you go; explanations at the end.' : '';
  const gaps = q.missing.length ? ` ${q.missing[0]}` : '';
  return `${what}${from}.${style}${mode}${gaps}`.replace(/\.\./g, '.');
}
