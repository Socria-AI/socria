// The atlas: everything Socria remembers, connected — memories, chats, maps,
// plots, models, objects of thought and Projects in one graph.
//
// What can go wrong is never the drawing. It is a join that is not there (two
// chats about one thing that do not meet), a join that should not be there
// (two matrices called A made into one), a private memory reaching Logos, or
// a big account turning into an unreadable hairball. Each is held down here.

import { buildAtlas, relatedChats, neighbourhood, plotOf, folderOf, relLabel, atlasMapOf, radialLayout, MAX_MAP_NODES, MAX_CHATS, MAX_ATLAS_NODES } from './.tmp/atlas.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const prov = (conversationId, at = 1) => ({ kind: 'stated', surface: 'core', at, conversationId });
const mem = (id, type, label, chats, extra = {}) => ({
  id, type, label, content: `${label}, in a sentence or two.`, aliases: [], status: 'active',
  confidence: 0.8, certainty: 0.8, importance: 0.5, activation: 0.5, seen: 1, private: false,
  provenance: chats.map((c, i) => prov(c, i + 1)), createdAt: 1, updatedAt: 1, lastAccessed: 1, ...extra,
});
const edge = (id, s, t, relationship) => ({ id, sourceId: s, targetId: t, relationship, confidence: 0.8, strength: 0.6, provenance: [], createdAt: 1, updatedAt: 1, lastReinforced: 1 });
const node = (id, type, label) => ({ id, type, label });

const GRAPH = {
  nodes: [
    mem('n1', 'Goal', 'Get into a machine learning PhD', ['core-1', 'logos-1']),
    mem('n2', 'Concept', 'Overfitting', ['logos-1'], { aliases: ['over-fitting', 'overfit'] }),
    mem('p1', 'Project', 'Thesis', ['core-1']),
    mem('n3', 'Decision', 'Started medication', ['core-secret'], { private: true }),
  ],
  edges: [edge('e1', 'n2', 'n1', 'relevant_to'), edge('e2', 'n1', 'p1', 'belongs_to'), edge('e3', 'n3', 'n1', 'caused')],
};
const CHATS = [
  { id: 'core-1', title: 'PhD applications', kind: 'chat', projectId: 'proj-1', updatedAt: 50 },
  { id: 'core-secret', title: 'A hard week', kind: 'chat', projectId: null, updatedAt: 60 },
  {
    id: 'logos-1', title: 'Why my model fits only the training data', kind: 'logos', projectId: 'proj-1', updatedAt: 70,
    map: {
      nodes: [
        node('a', 'question', 'Why does the model fit only the training data?'),
        node('b', 'concept', 'Overfit'),             // an alias of a memory → IS that memory
        node('c', 'concept', 'Bias–variance tradeoff'),
        node('d', 'step', 'x = 3'),                   // mechanics — stays on its map
        node('e', 'evidence', 'Validation error rises'),
      ],
      edges: [{ from: 'b', to: 'a', relation: 'supports' }, { from: 'e', to: 'b', relation: 'supports' }, { from: 'd', to: 'a', relation: 'relates' }],
      viz: { kind: 'function', expr: 'x^2', varName: 'x', view: { xMin: -1, xMax: 1 }, params: [] },
      objects: { objs: [{ id: 'A', kind: 'matrix', name: 'A', states: [], steps: [{}, {}] }] },
    },
  },
  {
    id: 'logos-2', title: 'Regularisation for the thesis model', kind: 'logos', projectId: null, updatedAt: 80,
    map: {
      nodes: [node('x', 'concept', 'bias-variance  tradeoff'), node('y', 'idea', 'Try L2 regularisation'), node('z', 'step', 'x = 3')],
      edges: [{ from: 'y', to: 'x', relation: 'relates' }],
      viz: { kind: 'function', expr: 'sin(x)', varName: 'x', view: { xMin: -1, xMax: 1 }, params: [] },
      models: { docs: [{ id: 'm1', title: 'Ridge regression', revisions: [], at: 0, log: [] }], active: 'm1' },
      objects: { objs: [{ id: 'A', kind: 'matrix', name: 'A', states: [], steps: [] }] },
    },
  },
  { id: 'logos-3', title: 'A black hole', kind: 'logos', updatedAt: 10, map: { nodes: [], edges: [], viz: { kind: 'simulation', sim: { object: 'black-hole' } } } },
];
const PROJECTS = [{ id: 'proj-1', nodeId: 'p1', name: 'Thesis' }];

