// The trial's counts, end to end, through the real routes (November 9, 2026).
//
// There is no free tier any more. An account that is not on Socria One has a seven-day trial
// (lib/trial.ts): 4,000 tokens a UTC day, 28,000 in all, held on the server by lib/sleep-server.ts and
// proved in test/trial.test.mjs. Beside the tokens, the trial's counts are Socria One's own fair-use
// ceilings (lib/entitlements.ts) — the monthly allowances that were the free tier (October 31, 2026:
// three conversations, two Logic Maps, ten nodes, two artifacts, one document a month) are lifted:
//
//                         Trial                    Socria One
//   Conversations         400 a month (fair use)   400 a month (fair use)
//   Logic Maps            not counted              not counted
//   Logic Map nodes       not counted              not counted
//   Artifacts             not counted              not counted
//   Documents             not counted              not counted
//   Research              120 a conversation       120 a conversation
//   Images read           60 a conversation        60 a conversation
//   Socria Voice          —                        included
//   Sharing a chat        —                        included
//
// The routes are the real ones, bundled from app/api, against the in-memory
// database with the usage functions supplied (scripts/dev/usage-functions.mjs —
// the same semantics as supabase/freemium.sql), a Clerk that knows these
// people, and a scripted model that records every call. What is proved is what
// a person meets: the old monthly numbers no longer stop a trial account; the
// fair-use ceilings still do, on both plans, at the number in the table, before
// the model is asked and without offering Socria One (it stops in the same
// place); a conversation is charged once however often it is sent; nothing
// already made is taken away; what is still counted is paused, never let
// through, when its count cannot be read; Voice and sharing are Socria One's;
// and none of the old ways to Socria One without paying for it — a
// complimentary grant, a comped account, a redeemed code, promotional time —
// opens anything any more.
//
//   liam   trial — conversations: past the old three, and the fair-use ceiling of 400
//   oscar  Socria One (the operator's allowlist) — the same ceiling of 400
//   fiona  trial — a Core conversation is one of the month's conversations
//   mira   trial — Logic Maps and their nodes, not counted
//   dina   trial — a drawing, drawn whole whatever the month's nodes were
//   eve    trial — a drawing with room; an unasked subject is not drawn
//   nina   trial — a new conversation's map, whatever the page sends
//   pia    trial — map passes that name no conversation
//   otto   trial — a map saved before; a new one beside it
//   hana   trial — maps begun by hand
//   pete   trial — with the usage table missing, what is counted is paused, never lifted
//   rita   trial — the per-conversation ceilings: Research and images
//   ada    trial — artifacts, by the save
//   dora   trial — documents
//   vic    trial — Voice and sharing
//   carl   trial, with a complimentary grant and a comp row from before
//   olga   Socria One (the operator's allowlist)
//   paula  Socria One (a paid Stripe subscription)
//   owen   Socria One (the operator's permanent grant, by a verified address)
//   uma    trial — the same address, never verified

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as T from './.tmp/docs-under-test.mjs';
import * as I from './.tmp/inline-under-test.mjs';
import { usageFunctions } from '../scripts/dev/usage-functions.mjs';
import { systemOf } from './helpers/prompt.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-free-limits');
const H = (f) => join(here, 'helpers', f);

