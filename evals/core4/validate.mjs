#!/usr/bin/env node
// E17 / E18: do the two measuring stages actually measure anything?
//
//   node evals/core4/validate.mjs --which ablation --run <dir>
//   node evals/core4/validate.mjs --which claims   --run <dir>
//   node evals/core4/validate.mjs --which ablation --run <dir> --report
//
// WHY THIS EXISTS SEPARATELY FROM grade.mjs. grade.mjs asks "is the reply
// better". This asks the prior question: "is the measurement CORRECT". A
// mechanism that produces confident wrong findings is worse than one that
// produces nothing, because a wrong finding carries the authority of a
// measurement — "your conclusion rests on X" is not a suggestion, it is a
// claim about their reasoning, and being wrong about it is expensive.
//
// So this runs the real functions (lib/core4/counterfactual.ts,
// lib/core4/calibration.ts) against LABELLED items whose ground truth was
// written and then adversarially reviewed, and reports confusion matrices
// rather than win rates.
//
// STEPWISE, LIKE EVERY OTHER RUN. There is no API key here, so completions
// come from outside the process (evals/core4/lib/clients.mjs). That has a
// consequence worth stating loudly and repeating in the write-up:
//
//   THE STAND-IN IS FRONTIER-GRADE; PRODUCTION RUNS THESE ON gpt-4o-mini.
//
// Every number this produces is therefore an UPPER BOUND on the shipped
// mechanism's accuracy. If it fails here it certainly fails in production;
// if it passes here that is necessary and not sufficient.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildGraderLib } from './lib/build.mjs';
import { stepwiseClient } from './lib/clients.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : a), [])
);
const which = args.which || 'ablation';
const runDir = resolve(args.run || `evals/core4/runs/validate-${which}`);
const REPEATS = Number(args.repeats || 3);
// --live runs the calls against the REAL provider on the model Core 4 ships
// with, which is the only way to turn every number in this file from an upper
// bound into a measurement. --limit takes the first N labelled items, so a
// targeted production check costs a few dollars rather than a few hundred.
const LIVE = !!args.live;
const LIMIT = args.limit ? Number(args.limit) : null;
const MODEL = args.model || null;
const say = (o) => process.stdout.write(JSON.stringify(o) + '\n');
mkdirSync(runDir, { recursive: true });

const here = new URL('.', import.meta.url).pathname;
const labelled = (f) => JSON.parse(readFileSync(join(here, 'labelled', f), 'utf8'));

// Build the modules under test the same way the grader builds its libs.
const libs = await buildGraderLib(join(runDir, '.build'));
const load = async (name) => import(pathToFileURL(join(runDir, '.build', `${name}.mjs`)).href);

// A COLLECTING client, not the pipeline's one-at-a-time stepwise client.
//
// `stepwiseClient` deliberately surfaces only the FIRST missing completion per
// replay, because in a real turn every later call is computed from state the
// first one would have changed. Here that property does not hold: each
// labelled item is independent, and every ablation within an item is
// independent of the others. Using the one-at-a-time client would mean ~360
// sequential replays to validate one set, which is not a measurement anyone
// will run twice.
//
// So on a miss this records the request and returns a NEUTRAL answer that the
// mechanism's own discard rules throw away ("unclear", empty). Pass 1
// therefore completes end to end and writes every missing request at once;
// the answers are filled in; pass 2 reads them all from cache and computes the
// real report. Nothing about the mechanism under test is changed — it is the
// same functions, driven the same way.
const cacheDir = join(runDir, 'cache');
const pendingDir = join(runDir, 'pending');
mkdirSync(cacheDir, { recursive: true });
mkdirSync(pendingDir, { recursive: true });

const { createHash } = await import('node:crypto');
const keyOf = (req) =>
  `${which}.${req.role}-${createHash('sha256').update(JSON.stringify({ system: req.system, messages: req.messages })).digest('hex').slice(0, 20)}`;

