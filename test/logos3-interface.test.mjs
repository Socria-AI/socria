// Logos 3 — interfaces from what the person says, what a build opens, and
// every view by name.
//
// "Open the model", "show it in 3D", "put the map beside the model", "close
// the map": read by lib/workspace/interface-request.ts, conservatively, and
// never confused with a request to BUILD something. Applied by the pure layout
// builders in lib/workspace/surfaces.ts, which reuse the panels that are there
// and keep the conversation where it is. A build opens the model beside a lone
// map (and its 3D view when it has solids), keyed on the build itself, never on
// a count of documents. A map beside a model reads as the reasoning, not the
// model a second time. "+ View" lists every kind of view.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readInterfaceRequest, interfaceSaid, surfacesNamed } from './.tmp/interface-request.mjs';
import { readViewRequest, viewSaid } from './.tmp/view-request.mjs';
import {
  addPanel, closePanel, findPanel, maximize, pairLayout, panelsOf, rowLayout, reshare, singleLayout, splitPanel, visiblePanels, besideShare, SERVING, sanitizeLayout,
} from './.tmp/tiling.mjs';
import {
  afterBuild, arrangementsFor, closeSurfaces, closeView, factsFrom, interfaceContext, layoutForRequest, layoutForSurfaces, onlySurfaces, openBeside, openView,
  panelFor, showLens, showsDoc, suggestLayout, suggestViews, SURFACES, VIEW_CATALOGUE, VIEW_NAMES, viewCatalogue, viewOf,
} from './.tmp/surfaces.mjs';
import { availableLenses, leadLens, reasoningLens } from './.tmp/logos-layout.mjs';
import { open, EMPTY_WORKSPACE, DOC_CAP } from './.tmp/docs.mjs';
import { modelById } from './.tmp/library.mjs';
import { create } from './.tmp/index.mjs';
import { readMapCommand } from './.tmp/map-edit.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

/** Every split's sizes sum to one, every id is unique, every split has two children or more. */
function sound(layout) {
  const ids = new Set();
  let good = true;
  const walk = (n) => {
    if (!n) return;
    if (ids.has(n.id)) good = false;
    ids.add(n.id);
    if (n.kind === 'split') {
      const sum = n.sizes.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 1e-9 || n.children.length < 2 || n.sizes.length !== n.children.length || n.sizes.some((s) => !(s > 0))) good = false;
      n.children.forEach(walk);
    }
  };
  walk(layout.root);
  return good && (!layout.maximized || !!findPanel(layout, layout.maximized));
}
const types = (l) => panelsOf(l).map((p) => p.type).join(',');
const req = (s, ctx) => readInterfaceRequest(s, ctx);
const said = (s, ctx) => {
  const r = req(s, ctx);
  return r ? `${r.op}:${r.surfaces.join('+')}${r.lens ? `/${r.lens}` : ''}` : null;
};

// ── fixtures over the real engine ──
const N = (id, type, label) => ({ id, type, label });
const IDEAS = [N('n1', 'concept', 'a cone'), N('n2', 'value', 'its volume'), N('n3', 'idea', 'slant height')];
const built = open(EMPTY_WORKSPACE, modelById('saddle'));
const DOC = built.workspace.docs[0].id;
const withModel = { context: 'learning', nodes: IDEAS, edges: [], models: built.workspace };
const facts = factsFrom(withModel);
const solidFacts = factsFrom(withModel, { solids: () => true });
const sceneMap = { nodes: IDEAS, edges: [], objects: create({ objs: [] }, 'scene', { nodes: [], next: 1, unit: 'm' }, { name: 'Scene', origin: 'person' }).space };
const sceneFacts = factsFrom(sceneMap);
const SCENE_ID = sceneMap.objects.objs[0].id;
const bare = factsFrom({ nodes: [], edges: [] });
const mapPanel = (l) => panelsOf(l).find((p) => p.type === 'map');