const all = buildAtlas({ graph: GRAPH, chats: CHATS, projects: PROJECTS, scope: 'all' });
const logos = buildAtlas({ graph: GRAPH, chats: CHATS, projects: PROJECTS, scope: 'logos' });
const get = (a, id) => a.nodes.find((n) => n.id === id);
const has = (a, from, rel, to) => a.edges.some((e) => e.from === from && e.rel === rel && e.to === to);

console.log('=== every chat is a node, and knows its Project ===');
{
  ok('core chats and Logos chats both', get(all, 'c:core-1')?.surface === 'core' && get(all, 'c:logos-1')?.surface === 'logos');
  ok('a chat is filed in its Project — the Project is its Mind anchor, one point', has(all, 'c:core-1', 'filed_in', 'm:p1') && has(all, 'c:logos-1', 'filed_in', 'm:p1'));
  ok('  and that point is a Project, not a memory', get(all, 'm:p1')?.kind === 'project' && get(all, 'm:p1')?.type === 'Project');
  ok('  which knows the chats filed in it', get(all, 'm:p1')?.chats.includes('core-1') && get(all, 'm:p1')?.chats.includes('logos-1'));
  ok('a Project with no anchor in the graph still appears', buildAtlas({ graph: { nodes: [], edges: [] }, chats: [CHATS[0]], projects: PROJECTS, scope: 'all' }).nodes.some((n) => n.id === 'p:proj-1' && n.kind === 'project'));
}

console.log('=== memories meet the chats they were learned in ===');
{
  ok('a memory → each chat its provenance names', has(all, 'm:n1', 'learned_in', 'c:core-1') && has(all, 'm:n1', 'learned_in', 'c:logos-1'));
  ok('  its own relationships pass through unchanged', has(all, 'm:n2', 'relevant_to', 'm:n1') && has(all, 'm:n1', 'belongs_to', 'm:p1'));
  ok('  most recent chat first', JSON.stringify(get(all, 'm:n1').chats) === JSON.stringify(['logos-1', 'core-1']), JSON.stringify(get(all, 'm:n1').chats));
}

console.log('=== a map node IS the memory it names ===');
{
  ok('"Overfit" on a map joins the memory Overfitting through its alias', has(all, 'm:n2', 'on_map', 'c:logos-1') && !all.nodes.some((n) => n.id === 'i:overfit'));
  ok('  and the map\'s own edges come with it', has(all, 'i:validation error rises', 'supports', 'm:n2'));
}

console.log('=== the same idea on two maps is ONE node with two chats ===');
{
  const bv = get(all, 'i:bias variance tradeoff');
  ok('joined by normalised label, across punctuation and spacing', !!bv && bv.chats.length === 2, JSON.stringify(bv));
  ok('  on both maps', has(all, 'i:bias variance tradeoff', 'on_map', 'c:logos-1') && has(all, 'i:bias variance tradeoff', 'on_map', 'c:logos-2'));
  ok('  in the folder its type means', bv?.type === 'Concept' && folderOf('question') === 'Question' && folderOf('zzz') === 'Idea');
  ok('the mechanics of one problem stay on its map', !all.nodes.some((n) => n.id === 'i:x 3'));
}

