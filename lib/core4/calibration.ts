// lib/core4/calibration.ts
//
// Confidence that was measured, not asserted.
//
// A model asked "how sure are you?" produces a number from the same forward
// pass that produced the answer, and that number is famously uncorrelated
// with being right. It is a fluent guess about a guess. No amount of prompting
// fixes this, because the information required — how much this model's answer
// MOVES when you ask again — does not exist inside a single forward pass. It
// only exists across several.
//
// So: run the load-bearing claim k times, independently, and look at the
// spread. That is a measurement an architecture can take and a prompt cannot,
// and it falls squarely in the one category the adversarial audit accepted
// (docs/CORE-4-ARCHITECTURE.md §5″): information genuinely not in the
// transcript.
//
// THE ASYMMETRY, WHICH IS THE WHOLE DESIGN.
//
// This runs on the cheap model. A weak model agreeing with itself five times
// means almost nothing — it may be confidently, repeatably wrong, and small
// models are especially good at that. A weak model DISAGREEING with itself is
// different: it is direct evidence that the question is not settled by the
// material available, because the same inputs produced different outputs.
//
// Therefore this module is deliberately one-directional:
//
//   HIGH DISAGREEMENT  → reported. "Three independent attempts, three
//                        different answers" is real evidence of an open
//                        question, and it is exactly what a person betting a
//                        decision on the claim needs to hear.
//   HIGH AGREEMENT     → NEVER reported as confidence. It buys nothing and
//                        saying it would manufacture certainty out of a weak
//                        model's consistency, which is the failure mode this
//                        module exists to fight.
//
// Anything that can only lower a claim's standing cannot be used to inflate
// one. That is what makes it safe to run on a cheap model at all.

import type { ProblemItem, ProblemModel } from './problem';
import { modelClient, type ModelClient } from './model';
import { COGNITION_MODEL } from '../cognition/engine';


/** Independent attempts. Odd, small, and enough to see a split. */
export const SAMPLES = 5;

/** Term overlap at which two number-free answers count as the same answer. */
export const SAME = 0.5;

/** Two quantities within this relative distance are the same quantity. */
const TOLERANCE = 0.02;

/** Below this share of agreement the question is not settled by what is on the table. */
export const SPLIT_AT = 0.6;

export interface Calibration {
  claim: string;
  claimId: string;
  /** the distinct answers that came back, most common first */
  clusters: { answer: string; count: number }[];
  /** share of samples in the largest cluster, 0-1 */
  agreement: number;
  /** how many attempts actually returned something */
  samples: number;
  /** true only when the spread is wide enough to be worth saying */
  split: boolean;
}

const SYSTEM = `You answer one factual or analytical question as directly as you can, from the material given and your own knowledge.

Return JSON with exactly these fields:

answer   one line. The substance only — the value, the verdict, the mechanism. No hedging, no preamble, no restating the question.
basis    a few words: what the answer rests on.

Answer it as you actually see it. Do not aim for a safe or middle answer, and do not qualify it into uselessness — a plainly stated answer that turns out to differ from someone else's is more useful here than a vague one that agrees with everything.`;

/**
 * The claim worth sampling: what the person is about to act on.
 *
 * Their own, not Socria's — the same rule the counterfactual target follows.
 * A claim or conclusion, not a decision: a decision is a choice and sampling
 * it measures nothing but how opinionated the model feels today. What can
 * usefully be re-derived is something that purports to be TRUE.
 */
export function claimOf(p: ProblemModel): ProblemItem | null {
  const mine = (i: ProblemItem) => i.owner === 'user' || i.owner === 'unknown';
  const pick = (k: ProblemItem['kind']) =>
    p.live.filter((i) => i.kind === k && mine(i) && i.text.trim().length > 20).sort((a, b) => b.turn - a.turn)[0];
  return pick('conclusion') ?? pick('claim') ?? null;
}

const norm = (s: string) => s.toLowerCase().replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/\s+/g, ' ').trim();

const numbers = (s: string): number[] =>
  (norm(s).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);

const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'in', 'on', 'at', 'it',
  'that', 'this', 'and', 'or', 'but', 'for', 'with', 'as', 'by', 'from', 'about', 'around',
  'roughly', 'approximately', 'nearly', 'closer', 'near', 'no', 'yes', 'not', 'per', 'you',
  'your', 'we', 'our', 'they', 'their', 'so', 'if', 'then', 'than', 'more', 'less', 'only',
]);

const terms = (s: string): Set<string> =>
  new Set(norm(s).split(/[^a-z0-9.%-]+/).filter((w) => w.length > 2 && !STOP.has(w)));

