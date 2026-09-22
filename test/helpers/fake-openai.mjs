// A scripted model.
//
// Every call is recorded. The extractor gets the next scripted extraction;
// the Cognitive State gets a scripted state; the reply stream records the
// SYSTEM PROMPT it was given — which is the thing the end-to-end tests
// actually read, because it is exactly what Core 4 would have seen.
export default class OpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (p) => {
          const g = globalThis;
          g.__calls ??= [];
          g.__calls.push(p);
          const sys = String(p.messages?.[0]?.content ?? '');
          if (sys.startsWith('You build a semantic memory graph')) {
            const next = (g.__extract ??= []).shift() ?? { nodes: [], edges: [] };
            return { choices: [{ message: { content: JSON.stringify(next) } }] };
          }
          if (sys.startsWith('You read a conversation and report where it stands')) {
            return { choices: [{ message: { content: JSON.stringify(g.__state ?? {}) } }] };
          }
          if (p.stream) {
            (g.__prompts ??= []).push(sys);
            const text = g.__reply ?? 'Noted.';
            return (async function* () { yield { choices: [{ delta: { content: text } }] }; })();
          }
          return { choices: [{ message: { content: JSON.stringify({ verdict: 'approve' }) } }] };
        },
      },
    };
  }
}
