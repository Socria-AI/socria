// The Cognitive Interaction Engine through the real Logos route
// (app/api/logos/chat): what the reply model is told, and what reaches the
// person after the stream gate enforces the question budget.
//
// Only the database (fake-supabase), Clerk (fake-clerk) and the model
// (fake-openai-logos: records the system prompt, streams a scripted reply) are
// replaced. The reply text is chosen by each test to contain exactly the thing
// the engine must handle — a trailing question, an offer, a sycophantic opener.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-assist');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  entryPoints: [join(root, 'app/api/logos/chat/route.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(OUT, 'logos.mjs'),
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [
    {
      name: 'swap',
      setup(b) {
        b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
          const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
          if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
          return undefined;
        });
        b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
        b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai-logos.mjs')).href, external: true }));
        b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
        b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
      },
    },
  ],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'],
  logLevel: 'error',
});

const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (/^\[(socria|logos|core4)/.test(first) || first.startsWith('conversations')) return;
  orig(...a);
};
console.error = quiet(console.error.bind(console));
console.warn = quiet(console.warn.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
const route = await import(pathToFileURL(join(OUT, 'logos.mjs')).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });

async function turn(messages, reply, extra = {}) {
  globalThis.__logosCalls = [];
  globalThis.__logosPrompts = [];
  globalThis.__logosReply = reply;
  globalThis.__logosScript = [...(extra.script ?? [])];
  const { script, ...body } = extra;
  void script;
  const r = await route.POST(new NextRequest('http://localhost/api/logos/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, ...body }),
  }));
  const received = await r.text();
  const streamed = globalThis.__logosCalls.find((c) => c.stream);
  return { status: r.status, assist: r.headers.get('x-socria-assist') ?? '', system: String(streamed?.messages?.[0]?.content ?? ''), received };
}

db.reset();
globalThis.__uid = 'u_assist';

console.log('=== a question of fact: answered, and the habit-question after it never ships ===');
{
  const t = await turn([U('What is an ISCO?')], 'An ISCO is the International Standard Classification of Occupations, the ILO’s grouping of jobs. Want me to show how it groups yours?');
  ok('answers', t.status === 200, String(t.status));
  ok('the engine chose inform, imposed, no questions', t.assist.startsWith('inform;forced=1;q=0'), t.assist);
  ok('the reply was told to answer first, with no question', /INFORM/.test(t.system) && /QUESTIONS: none/.test(t.system));
  ok('the answer arrives', /International Standard Classification of Occupations/.test(t.received), t.received);
  ok('the trailing offer does not', !/Want me to/.test(t.received), t.received);
}

console.log('=== the budget is priced from what they actually saw ===');
{
  const hist = [U('I might leave my job.'), A('What is pulling you toward leaving?'), U('Mostly the boredom.'), A('And what would make staying worth it?')];
  const t = await turn([...hist, U('Maybe nothing, honestly.')], 'Then the question is not whether to leave but when. What is stopping you from starting the search this week?');
  ok('two asking replies in a row → the budget is spent', /q=0/.test(t.assist) && /budget:spent/.test(t.assist), t.assist);
  ok('the statement ships', /not whether to leave but when/.test(t.received), t.received);
  ok('the third question in a row does not', !/What is stopping you/.test(t.received), t.received);

  const calm = [U('I might leave my job.'), A('That is a real option.')];
  const t2 = await turn([...calm, U('I think boredom is the main reason.')], 'Boredom is a reason to change something; leaving is one way. What would change it without leaving?');
  ok('no recent questioning → one question may ship', /q=1/.test(t2.assist) && /What would change it without leaving\?/.test(t2.received), `${t2.assist} | ${t2.received}`);
}

console.log('=== Core 4\'s opener rule now reaches Logos ===');
{
  const t = await turn([U('I think the second plan is cheaper overall.')], 'Great point! The second plan is cheaper only if the setup cost is paid once.');
  ok('the sycophantic opener is removed; the substance stays', !/Great point/.test(t.received) && /^The second plan is cheaper/.test(t.received.trim()), t.received);
}

console.log('=== they asked for questions: questions are the content ===');
{
  const t = await turn([U('Give me three practice questions on photosynthesis.')], '1. What does chlorophyll absorb? 2. Where do the light reactions happen? 3. What does the Calvin cycle make?');
  ok('every requested question arrives', (t.received.match(/\?/g) ?? []).length === 3, t.received);
}

