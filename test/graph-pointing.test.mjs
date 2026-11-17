// GRAPHS THAT POINT — what a reply's words are about, shown on its picture (November 2026).
//
// What is held down:
//   • an area that crosses the axis is cut where it crosses, each piece with its signed value computed here — a value a
//     person would write as a fraction comes out as one (−4/3, +27/8); the reply never writes them;
//   • a graph's "highlights": up to four, numbered in order; a point on the curve or a stretch of it; positions are numbers
//     or formulas in the parameters; anything outside the window, back to front or unlabelled is dropped, never drawn;
//   • a line of the working can carry the same number ("mark"), 1 to 4, and nothing else;
//   • the numbers are drawn on the graph, listed under it as "On the graph", and each is a control a keyboard reaches;
//     a step's mark is a button that says what it shows;
//   • the elements of one reply — and of the replies after it that point back — share one scope, so pointing at one
//     lights the other wherever each is drawn;
//   • the prompt teaches the vocabulary, says the values are computed, and forbids decoration.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as I from './.tmp/inline-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const S = (o) => I.sanitizeInlineSpec(o);
const html = (el) => renderToStaticMarkup(el);
const words = (s) => s;
const block = (spec) => h(I.InlineBlock, { spec, open: false, n: 0, renderInline: words });
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

const SIGNED = {
  type: 'graph',
  title: 'Signed area under y = x² − 2x',
  expr: 'x^2-2*x',
  x: [-0.5, 3.5],
  params: [{ name: 'b', value: 3, min: 0.5, max: 3.5, step: 0.5 }],
  area: { from: 0, to: 'b' },
  highlights: [
    { x: 2, label: 'crosses the axis at x = 2: split here' },
    { from: 0, to: 2, label: 'below the axis: counts as negative' },
    { from: 2, to: 'b', label: 'above the axis: the same size, so they cancel' },
  ],
};

console.log('\n=== signed area: cut where it crosses, each piece computed ===');
{
  const f = (x) => x * x - 2 * x;
  const p = I.signedPieces(f, 0, 3);
  ok('x² − 2x from 0 to 3 is two pieces', p.length === 2, J(p));
  ok('…cut at the crossing, x = 2', near(p[0].b, 2, 1e-9) && near(p[1].a, 2, 1e-9), J(p));
  ok('…the first below (−4/3), the second above (+4/3)', near(p[0].v, -4 / 3) && near(p[1].v, 4 / 3), J(p));
  ok('…said as a person writes them', I.signedValue(p[0].v) === '−4/3' && I.signedValue(p[1].v) === '+4/3', J(p.map((q) => I.signedValue(q.v))));
  const q = I.signedPieces(f, 0, 4);
  ok('to x = 4 the second piece is +20/3', I.signedValue(q[1].v) === '+20/3', J(q));
  ok('to x = 3.5, +27/8', I.signedValue(I.signedPieces(f, 0, 3.5)[1].v) === '+27/8');
  ok('a curve that never crosses is one piece', I.signedPieces((x) => x * x + 1, -1, 1).length === 1);
  const sin = I.signedPieces(Math.sin, 0, 2 * Math.PI);
  ok('sin from 0 to 2π: two pieces, +2 and −2', sin.length === 2 && near(sin[0].v, 2, 1e-6) && near(sin[1].v, -2, 1e-6), J(sin));
  ok('a crossing exactly on a sample is still found', I.signedPieces((x) => x - 1, 0, 2).length === 2);
  ok('an empty or reversed interval is nothing', I.signedPieces(f, 2, 2).length === 0 && I.signedPieces(f, 3, 0).length === 0);
  ok('values: whole numbers, zero, and a decimal when no small fraction fits', I.signedValue(3) === '+3' && I.signedValue(-2) === '−2' && I.signedValue(1e-9) === '0' && I.signedValue(Math.PI) === '+3.14' && I.signedValue(NaN) === '');
}

