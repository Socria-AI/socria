// Logos 3 — the composable workspace.
//
// One canonical state, many representations, many arrangements, one human in
// control. This suite holds the parts that make that true rather than merely
// look true: the tiling never loses a panel or leaves space unaccounted for;
// a layout read back from storage can never carry model state; "+ View" only
// offers representations the state supports; a suggestion to rearrange is
// only ever a suggestion; the focus the conversation receives is described
// from canonical state; and the surface wiring keeps every edit on the
// document's own write path.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addPanel, closePanel, configurePanel, findPanel, isOpen, maximize, movePanel, normalize, panelsOf,
  presetLayout, PRESETS, replacePanel, resizeSplit, restore, sanitizeLayout, splitPanel, LIMITS,
  singleLayout, dominantPanel, pairLayout,
} from './.tmp/tiling.mjs';
import { arrangementsFor, factsFrom, suggestLayout, suggestViews, SURFACES } from './.tmp/surfaces.mjs';
import { describeFocus, focusBlock, sanitizeFocus } from './.tmp/focus.mjs';
import { open, EMPTY_WORKSPACE, setValue } from './.tmp/docs.mjs';
import { modelById } from './.tmp/library.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

/** Every split's sizes sum to one, every panel is reachable, every id is unique. */
function sound(layout) {
  const ids = new Set();
  let good = true;
  const walk = (n, depth) => {
    if (!n) return;
    if (ids.has(n.id)) good = false;
    ids.add(n.id);
    if (n.kind === 'split') {
      const sum = n.sizes.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 1e-9 || n.children.length < 2 || n.sizes.length !== n.children.length) good = false;
      if (n.sizes.some((s) => !(s > 0))) good = false;
      n.children.forEach((c) => walk(c, depth + 1));
    }
  };
  walk(layout.root, 0);
  return good;
}
const types = (l) => panelsOf(l).map((p) => p.type).join(',');

console.log('=== the tiling ===');
{
  let l = presetLayout('think', { docs: [] });
  ok('Think, with nothing built, is the map over the conversation', types(l) === 'map,chat' && l.root.dir === 'col', types(l));
  ok('  and is sound', sound(l));
  const chat = panelsOf(l).find((p) => p.type === 'chat');
  let r = splitPanel(l, chat.id, 'row', { type: 'inspector' });
  ok('splitting a panel opens a new one beside it', !!r.id && types(r.layout) === 'map,chat,inspector' && sound(r.layout), types(r.layout));
  r = splitPanel(r.layout, chat.id, 'row', { type: 'trace' });
  ok('  a second split in the same direction joins as a sibling, not a nested split', panelsOf(r.layout).length === 4 && sound(r.layout));
  l = closePanel(r.layout, chat.id);
  ok('closing gives its space to its neighbours', !findPanel(l, chat.id) && sound(l), types(l));
  const lone = closePanel(closePanel(closePanel(presetLayout('think', { docs: [] }), 'p1'), 'p2'), 'nope');
  ok('the last panel can close, leaving an empty workspace rather than an error', lone.root === null);
  ok('  and something can be opened into it', addPanel(lone, { type: 'chat' }).layout.root?.type === 'chat');

  let m = presetLayout('model', { docs: ['d1'], views: [] });
  ok('Model preset: model and conversation, parameters and inspector beside', types(m) === 'model,chat,params,inspector' && sound(m), types(m));
  const s1 = m.root;
  const before = s1.sizes[0];
  m = resizeSplit(m, s1.id, 0, 0.1);
  ok('resizing moves a divider', Math.abs(m.root.sizes[0] - (before + 0.1)) < 1e-9 && sound(m));
  m = resizeSplit(m, s1.id, 0, 5);
  ok('  and never shrinks a neighbour below the minimum', m.root.sizes[1] >= LIMITS.minFraction - 1e-9 && sound(m), JSON.stringify(m.root.sizes));
  const modelId = panelsOf(m).find((p) => p.type === 'model').id;
  const mx = maximize(m, modelId);
  ok('maximising keeps every other panel, only set aside', mx.maximized === modelId && panelsOf(mx).length === 4);
  ok('  and restoring brings the same arrangement back', restore(mx).maximized === null && JSON.stringify(restore(mx).root) === JSON.stringify(m.root));
  const chatId = panelsOf(m).find((p) => p.type === 'chat').id;
  const moved = movePanel(m, chatId, modelId, 'top');
  ok('dragging a panel onto another’s edge moves it there, keeping its identity', findPanel(moved, chatId)?.type === 'chat' && panelsOf(moved).length === 4 && sound(moved));
  const swapped = movePanel(m, chatId, modelId, 'center');
  ok('dropping on the centre swaps the two', panelsOf(swapped)[0].type === 'chat' && sound(swapped), types(swapped));
  const rep = replacePanel(m, chatId, 'trace');
  ok('replacing points a panel at another surface in place', findPanel(rep, chatId)?.type === 'trace');
  const cfg = configurePanel(m, modelId, { view: 'z:contour' });
  ok('a panel can be pointed at a representation', findPanel(cfg, modelId).config?.view === 'z:contour');
  ok('  and back', !findPanel(configurePanel(cfg, modelId, { view: undefined }), modelId).config);
  ok('isOpen reads type and config', isOpen(cfg, 'model', { view: 'z:contour' }) && !isOpen(cfg, 'model', { view: 'other' }));

  let full = presetLayout('think', { docs: [] });
  for (let i = 0; i < 20; i++) full = addPanel(full, { type: 'inspector' }).layout;
  ok('the workspace holds at most a bounded number of panels', panelsOf(full).length === LIMITS.panels && sound(full));
  ok('normalize survives junk', normalize([0, NaN, -1]).every((x) => Math.abs(x - 1 / 3) < 1e-9));
}