console.log('=== asking for an interface: what is read ===');
{
  const yes = [
    ['open the model', 'open:model'],
    ['show the model', 'open:model'],
    ['Open the model.', 'open:model'],
    ['can you show me the model?', 'open:model'],
    ['could you open the model please', 'open:model'],
    ['please show the model', 'open:model'],
    ['show me the model, please', 'open:model'],
    ['bring up the model', 'open:model'],
    ['I want to see the model', 'open:model'],
    ['can I see the model?', 'open:model'],
    ['the model panel', 'open:model'],
    ['the model please', 'open:model'],
    ['open the simulation', 'open:model'],
    ['show it in 3D', 'open:scene'],
    ['show it in 3-D', 'open:scene'],
    ['show this in three d', 'open:scene'],
    ['view it in 3D', 'open:scene'],
    ['show the model in 3D', 'open:scene'],
    ['show the cone in 3D', 'open:scene'],
    ['in 3D please', 'open:scene'],
    ['open Live 3D', 'open:scene'],
    ['Live 3D', 'open:scene'],
    ['open CAD', 'open:scene'],
    ['open the CAD view', 'open:scene'],
    ['open the studio', 'open:scene'],
    ['Studio (CAD)', 'open:scene'],
    ['show the 3D view', 'open:scene'],
    ['the 3D view', 'open:scene'],
    ['open a 3D view', 'open:scene'],
    ['open the 3D model', 'open:scene'],
    ['show the parameters', 'open:params'],
    ['show the sliders', 'open:params'],
    ['open the controls', 'open:params'],
    ['show me the parameters panel', 'open:params'],
    ['open the map', 'open:map'],
    ['show me the map', 'open:map'],
    ['open the thinking map', 'open:map'],
    ['the thinking map', 'open:map'],
    ['bring the map back', 'open:map'],
    ['open the inspector', 'open:inspector'],
    ['show the trace', 'open:trace'],
    ['show the history', 'open:trace'],
    ["show the model's history", 'open:trace'],
    ['open the chat', 'open:chat'],
    ['show the conversation', 'open:chat'],
    ['open the mind view', 'open:mind'],
    ['open math plotting', 'open:map/plot'],
    ['show both', 'pair:map+model'],
    ['show both side by side', 'pair:map+model'],
    ['put them side by side', 'pair:map+model'],
    ['show the map and the model side by side', 'pair:map+model'],
    ['show me the map and the model side by side please', 'pair:map+model'],
    ['show both the map and the model', 'pair:map+model'],
    ['put the map beside the model', 'pair:map+model'],
    ['put the model next to the map', 'pair:map+model'],
    ['show the map alongside the model', 'pair:map+model'],
    ['put it beside the map', 'pair:map+model'],
    ['map and model side by side', 'pair:map+model'],
    ['show the model side by side', 'pair:map+model'],
    ['open the model and the 3D view', 'pair:model+scene'],
    ['show the model beside its 3D view', 'pair:model+scene'],
    ['show the map and the 3D view', 'pair:map+scene'],
    ['show me the map and the 3D model side by side', 'pair:map+scene'],
    ['show all three', 'all:map+model+scene'],
    ['show the map, the model and the 3D view', 'all:map+model+scene'],
    ['show the model with its sliders', 'open:model+params'],
    ['close the map', 'close:map'],
    ['hide the map', 'close:map'],
    ['take the map away', 'close:map'],
    ['take down the map', 'close:map'],
    ['close the mind map', 'close:map'],
    ['close the model', 'close:model'],
    ['close the 3D view', 'close:scene'],
    ['hide Live 3D', 'close:scene'],
    ['remove the 3D model', 'close:model+scene'],
    ['close the parameters', 'close:params'],
    ['get rid of the sliders', 'close:params'],
    ['close the plot', 'close:map/plot'],
    ['close the chat', 'close:chat'],
    ['close everything', 'close:model+scene+params+inspector+trace+mind'],
    ['just the model', 'only:model'],
    ['only the map please', 'only:map'],
    ['show only the model', 'only:model'],
    ['switch to the model', 'only:model'],
    ['go back to the map', 'only:map'],
    ['switch to 3D', 'only:scene'],
    ['maximise the model', 'only:model'],
    ['maximize the 3D view', 'only:scene'],
    ['make the model full screen', 'only:model'],
    ['show the model instead', 'only:model'],
    ['show the map again', 'open:map'],
    ['ok, open the model', 'open:model'],
    ['Socria, open the model', 'open:model'],
    ['now show both', 'pair:map+model'],
  ];
  for (const [s, want] of yes) ok(`"${s}" → ${want}`, said(s) === want, String(said(s)));

  // CONSTRUCTION is never a request for an interface — it goes on to be built
  const making = [
    'model a 2×2×2 meter cube',
    'make a 3D model of a cone',
    'build a model of supply and demand',
    'Create an interactive 3D model of a rocket nose cone with a base diameter of 20 cm and a height of 40 cm. Include sliders to adjust both, labelled dimensions, and show the base area, surface area and volume.',
    'create an interactive 3D model of a rocket nose cone',
    "show me how a cone's volume changes",
    'show me how a cone’s volume changes as the height grows',
    'show me a model of the economy',
    'show me a model',
    'open a new model',
    'show a cone in 3D',
    'draw a cone in 3D',
    'make it 3D',
    'turn this into a 3D model',
    'show it as a model',
    'model the map',
    'design a 3D bracket in CAD',
    'show the parameters of a cone',
    'build the model again with a bigger base',
    'make the model',
    'make the cone wider',
  ];
  for (const s of making) ok(`building, not an interface: "${s.slice(0, 60)}"`, req(s) === null, String(said(s)));

  // QUESTIONS about things are not requests to see them
  const asking = [
    'what is a model?',
    'is the map right?',
    'what does the model show?',
    'how do I open the model?',
    'why is the map empty?',
    'should I close the map?',
    'can a model be wrong?',
    'could the 3D view be misleading?',
    'does the map show everything?',
    'is it in 3D?',
    'show the model?',
  ];
  for (const s of asking) ok(`a question, not a request: "${s}"`, req(s) === null, String(said(s)));

  // and nothing else that only mentions a surface
  const other = [
    'I like the model',
    'the model is wrong',
    'model',
    'the model',
    'both',
    'both please',
    'everything',
    'show it',
    'close it',
    'close both',
    'remove the outlier',
    'close the gap',
    'close the deal',
    'open the door',
    'show me the answer',
    'show the work',
    'show the volume',
    'hide the answer',
    'show the map in 3D',
    'show both models side by side',
    'put the model',
    'delete the model',
    'show me the map of Europe',
    'show me a map',
    'open the model and explain what each parameter means in plain words please',
  ];
  for (const s of other) ok(`not an interface request: "${s.slice(0, 60)}"`, req(s) === null, String(said(s)));
  ok('not a string is nothing', req(undefined) === null && req(42) === null && req('') === null);

  // WHY IT IS READ BEFORE MAP COMMANDS: read as a map command, these edit the map
  const rocket = { nodes: [N('r1', 'concept', 'Interactive 3D model'), N('r2', 'concept', 'nose cone'), N('r3', 'concept', 'the map of forces')], edges: [] };
  const asCommand = readMapCommand('remove the 3D model', rocket);
  ok('"remove the 3D model", read as a map command, deletes the idea "Interactive 3D model"', !!asCommand?.edits?.some((e) => e.op === 'remove' && e.id === 'r1'), JSON.stringify(asCommand));
  ok('  read first as an interface request, it closes the model and its 3D view instead', said('remove the 3D model') === 'close:model+scene');
  ok('  and "close the map" and "close the model" are closes, not node edits', said('close the map') === 'close:map' && said('close the model') === 'close:model');
  ok('long messages are prose, not commands', req('open the model '.repeat(8)) === null);
}

console.log('\n=== a lens asked for by name reads exactly as it did ===');
{
  // the same sentences lib/view-request.ts was built and tested on
  const lensPhrases = [
    'show this as a structure', 'Can you organize everything into an outline?', 'show me the structure', 'switch to the structure view',
    'organize this as a mind map', 'turn it into a mind map please', 'mind map view', 'show it as a plot', 'put this into a chart',
    'lay it out as a timeline', 'show this as a flowchart', 'put the options in a table', 'go back to the mind map', 'the outline please',
    'side by side', 'show me the plot',
  ];
  for (const s of lensPhrases) {
    const v = readViewRequest(s);
    const r = req(s);
    ok(`"${s}" is the map in lens ${v?.lens}`, !!v && r?.op === 'open' && r.surfaces.join() === 'map' && r.lens === v.lens && r.called === v.called, JSON.stringify(r));
    ok(`  and says what it always said`, interfaceSaid(r) === viewSaid(v.lens));
  }
  for (const s of ['What is the structure of DNA?', 'how does the process of osmosis work', 'show me the evidence', 'my timeline slipped by a week']) {
    ok(`still not a view: "${s}"`, readViewRequest(s) === null && req(s) === null);
  }
  const lone = singleLayout('model');
  const two = pairLayout({ type: 'map' }, { type: 'model' });
  for (const [name, l] of [['a single surface', lone], ['an arrangement', two]]) {
    const r = req('show this as a structure');
    ok(`applied as showLens did, on ${name}`, JSON.stringify(layoutForRequest(r, l, facts)) === JSON.stringify(showLens(l, 'structure')));
  }
}

