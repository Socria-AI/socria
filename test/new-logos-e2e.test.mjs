// NEW LOGOS, END TO END THROUGH THE REAL ROUTES (docs/NEW-LOGOS.md).
//
// The New Logos routes and the EXISTING conversations route, bundled with the fake database and the fake Clerk, so
// what is checked is what production runs:
//   • conversations are one set of rows: what New Logos saves, the existing interface lists, and the reverse;
//   • a New Logos save keeps the conversation's map, draft and attached contexts (the save rewrites the whole row,
//     so a save that dropped them would erase them for the other interface) — and when the other interface wrote in
//     between, the turns of both are kept;
//   • placing a conversation in an objective, or removing that placement, never touches its messages or its row;
//   • one account cannot see, place, edit or be told about another's conversations or nodes;
//   • before the migration has run, organisation answers { setup: false } and conversations keep working.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-new-logos');
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
const ROUTES = [
  ['convs', 'app/api/conversations/route.ts'],
  ['convOne', 'app/api/conversations/[id]/route.ts'],
  ['nodes', 'app/api/new-logos/nodes/route.ts'],
  ['node', 'app/api/new-logos/nodes/[id]/route.ts'],
  ['rels', 'app/api/new-logos/relations/route.ts'],
  ['rel', 'app/api/new-logos/relations/[id]/route.ts'],
  ['ctx', 'app/api/new-logos/context/route.ts'],
  ['canvas', 'app/api/new-logos/canvas/route.ts'],
  ['helpers', 'lib/new-logos/convo.ts'],
];
for (const [name, file] of ROUTES) {
  await build({ entryPoints: [join(root, file)], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, `${name}.mjs`), tsconfig: join(root, 'tsconfig.json'), plugins: [swap], packages: 'external', logLevel: 'error' });
}
console.error = () => {};
console.warn = () => {};
process.env.RATE_LIMIT_DISABLED = '1';
process.env.OPENAI_API_KEY = 'test';

const { db } = await import(pathToFileURL(H('fake-supabase.mjs')).href);
const { NextRequest } = await import('next/server.js');
const R = {};
for (const [name] of ROUTES) R[name] = await import(pathToFileURL(join(OUT, `${name}.mjs`)).href);
const C = R.helpers;

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));

globalThis.__users = { una: { firstName: 'Una', emails: ['una@example.com'] }, vic: { firstName: 'Vic', emails: ['vic@example.com'] } };
const as = (u) => (globalThis.__uid = u);
const req = (method, url, body) => new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const call = async (fn, method, url, body, params) => {
  const r = await fn(req(method, url, body), params ? { params } : undefined);
  return { status: r.status, json: await r.json().catch(() => null) };
};
const listConvs = async () => (await call(R.convs.GET, 'GET', '/api/conversations')).json?.conversations ?? [];
const putConv = (conversation) => call(R.convs.PUT, 'PUT', '/api/conversations', { conversation });
const nodes = () => call(R.nodes.GET, 'GET', '/api/new-logos/nodes');
const create = (b) => call(R.nodes.POST, 'POST', '/api/new-logos/nodes', b);
const patch = (id, b) => call(R.node.PATCH, 'PATCH', `/api/new-logos/nodes/${id}`, b, { id });
const del = (id) => call(R.node.DELETE, 'DELETE', `/api/new-logos/nodes/${id}`, null, { id });
const row = (id) => db.rows('conversations').find((r) => r.id === id) ?? null;
const t0 = 1_700_000_000_000;
const MAP = { nodes: [{ id: 'k1', type: 'idea', label: 'Supply shocks', status: 'open' }], edges: [] };

console.log('=== before the migration: organisation waits, conversations do not ===');
{
  db.reset();
  db.absent.add('nl_nodes');
  db.absent.add('nl_relations');
  as('una');
  const g = await nodes();
  ok('listing nodes answers setup:false, not an error', g.status === 200 && g.json.setup === false);
  const c = await create({ type: 'objective', title: 'x' });
  ok('creating a node says it is not set up (503), and nothing is written', c.status === 503 && c.json.code === 'setup' && !db.rows('nl_nodes').length);
  const p = await putConv({ id: 'lg_before', title: 'Still works', messages: [{ role: 'user', content: 'hello' }], updatedAt: t0, base: null, known: false });
  ok('conversations still save through the existing route', p.status === 200 && row('lg_before')?.messages.length === 1);
}

console.log('\n=== signed out ===');
{
  db.reset();
  as(null);
  ok('nodes: 401', (await nodes()).status === 401);
  ok('create: 401', (await create({ type: 'objective', title: 'x' })).status === 401);
  ok('context: 401', (await call(R.ctx.GET, 'GET', '/api/new-logos/context?conversation=lg_x')).status === 401);
}

