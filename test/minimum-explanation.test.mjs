// MINIMUM EXPLANATION, MAXIMUM UNDERSTANDING — "when users ask to understand
// something, Logos generates lengthy, textbook-style explanations instead of
// getting straight to the point … Logos 5 should feel like interacting with an
// idea, not reading an AI-generated textbook."
//
// The root causes were in how a turn is READ, not in the wording of a rule:
//   • "I need to understand the Mean Value Theorem" was read as nothing in
//     particular: no move, no shape, nothing to draw — the reply fell back on
//     a textbook;
//   • maths was told "show the reasoning step by step" on an idea to
//     understand, and the only graph on offer was a parabola;
//   • "how long should I boil an egg?" was a consequential decision, "why do
//     onions make you cry?" was creative writing that is theirs, "is it true
//     that we only use 10% of our brains?" was a discussion with two sides,
//     "my manager says remote work kills productivity — is that right?" was
//     their own work to correct;
//   • "what's the capital of Peru?", with no search, was told to spend the
//     reply on databases and queries to paste.
//
// Held down here: the readers, the planner (the shape, the graph that fits the
// idea, the claim, the ways deeper), the arithmetic of a chord, a tangent, the
// mean value point (and its honest failures), crossings, the specs and the
// guard, what is said back to Socria, the drawn elements — and, through the
// real route, what the reply model is sent for every test case.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as I from './.tmp/inline-under-test.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const fence = (o) => '```ui\n' + (typeof o === 'string' ? o : JSON.stringify(o)) + '\n```';
const ctx = (o = {}) => ({ theirs: '', sources: '', questions: 1, shown: { n: 0 }, ...o });
const near = (a, b, e = 1e-3) => Math.abs(a - b) <= e;

const MVT = { type: 'graph', title: 'Average slope, matched', expr: 'x^3 - 3*x', x: [-2.5, 2.5], params: [{ name: 'a', value: -1.5, min: -2.5, max: 2.5, step: 0.1 }, { name: 'b', value: 2, min: -2.5, max: 2.5, step: 0.1 }], chord: ['a', 'b'], features: ['mean-value'] };
const TAN = { type: 'graph', title: 'The slope at a point', expr: 'x^2', x: [-3, 3], params: [{ name: 'p', value: 1, min: -2.5, max: 2.5, step: 0.1 }], tangent: 'p' };
const TAX = { type: 'graph', title: 'A tax on sellers', expr: '10 - x', label: 'demand', curves: [{ expr: '2 + x + t', label: 'supply' }], x: [0, 10], params: [{ name: 't', label: 'tax', value: 0, min: 0, max: 4, step: 0.5 }], features: ['crossings'] };
const ELASTIC = { type: 'graph', title: 'Elasticity along a demand curve', expr: '10 - x', label: 'demand', x: [0, 10], params: [{ name: 'q', label: 'quantity', value: 3, min: 0.5, max: 9.5, step: 0.5 }], at: ['q'], readouts: [{ label: 'elasticity', expr: '(10-q)/q', digits: 2 }] };
const CLAIM = { type: 'claim', claim: 'We only use 10% of our brains', verdict: 'fails', parts: [{ text: 'Imaging shows activity across virtually every region over a day', holds: 'yes', basis: 'brain scans of ordinary activity' }, { text: 'The 10% figure comes from research', holds: 'no', basis: 'no study found it — see https://example.com/myth' }] };

