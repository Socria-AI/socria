// A QUIZ — an adaptive, source-grounded quiz the student takes in the conversation, and its review.
//
// One display in the session's map (lib/objects), so it is saved and synced with the line of thinking, drawn the
// same in the Everything view and in the expanded workspace (components/display/QuizFigure.tsx), and described to
// the reply model on every turn — every question as it was asked, the answer given, how it was graded, and the
// right answer once the student has seen it. Nothing here can grade: the keys are sealed by the server
// (lib/quiz/seal.ts) and only a server grade, signed, is recorded.
//
// WHAT THE OPERATIONS ARE, AND WHO MAY DO THEM (only the student takes their quiz):
//
//   next       the next question, chosen by lib/quiz/adapt.ts from what the answers so far show
//   answer     an answer to the question in front of them: a new attempt, never an edit of an old one
//   grade      the server's grade for one attempt, recorded once (a second grade for the same attempt is refused)
//   reveal     they chose to see the answer (practice): the server's answer and why, kept with the question
//   shown      the server's answer and why for a question already finished (the review)
//   selfmark   their own check of an open answer the grader could not be sure of
//   finish     the quiz becomes its review; nothing is answered after that
//   look       they opened a missed question in the review, or went deeper on it
//   follow     a quiz made from this one (weak spots, another) is linked to it
//   difficulty easier or harder from here on (Socria may set this when they ask in the chat)
//
// Every time comes in an argument, so replaying the history computes exactly the same states.
//
// PURE.

import { register, type Part, type ViewDecl } from './core';
import { cleanId, cleanText, displayKind, headOps, op, registerDisplay, type Args, type DisplayHead } from './display-base';
import { nextQuestion, outcomeOf } from '@/lib/quiz/adapt';
import { quizFacts, reviewOf } from '@/lib/quiz/review';
import { DEMANDS, GRADES, QUESTION_TYPES, QUIZ_LIMITS, QUIZ_MODES, type Attempt, type Graded, type QuestionRecord, type QuizBasis, type QuizFigure, type QuizLinks, type QuizMode, type QuizPhase, type QuizQuestion, type SourceRef } from '@/lib/quiz/types';

export type QuizView = 'quiz' | 'review';

export interface QuizState extends DisplayHead {
  view: QuizView;
  /** the quiz's own id (what its sealed keys are bound to) */
  quiz: string;
  mode: QuizMode;
  /** how many questions it asks */
  count: number;
  difficulty: 'easier' | 'harder' | 'mixed' | null;
  /** every question it may ask: the planned ones, then variants held back for retests */
  pool: QuizQuestion[];
  /** the questions asked, in order; the last is the one in front of them while taking */
  asked: string[];
  records: Record<string, QuestionRecord>;
  phase: QuizPhase;
  basis: QuizBasis;
  links: QuizLinks;
  /** concept → how much it matters (0..3), from the quiz's targets */
  priority: Record<string, number>;
  made: number;
  done?: number;
  /** questions they opened in the review or went deeper on */
  looked: string[];
  /** quizzes made from this one */
  children: string[];
}

const DIFFICULTIES = ['easier', 'harder', 'mixed'] as const;
const L = QUIZ_LIMITS;

// ── sanitising: everything stored or sent, read back into a shape that holds together ──

const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e14 ? Math.floor(v) : 0);
const tag = (v: unknown) => (typeof v === 'string' && /^[a-z0-9-]{1,40}$/.test(v) ? v : '');

