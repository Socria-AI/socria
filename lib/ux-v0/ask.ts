import 'server-only';
// lib/ux-v0/ask.ts — one JSON call to the model, the house way.
//
// The client is the route's own `tracked(new OpenAI(...))` (lib/openai-usage.ts:
// usage logged, parameters shaped for the model, and the call metered against
// the week's tokens in the route's context). The ladder steps down when a
// model is refused — and, for a call that sends an image, when a model cannot
// see (lib/model-params.ts cannotSee). The answer is parsed as JSON, leniently
// (a fenced block is read too); what it means is decided by the caller's own
// validator, never here.
//
// THE RESPONSES API (GPT-6.1 Sol, lib/ux-v0/model.ts). When SocriaUX runs on
// it, the same call goes to `client.responses.create`: the system prompt as
// `instructions`, the user's words (and any image) as `input`, the effort as
// `reasoning.effort`, and the answer's shape as a strict JSON schema where
// the call has one (lib/ux-v0/schemas.ts), plain JSON otherwise. `store` is
// off: a designer's brief, notes and pages are not kept on OpenAI's side for
// later retrieval. The tracked client shapes the call for each model on the
// ladder (lib/model-params.ts shapeResponsesRequest), so a rung without
// reasoning, or without structured outputs, is still asked in a way it takes.
//
// STREAMED, CANCELLABLE AND ON A DEADLINE (`stream`, `signal`, `deadlineAt`). A
// route's call is streamed: the time to the first output is measured, progress
// is reported as it happens (the model has started; it is writing, so many
// characters so far), and when the designer cancels or the operation's
// deadline passes the request is aborted, which closes the stream and stops
// the provider generating (and billing) more. A call never waits past its
// deadline; a model that is not reached in time is not stepped down from (the
// next one would start with no time left). `cacheKey` keeps calls whose
// prompts share a long stable prefix on the provider's same prompt cache, and
// `reasoningRoom` bounds the reasoning's room above the answer's cap.
//
// CLAUDE (the Messages API, lib/ux-v0/model.ts). A Claude model is asked through
// Anthropic's own client, with ANTHROPIC_API_KEY: the system prompt as a cached
// block (the stable prefix is read from the prompt cache on the next call), the
// user's words and any image as the message, the effort as `output_config.effort`,
// and the answer's shape as a JSON schema where the call has one. No sampling
// settings are sent (the model refuses them) and no answer is prefilled. Its
// thinking is the model's own and is billed as output, so the reasoning room is
// added to the answer's cap. A refusal, or an answer cut at its cap, is said as
// incomplete, never read as an answer. The call is held against the week's tokens
// like an OpenAI one (lib/openai-usage.ts holdCall), and its usage priced with
// the cache writes at their own price.

import Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import { cannotSee, type Effort } from '../model-params';
import { costOf, firstAccepted, PRICES } from '../model-router';
import { holdCall, responseText, usageFromResponses } from '../openai-usage';
import { countedTokens } from '../sleep';
import { estimateTokens } from '../token-allowance';
import { socriauxApi, socriauxEffort, usageOf, type Api, type Route, type Tier } from './model';
import type { JsonFormat } from './schemas';
import type { Usage } from './types';

export interface AskOptions {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  /** images for the model to look at: a crop, a thumbnail */
  images?: { url: string; detail: 'low' | 'high' }[];
  label: string;
  /** the answer's shape, for the Responses API's structured outputs (lib/ux-v0/schemas.ts formatFor) */
  format?: JsonFormat;
  /** give up on the call after this long (ms), so a slow model leaves time to ask another within the route's limit */
  timeoutMs?: number;
  /** how many times a structured answer cut at its cap is asked again in JSON mode (default 1) */
  maxRetries?: number;
  /** stream the answer: measure the first output, report progress, and let an abort stop the provider */
  stream?: boolean;
  /** aborts the call (the designer cancelled, or the operation's deadline passed) */
  signal?: AbortSignal;
  /** the moment (epoch ms) the call must be over by */
  deadlineAt?: number;
  /** told as the call goes: asked, the first output, how much is written */
  onProgress?: (p: AskProgress) => void;
  /** the provider's prompt-cache key for calls that share a stable prefix (lib/model-router.ts cacheKey) */
  cacheKey?: string;
  /** the most reasoning room (tokens) above the answer's cap; the model's own default room when unset */
  reasoningRoom?: number;
}

export interface AskProgress {
  phase: 'asked' | 'writing';
  model: string;
  /** characters of the answer written so far (writing) */
  chars?: number;
}