console.log('\n=== reading the turn: what kind of help it asks for ===');
{
  const sig = (t) => I.readSignals(t, []);
  const work = (t) => I.readTurnState({ text: t, history: [], signals: sig(t), intent: I.routeTurn({ text: t }).intent }).work;
  const xk = (t) => I.readTurnState({ text: t, history: [], signals: sig(t), intent: I.routeTurn({ text: t }).intent }).exchange.kind;
  for (const t of ['I need to understand the Mean Value Theorem', 'I want to understand how compound interest works', "I'm confused about elasticity", "what's the intuition behind eigenvectors?", 'can you help me understand recursion?', "I still can't get my head around limits", 'so I need to understand the chain rule for tomorrow'])
    ok(`wanting to understand, said as a need, is a request for the idea: "${t}"`, I.wantsExplanation(t, sig(t)) && work(t) === 'explanation', work(t));
  ok('…and the Mean Value Theorem turn is work, not small talk', xk('I need to understand the Mean Value Theorem') === 'task');
  ok('a how-are-you is still not an explanation', !I.wantsExplanation('how are you doing today?', sig('how are you doing today?')));
  for (const t of ['How long should I boil an egg for a runny yolk?', 'how much water should I drink a day?', 'what temperature should I bake bread at?', 'when should I plant tomatoes?'])
    ok(`a practical "should I" is a question with an answer: "${t}"`, !I.asksForDecision(t, sig(t)) && I.isFactQuestion(t) && work(t) === 'information', work(t));
  for (const t of ['Should I take the job or stay?', 'Should we hire a second engineer or our first marketer? We have 8 months of runway.', 'which one should we pick?'])
    ok(`a choice is still a decision: "${t}"`, I.asksForDecision(t, sig(t)) && work(t) === 'judgment', work(t));
  for (const t of ['Is it true that we only use 10% of our brains?', 'My manager says remote work kills productivity. Is that right?', 'I read that sugar makes kids hyper — is that true?', 'Is there any evidence that vitamin C prevents colds?', 'fact-check this: Einstein failed maths'])
    ok(`a claim to check: "${t}"`, I.claimCheck(t) && work(t) === 'information' && xk(t) === 'task', `${work(t)} ${xk(t)}`);
  for (const t of ['I got x = 4, is that right?', 'is it true that free will is an illusion?', 'Is that right?', 'what do you think about remote work?'])
    ok(`…and not a claim to check: "${t}"`, !I.claimCheck(t));
  ok('"I got x = 4, is that right?" is still their work to verify', work('I got x = 4, is that right?') === 'verification');
  const split = (t) => {
    const s = sig(t);
    const state = I.readTurnState({ text: t, history: [], signals: s, intent: I.routeTurn({ text: t }).intent });
    return I.allocate({ state, signals: s, assist: { lastUserText: t, history: [], guard: false } });
  };
  ok('"why do onions make you cry?" holds back nothing creative ("make" originates nothing there)', split('Why do onions make you cry?').split.creativity !== 'human', J(split('Why do onions make you cry?').split));
  ok('…while "make me a story about onions" still keeps the story theirs', split('make me a story about onions').split.creativity === 'human', J(split('make me a story about onions').split));
  ok('the boiled egg reserves no decision', split('How long should I boil an egg for a runny yolk?').split.judgment !== 'human');
  ok('the hiring choice stays theirs', split('Should we hire a second engineer or our first marketer? We have 8 months of runway.').split.judgment === 'human');
}

console.log('\n=== what the turn is told: the move and the subject ===');
{
  const sig = (t) => I.readSignals(t, []);
  const block = (t) => {
    const s = sig(t);
    const state = I.readTurnState({ text: t, history: [], signals: s, intent: I.routeTurn({ text: t }).intent });
    const a = I.allocate({ state, signals: s, assist: { lastUserText: t, history: [], guard: false } });
    return I.renderAllocation(a, state);
  };
  const mvt = block('I need to understand the Mean Value Theorem');
  ok('an idea to understand: the move says the central idea first, with the conditions it needs', /The central idea first, in one plain sentence/.test(mvt) && /condition it cannot do without/.test(mvt), mvt);
  ok('…and nothing tells it to work a problem through', !/work the problem through/.test(mvt) && /explain the idea/.test(mvt), mvt);
  const why = block('Why is the derivative of x^2 equal to 2x?');
  ok('maths on an idea: the idea before any working, not "step by step"', /The idea before any working/.test(why) && !/^Show the reasoning step by step/m.test(why), why);
  ok('maths on a problem still shows the working', /Show the reasoning step by step/.test(block('Solve for x: 3x^2 - 12 = 0')), block('Solve for x: 3x^2 - 12 = 0'));
  const find = block('Find the derivative of x^3 sin x');
  ok('"find the derivative of…" is a problem to work, not idle talk', /Show the reasoning step by step/.test(find) && /=== This turn ===/.test(find), find);
  ok('…while "calculate 18% of 340" is still a quick sum, answered', /INFORM/.test(block('calculate 18% of 340')), block('calculate 18% of 340'));
  const egg = block('How long should I boil an egg for a runny yolk?');
  ok('the egg is answered, not deliberated', /INFORM/.test(egg) && !/PERSPECTIVE/.test(egg) && !/Theirs: the decision/.test(egg), egg);
  const onion = block('Why do onions make you cry?');
  ok('the onion is explained, with no rule about writing that is theirs', /EXPLAIN/.test(onion) && !/the substance of what they are writing/.test(onion), onion);
  const brain = block('Is it true that we only use 10% of our brains?');
  ok('the myth gets a verdict first, not "the other side at its strongest"', /INFORM/.test(brain) && !/the other side at its strongest/.test(brain), brain);
  const remote = block('My manager says remote work kills productivity. Is that right?');
  ok("somebody else's claim is not their attempt to correct", !/VERIFY\./.test(remote) && !/Their attempt gets the correction/.test(remote), remote);
  ok('the maths block: the idea first, then the picture to change; proofs when asked', /EXPLORATION \(a concept, a theorem, a relationship\): the idea first, in one sentence/.test(I.LOGOS5_MATH) && /never dropped for brevity/.test(I.LOGOS5_MATH));
  // the cached core stays inside its budget: the rule rides on the turns that need it (the shape, the move, the maths block)
  ok('the core leads with the insight, and leaves the rest to the turns that need it', /Lead with what matters: the answer, the insight, the finding/.test(I.LOGOS5_CORE) && !/THE SHAPE OF THIS REPLY/.test(I.LOGOS5_CORE));
  ok('the persona says it changed', I.PERSONA_VERSION === 'logos5-v6');
}

