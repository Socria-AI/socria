// lib/quiz/validate.ts — EVERY GENERATED QUESTION CHECKED BEFORE A STUDENT SEES IT.
//
// A model writes the questions (lib/quiz/generate.ts); this decides, by rule and without another model call,
// which of them are fit to ask. A question that fails a check is dropped, with the reason counted, never
// quietly repaired into something else. What is checked:
//
//   the answer key      a choice question has exactly one right option (all that apply: two or more, not all);
//                       a numerical answer is a finite number with a tolerance, and its worked arithmetic
//                       (`calc`) gives that number; an expression compiles; a short answer has something to
//                       check against
//   ambiguity           no two options say the same thing; no "all of the above" or "none of the above"; a
//                       true/false statement is not hedged ("sometimes", "can")
//   giveaways           the right option's words are not in the stem; the right option is not conspicuously the
//                       longest; numerical options share one unit
//   the figure          every curve compiles over its range, every marked point is inside it, and a numerical
//                       answer said to come from the figure (an intersection) matches what the curves give
//   sources             a question said to come from the material points at a passage the material holds; in a
//                       quiz confined to named material, a question that points at none is dropped
//   honesty             no sentence predicts an exam (lib/teaching/use.ts predictsExam); a stem does not copy a
//                       past question's wording (five-word runs against the course's hashes)
//   repetition          no two questions, nor a question and one already asked in an earlier quiz, are near
//                       duplicates (word overlap)
//
// PURE.

import { compileExpr } from '@/lib/logos-math';
import { predictsExam } from '@/lib/teaching/use';
import { shinglesOf } from '@/lib/teaching/materials';
import { normWords, readNumber } from './grade';
import type { QuestionKey } from './grade';
import type { QuizFigure, QuizQuestion } from './types';
import { QUIZ_LIMITS } from './types';

/** A question as the model proposed it, with its key, before it is checked and sealed. */
export interface Candidate {
  q: Omit<QuizQuestion, 'sealed' | 'id'> & { id?: string };
  key: Omit<QuestionKey, 'quiz' | 'qid'>;
  /** the arithmetic that gives a numerical answer ("(100 - 20) / 4"), checked against the value */
  calc?: string;
  /** a numerical answer read off the figure: where two curves meet, on which axis */
  fromFigure?: { meet: [string, string]; axis: 'x' | 'y' };
  /** the source blocks it points at, as keys into the material shown ("1:p3.12") */
  cites: string[];
  /** index of the question this one is a variant of, in the model's list */
  variantOfIndex?: number;
}

export type Rejection =
  | 'stem'
  | 'options'
  | 'answer-key'
  | 'ambiguous'
  | 'giveaway'
  | 'units'
  | 'arithmetic'
  | 'figure'
  | 'ungrounded'
  | 'predicts-exam'
  | 'copied'
  | 'duplicate'
  | 'explanation';

export interface CheckContext {
  /** block keys the material shown holds ("1:p3.12") */
  knownBlocks: ReadonlySet<string>;
  /** the quiz is confined to named material: every question must point at some */
  strictSources: boolean;
  /** hashes of past questions' five-word runs (lib/teaching/use.ts CoursePack.avoid) */
  avoid: readonly number[];
  /** stems already asked (this quiz, and earlier quizzes on the same scope) */
  asked: readonly string[];
}

const BANNED_OPTION = /^(all|none|both|neither) of (the )?(above|these|the above)\b|^(a|b) and (b|c)$|^all are correct$/i;
const HEDGED_TF = /\b(sometimes|can be|may be|might|often|usually|generally|in some cases)\b/i;