function figureOf(raw: unknown): QuizFigure | undefined {
  const f = raw && typeof raw === 'object' ? (raw as Record<string, any>) : null;
  if (!f || f.kind !== 'curves') return undefined;
  const axis = (a: any) => {
    const min = num(a?.min, -1e9, 1e9);
    const max = num(a?.max, -1e9, 1e9);
    return min !== null && max !== null && max > min ? { label: cleanText(a?.label, 40), min, max } : null;
  };
  const x = axis(f.x);
  const y = axis(f.y);
  const curves = Array.isArray(f.curves)
    ? f.curves.slice(0, L.curves).flatMap((c: any) => {
        const id = cleanText(c?.id, 12);
        const expr = cleanText(c?.expr, L.expr);
        return id && expr ? [{ id, label: cleanText(c?.label, 40), expr, ...(c?.dashed === true ? { dashed: true } : {}) }] : [];
      })
    : [];
  if (!x || !y || !curves.length) return undefined;
  const points = Array.isArray(f.points)
    ? f.points.slice(0, L.points).flatMap((p: any) => {
        const px = num(p?.x, -1e9, 1e9);
        const py = num(p?.y, -1e9, 1e9);
        const label = cleanText(p?.label, 8);
        return label && px !== null && py !== null ? [{ label, x: px, y: py }] : [];
      })
    : [];
  const title = cleanText(f.title, 60);
  return { kind: 'curves', ...(title ? { title } : {}), x, y, curves, ...(points.length ? { points } : {}) };
}

function sourceOf(raw: unknown): SourceRef | null {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const doc = typeof s?.doc === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(s.doc) ? s.doc : null;
  const title = cleanText(s?.title, 80);
  if (!doc || !title) return null;
  const page = num(s?.page, 1, 99999);
  const block = typeof s?.block === 'string' && /^p\d{1,5}\.\d{1,5}$/.test(s.block) ? s.block : null;
  const quote = cleanText(s?.quote, L.quote);
  return { doc, title, ...(page !== null ? { page: Math.round(page) } : {}), ...(block ? { block } : {}), ...(quote ? { quote } : {}) };
}

function questionOf(raw: unknown): QuizQuestion | null {
  const q = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const id = typeof q?.id === 'string' && /^q\d{1,3}$/.test(q.id) ? q.id : null;
  const type = typeof q?.type === 'string' && (QUESTION_TYPES as readonly string[]).includes(q.type) ? (q.type as QuizQuestion['type']) : null;
  const stem = typeof q?.stem === 'string' ? q.stem.replace(/\r/g, '').trim().slice(0, L.stem) : '';
  if (!id || !type || !stem) return null;
  let options: QuizQuestion['options'];
  if (type === 'single' || type === 'multi') {
    options = Array.isArray(q!.options)
      ? (q!.options as unknown[]).slice(0, L.options).flatMap((o: any, i) => {
          const text = cleanText(o?.text, L.option);
          return text ? [{ id: 'abcdef'[i], text }] : [];
        })
      : [];
    if (options.length < 2) return null;
  } else if (type === 'truefalse') {
    options = [
      { id: 'true', text: 'True' },
      { id: 'false', text: 'False' },
    ];
  }
  const unit = cleanText(q!.unit, 16);
  const figure = figureOf(q!.figure);
  const topic = cleanText(q!.topic, L.topic) || 'General';
  const concept = cleanText(q!.concept, L.concept).toLowerCase() || topic.toLowerCase();
  const difficulty = q!.difficulty === 1 || q!.difficulty === 3 ? q!.difficulty : 2;
  const demand = typeof q!.demand === 'string' && (DEMANDS as readonly string[]).includes(q!.demand) ? (q!.demand as QuizQuestion['demand']) : 'application';
  const sources = Array.isArray(q!.sources) ? (q!.sources as unknown[]).slice(0, L.sources).map(sourceOf).filter((s): s is SourceRef => !!s) : [];
  const sealed = typeof q!.sealed === 'string' && /^k1\.[A-Za-z0-9_-]{20,12000}$/.test(q!.sealed) ? q!.sealed : '';
  const variantOf = typeof q!.variantOf === 'string' && /^q\d{1,3}$/.test(q!.variantOf) ? q!.variantOf : undefined;
  return {
    id,
    type,
    stem,
    ...(options ? { options } : {}),
    ...(unit && (type === 'numeric' || type === 'single') ? { unit } : {}),
    ...(figure ? { figure } : {}),
    topic,
    concept,
    difficulty,
    demand,
    sources,
    sealed,
    ...(variantOf ? { variantOf } : {}),
  };
}

