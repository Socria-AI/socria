// THE CONVERSATION AS SOMETHING TO REASON WITH — "the conversation itself
// becomes a dynamic, interactive reasoning interface … these interactions
// should affect conversational context, allowing Socria to understand what
// users manipulate and respond accordingly."
//
// What is held down:
//   • the arithmetic: a formula read as maths, its turning points, roots and
//     intercept found on the curve, an answer worked out from its formula and
//     compared with what was typed, a path traced over time;
//   • the four new elements are descriptions, never code: a graph to change, a
//     small simulation, a question to work out and check, the working with the
//     person's numbers — anything malformed or uncomputable is nothing;
//   • one thing to work with in a reply; under the Answer Guard, the person's
//     own work and nothing that would be the answer;
//   • WHAT THEY DO REACHES SOCRIA: what was done is said in a line, from where
//     it started to how it stands; read back in the history as it stands now;
//     sent with their next message, shown over their words, and theirs to take
//     off the box before it goes;
//   • the planner offers these only where a relationship can be discovered,
//     the working was asked for, or they are practising — "why did the Roman
//     Republic fall?" is still prose;
//   • each is drawn in the conversation: accessible numbers to drag, a
//     prediction before anything moves, the Logic Map's new cards under the
//     reply, and nothing folded away.

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
const html = (el) => renderToStaticMarkup(el);
const fence = (o) => '```ui\n' + (typeof o === 'string' ? o : JSON.stringify(o)) + '\n```';
const ctx = (o = {}) => ({ theirs: '', sources: '', questions: 1, shown: { n: 0 }, ...o });

const GRAPH = {
  type: 'graph',
  title: 'Where the vertex sits',
  expr: 'a*x^2 + b*x + c',
  x: [-6, 4],
  params: [
    { name: 'a', value: 1, min: -3, max: 3, step: 0.5 },
    { name: 'b', value: 2, min: -6, max: 6, step: 1 },
    { name: 'c', value: -1, min: -5, max: 5, step: 1 },
  ],
  features: ['turning', 'roots', 'intercept'],
  predict: { prompt: 'If b doubles, which way does the vertex move?', options: ['Left', 'Right', 'It stays put'] },
};
const SIM = {
  type: 'sim',
  title: 'Throw at 10 m/s',
  x: 'v*cos(a*pi/180)*t',
  y: 'v*sin(a*pi/180)*t - 4.9*t^2',
  t: [0, '2*v*sin(a*pi/180)/9.8'],
  view: { x: [0, 12], y: [0, 5] },
  params: [
    { name: 'a', label: 'angle', value: 45, min: 5, max: 85, step: 1, unit: '°' },
    { name: 'v', label: 'speed', value: 10, min: 2, max: 20, step: 1, unit: 'm/s' },
  ],
  readouts: [{ label: 'range', expr: 'v^2*sin(2*a*pi/180)/9.8', unit: 'm', digits: 1 }],
};
const CHECK = { type: 'check', prompt: 'Where is the vertex of y = 2x² − 8x + 3?', label: 'x', answer: '-(-8)/(2*2)', explain: 'x = −b/2a = 8/4 = 2' };
const STEPS = {
  type: 'steps',
  title: 'The same curve, written as a square',
  lines: [{ tex: 'y = x^2 + 4x - 1' }, { tex: '= (x^2 + 4x + 4) - 4 - 1', why: 'Half of $b$, squared: $(4/2)^2 = 4$.' }, { tex: '= (x+2)^2 - 5' }],
  check: { prompt: 'Now you: where is the vertex of y = x² − 6x + 2?', label: 'x', answer: '6/2' },
};

