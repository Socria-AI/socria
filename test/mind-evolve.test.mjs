// THE LIVING MODEL — how Socria's understanding of a person changes, and their say over it.
//
// Held down here: a change read from a conversation is PROPOSED, one the person
// made is theirs; what each change displaced is kept so a rejection restores it
// exactly; a rejected change is never read in again; a possible contradiction
// changes nothing until confirmed; what rests on a change is found; a memory's
// history is read only from the record; private memories stay out of Logos;
// and what Core and Logos are told says plainly which changes are unconfirmed.

import { EMPTY_GRAPH } from './.tmp/types.mjs';
import { applyCandidates } from './.tmp/apply.mjs';
import { TURN_BUDGET } from './.tmp/gate.mjs';
import { changesOf, reviewChange, detectContradictions, evolutionOf, selectForPrompt, changesBlock, affectedBy } from './.tmp/evolve.mjs';
import { serializeSubgraph } from './.tmp/serialize.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const T0 = 1_700_000_000_000;
let seq = 0;
const ids = () => `x${++seq}`;
const OPTS = (over = {}) => ({ now: T0, nextId: ids, budget: TURN_BUDGET, provenance: { surface: 'core', conversationId: 'c1' }, ...over });
const C = (type, label, content, kind = 'stated', extra = {}) => ({ type, label, content, kind, ...extra });
const apply = (g, nodes, edges = [], o = {}) => applyCandidates(g, nodes, edges, OPTS(o));
const node = (g, label) => g.nodes.find((n) => n.label === label);

// a person who planned to move to Denver, and a plan resting on it
let g = EMPTY_GRAPH;
({ graph: g } = apply(g, [C('Decision', 'Move to Denver', 'I am moving to Denver next spring'), C('Plan', 'Find a Denver apartment', 'Start looking at apartments in Denver')], [{ sourceLabel: 'Find a Denver apartment', targetLabel: 'Move to Denver', relationship: 'depends_on', kind: 'stated' }]));
const base = g;

// ── a change of position, read from a conversation ───────────────────
{
  const { graph: g2, report } = apply(base, [C('Decision', 'Stay in Austin', 'I decided to stay in Austin', 'stated', { replaces: 'Move to Denver' })], [], { now: T0 + 1000 });
  ok('the change is applied, the old kept', report.nodes[0].action === 'superseded' && node(g2, 'Move to Denver').status === 'superseded');
  const ch = changesOf(g2);
  const c = ch.find((x) => x.kind === 'superseded');
  ok('it is a change, proposed — Socria read it', c && c.review === 'proposed', JSON.stringify(ch.map((x) => [x.kind, x.review])));
  ok('it says what it was and what it is now', c.from.label === 'Move to Denver' && c.to.label === 'Stay in Austin');
  ok('what rests on the old position is found', c.affected.some((a) => a.label === 'Find a Denver apartment'), JSON.stringify(c.affected));
  ok('the new claim was created by the change, so it may be forgotten with it', c.canForget === true);

  // confirm
  const yes = reviewChange(g2, c.id, 'confirm', T0 + 2000);
  ok('confirming keeps it and marks it confirmed', yes.ok && changesOf(yes.graph).find((x) => x.id === c.id).review === 'confirmed');

  // reject: not a change
  const no = reviewChange(g2, c.id, 'reject', T0 + 2000);
  ok('rejecting restores what it displaced, exactly', no.ok && node(no.graph, 'Move to Denver').status === 'active');
  ok('…keeps the newer claim as a claim', !!node(no.graph, 'Stay in Austin'));
  ok('…and removes the link', !no.graph.edges.some((e) => e.relationship === 'superseded_by'));
  const again = apply(no.graph, [C('Decision', 'Stay in Austin', 'I decided to stay in Austin', 'stated', { replaces: 'Move to Denver' })], [], { now: T0 + 3000 });
  ok('a rejected change is not read in again', node(again.graph, 'Move to Denver').status === 'active' && !again.graph.edges.some((e) => e.relationship === 'superseded_by'));

  // forget
  const gone = reviewChange(g2, c.id, 'forget', T0 + 2000);
  ok('“not what I think” forgets the newer claim and restores the old', gone.ok && !node(gone.graph, 'Stay in Austin') && node(gone.graph, 'Move to Denver').status === 'active');
}