const SAMPLES_WANTED = 5;
const missing = new Set();
let liveCalls = 0;
let liveTokens = 0;
let served = 0;
// INDEPENDENT SAMPLES NEED INDEPENDENT ANSWERS.
//
// Calibration makes N identical requests at temperature 1 and reads the
// SPREAD. Those requests hash to one key, so a naive cache returns the same
// answer N times, agreement is 1.0 by construction and nothing can ever
// split — the mechanism would score a perfect zero false-split rate while
// measuring nothing at all. That is the harness lying, not the mechanism
// working.
//
// So a cache entry for a sampled role may hold a JSON ARRAY of independent
// answers, and repeat calls on the same key walk it. That reproduces what
// temperature-1 sampling actually gives the mechanism in production.
const seenCount = new Map();
const step = {
  calls: [],
  pending: [],
  client: {
    async complete(req) {
      const k = keyOf(req);
      step.calls.push(k);
      const n = (seenCount.get(k) ?? 0);
      seenCount.set(k, n + 1);
      const hit = join(cacheDir, `${k}.txt`);
      if (existsSync(hit)) {
        served += 1;
        const raw = readFileSync(hit, 'utf8');
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return { text: JSON.stringify(parsed[n % parsed.length]) };
        } catch { /* a single answer, not an array */ }
        return { text: raw };
      }
      missing.add(k);
      const f = join(pendingDir, `${k}.json`);
      if (!existsSync(f)) {
        writeFileSync(f, JSON.stringify({
          key: k, role: req.role, json: !!req.json, system: req.system, messages: req.messages,
          answerTo: hit,
          ...(which === 'claims' ? { wants: `a JSON ARRAY of ${SAMPLES_WANTED} INDEPENDENT answers to this same question` } : {}),
        }, null, 2));
      }
      // Neutral: every mechanism under test discards this shape.
      return { text: JSON.stringify({ holds: 'unclear', instead: '', confidence: 0, answer: '', compatible: 'unclear', conflict: '' }) };
    },
    stream() { throw new Error('not used'); },
  },
};

// LIVE MODE. Real provider, real model, no stand-in and no cache: the numbers
// stop being an upper bound and start being the thing itself. Everything else
// in this file is unchanged, so a live report is directly comparable with a
// stepwise one.
if (LIVE) {
  if (!process.env.OPENAI_API_KEY) {
    say({ status: 'error', error: 'live mode needs OPENAI_API_KEY in the environment' });
    process.exit(1);
  }
  const { openAIClient } = await import(pathToFileURL(join(runDir, '.build', 'model.mjs')).href)
    .catch(async () => import('../../lib/core4/model.ts').catch(() => null)) ?? {};
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  step.client = {
    async complete(req) {
      const model = MODEL || req.model;
      const res = await openai.chat.completions.create({
        model,
        messages: [{ role: 'system', content: req.system }, ...req.messages],
        max_completion_tokens: req.maxTokens,
        temperature: req.temperature,
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      });
      liveCalls += 1;
      liveTokens += res.usage?.total_tokens ?? 0;
      return { text: res.choices?.[0]?.message?.content ?? '', served: res.model };
    },
    stream() { throw new Error('not used'); },
  };
}
globalThis.__socriaModelClient = step.client;

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

/** Wrap the stepwise client so one logical probe can be answered per item. */
const client = step.client;

