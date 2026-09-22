// Projects, end to end, through the real routes.
//
// The pure suite (projects.test.mjs) proves the retrieval RULES. This proves
// the WIRING: that a Project created through /api/projects, a conversation
// held through /api/chat, and a file read through /api/mind/upload all land
// in the one graph, tied to the right Projects — and that a later
// conversation's SYSTEM PROMPT, the thing Core 4 actually reads, carries the
// Project frame and the cross-project memory it should, and not the memory it
// should not.
//
// The route handlers are the real ones, bundled from app/api. Only three
// things are replaced: the database (an in-memory PostgREST that enforces the
// real keys and can simulate an old schema), Clerk (a fixed user id) and the
// model (a script that also records every prompt it was given).

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');
const FAKE_CLERK = join(here, 'helpers', 'fake-clerk.mjs');
const FAKE_OPENAI = join(here, 'helpers', 'fake-openai.mjs');
const SHIM = join(here, 'helpers', 'server-only-shim.mjs');

const ROUTES = {
  projects: 'app/api/projects/route.ts',
  project: 'app/api/projects/[id]/route.ts',
  goals: 'app/api/projects/[id]/goals/route.ts',
  chat: 'app/api/chat/route.ts',
  upload: 'app/api/mind/upload/route.ts',
  conversations: 'app/api/conversations/route.ts',
  mind: 'app/api/mind/route.ts',
  node: 'app/api/mind/node/route.ts',
};

// ── build the real routes against the fakes ─────────────────────────

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const swap = {
  name: 'swap',
  setup(b) {
    // EXTERNAL, by absolute URL, so every route shares one instance of each
    // fake — bundled in, each route would get a private database.
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(FAKE_CLERK).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(FAKE_OPENAI).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: SHIM }));
    // Next 14 has no ESM exports map, so Node needs the file spelled out.
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
await Promise.all(Object.entries(ROUTES).map(([name, file]) => build({
  entryPoints: [join(root, file)],
  bundle: true, format: 'esm', platform: 'node',
  outfile: join(OUT, `${name}.mjs`),
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'],
  logLevel: 'error',
})));

// The routes log generously — telemetry, fallbacks, guard verdicts — which is
// right in production and noise here, where it buried the test's own tally
// under whichever route happened to log last. Their lines are dropped; the
// test's own output (which never starts with "[socria" or "conversations")
// is kept.
const quietLog = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('[socria') || first.startsWith('conversations')) return;
  orig(...a);
};
console.log = quietLog(console.log.bind(console));
console.error = quietLog(console.error.bind(console));
console.warn = quietLog(console.warn.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';

const load = (n) => import(pathToFileURL(join(OUT, `${n}.mjs`)).href);
const [R, fake] = await Promise.all([
  Promise.all(Object.keys(ROUTES).map(async (k) => [k, await load(k)])).then(Object.fromEntries),
  import(pathToFileURL(FAKE_DB).href),
]);
const { db } = fake;
const { NextRequest } = await import('next/server.js');

// ── harness ─────────────────────────────────────────────────────────

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

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

/** Wait for fire-and-forget work (remember() after a reply) to finish writing. */
async function quiet() {
  let last = -1;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 25));
    if (db.log.length === last) return;
    last = db.log.length;
  }
}

const C = (type, label, content, extra = {}) => ({ type, label, content, kind: 'stated', importance: 0.6, ...extra });
const E = (sourceLabel, relationship, targetLabel) => ({ sourceLabel, relationship, targetLabel, kind: 'stated' });

/** A turn of Core 4, as the chat page sends it. Returns the system prompt Core saw. */
async function chat(text, { projectId, conversationId, extract }) {
  globalThis.__extract = extract ? [extract] : [];
  globalThis.__prompts = [];
  const r = await call(R.chat.POST, 'POST', '/api/chat', {
    model: 'core-4',
    messages: [{ role: 'user', content: text }],
    conversationId,
    ...(projectId ? { projectId } : {}),
  });
  await quiet();
  return { status: r.status, prompt: globalThis.__prompts[0] ?? '', reply: r.text };
}

const nodes = () => db.rows('mind_nodes').filter((n) => n.user_id === 'u1');
const edges = () => db.rows('mind_edges').filter((e) => e.user_id === 'u1');
const node = (label) => nodes().find((n) => n.label.toLowerCase() === label.toLowerCase());
const tiesTo = (label, anchor) => {
  const n = node(label);
  return n ? edges().filter((e) => (e.source_id === n.id && e.target_id === anchor) || (e.target_id === n.id && e.source_id === anchor)) : [];
};

