// ADAPTIVE RESPONSE RENDERING — the inline elements of a Logos 5 reply.
//
// What is held down:
//   • a reply's element is a description, never code: anything that is not one
//     of the six shapes, or is malformed, is nothing at all;
//   • a chart draws only numbers they gave or a source this turn carried, and
//     example numbers say so; a comparison marks the figures nothing checked;
//     choices only where a question may go; nothing that works a guarded
//     problem or reasoning that is theirs; no draft of writing that is theirs;
//     a comparison leans no way when the decision is theirs; two at most;
//   • the planner offers an element only where it plausibly helps — never on a
//     hello, a joke, something personal, or a turn another view answers — and
//     never the same one a third time running;
//   • the stream gate sends an element whole, in its canonical form, on a line
//     of its own, and drops one the stream ended inside of;
//   • an element is read as words wherever a picture cannot go: copying, the
//     history the model reads back, the math check, search, older surfaces;
//   • what the person did with one is kept, cleaned; a chart or a comparison
//     opens in Artifacts as a real object, and nothing is offered a place
//     there that has none;
//   • each is drawn in the conversation: accessible, escaped, interactive only
//     where it can act.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as I from './.tmp/inline-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el);
const fence = (o) => '```ui\n' + (typeof o === 'string' ? o : JSON.stringify(o)) + '\n```';

const CHART = { type: 'chart', kind: 'bar', title: 'Monthly costs', x: ['Rent', 'Food', 'Transport'], series: [{ values: [1200, 400, 150] }], unit: '$', basis: 'given' };
const LOAN = {
  type: 'slider',
  title: 'Your mortgage',
  formula: 'p*r/12/(1-(1+r/12)^(-n))',
  result: { label: 'Monthly payment', unit: '$', digits: 0 },
  vars: [
    { name: 'p', label: 'Loan', min: 50000, max: 1000000, step: 5000, value: 300000, unit: '$' },
    { name: 'r', label: 'Rate', min: 0.01, max: 0.12, step: 0.0025, value: 0.06 },
    { name: 'n', label: 'Months', min: 60, max: 480, step: 12, value: 360 },
  ],
};
const COMPARE = { type: 'compare', options: ['Postgres', 'MySQL'], rows: [{ label: 'Licence', values: ['PostgreSQL licence', 'GPL'] }, { label: 'Monthly cost', values: ['$15', '$25'] }], pick: 0 };
const ctx = (o = {}) => ({ theirs: '', sources: '', questions: 1, shown: { n: 0 }, ...o });