console.log('\n=== the arithmetic (lib/inline-math.ts) ===');
{
  ok('a formula read as maths: implicit multiplication, raised exponents, parameters marked', J(I.prettyExpr('a*x^2 + b*x + c', ['a', 'b', 'c']).map((s) => s.k)) === J(['param', 'var', 'sup', 'op', 'param', 'var', 'op', 'param']));
  ok('…and with their numbers written in: "x² − 4x + 3", a zero term and a one dropped', I.exprWithValues('a*x^2 + b*x + c', { a: 1, b: -4, c: 3 }) === 'x² − 4x + 3' && I.exprWithValues('a*x^2+b*x+c', { a: -1, b: 1, c: 0 }) === '−x² + x');
  ok('…a group, a function, a long exponent kept in brackets', I.exprWithValues('a*(x-h)^2+k', { a: 2, h: 1, k: -3 }) === '2(x − 1)² − 3' && I.exprWithValues('A*sin(k*x)', { A: 2, k: 3 }) === '2sin(3x)' && I.exprWithValues('e^(k*t)', { k: 2 }) === 'e^(2t)');
  ok('two numbers meeting take a dot, never run together', I.exprWithValues('2*3 + a*b', { a: 1, b: 4 }) === '2·3 + 1·4');
  ok('what it cannot read is nothing, not a guess', I.prettyExpr('(x', []) === null && I.prettyExpr('x+', []) === null);
  const c = I.compileOver('a*x^2+b*x+c', ['a', 'b', 'c']);
  const f = I.curveFeatures(c, { a: 1, b: 4, c: -1 }, -6, 4);
  ok('the turning point is found on the curve: (−2, −5)', f.some((p) => p.kind === 'turning' && p.x === -2 && p.y === -5), J(f));
  ok('…its roots, and where it meets the y-axis', f.filter((p) => p.kind === 'root').length === 2 && f.some((p) => p.kind === 'intercept' && p.y === -1));
  ok('a hill is a hill (max), a valley a valley', I.curveFeatures(c, { a: -1, b: 0, c: 4 }, -6, 4).find((p) => p.kind === 'turning').max === true);
  ok('a pole is not a crossing: 1/x has no roots and no turning points', I.curveFeatures(I.compileOver('1/x', []), {}, -4, 4).length === 0);
  ok('an answer is worked out from its formula and compared with what was typed', I.checkTyped('-(-8)/(2*2)', '2').right && !I.checkTyped('-(-8)/(2*2)', '−2').right);
  ok('…to the precision people type (1.41 is √2), and "x = 5" reads as 5', I.checkTyped('sqrt(2)', '1.41').right && I.checkTyped('5', 'x = 5').right && !I.checkTyped('1/3', '0.3').right);
  ok('…and words are not numbers', I.readTyped('two') === null && I.answerOf('x+1') === null);
  const cx = I.compileOverT(SIM.x, ['a', 'v']), cy = I.compileOverT(SIM.y, ['a', 'v']);
  const end = I.timeAt(SIM.t[1], ['a', 'v'], { a: 45, v: 10 });
  const pts = I.samplePath(cx, cy, { a: 45, v: 10 }, 0, end, 8);
  ok('a throw traced over time lands where the formula says: 10.2 m at 45°', Math.abs(pts[pts.length - 1].x - 10.2) < 0.01 && Math.abs(pts[pts.length - 1].y) < 1e-9);
  ok('numbers written as the conversation writes them', I.fmtVal(-2) === '−2' && I.fmtVal(0.30000000000000004) === '0.3' && I.fmtPoint({ x: -2, y: -5 }) === '(−2, −5)');
}

