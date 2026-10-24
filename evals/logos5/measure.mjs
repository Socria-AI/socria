#!/usr/bin/env node
// evals/logos5/measure.mjs — WHAT A TURN COSTS, BEFORE AND AFTER, MEASURED.
//
//   node evals/logos5/measure.mjs [--root <checkout>] [--out <dir>]
//
// No key and no network. The REAL routes — Logos (app/api/logos/chat), its map
// pass (app/api/logos/map), the title (app/api/extract-memory), the older
// understanding profile (app/api/update-understanding) and Core 4
// (app/api/chat) — are built from ROOT and driven through one scripted
// ten-turn conversation, with the database and the auth swapped as in
// evals/accuracy, and the model replaced by a recorder
// (evals/logos5/fake-model.mjs) that keeps every request a route sends.
//
// Three ways of running the same conversation:
//
//   before   Logos as it was: LOGOS_RUNTIME=off, LOGOS_PERSONA=classic, a map
//            pass after every turn but an "ok" (lib/map-skip.ts), the memory
//            extraction after every reply, the understanding profile every
//            four turns.
//   after    Logos 5: the runtime and its persona, a map pass only when worth
//            it (lib/runtime/orchestrate.ts needsMap — structure or something
//            to see asked for, or the cadence), memory only for a turn with
//            something in it, no second profile, one title.
//   core4    Core 4 as its page drove it: the route per turn, a title on the
//            first two turns, the understanding profile every four turns.
//
// And two ablations of `after`, with --arms (default: all five):
//
//   classic  after, with the Logos 3.5 prompt (LOGOS_PERSONA=classic): how
//            much of the change is the prompt.
//   open     after, with the Logic Map open the whole time (the map is live
//            while it is looked at): the most the map pass can cost now.
//
// What is counted is what the product SENDS: calls, by purpose, and their
// input, in characters and in tokens estimated at four characters to the
// token; and how much of each call repeats the previous call of its kind
// byte for byte from the start — the prefix a provider's prompt cache can
// serve (estimated at OpenAI's rule: ≥ 1024 tokens, in 128-token steps).
// What a real model would answer — output tokens, latency — is not measured,
// and the route time reported is the route's own work with a model that
// answers instantly.

import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..');
const HELPERS = join(REPO, 'test', 'helpers');
const FAKE_DB = join(HELPERS, 'fake-supabase.mjs');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : acc), [])
);
const ROOT = res(typeof args.root === 'string' ? args.root : REPO);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = res(typeof args.out === 'string' ? args.out : join(here, 'runs', `measure-${stamp}`));
mkdirSync(join(OUT, '.build'), { recursive: true });

