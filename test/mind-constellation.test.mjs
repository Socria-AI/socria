// The atlas, drawn as a constellation (lib/mind/constellation.ts): memory in
// the middle, every chat on a ring around it — a Logos line of thinking as its
// own map — what was made in each chat beside it, and whatever two chats share
// threaded between them.
//
// What can go wrong is a thing that silently disappears (an idea on a map, a
// model, a memory), a join drawn to the wrong place, words on top of words, or
// a big account that is slow or unreadable. Each is held down here, on an atlas
// built by the real projection (lib/mind/atlas.ts).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAtlas } from './.tmp/atlas.mjs';
import { constellation, contentsOf, MAX_THREADS, MEMORY_LABEL } from './.tmp/constellation.mjs';
import { suggestViews, factsFrom, SURFACES } from './.tmp/surfaces.mjs';
import { presetLayout, SURFACE_TYPES } from './.tmp/tiling.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

// ── an account: memories, three Projects, Core chats and Logos lines of thinking ──
const DAY = 86400000, NOW = Date.UTC(2026, 9, 8);
const prov = (c, at) => ({ kind: 'stated', surface: c.startsWith('l') ? 'logos' : 'core', at, conversationId: c });
let t = 0;
const mem = (id, type, label, chats) => ({ id, type, label, content: `${label}.`, aliases: [], status: 'active', confidence: 0.8, certainty: 0.8, importance: 0.5, activation: 0.5, seen: chats.length, private: false, provenance: chats.map((c, i) => prov(c, NOW - (i + 1) * DAY)), createdAt: NOW - 40 * DAY + (t++) * DAY, updatedAt: NOW, lastAccessed: NOW });
const edge = (id, s, tg, r) => ({ id, sourceId: s, targetId: tg, relationship: r, confidence: 0.8, strength: 0.6, provenance: [], createdAt: 1, updatedAt: 1, lastReinforced: 1 });
const GRAPH = {
  nodes: [
    mem('g1', 'Goal', 'Get into a machine learning PhD', ['c1', 'l1', 'l4']),
    mem('g2', 'Goal', 'Ship the tutoring app by spring', ['c3', 'l6']),
    mem('k1', 'Concept', 'Overfitting', ['l1', 'l2']),
    mem('k2', 'Concept', 'Bias–variance tradeoff', ['l1', 'l2', 'l4']),
    mem('k3', 'Concept', 'Eigenvalues', ['l3', 'l5']),
    mem('d1', 'Decision', 'Apply to five programmes, not ten', ['c1']),
    mem('q1', 'Question', 'Is a research master’s worth a year?', ['c1']),
    mem('lone', 'Belief', 'Theory first, then code', []),
    mem('p1', 'Project', 'Thesis', ['c1']),
    mem('p2', 'Project', 'Tutoring app', ['c3']),
    mem('p3', 'Project', 'Linear algebra course', ['l3']),
  ],
  edges: [edge('e1', 'k1', 'g1', 'relevant_to'), edge('e2', 'k2', 'k1', 'explains'), edge('e3', 'd1', 'g1', 'serves'), edge('e4', 'g1', 'p1', 'belongs_to')],
};
const n = (id, type, label) => ({ id, type, label });
const map = (labels, extra = {}) => ({ nodes: labels.map(([type, label], i) => n(`n${i}`, type, label)), edges: labels.slice(1).map((_, i) => ({ from: `n${i + 1}`, to: 'n0', relation: 'relates' })), ...extra });
const fn = (expr) => ({ kind: 'function', expr, varName: 'x', view: { xMin: -3, xMax: 3 }, params: [] });
const models = (...titles) => ({ docs: titles.map((title, i) => ({ id: `m${i}`, title, revisions: [], at: 0, log: [] })), active: 'm0' });
const CHATS = [
  { id: 'c1', title: 'PhD applications', kind: 'chat', projectId: 'P1', updatedAt: NOW - 2 * DAY },
  { id: 'c2', title: 'How I learn best', kind: 'chat', projectId: null, updatedAt: NOW - 9 * DAY },
  { id: 'c3', title: 'Pricing the tutoring app', kind: 'chat', projectId: 'P2', updatedAt: NOW - 4 * DAY },
  { id: 'l1', title: 'Why my model only fits the training data', kind: 'logos', projectId: 'P1', updatedAt: NOW - 1 * DAY, map: map([['question', 'Why only the training data?'], ['concept', 'Overfitting'], ['concept', 'Bias–variance tradeoff'], ['idea', 'Early stopping']], { viz: fn('x^2') }) },
  { id: 'l2', title: 'Regularisation for the thesis model', kind: 'logos', projectId: 'P1', updatedAt: NOW - 3 * DAY, map: map([['question', 'Which regulariser?'], ['concept', 'Overfitting'], ['idea', 'Try L2 regularisation'], ['idea', 'Early stopping']], { models: models('Ridge regression', 'Lasso path') }) },
  { id: 'l3', title: 'What an eigenvector actually is', kind: 'logos', projectId: 'P3', updatedAt: NOW - 5 * DAY, map: map([['question', 'What does an eigenvector do?'], ['concept', 'Eigenvalues'], ['insight', 'Directions that only stretch']], { objects: { objs: [{ id: 'A', kind: 'matrix', name: 'A', states: [], steps: [{}] }] }, viz: fn('2*x') }) },
  { id: 'l4', title: 'Choosing a thesis topic', kind: 'logos', projectId: 'P1', updatedAt: NOW - 6 * DAY, map: map([['question', 'Which topic?'], ['concept', 'Bias–variance tradeoff'], ['option', 'Robust learning']]) },
  { id: 'l5', title: 'PCA from scratch', kind: 'logos', projectId: 'P3', updatedAt: NOW - 8 * DAY, map: map([['question', 'Why do components work?'], ['concept', 'Eigenvalues']], { models: models('PCA on the iris data') }) },
  { id: 'l6', title: 'Unit economics of tutoring', kind: 'logos', projectId: 'P2', updatedAt: NOW - 10 * DAY, map: map([['question', 'When does a session pay?'], ['concept', 'Contribution margin']], { models: models('Break-even model') }) },
  { id: 'l7', title: 'A black hole', kind: 'logos', projectId: null, updatedAt: NOW - 12 * DAY, map: map([['question', 'What happens at the horizon?']], { viz: { kind: 'simulation', sim: { object: 'black-hole' } }, objects: { objs: [{ id: 'S', kind: 'scene', name: 'Scene', states: [], steps: [] }] } }) },
];
const PROJECTS = [{ id: 'P1', nodeId: 'p1', name: 'Thesis' }, { id: 'P2', nodeId: 'p2', name: 'Tutoring app' }, { id: 'P3', nodeId: 'p3', name: 'Linear algebra course' }];
const atlas = buildAtlas({ graph: GRAPH, chats: CHATS, projects: PROJECTS, scope: 'all' });
const W = 1100, H = 820;
const c = constellation(atlas, { width: W, height: H });
const byId = new Map(atlas.nodes.map((x) => [x.id, x]));
const placed = (role) => Object.values(c.nodes).filter((p) => p.role === role);
const rho = (p, e) => Math.hypot((p.x - c.cx) / e.rx, (p.y - c.cy) / e.ry);

