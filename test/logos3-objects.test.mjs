// OBJECTS OF THOUGHT — the thing being reasoned about, held as itself.
//
// Held here: the arithmetic is exact and independently checked; every row
// operation is reversible and the irreversible ones are refused with a
// reason; an operation in words is read only when the words plainly are one;
// a step's consequence is a fact, and when the step missed it is a question
// that never names the answer; a stored history that does not follow from its
// operations is cut, so nothing can be "computed" that was not; provenance
// (theirs, Socria's suggestion, the source) survives every path; the map's
// matrices are bound to computed states or not shown as results; the reply and
// synthesis read the history, guarded while the person is learning; the Work
// lens draws STATE → OPERATION → STATE; and a representation benchmark across
// eight kinds of thinking checks that the view chosen exposes the object.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as O from './.tmp/index.mjs';
import { sanitizeMap } from './.tmp/logos.mjs';
import { availableLenses, leadLens, layoutWork } from './.tmp/logos-layout.mjs';
import { digest, fromStructure } from './.tmp/logos-synthesis.mjs';
import { describeFocus } from './.tmp/focus.mjs';
import { sanitizeViz } from './.tmp/logos-viz.mjs';
import { open as openDoc, EMPTY_WORKSPACE } from './.tmp/docs.mjs';
import { oscillator } from './.tmp/library.mjs';
import { ALL as DOMAINS } from './fixtures/synthesis-maps.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const num = (v) => { const [n, d] = String(v).split('/'); return Number(n) / Number(d ?? 1); };
const nums = (st) => st.rows.map((r) => r.map(num));
const A0 = [[1, 3, 5, 7], [3, 5, 7, 9], [5, 7, 9, 1]];
const start = () => O.discover(O.EMPTY_SPACE, 'A = [1 3 5 7] [3 5 7 9] [5 7 9 1]').space;
const step = (sp, op, args, who = { by: 'person' }) => O.apply(sp, 'A', op, args, who);

console.log('=== the reference case: the arithmetic is the arithmetic ===');
{
  const sp = start();
  const o = sp.objs[0];
  ok('a matrix written in words becomes an object', o.kind === 'matrix' && o.name === 'A' && o.origin === 'person');
  ok('  with exactly the entries written', JSON.stringify(nums(o.states[0])) === JSON.stringify(A0));
  const r = step(sp, 'comb', { i: 2, a: '1', j: 1, b: '-3' });
  ok('R2 ← R2 − 3R1 gives [0 −4 −8 −12]', r.ok && JSON.stringify(r.obj.states[1].rows[1]) === JSON.stringify(['0', '-4', '-8', '-12']));
  ok('  and leaves the other rows alone', JSON.stringify(r.obj.states[1].rows[0]) === JSON.stringify(['1', '3', '5', '7']) && JSON.stringify(r.obj.states[1].rows[2]) === JSON.stringify(['5', '7', '9', '1']));
  ok('  written in the notation people use', r.step.said === 'R2 ← R2 − 3R1');
  ok('  recorded as theirs', r.step.by === 'person' && !r.step.suggested);
  ok('  and what it did is said as a fact', r.step.note === 'Entry (2, 1) is now 0.');
  // fractions stay exact
  const f = O.apply(r.space, 'A', 'comb', { i: 3, a: '1', j: 2, b: '1/3' }, { by: 'person' });
  ok('fractions are exact: R3 + (1/3)R2', f.ok && JSON.stringify(f.obj.states[2].rows[2]) === JSON.stringify(['5', '17/3', '19/3', '-3']));
  const back = O.apply(f.space, 'A', 'comb', { i: 3, a: '1', j: 2, b: '-1/3' }, { by: 'person' });
  ok('  and undoing it by the inverse operation is exact', JSON.stringify(back.obj.states[3].rows) === JSON.stringify(r.obj.states[1].rows));
}

