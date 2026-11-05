// OPENAI_API_KEY=… node scripts/smoke-artifacts-live.mjs [--tiers free,one] [--asks 7]
//
// THE ARTIFACTS, AGAINST THE REAL MODELS. The simple requests of
// test/artifact-reliability-e2e.test.mjs — a chart, a comparison table, a
// flowchart, a Venn diagram, a checklist, a study plan, a custom tracker —
// through the real map route (app/api/logos/map) with the real OpenAI SDK, as
// each tier: whether it was made, the kind it was made as, which model
// answered every call, and how long it took. The suite holds the routes to the
// API's contract with a stand-in; this is the check that the contract is the
// one the real API keeps (docs/ARTIFACT-RELIABILITY.md).
//
// Signed in as a test account through the test fakes for Clerk and Supabase;
// only OpenAI is real. Spends a few cents.

import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set: this smoke test asks the real models.');
  process.exit(1);
}
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((a) => a.trim().split(/\s+/)));
const TIERS = String(args.tiers ?? 'free,one').split(',');
const ASK_LIMIT = Number(args.asks ?? 7);

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const T = join(root, 'test');
const OUT = join(T, '.tmp', 'smoke-artifacts-live');
mkdirSync(OUT, { recursive: true });
const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(join(T, 'helpers', 'fake-supabase.mjs')).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(T, 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(T, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
await build({
  entryPoints: [join(root, 'app/api/logos/map/route.ts')], bundle: true, format: 'esm', platform: 'node',
  outfile: join(OUT, 'map.mjs'), tsconfig: join(root, 'tsconfig.json'), plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', 'openai'], logLevel: 'error',
});

// what the route says about each call: the usage lines name the model that answered, the warnings any step down
let said = [];
const info = console.info.bind(console);
for (const k of ['info', 'warn', 'error']) console[k] = (...a) => said.push(a.map((x) => (x instanceof Error ? x.message : String(x))).join(' '));
process.env.RATE_LIMIT_DISABLED = '1';

const map = await import(pathToFileURL(join(OUT, 'map.mjs')).href);
const { NextRequest } = await import('next/server.js');

const ASKS = [
  ['chart', 'Make a bar chart of my spending: rent 1200, food 400, transport 150', 'data'],
  ['comparison table', 'Make a comparison table of the iPhone 16 and the Pixel 9', 'compare'],
  ['flowchart', 'Make a flowchart of how to make a cup of tea', 'diagram'],
  ['venn diagram', 'Make a venn diagram of mitosis and meiosis', 'venn'],
  ['checklist', 'Make me a checklist for moving house', 'plan'],
  ['study plan', 'Make me a study plan for my history essay due next Friday', 'plan'],
  ['habit tracker', 'Make me a habit tracker for exercise, reading and sleep', 'custom'],
].slice(0, ASK_LIMIT);

let made = 0, total = 0;
for (const tier of TIERS) {
  process.env.SOCRIA_ONE_USER_IDS = tier === 'one' ? 'user_smoke_live' : '';
  globalThis.__uid = tier === 'guest' ? null : 'user_smoke_live';
  for (const [what, text, kind] of ASKS) {
    said = [];
    const t0 = performance.now();
    const r = await map.POST(new NextRequest('http://localhost/api/logos/map', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: `smoke-${tier}-${what.replace(/\W+/g, '')}`, messages: [{ role: 'user', content: text }], map: { nodes: [], edges: [] }, today: new Date().toISOString().slice(0, 10) }) }));
    const ms = Math.round(performance.now() - t0);
    const json = await r.json().catch(() => null);
    const obj = (json?.map?.objects?.objs ?? []).find((o) => o.id === json?.display?.id);
    const models = said.map((l) => /^\[tokens\] (.*)$/.exec(l)?.[1]).filter(Boolean).map((l) => JSON.parse(l).model);
    const refused = said.filter((l) => /refused|asked again without/.test(l));
    const ok = r.status === 200 && json?.display?.ok === true && obj?.kind === kind;
    total++;
    if (ok) made++;
    info(`${tier.padEnd(5)} ${what.padEnd(17)} ${ok ? 'MADE ' : 'NOT  '} ${String(ms).padStart(6)}ms  models=${[...new Set(models)].join(',') || '-'}${refused.length ? `  adapted/stepped: ${refused.length}` : ''}${ok ? '' : `  — ${json?.display?.says ?? `status ${r.status}`}`}`);
    for (const l of refused) info(`        ${l.slice(0, 200)}`);
  }
}
info(`\n${made} of ${total} made`);
process.exit(made === total ? 0 : 1);