// ── a change the person made themselves is theirs ────────────────────
{
  const { graph: g2 } = apply(base, [C('Decision', 'Stay in Austin', 'I decided to stay in Austin', 'stated', { replaces: 'Move to Denver' })], [], { now: T0 + 1000, provenance: { surface: 'user' } });
  ok('a change of the person’s own is not proposed back to them', changesOf(g2).every((x) => x.review !== 'proposed'));
}

// ── a conflict both sides of which stand ─────────────────────────────
{
  const { graph: g2 } = apply(base, [C('Belief', 'Denver is affordable', 'Denver rents are fine for me', 'stated'), C('Belief', 'Denver is too expensive', 'Denver is too expensive for me', 'stated', { conflictsWith: 'Denver is affordable' })], [], { now: T0 + 1000 });
  const c = changesOf(g2).find((x) => x.kind === 'conflict');
  ok('a conflict is a proposed change, both sides in dispute', c && c.review === 'proposed' && node(g2, 'Denver is affordable').status === 'contradicted' && node(g2, 'Denver is too expensive').status === 'contradicted');
  const no = reviewChange(g2, c.id, 'reject', T0 + 2000);
  ok('“they don’t conflict” restores both statuses', no.ok && node(no.graph, 'Denver is affordable').status === 'active' && node(no.graph, 'Denver is too expensive').status === 'tentative');
}

// ── a rewording ──────────────────────────────────────────────────────
{
  const { graph: g2, report } = apply(base, [C('Decision', 'Move to Denver', 'I am moving to Denver next spring, once the lease on my Austin place ends in March')], [], { now: T0 + 1000 });
  const c = changesOf(g2).find((x) => x.kind === 'revised');
  ok('better words are a proposed rewording', report.nodes[0].action === 'revised' && c && c.review === 'proposed' && c.was === 'I am moving to Denver next spring');
  const no = reviewChange(g2, c.id, 'reject', T0 + 2000);
  ok('keeping the earlier words restores them', no.ok && node(no.graph, 'Move to Denver').content === 'I am moving to Denver next spring');
}

// ── possible contradictions, by plain rules ──────────────────────────
{
  let g2 = base;
  ({ graph: g2 } = apply(g2, [C('Preference', 'Living near the mountains', 'I want to live near the mountains')], [], { now: T0 + 500 }));
  const touched = [];
  let report;
  ({ graph: g2, report } = apply(g2, [C('Preference', 'Not near mountains', 'I do not want to live near the mountains anymore')], [], { now: T0 + 1000 }));
  touched.push(...report.nodes.map((r) => r.id));
  const d = detectContradictions(g2, touched, { now: T0 + 1000, nextId: ids, provenance: { surface: 'core', conversationId: 'c2' } });
  ok('opposite claims of the same kind are proposed as possibly in tension', d.proposed.length === 1, JSON.stringify(d.proposed));
  const c = changesOf(d.graph).find((x) => x.kind === 'possible-conflict');
  ok('…and nothing about either claim changes yet', c && node(d.graph, 'Living near the mountains').status === 'active' && node(d.graph, 'Not near mountains').status === 'active');
  const unrelated = detectContradictions(base, base.nodes.map((n) => n.id), { now: T0, nextId: ids, provenance: { surface: 'core' } });
  ok('claims on different subjects are left alone', unrelated.proposed.length === 0);
  const yes = reviewChange(d.graph, c.id, 'confirm', T0 + 2000);
  ok('confirmed, both stand in dispute', yes.ok && node(yes.graph, 'Living near the mountains').status === 'contradicted');
  const no = reviewChange(d.graph, c.id, 'reject', T0 + 2000);
  const redo = detectContradictions(no.graph, touched, { now: T0 + 3000, nextId: ids, provenance: { surface: 'core' } });
  ok('a dismissed possible contradiction is never proposed again', no.ok && redo.proposed.length === 0);
}

