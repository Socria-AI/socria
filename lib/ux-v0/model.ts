// lib/ux-v0/model.ts — which model SocriaUX v0 runs on, and what it may spend.
//
// One place: SOCRIAUX_MODEL (default gpt-6-luna, the cost-conscious model the
// v0 specification names) for every SocriaUX call, whatever the person's
// plan; the router's ladder answers when it is refused. The model id appears
// nowhere else in v0. Daily caps per person are environment settings too.
//
// GPT-6.1 SOL, AS AN EXPERIMENT. SOCRIAUX_MODEL=gpt-6.1-sol runs every
// SocriaUX call on Sol, through OpenAI's Responses API, at reasoning effort
// high, with structured outputs where a call's answer has a fixed shape
// (lib/ux-v0/schemas.ts). Unset it to go back to GPT-6 Luna exactly as before.
//
//   SOCRIAUX_API      chat | responses — which API the calls go through
//                     (default: responses for Sol, chat for every other model)
//   SOCRIAUX_EFFORT   none | low | medium | high | xhigh | max — the reasoning
//                     effort (default: high for Sol, so its creative work is
//                     measured at its best; medium for comparison; for other
//                     models, their own default, lib/model-params.ts)
//
// Server-side only: no request can name a model, an API or an effort.

import { EFFORTS, type Effort } from '../model-params';
import { LADDERS, costOf } from '../model-router';
import type { CallKind, Usage } from './types';

export const DEFAULT_MODEL = 'gpt-6-luna';
/** The experimental model: GPT-6.1 Sol. */
export const SOL = 'gpt-6.1-sol';
const IS_SOL = /^gpt-6\.1-sol(?:[-:.]|$)/i;

type Env = Record<string, string | undefined>;

export function socriauxModel(env: Env = process.env): string {
  const m = (env.SOCRIAUX_MODEL ?? '').trim();
  return /^[a-z0-9][a-z0-9.\-:]{1,60}$/i.test(m) ? m : DEFAULT_MODEL;
}

export type Api = 'chat' | 'responses';

/** Which OpenAI API SocriaUX's calls go through. */
export function socriauxApi(env: Env = process.env): Api {
  const v = (env.SOCRIAUX_API ?? '').trim().toLowerCase();
  if (v === 'chat' || v === 'responses') return v;
  return IS_SOL.test(socriauxModel(env)) ? 'responses' : 'chat';
}

/** The reasoning effort SocriaUX's calls ask for, or undefined for the model's own default. */
export function socriauxEffort(env: Env = process.env): Effort | undefined {
  const v = (env.SOCRIAUX_EFFORT ?? '').trim().toLowerCase();
  if ((EFFORTS as readonly string[]).includes(v)) return v as Effort;
  return IS_SOL.test(socriauxModel(env)) ? 'high' : undefined;
}

/** What SocriaUX is running on, in one line for the logs and the evaluation. */
export function socriauxSetup(env: Env = process.env): { model: string; api: Api; effort: Effort | 'default'; ladder: string[] } {
  return { model: socriauxModel(env), api: socriauxApi(env), effort: socriauxEffort(env) ?? 'default', ladder: socriauxLadder(env) };
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
  'art-direction': 1800,
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