console.log('=== the map grounds a challenge ===');
{
  const mapDigest = { context: 'deciding', assumptions: ['More money means progress'], conflicts: [], open: [] };
  const t = await turn([U('The raise basically proves it: more money means progress for me.')], 'That is the assumption carrying the decision, not a conclusion from it.', { mapDigest });
  ok('the engine challenges the assumption on their map', t.assist.startsWith('challenge') && /challenge:assumption/.test(t.assist), t.assist);
  ok('the reply is told what to push on, in their words', /CHALLENGE/.test(t.system) && /More money means progress/.test(t.system));
}

console.log('=== Point & Ask: a selection is what "this" means ===');
{
  const focus = { kind: 'param', label: 'β₂', of: 'Wage model', lines: ['a parameter of Wage model, now -0.4', 'its range is -2 to 2'] };
  const t = await turn([U('why is this negative?')], 'β₂ is negative because the fitted slope on experience bends down after a point.', { focus });
  ok('the engine explains, about the selection', /^explain/.test(t.assist) && /focus:param/.test(t.assist), t.assist);
  ok('the reply sees the selection from canonical state, and is told not to ask which one', /WHAT THEY HAVE SELECTED IN THE WORKSPACE: "β₂"/.test(t.system) && /never ask which one they mean/.test(t.system));
}

console.log('=== a selection on the main thread is not a node\'s side-thread (the Logos 3.5 bug) ===');
{
  const focus = { kind: 'node', label: 'More money means progress', of: 'the Thinking Map', lines: ['a assumption on the map', 'connected: It pays more → depends → this'] };
  const t = await turn([U('is this really true?')], 'It holds only if the role grows with the pay.', { focus });
  ok('the main thread keeps the main prompt — not the narrow node-thread one', !/pulled ONE piece of their own reasoning aside/.test(t.system), t.system.slice(0, 200));
  ok('…and the selection reaches the reply with its facts from the map', /WHAT THEY HAVE SELECTED IN THE WORKSPACE: "More money means progress"/.test(t.system) && /connected: It pays more/.test(t.system));
  const thread = await turn([U('is this really true?')], 'Look at what it rests on.', { focus: { label: 'More money means progress', type: 'assumption' } });
  ok('a real node thread (no kind) still opens the narrow prompt', /pulled ONE piece of their own reasoning aside/.test(thread.system) && /assumption: "More money means progress"/.test(thread.system));
}

console.log('=== building: pointed at, not described ===');
{
  const t = await turn([U('Chart my spending: rent 1200, food 400, transport 150')], 'Rent is three-quarters of what you listed. Try moving food to see how the split changes.');
  ok('a display request → construct', t.assist.startsWith('construct;forced=1;q=0;construct:display'), t.assist);
  ok('the reply is told to point at what they can change', /CONSTRUCT/.test(t.system));
}

console.log('=== back after a day on something they were learning: recall first ===');
{
  const hist = [U('Teach me how the chain rule works.'), A('It differentiates a function inside a function.'), U('ok'), A('Good — that is the whole idea.')];
  const t = await turn([...hist, U("ok let's keep going")], 'Before we go on: in your own words, what does the chain rule do?', {
    mapDigest: { context: 'learning', assumptions: [], conflicts: [], open: [] },
    resumedAfterMs: 2 * 24 * 60 * 60 * 1000,
  });
  ok('the engine asks for recall', t.assist.startsWith('ask;forced=1;q=1') && /retrieval:resumed/.test(t.assist), t.assist);
  ok('the reply is told why', /THEY ARE BACK after a gap/.test(t.system));
  ok('the recall question ships', /in your own words/.test(t.received), t.received);
}

console.log('=== a held mathematical turn keeps the same budget ===');
{
  const t = await turn([U('What is the derivative of x^2?')], 'It is $2x$. Do you want to try $x^3$ next?');
  ok('a maths fact → inform, no questions', t.assist.startsWith('inform') && /q=0/.test(t.assist), t.assist);
  ok('the answer stays', /2x/.test(t.received), t.received);
  ok('the habit-question after it does not', !/try \$x\^3\$ next/.test(t.received), t.received);
}

console.log('=== a crisis is met plainly ===');
{
  const t = await turn([U("I don't want to live anymore.")], 'I am really glad you told me. Please reach someone right now — in the US you can call or text 988.');
  ok('safety → inform, imposed, no questions', t.assist.startsWith('inform;forced=1;q=0') && /safety/.test(t.assist), t.assist);
  ok('the reply is told to put everything aside and give a crisis line', /SAFETY/.test(t.system) && /988/.test(t.system));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