console.log('\n=== what is there decides what "both" and "everything" mean ===');
{
  const all = { hasModel: true, hasScene: true, hasMap: true };
  ok('"both" with a map and a model is the two of them', said('show both', all) === 'pair:map+model');
  ok('"both" with a model and a 3D view, and an empty map, is those', said('show both', { hasModel: true, hasScene: true, hasMap: false }) === 'pair:model+scene');
  ok('"both" with a map and a scene, and no model, is those', said('show both', { hasModel: false, hasScene: true, hasMap: true }) === 'pair:map+scene');
  ok('"both" with one thing to show is not a request', said('show both', { hasModel: false, hasScene: false, hasMap: true }) === null);
  ok('"everything" is all of what there is', said('show everything', all) === 'all:map+model+scene' && said('show everything', { hasModel: true, hasScene: false, hasMap: true }) === 'pair:map+model');
  ok('"all three" is all three, whatever is there', said('show all three', { hasModel: false, hasScene: false }) === 'all:map+model+scene');
  ok('the 3D model is its 3D view, where there is one', said('open the 3D model', all) === 'open:scene');
  ok('  and the model, where nothing is in 3D', said('open the 3D model', { hasModel: true, hasScene: false }) === 'open:model');
  ok('"the 3D view side by side" pairs it with the model', said('show the 3D view side by side', all) === 'pair:model+scene');
  const none = { hasModel: false, hasScene: false, hasMap: false };
  const m = req('open the model', none);
  ok('a model asked for where there is none still opens — onto its empty state — and the reply says why', m.op === 'open' && m.missing?.join() === 'model' && /no model/.test(interfaceSaid(m)), JSON.stringify(m));
  ok('  parameters too', req('show the sliders', none).missing?.join() === 'params');
  ok('  and 3D, where nothing is in 3D yet', req('show it in 3D', none).missing?.join() === 'scene' && /Nothing is in 3D yet/.test(interfaceSaid(req('show it in 3D', none))));
  ok('a close is never "missing"', !req('close the model', none).missing);
  ok('the context comes from the same facts as the workspace', JSON.stringify(interfaceContext(facts)) === '{"hasModel":true,"hasScene":false,"hasMap":true}' && interfaceContext(solidFacts).hasScene && interfaceContext(sceneFacts).hasScene && !interfaceContext(sceneFacts).hasModel && !interfaceContext(bare).hasMap);
  ok('  and with it, "show it in 3D" in a line of thinking with a solid model is not missing anything', !req('show it in 3D', interfaceContext(solidFacts)).missing && req('show it in 3D', interfaceContext(facts)).missing?.join() === 'scene');
  ok('unknown context is read generously: nothing is said to be missing', !req('open the model').missing && !req('show it in 3D').missing);
}

console.log('\n=== what Socria says ===');
{
  const line = (s, ctx) => interfaceSaid(req(s, ctx));
  ok('open: one plain line', line('open the model') === 'Here is the model.' && line('show it in 3D') === 'Here it is in 3D.' && line('show the parameters') === 'Here are the parameters.');
  ok('side by side', line('show the map and the model side by side') === 'Here are the map and the model, side by side.');
  ok('all three', line('show all three') === 'Here are the map, the model and the 3D view, together.');
  ok('on its own', line('just the model') === 'Here is the model, on its own.');
  ok('close', line('close the map') === 'Closed the map.' && line('remove the 3D model') === 'Closed the model and the 3D view.' && line('close the plot') === 'Closed the plot.');
  ok('close everything', line('close everything') === 'Closed everything but the map.');
  ok('every line is one short sentence or two', ['open the model', 'show both', 'close the map', 'show all three', 'just the model', 'show it in 3D'].every((s) => line(s).length < 90));
}

console.log('\n=== what a sentence names, for the suggestion line ===');
{
  ok('the map and the model', surfacesNamed('open the map and the model side by side').join() === 'map,model');
  ok('a 3D model is the 3D view, not a second model', surfacesNamed('put the 3D model beside the map').join() === 'map,scene');
  ok('CAD and Live 3D are 3D', surfacesNamed('show it in CAD').join() === 'scene' && surfacesNamed('open live 3d').join() === 'scene');
  ok('two models are not the map', surfacesNamed('compare the saddle with the torus').length === 0);
}

console.log('\n=== a map holding a model keeps its reasoning (logos-layout) ===');
{
  const l3 = availableLenses(withModel, { workspace: true });
  const l2 = availableLenses(withModel);
  ok('the graph stays offered beside the plot, in Logos 3 and Logos 2', l3.includes('graph') && l3.includes('plot') && l2.includes('graph'), `${l3} / ${l2}`);
  ok('  after the plot, which still sorts first', l3.indexOf('plot') < l3.indexOf('graph'));
  ok('the plot still leads a map on its own', leadLens(l3, true, null) === 'plot' && leadLens(l2, true, null) === 'plot' && facts.lead === 'plot');
  ok('the lens beside a model is the reasoning, not the plot', facts.reasoning === 'graph' && reasoningLens(l3) === 'graph');
  const brainstorm = { ...withModel, building: { kind: 'brainstorm' } };
  ok('a brainstorm holding a model still opens on the plot, as it did', leadLens(availableLenses(brainstorm, { workspace: true }), true, brainstorm.building) === 'plot');
  const system = { ...withModel, building: { kind: 'system' } };
  ok('a system holding a model still opens on its structure, as it did', leadLens(availableLenses(system, { workspace: true }), true, system.building) === 'structure');
  const argument = { ...withModel, context: 'deciding', building: { kind: 'argument' }, nodes: [...IDEAS, N('n4', 'evidence', 'two studies')] };
  ok('an argument holding a model leads with its evidence, and reads as it beside the model', leadLens(availableLenses(argument, { workspace: true }), true, argument.building) === 'evidence' && factsFrom(argument).reasoning === 'evidence');
  const math = { context: 'math', nodes: [N('a', 'given', 'x+1=3'), N('b', 'step', 'x=2')], edges: [{ from: 'a', to: 'b', relation: 'transforms_to' }], models: built.workspace };
  ok('mathematics keeps its working, which is what it reads as beside a model', factsFrom(math).reasoning === 'solve' && !availableLenses(math, { workspace: true }).includes('graph'));
  const oneGiven = { context: 'math', nodes: [N('a', 'given', 'x')], edges: [], models: built.workspace };
  ok('a single idea under a calculation is offered the graph, so the map beside the model is not the model', availableLenses(oneGiven, { workspace: true }).includes('graph') && factsFrom(oneGiven).reasoning === 'graph');
  ok('an empty map has no reading but the model', factsFrom({ nodes: [], edges: [], models: built.workspace }).reasoning === null);
  ok('a map with no model is offered what it always was', availableLenses({ context: 'math', nodes: [N('a', 'given', 'x+1=3'), N('b', 'step', 'x=2')], edges: [{ from: 'a', to: 'b', relation: 'transforms_to' }] }, { workspace: true }).join() === 'solve,structure');
}

