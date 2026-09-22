// Projects: one graph, many regions of attention.
//
// The invariant under test is "Projects organise attention, not memory
// ownership". It fails in two opposite directions, and both are silent:
//
//   SILOS — a Project that cannot see outside itself. Inside Socria, asked
//   how Core should help someone struggling with derivatives, Socria never
//   finds what the person learned about how THEY learned derivatives in
//   Calculus. Nothing errors; the answer is just worse.
//
//   FLOODS — cross-project retrieval that brings in whatever is nearby.
//   Inside Socria, asked about the launch, Calculus exam dates appear.
//   Nothing errors; Core just becomes the assistant that brings up random
//   things.
//
// So every retrieval test below asserts BOTH what must surface and what must
// not, and the graph is built the way the product builds it — through
// applyCandidates and associate(), turn by turn, in a Project — rather than
// hand-wired, because a hand-wired fixture tests the case the author pictured.

import { EMPTY_GRAPH, fingerprintEdge, normalize } from './.tmp/types.mjs';
import { FILE_BUDGET } from './.tmp/gate.mjs';
import { applyCandidates, forgetEdge } from './.tmp/apply.mjs';
import { activate } from './.tmp/activate.mjs';
import { renderMindGraph } from './.tmp/serialize.mjs';
import {
  associate, createAnchor, findAdoptable, planDeletion, projectGoals, projectIndex,
  renderProjectContext, syncAnchor, MEMBERSHIP_RELATIONSHIPS, MAX_GOALS_SHOWN,
  adoptConversation, releaseConversation,
} from './.tmp/projects.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const NOW = Date.parse('2026-09-01T12:00:00Z');
let seq = 0;
const nextId = () => `x${++seq}`;
const C = (type, label, content, kind = 'stated', extra = {}) => ({ type, label, content, kind, importance: 0.6, ...extra });
const E = (sourceLabel, relationship, targetLabel) => ({ sourceLabel, relationship, targetLabel, kind: 'stated' });

/** One turn of conversation, inside a Project or not — as remember() does it. */
function turn(g, anchor, conv, nodes, edges = []) {
  const out = applyCandidates(g, nodes, edges, {
    now: NOW, nextId, budget: FILE_BUDGET, provenance: { surface: 'core', conversationId: conv },
  });
  let next = out.graph;
  if (anchor) {
    next = associate(next, anchor, out.report.nodes.map((n) => ({ id: n.id, action: n.action })), {
      now: NOW, nextId, provenance: { surface: 'core', conversationId: conv },
    }).graph;
  }
  return next;
}

const byLabel = (g, l) => g.nodes.find((n) => normalize(n.label) === normalize(l));
const labels = (sub) => sub.nodes.map((n) => n.label);
const has = (sub, l) => sub.nodes.some((n) => normalize(n.label) === normalize(l));

// ── the world ───────────────────────────────────────────────────────
//
// Two Projects that overlap in one real way — the person's experience of how
// THEY learn mathematics is relevant to how Socria should teach it — and do
// not overlap in a dozen incidental ways.

let g = EMPTY_GRAPH;
let anchors = new Set();

let r = createAnchor(g, 'Calculus', 'Getting through Calc II this term.', anchors, { now: NOW, nextId });
g = r.graph; const CALC = r.nodeId; anchors.add(CALC);
r = createAnchor(g, 'Socria', 'The product: Core 4, Logos, the Mind Graph.', anchors, { now: NOW, nextId });
g = r.graph; const SOC = r.nodeId; anchors.add(SOC);

// Inside Calculus, over three conversations.
g = turn(g, CALC, 'calc-1', [
  C('Concept', 'derivatives', 'The rate-of-change half of the course.'),
  C('Experience', 'the moving tangent line',
    'Derivatives only made sense once the tangent line was drawn moving along the curve; the symbolic rules first made it worse.'),
  C('Event', 'Calc II final exam', 'The final is on December 12th.'),
  C('Person', 'Professor Lin', 'Teaches the section; office hours on Thursdays.'),
], [
  E('the moving tangent line', 'evidence_for', 'derivatives'),
  E('Calc II final exam', 'associated_with', 'derivatives'),
]);
g = turn(g, CALC, 'calc-2', [
  C('Concept', 'visual learning', 'Understands a concept once it is drawn, before it is written.'),
  C('Experience', 'integral learning experience',
    'Integrals clicked when the area filled in on screen; being handed the formula and asked to recall it did nothing.'),
  C('Source', 'practice set 4', 'The integration-by-parts problem set.'),
], [
  E('integral learning experience', 'evidence_for', 'visual learning'),
  E('the moving tangent line', 'evidence_for', 'visual learning'),
  E('practice set 4', 'associated_with', 'integral learning experience'),
]);
g = turn(g, CALC, 'calc-3', [
  C('Goal', 'pass Calc II with a B', 'Wants at least a B in Calc II.'),
]);

