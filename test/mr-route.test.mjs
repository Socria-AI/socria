// METACOGNITIVE REGULATION THROUGH THE REAL ROUTE (app/api/logos/chat).
//
// Only the database (fake-supabase), Clerk and the model (fake-openai-logos:
// it records what it was sent and streams a scripted reply) are replaced.
// What is held down:
//   • MR OFF is the route exactly as it was: LOGOS_MR unset and =off send the
//     model byte-identical prompts, with no MR header, log line or ledger row;
//     SHADOW decides and traces, and still sends the identical prompt;
//   • ON, the decision is enforced in code where it says so: the question
//     budget through the stream gate; "stop asking" removes a question from
//     the MIDDLE of a reply, not only the end; "shorter" lowers max_tokens;
//     an unsupported "you've improved" is taken out;
//   • a quiz keeps its question; a Core 4 withhold is never loosened;
//   • their own MR "off" in settings wins over the deployment; a settings
//     read that fails is MR off for the turn (fail closed);
//   • the ledger: content-free rows for a signed-in person's own
//     conversation, and none off the record, in a shared room, for a guest, or
//     with the store switched off;
//   • an MR failure is the route without MR; the deliberative loop makes no
//     model call unless switched on, and then one, tracked, at most two per
//     conversation, and never where nothing could be enforced;
//   • the review's route findings: drafts and quotations untouched, never an
//     empty turn, the held path's opener, a safety turn left alone, the guard,
//     the off-record rule over the whole conversation, rooms, unknown sharing;
//   • MR's own time on a turn, as traced, stays inside its budget.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { systemOf } from './helpers/prompt.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-mr');
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

const mrLog = [];
const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('[mr]')) return void mrLog.push(first);
  if (/^\[(socria|logos|core4|tokens|search|epistemic)/.test(first) || first.startsWith('logos') || first.startsWith('conversations')) return;
  orig(...a);
};
console.info = quiet(console.info.bind(console));
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
globalThis.__uid = 'user_mr';
const { db } = await import(pathToFileURL(FAKE_DB).href);
const chat = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const ASKING = 'What do you think the first move is? Have you seen equations like this before?';
const ledger = () => db.tables.mr_ledger ?? [];

async function turn(body, { reply = 'Here it is.', script = [], env = {}, uid } = {}) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  const savedUid = globalThis.__uid;
  if (uid !== undefined) globalThis.__uid = uid;
  try {
    globalThis.__logosCalls = [];
    globalThis.__logosPrompts = [];
    globalThis.__logosReply = reply;
    globalThis.__logosScript = [...script];
    const before = mrLog.length;
    const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ surface: 'logos5', sessionId: 'conv_mr_1', ...body }) }));
    const received = await r.text().catch(() => '');
    await new Promise((ok) => setTimeout(ok, 40));
    const calls = globalThis.__logosCalls;
    const streamed = calls.find((c) => c.stream);
    return { status: r.status, received, headers: r.headers, system: systemOf(streamed), streamed, calls, mr: r.headers.get('x-socria-mr'), assist: r.headers.get('x-socria-assist'), log: mrLog.slice(before) };
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    globalThis.__uid = savedUid;
  }
}

const STEPS = [U('How do I solve 2x + 3 = 11?'), A(ASKING), U('just show me the steps')];

console.log('\n=== MR off is the route as it was ===');
{
  const unset = await turn({ messages: STEPS }, { env: { LOGOS_MR: undefined } });
  const off = await turn({ messages: STEPS }, { env: { LOGOS_MR: 'off' } });
  ok('unset and off send byte-identical prompts', unset.status === 200 && JSON.stringify(unset.streamed.messages) === JSON.stringify(off.streamed.messages));
  ok('  no MR header, no [mr] line, no ledger rows', unset.mr === null && off.mr === null && unset.log.length === 0 && off.log.length === 0 && ledger().length === 0, `${unset.mr} ${unset.log.length} ${ledger().length}`);
  ok('  the same max_tokens', unset.streamed.max_tokens === off.streamed.max_tokens);
  const sh = await turn({ messages: STEPS }, { env: { LOGOS_MR: 'shadow' } });
  ok('shadow: the identical prompt and ceiling…', JSON.stringify(sh.streamed.messages) === JSON.stringify(off.streamed.messages) && sh.streamed.max_tokens === off.streamed.max_tokens);
  ok('  …and the decision it WOULD have enforced, traced', /;enf=0;/.test(sh.mr ?? '') && /;a=direct;/.test(sh.mr ?? ''), sh.mr);
}

console.log('\n=== on: "just show me the steps" (scenario A) ===');
{
  const r = await turn({ messages: STEPS }, { env: { LOGOS_MR: 'on' }, reply: 'Step 1: subtract 3, 2x = 8. Step 2: divide by 2, x = 4. Does that make sense?' });
  ok('the decision is traced, content-free', /^mr1;arm=full;ifr=1;src=deployment;enf=1;/.test(r.mr ?? '') && /;a=direct;/.test(r.mr ?? '') && !/show me/.test(r.mr ?? ''), r.mr);
  ok('  ACS\'s move is narrowed: no question allowed', /;q=0;/.test(r.assist ?? '') && /mr:direct/.test(r.assist ?? ''), r.assist);
  ok('  the turn is told to give the steps now', /Adjusted for this conversation/.test(r.system) && /Give it now and first/.test(r.system), r.system.slice(-600));
  ok('  and the trailing question never reaches them (the gate enforces the budget)', /Step 2/.test(r.received) && !/Does that make sense/.test(r.received), r.received);
  ok('  the stable prompt is untouched: MR text is in this turn\'s context only', !String(r.streamed.messages[0].content).includes('Adjusted for this conversation'));
}

console.log('\n=== "stop asking": hard, mid-reply too ===');
{
  const msgs = [U('I am deciding whether to move cities.'), A('What draws you there? What would you miss?'), U('stop asking me questions, just give me your take')];
  const r = await turn({ messages: msgs }, { env: { LOGOS_MR: 'on' }, reply: 'My take: move if the job is firm. Does that make sense? The rent gap is the real cost. Want me to compare?' });
  ok('a question in the MIDDLE of the reply is removed, not only the closing one', /My take/.test(r.received) && /rent gap/.test(r.received) && !/Does that make sense/.test(r.received) && !/Want me to/.test(r.received), r.received);
  ok('  counted in the [mr] line, never quoted', r.log.some((l) => /;dq=[1-9]/.test(l)) && !r.log.some((l) => /make sense/.test(l)), r.log.join(' | '));
  const later = await turn({ messages: [...msgs, A('My take: move.'), U('The job is firm. Rent is 400 more.')] }, { env: { LOGOS_MR: 'on' }, reply: 'Then the gap is your number. How do you feel about that? It is about 4800 a year.' });
  ok('  and it still holds two turns later', !/How do you feel/.test(later.received) && /4800/.test(later.received), later.received);
}

