// lib/quiz/mastery.ts — WHAT QUIZZES SHOW ABOUT A CONCEPT, OVER TIME, WITHOUT OVERSTATING IT.
//
// Every graded quiz answer is evidence about one concept, written into the learning ledger the explanation
// engine already keeps (lib/logos5/learning.ts): the right/wrong counts and the Leitner box move exactly as any
// check moves them (lib/runtime/explain.ts noteTopic: a box up only for a first-try right answer, back to the
// start on a miss), and the quiz's own detail is kept beside them (lib/quiz/evidence.ts).
//
// WHERE A MISTAKE STANDS. missed → under review (they opened the review on it, or went deeper) → retested (right
// later, on a different question) → retained (right again, at least a day after that). A miss after a retest
// sends it back to missed; nothing is ever marked weak for good, and an old miss counts for less with time.
//
// HOW SURE. The estimate is a Beta posterior over the weighted answers (a helped answer counts half; a miss on an
// easy question and a right answer on a hard one count a little more; answers fade by half every 45 days), shown
// as words with its uncertainty — never as a precise percentage from a handful of answers. "Secure" needs right
// answers of more than one kind (recall and application, or transfer), a retest or a retention check, and enough
// of them; one perfect quiz never makes anything mastered.
//
// PURE.

import { noteTopic, sameTopic, type LedgerEntry } from '@/lib/runtime/explain';
import { EVIDENCE_MAX, type MistakeState, type QuizEv, type QuizEvidence } from './evidence';
import type { Demand, Difficulty, QuizBasis } from './types';

const DAY = 86_400_000;
const DEMAND_INDEX: Record<Demand, 0 | 1 | 2> = { recall: 0, application: 1, transfer: 2 };

/** A concept as the ledger keeps its topics: lower case, letters and digits, at most 48 characters. */
export function ledgerTopic(concept: string): string {
  return concept.toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48);
}

export interface QuizAnswerEvidence {
  concept: string;
  right: boolean;
  /** right or wrong at the first attempt, without a hint or a reveal */
  firstTry: boolean;
  difficulty: Difficulty;
  demand: Demand;
  helped: boolean;
  /** a variant asked after a miss, or a question in a practice of weak spots */
  retest: boolean;
  /** what the wrong answer may have suggested */
  tag?: string;
  at: number;
}

/** The next state of a mistake, from the one before and this answer. */
export function nextState(prev: MistakeState | undefined, right: boolean, at: number, lastRightAt: number | null): MistakeState | undefined {
  if (!right) return 'missed';
  if (prev === 'missed' || prev === 'review') return 'retested';
  if (prev === 'retested' && lastRightAt !== null && at - lastRightAt >= DAY) return 'retained';
  return prev;
}

/** Write one graded quiz answer into the ledger: the counts and box as any check, and the quiz's detail beside them. */
export function noteQuizAnswer(ledger: readonly LedgerEntry[], e: QuizAnswerEvidence): LedgerEntry[] {
  const topic = ledgerTopic(e.concept);
  if (!topic) return [...ledger];
  const moved = noteTopic(ledger, topic, e.right ? { right: 1, tries: e.firstTry ? 1 : 2 } : { wrong: 1 }, e.at);
  const i = moved.findIndex((x) => sameTopic(x.topic, topic));
  if (i < 0) return moved; // not a topic the ledger keeps
  const entry = moved[i];
  const prevQ: QuizEvidence = entry.q ?? { ev: [] };
  const lastRight = [...prevQ.ev].reverse().find((x) => x[1] === 1)?.[0] ?? null;
  const ev: QuizEv = [e.at, e.right ? 1 : 0, e.difficulty, DEMAND_INDEX[e.demand], e.helped ? 1 : 0, e.retest ? 1 : 0];
  const st = nextState(prevQ.st, e.right, e.at, lastRight);
  const tags = e.tag && !e.right ? [e.tag, ...(prevQ.tags ?? []).filter((t) => t !== e.tag)].slice(0, 4) : prevQ.tags;
  const q: QuizEvidence = { ev: [...prevQ.ev, ev].slice(-EVIDENCE_MAX), ...(st ? { st } : {}), ...(tags?.length ? { tags } : {}) };
  return moved.map((x, j) => (j === i ? { ...x, q } : x));
}

/** They looked at a missed concept again (the review's card, or went deeper): missed → under review. Nothing else moves. */
export function noteQuizReview(ledger: readonly LedgerEntry[], concept: string): LedgerEntry[] {
  const topic = ledgerTopic(concept);
  return ledger.map((x) => (sameTopic(x.topic, topic) && x.q?.st === 'missed' ? { ...x, q: { ...x.q, st: 'review' as const } } : x));
}

