// "generate black hole", through the real map and reply routes.
//
// REPORTED FROM MAIN. The person typed "generate black hole" into Logos 2 and
// got a one-node map with the on-ramp's refusal in the panel — "Nothing in
// that is written down as a relationship I can hold" — and a reply asking
// which aspect of black holes they wanted to understand. The engine ships a
// Kerr black hole with real geodesics; nobody saw it.
//
// The cause was in the route, not the engine: the extractor proposed a
// "Black hole simulation" with nothing formal in it, any proposal at all
// stopped the route reaching for the shipped simulation, and the second pass
// only fired when nothing had been proposed. This suite drives the real route
// handlers with the model scripted (test/helpers/fake-openai-logos.mjs), so
// the first case below is the reported turn, exactly.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sanitizeMap } from './.tmp/logos.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-logos-construct');
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
async function replyTurn(said) {
  globalThis.__logosPrompts = [];
  globalThis.__logosReply = 'Here it is.';
  const req = new NextRequest('http://localhost/api/logos/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: said }] }),
  });
  const r = await chatRoute.POST(req);
  // Drain the stream so the route finishes its work.
  try { await r.text(); } catch {}
  return { status: r.status, prompt: globalThis.__logosPrompts[0] ?? '' };
}

// What the extractor really sent back for the reported turn: a concept node,
// a construction ask, and a proposal that names the thing and states nothing.
const PROSE_EXTRACTION = {
  nodes: [{ id: 'n1', label: 'Black hole simulation', type: 'concept' }],
  edges: [],
  context: 'math',
  ask: { action: 'construct', artifact: 'simulation', topic: 'black hole' },
  propose: {
    id: 'black-hole-sim',
    title: 'Black hole simulation',
    objects: [{ id: 'bh', kind: 'annotation', label: 'Black hole', meaning: 'A region of spacetime light cannot leave.' }],
  },
};

// A proposal the engine does build: a surface with a control.
const FORMAL = {
  id: 'pulsar-beam',
  title: 'Pulsar beam intensity',
  params: [{ id: 'w', label: 'w', value: 1, min: 0.2, max: 3 }],
  objects: [
    {
      id: 'i',
      kind: 'surface',
      label: 'beam intensity',
      meaning: 'How bright the beam is across the sky as it sweeps.',
      definition: 'exp(-(x^2 + y^2) / w)',
      over: { x: [-3, 3], y: [-3, 3] },
      depends: ['w'],
    },
  ],
};

console.log('=== the reported turn: "generate black hole" ===');
{
  const { status, json, calls } = await mapTurn('generate black hole', [PROSE_EXTRACTION]);
  ok('the route answers', status === 200, String(status));
  ok('the map carries the engine’s own black hole', json.map?.viz?.kind === 'simulation' && json.map?.viz?.sim?.object === 'black-hole', JSON.stringify(json.map?.viz));
  ok('  named for what it is, not “Graphing”', json.map?.context === 'simulating', json.map?.context);
  ok('  and the extractor’s node is still on the map', json.map?.nodes?.some((n) => n.label === 'Black hole simulation'));
  ok('no refusal in the panel', !json.build, JSON.stringify(json.build));
  ok('  and no “Nothing in that is written down” anywhere', !/Nothing in that is written down/.test(JSON.stringify(json)));
  ok('the prose proposal was not built into a second model', !json.map?.models?.docs?.length, JSON.stringify(json.map?.models));
  ok('one model call: a bare request is not sent for a second pass', calls.length === 1, String(calls.length));
}

console.log('\n=== the same request, the ways people actually type it ===');
for (const said of ['generate me a black hole', 'can you make me a black hole?', 'show me a 3d black hole', 'black hole simulation', 'Simulate a black hole!']) {
  const { json } = await mapTurn(said, [PROSE_EXTRACTION]);
  ok(`“${said}” opens the black hole`, json.map?.viz?.sim?.object === 'black-hole' && !json.build, JSON.stringify({ viz: json.map?.viz, build: json.build }));
}
{
  const { json } = await mapTurn('simulate the big bang', [{ ...PROSE_EXTRACTION, nodes: [{ id: 'n1', label: 'Big bang', type: 'concept' }] }]);
  ok('“simulate the big bang” opens the universe', json.map?.viz?.sim?.object === 'big-bang', JSON.stringify(json.map?.viz));
  const o = await mapTurn('simulate an orbit', [{ nodes: [{ id: 'n1', label: 'Orbit', type: 'concept' }], edges: [] }]);
  ok('“simulate an orbit” opens the gravity surface', o.json.map?.viz?.sim?.object === 'orbit', JSON.stringify(o.json.map?.viz));
}