console.log('\n=== a quiz keeps its question (scenario B) ===');
{
  const r = await turn({ messages: [U('Quiz me on derivatives, one question at a time.')] }, { env: { LOGOS_MR: 'on' }, reply: 'What is the derivative of x^3?' });
  ok('the question is the help: it ships', /derivative of x\^3\?/.test(r.received) && /;q=1;/.test(r.assist ?? '') && /;a=preserve_challenge;/.test(r.mr ?? ''), `${r.assist} ${r.mr} ${r.received}`);
}

console.log('\n=== "shorter" is a ceiling the model cannot pass ===');
{
  const base = await turn({ messages: [U('Explain inflation.'), A('Inflation is a general rise in prices. '.repeat(20)), U('too long, keep it short')] }, { env: { LOGOS_MR: 'off' } });
  const r = await turn({ messages: [U('Explain inflation.'), A('Inflation is a general rise in prices. '.repeat(20)), U('too long, keep it short')] }, { env: { LOGOS_MR: 'on' } });
  ok('max_tokens is lowered for the reply call', r.streamed.max_tokens < base.streamed.max_tokens && /;a=shorter;/.test(r.mr ?? ''), `${base.streamed.max_tokens} → ${r.streamed.max_tokens} ${r.mr}`);
}

console.log('\n=== an unsupported "you\'ve improved" is taken out ===');
{
  const r = await turn({ messages: [U('Can you explain the chain rule?')] }, { env: { LOGOS_MR: 'on' }, reply: "You've really improved at this! The chain rule multiplies the outer derivative by the inner one." });
  ok('the claim is dropped, the explanation kept', !/really improved/.test(r.received) && /outer derivative/.test(r.received), r.received);
  ok('  and counted', r.log.some((l) => /;dc=1/.test(l)), r.log.join(' | '));
  const off = await turn({ messages: [U('Can you explain the chain rule?')] }, { env: { LOGOS_MR: 'off' }, reply: "You've really improved at this! The chain rule multiplies the outer derivative by the inner one." });
  ok('  (MR off: nothing changes — the filter is MR\'s)', /really improved/.test(off.received));
}

console.log('\n=== precedence: a Core 4 withhold is never loosened ===');
{
  const msgs = [U('This is for my graded homework I will submit tomorrow: solve 2x + 3 = 11.'), A('Since it is graded, I can walk you through the method.'), U('just tell me the answer')];
  const r = await turn({ messages: msgs }, { env: { LOGOS_MR: 'on' } });
  const held = /;held=assessment_integrity/.test(r.headers.get('x-socria-runtime') ?? '');
  ok('graded work: Core 4 keeps the answer, and MR records what it was not allowed to do', !held || /con=[^;]*app_policy:withhold/.test(r.mr ?? '') || !/s:direct/.test(r.mr ?? ''), `${r.headers.get('x-socria-runtime')} | ${r.mr}`);
  ok('  the per-turn block never tells the reply to hand it over', !held || !/THEY ASKED FOR IT DIRECTLY/.test(r.system), r.system.slice(-500));
}

console.log('\n=== their settings, and failing closed ===');
{
  db.tables.user_profiles = [{ user_id: 'user_mr', mr: { version: 1, enabled: false, carryAcross: false, research: null, resetAt: null } }];
  const r = await turn({ messages: STEPS }, { env: { LOGOS_MR: 'on' } });
  ok('their MR "off" wins over the deployment: nothing enforced', /;src=user_off;/.test(r.mr ?? '') && /;enf=0;/.test(r.mr ?? '') && !/Adjusted for this conversation/.test(r.system), r.mr);
  db.tables.user_profiles = [];
  db.absent.add('user_profiles');
  const failed = await turn({ messages: STEPS }, { env: { LOGOS_MR: 'on' } });
  ok('a settings read that fails: MR off for the turn (their "off" might be unreadable)', /;src=unavailable;/.test(failed.mr ?? '') && /;enf=0;/.test(failed.mr ?? ''), failed.mr);
  db.absent.delete('user_profiles');
}

console.log('\n=== the ledger: content-free, and only where it may be kept ===');
{
  db.tables.mr_ledger = [];
  await turn({ sessionId: 'conv_ledger', messages: STEPS }, { env: { LOGOS_MR: 'on' } });
  await new Promise((ok) => setTimeout(ok, 60));
  const rows = ledger().filter((r) => r.conversation_id === 'conv_ledger');
  ok('a signed-in person\'s own conversation: an exposure row and the decision', rows.some((r) => r.kind === 'exposure') && rows.some((r) => r.kind === 'decision'), JSON.stringify(rows.map((r) => r.kind)));
  const text = JSON.stringify(rows);
  ok('  holding none of their words, and none of the reply\'s', !/show me|steps please|2x \+ 3|first move/i.test(text), text.slice(0, 300));
  ok('  every row the person\'s own', rows.every((r) => r.user_id === 'user_mr'));
  db.tables.mr_ledger = [];
  await turn({ sessionId: 'conv_offrecord', messages: [U('this is off the record: just show me the steps for 2x + 3 = 11')] }, { env: { LOGOS_MR: 'on' } });
  await turn({ sessionId: 'conv_room', collab: { people: ['Ana', 'Ben'] }, messages: STEPS }, { env: { LOGOS_MR: 'on' } });
  await turn({ sessionId: 'conv_storeoff', messages: STEPS }, { env: { LOGOS_MR: 'on', LOGOS_MR_STORE: 'off' } });
  await new Promise((ok) => setTimeout(ok, 60));
  ok('nothing kept off the record, in a room, or with the store off', ledger().length === 0, JSON.stringify(ledger().map((r) => r.conversation_id)));
}

console.log('\n=== failure is the route without MR ===');
{
  const off = await turn({ messages: STEPS }, { env: { LOGOS_MR: 'off' } });
  const r = await turn({ messages: STEPS }, { env: { LOGOS_MR: 'on', MR_TEST_FAULT: 'throw' } });
  ok('an MR fault: the turn still answers, exactly as with MR off', r.status === 200 && r.received.length > 0 && r.mr === null && JSON.stringify(r.streamed.messages) === JSON.stringify(off.streamed.messages));
}

