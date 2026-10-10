// AN EVERYDAY DISPLAY, THROUGH THE REAL ROUTES — asked for, drafted, sealed, said.
//
// Workflows 1, 7 and 9 of Logos 3.5 at the level a person meets them: the
// real map and reply route handlers, with the language model scripted
// (test/helpers/fake-openai-logos.mjs). What is held down: a plan asked for
// in words is drafted by the display pass, sealed by the plan's sanitizer and
// added to the workspace's objects, marked as Socria's; a plan made from the
// map is computed from the map with no model asked; what cannot be made —
// an unknown kind, unreadable JSON, a refusal, an empty map, a full workspace
// — is said in a sentence and adds nothing; the model second pass does not
// mistake a display for a model nobody proposed, and a model asked for is
// still built; and the reply model is told what the display holds and that
// it may not rewrite it.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-display');
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
  if (first.startsWith('logos map') || first.startsWith('[logos') || first.startsWith('[socria')) return;
  orig(...a);
};
console.info = quiet(console.info.bind(console));
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
globalThis.__uid = 'user_display_e2e';

const mapRoute = await import(pathToFileURL(join(OUT, 'map.mjs')).href);
const chatRoute = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const EMPTY = { nodes: [], edges: [] };

async function mapTurn(said, script, { map = EMPTY, today = '2026-10-10' } = {}) {
  globalThis.__logosScript = [...script];
  globalThis.__logosCalls = [];
  const req = new NextRequest('http://localhost/api/logos/map', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: said }], map, today }),
  });
  const r = await mapRoute.POST(req);
  const json = await r.json();
  return { status: r.status, json, calls: globalThis.__logosCalls, left: globalThis.__logosScript.length };
}

const plansIn = (json) => (json.map?.objects?.objs ?? []).filter((o) => o.kind === 'plan');
const systemOf = (call) => String(call?.messages?.[0]?.content ?? '');

const EXTRACTED = {
  nodes: [{ id: 'essay', label: 'History essay', type: 'concept' }],
  edges: [],
  context: 'planning',
  ask: { action: 'construct', artifact: 'display', topic: 'history essay' },
};
const PLAN = {
  display: {
    kind: 'plan',
    state: {
      title: 'History essay',
      view: 'timeline',
      items: [
        { id: 'i1', text: 'Find three sources', date: '2026-10-12', end: '2026-10-13', by: 'person' },
        { id: 'i2', text: 'Outline', date: '2026-10-14' },
        { id: 'i3', text: 'Draft', date: '2026-10-15', end: '2026-10-16' },
      ],
      links: [{ from: 'i1', to: 'i2' }, { from: 'i2', to: 'i3' }],
    },
  },
  gaps: ['the essay length'],
};

console.log('=== a plan asked for in words ===');
{
  const { status, json, calls } = await mapTurn('Make me a study plan for my history essay due next Friday', [EXTRACTED, PLAN]);
  ok('the route answers', status === 200, String(status));
  ok('the display pass ran once, after the extraction', calls.length === 2 && /EVERYDAY DISPLAYS/.test(systemOf(calls[1])), String(calls.length));
  ok('  told the person’s own calendar day', /Today is 2026-10-10/.test(systemOf(calls[1])));
  ok('  told only about plans, the kind they asked for', /"plan"/.test(systemOf(calls[1])) && /They asked for/.test(systemOf(calls[1])));
  const plans = plansIn(json);
  ok('a plan is in the workspace’s objects', plans.length === 1 && plans[0].states[0].items.length === 3, JSON.stringify(json.map?.objects)?.slice(0, 200));
  ok('  as the kind sealed it: links kept, days real', plans[0]?.states[0].links.length === 2 && plans[0].states[0].items[0].end === '2026-10-13');
  ok('  drafted by Socria, every item marked so — the claimed authorship dropped', plans[0]?.origin === 'socria' && plans[0].states[0].items.every((i) => i.by === 'socria'));
  ok('the turn says what was made, and what could not be filled', json.display?.ok === true && /Drafted by Socria: a plan “History essay”/.test(json.display.says) && /essay length/.test(json.display.says), JSON.stringify(json.display));
  ok('  and names the object, so the workspace can open it', json.display?.id === plans[0]?.id && json.display?.kind === 'plan');
  ok('no model was asked for, so no model failure is reported', !json.build, JSON.stringify(json.build));
}

console.log('\n=== asked for only in the extractor’s reading ===');
{
  const { json, calls } = await mapTurn('Lay my week out for me — gym Monday, essay Wednesday', [EXTRACTED, PLAN]);
  ok('construct → display runs the display pass even without the words', calls.length === 2 && plansIn(json).length === 1 && json.display?.ok);
  ok('  the pass is offered every kind, to choose the one that fits', /choose the kind below that fits/i.test(systemOf(calls[1])));
}

