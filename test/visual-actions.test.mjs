// VISUAL ACTIONS — the conversation and the picture as one system (Logos 6, November 2026; lib/visual, docs/VISUAL-ACTIONS.md).
//
// What is held down:
//   • every part Socria draws has a stable identity read from what it IS (a label, a role), never from where it is
//     drawn; it survives an edit that keeps it; each says what it is, what it is called, and what can be done to it;
//   • an action is data, checked against the artifact as it stands before anything moves: the operation, the parts
//     (that they exist), the numbers (in range, on their step), the change (a change, never onto an undefined state);
//     a reply's marker is read strictly, and nothing in it can run;
//   • motion follows the model: every frame a state the model can be in (whole rectangles, a secant that never meets
//     its tangent's point), and none under reduced motion;
//   • a person's words are acted on only when they ask, against what is on screen: the part they name, the one they
//     selected, the one they last touched; two that fit equally are asked about, never guessed; a mistake that is not
//     marked is never invented; a change is worked out on the model (demand shifts right, supply rises by moving down);
//   • Socria is told what is on screen (the catalogue) and what happened (the note), as words it reads, clipped;
//   • the acceptance scenarios A–I hold on the pure core here, and in the real app (.mock-ui/va.mjs, not in CI).

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import * as I from './.tmp/inline-under-test.mjs';

const { VE, VA, VI, VC } = I;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = JSON.stringify;
const S = (o) => I.sanitizeInlineSpec(o);
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const quiet = (f) => { const e = console.error; console.error = () => {}; try { return f(); } finally { console.error = e; } };

const MARKET = { type: 'graph', title: 'Market for coffee', expr: '10 - x + d', label: 'Demand', curves: [{ expr: '2 + x + c', label: 'Supply' }], x: [0, 10], params: [{ name: 'd', label: 'demand shift', value: 0, min: -3, max: 6, step: 0.5 }, { name: 'c', label: 'cost shift', value: 0, min: -4, max: 4, step: 0.5 }], features: ['crossings'] };
const SECANT = { type: 'graph', title: 'Secant to tangent', expr: 'x^2', x: [0, 4], params: [{ name: 'a', label: 'a', value: 2, min: 0, max: 4, step: 0.01 }, { name: 'b', label: 'b', value: 3.5, min: 0, max: 4, step: 0.01 }], chord: ['a', 'b'], tangent: 'a', animate: { param: 'b', to: 2 } };
const RIEMANN = { type: 'graph', title: 'Midpoint sums for x²', expr: 'x^2', x: [0, 2.2], params: [{ name: 'n', label: 'rectangles', value: 4, min: 1, max: 64, step: 1 }], area: { from: 0, to: 2, rects: { n: 'n', rule: 'mid' } }, animate: { param: 'n', to: 64 } };
const MONOPOLY = { type: 'graph', title: 'A monopolist’s choice', expr: '20 - 2*x', label: 'MR', curves: [{ expr: '20 - x', label: 'Demand' }, { expr: '2 + x', label: 'MC' }], x: [0, 12], params: [], features: ['crossings'] };
const SEARCH = { type: 'trace', title: 'Binary search for 23', kind: 'array', steps: [{ cells: ['2', '5', '8', '12', '16', '23', '38'], pointers: { lo: 0, hi: 6, mid: 3 }, mark: [3], note: 'Middle is 12; 23 is bigger, so drop the left half.' }, { cells: ['2', '5', '8', '12', '16', '23', '38'], pointers: { lo: 4, hi: 6, mid: 5 }, mark: [5], done: [0, 1, 2, 3], note: 'Middle is 23: found it.' }] };
const scene = (...pairs) => ({ artifacts: pairs.map(([key, raw, values]) => { const spec = S(raw); return { ...VE.visualArtifact(key, spec, values ? { values } : undefined), spec, values: values ?? Object.fromEntries((spec.params ?? []).map((p) => [p.name, p.value])) }; }), selection: null, active: null });

