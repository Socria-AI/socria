// FOUR VIEWS, FOUR JOBS — THROUGH THE REAL ROUTES.
//
//   the map pass   keeps a picture only when the turn asked for one (or said
//                  yes to an offer of one); a picture already on screen stays
//                  and is kept current; nothing appears in Artifacts because
//                  it could have been drawn
//   the reply      a write-up they asked to keep is written for Content — its
//                  shape said after the history, room to write it — whatever
//                  the inline switch; an explanation is offered at most a small
//                  element; the runtime's own blocks (who does what, what may
//                  be asserted) are there either way
//
// The language model is scripted (test/helpers/fake-openai-logos.mjs). The pure
// rules are in test/four-views.test.mjs.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { systemOf } from './helpers/prompt.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-four-views');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');

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
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai-logos.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
for (const [entry, out] of [['app/api/logos/map/route.ts', 'map.mjs'], ['app/api/logos/chat/route.ts', 'chat.mjs']]) {
  await build({
    entryPoints: [join(root, entry)], bundle: true, format: 'esm', platform: 'node',
    outfile: join(OUT, out), tsconfig: join(root, 'tsconfig.json'), plugins: [swap],
    external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error',
  });
}

const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('logos map') || first.startsWith('[') || first.startsWith('logos') || first.startsWith('conversations')) return;
  orig(...a);
};
console.info = quiet(console.info.bind(console));
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
globalThis.__uid = 'user_four_views';

const mapRoute = await import(pathToFileURL(join(OUT, 'map.mjs')).href);
const chatRoute = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const EMPTY = { nodes: [], edges: [] };

async function mapTurn(messages, script, { map = EMPTY } = {}) {
  globalThis.__logosScript = [...script];
  globalThis.__logosCalls = [];
  const r = await mapRoute.POST(new NextRequest('http://localhost/api/logos/map', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, map, today: '2026-10-25' }) }));
  return { status: r.status, json: await r.json() };
}
async function chatTurn(messages, { env = {}, reply = 'Noted.', length } = {}) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try {
    globalThis.__logosCalls = [];
    globalThis.__logosPrompts = [];
    globalThis.__logosReply = reply;
    globalThis.__logosScript = [];
    const r = await chatRoute.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ surface: 'logos5', messages, ...(length ? { length } : {}) }) }));
    const received = await r.text().catch(() => '');
    await new Promise((ok) => setTimeout(ok, 30));
    const streamed = globalThis.__logosCalls.find((c) => c.stream);
    return { status: r.status, received, system: systemOf(streamed), first: String(streamed?.messages?.[0]?.content ?? ''), max: streamed?.max_tokens };
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
}

const READ = (viz, extra = {}) => ({ nodes: [{ id: 'q', label: 'How the game works', type: 'question' }], edges: [], context: 'learning', ask: { action: 'explain', artifact: 'answer' }, ...(viz ? { viz } : {}), ...extra });
const FIELD = { kind: 'diagram', title: 'A football field', parts: [{ o: 'rects', bars: [{ x0: 0, x1: 1, y: 2 }, { x0: 1, x1: 2, y: 1 }] }] };
// a diagram, which the map keeps whatever the context — so what keeps or drops it here is the rule under test
const SWING = { kind: 'diagram', title: 'A pendulum swinging', parts: [{ o: 'rects', bars: [{ x0: 0, x1: 1, y: 3 }] }] };
const OFFER = "That's the idea. I can build you a pendulum simulation in Artifacts if you'd like to see it move.";

console.log('=== the map pass: a picture is made when it is asked for ===');
{
  const football = await mapTurn([U("How does American football work? It's confusing.")], [READ(FIELD)]);
  ok('"How does American football work?" — the field the extractor drew unasked is not kept', football.status === 200 && !football.json.map?.viz, J(football.json.map?.viz)?.slice(0, 160));
  ok('  the map itself still updates: the conversation is tracked', (football.json.map?.nodes ?? []).length === 1);
  const pendulum = await mapTurn([U('How does a pendulum work?')], [READ(SWING)]);
  ok('"How does a pendulum work?" — a question about one; no picture kept', !pendulum.json.map?.viz, J(pendulum.json.map?.viz)?.slice(0, 160));
  const shown = await mapTurn([U('Can you show me a diagram of the field?')], [READ(FIELD, { ask: { action: 'represent', artifact: 'diagram' } })]);
  ok('"Can you show me a diagram of the field?" — asked: the diagram is kept', shown.json.map?.viz?.kind === 'diagram' && shown.json.map.viz.title === 'A football field', J(shown.json.map?.viz)?.slice(0, 160));
  const sim = await mapTurn([U('Simulate a pendulum')], [READ(null, { ask: { action: 'simulate', artifact: 'simulation' } })]);
  ok('"Simulate a pendulum" — asked: a simulation is on screen', !!sim.json.map?.viz, J(sim.json.map?.viz)?.slice(0, 160));
  const yes = await mapTurn([U('How does a pendulum work?'), A(OFFER), U('Yes please')], [READ(SWING)]);
  ok('a yes to Socria\'s offer of one is asking: kept', yes.json.map?.viz?.title === 'A pendulum swinging', J(yes.json.map?.viz)?.slice(0, 160));
  const notAnOffer = await mapTurn([U('How does a pendulum work?'), A('It swings because gravity pulls it back. Want to know why the period does not depend on the mass?'), U('Yes please')], [READ(SWING)]);
  ok('a yes to a question is not a yes to a picture: not kept', !notAnOffer.json.map?.viz, J(notAnOffer.json.map?.viz)?.slice(0, 160));
}