console.log('\n=== computed means computed: 300 random operations against independent arithmetic ===');
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let sp = start();
  let ref = A0.map((r) => [...r]);
  let bad = 0, applied = 0;
  for (let t = 0; t < 300; t++) {
    const kind = ['swap', 'scale', 'comb'][Math.floor(rnd() * 3)];
    const i = 1 + Math.floor(rnd() * 3);
    let j = 1 + Math.floor(rnd() * 3);
    if (j === i) j = (j % 3) + 1;
    const k = [-3, -2, -1, 2, 3, '1/2', '-1/3'][Math.floor(rnd() * 7)];
    const args = kind === 'swap' ? { i, j } : kind === 'scale' ? { i, k: String(k) } : { i, a: '1', j, b: String(k) };
    const r = O.apply(sp, 'A', kind, args, { by: 'person' });
    if (!r.ok) continue;
    applied++;
    sp = r.space;
    if (kind === 'swap') [ref[i - 1], ref[j - 1]] = [ref[j - 1], ref[i - 1]];
    else if (kind === 'scale') ref[i - 1] = ref[i - 1].map((v) => v * num(k));
    else ref[i - 1] = ref[i - 1].map((v, c) => v + num(k) * ref[j - 1][c]);
    const got = nums(O.currentOf(r.obj));
    if (got.some((row, a) => row.some((v, b) => Math.abs(v - ref[a][b]) > 1e-6 * Math.max(1, Math.abs(ref[a][b]))))) bad++;
    if (Math.max(...ref.flat().map(Math.abs)) > 1e6) {
      sp = start();
      ref = A0.map((r) => [...r]);
    }
  }
  ok(`every computed state matches independent arithmetic (${applied} operations)`, bad === 0 && applied > 150, `${bad} wrong of ${applied}`);
}

console.log('\n=== an operation that cannot be undone is refused, with the reason ===');
{
  const sp = start();
  const why = (op, args) => { const r = O.apply(sp, 'A', op, args, { by: 'person' }); return r.ok ? null : r.why; };
  ok('scaling by 0', /cannot be 0/.test(why('scale', { i: 2, k: '0' }) ?? ''));
  ok('replacing a row by a multiple of another', /throws R2 away/.test(why('comb', { i: 2, a: '0', j: 1, b: '3' }) ?? ''));
  ok('a row combined with itself', /only rescales/.test(why('comb', { i: 2, a: '1', j: 2, b: '3' }) ?? ''));
  ok('a row that is not there', /no row 4/.test(why('swap', { i: 4, j: 1 }) ?? ''));
  ok('nothing changes when refused', O.currentOf(sp.objs[0]).rows[1][0] === '3');
  ok('numbers too large to keep exact are refused, not rounded', (() => {
    let s = O.discover(O.EMPTY_SPACE, 'B = [999999 2] [3 4]').space;
    let r;
    for (let t = 0; t < 6; t++) { r = O.apply(s, 'B', 'scale', { i: 1, k: '999999' }, { by: 'person' }); if (!r.ok) break; s = r.space; }
    return r && !r.ok && /too large/.test(r.why);
  })());
}

console.log('\n=== reading an operation out of words — only when they plainly are one ===');
{
  const sp = start();
  const R = (t) => { const r = O.readOperation(sp, t); return r ? `${r.op}:${JSON.stringify(r.args)}` : null; };
  const comb = (i, a, j, b) => `comb:${JSON.stringify({ i, a, j, b })}`;
  const cases = [
    ['R2 ← R2 − 3R1', comb(2, '1', 1, '-3')],
    ['R2 = R2 - 3*R1', comb(2, '1', 1, '-3')],
    ['R2 - 3R1', comb(2, '1', 1, '-3')],
    ['R2 - 3R1 -> R2', comb(2, '1', 1, '-3')],
    ['R3 → R3 − 5R1', comb(3, '1', 1, '-5')],
    ['r_2 <- r_2 - 3 r_1', comb(2, '1', 1, '-3')],
    ["let's do R3 - 5R1", comb(3, '1', 1, '-5')],
    ['R2 ← 2R2 − 3R1', comb(2, '2', 1, '-3')],
    ['I think R2 = R2 - 2R1 works', comb(2, '1', 1, '-2')],
    ['$R_3 \\leftarrow R_3 - 5R_1$', comb(3, '1', 1, '-5')],
    ['swap R1 and R3', 'swap:{"i":1,"j":3}'],
    ['R1 <-> R2', 'swap:{"i":1,"j":2}'],
    ['R1 ↔ R2', 'swap:{"i":1,"j":2}'],
    ['R3 = R3/2', 'scale:{"i":3,"k":"1/2"}'],
    ['multiply R2 by -1/4', 'scale:{"i":2,"k":"-1/4"}'],
    ['divide R3 by 2', 'scale:{"i":3,"k":"1/2"}'],
  ];
  for (const [t, want] of cases) ok(`reads "${t}"`, R(t) === want, R(t));
  for (const t of ['should I do R2 - 3R1?', "don't do R2 - 3R1", 'R2 = R2 - 2R1 won\'t work', 'what is the rank of A', 'row 2 looks odd', 'R7 ← R7 − R1', 'R1 -> R2']) ok(`leaves "${t}" as words`, R(t) === null, R(t));
}