console.log('\n=== every part has an identity, from what it is ===');
{
  const m = VE.elementsOf(S(MARKET)).map((e) => e.id);
  ok('a market: its curves by name, where they meet, its parameters', J(m) === J(['curve:demand', 'curve:supply', 'point:equilibrium', 'param:d', 'param:c']), J(m));
  const edited = VE.elementsOf(S({ ...MARKET, params: [{ ...MARKET.params[0], value: 2 }, MARKET.params[1]], title: 'Coffee, after the frost' })).map((e) => e.id);
  ok('…the same ids after an edit that keeps the parts (a value changed, a new title)', J(edited) === J(m));
  const more = VE.elementsOf(S({ ...MARKET, curves: [...MARKET.curves, { expr: '6', label: 'Price ceiling' }] })).map((e) => e.id);
  ok('…and after a part is added: the others keep theirs', ['curve:demand', 'curve:supply', 'point:equilibrium'].every((id) => more.includes(id)) && more.includes('curve:price-ceiling'), J(more));
  const demand = VE.elementsOf(S(MARKET))[0];
  ok('a part says what it is, what it is called, its facts and what can be done to it', demand.kind === 'curve' && demand.label === 'Demand' && demand.words.includes('demand curve') && demand.meta.expr === '10 - x + d' && demand.ops.includes('highlight') && demand.ops.includes('compare'));
  const mono = VE.elementsOf(S(MONOPOLY));
  ok('a monopoly: MR and MC by both their names; where they meet is MR = MC', mono.find((e) => e.id === 'curve:mr').words.includes('marginal revenue') && mono.find((e) => e.id === 'curve:mc').words.includes('marginal cost') && mono.some((e) => e.id === 'point:mr-mc'));
  const sec = VE.elementsOf(S(SECANT));
  const tan = sec.find((e) => e.id === 'line:tangent'), chord = sec.find((e) => e.id === 'line:secant');
  ok('a secant and a tangent, with their slopes as they are now', near(tan.meta.slope, 4, 1e-6) && near(chord.meta.slope, 5.5, 1e-9), J([tan.meta, chord.meta]));
  const rie = VE.elementsOf(S(RIEMANN), { values: { n: 64 } });
  const rects = rie.find((e) => e.id === 'region:rectangles');
  ok('Riemann rectangles: how many, their total, the exact area', rects.meta.n === 64 && near(rects.meta.sum, 2.66650390625) && near(rects.meta.exact, 8 / 3), J(rects.meta));
  ok('a trace: its steps (ordinal names) and its cells', VE.elementsOf(S(SEARCH)).filter((e) => e.kind === 'step').map((e) => e.id).join() === 'step:1,step:2' && VE.elementsOf(S(SEARCH)).find((e) => e.id === 'step:2').words.includes('second step') && VE.elementsOf(S(SEARCH)).some((e) => e.id === 'cell:6'));
  const forces = VE.elementsOf(S({ type: 'vectors', title: 'Forces', vectors: [{ label: 'Weight', mag: 50, angle: 270 }, { label: 'Normal', mag: 'w', angle: 90 }], params: [{ name: 'w', label: 'normal force', value: 50, min: 0, max: 100, step: 1 }] }));
  ok('forces: each by its name, their sum by every name it goes by, the parameter', forces.some((e) => e.id === 'vector:weight') && forces.find((e) => e.id === 'vector:sum').words.includes('net force') && forces.some((e) => e.id === 'param:w'));
  ok('a diagram, a sequence, a simulation, an equation: their parts', VE.elementsOf(S({ type: 'diagram', view: 'flow', nodes: [{ id: 'g', label: 'Glycolysis' }, { id: 'k', label: 'Krebs cycle' }, { id: 'e', label: 'Electron transport' }], edges: [['g', 'k'], ['k', 'e']] })).map((e) => e.id).join() === 'node:g,node:k,node:e,edge:g>k,edge:k>e' && VE.elementsOf(S({ type: 'sequence', kind: 'timeline', items: [{ label: 'Storming of the Bastille', when: '1789' }, { label: 'Terror', when: '1793' }, { label: 'Napoleon', when: '1799' }] }))[1].id === 'item:2' && VE.elementsOf(S({ type: 'sim', title: 'Throw', x: 'v*cos(a)*t', y: 'v*sin(a)*t-4.9*t^2', t: [0, '2*v*sin(a)/9.8'], view: { x: [0, 40], y: [0, 20] }, params: [{ name: 'v', label: 'speed', value: 15, min: 5, max: 20, step: 1 }, { name: 'a', label: 'angle', value: 0.8, min: 0.2, max: 1.4, step: 0.05 }] }))[0].id === 'path:trajectory');
  ok('a chart has no parts to point at (its renderer does not light them: no action that does nothing)', VE.elementsOf(S({ type: 'chart', kind: 'bar', x: ['a', 'b'], series: [{ name: 'Sales', values: [1, 2] }], basis: 'examples' })).length === 0);
  const quiz = VE.quizArtifact('quiz:q', 'Monopoly pricing', [{ n: 4, topic: 'MR = MC', outcome: 'wrong', yours: 'P = MC', correct: 'MR = MC' }]);
  ok('a quiz\'s review: each question, and the answer given, marked wrong where it was', quiz.elements.map((e) => e.id).join() === 'question:4,question:4/yours' && quiz.elements[1].meta.wrong === true);
  ok('found by id, or by the words of its name when the id was spelled another way', VE.findElement({ elements: mono }, 'curve:marginal-revenue')?.id === 'curve:mr' && VE.findElement({ elements: mono }, 'curve:nothing') === null);
}

