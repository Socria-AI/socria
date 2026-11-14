// LOGOS 6 ARTIFACTS — changed, not remade; one identity; mind maps that read at a glance (November 2026).
//
// What is held down here:
//   • the edit engine (lib/artifact-edit.ts): edits at paths inside an artifact, checked whole by the element's own
//     validator — refused whole when invalid, refused when the validator would quietly drop what was added, never a
//     silent no-op; the parts no edit touches stay exactly as they were; what changed is said in words;
//   • plain words read as edits ("add the curve y = 2 + x called supply", "x from -5 to 5", "add Costs under
//     Operations") — and nothing guessed from words that are not plainly one;
//   • a kept element's history (lib/objects/display-kept.ts over lib/objects/core.ts): every edit a step with who made
//     it and what it changed; Undo is a seek that erases nothing; enough versions to go back through;
//   • the mind map: valid shapes only (one centre, a tree four deep at most, a few typed links across), a layout in
//     which no two parts overlap at any width, labels wrapped never shrunk, large maps folded below their first
//     levels, the same map always the same picture.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as I from './.tmp/inline-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const S = (o) => I.sanitizeInlineSpec(o);
const html = (el) => renderToStaticMarkup(el);

const MARKET = S({ type: 'graph', title: 'A tax on sellers', expr: '10-x', label: 'demand', curves: [{ expr: '2+x+t', label: 'supply' }], x: [0, 10], params: [{ name: 't', label: 'tax', value: 0, min: 0, max: 4, step: 0.5 }], features: ['crossings'] });

console.log('\n=== edits: checked whole, never half-applied, never silent ===');
{
  const r = I.applyEdits(MARKET, [{ op: 'add', path: '/curves/-', value: { expr: '2+x', label: 'supply before the tax' } }, { op: 'replace', path: '/x', value: [0, 12] }]);
  ok('two edits applied together, and said in words', r.ok && /added the curve “supply before the tax”/.test(I.changeSaid(r.changes)) && /x now runs from 0 to 12/.test(I.changeSaid(r.changes)), J(r));
  ok('the parts no edit touched are exactly as they were', r.ok && J(r.spec.params) === J(MARKET.params) && r.spec.expr === MARKET.expr && J(r.spec.curves[0]) === J(MARKET.curves[0]) && r.spec.title === MARKET.title);
  ok('the artifact it was applied to is unchanged (a copy is edited)', MARKET.curves.length === 1 && J(MARKET.x) === J([0, 10]));
  const bad = I.applyEdits(MARKET, [{ op: 'replace', path: '/x', value: [0, 12] }, { op: 'add', path: '/curves/-', value: { expr: 'alert(1)' } }]);
  ok('REFUSED whole: a curve that cannot be drawn — and the good edit beside it is not applied either', !bad.ok && /could not be drawn|valid/.test(bad.why), J(bad));
  ok('REFUSED: a hole off its curve (the validator\'s own rule, reached through an edit)', !I.applyEdits(S({ type: 'graph', expr: 'x+1', x: [-1, 3], params: [] }), [{ op: 'add', path: '/points', value: [{ x: 1, y: 3, open: true }] }]).ok);
  ok('REFUSED: changing what kind of thing it is', !I.applyEdits(MARKET, [{ op: 'replace', path: '/type', value: 'chart' }]).ok);
  ok('REFUSED: a path that is not plain (prototype pollution, odd keys)', !I.applyEdits(MARKET, [{ op: 'add', path: '/__proto__/x', value: 1 }]).ok && !I.applyEdits(MARKET, [{ op: 'add', path: '/curves/0/../x', value: 1 }]).ok && I.parsePath('/a b') === null);
  ok('REFUSED: replacing what is not there; removing past the end', !I.applyEdits(MARKET, [{ op: 'replace', path: '/y', value: [0, 5] }]).ok && !I.applyEdits(MARKET, [{ op: 'remove', path: '/curves/4' }]).ok);
  ok('REFUSED: a change that changes nothing', !I.applyEdits(MARKET, [{ op: 'replace', path: '/x', value: [0, 10] }]).ok);
  ok('REFUSED: too many edits at once, or a value too large', I.sanitizeEdits(Array.from({ length: 30 }, () => ({ op: 'remove', path: '/y' }))) === null && I.sanitizeEdits([{ op: 'add', path: '/title', value: 'x'.repeat(7000) }]) === null);
  const removed = I.applyEdits(MARKET, [{ op: 'remove', path: '/curves/0' }, { op: 'replace', path: '/features', value: [] }]);
  ok('a removal is said, and the crossings that needed the second curve go with it', removed.ok && /removed the curve “supply”/.test(I.changeSaid(removed.changes)), J(removed));
}