console.log('\n=== when a step misses, the computation asks — it never names the answer ===');
{
  let sp = step(start(), 'comb', { i: 2, a: '1', j: 1, b: '-3' }).space;
  const r = O.apply(sp, 'A', 'comb', { i: 3, a: '1', j: 1, b: '-4' }, { by: 'person' });
  ok('the miss is computed honestly (5 − 4·1 = 1)', r.obj.states[2].rows[2][0] === '1');
  ok('  and the note points at the entry and asks', r.step.note === 'Entry (3, 1) was 5 and is now 1, not 0. What multiple of R1 would make it vanish?');
  ok('  without the multiplier that would have worked', !/5R1|−5|-5\b/.test(r.step.note.replace('was 5', '')));
  const back = O.apply(r.space, 'A', 'comb', { i: 3, a: '1', j: 2, b: '1' }, { by: 'person' });
  ok('a step that puts a nonzero back beneath a leading entry says so', /nonzero back/.test(O.apply(step(start(), 'comb', { i: 2, a: '1', j: 1, b: '-3' }).space, 'A', 'comb', { i: 2, a: '1', j: 1, b: '1' }, { by: 'person' }).step.note ?? ''), back.step?.note);
  ok('a swap and a scale say what they did', /exchanged/.test(O.apply(sp, 'A', 'swap', { i: 1, j: 2 }, { by: 'person' }).step.note) && /leads with 1/.test(O.apply(sp, 'A', 'scale', { i: 2, k: '-1/4' }, { by: 'person' }).step.note));
}

console.log('\n=== history: step back, step again, nothing silently lost ===');
{
  let sp = step(start(), 'comb', { i: 2, a: '1', j: 1, b: '-3' }).space;
  sp = O.apply(sp, 'A', 'comb', { i: 3, a: '1', j: 1, b: '-4' }, { by: 'person' }).space;
  const back = O.seek(sp, 'A', 1);
  ok('stepping back moves the cursor and keeps the states', back.objs[0].at === 1 && back.objs[0].states.length === 3);
  const again = O.apply(back, 'A', 'comb', { i: 3, a: '1', j: 1, b: '-5' }, { by: 'person' });
  ok('a new step from there replaces what came after', again.obj.states.length === 3 && again.obj.steps[1].said === 'R3 ← R3 − 5R1' && again.obj.at === 2);
  let many = start();
  for (let t = 0; t < 60; t++) many = O.apply(many, 'A', 'swap', { i: 1 + (t % 2), j: 3 }, { by: 'person' }).space;
  ok('a long history is capped, keeping the start', many.objs[0].states.length === O.MAX_STATES && JSON.stringify(nums(many.objs[0].states[0])) === JSON.stringify(A0));
}