console.log('\n=== the arrangements: the map beside the model shows the map ===');
{
  const arr = arrangementsFor(facts, singleLayout('map'));
  const ids = arr.map((a) => a.id);
  const mm = arr.find((a) => a.id === 'map-model');
  ok('"Map beside the model" is offered', !!mm, ids.join());
  ok('  its map is pinned to a lens the map offers beside a model — not the plot', !!mm && mapPanel(mm.layout).config?.lens === 'graph' && facts.lenses.includes('graph'), JSON.stringify(mm?.layout));
  ok('  the model has the larger share', mm.layout.root.sizes[1] > mm.layout.root.sizes[0] && sound(mm.layout));
  ok('the existing ids stay', ['compare', 'controls', 'map-model'].every((id) => ids.includes(id)) && arrangementsFor(facts, pairLayout({ type: 'map' }, { type: 'model' })).some((a) => a.id === 'one'));
  ok('no 3D arrangement where nothing is in 3D', !ids.some((id) => id === 'map-scene' || id === 'model-scene' || id === 'all'));
  const s3 = arrangementsFor(solidFacts, singleLayout('map'));
  const byId = (id) => s3.find((a) => a.id === id);
  ok('a model with solids offers it beside its 3D view, the map beside the 3D view, and all three', !!byId('model-scene') && !!byId('map-scene') && !!byId('all'), s3.map((a) => a.id).join());
  ok('  the 3D view is the model’s own, pinned to it', panelsOf(byId('model-scene').layout).find((p) => p.type === 'scene').config?.doc === DOC);
  ok('  all three, left to right: map, model, 3D', types(byId('all').layout) === 'map,model,scene' && mapPanel(byId('all').layout).config?.lens === 'graph' && sound(byId('all').layout));
  const sc = arrangementsFor(sceneFacts, singleLayout('map'));
  ok('a Live 3D scene and a map with reasoning offer the map beside it, pinned to the scene', sc.find((a) => a.id === 'map-scene')?.layout && panelsOf(sc.find((a) => a.id === 'map-scene').layout)[1].config?.obj === SCENE_ID, sc.map((a) => a.id).join());
  ok('  and no model arrangement without a model', !sc.some((a) => a.id === 'model-scene' || a.id === 'map-model' || a.id === 'all'));
  ok('  the map beside a scene reads as the reasoning, not the objects', mapPanel(sc.find((a) => a.id === 'map-scene').layout).config?.lens !== 'work');
  ok('a map with two ideas offers no map beside the model', !arrangementsFor(factsFrom({ ...withModel, nodes: IDEAS.slice(0, 2) }), singleLayout('model')).some((a) => a.id === 'map-model'));
}

console.log('\n=== "side by side" means what it names ===');
{
  const one = singleLayout('map');
  const s = suggestLayout(facts, one, 'Open the map and the model side by side', new Set());
  ok('the map and the model side by side suggest the map beside the model — not a comparison', s?.arrangement === 'map-model', JSON.stringify(s));
  ok('  and the arrangement it names is the map, in its reasoning, beside the model', types(arrangementsFor(facts, one).find((a) => a.id === s.arrangement).layout) === 'map,model');
  ok('  "put the map beside the model" says the same', suggestLayout(facts, one, 'after that, can you put the map beside the model so I can see both', new Set())?.arrangement === 'map-model');
  ok('  nothing is suggested once that is what is on screen', suggestLayout(facts, layoutForSurfaces(['map', 'model'], one, facts), 'open the map and the model side by side', new Set()) === null);
  ok('  and a dismissed one is not made again', suggestLayout(facts, one, 'open the map and the model side by side', new Set(['map-model'])) === null);
  ok('the model beside its 3D view, when it has one', suggestLayout(solidFacts, singleLayout('model'), 'can I see the model and the 3D view side by side?', new Set())?.arrangement === 'model-scene');
  ok('all three', suggestLayout(solidFacts, one, 'I want the map, the model and the 3D view side by side', new Set())?.arrangement === 'all');
  ok('one model, "side by side", naming nothing, is not a comparison', suggestLayout(facts, singleLayout('model'), 'show them side by side', new Set()) === null);
  const two = { ...withModel, models: open(built.workspace, modelById('torus')).workspace };
  const f2 = factsFrom(two);
  ok('two models side by side are compared', suggestLayout(f2, singleLayout('model'), 'show them side by side', new Set())?.arrangement === 'compare');
  ok('"compare" and "versus" still compare', suggestLayout(f2, singleLayout('model'), 'compare the saddle with the torus', new Set())?.arrangement === 'compare' && suggestLayout(facts, singleLayout('model'), 'the model versus its level sets', new Set())?.arrangement === 'compare');
  ok('"compare the map with the model" is the map beside the model', suggestLayout(facts, one, 'compare the map with the model', new Set())?.arrangement === 'map-model');
}

