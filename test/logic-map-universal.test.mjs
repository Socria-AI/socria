// test/logic-map-universal.test.mjs — THE LOGIC MAP DRAWS ALMOST ANYTHING (Logos 5).
//
// The map was a picture of the person's reasoning and nothing else: "the map
// tracks this conversation, not the subject". It now holds two kinds of thing
// — the person's thinking, analysed as it always was, and a drawing of the
// subject (origin "drawn"): a flowchart, a cycle, a hierarchy, a concept map,
// cause and effect, the parts of something, a timeline. This suite holds:
//
//   1. the model     new kinds of thing and of connection, what a line says,
//                    when a thing comes, where it sits, what it says opened
//   2. old maps      every map saved before this reads back exactly as it was
//   3. caps          a drawing has room for 24 parts; nothing else grows
//   4. the shapes    the five new grammars, read and satisfied
//   5. routing       a diagram asked for opens the Logic Map; a picture, the
//                    Make list and plain conversation do not move
//   6. the map pass  when it runs, and what it is told
//   7. editing       a drawing edited by hand, deterministically
//   8. the free plan a drawing kept whole or not at all, never over-charged
//   9. AR and lenses every new connection has words, every lens a caption
//  10. integration   a reply's diagram, the Logic Map and Artifacts
//  11. review        what an independent review found, each held here

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as U from './.tmp/universal-map-under-test.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = JSON.stringify;
const n = (id, type, label, extra = {}) => ({ id, type, label, ...extra });
const e = (from, to, relation, extra = {}) => ({ from, to, relation, ...extra });
const drawn = (id, type, label, extra = {}) => n(id, type, label, { origin: 'drawn', ...extra });

const WATER = {
  context: 'learning',
  title: 'The water cycle',
  building: { kind: 'cycle', by: 'extractor', confidence: 0.9, why: 'stages that return to the start' },
  nodes: [
    n('q', 'question', 'How does the water cycle work?'),
    drawn('ev', 'process', 'Evaporation', { role: 'stage', detail: 'The sun heats surface water and it rises as vapour.', at: '1' }),
    drawn('co', 'process', 'Condensation', { role: 'stage', detail: 'Vapour cools into droplets that form clouds.', at: '2' }),
    drawn('pr', 'process', 'Precipitation', { role: 'stage', detail: 'Droplets join and fall as rain, snow or hail.', at: '3' }),
    drawn('cl', 'process', 'Collection', { role: 'stage', detail: 'Water gathers in oceans, lakes and the ground.', at: '4' }),
  ],
  edges: [
    e('ev', 'co', 'becomes', { label: 'rises and cools' }),
    e('co', 'pr', 'leads_to', { label: 'droplets join' }),
    e('pr', 'cl', 'flows_to', { label: 'falls' }),
    e('cl', 'ev', 'leads_to', { label: 'heated again' }),
    e('q', 'ev', 'applies_to'),
  ],
};

console.log('\n=== 1. the model: anything at all, drawn ===');
{
  for (const t of ['entity', 'process', 'event', 'state', 'actor', 'component', 'category', 'quantity']) ok(`a kind of thing: ${t}`, U.NODE_TYPES.includes(t));
  for (const r of ['causes', 'inhibits', 'is_a', 'flows_to', 'becomes']) ok(`a kind of connection: ${r}`, U.RELATIONS.includes(r));
  ok('a part can be drawn by Socria: origin "drawn"', U.NODE_ORIGINS.includes('drawn'));
  for (const t of ['claim', 'evidence', 'assumption', 'question', 'decision', 'constraint', 'equation', 'step']) ok(`…and the reasoning kinds are all still there: ${t}`, U.NODE_TYPES.includes(t));
  for (const r of ['supports', 'conflicts', 'depends', 'relates', 'leads_to', 'precedes', 'part_of', 'transforms_to']) ok(`…and the reasoning connections: ${r}`, U.RELATIONS.includes(r));

  const m = U.sanitizeMap(WATER);
  ok('a drawing keeps its title', m.title === 'The water cycle', J(m.title));
  ok('every part keeps "drawn"', m.nodes.filter((x) => x.origin === 'drawn').length === 4);
  ok('the question stays theirs (no origin)', !m.nodes.find((x) => x.id === 'q').origin);
  ok('what a part says when opened is kept', m.nodes.find((x) => x.id === 'ev').detail === 'The sun heats surface water and it rises as vapour.');
  ok('when it comes is kept', m.nodes.find((x) => x.id === 'pr').at === '3');
  ok('what a line says is kept', m.edges.find((x) => x.from === 'ev').label === 'rises and cools');
  ok('a loop keeps both directions of a directed relation', m.edges.some((x) => x.from === 'cl' && x.to === 'ev') && m.edges.some((x) => x.from === 'ev' && x.to === 'co'));

  const long = U.sanitizeMap({
    title: 'T'.repeat(200),
    nodes: [drawn('a', 'entity', 'Heart', { detail: 'D'.repeat(900), at: 'A'.repeat(90), group: 'G'.repeat(90) }), drawn('b', 'component', 'Left ventricle', { group: 'Heart' })],
    edges: [e('b', 'a', 'part_of', { label: 'L'.repeat(90) })],
  });
  const a = long.nodes.find((x) => x.id === 'a');
  ok('each field is cut to what it holds', long.title.length === U.DRAWING_LIMITS.title && a.detail.length === U.DRAWING_LIMITS.detail && a.at.length === U.DRAWING_LIMITS.at && a.group.length === U.DRAWING_LIMITS.group && long.edges[0].label.length === U.DRAWING_LIMITS.edgeLabel, J({ t: long.title.length, d: a.detail.length, at: a.at.length, g: a.group.length, l: long.edges[0].label.length }));
  ok('a part keeps the region it sits in', long.nodes.find((x) => x.id === 'b').group === 'Heart');

  const same = U.sanitizeMap({ nodes: [drawn('a', 'entity', 'Nucleus', { detail: 'nucleus' })], edges: [] });
  ok('a detail that only repeats the label is dropped', !same.nodes[0].detail, J(same.nodes[0]));

  const kinds = U.sanitizeMap({ nodes: [n('a', 'organism', 'Frog'), n('b', 'reaction', 'Photosynthesis'), n('c', 'person', 'The Speaker'), n('d', 'part', 'Piston'), n('f', 'class', 'Mammals'), n('g', 'rate', 'Interest rate'), n('h', 'mechanism', 'Natural selection')], edges: [] });
  const t = Object.fromEntries(kinds.nodes.map((x) => [x.id, x.type]));
  ok('near misses become the nearest kind of thing', t.a === 'entity' && t.b === 'process' && t.c === 'actor' && t.d === 'component' && t.f === 'category' && t.g === 'quantity' && t.h === 'process', J(t));

  const math = U.sanitizeMap({ context: 'math', nodes: [n('a', 'quantity', 'a = 3'), n('b', 'process', 'Completing the square'), n('c', 'mechanism', 'Why it works')], edges: [] });
  const mt = Object.fromEntries(math.nodes.map((x) => [x.id, x.type]));
  ok('a mathematical map reads "quantity" as a given, as it always did (the working lens solves from it)', mt.a === 'given', J(mt));
  ok('…and "process" and "mechanism" as concepts, as before', mt.b === 'concept' && mt.c === 'concept', J(mt));
  const mathDrawn = U.sanitizeMap({ context: 'math', nodes: [drawn('m', 'quantity', 'Mass'), drawn('d', 'process', 'Diffusion'), n('g', 'quantity', 'a = 3')], edges: [] });
  const md = Object.fromEntries(mathDrawn.nodes.map((x) => [x.id, x.type]));
  ok('…but a drawing\'s parts are what they say they are, in a mathematical map too (review)', md.m === 'quantity' && md.d === 'process' && md.g === 'given', J(md));

  const bad = U.sanitizeMap({ nodes: [n('a', 'claim', 'X', { origin: 'painted' })], edges: [e('a', 'a', 'teleports')] });
  ok('an origin that is not one is dropped', !bad.nodes[0].origin);
}

