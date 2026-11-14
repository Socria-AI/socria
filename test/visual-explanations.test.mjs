// VISUAL EXPLANATIONS — the representation a turn gets, and the pictures that carry it (November 2026).
//
// What is held down:
//   • representation allocation: the planner picks the picture the idea needs — a hole and a value for a limit, an area
//     or its rectangles for an integral, crossing curves for a market, marginal revenue against cost for a monopoly,
//     forces on a body, an algorithm's steps — and nothing at all for a fact or small talk; the choice is named;
//   • the calculus acceptance case: a function approaching 2 at x = 1 whose value there is 3 — an open circle at (1, 2),
//     a filled point at (1, 3), both computed against the curve, refused when they contradict it, readable by Socria;
//   • every number drawn is computed from the specification (limits, areas, Riemann sums, crossings, vector sums);
//   • invalid specifications are refused, never half-drawn; nothing a model writes is executed;
//   • rendering: the marks, the region, the forces and the steps are drawn, labelled, and reachable by keyboard and
//     screen reader; a block still streaming is never drawn half-made;
//   • under the Answer Guard, nothing drawn reads out the answer.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import * as I from './.tmp/inline-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const S = (o) => I.sanitizeInlineSpec(o);
const html = (el) => renderToStaticMarkup(el);
const fence = (spec) => 'Here it is.\n\n```ui\n' + J(spec) + '\n```\n';
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
function plan(text) {
  const signals = I.readSignals(text);
  const state = I.readTurnState({ text, history: [], signals, intent: I.routeTurn({ text }).intent });
  const p = I.planPresentation({ text, state, signals, questions: 1, history: [] });
  return { ...p, repr: I.representationOf({ forms: p.forms, timeline: p.reasons.includes('sequence:timeline') }) };
}