// ── one memory's history ─────────────────────────────────────────────
{
  const { graph: g2 } = apply(base, [C('Decision', 'Stay in Austin', 'I decided to stay in Austin', 'stated', { replaces: 'Move to Denver' })], [], { now: T0 + 1000 });
  const ev = evolutionOf(g2, node(g2, 'Stay in Austin').id);
  ok('the history follows the chain back to the first position', ev[0].kind === 'origin' && ev.some((s) => s.kind === 'replaced' && s.text.includes('Move to Denver')), JSON.stringify(ev));
  ok('…in time order', ev.every((s, i) => !i || s.at >= ev[i - 1].at));
  ok('a memory with no change says so by having one step', evolutionOf(base, node(base, 'Find a Denver apartment').id).length === 1);
}

// ── privacy ──────────────────────────────────────────────────────────
{
  const { graph: g2 } = apply(EMPTY_GRAPH, [C('Decision', 'Start medication', 'I am starting the medication', 'stated', { private: true })], [], { now: T0 });
  const { graph: g3 } = apply(g2, [C('Decision', 'Stop medication', 'I stopped the medication', 'stated', { private: true, replaces: 'Start medication' })], [], { now: T0 + 1000, provenance: { surface: 'core', conversationId: 'c1' } });
  ok('a private change stays out of Logos', changesOf(g3, { excludePrivate: true }).length === 0);
  ok('…and out of other conversations', changesOf(g3, { excludePrivate: true, here: 'c9' }).length === 0);
  ok('…but shows where it was made', changesOf(g3, { excludePrivate: true, here: 'c1' }).length === 1);
}

// ── what Core and Logos are told ─────────────────────────────────────
{
  const { graph: g2 } = apply(base, [C('Decision', 'Stay in Austin', 'I decided to stay in Austin', 'stated', { replaces: 'Move to Denver' })], [], { now: T0 + 1000 });
  const ch = changesOf(g2);
  const picked = selectForPrompt(ch, new Set(), { now: T0 + 2000 });
  const block = changesBlock(picked);
  ok('an unconfirmed change is said to be unconfirmed', block.includes('NOT confirmed') && block.includes('used to hold'));
  ok('…with what it may affect', block.includes('Find a Denver apartment'));
  ok('…and the model is told never to treat it as settled', block.includes('hold both sides lightly'));
  const confirmed = reviewChange(g2, ch[0].id, 'confirm', T0 + 1500);
  const block2 = changesBlock(selectForPrompt(changesOf(confirmed.graph), new Set([node(g2, 'Stay in Austin').id]), { now: T0 + 2000 }));
  ok('a confirmed change is said as confirmed', block2.includes('confirmed') && !block2.includes('NOT confirmed'));
  ok('nothing to say, nothing said', changesBlock([]) === '');
  const sub = { nodes: g2.nodes, edges: g2.edges, seeds: [], scores: {} };
  ok('the memory block marks the unconfirmed link', serializeSubgraph(sub, { now: T0 + 2000, maxTokens: 2000 }).includes('unconfirmed'));
}

// ── what rests on a node ─────────────────────────────────────────────
ok('affected: the plan rests on the decision', affectedBy(base, node(base, 'Move to Denver').id).some((a) => a.label === 'Find a Denver apartment'));
ok('affected: nothing rests on the plan', affectedBy(base, node(base, 'Find a Denver apartment').id).length === 0);

console.log(`mind evolve: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
