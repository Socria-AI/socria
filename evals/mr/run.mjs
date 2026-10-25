#!/usr/bin/env node
// The Metacognitive Regulation benchmark — MR's control plane, through the REAL route.
//
//   node evals/mr/run.mjs                         every scenario, every arm, both simulated profiles
//   node evals/mr/run.mjs --profile question_prone --only socratic-loop
//   node evals/mr/run.mjs --out <dir> --seed 7
//   OPENAI_API_KEY=… node evals/mr/run.mjs --live  the same against the real model (not in CI)
//
// WHAT RUNS: app/api/logos/chat/route.ts, bundled with only the database
// (test/helpers/fake-supabase.mjs), Clerk and the model swapped — the runtime,
// ACS, MR, the stream gate and the ledger are the code that ships. Each
// scenario (scenarios.mjs) is a scripted person who keeps asking until they
// get what they came for, played through every arm:
//
//   baseline          LOGOS_MR unset: the route as it is without MR
//   shadow            LOGOS_MR=shadow: MR decides and traces, enforces nothing
//   prompt_reflection a fixed self-reflection instruction, nothing enforced
//   state_only        MR's state as context, nothing enforced
//   full              MR, enforced
//   full_no_ifr       MR with Interaction Friction Regulation off
//
// and against two SIMULATED assistants (sim-model.mjs): one that follows its
// instructions exactly, one that over-asks and slips a question in even when
// told not to. The simulator is the point and the limit: it measures what MR
// instructs and what code enforces, and NOTHING about real model behaviour or
// human improvement. Every report says so (analyze.mjs DESIGN_NOTES).
//
// REPORTED, per arm, with bootstrap intervals over scenarios: task success,
// unnecessary questions, turns before useful help, user-control compliance,
// strategy changes, interventions per turn, reverts, integrity findings,
// model calls per turn, route and MR latency; plus what the ledger wrote and
// whether it held any text. Written to <out>/summary.json and <out>/report.md.
//
// HOW IT COUNTS, where a softer rule would flatter MR:
//   • a question is EVERY interrogative sentence the person is handed —
//     explicit, disguised, and offers or check-ins ("Does that make sense?").
//     Offers are also reported on their own. Every scenario in which the full
//     arm still let an unwanted one through is listed by name, not averaged in;
//   • a run in which no reply was useful counts the turns it actually played
//     (a lower bound), not the turn cap;
//   • a value from fewer than two scenarios is printed with its n, and no
//     interval;
//   • everything is played once, untimed, before anything is timed, and each
//     scenario runs its arms in a rotated order, so start-up cost and position
//     land on no arm in particular.

import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SCENARIOS } from './scenarios.mjs';
import { DESIGN_NOTES, median, pairedDiff, summarizeArms, direction } from './analyze.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..');
const HELPERS = join(REPO, 'test', 'helpers');
const FAKE_DB = join(HELPERS, 'fake-supabase.mjs');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : acc), [])
);
const LIVE = args.live === true || args.live === 'true';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = res(typeof args.out === 'string' ? args.out : join(here, 'runs', `mr-${stamp}`));
const SEED = Number(args.seed ?? 7) || 7;
const MAX_TURNS = 4;
mkdirSync(join(OUT, '.build'), { recursive: true });

if (LIVE && !process.env.OPENAI_API_KEY) {
  console.log('live: skipped — OPENAI_API_KEY is not set. No live results were produced.');
  process.exit(0);
}

export const ARMS = [
  { id: 'baseline', env: { LOGOS_MR: undefined, LOGOS_MR_ARM: undefined, LOGOS_IFR: undefined } },
  { id: 'shadow', env: { LOGOS_MR: 'shadow', LOGOS_MR_ARM: undefined, LOGOS_IFR: undefined } },
  { id: 'prompt_reflection', env: { LOGOS_MR: 'on', LOGOS_MR_ARM: 'prompt_reflection', LOGOS_IFR: undefined } },
  { id: 'state_only', env: { LOGOS_MR: 'on', LOGOS_MR_ARM: 'state_only', LOGOS_IFR: undefined } },
  { id: 'full', env: { LOGOS_MR: 'on', LOGOS_MR_ARM: undefined, LOGOS_IFR: undefined } },
  { id: 'full_no_ifr', env: { LOGOS_MR: 'on', LOGOS_MR_ARM: undefined, LOGOS_IFR: 'off' } },
];
const PROFILES = LIVE ? ['live'] : typeof args.profile === 'string' ? [args.profile] : ['compliant', 'question_prone'];

