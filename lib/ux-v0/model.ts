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
// medium for GPT-6.1 Sol — the live evaluation found medium as good as high at
// about 60% of the time and 80% of the cost, and high's generation took 53 s at
// the median and up to 77 s, past a route's 60 s; the model's own otherwise).
// Unset it to route: it puts the questions and the brief on Sol too, at about
// four times the model time of routing (test/browser/ux-v0/perf-bench.mjs).
//
//   SOCRIAUX_REASONING_ROOM   the most reasoning tokens a call may spend above its answer's cap (default:
//                             half the shared room for its effort, e.g. 4,096 at medium; the most any call
//                             spent in the live run was 1,919 at medium and 3,355 at high, answer included)
//
// Server-side only: no request can name a model, an API, a tier or an effort.

import { EFFORTS, REASONING_ROOM, effortFor, type Effort } from '../model-params';
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
  return IS_SOL.test(socriauxModel(env)) ? 'medium' : undefined;
}

/**
 * The reasoning room a SocriaUX call is given above its answer's cap: SOCRIAUX_REASONING_ROOM when set, else
 * half the room the shared shaper gives that effort (lib/model-params.ts REASONING_ROOM). It bounds a runaway
 * answer (one strict-schema critique in the live run wrote 9,592 tokens over 140 s) while leaving more than
 * twice the most any normal call used.
 */
