// The free plan, end to end, through the real routes (October 31, 2026).
//
//                         Free          Socria One
//   Conversations         3 a month     unlimited (fair use)
//   Logic Maps            2 a month     unlimited
//   Logic Map nodes       10 a month    unlimited
//   Artifacts             2 a month     unlimited
//   Documents             1 a month     unlimited
//   Socria Voice          —             included
//   Sharing a chat        —             included
//
// The routes are the real ones, bundled from app/api, against the in-memory
// database with the usage functions supplied (scripts/dev/usage-functions.mjs —
// the same semantics as supabase/freemium.sql), a Clerk that knows these
// people, and a scripted model that records every call. What is proved is what
// a person meets: each boundary arrives where the table says, with its own
// sentence and the word the page raises Socria One for; a refused turn or map
// never reaches the model; nothing is charged twice; nothing already made is
// taken away; and none of the old ways to Socria One without paying for it —
// a complimentary grant, a comped account, a redeemed code, promotional time —
// opens anything any more. Socria One is not counted.
//
//   liam   free — conversations
//   fiona  free — a Core conversation is one of the month's conversations
//   mira   free — Logic Maps and their nodes
//   ada    free — artifacts, by the save
//   dora   free — documents
//   vic    free — Voice and sharing
//   carl   free, with a complimentary grant and a comp row from before
//   nina   free — a new conversation's map is the server's to count, whatever the page sends
//   otto   free — a map saved before these limits keeps growing; a new one is refused
//   hana   free — a map begun by hand is one of the month's maps
//   pete   free — with the usage table missing, the free plan is paused, never lifted
//   olga   Socria One (the operator's allowlist)
//   paula  Socria One (a paid Stripe subscription)
//   owen   Socria One (the operator's permanent grant, by a verified address)
//   uma    free — the same address, never verified

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
process.env.SOCRIA_ONE_USER_IDS = 'olga';
// owen and uma: the operator's permanent grant is the SHA-256 of a verified address (lib/socria-one-grant.ts);
// a deployment may add hashes in SOCRIA_ONE_GRANT_HASHES, which is how a test lists one without a real address
process.env.SOCRIA_ONE_GRANT_HASHES = (await import('node:crypto')).createHash('sha256').update('owen@example.com').digest('hex');
// ask whether the usage table exists on every request: the suite takes it away and puts it back
process.env.USAGE_STORE_MEMO_MS = '0';
// The usage functions supplied below include the week of tokens' (Sleep Mode, test/sleep.test.mjs holds
// it): this suite is about the monthly allowances, and its scripted model reports no usage, so every
// call is counted at an estimate — a week no person here should reach while the months are proved.
process.env.SOCRIA_FREE_WEEKLY_TOKENS = '2000000000';

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
  ['liam', 'fiona', 'mira', 'ada', 'dora', 'vic', 'nina', 'otto', 'hana', 'pete', 'olga', 'paula'].map((u) => [u, { firstName: u[0].toUpperCase() + u.slice(1), emails: [`${u}@example.com`] }])
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

console.log('\n=== conversations: three a month ===');
as('liam');
globalThis.__logosReply = 'Noted.';
for (let k = 1; k <= 3; k++) {
  const r = await logos(`s${k}`);
  if (r.status !== 200) ok(`conversation ${k} of 3 is answered`, false, r.text);
}
ok('three conversations begun, three counted', count('liam', 'chats') === 3, String(count('liam', 'chats')));
let before = streams();
const eleventh = await logos('s4');
ok('the fourth is refused, with the word the page raises Socria One for', eleventh.status === 402 && eleventh.json?.upgrade === 'chats', eleventh.text);
ok('  and the boundary’s own sentence: three this month, every one still open, Socria One', /3 free conversations this month/.test(eleventh.json?.error ?? '') && /stays open/.test(eleventh.json?.error ?? '') && /Unlock unlimited access with Socria One/.test(eleventh.json?.error ?? ''), eleventh.json?.error);
ok('  at the count it was refused at, and before the model is asked', eleventh.json?.used === 3 && eleventh.json?.limit === 3 && streams() === before);
const back = await logos('s3', 4);
ok('going back to a conversation already begun costs nothing', back.status === 200 && count('liam', 'chats') === 3, back.text);
let long = true;
for (let k = 2; k <= 16; k++) long = long && (await logos('s1', k)).status === 200;
ok('no daily count of messages: fifteen more turns in one conversation, all answered', long);
ok('  and none of them is counted as a message the plan limits', count('liam', 'chats') === 3);
ok('a first turn sent again is not a second conversation', (await logos('s2', 1)).status === 200 && count('liam', 'chats') === 3);
const gift = await logos('s12', 1, { firstThought: true });
ok('onboarding’s "first thought" is no longer a gift: past the three, it is refused like any other', gift.status === 402 && gift.json?.upgrade === 'chats' && !gift.headers.get('X-Socria-First-Thought'), gift.text);

