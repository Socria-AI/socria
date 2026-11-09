// test/sleep.test.mjs — THE TRIAL'S DAY OF TOKENS, END TO END: 4,000 A UTC DAY, SEVEN DAYS
// (lib/trial.ts, lib/trial-server.ts, lib/sleep.ts, lib/token-allowance.ts, lib/sleep-server.ts,
// lib/openai-usage.ts).
//
// Since November 9, 2026 an account that is not on Socria One is on a seven-day hard trial, not a week
// of free tokens: each UTC day (00:00 to 24:00) it may spend 4,000 tokens, the seven days together
// 28,000, and the trial ends 7 × 24 hours after its first metered model call. Sleep Mode's machinery
// holds and settles the day exactly as it held the week.
//
// Through the real routes, with only Clerk, the database and the model replaced — and the database's
// usage functions the very ones the dev stand-in serves (scripts/dev/usage-functions.mjs, the semantics
// of supabase/weekly-tokens.sql):
//   • every route that calls a model for the person refuses when today's tokens are spent — 429 with
//     the day's state (period 'day', resetting at the next 00:00 UTC), and no model asked — and, awake,
//     holds and settles what it really cost to the account's day;
//   • the trial over (seven days after it began) is a 402 that says so, and no model is asked; the trial
//     begins with the first metered model call, never with the gate, a read of the panel or our upkeep;
//   • only what reaches the person counts: the input read afresh (never what the prompt cache served)
//     plus what was written; a refused model on the ladder, a second attempt after our own check, the
//     memory kept, a title, Core's state, guard and checker never do;
//   • the day resets at 00:00 UTC; the count is the account's, so every session shares it; requests at
//     once at the edge never overspend by more than one reply; a store that cannot be read pauses
//     requests (fail closed);
//   • Socria One is never counted or put to rest; a guest is untouched;
//   • the screen: what is left, when it resets, in their own time — the day's words with the day, the
//     week's words only where no day is meant; and the week no longer drives the gate.

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
  trial: 'lib/trial.ts',
  gate: 'lib/sleep-server.ts',
  rows: 'lib/usage-rows.ts',
  trialServer: 'lib/trial-server.ts',
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
// The mechanics below are written at a 4,000-token day within 28,000 (the trial as it launched); the
// limits move per deployment, so they run there. The defaults themselves are test/trial.test.mjs's.
process.env.SOCRIA_TRIAL_DAILY_TOKENS = '4000';
process.env.SOCRIA_TRIAL_TOTAL_TOKENS = '28000';

const { db } = await import(pathToFileURL(join(here, 'helpers', 'fake-supabase.mjs')).href);
const load = (n) => import(pathToFileURL(join(OUT, `${n}.mjs`)).href);
const R = Object.fromEntries(await Promise.all(Object.keys(ENTRIES).map(async (k) => [k, await load(k)])));
const S = R.sleep;
const Tr = R.trial;
const UI = R.screen;
const { NextRequest } = await import('next/server.js');