export function reasoningRoomFor(model: string, effort: Effort | undefined, env: Env = process.env): number {
  const set = parseInt(env.SOCRIAUX_REASONING_ROOM ?? '', 10);
  if (Number.isFinite(set) && set >= 0) return Math.min(set, 65_536);
  return Math.round(REASONING_ROOM[effortFor(model, effort, env)] / 2);
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
  // a creative change in words read into a plan (graphics/creative/model.ts): short, structured, validated twice
  'creative-edit': 'economy',
  // the studio's next creative question and its options (studio/discovery-model.ts): short, structured, validated twice
  'studio-questions': 'economy',
  // not a text stage: a picture from an image model, routed by lib/ux-v0/image-gen-server.ts
  image: 'economy',
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
/** The text model for each stage. Pictures from an image model are routed apart (lib/ux-v0/image-gen-server.ts). */
export function routingTable(env: Env = process.env): Route[] {
  return (Object.keys(STAGE_TIER) as CallKind[]).filter((k) => k !== 'image').map((k) => routeFor(k, {}, env));
}

/**
 * HOW DEMANDING A GENERATION IS, read in code before the model is asked: low (a simple page with one job: a
 * contact form, a short notice), medium (a page of several parts, references to interpret, a design system to
 * keep to), high (motion that tells a story, a 3D object, a configurator, data shown and explored, an experimental
 * Creative DNA, words asking for an immersive or award-grade experience). Advanced work is never sent to the
 * cheaper model: high and medium go to the premium tier. Simple work stays on the premium tier as well, unless the
 * deployment opts in (SOCRIAUX_SIMPLE_ECONOMY=on); an operator's tier set for the stage (SOCRIAUX_TIER_GENERATE)
 * is theirs and still holds. The reading and its reasons are said in the answer, so the cost is explained.
 */
export type Complexity = 'low' | 'medium' | 'high';
export interface ComplexityInput {
  /** the experience being made (lib/ux-v0/intent.ts) and the components it needs */
  kind: string;
  required: readonly string[];
  /** the brief's own words: its objective, visual direction and requirements */
  words: string;
  /** the direction's motion feel and visual language */
  motion: string;
  /** references kept on the moodboard, and whether a design system is to be kept to */
  references: number;
  system: boolean;
  /** the Creative DNA's values, when there is one */
  dna?: Partial<Record<string, number>> | null;
}
export interface ComplexityRead {
  level: Complexity;
  why: string[];
  tier: Tier;
}

const DEMANDING: [RegExp, string][] = [
  [/\b(3d|three[- ]dimensional|webgl|immersive)\b/, 'an immersive or 3D experience'],
  [/\b(scroll[- ]?(driven|story|telling|triggered)|scrollytelling|pinned|kinetic|motion[- ]rich|cinematic)\b/, 'motion that tells the story'],
  [/\b(configurat\w+|customi[sz]\w+ (the|your) product|build your own)\b/, 'a configurator'],
  [/\b(data vi[sz]\w*|visuali[sz]ation|interactive (chart|map|data))\b/, 'data shown and explored'],
  [/\b(experimental|award[- ]?(winning|grade|level)|avant[- ]garde|unconventional)\b/, 'an experimental brief'],
];
/** a page with one job: a form, or a site the brief says is a single page, a notice or a sign-up */
const ONE_JOB = /\b(one[- ]page|single[- ]page|landing page|coming soon|holding page|notice|contact (form|page)|sign[- ]?up|wait ?list|newsletter|rsvp)\b/;
const RICH_KINDS: Record<string, string> = { editorial: 'an editorial page', portfolio: 'a portfolio', dashboard: 'a dashboard', checkout: 'a checkout', booking: 'a booking flow', flow: 'a flow of several steps', app: 'a screen of an app' };

export function generationComplexity(x: ComplexityInput, env: Env = process.env): ComplexityRead {
  const w = String(x.words ?? '').toLowerCase();
  const high: string[] = [];
  const medium: string[] = [];
  if (x.required.includes('scene')) high.push('a 3D object');
  if (x.required.includes('configurator')) high.push('a configurator');
  for (const [re, said] of DEMANDING) if (re.test(w) && !high.includes(said)) high.push(said);
  if (x.motion === 'kinetic') high.push('kinetic motion');
  if (x.kind === 'interactive' || x.kind === 'data') high.push(x.kind === 'data' ? 'a data experience' : 'an interactive experience');
  const d = x.dna ?? {};
  if ((d.composition ?? 50) >= 75 || (d.motion ?? 50) >= 75 || (d.interaction ?? 50) >= 75) high.push('a Creative DNA set far toward the expressive');
  if (x.system) medium.push('a design system to keep to');
  if (x.references >= 4) medium.push(`${x.references} references to interpret`);
  if (x.motion === 'lively') medium.push('lively motion');
  if (RICH_KINDS[x.kind]) medium.push(RICH_KINDS[x.kind]);
  if (w.length > 420) medium.push('a long brief');
  const simple = (x.kind === 'form' || (x.kind === 'site' && ONE_JOB.test(w))) && x.required.length <= 1 && ['still', 'calm', 'measured', ''].includes(x.motion);
  const level: Complexity = high.length ? 'high' : medium.length || !simple ? 'medium' : 'low';
  const why = level === 'high' ? [...new Set(high)] : level === 'medium' ? (medium.length ? medium : ['a page of several parts']) : ['one job, few parts, quiet motion'];
  const tier: Tier = level === 'low' && (env.SOCRIAUX_SIMPLE_ECONOMY ?? '').trim().toLowerCase() === 'on' ? 'economy' : 'premium';
  return { level, why: why.slice(0, 4), tier };
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

/**
 * Whether a critique needs the premium model, in code, from what was asked: a short question about one selected
 * part (is this clear, why does this feel off, what would make it stronger) is read well by the economy model;
 * a question about the whole design, its structure or its art direction, a long one, or one about an image of a
 * whole page is premium. SOCRIAUX_TIER_CRITIQUE overrides it either way.
 */
export function critiqueTier(comment: string, selection: { type?: string; element?: unknown; region?: unknown } | null | undefined, wholeImage = false): { tier: Tier; why: string } {
  const c = String(comment ?? '').toLowerCase();
  const whole = /\b(whole|entire|overall|every(thing| section| page)|the page|the design|the layout|the structure|hierarchy|composition|art direction|flow|journey|brand|strategy|accessib|compare|alternatives?|rethink|redesign)\b/;
  if (wholeImage) return { tier: 'premium', why: 'an image of a whole design' };
  if (!selection || !(selection.element || selection.region)) return { tier: 'premium', why: 'no part selected' };
  if (c.length > 240) return { tier: 'premium', why: 'a long question' };
  if (whole.test(c)) return { tier: 'premium', why: 'a question about the whole design' };
  return { tier: 'economy', why: 'a short question about the selected part' };
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
  'creative-edit': 1400,
  'studio-questions': 1600,
  image: 0,
};

/**
 * A completion's usage, as the provider reported it, priced. Input includes the cached tokens (priced at the
 * cached rate) and output includes the reasoning tokens (billed as output): both are kept apart as well, so
 * what is shown is never mistaken for what is billed.
 */
export function usageOf(model: string, u: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number | null } | null; completion_tokens_details?: { reasoning_tokens?: number | null } | null } | null | undefined): Usage {
  const input = Math.max(0, u?.prompt_tokens ?? 0);
  const output = Math.max(0, u?.completion_tokens ?? 0);
  const cached = Math.max(0, Math.min(input, u?.prompt_tokens_details?.cached_tokens ?? 0));
  const reasoning = Math.max(0, Math.min(output, u?.completion_tokens_details?.reasoning_tokens ?? 0));
  return { model, input, cached, output, ...(reasoning ? { reasoning } : {}), cost: costOf(model, { input, cached, output }) };
}