db.reset();
globalThis.__uid = 'u1';

// ── 1. create two Projects ──────────────────────────────────────────

console.log('=== create two Projects ===');
const mk = async (name, description) => (await call(R.projects.POST, 'POST', '/api/projects', { name, description })).json;
const calc = await mk('Calculus', 'Getting through Calc II this term.');
const soc = await mk('Socria', 'The product: Core 4, Logos, the Mind Graph.');
ok('both are created', calc?.ok && soc?.ok, JSON.stringify([calc, soc]));
const CALC = calc.project.id, SOC = soc.project.id;
const anchorOf = (pid) => db.rows('mind_projects').find((p) => p.id === pid).node_id;
const CALC_NODE = anchorOf(CALC), SOC_NODE = anchorOf(SOC);
ok('each Project is a node in the ONE graph', node('Calculus')?.id === CALC_NODE && node('Socria')?.id === SOC_NODE);
ok('typed Project', node('Calculus').type === 'Project');
ok('and there is no per-Project store: one mind_nodes table, one user', new Set(nodes().map((n) => n.user_id)).size === 1);
const dup = await call(R.projects.POST, 'POST', '/api/projects', { name: 'calculus' });
ok('a second Project with the same name is refused', dup.status === 409, String(dup.status));

// ── 2. a conversation inside Calculus updates the graph ─────────────

console.log('\n=== a conversation inside Calculus ===');
const c1 = await chat('I finally get derivatives — the moving tangent line did it, the rules never did.', {
  projectId: CALC, conversationId: 'calc-1',
  extract: {
    nodes: [
      C('Concept', 'derivatives', 'The rate-of-change half of the course.'),
      C('Experience', 'the moving tangent line', 'Derivatives only made sense once the tangent was drawn moving along the curve; the rules first made it worse.'),
      C('Concept', 'visual learning', 'Understands a concept once it is drawn, before it is written.'),
      C('Event', 'Calc II final exam', 'The final exam is on December 12th this year.'),
      C('Person', 'Professor Lin', 'Teaches the section and holds office hours on Thursdays.'),
    ],
    edges: [
      E('the moving tangent line', 'evidence_for', 'derivatives'),
      E('the moving tangent line', 'evidence_for', 'visual learning'),
      E('Calc II final exam', 'associated_with', 'derivatives'),
    ],
  },
});
ok('the reply went out', c1.status === 200, String(c1.status));
ok('Core 4 was told it is inside Calculus', c1.prompt.includes('=== Current Project: Calculus ==='));
ok('what the turn taught is in the graph', !!node('derivatives') && !!node('the moving tangent line'));
ok('and tied to Calculus', tiesTo('derivatives', CALC_NODE).some((e) => e.relationship === 'belongs_to'));
ok('its own relationships are intact', edges().some((e) => e.source_id === node('the moving tangent line').id &&
   e.target_id === node('derivatives').id && e.relationship === 'evidence_for'));

// ── 3. a TXT file inside Socria updates the SAME graph ──────────────

console.log('\n=== a file inside Socria ===');
const SECRET = 'The office wifi password is written on the whiteboard.';
globalThis.__extract = [{
  nodes: [
    C('Concept', 'Core 4', 'The Human-First model: judges each turn whether to answer or scaffold.'),
    C('Concept', 'adaptive scaffolding', 'Give the least help that lets the person do the next step themselves.'),
    C('Goal', 'launch Core 4 in October', 'Ship Core 4 to everyone in October.'),
    // Already known, from Calculus. Must be REUSED, not copied.
    C('Concept', 'visual learning', 'Understands a concept once it is drawn, before it is written.'),
  ],
  edges: [
    E('adaptive scaffolding', 'used_by', 'Core 4'),
    E('the moving tangent line', 'evidence_for', 'adaptive scaffolding'),
  ],
}];
const up = await call(R.upload.POST, 'POST', '/api/mind/upload', {
  name: 'teaching-notes.txt',
  text: `Notes on how Core 4 should teach. ${SECRET} Scaffold, never solve.`,
  projectId: SOC,
});
await quiet();
ok('the file was read', up.status === 200 && up.json?.ok, up.text);
ok('the file row belongs to Socria', db.rows('mind_sources').find((s) => s.name === 'teaching-notes.txt')?.project_id === SOC);
ok('"visual learning" is still ONE node', nodes().filter((n) => n.label === 'visual learning').length === 1);
ok('now tied to both Projects', tiesTo('visual learning', CALC_NODE).length === 1 && tiesTo('visual learning', SOC_NODE).length === 1);
ok('the file\'s own node belongs to Socria', edges().some((e) => {
  const src = nodes().find((n) => n.type === 'Source' && n.label === 'teaching-notes.txt');
  return src && e.source_id === src.id && e.target_id === SOC_NODE;
}));
ok('a Calculus memory now has an edge to a Socria principle', edges().some((e) =>
  e.source_id === node('the moving tangent line').id && e.target_id === node('adaptive scaffolding').id));