console.log('\n=== an action is data, checked before anything moves ===');
{
  const m = VA.parseVisHref('vis:animate/param:d?to=3');
  ok('a marker read: the operation, the part, the number', m?.op === 'animate' && m.targets[0] === 'param:d' && m.to === 3);
  ok('several parts with +; a step by number', J(VA.parseVisHref('vis:highlight/curve:mr+curve:mc').targets) === J(['curve:mr', 'curve:mc']) && VA.parseVisHref('vis:step?step=2').step === 2);
  ok('read strictly: not an operation, a script, a stray scheme — nothing', ['vis:rm/x', 'javascript:alert(1)', 'vis:highlight/curve:a<b', 'vis:highlight/curve:demand?to=1;alert(1)', 'http://x.y'].every((h) => VA.parseVisHref(h) === null));
  ok('written back as it was read', VA.visHref(VA.parseVisHref('vis:animate/param:d?to=3')) === 'vis:animate/param:d?to=3');
  const art = VE.visualArtifact('m:0', S(MARKET));
  ok('a part that is not there: refused, saying so', VA.checkAction({ op: 'highlight', targets: ['curve:tax'] }, art).ok === false && /no tax/.test(VA.checkAction({ op: 'highlight', targets: ['curve:tax'] }, art).why));
  ok('an operation a part does not support: refused', VA.checkAction({ op: 'step', targets: ['curve:demand'] }, art).ok === false);
  const far = VA.checkAction({ op: 'animate', targets: ['param:d'], to: 99 }, art, { d: 0, c: 0 });
  ok('a number out of range: kept inside it, and said', far.ok && far.action.to === 6 && /kept inside/.test(far.note), J(far));
  const snap = VA.checkAction({ op: 'update_parameter', targets: ['param:d'], to: 2.3 }, art, { d: 0, c: 0 });
  ok('…on its step', snap.ok && snap.action.to === 2.5);
  ok('a move that changes nothing: refused', VA.checkAction({ op: 'animate', targets: ['param:d'], to: 0 }, art, { d: 0, c: 0 }).ok === false);
  ok('no number given: refused', VA.checkAction({ op: 'update_parameter', targets: ['param:d'] }, art).ok === false);
  const sec = VE.visualArtifact('s:0', S(SECANT));
  const onto = VA.checkAction({ op: 'animate', targets: ['param:b'], to: 2 }, sec, { a: 2, b: 3.5 });
  ok('a secant\'s ends never meet: one step short, where its slope is still defined', onto.ok && onto.action.to === 2.01, J(onto));
  ok('the tangent moved is its point moved', VA.checkAction({ op: 'animate', targets: ['line:tangent'], to: 1 }, sec, { a: 2, b: 3.5 }).action?.targets[0] === 'param:a');
  const tr = VE.visualArtifact('t:0', S(SEARCH));
  ok('a step that exists: gone to; one that does not: refused', VA.checkAction({ op: 'step', targets: [], step: 2 }, tr).ok && !VA.checkAction({ op: 'step', targets: [], step: 3 }, tr).ok);
  ok('what changes the artifact is kept; what shows it is not', VA.isKept({ op: 'animate', targets: [] }) && VA.isKept({ op: 'step', targets: [] }) && !VA.isKept({ op: 'highlight', targets: ['curve:demand'] }) && !VA.isKept({ op: 'zoom', targets: [] }));
  ok('said, past tense, with the model\'s numbers', VA.actionSaid({ op: 'animate', targets: ['param:d'], to: 2.5 }, art, { d: 0 }) === 'Animated demand shift from 0 to 2.5 on “Market for coffee”.');
}

