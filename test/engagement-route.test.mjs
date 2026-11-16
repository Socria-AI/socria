// THE ENGAGEMENT READING THROUGH THE REAL ROUTE (app/api/logos/chat) — lib/runtime/engagement.ts.
//
// What is held down, with only the database, Clerk and the model replaced (the model records what it was sent and
// streams a scripted reply):
//   • LOGOS_ENGAGEMENT=off is the route as it was: no reading, no trace, no line; unset in production, the same;
//   • shadow reads and traces, and the instructions, the budget and what reaches the person are as with it off;
//   • on, the reading rides the allocation's block and the runtime's trace — and costs no model call;
//   • a budget it closes is enforced by the real stream gate (a goodbye is not answered with a question), and is
//     never what leaves a reply empty;
//   • an invitation ships where the budget is open, and never over "stop asking me questions";
//   • the shape's "then stop" comes after the closing line, on the one turn that asks for one;
//   • a message that may carry distress gets the turn exactly as it is without the reading;
//   • the older persona (another screen) has no reading at all;
//   • the log line is codes only.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-engagement');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');

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

const logged = [];
const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('[engage]')) return void logged.push(first);
  if (/^\[(socria|logos|core4|tokens|search|epistemic|mr|explain|mind|course)/.test(first) || first.startsWith('logos') || first.startsWith('conversations')) return;
  orig(...a);
};
console.info = quiet(console.info.bind(console));
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
const chat = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
let seq = 0;

/**
 * One turn in one arm: what the reply model was sent, what reached the person, the headers.
 * `arm: null` leaves LOGOS_ENGAGEMENT unset; `surface: null` is a request from another screen.
 */
async function turn(messages, { arm = 'on', reply = 'Noted.', env = {}, surface = 'logos5' } = {}) {
  const set = { LOGOS_ENGAGEMENT: arm ?? undefined, ...env };
  const saved = Object.fromEntries(Object.keys(set).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(set)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try {
    globalThis.__uid = `user_engage_${arm ?? 'unset'}`;
    globalThis.__logosCalls = [];
    globalThis.__logosReply = reply;
    globalThis.__logosScript = [];
    logged.length = 0;
    const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(surface ? { surface } : {}), sessionId: `engage-${++seq}`, messages }) }));
    const received = await r.text().catch(() => '');
    await new Promise((done) => setTimeout(done, 20));
    const calls = globalThis.__logosCalls;
    const sent = calls.find((c) => c.stream)?.messages ?? [];
    const note = String([...sent].reverse().find((m) => m.role === 'system' && String(m.content).startsWith('=== THIS TURN ==='))?.content ?? '');
    const runtime = r.headers.get('x-socria-runtime') ?? '';
    return { status: r.status, received, note, runtime, engage: (/(?:^|;)engage=([^;]*)/.exec(runtime) ?? [])[1] ?? '', shadow: (/(?:^|;)engage-shadow=([^;]*)/.exec(runtime) ?? [])[1] ?? '', system: String(sent[0]?.content ?? ''), assist: r.headers.get('x-socria-assist') ?? '', calls: calls.length, log: logged.find((l) => l.startsWith('[engage]')) ?? '' };
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
}
const both = async (messages, o = {}) => ({ off: await turn(messages, { ...o, arm: 'off' }), on: await turn(messages, { ...o, arm: 'on' }) });

const sky = [U('why is the sky blue?'), A('Because air scatters short wavelengths of sunlight far more than long ones, so blue light reaches your eye from every direction.')];