export interface Asked {
  json: unknown;
  raw: string;
  usage: Usage;
  model: string;
  /** which API answered, and at what effort (for the logs and the evaluation) */
  api: Api;
  effort: Effort | 'default';
  /** the answer stopped early: its cap, or a refusal, or the provider's own reason */
  incomplete: string | null;
  /** a structured answer was cut at its cap and asked again in JSON mode (both calls billed), else null */
  retried?: string | null;
  /** the tier the call was routed to (lib/ux-v0/model.ts routeFor), when it was routed */
  tier?: Tier;
  /** the routed model did not answer in time and the economy model answered instead: why, else absent */
  fellBack?: string;
  /** from asking the model to its first output (streamed calls), else null */
  ttftMs?: number | null;
  /** from asking the model to its answer, every attempt included */
  modelMs?: number;
  /** requests made to the provider for this answer: one, plus every step down the ladder, retry or fallback */
  attempts?: number;
}

type Env = Record<string, string | undefined>;

export function readJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

// ── Claude ───────────────────────────────────────────────────────────

/** The part of Anthropic's client SocriaUX uses: one message, streamed or whole. */
export interface ClaudeClient {
  messages: { create(body: any, options?: any): Promise<any> };
}
let claude: ClaudeClient | null = null;
/** The Anthropic client, made once on first use; `setClaudeClient` puts a fake in its place for the tests. */
export function claudeClient(): ClaudeClient {
  claude ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 }) as unknown as ClaudeClient;
  return claude;
}
export function setClaudeClient(c: ClaudeClient | null): void {
  claude = c;
}

/** The efforts Claude takes: SocriaUX's none and minimal are its low. */
const claudeEffort = (e: Effort | undefined): 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined =>
  !e ? undefined : e === 'none' || e === 'minimal' ? 'low' : (e as 'low' | 'medium' | 'high' | 'xhigh' | 'max');

/** An image for Claude: a link as a link, a data URL as its media type and bytes. */
function claudeImage(url: string): any {
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/i.exec(url);
  return m ? { type: 'image', source: { type: 'base64', media_type: m[1].toLowerCase(), data: m[2] } } : { type: 'image', source: { type: 'url', url } };
}

interface ClaudeUsage {
  input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  output_tokens?: number | null;
  output_tokens_details?: { thinking_tokens?: number | null } | null;
}

/**
 * A Claude answer's usage, in the house shape and priced. Anthropic counts the input apart from what the cache
 * served and what it wrote; here `input` is all three (as OpenAI reports it) and `cached` what the cache served.
 * A cache write costs a quarter more than plain input, and is priced so.
 */
export function usageOfClaude(model: string, u: ClaudeUsage | null | undefined): Usage {
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  const read = n(u?.cache_read_input_tokens);
  const wrote = n(u?.cache_creation_input_tokens);
  const input = n(u?.input_tokens) + read + wrote;
  const output = n(u?.output_tokens);
  const reasoning = Math.min(output, n(u?.output_tokens_details?.thinking_tokens));
  const base = costOf(model, { input, cached: read, output });
  const cost = base == null ? null : base + (wrote * (PRICES[model]?.input ?? 0) * 0.25) / 1_000_000;
  return { model, input, cached: read, output, ...(reasoning ? { reasoning } : {}), cost };
}

/** A Claude answer, read whole: a message as it is, or a stream of events read to its end (the first output timed). */
async function readClaude(res: any, first: () => void, writing: (chars: number) => void): Promise<{ text: string; stop: string | null; usage: ClaudeUsage | null }> {
  if (!iterable(res)) {
    const text = (res?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => String(b.text ?? '')).join('');
    return { text, stop: res?.stop_reason ?? null, usage: res?.usage ?? null };
  }
  let text = '';
  let stop: string | null = null;
  let usage: any = null;
  let ended = false;
  for await (const ev of res) {
    const t = ev?.type;
    if (t === 'message_start') usage = { ...(ev.message?.usage ?? {}) };
    else if (t === 'content_block_delta' && ev.delta?.type === 'text_delta' && typeof ev.delta.text === 'string') {
      if (!text) first();
      text += ev.delta.text;
      writing(text.length);
    } else if (t === 'message_delta') {
      if (ev.delta?.stop_reason) stop = ev.delta.stop_reason;
      for (const [k, v] of Object.entries(ev.usage ?? {})) if (v != null) usage = { ...(usage ?? {}), [k]: v };
    } else if (t === 'message_stop') ended = true;
    else if (t === 'error') throw Object.assign(new Error(String(ev.error?.message ?? 'The stream failed.')), { status: ev.error?.type === 'overloaded_error' ? 529 : /rate/.test(String(ev.error?.type ?? '')) ? 429 : 500 });
  }
  if (!ended && !stop) throw Object.assign(new Error('The answer stopped before it was complete (the stream was interrupted).'), { name: 'SocriauxInterrupted', status: 502 });
  return { text, stop, usage };
}