console.log('\n=== 2. every map saved before this reads back exactly as it was ===');
{
  const legacy = JSON.parse(readFileSync(join(here, 'fixtures', 'legacy-maps.json'), 'utf8'));
  ok('the fixture holds old maps of every kind', legacy.maps.length >= 12, legacy.maps.length);
  for (const { name, saved } of legacy.maps) {
    const again = U.sanitizeMap(saved);
    ok(`unchanged: ${name}`, J(again) === J(saved), J({ was: saved, now: again }).slice(0, 600));
  }
  const keys = new Set();
  for (const { saved } of legacy.maps) {
    const again = U.sanitizeMap(saved);
    if (again.title !== undefined) keys.add('title');
    for (const x of again.nodes) for (const k of ['at', 'group', 'detail']) if (k in x) keys.add(k);
    for (const x of again.edges) if ('label' in x) keys.add('label');
    if (again.nodes.some((x) => x.origin === 'drawn')) keys.add('drawn');
  }
  ok('nothing new appears on an old map: no title, time, region, detail, line label or drawing', keys.size === 0, J([...keys]));
}

console.log('\n=== 3. caps: room for a drawing, and nothing else grows ===');
{
  ok('an ordinary map holds 16 cards', U.mapCaps({ context: 'argument' }).nodes === 16);
  ok('a process, plan or timeline holds 22', U.mapCaps({ building: { kind: 'process', by: 'extractor', confidence: 0.8, why: '' } }).nodes === 22);
  ok('a mathematical map holds 26', U.mapCaps({ context: 'math' }).nodes === 26);
  ok('a map holding a drawing holds 24 parts and 36 lines', J(U.mapCaps({ nodes: [{ origin: 'drawn' }] })) === J({ nodes: 24, edges: 36 }));
  for (const k of ['cycle', 'hierarchy', 'concept', 'causal', 'parts']) ok(`…and so does a map read as a ${k}`, U.mapCaps({ building: { kind: k, by: 'extractor', confidence: 0.8, why: '' } }).nodes === 24 && U.DIAGRAM_KINDS.has(k));
  ok('a system of someone\'s own thinking keeps 16 — only a drawn system has a drawing\'s room', U.mapCaps({ building: { kind: 'system', by: 'extractor', confidence: 0.8, why: '' } }).nodes === 16 && !U.DIAGRAM_KINDS.has('system') && U.mapCaps({ building: { kind: 'system', by: 'extractor', confidence: 0.8, why: '' }, nodes: [{ origin: 'drawn' }] }).nodes === 24);
  ok('a mathematical drawing keeps the mathematical caps', U.mapCaps({ context: 'math', nodes: [{ origin: 'drawn' }] }).nodes === 26);
  const big = (origin) => ({ nodes: Array.from({ length: 30 }, (_, i) => n(`p${i}`, 'component', `Part ${i + 1}`, origin ? { origin } : {})), edges: [] });
  ok('a drawing of 30 parts keeps 24', U.sanitizeMap(big('drawn')).nodes.length === 24);
  ok('30 of the person\'s ideas still keep 16', U.sanitizeMap(big(null)).nodes.length === 16);
}