console.log('\n=== a description, never code ===');
{
  const c = I.parseInlineSpec(J(CHART));
  ok('a chart is read into its canonical shape', c?.type === 'chart' && c.kind === 'bar' && J(c.series) === J([{ values: [1200, 400, 150] }]) && c.basis === 'given', J(c));
  ok('anything that is not one of the six is nothing', I.parseInlineSpec(J({ type: 'spreadsheet' })) === null && I.parseInlineSpec(J({ type: 'script', src: 'x.js' })) === null);
  ok('  nor is garbage, an array, a number or a megabyte', I.parseInlineSpec('{not json') === null && I.parseInlineSpec('[1,2]') === null && I.parseInlineSpec('42') === null && I.parseInlineSpec(' '.repeat(13_000) + '{}') === null);
  ok('a chart needs a label for every value', I.parseInlineSpec(J({ ...CHART, series: [{ values: [1, 2] }] })) === null && I.parseInlineSpec(J({ ...CHART, x: ['Only'] , series: [{ values: [1] }] })) === null);
  ok('  and real numbers', I.parseInlineSpec(J({ ...CHART, series: [{ values: [1, 'two', 3] }] })) === null && I.parseInlineSpec('{"type":"chart","x":["a","b"],"series":[{"values":[1,NaN]}]}') === null);
  ok('a pie is one whole: one series, nothing below zero', I.parseInlineSpec(J({ ...CHART, kind: 'pie', series: [{ values: [1, -2, 3] }] })) === null && I.parseInlineSpec(J({ ...CHART, kind: 'pie', series: [{ values: [1, 2, 3] }, { values: [3, 2, 1] }] })) === null && I.parseInlineSpec(J({ ...CHART, kind: 'pie' }))?.kind === 'pie');
  ok('numbers said to come from nowhere are examples', I.parseInlineSpec(J({ ...CHART, basis: 'trust me' }))?.basis === 'illustrative');
  ok('at most twenty-four points and three series', I.parseInlineSpec(J({ type: 'chart', x: Array.from({ length: 40 }, (_, i) => `p${i}`), series: [1, 2, 3, 4].map(() => ({ values: Array.from({ length: 40 }, (_, i) => i) })) }))?.x.length === 24 && I.parseInlineSpec(J({ type: 'chart', x: Array.from({ length: 40 }, (_, i) => `p${i}`), series: [1, 2, 3, 4].map(() => ({ values: Array.from({ length: 40 }, (_, i) => i) })) }))?.series.length === 3);
  const s = I.parseInlineSpec(J(LOAN));
  ok('a slider is compiled by the math engine over exactly its names', s?.type === 'slider' && s.vars.length === 3 && s.result.digits === 0, J(s));
  ok('  a formula naming a variable it was not given is not drawn', I.parseInlineSpec(J({ ...LOAN, formula: 'p*q' })) === null);
  ok('  a variable called what a function or constant is called is refused', I.parseInlineSpec(J({ ...LOAN, formula: 'log*2', vars: [{ name: 'log', label: 'x', min: 0, max: 1, value: 0.5 }] })) === null && I.parseInlineSpec(J({ ...LOAN, formula: 'e*2', vars: [{ name: 'e', label: 'x', min: 0, max: 1, value: 0.5 }] })) === null);
  ok('  an empty or reversed range, or two thousand stops, is not a slider', I.parseInlineSpec(J({ ...LOAN, vars: [{ ...LOAN.vars[0], min: 5, max: 5 }] })) === null && I.parseInlineSpec(J({ ...LOAN, vars: [{ ...LOAN.vars[0], step: 1 }] })) === null);
  ok('  a value outside its range is brought inside it', I.parseInlineSpec(J({ ...LOAN, vars: [{ ...LOAN.vars[0], value: 5e9 }, LOAN.vars[1], LOAN.vars[2]] }))?.vars[0].value === 1000000);
  ok('  a result that is not a number where it starts is not drawn', I.parseInlineSpec(J({ type: 'slider', formula: '1/x', result: { label: 'y' }, vars: [{ name: 'x', label: 'x', min: 0, max: 10, value: 0 }] })) === null);
  ok('  code in a formula is not code', I.parseInlineSpec(J({ ...LOAN, formula: 'alert(1)' })) === null && I.parseInlineSpec(J({ ...LOAN, formula: 'p; fetch("x")' })) === null);
  ok('a comparison needs two options and rows that fit them', I.parseInlineSpec(J({ ...COMPARE, options: ['Only'] })) === null && I.parseInlineSpec(J({ ...COMPARE, rows: [{ label: 'x', values: ['1'] }] })) === null);
  ok('  a pick that names no option is dropped', !('pick' in I.parseInlineSpec(J({ ...COMPARE, pick: 7 }))));
  ok('reasoning needs a conclusion and a step', I.parseInlineSpec(J({ type: 'reasoning', summary: 'Yes', steps: [] })) === null && I.parseInlineSpec(J({ type: 'reasoning', summary: 'Yes', steps: ['Because.'] }))?.steps.length === 1);
  ok('choices: two at least, the same one once, words accepted', I.parseInlineSpec(J({ type: 'options', options: ['A', 'A'] })) === null && I.parseInlineSpec(J({ type: 'options', options: ['A', { label: 'B', reply: 'Go with B' }] }))?.options[1].reply === 'Go with B');
  ok('a draft keeps its paragraphs; an unknown kind is dropped', I.parseInlineSpec(J({ type: 'draft', kind: 'manifesto', text: 'Hi,\n\n\n\nThanks' }))?.text === 'Hi,\n\nThanks' && !('kind' in I.parseInlineSpec(J({ type: 'draft', kind: 'manifesto', text: 'Hi' }))));
  ok('control characters and line separators never reach a label', I.parseInlineSpec(J({ ...CHART, x: ['Re\u0000nt ', 'Food', 'Transport'] }))?.x[0] === 'Re nt');
}