console.log('\n=== one set of conversations, both ways ===');
let obj, sub, convNode;
{
  db.reset();
  as('una');
  // a conversation begun in the existing interface, with a map, a draft and attached contexts
  const first = await putConv({ id: 'lg_old', title: 'Monetary policy', kind: 'logos', messages: [{ id: 'm_aaaaaa01', at: t0, role: 'user', content: 'What is NGDP targeting?' }, { id: 'm_aaaaaa02', at: t0, role: 'assistant', content: 'A rule for…' }], map: MAP, draft: { title: 'Essay', html: '<p>Draft</p>', doc: { v: 1, blocks: [] } }, contexts: [], updatedAt: t0, base: null, known: false });
  ok('the existing interface saved a conversation', first.status === 200);
  const listed = await listConvs();
  const held = listed.find((c) => c.id === 'lg_old');
  ok('New Logos reads it from the same list', !!held && held.messages.length === 2);
  const mapBefore = JSON.stringify(row('lg_old').map);
  const draftBefore = JSON.stringify(row('lg_old').draft);

  // a turn in New Logos, saved through the existing route with the whole row
  const next = { ...held, messages: [...held.messages, C.newMessage('user', 'And its risks?', t0 + 10), C.newMessage('assistant', 'Two risks…', t0 + 11)] };
  const s1 = await call(R.convs.PUT, 'PUT', '/api/conversations', C.saveBody(next, held.updatedAt, true, t0 + 20));
  ok('a New Logos save lands', s1.status === 200 && s1.json.ok, JSON.stringify(s1.json));
  ok('…the messages are appended', row('lg_old').messages.map((m) => m.content).join('|') === 'What is NGDP targeting?|A rule for…|And its risks?|Two risks…');
  ok('…the map is kept exactly', JSON.stringify(row('lg_old').map) === mapBefore, JSON.stringify(row('lg_old').map));
  ok('…the draft is kept exactly', JSON.stringify(row('lg_old').draft) === draftBefore);
  ok('…the title and surface are kept', row('lg_old').title === 'Monetary policy' && row('lg_old').kind === 'logos');
  ok('the existing interface sees the New Logos turns', (await listConvs()).find((c) => c.id === 'lg_old').messages.length === 4);

  // both write: the existing interface adds a turn, then New Logos saves from the copy it held before that
  const now1 = (await listConvs()).find((c) => c.id === 'lg_old');
  await putConv({ ...now1, messages: [...now1.messages, { id: 'm_bbbbbb01', at: t0 + 30, role: 'user', content: 'From the other interface' }], base: now1.updatedAt, known: true, updatedAt: t0 + 30 });
  const stale = { ...now1, messages: [...now1.messages, C.newMessage('user', 'From New Logos', t0 + 31)] };
  const s2 = await call(R.convs.PUT, 'PUT', '/api/conversations', C.saveBody(stale, now1.updatedAt, true, t0 + 32));
  ok('a save from a copy that is behind is merged, not written over', s2.status === 200 && s2.json.merged === true);
  const said = row('lg_old').messages.map((m) => m.content);
  ok("…both interfaces' turns are kept", said.includes('From the other interface') && said.includes('From New Logos'), said.join('|'));
  ok('…and the map is still there', JSON.stringify(row('lg_old').map) === mapBefore);

  // a conversation begun in New Logos appears in the existing interface's list
  const fresh = { id: C.newConversationId(), title: C.titleFromMessage('Plan the thesis chapters'), messages: [C.newMessage('user', 'Plan the thesis chapters', t0 + 40)], kind: 'logos', updatedAt: 0 };
  const s3 = await call(R.convs.PUT, 'PUT', '/api/conversations', C.saveBody(fresh, null, false, t0 + 41));
  ok('a conversation begun in New Logos is created in the same table', s3.status === 200 && !!row(fresh.id));
  ok('…and listed for the existing interface, as a conversation it opens', (await listConvs()).some((c) => c.id === fresh.id && c.kind === 'logos' && c.title === 'Plan the thesis chapters'));
  ok('no second conversation store exists', Object.keys(db.tables).every((t) => !/conversation/.test(t) || t === 'conversations'));

  // renaming through the existing rename touches only the title
  const rn = await call(R.convs.PATCH, 'PATCH', '/api/conversations', { id: 'lg_old', title: 'Monetary policy (renamed)' });
  ok('a rename from New Logos uses the existing rename, title only', rn.status === 200 && row('lg_old').title === 'Monetary policy (renamed)' && JSON.stringify(row('lg_old').map) === mapBefore);
}

