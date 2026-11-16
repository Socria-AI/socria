// lib/quiz/generate.ts — WRITING A QUIZ FROM THE STUDENT'S OWN MATERIAL.
//
// One model call writes the questions (app/api/logos/quiz/route.ts); everything around it is here, in code:
//
//   the brief      the material as numbered passages (lib/logos5/study.ts materialFor: the file's own words,
//                  each with its block key), what the student asked for (lib/quiz/scope.ts), the professor's
//                  style with its basis (lib/quiz/style.ts), what to aim at and why (the learning ledger and
//                  the course's emphasis), the types to write, and what has already been asked
//   the reading    the model's JSON, read field by field and clipped; nothing it says is taken on trust
//   the checks     every question through lib/quiz/validate.ts; a question that fails is dropped and counted
//   the shape      options shuffled with the right answer spread evenly across positions (so position says
//                  nothing), ids made positional, sources turned into the passages' own words with their page,
//                  and each question split into what the student sees and its key
//
// The route seals the keys (lib/quiz/seal.ts) before anything reaches the browser.
//
// PURE.

import type { SourceDoc } from '@/lib/docs/types';
import { blockKey, materialFor, parseKey, studyBlocks, verbatimFrom } from '@/lib/logos5/study';
import { brief, checkCandidate, type Candidate, type Rejection } from './validate';
import type { QuestionKey } from './grade';
import { planTypes, type AssessmentStyle } from './style';
import type { QuizScope } from './scope';
import { DEMANDS, QUESTION_TYPES, QUIZ_LIMITS, type Demand, type Difficulty, type QuestionType, type QuizBasis, type QuizFigure, type QuizQuestion, type SourceRef } from './types';

export interface GenerateInput {
  /** the student's words */
  request: string;
  scope: QuizScope;
  /** how many questions to ask */
  count: number;
  docs: SourceDoc[];
  style: AssessmentStyle;
  /** what to aim at first, in order, with why */
  targets: QuizBasis['targets'];
  /** stems already asked on this scope (earlier quizzes), never to be asked again */
  avoidStems: string[];
  /** hashes of past questions' five-word runs */
  avoidHashes: number[];
  /** the course, when one applies */
  course: { name: string; instructor: string | null } | null;
  /** the conversation's topic in a line, when there is one */
  topicHint?: string;
  /** a quiz that follows on from another: practise the weak spots, or another on the same scope */
  reason?: 'weak-spots' | 'another' | 'request';
  /** quantitative material (numbers in it, or a quantitative course): numerical questions fit */
  quantitative: boolean;
  /** the types to write, in order (one part of a quiz written in parts); otherwise planned from count and style */
  plan?: QuestionType[];
  /** how many variants to write after them; otherwise variantsFor(count, mode) */
  variants?: number;
  /** one part of a quiz written in parts at the same time: which part, and the concepts each part aims at */
  part?: { index: number; of: number; aim: string[]; others: string[] };
}

/** How many variants (held-back retest questions) to ask for: the concepts that matter most, not every one. */
export const variantsFor = (count: number, mode: QuizScope['mode']) => (mode === 'exam' ? 0 : Math.min(6, Math.ceil(count / 2)));

/** Questions per part when a quiz is written in parts at the same time: small enough to finish quickly and whole. */
export const PART_SIZE = 4;

/**
 * A quiz written in parts at the same time (app/api/logos/quiz/route.ts): each part a few questions and their
 * variants, so every call is short, finishes inside the time limit, and a part that fails costs only its own.
 */
export function partsOf(types: readonly QuestionType[], mode: QuizScope['mode']): { plan: QuestionType[]; variants: number }[] {
  const n = types.length;
  if (!n) return [];
  // at most five calls at once, however long the quiz
  const parts = Math.min(5, Math.ceil(n / PART_SIZE));
  const size = Math.ceil(n / parts);
  const out: { plan: QuestionType[]; variants: number }[] = [];
  let left = variantsFor(n, mode);
  for (let i = 0; i < n; i += size) {
    const plan = types.slice(i, i + size);
    const v = Math.min(left, Math.ceil(variantsFor(n, mode) * (plan.length / n)));
    left -= v;
    out.push({ plan, variants: v });
  }
  return out;
}

/** The parts' candidates as one list: each part's "variant_of" moved to where its questions now stand. */
export function mergeParts(parts: { title: string; candidates: Candidate[] }[]): { title: string; candidates: Candidate[] } {
  const candidates: Candidate[] = [];
  let title = '';
  for (const p of parts) {
    const base = candidates.length;
    if (!title && p.title) title = p.title;
    for (const c of p.candidates) candidates.push(c.variantOfIndex === undefined ? c : { ...c, variantOfIndex: c.variantOfIndex + base });
  }
  return { title, candidates };
}