/** Claude refused the answer's schema (a 400 naming it): asked again without it, in plain JSON. */
const schemaRefused = (e: unknown): boolean => (e as { status?: number })?.status === 400 && /schema|output_config|format/i.test(String((e as { message?: string })?.message ?? ''));

const isRoute = (v: Env | Route): v is Route => typeof (v as Route).stage === 'string' && typeof (v as Route).tier === 'string';

/**
 * One JSON call. `how` is the stage's route (lib/ux-v0/model.ts routeFor: its API and effort), or, as before
 * routing, the environment the API and effort are read from.
 */
/** A call that was aborted by its signal: the designer cancelled, or a deadline passed. */
export const aborted = (e: unknown): boolean => /APIUserAbortError|AbortError/.test(String((e as { name?: string })?.name ?? '')) || /aborted/i.test(String((e as { message?: string })?.message ?? ''));

const iterable = (v: any): boolean => !!v && typeof v[Symbol.asyncIterator] === 'function';

/**
 * A Responses API answer, read whole: a buffered response as it is, or a stream read to its end (the first
 * output timed, progress told). A stream that ends before its final event is an interrupted answer.
 */
async function readResponses(res: any, first: () => void, writing: (chars: number) => void): Promise<any> {
  if (!iterable(res)) return res;
  let text = '';
  let final: any = null;
  for await (const ev of res) {
    const t = ev?.type;
    if (t === 'response.output_text.delta' && typeof ev.delta === 'string') {
      if (!text) first();
      text += ev.delta;
      writing(text.length);
    } else if (t === 'response.completed' || t === 'response.incomplete') final = ev.response;
    else if (t === 'response.failed') throw Object.assign(new Error(String(ev.response?.error?.message ?? 'The answer failed.')), { status: 500 });
    else if (t === 'error') throw Object.assign(new Error(String(ev.message ?? 'The stream failed.')), { status: /rate/.test(String(ev.code ?? '')) ? 429 : 500 });
  }
  if (!final) throw Object.assign(new Error('The answer stopped before it was complete (the stream was interrupted).'), { name: 'SocriauxInterrupted', status: 502 });
  if (!responseText(final) && text) final = { ...final, output: [{ type: 'message', content: [{ type: 'output_text', text }] }] };
  return final;
}

/** A Chat Completions answer, read whole: buffered, or a stream (with its usage in the last chunk) read to its end. */
async function readChat(res: any, first: () => void, writing: (chars: number) => void): Promise<any> {
  if (!iterable(res)) return res;
  let text = '';
  let finish: string | null = null;
  let usage: any = null;
  for await (const chunk of res) {
    const d = chunk?.choices?.[0]?.delta?.content;
    if (typeof d === 'string' && d) {
      if (!text) first();
      text += d;
      writing(text.length);
    }
    if (chunk?.choices?.[0]?.finish_reason) finish = chunk.choices[0].finish_reason;
    if (chunk?.usage) usage = chunk.usage;
  }
  if (!finish && !usage) throw Object.assign(new Error('The answer stopped before it was complete (the stream was interrupted).'), { name: 'SocriauxInterrupted', status: 502 });
  return { choices: [{ message: { content: text }, finish_reason: finish ?? 'stop' }], usage };
}