function gradedOf(raw: unknown): Graded | null {
  const g = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const grade = typeof g?.grade === 'string' && (GRADES as readonly string[]).includes(g.grade) ? (g.grade as Graded['grade']) : null;
  const sig = typeof g?.sig === 'string' && /^[A-Za-z0-9_-]{32}$/.test(g.sig) ? g.sig : null;
  if (!grade || !sig) return null;
  const correct = cleanText(g!.correct, L.option);
  const why = cleanText(g!.why, L.why);
  const cue = cleanText(g!.cue, L.cue);
  const m = g!.mistake && typeof g!.mistake === 'object' ? (g!.mistake as Record<string, unknown>) : null;
  const mistake =
    m && tag(m.tag) && cleanText(m.note, 260) && (m.evidence === 'confirmed' || m.evidence === 'plausible' || m.evidence === 'insufficient')
      ? { tag: tag(m.tag), note: cleanText(m.note, 260), evidence: m.evidence as 'confirmed' | 'plausible' | 'insufficient' }
      : null;
  return { grade, ...(correct ? { correct } : {}), ...(why ? { why } : {}), ...(cue ? { cue } : {}), ...(mistake ? { mistake } : {}), sig, at: time(g!.at) };
}

function recordOf(raw: unknown, q: QuizQuestion): QuestionRecord {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const attempts: Attempt[] = Array.isArray(r.attempts)
    ? (r.attempts as unknown[]).slice(0, L.attempts).flatMap((a: any) => {
        const answer = typeof a?.answer === 'string' ? a.answer.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, L.answer) : '';
        if (!answer) return [];
        return [{ answer, helped: a?.helped === true, graded: gradedOf(a?.graded), at: time(a?.at) }];
      })
    : [];
  const selfMark = r.selfMark === 'right' || r.selfMark === 'wrong' ? r.selfMark : undefined;
  const s = r.shown && typeof r.shown === 'object' ? (r.shown as Record<string, unknown>) : null;
  const shown = s && cleanText(s.correct, L.option) ? { correct: cleanText(s.correct, L.option), why: cleanText(s.why, L.why) } : undefined;
  void q;
  return { attempts, revealed: r.revealed === true, ...(selfMark ? { selfMark } : {}), ...(shown ? { shown } : {}) };
}

function basisOf(raw: unknown): QuizBasis {
  const b = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  const sources = Array.isArray(b.sources)
    ? b.sources.slice(0, 12).flatMap((s: any) => {
        const doc = typeof s?.doc === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(s.doc) ? s.doc : null;
        const title = cleanText(s?.title, 80);
        const kind = cleanText(s?.kind, 20);
        return doc && title ? [{ doc, title, ...(kind ? { kind } : {}) }] : [];
      })
    : [];
  const grounding = b.grounding === 'grounded' || b.grounding === 'mixed' ? b.grounding : 'general';
  const missing = Array.isArray(b.missing) ? b.missing.map((m: unknown) => cleanText(m, 160)).filter(Boolean).slice(0, 4) : [];
  const style =
    b.style && typeof b.style === 'object' && ['observed', 'inferred', 'unknown'].includes(b.style.basis) && cleanText(b.style.said, 300)
      ? { basis: b.style.basis as 'observed' | 'inferred' | 'unknown', said: cleanText(b.style.said, 300) }
      : null;
  const WHY = ['asked', 'missed', 'due', 'emphasis', 'unseen', 'scope'];
  const targets = Array.isArray(b.targets)
    ? b.targets.slice(0, 8).flatMap((t: any) => {
        const concept = cleanText(t?.concept, L.concept).toLowerCase();
        return concept && WHY.includes(t?.why) ? [{ concept, why: t.why }] : [];
      })
    : [];
  return { course: cleanText(b.course, 80) || null, instructor: cleanText(b.instructor, 80) || null, sources, grounding, missing, style, targets };
}