const TYPE_SAID: Record<QuestionType, string> = {
  single: 'single (one right option of 4)',
  multi: 'multi (choose all that apply: 4–5 options, 2–3 right)',
  truefalse: 'truefalse',
  numeric: 'numeric (a number, with its unit and tolerance, and the arithmetic in "calc")',
  expression: 'expression (an expression in x, e.g. a derivative)',
  short: 'short (a word or phrase; give accepted answers, key terms and a model answer)',
};

/** The brief for the question writer: system and user text. */
export function quizPrompt(input: GenerateInput): { system: string; user: string; shown: number } {
  const types = input.plan?.length ? input.plan : planTypes(input.count, input.style, input.scope, input.quantitative);
  const variants = input.variants ?? variantsFor(input.count, input.scope.mode);
  const mat = materialFor(input.docs, 26_000);
  const grounded = input.docs.length > 0;
  const strict = input.scope.strictSources;

  const system = [
    'You write quiz questions for one student, as a careful teacher of the subject would. Output only JSON.',
    '',
    'WHAT MAKES A GOOD QUESTION',
    '- It tests understanding of one concept, has exactly one defensible answer, and is answerable by a student who knows the idea — no trick wording, no reading-comprehension puzzles.',
    '- Distractors are plausible: each is what a student with a specific, common misunderstanding would choose. Same length and style as the right option. No "all/none of the above", no two options that mean the same thing, no option that is absurd.',
    '- The stem never contains the answer or a hint to it. Numerical options all use the same unit.',
    '- For every wrong option, give "trap": what choosing it MAY suggest, as a possibility ("may be mixing up…"), never a diagnosis.',
    '- Numerical answers: give the value, its unit, a tolerance, and "calc" — the arithmetic that gives the value, as a plain expression (e.g. "(100 - 20) / 2"). Check it.',
    '- "explanation": one or two sentences — why the right answer is right. "cue": one sentence that points the way to reason it out WITHOUT giving the answer.',
    '- Graph questions only where a graph is what the concept is about (supply and demand, cost curves, a function). Give the figure as curves with expressions in x over a sensible range; never put the answer on the figure as a label. If a numerical answer is where two curves meet, say so in "from_figure".',
    '- Never say or suggest that a question will be on an exam. Never copy wording from past exams or quizzes: new questions that make the same reasoning demands.',
    '',
    'SOURCES',
    grounded
      ? strict
        ? '- Every question must come from the material below and cite the passages it rests on ("sources": block keys like "1:p3.12"). Do not use general knowledge. If the material cannot support the number asked for, write fewer.'
        : input.scope.allowGeneral
          ? '- Prefer the material below and cite the passages each question rests on. General-knowledge questions are allowed: give them "sources": [] and "general": true.'
          : '- Every question must come from the material below and cite the passages it rests on ("sources": block keys like "1:p3.12"). If the material cannot support the number asked for, write fewer.'
      : '- There is no material for this quiz. Write questions from general knowledge of the subject, with "sources": [] and "general": true.',
    '',
    'JSON SHAPE',
    '{"title": "a short title for the quiz",',
    ' "questions": [{',
    '   "concept": "the one concept tested, lower case", "topic": "the topic as the course names it",',
    '   "type": "single|multi|truefalse|numeric|expression|short", "difficulty": 1|2|3, "demand": "recall|application|transfer",',
    '   "stem": "the question; $...$ for mathematics",',
    '   "options": [{"text": "...", "correct": true} , {"text": "...", "trap": {"tag": "short-code", "note": "what choosing it may suggest"}}],',
    '   "answer": {"value": 40, "unit": "$", "tolerance": {"abs": 0.5}, "calc": "(100 - 20) / 2"} | {"expr": "2*x", "vars": ["x"]} | {"accept": ["..."], "terms": ["..."], "model": "a model answer"} | {"value": true},',
    '   "wrong_values": [{"value": 60, "tag": "short-code", "note": "what this value may suggest"}],',
    '   "figure": {"title": "...", "x": {"label": "Quantity", "min": 0, "max": 50}, "y": {"label": "Price", "min": 0, "max": 100}, "curves": [{"id": "D", "label": "Demand", "expr": "100 - 2*x"}], "points": [{"label": "A", "x": 20, "y": 60}]},',
    '   "from_figure": {"meet": ["D", "S"], "axis": "x"},',
    '   "explanation": "...", "cue": "...", "sources": ["1:p3.12"], "general": false,',
    '   "variant_of": null',
    ' }]}',
    'Leave out fields that do not apply. "variant_of" is the index (from 0) of an earlier question in this list that this one is a second, different question on the SAME concept for — held back to retest it later. A variant is never a rewording: a different situation, numbers or angle.',
  ].join('\n');

  const lines: string[] = [];
  lines.push(`The student asked: "${input.request.slice(0, 400)}"`);
  if (input.course) lines.push(`Course: ${input.course.name}${input.course.instructor ? ` (${input.course.instructor})` : ''}.`);
  if (input.topicHint) lines.push(`The conversation has been about: ${input.topicHint.slice(0, 200)}`);
  if (input.scope.forAssessment) lines.push(`It is for: ${input.scope.forAssessment}.`);
  if (input.scope.topics.length) lines.push(`Only these topics: ${input.scope.topics.join('; ')}.`);
  if (input.scope.exclude.length) lines.push(`Leave out: ${input.scope.exclude.join('; ')}.`);
  if (input.scope.difficulty) lines.push(`Difficulty: ${input.scope.difficulty === 'mixed' ? 'a mix of 1, 2 and 3' : input.scope.difficulty === 'harder' ? 'mostly 3, some 2' : 'mostly 1, some 2'}.`);
  lines.push('');
  lines.push(`Write ${types.length} questions, in this order of types: ${types.map((t) => TYPE_SAID[t]).join('; ')}.`);
  if (input.part && input.part.of > 1) {
    lines.push(
      `This is part ${input.part.index + 1} of ${input.part.of} of one quiz; the other parts are being written at the same time.` +
        (input.part.aim.length ? ` This part covers: ${input.part.aim.join('; ')}.` : ' Choose concepts the other parts are unlikely to choose: a different aspect of the subject in each question.') +
        (input.part.others.length ? ` The other parts cover: ${input.part.others.join('; ')} — do not ask about those.` : '')
    );
  }
  if (variants) lines.push(`Then write ${variants} more: variants ("variant_of") of the earlier questions on the concepts that matter most below — held back to retest after a miss.`);
  if (input.reason === 'weak-spots') lines.push('This is targeted practice on what the student missed: aim every question at the concepts below, with new situations — never the questions they already saw.');
  if (input.reason === 'another') lines.push('This is another quiz on the same scope: cover it again with new questions, a little harder on what they got right.');
  if (input.targets.length) {
    lines.push('');
    lines.push('Aim at these concepts first, in this order:');
    for (const t of input.targets.slice(0, 8)) lines.push(`- ${t.concept} (${TARGET_WHY[t.why]})`);
  }
  if (input.style.guidance.length) {
    lines.push('');
    lines.push(`How this course asks (${input.style.basis}; follow it where it fits, do not copy past wording):`);
    for (const g of input.style.guidance) lines.push(`- ${g}`);
  }
  if (input.avoidStems.length) {
    lines.push('');
    lines.push('Already asked — do not ask these again or reword them:');
    for (const s of input.avoidStems.slice(0, 30)) lines.push(`- ${s.replace(/\s+/g, ' ').slice(0, 160)}`);
  }
  if (grounded) {
    lines.push('');
    lines.push(`MATERIAL (${mat.shown} passages${mat.left ? `; ${mat.left} more not shown` : ''}):`);
    lines.push(mat.text);
  }
  return { system, user: lines.join('\n'), shown: mat.shown };
}