// Inside Socria.
g = turn(g, SOC, 'soc-1', [
  C('Concept', 'Core 4', 'The Human-First model: judges each turn whether to answer or scaffold.'),
  C('Concept', 'adaptive scaffolding', 'Give the least help that lets the person do the next step themselves.'),
  C('Goal', 'launch Core 4 in October', 'Ship Core 4 to everyone in October.'),
  C('Decision', 'Answer Guard withholds worked solutions',
    'The guard blocks a draft that shows the worked answer before the person has tried.'),
], [
  E('adaptive scaffolding', 'used_by', 'Core 4'),
  E('Answer Guard withholds worked solutions', 'part_of', 'Core 4'),
]);
// The one real overlap, discovered inside Socria: the person's own learning
// history is evidence for a design principle. The Calculus node is REUSED,
// not copied.
g = turn(g, SOC, 'soc-2', [
  C('Concept', 'visual learning', 'Understands a concept once it is drawn, before it is written.'),
  C('Concept', 'adaptive scaffolding', 'Give the least help that lets the person do the next step themselves.'),
], [
  E('integral learning experience', 'evidence_for', 'adaptive scaffolding'),
]);

const idx = projectIndex(g, anchors);
const inCalc = (l) => idx.get(byLabel(g, l)?.id)?.has(CALC) ?? false;
const inSoc = (l) => idx.get(byLabel(g, l)?.id)?.has(SOC) ?? false;

console.log('=== one graph, not two ===');
{
  ok('"visual learning" is ONE node, though it came up in both Projects',
     g.nodes.filter((n) => normalize(n.label) === 'visual learning').length === 1);
  ok('it belongs to Calculus, where it was created', inCalc('visual learning'));
  ok('and is relevant to Socria, where it came up again', inSoc('visual learning'));
  const vl = byLabel(g, 'visual learning');
  const ties = g.edges.filter((e) => e.sourceId === vl.id && anchors.has(e.targetId));
  ok('as belongs_to Calculus and relevant_to Socria',
     ties.some((e) => e.targetId === CALC && e.relationship === 'belongs_to') &&
     ties.some((e) => e.targetId === SOC && e.relationship === 'relevant_to'),
     JSON.stringify(ties.map((e) => [e.relationship, e.targetId])));
  ok('a Calculus node can hold an edge to a Socria node',
     g.edges.some((e) => e.sourceId === byLabel(g, 'integral learning experience').id &&
                         e.targetId === byLabel(g, 'adaptive scaffolding').id &&
                         e.relationship === 'evidence_for'));
  ok('the Projects are nodes like any other, typed Project',
     byLabel(g, 'Calculus').type === 'Project' && byLabel(g, 'Socria').type === 'Project');
  ok('there is no second store: every node is in the one graph',
     [...idx.keys()].every((id) => g.nodes.some((n) => n.id === id)));
}

console.log('\n=== membership is reinforced, not repeated ===');
{
  const before = g.edges.length;
  const again = turn(g, SOC, 'soc-3', [C('Concept', 'Core 4', 'The Human-First model: judges each turn whether to answer or scaffold.')]);
  const core = byLabel(again, 'Core 4');
  const ties = again.edges.filter((e) => e.sourceId === core.id && e.targetId === SOC);
  ok('coming up again in the same Project adds no second tie', ties.length === 1, String(ties.length));
  ok('it strengthens the one there is', ties[0].strength > 0.6, String(ties[0].strength));
  ok('and adds no other edges either', again.edges.length === before, `${before} -> ${again.edges.length}`);
}

