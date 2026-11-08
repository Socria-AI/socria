// evals/explain/capture.mjs — the exact requests the REAL chat route sends for the scenario battery, offline.
//
//   node evals/explain/capture.mjs [--arm engine|off] [--out DIR] [--battery FILE]
//
// Builds app/api/logos/chat/route.ts with the test fakes (Supabase, Clerk) and the recording model stand-in
// (evals/logos5/fake-model.mjs), then sends each scenario in evals/explain/battery.json as a signed-in free
// user would: surface logos5, length standard, guard off, the clock pinned (so the NOW line is identical
// across arms and runs, and hash caches hold). Writes one JSON per scenario — the reply call's model and
// messages, and the content-free headers — under DIR (default: a folder in the OS temp directory, never the
// repo). Two arms:
//   engine   the route as it is (the explanation engine on)
//   off      LOGOS_EXPLAIN=off — byte-identical but for the engine's lines and elements
// No model is called and nothing leaves the machine. The replies themselves are generated elsewhere (the
// stand-in generation in docs/LOGOS-5-SYSTEM.md §8.11), from exactly these messages.

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const ARM = arg('--arm', 'engine');
const OUT = arg('--out', join(tmpdir(), 'socria-explain-capture', ARM));
const PINNED = Date.UTC(2026, 10, 8, 15, 0, 0);

const require = createRequire(join(REPO, 'package.json'));
const { build } = require('esbuild');
const HELPERS = join(REPO, 'test', 'helpers');
const FAKE_DB = join(HELPERS, 'fake-supabase.mjs');
const BUILD = join(tmpdir(), 'socria-explain-capture', '.build');
mkdirSync(BUILD, { recursive: true });
mkdirSync(OUT, { recursive: true });
const ext = (p) => {
  try {
    return { path: pathToFileURL(require.resolve(p)).href, external: true };
  } catch {
    return undefined;
  }
};
const swap = {
  name: 'explain-capture-swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(REPO, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(REPO, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(HELPERS, 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(REPO, 'evals/logos5/fake-model.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(HELPERS, 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ext(`${a.path}.js`));
    b.onResolve({ filter: /^(next|undici|stripe|resend|unpdf)(\/.*)?$|^@supabase\// }, (a) => ext(a.path));
  },
};
await build({ bundle: true, format: 'esm', platform: 'node', logLevel: 'error', entryPoints: { logos: join(REPO, 'app/api/logos/chat/route.ts') }, outdir: BUILD, outExtension: { '.js': '.mjs' }, tsconfig: join(REPO, 'tsconfig.json'), plugins: [swap] });

// quiet, and the clock pinned: the NOW line, the ledger's "due", the MR exposure rows — all identical across arms
const quiet = (o) => (...a) => (/^\[|^conversations|^stream error|^logos|^email/.test(typeof a[0] === 'string' ? a[0] : '') ? undefined : o(...a));
console.info = quiet(console.info.bind(console));
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));
Date.now = () => PINNED;
process.env.OPENAI_API_KEY = 'capture-only';
process.env.RATE_LIMIT_DISABLED = '1';
if (ARM === 'off') process.env.LOGOS_EXPLAIN = 'off';
else delete process.env.LOGOS_EXPLAIN;

const route = await import(pathToFileURL(join(BUILD, 'logos.mjs')).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import(pathToFileURL(require.resolve('next/server.js')).href);
const battery = JSON.parse(readFileSync(res(arg('--battery', join(REPO, 'evals/explain/battery.json'))), 'utf8'));

const summary = [];
for (const s of battery) {
  db.reset();
  globalThis.__uid = `explain-${s.id}`;
  globalThis.__evalCalls = [];
  const body = { sessionId: `sess-${s.id}`, messages: [...s.history, { role: 'user', content: s.message }], surface: 'logos5', length: 'standard', depth: 'balanced', guard: s.guard ? 'guard' : false, conversationStyle: 'thinker', tz: 'Europe/London' };
  const r = await route.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  await r.text();
  await new Promise((d) => setTimeout(d, 50));
  const reply = (globalThis.__evalCalls ?? []).find((c) => c.purpose === 'reply');
  const headers = Object.fromEntries([...r.headers.entries()].filter(([k]) => k.startsWith('x-socria')));
  writeFileSync(join(OUT, `${s.id}.json`), JSON.stringify({ arm: ARM, id: s.id, status: r.status, model: reply?.model ?? null, messages: reply?.messages ?? [], headers }, null, 2));
  const perTurn = (reply?.messages ?? []).filter((m) => m.role === 'system' && /^=== THIS TURN ===/.test(m.content)).map((m) => m.content).join('');
  summary.push({ id: s.id, status: r.status, explain: headers['x-socria-explain'] ?? 'off', perTurnChars: perTurn.length });
}
writeFileSync(join(OUT, '_summary.json'), JSON.stringify(summary, null, 2));
const ok = summary.filter((x) => x.status === 200).length;
console.log(`captured ${ok}/${summary.length} (${ARM}) → ${OUT}; mean per-turn block ${Math.round(summary.reduce((a, b) => a + b.perTurnChars, 0) / summary.length / 4)} tokens (chars/4)`);
process.exit(ok === summary.length ? 0 : 1);