console.log('\n=== 4. the shapes: cycle, hierarchy, concept map, cause and effect, parts ===');
{
  for (const g of ['cycle', 'hierarchy', 'concept', 'causal', 'parts']) ok(`a grammar: ${g}`, U.GRAMMAR_IDS.includes(g) && !!U.GRAMMARS[g].builds && U.GRAMMARS[g].draws.length > 0);
  for (const r of ['stage', 'category', 'member', 'concept', 'cause', 'effect', 'whole', 'part', 'input', 'output']) ok(`a role: ${r}`, U.ROLES.includes(r));
  for (const [said, want] of [['show this as a cycle', 'cycle'], ['turn it into a family tree', 'hierarchy'], ['lay this out as a concept map', 'concept'], ['show it as a fishbone', 'causal'], ['make this into a labelled diagram', 'parts']])
    ok(`said: "${said}" → ${want}`, U.statedBuilding(said) === want, U.statedBuilding(said));
  // a drawing's shapes are named only by asking for one: what a thing IS in passing is not a request (review)
  for (const said of ["No, the earth isn't flat, it's round.", 'This is an outline for my essay', 'This is a breakdown of my costs', "it's a tree", 'it loops back round', 'this is really a cycle'])
    ok(`said in passing: "${said}" — no shape`, U.statedBuilding(said) === null, U.statedBuilding(said));
  for (const [said, want] of [['this is really a timeline', 'timeline'], ["it's really a process", 'process']])
    ok(`…while a thinking shape said outright still is one: "${said}" → ${want}`, U.statedBuilding(said) === want, U.statedBuilding(said));
  const water = U.sanitizeMap(WATER);
  ok('the water cycle has a loop', U.hasLoop(water));
  ok('…and satisfies the cycle', U.satisfies(water, 'cycle'));
  const line = U.sanitizeMap({ nodes: [drawn('a', 'step', 'A', { role: 'stage' }), drawn('b', 'step', 'B', { role: 'stage' }), drawn('c', 'step', 'C', { role: 'stage' })], edges: [e('a', 'b', 'leads_to'), e('b', 'c', 'leads_to')] });
  ok('a line with no way back is not a cycle', !U.hasLoop(line) && !U.satisfies(line, 'cycle'));
  const tree = U.sanitizeMap({ nodes: [drawn('k', 'category', 'Rocks', { role: 'category' }), drawn('i', 'category', 'Igneous', { role: 'member' }), drawn('s', 'category', 'Sedimentary', { role: 'member' }), drawn('m', 'category', 'Metamorphic', { role: 'member' })], edges: [e('i', 'k', 'is_a'), e('s', 'k', 'is_a'), e('m', 'k', 'is_a')] });
  ok('three kinds of rock under "Rocks" satisfy a hierarchy', U.satisfies(tree, 'hierarchy'));
  const cell = U.sanitizeMap({ nodes: [drawn('c', 'entity', 'Plant cell', { role: 'whole' }), drawn('n', 'component', 'Nucleus', { role: 'part' }), drawn('w', 'component', 'Cell wall', { role: 'part' }), drawn('k', 'component', 'Chloroplast', { role: 'part' })], edges: [e('n', 'c', 'part_of'), e('w', 'c', 'part_of'), e('k', 'c', 'part_of')] });
  ok('a cell and its parts satisfy parts', U.satisfies(cell, 'parts'));
  const concepts = U.sanitizeMap({ nodes: [drawn('p', 'concept', 'Plants'), drawn('o', 'concept', 'Oxygen'), drawn('l', 'concept', 'Light')], edges: [e('p', 'o', 'causes', { label: 'produce' }), e('l', 'p', 'relates', { label: 'powers' })] });
  ok('three ideas joined by two labelled lines satisfy a concept map', U.satisfies(concepts, 'concept'));
  const scores = U.structuralScores(water);
  ok('the structure reads the water cycle as a cycle first', Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] === 'cycle', J(scores));
}