console.log('\n=== motion follows the model ===');
{
  const frames = Array.from({ length: 41 }, (_, i) => VA.tweenAt(i / 40, 4, 64, { step: 1, min: 1 }));
  ok('a count of rectangles is a whole number at every frame, and only grows', frames.every((n) => Number.isInteger(n)) && frames.every((n, i) => i === 0 || n >= frames[i - 1]) && frames[0] === 4 && frames[40] === 64, J(frames));
  ok('…by ratios: as long from 4 to 16 as from 16 to 64', Math.abs(frames.findIndex((n) => n >= 16) - 20) <= 2, J(frames));
  const b = Array.from({ length: 21 }, (_, i) => VA.tweenAt(i / 20, 3.5, 2.01, { step: 0.01, min: 0 }, true));
  const slopes = b.map((v) => (v * v - 4) / (v - 2));
  ok('the secant closes on the tangent: its slope falls to 4, never past, never undefined', b.every((v) => v > 2) && slopes.every((s, i) => i === 0 || s <= slopes[i - 1] + 1e-9) && near(slopes[20], 4.01, 1e-9), J(slopes.map((s) => s.toFixed(3))));
  ok('…slowing as it closes (an approach)', b[1] - b[2] > b[18] - b[19]);
  ok('long enough to see, never to wait for — and none at all under reduced motion', VA.tweenMs(4, 64, { min: 1, max: 64, step: 1 }) >= 900 && VA.tweenMs(4, 64, { min: 1, max: 64, step: 1 }) <= 3200 && VA.tweenMs(4, 64, { min: 1, max: 64, step: 1 }, { reduced: true }) === 0);
  ok('an approach is known from the model (toward the secant\'s other end)', VA.isApproach(VE.visualArtifact('s', S(SECANT)), 'b', 2.01) && !VA.isApproach(VE.visualArtifact('s', S(SECANT)), 'b', 3.9));
}