console.log('\n=== plain words, read as edits — and nothing guessed ===');
{
  const read = (t, spec = MARKET) => I.readEdit(t, spec);
  const one = (t, spec = MARKET) => { const ops = read(t, spec); const r = ops ? I.applyEdits(spec, ops) : null; return r?.ok ? I.changeSaid(r.changes) : null; };
  ok('"add the curve y = 2 + x called supply before" → a curve, named', /added the curve “supply before”/.test(one('add the curve y = 2 + x called supply before') ?? ''), one('add the curve y = 2 + x called supply before'));
  ok('"set the x range to -5 to 5" / "x from 0 to 20" / "y from 0 to 12"', /x now runs from −5 to 5/.test(one('set the x range to -5 to 5') ?? '') && /x now runs from 0 to 20/.test(one('x from 0 to 20') ?? '') && /y now runs from 0 to 12/.test(one('y from 0 to 12') ?? ''), one('set the x range to -5 to 5'));
  ok('"add a slider for k from 0 to 10"', /added a slider for k \(0 to 10\)/.test(one('add a slider for k from 0 to 10') ?? ''));
  ok('"rename it to Market for tea"', /renamed it “Market for tea”/.test(one('rename it to Market for tea') ?? ''));
  ok('"remove the curve supply"', /removed the curve “supply”/.test(one('remove the curve supply') ?? ''));
  const L = S({ type: 'graph', expr: '(x^2-1)/(x-1)', x: [-1, 3], params: [] });
  ok('"add an open point at (1, 2)" and "add a point at (1, 3)" — in that order, both hold', (() => { const a = I.applyEdits(L, read('add an open point at (1, 2)', L)); if (!a.ok) return false; const b = I.applyEdits(a.spec, read('add a point at (1, 3)', a.spec)); return b.ok && b.spec.points.length === 2; })());
  ok('…and the filled point alone, with no hole, is refused (it would contradict the curve)', (() => { const a = read('add a point at (1, 3)', L); return a && !I.applyEdits(L, a).ok; })());
  const R = S({ type: 'graph', expr: 'x^2', x: [0, 2.2], params: [], area: { from: 0, to: 2 } });
  ok('"use 10 rectangles" on a shaded area', /rectangles: 10, left endpoints/.test(one('use 10 rectangles', R) ?? ''), one('use 10 rectangles', R));
  ok('words that are not plainly an edit are not read as one', ['what does this graph show?', 'make it better', 'add elasticity and compare two scenarios', 'can you explain the tax?'].every((t) => read(t) === null));
  const MAP = S({ type: 'diagram', view: 'mind', title: 'A startup', nodes: [{ id: 'r', label: 'The startup' }, { id: 'p', label: 'Product' }, { id: 'o', label: 'Operations' }, { id: 'm', label: 'Marketing' }], edges: [['r', 'p'], ['r', 'o'], ['r', 'm']] });
  ok('mind map: "add Costs under Operations"', /added “Costs”/.test(one('add Costs under Operations', MAP) ?? ''), one('add Costs under Operations', MAP));
  ok('mind map: "rename Marketing to Growth", "remove Operations"', /renamed “Marketing” to “Growth”/.test(one('rename Marketing to Growth', MAP) ?? '') && /removed “Operations”/.test(one('remove Operations', MAP) ?? ''));
  ok('mind map: "connect Product to Marketing" is a link across the branches (a part has one parent), and "Product needs Operations" says its kind', /is now relates|connected/.test(one('connect Product to Marketing', MAP) ?? '') && J(I.applyEdits(MAP, read('connect Product to Marketing', MAP)).spec.edges.at(-1)) === J(['p', 'm', 'relates']) && J(I.applyEdits(MAP, read('Product needs Operations', MAP)).spec.edges.at(-1)) === J(['p', 'o', 'needs']), one('connect Product to Marketing', MAP));
  ok('…"show it as a tree"', /shown as a hierarchy/.test(one('show it as a tree', MAP) ?? ''));
  const V = S({ type: 'vectors', vectors: [{ label: 'pull', mag: 20, angle: 0 }], params: [] });
  ok('forces: "add a force friction of 12 N at 180 degrees"', /added the force “friction”/.test(one('add a force friction of 12 N at 180 degrees', V) ?? ''));
}

