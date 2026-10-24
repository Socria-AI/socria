#!/usr/bin/env node
// The Logos 5 eval: behaviour, truthfulness, product — through the real routes.
//
//   node evals/logos5/run.mjs                     routing offline; the rest needs a key
//   OPENAI_API_KEY=… node evals/logos5/run.mjs   [--surface logos|core4|both]
//                                                 [--persona classic] [--runtime off]
//                                                 [--only <id>] [--repeat <n>]
//                                                 [--root <a checkout>] [--out <dir>]
//
// OFFLINE, ALWAYS: the runtime's routing (lib/runtime/orchestrate.ts
// routeTurn — Alex Tran's rules A–D) against the labelled turns in
// routing.json, and its reading of the exchange (lib/cognition/register.ts —
// small talk, joking, something personal, a brainstorm, a discussion,
// pushback, a task) against exchanges.json. No model.
//
// LIVE, WITH A KEY: each scenario in scenarios.json is sent through the REAL
// Logos route (and Core 4's with --surface core4|both), only the database and
// the auth swapped as in evals/accuracy, and graded by grade.mjs — no judge
// model. The route's own trace (X-Socria-Runtime) says which view it chose.
//
// ABLATIONS: --persona classic runs the Logos 3.5 prompt over the same
// runtime (LOGOS_PERSONA=classic); --runtime off runs Logos as it was before
// the runtime (LOGOS_RUNTIME=off). BEFORE AND AFTER: --root a worktree of an
// earlier commit, graded by THIS checkout's grader. A live model is sampled:
// use --repeat before reading a difference of a scenario or two.
//
// Without OPENAI_API_KEY the live part says so and nothing is fabricated.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { grade, gradeExchanges, gradeRouting, summarize } from './grade.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..');
const HELPERS = join(REPO, 'test', 'helpers');
const FAKE_DB = join(HELPERS, 'fake-supabase.mjs');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : acc), [])
);
const ROOT = res(typeof args.root === 'string' ? args.root : REPO);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = res(typeof args.out === 'string' ? args.out : join(here, 'runs', `eval-${stamp}`));
mkdirSync(join(OUT, '.build'), { recursive: true });
const common = { bundle: true, format: 'esm', platform: 'node', logLevel: 'error' };

// ── offline: routing ─────────────────────────────────────────────────
await build({
  ...common,
  stdin: { contents: `export { routeTurn, readTurnState } from './lib/runtime';\nexport { readSignals } from './lib/core4/signals';`, resolveDir: ROOT, sourcefile: 'route.ts', loader: 'ts' },
  outfile: join(OUT, '.build', 'route.mjs'),
  tsconfig: join(ROOT, 'tsconfig.json'),
});
const { routeTurn, readTurnState, readSignals } = await import(pathToFileURL(join(OUT, '.build', 'route.mjs')).href);
const { items } = JSON.parse(readFileSync(join(here, 'routing.json'), 'utf8'));
const routing = gradeRouting(items, routeTurn);
console.log(`routing (offline): ${routing.right}/${routing.total} as labelled${routing.wrong.length ? `; misread: ${routing.wrong.map((w) => `"${w.text}" ${w.expected}→${w.got}`).join('; ')}` : ''}`);
writeFileSync(join(OUT, 'routing.json'), JSON.stringify(routing, null, 2));
const exchangeItems = JSON.parse(readFileSync(join(here, 'exchanges.json'), 'utf8')).items;
const exchanges = gradeExchanges(exchangeItems, (text, history) => readTurnState({ text, history, signals: readSignals(text), intent: routeTurn({ text }).intent }).exchange.kind);
console.log(`exchanges (offline): ${exchanges.right}/${exchanges.total} as labelled${exchanges.wrong.length ? `; misread: ${exchanges.wrong.map((w) => `"${w.text}" ${w.expected}→${w.got}`).join('; ')}` : ''}`);
writeFileSync(join(OUT, 'exchanges.json'), JSON.stringify(exchanges, null, 2));

if (!process.env.OPENAI_API_KEY) {
  console.log('live eval: skipped — set OPENAI_API_KEY to run the scenarios against the live model. No live results were produced.');
  process.exit(0);
}