const TARGET_WHY: Record<QuizBasis['targets'][number]['why'], string> = {
  asked: 'what the student asked for',
  missed: 'they have missed it before',
  due: 'due for review',
  emphasis: 'the course keeps coming back to it',
  unseen: 'not practised yet',
  scope: 'in the scope asked for',
};

// ── reading the model's answer ───────────────────────────────────────

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const numOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** The JSON in a model's reply: the object itself, or the first {...} block (fenced or not). */
export function jsonIn(raw: string): unknown {
  if (typeof raw !== 'string') return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1] : raw;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function figureOf(v: unknown): QuizFigure | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const f = v as Record<string, any>;
  const axis = (a: any) => (a && typeof a === 'object' && numOf(a.min) !== undefined && numOf(a.max) !== undefined ? { label: str(a.label, 40) || ' ', min: numOf(a.min)!, max: numOf(a.max)! } : null);
  const x = axis(f.x);
  const y = axis(f.y);
  const curves = Array.isArray(f.curves)
    ? f.curves
        .slice(0, QUIZ_LIMITS.curves)
        .map((c: any, i: number) => ({ id: str(c?.id, 12) || `c${i}`, label: str(c?.label, 40), expr: str(c?.expr, QUIZ_LIMITS.expr), ...(c?.dashed ? { dashed: true } : {}) }))
        .filter((c: any) => c.expr)
    : [];
  if (!x || !y || !curves.length) return undefined;
  const points = Array.isArray(f.points)
    ? f.points
        .slice(0, QUIZ_LIMITS.points)
        .map((p: any) => ({ label: str(p?.label, 8), x: numOf(p?.x) ?? NaN, y: numOf(p?.y) ?? NaN }))
        .filter((p: any) => p.label && Number.isFinite(p.x) && Number.isFinite(p.y))
    : undefined;
  return { kind: 'curves', ...(str(f.title, 60) ? { title: str(f.title, 60) } : {}), x, y, curves, ...(points?.length ? { points } : {}) };
}