// ── E17: counterfactual ablation ────────────────────────────────────
//
// For each labelled item, ablate EVERY premise and compare the mechanism's
// verdict against the label. Then repeat the whole thing REPEATS times to
// measure stability, and run the paraphrase variants to measure wording
// sensitivity.
async function ablation() {
  const { buildProblem } = await load('problem');
  const cf = await load('counterfactual');
  const set = labelled('ablation.json');
  const items = (LIMIT ? (set.items ?? set).slice(0, LIMIT) : (set.items ?? set));
  const paraSet = existsSync(join(here, 'labelled', 'ablation-paraphrase.json'))
    ? (labelled('ablation-paraphrase.json').variants ?? [])
    : [];

  const ST = { currentGoal: '', currentFocus: '', blockingUnknown: '', turn: 5 };
  const entry = (id, kind, text, turn) => ({
    id, conversationId: 'c1', projectId: null, userId: 'u', turn, kind, text,
    owner: 'user', stance: 'asserts', basis: 'quoted', quote: text, status: 'active',
    private: false, createdAt: 1, updatedAt: 1, revisions: [], confidence: 0.8, reason: '',
  });

  /** One item -> the mechanism's verdict per premise, by premise id. */
  const verdictsFor = async (item, tag) => {
    const entries = [
      entry('concl', 'decision', item.conclusion, 1),
      ...item.premises.map((p, i) => entry(p.id, 'claim', p.text, i + 2)),
    ];
    const p = buildProblem(entries, [], { ...ST, turn: item.premises.length + 2 }, { conversationId: 'c1', projectId: null });
    // Drive the real function, but force every premise to be probed rather
    // than letting `candidates()` pick — this measures VERDICT accuracy, not
    // candidate selection, which is measured separately below.
    // Drive ONE ablation per premise directly, so this measures VERDICT
    // accuracy. Candidate SELECTION is a separate mechanism with its own
    // failure mode (it used to filter to premises the reader had already
    // flagged, which meant it never probed a plain stated fact) and is
    // measured separately below.
    const allText = item.premises.map((x) => x.text);
    const got = {};
    for (const prem of item.premises) {
      const item2 = p.live.find((x) => x.id === prem.id);
      const a = item2 ? await cf.ablateOne(client, item.conclusion, allText, item2) : null;
      got[prem.id] = a ? a.dependence : 'unclear';
    }
    return got;
  };

  const rows = [];
  for (const item of items) {
    const runs = [];
    for (let r = 0; r < REPEATS; r++) runs.push(await verdictsFor(item, `${item.id}#${r}`));
    rows.push({ id: item.id, item, runs });
  }

  // Confusion, on the FIRST run (the one a user would get).
  let tp = 0, fp = 0, tn = 0, fn = 0, abstain = 0;
  const misses = [];
  for (const { item, runs } of rows) {
    for (const prem of item.premises) {
      const v = runs[0][prem.id];
      if (v === 'unclear') { abstain += 1; continue; }
      const said = v === 'load_bearing';
      if (said && prem.loadBearing) tp += 1;
      else if (said && !prem.loadBearing) { fp += 1; misses.push({ id: item.id, premise: prem.id, kind: 'false positive', text: prem.text, why: prem.why }); }
      else if (!said && prem.loadBearing) { fn += 1; misses.push({ id: item.id, premise: prem.id, kind: 'false negative', text: prem.text, why: prem.why }); }
      else tn += 1;
    }
  }

  // STABILITY IS NOT MEASURABLE HERE, and reporting it would be a lie.
  //
  // The stand-in's answers are cached by a hash of the request, so repeating
  // an IDENTICAL input returns the identical cached answer by construction —
  // 219 distinct answers served 441 calls in the first run, and "stability
  // 100%" was an artifact of that, not a property of the mechanism.
  //
  // It also happens not to be the interesting question: the ablation runs at
  // temperature 0, so run-to-run variance on identical input is near zero by
  // design. The robustness that DOES matter is whether the verdict survives
  // the same content being worded differently, which the paraphrase set
  // measures against genuinely different requests.

  // Wording sensitivity: same meaning, different words, same verdict?
  let same = 0, flipped = 0;
  const flips = [];
  for (const v of paraSet) {
    const base = rows.find((r) => r.id === v.of);
    if (!base) continue;
    const got = await verdictsFor({ ...base.item, conclusion: v.conclusion, premises: v.premises.map((x) => ({ ...x, loadBearing: base.item.premises.find((q) => q.id === x.id)?.loadBearing })) }, `${v.of}#para`);
    for (const prem of v.premises) {
      if (got[prem.id] === base.runs[0][prem.id]) same += 1;
      else { flipped += 1; flips.push({ of: v.of, premise: prem.id, was: base.runs[0][prem.id], now: got[prem.id] }); }
    }
  }

  // CANDIDATE SELECTION, measured separately: of the genuinely load-bearing
  // premises, how many would the live pipeline even put to a call?
  let selectable = 0, selectedLB = 0, totalLB = 0;
  for (const { item } of rows) {
    const entries = [
      entry('concl', 'decision', item.conclusion, 1),
      ...item.premises.map((q, i) => entry(q.id, 'claim', q.text, i + 2)),
    ];
    const pm = buildProblem(entries, [], { ...ST, turn: item.premises.length + 2 }, { conversationId: 'c1', projectId: null });
    const target = cf.targetOf(pm);
    const chosen = target ? cf.candidates(pm, target).map((x) => x.id) : [];
    selectable += chosen.length;
    for (const q of item.premises) {
      if (!q.loadBearing) continue;
      totalLB += 1;
      if (chosen.includes(q.id)) selectedLB += 1;
    }
  }

  const decided = tp + fp + tn + fn;
  const report = {
    which: 'E17 ablation',
    items: items.length,
    premisesJudged: decided + abstain,
    abstained: abstain,
    abstainRate: pct(abstain, decided + abstain),
    confusion: { tp, fp, tn, fn },
    precision: pct(tp, tp + fp),
    recall: pct(tp, tp + fn),
    falsePositiveRate: pct(fp, fp + tn),
    selection: { probedPerItem: Math.round((selectable / rows.length) * 10) / 10, loadBearingReachable: pct(selectedLB, totalLB), totalLoadBearing: totalLB },
    stability: 'not measured — see the note in validate.mjs; identical inputs are cache-identical here, and the mechanism runs at temperature 0',
    wording: { same, flipped, stableRate: pct(same, same + flipped) },
    misses: misses.slice(0, 20),
    flips: flips.slice(0, 20),
    calls: step.calls.length,
    live: LIVE ? { calls: liveCalls, totalTokens: liveTokens, model: MODEL || 'per-call default (COGNITION_MODEL)' } : null,
    note: LIVE
      ? 'LIVE: real provider, real shipping model. These are measurements, not upper bounds.'
      : 'Stand-in model is frontier-grade; production runs gpt-4o-mini. These are UPPER BOUNDS.',
  };
  writeFileSync(join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  return report;
}

// ── E18: sampled disagreement ───────────────────────────────────────
//
// The question is NOT "does it split". It is whether splitting tracks genuine
// contestedness rather than sampling noise. So: settled claims must not
// split (manufactured doubt is the failure that matters) and contested ones
// should.
async function claims() {
  const { buildProblem } = await load('problem');
  const cal = await load('calibration');
  const set = labelled('claims.json');
  const items = LIMIT ? (set.items ?? set).slice(0, LIMIT) : (set.items ?? set);
  const ST = { currentGoal: '', currentFocus: '', blockingUnknown: '', turn: 2 };
  const entry = (text) => ({
    id: 'c1', conversationId: 'c1', projectId: null, userId: 'u', turn: 1, kind: 'conclusion',
    text, owner: 'user', stance: 'asserts', basis: 'quoted', quote: text, status: 'active',
    private: false, createdAt: 1, updatedAt: 1, revisions: [], confidence: 0.8, reason: '',
  });

  const rows = [];
  for (const it of items) {
    const p = buildProblem([entry(it.claim)], [], ST, { conversationId: 'c1', projectId: null });
    const runs = [];
    for (let r = 0; r < REPEATS; r++) {
      const got = await cal.calibrate('k', p, it.context ?? '', client);
      runs.push(got ? { split: got.split, agreement: got.agreement, clusters: got.clusters.length } : null);
    }
    rows.push({ id: it.id, truth: it.truth, runs });
  }

  let tp = 0, fp = 0, tn = 0, fn = 0, nulls = 0;
  const wrong = [];
  for (const r of rows) {
    const first = r.runs[0];
    if (!first) { nulls += 1; continue; }
    const contested = r.truth === 'contested';
    if (first.split && contested) tp += 1;
    else if (first.split && !contested) { fp += 1; wrong.push({ id: r.id, kind: 'manufactured doubt', agreement: first.agreement }); }
    else if (!first.split && contested) { fn += 1; wrong.push({ id: r.id, kind: 'missed contest', agreement: first.agreement }); }
    else tn += 1;
  }

  let stable = 0, unstable = 0;
  for (const r of rows) {
    const vs = r.runs.filter(Boolean).map((x) => x.split);
    if (!vs.length) continue;
    (new Set(vs).size === 1 ? (stable += 1) : (unstable += 1));
  }

  const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
  const agreeSettled = mean(rows.filter((r) => r.truth === 'settled' && r.runs[0]).map((r) => r.runs[0].agreement));
  const agreeContested = mean(rows.filter((r) => r.truth === 'contested' && r.runs[0]).map((r) => r.runs[0].agreement));

  const report = {
    which: 'E18 sampled disagreement',
    items: items.length,
    unanswered: nulls,
    confusion: { tp, fp, tn, fn },
    falseSplitRate: pct(fp, fp + tn),
    contestedDetection: pct(tp, tp + fn),
    separation: { meanAgreementSettled: agreeSettled, meanAgreementContested: agreeContested },
    stability: { stable, unstable, rate: pct(stable, stable + unstable), repeats: REPEATS },
    wrong: wrong.slice(0, 20),
    calls: step.calls.length,
    live: LIVE ? { calls: liveCalls, totalTokens: liveTokens, model: MODEL || 'per-call default (COGNITION_MODEL)' } : null,
    note: LIVE
      ? 'LIVE: real provider, real shipping model. These are measurements, not upper bounds.'
      : 'Stand-in model is frontier-grade; production runs gpt-4o-mini. These are UPPER BOUNDS.',
  };
  writeFileSync(join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  return report;
}

try {
  const report = which === 'claims' ? await claims() : await ablation();
  if (missing.size) {
    say({ status: 'pending', answered: served, missing: missing.size, pendingDir, note: 'Answer the files in pendingDir, then run again for the real report.' });
  } else {
    say({ status: 'done', report: join(runDir, 'report.json'), ...report });
  }
} catch (e) {
  say({ status: 'error', error: String(e && e.stack ? e.stack : e), missing: missing.size });
  process.exit(1);
}