/** Word-set overlap of two texts (Jaccard over normalised words, ignoring very short ones). */
export function overlap(a: string, b: string): number {
  const wa = new Set(normWords(a).split(' ').filter((w) => w.length > 2));
  const wb = new Set(normWords(b).split(' ').filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let both = 0;
  for (const w of wa) if (wb.has(w)) both++;
  return both / (wa.size + wb.size - both);
}

/** Where two curves meet within the figure's range, found numerically (null when they do not, or not once). */
export function meetOf(fig: QuizFigure, a: string, b: string): { x: number; y: number } | null {
  const ca = fig.curves.find((c) => c.id === a);
  const cb = fig.curves.find((c) => c.id === b);
  if (!ca || !cb) return null;
  const fa = compileExpr(ca.expr, ['x']);
  const fb = compileExpr(cb.expr, ['x']);
  if (!fa || !fb) return null;
  const d = (x: number) => fa.eval({ x }) - fb.eval({ x });
  const steps = 400;
  const found: number[] = [];
  let px = fig.x.min;
  let pd = d(px);
  for (let i = 1; i <= steps; i++) {
    const x = fig.x.min + ((fig.x.max - fig.x.min) * i) / steps;
    const dx = d(x);
    if (Number.isFinite(pd) && Number.isFinite(dx) && (pd === 0 || pd * dx < 0)) {
      let lo = px;
      let hi = x;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        if (d(lo) * d(mid) <= 0) hi = mid;
        else lo = mid;
      }
      found.push((lo + hi) / 2);
    }
    px = x;
    pd = dx;
  }
  const uniq = found.filter((x, i) => i === 0 || Math.abs(x - found[i - 1]) > 1e-6);
  if (uniq.length !== 1) return null;
  const x = uniq[0];
  return { x, y: fa.eval({ x }) };
}

/** Is a figure drawable and honest: every curve defined across most of its range, every point inside it? */
export function figureOk(fig: QuizFigure): boolean {
  if (fig.kind !== 'curves') return false;
  if (!(fig.x.max > fig.x.min) || !(fig.y.max > fig.y.min)) return false;
  if (!fig.curves.length || fig.curves.length > QUIZ_LIMITS.curves) return false;
  for (const c of fig.curves) {
    const f = compileExpr(c.expr, ['x']);
    if (!f || !c.label.trim()) return false;
    let defined = 0;
    for (let i = 0; i <= 40; i++) {
      const v = f.eval({ x: fig.x.min + ((fig.x.max - fig.x.min) * i) / 40 });
      if (Number.isFinite(v)) defined++;
    }
    if (defined < 30) return false;
  }
  for (const p of fig.points ?? []) if (p.x < fig.x.min || p.x > fig.x.max || p.y < fig.y.min || p.y > fig.y.max || !p.label.trim()) return false;
  return true;
}

const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).filter(Boolean);

