// CORE 4 AND LOGOS 5, ONE HISTORY — through the real routes.
//
// What has to hold (lib/logos5/merge.ts):
//   • a save that does not carry a conversation's memory leaves the stored
//     memory as it is — Logos never sends it, and saving a Core chat there
//     used to wipe it; a new row starts empty; a client that sends one still
//     replaces it; the older database's sidecar keeps the memory too;
//   • bringing the Core chats into Logos 5 moves the kind and nothing else —
//     not the messages, not the memory, not when it was last worked on —
//     only this person's, never an incognito one;
//   • it happens once per account: recorded as 'logos.merged', so a second
//     call moves nothing, not a Core chat begun since either;
//   • without the record's column it still moves them, and says it could not
//     record it; without the `kind` column it moves nothing and says why;
//   • the maps it says may be drawn in the background leave out every chat
//     kept quiet — off the record, kept to itself, the source of a private
//     memory — and, when that cannot be told, all of them;
//   • a map drawn in the background is written alone: never the messages,
//     never over a map already there, never onto a shared conversation, and
//     never moving when it was last worked on; it is marked unopened, and the
//     5-Node Challenge does not read it until the person opens it in Logos;
//   • signed out, nothing.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-merge');
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
  entryPoints: {
    conversations: join(root, 'app/api/conversations/route.ts'),
    merge: join(root, 'app/api/conversations/merge/route.ts'),
    pure: join(root, 'lib/logos5/merge.ts'),
    challenge: join(root, 'lib/rewards/challenge-rule.ts'),
    logos: join(root, 'lib/logos.ts'),
  },
  bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' },
  tsconfig: join(root, 'tsconfig.json'), plugins,
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', 'unpdf'],
  logLevel: 'error',
});

const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('conversations') || first.startsWith('merge') || first.startsWith('PUT') || first.startsWith('[socria')) return;
  orig(...a);
};
console.error = quiet(console.error.bind(console));
console.warn = quiet(console.warn.bind(console));
process.env.RATE_LIMIT_DISABLED = '1';

const C = await import(pathToFileURL(join(OUT, 'conversations.mjs')).href);
const M = await import(pathToFileURL(join(OUT, 'merge.mjs')).href);
const P = await import(pathToFileURL(join(OUT, 'pure.mjs')).href);
const CH = await import(pathToFileURL(join(OUT, 'challenge.mjs')).href);
const LG = await import(pathToFileURL(join(OUT, 'logos.mjs')).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;

const call = async (handler, method, url, body) => {
  const req = new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const r = await handler(req);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json };
};
const row = (id) => db.rows('conversations').find((r) => r.id === id);
const MEM = { goals: ['Choose between the two offers'], values: ['The team matters most'], constraints: [], preferences: [], decisions: [], uncertainties: ['Whether the salary gap matters'], insights: [], emergingUnderstanding: [], thinkingStyle: [], latestInsight: null, lastInsightAtTurn: 0, latestSynthesis: null, lastSynthesisAtTurn: 0 };
const msgs = [{ role: 'user', content: 'Two job offers — which?' }, { role: 'assistant', content: 'It comes down to the team.' }];
const seed = (rows) => {
  for (const r of rows) db.rows('conversations').push({ title: 'A chat', messages: msgs, memory: MEM, map: null, draft: null, contexts: null, project_id: null, updated_at: 1000, incognito: false, ...r });
};

