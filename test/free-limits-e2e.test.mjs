// The free plan's day, end to end, through the real routes.
//
//   Core (every model but Logos)   4 new chats a day, 20 messages a day
//   Logos                          2 new lines of thinking a month, 10 messages a day
//
// The chat routes are the real ones, bundled from app/api, against the
// in-memory database — with the usage counter (bump_logos_usage) supplied, so
// a turn really is counted — a Clerk that knows these people, and a scripted
// model that records every call. What is proved is what a person meets: the
// boundary arrives where the table says, with its own sentence and the word
// the client raises Socria One for; a refused turn never reaches the model and
// costs nothing; going back to a chat never costs a chat; a retried first turn
// is not charged twice; a guest's turn is their message and never their chat;
// Socria One and signed-out visitors are not counted here at all.
//
//   fiona  free, Core
//   liam   free, Logos
//   gina   free, arrives with onboarding's first thought
//   olga   Socria One
//   alice  Socria One, shares a Core conversation
//   bob    free, joins it

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-free-limits');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');
const FAKE_CLERK = join(here, 'helpers', 'fake-clerk.mjs');
const FAKE_OPENAI = join(here, 'helpers', 'fake-openai.mjs');
const SHIM = join(here, 'helpers', 'server-only-shim.mjs');

const ROUTES = {
  chat: 'app/api/chat/route.ts',
  logos: 'app/api/logos/chat/route.ts',
  usage: 'app/api/logos/usage/route.ts',
  conversations: 'app/api/conversations/route.ts',
  share: 'app/api/share/route.ts',
  accept: 'app/api/share/accept/route.ts',
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(FAKE_CLERK).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(FAKE_OPENAI).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: SHIM }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
await Promise.all(Object.entries(ROUTES).map(([name, file]) => build({
  entryPoints: [join(root, file)],
  bundle: true, format: 'esm', platform: 'node',
  outfile: join(OUT, `${name}.mjs`),
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', '@vercel/functions'],
  logLevel: 'error',
})));