console.log('=== plots by type, models by title, objects never merged ===');
{
  const fp = get(all, 'v:function');
  ok('two function plots are one plot type, drawn in both chats', fp?.kind === 'plot' && fp.chats.length === 2 && has(all, 'v:function', 'drawn_in', 'c:logos-2'));
  ok('  named for a person, with the first expression under it', fp?.label === 'Function plot' && !!fp.sub, JSON.stringify(fp));
  ok('a simulation is keyed by its object', get(all, 'v:simulation:black hole')?.label === 'Black hole simulation');
  ok('plotOf ignores junk', plotOf(null) === null && plotOf({}) === null && plotOf({ kind: 7 }) === null);
  ok('a model is a node, built in its chat', get(all, 'd:ridge regression')?.kind === 'model' && has(all, 'd:ridge regression', 'built_in', 'c:logos-2'));
  ok('two matrices called A are two objects', !!get(all, 'o:logos-1:A') && !!get(all, 'o:logos-2:A') && get(all, 'o:logos-1:A').label === 'Matrix A');
  ok('  each worked in its own chat', has(all, 'o:logos-1:A', 'worked_in', 'c:logos-1') && get(all, 'o:logos-1:A').sub === '2 steps');
}

console.log('=== how two chats connect ===');
{
  const r = relatedChats(all, 'logos-1');
  const two = r.find((x) => x.id === 'logos-2');
  ok('Logos 1 connects to Logos 2 through what they share', !!two && two.shared.some((s) => /bias.variance/i.test(s)) && two.shared.includes('Function plot'), JSON.stringify(two));
  const core = r.find((x) => x.id === 'core-1');
  ok('  and to the Core chat through a memory and the Project', !!core && core.sameProject && core.shared.includes('Get into a machine learning PhD'), JSON.stringify(core));
  ok('  a shared memory counts for more than a shared word', core.score > two.score, `${core.score} vs ${two.score}`);
  ok('  never to itself', !r.some((x) => x.id === 'logos-1'));
  ok('an unknown chat has no connections', relatedChats(all, 'nope').length === 0);
  const nb = neighbourhood(all, 'logos-1', 30);
  ok('the neighbourhood holds the chat, what is in it, and where that leads', nb.nodes.some((n) => n.id === 'c:logos-1') && nb.nodes.some((n) => n.id === 'c:logos-2') && nb.nodes.some((n) => n.id === 'm:p1'));
  ok('  bounded', neighbourhood(all, 'logos-1', 5).nodes.length <= 5);
  ok('  every edge in it has both ends in it', nb.edges.every((e) => nb.nodes.some((n) => n.id === e.from) && nb.nodes.some((n) => n.id === e.to)));
}

console.log('=== PRIVATE STAYS PRIVATE: the Logos scope ===');
{
  ok('all: the private memory is there (the person\'s own Memory page)', !!get(all, 'm:n3'));
  ok('logos: the private memory is not', !get(logos, 'm:n3'));
  ok('  nor the chat that made it — not even its title', !get(logos, 'c:core-secret') && !JSON.stringify(logos).includes('A hard week'));
  ok('  nor anything that pointed at it', !logos.edges.some((e) => e.from === 'm:n3' || e.to === 'm:n3' || e.to === 'c:core-secret'));
  ok('  and the rest is untouched', !!get(logos, 'm:n1') && !!get(logos, 'c:logos-2') && has(logos, 'm:n1', 'learned_in', 'c:core-1'));
  ok('  its text is nowhere', !JSON.stringify(logos).includes('medication'));
}