console.log('\n=== epistemic control: what an element may claim ===');
{
  const theirs = 'My costs: rent $1,200, food 400 and transport 150.';
  ok('a chart of their own numbers is drawn', I.checkInlineSpec(I.parseInlineSpec(J(CHART)), ctx({ theirs })).ok === true);
  const made = I.checkInlineSpec(I.parseInlineSpec(J({ ...CHART, series: [{ values: [1200, 450, 150] }] })), ctx({ theirs }));
  ok('one number they never gave and it is not drawn — the reply says why', made.ok === false && made.why === 'unsupported-figures' && /A chart was left out/.test(made.notice), J(made));
  ok('  their numbers as people write them count: "1.2k", "$1,200", "3.5 million"', I.checkInlineSpec(I.parseInlineSpec(J({ ...CHART, series: [{ values: [1200, 3500000, 150] }] })), ctx({ theirs: 'rent 1.2k, savings 3.5 million, transport 150' })).ok === true);
  ok('  a chart said to be from a source needs that source this turn', I.checkInlineSpec(I.parseInlineSpec(J({ ...CHART, basis: 'source' })), ctx({ sources: 'Rent averaged 1,200; food 400; transport 150 (ONS 2024).' })).ok === true && I.checkInlineSpec(I.parseInlineSpec(J({ ...CHART, basis: 'source' })), ctx()).ok === false);
  ok('  example numbers are drawn — and say so where they are seen', I.checkInlineSpec(I.parseInlineSpec(J({ ...CHART, basis: 'illustrative' })), ctx()).ok === true);
  const cmp = I.checkInlineSpec(I.parseInlineSpec(J(COMPARE)), ctx({ theirs: 'our budget is $15 a month' }));
  ok('a comparison marks the figure nothing checked, and only that one', cmp.ok && J(cmp.spec.rows[1].unchecked) === J([1]) && !cmp.spec.rows[0].unchecked, J(cmp));
  ok('  small counts are not figures to check', I.checkInlineSpec(I.parseInlineSpec(J({ type: 'compare', options: ['A', 'B'], rows: [{ label: 'Steps', values: ['2 steps', '3 steps'] }] })), ctx()).spec.rows[0].unchecked === undefined);
  ok('  a decision that is theirs: the comparison leans no way', !('pick' in I.checkInlineSpec(I.parseInlineSpec(J(COMPARE)), ctx({ ownJudgment: true })).spec) && I.checkInlineSpec(I.parseInlineSpec(J(COMPARE)), ctx()).spec.pick === 0);
  const opts = I.parseInlineSpec(J({ type: 'options', options: ['A', 'B'] }));
  ok('choices are a question: none where no question may go', I.checkInlineSpec(opts, ctx({ questions: 0 })).ok === false && I.checkInlineSpec(opts, ctx()).ok === true);
  const why = I.parseInlineSpec(J({ type: 'reasoning', summary: 'x = 4', steps: ['2x = 8'] }));
  ok('the Answer Guard: no reasoning and no calculator that works it for them', I.checkInlineSpec(why, ctx({ guard: true })).ok === false && I.checkInlineSpec(I.parseInlineSpec(J(LOAN)), ctx({ guard: true })).ok === false);
  ok('  reasoning that is theirs to do is not laid out; a calculator still is', I.checkInlineSpec(why, ctx({ ownReasoning: true })).ok === false && I.checkInlineSpec(I.parseInlineSpec(J(LOAN)), ctx({ ownReasoning: true })).ok === true);
  ok('writing that is theirs is not drafted', I.checkInlineSpec(I.parseInlineSpec(J({ type: 'draft', text: 'My grandmother…' })), ctx({ ownWriting: true })).ok === false);
  const c2 = ctx({ theirs });
  const many = [CHART, CHART, CHART].map((x) => I.checkInlineSpec(I.parseInlineSpec(J(x)), c2).ok);
  ok('two in a reply at most', J(many) === J([true, true, false]), J(many));
}