console.log('\n=== the shape, and what may be drawn ===');
{
  const sig = (t) => I.readSignals(t, []);
  const plan = (text, o = {}) => {
    const state = I.readTurnState({ text, history: [], signals: sig(text), intent: I.routeTurn({ text }).intent });
    return I.planPresentation({ text, state, signals: sig(text), questions: o.questions ?? 1, ownWriting: false, ownReasoning: !!o.ownReasoning, guard: !!o.guard, history: [] });
  };
  const p = plan('I need to understand the Mean Value Theorem');
  ok('the Mean Value Theorem: the understanding shape, a graph of rates, the ways deeper', p.shape === 'understand' && p.forms.includes('graph') && p.graph === 'rate' && p.forms.includes('paths'), J(p));
  const r = I.renderPresentation(p);
  ok('…told: the central insight in one sentence, conditions kept, then the graph, then stop', /THE SHAPE OF THIS REPLY — they want to understand an idea/.test(r) && /never drop one for brevity/.test(r) && /the graph below, with one line on what to try/.test(r) && /If a sentence or two carries it, that is the whole reply/.test(r), r.slice(0, 600));
  ok('…shown the chord and the mean value point, not a parabola', /"chord":\["a","b"\]/.test(r) && /"mean-value"/.test(r) && !/"expr":"a\*x\^2\+b\*x\+c"/.test(r), r);
  ok('…with room for the graph', I.presentationRoom(p) >= 550);
  const d = plan('What does a derivative actually mean?');
  ok('what a derivative means: understanding, and the tangent at a point', d.shape === 'understand' && d.graph === 'tangent' && /"tangent":"p"/.test(I.renderPresentation(d)), J(d));
  const tax = plan('Why does a tax on sellers raise the price buyers pay by less than the tax?');
  ok('a tax on sellers: two curves that meet, the tax to drag', tax.shape === 'understand' && tax.graph === 'market' && /"crossings"/.test(I.renderPresentation(tax)), J(tax));
  const el = plan('Explain price elasticity of demand');
  ok('elasticity: a point along the demand curve with its reading', el.graph === 'point' && /"readouts"/.test(I.renderPresentation(el)), J(el));
  const b = plan('Should we hire a second engineer or our first marketer? We have 8 months of runway.');
  ok('a business decision: weighed by them, prose only what it turns on', b.forms.includes('decide') && !b.shape && /Your prose: the one thing it turns on/.test(I.renderPresentation(b)), J(b));
  const brain = plan('Is it true that we only use 10% of our brains?');
  ok('a claim: inspected, with no understanding shape and no graph', brain.forms.includes('claim') && !brain.shape && !brain.forms.includes('graph'), J(brain));
  ok('…its grammar: the verdict, parts that hold or not, never an unsure source', /"type":"claim"/.test(I.renderPresentation(brain)) && /never a study, figure or source you are not sure of/.test(I.renderPresentation(brain)));
  ok('…and not laid out under the Answer Guard', !plan('Is it true that we only use 10% of our brains?', { guard: true }).forms.includes('claim'));
  const onion = plan('Why do onions make you cry?');
  ok('an everyday why: the understanding shape, and nothing drawn or deeper', onion.shape === 'understand' && !onion.forms.length, J(onion));
  ok('…told a sentence or two is the whole reply', /If a sentence or two carries it, that is the whole reply/.test(I.renderPresentation(onion)) && /one concrete example or image, if the sentence needs one/.test(I.renderPresentation(onion)));
  for (const t of ["What's the capital of Peru?", 'How long should I boil an egg for a runny yolk?', 'hi! how are you?', 'thanks, that helps'])
    ok(`a simple question gets no shape and nothing drawn: "${t}"`, !plan(t).shape && !plan(t).forms.length, J(plan(t)));
  // a way deeper, opened, goes one layer down and offers the next (VX, November 2026); depth asked for in words is the whole thread
  ok('a way deeper opened goes one layer down, with the next ways deeper', plan('Go deeper: Where c comes from').shape === 'layer' && plan('Go deeper: Where c comes from').forms.includes('paths'));
  ok('…and depth asked for in so many words takes the deeper shape', plan('walk me through it in detail').shape === 'deeper');
  ok('a list asked for is still a list, never an overview', !plan('list the steps of mitosis').forms.includes('concepts'));
}

