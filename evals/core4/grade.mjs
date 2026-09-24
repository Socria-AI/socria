#!/usr/bin/env node
// Grade a run: deterministic metrics, blind pairwise judging, the report.
//
//   node evals/core4/grade.mjs --run <dir>            metrics + judge packets + report
//   node evals/core4/grade.mjs --run <dir> --judgments judgments-human/rater-1
//                                                      the same report from a human rater
//
// 1. METRICS. For every completed scenario on each arm, the per-turn
//    deterministic metrics (lib/metrics.mjs), aggregated overall and by
//    category. No model involved.
//
// 2. JUDGE PACKETS. For every scenario completed on BOTH arms, a packet in
//    <run>/judging/<id>.json holding the persona, the expected properties
//    and the two transcripts as "A" and "B". Which arm is A is decided by a
//    hash of the scenario id and a per-run salt, and recorded only in
//    <run>/key.json — which judges are never given. A judge (a separate
//    agent, or a person) writes <run>/judgments/<id>.json (format below).
//
// 3. REPORT. Judgments are un-blinded with the key and aggregated with the
//    metrics into <run>/report.json and <run>/report.md: win rates overall
//    and by category, per-property pass rates, scenario-level ratings, and
//    every scenario where Core 4 LOST, listed — negative results are the
//    point of running this.
//
// Judgment format (<run>/judgments/<id>.json):
//   { "scenario": "<id>",
//     "turns": [ { "session": 1, "turn": 1,
//                  "A": { "<property>": true|false|null, ... },
//                  "B": { ... },
//                  "better": "A"|"B"|"tie", "margin": 1|2|3, "why": "..." } ],
//     "overall": { "better": "A"|"B"|"tie", "margin": 1|2|3,
//                  "scores": { "A": { "helpfulness":1-5, "agency":1-5, "peer":1-5, "friction":1-5 }, "B": {...} },
//
//    ALL FOUR SCALES RUN THE SAME WAY: 5 IS BEST, 1 IS WORST. That sentence
//    has to be here because it was not, and the cost was real. The four names
//    were shipped with no direction given anywhere — not here, not in the
//    judge brief, not in the docs — and "friction" reads naturally in both
//    directions ("how much friction?" vs "how good on friction?"). The judge
//    cohorts split: in runs 4-6 the scenario winner scored the LOWER friction
//    number (12-8, 10-4, 7-2), in runs 7-9 the HIGHER one (2-4, 1-6, 1-3). So
//    the axis silently reversed between run 6 and run 7 and every cross-run
//    friction comparison before this line is meaningless. helpfulness, agency
//    and peer were never ambiguous and are unaffected.
//      helpfulness  5 = everything that would change what they do, said once
//      agency       5 = the judgment that was theirs stayed theirs
//      peer         5 = talks to them as an equal who knows their own field
//      friction     5 = no cost they did not need to pay (no needless
//                       question, no lecture, no hunting for the answer);
//                       1 = made them work for what they should have been given
//                  "why": "..." } }
// Properties judged per turn: mustAnswer, alreadyConsidered, mustContribute,
// mustChallenge, mustReference, stance (whichever the turn's expect names),
// plus always: paternalistic, overreach, underhelp.

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCorpus } from './lib/corpus.mjs';
import { buildGraderLib } from './lib/build.mjs';
import { turnMetrics, aggregate } from './lib/metrics.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : acc), [])
);
const run = resolve(args.run || 'evals/core4/runs/scratch');
const libs = await buildGraderLib(join(run, '.build', 'grader'));
const q = await import(pathToFileURL(libs.questions).href);

const corpus = loadCorpus();
const byId = new Map(corpus.map((s) => [s.id, s]));
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const results = (arm) => {
  const dir = join(run, 'results', arm);
  if (!existsSync(dir)) return new Map();
  return new Map(readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f.replace(/\.json$/, ''), readJson(join(dir, f))]));
};
const core4 = results('core4');
// --vs picks the comparator arm: bplus (A2, primary) or baseline (A1).
const VS = String(args.vs || 'baseline');
// Each comparator has its own blinding key, packets and judgments.
const SUF = VS === 'baseline' ? '' : `-${VS}`;
const baseline = results(VS);

