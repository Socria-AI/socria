// Representation intent, through the real map and reply routes.
//
// The reported failure: "I am planning Socria's onboarding and the steps a new
// user goes through" came back as a cloud of Constraint and Value nodes. This
// suite drives the real route handlers with the extractor SCRIPTED
// (test/helpers/fake-openai-logos.mjs, fixtures in test/fixtures/shapes.mjs):
// what the deterministic half does with an extraction — read what is being
// built, repair a shape the structure does not hold, take the person's
// correction, keep everything — is held here. Whether the live model follows
// the new instructions is not something a scripted suite can show.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sanitizeMap } from './.tmp/logos.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-representation');
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

// The routes narrate their corrections on purpose; under test that is noise.
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
globalThis.__uid = 'user_logos_e2e';

const mapRoute = await import(pathToFileURL(join(OUT, 'map.mjs')).href);
const chatRoute = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
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


import { readBuilding as _rb, satisfies, spineOf, orderSpine, attachmentsOf, briefOf } from './.tmp/representation.mjs';
import { availableLenses, leadLens } from './.tmp/logos-layout.mjs';
import { ONBOARDING_CLOUD, ONBOARDING_REPAIRED, ONBOARDING_TURNS, SCENARIOS } from './fixtures/shapes.mjs';

const lead = (m) => leadLens(availableLenses(m), !!m.viz || !!m.models?.docs?.length, m.building);
const sys = (calls, i = 0) => String(calls[i]?.messages?.[0]?.content ?? '');

console.log('=== the reported failure, through the route ===');
{
  const said = "I am planning Socria's onboarding and the steps a new user goes through.";
  const { status, json, calls } = await mapTurn(said, [{ ...ONBOARDING_CLOUD, building: { kind: 'process' } }, ONBOARDING_REPAIRED]);
  ok('the route answers', status === 200, String(status));
  ok('the extractor was asked what they are building first', /WHAT ARE THEY BUILDING\?/.test(sys(calls)));
  ok('a process handed back as a cloud is restructured, once', calls.length === 2 && /restructure a map/.test(sys(calls, 1)), String(calls.length));
  ok('  and the map that comes back is a flow', satisfies(json.map, 'process') && lead(json.map) === 'flow', lead(json.map));
  ok('  with every idea that was in the cloud still on it', ['ux', 'steps', 'info', 'easy'].every((id) => json.map.nodes.some((n) => n.id === id)));
  ok('  as details of the steps, not peers of them', attachmentsOf(json.map, spineOf(json.map, 'process')).get('signup')?.some((n) => n.id === 'info'));

  const lossy = { ...ONBOARDING_REPAIRED, nodes: ONBOARDING_REPAIRED.nodes.filter((n) => n.id !== 'info') };
  const r2 = await mapTurn(said, [{ ...ONBOARDING_CLOUD, building: { kind: 'process' } }, lossy]);
  ok('a restructure that drops thinking is not kept', r2.json.map.nodes.some((n) => n.id === 'info') && !satisfies(r2.json.map, 'process'));

  const r3 = await mapTurn(said, [{ ...ONBOARDING_CLOUD, building: { kind: 'process' } }, new Error('upstream')]);
  ok('a failed restructure still returns the map', r3.status === 200 && r3.json.map.nodes.length === 4);

  const r4 = await mapTurn(said, [ONBOARDING_CLOUD]);
  ok('with no reading claimed, nothing is restructured behind their back', r4.calls.length === 1 && r4.json.map.building?.kind !== 'process', JSON.stringify(r4.json.map.building));
}

