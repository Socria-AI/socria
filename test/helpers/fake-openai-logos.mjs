// A scripted model for the Logos routes.
//
// Every call is recorded in globalThis.__logosCalls. A buffered call (the map
// extractor, the second pass) takes the next entry of globalThis.__logosScript:
// an object is returned as its JSON, a string as itself, an Error is thrown,
// and an exhausted script returns an empty completion. A streamed call (the
// reply) records its system prompt in globalThis.__logosPrompts and streams
// globalThis.__logosReply — in one delta, or, when globalThis.__logosChunk is
// a positive number, in deltas of that many characters (as a real stream
// arrives: a fence, a quotation or a table row split across deltas). A streamed
// call to a model listed in globalThis.__logosRefuse is refused as an unknown id
// (a 404, as the provider refuses a model not enabled on the account). With
// globalThis.__logosUsage set, every call reports that usage as the provider
// does — a final chunk with no choices on a stream, `usage` on a buffered call —
// so what a request spends can be counted (lib/sleep-server.ts).
//
// "Its system prompt" is every system message, in order: the reply sends the
// part that holds for the whole line of thinking first and this turn's
// context just before the newest message (app/api/logos/chat/route.ts), and a
// test reads the two as the one prompt they are (./prompt.mjs).
import { systemOf } from './prompt.mjs';

// The Responses API (SocriaUX on GPT-6.1 Sol, lib/ux-v0/ask.ts): the same script, recorded in the same
// list, answered in the Responses shape (output items, usage as input_tokens / output_tokens).
const responsesUsage = (u) =>
  u
    ? {
        usage: {
          input_tokens: u.prompt_tokens ?? 0,
          input_tokens_details: { cached_tokens: u.prompt_tokens_details?.cached_tokens ?? 0 },
          output_tokens: u.completion_tokens ?? 0,
          output_tokens_details: { reasoning_tokens: u.completion_tokens_details?.reasoning_tokens ?? 0 },
        },
      }
    : {};

export default class OpenAI {
  constructor() {
    this.responses = {
      create: async (p) => {
        const g = globalThis;
        (g.__logosCalls ??= []).push(p);
        if ((g.__logosRefuse ?? []).includes(p.model))
          throw Object.assign(new Error(`The model \`${p.model}\` does not exist or you do not have access to it.`), { status: 404, code: 'model_not_found' });
        const next = (g.__logosScript ??= []).shift();
        if (next instanceof Error) throw next;
        const text = next === undefined ? '' : typeof next === 'string' ? next : JSON.stringify(next);
        return { object: 'response', model: p.model, status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }], ...responsesUsage(g.__logosUsage) };
      },
    };
    this.chat = {
      completions: {
        create: async (p) => {
          const g = globalThis;
          (g.__logosCalls ??= []).push(p);
          if (p.stream) {
            if ((g.__logosRefuse ?? []).includes(p.model))
              throw Object.assign(new Error(`The model \`${p.model}\` does not exist or you do not have access to it.`), { status: 404, code: 'model_not_found' });
            (g.__logosPrompts ??= []).push(systemOf(p));
            const text = g.__logosReply ?? 'Here it is.';
            const step = Number(g.__logosChunk) > 0 ? Number(g.__logosChunk) : text.length || 1;
            return (async function* () {
              for (let i = 0; i < Math.max(1, text.length); i += step) yield { choices: [{ delta: { content: text.slice(i, i + step) } }] };
              if (g.__logosUsage && p.stream_options?.include_usage) yield { choices: [], usage: g.__logosUsage };
            })();
          }
          const next = (g.__logosScript ??= []).shift();
          if (next instanceof Error) throw next;
          const usage = g.__logosUsage ? { usage: g.__logosUsage } : {};
          if (next === undefined) return { choices: [{ message: { content: '' }, finish_reason: 'stop' }], ...usage };
          return {
            choices: [
              { message: { content: typeof next === 'string' ? next : JSON.stringify(next) }, finish_reason: 'stop' },
            ],
            ...usage,
          };
        },
      },
    };
  }
}
