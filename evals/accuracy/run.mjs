#!/usr/bin/env node
// The accuracy eval, against the live model, through the real routes.
//
//   OPENAI_API_KEY=… node evals/accuracy/run.mjs [--surface core4|logos|both]
//                                                [--only <scenario id>]
//                                                [--root <a checkout to evaluate>]
//                                                [--out <dir>]
//
// Each scenario in scenarios.json is sent through the REAL Core 4 route
// (app/api/chat) and the REAL Logos 3.5 route (app/api/logos/chat) — only the
// database and the auth are swapped, as in evals/core4 — and every reply is
// graded deterministically by grade.mjs, with the grader built from THIS
// checkout. The headline numbers are counts over the scenarios they apply to.
//
// BEFORE AND AFTER. To measure a change rather than describe it, run the same
// scenarios against the checkout before it:
//
//   git worktree add /tmp/before <commit>
//   (cd /tmp/before && npm ci)
//   OPENAI_API_KEY=… node evals/accuracy/run.mjs --root /tmp/before --out evals/accuracy/runs/before
//   OPENAI_API_KEY=… node evals/accuracy/run.mjs --out evals/accuracy/runs/after
//
// A live model is sampled: run each side more than once before reading a
// difference of one or two scenarios as an improvement.
//
// Without OPENAI_API_KEY it says so and exits 0: nothing here fabricates a run.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { grade, summarize } from './grade.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..');
const HELPERS = join(REPO, 'test', 'helpers');
const FAKE_DB = join(HELPERS, 'fake-supabase.mjs');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : acc), [])
);

if (!process.env.OPENAI_API_KEY) {
  console.log('accuracy eval: skipped — set OPENAI_API_KEY to run it against the live model. No results were produced.');
  process.exit(0);
}

const ROOT = res(typeof args.root === 'string' ? args.root : REPO);
const surfaces = args.surface === 'core4' ? ['core4'] : args.surface === 'logos' ? ['logos'] : ['core4', 'logos'];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = res(typeof args.out === 'string' ? args.out : join(here, 'runs', stamp));
mkdirSync(join(OUT, '.build'), { recursive: true });

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
const common = { bundle: true, format: 'esm', platform: 'node', logLevel: 'error' };
// The routes under evaluation, from ROOT; the real `openai` client.
await build({
  ...common,
  entryPoints: { core4: join(ROOT, 'app/api/chat/route.ts'), logos: join(ROOT, 'app/api/logos/chat/route.ts') },
  outdir: join(OUT, '.build'), outExtension: { '.js': '.mjs' }, tsconfig: join(ROOT, 'tsconfig.json'), plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', 'unpdf', 'openai'],
});
// The grader, always from THIS checkout, so before and after are graded alike.
await build({
  ...common,
  entryPoints: {
    accuracy: join(REPO, 'lib/accuracy/accuracy.ts'),
    guard: join(REPO, 'lib/core4/guard2.ts'),
    questions: join(REPO, 'lib/core4/questions.ts'),
    activity: join(REPO, 'lib/core4/activity.ts'),
  },
  outdir: join(OUT, '.build', 'grader'), outExtension: { '.js': '.mjs' }, tsconfig: join(REPO, 'tsconfig.json'),
  alias: { 'server-only': join(HELPERS, 'server-only-shim.mjs') },
});

const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (/^\[(socria|logos|core4)/.test(first) || first.startsWith('conversations') || first.startsWith('stream error')) return;
  orig(...a);
};
console.error = quiet(console.error.bind(console));
console.warn = quiet(console.warn.bind(console));
process.env.RATE_LIMIT_DISABLED = '1';

const routes = {
  core4: await import(pathToFileURL(join(OUT, '.build', 'core4.mjs')).href),
  logos: await import(pathToFileURL(join(OUT, '.build', 'logos.mjs')).href),
};
const g = join(OUT, '.build', 'grader');
const { planTurn, checkDraft, answers } = await import(pathToFileURL(join(g, 'accuracy.mjs')).href);
const { fabricatedToolClaim } = await import(pathToFileURL(join(g, 'guard.mjs')).href);
const { sentencesOf } = await import(pathToFileURL(join(g, 'questions.mjs')).href);
const { readActivity } = await import(pathToFileURL(join(g, 'activity.mjs')).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');
const lib = { planTurn, checkDraft, answers, fabricatedToolClaim, sentencesOf };

const { scenarios } = JSON.parse(readFileSync(join(here, 'scenarios.json'), 'utf8'));
const chosen = typeof args.only === 'string' ? scenarios.filter((s) => s.id === args.only) : scenarios;

async function ask(surface, scenario) {
  db.reset();
  globalThis.__uid = `acc-eval-${surface}-${scenario.id}`;
  const url = surface === 'core4' ? 'http://localhost/api/chat' : 'http://localhost/api/logos/chat';
  const body = surface === 'core4'
    ? { model: 'core-4', messages: scenario.messages, conversationId: `acc-${scenario.id}` }
    : { messages: scenario.messages };
  const r = await routes[surface].POST(new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const text = await r.text();
  // let the turn's write-back finish before the next scenario resets the database
  await new Promise((done) => setTimeout(done, 300));
  return { status: r.status, reply: surface === 'core4' ? readActivity(text).text : text };
}

const all = {};
for (const surface of surfaces) {
  const results = [];
  for (const s of chosen) {
    let out;
    try {
      out = await ask(surface, s);
    } catch (e) {
      out = { status: 0, reply: '', error: String(e?.message ?? e) };
    }
    const graded = out.status === 200 ? grade(s, out.reply, lib) : { id: s.id, group: s.group, pass: false, checks: { routeOk: false }, refuted: [], hedges: [], fabricated: [], citations: [], confidentlyWrong: false };
    results.push({ ...graded, status: out.status, reply: out.reply, ...(out.error ? { error: out.error } : {}) });
    process.stdout.write(`${surface.padEnd(6)} ${graded.pass ? 'pass' : 'FAIL'}  ${s.id}${graded.pass ? '' : `  ${JSON.stringify(graded.checks)}`}\n`);
  }
  writeFileSync(join(OUT, `${surface}.jsonl`), results.map((r) => JSON.stringify(r)).join('\n') + '\n');
  all[surface] = summarize(results);
}
writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ root: ROOT, at: new Date().toISOString(), model: process.env.OPENAI_MODEL ?? '(route default)', summary: all }, null, 2));
console.log(`\n${JSON.stringify(all, null, 2)}\n\nwritten to ${OUT}`);
