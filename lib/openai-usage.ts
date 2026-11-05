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
// `SOCRIA_TOKEN_LOG=off` silences the usage lines.
//
// SERVER ONLY.

/**
 * Whoever counts what a call spent — Sleep Mode (lib/sleep-server.ts) registers itself here when a
 * route loads it, so this file imports nothing and stays usable anywhere a model is called.
 */
import { adaptRefused, refusedParam, shapeRequest } from './model-params';

let usageSink: ((route: string, usage: Usage) => void) | null = null;
export function onUsage(sink: (route: string, usage: Usage) => void): void {
  usageSink = sink;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
  completion_tokens_details?: { reasoning_tokens?: number | null } | null;
}

/** One call's cost, as a log line — or nothing, when there is no usage to say or it is switched off. */
export function logUsage(route: string, model: string | undefined, usage: Usage | null | undefined): void {
  // a free account's day of tokens (lib/sleep-server.ts registers it): every call, input and output —
  // counted whether or not the log line is written
  if (usage && usageSink) usageSink(route, usage);
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
        if (!again) throw e;
        console.warn('[openai] %s refused %s on %s; asked again without it', String(asked?.model ?? '?'), refusedParam(e) ?? 'a parameter', route);
        asked = again;
      }
    }
    if (!streamed) {
      logUsage(route, res?.model ?? params?.model, res?.usage);
      return res;
    }
    return watch(res, route, params?.model);
  };
  completions[WRAPPED] = true;
  return client;
}

/** A stream that logs its usage chunk when it ends — the same object, so nothing else about it changes. */
function watch(stream: any, route: string, model: string | undefined): any {
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') return stream;
  const inner = stream[Symbol.asyncIterator].bind(stream);
  stream[Symbol.asyncIterator] = async function* () {
    let usage: Usage | null = null;
    let served: string | undefined;
    try {
      for await (const chunk of { [Symbol.asyncIterator]: inner }) {
        if (chunk?.usage) usage = chunk.usage;
        served ||= chunk?.model;
        yield chunk;
      }
    } finally {
      logUsage(route, served ?? model, usage);
    }
  };
  return stream;
}