let pass = 0;
let fail = 0;
const ok = (name, cond, info) => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && info !== undefined ? `  — ${typeof info === 'string' ? info.slice(0, 400) : JSON.stringify(info).slice(0, 400)}` : ''}`);
};

const DAY = 86_400_000;
const HOUR = 3_600_000;
// every call reports 1,000 read (400 of it from the prompt cache) and 100 written: 700 counted
const USAGE = { prompt_tokens: 1_000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 400 } };
const EACH = 700;
/** The trial's day holding `at`: `tday:2026-11-09`. */
const day = (at = Date.now()) => Tr.dayKey(at);
const tokensOf = (user, at = Date.now()) => db.rows('logos_usage').find((r) => r.user_id === user && r.scope === day(at) && r.counter === 'tokens')?.n ?? 0;
const holdsOf = (user) => db.rows('logos_usage').filter((r) => r.user_id === user && String(r.scope).startsWith('tokhold:')).length;
const put = (user, scope, counter, n, at) => {
  const rows = db.rows('logos_usage');
  const r = rows.find((x) => x.user_id === user && x.scope === scope && x.counter === counter);
  if (r) r.n = n;
  else rows.push({ id: `${user}|${scope}|${counter}`, user_id: user, scope, counter, n, updated_at: at });
};
/** The tokens settled on the day holding `at` (the account's tday row). */
const setTokens = (user, n, at = Date.now()) => put(user, day(at), 'tokens', n, at);
/** The trial begun at `at`: the start row, in whole minutes, as lib/trial-server.ts beginTrial writes it. */
const startTrial = (user, at = Date.now()) => put(user, 'trial', 'start', Math.floor(at / 60_000), at);
const startOf = (user) => db.rows('logos_usage').find((r) => r.user_id === user && r.scope === 'trial' && r.counter === 'start')?.n ?? null;
const weekRows = () => db.rows('logos_usage').filter((r) => String(r.scope).startsWith('week:') || String(r.scope).startsWith('tokhold:week:'));
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
  return { status: r.status, text, json, calls: [...(globalThis.__logosCalls ?? [])], retry: r.headers.get('retry-after'), cookie: r.headers.get('set-cookie') ?? '' };
}
async function usageOf(user) {
  globalThis.__uid = user;
  const r = await R.usage.GET(new NextRequest('http://localhost/api/logos/usage'));
  return await r.json();
}
/** A refusal for the spent day, as every route sends it: the day's state, resetting at the next 00:00 UTC. */
const restsForTheDay = (out, used, limit = 4_000) => {
  const now = Date.now();
  return (
    out.status === 429 &&
    out.json?.sleep === true &&
    out.json.period === 'day' &&
    out.json.used === used &&
    out.json.limit === limit &&
    out.json.left === 0 &&
    out.json.resetAt === Tr.nextMidnight(now) &&
    out.json.weekStart === Tr.dayStart(now) &&
    out.json.error === Tr.TRIAL_DAY_NOTE &&
    Number(out.retry) > 0 &&
    Number(out.retry) <= 86_400
  );
};

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

console.log('\n=== resting for the day: every route that calls a model refuses before it does ===');
{
  for (const r of ROUTES) {
    fresh();
    const user = `asleep_${r.name}`;
    r.setup?.(user);
    startTrial(user, Date.now() - HOUR);
    setTokens(user, 4_000);
    const out = await call(r.name, r.url, r.body(user), { as: user, ctx: r.ctx, script: r.script });
    ok(`${r.label}: 429, resting, with today’s state until the next 00:00 UTC — and no model asked`, restsForTheDay(out, 4_000) && out.calls.length === 0 && tokensOf(user) === 4_000 && holdsOf(user) === 0, { status: out.status, calls: out.calls.length, body: out.text.slice(0, 240) });
  }
  fresh();
  startTrial('asleep_trace', Date.now() - HOUR);
  setTokens('asleep_trace', 4_100);
  const trace = await call('explore', '/api/logos/explore', { label: 'Frame first', type: 'idea', mode: 'trace', messages: [U('Frame first?')] }, { as: 'asleep_trace' });
  ok('Trace too — no monthly count limits it, but it is an AI request, and it waits for 00:00 UTC', restsForTheDay(trace, 4_100) && trace.calls.length === 0, { status: trace.status, body: trace.text.slice(0, 200) });
}

console.log('\n=== awake: each route holds, then settles what it cost, to the account’s day ===');
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
      `${r.label}: ${counted} counted call${counted === 1 ? '' : 's'} of ${made} — ${counted * EACH} tokens on today’s row, the trial begun, no hold left behind`,
      made > 0 && counted >= 1 && tokensOf(user) === counted * EACH && holdsOf(user) === 0 && startOf(user) !== null && weekRows().length === 0,
      { status: out.status, made, counted, tokens: tokensOf(user), holds: holdsOf(user), start: startOf(user), weeks: weekRows().length, body: out.text.slice(0, 160) }
    );
  }
}

console.log('\n=== the trial begins with the first metered model call — not with the gate ===');
{
  fresh();
  const before = Date.now();
  const u0 = await usageOf('pia');
  ok('a signed-in account that has asked nothing has a trial waiting, not begun: 4,000 today, seven days ahead', u0.trial?.status === 'eligible' && u0.trial.startedAt === null && u0.sleep?.period === 'day' && u0.sleep.limit === 4_000 && u0.sleep.used === 0 && startOf('pia') === null, u0);
  globalThis.__uid = 'pia';
  const g = await R.gate.sleepGate(new NextRequest('http://localhost/api/logos/chat', { method: 'POST' }), 'pia');
  ok('  the gate alone lets the request on, marked to begin the trial with its first call — and writes nothing', g.refuse === null && g.meter?.begin === true && g.meter.scope === day() && g.meter.limit === 4_000 && !db.rows('logos_usage').some((r) => r.user_id === 'pia'), { meter: g.meter, rows: db.rows('logos_usage') });
  await call('title', '/api/extract-memory', { messages: [U('Help me study for my bio test'), A('Which unit?')], titleOnly: true, titleStyle: 'topic' }, { as: 'pia', script: [{ suggestedTitle: 'Biology – Exam Review' }] });
  ok('  nor does our upkeep begin it (a title named by the model)', startOf('pia') === null && tokensOf('pia') === 0);
  const a = await call('chat', '/api/logos/chat', ROUTES[0].body('pia'), { as: 'pia' });
  const n = startOf('pia');
  ok('the first reply begins it: the start row is written, in whole minutes, at the call', a.status === 200 && n !== null && n >= Math.floor(before / 60_000) && n <= Math.floor(Date.now() / 60_000) && tokensOf('pia') === 700, { status: a.status, start: n, tokens: tokensOf('pia') });
  const u1 = await usageOf('pia');
  ok('  and the app reads it running: day 1 of 7, ending 7 × 24 hours after it began', u1.trial?.status === 'active' && u1.trial.day === 1 && u1.trial.startedAt === n * 60_000 && u1.trial.endsAt === n * 60_000 + 7 * DAY && u1.sleep?.used === 700, u1.trial);
  // a start already written is never moved by a later call
  const earlier = Math.floor((Date.now() - 2 * HOUR) / 60_000);
  put('pia', 'trial', 'start', earlier, Date.now());
  await call('chat', '/api/logos/chat', ROUTES[0].body('pia'), { as: 'pia' });
  ok('  a later call never moves the start', startOf('pia') === earlier && tokensOf('pia') === 1_400, { start: startOf('pia'), earlier });
}

console.log('\n=== the trial over: seven days after it began, every model route refuses (402) ===');
{
  for (const r of ROUTES) {
    fresh();
    const user = `ended_${r.name}`;
    r.setup?.(user);
    startTrial(user, Date.now() - 8 * DAY);
    const out = await call(r.name, r.url, r.body(user), { as: user, ctx: r.ctx, script: r.script });
    ok(
      `${r.label}: 402, the trial has ended — said so, the browser marked, and no model asked`,
      out.status === 402 && out.json?.trialEnded === true && out.json.reason === 'expired' && out.json.error === Tr.TRIAL_ENDED_NOTE && /(^|[ ,])socria_trial_over=1/.test(out.cookie) && out.calls.length === 0 && tokensOf(user) === 0 && holdsOf(user) === 0,
      { status: out.status, calls: out.calls.length, cookie: out.cookie, body: out.text.slice(0, 200) }
    );
  }
  fresh();
  startTrial('ola', Date.now() - 7 * DAY + 2 * 60_000);
  ok('a trial in its last minutes still answers: it ends 7 × 24 hours after it began, not at a day’s edge', (await call('chat', '/api/logos/chat', ROUTES[0].body('ola'), { as: 'ola' })).status === 200 && tokensOf('ola') === 700);
  startTrial('ola', Date.now() - 7 * DAY - 60_000);
  const over = await call('chat', '/api/logos/chat', ROUTES[0].body('ola'), { as: 'ola' });
  ok('  a minute past it, the reply is refused (402) with the trial’s dates, and no model asked', over.status === 402 && over.json?.trialEnded === true && typeof over.json.startedAt === 'number' && over.json.endsAt === over.json.startedAt + 7 * DAY && over.calls.length === 0, over.text.slice(0, 200));
  const u = await usageOf('ola');
  ok('  the app reads it over, the same on every device — over, not resting until 00:00 UTC', u.trial?.status === 'ended' && u.trial.reason === 'expired' && u.sleep === null, { trial: u.trial, sleep: u.sleep });
  fresh();
  startTrial('pat', Date.now() - 2 * DAY);
  setTokens('pat', 28_000, Date.now() - DAY);
  const spent = await call('chat', '/api/logos/chat', ROUTES[0].body('pat'), { as: 'pat' });
  ok('the trial’s 28,000 spent ends it early as well (402, spent), and no model asked', spent.status === 402 && spent.json?.trialEnded === true && spent.json.reason === 'spent' && spent.calls.length === 0, spent.text.slice(0, 200));
}

console.log('\n=== the reply, counted: cache reads, retries and memory ===');
{
  fresh();
  const a = await call('chat', '/api/logos/chat', ROUTES[0].body('ann'), { as: 'ann' });
  ok('a trial account’s turn is answered, and what it cost is the account’s: 1,000 read, 400 from the cache, 100 written = 700', a.status === 200 && /frame/.test(a.text) && tokensOf('ann') === 700, { status: a.status, tokens: tokensOf('ann') });
  const first = a.calls.find((c) => c.stream)?.model;
  globalThis.__logosRefuse = [first];
  const b = await call('chat', '/api/logos/chat', ROUTES[0].body('ann'), { as: 'ann' });
  ok('a model refused on the router’s ladder is not counted: only the attempt that answered (700 more)', b.status === 200 && b.calls.filter((c) => c.stream).length === 2 && tokensOf('ann') === 1_400 && holdsOf('ann') === 0, { calls: b.calls.map((c) => c.model), tokens: tokensOf('ann') });
  globalThis.__logosRefuse = [];
  globalThis.__logosScript = [{ nodes: [], edges: [] }];
  const c = await call('chat', '/api/logos/chat', { ...ROUTES[0].body('ann'), mind: true }, { as: 'ann' });
  const extraction = c.calls.filter((x) => !x.stream).length;
  ok('the memory kept after a turn is ours: the extractor ran, and only the reply was counted', c.status === 200 && extraction >= 1 && tokensOf('ann') === 2_100, { extraction, tokens: tokensOf('ann') });
  globalThis.__logosUsage = { prompt_tokens: 1_500, completion_tokens: 200 };
  await call('chat', '/api/logos/chat', ROUTES[0].body('ann'), { as: 'ann' });
  ok('nothing cached: all of the input counts (1,700)', tokensOf('ann') === 3_800, tokensOf('ann'));
}

console.log('\n=== the edge: the turn that crosses today’s limit is finished, then Socria rests ===');
{
  fresh();
  startTrial('bo', Date.now() - HOUR);
  setTokens('bo', 3_800);
  globalThis.__logosUsage = { prompt_tokens: 2_000, completion_tokens: 300 };
  const a = await call('chat', '/api/logos/chat', ROUTES[0].body('bo'), { as: 'bo' });
  const asked = a.calls.find((c) => c.stream);
  ok('a turn begun with 200 of 4,000 left is answered — its reply capped to what is left, with a floor', a.status === 200 && (asked?.max_tokens ?? asked?.max_completion_tokens) === 300, asked?.max_tokens ?? asked?.max_completion_tokens);
  ok('  and recorded as it was: 2,300 — the day ends past its limit by that one turn', tokensOf('bo') === 6_100 && holdsOf('bo') === 0, tokensOf('bo'));
  const b = await call('chat', '/api/logos/chat', ROUTES[0].body('bo'), { as: 'bo' });
  ok('the next turn rests until 00:00 UTC: refused, no model asked', restsForTheDay(b, 6_100) && b.calls.length === 0, b.text.slice(0, 200));
  const u = await usageOf('bo');
  ok('the app reads the same state, on any device', u.sleep?.asleep === true && u.sleep.period === 'day' && u.sleep.used === 6_100 && u.sleep.limit === 4_000 && u.sleep.left === 0 && u.sleep.resetAt === Tr.nextMidnight(Date.now()) && u.sleep.weekStart === Tr.dayStart(Date.now()) && u.trial?.status === 'active' && u.trial.today.used === 6_100, u);
  ok('another trial account is untouched by it', (await call('chat', '/api/logos/chat', ROUTES[0].body('cy'), { as: 'cy' })).status === 200 && tokensOf('cy') === 2_300);
}

console.log('\n=== requests at once at the edge: the last tokens go to one of them ===');
{
  fresh();
  startTrial('dee', Date.now() - HOUR);
  setTokens('dee', 3_500);
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
  ok(`${N} turns at once with 500 of 4,000 left: every one answered or refused cleanly (429), none crashed`, answered + refused === N && answered >= 1, outs.map((o) => o.status));
  ok('  held one at a time: what was answered is what was settled, 300 each — never past what the holds allowed', tokensOf('dee') === 3_500 + answered * 300 && holdsOf('dee') === 0, { answered, tokens: tokensOf('dee') });
  ok('  so the overspend is at most the last reply that started with tokens left, never all of them', tokensOf('dee') - 4_000 < 300 && answered < N, { answered, tokens: tokensOf('dee') });
  const rests = outs.filter((o) => o.json?.sleep);
  ok('  those told to rest are told the day’s state: period day, until the next 00:00 UTC', rests.every((o) => o.json.period === 'day' && o.json.limit === 4_000 && o.json.resetAt === Tr.nextMidnight(Date.now())), rests.map((o) => o.json));
}

console.log('\n=== one balance for the account: a refresh, a second tab, a second device ===');
{
  fresh();
  await call('chat', '/api/logos/chat', ROUTES[0].body('eve'), { as: 'eve' });
  // a second tab or device: another request, another session id, the same account
  await call('chat', '/api/logos/chat', { messages: [U('And the tyres?')], sessionId: 'eve-phone' }, { as: 'eve' });
  const u1 = await usageOf('eve');
  ok('two sessions, one count: the account’s, not the browser’s', tokensOf('eve') === 1_400 && u1.sleep?.used === 1_400 && u1.sleep.period === 'day', { tokens: tokensOf('eve'), sleep: u1.sleep });
  ok('  there is one row for the day, keyed by the account id — none per device or session', db.rows('logos_usage').filter((r) => r.user_id === 'eve' && r.counter === 'tokens' && !String(r.scope).startsWith('tokhold:')).length === 1);
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
  const yesterday = Date.now() - DAY;
  startTrial('fay', yesterday);
  setTokens('fay', 4_000, yesterday);
  ok('yesterday’s spend is yesterday’s: a new UTC day starts awake', (await call('chat', '/api/logos/chat', ROUTES[0].body('fay'), { as: 'fay' })).status === 200 && tokensOf('fay') === 700 && tokensOf('fay', yesterday) === 4_000);
  const reset = (await usageOf('fay')).sleep;
  ok('  the day the app reads resets at the next 00:00 UTC', reset?.period === 'day' && reset.resetAt === Tr.nextMidnight(Date.now()) && reset.resetAt - Date.now() <= DAY && new Date(reset.resetAt).getUTCHours() === 0 && new Date(reset.resetAt).getUTCMinutes() === 0, reset);

  startTrial('gus', Date.now() - HOUR);
  setTokens('gus', 4_000);
  ok('resting on the trial', (await call('chat', '/api/logos/chat', ROUTES[0].body('gus'), { as: 'gus' })).status === 429);
  process.env.SOCRIA_ONE_USER_IDS = 'gus';
  const one = await call('chat', '/api/logos/chat', ROUTES[0].body('gus'), { as: 'gus' });
  ok('subscribing wakes Socria at once — Socria One has no daily allowance', one.status === 200);
  ok('  and a member is never counted, on any route', tokensOf('gus') === 4_000 && holdsOf('gus') === 0, tokensOf('gus'));
  for (const r of ROUTES) {
    r.setup?.('gus');
    const out = await call(r.name, r.url, r.body('gus'), { as: 'gus', ctx: r.ctx, script: r.script });
    if (out.status === 429 || out.status === 402 || tokensOf('gus') !== 4_000) ok(`  ${r.label}: Socria One is never blocked or counted`, false, { status: out.status, tokens: tokensOf('gus') });
  }
  ok('  (every route, as a member: never refused, never a token held or counted)', tokensOf('gus') === 4_000 && holdsOf('gus') === 0);
  const member = await usageOf('gus');
  ok('  the app shows a member no allowance and no trial at all', member.sleep === null && member.trial === null, member);
  process.env.SOCRIA_ONE_USER_IDS = '';
  const back = await call('chat', '/api/logos/chat', ROUTES[0].body('gus'), { as: 'gus' });
  ok('a subscription that ends: the account is back under its trial — today’s spend still rests it', restsForTheDay(back, 4_000) && back.calls.length === 0, back.text.slice(0, 200));

  process.env.SOCRIA_FREE_WEEKLY_TOKENS = '60000';
  ok('the old weekly switch no longer moves the gate: a spent day still rests', (await call('chat', '/api/logos/chat', ROUTES[0].body('gus'), { as: 'gus' })).status === 429);
  delete process.env.SOCRIA_FREE_WEEKLY_TOKENS;
  process.env.SOCRIA_TRIAL_DAILY_TOKENS = '8000';
  const higher = await call('chat', '/api/logos/chat', ROUTES[0].body('gus'), { as: 'gus' });
  ok('a higher daily limit, set in the environment, wakes it with no redeploy', higher.status === 200 && tokensOf('gus') === 4_700, { status: higher.status, tokens: tokensOf('gus') });
  process.env.SOCRIA_TRIAL_DAILY_TOKENS = '4000';
  process.env.SOCRIA_SLEEP = 'off';
  setTokens('gus', 999_999);
  ok('SOCRIA_SLEEP=off switches counting off: answered, and nothing held or counted', (await call('chat', '/api/logos/chat', ROUTES[0].body('gus'), { as: 'gus' })).status === 200 && tokensOf('gus') === 999_999 && holdsOf('gus') === 0);
  delete process.env.SOCRIA_SLEEP;

  // a member whose seven days ran out while subscribed: when the subscription ends, the trial is over
  startTrial('gus', Date.now() - 8 * DAY);
  process.env.SOCRIA_ONE_USER_IDS = 'gus';
  ok('a member is answered whatever the trial’s dates', (await call('chat', '/api/logos/chat', ROUTES[0].body('gus'), { as: 'gus' })).status === 200);
  process.env.SOCRIA_ONE_USER_IDS = '';
  const after = await call('chat', '/api/logos/chat', ROUTES[0].body('gus'), { as: 'gus' });
  ok('  and once the subscription ends past the seven days, the trial is over (402), no model asked', after.status === 402 && after.json?.trialEnded === true && after.calls.length === 0, after.text.slice(0, 200));
}

console.log('\n=== guests are untouched — and no request is ever counted to someone else ===');
{
  fresh();
  // a trial account's turn first: its account must stay with its own request (lib/token-meter.ts withMeter)
  await call('chat', '/api/logos/chat', ROUTES[0].body('nia'), { as: 'nia' });
  const rowsBefore = db.rows('logos_usage').length;
  process.env.CLERK_SECRET_KEY = 'sk_test_guest';
  const claim = R.pass.claimGuest(undefined, 'lg_guest1', Date.now());
  const cookie = `${R.pass.GUEST_COOKIE}=${claim.pass}`;
  const g = await call('chat', '/api/logos/chat', { surface: 'logos5', messages: [U('What is opportunity cost?')], sessionId: 'lg_guest1' }, { as: null, cookie });
  const rows = db.rows('logos_usage');
  ok(
    'a guest’s turn, straight after, is answered on their own pass — nothing held or counted for anyone, the last account included',
    g.status === 200 && tokensOf('nia') === 700 && rows.filter((r) => r.counter === 'tokens').length === 1 && rows.length === rowsBefore && startOf('nia') !== null,
    { status: g.status, rows }
  );
  ok('  the rows are only the account’s own (and a count with no person in it): none for the guest', rows.every((r) => r.user_id === 'nia' || r.user_id === 'metrics:trial'), rows.map((r) => `${r.user_id}|${r.scope}|${r.counter}`));
  ok('  and the app shows a guest no allowance and no trial', (await usageOf(null)).sleep === null && (await usageOf(null)).trial === null);
  delete process.env.CLERK_SECRET_KEY;
}

console.log('\n=== our upkeep: never counted, never begins a trial, and never asked of a model while resting ===');
{
  fresh();
  const t = await call('title', '/api/extract-memory', { messages: [U('Help me study for my bio test'), A('Which unit?')], titleOnly: true, titleStyle: 'topic' }, { as: 'hal', script: [{ suggestedTitle: 'Biology – Exam Review' }] });
  ok('a conversation’s title is ours: the model named it, and nothing was counted', t.status === 200 && t.calls.length === 1 && tokensOf('hal') === 0, { calls: t.calls.length, tokens: tokensOf('hal') });
  const u = await call('understand', '/api/update-understanding', { messages: [U('I keep putting this off because I want it perfect.'), A('What would good enough look like?')], surface: 'logos', conversationId: 'c-hal' }, { as: 'hal', script: [{ narrative: 'Wants it perfect.' }] });
  ok('the understanding kept across conversations is ours: not counted', u.status === 200 && tokensOf('hal') === 0, { status: u.status, calls: u.calls.length });
  ok('  and neither began a trial: nothing at all is kept for the account', !db.rows('logos_usage').some((r) => r.user_id === 'hal'), db.rows('logos_usage'));
  startTrial('ivy', Date.now() - HOUR);
  setTokens('ivy', 4_000);
  const t2 = await call('title', '/api/extract-memory', { messages: [U('Help me study'), A('Which unit?')], titleOnly: true, titleStyle: 'topic' }, { as: 'ivy' });
  const u2 = await call('understand', '/api/update-understanding', { messages: [U('Something'), A('Say more.')], surface: 'logos' }, { as: 'ivy' });
  ok('while today is spent, neither asks a model: the title the page gave stands, the memory stays as it was', t2.status === 200 && t2.json?.resting === true && u2.status === 200 && u2.json?.resting === true && t2.calls.length + u2.calls.length === 0);
  startTrial('ivy', Date.now() - 8 * DAY);
  setTokens('ivy', 0);
  const t3 = await call('title', '/api/extract-memory', { messages: [U('Help me study'), A('Which unit?')], titleOnly: true, titleStyle: 'topic' }, { as: 'ivy' });
  const u3 = await call('understand', '/api/update-understanding', { messages: [U('Something'), A('Say more.')], surface: 'logos' }, { as: 'ivy' });
  ok('  nor once the trial is over', t3.status === 200 && t3.json?.resting === true && u3.status === 200 && u3.json?.resting === true && t3.calls.length + u3.calls.length === 0);
}

console.log('\n=== nobody is given free use by a fault: the store unreachable pauses trial requests ===');
{
  fresh();
  db.absent.add('logos_usage');
  const down = await call('chat', '/api/logos/chat', ROUTES[0].body('jo'), { as: 'jo' });
  ok('a trial turn is paused, not let through uncounted: 503, said plainly, no model asked', down.status === 503 && down.json?.unavailable === true && /can’t be checked right now/.test(down.json?.error ?? '') && down.calls.length === 0, down.text.slice(0, 200));
  const map = await call('map', '/api/logos/map', ROUTES[1].body('jo'), { as: 'jo', script: ROUTES[1].script });
  ok('  the map the same way', map.status === 503 && map.calls.length === 0);
  const title = await call('title', '/api/extract-memory', { messages: [U('Help me study'), A('Which unit?')], titleOnly: true, titleStyle: 'topic' }, { as: 'jo' });
  ok('  our upkeep stands down too', title.status === 200 && title.json?.resting === true && title.calls.length === 0);
  const u = await usageOf('jo');
  ok('  and the app is not told a number nobody counted', !('sleep' in u) && !('trial' in u), u);
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
  ok('the day is still held and settled — through consume_logos_usage, refunded to what it cost', a.status === 200 && tokensOf('mo') === 700 && holdsOf('mo') === 0 && weekRows().length === 0, { status: a.status, tokens: tokensOf('mo') });
  setTokens('mo', 4_000);
  ok('  and as strict at the limit', restsForTheDay(await call('chat', '/api/logos/chat', ROUTES[0].body('mo'), { as: 'mo' }), 4_000));
}

console.log('\n=== no usage functions at all (production, November 9, 2026: no trial could begin) ===');
{
  fresh();
  const gone = (name) => () => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name} in the schema cache` } });
  for (const name of ['reserve_logos_tokens', 'settle_logos_tokens', 'consume_logos_usage', 'bump_logos_usage', 'refund_logos_usage']) db.rpcs[name] = gone(name);
  globalThis.__users = { ...(globalThis.__users ?? {}), nf: { emails: ['nf.person@example.com'] } };
  const secretWas = process.env.SOCRIA_TRIAL_SECRET;
  process.env.SOCRIA_TRIAL_SECRET = 'a-test-secret-for-the-address-hashes';
  const metric = (event) => db.rows('logos_usage').filter((r) => r.user_id === 'metrics:trial' && r.counter === event).reduce((a, r) => a + r.n, 0);
  const claims = () => db.rows('logos_usage').filter((r) => String(r.user_id).startsWith('trialclaim:') && r.scope === 'claim' && r.n > 0).length;
  const a = await call('chat', '/api/logos/chat', ROUTES[0].body('nf'), { as: 'nf' });
  ok('the first message is answered: the trial begins on the table alone, and its tokens are held and settled there', a.status === 200 && startOf('nf') !== null && tokensOf('nf') === EACH && holdsOf('nf') === 0, { status: a.status, start: startOf('nf'), tokens: tokensOf('nf'), body: a.text.slice(0, 200) });
  await new Promise((r) => setTimeout(r, 60));
  ok('  the activation is counted and the address kept, with no bump_logos_usage to do it', metric('activated') === 1 && claims() === 1, { activated: metric('activated'), claims: claims() });
  const start = startOf('nf');
  const b = await call('chat', '/api/logos/chat', ROUTES[0].body('nf'), { as: 'nf' });
  ok('  the next message the same: the start unmoved, the day adding up', b.status === 200 && startOf('nf') === start && tokensOf('nf') === 2 * EACH && metric('activated') === 1, { status: b.status, tokens: tokensOf('nf') });
  const u = await usageOf('nf');
  ok('  and the app is shown the running trial and the day', u.trial?.status === 'active' && u.sleep?.used === 2 * EACH && u.sleep?.limit === 4_000, u);
  setTokens('nf', 4_000);
  ok('  as strict at the day’s limit', restsForTheDay(await call('chat', '/api/logos/chat', ROUTES[0].body('nf'), { as: 'nf' }), 4_000));
  ok('  a limit reached is counted once, on the table alone', metric('limit_hits') === 1);

  // the primitives, raced: twenty requests at once for the last of a limit, two first messages at once
  const row = { user: 'race', scope: 'tday:race', counter: 'tokens' };
  const got = await Promise.all(Array.from({ length: 20 }, () => R.rows.addTo(row, 100, Date.now(), { limit: 1_000 })));
  const n = db.rows('logos_usage').find((r) => r.user_id === 'race')?.n;
  ok('twenty requests at once for 1,000 tokens, 100 each: exactly ten are given them, the rest told no — never more than the limit', n === 1_000 && got.filter((x) => x > 0).length === 10 && got.filter((x) => x === -1).length === 10, { n, got });
  ok('  a refund never goes below zero', (await R.rows.addTo(row, -5_000, Date.now())) === 0);
  const t0 = Date.now();
  const [s1, s2] = await Promise.all([R.trialServer.beginTrial('twin', t0), R.trialServer.beginTrial('twin', t0 + 1_000)]);
  await new Promise((r) => setTimeout(r, 60));
  const starts = db.rows('logos_usage').filter((r) => r.user_id === 'twin' && r.scope === 'trial' && r.counter === 'start');
  ok('two first messages at once begin ONE trial: one start row, both told the same start, one activation', starts.length === 1 && s1 === s2 && s1 === Math.floor(t0 / 60_000) * 60_000 && metric('activated') === 2, { starts, s1, s2, activated: metric('activated') });
  // a start row left empty by an attempt that died between creating and filling it is filled, not refused
  db.rows('logos_usage').push({ user_id: 'stub', scope: 'trial', counter: 'start', n: 0, updated_at: t0 });
  ok('  a start row left empty is filled, once', (await R.trialServer.beginTrial('stub', t0)) === Math.floor(t0 / 60_000) * 60_000 && startOf('stub') === Math.floor(t0 / 60_000));
  // only a store that cannot be read or written at all still pauses the request
  db.absent.add('logos_usage');
  const down = await call('chat', '/api/logos/chat', ROUTES[0].body('nz'), { as: 'nz' });
  ok('with no table to keep it on, the request is still paused (503) and no model is asked', down.status === 503 && down.json?.unavailable === true && down.calls.filter((c) => c.stream).length === 0, down.status);
  db.absent.delete('logos_usage');
  if (secretWas === undefined) delete process.env.SOCRIA_TRIAL_SECRET;
  else process.env.SOCRIA_TRIAL_SECRET = secretWas;
}