console.log('\n=== Core and Logos share the month ===');
as('fiona');
for (let k = 1; k <= 2; k++) await logos(`f${k}`);
const c1 = await core('core-1');
ok('a Core conversation is answered — and is one of the month’s three', c1.status === 200 && count('fiona', 'chats') === 3, `${c1.status} ${count('fiona', 'chats')}`);
const c2 = await core('core-2');
ok('the next, in Core, is refused at the same boundary', c2.status === 402 && c2.json?.upgrade === 'chats', c2.text);
ok('  no Core counters are written any more', !db.rows('logos_usage').some((x) => x.user_id === 'fiona' && /^core-/.test(x.counter)));
ok('a Core conversation going on costs nothing', (await core('core-1', 3)).status === 200 && count('fiona', 'chats') === 3);

console.log('\n=== Logic Maps: two a month, ten nodes a month ===');
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
ok('  one of the month’s two maps, three of its ten nodes', count('mira', 'maps') === 1 && count('mira', 'nodes') === 3, `${count('mira', 'maps')} ${count('mira', 'nodes')}`);
const m2 = await map('m2', EMPTY, extraction(['d', 'e', 'f', 'g']));
ok('a second map: four more nodes', m2.status === 200 && m2.json?.map?.nodes?.length === 4 && count('mira', 'maps') === 2 && count('mira', 'nodes') === 7);
before = passes();
const m3 = await map('m3', EMPTY, extraction(['x']));
ok('a third conversation’s map is refused before any model is asked', m3.status === 402 && m3.json?.upgrade === 'maps' && passes() === before, m3.text.slice(0, 300));
ok('  saying so in the boundary’s words, with the map it was sent kept', /2 free Logic Maps this month/.test(m3.json?.error ?? '') && JSON.stringify(m3.json?.map?.nodes) === '[]');
const grow = await map('m1', m1.json.map, extraction(['a', 'b', 'c', 'h', 'i', 'j', 'k', 'l'], [{ from: 'a', to: 'h', relation: 'relates' }, { from: 'c', to: 'l', relation: 'relates' }]));
const kept = (grow.json?.map?.nodes ?? []).map((n) => n.id);
ok('a map already drawn keeps growing — until the month’s ten nodes: three of five new kept', grow.status === 200 && kept.length === 6 && ['h', 'i', 'j'].every((id) => kept.includes(id)) && !kept.includes('k') && !kept.includes('l'), JSON.stringify(kept));
ok('  a connection to a node not kept goes with it; one to a kept node stays', (grow.json?.map?.edges ?? []).some((e) => e.to === 'h') && !(grow.json?.map?.edges ?? []).some((e) => e.to === 'l'), JSON.stringify(grow.json?.map?.edges));
ok('  the page is told which allowance stopped the map, and in what words', grow.json?.limit?.counter === 'nodes' && grow.json?.limit?.used === 10 && /10 free Logic Map nodes this month/.test(grow.json?.limit?.note ?? ''), JSON.stringify(grow.json?.limit));
ok('  and the count is exactly ten', count('mira', 'nodes') === 10);
const still = await map('m1', grow.json.map, extraction(['a', 'b', 'c', 'h', 'i', 'j', 'z']));
ok('past the ten, the map keeps every node it has and gains none', still.status === 200 && still.json?.map?.nodes?.length === 6 && !still.json.map.nodes.some((n) => n.id === 'z') && count('mira', 'nodes') === 10, JSON.stringify(still.json?.map?.nodes?.map((n) => n.id)));
const hand = await call(R.allowance.POST, 'POST', '/api/logos/allowance', { counter: 'nodes' });
ok('a node added by hand is refused too, once the month’s nodes are spent', hand.status === 402 && hand.json?.upgrade === 'nodes', hand.text);
as('olga');
const oneMap = await map('o1', EMPTY, extraction(Array.from({ length: 14 }, (_, k) => `n${k}`)));
ok('Socria One: a map of fourteen nodes, kept whole, nothing counted', oneMap.status === 200 && oneMap.json?.map?.nodes?.length === 14 && count('olga', 'nodes') === 0 && count('olga', 'maps') === 0);

