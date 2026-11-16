// lib/quiz/style.ts — HOW THIS PROFESSOR ASKS, AS FAR AS THE STUDENT'S MATERIALS SHOW.
//
// Built on the course profile (lib/teaching: one profile per course and instructor, every observation with its
// evidence, basis and confidence). A quiz takes from it what bears on asking questions — the formats and their
// shares, how often questions turn on a graph or a calculation, whether they ask to recall or to apply, the
// traps they set, how many steps they take, the course's own terms and the concepts it keeps returning to — and
// says, every time, how much that rests on:
//
//   observed   counted in past quizzes or exams the student added ("7 of 10 past questions are multiple choice")
//   inferred   read from lecture slides, examples, a syllabus's own claims, or too little evidence to count
//   unknown    nothing in the materials says
//
// A style from slides alone is never "observed". Nothing here claims to know what will be on an exam, and no
// past question's wording is used: only the reasoning it demands (lib/quiz/validate.ts checks for copying).
//
// PURE.

import type { CoursePack } from '@/lib/teaching/use';
import type { QuestionType } from './types';
import type { QuizScope } from './scope';

export type StyleBasis = 'observed' | 'inferred' | 'unknown';

export interface AssessmentStyle {
  basis: StyleBasis;
  /** the share of each format, from past questions when observed */
  formats: { single: number; truefalse: number; short: number; numeric: number } | null;
  graphs: 'often' | 'sometimes' | null;
  numbers: 'often' | 'sometimes' | 'rarely' | null;
  emphasis: 'apply' | 'understand' | 'recall' | null;
  steps: 'direct' | 'mixed' | 'multistep' | null;
  /** traps the course sets, said plainly */
  traps: string[];
  /** the course's own terms, to word questions in */
  terms: string[];
  /** concepts it keeps coming back to: term, weight, in how many past questions */
  concepts: { t: string; w: number; a: number }[];
  /** lines for the question writer, each tagged with its basis */
  guidance: string[];
  /** one sentence for the student: what was used, and on what basis */
  said: string;
}

const TRAP: Record<string, string> = {
  'trap.negation': 'questions that turn on a NOT, EXCEPT or LEAST',
  'trap.contrast': 'telling two related ideas apart',
  'trap.best': 'several plausible options with one best answer',
  'trap.scale': 'units or scale that change the answer',
  'trap.absolute': 'options that say always, never or only',
};

