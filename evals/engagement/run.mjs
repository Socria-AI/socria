#!/usr/bin/env node
// evals/engagement/run.mjs — THE ENGAGEMENT READING, BEFORE AND AFTER, THROUGH THE REAL ROUTE.
//
//   node evals/engagement/run.mjs                  offline: no key, no network
//   OPENAI_API_KEY=… node evals/engagement/run.mjs --live [--repeat 3] [--only S03]
//                                                  [--out <dir>]
//
// The twelve scripted conversations of scenarios.mjs are sent, turn by turn, through the REAL Logos route
// (app/api/logos/chat) — only the database and the auth swapped, as in evals/logos5 — twice: with the reading off
// (LOGOS_ENGAGEMENT=off: Core as it is — the same system message, the same turn's note, the same budget) and with
// it on.
//
// OFFLINE (always). The model is a recorder that streams a scripted reply. What is measured is what the product
// DOES, which code can decide:
//   • the reading itself — strategy, invitation, continuation, the line — against what each scenario expects
//     (read from the route's own trace, X-Socria-Runtime);
//   • the turn's instructions in both arms, and what was added to them;
//   • what reaches the person when a reply is written the way a habit writes it (`tempt`: a closing question where
//     none is wanted), through the real stream gate, in both arms;
//   • cost: model calls per turn (the reading may add none), the characters added to the prompt, and the route's
//     own time with a model that answers instantly.
// What is NOT measured offline, and is not claimed: what a model would write. The scripted replies are ours.
//
// LIVE (--live, with a key). The same turns, the real model, both arms, the history held identical (the scripted
// replies) so only the reply under test differs. Saved as pairs with the arms shuffled and a key kept apart, for a
// blind read against rubric.md — by people; no judge model is run here. A live model is sampled: use --repeat
// before reading a difference of a turn or two. Simulated either way: these are our conversations, not users'.
//
// Without OPENAI_API_KEY the live part says so and nothing is fabricated.

import { build } from 'esbuild';
import { randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SCENARIOS, turnsOf } from './scenarios.mjs';

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
  name: 'engagement-swap',
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
  if (first.startsWith('[engage]')) return void logged.push(first);
  if (/^\[(socria|logos|core4|tokens|epistemic|search|mind|mr|explain|course)/.test(first) || first.startsWith('logos') || first.startsWith('conversations') || first.startsWith('stream error')) return;
  orig(...a);
};
console.info = quiet(console.info.bind(console));
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));
if (!LIVE) process.env.OPENAI_API_KEY = 'engagement-eval';
process.env.RATE_LIMIT_DISABLED = '1';

const chat = await import(pathToFileURL(join(OUT, '.build', 'chat.mjs')).href);
const { NextRequest } = await import('next/server.js');

const ARMS = ['off', 'on'];
const field = (trace, key) => (new RegExp(`(?:^|;)${key}=([^;]*)`).exec(trace ?? '') ?? [])[1] ?? '';
/** The route's reading, from its own trace: "build/explicit/explore,cue:aloud,uptake:took,cap:1,own:1,follow:0,why:aloud". */
function readingOf(headers) {
  const e = field(headers.get('x-socria-runtime'), 'engage');
  if (!e) return null;
  const [triple, ...rest] = e.split(',');
  const [strategy, invitation, continuation] = triple.split('/');
  const kv = Object.fromEntries(rest.map((x) => x.split(':')));
  return { strategy, invitation, continuation, cue: kv.cue === 'none' ? null : kv.cue, cap: Number(kv.cap), uptake: kv.uptake === 'unasked' || kv.uptake === 'first' ? 'none' : kv.uptake, why: kv.why };
}
const turnNote = (messages) => {
  const m = [...messages].reverse().find((x) => x.role === 'system' && String(x.content).startsWith('=== THIS TURN ==='));
  return m ? String(m.content) : '';
};

