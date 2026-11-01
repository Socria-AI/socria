// THREE MORE SHAPES FOR WHAT PROSE DOES BADLY — "traditional AI text walls the
// exception, not the default".
//
// What is held down:
//   • a DIAGRAM draws how parts connect — a cycle round a loop, a tree with one
//     root, a flow left to right, the causes of something converging on it —
//     and nothing it cannot draw as its view says: an edge to a part that is
//     not there draws nothing, a tree with two roots, two parents or a loop is
//     not drawn, a flow that comes back on itself is not drawn, a cycle whose
//     edges do not close is closed in the order given or not drawn;
//   • a BALANCE puts the case for and against one thing side by side, two to
//     four a side, with the one thing it turns on, and leans neither way;
//   • an EQUATION is a definition: the TeX passes the same check as the
//     working, its terms are a list of what each means, and under the Answer
//     Guard its worked example is left off;
//   • none of the three is a live element (they never use up the one thing to
//     work with), none tells Socria anything when it is only read, each reads
//     as words wherever a picture cannot go, and each can be kept;
//   • drawn, each is accessible and fits a phone: a diagram's parts are
//     buttons with names, opening one shows its line in a panel under it, and
//     on a phone it is a list with connectors — nothing scrolls sideways;
//   • an element that throws while it is drawn becomes its own words, and a
//     number past a thousand million million is said as a power of ten.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as I from './.tmp/inline-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const fence = (o) => '```ui\n' + (typeof o === 'string' ? o : JSON.stringify(o)) + '\n```';
const P = (o) => I.parseInlineSpec(J(o));
const R = (o, host) => renderToStaticMarkup(h(I.RichText, { rich: true, text: fence(o), inline: host }));
const ctx = (o = {}) => ({ theirs: '', sources: '', questions: 1, shown: { n: 0 }, ...o });

