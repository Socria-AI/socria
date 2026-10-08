// Sharing, end to end, through the real routes, with five people.
//
//   alice  Socria One, owns a Project and its conversations
//   bob    free, invited by email as an editor
//   cara   free, joins by link as a viewer
//   erin   free, joins by code as a commenter
//   dan    a stranger with nobody's link
//   frank  free, owns something and tries to share it
//
// The route handlers are the real ones, bundled from app/api, against the
// in-memory database (which enforces the real keys), a Clerk that knows these
// six people, and a scripted model that records every system prompt. What is
// proved is the thing that matters: every permission is enforced on the
// server, two people writing at once both land, an owner's save does not
// erase a collaborator's turns, and nothing private — a memory, an email, the
// owner's instructions — reaches anyone it should not.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-share');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');
const FAKE_CLERK = join(here, 'helpers', 'fake-clerk.mjs');
const FAKE_OPENAI = join(here, 'helpers', 'fake-openai.mjs');
const SHIM = join(here, 'helpers', 'server-only-shim.mjs');

const ROUTES = {
  projects: 'app/api/projects/route.ts',
  home: 'app/api/projects/[id]/home/route.ts',
  conversations: 'app/api/conversations/route.ts',
  share: 'app/api/share/route.ts',
  accept: 'app/api/share/accept/route.ts',
  shared: 'app/api/shared/route.ts',
  sharedConvo: 'app/api/shared/conversation/[id]/route.ts',
  comments: 'app/api/shared/comments/route.ts',
  activity: 'app/api/shared/activity/route.ts',
  presence: 'app/api/shared/presence/route.ts',
  chat: 'app/api/chat/route.ts',
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
  if (first.startsWith('[') || first.startsWith('conversations') || first.startsWith('email')) return;
  orig(...a);
};
console.log = quietLog(console.log.bind(console));
console.error = quietLog(console.error.bind(console));
console.warn = quietLog(console.warn.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.SHARE_SECRET = 'test-share-secret';
process.env.SOCRIA_ONE_USER_IDS = 'alice';

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
  return { status: r.status, json, text };
};

db.reset();
globalThis.__users = {
  alice: { firstName: 'Alice', emails: ['alice@example.com'] },
  bob: { firstName: 'Bob', emails: ['bob@example.com'] },
  cara: { firstName: 'Cara', emails: ['cara@example.com'] },
  erin: { firstName: 'Erin', emails: ['erin@example.com'] },
  dan: { firstName: 'Dan', emails: ['dan@example.com'] },
  frank: { firstName: 'Frank', emails: ['frank@example.com'] },
};

// ── Alice's world ───────────────────────────────────────────────────
as('alice');
const created = await call(R.projects.POST, 'POST', '/api/projects', { name: 'Thesis', description: 'Sleep and memory' });
const pid = created.json?.project?.id;
ok('alice makes a Project', created.status === 200 && !!pid, created.text.slice(0, 200));
// her instructions to Socria, and memories tied to the Project — one private
const proj = db.rows('mind_projects').find((p) => p.id === pid);
proj.instructions = 'Push me hard on methodology; I am anxious about my advisor.';
const anchor = proj.node_id;
const mem = (id, type, label, extra = {}) => ({ user_id: 'alice', id, type, label, content: `${label}.`, aliases: [], status: 'active', confidence: .9, certainty: .9, importance: .7, activation: .5, seen: 1, private: false, provenance: [{ kind: 'stated', surface: 'core', at: 1, conversationId: 'c-thesis' }], created_at: 1, updated_at: 1, last_accessed: 1, ...extra });
db.rows('mind_nodes').push(
  mem('g1', 'Goal', 'Finish the literature review'),
  mem('b1', 'Belief', 'I always freeze in front of my advisor'),
  mem('x1', 'Decision', 'Started anxiety medication', { private: true }),
);
const edge = (id, s, t, r) => ({ user_id: 'alice', id, source_id: s, target_id: t, relationship: r, confidence: .8, strength: .6, provenance: [], created_at: 1, updated_at: 1, last_reinforced: 1 });
db.rows('mind_edges').push(edge('e1', 'g1', anchor, 'belongs_to'), edge('e2', 'b1', anchor, 'relevant_to'), edge('e3', 'x1', anchor, 'relevant_to'));