// ── the route, and a question counter from the same code the gate uses ──
await build({
  entryPoints: [join(REPO, 'app/api/logos/chat/route.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(OUT, '.build', 'chat.mjs'),
  tsconfig: join(REPO, 'tsconfig.json'),
  plugins: [
    {
      name: 'swap',
      setup(b) {
        b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
          const p = a.path.startsWith('@/') ? join(REPO, a.path.slice(2)) : res(a.resolveDir, a.path);
          if (p === join(REPO, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
          return undefined;
        });
        b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(HELPERS, 'fake-clerk.mjs')).href, external: true }));
        if (!LIVE) b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'sim-model.mjs')).href, external: true }));
        b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(HELPERS, 'server-only-shim.mjs') }));
        b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
      },
    },
  ],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', ...(LIVE ? ['openai'] : [])],
  logLevel: 'error',
});
await build({
  stdin: { contents: `export { interrogatives, sentencesOf } from './lib/core4/questions';`, resolveDir: REPO, sourcefile: 'q.ts', loader: 'ts' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(OUT, '.build', 'q.mjs'),
  tsconfig: join(REPO, 'tsconfig.json'),
  logLevel: 'error',
});
const { interrogatives, sentencesOf } = await import(pathToFileURL(join(OUT, '.build', 'q.mjs')).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);

// Every interrogative sentence a reply hands the person. Core 4's questionLoad
// leaves offers and check-ins out on purpose (it prices a move), but "Does that
// make sense?" in a reply to someone who said "just show me the steps" is still
// a question put to them, and it is exactly the slip the question-prone
// simulator makes. `marks` is what a reader sees, sentences ending in a
// question mark, so mr-eval can hold the count to it.
function asked(reply) {
  const q = interrogatives(reply);
  return {
    questions: q.explicit.length + q.disguised.length + q.offers.length,
    offers: q.offers.length,
    marks: sentencesOf(reply).filter((x) => /\?["'’”)\]*_]*\s*$/.test(x)).length,
  };
}

// the route's own lines: [mr] traces are kept (content-free), everything else is quiet
const mrLines = [];
const origInfo = console.info.bind(console);
const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('[mr]')) return void mrLines.push(first);
  if (/^\[(socria|logos|core4|tokens|search|epistemic)/.test(first) || first.startsWith('logos') || first.startsWith('conversations')) return;
  orig(...a);
};
console.info = quiet(origInfo);
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));

if (!LIVE) process.env.OPENAI_API_KEY = 'sim';
process.env.RATE_LIMIT_DISABLED = '1';
globalThis.__uid = 'user_mr_bench';
const chat = await import(pathToFileURL(join(OUT, '.build', 'chat.mjs')).href);
const { NextRequest } = await import('next/server.js');

const field = (trace, k) => (trace ?? '').split(';').find((p) => p.startsWith(`${k}=`))?.slice(k.length + 1) ?? null;

async function post(body, env) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try {
    globalThis.__mrCalls = [];
    const before = mrLines.length;
    const t0 = performance.now();
    const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ surface: 'logos5', ...body }) }));
    const text = await r.text().catch(() => '');
    const ms = performance.now() - t0;
    await new Promise((ok) => setTimeout(ok, 5));
    const line = mrLines.slice(before).pop() ?? null;
    return { status: r.status, text, ms, assist: r.headers.get('x-socria-assist'), trace: r.headers.get('x-socria-mr'), line, calls: (globalThis.__mrCalls ?? []).length };
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
}

