// lib/model-router.ts — WHICH MODEL ANSWERS, BY WHO IS ASKING AND HOW HARD THE TURN IS.
//
// Two things decide it, both read on the server and neither ever taken from
// the client:
//
//   the tier   who is asking — a guest (signed out), the free plan, or Socria
//              One — from the session and the subscription (lib/socria-one-
//              server.ts resolvePlanForRequest). No request can name a model.
//   the level  how much the turn needs — `light` (a hello, a thanks, a one-line
//              aside), `standard` (most work), or `deep` (a proof, a derivation,
//              a pushback on maths, a document to analyse, a model to build, a
//              many-part question) — read from what the route already knows
//              about the turn, deterministically, with no model call.
//
//                 light            standard          deep
//   guest         gpt-4o-mini      gpt-4o-mini       gpt-4o-mini
//   free          gpt-6-luna       gpt-6-luna        gpt-6-luna
//   one           gpt-6-luna       gpt-6.1-terra     gpt-6.1-sol
//
// One's light turns go to Luna: a "thanks" reads the same from any model, and
// Terra's price buys nothing there. Everything else follows the brief.
//
// A REFUSED ID STEPS DOWN, NEVER OUT. Each model carries a ladder of what
// answers if the provider refuses it (an id not yet enabled on the account, a
// model withdrawn): the GPT-5.6 model it replaced, then the one before. A free
// turn never steps UP to a member's model.
//
// Every choice has an environment override (OPENAI_MODEL_<TIER>_<LEVEL>, read
// at call time, so no redeploy), and LOGOS_ROUTER=off puts every reply back on
// the one model it used before (OPENAI_MODEL_LOGOS, or GPT-5.6 Sol).
//
// PURE: no network, no clock.

import { failureOf } from './model-params';

export type Tier = 'guest' | 'free' | 'one';
export type Level = 'light' | 'standard' | 'deep';
export type Env = Record<string, string | undefined>;

/** What each tier's turns run on, by level. */
export const TIER_MODELS: Record<Tier, Record<Level, string>> = {
  guest: { light: 'gpt-4o-mini', standard: 'gpt-4o-mini', deep: 'gpt-4o-mini' },
  free: { light: 'gpt-6-luna', standard: 'gpt-6-luna', deep: 'gpt-6-luna' },
  one: { light: 'gpt-6-luna', standard: 'gpt-6.1-terra', deep: 'gpt-6.1-sol' },
};

/** What answers when a model is refused, in order — the model itself first. */
export const LADDERS: Record<string, readonly string[]> = {
  'gpt-4o-mini': ['gpt-4o-mini'],
  'gpt-6-luna': ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-4o-mini'],
  'gpt-6.1-terra': ['gpt-6.1-terra', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-4o'],
  'gpt-6.1-sol': ['gpt-6.1-sol', 'gpt-5.6-sol', 'gpt-6.1-terra', 'gpt-4o'],
};

/** The model a reply ran on before routing, and with LOGOS_ROUTER=off. */
export const UNROUTED_MODEL = 'gpt-5.6-sol';
export const UNROUTED_LADDER = ['gpt-5.6-sol', 'gpt-4o'] as const;

/**
 * Standard prices, US$ per million tokens, as OpenAI's launch pages give them
 * (November 2026; read through search results — openai.com itself could not be
 * fetched from the build machine, so check the pricing page before relying on
 * the figures). `cached` null: not published; the input price is used, which
 * overstates the cost rather than understating it. Prompts over 272K tokens
 * cost more on the GPT-6.1 models; no Socria prompt comes near that.
 */
export const PRICES: Record<string, { input: number; cached: number | null; output: number }> = {
  'gpt-4o-mini': { input: 0.15, cached: 0.075, output: 0.6 },
  'gpt-6-luna': { input: 0.1, cached: null, output: 0.5 },
  'gpt-5.6-luna': { input: 0.2, cached: null, output: 1.2 },
  'gpt-6.1-terra': { input: 1, cached: 0.05, output: 5 },
  'gpt-6.1-sol': { input: 2, cached: 0.1, output: 10 },
};

/** What a call costs, in US$, by its usage; null for a model with no published price. */
export function costOf(model: string, u: { input: number; cached?: number; output: number }): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const cached = Math.min(u.cached ?? 0, u.input);
  return ((u.input - cached) * p.input + cached * (p.cached ?? p.input) + u.output * p.output) / 1_000_000;
}

const on = (v: string | undefined) => !['off', '0', 'false', 'no'].includes((v ?? '').trim().toLowerCase());

/** The tier, from what the server knows: signed in or not, and the plan it resolved. */
export function tierOf(userId: string | null | undefined, plan: 'free' | 'one' | string): Tier {
  if (!userId) return 'guest';
  return plan === 'one' ? 'one' : 'free';
}

// ── how hard the turn is ─────────────────────────────────────────────

