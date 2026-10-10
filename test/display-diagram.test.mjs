// A DIAGRAM — Logos 3.5's concept maps, mind maps, hierarchies, flowcharts,
// decision trees and outlines.
//
// What is held down here: the state is canonical and survives a save; the
// views are projections of ONE set of nodes and connections, so moving
// between them never changes what the diagram holds (part of release
// workflow 7); every layout is deterministic and no two boxes overlap, at
// fixed sizes, on hand-made and on random diagrams; a decision tree rolls back
// to what a hand computation gives, and a missing payoff or probability, or
// chances that do not add up to one, are reported — never assumed; every edit
// is an operation, computed and undoable; what the person wrote is theirs;
// and words become operations only when they plainly name nodes of THIS
// diagram.

import { apply, create, currentOf, kindOf, sanitizeSpace, seek, EMPTY_SPACE } from './.tmp/index.mjs';
import {
  sanitizeDiagram, readDiagramOp, roots, rootOf, isTree, treeProblem, treeFrom, outlineOf, simpleIds, visible,
  rollback, probabilityProblems, tidyTree, hierarchyLayout, decisionLayout, flowLayout, radialLayout, conceptLayout,
  placedAt, placementOf, drawDiagram, askedView, DIAGRAM_LIMITS,
} from './.tmp/display-diagram.mjs';
import { stableKey } from './.tmp/display-base.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const same = (a, b) => stableKey(a) === stableKey(b);
const J = (v) => JSON.stringify(v);

// fixed box sizes for every layout check
const SIZE = { w: 120, h: 40, gapX: 20, gapY: 30 };
/** the first pair of boxes that overlap, or null — `skip` exempts a pair (two nodes the person placed on each other) */
function overlap(boxes, skip = () => false) {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (skip(a.id, b.id)) continue;
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1e-6 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 1e-6) return [a.id, b.id];
    }
  }
  return null;
}
const covers = (l, s) => l.boxes.length === s.nodes.length && s.nodes.every((n) => l.boxes.filter((b) => b.id === n.id).length === 1);
const inside = (l) => l.boxes.every((b) => b.x - b.w / 2 >= -1e-6 && b.y - b.h / 2 >= -1e-6 && b.x + b.w / 2 <= l.width + 1e-6 && b.y + b.h / 2 <= l.height + 1e-6);
const boxOf = (l, id) => l.boxes.find((b) => b.id === id);

// "Causes of the French Revolution" — a concept map that happens to be a tree
const causes = {
  title: 'Causes of the French Revolution',
  nodes: [
    { id: 'fr', label: 'French Revolution', by: 'person' },
    { id: 'money', label: 'Financial crisis', by: 'socria' },
    { id: 'ideas', label: 'Enlightenment ideas', by: 'socria' },
    { id: 'society', label: 'Social inequality', by: 'person' },
    { id: 'debt', label: 'War debts', by: 'socria' },
    { id: 'bread', label: 'Bread prices', by: 'socria' },
    { id: 'rousseau', label: 'Rousseau', by: 'socria' },
    { id: 'estates', label: 'Three estates', by: 'person' },
    { id: 'tax', label: 'Tax exemptions', by: 'socria' },
  ],
  edges: [
    { from: 'fr', to: 'money', label: 'caused by', by: 'socria' },
    { from: 'fr', to: 'ideas', by: 'socria' },
    { from: 'fr', to: 'society', by: 'person' },
    { from: 'money', to: 'debt', by: 'socria' },
    { from: 'money', to: 'bread', by: 'socria' },
    { from: 'ideas', to: 'rousseau', by: 'socria' },
    { from: 'society', to: 'estates', by: 'person' },
    { from: 'estates', to: 'tax', by: 'socria' },
  ],
};

// "Should we launch the app?" — EV(launch) = 0.6 × 10 + 0.4 × (−5) = 4 > 0
const launch = {
  title: 'Should we launch the app?',
  nodes: [
    { id: 'd', label: 'Launch the app?', kind: 'decision', by: 'person' },
    { id: 'm', label: 'Market response', kind: 'chance', by: 'person' },
    { id: 's', label: 'Strong demand', kind: 'outcome', value: 10, by: 'person' },
    { id: 'w', label: 'Weak demand', kind: 'outcome', value: -5, by: 'person' },
    { id: 'n', label: 'Keep the money', kind: 'outcome', value: 0, by: 'person' },
  ],
  edges: [
    { from: 'd', to: 'm', label: 'Launch', by: 'person' },
    { from: 'd', to: 'n', label: 'Do not launch', by: 'person' },
    { from: 'm', to: 's', prob: 0.6, by: 'person' },
    { from: 'm', to: 'w', prob: 0.4, by: 'person' },
  ],
};

// "How admissions works" — a flow with two loops back
const admissions = {
  title: 'How admissions works',
  view: 'flow',
  nodes: [
    { id: 'apply', label: 'Apply online', by: 'person' },
    { id: 'check', label: 'Check documents', by: 'person' },
    { id: 'review', label: 'Committee review', by: 'person' },
    { id: 'fix', label: 'Ask for missing papers', by: 'person' },
    { id: 'interview', label: 'Interview', by: 'person' },
    { id: 'reject', label: 'Rejection letter', by: 'person' },
    { id: 'offer', label: 'Offer', by: 'person' },
    { id: 'wait', label: 'Waitlist', by: 'person' },
  ],
  edges: [
    { from: 'apply', to: 'check', by: 'person' },
    { from: 'check', to: 'review', by: 'person' },
    { from: 'check', to: 'fix', by: 'person' },
    { from: 'fix', to: 'check', by: 'person' },
    { from: 'review', to: 'interview', by: 'person' },
    { from: 'review', to: 'reject', by: 'person' },
    { from: 'interview', to: 'offer', by: 'person' },
    { from: 'interview', to: 'wait', by: 'person' },
    { from: 'wait', to: 'review', by: 'person' },
  ],
};

// a deterministic stream of numbers for the random diagrams
let seed = 20261010;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (n) => 1 + Math.floor(rnd() * n);
function randomGraph(n, m, placedShare = 0) {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, label: `Idea ${i + 1}`, by: 'socria', ...(rnd() < placedShare ? { x: rnd(), y: rnd() } : {}) }));
  const edges = Array.from({ length: m }, () => ({ from: `r${pick(n)}`, to: `r${pick(n)}`, by: 'socria' }));
  return sanitizeDiagram({ title: 'Random', nodes, edges });
}
function randomTree(n) {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, label: `Branch ${i + 1}`, by: 'socria' }));
  const edges = nodes.slice(1).map((_, i) => ({ from: `t${pick(i + 1)}`, to: `t${i + 2}`, by: 'socria' }));
  return sanitizeDiagram({ title: 'Random tree', nodes, edges });
}

