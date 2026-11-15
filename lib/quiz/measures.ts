// lib/quiz/measures.ts — WHAT A FUTURE EXPERIMENT WOULD MEASURE, FROM WHAT QUIZZES ALREADY RECORD.
//
// The success of quizzing is the student's understanding, not how many questions were made. These measures are
// computed from the quiz evidence the learning ledger keeps (lib/quiz/evidence.ts), so an experiment — adaptive
// against planned order, guided practice against marks only — can read them without collecting anything new:
//
//   unseen accuracy    right answers on questions that were not the first on a concept (retests, later quizzes):
//                      improvement on questions never seen before
//   retention          of right answers given a day or more after an earlier right answer on the concept, how many
//                      were right: what holds after a delay
//   resolution time    from a concept's first miss to its first right retest: how long a misconception lasts
//
// PURE. Content-free: tuples of times, rights and kinds only.

import type { QuizEv, QuizEvidence } from './evidence';

const DAY = 86_400_000;

export interface QuizMeasures {
  /** answers on a concept after its first: how many, how many right */
  unseen: { n: number; right: number };
  /** answers a day or more after an earlier right answer: how many, how many right */
  retention: { n: number; right: number };
  /** for each concept missed and later retested right: the time between, in hours */
  resolutionHours: number[];
}

/** The measures across concepts' quiz evidence (the ledger's entries, their `q`). */
export function measuresOf(evidence: readonly (QuizEvidence | undefined)[]): QuizMeasures {
  const out: QuizMeasures = { unseen: { n: 0, right: 0 }, retention: { n: 0, right: 0 }, resolutionHours: [] };
  for (const q of evidence) {
    const ev: QuizEv[] = [...(q?.ev ?? [])].sort((a, b) => a[0] - b[0]);
    let lastRight: number | null = null;
    let firstMiss: number | null = null;
    ev.forEach(([at, r], i) => {
      if (i > 0) {
        out.unseen.n++;
        if (r) out.unseen.right++;
      }
      if (lastRight !== null && at - lastRight >= DAY) {
        out.retention.n++;
        if (r) out.retention.right++;
      }
      if (!r && firstMiss === null) firstMiss = at;
      if (r && firstMiss !== null) {
        out.resolutionHours.push(Math.round(((at - firstMiss) / 3_600_000) * 10) / 10);
        firstMiss = null;
      }
      if (r) lastRight = at;
    });
  }
  return out;
}