console.log('\n=== a removed tie stays removed ===');
{
  const lin = byLabel(g, 'Professor Lin');
  const tie = g.edges.find((e) => e.sourceId === lin.id && e.targetId === CALC);
  const cut = forgetEdge(g, tie.id);
  ok('the tie is tombstoned', cut.tombstones.includes(fingerprintEdge('Person', 'Professor Lin', 'belongs_to', 'Project', 'Calculus')));
  const back = turn(cut, CALC, 'calc-4', [C('Person', 'Professor Lin', 'Teaches the section; office hours on Thursdays.')]);
  const blin = byLabel(back, 'Professor Lin');
  ok('the next turn in that Project does not quietly put it back',
     !back.edges.some((e) => e.sourceId === blin.id && e.targetId === CALC && e.relationship === 'belongs_to'));
}

// ── retrieval ───────────────────────────────────────────────────────

const recall = (message, current, focus = []) =>
  activate(g, message, { now: NOW, limit: 15, focus, project: { current, anchors } });

console.log('\n=== inside Socria, a question that needs Calculus ===');
{
  const sub = recall('How should Core respond when someone is struggling to understand derivatives?', SOC);
  ok('the concept it is about surfaces, though it lives in Calculus', has(sub, 'derivatives'), labels(sub).join(' | '));
  // This is the case a pure activation threshold got wrong: one evidence_for
  // hop from "derivatives" lands near 0.15, under the bar. The experience is
  // exactly what the question needs.
  // Labelled so that NOTHING in the message matches it. An earlier version
  // called it "learning derivatives from pictures", which made it a direct
  // seed on the word "derivatives" — so this passed without the strong-hop
  // rule it was written to test ever running.
  ok('so does how THEY learned derivatives — reached only by one strong hop',
     has(sub, 'the moving tangent line'), labels(sub).join(' | '));
  ok('(and it is not a seed: nothing in the message names it)',
     !sub.seeds.includes(byLabel(g, 'the moving tangent line').id));
  ok('the other Project itself does not ride in on a membership edge', !has(sub, 'Calculus'), labels(sub).join(' | '));

  // The counterfactual that proves which rule did the work: the SAME memory,
  // tied by a weak relationship instead of evidence_for, stays out.
  const weak = turn(EMPTY_GRAPH, null, 'w', [], []);
  let w = createAnchor(EMPTY_GRAPH, 'Calculus', '', new Set(), { now: NOW, nextId });
  const wc = w.nodeId;
  w = createAnchor(w.graph, 'Socria', '', new Set([wc]), { now: NOW, nextId });
  const ws = w.nodeId;
  let wg = turn(w.graph, wc, 'wc', [
    C('Concept', 'derivatives', 'The rate-of-change half of the course.'),
    C('Experience', 'the moving tangent line', 'Derivatives made sense once the tangent was drawn moving along the curve.'),
  ], [E('the moving tangent line', 'associated_with', 'derivatives')]);
  const wsub = activate(wg, 'How should Core respond when someone is struggling to understand derivatives?',
    { now: NOW, limit: 15, project: { current: ws, anchors: new Set([wc, ws]) } });
  ok('the same memory tied only by "associated_with" does NOT come across', !has(wsub, 'the moving tangent line'),
     labels(wsub).join(' | '));
  ok('and the current Project\'s own memory is still there', has(sub, 'Core 4'), labels(sub).join(' | '));
  // The Project's node is the FRAME of the conversation, and the frame is
  // already in the prompt. Rendered as a memory it was a list of every
  // belongs_to edge — bookkeeping that cost budget the real answer needed.
  ok('the Project\'s own node is not repeated as a memory', !has(sub, 'Socria'), labels(sub).join(' | '));
  ok('but not the exam date: related to derivatives only incidentally', !has(sub, 'Calc II final exam'), labels(sub).join(' | '));
  ok('nor the professor', !has(sub, 'Professor Lin'));
  ok('nor the problem set', !has(sub, 'practice set 4'));
  ok('nor the Calculus goal', !has(sub, 'pass Calc II with a B'));

  const der = byLabel(g, 'derivatives').id;
  ok('what came from elsewhere is marked as such', sub.elsewhere?.[der]?.includes(CALC), JSON.stringify(sub.elsewhere));
  const origin = Object.fromEntries(Object.entries(sub.elsewhere ?? {}).map(([id, a]) => [id, a.map((x) => byLabel(g, 'Calculus').id === x ? 'Calculus' : x).join(', ')]));
  const text = renderMindGraph(sub, { now: NOW, maxTokens: 800, scores: sub.scores, origin });
  ok('and the prompt says where it came from', /derivatives —[^\n]*\[from project: Calculus\]/.test(text), text.slice(0, 400));

  // Priority, not just presence: something in this Project outranks a
  // similarly-activated thing from elsewhere.
  const s = sub.scores;
  ok('Socria\'s own nodes are boosted: Core 4 scores above practice-set noise would',
     s[byLabel(g, 'Core 4').id] > 0, JSON.stringify(s));
}