console.log('\n=== four new elements, each a description ===');
{
  const g = I.parseInlineSpec(J(GRAPH));
  ok('a graph to change: kept whole, parameters cleaned', g?.type === 'graph' && g.params.length === 3 && g.predict?.options.length === 3, J(g));
  ok('a graph the engine cannot read is not drawn', I.parseInlineSpec(J({ ...GRAPH, expr: 'a*x^2 + q' })) === null);
  ok('…nor one over x that is not about x', I.parseInlineSpec(J({ ...GRAPH, expr: 'a + b' })) === null);
  ok('…nor one with a parameter called x, or a fourth parameter', I.parseInlineSpec(J({ ...GRAPH, params: [...GRAPH.params.slice(0, 2), { name: 'x', value: 1, min: 0, max: 2 }] })) === null && I.parseInlineSpec(J({ ...GRAPH, params: [...GRAPH.params, { name: 'd', value: 1, min: 0, max: 2 }] }))?.params.length === 3);
  ok('…nor a window that is backwards', I.parseInlineSpec(J({ ...GRAPH, x: [4, -6] })) === null);
  const s = I.parseInlineSpec(J(SIM));
  ok('a simulation: a path over time, its end a formula, its readings formulas', s?.type === 'sim' && s.t[1] === SIM.t[1] && s.readouts?.length === 1, J(s));
  ok('a simulation that never moves in time is not one', I.parseInlineSpec(J({ ...SIM, x: 'v', y: 'a' })) === null);
  ok('…nor one that ends before it starts', I.parseInlineSpec(J({ ...SIM, t: [5, 1] })) === null);
  const q = I.parseInlineSpec(J(CHECK));
  ok('a question: its answer is a formula the engine evaluates', q?.type === 'check' && q.answer === CHECK.answer);
  ok('…a question whose "answer" has an unknown in it is not a question', I.parseInlineSpec(J({ ...CHECK, answer: 'x/2' })) === null);
  ok('…and a plain number is taken as its own formula', I.parseInlineSpec(J({ ...CHECK, answer: 2 }))?.answer === '2');
  const st = I.parseInlineSpec(J(STEPS));
  ok('the working: lines of maths, a why folded under one, their turn at the end', st?.type === 'steps' && st.lines.length === 3 && st.lines[1].why && st.check?.answer === '6/2');
  ok('…a line that would reach outside the reply (\\href) is dropped', I.parseInlineSpec(J({ ...STEPS, lines: [{ tex: '\\href{http://x}{y}' }, ...STEPS.lines] }))?.lines.length === 3);
  ok('…one line is not working', I.parseInlineSpec(J({ ...STEPS, lines: [STEPS.lines[0]] })) === null);
}

console.log('\n=== one thing to work with; the Answer Guard ===');
{
  const c = ctx();
  const one = I.checkInlineSpec(I.parseInlineSpec(J(GRAPH)), c);
  const two = I.checkInlineSpec(I.parseInlineSpec(J(SIM)), c);
  ok('one thing to work with in a reply: a second is not drawn', one.ok && !two.ok && two.why === 'one-at-a-time');
  const c2 = ctx();
  I.checkInlineSpec(I.parseInlineSpec(J(GRAPH)), c2);
  ok('…a question beside it is fine', I.checkInlineSpec(I.parseInlineSpec(J(CHECK)), c2).ok);
  const gg = I.checkInlineSpec(I.parseInlineSpec(J(GRAPH)), ctx({ guard: true }));
  ok('under the guard a graph is theirs to explore, with nothing marked that would be the answer', gg.ok && gg.spec.features.length === 0);
  const sg = I.checkInlineSpec(I.parseInlineSpec(J(SIM)), ctx({ guard: true }));
  ok('…a simulation without its readings', sg.ok && !sg.spec.readouts);
  const qg = I.checkInlineSpec(I.parseInlineSpec(J(CHECK)), ctx({ guard: true }));
  ok('…a question to work out, how it comes out held back', qg.ok && !qg.spec.explain);
  ok('…and never the working', I.checkInlineSpec(I.parseInlineSpec(J(STEPS)), ctx({ guard: true })).why === 'guarded' && I.checkInlineSpec(I.parseInlineSpec(J(STEPS)), ctx({ ownReasoning: true })).why === 'their-reasoning');
  ok('a question is a question: only where one may go', I.checkInlineSpec(I.parseInlineSpec(J(CHECK)), ctx({ questions: 0 })).why === 'no-questions');
  ok('the stream gate sends a graph whole, in its canonical form', I.gateInlineBlock(fence(GRAPH), ctx()).startsWith('```ui\n{"type":"graph"'));
}