export function sanitizeQuiz(raw: unknown): QuizState | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!o) return null;
  const quiz = cleanId(o.quiz);
  if (!quiz) return null;
  const seen = new Set<string>();
  const pool = (Array.isArray(o.pool) ? o.pool : [])
    .slice(0, L.pool)
    .map(questionOf)
    .filter((q): q is QuizQuestion => {
      if (!q || seen.has(q.id)) return false;
      seen.add(q.id);
      return true;
    })
    // a variant must point at a question in the pool
    .map((q): QuizQuestion => {
      if (!q.variantOf || seen.has(q.variantOf)) return q;
      const { variantOf: _gone, ...rest } = q;
      return rest;
    });
  if (!pool.length) return null;
  const byId = new Map(pool.map((q) => [q.id, q]));
  const mode: QuizMode = (QUIZ_MODES as readonly string[]).includes(o.mode as string) ? (o.mode as QuizMode) : 'practice';
  const planned = pool.filter((q) => !q.variantOf).length;
  const count = Math.max(1, Math.min(L.questions, planned, Math.round(num(o.count, 1, L.questions) ?? planned)));
  const askedSeen = new Set<string>();
  const asked = (Array.isArray(o.asked) ? o.asked : []).filter((id): id is string => typeof id === 'string' && byId.has(id) && !askedSeen.has(id) && !!askedSeen.add(id)).slice(0, count);
  const recRaw = o.records && typeof o.records === 'object' ? (o.records as Record<string, unknown>) : {};
  const records: Record<string, QuestionRecord> = {};
  for (const id of asked) records[id] = recordOf(recRaw[id], byId.get(id)!);
  const phase: QuizPhase = o.phase === 'review' ? 'review' : 'taking';
  // while taking it is the quiz; once finished, the review unless they turned back to the questions
  const view: QuizView = phase === 'review' && o.view !== 'quiz' ? 'review' : 'quiz';
  const difficulty = (DIFFICULTIES as readonly string[]).includes(o.difficulty as string) ? (o.difficulty as QuizState['difficulty']) : null;
  const pr = o.priority && typeof o.priority === 'object' ? (o.priority as Record<string, unknown>) : {};
  const priority: Record<string, number> = {};
  for (const [k, v] of Object.entries(pr).slice(0, 16)) {
    const c = cleanText(k, L.concept).toLowerCase();
    const n = num(v, 0, 3);
    if (c && n !== null && n > 0) priority[c] = Math.round(n * 100) / 100;
  }
  const l = o.links && typeof o.links === 'object' ? (o.links as Record<string, unknown>) : {};
  const links: QuizLinks = {
    ...(cleanId(l.parent) ? { parent: cleanId(l.parent)! } : {}),
    ...(['weak-spots', 'another', 'retest', 'request'].includes(l.reason as string) ? { reason: l.reason as QuizLinks['reason'] } : {}),
  };
  const looked = (Array.isArray(o.looked) ? o.looked : []).filter((id): id is string => typeof id === 'string' && asked.includes(id)).filter((id, i, a) => a.indexOf(id) === i);
  const children = (Array.isArray(o.children) ? o.children : []).map(cleanId).filter((x): x is string => !!x).filter((id, i, a) => a.indexOf(id) === i).slice(0, 12);
  const done = time(o.done);
  return {
    title: cleanText(o.title, L.title) || 'Quiz',
    view,
    quiz,
    mode,
    count,
    difficulty,
    pool,
    asked,
    records,
    phase,
    basis: basisOf(o.basis),
    links,
    priority,
    made: time(o.made),
    ...(phase === 'review' && done ? { done } : {}),
    looked,
    children,
  };
}

// ── what the state says ──────────────────────────────────────────────

/** The question in front of them while taking (the last asked), or null. */
export function currentQuestion(s: QuizState): QuizQuestion | null {
  if (s.phase !== 'taking' || !s.asked.length) return null;
  return s.pool.find((q) => q.id === s.asked[s.asked.length - 1]) ?? null;
}

/** Is a question finished: right, out of tries, revealed, or (exam, marks) answered? */
export function questionDone(s: Pick<QuizState, 'mode'>, rec: QuestionRecord | undefined): boolean {
  if (!rec?.attempts.length) return false;
  if (s.mode !== 'practice') return true;
  if (rec.revealed) return true;
  const last = rec.attempts[rec.attempts.length - 1];
  if (!last.graded) return false;
  if (outcomeOf(rec) === true || last.graded.grade === 'unsure') return true;
  return rec.attempts.length >= 2;
}

/** Can the next question be asked? */
export function mayAdvance(s: QuizState): boolean {
  if (s.phase !== 'taking') return false;
  const cur = currentQuestion(s);
  if (cur && !questionDone(s, s.records[cur.id])) return false;
  return !!nextQuestion(adaptInputOf(s));
}

