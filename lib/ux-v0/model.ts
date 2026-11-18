// lib/ux-v0/model.ts — which model each SocriaUX stage runs on, and what it may spend.
//
// ROUTING. Not every stage needs the most capable model. Asking the questions,
// writing and revising the brief, and the moodboard's other direction are
// reading and summarising: the ECONOMY model does them well, fast and cheaply.
// Art direction, generation, critique and a complex refinement are where a
// stronger model can show: the PREMIUM model. Work that needs no model runs in
// code and costs nothing: the direction engine, the renderer, fitting a design
// to what it must do (lib/ux-v0/fit.ts), the rendered-page audit, the
// behaviour runtime, and one-decision adjustments (lib/ux-v0/refine-local.ts).
//
//   SOCRIAUX_ROUTING          tiered (default) | single: single runs every stage on the economy model
//   SOCRIAUX_ECONOMY_MODEL    default gpt-6-luna
//   SOCRIAUX_PREMIUM_MODEL    default gpt-6.1-sol (set it to gpt-6-luna to keep every stage on Luna)
//   SOCRIAUX_ECONOMY_EFFORT   reasoning effort for the economy tier (default: the model's own)
//   SOCRIAUX_PREMIUM_EFFORT   reasoning effort for the premium tier (default: medium for Sol, which the
//                             evaluation found as good as high at about 80% of the cost and 60% of the time,
//                             docs/SOCRIAUX-SOL.md; the model's own otherwise)
//   SOCRIAUX_TIER_<STAGE>     economy | premium: move one stage between tiers. Stages: DISCOVER, DIRECTION,
//                             BRIEF, REFINE_BRIEF, ART_DIRECTION, GENERATE, REFINE, CRITIQUE
//   SOCRIAUX_MODEL_<STAGE>    one model for one stage, whatever its tier
//   SOCRIAUX_API              chat | responses for every call (default: responses for Sol, chat otherwise)
//
// LEGACY. SOCRIAUX_MODEL, when set, runs EVERY stage on that one model exactly
// as before routing existed, with SOCRIAUX_API and SOCRIAUX_EFFORT (default:
// high for GPT-6.1 Sol, the model's own otherwise). Unset it to route.
//
// Server-side only: no request can name a model, an API, a tier or an effort.

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
  return ladderFor(socriauxModel(env));
}

const ladderFor = (m: string): string[] => [...(LADDERS[m] ?? [m, 'gpt-4o-mini'])];

// ── routing ──────────────────────────────────────────────────────────

export type Tier = 'economy' | 'premium';
export const TIERS: readonly Tier[] = ['economy', 'premium'];
export const DEFAULT_PREMIUM_MODEL = SOL;

/** Where each stage runs unless it is told otherwise. Refinement is economy unless it is complex (refineTier). */
export const STAGE_TIER: Record<CallKind, Tier> = {
  discover: 'economy',
  direction: 'economy',
  brief: 'economy',
  'refine-brief': 'economy',
  'art-direction': 'premium',
  generate: 'premium',
  refine: 'economy',
  critique: 'premium',
};

export interface Route {
  stage: CallKind;
  tier: Tier;
  model: string;
  api: Api;
  effort: Effort | undefined;
  /** the model, then what answers if it is refused */
  ladder: string[];
  /** where the choice came from: the legacy one-model setting, single routing, the stage's tier, or a model set for the stage */
  source: 'legacy' | 'single' | 'tier' | 'stage';
}

const MODEL_ID = /^[a-z0-9][a-z0-9.\-:]{1,60}$/i;
const stageKey = (stage: CallKind) => stage.toUpperCase().replace(/-/g, '_');
const modelEnv = (v: string | undefined): string | null => {
  const m = (v ?? '').trim();
  return MODEL_ID.test(m) ? m : null;
};
const effortEnv = (v: string | undefined): Effort | undefined => {
  const e = (v ?? '').trim().toLowerCase();
  return (EFFORTS as readonly string[]).includes(e) ? (e as Effort) : undefined;
};

/** Whether SocriaUX routes by stage, or runs everything on one model (legacy SOCRIAUX_MODEL, or SOCRIAUX_ROUTING=single). */
export function routingMode(env: Env = process.env): 'legacy' | 'single' | 'tiered' {
  if (modelEnv(env.SOCRIAUX_MODEL)) return 'legacy';
  return (env.SOCRIAUX_ROUTING ?? '').trim().toLowerCase() === 'single' ? 'single' : 'tiered';
}