console.log('=== the ring: every chat, grouped by Project ===');
{
  const chats = atlas.nodes.filter((x) => x.kind === 'chat');
  ok('every chat, Core and Logos, is on the ring', placed('chat').length === chats.length && c.ring_order.length === chats.length);
  ok('…on the ellipse itself', placed('chat').every((p) => Math.abs(rho(p, c.ring) - 1) < 1e-9));
  const projectOf = (id) => atlas.edges.find((e) => e.rel === 'filed_in' && e.from === id)?.to ?? '';
  const runs = [];
  for (const id of c.ring_order) if (runs[runs.length - 1] !== projectOf(id)) runs.push(projectOf(id));
  ok('a Project\'s chats sit together', new Set(runs).size === runs.length, JSON.stringify(runs));
  ok('chats in no Project close the ring', runs[runs.length - 1] === '');
  const thesis = c.ring_order.filter((id) => projectOf(id) === 'm:p1');
  ok('newest first within a Project', thesis.every((id, i) => i === 0 || (byId.get(thesis[i - 1]).at ?? 0) >= (byId.get(id).at ?? 0)), JSON.stringify(thesis));
  ok('one arc per Project, named', c.arcs.length === 3 && ['Thesis', 'Tutoring app', 'Linear algebra course'].every((l) => c.arcs.some((a) => a.label === l)));
  ok('…spanning its own chats', c.arcs.every((a) => c.ring_order.filter((id) => projectOf(id) === a.id).every((id) => c.nodes[id].angle > a.a0 && c.nodes[id].angle < a.a1)));
}

console.log('\n=== nothing disappears ===');
{
  const folded = new Set(Object.values(c.folded).flat());
  const arcs = new Set(c.arcs.map((a) => a.id));
  const lost = atlas.nodes.filter((x) => !c.nodes[x.id] && !folded.has(x.id) && !arcs.has(x.id));
  ok('every node is placed, folded into its chat, or a Project\'s arc', lost.length === 0, lost.map((x) => x.id).join(', '));
  ok('an idea on one map only is folded into that map', [...folded].every((id) => byId.get(id).kind === 'idea' && byId.get(id).chats.length === 1));
  ok('…and its chat knows how many', Object.entries(c.folded).every(([chat, ids]) => ids.every((id) => `c:${byId.get(id).chats[0]}` === chat)));
}