console.log('\n=== the gate, as a reply streams ===');
{
  const c = ctx({ theirs: 'rent 1200, food 400, transport 150' });
  ok('a block that is not ui passes untouched', I.gateInlineBlock('```js\nlet x = 1;\n```', c) === '```js\nlet x = 1;\n```');
  ok('a valid block goes out canonical, with a line after it', I.gateInlineBlock(fence({ ...CHART, extra: 'ignored', kind: 'bar' }), c) === `${I.fenceOf(I.parseInlineSpec(J(CHART)))}\n\n`);
  ok('a block the stream ended inside of is nothing', I.gateInlineBlock('```ui\n{"type":"chart"', c, true) === '');
  ok('an invalid one is nothing', I.gateInlineBlock(fence('{"type":"chart"}'), c) === '');
  // the reply arrives a few characters at a time, the block split across the pieces
  const reply = `Most of it is rent.\n\n${fence(CHART)}\n\nThat leaves food. Want to look at it?`;
  for (const size of [1, 3, 7, 50]) {
    const out = [];
    const g = new I.SentenceGate((s) => out.push(s), { block: (chunk, open) => I.gateInlineBlock(chunk, ctx({ theirs: 'rent 1200, food 400, transport 150' }), open), neverEmpty: true });
    for (let i = 0; i < reply.length; i += size) g.push(reply.slice(i, i + size));
    g.finish(1);
    const got = out.join('');
    ok(`streamed ${size} at a time: the words, the block whole and canonical, the question within budget`, got.startsWith('Most of it is rent.') && got.includes(`\n${I.fenceOf(I.parseInlineSpec(J(CHART)))}\n`) && /That leaves food\. Want to look at it\?$/.test(got.trim()), J(got));
  }
  const glued = [];
  const g2 = new I.SentenceGate((s) => glued.push(s), { block: (chunk, open) => I.gateInlineBlock(chunk, ctx({ theirs: 'rent 1200, food 400, transport 150' }), open) });
  g2.push(`Here:${fence(CHART)} done.`);
  g2.finish(0);
  ok('a fence glued to a sentence is moved onto a line of its own, so it is read as a block', /Here:\n\n```ui\n/.test(glued.join('')), J(glued.join('')));
  const cut = [];
  const g3 = new I.SentenceGate((s) => cut.push(s), { block: (chunk, open) => I.gateInlineBlock(chunk, ctx(), open) });
  g3.push('Rent is most of it.\n\n```ui\n{"type":"chart","x":["Rent"');
  g3.finish(0);
  ok('a reply that ends inside a block keeps its words and drops the block', cut.join('').trim() === 'Rent is most of it.', J(cut.join('')));
  const plainCode = [];
  const g4 = new I.SentenceGate((s) => plainCode.push(s), { block: (chunk, open) => I.gateInlineBlock(chunk, ctx(), open) });
  g4.push('Try:\n\n```python\nprint(1)');
  g4.finish(0);
  ok('ordinary code the stream ended inside of still goes out', plainCode.join('').includes('```python\nprint(1)'), J(plainCode.join('')));
}

console.log('\n=== the words it stands for, wherever a picture cannot go ===');
{
  const content = `Most of it is rent.\n\n${I.fenceOf(I.parseInlineSpec(J(CHART)))}\n\nThen food.`;
  ok('copied: the chart as a line of numbers', I.contentAsText(content) === 'Most of it is rent.\n\nMonthly costs: Rent 1,200; Food 400; Transport 150 ($)\n\nThen food.', J(I.contentAsText(content)));
  ok('read back by the model: a short line saying it was shown, no JSON', /\[shown inline — chart: Monthly costs: Rent 1,200; Food 400; Transport 150 \(\$\)\]/.test(I.contentForHistory(content)) && !I.contentForHistory(content).includes('{'));
  ok('  a reply with no block is untouched', I.contentForHistory('Just words.') === 'Just words.');
  ok('  a block that is not valid is not read back at all', I.contentForHistory('A\n\n```ui\n{"type":"x"}\n```\n\nB') === 'A\n\n\n\nB');
  const why = `Probably not.\n\n${I.fenceOf(I.parseInlineSpec(J({ type: 'reasoning', summary: 'It costs more', steps: ['12 × 5 = 60', 'and 60 > 50'] })))}`;
  ok('checked by the math engine: a reasoning step as a sentence', /2\. and 60 > 50/.test(I.contentForCheck(why)) && /1\. 12 × 5 = 60/.test(I.contentForCheck(why)));
  ok('  a slider is not a claim of a value: it is not checked as one', !I.contentForCheck(`A\n\n${I.fenceOf(I.parseInlineSpec(J(LOAN)))}`).includes('p*r'));
  const opts = I.inlinePlainText(I.parseInlineSpec(J({ type: 'options', prompt: 'Where to start?', options: ['The outline', 'The introduction'] })));
  ok('choices read as their labels', opts === 'Where to start? The outline / The introduction', opts);
  ok('a draft reads as itself', I.inlinePlainText(I.parseInlineSpec(J({ type: 'draft', text: 'Hi Sam,\n\nThe heater is broken.' }))) === 'Hi Sam,\n\nThe heater is broken.');
  const ix = I.indexWorkspace([{ id: 's1', title: 'Budget', updatedAt: 1, map: { nodes: [], edges: [] }, messages: [{ id: 'm1', role: 'user', content: 'rent 1200' }, { id: 'm2', role: 'assistant', content }] }]);
  const text = ix.entities.get('msg:s1/m2')?.text ?? '';
  ok('search finds an element by what it says, never by its JSON', text.includes('Rent 1,200') && !text.includes('"type"'), text);
  const old = html(h(I.RichText, { text: content }));
  ok('a surface that does not draw elements shows their words, never JSON', old.includes('Rent 1,200; Food 400') && !old.includes('```') && !old.includes('&quot;type&quot;'), old);
}

console.log('\n=== what the person did with it, kept ===');
{
  const one = I.sanitizeInlineStateOne({ values: { p: 400000, R: 0.05, 'bad name': 1, q: 'x' }, chosen: 2, text: 'Edited\u0000 text', open: true, artifact: 'o3' });
  ok('a slider\'s values, a choice, an edit, an unfolding and the artifact it opened as', J(one) === J({ values: { p: 400000, r: 0.05 }, chosen: 2, text: 'Edited text', open: true, artifact: 'o3' }), J(one));
  ok('  nothing usable is nothing', I.sanitizeInlineStateOne({ chosen: -1, open: 'yes', artifact: '../../etc' }) === null && I.sanitizeInlineStateOne('x') === null);
  ok('  a choice past the last one is not a choice', I.sanitizeInlineStateOne({ chosen: 9 }) === null);
  const all = I.sanitizeInlineState({ 0: { open: true }, 1: { chosen: 1 }, x: { open: true }, 12: { open: true }, 2: 'junk' });
  ok('a message\'s states by position, junk dropped', J(all) === J({ 0: { open: true }, 1: { chosen: 1 } }), J(all));
  ok('  no states at all is undefined, not an empty object', I.sanitizeInlineState({}) === undefined && I.sanitizeInlineState(null) === undefined && I.sanitizeInlineState([1]) === undefined);
}

console.log('\n=== into Artifacts, as real objects ===');
{
  const chart = I.artifactFromSpec(I.parseInlineSpec(J(CHART)));
  const d = I.makeDisplay(I.EMPTY_SPACE, chart.kind, chart.state, 'socria');
  const ds = d.ok ? d.obj.states[d.obj.at] : null;
  ok('a chart opens as a data display: the same rows, the same view, the same basis', d.ok && ds.view === 'bar' && ds.basis === 'given' && J(ds.rows.map((r) => r.cells)) === J([['Rent', 1200], ['Food', 400], ['Transport', 150]]), J(ds));
  const cmp = I.artifactFromSpec(I.checkInlineSpec(I.parseInlineSpec(J(COMPARE)), ctx()).spec);
  const dc = I.makeDisplay(I.EMPTY_SPACE, cmp.kind, cmp.state, 'socria');
  const cs = dc.ok ? dc.obj.states[dc.obj.at] : null;
  ok('a comparison opens as a comparison, its cells as notes and no score anybody did not give', dc.ok && cs.options.length === 2 && cs.criteria.length === 2 && (cs.scores ?? []).every((x) => x.value === null || x.value === undefined), J(cs));
  ok('a calculation stays the calculator in the reply: Artifacts has no view of a lone function, so it is not offered one', I.artifactFromSpec(I.parseInlineSpec(J(LOAN))) === null);
  ok('reasoning, choices and drafts have no larger form', I.artifactFromSpec(I.parseInlineSpec(J({ type: 'reasoning', summary: 'a', steps: ['b'] }))) === null && I.artifactFromSpec(I.parseInlineSpec(J({ type: 'draft', text: 'hi' }))) === null);
}

console.log('\n=== the planner: offered only where it helps ===');
const sig = (t) => I.readSignals(t);
const plan = (text, o = {}) => {
  const history = o.history ?? [];
  const state = I.readTurnState({ text, history, signals: sig(text), intent: I.routeTurn({ text }).intent });
  return I.planPresentation({ text, state, signals: sig(text), questions: o.questions ?? 1, ownWriting: !!o.ownWriting, ownJudgment: !!o.ownJudgment, ownReasoning: !!o.ownReasoning, guard: !!o.guard, history });
};
{
  for (const t of ['hi', 'hey, how are you?', 'good morning!', 'lol that is hilarious', 'thanks so much', 'I feel really low today and I do not know why', 'ok'])
    ok(`plain talk, plain text: "${t}"`, plan(t).forms.length === 0, J(plan(t)));
  for (const t of ['map out my argument for moving to Berlin', 'plot y = x^2 from -3 to 3', 'build a model of a pendulum'])
    ok(`another view answers it: "${t}"`, plan(t).forms.length === 0, J(plan(t)));
  for (const t of ['Why did the Roman Republic fall?', 'what is tax incidence', 'tell me about the history of jazz in New Orleans'])
    ok(`an explanation is prose: "${t}"`, plan(t).forms.length === 0, J(plan(t)));
  const costs = plan('My monthly costs are rent 1200, food 400, transport 150 and phone 60. Where is it all going?');
  ok('their own named amounts: a chart is offered', costs.forms.includes('chart'), J(costs));
  ok('  "$90 on gas, $50 on food, $30 on parking" reads as a list too', plan('I spent $90 on gas, $50 on food and $30 on parking this week').forms.includes('chart'));
  ok('  three numbers that are not a list are not a chart: "a 300k mortgage at 6% over 30 years"', !plan('what would a 300k mortgage at 6% over 30 years cost me each month?').forms.includes('chart'));
  ok('a quantity that moves with what they can vary: a slider', plan('what would a 300k mortgage at 6% over 30 years cost me each month?').forms.includes('slider') && plan('how much would I save if I put 200 a month into an account at 4% interest?').forms.includes('slider'));
  ok('  not under the Answer Guard', !plan('what would a 300k mortgage at 6% over 30 years cost me each month?', { guard: true }).forms.includes('slider'));
  ok('options set against each other: a comparison', plan('compare Postgres and MySQL for a small startup').forms.includes('compare') && plan('which is better for me, the iPhone 15 or the Pixel 8?').forms.includes('compare'));
  ok('a practical email: a draft to edit in place', plan('write an email to my landlord about the broken heater').forms.includes('draft'));
  ok('  their own writing: no draft', !plan('help me write my college essay about my grandmother', { ownWriting: true }).forms.includes('draft'));
  ok('an open request: a few directions to tap', plan('help me with my essay').forms.includes('options') && !plan('help me with my essay', { questions: 0 }).forms.includes('options'));
  ok('  a request that says what it wants is not handed choices', !plan('help me fix the second paragraph of my essay so it flows into the third').forms.includes('options'));
  const check = 'I got 42 for the integral of 2x from 0 to 6, is that correct?';
  ok('a check: the answer up top, the steps folded under it', plan(check).forms.includes('reasoning'), J(plan(check)));
  ok('  not when working it out is theirs', !plan(check, { ownReasoning: true }).forms.includes('reasoning'));
  ok('  nor under the Answer Guard', !plan(check, { guard: true }).forms.includes('reasoning'));
  ok('a call Socria may weigh in on: the same', plan('Should I refinance my mortgage at 5.5% if I plan to move in 3 years?').forms.includes('reasoning'));
  ok('  nor a conclusion drawn on a decision that is theirs', !plan('Should I take the job in Berlin or stay where I am for another year?', { ownJudgment: true }).forms.includes('reasoning'));
  ok('two at most', plan('compare these two loans: what if I borrow 200k at 5% or 250k at 4.5% over 25 years, which is better?').forms.length <= 2);
  const shown = (k) => ({ role: 'assistant', content: `Here.\n\n${fence({ type: k })}` });
  const h2 = [{ role: 'user', content: 'a' }, shown('chart'), { role: 'user', content: 'b' }, shown('chart')];
  const third = plan('and my costs next month are rent 1250, food 380, transport 160 and phone 60', { history: h2 });
  ok('not the same element a third time running', !third.forms.includes('chart') && third.reasons.includes('repeat-held'), J(third));
  const read = [{ role: 'user', content: 'a' }, { role: 'assistant', content: '[shown inline — chart: Rent 1,200]' }, { role: 'user', content: 'b' }, { role: 'assistant', content: '[shown inline — chart: Rent 1,250]' }];
  ok('  as the model read the history back, too', !plan('and the month after: rent 1300, food 390, transport 150, phone 60', { history: read }).forms.includes('chart'));
  const p = plan('My monthly costs are rent 1200, food 400, transport 150 and phone 60. Where is it all going?');
  const said = I.renderPresentation(p);
  ok('the offer carries only the grammar offered, and says it is optional', said.includes('INLINE, IF IT HELPS — optional') && said.includes('"type":"chart"') && !said.includes('"type":"draft"'), said);
  ok('  nothing offered is nothing said', I.renderPresentation({ forms: [], reasons: [] }) === '');
  ok(`  an offer is short: ${said.length} characters for one element`, said.length < 700, said.length);
  const two = I.renderPresentation({ forms: ['compare', 'slider'], reasons: [] });
  ok(`  two elements: ${two.length} characters`, two.length < 1000, two.length);
  ok('room for an element in the reply ceiling: none, a block, a draft', I.presentationRoom({ forms: [] }) === 0 && I.presentationRoom({ forms: ['chart'] }) === 350 && I.presentationRoom({ forms: ['draft'] }) === 700);
}

console.log('\n=== drawn in the conversation ===');
{
  const reply = `Most of it is rent.\n\n${fence(CHART)}\n\nThen food.`;
  const a = html(h(I.RichText, { text: reply, rich: true }));
  ok('a chart is drawn, quietly, between the words around it', /Most of it is rent\.[\s\S]*ln-chart[\s\S]*Then food\./.test(a) && a.includes('<svg') && !a.includes('&quot;type&quot;'), a.slice(0, 300));
  ok('  every bar named for a screen reader, and a table of the numbers', a.includes('aria-label="Rent: $1,200"') && a.includes('class="ln-sr"') && a.includes('<td>$400</td>'));
  ok('  where the numbers came from, said under it', a.includes('Your numbers'));
  ok('  one series is the theme\'s colour, and needs no legend', a.includes('ln-bar s0') && !a.includes('ln-legend'));
  const many = html(h(I.RichText, { rich: true, text: fence({ ...CHART, series: [{ name: '2024', values: [1200, 400, 150] }, { name: '2025', values: [1250, 380, 160] }] }) }));
  ok('two series: their own colours, named in a legend', many.includes('ln-bar s1') && many.includes('ln-bar s2') && many.includes('ln-legend') && many.includes('2025'));
  const ex = html(h(I.RichText, { rich: true, text: fence({ ...CHART, basis: 'illustrative' }) }));
  ok('example numbers say so, where they are seen', ex.includes('Example numbers — not real data') && ex.includes('is-example'));
  const pie = html(h(I.RichText, { rich: true, text: fence({ ...CHART, kind: 'pie' }) }));
  ok('a pie names every slice with its amount and share', pie.includes('ln-slice k0') && /Rent<\/span><span class="ln-pie-v">\$1,200<\/span><span class="ln-pie-p">69%/.test(pie), pie.slice(0, 400));
  for (const values of [[1200, 400, 150, 60], [1, 1, 1], [97, 1, 1, 1], [5, 5, 5, 5, 5, 5]]) {
    const out = html(h(I.RichText, { rich: true, text: fence({ type: 'chart', kind: 'pie', x: values.map((_, i) => `S${i}`), series: [{ values }], basis: 'given' }) }));
    const shares = [...out.matchAll(/ln-pie-p">(\d+)%/g)].map((m) => Number(m[1]));
    ok(`  its shares add up to 100: ${values.join(', ')} → ${shares.join(', ')}`, shares.length === values.length && shares.reduce((a, b) => a + b, 0) === 100, J(shares));
  }
  const pie2 = html(h(I.RichText, { rich: true, text: fence({ ...CHART, kind: 'pie', x: ['Yes', 'No'], series: [{ values: [3, 1] }] }) }));
  ok('  a pie of two is drawn as bars', !pie2.includes('ln-slice') && pie2.includes('ln-bar'));
  const sl = html(h(I.RichText, { rich: true, text: fence(LOAN) }));
  ok('a slider computes its result where it starts, and shows what it computes it from', sl.includes('$1,799') && sl.includes('p*r/12/(1-(1+r/12)^(-n))') && (sl.match(/type="range"/g) ?? []).length === 3, sl.slice(0, 400));
  const kept = html(h(I.L5Message, { m: { id: 'm1', role: 'assistant', content: fence(LOAN), ui: { 0: { values: { p: 450000, r: 0.05, n: 360 } } } }, side: 'socria', who: 'Socria', group: false, cont: false, showQuote: false, canReply: false }));
  ok('  opened again, it is where they left it', kept.includes('$2,416') && kept.includes('$450,000'), kept.match(/ln-result-v">[^<]*/)?.[0]);
  const cp = html(h(I.RichText, { rich: true, text: fence(I.checkInlineSpec(I.parseInlineSpec(J(COMPARE)), ctx()).spec) }));
  ok('a comparison: a table, the lean said in a word, unchecked figures marked', cp.includes('ln-table') && cp.includes('leaning') && cp.includes('aria-label="not checked"') && cp.includes('worth confirming'));
  const rs = html(h(I.RichText, { rich: true, text: `Probably not.\n\n${fence({ type: 'reasoning', summary: 'It costs **more** in the end', steps: ['Rent rises 5%', 'The loan is fixed'] })}` }));
  ok('reasoning folds under its conclusion, which is read like prose', rs.includes('<details class="ln ln-reason"') && rs.includes('2 steps') && rs.includes('<strong class="socria-strong">more</strong>') && !rs.includes('<details class="ln ln-reason" open'));
  const opt = { type: 'options', options: [{ label: 'Start from the outline' }, { label: 'Fix the introduction' }] };
  const live = html(h(I.L5Message, { m: { id: 'm1', role: 'assistant', content: fence(opt) }, side: 'socria', who: 'Socria', group: false, cont: false, showQuote: false, canReply: false, latest: true, onChoose: () => {} }));
  ok('choices on the latest reply can be tapped', (live.match(/class="ln-chip"/g) ?? []).length === 2 && !live.includes('disabled'), live);
  const past = html(h(I.L5Message, { m: { id: 'm1', role: 'assistant', content: fence(opt), ui: { 0: { chosen: 1 } } }, side: 'socria', who: 'Socria', group: false, cont: false, showQuote: false, canReply: false }));
  ok('  once the conversation has moved on, they show what was chosen and are still', past.includes('ln-chip is-on') && (past.match(/disabled=""/g) ?? []).length === 2 && past.includes('aria-pressed="true"'));
  const dr = html(h(I.RichText, { rich: true, text: fence({ type: 'draft', kind: 'email', text: 'Hi Sam,\n\nThe heater is broken.' }) }));
  ok('a draft is text to edit in place, and to copy', dr.includes('<textarea') && dr.includes('Hi Sam,\n\nThe heater is broken.') && dr.includes('>Copy<') && dr.includes('Email'));
  const evil = html(h(I.RichText, { rich: true, text: fence({ ...CHART, title: '<img src=x onerror=alert(1)>', x: ['<script>alert(1)</script>', 'b', 'c'] }) }));
  ok('words in a spec are words: nothing in one is markup', !evil.includes('<img src=x') && !evil.includes('<script>') && evil.includes('&lt;script&gt;'));
  const junk = html(h(I.RichText, { rich: true, text: 'Before.\n\n```ui\n{"type":"chart"}\n```\n\nAfter.' }));
  ok('a block that is not valid draws nothing at all — not its JSON', junk.includes('Before.') && junk.includes('After.') && !junk.includes('chart') && !junk.includes('```'), junk);
  const writing = html(h(I.StreamingRichText, { text: 'Rent is most of it.\n\n```ui\n{"type":"chart","x":["Ren', rich: true }));
  ok('a block still arriving is a quiet placeholder, never half a JSON', writing.includes('Rent is most of it.') && writing.includes('ln-pending') && !writing.includes('&quot;') && !writing.includes('```'), writing);
  const blocks = I.parseBlocks(`${fence(CHART)}\n\nand\n\n${fence(COMPARE)}`, { rich: true }).filter((b) => b.kind === 'ui');
  ok('each element knows its place in the reply, which is how its state is kept', J(blocks.map((b) => [b.n, b.spec?.type])) === J([[0, 'chart'], [1, 'compare']]));
  const noOpen = html(h(I.RichText, { rich: true, text: fence(CHART) }));
  const withOpen = html(h(I.RichText, { rich: true, text: fence(CHART), inline: { onOpen: () => {} } }));
  ok('"Open in Artifacts" only where there is somewhere to open it', !noOpen.includes('Open in Artifacts') && withOpen.includes('Open in Artifacts'));
  const calc = html(h(I.RichText, { rich: true, inline: { onOpen: () => {} }, text: fence(LOAN) }));
  ok('  and never on a calculation, which has nowhere larger to go', !calc.includes('Open in Artifacts') && calc.includes('ln-slider'));
}

console.log(`\ninline ui: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