console.log('\n=== what they did reaches Socria ===');
{
  const g = I.parseInlineSpec(J(GRAPH));
  const did = I.describeInline(g, { predicted: 0, values: { a: 1, b: 4, c: -1 } });
  ok('a graph changed: the prediction, the number moved, the curve now, where the turning point went', /predicted “Left”/.test(did) && /b 2 → 4/.test(did) && /x² \+ 4x − 1/.test(did) && /moved from \(−1, −2\) to \(−2, −5\)/.test(did), did);
  ok('…nothing moved, nothing said', I.describeInline(g, { values: { a: 1, b: 2, c: -1 } }) === null && I.describeInline(g, undefined) === null);
  const s = I.parseInlineSpec(J(SIM));
  const tried = I.describeInline(s, { tries: [{ a: 30, v: 10 }, { a: 60, v: 10 }], values: { a: 60, v: 10 } });
  ok('a simulation: what they tried, and what each gave', /tried angle 30° \(range 8\.8 m\); angle 60° \(range 8\.8 m\)/.test(tried), tried);
  const q = I.parseInlineSpec(J(CHECK));
  ok('a question: what they answered, and whether it was right', /answered 2 for x to “Where is the vertex/.test(I.describeInline(q, { answer: '2', right: true, attempts: 1 })) && /not right \(after 2 tries\)/.test(I.describeInline(q, { answer: '3', right: false, attempts: 2 })));
  const sl = I.parseInlineSpec(J({ type: 'slider', formula: 'p*r', result: { label: 'Cost', unit: '$', digits: 0 }, vars: [{ name: 'p', label: 'Price', min: 1, max: 100, step: 1, value: 10 }, { name: 'r', label: 'Count', min: 1, max: 10, step: 1, value: 2 }] }));
  ok('a slider: what was set, and what it comes to now', I.describeInline(sl, { values: { p: 20 } }) === 'set Price from 10 to 20; Cost is now $40', I.describeInline(sl, { values: { p: 20 } }));
  ok('a draft edited is read in their words', /edited the draft to: “Short and sweet”/.test(I.describeInline({ type: 'draft', text: 'Long version' }, { text: 'Short and sweet' })));
  ok('each element is named when it is said', I.inlineFrom(g) === 'the graph' && I.inlineFrom(s) === 'the simulation' && I.inlineFrom(q) === 'the question');
  const reply = `Try it.\n\n${fence(GRAPH)}\n\nAnd then:\n\n${fence(CHECK)}`;
  ok('the reply\'s elements, numbered as the renderer numbers them', J(I.specsIn(reply).map((x) => x?.type)) === J(['graph', 'check']));
  const hist = I.contentForHistory(reply, { 0: { predicted: 0, values: { a: 1, b: 4, c: -1 } }, 1: { answer: '2', right: true, attempts: 1 } });
  ok('the history reads each element as it stands now, not as it started', /\[shown inline — graph: [^\]]*— now: predicted “Left”[^\]]*b 2 → 4/.test(hist) && /\[shown inline — check: [^\]]*answer: -\(-8\)\/\(2\*2\) = 2\) — now: answered 2/.test(hist), hist);
  ok('…and as it was shown, where nothing was done', /\[shown inline — graph: Where the vertex sits: y = x² \+ 2x − 1/.test(I.contentForHistory(reply)) && !/— now:/.test(I.contentForHistory(reply)));
  ok('a question copied or read by a person never carries its answer', !I.contentAsText(fence(CHECK)).includes('-(-8)') && I.contentAsText(fence(CHECK)).includes('Where is the vertex'));
  ok('what is computed live is not checked as a claim', !I.contentForCheck(fence(GRAPH)).includes('vertex') && I.contentForCheck(fence({ type: 'reasoning', summary: 'S', steps: ['1+1=2'] })).includes('1+1=2'));
  const st = I.sanitizeInlineStateOne({ predicted: 1, skipped: true, tries: [{ a: 30 }, { A: 60 }, { bad: 'x' }], answer: '  2 ', right: true, attempts: 3, whys: [2, 2, 1, 99] });
  ok('what they did is kept, cleaned', st.predicted === 1 && st.skipped && J(st.tries) === J([{ a: 30 }, { a: 60 }]) && st.answer === '2' && st.right && st.attempts === 3 && J(st.whys) === J([1, 2]), J(st));
  const d = I.sanitizeDid([{ from: 'the graph', said: 'moved b 2 → 4' }, { from: '', said: 'x' }, 'no', { from: 'q', said: 'y' }, { from: 'q', said: 'y' }, { from: 'q', said: 'y' }]);
  ok('what travels with a message is shaped and clipped: nothing empty, four at most', d.length === 4 && d[0].said === 'moved b 2 → 4' && !d.some((x) => !x.from || !x.said));
  ok('…and read by the model as one bracketed line, never as their words', I.didLine([{ from: 'the graph', said: 'moved b 2 → 4' }]) === '[What they did with the elements in your replies before writing this — the graph: moved b 2 → 4. Take it into account.]');
}