console.log('\n=== the layout builders ===');
{
  const lone = singleLayout('map');
  const mm = layoutForSurfaces(['map', 'model'], lone, facts);
  ok('map | model from a lone map: the map is kept, the model opens after it', types(mm) === 'map,model' && panelsOf(mm)[0].id === 'p1' && sound(mm), JSON.stringify(mm));
  ok('  the map reads as its reasoning, not the model again', mapPanel(mm).config?.lens === 'graph');
  ok('  the model has the larger share', mm.root.sizes[1] > mm.root.sizes[0]);
  const ms = layoutForSurfaces(['map', 'scene'], lone, sceneFacts);
  ok('map | 3D from a lone map, the 3D panel on the scene', types(ms) === 'map,scene' && panelsOf(ms)[1].config?.obj === SCENE_ID && sound(ms), JSON.stringify(ms));
  ok('  the map beside a scene is not its Work lens', mapPanel(ms).config?.lens && mapPanel(ms).config.lens !== 'work');
  const md = layoutForSurfaces(['model', 'scene'], singleLayout('model'), solidFacts);
  ok('model | 3D from a lone model: the model is kept, its 3D view pinned to it', types(md) === 'model,scene' && panelsOf(md)[0].id === 'p1' && panelsOf(md)[1].config?.doc === DOC && sound(md));
  ok('  sharing the room evenly', Math.abs(md.root.sizes[0] - 0.5) < 1e-9);
  const three = layoutForSurfaces(['scene', 'model', 'map'], lone, solidFacts);
  ok('map | model | 3D, in that order whatever order they were asked in', types(three) === 'map,model,scene' && three.root.children.length === 3 && sound(three), JSON.stringify(three));
  ok('  the map a little narrower than the other two', three.root.sizes[0] < three.root.sizes[1] && Math.abs(three.root.sizes[1] - three.root.sizes[2]) < 1e-9);
  const fromModel = layoutForSurfaces(['map', 'model'], singleLayout('model'), facts);
  ok('from a lone model, the map opens before it', types(fromModel) === 'map,model' && panelsOf(fromModel)[1].id === 'p1' && sound(fromModel));
  const empty = layoutForSurfaces(['map', 'model', 'scene'], { v: 1, root: null }, solidFacts);
  ok('an empty workspace gets the row', types(empty) === 'map,model,scene' && sound(empty));
  ok('nothing asked for, nothing changed', layoutForSurfaces([], lone, facts) === lone);
  ok('what is already there is used again, not duplicated', JSON.stringify(panelsOf(layoutForSurfaces(['map', 'model'], mm, facts))) === JSON.stringify(panelsOf(mm)));

  // the conversation, as a panel, keeps its place
  const docked = pairLayout({ type: 'map' }, { type: 'chat' }, 0.64);
  const dm = layoutForSurfaces(['map', 'model'], docked, facts);
  ok('chat docked as a panel: it stays, with the room it had', types(dm) === 'map,model,chat' && Math.abs(dm.root.sizes[2] - 0.36) < 1e-9 && sound(dm), JSON.stringify(dm));
  ok('the conversation is never added — it is the dock’s', layoutForSurfaces(['chat'], lone, facts) === lone && !panelsOf(layoutForSurfaces(['map', 'model', 'chat'], lone, facts)).some((p) => p.type === 'chat'));

  // a maximised panel gives the rest back when more is asked for
  const max = maximize(pairLayout({ type: 'map' }, { type: 'model' }), 'p1');
  const back = layoutForSurfaces(['map', 'model'], max, facts);
  ok('maximised: asking for both brings both back', !back.maximized && types(back) === 'map,model');
  ok('  asking for the one already maximised leaves it so', layoutForSurfaces(['map'], max, facts).maximized === 'p1');
  ok('  asking for another shows the arrangement again', !layoutForSurfaces(['model'], max, facts).maximized);

  // other panels keep their place
  const busy = pairLayout({ type: 'model' }, { type: 'params' }, 0.72);
  const withMap = layoutForSurfaces(['map', 'model'], busy, facts);
  ok('in an arrangement of the person’s own, the map opens beside the model, and the parameters stay', types(withMap) === 'map,model,params' && panelsOf(withMap)[1].id === 'p1' && sound(withMap), JSON.stringify(withMap));
  const plus = layoutForSurfaces(['model', 'params'], lone, facts);
  ok('a serving panel opens at a third beside what it serves', types(plus) === 'map,model,params' && plus.root.sizes[2] < plus.root.sizes[1] && sound(plus), JSON.stringify(plus.root.sizes));

  // a pinned model
  const pinned = singleLayout('model', { doc: 'elsewhere' });
  const opened = layoutForSurfaces(['model'], pinned, facts);
  ok('a model panel pinned to another model is not this one: a panel opens for it', panelsOf(opened).filter((p) => p.type === 'model').length === 2 && sound(opened));
  ok('a model panel is pinned only to a model it would not show anyway', !panelFor('model', facts, { doc: DOC }).config && panelFor('model', facts, { doc: 'other' }).config?.doc === 'other');
  ok('a 3D panel is the model’s solids, else the newest scene, else the empty studio', panelFor('scene', solidFacts).config?.doc === DOC && panelFor('scene', sceneFacts).config?.obj === SCENE_ID && !panelFor('scene', facts).config);
  ok('  the solids the build reports win over the facts', panelFor('scene', facts, { doc: DOC, solids: true }).config?.doc === DOC);

  // Math plotting is the person's own choice of lens
  const plot = rowLayout([{ type: 'map', config: { lens: 'plot' } }, { type: 'inspector' }]);
  const nextToPlot = layoutForSurfaces(['model'], plot, facts);
  ok('a map pinned to the plot keeps it when a model opens beside it', mapPanel(nextToPlot).config?.lens === 'plot');
  ok('  and a plain map is never that panel', panelsOf(layoutForSurfaces(['map', 'model'], plot, facts)).filter((p) => p.type === 'map').length === 2);
  const asked = layoutForRequest(req('show the plot beside the model'), lone, facts);
  ok('the plot asked for beside the model is the plot', types(asked) === 'map,model' && mapPanel(asked).config?.lens === 'plot');
}

console.log('\n=== closing, and giving the stage to one ===');
{
  const two = pairLayout({ type: 'map' }, { type: 'model' });
  ok('close the map: the model takes its room', types(closeSurfaces(['map'], two, facts)) === 'model');
  ok('close the model: the map takes its room', types(closeSurfaces(['model'], two, facts)) === 'map');
  ok('closing the last map leaves the model, where there is one', types(closeSurfaces(['map'], singleLayout('map'), facts)) === 'model');
  ok('  and an empty workspace where there is not', closeSurfaces(['map'], singleLayout('map'), bare).root === null);
  ok('closing the last model rests on the map', types(closeSurfaces(['model'], singleLayout('model'), facts)) === 'map');
  ok('closing what is not open changes nothing', closeSurfaces(['scene'], two, facts) === two);
  const three = rowLayout([{ type: 'map' }, { type: 'model' }, { type: 'scene', config: { doc: DOC } }]);
  ok('remove the 3D model: the model and its 3D view go, the map stays', types(layoutForRequest(req('remove the 3D model'), three, solidFacts)) === 'map');
  const plots = rowLayout([{ type: 'map', config: { lens: 'plot' } }, { type: 'map', config: { lens: 'structure' } }]);
  ok('close the plot closes the map that shows the plot, only', JSON.stringify(panelsOf(layoutForRequest(req('close the plot'), plots, facts)).map((p) => p.config?.lens)) === '["structure"]');
  const chatty = rowLayout([{ type: 'map' }, { type: 'model' }, { type: 'params' }, { type: 'chat' }]);
  ok('close everything: back to the map, the conversation where it was', types(layoutForRequest(req('close everything'), chatty, facts)) === 'map,chat');
  ok('the result is always sound', [two, three, chatty].every((l) => sound(closeSurfaces(['model', 'scene'], l, facts))));

  ok('just the model, from a lone map: the model is the workspace', types(onlySurfaces(['model'], singleLayout('map'), facts)) === 'model');
  const max = onlySurfaces(['model'], two, facts);
  ok('just the model, among several: maximised, so restore brings the rest back', max.maximized === 'p2' && panelsOf(max).length === 2);
  const added = onlySurfaces(['scene'], two, solidFacts);
  ok('just the 3D view, which is not open: added, then maximised', panelsOf(added).length === 3 && findPanel(added, added.maximized)?.type === 'scene');
  const pair = onlySurfaces(['map', 'model'], rowLayout([{ type: 'map' }, { type: 'model' }, { type: 'params' }, { type: 'chat' }]), facts);
  ok('just the map and the model: the others close, the conversation stays', types(pair) === 'map,model,chat' && sound(pair));
  ok('"switch to the model" is that', types(layoutForRequest(req('switch to the model'), singleLayout('map'), facts)) === 'model');
}

