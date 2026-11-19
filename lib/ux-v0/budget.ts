// lib/ux-v0/budget.ts — what SocriaUX may spend, and what a call can cost before it is made.
//
// Every model call is priced from what the provider reports (lib/ux-v0/model.ts
// usageOf: MEASURED). Before a call, what it can cost at most is ESTIMATED from
// its prompt (about four characters a token), its answer cap and its reasoning
// room, at the model's published price; that worst case is held against the
// budgets below. Nothing here is a guess presented as a measurement: an
// estimate says it is one.
//
//   SOCRIAUX_DAILY_USD       per person per UTC day          (default 2.00)
//   SOCRIAUX_MONTHLY_USD     per person per calendar month   (default 20.00)
//   SOCRIAUX_PROJECT_USD     per project, all time           (default 5.00)
//   SOCRIAUX_OPERATION_USD   the most one call may cost      (default 0.40)
//   SOCRIAUX_ORG_DAILY_USD   per organisation (a Clerk organisation: a club, a class, a studio) per UTC day
//                            (default 0: no organisation limit)
//   SOCRIAUX_ORG_MONTHLY_USD per organisation per calendar month (default 0: none)
//   SOCRIAUX_WARN_AT         the share of a budget at which the designer is told (default 0.8)
//   SOCRIAUX_MAX_RETRIES     asking again when a structured answer is cut at its cap (default 1; 0 to never)
//
// When a premium call would take a budget past its limit, or cost more than
// one operation may, it is made on the economy model instead, and the designer
// is told. A budget already spent stops the call with a plain message; the
// project is saved either way. The call and generation counts per day
// (SOCRIAUX_DAILY_CALLS, SOCRIAUX_DAILY_GENERATIONS) still apply.
//
// The automatic repair loop after a generation is code, not a model: at most
// MAX_REVISION_ROUNDS (lib/ux-v0/evaluate.ts) rounds, and it costs nothing.

import { REASONING_ROOM, traitsOf, effortFor } from '../model-params';
import { costOf } from '../model-router';
import { MAX_TOKENS, economyRoute, type Route } from './model';

type Env = Record<string, string | undefined>;

export interface Budgets {
  dailyUsd: number;
  monthlyUsd: number;
  projectUsd: number;
  operationUsd: number;
  /** the organisation's limits, 0 for none */
  orgDailyUsd: number;
  orgMonthlyUsd: number;
  warnAt: number;
  maxRetries: number;
}

const usd = (v: string | undefined, fallback: number) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e4) / 1e4 : fallback;
};

export function budgets(env: Env = process.env): Budgets {
  const warn = parseFloat(env.SOCRIAUX_WARN_AT ?? '');
  const retries = parseInt(env.SOCRIAUX_MAX_RETRIES ?? '', 10);
  return {
    dailyUsd: usd(env.SOCRIAUX_DAILY_USD, 2),
    monthlyUsd: usd(env.SOCRIAUX_MONTHLY_USD, 20),
    projectUsd: usd(env.SOCRIAUX_PROJECT_USD, 5),
    operationUsd: usd(env.SOCRIAUX_OPERATION_USD, 0.4),
    orgDailyUsd: usd(env.SOCRIAUX_ORG_DAILY_USD, 0),
    orgMonthlyUsd: usd(env.SOCRIAUX_ORG_MONTHLY_USD, 0),
    warnAt: Number.isFinite(warn) && warn > 0 && warn <= 1 ? warn : 0.8,
    maxRetries: Number.isFinite(retries) ? Math.max(0, Math.min(2, retries)) : 1,
  };
}

/** Tokens for a prompt of this many characters (about four characters a token), and for an image. */
export const tokensFor = (chars: number, images = 0) => Math.ceil(Math.max(0, chars) / 4) + images * 765;

/**
 * What a call can cost AT MOST (an estimate, never a measurement): its prompt, its whole answer cap and its
 * whole reasoning room, at the model's price. Null for a model with no published price.
 */