console.log('\n=== what was made, and what is shared ===');
{
  const sats = placed('satellite');
  ok('each model, plot and object made in one chat sits beside it', sats.length >= 4 && sats.every((p) => ['model', 'plot', 'object'].includes(byId.get(p.id).kind) && byId.get(p.id).chats.length === 1 && p.chat === `c:${byId.get(p.id).chats[0]}`));
  ok('…inside the ring, at its chat\'s angle', sats.every((p) => rho(p, c.ring) < 1 && Math.abs(Math.atan2(Math.sin(p.angle - c.nodes[p.chat].angle), Math.cos(p.angle - c.nodes[p.chat].angle))) < 0.06));
  ok('Live 3D scenes are among them, named as such', sats.some((p) => byId.get(p.id).kind === 'object' && byId.get(p.id).label === 'Live 3D scene'));
  ok('…and a matrix keeps its name', sats.some((p) => byId.get(p.id).label === 'Matrix A'));
  const bridges = placed('bridge');
  ok('what two chats share is a bridge: "Early stopping", and the function plot', bridges.some((p) => byId.get(p.id).label === 'Early stopping') && bridges.some((p) => byId.get(p.id).kind === 'plot'));
  ok('every bridge is in two chats or more, between the core and the ring', bridges.every((p) => byId.get(p.id).chats.length >= 2 && rho(p, c.ring) < 0.95 && rho(p, c.core) > 1));
}

console.log('\n=== the core: memories, written ===');
{
  const mems = Object.values(c.nodes).filter((p) => p.role === 'memory' || p.role === 'project');
  ok('every memory is in the core', mems.length === atlas.nodes.filter((x) => x.kind === 'memory').length, String(mems.length));
  const written = mems.filter((p) => p.label);
  ok('at the page\'s size every memory is written out', written.length === mems.length);
  ok('…inside the core', written.every((p) => rho(p, c.core) <= 1.05));
  ok('…in rows', new Set(written.map((p) => p.y.toFixed(3))).size < written.length);
  // the dot faces the chats it was learned in
  const g1 = c.nodes['m:g1'];
  const lean = ['c1', 'l1', 'l4'].map((id) => Math.cos(c.nodes[`c:${id}`].angle)).reduce((a, b) => a + b, 0);
  ok('a memory\'s dot is on the side of the chats it came from', (lean >= 0) === (g1.label === 'left'));
  // no two labels in a row overlap: each runs from its dot away from the chats
  const est = (s) => Math.min(s.length, c.memoryLabel) * 6.15 + 22;
  const boxes = written.map((p) => { const w = est(byId.get(p.id).label) - 8; return { y: p.y, a: p.label === 'left' ? p.x - w : p.x - 8, b: p.label === 'left' ? p.x + 8 : p.x + w }; });
  const clash = boxes.some((u, i) => boxes.some((v, j) => j > i && Math.abs(u.y - v.y) < 1 && u.a < v.b - 1 && v.a < u.b - 1));
  ok('no two written labels overlap', !clash);
  const small = constellation(atlas, { width: 560, height: 520, labelRoom: 110 });
  ok('a small picture writes shorter labels, never none', small.memoryLabel < MEMORY_LABEL && small.memoryLabel >= 10, String(small.memoryLabel));
  ok('…and what does not fit is a dot at the core\'s edge, not dropped', Object.values(small.nodes).filter((p) => p.role === 'memory').length === mems.filter((p) => p.role === 'memory').length);
}

console.log('\n=== the threads ===');
{
  ok('every thread joins two placed things', c.threads.every((th) => c.nodes[th.from] && c.nodes[th.to]));
  const kinds = (k) => c.threads.filter((th) => th.kind === k);
  ok('memory to chat is a fiber', kinds('fiber').length > 0 && kinds('fiber').every((th) => [c.nodes[th.from].role, c.nodes[th.to].role].includes('chat')));
  ok('a bridge is threaded to each of its chats', placed('bridge').every((p) => byId.get(p.id).chats.every((ch) => c.threads.some((th) => th.kind === 'bridge' && [th.from, th.to].includes(p.id) && [th.from, th.to].includes(`c:${ch}`)))));
  ok('a satellite is tethered to its chat', placed('satellite').every((p) => c.threads.some((th) => th.kind === 'tether' && [th.from, th.to].includes(p.id) && [th.from, th.to].includes(p.chat))));
  ok('no chat is joined straight to another chat', !c.threads.some((th) => c.nodes[th.from].role === 'chat' && c.nodes[th.to].role === 'chat'));
  const keys = c.threads.map((th) => [th.from, th.to].sort().join('|'));
  ok('no thread is drawn twice', new Set(keys).size === keys.length);
  ok('nothing was dropped at this size', c.dropped === 0);
}

