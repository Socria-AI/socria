// A recording model for evals/logos5/measure.mjs — no network, no key.
//
// Every call any route makes is recorded in globalThis.__evalCalls with what
// was sent (model, whether streamed, the messages). A streamed call (a reply)
// streams a fixed answer of ordinary length. A buffered call answers in the
// shape its caller expects, recognised from its own instructions: the map
// extractor a small map, the memory extractor and the rest an empty object —
// so no route takes a repair path a real model would not have sent it down.
//
// What is measured is what the product SENDS. What a real model would answer
// — and so its output tokens and its latency — is not, and is not claimed.

const REPLY =
  'That is the real trade: the Denver offer pays more, and what it costs is time with your partner and the life you have built here. ' +
  'Before weighing them, it helps to say which of the two you would regret more in a year. Which one would it be?';

const MAP = JSON.stringify({
  context: 'deciding',
  nodes: [
    { id: 'n1', type: 'question', label: 'Take the Denver job or stay in Austin', status: 'open' },
    { id: 'n2', type: 'claim', label: 'Denver pays 20% more', status: 'open' },
    { id: 'n3', type: 'consideration', label: 'Partner works in Austin', status: 'open' },
  ],
  edges: [
    { from: 'n2', to: 'n1', relation: 'supports' },
    { from: 'n3', to: 'n1', relation: 'challenges' },
  ],
});

const textOf = (p) => (p.messages ?? []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');

/** What a call is for, read from its own instructions. */
export function purposeOf(p) {
  if (p.stream) return 'reply';
  const t = textOf(p);
  if (/THE MAP AS IT STANDS/.test(t)) return 'map';
  if (/You build a semantic memory graph/.test(t)) return 'memory';
  if (/THINKING JOURNEY/.test(t)) return 'understanding';
  if (/suggestedTitle/.test(t)) return 'title';
  return 'other';
}

export default class OpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (p) => {
          const purpose = purposeOf(p);
          (globalThis.__evalCalls ??= []).push({ purpose, model: p.model, stream: !!p.stream, messages: p.messages ?? [], at: Date.now() });
          if (p.stream) {
            const words = REPLY.split(/(?<= )/);
            return (async function* () {
              for (const w of words) yield { choices: [{ delta: { content: w } }] };
            })();
          }
          const content = purpose === 'map' ? MAP : purpose === 'title' ? JSON.stringify({ suggestedTitle: 'Denver Offer – Stay or Go' }) : '{}';
          return { choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0 } };
        },
      },
    };
    // the Responses API, where a route reaches for it
    this.responses = { create: async () => ({ output_text: '' }) };
  }
}