console.log('=== legible at any size, and says what it left out ===');
{
  const big = { id: 'big', title: 'Big', kind: 'logos', updatedAt: 1, map: { nodes: Array.from({ length: 60 }, (_, i) => node(`n${i}`, 'idea', `Idea number ${i}`)), edges: [] } };
  const a = buildAtlas({ graph: { nodes: [], edges: [] }, chats: [big], projects: [], scope: 'all' });
  ok(`a map is carried to ${MAX_MAP_NODES} nodes`, a.stats.ideas === MAX_MAP_NODES, String(a.stats.ideas));
  ok('  and the rest is counted, not silently gone', a.stats.dropped === 60 - MAX_MAP_NODES, String(a.stats.dropped));
  const many = Array.from({ length: MAX_CHATS + 7 }, (_, i) => ({ id: `c${i}`, title: `Chat ${i}`, kind: 'chat', updatedAt: i }));
  const m = buildAtlas({ graph: { nodes: [], edges: [] }, chats: many, projects: [], scope: 'all' });
  ok(`the ${MAX_CHATS} most recent chats`, m.stats.chats === MAX_CHATS && !!get(m, `c:c${MAX_CHATS + 6}`) && !get(m, 'c:c0'), String(m.stats.chats));
  const flood = Array.from({ length: 90 }, (_, i) => ({ id: `f${i}`, title: `F${i}`, kind: 'logos', updatedAt: i, map: { nodes: Array.from({ length: 24 }, (_, j) => node(`n${j}`, 'idea', `Only here ${i}-${j}`)), edges: [] } }));
  const f = buildAtlas({ graph: GRAPH, chats: [...CHATS, ...flood], projects: PROJECTS, scope: 'all' });
  ok(`never more than ${MAX_ATLAS_NODES} nodes`, f.nodes.length <= MAX_ATLAS_NODES, String(f.nodes.length));
  ok('  memories, chats and Projects are never what is dropped', !!get(f, 'm:n1') && !!get(f, 'm:p1') && f.stats.chats === CHATS.length + 90);
  ok('  shared ideas survive the cut', !!get(f, 'i:bias variance tradeoff'));
  ok('  the newest chats keep their ideas, the oldest lose them first', !!get(f, 'i:only here 89 0') && !get(f, 'i:only here 0 0'));
  ok('  no edge is left pointing at nothing', f.edges.every((e) => get(f, e.from) && get(f, e.to)));
}

console.log('=== it does not trust what it is given ===');
{
  let threw = false;
  try {
    buildAtlas({ graph: { nodes: [], edges: [] }, chats: [null, { id: '' }, { id: 'x', kind: 'logos', updatedAt: 1, map: { nodes: [null, { id: 'a' }, { id: 'b', type: 'idea', label: 7 }], edges: null, models: { docs: [null, { title: '' }] }, objects: { objs: [null, { id: 3 }] } } }], projects: [], scope: 'all' });
    buildAtlas({ graph: {}, chats: undefined, projects: undefined, scope: 'logos' });
  } catch (e) { threw = String(e); }
  ok('junk in, no throw', !threw, threw);
  ok('the same input gives the same atlas', JSON.stringify(buildAtlas({ graph: GRAPH, chats: CHATS, projects: PROJECTS, scope: 'all' })) === JSON.stringify(all));
  ok('relationships read as English', relLabel('learned_in') === 'learned in' && relLabel('depends_on') === 'depends on');
  ok('the counts add up', all.stats.chats === 5 && all.stats.plots === 2 && all.stats.models === 1 && all.stats.objects === 2 && all.stats.shared >= 3, JSON.stringify(all.stats));
}

console.log('=== a stored map is read lightly, and only for what the atlas uses ===');
{
  const m = atlasMapOf({
    nodes: [{ id: 'a', type: 'concept', label: '  Overfitting  ', secret: 'x' }, { id: '', label: 'no id' }, { id: 'b', type: 'idea', label: 'y'.repeat(500) }],
    edges: [{ from: 'a', to: 'b', relation: 'supports' }, { from: 'a' }],
    viz: { kind: 'simulation', sim: { object: 'black-hole' }, params: [{ huge: 'x'.repeat(10000) }] },
    models: { docs: [{ id: 'm', title: 'Ridge', revisions: [{ big: 'x'.repeat(100000) }] }] },
    objects: { objs: [{ id: 'A', kind: 'matrix', name: 'A', states: [[1]], steps: [{}, {}, {}] }] },
    messages: ['what was said'],
  });
  ok('labels trimmed and bounded', m.nodes[0].label === 'Overfitting' && m.nodes.length === 2 && m.nodes[1].label.length === 120);
  ok('incomplete edges and nodes dropped', m.edges.length === 1);
  ok('nothing else comes with it', !JSON.stringify(m).includes('secret') && !JSON.stringify(m).includes('what was said') && !JSON.stringify(m).includes('xxxxxxxx'));
  ok('the plot, model titles and object step counts survive', m.viz.sim.object === 'black-hole' && m.models.docs[0].title === 'Ridge' && m.objects.objs[0].steps.length === 3);
  ok('junk is null', atlasMapOf(null) === null && atlasMapOf('x') === null);
  const a = buildAtlas({ graph: { nodes: [], edges: [] }, chats: [{ id: 'z', title: 'Z', kind: 'logos', updatedAt: 1, map: m }], projects: [], scope: 'all' });
  ok('and it builds the same atlas a full map would', !!a.nodes.find((n) => n.id === 'i:overfitting') && !!a.nodes.find((n) => n.id === 'v:simulation:black hole') && !!a.nodes.find((n) => n.id === 'o:z:A'));
}