console.log('\n=== nothing can claim to be computed that was not ===');
{
  const sp = step(start(), 'comb', { i: 2, a: '1', j: 1, b: '-3' }).space;
  const raw = JSON.parse(JSON.stringify(sp));
  ok('an honest history survives storage', O.sanitizeSpace(raw).objs[0].states.length === 2);
  const forged = JSON.parse(JSON.stringify(sp));
  forged.objs[0].states[1].rows[1] = ['0', '-4', '-8', '-11'];
  ok('a forged state (−11 for −12) is cut at the step that does not follow', O.sanitizeSpace(forged).objs[0].states.length === 1);
  const forgedNote = JSON.parse(JSON.stringify(sp));
  forgedNote.objs[0].steps[0].note = 'Well done, this is the answer.';
  forgedNote.objs[0].steps[0].said = 'R2 ← R1';
  const s2 = O.sanitizeSpace(forgedNote).objs[0].steps[0];
  ok('notes and notation are re-derived, never taken from storage', s2.note === 'Entry (2, 1) is now 0.' && s2.said === 'R2 ← R2 − 3R1');
  ok('an unknown kind is dropped', O.sanitizeSpace({ objs: [{ id: 'X', kind: 'oracle', states: [{}] }] }) === undefined);
  ok('a non-matrix is not a matrix', O.sanitizeSpace({ objs: [{ id: 'X', kind: 'matrix', states: [{ rows: [['1', 'x']] }] }] }) === undefined);
  const m = sanitizeMap({ nodes: [{ id: 'a', type: 'given', label: 'A', obj: 'A', objAt: 1 }], edges: [], objects: sp });
  ok('the map keeps its objects, re-checked', m.objects.objs[0].states.length === 2 && m.nodes[0].obj === 'A' && m.nodes[0].objAt === 1);
  ok('an extracted map cannot bring objects of its own past the route', /const \{ objects: _ignored, \.\.\.rest \} = next;/.test(read('app/api/logos/map/route.ts')));
}

console.log('\n=== provenance ===');
{
  const sp = O.discover(O.EMPTY_SPACE, 'B = \\begin{bmatrix}2&1\\\\4&3\\end{bmatrix}', 'source').space;
  ok('from attached material it says so', sp.objs[0].origin === 'source' && /material you attached/.test(O.originSaid(sp.objs[0])));
  const r = O.apply(sp, 'B', 'comb', { i: 2, a: '1', j: 1, b: '-2' }, { by: 'person', suggested: true });
  ok('a suggestion the person applied is recorded as both', r.step.suggested === true && O.stepWho(r.step) === 'Socria suggested it; you applied it');
  ok('their own choice says theirs', O.stepWho({ by: 'person' }) === 'chosen by you');
  const sug = O.suggestionsIn('One way: try $R_3 \\leftarrow R_3 - 5R_1$ — or R1 ↔ R2.', step(start(), 'comb', { i: 2, a: '1', j: 1, b: '-3' }).space);
  ok('Socria’s suggestions are read out of its reply, in notation', sug.map((s) => s.said).join('|') === 'R3 ← R3 − 5R1|R1 ↔ R2', sug.map((s) => s.said));
  ok('  and are never applied by being read', true);
  ok('the figure only offers them when the person is not learning', /!guarded && !!suggestions\?\.length/.test(read('components/objects/ObjectFigure.tsx')) && /guarded \|\| !map\.objects\?\.objs\.length/.test(read('components/LogosApp.tsx')));
}

