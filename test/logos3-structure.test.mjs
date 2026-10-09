// Logos 3 has no Board: Structure takes its place — a detailed outline that
// takes the whole panel — and a person can ask for any view by name
// ("show this as a structure", "organize it into a mind map").
import { readFileSync } from 'node:fs';
import { structureOutline, flatten, phraseOf, countOf } from './.tmp/logos-structure.mjs';
import { availableLenses, leadLens } from './.tmp/logos-layout.mjs';
import { readViewRequest, viewSaid } from './.tmp/view-request.mjs';
import { factsFrom, showLens } from './.tmp/surfaces.mjs';
import { singleLayout, pairLayout, panelsOf, findPanel } from './.tmp/tiling.mjs';
import { statedBuilding } from './.tmp/representation.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const N = (id, type, label, extra = {}) => ({ id, type, label, ...extra });
const E = (from, to, relation, extra = {}) => ({ from, to, relation, ...extra });

// ── an argument ─────────────────────────────────────────────────────
const sleep = {
  context: 'deciding',
  nodes: [
    N('g', 'goal', 'Sleep better before exams'),
    N('c', 'claim', 'Late screens delay sleep onset', { status: 'supported', note: 'Mostly from phones in bed' }),
    N('e', 'evidence', 'Melatonin is suppressed by blue light'),
    N('i', 'idea', 'No phone after 10pm'),
    N('t', 'tension', 'Group chats run late'),
    N('q', 'question', 'Does caffeine matter more?'),
    N('x', 'idea', 'Buy blackout blinds'),
  ],
  edges: [E('c', 'g', 'supports'), E('e', 'c', 'supports'), E('i', 'g', 'supports'), E('t', 'i', 'conflicts'), E('q', 'c', 'relates')],
};

console.log('=== an argument, as an outline ===');
{
  const o = structureOutline(sleep);
  ok('read as a hierarchy', o.kind === 'hierarchy');
  ok('the goal heads it', o.sections[0].title === 'What this is for' && o.sections[0].items.length === 1 && o.sections[0].items[0].node.id === 'g');
  const g = o.sections[0].items[0];
  ok('what serves the goal hangs beneath it', g.children.map((c) => c.node.id).sort().join() === 'c,i', g.children.map((c) => c.node.id).join());
  const c = g.children.find((k) => k.node.id === 'c');
  ok('  and says how ("supports")', c.via === 'supports');
  ok('evidence under the claim it holds up', c.children.some((k) => k.node.id === 'e' && k.via === 'supports'));
  ok('a question that relates to a claim sits under it', c.children.some((k) => k.node.id === 'q' && k.via === 'relates to'));
  const i = g.children.find((k) => k.node.id === 'i');
  ok('a conflict is not nesting — it is a link, read from each side', i.links.some((l) => l.relation === 'conflicts' && l.other.id === 't' && l.phrase === 'conflicts with'));
  ok('what is not tied to the goal is shown, and said to be loose', o.sections.some((s) => s.key === 'loose' && s.items.some((it) => it.node.id === 'x')));
  ok('the tension sits apart, with its link back', o.sections.find((s) => s.key === 'loose').items.some((it) => it.node.id === 't' && it.links.some((l) => l.other.id === 'i')));
  ok('every part appears exactly once', flatten(o).map((x) => x.node.id).sort().join() === 'c,e,g,i,q,t,x', flatten(o).map((x) => x.node.id).join());
  ok('a summary in plain counts, with what is still open', /1 goal/.test(o.summary) && /2 ideas/.test(o.summary) && /2 still open/.test(o.summary), o.summary);
}

console.log('=== the hierarchy never loops ===');
{
  const loop = { nodes: [N('a', 'claim', 'A'), N('b', 'claim', 'B'), N('c', 'claim', 'C')], edges: [E('a', 'b', 'supports'), E('b', 'c', 'supports'), E('c', 'a', 'supports')] };
  const o = structureOutline(loop);
  ok('a cycle still lists every part once', flatten(o).length === 3);
  ok('  and the closing edge becomes a link', flatten(o).some((it) => it.links.length > 0));
}

