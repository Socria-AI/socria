// lib/openai-usage.ts — what each model call cost, said in the logs.
//
// One line per call, with what it read, how much of that the provider served
// from its prompt cache, and what it wrote:
//
//   [tokens] {"route":"logos/map","model":"…","in":19830,"cached":19456,"out":612}
//
// so the spend of a turn can be measured rather than guessed, and a change
// meant to make prompts cacheable can be seen to work (`cached` rises). Read
// the lines back with `node scripts/token-report.mjs < log.txt`.
//
// `tracked(client, route)` wraps an OpenAI client's chat completions so every
// call through it is logged — buffered calls from their `usage`, streamed
// calls by asking for the usage chunk at the end of the stream
// (`stream_options.include_usage`). That final chunk has no choices; every
// stream reader here reads `choices?.[0]` and so passes over it.
//
// AND EVERY CALL IS SHAPED FOR THE MODEL IT GOES TO (lib/model-params.ts).
// Every client in the app is wrapped here, so this is the one place a call
// written as `max_tokens` + `temperature` becomes what a reasoning model takes
// (`max_completion_tokens` with room for its reasoning, an effort, no sampling
// settings it refuses) — and the one place a parameter the provider refuses
// is answered: the call is asked again without it, on the SAME model, up to
// four times. A refused parameter never reaches a route as an error, so no
// route can mistake it for a model that is not there. Each adaptation is said
// in the log. What a call returns is never changed.
//
// AND EVERY CALL MADE FOR A FREE ACCOUNT IS HELD AGAINST ITS WEEK OF TOKENS
// (lib/sleep.ts, lib/token-allowance.ts). Before the call, the metering that
// Sleep Mode registers here (lib/sleep-server.ts onMetering) holds what the
// call may cost — its input, estimated, and the most it may write — or
// refuses it before the provider is asked; a call that can be shortened is
// capped to what the week has left; when it ends, it is settled at what it
// really cost (lib/sleep.ts countedTokens: the input read afresh, not what the
// prompt cache served, plus what it wrote). A call that failed costs nothing,
// so only the attempt that answered is counted; a parameter refused and asked
// again is still one call, held once and settled once. A stream stopped
// before its usage arrived is settled at an estimate of what it read and
// wrote. Nothing is metered unless a route metered the request; Socria One, a
// guest and our own overhead (lib/token-meter.ts uncounted) never are.
//
// `SOCRIA_TOKEN_LOG=off` silences the usage lines.
//
// SERVER ONLY.

import { adaptRefused, REASONING_ROOM, refusedParam, shapeRequest, type Effort } from './model-params';
import { countedTokens } from './sleep';
import { estimateTokens, requestTokens } from './token-allowance';

/** One call, as the metering is asked to hold it. */
export interface MeteredCall {
  route: string;
  /** the input it sends, estimated */
  input: number;
  /** the most it may write, as asked (reasoning included) */
  output: number;
  /** may it be shortened to fit what the week has left */
  cappable: boolean;
  /** the least a shortened call is left to write */
  floor: number;
}

/** A held call: what it may write, and how it settles. */
export interface MeterHold {
  /** what the call may write at most; null leaves its cap as asked */
  outputCap: number | null;
  /** the call ended, having cost `tokens` (0: it never answered) */
  end(tokens: number): void;
}

/**
 * Whoever holds and settles a call's tokens — Sleep Mode (lib/sleep-server.ts) registers itself
 * here when a route loads it, so this file reaches no database and stays usable anywhere a model
 * is called. `begin` answers null for a call nobody counts, and throws — before the provider is
 * asked — for one that cannot be held.
 */
export interface Metering {
  begin(call: MeteredCall): Promise<MeterHold | null>;
}
let metering: Metering | null = null;
export function onMetering(m: Metering | null): void {
  metering = m;
}

/** The least a shortened answer is left to write, before any reasoning room. */
export const MIN_ANSWER_TOKENS = 300;
/** What a call that names no cap is held at for its output. */
const UNCAPPED_OUTPUT = 4_096;

/** The most a call may write, as it is about to be sent. */
function outputOf(params: any): number {
  const v = params?.max_completion_tokens ?? params?.max_tokens;
  return typeof v === 'number' && v > 0 ? Math.ceil(v) : UNCAPPED_OUTPUT;
}
/** The room a reasoning call keeps for its reasoning (lib/model-params.ts shapeRequest). */
function reasoningRoomOf(params: any): number {
  const e = typeof params?.reasoning_effort === 'string' ? (params.reasoning_effort as Effort) : null;
  return e && typeof params?.max_completion_tokens === 'number' ? (REASONING_ROOM[e] ?? 0) : 0;
}
/** The least a shortened call is left to write: an answer, and any room it keeps for its reasoning. */
export function floorFor(params: any): number {
  return MIN_ANSWER_TOKENS + reasoningRoomOf(params);
}
/** A call that answers in plain text can be shortened; one that answers in JSON cannot. */
const cappableCall = (params: any) => !params?.response_format;
/** The call, writing no more than `cap`. */
function capped(params: any, cap: number): any {
  if (typeof params?.max_completion_tokens === 'number') return { ...params, max_completion_tokens: Math.min(params.max_completion_tokens, cap) };
  if (typeof params?.max_tokens === 'number') return { ...params, max_tokens: Math.min(params.max_tokens, cap) };
  return { ...params, max_tokens: cap };
}
/** What a buffered answer wrote, for a call whose provider sent no usage. */
const textOf = (res: any) => String(res?.choices?.[0]?.message?.content ?? '');

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
  completion_tokens_details?: { reasoning_tokens?: number | null } | null;
}