const again = await call(R.upload.POST, 'POST', '/api/mind/upload', {
  name: 'teaching-notes.txt', text: 'A second file that happens to share the name.', projectId: SOC,
});
await quiet();
ok('a second file with the same name is a second file, not a merge',
   again.status === 200 && nodes().filter((n) => n.type === 'Source').length === 2,
   nodes().filter((n) => n.type === 'Source').map((n) => n.label).join(', '));

// ── 4. later: inside Socria, a question that needs Calculus ─────────

console.log('\n=== inside Socria: a question that needs Calculus ===');
const q1 = await chat('How should Core respond when someone is struggling to understand derivatives?', {
  projectId: SOC, conversationId: 'soc-1',
});
const P = q1.prompt;
ok('framed as Socria', P.includes('=== Current Project: Socria ==='));
ok('with Socria\'s goal', P.includes('launch Core 4 in October'));
ok('and its file NAME', P.includes('teaching-notes.txt'));
ok('never the file\'s contents', !P.includes(SECRET));
ok('Socria\'s own memory is there', P.includes('Core 4 —') || P.includes('Concept: Core 4'), P.slice(-900));
ok('the Calculus concept comes across, marked', /derivatives —[^\n]*\[from project: Calculus\]/.test(P), P.slice(-1200));
ok('so does how they learned it, marked', /the moving tangent line —[^\n]*\[from project: Calculus\]/.test(P), P.slice(-1200));
ok('but not the exam', !P.includes('Calc II final exam'));
ok('nor the professor', !P.includes('Professor Lin'));

console.log('\n=== inside Socria: a question that needs nothing from Calculus ===');
const q2 = await chat('What still has to happen before the October launch?', { projectId: SOC, conversationId: 'soc-2' });
ok('the launch is there', q2.prompt.includes('launch Core 4 in October'));
for (const l of ['derivatives', 'the moving tangent line', 'Calc II final exam', 'Professor Lin']) {
  ok(`"${l}" stays out`, !q2.prompt.includes(l));
}

console.log('\n=== outside any Project ===');
const q3 = await chat('Tell me about derivatives', { conversationId: 'plain-1' });
ok('no Project frame', !q3.prompt.includes('=== Current Project'));
ok('memory still works, unmarked', q3.prompt.includes('derivatives —') && !q3.prompt.includes('[from project:'));

// ── 5. conversations and goals ──────────────────────────────────────

console.log('\n=== conversations and goals ===');
const put = await call(R.conversations.PUT, 'PUT', '/api/conversations', {
  conversation: { id: 'soc-1', title: 'Teaching derivatives', messages: [{ role: 'user', content: 'hi' }], updatedAt: 5, projectId: SOC },
});
ok('a conversation is saved with its Project', put.status === 200 && db.rows('conversations').find((c) => c.id === 'soc-1')?.project_id === SOC, put.text);
const list = (await call(R.conversations.GET, 'GET', '/api/conversations')).json;
ok('and read back with it', list.conversations.find((c) => c.id === 'soc-1')?.projectId === SOC);
const detail = (await call(R.project.GET, 'GET', `/api/projects/${SOC}`, undefined, { id: SOC })).json;
ok('the Project page lists it', detail.conversations.some((c) => c.id === 'soc-1'));
ok('and its goal, from the graph', detail.goals.some((g) => g.label === 'launch Core 4 in October'));
ok('and says how much memory is connected', detail.connected >= 5, String(detail.connected));
const g1 = (await call(R.goals.POST, 'POST', `/api/projects/${SOC}/goals`, { text: 'launch Core 4 in October' }, { id: SOC })).json;
ok('adding a goal it already holds reuses it', g1.ok && g1.reused, JSON.stringify(g1));
const g2 = (await call(R.goals.POST, 'POST', `/api/projects/${SOC}/goals`, { text: 'Ship it' }, { id: SOC })).json;
ok('a short goal is still a goal', g2.ok && !g2.reused && nodes().some((n) => n.label === 'Ship it' && n.type === 'Goal'));

