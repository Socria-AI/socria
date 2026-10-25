// LOGOS 5: THE LOGIC MAP IS THE PERSON'S IDEAS; ARTIFACTS IS WHAT WAS MADE.
//
//   ideas      the Logic Map offers only the shapes of the thinking (a web, a
//              hierarchy, a flow, a timeline, tensions, evidence, a
//              comparison), and the web and hierarchy whatever the subject —
//              a maths conversation shows its ideas, not its plot
//   made       the plot, the worked solution and the working are not Logic
//              Map lenses; Logos 3's lens list is unchanged
//   make       every "what to make" choice is asked in words the existing
//              readers answer as something to make, shown in Artifacts
//
// lib/logos-layout.ts (ideaLenses, ideaLead, MADE_LENSES), lib/logos5/make.ts.

import { availableLenses, ideaLenses, ideaLead, IDEA_LENSES, MADE_LENSES, isMadeLens } from './.tmp/logos-layout.mjs';
import * as V from './.tmp/l5views-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;

const N = (id, type, label, extra = {}) => ({ id, type, label, ...extra });
const E = (from, to, relation) => ({ from, to, relation });

// a quadratic being solved: a chain of steps, a plottable function
const math = {
  context: 'math',
  nodes: [N('a', 'given', 'y = x^2 - 4'), N('b', 'step', 'x^2 - 4 = 0'), N('c', 'result', 'x = ±2'), N('d', 'question', 'why two roots?')],
  edges: [E('a', 'b', 'transforms_to'), E('b', 'c', 'transforms_to')],
  viz: null,
};
// an essay argument
const essay = {
  context: 'writing',
  nodes: [N('t', 'claim', 'School uniforms reduce bullying'), N('e', 'evidence', 'A 2019 district study'), N('k', 'counterpoint', 'They limit self-expression')],
  edges: [E('e', 't', 'supports'), E('k', 't', 'conflicts')],
  viz: null,
};
// a process being designed
const sequence = {
  context: 'planning',
  building: { kind: 'process', confidence: 0.9, source: 'extractor' },
  nodes: [N('s', 'idea', 'Sign up', { role: 'start' }), N('o', 'idea', 'Onboarding', { role: 'step' }), N('f', 'idea', 'First map', { role: 'end' })],
  edges: [E('s', 'o', 'precedes'), E('o', 'f', 'precedes')],
  viz: null,
};
// a model built: a document on the map
const model = {
  context: 'learning',
  building: { kind: 'model', confidence: 0.9, source: 'extractor' },
  nodes: [N('p', 'concept', 'Price'), N('q', 'concept', 'Quantity demanded')],
  edges: [E('p', 'q', 'relates')],
  viz: null,
  models: { docs: [{ id: 'm1', title: 'Demand' }] },
};

console.log('\n=== the two sets: the shapes of the thinking, and what was made ===');
ok('no lens is both an idea shape and a made thing', IDEA_LENSES.every((l) => !MADE_LENSES.includes(l)));
ok('the plot, the worked solution and the working are made', J([...MADE_LENSES]) === J(['plot', 'solve', 'work']) && MADE_LENSES.every(isMadeLens) && !isMadeLens('graph') && !isMadeLens(undefined));

console.log('\n=== the Logic Map offers only the ideas, whatever the subject ===');
for (const [name, map] of Object.entries({ math, essay, sequence, model })) {
  const ls = ideaLenses(map);
  ok(`${name}: nothing made among its lenses`, ls.every((l) => IDEA_LENSES.includes(l)), J(ls));
  ok(`${name}: the web of how it connects is always there`, ls.includes('graph'), J(ls));
  ok(`${name}: and its hierarchy, with more than one idea`, ls.includes('structure'), J(ls));
  ok(`${name}: it opens on one of them`, ls.includes(ideaLead(ls, map.building)), J({ ls, lead: ideaLead(ls, map.building) }));
}
ok('a maths conversation opens on its ideas, not its working', ideaLead(ideaLenses(math), math.building) === 'graph', ideaLead(ideaLenses(math), math.building));
ok('a model being built opens on its ideas, not on the model', !isMadeLens(ideaLead(ideaLenses(model), model.building)));
ok('a process opens as a flow, as it always has', ideaLead(ideaLenses(sequence), sequence.building) === 'flow', J(ideaLenses(sequence)));
ok('an argument still shows what pulls against it and what it rests on', ['tensions', 'evidence'].every((l) => ideaLenses(essay).includes(l)), J(ideaLenses(essay)));
ok('nothing on the map, no shape to offer', J(ideaLenses({ context: null, nodes: [], edges: [], viz: null })) === '[]');
ok('one idea: the web, and no hierarchy of one', J(ideaLenses({ context: 'math', nodes: [N('x', 'equation', 'y = 2x')], edges: [], viz: null })) === J(['graph']));

console.log('\n=== Logos 3 is unchanged: its map still offers the working and the plot ===');
ok('a maths map still has its solution lens there', availableLenses(math).includes('solve'), J(availableLenses(math)));
ok('a model map still has its plot there', availableLenses(model).includes('plot'), J(availableLenses(model)));

console.log('\n=== what to make, chosen before asking ===');
ok('a short list, each named once', V.MAKE_CHOICES.length >= 8 && new Set(V.MAKE_CHOICES.map((c) => c.id)).size === V.MAKE_CHOICES.length);
ok('nothing on the list is a shape of the thinking (those are the Logic Map’s)', V.MAKE_CHOICES.every((c) => !/mind map|concept map|argument map|decision tree/i.test(c.label)));
const DISPLAY = { chart: 'data', table: 'compare', timeline: 'plan', plan: 'plan', checklist: 'plan', flowchart: 'diagram', proscons: 'crossroads', venn: 'venn' };
for (const c of V.MAKE_CHOICES) {
  for (const [typed, conv] of [['the causes of the French Revolution', false], ['rent 1200, food 400', true], ['', true]]) {
    const asked = V.askFor(c, typed, conv);
    const r = V.routeTurn({ text: asked });
    ok(`${c.label}${typed ? '' : ', nothing typed'}: asks to make it ("${asked}")`, r.intent === 'visual', J(r));
    ok(`${c.label}${typed ? '' : ', nothing typed'}: …and it is shown in Artifacts`, V.afterSend(r, { view: 'chat', beside: null }, false).view === 'artifacts');
    if (DISPLAY[c.id]) ok(`${c.label}${typed ? '' : ', nothing typed'}: the reader makes the same kind`, V.readDisplayRequest(asked)?.kind === DISPLAY[c.id], J(V.readDisplayRequest(asked)));
  }
  ok(`${c.label}: what they typed is kept, word for word`, V.askFor(c, '  y = x^2 - 3 ', false).includes('y = x^2 - 3'));
  ok(`${c.label}: has a prompt for the box`, c.placeholder.length > 8);
}
ok('nothing typed and no conversation: nothing to make it from, nothing sent', V.MAKE_CHOICES.every((c) => V.askFor(c, '   ', false) === null));
ok('an unknown choice is no choice', V.makeChoice('sculpture') === null && V.makeChoice(null) === null && V.makeChoice('chart')?.label === 'Chart');

console.log(`\nlogic-map-ideas: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