console.log('\n=== 5. routing: a diagram asked for opens the Logic Map ===');
{
  const asked = [
    ['draw a flowchart of how a bill becomes law', 'process'], ['make a flowchart of the scientific method', 'process'], ['Flowchart for troubleshooting a printer', 'process'],
    ['draw the water cycle', 'cycle'], ['diagram the krebs cycle', 'cycle'], ['can you draw the water cycle?', 'cycle'], ['draw the life cycle of a frog', 'cycle'],
    ['draw an org chart for a small startup', 'hierarchy'], ['family tree of the Tudors', 'hierarchy'], ['please draw the hierarchy of the Catholic Church', 'hierarchy'], ['tree diagram for flipping two coins', 'hierarchy'],
    ['make a cause and effect diagram of the Great Depression', 'causal'], ['fishbone diagram for late deliveries', 'causal'], ['sketch the causes of World War 1', 'causal'],
    ['labelled diagram of a plant cell', 'parts'], ['draw the parts of a flower', 'parts'], ['draw the layers of the earth', 'parts'],
    ['block diagram of a computer', 'system'], ['draw how vaccines work', 'process'], ['diagram of how a bill becomes law', 'process'],
    ['show me a diagram of the water cycle', 'cycle'], ['make a diagram of the stages of mitosis', 'process'], ['timeline diagram of the space race', 'timeline'],
    ['can you draw a concept diagram of photosynthesis?', 'concept'],
    ['Could you please diagram the krebs cycle', 'cycle'], ['ok, now draw the causes of World War 1', 'causal'], ["I'd like you to draw the layers of the earth", 'parts'],
    ['draw a flowchart of how a circuit breaker trips', 'process'], ['a map of the causes of the war', 'causal'],
    ['I have a test tomorrow. Draw the water cycle.', 'cycle'], ['Thanks! Now can you draw the life cycle of a frog?', 'cycle'],
  ];
  for (const [t, shape] of asked) {
    const r = U.routeTurn({ text: t });
    ok(`"${t}" — the Logic Map, drawn as ${shape}`, r.intent === 'structure' && r.reveal?.view === 'logic_map' && r.diagram === shape && U.diagramAsked(t) === shape, J(r));
  }
  for (const t of ['concept map of the French Revolution', 'map out how the immune system works'])
    ok(`"${t}" — the Logic Map, as it always was`, U.routeTurn({ text: t }).intent === 'structure');
  const stays = [
    ['Can you show me a diagram of the field?', 'visual'], ['Draw the field', 'visual'], ['draw a diagram of the heart', 'visual'], ['make a venn diagram of cats and dogs', 'visual'],
    ['Make a flowchart: how a bill becomes law', 'visual'], ['Make a flowchart from this conversation', 'visual'], ['make a flowchart in Artifacts of my morning', 'visual'],
    ['plot y = x^2 and y = 2x + 1', 'visual'], ['visualize the data', 'visual'],
    ['show me the steps to solve 2x+3=7', 'conversation'], ['Can you show me how to factor this?', 'conversation'], ['how does a pendulum work?', 'conversation'],
    ['Illustrate the nitrogen cycle', 'conversation'], ['break down the water cycle for me', 'conversation'],
    // what the review found opening the Logic Map that should not: a chart is data to see, forces and
    // circuits are a picture, "draw" in a question is not a request to draw, and "show me" is not "draw"
    ['make a gantt chart of the phases of our launch', 'visual'], ['make a bar chart of the causes of death in the UK', 'visual'], ['Make a bar chart showing my steps per day', 'visual'],
    ['draw a graph of the cycle of sin x', 'visual'], ['draw a labelled diagram of the forces on a block on an inclined plane', 'visual'], ['pie chart of the parts of my budget', 'visual'],
    ['chart of the stages of grief', 'visual'], ['labelled diagram of an electric circuit', 'conversation'],
    ['What lessons can I draw from the hiring process?', 'conversation'], ['I want to draw a line under this project', 'conversation'], ['he drew the hierarchy out on a napkin', 'conversation'],
    ['show me the class hierarchy in this code', 'conversation'], ['show me the React component lifecycle methods', 'conversation'],
    ['What lessons can I draw from the hiring process? I think it went badly.', 'conversation'], ['I drew the water cycle in class.', 'conversation'],
  ];
  for (const [t, intent] of stays) ok(`"${t}" — not moved (${intent})`, U.routeTurn({ text: t }).intent === intent && !U.diagramAsked(t), J(U.routeTurn({ text: t })));
  ok('a picture asked for is still something to see in Artifacts', U.askedToSee('Draw the field') && !U.askedToSee('draw the water cycle'));
  for (const t of ['make a bar chart of the causes of death in the UK', 'chart of the stages of grief', 'make a gantt chart of the phases of our launch', 'Make a flowchart: how a bill becomes law'])
    ok(`"${t}" — a chart or the Make list is never drawn on the map in the background either`, !U.drawable(t) && !U.routeTurn({ text: t }).draw, J(U.routeTurn({ text: t })));
  for (const t of ['show me the class hierarchy in this code', 'show me the React component lifecycle methods'])
    ok(`"${t}" — nothing drawn: neither a cycle nor an institution's hierarchy`, !U.drawable(t), U.drawable(t));
}