console.log('\n=== a save keeps the memory it was not sent ===');
{
  db.reset();
  globalThis.__uid = 'u1';
  seed([{ id: 'c1', user_id: 'u1', kind: 'chat' }]);
  // what Logos 5 sends: the conversation without its memory
  const r = await call(C.PUT, 'PUT', '/api/conversations', { conversation: { id: 'c1', title: 'Two job offers', messages: [...msgs, { role: 'user', content: 'And the salary?' }], map: { nodes: [{ id: 'n1', label: 'Better team', type: 'claim' }], edges: [] }, kind: 'logos', updatedAt: 2000 } });
  ok('saved', r.status === 200, J(r));
  ok('the memory is still there', J(row('c1').memory) === J(MEM), J(row('c1').memory));
  ok('and what was sent is saved', row('c1').messages.length === 3 && row('c1').kind === 'logos');
  const sent = await call(C.PUT, 'PUT', '/api/conversations', { conversation: { id: 'c1', title: 'Two job offers', messages: msgs, memory: { goals: ['Take the one with the better team'] }, updatedAt: 3000 } });
  ok('a client that sends a memory still replaces it', sent.status === 200 && J(row('c1').memory?.goals) === J(['Take the one with the better team']) && row('c1').memory?.values?.length === 0, J(row('c1').memory));
  const fresh = await call(C.PUT, 'PUT', '/api/conversations', { conversation: { id: 'c2', title: 'Fresh', messages: msgs, kind: 'logos', updatedAt: 4000 } });
  ok('a new row starts with an empty memory', fresh.status === 200 && row('c2') && row('c2').memory && typeof row('c2').memory === 'object', J(row('c2')));
}

console.log('\n=== …on the older database too, where Logos keeps its fields in the memory ===');
{
  db.reset();
  globalThis.__uid = 'u1';
  db.missing.conversations = new Set(['kind', 'map', 'draft', 'contexts', 'project_id']);
  db.rows('conversations').push({ id: 'old', user_id: 'u1', title: 'Old', messages: msgs, memory: { ...MEM, __logos: { kind: 'chat' } }, updated_at: 1 });
  const r = await call(C.PUT, 'PUT', '/api/conversations', { conversation: { id: 'old', title: 'Old', messages: msgs, map: { nodes: [{ id: 'n', label: 'An idea', type: 'idea' }], edges: [] }, kind: 'logos', updatedAt: 2 } });
  const m = row('old').memory;
  ok('saved', r.status === 200, J(r));
  ok('the memory kept, with the Logos fields beside it', J(m.goals) === J(MEM.goals) && J(m.uncertainties) === J(MEM.uncertainties) && m.__logos?.kind === 'logos' && m.__logos?.map?.nodes?.length === 1, J(m));
}

console.log('\n=== the Core chats, brought into Logos 5 ===');
{
  db.reset();
  globalThis.__uid = 'u1';
  seed([
    { id: 'core1', user_id: 'u1', kind: 'chat', updated_at: 111 },
    { id: 'core2', user_id: 'u1', kind: null, updated_at: 222 },
    { id: 'logos1', user_id: 'u1', kind: 'logos', updated_at: 333 },
    { id: 'secret', user_id: 'u1', kind: 'chat', incognito: true },
    { id: 'theirs', user_id: 'u2', kind: 'chat' },
  ]);
  const before = J(db.rows('conversations').map((r) => [r.id, r.messages, r.memory, r.updated_at, r.title, r.map]));
  const r = await call(M.POST, 'POST', '/api/conversations/merge');
  ok('moved', r.status === 200 && r.json?.already === false, J(r));
  ok('every Core chat of theirs, an unmarked one too — not one already in Logos — newest first', J(r.json?.moved) === J(['core2', 'core1']), J(r.json));
  ok('their kind is Logos now', row('core1').kind === 'logos' && row('core2').kind === 'logos');
  ok('never an incognito one, never someone else’s', row('secret').kind === 'chat' && row('theirs').kind === 'chat');
  ok('nothing else about any of them changed — not the words, the memory, the title, the map, or when', J(db.rows('conversations').map((r) => [r.id, r.messages, r.memory, r.updated_at, r.title, r.map])) === before);
  const profile = db.rows('user_profiles').find((p) => p.user_id === 'u1');
  ok('recorded on the account, once', r.json?.recorded === true && typeof profile?.first_run?.at?.['logos.merged'] === 'number', J(profile));
  // a Core chat there since — begun on Core 4 after the move
  row('core1').kind = 'chat';
  const again = await call(M.POST, 'POST', '/api/conversations/merge');
  ok('a second time, nothing moves — not a Core chat begun since either', again.status === 200 && again.json?.already === true && again.json?.moved?.length === 0 && row('core1').kind === 'chat', J(again.json));
  globalThis.__uid = 'u2';
  const other = await call(M.POST, 'POST', '/api/conversations/merge');
  ok('another person’s are their own: moved on their first visit', other.json?.moved?.length === 1 && row('theirs').kind === 'logos' && row('core1').kind === 'chat');
  const otherProfile = db.rows('user_profiles').find((p) => p.user_id === 'u2');
  ok('  recorded on their own record, the first person’s untouched', typeof otherProfile?.first_run?.at?.['logos.merged'] === 'number' && db.rows('user_profiles').length === 2);
}