console.log('\n=== the planner offers them only where they help ===');
{
  const sig = (t) => I.readSignals(t, []);
  const plan = (text, o = {}) => {
    const state = I.readTurnState({ text, history: [], signals: sig(text), intent: I.routeTurn({ text }).intent });
    return I.planPresentation({ text, state, signals: sig(text), questions: o.questions ?? 1, ownWriting: false, ownReasoning: !!o.ownReasoning, guard: !!o.guard, history: [] });
  };
  ok('a relationship to discover: a graph', plan('I don’t get why the vertex of a parabola is at x = −b/2a').forms.includes('graph'), J(plan('I don’t get why the vertex of a parabola is at x = −b/2a')));
  ok('…under the guard too (nothing that would be the answer is marked on it)', plan('why does the slope change the graph like that?', { guard: true }).forms.includes('graph'));
  ok('motion, asked why: one small simulation', plan('Why does throwing at 45 degrees go the farthest?').forms.includes('sim'));
  ok('…but a fall in history is history', !plan('Why did the Roman Republic fall?').forms.length);
  ok('the working, asked for: steps — never under the guard', plan('how do I solve x^2 + 4x - 1 = 0 by completing the square?').forms.includes('steps') && !plan('how do I solve x^2 + 4x - 1 = 0 by completing the square?', { guard: true }).forms.includes('steps'));
  ok('practising, in the conversation: a question to work out', plan('ok, let me try one').forms.includes('check'));
  ok('…not where no question may go', !plan('ok, let me try one', { questions: 0 }).forms.includes('check'));
  ok('…and a practice set asked for is still made in Artifacts, as it was', !plan('give me a practice problem to try').forms.length);
  ok('a graph is offered instead of a slider, never both', !plan('what happens to the curve if I change a in y = a*x^2?').forms.includes('slider'));
  const told = I.renderPresentation({ forms: ['graph', 'check'], reasons: [] });
  ok('the reply is told how to write them, briefly', told.includes('"type":"graph"') && told.includes('"type":"check"') && told.includes('found on the curve live'));
  ok('a cut-off graph is not drawn, so there is room for one', I.presentationRoom({ forms: ['graph'], reasons: [] }) >= 550);
}