console.log('=== mathematics, as the working ===');
{
  const eq = {
    context: 'math',
    nodes: [
      N('r', 'result', 'x = 4', { tex: 'x = 4' }),
      N('s2', 'step', '2x = 8'),
      N('gv', 'given', '2x + 6 = 14'),
      N('u', 'unknown', 'x'),
      N('s1', 'step', '2x + 6 - 6 = 14 - 6'),
      N('v', 'verification', '2(4) + 6 = 14', { flag: 'verified' }),
    ],
    edges: [E('gv', 's1', 'transforms_to', { op: '−6 both sides' }), E('s1', 's2', 'transforms_to'), E('s2', 'r', 'transforms_to', { op: '÷2' }), E('v', 'r', 'supports')],
  };
  const o = structureOutline(eq);
  ok('read as the working', o.kind === 'working');
  ok('in the order a person works it', o.sections.map((s) => s.key).join() === 'given,asked,working,checks,result', o.sections.map((s) => s.key).join());
  const w = o.sections.find((s) => s.key === 'working');
  ok('the steps in the order they were done, not the order they arrived', w.items.map((it) => it.node.id).join() === 's1,s2', w.items.map((it) => it.node.id).join());
  ok('each step says what turned it into the next', w.items[0].links.some((l) => l.phrase === 'becomes' && l.other.id === 's2') && w.items[0].links.some((l) => l.phrase === 'comes from' && l.op === '−6 both sides'));
  ok('the check says what it checks', o.sections.find((s) => s.key === 'checks').items[0].links.some((l) => l.phrase === 'supports' && l.other.id === 'r'));
}

console.log('=== words ===');
ok('relations read from either end', phraseOf('supports', true) === 'supports' && phraseOf('supports', false) === 'supported by' && phraseOf('depends', false) === 'needed by');
ok('counts read as people say them', countOf('evidence', 3) === '3 evidence' && countOf('verification', 1) === '1 check' && countOf('claim', 2) === '2 claims');
ok('an empty map is an empty outline', structureOutline({ nodes: [], edges: [] }).total === 0 && structureOutline({ nodes: [], edges: [] }).sections.length === 0);

console.log('=== Logos 3 has no Board; Structure takes its place ===');
{
  const math = { context: 'math', nodes: [N('a', 'given', 'x+1=3'), N('b', 'step', 'x=2'), N('c', 'result', 'x=2')], edges: [E('a', 'b', 'transforms_to'), E('b', 'c', 'transforms_to')] };
  const l2 = availableLenses(math);
  const l3 = availableLenses(math, { workspace: true });
  ok('Logos 2 keeps its Board', l2.includes('board'));
  ok('Logos 3 has none', !l3.includes('board'), l3.join());
  ok('  and offers Structure in its place, for mathematics too', l3.includes('structure') && l3.indexOf('structure') === l3.length - 1, l3.join());
  ok('  the working still leads', leadLens(l3, false, null) === 'solve');
  ok('an argument is offered Structure on both', availableLenses(sleep).includes('structure') && availableLenses(sleep, { workspace: true }).includes('structure'));
  ok('the workspace reads its lenses as Logos 3', !factsFrom(math).lenses.includes('board') && factsFrom(math).lenses.includes('structure'));
  ok('one part is not a structure', !availableLenses({ context: 'math', nodes: [N('a', 'given', 'x')], edges: [] }, { workspace: true }).includes('structure'));
}

