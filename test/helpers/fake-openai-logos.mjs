// A scripted model for the Logos routes.
//
// Every call is recorded in globalThis.__logosCalls. A buffered call (the map
// extractor, the second pass) takes the next entry of globalThis.__logosScript:
// an object is returned as its JSON, a string as itself, an Error is thrown,
// and an exhausted script returns an empty completion. A streamed call (the
// reply) records its system prompt in globalThis.__logosPrompts and streams
// globalThis.__logosReply.
//
// "Its system prompt" is every system message, in order: the reply sends the
// part that holds for the whole line of thinking first and this turn's
// context just before the newest message (app/api/logos/chat/route.ts), and a
// test reads the two as the one prompt they are (./prompt.mjs).
import { systemOf } from './prompt.mjs';

export default class OpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (p) => {
          const g = globalThis;
          (g.__logosCalls ??= []).push(p);
          if (p.stream) {
            (g.__logosPrompts ??= []).push(systemOf(p));
            const text = g.__logosReply ?? 'Here it is.';
            return (async function* () {
              yield { choices: [{ delta: { content: text } }] };
            })();
          }
          const next = (g.__logosScript ??= []).shift();
          if (next instanceof Error) throw next;
          if (next === undefined) return { choices: [{ message: { content: '' }, finish_reason: 'stop' }] };
          return {
            choices: [
              { message: { content: typeof next === 'string' ? next : JSON.stringify(next) }, finish_reason: 'stop' },
            ],
          };
        },
      },
    };
  }
}
