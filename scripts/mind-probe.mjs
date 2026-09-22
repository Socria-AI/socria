#!/usr/bin/env node
// scripts/mind-probe.mjs
//
// Watch the Mind Graph decide things.
//
// The suites assert the rules; this shows them happening. It exists because
// the behaviour that matters most is the behaviour you cannot see by chatting
// for five minutes: a trait is not believed until a SECOND conversation says
// it, a deleted claim has to stay deleted across later extractions, and a
// change of mind has to leave the prior belief standing rather than quietly
// overwrite it. Each of those takes two or three sessions to observe in the
// product, and they fail silently when they fail.
//
// So this drives the real modules — gate, apply, activate, serialize, the
// same files the route imports — with a scripted sequence standing in for the
// extractor, and prints the graph after every step. No database, no API key,
// no sign-in: if something here is wrong, it is wrong in the rules, and that
// is worth separating from "Supabase is not set up yet".
//
//   node scripts/mind-probe.mjs
//
// What it does NOT prove: that the extractor reads register correctly, that
// the rows persist, or that the route is wired up. Those need the live path —
// see the end of this file.

import { buildAll, OUT } from '../test/helpers/build.mjs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

await buildAll();
const load = (m) => import(pathToFileURL(join(OUT, m)).href);

const { EMPTY_GRAPH, fingerprintNode } = await load('types.mjs');
const { TURN_BUDGET } = await load('gate.mjs');
const { applyCandidates, forgetNode } = await load('apply.mjs');
const { activate } = await load('activate.mjs');
const { renderMindGraph } = await load('serialize.mjs');

// ── presentation ────────────────────────────────────────────────────

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

function step(n, title, conv) {
  console.log('');
  console.log(bold(`─── ${n}. ${title}`) + dim(`   [conversation ${conv}]`));
}

/** The reason each label was last refused for — the verdict checks the REASON,
 *  not merely the absence, because a claim can be absent for the wrong one. */
export const REFUSALS = {};

function show(graph, report) {
  for (const r of report.nodes) {
    const mark = r.action === 'created' ? green('+') : r.action === 'superseded' ? yellow('~') : dim('·');
    console.log(`   ${mark} ${r.action.padEnd(11)} ${r.label}`);
  }
  for (const r of report.refused) {
    REFUSALS[r.label] = r.reason;
    console.log(`   ${red('×')} ${'refused'.padEnd(11)} ${r.label}  ${dim(r.reason)}`);
  }
  if (!report.nodes.length && !report.refused.length) console.log(dim('   (nothing proposed)'));
  const held = graph.pending.map((p) => p.content.slice(0, 44));
  if (held.length) console.log(dim(`   pending: ${held.join(' | ')}`));
  console.log(
    dim(`   graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ` +
        `${graph.pending.length} pending, ${graph.tombstones.length} forgotten`)
  );
}

// ── the harness ─────────────────────────────────────────────────────

let seq = 0;
let clock = Date.parse('2026-01-06T09:00:00Z');
const minutes = (n) => { clock += n * 60_000; };

let graph = EMPTY_GRAPH;

/** One extraction: what the model would have proposed for one turn. */
function turn(title, conversationId, nodes, edges = []) {
  step(++stepNo, title, conversationId);
  const out = applyCandidates(graph, nodes, edges, {
    now: clock,
    nextId: () => `n${++seq}`,
    budget: TURN_BUDGET,
    provenance: { surface: 'chat', conversationId },
  });
  graph = out.graph;
  show(graph, out.report);
}
let stepNo = 0;

// ── the script ──────────────────────────────────────────────────────

console.log(bold('\nMind Graph probe') + dim('  — the rules, running, with no database behind them'));

turn('An occurrence: said once, recorded once', 'conv-A', [
  {
    type: 'Project', label: 'kelp forest thesis', kind: 'stated',
    content: 'Writing a thesis on kelp forest recovery after urchin barrens.',
    importance: 0.8, confidence: 0.9,
  },
  {
    type: 'Goal', label: 'submit by March', kind: 'stated',
    content: 'Wants the thesis submitted by March.',
    importance: 0.7, confidence: 0.85,
  },
], [
  { sourceLabel: 'submit by March', targetLabel: 'kelp forest thesis', relationship: 'relates_to', kind: 'stated' },
]);
console.log(dim('   ↳ expected: both land immediately. An event is not a personality claim.'));

minutes(4);
turn('A claim ABOUT the person: held back on first sighting', 'conv-A', [
  {
    type: 'Pattern', label: 'stalls when scope is open', kind: 'inferred',
    content: 'Tends to stall when the scope of a task is left open-ended.',
    importance: 0.6, confidence: 0.5,
  },
]);
console.log(dim('   ↳ expected: REFUSED, noted as pending. One remark is not evidence of a trait.'));

minutes(20);
turn('The same claim, same conversation: still not enough', 'conv-A', [
  {
    type: 'Pattern', label: 'stalls when scope is open', kind: 'inferred',
    content: 'Again stalls once the scope stops being fixed.',
    importance: 0.6, confidence: 0.55,
  },
]);
console.log(dim('   ↳ expected: still refused. One afternoon cannot corroborate itself.'));

clock += 3 * 86_400_000;
turn('A different day, a different conversation: now it is believed', 'conv-B', [
  {
    type: 'Pattern', label: 'stalls when scope is open', kind: 'inferred',
    content: 'Stalls when scope is open-ended; wants the edges fixed first.',
    importance: 0.6, confidence: 0.6,
  },
]);
console.log(dim('   ↳ expected: CREATED. Two independent sightings is the bar.'));

