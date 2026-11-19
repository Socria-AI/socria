// lib/ux-v0/estimates.ts — what each stage costs and takes, as MEASURED, for warnings and the cost panel.
//
// The medians of the live run of 18 November 2026 (test/browser/ux-v0/fx/sol-eval-calls.json: 124 calls, six
// projects, each stage on GPT-6 Luna and on GPT-6.1 Sol at medium and high effort). They are what a step has
// usually cost, not what this one will: before a premium step the designer is told the measured median and the
// deployment's limit for one call (SOCRIAUX_OPERATION_USD), never a guess dressed as a figure.

import type { CallKind } from './types';

export interface StageEstimate {
  /** median US$ per call */
  usd: number;
  /** the most one measured call cost */
  maxUsd: number;
  /** median seconds per call */
  seconds: number;
}

type Setup = 'luna' | 'sol-medium' | 'sol-high';

export const MEASURED: Record<Setup, Partial<Record<CallKind, StageEstimate>>> = {
  luna: {
    discover: { usd: 0.0002, maxUsd: 0.0003, seconds: 3.4 },
    direction: { usd: 0.0001, maxUsd: 0.0001, seconds: 2.4 },
    brief: { usd: 0.0005, maxUsd: 0.0005, seconds: 7.0 },
    'art-direction': { usd: 0.0005, maxUsd: 0.0005, seconds: 8.0 },
    generate: { usd: 0.0007, maxUsd: 0.0008, seconds: 7.4 },
    refine: { usd: 0.0003, maxUsd: 0.0003, seconds: 1.7 },
    critique: { usd: 0.0003, maxUsd: 0.0003, seconds: 4.4 },
  },
  'sol-medium': {
    discover: { usd: 0.0041, maxUsd: 0.009, seconds: 11.5 },
    direction: { usd: 0.0045, maxUsd: 0.0051, seconds: 9.9 },
    brief: { usd: 0.0117, maxUsd: 0.015, seconds: 26.4 },
    'art-direction': { usd: 0.0116, maxUsd: 0.015, seconds: 31.7 },
    generate: { usd: 0.0212, maxUsd: 0.0255, seconds: 31.3 },
    refine: { usd: 0.0035, maxUsd: 0.0057, seconds: 5.8 },
    critique: { usd: 0.0092, maxUsd: 0.099, seconds: 17.5 },
  },
  'sol-high': {
    discover: { usd: 0.0078, maxUsd: 0.0093, seconds: 26.2 },
    direction: { usd: 0.0067, maxUsd: 0.0104, seconds: 15.9 },
    brief: { usd: 0.0175, maxUsd: 0.0225, seconds: 44.3 },
    'art-direction': { usd: 0.02, maxUsd: 0.0211, seconds: 57.5 },
    generate: { usd: 0.0287, maxUsd: 0.04, seconds: 52.9 },
    refine: { usd: 0.0059, maxUsd: 0.0079, seconds: 10.8 },
    critique: { usd: 0.0156, maxUsd: 0.0184, seconds: 39.8 },
  },
};

/** The measured estimate for a stage on a model (and effort), or null when that model was not measured. */
export function estimateFor(stage: CallKind, model: string, effort?: string | null): StageEstimate | null {
  const setup: Setup | null = /^gpt-6\.1-sol/.test(model) ? (effort === 'high' ? 'sol-high' : 'sol-medium') : /^gpt-6-luna/.test(model) ? 'luna' : null;
  return setup ? MEASURED[setup][stage] ?? null : null;
}

/** What the browser knows of the budgets (lib/ux-v0/usage-server.ts budgetView), for the warning before a step. */
export interface BudgetSeen {
  day: { spent: number; limit: number };
  month: { spent: number; limit: number };
  project: { spent: number; limit: number };
  org?: { day: { spent: number; limit: number }; month: { spent: number; limit: number } } | null;
  operationLimit: number;
  warnAt: number;
}

/** The least left of any budget (US$), and which. */
export function leastLeft(b: BudgetSeen): { usd: number; of: string } {
  const all: [string, { spent: number; limit: number } | undefined][] = [
    ['today’s budget', b.day],
    ['this month’s budget', b.month],
    ['this project’s budget', b.project],
    ['your organisation’s budget for today', b.org && b.org.day.limit > 0 ? b.org.day : undefined],
    ['your organisation’s budget for this month', b.org && b.org.month.limit > 0 ? b.org.month : undefined],
  ];
  let best = { usd: Infinity, of: '' };
  for (const [of, x] of all) if (x && x.limit > 0 && x.limit - x.spent < best.usd) best = { usd: Math.max(0, x.limit - x.spent), of };
  return best;
}

/**
 * Whether to ask before a premium step: when what is left of a budget would not cover a few of them at their
 * measured median (or one at the deployment's limit for a call). Null when there is nothing to say.
 */
export function warnBefore(stage: CallKind, b: BudgetSeen | null, model = 'gpt-6.1-sol', effort: string | null = 'medium'): string | null {
  if (!b) return null;
  const e = estimateFor(stage, model, effort);
  if (!e) return null;
  const left = leastLeft(b);
  if (!Number.isFinite(left.usd)) return null;
  if (left.usd >= Math.max(e.usd * 3, Math.min(b.operationLimit, e.maxUsd * 2))) return null;
  return `This step usually costs about US$${e.usd.toFixed(3)} (measured), never more than US$${b.operationLimit.toFixed(2)} for one call; US$${left.usd.toFixed(3)} of ${left.of} is left.`;
}