console.log('=== the state is canonical and checked ===');
{
  const s = sanitizeDiagram(causes);
  ok('a diagram is read', !!s && s.nodes.length === 9 && s.edges.length === 8);
  ok('  it opens as a concept map, in full detail', s.view === 'concept' && s.detail === 'full');
  ok('  the same state read twice is the same state', same(sanitizeDiagram(s), s));
  ok('  and survives being saved and reopened', same(sanitizeDiagram(JSON.parse(JSON.stringify(s))), s));
  const bad = sanitizeDiagram({
    title: 'x'.repeat(300),
    nodes: [
      { id: 'a', label: 'Alpha', by: 'person', x: 0.123456, y: 0.5 },
      { id: 'a', label: 'A duplicate id' },
      { label: '' },
      { id: 'c', label: '\u0000control\u0007 chars\n\nand   spaces', note: 'n'.repeat(400) },
      { id: 'd', label: 'L'.repeat(200), kind: 'chance', value: 99 },
      { id: 'e', label: 'Win', kind: 'outcome', value: '1,200' },
      { id: 'f', label: 'No kind', value: 5, x: 0.5 },
      { id: 'g', label: 'Off the page', x: 1.5, y: 0.2, kind: 'guess' },
    ],
    edges: [
      { from: 'a', to: 'nowhere' },
      { from: 'a', to: 'a' },
      { from: 'a', to: 'c', label: 'l'.repeat(90), prob: 0.25 },
      { from: 'a', to: 'c', label: 'again' },
      { from: 'c', to: 'a', prob: 1.5 },
      { from: 'd', to: 'e', p: 0.5 },
    ],
    root: 'nowhere',
    detail: 'medium',
  });
  ok('a duplicate id is renumbered', new Set(bad.nodes.map((n) => n.id)).size === bad.nodes.length && bad.nodes[1].id === 'n1');
  ok('an empty node is not a node', bad.nodes.length === 7);
  ok('control characters and runs of space are cleaned', bad.nodes[2].label === 'control chars and spaces');
  ok(`a label is capped at ${DIAGRAM_LIMITS.label}, a note at ${DIAGRAM_LIMITS.note}`, bad.nodes[3].label.length <= 80 && bad.nodes[2].note.length <= 240);
  ok('a payoff on a chance node is not kept — what it is worth is computed', !('value' in bad.nodes[3]));
  ok('an outcome keeps its payoff, read as a number', bad.nodes[4].value === 1200);
  ok('a payoff with no kind is not kept, and no kind is guessed', !('value' in bad.nodes[5]) && !('kind' in bad.nodes[5]));
  ok('a placement is both coordinates or neither', !('x' in bad.nodes[5]) && !('x' in bad.nodes[6]));
  ok('  kept to four decimals', bad.nodes[0].x === 0.1235 && bad.nodes[0].y === 0.5);
  ok('an unknown kind is dropped', !('kind' in bad.nodes[6]));
  ok('a link to nothing, and a self-link, are dropped', bad.edges.every((e) => e.from !== e.to && bad.nodes.some((n) => n.id === e.to)));
  ok('the same connection twice is kept once', bad.edges.filter((e) => e.from === 'a' && e.to === 'c').length === 1);
  ok(`a connection label is capped at ${DIAGRAM_LIMITS.edgeLabel}`, bad.edges[0].label.length <= 40);
  ok('a probability is kept between 0 and 1, and dropped outside', bad.edges[0].prob === 0.25 && !('prob' in bad.edges.find((e) => e.from === 'c')));
  ok('  "p" is read as a probability', bad.edges.find((e) => e.from === 'd').prob === 0.5);
  ok('a root that is not a node is dropped', !('root' in bad));
  ok('detail is full or simple', bad.detail === 'full');
  ok('a title is capped', bad.title.length <= 80);
  const many = sanitizeDiagram({ nodes: Array.from({ length: 80 }, (_, i) => ({ id: `k${i}`, label: `Node ${i}` })), edges: Array.from({ length: 200 }, (_, i) => ({ from: `k${i % 60}`, to: `k${(i + 1 + Math.floor(i / 60)) % 60}` })) });
  ok(`at most ${DIAGRAM_LIMITS.nodes} nodes and ${DIAGRAM_LIMITS.edges} connections`, many.nodes.length === 60 && many.edges.length === 90);
  const groups = sanitizeDiagram({ nodes: Array.from({ length: 12 }, (_, i) => ({ label: `G${i}`, group: `Group ${i}` })) });
  ok(`at most ${DIAGRAM_LIMITS.groups} groups`, new Set(groups.nodes.map((n) => n.group).filter(Boolean)).size === 8 && !groups.nodes[9].group);
  ok('a diagram with no nodes yet is a diagram', sanitizeDiagram({ title: 'Empty', nodes: [] })?.nodes.length === 0);
  ok('junk is not a diagram', sanitizeDiagram(null) === null && sanitizeDiagram('diagram') === null && sanitizeDiagram({}) === null && sanitizeDiagram({ nodes: 'x' }) === null);
  ok('a decision tree with sound chances opens as a decision tree', sanitizeDiagram(launch).view === 'decision');
  const off = sanitizeDiagram({ ...launch, edges: launch.edges.map((e) => (e.to === 'w' ? { ...e, prob: 0.3 } : e)) });
  ok('…and with chances that do not add up, as a concept map', off.view === 'concept');
}