// ── 6. rename and ownership ─────────────────────────────────────────

console.log('\n=== rename, and nobody else\'s Project ===');
const rn = await call(R.project.PATCH, 'PATCH', `/api/projects/${SOC}`, { name: 'Socria app', instructions: 'Be blunt.' }, { id: SOC });
ok('renamed', rn.status === 200 && db.rows('mind_projects').find((p) => p.id === SOC).name === 'Socria app');
ok('the node follows, keeping the old name as an alias', node('Socria app')?.aliases?.includes('Socria'));
const framed = await chat('ok what next', { projectId: SOC, conversationId: 'soc-3' });
ok('the next turn carries the new name and the instructions', framed.prompt.includes('Current Project: Socria app') && framed.prompt.includes('Be blunt.'));

globalThis.__uid = 'u2';
ok('another account cannot read it', (await call(R.project.GET, 'GET', `/api/projects/${SOC}`, undefined, { id: SOC })).status === 404);
ok('or rename it', (await call(R.project.PATCH, 'PATCH', `/api/projects/${SOC}`, { name: 'mine' }, { id: SOC })).status === 404);
ok('or delete it', (await call(R.project.DELETE, 'DELETE', `/api/projects/${SOC}`, {}, { id: SOC })).status === 404);
const stranger = await chat('How should Core teach derivatives?', { projectId: SOC, conversationId: 'x-1' });
ok('or borrow it: no frame, and none of u1\'s memory', !stranger.prompt.includes('Current Project') && !stranger.prompt.includes('derivatives —'));
ok('or upload into it', (await call(R.upload.POST, 'POST', '/api/mind/upload', { name: 'a.txt', text: 'x', projectId: SOC })).status === 404);
globalThis.__uid = 'u1';

// ── 6b. moving a chat into a folder from the rail ───────────────────

console.log('\n=== moving a chat into a folder, and out ===');
const loose = await chat('Thinking about how Core 4 should pace hints.', {
  conversationId: 'loose-1',
  extract: { nodes: [C('Concept', 'hint pacing', 'How quickly Core 4 escalates from a question to a hint.')], edges: [] },
});
await call(R.conversations.PUT, 'PUT', '/api/conversations', {
  conversation: { id: 'loose-1', title: 'Hint pacing', messages: [{ role: 'user', content: 'hi' }], updatedAt: 9 },
});
ok('held outside any folder, it is tied to nothing', loose.status === 200 && tiesTo('hint pacing', SOC_NODE).length === 0);
const mv = await call(R.conversations.PATCH, 'PATCH', '/api/conversations', { id: 'loose-1', projectId: SOC });
ok('moving it into Socria succeeds', mv.status === 200 && mv.json?.projectId === SOC, mv.text);
ok('the chat is filed', db.rows('conversations').find((c) => c.id === 'loose-1')?.project_id === SOC);
ok('and what it taught is now tied to Socria', tiesTo('hint pacing', SOC_NODE).some((e) => e.relationship === 'belongs_to'));
ok('its title was not touched, nor its place in the list',
   db.rows('conversations').find((c) => c.id === 'loose-1')?.title === 'Hint pacing' &&
   db.rows('conversations').find((c) => c.id === 'loose-1')?.updated_at === 9);
const back = await call(R.conversations.PATCH, 'PATCH', '/api/conversations', { id: 'loose-1', projectId: null });
ok('moving it out succeeds', back.status === 200 && db.rows('conversations').find((c) => c.id === 'loose-1')?.project_id === null, back.text);
ok('and unties what it alone had tied', tiesTo('hint pacing', SOC_NODE).length === 0);
ok('without forgetting it', !!node('hint pacing'));
ok('a rename still works as before', (await call(R.conversations.PATCH, 'PATCH', '/api/conversations', { id: 'loose-1', title: 'Pacing' })).status === 200 &&
   db.rows('conversations').find((c) => c.id === 'loose-1')?.title === 'Pacing');
ok('a folder that does not exist is refused', (await call(R.conversations.PATCH, 'PATCH', '/api/conversations', { id: 'loose-1', projectId: 'p_nope' })).status === 404);
globalThis.__uid = 'u2';
ok('nobody else can move your chat', (await call(R.conversations.PATCH, 'PATCH', '/api/conversations', { id: 'loose-1', projectId: SOC })).status === 404);
globalThis.__uid = 'u1';