console.log('\n=== the screen (components/logos5/SleepMode.tsx) ===');
{
  const now = Date.now();
  const text = (x) => x.replace(/<[^>]+>/g, '').replace(/\s/g, ' ');

  // the week's words, where the state names no period (Sleep Mode as it was)
  const st = S.sleepState(30_400, 30_000, now);
  const html = renderToStaticMarkup(h(UI.SleepScreen, { sleep: st, open: true, onClose() {}, onUpgrade() {}, onWake() {}, timeZone: 'America/Chicago' }));
  ok('a dialog, named and described', /role="dialog"/.test(html) && /aria-modal="true"/.test(html) && /aria-labelledby="sl-t"/.test(html));
  ok('with no period: "Socria is resting", this week’s tokens, and what still works', /Socria is resting/.test(html) && /You’ve used this week’s 30,000 free tokens/.test(html) && /Everything you’ve made is still here — open any conversation, move your Logic Maps, edit your writing, keep drafting/.test(html), html);
  ok('  when it wakes: a countdown, Monday 00:00 UTC, and their own time', /Wakes in/.test(html) && /class="sl-when-v">\d/.test(html) && /Monday 00:00 UTC · Sunday \d{1,2}:00 [AP]M your time/.test(text(html)), text(html));
  ok('  each kept whole on a narrow screen', /<span class="sl-keep">Monday 00:00 UTC<\/span> · <span class="sl-keep">Sunday \d{1,2}:00\s[AP]M your time<\/span>/.test(html), html);
  ok('  Socria One, offered beside "Keep exploring" — never in place of it', /Keep exploring/.test(html) && /Stay awake with Socria One/.test(html) && /Socria One has no weekly limit/.test(html));
  const member = renderToStaticMarkup(h(UI.SleepScreen, { sleep: st, open: true, onClose() {}, onWake() {}, timeZone: 'UTC' }));
  ok('  not offered where there is no upgrade to make; no local time where theirs is UTC', !/Socria One/.test(member) && !/your time/.test(member) && /Monday 00:00 UTC/.test(member));
  ok('closed, or awake, it draws nothing', renderToStaticMarkup(h(UI.SleepScreen, { sleep: st, open: false, onClose() {}, onWake() {} })) === '' && renderToStaticMarkup(h(UI.SleepScreen, { sleep: S.sleepState(10, 30_000, now), open: true, onClose() {}, onWake() {} })) === '');
  const bar = renderToStaticMarkup(h(UI.SleepBar, { sleep: st, onOpen() {}, onWake() {}, timeZone: 'UTC' }));
  ok('the bar over the box: resting until Monday 00:00 UTC, in how long — drafting still open', /class="sl-bar"/.test(bar) && /Resting until Monday 00:00 UTC/.test(bar) && /aria-label="Socria is resting until Monday 00:00 UTC, in [^"]+\. You can keep drafting; sending waits\."/.test(bar), bar);

  const awake = S.sleepState(17_600, 30_000, now);
  const ring = renderToStaticMarkup(h(UI.SleepRing, { sleep: awake, onOpen() {}, onWake() {}, timeZone: 'UTC' }));
  ok('the ring: an outline, filled as far as the period is spent (59%)', /class="sl-ring"/.test(ring) && /class="sl-ring-used"/.test(ring) && !/sl-ring-full/.test(ring) && /stroke-dasharray="23\.9\d* 40\.84\d*"/.test(ring), ring);
  ok('  and says what is left and when it resets, in one line', /aria-label="12,400 of 30,000 left this week · resets Monday 00:00 UTC \(in [^)]+\)\."/.test(ring), ring);
  const chicago = renderToStaticMarkup(h(UI.SleepRing, { sleep: awake, onOpen() {}, onWake() {}, timeZone: 'America/Chicago' }));
  ok('  with their own time where they have one', /— Sunday \d{1,2}:00 [AP]M your time\./.test(chicago.replace(/\s/g, ' ')), chicago);
  ok('nearly spent: marked as such', /sl-ring is-low/.test(renderToStaticMarkup(h(UI.SleepRing, { sleep: S.sleepState(25_000, 30_000, now), onOpen() {}, onWake() {} }))));
  const asleep = renderToStaticMarkup(h(UI.SleepRing, { sleep: st, onOpen() {}, onWake() {}, timeZone: 'UTC' }));
  ok('resting: the circle filled solid, and it says when Socria wakes', /sl-ring is-asleep/.test(asleep) && /class="sl-ring-full"/.test(asleep) && /aria-label="Socria is resting\. This week’s 30,000 tokens are used; wakes Monday 00:00 UTC, in /.test(asleep), asleep);
  ok('nothing for Socria One or a guest (no state)', renderToStaticMarkup(h(UI.SleepRing, { sleep: null, onOpen() {}, onWake() {} })) === '');

  // the trial's day (period 'day'), as the server sends it
  const start = now - 2 * HOUR;
  const spent = Tr.trialState({ startedAt: start, now, byDay: { [Tr.dayKey(now)]: 4_400 }, limits: Tr.trialLimits(process.env) });
  const going = Tr.trialState({ startedAt: start, now, byDay: { [Tr.dayKey(now)]: 1_400 }, limits: Tr.trialLimits(process.env) });
  ok('the trial’s day, as the server reads it: period day, 4,000, resetting at the next 00:00 UTC', spent.status === 'active' && spent.today.period === 'day' && spent.today.asleep && spent.today.limit === 4_000 && spent.today.resetAt === Tr.nextMidnight(now) && !going.today.asleep && going.today.left === 2_600, spent.today);
  const dhtml = renderToStaticMarkup(h(UI.SleepScreen, { sleep: spent.today, trial: spent, open: true, onClose() {}, onUpgrade() {}, onWake() {}, timeZone: 'America/Chicago' }));
  ok('the day spent: "Socria is resting", today’s 4,000 trial tokens, and what still works', /Socria is resting/.test(dhtml) && /You’ve used today’s 4,000 trial tokens/.test(dhtml) && /Everything you’ve made is still here — open any conversation, move your Logic Maps, edit your writing, keep drafting/.test(dhtml), text(dhtml));
  ok('  when it wakes: a countdown, 00:00 UTC, and their own time as a clock time (no weekday)', /Wakes in/.test(dhtml) && /<span class="sl-keep">00:00 UTC<\/span> · <span class="sl-keep">\d{1,2}:00\s[AP]M your time<\/span>/.test(dhtml) && !/(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day/.test(text(dhtml)), text(dhtml));
  ok('  Socria One offered as the way on: "Continue with Socria One" — it has no daily limit', /Keep exploring/.test(dhtml) && /Continue with Socria One/.test(dhtml) && /Socria One has no daily limit/.test(dhtml), text(dhtml));
  ok('  and which day of the trial it is', /Day 1 of 7 of your trial · 7 days left/.test(text(dhtml)), text(dhtml));
  const dmember = renderToStaticMarkup(h(UI.SleepScreen, { sleep: spent.today, open: true, onClose() {}, onWake() {}, timeZone: 'UTC' }));
  ok('  no offer where there is none to make; no local time where theirs is UTC', !/Socria One/.test(dmember) && !/your time/.test(dmember) && /00:00 UTC/.test(dmember));
  const dbar = renderToStaticMarkup(h(UI.SleepBar, { sleep: spent.today, onOpen() {}, onWake() {}, timeZone: 'UTC' }));
  ok('the bar over the box: resting until 00:00 UTC, in how long — drafting still open', /Resting until 00:00 UTC/.test(dbar) && /aria-label="Socria is resting until 00:00 UTC, in [^"]+\. You can keep drafting; sending waits\."/.test(dbar), dbar);
  const dring = renderToStaticMarkup(h(UI.SleepRing, { sleep: going.today, trial: going, onOpen() {}, onWake() {}, timeZone: 'UTC' }));
  ok('the ring, through the day: what is left today and when it resets, in one line', /stroke-dasharray="14\.29\d* 40\.84\d*"/.test(dring) && /aria-label="2,600 of 4,000 left today · resets 00:00 UTC \(in [^)]+\)\. Day 1 of 7 of your trial; 7 days left in your trial\."/.test(dring), dring);
  const dchicago = renderToStaticMarkup(h(UI.SleepRing, { sleep: going.today, onOpen() {}, onWake() {}, timeZone: 'America/Chicago' }));
  ok('  with their own time as a clock time', /— \d{1,2}:00 [AP]M your time\./.test(dchicago.replace(/\s/g, ' ')), dchicago);
  const dasleep = renderToStaticMarkup(h(UI.SleepRing, { sleep: spent.today, onOpen() {}, onWake() {}, timeZone: 'UTC' }));
  ok('  resting: filled solid, and it says when Socria wakes', /sl-ring is-asleep/.test(dasleep) && /aria-label="Socria is resting\. Today’s 4,000 trial tokens are used; wakes 00:00 UTC, in /.test(dasleep), dasleep);

  // the day's words only with the day; the week's only where no day is meant
  const weekWords = [html, member, bar, ring, chicago, asleep].join(' ').replace(/<[^>]+>/g, ' ');
  const dayWords = [dhtml, dmember, dbar, dring, dchicago, dasleep].join(' ').replace(/<[^>]+>/g, ' ');
  const DAYISH = /\b(today|tomorrow|tonight|midnight|daily)\b|today’s|\btrial\b|(?<!Monday )00:00 UTC|Continue with Socria One/i;
  const WEEKISH = /\bweek(ly)?\b|week’s|Monday|Sunday|Stay awake/i;
  ok('the day’s words appear only with period day: none on the screens drawn for the week', !DAYISH.test(weekWords), weekWords.match(DAYISH)?.[0]);
  ok('  and the week’s words none on the screens drawn for the day', !WEEKISH.test(dayWords), dayWords.match(WEEKISH)?.[0]);
  const weekBody = S.sleepRefusal(st);
  const dayBody = S.sleepRefusal(spent.today, Tr.TRIAL_DAY_NOTE);
  ok('  the refusal too: the week’s says this week, the day’s says today — each with its period', weekBody.period === 'week' && /this week/.test(weekBody.error) && !DAYISH.test(weekBody.error) && dayBody.period === 'day' && /today’s trial tokens/.test(dayBody.error) && dayBody.resetAt === Tr.nextMidnight(now), { weekBody, dayBody });

  // the ring's tip opens when it is pressed: drawn in a document, and pressed as a person would
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  const w = dom.window;
  for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLButtonElement', 'Node', 'Event', 'MouseEvent', 'PointerEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    try {
      globalThis[k] = k === 'window' ? w : w[k];
    } catch {}
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');
  const tipOf = async (el) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const rootEl = createRoot(host);
    await act(async () => rootEl.render(el));
    await act(async () => void host.querySelector('.sl-ring').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })));
    const part = (c) => host.querySelector(c)?.textContent ?? null;
    const out = { title: part('.sl-ringtip-t'), body: part('.sl-ringtip-b'), reset: part('.sl-ringtip-r'), trial: part('.sl-ringtip-trial') };
    await act(async () => rootEl.unmount());
    host.remove();
    return out;
  };
  const dtip = await tipOf(h(UI.SleepRing, { sleep: going.today, trial: going, onOpen() {}, onWake() {}, timeZone: 'UTC' }));
  ok('the ring pressed, through the day: "Today’s trial tokens", what is left, 00:00 UTC, and the trial’s day', dtip.title === 'Today’s trial tokens' && dtip.body === '2,600 of 4,000 left today' && /^Resets 00:00 UTC/.test(dtip.reset ?? '') && /Day 1 of 7/.test(dtip.trial ?? ''), dtip);
  const wtip = await tipOf(h(UI.SleepRing, { sleep: awake, onOpen() {}, onWake() {}, timeZone: 'UTC' }));
  ok('  with no period it keeps the week’s: "This week’s tokens", Monday 00:00 UTC', wtip.title === 'This week’s tokens' && wtip.body === '12,400 of 30,000 left this week' && /^Resets Monday 00:00 UTC/.test(wtip.reset ?? '') && wtip.trial === null, wtip);

  const app = readFileSync(join(root, 'components', 'LogosApp.tsx'), 'utf8');
  ok('in the box’s tools, beside Voice', /meter=\{\s*<SleepRing/.test(app) && /\{meter\}\s*\{voiceButton\}/.test(readFileSync(join(root, 'components', 'LogosComposer.tsx'), 'utf8')));
  ok('Socria One opened from the screen says why, in words — not the word "sleep"', /askOne\(SLEEP_ONE\)/.test(app) && !/askOne\('sleep'\)/.test(app) && /const SLEEP_ONE = 'Socria One has no daily token allowance, so Socria stays awake/.test(app));
  ok('the screen is said when Socria falls asleep, not again for every request refused while it rests', /const already = !!sleepRef\.current\?\.asleep && Date\.now\(\) < sleepRef\.current\.resetAt;\s*setSleep\(st\);\s*if \(!already\) setSleepOpen\(true\);/.test(app));
}

console.log('\n=== wired everywhere a model is called for the person ===');
{
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f === 'route.ts' ? [join(d, f)] : []));
  const all = walk(join(root, 'app', 'api'));
  const calls = all.filter((f) => /tracked\(new OpenAI|askJson\(|ingestTextFile\(|modelClient\(|chooseModel\(|chooseAuxModel\(/.test(readFileSync(f, 'utf8')));
  const GATE = /const sleep = await sleepGate\(req, userId[^)]*\);\s*if \(sleep\.refuse\) return sleep\.refuse;\s*if \(sleep\.meter\) meterFor\(sleep\.meter\);/;
  const REST = /if \(await restingNow\(req, userId\)\)/;
  // not made for a person: the upstream health check; Socria One only, refused to a trial account before any model: transcription
  const exempt = ['health/upstream', 'transcribe'];
  const loose = calls.filter((f) => !exempt.some((x) => f.includes(x)) && !GATE.test(readFileSync(f, 'utf8')) && !REST.test(readFileSync(f, 'utf8')));
  ok(`every route that calls a model for the person checks the trial first (${calls.length})`, calls.length >= 18 && loose.length === 0, loose.map((f) => f.replace(root, '')));
  const upkeep = calls.filter((f) => REST.test(readFileSync(f, 'utf8'))).map((f) => f.replace(root, ''));
  ok('  the two that only do our upkeep rest while the account does, and are never metered', upkeep.length === 2 && upkeep.every((f) => /extract-memory|update-understanding/.test(f)) && upkeep.every((f) => !/meterFor\(/.test(readFileSync(join(root, f), 'utf8'))), upkeep);
  const unwrapped = all.filter((f) => /meterFor\(/.test(readFileSync(f, 'utf8')) && !/export const POST = withMeter\(async function POST\(/.test(readFileSync(f, 'utf8')));
  ok('  every metered route runs in a context of its own (withMeter), so its account can never reach another request', unwrapped.length === 0, unwrapped.map((f) => f.replace(root, '')));
  const answered = calls.filter((f) => GATE.test(readFileSync(f, 'utf8')) && !/sleepAnswer\(e\)/.test(readFileSync(f, 'utf8')));
  ok('  and every metered route answers a call refused mid-request as resting, never as a failure', answered.length === 0, answered.map((f) => f.replace(root, '')));
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
  ok('  today’s tokens and the trial are read from the server, the same on every device', /if \(json && 'sleep' in json\) setSleep\(/.test(app) && /if \(json && 'trial' in json\)/.test(app));
}

console.log('\n=== the week no longer drives the gate ===');
{
  const code = (f) => readFileSync(join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
  const gate = code('lib/sleep-server.ts');
  const fromSleep = [...gate.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'\.\/sleep'/g)].map((m) => m[1]).join(',');
  ok(
    'the gate takes none of the week’s arithmetic from lib/sleep.ts: no weekKey, weeklyLimit, WEEKLY_TOKENS, weekStart, resetAt or sleepState',
    fromSleep.length > 0 && !/\b(weekKey|weeklyLimit|WEEKLY_TOKENS|weekStart|resetAt|sleepState|RESET_WORDS|SLEEP_NOTE)\b/.test(fromSleep) && !/import\s*\*\s*as\s*\w+\s*from\s*'\.\/sleep'/.test(gate),
    fromSleep
  );
  ok('  nor reads the weekly switch (SOCRIA_FREE_WEEKLY_TOKENS): the trial’s own are what move it', !/SOCRIA_FREE_WEEKLY_TOKENS/.test(gate) && !/SOCRIA_FREE_WEEKLY_TOKENS/.test(code('lib/trial-server.ts')) && !/SOCRIA_FREE_WEEKLY_TOKENS/.test(code('lib/trial.ts')) && /SOCRIA_TRIAL_DAILY_TOKENS/.test(code('lib/trial.ts')) && /trialLimits\(process\.env\)/.test(code('lib/trial-server.ts')));
  ok('  its period is the trial’s day: the meter is scoped to dayKey(now), and a refused hold reports period day', /scope: dayKey\(now\)/.test(gate) && /period: 'day'/.test(gate) && /stateOf: \(used: number, limit: number, at: number\) => dayState\(used, limit, at\)/.test(gate));
  const week = code('lib/sleep.ts');
  ok('  the week’s own words stay the week’s: lib/sleep.ts says nothing of a day', !/\b(today|tomorrow|tonight|midnight)\b|today’s|no daily limit|trial tokens/i.test(week));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