console.log('=== asking for a view by name ===');
{
  const yes = [
    ['show this as a structure', 'structure'],
    ['Can you organize everything into an outline?', 'structure'],
    ['show me the structure', 'structure'],
    ['switch to the structure view', 'structure'],
    ['organize this as a mind map', 'graph'],
    ['turn it into a mind map please', 'graph'],
    ['mind map view', 'graph'],
    ['show it as a plot', 'plot'],
    ['put this into a chart', 'plot'],
    ['lay it out as a timeline', 'timeline'],
    ['show this as a flowchart', 'flow'],
    ['put the options in a table', 'matrix'],
    ['go back to the mind map', 'graph'],
    ['the outline please', 'structure'],
  ];
  for (const [s, lens] of yes) ok(`"${s}" → ${lens}`, readViewRequest(s)?.lens === lens, JSON.stringify(readViewRequest(s)));
  const no = [
    'What is the structure of DNA?',
    'how does the process of osmosis work',
    'I think the structure of my essay is weak',
    'show me the evidence',
    'can you give me the process for applying',
    'the plot of the novel confuses me, what happens in act two and why does the narrator lie about it',
    'Is a table better than a chart here?',
    'my timeline slipped by a week',
  ];
  for (const s of no) ok(`not a view: "${s}"`, readViewRequest(s) === null, JSON.stringify(readViewRequest(s)));
  ok('each view has its own line', viewSaid('structure') !== viewSaid('graph') && /structure/.test(viewSaid('structure')));
  ok('the map pass reads the same words as a shape to build', statedBuilding('show this as a chart') === 'model' && statedBuilding('organize this as a concept map') === 'brainstorm');
}

console.log('=== the asked-for view takes over ===');
{
  const one = showLens(singleLayout('model'), 'structure');
  const ps = panelsOf(one);
  ok('a single surface becomes the map, in that view', ps.length === 1 && ps[0].type === 'map' && ps[0].config?.lens === 'structure');
  const two = pairLayout({ type: 'map' }, { type: 'model' });
  const t = showLens(two, 'structure');
  const mp = panelsOf(t).find((p) => p.type === 'map');
  ok('in an arrangement, the map panel is pointed at it', mp.config?.lens === 'structure');
  ok('  and given the whole workspace', t.maximized === mp.id);
  ok('  with the arrangement kept for when they restore it', panelsOf(t).length === 2);
  const noMap = pairLayout({ type: 'model' }, { type: 'params' });
  const u = showLens(noMap, 'graph');
  const added = panelsOf(u).find((p) => p.type === 'map');
  ok('with no map panel, one is added in that view and takes over', added && added.config?.lens === 'graph' && u.maximized === added.id && findPanel(u, added.id));
}

console.log('=== wired ===');
{
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const tm = read('components/ThinkingMap.tsx');
  ok('the map draws Structure as the detailed outline in Logos 3', /workspace && lens === 'structure' && \(\s*<StructureView/.test(tm));
  ok('  and offers lenses as Logos 3', /availableLenses\(map, \{ workspace \}\)/.test(tm));
  ok('  and the outline is not a canvas of cards there', /drawsCards\(l\) && !\(workspace && l === 'structure'\)/.test(tm));
  const app = read('components/LogosApp.tsx');
  ok('Logos tells the map whether it is Logos 3', /workspace=\{workspaceOn\}/.test(app));
  // read directly, or through readInterfaceRequest, which reads a lens exactly as readViewRequest does and applies it with showLens (layoutForRequest)
  const asLens = /readViewRequest\(content\)/.test(app) && /changeLayout\(showLens\(wsLayout, want\.lens\)\)/.test(app);
  const asInterface = /readInterfaceRequest\(content/.test(app) && /changeLayout\(layoutForRequest\(/.test(app);
  ok('a view asked for by name turns the stage, in Logos 3', (asLens || asInterface) && /if \(workspaceOn && wsLayout/.test(app));
  ok('  and answers itself when the view can already be drawn', /wsFacts\.lenses\.includes\(want\.lens\)/.test(app));
  const pins = read('components/share/comments/Comments.tsx');
  ok('comment pins find a part in the outline as well as on the canvas', /\.lg-sv-row\[data-id=/.test(pins));
  const sv = read('components/StructureView.tsx');
  ok('the outline masks a guarded result, as its card does', /masked\(guarded, n\.type\)/.test(sv) && /'=\\\\ \?'/.test(sv));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