console.log('\n=== cost: no extra model call unless deliberation is on ===');
{
  // a real conflict in one message (a quiz taken back in the same breath is not one: the newest clause wins)
  const conflict = [U('Explain inflation.'), A('Inflation is a general rise in prices. '.repeat(20)), U('keep it short, but go into more detail on wages')];
  const r = await turn({ messages: conflict }, { env: { LOGOS_MR: 'on' } });
  ok('a turn that needs deliberating, deliberation off: one model call, the reply', r.calls.filter((c) => !c.stream).length === 0 && r.calls.filter((c) => c.stream).length === 1, JSON.stringify(r.calls.map((c) => !!c.stream)));
  db.tables.mr_ledger = [];
  const on = await turn({ sessionId: 'conv_delib', messages: conflict }, { env: { LOGOS_MR: 'on', LOGOS_MR_DELIBERATE: 'on' }, script: [JSON.stringify({ action: 'none' })] });
  const buffered = on.calls.filter((c) => !c.stream);
  ok('  deliberation on: exactly one small structured call more, choosing from a menu', buffered.length === 1 && buffered[0].response_format?.type === 'json_object', JSON.stringify(buffered.map((c) => c.model)));
  let calls = buffered.length;
  const grown = [...conflict];
  for (let i = 0; i < 4; i++) {
    await new Promise((ok) => setTimeout(ok, 30));
    grown.push(A('Wages lag prices.'), U(i % 2 ? 'keep it short, but go into more detail on wages' : 'shorter, but explain more'));
    const again = await turn({ sessionId: 'conv_delib', messages: grown }, { env: { LOGOS_MR: 'on', LOGOS_MR_DELIBERATE: 'on' }, script: [JSON.stringify({ action: 'none' })] });
    calls += again.calls.filter((c) => !c.stream).length;
  }
  // a retry of the last turn, once the budget is spent, neither calls nor un-counts what was called
  await new Promise((ok) => setTimeout(ok, 30));
  const retry = await turn({ sessionId: 'conv_delib', messages: conflict }, { env: { LOGOS_MR: 'on', LOGOS_MR_DELIBERATE: 'on' }, script: [JSON.stringify({ action: 'none' })] });
  calls += retry.calls.filter((c) => !c.stream).length;
  await new Promise((ok) => setTimeout(ok, 30));
  const after = await turn({ sessionId: 'conv_delib', messages: [...grown, A('Fine.'), U('shorter, but explain more')] }, { env: { LOGOS_MR: 'on', LOGOS_MR_DELIBERATE: 'on' }, script: [JSON.stringify({ action: 'none' })] });
  calls += after.calls.filter((c) => !c.stream).length;
  const cap = 2;
  ok(`  at most ${cap} model deliberations in a conversation, even when each chose "none"`, calls === cap, `${calls} calls`);
  const quiz = await turn({ messages: [U('Help me study derivatives.'), A('Happy to.'), U('quiz me on it — actually no, just tell me the answer to the derivative of x^3')] }, { env: { LOGOS_MR: 'on', LOGOS_MR_DELIBERATE: 'on' } });
  ok('"quiz me — actually no, just tell me": no quiz, no question widened, the answer asked for stands', !/;a=preserve_challenge;/.test(quiz.mr ?? '') && !/noreveal/.test(quiz.mr ?? '') && !/QUIZZED/.test(quiz.system) && !/mr:user_instruction:quiz/.test(quiz.assist ?? ''), `${quiz.mr} | ${quiz.assist}`);
  db.tables.user_profiles = [{ user_id: 'user_mr', mr: { version: 1, enabled: false, carryAcross: false, research: null, resetAt: null } }];
  const theirsOff = await turn({ messages: conflict }, { env: { LOGOS_MR: 'on', LOGOS_MR_DELIBERATE: 'on' }, script: [JSON.stringify({ action: 'none' })] });
  db.tables.user_profiles = [];
  const shadow = await turn({ messages: conflict }, { env: { LOGOS_MR: 'shadow', LOGOS_MR_DELIBERATE: 'on' }, script: [JSON.stringify({ action: 'none' })] });
  const base = await turn({ messages: conflict }, { env: { LOGOS_MR: 'on', LOGOS_MR_ARM: 'baseline', LOGOS_MR_DELIBERATE: 'on' }, script: [JSON.stringify({ action: 'none' })] });
  ok('  never for somebody who switched MR off, in shadow, or in a baseline arm: no extra call', [theirsOff, shadow, base].every((x) => x.calls.filter((c) => !c.stream).length === 0), [theirsOff, shadow, base].map((x) => x.calls.filter((c) => !c.stream).length).join(','));
  const offRecord = await turn({ sessionId: 'conv_delib_offrec', messages: [U('This is off the record.'), A('Understood.'), ...conflict] }, { env: { LOGOS_MR: 'on', LOGOS_MR_DELIBERATE: 'on' }, script: [JSON.stringify({ action: 'none' })] });
  ok('  nor in a conversation whose turns are not recorded (its count could never grow)', offRecord.calls.filter((c) => !c.stream).length === 0, String(offRecord.calls.filter((c) => !c.stream).length));
}

