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
            // A guard that fails mid-turn, to prove a reply already collected
            // is not lost to it.
            if (g.__guard?.__throw) throw Object.assign(new Error('guard exploded'), { status: 500 });
            return { choices: [{ message: { content: JSON.stringify(g.__guard ?? { action: 'ALLOW', findings: [], redundant: [] }) } }] };
          }
          // Counterfactual ablation (lib/core4/counterfactual.ts).
          // WITHOUT THIS BRANCH the call fell through to the reply path, came
          // back as prose, failed JSON.parse and returned null — so the suite
          // could only ever prove the NEGATIVE case (an ordinary turn measures
          // nothing) and the gate opening was untestable. That is the shape of
          // the run-7 failure: a stage that looks shipped and is silent.
          if (sys.startsWith('You test whether a conclusion still follows')) {
            (g.__ablationCalls ??= []).push(p);
            const scripted = Array.isArray(g.__ablations) ? g.__ablations.shift() : g.__ablation;
            return { choices: [{ message: { content: JSON.stringify(scripted ?? { holds: 'unclear', instead: '', confidence: 0.2 }) } }] };
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
            // `forModel` fails only that model id, so a fallback can answer:
            // the shape of the failure that left Core 4 dead on dev while
            // Core 3.1, with a more forgiving rule, quietly recovered.
            const boom = g.__streamError && (!g.__streamError.forModel || g.__streamError.forModel === p.model)
              ? g.__streamError
              : null;
            // A call that throws consumes no scripted reply: the retry on the
            // fallback model must get the reply the test wrote for the turn.
            if (boom) {
              return (async function* () {
                const { forModel, ...rest } = boom;
                throw Object.assign(new Error(boom.message ?? 'upstream'), rest);
              })();
            }
            // __replies scripts successive replies (first draft, retry, ...);
            // __reply is the same text every time.
            const text = (g.__replies ?? []).shift() ?? g.__reply ?? 'Noted.';
            return (async function* () {
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
