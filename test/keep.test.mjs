// KEEP, AND QUICK PLOTS IN THE CONVERSATION — "the conversation is for
// thinking with something now; Artifacts are for what you keep and build on."
//
//   • Keep on any element files it in Artifacts exactly as it was left, with
//     the reply it came from (lib/objects/display-kept.ts); a chart, a
//     comparison and a decision keep their larger forms (artifactFromSpec);
//     the ways onward (paths, options) are never kept;
//   • what is done with it in Artifacts is kept with it (op "state");
//   • "plot y = x² from −3 to 3" is drawn in the reply as a graph to change;
//     several functions, or anything to make, still open Artifacts.

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
const fence = (o) => '```ui\n' + JSON.stringify(o) + '\n```';
const GRAPH = { type: 'graph', title: 'Average slope, matched', expr: 'x^3 - 3*x', x: [-2.5, 2.5], params: [{ name: 'a', value: -1.5, min: -2.5, max: 2.5, step: 0.1 }, { name: 'b', value: 2, min: -2.5, max: 2.5, step: 0.1 }], chord: ['a', 'b'], features: ['mean-value'] };
const CLAIM = { type: 'claim', claim: 'We only use 10% of our brains', verdict: 'fails', parts: [{ text: 'Imaging shows activity everywhere', holds: 'yes' }, { text: 'The figure comes from research', holds: 'no' }] };

console.log('\n=== a quick plot is drawn in the conversation ===');
for (const t of ['plot y = x^2', 'plot y = x^2 from -3 to 3', 'graph sin(x) from 0 to 2pi', 'can you plot f(x) = x^3 - 3x for x between -2 and 2', 'sketch the graph of sqrt(x)', 'please plot e^x'])
  ok(`one function: "${t}"`, I.quickPlot(t));
for (const t of ['plot y = x^2 and y = 2x', 'graph sin(x) and cos(x)', 'plot the sales data', 'draw a diagram of the heart', 'sketch the next steps', 'plot a 3d surface z = x^2 + y^2', 'make a plot of x^2', 'plot y = x^2, y = x^3', 'simulate a falling ball', 'what does the graph of x^2 look like?'])
  ok(`…not a quick plot: "${t}"`, !I.quickPlot(t));
{
  const sig = (t) => I.readSignals(t, []);
  const state = (t) => I.readTurnState({ text: t, history: [], signals: sig(t), intent: I.routeTurn({ text: t }).intent });
  const plan = (t) => I.planPresentation({ text: t, state: state(t), signals: sig(t), questions: 1, ownWriting: false, guard: false, history: [] });
  ok('routed to the conversation, not Artifacts', I.routeTurn({ text: 'plot y = x^2 from -3 to 3' }).intent === 'conversation' && I.routeTurn({ text: 'plot y = x^2 from -3 to 3' }).reveal === null);
  ok('…as something to do (a task), not idle talk', state('plot y = x^2').work === 'execution' && state('plot y = x^2').exchange.kind === 'task', J(state('plot y = x^2')));
  const p = plan('plot y = x^2 from -3 to 3');
  ok('…offered a graph of that function, no parameters, no understanding shape', p.forms.includes('graph') && p.graph === 'plot' && !p.shape, J(p));
  ok('…told: the function as written, over their range, a line of prose at most', /the function exactly as they wrote it, over the range they gave/.test(I.renderPresentation(p)) && /"params":\[\]/.test(I.renderPresentation(p)));
  const w = I.fitWindowAll([I.compileOver('x^2', [])], [{}], -3, 3);
  ok('its window shows the curve, not just its vertex (x² on [−3, 3] reaches past 7)', w[0] < 0 && w[0] > -2 && w[1] > 7, J(w));
  ok('two functions still open Artifacts', I.routeTurn({ text: 'plot y = x^2 and y = 2x + 1' }).intent === 'visual');
}

