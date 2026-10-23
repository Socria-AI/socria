// Accuracy through the real routes: Core 4 (app/api/chat) and Logos 3.5
// (app/api/logos/chat).
//
// The pure suite (accuracy.test.mjs) proves each verdict. This proves the
// pipeline acts on them: a wrong derivative never reaches the person when the
// one regeneration fixes it; a regeneration that is still wrong ships with
// its correction; pushback re-checks the previous reply and the reply model
// is told to keep a right answer or own a wrong one; ordinary turns are not
// held; a streamed claim the engine refutes is corrected after it; a claimed
// tool run that never happened never streams; and under a withhold the
// computed answer never reaches the reply model.
//
// The drafts are scripted, so this cannot show that a real model writes them
// — only that whatever it writes, the person gets what the design intends.

import { build } from 'esbuild';
import { readActivity } from './.tmp/activity.mjs';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { systemOf } from './helpers/prompt.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-accuracy');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const swap = (fakeOpenai) => ({
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', fakeOpenai)).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
});
for (const [entry, out, fake] of [['app/api/chat/route.ts', 'chat.mjs', 'fake-openai.mjs'], ['app/api/logos/chat/route.ts', 'logos.mjs', 'fake-openai-logos.mjs']]) {
  await build({
    entryPoints: [join(root, entry)], bundle: true, format: 'esm', platform: 'node',
    outfile: join(OUT, out), tsconfig: join(root, 'tsconfig.json'), plugins: [swap(fake)],
    external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error',
  });
}

const quietLog = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (/^\[(socria|logos|core4)/.test(first) || first.startsWith('conversations') || first.startsWith('stream error')) return;
  orig(...a);
};
console.log = quietLog(console.log.bind(console));
console.error = quietLog(console.error.bind(console));
console.warn = quietLog(console.warn.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';

const chatRoute = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const logosRoute = await import(pathToFileURL(join(OUT, 'logos.mjs')).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });

async function settle() {
  let last = -1;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 25));
    if (db.log.length === last) return;
    last = db.log.length;
  }
}

/** One Core 4 turn: what the reply model was told, and what the person received. */
async function core(conversationId, messages, { state = {}, replies } = {}) {
  globalThis.__state = state;
  globalThis.__replies = [...(replies ?? ['Noted.'])];
  globalThis.__reply = undefined;
  globalThis.__guard = undefined;
  globalThis.__check = undefined;
  globalThis.__prompts = [];
  globalThis.__guardCalls = [];
  globalThis.__checkCalls = [];
  globalThis.__extract = [];
  globalThis.__socriaTrace = [];
  const r = await chatRoute.POST(new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'core-4', messages, conversationId }),
  }));
  const received = readActivity(await r.text()).text;
  await settle();
  return { status: r.status, prompt: globalThis.__prompts[0] ?? '', prompts: globalThis.__prompts, received, t: globalThis.__socriaTrace[0] ?? null, checkCalls: globalThis.__checkCalls.length };
}

/** One Logos turn: the system prompt of the streamed call, any retry, and what the person received. */
async function logos(messages, { reply, script = [], guard } = {}) {
  globalThis.__logosCalls = [];
  globalThis.__logosPrompts = [];
  globalThis.__logosReply = reply ?? 'Noted.';
  globalThis.__logosScript = [...script];
  const r = await logosRoute.POST(new NextRequest('http://localhost/api/logos/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, ...(guard ? { guard } : {}) }),
  }));
  const received = await r.text();
  await settle();
  const streamed = globalThis.__logosCalls.find((c) => c.stream);
  const retry = globalThis.__logosCalls.find((c) => !c.stream && /previous draft was rejected/.test(systemOf(c)));
  return { status: r.status, system: systemOf(streamed), retry: retry ? systemOf(retry) : null, received };
}

db.reset();
globalThis.__uid = 'u_acc';

const LOOKUP = { taskKind: 'lookup', work: 'information', latest: 'question' };
const WRONG = 'Using the chain rule, $\\frac{d}{dx}[\\csc(x)] = \\csc(x)\\cot(x)$.';
const RIGHT = 'It is $-\\csc(x)\\cot(x)$: write $\\csc x = (\\sin x)^{-1}$ and the chain rule gives $-(\\sin x)^{-2}\\cos x = -\\csc x\\cot x$.';