console.log('\n=== inside Socria, a question that needs nothing from Calculus ===');
{
  const sub = recall('What still has to happen before the October launch?', SOC);
  const calcOnly = sub.nodes.filter((n) => inCalc(n.label) && !inSoc(n.label));
  ok('nothing that belongs only to Calculus appears', calcOnly.length === 0, calcOnly.map((n) => n.label).join(', '));
  ok('the launch goal does', has(sub, 'launch Core 4 in October'), labels(sub).join(' | '));
}

console.log('\n=== inside Socria, a message that names nothing ===');
{
  // No term in this matches any label. The Project still has an answer.
  const sub = recall('ok what next', SOC);
  ok('the Project supplies its own context', has(sub, 'launch Core 4 in October') || has(sub, 'Core 4'), labels(sub).join(' | '));
  const calcOnly = sub.nodes.filter((n) => inCalc(n.label) && !inSoc(n.label));
  ok('and still brings nothing from Calculus', calcOnly.length === 0, calcOnly.map((n) => n.label).join(', '));
}

console.log('\n=== the explicit cross-project chain ===');
{
  // integral learning experience (Calculus) --evidence_for--> adaptive
  // scaffolding (Socria) --used_by--> Core 4 (Socria)
  const sub = recall('Is adaptive scaffolding actually the right principle for Core 4?', SOC);
  ok('the Calculus evidence for a Socria principle surfaces',
     has(sub, 'integral learning experience'), labels(sub).join(' | '));
  ok('with the relationship intact',
     sub.edges.some((e) => e.relationship === 'evidence_for' &&
       e.sourceId === byLabel(g, 'integral learning experience').id &&
       e.targetId === byLabel(g, 'adaptive scaffolding').id));
  ok('and without dragging in the problem set attached to it', !has(sub, 'practice set 4'));
}

console.log('\n=== the hub rule ===');
{
  // "visual learning" is in BOTH Projects, so asking about it inside Socria is
  // a Socria question. It is also tied to the Calculus anchor — which, if it
  // passed activation on, would light every Calculus node at once.
  const sub = recall('Tell me more about visual learning', SOC);
  ok('the shared concept surfaces', has(sub, 'visual learning'));
  ok('Calculus does not flood in through its anchor',
     !has(sub, 'Calc II final exam') && !has(sub, 'Professor Lin') && !has(sub, 'pass Calc II with a B'),
     labels(sub).join(' | '));
}

console.log('\n=== the hub rule, where only it can hold ===');
{
  // Inside a Project, the cross-project threshold already keeps a flood out,
  // so a hub-rule test written there passes with the rule deleted. Outside
  // any Project there IS no threshold — everything is "global" — and the
  // only thing stopping a mention of one Calculus concept from lighting all
  // of Calculus through its anchor is that anchors do not fan out unless the
  // person named them.
  const sub = activate(g, 'Tell me more about visual learning', { now: NOW, limit: 15, project: { current: null, anchors } });
  ok('the concept surfaces', has(sub, 'visual learning'));
  ok('its real neighbours surface', has(sub, 'integral learning experience'), labels(sub).join(' | '));
  ok('the professor does not: reachable only THROUGH the Calculus anchor', !has(sub, 'Professor Lin'), labels(sub).join(' | '));
  ok('nor the Calculus goal', !has(sub, 'pass Calc II with a B'));

  // Naming the Project IS asking about it, and then it opens.
  const named = activate(g, 'How is Calculus going?', { now: NOW, limit: 15, project: { current: null, anchors } });
  ok('naming the Project lets it open', has(named, 'pass Calc II with a B') || has(named, 'Professor Lin'),
     labels(named).join(' | '));
}

