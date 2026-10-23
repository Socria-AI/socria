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
// stream reader here reads `choices?.[0]` and so passes over it. A provider
// that does not know `stream_options` gets the call exactly as it was asked.
//
// Nothing here changes what a call asks for or returns. `SOCRIA_TOKEN_LOG=off`
// silences it.
//
// SERVER ONLY.

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

/** Whether an error is the provider refusing a parameter it does not know. */
function refusesParam(e: unknown, param: string): boolean {
  const err = e as { status?: number; message?: string; error?: { param?: string; message?: string } } | null;
  if (!err || err.status !== 400) return false;
  return err.error?.param === param || new RegExp(param).test(`${err.message ?? ''} ${err.error?.message ?? ''}`);
}

type Creatable = { chat: { completions: { create: (...args: any[]) => any } } };

const WRAPPED = Symbol.for('socria.tokens.tracked');

/**
 * The same client, its chat completions logged under `route`. Wrapping twice
 * logs once.
 */
export function tracked<T extends Creatable>(client: T, route: string): T {
  const completions = client.chat.completions as { create: (...args: any[]) => any; [WRAPPED]?: boolean };
  if (completions[WRAPPED]) return client;
  const create = completions.create.bind(completions);
  completions.create = async (params: any, ...rest: any[]) => {
    const streamed = !!params?.stream;
    const asked = streamed && !params.stream_options ? { ...params, stream_options: { include_usage: true } } : params;
    let res: any;
    try {
      res = await create(asked, ...rest);
    } catch (e) {
      if (asked === params || !refusesParam(e, 'stream_options')) throw e;
      res = await create(params, ...rest);
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