console.log('\n=== what Keep makes ===');
{
  const k = I.keptFrom(I.parseInlineSpec(J(GRAPH)), { values: { b: 2.3 } }, { session: 'sME_mvt_00001', message: 'm_abc123', said: 'If a curve is unbroken on [a, b]…', at: 1730000000000 });
  ok('the element, as it was left, with where it came from', k && k.spec.type === 'graph' && k.ui.values.b === 2.3 && k.from.session === 'sME_mvt_00001' && k.from.message === 'm_abc123' && /unbroken/.test(k.from.said) && k.view === 'live', J(k));
  ok('…named by the reply’s own title', k.title === 'Average slope, matched');
  ok('…or, with none, by what it is', I.keptFrom(I.parseInlineSpec(J(CLAIM)), undefined, {}).title === 'Claim: We only use 10% of our brains' && I.keptName(I.parseInlineSpec(J({ ...GRAPH, title: undefined }))) === 'Graph');
  ok('the ways onward are never kept (they are only ever a next message)', I.keptFrom(I.parseInlineSpec(J({ type: 'paths', items: [{ label: 'One' }, { label: 'Two' }] })), undefined, {}) === null);
  ok('nothing malformed is kept, and ids that are not ids are dropped', I.sanitizeKept({ spec: { type: 'graph', expr: 'nope(' } }) === null && !I.sanitizeKept({ spec: GRAPH, from: { session: '../x', message: '<b>' } }).from.session);
  const kind = I.kindOf('kept');
  ok('a kind of its own in Artifacts, made only by Keep (never offered or proposed)', !!kind && I.displayMeta('kept')?.internal === true && !I.offeredKinds().some((m) => m.kind === 'kept'));
  const changed = kind.ops.state.apply(k, { state: J({ values: { a: -1, b: 2.3 } }) });
  ok('what is done with it in Artifacts is kept with it', changed.ui.values.a === -1 && kind.ops.state.check(k, { state: 'not json' }, {}) !== null);
  ok('the reply model reads it as it was left, and where it came from', /As it was left: changed b 2 → 2.3; the chord from x = −1.5 to x = 2.3 has slope/.test(I.keptText(k)) && /kept from the conversation \(from the reply that began “If a curve is unbroken/.test(kind.facts(k, { guarded: false }).join(' ')), I.keptText(k));
  const space = I.makeDisplay(I.EMPTY_SPACE, 'kept', k, 'socria');
  ok('…made in the workspace like any display', space.ok && space.obj.kind === 'kept', J(space).slice(0, 200));
}

console.log('\n=== the Keep button ===');
{
  const R = (spec, host) => renderToStaticMarkup(h(I.RichText, { rich: true, text: fence(spec), inline: host }));
  const host = { live: true, onState: () => {}, onOpen: () => {} };
  const g = R(GRAPH, host);
  ok('every element worth coming back to has Keep, under it', /class="ln-keepable"/.test(g) && /class="ln-keep"[^>]*>.*Keep<\/button>/.test(g) && /title="Keep this in Artifacts, as you left it"/.test(g), g.slice(-500));
  ok('…a claim too', /ln-keep/.test(R(CLAIM, host)));
  ok('once kept, it says so and opens what was kept', /Kept — open in Artifacts/.test(R(GRAPH, { ...host, state: { 0: { artifact: 'K1' } } })));
  ok('a chart keeps its own button to its larger form, not two', !/ln-keep"/.test(R({ type: 'chart', kind: 'bar', x: ['a', 'b', 'c'], series: [{ values: [1, 2, 3] }], basis: 'illustrative' }, host)));
  ok('the ways onward have no Keep', !/ln-keep/.test(R({ type: 'paths', items: [{ label: 'One' }, { label: 'Two' }] }, host)));
  ok('where nothing can be kept (no workspace, someone else’s line), no button', !/ln-keep/.test(R(GRAPH, { live: true, onState: () => {} })));
  const app = read('components/LogosApp.tsx');
  ok('the app: a larger form if there is one, else kept as it was left, from this reply (Socria made it; the footer says so)', /artifactFromSpec\(spec\) \?\? \(kept \? \{ kind: 'kept'/.test(app) && /keptFrom\(spec, msg\.ui\?\.\[String\(n\)\], \{ session: activeIdRef\.current \?\? undefined, message: msg\.id, said: replyOpening\(msg\.content\)/.test(app) && /makeDisplay\(space, a\.kind, a\.state, 'socria'\)/.test(app));
  ok('…pressed again, what was kept opens (no second copy)', /const had = msg\.ui\?\.\[String\(n\)\]\?\.artifact;\s*if \(had && objOf\(space, had\)\) return showObject\(had\);/.test(app));
  ok('drawn in Artifacts by the same component, live, with where it came from', /registerFigure\('kept', KeptFigure\)/.test(read('components/display/register.tsx')) && /<InlineBlock spec=\{s\.spec\}/.test(read('components/display/KeptFigure.tsx')) && /Kept from the conversation/.test(read('components/display/KeptFigure.tsx')) && /d\.act\('state', \{ state: JSON\.stringify\(st\) \}\)/.test(read('components/display/KeptFigure.tsx')));
}

console.log('\n=== the three new shapes are kept too ===');
{
  const DIAGRAM = { type: 'diagram', view: 'cycle', title: 'The water cycle', nodes: [{ id: 'a', label: 'Evaporation', detail: 'sun heats surface water into vapour' }, { id: 'b', label: 'Condensation' }, { id: 'c', label: 'Precipitation' }], edges: [['a', 'b'], ['b', 'c'], ['c', 'a']] };
  const BALANCE = { type: 'balance', subject: 'Index funds', for: ['Low fees', 'Instant diversification'], against: ['No downside protection', 'You own the bad companies too'] };
  const EQUATION = { type: 'equation', tex: 'm = \\frac{p - c}{p}', terms: [{ sym: 'p', means: 'the price' }, { sym: 'c', means: 'the cost' }] };
  const d = I.keptFrom(I.parseInlineSpec(J(DIAGRAM)), { node: 'a' }, { message: 'm_1' });
  ok('a diagram is kept as it was left, the part they had open with it', d?.spec.type === 'diagram' && d.ui?.node === 'a' && d.title === 'The water cycle', J(d));
  ok('…its words are what the reply model reads, and opening a part adds nothing to them (it was reading)', I.keptText(d) === I.inlinePlainText(d.spec) && /back to Evaporation/.test(I.keptText(d)));
  const kind = I.kindOf('kept');
  ok('…what is opened in Artifacts is kept with it', kind.ops.state.apply(d, { state: J({ node: 'b' }) }).ui.node === 'b');
  ok('the pros and cons and an equation are kept, named for what they are when untitled', I.keptFrom(I.parseInlineSpec(J(BALANCE)), undefined, {})?.title === 'Pros and cons: Index funds' && I.keptFrom(I.parseInlineSpec(J(EQUATION)), undefined, {})?.title === 'Equation');
  const R = (spec) => renderToStaticMarkup(h(I.RichText, { rich: true, text: fence(spec), inline: { live: true, onState: () => {}, onOpen: () => {} } }));
  ok('each has Keep under it in the conversation', [DIAGRAM, BALANCE, EQUATION].every((x) => /class="ln-keep"/.test(R(x))));
  ok('…none has a larger form of its own to open instead', [DIAGRAM, BALANCE, EQUATION].every((x) => I.artifactFromSpec(I.parseInlineSpec(J(x))) === null));
}

console.log(`\nkeep: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