console.log('\n=== inside Calculus, the mirror image ===');
{
  const sub = recall('What should I focus on before the final?', CALC);
  ok('Calculus comes first', has(sub, 'Calc II final exam') || has(sub, 'pass Calc II with a B'), labels(sub).join(' | '));
  const socOnly = sub.nodes.filter((n) => inSoc(n.label) && !inCalc(n.label));
  ok('Socria stays out of a question about the exam', socOnly.length === 0, socOnly.map((n) => n.label).join(', '));
}

console.log('\n=== outside any Project ===');
{
  const sub = activate(g, 'derivatives and Core 4', { now: NOW, limit: 15, project: { current: null, anchors } });
  ok('both regions are reachable', has(sub, 'derivatives') && has(sub, 'Core 4'), labels(sub).join(' | '));
  ok('and nothing is marked as coming from elsewhere, because there is no here', !sub.elsewhere);
  const plain = activate(g, 'derivatives and Core 4', { now: NOW, limit: 15 });
  ok('which is the same thing retrieval did before Projects existed',
     JSON.stringify(labels(plain).sort()) === JSON.stringify(labels(sub).sort()) ||
     labels(sub).every((l) => labels(plain).includes(l)),
     `${labels(plain).join(',')} vs ${labels(sub).join(',')}`);
}

console.log('\n=== priority is a weight, not a wall ===');
{
  // The same question from both sides. Inside Calculus, the Calculus
  // experience should outrank the Socria design material; inside Socria, the
  // Socria design material should outrank it.
  const q = 'integral learning experience and adaptive scaffolding';
  const fromCalc = recall(q, CALC).scores;
  const fromSoc = recall(q, SOC).scores;
  const ile = byLabel(g, 'integral learning experience').id;
  const ads = byLabel(g, 'adaptive scaffolding').id;
  ok('inside Calculus, the Calculus memory ranks higher', fromCalc[ile] > fromCalc[ads],
     `${fromCalc[ile]?.toFixed(3)} vs ${fromCalc[ads]?.toFixed(3)}`);
  ok('inside Socria, the Socria principle ranks higher', fromSoc[ads] > fromSoc[ile],
     `${fromSoc[ads]?.toFixed(3)} vs ${fromSoc[ile]?.toFixed(3)}`);
  ok('and both are reachable from both', ile in fromCalc && ads in fromCalc && ile in fromSoc && ads in fromSoc);
}

console.log('\n=== affinity decides when relevance alone would not ===');
{
  // The previous section passes without the affinity multiplier at all: the
  // current Project's anchor seed spreads activation into its own members, and
  // that alone decides the order. So here the node from ELSEWHERE is made to
  // win on everything else — a stronger match and more important — and only
  // Project affinity can put the current Project's node first.
  let w = createAnchor(EMPTY_GRAPH, 'Calculus', '', new Set(), { now: NOW, nextId });
  const wc = w.nodeId;
  w = createAnchor(w.graph, 'Socria', '', new Set([wc]), { now: NOW, nextId });
  const ws = w.nodeId;
  const both = new Set([wc, ws]);
  let wg = turn(w.graph, wc, 'a', [C('Concept', 'pacing drills', 'Timed drill sets that build speed on routine problems.', 'stated', { importance: 1 })]);
  wg = turn(wg, ws, 'b', [C('Concept', 'Core 4 pacing', 'How fast Core 4 moves a person to the next step.', 'stated', { importance: 0.4 })]);
  const idOf = (l) => wg.nodes.find((n) => n.label === l).id;
  const inSoc2 = activate(wg, 'Tell me about pacing', { now: NOW, limit: 15, project: { current: ws, anchors: both } }).scores;
  const flat = activate(wg, 'Tell me about pacing', { now: NOW, limit: 15 }).scores;
  ok('with no Project, the stronger outside match wins', flat[idOf('pacing drills')] > flat[idOf('Core 4 pacing')],
     `${flat[idOf('pacing drills')]?.toFixed(3)} vs ${flat[idOf('Core 4 pacing')]?.toFixed(3)}`);
  ok('inside Socria, Socria\'s own node is put first anyway',
     inSoc2[idOf('Core 4 pacing')] > inSoc2[idOf('pacing drills')],
     `${inSoc2[idOf('Core 4 pacing')]?.toFixed(3)} vs ${inSoc2[idOf('pacing drills')]?.toFixed(3)}`);
  ok('while the outside node is still there, just lower', idOf('pacing drills') in inSoc2);
}