/** One turn through the route in one arm. Offline: `reply` is what the recorder streams. */
async function send(arm, t, sessionId, reply) {
  process.env.LOGOS_ENGAGEMENT = arm;
  globalThis.__uid = `eval_${arm}`;
  globalThis.__logosCalls = [];
  globalThis.__logosReply = reply;
  logged.length = 0;
  const body = { surface: 'logos5', sessionId, messages: [...t.history, { role: 'user', content: t.user }] };
  const t0 = performance.now();
  const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const received = await r.text().catch(() => '');
  const ms = performance.now() - t0;
  await new Promise((ok) => setTimeout(ok, 15));
  const calls = globalThis.__logosCalls ?? [];
  const streamed = calls.find((c) => c.stream);
  const messages = streamed?.messages ?? [];
  return {
    status: r.status,
    received,
    ms,
    reading: readingOf(r.headers),
    questions: Number(field(r.headers.get('x-socria-assist') ?? '', 'q') || (/;q=(\d)/.exec(r.headers.get('x-socria-assist') ?? '') ?? [])[1] || 0),
    note: turnNote(messages),
    chars: messages.reduce((n, m) => n + String(m.content ?? '').length, 0),
    calls: calls.length,
    log: logged.find((l) => l.startsWith('[engage]')) ?? '',
  };
}

const NEUTRAL = 'Noted.';
const results = [];
let wrong = 0;
for (const sc of SCENARIOS) {
  if (ONLY && sc.id !== ONLY) continue;
  for (const t of turnsOf(sc)) {
    const row = { id: t.id, scenario: sc.name, wants: sc.wants, user: t.user, expect: t.expect ?? {}, arms: {} };
    for (const arm of ARMS) {
      const sid = `eval-${t.id}-${arm}`.replace(/[^a-zA-Z0-9-]/g, '-');
      if (LIVE) {
        const runs = [];
        for (let k = 0; k < REPEAT; k++) runs.push(await send(arm, t, `${sid}-${k}`, ''));
        row.arms[arm] = { ...runs[0], replies: runs.map((x) => x.received) };
      } else {
        const plain = await send(arm, t, sid, t.reply ?? NEUTRAL);
        const tempted = t.tempt ? await send(arm, t, `${sid}-t`, t.tempt) : null;
        row.arms[arm] = { ...plain, ...(tempted ? { tempt: t.tempt, tempted: tempted.received } : {}) };
      }
    }
    // the reading, as the route traced it, against what the scenario expects
    const on = row.arms.on;
    const got = { ...(on.reading ?? {}), questions: on.questions };
    row.miss = Object.entries(row.expect).filter(([k, v]) => got[k] !== v);
    if (row.miss.length) wrong++;
    // what the reading added to this turn's instructions
    const offLines = new Set(row.arms.off.note.split('\n'));
    row.added = on.note.split('\n').filter((l) => l.trim() && !offLines.has(l));
    results.push(row);
  }
}

const n = results.length;
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const summary = {
  mode: LIVE ? 'live' : 'offline',
  turns: n,
  readingAsExpected: n - wrong,
  offArmHasNoReading: results.every((r) => r.arms.off.reading === null),
  modelCallsPerTurn: { off: sum(results.map((r) => r.arms.off.calls)) / n, on: sum(results.map((r) => r.arms.on.calls)) / n },
  // a line of the reading's own: not a block header that appeared with it, and not the move's "QUESTIONS: none"
  turnsWithALine: results.filter((r) => r.added.some((l) => !/^===|^QUESTIONS: none/.test(l))).length,
  // the question budget, before and after: the reading may close it for a turn and must never open it
  budgetClosed: results.filter((r) => r.arms.off.questions === 1 && r.arms.on.questions === 0).map((r) => r.id),
  budgetRaised: results.filter((r) => r.arms.off.questions === 0 && r.arms.on.questions === 1).map((r) => r.id),
  promptChars: {
    off: sum(results.map((r) => r.arms.off.chars)),
    on: sum(results.map((r) => r.arms.on.chars)),
    addedPerTurnMean: Math.round((sum(results.map((r) => r.arms.on.chars)) - sum(results.map((r) => r.arms.off.chars))) / n),
    addedPerTurnMax: Math.max(...results.map((r) => r.arms.on.chars - r.arms.off.chars)),
  },
  routeMsMedian: { off: Number(med(results.map((r) => r.arms.off.ms)).toFixed(1)), on: Number(med(results.map((r) => r.arms.on.ms)).toFixed(1)) },
};
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ summary, results }, null, 2));