console.log('\n=== its shape: roots, trees, the outline ===');
{
  const s = sanitizeDiagram(causes);
  ok('the root is the one node nothing points into', J(roots(s)) === J(['fr']) && rootOf(s) === 'fr');
  ok('it is a tree', isTree(s) && treeProblem(s) === null);
  const two = sanitizeDiagram({ ...causes, nodes: [...causes.nodes, { id: 'louis', label: 'Louis XVI' }] });
  ok('two tops is not a hierarchy, and says so', !isTree(two) && /2 tops/.test(treeProblem(two)) && rootOf(two) === null, treeProblem(two));
  ok('  until the person chooses the root', rootOf({ ...two, root: 'fr' }) === 'fr');
  const shared = sanitizeDiagram({ ...causes, edges: [...causes.edges, { from: 'money', to: 'estates' }] });
  ok('a node under two things is not a hierarchy, and says which', /‘Three estates’ sits under both ‘Financial crisis’ and ‘Social inequality’|‘Three estates’ sits under both ‘Social inequality’ and ‘Financial crisis’/.test(treeProblem(shared)), treeProblem(shared));
  const top = sanitizeDiagram({ ...causes, root: 'money' });
  ok('a chosen root with something above it says so', /‘Financial crisis’ is the root, but ‘French Revolution’ points into it/.test(treeProblem(top)), treeProblem(top));
  const island = sanitizeDiagram({ ...causes, nodes: [...causes.nodes, { id: 'x1', label: 'Loop one' }, { id: 'x2', label: 'Loop two' }], edges: [...causes.edges, { from: 'x1', to: 'x2' }, { from: 'x2', to: 'x1' }] });
  ok('a loop off on its own is not reached from the root', /not reached from ‘French Revolution’/.test(treeProblem(island)), treeProblem(island));
  ok('an empty diagram is not a hierarchy', /nothing/.test(treeProblem(sanitizeDiagram({ nodes: [] }))));
  const o = outlineOf(s);
  ok('the outline is depth first from the root, children in order', J(o.lines.map((l) => `${l.id}:${l.depth}`)) === J(['fr:0', 'money:1', 'debt:2', 'bread:2', 'ideas:1', 'rousseau:2', 'society:1', 'estates:2', 'tax:3']), J(o.lines));
  ok('  and nothing is loose', o.loose.length === 0);
  ok('with no root there is no outline, and everything is loose', outlineOf(two).lines.length === 0 && outlineOf(two).loose.length === 10);
  // a mind map radiates whichever way a line was drawn
  const pointing = sanitizeDiagram({ ...causes, edges: [...causes.edges, { from: 'louis', to: 'fr' }], nodes: [...causes.nodes, { id: 'louis', label: 'Louis XVI' }], root: 'fr' });
  const t = treeFrom(pointing, 'fr');
  ok('a line drawn into the root still joins the mind map', t.depth.get('louis') === 1 && t.loose.length === 0);
  ok('  but not the hierarchy, which follows the arrows', treeFrom(pointing, 'fr', true).loose.includes('louis'));
}

console.log('\n=== simple detail ===');
{
  const s = sanitizeDiagram(causes);
  ok('simple keeps the root and two levels beneath it', J(simpleIds(s)) === J(['fr', 'money', 'ideas', 'society', 'debt', 'bread', 'rousseau', 'estates']));
  const v = visible({ ...s, detail: 'simple' });
  ok('  and the connections among them', v.nodes.length === 8 && v.edges.length === 7 && !v.edges.some((e) => e.to === 'tax'));
  ok('in full detail everything is drawn', visible(s) === s);
  // two stars and no root: the best-connected twelve
  const nodes = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, label: `Star ${i}` }));
  const edges = [...Array.from({ length: 6 }, (_, i) => ({ from: 's0', to: `s${i + 2}` })), ...Array.from({ length: 4 }, (_, i) => ({ from: 's1', to: `s${i + 10}` }))];
  const stars = sanitizeDiagram({ nodes, edges });
  const keep = simpleIds(stars);
  ok('without a root, the 12 best-connected nodes', keep.length === 12 && keep.includes('s0') && keep.includes('s1'), J(keep));
  ok('  ties go to the earlier node, so it is the same every time', J(keep) === J(simpleIds(sanitizeDiagram(JSON.parse(JSON.stringify(stars))))) && !keep.includes('s19'));
}