const save = (id, title, messages, extra = {}) =>
  call(R.conversations.PUT, 'PUT', '/api/conversations', { conversation: { id, title, messages, updatedAt: Date.now(), ...extra } });
await save('c-thesis', 'Thesis plan', [{ role: 'user', content: 'Where do I start?' }, { role: 'assistant', content: 'With the question.' }], { projectId: pid });
await save('c-lit', 'Literature', [{ role: 'user', content: 'Which papers?' }], { projectId: pid, kind: 'logos', map: { nodes: [{ id: 'a', type: 'question', label: 'Which papers matter most?' }], edges: [] } });
await save('c-diary', 'My private diary', [{ role: 'user', content: 'A very personal note' }]);
ok('alice has three conversations, two in the Project', db.rows('conversations').filter((c) => c.user_id === 'alice').length === 3);

console.log('=== hosting is Socria One; joining is free ===');
as('frank');
await save('f-1', 'Frank thinks', [{ role: 'user', content: 'hi' }]);
const frankLink = await call(R.share.POST, 'POST', '/api/share', { type: 'conversation', id: 'f-1', action: 'link', role: 'viewer' });
ok('a free owner cannot open a link', frankLink.status === 402 && frankLink.json?.upgrade === 'share', frankLink.text);
const frankInvite = await call(R.share.POST, 'POST', '/api/share', { type: 'conversation', id: 'f-1', action: 'invite', email: 'bob@example.com', role: 'viewer' });
ok('  nor invite anyone', frankInvite.status === 402);

console.log('=== only the owner shares ===');
as('dan');
const danShare = await call(R.share.POST, 'POST', '/api/share', { type: 'project', id: pid, action: 'link', role: 'editor' });
ok('a stranger cannot share someone else\'s Project', danShare.status === 402 || danShare.status === 404, danShare.text);
process.env.SOCRIA_ONE_USER_IDS = 'alice,dan';
const danShare2 = await call(R.share.POST, 'POST', '/api/share', { type: 'project', id: pid, action: 'link', role: 'editor' });
ok('  not even with Socria One', danShare2.status === 404, danShare2.text);
process.env.SOCRIA_ONE_USER_IDS = 'alice';
ok('  and cannot read who it is shared with', (await call(R.share.GET, 'GET', `/api/share?type=project&id=${pid}`)).status === 404);

