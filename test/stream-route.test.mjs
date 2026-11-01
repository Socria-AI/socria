// THE STREAM GATE THROUGH THE REAL ROUTE (app/api/logos/chat).
//
// test/stream-trim.test.mjs holds the gate down on its own; this holds it down
// where it runs, with the route's own seams around it (Metacognitive
// Regulation's filters, the citation check, the inline block hook). Only the
// database (fake-supabase), Clerk and the model (fake-openai-logos: it streams
// a scripted reply in deltas of __logosChunk characters) are replaced.
// What is held down:
//   • the person receives what they asked for, verbatim, at deltas of 1, 3
//     and 6 characters and whole, with MR on (the default) and LOGOS_MR=off:
//     a quoted draft whose last line is "Let me know if you have any
//     questions.", the same draft followed by "Hope this helps!" (only that
//     unquoted trailing line may go), an unquoted email after "Subject:", and
//     "three polite ways to end a work email" with the third a closer;
//   • a streamed ```ui block is checked at deltas of 6: a pretty-printed
//     chart of their own numbers arrives canonical, and one whose figures are
//     nobody's arrives as the notice, never as JSON sentences;
//   • a genuine trailing offer of Socria's own still never arrives.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-stream');
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

const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (/^\[/.test(first) || first.startsWith('logos') || first.startsWith('conversations')) return;
  orig(...a);
};
console.info = quiet(console.info.bind(console));
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
globalThis.__uid = 'user_stream';
const chat = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = JSON.stringify;

let n = 0;
async function turn(text, reply, { chunk = 0, env = {} } = {}) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try {
    globalThis.__logosCalls = [];
    globalThis.__logosPrompts = [];
    globalThis.__logosReply = reply;
    globalThis.__logosScript = [];
    if (chunk) globalThis.__logosChunk = chunk;
    else delete globalThis.__logosChunk;
    const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ surface: 'logos5', sessionId: `conv_stream_${++n}`, messages: [{ role: 'user', content: text }] }) }));
    const received = await r.text().catch(() => '');
    await new Promise((d) => setTimeout(d, 30));
    return { status: r.status, received, headers: r.headers };
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    delete globalThis.__logosChunk;
  }
}

const EMAIL = 'Write me a short email to my landlord asking to fix the heater.';
const CASES = [
  ['a quoted draft ending "Let me know if you have any questions."', EMAIL, "Here's a draft:\n\n> Hi Sam, the heater in unit 4 stopped working on Monday. Could you send someone this week? Let me know if you have any questions."],
  ['an unquoted email body after "Subject:"', EMAIL, 'Subject: Heater in unit 4\n\nHi Sam,\n\nThe heater in unit 4 stopped working on Monday. Could someone come this week? Let me know if you have any questions.'],
  ['an unquoted email body after "Here\'s a draft:"', EMAIL, "Here's a draft:\n\nHi Sam, the heater in unit 4 stopped working on Monday. Could someone come this week? Let me know if you have any questions."],
  ['three polite ways to end a work email, the third a closer', 'Give me three polite ways to end a work email.', '- Thanks in advance.\n- Best regards.\n- Let me know if you have any questions.'],
  // review: the closer as an item's SECOND sentence, on a turn requestsPhrasing does not read
  ['a third sign-off whose second sentence is a closer', 'How should I end an email to my professor?', '1. Thanks in advance.\n2. Best regards.\n3. Thank you for your time. Let me know if you have any questions.'],
];

console.log('\n=== what they asked for arrives verbatim, MR on and off, at every delta size ===');
for (const [label, mr] of [['MR on (default)', { LOGOS_MR: undefined }], ['LOGOS_MR=off', { LOGOS_MR: 'off' }]]) {
  for (const [name, text, reply] of CASES) {
    const got = [];
    for (const chunk of [1, 3, 6, 0]) got.push((await turn(text, reply, { chunk, env: mr })).received);
    ok(`${label}: ${name}`, got.every((g) => g === reply), J(got));
  }
  const hope = "Here's a draft:\n\n> Hi Sam, the heater in unit 4 stopped working on Monday. Let me know if you have any questions.\n\nHope this helps!";
  const kept = hope.slice(0, hope.indexOf('\n\nHope'));
  const got = [];
  for (const chunk of [1, 3, 6, 0]) got.push((await turn(EMAIL, hope, { chunk, env: mr })).received);
  ok(`${label}: the same draft then "Hope this helps!" — the quote whole, only the trailing line gone`, got.every((g) => g.trimEnd() === kept), J(got));
  const own = [];
  for (const chunk of [3, 0]) own.push((await turn('Does my fix work?', 'Yes, the loop now stops at n. Let me know if you want me to add tests.', { chunk, env: mr })).received);
  ok(`${label}: a trailing offer of Socria's own still never arrives`, own.every((g) => g.trim() === 'Yes, the loop now stops at n.'), J(own));
}

console.log('\n=== a streamed ```ui block is checked (deltas of 6) ===');
{
  const CHART = { type: 'chart', kind: 'bar', title: 'Monthly costs', x: ['Rent', 'Food', 'Transport'], series: [{ values: [1200, 400, 150] }], unit: '$', basis: 'given' };
  const ask = 'My monthly costs are rent 1200, food 400 and transport 150. Where does most of it go?';
  const pretty = '```ui\n' + JSON.stringify(CHART, null, 2) + '\n```';
  const reply = `Most of it is rent.\n\n${pretty}\n\nRent is about three quarters.`;
  const at6 = await turn(ask, reply, { chunk: 6 });
  const whole = await turn(ask, reply);
  ok('a pretty-printed chart of their numbers never arrives as JSON sentences', !/\n  "type"/.test(at6.received) && !/"values": \[/.test(at6.received), J(at6.received));
  ok('  what arrives at 6 is what arrives whole', at6.received === whole.received, J([at6.received, whole.received]));
  ok('  and the words around it arrive', /^Most of it is rent\./.test(at6.received) && /Rent is about three quarters\.$/.test(at6.received.trim()), J(at6.received));
  ok('  drawn, it is one canonical line', !/```ui/.test(at6.received) || /```ui\n\{"type":"chart",[^\n]*\}\n```/.test(at6.received), J(at6.received));
  const made = '```ui\n' + JSON.stringify({ ...CHART, series: [{ values: [111, 222, 333] }] }, null, 2) + '\n```';
  const r = await turn(ask, `Most of it is rent.\n\n${made}\n\nRent dominates.`, { chunk: 6 });
  ok('a chart whose figures are nobody\'s never reaches them, at 6', !/111|222|333/.test(r.received) && /Rent dominates\.$/.test(r.received.trim()), J(r.received));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