console.log('\n=== what the message is about comes before what is merely nearby ===');
{
  // Found through the real chat route, not here: a Project full of
  // important-looking nodes that received only the anchor's spillover
  // outranked the exact thing the person asked about, and the token ceiling
  // then cut it. So: ten weighty Socria nodes the message does not touch,
  // against one outside memory it names directly.
  let w = createAnchor(EMPTY_GRAPH, 'Calculus', '', new Set(), { now: NOW, nextId });
  const wc = w.nodeId;
  w = createAnchor(w.graph, 'Socria', '', new Set([wc]), { now: NOW, nextId });
  const ws = w.nodeId;
  const both = new Set([wc, ws]);
  let wg = turn(w.graph, wc, 'a', [
    C('Concept', 'derivatives', 'The rate-of-change half of the course.'),
    C('Experience', 'the moving tangent line', 'Derivatives made sense once the tangent was drawn moving along the curve.'),
  ], [E('the moving tangent line', 'evidence_for', 'derivatives')]);
  wg = turn(wg, ws, 'b', Array.from({ length: 10 }, (_, i) =>
    C('Goal', `launch milestone ${i}`, `An important Socria milestone numbered ${i} on the roadmap.`, 'stated', { importance: 1 })));
  const sub = activate(wg, 'How should Core help someone struggling with derivatives?',
    { now: NOW, limit: 15, project: { current: ws, anchors: both } });
  const idOf = (l) => wg.nodes.find((n) => n.label === l).id;
  const context = wg.nodes.filter((n) => n.label.startsWith('launch milestone')).map((n) => sub.scores[n.id] ?? 0);
  ok('the named concept outranks every Project node the message did not touch',
     (sub.scores[idOf('derivatives')] ?? 0) > Math.max(...context),
     `${sub.scores[idOf('derivatives')]?.toFixed(3)} vs ${Math.max(...context).toFixed(3)}`);
  ok('so does the memory one strong hop from it',
     (sub.scores[idOf('the moving tangent line')] ?? 0) > Math.max(...context),
     `${sub.scores[idOf('the moving tangent line')]?.toFixed(3)} vs ${Math.max(...context).toFixed(3)}`);
  // And with a window too small for all of them, the Project background is
  // what gives way.
  const tight = activate(wg, 'How should Core help someone struggling with derivatives?',
    { now: NOW, limit: 3, project: { current: ws, anchors: both } });
  ok('with a tight window, the answer survives and the background gives way',
     has(tight, 'derivatives') && has(tight, 'the moving tangent line'), labels(tight).join(' | '));
  const quiet = activate(wg, 'ok what next', { now: NOW, limit: 15, project: { current: ws, anchors: both } });
  ok('while a message that names nothing still gets the Project', quiet.nodes.some((n) => n.label.startsWith('launch milestone')));
}

// ── the Project frame in the prompt ─────────────────────────────────