console.log('\n=== a change to play, checked when read ===');
{
  ok('kept: its parameter, inside its range, on its step', J(S(RIEMANN).animate) === J({ param: 'n', to: 64 }) && S({ ...RIEMANN, animate: { param: 'n', to: 999 } }).animate.to === 64);
  ok('a secant\'s end is never played onto the other end', S(SECANT).animate.to === 2.01);
  ok('dropped: no such parameter, not a number, or no change', !S({ ...RIEMANN, animate: { param: 'q', to: 3 } }).animate && !S({ ...RIEMANN, animate: { param: 'n', to: 'lots' } }).animate && !S({ ...RIEMANN, animate: { param: 'n', to: 4 } }).animate);
  ok('forces and simulations carry one too', !!S({ type: 'vectors', vectors: [{ label: 'F', mag: 'f', angle: 0 }], params: [{ name: 'f', label: 'force', value: 1, min: 0, max: 10, step: 1 }], animate: { param: 'f', to: 8 } }).animate);
}

console.log('\n=== their words about what is on screen ===');
{
  const sc = scene(['a1:0', MARKET]);
  const A = VI.readVisualAsk('Highlight the demand curve.', sc);
  ok('A: "highlight the demand curve" — that curve, held; nothing new is made', A?.kind === 'act' && A.key === 'a1:0' && J(A.actions) === J([{ op: 'highlight', targets: ['curve:demand'], hold: true }]), J(A));
  const E = VI.readVisualAsk('Show me what happens when demand increases.', sc);
  ok('E: demand increases — its own parameter, moved the way that shifts it right', E?.kind === 'act' && E.actions.some((a) => a.op === 'animate' && a.targets[0] === 'param:d' && a.to > 0), J(E));
  ok('…then where the curves now meet, said with the model\'s numbers', E.actions[E.actions.length - 1].targets[0] === 'point:equilibrium' && /equilibrium moved from \(4, 6\) to \(5\.25, 7\.25\)/.test(E.said), E.said);
  const sup = VI.readVisualAsk('what happens when supply increases?', sc);
  ok('…and an increase in supply shifts it right by moving it DOWN (its cost parameter falls)', sup?.kind === 'act' && sup.actions.some((a) => a.targets[0] === 'param:c' && a.to < 0), J(sup));
  const amb = VI.readVisualAsk('highlight the curve', sc);
  ok('two parts fit equally ("the curve"): asked about, never guessed', amb?.kind === 'ambiguous' && amb.candidates.map((c) => c.id).join() === 'curve:demand,curve:supply', J(amb));
  const F = VI.readVisualAsk('Why did this move?', { ...sc, selection: { key: 'a1:0', id: 'curve:demand' } });
  ok('F: "why did this move?" with a curve selected — that curve, nothing else', F?.kind === 'about' && F.id === 'curve:demand' && F.key === 'a1:0', J(F));
  ok('a question that only names a part is left to Socria', VI.readVisualAsk('what is the demand curve?', sc) === null && VI.readVisualAsk('tell me about elasticity', sc) === null);
  ok('nothing on screen: nothing read', VI.readVisualAsk('highlight the demand curve', { artifacts: [] }) === null);
  const two = scene(['a5:0', MONOPOLY], ['a1:0', MARKET]);
  ok('two graphs with a demand curve: the one they last touched', VI.readVisualAsk('Highlight the demand curve.', { ...two, active: 'a1:0' }).key === 'a1:0' && VI.readVisualAsk('Highlight the demand curve.', two).key === 'a5:0');
  ok('…a change goes to the one that can move', VI.readVisualAsk('Show me what happens when demand increases.', two).key === 'a1:0');
  ok('…and the one their words name ("on the coffee graph")', VI.readVisualAsk('highlight the demand curve on the coffee graph', two).key === 'a1:0');
  const st = VI.readVisualAsk('Show me the second step of binary search.', scene(['a4:0', SEARCH], ['a1:0', MARKET]));
  ok('"the second step of binary search": that trace, step 2', st?.kind === 'act' && st.key === 'a4:0' && st.actions[0].op === 'step' && st.actions[0].step === 2, J(st));
  const more = VI.readVisualAsk('more rectangles please', scene(['a3:0', RIEMANN]));
  ok('"more rectangles": the count doubled', more?.actions?.[0]?.to === 8, J(more));
  const flat = VI.readVisualAsk('make the tangent line flatter', scene(['a2:0', SECANT]));
  ok('"make the tangent flatter": moved along the curve to where its slope is nearer 0', flat?.kind === 'act' && flat.actions.some((a) => a.targets[0] === 'param:a' && a.to < 1.05), J(flat));
  const top = VI.readVisualAsk('Show me what happens when demand increases.', scene(['a1:0', MARKET, { d: 6, c: 0 }]));
  ok('at the end of its range: said, not faked', top?.kind === 'cannot' && /top of its range/.test(top.said), J(top));
  ok('reset, pause, replay: the artifact as a whole', ['reset', 'pause', 'replay'].every((w, i) => VI.readVisualAsk(['reset it', 'pause the animation', 'play it again'][i], scene(['a3:0', RIEMANN]))?.actions?.[0]?.op === w));
  const mistake = VI.readVisualAsk('Highlight the mistake in my graph.', sc);
  ok('a mistake asked for where none is marked: said, nothing invented', mistake?.kind === 'cannot' && /Nothing on/.test(mistake.said), J(mistake));
  const quiz = { artifacts: [VE.quizArtifact('quiz:q1', 'Monopoly pricing', [{ n: 2, topic: 'Costs', outcome: 'right', yours: 'B', correct: 'B' }, { n: 4, topic: 'MR = MC', outcome: 'wrong', yours: 'P = MC', correct: 'MR = MC' }])] };
  const G = VI.readVisualAsk("Highlight question 4's incorrect step.", quiz);
  ok('G: question 4\'s incorrect step — the question and the answer that went wrong, shown, not edited', G?.kind === 'act' && J(G.actions[0].targets) === J(['question:4', 'question:4/yours']) && G.actions[0].op === 'focus', J(G));
  ok('…a question answered right has no incorrect step to show: said', /answered correctly/.test(VI.readVisualAsk("Highlight question 2's incorrect step.", quiz).said));
}

