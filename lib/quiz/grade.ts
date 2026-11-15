// lib/quiz/grade.ts — GRADING AN ANSWER, EXACTLY, AND SAYING WHAT A WRONG ONE MAY SHOW.
//
// Every question type is graded here, by rule, with no model call, so the same answer always gets the same
// grade — on the server, where the key is opened (app/api/logos/quiz/grade/route.ts), and in the tests.
//
//   single, truefalse   the option chosen is the right one
//   multi               all the right options and nothing else is right; some of the right ones and no wrong
//                       one is partial; any wrong one is wrong
//   numeric             the value, as typed in any ordinary way ("1,200", "$1.2k" no — "1200", "1.2e3", "3/4",
//                       "sqrt(2)", "25%"), within the key's tolerance; a unit typed with it must be the key's
//   expression          the same function: compared at a dozen points (so 2x and x*2 and x+x are all right)
//   short               one of the accepted answers once case, punctuation, articles and a plural s are set
//                       aside (one slip away is "close"); otherwise the key terms; when the words neither match
//                       nor clearly miss, the grade is "unsure" and the student checks it against the model answer
//
// A WRONG ANSWER IS READ CAREFULLY (lib/quiz/types.ts MistakeRead). What can be shown is said as shown: the
// right magnitude with the wrong sign, a decimal place, a percentage typed as a decimal — "confirmed". What a
// wrong option or a known wrong value suggests is a possibility — "plausible" — never a diagnosis. Anything else
// is "insufficient": one wrong answer is not evidence of a particular misunderstanding.
//
// PURE.

import { compileExpr } from '@/lib/logos-math';
import type { Grade, MistakeRead, QuestionType } from './types';

/** The secret half of a question (lib/quiz/types.ts): sealed by the server, opened only to grade. */
export interface QuestionKey {
  /** the quiz and question it belongs to: a key opened for another question is refused */
  quiz: string;
  qid: string;
  type: QuestionType;
  /** the quiz's mode, sealed in at creation: what a grade may reveal is decided by it (app/api/logos/quiz/grade) */
  mode?: 'practice' | 'marks' | 'exam';
  /** choice questions: the right option ids ("a", "c"); true/false: ["true"] or ["false"] */
  correct?: string[];
  /** numeric: the value, how close is right, and the unit it is asked in */
  value?: number;
  tolerance?: { abs?: number; rel?: number };
  unit?: string;
  /** expression: the right expression and its variables */
  expr?: string;
  vars?: string[];
  /** short answer: what is right, word for word; the terms a right answer must hold; a model answer to check against */
  accept?: string[];
  terms?: string[];
  model?: string;
  /** the right answer as the student should read it */
  answerText: string;
  /** one or two sentences: why it is right */
  why: string;
  /** a cue to reason with, for a first miss in practice: points the way without giving the answer */
  cue?: string;
  /** what each wrong option may suggest (choice questions), by option id */
  traps?: Record<string, { tag: string; note: string }>;
  /** what a known wrong value may suggest (numeric): the value a wrong method gives */
  wrongValues?: { value: number; tag: string; note: string }[];
}

export interface GradeResult {
  grade: Grade;
  mistake?: MistakeRead;
}

// ── reading what was typed ───────────────────────────────────────────

/** Lower case, no punctuation, no leading article, no trailing plural s, single spaces. */
export function normWords(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.%/+\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');
}

/** Edit distance, stopping early once it passes `cap`. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** The unit typed with a number, lower-cased and trimmed ("$", "%", "units", "kg"); empty when none. */
function unitOf(raw: string): string {
  const s = raw.trim();
  if (/^\$/.test(s)) return '$';
  const m = s.match(/[-+]?[\d.,]+(?:e[-+]?\d+)?\s*([a-z%$€£°/][a-z%°/ ]*)$/i);
  return m ? m[1].trim().toLowerCase() : '';
}

