// node scripts/bench-routing.mjs — WHAT ROUTING COSTS, THROUGH THE REAL ROUTE.
//
// Every turn of the labelled corpus (test/helpers/routing-corpus.mjs) is sent
// through app/api/logos/chat as a guest-equivalent free account and as a Socria
// One member, with the database, Clerk and the model replaced — so what is
// measured is exactly what Logos 5 would send: the model it picks, the prompt it
// builds (system, history, this turn), and the reply ceiling it sets.
//
// Prices are lib/model-router.ts PRICES. Tokens are characters ÷ 4 (no tokenizer
// in the repository; English prose runs close to that). Replies are assumed to
// use 60% of their ceiling — the persona writes short — and the stable prompt to
// be served from the provider's cache from the second turn of a line of thinking
// (the history window and the cache key are built for that), at the share given.
//
// What it cannot measure: latency and the quality of real answers. Those need
// the provider; see scripts/bench-models-live.mjs.
//
// Writes docs/MODEL-ROUTING-BENCH.md.

import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const T = join(root, 'test');
const OUT = join(T, '.tmp', 'bench-routing');
rmSync(OUT, { recursive: true, force: true });
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
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(T, 'helpers', 'fake-openai-logos.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(T, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
await build({
  entryPoints: [join(root, 'app/api/logos/chat/route.ts')], bundle: true, format: 'esm', platform: 'node',
  outfile: join(OUT, 'chat.mjs'), tsconfig: join(root, 'tsconfig.json'), plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error',
});
await build({ entryPoints: [join(root, 'lib/model-router.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'router.mjs'), logLevel: 'error' });

for (const k of ['info', 'warn', 'error', 'log']) {
  const orig = console[k].bind(console);
  console[k] = (...a) => (typeof a[0] === 'string' && /^\[|^logos|^conversations/.test(a[0]) ? undefined : orig(...a));
}
process.env.OPENAI_API_KEY = 'bench';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.SOCRIA_TOKEN_LOG = 'off';
globalThis.__uid = 'user_bench';

const chat = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const R = await import(pathToFileURL(join(OUT, 'router.mjs')).href);
const { NextRequest } = await import('next/server.js');
const { CORPUS } = await import(pathToFileURL(join(T, 'helpers', 'routing-corpus.mjs')).href);

const tok = (chars) => Math.ceil(chars / 4);
const REPLY_USE = 0.6;
const CACHED_SHARE = 0.8; // of turns, the stable prompt is a cache hit

/** One turn through the real route: the model, the prompt in tokens (stable part and the rest), the ceiling. */
async function turn(text, { one = false, history = [] } = {}) {
  process.env.SOCRIA_ONE_USER_IDS = one ? 'user_bench' : '';
  globalThis.__logosCalls = []; globalThis.__logosPrompts = []; globalThis.__logosReply = 'Noted.'; globalThis.__logosScript = []; globalThis.__logosRefuse = [];
  const body = { messages: [...history, { role: 'user', content: text }], sessionId: 'bench-line' };
  const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  await r.text().catch(() => '');
  const call = globalThis.__logosCalls.find((c) => c.stream) ?? {};
  const msgs = call.messages ?? [];
  const stable = typeof msgs[0]?.content === 'string' ? msgs[0].content.length : 0;
  const all = msgs.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0);
  return { model: call.model, header: r.headers.get('x-socria-model') ?? '', stableTok: tok(stable), inTok: tok(all), ceiling: call.max_tokens ?? 0, cacheKey: !!call.prompt_cache_key };
}

const costTurn = (model, t) => {
  const out = Math.round(t.ceiling * REPLY_USE);
  const cold = R.costOf(model, { input: t.inTok, cached: 0, output: out });
  const warm = R.costOf(model, { input: t.inTok, cached: t.stableTok, output: out });
  return cold === null ? null : (1 - CACHED_SHARE) * cold + CACHED_SHARE * warm;
};

const rows = [];
for (const c of CORPUS) {
  const free = await turn(c.text, { history: c.history ?? [] });
  const one = await turn(c.text, { one: true, history: c.history ?? [] });
  rows.push({ c, free, one });
}

const weight = CORPUS.reduce((n, c) => n + c.share, 0);
const per1000 = (pickModel, side) =>
  (rows.reduce((sum, r) => sum + r.c.share * (costTurn(pickModel(r), r[side]) ?? 0), 0) / weight) * 1000;

const levels = { light: 0, standard: 0, deep: 0 };
for (const r of rows) levels[r.one.header.split('/')[1] ?? 'standard'] += r.c.share;
const mix = Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, Math.round((v / weight) * 100)]));

const routedOne = per1000((r) => r.one.model, 'one');
const allSol = per1000(() => 'gpt-6.1-sol', 'one');
const allTerra = per1000(() => 'gpt-6.1-terra', 'one');
const routedFree = per1000((r) => r.free.model, 'free');
const guest = per1000(() => 'gpt-4o-mini', 'free');
const guestOnLuna = per1000(() => 'gpt-6-luna', 'free');

const right = rows.filter((r) => R.levelOf(r.c).level === r.c.expect).length;
const deepRight = rows.filter((r) => r.c.expect === 'deep' && r.one.model === 'gpt-6.1-sol').length;
const deepAll = rows.filter((r) => r.c.expect === 'deep').length;
const deepLeaked = rows.filter((r) => r.c.expect !== 'deep' && r.one.model === 'gpt-6.1-sol').length;
const avg = (f) => Math.round(rows.reduce((n, r) => n + f(r), 0) / rows.length);

const $ = (n) => `$${n.toFixed(2)}`;
const md = `# Model routing: benchmark

Generated by \`node scripts/bench-routing.mjs\` on ${new Date().toISOString().slice(0, 10)}, through the real chat route (database, Clerk and the model replaced). ${CORPUS.length} labelled turns across ${new Set(CORPUS.map((c) => c.subject)).size} subjects, weighted by how often turns like them arrive (\`test/helpers/routing-corpus.mjs\`).

## Routing

| | |
|---|---|
| Turns routed to the level a careful reader gives them | ${right} / ${CORPUS.length} |
| Deep turns that reach GPT-6.1 Sol (Socria One) | ${deepRight} / ${deepAll} |
| Non-deep turns sent to Sol (cost leak) | ${deepLeaked} |
| Socria One mix by weight: light / standard / deep | ${mix.light}% / ${mix.standard}% / ${mix.deep}% |
| Cache key on every reply | ${rows.every((r) => r.one.cacheKey && r.free.cacheKey) ? 'yes' : 'no'} |
| Average prompt (tokens ≈ chars ÷ 4): whole / stable cacheable part | ${avg((r) => r.one.inTok)} / ${avg((r) => r.one.stableTok)} |

## Cost per 1,000 replies (US$)

Prices from \`lib/model-router.ts\` (OpenAI launch pages, November 2026). Replies use ${REPLY_USE * 100}% of their ceiling; the stable prompt is a cache hit on ${CACHED_SHARE * 100}% of turns. The reply only — the map pass and the memory extractor are separate calls.

| Who | Routed | Instead | Saving |
|---|---|---|---|
| Socria One | ${$(routedOne)} | all on GPT-6.1 Sol: ${$(allSol)} | ${Math.round((1 - routedOne / allSol) * 100)}% |
| Socria One | ${$(routedOne)} | all on GPT-6.1 Terra: ${$(allTerra)} | ${routedOne <= allTerra ? `${Math.round((1 - routedOne / allTerra) * 100)}% cheaper` : `${Math.round((routedOne / allTerra - 1) * 100)}% dearer — the price of Sol on deep turns`} |
| Free plan | ${$(routedFree)} (GPT-6 Luna) | all on GPT-6.1 Sol: ${$(allSol)} | ${Math.round((1 - routedFree / allSol) * 100)}% |
| Guest | ${$(guest)} (GPT-4o mini) | on GPT-6 Luna: ${$(guestOnLuna)} | ${guestOnLuna < guest ? `GPT-6 Luna would be ${Math.round((1 - guestOnLuna / guest) * 100)}% cheaper` : `about the same — Luna is cheaper per token, but its cached-input price is unpublished and is counted at the full input price here`} |

## Not measured here

- **Latency and answer quality** need the provider. \`scripts/bench-models-live.mjs\` runs the same corpus against the real models with \`OPENAI_API_KEY\` set and records time to first token, total time, tokens, cost, and the maths checker's verdict on every maths reply.
- **Documents** are not attached in this run, so the two document turns route on their words alone (to Terra); with a document attached the route sends them to Sol (\`docs\` in levelOf, covered in test/model-router.test.mjs).
- **The baseline before routing** was GPT-5.6 Sol for every reply; its price could not be confirmed from the build machine, so the comparison uses GPT-6.1 Sol, the strongest model in the plan.
- **Real usage**: every call logs \`[tokens] {route, model, in, cached, out}\` (lib/openai-usage.ts); \`node scripts/token-report.mjs\` totals them, so the live split by tier can be read from production logs.

## Per turn

| Subject | Turn | Expected | Free | Socria One |
|---|---|---|---|---|
${rows.map((r) => `| ${r.c.subject} | ${r.c.text.slice(0, 60).replace(/\|/g, '/')}${r.c.text.length > 60 ? '…' : ''} | ${r.c.expect} | ${r.free.model} | ${r.one.model} |`).join('\n')}
`;
writeFileSync(join(root, 'docs', 'MODEL-ROUTING-BENCH.md'), md);
console.log(md.split('## Per turn')[0]);