console.log('\n=== what Socria is told ===');
{
  const n = VC.sanitizeVisNote({ done: ['Highlighted Demand on “Market”.', 42, '[x]'.repeat(200)], sel: 'Demand (curve:demand) on “Market”', changes: ['n went from 4 to 20 (moved by them).'], ask: 'Demand or Supply', extra: 'dropped' });
  ok('the note from a browser: shaped, clipped, brackets taken out, nothing else kept', n.done.length === 2 && n.done[1].length <= 220 && !/[[\]]/.test(n.done[1]) && !('extra' in n) && n.sel && n.changes.length === 1);
  const line = VC.visNoteLine(n);
  ok('read as one bracketed line: done (and not to be explained how), selected, changed, ask which', /^\[On screen — Done on screen/.test(line) && /do not explain how/.test(line) && /They had selected Demand/.test(line) && /Changed since they last wrote/.test(line) && /ask which/.test(line), line);
  ok('nothing to say: nothing', VC.sanitizeVisNote({}) === undefined && VC.sanitizeVisNote('x') === undefined);
  const msgs = [
    { id: 'u1', role: 'user', content: 'supply and demand?' },
    { id: 'a1', role: 'assistant', content: 'Here.\n\n```ui\n' + J(MARKET) + '\n```', ui: { 0: { values: { d: 2.5, c: 0 } } } },
    { id: 'a2', role: 'assistant', content: 'Riemann.\n\n```ui\n' + J(RIEMANN) + '\n```', ui: { 0: { values: { n: 20 } } } },
  ];
  const cat = VC.catalogueOf(msgs);
  ok('the catalogue, from the conversation: newest first, each as the person left it', cat.map((a) => a.key).join() === 'a2:0,a1:0');
  const text = VC.visualBlock(cat, false);
  ok('…its parts by exact id, with what matters now: the rectangles against the area, a parameter and its start, where the curves meet', /region:rectangles “midpoint Riemann rectangles”: 20 mid rectangles, total 2\.665 against 2\.6667/.test(text) && /param:d “demand shift” = 2\.5 \(−3 to 6, started 0\)/.test(text) && /point:equilibrium “equilibrium” at \(5\.25, 7\.25\) \(was \(4, 6\)\)/.test(text), text.slice(-700));
  ok('the pointing rule: markers, ids from labels, at most three, never decoration, only parts that exist', /\[the demand curve\]\(vis:highlight\/curve:demand\)/.test(text) && /at most three markers/.test(text) && /never for decoration/.test(text) && /a marker that names nothing is shown as plain words/.test(text) && /"animate": \{"param":"b","to":2\.05\}/.test(text));
  ok('no picture on screen and none offered: no rule at all', VC.visualBlock([], false) === '');
}

console.log('\n=== a reply\'s markers, in its words ===');
{
  const segs = I.splitInline('It sells where [marginal revenue](vis:highlight/curve:mr) meets **cost**.', { code: true });
  ok('read as their own segment, on every surface', segs.some((s) => s.kind === 'vis' && s.text === 'marginal revenue' && s.href === 'vis:highlight/curve:mr') && segs.some((s) => s.kind === 'strong'));
  ok('…even where links are not read (the syntax is never shown)', I.splitInline('see [demand](vis:highlight/curve:demand)').some((s) => s.kind === 'vis'));
  ok('copied and read aloud as their words', I.contentAsText('Where [MR](vis:highlight/curve:mr) meets MC.') === 'Where MR meets MC.' && I.withoutMarkers('[a](vis:focus/point:x) b') === 'a b');
  const html = quiet(() => renderToStaticMarkup(h(I.RichText, { text: 'Where [marginal revenue](vis:highlight/curve:mr) meets cost.', rich: true, math: true })));
  ok('with no picture to point at: the words, and no control', html.includes('marginal revenue') && !/ln-vref/.test(html) && !/vis:/.test(html), html);
}

console.log('\n=== drawn ===');
{
  const words = (s) => s;
  const keyed = quiet(() => renderToStaticMarkup(h(I.InlineBlock, { spec: S(SECANT), open: false, n: 0, renderInline: words, host: { id: 'a2', state: {} } })));
  ok('a change to play has Play, and says what it will show', /class="ln-vplay"/.test(keyed) && />Play</.test(keyed) && /b: 3\.5 → 2\.01/.test(keyed), keyed.slice(0, 200));
  const market = quiet(() => renderToStaticMarkup(h(I.InlineBlock, { spec: S(MARKET), open: false, n: 0, renderInline: words, host: { id: 'a1', state: {} } })));
  ok('a curve\'s name can be pressed to select it ("this"), with what pressing does', /<button[^>]*class="ln-eq-name is-pick"[^>]*aria-pressed="false"[^>]*title="Select Demand, then ask about “this”"/.test(market), market.slice(0, 400));
  const bare = quiet(() => renderToStaticMarkup(h(I.InlineBlock, { spec: S(MARKET), open: false, n: 0, renderInline: words })));
  ok('not addressable (no reply id): no selection, no controls that could do nothing', !/is-pick/.test(bare) && !/ln-vplay/.test(bare));
  ok('a trace has Play beside Back and Next', />Play</.test(quiet(() => renderToStaticMarkup(h(I.InlineBlock, { spec: S(SEARCH), open: false, n: 0, renderInline: words, host: { id: 'a4' } })))));
  const css = read('components/inline/inline.css');
  ok('lit by weight and halo, the rest dimmed — never colour alone; nothing moves under reduced motion; forced colours too', /\.ln-curve\.is-vlit \{ stroke-width: 3\.6/.test(css) && /is-vquiet \{ opacity: 0\.3; \}/.test(css) && /@media \(prefers-reduced-motion: reduce\) \{\n  \.logos-root \.ln :is\(\.ln-curve, \.ln-vring/.test(css) && /forced-colors: active[\s\S]*is-vlit[\s\S]*Highlight/.test(css));
}

console.log('\n=== wired: the app, the route, what is saved ===');
{
  const app = read('components/LogosApp.tsx');
  ok('their message is read against what is on screen before it is sent; what was done goes with it', /const visNow = visualNoteFor\(content\);/.test(app) && /\.\.\.\(visNow \? \{ vis: visNow \} : \{\}\)/.test(app) && /sequence\(ask\.key, ask\.actions, 'you'\)/.test(app) && /takeChanges\(\)/.test(app));
  const route = read('app/api/logos/chat/route.ts');
  ok('the route reads the note as a bracketed line, and puts the catalogue and the rule in this turn\'s context', /visNoteLine\(vis\)/.test(route) && /visualBlock\(catalogueOf\(kept\)/.test(route) && /sanitizeVisNote\(m\.vis\)/.test(route));
  ok('the note is kept with the message, cleaned', /sanitizeVisNote\(m\.vis\)/.test(read('app/api/conversations/route.ts')));
  const msg = read('components/logos5/L5Message.tsx');
  ok('a reply\'s markers know their reply, its elements, and whether it is fresh', /<VisReplyContext\.Provider value=\{visReply\}>/.test(msg) && /Date\.now\(\) - m\.at < 180_000/.test(msg));
  const bus = read('components/inline/visual-bus.ts');
  ok('the bus checks every action, holds emphasis apart from the artifact, numbers commands so a redraw never repeats one', /const c = checkAction\(raw, art, values\);\n  if \(!c\.ok\) return false;/.test(bus) && /seen\.current = vis\.cmd\.n;/.test(bus) && /waiting\.push\(\{ key, action, by, until: Date\.now\(\) \+ 20_000/.test(bus));
  const motion = read('components/inline/visual-motion.ts');
  ok('motion is frame-scheduled, held offscreen, cancelled when the artifact goes, and jumps under reduced motion', /requestAnimationFrame\(tick\)/.test(motion) && /IntersectionObserver/.test(motion) && /useEffect\(\(\) => \(\) => stop\(\), \[\]\)/.test(motion) && /reducedMotion\(\) \|\| ms <= 0/.test(motion));
}

console.log('\n=== asked to see it move: drawn in the reply ===');
{
  const plan = (text) => {
    const signals = I.readSignals(text);
    const state = I.readTurnState({ text, history: [], signals, intent: I.routeTurn({ text }).intent });
    return I.planPresentation({ text, state, signals, questions: 1, history: [] }).forms ?? [];
  };
  ok('C: a secant approaching the tangent', plan('Show a secant line approaching the tangent of f(x) = x² at x = 2.').includes('graph'));
  ok('D: animated midpoint Riemann sums (in the reply, not the workspace)', I.routeTurn({ text: 'Animate midpoint Riemann sums for x² on [0,2].' }).reasons.includes('inline:motion') && plan('Animate midpoint Riemann sums for x² on [0,2].').includes('graph'));
  ok('E: what happens when demand increases', plan('Show what happens when demand increases.').includes('graph'));
  ok('a sampling distribution and its sample size', plan('As sample size increases, why does the sampling distribution get narrower?').includes('graph'));
  ok('binary search shown on their numbers', plan('show me binary search on [2, 5, 8, 12, 16, 23, 38] for 23').includes('trace') && plan('run bubble sort on 5 3 8 1').includes('trace'));
  ok('a projectile is still the workspace\'s simulation; a stack overflow error is not an algorithm', I.routeTurn({ text: 'visualize projectile motion at different launch angles' }).intent === 'visual' && !plan('show me the stack overflow error').includes('trace'));
}

console.log(`\nvisual actions: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