/** Check one candidate. Returns the reason it fails, or null when it is fit to ask. */
export function checkCandidate(c: Candidate, ctx: CheckContext): Rejection | null {
  const { q, key } = c;
  const stem = (q.stem || '').trim();
  if (stem.length < 12 || stem.length > QUIZ_LIMITS.stem) return 'stem';
  if (!key.why || key.why.trim().length < 12) return 'explanation';
  // honesty: never a prediction of an exam, in the stem, the explanation or the cue
  if ([stem, key.why, key.cue ?? ''].some((s) => sentences(s).some(predictsExam))) return 'predicts-exam';

  const opts = q.options ?? [];
  if (q.type === 'single' || q.type === 'multi') {
    if (opts.length < (q.type === 'multi' ? 4 : 3) || opts.length > QUIZ_LIMITS.options) return 'options';
    if (opts.some((o) => !o.text.trim() || o.text.length > QUIZ_LIMITS.option || BANNED_OPTION.test(o.text.trim()))) return 'options';
    // the same words with different punctuation are the same option ("…one more unit" and "…one more unit.");
    // a decimal point between digits is kept, so 1.5 and 15 stay apart
    const normed = opts.map((o) => normWords(o.text).replace(/(?<!\d)\.|\.(?!\d)/g, '').replace(/\s+/g, ' ').trim());
    if (new Set(normed).size !== normed.length) return 'ambiguous';
    // two numerical options that are the same number written two ways
    const nums = opts.map((o) => readNumber(o.text)?.value);
    const numeric = nums.every((v) => typeof v === 'number');
    if (numeric && new Set(nums.map((v) => (v as number).toPrecision(9))).size !== nums.length) return 'ambiguous';
    const right = key.correct ?? [];
    if (q.type === 'single' && right.length !== 1) return 'answer-key';
    if (q.type === 'multi' && (right.length < 2 || right.length >= opts.length)) return 'answer-key';
    if (right.some((id) => !opts.some((o) => o.id === id))) return 'answer-key';
    // giveaways: the right option's words in the stem; the right option conspicuously longest
    for (const id of right) {
      const text = opts.find((o) => o.id === id)!.text;
      if (normWords(text).length >= 10 && normWords(stem).includes(normWords(text))) return 'giveaway';
    }
    if (q.type === 'single') {
      const lens = opts.map((o) => o.text.length);
      const rightLen = opts.find((o) => o.id === right[0])!.text.length;
      const others = lens.filter((_, i) => opts[i].id !== right[0]);
      const mean = others.reduce((a, b) => a + b, 0) / Math.max(1, others.length);
      if (rightLen > 40 && rightLen > mean * 2.2) return 'giveaway';
    }
    // numerical options share one unit
    if (numeric) {
      const units = new Set(opts.map((o) => readNumber(o.text)!.unit || (/%\s*$/.test(o.text) ? '%' : '')));
      if (units.size > 1) return 'units';
    }
    // a worked calculation for a numerical right option must give it
    if (c.calc && numeric && q.type === 'single') {
      const v = calcValue(c.calc);
      const rv = nums[opts.findIndex((o) => o.id === right[0])] as number;
      if (v === null || Math.abs(v - rv) > Math.max(1e-6, Math.abs(rv) * 0.005)) return 'arithmetic';
    }
  } else if (q.type === 'truefalse') {
    const right = key.correct ?? [];
    if (right.length !== 1 || !['true', 'false'].includes(right[0])) return 'answer-key';
    if (HEDGED_TF.test(stem)) return 'ambiguous';
  } else if (q.type === 'numeric') {
    if (typeof key.value !== 'number' || !Number.isFinite(key.value)) return 'answer-key';
    const tol = key.tolerance;
    if (tol && ((tol.abs !== undefined && !(tol.abs >= 0)) || (tol.rel !== undefined && !(tol.rel >= 0 && tol.rel <= 0.1)))) return 'answer-key';
    if (c.calc) {
      const v = calcValue(c.calc);
      if (v === null || Math.abs(v - key.value) > Math.max(1e-6, Math.abs(key.value) * 0.005, tol?.abs ?? 0)) return 'arithmetic';
    }
  } else if (q.type === 'expression') {
    if (!key.expr || !compileExpr(key.expr, key.vars?.length ? key.vars : ['x'])) return 'answer-key';
  } else if (q.type === 'short') {
    if (!(key.accept?.length || key.terms?.length) || !key.model) return 'answer-key';
  }

  if (q.figure) {
    if (!figureOk(q.figure)) return 'figure';
    if (c.fromFigure) {
      const m = meetOf(q.figure, c.fromFigure.meet[0], c.fromFigure.meet[1]);
      if (!m) return 'figure';
      const target = c.fromFigure.axis === 'x' ? m.x : m.y;
      const stated = q.type === 'numeric' ? key.value : q.type === 'single' ? readNumber(opts.find((o) => o.id === (key.correct ?? [])[0])?.text ?? '')?.value : undefined;
      if (typeof stated !== 'number' || Math.abs(stated - target) > Math.max(0.01, Math.abs(target) * 0.01)) return 'figure';
    }
  }

  // sources: a citation must be to a passage the material holds; in a confined quiz, every question cites one
  const cited = c.cites.filter((k) => ctx.knownBlocks.has(k));
  if (c.cites.length && !cited.length) return 'ungrounded';
  if (ctx.strictSources && !cited.length) return 'ungrounded';

  // copied wording: a stem that shares several five-word runs with a past question is not a new question
  if (ctx.avoid.length) {
    const set = new Set(ctx.avoid);
    const runs = shinglesOf(stem);
    const shared = runs.filter((h) => set.has(h)).length;
    if (runs.length && (shared >= 3 || shared / runs.length > 0.4)) return 'copied';
  }
  if (ctx.asked.some((s) => overlap(s, stem) >= 0.75)) return 'duplicate';
  return null;
}

/** The value of a worked calculation, by the safe evaluator; null when it is not plain arithmetic. */
export function calcValue(calc: string): number | null {
  if (typeof calc !== 'string' || calc.length > 200) return null;
  const f = compileExpr(calc.replace(/[$,]/g, ''), []);
  if (!f) return null;
  const v = f.eval({});
  return Number.isFinite(v) ? v : null;
}

/** Keep an explanation to what the review shows: at most two sentences, within the limit. */
export function brief(text: string, max = QUIZ_LIMITS.why): string {
  const s = sentences((text || '').replace(/\s+/g, ' ').trim()).slice(0, 2).join(' ');
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
