// The free plan, end to end, through the real routes (October 31, 2026).
//
//                         Free          Socria One
//   Conversations         10 a month    unlimited (fair use)
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
//   olga   Socria One (the operator's allowlist)
//   paula  Socria One (a paid Stripe subscription)

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
  ['liam', 'fiona', 'mira', 'ada', 'dora', 'vic', 'olga', 'paula'].map((u) => [u, { firstName: u[0].toUpperCase() + u.slice(1), emails: [`${u}@example.com`] }])
);
// carl: a complimentary grant on the account, and a comp row, from before
globalThis.__users.carl = { firstName: 'Carl', emails: ['carl@example.com'], privateMetadata: { socriaOne: 'comp' } };
db.rows('socria_subscriptions').push({ user_id: 'carl', customer_id: 'comp_carl', subscription_id: 'comp_carl', status: 'comp', current_period_end: null, price_id: null, cancel_at_period_end: false, updated_at: Date.now() });
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

console.log('\n=== conversations: ten a month ===');
as('liam');
globalThis.__logosReply = 'Noted.';
for (let k = 1; k <= 10; k++) {
  const r = await logos(`s${k}`);
  if (r.status !== 200) ok(`conversation ${k} of 10 is answered`, false, r.text);
}
ok('ten conversations begun, ten counted', count('liam', 'chats') === 10, String(count('liam', 'chats')));
let before = streams();
const eleventh = await logos('s11');
ok('the eleventh is refused, with the word the page raises Socria One for', eleventh.status === 402 && eleventh.json?.upgrade === 'chats', eleventh.text);
ok('  and the boundary’s own sentence: ten this month, every one still open, Socria One', /10 free conversations this month/.test(eleventh.json?.error ?? '') && /stays open/.test(eleventh.json?.error ?? '') && /Unlock unlimited access with Socria One/.test(eleventh.json?.error ?? ''), eleventh.json?.error);
ok('  at the count it was refused at, and before the model is asked', eleventh.json?.used === 10 && eleventh.json?.limit === 10 && streams() === before);
const back = await logos('s3', 4);
ok('going back to a conversation already begun costs nothing', back.status === 200 && count('liam', 'chats') === 10, back.text);
let long = true;
for (let k = 2; k <= 16; k++) long = long && (await logos('s1', k)).status === 200;
ok('no daily count of messages: fifteen more turns in one conversation, all answered', long);
ok('  and none of them is counted as a message the plan limits', count('liam', 'chats') === 10);
ok('a first turn sent again is not a second conversation', (await logos('s2', 1)).status === 200 && count('liam', 'chats') === 10);
const gift = await logos('s12', 1, { firstThought: true });
ok('onboarding’s "first thought" is no longer a gift: past the ten, it is refused like any other', gift.status === 402 && gift.json?.upgrade === 'chats' && !gift.headers.get('X-Socria-First-Thought'), gift.text);

console.log('\n=== Core and Logos share the month ===');
as('fiona');
for (let k = 1; k <= 9; k++) await logos(`f${k}`);
const c1 = await core('core-1');
ok('a Core conversation is answered — and is one of the month’s ten', c1.status === 200 && count('fiona', 'chats') === 10, `${c1.status} ${count('fiona', 'chats')}`);
const c2 = await core('core-2');
ok('the next, in Core, is refused at the same boundary', c2.status === 402 && c2.json?.upgrade === 'chats', c2.text);
ok('  no Core counters are written any more', !db.rows('logos_usage').some((x) => x.user_id === 'fiona' && /^core-/.test(x.counter)));
ok('a Core conversation going on costs nothing', (await core('core-1', 3)).status === 200 && count('fiona', 'chats') === 10);

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
