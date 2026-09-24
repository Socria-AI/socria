#!/usr/bin/env node
// UNIQUE USEFUL CONTRIBUTION RATE.
//
//   node evals/core4/uucr.mjs --run <dir>              build the judge packets
//   node evals/core4/uucr.mjs --run <dir> --report     score the judgments
//
// WHY A NEW METRIC AND NOT ANOTHER WIN RATE. Nine runs of blind pairwise
// preference produced a number that moved with reply length and told us almost
// nothing about whether the architecture had earned its place — the judges
// preferred whichever side wrote more substance, and both sides usually found
// the same substance. "Which reply is better" is the wrong question when the
// thing being tested is whether one side can find something the other cannot.
//
// So this counts CONTRIBUTIONS, not replies. A contribution is one specific,
// non-obvious, load-bearing point about the person's problem. The judge
// enumerates them per arm BEFORE comparing, then matches them across arms. The
// score is the count that appears in exactly one arm and would change what the
// person does.
//
//   UUCR(arm) = unique useful contributions by that arm / total turns
//
// THE ENUMERATE-THEN-MATCH ORDER IS THE WHOLE DESIGN. A judge shown two
// replies and asked "what did A find that B missed" reads B looking for
// absences, and absence is easy to imagine. A judge who lists A's points, then
// lists B's points, then matches them, has committed to both lists before
// either can be contaminated by the other. Same reason the arms are blind.
//
// THREE ARMS, because two cannot separate the two hypotheses that matter:
//   prompt   — the strongest Human-First prompt, same model
//   full     — Core 4 as it ships
//   ablated  — Core 4 with the mechanism under test switched off
// full > prompt says Core 4 helps. full > ablated says THE MECHANISM helps.
// Only the second is evidence about the architecture, and a mechanism that
// clears the first while failing the second is riding on the prompt.

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadCorpus } from './lib/corpus.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : a), [])
);
const run = resolve(args.run || 'evals/core4/runs/uucr');
const ARMS = String(args.arms || 'prompt,full,ablated').split(',').map((s) => s.trim());
const say = (o) => process.stdout.write(JSON.stringify(o) + '\n');

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const corpus = new Map(loadCorpus().map((s) => [s.id, s]));

/** results/<arm>/<scenario>.json, whatever the arm is called on disk. */
function armResults(arm) {
  const dir = join(run, 'results', arm);
  if (!existsSync(dir)) return new Map();
  return new Map(readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f.replace(/\.json$/, ''), readJson(join(dir, f))]));
}

const turnsOf = (r) => [].concat(...(r.sessions ?? []).map((s) => (s.turns ?? []).map((t) => ({ user: t.user, reply: t.reply }))));

// ── packets ─────────────────────────────────────────────────────────
//
// Arms are relabelled per scenario under a per-run salt, so a judge cannot
// learn "X is always Core 4" across packets, and the key never reaches them.
function build() {
  const byArm = new Map(ARMS.map((a) => [a, armResults(a)]));
  const present = ARMS.filter((a) => byArm.get(a).size);
  if (present.length < 2) {
    say({ status: 'error', error: `need at least two arms with results; found ${present.join(',') || 'none'}` });
    process.exit(1);
  }
  const ids = [...byArm.get(present[0]).keys()].filter((id) => present.every((a) => byArm.get(a).has(id)));
  const salt = existsSync(join(run, 'key.json')) ? readJson(join(run, 'key.json')).salt : randomBytes(8).toString('hex');
  const map = {};
  mkdirSync(join(run, 'judging'), { recursive: true });
  mkdirSync(join(run, 'judgments'), { recursive: true });

  for (const id of ids) {
    // Deterministic shuffle from (salt, scenario): reproducible, unguessable.
    const order = present
      .map((a) => ({ a, h: createHash('sha256').update(`${salt}:${id}:${a}`).digest('hex') }))
      .sort((x, y) => (x.h < y.h ? -1 : 1))
      .map((x) => x.a);
    const labels = ['A', 'B', 'C', 'D'].slice(0, order.length);
    map[id] = Object.fromEntries(order.map((a, i) => [labels[i], a]));

    const sc = corpus.get(id) ?? {};
    const packet = {
      scenario: id,
      persona: sc.persona ?? '',
      notes: sc.notes ?? '',
      turns: turnsOf(byArm.get(order[0]).get(id)).map((t, i) => ({
        turn: i + 1,
        user: t.user,
        ...Object.fromEntries(order.map((a, j) => [labels[j], (turnsOf(byArm.get(a).get(id))[i] ?? {}).reply ?? ''])),
      })),
    };
    writeFileSync(join(run, 'judging', `${id}.json`), JSON.stringify(packet, null, 2));
  }
  writeFileSync(join(run, 'key.json'), JSON.stringify({ salt, map }, null, 2));
  say({ status: 'built', scenarios: ids.length, arms: present, packets: join(run, 'judging') });
}