/**
 * A number from what was typed: "1,200", "$1200", "1200.00", "-3", "1.5e3", "3/4", "2.5%", "sqrt(2)", "pi/2".
 * A percentage keeps its percent sign apart (returned as `percent`), so 25% and 0.25 can be told apart. Null
 * when it is not a number.
 */
export function readNumber(raw: string): { value: number; percent: boolean; unit: string } | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/[−–—]/g, '-').replace(/\s+/g, ' ');
  if (!s || s.length > 80) return null;
  // a constant written after a number ("2pi") is part of the number, not its unit
  const unit0 = unitOf(s);
  const unit = /^(pi|e|tau)$/.test(unit0) ? '' : unit0;
  const percent = /%\s*$/.test(s);
  s = s.replace(/^[$€£]\s*/, '').replace(/%\s*$/, '');
  if (unit && unit !== '$' && unit !== '%') s = s.slice(0, s.toLowerCase().lastIndexOf(unit)).trim();
  // thousands separators: "1,200" and "1,200.50" — never a decimal comma inside a list
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return { value: Number(s), percent, unit };
  // a fraction, a root, π: the same safe evaluator the graphs use (no eval)
  const c = compileExpr(s, []);
  if (!c) return null;
  const v = c.eval({});
  return Number.isFinite(v) ? { value: v, percent, unit } : null;
}

const close = (a: number, b: number, tol: { abs?: number; rel?: number } | undefined) => {
  const abs = tol?.abs ?? 0;
  const rel = tol?.rel ?? (abs ? 0 : 1e-6);
  return Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b), 1e-12);
};

/** Units that mean the same thing when typed. */
const UNIT_SAME: Record<string, string> = { dollars: '$', dollar: '$', usd: '$', percent: '%', pct: '%', unit: 'units', items: 'units', item: 'units' };
const sameUnit = (a: string, b: string) => {
  const n = (u: string) => UNIT_SAME[u.toLowerCase().trim()] ?? u.toLowerCase().trim();
  return n(a) === n(b);
};

// ── grading ──────────────────────────────────────────────────────────

