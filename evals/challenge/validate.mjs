#!/usr/bin/env node
// evals/challenge/validate.mjs — is the challenge benchmark's dataset what docs/LOGOS-6-PLAN.md §7.B says it is?
//
//   node evals/challenge/validate.mjs [cases.json]
//
// 80 cases: 15 with planted flaws in each of four segments (a student's essay or argument, a founder's plan or
// decision, a researcher's claim or method, a UX designer's research synthesis), 20 sound cases (5 per segment)
// with nothing planted, and at least 10 with documents, where the flaw — or the soundness — shows only against
// the source. Every planted flaw quotes, word for word, the words it lives in. Exits non-zero on any problem.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? join(here, 'cases.json');
const SEGMENTS = ['student', 'founder', 'researcher', 'designer'];
const KINDS = ['assumption', 'gap', 'unsupported', 'contradiction', 'evidence', 'risk', 'alternative', 'consequence'];
const TYPES = ['claim', 'assumption', 'evidence', 'decision', 'goal', 'constraint', 'question', 'idea', 'value', 'consequence', 'concept', 'belief', 'tension', 'counterpoint'];
const RELATIONS = ['supports', 'depends', 'conflicts', 'leads_to', 'relates', 'causes', 'applies_to'];
const norm = (s) => String(s ?? '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

const problems = [];
const bad = (id, why) => problems.push(`${id}: ${why}`);

let data;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`cannot read ${file}: ${e.message}`);
  process.exit(1);
}
const cases = Array.isArray(data?.cases) ? data.cases : [];
const ids = new Set();
const tally = Object.fromEntries(SEGMENTS.map((s) => [s, { planted: 0, sound: 0 }]));
let withDocs = 0;

for (const c of cases) {
  const id = c?.id ?? '(no id)';
  if (typeof c?.id !== 'string' || !/^[a-z]{3,4}-\d{2}$/.test(c.id)) bad(id, 'id must look like stu-01');
  if (ids.has(id)) bad(id, 'duplicate id');
  ids.add(id);
  if (!SEGMENTS.includes(c?.segment)) bad(id, `segment must be one of ${SEGMENTS.join(', ')}`);
  if (typeof c?.title !== 'string' || !c.title.trim()) bad(id, 'title missing');
  if (typeof c?.sound !== 'boolean') bad(id, 'sound must be true or false');
  const said = Array.isArray(c?.said) ? c.said : [];
  if (said.length < 2 || said.length > 4 || said.some((s) => typeof s !== 'string' || s.trim().length < 20)) bad(id, 'said must be 2–4 messages of the person’s own words');
  const words = said.join(' ').split(/\s+/).filter(Boolean).length;
  if (words < 40 || words > 320) bad(id, `said should be 40–320 words (has ${words})`);
  const map = c?.map ?? { nodes: [], edges: [] };
  const nodes = Array.isArray(map.nodes) ? map.nodes : [];
  const nodeIds = new Set(nodes.map((n) => n?.id));
  for (const n of nodes) {
    if (typeof n?.id !== 'string' || typeof n?.label !== 'string' || !TYPES.includes(n?.type)) bad(id, `map node ${JSON.stringify(n)} is not a card`);
  }
  for (const e of Array.isArray(map.edges) ? map.edges : []) {
    if (!nodeIds.has(e?.from) || !nodeIds.has(e?.to) || !RELATIONS.includes(e?.relation)) bad(id, `map edge ${JSON.stringify(e)} is not a line between cards`);
  }
  const sources = Array.isArray(c?.sources) ? c.sources : [];
  for (const s of sources) {
    if (typeof s?.key !== 'string' || !/^[A-Z]\d{1,4}\.\d{1,5}$/.test(s.key) || typeof s?.text !== 'string' || s.text.trim().length < 60) bad(id, `source ${s?.key} must have a key like A1.2 and a passage of 60+ characters`);
  }
  if (sources.length) withDocs++;
  const haystack = norm([...said, ...sources.map((s) => s.text), ...nodes.map((n) => n.label)].join('\n'));
  const flaws = Array.isArray(c?.flaws) ? c.flaws : [];
  if (c?.sound === true && flaws.length) bad(id, 'a sound case plants nothing');
  if (c?.sound === false && (flaws.length < 1 || flaws.length > 3)) bad(id, 'a planted case has 1–3 flaws');
  for (const f of flaws) {
    if (!KINDS.includes(f?.kind)) bad(id, `flaw kind ${f?.kind} is not one of ${KINDS.join(', ')}`);
    if (typeof f?.what !== 'string' || f.what.trim().length < 15) bad(id, 'each flaw says what it is, in a sentence');
    if (!Array.isArray(f?.keys) || f.keys.length < 2 || f.keys.length > 4 || f.keys.some((k) => typeof k !== 'string' || !k.trim())) bad(id, 'each flaw has 2–4 keys');
    if (typeof f?.quote !== 'string' || !haystack.includes(norm(f.quote))) bad(id, `flaw quote not found word for word: “${f?.quote}”`);
  }
  if (SEGMENTS.includes(c?.segment)) tally[c.segment][c.sound ? 'sound' : 'planted']++;
}

for (const s of SEGMENTS) {
  if (tally[s].planted !== 15) bad(s, `needs 15 planted cases (has ${tally[s].planted})`);
  if (tally[s].sound !== 5) bad(s, `needs 5 sound cases (has ${tally[s].sound})`);
}
if (cases.length !== 80) bad('dataset', `needs 80 cases (has ${cases.length})`);
if (withDocs < 10) bad('dataset', `needs at least 10 cases with documents (has ${withDocs})`);

if (problems.length) {
  console.log(problems.slice(0, 60).join('\n'));
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log(`ok: ${cases.length} cases, ${withDocs} with documents, ${SEGMENTS.map((s) => `${s} ${tally[s].planted}+${tally[s].sound}`).join(', ')}`);