const WATER = { type: 'diagram', view: 'cycle', title: 'The water cycle', nodes: [{ id: 'a', label: 'Evaporation', detail: 'sun heats surface water into vapour' }, { id: 'b', label: 'Condensation' }, { id: 'c', label: 'Precipitation' }, { id: 'd', label: 'Collection' }], edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']] };
const GOV = { type: 'diagram', view: 'tree', title: 'How the government is organised', nodes: [{ id: 'r', label: 'Constitution' }, { id: 'l', label: 'Legislature', detail: 'makes the laws' }, { id: 'x', label: 'Executive' }, { id: 'j', label: 'Judiciary' }, { id: 's', label: 'Senate' }, { id: 'hr', label: 'House' }], edges: [['r', 'l'], ['r', 'x'], ['r', 'j'], ['l', 's'], ['l', 'hr']] };
const BREAD = { type: 'diagram', view: 'flow', title: 'How bread rises', nodes: [{ id: 'y', label: 'Yeast eats sugar' }, { id: 'g', label: 'Carbon dioxide forms' }, { id: 't', label: 'Gluten traps the gas' }, { id: 'r', label: 'The dough rises' }], edges: [['y', 'g'], ['g', 't'], ['t', 'r']] };
const WWI = { type: 'diagram', view: 'causes', title: 'What led to the First World War', nodes: [{ id: 'm', label: 'Militarism', role: 'underlying' }, { id: 'al', label: 'Alliances', role: 'underlying', detail: 'two blocs, each bound to join in' }, { id: 'n', label: 'Nationalism', role: 'amplifier' }, { id: 'f', label: 'Assassination in Sarajevo', role: 'trigger' }, { id: 'w', label: 'War in 1914', role: 'effect' }], edges: [['m', 'w'], ['al', 'w'], ['n', 'f'], ['f', 'w']] };
const FUNDS = { type: 'balance', subject: 'Index funds', for: [{ text: 'Low fees', detail: 'often under 0.1% a year' }, { text: 'Instant diversification' }], against: [{ text: 'No downside protection' }, { text: 'You own the bad companies too' }], turns_on: 'how long you can leave the money alone' };
const CAC = { type: 'equation', tex: '\\text{CAC} = \\frac{\\text{sales + marketing spend}}{\\text{new customers}}', terms: [{ sym: 'sales + marketing spend', means: 'all of it, in the same period' }, { sym: 'new customers', means: 'first-time buyers only' }], example: { tex: '\\frac{\\$12{,}000}{80} = \\$150' } };

console.log('\n=== a diagram: what it draws, and what it will not ===');
{
  const w = P(WATER);
  ok('the water cycle, as written, is read whole', w?.type === 'diagram' && w.view === 'cycle' && w.nodes.length === 4 && J(w.edges) === J(WATER.edges) && w.nodes[0].detail === 'sun heats surface water into vapour', J(w));
  ok('a cycle missing its step back to the start is closed', J(P({ ...WATER, edges: [['a', 'b'], ['b', 'c'], ['c', 'd']] })?.edges) === J(WATER.edges));
  ok('…a cycle with no edges goes round in the order given', J(P({ ...WATER, edges: [] })?.edges) === J(WATER.edges));
  ok('…a loop written from another starting point starts where the reply started the parts', J(P({ ...WATER, edges: [['c', 'd'], ['d', 'a'], ['a', 'b'], ['b', 'c']] })?.nodes.map((n) => n.id)) === J(['a', 'b', 'c', 'd']));
  ok('…a loop given in another order is drawn in that order', J(P({ ...WATER, edges: [['a', 'c'], ['c', 'b'], ['b', 'd'], ['d', 'a']] })?.nodes.map((n) => n.id)) === J(['a', 'c', 'b', 'd']));
  ok('…some steps missing but every one in order: closed in that order', J(P({ ...WATER, edges: [['a', 'b'], ['c', 'd']] })?.edges) === J(WATER.edges));
  ok('a "cycle" that branches is not drawn as a ring', P({ ...WATER, edges: [['a', 'b'], ['a', 'c'], ['c', 'd'], ['d', 'a']] }) === null && P({ ...WATER, edges: [['a', 'b'], ['c', 'b'], ['b', 'd']] }) === null);
  ok('…nor one whose steps say a different order and do not close', P({ ...WATER, edges: [['a', 'c'], ['b', 'd']] }) === null);
  {
    // a part whose id is unusable is given one that no other part already has: never dropped as a duplicate of a part it is not
    const d = P({ type: 'diagram', view: 'flow', nodes: [{ id: 'bad id!', label: 'Mix' }, { id: 'n1', label: 'Knead' }, { label: 'Prove' }, { label: 'Bake' }], edges: [['Mix', 'Knead'], ['n1', 'Prove'], ['Prove', 'Bake']] });
    ok('a part with an unusable id never collides with a part named by its id', d?.nodes.length === 4 && new Set(d.nodes.map((n) => n.id)).size === 4 && d.edges.length === 3, J(d));
  }
  ok('an edge to a part that is not there draws nothing (the rest is still read)', J(P({ ...WATER, edges: [...WATER.edges, ['a', 'zz'], ['b', 'b']] })?.edges) === J(WATER.edges));
  ok('an edge may name a part by its label', J(P({ ...WATER, edges: [['Evaporation', 'Condensation'], ['condensation', 'c'], ['c', 'd'], ['d', 'a']] })?.edges) === J(WATER.edges));
  ok('parts without ids are numbered', J(P({ type: 'diagram', view: 'flow', nodes: ['Mix', 'Knead', 'Prove', 'Bake'] })?.edges) === J([['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4']]));
  ok('three to nine parts: two is a sentence, ten is not a glance (nothing is cut to fit)', P({ ...WATER, nodes: WATER.nodes.slice(0, 2), edges: [] }) === null && P({ type: 'diagram', view: 'flow', nodes: Array.from({ length: 10 }, (_, i) => `Step ${i + 1}`) }) === null && P({ type: 'diagram', view: 'flow', nodes: Array.from({ length: 9 }, (_, i) => `Step ${i + 1}`) })?.nodes.length === 9);
  ok('a label is a few words (40 characters), a detail a line (200)', P({ ...WATER, nodes: [{ ...WATER.nodes[0], label: 'x'.repeat(90), detail: 'y '.repeat(300) }, ...WATER.nodes.slice(1)] })?.nodes[0].label.length === 40 && P({ ...WATER, nodes: [{ ...WATER.nodes[0], detail: 'y '.repeat(300) }, ...WATER.nodes.slice(1)] }).nodes[0].detail.length <= 200);
  ok('a view it does not know is not drawn; "Loop" is a cycle and "hierarchy" a tree', P({ ...WATER, view: 'spiral' }) === null && P({ ...WATER, view: 'Loop' })?.view === 'cycle' && P({ ...GOV, view: 'hierarchy' })?.view === 'tree');
  ok('the same part twice is once', P({ ...BREAD, nodes: [...BREAD.nodes, { id: 'z', label: 'the dough rises' }] })?.nodes.length === 4);

  const g = P(GOV);
  ok('a tree with one root, each part under one parent, is read whole', g?.view === 'tree' && g.edges.length === 5, J(g));
  ok('a tree with two roots is not drawn', P({ ...GOV, edges: GOV.edges.filter(([a, b]) => b !== 'j') }) === null);
  ok('…nor a part under two parents', P({ ...GOV, edges: [...GOV.edges, ['x', 's']] }) === null);
  ok('…nor a loop in it', P({ ...GOV, edges: [['r', 'l'], ['l', 'x'], ['x', 'j'], ['j', 'l'], ['r', 's'], ['r', 'hr']] }) === null);
  ok('…nor more than three levels below the root (three is fine)', P({ type: 'diagram', view: 'tree', nodes: ['A', 'B', 'C', 'D', 'E'], edges: [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['n4', 'n5']] }) === null && !!P({ type: 'diagram', view: 'tree', nodes: ['A', 'B', 'C', 'D'], edges: [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4']] }));
  ok('…nor a tree with no edges at all', P({ ...GOV, edges: [] }) === null);

  ok('a flow is a chain, or branches and joins', !!P(BREAD) && !!P({ ...BREAD, edges: [['y', 'g'], ['y', 't'], ['g', 'r'], ['t', 'r']] }));
  ok('…a flow that comes back on itself is a cycle, not a flow', P({ ...BREAD, edges: [...BREAD.edges, ['r', 'y']] }) === null);
  ok('…and parts joined to nothing are not a flow', P({ ...BREAD, edges: [['y', 'g'], ['t', 'r']] }) === null);
  ok('a role is read only in causes', !('role' in P({ ...BREAD, nodes: BREAD.nodes.map((n) => ({ ...n, role: 'trigger' })) }).nodes[0]));

  const c = P(WWI);
  ok('causes keep the part each plays', J(c?.nodes.map((n) => n.role)) === J(['underlying', 'underlying', 'amplifier', 'trigger', 'effect']), J(c));
  ok('…written as a model writes them: "Root cause", "spark", "Outcome"', J(P({ ...WWI, nodes: WWI.nodes.map((n, i) => ({ ...n, role: ['Root cause', 'structural', 'accelerant', 'Spark', 'Outcome'][i] })) })?.nodes.map((n) => n.role)) === J(['underlying', 'underlying', 'amplifier', 'trigger', 'effect']));
  ok('…a role it does not know is left off, the part kept', P({ ...WWI, nodes: WWI.nodes.map((n, i) => (i === 0 ? { ...n, role: 'vibes' } : n)) })?.nodes[0].role === undefined);
  ok('…with no effect named, where the arrows end is the effect', P({ ...WWI, nodes: WWI.nodes.map(({ role, ...n }) => n) })?.nodes.find((n) => n.id === 'w').role === 'effect');
  ok('…with no edges, everything leads to the one effect', J(P({ ...WWI, edges: [] })?.edges) === J([['m', 'w'], ['al', 'w'], ['n', 'w'], ['f', 'w']]));
  ok('…with no edges and no effect, nothing is guessed', P({ ...WWI, edges: [], nodes: WWI.nodes.map(({ role, ...n }) => n) }) === null);
  ok('…a cause that loops back is not drawn', P({ ...WWI, edges: [...WWI.edges, ['w', 'n']] }) === null);
}

console.log('\n=== where a diagram’s parts go ===');
{
  const c = P(WWI);
  ok('causes converge on the effect: the effect is the last column, a cause of a cause before its cause', J(I.diagramColumns(c)) === J([['m', 'al', 'n'], ['f'], ['w']]), J(I.diagramColumns(c)));
  const t = I.treeLayout(P(GOV));
  ok('a tidy tree: a leaf a slot, a parent centred over its children', t.slots === 4 && t.x.get('l') === 0.5 && t.x.get('r') === 1.75 && t.depth === 2, J([...t.x]));
  ok('a tree read as an outline', J(I.treeRows(P(GOV))) === J([{ id: 'r', depth: 0 }, { id: 'l', depth: 1 }, { id: 's', depth: 2 }, { id: 'hr', depth: 2 }, { id: 'x', depth: 1 }, { id: 'j', depth: 1 }]));
  let inside = true;
  for (const spec of [WATER, GOV, BREAD, WWI].map(P)) {
    for (const W of [640, 720, 900]) {
      const f = I.diagramFigure(spec, W);
      if (!f) continue;
      for (const b of f.boxes) if (b.cx - b.w / 2 < -0.5 || b.cx + b.w / 2 > W + 0.5 || b.cy - b.h / 2 < -0.5 || b.cy + b.h / 2 > f.H + 0.5) inside = false;
    }
  }
  ok('every part’s box is inside the figure, at every width it is drawn at', inside);
  ok('…no two parts of a cycle overlap', (() => { const f = I.diagramFigure(P({ type: 'diagram', view: 'cycle', nodes: Array.from({ length: 9 }, (_, i) => `Stage ${i + 1}`) }), 700); return !f || f.boxes.every((a, i) => f.boxes.every((b, j) => j <= i || Math.abs(a.cx - b.cx) >= (a.w + b.w) / 2 || Math.abs(a.cy - b.cy) >= (a.h + b.h) / 2)); })());
  ok('a picture that would squeeze its words is not drawn: the list is', I.diagramFigure(P({ type: 'diagram', view: 'flow', nodes: Array.from({ length: 9 }, (_, i) => `Step ${i + 1}`) }), 600) === null && I.diagramFigure(P(BREAD), 300) === null && !!I.diagramFigure(P(BREAD), 640));
  ok('a tree is joined by elbows, without arrowheads; a flow by curves', /^M[\d.]+,[\d.]+ V[\d.]+ H[\d.]+ V[\d.]+$/.test(I.diagramFigure(P(GOV), 700).links[0].d) && /^M[\d.]+,[\d.]+ C/.test(I.diagramFigure(P(BREAD), 700).links[0].d));
}

{
  // A connection that skips a column must not be drawn under the parts in between (boxes sit over the lines): the
  // causes' canonical shape — underlying causes straight into the effect, past the trigger — read as "alliances →
  // assassination → war".
  const points = (d) => {
    const out = [];
    const tok = d.match(/[MCHLV]|-?[\d.]+/g);
    let x = 0, y = 0, i = 0, cmd = '';
    const n = () => Number(tok[i++]);
    while (i < tok.length) {
      if (/[MCHLV]/.test(tok[i])) cmd = tok[i++];
      if (cmd === 'M' || cmd === 'L') { const nx = n(), ny = n(); if (cmd === 'L') for (let k = 1; k <= 20; k++) out.push([x + (nx - x) * k / 20, y + (ny - y) * k / 20]); x = nx; y = ny; }
      else if (cmd === 'H') { const nx = n(); for (let k = 1; k <= 20; k++) out.push([x + (nx - x) * k / 20, y]); x = nx; }
      else if (cmd === 'V') { const ny = n(); for (let k = 1; k <= 20; k++) out.push([x, y + (ny - y) * k / 20]); y = ny; }
      else if (cmd === 'C') {
        const a = [n(), n()], b = [n(), n()], e = [n(), n()];
        for (let k = 1; k <= 40; k++) { const t = k / 40, u = 1 - t; out.push([u * u * u * x + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * e[0], u * u * u * y + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * e[1]]); }
        x = e[0]; y = e[1];
      } else i++;
    }
    return out;
  };
  const through = (f) => f.links.filter((l) => points(l.d).some(([x, y]) => f.boxes.some((b) => b.id !== l.from && b.id !== l.to && Math.abs(x - b.cx) < b.w / 2 && Math.abs(y - b.cy) < b.h / 2))).map((l) => `${l.from}→${l.to}`);
  const SKIP = { type: 'diagram', view: 'causes', nodes: [{ id: 'a', label: 'Drought', role: 'underlying' }, { id: 'b', label: 'Crop failure', role: 'trigger' }, { id: 'c', label: 'Prices rise' }, { id: 'd', label: 'Famine', role: 'effect' }], edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['a', 'd']] };
  let crossed = [];
  for (const spec of [WWI, SKIP, { ...SKIP, view: 'flow', nodes: SKIP.nodes.map(({ role: _r, ...n }) => n) }].map(P)) {
    for (const W of [640, 720, 900]) {
      const f = I.diagramFigure(spec, W);
      if (!f) continue;
      crossed = crossed.concat(through(f).map((x) => `${spec.view}@${W}: ${x}`));
      for (const b of f.boxes) if (b.cy - b.h / 2 < -0.5 || b.cy + b.h / 2 > f.H + 0.5) crossed.push(`${spec.view}@${W}: box ${b.id} outside`);
      for (const l of f.links) for (const [, y] of points(l.d)) if (y < -0.5 || y > f.H + 0.5) { crossed.push(`${spec.view}@${W}: ${l.from}→${l.to} outside`); break; }
    }
  }
  ok('a connection that skips a column goes round the parts in between, never under them (and stays inside the figure)', crossed.length === 0, crossed.join('; '));
  ok('…a connection between neighbouring columns is still one curve', /^M[\d.]+,[\d.]+ C[^HC]*$/.test(I.diagramFigure(P(WWI), 720).links.find((l) => l.from === 'f').d));
}

console.log('\n=== a diagram drawn ===');
{
  const host = { live: true, onState: () => {}, onOpen: () => {} };
  for (const [name, spec] of [['a cycle', WATER], ['a tree', GOV], ['a flow', BREAD], ['the causes', WWI]]) {
    const html = R(spec, host);
    ok(`${name}: the picture, and the same parts as the phone’s list`, html.includes(`class="ln ln-diagram is-${spec.view}"`) && html.includes('class="ln-dg-fig"') && html.includes(`class="ln-dg-list is-${spec.view}"`), html.slice(0, 300));
    ok(`${name}: every part a button with its name, in each form`, spec.nodes.every((n) => (html.match(new RegExp(`<button type="button" class="ln-dg-node[^"]*" aria-expanded="false"[^>]*>(?:<span class="ln-dg-role">[^<]*</span>)?<span class="ln-dg-label">${n.label}</span></button>`, 'g')) ?? []).length === 2), html);
    ok(`${name}: the whole of it in words, for a screen reader`, /aria-describedby="[^"]+-alt"/.test(html) && new RegExp(`<p id="[^"]+-alt" class="ln-sr">`).test(html));
    ok(`${name}: kept, like any element worth coming back to`, html.includes('class="ln-keep"'));
  }
  const w = R(WATER, host);
  ok('a cycle: arrowed arcs round the ring', (w.match(/class="ln-dg-link[^"]*" marker-end="url\(#lnarrow/g) ?? []).length === 4);
  ok('…and on the phone, its list ends on the way back to the start', /<li class="ln-dg-back"><span aria-hidden="true">↺ <\/span>Back to the start: Evaporation<\/li><\/ol>/.test(w));
  ok('…each step’s connector to the next', (w.match(/class="ln-dg-item is-next"/g) ?? []).length === 4);
  const g = R(GOV, host);
  ok('a tree: no arrowheads, and on the phone an indented outline', !/marker-end/.test(g) && /<ul class="ln-dg-list is-tree">/.test(g) && /class="ln-dg-item is-d2" style="--d:2"/.test(g) && !/is-next/.test(g));
  const c = R(WWI, host);
  ok('causes: the part each plays said in words on it, not colour alone', /class="ln-dg-node is-trigger"[^>]*><span class="ln-dg-role">Trigger<\/span><span class="ln-dg-label">Assassination in Sarajevo/.test(c) && /is-underlying/.test(c) && /is-amplifier/.test(c) && /is-effect/.test(c));
  ok('…an amplifier’s arrows dashed as well', /class="ln-dg-link is-amplifier"/.test(c));
  ok('…in the list, each cause says what it leads to when it is not simply the next', /Militarism<\/span><\/button><span class="ln-dg-to">→ War in 1914<\/span>/.test(c), c);
  const opened = R(WATER, { ...host, state: { 0: { node: 'a' } } });
  ok('opened, a part shows its line in a panel under the figure, with what it connects to', /<div class="ln-dg-panel is-panel" id="[^"]+-d" aria-live="polite"><p class="ln-dg-panel-h">Evaporation<\/p><p class="ln-dg-panel-d"><span>sun heats surface water into vapour<\/span><\/p><p class="ln-dg-panel-links"><span class="ln-basis">Comes from<\/span><button type="button" class="ln-link">Collection<\/button><span class="ln-basis">Leads to<\/span><button type="button" class="ln-link">Condensation<\/button>/.test(opened), opened);
  ok('…and on the phone, under the part pressed', /class="ln-dg-node is-on has-detail" aria-expanded="true"[^>]*data-where="list"><span class="ln-dg-label">Evaporation<\/span><\/button><div class="ln-dg-panel is-inline">/.test(opened));
  ok('…a part that is not in it opens nothing', !/ln-dg-panel/.test(R(WATER, { ...host, state: { 0: { node: 'zz' } } })));
  const long = R({ type: 'diagram', view: 'flow', nodes: Array.from({ length: 9 }, (_, i) => `Step ${i + 1}`) }, host);
  ok('a flow too long for the picture is drawn as its list at any width', /class="ln ln-diagram is-flow is-listed"/.test(long) && !/ln-dg-fig/.test(long));
  ok('a label with markup is text, never HTML', !/<img/.test(R({ ...WATER, nodes: [{ id: 'a', label: '<img src=x onerror=alert(1)>' }, ...WATER.nodes.slice(1)] }, host)));
}

console.log('\n=== for and against ===');
{
  const b = P(FUNDS);
  ok('the case either way, read whole', b?.type === 'balance' && b.subject === 'Index funds' && b.for.length === 2 && b.against.length === 2 && b.for[0].detail === 'often under 0.1% a year' && b.turns_on === 'how long you can leave the money alone', J(b));
  ok('one point a side is a sentence, not a balance', P({ ...FUNDS, against: [{ text: 'Risky' }] }) === null && P({ ...FUNDS, subject: '' }) === null);
  ok('four a side at most; points written as words are read', P({ ...FUNDS, for: ['a', 'b', 'c', 'd', 'e', 'f'] })?.for.length === 4 && P({ ...FUNDS, for: ['Cheap', 'Simple'] })?.for[1].text === 'Simple');
  ok('"pros" and "cons" are for and against', P({ type: 'balance', subject: 'Remote work', pros: ['No commute', 'Flexible hours'], cons: ['Isolation', 'Blurred evenings'] })?.against.length === 2);
  ok('what it turns on is optional', !('turns_on' in P({ ...FUNDS, turns_on: undefined })));
  const html = R(FUNDS, { live: true, onState: () => {}, onOpen: () => {} });
  ok('drawn: the subject, For and Against as small labels, and what it turns on under both', /<p class="ln-title">Index funds<\/p><div class="ln-bal-cols"><div class="ln-bal-side is-for"><p class="ln-k" aria-hidden="true">For<\/p><ul class="ln-bal-list" aria-label="For">/.test(html) && /<div class="ln-bal-side is-against"><p class="ln-k" aria-hidden="true">Against<\/p>/.test(html) && /<p class="ln-bal-turns"><span class="ln-k">Turns on<\/span><span class="ln-bal-turns-t"><span>how long you can leave the money alone<\/span><\/span><\/p>/.test(html), html);
  ok('…a point with more to say opens, one without does not pretend to', /<button type="button" class="ln-bal-row" aria-expanded="false">/.test(html) && /<span class="ln-bal-row is-still">/.test(html));
  ok('…and it can be kept', /ln-keep/.test(html));
}

console.log('\n=== a definition, as one equation ===');
{
  const e = P(CAC);
  ok('the equation, its terms and its example, read whole', e?.type === 'equation' && e.tex === CAC.tex && e.terms.length === 2 && e.example.tex === CAC.example.tex, J(e));
  ok('TeX that could reach outside itself is not drawn: the equation is refused, an example or a term left off', P({ ...CAC, tex: '\\href{javascript:x}{CAC}' }) === null && !('example' in P({ ...CAC, example: { tex: '\\url{x}' } })) && P({ ...CAC, terms: [{ sym: '\\href{x}{y}', means: 'm' }] }).terms === undefined);
  ok('"math" is its TeX too; six terms at most; an example may be written as a string', P({ type: 'equation', math: 'm = \\frac{p - c}{p}' })?.tex === 'm = \\frac{p - c}{p}' && P({ ...CAC, terms: Array.from({ length: 9 }, (_, i) => ({ sym: `t${i}`, means: 'x' })) }).terms.length === 6 && P({ ...CAC, example: '1 + 1 = 2' }).example.tex === '1 + 1 = 2');
  const html = R(CAC, { live: true, onState: () => {}, onOpen: () => {} });
  ok('drawn: the equation displayed (KaTeX), in a box of its own that scrolls when it is wide', /<div class="ln-scroll ln-eqn-tex"><span class="lg-tex lg-tex-block"><span class="katex-display">/.test(html), html.slice(0, 300));
  ok('…the terms as a list of what each means', /<dl class="ln-eqn-terms"><div class="ln-eqn-term"><dt>sales \+ marketing spend<\/dt><dd><span>all of it, in the same period<\/span><\/dd><\/div>/.test(html));
  ok('…a symbol that is maths drawn as maths', /<dt><span class="lg-tex/.test(R({ ...CAC, terms: [{ sym: 'r', means: 'the rate' }] })));
  ok('…the example on one quiet line', /<p class="ln-eqn-ex"><span class="ln-k">For example<\/span><span class="ln-eqn-ex-t"><span class="lg-tex/.test(html));
  ok('…and it can be kept', /ln-keep/.test(html));
}

console.log('\n=== checked before it is shown ===');
{
  ok('a diagram and the case either way are not laid out to read under the Answer Guard', I.checkInlineSpec(P(WATER), ctx({ guard: true })).ok === false && I.checkInlineSpec(P(FUNDS), ctx({ guard: true })).why === 'guarded');
  const g = I.checkInlineSpec(P(CAC), ctx({ guard: true }));
  ok('under the guard, the equation stays and its worked example is left off', g.ok && g.spec.tex === CAC.tex && !('example' in g.spec) && g.spec.terms.length === 2, J(g));
  ok('…without the guard, the example is shown', I.checkInlineSpec(P(CAC), ctx()).spec.example?.tex === CAC.example.tex);
  const c = ctx();
  const graph = P({ type: 'graph', expr: 'x^2', x: [-3, 3], params: [] });
  ok('none of the three is a live element: each goes beside the one thing to work with', I.checkInlineSpec(P(WATER), c).ok && I.checkInlineSpec(graph, c).ok && c.shown.live === 1 && !I.LIVE_KINDS.some((k) => ['diagram', 'balance', 'equation'].includes(k)));
  ok('…and two to a reply still holds', I.checkInlineSpec(P(FUNDS), c).why === 'too-many');
  const gate = I.gateInlineBlock(fence({ ...WATER, title: '  The   water cycle ' }), ctx());
  ok('the gate sends a diagram out in its canonical form', gate === `${I.fenceOf(P(WATER))}\n\n`, gate);
}

console.log('\n=== as words, wherever a picture cannot go ===');
{
  ok('a cycle: round, and back to the start', I.inlinePlainText(P(WATER)) === 'The water cycle\nA cycle: Evaporation (sun heats surface water into vapour) → Condensation → Precipitation → Collection → back to Evaporation');
  ok('a tree: an indented outline', I.inlinePlainText(P(GOV)) === 'How the government is organised\nConstitution\n  - Legislature (makes the laws)\n    - Senate\n    - House\n  - Executive\n  - Judiciary', I.inlinePlainText(P(GOV)));
  ok('a chain: one arrow after another', I.inlinePlainText(P(BREAD)) === 'How bread rises\nYeast eats sugar → Carbon dioxide forms → Gluten traps the gas → The dough rises');
  ok('a branching flow: each part and what it leads to', /^Yeast eats sugar → Carbon dioxide forms, Gluten traps the gas$/m.test(I.inlinePlainText(P({ ...BREAD, edges: [['y', 'g'], ['y', 't'], ['g', 'r'], ['t', 'r']] }))));
  const c = I.inlinePlainText(P(WWI));
  ok('causes: by the part each plays, then every connection', /^Underlying causes: Militarism; Alliances \(two blocs, each bound to join in\)$/m.test(c) && /^Trigger: Assassination in Sarajevo$/m.test(c) && /^Amplifier: Nationalism$/m.test(c) && /^Effect: War in 1914$/m.test(c) && /How they connect: Militarism → War in 1914; Alliances → War in 1914; Nationalism → Assassination in Sarajevo; Assassination in Sarajevo → War in 1914/.test(c), c);
  ok('the case either way', I.inlinePlainText(P(FUNDS)) === 'Index funds, for and against\nFor: Low fees (often under 0.1% a year); Instant diversification\nAgainst: No downside protection; You own the bad companies too\nIt turns on: how long you can leave the money alone');
  ok('an equation, its terms and its example', I.inlinePlainText(P(CAC)) === `${CAC.tex}\nsales + marketing spend: all of it, in the same period\nnew customers: first-time buyers only\nFor example: ${CAC.example.tex}`);
  const reply = `Mostly the sun.\n\n${fence(WATER)}\n\nAnd balance:\n\n${fence(FUNDS)}`;
  ok('copied, each is its words', /Evaporation \(sun heats/.test(I.contentAsText(reply)) && /For: Low fees/.test(I.contentAsText(reply)) && !/```/.test(I.contentAsText(reply)));
  ok('the accuracy check reads what they claim (a claim inside one is checked)', /back to Evaporation/.test(I.contentForCheck(reply)) && /For example: /.test(I.contentForCheck(fence(CAC))));
  ok('the history says what was shown, in words', /\[shown inline — diagram: The water cycle A cycle: Evaporation/.test(I.contentForHistory(reply)) && /\[shown inline — balance: Index funds, for and against/.test(I.contentForHistory(reply)));
  ok('each is called what it is when what was done with it is said', I.inlineFrom(P(WATER)) === 'the diagram' && I.inlineFrom(P(FUNDS)) === 'the pros and cons' && I.inlineFrom(P(CAC)) === 'the equation');
}

console.log('\n=== reading is not doing ===');
{
  ok('the part of a diagram they opened is kept with the message', I.sanitizeInlineStateOne({ node: 'a' })?.node === 'a' && I.sanitizeInlineStateOne({ node: '<script>' }) === null && I.sanitizeInlineStateOne({ node: 'x'.repeat(40) }) === null);
  ok('…and is not said to Socria: opening a part is reading it', I.describeInline(P(WATER), { node: 'a' }) === null && I.inlineNow(P(WATER), { node: 'a' }) === null && I.describeInline(P(FUNDS), { open: true }) === null && I.describeInline(P(CAC), {}) === null);
}

console.log('\n=== an element that breaks is said in words ===');
{
  ok('a number past a thousand million million is a power of ten, not a crash', I.fmtNum(1e21) === '1×10²¹' && I.fmtNum(-1.234e21) === '-1.23×10²¹' && I.fmtNum(5e20) === '5×10²⁰' && I.fmtNum(2.5e15) === '2.5×10¹⁵', [I.fmtNum(1e21), I.fmtNum(-1.234e21), I.fmtNum(5e20)].join(' '));
  ok('…and below it, numbers are as they were', I.fmtNum(1234567.891) === '1,234,567.89' && I.fmtNum(999999999999999) === '999,999,999,999,999' && I.fmtNum(0.5) === '0.5');
  ok('a chart whose values are past it is not drawn (a bar of 10²¹ is not read off an axis)', P({ type: 'chart', x: ['a', 'b'], series: [{ values: [1, 1e21] }] }) === null && !!P({ type: 'chart', x: ['a', 'b'], series: [{ values: [1, 9e14] }] }));
  let threw = null;
  let html = '';
  try {
    html = renderToStaticMarkup(h(I.InlineBlock, { spec: { type: 'chart', kind: 'bar', x: ['Earth', 'Sun'], series: [{ values: [6e24, 2e30] }], basis: 'illustrative' }, open: false, n: 0, renderInline: (t) => t }));
  } catch (e) {
    threw = e;
  }
  ok('a chart that reaches 10²¹ anyway (one kept from before) draws, its numbers said as powers of ten', !threw && /2×10³⁰/.test(html), threw ? threw.message : html.slice(0, 200));

  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    try {
      globalThis[k] = k === 'window' ? dom.window : dom.window[k];
    } catch {}
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');
  const quiet = console.error;
  console.error = () => {};
  const mount = async (el) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const r = createRoot(host);
    await act(async () => r.render(el));
    return host;
  };
  try {
    const Boom = () => {
      throw new Error('a renderer that breaks');
    };
    const one = await mount(h(I.InlineSafe, { spec: P(FUNDS) }, h(Boom)));
    ok('a renderer that throws shows the element in its own words instead', one.innerHTML === `<p class="ln-fallback">${I.inlinePlainText(P(FUNDS))}</p>`, one.innerHTML);
    // a spec that reached the renderer unsanitized, in a shape no renderer expects: a step's label is not words
    const bad = { type: 'sequence', kind: 'steps', items: [{ label: { x: 1 } }, { label: 'Two' }, { label: 'Three' }] };
    const two = await mount(h(I.InlineBlock, { spec: bad, open: false, n: 0, renderInline: (t) => t.replace(/x/g, 'y') }));
    ok('…drawn in a reply, the element breaks and the reply does not: its words stand where it stood', /<p class="ln-fallback">1\. \[object Object\]\n2\. Two\n3\. Three<\/p>/.test(two.innerHTML), two.innerHTML);
    const fine = await mount(h(I.InlineSafe, { spec: P(FUNDS) }, h('span', null, 'drawn')));
    ok('…one that draws is untouched', fine.innerHTML === '<span>drawn</span>');
  } finally {
    console.error = quiet;
  }
}

console.log('\n=== nothing scrolls sideways on a phone ===');
{
  const css = read('components/inline/inline.css');
  ok('under 640px the diagram is its list, the panel under the part pressed', /@media \(max-width: 640px\) \{\s*\.logos-root \.ln-diagram \.ln-dg-fig \{\s*display: none;\s*\}\s*\.logos-root \.ln-diagram \.ln-dg-list \{\s*display: block;/.test(css));
  ok('…the two sides stack, For then Against', /@media \(max-width: 640px\)[\s\S]*\.ln-bal-cols \{\s*grid-template-columns: minmax\(0, 1fr\);/.test(css));
  ok('…the terms stack; a wide equation scrolls inside its own box', /\.ln-eqn-terms \{\s*grid-template-columns: minmax\(0, 1fr\);/.test(css) && /<div class="ln-scroll ln-eqn-tex">/.test(R(CAC)));
  ok('labels break anywhere when one word is longer than the line: choices, steps, ways onward, titles, parts, claims', /:is\(\.ln-chip, \.ln-seq-label,[^)]*\.ln-path-l, \.ln-path-g, \.ln-title, \.ln-card-n,[^)]*\.ln-claim-text, \.ln-part-text,[^)]*\) \{\s*overflow-wrap: anywhere;/.test(css));
  ok('the screen reader’s copy of a chart is a block one pixel square that clips, never as wide as its table', /\.logos-root \.ln \.ln-sr \{\s*display: block;\s*position: absolute;\s*width: 1px;/.test(css) && /<div class="ln-sr"><table><caption>/.test(R({ type: 'chart', kind: 'bar', x: ['a', 'b'], series: [{ values: [1, 2] }], basis: 'illustrative' })));
}

console.log(`\ninline kinds: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