// ── 7. the Memory page cannot orphan a Project ──────────────────────

console.log('\n=== forgetting a Project\'s node from Memory ===');
const orphan = await call(R.node.DELETE, 'DELETE', '/api/mind/node', { id: SOC_NODE });
ok('is refused, and says where to go instead', orphan.status === 409 && /folder/.test(orphan.json?.error ?? ''), orphan.text);
ok('and the node is still there', !!nodes().find((n) => n.id === SOC_NODE));
const ordinary = await call(R.node.DELETE, 'DELETE', '/api/mind/node', { id: node('Ship it').id });
ok('an ordinary node still forgets normally', ordinary.status === 200 && !node('Ship it'), ordinary.text);

// ── 8. deleting a Project ───────────────────────────────────────────

console.log('\n=== deleting Calculus ===');
await call(R.conversations.PUT, 'PUT', '/api/conversations', {
  conversation: { id: 'calc-1', title: 'Derivatives', messages: [{ role: 'user', content: 'hi' }], updatedAt: 6, projectId: CALC },
});
const before = nodes().length;
const tombsBefore = db.rows('mind_tombstones').length;
const del = await call(R.project.DELETE, 'DELETE', `/api/projects/${CALC}`, { files: 'keep' }, { id: CALC });
ok('deleted', del.status === 200 && del.json.ok, del.text);
ok('the container is gone', !db.rows('mind_projects').some((p) => p.id === CALC));
ok('its conversation is NOT deleted — it moved out', db.rows('conversations').find((c) => c.id === 'calc-1')?.project_id === null);
ok('no memory was deleted', nodes().length === before - (del.json && node('Calculus') ? 0 : 1) || nodes().length >= before - 1,
   `${before} -> ${nodes().length}`);
ok('derivatives is still there', !!node('derivatives'));
ok('visual learning keeps its tie to Socria', tiesTo('visual learning', SOC_NODE).length === 1);
ok('and loses only its tie to Calculus', tiesTo('visual learning', CALC_NODE).length === 0);
ok('the cross-project evidence edge survives', edges().some((e) =>
  e.source_id === node('the moving tangent line').id && e.target_id === node('adaptive scaffolding').id));
ok('deleting it wrote no tombstones', db.rows('mind_tombstones').length === tombsBefore,
   `${tombsBefore} -> ${db.rows('mind_tombstones').length}`);
ok('the report says how many memories stayed', del.json.memoriesKept >= 4, JSON.stringify(del.json));
const after = await chat('How should Core respond when someone is struggling to understand derivatives?', {
  projectId: SOC, conversationId: 'soc-4',
});
ok('and Socria can still reach what was learned in Calculus', /derivatives —/.test(after.prompt), after.prompt.slice(-800));

// ── 9. a database that has not re-run schema.sql ────────────────────

console.log('\n=== an old database: conversations without project_id ===');
db.missing.conversations = new Set(['project_id']);
const logos = await call(R.conversations.PUT, 'PUT', '/api/conversations', {
  conversation: { id: 'lg-1', title: 'A map', kind: 'logos', messages: [], updatedAt: 7,
    map: { nodes: [{ id: 'a', label: 'root', type: 'idea' }], edges: [] }, projectId: SOC },
});
const row = db.rows('conversations').find((c) => c.id === 'lg-1');
ok('the save still succeeds', logos.status === 200, logos.text);
ok('and the map lands in its REAL column, not the fallback', !!row?.map && !row.memory?.__logos, JSON.stringify(row));
const oldList = await call(R.conversations.GET, 'GET', '/api/conversations');
const lg = oldList.json?.conversations?.find((c) => c.id === 'lg-1');
ok('reading still returns the Logos session with its map', lg?.kind === 'logos' && lg?.map?.nodes?.length === 1, oldList.text.slice(0, 200));
db.missing.conversations = new Set(['project_id', 'kind', 'map', 'draft', 'contexts']);
await call(R.conversations.PUT, 'PUT', '/api/conversations', {
  conversation: { id: 'old-1', title: 'Old', messages: [], updatedAt: 8, projectId: SOC },
});
const oldest = (await call(R.conversations.GET, 'GET', '/api/conversations')).json.conversations.find((c) => c.id === 'old-1');
ok('on the oldest schema the Project survives in the fallback', oldest?.projectId === SOC, JSON.stringify(oldest));
db.missing = {};

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