const quietLog = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('[') || first.startsWith('conversations') || first.startsWith('email') || first.startsWith('usage')) return;
  orig(...a);
};
console.log = quietLog(console.log.bind(console));
console.error = quietLog(console.error.bind(console));
console.warn = quietLog(console.warn.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.SHARE_SECRET = 'test-share-secret';
process.env.SOCRIA_ONE_USER_IDS = 'olga,alice';

const load = (n) => import(pathToFileURL(join(OUT, `${n}.mjs`)).href);
const R = Object.fromEntries(await Promise.all(Object.keys(ROUTES).map(async (k) => [k, await load(k)])));
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const as = (uid) => { globalThis.__uid = uid; };
const call = async (handler, method, url, body, params) => {
  const req = new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const r = await handler(req, params ? { params } : undefined);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
};

db.reset();
// The real function, in memory: insert or add, and answer the new total.
db.rpcs.bump_logos_usage = ({ p_user, p_scope, p_counter, p_by }) => {
  const rows = db.rows('logos_usage');
  let row = rows.find((x) => x.user_id === p_user && x.scope === p_scope && x.counter === p_counter);
  if (!row) {
    row = { id: `${p_user}|${p_scope}|${p_counter}`, user_id: p_user, scope: p_scope, counter: p_counter, n: 0 };
    rows.push(row);
  }
  row.n += p_by;
  return { data: row.n, error: null };
};
const count = (uid, counter) => {
  const day = `day:${new Date().toISOString().slice(0, 10)}`;
  const month = new Date().toISOString().slice(0, 7);
  const scope = counter === 'chats' ? month : day;
  return db.rows('logos_usage').find((x) => x.user_id === uid && x.scope === scope && x.counter === counter)?.n ?? 0;
};
const modelCalls = () => (globalThis.__calls ?? []).filter((p) => p.stream).length;

globalThis.__users = {
  fiona: { firstName: 'Fiona', emails: ['fiona@example.com'] },
  liam: { firstName: 'Liam', emails: ['liam@example.com'] },
  gina: { firstName: 'Gina', emails: ['gina@example.com'] },
  olga: { firstName: 'Olga', emails: ['olga@example.com'] },
  alice: { firstName: 'Alice', emails: ['alice@example.com'] },
  bob: { firstName: 'Bob', emails: ['bob@example.com'] },
};

// A Core turn: the history so far, then what they say now.
const turns = (n) => {
  const out = [];
  for (let i = 0; i < n - 1; i++) out.push({ role: 'user', content: `Earlier thought ${i}` }, { role: 'assistant', content: 'Noted.' });
  out.push({ role: 'user', content: 'And what about this?' });
  return out;
};
const core = (conversationId, userTurns = 1, model = 'core-3') =>
  call(R.chat.POST, 'POST', '/api/chat', { model, conversationId, messages: turns(userTurns) });
const logos = (sessionId, userTurns = 1, extra = {}) =>
  call(R.logos.POST, 'POST', '/api/logos/chat', { sessionId, messages: turns(userTurns), ...extra });

console.log('=== Core: four new chats a day ===');
as('fiona');
for (let i = 1; i <= 4; i++) {
  const r = await core(`c${i}`);
  ok(`new chat ${i} of 4 is answered`, r.status === 200, r.text.slice(0, 200));
}
ok('four chats counted', count('fiona', 'core-chats') === 4, String(count('fiona', 'core-chats')));
let before = modelCalls();
const fifth = await core('c5');
ok('a fifth new chat is refused', fifth.status === 402 && fifth.json?.upgrade === 'core-chats', fifth.text.slice(0, 300));
ok('  with the boundary’s own sentence: what was used, what stays open, and Socria One',
  /today’s 4 new chats/.test(fifth.json?.error ?? '') && /stay open/.test(fifth.json?.error ?? '') && /Socria One/.test(fifth.json?.error ?? ''), fifth.json?.error);
ok('  and the count it was refused at', fifth.json?.used === 4 && fifth.json?.limit === 4);
ok('  without the model ever being called', modelCalls() === before);
ok('  and without costing anything', count('fiona', 'core-chats') === 4 && count('fiona', 'core-messages') === 4);
const back = await core('c1', 2);
ok('going back to a chat already started is answered — no chat to spend', back.status === 200, back.text.slice(0, 200));
ok('  and costs a message, never a chat', count('fiona', 'core-chats') === 4 && count('fiona', 'core-messages') === 5);
const retry = await core('c2', 1);
ok('a first turn sent again (a retry) is answered', retry.status === 200);
ok('  and not charged as a second chat', count('fiona', 'core-chats') === 4);
const core4 = await core('c3', 2, 'core-4');
ok('Core 4 is counted too — every Core model shares the day', core4.status === 200 && count('fiona', 'core-messages') === 7, `${core4.status} ${count('fiona', 'core-messages')}`);

console.log('\n=== Core: twenty messages a day ===');
let n = count('fiona', 'core-messages');
let i = 3;
while (n < 20) {
  const r = await core('c1', i++);
  if (r.status !== 200) break;
  n = count('fiona', 'core-messages');
}
ok('twenty messages answered in all', n === 20, String(n));
before = modelCalls();
const over = await core('c1', i);
ok('the twenty-first is refused', over.status === 402 && over.json?.upgrade === 'core-messages', over.text.slice(0, 300));
ok('  saying the day, that nothing is lost, and Socria One',
  /today’s 20 messages/.test(over.json?.error ?? '') && /tomorrow/.test(over.json?.error ?? '') && /Upgrade to Socria One/.test(over.json?.error ?? ''), over.json?.error);
ok('  before the model is called', modelCalls() === before);
ok('  and costs nothing', count('fiona', 'core-messages') === 20);
ok('the messages run out before the chats are asked about', (await core('c9')).json?.upgrade === 'core-messages');
// tomorrow: yesterday's rows speak for nothing
for (const r of db.rows('logos_usage')) if (r.user_id === 'fiona' && r.scope.startsWith('day:')) r.scope = 'day:2000-01-01';
ok('a new day starts again', (await core('c10')).status === 200 && count('fiona', 'core-messages') === 1 && count('fiona', 'core-chats') === 1);

console.log('\n=== Socria One, and signed-out visitors, are not counted here ===');
as('olga');
let oneOk = true;
for (let k = 1; k <= 6; k++) oneOk = oneOk && (await core(`o${k}`)).status === 200;
for (let k = 0; k < 20; k++) oneOk = oneOk && (await core('o1', k + 2)).status === 200;
ok('Socria One: six new chats and twenty-six messages in a day', oneOk);
ok('  and nothing written down for it', count('olga', 'core-messages') === 0 && count('olga', 'core-chats') === 0);
as(null);
let anonOk = true;
for (let k = 0; k < 24; k++) anonOk = anonOk && (await core(null, k + 1)).status === 200;
ok('signed out, Core 3.1 is bounded by the rate limiter, not by an account it does not have', anonOk);
as(null);
ok('  and Core 4 still asks them to sign in', (await core('x', 1, 'core-4')).status === 401);

console.log('\n=== Logos: ten messages a day ===');
as('liam');
const first = await logos('s1');
ok('a line of thinking begins', first.status === 200, first.text.slice(0, 200));
ok('  costing one of the month’s two, and one of the day’s ten', count('liam', 'chats') === 1 && count('liam', 'messages') === 1);
for (let k = 2; k <= 10; k++) await logos('s1', k);
ok('ten messages answered', count('liam', 'messages') === 10, String(count('liam', 'messages')));
ok('  still one line of thinking', count('liam', 'chats') === 1);
before = modelCalls();
const eleventh = await logos('s1', 11);
ok('the eleventh is refused', eleventh.status === 402 && eleventh.json?.upgrade === 'messages', eleventh.text.slice(0, 300));
ok('  with the Logos day’s sentence', /today’s 10 Logos messages/.test(eleventh.json?.error ?? '') && /Upgrade to Socria One/.test(eleventh.json?.error ?? ''), eleventh.json?.error);
ok('  before the model is called, and at no cost', modelCalls() === before && count('liam', 'messages') === 10);
ok('a node’s own conversation is a message too', (await logos('s1', 1, { focus: { label: 'Rent', type: 'idea' } })).json?.upgrade === 'messages');
const panel = await call(R.usage.GET, 'GET', '/api/logos/usage?chat=s1');
ok('the allowance panel reads the same count the route refused at',
  panel.json?.counters?.messages?.used === 10 && panel.json?.counters?.messages?.limit === 10 && panel.json?.counters?.chats?.used === 1, JSON.stringify(panel.json?.counters ?? {}).slice(0, 300));
ok('  and Core’s day separately', panel.json?.counters?.['core-messages']?.used === 0 && panel.json?.counters?.['core-messages']?.limit === 20);
ok('Logos and Core keep separate days: Liam can still use Core', (await core('l1')).status === 200);

as('gina');
const gift = await logos('g1', 1, { firstThought: true });
ok('onboarding’s first thought is answered and marked as the gift', gift.status === 200 && gift.headers.get('X-Socria-First-Thought') === '1', gift.text.slice(0, 200));
ok('  costing neither a line of thinking nor a message', count('gina', 'chats') === 0 && count('gina', 'messages') === 0);
as('olga');
let logosOne = true;
for (let k = 1; k <= 12; k++) logosOne = logosOne && (await logos('os1', k)).status === 200;
ok('Socria One: twelve Logos messages in a day', logosOne && count('olga', 'messages') === 0);

console.log('\n=== a guest’s turn is their message, never their chat ===');
as('alice');
await call(R.conversations.PUT, 'PUT', '/api/conversations', { conversation: { id: 'c-shared', title: 'Our plan', messages: [{ role: 'user', content: 'Where do we start?' }, { role: 'assistant', content: 'With the question.' }], updatedAt: Date.now() } });
const link = await call(R.share.POST, 'POST', '/api/share', { type: 'conversation', id: 'c-shared', action: 'link', role: 'editor' });
ok('alice shares a chat by link', link.status === 200 && !!link.json?.link?.token, link.text.slice(0, 200));
as('bob');
const joined = await call(R.accept.POST, 'POST', '/api/share/accept', { token: link.json?.link?.token });
ok('bob, on the free plan, joins it — joining is free', joined.status === 200, joined.text.slice(0, 200));
const asked = await call(R.chat.POST, 'POST', '/api/chat', { model: 'core-4', conversationId: 'c-shared', messages: [{ role: 'user', content: 'What would you change?' }] });
ok('bob asks Socria in alice’s chat', asked.status === 200, asked.text.slice(0, 200));
ok('  one of his messages', count('bob', 'core-messages') === 1);
ok('  never one of his chats — the conversation is not his', count('bob', 'core-chats') === 0);
ok('  and nothing of alice’s spent', count('alice', 'core-messages') === 0 && count('alice', 'core-chats') === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