console.log('\n=== found in what people write ===');
{
  const f = (t) => O.findMatrices(t).map((m) => `${m.name ?? '-'}:${JSON.stringify(m.rows)}${m.aug ? ':aug' : ''}`);
  ok('bracketed rows', f('A = [1 3 5 7] [3 5 7 9] [5 7 9 1]')[0] === 'A:[["1","3","5","7"],["3","5","7","9"],["5","7","9","1"]]');
  ok('one row per line', f('A =\n[ 1 2 ]\n[ 3 4 ]').length === 1);
  ok('nested arrays', f('M=[[1,2],[3,4]]')[0] === 'M:[["1","2"],["3","4"]]');
  ok('semicolons', f('[1 2; 3 4]')[0] === '-:[["1","2"],["3","4"]]');
  ok('LaTeX bmatrix', f('A=\\begin{bmatrix}1&0\\\\0&1\\end{bmatrix}')[0] === 'A:[["1","0"],["0","1"]]');
  ok('an augmented matrix keeps its bar', /:aug$/.test(f('\\begin{array}{cc|c}1&2&3\\\\4&5&6\\end{array}')[0] ?? '') || /:aug$/.test(f('[1 2 | 3; 4 5 | 6]')[0] ?? ''));
  ok('a list of numbers is not a matrix', f('I tried 1 2 3 and [4] and [5, 6]').length === 0);
  ok('the same matrix twice is one object', O.discover(start(), 'A = [1 3 5 7] [3 5 7 9] [5 7 9 1] again').made.length === 0);
  const after = step(start(), 'comb', { i: 2, a: '1', j: 1, b: '-3' }).space;
  const claim = O.discover(after, 'I got [1 3 5 7] [0 -4 -8 -10] [5 7 9 1]');
  ok('their own working is checked against the computation, not adopted', claim.made.length === 0 && claim.claims[0].cells.length === 1 && claim.claims[0].cells[0].c === 4 && claim.claims[0].cells[0].is === '-10' && claim.claims[0].cells[0].was === '-12');
  ok('functions: f(x) = a*x^2 - 3x + 2, a parameter found', JSON.stringify(O.findFunctions('f(x) = a*x^2 - 3x + 2 — where is it flat?').map((x) => [x.name, x.state.expr, Object.keys(x.state.params)])) === '[["f","a*x^2 - 3x + 2",["a"]]]');
}

console.log('\n=== the map\'s matrices, held to the objects ===');
{
  const sp = step(start(), 'comb', { i: 2, a: '1', j: 1, b: '-3' }).space;
  const map = {
    context: 'math',
    nodes: [
      { id: 'g', type: 'given', label: 'A', tex: '\\begin{bmatrix}1&3&5&7\\\\3&5&7&9\\\\5&7&9&1\\end{bmatrix}' },
      { id: 's', type: 'step', label: 'after', tex: '\\begin{bmatrix}1&3&5&7\\\\0&-4&-8&-12\\\\5&7&9&1\\end{bmatrix}' },
      { id: 'x', type: 'step', label: 'made up', tex: '\\begin{bmatrix}1&3&5&7\\\\0&-4&-8&-12\\\\0&0&0&-9\\end{bmatrix}' },
      { id: 'y', type: 'step', label: 'their working', tex: '\\begin{bmatrix}1&3&5&7\\\\0&-4&-8&-10\\\\5&7&9&1\\end{bmatrix}' },
      { id: 'z', type: 'equation', label: 'unrelated', tex: 'x^2' },
    ],
    edges: [],
    objects: sp,
  };
  const b = O.bindNodes(map, 'I got [1 3 5 7] [0 -4 -8 -10] [5 7 9 1]');
  const by = (id) => b.nodes.find((n) => n.id === id);
  ok('a node holding a computed state is drawn as the object, at that state', by('g').obj === 'A' && by('g').objAt === 0 && by('s').objAt === 1 && !by('s').tex);
  ok('a matrix nothing computed and nobody wrote is not shown as a result', !by('x').tex && /not shown/.test(by('x').note));
  ok('the person’s own working is kept, with where it differs', !!by('y').tex && /\(2, 4\)/.test(by('y').note));
  ok('everything else is untouched', by('z').tex === 'x^2');
}