const swap = {
  name: 'measure-swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(ROOT, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(ROOT, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(HELPERS, 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'fake-model.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(HELPERS, 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
const common = { bundle: true, format: 'esm', platform: 'node', logLevel: 'error' };
await build({
  ...common,
  entryPoints: {
    logos: join(ROOT, 'app/api/logos/chat/route.ts'),
    map: join(ROOT, 'app/api/logos/map/route.ts'),
    title: join(ROOT, 'app/api/extract-memory/route.ts'),
    understanding: join(ROOT, 'app/api/update-understanding/route.ts'),
    core4: join(ROOT, 'app/api/chat/route.ts'),
  },
  outdir: join(OUT, '.build'),
  outExtension: { '.js': '.mjs' },
  tsconfig: join(ROOT, 'tsconfig.json'),
  plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', 'unpdf'],
});
// the client's policies — which turns get a map pass — from THIS checkout, so both arms are driven alike
await build({
  ...common,
  stdin: {
    contents: `export { skipsMap, lastReplyIn } from './lib/map-skip';\nexport { needsMap, routeTurn, turnsSince } from './lib/runtime/orchestrate';\nexport { purposeOf } from './evals/logos5/fake-model.mjs';`,
    resolveDir: REPO,
    sourcefile: 'policy.ts',
    loader: 'ts',
  },
  outfile: join(OUT, '.build', 'policy.mjs'),
  tsconfig: join(REPO, 'tsconfig.json'),
});

const quietly = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (/^\[(socria|logos|core4|tokens|epistemic|search|mind)/.test(first) || first.startsWith('conversations') || first.startsWith('stream error') || first.startsWith('logos')) return;
  orig(...a);
};
console.info = quietly(console.info.bind(console));
console.warn = quietly(console.warn.bind(console));
console.error = quietly(console.error.bind(console));
process.env.OPENAI_API_KEY = 'measure-only';
process.env.RATE_LIMIT_DISABLED = '1';

const R = {};
for (const k of ['logos', 'map', 'title', 'understanding', 'core4']) R[k] = await import(pathToFileURL(join(OUT, '.build', `${k}.mjs`)).href);
const P = await import(pathToFileURL(join(OUT, '.build', 'policy.mjs')).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');

/** The conversation: talk, an "ok", a fact, a structure asked for, something to see, a "thanks". */
const SCRIPT = [
  'I keep going back and forth on whether to take the job in Denver or stay in Austin.',
  'The Denver offer pays 20% more, but my partner works here and we just signed a lease.',
  'ok',
  'What is the typical rent difference between Denver and Austin right now?',
  'Map out my argument for moving so I can see what it rests on.',
  'Make a decision matrix of the two options.',
  'Honestly I think the money matters less than I said at first.',
  'thanks',
  'So what would I actually be giving up by staying?',
  'Let me sleep on it and talk to my partner this weekend.',
];

const post = async (route, url, body) => {
  const t0 = performance.now();
  const r = await route.POST(new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const text = await r.text();
  // the reply's write-back (the memory extraction) runs after the response: let it land
  await new Promise((ok) => setTimeout(ok, 60));
  return { status: r.status, text, ms: performance.now() - t0 };
};

const charsOf = (msgs) => msgs.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content ?? '').length), 0);
const tok = (chars) => Math.ceil(chars / 4);
/** The leading run of messages identical to the previous call of the same kind, in characters. */
function sharedPrefix(a, b) {
  if (!a || !b) return 0;
  let n = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i].role !== b[i].role || a[i].content !== b[i].content) {
      // the identical leading part of the first message that differs counts too
      const x = String(a[i].content ?? ''), y = String(b[i].content ?? '');
      let j = 0;
      while (j < x.length && j < y.length && x[j] === y[j]) j++;
      return n + j;
    }
    n += typeof a[i].content === 'string' ? a[i].content.length : 0;
  }
  return n;
}
/** What a prompt cache could serve: ≥ 1024 tokens, in 128-token steps. */
const cacheable = (prefixChars) => {
  const t = tok(prefixChars);
  return t >= 1024 ? Math.floor(t / 128) * 128 : 0;
};