/** Read the model's questions into candidates (unchecked). */
/**
 * What can still be read from JSON cut off at the token limit: the title, and every question object in the list
 * that arrived whole. A string-aware scan, so braces inside a question's words do not mislead it.
 */
export function salvageQuiz(text: string): { title: string; questions: unknown[] } | null {
  if (typeof text !== 'string') return null;
  const title = text.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? '';
  const at = text.search(/"(questions|items)"\s*:\s*\[/);
  if (at < 0) return null;
  const questions: unknown[] = [];
  let i = text.indexOf('[', at) + 1;
  let depth = 0;
  let start = -1;
  let inString = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          questions.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          // a malformed one is skipped; the rest may be whole
        }
        start = -1;
      }
    } else if (ch === ']' && depth === 0) break;
  }
  return questions.length ? { title: title.replace(/\\"/g, '"'), questions } : null;
}

const TYPE_WORDS: Record<string, QuestionType> = {
  single: 'single', mcq: 'single', mc: 'single', multiplechoice: 'single', choice: 'single', singlechoice: 'single', singleanswer: 'single', singleselect: 'single',
  multi: 'multi', multiple: 'multi', multipleselect: 'multi', multiselect: 'multi', selectall: 'multi', selectallthatapply: 'multi', checkbox: 'multi', checkboxes: 'multi', multipleanswer: 'multi', multipleresponse: 'multi', chooseall: 'multi',
  truefalse: 'truefalse', tf: 'truefalse', boolean: 'truefalse', trueorfalse: 'truefalse',
  numeric: 'numeric', number: 'numeric', numerical: 'numeric', calculation: 'numeric', calc: 'numeric', numericanswer: 'numeric',
  expression: 'expression', formula: 'expression', symbolic: 'expression', algebraic: 'expression',
  short: 'short', shortanswer: 'short', freeresponse: 'short', open: 'short', openended: 'short', text: 'short', written: 'short', fillin: 'short', fillintheblank: 'short', fillblank: 'short', cloze: 'short',
};

/** A citation as a model may write it ("[1:p3.12]", "1 : P3.12", "doc 1, p3.12", "p3.12"): the passage key, or the bare block when no file is named. */
export function citeOf(v: unknown): string {
  const s = textOf(v).trim();
  const both = s.match(/(\d{1,2})\D{0,8}?(p\d{1,4}\.\d{1,5})/i);
  if (both) return `${Number(both[1])}:${both[2].toLowerCase()}`;
  const bare = s.match(/^[[(\s]*(p\d{1,4}\.\d{1,5})[\])\s]*$/i);
  return bare ? bare[1].toLowerCase() : '';
}

const firstOf = (...vs: unknown[]) => vs.find((v) => v !== undefined && v !== null && v !== '');
const textOf = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const truthy = (v: unknown) => v === true || v === 'true' || v === 1;

/** Which option a marker names: a letter ("B", "(b)", "b)") or the option's own words; never a bare number (0- or 1-based is a guess, and a wrong key is worse than none). */
function optionNamed(marker: unknown, texts: string[]): number {
  const s = textOf(marker).trim();
  if (!s) return -1;
  const letter = s.match(/^\(?([a-f])[).:]?$/i);
  if (letter) {
    const i = letter[1].toLowerCase().charCodeAt(0) - 97;
    return i < texts.length ? i : -1;
  }
  const norm = (x: string) => x.toLowerCase().replace(/^\(?[a-f][).:]\s+/i, '').replace(/[^a-z0-9.%$-]+/g, ' ').trim();
  const want = norm(s);
  const hit = texts.findIndex((t) => norm(t) === want);
  return hit;
}

/**
 * One question as a model may write it, put into the shape asked for: the ordinary other names for its fields and
 * types, options as plain strings, the right option named by letter or by its words, a true/false answer in its
 * options, a bare number or phrase as the answer. Nothing is guessed that could make a key wrong.
 */
export function normaliseItem(raw: unknown): Record<string, any> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const it: Record<string, any> = { ...(raw as Record<string, any>) };
  it.stem = firstOf(it.stem, it.question, it.prompt, it.q, typeof it.text === 'string' && !it.options ? it.text : undefined);
  it.explanation = firstOf(it.explanation, it.why, it.rationale, it.reason, it.feedback, it.answer && typeof it.answer === 'object' ? it.answer.explanation : undefined);
  it.cue = firstOf(it.cue, it.hint);
  it.sources = firstOf(it.sources, it.citations, it.cites);
  if (Array.isArray(it.sources)) it.sources = it.sources.map(citeOf).filter(Boolean);
  if (typeof it.variant_of === 'string' && /^\d+$/.test(it.variant_of)) it.variant_of = Number(it.variant_of);
  if (it.variant_of === undefined && Number.isInteger(it.variantOf)) it.variant_of = it.variantOf;
  const d = textOf(it.difficulty).toLowerCase();
  if (d) it.difficulty = d === 'easy' || d === 'low' ? 1 : d === 'medium' || d === 'moderate' ? 2 : d === 'hard' || d === 'high' || d === 'difficult' ? 3 : it.difficulty;
  const dm = textOf(it.demand).toLowerCase();
  if (dm) it.demand = /recall|remember|knowledge|define/.test(dm) ? 'recall' : /transfer|analy|evaluat|synthes|creat/.test(dm) ? 'transfer' : /appl/.test(dm) ? 'application' : it.demand;

  // options: strings or objects, the right one flagged in any of the ordinary ways
  if (Array.isArray(it.options)) {
    it.options = it.options.map((op: any) =>
      typeof op === 'string' || typeof op === 'number'
        ? { text: String(op) }
        : op && typeof op === 'object'
          ? { ...op, text: textOf(firstOf(op.text, op.label, op.option, op.content, typeof op.value === 'string' ? op.value : undefined)), correct: truthy(op.correct) || truthy(op.is_correct) || truthy(op.isCorrect) || truthy(op.right) }
          : { text: '' }
    );
  }
  const ans = it.answer;
  const markers = [it.correct, it.correct_option, it.correctOption, it.correct_answer, it.correctAnswer, it.correct_options, it.correctOptions, ans && typeof ans === 'object' && !Array.isArray(ans) ? firstOf(ans.correct, ans.option, ans.options, typeof ans.value === 'string' ? ans.value : undefined) : ans];

  // the type, named or read from the shape
  const tw = textOf(it.type).toLowerCase().replace(/[^a-z]/g, '');
  let type: QuestionType | undefined = TYPE_WORDS[tw];
  const opts: { text: string; correct?: boolean }[] | undefined = it.options;
  const looksTF = !!opts && opts.length === 2 && opts.every((o) => /^(true|false)$/i.test(o.text.trim()));
  if (!type) {
    if (looksTF || typeof ans === 'boolean' || (ans && typeof ans === 'object' && typeof ans.value === 'boolean')) type = 'truefalse';
    else if (opts && opts.length >= 3) type = opts.filter((o) => o.correct).length >= 2 ? 'multi' : 'single';
    else if (typeof ans === 'number' || (ans && typeof ans === 'object' && typeof ans.value === 'number')) type = 'numeric';
    else if (ans && typeof ans === 'object' && typeof ans.expr === 'string') type = 'expression';
    else if (typeof ans === 'string' || (ans && typeof ans === 'object' && (ans.model || ans.accept))) type = 'short';
  }
  if (type === 'single' && looksTF) type = 'truefalse';
  if (!type) return null;
  it.type = type;

  if ((type === 'single' || type === 'multi') && opts && !opts.some((o) => o.correct)) {
    const texts = opts.map((o) => o.text);
    for (const m of markers) {
      const list = Array.isArray(m) ? m : [m];
      const hits = list.map((x) => optionNamed(x, texts)).filter((i) => i >= 0);
      if (hits.length && (type === 'multi' || hits.length === 1) && hits.length === list.length) {
        hits.forEach((i) => (opts[i].correct = true));
        break;
      }
    }
  }
  if (type === 'truefalse') {
    let v: unknown = ans && typeof ans === 'object' && !Array.isArray(ans) ? firstOf(ans.value, ans.true, ans.correct) : ans;
    if (v === undefined || v === null) v = it.correct;
    if (v === undefined && looksTF) v = opts!.find((o) => o.correct)?.text;
    if (typeof v === 'string' && /^(true|false)$/i.test(v.trim())) v = /^true$/i.test(v.trim());
    if (typeof v === 'boolean') it.answer = { value: v };
  }
  if (type === 'numeric') {
    const a = ans && typeof ans === 'object' && !Array.isArray(ans) ? { ...ans } : { value: ans };
    if (typeof a.value === 'string' && a.value.trim() && Number.isFinite(Number(a.value.replace(/[,$\s]/g, '')))) a.value = Number(a.value.replace(/[,$\s]/g, ''));
    a.unit = firstOf(a.unit, it.unit);
    a.tolerance = firstOf(a.tolerance, it.tolerance);
    a.calc = firstOf(a.calc, it.calc, it.calculation);
    it.answer = a;
  }
  if (type === 'short') {
    const a = ans && typeof ans === 'object' && !Array.isArray(ans) ? { ...ans } : typeof ans === 'string' ? { accept: [ans], model: ans } : {};
    a.model = firstOf(a.model, it.model_answer, it.modelAnswer, it.sample_answer, Array.isArray(a.accept) ? a.accept[0] : undefined);
    if (!(Array.isArray(a.accept) && a.accept.length) && !(Array.isArray(a.terms) && a.terms.length) && typeof a.model === 'string') a.accept = [a.model];
    it.answer = a;
  }
  return it;
}