console.log('\n=== layouts: no two boxes overlap, and the same diagram is always drawn the same ===');
{
  const s = sanitizeDiagram(causes);
  const h = hierarchyLayout(s, SIZE);
  ok('hierarchy: every node has one box', covers(h, s));
  ok('  no two boxes overlap', !overlap(h.boxes), J(overlap(h.boxes)));
  ok('  every box is inside the frame', inside(h));
  ok('  depth runs down the page', ['fr', 'money', 'debt', 'tax'].every((id, d) => Math.abs(boxOf(h, id).y - (d * 70 + 20)) < 1e-9));
  const centred = [['fr', ['money', 'society']], ['money', ['debt', 'bread']], ['estates', ['tax']]].every(([p, [a, b = a]]) => Math.abs(boxOf(h, p).x - (boxOf(h, a).x + boxOf(h, b).x) / 2) < 1e-9);
  ok('  each parent is centred over its first and last child', centred);
  const leaves = ['debt', 'bread', 'rousseau', 'tax'].map((id) => boxOf(h, id).x);
  ok('  leaves run left to right in order, a slot apart', leaves.every((x, i) => i === 0 || x - leaves[i - 1] >= 140 - 1e-9));
  ok('  the tree is drawn along its connections', h.tree.length === 8 && h.extra.length === 0);
  ok('  deterministic', same(hierarchyLayout(s, SIZE), h) && same(hierarchyLayout(sanitizeDiagram(JSON.parse(JSON.stringify(s))), SIZE), h));
  const dl = decisionLayout(sanitizeDiagram(launch), SIZE);
  ok('decision tree: drawn left to right, depth across', boxOf(dl, 'd').x < boxOf(dl, 'm').x && boxOf(dl, 'm').x < boxOf(dl, 's').x && !overlap(dl.boxes) && inside(dl));

  const f = sanitizeDiagram(admissions);
  const fl = flowLayout(f, SIZE);
  const layer = new Map(fl.layers.flatMap((l, i) => l.map((id) => [id, i])));
  ok('flow: every node has one box', covers(fl, f));
  ok('  no two boxes overlap', !overlap(fl.boxes), J(overlap(fl.boxes)));
  ok('  inside the frame', inside(fl));
  ok('  the loops are found and drawn back', J(fl.back.map((e) => e.join('>')).sort()) === J(['fix>check', 'wait>review']), J(fl.back));
  ok('  every other connection runs down the page', f.edges.filter((e) => !fl.back.some(([a, b]) => a === e.from && b === e.to)).every((e) => layer.get(e.to) > layer.get(e.from)));
  ok('  each node in the layer after the latest thing that leads to it', layer.get('apply') === 0 && layer.get('check') === 1 && layer.get('review') === 2 && layer.get('interview') === 3 && layer.get('offer') === 4, J(fl.layers));
  ok('  deterministic', same(flowLayout(f, SIZE), fl));

  const r = radialLayout(s, SIZE);
  ok('mind map: every node has one box', covers(r, s));
  ok('  no two boxes overlap', !overlap(r.boxes), J(overlap(r.boxes)));
  ok('  inside the frame', inside(r));
  ok('  the root is at the centre', Math.abs(boxOf(r, 'fr').x - r.centre.x) < 1e-9 && Math.abs(boxOf(r, 'fr').y - r.centre.y) < 1e-9);
  ok('  each ring further out than the last', r.rings.every((x, i) => i === 0 || x > r.rings[i - 1]));
  const ang = (id) => Math.atan2(boxOf(r, id).y - r.centre.y, boxOf(r, id).x - r.centre.x);
  const turn = (a, b) => ((ang(b) - ang(a)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  // leaves beneath: money 2, ideas 1, society 1 (of 4): the angle between neighbours is half their two shares
  ok('  each branch’s share of the circle is its share of the leaves', Math.abs(turn('money', 'ideas') - ((2 + 1) / 2) * (Math.PI / 2)) < 1e-9 && Math.abs(turn('ideas', 'society') - ((1 + 1) / 2) * (Math.PI / 2)) < 1e-9);
  ok('  deterministic', same(radialLayout(s, SIZE), r));
  const lonely = radialLayout(sanitizeDiagram({ ...causes, root: 'fr', nodes: [...causes.nodes, { id: 'z1', label: 'Unconnected' }, { id: 'z2', label: 'Also unconnected' }] }), SIZE);
  ok('  what the root does not reach is set in rows beneath, not dropped', J(lonely.loose) === J(['z1', 'z2']) && lonely.boxes.length === 11 && !overlap(lonely.boxes) && boxOf(lonely, 'z1').y > boxOf(lonely, 'tax').y);

  const placedDiagram = sanitizeDiagram({
    ...causes,
    nodes: causes.nodes.map((n) => (n.id === 'fr' ? { ...n, x: 0.5, y: 0.5 } : n.id === 'debt' ? { ...n, x: 0, y: 0 } : n.id === 'tax' ? { ...n, x: 1, y: 1 } : n)),
  });
  const c = conceptLayout(placedDiagram, SIZE);
  ok('concept map: every node has one box', covers(c, placedDiagram));
  ok('  no two boxes overlap', !overlap(c.boxes), J(overlap(c.boxes)));
  ok('  inside the frame', inside(c));
  ok('  what the person placed stays exactly where they put it', ['fr', 'debt', 'tax'].every((id) => {
    const n = placedDiagram.nodes.find((x) => x.id === id);
    const at = placedAt(n.x, n.y, c.width, c.height, SIZE.w, SIZE.h);
    return Math.abs(boxOf(c, id).x - at.x) < 1e-9 && Math.abs(boxOf(c, id).y - at.y) < 1e-9;
  }) && J(c.placed) === J(['fr', 'debt', 'tax']));
  ok('  a drag back into a placement is the inverse', same(placementOf(boxOf(c, 'fr').x, boxOf(c, 'fr').y, c.width, c.height, SIZE.w, SIZE.h), { x: 0.5, y: 0.5 }));
  ok('  deterministic', same(conceptLayout(placedDiagram, SIZE), c) && same(conceptLayout(sanitizeDiagram(JSON.parse(JSON.stringify(placedDiagram))), SIZE), c));

  // a forest, and a node reached twice
  const forest = tidyTree(['a', 'x'], (id) => ({ a: ['b', 'c'], b: ['c'], x: ['y'] })[id] ?? [], SIZE);
  ok('tidy tree: a forest stands side by side, a node reached twice is drawn once', forest.boxes.length === 5 && !overlap(forest.boxes) && boxOf(forest, 'x').x > boxOf(forest, 'c').x);

  // random diagrams, every layout
  let bad = null;
  for (let k = 0; k < 40 && !bad; k++) {
    const g = randomGraph(5 + Math.floor(rnd() * 56), Math.floor(rnd() * 90), k % 3 === 0 ? 0.25 : 0);
    const t = randomTree(2 + Math.floor(rnd() * 59));
    const placed = new Set(g.nodes.filter((n) => n.x !== undefined).map((n) => n.id));
    const bothPlaced = (a, b) => placed.has(a) && placed.has(b);
    const checks = [
      ['hierarchy', g, hierarchyLayout(g, SIZE)],
      ['flow', g, flowLayout(g, SIZE)],
      ['mind', g, radialLayout(g, SIZE)],
      ['concept', g, conceptLayout(g, SIZE), bothPlaced],
      ['hierarchy of a tree', t, hierarchyLayout(t, SIZE)],
      ['mind map of a tree', t, radialLayout(t, SIZE)],
      ['decision layout of a tree', t, decisionLayout(t, SIZE)],
    ];
    for (const [name, st, l, skip] of checks) {
      const o = overlap(l.boxes, skip);
      if (!covers(l, st) || o || !inside(l)) bad = `${name} #${k} (${st.nodes.length} nodes, ${st.edges.length} edges): ${o ? `${o} overlap` : 'boxes missing or outside'}`;
    }
    if (!bad && !same(conceptLayout(g, SIZE), conceptLayout(sanitizeDiagram(JSON.parse(JSON.stringify(g))), SIZE))) bad = `concept #${k} not deterministic`;
  }
  ok('40 random diagrams and trees: every layout covers every node, inside its frame, with no overlap, the same every time', !bad, bad);

  // what each view draws
  const views = ['concept', 'mind', 'hierarchy', 'flow', 'outline'].map((v) => [v, drawDiagram({ ...s, view: v }, SIZE)]);
  ok('each view draws every node of the diagram, and the outline is a list', views.every(([v, d]) => (v === 'outline' ? d === null : d.boxes.length === 9 && d.lines.length === 8 && !overlap(d.boxes))));
  const simple = drawDiagram({ ...s, view: 'mind', detail: 'simple' }, SIZE);
  ok('  in simple detail only what simple keeps', simple.boxes.length === 8 && simple.lines.length === 7);
  const flowDrawn = drawDiagram(sanitizeDiagram(admissions), SIZE);
  ok('  a flow marks its loops as running back', flowDrawn.lines.filter((l) => l.how === 'back').length === 2);
  const decisionDrawn = drawDiagram(sanitizeDiagram(launch), SIZE);
  ok('  a decision tree carries its probabilities and labels to the lines', decisionDrawn.lines.find((l) => l.to === 's').prob === 0.6 && decisionDrawn.lines.find((l) => l.to === 'm').label === 'Launch');
}

console.log('\n=== a decision tree, rolled back ===');
{
  const s = sanitizeDiagram(launch);
  const rb = rollback(s);
  ok('launching is worth 0.6 × 10 + 0.4 × (−5) = 4', rb.values.m === 4, J(rb.values));
  ok('  the decision takes the best option and records which: launch', rb.best.d === 'm' && rb.values.d === 4);
  ok('  outcomes are worth their payoffs', rb.values.s === 10 && rb.values.w === -5 && rb.values.n === 0);
  ok('  the chances add up to 1, and nothing is wrong', rb.sums.m === 1 && rb.problems.length === 0, J(rb.problems));
  const c = create(EMPTY_SPACE, 'diagram', launch, { name: 'D1', origin: 'person' });
  let space = c.space;
  const step = (op, args, by = 'person') => {
    const r = apply(space, c.obj.id, op, args, { by, at: 1 });
    if (r.ok) space = r.space;
    return r;
  };
  step('prob', { from: 'm', to: 's', p: 0.3 });
  const mid = step('prob', { from: 'm', to: 'w', p: 0.7 });
  const rb2 = rollback(currentOf(space.objs[0]));
  ok('at 0.3 / 0.7, launching is worth 0.3 × 10 + 0.7 × (−5) = −0.5', rb2.values.m === -0.5, J(rb2.values));
  ok('  so keeping the money is best', rb2.best.d === 'n' && rb2.values.d === 0);
  ok('  and the step said the chances add up again', /add up to 1 now/.test(mid.step.note ?? ''), mid.step.note);
  const off = step('prob', { from: 'm', to: 'w', p: 0.6 });
  ok('chances that do not add up are reported with the node and the sum', off.ok && /The chances out of ‘Market response’ add up to 0\.9, not 1\./.test(off.step.note ?? ''), off.step.note);
  const offState = currentOf(space.objs[0]);
  ok('  the value is not computed from them', rollback(offState).values.m === null && rollback(offState).values.d === null);
  ok('  the decision tree view says why it cannot draw it', /add up to 0\.9, not 1/.test(kindOf('diagram').views.find((v) => v.id === 'decision').unavailable(offState)));
  const asConcept = apply(space, c.obj.id, 'view', { view: 'concept' }, { by: 'person' });
  const asDecision = apply(asConcept.space, c.obj.id, 'view', { view: 'decision' }, { by: 'person' });
  ok('  and showing it as a decision tree is refused with that reason', asConcept.ok && !asDecision.ok && /add up to 0\.9, not 1/.test(asDecision.why), asDecision.why);
  const missing = sanitizeDiagram({ ...launch, edges: launch.edges.map((e) => (e.to === 'w' ? { from: 'm', to: 'w', by: 'person' } : e)) });
  const rm = rollback(missing);
  ok('a missing probability is reported, never assumed', rm.problems.includes('The branch from ‘Market response’ to ‘Weak demand’ has no probability.') && rm.values.m === null, J(rm.problems));
  ok('  the tree can still be drawn, with the gap shown', kindOf('diagram').views.find((v) => v.id === 'decision').unavailable(missing) === null);
  const both = probabilityProblems(sanitizeDiagram({ ...launch, edges: [...launch.edges.filter((e) => e.from !== 'm'), { from: 'm', to: 's', prob: 0.7 }, { from: 'm', to: 'w', prob: 0.5 }] }));
  ok('chances that add up to more than 1 are reported', J(both) === J(['The chances out of ‘Market response’ add up to 1.2, not 1.']), J(both));
  const third = sanitizeDiagram({
    ...launch,
    nodes: [...launch.nodes, { id: 'x', label: 'No demand', kind: 'outcome', value: -8 }],
    edges: [...launch.edges.filter((e) => e.from !== 'm'), { from: 'm', to: 's', prob: 0.7 }, { from: 'm', to: 'w', prob: 0.5 }, { from: 'm', to: 'x' }],
  });
  ok('  even with a branch still missing its chance', J(probabilityProblems(third)) === J(['The chances out of ‘Market response’ already add up to 1.2, more than 1.']), J(probabilityProblems(third)));
  ok('  a probability past 1 is never stored', sanitizeDiagram({ ...launch, edges: launch.edges.map((e) => (e.to === 's' ? { ...e, prob: 1.2 } : e)) }).edges.find((e) => e.to === 's').prob === undefined);
  const nopay = sanitizeDiagram({ ...launch, nodes: launch.nodes.map((n) => (n.id === 'w' ? { id: 'w', label: 'Weak demand', kind: 'outcome', by: 'person' } : n)) });
  const rn = rollback(nopay);
  ok('a missing payoff is reported, and nothing above it is computed', rn.problems.includes('‘Weak demand’ has no payoff yet.') && rn.values.m === null && rn.values.d === null && !rn.best.d);
  const unmarked = sanitizeDiagram({ ...launch, nodes: [...launch.nodes, { id: 'q', label: 'Wait a year' }], edges: [...launch.edges, { from: 'd', to: 'q' }] });
  ok('a node that is not marked is reported', rollback(unmarked).problems.includes('‘Wait a year’ is not marked as a decision, a chance or an outcome.'));
  const branching = sanitizeDiagram({ ...launch, nodes: [...launch.nodes, { id: 'q', label: 'Later', kind: 'outcome', value: 1 }], edges: [...launch.edges, { from: 'n', to: 'q' }] });
  ok('an outcome with branches after it is reported', rollback(branching).problems.includes('‘Keep the money’ is an outcome but has branches after it.'));
  const twice = sanitizeDiagram({ ...launch, edges: [...launch.edges, { from: 'd', to: 's' }] });
  ok('a point reached two ways is reported', rollback(twice).problems.some((p) => /‘Strong demand’ is reached by more than one path/.test(p)));
  ok('with no root, rolling back says to choose one', /choose the root/.test(rollback(sanitizeDiagram({ nodes: [{ label: 'A', kind: 'decision' }, { label: 'B', kind: 'outcome', value: 1 }] })).problems[0]));
  const k = kindOf('diagram');
  const open = k.facts(s, { guarded: false });
  const guarded = k.facts(s, { guarded: true });
  ok('the facts give the rolled-back value and the best option', open.some((f) => /worth 4/.test(f)) && open.some((f) => /best option is ‘Launch’/.test(f)), J(open));
  ok('  but not while the person is working it out themselves', !guarded.some((f) => /worth 4|best option/.test(f)) && guarded.some((f) => /theirs to work out/.test(f)), J(guarded));
  ok('  problems are facts either way', k.facts(nopay, { guarded: true }).includes('‘Weak demand’ has no payoff yet.'));
}

console.log('\n=== views of one diagram: concept map → hierarchy → outline (release workflow 7) ===');
{
  const c = create(EMPTY_SPACE, 'diagram', causes, { name: 'D1', origin: 'socria' });
  ok('the diagram is an object of thought', !!c && c.obj.kind === 'diagram' && kindOf('diagram')?.label === 'Diagram');
  let space = c.space;
  const id = c.obj.id;
  const held = (st) => stableKey({ nodes: st.nodes, edges: st.edges, root: st.root });
  const start = held(currentOf(space.objs[0]));
  const toHierarchy = apply(space, id, 'view', { view: 'hierarchy' }, { by: 'person', at: 1 });
  ok('shown as a hierarchy', toHierarchy.ok && currentOf(toHierarchy.obj).view === 'hierarchy' && toHierarchy.step.said === 'shown as hierarchy');
  space = toHierarchy.space;
  const toOutline = apply(space, id, 'view', { view: 'outline' }, { by: 'person', at: 2 });
  ok('then as an outline', toOutline.ok && currentOf(toOutline.obj).view === 'outline');
  space = toOutline.space;
  ok('  and the nodes and connections are exactly what they were, at every step', space.objs[0].states.every((st) => held(st) === start));
  const now = currentOf(space.objs[0]);
  ok('  the outline indents what the hierarchy draws beneath', J(outlineOf(now).lines.map((l) => l.depth)) === J([0, 1, 2, 2, 1, 2, 1, 2, 3]));
  const h = hierarchyLayout(now, SIZE);
  ok('  the hierarchy’s depths are the outline’s depths', outlineOf(now).lines.every((l) => Math.abs(boxOf(h, l.id).y - (l.depth * 70 + 20)) < 1e-9));
  space = seek(space, id, 0);
  ok('stepping back shows it as the concept map again', currentOf(space.objs[0]).view === 'concept' && space.objs[0].states.length === 3);
  const back = sanitizeSpace(JSON.parse(JSON.stringify(seek(space, id, 2))));
  ok('the views survive a save: every step re-computed', back.objs[0].steps.length === 2 && currentOf(back.objs[0]).view === 'outline');
  // a diagram that is not a tree cannot be drawn as one
  const shared = apply(space, id, 'connect', { from: 'money', to: 'estates', by: 'person' }, { by: 'person', at: 3 });
  const refused = apply(shared.space, id, 'view', { view: 'hierarchy' }, { by: 'person', at: 4 });
  ok('a view that cannot draw it is refused, saying why', !refused.ok && /sits under both/.test(refused.why), refused.why);
  ok('  and the views that can are still offered', apply(shared.space, id, 'view', { view: 'mind' }, { by: 'person', at: 4 }).ok && apply(shared.space, id, 'view', { view: 'flow' }, { by: 'person', at: 4 }).ok);
}

console.log('\n=== every edit is an operation, computed and undoable ===');
{
  const c = create(EMPTY_SPACE, 'diagram', causes, { name: 'D1', origin: 'socria' });
  let space = c.space;
  const id = c.obj.id;
  const cur = () => currentOf(space.objs[0]);
  const node = (nid) => cur().nodes.find((n) => n.id === nid);
  const step = (op, args, by = 'person') => {
    const r = apply(space, id, op, args, { by, at: 1 });
    if (r.ok) space = r.space;
    return r;
  };
  const add = step('addNode', { label: 'Salons', parent: 'ideas', by: 'person' });
  ok('a node is added under another, with the connection', add.ok && node('n1')?.label === 'Salons' && cur().edges.some((e) => e.from === 'ideas' && e.to === 'n1' && e.by === 'person'));
  ok('  a label too long is refused, not cut', !step('addNode', { label: 'x '.repeat(60), by: 'person' }).ok);
  ok('  under nothing that exists is refused', !step('addNode', { label: 'Ghost', parent: 'nowhere', by: 'person' }).ok);
  ok('  with a payoff it is an outcome', step('addNode', { label: 'Bonus', value: 3, by: 'person' }).ok && node('n2').kind === 'outcome' && node('n2').value === 3);
  ok('  a payoff on a chance node is refused', !step('addNode', { label: 'Odd', kind: 'chance', value: 3, by: 'person' }).ok);
  ok('renamed', step('rename', { id: 'n1', label: 'Philosophical salons' }).ok && node('n1').label === 'Philosophical salons');
  ok('noted, and the note cleared', step('note', { id: 'n1', note: 'Paris, 1750s' }).ok && node('n1').note === 'Paris, 1750s' && step('note', { id: 'n1', note: '' }).ok && !('note' in node('n1')));
  ok('grouped', step('group', { id: 'n1', group: 'Ideas' }).ok && node('n1').group === 'Ideas');
  for (let i = 0; i < 7; i++) step('group', { id: causes.nodes[i + 1].id, group: `G${i}` });
  ok(`  a ${DIAGRAM_LIMITS.groups + 1}th group is refused`, !step('group', { id: 'tax', group: 'One too many' }).ok);
  ok('marked as a chance node', step('kind', { id: 'n2', kind: 'chance' }).ok && node('n2').kind === 'chance');
  ok('  and the payoff it had as an outcome goes, said in the step', !('value' in node('n2')) && /payoff of 3 is not kept/.test(space.objs[0].steps.at(-1).note ?? ''), space.objs[0].steps.at(-1).note);
  ok('  an unknown kind is refused', !step('kind', { id: 'n2', kind: 'maybe' }).ok);
  ok('a payoff is refused on a chance node', !step('value', { id: 'n2', value: 5 }).ok);
  ok('  given to a node with no kind, it makes it an outcome', step('value', { id: 'bread', value: '1,500' }).ok && node('bread').kind === 'outcome' && node('bread').value === 1500);
  ok('  and cleared', step('value', { id: 'bread', value: '' }).ok && !('value' in node('bread')));
  ok('connected, with a label', step('connect', { from: 'rousseau', to: 'society', label: 'criticised', by: 'person' }).ok && cur().edges.some((e) => e.from === 'rousseau' && e.to === 'society' && e.label === 'criticised'));
  ok('  the same connection twice is refused', !step('connect', { from: 'rousseau', to: 'society', by: 'person' }).ok);
  ok('  so is a node to itself', !step('connect', { from: 'tax', to: 'tax', by: 'person' }).ok);
  ok('  and a probability outside 0..1', !step('connect', { from: 'tax', to: 'bread', prob: 2, by: 'person' }).ok);
  ok('a probability is set, and cleared', step('prob', { from: 'rousseau', to: 'society', p: 0.25 }).ok && cur().edges.find((e) => e.from === 'rousseau').prob === 0.25 && step('prob', { from: 'rousseau', to: 'society', p: '' }).ok && cur().edges.find((e) => e.from === 'rousseau').prob === undefined);
  ok('disconnected', step('disconnect', { from: 'rousseau', to: 'society' }).ok && !cur().edges.some((e) => e.from === 'rousseau' && e.to === 'society'));
  ok('placed by hand, kept to four decimals', step('place', { id: 'fr', x: 0.333333, y: 0.25 }).ok && node('fr').x === 0.3333 && node('fr').y === 0.25);
  ok('  a place off the page is refused', !step('place', { id: 'fr', x: 1.2, y: 0.5 }).ok);
  ok('  and left to the layout again', step('place', { id: 'fr', x: '', y: '' }).ok && !('x' in node('fr')));
  ok('a root is chosen, and cleared', step('root', { id: 'fr' }).ok && cur().root === 'fr' && step('root', { id: '' }).ok && !('root' in cur()));
  ok('shown simply, and in full again', step('detail', { detail: 'simple' }).ok && cur().detail === 'simple' && !step('detail', { detail: 'simple' }).ok && step('detail', { detail: 'full' }).ok);
  ok('renamed as a whole', step('title', { title: 'Why 1789?' }).ok && cur().title === 'Why 1789?');
  const before = cur().edges.length;
  ok('a node removed takes its connections with it', step('removeNode', { id: 'money' }).ok && !node('money') && cur().edges.length === before - 3 && !cur().edges.some((e) => e.from === 'money' || e.to === 'money'));
  const kept = space.objs[0].states.length;
  space = seek(space, id, space.objs[0].at - 1);
  ok('undo steps back without losing anything', !!node('money') && space.objs[0].states.length === kept);
  space = seek(space, id, space.objs[0].states.length - 1);
  ok('…and redo steps forward', !node('money'));
  const back = sanitizeSpace(JSON.parse(JSON.stringify(space)));
  ok('the whole history survives a save: every step re-computed', back.objs[0].steps.length === space.objs[0].steps.length && same(currentOf(back.objs[0]), cur()));
}

console.log('\n=== what the person wrote is theirs ===');
{
  const c = create(EMPTY_SPACE, 'diagram', causes, { name: 'D1', origin: 'socria' });
  let space = c.space;
  const id = c.obj.id;
  const as = (by, op, args) => apply(space, id, op, args, { by, at: 2 });
  ok('Socria cannot rename the person’s node', !as('socria', 'rename', { id: 'society', label: 'Inequality' }).ok);
  ok('  nor note it, group it, mark it or give it a payoff', ['note', 'group', 'kind', 'value'].every((o) => !as('socria', o, { id: 'society', note: 'x', group: 'x', kind: 'outcome', value: 1 }).ok));
  ok('  nor move it', !as('socria', 'place', { id: 'society', x: 0.1, y: 0.1 }).ok);
  ok('  nor remove it', !as('socria', 'removeNode', { id: 'estates' }).ok);
  ok('  and says why', /yours/.test(as('socria', 'removeNode', { id: 'estates' }).why));
  ok('Socria cannot cut the person’s connection, nor change its chance', !as('socria', 'disconnect', { from: 'fr', to: 'society' }).ok && !as('socria', 'prob', { from: 'society', to: 'estates', p: 0.5 }).ok);
  const joined = as('person', 'connect', { from: 'society', to: 'rousseau', by: 'person' });
  space = joined.space;
  const refused = as('socria', 'removeNode', { id: 'rousseau' });
  ok('  Socria’s node the person connected to is not Socria’s to remove', !refused.ok && /connections you made/.test(refused.why), refused.why);
  ok('it can change what it wrote itself', as('socria', 'rename', { id: 'debt', label: 'Debts from the American war' }).ok && as('socria', 'removeNode', { id: 'bread' }).ok);
  ok('it can add and connect', as('socria', 'addNode', { label: 'Voltaire', parent: 'ideas', by: 'socria' }).ok && as('socria', 'connect', { from: 'debt', to: 'tax', by: 'socria' }).ok);
  ok('it can change how the diagram is shown', as('socria', 'view', { view: 'mind' }).ok && as('socria', 'detail', { detail: 'simple' }).ok);
  ok('nobody can claim to be someone else', !as('socria', 'addNode', { label: 'Forged', by: 'person' }).ok && !as('person', 'connect', { from: 'debt', to: 'tax', by: 'socria' }).ok);
  ok('  and who wrote it must be said', !as('person', 'addNode', { label: 'Anonymous' }).ok);
  ok('the person can change what Socria wrote', as('person', 'rename', { id: 'debt', label: 'Debt' }).ok && as('person', 'removeNode', { id: 'bread' }).ok);
  // a forged history is cut on load: a "socria" step that renames the person's node never replays
  const forged = JSON.parse(JSON.stringify(space));
  const s0 = currentOf(forged.objs[0]);
  const s1 = { ...s0, nodes: s0.nodes.map((n) => (n.id === 'society' ? { ...n, label: 'Forged' } : n)) };
  forged.objs[0].states = [s0, s1];
  forged.objs[0].steps = [{ op: 'rename', args: { id: 'society', label: 'Forged' }, said: 'x', by: 'socria', at: 3 }];
  forged.objs[0].at = 1;
  const read = sanitizeSpace(forged);
  ok('a stored step in which Socria renamed the person’s node is cut on load', read.objs[0].states.length === 1 && currentOf(read.objs[0]).nodes.find((n) => n.id === 'society').label === 'Social inequality');
  const claimed = JSON.parse(JSON.stringify(space));
  const c0 = currentOf(claimed.objs[0]);
  claimed.objs[0].states = [c0, { ...c0, nodes: [...c0.nodes, { id: 'n1', label: 'Claimed', by: 'person' }] }];
  claimed.objs[0].steps = [{ op: 'addNode', args: { label: 'Claimed', by: 'person' }, said: 'x', by: 'socria', at: 3 }];
  claimed.objs[0].at = 1;
  ok('  so is one in which Socria’s node was recorded as the person’s', sanitizeSpace(claimed).objs[0].states.length === 1);
}

console.log('\n=== words become operations only when they plainly are one ===');
{
  const s = sanitizeDiagram(causes);
  const r = (t, st = s) => readDiagramOp(t, st);
  const is = (t, want, st = s) => ok(`"${t}"`, J(r(t, st)) === J(want), J(r(t, st)));
  is('connect Rousseau to Social inequality', { op: 'connect', args: { from: 'rousseau', to: 'society', by: 'person' } });
  is('link war debts and tax exemptions', { op: 'connect', args: { from: 'debt', to: 'tax', by: 'person' } });
  is('Bread prices cause social inequality', { op: 'connect', args: { from: 'bread', to: 'society', label: 'causes', by: 'person' } });
  is('war debts causes bread prices', { op: 'connect', args: { from: 'debt', to: 'bread', label: 'causes', by: 'person' } });
  is('Rising bread prices cause social inequality', { op: 'connect', args: { from: 'bread', to: 'society', label: 'causes', by: 'person' } });
  is('war debts lead to bread prices', { op: 'connect', args: { from: 'debt', to: 'bread', label: 'leads to', by: 'person' } });
  is('add Salons under Enlightenment ideas', { op: 'addNode', args: { label: 'Salons', parent: 'ideas', by: 'person' } });
  is('add Voltaire to Enlightenment ideas', { op: 'addNode', args: { label: 'Voltaire', parent: 'ideas', by: 'person' } });
  is('add "Path to bankruptcy" under financial crisis', { op: 'addNode', args: { label: 'Path to bankruptcy', parent: 'money', by: 'person' } });
  is('add Rousseau under social inequality', { op: 'connect', args: { from: 'society', to: 'rousseau', by: 'person' } });
  is('add "More taxes" under financial crisis', { op: 'addNode', args: { label: 'More taxes', parent: 'money', by: 'person' } });
  is('add a node called Napoleon', { op: 'addNode', args: { label: 'Napoleon', by: 'person' } });
  is('rename bread prices to Price of bread', { op: 'rename', args: { id: 'bread', label: 'Price of bread' } });
  is('remove tax exemptions', { op: 'removeNode', args: { id: 'tax' } });
  is('delete the rousseau node', { op: 'removeNode', args: { id: 'rousseau' } });
  is('remove the link between war debts and financial crisis', { op: 'disconnect', args: { from: 'money', to: 'debt' } });
  is('disconnect three estates from social inequality', { op: 'disconnect', args: { from: 'society', to: 'estates' } });
  is('make French Revolution the root', { op: 'root', args: { id: 'fr' } });
  is('show it as a mind map', { op: 'view', args: { view: 'mind' } });
  is('switch to the org chart', { op: 'view', args: { view: 'hierarchy' } });
  is('turn this into a flowchart', { op: 'view', args: { view: 'flow' } });
  is('show as a decision tree', { op: 'view', args: { view: 'decision' } });
  is('show it as an outline', { op: 'view', args: { view: 'outline' } });
  is('show as a concept map', { op: 'view', args: { view: 'concept' } }, { ...s, view: 'hierarchy' });
  is('turn the mind map into an outline', { op: 'view', args: { view: 'outline' } }, { ...s, view: 'mind' });
  is('hierarchy view please', { op: 'view', args: { view: 'hierarchy' } });
  is('show this as a hierarchy', { op: 'view', args: { view: 'hierarchy' } });
  is('make this simpler', { op: 'detail', args: { detail: 'simple' } });
  is('show everything', { op: 'detail', args: { detail: 'full' } }, { ...s, detail: 'simple' });
  const d = sanitizeDiagram(launch);
  is('the chance of strong demand is 70%', { op: 'prob', args: { from: 'm', to: 's', p: 0.7 } }, d);
  is('Weak demand has a 30% chance', { op: 'prob', args: { from: 'm', to: 'w', p: 0.3 } }, d);
  is('the probability of strong demand is 0.65', { op: 'prob', args: { from: 'm', to: 's', p: 0.65 } }, d);
  // read, then refused with the reason: there are no decision nodes in a concept map of causes
  const c = create(EMPTY_SPACE, 'diagram', causes, { name: 'D1', origin: 'person' });
  const tried = apply(c.space, c.obj.id, 'view', r('show as a decision tree').args, { by: 'person' });
  ok('a view asked for that cannot draw it is refused, saying why', !tried.ok && /No node is marked as a decision/.test(tried.why));
  // and what must be left to the conversation
  for (const t of [
    'add more detail to your last answer',
    'what causes inflation?',
    'connect with me later',
    'link to the article please',
    'remove the ambiguity in my question',
    'rename the file to final.pdf',
    'show me the org chart of the company',
    'show me on a map where Paris is',
    'explain the causes as a mind map',
    'the chance of rain is 30%',
    'I think the revolution was inevitable',
    'how do these ideas connect to each other?',
    'can you link these ideas together',
    'show everything you know about Rousseau',
    'add sugar to the tea',
    'make it the best essay possible',
    'add more detail to financial crisis',
    'add some examples under Enlightenment ideas',
    'add it to social inequality',
    'I wonder if war debts cause bread prices',
    'what if bread prices cause social inequality, do you think?',
  ]) {
    ok(`left to the conversation: "${t}"`, r(t) === null, J(r(t)));
  }
  ok('left to the conversation: "make this simpler" when simple would hide nothing', readDiagramOp('make this simpler', sanitizeDiagram({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }] })) === null);
  ok('left to the conversation: "show everything" when everything is shown', r('show everything') === null);
  ok('left to the conversation: a view it is already in', r('show it as a concept map') === null);
  const twins = sanitizeDiagram({ nodes: [{ id: 'a', label: 'Success' }, { id: 'b', label: 'Success' }, { id: 'c', label: 'Plan' }], edges: [] });
  ok('a name two nodes share names neither', readDiagramOp('remove success', twins) === null && readDiagramOp('connect plan to success', twins) === null);
  ok('the strict view reading on its own', askedView('show it as a mind map', { mind: ['mind map'] }) === 'mind' && askedView('mind map', { mind: ['mind map'] }) === null && askedView('show me the mind map I drew yesterday', { mind: ['mind map'] }) === null);
}