console.log('\n=== highlights: read, checked, kept or dropped ===');
{
  const g = S(SIGNED);
  ok('the graph with highlights validates', !!g && g.type === 'graph', J(g));
  ok('three highlights kept, in order', g?.highlights?.length === 3 && g.highlights[0].x === 2 && g.highlights[1].from === 0 && g.highlights[2].to === 'b', J(g?.highlights));
  const many = S({ ...SIGNED, highlights: Array.from({ length: 6 }, (_, i) => ({ x: i * 0.5, label: `p${i}` })) });
  ok('at most four', many?.highlights?.length === 4, J(many?.highlights));
  const bad = S({
    ...SIGNED,
    highlights: [
      { x: 9, label: 'outside the window' },
      { from: 2, to: 1, label: 'back to front' },
      { x: 1 },
      { x: 'b+9', label: 'a formula outside the window' },
      { x: 'b-1', label: 'a formula inside it' },
      { at: 1, label: 'no position' },
    ],
  });
  ok('outside, back to front, unlabelled or unplaced: dropped; a formula inside: kept', bad?.highlights?.length === 1 && bad.highlights[0].x === 'b-1', J(bad?.highlights));
  const said = S({ ...SIGNED, highlights: [{ x: 2, say: 'the crossing' }], callouts: undefined });
  ok('"say" is read as the label', said?.highlights?.[0]?.label === 'the crossing', J(said?.highlights));
  const called = S({ ...SIGNED, highlights: undefined, callouts: [{ x: 2, text: 'here' }] });
  ok('"callouts" read as highlights', called?.highlights?.[0]?.label === 'here', J(called?.highlights));
  const none = S({ ...SIGNED, highlights: undefined });
  ok('a graph without highlights has none', !none?.highlights || none.highlights.length === 0, J(none?.highlights));
  const text = I.inlinePlainText(g);
  ok('the graph said in words names what it points at', /Pointed at: 1\. crosses the axis at x = 2: split here; 2\. below the axis/.test(text), text);
}

console.log('\n=== a line of the working carries a number ===');
{
  const st = S({
    type: 'steps',
    title: 'Net area and total area',
    lines: [
      { tex: 'x^2-2x=0 \\Rightarrow x=0 \\text{ or } x=2', mark: 1 },
      { tex: '\\int_0^2 (x^2-2x)\\,dx = -\\tfrac43', highlight: 2 },
      { tex: '\\int_2^3 (x^2-2x)\\,dx = \\tfrac43', mark: 7 },
      { tex: '\\text{net} = 0', mark: 'two' },
    ],
  });
  ok('the steps validate', !!st && st.lines.length === 4, J(st));
  ok('"mark" and "highlight" are read', st?.lines[0].mark === 1 && st?.lines[1].mark === 2, J(st?.lines));
  ok('only 1 to 4, and only whole numbers', st?.lines[2].mark === undefined && st?.lines[3].mark === undefined, J(st?.lines));
}