console.log('\n=== 6. the map pass: drawn beside a question whose subject has a shape ===');
{
  const shaped = [
    ['explain the water cycle', 'cycle'], ['what caused World War I?', 'causal'], ['how is the UK parliament structured?', 'hierarchy'], ['what are the stages of mitosis?', 'process'],
    ['what are the types of rock?', 'hierarchy'], ['give me a timeline of the French Revolution', 'timeline'], ['how does a bill become law?', 'process'], ['effects of social media on teenagers', 'causal'],
    ['Illustrate the nitrogen cycle', 'cycle'],
    // "show me" asks to see the subject, not to open the map: answered in the conversation, drawn beside it
    ['show me the carbon cycle', 'cycle'], ['show me the hierarchy of the Catholic Church', 'hierarchy'], ['tell me about the carbon cycle', 'cycle'], ['show me the causes of the Great Depression', 'causal'],
  ];
  for (const [t, shape] of shaped) {
    const r = U.routeTurn({ text: t });
    ok(`"${t}" — still a question in the conversation, the subject drawn as ${shape}`, r.intent === 'conversation' && r.reveal === null && r.draw === shape && U.drawable(t) === shape, J(r));
    ok(`  …and the map pass runs for it`, U.needsMap({ route: r, view: 'chat', filler: false, turnsSinceMap: 0, neverDrawn: false }).why === 'draw');
  }
  for (const t of ['what caused my headache this morning?', 'why did my startup fail?', 'what are the steps of my plan?', 'tell me about the history of Rome', 'why is the sky blue?', 'how does a pendulum work?', 'ok thanks'])
    ok(`"${t}" — nothing to draw`, !U.routeTurn({ text: t }).draw && !U.drawable(t), J(U.routeTurn({ text: t })));
  ok('an "ok" never runs it', !U.needsMap({ route: U.routeTurn({ text: 'explain the water cycle' }), view: 'chat', filler: true, turnsSinceMap: 0, neverDrawn: false }).map);
  ok('a free account\'s week is not spent on it: unasked, it waits (the reply draws its own diagram)', !U.needsMap({ route: U.routeTurn({ text: 'explain the water cycle' }), view: 'chat', filler: false, turnsSinceMap: 0, neverDrawn: false, drawUnasked: false }).map);
  ok('  …and asked for, it is drawn whatever the plan', U.needsMap({ route: U.routeTurn({ text: 'draw the water cycle' }), view: 'chat', filler: false, turnsSinceMap: 0, neverDrawn: false, drawUnasked: false }).map);
  const appSrc = readFileSync(join(here, '..', 'components', 'LogosApp.tsx'), 'utf8');
  ok('  the app draws unasked for Socria One and a guest only', /drawUnasked: one \|\| !isSignedIn/.test(appSrc));
  ok('a diagram asked for runs it', U.needsMap({ route: U.routeTurn({ text: 'draw the water cycle' }), view: 'chat', filler: false, turnsSinceMap: 0, neverDrawn: true }).why === 'structure');

  const I = U.mapInstructions();
  ok('the extractor is told the map holds two kinds of thing', /ONE MAP, TWO KINDS OF THING ON IT/.test(I) && /THE PERSON'S THINKING/.test(I) && /THE SUBJECT, DRAWN/.test(I));
  ok('…to draw when asked, and when it would teach', /WHEN THEY ASK, DRAW IT/.test(I) && /WHEN IT WOULD TEACH, DRAW IT/.test(I));
  ok('…accuracy before completeness, and almost no words', /ACCURACY BEFORE COMPLETENESS/.test(I) && /ALMOST NO WORDS ON THE DRAWING/.test(I));
  ok('…to keep a drawing current rather than draw it fresh', /KEEP A DRAWING CURRENT, NOT FRESH/.test(I));
  ok('…every part of a drawing marked "drawn", with a title', /"origin": "drawn"/.test(I) && /"title"/.test(I));
  ok('…the new connections by name', ['causes', 'inhibits', 'is_a', 'flows_to', 'becomes'].every((r) => I.includes(r)));
  ok('…a line\'s words, a part\'s time, region and detail', /"label"/.test(I) && /"at"/.test(I) && /"group"/.test(I) && /"detail"/.test(I));
  ok('the old restriction is gone: the map no longer refuses the subject', !/THE MAP TRACKS THIS CONVERSATION, NOT THE SUBJECT/.test(I) && !/Not a concept map of the subject/.test(I));
  ok('the person\'s thinking is still analysed: claims, evidence, assumptions and how they relate', /claim/.test(I) && /evidence/.test(I) && /assumption/.test(I) && /supports/.test(I) && /conflicts/.test(I));
  ok('the instructions are the same on every call (the provider caches them)', U.mapInstructions() === I);
  const route = readFileSync(join(here, '..', 'app', 'api', 'logos', 'map', 'route.ts'), 'utf8');
  ok('the map route tells the pass what was asked for, after the cached instructions', /drawingAsked\(drawing, shaped\)/.test(route) && /=== ASKED FOR THIS TURN ===/.test(route) && /=== THIS TURN'S SUBJECT ===/.test(route));
  ok('…drafts no display in Artifacts for a diagram the Logic Map draws', /const displayWords = drawing \? null : readDisplayRequest/.test(route));
  ok('…and never rewires a map holding a drawing to fit one shape', /holdsDrawing/.test(route) && /!holdsDrawing && next\.nodes\.length >= 3/.test(route));
}

console.log('\n=== 7. editing a drawing by hand ===');
{
  const base = U.sanitizeMap(WATER);
  const apply = (edits) => U.applyMapEdits(base, edits);
  {
    const r = apply([{ op: 'retype', id: 'pr', type: 'event' }]);
    ok('retype: precipitation is an event now', r.map.nodes.find((x) => x.id === 'pr').type === 'event' && /is now a event|is now an event/.test(r.applied[0].said), J(r.applied));
    ok('…a kind that is not one is refused, and said', apply([{ op: 'retype', id: 'pr', type: 'banana' }]).refused.length === 1);
  }
  {
    const r = apply([{ op: 'detail', id: 'co', detail: '  Water vapour cools at altitude  ' }]);
    ok('detail: what it says when opened', r.map.nodes.find((x) => x.id === 'co').detail === 'Water vapour cools at altitude');
    const cleared = U.applyMapEdits(r.map, [{ op: 'detail', id: 'co', detail: '' }]);
    ok('…cleared', !('detail' in cleared.map.nodes.find((x) => x.id === 'co')) && /Cleared/.test(cleared.applied[0].said));
    const long = apply([{ op: 'detail', id: 'co', detail: 'x'.repeat(999) }]);
    ok('…cut to what a saved map keeps', long.map.nodes.find((x) => x.id === 'co').detail.length === U.DRAWING_LIMITS.detail);
    ok('…and survives a save', U.sanitizeMap(long.map).nodes.find((x) => x.id === 'co').detail.length === U.DRAWING_LIMITS.detail);
  }
  {
    const r = apply([{ op: 'at', id: 'ev', at: 'Stage 1' }, { op: 'group', id: 'cl', group: 'Oceans and lakes' }]);
    ok('at and group: when it comes, where it sits', r.map.nodes.find((x) => x.id === 'ev').at === 'Stage 1' && r.map.nodes.find((x) => x.id === 'cl').group === 'Oceans and lakes', J(r.applied));
  }
  {
    const r = apply([{ op: 'edge', from: 'pr', to: 'cl', label: 'runs off' }]);
    ok('edge: what a line says', r.map.edges.find((x) => x.from === 'pr' && x.to === 'cl').label === 'runs off' && /now says/.test(r.applied[0].said));
    const back = apply([{ op: 'edge', from: 'cl', to: 'pr', relation: 'causes' }]);
    ok('…either end may be named, and its kind changed', back.map.edges.find((x) => x.from === 'pr' && x.to === 'cl').relation === 'causes');
    ok('…a line that is not there is refused, and said', apply([{ op: 'edge', from: 'ev', to: 'pr', label: 'x' }]).refused.length === 1);
    ok('…a kind of line that is not one is refused', apply([{ op: 'edge', from: 'pr', to: 'cl', relation: 'teleports' }]).refused.length === 1);
    const cleared = U.applyMapEdits(r.map, [{ op: 'edge', from: 'pr', to: 'cl', label: '' }]);
    ok('…an empty label clears it', !('label' in cleared.map.edges.find((x) => x.from === 'pr' && x.to === 'cl')));
  }
  {
    const r = apply([{ op: 'title', title: 'How water moves around the Earth' }]);
    ok('title: what the drawing is of', r.map.title === 'How water moves around the Earth');
    ok('…taken off', !('title' in U.applyMapEdits(r.map, [{ op: 'title', title: ' ' }]).map));
  }
  {
    const r = apply([{ op: 'add', node: { label: 'Transpiration', type: 'process', origin: 'drawn', detail: 'Plants give off water vapour.', group: 'Land' }, near: 'ev' }]);
    const t = r.map.nodes.find((x) => x.label === 'Transpiration');
    ok('add: a part added to the drawing is part of it, with what it says and where it sits', t?.origin === 'drawn' && t.detail === 'Plants give off water vapour.' && t.group === 'Land', J(t));
  }
  {
    const r = apply([{ op: 'remove', id: 'cl' }]);
    ok('remove: a part taken off a drawing stays off — the extractor is not trusted to leave it', r.map.removed?.includes(U.keyOf('Collection')) && U.dropRemoved(U.sanitizeMap(WATER), r.map.removed).nodes.every((x) => x.label !== 'Collection'));
  }
  {
    const r = apply([{ op: 'rename', id: 'ev', label: 'Evaporation from the sea' }]);
    ok('rename keeps a part of the drawing a part of it', r.map.nodes.find((x) => x.id === 'ev').origin === 'drawn' && r.map.nodes.find((x) => x.id === 'ev').detail);
  }
  const old = JSON.parse(readFileSync(join(here, 'fixtures', 'legacy-maps.json'), 'utf8')).maps[0].saved;
  ok('an old map edited the old ways gains no new fields', J(Object.keys(U.applyMapEdits(old, [{ op: 'rename', id: old.nodes[0].id, label: 'Renamed' }]).map).sort()) === J(Object.keys(old).sort()));
}

console.log('\n=== 8. the free plan: a drawing kept whole or not at all ===');
{
  const before = { nodes: [n('q', 'question', 'Q')], edges: [] };
  const after = {
    nodes: [n('q', 'question', 'Q'), n('mine', 'claim', 'My new idea'), drawn('d1', 'process', 'A'), drawn('d2', 'process', 'B'), drawn('d3', 'process', 'C'), drawn('d4', 'process', 'D')],
    edges: [e('d1', 'd2', 'leads_to'), e('d2', 'd3', 'leads_to'), e('d3', 'd4', 'leads_to'), e('mine', 'q', 'relates')],
  };
  const whole = (id) => id.startsWith('d');
  const all = U.keepAddedNodes(after, before, 10, whole);
  ok('with room for everything, everything stays', all.kept === 5 && all.dropped.length === 0);
  const short = U.keepAddedNodes(after, before, 3, whole);
  ok('with room for 3 of 5: their idea stays, the drawing (4) goes whole — never half a drawing', short.kept === 1 && J(short.dropped.sort()) === J(['d1', 'd2', 'd3', 'd4']) && short.map.nodes.some((x) => x.id === 'mine'), J(short));
  ok('…and every line that touched it goes with it', short.map.edges.every((x) => !whole(x.from) && !whole(x.to)));
  const exact = U.keepAddedNodes(after, before, 5, whole);
  ok('with exactly enough, all of it stays', exact.kept === 5);
  const plain = U.keepAddedNodes(after, before, 3);
  ok('a map with no drawing keeps the first ones, as before', plain.kept === 3 && plain.dropped.length === 2);
  const route = readFileSync(join(here, '..', 'app', 'api', 'logos', 'map', 'route.ts'), 'utf8');
  ok('the meter reads the room first and takes only what is kept', /room = await left\(userId, plan, 'nodes'\)/.test(route) && /want = keepAddedNodes\(map, current, room\.left, whole\)\.kept/.test(route) && /consume\(userId, plan, 'nodes', want, \{ upTo: true \}\)/.test(route));
}

console.log('\n=== 9. AR Mode and the lenses know every new connection ===');
{
  for (const r of ['causes', 'inhibits', 'is_a', 'flows_to', 'becomes']) {
    ok(`AR Mode says ${r} both ways`, Array.isArray(U.RELATION_WORDS[r]) && U.RELATION_WORDS[r].every((w) => typeof w === 'string' && w.length > 1), J(U.RELATION_WORDS[r]));
    ok(`a lens labels ${r}`, typeof U.RELATION_LABEL[r] === 'string' && U.RELATION_LABEL[r].length > 1);
  }
  for (const id of ['cycle', 'tree', 'parts', 'concept']) ok(`a lens: ${id}`, U.LENSES.some((l) => l.id === id && l.caption.length > 10));
  const water = U.sanitizeMap(WATER);
  ok('a drawing is offered its own lens, first', U.availableLenses(water)[0] === 'cycle' && U.ideaLenses(water).includes('cycle'), J(U.availableLenses(water)));
  const theirs = U.sanitizeMap({ nodes: [n('a', 'claim', 'A'), n('b', 'claim', 'B'), n('c', 'claim', 'C'), n('d', 'claim', 'D')], edges: [e('a', 'b', 'leads_to'), e('b', 'c', 'leads_to'), e('c', 'a', 'leads_to'), e('b', 'd', 'part_of'), e('c', 'd', 'part_of')] });
  ok('a map of someone\'s own thinking keeps exactly the lenses it had, loop and all', !U.availableLenses(theirs).some((l) => ['cycle', 'tree', 'parts', 'concept'].includes(l)), J(U.availableLenses(theirs)));
}

console.log('\n=== 10. a drawing between a reply, the Logic Map and Artifacts ===');
{
  const REPLY = { type: 'diagram', view: 'cycle', title: 'The water cycle', nodes: [{ id: 'a', label: 'Evaporation', detail: 'the sun turns surface water to vapour' }, { id: 'b', label: 'Condensation' }, { id: 'c', label: 'Precipitation' }, { id: 'd', label: 'Collection' }], edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']] };
  const d = U.drawingFromInline(REPLY);
  ok('a reply\'s cycle becomes a drawing: every part drawn, in order round the loop', d.kind === 'cycle' && d.nodes.every((x) => x.origin === 'drawn' && x.role === 'stage') && d.nodes.map((x) => x.at).join() === '1,2,3,4' && d.edges.length === 4);
  ok('…each part keeps what it says when opened', d.nodes[0].detail === 'the sun turns surface water to vapour');
  const theirs = U.sanitizeMap({ context: 'learning', nodes: [n('q', 'question', 'Why does it rain?'), n('i', 'idea', 'Clouds hold water')], edges: [e('i', 'q', 'supports')], removed: [U.keyOf('Collection')] });
  const put = U.withDrawing(theirs, d);
  ok('put on the map: their thinking stays exactly as it was', 'map' in put && put.map.nodes.filter((x) => !x.origin).length === 2 && put.map.edges.some((x) => x.from === 'i' && x.to === 'q'), J(put));
  ok('…the drawing beside it, titled and shaped', put.map.title === 'The water cycle' && put.map.building.kind === 'cycle' && put.map.nodes.filter((x) => x.origin === 'drawn').length === 4);
  ok('…a part once taken off comes back, because they asked for this drawing', !(put.map.removed ?? []).includes(U.keyOf('Collection')));
  ok('…and it is the whole drawing a saved map keeps', U.sanitizeMap(put.map).nodes.length === 6 && U.satisfies(U.sanitizeMap(put.map), 'cycle'));
  const TREE = { type: 'diagram', view: 'tree', title: 'The US federal government', nodes: [{ id: 'g', label: 'Constitution' }, { id: 'l', label: 'Congress' }, { id: 'e', label: 'President' }, { id: 'j', label: 'Supreme Court' }], edges: [['g', 'l'], ['g', 'e'], ['g', 'j']] };
  const again = U.withDrawing(put.map, U.drawingFromInline(TREE));
  ok('a new drawing takes the place of the one before; their thinking still untouched', 'map' in again && again.map.title === 'The US federal government' && again.map.nodes.filter((x) => x.origin === 'drawn').length === 4 && !again.map.nodes.some((x) => x.label === 'Evaporation') && again.map.nodes.filter((x) => !x.origin).length === 2);
  ok('…a tree\'s lines point up, child to parent, as the map draws containment', again.map.edges.filter((x) => x.relation === 'part_of').every((x) => again.map.nodes.find((m) => m.id === x.to).label === 'Constitution'));
  ok('…and it satisfies a hierarchy', U.satisfies(again.map, 'hierarchy'));
  const full = U.sanitizeMap({ nodes: Array.from({ length: 16 }, (_, i) => n(`m${i}`, 'claim', `Claim ${i}`)), edges: [] });
  const big = U.drawingFromInline({ ...REPLY, nodes: Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, label: `Stage ${i}` })), edges: Array.from({ length: 10 }, (_, i) => [`s${i}`, `s${(i + 1) % 10}`]) });
  const no = U.withDrawing(full, big);
  ok('more than a map holds: nothing changes, and the reason is said — never half a drawing', 'refused' in no && /holds 24 cards/.test(no.refused), J(no));

  ok('a map with no drawing has nothing to keep', U.drawingOf(theirs) === null && U.diagramFromDrawing(theirs) === null);
  const kept = U.diagramFromDrawing(put.map);
  const state = U.sanitizeDiagram(kept);
  ok('Keep in Artifacts: the drawing as a Diagram display, read by its own kind', !!state && state.title === 'The water cycle' && state.nodes.length === 4 && state.edges.length === 4, J(kept));
  ok('…their own ideas stay on the map, not in the artifact', !state.nodes.some((x) => /Clouds|rain/.test(x.label)));
  ok('…what each part says opened is its note', state.nodes.find((x) => x.label === 'Evaporation').note === 'the sun turns surface water to vapour');
  const tree = U.sanitizeDiagram(U.diagramFromDrawing(again.map));
  ok('…a tree is kept as a hierarchy grown from its root, parent to child', tree.view === 'hierarchy' && tree.root && tree.nodes.find((x) => x.id === tree.root).label === 'Constitution' && tree.edges.every((x) => x.from === tree.root), J(tree));
  const cell = U.sanitizeMap({ title: 'A plant cell', building: { kind: 'parts' }, nodes: [drawn('c', 'entity', 'Plant cell', { role: 'whole' }), drawn('n', 'component', 'Nucleus', { role: 'part', group: 'Cytoplasm' }), drawn('w', 'component', 'Cell wall', { role: 'part', group: 'Boundary' })], edges: [e('n', 'c', 'part_of'), e('w', 'c', 'part_of')] });
  const cs = U.sanitizeDiagram(U.diagramFromDrawing(cell));
  ok('…the region a part sits in is its cluster', cs.nodes.find((x) => x.label === 'Nucleus').group === 'Cytoplasm');
  const flow = U.sanitizeMap({ title: 'How a bill becomes law', building: { kind: 'process' }, nodes: [drawn('a', 'event', 'Introduced', { role: 'start' }), drawn('b', 'step', 'Floor vote', { role: 'branch' }), drawn('c', 'event', 'Becomes law', { role: 'end' })], edges: [e('a', 'b', 'precedes'), e('b', 'c', 'leads_to', { when: 'passes' })] });
  const fs = U.sanitizeDiagram(U.diagramFromDrawing(flow));
  ok('…a process is kept as a flow, its conditions on its lines', fs.view === 'flow' && fs.edges.find((x) => x.from === 'b').label === 'passes', J(fs));
}