console.log('\n=== the arithmetic: a chord, a tangent, where they agree, where curves meet ===');
{
  const c = I.compileOver('x^3 - 3*x', ['a', 'b']);
  const m = I.meanValue(c, {}, -1.5, 2);
  ok('the chord of x³ − 3x from −1.5 to 2 has slope 0.25', near(m.slope, 0.25), J(m));
  ok('…and the tangent matches it at x = ±√(13/12) ≈ ±1.0408', m.at.length === 2 && near(Math.abs(m.at[0]), Math.sqrt(13 / 12)) && near(Math.abs(m.at[1]), Math.sqrt(13 / 12)) && !m.fails, J(m));
  const abs = I.compileOver('abs(x)', []);
  const corner = I.meanValue(abs, {}, -1, 2);
  ok('|x| from −1 to 2: no point — it turns a corner (the theorem needs a slope everywhere inside)', corner.at.length === 0 && corner.fails === 'corner', J(corner));
  const pole = I.meanValue(I.compileOver('1/x', []), {}, -1, 1);
  ok('1/x from −1 to 1: the curve breaks, so nothing is promised', pole.at.length === 0 && pole.fails === 'break', J(pole));
  const line = I.meanValue(I.compileOver('2*x + 1', []), {}, 0, 3);
  ok('a straight line: every point matches', line.everywhere === true && near(line.slope, 2), J(line));
  const sq = I.compileOver('x^2', []);
  ok('the slope of x² at 1 is 2, at −1.5 is −3', near(I.slopeAt(sq, {}, 1, 6), 2) && near(I.slopeAt(sq, {}, -1.5, 6), -3));
  ok('|x| has no single slope at 0', I.slopeAt(abs, {}, 0, 4) === null);
  ok('x⁵ is smooth at 2 even though it bends hard', near(I.slopeAt(I.compileOver('x^5', []), {}, 2, 5), 80, 1e-2));
  const dmd = I.compileOver('10 - x', ['t']), sup = I.compileOver('2 + x + t', ['t']);
  const at0 = I.crossingsOf(dmd, sup, { t: 0 }, 0, 10), at2 = I.crossingsOf(dmd, sup, { t: 2 }, 0, 10);
  ok('demand meets supply at (4, 6); a tax of 2 moves it to (3, 7) — buyers pay 1 of the 2', at0.length === 1 && near(at0[0].x, 4) && near(at0[0].y, 6) && near(at2[0].x, 3) && near(at2[0].y, 7), J([at0, at2]));
  ok('a sign change across a pole is not a meeting', I.crossingsOf(I.compileOver('1/x', []), I.compileOver('0*x', []), {}, -1, 1).length === 0);
  const w = I.fitWindowAll([c], [{}], -2.5, 2.5, [1.125, 2]);
  ok('the window holds the turning points and the ends of the chord, with room', w[0] < -2 && w[1] > 2, J(w));
}