console.log('\n=== a drawing on the free plan: kept whole or not at all, never an empty map charged ===');
// THE LOGIC MAP DRAWS (Logos 5, lib/quota-map.ts keepAddedNodes): a drawing the month's nodes cannot hold is
// left off whole, the person's own new ideas kept first — and the meter plans that BEFORE a first map is
// claimed, so a pass that would leave a conversation's map empty takes none of the month's maps.
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
ok('one node left and a drawing of four: none of it is drawn — never half', dLeft.status === 200 && (dLeft.json?.map?.nodes ?? []).length === 0, dLeft.text.slice(0, 300));
ok('  no map is claimed for a map left empty, and no node is taken', count('dina', 'maps') === 0 && count('dina', 'nodes') === 9, `${count('dina', 'maps')} ${count('dina', 'nodes')}`);
ok('  the page is told why, in the drawing\'s own words', dLeft.json?.limit?.counter === 'nodes' && dLeft.json.limit.note === 'This drawing needs 4 Logic Map nodes and only 1 Logic Map node is left this month, so it was not drawn — never half of it.', JSON.stringify(dLeft.json?.limit));
ok('  and the drawing\'s title goes with it', !('title' in (dLeft.json?.map ?? {})), JSON.stringify(dLeft.json?.map));
const theirsDrawn = { ...WATERMAP, nodes: [{ id: 'q', type: 'question', label: 'Why does it rain so much here?', status: 'open' }, ...WATERMAP.nodes] };
const dMine = await map('dMine', EMPTY, theirsDrawn, [{ role: 'user', content: 'Why does it rain so much here? Draw the water cycle.' }]);
ok('their own question and a drawing, one node left: their question is kept, the drawing left off whole', dMine.status === 200 && JSON.stringify((dMine.json?.map?.nodes ?? []).map((x) => x.id)) === '["q"]', dMine.text.slice(0, 300));
ok('  this map holds their idea, so it is one of the month\'s maps; one node taken', count('dina', 'maps') === 1 && count('dina', 'nodes') === 10, `${count('dina', 'maps')} ${count('dina', 'nodes')}`);
ok('  said plainly: none left for the drawing, their idea kept', dMine.json?.limit?.note === 'This drawing needs 4 Logic Map nodes and none are left this month, so it was not drawn — never half of it. Your own new ideas were kept.', JSON.stringify(dMine.json?.limit));
as('eve');
const eFits = await map('eFits', EMPTY, WATERMAP, drawItAsk);
ok('with room, the whole drawing is drawn and counted: one map, four nodes', eFits.status === 200 && (eFits.json?.map?.nodes ?? []).length === 4 && eFits.json.map.title === 'The water cycle' && !eFits.json.limit && count('eve', 'maps') === 1 && count('eve', 'nodes') === 4, eFits.text.slice(0, 300));
// UNASKED, A SUBJECT IS DRAWN FOR SOCRIA ONE AND A GUEST — a free account's week is not spent on it
const mapToldOf = () => JSON.stringify((globalThis.__logosCalls ?? []).filter((p) => !p.stream).at(-1)?.messages ?? []);
let passesBefore = passes();
await map('e2', eFits.json.map, { ...WATERMAP }, [{ role: 'user', content: 'explain the water cycle' }]);
ok('a free account asking about a subject with a shape: the map pass runs, and is not told to draw it', passes() === passesBefore + 1 && !mapToldOf().includes("THIS TURN'S SUBJECT"), `${passes() - passesBefore} ${mapToldOf().slice(-300)}`);
as('olga');
passesBefore = passes();
await map('o2', EMPTY, { ...WATERMAP }, [{ role: 'user', content: 'explain the water cycle' }]);
ok('Socria One asking the same: the map pass is told the subject has a shape to draw', passes() === passesBefore + 1 && mapToldOf().includes("THIS TURN'S SUBJECT"), `${passes() - passesBefore} ${mapToldOf().slice(-300)}`);