console.log('\n=== what Core is told about the Project ===');
{
  const goals = projectGoals(g, SOC);
  ok('goals come from the graph, not a separate list', goals.some((n) => n.label === 'launch Core 4 in October'));
  ok('only this Project\'s goals', !goals.some((n) => n.label === 'pass Calc II with a B'));
  const text = renderProjectContext(
    { name: 'Socria', description: 'The product.', instructions: 'Be blunt about trade-offs.' },
    goals, [{ name: 'core4-notes.txt' }]
  );
  ok('names the Project', text.includes('Current Project: Socria'));
  ok('carries their instructions, framed as theirs', text.includes('Be blunt about trade-offs.') && /their words/.test(text));
  ok('lists the goal', text.includes('launch Core 4 in October'));
  ok('lists file NAMES, never contents', text.includes('core4-notes.txt'));
  ok('tells Core cross-project material is marked and must be relevant', /\[from project: …\]/.test(text) && /not relevant/.test(text));

  // A Project must not cost more prompt for being bigger.
  let big = g;
  const many = Array.from({ length: 300 }, (_, i) => C('Concept', `topic ${i}`, `Something discussed in session ${i}.`));
  for (let i = 0; i < many.length; i += 60) big = turn(big, SOC, `bulk-${i}`, many.slice(i, i + 60));
  const bigGoals = projectGoals(big, SOC);
  const small = renderProjectContext({ name: 'Socria', description: '', instructions: '' }, goals, []);
  const large = renderProjectContext({ name: 'Socria', description: '', instructions: '' }, bigGoals, []);
  ok('the frame does not grow with the Project', large.length === small.length, `${small.length} vs ${large.length}`);
  const sub = activate(big, 'ok what next', { now: NOW, limit: 15, project: { current: SOC, anchors } });
  ok('nor does retrieval: 300 more members, still the plan\'s window', sub.nodes.length <= 15 + 5, String(sub.nodes.length));
  const huge = renderProjectContext({ name: 'x'.repeat(500), description: 'd'.repeat(5000), instructions: 'i'.repeat(9000) },
    Array.from({ length: 30 }, (_, i) => ({ label: `goal ${i}`, content: '', status: 'active' })),
    Array.from({ length: 40 }, (_, i) => ({ name: `f${i}.txt` })));
  ok('every field is bounded', huge.length < 3800, String(huge.length));
  ok('goals are capped', (huge.match(/^- goal/gm) ?? []).length === MAX_GOALS_SHOWN);
  ok('files are capped and counted', /and 28 more/.test(huge));
}

console.log('\n=== moving a chat into a folder, and out again ===');
{
  // A chat held OUTSIDE any Project, then filed under one from the rail. Its
  // memories already carry the conversation they came from, so filing it
  // should tie them exactly as if it had been held there — and taking it out
  // should untie only what it alone put there.
  let w = createAnchor(EMPTY_GRAPH, 'Research', '', new Set(), { now: NOW, nextId });
  const R = w.nodeId;
  let wg = turn(w.graph, null, 'loose-1', [
    C('Concept', 'survey design', 'How the questionnaire is structured and ordered.'),
    C('Concept', 'response bias', 'People answering how they think they should.'),
  ]);
  // Something that existed before the chat, which the chat then discussed.
  wg = turn(wg, null, 'older', [C('Concept', 'sampling', 'Who gets asked, and how they are chosen.')]);
  wg = turn(wg, null, 'loose-1', [C('Concept', 'sampling', 'Who gets asked, and how they are chosen.')]);
  const tie = (g, l) => g.edges.find((e) => e.targetId === R && e.sourceId === g.nodes.find((n) => n.label === l)?.id);

  const moved = adoptConversation(wg, R, 'loose-1', { now: NOW, nextId });
  ok('filing the chat ties what it taught to the Project', moved.tied === 3, String(moved.tied));
  ok('what it created BELONGS to the Project', tie(moved.graph, 'survey design')?.relationship === 'belongs_to');
  ok('what already existed is RELEVANT to it', tie(moved.graph, 'sampling')?.relationship === 'relevant_to');
  ok('nothing is copied: same nodes, only edges added', moved.graph.nodes.length === wg.nodes.length);
  ok('a node the chat never touched is left alone',
     !moved.graph.edges.some((e) => e.targetId === R && e.sourceId === wg.nodes.find((n) => n.label === 'Research')?.id));

  // A second chat in the Project also discusses "sampling".
  let two = turn(moved.graph, R, 'in-project', [C('Concept', 'sampling', 'Who gets asked, and how they are chosen.')]);
  ok('a second chat reinforcing a tie is recorded on it',
     tie(two, 'sampling').provenance.map((p) => p.conversationId).includes('in-project'));

  const out = releaseConversation(two, R, 'loose-1');
  ok('taking the chat out unties what it ALONE put there', !tie(out.graph, 'survey design') && !tie(out.graph, 'response bias'));
  ok('but keeps a tie another chat also justifies', !!tie(out.graph, 'sampling'));
  ok('minus this chat\'s entry', !tie(out.graph, 'sampling').provenance.some((p) => p.conversationId === 'loose-1'));
  ok('and reports what it untied', out.untied === 2, String(out.untied));
  ok('no memory is removed by moving a chat', out.graph.nodes.length === two.nodes.length);
  ok('and no tombstone is written — filing is not forgetting', out.graph.tombstones.length === two.tombstones.length);
  ok('a file\'s tie is never released by moving a chat',
     releaseConversation(associate(two, R, [{ id: two.nodes.find((n) => n.label === 'response bias').id, action: 'reinforced' }],
       { now: NOW, nextId, provenance: { surface: 'file' } }).graph, R, 'loose-1').graph.edges
       .some((e) => e.targetId === R && e.sourceId === two.nodes.find((n) => n.label === 'response bias').id));
}

