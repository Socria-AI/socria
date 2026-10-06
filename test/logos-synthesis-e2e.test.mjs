// Synthesis, through the real routes — /api/logos/synthesize, the map route and
// the reply route — with the model scripted (test/helpers/fake-openai-logos.mjs).
// What the model WRITES cannot be shown here; what the routes do with the map,
// the conversation and the model's draft can.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sanitizeMap } from './.tmp/logos.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-synthesis');
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
for (const [entry, out] of [['app/api/logos/map/route.ts', 'map.mjs'], ['app/api/logos/chat/route.ts', 'chat.mjs'], ['app/api/logos/synthesize/route.ts', 'synth.mjs']]) {
  await build({
    entryPoints: [join(root, entry)], bundle: true, format: 'esm', platform: 'node',
    outfile: join(OUT, out), tsconfig: join(root, 'tsconfig.json'), plugins: [swap],
    external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error',
  });
}

// The routes narrate their corrections on purpose; under test that is noise.
const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('logos map') || first.startsWith('logos synthesize') || first.startsWith('[logos') || first.startsWith('[socria')) return;
  orig(...a);
};
console.info = quiet(console.info.bind(console));
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
globalThis.__uid = 'user_logos_e2e';

const mapRoute = await import(pathToFileURL(join(OUT, 'map.mjs')).href);
const chatRoute = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const synthRoute = await import(pathToFileURL(join(OUT, 'synth.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const EMPTY = { nodes: [], edges: [] };

/** One map turn: the extractor's scripted outputs in order, and what came back. */
async function mapTurn(said, script, { map = EMPTY, history = [] } = {}) {
  globalThis.__logosScript = [...script];
  globalThis.__logosCalls = [];
  const req = new NextRequest('http://localhost/api/logos/map', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [...history, { role: 'user', content: said }], map }),
  });
  const r = await mapRoute.POST(req);
  const json = await r.json();
  return { status: r.status, json, calls: globalThis.__logosCalls, left: globalThis.__logosScript.length };
}

/** One reply turn: the system prompt the reply model was given. */
async function replyTurn(said, extra = {}) {
  globalThis.__logosPrompts = [];
  globalThis.__logosReply = 'Here it is.';
  const req = new NextRequest('http://localhost/api/logos/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: said }], ...extra }),
  });
  const r = await chatRoute.POST(req);
  // Drain the stream so the route finishes its work.
  try { await r.text(); } catch {}
  return { status: r.status, prompt: globalThis.__logosPrompts[0] ?? '' };
}



import { ONBOARDING, CONTRADICTORY } from './fixtures/synthesis-maps.mjs';
import { SYNTH_MARK } from './.tmp/logos-synthesis.mjs';

