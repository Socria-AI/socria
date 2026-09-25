// Files and images in a Core 4 conversation, through the real chat route.
//
// What has to hold:
//   - the model sees the file's text, labelled as whose it is;
//   - a turn can be ONLY an attachment;
//   - the state reader and the question count see the file's NAME, not its
//     forty pages, so one PDF cannot drown what the person actually said;
//   - the Mind Graph reads the file as source material, not as their beliefs;
//   - a long conversation keeps the newest files whole and shrinks the old;
//   - every other Core is untouched by any of it.
//
// Real route handler; the database, Clerk and the model are replaced (see
// test/helpers), and every call to the model is recorded.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-att');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const plugins = [{
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
}];
await build({
  entryPoints: { chat: join(root, 'app/api/chat/route.ts'), att: join(root, 'lib/chat-attachments.ts') },
  bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' },
  tsconfig: join(root, 'tsconfig.json'), plugins,
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', 'unpdf'],
  logLevel: 'error',
});

const quietLog = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('[socria') || first.startsWith('conversations')) return;
  orig(...a);
};
console.log = quietLog(console.log.bind(console));
console.error = quietLog(console.error.bind(console));
console.warn = quietLog(console.warn.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';

const chatRoute = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const att = await import(pathToFileURL(join(OUT, 'att.mjs')).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

async function settle() {
  let last = -1;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 25));
    const n = (globalThis.__calls ?? []).length + db.log.length;
    if (n === last) return;
    last = n;
  }
}

async function turn(messages, model = 'core-4') {
  globalThis.__calls = [];
  globalThis.__prompts = [];
  globalThis.__state = { taskKind: 'understand', latest: 'request' };
  globalThis.__reply = 'Here is what stands out in it.';
  globalThis.__extract = [{ nodes: [], edges: [] }];
  const req = new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, conversationId: 'files' }),
  });
  const r = await chatRoute.POST(req);
  const received = await r.text();
  await settle();
  const calls = globalThis.__calls;
  const sysOf = (c) => String(c.messages?.[0]?.content ?? '');
  return {
    status: r.status,
    received,
    reply: calls.find((c) => c.stream),
    state: calls.find((c) => sysOf(c).startsWith('You read a conversation')),
    extract: calls.find((c) => sysOf(c).startsWith('You build a semantic memory graph')),
  };
}

const lastUser = (call) => [...(call?.messages ?? [])].reverse().find((m) => m.role === 'user')?.content ?? '';

db.reset();
globalThis.__uid = 'u1';

const PAPER = 'The McCombs School of Business reports that 40% of its MBA graduates join startups. ' + 'Venture funding in Austin grew for five straight years. '.repeat(100);
const paper = { kind: 'note', name: 'mccombs-report.pdf', text: PAPER, origin: 'source' };
const photo = { kind: 'image', name: 'whiteboard.jpg', reading: 'A whiteboard: "UTA vs McCombs" with arrows to "funding" and "network".' };

console.log('=== a file and an image, with a question ===');
{
  const t = await turn([{ role: 'user', content: 'What does this say about funding?', attachments: [paper, photo] }]);
  const u = lastUser(t.reply);
  ok('the reply went out', t.status === 200 && t.received.length > 0, String(t.status));
  ok('the model sees the question first', u.startsWith('What does this say about funding?'), u.slice(0, 80));
  ok('then the whole file', u.includes(PAPER.trim()));
  ok('labelled as source material, not their position', /Attached file “mccombs-report\.pdf” — source material, NOT their own position/.test(u));
  ok('and the image as read', /Attached image “whiteboard\.jpg”, as read[^\n]*\nA whiteboard/.test(u), u.slice(-200));
  const st = lastUser(t.state);
  ok('the state reader sees the file NAMED', /\[attached: mccombs-report\.pdf \(\d+ words\), image whiteboard\.jpg\]/.test(st), st);
  ok('and not its body', !st.includes('Venture funding in Austin'));
  const mem = lastUser(t.extract);
  ok('the Mind Graph reads the file as source material', /File they attached “mccombs-report\.pdf” — source material, NOT their own position/.test(mem), mem.slice(0, 300));
  ok('only its opening', mem.length < PAPER.length + 1500 && mem.includes('…'));
}

console.log('\n=== a turn that is only an attachment ===');
{
  const t = await turn([{ role: 'user', content: '', attachments: [paper] }]);
  ok('is accepted', t.status === 200, String(t.status));
  ok('and the model gets the file', lastUser(t.reply).startsWith('[Attached file “mccombs-report.pdf”'));
  const empty = await turn([{ role: 'user', content: '   ' }]);
  ok('an empty turn with nothing attached is refused', empty.status === 400);
}

console.log('\n=== "can you?" over a file is a real question ===');
{
  const t = await turn([{ role: 'user', content: 'can you?', attachments: [paper] }]);
  ok('the model is asked, not the easter egg', !!t.reply, t.received);
}

