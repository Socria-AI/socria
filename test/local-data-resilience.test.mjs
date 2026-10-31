// One bad record in this browser's copy must not take Logos 5 down for good.
//
// A guest's lines of thinking (and a code-holder's) live in localStorage and
// are read back on every load. One malformed turn or card in there — a null
// turn, words stored as an array, a card with no label or a numeric one —
// threw while the page rendered, and threw again on every reload after:
// "Application error", no buttons, no way back but clearing site data.
// (Found by the a11y audit: ERR-1.)
//
// What is read back is now checked the way the account's copy is: turns must
// be turns, and the map goes through the same sanitizer as a stored map. What
// is good is kept; what is not is left out, and nothing throws.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'local-data-resilience');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({ entryPoints: [join(root, 'lib/logos-sessions.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'sessions.mjs'), tsconfig: join(root, 'tsconfig.json'), packages: 'external', logLevel: 'error' });
const { loadLocal, cleanLocalMessages, LOCAL_KEY } = await import(pathToFileURL(join(OUT, 'sessions.mjs')).href);

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const key = LOCAL_KEY ?? 'socria.logos.sessions.v1';
ok('the sessions key is the one the app reads', typeof key === 'string' && key.length > 0);

const good = { role: 'user', content: 'Should I take the job in Austin?' };
const reply = { role: 'assistant', content: 'What would you be leaving?' };
const bad = [
  ['a null turn', null],
  ['words stored as an array', { role: 'user', content: ['not', 'a', 'string'] }],
  ['a turn with no role', { content: 'who said this?' }],
  ['attachments that are not a list', { role: 'user', content: 'see attached', attachments: { name: 'x' } }],
];
const badNodes = [
  ['a card with no label', { id: 'n1', type: 'idea', status: 'open' }],
  ['a card with a numeric label', { id: 'n2', type: 'idea', label: 42, status: 'open' }],
];

console.log('\nwhat is read back is turns and cards, or it is left out');
for (const [name, m] of bad) {
  store.set(key, JSON.stringify([{ id: 's1', title: 'Austin', messages: [good, m, reply], map: { nodes: [{ id: 'a', type: 'idea', label: 'The job', status: 'open' }], edges: [] }, updatedAt: 1 }]));
  let list = null;
  let threw = '';
  try {
    list = loadLocal();
  } catch (e) {
    threw = String(e);
  }
  ok(`${name}: read without throwing`, !threw, threw);
  const msgs = list?.[0]?.messages ?? [];
  ok(`  every turn kept has a role and words`, msgs.every((x) => x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string'), JSON.stringify(msgs));
  ok(`  and the good turns are still there`, msgs.some((x) => x.content === good.content) && msgs.some((x) => x.content === reply.content));
  if (name === 'attachments that are not a list') ok('  the turn is kept, without the broken attachments', msgs.some((x) => x.content === 'see attached' && x.attachments === undefined));
}
for (const [name, n] of badNodes) {
  store.set(key, JSON.stringify([{ id: 's1', title: 'Austin', messages: [good], map: { nodes: [{ id: 'a', type: 'idea', label: 'The job', status: 'open' }, n], edges: [{ from: 'a', to: n.id, kind: 'relates' }] }, updatedAt: 1 }]));
  let list = null;
  let threw = '';
  try {
    list = loadLocal();
  } catch (e) {
    threw = String(e);
  }
  ok(`${name}: read without throwing`, !threw, threw);
  const nodes = list?.[0]?.map?.nodes ?? [];
  ok(`  every card kept has words for a label`, nodes.length > 0 && nodes.every((x) => typeof x.label === 'string' && x.label.length > 0), JSON.stringify(nodes));
  ok(`  and the good card is still there`, nodes.some((x) => x.label === 'The job'));
  ok(`  with no link left pointing at nothing`, (list?.[0]?.map?.edges ?? []).every((e) => nodes.some((x) => x.id === e.from) && nodes.some((x) => x.id === e.to)));
}

console.log('\nthe cleaner itself');
ok('not a list: nothing', cleanLocalMessages({}).length === 0 && cleanLocalMessages(null).length === 0);
ok('a clean list comes back as it was', JSON.stringify(cleanLocalMessages([good, reply])) === JSON.stringify([good, reply]));

console.log(`\nlocal-data-resilience: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
