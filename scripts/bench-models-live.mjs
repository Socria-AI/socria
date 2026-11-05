// OPENAI_API_KEY=… node scripts/bench-models-live.mjs [--tiers free,one] [--limit 12]
//
// LATENCY, TOKENS, COST AND ANSWERS, FROM THE REAL MODELS. The labelled corpus
// (test/helpers/routing-corpus.mjs) through the real chat route with the real
// OpenAI client — only Clerk and the database replaced — once per tier, so each
// turn goes to the model the router picks for it. Records, per turn: the model
// that answered (X-Socria-Model), time to first byte and total time, tokens in /
// cached / out from the route's own usage log, the cost at lib/model-router.ts
// prices, and the reply itself.
//
// Quality is not scored by another model: the replies are written to
// docs/MODEL-ROUTING-LIVE.jsonl to be read side by side, tier against tier, and
// the maths turns are run through the route's own checker (lib/accuracy), which
// already holds a wrong computed answer back.
//
// Costs real money: the full corpus over three tiers is about a hundred calls.

import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set: this benchmark asks the real models.');
  process.exit(1);
}
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((a) => a.trim().split(/\s+/)));
const TIERS = String(args.tiers ?? 'free,one').split(',');
const LIMIT = Number(args.limit ?? 1e9);

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const T = join(root, 'test');
const OUT = join(T, '.tmp', 'bench-live');
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
  entryPoints: [join(root, 'app/api/logos/chat/route.ts')], bundle: true, format: 'esm', platform: 'node',
  outfile: join(OUT, 'chat.mjs'), tsconfig: join(root, 'tsconfig.json'), plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', 'openai'], logLevel: 'error',
});
await build({ entryPoints: [join(root, 'lib/model-router.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'router.mjs'), logLevel: 'error' });

// the route's own usage lines: [tokens] {"route","model","in","cached","out"}
let usage = [];
const info = console.info.bind(console);
console.info = (...a) => {
  const m = typeof a[0] === 'string' && a[0].match(/^\[tokens\] (.*)$/);
  if (m) usage.push(JSON.parse(m[1]));
  else if (!(typeof a[0] === 'string' && /^\[|^logos/.test(a[0]))) info(...a);
};
process.env.RATE_LIMIT_DISABLED = '1';
globalThis.__uid = 'user_bench_live';

const chat = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const R = await import(pathToFileURL(join(OUT, 'router.mjs')).href);
const { NextRequest } = await import('next/server.js');
const { CORPUS } = await import(pathToFileURL(join(T, 'helpers', 'routing-corpus.mjs')).href);

const lines = [];
const summary = {};
for (const tier of TIERS) {
  process.env.SOCRIA_ONE_USER_IDS = tier === 'one' ? 'user_bench_live' : '';
  globalThis.__uid = tier === 'guest' ? null : 'user_bench_live';
  for (const c of CORPUS.slice(0, LIMIT)) {
    usage = [];
    const t0 = performance.now();
    const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [...(c.history ?? []), { role: 'user', content: c.text }], sessionId: `bench-${tier}` }) }));
    let first = null;
    let reply = '';
    const reader = r.body?.getReader();
    const dec = new TextDecoder();
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      if (first === null) first = performance.now() - t0;
      reply += dec.decode(value, { stream: true });
    }
    const total = performance.now() - t0;
    const [, level, model] = (r.headers.get('x-socria-model') ?? '//').split('/');
    const u = usage.filter((x) => x.route === 'logos/chat').reduce((a, x) => ({ input: a.input + x.in, cached: a.cached + x.cached, output: a.output + x.out }), { input: 0, cached: 0, output: 0 });
    const cost = R.costOf(model, u);
    const row = { tier, subject: c.subject, text: c.text, expect: c.expect, level, model, status: r.status, ttfbMs: Math.round(first ?? total), totalMs: Math.round(total), ...u, cost, reply };
    lines.push(row);
    const s = (summary[`${tier}/${model}`] ??= { n: 0, ttfb: 0, total: 0, cost: 0, out: 0 });
    s.n++; s.ttfb += row.ttfbMs; s.total += row.totalMs; s.cost += cost ?? 0; s.out += u.output;
    info(`${tier.padEnd(5)} ${String(model).padEnd(14)} ${String(row.ttfbMs).padStart(5)}ms ${String(row.totalMs).padStart(6)}ms ${String(u.input).padStart(6)}/${String(u.cached).padStart(6)}/${String(u.output).padStart(5)}  ${c.text.slice(0, 50)}`);
  }
}
writeFileSync(join(root, 'docs', 'MODEL-ROUTING-LIVE.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
info('\nmodel                        turns  first byte  total   out tokens  cost / 1,000');
for (const [k, s] of Object.entries(summary)) info(`${k.padEnd(28)} ${String(s.n).padStart(5)}  ${String(Math.round(s.ttfb / s.n)).padStart(8)}ms ${String(Math.round(s.total / s.n)).padStart(6)}ms ${String(Math.round(s.out / s.n)).padStart(8)}   $${((s.cost / s.n) * 1000).toFixed(2)}`);