console.log('\n=== the map pass: what is on screen stays, and stays current ===');
{
  // a mathematical map: a function's picture is kept there (sanitizeMap keeps a curve only where the work is mathematical)
  const onScreen = { nodes: [{ id: 'f', label: 'y = x²', type: 'concept' }], edges: [], context: 'math', viz: { kind: 'function', expr: 'x^2', title: 'y = x²' } };
  const update = await mapTurn([U('Plot y = x^2'), A('Here it is.'), U('what happens near zero?')], [READ({ kind: 'function', expr: 'x^2', title: 'y = x², near zero' }, { context: 'math' })], { map: onScreen });
  ok('a picture already on screen is kept current while the conversation is still about it (same kind)', update.json.map?.viz?.kind === 'function' && /near zero/.test(update.json.map.viz.title ?? ''), J(update.json.map?.viz)?.slice(0, 160));
  const other = await mapTurn([U('Plot y = x^2'), A('Here it is.'), U('how does a football field work, by the way?')], [READ(FIELD, { context: 'math' })], { map: onScreen });
  const back = other.json.map?.viz;
  ok('a different picture nobody asked for never replaces it', !back || (back.kind === 'function' && back.expr === 'x^2'), J(back)?.slice(0, 160));
}

console.log('\n=== the reply: a write-up for Content ===');
{
  const NOTES = 'Write me detailed study notes on the causes of World War One';
  const r = await chatTurn([U(NOTES)], { reply: '# The causes of World War One\n\nNo single cause.' });
  ok('the reply is told it is a write-up read in Content, after the history', r.status === 200 && /A WRITE-UP, READ IN CONTENT/.test(r.system) && !/A WRITE-UP, READ IN CONTENT/.test(r.first), r.system.slice(-600));
  ok('  with room to write it: the ceiling grows by 1100', r.max === 700 + 1100, String(r.max));
  ok('  and no inline element is offered inside it', !/INLINE, IF IT HELPS/.test(r.system));
  ok('  the runtime\'s own blocks are there as on any turn — who does what, what may be asserted', /=== This turn ===/.test(r.system));
  ok('  it reaches them as written', r.received.startsWith('# The causes of World War One'));
  const off = await chatTurn([U(NOTES)], { env: { LOGOS_INLINE: 'off' } });
  ok('with inline elements switched off it is still written for Content — only elements are off', /A WRITE-UP, READ IN CONTENT/.test(off.system) && off.max === 700 + 1100, String(off.max));
  const brief = await chatTurn([U('Write a short summary of what we discussed')]);
  ok('a short summary is conversation: no write-up block, the usual ceiling', !/A WRITE-UP, READ IN CONTENT/.test(brief.system) && brief.max === 700, String(brief.max));
}

console.log('\n=== the reply: an explanation, conversational ===');
{
  const r = await chatTurn([U("How does American football work? It's confusing.")]);
  ok('"How does American football work?" — offered at most a compact sequence, optional', /INLINE, IF IT HELPS — optional/.test(r.system) && /"type":"sequence"/.test(r.system) && !/"type":"chart"/.test(r.system) && !/"type":"concepts"/.test(r.system), r.system.slice(-800));
  ok('  and not written as a document', !/A WRITE-UP, READ IN CONTENT/.test(r.system));
  ok('the core it is sent says things are built when asked, and offered in a line otherwise', /when they ask/.test(r.first) && /offer it in one line; the choice is theirs/.test(r.first));
  const small = await chatTurn([U('hey, how are you doing?')]);
  ok('small talk: nothing offered at all', !/INLINE, IF IT HELPS/.test(small.system) && !/A WRITE-UP/.test(small.system));
}

console.log(`\nfour-views-e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
