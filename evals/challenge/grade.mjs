#!/usr/bin/env node
// evals/challenge/grade.mjs — grade a challenge benchmark run (docs/LOGOS-6-PLAN.md §7.B).
//
//   node evals/challenge/grade.mjs --run evals/challenge/runs/<dir>
//   node evals/challenge/grade.mjs --run <dir> --judgments <dir>/judgments
//
// 1. DETERMINISTIC, for every system:
//    recall        a planted flaw is found when one finding names at least two of its keys, or one key while quoting
//                  the words the flaw lives in
//    false alarms  findings on the sound cases; "holds up" when there are none
//    quotes        Logos 6's quotes re-checked against the case (must be 100%: the gate is supposed to guarantee it)
//    generic       findings that are stock phrases ("consider other perspectives", "more research is needed")
// 2. JUDGE PACKETS: <run>/judging/<case>.json — the case and every system's findings, shuffled and labelled X/Y/Z by a
//    salted hash recorded only in <run>/key.json. A rater marks each finding "new" (real, and not something the
//    person had already said), "known" (real, but already theirs) or "wrong", and writes <run>/judgments/<case>.json:
//      { "case": "<id>", "ratings": { "X": ["new","wrong",…], "Y": […], "Z": […] } }
// 3. REPORT: <run>/report.md and report.json — the numbers per system, the plan's gates, and every case where Logos 6
//    missed a flaw the plain prompt found or raised one on sound work: negative results are the point.
//
// THE GATES before any user sees the challenge (plan §7.B): 100% valid quotes; precision ≥ 0.8; under 10% wrong;
// H1 — recall no lower than the plain prompt's, precision at least 15 points higher; H3 — "holds up" on at least half
// the sound cases, at most one finding per sound case on average. Precision and "wrong" need judgments.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const RUN = opt('--run');
if (!RUN || !existsSync(RUN)) {
  console.error('usage: node evals/challenge/grade.mjs --run <run dir> [--judgments <dir>]');
  process.exit(1);
}
const JUDG = opt('--judgments') ?? join(RUN, 'judgments');
const cases = new Map(JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8')).cases.map((c) => [c.id, c]));
const results = readdirSync(RUN).filter((f) => /^[a-z]{3,4}-\d{2}\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(RUN, f), 'utf8')));

const norm = (s) => String(s ?? '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\p{L}\p{N}\s'%.-]/gu, ' ').replace(/\s+/g, ' ').trim();
const GENERIC = /\b(?:more research (?:is|may be) needed|further research|consider (?:other|different|alternative|multiple) (?:perspectives|viewpoints|angles|options)|(?:it|this) (?:all )?depends on (?:the )?(?:context|situation|circumstances)|there (?:may|might|could) be (?:other|some) factors|could be biased|think (?:more )?(?:carefully|critically) about)\b/i;

function finds(flaw, finding) {
  const text = norm([finding.text, ...(finding.anchors ?? []).map((a) => a.quote)].join(' '));
  const hits = flaw.keys.filter((k) => text.includes(norm(k))).length;
  const quotesIt = (finding.anchors ?? []).some((a) => norm(flaw.quote).includes(norm(a.quote)) || norm(a.quote).includes(norm(flaw.quote)));
  return hits >= 2 || (hits >= 1 && quotesIt);
}

function quoteHolds(c, a) {
  const hay = norm([...c.said, ...(c.sources ?? []).map((s) => s.text), ...((c.map?.nodes ?? []).map((n) => n.label))].join('\n'));
  return String(a.quote ?? '')
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map(norm)
    .filter((p) => p.length >= 4)
    .every((p) => hay.includes(p));
}

const SYSTEMS = ['logos6', 'plain', 'logos55'];
const stat = Object.fromEntries(SYSTEMS.map((s) => [s, { planted: 0, found: 0, findingsPlanted: 0, matched: 0, sound: 0, soundFindings: 0, held: 0, quotes: 0, quotesOk: 0, generic: 0, findings: 0, errors: 0 }]));
const misses = [];
for (const r of results) {
  const c = cases.get(r.id);
  if (!c) continue;
  for (const s of SYSTEMS) {
    const sys = r.systems?.[s];
    if (!sys) continue;
    const st = stat[s];
    if (sys.error) {
      st.errors++;
      continue;
    }
    const fs = sys.findings ?? [];
    st.findings += fs.length;
    st.generic += fs.filter((f) => GENERIC.test(f.text)).length;
    for (const f of fs) for (const a of f.anchors ?? []) {
      st.quotes++;
      if (quoteHolds(c, a)) st.quotesOk++;
    }
    if (c.sound) {
      st.sound++;
      st.soundFindings += fs.length;
      if (!fs.length) st.held++;
    } else {
      st.planted += c.flaws.length;
      st.findingsPlanted += fs.length;
      for (const flaw of c.flaws) {
        const hit = fs.some((f) => finds(flaw, f));
        if (hit) st.found++;
        else if (s === 'logos6' && (r.systems.plain?.findings ?? []).some((f) => finds(flaw, f))) misses.push(`${c.id} ${flaw.id} (${flaw.kind}): the plain prompt found “${flaw.what}”; Logos 6 did not`);
      }
      st.matched += fs.filter((f) => c.flaws.some((flaw) => finds(flaw, f))).length;
    }
  }
  if ((r.systems?.logos6?.findings ?? []).length && c.sound) misses.push(`${c.id}: Logos 6 raised ${r.systems.logos6.findings.length} finding(s) on sound work`);
}