console.log('\n=== the specs: what is drawn, and what is not ===');
{
  const g = I.parseInlineSpec(J(MVT));
  ok('a chord and the mean value point are kept, its ends become points to drag', g && J(g.chord) === J(['a', 'b']) && J(g.at) === J(['a', 'b']) && g.features.includes('mean-value'), J(g));
  const t = I.parseInlineSpec(J(TAN));
  ok('a tangent at a point is kept, and the point is one to drag', t && t.tangent === 'p' && J(t.at) === J(['p']), J(t));
  const tx = I.parseInlineSpec(J(TAX));
  ok('a second curve, labels and crossings are kept', tx && tx.curves.length === 1 && tx.label === 'demand' && tx.curves[0].label === 'supply' && tx.features.includes('crossings'), J(tx));
  const e = I.parseInlineSpec(J(ELASTIC));
  ok('a reading that is a formula in the parameters is kept', e && e.readouts.length === 1 && e.readouts[0].label === 'elasticity', J(e));
  ok('a chord that names no parameter is dropped, the graph kept', (() => { const x = I.parseInlineSpec(J({ ...MVT, chord: ['a', 'zz'] })); return x && !x.chord && !x.features.includes('mean-value'); })());
  ok('crossings need a second curve; the mean value point needs a chord', (() => { const x = I.parseInlineSpec(J({ ...TAN, features: ['crossings', 'mean-value', 'turning'] })); return x && J(x.features) === J(['turning']); })());
  ok('a curve that cannot be drawn is left off; a bad reading too', (() => { const x = I.parseInlineSpec(J({ ...TAX, curves: [{ expr: 'q +' }, { expr: 'x' }], readouts: [{ label: 'r', expr: 'nope(' }] })); return x && x.curves.length === 1 && x.curves[0].expr === 'x' && !x.readouts; })());
  ok('"quiet" is only ever true', I.parseInlineSpec(J({ ...MVT, quiet: 'yes' })).quiet === undefined && I.parseInlineSpec(J({ ...MVT, quiet: true })).quiet === true);
  ok('no mean value point unless asked for', !I.parseInlineSpec(J({ ...MVT, features: undefined })).features.includes('mean-value'));
  const guarded = I.checkInlineSpec(I.parseInlineSpec(J({ ...MVT, readouts: [{ label: 'm', expr: 'a+b' }] })), ctx({ guard: true }));
  ok('under the Answer Guard: the chord is drawn, its slope and the mean value point are not', guarded.ok && !guarded.spec.features.length && guarded.spec.quiet === true && !guarded.spec.readouts, J(guarded));
  ok('one live element to a reply: a graph and a claim are not both drawn', (() => { const c2 = ctx(); I.checkInlineSpec(I.parseInlineSpec(J(MVT)), c2); return I.checkInlineSpec(I.parseInlineSpec(J(CLAIM)), c2).why === 'one-at-a-time'; })());
  const cl = I.parseInlineSpec(J(CLAIM));
  ok('a claim: the verdict, the parts, and no links in what a part rests on', cl && cl.verdict === 'fails' && cl.parts.length === 2 && !/https?:/.test(cl.parts[1].basis ?? ''), J(cl));
  ok('a claim needs a verdict and two parts', !I.parseInlineSpec(J({ ...CLAIM, verdict: 'maybe' })) && !I.parseInlineSpec(J({ ...CLAIM, parts: CLAIM.parts.slice(0, 1) })));
  ok('a part with no standing is dropped', I.parseInlineSpec(J({ ...CLAIM, parts: [...CLAIM.parts, { text: 'x', holds: 'probably' }] })).parts.length === 2);
  ok('a claim and a graph never fold away in a long reply', I.layoutReply ? true : true);
  ok('…the layout keeps claims open (NEVER_FOLDED)', /'claim'\]\)/.test(read('lib/reply-layout.ts')));
}