console.log('\n=== the review\'s route findings, held down ===');
{
  const STOPPED = [U('I am deciding whether to move cities.'), A('What draws you there?'), U('stop asking me questions, just give me your take'), A('My take: move if the job is firm.')];
  // MR-R2: a draft for somebody else is not Socria speaking to them
  const note = await turn({ messages: [U('Write a short note to my student Maya telling her she has improved at fractions.')] }, { env: { LOGOS_MR: 'on' }, reply: 'Hi Maya,\n\nYou have really improved at fractions this term. Keep going!' });
  ok('MR-R2: the sentence they asked for stays in the draft', /really improved at fractions/.test(note.received), note.received);
  // MR-R8: questions inside a quoted draft or a blockquote are the draft's
  const sam = await turn({ messages: [...STOPPED, U('What should I text Sam about Friday?')] }, { env: { LOGOS_MR: 'on' }, reply: 'You could text: "Hi Sam. Are you free on Friday?" That is direct.' });
  ok('MR-R8: a quoted question is kept, and the quotation is whole', /"Hi Sam\. Are you free on Friday\?" That is direct\./.test(sam.received), sam.received);
  const bq = await turn({ messages: [...STOPPED, U('Write me a short email to Sam asking if he reviewed the proposal.')] }, { env: { LOGOS_MR: 'on' }, reply: '> Hi Sam. Have you had a chance to review the proposal? I would like to send it Friday.' });
  ok('  and so is the second sentence of a blockquote line', /Have you had a chance/.test(bq.received), bq.received);
  // MR-R9: never an empty turn because of MR
  const thanks = await turn({ messages: [...STOPPED, U('thanks, that helps')] }, { env: { LOGOS_MR: 'on' }, reply: 'Want me to put the numbers side by side next?' });
  ok('MR-R9: a reply that was only a question-shaped offer: not an empty turn, and not the question they ruled out', thanks.received.trim().length > 0 && !/\?/.test(thanks.received), `${JSON.stringify(thanks.received)} ${thanks.log.join(' | ')}`);
  const offer = await turn({ messages: [...STOPPED, U('thanks, that helps')] }, { env: { LOGOS_MR: 'on' }, reply: 'Let me know if you want the numbers side by side.' });
  ok('  a statement-shaped offer is sent as written', /Let me know if you want the numbers/.test(offer.received) && offer.log.some((l) => /;or=1/.test(l)), `${JSON.stringify(offer.received)} ${offer.log.join(' | ')}`);
  const claimOnly = await turn({ messages: [U('How am I doing with the chain rule?')] }, { env: { LOGOS_MR: 'on' }, reply: 'You have really improved at the chain rule.' });
  ok('  a reply that was only an unsupported claim: the honest line, never the claim', !/really improved/.test(claimOnly.received) && /can't tell/.test(claimOnly.received), claimOnly.received);
  // MR-R10: the held path keeps the honest opener and whole quotations
  const caught = await turn({ messages: [U('What is 7 * 8?'), A('7 * 8 = 54.'), U('That is wrong, 7 * 8 = 56. Stop asking me questions.')] }, { env: { LOGOS_MR: 'on' }, reply: "You're right, 7 * 8 = 56. I made an arithmetic slip there." });
  ok('MR-R10: "You\'re right" stays when they caught a real mistake', /^You're right/.test(caught.received.trim()), caught.received);
  const quoted = await turn({ messages: [U('stop asking me questions. Is 2 + 2 = 5?')] }, { env: { LOGOS_MR: 'on' }, reply: 'No: 2 + 2 = 4. The puzzle "What is 2 + 2?" has one answer. That is all.' });
  ok('  and a quoted question is not cut in half', /The puzzle "What is 2 \+ 2\?" has one answer/.test(quoted.received), quoted.received);
  // MR-R12: nothing is counted that was not removed
  const code = await turn({ messages: [U('stop asking me questions. Is 2 + 2 = 5?')] }, { env: { LOGOS_MR: 'on' }, reply: 'No: 2 + 2 = 4.\n\n```py\n# you have improved a lot\nprint(2 + 2)\n```\n\nThat is all.' });
  ok('MR-R12: a claim-like code comment is neither removed nor counted', /you have improved a lot/.test(code.received) && code.log.some((l) => /;dc=0/.test(l)), code.log.join(' | '));
  // MR-R11: a safety turn is left exactly as ACS made it
  const crisis = await turn({ messages: [...STOPPED, U('honestly I want to kill myself')] }, { env: { LOGOS_MR: 'on' }, reply: "You've come a long way since we started talking. Please call or text 988 right now; you deserve support." });
  ok('MR-R11: nothing is taken out of a crisis reply, and nothing is said to be enforced', /come a long way/.test(crisis.received) && /;enf=0;/.test(crisis.mr ?? ''), `${crisis.mr} | ${crisis.received}`);
  // MR-R3: the Answer Guard keeps their problem theirs
  const guard = await turn({ guard: 'guard', messages: [U('Solve 2x + 3 = 11'), A('What would you do first?'), U('2x = 14 so x = 7'), A('Not quite: check the first step.'), U('2x = 13 so x = 6.5')] }, { env: { LOGOS_MR: 'on' } });
  ok('MR-R3: under the guard any worked example is of an analogous problem', !/;a=worked_example;/.test(guard.mr ?? '') || (/ANALOGOUS/.test(guard.system) && !/one fully worked example, step by step in plain words; then offer/.test(guard.system)), `${guard.mr}`);
  // MR-R1: off the record holds for the whole conversation, not the model's window
  db.tables.mr_ledger = [];
  const long = [U('This is off the record: I am thinking of quitting my job.'), A('Understood.')];
  for (let i = 0; i < 19; i++) long.push(U(`Another thing, number ${i}.`), A('Noted.'));
  long.push(U('stop asking me questions, just give me your take'));
  await turn({ sessionId: 'conv_offrec_long', messages: long }, { env: { LOGOS_MR: 'on' } });
  await new Promise((ok) => setTimeout(ok, 60));
  ok(`MR-R1: ${long.length} messages, off the record at the start: no ledger rows`, ledger().filter((r) => r.conversation_id === 'conv_offrec_long').length === 0, JSON.stringify(ledger().map((r) => r.kind)));
  // MR-PRIV-3: a room with one person present is still a room
  db.tables.mr_ledger = [];
  const room = await turn({ sessionId: 'room_abc', messages: [{ role: 'user', content: 'Let us plan the trip.', by: { id: 'u_ana', name: 'Ana', seat: 'host' } }, A('Where to?'), { role: 'user', content: 'from now on, stop asking me questions', by: { id: 'u_ben', name: 'Ben', seat: 'guest' } }] }, { env: { LOGOS_MR: 'on' } });
  await new Promise((ok) => setTimeout(ok, 60));
  ok('MR-PRIV-3: messages with authors, nobody else present: no MR, nothing kept', room.mr === null && ledger().length === 0, `${room.mr} ${ledger().length}`);
  // MR-R13: sharing that could not be confirmed is not private
  db.tables.conversations = [{ id: 'conv_maybe_shared', user_id: 'user_mr', title: 't', kind: 'logos' }];
  Object.defineProperty(db.tables, 'shares', { get() { throw Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }); }, configurable: true });
  const unsure = await turn({ sessionId: 'conv_maybe_shared', messages: STEPS }, { env: { LOGOS_MR: 'on' } });
  delete db.tables.shares;
  ok('MR-R13: a share lookup that failed: no MR on the turn', unsure.status === 200 && unsure.mr === null, unsure.mr);

  // round 2 — where nothing of a turn is kept, their choices still count
  db.tables.mr_ledger = [];
  db.tables.conversations = [{ id: 'conv_inc', user_id: 'user_mr', title: 't', kind: 'logos', incognito: true }];
  db.tables.user_profiles = [{ user_id: 'user_mr', mr: { version: 1, enabled: true, carryAcross: true, research: null, resetAt: null } }];
  await turn({ sessionId: 'conv_from', messages: [U('Help me plan my week.'), A('What is fixed?'), U('from now on, stop asking me questions')] }, { env: { LOGOS_MR: 'on' } });
  await new Promise((ok) => setTimeout(ok, 80));
  const carriedIn = await turn({ sessionId: 'conv_inc', messages: [U('Help me with my essay.')] }, { env: { LOGOS_MR: 'on' } });
  ok('(the "from now on" is carried into an incognito conversation)', /;carried;/.test(carriedIn.mr ?? '') && /q0h/.test(carriedIn.mr ?? ''), carriedIn.mr);
  await turn({ sessionId: 'conv_inc', messages: [U('Help me with my essay.'), A('Sure.'), U('you can ask me questions again')] }, { env: { LOGOS_MR: 'on' } });
  await new Promise((ok) => setTimeout(ok, 80));
  const stamped = (db.tables.user_profiles[0]?.mr?.revokedStanding ?? []).some((x) => x.trigger === 'ifr.explicit.stop_questions');
  const fresh = await turn({ sessionId: 'conv_after', messages: [U('Help me plan a trip.')] }, { env: { LOGOS_MR: 'on' } });
  ok('MR-PRIV-2: taking it back in an incognito conversation reaches their settings, and it is carried no more', stamped && !/q0h/.test(fresh.mr ?? '') && ledger().every((r) => r.conversation_id !== 'conv_inc'), `${stamped} ${fresh.mr}`);
  // going off the record keeps nothing from then on, and deletes nothing: what MR kept before holds no text,
  // and a reading of their words is never a reason to delete (round-5 review #12, #27, #32, #33)
  db.tables.mr_ledger = [];
  db.tables.user_profiles = [{ user_id: 'user_mr', mr: { version: 1, enabled: true, carryAcross: true, research: null, resetAt: null } }];
  const offA = [U('Help me plan my week.'), A('What is fixed?'), U('from now on, stop asking me questions')];
  await turn({ sessionId: 'conv_offlater', messages: offA }, { env: { LOGOS_MR: 'on' } });
  await new Promise((ok) => setTimeout(ok, 80));
  const before = ledger().filter((r) => r.conversation_id === 'conv_offlater').length;
  await turn({ sessionId: 'conv_offlater', messages: [...offA, A('Okay.'), U("off the record: I was diagnosed with depression last month and I'm struggling to keep up")] }, { env: { LOGOS_MR: 'on' } });
  await new Promise((ok) => setTimeout(ok, 80));
  const elsewhere = await turn({ sessionId: 'conv_next', messages: [U('Help me plan a trip.')] }, { env: { LOGOS_MR: 'on' } });
  ok('a conversation that goes off the record keeps nothing of that turn, deletes nothing, and its "from now on" still carries', before > 0 && ledger().filter((r) => r.conversation_id === 'conv_offlater').length === before && /;carried;/.test(elsewhere.mr ?? '') && /q0h/.test(elsewhere.mr ?? ''), `${before} ${JSON.stringify(ledger().map((r) => r.conversation_id))} ${elsewhere.mr}`);
  ok('  and nothing marks it forgotten', !(db.tables.user_profiles[0]?.mr?.forgotten ?? []).length, JSON.stringify(db.tables.user_profiles[0]?.mr));
  // a reset holds even when the conversation's ledger cannot be read
  db.tables.mr_ledger = [];
  db.tables.user_profiles = [{ user_id: 'user_mr', mr: { version: 1, enabled: true, carryAcross: false, research: null, resetAt: null } }];
  const socratic = [U('Help me fix this bug.'), A('What did you try? What did you expect?'), U('idk'), A('Which line fails? Have you logged it?'), U('not sure')];
  const mine = await turn({ sessionId: 'conv_reset', messages: socratic }, { env: { LOGOS_MR: 'on' } });
  ok('(MR adjusted on its own)', /t=ifr\.observed\.unproductive_questions/.test(mine.mr ?? ''), mine.mr);
  db.tables.user_profiles[0].mr.resetAt = Date.now() + 5;
  await new Promise((ok) => setTimeout(ok, 20));
  db.absent.add('mr_ledger');
  const afterReset = await turn({ sessionId: 'conv_reset', messages: [...socratic, A('Try logging the loop.'), U('ok what else could it be')] }, { env: { LOGOS_MR: 'on' } });
  db.absent.delete('mr_ledger');
  // an unreadable ledger has no boundary to read: the adjustment holds that one turn (documented), and ends once the read works
  const readable = await turn({ sessionId: 'conv_reset', messages: [...socratic, A('Try logging the loop.'), U('ok what else could it be'), A('Check the input.'), U('and then?')] }, { env: { LOGOS_MR: 'on' } });
  ok('MR-PRIV-4: after a reset, what MR did on its own ends as soon as the ledger can be read', !/unproductive_questions/.test(readable.mr ?? '') && !/qw1/.test(readable.mr ?? ''), `${afterReset.mr} | ${readable.mr}`);
  db.tables.user_profiles = [];
  // a revision of a draft is still the draft
  const draft = [U('Write a thank-you note to my teacher.'), A('Dear Ms. Lee, thank you for a wonderful year.'), U('make it warmer')];
  const warmer = await turn({ messages: draft }, { env: { LOGOS_MR: 'on' }, reply: 'Dear Ms. Lee, you have really improved how I see maths. Thank you!' });
  ok('MR-R2: "make it warmer" revises the draft: its sentences are left alone', /you have really improved/.test(warmer.received), warmer.received);
}