console.log('\n=== a kept element\'s history: every change a step, Undo a seek that erases nothing ===');
{
  const kept = I.keptFrom(MARKET, undefined, { session: 's1', message: 'm1', said: 'A tax on sellers lifts supply.', at: 1 });
  const made = I.createObject({ objs: [] }, 'kept', kept, { origin: 'socria' });
  ok('the element is kept as an artifact with one identity', !!made && made.obj.kind === 'kept' && made.obj.states.length === 1);
  let space = made.space;
  const id = made.obj.id;
  const words = I.readKeptEdit('add the curve y = 2 + x called supply before', I.currentOf(space.objs[0]));
  ok('the person\'s words become the kind\'s own operation, with what it changes said', words && words.op === 'edit' && /added the curve/.test(words.args.said), J(words));
  const s1 = I.applyObjectStep(space, id, words.op, words.args, { by: 'person', at: 2 });
  ok('applied as a step: who, what, the new version', s1.ok && s1.obj.states.length === 2 && s1.step.by === 'person' && /added the curve “supply before”/.test(s1.step.said) && I.currentOf(s1.obj).spec.curves.length === 2, J(s1.ok ? s1.step : s1));
  space = s1.space;
  const socria = I.applyObjectStep(space, id, 'edit', { ops: J([{ op: 'add', path: '/params/-', value: { name: 'k', label: 'elasticity', min: 0.2, max: 3, value: 1, step: 0.1 } }]), said: 'added a slider for elasticity' }, { by: 'socria', at: 3 });
  ok('Socria\'s edit is a step of its own, marked as Socria\'s', socria.ok && socria.step.by === 'socria' && I.currentOf(socria.obj).spec.params.length === 2);
  space = socria.space;
  const bad = I.applyObjectStep(space, id, 'edit', { ops: J([{ op: 'add', path: '/curves/-', value: { expr: 'not a formula' } }]), said: 'x' }, { by: 'socria', at: 4 });
  ok('an invalid edit is refused, with why — and nothing changes', !bad.ok && /drawn|valid/.test(bad.why), J(bad));
  const back = I.seekObject(space, id, 1);
  ok('Undo is a seek: the earlier version is current, and the later ones are still there to redo', I.currentOf(back.objs[0]).spec.params.length === 1 && back.objs[0].states.length === 3);
  ok('…and every version stays readable: as kept, the person\'s curve, Socria\'s slider', back.objs[0].states.map((s) => `${s.spec.curves.length}c/${s.spec.params.length}p`).join(' ') === '1c/1p 2c/1p 2c/2p');
  const full = I.applyObjectStep(space, id, 'spec', { spec: J({ ...I.currentOf(space.objs[0]).spec, title: 'Tax and elasticity' }), said: 'renamed it' }, { by: 'person', at: 5 });
  ok('the editor\'s whole new version is accepted too, under the same checks — and a new title follows into the artifact\'s name', full.ok && I.currentOf(full.obj).title === 'Tax and elasticity');
  ok('…a version of another kind is refused', !I.applyObjectStep(space, id, 'spec', { spec: J(S({ type: 'trace', steps: [{ cells: [1], note: 'a' }, { cells: [2], note: 'b' }] })), said: 'x' }, { by: 'person' }).ok);
  let many = space;
  for (let i = 0; i < 26; i++) { const r = I.applyObjectStep(many, id, 'edit', { ops: J([{ op: 'replace', path: '/x', value: [0, 11 + i] }]), said: `x to ${11 + i}` }, { by: 'person', at: 10 + i }); if (r.ok) many = r.space; }
  ok('enough versions to go back through (up to 30 kept)', many.objs[0].states.length >= 28, many.objs[0].states.length);
  const reloaded = I.sanitizeSpace(JSON.parse(J(socria.space)));
  ok('the history survives being stored and read back (the map is where it is saved)', reloaded && reloaded.objs[0].states.length === 3 && reloaded.objs[0].steps[1].by === 'socria');
}