// ── the report ───────────────────────────────────────────────────────
const md = [];
md.push(`# Engagement reading — ${LIVE ? 'live' : 'offline'} run`, '', `${n} turns of ${new Set(results.map((r) => r.id.split('.')[0])).size} scenarios, through the real route, with the reading off and on.`, '');
md.push('| | |', '|---|---|');
md.push(`| Reading as each scenario expects | ${summary.readingAsExpected} of ${n} |`);
md.push(`| With the switch off, no reading and no trace | ${summary.offArmHasNoReading ? 'yes' : 'NO'} |`);
md.push(`| Model calls per turn | off ${summary.modelCallsPerTurn.off} · on ${summary.modelCallsPerTurn.on} |`);
md.push(`| Turns given a line | ${summary.turnsWithALine} of ${n} |`);
md.push(`| Question budget closed by the reading | ${summary.budgetClosed.length} of ${n} turns${summary.budgetClosed.length ? ` (${summary.budgetClosed.join(', ')})` : ''} |`);
md.push(`| Question budget raised by the reading | ${summary.budgetRaised.length}${summary.budgetRaised.length ? ` — **MUST BE 0** (${summary.budgetRaised.join(', ')})` : ''} |`);
md.push(`| Prompt characters added per turn | mean ${summary.promptChars.addedPerTurnMean}, max ${summary.promptChars.addedPerTurnMax} (≈ ${Math.round(summary.promptChars.addedPerTurnMean / 4)} tokens mean) |`);
if (!LIVE) md.push(`| Route time, median, model answering instantly | off ${summary.routeMsMedian.off} ms · on ${summary.routeMsMedian.on} ms |`);
md.push('');
for (const r of results) {
  const on = r.arms.on, off = r.arms.off;
  md.push(`## ${r.id} — ${r.scenario}`, '', `> ${r.user}`, '');
  md.push(`- **Reading:** ${on.reading ? `${on.reading.strategy} / ${on.reading.invitation} / ${on.reading.continuation}${on.reading.cue ? ` · line \`${on.reading.cue}\`` : ' · no line'} · questions ${off.questions}→${on.questions}` : 'none'}${r.miss.length ? ` — **expected ${JSON.stringify(Object.fromEntries(r.miss))}**` : ''}`);
  md.push(`- **Added to the turn's instructions:** ${r.added.length ? r.added.map((l) => `“${l}”`).join(' ') : 'nothing'}`);
  if (!LIVE && on.tempt) md.push(`- **A reply written by habit:** “${on.tempt}”`, `  - reading off, reaches them as: “${off.tempted.trim()}”`, `  - reading on, reaches them as: “${on.tempted.trim()}”`);
  if (LIVE) md.push(`- **Reply, reading off:** ${off.replies.map((x) => `“${x.trim()}”`).join(' / ')}`, `- **Reply, reading on:** ${on.replies.map((x) => `“${x.trim()}”`).join(' / ')}`);
  md.push('');
}
writeFileSync(join(OUT, 'report.md'), md.join('\n'));

if (LIVE) {
  // pairs for a blind read: which reply is A is drawn at random for every pair (no pattern for a reader to learn),
  // and which arm each was is kept apart, in the key
  const order = results.map(() => randomInt(2) === 0);
  const packet = results.map((r, i) => ({ id: r.id, scenario: r.scenario, wants: r.wants, user: r.user, A: (order[i] ? r.arms.off : r.arms.on).replies[0], B: (order[i] ? r.arms.on : r.arms.off).replies[0] }));
  writeFileSync(join(OUT, 'blind-packet.json'), JSON.stringify(packet, null, 2));
  writeFileSync(join(OUT, 'blind-key.json'), JSON.stringify(results.map((r, i) => ({ id: r.id, A: order[i] ? 'off' : 'on', B: order[i] ? 'on' : 'off' })), null, 2));
}

console.log(`engagement (${summary.mode}): reading as expected ${summary.readingAsExpected}/${n}; off arm clean: ${summary.offArmHasNoReading}; calls/turn off ${summary.modelCallsPerTurn.off} on ${summary.modelCallsPerTurn.on}; a line on ${summary.turnsWithALine}/${n} turns; budget closed on ${summary.budgetClosed.length}, raised on ${summary.budgetRaised.length}; +${summary.promptChars.addedPerTurnMean} chars/turn mean (max ${summary.promptChars.addedPerTurnMax})${LIVE ? '' : `; route ${summary.routeMsMedian.off}→${summary.routeMsMedian.on} ms median`}`);
for (const r of results.filter((x) => x.miss.length)) console.log(`  MISS ${r.id}: expected ${JSON.stringify(Object.fromEntries(r.miss))}, read ${JSON.stringify(r.arms.on.reading)} q${r.arms.on.questions}`);
console.log(`report: ${join(OUT, 'report.md')}`);
process.exit(wrong || summary.budgetRaised.length || !summary.offArmHasNoReading ? 1 : 0);
