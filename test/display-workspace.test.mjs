// A DISPLAY IN THE WORKSPACE — where a plan or a table is worked in.
//
// The Logos 3 workspace (lib/workspace/) holds one canonical state and lays
// out panels that represent it. A display is an object of thought with a
// panel of its own: offered in "+ View" when there is one, listed in the
// catalogue always (with what to say when there is none), opened beside the
// map when a turn makes one, never re-pointing a panel the person pinned, and
// named in the conversation's interface reader ("open the display").

import { factsFrom, suggestViews, afterDisplay, viewCatalogue, panelFor, VIEW_CATALOGUE, layoutForRequest } from './.tmp/surfaces.mjs';
import { singleLayout, panelsOf, sanitizeLayout, visiblePanels, addPanel, configurePanel } from './.tmp/tiling.mjs';
import { readInterfaceRequest } from './.tmp/interface-request.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const plan = (id, title) => ({
  id,
  kind: 'plan',
  name: id,
  origin: 'socria',
  states: [{ title, view: 'checklist', items: [{ id: 'i1', text: 'Pack', by: 'socria' }], links: [] }],
  steps: [],
  at: 0,
});
const map = (...objs) => ({ nodes: [{ id: 'a', label: 'Moving house', type: 'concept' }], edges: [], objects: { objs } });

console.log('=== what the workspace knows ===');
{
  const f = factsFrom(map(plan('P1', 'Moving checklist')));
  ok('a display is in the facts, by its noun and title', f.displays?.length === 1 && f.displays[0].noun === 'plan' && f.displays[0].title === 'Moving checklist', JSON.stringify(f.displays));
  ok('a matrix is not a display', factsFrom(map({ id: 'A', kind: 'matrix', name: 'A', origin: 'person', states: [{ rows: [['1']] }], steps: [], at: 0 })).displays.length === 0);
}

console.log('\n=== + View ===');
{
  const f = factsFrom(map(plan('P1', 'Moving checklist'), plan('P2', 'Budget')));
  const v = suggestViews(f, singleLayout('map')).filter((x) => x.type === 'display');
  ok('every display is offered, pinned to itself', v.length === 2 && v.map((x) => x.config.obj).join() === 'P1,P2');
  ok('  named by kind and title, with why', v[0].label === 'Plan · Moving checklist' && /change it by hand or in words/.test(v[0].why));
  ok('the catalogue lists displays always', VIEW_CATALOGUE.some((c) => c.id === 'display' && c.name === 'Displays'));
  const none = viewCatalogue(singleLayout('map'), factsFrom(map())).find((c) => c.id === 'display');
  ok('  and with none yet, says how to make one', /ask for a plan, a table or a checklist/.test(none.empty ?? ''));
  const some = viewCatalogue(singleLayout('map'), f).find((c) => c.id === 'display');
  ok('  with one, opens on the newest', some.empty === null && some.panel.config?.obj === 'P2');
  ok('panelFor a display without a name: the newest', panelFor('display', f).config?.obj === 'P2');
}

console.log('\n=== a display the turn made opens beside the map ===');
{
  const f = factsFrom(map(plan('P1', 'Moving checklist')));
  const next = afterDisplay(singleLayout('map'), f, 'P1');
  const ps = next ? panelsOf(next) : [];
  ok('resting on the map: map | display', ps.map((p) => p.type).join(',') === 'map,display' && ps[1].config?.obj === 'P1', JSON.stringify(ps));
  ok('  already showing it: nothing moves', afterDisplay(next, f, 'P1') === null);
  const model = addPanel(singleLayout('map'), { type: 'model' }, 1.6, 0.5).layout;
  const beside = afterDisplay(model, f, 'P1');
  ok('beside an arrangement of the person’s own, it is added, nothing closed', panelsOf(beside).map((p) => p.type).sort().join(',') === 'display,map,model');
  const two = factsFrom(map(plan('P1', 'Moving checklist'), plan('P2', 'Budget')));
  const pinned = addPanel(singleLayout('map'), { type: 'display', config: { obj: 'P1' } }, 1.6, 0.5).layout;
  const after = afterDisplay(pinned, two, 'P2');
  ok('a panel pinned to another display is left pinned; the new one opens beside', panelsOf(after).filter((p) => p.type === 'display').map((p) => p.config?.obj).sort().join() === 'P1,P2');
  const unpinned = addPanel(singleLayout('map'), { type: 'display' }, 1.6, 0.5).layout;
  ok('an unpinned display panel already follows the newest', afterDisplay(unpinned, two, 'P2') === null);
}

console.log('\n=== saved, and asked for by name ===');
{
  const saved = sanitizeLayout(JSON.parse(JSON.stringify(addPanel(singleLayout('map'), { type: 'display', config: { obj: 'P1' } }, 1.6, 0.5).layout)));
  ok('a layout with a display panel survives being saved and reopened', !!saved && panelsOf(saved).some((p) => p.type === 'display' && p.config?.obj === 'P1'));
  const req = readInterfaceRequest('open the display');
  ok('"open the display" opens it', req?.op === 'open' && req.surfaces.join() === 'display', JSON.stringify(req));
  const f = factsFrom(map(plan('P1', 'Moving checklist')));
  const laid = layoutForRequest(req, singleLayout('map'), f);
  ok('  beside the map, on the display there is', visiblePanels(laid).some((p) => p.type === 'display' && p.config?.obj === 'P1'));
  const closed = layoutForRequest(readInterfaceRequest('close everything'), laid, f);
  ok('"close everything" puts it away with the rest', !panelsOf(closed).some((p) => p.type === 'display'));
  ok('re-pointing a display panel is configuring it', panelsOf(configurePanel(laid, panelsOf(laid).find((p) => p.type === 'display').id, { obj: 'P9' })).some((p) => p.config?.obj === 'P9'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
