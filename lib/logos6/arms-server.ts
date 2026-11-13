import 'server-only';
// lib/logos6/arms-server.ts — WHO SEES WHAT, WHEN A LOGOS 6 FEATURE IS BEING TESTED.
//
// The field test in docs/LOGOS-6-PLAN.md §7.D compares new trial accounts
// with Logos 6's challenge against new trial accounts with Logos 5.5's. That
// is a comparison only if the two groups are assigned at random, so the arm
// is a pure function of (experiment, user id): MR's bucketing
// (lib/mr/experiment.ts `bucket`), stable across turns, devices and
// deployments, and reproducible by anybody holding the user id.
//
// NOTHING RUNS BY DEFAULT. An experiment is defined here and runs only while
// LOGOS6_EXPERIMENTS names it. Who it covers is narrow: signed-in people on
// the plans it lists (the trial, for the challenge test). A guest and a
// Socria One subscriber are never in an arm.
//
// WHAT IS KEPT is nothing new. The arm is never stored: it is recomputed from
// the id whenever it is needed, and the events that carry it are counts
// (lib/product-event-kinds.ts) — "challenge shown, treatment, Tuesday" is a
// number, never a person. Whether an experiment needs consent is the
// owner's decision (docs/LOGOS-6-PLAN.md §10, decision 3); the default here is
// the plan's recommendation: exposure only, counts only, nothing about anyone's
// content collected.
import { bucket } from '../mr/experiment';
import type { L6Arms } from './switches';

export type Arm = 'control' | 'treatment';

export interface FeatureExperiment {
  id: string;
  /** fixed per experiment, so two experiments never split the same people the same way; not a secret */
  salt: string;
  arms: readonly { arm: Arm; weight: number }[];
  /** the plans whose accounts are assigned — anyone else is in neither arm */
  plans: readonly ('free' | 'one')[];
}

export const FEATURE_EXPERIMENTS: Readonly<Record<string, FeatureExperiment>> = Object.freeze({
  'l6-challenge': {
    id: 'l6-challenge',
    salt: 'socria-l6-challenge-2026-11',
    arms: [
      { arm: 'control', weight: 1 },
      { arm: 'treatment', weight: 1 },
    ],
    plans: ['free'],
  },
});

/** The experiments running here: LOGOS6_EXPERIMENTS, a comma list of ids this file defines. */
export function runningExperiments(env: Record<string, string | undefined> = process.env): FeatureExperiment[] {
  const ids = (env.LOGOS6_EXPERIMENTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(ids)].filter((id) => Object.prototype.hasOwnProperty.call(FEATURE_EXPERIMENTS, id)).map((id) => FEATURE_EXPERIMENTS[id]);
}

/** One unit's arm in one experiment: its bucket walked along the cumulative weights. */
export function armIn(spec: FeatureExperiment, unit: string): Arm {
  const arms = spec.arms.filter((a) => Number.isFinite(a.weight) && a.weight > 0);
  const total = arms.reduce((s, a) => s + a.weight, 0);
  if (!arms.length || !(total > 0)) return 'treatment';
  const x = bucket(unit, spec.salt) * total;
  let acc = 0;
  for (const a of arms) {
    acc += a.weight;
    if (x < acc) return a.arm;
  }
  return arms[arms.length - 1].arm;
}

/** The arms a signed-in person is in, for the experiments running here; null when none applies. */
export function armsFor(userId: string | null, plan: 'free' | 'one', env: Record<string, string | undefined> = process.env): L6Arms | null {
  if (!userId) return null;
  const out: L6Arms = {};
  for (const spec of runningExperiments(env)) {
    if (!spec.plans.includes(plan)) continue;
    out[spec.id] = armIn(spec, userId);
  }
  return Object.keys(out).length ? out : null;
}