console.log('\n=== a new conversation\'s map is the server\'s to count, whatever the page sends ===');
// The bug as reported: on the free plan, a third and fourth map were drawn after
// two. The page can send a map with a new conversation's id — the previous
// conversation's, in the moment after switching — and the route used to take
// "it already has nodes" as "this conversation already has its map".
as('nina');
const n1 = await map('n1', EMPTY, extraction(['a', 'b']));
const n2 = await map('n2', EMPTY, extraction(['c']));
ok('two maps drawn and counted', n1.status === 200 && n2.status === 200 && count('nina', 'maps') === 2, `${n1.status} ${n2.status} ${count('nina', 'maps')}`);
before = passes();
const stale = await map('n3', n2.json.map, extraction(['c', 'd']));
ok('a third conversation sent with the previous conversation\'s map is still refused — before any model is asked', stale.status === 402 && stale.json?.upgrade === 'maps' && passes() === before, stale.text.slice(0, 300));
ok('  and nothing more is counted', count('nina', 'maps') === 2 && count('nina', 'nodes') === 3);
const anon = await call(R.map.POST, 'POST', '/api/logos/map', { messages: [{ role: 'user', content: 'A thought.' }], map: EMPTY });
ok('a free map pass that names no conversation is refused like any other once the maps are used', anon.status === 402 && anon.json?.upgrade === 'maps', anon.text.slice(0, 200));
// A pass that names no conversation has no conversation to "already have" a map: each one that
// leaves a map is a new one, so leaving the id out never rides on a map counted elsewhere.
as('pia');
const p1 = await map(undefined, EMPTY, extraction(['a']));
const p2 = await map(undefined, p1.json?.map ?? EMPTY, extraction(['a', 'b']));
ok('  without a conversation, every pass that leaves a map is counted as a new map', p1.status === 200 && p2.status === 200 && count('pia', 'maps') === 2, `${p1.status} ${p2.status} ${count('pia', 'maps')}`);
before = passes();
const p3 = await map(undefined, p2.json?.map ?? EMPTY, extraction(['a', 'b', 'c']));
ok('  and the third is refused before any model is asked', p3.status === 402 && p3.json?.upgrade === 'maps' && passes() === before, p3.text.slice(0, 200));
as('olga');
const oneStale = await map('o9', n2.json.map, extraction(['c', 'd']));
ok('Socria One is not counted, whatever it sends', oneStale.status === 200 && count('olga', 'maps') === 0);

console.log('\n=== a map saved before the limits keeps growing; a new one is refused ===');
as('otto');
db.rows('conversations').push({ id: 'old-1', user_id: 'otto', title: 'Before the limits', messages: [], map: { nodes: N(['p', 'q']), edges: [] }, updated_at: Date.now() });
db.rows('logos_usage').push({ user_id: 'otto', scope: month, counter: 'maps', n: 2, updated_at: Date.now() });
const grows = await map('old-1', { nodes: N(['p', 'q']), edges: [] }, extraction(['p', 'q', 'r']));
ok('a conversation saved with a map is known to have one: it grows, and no map is charged', grows.status === 200 && (grows.json?.map?.nodes ?? []).length === 3 && count('otto', 'maps') === 2 && count('otto', 'nodes') === 1, grows.text.slice(0, 300));
before = passes();
const fresh = await map('new-1', EMPTY, extraction(['x']));
ok('a new conversation, with the month\'s maps spent, is refused before any model is asked', fresh.status === 402 && fresh.json?.upgrade === 'maps' && passes() === before, fresh.text.slice(0, 200));

console.log('\n=== a map begun by hand is one of the month\'s maps ===');
as('hana');
const byHand = (sessionId, newMap = true) => call(R.allowance.POST, 'POST', '/api/logos/allowance', { counter: 'nodes', n: 1, sessionId, newMap });
const h1 = await byHand('h1');
ok('the first card of a conversation, added by hand, claims a map and a node', h1.status === 200 && count('hana', 'maps') === 1 && count('hana', 'nodes') === 1, h1.text);
const h1b = await byHand('h1');
ok('  another card in the same conversation claims only a node', h1b.status === 200 && count('hana', 'maps') === 1 && count('hana', 'nodes') === 2, h1b.text);
await byHand('h2');
const h3 = await byHand('h3');
ok('a third conversation begun by hand is refused at the month\'s two maps', h3.status === 402 && h3.json?.upgrade === 'maps' && count('hana', 'maps') === 2 && count('hana', 'nodes') === 3, h3.text);