console.log('\n=== the same picture every time, and quick at scale ===');
{
  ok('deterministic', JSON.stringify(constellation(atlas, { width: W, height: H })) === JSON.stringify(c));
  const big = { nodes: [], edges: [], stats: atlas.stats };
  for (let i = 0; i < 200; i++) big.nodes.push({ id: `c:k${i}`, kind: 'chat', type: 'Chat', label: `Chat ${i}`, chats: [`k${i}`], at: i, surface: i % 2 ? 'logos' : 'core' });
  for (let i = 0; i < 1100; i++) {
    const a = `k${i % 200}`, b = `k${(i * 7 + 3) % 200}`;
    big.nodes.push({ id: `i:${i}`, kind: 'idea', type: 'Idea', label: `Idea ${i}`, chats: i % 3 ? [a] : [a, b] });
    big.edges.push({ from: `i:${i}`, to: `c:${a}`, rel: 'on_map', n: 1 });
    if (!(i % 3)) big.edges.push({ from: `i:${i}`, to: `c:${b}`, rel: 'on_map', n: 1 });
  }
  for (let i = 0; i < 200; i++) {
    big.nodes.push({ id: `m:${i}`, kind: 'memory', type: 'Concept', label: `Memory number ${i}`, chats: [`k${i}`] });
    big.edges.push({ from: `m:${i}`, to: `c:k${i}`, rel: 'learned_in', n: 1 });
  }
  const t0 = performance.now();
  const cb = constellation(big, { width: W, height: H });
  const ms = performance.now() - t0;
  ok('1,500 nodes and 200 chats lay out in well under a second', ms < 800, `${ms.toFixed(0)} ms`);
  ok('…with threads capped and the rest counted', cb.threads.length <= MAX_THREADS && cb.threads.length + cb.dropped >= 0);
  const empty = constellation({ nodes: [], edges: [], stats: atlas.stats }, { width: W, height: H });
  ok('an empty atlas is an empty picture, not an error', Object.keys(empty.nodes).length === 0 && empty.threads.length === 0);
}

console.log('\n=== what a chat holds, for the panel ===');
{
  const h = contentsOf(atlas, 'l2');
  ok('its map, what was made in it, and what it taught', h.models.map((x) => x.label).sort().join() === 'Lasso path,Ridge regression' && h.memories.some((x) => x.label === 'Overfitting') && h.ideas.some((x) => x.label === 'Try L2 regularisation'));
  ok('…what another chat shares first', h.ideas[0].chats.length > 1, h.ideas.map((x) => x.label).join());
}

console.log('\n=== where it is seen ===');
{
  const page = read('components/mind/MindGraphView.tsx');
  ok('the Memory page opens on it', /useState<'graph' \| 'list' \| 'everything'>\('everything'\)/.test(page));
  ok('…its tab first', page.indexOf(">Everything</button>") < page.indexOf(">Graph</button>") && page.indexOf(">Graph</button>") < page.indexOf(">List</button>"));
  const view = read('components/mind/MindAtlas.tsx');
  ok('Everything is the constellation, not the folder graph', /<MindConstellation atlas=\{a\}/.test(view) && !/<Graph\b/.test(view));
  ok('…and brings the Memory page\'s styles wherever it is drawn', /import '\.\/mind-graph\.css';/.test(view));
  ok('Logos 3 has a Mind view of its own', SURFACE_TYPES.includes('mind') && SURFACES.mind?.title === 'Mind');
  const facts = factsFrom({ nodes: [{ id: 'n0', type: 'question', label: 'Q' }], edges: [] });
  const layout = presetLayout('think', { docs: [] });
  ok('…offered under + View to an account', suggestViews({ ...facts, mind: true }, layout).some((v) => v.type === 'mind'));
  ok('…and not without one', !suggestViews(facts, layout).some((v) => v.type === 'mind'));
  const app = read('components/LogosApp.tsx');
  ok('…drawn from the logos scope, on this chat', /case 'mind':[\s\S]{0,400}<MindAtlas\s+scope="logos"\s+embedded\s+focusChat=\{activeId\}/.test(app));
  ok('…offered when there is an account', /factsFrom\(map\), mind: cloud/.test(app));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