export function candidatesFrom(raw: unknown): { title: string; candidates: Candidate[] } {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const nested = o.quiz && typeof o.quiz === 'object' ? (o.quiz as Record<string, unknown>) : null;
  const found = Array.isArray(raw) ? raw : Array.isArray(o.questions) ? o.questions : Array.isArray(o.items) ? o.items : nested && Array.isArray(nested.questions) ? nested.questions : [];
  const list = found.slice(0, QUIZ_LIMITS.pool).map(normaliseItem);
  const candidates: Candidate[] = [];
  if (!o.title && nested?.title) o.title = nested.title;
  list.forEach((item: any, index: number) => {
    if (!item || typeof item !== 'object') return;
    const type = (QUESTION_TYPES as readonly string[]).includes(item.type) ? (item.type as QuestionType) : null;
    if (!type) return;
    const difficulty = ([1, 2, 3].includes(Number(item.difficulty)) ? Number(item.difficulty) : 2) as Difficulty;
    const demand = ((DEMANDS as readonly string[]).includes(item.demand) ? item.demand : 'application') as Demand;
    const concept = str(item.concept, QUIZ_LIMITS.concept).toLowerCase() || str(item.topic, QUIZ_LIMITS.concept).toLowerCase();
    const topic = str(item.topic, QUIZ_LIMITS.topic) || concept;
    const stem = typeof item.stem === 'string' ? item.stem.trim().slice(0, QUIZ_LIMITS.stem) : '';
    const answer = item.answer && typeof item.answer === 'object' ? item.answer : {};
    const key: Candidate['key'] = { type, answerText: '', why: brief(str(item.explanation, 900)), ...(str(item.cue, QUIZ_LIMITS.cue) ? { cue: str(item.cue, QUIZ_LIMITS.cue) } : {}) };
    let options: { id: string; text: string }[] | undefined;
    if (type === 'single' || type === 'multi') {
      const opts = Array.isArray(item.options) ? item.options.slice(0, QUIZ_LIMITS.options) : [];
      options = opts.map((op: any, i: number) => ({ id: `o${i}`, text: str(op?.text, QUIZ_LIMITS.option) }));
      key.correct = opts.map((op: any, i: number) => (op?.correct === true ? `o${i}` : null)).filter((x: string | null): x is string => !!x);
      const traps: Record<string, { tag: string; note: string }> = {};
      opts.forEach((op: any, i: number) => {
        if (op?.trap && typeof op.trap === 'object' && op.correct !== true) {
          const tag = str(op.trap.tag, 40).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
          const note = str(op.trap.note, 220);
          if (tag && note) traps[`o${i}`] = { tag, note };
        }
      });
      if (Object.keys(traps).length) key.traps = traps;
    } else if (type === 'truefalse') {
      const v = answer.value ?? answer.true ?? item.correct;
      if (typeof v === 'boolean') key.correct = [v ? 'true' : 'false'];
      else if (typeof v === 'string' && /^(true|false)$/i.test(v)) key.correct = [v.toLowerCase()];
      options = [
        { id: 'true', text: 'True' },
        { id: 'false', text: 'False' },
      ];
    } else if (type === 'numeric') {
      key.value = numOf(answer.value);
      const abs = numOf(answer.tolerance?.abs);
      const rel = numOf(answer.tolerance?.rel);
      key.tolerance = abs !== undefined || rel !== undefined ? { ...(abs !== undefined ? { abs: Math.abs(abs) } : {}), ...(rel !== undefined ? { rel: Math.abs(rel) } : {}) } : { rel: 0.005 };
      const unit = str(answer.unit, 16);
      if (unit) key.unit = unit;
      if (Array.isArray(item.wrong_values)) {
        const wv = item.wrong_values
          .slice(0, 4)
          .map((w: any) => ({ value: numOf(w?.value) ?? NaN, tag: str(w?.tag, 40).toLowerCase().replace(/[^a-z0-9-]+/g, '-'), note: str(w?.note, 220) }))
          .filter((w: any) => Number.isFinite(w.value) && w.tag && w.note);
        if (wv.length) key.wrongValues = wv;
      }
    } else if (type === 'expression') {
      const expr = str(answer.expr, QUIZ_LIMITS.expr);
      if (expr) key.expr = expr;
      const vars = Array.isArray(answer.vars) ? answer.vars.map((v: unknown) => str(v, 4)).filter((v: string) => /^[a-z]$/i.test(v)).slice(0, 3) : [];
      if (vars.length) key.vars = vars;
    } else if (type === 'short') {
      const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => str(x, 80)).filter(Boolean).slice(0, n) : []);
      key.accept = list(answer.accept, 6);
      key.terms = list(answer.terms, 5);
      const model = str(answer.model, 300);
      if (model) key.model = model;
    }
    const cites = Array.isArray(item.sources) ? item.sources.map((s: unknown) => str(s, 16)).filter((s: string) => parseKey(s) || BARE_BLOCK.test(s)).slice(0, QUIZ_LIMITS.sources) : [];
    const figure = figureOf(item.figure);
    const fromFigure =
      item.from_figure && Array.isArray(item.from_figure.meet) && item.from_figure.meet.length === 2 && (item.from_figure.axis === 'x' || item.from_figure.axis === 'y')
        ? { meet: [str(item.from_figure.meet[0], 12), str(item.from_figure.meet[1], 12)] as [string, string], axis: item.from_figure.axis as 'x' | 'y' }
        : undefined;
    const v = Number.isInteger(item.variant_of) && item.variant_of >= 0 && item.variant_of < index ? item.variant_of : undefined;
    candidates.push({
      q: { type, stem, ...(options ? { options } : {}), ...(key.unit ? { unit: key.unit } : {}), ...(figure ? { figure } : {}), topic, concept, difficulty, demand, sources: [] },
      key,
      ...(typeof answer.calc === 'string' ? { calc: str(answer.calc, 200) } : {}),
      ...(fromFigure ? { fromFigure } : {}),
      cites,
      ...(v !== undefined ? { variantOfIndex: v } : {}),
    });
  });
  return { title: str(o.title, QUIZ_LIMITS.title), candidates };
}