async function run(arm) {
  db.reset();
  globalThis.__uid = `measure-${arm}`;
  globalThis.__evalCalls = [];
  const env = arm === 'before' ? { LOGOS_RUNTIME: 'off', LOGOS_PERSONA: 'classic' } : arm === 'classic' ? { LOGOS_PERSONA: 'classic' } : {};
  // the Logos 5 arms share its policies; `open` looks at the Logic Map throughout
  const five = arm === 'after' || arm === 'classic' || arm === 'open';
  const saved = Object.fromEntries(['LOGOS_RUNTIME', 'LOGOS_PERSONA'].map((k) => [k, process.env[k]]));
  for (const k of Object.keys(saved)) delete process.env[k];
  Object.assign(process.env, env);
  const history = [];
  let map = { nodes: [], edges: [] };
  let drawnAt = 0;
  const lastOf = new Map();
  const perTurn = [];
  try {
    for (let i = 0; i < SCRIPT.length; i++) {
      const text = SCRIPT[i];
      const before = history.slice();
      history.push({ role: 'user', content: text, at: Date.now() });
      const route = P.routeTurn({ text, mapNodes: map.nodes.length });
      const turn = { turn: i + 1, text, intent: route.intent, calls: {}, inChars: {}, cachedTok: 0, ms: 0, map: false };
      const t = arm === 'core4'
        ? await post(R.core4, '/api/chat', { model: 'core-4', messages: history.map(({ role, content }) => ({ role, content })), conversationId: 'c_measure' })
        : await post(R.logos, '/api/logos/chat', { sessionId: 'lg_measure', messages: history.map(({ role, content }) => ({ role, content })), mind: true });
      turn.ms = Math.round(t.ms);
      turn.status = t.status;
      history.push({ role: 'assistant', content: t.text.replace(/\u0000|\[\[[A-Z_]+[^\]]*\]\]/g, '').slice(0, 4000), at: Date.now() });
      if (arm !== 'core4') {
        const filler = P.skipsMap({ text, lastReply: P.lastReplyIn(before), mapNodes: map.nodes.length });
        const wantMap =
          arm === 'before'
            ? !filler
            : P.needsMap({ route, view: arm === 'open' ? 'logic_map' : 'chat', filler, turnsSinceMap: P.turnsSince(history, drawnAt), neverDrawn: !drawnAt && !map.nodes.length }).map;
        if (wantMap) {
          const m = await post(R.map, '/api/logos/map', { messages: history.map(({ role, content }) => ({ role, content })), map, contexts: {} });
          try {
            map = JSON.parse(m.text).map ?? map;
          } catch {}
          drawnAt = Date.now();
          turn.map = true;
        }
      }
      const users = history.filter((m) => m.role === 'user').length;
      // the title: Logos 5 once, after the first reply; Core 4's page on its first two turns
      if ((five && users === 1) || (arm === 'core4' && users <= 2)) {
        await post(R.title, '/api/extract-memory', { titleOnly: true, ...(five ? { titleStyle: 'topic' } : {}), messages: history.map(({ role, content }) => ({ role, content })) });
      }
      // the older understanding profile, every four turns — no longer written by Logos 5
      if (!five && users % 4 === 0) {
        await post(R.understanding, '/api/update-understanding', { messages: history.map(({ role, content }) => ({ role, content })), surface: arm === 'core4' ? 'core' : 'logos', conversationId: 'm1' });
      }
      for (const c of globalThis.__evalCalls.splice(0)) {
        turn.calls[c.purpose] = (turn.calls[c.purpose] ?? 0) + 1;
        turn.inChars[c.purpose] = (turn.inChars[c.purpose] ?? 0) + charsOf(c.messages);
        turn.cachedTok += cacheable(sharedPrefix(lastOf.get(c.purpose), c.messages));
        lastOf.set(c.purpose, c.messages);
      }
      perTurn.push(turn);
    }
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
  const sum = (f) => perTurn.reduce((n, t) => n + f(t), 0);
  const purposes = [...new Set(perTurn.flatMap((t) => Object.keys(t.calls)))].sort();
  const calls = Object.fromEntries(purposes.map((p) => [p, sum((t) => t.calls[p] ?? 0)]));
  const inTok = Object.fromEntries(purposes.map((p) => [p, tok(sum((t) => t.inChars[p] ?? 0))]));
  const totalTok = Object.values(inTok).reduce((a, b) => a + b, 0);
  const cachedTok = sum((t) => t.cachedTok);
  const ms = perTurn.map((t) => t.ms).sort((a, b) => a - b);
  return {
    arm,
    turns: perTurn.length,
    ok: perTurn.every((t) => t.status === 200),
    calls,
    callsTotal: Object.values(calls).reduce((a, b) => a + b, 0),
    mapPasses: perTurn.filter((t) => t.map).length,
    inputTokens: inTok,
    inputTokensTotal: totalTok,
    cacheableTokens: cachedTok,
    uncachedTokens: totalTok - cachedTok,
    routeMsMedian: ms[Math.floor(ms.length / 2)],
    perTurn,
  };
}

const results = [];
const ARMS = typeof args.arms === 'string' ? args.arms.split(',') : ['before', 'after', 'core4', 'classic', 'open'];
for (const arm of ARMS) {
  try {
    results.push(await run(arm));
  } catch (e) {
    results.push({ arm, error: String(e?.message ?? e) });
  }
}
const pick = (r) => (r.error ? { arm: r.arm, error: r.error } : { arm: r.arm, ok: r.ok, calls: r.calls, callsTotal: r.callsTotal, mapPasses: r.mapPasses, inputTokens: r.inputTokens, inputTokensTotal: r.inputTokensTotal, cacheableTokens: r.cacheableTokens, uncachedTokens: r.uncachedTokens, routeMsMedian: r.routeMsMedian });
const summary = { root: ROOT, at: new Date().toISOString(), script: SCRIPT, results: results.map(pick) };
writeFileSync(join(OUT, 'measure.json'), JSON.stringify({ ...summary, detail: results }, null, 2));
const line = (r) =>
  r.error
    ? `${r.arm.padEnd(7)} could not run: ${r.error}`
    : `${r.arm.padEnd(7)} calls ${String(r.callsTotal).padStart(3)}  map passes ${String(r.mapPasses).padStart(2)}  input ≈${String(r.inputTokensTotal).padStart(7)} tok  cacheable ≈${String(r.cacheableTokens).padStart(7)}  uncached ≈${String(r.uncachedTokens).padStart(7)}  route ${r.routeMsMedian}ms  ${JSON.stringify(r.calls)}`;
console.log(`\nTen turns, the same conversation (${SCRIPT.length} messages of theirs):\n`);
for (const r of results) console.log(line(r));
console.log(`\nwritten to ${join(OUT, 'measure.json')}`);