export function worstCost(route: Pick<Route, 'model' | 'effort' | 'stage'>, inputChars: number, images = 0): number | null {
  const reasoning = traitsOf(route.model).family === 'reasoning' ? REASONING_ROOM[effortFor(route.model, route.effort)] : 0;
  return costOf(route.model, { input: tokensFor(inputChars, images), output: MAX_TOKENS[route.stage] + reasoning });
}

export interface Spent {
  /** US$ this person has spent today, this month; this project has spent in all */
  day: number;
  month: number;
  project: number;
  /** what the person's organisation has spent today and this month, when they work in one */
  org?: { day: number; month: number } | null;
}

export type BudgetDecision =
  | { ok: true; route: Route; downgraded: string | null; warning: string | null; estimate: number | null }
  | { ok: false; error: string };

const money = (n: number) => `US$${n.toFixed(2)}`;

/**
 * Whether a call may be made, and on which model. A budget already spent stops it; a premium call that
 * would take a budget past its limit, or cost more than one operation may, is made on the economy model.
 */
export function decide(route: Route, inputChars: number, spent: Spent, b: Budgets = budgets(), env: Env = process.env, images = 0): BudgetDecision {
  const over = [
    spent.day >= b.dailyUsd ? `today’s SocriaUX budget (${money(b.dailyUsd)}) is spent; it resets at midnight UTC` : '',
    spent.month >= b.monthlyUsd ? `this month’s SocriaUX budget (${money(b.monthlyUsd)}) is spent` : '',
    spent.project >= b.projectUsd ? `this project’s budget (${money(b.projectUsd)}) is spent` : '',
    spent.org && b.orgDailyUsd > 0 && spent.org.day >= b.orgDailyUsd ? `your organisation’s SocriaUX budget for today (${money(b.orgDailyUsd)}) is spent; it resets at midnight UTC` : '',
    spent.org && b.orgMonthlyUsd > 0 && spent.org.month >= b.orgMonthlyUsd ? `your organisation’s SocriaUX budget for this month (${money(b.orgMonthlyUsd)}) is spent` : '',
  ].filter(Boolean);
  if (over.length) return { ok: false, error: `${over[0].charAt(0).toUpperCase()}${over[0].slice(1)}. Your work is saved.` };
  let chosen = route;
  let downgraded: string | null = null;
  let estimate = worstCost(route, inputChars, images);
  if (route.tier === 'premium' && estimate != null) {
    const room = Math.min(
      b.dailyUsd - spent.day,
      b.monthlyUsd - spent.month,
      b.projectUsd - spent.project,
      spent.org && b.orgDailyUsd > 0 ? b.orgDailyUsd - spent.org.day : Infinity,
      spent.org && b.orgMonthlyUsd > 0 ? b.orgMonthlyUsd - spent.org.month : Infinity
    );
    const why = estimate > b.operationUsd ? `it could cost up to ${money(estimate)}, more than one change may (${money(b.operationUsd)})` : estimate > room ? `it could take the budget past its limit (${money(room)} left)` : '';
    if (why) {
      const economy = economyRoute(route.stage, env);
      if (economy.model !== route.model) {
        chosen = economy;
        estimate = worstCost(economy, inputChars, images);
        downgraded = `Made on the economy model (${economy.model}): ${why}.`;
      }
    }
  }
  const share = Math.max(spent.day / (b.dailyUsd || 1), spent.month / (b.monthlyUsd || 1), spent.project / (b.projectUsd || 1));
  const warning = share >= b.warnAt ? `${Math.round(share * 100)}% of a SocriaUX budget is used (today ${money(spent.day)} of ${money(b.dailyUsd)}, this month ${money(spent.month)} of ${money(b.monthlyUsd)}, this project ${money(spent.project)} of ${money(b.projectUsd)}).` : null;
  return { ok: true, route: chosen, downgraded, warning, estimate };
}
