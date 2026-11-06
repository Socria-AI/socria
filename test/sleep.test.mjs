// test/sleep.test.mjs — SLEEP MODE: A FREE ACCOUNT'S 30,000 TOKENS A WEEK, END TO END
// (lib/sleep.ts, lib/token-allowance.ts, lib/sleep-server.ts, lib/openai-usage.ts).
//
// Through the real routes, with only Clerk, the database and the model
// replaced — and the database's usage functions the very ones the dev
// stand-in serves (scripts/dev/usage-functions.mjs, the semantics of
// supabase/weekly-tokens.sql):
//   • every route that calls a model for the person refuses when the week is
//     spent — 429 with the week's state, and no model asked — and, awake,
//     holds and settles what it really cost against the account;
//   • only what reaches the person counts: the input read afresh (never what
//     the prompt cache served) plus what was written; a refused model on the
//     ladder, a second attempt after our own check, the memory kept, a
//     title, Core's state, guard and checker never do;
//   • the week resets on Monday 00:00 UTC; the count is the account's, so
//     every session shares it; requests at once at the edge never overspend;
//     a store that cannot be read pauses free requests (fail closed);
//   • Socria One is never counted or put to sleep; a guest is untouched;
//   • the screen: what is left, when it resets, in their own time, and no
//     word of a day.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { usageFunctions } from '../scripts/dev/usage-functions.mjs';
import * as T from './.tmp/docs-under-test.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-sleep');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(join(here, 'helpers', 'fake-supabase.mjs')).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai-logos.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
const ENTRIES = {
  chat: 'app/api/logos/chat/route.ts',
  map: 'app/api/logos/map/route.ts',
  usage: 'app/api/logos/usage/route.ts',
  explore: 'app/api/logos/explore/route.ts',
  read: 'app/api/logos/read/route.ts',
  write: 'app/api/logos/write/route.ts',
  easy: 'app/api/logos/easy/route.ts',
  experience: 'app/api/logos/experience/route.ts',
  synth: 'app/api/logos/synthesize/route.ts',
  organize: 'app/api/logos/organize/route.ts',
  practice: 'app/api/logos/practice/route.ts',
  page: 'app/api/docs/page/route.ts',
  project: 'app/api/projects/[id]/synthesize/route.ts',
  core: 'app/api/chat/route.ts',
  insight: 'app/api/generate-insight/route.ts',
  gsynth: 'app/api/generate-synthesis/route.ts',
  upload: 'app/api/mind/upload/route.ts',
  title: 'app/api/extract-memory/route.ts',
  understand: 'app/api/update-understanding/route.ts',
  sleep: 'lib/sleep.ts',
  pass: 'lib/guest-pass.ts',
  objects: 'lib/objects/index.ts',
  screen: 'components/logos5/SleepMode.tsx',
};
await Promise.all(
  Object.entries(ENTRIES).map(([out, entry]) =>
    build({
      entryPoints: [join(root, entry)],
      bundle: true,
      format: 'esm',
      platform: 'node',
      jsx: 'automatic',
      outfile: join(OUT, `${out}.mjs`),
      tsconfig: join(root, 'tsconfig.json'),
      plugins: [swap],
      loader: { '.css': 'empty' },
      external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', 'react', 'react-dom', '@vercel/functions', 'unpdf'],
      logLevel: 'error',
    })
  )
);
// the routes say a great deal in the log; the suite's own lines are the ones worth reading
for (const k of ['info', 'warn', 'error']) console[k] = () => {};
const say = console.log.bind(console);
console.log = (...a) => (typeof a[0] === 'string' && a[0].startsWith('[') ? undefined : say(...a));
process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.USAGE_STORE_MEMO_MS = '0';
// a short wait for the person's other calls, so the busy case below is quick
process.env.SOCRIA_TOKEN_WAIT_MS = '400';

const { db } = await import(pathToFileURL(join(here, 'helpers', 'fake-supabase.mjs')).href);
const load = (n) => import(pathToFileURL(join(OUT, `${n}.mjs`)).href);
const R = Object.fromEntries(await Promise.all(Object.keys(ENTRIES).map(async (k) => [k, await load(k)])));
const S = R.sleep;
const UI = R.screen;
const { NextRequest } = await import('next/server.js');