export type MasteryLevel = 'too-little' | 'shaky' | 'developing' | 'solid-so-far' | 'secure';

export const MASTERY_SAID: Record<MasteryLevel, string> = {
  'too-little': 'Not enough to say yet',
  shaky: 'Not there yet',
  developing: 'Getting there',
  'solid-so-far': 'Solid so far',
  secure: 'Secure',
};

export interface MasteryEstimate {
  level: MasteryLevel;
  /** the posterior mean and an 80% interval, 0..1 — for code, never shown as a precise number */
  mean: number;
  low: number;
  high: number;
  /** effective number of answers behind it */
  n: number;
  /** right answers of each kind */
  recall: number;
  application: number;
  transfer: number;
  /** right answers at least a day after an earlier right answer (a retention check passed) */
  retained: number;
  state?: MistakeState;
}

/** An approximate quantile of Beta(a, b), by a normal approximation that is fair once a + b > 2. */
function betaQuantile(a: number, b: number, z: number): number {
  const m = a / (a + b);
  const v = (a * b) / ((a + b) ** 2 * (a + b + 1));
  return Math.max(0, Math.min(1, m + z * Math.sqrt(v)));
}

/** How a concept stands, from the quiz evidence on its ledger entry. */
export function masteryOf(entry: Pick<LedgerEntry, 'q' | 'right' | 'wrong'> | undefined, now: number): MasteryEstimate {
  const ev = entry?.q?.ev ?? [];
  let a = 1;
  let b = 1;
  let n = 0;
  const kinds = { recall: 0, application: 0, transfer: 0 };
  let retained = 0;
  let lastRight: number | null = null;
  for (const [at, r, d, m, h] of ev) {
    const fade = Math.pow(0.5, Math.max(0, now - at) / (45 * DAY));
    const w = fade * (h ? 0.5 : 1) * (r ? (d === 3 ? 1.2 : d === 1 ? 0.8 : 1) : d === 1 ? 1.2 : d === 3 ? 0.8 : 1);
    if (r) a += w;
    else b += w;
    n += w;
    if (r && !h) {
      kinds[(['recall', 'application', 'transfer'] as const)[m]]++;
      if (lastRight !== null && at - lastRight >= DAY) retained++;
      lastRight = at;
    }
  }
  const mean = a / (a + b);
  const low = betaQuantile(a, b, -1.2816);
  const high = betaQuantile(a, b, 1.2816);
  const kindsShown = (kinds.recall ? 1 : 0) + (kinds.application ? 1 : 0) + (kinds.transfer ? 1 : 0);
  let level: MasteryLevel;
  if (n < 2.5) level = 'too-little';
  else if (mean < 0.45) level = 'shaky';
  else if (low < 0.55 || mean < 0.72) level = 'developing';
  else if (n >= 5 && kindsShown >= 2 && (retained > 0 || entry?.q?.st === 'retained') && low >= 0.65) level = 'secure';
  else level = 'solid-so-far';
  return { level, mean, low, high, n, ...kinds, retained, ...(entry?.q?.st ? { state: entry.q.st } : {}) };
}

/**
 * What a quiz should aim at first, in order, with why: what the student asked for, what they missed and have
 * not yet retested, what is due by the ledger's clock, what the course keeps coming back to and they have not
 * met. Drawn from the ledger (behind its gate) and the course pack — never from a guess.
 */
export function quizTargets(
  ledger: readonly LedgerEntry[],
  now: number,
  opts: { asked?: string[]; course?: { t: string; w: number; a: number }[]; due?: (e: LedgerEntry) => boolean; max?: number } = {}
): QuizBasis['targets'] {
  const out: QuizBasis['targets'] = [];
  const max = opts.max ?? 8;
  const add = (concept: string, why: QuizBasis['targets'][number]['why']) => {
    const c = ledgerTopic(concept);
    if (c && !out.some((t) => sameTopic(t.concept, c)) && out.length < max) out.push({ concept: c, why });
  };
  for (const a of opts.asked ?? []) add(a, 'asked');
  // missed and not yet shown right since, most recent first
  for (const e of [...ledger].filter((x) => x.q?.st === 'missed' || x.q?.st === 'review').sort((x, y) => (y.q!.ev[y.q!.ev.length - 1]?.[0] ?? 0) - (x.q!.ev[x.q!.ev.length - 1]?.[0] ?? 0))) add(e.topic, 'missed');
  if (opts.due) for (const e of ledger.filter(opts.due)) add(e.topic, 'due');
  for (const c of opts.course ?? []) {
    const met = ledger.some((x) => sameTopic(x.topic, c.t));
    add(c.t, met ? 'emphasis' : c.a >= 2 ? 'unseen' : 'emphasis');
  }
  return out;
}