export async function askJson(openai: OpenAI, ladder: string[], o: AskOptions, how: Env | Route = process.env): Promise<Asked> {
  const route = isRoute(how) ? how : null;
  const api = route ? route.api : socriauxApi(how as Env);
  const effort = route ? route.effort : socriauxEffort(how as Env);
  const tag = (usage: Usage): Usage => (route ? { ...usage, stage: route.stage, tier: route.tier, effort: effort ?? 'default' } : usage);
  const started = Date.now();
  let firstAt: number | null = null;
  let attempts = 0;
  // what the SDK is told: never past the deadline, never its own retries (the ladder and the deadline decide), and
  // the abort signal; without any of these, the call is made exactly as before
  const requestOptions = (): any => {
    const left = o.deadlineAt ? Math.max(1, o.deadlineAt - Date.now()) : null;
    const timeout = o.timeoutMs && left ? Math.min(o.timeoutMs, left) : o.timeoutMs ?? left;
    if (!timeout && !o.signal) return undefined;
    return { ...(timeout ? { timeout, maxRetries: 0 } : { maxRetries: 0 }), ...(o.signal ? { signal: o.signal } : {}) };
  };
  // a model not reached before the deadline is not asked at all: the next rung would begin with no time left
  const beforeDeadline = () => {
    if (o.signal?.aborted) throw Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' });
    if (o.deadlineAt && o.deadlineAt - Date.now() < 1500) throw Object.assign(new Error('no time left before the deadline'), { name: 'SocriauxTimeout' });
  };
  const markFirst = () => {
    firstAt ??= Date.now();
  };
  const told = (model: string) => (chars: number) => o.onProgress?.({ phase: 'writing', model, chars });
  const extra = { ...(o.stream ? { stream: true } : {}), ...(o.cacheKey ? { prompt_cache_key: o.cacheKey } : {}), ...(typeof o.reasoningRoom === 'number' ? { reasoning_room: o.reasoningRoom } : {}) };
  const done = (a: Omit<Asked, 'ttftMs' | 'modelMs' | 'attempts'>): Asked => ({ ...a, ttftMs: firstAt == null ? null : firstAt - started, modelMs: Date.now() - started, attempts });
  // a call past its time limit is not a model to step down from (the next rung would get the whole limit again,
  // past the route's own): it is thrown as itself, for askRouted to ask the economy model instead
  // (an abort by the caller's own signal is the caller's: a cancel or a deadline, said as such, never as this timeout)
  const limit = <T>(p: Promise<T>): Promise<T> =>
    o.timeoutMs || o.deadlineAt
      ? p.catch((e) => {
          if (o.signal?.aborted) throw e;
          if (/APIConnectionTimeoutError|AbortError/.test(String((e as { name?: string })?.name ?? '')) || /timed out/i.test(String((e as { message?: string })?.message ?? ''))) throw Object.assign(new Error(`no answer within ${o.timeoutMs ?? Math.max(0, (o.deadlineAt ?? Date.now()) - started)} ms`), { name: 'SocriauxTimeout' });
          throw e;
        })
      : p;
  const retries = Math.max(0, Math.min(2, o.maxRetries ?? 1));
  const warn = (from: string, to: string, why: string) => console.warn('ux-v0 %s: %s refused (%s); asking %s', o.label, from, why, to);
  const also = o.images?.length ? cannotSee : undefined;
  if (api === 'responses') {
    const make = (format: JsonFormat | undefined) => async (model: string): Promise<any> => {
      beforeDeadline();
      attempts++;
      o.onProgress?.({ phase: 'asked', model });
      const res = await limit((openai as any).responses.create(
        {
        model,
        instructions: o.system,
        input: [
          {
            role: 'user',
            // plain JSON mode on the Responses API needs the word in the INPUT, not only in the instructions
            // (a 400 otherwise, found by the first live run): said once, at the end, where a schema is not given
            content: [{ type: 'input_text', text: format ? o.user : `${o.user}\n\nAnswer with the one JSON object described.` }, ...(o.images ?? []).map((im) => ({ type: 'input_image', image_url: im.url, detail: im.detail }))],
          },
        ],
        // the cap for the answer: the tracked client gives the reasoning its room on top
        max_output_tokens: o.maxTokens,
        temperature: o.temperature ?? 0.5,
        ...(effort ? { reasoning: { effort } } : {}),
        text: { format: format ?? { type: 'json_object' } },
        store: false,
        ...extra,
        },
        requestOptions()
      ));
      return limit(readResponses(res, markFirst, told(model)));
    };
    const read = (result: any) => {
      const refused = (result?.output ?? []).some((item: any) => item?.type === 'message' && (item.content ?? []).some((c: any) => c?.type === 'refusal'));
      const incomplete = refused ? 'refusal' : result?.status === 'incomplete' ? String(result?.incomplete_details?.reason ?? 'incomplete') : null;
      return { raw: responseText(result), incomplete };
    };
    const first = await firstAccepted(ladder, make(o.format), warn, also);
    let { model } = first;
    let { raw, incomplete } = read(first.result);
    let usage = usageOf(model, usageFromResponses(first.result?.usage) as any);
    let retried: string | null = null;
    if (incomplete) console.warn('ux-v0 %s: %s stopped early (%s)', o.label, model, incomplete);
    // A STRUCTURED ANSWER THAT RAN ON TO ITS CAP. In the live evaluation a strict-schema answer now and then
    // never closed: it wrote until the cap (about 17,000 tokens, two minutes) with little reasoning, the loop
    // constrained decoding can fall into. Asked once more in plain JSON mode, on the same model, it answers;
    // both calls are billed and counted. (Plain JSON mode was not seen to do this.)
    if (incomplete === 'max_output_tokens' && o.format && retries > 0) {
      retried = 'structured answer cut at its cap; asked again in JSON mode';
      console.warn('ux-v0 %s: asking %s again in JSON mode', o.label, model);
      const again = await firstAccepted([model], make(undefined), warn, also);
      const second = usageOf(model, usageFromResponses(again.result?.usage) as any);
      usage = { ...second, input: usage.input + second.input, cached: usage.cached + second.cached, output: usage.output + second.output, cost: usage.cost == null || second.cost == null ? null : usage.cost + second.cost };
      ({ raw, incomplete } = read(again.result));
      model = again.model;
      if (incomplete) console.warn('ux-v0 %s: %s stopped early again (%s)', o.label, model, incomplete);
    }
    return done({ json: readJson(raw), raw, usage: tag(usage), model, api, effort: effort ?? 'default', incomplete, retried, ...(route ? { tier: route.tier } : {}) });
  }
  if (api === 'anthropic') {
    const client = claudeClient();
    const level = claudeEffort(effort);
    // the answer's cap, and the thinking's room on top of it (thinking is billed as output and counts against it)
    const cap = o.maxTokens + Math.max(0, o.reasoningRoom ?? 4096);
    const make = (format: JsonFormat | undefined) => async (model: string) => {
      beforeDeadline();
      const body: any = {
        model,
        max_tokens: cap,
        // the stable instructions as one cached block: the next call with the same prefix reads it from the cache
        system: [{ type: 'text', text: o.system, cache_control: { type: 'ephemeral' } }],
        messages: [
          {
            role: 'user',
            content: [...(o.images ?? []).map((im) => claudeImage(im.url)), { type: 'text', text: format ? o.user : `${o.user}\n\nAnswer with the one JSON object described, and nothing else.` }],
          },
        ],
        ...(level || format ? { output_config: { ...(level ? { effort: level } : {}), ...(format ? { format: { type: 'json_schema', schema: format.schema } } : {}) } } : {}),
        ...(o.stream ? { stream: true } : {}),
      };
      const input = estimateTokens(o.system) + estimateTokens(o.user) + (o.images?.length ?? 0) * 1600;
      const hold = await holdCall({ route: o.label, input, output: cap, cappable: false, floor: cap });
      attempts++;
      o.onProgress?.({ phase: 'asked', model });
      try {
        const res = await limit(client.messages.create(body, requestOptions()));
        const read = await limit(readClaude(res, markFirst, told(model)));
        const u = usageOfClaude(model, read.usage);
        hold?.end(read.usage ? countedTokens({ prompt_tokens: u.input, prompt_tokens_details: { cached_tokens: u.cached }, completion_tokens: u.output }) : input + estimateTokens(read.text));
        return { ...read, priced: u };
      } catch (e) {
        hold?.end(0);
        throw e;
      }
    };
    let first: { result: Awaited<ReturnType<ReturnType<typeof make>>>; model: string };
    try {
      first = await firstAccepted(ladder, make(o.format), warn, also);
    } catch (e) {
      if (!o.format || !schemaRefused(e)) throw e;
      console.warn('ux-v0 %s: %s refused the answer\'s schema; asking again in plain JSON', o.label, ladder[0]);
      first = await firstAccepted(ladder, make(undefined), warn, also);
    }
    const { model, result } = first;
    const incomplete = result.stop === 'refusal' ? 'refusal' : result.stop === 'max_tokens' ? 'max_output_tokens' : result.stop === 'model_context_window_exceeded' ? 'context_window' : null;
    if (incomplete) console.warn('ux-v0 %s: %s stopped early (%s)', o.label, model, incomplete);
    return done({ json: incomplete === 'refusal' ? null : readJson(result.text), raw: result.text, usage: tag(result.priced), model, api, effort: effort ?? 'default', incomplete, retried: null, ...(route ? { tier: route.tier } : {}) });
  }
  const userContent: any = o.images?.length
    ? [{ type: 'text', text: o.user }, ...o.images.map((im) => ({ type: 'image_url', image_url: { url: im.url, detail: im.detail } }))]
    : o.user;
  const make = async (model: string) => {
    beforeDeadline();
    attempts++;
    o.onProgress?.({ phase: 'asked', model });
    const res = await limit(openai.chat.completions.create(
      {
        model,
        temperature: o.temperature ?? 0.5,
        max_tokens: o.maxTokens,
        ...(effort ? { reasoning_effort: effort } : {}),
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: o.system },
          { role: 'user', content: userContent },
        ],
        ...extra,
        ...(o.stream ? { stream_options: { include_usage: true } } : {}),
      } as any,
      requestOptions()
    ));
    return limit(readChat(res, markFirst, told(model)));
  };
  const { result, model } = await firstAccepted(ladder, make, warn, also);
  const raw = (result as any).choices?.[0]?.message?.content ?? '';
  const finish = (result as any).choices?.[0]?.finish_reason;
  const incomplete = finish === 'length' || finish === 'content_filter' ? String(finish) : null;
  return done({ json: readJson(raw), raw, usage: tag(usageOf(model, (result as any).usage)), model, api, effort: effort ?? 'default', incomplete, retried: null, ...(route ? { tier: route.tier } : {}) });
}