console.log('\n=== the budget across a long conversation ===');
{
  const old = { kind: 'note', name: 'old.docx', text: 'OLD '.repeat(12_000), origin: 'mine' };
  const recent = { kind: 'note', name: 'recent.pdf', text: 'NEW '.repeat(10_000), origin: 'source' };
  const convo = [
    { role: 'user', content: 'first draft', attachments: [old] },
    { role: 'assistant', content: 'Read it.' },
    { role: 'user', content: 'and this', attachments: [recent] },
    { role: 'assistant', content: 'Read that too.' },
    { role: 'user', content: 'compare them' },
  ];
  const out = att.renderForModel(att.sanitizeChatMessages(convo), 70_000);
  ok('the newer file stays whole', out[2].content.includes('NEW '.repeat(10_000).trim()));
  ok('the older one shrinks to its opening once the budget is spent', out[0].content.length < 2_000 && /only its opening is shown/.test(out[0].content), String(out[0].content.length));
  ok('and says what to do if asked about the rest', /ask them to attach it again/.test(out[0].content));
  ok('their own writing is labelled as theirs', /“old\.docx” — their own writing/.test(out[0].content));
  const roomy = att.renderForModel(att.sanitizeChatMessages(convo));
  ok('with room, both are whole', roomy[0].content.includes('OLD '.repeat(12_000).trim()) && roomy[2].content.includes('NEW '.repeat(10_000).trim()));
  const onlyLast = att.renderForModel(att.sanitizeChatMessages([{ role: 'user', content: 'x', attachments: [old] }]), 10);
  ok('the turn being answered is always whole, whatever the budget', onlyLast[0].content.includes('OLD '.repeat(12_000).trim()));

  // THE BUDGET BOUNDED NEITHER END OF THE HISTORY.
  //
  // "The turn being answered gets its files whole" was unconditional, and the
  // server takes six attachments of up to 60k characters each — so one turn
  // could carry 360k characters, with 127k more of openings appended however
  // deep into deficit the budget already was. Measured at 488k characters
  // (~122k tokens) across a history, which overflows the fallback model's
  // window once the system prompt is added; and an overflow was then misread as
  // a rejected model id and sent again whole. Two ceilings now: the current
  // turn has its own, and an older file past the budget is named rather than
  // opened.
  const big = (n) => ({ kind: 'note', name: `f${n}.pdf`, text: 'x'.repeat(60_000), origin: 'source' });
  const six = [big(1), big(2), big(3), big(4), big(5), big(6)];
  const long = [];
  for (let t = 0; t < 15; t++) long.push({ role: 'assistant', content: 'ok' }, { role: 'user', content: `turn ${t}`, attachments: six });
  const huge = att.renderForModel(att.sanitizeChatMessages(long.slice(-30)));
  const total = huge.reduce((n, m) => n + m.content.length, 0);
  ok('the whole request is bounded', total <= att.TURN_ATTACHMENT_MAX + att.ATTACHMENT_BUDGET, String(total));
  ok('  the turn being answered keeps its own ceiling', huge[huge.length - 1].content.length <= att.TURN_ATTACHMENT_MAX);
  ok('  and it still gets whole files, not openings', huge[huge.length - 1].content.includes('x'.repeat(60_000)));
  ok('older files past the budget are named, not opened',
    huge.some((m) => /not shown here/.test(m.content)), 'no name-only block');
  ok('  and the person is told what to do about it',
    huge.some((m) => /not shown here[\s\S]*attach it again/.test(m.content)));
  ok('one ordinary paper on the current turn is untouched',
    att.renderForModel(att.sanitizeChatMessages([{ role: 'user', content: 'read this', attachments: [big(1)] }]))[0].content.includes('x'.repeat(60_000)));
}

console.log('\n=== what the server trusts ===');
{
  const s = att.sanitizeChatMessages([
    { role: 'user', content: 'hi', attachments: [{ kind: 'note', text: 'x'.repeat(70_000), name: 'big.txt' }, { kind: 'image', thumb: 'https://evil.example/pixel.png', reading: 'r' }, { kind: 'exe' }] },
    { role: 'assistant', content: 'yo', attachments: [paper] },
  ]);
  ok('a note is capped at the file ceiling and marked cut', s[0].attachments[0].text.length === 60_000 && s[0].attachments[0].truncated === true);
  ok('a remote image URL is dropped, never fetched', s[0].attachments[1].thumb === undefined);
  ok('unknown kinds are dropped', s[0].attachments.length === 2);
  ok('assistant turns carry no attachments', !s[1].attachments);
}

console.log('\n=== other Cores are untouched ===');
{
  const t = await turn([{ role: 'user', content: 'What does this say?', attachments: [paper] }], 'core-3');
  ok('Core 3.1 gets the words only, as before', lastUser(t.reply) === 'What does this say?', lastUser(t.reply).slice(0, 80));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
