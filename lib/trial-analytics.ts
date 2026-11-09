// lib/trial-analytics.ts — THE SEVEN-DAY TRIAL, COUNTED (pure). The page is app/dev/trial; the reads are
// lib/trial-analytics-server.ts.
//
// What it is given, all from the usage table and none of it naming a person:
//   · the day's counts ('metrics:trial', 'mday:MM-DD'): activations, days a limit was reached, trials
//     ended, upgrades (in the trial, after it, without one)
//   · every trial day's tokens ('tday:YYYY-MM-DD' rows, summed across accounts) and every trial start
//
// What it says: the headline numbers, conversion, the tokens trials spent and what they cost, and a
// line per day.

import { inferenceCost, TRIAL_MS } from './trial';

export interface MetricRow {
  /** 'mday:11-09' */
  scope: string;
  counter: string;
  n: number;
  /** the row's last write, ms (gives the year a month-day belongs to) */
  at: number;
}
export interface TrialInputs {
  metrics: MetricRow[];
  /** tokens per UTC day, summed across trial accounts: 'tday:2026-11-09' → n */
  tokensByDay: Record<string, number>;
  /** every trial's start, ms */
  starts: number[];
  now: number;
}

export interface TrialDay {
  day: string;
  activated: number;
  limitHits: number;
  ended: number;
  upgrades: number;
  tokens: number;
  cost: number;
}

export interface TrialModel {
  activated: number;
  activeNow: number;
  limitHits: number;
  ended: number;
  upgrades: number;
  upgradesInTrial: number;
  upgradesAfterTrial: number;
  upgradesNoTrial: number;
  /** upgrades from a trial (in it or after it) over trials begun, 0–1; null with no trials */
  conversion: number | null;
  tokens: number;
  cost: number;
  /** the average tokens a trial has spent */
  tokensPerTrial: number | null;
  days: TrialDay[];
}

/** 'mday:11-09' written at `at` → '2026-11-09' (the year of its last write; a write early in January for 12-31 is last year's). */
export function metricDate(scope: string, at: number): string | null {
  const m = /^mday:(\d{2})-(\d{2})$/.exec(scope);
  if (!m) return null;
  const d = new Date(at);
  let y = d.getUTCFullYear();
  if (Number(m[1]) === 12 && d.getUTCMonth() === 0) y -= 1;
  return `${y}-${m[1]}-${m[2]}`;
}

export function trialModel(x: TrialInputs, env: Record<string, string | undefined> = {}, lastDays = 14): TrialModel {
  const byDay = new Map<string, TrialDay>();
  const day = (k: string) => {
    let d = byDay.get(k);
    if (!d) byDay.set(k, (d = { day: k, activated: 0, limitHits: 0, ended: 0, upgrades: 0, tokens: 0, cost: 0 }));
    return d;
  };
  const sums: Record<string, number> = {};
  for (const r of x.metrics) {
    const n = Number.isFinite(r.n) && r.n > 0 ? Math.floor(r.n) : 0;
    sums[r.counter] = (sums[r.counter] ?? 0) + n;
    const k = metricDate(r.scope, r.at);
    if (!k) continue;
    const d = day(k);
    if (r.counter === 'activated') d.activated += n;
    else if (r.counter === 'limit_hits') d.limitHits += n;
    else if (r.counter === 'ended') d.ended += n;
    else if (r.counter === 'upgrades') d.upgrades += n;
  }
  let tokens = 0;
  for (const [k, v] of Object.entries(x.tokensByDay)) {
    const n = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    tokens += n;
    const d = day(k.replace(/^tday:/, ''));
    d.tokens += n;
    d.cost = inferenceCost(d.tokens, env);
  }
  const activated = Math.max(sums.activated ?? 0, x.starts.length);
  const fromTrial = (sums.upgrades_in_trial ?? 0) + (sums.upgrades_after_trial ?? 0);
  const recent = [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, lastDays);
  return {
    activated,
    activeNow: x.starts.filter((s) => s <= x.now && x.now < s + TRIAL_MS).length,
    limitHits: sums.limit_hits ?? 0,
    ended: sums.ended ?? 0,
    upgrades: sums.upgrades ?? 0,
    upgradesInTrial: sums.upgrades_in_trial ?? 0,
    upgradesAfterTrial: sums.upgrades_after_trial ?? 0,
    upgradesNoTrial: sums.upgrades_no_trial ?? 0,
    conversion: activated ? fromTrial / activated : null,
    tokens,
    cost: inferenceCost(tokens, env),
    tokensPerTrial: activated ? Math.round(tokens / activated) : null,
    days: recent,
  };
}