console.log('\n=== presets are starting points, built for what is there ===');
{
  for (const p of PRESETS) {
    const l = presetLayout(p.id, { docs: [] });
    ok(`${p.label}, with no model, opens no model panel`, !panelsOf(l).some((x) => x.type === 'model' || x.type === 'params'), types(l));
    ok(`  and is sound`, sound(l));
  }
  const cmp = presetLayout('compare', { docs: ['a', 'b'] });
  ok('Compare with two models puts them side by side', panelsOf(cmp).filter((x) => x.type === 'model').map((x) => x.config?.doc).join() === 'a,b');
  const one = presetLayout('compare', { docs: ['a'], views: [{ id: 'z:surface', primary: true }, { id: 'z:contour' }] });
  ok('Compare with one model compares two ways of looking at it', panelsOf(one).filter((x) => x.type === 'model')[1]?.config?.view === 'z:contour');
  ok('a preset is a starting point: the first change forgets which one it was', splitPanel(presetLayout('think', { docs: [] }), 'p1', 'row', { type: 'chat' }).layout.preset === null);
}

console.log('\n=== a layout from storage cannot carry anything else ===');
{
  const l = presetLayout('model', { docs: ['d1'], views: [] });
  ok('a layout survives the round trip', JSON.stringify(sanitizeLayout(JSON.parse(JSON.stringify(l)))) === JSON.stringify(l));
  const bad = { v: 1, root: { kind: 'split', id: 's1', dir: 'row', sizes: [1, -3, 'x'], children: [
    { kind: 'panel', id: 'p1', type: 'model', config: { doc: 'd1', model: { params: [] }, view: '<script>' } },
    { kind: 'panel', id: 'p2', type: 'browser' },
    { kind: 'panel', id: 'p1', type: 'chat' },
  ] }, maximized: 'p9', preset: 'chaos' };
  const s = sanitizeLayout(bad);
  ok('unknown surfaces and duplicate ids are dropped', panelsOf(s).length === 1 && panelsOf(s)[0].type === 'model', JSON.stringify(s));
  ok('  a config keeps only names — never a model, never markup', JSON.stringify(panelsOf(s)[0].config) === '{"doc":"d1"}', JSON.stringify(panelsOf(s)[0].config));
  ok('  a maximised panel that is not there is not maximised', s.maximized === null);
  ok('  and an unknown preset is no preset', s.preset === null);
  ok('not a layout at all is null', sanitizeLayout('x') === null && sanitizeLayout({ v: 2 }) === null && sanitizeLayout(null) === null);
}

// ── fixtures over the real engine ──
const withDoc = (id) => {
  const built = open(EMPTY_WORKSPACE, modelById(id));
  return { nodes: [{ id: 'n1', label: 'a model', type: 'concept' }], edges: [], context: 'math', models: built.workspace };
};
const argument = {
  context: 'deciding',
  nodes: [
    { id: 'n1', label: 'Take the Berlin offer?', type: 'decision' }, { id: 'n2', label: 'It pays more', type: 'claim' },
    { id: 'n3', label: 'money = progress', type: 'assumption' }, { id: 'n4', label: 'security ↔ growth', type: 'tension' },
    { id: 'n5', label: 'two people who left', type: 'evidence' }, { id: 'n6', label: 'Learning over title', type: 'value' },
  ],
  edges: [{ from: 'n1', to: 'n2', relation: 'supports' }, { from: 'n2', to: 'n3', relation: 'assumes' }, { from: 'n4', to: 'n1', relation: 'conflicts' }],
};