/** A call that did not answer in time (the SDK's own timeout, or an abort). */
export const timedOut = (e: unknown): boolean => String((e as { name?: string })?.name ?? '') === 'SocriauxTimeout';

/** The premium model's time limit, unless SOCRIAUX_PREMIUM_TIMEOUT_MS says otherwise. */
export const PREMIUM_TIMEOUT_MS = 40_000;

/**
 * What the economy model is left when the premium model is too slow: its slowest answer in the live run of 18
 * November 2026 for that stage (GPT-6 Luna: generation 10.0 s, art direction 8.5 s, the brief 7.6 s, a critique
 * 4.9 s, a question 4.0 s) with half again on top, and never less than 8 s.
 */
export const ECONOMY_RESERVE_MS: Record<string, number> = { generate: 15_000, 'art-direction': 13_000, brief: 12_000, 'refine-brief': 12_000, critique: 9_000, refine: 8_000, discover: 8_000, direction: 8_000 };

/**
 * One routed call. A PREMIUM call gets a time limit (SOCRIAUX_PREMIUM_TIMEOUT_MS, default 40 s, and never so
 * long that the economy model's reserve no longer fits before the operation's deadline), so a slow answer
 * leaves room to ask the economy model instead; the designer is told it fell back. The slow call is aborted,
 * which stops a streamed answer at the provider. Its cost cannot be measured (no usage comes back) and is not
 * invented. The designer's own cancel, or the operation's deadline, ends both: neither is a reason to fall back.
 */