/**
 * Are these two answers the same answer?
 *
 * WHY NOT `similarity()` FROM considered.ts. That function answers "has this
 * consideration already been raised" over sentences, and it is wrong for this
 * job in two ways a test caught immediately: it scores two identical short
 * strings at 0 when their words are all stopwords, and it scores "about 40% a
 * year" against "around 40% annually" at 0 — the same answer, in different
 * words, which is exactly the case that has to collapse.
 *
 * For the claims that get sampled — a quantity, a verdict, a mechanism — the
 * NUMBER usually IS the answer. So numbers are compared first, and only
 * number-free answers fall back to term overlap.
 *
 * DIRECTION OF ERROR IS DELIBERATE. Ties go to "same". Over-clustering
 * under-reports splits; under-clustering makes every turn look unsettled and
 * fires a block that should be rare. A noisy uncertainty warning is worse than
 * a missing one, because a person learns to ignore it.
 */
export function sameAnswer(a: string, b: string): boolean {
  if (norm(a) === norm(b)) return true;
  const na = numbers(a);
  const nb = numbers(b);
  if (na.length && nb.length) {
    // The leading quantity carries the answer; a trailing year or sample size
    // should not split two answers that agree on the number that matters.
    const close = (x: number, y: number) => Math.abs(x - y) <= Math.max(1e-9, Math.abs(y) * TOLERANCE);
    return na.some((x) => nb.some((y) => close(x, y)));
  }
  const ta = terms(a);
  const tb = terms(b);
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.min(ta.size, tb.size) >= SAME;
}

/** Group answers that say the same thing, most common first. */
export function cluster(answers: readonly string[]): { answer: string; count: number }[] {
  const groups: { answer: string; members: string[] }[] = [];
  for (const a of answers) {
    const hit = groups.find((g) => sameAnswer(g.answer, a));
    if (hit) hit.members.push(a);
    else groups.push({ answer: a, members: [a] });
  }
  return groups
    .map((g) => ({ answer: g.answer, count: g.members.length }))
    .sort((x, y) => y.count - x.count);
}

/**
 * Sample the claim independently and report the spread.
 *
 * Temperature is deliberately high: the point is to see the distribution the
 * model actually holds, and a temperature-0 sample five times is one sample
 * five times. Fails to `null` — a turn is never worse for this being
 * unavailable.
 */
export async function calibrate(
  apiKey: string,
  p: ProblemModel,
  context: string,
  client?: ModelClient
): Promise<Calibration | null> {
  const claim = claimOf(p);
  if (!claim) return null;
  const c = client ?? modelClient(apiKey);
  const prompt = `Context:\n${context.slice(-2000)}\n\nQuestion: is this right, and what is the correct version if not?\n\n${claim.text}`;

  const got = await Promise.all(
    Array.from({ length: SAMPLES }, async () => {
      try {
        const res = await c.complete({
          role: 'verify',
          model: COGNITION_MODEL,
          temperature: 1,
          json: true,
          system: SYSTEM,
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 220,
        });
        const o = JSON.parse(res.text || '{}') as Record<string, unknown>;
        const a = typeof o.answer === 'string' ? o.answer.trim() : '';
        return a.length > 3 ? a.slice(0, 300) : null;
      } catch {
        return null;
      }
    })
  );

  const answers = got.filter((a): a is string => a !== null);
  // Three is the floor for a spread to mean anything; two samples that differ
  // is a coin landing on its edge, not a measurement.
  if (answers.length < 3) return null;
  const clusters = cluster(answers);
  const agreement = clusters[0].count / answers.length;
  return {
    claim: claim.text,
    claimId: claim.id,
    clusters,
    agreement,
    samples: answers.length,
    split: agreement < SPLIT_AT,
  };
}

/**
 * Renders ONLY when the samples disagreed.
 *
 * See the header: a weak model's agreement is not evidence of anything and
 * must never reach the reply as confidence. This block has exactly one thing
 * it is allowed to say, and it says it or stays silent.
 */
export function renderCalibration(cal: Calibration | null): string {
  if (!cal || !cal.split) return '';
  const rival = cal.clusters.slice(0, 3).map((c) => `  - ${c.answer} (${c.count} of ${cal.samples})`);
  return (
    `\n=== Re-derived independently, and it did not settle ===\n` +
    `CLAIM: ${cal.claim}\n${rival.join('\n')}\n` +
    `Independent attempts at this claim did not converge, which is evidence the material on the table does not determine it — not evidence that any one of these is right. ` +
    `If their next step rests on this claim, say plainly that it is unsettled and what would settle it. ` +
    `Do not present the most common version as the answer, do not average them, and never mention attempts, samples, sampling or that anything was run more than once.\n`
  );
}