console.log('=== one chat, drawn as a neighbourhood ===');
{
  const nb = neighbourhood(all, 'logos-1', 60);
  const W = 640, H = 520;
  const pl = radialLayout(nb, 'logos-1', W, H);
  ok('the chat is in the middle', pl['c:logos-1'].x === W / 2 && pl['c:logos-1'].y === H / 2 && pl['c:logos-1'].ring === 0);
  ok('every node has a place', nb.nodes.every((n) => pl[n.id]), String(nb.nodes.filter((n) => !pl[n.id]).map((n) => n.id)));
  ok('what is in the chat is the inner ring', pl['i:bias variance tradeoff'].ring === 1 && pl['v:function'].ring === 1 && pl['o:logos-1:A'].ring === 1);
  ok('the chats it connects to are the outer ring', pl['c:logos-2'].ring === 2 && pl['c:core-1'].ring === 2);
  const inside = Object.values(pl).every((p) => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H && Number.isFinite(p.x));
  ok('all of it on the canvas', inside);
  const ring2 = Object.entries(pl).filter(([, p]) => p.ring === 2);
  let close = 0;
  for (let i = 0; i < ring2.length; i++) for (let j = i + 1; j < ring2.length; j++) {
    const d = Math.hypot(ring2[i][1].x - ring2[j][1].x, ring2[i][1].y - ring2[j][1].y);
    if (d < 20) close++;
  }
  ok('no two outer places on top of each other', close === 0, String(close));
  ok('the same neighbourhood is drawn the same way twice', JSON.stringify(radialLayout(nb, 'logos-1', W, H)) === JSON.stringify(pl));
  ok('an unknown chat draws nothing', Object.keys(radialLayout(nb, 'nope', W, H)).length === 0);
  // a crowded outer ring still closes without overlap
  const crowd = { nodes: [{ id: 'c:x', kind: 'chat', type: 'Chat', label: 'X', chats: ['x'] }, { id: 'i:a', kind: 'idea', type: 'Idea', label: 'A', chats: ['x'] }, ...Array.from({ length: 40 }, (_, i) => ({ id: `c:o${i}`, kind: 'chat', type: 'Chat', label: `O${i}`, chats: [`o${i}`] }))], edges: [{ from: 'i:a', to: 'c:x', rel: 'on_map', n: 1 }, ...Array.from({ length: 40 }, (_, i) => ({ from: 'i:a', to: `c:o${i}`, rel: 'on_map', n: 1 }))], stats: all.stats };
  const cp = radialLayout(crowd, 'x', 800, 800);
  const outs = Object.values(cp).filter((p) => p.ring === 2);
  let tight = 0;
  for (let i = 0; i < outs.length; i++) for (let j = i + 1; j < outs.length; j++) if (Math.hypot(outs[i].x - outs[j].x, outs[i].y - outs[j].y) < 8) tight++;
  ok('forty chats through one idea still spread round the ring', outs.length === 40 && tight === 0, String(tight));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