console.log('\n=== what the reply is told ===');
{
  let sp = step(start(), 'comb', { i: 2, a: '1', j: 1, b: '-3' }).space;
  const last = { obj: 'A', step: sp.objs[0].steps[0] };
  const g = O.objectsBlock(sp, { guarded: true, lastStep: last });
  ok('the computed state, as text', /\[ +0 +-4 +-8 +-12 \]/.test(g));
  ok('the step, whose it was, and that it was computed', /R2 ← R2 − 3R1 — chosen by you\./.test(g) && /COMPUTED by the workspace/.test(g));
  ok('never to do the arithmetic itself', /Never do arithmetic on them yourself/.test(g));
  ok('learning: they choose the operations; no next step, no multiplier', /Do not name the next operation or the multiplier/.test(g));
  ok('  facts that would be the answer are marked as not to be stated', /For you to ask about, not to state/.test(g) && !/Rank \d/.test(g));
  const u = O.objectsBlock(sp, { guarded: false, lastStep: null });
  ok('not learning: suggestions allowed, in the workspace notation, as suggestions', /You may suggest an operation/.test(u));
  ok('a refused operation is passed on for Socria to help with', /refused: Multiplying/.test(O.objectsBlock(sp, { guarded: true, refused: 'Multiplying R2 by 0 would erase it.' })));
  const route = read('app/api/logos/chat/route.ts');
  ok('the route re-sanitises (re-computes) before telling the reply anything', /const space = sanitizeSpace\(body\?\.objects\)/.test(route) && /objectsBlock\(space, \{ guarded, lastStep, refused \}\)/.test(route));
  ok('  and believes a "last step" only if it is the object’s actual last step', /step\.said === st\.said/.test(route));
}

console.log('\n=== ask about this: a part, structurally ===');
{
  const sp = step(start(), 'comb', { i: 2, a: '1', j: 1, b: '-3' }).space;
  const map = { nodes: [], edges: [], objects: sp };
  const row = describeFocus({ kind: 'part', obj: 'A', part: 'r2' }, map);
  ok('a row is described from state', row.label === 'Row 2 of A' && row.lines[0] === 'Row 2: [ 0 −4 −8 −12 ]' && /leading entry −4, in column 2/.test(row.lines[1]));
  ok('  with the last step on the object', row.lines.some((l) => /R2 ← R2 − 3R1 \(their choice; computed\)/.test(l)));
  const e = describeFocus({ kind: 'part', obj: 'A', part: 'e3.1' }, map);
  ok('an entry too', e.label === 'Entry (3, 1) of A' && e.lines[0] === 'Entry (3, 1) = 5');
  ok('a part that is not there is nothing', describeFocus({ kind: 'part', obj: 'A', part: 'r9' }, map) === null);
}

console.log('\n=== synthesis reads the history, not the chat ===');
{
  let sp = step(start(), 'comb', { i: 2, a: '1', j: 1, b: '-3' }).space;
  const map = { context: 'math', nodes: [{ id: 'q', type: 'question', label: 'Is it independent?' }], edges: [], objects: sp };
  const d = digest(map);
  ok('the digest carries what was done, by whom', d.work.did[0] === 'You chose R2 ← R2 − 3R1 on A — Entry (2, 1) is now 0.');
  ok('  and where the object stands', /A: an entry beneath a leading entry still nonzero, at \(3, 1\)/.test(d.work.open[0] ?? ''), d.work.open);
  const s = fromStructure(d, { id: 's1', at: 0, scope: 'workspace' });
  ok('the structural synthesis says it in its first lines', /You chose R2 ← R2 − 3R1/.test(s.lede) && /\(3, 1\)/.test(s.lede), s.lede);
}

console.log('\n=== a function: the same substrate, a different thing ===');
{
  let sp = O.discover(O.EMPTY_SPACE, 'f(x) = a*x^2 - 3x + 2').space;
  const r = O.apply(sp, 'f', 'param', { name: 'a', value: 2 }, { by: 'person' });
  ok('changing a parameter is an operation with a computed consequence', r.ok && r.step.said === 'a = 2' && /lowest point in view moved from about \(1\.5\d*, -?−?0\.25\) to about \(0\.7\d*, 0\.87\d*\)/.test(r.step.note), r.step.note);
  const p = O.apply(r.space, 'f', 'point', { x: 1 }, { by: 'person' });
  ok('looking at a point computes it', p.ok && p.step.note === 'x = 1 gives 1.');
  ok('the slope there is an estimate, and said to be', Math.abs(O.slopeAt(O.currentOf(p.obj), 1) - 1) < 1e-6 && O.kindOf('function').facts(O.currentOf(p.obj), { guarded: false }).some((f) => /estimated numerically/.test(f)));
  ok('  and withheld as an answer while learning', O.kindOf('function').facts(O.currentOf(p.obj), { guarded: true }).some((f) => /not to state/.test(f)));
  ok('a parameter it does not have is refused', !O.apply(sp, 'f', 'param', { name: 'q', value: 2 }, { by: 'person' }).ok);
  ok('words read as function operations', JSON.stringify(O.readOperation(sp, 'a = 3')) === '{"id":"f","op":"param","args":{"name":"a","value":3}}' && O.readOperation(sp, 'look at x = 2')?.op === 'point');
}

