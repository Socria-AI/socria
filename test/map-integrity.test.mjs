// The Logic Map is the person's thinking, and nothing quietly rewrites it.
//
//   - Asked to see it "as a process", the restructure pass gives it a shape —
//     roles and order — and nothing else: a resolved card stays resolved,
//     Socria's suggestion keeps Socria's mark, what was merged stays merged,
//     and a step the restructure added that nobody named is marked as
//     Socria's reading, never shown as the person's own. (Taken whole, it
//     reopened every card and stripped every mark: MAP-2.)
//   - A card or a connection added by hand at the map's limit is refused, in
//     a sentence, while it can still be acted on — rather than confirmed and
//     then dropped by the next save. And a label is kept at the length it is
//     confirmed at. (MAP-3.)

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-map-integrity');
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
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(H('fake-openai-logos.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: H('server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
await build({ entryPoints: [join(root, 'app/api/logos/map/route.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'map.mjs'), tsconfig: join(root, 'tsconfig.json'), plugins: [swap], packages: 'external', logLevel: 'error' });
await build({ entryPoints: [join(root, 'lib/map-edit.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'map-edit.mjs'), tsconfig: join(root, 'tsconfig.json'), packages: 'external', logLevel: 'error' });
await build({ entryPoints: [join(root, 'lib/logos.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'logos.mjs'), tsconfig: join(root, 'tsconfig.json'), packages: 'external', logLevel: 'error' });

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
console.info = () => {};
console.warn = () => {};
process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
const { db } = await import(pathToFileURL(H('fake-supabase.mjs')).href);
const { NextRequest } = await import('next/server.js');
const { POST } = await import(pathToFileURL(join(OUT, 'map.mjs')).href);
const { applyMapEdits, dropRemoved } = await import(pathToFileURL(join(OUT, 'map-edit.mjs')).href);
const { sanitizeMap } = await import(pathToFileURL(join(OUT, 'logos.mjs')).href);

console.log('\n"show this as a process" gives it a shape, and takes nothing away');
{
  db.reset();
  globalThis.__uid = 'una';
  globalThis.__users = { una: { firstName: 'Una', emails: ['una@example.com'] } };
  const N = (id, label, extra = {}) => ({ id, type: 'step', label, status: 'open', ...extra });
  const current = {
    context: 'planning',
    nodes: [
      N('signup', 'Sign up', { status: 'resolved' }),
      N('verify', 'Verify email', { merged: ['Confirm address'] }),
      N('onboard', 'Onboarding call', { origin: 'socria', note: 'Socria suggested this' }),
      N('pay', 'Pay after trial', { type: 'constraint', status: 'supported' }),
    ],
    edges: [{ from: 'signup', to: 'verify', relation: 'relates' }],
  };
  const said = [
    { role: 'user', content: 'We sign up, verify email, then pay after the trial.' },
    { role: 'assistant', content: 'Where does the onboarding call fit?' },
    { role: 'user', content: 'Show this as a process.' },
  ];
  // The first pass keeps every card but gives no order; the restructure adds roles, order, and one implied step.
  const first = { context: 'planning', building: { kind: 'process', why: 'a sign-up flow' }, nodes: current.nodes.map(({ origin, note, ...n }) => n), edges: current.edges };
  const restructured = {
    nodes: [
      { id: 'signup', type: 'step', role: 'step', label: 'Sign up' },
      { id: 'verify', type: 'step', role: 'step', label: 'Verify email' },
      { id: 'onboard', type: 'step', role: 'step', label: 'Onboarding call' },
      { id: 'pay', type: 'constraint', role: 'constraint', label: 'Pay after trial' },
      { id: 'start', type: 'step', role: 'start', label: 'Land on the site' },
    ],
    edges: [
      { from: 'start', to: 'signup', relation: 'precedes' },
      { from: 'signup', to: 'verify', relation: 'precedes' },
      { from: 'verify', to: 'onboard', relation: 'precedes' },
      { from: 'pay', to: 'onboard', relation: 'applies_to' },
    ],
  };
  globalThis.__logosScript = [first, restructured];
  globalThis.__logosCalls = [];
  const r = await POST(new NextRequest('http://localhost/api/logos/map', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: said, map: current }) }));
  const json = await r.json();
  const at = (id) => json.map?.nodes?.find((n) => n.id === id);
  ok('the restructure ran', globalThis.__logosCalls.length >= 2, String(globalThis.__logosCalls.length));
  ok('it took the shape: roles and order', at('signup')?.role === 'step' && json.map.edges.some((e) => e.from === 'signup' && e.to === 'verify' && e.relation === 'precedes'));
  ok('a resolved card stays resolved', at('signup')?.status === 'resolved', JSON.stringify(at('signup')));
  ok('a supported card stays supported', at('pay')?.status === 'supported', JSON.stringify(at('pay')));
  ok('Socria’s suggestion keeps Socria’s mark', at('onboard')?.origin === 'socria', JSON.stringify(at('onboard')));
  ok('what was merged stays merged', (at('verify')?.merged ?? []).includes('Confirm address'), JSON.stringify(at('verify')));
  ok('a step nobody named is marked as Socria’s, not the person’s', at('start')?.origin === 'socria', JSON.stringify(at('start')));
}

console.log('\nat the limit, an edit by hand is refused in words, not dropped later');
{
  const full = { nodes: Array.from({ length: 16 }, (_, i) => ({ id: `c${i}`, type: 'idea', label: `Card ${i}`, status: 'open' })), edges: [] };
  ok('the plain map holds 16 cards (what the save keeps)', sanitizeMap({ ...full, nodes: [...full.nodes, { id: 'x', type: 'idea', label: 'One more', status: 'open' }] }).nodes.length === 16);
  const add = applyMapEdits(full, [{ op: 'add', node: { label: 'My seventeenth card', type: 'idea' } }]);
  ok('a 17th card by hand is refused', add.map.nodes.length === 16 && add.refused.length === 1, JSON.stringify(add.refused));
  ok('  saying how to make room', /16 cards/.test(add.refused[0] ?? '') && /Take one off or merge two/.test(add.refused[0] ?? ''));
  const room = applyMapEdits({ ...full, nodes: full.nodes.slice(1) }, [{ op: 'add', node: { label: 'My sixteenth card', type: 'idea' } }]);
  ok('below the limit it goes in', room.map.nodes.length === 16 && room.refused.length === 0);
  ok('  and survives the save', sanitizeMap(room.map).nodes.some((n) => n.label === 'My sixteenth card'));

  const n = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, type: 'idea', label: `Card ${i}`, status: 'open' }));
  const pairs = [];
  for (let i = 0; i < 12 && pairs.length < 22; i++) for (let j = i + 1; j < 12 && pairs.length < 22; j++) pairs.push({ from: `c${i}`, to: `c${j}`, relation: 'relates', strength: 'normal' });
  const wired = { nodes: n, edges: pairs };
  ok('the plain map holds 22 connections', sanitizeMap({ ...wired, edges: [...pairs, { from: 'c10', to: 'c11', relation: 'relates' }] }).edges.length <= 22);
  const link = applyMapEdits(wired, [{ op: 'link', from: 'c10', to: 'c11' }]);
  ok('a 23rd connection by hand is refused, in words', link.map.edges.length === 22 && /22 connections/.test(link.refused[0] ?? ''), JSON.stringify(link.refused));

  const long = 'An idea whose name runs on for a hundred and four characters, which is longer than a saved card keeps it';
  const renamed = applyMapEdits({ nodes: [{ id: 'a', type: 'idea', label: 'Short', status: 'open' }], edges: [] }, [{ op: 'rename', id: 'a', label: long }]);
  const confirmed = renamed.map.nodes[0].label;
  ok('a rename is kept at the length it is confirmed at', sanitizeMap(renamed.map).nodes[0].label === confirmed, `${confirmed.length} → ${sanitizeMap(renamed.map).nodes[0].label.length}`);
}

console.log('\ntaking one card off never takes another with it (MAP-7)');
{
  const c = (id, label) => ({ id, type: 'claim', label, status: 'open' });
  const map = { nodes: [c('a', 'x = −3'), c('b', 'x = 3'), c('p', 'Profit ≤ 0'), c('q', 'Profit ≥ 0')], edges: [] };
  const off = applyMapEdits(map, [{ op: 'remove', id: 'a' }, { op: 'remove', id: 'p' }]).map;
  const landed = dropRemoved({ ...map, nodes: [c('b', 'x = 3'), c('q', 'Profit ≥ 0'), c('a2', 'x = −3')] }, off.removed);
  ok('"x = −3" taken off; "x = 3" stays at the next landing', landed.nodes.some((n) => n.label === 'x = 3') && !landed.nodes.some((n) => n.label === 'x = −3'), JSON.stringify(landed.nodes.map((n) => n.label)));
  ok('"Profit ≤ 0" taken off; "Profit ≥ 0" stays', landed.nodes.some((n) => n.label === 'Profit ≥ 0'));
  const back = applyMapEdits({ nodes: [c('b', 'x = 3')], edges: [] }, [{ op: 'add', node: { label: 'x = −3', type: 'claim' } }]);
  ok('adding "x = −3" beside "x = 3" is not refused as a duplicate', back.refused.length === 0 && back.map.nodes.length === 2, JSON.stringify(back.refused));
  const renamed = applyMapEdits({ nodes: [c('r', 'Rent')], edges: [], removed: ['rent in austin'] }, [{ op: 'rename', id: 'r', label: 'Rent in Austin' }]).map;
  ok('a card renamed to wording once taken off is not taken off at the next landing', dropRemoved(renamed, renamed.removed).nodes.some((n) => n.label === 'Rent in Austin'));
}

console.log(`\nmap-integrity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