async function synthTurn(body, script) {
  globalThis.__logosScript = [...script];
  globalThis.__logosCalls = [];
  const req = new NextRequest('http://localhost/api/logos/synthesize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const r = await synthRoute.POST(req);
  return { status: r.status, json: await r.json(), calls: globalThis.__logosCalls };
}
const sysOf = (calls, i = 0) => String(calls[i]?.messages?.[0]?.content ?? '');

const history = [
  { role: 'user', content: 'An old turn about pricing pages that should not reach the synthesis' },
  ...Array.from({ length: 7 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i} about onboarding` })),
  { role: 'assistant', content: `${SYNTH_MARK} An earlier synthesis`, synthesis: true },
];

console.log('=== the route reads the map, not the chat ===');
{
  const draft = {
    title: 'Your onboarding direction',
    lede: 'You are designing onboarding around a tension between explaining Socria and staying out of the way.',
    established: [{ text: 'Personalization early', refs: ['welcome'] }, { text: 'Tutorials first', refs: ['tutorials'] }],
    emerging: [{ text: 'Guided tours, less developed', refs: ['tours'] }],
    unresolved: [{ text: 'What does Socria need to know?', refs: ['need'] }],
    reading: [{ text: 'Easy access and not annoying amount to low-friction onboarding', refs: ['easy', 'annoy'] }],
    critique: [{ level: 'problem', text: 'Over-explains', refs: ['tutorials'] }],
    possibilities: [{ label: 'Activation moment', type: 'question', text: 'What must a new user experience before onboarding has succeeded?' }],
    next: ['challenge', 'resolve'],
  };
  const { status, json, calls } = await synthTurn({ map: ONBOARDING, messages: history }, [draft]);
  const p = sysOf(calls);
  ok('the route answers with a synthesis', status === 200 && json.synthesis?.v === 1, JSON.stringify(json).slice(0, 200));
  ok('the model is given the structure: every object with its type and standing', /Personalized welcome/.test(p) && /\[idea, supported/.test(p) && /THE SHAPE, IN ORDER/.test(p));
  ok('  and only the last few turns, as evidence', /turn 6 about onboarding/.test(p) && !/pricing pages/.test(p));
  ok('  never an earlier synthesis', !/An earlier synthesis/.test(p));
  ok('what the model wrote is held to the structure', !json.synthesis.sections.find((s) => s.id === 'established').items.some((i) => /Tutorials first/.test(i.text)));
  ok('  an ungrounded “problem” arrives as a risk', json.synthesis.critique.find((c) => /Over-explains/.test(c.text))?.level === 'risk');
  ok('  its reading is marked as its own', json.synthesis.sections.find((s) => s.id === 'reading').items.every((i) => i.by === 'socria'));
  ok('the snapshot it carries is of the map', json.synthesis.snapshot.nodes.length === ONBOARDING.nodes.length);
}

console.log('\n=== when the model does not answer ===');
{
  const { status, json } = await synthTurn({ map: CONTRADICTORY, messages: [] }, [new Error('upstream down')]);
  ok('the structure writes it instead', status === 200 && json.synthesis.source === 'structure' && json.synthesis.critique.some((c) => c.level === 'problem'));
  const thin = await synthTurn({ map: { nodes: [{ id: 'a', type: 'idea', label: 'one' }], edges: [] } }, []);
  ok('one object is not enough to synthesise, and it says so', thin.status === 400 && /not enough/.test(thin.json.error));
  const sel = await synthTurn({ map: ONBOARDING, scope: { kind: 'selection', ids: ['welcome', 'tutorials', 'tours'] } }, [new Error('x')]);
  ok('a selection is synthesised as itself', sel.json.synthesis.scope.kind === 'selection' && /3 objects/.test(sel.json.synthesis.counts));
}

console.log('\n=== what changed since the last synthesis ===');
{
  const first = (await synthTurn({ map: ONBOARDING }, [new Error('x')])).json.synthesis;
  const moved = { ...ONBOARDING, nodes: [...ONBOARDING.nodes.map((n) => (n.id === 'need' ? { ...n, status: 'resolved' } : n)), { id: 'act', type: 'idea', label: 'Define an activation moment' }] };
  const { json, calls } = await synthTurn({ map: moved, since: first }, [{ ...{ title: 'T', lede: 'L', emerging: [{ text: 'x', refs: ['act'] }] }, change: 'You moved from personalisation toward defining success.' }]);
  ok('the model is told what moved', /SINCE THE LAST SYNTHESIS/.test(sysOf(calls)) && /Define an activation moment/.test(sysOf(calls)));
  ok('  and the change is part of the synthesis', /personalisation toward defining success/.test(json.synthesis.change?.said ?? ''), JSON.stringify(json.synthesis.change));
}

console.log('\n=== the map never reads a synthesis as the person ===');
{
  const { calls } = await mapTurn('Ease of access matters more than personalization.', [{ ...ONBOARDING }], {
    map: ONBOARDING,
    history: [{ role: 'user', content: 'plan onboarding' }, { role: 'assistant', content: `${SYNTH_MARK} Your onboarding direction\nPersonalization should happen early.`, synthesis: { v: 1 } }],
  });
  const transcript = String(calls[0]?.messages?.[1]?.content ?? '');
  ok('the extractor’s transcript has no synthesis in it', !transcript.includes(SYNTH_MARK) && /Ease of access/.test(transcript), transcript);
  ok('  and it is told how to treat a reply to one', /SOCRIA'S SYNTHESES ARE NOT THE PERSON'S THINKING/.test(sysOf(calls)));
  const keep = await mapTurn('more', [{ ...ONBOARDING, nodes: ONBOARDING.nodes.map(({ origin, ...n }) => n) }], { map: { ...ONBOARDING, nodes: [...ONBOARDING.nodes, { id: 'act', type: 'question', label: 'Activation moment', origin: 'socria' }] } });
  ok('a taken suggestion stays marked as Socria’s through a rebuild', keep.json.map.nodes.find((n) => n.label === 'Activation moment')?.origin === 'socria' || !keep.json.map.nodes.some((n) => n.label === 'Activation moment'));
  const kept2 = await mapTurn('more', [{ ...ONBOARDING, nodes: [...ONBOARDING.nodes, { id: 'act', type: 'question', label: 'Activation moment' }] }], { map: { ...ONBOARDING, nodes: [...ONBOARDING.nodes, { id: 'act', type: 'question', label: 'Activation moment', origin: 'socria' }] } });
  ok('  even when the extractor writes it back without the mark', kept2.json.map.nodes.find((n) => n.id === 'act')?.origin === 'socria');
}

console.log('\n=== a reply to a synthesis ===');
{
  globalThis.__logosPrompts = [];
  globalThis.__logosReply = 'Understood.';
  const req = new NextRequest('http://localhost/api/logos/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'plan onboarding' }, { role: 'assistant', content: `${SYNTH_MARK} Your onboarding direction` }, { role: 'user', content: "That isn't quite right. Ease of access matters more than personalization." }] }),
  });
  const r = await chatRoute.POST(req);
  try { await r.text(); } catch {}
  const p = globalThis.__logosPrompts[0] ?? '';
  ok('the reply is told to tell a corrected reading from a changed mind', /CORRECTING SOCRIA'S INTERPRETATION/.test(p) && /CHANGING THEIR THINKING/.test(p));
  const { prompt } = await replyTurn('just chatting');
  ok('  and only when it is answering a synthesis', !/CORRECTING SOCRIA'S INTERPRETATION/.test(prompt));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