/** The answer ids of a choice answer ("a,c" → ["a","c"]), deduplicated. */
export const choiceIds = (answer: string): string[] => [...new Set((answer || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];

/** Grade one answer against its key. */
export function gradeAnswer(key: QuestionKey, answer: string): GradeResult {
  const a = typeof answer === 'string' ? answer.slice(0, 400) : '';
  switch (key.type) {
    case 'single':
    case 'truefalse': {
      const picked = choiceIds(a)[0] ?? '';
      if (!picked) return { grade: 'wrong', mistake: none() };
      if ((key.correct ?? []).includes(picked)) return { grade: 'right' };
      const trap = key.traps?.[picked];
      return { grade: 'wrong', mistake: trap ? { tag: trap.tag, note: trap.note, evidence: 'plausible' } : none() };
    }
    case 'multi': {
      const picked = choiceIds(a);
      const right = new Set(key.correct ?? []);
      const wrongPicks = picked.filter((p) => !right.has(p));
      const rightPicks = picked.filter((p) => right.has(p));
      if (!wrongPicks.length && rightPicks.length === right.size && right.size > 0) return { grade: 'right' };
      if (!wrongPicks.length && rightPicks.length) return { grade: 'partial', mistake: { tag: 'incomplete', note: 'Some of the right options, not all of them.', evidence: 'confirmed' } };
      const trap = wrongPicks.map((p) => key.traps?.[p]).find(Boolean);
      return { grade: 'wrong', mistake: trap ? { tag: trap.tag, note: trap.note, evidence: 'plausible' } : none() };
    }
    case 'numeric':
      return gradeNumber(key, a);
    case 'expression':
      return gradeExpression(key, a);
    case 'short':
      return gradeShort(key, a);
  }
  return { grade: 'wrong', mistake: none() };
}

const none = (): MistakeRead => ({ tag: 'unclear', note: 'One answer is not enough to say what went wrong.', evidence: 'insufficient' });

function gradeNumber(key: QuestionKey, raw: string): GradeResult {
  const target = key.value;
  if (typeof target !== 'number' || !Number.isFinite(target)) return { grade: 'unsure' };
  const got = readNumber(raw);
  if (!got) return { grade: 'wrong', mistake: { tag: 'not-a-number', note: 'That could not be read as a number.', evidence: 'confirmed' } };
  const keyPercent = key.unit === '%';
  // a unit typed with the answer must be the one asked for (a percent sign counts as the % unit)
  if (got.unit && key.unit && !sameUnit(got.unit, key.unit) && !(got.percent && keyPercent)) {
    if (close(got.value, target, key.tolerance)) return { grade: 'close', mistake: { tag: 'unit', note: `The number is right; the question asks for it in ${key.unit}.`, evidence: 'confirmed' } };
  }
  if (close(got.value, target, key.tolerance)) return { grade: 'right' };
  // the decimal form of a percentage, or the other way round: the right amount in the other form
  if (keyPercent && !got.percent && close(got.value * 100, target, key.tolerance))
    return { grade: 'close', mistake: { tag: 'percent-form', note: `That is ${target}% written as a decimal; the question asks for the percentage.`, evidence: 'confirmed' } };
  if (!keyPercent && got.percent && close(got.value / 100, target, key.tolerance))
    return { grade: 'close', mistake: { tag: 'percent-form', note: 'That is the right amount as a percentage; the question asks for the number itself.', evidence: 'confirmed' } };
  // the right magnitude with the wrong sign
  if (target !== 0 && close(-got.value, target, key.tolerance)) return { grade: 'wrong', mistake: { tag: 'sign', note: 'Right size, wrong sign.', evidence: 'confirmed' } };
  // a decimal place out (×10, ×100, ×1000 either way)
  for (const f of [10, 100, 1000]) {
    if (target !== 0 && (close(got.value * f, target, key.tolerance) || close(got.value / f, target, key.tolerance)))
      return { grade: 'wrong', mistake: { tag: 'decimal-place', note: `The digits are right but it is out by a factor of ${f}.`, evidence: 'confirmed' } };
  }
  // rounded too early or too far: within ten times the tolerance
  const tol = Math.max(key.tolerance?.abs ?? 0, (key.tolerance?.rel ?? 0) * Math.abs(target));
  if (tol > 0 && Math.abs(got.value - target) <= tol * 10)
    return { grade: 'wrong', mistake: { tag: 'rounding', note: 'Very near: check where you rounded.', evidence: 'confirmed' } };
  // the value a known wrong method gives: a possibility, not a diagnosis
  const known = (key.wrongValues ?? []).find((w) => close(got.value, w.value, key.tolerance ?? { rel: 1e-3 }));
  if (known) return { grade: 'wrong', mistake: { tag: known.tag, note: known.note, evidence: 'plausible' } };
  return { grade: 'wrong', mistake: none() };
}

/** Points to compare two expressions at: spread out, away from 0 and the integers where special cases hide. */
const SAMPLE_AT = [-2.7, -1.9, -1.3, -0.55, 0.37, 0.81, 1.23, 1.7, 2.3, 3.1, 4.4, 5.6];

/** Are two expressions the same function of their variables? Compared at a dozen points; at least six must be defined. */
export function sameExpression(a: string, b: string, vars: readonly string[] = ['x']): boolean {
  const ca = compileExpr(a, [...vars]);
  const cb = compileExpr(b, [...vars]);
  if (!ca || !cb) return false;
  let defined = 0;
  for (let i = 0; i < SAMPLE_AT.length; i++) {
    const scope: Record<string, number> = {};
    vars.forEach((v, j) => (scope[v] = SAMPLE_AT[(i + j * 5) % SAMPLE_AT.length]));
    const x = ca.eval(scope);
    const y = cb.eval(scope);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (Number.isFinite(x) !== Number.isFinite(y)) return false;
      continue;
    }
    defined++;
    if (Math.abs(x - y) > 1e-6 * Math.max(1, Math.abs(x), Math.abs(y))) return false;
  }
  return defined >= 6;
}

function gradeExpression(key: QuestionKey, raw: string): GradeResult {
  if (!key.expr) return { grade: 'unsure' };
  const vars = key.vars?.length ? key.vars : ['x'];
  const typed = raw.trim();
  if (!typed) return { grade: 'wrong', mistake: none() };
  if (!compileExpr(typed, vars)) return { grade: 'wrong', mistake: { tag: 'not-an-expression', note: `That could not be read as an expression in ${vars.join(', ')}.`, evidence: 'confirmed' } };
  if (sameExpression(typed, key.expr, vars)) return { grade: 'right' };
  if (sameExpression(`-(${typed})`, key.expr, vars)) return { grade: 'wrong', mistake: { tag: 'sign', note: 'Right expression, opposite sign.', evidence: 'confirmed' } };
  return { grade: 'wrong', mistake: none() };
}

function gradeShort(key: QuestionKey, raw: string): GradeResult {
  const said = normWords(raw);
  if (!said) return { grade: 'wrong', mistake: none() };
  const accepted = (key.accept ?? []).map(normWords).filter(Boolean);
  if (accepted.includes(said)) return { grade: 'right' };
  if (accepted.some((x) => editDistance(said, x, x.length > 8 ? 2 : 1) <= (x.length > 8 ? 2 : 1))) return { grade: 'close', mistake: { tag: 'spelling', note: 'Check the spelling.', evidence: 'confirmed' } };
  const terms = (key.terms ?? []).map(normWords).filter(Boolean);
  if (terms.length) {
    const held = terms.filter((t) => said.includes(t)).length;
    if (held === terms.length) return { grade: 'right' };
    if (held > 0 || said.split(' ').length >= 4) return { grade: 'unsure' };
    return { grade: 'wrong', mistake: none() };
  }
  // no terms to look for: a sentence is checked by the student against the model answer; a word that matches nothing is wrong
  return said.split(' ').length >= 3 ? { grade: 'unsure' } : { grade: 'wrong', mistake: none() };
}

/** Does a grade count as a right answer in the score? (A slip of form counts; a partial or an unsure one does not.) */
export const countsRight = (g: Grade | undefined | null, selfMark?: 'right' | 'wrong'): boolean => g === 'right' || g === 'close' || (g === 'unsure' && selfMark === 'right');

/**
 * WHAT A GRADE MAY SAY, by the quiz's mode (sealed into its key) — the server's rule, never the browser's:
 *
 *   practice   right: the answer and why. A first miss: a cue to reason with (and what the answer may show),
 *              never the answer — they try once more. A second miss: the answer and why. An answer the checker
 *              could not be sure of: the model answer, to check their own against.
 *   marks      right or not, nothing more, until the end.
 *   exam       nothing until the end (null: not graded one by one).
 *   the end    (final) everything: the grade, the answer, why, what a wrong answer may show.
 */
export function verdictFor(key: QuestionKey, answer: string, attempt: number, opts: { final?: boolean } = {}): { grade: Grade; correct?: string; why?: string; cue?: string; mistake?: MistakeRead } | null {
  const mode = key.mode ?? 'practice';
  const r = gradeAnswer(key, answer);
  const full = { grade: r.grade, correct: key.type === 'short' && r.grade === 'unsure' ? key.model ?? key.answerText : key.answerText, why: key.why, ...(r.mistake ? { mistake: r.mistake } : {}) };
  if (opts.final) return full;
  if (mode === 'exam') return null;
  if (mode === 'marks') return { grade: r.grade };
  if (r.grade === 'right' || r.grade === 'close' || r.grade === 'unsure') return full;
  if (attempt === 0) return { grade: r.grade, cue: key.cue || 'Look at the question again: what is it really asking for?', ...(r.mistake && r.mistake.evidence !== 'insufficient' ? { mistake: r.mistake } : {}) };
  return full;
}