console.log('\n=== a record already held is added to, never replaced ===');
{
  db.reset();
  globalThis.__uid = 'u1';
  db.rows('user_profiles').push({ user_id: 'u1', profile: 'hello', updated_at: 1, first_run: { v: 1, at: { 'socria.intro': 5, 'logos.first': 7 } } });
  seed([{ id: 'k', user_id: 'u1', kind: 'chat' }]);
  await call(M.POST, 'POST', '/api/conversations/merge');
  const p = db.rows('user_profiles')[0];
  ok('what they had been taught is kept, beside the merge', p.first_run.at['socria.intro'] === 5 && p.first_run.at['logos.first'] === 7 && typeof p.first_run.at['logos.merged'] === 'number' && p.profile === 'hello', J(p));
}

console.log('\n=== older databases ===');
{
  db.reset();
  globalThis.__uid = 'u1';
  db.missing.user_profiles = new Set(['first_run']);
  seed([{ id: 'a', user_id: 'u1', kind: 'chat' }]);
  const r = await call(M.POST, 'POST', '/api/conversations/merge');
  ok('no first-run column: moved, and it says it could not record it', r.status === 200 && r.json?.moved?.length === 1 && r.json?.recorded === false && row('a').kind === 'logos', J(r));

  db.reset();
  db.missing.conversations = new Set(['incognito']);
  seed([{ id: 'b', user_id: 'u1', kind: 'chat' }]);
  for (const r of db.rows('conversations')) delete r.incognito;
  const r2 = await call(M.POST, 'POST', '/api/conversations/merge');
  ok('no incognito column: nothing is incognito, so all of them move', r2.status === 200 && r2.json?.moved?.length === 1 && row('b').kind === 'logos', J(r2));

  db.reset();
  db.missing.conversations = new Set(['kind', 'map', 'draft', 'contexts', 'project_id']);
  db.rows('conversations').push({ id: 'c', user_id: 'u1', title: 'C', messages: msgs, memory: MEM, updated_at: 1 });
  const r3 = await call(M.POST, 'POST', '/api/conversations/merge');
  ok('no kind column: nothing moves, and it says what to run', r3.status === 409 && /schema\.sql/.test(r3.json?.error ?? '') && J(row('c').memory) === J(MEM), J(r3));
}