export const adaptInputOf = (s: QuizState) => ({ pool: s.pool, asked: s.asked, records: s.records, count: s.count, mode: s.mode, difficulty: s.difficulty, priority: s.priority });
export const reviewInputOf = (s: QuizState) => ({ id: s.quiz, title: s.title, count: s.count, asked: s.asked, pool: s.pool, records: s.records, mode: s.mode, phase: s.phase });

// ── operations ───────────────────────────────────────────────────────

const views: ViewDecl<QuizState>[] = [
  { id: 'quiz', label: 'Quiz', shows: 'one question at a time, with progress', primary: true, interactions: ['choose or type an answer', 'submit it', 'go on to the next question'] },
  { id: 'review', label: 'Review', shows: 'the score, the questions missed with the answer given, the right answer and why, and what to do next', interactions: ['open a missed question', 'go deeper on it', 'practise the weak spots'], unavailable: (s) => (s.phase === 'review' ? null : 'The review opens when the quiz is finished.') },
];

const personOnly = (ctx: { by?: string } | undefined) => (ctx?.by === 'socria' ? 'Only the student takes their quiz.' : null);
const rec = (s: QuizState, id: string): QuestionRecord => s.records[id] ?? { attempts: [], revealed: false };
const withRecord = (s: QuizState, id: string, r: QuestionRecord): QuizState => ({ ...s, records: { ...s.records, [id]: r } });
const parseJson = (v: string | number | undefined): unknown => {
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

const QUIZ_OPS = {
  ...headOps(views, sanitizeQuiz),
  next: op<QuizState>(
    'Next question',
    (s, _a, ctx) => personOnly(ctx) ?? (s.phase !== 'taking' ? 'The quiz is finished.' : mayAdvance(s) ? null : s.asked.length >= s.count ? 'That was the last question.' : 'Answer this one first.'),
    (s) => {
      const q = nextQuestion(adaptInputOf(s));
      return q ? { ...s, asked: [...s.asked, q.id], records: { ...s.records, [q.id]: { attempts: [], revealed: false } } } : s;
    },
    () => 'went on to the next question'
  ),
  answer: op<QuizState>(
    'Answer',
    (s, a, ctx) => {
      const no = personOnly(ctx);
      if (no) return no;
      const cur = currentQuestion(s);
      if (!cur || a.q !== cur.id) return 'That is not the question in front of you.';
      const answer = typeof a.a === 'string' ? a.a.trim() : '';
      if (!answer || answer.length > L.answer) return 'Give an answer first.';
      const r = rec(s, cur.id);
      if (questionDone(s, r)) return 'That question is finished.';
      if (r.attempts.length && !r.attempts[r.attempts.length - 1].graded) return 'Your last answer is still being checked.';
      if ((cur.type === 'single' || cur.type === 'truefalse') && !cur.options?.some((o) => o.id === answer)) return 'Choose one of the options.';
      if (cur.type === 'multi' && !answer.split(',').every((id) => cur.options?.some((o) => o.id === id))) return 'Choose from the options.';
      return null;
    },
    (s, a) => {
      const id = String(a.q);
      const r = rec(s, id);
      const attempt: Attempt = { answer: String(a.a).trim().slice(0, L.answer), helped: a.helped === 1 || r.attempts.length > 0, graded: null, at: time(a.t) };
      return withRecord(s, id, { ...r, attempts: [...r.attempts, attempt] });
    },
    () => 'answered'
  ),
  grade: op<QuizState>(
    'Record the grade',
    (s, a, ctx) => {
      const no = personOnly(ctx);
      if (no) return no;
      const id = typeof a.q === 'string' ? a.q : '';
      const r = s.records[id];
      const n = typeof a.n === 'number' ? a.n : -1;
      if (!r || !r.attempts[n]) return 'There is no such answer.';
      if (r.attempts[n].graded) return 'That answer is already graded.';
      return gradedOf(parseJson(a.g)) ? null : 'That grade cannot be read.';
    },
    (s, a) => {
      const id = String(a.q);
      const r = rec(s, id);
      const n = Number(a.n);
      const g = gradedOf(parseJson(a.g))!;
      const attempts = r.attempts.map((x, i) => (i === n ? { ...x, graded: g } : x));
      // the right answer and why, when the grade carried them, are kept with the question
      const shown = r.shown ?? (g.correct ? { correct: g.correct, why: g.why ?? '' } : undefined);
      return withRecord(s, id, { ...r, attempts, ...(shown ? { shown } : {}) });
    },
    () => 'graded'
  ),
  reveal: op<QuizState>(
    'Show the answer',
    (s, a, ctx) => {
      const no = personOnly(ctx);
      if (no) return no;
      const cur = currentQuestion(s);
      if (s.mode !== 'practice' || !cur || a.q !== cur.id) return 'There is nothing to reveal here.';
      if (questionDone(s, s.records[cur.id]) && !s.records[cur.id]?.revealed) return 'That question is finished.';
      return cleanText(a.correct, L.option) ? null : 'There is no answer to show.';
    },
    (s, a) => {
      const id = String(a.q);
      const r = rec(s, id);
      return withRecord(s, id, { ...r, revealed: true, shown: { correct: cleanText(a.correct, L.option), why: cleanText(a.why, L.why) } });
    },
    () => 'revealed the answer'
  ),
  shown: op<QuizState>(
    'Keep the answer',
    (s, a, ctx) => {
      const no = personOnly(ctx);
      if (no) return no;
      const id = typeof a.q === 'string' ? a.q : '';
      if (!s.records[id] || (s.phase !== 'review' && !questionDone(s, s.records[id]))) return 'That question is not finished.';
      return cleanText(a.correct, L.option) ? null : 'There is no answer to keep.';
    },
    (s, a) => {
      const id = String(a.q);
      return withRecord(s, id, { ...rec(s, id), shown: { correct: cleanText(a.correct, L.option), why: cleanText(a.why, L.why) } });
    },
    () => 'kept the answer'
  ),
  selfmark: op<QuizState>(
    'Check it yourself',
    (s, a, ctx) => {
      const no = personOnly(ctx);
      if (no) return no;
      const r = s.records[typeof a.q === 'string' ? a.q : ''];
      const last = r?.attempts[r.attempts.length - 1];
      if (!last?.graded || last.graded.grade !== 'unsure') return 'Only an answer the checker could not be sure of is checked by you.';
      return a.mark === 'right' || a.mark === 'wrong' ? null : 'Say whether it was right.';
    },
    (s, a) => withRecord(s, String(a.q), { ...rec(s, String(a.q)), selfMark: a.mark === 'right' ? 'right' : 'wrong' }),
    (a) => (a.mark === 'right' ? 'marked it right' : 'marked it not right')
  ),
  finish: op<QuizState>(
    'Finish',
    (s, _a, ctx) => personOnly(ctx) ?? (s.phase === 'review' ? 'The quiz is already finished.' : null),
    (s, a) => ({ ...s, phase: 'review', view: 'review', ...(time(a.t) ? { done: time(a.t) } : {}) }),
    () => 'finished the quiz'
  ),
  look: op<QuizState>(
    'Look again',
    (s, a, ctx) => personOnly(ctx) ?? (s.phase === 'review' && typeof a.q === 'string' && s.asked.includes(a.q) ? null : 'There is no such question in the review.'),
    (s, a) => (s.looked.includes(String(a.q)) ? s : { ...s, looked: [...s.looked, String(a.q)] }),
    () => 'looked again'
  ),
  follow: op<QuizState>(
    'Link a follow-up quiz',
    (s, a, ctx) => personOnly(ctx) ?? (cleanId(a.id) ? null : 'There is no such quiz.'),
    (s, a) => (s.children.includes(String(a.id)) ? s : { ...s, children: [...s.children, String(a.id)].slice(0, 12) }),
    () => 'made a follow-up quiz'
  ),
  difficulty: op<QuizState>(
    'Change the difficulty',
    (s, a) => (s.phase !== 'taking' ? 'The quiz is finished.' : (DIFFICULTIES as readonly string[]).includes(String(a.d)) || a.d === 'adaptive' ? null : 'Easier, harder or mixed.'),
    (s, a) => ({ ...s, difficulty: a.d === 'adaptive' ? null : (a.d as QuizState['difficulty']) }),
    (a) => (a.d === 'harder' ? 'made the questions harder' : a.d === 'easier' ? 'made the questions easier' : 'changed the difficulty')
  ),
};

/** Words in the chat that plainly act on the quiz in hand: "make it harder", "easier please", "finish the quiz". */
export function readQuizOp(text: string, s: QuizState): { op: string; args: Args } | null {
  const t = (text || '').toLowerCase().trim();
  if (s.phase !== 'taking' || t.length > 80) return null;
  if (/^(?:can you |could you |please )?(?:make (?:it|them|the (?:quiz|questions)) |give me )?(?:a bit |a little |much )?harder(?: questions)?(?: please)?[.!]?$/.test(t)) return { op: 'difficulty', args: { d: 'harder' } };
  if (/^(?:can you |could you |please )?(?:make (?:it|them|the (?:quiz|questions)) |give me )?(?:a bit |a little |much )?easier(?: questions)?(?: please)?[.!]?$/.test(t)) return { op: 'difficulty', args: { d: 'easier' } };
  return null;
}

// ── the kind ─────────────────────────────────────────────────────────

export const QUIZ = displayKind<QuizState>({
  kind: 'quiz',
  label: 'Quiz',
  sanitize: sanitizeQuiz,
  ops: QUIZ_OPS,
  readOp: readQuizOp,
  readOpScope: 'in-hand',
  facts: (s) => quizFacts(reviewInputOf(s)),
  text: (s) => {
    const r = reviewOf(reviewInputOf(s));
    return `${s.title}: ${s.count} questions, ${s.asked.length} asked${s.phase === 'review' ? `, finished — ${r.right}/${r.total}` : ''}.`;
  },
  parts: (s): Part[] => s.asked.map((id, i) => ({ id, label: `Question ${i + 1}: ${s.pool.find((q) => q.id === id)?.topic ?? ''}` })),
  partFacts: (s, part) => {
    const i = s.asked.indexOf(part);
    if (i < 0) return null;
    const lines = quizFacts(reviewInputOf(s));
    const line = lines.find((l) => l.startsWith(`Q${i + 1} [`));
    if (!line) return null;
    const q = s.pool.find((x) => x.id === part)!;
    const quotes = q.sources.filter((x) => x.quote).map((x) => `From ${x.title}${x.page ? ` p.${x.page}` : ''}: "${x.quote}"`);
    return [`The student is asking about question ${i + 1} of the quiz "${s.title}".`, line, ...quotes];
  },
  views,
  size: (s, mode) => (mode === 'card' ? { w: 340, h: 220 } : mode === 'trail' ? { w: 260, h: 120 } : { w: 720, h: s.phase === 'review' ? 680 : 560 }),
  shape: (s) => `${s.count}-question quiz${s.phase === 'review' ? ', finished' : `, ${s.asked.filter((id) => (s.records[id]?.attempts.length ?? 0) > 0).length} answered`}`,
  // a quiz's grades carry an explanation and a signature; its states are large, so it keeps few — the records are its history
  argLimits: { count: 8, length: 1800 },
  maxStates: 3,
});

register(QUIZ);
registerDisplay({
  kind: 'quiz',
  noun: 'quiz',
  handle: 'Q',
  about: 'An adaptive quiz from the student’s own material, one question at a time, graded by the server, with a review of what was missed.',
  practice: true,
  // made when the student asks to be quizzed (components/LogosApp.tsx startQuiz), never drafted or offered
  internal: true,
  tell: (guarded) =>
    [
      'A QUIZ is the student taking a quiz in the conversation, in its own panel. The facts list every question asked, the answer given and how the server graded it; the right answer and why appear once the student has been shown them.',
      'When they ask about a question ("why did I miss question 4?"), answer from that question exactly as listed — its words, their answer, the right answer — never reconstruct or invent a question. What a wrong answer "may show" is a possibility, not a diagnosis: say it as one, or ask how they reasoned.',
      'Do not ask quiz questions in the chat; the quiz is in its panel. Never say a question will be on an exam.',
      guarded ? 'While the quiz is being taken, do not give or hint at the answer to a question they have not finished.' : '',
    ]
      .filter(Boolean)
      .join(' '),
});