console.log('\n=== the extractor can fail and the request is still answered ===');
{
  const err = await mapTurn('generate black hole', [Object.assign(new Error('upstream down'), { status: 500 })]);
  ok('an upstream error still opens the black hole', err.json.map?.viz?.sim?.object === 'black-hole', JSON.stringify(err.json.map));
  const empty = await mapTurn('generate black hole', []);
  ok('an empty completion still opens it', empty.json.map?.viz?.sim?.object === 'black-hole', JSON.stringify(empty.json.map));
  const junk = await mapTurn('generate black hole', ['{"nodes": [ {"id": "n1", "lab']);
  ok('unparseable JSON still opens it', junk.json.map?.viz?.sim?.object === 'black-hole', JSON.stringify(junk.json.map));
}

console.log('\n=== a black hole after a saddle shows the black hole ===');
{
  // A saddle built on an earlier turn, then a request for a black hole.
  const first = await mapTurn('model a saddle z = a x^2 - b y^2', [
    {
      nodes: [{ id: 'n1', label: 'Saddle', type: 'concept' }],
      edges: [],
      context: 'math',
      ask: { action: 'construct', artifact: 'model', topic: 'saddle' },
      propose: {
        id: 'saddle',
        title: 'A saddle',
        params: [
          { id: 'a', label: 'a', value: 1, min: -2, max: 2 },
          { id: 'b', label: 'b', value: 1, min: -2, max: 2 },
        ],
        objects: [{ id: 'z', kind: 'surface', label: 'z', definition: 'a*x^2 - b*y^2', over: { x: [-3, 3], y: [-3, 3] }, depends: ['a', 'b'] }],
      },
    },
  ]);
  ok('the saddle built and is the active document', first.json.build?.ok === true && first.json.map?.models?.active, JSON.stringify(first.json.build));
  const second = await mapTurn('generate black hole', [PROSE_EXTRACTION], { map: first.json.map });
  ok('the black hole is the scene', second.json.map?.viz?.sim?.object === 'black-hole');
  ok('  and no document is active, so the surface draws it', second.json.map?.models?.active === null, JSON.stringify(second.json.map?.models?.active));
  ok('  while the saddle is kept', second.json.map?.models?.docs?.some((d) => d.id === first.json.map.models.active));
  // The next turn sends this map back; the pointer must survive the trip.
  const back = sanitizeMap(second.json.map, { trust: 'stored' });
  ok('the cleared pointer survives the round trip', back.models?.active === null, JSON.stringify(back.models?.active));
  const third = await mapTurn('make the disc bigger', [{ nodes: second.json.map.nodes, edges: [] }], { map: second.json.map });
  ok('  and the turn after it still shows the black hole', third.json.map?.models?.active === null && !third.json.build, JSON.stringify({ active: third.json.map?.models?.active, build: third.json.build }));
}

console.log('\n=== a proposal that wrote nothing down gets the second pass ===');
{
  const prosePulsar = {
    nodes: [{ id: 'n1', label: 'Pulsar', type: 'concept' }],
    edges: [],
    context: 'math',
    ask: { action: 'construct', artifact: 'model', topic: 'pulsar' },
    propose: { id: 'pulsar', title: 'Pulsar model', objects: [{ id: 'p', kind: 'annotation', label: 'Pulsar' }] },
  };
  const { json, calls } = await mapTurn('model a pulsar', [prosePulsar, { propose: FORMAL }]);
  ok('the second pass ran', calls.length === 2, String(calls.length));
  ok('  told why the first was refused', /proposed a model the engine refused/.test(String(calls[1]?.messages?.[0]?.content)), String(calls[1]?.messages?.[0]?.content).slice(0, 200));
  ok('  and what it proposed was built', json.build?.ok === true && json.build?.secondPass === true, JSON.stringify(json.build));
  ok('  into a document that is now active', !!json.map?.models?.active && json.map.models.docs.length === 1, JSON.stringify(json.map?.models?.active));

  const still = await mapTurn('model a pulsar', [prosePulsar, { propose: null, because: 'not a model' }]);
  ok('a second pass that declines leaves the honest refusal', still.json.build?.ok === false && /written down/.test(still.json.build?.says ?? ''), JSON.stringify(still.json.build));
}