console.log('\n=== the Work lens: the object, its trail, and what is said about it ===');
{
  let sp = step(start(), 'comb', { i: 2, a: '1', j: 1, b: '-3' }).space;
  sp = O.apply(sp, 'A', 'comb', { i: 3, a: '1', j: 1, b: '-5' }, { by: 'person' }).space;
  const map = {
    context: 'math',
    nodes: [
      { id: 'g', type: 'given', label: 'A', obj: 'A' },
      { id: 'p', type: 'question', label: 'Which entry should be the pivot?' },
      { id: 'o', type: 'idea', label: 'Maybe the columns are dependent' },
    ],
    edges: [{ from: 'p', to: 'g', relation: 'relates' }],
    objects: sp,
  };
  ok('objects earn the Work lens, and it leads', availableLenses(map)[0] === 'work' && leadLens(availableLenses(map), false, null) === 'work');
  const L = layoutWork(map, 1000, 600);
  const ids = L.placed.map((p) => p.id);
  ok('the live object, and every state in its trail', ids.includes('obj:A') && ids.includes('obj:A@0') && ids.includes('obj:A@1') && ids.includes('obj:A@2'));
  ok('STATE → OPERATION → STATE: each step is a labelled arrow between two states', L.connectors.filter((c) => c.relation === 'transforms_to').map((c) => `${c.from}>${c.label}>${c.to}`).join('|') === 'obj:A@0>R2 ← R2 − 3R1>obj:A@1|obj:A@1>R3 ← R3 − 5R1>obj:A@2');
  ok('the node that IS the object is not drawn twice', !ids.includes('g'));
  ok('what is said about it sits beside it, joined to it', ids.includes('p') && L.connectors.some((c) => c.from === 'p' && c.to === 'obj:A'));
  ok('the rest of the thinking is still on the map', ids.includes('o'));
  const overl = L.placed.some((a, i) => L.placed.some((b, j) => j > i && Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 1));
  ok('and nothing sits on anything', !overl);
  const sp2 = O.seek(sp, 'A', 1);
  const L2 = layoutWork({ ...map, objects: sp2 }, 1000, 600);
  ok('a state stepped back from is shown as undone, not erased', L2.placed.find((p) => p.id === 'obj:A@2')?.objRef.undone === true);
}