// ── shaping: shuffling, ids, sources, keys ───────────────────────────

/** A small seeded generator (mulberry32), so the same quiz id always shuffles the same way. */
export function rng(seedText: string): () => number {
  let a = 2166136261;
  for (let i = 0; i < seedText.length; i++) a = Math.imul(a ^ seedText.charCodeAt(i), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LETTERS = 'abcdef';
const BARE_BLOCK = /^p\d{1,4}\.\d{1,5}$/;

/** The right answer as the student should read it. */
function answerTextOf(c: Candidate, options: { id: string; text: string }[] | undefined): string {
  const k = c.key;
  if (c.q.type === 'single' || c.q.type === 'multi') return (k.correct ?? []).map((id) => options?.find((o) => o.id === id)?.text ?? '').filter(Boolean).join('; ');
  if (c.q.type === 'truefalse') return k.correct?.[0] === 'true' ? 'True' : 'False';
  if (c.q.type === 'numeric') return `${k.unit === '$' ? '$' : ''}${formatNumber(k.value ?? 0)}${k.unit && k.unit !== '$' ? (k.unit === '%' ? '%' : ` ${k.unit}`) : ''}`;
  if (c.q.type === 'expression') return k.expr ?? '';
  return k.model ?? k.accept?.[0] ?? '';
}

export function formatNumber(v: number): string {
  if (Number.isInteger(v)) return v.toLocaleString('en-US');
  const s = Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3);
  return String(Number(s));
}

export interface Shaped {
  title: string;
  questions: QuizQuestion[];
  keys: QuestionKey[];
  /** how many of each rejection, for the logs and the evaluation */
  rejected: Partial<Record<Rejection, number>>;
  /** questions planned (not variants) that survived */
  main: number;
  grounding: QuizBasis['grounding'];
}

/**
 * Check every candidate, keep the fit ones, shuffle and spread the right answers, make the ids positional, and
 * split each into its public half and its key. At most `count` planned questions; variants only for kept ones.
 */
export function shapeQuiz(quizId: string, title: string, candidates: Candidate[], docs: SourceDoc[], ctx: { count: number; strictSources: boolean; avoidHashes: number[]; avoidStems: string[] }): Shaped {
  const known = new Set<string>();
  docs.forEach((d, f) => studyBlocks(d).forEach((b) => known.add(blockKey(f, b.id))));
  const rejected: Partial<Record<Rejection, number>> = {};
  const asked: string[] = [...ctx.avoidStems];
  const keptIndex = new Map<number, Candidate>();
  // a block named without its file is the passage that has it, when exactly one does
  const byBlock = new Map<string, string[]>();
  for (const k of known) {
    const b = k.slice(k.indexOf(':') + 1);
    byBlock.set(b, [...(byBlock.get(b) ?? []), k]);
  }
  candidates = candidates.map((c) =>
    c.cites.some((k) => BARE_BLOCK.test(k)) ? { ...c, cites: c.cites.map((k) => (BARE_BLOCK.test(k) ? (byBlock.get(k)?.length === 1 ? byBlock.get(k)![0] : k) : k)) } : c
  );
  candidates.forEach((c, i) => {
    const why = checkCandidate(c, { knownBlocks: known, strictSources: ctx.strictSources, avoid: ctx.avoidHashes, asked });
    if (why) {
      rejected[why] = (rejected[why] ?? 0) + 1;
      return;
    }
    asked.push(c.q.stem);
    keptIndex.set(i, c);
  });
  // planned questions first (up to count), then variants whose original was kept
  const planned = [...keptIndex.entries()].filter(([, c]) => c.variantOfIndex === undefined).slice(0, ctx.count);
  const plannedSet = new Set(planned.map(([i]) => i));
  const variants = [...keptIndex.entries()].filter(([, c]) => c.variantOfIndex !== undefined && plannedSet.has(c.variantOfIndex));
  const rand = rng(quizId);
  const positionUse = [0, 0, 0, 0, 0, 0];
  const idOf = new Map<number, string>();
  const questions: QuizQuestion[] = [];
  const keys: QuestionKey[] = [];
  let general = 0;
  for (const [index, c] of [...planned, ...variants]) {
    const qid = `q${questions.length + 1}`;
    idOf.set(index, qid);
    let options = c.q.options;
    let correct = c.key.correct;
    let traps = c.key.traps;
    if (options && (c.q.type === 'single' || c.q.type === 'multi')) {
      const right = options.filter((o) => (correct ?? []).includes(o.id));
      const wrong = options.filter((o) => !(correct ?? []).includes(o.id));
      for (let i = wrong.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
      }
      let order: typeof options;
      if (c.q.type === 'single') {
        // the right answer goes where it has been least, ties broken at random: position tells nothing
        const n = options.length;
        const least = Math.min(...positionUse.slice(0, n));
        const spots = [...Array(n).keys()].filter((p) => positionUse[p] === least);
        const at = spots[Math.floor(rand() * spots.length)];
        positionUse[at]++;
        order = [...wrong];
        order.splice(at, 0, right[0]);
      } else {
        order = [...right, ...wrong];
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
      }
      const rename = new Map(order.map((o, i) => [o.id, LETTERS[i]]));
      options = order.map((o, i) => ({ id: LETTERS[i], text: o.text }));
      correct = (correct ?? []).map((id) => rename.get(id)!).filter(Boolean);
      if (traps) traps = Object.fromEntries(Object.entries(traps).map(([id, t]) => [rename.get(id)!, t]).filter(([id]) => !!id));
    }
    const sources = sourcesFrom(c.cites, docs);
    if (!sources.length) general++;
    const q: QuizQuestion = {
      id: qid,
      type: c.q.type,
      stem: c.q.stem,
      ...(options ? { options } : {}),
      ...(c.q.unit ? { unit: c.q.unit } : {}),
      ...(c.q.figure ? { figure: c.q.figure } : {}),
      topic: c.q.topic,
      concept: c.q.concept,
      difficulty: c.q.difficulty,
      demand: c.q.demand,
      sources,
      sealed: '',
      ...(c.variantOfIndex !== undefined ? { variantOf: idOf.get(c.variantOfIndex) } : {}),
    };
    const shapedKey = { ...c.key, ...(correct ? { correct } : {}), ...(traps ? { traps } : {}) };
    const key: QuestionKey = { ...shapedKey, quiz: quizId, qid, answerText: answerTextOf({ ...c, key: shapedKey }, options) };
    questions.push(q);
    keys.push(key);
  }
  const grounding: QuizBasis['grounding'] = !questions.length || general === questions.length ? 'general' : general ? 'mixed' : 'grounded';
  return { title: title || 'Quiz', questions, keys, rejected, main: planned.length, grounding };
}

/** The passages a question cites, as the file holds them: its name, page, block and a few of its own words. */
export function sourcesFrom(cites: string[], docs: SourceDoc[]): SourceRef[] {
  const out: SourceRef[] = [];
  for (const k of cites) {
    const p = parseKey(k);
    const d = p ? docs[p.file] : undefined;
    const b = d?.blocks.find((x) => x.id === p!.block);
    if (!d || !b) continue;
    if (out.some((s) => s.doc === d.id && s.block === b.id)) continue;
    out.push({ doc: d.id, title: (d.title || d.name).slice(0, 80), page: b.page, block: b.id, quote: verbatimFrom(b.text, '', QUIZ_LIMITS.quote) });
  }
  return out.slice(0, QUIZ_LIMITS.sources);
}