console.log('\n=== what a build opens ===');
{
  const b = { doc: DOC, solids: false };
  const lone = afterBuild(singleLayout('map'), facts, b);
  ok('a lone map: the model opens BESIDE it', lone.layout && types(lone.layout) === 'map,model' && !lone.suggestion, JSON.stringify(lone));
  ok('  the map kept where it was, and reading as its reasoning', panelsOf(lone.layout)[0].id === 'p1' && mapPanel(lone.layout).config?.lens === 'graph');
  ok('  and the model shows what was built', showsDoc(lone.layout, facts, DOC) && sound(lone.layout));
  const solid = afterBuild(singleLayout('map'), solidFacts, { doc: DOC, solids: true });
  ok('a lone map, a model with solids: map | model | its 3D view', types(solid.layout) === 'map,model,scene' && panelsOf(solid.layout)[2].config?.doc === DOC && sound(solid.layout), JSON.stringify(solid.layout));
  ok('  the build’s word on solids is enough, whatever the facts say', types(afterBuild(singleLayout('map'), facts, { doc: DOC, solids: true }).layout) === 'map,model,scene');
  const empty = afterBuild({ v: 1, root: null }, facts, b);
  ok('an empty workspace: the map beside the model', types(empty.layout) === 'map,model');
  const already = afterBuild(pairLayout({ type: 'map', config: { lens: 'graph' } }, { type: 'model' }), facts, b);
  ok('the model already on screen: nothing at all', !already.layout && !already.suggestion);
  ok('  nor when it is the model’s own 3D view that shows it', Object.keys(afterBuild(pairLayout({ type: 'map' }, { type: 'scene', config: { doc: DOC } }), facts, b)).length === 0);
  ok('  nor on a Math plotting panel, which draws it', Object.keys(afterBuild(singleLayout('map', { lens: 'plot' }), facts, b)).length === 0);
  const multi = afterBuild(pairLayout({ type: 'map' }, { type: 'inspector' }, 0.68), facts, b);
  ok('an arrangement of several: nothing moves, the suggestion line asks', !multi.layout && multi.suggestion?.id === `built:${DOC}` && multi.suggestion.arrangement === 'built', JSON.stringify(multi));
  ok('  in a word', multi.suggestion.text === 'Open the model?' && afterBuild(pairLayout({ type: 'map' }, { type: 'inspector' }), solidFacts, { doc: DOC, solids: true }).suggestion.text === 'Open the model and its 3D view?');
  const maxed = maximize(pairLayout({ type: 'map' }, { type: 'model' }), 'p1');
  const mx = afterBuild(maxed, facts, b);
  ok('a model panel set aside behind a maximised map does not show it: asked, not moved', !mx.layout && !!mx.suggestion);
  const docked = afterBuild(pairLayout({ type: 'map' }, { type: 'chat' }, 0.64), facts, b);
  ok('the conversation docked as a panel is not an arrangement: the model opens beside the map, the conversation stays', types(docked.layout) === 'map,model,chat' && Math.abs(docked.layout.root.sizes[2] - 0.36) < 1e-9 && sound(docked.layout), JSON.stringify(docked.layout));
  const pinnedOld = afterBuild(singleLayout('model', { doc: 'an-older-one' }), facts, b);
  ok('a lone model pinned to another model: asked, not moved', !pinnedOld.layout && !!pinnedOld.suggestion);
  const lonely = afterBuild(singleLayout('map'), factsFrom({ nodes: [], edges: [], models: built.workspace }), b);
  ok('a map with nothing on it yet: the model takes the stage, since the map could only draw the model again', types(lonely.layout) === 'model');
  ok('no build, no change', Object.keys(afterBuild(singleLayout('map'), facts, null)).length === 0);

  // KEYED ON THE BUILD, NEVER ON A COUNT
  let ws = EMPTY_WORKSPACE;
  const ids = [];
  const kept = [];
  for (let i = 0; i < DOC_CAP + 1; i++) {
    const r = open(ws, modelById('saddle'));
    ws = r.workspace;
    ids.push(r.doc.id);
    kept.push(ws);
  }
  const sixth = factsFrom({ ...withModel, models: kept[DOC_CAP - 1] });
  const capped = factsFrom({ ...withModel, models: ws });
  ok(`the ${DOC_CAP + 1}th model is built where only ${DOC_CAP} are kept: the count does not move`, sixth.docs.length === DOC_CAP && capped.docs.length === DOC_CAP && capped.activeDoc === ids[DOC_CAP] && !capped.docs.some((d) => d.id === ids[0]));
  const seventh = afterBuild(singleLayout('map'), capped, { doc: ids[DOC_CAP], solids: false });
  ok('  and it opens all the same', types(seventh.layout) === 'map,model' && showsDoc(seventh.layout, capped, ids[DOC_CAP]));
  // a lone model following the work already shows the newest; one pinned to the evicted first does not
  ok('  a lone model panel following the work already shows it', Object.keys(afterBuild(singleLayout('model'), capped, { doc: ids[DOC_CAP], solids: false })).length === 0);
  ok('  one pinned to an older model is asked, not moved', !!afterBuild(singleLayout('model', { doc: ids[1] }), capped, { doc: ids[DOC_CAP], solids: false }).suggestion);

  // the suggestion's arrangement exists, and is computed against the layout as it is
  const arrangement = pairLayout({ type: 'map' }, { type: 'inspector' }, 0.68);
  const withBuilt = { ...facts, built: b };
  const sg = suggestLayout(withBuilt, arrangement, 'model a saddle', new Set());
  ok('with the build in the facts, the suggestion line makes the same offer', sg?.id === `built:${DOC}` && sg.arrangement === 'built');
  const arr = arrangementsFor(withBuilt, arrangement).find((a) => a.id === sg.arrangement);
  ok('  and "Open" finds its arrangement: the model opened into the person’s arrangement, nothing of theirs closed', !!arr && types(arr.layout) === 'map,model,inspector' && showsDoc(arr.layout, facts, DOC) && sound(arr.layout), JSON.stringify(arr?.layout));
  ok('  a maximised layout comes back with it', !arrangementsFor(withBuilt, maxed).find((a) => a.id === 'built').layout.maximized);
  ok('  dismissed, it is not made again', suggestLayout(withBuilt, arrangement, '', new Set([sg.id])) === null);
  ok('  shown, it is not offered', !arrangementsFor(withBuilt, arr.layout).some((a) => a.id === 'built') && suggestLayout(withBuilt, arr.layout, '', new Set()) === null);
  ok('  a build that is not in this line of thinking is not offered', !arrangementsFor({ ...facts, built: { doc: 'gone', solids: false } }, arrangement).some((a) => a.id === 'built'));
  ok('nothing in the build rules can move a panel by itself', !/onLayout|changeLayout/.test(read('lib/workspace/surfaces.ts')));
}