console.log('\n=== placing conversations in objectives ===');
{
  const o = await create({ type: 'objective', title: 'Write the macro essay', content: { outcome: 'A first-class essay' } });
  obj = o.json.node;
  ok('an objective is created', o.status === 200 && obj.type === 'objective' && obj.content.outcome === 'A first-class essay');
  sub = (await create({ type: 'objective', title: 'Understand NGDP targeting', parentId: obj.id })).json.node;
  ok('an objective inside it', sub.parent_id === obj.id);
  const nope = await create({ type: 'conversation', conversationId: 'lg_missing', parentId: sub.id });
  ok('a conversation that does not exist cannot be placed', nope.status === 404 && nope.json.code === 'conversation_unknown');
  const before = JSON.stringify(row('lg_old'));
  const pc = await create({ type: 'conversation', conversationId: 'lg_old', parentId: sub.id });
  convNode = pc.json.node;
  ok('a conversation is placed in an objective', pc.status === 200 && convNode.conversation_id === 'lg_old' && convNode.parent_id === sub.id);
  ok('placing it changed nothing in the conversation', JSON.stringify(row('lg_old')) === before);
  const q = (await create({ type: 'question', title: 'What are the risks?', parentId: sub.id })).json.node;
  const d = (await create({ type: 'decision', title: 'Argue for NGDP targeting', parentId: sub.id, content: { rationale: 'Handles supply shocks' } })).json.node;
  const acc = await patch(d.id, { action: 'accept', version: d.version });
  ok('a decision is accepted by the accept action', acc.status === 200 && acc.json.node.state === 'accepted');
  const k = (await create({ type: 'knowledge', title: 'Expectations stayed anchored', provenance: { origin: 'external', source: { label: 'Bulletin 2019' } } })).json.node;
  const link = await call(R.rels.POST, 'POST', '/api/new-logos/relations', { fromId: k.id, toId: sub.id, kind: 'informs' });
  ok('knowledge at the top level informs the objective by a relation', link.status === 200 && link.json.relation.kind === 'informs');
  await call(R.rels.POST, 'POST', '/api/new-logos/relations', { fromId: convNode.id, toId: q.id, kind: 'investigates' });

  const ctx = await call(R.ctx.GET, 'GET', '/api/new-logos/context?conversation=lg_old&turns=5');
  const turn = ctx.json.turn;
  ok('the context route assembles the objective context', ctx.status === 200 && turn?.objective.goal === 'Understand NGDP targeting');
  ok('…with the path above, decisions, questions and related knowledge', turn.objective.notes.some((n) => n.t.includes('Write the macro essay')) && turn.work.decisions[0].startsWith('Argue for NGDP targeting') && turn.work.questions.includes('What are the risks?') && turn.work.sources.includes('Expectations stayed anchored (source: Bulletin 2019)'));
  const unplacedCtx = await call(R.ctx.GET, 'GET', `/api/new-logos/context?conversation=${encodeURIComponent((await listConvs()).find((c) => c.id !== 'lg_old').id)}&turns=1`);
  ok('a conversation in no objective has no context', unplacedCtx.json.turn === null);

  const cyc = await patch(obj.id, { action: 'move', parentId: sub.id, version: obj.version });
  ok('a cycle is refused through the route too (409)', cyc.status === 409 && cyc.json.code === 'cycle');
  const g = await nodes();
  ok('the list holds the nodes and relations', g.json.setup === true && g.json.nodes.length === 6 && g.json.relations.length === 2);
}

console.log('\n=== removing never deletes a conversation ===');
{
  const msgs = JSON.stringify(row('lg_old').messages);
  const arch = await patch(convNode.id, { action: 'archive', version: convNode.version });
  ok('archiving the placement is allowed', arch.status === 200 && arch.json.node.archived_at !== null);
  ok('…the conversation is untouched', row('lg_old') && JSON.stringify(row('lg_old').messages) === msgs);
  const rm = await del(convNode.id);
  ok('removing the placement for good is allowed', rm.status === 200 && rm.json.deleted.conversationId === 'lg_old');
  ok('…and the conversation is still there, listed, with every message', !!row('lg_old') && (await listConvs()).some((c) => c.id === 'lg_old') && JSON.stringify(row('lg_old').messages) === msgs);
  const busy = await del(obj.id);
  ok('an objective with contents cannot be deleted (409)', busy.status === 409 && busy.json.code === 'has_children');
  const live = await del(sub.id);
  ok('…nor one that is not archived', live.status === 409);
}