console.log('\n=== the maps drawn in the background leave out every chat kept quiet ===');
{
  db.reset();
  globalThis.__uid = 'u1';
  seed([
    { id: 'plain', user_id: 'u1', kind: 'chat' },
    { id: 'offrecord', user_id: 'u1', kind: 'chat' },
    { id: 'tohimself', user_id: 'u1', kind: 'chat' },
    { id: 'weighty', user_id: 'u1', kind: 'chat' },
    { id: 'weighty3', user_id: 'u1', kind: 'chat' },
    { id: 'remembered', user_id: 'u1', kind: 'chat' },
  ]);
  db.rows('core4_state').push(
    { user_id: 'u1', conversation_id: 'offrecord', state: { persistPolicy: 'none' }, updated_at: 1 },
    { user_id: 'u1', conversation_id: 'tohimself', state: { persistPolicy: 'conversation_only' }, updated_at: 1 },
    { user_id: 'u1', conversation_id: 'remembered', state: { persistPolicy: 'full' }, updated_at: 1 },
    { user_id: 'u2', conversation_id: 'plain', state: { persistPolicy: 'none' }, updated_at: 1 },
  );
  db.rows('mind_nodes').push(
    { user_id: 'u1', id: 'm1', type: 'feeling', label: 'Grief', private: true, provenance: [{ surface: 'core', conversationId: 'weighty' }] },
    { user_id: 'u1', id: 'm2', type: 'fact', label: 'Works in design', private: false, provenance: [{ surface: 'core', conversationId: 'plain' }] },
  );
  db.rows('user_profiles').push({ user_id: 'u1', updated_at: 1, understanding: { entries: [{ id: 'e1', kind: 'value', text: 'Family first', private: true, source: { surface: 'core', conversationId: 'weighty3' } }, { id: 'e2', kind: 'fact', text: 'Lives in Austin', source: { surface: 'core', conversationId: 'remembered' } }] } });
  const r = await call(M.POST, 'POST', '/api/conversations/merge');
  ok('every one of them is brought in', r.status === 200 && r.json?.moved?.length === 6, J(r.json));
  ok('but only the ones not kept quiet are drawn in the background', J([...(r.json?.draw ?? [])].sort()) === J(['plain', 'remembered']), J(r.json?.draw));
  ok('the record of the move kept the memory entries beside it', db.rows('user_profiles')[0].understanding?.entries?.length === 2 && typeof db.rows('user_profiles')[0].first_run?.at?.['logos.merged'] === 'number');

  db.reset();
  db.absent.add('core4_state');
  seed([{ id: 'x', user_id: 'u1', kind: 'chat' }]);
  const r2 = await call(M.POST, 'POST', '/api/conversations/merge');
  ok('when what would say so cannot be read, none are drawn in the background — and still every chat is brought in', r2.status === 200 && r2.json?.moved?.length === 1 && r2.json?.draw?.length === 0 && row('x').kind === 'logos', J(r2.json));

  db.reset();
  db.absent.add('mind_nodes');
  seed([{ id: 'y', user_id: 'u1', kind: 'chat' }]);
  const r3 = await call(M.POST, 'POST', '/api/conversations/merge');
  ok('with no memory tables there is no private memory: it is drawn', J(r3.json?.draw) === J(['y']), J(r3.json));
}