export function tierModel(tier: Tier, env: Env = process.env): string {
  return tier === 'premium' ? modelEnv(env.SOCRIAUX_PREMIUM_MODEL) ?? DEFAULT_PREMIUM_MODEL : modelEnv(env.SOCRIAUX_ECONOMY_MODEL) ?? DEFAULT_MODEL;
}

/**
 * The model, API and effort for one stage. `want` is the call's own judgement of its tier (a complex
 * refinement asks for premium); a tier set for the stage in the environment overrides it.
 */
export function routeFor(stage: CallKind, want: { tier?: Tier } = {}, env: Env = process.env): Route {
  const mode = routingMode(env);
  if (mode === 'legacy') {
    const model = socriauxModel(env);
    return { stage, tier: STAGE_TIER[stage], model, api: socriauxApi(env), effort: socriauxEffort(env), ladder: ladderFor(model), source: 'legacy' };
  }
  const set = (env[`SOCRIAUX_TIER_${stageKey(stage)}`] ?? '').trim().toLowerCase();
  const tier: Tier = mode === 'single' ? 'economy' : (TIERS as readonly string[]).includes(set) ? (set as Tier) : want.tier ?? STAGE_TIER[stage];
  const own = modelEnv(env[`SOCRIAUX_MODEL_${stageKey(stage)}`]);
  const model = own ?? tierModel(tier, env);
  const forced = (env.SOCRIAUX_API ?? '').trim().toLowerCase();
  const api: Api = forced === 'chat' || forced === 'responses' ? forced : IS_SOL.test(model) ? 'responses' : 'chat';
  const effort = effortEnv(tier === 'premium' ? env.SOCRIAUX_PREMIUM_EFFORT : env.SOCRIAUX_ECONOMY_EFFORT) ?? effortEnv(env.SOCRIAUX_EFFORT) ?? (IS_SOL.test(model) ? 'medium' : undefined);
  return { stage, tier, model, api, effort, ladder: ladderFor(model), source: own ? 'stage' : mode === 'single' ? 'single' : 'tier' };
}

/** The stage on the economy model: where a premium call goes when a budget would not hold it, or it is too slow. */
export function economyRoute(stage: CallKind, env: Env = process.env): Route {
  return routeFor(stage, { tier: 'economy' }, { ...env, [`SOCRIAUX_TIER_${stageKey(stage)}`]: 'economy' });
}

/** Every stage's route, for the evaluation and the logs. */
export function routingTable(env: Env = process.env): Route[] {
  return (Object.keys(STAGE_TIER) as CallKind[]).map((k) => routeFor(k, {}, env));
}

/**
 * Whether a refinement needs the premium model. In code, from what was asked: a change to one selected
 * part, said briefly (new words, a size, a colour, removing or moving it), is economy work; a change with no
 * selection, to the whole page, its structure, or its feel, or a long instruction, is premium. A change to
 * one decision of the look never reaches a model at all (lib/ux-v0/refine-local.ts).
 */
export function refineTier(comment: string, selection: { element?: { ux?: { section: string } | null } | null; region?: unknown } | null | undefined): { tier: Tier; why: string } {
  const c = String(comment ?? '').toLowerCase();
  const whole = /\b(whole|entire|overall|every(thing| section| page)|all (the )?sections|the page|the design|the layout|the structure|restructure|reorganis|reorganiz|rethink|rework|redesign|start again|from scratch|flow|journey|hierarchy|composition|art direction|feel|mood|tone of|more (premium|luxur|editorial|playful|bold|calm|human|minimal|expressive|experimental|sophisticated)|less (generic|corporate|busy|template))/;
  const small = /\b(say|says|read|reads|rename|wording|word|copy|text|title|headline|label|button|typo|spell|bigger|smaller|larger|size|bold(er)?|colou?r|darker|lighter|remove|delete|hide|move (it|this)|swap|replace (the|this) (image|picture|photo|icon)|align|centre|center|left|right|padding|spacing|gap)\b/;
  if (!selection || !(selection.element || selection.region)) return { tier: 'premium', why: 'no part selected: a change to the whole design' };
  if (c.length > 280) return { tier: 'premium', why: 'a long instruction' };
  if (whole.test(c)) return { tier: 'premium', why: 'a change to the structure or the feel' };
  if (small.test(c) || c.length <= 120) return { tier: 'economy', why: 'a small change to the selected part' };
  return { tier: 'premium', why: 'an open change to the selected part' };
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