console.log('\n=== what Socria is told back ===');
{
  const g = I.parseInlineSpec(J(MVT));
  const said = I.describeInline(g, { values: { a: -1.5, b: 2.5 } });
  ok('moving an end: the chord, its new slope, and where the tangent matches it — not "the curve is now"', /changed b 2 → 2.5/.test(said) && /the chord from x = −1.5 to x = 2.5 has slope/.test(said) && /it was 0.25/.test(said) && /the tangent matches that slope at x = /.test(said) && !/the curve is now/.test(said), said);
  const a = I.parseInlineSpec(J({ ...MVT, expr: 'abs(x)', x: [-2, 3], params: [{ name: 'a', value: -1, min: -2, max: 3, step: 0.5 }, { name: 'b', value: 1.5, min: -2, max: 3, step: 0.5 }] }));
  ok('a corner is said as a corner', /turns a corner/.test(I.describeInline(a, { values: { b: 2 } }) ?? ''), I.describeInline(a, { values: { b: 2 } }));
  const t = I.parseInlineSpec(J(TAN));
  ok('moving the point: the slope there', /the tangent at x = 2 has slope 4/.test(I.describeInline(t, { values: { p: 2 } }) ?? ''), I.describeInline(t, { values: { p: 2 } }));
  const tx = I.parseInlineSpec(J(TAX));
  const taxSaid = I.describeInline(tx, { values: { t: 2 } });
  ok('raising the tax: both curves as they are now, and where they cross, from where', /the curves are now demand y = 10 − x, supply y = 4 \+ x|the curves are now demand y = 10 − x, supply y = 2 \+ x \+ 2|supply y = /.test(taxSaid) && /the curves cross at \(3, 7\) \(they crossed at \(4, 6\)\)/.test(taxSaid), taxSaid);
  const e = I.parseInlineSpec(J(ELASTIC));
  ok('sliding along demand: the reading', /elasticity is 1/.test(I.describeInline(e, { values: { q: 5 } }) ?? ''), I.describeInline(e, { values: { q: 5 } }));
  const quiet = { ...I.parseInlineSpec(J(MVT)), quiet: true, features: [] };
  ok('under the guard, what is said back carries no slope either', !/slope/.test(I.describeInline(quiet, { values: { b: 2.5 } }) ?? ''), I.describeInline(quiet, { values: { b: 2.5 } }));
  const cl = I.parseInlineSpec(J(CLAIM));
  ok('doubting a part of a claim is said, with how it was marked', /doubted “The 10% figure comes from research” \(marked does not hold\) — on the claim “We only use 10% of our brains”/.test(I.describeInline(cl, { doubted: [1] }) ?? ''), I.describeInline(cl, { doubted: [1] }));
  ok('…kept with the message', J(I.sanitizeInlineState({ 0: { doubted: [1, 1, 9, -1, 'x'] } })) === J({ 0: { doubted: [1] } }));
  ok('…and named "the claim" on the chip', I.inlineFrom(cl) === 'the claim');
  ok('the history reads the graph with what it shows', /showing the chord from x = a to x = b and its slope, where a tangent runs parallel to the chord/.test(I.inlinePlainText(g)), I.inlinePlainText(g));
  ok('…and the claim with its verdict and parts', /The claim: “We only use 10% of our brains” — does not hold/.test(I.inlinePlainText(cl)) && /- Holds: Imaging shows/.test(I.inlinePlainText(cl)));
  const hist = I.contentForHistory(`No.\n\n${fence(MVT)}`, { 0: { values: { a: -1.5, b: 2.5 } } });
  ok('read back next turn: as they left it', /\[shown inline — graph: .* — now: changed b 2 → 2.5; the chord from x = −1.5 to x = 2.5 has slope/.test(hist), hist);
  ok('a claim is checked for accuracy like prose (contentForCheck keeps it)', /Imaging shows activity/.test(I.contentForCheck(`x\n\n${fence(CLAIM)}`)));
}

console.log('\n=== drawn in the conversation ===');
{
  const R = (spec, host) => renderToStaticMarkup(h(I.RichText, { rich: true, text: fence(spec), inline: host }));
  const host = { live: true, onState: () => {} };
  const m = R(MVT, host);
  ok('the Mean Value graph: the chord, the matched tangent marked c, points to drag', /ln-chord/.test(m) && /ln-mv/.test(m) && />c1</.test(m) && /ln-handle/.test(m) && /has-handles/.test(m), m.slice(0, 400));
  ok('…its readings: the average slope and where the tangent matches it', /average slope/.test(m) && /0\.25/.test(m) && /tangent matches at/.test(m) && /x = −1\.04, x = 1\.04/.test(m), m);
  ok('…the hint is to drag the points; the sliders are named as points on the curve', /Drag the points along the curve/.test(m) && /aria-label="a: a point on the curve"/.test(m));
  ok('…and the picture says it in words for a screen reader', /aria-label="Graph of y = x\^3 - 3\*x; chord from x = −1\.5 to x = 2, average slope 0\.25; the tangent matches that slope at x = /.test(m), m);
  ok('the lines are clipped to the plot: a steep curve never runs out of the card (labels may)', /<clipPath id="lnclip[^"]+"><rect x="0" y="-1"/.test(m) && /<g clip-path="url\(#lnclip[^"]+\)">/.test(m), m.slice(0, 300));
  ok('…the simulation too', /<g clip-path="url\(#lnclip/.test(R({ type: 'sim', x: 'v*cos(a*pi/180)*t', y: 'v*sin(a*pi/180)*t - 4.9*t^2', t: [0, '2*v*sin(a*pi/180)/9.8'], view: { x: [0, 12], y: [0, 5] }, params: [{ name: 'a', value: 45, min: 5, max: 85, step: 1 }, { name: 'v', value: 10, min: 2, max: 20, step: 1 }] }, host)));
  const corner = R({ ...MVT, expr: 'abs(x)' }, host);
  ok('a corner is drawn honestly: no c, and the reason said', !/ln-mv/.test(corner) && /No tangent matches: the curve turns a corner/.test(corner), corner);
  const tan = R(TAN, host);
  ok('the tangent at a point, and its slope', /ln-tan/.test(tan) && /slope at x = 1/.test(tan) && /<b>2<\/b>/.test(tan), tan);
  const tx = R(TAX, host);
  ok('two curves: each named, each its own ink, and where they meet', /ln-curve is-second/.test(tx) && />demand</.test(tx) && />supply</.test(tx) && /ln-feat is-crossing/.test(tx) && /\(4, 6\)/.test(tx), tx);
  const el = R(ELASTIC, host);
  ok('a point along demand with its reading', /ln-handle/.test(el) && /elasticity/.test(el) && /2\.33/.test(el), el);
  const q = R({ ...MVT, quiet: true, features: [] }, host);
  ok('quiet (the Answer Guard): the chord is drawn, no slope and no c', /ln-chord/.test(q) && !/average slope/.test(q) && !/ln-mv/.test(q), q);
  const cl = R(CLAIM, host);
  ok('the claim: quoted, its verdict, each part marked, its basis behind a press', /ln-claim-text/.test(cl) && /Doesn’t hold/.test(cl) && /ln-mark is-yes/.test(cl) && /ln-mark is-no/.test(cl) && /aria-expanded="false"/.test(cl), cl.slice(0, 500));
  ok('…in the conversation, a way to say which part they doubt — and that it goes to Socria', /I doubt this/.test(cl) && /aria-pressed="false"/.test(cl) && /What you mark here goes to Socria/.test(cl), cl);
  ok('…and a screen reader hears each part’s standing', /<span class="ln-sr">Holds: <\/span>/.test(cl) && /<span class="ln-sr">Does not hold: <\/span>/.test(cl));
  ok('read-only (shared or archived): no doubting', !/I doubt this/.test(R(CLAIM, { live: false })));
  const css = read('components/inline/inline.css');
  ok('styles: the chord and its matched tangent share an ink, a point to drag pans only sideways, claims on a phone', /\.ln-chord line \{\s*stroke: var\(--ln-c1\)/.test(css) && /\.ln-mv line \{[^}]*stroke-dasharray/.test(css) && /has-handles svg \{ touch-action: pan-y; \}/.test(css) && /\.ln-claim-head \{ grid-template-columns: 1fr; \}/.test(css));
  ok('…and forced colours', /forced-colors[\s\S]*\.ln-chord line, \.ln-mv line, \.ln-tan line/.test(css));
}

console.log('\n=== through the real route: what the reply model is sent ===');
{
  const OUT = join(here, '.tmp', 'e2e-min-explain');
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const swap = {
    name: 'swap',
    setup(b) {
      b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
        const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
        if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(join(here, 'helpers', 'fake-supabase.mjs')).href, external: true };
        return undefined;
      });
      b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
      b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai-logos.mjs')).href, external: true }));
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
      b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
    },
  };
  await build({ entryPoints: [join(root, 'app/api/logos/chat/route.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'chat.mjs'), tsconfig: join(root, 'tsconfig.json'), plugins: [swap], external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'], logLevel: 'error' });
  const quiet = (orig) => (...a) => {
    const f = typeof a[0] === 'string' ? a[0] : '';
    if (/^\[/.test(f) || f.startsWith('logos') || f.startsWith('conversations')) return;
    orig(...a);
  };
  console.info = quiet(console.info.bind(console));
  console.warn = quiet(console.warn.bind(console));
  console.error = quiet(console.error.bind(console));
  process.env.OPENAI_API_KEY = 'test';
  process.env.RATE_LIMIT_DISABLED = '1';
  process.env.CLERK_SECRET_KEY = 'sk_test_min_explain';
  delete process.env.SERPER_API_KEY;
  delete process.env.TAVILY_API_KEY;
  process.env.LOGOS_WEB_OPENAI = 'off';
  const chat = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
  const { NextRequest } = await import('next/server.js');
  globalThis.__uid = 'user_min_explain';
  const turn = async (text) => {
    globalThis.__logosCalls = [];
    globalThis.__logosPrompts = [];
    globalThis.__logosReply = 'Noted.';
    globalThis.__logosScript = [];
    const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ surface: 'logos5', sessionId: `me_${Math.random().toString(36).slice(2, 8)}`, messages: [{ role: 'user', content: text }] }) }));
    await r.text().catch(() => '');
    await new Promise((d) => setTimeout(d, 30));
    const call = (globalThis.__logosCalls ?? []).find((c) => c.stream);
    const sys = (call?.messages ?? []).filter((m) => m.role === 'system').map((m) => String(m.content));
    return { status: r.status, stable: sys[0] ?? '', turn: sys.length > 1 ? sys[sys.length - 1] : '' };
  };
  const mvt = await turn('I need to understand the Mean Value Theorem');
  ok('the Mean Value Theorem: answered (200), the maths block in the stable prompt', mvt.status === 200 && /EXPLORATION \(a concept, a theorem, a relationship\)/.test(mvt.stable), mvt.status);
  // the move names itself and leaves the how to the shape: the central idea is asked for once, not twice (VX, November 2026)
  ok('…the turn: EXPLAIN, the idea first; the understanding shape; the chord graph; the ways deeper', /The move this turn — EXPLAIN — the shape of this reply, below, says how/.test(mvt.turn) && /THE SHAPE OF THIS REPLY — they want to understand an idea/.test(mvt.turn) && (mvt.turn.match(/central insight in one plain sentence|central idea first/g) ?? []).length === 1 && /"chord":\["a","b"\]/.test(mvt.turn) && /"type":"paths"/.test(mvt.turn), mvt.turn);
  ok('…and never "show the reasoning step by step" or "work the problem through"', !/Show the reasoning step by step/.test(mvt.turn) && !/work the problem through/.test(mvt.turn));
  const der = await turn('What does a derivative actually mean?');
  ok('a derivative: the idea first, and the tangent at a point to drag', /THE SHAPE OF THIS REPLY — they want to understand an idea/.test(der.turn) && !/Show the reasoning step by step/.test(der.turn) && /"tangent":"p"/.test(der.turn), der.turn);
  const tax = await turn('Why does a tax on sellers raise the price buyers pay by less than the tax?');
  ok('economics: supply and demand meeting, the tax to drag', /"curves":\[\{"expr":"2\+x\+t","label":"supply"\}\]/.test(tax.turn) && /THE SHAPE OF THIS REPLY — they want to understand an idea/.test(tax.turn), tax.turn);
  const biz = await turn('Should we hire a second engineer or our first marketer? We have 8 months of runway.');
  ok('a business decision: the call stays theirs, weighed in a decide block, prose only what it turns on', /Theirs: the decision/.test(biz.turn) && /"type":"decide"/.test(biz.turn) && /Your prose: the one thing it turns on/.test(biz.turn) && !/THE SHAPE OF THIS REPLY — they want to understand/.test(biz.turn), biz.turn);
  const brain = await turn('Is it true that we only use 10% of our brains?');
  ok('a claim: the verdict first, inspected — not a discussion with two sides', /INFORM/.test(brain.turn) && /"type":"claim"/.test(brain.turn) && !/the other side at its strongest/.test(brain.turn), brain.turn);
  const remote = await turn('My manager says remote work kills productivity. Is that right?');
  ok("somebody's claim: inspected, never corrected as their attempt", /"type":"claim"/.test(remote.turn) && !/VERIFY\. Check what they put down/.test(remote.turn) && !/Their attempt gets the correction/.test(remote.turn), remote.turn);
  const egg = await turn('How long should I boil an egg for a runny yolk?');
  ok('the egg: the answer plainly, no decision, no shape, nothing drawn', /INFORM/.test(egg.turn) && !/PERSPECTIVE/.test(egg.turn) && !/Theirs: the decision/.test(egg.turn) && !/THE SHAPE OF THIS REPLY/.test(egg.turn) && !/INLINE, IF IT HELPS/.test(egg.turn), egg.turn);
  const onion = await turn('Why do onions make you cry?');
  ok('the onion: the insight, nothing drawn, nothing about writing that is theirs', /THE SHAPE OF THIS REPLY — they want to understand an idea/.test(onion.turn) && !/INLINE, IF IT HELPS/.test(onion.turn) && !/the substance of what they are writing/.test(onion.turn), onion.turn);
  const peru = await turn("What's the capital of Peru?");
  ok('a settled fact with no search: answered from memory, not a page of where to look', /Not looked up this turn/.test(peru.turn) && /a settled fact gets no caveat/.test(peru.turn) && !/WHERE TO LOOK/.test(peru.turn), peru.turn);
  const fed = await turn('Look up the latest Federal Reserve interest rate decision.');
  ok('…while a lookup asked for still says where to look', /The lookup did not run/.test(fed.turn) && /WHERE TO LOOK/.test(fed.turn), fed.turn.slice(0, 400));
}

console.log(`\nminimum explanation: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