/** The professor's assessment style from a course pack (or none). */
export function styleOf(pack: CoursePack | null | undefined): AssessmentStyle {
  const empty: AssessmentStyle = { basis: 'unknown', formats: null, graphs: null, numbers: null, emphasis: null, steps: null, traps: [], terms: [], concepts: [], guidance: [], said: 'No past quizzes or exams are in your materials, so questions follow general good practice for the subject.' };
  if (!pack) return empty;
  // only what is at least moderately supported, or counted; never anything the student marked wrong (the pack holds none)
  const usable = pack.codes.filter((c) => c.c !== 'low' || c.b === 'observed');
  const get = (code: string) => usable.find((c) => c.code === code);
  const observed = (code: string) => get(code)?.b === 'observed';
  const anyObserved = usable.some((c) => c.b === 'observed' && /^(format|trap|graphs|numeric|recall|difficulty)\./.test(c.code));

  const mcq = get('format.mcq')?.s ?? 0;
  const tf = get('format.tf')?.s ?? 0;
  const free = get('format.free')?.s ?? 0;
  const calc = get('format.calc') ? 0.5 : 0;
  const formats = mcq + tf + free > 0 ? { single: mcq, truefalse: tf, short: free * (1 - calc), numeric: free * calc } : null;
  const graphs = get('graphs.frequent') ? 'often' : get('graphs.some') ? 'sometimes' : null;
  const numbers = get('numeric.frequent') ? 'often' : get('numeric.some') ? 'sometimes' : get('numeric.none') ? 'rarely' : null;
  const emphasis = get('recall.apply') ? 'apply' : get('recall.understand') ? 'understand' : get('recall.memory') ? 'recall' : null;
  const steps = (['multistep', 'mixed', 'direct'] as const).find((d) => get(`difficulty.${d}`)) ?? null;
  const traps = Object.keys(TRAP).filter((k) => get(k)).map((k) => TRAP[k]);

  const tag = (code: string) => (observed(code) ? 'observed in past questions' : get(code)?.b === 'stated' ? 'stated in the syllabus' : 'inferred');
  const guidance: string[] = [];
  if (formats) guidance.push(`Formats (${tag(mcq ? 'format.mcq' : 'format.free')}): about ${Math.round(mcq * 100)}% multiple choice, ${Math.round(free * 100)}% free response${tf ? `, ${Math.round(tf * 100)}% true/false` : ''}.`);
  if (graphs) guidance.push(`Graphs (${tag(graphs === 'often' ? 'graphs.frequent' : 'graphs.some')}): questions ${graphs === 'often' ? 'often' : 'sometimes'} turn on reading or drawing a graph.`);
  if (numbers) guidance.push(`Numbers (${tag(numbers === 'often' ? 'numeric.frequent' : numbers === 'sometimes' ? 'numeric.some' : 'numeric.none')}): questions ${numbers === 'rarely' ? 'rarely' : numbers} involve a calculation.`);
  if (emphasis) guidance.push(`Emphasis (${tag(`recall.${emphasis === 'apply' ? 'apply' : emphasis === 'understand' ? 'understand' : 'memory'}`)}): questions ask students to ${emphasis === 'apply' ? 'apply ideas to a scenario more than recall them' : emphasis === 'understand' ? 'explain why, not only what' : 'recall definitions and facts'}.`);
  if (steps) guidance.push(`Steps (${tag(`difficulty.${steps}`)}): questions are ${steps === 'multistep' ? 'mostly multi-step' : steps === 'direct' ? 'mostly direct, one step' : 'a mix of one-step and multi-step'}.`);
  for (const k of Object.keys(TRAP)) if (get(k)) guidance.push(`Trap (${tag(k)}): ${TRAP[k]} — use fairly, and name it in the explanation.`);
  if (pack.terms.length) guidance.push(`Use the course's own terms where they fit: ${pack.terms.slice(0, 10).join(', ')}.`);

  const basis: StyleBasis = anyObserved ? 'observed' : guidance.length ? 'inferred' : 'unknown';
  const said =
    basis === 'observed'
      ? `Questions follow how ${pack.label} has asked in the past quizzes and exams you added${formats ? ` (about ${Math.round(mcq * 100)}% multiple choice)` : ''}. They are new questions, not a prediction of the exam.`
      : basis === 'inferred'
        ? `Questions follow how ${pack.label} teaches, read from your slides and notes; no past quizzes or exams were added, so the format is a reasonable guess, not observed.`
        : empty.said;
  return { basis, formats, graphs, numbers, emphasis, steps, traps, terms: pack.terms.slice(0, 12), concepts: pack.concepts.slice(0, 12), guidance, said };
}

/**
 * The question types for a quiz of n questions: what the student asked for, else the course's own mix, else a
 * sensible default for the subject — mostly multiple choice, some calculation where the material has numbers,
 * a little short answer. True/false sparingly: it is a coin toss.
 */
export function planTypes(n: number, style: AssessmentStyle, scope: Pick<QuizScope, 'formats'>, quantitative: boolean): QuestionType[] {
  if (scope.formats?.length) return Array.from({ length: n }, (_, i) => scope.formats![i % scope.formats!.length]);
  const share = style.formats ?? { single: 0.7, truefalse: 0.05, short: quantitative ? 0.05 : 0.25, numeric: quantitative ? 0.2 : 0 };
  const total = share.single + share.truefalse + share.short + share.numeric || 1;
  const want: [QuestionType, number][] = [
    ['single', share.single / total],
    ['numeric', (quantitative || style.numbers === 'often' ? share.numeric : 0) / total],
    ['short', share.short / total],
    ['truefalse', share.truefalse / total],
  ];
  // largest remainder, so the shares add up to n exactly
  const counts = want.map(([t, w]) => ({ t, exact: w * n, n: Math.floor(w * n) }));
  let left = n - counts.reduce((a, c) => a + c.n, 0);
  for (const c of [...counts].sort((a, b) => b.exact - b.n - (a.exact - a.n))) {
    if (left <= 0) break;
    c.n++;
    left--;
  }
  const out: QuestionType[] = [];
  // interleave, so the formats are spread through the quiz
  while (out.length < n) {
    let moved = false;
    for (const c of counts) {
      if (c.n > 0 && out.length < n) {
        out.push(c.t);
        c.n--;
        moved = true;
      }
    }
    if (!moved) out.push('single');
  }
  return out;
}