console.log('\n=== any layout, any request: still a layout ===');
{
  // a deterministic walk over layouts a person could make, and every builder over each
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const kinds = ['map', 'model', 'scene', 'params', 'inspector', 'trace', 'mind', 'chat'];
  const configs = { map: [undefined, { lens: 'plot' }, { lens: 'structure' }], model: [undefined, { doc: 'elsewhere' }, { view: 'contour:z' }], scene: [undefined, { doc: DOC }, { obj: SCENE_ID }] };
  const stage = ['map', 'model', 'scene'];
  let broken = 0, lost = 0, over = 0, hidden = 0, runs = 0;
  for (let n = 0; n < 160; n++) {
    let l = singleLayout(pick(kinds));
    const steps = 1 + Math.floor(rnd() * 7);
    for (let s = 0; s < steps; s++) {
      const ps = panelsOf(l);
      const r = rnd();
      const type = pick(kinds);
      const panel = { type, config: pick(configs[type] ?? [undefined]) };
      if (r < 0.45) l = addPanel(l, panel).layout;
      else if (r < 0.75 && ps.length) l = splitPanel(l, pick(ps).id, rnd() < 0.5 ? 'row' : 'col', panel).layout;
      else if (r < 0.88 && ps.length > 1) l = closePanel(l, pick(ps).id);
      else if (ps.length) l = maximize(l, pick(ps).id);
    }
    for (const f of [facts, solidFacts, sceneFacts, bare]) {
      const want = stage.filter(() => rnd() < 0.5);
      const ask = want.length ? want : [pick(stage)];
      const outs = [
        layoutForSurfaces(ask, l, f),
        closeSurfaces(ask, l, f),
        onlySurfaces(ask, l, f),
        afterBuild(l, f, { doc: DOC, solids: rnd() < 0.5 }).layout ?? l,
        ...arrangementsFor({ ...f, built: { doc: DOC, solids: true } }, l).map((a) => a.layout),
        openView(l, pick(VIEW_CATALOGUE).id, f).layout,
        closeView(l, pick(VIEW_CATALOGUE).id),
      ];
      for (const o of outs) {
        runs++;
        if (!sound(o)) broken++;
        if (panelsOf(o).length > 8) over++;
        // nothing the person had is lost by opening: every panel of the layout before is still there
      }
      const opened = outs[0];
      if (panelsOf(l).some((p) => !findPanel(opened, p.id))) lost++;
      if (panelsOf(l).length < 8 - ask.length && !ask.every((s) => visiblePanels(opened).some((p) => p.type === s))) hidden++;
    }
  }
  console.log(`  ${runs} results checked`);
  ok(`every result is a sound layout (${runs} results)`, broken === 0, `${broken} broken`);
  ok('  never more panels than the workspace holds', over === 0, `${over}`);
  ok('  opening never closes a panel of the person’s', lost === 0, `${lost}`);
  ok('  and what was asked for is on screen, wherever there is room for it', hidden === 0, `${hidden}`);
}

console.log('\n=== the tiling primitives they use ===');
{
  const row = rowLayout([{ type: 'map' }, { type: 'model' }, { type: 'scene' }], [3, 4, 4]);
  ok('a row of three, weighted', types(row) === 'map,model,scene' && Math.abs(row.root.sizes[0] - 3 / 11) < 1e-9 && sound(row));
  ok('  a row of one is that panel; of none, an empty workspace', rowLayout([{ type: 'map' }]).root.kind === 'panel' && rowLayout([]).root === null);
  const re = reshare(pairLayout({ type: 'map' }, { type: 'chat' }, 0.7), ['p1', 'p2'], [1, 1]);
  ok('reshare redistributes siblings’ room by weight', Math.abs(re.root.sizes[0] - 0.5) < 1e-9);
  const nested = splitPanel(pairLayout({ type: 'map' }, { type: 'model' }), 'p2', 'col', { type: 'params' }).layout;
  ok('  and changes nothing for panels that are not siblings', reshare(nested, ['p1', 'p3'], [1, 1]) === nested);
  ok('visible panels: all, or the one maximised', visiblePanels(pairLayout({ type: 'map' }, { type: 'model' })).length === 2 && visiblePanels(maximize(pairLayout({ type: 'map' }, { type: 'model' }), 'p2')).map((p) => p.id).join() === 'p2');
  ok('a serving panel takes a third beside what it serves; anything else, half', besideShare('params') === 0.32 && besideShare('chat') === 0.32 && besideShare('model') === 0.5 && SERVING.has('inspector'));
  const pinned3d = rowLayout([{ type: 'map' }, { type: 'scene', config: { doc: DOC } }]);
  ok('a 3D panel pinned to a model survives storage', JSON.stringify(sanitizeLayout(JSON.parse(JSON.stringify(pinned3d)))) === JSON.stringify(pinned3d));
}