// ── live: the scenarios ──────────────────────────────────────────────
const surfaces = args.surface === 'core4' ? ['core4'] : args.surface === 'both' ? ['logos', 'core4'] : ['logos'];
if (args.persona === 'classic') process.env.LOGOS_PERSONA = 'classic';
if (args.runtime === 'off') process.env.LOGOS_RUNTIME = 'off';
const swap = {
  name: 'eval-swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(ROOT, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(ROOT, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(HELPERS, 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(HELPERS, 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
await build({
  ...common,
  entryPoints: { core4: join(ROOT, 'app/api/chat/route.ts'), logos: join(ROOT, 'app/api/logos/chat/route.ts') },
  outdir: join(OUT, '.build'),
  outExtension: { '.js': '.mjs' },
  tsconfig: join(ROOT, 'tsconfig.json'),
  plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', 'unpdf', 'openai'],
});
await build({
  ...common,
  entryPoints: { guard: join(REPO, 'lib/core4/guard2.ts'), activity: join(REPO, 'lib/core4/activity.ts') },
  outdir: join(OUT, '.build', 'grader'),
  outExtension: { '.js': '.mjs' },
  tsconfig: join(REPO, 'tsconfig.json'),
  alias: { 'server-only': join(HELPERS, 'server-only-shim.mjs') },
});
const quietly = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (/^\[(socria|logos|core4|tokens|epistemic|search|mind)/.test(first) || first.startsWith('conversations') || first.startsWith('stream error')) return;
  orig(...a);
};
console.info = quietly(console.info.bind(console));
console.warn = quietly(console.warn.bind(console));
console.error = quietly(console.error.bind(console));
process.env.RATE_LIMIT_DISABLED = '1';

const routes = {
  core4: await import(pathToFileURL(join(OUT, '.build', 'core4.mjs')).href),
  logos: await import(pathToFileURL(join(OUT, '.build', 'logos.mjs')).href),
};
const { fabricatedToolClaim } = await import(pathToFileURL(join(OUT, '.build', 'grader', 'guard.mjs')).href);
const { readActivity } = await import(pathToFileURL(join(OUT, '.build', 'grader', 'activity.mjs')).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');

const { scenarios } = JSON.parse(readFileSync(join(here, 'scenarios.json'), 'utf8'));
const chosen = typeof args.only === 'string' ? scenarios.filter((s) => s.id === args.only) : scenarios;
const repeat = Math.max(1, Math.min(10, Number(args.repeat) || 1));

async function ask(surface, scenario) {
  db.reset();
  globalThis.__uid = undefined; // signed out: no memory either way, so the scenarios test the reply alone
  const url = surface === 'core4' ? 'http://localhost/api/chat' : 'http://localhost/api/logos/chat';
  // Logos as the new Socria's screen sends it (LogosApp guidance()): the Logos 5 persona, unless --persona classic
  const body = surface === 'core4' ? { model: 'core-4', messages: scenario.messages, conversationId: `l5-${scenario.id}` } : { messages: scenario.messages, surface: 'logos5' };
  const r = await routes[surface].POST(new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const text = await r.text();
  await new Promise((done) => setTimeout(done, 200));
  const trace = r.headers.get('x-socria-runtime') ?? '';
  const intent = /intent=([a-z_]+)/.exec(trace)?.[1];
  const exchange = /exchange=([a-z_]+)/.exec(trace)?.[1];
  return { status: r.status, reply: surface === 'core4' ? readActivity(text).text : text, intent, exchange, trace };
}

const all = {};
for (const surface of surfaces) {
  const results = [];
  for (let k = 0; k < repeat; k++) {
    for (const s of chosen) {
      let out;
      try {
        out = await ask(surface, s);
      } catch (e) {
        out = { status: 0, reply: '', error: String(e?.message ?? e) };
      }
      const graded = out.status === 200 ? grade(s, out.reply, { intent: out.intent, exchange: out.exchange }, { fabricatedToolClaim }) : { id: s.id, group: s.group, pass: false, checks: { routeOk: false } };
      results.push({ ...graded, run: k + 1, status: out.status, trace: out.trace, reply: out.reply, ...(out.error ? { error: out.error } : {}) });
      process.stdout.write(`${surface.padEnd(6)} ${graded.pass ? 'pass' : 'FAIL'}  ${s.id}${graded.pass ? '' : `  ${JSON.stringify(graded.checks)}`}\n`);
    }
  }
  writeFileSync(join(OUT, `${surface}.jsonl`), results.map((r) => JSON.stringify(r)).join('\n') + '\n');
  all[surface] = summarize(results);
}
const arm = `${args.persona === 'classic' ? 'persona=classic' : 'persona=v5'}${args.runtime === 'off' ? ', runtime=off' : ''}`;
writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ root: ROOT, arm, repeat, at: new Date().toISOString(), routing: { right: routing.right, total: routing.total }, exchanges: { right: exchanges.right, total: exchanges.total }, summary: all }, null, 2));
console.log(`\n${arm}\n${JSON.stringify(all, null, 2)}\n\nwritten to ${OUT}`);