let pass = 0;
let fail = 0;
const ok = (name, cond, info) => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && info !== undefined ? `  — ${typeof info === 'string' ? info.slice(0, 400) : JSON.stringify(info).slice(0, 400)}` : ''}`);
};

// every call reports 1,000 read (400 of it from the prompt cache) and 100 written: 700 counted
const USAGE = { prompt_tokens: 1_000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 400 } };
const EACH = 700;
const week = (at = Date.now()) => S.weekKey(at);
const tokensOf = (user, at = Date.now()) => db.rows('logos_usage').find((r) => r.user_id === user && r.scope === week(at) && r.counter === 'tokens')?.n ?? 0;
const holdsOf = (user) => db.rows('logos_usage').filter((r) => r.user_id === user && String(r.scope).startsWith('tokhold:')).length;
const setTokens = (user, n, at = Date.now()) => {
  const rows = db.rows('logos_usage');
  const r = rows.find((x) => x.user_id === user && x.scope === week(at) && x.counter === 'tokens');
  if (r) r.n = n;
  else rows.push({ id: `${user}|${week(at)}|tokens`, user_id: user, scope: week(at), counter: 'tokens', n, updated_at: at });
};
const wire = () => {
  const fns = usageFunctions(db.rows('logos_usage'));
  for (const [name, fn] of Object.entries(fns)) db.rpcs[name] = (args) => ({ data: fn(args), error: null });
};
const fresh = () => {
  db.reset();
  wire();
  globalThis.__logosScript = [];
  globalThis.__logosRefuse = [];
  globalThis.__logosUsage = USAGE;
  globalThis.__logosReply = 'Look at the frame and the chain first.';
};
/** Wait until nothing has called the model for a moment, and every settle has landed. */
const settle = async () => {
  let n = -1;
  while (n !== (globalThis.__logosCalls ?? []).length) {
    n = (globalThis.__logosCalls ?? []).length;
    await new Promise((r) => setTimeout(r, 80));
  }
};

async function call(name, url, body, opts = {}) {
  globalThis.__uid = opts.as === undefined ? globalThis.__uid : opts.as;
  globalThis.__logosCalls = [];
  if (opts.script) globalThis.__logosScript = [...opts.script];
  const req = new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(opts.cookie ? { cookie: opts.cookie } : {}) }, body: JSON.stringify(body) });
  const r = await R[name].POST(req, opts.ctx);
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  await settle();
  return { status: r.status, text, json, calls: [...(globalThis.__logosCalls ?? [])], retry: r.headers.get('retry-after') };
}
async function usageOf(user) {
  globalThis.__uid = user;
  const r = await R.usage.GET(new NextRequest('http://localhost/api/logos/usage'));
  return await r.json();
}

const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const PNG = `data:image/png;base64,${Buffer.from('a small picture').toString('base64')}`;
const { doc } = await T.readDocument('notes.md', Buffer.from('# Q3 report\n\nRevenue rose 12% on the quarter.\n\nCosts held flat.'));
const block = doc.blocks?.[0]?.id ?? 'p1.1';
const topic = { id: 't1', title: 'Revenue', kind: 'concept', summary: 'What revenue did', quotes: [{ doc: doc.id, block, page: 1, text: 'Revenue rose 12% on the quarter.' }], blocks: [{ doc: doc.id, block }] };
const { create, apply, currentOf, EMPTY_SPACE } = R.objects;
let ut = create(EMPTY_SPACE, 'untangle', { dump: 'pay rent; call mom; finish essay' }, { origin: 'person', name: 'UT0' }).space;
ut = apply(ut, ut.objs[0].id, 'separate', {}, { by: 'person' }).space;
const sorted = currentOf(ut.objs[0]);
const project = (user) => {
  const now = Date.now();
  db.rows('mind_projects').push({ user_id: user, id: 'proj1', node_id: 'n_proj1', name: 'Bikes', description: '', instructions: '', archived: false, created_at: now, updated_at: now });
  db.rows('conversations').push({ id: `c-${user}`, user_id: user, project_id: 'proj1', title: 'Frames', kind: 'logos', map: null, updated_at: now, created_at: now });
};
const MAP = { nodes: [{ id: 'n1', label: 'Frame first', type: 'idea' }, { id: 'n2', label: 'Chain wear', type: 'idea' }], edges: [] };

/**
 * Every route that calls a model for the person: a request that reaches the model, the script its
 * buffered calls answer with, and how many of its calls are ours rather than theirs.
 */
const ROUTES = [
  { name: 'chat', label: 'the reply', url: '/api/logos/chat', body: (u) => ({ messages: [U('What should I look for in a used bike?')], sessionId: `s-${u}` }) },
  { name: 'map', label: 'the Logic Map', url: '/api/logos/map', body: (u) => ({ messages: [U('Frame first?')], map: { nodes: [], edges: [] }, sessionId: `m-${u}` }), script: [{ nodes: [{ id: 'n1', label: 'Frame first', type: 'idea' }], edges: [] }] },
  { name: 'explore', label: 'Explore on a node', url: '/api/logos/explore', body: (u) => ({ label: 'Frame first', type: 'idea', mode: 'challenge', messages: [U('Frame first?')], sessionId: `e-${u}` }), script: [{ framing: 'A frame is the part you cannot replace cheaply.', points: ['Check the welds.'], question: 'What would you pay to fix?' }] },
  { name: 'read', label: 'reading an image', url: '/api/logos/read', body: () => ({ image: PNG }), script: ['A whiteboard with three arrows.'] },
  { name: 'write', label: 'a write assist', url: '/api/logos/write', body: () => ({ op: 'explain', selection: 'Rent control is good because it keeps people in their homes.' }), script: [{ body: 'It says rent control keeps people housed.' }] },
  { name: 'easy', label: 'an easy view (the photo read once more is ours)', url: '/api/logos/easy', body: () => ({ image: PNG }), script: ['not json', 'still not json'], ours: 1 },
  { name: 'experience', label: 'an experience (asked once more is ours)', url: '/api/logos/experience', body: () => ({ kind: 'untangle', action: 'sort', state: sorted }), script: ['not json', 'not json'], ours: 1 },
  { name: 'synth', label: 'a synthesis of the map', url: '/api/logos/synthesize', body: () => ({ map: MAP, messages: [] }), script: [{ title: 'Where it stands' }] },
  { name: 'organize', label: 'sorting files', url: '/api/logos/organize', body: () => ({ docs: [doc] }), script: [{ topics: [] }] },
  { name: 'practice', label: 'practice', url: '/api/logos/practice', body: () => ({ topic, docs: [doc] }), script: [{ events: [] }] },
  { name: 'page', label: 'a page read into a document', url: '/api/docs/page', body: () => ({ image: PNG, kind: 'figure' }), script: [{ kind: 'figure', caption: 'A chart' }] },
  { name: 'project', label: 'a Project’s synthesis', url: '/api/projects/proj1/synthesize', body: () => ({}), ctx: { params: { id: 'proj1' } }, script: [{ headline: 'Bikes' }], setup: project },
  { name: 'core', label: 'a Core conversation (its state, guard and checker are ours)', url: '/api/chat', body: (u) => ({ model: 'core-4', conversationId: `c4-${u}`, messages: [U('What should I look for in a used bike?')] }), core: true },
  { name: 'insight', label: 'an insight', url: '/api/generate-insight', body: () => ({ messages: [U('I keep putting this off.'), A('What is in the way?')] }), script: [{ text: 'You are waiting for certainty.', headerLabel: 'A pattern' }] },
  { name: 'gsynth', label: 'a Core synthesis', url: '/api/generate-synthesis', body: () => ({ messages: [U('I keep putting this off.'), A('What is in the way?')] }), script: [{ summary: 'Waiting for certainty.' }] },
  { name: 'upload', label: 'a file read into Memory', url: '/api/mind/upload', body: () => ({ name: 'notes.txt', text: 'I ride to work. My bike is a 2015 steel frame.' }), script: [{ nodes: [], edges: [] }] },
];

console.log('\n=== asleep: every route that calls a model refuses before it does ===');
{
  for (const r of ROUTES) {
    fresh();
    const user = `asleep_${r.name}`;
    r.setup?.(user);
    setTokens(user, 30_000);
    const out = await call(r.name, r.url, r.body(user), { as: user, ctx: r.ctx, script: r.script });
    ok(`${r.label}: 429, Sleep Mode, with the week’s state — and no model asked`, out.status === 429 && out.json?.sleep === true && out.json.used === 30_000 && out.json.limit === 30_000 && out.json.resetAt === S.resetAt(Date.now()) && Number(out.retry) > 0 && out.calls.length === 0, { status: out.status, calls: out.calls.length, body: out.text.slice(0, 200) });
  }
  fresh();
  setTokens('asleep_trace', 31_000);
  const trace = await call('explore', '/api/logos/explore', { label: 'Frame first', type: 'idea', mode: 'trace', messages: [U('Frame first?')] }, { as: 'asleep_trace' });
  ok('Trace too — no monthly count limits it, but it is an AI request, and it waits for Monday', trace.status === 429 && trace.json?.sleep === true && trace.calls.length === 0);
}

console.log('\n=== awake: each route holds, then settles what it cost, to the account that asked ===');
{
  for (const r of ROUTES) {
    fresh();
    const user = `awake_${r.name}`;
    r.setup?.(user);
    const out = await call(r.name, r.url, r.body(user), { as: user, ctx: r.ctx, script: r.script });
    const made = out.calls.length;
    // Core 4: only the reply (a streamed call) reaches the person; its state, guard and checker are ours
    const counted = r.core ? out.calls.filter((c) => c.stream).length : made - (r.ours ?? 0);
    ok(
      `${r.label}: ${counted} counted call${counted === 1 ? '' : 's'} of ${made} — ${counted * EACH} tokens, no hold left behind`,
      made > 0 && counted >= 1 && tokensOf(user) === counted * EACH && holdsOf(user) === 0,
      { status: out.status, made, counted, tokens: tokensOf(user), holds: holdsOf(user), body: out.text.slice(0, 160) }
    );
  }
}

console.log('\n=== the reply, counted: cache reads, retries and memory ===');
{
  fresh();
  const a = await call('chat', '/api/logos/chat', ROUTES[0].body('ann'), { as: 'ann' });
  ok('a free account’s turn is answered, and what it cost is the account’s: 1,000 read, 400 from the cache, 100 written = 700', a.status === 200 && /frame/.test(a.text) && tokensOf('ann') === 700, { status: a.status, tokens: tokensOf('ann') });
  const first = a.calls.find((c) => c.stream)?.model;
  globalThis.__logosRefuse = [first];
  const b = await call('chat', '/api/logos/chat', ROUTES[0].body('ann'), { as: 'ann' });
  ok('a model refused on the router’s ladder is not counted: only the attempt that answered (700 more)', b.status === 200 && b.calls.filter((c) => c.stream).length === 2 && tokensOf('ann') === 1_400 && holdsOf('ann') === 0, { calls: b.calls.map((c) => c.model), tokens: tokensOf('ann') });
  globalThis.__logosRefuse = [];
  globalThis.__logosScript = [{ nodes: [], edges: [] }];
  const c = await call('chat', '/api/logos/chat', { ...ROUTES[0].body('ann'), mind: true }, { as: 'ann' });
  const extraction = c.calls.filter((x) => !x.stream).length;
  ok('the memory kept after a turn is ours: the extractor ran, and only the reply was counted', c.status === 200 && extraction >= 1 && tokensOf('ann') === 2_100, { extraction, tokens: tokensOf('ann') });
  globalThis.__logosUsage = { prompt_tokens: 20_000, completion_tokens: 500 };
  await call('chat', '/api/logos/chat', ROUTES[0].body('ann'), { as: 'ann' });
  ok('nothing cached: all of the input counts (20,500)', tokensOf('ann') === 22_600, tokensOf('ann'));
}

console.log('\n=== the edge: the turn that crosses the limit is finished, then Socria rests ===');
{
  fresh();
  setTokens('bo', 29_800);
  globalThis.__logosUsage = { prompt_tokens: 2_000, completion_tokens: 300 };
  const a = await call('chat', '/api/logos/chat', ROUTES[0].body('bo'), { as: 'bo' });
  const asked = a.calls.find((c) => c.stream);
  ok('a turn begun with 200 left is answered — its reply capped to what is left, with a floor', a.status === 200 && (asked?.max_tokens ?? asked?.max_completion_tokens) === 300, asked?.max_tokens ?? asked?.max_completion_tokens);
  ok('  and recorded as it was: 2,300 — the week ends past its limit by that one turn', tokensOf('bo') === 32_100, tokensOf('bo'));
  const b = await call('chat', '/api/logos/chat', ROUTES[0].body('bo'), { as: 'bo' });
  ok('the next turn rests: refused, no model asked', b.status === 429 && b.json?.sleep === true && b.calls.length === 0);
  const u = await usageOf('bo');
  ok('the app reads the same state, on any device', u.sleep?.asleep === true && u.sleep.used === 32_100 && u.sleep.left === 0 && u.sleep.resetAt === S.resetAt(Date.now()) && u.sleep.weekStart === S.weekStart(Date.now()));
  ok('another free account is untouched by it', (await call('chat', '/api/logos/chat', ROUTES[0].body('cy'), { as: 'cy' })).status === 200 && tokensOf('cy') === 2_300);
}

console.log('\n=== requests at once at the edge: the last tokens go to one of them ===');
{
  fresh();
  setTokens('dee', 29_500);
  globalThis.__logosUsage = { prompt_tokens: 200, completion_tokens: 100 };
  globalThis.__uid = 'dee';
  const N = 12;
  const outs = await Promise.all(
    Array.from({ length: N }, () =>
      R.chat
        .POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ROUTES[0].body('dee')) }))
        .then(async (r) => ({ status: r.status, json: r.status === 200 ? null : await r.json().catch(() => null), text: r.status === 200 ? await r.text() : '' }))
    )
  );
  await settle();
  const answered = outs.filter((o) => o.status === 200).length;
  const refused = outs.filter((o) => o.status === 429 && (o.json?.sleep || o.json?.busy)).length;
  ok(`${N} turns at once with 500 left: every one answered or refused cleanly (429), none crashed`, answered + refused === N && answered >= 1, outs.map((o) => o.status));
  ok('  held one at a time: what was answered is what was settled, 300 each — never past what the holds allowed', tokensOf('dee') === 29_500 + answered * 300 && holdsOf('dee') === 0, { answered, tokens: tokensOf('dee') });
  ok('  so the overspend is at most the last reply that started with tokens left, never all of them', tokensOf('dee') - 30_000 < 300 && answered < N, { answered, tokens: tokensOf('dee') });
}

console.log('\n=== one balance for the account: a refresh, a second tab, a second device ===');
{
  fresh();
  await call('chat', '/api/logos/chat', ROUTES[0].body('eve'), { as: 'eve' });
  // a second tab or device: another request, another session id, the same account
  await call('chat', '/api/logos/chat', { messages: [U('And the tyres?')], sessionId: 'eve-phone' }, { as: 'eve' });
  const u1 = await usageOf('eve');
  ok('two sessions, one count: the account’s, not the browser’s', tokensOf('eve') === 1_400 && u1.sleep?.used === 1_400);
  ok('  there is one row for the week, keyed by the account id — none per device or session', db.rows('logos_usage').filter((r) => r.user_id === 'eve' && r.counter === 'tokens' && !String(r.scope).startsWith('tokhold:')).length === 1);
  // a refresh mid-turn: the stream is dropped before its end — what was read and written is still counted
  globalThis.__logosChunk = 4;
  globalThis.__logosReply = 'word '.repeat(80);
  globalThis.__uid = 'eve';
  const r = await R.chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ROUTES[0].body('eve')) }));
  const reader = r.body.getReader();
  await reader.read();
  await reader.cancel();
  await settle();
  await new Promise((done) => setTimeout(done, 100));
  globalThis.__logosChunk = 0;
  ok('a reply cut off by a refresh is still counted — read and written so far, never free', tokensOf('eve') > 1_400 && holdsOf('eve') === 0, { tokens: tokensOf('eve'), holds: holdsOf('eve') });
}

console.log('\n=== resets, and subscriptions changing ===');
{
  fresh();
  const lastWeek = Date.now() - 7 * 86_400_000;
  setTokens('fay', 90_000, lastWeek);
  ok('last week’s spend is last week’s: a new week starts awake', (await call('chat', '/api/logos/chat', ROUTES[0].body('fay'), { as: 'fay' })).status === 200 && tokensOf('fay') === 700);
  ok('  the week the app reads resets on Monday 00:00 UTC', (await usageOf('fay')).sleep?.resetAt === S.resetAt(Date.now()) && new Date(S.resetAt(Date.now())).getUTCDay() === 1);

  setTokens('gus', 50_000);
  ok('asleep on the free plan', (await call('chat', '/api/logos/chat', ROUTES[0].body('gus'), { as: 'gus' })).status === 429);
  process.env.SOCRIA_ONE_USER_IDS = 'gus';
  const one = await call('chat', '/api/logos/chat', ROUTES[0].body('gus'), { as: 'gus' });
  ok('subscribing wakes Socria at once — Socria One has no weekly allowance', one.status === 200);
  ok('  and a member is never counted, on any route', tokensOf('gus') === 50_000 && holdsOf('gus') === 0, tokensOf('gus'));
  for (const r of ROUTES) {
    r.setup?.('gus');
    const out = await call(r.name, r.url, r.body('gus'), { as: 'gus', ctx: r.ctx, script: r.script });
    if (out.status === 429 || tokensOf('gus') !== 50_000) ok(`  ${r.label}: Socria One is never blocked or counted`, false, { status: out.status, tokens: tokensOf('gus') });
  }
  ok('  (every route, as a member: never refused, never a token held or counted)', tokensOf('gus') === 50_000 && holdsOf('gus') === 0);
  ok('  the app shows a member no allowance at all', (await usageOf('gus')).sleep === null);
  process.env.SOCRIA_ONE_USER_IDS = '';
  ok('a subscription that ends mid-week: the week’s free count applies again', (await call('chat', '/api/logos/chat', ROUTES[0].body('gus'), { as: 'gus' })).status === 429);

  process.env.SOCRIA_FREE_WEEKLY_TOKENS = '60000';
  ok('a higher limit, set in the environment, wakes it with no redeploy', (await call('chat', '/api/logos/chat', ROUTES[0].body('gus'), { as: 'gus' })).status === 200);
  delete process.env.SOCRIA_FREE_WEEKLY_TOKENS;
  process.env.SOCRIA_SLEEP = 'off';
  setTokens('gus', 999_999);
  ok('SOCRIA_SLEEP=off switches Sleep Mode off', (await call('chat', '/api/logos/chat', ROUTES[0].body('gus'), { as: 'gus' })).status === 200);
  delete process.env.SOCRIA_SLEEP;
}

console.log('\n=== guests are untouched — and no request is ever counted to someone else ===');
{
  fresh();
  // a free account's turn first: its account must stay with its own request (lib/token-meter.ts withMeter)
  await call('chat', '/api/logos/chat', ROUTES[0].body('nia'), { as: 'nia' });
  process.env.CLERK_SECRET_KEY = 'sk_test_guest';
  const claim = R.pass.claimGuest(undefined, 'lg_guest1', Date.now());
  const cookie = `${R.pass.GUEST_COOKIE}=${claim.pass}`;
  const g = await call('chat', '/api/logos/chat', { surface: 'logos5', messages: [U('What is opportunity cost?')], sessionId: 'lg_guest1' }, { as: null, cookie });
  ok('a guest’s turn, straight after, is answered on their own pass — nothing held or counted for anyone, the last account included', g.status === 200 && tokensOf('nia') === 700 && db.rows('logos_usage').filter((r) => r.counter === 'tokens').length === 1, { status: g.status, rows: db.rows('logos_usage') });
  ok('  and the app shows a guest no allowance', (await usageOf(null)).sleep === null);
  delete process.env.CLERK_SECRET_KEY;
}

console.log('\n=== our upkeep: never counted, and never asked of a model while resting ===');
{
  fresh();
  const t = await call('title', '/api/extract-memory', { messages: [U('Help me study for my bio test'), A('Which unit?')], titleOnly: true, titleStyle: 'topic' }, { as: 'hal', script: [{ suggestedTitle: 'Biology – Exam Review' }] });
  ok('a conversation’s title is ours: the model named it, and nothing was counted', t.status === 200 && t.calls.length === 1 && tokensOf('hal') === 0, { calls: t.calls.length, tokens: tokensOf('hal') });
  const u = await call('understand', '/api/update-understanding', { messages: [U('I keep putting this off because I want it perfect.'), A('What would good enough look like?')], surface: 'logos', conversationId: 'c-hal' }, { as: 'hal', script: [{ narrative: 'Wants it perfect.' }] });
  ok('the understanding kept across conversations is ours: not counted', u.status === 200 && tokensOf('hal') === 0, { status: u.status, calls: u.calls.length });
  setTokens('ivy', 30_000);
  const t2 = await call('title', '/api/extract-memory', { messages: [U('Help me study'), A('Which unit?')], titleOnly: true, titleStyle: 'topic' }, { as: 'ivy' });
  const u2 = await call('understand', '/api/update-understanding', { messages: [U('Something'), A('Say more.')], surface: 'logos' }, { as: 'ivy' });
  ok('while resting, neither asks a model: the title the page gave stands, the memory stays as it was', t2.status === 200 && t2.json?.resting === true && u2.status === 200 && u2.json?.resting === true && t2.calls.length + u2.calls.length === 0);
}

console.log('\n=== nobody is given free use by a fault: the store unreachable pauses free requests ===');
{
  fresh();
  db.absent.add('logos_usage');
  const down = await call('chat', '/api/logos/chat', ROUTES[0].body('jo'), { as: 'jo' });
  ok('a free turn is paused, not let through uncounted: 503, said plainly, no model asked', down.status === 503 && down.json?.unavailable === true && /can’t be checked right now/.test(down.json?.error ?? '') && down.calls.length === 0, down.text.slice(0, 200));
  const map = await call('map', '/api/logos/map', ROUTES[1].body('jo'), { as: 'jo', script: ROUTES[1].script });
  ok('  the map the same way', map.status === 503 && map.calls.length === 0);
  const u = await usageOf('jo');
  ok('  and the app is not told a number nobody counted', !('sleep' in u));
  process.env.SOCRIA_ONE_USER_IDS = 'kim';
  ok('Socria One is never paused by it', (await call('chat', '/api/logos/chat', ROUTES[0].body('kim'), { as: 'kim' })).status === 200);
  process.env.SOCRIA_ONE_USER_IDS = '';
  db.absent.delete('logos_usage');
  // the store answering, but not with the function's answer: nothing can be trusted to be held
  db.rpcs.reserve_logos_tokens = () => ({ data: null, error: null });
  const odd = await call('chat', '/api/logos/chat', ROUTES[0].body('lu'), { as: 'lu' });
  ok('an answer that is not the function’s pauses the turn too (503), and asks no model', odd.status === 503 && odd.calls.filter((c) => c.stream).length === 0, odd.status);
}

console.log('\n=== the older counter, before supabase/weekly-tokens.sql is run ===');
{
  fresh();
  const missing = () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.reserve_logos_tokens' } });
  db.rpcs.reserve_logos_tokens = missing;
  db.rpcs.settle_logos_tokens = missing;
  const a = await call('chat', '/api/logos/chat', ROUTES[0].body('mo'), { as: 'mo' });
  ok('the week is still held and settled — through consume_logos_usage, refunded to what it cost', a.status === 200 && tokensOf('mo') === 700, { status: a.status, tokens: tokensOf('mo') });
  setTokens('mo', 30_000);
  ok('  and as strict at the limit', (await call('chat', '/api/logos/chat', ROUTES[0].body('mo'), { as: 'mo' })).status === 429);
}

console.log('\n=== the screen (components/logos5/SleepMode.tsx) ===');
{
  const now = Date.now();
  const st = S.sleepState(30_400, 30_000, now);
  const html = renderToStaticMarkup(h(UI.SleepScreen, { sleep: st, open: true, onClose() {}, onUpgrade() {}, onWake() {}, timeZone: 'America/Chicago' }));
  ok('a dialog, named and described', /role="dialog"/.test(html) && /aria-modal="true"/.test(html) && /aria-labelledby="sl-t"/.test(html));
  ok('"Socria is resting": this week’s tokens, and what still works', /Socria is resting/.test(html) && /You’ve used this week’s 30,000 free tokens/.test(html) && /Everything you’ve made is still here — open any conversation, move your Logic Maps, edit your writing, keep drafting/.test(html), html);
  const text = (x) => x.replace(/<[^>]+>/g, '').replace(/\s/g, ' ');
  ok('when it wakes: a countdown, Monday 00:00 UTC, and their own time', /Wakes in/.test(html) && /class="sl-when-v">\d/.test(html) && /Monday 00:00 UTC · Sunday \d{1,2}:00 [AP]M your time/.test(text(html)), text(html));
  ok('  each kept whole on a narrow screen', /<span class="sl-keep">Monday 00:00 UTC<\/span> · <span class="sl-keep">Sunday \d{1,2}:00\s[AP]M your time<\/span>/.test(html), html);
  ok('Socria One, offered beside "Keep exploring" — never in place of it', /Keep exploring/.test(html) && /Stay awake with Socria One/.test(html) && /Socria One has no weekly limit/.test(html));
  const member = renderToStaticMarkup(h(UI.SleepScreen, { sleep: st, open: true, onClose() {}, onWake() {}, timeZone: 'UTC' }));
  ok('  not offered where there is no upgrade to make; no local time where theirs is UTC', !/Socria One/.test(member) && !/your time/.test(member) && /Monday 00:00 UTC/.test(member));
  ok('closed, or awake, it draws nothing', renderToStaticMarkup(h(UI.SleepScreen, { sleep: st, open: false, onClose() {}, onWake() {} })) === '' && renderToStaticMarkup(h(UI.SleepScreen, { sleep: S.sleepState(10, 30_000, now), open: true, onClose() {}, onWake() {} })) === '');
  const bar = renderToStaticMarkup(h(UI.SleepBar, { sleep: st, onOpen() {}, onWake() {}, timeZone: 'UTC' }));
  ok('the bar over the box: resting until Monday 00:00 UTC, in how long — drafting still open', /class="sl-bar"/.test(bar) && /Resting until Monday 00:00 UTC/.test(bar) && /aria-label="Socria is resting until Monday 00:00 UTC, in [^"]+\. You can keep drafting; sending waits\."/.test(bar), bar);

  const awake = S.sleepState(17_600, 30_000, now);
  const ring = renderToStaticMarkup(h(UI.SleepRing, { sleep: awake, onOpen() {}, onWake() {}, timeZone: 'UTC' }));
  ok('the ring: an outline, filled as far as the week is spent (59%)', /class="sl-ring"/.test(ring) && /class="sl-ring-used"/.test(ring) && !/sl-ring-full/.test(ring) && /stroke-dasharray="23\.9\d* 40\.84\d*"/.test(ring), ring);
  ok('  and says what is left and when it resets, in one line', /aria-label="12,400 of 30,000 left this week · resets Monday 00:00 UTC \(in [^)]+\)\."/.test(ring), ring);
  const chicago = renderToStaticMarkup(h(UI.SleepRing, { sleep: awake, onOpen() {}, onWake() {}, timeZone: 'America/Chicago' }));
  ok('  with their own time where they have one', /— Sunday \d{1,2}:00 [AP]M your time\./.test(chicago.replace(/\s/g, ' ')), chicago);
  ok('nearly spent: marked as such', /sl-ring is-low/.test(renderToStaticMarkup(h(UI.SleepRing, { sleep: S.sleepState(25_000, 30_000, now), onOpen() {}, onWake() {} }))));
  const asleep = renderToStaticMarkup(h(UI.SleepRing, { sleep: st, onOpen() {}, onWake() {}, timeZone: 'UTC' }));
  ok('resting: the circle filled solid, and it says when Socria wakes', /sl-ring is-asleep/.test(asleep) && /class="sl-ring-full"/.test(asleep) && /aria-label="Socria is resting\. This week’s 30,000 tokens are used; wakes Monday 00:00 UTC, in /.test(asleep), asleep);
  ok('nothing for Socria One or a guest (no state)', renderToStaticMarkup(h(UI.SleepRing, { sleep: null, onOpen() {}, onWake() {} })) === '');
  const words = [html, member, bar, ring, chicago, asleep].join(' ').replace(/<[^>]+>/g, ' ');
  ok('no word of a day anywhere on it: no “today”, “tomorrow”, “midnight”, “daily”, “a day”', !/\b(today|tomorrow|tonight|midnight|daily)\b|\ba day\b|\bday['’]s\b|\bper day\b/i.test(words), words.match(/\b(today|tomorrow|tonight|midnight|daily)\b|\ba day\b|\bday['’]s\b/i)?.[0]);
  const source = readFileSync(join(root, 'components', 'logos5', 'SleepMode.tsx'), 'utf8') + readFileSync(join(root, 'lib', 'sleep.ts'), 'utf8');
  ok('  nor in the words the screen and the routes are written with', !/\b(today|tomorrow|tonight|midnight)\b|today’s|no daily limit|thinking time/i.test(source.replace(/\/\/.*$/gm, '')));
  const app = readFileSync(join(root, 'components', 'LogosApp.tsx'), 'utf8');
  ok('in the box’s tools, beside Voice', /meter=\{\s*<SleepRing/.test(app) && /\{meter\}\s*\{voiceButton\}/.test(readFileSync(join(root, 'components', 'LogosComposer.tsx'), 'utf8')));
  ok('Socria One opened from the screen says why, in words — not the word "sleep"', /askOne\(SLEEP_ONE\)/.test(app) && !/askOne\('sleep'\)/.test(app) && /const SLEEP_ONE = 'Socria One has no weekly token allowance/.test(app));
  ok('the screen is said when Socria falls asleep, not again for every request refused while it rests', /const already = !!sleepRef\.current\?\.asleep && Date\.now\(\) < sleepRef\.current\.resetAt;\s*setSleep\(st\);\s*if \(!already\) setSleepOpen\(true\);/.test(app));
}

console.log('\n=== wired everywhere a model is called for the person ===');
{
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f === 'route.ts' ? [join(d, f)] : []));
  const all = walk(join(root, 'app', 'api'));
  const calls = all.filter((f) => /tracked\(new OpenAI|askJson\(|ingestTextFile\(|modelClient\(|chooseModel\(|chooseAuxModel\(/.test(readFileSync(f, 'utf8')));
  const GATE = /const sleep = await sleepGate\(req, userId[^)]*\);\s*if \(sleep\.refuse\) return sleep\.refuse;\s*if \(sleep\.meter\) meterFor\(sleep\.meter\);/;
  const REST = /if \(await restingNow\(req, userId\)\)/;
  // not made for a person: the upstream health check; Socria One only, refused to a free account before any model: transcription
  const exempt = ['health/upstream', 'transcribe'];
  const loose = calls.filter((f) => !exempt.some((x) => f.includes(x)) && !GATE.test(readFileSync(f, 'utf8')) && !REST.test(readFileSync(f, 'utf8')));
  ok(`every route that calls a model for the person checks the week first (${calls.length})`, calls.length >= 18 && loose.length === 0, loose.map((f) => f.replace(root, '')));
  const upkeep = calls.filter((f) => REST.test(readFileSync(f, 'utf8'))).map((f) => f.replace(root, ''));
  ok('  the two that only do our upkeep rest while the account does, and are never metered', upkeep.length === 2 && upkeep.every((f) => /extract-memory|update-understanding/.test(f)) && upkeep.every((f) => !/meterFor\(/.test(readFileSync(join(root, f), 'utf8'))), upkeep);
  const unwrapped = all.filter((f) => /meterFor\(/.test(readFileSync(f, 'utf8')) && !/export const POST = withMeter\(async function POST\(/.test(readFileSync(f, 'utf8')));
  ok('  every metered route runs in a context of its own (withMeter), so its account can never reach another request', unwrapped.length === 0, unwrapped.map((f) => f.replace(root, '')));
  const answered = calls.filter((f) => GATE.test(readFileSync(f, 'utf8')) && !/sleepAnswer\(e\)/.test(readFileSync(f, 'utf8')));
  ok('  and every metered route answers a call refused mid-request as Sleep Mode, never as a failure', answered.length === 0, answered.map((f) => f.replace(root, '')));
  const read = (f) => readFileSync(join(root, f), 'utf8');
  ok('every model call is held and settled where it is made (lib/openai-usage.ts)', /await metering\.begin\(\{ route, input, output: outputOf\(asked\)/.test(read('lib/openai-usage.ts')) && /onMetering\(\{/.test(read('lib/sleep-server.ts')));
  ok(
    'our own second attempts run uncounted: the reply’s accuracy regeneration, MR’s deliberation, the display repair, an easy view read again, an experience asked again',
    /const r = await uncounted\(\(\) =>\s*openai\.chat\.completions\.create\(\{\s*model: served,\s*messages: turnMessages\(note\)/.test(read('app/api/logos/chat/route.ts')) &&
      /uncounted\(\(\) => mrOpenai\.chat\.completions\.create/.test(read('app/api/logos/chat/route.ts')) &&
      /await uncounted\(\(\) => firstAccepted\(\s*ladder\.slice[\s\S]{0,300}stepped\('display repair'\)/.test(read('app/api/logos/map/route.ts')) &&
      /await uncounted\(\(\) => firstAccepted\(/.test(read('app/api/logos/easy/route.ts')) &&
      /await uncounted\(\(\) =>\s*firstAccepted\(/.test(read('app/api/logos/experience/route.ts'))
  );
  ok('  Core’s state, guard, checker and retry are ours at the seam; the memory after a turn is ours in the pipeline', /const OURS: ReadonlySet<ModelRole> = new Set<ModelRole>\(\['state', 'guard', 'verify', 'retry', 'baseline'\]\)/.test(read('lib/core4/model.ts')) && /await uncounted\(\(\) => extract\(opts\.apiKey, text/.test(read('lib/mind/pipeline.ts')));
  const app = read('components/LogosApp.tsx');
  ok('the app: a send while resting opens the screen and keeps the words', /if \(asleepNow\(\)\) \{\s*setSleepOpen\(true\);\s*return;\s*\}/.test(app));
  ok('  a refused turn goes back in the box', /if \(body\?\.sleep\) \{[\s\S]{0,900}giveBack\(sid, content, replying\)/.test(app));
  ok('  the map stays as it is', /if \(res\.status === 429\) return;/.test(app));
  ok('  the week is read from the server, the same on every device', /if \(json && 'sleep' in json\) setSleep\(/.test(app));
}

console.log('\n=== no daily allowance is left anywhere ===');
{
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(join(root, d))) {
      if (['node_modules', '.next', '.tmp', '.git', '.journeys', '.smoke'].includes(f)) continue;
      const p = join(d, f);
      if (statSync(join(root, p)).isDirectory()) walk(p);
      else if (/\.(tsx?|mjs|md|sql|example|css)$/.test(f)) files.push(p);
    }
  };
  for (const d of ['app', 'lib', 'components', 'docs', 'scripts', 'supabase']) walk(d);
  files.push('.env.example', 'README.md');
  const daily = files.filter((f) => /SOCRIA_FREE_DAILY_TOKENS|DAILY_TOKENS|dailyLimit|tokensToday|tokens a day|day of tokens|resting until tomorrow|today’s (free )?thinking time/.test(readFileSync(join(root, f), 'utf8')));
  ok('no daily token count, switch or sentence in the code, the copy or the docs', daily.length === 0, daily);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