console.log('\n=== the switch ===');
{
  const { off, on } = await both([U('I got the internship!!')]);
  ok('off: the route as it was — no reading in the trace, no line in the turn\'s block', off.status === 200 && off.engage === '' && !/a friend would ask about/.test(off.note) && off.log === '', off.runtime);
  ok('on: the reading rides the runtime\'s trace', /^attune\/explicit\/invite,cue:goodnews,uptake:first,cap:1,own:0,follow:0,why:good-news$/.test(on.engage), on.engage);
  ok('…and one line of the allocation\'s block, beside what the exchange already says', /Good news, in their words: be glad with them/.test(on.note) && /If you're curious about a detail of it — the one a friend would ask about — ask that\. One question, or none\./.test(on.note), on.note.slice(0, 600));
  ok('the same model calls either way: one, the reply', off.calls === 1 && on.calls === 1, `${off.calls} ${on.calls}`);
  ok('off: the core as it was — its rule for questions untouched, and the trace says logos5-v8', /^logos5-v8;/.test(off.runtime) && /never as a habit, a sign-off or a way to hand the turn back/.test(off.system) && !/this turn's note invites one/.test(off.system), off.runtime.slice(0, 40));
  ok('on: the core whose rule lets this turn\'s note invite one, and the trace says logos5-v9', /^logos5-v9;/.test(on.runtime) && /or this turn's note invites one\./.test(on.system) && !/a way to hand the turn back/.test(on.system), on.runtime.slice(0, 40));
  ok('…the two system messages differ in that one sentence and nowhere else', on.system.replace(/Ask because you want the answer[^\n]*/, '') === off.system.replace(/Ask because you want the answer[^\n]*/, '') && on.system !== off.system);
  ok('the rest of the turn\'s block is unchanged', on.note.replace(/\n[^\n]*a friend would ask about[^\n]*/, '') === off.note, `${on.note.length} ${off.note.length}`);
  const prod = await turn([U('I got the internship!!')], { arm: null, env: { NODE_ENV: 'production', VERCEL_ENV: 'production', NEXT_PUBLIC_VERCEL_ENV: undefined } });
  ok('unset, in production: off', prod.engage === '' && !/a friend would ask about/.test(prod.note), prod.runtime);
  const dev = await turn([U('I got the internship!!')], { arm: null, env: { NODE_ENV: 'development', VERCEL_ENV: undefined, NEXT_PUBLIC_VERCEL_ENV: undefined } });
  ok('unset, anywhere else: on', /cue:goodnews/.test(dev.engage), dev.runtime);
  const prodOn = await turn([U('I got the internship!!')], { arm: 'on', env: { NODE_ENV: 'production', VERCEL_ENV: 'production', NEXT_PUBLIC_VERCEL_ENV: undefined } });
  ok('LOGOS_ENGAGEMENT=on turns it on in production', /cue:goodnews/.test(prodOn.engage), prodOn.runtime);
  const classic = await turn([U('I got the internship!!')], { arm: 'on', surface: null });
  ok('another screen (the older persona): no reading at all', classic.status === 200 && classic.engage === '' && !/a friend would ask about/.test(classic.note), classic.runtime);
}

console.log('\n=== shadow: read and traced, and nothing else changes ===');
{
  const bye = [...sky, U('got it, thanks!')];
  const habit = 'Anytime. What are you looking into next?';
  const off = await turn(bye, { arm: 'off', reply: habit });
  const shadow = await turn(bye, { arm: 'shadow', reply: habit });
  ok('the turn\'s instructions are byte for byte what they are with it off', shadow.note === off.note && shadow.note.length > 0, `${shadow.note.length} ${off.note.length}`);
  ok('…and so are the move and what reaches the person: the habit\'s question still goes out', shadow.assist === off.assist && shadow.received === off.received && shadow.received.trim() === habit, `${shadow.assist} | ${shadow.received}`);
  ok('what it would have decided is in the trace, under its own name', shadow.engage === '' && /^close\/none\/conclude,cue:close,uptake:unasked,cap:0,own:0,follow:0,why:wraps-up$/.test(shadow.shadow), shadow.runtime);
  ok('…and in the log, marked as shadow, with how the reply really ended', /^\[engage\] close\/none\/conclude,cue:close,[^ ]*,ended:question,mode:shadow$/.test(shadow.log), shadow.log);
  ok('no model call of its own', shadow.calls === 1 && off.calls === 1, `${shadow.calls} ${off.calls}`);
  ok('…and the system message is the one sent with it off, to the byte (logos5-v8)', shadow.system === off.system && /^logos5-v8;/.test(shadow.runtime), shadow.runtime.slice(0, 40));
  const news = await turn([U('I got the internship!!')], { arm: 'shadow' });
  const newsOff = await turn([U('I got the internship!!')], { arm: 'off' });
  ok('good news in shadow: no line is added', news.note === newsOff.note && !/a friend would ask about/.test(news.note) && /cue:goodnews/.test(news.shadow), news.shadow);
  const prod = await turn([U('I got the internship!!')], { arm: 'shadow', env: { NODE_ENV: 'production', VERCEL_ENV: 'production', NEXT_PUBLIC_VERCEL_ENV: undefined } });
  ok('it can be set in production, where unset means off', /cue:goodnews/.test(prod.shadow) && prod.engage === '' && !/a friend would ask about/.test(prod.note), prod.runtime);
}

console.log('\n=== a budget the reading closes is enforced by the gate — and never empties a reply ===');
{
  const bye = [...sky, U('got it, thanks!')];
  const habit = 'Anytime. What are you looking into next?';
  const { off, on } = await both(bye, { reply: habit });
  ok('a goodbye, answered by habit: today the question goes out', off.received.trim() === habit, off.received);
  ok('…with the reading on it does not', on.received.trim() === 'Anytime.' && /;q=0;/.test(on.assist) && /engage:wraps-up/.test(on.assist), `${on.received} | ${on.assist}`);
  ok('…and the reply was told so', /They're finishing: close in a line, in kind/.test(on.note) && /QUESTIONS: none this turn/.test(on.note));
  const only = await turn([...sky, U('ok')], { reply: 'Which part should we look at next?' });
  ok('a reply that is nothing but a question, on a turn the reading closed: it goes out — never an empty turn', /cue:settled/.test(only.engage) && only.received.trim() === 'Which part should we look at next?', `${only.engage} | "${only.received}"`);
  const mixed = await turn([...sky, U('ok')], { reply: 'Good. Which part should we look at next?' });
  ok('…but where there is anything else to send, the question is held', mixed.received.trim() === 'Good.', mixed.received);
}

console.log('\n=== an invitation ships where the budget is open, and never over their words ===');
{
  const news = await turn([U('I got the internship!!')], { reply: 'That is a real one — congratulations. Which team is it with?' });
  ok('good news: the question a friend would ask goes out', news.received.trim().endsWith('Which team is it with?') && /;q=1;/.test(news.assist), `${news.received} | ${news.assist}`);
  const stop = await turn([U('stop asking me questions. I got the internship!!')], { reply: 'That is a real one — congratulations. Which team is it with?' });
  ok('"stop asking me questions": no line invites one, and none goes out', !/a friend would ask about/.test(stop.note) && !/\?/.test(stop.received) && /congratulations/.test(stop.received), `${stop.engage} | ${stop.received}`);
  const passed = await turn([U('I want to start running'), A('Start with three short runs a week. What is drawing you to it: fitness, or something to clear your head?'), U('how do I export my notes as a PDF?')], { reply: 'Export, then PDF. And what was it that drew you to running?' });
  ok('a question let pass: not repeated, and the reply was told why', /cue:letgo,uptake:passed,cap:0/.test(passed.engage) && /They let your last question pass/.test(passed.note) && passed.received.trim() === 'Export, then PDF.', `${passed.engage} | ${passed.received}`);
}

console.log('\n=== the closing observation, and the shape that used to say "then stop" ===');
{
  const { off, on } = await both([U('why is the sky blue?')]);
  ok('off: an idea to understand ends "Then stop."', /they want to understand an idea/.test(off.note) && /- Then stop\. No headings/.test(off.note), off.note.slice(0, 300));
  ok('on: one closing line is asked for, and the stop comes after it', /cue:wonder/.test(on.engage) && /one line on where it gets strange, stops holding, or touches something unexpected/.test(on.note) && /- Then the one closing line this turn's note asks for, if there is a real one — and stop\./.test(on.note) && !/- Then stop\./.test(on.note), on.note.slice(0, 900));
  const fact = await both([U("what's the capital of Australia?")]);
  ok('a fact: nothing is added, in either arm', fact.on.note === fact.off.note && /^direct\/none\/answer,cue:none/.test(fact.on.engage), fact.on.engage);
}

console.log('\n=== anything that may carry distress: the turn exactly as it is without the reading ===');
{
  for (const text of ["I don't want to be here anymore, I'm thinking about ending it", 'I feel like a burden to everyone', "I've been thinking about killing myself"]) {
    const { off, on } = await both([U(text)], { reply: 'I am glad you told me. What is making today so heavy?' });
    ok(`"${text.slice(0, 40)}…": the same instructions, the same reply`, on.note === off.note && on.received === off.received && /cue:none,[^;]*why:(?:tender|safety)/.test(on.engage), `${on.engage}`);
  }
}

console.log('\n=== the log line: codes only ===');
{
  const t = await turn([U('I got the internship at Zanzibar Pomegranate Labs!!')], { reply: 'Congratulations. Which team is it with?' });
  ok('what the reading was, what their message brought, how the reply ended, and that it was acted on', /^\[engage\] attune\/explicit\/invite,cue:goodnews,uptake:first,cap:1,own:1,follow:0,why:good-news,ended:question,mode:on$/.test(t.log), t.log);
  ok('none of their words, none of the reply\'s', !/zanzibar|pomegranate|internship|congratulations|team/i.test(t.log + t.engage));
  const s = await turn([...sky, U('got it, thanks!')], { reply: 'Anytime.' });
  ok('a close that ended on a statement says so', /cue:close,[^ ]*,ended:statement,mode:on$/.test(s.log), s.log);
}

console.log(`\nengagement route: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