console.log('\n=== + View offers what the state supports, and nothing else ===');
{
  const think = presetLayout('think', { docs: [] });
  const a = suggestViews(factsFrom(argument), think);
  const at = a.map((v) => v.type);
  ok('an argument is offered no model, parameters or trace', !at.includes('model') && !at.includes('params') && !at.includes('trace'), at.join());
  ok('  but is offered the map’s ways of reading it', a.some((v) => v.label === 'Thinking Map · Tensions') && a.some((v) => v.label === 'Thinking Map · Evidence'), a.map((v) => v.label).join(' | '));
  ok('  each with a reason', a.every((v) => v.why.length > 8));

  const saddle = withDoc('saddle');
  const s = suggestViews(factsFrom(saddle), think);
  const labels = s.map((v) => v.label);
  ok('a surface model offers the model, first', s[0].type === 'model' && !s[0].config, labels.slice(0, 3).join(' | '));
  ok('  its level sets and cross-section, from the representation registry', labels.some((l) => /Level sets/.test(l)) && labels.some((l) => /Cross-section/.test(l)), labels.join(' | '));
  ok('  its parameters and the inspector', s.some((v) => v.type === 'params') && s.some((v) => v.type === 'inspector'));
  ok('  and no trace before anything has changed', !s.some((v) => v.type === 'trace'));
  const changed = { ...saddle, models: setValue(saddle.models, saddle.models.docs[0].id, 'a', -1).workspace };
  ok('  the trace, once something has', suggestViews(factsFrom(changed), think).some((v) => v.type === 'trace'));

  const osc = suggestViews(factsFrom(withDoc('oscillator')), think).map((v) => v.label);
  ok('a dynamic system offers its run against time and its mechanism, as the registry lists them', osc.some((l) => /Against time/.test(l)) && osc.some((l) => /· Mechanism/.test(l)), osc.join(' | '));
  ok('  and not level sets, which it does not have', !osc.some((l) => /Level sets/.test(l)));

  const m = presetLayout('model', { docs: ['x'], views: [] });
  const open1 = suggestViews(factsFrom(saddle), m);
  const firstOpen = open1.findIndex((v) => v.open);
  ok('what is already open is listed after what is not', firstOpen > 0 && open1.slice(firstOpen).every((v) => v.open));
}

console.log('\n=== Socria suggests; the person decides ===');
{
  const saddle = withDoc('saddle');
  const one = singleLayout('model');
  ok('a model on screen earns no suggestion from ordinary talk', suggestLayout(factsFrom(saddle), one, 'model a saddle', new Set()) === null);
  ok('an argument earns none from ordinary talk', suggestLayout(factsFrom(argument), singleLayout('map'), 'I keep going back and forth', new Set()) === null);
  const ev = suggestLayout(factsFrom(argument), singleLayout('map'), 'what does the research say?', new Set());
  ok('  and the evidence beside the map once research comes up', ev?.arrangement === 'evidence', JSON.stringify(ev));
  ok('  which is dismissable for good', suggestLayout(factsFrom(argument), singleLayout('map'), 'what does the research say?', new Set([ev.id])) === null);
  const two = { ...saddle, models: open(saddle.models, modelById('torus')).workspace };
  const cmp = suggestLayout(factsFrom(two), one, 'compare the saddle with the torus', new Set());
  ok('"compare" with two models suggests them side by side', cmp?.arrangement === 'compare', JSON.stringify(cmp));
  const arr = arrangementsFor(factsFrom(two), one).find((a) => a.id === cmp.arrangement);
  ok('  and the arrangement it names is two model panels, one for each', types(arr.layout) === 'model,model' && panelsOf(arr.layout).every((p) => p.config?.doc), JSON.stringify(arr?.layout));
  ok('nothing in the suggestion rules can move a panel by itself', !/onLayout|changeLayout/.test(read('lib/workspace/surfaces.ts')));
}