// ── 1. metrics ──────────────────────────────────────────────────────

function metricsFor(resMap) {
  const perTurn = [];
  for (const [id, r] of resMap) {
    const s = byId.get(id);
    for (const [si, sess] of r.sessions.entries()) {
      for (const [ti, t] of sess.turns.entries()) {
        perTurn.push({ id, category: s?.category ?? '?', session: si + 1, turn: ti + 1, m: turnMetrics(q, t.reply, t.expect), trace: t.trace });
      }
    }
  }
  return perTurn;
}
const mC = metricsFor(core4);
const mB = metricsFor(baseline);
// --exclude a,b: scenarios left out of the comparison, with the reason
// recorded in docs/CORE-4-EVALS.md (e.g. a player edited replies after use).
const EXCLUDE = new Set(String(args.exclude || '').split(',').map((x) => x.trim()).filter(Boolean));
const both = [...core4.keys()].filter((id) => baseline.has(id) && !EXCLUDE.has(id));
const inBoth = (ms) => ms.filter((x) => both.includes(x.id));

function byCategory(ms) {
  const cats = [...new Set(ms.map((x) => x.category))].sort();
  return Object.fromEntries(cats.map((c) => [c, aggregate(ms.filter((x) => x.category === c).map((x) => x.m))]));
}