/** What the route already knows about a turn — every field optional, so any route can ask. */
export interface TurnFacts {
  /** their newest message */
  text?: string;
  /** lib/cognition/register.ts — social, playful and personal are talk, not work */
  exchange?: string | null;
  /** lib/cognition/assist.ts mode — inform, explain, verify, construct, challenge… */
  move?: string | null;
  /** a claim of theirs to check, or something to compute (lib/accuracy) — not merely maths in the air */
  mathCheck?: boolean;
  /** they are pushing back on a claim, a step or a result */
  pushback?: boolean;
  /** documents shown with this turn */
  docs?: number;
  /** the question about them is a lookup (lib/docs/intent.ts): found and cited, not reasoned over — no deep model for that */
  docLight?: boolean;
  /** something is being built: a simulation, a model, a display */
  construct?: string | null;
  /** Logos 5's length setting */
  length?: string | null;
  /** messages in the conversation so far */
  turns?: number;
  /** Socria's last reply ended on a question — so an "ok" or a "yes" is an answer to it, not small talk */
  lastReplyAsked?: boolean;
}

/** Asked for in so many words: depth, rigour, a proof. */
const DEEP_WORDS =
  /\b(prove|proof|derive|derivation|step[- ]by[- ]step|rigou?r(ous)?|in (great )?depth|thoroughly|edge cases?|counter-?examples?|why exactly|formal(ly)?|optimi[sz]e|trade-?offs?|big[- ]o|complexity of|critique|steelman|devil'?s advocate|compare and contrast|first principles|counter-?arguments?|strongest (case|argument|objection)|push ?back on|poke holes|where (my|the) (reasoning|logic|argument) (is weakest|fails))\b/i;
/** A reply, an acknowledgement, a greeting — the whole message, in any combination ("ok got it, thanks!"). */
const ACK =
  '(hi|hey|hello|yo|thanks?|thank you|so much|ty|cheers|ok(ay)?|cool|nice|great|got it|sounds good|perfect|lol|haha|good (morning|afternoon|evening|night)|bye|see you|yes|yep|sure|will do|makes sense)';
const LIGHT_ONLY = new RegExp(`^\\s*${ACK}([\\s,.!]+${ACK})*[\\s.!?]*$`, 'i');
const TALK = new Set(['social', 'playful', 'personal']);

export interface LevelDecision {
  level: Level;
  /** why, in a word or two each — for the log and the benchmark */
  reasons: string[];
}

/**
 * How much the turn needs. Deep wins over light: a message that is both a
 * greeting and a proof is a proof. Deterministic, no model call.
 */
export function levelOf(f: TurnFacts): LevelDecision {
  const text = (f.text ?? '').trim();
  const deep: string[] = [];
  if (f.mathCheck) deep.push('maths');
  if (f.pushback || f.exchange === 'disagreement') deep.push('pushback');
  if ((f.docs ?? 0) > 0 && !f.docLight) deep.push('documents');
  if (f.construct === 'simulation' || f.construct === 'model') deep.push('building');
  if (DEEP_WORDS.test(text)) deep.push('asked for depth');
  if ((text.match(/\?/g) ?? []).length >= 3) deep.push('many questions');
  if (text.length > 900) deep.push('long message');
  if (f.move === 'challenge' && text.length > 240) deep.push('argument');
  if (deep.length) return { level: 'deep', reasons: deep };

  const light: string[] = [];
  // "ok" to "want me to derive it?" asks for the derivation: never light
  if (f.lastReplyAsked) return { level: 'standard', reasons: ['answers a question'] };
  if (LIGHT_ONLY.test(text)) light.push('acknowledgement');
  else if (f.exchange && TALK.has(f.exchange) && text.length <= 80 && !f.construct) light.push(`talk (${f.exchange})`);
  if (light.length) return { level: 'light', reasons: light };

  return { level: 'standard', reasons: [f.length === 'detailed' ? 'detailed setting' : 'ordinary work'] };
}

// ── the choice ───────────────────────────────────────────────────────

export interface ModelChoice {
  tier: Tier;
  level: Level;
  /** the model asked first */
  model: string;
  /** what answers if it is refused, the model first — never above the tier */
  ladder: string[];
  reasons: string[];
  /** routing off: the one model every reply used before */
  unrouted?: true;
}

/**
 * The model for a reply. `env` is the process environment at call time.
 * LOGOS_ROUTER=off: everyone gets the model every reply used before.
 */
export function chooseModel(tier: Tier, decision: LevelDecision, env: Env = {}): ModelChoice {
  if (!on(env.LOGOS_ROUTER)) {
    const model = (env.OPENAI_MODEL_LOGOS ?? '').trim() || UNROUTED_MODEL;
    return { tier, level: decision.level, model, ladder: uniq([model, ...UNROUTED_LADDER]), reasons: ['routing off'], unrouted: true };
  }
  const override = (env[`OPENAI_MODEL_${tier.toUpperCase()}_${decision.level.toUpperCase()}`] ?? '').trim();
  const model = override || TIER_MODELS[tier][decision.level];
  return { tier, level: decision.level, model, ladder: ladderFor(model, tier), reasons: decision.reasons };
}

/**
 * A model's ladder, cut to what the tier may use: a guest's and a free turn's
 * never step up to a member's models when theirs is refused.
 */
export function ladderFor(model: string, tier: Tier): string[] {
  const all = LADDERS[model] ?? [model];
  const allowed = tier === 'one' ? all : all.filter((m) => !MEMBER_ONLY.has(m));
  return uniq([model, ...allowed]);
}

/** Models only Socria One's turns are allowed to fall back to. */
const MEMBER_ONLY = new Set(['gpt-6.1-terra', 'gpt-6.1-sol', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-4o']);

/**
 * The model for a call that is not the reply — the map, a reading, a synthesis,
 * a page of the docs. `deep` work (a whole synthesis) uses the tier's deep model;
 * the rest its standard one. Same overrides, same switch.
 */
export function chooseAuxModel(tier: Tier, kind: 'standard' | 'deep', env: Env = {}, legacy?: string): ModelChoice {
  if (!on(env.LOGOS_ROUTER)) {
    const model = (legacy ?? '').trim() || UNROUTED_MODEL;
    return { tier, level: kind, model, ladder: uniq([model, ...UNROUTED_LADDER]), reasons: ['routing off'], unrouted: true };
  }
  return chooseModel(tier, { level: kind, reasons: [kind === 'deep' ? 'deep work' : 'standard work'] }, env);
}

/**
 * Whether a failure is one a step down the ladder can answer: the model itself
 * refused (an id not enabled on the account, a model withdrawn), or a passing
 * fault the provider's own retries did not clear (a rate limit, its 5xx, a
 * dropped connection) — another model may still answer. NOT a parameter the
 * model does not take: lib/openai-usage.ts asks the same model again without
 * it, and a refusal that names "this model" ("max_tokens is not supported with
 * this model") is the request, never the model. Nor a prompt too long, a
 * policy refusal or the account's spent credit, which every model would refuse
 * the same way.
 */
export function refusedModel(e: unknown): boolean {
  const f = failureOf(e);
  return f === 'model' || f === 'transient';
}

/**
 * Ask the first model on the ladder that answers: a model refused or failing
 * steps down, anything else is thrown as it was. Returns what answered.
 */
export async function firstAccepted<T>(
  ladder: readonly string[],
  make: (model: string) => Promise<T>,
  warn: (from: string, to: string, why: string) => void = () => {},
  /** another failure a lower rung may answer — a model that cannot read images, for a route that sends one */
  also?: (e: unknown) => boolean
): Promise<{ result: T; model: string }> {
  for (let i = 0; ; i++) {
    try {
      return { result: await make(ladder[i]), model: ladder[i] };
    } catch (e) {
      if (!(refusedModel(e) || !!also?.(e)) || i >= ladder.length - 1) throw e;
      warn(ladder[i], ladder[i + 1], String((e as { message?: string })?.message ?? e).slice(0, 160));
    }
  }
}

/**
 * A key the provider uses to keep one conversation's requests on the same
 * cache: the line of thinking's id, hashed so nothing identifying leaves.
 * Stable for a conversation, different between them. FNV-1a, 32-bit.
 */
export function cacheKey(scope: string, id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  let h = 0x811c9dc5;
  for (const ch of `${scope}:${id}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `socria-${scope}-${h.toString(36)}`;
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs.filter(Boolean))];
}

// ── context compression ──────────────────────────────────────────────

/** Socria's older replies are read back at most this long… */
export const OLD_REPLY_CHARS = 2400;
/** …except the newest few messages, read in full. */
export const KEEP_FULL = 4;

/**
 * THE HISTORY, COMPRESSED WHERE IT COSTS NOTHING. Socria's own replies older
 * than the newest few are read back clipped — their opening, where the answer
 * is, and their ending, where the question back was — with a marker between.
 * The person's words are never touched, and nor is the reply they are answering.
 *
 * Deterministic: the same message clips the same way every turn, so the
 * provider's prompt cache still serves the history before it.
 */
export function compressHistory<M extends { role: string; content: string }>(msgs: readonly M[], keepFull = KEEP_FULL, limit = OLD_REPLY_CHARS): M[] {
  const cut = msgs.length - keepFull;
  return msgs.map((m, i) => {
    if (i >= cut || m.role !== 'assistant' || m.content.length <= limit) return m;
    const tail = Math.round(limit * 0.15);
    const head = limit - tail;
    return { ...m, content: `${m.content.slice(0, head).trimEnd()}\n[… shortened …]\n${m.content.slice(-tail).trimStart()}` };
  });
}
