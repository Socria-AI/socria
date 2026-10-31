// Saving a conversation from a copy that is behind loses nothing.
//
// A save carries the whole conversation. A copy written from an older view
// of it — a second tab, another device, or one save of this tab landing after
// the next — used to write its messages over turns said since, put back a
// title renamed elsewhere, and bring a deleted conversation back to life.
// (Persistence audit: DATA-2, DATA-3, DATA-4, DATA-5.)
//
// Through the real routes (PUT/GET/PATCH /api/conversations and DELETE
// /api/conversations/[id]) with the in-memory database:
//   - a save made from an older version is merged: the newer turns stay and
//     its own follow; the map keeps every card either copy has, except one
//     the person took off; a title or a surface set elsewhere stands;
//   - the write lands only on the version it was merged with, and updated_at
//     never goes backwards;
//   - a conversation deleted elsewhere answers 410 and is not recreated, while
//     a new one is created as ever, and two first saves of it racing both land;
//   - someone else's id is still refused, and a client that sends no version
//     (an open tab from before) is saved exactly as before.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-conversation-save');
const H = (f) => join(here, 'helpers', f);
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
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(H('fake-openai.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: H('server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
for (const [name, file] of [['list', 'app/api/conversations/route.ts'], ['one', 'app/api/conversations/[id]/route.ts']]) {
  await build({ entryPoints: [join(root, file)], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, `${name}.mjs`), tsconfig: join(root, 'tsconfig.json'), plugins: [swap], packages: 'external', logLevel: 'error' });
}
console.error = () => {};
console.warn = () => {};
process.env.RATE_LIMIT_DISABLED = '1';
process.env.OPENAI_API_KEY = 'test';

const { db } = await import(pathToFileURL(H('fake-supabase.mjs')).href);
const { NextRequest } = await import('next/server.js');
const L = await import(pathToFileURL(join(OUT, 'list.mjs')).href);
const ONE = await import(pathToFileURL(join(OUT, 'one.mjs')).href);

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

globalThis.__users = { una: { firstName: 'Una', emails: ['una@example.com'] }, vic: { firstName: 'Vic', emails: ['vic@example.com'] } };
const as = (u) => (globalThis.__uid = u);
const req = (method, url, body) => new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const put = async (conversation) => {
  const r = await L.PUT(req('PUT', '/api/conversations', { conversation }));
  return { status: r.status, json: await r.json().catch(() => null) };
};
const get = async () => (await (await L.GET(req('GET', '/api/conversations'))).json()).conversations ?? [];
const row = (id) => db.rows('conversations').find((r) => r.id === id) ?? null;
const said = (id) => (row(id)?.messages ?? []).map((m) => m.content);
const turn = (id, role, content) => ({ id, at: 1, role, content });
const card = (id, label) => ({ id, type: 'idea', label, status: 'open' });

console.log('\ntwo tabs, one conversation: the one that is behind is merged, not written over');
{
  db.reset();
  as('una');
  const t0 = 1_700_000_000_000;
  const first = await put({ id: 'c1', title: 'Rent or buy', messages: [turn('m1', 'user', 'Rent or buy?'), turn('m2', 'assistant', 'What would buying give you?')], map: { nodes: [card('a', 'Rent or buy')], edges: [] }, updatedAt: t0, base: null, known: false });
  ok('a new conversation is created', first.status === 200 && !!row('c1'), JSON.stringify(first.json));
  const v0 = first.json.updatedAt;
  // Both tabs read it at v0.
  // Tab A says two more things, and adds a card.
  const a = await put({ id: 'c1', title: 'Rent or buy', messages: [turn('m1', 'user', 'Rent or buy?'), turn('m2', 'assistant', 'What would buying give you?'), turn('m3', 'user', 'Stability.'), turn('m4', 'assistant', 'At what cost?')], map: { nodes: [card('a', 'Rent or buy'), card('x', 'Stability')], edges: [] }, updatedAt: t0 + 10, base: v0, known: true });
  ok('tab A saves on the version it read', a.status === 200 && !a.json.merged);
  // Tab B, still at v0, says one thing of its own and adds its own card.
  const b = await put({ id: 'c1', title: 'Rent or buy', messages: [turn('m1', 'user', 'Rent or buy?'), turn('m2', 'assistant', 'What would buying give you?'), turn('mb', 'user', 'And the deposit?')], map: { nodes: [card('a', 'Rent or buy'), card('y', 'Deposit')], edges: [] }, updatedAt: t0 + 5, base: v0, known: true });
  ok('tab B, behind, is told it was merged', b.status === 200 && b.json.merged === true, JSON.stringify(b.json));
  ok('tab A’s turns are still there', said('c1').includes('Stability.') && said('c1').includes('At what cost?'), JSON.stringify(said('c1')));
  ok('  and tab B’s own turn follows them', said('c1').at(-1) === 'And the deposit?', JSON.stringify(said('c1')));
  const nodes = (row('c1').map?.nodes ?? []).map((n) => n.label);
  ok('the map keeps the cards of both', nodes.includes('Stability') && nodes.includes('Deposit'), JSON.stringify(nodes));
  ok('updated_at moved forward, not back to tab B’s older clock', row('c1').updated_at > a.json.updatedAt);
  // Tab B saves again from the same old view: merged again, nothing lost, nothing doubled.
  const b2 = await put({ id: 'c1', title: 'Rent or buy', messages: [turn('m1', 'user', 'Rent or buy?'), turn('m2', 'assistant', 'What would buying give you?'), turn('mb', 'user', 'And the deposit?'), turn('mb2', 'assistant', 'How much do you have?')], map: { nodes: [card('a', 'Rent or buy'), card('y', 'Deposit')], edges: [] }, updatedAt: t0 + 6, base: v0, known: true });
  ok('a second save from the same old view is merged again', b2.json.merged === true);
  ok('  every turn once, the newest last', JSON.stringify(said('c1')) === JSON.stringify(['Rent or buy?', 'What would buying give you?', 'Stability.', 'At what cost?', 'And the deposit?', 'How much do you have?']), JSON.stringify(said('c1')));
}

console.log('\na card the person took off is not brought back by an older copy');
{
  const stored = row('c1');
  stored.map = { ...stored.map, nodes: stored.map.nodes.filter((n) => n.label !== 'Stability'), removed: ['stability'] };
  stored.updated_at += 1;
  const old = await put({ id: 'c1', title: 'Rent or buy', messages: stored.messages, map: { nodes: [card('a', 'Rent or buy'), card('x', 'Stability')], edges: [] }, updatedAt: 1, base: 1, known: true });
  ok('merged', old.json?.merged === true);
  ok('  and the card taken off stays off', !(row('c1').map?.nodes ?? []).some((n) => n.label === 'Stability'), JSON.stringify(row('c1').map?.nodes));
}

console.log('\na rename made elsewhere stands');
{
  const list = await get();
  const v = list.find((c) => c.id === 'c1').updatedAt;
  const r = await L.PATCH(req('PATCH', '/api/conversations', { id: 'c1', title: 'Buying a flat' }));
  ok('renamed in one tab', r.status === 200 && row('c1').title === 'Buying a flat');
  ok('  and the rename moves the version on', row('c1').updated_at === v + 1, `${row('c1').updated_at} vs ${v}`);
  const stale = await put({ id: 'c1', title: 'Rent or buy', messages: row('c1').messages, map: row('c1').map, updatedAt: Date.now(), base: v, known: true });
  ok('a save from the other tab, with the old title', stale.status === 200 && stale.json.merged === true);
  ok('  leaves the new one', row('c1').title === 'Buying a flat', row('c1').title);
}

console.log('\nsaves of one tab, landing out of order, keep the reply');
{
  db.reset();
  as('una');
  const made = await put({ id: 'c2', title: 'Garden', messages: [turn('g1', 'user', 'Tomatoes or beans?')], updatedAt: 10, base: null, known: false });
  const v0 = made.json.updatedAt;
  // Two saves sent in the same moment from v0: one with the reply, one from just before it landed.
  const newer = await put({ id: 'c2', title: 'Garden', messages: [turn('g1', 'user', 'Tomatoes or beans?'), turn('g2', 'assistant', 'Which do you eat more?')], updatedAt: 20, base: v0, known: true });
  const older = await put({ id: 'c2', title: 'Garden', messages: [turn('g1', 'user', 'Tomatoes or beans?')], updatedAt: 15, base: v0, known: true });
  ok('both answer 200', newer.status === 200 && older.status === 200);
  ok('the older, landing last, does not erase the reply', said('c2').includes('Which do you eat more?'), JSON.stringify(said('c2')));
}

console.log('\na conversation deleted elsewhere is not written back into existence');
{
  db.reset();
  as('una');
  const made = await put({ id: 'c3', title: 'Old idea', messages: [turn('o1', 'user', 'An old idea')], updatedAt: 10, base: null, known: false });
  const del = await ONE.DELETE(req('DELETE', '/api/conversations/c3'), { params: { id: 'c3' } });
  ok('deleted in one tab', del.status === 200 && !row('c3'));
  const again = await put({ id: 'c3', title: 'Old idea', messages: [turn('o1', 'user', 'An old idea'), turn('o2', 'user', 'one more thought')], updatedAt: 20, base: made.json.updatedAt, known: true });
  ok('a save from the other tab answers 410', again.status === 410 && again.json?.gone === true, `${again.status} ${JSON.stringify(again.json)}`);
  ok('  and the conversation stays deleted', !row('c3'));
}

console.log('\na brand-new conversation, saved twice at once, lands once');
{
  db.reset();
  as('una');
  const [p1, p2] = await Promise.all([
    put({ id: 'c4', title: 'New', messages: [turn('n1', 'user', 'First thought')], updatedAt: 10, base: null, known: false }),
    put({ id: 'c4', title: 'New', messages: [turn('n1', 'user', 'First thought'), turn('n2', 'assistant', 'Say more?')], updatedAt: 11, base: null, known: false }),
  ]);
  ok('both answer 200, neither "belongs to another account"', p1.status === 200 && p2.status === 200, `${p1.status} ${p2.status} ${JSON.stringify(p2.json)}`);
  ok('  one row, with both saves’ turns', db.rows('conversations').filter((r) => r.id === 'c4').length === 1 && said('c4').includes('Say more?'), JSON.stringify(said('c4')));
}

console.log('\nwhat did not change');
{
  db.reset();
  as('vic');
  await put({ id: 'cv', title: 'Vic’s', messages: [turn('v1', 'user', 'Vic’s words')], updatedAt: 10, base: null, known: false });
  as('una');
  const theirs = await put({ id: 'cv', title: 'mine now', messages: [turn('u1', 'user', 'overwrite')], updatedAt: 20, base: null, known: false });
  ok('someone else’s id is refused', theirs.status === 403 && said('cv')[0] === 'Vic’s words', `${theirs.status} ${JSON.stringify(said('cv'))}`);
  const legacy = await put({ id: 'cl', title: 'Legacy', messages: [turn('l1', 'user', 'from an old tab')], updatedAt: 10 });
  ok('a client that sends no version is saved as before', legacy.status === 200 && said('cl')[0] === 'from an old tab' && legacy.json?.merged === undefined);
  const legacy2 = await put({ id: 'cl', title: 'Legacy', messages: [turn('l2', 'user', 'replaced whole, as it always was')], updatedAt: 11 });
  ok('  including writing the whole row, as it always did', legacy2.status === 200 && JSON.stringify(said('cl')) === JSON.stringify(['replaced whole, as it always was']));
}

console.log('\nthe client says which version it saw, and saves one at a time');
{
  // Signed-in saves need a real Clerk session, which the local stack does not
  // have — so the client's half of the protocol is pinned here, in its source.
  const app = readFileSync(join(root, 'components/LogosApp.tsx'), 'utf8');
  ok('every save sends the version it was made from, and whether the row is known', /base: savedAtRef\.current\.get\(s\.id\) \?\? null, known: knownRef\.current\.has\(s\.id\)/.test(app));
  ok('the version is taken from what was read', /knownRef\.current\.add\(c\.id\);\s*savedAtRef\.current\.set\(c\.id, Number\(c\.updatedAt\) \|\| 0\);/.test(app));
  ok('and from a save, unless it had to be merged', /if \(j && typeof j\.updatedAt === 'number' && !j\.merged\) savedAtRef\.current\.set\(s\.id, j\.updatedAt\);/.test(app));
  ok('one save in flight per conversation, carrying the latest state', /const queued = saveQueuedRef\.current\.get\(s\.id\);\s*if \(queued\) return queued;/.test(app) && /const latest = sessionsRef\.current\.find\(\(x\) => x\.id === s\.id\) \?\? s;/.test(app));
  ok('a conversation deleted elsewhere is closed here, not saved back', /if \(res\.status === 410\) \{\s*dropGone\(s\.id\);/.test(app));
}

console.log(`\nconversation-save-e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