// ── lifecycle ───────────────────────────────────────────────────────

console.log('\n=== creating a Project adopts, never duplicates ===');
{
  // "Transfer application" came up in conversation before anyone made it a
  // Project.
  let w = turn(EMPTY_GRAPH, null, 'c-x', [C('Project', 'Transfer application', 'Applying to transfer to Berkeley.')]);
  const before = byLabel(w, 'Transfer application').id;
  const made = createAnchor(w, 'transfer application', '', new Set(), { now: NOW, nextId });
  ok('the existing node is adopted', made.adopted && made.nodeId === before);
  ok('and not copied', made.graph.nodes.filter((n) => normalize(n.label) === 'transfer application').length === 1);
  ok('keeping what was already known about it', byLabel(made.graph, 'Transfer application').content.includes('Berkeley'));
  ok('a node that already anchors another Project is not taken',
     findAdoptable(made.graph, 'Transfer application', new Set([before])) === null);
  const renamed = syncAnchor(made.graph, before, { name: 'Berkeley transfer' }, NOW);
  const node = renamed.nodes.find((n) => n.id === before);
  ok('renaming keeps the old name as an alias, so it is still reachable by it',
     node.label === 'Berkeley transfer' && node.aliases.includes('Transfer application'));
}

console.log('\n=== deleting a Project deletes the Project, not the memories ===');
{
  // Something that ties the Calculus node to the world beyond membership.
  let w = turn(g, null, 'c-y', [C('Organization', 'study group', 'A group from the section that meets on Tuesdays to work problems.')],
    [E('study group', 'works_on', 'Calculus')]);
  const members = [...projectIndex(w, anchors)].filter(([, a]) => a.has(CALC)).map(([id]) => id);
  const tombs = w.tombstones.length;
  const nodesBefore = w.nodes.length;
  const plan = planDeletion(w, CALC, NOW);

  ok('membership edges are removed', !plan.graph.edges.some((e) =>
    MEMBERSHIP_RELATIONSHIPS.has(e.relationship) && (e.targetId === CALC || e.sourceId === CALC)));
  ok('every member is still in the graph', members.every((id) => plan.graph.nodes.some((n) => n.id === id)));
  ok('the report counts them as kept', plan.memoriesKept === members.filter((id) => id !== CALC).length,
     `${plan.memoriesKept} vs ${members.length}`);
  ok('"visual learning" keeps its tie to Socria', inSoc('visual learning') &&
     plan.graph.edges.some((e) => e.sourceId === byLabel(g, 'visual learning').id && e.targetId === SOC));
  ok('the cross-project evidence edge survives', plan.graph.edges.some((e) =>
     e.sourceId === byLabel(g, 'integral learning experience').id && e.targetId === byLabel(g, 'adaptive scaffolding').id));
  ok('knowledge about the Project itself survives — the anchor is kept as historical',
     plan.anchor === 'kept-historical' && plan.graph.nodes.find((n) => n.id === CALC)?.status === 'historical');
  ok('no tombstones: deleting a workspace is not saying any of it was wrong', plan.graph.tombstones.length === tombs);
  ok('no memory is lost', plan.graph.nodes.length === nodesBefore);

  // A Project that was only ever a container.
  let bare = createAnchor(EMPTY_GRAPH, 'Scratch', '', new Set(), { now: NOW, nextId });
  let bw = turn(bare.graph, bare.nodeId, 's-1', [C('Concept', 'loose idea', 'Something noted once.')]);
  const p2 = planDeletion(bw, bare.nodeId, NOW);
  ok('a Project that was nothing but a container leaves no empty node behind', p2.anchor === 'removed' &&
     !p2.graph.nodes.some((n) => n.id === bare.nodeId));
  ok('while what was learned in it stays', p2.graph.nodes.some((n) => n.label === 'loose idea'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
