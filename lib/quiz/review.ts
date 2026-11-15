// lib/quiz/review.ts — THE END OF A QUIZ: WHAT IS SHOWN, WHAT THE CONVERSATION IS TOLD.
//
// The review is the same artifact, turned over: a score, the questions missed first (each with the student's
// answer, the right one, and why in a sentence or two), the topics to look at again, and three ways on. It is
// built here from the quiz's own records — nothing is re-asked of a model, so the review cannot disagree with
// what happened.
//
// The conversation is told the same records (quizFacts): every question asked, the answer given and how it
// was graded, and — once the student has seen them — the right answer and why. So "why did I miss question
// 4?" is answered from question 4 as it was, never from a reconstruction. What the student has not been shown
// yet (the right answers during an exam simulation) is not in what the conversation is told.
//
// PURE.

import { countsRight } from './grade';
import { firstTryRight, outcomeOf } from './adapt';
import type { MistakeRead, QuestionRecord, QuizMode, QuizPhase, QuizQuestion } from './types';

export interface ReviewInput {
  id: string;
  title: string;
  count: number;
  asked: readonly string[];
  pool: readonly QuizQuestion[];
  records: Readonly<Record<string, QuestionRecord>>;
  mode: QuizMode;
  phase: QuizPhase;
}

/** "helped": right in the end, after a cue or a second try — not counted in the score, and reviewed with the misses. */
export type Outcome = 'right' | 'helped' | 'wrong' | 'partial' | 'unsure' | 'unanswered';

export interface ReviewItem {
  /** its number in the quiz, from 1 */
  n: number;
  q: QuizQuestion;
  outcome: Outcome;
  /** the answer they gave, as they would read it (for a helped one: the first answer) */
  yours: string | null;
  /** for a helped one: the answer that was right in the end */
  then: string | null;
  /** the right answer and why, once shown */
  correct: string | null;
  why: string | null;
  mistake: MistakeRead | null;
  /** right at the first attempt, alone */
  firstTry: boolean;
  /** helped: a hint, or a second try after a cue */
  helped: boolean;
}

export interface Review {
  title: string;
  /** right at the first attempt, alone: the score */
  right: number;
  /** right in the end after a cue or a second try */
  helped: number;
  wrong: number;
  unanswered: number;
  total: number;
  items: ReviewItem[];
  /** the questions missed, in quiz order (wrong, partial, and right only after help) */
  missed: ReviewItem[];
  /** the topics to review, most missed first */
  topics: { topic: string; missed: number; of: number }[];
  perfect: boolean;
  /** the one-line note the conversation gets when the quiz ends */
  note: string;
}

/** An answer as the student would read it: the option's words, True or False, a number with its unit. */
export function answerText(q: QuizQuestion, answer: string | null | undefined): string | null {
  if (answer === null || answer === undefined || answer === '') return null;
  if (q.type === 'single' || q.type === 'multi') {
    const ids = answer.split(',').map((s) => s.trim()).filter(Boolean);
    const texts = ids.map((id) => q.options?.find((o) => o.id === id)?.text).filter((t): t is string => !!t);
    return texts.length ? texts.join('; ') : null;
  }
  if (q.type === 'truefalse') return answer === 'true' ? 'True' : answer === 'false' ? 'False' : null;
  if (q.type === 'numeric') return q.unit && !answer.includes(q.unit) ? (q.unit === '$' ? `$${answer}` : `${answer} ${q.unit}`) : answer;
  return answer;
}

function outcomeFrom(rec: QuestionRecord | undefined): Outcome {
  if (!rec?.attempts.length) return 'unanswered';
  const last = [...rec.attempts].reverse().find((a) => a.graded);
  if (!last?.graded) return 'unanswered';
  const g = last.graded.grade;
  if (g === 'unsure') return rec.selfMark ? (rec.selfMark === 'right' ? 'right' : 'wrong') : 'unsure';
  if (g === 'partial') return 'partial';
  if (!countsRight(g, rec.selfMark)) return 'wrong';
  return firstTryRight(rec) ? 'right' : 'helped';
}