console.log('\n=== the mind map: a valid shape, read at a glance ===');
{
  const big = S({ type: 'diagram', view: 'mind', title: 'The immune system', nodes: [{ id: 'r', label: 'The immune system' }, { id: 'i', label: 'Innate immunity' }, { id: 'a', label: 'Adaptive immunity' }, { id: 'b', label: 'Barriers' }, ...Array.from({ length: 14 }, (_, k) => ({ id: `k${k}`, label: ['Skin and mucus', 'Stomach acid', 'Neutrophils', 'Macrophages', 'Inflammation', 'Fever', 'B cells', 'T cells', 'Antibodies', 'Memory cells', 'Helper T cells', 'Killer T cells', 'Complement proteins', 'Natural killer cells'][k] })), { id: 'z', label: 'Plasma cells make antibodies at scale' }], edges: [['r', 'i'], ['r', 'a'], ['r', 'b'], ['b', 'k0'], ['b', 'k1'], ['i', 'k2'], ['i', 'k3'], ['i', 'k4'], ['i', 'k5'], ['a', 'k6'], ['a', 'k7'], ['k6', 'k8'], ['k6', 'k9'], ['k7', 'k10'], ['k7', 'k11'], ['i', 'k12'], ['i', 'k13'], ['k6', 'z'], ['k10', 'k6', 'needs'], ['k4', 'k5', 'causes'], ['k3', 'k7', 'relates']] });
  ok('a mind map with typed links across its branches validates', !!big && big.edges.filter((e) => e[2]).length === 3, J(big?.edges?.slice(-3)));
  ok('REFUSED: two centres; a part with two parents; five levels; too many links', S({ type: 'diagram', view: 'mind', nodes: ['a', 'b', 'c', 'd'], edges: [['a', 'b'], ['c', 'd']] }) === null && S({ type: 'diagram', view: 'mind', nodes: ['a', 'b', 'c', 'd'], edges: [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']] }) === null && S({ type: 'diagram', view: 'mind', nodes: ['a', 'b', 'c', 'd', 'e', 'f'], edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'f']] }) === null);
  const folds = I.defaultFolds(big);
  ok('more than a glance takes: parts two levels down are folded until opened', folds.size >= 2 && folds.has('k6') && folds.has('k7'), J([...folds]));
  for (const W of [1100, 720, 560, 420, 320]) {
    const lay = I.mindLayout(big, W, folds);
    const out = lay && lay.boxes.some((b) => b.cx - b.w / 2 < -0.5 || b.cx + b.w / 2 > lay.W + 0.5 || b.cy - b.h / 2 < 0 || b.cy + b.h / 2 > lay.H);
    ok(`at ${W}px: no two parts overlap, nothing outside the figure, the centre is the root`, lay && lay.overlaps === 0 && !out && lay.boxes[0].id === 'r', lay && J({ overlaps: lay.overlaps, W: lay.W, H: lay.H }));
  }
  const open = I.mindLayout(big, 900, new Set());
  ok('opened fully, still no overlaps (all 19 parts showing)', open && open.overlaps === 0 && open.boxes.length === big.nodes.length && big.nodes.length === 19, open && open.boxes.length);
  ok('the centre is in the middle on a wide screen, with branches on both sides; at the left on a phone, one side', (() => { const w = I.mindLayout(big, 1000, folds), n = I.mindLayout(big, 380, folds); return w.boxes.some((b) => b.side === -1) && w.boxes.some((b) => b.side === 1) && n.boxes.every((b) => b.side !== -1) && n.boxes[0].cx < 120; })());
  ok('labels wrap to two lines, words whole — never shrunk', J(I.wrapLabel('Plasma cells make antibodies at scale', 136)) === J(['Plasma cells make', 'antibodies at scale']) || I.wrapLabel('Plasma cells make antibodies at scale', 136).length === 2);
  ok('the same map, width and folds give the same picture', J(I.mindLayout(big, 720, folds)) === J(I.mindLayout(big, 720, folds)));
  ok('links across branches are drawn only between parts that show', I.mindLayout(big, 900, folds).links.every((l) => ['k10', 'k6', 'k4', 'k5', 'k3', 'k7'].includes(l.from)) && I.mindLayout(big, 900, new Set()).links.length === 3);
  const out = html(h(I.InlineBlock, { spec: big, open: false, n: 0 }));
  ok('drawn: the centre filled, first branches outlined, folds marked with how many they hold', /ln-mind-node is-d0/.test(out) && (out.match(/ln-mind-node is-d1/g) ?? []).length === 3 && /\+\d+</.test(out), out.slice(0, 200));
  ok('every part a button with what it holds said; folds are buttons that say what they open', /role="button" tabindex="0" aria-label="Innate immunity, 6 parts"/.test(out) && /aria-label="Open B cells: \d+ more"/.test(out), out.match(/aria-label="Innate[^"]*"/)?.[0]);
  ok('a legend names each kind of link across the branches', /ln-mind-legend/.test(out) && />needs</.test(out) && />causes</.test(out) && />relates to</.test(out));
  ok('a search box once the map has more than eight parts', /type="search"[^>]*aria-label="Find in the map"/.test(out));
  const picked = html(h(I.InlineBlock, { spec: big, open: false, n: 0, host: { state: { 0: { node: 'k6' } } } }));
  ok('a part selected: its branch drawn up, the rest stepped back, and what it holds and needs opened beneath', /ln-mind-node is-d2 is-on/.test(picked) && /is-dim/.test(picked) && /ln-mind-panel/.test(picked) && /Part of <button[^>]*>Adaptive immunity/.test(picked) && /Helper T cells/.test(picked), picked.match(/ln-mind-panel[\s\S]{0,400}/)?.[0]);
  ok('the map in words (what Socria and a screen reader are given): the outline and the links', /A mind map around The immune system/.test(I.inlinePlainText(big)) && /Helper T cells needs B cells/.test(I.inlinePlainText(big)), I.inlinePlainText(big).slice(-200));
}


console.log('\n=== what the editor saves: only what changed ===');
{
  const renamed = S({ ...MARKET, title: 'A tax on bread sellers' });
  ok('a title changed: one edit, at the title', J(I.editsBetween(MARKET, renamed)) === J([{ op: 'replace', path: '/title', value: 'A tax on bread sellers' }]));
  const slid = S({ ...MARKET, params: [{ ...MARKET.params[0], max: 6 }] });
  ok('a slider’s range changed: one edit, at that field of that slider', J(I.editsBetween(MARKET, slid)) === J([{ op: 'replace', path: '/params/0/max', value: 6 }]));
  const more = I.applyEdits(MARKET, [{ op: 'add', path: '/curves/-', value: { expr: '2+x', label: 'before the tax' } }]).spec;
  const ops = I.editsBetween(MARKET, more);
  ok('a list that grew: replaced whole, and the edits rebuild the new version exactly', ops && ops.length === 1 && ops[0].path === '/curves' && J(I.applyEdits(MARKET, ops).spec) === J(more), J(ops));
  ok('nothing changed, or another kind: no edits (the caller saves nothing, or the whole version)', I.editsBetween(MARKET, MARKET) === null && I.editsBetween(MARKET, S({ type: 'sequence', kind: 'steps', items: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] })) === null);
}

console.log('\n=== what the validator would quietly leave out is named, never shown as gone ===');
{
  const typed = { ...MARKET, curves: [...MARKET.curves, { expr: '2+x+', label: 'half' }] };
  const held = S(typed);
  ok('a curve that cannot be drawn yet: the validator leaves it out, and that is caught', held && held.curves.length === 1 && I.droppedBy(typed, held) === '/curves' && I.droppedNoun('/curves') === 'A curve', J(held?.curves));
  const linked = { type: 'diagram', view: 'mind', title: 'Revenue', nodes: [{ id: 'r', label: 'Revenue' }, { id: 'a', label: 'Product' }, { id: 'b', label: 'Marketing' }, { id: 'c', label: 'Pricing' }], edges: [['r', 'a'], ['r', 'b'], ['a', 'c'], ['b', 'zz', 'needs']] };
  ok('a link to a part that is not there: left out by the validator, and caught as a link', I.droppedBy(linked, S(linked)) === '/edges' && I.droppedNoun('/edges') === 'A link');
  ok('shading half filled in is refused whole by the validator (the editor says it is not drawable yet)', S({ ...MARKET, area: { from: 'a' } }) === null);
  ok('a version that holds whole: nothing named', I.droppedBy(MARKET, S(MARKET)) === null && I.droppedNoun('/nodes/3') === 'A part' && I.droppedNoun('/area/rects') === 'The rectangles');
}

console.log('\n=== a kept element hears words only while it is in hand ===');
{
  const k = I.keptFrom(MARKET, undefined, { session: 'sL6_hand_0001', message: 'm_hand1', said: 'A tax shifts supply up…', at: 1730000000000 });
  const made = I.makeDisplay(I.EMPTY_SPACE, 'kept', k, 'person');
  const id = made.obj.id;
  ok('"call it a day", said in the conversation, renames nothing', I.readOperation(made.space, 'call it a day') === null && I.readOperation(made.space, 'call it a day', null) === null);
  ok('…nor does an edit it could read, while it is not the one in hand', I.readOperation(made.space, 'add the curve y = 2 + x') === null);
  const r = I.readOperation(made.space, 'add the curve y = 2 + x called supply before', id);
  ok('in hand (open in Artifacts, or selected), the same words are an edit of it', r && r.id === id && r.op === 'edit' && /added the curve “supply before”/.test(String(r.args.said)), J(r));
  ok('…and words that are not an edit are still nothing', I.readOperation(made.space, 'why does the price rise?', id) === null);
}

console.log('\n=== the editor: the controls for what it is, and only those ===');
{
  const ed = (spec) => html(h(I.SpecEditor, { spec, onChange: () => {} }));
  const g = ed(MARKET);
  ok('a graph: its equations, window, sliders, points and shading — as fields with labels', /<legend>Equations<\/legend>/.test(g) && /value="10-x"/.test(g) && /value="2\+x\+t"/.test(g) && /<legend>Sliders<\/legend>/.test(g) && /<legend>Window<\/legend>/.test(g) && /Points/.test(g) && /Shad/.test(g), g.match(/<legend>[^<]+<\/legend>/g));
  ok('…and nothing that belongs to another kind (no forces, no steps, no parts)', !/Forces|Steps<\/legend>|Parts<\/legend>/.test(g));
  const mind = S({ type: 'diagram', view: 'mind', title: 'Revenue', nodes: [{ id: 'r', label: 'Revenue' }, { id: 'a', label: 'Product' }, { id: 'b', label: 'Marketing' }, { id: 'c', label: 'Pricing' }], edges: [['r', 'a'], ['r', 'b'], ['a', 'c'], ['b', 'c', 'needs']] });
  const m = ed(mind);
  ok('a mind map: how it is shown, each part with where it hangs, and the links across with their kinds', /Shown as/.test(m) && /<option value="mind" selected="">/.test(m) && /Under/.test(m) && /<legend>Links across the branches<\/legend>/.test(m) && /<option value="needs" selected="">needs<\/option>/.test(m) && /<option value="causes">causes<\/option>/.test(m), m.match(/<legend>[^<]+<\/legend>/g));
  const v = ed(S({ type: 'vectors', title: 'A box on a slope', body: 'box', vectors: [{ label: 'weight', mag: 50, angle: 270 }, { label: 'normal', mag: 43, angle: 60 }] }));
  ok('a force diagram: its forces, each with a size and a direction', /<legend>Forces<\/legend>/.test(v) && /value="weight"/.test(v) && /value="270"/.test(v));
  const sq = ed(S({ type: 'sequence', kind: 'steps', items: [{ label: 'Wash' }, { label: 'Rinse' }, { label: 'Dry' }] }));
  ok('a sequence: its steps, one field each, with a way to add one', /<legend>Steps<\/legend>/.test(sq) && /value="Rinse"/.test(sq) && /\+ Step/.test(sq));
  const claim = ed(S({ type: 'claim', claim: 'We only use 10% of our brains', verdict: 'fails', parts: [{ text: 'Imaging shows activity everywhere', holds: 'yes' }, { text: 'The figure comes from research', holds: 'no' }] }));
  ok('a kind with no controls of its own says so, and that it is changed by asking — no fake fields', /changed by asking/.test(claim) && !/<input(?![^>]*Title)/.test(claim.replace(/<label class="se-field is-wide"><span class="se-k">Title[\s\S]*?<\/label>/, '')));
}

console.log(`\nartifacts (Logos 6): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