console.log('\n=== with the usage table missing, the free plan is paused — never lifted ===');
db.absent.add('logos_usage');
as('pete');
before = streams();
const paused = await logos('p1');
ok('a free conversation is paused, not let through uncounted: 503, said plainly', paused.status === 503 && paused.json?.unavailable === true && /can’t be checked right now/.test(paused.json?.error ?? ''), paused.text.slice(0, 300));
ok('  offering nothing — it is a fault, not a limit — and before the model is asked', !paused.json?.upgrade && streams() === before);
before = passes();
const pausedMap = await map('p1', EMPTY, extraction(['a']));
ok('a free map is paused the same way, before any model is asked', pausedMap.status === 503 && pausedMap.json?.unavailable === true && passes() === before, pausedMap.text.slice(0, 200));
const pausedHand = await call(R.allowance.POST, 'POST', '/api/logos/allowance', { counter: 'nodes', n: 1, sessionId: 'p2', newMap: true });
ok('  and a card added by hand', pausedHand.status === 503 && pausedHand.json?.unavailable === true, pausedHand.text);
as('olga');
const onePaused = await logos('o-missing');
ok('Socria One is never paused by it', onePaused.status === 200, onePaused.text.slice(0, 200));
db.absent.delete('logos_usage');
await settle();

console.log('\n=== artifacts: two a month, held at the save ===');
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
ok('two artifacts saved: both kept, two counted', s1.status === 200 && !s1.json?.refused && count('ada', 'artifacts') === 2, s1.text);
const third = objIds(three).find((x) => !objIds(two).includes(x));
const s2 = await save('conv-a', three, { base: db.rows('conversations').find((r) => r.id === 'conv-a')?.updated_at ?? null });
const stored = db.rows('conversations').find((r) => r.id === 'conv-a');
const storedObjs = JSON.stringify(stored?.map ?? stored?.memory ?? {});
ok('a third is not kept — and the save says which, and why', s2.status === 200 && JSON.stringify(s2.json?.refused?.artifacts?.objects) === JSON.stringify([third]) && /2 free artifacts this month/.test(s2.json?.refused?.note ?? ''), s2.text);
ok('  the two already made are untouched, and the third is not in what was stored', objIds(two).every((x) => storedObjs.includes(`"${x}"`)) && !storedObjs.includes(`"${third}"`), storedObjs.slice(0, 300));
const s3 = await save('conv-a', two, { base: db.rows('conversations').find((r) => r.id === 'conv-a')?.updated_at ?? null });
ok('saving the same two again costs nothing', s3.status === 200 && !s3.json?.refused && count('ada', 'artifacts') === 2);
as('paula');
const ps = await save('conv-p', space(['A', 'B', 'C', 'D']));
ok('Socria One (a paid subscription): four artifacts, all kept, nothing counted', ps.status === 200 && !ps.json?.refused && count('paula', 'artifacts') === 0, ps.text);

console.log('\n=== documents: one a month ===');
as('dora');
const { doc } = await T.readDocument('report.md', Buffer.from('# Q3 report\n\nRevenue rose 12% on the quarter.\n\nCosts held flat.'));
const { doc: other } = await T.readDocument('notes.txt', Buffer.from('Second document.\n\nThe launch moved to March.'));
const attach = (d) => ({ kind: 'doc', name: d.name, doc: d.id, text: T.renderDocAsNote(d, 24000).text, pages: d.pageCount, format: d.format, origin: 'source' });
const withDoc = (sessionId, d, n = 1) => call(R.logos.POST, 'POST', '/api/logos/chat', { surface: 'logos5', sessionId, messages: [{ role: 'user', content: 'What does this say?', attachments: [attach(d)] }, ...turns(n).slice(1)], docs: [d] });
const d1 = await withDoc('d1', doc);
ok('a first document brought into a conversation: read, and counted once', d1.status === 200 && count('dora', 'documents') === 1, d1.text.slice(0, 200));
ok('  carried on later turns, it costs nothing more', (await withDoc('d1', doc, 3)).status === 200 && count('dora', 'documents') === 1);
before = streams();
const d2 = await withDoc('d2', other);
ok('a second document this month is refused, before the model is asked', d2.status === 402 && d2.json?.upgrade === 'documents' && streams() === before, d2.text.slice(0, 300));
ok('  in the boundary’s words', /1 free document this month/.test(d2.json?.error ?? ''), d2.json?.error);
const form = new FormData();
form.append('file', new Blob(['Third document'], { type: 'text/plain' }), 'third.txt');
const read = await call(R.read.POST, 'POST', '/api/files/read', undefined, { form });
ok('reading another file is refused before any reading is done', read.status === 402 && read.json?.upgrade === 'documents', read.text.slice(0, 200));
globalThis.__logosReply = '# A short history\n\nIt began with a question.';
const wu = await call(R.logos.POST, 'POST', '/api/logos/chat', { surface: 'logos5', sessionId: 'd3', messages: [{ role: 'user', content: 'Make me a study guide on the causes of World War One' }] });
const wuPrompt = (globalThis.__logosCalls ?? []).filter((p) => p.stream).pop();
ok('a write-up asked for with the month’s document spent: answered here, and the page told why', wu.status === 200 && wu.headers.get('X-Socria-Limit') === 'documents' && !systemOf(wuPrompt ?? { messages: [] }).includes('A WRITE-UP, READ IN CONTENT'), `${wu.status} ${wu.headers.get('X-Socria-Limit')}`);
globalThis.__logosReply = 'Noted.';