// Core 4's own decisions, for the record: which moves, how often it held back, what the guard did.
function decisions(ms) {
  const count = (f) => ms.reduce((acc, x) => {
    const k = x.trace ? f(x.trace) : 'no-trace';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  return {
    moves: count((t) => t.decision?.type ?? t.trace?.intervention?.type ?? '?'),
    allocation: count((t) => t.allocation?.mode ?? '?'),
    withheld: count((t) => t.allocation?.withhold?.reason ?? 'none'),
    guard: count((t) => t.trace?.guard?.action ?? 'none'),
    regenerated: ms.filter((x) => x.trace?.trace?.guard?.regenerated).length,
    readerFailed: ms.filter((x) => x.trace && x.trace.trace?.state?.readOk === false).length,
  };
}

// ── 2. judge packets ────────────────────────────────────────────────

const keyFile = join(run, `key${SUF}.json`);
const key = existsSync(keyFile) ? readJson(keyFile) : { salt: randomBytes(8).toString('hex'), map: {} };
mkdirSync(join(run, `judging${SUF}`), { recursive: true });
for (const id of both) {
  if (!key.map[id]) {
    const h = createHash('sha256').update(key.salt + id).digest()[0];
    key.map[id] = h % 2 === 0 ? { A: 'core4', B: VS } : { A: VS, B: 'core4' };
  }
  const s = byId.get(id);
  const arms = { core4: core4.get(id), [VS]: baseline.get(id) };
  const side = (arm) => arms[arm].sessions.map((sess) => sess.turns.map((t) => ({ user: t.user, reply: t.reply })));
  const packet = {
    scenario: id,
    category: s.category,
    persona: s.persona,
    project: s.project ?? null,
    notes: s.notes ?? '',
    expect: s.sessions.map((sess) => sess.turns.map((t) => t.expect ?? null)),
    A: side(key.map[id].A),
    B: side(key.map[id].B),
  };
  writeFileSync(join(run, `judging${SUF}`, `${id}.json`), JSON.stringify(packet, null, 2));
}
writeFileSync(keyFile, JSON.stringify(key, null, 2));

// ── 3. report ───────────────────────────────────────────────────────

const judged = [];
// --judgments picks the judge: the model judge's dir by default, or a human
// rater's (human-pack.mjs exports an ARRAY of judgments per file).
const jdirName = String(args.judgments || `judgments${SUF}`);
const jdir = join(run, jdirName);
const judgmentFiles = existsSync(jdir)
  ? readdirSync(jdir).filter((x) => x.endsWith('.json')).flatMap((f) => {
      const raw = readJson(join(jdir, f));
      return (Array.isArray(raw) ? raw : [raw]).map((j) => ({ f, j }));
    })
  : [];
{
  for (const { f, j } of judgmentFiles) {
    const id = j.scenario ?? f.replace(/\.json$/, '');
    const map = key.map[id];
    if (!map) continue;
    const arm = (side) => (side === 'A' ? map.A : side === 'B' ? map.B : 'tie');
    judged.push({
      id,
      category: byId.get(id)?.category ?? '?',
      overall: { winner: arm(j.overall?.better), margin: j.overall?.margin ?? 1, why: j.overall?.why ?? '', scores: { [map.A]: j.overall?.scores?.A ?? {}, [map.B]: j.overall?.scores?.B ?? {} } },
      turns: (j.turns ?? []).map((t) => ({ session: t.session, turn: t.turn, winner: arm(t.better), margin: t.margin ?? 1, why: t.why ?? '', props: { [map.A]: t.A ?? {}, [map.B]: t.B ?? {} } })),
    });
  }
}

function winRates(items) {
  const n = items.length;
  const c = items.filter((x) => x.winner === 'core4').length;
  const b = items.filter((x) => x.winner === VS).length;
  return { n, core4: c, baseline: b, tie: n - c - b, core4Rate: n ? c / n : null, baselineRate: n ? b / n : null };
}
function propRates(arm) {
  const out = {};
  for (const j of judged) for (const t of j.turns) {
    for (const [p, v] of Object.entries(t.props[arm] ?? {})) {
      if (v === null || v === undefined) continue;
      out[p] ??= { yes: 0, of: 0 };
      out[p].of++;
      if (v === true) out[p].yes++;
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { ...v, rate: v.yes / v.of }]));
}
function meanScores(arm) {
  const keys = ['helpfulness', 'agency', 'peer', 'friction'];
  return Object.fromEntries(keys.map((k) => {
    const vs = judged.map((j) => j.overall.scores[arm]?.[k]).filter((v) => typeof v === 'number');
    return [k, vs.length ? vs.reduce((a, v) => a + v, 0) / vs.length : null];
  }));
}

const cats = [...new Set(judged.map((j) => j.category))].sort();
const report = {
  run,
  generatedAt: new Date().toISOString(),
  completed: { core4: core4.size, baseline: baseline.size, both: both.length, judged: judged.length, corpus: corpus.length, excluded: [...EXCLUDE] },
  metrics: {
    core4: aggregate(inBoth(mC).map((x) => x.m)),
    baseline: aggregate(inBoth(mB).map((x) => x.m)),
    byCategory: { core4: byCategory(inBoth(mC)), baseline: byCategory(inBoth(mB)) },
  },
  core4Decisions: decisions(inBoth(mC)),
  judged: {
    scenarios: winRates(judged.map((j) => j.overall)),
    turns: winRates(judged.flatMap((j) => j.turns)),
    byCategory: Object.fromEntries(cats.map((c) => [c, winRates(judged.filter((j) => j.category === c).map((j) => j.overall))])),
    properties: { core4: propRates('core4'), baseline: propRates(VS) },
    scores: { core4: meanScores('core4'), baseline: meanScores(VS) },
  },
  losses: judged.filter((j) => j.overall.winner === VS).map((j) => ({ id: j.id, category: j.category, margin: j.overall.margin, why: j.overall.why })),
  wins: judged.filter((j) => j.overall.winner === 'core4').map((j) => ({ id: j.id, category: j.category, margin: j.overall.margin, why: j.overall.why })),
};
const suffix = jdirName === `judgments${SUF}` ? SUF : `.${jdirName.replace(/[^a-z0-9-]+/gi, '-')}`;
report.comparator = VS;
report.judge = jdirName;
writeFileSync(join(run, `report${suffix}.json`), JSON.stringify(report, null, 2));

// Markdown, for docs/CORE-4-EVALS.md.
const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
const num = (x, d = 2) => (x === null || x === undefined ? '—' : Number(x).toFixed(d));
const md = [];
md.push(`# Core 4 vs baseline — ${report.completed.judged} judged scenarios`, '');
md.push(`Completed: Core 4 ${report.completed.core4}, baseline ${report.completed.baseline}, both ${report.completed.both}, judged ${report.completed.judged} (corpus ${report.completed.corpus}).`, '');
md.push('## Deterministic metrics (scenarios completed on both arms)', '', '| | Core 4 | Baseline |', '|---|---|---|');
const M = report.metrics;
for (const [label, f] of [
  ['questions per reply', (a) => num(a.questionsPerReply)],
  ['replies with any question', (a) => pct(a.repliesWithAnyQuestion)],
  ['replies ending in a question', (a) => pct(a.endsWithQuestion)],
  ['disguised questions per reply', (a) => num(a.disguisedPerReply)],
  ['replies with a closing offer', (a) => pct(a.offers)],
  ['sycophantic openers', (a) => pct(a.sycophantic)],
  ['mean words per reply', (a) => num(a.words, 0)],
  ['withheld-answer leaks (mustNotReveal)', (a) => String(a.revealViolations)],
]) md.push(`| ${label} | ${f(M.core4)} | ${f(M.baseline)} |`);
for (const c of new Set([...Object.keys(M.core4.checks), ...Object.keys(M.baseline.checks)])) {
  const a = M.core4.checks[c], b = M.baseline.checks[c];
  md.push(`| expect.${c} met | ${a ? `${a.passed}/${a.of}` : '—'} | ${b ? `${b.passed}/${b.of}` : '—'} |`);
}
md.push('', '## Blind pairwise judgments', '');
const W = report.judged;
md.push(`Scenarios: Core 4 preferred ${W.scenarios.core4}, baseline preferred ${W.scenarios.baseline}, tie ${W.scenarios.tie} (n=${W.scenarios.n}).`);
md.push(`Turns: Core 4 ${W.turns.core4}, baseline ${W.turns.baseline}, tie ${W.turns.tie} (n=${W.turns.n}).`, '');
md.push('| category | n | Core 4 | baseline | tie |', '|---|---|---|---|---|');
for (const [c, w] of Object.entries(W.byCategory)) md.push(`| ${c} | ${w.n} | ${w.core4} | ${w.baseline} | ${w.tie} |`);
md.push('', '| property (judge) | Core 4 | Baseline |', '|---|---|---|');
for (const p of new Set([...Object.keys(W.properties.core4), ...Object.keys(W.properties.baseline)])) {
  const a = W.properties.core4[p], b = W.properties.baseline[p];
  md.push(`| ${p} | ${a ? `${a.yes}/${a.of} (${pct(a.rate)})` : '—'} | ${b ? `${b.yes}/${b.of} (${pct(b.rate)})` : '—'} |`);
}
md.push('', '| mean score (1–5) | Core 4 | Baseline |', '|---|---|---|');
for (const k of ['helpfulness', 'agency', 'peer', 'friction']) md.push(`| ${k} | ${num(W.scores.core4[k])} | ${num(W.scores.baseline[k])} |`);
md.push('', '## Where the baseline won', '');
for (const l of report.losses) md.push(`- **${l.id}** (${l.category}, margin ${l.margin}): ${l.why}`);
if (!report.losses.length) md.push('- none');
writeFileSync(join(run, `report${suffix}.md`), md.join('\n') + '\n');

process.stdout.write(JSON.stringify({ completed: report.completed, scenarios: W.scenarios, packets: both.length, report: join(run, `report${suffix}.md`) }) + '\n');