console.log('\n=== another account sees nothing ===');
{
  as('vic');
  ok('their node list is empty', (await nodes()).json.nodes.length === 0);
  ok("their conversation list does not include Una's", !(await listConvs()).some((c) => c.id === 'lg_old'));
  const steal = await create({ type: 'conversation', conversationId: 'lg_old' });
  ok("they cannot place Una's conversation (404)", steal.status === 404 && !db.rows('nl_nodes').some((n) => n.user_id === 'vic'));
  const edit = await patch(obj.id, { action: 'update', version: obj.version, title: 'Taken' });
  ok("they cannot edit Una's objective (404)", edit.status === 404 && db.rows('nl_nodes').find((n) => n.id === obj.id).title === 'Write the macro essay');
  const rm = await del(obj.id);
  ok("they cannot delete Una's objective (404)", rm.status === 404 && db.rows('nl_nodes').some((n) => n.id === obj.id));
  const into = await create({ type: 'question', title: 'x', parentId: obj.id });
  ok("they cannot add to Una's objective", into.status === 400 && into.json.code === 'bad_parent');
  const ctx = await call(R.ctx.GET, 'GET', '/api/new-logos/context?conversation=lg_old&turns=1');
  ok("they are told nothing about Una's conversation", ctx.status === 200 && ctx.json.turn === null);
  const rels = db.rows('nl_relations');
  const unlink = await call(R.rel.DELETE, 'DELETE', `/api/new-logos/relations/${rels[0].id}`, null, { id: rels[0].id });
  ok("they cannot remove Una's relation", unlink.status === 404 && db.rows('nl_relations').length === rels.length);
  const versions = await call(R.node.GET, 'GET', `/api/new-logos/nodes/${obj.id}`, null, { id: obj.id });
  ok("they cannot read Una's node or its versions", versions.status === 404);
}

console.log('\n=== canvas layouts: presentation, owner-scoped, versioned ===');
{
  as('una');
  const getL = (key) => call(R.canvas.GET, 'GET', `/api/new-logos/canvas?key=${encodeURIComponent(key)}`);
  const putL = (b) => call(R.canvas.PUT, 'PUT', '/api/new-logos/canvas', b);
  const fresh = await getL('c:lg_old');
  ok('a canvas never saved is empty, at version 0', fresh.status === 200 && fresh.json.version === 0 && Object.keys(fresh.json.layout.items).length === 0);
  const before = JSON.stringify(row('lg_old'));
  const s1 = await putL({ key: 'c:lg_old', version: 0, layout: { items: { 'x:m_aaaaaa01': { x: 40, y: 80, open: true }, 'bad ref': { x: 1, y: 1 } }, view: { x: 10, y: 20, k: 0.8 } } });
  ok('a layout is saved', s1.status === 200 && s1.json.version === 1);
  const got = await getL('c:lg_old');
  ok('…cleaned on the way in', got.json.layout.items['x:m_aaaaaa01'].x === 40 && !got.json.layout.items['bad ref'] && got.json.layout.view.k === 0.8);
  ok('saving a layout never touches the conversation', JSON.stringify(row('lg_old')) === before);
  const stale = await putL({ key: 'c:lg_old', version: 0, layout: { items: { 'x:m_aaaaaa01': { x: 999, y: 999 } } } });
  ok('a save from a stale copy is refused with the newer layout (409)', stale.status === 409 && stale.json.version === 1 && stale.json.layout.items['x:m_aaaaaa01'].x === 40);
  const s2 = await putL({ key: 'c:lg_old', version: 1, layout: { items: { 'x:m_aaaaaa01': { x: 41, y: 80 } } } });
  ok('a save from the current version lands', s2.status === 200 && s2.json.version === 2);
  ok('an unknown canvas key is refused', (await getL('z:nope')).status === 400 && (await putL({ key: '../x', version: 0, layout: {} })).status === 400);
  const big = await call(R.canvas.PUT, 'PUT', '/api/new-logos/canvas', { key: 'c:lg_old', version: 2, layout: { items: {}, pad: 'x'.repeat(500000) } });
  ok('an oversized layout is refused', big.status === 413);
  as('vic');
  const theirs = await getL('c:lg_old');
  ok("another account does not see this account's layout", theirs.json.version === 0 && Object.keys(theirs.json.layout.items).length === 0);
  await putL({ key: 'c:lg_old', version: 0, layout: { items: { 'x:m_aaaaaa01': { x: -5, y: -5 } } } });
  as('una');
  ok("…and cannot change it", (await getL('c:lg_old')).json.layout.items['x:m_aaaaaa01'].x === 41);
  as(null);
  ok('signed out: 401', (await getL('c:lg_old')).status === 401);
  as('una');
  db.absent.add('nl_canvases');
  const g = await getL('o:n_whatever');
  const pw = await putL({ key: 'o:n_whatever', version: 0, layout: { items: {} } });
  ok('before the migration: setup:false, and nothing written (the page keeps it in the browser)', g.status === 200 && g.json.setup === false && pw.status === 503);
  db.absent.delete('nl_canvases');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
