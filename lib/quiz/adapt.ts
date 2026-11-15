// lib/quiz/adapt.ts — WHICH QUESTION COMES NEXT.
//
// A quiz is made with a pool a little larger than the questions it will ask: each concept it aims at has its
// question, and the concepts that matter most a VARIANT — another question on the same idea, held back. The
// next question is chosen from the pool after every answer, by what the answers so far show:
//
//   a retest      after a miss in guided practice, a variant on that concept comes back — never at once (two
//                 other questions first, so it tests the idea and not short-term memory) and once at most per
//                 concept, so a weak idea cannot take over the quiz
//   coverage      a concept not yet asked comes before a second question on one that has been; never three in
//                 a row on one topic
//   priority      what the student asked for, what they have missed before, what is due for review and what
//                 the course stresses (lib/quiz/types.ts QuizBasis.targets), in that order
//   difficulty    one step up on a topic they are getting right, one step down where they are not; a request
//                 for easier or harder moves the whole quiz
//
// An exam simulation does not adapt: it asks the quiz's questions in the order they were planned, as an exam
// would, and holds every result to the end.
//
// PURE. Deterministic: the same answers always lead to the same next question.

import { countsRight } from './grade';
import type { Difficulty, QuestionRecord, QuizMode, QuizQuestion } from './types';

export interface AdaptInput {
  pool: readonly QuizQuestion[];
  /** the questions asked so far, in order */
  asked: readonly string[];
  records: Readonly<Record<string, QuestionRecord>>;
  /** how many questions the quiz asks */
  count: number;
  mode: QuizMode;
  difficulty: 'easier' | 'harder' | 'mixed' | null;
  /** concept → how much it matters to ask about it (from the quiz's targets): 0..3 */
  priority: Readonly<Record<string, number>>;
}

/** Did a question end up right (its last graded attempt, or the student's own check on an open answer)? null while ungraded. */
export function outcomeOf(rec: QuestionRecord | undefined): boolean | null {
  if (!rec) return null;
  const last = [...rec.attempts].reverse().find((a) => a.graded);
  if (!last?.graded) return null;
  if (last.graded.grade === 'unsure' && !rec.selfMark) return null;
  return countsRight(last.graded.grade, rec.selfMark);
}

/**
 * How the question went for adapting: right only when right at the first attempt, alone; a miss from the moment
 * a first attempt is graded not right (a right answer after a cue was helped, and the concept is retested).
 * null while the first attempt is ungraded.
 */
export function independentOf(rec: QuestionRecord | undefined): boolean | null {
  const first = rec?.attempts[0];
  if (!first?.graded) return null;
  if (first.graded.grade === 'unsure') return rec!.selfMark ? rec!.selfMark === 'right' && !rec!.revealed : null;
  return firstTryRight(rec);
}

/** Right at the first attempt, without help or a reveal: the only kind of right that counts as independent. */
export function firstTryRight(rec: QuestionRecord | undefined): boolean {
  const first = rec?.attempts[0];
  return !!first?.graded && !first.helped && !rec!.revealed && countsRight(first.graded.grade, rec!.selfMark);
}

/** How a topic is going so far: +1 for each right, −1 for each miss, the latest counting most. */
function trendOf(topic: string, input: AdaptInput, byId: Map<string, QuizQuestion>): number {
  let t = 0;
  for (const id of input.asked) {
    const q = byId.get(id);
    if (!q || q.topic !== topic) continue;
    const o = independentOf(input.records[id]);
    if (o === null) continue;
    t = t * 0.6 + (o ? 1 : -1);
  }
  return t;
}

/** The difficulty to aim at on a topic, from the request and how the topic is going. */
export function targetDifficulty(topic: string, input: AdaptInput, byId: Map<string, QuizQuestion>): number {
  const base = input.difficulty === 'easier' ? 1.4 : input.difficulty === 'harder' ? 2.6 : 2;
  if (input.mode === 'exam' || input.difficulty === 'mixed') return base;
  return Math.max(1, Math.min(3, base + Math.max(-1, Math.min(1, trendOf(topic, input, byId) * 0.6))));
}

/** The next question to ask, or null when the quiz has asked all it will. */
export function nextQuestion(input: AdaptInput): QuizQuestion | null {
  if (input.asked.length >= input.count) return null;
  const byId = new Map(input.pool.map((q) => [q.id, q]));
  const asked = new Set(input.asked);
  const unasked = input.pool.filter((q) => !asked.has(q.id));
  if (!unasked.length) return null;

  // an exam asks its planned questions in order: no variants, no adapting
  if (input.mode === 'exam') return unasked.find((q) => !q.variantOf) ?? null;

  const askedQs = input.asked.map((id) => byId.get(id)).filter((q): q is QuizQuestion => !!q);
  const last = askedQs[askedQs.length - 1];
  const prev = askedQs[askedQs.length - 2];
  const conceptCount = new Map<string, number>();
  const topicCount = new Map<string, number>();
  for (const q of askedQs) {
    conceptCount.set(q.concept, (conceptCount.get(q.concept) ?? 0) + 1);
    topicCount.set(q.topic, (topicCount.get(q.topic) ?? 0) + 1);
  }
  // a concept missed, and how many questions have been asked since: when a variant may come back
  const missedAt = new Map<string, number>();
  const retested = new Set<string>();
  askedQs.forEach((q, i) => {
    if (q.variantOf) retested.add(q.concept);
    if (independentOf(input.records[q.id]) === false) missedAt.set(q.concept, i);
  });
  // how many questions remain: near the end, coverage of a concept never asked wins over a second look
  const left = input.count - askedQs.length;

  let best: QuizQuestion | null = null;
  let bestScore = -Infinity;
  unasked.forEach((q, index) => {
    let score = 0;
    if (q.variantOf) {
      const at = missedAt.get(q.concept);
      // a variant only as a retest: after a miss, two questions later, once per concept
      if (at === undefined || retested.has(q.concept) || askedQs.length - 1 - at < 2) return;
      score += 90;
    } else {
      // a planned question whose concept has already had its retest or its question is skipped in favour of new ones
      score += (conceptCount.get(q.concept) ?? 0) === 0 ? 40 : -25;
    }
    score += (input.priority[q.concept] ?? 0) * 14;
    score -= (topicCount.get(q.topic) ?? 0) * 8;
    if (last && last.topic === q.topic) score -= prev && prev.topic === q.topic ? 200 : 30;
    score -= Math.abs(q.difficulty - targetDifficulty(q.topic, input, byId)) * 12;
    // when few questions are left, a concept never asked matters more than a retest
    if (left <= 2 && !q.variantOf && (conceptCount.get(q.concept) ?? 0) === 0) score += 20;
    score -= index * 0.01; // the planned order breaks ties
    if (score > bestScore) {
      bestScore = score;
      best = q;
    }
  });
  return best;
}

/** How far through the quiz they are, for the progress bar. */
export function progressOf(asked: readonly string[], records: Readonly<Record<string, QuestionRecord>>, count: number): { done: number; total: number } {
  const done = asked.filter((id) => (records[id]?.attempts.length ?? 0) > 0).length;
  return { done, total: count };
}

export const DIFFICULTY_SAID: Record<Difficulty, string> = { 1: 'Warm-up', 2: 'Core', 3: 'Stretch' };