// ── judge packets: blind, shuffled per case by a salted hash, the key kept apart ─────────────────────────────────
mkdirSync(join(RUN, 'judging'), { recursive: true });
const salt = existsSync(join(RUN, 'key.json')) ? JSON.parse(readFileSync(join(RUN, 'key.json'), 'utf8')).salt : createHash('sha256').update(`${RUN}:${Date.now()}`).digest('hex').slice(0, 12);
const key = { salt, cases: {} };
for (const r of results) {
  const c = cases.get(r.id);
  if (!c) continue;
  const present = SYSTEMS.filter((s) => r.systems?.[s] && !r.systems[s].error);
  const order = [...present].sort((a, b) => createHash('sha256').update(`${salt}:${r.id}:${a}`).digest('hex').localeCompare(createHash('sha256').update(`${salt}:${r.id}:${b}`).digest('hex')));
  const labels = ['X', 'Y', 'Z'];
  key.cases[r.id] = Object.fromEntries(order.map((s, i) => [labels[i], s]));
  const packet = {
    case: r.id,
    brief: 'Rate every finding: "new" = a real weakness the person had not already raised; "known" = real, but they had already said it; "wrong" = not a real weakness of THIS reasoning (invented, generic, contrarian, or false).',
    person: { said: c.said, map: c.map ?? null, sources: c.sources ?? [] },
    findings: Object.fromEntries(order.map((s, i) => [labels[i], (r.systems[s].findings ?? []).map((f) => f.text)])),
  };
  writeFileSync(join(RUN, 'judging', `${r.id}.json`), JSON.stringify(packet, null, 2));
}
writeFileSync(join(RUN, 'key.json'), JSON.stringify(key, null, 2));

// ── judgments, when there are any ───────────────────────────────────────────────────────────────────────────────
const judged = Object.fromEntries(SYSTEMS.map((s) => [s, { new: 0, known: 0, wrong: 0 }]));
let judgedCases = 0;
if (existsSync(JUDG)) {
  for (const f of readdirSync(JUDG).filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(join(JUDG, f), 'utf8'));
    const k = key.cases[j.case];
    if (!k || !j.ratings) continue;
    judgedCases++;
    for (const [label, ratings] of Object.entries(j.ratings)) {
      const s = k[label];
      if (!s) continue;
      for (const v of ratings) if (v === 'new' || v === 'known' || v === 'wrong') judged[s][v]++;
    }
  }
}

// ── the report ──────────────────────────────────────────────────────────────────────────────────────────────────
const pct = (a, b) => (b ? a / b : null);
const fmt = (v) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const rows = SYSTEMS.map((s) => {
  const st = stat[s];
  const j = judged[s];
  const rated = j.new + j.known + j.wrong;
  return {
    system: s,
    recall: pct(st.found, st.planted),
    matchedShare: pct(st.matched, st.findingsPlanted),
    holds: pct(st.held, st.sound),
    perSound: st.sound ? st.soundFindings / st.sound : null,
    quotes: pct(st.quotesOk, st.quotes),
    generic: pct(st.generic, st.findings),
    precision: rated ? (j.new + j.known) / rated : null,
    wrong: rated ? j.wrong / rated : null,
    errors: st.errors,
  };
});
const by = Object.fromEntries(rows.map((r) => [r.system, r]));
const L = by.logos6;
const P = by.plain;
const gates = [
  ['Every quote shown is real (100%)', L.quotes === null ? null : L.quotes === 1],
  ['Precision ≥ 0.8 (judged)', L.precision === null ? null : L.precision >= 0.8],
  ['Under 10% wrong (judged)', L.wrong === null ? null : L.wrong < 0.1],
  ['H1: recall no lower than the plain prompt', L.recall === null || P.recall === null ? null : L.recall >= P.recall],
  ['H1: precision ≥ 15 points above the plain prompt (judged)', L.precision === null || P.precision === null ? null : L.precision - P.precision >= 0.15],
  ['H3: holds up on at least half the sound cases', L.holds === null ? null : L.holds >= 0.5],
  ['H3: at most one finding per sound case on average', L.perSound === null ? null : L.perSound <= 1],
];
const md = [
  `# Challenge benchmark — ${RUN.split('/').pop()}`,
  '',
  `${results.length} cases; ${judgedCases} judged.`,
  '',
  '| System | Recall | Findings on a planted flaw | Holds up (sound) | Findings per sound case | Quotes real | Generic | Precision (judged) | Wrong (judged) | Errors |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.system} | ${fmt(r.recall)} | ${fmt(r.matchedShare)} | ${fmt(r.holds)} | ${r.perSound === null ? '—' : r.perSound.toFixed(2)} | ${fmt(r.quotes)} | ${fmt(r.generic)} | ${fmt(r.precision)} | ${fmt(r.wrong)} | ${r.errors} |`),
  '',
  '## The gates (docs/LOGOS-6-PLAN.md §7.B)',
  '',
  ...gates.map(([g, v]) => `- ${v === null ? 'NOT YET MEASURED' : v ? 'PASS' : 'FAIL'} — ${g}`),
  '',
  '## Where Logos 6 lost',
  '',
  ...(misses.length ? misses.map((m) => `- ${m}`) : ['- Nowhere, on this run.']),
  '',
  'Recall here is lexical — a finding counts when it names the flaw’s keys — so it undercounts paraphrase. The judged columns are the ones that decide.',
].join('\n');
writeFileSync(join(RUN, 'report.md'), md);
writeFileSync(join(RUN, 'report.json'), JSON.stringify({ rows, gates: gates.map(([g, v]) => ({ gate: g, pass: v })), misses, judgedCases }, null, 2));
console.log(md);