console.log('\n=== the onboarding conversation, end to end ===');
{
  let map = EMPTY;
  const history = [];
  const reply = 'Noted.';
  for (const [i, t] of ONBOARDING_TURNS.entries()) {
    const { json, calls } = await mapTurn(t.said, [t.map], { map, history });
    map = json.map;
    history.push({ role: 'user', content: t.said }, { role: 'assistant', content: reply });
    ok(`turn ${i + 1}: a process, drawn as a flow`, map.building?.kind === 'process' && lead(map) === 'flow', `${map.building?.kind} ${lead(map)}`);
    ok(`turn ${i + 1}: no repair needed`, calls.length === 1, String(calls.length));
    if (i > 0) ok(`turn ${i + 1}: the extractor saw the reading it had`, /Last read as: process/.test(sys(calls)));
  }
  const order = orderSpine(map, spineOf(map, 'process')).map((l) => l.join('+')).join(' → ');
  ok('the conversation built one coherent flow', order === 'landing → try → guest → intro → first → choose → coreaha+logosaha → signup → product → discovery → convert', order);
  const loose = map.nodes.filter((n) => !spineOf(map, 'process').has(n.id) && ![...attachmentsOf(map, spineOf(map, 'process')).values()].flat().some((d) => d.id === n.id));
  ok('  not a cloud: every detail hangs from a step', loose.length === 0, loose.map((n) => n.label).join(', '));
  const { prompt } = await replyTurn('What comes after signup?', { building: briefOf(map) });
  ok('the reply is told the flow, in order', /WHAT THEY ARE BUILDING: a process/.test(prompt) && /Landing page → Try Socria → Guest session/.test(prompt));
}

console.log('\n=== "Actually, show this as a process." ===');
{
  const decision = SCENARIOS.find((s) => s.expect.kind === 'decision').map;
  const start = (await mapTurn('Should I move to Lisbon?', [decision])).json.map;
  ok('a decision opens as its table', start.building?.kind === 'decision' && lead(start) === 'matrix', `${start.building?.kind} ${lead(start)}`);
  const asProcess = {
    nodes: [
      ...decision.nodes.map((n) => ({ ...n, role: n.id === 'd' ? 'start' : ['stay', 'move'].includes(n.id) ? 'step' : n.role === 'criterion' ? 'value' : n.role })),
    ],
    edges: [
      { from: 'd', to: 'stay', relation: 'precedes', when: 'job stays office-based' },
      { from: 'd', to: 'move', relation: 'precedes', when: 'remote is approved' },
      { from: 'cost', to: 'move', relation: 'applies_to' },
      { from: 'friends', to: 'stay', relation: 'applies_to' },
      { from: 'career', to: 'move', relation: 'applies_to' },
      { from: 'unsure', to: 'd', relation: 'applies_to' },
    ],
  };
  const { json, calls } = await mapTurn('Actually, show this as a process.', [decision, asProcess], { map: start });
  ok('the extractor is told the person asked for a process', /THE PERSON ASKED TO SEE THIS AS A PROCESS/.test(sys(calls)));
  ok('the person’s word wins', json.map.building?.kind === 'process' && json.map.building?.by === 'person');
  ok('the map is restructured into one', satisfies(json.map, 'process') && lead(json.map) === 'flow', lead(json.map));
  ok('  without losing a single idea', decision.nodes.every((n) => json.map.nodes.some((m) => m.id === n.id)));
  const next = await mapTurn('The cost difference is about 30%.', [{ ...asProcess, building: { kind: 'decision' } }], { map: json.map });
  ok('and it stays a process on the next turn', next.json.map.building?.kind === 'process' && next.json.map.building?.by === 'person');
}

console.log('\n=== eight other pieces of thinking, through the same route ===');
{
  const seen = new Set();
  for (const s of SCENARIOS) {
    const { json, calls } = await mapTurn(s.name, [s.map]);
    seen.add(json.map.building?.kind);
    ok(`${s.name}: ${s.expect.kind}, opened on ${s.expect.lens}`, json.map.building?.kind === s.expect.kind && lead(json.map) === s.expect.lens, `${json.map.building?.kind} ${lead(json.map)}`);
    ok(`${s.name}: already the right shape, so no repair`, calls.length === 1, String(calls.length));
  }
  ok('the same route chose eight different shapes', seen.size === 8, [...seen].join(' '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