console.log('\n=== Socria Voice and sharing are Socria One ===');
as('vic');
const voice = await call(R.transcribe.POST, 'POST', '/api/transcribe', undefined, { form: new FormData() });
ok('Voice on the free plan: refused, with the word the page raises Socria One for', voice.status === 402 && voice.json?.upgrade === 'voice' && /Socria Voice is part of Socria One/.test(voice.json?.error ?? ''), voice.text);
as(null);
ok('  and signed out', (await call(R.transcribe.POST, 'POST', '/api/transcribe', undefined, { form: new FormData() })).status !== 200);
as('olga');
const oneVoice = await call(R.transcribe.POST, 'POST', '/api/transcribe', undefined, { form: new FormData() });
ok('Socria One passes the gate (and is told no recording arrived)', oneVoice.status === 400, oneVoice.text);
as('vic');
await call(R.conversations.PUT, 'PUT', '/api/conversations', { conversation: { id: 'c-vic', title: 'Mine', messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], updatedAt: Date.now() } });
const vshare = await call(R.share.POST, 'POST', '/api/share', { type: 'conversation', id: 'c-vic', action: 'link', role: 'viewer' });
ok('sharing a conversation on the free plan: refused', vshare.status === 402 && vshare.json?.upgrade === 'share' && vshare.json?.refusal === 'plan', vshare.text);
ok('  saying sharing is Socria One, and that joining stays open', /Sharing a conversation is part of Socria One/.test(vshare.json?.refusalNote ?? '') && /join what others share/.test(vshare.json?.refusalNote ?? ''), vshare.json?.refusalNote);
const vroom = await call(R.room.POST, 'POST', '/api/logos/room', {});
ok('opening a room on the free plan: refused', vroom.status === 402 && vroom.json?.upgrade === 'share', vroom.text);
as('olga');
await call(R.conversations.PUT, 'PUT', '/api/conversations', { conversation: { id: 'c-olga', title: 'Ours', messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], updatedAt: Date.now() } });
const link = await call(R.share.POST, 'POST', '/api/share', { type: 'conversation', id: 'c-olga', action: 'link', role: 'editor' });
ok('Socria One shares by link', link.status === 200 && !!link.json?.link?.token, link.text.slice(0, 200));
as('vic');
const joined = await call(R.accept.POST, 'POST', '/api/share/accept', { token: link.json?.link?.token });
ok('a free account joins what Socria One shared — joining is free', joined.status === 200, joined.text.slice(0, 200));

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
ok('maps 2 of 2, nodes 10 of 10', c.maps?.used === 2 && c.maps?.limit === 2 && c.nodes?.used === 10 && c.nodes?.limit === 10, JSON.stringify(c));
ok('  and the free plan has no daily message limit', c.messages?.limit === null);
as('olga');
const onePanel = await call(R.usage.GET, 'GET', '/api/logos/usage');
ok('Socria One: every tiered allowance unlimited', ['maps', 'nodes', 'artifacts', 'documents'].every((k) => onePanel.json?.counters?.[k]?.limit === null), JSON.stringify(onePanel.json?.counters));

console.log(`\nfree-limits-e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