console.log('\n=== representation allocation: the picture the idea needs, or none ===');
{
  const cases = [
    ['A function approaches 2 as x approaches 1, but f(1) = 3. What is the limit and why is it not 3?', 'graph', 'limit'],
    ['what is the limit of (x^2-1)/(x-1) as x approaches 1?', 'graph', 'limit'],
    ['explain continuity and removable discontinuities', 'graph', 'limit'],
    ['explain derivatives as the slope of a tangent line', 'graph', 'tangent'],
    ['how do Riemann sums approximate the integral of x^2 from 0 to 2?', 'graph', 'area'],
    ['explain consumer surplus', 'graph', 'area'],
    ['how does a tax shift supply and demand?', 'graph', 'market'],
    ['how does a monopoly choose its price and quantity?', 'graph', 'monopoly'],
  ];
  for (const [text, form, variant] of cases) {
    const p = plan(text);
    ok(`"${text.slice(0, 56)}…" → ${form}:${variant}`, p.forms.includes(form) && p.graph === variant && p.repr !== 'text', J({ forms: p.forms, graph: p.graph, repr: p.repr }));
  }
  ok('forces on a body → the forces element', plan('what is the net force on a box pulled at 30 degrees with friction?').forms.includes('vectors') && plan('how do I add two vectors?').forms.includes('vectors'));
  ok('an algorithm, asked how it works → its steps to step through, and no second list of steps', J(plan('how does binary search work?').forms) === J(['trace']) && plan('walk me through bubble sort on a small list').forms.includes('trace'));
  ok('…never their own code to fix', !plan('fix my bubble sort: ```js\nfor (let i = 0; i < n; i++) {}\n```').forms.includes('trace'));
  ok('causes of an event → a diagram or a map of the reasoning (the existing elements)', ['diagram', 'claim', 'concepts', 'sequence'].some((k) => plan('what caused the 2008 financial crisis?').forms.includes(k)) || plan('what caused the 2008 financial crisis?').forms.length === 0);
  for (const text of ["what's the capital of Australia?", 'hi, how are you?', 'what is the speed limit on UK motorways?', 'I hit my upload limit, what now?', 'thanks!', 'convert 5 km to miles']) {
    const p = plan(text);
    ok(`no picture forced on "${text}"`, !p.forms.some((k) => ['graph', 'sim', 'vectors', 'trace', 'diagram', 'chart'].includes(k)) && p.repr === 'text', J(p.forms));
  }
  ok('the representation is named, one of ten', I.REPRESENTATIONS.length === 10 && I.representationOf({ forms: ['graph'] }) === 'graph' && I.representationOf({ forms: ['graph', 'paths'] }) === 'graph' && I.representationOf({ forms: [] }) === 'text' && I.representationOf({ forms: ['sequence'], timeline: true }) === 'timeline' && I.representationOf({ forms: ['vectors'] }) === 'diagram' && I.representationOf({ forms: ['compare', 'graph'] }) === 'hybrid');
  const route = readFileSync('app/api/logos/chat/route.ts', 'utf8');
  ok('…and traced with the turn (X-Socria-Runtime repr=)', /`repr=\$\{representationOf\(/.test(route));
  ok('the limit format tells the reply how to draw the hole and the value', /"points":\[\{"x":1,"open":true\},\{"x":1,"y":3\}\]/.test(I.renderPresentation(plan('what is the limit of (x^2-1)/(x-1) as x approaches 1?'))));
}

console.log('\n=== the acceptance case: approaching 2 at x = 1, the value there 3 ===');
{
  const spec = S({ type: 'graph', title: 'The limit, and the value', expr: '(x^2-1)/(x-1)', x: [-1, 3], params: [{ name: 'p', label: 'x', value: 0.2, min: -0.8, max: 2.8, step: 0.05 }], at: ['p'], points: [{ x: 1, open: true }, { x: 1, y: 3 }] });
  ok('the specification validates', !!spec && spec.points.length === 2, J(spec));
  const r = I.graphReadings(spec, { p: 0.2 });
  const hole = r.points.find((q) => q.open), dot = r.points.find((q) => !q.open);
  ok('an open circle at (1, 2): the value the curve approaches, computed from the curve', hole && hole.x === 1 && hole.y === 2, J(r.points));
  ok('a filled point at (1, 3): the value taken', dot && dot.x === 1 && dot.y === 3);
  const lim = I.limitAt(I.compileOver('(x^2-1)/(x-1)', []), {}, 1, 4);
  ok('the limit from both sides is 2, and the curve itself is undefined at 1', near(lim.left, 2, 1e-3) && near(lim.right, 2, 1e-3) && near(lim.limit, 2, 1e-3) && lim.value === null);
  ok('the same picture on a curve the hole sits on (x + 1)', !!S({ type: 'graph', expr: 'x+1', x: [-1, 3], params: [], points: [{ x: 1, y: 2, open: true }, { x: 1, y: 3 }] }));
  ok('REFUSED: a filled point off the curve with no hole — the curve would run through a value it does not take', S({ type: 'graph', expr: 'x+1', x: [-1, 3], params: [], points: [{ x: 1, y: 3 }] }) === null);
  ok('REFUSED: a hole where the curve does not go', S({ type: 'graph', expr: 'x+1', x: [-1, 3], params: [], points: [{ x: 1, y: 3, open: true }] }) === null);
  ok('REFUSED: a hole with no y where the curve has no limit (a jump)', S({ type: 'graph', expr: 'abs(x-1)/(x-1)', x: [-1, 3], params: [], points: [{ x: 1, open: true }] }) === null);
  ok('a hole on one side of a jump is allowed (its one-sided limit)', !!S({ type: 'graph', expr: 'abs(x-1)/(x-1)', x: [-1, 3], params: [], points: [{ x: 1, y: -1, open: true }, { x: 1, y: 1, open: true }] }));
  const said = I.inlinePlainText(spec);
  ok('Socria is told what is drawn, so a follow-up about the graph is answered from it', /an open circle \(the curve approaches but does not take it\) at \(1, 2\)/.test(said) && /a filled point at \(1, 3\)/.test(said), said);
  const out = html(h(I.RichText, { rich: true, text: fence(spec) }));
  ok('drawn: one open mark and one filled mark, labelled with their coordinates', (out.match(/class="ln-mark is-open/g) ?? []).length === 1 && (out.match(/class="ln-mark is-filled/g) ?? []).length === 1 && />\(1, 2\)</.test(out) && />\(1, 3\)</.test(out), out.slice(0, 200));
  ok('read out beside the picture: the limit and the value, side by side', /as x → 1<\/span><b>y → 2<\/b>/.test(out) && /at x = 1<\/span><b>y = 3<\/b>/.test(out));
  ok('said to a screen reader', /open circle, a hole, at \(1, 2\)/.test(out) && /filled point at \(1, 3\)/.test(out));
  ok('a point to drag toward x = 1, by pointer or keyboard (a labelled slider)', /class="ln-handle/.test(out) && /type="range"[^>]*aria-label="x: a point on the curve"/.test(out));
  const narrow = html(h(I.InlineBlock, { spec, open: false, n: 0 }));
  ok('the figure scales with its container (viewBox, width 100%), for a phone as for a desktop', /<svg viewBox="0 0 \d+ \d+" width="100%"/.test(narrow));
  ok('under the Answer Guard the marks are drawn and their coordinates are not', (() => {
    const v = I.checkInlineSpec(spec, { theirs: '', sources: '', questions: 1, guard: true, shown: { n: 0 } });
    const o = v.ok ? html(h(I.InlineBlock, { spec: v.spec, open: false, n: 0 })) : '';
    return v.ok && v.spec.quiet && /ln-mark is-open/.test(o) && !/>\(1, 2\)</.test(o) && !/y → 2/.test(o);
  })());
}

console.log('\n=== derivatives, integrals, Riemann sums: computed, never asserted ===');
{
  const t = S({ type: 'graph', expr: 'x^2', x: [-3, 3], params: [{ name: 'p', value: 1, min: -2.5, max: 2.5, step: 0.1 }], tangent: 'p' });
  ok('the tangent slope of x² at 1 is 2, and at 2 is 4', near(I.graphReadings(t, { p: 1 }).tangent.slope, 2, 1e-3) && near(I.graphReadings(t, { p: 2 }).tangent.slope, 4, 1e-3));
  const R = S({ type: 'graph', expr: 'x^2', x: [0, 2.2], params: [{ name: 'n', label: 'rectangles', value: 4, min: 1, max: 40, step: 1 }], area: { from: 0, to: 2, rects: { n: 'n', rule: 'left' } } });
  const r4 = I.graphReadings(R, { n: 4 }).area, r40 = I.graphReadings(R, { n: 40 }).area;
  ok('4 left rectangles under x² on [0, 2] total 1.75; the area is 8/3', near(r4.sum, 1.75) && near(r4.value, 8 / 3, 1e-6), J(r4));
  ok('more rectangles, a closer total (40: within 0.2 of the area)', Math.abs(r40.sum - r40.value) < Math.abs(r4.sum - r4.value) && Math.abs(r40.sum - r40.value) < 0.2);
  ok('right and midpoint rules computed as they say', near(I.riemannRects((x) => x * x, 0, 2, 4, 'right').sum, 3.75) && near(I.riemannRects((x) => x * x, 0, 2, 4, 'mid').sum, 2.625));
  const out = html(h(I.InlineBlock, { spec: R, open: false, n: 0 }));
  ok('drawn: four rectangles with paper gaps, and the totals read out', (out.match(/<rect /g) ?? []).length >= 4 && /4 rectangles<\/span><b>1\.75<\/b>/.test(out) && /area<\/span><b>2\.67<\/b>/.test(out), out.match(/ln-graph-read[\s\S]{0,300}/)?.[0]);
  ok('REFUSED: rectangles counted by a name that is no parameter', S({ type: 'graph', expr: 'x^2', x: [0, 2], params: [], area: { from: 0, to: 2, rects: { n: 'k', rule: 'left' } } }) === null);
  ok('REFUSED: an area that runs outside the window, or backwards', S({ type: 'graph', expr: 'x^2', x: [0, 2], params: [], area: { from: 0, to: 5 } }) === null && S({ type: 'graph', expr: 'x^2', x: [0, 2], params: [], area: { from: 2, to: 0 } }) === null);
  ok('REFUSED: an area across a pole (1/x through 0)', S({ type: 'graph', expr: '1/x', x: [-1, 1], params: [], area: { from: -1, to: 1 } }) === null);
}

console.log('\n=== economics: markets, surplus, monopoly ===');
{
  const tax = S({ type: 'graph', expr: '10-x', label: 'demand', curves: [{ expr: '2+x+t', label: 'supply' }], x: [0, 10], params: [{ name: 't', value: 0, min: 0, max: 4, step: 0.5 }], features: ['crossings'] });
  const c0 = I.graphReadings(tax, { t: 0 }).crossings[0], c2 = I.graphReadings(tax, { t: 2 }).crossings[0];
  ok('equilibrium at (4, 6); a tax of 2 moves it to (3, 7)', near(c0.x, 4, 1e-6) && near(c0.y, 6, 1e-6) && near(c2.x, 3, 1e-6) && near(c2.y, 7, 1e-6), J({ c0, c2 }));
  const mono = S({ type: 'graph', expr: '12-x', label: 'demand', curves: [{ expr: '12-2*x', label: 'marginal revenue' }, { expr: '2+c', label: 'marginal cost' }], x: [0, 8], y: [0, 13], params: [{ name: 'c', value: 0, min: -1, max: 4, step: 0.5 }], features: ['crossings'] });
  const mr = I.graphReadings(mono, { c: 0 }).crossings;
  ok('monopoly: marginal revenue meets marginal cost at q = 5 (price on demand there: 7)', mr.some((k) => near(k.x, 5, 1e-6) && near(k.y, 2, 1e-6)) && near(I.compileOver('12-x', []).eval({ x: 5 }), 7), J(mr));
  const cs = S({ type: 'graph', expr: '10-x', label: 'demand', curves: [{ expr: '4', label: 'price' }], x: [0, 10], params: [], area: { from: 0, to: 6, between: 1, label: 'consumer surplus' } });
  ok('consumer surplus between demand and a price of 4: 18', near(I.graphReadings(cs, {}).area.value, 18, 1e-6));
  ok('…read out under its own name', /consumer surplus<\/span><b>18<\/b>/.test(html(h(I.InlineBlock, { spec: cs, open: false, n: 0 }))));
}

console.log('\n=== forces at a point ===');
{
  const V = S({ type: 'vectors', title: 'A box pulled on a rough floor', body: 'box', unit: 'N', vectors: [{ label: 'pull', mag: 'p', angle: 30 }, { label: 'friction', mag: 12, angle: 180 }, { label: 'weight', mag: 49, angle: 270 }, { label: 'normal', mag: '49-p*sin(30*pi/180)', angle: 90 }], params: [{ name: 'p', label: 'pull', value: 20, min: 0, max: 40, step: 1, unit: 'N' }] });
  const s20 = I.vectorSum(V, { p: 20 });
  ok('the sum is computed: 20 cos 30° − 12 ≈ 5.32 N along the floor, nothing vertical', near(s20.x, 20 * Math.cos(Math.PI / 6) - 12, 1e-9) && near(s20.y, 0, 1e-9) && near(s20.angle, 0, 1e-9));
  const s0 = I.vectorSum(V, { p: 12 / Math.cos(Math.PI / 6) });
  ok('…and balances (zero) at the pull that matches friction', near(s0.mag, 0, 1e-9));
  ok('REFUSED: a negative size, or a vector with no direction', S({ type: 'vectors', vectors: [{ label: 'a', mag: -3, angle: 0 }], params: [] }) === null && S({ type: 'vectors', vectors: [{ label: 'a', mag: 3 }], params: [] }) === null);
  const out = html(h(I.InlineBlock, { spec: V, open: false, n: 0 }));
  ok('drawn: four arrows and the dashed sum, with their sizes and directions read out', (out.match(/class="ln-vec is-/g) ?? []).length === 5 && /sum<\/span><b>5\.32 N at 0°<\/b>/.test(out), out.slice(0, 200));
  ok('said to a screen reader, with a labelled slider for the pull', /aria-label="A box pulled on a rough floor: pull 20 N at 30 degrees/.test(out) && /type="range"[^>]*aria-label="pull"/.test(out));
  ok('Socria is told the forces and their sum', /their sum: 5\.32 N at 0°/.test(I.inlinePlainText(V)));
  ok('described after they move it: what changed and the new sum', /changed pull 20 N → 30 N; the sum is now 13\.98 N at 0°/.test(I.describeInline(V, { values: { p: 30 } }) ?? ''), I.describeInline(V, { values: { p: 30 } }));
}

console.log('\n=== an algorithm, step by step ===');
{
  const T = S({ type: 'trace', title: 'Binary search for 23', steps: [{ cells: [2, 5, 8, 12, 16, 23, 38], pointers: { lo: 0, hi: 6, mid: 3 }, mark: [3], note: 'Middle is 12; 23 is bigger, so drop the left half.' }, { cells: [2, 5, 8, 12, 16, 23, 38], pointers: { lo: 4, hi: 6, mid: 5 }, mark: [5], note: 'Middle is 23: found it, at index 5.' }] });
  ok('validates: cells, pointers, marks, notes', !!T && T.steps.length === 2 && J(T.steps[1].pointers) === J([{ name: 'lo', at: 4 }, { name: 'hi', at: 6 }, { name: 'mid', at: 5 }]));
  ok('REFUSED: one step, a step with no note, or seventeen cells', S({ type: 'trace', steps: [{ cells: [1], note: 'x' }] }) === null && S({ type: 'trace', steps: [{ cells: [1] }, { cells: [2], note: 'y' }] }) === null && S({ type: 'trace', steps: [{ cells: Array(17).fill(1), note: 'x' }, { cells: [1], note: 'y' }] }) === null);
  ok('marks and pointers outside the cells are dropped, not drawn', (() => { const t = S({ type: 'trace', steps: [{ cells: [1, 2], mark: [5], pointers: { i: 9 }, note: 'a' }, { cells: [1, 2], note: 'b' }] }); return t && !t.steps[0].mark && !t.steps[0].pointers; })());
  const out = html(h(I.InlineBlock, { spec: T, open: false, n: 0 }));
  ok('drawn: the cells, the one being looked at, the pointers, the note, step 1 of 2', (out.match(/class="ln-cell[ "]/g) ?? []).length === 7 && /class="ln-cell is-mark"/.test(out) && />mid</.test(out) && /Step 1 of 2/.test(out));
  ok('keyboard: the element takes focus (arrow keys step), Back is disabled at the start, a labelled step slider', /class="ln ln-trace is-array"[^>]*tabindex="0"/.test(out) && /<button type="button" class="ln-btn" disabled="">Back<\/button>/.test(out) && /aria-label="Step"/.test(out));
  ok('the note is announced as it changes, with the cells in words', /class="ln-trace-note" aria-live="polite"/.test(out) && /The cells: 2, 5, 8, 12, 16, 23, 38\./.test(out));
  ok('where they stepped to is described for Socria', /stepped to step 2 of 2: \[2, 5, 8, 12, 16, 23, 38\] — Middle is 23/.test(I.describeInline(T, { picked: 1 }) ?? ''));
}

console.log('\n=== invalid, unsupported, or someone else\'s figures ===');
{
  ok('a formula the engine cannot read is not a graph (never evaluated as code)', S({ type: 'graph', expr: 'alert(1)', x: [0, 1], params: [] }) === null && S({ type: 'graph', expr: 'x^2; process.exit()', x: [0, 1], params: [] }) === null);
  ok('a point formula that is not arithmetic is dropped, not run', (() => { const g = S({ type: 'graph', expr: 'x', x: [0, 2], params: [], points: [{ x: 'constructor', y: 1 }] }); return g && !g.points; })());
  ok('an unknown kind is nothing', S({ type: 'hologram', data: [1, 2] }) === null);
  const chart = S({ type: 'chart', kind: 'bar', basis: 'given', x: ['a', 'b'], series: [{ values: [41, 77] }] });
  const v = I.checkInlineSpec(chart, { theirs: 'my two numbers are 12 and 30', sources: '', questions: 1, shown: { n: 0 } });
  ok('a chart of "their" figures that are not in what they gave is refused, with a line saying so (source fidelity)', !v.ok && v.why === 'unsupported-figures' && /left out/.test(v.notice ?? ''));
  const ok2 = I.checkInlineSpec(chart, { theirs: 'the two readings were 41 and 77', sources: '', questions: 1, shown: { n: 0 } });
  ok('…and drawn when they are', ok2.ok);
  ok('a second live element in one reply is refused (one thing to work with)', !I.checkInlineSpec(S({ type: 'trace', steps: [{ cells: [1], note: 'a' }, { cells: [2], note: 'b' }] }), { theirs: '', sources: '', questions: 1, shown: { n: 1, live: 1 } }).ok);
  ok('under the Answer Guard, no forces summed and no algorithm run for them', !I.checkInlineSpec(S({ type: 'vectors', vectors: [{ label: 'a', mag: 3, angle: 0 }], params: [] }), { theirs: '', sources: '', questions: 1, guard: true, shown: { n: 0 } }).ok);
}

console.log('\n=== streaming: never a half-made picture ===');
{
  const full = fence({ type: 'graph', expr: 'x+1', x: [-1, 3], params: [], points: [{ x: 1, y: 2, open: true }, { x: 1, y: 3 }] });
  const half = full.slice(0, full.indexOf('"points"') + 12);
  const out = html(h(I.StreamingRichText ?? I.RichText, { rich: true, text: half }));
  ok('a block still arriving draws no graph and shows none of its JSON', !/ln-graph/.test(out) && !/"type":"graph"/.test(out) && !/\{"type"/.test(out), out.slice(0, 300));
  ok('complete, it is drawn', /ln-graph/.test(html(h(I.RichText, { rich: true, text: full }))));
}

console.log('\n=== every example Socria is shown is itself a valid picture ===');
{
  // the formats in the turn's instructions are copied by the model: an example the validator would refuse teaches a refusal
  const examplesIn = (text) => {
    const out = [];
    for (let at = text.indexOf('{"type"'); at >= 0; at = text.indexOf('{"type"', at + 1)) {
      let d = 0, str = false, esc = false, end = -1;
      for (let i = at; i < text.length; i++) {
        const ch = text[i];
        if (str) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') str = false; continue; }
        if (ch === '"') str = true;
        else if (ch === '{') d++;
        else if (ch === '}' && --d === 0) { end = i; break; }
      }
      if (end > at) out.push(text.slice(at, end + 1));
    }
    return out;
  };
  const asks = ['A function approaches 2 as x approaches 1, but f(1) = 3. What is the limit and why is it not 3?', 'how do Riemann sums approximate the integral of x^2 from 0 to 2?', 'explain consumer surplus', 'how does a monopoly choose its price and quantity?', 'how does a tax shift supply and demand?', 'explain derivatives as the slope of a tangent line', 'what is the mean value theorem?', 'how does elasticity change along a demand curve?', 'what is the net force on a box pulled at 30 degrees with friction?', 'how does binary search work?', 'explain how a parabola changes when you change a, b and c', 'why does a thrown ball follow a curve?'];
  let seen = 0;
  const bad = [];
  for (const text of asks) {
    for (const ex of examplesIn(I.renderPresentation(plan(text)))) {
      seen++;
      let parsed = null;
      try { parsed = JSON.parse(ex); } catch { bad.push(`unparseable: ${ex.slice(0, 80)}`); continue; }
      if (!S(parsed)) bad.push(`refused: ${ex.slice(0, 120)}`);
    }
  }
  ok(`${seen} example formats across the visual cases, every one valid`, seen >= 10 && bad.length === 0, J(bad));
}

console.log('\n=== adapting to the person, and asking plainly ===');
{
  ok('an expert, in their own words, gets the limit in notation — no picture unless they ask to see it', !plan("I'm a mathematician — what is the limit of (x^2-1)/(x-1) as x approaches 1?").forms.includes('graph') && I.routeTurn({ text: "I'm a mathematician — show me the graph of (x^2-1)/(x-1) near x = 1" }).intent === 'visual');
  // (asked to be shown, it is drawn in the workspace beside the conversation: the route's visual intent, as before)
  ok('…and the same question from anyone else gets the graph', plan('what is the limit of (x^2-1)/(x-1) as x approaches 1?').graph === 'limit');
  ok('asked as plainly as "what is the limit?", the acceptance case still gets its graph', plan('A function approaches 2 as x approaches 1, but f(1) = 3. What is the limit?').graph === 'limit');
  ok('a stack or a queue, asked how it works: its states to step through', plan('how does a stack work?').forms.includes('trace') && !plan('what is a stack overflow error?').forms.includes('trace'));
}

console.log('\n=== when a picture cannot be drawn, it is said in words ===');
{
  // the client wraps every element in InlineSafe; what it shows when drawing throws is InlineFallback (an error
  // boundary does not run in server rendering, so the fallback itself is what is held down here)
  const V = S({ type: 'vectors', title: 'Box', unit: 'N', vectors: [{ label: 'pull', mag: 20, angle: 0 }, { label: 'friction', mag: 12, angle: 180 }], params: [] });
  const T = S({ type: 'trace', title: 'Search', steps: [{ cells: [1, 2], note: 'look at 1' }, { cells: [1, 2], note: 'found 2' }] });
  const G = S({ type: 'graph', expr: 'x+1', x: [-1, 3], params: [], points: [{ x: 1, y: 2, open: true }, { x: 1, y: 3 }] });
  ok('forces, in words: each force and their sum', /pull 20 N at 0°; friction 12 N at 180°/.test(html(h(I.InlineFallback, { spec: V }))) && /their sum: 8 N at 0°/.test(html(h(I.InlineFallback, { spec: V }))));
  ok('a trace, in words: every step', /1\. \[1, 2\] — look at 1/.test(html(h(I.InlineFallback, { spec: T }))) && /2\. \[1, 2\] — found 2/.test(html(h(I.InlineFallback, { spec: T }))));
  ok('a limit graph, in words: the hole and the value', /open circle[^<]*\(1, 2\)[^<]*filled point at \(1, 3\)/.test(html(h(I.InlineFallback, { spec: G }))));
  const ui = readFileSync('components/inline/InlineUI.tsx', 'utf8');
  ok('every element is drawn inside the boundary that falls back to words', /<InlineSafe spec=\{spec\}>/.test(ui) || /InlineSafe/.test(ui.split('export function InlineBlock')[1]?.slice(0, 2000) ?? ''));
}

console.log('\n=== the comparison with text alone (evals/visual) ===');
{
  const { SCENARIOS } = await import('../evals/visual/scenarios.mjs');
  const miss = [];
  for (const sc of SCENARIOS) {
    const p = plan(sc.user);
    if (sc.expect.form && !p.forms.includes(sc.expect.form)) miss.push(`${sc.id} form`);
    if (sc.expect.graph && p.graph !== sc.expect.graph) miss.push(`${sc.id} graph`);
    if (sc.expect.noForm && p.forms.includes(sc.expect.noForm)) miss.push(`${sc.id} noForm`);
    if (sc.expect.repr && p.repr !== sc.expect.repr) miss.push(`${sc.id} repr ${p.repr}`);
    const blocks = [...sc.reply.matchAll(/```ui\n([\s\S]*?)```/g)].map((m) => S(JSON.parse(m[1])));
    if (sc.invalid ? blocks.some(Boolean) : blocks.some((b) => !b)) miss.push(`${sc.id} reply block`);
  }
  ok(`the ${SCENARIOS.length} scenarios choose as they say, and their replies' pictures validate (the invalid one is refused)`, miss.length === 0, J(miss));
}

console.log(`\nvisual explanations: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