console.log('\n=== the kind ===');
{
  const k = kindOf('diagram');
  const s = sanitizeDiagram(causes);
  ok('a card, a trail step and a live figure', J(k.size(s, 'card')) === J({ w: 260, h: 150 }) && J(k.size(s, 'trail')) === J({ w: 200, h: 110 }) && k.size(s, 'live').w <= 720 && k.size(s, 'live').h <= 640);
  ok('  a full diagram stays within the live bounds', k.size(sanitizeDiagram({ nodes: Array.from({ length: 60 }, (_, i) => ({ label: `N${i}` })) }), 'live').h === 640);
  ok('its shape in a line', k.shape(s) === 'concept map · 9 nodes');
  ok('its parts are its nodes', k.parts(s).length === 9 && k.parts(s)[0].label === 'French Revolution');
  const pf = k.partFacts(s, 'money');
  ok('a node’s facts: its connections and who wrote it', pf.includes('Financial crisis') && pf.some((f) => /from ‘French Revolution’ \(caused by\)/.test(f)) && pf.includes('from Socria'));
  const text = k.text(s);
  ok('the text marks what is theirs', /1\. French Revolution · theirs/.test(text) && /2\. Financial crisis$/m.test(text) && /1 → 2 \(caused by\)/.test(text));
  ok('  and is capped', k.text(sanitizeDiagram({ nodes: Array.from({ length: 60 }, (_, i) => ({ label: `A long label for node number ${i} in the diagram`, note: 'n'.repeat(200) })) })).length <= 2400);
  const facts = k.facts(s, { guarded: false });
  ok('the facts are computed: size, root, tree, ownership', facts[0] === 'Causes of the French Revolution: a diagram of 9 nodes and 8 connections, shown as a concept map.' && facts.includes('It grows from ‘French Revolution’.') && facts.includes('It is one tree, 4 levels deep.') && facts.some((f) => /3 nodes are the person’s own/.test(f)), J(facts));
  ok('  and in simple detail, how much is shown', k.facts({ ...s, detail: 'simple' }, { guarded: false }).includes('Shown simply: 8 of 9 nodes.'));
  ok('every view says what it shows', k.views.length === 6 && k.views.every((v) => v.shows && v.label && v.interactions.length));
  const empty = sanitizeDiagram({ nodes: [] });
  ok('a view that cannot draw says why in a sentence', ['mind', 'hierarchy', 'decision', 'outline'].every((v) => /\.$/.test(k.views.find((x) => x.id === v).unavailable(empty))) && !k.views.find((x) => x.id === 'flow').unavailable);
  ok('readOp is the diagram’s words', J(k.readOp('remove tax exemptions', s)) === J({ op: 'removeNode', args: { id: 'tax' } }));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