// ── scoring ─────────────────────────────────────────────────────────
//
// Judgment shape (one file per scenario, written by a blind judge):
//   { "scenario": "...",
//     "turns": [ { "turn": 1,
//                  "contributions": [
//                    { "point": "...", "arms": ["A","C"], "useful": true,
//                      "wouldChangeWhatTheyDo": true, "obvious": false } ] } ] }
//
// `arms` lists EVERY arm that made the point, which is what makes a unique
// contribution countable rather than asserted.
function report() {
  const key = readJson(join(run, 'key.json'));
  const dir = join(run, 'judgments');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  if (!files.length) {
    say({ status: 'error', error: 'no judgments yet' });
    process.exit(1);
  }

  const tally = {};
  const bump = (arm, field, n = 1) => {
    tally[arm] ??= { turns: 0, unique: 0, uniqueDecisive: 0, shared: 0, manufactured: 0, obvious: 0 };
    tally[arm][field] += n;
  };
  const examples = [];
  let turns = 0;

  for (const f of files) {
    const j = readJson(join(dir, f));
    const m = key.map[j.scenario];
    if (!m) continue;
    const arms = Object.values(m);
    for (const t of j.turns ?? []) {
      turns += 1;
      for (const a of arms) bump(a, 'turns');
      for (const c of t.contributions ?? []) {
        const made = (c.arms ?? []).map((l) => m[l]).filter(Boolean);
        if (!made.length) continue;
        // Not useful, or obvious, is not a contribution — it is padding, and
        // counting it would reward volume exactly as the old metric did.
        if (c.useful === false) { for (const a of made) bump(a, 'manufactured'); continue; }
        if (c.obvious === true) { for (const a of made) bump(a, 'obvious'); continue; }
        if (made.length === 1) {
          bump(made[0], 'unique');
          if (c.wouldChangeWhatTheyDo) bump(made[0], 'uniqueDecisive');
          examples.push({ scenario: j.scenario, turn: t.turn, arm: made[0], point: c.point, decisive: !!c.wouldChangeWhatTheyDo });
        } else {
          for (const a of made) bump(a, 'shared');
        }
      }
    }
  }

  const rate = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
  const rows = Object.entries(tally).map(([arm, t]) => ({
    arm,
    turns: t.turns,
    uucr: rate(t.unique, t.turns),
    decisiveUucr: rate(t.uniqueDecisive, t.turns),
    unique: t.unique,
    uniqueDecisive: t.uniqueDecisive,
    shared: t.shared,
    manufactured: t.manufactured,
    obviousRejected: t.obvious,
  })).sort((a, b) => (b.uucr ?? 0) - (a.uucr ?? 0));

  const get = (a) => rows.find((r) => r.arm === a);
  const verdict = {
    // Does Core 4 beat the prompt at all?
    fullOverPrompt: get('full') && get('prompt') ? Math.round(((get('full').uucr ?? 0) - (get('prompt').uucr ?? 0)) * 10) / 10 : null,
    // Does the MECHANISM do it, or was it the prompt carrying the arm?
    mechanismContribution: get('full') && get('ablated') ? Math.round(((get('full').uucr ?? 0) - (get('ablated').uucr ?? 0)) * 10) / 10 : null,
  };

  const report = { scenarios: files.length, turns, rows, verdict, examples: examples.slice(0, 40) };
  writeFileSync(join(run, 'uucr.json'), JSON.stringify(report, null, 2));

  const md = [
    '# Unique Useful Contribution Rate', '',
    `${files.length} scenarios, ${turns} turns judged.`, '',
    '| arm | turns | UUCR | decisive UUCR | unique | shared | manufactured | rejected as obvious |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.arm} | ${r.turns} | ${r.uucr ?? '—'}% | ${r.decisiveUucr ?? '—'}% | ${r.unique} | ${r.shared} | ${r.manufactured} | ${r.obviousRejected} |`),
    '',
    `Core 4 over the prompt baseline: **${verdict.fullOverPrompt ?? '—'} points**.`,
    `Attributable to the mechanism (full − ablated): **${verdict.mechanismContribution ?? '—'} points**.`,
    '',
    'A mechanism that clears the first line and not the second is riding on the prompt.',
  ].join('\n');
  writeFileSync(join(run, 'uucr.md'), md);
  say({ status: 'done', ...verdict, rows, report: join(run, 'uucr.json') });
}

args.report ? report() : build();
