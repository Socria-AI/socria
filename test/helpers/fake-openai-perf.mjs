// A model for the performance benchmark (test/browser/ux-v0/perf-bench.mjs) and the reliability tests.
//
// Each call is answered by STAGE (read from its system prompt, as SocriaUX writes them), after the time
// that stage is set to take: `ttft` until the first output, `total` until the answer is complete. It
// streams when asked (the Responses API's events, or Chat Completions chunks with usage at the end),
// honours the SDK's own request options (a `timeout` throws the SDK's APIConnectionTimeoutError at that
// time; an aborted `signal` throws APIUserAbortError), and a stream the reader stops is recorded as
// abandoned: nothing more is generated, as a provider stops when the connection closes.
//
//   globalThis.__perf = {
//     answer(stage, params)  → an object (sent as JSON), a string, or an Error to throw
//     latency(stage, params) → { ttft, total } in ms
//     reasoning(stage, model)→ reasoning tokens to report (billed as output, as the provider reports them)
//     hang(stage, params)    → true: never answer (a stalled provider); only a timeout or an abort ends it
//     calls: []              → every call: stage, model, stream, outcome, tokens, times
//   }
//
// Tokens are counted at four characters each, the same estimate the strict contract fake uses: they
// measure SocriaUX's own prompts, not a provider's tokenizer.