/** The review of a quiz, from its records. */
export function reviewOf(input: ReviewInput): Review {
  const byId = new Map(input.pool.map((q) => [q.id, q]));
  const items: ReviewItem[] = input.asked
    .map((id) => byId.get(id))
    .filter((q): q is QuizQuestion => !!q)
    .map((q, i) => {
      const rec = input.records[q.id];
      const graded = rec ? [...rec.attempts].reverse().find((a) => a.graded)?.graded ?? null : null;
      const lastAnswer = rec?.attempts.length ? rec.attempts[rec.attempts.length - 1].answer : null;
      const outcome = outcomeFrom(rec);
      const firstAnswer = rec?.attempts[0]?.answer ?? null;
      const firstMiss = rec?.attempts.find((a) => a.graded && !countsRight(a.graded.grade, rec.selfMark))?.graded?.mistake ?? null;
      return {
        n: i + 1,
        q,
        outcome,
        yours: answerText(q, outcome === 'helped' ? firstAnswer : lastAnswer),
        then: outcome === 'helped' && rec?.attempts.length && rec.attempts.length > 1 ? answerText(q, lastAnswer) : null,
        // the right answer and why: from the last grade, or as kept with the question (a reveal, or the review's own)
        correct: graded?.correct ?? rec?.shown?.correct ?? null,
        why: graded?.why ?? rec?.shown?.why ?? null,
        mistake: graded?.mistake ?? firstMiss,
        firstTry: firstTryRight(rec),
        helped: !!rec?.attempts.some((a) => a.helped) || !!rec?.revealed,
      };
    });
  const isMiss = (o: Outcome) => o === 'wrong' || o === 'partial' || o === 'helped';
  const right = items.filter((it) => it.outcome === 'right').length;
  const helped = items.filter((it) => it.outcome === 'helped').length;
  const wrong = items.filter((it) => it.outcome === 'wrong' || it.outcome === 'partial').length;
  const unsure = items.filter((it) => it.outcome === 'unsure').length;
  const total = Math.max(input.count, items.length);
  const unanswered = total - right - helped - wrong - unsure;
  const missed = items.filter((it) => isMiss(it.outcome));
  const byTopic = new Map<string, { missed: number; of: number }>();
  for (const it of items) {
    const t = byTopic.get(it.q.topic) ?? { missed: 0, of: 0 };
    t.of++;
    if (isMiss(it.outcome)) t.missed++;
    byTopic.set(it.q.topic, t);
  }
  const topics = [...byTopic.entries()]
    .filter(([, v]) => v.missed > 0)
    .map(([topic, v]) => ({ topic, ...v }))
    .sort((a, b) => b.missed - a.missed || a.topic.localeCompare(b.topic));
  const perfect = right === total && total > 0;
  return { title: input.title, right, helped, wrong, unanswered, total, items, missed, topics, perfect, note: noteOf({ right, helped, total, missed, topics, perfect, unanswered }) };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listed = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The completion note for the conversation: the score, what the misses have in common, where to go — one or two lines. */
export function noteOf(r: Pick<Review, 'right' | 'total' | 'missed' | 'topics' | 'perfect' | 'unanswered'> & { helped?: number }): string {
  const score = `You scored ${r.right}/${r.total}${r.helped ? ` (${r.right + r.helped} with a second try)` : ''}.`;
  if (r.perfect) return `${score} Every answer right — a harder set or a review in a few days would show whether it holds.`;
  if (!r.missed.length) return r.unanswered ? `${score} ${plural(r.unanswered, 'question')} left unanswered; the quiz has them when you want to come back.` : score;
  const topics = r.topics.map((t) => t.topic);
  const common =
    topics.length === 1
      ? r.missed.length === 1
        ? `The one you missed was on ${topics[0].toLowerCase()}.`
        : `${r.missed.length === 2 ? 'Both' : `All ${r.missed.length}`} missed questions involved ${topics[0].toLowerCase()}.`
      : `The misses were on ${listed(topics.slice(0, 3).map((t) => t.toLowerCase()))}${topics.length > 3 ? ' and more' : ''}.`;
  return `${score} ${common} You can review them in the quiz or practise those concepts again.`;
}

/**
 * What the conversation is told about a quiz: plain lines, every question as it was asked and answered. The
 * right answer and why appear only once the student has been shown them; nothing in a key that was never
 * opened is here, because the browser never had it.
 */
export function quizFacts(input: ReviewInput): string[] {
  const r = reviewOf(input);
  const lines: string[] = [];
  lines.push(`QUIZ "${input.title}" (id ${input.id}) — ${input.phase === 'review' ? 'finished' : 'in progress'}; ${input.mode === 'exam' ? 'exam simulation' : input.mode === 'marks' ? 'marks as they go' : 'guided practice'}; ${input.count} questions.`);
  if (input.phase === 'review') lines.push(`Score ${r.right}/${r.total}: ${r.right} right at the first try, ${r.helped ? `${r.helped} right only after a cue or second try, ` : ''}${r.wrong} missed, ${r.unanswered} unanswered.${r.topics.length ? ` To review: ${r.topics.map((t) => `${t.topic} (${t.missed} of ${t.of})`).join(', ')}.` : ''}`);
  for (const it of r.items) {
    const parts = [`Q${it.n} [${it.q.topic}; ${it.q.type}; difficulty ${it.q.difficulty}]: ${it.q.stem.replace(/\s+/g, ' ').slice(0, 400)}`];
    if (it.q.options?.length) parts.push(`Options: ${it.q.options.map((o) => `(${o.id}) ${o.text}`).join(' ')}`);
    parts.push(it.outcome === 'helped' ? `Their first answer: ${it.yours}; then, after a cue: ${it.then ?? it.yours}` : `Their answer: ${it.yours ?? '(none yet)'}${it.helped ? ' (after a hint or a second try)' : ''}`);
    const hidden = input.mode === 'exam' && input.phase !== 'review';
    if (it.yours && it.outcome === 'unanswered') parts.push(hidden ? 'Graded: held until the end (exam simulation)' : 'Graded: being checked');
    if (it.outcome !== 'unanswered') {
      parts.push(hidden ? 'Graded: held until the end (exam simulation)' : `Graded: ${it.outcome === 'helped' ? 'right only on the second try' : it.outcome}`);
      if (!hidden && it.correct) parts.push(`Right answer: ${it.correct}`);
      if (!hidden && it.why) parts.push(`Why: ${it.why}`);
      if (!hidden && it.mistake && it.outcome !== 'right') parts.push(`What the answer may show (${it.mistake.evidence}): ${it.mistake.note}`);
    }
    if (it.q.sources.length) parts.push(`Source: ${it.q.sources.map((s) => `${s.title}${s.page ? ` p.${s.page}` : ''}`).join('; ')}`);
    lines.push(parts.join(' · '));
  }
  return lines;
}

export { outcomeOf };
