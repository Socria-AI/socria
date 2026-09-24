// A scripted model.
//
// Every call is recorded. The extractor gets the next scripted extraction;
// the Cognitive State gets a scripted state; the guard and the checker get
// scripted verdicts (ALLOW / unsure by default); the reply stream records the
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
          // Answer Guard 2.0's model pass (lib/core4/guard2.ts GUARD2_SYSTEM).
          if (sys.startsWith('You check one reply before a person sees it')) {
            (g.__guardCalls ??= []).push(p);
            return { choices: [{ message: { content: JSON.stringify(g.__guard ?? { action: 'ALLOW', findings: [], redundant: [] }) } }] };
          }
          // Verify Mode's separate checker (lib/core4/verify.ts CHECK_SYSTEM).
          if (sys.startsWith('You check one attempt at a problem')) {
            (g.__checkCalls ??= []).push(p);
            return { choices: [{ message: { content: JSON.stringify(g.__check ?? { verdict: 'unsure', confidence: 0.3 }) } }] };
          }
          if (p.stream) {
            (g.__prompts ??= []).push(sys);
            // __streamError makes the provider fail the way it really does:
            // create() resolves and the FIRST token throws, so the failure
            // lands inside the stream rather than in the route's outer catch.
            const boom = g.__streamError;
            // __replies scripts successive replies (first draft, retry, ...);
            // __reply is the same text every time.
            const text = (g.__replies ?? []).shift() ?? g.__reply ?? 'Noted.';
            return (async function* () {
              if (boom) throw Object.assign(new Error(boom.message ?? 'upstream'), boom);
              yield { choices: [{ delta: { content: text } }] };
            })();
          }
          // A buffered Core 4 regeneration (role 'retry') is a non-streamed
          // call with the reply prompt.
          if (sys.startsWith('You are Socria')) {
            (g.__prompts ??= []).push(sys);
            const text = (g.__replies ?? []).shift() ?? g.__reply ?? 'Noted.';
            return { choices: [{ message: { content: text } }] };
          }
          return { choices: [{ message: { content: JSON.stringify({ verdict: 'approve' }) } }] };
        },
      },
    };
  }
}