minutes(30);
turn('A change of mind: the prior belief stays, marked', 'conv-B', [
  {
    type: 'Goal', label: 'submit by June', kind: 'stated',
    content: 'Pushed submission to June after the fieldwork slipped.',
    replaces: 'submit by March',
    importance: 0.8, confidence: 0.9,
  },
]);
console.log(dim('   ↳ expected: the March goal is superseded, not deleted. History survives.'));

console.log('');
console.log(bold('─── recall: what Core would actually be handed'));
const sub = activate(graph, 'how is the kelp thesis going, am I going to make the deadline', {
  now: clock, limit: 15,
});
console.log(dim(`   seeds: ${sub.seeds.join(', ') || '(none)'}`));
console.log(
  renderMindGraph(sub, { now: clock, maxTokens: 500, scores: sub.scores })
    .split('\n').map((l) => '   ' + l).join('\n')
);

// ── forgetting ──────────────────────────────────────────────────────
//
// The tombstone is gate FOUR, and gate two runs first. So a deleted trait
// re-proposed once is refused for the wrong reason — "needs a second
// sighting" — and the tombstone is never consulted. Testing it that way
// proves nothing, which is the exact shape of bug this project keeps
// finding: the assertion passes while the code under it is untouched. To
// reach gate four a candidate has to get PAST gate two first, so the trait
// below is corroborated across two conversations before we check that
// forgetting still wins.

const trait = graph.nodes.find((n) => n.label === 'stalls when scope is open');
const project = graph.nodes.find((n) => n.label === 'kelp forest thesis');

clock += 86_400_000;
step(++stepNo, 'The person deletes two things', '—');
graph = forgetNode(graph, trait.id, clock, 'not true, I just hate that supervisor');
graph = forgetNode(graph, project.id, clock, 'switched labs, done with kelp');
console.log(`   ${red('×')} forgotten   ${trait.label}    ${dim('(a trait — gate 2 guards it too)')}`);
console.log(`   ${red('×')} forgotten   ${project.label}   ${dim('(an occurrence — only the tombstone guards it)')}`);
console.log(dim(`   graph: ${graph.nodes.length} nodes, ${graph.tombstones.length} forgotten`));

clock += 7 * 86_400_000;
turn('The occurrence is re-extracted: nothing but the tombstone stops it', 'conv-C', [
  {
    type: 'Project', label: 'kelp forest thesis', kind: 'stated',
    content: 'Still working through the kelp forest recovery thesis.',
    importance: 0.8, confidence: 0.9,
  },
]);
console.log(dim('   ↳ expected: refused, reason "forgotten" — gate 4, reached directly.'));

clock += 86_400_000;
turn('The trait is proposed again — first sighting back', 'conv-C', [
  {
    type: 'Pattern', label: 'stalls when scope is open', kind: 'inferred',
    content: 'Stalls when the scope of a task is left open-ended.',
    importance: 0.6, confidence: 0.7,
  },
]);
console.log(dim('   ↳ gate 2 refuses. This tells us nothing about forgetting yet.'));

clock += 86_400_000;
turn('Corroborated in a second conversation: now it reaches gate 4', 'conv-D', [
  {
    type: 'Pattern', label: 'stalls when scope is open', kind: 'inferred',
    content: 'Stalls when the scope of a task is left open-ended.',
    importance: 0.6, confidence: 0.7,
  },
]);
console.log(dim('   ↳ expected: refused, reason "forgotten". Corroboration does not beat deletion.'));

clock += 86_400_000;
turn('Reworded and re-typed, corroborated across two more conversations', 'conv-E', [
  {
    type: 'Tendency', label: 'stalls with open scope', kind: 'inferred',
    content: 'Has a tendency to stall whenever the scope is left open-ended.',
    importance: 0.6, confidence: 0.7,
  },
]);
clock += 86_400_000;
turn('...the second of them', 'conv-F', [
  {
    type: 'Tendency', label: 'stalls with open scope', kind: 'inferred',
    content: 'Has a tendency to stall whenever the scope is left open-ended.',
    importance: 0.6, confidence: 0.7,
  },
]);
console.log(dim('   ↳ expected: still "forgotten". The tombstone matches fuzzily, as resolution does.'));

// ── verdict ─────────────────────────────────────────────────────────

const has = (l) => graph.nodes.some((n) => n.label === l);
const reasons = REFUSALS;
const checks = [
  ['occurrences recorded on one sighting', has('submit by June')],
  ['superseded belief still present', has('submit by March') && has('submit by June')],
  ['deleted occurrence refused, and refused AS forgotten',
    !has('kelp forest thesis') && reasons['kelp forest thesis'] === 'forgotten'],
  ['deleted trait refused once corroborated, AS forgotten',
    !has('stalls when scope is open') && reasons['stalls when scope is open'] === 'forgotten'],
  ['reworded, re-typed, corroborated — still forgotten',
    !has('stalls with open scope') && reasons['stalls with open scope'] === 'forgotten'],
];
console.log('');
console.log(bold('─── verdict'));
let bad = 0;
for (const [name, okay] of checks) {
  console.log(`   ${okay ? green('ok  ') : red('FAIL')}  ${name}`);
  if (!okay) bad++;
}
console.log('');
console.log(
  bad
    ? red(`${bad} of the graph's guarantees did not hold.`)
    : green('The rules hold. What this does NOT prove: the extractor reads register') +
      green('\ncorrectly, the rows persist, or the route is wired. Those need the live path.')
);
console.log('');
process.exit(bad ? 1 : 0);