async function play(s, arm, profile, prefix = '') {
  globalThis.__mrSim = { profile, content: s.content, claims: !!s.claims };
  const sessionId = `${prefix}${s.id}-${arm.id}-${profile}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 100);
  const messages = (s.prior ?? []).map(([role, content]) => ({ role, content }));
  let say = s.opening[0];
  const turns = [];
  for (let k = 0; k < MAX_TURNS && say; k++) {
    messages.push({ role: 'user', content: say });
    const r = await post({ sessionId, messages }, arm.env);
    const reply = r.text;
    const q = asked(reply);
    turns.push({
      k,
      status: r.status,
      questions: q.questions,
      offers: q.offers,
      marks: q.marks,
      useful: s.useful(reply, k),
      unwanted: s.unwanted(k),
      control: s.control(reply, k),
      action: field(r.trace, 'a'),
      strategy: (field(r.trace, 'c') ?? '').split(',').find((x) => x.startsWith('s:')) ?? null,
      integrity: field(r.trace, 'int'),
      mrMs: Number(field(r.trace, 'ms') ?? NaN),
      routeMs: r.ms,
      calls: r.calls,
      q: Number(/;q=(\d)/.exec(r.assist ?? '')?.[1] ?? NaN),
    });
    messages.push({ role: 'assistant', content: reply });
    say = s.next(reply, k);
  }
  return { scenario: s.id, domain: s.domain, covers: s.covers, arm: arm.id, profile, turns, metrics: metricsOf(s, turns) };
}

function metricsOf(s, turns) {
  const defined = turns.filter((t) => t.useful !== null);
  const firstUseful = turns.findIndex((t) => t.useful === true);
  const controlled = turns.filter((t) => t.control !== null && t.control !== undefined);
  const strategies = turns.map((t) => t.strategy ?? 'default');
  let changes = 0;
  for (let i = 1; i < strategies.length; i++) if (strategies[i] !== strategies[i - 1]) changes++;
  return {
    taskSuccess: defined.length ? (turns.some((t) => t.useful === true) ? 1 : 0) : null,
    // No useful reply: censored at the turns actually played. A person who
    // stopped after one turn waited one turn, not the cap; the true wait is
    // at least this, so a censored run counts low, never high.
    turnsBeforeUseful: defined.length ? (firstUseful >= 0 ? firstUseful : turns.length) : null,
    usefulCensored: defined.length ? firstUseful < 0 : null,
    unnecessaryQuestions: turns.filter((t) => t.unwanted).reduce((n, t) => n + t.questions, 0),
    unnecessaryOffers: turns.filter((t) => t.unwanted).reduce((n, t) => n + t.offers, 0),
    questionsPerTurn: turns.reduce((n, t) => n + t.questions, 0) / turns.length,
    userControlCompliance: controlled.length ? controlled.filter((t) => t.control === true).length / controlled.length : null,
    interventionsPerTurn: turns.filter((t) => t.action && t.action !== 'none').length / turns.length,
    strategyChanges: changes,
    reverts: turns.filter((t) => t.action === 'revert').length,
    integrityFindings: turns.filter((t) => t.integrity).length,
    modelCallsPerTurn: turns.reduce((n, t) => n + t.calls, 0) / turns.length,
    routeMs: median(turns.map((t) => t.routeMs)),
    mrMs: turns.some((t) => Number.isFinite(t.mrMs)) ? median(turns.filter((t) => Number.isFinite(t.mrMs)).map((t) => t.mrMs)) : null,
    noInterventionWhenAmbiguous: s.expectNoIntervention ? (turns.every((t) => !t.action || t.action === 'none') ? 1 : 0) : null,
    turns: turns.length,
  };
}

const METRICS = [
  'taskSuccess',
  'turnsBeforeUseful',
  'unnecessaryQuestions',
  'unnecessaryOffers',
  'questionsPerTurn',
  'userControlCompliance',
  'interventionsPerTurn',
  'strategyChanges',
  'reverts',
  'integrityFindings',
  'modelCallsPerTurn',
  'routeMs',
  'mrMs',
  'noInterventionWhenAmbiguous',
];

const only = typeof args.only === 'string' ? args.only : null;
const chosen = SCENARIOS.filter((x) => !only || x.id === only);
// Scenario i starts with arm i (mod the number of arms), so no arm always goes first.
const rotated = (i) => ARMS.map((_, j) => ARMS[(i + j) % ARMS.length]);

// The first runs in a process pay for loading and compiling (the route's
// modules, MR's patterns), and with a fixed order that cost always landed on
// baseline, which made every MR arm look faster. So everything is played once
// first, untimed, under another user and other session ids, and thrown away
// with all it wrote. Live runs skip this: it would double the model calls, and
// their timings are the model's anyway.
const warmup = { runs: 0, coldStart: null };
if (!LIVE) {
  globalThis.__uid = 'user_mr_bench_warmup';
  for (const profile of PROFILES) {
    for (const [i, s] of chosen.entries()) {
      for (const arm of rotated(i)) {
        const r = await play(s, arm, profile, 'warm-');
        warmup.runs++;
        warmup.coldStart ??= { routeMs: r.turns[0]?.routeMs ?? null, mrMs: null };
        warmup.coldStart.mrMs ??= r.turns.find((t) => Number.isFinite(t.mrMs))?.mrMs ?? null;
      }
    }
  }
  db.reset();
  mrLines.length = 0;
  globalThis.__uid = 'user_mr_bench';
}

const runs = [];
for (const profile of PROFILES) {
  for (const [i, s] of chosen.entries()) {
    for (const [slot, arm] of rotated(i).entries()) runs.push({ ...(await play(s, arm, profile)), slot });
  }
}

// the ledger, as the fake database holds it after every measured arm ran
const ledger = db.tables.mr_ledger ?? [];
const textual = ledger.filter((row) => JSON.stringify(row.record ?? {}).match(/"[^"]{81,}"|"(?:[^"\s]+\s+){4,}[^"]*"/));

const summary = {
  design: LIVE ? 'live (observational)' : 'simulation',
  note: LIVE ? DESIGN_NOTES.observational : DESIGN_NOTES.simulation,
  seed: SEED,
  order: LIVE ? 'arms rotated per scenario; no warm-up (live)' : 'arms rotated per scenario, after an untimed warm-up pass',
  warmup,
  profiles: {},
  ledger: { rows: ledger.length, kinds: {}, rowsWithText: textual.length },
};
for (const row of ledger) summary.ledger.kinds[row.kind] = (summary.ledger.kinds[row.kind] ?? 0) + 1;
for (const profile of PROFILES) {
  const rs = runs.filter((r) => r.profile === profile);
  const byArm = summarizeArms(rs, METRICS, { seed: SEED });
  const vsBaseline = {};
  for (const arm of ARMS.map((a) => a.id).filter((a) => a !== 'baseline')) {
    vsBaseline[arm] = {};
    for (const m of ['unnecessaryQuestions', 'turnsBeforeUseful', 'taskSuccess', 'userControlCompliance', 'routeMs']) {
      const pick = (id) => Object.fromEntries(rs.filter((r) => r.arm === id && r.metrics[m] !== null).map((r) => [r.scenario, r.metrics[m]]));
      const d = pairedDiff(pick('baseline'), pick(arm), { seed: SEED });
      vsBaseline[arm][m] = { ...d, direction: direction(d) };
    }
  }
  // Runs where no reply was useful, per arm: their turnsBeforeUseful is a lower bound.
  const censored = Object.fromEntries(ARMS.map((a) => [a.id, rs.filter((r) => r.arm === a.id && r.metrics.usefulCensored === true).length]));
  // Every scenario where an unwanted question still reached the person under
  // MR, named: a mean alone would hide that a tail-only cap cannot reach a
  // check-in with more of the reply after it.
  const residual = rs
    .filter((r) => r.arm === 'full')
    .map((r) => ({ scenario: r.scenario, turns: r.turns.filter((t) => t.unwanted && t.questions > 0).map((t) => ({ k: t.k, questions: t.questions, offers: t.offers })) }))
    .filter((x) => x.turns.length);
  summary.profiles[profile] = { byArm, vsBaseline, censored, residual };
}
writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ summary, runs }, null, 2));

// ── the report ──
// One value has no spread to resample: below two, print the value and its n, and no interval.
const f = (ci) => (!ci || !Number.isFinite(ci.mean) ? '—' : ci.n < 2 ? `${ci.mean.toFixed(2)} n=${ci.n}` : `${ci.mean.toFixed(2)} [${ci.lo.toFixed(2)}, ${ci.hi.toFixed(2)}] n=${ci.n}`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const lines = [
  '# MR benchmark',
  '',
  `> ${summary.note}`,
  '',
  `Scenarios: ${chosen.length}. Arms: ${ARMS.map((a) => a.id).join(', ')}. Profiles: ${PROFILES.join(', ')}. Bootstrap seed ${SEED}; intervals are 95% percentile intervals over scenarios — with this few scenarios they are wide, and they say so. A value from fewer than two scenarios has no interval.`,
  '',
  '- **Questions** count every interrogative sentence the person is handed: explicit, disguised ("ask yourself whether…"), and offers or check-ins ("Does that make sense?", "Want me to compare?", "Let me know if…"). `unnecessaryOffers` is the offers and check-ins among the unnecessary questions.',
  '- **turnsBeforeUseful:** a run in which no reply was useful counts the turns it actually played, so it is a lower bound. Those runs are counted under each table.',
  `- **Timing:** ${LIVE ? 'no warm-up (live); ' : `an untimed warm-up pass of ${warmup.runs} runs came first (its first run took ${warmup.coldStart?.routeMs?.toFixed(1) ?? '—'} ms through the route, and MR's first call ${warmup.coldStart?.mrMs ?? '—'} ms: start-up cost, in no table); `}each scenario runs its arms in a rotated order. routeMs is the whole route with the simulator and the fake database. mrMs is MR's own time.`,
  '',
];
for (const profile of PROFILES) {
  lines.push(`## Profile: ${profile}`, '', `| metric | ${ARMS.map((a) => a.id).join(' | ')} |`, `|---|${ARMS.map(() => '---').join('|')}|`);
  for (const m of METRICS) lines.push(`| ${m} | ${ARMS.map((a) => f(summary.profiles[profile].byArm[a.id]?.[m])).join(' | ')} |`);
  const cens = summary.profiles[profile].censored;
  lines.push('', `Runs with no useful reply (turnsBeforeUseful censored at the turns played): ${ARMS.map((a) => `${a.id} ${cens[a.id]}`).join(', ')}.`);
  lines.push('', '### Paired differences against baseline (arm − baseline)', '', '| arm | unnecessaryQuestions | turnsBeforeUseful | taskSuccess | userControlCompliance | routeMs |', '|---|---|---|---|---|---|');
  for (const [arm, d] of Object.entries(summary.profiles[profile].vsBaseline)) {
    lines.push(`| ${arm} | ${['unnecessaryQuestions', 'turnsBeforeUseful', 'taskSuccess', 'userControlCompliance', 'routeMs'].map((m) => `${f(d[m])} (${d[m].direction})`).join(' | ')} |`);
  }
  lines.push('', '### Unwanted questions that still reached the person (full arm)', '');
  const left = summary.profiles[profile].residual;
  if (!left.length) lines.push('None.');
  else lines.push("Listed, not averaged away. The question-prone simulator's slip is a check-in in the middle of the reply with more after it, which a cap on the reply's tail does not reach.", '');
  for (const x of left) {
    lines.push(`- ${x.scenario}: ${x.turns.map((t) => `turn ${t.k}: ${plural(t.questions, 'question', 'questions')}, ${t.offers} of them ${t.offers === 1 ? 'an offer or check-in' : 'offers or check-ins'}`).join('; ')}`);
  }
  lines.push('');
}
lines.push(
  '## Ledger',
  '',
  `${summary.ledger.rows} rows written (${Object.entries(summary.ledger.kinds).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}); rows holding anything that looks like text: ${summary.ledger.rowsWithText}.`,
  '',
  '## Not measured here',
  '',
  '- Independent performance, retention and autonomy: they need real participants, delayed independent tasks and a study instrument (docs/MR-RESEARCH.md).',
  '- How a real model follows MR\'s prompt-level controls: run with --live, and read the result as observational.',
  '- Satisfaction: there is no person here to be satisfied.',
  ''
);
writeFileSync(join(OUT, 'report.md'), lines.join('\n'));
origInfo(`mr benchmark: ${runs.length} runs${warmup.runs ? ` (after ${warmup.runs} untimed warm-up runs)` : ''} → ${join(OUT, 'report.md')}`);
for (const profile of PROFILES) {
  const b = summary.profiles[profile].byArm;
  origInfo(`  ${profile}:`);
  for (const a of ARMS) {
    const m = b[a.id];
    if (!m) continue;
    origInfo(`    ${a.id.padEnd(17)} unnecessary questions ${f(m.unnecessaryQuestions)} (offers ${f(m.unnecessaryOffers)}) · control compliance ${f(m.userControlCompliance)} · task success ${f(m.taskSuccess)} · turns before useful ${f(m.turnsBeforeUseful)}`);
  }
  const left = summary.profiles[profile].residual;
  origInfo(`    full arm, unwanted questions still reaching the person: ${left.length ? left.map((x) => `${x.scenario} (${x.turns.map((t) => `turn ${t.k}: ${t.questions}`).join(', ')})`).join('; ') : 'none'}`);
}