console.log('\n=== simple at rest, powerful on demand ===');
{
  const saddle = withDoc('saddle');
  const s1 = singleLayout('map');
  ok('the resting workspace is one surface', panelsOf(s1).length === 1 && sound(s1) && s1.preset === null);
  ok('an arrangement offers itself only when it means something: a bare question offers none',
    arrangementsFor(factsFrom({ nodes: [], edges: [] }), s1).length === 0);
  const ids = (f, l) => arrangementsFor(f, l).map((a) => a.id).join(',');
  ok('a model offers its controls, a comparison of two of its views, and the map beside it',
    /compare/.test(ids(factsFrom(saddle), singleLayout('model'))) && /controls/.test(ids(factsFrom(saddle), singleLayout('model'))), ids(factsFrom(saddle), singleLayout('model')));
  ok('  and "one view" only once there is more than one', !/one/.test(ids(factsFrom(saddle), singleLayout('model'))) && /one/.test(ids(factsFrom(saddle), pairLayout({ type: 'model' }, { type: 'params' }, 0.72))));
  const ctl = arrangementsFor(factsFrom(saddle), singleLayout('model')).find((a) => a.id === 'controls');
  ok('the controls take the smaller share; the model keeps the room', ctl.layout.root.sizes[0] > 0.6 && sound(ctl.layout));
  ok('"one view" returns to the panel with the most room', dominantPanel(pairLayout({ type: 'model' }, { type: 'params' }, 0.72))?.type === 'model');
  const side = addPanel(singleLayout('model'), { type: 'inspector' }, 1.6, 0.32).layout;
  ok('a surface that serves another opens beside it at a smaller share', Math.abs(side.root.sizes[1] - 0.32) < 1e-9 && sound(side), JSON.stringify(side.root.sizes));
  const half = splitPanel(singleLayout('map'), 'p1', 'row', { type: 'model' }).layout;
  ok('  and the default split is still even', Math.abs(half.root.sizes[0] - 0.5) < 1e-9);
  const ws = read('components/workspace/Workspace.tsx');
  ok('there is no permanent row of modes', !/presets|onPreset|ws-presets|className="ws-bar"/.test(ws));
  ok('a single panel carries no chrome', /const chrome = several \|\| isMax/.test(ws));
  ok('"+ View" holds the views and the arrangements', /Open beside/.test(ws) && /Arrange/.test(ws) && /onArrange/.test(ws));
  const app = read('components/LogosApp.tsx');
  ok('Logos 3 starts on one surface — the model if there is one, else the map', /singleLayout\(wsHasModel \? 'model' : 'map'\)/.test(app));
  ok('the conversation is a composer beneath the stage until it is asked for', /className=\{`ws-dock lg-convo/.test(app) && /dock=\{wsDock\}/.test(app));
  ok('the inspector appears for a selection, and only then', /focus && focus\.kind !== 'node'/.test(app) && /overlay=\{wsCard\}/.test(app));
  ok('the one surface follows the work, but an arrangement of several never moves', /ps\.length === 1 \? ps\[0\] : null/.test(app));
}

console.log('\n=== the focus the conversation receives ===');
{
  const saddle = withDoc('saddle');
  const doc = saddle.models.docs[0].id;
  const p = describeFocus({ kind: 'param', doc, id: 'a' }, saddle);
  ok('a parameter is described from the model: its value, range and dependants', p?.label === 'a' && /now 1\b/.test(p.lines[0]) && p.lines.some((l) => /range is -2 to 2/.test(l)) && p.lines.some((l) => /depends on it/.test(l)), JSON.stringify(p));
  const moved = { ...saddle, models: setValue(saddle.models, doc, 'a', -1.5).workspace };
  ok('  and follows the model when the model changes', /now -1\.5/.test(describeFocus({ kind: 'param', doc, id: 'a' }, moved)?.lines[0]));
  const o = describeFocus({ kind: 'object', doc, id: 'z' }, saddle);
  ok('an object is described by the model’s own inspector', !!o && o.kind === 'object' && o.lines.length > 2, JSON.stringify(o));
  const n = describeFocus({ kind: 'node', id: 'n4' }, argument);
  ok('an idea on the map, with what it connects to', n?.label === 'security ↔ growth' && /tension/.test(n.lines[0]) && /connected/.test(n.lines[1]), JSON.stringify(n));
  ok('a focus on something that no longer exists is nothing', describeFocus({ kind: 'param', doc, id: 'gone' }, saddle) === null && describeFocus({ kind: 'node', id: 'zz' }, argument) === null);
  const block = focusBlock(sanitizeFocus(p));
  ok('the reply is told what "this" means, by name', /WHAT THEY HAVE SELECTED IN THE WORKSPACE: "a"/.test(block) && /When they say "this"/.test(block));
  ok('a brief from a browser is cleaned and bounded', sanitizeFocus({ kind: 'param', label: 'x'.repeat(500), lines: Array(40).fill('y'.repeat(900)) }).lines.length === 12 && sanitizeFocus({ kind: 'evil', label: 'x' }) === null);
  ok('no focus, no block', focusBlock(null) === '');
}

console.log('\n=== the contract ===');
{
  for (const t of ['chat', 'map', 'model', 'params', 'inspector', 'trace']) ok(`${t} declares what it is`, !!SURFACES[t] && SURFACES[t].type === t);
  ok('the conversation follows every kind of selection', SURFACES.chat.responds.length === 4);
  ok('a model can be shown twice, the conversation cannot', SURFACES.model.duplicable && !SURFACES.chat.duplicable);
}

console.log('\n=== the wiring ===');
{
  const app = read('components/LogosApp.tsx');
  const prompt = read('lib/socria-prompt.ts');
  ok('Logos 3 is the workspace', /workspace: true/.test(prompt.slice(prompt.indexOf("'logos-3': {"), prompt.indexOf("'logos-3': {") + 1200)));
  ok('Logos 2 keeps its two columns, exactly as before', /\{mapBody\(\{ primary: true \}\)\}/.test(app) && /\{convoHead\}\s*\{convoBody\}/.test(app));
  ok('every model edit — map, model panel, parameters — goes through one write path', (app.match(/onModel=\{stableModelEdited\}/g) || []).length >= 2 && /onModelEdited=\{stableModelEdited\}/.test(app) && /adopt\(ws, docId, m, Date\.now\(\)\)/.test(app));
  ok('undo and redo are the document’s own verbs', /undoDoc\(ws, docId\)/.test(app) && /redoDoc\(ws, docId\)/.test(app) && /restoreDoc\(ws, docId, op\)/.test(app));
  ok('the layout is kept in this browser, never in the session', /const WS_KEY = 'socria\.logos3\.workspace\.v2'/.test(app) && /localStorage\.setItem\(WS_KEY/.test(app) && !/workspace: wsLayout|layout: wsLayout,\s*\}/.test(app));
  ok('a layout change never touches a model', !/patchActive\([^)]*wsLayout/.test(app));
  ok('the turn carries the focus, described from canonical state', /describeFocus\(focusRef\.current, mapRef\.current\)/.test(app));
  ok('the chat route reads it, cleaned', /focusBlock\(sanitizeFocus\(body\?\.focus\)\)/.test(read('app/api/logos/chat/route.ts')));
  ok('only the first model panel takes the reply’s ops and reports the picture', /onRead=\{primary \? takeViz : undefined\}/.test(app) && /ops=\{primary \? vizOps : null\}/.test(app));
  ok('the workspace hooks sit above the access gate', app.indexOf('const [wsLayout, setWsLayout]') < app.indexOf('if (!hasAccess) {'));
  const ws = read('components/workspace/Workspace.tsx');
  ok('Escape restores a maximised panel', /e\.key === 'Escape'/.test(ws) && /restore\(layoutRef\.current\)/.test(ws));
  ok('dividers can be moved from the keyboard', /aria-orientation/.test(ws) && /ArrowLeft/.test(ws));
  ok('a narrow screen shows one surface at a time, as tabs', /is-narrow/.test(ws) && /role="tablist"/.test(ws));
}

console.log('\n=== reset view ===');
{
  const ws = read('components/workspace/Workspace.tsx');
  const app = read('components/LogosApp.tsx');
  ok('"+ View" offers Reset view, and asks first', /Reset view/.test(ws) && /Are you sure\?/.test(ws) && /setConfirming\(true\)/.test(ws) && />\s*Cancel\s*</.test(ws));
  ok('it resets the arrangement, the dock and the maps — and nothing else', /function resetView\(\)/.test(app) && /changeLayout\(singleLayout\(wsHasModel \? 'model' : 'map'\)\)/.test(app) && /moveDock\('bottom'\)/.test(app) && /dispatchEvent\(new Event\(VIEW_RESET\)\)/.test(app));
  const body = app.slice(app.indexOf('function resetView()'), app.indexOf('function resetView()') + 900);
  ok('  never the thinking: no message, map or model is written', !/patchActive|patchSession|editMap|setSessions/.test(body));
  ok('every map puts its tabs and zoom back', /addEventListener\(VIEW_RESET/.test(read('components/ThinkingMap.tsx')) && /setTabsAt\('top'\)/.test(read('components/ThinkingMap.tsx')) && /setZoom\(1\)/.test(read('components/ThinkingMap.tsx')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