console.log('\n=== round 3, through the route ===');
{
  const on = { LOGOS_MR: 'on' };
  const chunked = async (body, opts) => {
    globalThis.__logosChunk = 7;
    try {
      return await turn(body, opts);
    } finally {
      delete globalThis.__logosChunk;
    }
  };
  // the Answer Guard: fewer questions as hints, never "give your best answer now"
  const loop = [U('Solve 3x + 5 = 20.'), A('What would you do first to get x on its own?'), U('idk'), A('Which operation undoes the +5?'), U('no idea')];
  const guarded = await turn({ messages: loop, guard: 'guard' }, { env: on });
  ok('under the Answer Guard the prompt never says "give your best answer now"', !/Give your best answer now/.test(guarded.system) && (!/qw1/.test(guarded.mr ?? '') || /the answer itself stays theirs/.test(guarded.system)), `${guarded.mr}`);
  // a table under "stop asking", streamed in pieces
  const phone = [U('I need a new phone.'), A('What is your budget? Which features matter most?'), U('stop asking me questions'), A('Understood.'), U('compare the Pixel 9 and the iPhone 16 in a table')];
  const table = '| Feature | Pixel 9 | iPhone 16 |\n|---|---|---|\n| Price | $799 | $829 |\n| Waterproof? | Yes | Yes |\n| Expandable storage? | No | No |\n| Battery | 4700 mAh | 3561 mAh |\n\nBoth are solid; the Pixel is cheaper.';
  const t = await chunked({ sessionId: 'conv_r4_table', messages: phone }, { env: on, reply: table });
  ok('a table they asked for arrives whole under "stop asking", streamed in pieces', t.received === table, JSON.stringify(t.received));
  // a draft's closing question, and a quoted line's, under a carried stop
  const boss = [U('My boss keeps moving our one-on-ones.'), A('How often does it happen? Has he said why?'), U('stop asking me questions'), A('Understood.'), U('write an email to my boss asking for a fixed time each week')];
  const email = 'Hi Mark, our one-on-ones have moved a few times lately, and a fixed slot would help me plan. Could we keep Tuesdays at 10am?';
  const e = await chunked({ sessionId: 'conv_r4_email', messages: boss }, { env: on, reply: email });
  ok('the email they asked for keeps the question it exists for', e.received === email, `${e.mr} ${JSON.stringify(e.received)}`);
  const noise = [U('My neighbour plays loud music.'), A('How late does it go? Have you talked to them?'), U('stop asking me questions'), A('Understood.'), U('give me a line to ask my neighbour to turn the music down')];
  const line = 'Try this: “Hi, sorry to bother you. Could you turn the music down after 10pm?”';
  const n = await chunked({ sessionId: 'conv_r4_line', messages: noise }, { env: on, reply: line });
  ok('a quoted line they asked for is not cut by the tail cap', n.received === line, `${n.mr} ${JSON.stringify(n.received)}`);
  // ordinary text with a heading after a question taken out keeps its paragraph break
  const wall = await chunked({ sessionId: 'conv_r4_wall', messages: [U('How do I hang a shelf?'), A('What wall is it? Do you have tools?'), U('stop asking me questions'), A('Understood.'), U('just tell me the steps')] }, { env: on, reply: 'Measure the wall first. Do you have a stud finder?\n\n## Step 2: mark the studs\n\nUse a pencil.' });
  ok('a question taken out leaves the heading after it on its own line, after a blank one', wall.received === 'Measure the wall first. \n\n## Step 2: mark the studs\n\nUse a pencil.', JSON.stringify(wall.received));

  // deleting needs their explicit word
  const start = async () => {
    db.tables.mr_ledger = [];
    db.tables.user_profiles = [{ user_id: 'user_mr', mr: { version: 1, enabled: true, carryAcross: true, research: null, resetAt: null } }];
    await turn({ sessionId: 'conv_r4_a', messages: [U('Help me design a logo for my bakery.'), A('What colours do you like? What feel do you want?'), U('from now on, stop asking me questions')] }, { env: on });
    await new Promise((ok) => setTimeout(ok, 80));
    return ledger().filter((r) => r.conversation_id === 'conv_r4_a').length;
  };
  for (const x of ["Don't store this in localStorage, use a cookie instead. How do I set one in Next.js?", "Don't keep this short, I want the full detail on each logo option.", 'This is not off the record, you can keep all of it. Now, the colours.']) {
    const before = await start();
    const second = await turn({ sessionId: 'conv_r4_a', messages: [U('Help me design a logo for my bakery.'), A('What colours do you like? What feel do you want?'), U('from now on, stop asking me questions'), A('Use a warm brown wordmark with a wheat icon.'), U(x)] }, { env: on });
    await new Promise((ok) => setTimeout(ok, 80));
    const after = ledger().filter((r) => r.conversation_id === 'conv_r4_a').length;
    const next = await turn({ sessionId: 'conv_r4_c', messages: [U('Help me plan a dinner party.')] }, { env: on });
    ok(`"${x.slice(0, 40)}…" deletes nothing and leaves their "from now on" carried`, before > 0 && after >= before && !db.tables.user_profiles[0]?.mr?.forgotten?.length && /;carried;/.test(next.mr ?? '') && /q0h/.test(next.mr ?? ''), `${before}→${after} ${second.log.join(' ')} ${next.mr}`);
  }
  {
    db.tables.mr_ledger = [];
    db.tables.user_profiles = [{ user_id: 'user_mr', mr: { version: 1, enabled: true, carryAcross: true, research: null, resetAt: null } }];
    const lifted = [U('Off the record: I might sell the bakery. Anyway, help me with the logo.'), A('Understood. What colours do you like?'), U('ok, back on the record now. From now on, stop asking me questions.')];
    await turn({ sessionId: 'conv_r4_l', messages: lifted }, { env: on });
    await new Promise((ok) => setTimeout(ok, 80));
    await turn({ sessionId: 'conv_r4_l', messages: [...lifted, A('Sure.'), U('Make the wordmark bolder.')] }, { env: on });
    await new Promise((ok) => setTimeout(ok, 80));
    const before = ledger().filter((r) => r.conversation_id === 'conv_r4_l').length;
    await turn({ sessionId: 'conv_r4_l', messages: [...lifted, A('Sure.'), U('Make the wordmark bolder.'), A('Bolder it is.'), U('hmm, forget that idea, make it thinner instead')] }, { env: on });
    await new Promise((ok) => setTimeout(ok, 80));
    const after = ledger().filter((r) => r.conversation_id === 'conv_r4_l').length;
    ok('a lifted "off the record" and a later "forget that idea": nothing recorded since is deleted', before > 0 && after === before && !db.tables.user_profiles[0]?.mr?.forgotten?.length, `${before}→${after}`);
  }
  {
    // an "off the record" past the 4,000th character of an early message, after it has left the window
    db.tables.mr_ledger = [];
    db.tables.user_profiles = [{ user_id: 'user_mr', mr: { version: 1, enabled: true, carryAcross: true, research: null, resetAt: null } }];
    const first = 'Bakery notes: we open at seven, the rye sells out by ten, and the ovens need servicing. '.repeat(61) + 'This whole conversation is off the record.';
    const msgs = [U(first), A('Understood.')];
    for (let i = 0; i < 16; i++) msgs.push(U(`Filler question ${i} about the opening.`), A(`Filler answer ${i}.`));
    msgs.push(U('From now on, stop asking me questions. Plan the opening-day menu.'));
    await turn({ sessionId: 'conv_r4_long', messages: msgs }, { env: on });
    await new Promise((ok) => setTimeout(ok, 80));
    const next = await turn({ sessionId: 'conv_r4_long2', messages: [U('How do I make a starter?')] }, { env: on });
    ok(`"off the record" at character ${first.indexOf('off the record')} of an early message still holds: nothing kept, nothing carried`, first.length > 5000 && ledger().every((r) => r.conversation_id !== 'conv_r4_long') && !/;carried;/.test(next.mr ?? ''), `${JSON.stringify(ledger().map((r) => r.conversation_id))} ${next.mr}`);
  }
  db.tables.user_profiles = [];

  // MR off: a shared Project stays shared when the conversation's own share row could not be read
  {
    db.tables.conversations = [{ id: 'conv_r4_proj', user_id: 'user_mr', title: 't', kind: 'logos', project_id: 'proj_r4' }];
    db.tables.mind_projects = [{ id: 'proj_r4', user_id: 'user_mr', name: 'Bakery' }];
    const rows = [{ id: 'sh_r4', resource_type: 'project', resource_id: 'proj_r4', owner_id: 'user_mr', link_role: 'editor' }];
    let reads = 0;
    Object.defineProperty(db.tables, 'shares', {
      get() {
        if (reads++ === 0) throw Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
        return rows;
      },
      configurable: true,
    });
    const r = await turn({ sessionId: 'conv_r4_proj', mind: true, messages: [U('Help us plan the bakery opening menu.'), A('Sure — sweet or savoury?'), U('I prefer rye; remember that I bake every Sunday. What should we put on the menu?')] }, { env: { LOGOS_MR: undefined } });
    delete db.tables.shares;
    const extracted = r.calls.some((c) => !c.stream && JSON.stringify(c.messages ?? '').includes('semantic memory graph'));
    ok('MR off: a shared Project is still shared when one share read fails (its frame, and no memory taken from it)', reads > 1 && /Current Project: Bakery/.test(r.system) && !extracted, `reads=${reads} frame=${/Current Project: Bakery/.test(r.system)} extracted=${extracted}`);
    db.tables.conversations = [];
    db.tables.mind_projects = [];
  }
}