console.log('\n=== 11. what an independent review found, each held here ===');
{
  // AN EDIT REACHES THE LINE IT MEANS: two lines between the same two cards, or one each way
  const both = U.sanitizeMap({ context: 'learning', nodes: [n('a', 'claim', 'Rent is too high'), n('b', 'claim', 'Moving would help')], edges: [e('a', 'b', 'supports'), e('a', 'b', 'conflicts')] });
  ok('two lines between the same two cards are both kept by a save', both.edges.length === 2, J(both.edges));
  const r1 = U.applyMapEdits(both, [{ op: 'edge', from: 'a', to: 'b', was: 'conflicts', label: 'but not for long' }]);
  ok('an edit names its line by kind: the second line changes, the first does not', r1.map.edges.find((x) => x.relation === 'conflicts').label === 'but not for long' && !r1.map.edges.find((x) => x.relation === 'supports').label, J(r1.map.edges));
  ok('…a kind no line between them has is refused, and said', U.applyMapEdits(both, [{ op: 'edge', from: 'a', to: 'b', was: 'depends', label: 'x' }]).refused.length === 1);
  const loop = U.sanitizeMap({ nodes: [drawn('x', 'state', 'Ice'), drawn('y', 'state', 'Water')], edges: [e('y', 'x', 'becomes', { label: 'freezes' }), e('x', 'y', 'becomes', { label: 'melts' })] });
  const r2 = U.applyMapEdits(loop, [{ op: 'edge', from: 'x', to: 'y', label: 'thaws' }]);
  ok('a line each way: the edit reaches the line in the direction named, not the first one found', r2.map.edges.find((x) => x.from === 'x').label === 'thaws' && r2.map.edges.find((x) => x.from === 'y').label === 'freezes', J(r2.map.edges));

  // THE INSPECTOR'S FORM: each row is the line at its place
  const node = both.nodes.find((x) => x.id === 'a');
  const lines = both.edges.filter((x) => x.from === 'a' || x.to === 'a');
  const form = { label: node.label, type: node.type, detail: '', at: '', group: '', lines: lines.map((l) => ({ from: l.from, to: l.to, label: l.label ?? '', relation: l.relation })) };
  ok('the inspector: a form left as it was makes no edit', U.inspectorEdits(node, lines, form).length === 0);
  const words = U.inspectorEdits(node, lines, { ...form, lines: form.lines.map((l, i) => (i === 1 ? { ...l, label: 'but not for long' } : l)) });
  ok('…the second row edited names the second line by its kind', words.length === 1 && words[0].op === 'edge' && words[0].was === 'conflicts' && words[0].label === 'but not for long', J(words));
  const said = U.applyMapEdits(both, words).map.edges;
  ok('…and applied, it changes that line alone', said.find((x) => x.relation === 'conflicts').label === 'but not for long' && !said.find((x) => x.relation === 'supports').label, J(said));
  const kind = U.applyMapEdits(both, U.inspectorEdits(node, lines, { ...form, lines: form.lines.map((l, i) => (i === 0 ? { ...l, relation: 'depends' } : l)) })).map.edges;
  ok('…a row\'s kind changed changes that line\'s kind, the other line kept', kind.some((x) => x.relation === 'depends') && kind.some((x) => x.relation === 'conflicts') && !kind.some((x) => x.relation === 'supports'), J(kind));

  // THE KINDS IT OFFERS: none that a save would turn into another
  const keeps = (context, origin) => U.inspectorKinds(origin === 'drawn', context).filter((k) => U.sanitizeMap({ context, nodes: [n('a', k, 'X', origin ? { origin } : {})], edges: [] }).nodes[0]?.type !== k);
  ok('the inspector offers a mathematical map\'s own cards no kind a save would change ("process", "quantity")', !U.inspectorKinds(false, 'math').includes('process') && !U.inspectorKinds(false, 'math').includes('quantity') && keeps('math').length === 0, J(keeps('math')));
  ok('…a drawn part there, every kind, a drawing\'s first — each saved as itself', U.inspectorKinds(true, 'math')[0] === 'entity' && U.inspectorKinds(true, 'math').includes('quantity') && keeps('math', 'drawn').length === 0, J(keeps('math', 'drawn')));
  ok('…any other map, every kind', U.inspectorKinds(false, 'learning').length === U.NODE_TYPES.length && keeps('learning').length === 0, J(keeps('learning')));

  // THE FREE PLAN: never an empty map charged, a drawing left off said plainly
  ok('a drawing left off says what it needed and what was left', U.drawingNote(5, 1, 0) === 'This drawing needs 5 Logic Map nodes and only 1 Logic Map node is left this month, so it was not drawn — never half of it.', U.drawingNote(5, 1, 0));
  ok('…and that their own new ideas were kept, when there were some', U.drawingNote(4, 0, 2) === 'This drawing needs 4 Logic Map nodes and none are left this month, so it was not drawn — never half of it. Your own new ideas were kept.', U.drawingNote(4, 0, 2));
  const route = readFileSync(join(here, '..', 'app', 'api', 'logos', 'map', 'route.ts'), 'utf8');
  const read = route.indexOf("room = await left(userId, plan, 'nodes')"), claim = route.indexOf("claimUnit(userId, plan, 'maps', mapMark)");
  ok('the meter plans what it keeps before a first map is claimed, and claims none for a map left empty', read > 0 && claim > read && /const keeps = map\.nodes\.length - added\.length \+ want;/.test(route) && /if \(!hadMap && map\.nodes\.length > 0 && keeps > 0\)/.test(route));
  ok('…a drawing left off is said in its own words, and takes its title with it', /drawingNote\(dl\.needed, dl\.left, dl\.own\)/.test(route) && /a drawing left off takes its title with it/.test(route));
  ok('unasked, the map pass is never told to draw for a free account — the server agrees with the page', /const shaped: DiagramShape \| null = !drawing && !metered && typeof said === 'string' \? drawable\(said\) : null;/.test(route));
  const app = readFileSync(join(here, '..', 'components', 'LogosApp.tsx'), 'utf8');
  const at = app.indexOf('async function mapInline(');
  const inline = app.slice(at, at + 5000);
  const dry = inline.indexOf("applyMapEdits(current.map, [{ op: 'drawing', drawing }])"), ask = inline.indexOf("fetch('/api/logos/allowance'"), put = inline.indexOf("editMap([{ op: 'drawing', drawing }], { prepaid: true })");
  ok('a reply\'s diagram opened on the map, on the free plan: the allowance is asked first, the map changed only after', at > 0 && dry > 0 && ask > dry && put > ask, J({ at, dry, ask, put }));
  ok('…and the map is not charged for it a second time, nor refused by the page\'s own count, which may lag what the server granted', /if \(counting && fresh\.length && !opts\.prepaid\)/.test(app) && /const adding = !opts\.prepaid && edits\.some/.test(app));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