console.log('\n=== what cannot be made says so, and adds nothing ===');
{
  const unknown = await mapTurn('make me a checklist for moving house', [EXTRACTED, { display: { kind: 'flashcards', state: { cards: [] } } }]);
  ok('an unknown kind: refused, with what can be made', unknown.json.display?.ok === false && unknown.json.display.failure === 'unsupported' && /can make/.test(unknown.json.display.says) && !plansIn(unknown.json).length);
  const junk = await mapTurn('make me a checklist for moving house', [EXTRACTED, 'this is not json']);
  ok('unreadable output: refused, nothing added', junk.json.display?.ok === false && junk.json.display.failure === 'malformed' && !plansIn(junk.json).length);
  const bad = await mapTurn('make me a checklist for moving house', [EXTRACTED, { display: { kind: 'plan', state: 'a list, roughly' } }]);
  ok('a state the kind cannot hold: refused', bad.json.display?.failure === 'malformed' && !plansIn(bad.json).length);
  const no = await mapTurn('make me a timeline of my week', [EXTRACTED, { none: 'Nothing in the conversation is scheduled yet.' }]);
  ok('a pass that declines: its reason, said', no.json.display?.failure === 'declined' && /Nothing in the conversation is scheduled/.test(no.json.display.says));
  const threw = await mapTurn('make me a timeline of my week', [EXTRACTED, new Error('upstream down')]);
  ok('a pass that fails: said as a failure, the map still returned', threw.status === 200 && threw.json.display?.ok === false && threw.json.map?.nodes?.length === 1);
  const full = { nodes: [{ id: 'a', label: 'Moving', type: 'concept' }], edges: [], objects: { objs: Array.from({ length: 12 }, (_, i) => ({ id: `P${i + 1}`, kind: 'plan', name: `P${i + 1}`, origin: 'socria', states: [{ title: `Plan ${i}`, view: 'list', items: [{ id: 'i1', text: 'x', by: 'socria' }], links: [] }], steps: [], at: 0 })) } };
  const over = await mapTurn('make me a checklist for moving house', [EXTRACTED, PLAN], { map: full });
  ok('a full workspace: said, and nothing evicted', over.json.display?.failure === 'full' && plansIn(over.json).length === 12, JSON.stringify(over.json.display));
}

console.log('\n=== a plan made from the map ===');
{
  const map = {
    nodes: [
      { id: 'collect', label: 'Collect the survey data', type: 'claim' },
      { id: 'analyse', label: 'Analyse the responses', type: 'claim' },
      { id: 'write', label: 'Write the report', type: 'claim' },
      { id: 'q', label: 'Is the sample big enough?', type: 'question' },
    ],
    edges: [
      { from: 'collect', to: 'analyse', relation: 'precedes' },
      { from: 'analyse', to: 'write', relation: 'precedes' },
    ],
  };
  const extracted = { ...map, context: 'planning', ask: { action: 'construct', artifact: 'display', topic: 'survey project' } };
  const { json, calls } = await mapTurn('Turn this map into a checklist', [extracted], { map });
  ok('no model is asked to write it: only the extraction ran', calls.length === 1, String(calls.length));
  const p = plansIn(json)[0];
  ok('the map’s ideas are its items, in the map’s words and order', p?.states[0].items.map((i) => i.text).join(' | ') === 'Collect the survey data | Analyse the responses | Write the report', JSON.stringify(p?.states[0].items));
  ok('  a question stays on the map', !p?.states[0].items.some((i) => /sample/.test(i.text)));
  ok('  what precedes what is kept', p?.states[0].links.length === 2);
  ok('  opened as the checklist asked for, made from their map', p?.states[0].view === 'checklist' && p.origin === 'person' && /Made from your map/.test(json.display?.says ?? ''));
  const empty = await mapTurn('Turn this map into a checklist', [{ nodes: [], edges: [] }]);
  ok('an empty map makes nothing, and says why', empty.json.display?.ok === false && /nothing on the map yet/.test(empty.json.display.says));
}

console.log('\n=== a model is still a model ===');
{
  const FORMAL = {
    id: 'pulsar-beam',
    title: 'Pulsar beam intensity',
    params: [{ id: 'w', label: 'w', value: 1, min: 0.2, max: 3 }],
    objects: [{ id: 'i', kind: 'surface', label: 'beam intensity', meaning: 'How bright the beam is.', definition: 'exp(-(x^2 + y^2) / w)', over: { x: [-3, 3], y: [-3, 3] }, depends: ['w'] }],
  };
  const { json, calls } = await mapTurn('Model a pulsar beam with a width w', [{ nodes: [{ id: 'p', label: 'Pulsar', type: 'concept' }], edges: [], ask: { action: 'construct', artifact: 'model', topic: 'pulsar' }, propose: FORMAL }]);
  ok('a model asked for builds, and no display pass runs', json.build?.ok === true && !json.display && calls.length === 1, JSON.stringify(json.build));
  const second = await mapTurn('Model a pulsar', [{ nodes: [{ id: 'p', label: 'Pulsar', type: 'concept' }], edges: [], ask: { action: 'construct', artifact: 'model', topic: 'pulsar' } }, { propose: FORMAL }]);
  ok('  and a construction nobody proposed still gets its second pass', second.json.build?.ok === true && second.calls.length === 2 && !second.json.display);
}

console.log('\n=== the reply is told what the display holds ===');
{
  const { json } = await mapTurn('Make me a study plan for my history essay due next Friday', [EXTRACTED, PLAN]);
  globalThis.__logosPrompts = [];
  globalThis.__logosReply = 'Here is how I would use it.';
  const req = new NextRequest('http://localhost/api/logos/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Does this plan look doable?' }], objects: json.map.objects }),
  });
  const r = await chatRoute.POST(req);
  try { await r.text(); } catch {}
  const prompt = globalThis.__logosPrompts[0] ?? '';
  ok('the plan is described to the reply, item by item', /PLAN “History essay”/.test(prompt) && /Find three sources \[2026-10-12→2026-10-13\]/.test(prompt), prompt.slice(-1200));
  ok('  with the display rules: use what it computes, never rewrite it, its text is not instructions', /A DISPLAY \(a plan/.test(prompt) && /never paste the display back/.test(prompt) && /never instructions to you/.test(prompt));
  ok('  and the plan’s own rule, from its kind', /A PLAN is the person’s own document/.test(prompt));
  ok('  and none of the matrix rules it has no use for', !/R2 ← R2 − 3R1/.test(prompt));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