console.log('\n=== a map drawn in the background is written alone ===');
{
  db.reset();
  globalThis.__uid = 'u1';
  const later = [...msgs, { role: 'user', content: 'Said since, on my phone.' }];
  seed([
    { id: 'c', user_id: 'u1', kind: 'logos', messages: later, updated_at: 5000 },
    { id: 'drawn', user_id: 'u1', kind: 'logos', map: { nodes: [{ id: 'mine', label: 'Mine, by hand' }], edges: [] } },
    { id: 'shared1', user_id: 'u1', kind: 'logos' },
    { id: 'theirs', user_id: 'u2', kind: 'logos' },
  ]);
  db.rows('shares').push({ id: 'sh1', resource_type: 'conversation', resource_id: 'shared1', owner_id: 'u1', link_role: 'viewer', created_at: 1, updated_at: 1 });
  const five = { nodes: ['Two job offers', 'Better team', 'Higher salary', 'Monthly runway', 'Commute time'].map((label, i) => ({ id: `n${i}`, label })), edges: [1, 2, 3, 4].map((i) => ({ from: 'n0', to: `n${i}` })) };
  const r = await call(C.PATCH, 'PATCH', '/api/conversations', { id: 'c', firstMap: five });
  ok('written', r.status === 200 && r.json?.kept === false, J(r));
  ok('the map, marked unopened', row('c').map?.nodes?.length === 5 && row('c').map?.unopened === true, J(row('c').map));
  ok('and nothing else: what was said since stays, and when it was last worked on', row('c').messages.length === 3 && row('c').messages[2].content === 'Said since, on my phone.' && row('c').updated_at === 5000 && J(row('c').memory) === J(MEM));
  const over = await call(C.PATCH, 'PATCH', '/api/conversations', { id: 'drawn', firstMap: five });
  ok('never over a map already there', over.json?.kept === true && row('drawn').map.nodes.length === 1 && row('drawn').map.nodes[0].label === 'Mine, by hand', J(row('drawn').map));
  const sh = await call(C.PATCH, 'PATCH', '/api/conversations', { id: 'shared1', firstMap: five });
  ok('never onto a shared one: its map goes through the share routes', sh.json?.kept === true && row('shared1').map === null, J(sh.json));
  const nobody = await call(C.PATCH, 'PATCH', '/api/conversations', { id: 'theirs', firstMap: five });
  ok('never onto someone else’s', nobody.status === 404 && row('theirs').map === null);
  seed([{ id: 'bare', user_id: 'u1', kind: 'logos' }]);
  const blank = await call(C.PATCH, 'PATCH', '/api/conversations', { id: 'bare', firstMap: { nodes: [], edges: [] } });
  ok('nothing to draw, nothing written', blank.status === 400 && row('bare').map === null, J(blank));

  // the 5-Node Challenge, as the rewards route reads the row (lib/rewards/rewards-server.ts)
  const asRead = () => [{ id: 'c', map: row('c').map, messages: row('c').messages }];
  const cfg = { nodes: 5, minOwnWords: 3 };
  ok('the challenge does not read a map drawn in the background', CH.evaluateChallenge(asRead(), cfg).qualifies === false && CH.evaluateChallenge(asRead(), cfg).progress === 0, J(CH.evaluateChallenge(asRead(), cfg)));
  const opened = await call(C.PATCH, 'PATCH', '/api/conversations', { id: 'c', opened: true });
  ok('opened in Logos: the mark is taken away, and nothing else changes', opened.json?.changed === true && row('c').map.unopened === undefined && row('c').map.nodes.length === 5 && row('c').updated_at === 5000 && row('c').messages.length === 3, J(row('c').map));
  ok('…and from then on it counts, as a Core chat opened in Logos always did', CH.evaluateChallenge(asRead(), cfg).qualifies === true);
  const again = await call(C.PATCH, 'PATCH', '/api/conversations', { id: 'drawn', opened: true });
  ok('opening one that was never marked changes nothing', again.json?.changed === false && J(row('drawn').map.nodes) === J([{ id: 'mine', label: 'Mine, by hand' }]));

  // the mark is the server's to set: no extractor, and no ordinary save, can carry it in
  ok('read back from storage, the mark stays', LG.sanitizeMap({ nodes: [{ id: 'a', label: 'An idea' }], edges: [], unopened: true }, { trust: 'stored' }).unopened === true);
  ok('anywhere else it is dropped', LG.sanitizeMap({ nodes: [{ id: 'a', label: 'An idea' }], edges: [], unopened: true }).unopened === undefined);
  await call(C.PUT, 'PUT', '/api/conversations', { conversation: { id: 'c', title: 'A chat', messages: later, map: { ...five, unopened: true }, kind: 'logos', updatedAt: 6000 } });
  ok('so a whole save cannot set it', row('c').map.unopened === undefined);
}

console.log('\n=== signed out ===');
{
  db.reset();
  globalThis.__uid = null;
  const r = await call(M.POST, 'POST', '/api/conversations/merge');
  ok('refused', r.status === 401);
  const p = await call(C.PATCH, 'PATCH', '/api/conversations', { id: 'c', firstMap: { nodes: [{ id: 'a', label: 'An idea' }], edges: [] } });
  ok('and no map written', p.status === 401);
}