console.log('=== Core 4: a wrong derivative is caught before anyone sees it ===');
{
  const t = await core('acc-1', [U('What is the derivative of csc(x)?')], { state: LOOKUP, replies: [WRONG, RIGHT] });
  ok('the turn answers', t.status === 200, String(t.status));
  ok('the engine computed it before the reply was written', /Computed by Socria's math engine/.test(t.prompt) && /d\/dx\[csc\(x\)\] = -\(csc\(x\)·cot\(x\)\)/.test(t.prompt), t.prompt.slice(-1200));
  ok('  with the quotient-rule and chain-rule routes, checked equal', /same result by the quotient rule/.test(t.prompt) && /same result by the chain rule/.test(t.prompt));
  ok('the wrong draft was regenerated with exactly what was wrong', t.prompts.length >= 2 && /previous draft was rejected/.test(t.prompts[1]) && /sign is wrong/.test(t.prompts[1]), (t.prompts[1] ?? '').slice(-600));
  ok('the person receives the corrected reply, not the wrong one', t.received.includes('-\\csc(x)\\cot(x)') && !t.received.includes(WRONG), t.received);
}

console.log('\n=== Core 4: still wrong after its one regeneration — sent with the correction ===');
{
  const t = await core('acc-2', [U('What is the derivative of csc(x)?')], { state: LOOKUP, replies: [WRONG, WRONG] });
  ok('the error never stands alone: a plain correction follows it', /Correction: d\/dx\[csc\(x\)\] = -\(csc\(x\)·cot\(x\)\)/.test(t.received), t.received);
}

console.log('\n=== Core 4: an incorrect correction is resisted ===');
{
  const msgs = [U('What is the derivative of csc(x)?'), A('It is $-\\csc(x)\\cot(x)$.'), U("Isn't it csc(x)cot(x)? I used the quotient rule.")];
  const reply = "It's still $-\\csc(x)\\cot(x)$. The quotient rule on $1/\\sin x$ gives $-\\cos x/\\sin^2 x$, which is the same function.";
  const t = await core('acc-3', msgs, { state: { taskKind: 'lookup', work: 'verification', latest: 'reaction' }, replies: [reply] });
  ok('the reply model is told they are pushing back', /pushing back on your previous reply/.test(t.prompt), t.prompt.slice(-1500));
  ok('  that its previous answer re-checks as correct', /Your previous reply, re-checked/.test(t.prompt) && /— correct/.test(t.prompt));
  ok('  that their alternative is wrong, and how', /csc\(x\)cot\(x\) — WRONG: the sign is wrong/.test(t.prompt));
  ok('  to keep the answer and not concede', /Keep your answer/.test(t.prompt) && /Do not concede/.test(t.prompt));
  ok('  and that the quotient rule lands on the same function', /quotient rule gives/.test(t.prompt) && /same function/.test(t.prompt));
  ok('a reply that holds its ground ships as written', t.received.trim() === reply, t.received);
}

console.log('\n=== Core 4: a correct correction is accepted ===');
{
  const msgs = [U('What is the derivative of csc(x)?'), A(WRONG), U('You forgot the negative sign, right?')];
  const reply = "You're right, I dropped the sign. $\\frac{d}{dx}\\csc x = -\\csc x\\cot x$.";
  const t = await core('acc-4', msgs, { state: { taskKind: 'lookup', work: 'verification', latest: 'reaction' }, replies: [reply] });
  ok('the previous reply re-checks as wrong, with the correct result', /Your previous reply, re-checked/.test(t.prompt) && /WRONG: the sign is wrong/.test(t.prompt) && /Correct: d\/dx\[csc\(x\)\] = -\(csc\(x\)·cot\(x\)\)/.test(t.prompt), t.prompt.slice(-1500));
  ok('the reply model is told to own it first, plainly, without inventing a reason', /first sentence/.test(t.prompt) && /no invented reason/.test(t.prompt));
  ok('the acknowledgement ships untouched — quoting nothing wrong, nothing to correct', t.received.trim() === reply, t.received);
}

console.log('\n=== Core 4: ordinary turns are not held and get no block ===');
{
  const t = await core('acc-5', [U('Should I take the job in Denver or stay here?')], { state: { taskKind: 'decide', work: 'judgment', latest: 'question' }, replies: ['What would staying cost you that you have not counted yet?'] });
  ok('no math block in an ordinary turn', !/=== Computed by Socria's math engine|=== What they wrote, checked|=== They are pushing back/.test(t.prompt));
  ok('the epistemic rules are still there, in the base prompt', /WHEN THEY PUSH BACK/.test(t.prompt) && /NEVER INVENT A SOURCE/.test(t.prompt));
}

console.log('\n=== Core 4: a streamed claim the engine refutes is corrected after it ===');
{
  const t = await core('acc-6', [U('Tell me a fun fact.')], { state: { taskKind: 'explore', work: 'information', latest: 'question' }, replies: ['Fun fact: 2^10 = 1000, which is why a kilobyte is roughly a thousand bytes.'] });
  ok('the reply streamed (nothing in the question was risky)', t.prompts.length === 1);
  ok('and the correction follows it, specifically', /Correction: 2\^10 = 1024, not 1000/.test(t.received), t.received);
}

console.log('\n=== Core 4: a claimed tool run that never happened never streams ===');
{
  const t = await core('acc-7', [U('Is 391 prime?')], { state: LOOKUP, replies: ['I ran it in Python to be sure. 391 is 17 times 23, so it is not prime.'] });
  ok('"I ran it in Python" is gone', !/Python/.test(t.received), t.received);
  ok('the rest of the reply is intact', /17 times 23/.test(t.received), t.received);
}

console.log('\n=== Core 4: Verify Mode decides calculus by computing, not by the cheap checker ===');
{
  // Turn one states the learning goal, which is then carried in the saved
  // state — as it is for a real conversation.
  const m1 = U('I am learning derivatives and want to work these out myself. What is the derivative of csc(x)?');
  const t1 = await core('acc-8', [m1], {
    state: { taskKind: 'learn', work: 'practice', latest: 'question', currentFocus: 'derivative of csc x', practice: 'application' },
    replies: ['Start from csc x = 1/sin x. Which rule handles one over a function?'],
  });
  ok('the answer is kept with them, because they said so', !!t1.t?.allocation.withhold, JSON.stringify(t1.t?.allocation.withhold));
  ok('  and the computed derivative never reaches the reply model', !/-\(csc\(x\)/.test(t1.prompt) && /deliberately not shown/.test(t1.prompt));
  const msgs = [m1, A(t1.received), U('I got csc(x)cot(x)')];
  const t = await core('acc-8', msgs, {
    // The reader thinks they got it right. The engine says otherwise.
    state: { taskKind: 'learn', work: 'practice', latest: 'attempt', attempt: 'right', currentFocus: 'derivative of csc x' },
    replies: ['Close, but check the sign: what does the derivative of sin x on the bottom do to the result?'],
  });
  ok('still kept with them', !!t.t?.allocation.withhold);
  ok('checked exactly — no cheap-model call', t.checkCalls === 0 && t.t?.verify?.method === 'exact' && t.t.verify.verdict === 'incorrect', JSON.stringify(t.t?.verify));
  ok('the kind of slip reaches the reply model', /a sign error/.test(t.prompt), t.prompt.slice(-1200));
  ok('the correct answer does not — it is theirs to find', !/-\(csc\(x\)/.test(t.prompt) && !/csc\(x\)·cot\(x\)/.test(t.prompt));
}

console.log('\n=== Logos 3.5: a wrong derivative is caught before anyone sees it ===');
{
  const t = await logos([U('What is the derivative of csc(x)?')], { reply: WRONG, script: [RIGHT] });
  ok('the turn answers', t.status === 200, String(t.status));
  ok('the engine computed it for the reply model', /Computed by Socria's math engine/.test(t.system) && /-\(csc\(x\)·cot\(x\)\)/.test(t.system));
  ok('the shared epistemic rules are in the Logos prompt', /MATHEMATICS IS COMPUTED, NOT REMEMBERED/.test(t.system));
  ok('one regeneration, told exactly what was wrong', !!t.retry && /sign is wrong/.test(t.retry), t.retry?.slice(-500));
  ok('the person receives the corrected reply only', t.received.trim() === RIGHT, t.received);
}

console.log('\n=== Logos 3.5: under the Answer Guard nothing computed reaches the model, and a leak is sent back ===');
{
  const hint = 'Start from $\\csc x = 1/\\sin x$ — which rule handles one over something?';
  const t = await logos([U('What is the derivative of csc(x)?')], { reply: 'The answer is $-\\csc(x)\\cot(x)$.', script: [hint], guard: 'guard' });
  ok('the computed answer is not in the prompt', !/-\(csc\(x\)/.test(t.system) && /deliberately not shown/.test(t.system), t.system.slice(-700));
  ok('the draft that gave it away was regenerated', !!t.retry && /Take it out/.test(t.retry), t.retry?.slice(-400));
  ok('the person receives the hint', t.received.trim() === hint, t.received);
}

console.log('\n=== Logos 3.5: pushback on a right answer ===');
{
  const t = await logos([U('What is the derivative of csc(x)?'), A('It is $-\\csc(x)\\cot(x)$.'), U('My textbook says csc x cot x.')], { reply: 'Your textbook would be the odd one out here: it is $-\\csc x\\cot x$.' });
  ok('the reply model is told to keep its answer', /pushing back/.test(t.system) && /Keep your answer/.test(t.system), t.system.slice(-1200));
}

console.log('\n=== Logos 3.5: a claimed tool run that never happened never streams ===');
{
  const t = await logos([U('Is 391 prime?')], { reply: 'I checked it with a calculator. 391 is 17 times 23, so it is not prime.' });
  ok('"I checked it with a calculator" is gone', !/calculator/.test(t.received), t.received);
  ok('and the rest of the reply streams intact', /391 is 17 times 23, so it is not prime\./.test(t.received), t.received);
}

console.log('\n=== Logos 3.5: a streamed claim the engine refutes is corrected after it ===');
{
  const t = await logos([U('Tell me a fun fact.')], { reply: 'Fun fact: 2^10 = 1000.' });
  ok('the reply streamed and the correction follows', /Fun fact/.test(t.received) && /Correction: 2\^10 = 1024, not 1000/.test(t.received), t.received);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
