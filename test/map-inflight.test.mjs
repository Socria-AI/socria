// What the person did to their map while an extraction was in flight stands.
//
// A turn sends the map to the extractor and goes on; the person goes on too —
// renames a card, marks one resolved, adds their own, takes one off, draws a
// link, cuts one, moves a model's slider. The extractor saw none of it, and
// what it returns used to replace the map wholesale: every one of those edits
// reverted when it landed, saved, and recorded as the person's own turn.
//
//   - the edits made since the request are replayed onto what came back,
//     and where the extractor reworded the same card, the person's word wins
//     (lib/map-edit.ts replayMapChange, personWins);
//   - the route says when a turn changed the model workspace (modelsChanged);
//     everything else it hands back is the echo of what it was sent, and the
//     live workspace is kept — the old byte-for-byte test never matched,
//     because the route re-sanitises what it is sent;
//   - what lands is checked as a stored map is, so one malformed card cannot
//     take the page down on every load after.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-map-inflight');
const H = (f) => join(here, 'helpers', f);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await build({ entryPoints: [join(root, 'lib/map-edit.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'map-edit.mjs'), tsconfig: join(root, 'tsconfig.json'), packages: 'external', logLevel: 'error' });
await build({ entryPoints: [join(root, 'lib/model/docs.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'docs.mjs'), tsconfig: join(root, 'tsconfig.json'), packages: 'external', logLevel: 'error' });
const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(H('fake-supabase.mjs')).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(H('fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(H('fake-openai-logos.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: H('server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
await build({ entryPoints: [join(root, 'app/api/logos/map/route.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'map.mjs'), tsconfig: join(root, 'tsconfig.json'), plugins: [swap], packages: 'external', logLevel: 'error' });

const { replayMapChange } = await import(pathToFileURL(join(OUT, 'map-edit.mjs')).href);
const { openFromProposal, setValue, EMPTY_WORKSPACE } = await import(pathToFileURL(join(OUT, 'docs.mjs')).href);
let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const node = (id, label, o = {}) => ({ id, type: 'idea', label, status: 'open', ...o });
const byId = (m, id) => m.nodes.find((n) => n.id === id);
const linked = (m, a, b) => m.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));

console.log('\nthe edits made while it ran are replayed onto what came back');
{
  // What was sent.
  const sent = { nodes: [node('a', 'Rent'), node('b', 'Commute'), node('c', 'Salary')], edges: [{ from: 'a', to: 'b', kind: 'relates' }] };
  // What the person did meanwhile: renamed a, resolved b, took c off, added d, linked a–d, cut a–b.
  const live = {
    nodes: [node('a', 'Rent in Austin'), node('b', 'Commute', { status: 'resolved' }), node('n_my_own_card', 'My own card')],
    edges: [{ from: 'a', to: 'n_my_own_card', kind: 'relates' }],
    removed: ['salary'],
  };
  // What the extractor returned, built from `sent`: it reworded a, and added e and a b–e link.
  const extracted = {
    nodes: [node('a', 'Rent costs'), node('b', 'Commute'), node('c', 'Salary'), node('e', 'Moving cost')],
    edges: [{ from: 'a', to: 'b', kind: 'relates' }, { from: 'b', to: 'e', kind: 'relates' }],
  };
  const out = replayMapChange(extracted, sent, live, { personWins: true }).map;
  ok('their rename stands, over the extractor’s rewording', byId(out, 'a')?.label === 'Rent in Austin', JSON.stringify(byId(out, 'a')));
  ok('their "resolved" stands', byId(out, 'b')?.status === 'resolved');
  ok('the card they added is there', !!byId(out, 'n_my_own_card'));
  ok('the card they took off stays off', !byId(out, 'c') && out.removed?.includes('salary'));
  ok('the link they drew is there', linked(out, 'a', 'n_my_own_card'));
  ok('the link they cut stays cut', !linked(out, 'a', 'b'));
  ok('and what the extractor genuinely added is kept', !!byId(out, 'e') && linked(out, 'b', 'e'));
  // Undo replays without personWins, and leaves a card changed since alone — which is why the option exists.
  const undo = replayMapChange(extracted, sent, live).map;
  ok('without personWins (undo), a card changed since is left as it is', byId(undo, 'a')?.label === 'Rent costs');
}
{
  const sent = { nodes: [node('a', 'Rent'), node('b', 'Commute')], edges: [] };
  const live = { nodes: [node('a', 'Rent, with the deposit'), node('b', 'Commute')], edges: [] };
  const extracted = { nodes: [node('b', 'Commute'), node('m', 'Housing')], edges: [] };
  const out = replayMapChange(extracted, sent, live, { personWins: true }).map;
  ok('a card they edited that the extractor dropped comes back', byId(out, 'a')?.label === 'Rent, with the deposit');
  const quiet = { nodes: [node('a', 'Rent'), node('b', 'Commute')], edges: [] };
  const out2 = replayMapChange(extracted, sent, quiet, { personWins: true }).map;
  ok('one they did not touch is the extractor’s to drop', !byId(out2, 'a') && !!byId(out2, 'm'));
}

console.log('\nthe route says when a turn changed the workspace');
{
  process.env.OPENAI_API_KEY = 'test';
  process.env.RATE_LIMIT_DISABLED = '1';
  console.info = () => {};
  console.warn = () => {};
  const { db } = await import(pathToFileURL(H('fake-supabase.mjs')).href);
  const { NextRequest } = await import('next/server.js');
  const { POST } = await import(pathToFileURL(join(OUT, 'map.mjs')).href);
  db.reset();
  globalThis.__uid = 'una';
  globalThis.__users = { una: { firstName: 'Una', emails: ['una@example.com'] } };
  const proposal = { id: 'spring_system', title: 'A mass on a spring', domain: 'mechanics', aspect: 'equal', equations: ['m ẍ + c ẋ + k x = F(t), assembled from the parts'], assumptions: ['One degree of freedom along the axis.'], params: [{ id: 'm', label: 'mass', value: 1, min: 0.1, max: 5, units: 'kg' }, { id: 'k', label: 'stiffness', value: 20, min: 1, max: 100, units: 'N/m' }, { id: 'c', label: 'damping', value: 0.5, min: 0, max: 10 }], time: { t: 0, min: 0, max: 20, units: 's' }, objects: [{ id: 'mech', kind: 'component', label: 'The mechanism', meaning: 'one body, one spring, one damper', mechanism: { bodies: [{ id: 'm1', mass: 'm', x0: 1, label: 'the mass', at: 3 }], springs: [{ id: 'k1', between: ['m1', 'ground'], value: 'k', label: 'the spring' }], dampers: [{ id: 'c1', between: ['m1', 'ground'], value: 'c', label: 'the damper' }], dt: 0.004, steps: 3000 } }] };
  const made = openFromProposal(EMPTY_WORKSPACE, proposal, { at: 1 });
  const ws = setValue(made.workspace, made.doc.id, 'k', 70, 2).workspace;
  const map = { nodes: [node('a', 'The spring'), node('b', 'How stiff it is')], edges: [], models: ws };
  globalThis.__logosScript = [{ nodes: [node('a', 'The spring'), node('b', 'How stiff it is')], edges: [] }];
  const r = await POST(
    new NextRequest('http://localhost/api/logos/map', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 's1', messages: [{ role: 'user', content: 'The spring feels too stiff to me.' }, { role: 'assistant', content: 'What makes it feel stiff?' }], map }),
    })
  );
  const json = await r.json();
  ok('a turn that built nothing: 200', r.status === 200, JSON.stringify(json).slice(0, 200));
  ok('  and it does not claim to have changed the workspace', json.modelsChanged === undefined, String(json.modelsChanged));
  ok('  even though what it sent back is not byte-for-byte what it was sent', JSON.stringify(json.map?.models ?? null) !== JSON.stringify(ws));
}

console.log('\nthe landing is wired to both');
{
  const app = readFileSync(join(root, 'components/LogosApp.tsx'), 'utf8');
  ok('what was sent is kept beside the request', /const sentMap = mapRef\.current;/.test(app));
  ok('the person’s edits since are replayed onto what came back', /replayMapChange\(dropRemoved\(map, s\.map\?\.removed\), sentMap, s\.map \?\? sentMap, \{ personWins: true \}\)/.test(app));
  ok('the live workspace is kept unless the route says it changed', /const models = json\.modelsChanged \? json\.map\.models : s\.map\?\.models;/.test(app) && !/sentModels/.test(app));
  ok('what lands is checked as a stored map', /if \(json\?\.map\) json\.map = sanitizeMap\(json\.map, \{ trust: 'stored' \}\);/.test(app));
  ok('grounding is pruned against what landed, not against the raw extraction', /const liveIds = new Set\(kept\.nodes\.map\(\(n\) => n\.id\)\);/.test(app));
  ok('and the "what changed" note is drawn from what landed', /const delta = diffMaps\(before, landed \?\? json\.map\);/.test(app));
}

console.log(`\nmap-inflight: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