console.log('=== inviting, by email, link and code ===');
as('alice');
const inv = await call(R.share.POST, 'POST', '/api/share', { type: 'project', id: pid, action: 'invite', email: 'Bob@Example.com ', role: 'editor' });
ok('bob, who has an account, is in at once', inv.status === 200 && inv.json?.invited?.known === true && inv.json.members.some((m) => m.name === 'Bob' && m.role === 'editor' && !m.pending), inv.text.slice(0, 300));
const inv2 = await call(R.share.POST, 'POST', '/api/share', { type: 'project', id: pid, action: 'invite', email: 'newcomer@example.com', role: 'viewer' });
ok('an address with no account is a pending invitation, with a link to send (email is off)', inv2.json?.invited?.known === false && /\/s\/i\//.test(inv2.json?.invited?.link ?? '') && inv2.json.members.some((m) => m.pending && m.email === 'newcomer@example.com'), inv2.text.slice(0, 300));
const badEmail = await call(R.share.POST, 'POST', '/api/share', { type: 'project', id: pid, action: 'invite', email: 'not an email', role: 'viewer' });
ok('a malformed address is refused', badEmail.status === 400);
const link = await call(R.share.POST, 'POST', '/api/share', { type: 'project', id: pid, action: 'link', role: 'viewer' });
const token = link.json?.link?.token;
ok('the owner turns on a view link', link.status === 200 && typeof token === 'string' && token.length >= 32, link.text.slice(0, 200));
ok('  the token is not stored', !JSON.stringify(db.rows('shares')).includes(token));
const again = await call(R.share.GET, 'GET', `/api/share?type=project&id=${pid}`);
ok('  and can be copied again later', again.json?.link?.token === token);
const code = (await call(R.share.POST, 'POST', '/api/share', { type: 'project', id: pid, action: 'code', role: 'commenter' })).json?.code?.code;
ok('an invite code, eight readable characters', /^[A-HJ-NP-Z2-9]{8}$/.test(code ?? ''), code);

as('cara');
const caraJoin = await call(R.accept.POST, 'POST', '/api/share/accept', { token });
ok('cara joins by link as a viewer, and lands on the Project\'s home', caraJoin.status === 200 && caraJoin.json.role === 'viewer' && caraJoin.json.open === `/chat?p=${pid}`, caraJoin.text);
as('erin');
const erinJoin = await call(R.accept.POST, 'POST', '/api/share/accept', { code: `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}` });
ok('erin joins by code (any case, with a dash) as a commenter', erinJoin.status === 200 && erinJoin.json.role === 'commenter', erinJoin.text);
as('dan');
const junk = await call(R.accept.POST, 'POST', '/api/share/accept', { token: 'x'.repeat(40) });
ok('a made-up link opens nothing', junk.status === 404);
as(null);
ok('joining needs an account', (await call(R.accept.POST, 'POST', '/api/share/accept', { token })).status === 401);

console.log('=== what each person can reach ===');
as('bob');
const bobHome = await call(R.home.GET, 'GET', `/api/projects/${pid}/home`, undefined, { id: pid });
ok('bob opens the Project\'s home as an editor', bobHome.status === 200 && bobHome.json.role === 'editor', bobHome.text.slice(0, 200));
ok('  he sees its conversations', bobHome.json.chats.map((c) => c.id).sort().join() === 'c-lit,c-thesis');
ok('  never one outside it', !bobHome.text.includes('My private diary'));
ok('  nor alice\'s instructions to Socria', bobHome.json.project.instructions === undefined && !bobHome.text.includes('methodology'));
ok('  nor anything Socria learned about alice — only the Project\'s goals', bobHome.text.includes('Finish the literature review') && !bobHome.text.includes('freeze in front of my advisor') && !bobHome.text.includes('medication'));
const aliceHome = await (as('alice'), call(R.home.GET, 'GET', `/api/projects/${pid}/home`, undefined, { id: pid }));
ok('alice\'s own home holds her tied memory, and still never the private one', aliceHome.text.includes('freeze in front of my advisor') && !aliceHome.text.includes('medication'));
as('bob');
const list = await call(R.shared.GET, 'GET', '/api/shared');
ok('"shared with you" lists the Project, from Alice', list.json?.items?.some((i) => i.type === 'project' && i.id === pid && i.owner === 'Alice' && i.role === 'editor'), list.text);
const bobState = await call(R.share.GET, 'GET', `/api/share?type=project&id=${pid}`);
ok('a member sees who is in — but no link, no code and no email address', bobState.status === 200 && bobState.json.link === null && bobState.json.code === null && !bobState.text.includes('@example.com'), bobState.text.slice(0, 300));
as('dan');
ok('a stranger gets the same 404 as a wrong id — home', (await call(R.home.GET, 'GET', `/api/projects/${pid}/home`, undefined, { id: pid })).status === 404);
ok('  — conversation', (await call(R.sharedConvo.GET, 'GET', '/api/shared/conversation/c-thesis', undefined, { id: 'c-thesis' })).status === 404);
ok('  — the private diary', (await call(R.sharedConvo.GET, 'GET', '/api/shared/conversation/c-diary', undefined, { id: 'c-diary' })).status === 404);
as('bob');
ok('a member of the Project cannot reach a conversation outside it', (await call(R.sharedConvo.GET, 'GET', '/api/shared/conversation/c-diary', undefined, { id: 'c-diary' })).status === 404);

console.log('=== roles, enforced on every write ===');
as('bob');
const bobConvo = await call(R.sharedConvo.GET, 'GET', '/api/shared/conversation/c-thesis', undefined, { id: 'c-thesis' });
ok('bob reaches the Project\'s conversation through the Project, as an editor', bobConvo.status === 200 && bobConvo.json.role === 'editor' && bobConvo.json.may.ask, bobConvo.text.slice(0, 200));
const base = bobConvo.json.conversation.updatedAt;
const bobAdd = await call(R.sharedConvo.POST, 'POST', '/api/shared/conversation/c-thesis', { base, append: [{ role: 'user', content: 'What about naps?' }, { role: 'assistant', content: 'Good question.' }] }, { id: 'c-thesis' });
ok('an editor adds turns', bobAdd.status === 200, bobAdd.text);
const stored = () => db.rows('conversations').find((c) => c.id === 'c-thesis');
ok('  named as his, without his account id', stored().messages.some((m) => m.content === 'What about naps?' && m.by?.name === 'Bob' && !JSON.stringify(m.by).includes('bob"') && m.by.id.length === 12));
ok('  still alice\'s row', stored().user_id === 'alice');
as('cara');
ok('a viewer cannot add a turn', (await call(R.sharedConvo.POST, 'POST', '/api/shared/conversation/c-thesis', { append: [{ role: 'user', content: 'sneaky' }] }, { id: 'c-thesis' })).status === 403);
ok('  nor comment', (await call(R.comments.POST, 'POST', '/api/shared/comments', { type: 'conversation', id: 'c-thesis', anchor: 'message:0', body: 'hi' })).status === 403);
as('erin');
ok('a commenter cannot add a turn', (await call(R.sharedConvo.POST, 'POST', '/api/shared/conversation/c-thesis', { append: [{ role: 'user', content: 'sneaky' }] }, { id: 'c-thesis' })).status === 403);
ok('  nor change the map', (await call(R.sharedConvo.POST, 'POST', '/api/shared/conversation/c-lit', { map: { nodes: [], edges: [] } }, { id: 'c-lit' })).status === 403);
const erinC = await call(R.comments.POST, 'POST', '/api/shared/comments', { type: 'conversation', id: 'c-thesis', anchor: 'message:1', body: 'Is this the right framing?' });
ok('  but can comment', erinC.status === 200 && erinC.json.comments.some((c) => c.body === 'Is this the right framing?' && c.author === 'Erin' && c.mine), erinC.text);
const cid = erinC.json.comments[0].id;
ok('  a comment on nothing that exists is refused', (await call(R.comments.POST, 'POST', '/api/shared/comments', { type: 'conversation', id: 'c-thesis', anchor: '<script>', body: 'x' })).status === 400);
as('cara');
ok('a viewer cannot resolve someone else\'s comment', (await call(R.comments.PATCH, 'PATCH', '/api/shared/comments', { type: 'conversation', id: 'c-thesis', commentId: cid, resolve: true })).status === 403);
as('bob');
ok('an editor can resolve it', (await call(R.comments.PATCH, 'PATCH', '/api/shared/comments', { type: 'conversation', id: 'c-thesis', commentId: cid, resolve: true })).json?.comments?.[0]?.resolved === true);
ok('  but not rewrite it', (await call(R.comments.PATCH, 'PATCH', '/api/shared/comments', { type: 'conversation', id: 'c-thesis', commentId: cid, body: 'edited' })).status === 403);

console.log('=== threads: replies, resolving, editing, deleting ===');
{
  const C = (method, body) => call(R.comments[method], method, '/api/shared/comments', { type: 'conversation', id: 'c-thesis', ...body });
  as('erin');
  const listed = await call(R.comments.GET, 'GET', '/api/shared/comments?type=conversation&id=c-thesis');
  ok('the list says what this person may do: their role comes with it', listed.json?.role === 'commenter' && Array.isArray(listed.json?.comments), listed.text.slice(0, 200));
  const rep = await C('POST', { anchor: 'node:elsewhere', body: 'Fair — I take it back.', parentId: cid });
  const reply = rep.json?.comments?.find((c) => c.parentId === cid);
  ok('a reply joins the thread', rep.status === 200 && !!reply, rep.text.slice(0, 300));
  ok('  and sits where the thread sits, whatever anchor it was sent with', reply?.anchor === 'message:1');
  ok('  and reopens a resolved thread', rep.json?.comments?.find((c) => c.id === cid)?.resolved === false);
  ok('a reply to a reply is refused: threads are one level deep', (await C('POST', { anchor: 'message:1', body: 'deeper', parentId: reply.id })).status === 404);
  ok('a reply to a thread on something else is refused', (await call(R.comments.POST, 'POST', '/api/shared/comments', { type: 'conversation', id: 'c-lit', anchor: '', body: 'x', parentId: cid })).status === 404);
  as('bob');
  ok('a reply cannot be resolved on its own — the thread is', (await C('PATCH', { commentId: reply.id, resolve: true })).status === 400);
  as('erin');
  const ed = await C('PATCH', { commentId: reply.id, body: 'Fair. I take it back.' });
  ok('its author edits a reply, and it says so', ed.json?.comments?.find((c) => c.id === reply.id)?.edited === true && ed.json.comments.find((c) => c.id === reply.id).body === 'Fair. I take it back.');
  const del = await C('PATCH', { commentId: cid, remove: true });
  const gone = del.json?.comments?.find((c) => c.id === cid);
  ok('deleting a comment that has replies keeps its place, emptied', del.status === 200 && gone?.deleted === true && gone.body === '' && gone.author === '', del.text.slice(0, 300));
  ok('  and the replies stay', del.json.comments.some((c) => c.id === reply.id && c.body === 'Fair. I take it back.'));
  ok('a deleted comment takes no new replies', (await C('POST', { anchor: 'message:1', body: 'late', parentId: cid })).status === 404);
  const del2 = await C('PATCH', { commentId: reply.id, remove: true });
  ok('when the last reply goes too, the whole thread is gone', del2.status === 200 && !del2.json.comments.some((c) => c.id === cid || c.id === reply.id), del2.text.slice(0, 300));
  as('alice');
  const whole = await C('POST', { anchor: '', body: 'Overall: getting there.' });
  ok('the owner may comment on the whole conversation, too', whole.status === 200 && whole.json.comments.some((c) => c.anchor === '' && c.mine));
}

console.log('=== two people at once ===');
{
  const before = stored().messages.length;
  as('bob');
  const p1 = call(R.sharedConvo.POST, 'POST', '/api/shared/conversation/c-thesis', { append: [{ role: 'user', content: 'Bob, at the same moment' }] }, { id: 'c-thesis' });
  as('alice');
  const p2 = call(R.sharedConvo.POST, 'POST', '/api/shared/conversation/c-thesis', { append: [{ role: 'user', content: 'Alice, at the same moment' }] }, { id: 'c-thesis' });
  const [r1, r2] = await Promise.all([p1, p2]);
  const after = stored().messages;
  ok('both simultaneous turns land — neither overwrites the other', r1.status === 200 && r2.status === 200 && after.length === before + 2 && after.some((m) => m.content === 'Bob, at the same moment') && after.some((m) => m.content === 'Alice, at the same moment'), `${r1.status} ${r2.status} ${before}->${after.length}`);
  // the owner's ordinary save, from a browser that never saw bob's turns
  as('alice');
  await save('c-thesis', 'Thesis plan', [{ role: 'user', content: 'Where do I start?' }, { role: 'assistant', content: 'With the question.' }, { role: 'user', content: 'Alice from a stale tab' }], { projectId: pid });
  const merged = stored().messages;
  ok('the owner\'s save from a stale tab keeps every collaborator turn', merged.some((m) => m.content === 'What about naps?') && merged.some((m) => m.content === 'Bob, at the same moment') && merged.some((m) => m.content === 'Alice from a stale tab'), JSON.stringify(merged.map((m) => m.content)));
  as('bob');
  const lit = await call(R.sharedConvo.GET, 'GET', '/api/shared/conversation/c-lit', undefined, { id: 'c-lit' });
  const fresh = await call(R.sharedConvo.POST, 'POST', '/api/shared/conversation/c-lit', { base: lit.json.conversation.updatedAt, map: { nodes: [{ id: 'n', type: 'idea', label: 'Bob\'s idea' }], edges: [] } }, { id: 'c-lit' });
  ok('an editor changes the map against the current version', fresh.status === 200, fresh.text);
  const stale = await call(R.sharedConvo.POST, 'POST', '/api/shared/conversation/c-lit', { base: lit.json.conversation.updatedAt, map: { nodes: [], edges: [] } }, { id: 'c-lit' });
  ok('  a map drawn against an older version is refused with the current one, not written over it', stale.status === 409 && stale.json.conflict && JSON.stringify(stale.json.map).includes('Bob\'s idea'), stale.text.slice(0, 200));
  const since = await call(R.sharedConvo.GET, 'GET', `/api/shared/conversation/c-lit?since=${fresh.json.updatedAt}`, undefined, { id: 'c-lit' });
  ok('the cheap poll says when nothing moved', since.json?.unchanged === true);
}

console.log('=== who syncs, and what only the owner writes ===');
{
  as('alice');
  const own = await call(R.sharedConvo.GET, 'GET', '/api/shared/conversation/c-diary', undefined, { id: 'c-diary' });
  ok('an unshared conversation reads as not shared — its owner saves it as before', own.status === 200 && own.json.shared === false);
  const proj = await call(R.sharedConvo.GET, 'GET', '/api/shared/conversation/c-lit', undefined, { id: 'c-lit' });
  ok('a conversation in a shared Project reads as shared, for its owner too', proj.json.shared === true && proj.json.role === 'owner');
  const draft = await call(R.sharedConvo.POST, 'POST', '/api/shared/conversation/c-lit', { draft: { title: 'Notes', html: '<p>my draft</p>' } }, { id: 'c-lit' });
  ok('the owner keeps their Draft Space through the shared route', draft.status === 200 && db.rows('conversations').find((c) => c.id === 'c-lit').draft?.html === '<p>my draft</p>', draft.text);
  as('bob');
  ok('an editor cannot write the owner\'s draft', (await call(R.sharedConvo.POST, 'POST', '/api/shared/conversation/c-lit', { draft: { title: 'x', html: 'x' } }, { id: 'c-lit' })).status === 403);
  ok('  and the guest\'s view of a shared conversation says so', (await call(R.sharedConvo.GET, 'GET', '/api/shared/conversation/c-lit', undefined, { id: 'c-lit' })).json?.shared === true);
}

console.log('=== privacy in a shared conversation ===');
{
  globalThis.__extract = [];
  globalThis.__prompts = [];
  as('bob');
  const r = await call(R.chat.POST, 'POST', '/api/chat', { model: 'core-4', conversationId: 'c-thesis', projectId: pid, messages: [{ role: 'user', content: 'How should we structure the review?' }] });
  const prompt = globalThis.__prompts[0] ?? '';
  ok('an editor can ask Socria inside the shared conversation', r.status === 200, r.text.slice(0, 200));
  ok('  the reply knows the Project', /Thesis/.test(prompt) && /Finish the literature review/.test(prompt), prompt.slice(0, 300));
  ok('  and nothing Socria remembers about alice', !/freeze in front of my advisor/.test(prompt) && !/medication/.test(prompt));
  ok('  nor her instructions', !/methodology/.test(prompt));
  await new Promise((r) => setTimeout(r, 150));
  ok('  and nothing from it is remembered — for anybody', !db.rows('mind_nodes').some((n) => n.user_id === 'bob') && db.rows('mind_nodes').filter((n) => n.user_id === 'alice').length === 4);
  globalThis.__prompts = [];
  as('alice');
  await call(R.chat.POST, 'POST', '/api/chat', { model: 'core-4', conversationId: 'c-thesis', projectId: pid, messages: [{ role: 'user', content: 'And the timeline?' }] });
  const own = globalThis.__prompts[0] ?? '';
  ok('even the owner\'s own memories stay out of a conversation others can read', !/freeze in front of my advisor/.test(own), own.slice(0, 200));
  as('cara');
  const viewerAsk = await call(R.chat.POST, 'POST', '/api/chat', { model: 'core-4', conversationId: 'c-thesis', messages: [{ role: 'user', content: 'hi' }] });
  ok('a viewer cannot send Socria a turn there', viewerAsk.status === 403, viewerAsk.text);
  as('dan');
  const strangerAsk = await call(R.chat.POST, 'POST', '/api/chat', { model: 'core-4', conversationId: 'c-thesis', messages: [{ role: 'user', content: 'hi' }] });
  ok('a stranger cannot use the id to borrow the conversation', strangerAsk.status === 404, strangerAsk.text);
}

console.log('=== presence and history ===');
{
  as('bob');
  await call(R.presence.POST, 'POST', '/api/shared/presence', { type: 'conversation', id: 'c-lit', cursor: { x: 120, y: 80, on: 'map' } });
  as('alice');
  const p = await call(R.presence.POST, 'POST', '/api/shared/presence', { type: 'conversation', id: 'c-lit' });
  const bobHere = p.json?.present?.find((x) => x.name === 'Bob');
  ok('alice sees bob here, and where his pointer is', !!bobHere && bobHere.cursor?.x === 120 && bobHere.role === 'editor', p.text);
  ok('  by an alias, never his account id', !!bobHere && bobHere.id !== 'bob' && !p.text.includes('"bob"'));
  as('dan');
  ok('a stranger cannot be present, or see who is', (await call(R.presence.POST, 'POST', '/api/shared/presence', { type: 'conversation', id: 'c-lit' })).status === 404);
  as('alice');
  const h = await call(R.activity.GET, 'GET', `/api/shared/activity?type=project&id=${pid}`);
  ok('the Project\'s history says who joined', h.json?.activity?.some((a) => /Cara joined/.test(a.summary)) && h.json.activity.some((a) => /Erin joined/.test(a.summary)), h.text.slice(0, 300));
  const hc = await call(R.activity.GET, 'GET', '/api/shared/activity?type=conversation&id=c-thesis');
  ok('a conversation\'s history says who added what and who commented', hc.json?.activity?.some((a) => /Bob added/.test(a.summary)) && hc.json.activity.some((a) => /Erin commented/.test(a.summary)), hc.text.slice(0, 300));
}

console.log('=== changing, removing, revoking ===');
{
  as('alice');
  const st = await call(R.share.GET, 'GET', `/api/share?type=project&id=${pid}`);
  const bobM = st.json.members.find((m) => m.name === 'Bob');
  const caraM = st.json.members.find((m) => m.name === 'Cara');
  await call(R.share.POST, 'POST', '/api/share', { type: 'project', id: pid, action: 'role', memberId: bobM.id, role: 'viewer' });
  as('bob');
  ok('bob, made a viewer, can no longer add turns', (await call(R.sharedConvo.POST, 'POST', '/api/shared/conversation/c-thesis', { append: [{ role: 'user', content: 'still here?' }] }, { id: 'c-thesis' })).status === 403);
  as('cara');
  const caraLeaves = await call(R.share.POST, 'POST', '/api/share', { type: 'project', id: pid, action: 'remove', memberId: bobM.id });
  ok('a member cannot remove someone else', caraLeaves.status === 403, caraLeaves.text);
  as('alice');
  await call(R.share.POST, 'POST', '/api/share', { type: 'project', id: pid, action: 'remove', memberId: caraM.id });
  as('cara');
  ok('cara, removed, is out', (await call(R.home.GET, 'GET', `/api/projects/${pid}/home`, undefined, { id: pid })).status === 404);
  as('alice');
  await call(R.share.POST, 'POST', '/api/share', { type: 'project', id: pid, action: 'reset-link' });
  as('dan');
  ok('a reset link: every copy of the old one is dead', (await call(R.accept.POST, 'POST', '/api/share/accept', { token })).status === 404);
  as('alice');
  await call(R.share.POST, 'POST', '/api/share', { type: 'project', id: pid, action: 'code', role: null });
  as('dan');
  ok('a code turned off opens nothing', (await call(R.accept.POST, 'POST', '/api/share/accept', { code })).status === 404);
  as('alice');
  await call(R.share.POST, 'POST', '/api/share', { type: 'project', id: pid, action: 'stop' });
  as('bob');
  ok('stop sharing: everyone is out', (await call(R.home.GET, 'GET', `/api/projects/${pid}/home`, undefined, { id: pid })).status === 404);
  ok('  and the content is untouched', db.rows('conversations').find((c) => c.id === 'c-thesis')?.user_id === 'alice' && db.rows('conversations').length >= 3);
}

console.log('=== an incognito conversation cannot be shared ===');
{
  as('alice');
  await save('c-incog', 'Off the record', [{ role: 'user', content: 'between us' }]);
  db.rows('conversations').find((c) => c.id === 'c-incog').incognito = true;
  const r = await call(R.share.POST, 'POST', '/api/share', { type: 'conversation', id: 'c-incog', action: 'link', role: 'viewer' });
  ok('refused, with a reason', r.status === 409 && /incognito/i.test(r.json?.error ?? ''), r.text);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