console.log('\n=== the pure parts ===');
{
  ok('the ones to bring in: not Logos, not incognito', J(P.candidatesForMerge([{ id: 'a', kind: 'chat' }, { id: 'b' }, { id: 'c', kind: 'logos' }, { id: 'd', kind: 'chat', incognito: true }, { id: 'e', kind: null }])) === J(['a', 'b', 'e']));
  ok('in pieces', J(P.chunked([1, 2, 3, 4, 5], 2)) === J([[1, 2], [3, 4], [5]]) && P.chunked([], 3).length === 0);
  const S = new Map();
  const store = { getItem: (k) => S.get(k) ?? null, setItem: (k, v) => S.set(k, v), removeItem: (k) => S.delete(k) };
  P.writeOwed(store, ['a', 'b', 'a', 'bad id!']);
  ok('the maps owed are kept, once each, ids only', J(P.readOwed(store)) === J(['a', 'b']));
  P.writeOwed(store, []);
  ok('and forgotten when none are left', !S.has(P.OWED_KEY) && J(P.readOwed(store)) === '[]');
  ok('a damaged store reads as none', J(P.readOwed({ getItem: () => '{nope', setItem() {}, removeItem() {} })) === '[]');
  const sessions = [
    { id: 'gone-said', messages: [], map: { nodes: [] } },
    { id: 'drawn', messages: msgs, map: { nodes: [{}] } },
    { id: 'open', messages: msgs, map: { nodes: [] } },
    { id: 'next', messages: msgs, map: { nodes: [] } },
    { id: 'shared', messages: msgs, map: { nodes: [] } },
  ];
  const n = P.nextOwed(['missing', 'gone-said', 'drawn', 'shared', 'open', 'next'], sessions, new Set(['shared']), 'open');
  ok('the next owed: gone, empty, drawn and shared ones dropped; the open one left for itself', n.id === 'next' && J(n.drop) === J(['missing', 'gone-said', 'drawn', 'shared']), J(n));
  ok('none left', P.nextOwed(['drawn'], sessions).id === null);
  const quiet = P.quietConversations({
    states: [{ conversation_id: 'a', state: { persistPolicy: 'none' } }, { conversation_id: 'b', state: { persistPolicy: 'conversation_only' } }, { conversation_id: 'c', state: { persistPolicy: 'full' } }, { conversation_id: 'd', state: null }],
    privateNodes: [{ provenance: [{ conversationId: 'e' }, { conversationId: '' }, {}] }, { provenance: 'nope' }],
    entries: [{ private: true, source: { conversationId: 'f' } }, { private: false, source: { conversationId: 'g' } }, null],
  });
  ok('kept quiet: off the record, kept to itself, a private memory’s source — nothing else', J([...quiet].sort()) === J(['a', 'b', 'e', 'f']), J([...quiet]));
  ok('nothing known, nothing quiet', P.quietConversations({}).size === 0);
  const D = new Map();
  const day = { getItem: (k) => D.get(k) ?? null, setItem: (k, v) => D.set(k, v), removeItem: (k) => D.delete(k) };
  P.countDrawn(day, '2026-10-21');
  P.countDrawn(day, '2026-10-21');
  ok('drawn today, counted', P.drawnOn(day, '2026-10-21') === 2 && P.OWED_PER_DAY > 0 && P.OWED_PER_DAY <= 300);
  ok('a new day starts again', P.drawnOn(day, '2026-10-22') === 0 && (P.countDrawn(day, '2026-10-22'), P.drawnOn(day, '2026-10-22') === 1));
  ok('a damaged count reads as none', P.drawnOn({ getItem: () => '{"day":"2026-10-21","n":"many"}' }, '2026-10-21') === 0);
}

console.log(`\nmerge-chats-e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