console.log('\n=== every view, by name ===');
{
  ok('the catalogue, in order', VIEW_CATALOGUE.map((v) => v.name).join(' | ') === 'Thinking Map | Math plotting | Modeling | Studio (CAD) | Parameters | Inspector | Trace | Mind | Conversation', VIEW_CATALOGUE.map((v) => v.name).join(' | '));
  ok('every kind of surface is in it', Object.keys(SURFACES).every((t) => VIEW_CATALOGUE.some((v) => v.type === t)));
  ok('Math plotting is the map’s plot lens, as a panel', VIEW_CATALOGUE.find((v) => v.id === 'plot').type === 'map' && VIEW_CATALOGUE.find((v) => v.id === 'plot').config?.lens === 'plot');
  ok('the names', VIEW_NAMES.scene === 'Studio (CAD)' && VIEW_NAMES.model === 'Modeling' && VIEW_NAMES.plot === 'Math plotting' && VIEW_NAMES.map === 'Thinking Map');
  ok('a 3D panel is titled Studio (CAD) wherever the workspace titles it here', SURFACES.scene.title === 'Studio (CAD)' && suggestViews(bare, singleLayout('map')).find((v) => v.type === 'scene').label.startsWith('Studio (CAD)'));
  ok('which kind of view a panel is', viewOf({ type: 'map' }) === 'map' && viewOf({ type: 'map', config: { lens: 'plot' } }) === 'plot' && viewOf({ type: 'map', config: { lens: 'structure' } }) === 'map' && viewOf({ type: 'scene' }) === 'scene');

  const two = pairLayout({ type: 'map' }, { type: 'model' });
  const cat = viewCatalogue(two, facts);
  const get = (c, id) => c.find((e) => e.id === id);
  ok('all of them are listed, open or not', cat.length === VIEW_CATALOGUE.length);
  ok('open ones are marked, with their panels', get(cat, 'map').isOpen && get(cat, 'map').panels.join() === 'p1' && get(cat, 'model').isOpen && get(cat, 'model').visible && !get(cat, 'scene').isOpen);
  ok('one set aside behind a maximised panel is open, not visible', (() => { const c = viewCatalogue(maximize(two, 'p1'), facts); return get(c, 'model').isOpen && !get(c, 'model').visible; })());
  ok('a view with something to show says what it is', get(cat, 'model').empty === null && get(cat, 'model').says.length > 10);
  const none = viewCatalogue(singleLayout('map'), bare);
  ok('with nothing built, Modeling says so, quietly', /no model yet/.test(get(none, 'model').empty));
  ok('  and so do Parameters, the Trace and the empty Studio', !!get(none, 'params').empty && !!get(none, 'trace').empty && /describe a shape/.test(get(none, 'scene').empty));
  ok('  and Math plotting, with nothing to plot', /nothing to plot/.test(get(none, 'plot').empty));
  ok('  and Mind, without an account', /account/.test(get(none, 'mind').empty) && get(viewCatalogue(singleLayout('map'), { ...bare, mind: true }), 'mind').empty === null);
  ok('  the map and the conversation always have something to say', get(cat, 'map').empty === null && get(none, 'chat').empty === null);
  const offered = viewCatalogue(singleLayout('map'), null, suggestViews(bare, singleLayout('map')));
  ok('without the facts, what "+ View" was offered stands in for them', /no model yet/.test(get(offered, 'model').empty) && get(viewCatalogue(singleLayout('map'), null, suggestViews(facts, singleLayout('map'))), 'model').empty === null);
  ok('  and without either, no view is said to be empty', viewCatalogue(singleLayout('map')).every((e) => e.empty === null));

  const m = openView(singleLayout('map'), 'model', bare);
  ok('a view with nothing to show still opens, onto its own empty state', types(m.layout) === 'map,model' && m.id === panelsOf(m.layout)[1].id);
  const beside = openView(singleLayout('model'), 'map', facts);
  ok('the map opened beside a model reads as its reasoning', mapPanel(beside.layout).config?.lens === 'graph' && beside.id === mapPanel(beside.layout).id);
  const modelBeside = openView(singleLayout('map'), 'model', facts);
  ok('  and so does a map a model opens beside', mapPanel(modelBeside.layout).config?.lens === 'graph');
  const plot = openView(singleLayout('model'), 'plot', facts);
  ok('Math plotting opens as the plot, and stays the plot', mapPanel(plot.layout).config?.lens === 'plot');
  const chat = openView(singleLayout('map'), 'chat', facts);
  ok('the conversation opens as a panel, at a third', types(chat.layout) === 'map,chat' && Math.abs(chat.layout.root.sizes[1] - 0.32) < 1e-9);
  const studio = openView(singleLayout('map'), 'scene', solidFacts);
  ok('Studio (CAD) opens on the model’s solids where it has some', panelsOf(studio.layout)[1].config?.doc === DOC);
  const shown = openView(maximize(two, 'p1'), 'model', facts);
  ok('an open view set aside comes back on screen', !shown.layout.maximized && shown.id === 'p2');
  ok('an open view on screen is left as it is', openView(two, 'model', facts).layout === two);
  ok('opened without the facts, plainly beside what is there', types(openView(singleLayout('map'), 'params').layout) === 'map,params');

  const many = rowLayout([{ type: 'map' }, { type: 'model' }, { type: 'model', config: { view: 'contour:z' } }, { type: 'params' }]);
  ok('× puts a view away: every panel of that kind', types(closeView(many, 'model')) === 'map,params' && sound(closeView(many, 'model')));
  ok('  Math plotting and the map are put away apart', types(closeView(rowLayout([{ type: 'map' }, { type: 'map', config: { lens: 'plot' } }]), 'plot')) === 'map');
  ok('  putting away what is not open changes nothing', closeView(two, 'trace') === two);

  const ob = openBeside(singleLayout('model'), { type: 'map' }, facts);
  ok('"+ View" opening the Thinking Map beside a model shows the map, not the model again', mapPanel(ob.layout).config?.lens === 'graph');
  ok('  a lens picked from "+ View" is kept', mapPanel(openBeside(singleLayout('model'), { type: 'map', config: { lens: 'structure' } }, facts).layout).config?.lens === 'structure');
  ok('  without the facts, opened as before', JSON.stringify(openBeside(singleLayout('model'), { type: 'map' }).layout) === JSON.stringify(addPanel(singleLayout('model'), { type: 'map' }, 1.6, 0.5).layout));
}

console.log('\n=== the menu ===');
{
  const ws = read('components/workspace/Workspace.tsx');
  ok('"+ View" lists every view, under All views', /All views/.test(ws) && /adding \? viewCatalogue\(layout, facts, facts \? null : views\)/.test(ws));
  ok('  each a real button, keyboard reachable, marked when open', /className="ws-menu-row ws-cat-main"/.test(ws) && /data-view=\{e\.id\}/.test(ws) && /e\.isOpen && <span className="ws-cat-on">Open<\/span>/.test(ws));
  ok('  an open one has a × that puts it away, labelled for a screen reader', /aria-label=\{`Remove \$\{e\.name\} from the workspace`\}/.test(ws) && /closeView\(layoutRef\.current, e\.id\)/.test(ws));
  ok('  one with nothing to show says so, a shade quieter', /e\.empty \? ' is-empty' : ''/.test(ws) && /\.ws-menu-w\.is-empty/.test(read('components/workspace/workspace.css')));
  ok('  opening goes through the same builders as the conversation', /openView\(layoutRef\.current, e\.id, facts\)/.test(ws) && /openBeside\(layoutRef\.current, v, facts\)/.test(ws));
  ok('  the suggestions stay on top, the arrangements after every view', ws.indexOf('>Open beside<') > 0 && ws.indexOf('>Open beside<') < ws.indexOf('>All views<') && ws.indexOf('>All views<') < ws.indexOf('>Arrange<'));
  ok('the host can pass what the line of thinking holds', /facts\?: WorkspaceFacts \| null;/.test(ws));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