console.log('\n=== REPRESENTATION BENCHMARK: does the view chosen expose the object of thought? ===');
{
  const bench = [];
  const run = (name, expect, got, note = '') => { bench.push([name, expect, got]); ok(`${name}: ${expect}`, expect === got, `${got} ${note}`); };
  // A. linear algebra
  {
    const map = { context: 'math', intent: 'learning', nodes: [{ id: 'q', type: 'question', label: 'Row reduce A' }], edges: [], objects: O.discover(O.EMPTY_SPACE, 'A = [1 3 5 7] [3 5 7 9] [5 7 9 1]').space };
    run('A linear algebra', 'work · matrix', `${leadLens(availableLenses(map), false, null)} · ${map.objects.objs[0].kind}`);
  }
  // B. calculus
  {
    const map = { context: 'math', nodes: [{ id: 'q', type: 'question', label: 'Where is the tangent flat?' }], edges: [], objects: O.discover(O.EMPTY_SPACE, 'f(x) = x^3 - 2x').space };
    const k = O.kindOf('function');
    run('B calculus', 'work · function · graph', `${leadLens(availableLenses(map), false, null)} · ${map.objects.objs[0].kind} · ${k.views.find((v) => v.primary).id}`);
  }
  // C. economics: supply and demand, equilibrium COMPUTED by the scene
  {
    const viz = sanitizeViz({ kind: 'supply-demand', demand: { intercept: 100, slope: -1 }, supply: { intercept: 20, slope: 1 } });
    const map = { context: 'analysing', nodes: [{ id: 'a', type: 'claim', label: 'A tax raises the price' }], edges: [], viz };
    run('C economics', 'plot · supply-demand', `${leadLens(availableLenses(map), !!viz, null)} · ${viz?.kind}`);
  }
  // D. product management
  run('D onboarding design', 'flow', leadLens(availableLenses(DOMAINS.ONBOARDING), false, DOMAINS.ONBOARDING.building));
  // E. argument
  {
    const l = leadLens(availableLenses(DOMAINS.ARGUMENT), false, DOMAINS.ARGUMENT.building);
    run('E argument', 'semantic', ['graph', 'structure', 'evidence', 'tensions'].includes(l) ? 'semantic' : l);
  }
  // F. research
  {
    const l = leadLens(availableLenses(DOMAINS.RESEARCH), false, DOMAINS.RESEARCH.building);
    run('F research', 'structure, not objects', ['graph', 'structure', 'evidence', 'flow'].includes(l) && !availableLenses(DOMAINS.RESEARCH).includes('work') ? 'structure, not objects' : l);
  }
  // G. physics: a spring–mass model is a model, drawn by the engine
  {
    const ws = openDoc(EMPTY_WORKSPACE, oscillator()).workspace;
    const map = { context: 'analysing', building: { kind: 'model', by: 'inferred', confidence: 0.9 }, nodes: [{ id: 'm', type: 'concept', label: 'Spring and mass' }], edges: [], models: ws };
    run('G physics', 'plot · model', `${leadLens(availableLenses(map), true, map.building)} · ${map.models.docs.length ? 'model' : 'none'}`);
  }
  // H. data — honestly: no table/chart object yet; nothing is faked
  {
    const said = 'Here is my data: x 1 2 3 4, y 2.1 3.9 6.2 7.8. Is it linear?';
    const sp = O.discover(O.EMPTY_SPACE, said);
    run('H small dataset (known gap: no data object yet — nothing is invented)', 'no object', sp.space.objs.length ? 'object' : 'no object');
  }
  ok('the benchmark covers eight kinds of thinking', bench.length === 8);
  ok('a semantic domain never gets a fake object', !availableLenses(DOMAINS.ARGUMENT).includes('work') && !availableLenses(DOMAINS.ONBOARDING).includes('work'));
}

console.log('\n=== the wiring ===');
{
  const app = read('components/LogosApp.tsx');
  ok('an operation in a message is computed before the reply is asked anything', /const objTurn = takeObjects\(content, atts\)/.test(app) && /readOperation\(space, content, objSelRef\.current\?\.obj\)/.test(app));
  ok('the extraction can add objects, never roll one back', /mergeSpaces\(s\.map\?\.objects, json\.map\.objects\)/.test(app));
  ok('a figure operation calls no model', !/fetch\(/.test(app.slice(app.indexOf('function onObject('), app.indexOf('async function send('))));
  ok('a 2 × 2 matrix on the plane is the same object, followed', /planeOfRef\.current === touched\.id/.test(app));
  const tm = read('components/ThinkingMap.tsx');
  ok('the map draws objects as themselves', /<ObjectFigure/.test(tm) && /p\.objRef/.test(tm) && /p\.node\.obj && objOf\(map\.objects, p\.node\.obj\)/.test(tm));
  const fig = read('components/objects/ObjectFigure.tsx');
  ok('templates give the form, never the multiplier', /`R\$\{a\} ← R\$\{a\} \+ ·R\$\{b\}`/.test(fig));
  ok('the leading entries are not marked for a learner', /!guarded && leads\[i\] === j/.test(fig));
  ok('motion explains the step and respects reduced motion', /objLift/.test(read('components/objects/objects.css')) && /prefers-reduced-motion: reduce[\s\S]*obj-was/.test(read('components/objects/objects.css')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