console.log('\n=== drawn in the conversation ===');
{
  const R = (spec, host) => html(h(I.RichText, { rich: true, text: fence(spec), inline: host }));
  const states = {};
  const host = { state: states, onState: () => {} };
  const g = R(GRAPH, host);
  ok('a graph: its equation, each number a slider to drag, named', (g.match(/role="slider"/g) ?? []).length >= 3 && /aria-label="a"/.test(g) && /aria-label="b"/.test(g) && /class="ln-eq"/.test(g));
  ok('…a prediction first: the numbers wait for it, and it can be skipped', /Before you change anything/.test(g) && /aria-disabled="true"/.test(g) && />Skip</.test(g));
  ok('…the curve drawn, and the note that what is changed goes to Socria', /class="ln-curve"/.test(g) && /goes to Socria with your next message/.test(g));
  const g2 = R(GRAPH, { state: { 0: { predicted: 0, values: { a: 1, b: 4, c: -1 } } }, onState: () => {} });
  ok('changed: the curve it started as, faintly; the prediction kept; what moved, said', /ln-curve is-ghost/.test(g2) && /You predicted/.test(g2) && /The turning point moved left and down, from \(−1, −2\) to \(−2, −5\)/.test(g2), g2.slice(0, 300));
  ok('…a number shown as one: "+ 4x", and a sign meeting a negative reads as one', />4<\/span><i class="ln-eq-v">x<\/i>/.test(g2) && /<span class="ln-eq-op">−<\/span><span[^>]*>1<\/span>/.test(g2));
  const gr = R(GRAPH, {});
  ok('where it cannot reach Socria, it does not say it does', !/goes to Socria/.test(gr));
  const s = R(SIM, host);
  ok('a simulation: the path, a slider per number, its reading computed', /class="ln-curve"/.test(s) && (s.match(/type="range"/g) ?? []).length === 2 && /range <b>10\.2 m<\/b>/.test(s));
  const s2 = R(SIM, { state: { 0: { tries: [{ a: 30, v: 10 }, { a: 60, v: 10 }], values: { a: 45, v: 10 } } }, onState: () => {} });
  ok('…what they tried stays, faintly, named by its setting', (s2.match(/ln-curve is-ghost/g) ?? []).length === 2 && />30°</.test(s2) && />60°</.test(s2));
  const q = R(CHECK, host);
  ok('a question: a box, Check — and no answer anywhere in the page', /class="ln-answer"/.test(q) && />Check</.test(q) && !q.includes('-(-8)') && !q.includes('8/4'));
  const q2 = R(CHECK, { state: { 0: { answer: '2', right: true, attempts: 1 } }, onState: () => {} });
  ok('…answered right: said so, and how it comes out', /✓ Right/.test(q2) && /8\/4 = 2/.test(q2));
  const q3 = R({ ...CHECK, explain: undefined }, { state: { 0: { answer: '3', right: false, attempts: 2 } }, onState: () => {} });
  ok('…two tries and nothing to show: an invitation to say what they tried', /Say what you tried in the box/.test(q3));
  const st = R(STEPS, host);
  ok('the working: typeset lines, a why to open, their turn at the end', (st.match(/class="katex"/g) ?? []).length >= 3 && /Why\? ▾/.test(st) && /Your turn/.test(st));
  const msg = html(h(I.L5Message, { m: { id: 'u1', role: 'user', content: 'so c doesn’t move it?', did: [{ from: 'the graph', said: 'changed b 2 → 4' }] }, side: 'mine', who: 'You', group: false, cont: false, showQuote: false, canReply: false }));
  ok('what they did is shown over their words', /class="l5-did"/.test(msg) && /From the graph/.test(msg) && /changed b 2 → 4/.test(msg));
  const cards = [{ id: 'n1', label: 'c only lifts the curve', type: 'claim' }, { id: 'n2', label: 'Doubling b moves the vertex left', type: 'claim' }, { id: 'n3', label: 'Why does it double?', type: 'question' }];
  const rep = html(h(I.L5Message, { m: { id: 'a1', role: 'assistant', content: 'Because it is on top of the fraction.' }, side: 'socria', who: 'Socria', group: false, cont: false, showQuote: false, canReply: false, effect: { map: { said: '+3 on the map', nodes: ['n1', 'n2', 'n3'], cards } } }));
  ok('the Logic Map under the reply: the cards this turn added, in their shapes, the map a press away', /class="l5-slice"/.test(rep) && (rep.match(/class="l5-slice-card /g) ?? []).length === 3 && /is-open/.test(rep) && /Open in Logic Map/.test(rep) && !/l5-fx-chip/.test(rep));
  ok('…one card is still a line, not a map', !/l5-slice/.test(html(h(I.L5Message, { m: { id: 'a2', role: 'assistant', content: 'Yes.' }, side: 'socria', who: 'Socria', group: false, cont: false, showQuote: false, canReply: false, effect: { map: { said: '+1 on the map', nodes: ['n1'], cards: cards.slice(0, 1) } } }))));
  ok('cards are named in the person\'s terms, one of Socria\'s kept said so', I.cardSaid('claim') === 'You said' && I.cardSaid('assumption', 'socria') === 'Assumed · kept from Socria' && I.cardShape('tension') === 'pull' && I.sliceOf([...cards, ...cards]).more === 2);
}

console.log('\n=== never folded away ===');
{
  const long = 'This is a long opening paragraph that keeps going so that the reply has plenty of words before its parts, which is what lets a later part fold under its heading when the reply is long enough to be worth folding at all, as long replies are.';
  const text = `${long}\n\n## First part\n\nSome words here about the first part of it.\n\n## Second part\n\nMore words about the second part.\n\n${fence(GRAPH)}\n\nAnd a closing line.`;
  const blocks = I.editorialBlocks(I.parseBlocks(text, { rich: true }));
  const pieces = I.layoutReply(blocks);
  const at = blocks.findIndex((b) => b.kind === 'ui');
  ok('a graph under a folded part stays in view', pieces.some((p) => p.kind === 'block' && p.i === at) && !pieces.some((p) => p.kind === 'fold' && p.body.includes(at)), J(pieces));
}

console.log('\n=== the app and the route ===');
{
  const app = read('components/LogosApp.tsx');
  ok('what is done with an element is said, per element, latest kept', /const said = describeInline\(spec, to\.ui\?\.\[key\]\);/.test(app) && /setDidPending\(\(p\) => \{/.test(app));
  ok('…named by which reply it was in, when not the latest', /in an earlier reply/.test(app));
  ok('…sent with the next message, and the box cleared of it', /\.\.\.\(didNow\.length \? \{ did: didNow \} : \{\}\)/.test(app) && /if \(didNow\.length\) setDidPending\(\{\}\);/.test(app));
  ok('…given back with their words when a message fails', /if \(turn\.did\?\.length\) setDidPending/.test(app));
  ok('…shown on the box, each a press from being left out', /context=\{Object\.entries\(didPending\)/.test(app) && /onDropContext=/.test(app));
  ok('…never carried into another line of thinking', /useEffect\(\(\) => setDidPending\(\{\}\), \[activeId\]\);/.test(app));
  ok('the Logic Map\'s cards travel with a reply\'s effect', /const cards = said/.test(app) && /nodeById\.get\(id\)/.test(app));
  const composer = read('components/LogosComposer.tsx');
  ok('the box says what goes with the message', /Goes with your next message/.test(composer) && /aria-label=\{`Leave out what you did with \$\{c\.from\}`\}/.test(composer));
  const route = read('app/api/logos/chat/route.ts');
  ok('the route reads each element back as it stands now', /contentForHistory\(m\.content, sanitizeInlineState\(m\.ui\)\)/.test(route));
  ok('…and what they did, before their words, in the model\'s copy only', /const did = m\.role === 'user' \? sanitizeDid\(m\.did\) : undefined;/.test(route) && /didLine\(did\)/.test(route));
  const conv = read('app/api/conversations/route.ts');
  ok('what they did is kept with the conversation, cleaned', /const did = m\.role === 'user' \? sanitizeDid\(m\.did\) : undefined;/.test(conv) && /\.\.\.\(did \? \{ did \} : \{\}\)/.test(conv));
}

console.log(`\ninteractive chat: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