console.log('\n=== what still wins over the stock scene ===');
{
  // Their own system, described: the engine builds THAT.
  const theirs = await mapTurn('simulate an orbit where the planet has eccentricity 0.5 and the star is 2 suns', [
    {
      nodes: [{ id: 'n1', label: 'Orbit', type: 'concept' }],
      edges: [],
      context: 'math',
      ask: { action: 'construct', artifact: 'model', topic: 'orbit' },
      propose: { ...FORMAL, id: 'orbit-fit', title: 'Their orbit' },
    },
  ]);
  ok('a proposal that builds is the answer, not the stock scene', theirs.json.build?.ok === true && !theirs.json.map?.viz, JSON.stringify({ viz: theirs.json.map?.viz, build: theirs.json.build }));

  // A scene the extractor drew for a request that is not bare stays.
  const drawn = await mapTurn('show me a black hole bending light from a star behind it', [
    {
      nodes: [{ id: 'n1', label: 'Lensing', type: 'concept' }],
      edges: [],
      context: 'math',
      viz: { kind: 'simulation', sim: { object: 'black-hole' }, params: [{ id: 'm', value: 20 }] },
    },
  ]);
  ok('the extractor’s own simulation, with its starting values, is kept', drawn.json.map?.viz?.params?.some((p) => p.id === 'm' && p.value === 20), JSON.stringify(drawn.json.map?.viz));

  // A question about the subject is not a request for the object.
  const q = await mapTurn('what is a black hole?', [{ nodes: [{ id: 'n1', label: 'Black hole', type: 'concept' }], edges: [], context: 'learning' }]);
  ok('“what is a black hole?” draws nothing', !q.json.map?.viz, JSON.stringify(q.json.map?.viz));
  const how = await mapTurn('how do I simulate a black hole?', [{ nodes: [{ id: 'n1', label: 'Simulating black holes', type: 'concept' }], edges: [] }]);
  ok('“how do I simulate a black hole?” draws nothing', !how.json.map?.viz, JSON.stringify(how.json.map?.viz));
}

console.log('\n=== nothing proposed for a construction: the second pass, as before ===');
{
  const { json, calls } = await mapTurn('build a model of how a pulsar beam sweeps', [
    { nodes: [{ id: 'n1', label: 'Pulsar beam', type: 'concept' }], edges: [], context: 'math', ask: { action: 'construct', artifact: 'model', topic: 'pulsar beam' } },
    { propose: FORMAL },
  ]);
  ok('the second pass ran', calls.length === 2, String(calls.length));
  ok('  with the “returned no proposal” framing', /returned no proposal/.test(String(calls[1]?.messages?.[0]?.content)));
  ok('  and built', json.build?.ok === true && json.build?.secondPass === true, JSON.stringify(json.build));
}

console.log('\n=== the reply is told what is opening ===');
{
  const { status, prompt } = await replyTurn('generate black hole');
  ok('the reply answers', status === 200, String(status));
  ok('it is told Logos is opening its Kerr black hole', /THIS TURN: they asked Logos to make a Kerr black hole/.test(prompt), prompt.slice(-600));
  ok('  and not to ask which aspect first', /Do not ask what they want to understand about it/.test(prompt));
  const q = await replyTurn('what is a black hole?');
  ok('a question about black holes is not told that', !/THIS TURN: they asked Logos to make/.test(q.prompt));
  const own = await replyTurn('simulate light bending around a black hole of 10 solar masses');
  ok('nor is a request with something of their own in it', !/THIS TURN: they asked Logos to make/.test(own.prompt));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