/** One call's cost, as a log line — or nothing, when there is no usage to say or it is switched off. */
export function logUsage(route: string, model: string | undefined, usage: Usage | null | undefined): void {
  if (!usage || process.env.SOCRIA_TOKEN_LOG === 'off') return;
  const line: Record<string, string | number> = {
    route,
    model: model || 'unknown',
    in: usage.prompt_tokens ?? 0,
    cached: usage.prompt_tokens_details?.cached_tokens ?? 0,
    out: usage.completion_tokens ?? 0,
  };
  const reasoning = usage.completion_tokens_details?.reasoning_tokens;
  if (reasoning) line.reasoning = reasoning;
  console.info(`[tokens] ${JSON.stringify(line)}`);
}

type Creatable = { chat: { completions: { create: (...args: any[]) => any } } };

const WRAPPED = Symbol.for('socria.tokens.tracked');

/** How many refused parameters one call answers before it gives up: each answer takes one parameter out. */
const ADAPTATIONS = 4;

/**
 * The same client, its chat completions shaped for the model each call goes to
 * and logged under `route`. Wrapping twice shapes and logs once.
 */
export function tracked<T extends Creatable>(client: T, route: string): T {
  const completions = client.chat.completions as { create: (...args: any[]) => any; [WRAPPED]?: boolean };
  if (completions[WRAPPED]) return client;
  const create = completions.create.bind(completions);
  completions.create = async (params: any, ...rest: any[]) => {
    const streamed = !!params?.stream;
    const withUsage = streamed && !params.stream_options ? { ...params, stream_options: { include_usage: true } } : params;
    let asked = shapeRequest(withUsage, process.env);
    // THE WEEK'S TOKENS: held before the provider is asked (a refusal is thrown from here, and no
    // model is called), capped to what is left where the answer can be shortened, settled at the end
    const input = requestTokens(asked);
    const hold = metering
      ? await metering.begin({ route, input, output: outputOf(asked), cappable: cappableCall(asked), floor: floorFor(asked) })
      : null;
    const fit = (p: any) => (hold?.outputCap != null && cappableCall(p) ? capped(p, hold.outputCap) : p);
    asked = fit(asked);
    let res: any;
    for (let tries = 0; ; tries++) {
      try {
        res = await create(asked, ...rest);
        break;
      } catch (e) {
        // A PARAMETER IT DOES NOT TAKE, NOT A MODEL THAT IS NOT THERE: the call again without it, on the same
        // model — the usage report and the cache hint are extras, a sampling setting is a preference, and a
        // cap or an effort is renamed or relaxed (lib/model-params.ts adaptRefused)
        const again = tries < ADAPTATIONS ? adaptRefused(asked, e) : null;
        if (!again) {
          // it never answered: nothing is counted, and what it held is given back
          hold?.end(0);
          throw e;
        }
        console.warn('[openai] %s refused %s on %s; asked again without it', String(asked?.model ?? '?'), refusedParam(e) ?? 'a parameter', route);
        asked = fit(again);
      }
    }
    if (!streamed) {
      logUsage(route, res?.model ?? params?.model, res?.usage);
      hold?.end(res?.usage ? countedTokens(res.usage) : input + estimateTokens(textOf(res)));
      return res;
    }
    return watch(res, route, params?.model, hold, input);
  };
  completions[WRAPPED] = true;
  return client;
}

/**
 * A stream that logs its usage chunk when it ends — the same object, so nothing else about it
 * changes — and settles the call's hold then: at the usage reported, or, when the stream stopped
 * before its usage arrived (the reader stopped, the person pressed stop or left), at an estimate
 * of what it read and what it had written by then.
 */
function watch(stream: any, route: string, model: string | undefined, hold: MeterHold | null = null, input = 0): any {
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
    hold?.end(input);
    return stream;
  }
  const inner = stream[Symbol.asyncIterator].bind(stream);
  stream[Symbol.asyncIterator] = async function* () {
    let usage: Usage | null = null;
    let served: string | undefined;
    let written = 0;
    try {
      for await (const chunk of { [Symbol.asyncIterator]: inner }) {
        if (chunk?.usage) usage = chunk.usage;
        served ||= chunk?.model;
        const d = chunk?.choices?.[0]?.delta?.content;
        if (hold && typeof d === 'string') written += estimateTokens(d);
        yield chunk;
      }
    } finally {
      logUsage(route, served ?? model, usage);
      hold?.end(usage ? countedTokens(usage) : input + written);
    }
  };
  return stream;
}
