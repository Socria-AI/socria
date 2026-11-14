#!/usr/bin/env node
// evals/visual/run.mjs — VISUAL EXPLANATIONS AGAINST TEXT ONLY, THROUGH THE REAL ROUTE.
//
//   node evals/visual/run.mjs                      offline: no key, no network
//   OPENAI_API_KEY=… node evals/visual/run.mjs --live [--repeat 3] [--only V01]
//
// Each scenario (scenarios.mjs) goes through the real Logos route twice: LOGOS_INLINE=off (Socria in text alone — no
// element offered, any written dropped) and on. Offline, the model is a recorder streaming our scripted reply, so what
// is measured is what the product does: which representation it chooses, whether a valid element reaches the person
// intact through the stream gate (and an invalid one never does), and what the offer costs — prompt characters, model
// calls (none added), the route's own time. Live, the real model answers both arms and the pairs are saved blind
// (rubric.md) for people to read. Neither shows that anyone understands more: that needs readers, then users.

import { build } from 'esbuild';
import { randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SCENARIOS } from './scenarios.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..');
const HELPERS = join(REPO, 'test', 'helpers');
const FAKE_DB = join(HELPERS, 'fake-supabase.mjs');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : acc), []));
const LIVE = !!args.live;
const REPEAT = Math.max(1, Number(args.repeat) || 1);
const ONLY = typeof args.only === 'string' ? args.only : '';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = res(typeof args.out === 'string' ? args.out : join(here, 'runs', `${LIVE ? 'live' : 'offline'}-${stamp}`));
if (LIVE && !process.env.OPENAI_API_KEY) {
  console.log('live eval: skipped — set OPENAI_API_KEY to run the scenarios against the live model. No live results were produced.');
  process.exit(0);
}
mkdirSync(join(OUT, '.build'), { recursive: true });

const swap = {
  name: 'visual-swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(REPO, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(REPO, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(HELPERS, 'fake-clerk.mjs')).href, external: true }));
    // offline, the model is the scripted recorder; live, it is the real client
    if (!LIVE) b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(HELPERS, 'fake-openai-logos.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(HELPERS, 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
await build({
  entryPoints: [join(REPO, 'app/api/logos/chat/route.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(OUT, '.build', 'chat.mjs'),
  tsconfig: join(REPO, 'tsconfig.json'),
  plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', ...(LIVE ? ['openai'] : [])],
  logLevel: 'error',
});

// the route's own content-free lines are kept for the report; everything else it logs is its business
const logged = [];
const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
    if (/^\[(socria|logos|core4|tokens|epistemic|search|mind|mr|explain|course|engage)/.test(first) || first.startsWith('logos') || first.startsWith('conversations') || first.startsWith('stream error')) return;
  orig(...a);
};
console.info = quiet(console.info.bind(console));
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));
if (!LIVE) process.env.OPENAI_API_KEY = 'visual-eval';
process.env.RATE_LIMIT_DISABLED = '1';

const chat = await import(pathToFileURL(join(OUT, '.build', 'chat.mjs')).href);
const { NextRequest } = await import('next/server.js');


const ARMS = ['text', 'visual'];
const field = (trace, key) => (new RegExp(`(?:^|;)${key}=([^;]*)`).exec(trace ?? '') ?? [])[1] ?? '';
const blocksIn = (text) => [...String(text).matchAll(/```ui\n([\s\S]*?)```/g)].map((m) => m[1]);

/** One turn in one arm: LOGOS_INLINE=off is Socria answering in text alone; on, the elements are offered and drawn. */
async function send(arm, sc, sessionId, reply) {
  process.env.LOGOS_INLINE = arm === 'text' ? 'off' : 'on';
  globalThis.__uid = `visual_${arm}`;
  globalThis.__logosCalls = [];
  globalThis.__logosReply = reply;
  const body = { surface: 'logos5', sessionId, messages: [{ role: 'user', content: sc.user }] };
  const t0 = performance.now();
  const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const received = await r.text().catch(() => '');
  const ms = performance.now() - t0;
  await new Promise((ok) => setTimeout(ok, 15));
  const calls = globalThis.__logosCalls ?? [];
  const messages = calls.find((c) => c.stream)?.messages ?? [];
  const runtime = r.headers.get('x-socria-runtime') ?? '';
  return { status: r.status, received, ms, calls: calls.length, chars: messages.reduce((n, m) => n + String(m.content ?? '').length, 0), forms: field(runtime, 'inline').split(',').filter((x) => x && x !== 'none'), repr: field(runtime, 'repr'), blocks: blocksIn(received) };
}

const results = [];
let wrong = 0;
for (const sc of SCENARIOS) {
  if (ONLY && sc.id !== ONLY) continue;
  const row = { id: sc.id, name: sc.name, user: sc.user, expect: sc.expect, arms: {} };
  for (const arm of ARMS) {
    const sid = `vis-${sc.id}-${arm}`;
    if (LIVE) {
      const runs = [];
      for (let k = 0; k < REPEAT; k++) runs.push(await send(arm, sc, `${sid}-${k}`, ''));
      row.arms[arm] = { ...runs[0], replies: runs.map((x) => x.received) };
    } else row.arms[arm] = await send(arm, sc, sid, sc.reply);
  }
  const v = row.arms.visual, t = row.arms.text;
  const miss = [];
  if (sc.expect.form && !v.forms.includes(sc.expect.form)) miss.push(`form ${sc.expect.form}`);
  if (sc.expect.noForm && v.forms.includes(sc.expect.noForm)) miss.push(`no ${sc.expect.noForm}`);
  if (sc.expect.repr && v.repr !== sc.expect.repr) miss.push(`repr ${sc.expect.repr} (got ${v.repr})`);
  if (!LIVE) {
    // the pipeline: a valid element reaches the person intact in the visual arm, and never in the text arm; an
    // invalid one is refused, and its prose stands alone
    const wrote = blocksIn(sc.reply).length;
    if (t.blocks.length) miss.push('text arm shipped an element');
    if (sc.invalid ? v.blocks.length : wrote && v.blocks.length !== wrote) miss.push(sc.invalid ? 'an invalid element shipped' : 'the element did not reach them');
    if (!v.received.trim()) miss.push('empty reply');
  }
  row.miss = miss;
  if (miss.length) wrong++;
  results.push(row);
}

const n = results.length;
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const summary = {
  mode: LIVE ? 'live' : 'offline',
  scenarios: n,
  asExpected: n - wrong,
  modelCallsPerTurn: { text: sum(results.map((r) => r.arms.text.calls)) / n, visual: sum(results.map((r) => r.arms.visual.calls)) / n },
  promptCharsAddedMean: Math.round(sum(results.map((r) => r.arms.visual.chars - r.arms.text.chars)) / n),
  promptCharsAddedMax: Math.max(...results.map((r) => r.arms.visual.chars - r.arms.text.chars)),
  routeMsMedian: { text: Number(med(results.map((r) => r.arms.text.ms)).toFixed(1)), visual: Number(med(results.map((r) => r.arms.visual.ms)).toFixed(1)) },
  withAPicture: results.filter((r) => r.arms.visual.forms.some((k) => k !== 'paths')).length,
};
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ summary, results }, null, 2));
const md = [`# Visual explanations — ${summary.mode} run`, '', `${n} scenarios through the real route, text only (LOGOS_INLINE=off) and visual (on).`, '', '| | |', '|---|---|',
  `| As each scenario expects | ${summary.asExpected} of ${n} |`, `| Turns given a picture | ${summary.withAPicture} of ${n} |`, `| Model calls per turn | text ${summary.modelCallsPerTurn.text} · visual ${summary.modelCallsPerTurn.visual} |`,
  `| Prompt characters added per turn by the offer | mean ${summary.promptCharsAddedMean}, max ${summary.promptCharsAddedMax} (≈ ${Math.round(summary.promptCharsAddedMean / 4)} tokens mean) |`,
  ...(LIVE ? [] : [`| Route time, median, model answering instantly | text ${summary.routeMsMedian.text} ms · visual ${summary.routeMsMedian.visual} ms |`]), ''];