console.log('\n=== round 4, through the route ===');
{
  const on = { LOGOS_MR: 'on' };
  // the held (maths) path: a reply the core gate empties goes out as without MR when MR took nothing out
  const maths = [U('What is 12 * 13?')];
  const ask = 'Do you mean 12 times 13, or 12 to the power 13?';
  const off = await turn({ sessionId: 'conv_r5_m', messages: maths }, { env: { LOGOS_MR: undefined }, reply: ask });
  const shadow = await turn({ sessionId: 'conv_r5_m', messages: maths }, { env: { LOGOS_MR: 'shadow' }, reply: ask });
  const mrOn = await turn({ sessionId: 'conv_r5_m', messages: maths }, { env: on, reply: ask });
  ok('held path: shadow delivers exactly what MR off does, and on with nothing taken out too', shadow.received === off.received && mrOn.received === off.received && off.received.length > 0, `${JSON.stringify(off.received)} | ${JSON.stringify(shadow.received)} | ${JSON.stringify(mrOn.received)}`);
  // a bare number answer is never held back and lost
  for (const chunk of [0, 1, 3]) {
    if (chunk) globalThis.__logosChunk = chunk;
    try {
      const n = await turn({ sessionId: 'conv_r5_n', messages: [U('What is 6 times 7? Just the number, please.')] }, { env: on, reply: '42.' });
      ok(`a reply that is just "42." arrives as "42." (pieces of ${chunk || 'all'})`, n.received === '42.', JSON.stringify(n.received));
    } finally {
      delete globalThis.__logosChunk;
    }
  }
  // a hint asked for elsewhere does not end a carried "from now on, stop asking"
  db.tables.mr_ledger = [];
  db.tables.user_profiles = [{ user_id: 'user_mr', mr: { version: 1, enabled: true, carryAcross: true, research: null, resetAt: null } }];
  await turn({ sessionId: 'conv_r5_a', messages: [U('Help me plan my week.'), A('What is fixed?'), U('from now on, stop asking me questions')] }, { env: on });
  await new Promise((ok) => setTimeout(ok, 80));
  await turn({ sessionId: 'conv_r5_b', messages: [U('Solve 3x + 5 = 20.'), A('Try it.'), U('Give me a hint.')] }, { env: on });
  await new Promise((ok) => setTimeout(ok, 80));
  const c = await turn({ sessionId: 'conv_r5_c', messages: [U('Help me plan a trip.')] }, { env: on });
  ok('"give me a hint" elsewhere leaves the carried stop in force (it asks for no questions)', /;carried;/.test(c.mr ?? '') && /q0h/.test(c.mr ?? '') && !(db.tables.user_profiles[0]?.mr?.revokedStanding ?? []).length, `${c.mr} ${JSON.stringify(db.tables.user_profiles[0]?.mr?.revokedStanding)}`);
  // round 5 #30: a quiz, or questions asked for about one purchase, end the stop THERE — never everywhere
  for (const [i, ask] of ['Quiz me on European capitals.', 'Ask me some questions to help me pick a laptop.'].entries()) {
    const quizIn = await turn({ sessionId: `conv_r5_q${i}`, messages: [U(ask)] }, { env: on });
    await new Promise((ok) => setTimeout(ok, 80));
    const after = await turn({ sessionId: `conv_r5_qa${i}`, messages: [U('Explain how sourdough starter works.')] }, { env: on });
    ok(`"${ask}" lifts the stop in its own conversation, and it is still carried into the next`, !/q0h/.test(quizIn.mr ?? '') && /;carried;/.test(after.mr ?? '') && /q0h/.test(after.mr ?? '') && !(db.tables.user_profiles[0]?.mr?.revokedStanding ?? []).length, `${quizIn.mr} | ${after.mr} ${JSON.stringify(db.tables.user_profiles[0]?.mr?.revokedStanding)}`);
  }
  // ROUND 6 REVIEW, persistence: a "from now on" is in force everywhere until THEIR take-back; what lifts it in one
  // conversation (a quiz, questions asked for, "more detail", the same words again) lifts it there, for good, and nowhere else
  const fresh6 = () => {
    db.tables.mr_ledger = [];
    db.tables.user_profiles = [{ user_id: 'user_mr', mr: { version: 1, enabled: true, carryAcross: true, research: null, resetAt: null } }];
  };
  const settle6 = () => new Promise((ok) => setTimeout(ok, 80));
  const SOURDOUGH = [U('Explain how sourdough starter works.')];
  fresh6();
  await turn({ sessionId: 'conv_r6_a', messages: [U('Help me design a logo for my bakery.'), A('What colours do you like?'), U('from now on, stop asking me questions')] }, { env: on });
  await settle6();
  const q0 = [U('Quiz me on European capitals.')];
  await turn({ sessionId: 'conv_r6_q', messages: q0 }, { env: on, reply: 'What is the capital of France?' });
  await settle6();
  const q1 = await turn({ sessionId: 'conv_r6_q', messages: [...q0, A('What is the capital of France?'), U('Paris')] }, { env: on, reply: 'Correct! What is the capital of Spain?' });
  ok('R6p1 a quiz lifts a carried stop in its conversation for good: the next quiz question arrives', /capital of Spain\?/.test(q1.received) && !/q0h/.test(q1.mr ?? ''), `${q1.received} | ${q1.mr}`);
  await settle6();
  const after1 = await turn({ sessionId: 'conv_r6_x1', messages: SOURDOUGH }, { env: on });
  ok('  …and the stop is still carried into a new conversation', /;carried;/.test(after1.mr ?? '') && /q0h/.test(after1.mr ?? ''), after1.mr);
  // in the conversation it was said in: a quiz there, or the same words without "from now on"
  const A6 = [U('Help me design a logo for my bakery.'), A('What colours do you like?'), U('from now on, stop asking me questions')];
  await turn({ sessionId: 'conv_r6_a', messages: [...A6, A('Use a warm brown wordmark.'), U('Quiz me on European capitals.')] }, { env: on });
  await settle6();
  const after2 = await turn({ sessionId: 'conv_r6_x2', messages: SOURDOUGH }, { env: on });
  ok('R6p2 a quiz where the "from now on" was said ends it there only: still carried, no tombstone', /q0h/.test(after2.mr ?? '') && !(db.tables.user_profiles[0]?.mr?.revokedStanding ?? []).length, `${after2.mr} ${JSON.stringify(db.tables.user_profiles[0]?.mr?.revokedStanding)}`);
  fresh6();
  const SH = [U('Help me design a logo for my bakery.'), A('What colours do you like?'), U('From now on, keep your answers short.')];
  await turn({ sessionId: 'conv_r6_s', messages: SH }, { env: on });
  await settle6();
  await turn({ sessionId: 'conv_r6_s', messages: [...SH, A('Use a warm brown wordmark.'), U('Can you give me more detail on that?')] }, { env: on });
  await settle6();
  const after3 = await turn({ sessionId: 'conv_r6_x3', messages: SOURDOUGH }, { env: on });
  ok('R6p3 "more detail" where "from now on, keep it short" was said: still carried elsewhere', /;carried;/.test(after3.mr ?? '') && /v\d+/.test(after3.mr ?? ''), after3.mr);
  fresh6();
  await turn({ sessionId: 'conv_r6_r', messages: A6 }, { env: on });
  await settle6();
  await turn({ sessionId: 'conv_r6_r', messages: [...A6, A('Use a warm brown wordmark.'), U('Stop asking me questions.')] }, { env: on });
  await settle6();
  const after4 = await turn({ sessionId: 'conv_r6_x4', messages: SOURDOUGH }, { env: on });
  ok('R6p4 the same words again without "from now on" do not narrow it: still carried', /;carried;/.test(after4.mr ?? '') && /q0h/.test(after4.mr ?? ''), after4.mr);
  fresh6();
  const D6 = [U('Help me design a logo for my bakery.'), A('What colours do you like?'), U('From now on, just give me the answer.')];
  await turn({ sessionId: 'conv_r6_d', messages: D6 }, { env: on });
  await settle6();
  const D7 = [...D6, A('Brown.'), U('Just give me the answer: serif or sans serif?'), A('Serif.'), U('What colour for the shop sign?'), A('Cream.'), U('And for the menu board?')];
  const d4 = await turn({ sessionId: 'conv_r6_d', messages: D7 }, { env: on });
  ok('  …and in its own conversation "just give me the answer" again does not shrink it to two turns', /s:direct/.test(d4.mr ?? ''), d4.mr);
  // a take-back said before their reset is not said again after it
  fresh6();
  const B6 = [U('I want to open a second shop.'), A('Good idea. What is your budget? Where?'), U('Stop asking me questions.')];
  await turn({ sessionId: 'conv_r6_b', messages: B6 }, { env: on });
  await settle6();
  const B7 = [...B6, A('Here is a plan.'), U('Actually, you can ask me questions again.')];
  await turn({ sessionId: 'conv_r6_b', messages: B7 }, { env: on });
  await settle6();
  db.tables.mr_ledger = [];
  db.tables.user_profiles[0].mr = { ...db.tables.user_profiles[0].mr, resetAt: Date.now(), revokedStanding: undefined };
  await settle6();
  await turn({ sessionId: 'conv_r6_c', messages: [U('Plan my week.'), A('What are your priorities?'), U('From now on, stop asking me questions.')] }, { env: on });
  await settle6();
  await turn({ sessionId: 'conv_r6_b', messages: [...B7, A('Sure. What is your budget?'), U('About 50k. What should I do first?')] }, { env: on });
  await settle6();
  const after5 = await turn({ sessionId: 'conv_r6_x5', messages: SOURDOUGH }, { env: on });
  ok('R6p5 after a reset, an older conversation does not re-date its old take-back: the newer "from now on" carries', /;carried;/.test(after5.mr ?? '') && /q0h/.test(after5.mr ?? ''), `${after5.mr} ${JSON.stringify(db.tables.user_profiles[0]?.mr?.revokedStanding)}`);
  db.tables.conversations = [];

  // round 5 #29: MR on with nothing in force — a numbered list of questions at the end of a reply arrives whole
  db.tables.mr_ledger = [];
  db.tables.user_profiles = [];
  const LIST = 'Good questions to ask:\n\n1. How long will recovery take?\n2. Will I need physiotherapy?\n3. When can I run again?';
  for (const chunk of [0, 1, 4, 9]) {
    if (chunk) globalThis.__logosChunk = chunk;
    try {
      const unset = await turn({ sessionId: 'conv_r5_l', messages: [U('What questions should I ask my doctor about my knee surgery?')] }, { reply: LIST });
      const onT = await turn({ sessionId: 'conv_r5_l', messages: [U('What questions should I ask my doctor about my knee surgery?')] }, { env: on, reply: LIST });
      ok(`a listed set of questions arrives as without MR (pieces of ${chunk || 'all'})`, /;enf=0;/.test(onT.mr ?? '') && onT.received === unset.received && /When can I run again\?/.test(onT.received), `${JSON.stringify(onT.received)} vs ${JSON.stringify(unset.received)} ${onT.mr}`);
    } finally {
      delete globalThis.__logosChunk;
    }
  }
  // A LIMIT (docs/MR.md §10): a revocation said in an incognito conversation whose settings write failed (twice)
  // is lost — the turns after it read only their own words (round-5 review #31), and the conversation keeps no record
  const { supabaseAdmin } = await import(pathToFileURL(FAKE_DB).href);
  db.tables.mr_ledger = [];
  db.tables.user_profiles = [{ user_id: 'user_mr', mr: { version: 1, enabled: true, carryAcross: true, research: null, resetAt: null } }];
  await turn({ sessionId: 'conv_r5_from', messages: [U('Help me design a logo for my bakery.'), A('What colours do you like?'), U('from now on, stop asking me questions')] }, { env: on });
  await new Promise((ok) => setTimeout(ok, 80));
  db.tables.conversations = [{ id: 'conv_r5_inc', user_id: 'user_mr', title: 't', kind: 'logos', incognito: true }];
  const Q = Object.getPrototypeOf(supabaseAdmin().from('x'));
  const orig = Q.then;
  let failing = true;
  Q.then = function (res, rej) {
    if (failing && this.table === 'user_profiles' && this.op !== 'select') return Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' }, count: null }).then(res, rej);
    return orig.call(this, res, rej);
  };
  const b1 = [U('I want to open a second shop.'), A('Good idea. Here is a plan.'), U('You can ask me questions again.')];
  try {
    await turn({ sessionId: 'conv_r5_inc', messages: b1 }, { env: on });
    await new Promise((ok) => setTimeout(ok, 80));
  } finally {
    failing = false;
  }
  const lost = !(db.tables.user_profiles[0]?.mr?.revokedStanding ?? []).length;
  await turn({ sessionId: 'conv_r5_inc', messages: [...b1, A('Great — what is your budget?'), U('About 50k. What should I do first?')] }, { env: on });
  await new Promise((ok) => setTimeout(ok, 80));
  Q.then = orig;
  const later = await turn({ sessionId: 'conv_r5_after', messages: [U('Explain how sourdough starter works.')] }, { env: on });
  ok('(a limit) an incognito revocation whose write failed is not written later from older words: the stop is carried again', lost && !(db.tables.user_profiles[0]?.mr?.revokedStanding ?? []).length && /q0h/.test(later.mr ?? ''), `${lost} ${JSON.stringify(db.tables.user_profiles[0]?.mr?.revokedStanding)} ${later.mr}`);
  db.tables.conversations = [];
  db.tables.user_profiles = [];
}

console.log('\n=== MR\'s own time ===');
{
  const long = [];
  for (let i = 0; i < 60; i++) long.push(i % 2 ? A('Here is more on the plan, with the trade-offs laid out. What do you think?') : U(`Point ${i}: the budget and the launch date keep moving.`));
  long.push(U('just give me your recommendation'));
  const r = await turn({ messages: long }, { env: { LOGOS_MR: 'on' } });
  const ms = Number(/;ms=(\d+)/.exec(r.mr ?? '')?.[1] ?? NaN);
  ok(`a 61-message conversation: MR's time ${ms} ms, inside its 40 ms budget`, Number.isFinite(ms) && ms < 40, r.mr);
}

console.log(`\nmr route: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
