// Human-First, both ways: Socria neither does a person's thinking for them
// when they asked it not to, nor holds back what they plainly need.
//
// Behavioural evaluations of the decision the real chat route makes — the
// assist move it reports (X-Socria-Assist), the runtime's reading
// (X-Socria-Runtime) and Metacognitive Regulation's (X-Socria-MR) — and of the
// instructions it hands the model. Deterministic: the model is scripted, so
// what is judged is never a reply's luck, only what Socria decided to ask of
// it. Each case says which way it guards:
//
//   OVER-HELPING   the answer handed over when the person set the guard, or
//                  their graded work done for them;
//   WITHHOLDING    a plain question, or an unrelated one, refused the answer
//                  because a guard is up somewhere.
//
// Found by the conversation audit (CONV-7, CONV-8); the cases that held
// already are kept so they keep holding.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { systemOf } from './helpers/prompt.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-human-first');
const H = (f) => join(here, 'helpers', f);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  entryPoints: [join(root, 'app/api/logos/chat/route.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(OUT, 'chat.mjs'),
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [
    {
      name: 'swap',
      setup(b) {
        b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
          const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
          if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(H('fake-supabase.mjs')).href, external: true };
          return undefined;
        });
        b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(H('fake-clerk.mjs')).href, external: true }));
        b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(H('fake-openai-logos.mjs')).href, external: true }));
        b.onResolve({ filter: /^server-only$/ }, () => ({ path: H('server-only-shim.mjs') }));
        b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
      },
    },
  ],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'],
  logLevel: 'error',
});
const quiet = () => {};
console.info = quiet;
console.warn = quiet;
console.error = quiet;
process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';

const { db } = await import(pathToFileURL(H('fake-supabase.mjs')).href);
const chat = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const { chooseAssist, asksForTheAnswer } = await import(pathToFileURL(join(here, '.tmp', 'assist.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
db.reset();
globalThis.__uid = 'hf_user';
globalThis.__users = { hf_user: { firstName: 'Hana', emails: ['hana@example.com'] } };

let n = 0;
async function turn(messages, extra = {}) {
  globalThis.__logosCalls = [];
  globalThis.__logosPrompts = [];
  globalThis.__logosReply = 'Here it is.';
  globalThis.__logosScript = [];
  const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ surface: 'logos5', sessionId: `hf_${++n}`, messages, ...extra }) }));
  await r.text().catch(() => '');
  const streamed = (globalThis.__logosCalls ?? []).find((c) => c.stream);
  return { status: r.status, assist: r.headers.get('x-socria-assist') ?? '', runtime: r.headers.get('x-socria-runtime') ?? '', mr: r.headers.get('x-socria-mr') ?? '', system: streamed ? systemOf(streamed) : '' };
}
const mode = (t) => t.assist.split(';')[0];
const LEARNING_MATHS = [U('I am learning derivatives. What is the derivative of x^3?'), A('What does the power rule say to do with the exponent?')];

console.log('\nOVER-HELPING — the guard they set holds, and their graded work stays theirs');
{
  const t = await turn([...LEARNING_MATHS, U('just tell me the answer')], { guard: 'guard' });
  ok('"just tell me the answer" under the guard: the next step, not the answer', t.status === 200 && mode(t) === 'explain' && /answer-asked:guarded/.test(t.assist), t.assist);
  ok('  never an INFORM move', mode(t) !== 'inform', t.assist);
  for (const said of ["what's the answer?", 'answer please', 'ok just give me the final answer', 'just tell me']) {
    const v = await turn([...LEARNING_MATHS, U(said)], { guard: 'guard' });
    ok(`  "${said}" under the guard: guarded too`, mode(v) === 'explain' && /answer-asked:guarded/.test(v.assist), v.assist);
  }
  const g = await turn([U('This is for my graded homework I will submit tomorrow: solve 2x + 3 = 11')]);
  ok('graded homework, first turn: not executed as a routine task', g.status === 200 && !/;a=execute;/.test(g.mr), g.mr);
  ok('  and the reasoning is scaffolded, not done for them', /alloc=[^;]*reason\.scaffold/.test(g.runtime) && !/A ROUTINE TASK/.test(g.system), g.runtime);
  const h = await turn([U('This is for my graded homework I will submit tomorrow: solve 2x + 3 = 11.'), A('Since it is graded, I can walk you through the method.'), U('just tell me the answer')]);
  ok('graded homework, then "just tell me the answer": held, and said why', /;held=assessment_integrity/.test(h.runtime), h.runtime);
}

console.log('\nWITHHOLDING — what they plainly need is not held back');
{
  const t = await turn([U('just tell me the answer: what is the capital of Australia?')]);
  ok('no guard, "just tell me": honoured — an INFORM move', mode(t) === 'inform', t.assist);
  const s = await turn([U('What is the boiling point of water at sea level?')], { guard: 'guard' });
  ok('a plain question of fact, guard up: answered', mode(s) === 'inform' && !/guarded/.test(s.assist), s.assist);
  const d = chooseAssist({ lastUserText: 'just tell me what time it is in Tokyo', history: [], guard: true, signals: undefined });
  ok('"just tell me what time it is in Tokyo", guard up: a new question, not the guarded one', d.mode === 'inform' && !d.reasons.some((r) => /guarded/.test(r)), JSON.stringify(d.reasons));
  const plain = await turn([U("I'm feeling stuck on my essay intro and I don't know why.")], { guard: 'guard' });
  ok('a person saying they are stuck is not met with a withhold', !/held=/.test(plain.runtime), plain.runtime);
}

console.log('\nthe reader of a bare demand, on its own');
for (const t of ['just tell me the answer', "What's the answer?", 'answer please', 'Can you just give me the solution already', 'just tell me', 'the answer, please']) ok(`"${t}" is a demand about the problem on the table`, asksForTheAnswer(t));
for (const t of ['just tell me what time it is in Tokyo', 'tell me the answer to 7 x 8', 'what is the answer to life, the universe and everything about my career', 'I know the answer is 4']) ok(`"${t}" is not`, !asksForTheAnswer(t));

console.log(`\nhuman-first-evals: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