const ROUTES = {
  chat: 'app/api/chat/route.ts',
  logos: 'app/api/logos/chat/route.ts',
  map: 'app/api/logos/map/route.ts',
  usage: 'app/api/logos/usage/route.ts',
  plan: 'app/api/logos/plan/route.ts',
  allowance: 'app/api/logos/allowance/route.ts',
  redeem: 'app/api/logos/redeem/route.ts',
  conversations: 'app/api/conversations/route.ts',
  share: 'app/api/share/route.ts',
  accept: 'app/api/share/accept/route.ts',
  room: 'app/api/logos/room/route.ts',
  transcribe: 'app/api/transcribe/route.ts',
  read: 'app/api/files/read/route.ts',
  explore: 'app/api/logos/explore/route.ts',
  readImage: 'app/api/logos/read/route.ts',
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const swap = {
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
};
await Promise.all(
  Object.entries(ROUTES).map(([name, file]) =>
    build({
      entryPoints: [join(root, file)],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: join(OUT, `${name}.mjs`),
      tsconfig: join(root, 'tsconfig.json'),
      plugins: [swap],
      external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', '@vercel/functions', 'unpdf'],
      logLevel: 'error',
    })
  )
);

const quiet = () => {};
console.info = quiet;
console.warn = quiet;
console.error = quiet;
process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.SHARE_SECRET = 'test-share-secret';
process.env.SOCRIA_ONE_USER_IDS = 'olga,oscar';
// owen and uma: the operator's permanent grant is the SHA-256 of a verified address (lib/socria-one-grant.ts);
// a deployment may add hashes in SOCRIA_ONE_GRANT_HASHES, which is how a test lists one without a real address
process.env.SOCRIA_ONE_GRANT_HASHES = (await import('node:crypto')).createHash('sha256').update('owen@example.com').digest('hex');
// ask whether the usage table exists on every request: the suite takes it away and puts it back
process.env.USAGE_STORE_MEMO_MS = '0';
// The trial's tokens (4,000 a UTC day, 28,000 in all — lib/trial.ts, held by lib/sleep-server.ts) are
// test/trial.test.mjs's to prove. This suite is about the counts beside them, and its scripted model
// reports no usage, so every call is counted at an estimate: the day and the trial are moved out of
// reach here (the environment's own switches), so no person meets them while the counts are proved.
process.env.SOCRIA_TRIAL_DAILY_TOKENS = '2000000000';
process.env.SOCRIA_TRIAL_TOTAL_TOKENS = '2000000000';

const load = (n) => import(pathToFileURL(join(OUT, `${n}.mjs`)).href);
const R = Object.fromEntries(await Promise.all(Object.keys(ROUTES).map(async (k) => [k, await load(k)])));
const { db } = await import(pathToFileURL(H('fake-supabase.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));

const as = (uid) => {
  globalThis.__uid = uid;
};
const call = async (handler, method, url, body, opts = {}) => {
  const req = new NextRequest(`http://localhost${url}`, {
    method,
    headers: opts.form ? {} : { 'content-type': 'application/json' },
    ...(opts.form ? { body: opts.form } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const r = await handler(req);
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, text, headers: r.headers };
};

db.reset();
const fns = usageFunctions(db.rows('logos_usage'));
for (const [name, fn] of Object.entries(fns)) db.rpcs[name] = (args) => ({ data: fn(args), error: null });
const month = new Date().toISOString().slice(0, 7);
const count = (uid, counter) => db.rows('logos_usage').find((x) => x.user_id === uid && x.scope === month && x.counter === counter)?.n ?? 0;
const streams = () => (globalThis.__logosCalls ?? []).filter((p) => p.stream).length;
// A chat turn leaves work running after it answers (memory, the turn's ledger) that may call the
// model later; wait until nothing has called it for a moment, so a scripted map pass gets its own answer.
const settle = async () => {
  let n = -1;
  while (n !== (globalThis.__logosCalls ?? []).length) {
    n = (globalThis.__logosCalls ?? []).length;
    await new Promise((r) => setTimeout(r, 150));
  }
};
const passes = () => (globalThis.__logosCalls ?? []).filter((p) => !p.stream).length;

globalThis.__users = Object.fromEntries(
  ['liam', 'oscar', 'fiona', 'mira', 'ada', 'dora', 'vic', 'nina', 'pia', 'otto', 'hana', 'pete', 'rita', 'olga', 'paula'].map((u) => [u, { firstName: u[0].toUpperCase() + u.slice(1), emails: [`${u}@example.com`] }])
);
// carl: a complimentary grant on the account, and a comp row, from before
globalThis.__users.carl = { firstName: 'Carl', emails: ['carl@example.com'], privateMetadata: { socriaOne: 'comp' } };
db.rows('socria_subscriptions').push({ user_id: 'carl', customer_id: 'comp_carl', subscription_id: 'comp_carl', status: 'comp', current_period_end: null, price_id: null, cancel_at_period_end: false, updated_at: Date.now() });
// owen: the operator's permanent grant, by his verified address; uma: the same address, never verified
globalThis.__users.owen = { firstName: 'Owen', emails: ['Owen@Example.com '] };
globalThis.__users.uma = { firstName: 'Uma', emails: ['owen@example.com'], unverified: ['owen@example.com'] };
// paula: a paid Stripe subscription
db.rows('socria_subscriptions').push({ user_id: 'paula', customer_id: 'cus_paula', subscription_id: 'sub_paula', status: 'active', current_period_end: Math.floor(Date.now() / 1000) + 20 * 86400, price_id: 'price_one', cancel_at_period_end: false, updated_at: Date.now() });

const turns = (n) => {
  const out = [];
  for (let i = 0; i < n - 1; i++) out.push({ role: 'user', content: `Earlier thought ${i}` }, { role: 'assistant', content: 'Noted.' });
  out.push({ role: 'user', content: 'And what about this?' });
  return out;
};
const logos = (sessionId, userTurns = 1, extra = {}) => call(R.logos.POST, 'POST', '/api/logos/chat', { surface: 'logos5', sessionId, messages: turns(userTurns), ...extra });
const core = (conversationId, userTurns = 1) => call(R.chat.POST, 'POST', '/api/chat', { model: 'core-4', conversationId, messages: turns(userTurns) });

/** What a note at a fair-use ceiling must never do: offer Socria One, which stops in the same place. */
const SELLS_ONE = /Unlock unlimited access with Socria One|Upgrade to Socria One|Socria One (gives|opens|lets|lifts|keeps|reads|grounds)/;
const chatCount = (uid, sessionId, counter) => db.rows('logos_usage').find((x) => x.user_id === uid && x.scope === `chat:${sessionId}` && x.counter === counter)?.n ?? 0;
const marks = (uid, prefix) => db.rows('logos_usage').filter((x) => x.user_id === uid && x.scope.startsWith(prefix)).length;

console.log('\n=== conversations: the old three a month no longer stop a trial ===');
as('liam');
globalThis.__logosReply = 'Noted.';
const opened = [];
for (let k = 1; k <= 4; k++) opened.push(await logos(`s${k}`));
ok('four conversations begun — past the old three — and every one answered', opened.every((r) => r.status === 200), opened.map((r) => `${r.status} ${r.text.slice(0, 120)}`).join(' | '));
ok('  the fourth with no boundary said and nothing raised for Socria One', !opened[3].json?.upgrade && !opened[3].headers.get('X-Socria-Limit'));
ok('  each counted once, toward the month’s fair-use ceiling', count('liam', 'chats') === 4, String(count('liam', 'chats')));
const back = await logos('s3', 4);
ok('going back to a conversation already begun costs nothing', back.status === 200 && count('liam', 'chats') === 4, back.text);
let long = true;
for (let k = 2; k <= 16; k++) long = long && (await logos('s1', k)).status === 200;
ok('no daily count of messages: fifteen more turns in one conversation, all answered', long);
ok('  and none of them is counted as a conversation', count('liam', 'chats') === 4);
ok('a first turn sent again is not a second conversation', (await logos('s2', 1)).status === 200 && count('liam', 'chats') === 4);
const gift = await logos('s12', 1, { firstThought: true });
ok('onboarding’s "first thought" is no longer a gift: answered, and counted like any other conversation', gift.status === 200 && count('liam', 'chats') === 5 && !gift.headers.get('X-Socria-First-Thought'), gift.text);

console.log('\n=== Socria One’s fair-use ceiling on conversations holds on both plans ===');
// 400 new conversations a month: far past any person's month, a guard against a script — and the trial's
// as well as Socria One's (lib/entitlements.ts), so the note at it offers nothing to buy.
db.rows('logos_usage').find((x) => x.user_id === 'liam' && x.scope === month && x.counter === 'chats').n = 399;
const fourHundredth = await logos('s-400');
ok('the 400th conversation of a month is answered', fourHundredth.status === 200 && count('liam', 'chats') === 400, fourHundredth.text.slice(0, 200));
let before = streams();
const over = await logos('s-401');
const overNote = over.json?.error ?? '';
ok('the 401st is refused at the ceiling, at the count in the table, before the model is asked', over.status === 402 && over.json?.used === 400 && over.json?.limit === 400 && streams() === before, over.text);
ok('  saying the ceiling is shared and every conversation stays open — never offering Socria One', /same place/.test(overNote) && /stays open/.test(overNote) && !SELLS_ONE.test(overNote), overNote);
ok('  and at the ceiling every conversation already begun goes on', (await logos('s1', 17)).status === 200 && count('liam', 'chats') === 400);
as('oscar');
db.rows('logos_usage').push({ id: `oscar|${month}|chats`, user_id: 'oscar', scope: month, counter: 'chats', n: 400, updated_at: Date.now() });
before = streams();
const oneOver = await logos('o-401');
ok('Socria One meets the same ceiling at the same number, before the model is asked', oneOver.status === 402 && oneOver.json?.used === 400 && oneOver.json?.limit === 400 && streams() === before, oneOver.text);
ok('  and is never sold what it already has', !SELLS_ONE.test(oneOver.json?.error ?? ''), oneOver.json?.error);
ok('  its conversations already begun go on', (await logos('o-old', 3)).status === 200);

console.log('\n=== Core and Logos share the month ===');
as('fiona');
for (let k = 1; k <= 2; k++) await logos(`f${k}`);
const c1 = await core('core-1');
ok('a Core conversation is answered — and is one of the month’s conversations', c1.status === 200 && count('fiona', 'chats') === 3, `${c1.status} ${count('fiona', 'chats')}`);
const c2 = await core('core-2');
ok('the next, in Core — a fourth, past the old three — is answered too', c2.status === 200 && count('fiona', 'chats') === 4, `${c2.status} ${count('fiona', 'chats')} ${c2.text.slice(0, 200)}`);
ok('  no Core counters are written any more', !db.rows('logos_usage').some((x) => x.user_id === 'fiona' && /^core-/.test(x.counter)));
ok('a Core conversation going on costs nothing', (await core('core-1', 3)).status === 200 && count('fiona', 'chats') === 4);
db.rows('logos_usage').find((x) => x.user_id === 'fiona' && x.scope === month && x.counter === 'chats').n = 400;
const coreOver = await core('core-3');
ok('Core meets the same fair-use ceiling — one count of conversations, wherever they begin', coreOver.status === 402 && coreOver.json?.limit === 400 && /same place/.test(coreOver.json?.error ?? '') && !SELLS_ONE.test(coreOver.json?.error ?? ''), coreOver.text.slice(0, 300));

console.log('\n=== Logic Maps and their nodes: not counted on the trial ===');
await settle();
as('mira');
const N = (ids) => ids.map((id) => ({ id, type: 'claim', label: `Idea ${id}`, status: 'open' }));
const extraction = (ids, edges = []) => ({ context: 'reflecting', nodes: N(ids), edges });
const map = (sessionId, current, script, messages = [{ role: 'user', content: 'I think rent is too high. Moving might help. Or a roommate.' }]) => {
  globalThis.__logosScript = [script];
  return call(R.map.POST, 'POST', '/api/logos/map', { sessionId, messages, map: current });
};
const EMPTY = { nodes: [], edges: [] };
const m1 = await map('m1', EMPTY, extraction(['a', 'b', 'c']));
ok('a first Logic Map is drawn: three nodes kept', m1.status === 200 && m1.json?.map?.nodes?.length === 3, m1.text.slice(0, 300));
ok('  and nothing is counted: no map, no node, no marker', count('mira', 'maps') === 0 && count('mira', 'nodes') === 0 && marks('mira', 'mapmark:') === 0, `${count('mira', 'maps')} ${count('mira', 'nodes')} ${marks('mira', 'mapmark:')}`);
const m2 = await map('m2', EMPTY, extraction(['d', 'e', 'f', 'g']));
ok('a second map: four more nodes', m2.status === 200 && m2.json?.map?.nodes?.length === 4);
before = passes();
const m3 = await map('m3', EMPTY, extraction(['x']));
ok('a third conversation’s map — past the old two — is drawn', m3.status === 200 && !m3.json?.upgrade && JSON.stringify(m3.json?.map?.nodes?.map((n) => n.id)) === '["x"]' && passes() === before + 1, m3.text.slice(0, 300));
const grow = await map('m1', m1.json.map, extraction(['a', 'b', 'c', 'h', 'i', 'j', 'k', 'l'], [{ from: 'a', to: 'h', relation: 'relates' }, { from: 'c', to: 'l', relation: 'relates' }]));
const kept = (grow.json?.map?.nodes ?? []).map((n) => n.id);
ok('a map already drawn keeps growing past the old ten nodes a month: all five new kept (the 9th to the 13th)', grow.status === 200 && kept.length === 8 && ['h', 'i', 'j', 'k', 'l'].every((id) => kept.includes(id)), JSON.stringify(kept));
ok('  every connection kept with them', (grow.json?.map?.edges ?? []).some((e) => e.to === 'h') && (grow.json?.map?.edges ?? []).some((e) => e.to === 'l'), JSON.stringify(grow.json?.map?.edges));
ok('  and no allowance is said to have stopped it', !grow.json?.limit, JSON.stringify(grow.json?.limit));
const still = await map('m1', grow.json.map, extraction(['a', 'b', 'c', 'h', 'i', 'j', 'k', 'l', 'z']));
ok('and on: a fourteenth node is kept, every node it had stays', still.status === 200 && still.json?.map?.nodes?.length === 9 && still.json.map.nodes.some((n) => n.id === 'z') && count('mira', 'nodes') === 0, JSON.stringify(still.json?.map?.nodes?.map((n) => n.id)));
const hand = await call(R.allowance.POST, 'POST', '/api/logos/allowance', { counter: 'nodes' });
ok('a node added by hand is allowed, and not counted', hand.status === 200 && hand.json?.limit === null, hand.text);
as('olga');
const oneMap = await map('o1', EMPTY, extraction(Array.from({ length: 14 }, (_, k) => `n${k}`)));
ok('Socria One: a map of fourteen nodes, kept whole, nothing counted', oneMap.status === 200 && oneMap.json?.map?.nodes?.length === 14 && count('olga', 'nodes') === 0 && count('olga', 'maps') === 0);

console.log('\n=== a drawing on the trial is drawn whole, whatever the month’s nodes were ===');
// THE LOGIC MAP DRAWS (Logos 5, lib/quota-map.ts keepAddedNodes): a drawing is kept whole or not at all where
// nodes are counted. On the trial they are not, so a drawing is never held back by a count of nodes — even
// for an account that drew nine of the old ten before the trial.
for (const u of ['dina', 'eve']) globalThis.__users[u] = { firstName: u[0].toUpperCase() + u.slice(1), emails: [`${u}@example.com`] };
as('dina');
db.rows('logos_usage').push({ id: `dina|${month}|nodes`, user_id: 'dina', scope: month, counter: 'nodes', n: 9, updated_at: Date.now() });
const stageOf = (id, label) => ({ id, type: 'process', label, status: 'open', origin: 'drawn', role: 'stage' });
const WATERMAP = {
  context: 'learning',
  title: 'The water cycle',
  nodes: [stageOf('ev', 'Evaporation'), stageOf('co', 'Condensation'), stageOf('pr', 'Precipitation'), stageOf('cl', 'Collection')],
  edges: [{ from: 'ev', to: 'co', relation: 'leads_to' }, { from: 'co', to: 'pr', relation: 'leads_to' }, { from: 'pr', to: 'cl', relation: 'leads_to' }, { from: 'cl', to: 'ev', relation: 'leads_to' }],
};
const drawItAsk = [{ role: 'user', content: 'Draw the water cycle.' }];
const dLeft = await map('dLeft', EMPTY, WATERMAP, drawItAsk);
ok('nine of the old ten used and a drawing of four: all of it is drawn, with its title', dLeft.status === 200 && (dLeft.json?.map?.nodes ?? []).length === 4 && dLeft.json.map.title === 'The water cycle', dLeft.text.slice(0, 300));
ok('  no allowance is said to have stopped it, and nothing is counted', !dLeft.json?.limit && count('dina', 'maps') === 0 && count('dina', 'nodes') === 9, `${JSON.stringify(dLeft.json?.limit)} ${count('dina', 'maps')} ${count('dina', 'nodes')}`);
const theirsDrawn = { ...WATERMAP, nodes: [{ id: 'q', type: 'question', label: 'Why does it rain so much here?', status: 'open' }, ...WATERMAP.nodes] };
const dMine = await map('dMine', EMPTY, theirsDrawn, [{ role: 'user', content: 'Why does it rain so much here? Draw the water cycle.' }]);
ok('their own question and a drawing: both kept, whole', dMine.status === 200 && JSON.stringify((dMine.json?.map?.nodes ?? []).map((x) => x.id)) === '["q","ev","co","pr","cl"]' && !dMine.json?.limit, dMine.text.slice(0, 300));
as('eve');
const eFits = await map('eFits', EMPTY, WATERMAP, drawItAsk);
ok('with room, the whole drawing is drawn, and nothing counted', eFits.status === 200 && (eFits.json?.map?.nodes ?? []).length === 4 && eFits.json.map.title === 'The water cycle' && !eFits.json.limit && count('eve', 'maps') === 0 && count('eve', 'nodes') === 0, eFits.text.slice(0, 300));
// UNASKED, A SUBJECT IS DRAWN FOR SOCRIA ONE AND A GUEST — a trial account's tokens are not spent on it
const mapToldOf = () => JSON.stringify((globalThis.__logosCalls ?? []).filter((p) => !p.stream).at(-1)?.messages ?? []);
let passesBefore = passes();
await map('e2', eFits.json.map, { ...WATERMAP }, [{ role: 'user', content: 'explain the water cycle' }]);
ok('a trial account asking about a subject with a shape: the map pass runs, and is not told to draw it', passes() === passesBefore + 1 && !mapToldOf().includes("THIS TURN'S SUBJECT"), `${passes() - passesBefore} ${mapToldOf().slice(-300)}`);
as('olga');
passesBefore = passes();
await map('o2', EMPTY, { ...WATERMAP }, [{ role: 'user', content: 'explain the water cycle' }]);
ok('Socria One asking the same: the map pass is told the subject has a shape to draw', passes() === passesBefore + 1 && mapToldOf().includes("THIS TURN'S SUBJECT"), `${passes() - passesBefore} ${mapToldOf().slice(-300)}`);

console.log('\n=== a new conversation\'s map: drawn, whatever the page sends, and never counted ===');
// The bug once reported on the free plan: the page can send a map with a new conversation's id — the
// previous conversation's, in the moment after switching. With maps not counted on the trial, what the
// page sends can neither spend a map nor stop one: every pass is drawn, and nothing is written.
as('nina');
const n1 = await map('n1', EMPTY, extraction(['a', 'b']));
const n2 = await map('n2', EMPTY, extraction(['c']));
before = passes();
const stale = await map('n3', n2.json?.map ?? EMPTY, extraction(['c', 'd']));
ok('three maps — the third sent with the previous conversation\'s map — all drawn, the model asked for it', n1.status === 200 && n2.status === 200 && stale.status === 200 && passes() === before + 1 && (stale.json?.map?.nodes ?? []).length === 2, `${n1.status} ${n2.status} ${stale.text.slice(0, 200)}`);
const anon = await call(R.map.POST, 'POST', '/api/logos/map', { messages: [{ role: 'user', content: 'A thought.' }], map: EMPTY });
ok('  a map pass that names no conversation is drawn like any other', anon.status === 200 && !anon.json?.upgrade, anon.text.slice(0, 200));
ok('  and nothing is counted or marked', count('nina', 'maps') === 0 && count('nina', 'nodes') === 0 && marks('nina', 'mapmark:') === 0);
as('pia');
const p1 = await map(undefined, EMPTY, extraction(['a']));
const p2 = await map(undefined, p1.json?.map ?? EMPTY, extraction(['a', 'b']));
const p3 = await map(undefined, p2.json?.map ?? EMPTY, extraction(['a', 'b', 'c']));
ok('without a conversation, a third pass — past the old two maps — is drawn too, and none is counted', [p1, p2, p3].every((r) => r.status === 200) && (p3.json?.map?.nodes ?? []).length === 3 && count('pia', 'maps') === 0, `${p1.status} ${p2.status} ${p3.status} ${count('pia', 'maps')}`);
as('olga');
const oneStale = await map('o9', n2.json?.map ?? EMPTY, extraction(['c', 'd']));
ok('Socria One is not counted, whatever it sends', oneStale.status === 200 && count('olga', 'maps') === 0);

console.log('\n=== a map saved before keeps growing; a new one beside it is drawn ===');
as('otto');
db.rows('conversations').push({ id: 'old-1', user_id: 'otto', title: 'Before the trial', messages: [], map: { nodes: N(['p', 'q']), edges: [] }, updated_at: Date.now() });
// the old free plan's two maps, used this month before the trial began
db.rows('logos_usage').push({ id: `otto|${month}|maps`, user_id: 'otto', scope: month, counter: 'maps', n: 2, updated_at: Date.now() });
const grows = await map('old-1', { nodes: N(['p', 'q']), edges: [] }, extraction(['p', 'q', 'r']));
ok('a conversation saved with a map grows: everything it had, and the new node', grows.status === 200 && JSON.stringify((grows.json?.map?.nodes ?? []).map((n) => n.id)) === '["p","q","r"]' && count('otto', 'maps') === 2 && count('otto', 'nodes') === 0, grows.text.slice(0, 300));
before = passes();
const fresh = await map('new-1', EMPTY, extraction(['x']));
ok('a new conversation, with the old month\'s two maps used, is drawn — the old count refuses nothing', fresh.status === 200 && !fresh.json?.upgrade && (fresh.json?.map?.nodes ?? []).length === 1 && passes() === before + 1, fresh.text.slice(0, 200));

console.log('\n=== maps begun by hand ===');
as('hana');
const byHand = (sessionId, newMap = true) => call(R.allowance.POST, 'POST', '/api/logos/allowance', { counter: 'nodes', n: 1, sessionId, newMap });
const hs = [await byHand('h1'), await byHand('h1'), await byHand('h2'), await byHand('h3')];
ok('cards added by hand in three conversations — past the old two maps — are all allowed', hs.every((r) => r.status === 200), hs.map((r) => r.text).join(' | '));
ok('  and none of it is counted', count('hana', 'maps') === 0 && count('hana', 'nodes') === 0 && marks('hana', 'mapmark:') === 0);

console.log('\n=== with the usage table missing, what is counted is paused — never lifted ===');
db.absent.add('logos_usage');
as('pete');
before = streams();
const paused = await logos('p1');
ok('a trial conversation is paused, not let through uncounted: 503, said plainly', paused.status === 503 && paused.json?.unavailable === true && /can’t be checked right now/.test(paused.json?.error ?? ''), paused.text.slice(0, 300));
ok('  offering nothing — it is a fault, not a limit — and before the model is asked', !paused.json?.upgrade && streams() === before);
before = passes();
const pausedMap = await map('p1', EMPTY, extraction(['a']));
ok('a trial map pass is paused the same way (the trial cannot be read), before any model is asked', pausedMap.status === 503 && pausedMap.json?.unavailable === true && passes() === before, pausedMap.text.slice(0, 200));
// a card added by hand asks no model and is counted on neither plan: there is nothing to pause
const pausedHand = await call(R.allowance.POST, 'POST', '/api/logos/allowance', { counter: 'nodes', n: 1, sessionId: 'p2', newMap: true });
ok('  a card added by hand — no model, nothing counted — still goes on', pausedHand.status === 200 && pausedHand.json?.limit === null, pausedHand.text);
as('olga');
const onePaused = await logos('o-missing');
ok('Socria One is never paused by it', onePaused.status === 200, onePaused.text.slice(0, 200));
db.absent.delete('logos_usage');
await settle();

console.log('\n=== the per-conversation ceilings refuse on both plans: Research 120, images 60 ===');
// Fair use held in common (lib/entitlements.ts): a guard against a runaway loop, met at the number in the
// table, before any model is asked — and never sold past, since Socria One stops in the same place.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const seed = (uid, sessionId, counter, n) => db.rows('logos_usage').push({ id: `${uid}|chat:${sessionId}|${counter}`, user_id: uid, scope: `chat:${sessionId}`, counter, n, updated_at: Date.now() });
const research = (sessionId) => call(R.explore.POST, 'POST', '/api/logos/explore', { label: 'Rent control', type: 'claim', mode: 'research', sessionId, messages: [{ role: 'user', content: 'Does rent control work?' }] });
const readImage = (sessionId) => call(R.readImage.POST, 'POST', '/api/logos/read', { image: PNG, sessionId });
for (const [who, plan] of [['rita', 'the trial'], ['oscar', 'Socria One']]) {
  as(who);
  seed(who, 'rr', 'research', 120);
  let calls = (globalThis.__logosCalls ?? []).length;
  const r = await research('rr');
  ok(`${plan}: the 121st Research in a conversation is refused at the table’s 120, before any model is asked`, r.status === 402 && r.json?.upgrade === 'research' && r.json?.used === 120 && r.json?.limit === 120 && (globalThis.__logosCalls ?? []).length === calls, r.text.slice(0, 300));
  ok(`  ${plan}: said as fair use, never offering Socria One`, /same place/.test(r.json?.error ?? '') && !SELLS_ONE.test(r.json?.error ?? ''), r.json?.error);
  seed(who, 'ri', 'images', 60);
  calls = (globalThis.__logosCalls ?? []).length;
  const i = await readImage('ri');
  ok(`${plan}: the 61st image read in a conversation is refused at the table’s 60, before any model is asked`, i.status === 402 && i.json?.upgrade === 'images' && i.json?.used === 60 && i.json?.limit === 60 && (globalThis.__logosCalls ?? []).length === calls, i.text.slice(0, 300));
  ok(`  ${plan}: said as fair use, never offering Socria One`, /same place/.test(i.json?.error ?? '') && !SELLS_ONE.test(i.json?.error ?? ''), i.json?.error);
  seed(who, 'ri59', 'images', 59);
  const i60 = await readImage('ri59');
  ok(`  ${plan}: the 60th is not refused, and is counted`, i60.status !== 402 && chatCount(who, 'ri59', 'images') === 60, `${i60.status} ${chatCount(who, 'ri59', 'images')} ${i60.text.slice(0, 200)}`);
  ok(`  ${plan}: a ceiling in one conversation is not met in the next`, (await readImage('ri-next')).status !== 402 && chatCount(who, 'ri-next', 'images') === 1);
}
await settle();

console.log('\n=== artifacts: not counted on the trial, held at the save ===');
as('ada');
// real workspace objects, made the way an element opened in Artifacts is (lib/inline-ui.ts artifactFromSpec)
const chart = (title) => I.artifactFromSpec({ type: 'chart', kind: 'bar', title, x: ['Rent', 'Food', 'Transport'], series: [{ values: [1200, 400, 150] }], basis: 'given' });
const space = (titles) => titles.reduce((sp, t) => { const a = chart(t); const made = I.makeDisplay(sp, a.kind, a.state, 'socria'); return made.ok ? made.space : sp; }, I.EMPTY_SPACE);
const objIds = (sp) => sp.objs.map((o) => o.id);
const save = (id, sp, extra = {}) =>
  call(R.conversations.PUT, 'PUT', '/api/conversations', {
    conversation: { id, title: 'Budget', messages: [{ role: 'user', content: 'My costs' }, { role: 'assistant', content: 'Here.' }], map: { nodes: [], edges: [], objects: sp }, updatedAt: Date.now(), base: null, ...extra },
  });
const two = space(['One', 'Two']);
const three = I.makeDisplay(two, chart('Three').kind, chart('Three').state, 'socria').space;
const s1 = await save('conv-a', two);
ok('two artifacts saved: both kept, nothing counted', s1.status === 200 && !s1.json?.refused && count('ada', 'artifacts') === 0, s1.text);
const third = objIds(three).find((x) => !objIds(two).includes(x));
const s2 = await save('conv-a', three, { base: db.rows('conversations').find((r) => r.id === 'conv-a')?.updated_at ?? null });
const stored = db.rows('conversations').find((r) => r.id === 'conv-a');
const storedObjs = JSON.stringify(stored?.map ?? stored?.memory ?? {});
ok('a third — past the old two — is kept, and nothing is refused', s2.status === 200 && !s2.json?.refused && !!third, s2.text);
ok('  all three are in what was stored', objIds(three).every((x) => storedObjs.includes(`"${x}"`)), storedObjs.slice(0, 300));
ok('  and none is counted or marked', count('ada', 'artifacts') === 0 && marks('ada', 'artmark:') === 0);
as('paula');
const ps = await save('conv-p', space(['A', 'B', 'C', 'D']));
ok('Socria One (a paid subscription): four artifacts, all kept, nothing counted', ps.status === 200 && !ps.json?.refused && count('paula', 'artifacts') === 0, ps.text);

console.log('\n=== documents: not counted on the trial ===');
as('dora');
const { doc } = await T.readDocument('report.md', Buffer.from('# Q3 report\n\nRevenue rose 12% on the quarter.\n\nCosts held flat.'));
const { doc: other } = await T.readDocument('notes.txt', Buffer.from('Second document.\n\nThe launch moved to March.'));
const attach = (d) => ({ kind: 'doc', name: d.name, doc: d.id, text: T.renderDocAsNote(d, 24000).text, pages: d.pageCount, format: d.format, origin: 'source' });
const withDoc = (sessionId, d, n = 1) => call(R.logos.POST, 'POST', '/api/logos/chat', { surface: 'logos5', sessionId, messages: [{ role: 'user', content: 'What does this say?', attachments: [attach(d)] }, ...turns(n).slice(1)], docs: [d] });
const d1 = await withDoc('d1', doc);
ok('a first document brought into a conversation: read, and not counted', d1.status === 200 && count('dora', 'documents') === 0, d1.text.slice(0, 200));
ok('  carried on later turns, it is read again', (await withDoc('d1', doc, 3)).status === 200 && count('dora', 'documents') === 0);
before = streams();
const d2 = await withDoc('d2', other);
ok('a second document this month — past the old one — is read, and the model asked', d2.status === 200 && streams() === before + 1 && !d2.json?.upgrade, d2.text.slice(0, 300));
const form = new FormData();
form.append('file', new Blob(['Third document'], { type: 'text/plain' }), 'third.txt');
const read = await call(R.read.POST, 'POST', '/api/files/read', undefined, { form });
ok('reading another file is done, and handed back', read.status === 200 && (read.json?.notes ?? []).some((n) => n.name === 'third.txt' && /Third document/.test(n.text)), read.text.slice(0, 200));
globalThis.__logosReply = '# A short history\n\nIt began with a question.';
const wu = await call(R.logos.POST, 'POST', '/api/logos/chat', { surface: 'logos5', sessionId: 'd3', messages: [{ role: 'user', content: 'Make me a study guide on the causes of World War One' }] });
const wuPrompt = (globalThis.__logosCalls ?? []).filter((p) => p.stream).pop();
ok('a write-up asked for is filed in Content, with no limit said', wu.status === 200 && !wu.headers.get('X-Socria-Limit') && systemOf(wuPrompt ?? { messages: [] }).includes('A WRITE-UP, READ IN CONTENT'), `${wu.status} ${wu.headers.get('X-Socria-Limit')}`);
ok('  and no document is counted or marked', count('dora', 'documents') === 0 && marks('dora', 'docmark:') === 0);
globalThis.__logosReply = 'Noted.';

console.log('\n=== Socria Voice and sharing are Socria One ===');
as('vic');
const voice = await call(R.transcribe.POST, 'POST', '/api/transcribe', undefined, { form: new FormData() });
ok('Voice on the trial: refused, with the word the page raises Socria One for', voice.status === 402 && voice.json?.upgrade === 'voice' && /Socria Voice is part of Socria One/.test(voice.json?.error ?? ''), voice.text);
as(null);
ok('  and signed out', (await call(R.transcribe.POST, 'POST', '/api/transcribe', undefined, { form: new FormData() })).status !== 200);
as('olga');
const oneVoice = await call(R.transcribe.POST, 'POST', '/api/transcribe', undefined, { form: new FormData() });
ok('Socria One passes the gate (and is told no recording arrived)', oneVoice.status === 400, oneVoice.text);
as('vic');
await call(R.conversations.PUT, 'PUT', '/api/conversations', { conversation: { id: 'c-vic', title: 'Mine', messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], updatedAt: Date.now() } });
const vshare = await call(R.share.POST, 'POST', '/api/share', { type: 'conversation', id: 'c-vic', action: 'link', role: 'viewer' });
ok('sharing a conversation on the trial: refused', vshare.status === 402 && vshare.json?.upgrade === 'share' && vshare.json?.refusal === 'plan', vshare.text);
ok('  saying sharing is Socria One, and that joining stays open', /Sharing a conversation is part of Socria One/.test(vshare.json?.refusalNote ?? '') && /join what others share/.test(vshare.json?.refusalNote ?? ''), vshare.json?.refusalNote);
const vroom = await call(R.room.POST, 'POST', '/api/logos/room', {});
ok('opening a room on the trial: refused', vroom.status === 402 && vroom.json?.upgrade === 'share', vroom.text);
as('olga');
await call(R.conversations.PUT, 'PUT', '/api/conversations', { conversation: { id: 'c-olga', title: 'Ours', messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], updatedAt: Date.now() } });
const link = await call(R.share.POST, 'POST', '/api/share', { type: 'conversation', id: 'c-olga', action: 'link', role: 'editor' });
ok('Socria One shares by link', link.status === 200 && !!link.json?.link?.token, link.text.slice(0, 200));
as('vic');
const joined = await call(R.accept.POST, 'POST', '/api/share/accept', { token: link.json?.link?.token });
ok('a trial account joins what Socria One shared — joining stays open', joined.status === 200, joined.text.slice(0, 200));

console.log('\n=== no free way to Socria One ===');
as('carl');
const carlPlan = await call(R.plan.GET, 'GET', '/api/logos/plan');
ok('a complimentary grant and a comp row from before no longer open Socria One', carlPlan.json?.plan === 'free', carlPlan.text);
ok('  and no promotional time is reported', !carlPlan.json?.promo, carlPlan.text);
const redeem = await call(R.redeem.POST, 'POST', '/api/logos/redeem', { code: 'ANYTHING-AT-ALL' });
ok('redeeming a code: retired, said plainly', redeem.status === 410 && /no longer offered/.test(redeem.json?.error ?? ''), redeem.text);
ok('  and nothing is written to the account', !db.rows('socria_subscriptions').some((r) => r.user_id === 'carl' && r.status !== 'comp'));
as('paula');
ok('a paid subscription is Socria One', (await call(R.plan.GET, 'GET', '/api/logos/plan')).json?.plan === 'one');
as('owen');
ok('the operator’s permanent grant is Socria One — by a verified address, whatever its case', (await call(R.plan.GET, 'GET', '/api/logos/plan')).json?.plan === 'one');
as('uma');
ok('  the same address unverified opens nothing', (await call(R.plan.GET, 'GET', '/api/logos/plan')).json?.plan === 'free');
{
  const src = (await import('node:fs')).readFileSync(join(root, 'lib/socria-one-grant.ts'), 'utf8');
  const list = src.slice(src.indexOf('export const OPERATOR_GRANTS'), src.indexOf(']);', src.indexOf('export const OPERATOR_GRANTS')));
  ok('  and the permanent list holds hashes, never an address', /'[0-9a-f]{64}'/.test(list) && !/@/.test(list));
}
as(null);
ok('signed out, Logos is a guest’s pass — the typed access key no longer stands in for an account', (await logos('anon-1')).status === 401);

console.log('\n=== the panel reads the same counts the routes refuse at ===');
as('mira');
const panel = await call(R.usage.GET, 'GET', '/api/logos/usage');
const c = panel.json?.counters ?? {};
ok('the old monthly allowances are not counted on the trial: maps, nodes, artifacts and documents have no limit', ['maps', 'nodes', 'artifacts', 'documents'].every((k) => c[k] && c[k].limit === null), JSON.stringify(c));
ok('  conversations carry Socria One’s fair-use ceiling, 400 a month', c.chats?.limit === 400, JSON.stringify(c.chats));
ok('  the per-conversation ceilings are the table’s: Research 120, images 60, files 60', c.research?.limit === 120 && c.images?.limit === 60 && c.files?.limit === 60, JSON.stringify(c));
ok('  and the trial has no daily message limit', c.messages?.limit === null);
as('olga');
const onePanel = await call(R.usage.GET, 'GET', '/api/logos/usage');
const oc = onePanel.json?.counters ?? {};
ok('Socria One: every old allowance unlimited', ['maps', 'nodes', 'artifacts', 'documents'].every((k) => oc[k] && oc[k].limit === null), JSON.stringify(oc));
ok('  and limit for limit the same panel as the trial’s — the counts are held in common', Object.keys(c).length > 0 && Object.keys(c).every((k) => oc[k]?.limit === c[k].limit), JSON.stringify(oc));

console.log(`\nfree-limits-e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
