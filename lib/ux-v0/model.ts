// lib/ux-v0/model.ts — which model SocriaUX v0 runs on, and what it may spend.
//
// One place: SOCRIAUX_MODEL (default gpt-6-luna, the cost-conscious model the
// v0 specification names) for every SocriaUX call, whatever the person's
// plan; the router's ladder answers when it is refused. The model id appears
// nowhere else in v0. Daily caps per person are environment settings too.

import { LADDERS, costOf } from '../model-router';
import type { CallKind, Usage } from './types';

export const DEFAULT_MODEL = 'gpt-6-luna';

type Env = Record<string, string | undefined>;

export function socriauxModel(env: Env = process.env): string {
  const m = (env.SOCRIAUX_MODEL ?? '').trim();
  return /^[a-z0-9][a-z0-9.\-:]{1,60}$/i.test(m) ? m : DEFAULT_MODEL;
}

/** The model, then what answers if it is refused. */
export function socriauxLadder(env: Env = process.env): string[] {
  const m = socriauxModel(env);
  return [...(LADDERS[m] ?? [m, 'gpt-4o-mini'])];
}

const intEnv = (v: string | undefined, fallback: number) => {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Per person per day: every model call, and generations (the long ones) on their own. */
export function dailyCaps(env: Env = process.env): { calls: number; generations: number } {
  return { calls: intEnv(env.SOCRIAUX_DAILY_CALLS, 300), generations: intEnv(env.SOCRIAUX_DAILY_GENERATIONS, 40) };
}

/** What each kind of call may write. */
export const MAX_TOKENS: Record<CallKind, number> = {
  discover: 1200,
  direction: 800,
  brief: 1600,
  'refine-brief': 1600,
  generate: 5200,
  refine: 2200,
  critique: 1400,
};

/** A completion's usage, as the provider reported it, priced. */
export function usageOf(model: string, u: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | null | undefined): Usage {
  const input = Math.max(0, u?.prompt_tokens ?? 0);
  const output = Math.max(0, u?.completion_tokens ?? 0);
  const cached = Math.max(0, Math.min(input, u?.prompt_tokens_details?.cached_tokens ?? 0));
  return { model, input, cached, output, cost: costOf(model, { input, cached, output }) };
}
