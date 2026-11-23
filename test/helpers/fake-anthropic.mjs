// A scripted Claude for SocriaUX's route tests: Anthropic's client, as lib/ux-v0/ask.ts uses it.
//
// It shares the OpenAI fake's script and call list (globalThis.__logosScript, __logosCalls, __logosOptions,
// __logosUsage), so a route test reads either provider's calls the same way. Each call takes the next entry
// of the script (an object is answered as its JSON, a string as itself, an Error is thrown) and answers in
// the Messages API's shape: a thinking block, then the text; usage as input_tokens / output_tokens. A
// streamed call answers as the Messages API's events. A model in globalThis.__logosHang never answers: only
// the call's abort signal ends it.
const hang = (opts) =>
  new Promise((_, reject) => {
    const stop = () => reject(Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' }));
    if (opts?.signal?.aborted) return stop();
    const t = setTimeout(() => reject(Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' })), 60_000);
    opts?.signal?.addEventListener?.('abort', () => (clearTimeout(t), stop()), { once: true });
  });

export default class Anthropic {
  constructor(o = {}) {
    globalThis.__claudeKey = o.apiKey;
    this.messages = {
      create: async (body, opts) => {
        const g = globalThis;
        (g.__logosCalls ??= []).push({ ...body, provider: 'anthropic' });
        (g.__logosOptions ??= []).push(opts ?? null);
        if ((g.__logosHang ?? []).includes(body.model)) await hang(opts);
        const next = (g.__logosScript ??= []).shift();
        if (next instanceof Error) throw next;
        const text = next === undefined ? '' : typeof next === 'string' ? next : JSON.stringify(next);
        const u = g.__logosUsage ?? {};
        const usage = { input_tokens: u.prompt_tokens ?? 0, cache_read_input_tokens: u.prompt_tokens_details?.cached_tokens ?? 0, cache_creation_input_tokens: 0, output_tokens: u.completion_tokens ?? 0 };
        if (!body.stream) return { type: 'message', role: 'assistant', model: body.model, content: [{ type: 'thinking', thinking: '…' }, { type: 'text', text }], stop_reason: 'end_turn', usage };
        return (async function* () {
          yield { type: 'message_start', message: { model: body.model, usage: { ...usage, output_tokens: 1 } } };
          yield { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } };
          yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: usage.output_tokens } };
          yield { type: 'message_stop' };
        })();
      },
    };
  }
}