for (const r of results) {
  md.push(`## ${r.id} — ${r.name}`, '', `> ${r.user}`, '', `- **Chosen:** ${r.arms.visual.forms.join(', ') || 'nothing drawn'} · representation \`${r.arms.visual.repr || '-'}\`${r.miss.length ? ` — **${r.miss.join('; ')}**` : ''}`);
  if (!LIVE) md.push(`- **Reached them:** text arm ${r.arms.text.blocks.length} element(s) · visual arm ${r.arms.visual.blocks.length}`);
  else md.push(`- **Text only:** ${r.arms.text.replies.map((x) => `“${x.trim().slice(0, 400)}”`).join(' / ')}`, `- **Visual:** ${r.arms.visual.replies.map((x) => `“${x.trim().slice(0, 400)}”`).join(' / ')}`);
  md.push('');
}
writeFileSync(join(OUT, 'report.md'), md.join('\n'));
if (LIVE) {
  const order = results.map(() => randomInt(2) === 0);
  writeFileSync(join(OUT, 'blind-packet.json'), JSON.stringify(results.map((r, i) => ({ id: r.id, user: r.user, A: (order[i] ? r.arms.text : r.arms.visual).replies[0], B: (order[i] ? r.arms.visual : r.arms.text).replies[0] })), null, 2));
  writeFileSync(join(OUT, 'blind-key.json'), JSON.stringify(results.map((r, i) => ({ id: r.id, A: order[i] ? 'text' : 'visual', B: order[i] ? 'visual' : 'text' })), null, 2));
}
console.log(`visual (${summary.mode}): as expected ${summary.asExpected}/${n}; pictures ${summary.withAPicture}/${n}; calls/turn text ${summary.modelCallsPerTurn.text} visual ${summary.modelCallsPerTurn.visual}; +${summary.promptCharsAddedMean} chars/turn mean (max ${summary.promptCharsAddedMax})${LIVE ? '' : `; route ${summary.routeMsMedian.text}→${summary.routeMsMedian.visual} ms median`}`);
for (const r of results.filter((x) => x.miss.length)) console.log(`  MISS ${r.id}: ${r.miss.join('; ')}`);
console.log(`report: ${join(OUT, 'report.md')}`);
process.exit(wrong ? 1 : 0);