console.log('\n=== drawn: numbered on the graph, listed under it, reachable ===');
{
  const g = S(SIGNED);
  const out = html(block(g));
  ok('the area is drawn in two colours', /ln-area is-below/.test(out) && /ln-area is-above/.test(out), out.slice(0, 300));
  ok('…with each piece\'s value', out.includes('−4/3') && out.includes('+4/3'));
  ok('three numbered highlights on the graph', (out.match(/class="ln-hl is-n\d/g) || []).length === 3);
  ok('…a ring for the point, a stretch for each span', (out.match(/ln-hl-ring/g) || []).length === 1 && (out.match(/ln-hl-span/g) || []).length === 2);
  ok('listed under it, "On the graph"', /ln-hl-list/.test(out) && /On the graph/.test(out));
  const chips = out.match(/<button[^>]*class="ln-hl-chip[^"]*"[^>]*>/g) || [];
  ok('…each a button a keyboard reaches, saying whether it is shown', chips.length === 3 && chips.every((c) => /aria-pressed="false"/.test(c)), J(chips));
  ok('…with its words', out.includes('below the axis: counts as negative'));
  const quiet = html(block({ ...g, quiet: true }));
  ok('under the Answer Guard, the values are not read out', !quiet.includes('−4/3') && !quiet.includes('+4/3'));
  const plain = html(block(S({ ...SIGNED, highlights: undefined })));
  ok('no highlights, no list and no numbers', !/ln-hl-list/.test(plain) && !/class="ln-hl /.test(plain));
  const one = html(block(S({ ...SIGNED, x: [2.5, 3.5], area: { from: 2.5, to: 3.5 }, highlights: undefined })));
  ok('an area of one sign is one colour, without values', !/is-below/.test(one) && !/ln-area-v/.test(one));

  const st = S({ type: 'steps', lines: [{ tex: 'x=2', mark: 1 }, { tex: 'y=0' }] });
  const so = html(block(st));
  ok('a marked step has a button that says what it shows', /<button[^>]*class="ln-step-mark"[^>]*aria-label="Show 1 on the graph"/.test(so), so.slice(0, 400));
  ok('…and an unmarked one has none', (so.match(/ln-step-mark/g) || []).length === 1);
}

console.log('\n=== one scope for a reply and the replies that point back ===');
{
  const fence = (o) => '```ui\n' + J(o) + '\n```';
  const msgs = [
    { id: 'u1', role: 'user', content: 'why is the integral of x^2-2x from 0 to 3 zero?' },
    { id: 'a1', role: 'assistant', content: 'Split where it crosses ①.\n\n' + fence(SIGNED) },
    { id: 'u2', role: 'user', content: 'show me the working' },
    { id: 'a2', role: 'assistant', content: fence({ type: 'steps', lines: [{ tex: 'x=2', mark: 1 }, { tex: 'y=0' }] }) },
    { id: 'a3', role: 'assistant', content: 'A new graph.\n\n' + fence({ ...SIGNED, highlights: [{ x: 1, label: 'here' }] }) },
    { id: 'a4', role: 'assistant', content: 'Plain words.' },
  ];
  const sc = I.markScopes(msgs);
  ok('a reply with a pointing graph is its own scope', sc.get('a1') === 'a1' && sc.get('a3') === 'a3', J([...sc]));
  ok('a later reply points back to it', sc.get('a2') === 'a1', J([...sc]));
  ok('…until a newer pointing graph', sc.get('a4') === 'a3', J([...sc]));
  ok('people\'s messages have none', !sc.has('u1') && !sc.has('u2'));
  ok('a broken fence points at nothing', I.markScopes([{ id: 'b', role: 'assistant', content: '```ui\n{"type":"graph","highlights":[\n```' }]).get('b') === 'b');
  ok('the same list is read once', I.markScopes(msgs) === sc);
  const first = I.markScopes([{ id: 'x', role: 'assistant', content: 'Hello.' }]);
  ok('before any, a reply is its own scope', first.get('x') === 'x');
}

console.log('\n=== a signed-area question gets a picture, and the prompt teaches it to point ===');
{
  const plan = (text) => {
    const signals = I.readSignals(text);
    const state = I.readTurnState({ text, history: [], signals, intent: I.routeTurn({ text }).intent });
    const p = I.planPresentation({ text, state, signals, questions: 1, history: [] });
    return { p, rendered: I.renderPresentation(p) || '' };
  };
  const graphed = [
    'why is the integral of x^2-2x from 0 to 3 zero?',
    'explain definite integrals as signed area',
    'why does area below the x-axis count as negative?',
    'how is net area different from total area for an integral?',
    'total area under a curve that dips below the axis',
    'what is a definite integral?',
  ];
  const miss = graphed.filter((t) => !plan(t).p.forms?.includes('graph'));
  ok(`${graphed.length} ways of asking about signed area get a graph`, miss.length === 0, J(miss));
  const floor = ["what's the total area of the house?", 'net area of the property in square feet'];
  const wrong = floor.filter((t) => plan(t).p.forms?.includes('graph'));
  ok('a house\'s net or total area does not', wrong.length === 0, J(wrong));
  const { rendered } = plan('explain definite integrals as signed area');
  ok('the graph is offered with highlights, numbered as ①②③', /"highlights"/.test(rendered) && /①, ②, ③/.test(rendered), rendered.slice(0, 300));
  ok('…the signed values computed, never written by the reply', /computed for you/.test(rendered) && /never write those values/.test(rendered));
  ok('…and a highlight is never decoration', /never decoration/.test(rendered));
}

console.log(`\ngraph pointing: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