const STAGES = [
  ['discover', /helping a designer work out what they want to make/],
  ['direction', /asked to see another direction for one aspect/],
  ['art-direction', /SocriaUX's art director/],
  ['generate', /SocriaUX's design generator/],
  ['refine', /changing a generated design by commenting/],
  ['critique', /design reasoning environment inside Socria/],
  ['brief', /design brief|Synthesi[sz]e/i],
];

export function stageOf(p) {
  const sys = String(p?.instructions ?? (p?.messages ?? []).find((m) => m.role === 'system')?.content ?? '');
  return (STAGES.find(([, re]) => re.test(sys)) ?? ['other'])[0];
}

export const tokensOf = (s) => Math.ceil(String(s ?? '').length / 4);
const inputText = (p) => (p.instructions !== undefined ? `${p.instructions}${JSON.stringify(p.input ?? '')}` : JSON.stringify(p.messages ?? []));
const abortError = () => Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' });
const timeoutError = () => Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' });

/** Wait `ms`, unless the request's signal aborts first or its timeout (from `startedAt`) passes first. */
function wait(ms, opts, startedAt) {
  return new Promise((resolve, reject) => {
    const signal = opts?.signal;
    if (signal?.aborted) return reject(abortError());
    const left = Number(opts?.timeout) > 0 ? Number(opts.timeout) - (Date.now() - startedAt) : Infinity;
    const timedOut = left < ms;
    const t = setTimeout(() => (timedOut ? reject(timeoutError()) : resolve()), Math.max(0, timedOut ? left : ms));
    signal?.addEventListener?.('abort', () => (clearTimeout(t), reject(abortError())), { once: true });
  });
}

function config() {
  const g = globalThis;
  g.__perf ??= {};
  g.__perf.calls ??= [];
  return g.__perf;
}

async function respond(api, p, opts) {
  const cfg = config();
  const stage = stageOf(p);
  const startedAt = Date.now();
  const prompt = inputText(p);
  const entry = { api, stage, model: p.model, effort: p.reasoning?.effort ?? p.reasoning_effort ?? null, stream: !!p.stream, outcome: 'pending', inTokens: tokensOf(prompt), outTokens: 0, reasoning: 0, startedAt, firstAt: null, endedAt: null, maxOutput: p.max_output_tokens ?? p.max_completion_tokens ?? p.max_tokens ?? null, prompt };
  cfg.calls.push(entry);
  const end = (outcome) => ((entry.outcome = outcome), (entry.endedAt = Date.now()));
  try {
    if (cfg.hang?.(stage, p)) {
      await wait(10 * 60_000, opts, startedAt);
    }
    const { ttft = 0, total = 0 } = cfg.latency?.(stage, p) ?? {};
    const answer = cfg.answer?.(stage, p);
    if (answer instanceof Error) {
      await wait(Math.min(ttft, 50), opts, startedAt);
      throw answer;
    }
    const text = answer === undefined ? '{}' : typeof answer === 'string' ? answer : JSON.stringify(answer);
    const reasoning = Math.max(0, Math.round(cfg.reasoning?.(stage, p.model) ?? 0));
    entry.reasoning = reasoning;
    entry.outTokens = tokensOf(text) + reasoning;
    const usageResponses = { input_tokens: entry.inTokens, input_tokens_details: { cached_tokens: 0 }, output_tokens: entry.outTokens, output_tokens_details: { reasoning_tokens: reasoning }, total_tokens: entry.inTokens + entry.outTokens };
    const usageChat = { prompt_tokens: entry.inTokens, completion_tokens: entry.outTokens, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: reasoning } };
    if (!p.stream) {
      await wait(total, opts, startedAt);
      entry.firstAt = Date.now();
      end('ok');
      return api === 'responses'
        ? { id: `resp_${cfg.calls.length}`, object: 'response', model: p.model, status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }], usage: usageResponses }
        : { model: p.model, choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: usageChat };
    }
    // a stream: the request is answered at once (headers), the first output after ttft, the rest over the remaining time
    await wait(Math.min(ttft, 30), opts, startedAt);
    // the first output at ttft, the last at total, evenly between: a streamed answer takes exactly as long as a buffered one
    const pieces = Math.max(1, Math.min(12, Math.ceil(text.length / 400)));
    const step = Math.ceil(text.length / pieces);
    const gap = pieces > 1 ? Math.max(0, (total - ttft) / (pieces - 1)) : 0;
    return (async function* () {
      let finished = false;
      try {
        if (api === 'responses') yield { type: 'response.created', response: { id: `resp_${cfg.calls.length}`, model: p.model, status: 'in_progress', output: [], usage: null } };
        await wait(Math.max(0, ttft - (Date.now() - startedAt)), opts, startedAt);
        for (let i = 0; i < pieces; i++) {
          if (i) await wait(gap, opts, startedAt);
          entry.firstAt ??= Date.now();
          const delta = text.slice(i * step, (i + 1) * step);
          if (api === 'responses') yield { type: 'response.output_text.delta', delta };
          else yield { model: p.model, choices: [{ delta: { content: delta } }] };
        }
        // (one piece: the answer is complete at total, not at its first output)
        await wait(Math.max(0, total - (Date.now() - startedAt)), opts, startedAt);
        finished = true;
        if (api === 'responses') yield { type: 'response.completed', response: { id: `resp_${cfg.calls.length}`, model: p.model, status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }], usage: usageResponses } };
        else {
          yield { model: p.model, choices: [{ delta: {}, finish_reason: 'stop' }] };
          if (p.stream_options?.include_usage) yield { model: p.model, choices: [], usage: usageChat };
        }
        end('ok');
      } catch (e) {
        end(e?.name === 'APIUserAbortError' ? 'aborted' : e?.name === 'APIConnectionTimeoutError' ? 'timeout' : 'error');
        throw e;
      } finally {
        // the reader stopped before the end: the connection is closed, and the provider generates nothing more
        if (!finished && entry.outcome === 'pending') end('abandoned');
      }
    })();
  } catch (e) {
    if (entry.outcome === 'pending') end(e?.name === 'APIUserAbortError' ? 'aborted' : e?.name === 'APIConnectionTimeoutError' ? 'timeout' : 'error');
    throw e;
  }
}

export default class OpenAI {
  constructor() {
    this.responses = { create: (p, opts) => respond('responses', p, opts) };
    this.chat = { completions: { create: (p, opts) => respond('chat', p, opts) } };
  }
}