export async function askRouted(openai: OpenAI, route: Route, o: AskOptions, economy: Route | null, env: Env = process.env): Promise<Asked> {
  if (route.tier !== 'premium' || !economy || (economy.model === route.model && economy.effort === route.effort)) return askJson(openai, route.ladder, o, route);
  const n = parseInt(env.SOCRIAUX_PREMIUM_TIMEOUT_MS ?? '', 10);
  let timeoutMs = Number.isFinite(n) && n >= 5000 ? Math.min(n, 55_000) : PREMIUM_TIMEOUT_MS;
  if (o.deadlineAt) timeoutMs = Math.max(5000, Math.min(timeoutMs, o.deadlineAt - Date.now() - (ECONOMY_RESERVE_MS[route.stage] ?? 8000)));
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  if (o.signal?.aborted) stop();
  o.signal?.addEventListener?.('abort', stop, { once: true });
  const timer = setTimeout(stop, timeoutMs);
  const t0 = Date.now();
  try {
    return await askJson(openai, route.ladder, { ...o, timeoutMs, signal: ctl.signal }, route);
  } catch (e) {
    const tooSlow = !o.signal?.aborted && (timedOut(e) || (ctl.signal.aborted && aborted(e)));
    if (!tooSlow) throw e;
    console.warn('ux-v0 %s: %s gave no answer in %d s; asking %s', o.label, route.model, Math.round(timeoutMs / 1000), economy.model);
    const asked = await askJson(openai, economy.ladder, o, economy);
    return { ...asked, fellBack: `${route.model} gave no answer in ${Math.round(timeoutMs / 1000)} seconds, so ${asked.model} answered instead.`, attempts: (asked.attempts ?? 1) + 1, modelMs: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener?.('abort', stop);
  }
}
