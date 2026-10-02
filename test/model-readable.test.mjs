// test/model-readable.test.mjs
//
// A READ VIEW NAMES THINGS. The sensitivity table once said "y^2" and
// "2 * x" in one column while the next row said "experience^2": the frame
// letters a sampler binds were being printed for a reader, and a caption
// shouted an internal id. These are the rules that keep what is printed in
// the model's own names, set for reading, never parsed back.

import { namedExpr, pretty, panelFor } from './.tmp/viewdata.mjs';
import { buildProposal } from './.tmp/propose.mjs';
import { unpack } from './.tmp/unpack.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== i. frame letters become the model’s names ===');
{
  const surface = { id: 's', kind: 'surface', label: 's', meta: { axes: 'educ,exper' } };
  ok('x and y become the named axes', namedExpr(surface, 'b1 * x + b3 * y^2') === 'b1 * educ + b3 * exper^2', namedExpr(surface, 'b1 * x + b3 * y^2'));
  const marginal = { id: 'm', kind: 'curve', label: 'm', meta: { role: 'marginal', wrt: 'exper' } };
  ok('a marginal’s x becomes what it is taken with respect to', namedExpr(marginal, '2 * b3 * x') === '2 * b3 * exper', namedExpr(marginal, '2 * b3 * x'));
  ok('  and a second named variable in it stays', namedExpr(marginal, 'b1 + b3 * female') === 'b1 + b3 * female');
  ok('an object with no renaming is left alone', namedExpr({ id: 'c', kind: 'curve', label: 'c' }, 'a * x + b') === 'a * x + b');
  ok('an axis already called x is not renamed to itself', namedExpr({ id: 's', kind: 'surface', label: 's', meta: { axes: 'x,price' } }, 'x * y') === 'x * price');
}

console.log('\n=== ii. mathematics set for reading ===');
{
  ok('a product is a dot', pretty('2 * x') === '2 · x', pretty('2 * x'));
  ok('a square is a raised figure', pretty('y^2') === 'y²');
  ok('  and a cube', pretty('r^3') === 'r³');
  ok('  but not a higher power', pretty('x^9') === 'x^9');
  ok('a minus is a real minus', pretty('a - b') === 'a − b');
  ok('  including a leading one', pretty('-k * x') === '−k · x', pretty('-k * x'));
  ok('spaces are tidied', pretty('educ  *   female') === 'educ · female');
  // The assembler's scaffolding, for display only.
  ok('a name in its own parentheses loses them', pretty('(k) * x') === 'k · x', pretty('(k) * x'));
  ok('a rest position of zero is not written', pretty('-(k) * (x_m1 - 0)') === '−k · x_m1', pretty('-(k) * (x_m1 - 0)'));
  ok('doubled parentheses collapse', pretty('a / ((m))') === 'a / m', pretty('a / ((m))'));
  ok('a plus before a minus is a minus', pretty('a + -(c) * v') === 'a − c · v', pretty('a + -(c) * v'));
  ok('the oscillator reads as its equation', pretty('(-(k) * (x_m1 - 0) + -(c) * (v_m1 - 0) + (f0 * sin(w * t))) / ((m))') === '(−k · x_m1 − c · v_m1 + (f0 · sin(w · t))) / m', pretty('(-(k) * (x_m1 - 0) + -(c) * (v_m1 - 0) + (f0 * sin(w * t))) / ((m))'));
}

console.log('\n=== iii. the sensitivity table, in names, with rows that can be selected ===');
{
  const b = buildProposal({ id: 'w', title: 'w', params: [],
    objects: [{ id: 'sp', kind: 'specification', label: 'lwage', estimation: { y: 'lwage', x: ['educ', 'exper', 'exper_sq'], terms: { exper_sq: { op: 'pow', of: 'exper', by: 2 } }, coefficients: { intercept: 1, educ: 0.08, exper: 0.02, exper_sq: -0.001 }, over: { educ: [0, 20], exper: [0, 40] } } }] }, { at: 1 });
  const m = unpack(b.model);
  const t = panelFor(m, 'sensitivity:model');
  ok('it is a table', t?.kind === 'table');
  const cells = t.rows.map((r) => r[2]);
  ok('no frame letter survives', !cells.some((c) => /\by\b|\bx\b/.test(c)), JSON.stringify(cells));
  ok('  the square is exper²', cells.includes('exper²'), JSON.stringify(cells));
  ok('  and the slope of the square is 2 · exper', cells.includes('2 · exper'), JSON.stringify(cells));
  ok('every row names the object it is about', t.refs.length === t.rows.length && t.refs.every((r) => typeof r === 'string'));
  ok('the expression column is marked as mathematics', t.kinds[2] === 'math' && t.kinds[3] === 'note');
  const eq = panelFor(m, 'equation:model');
  ok('the response equation is in names', eq.rows.some((r) => /exper²|exper/.test(r.body) && !/\by\b/.test(r.body)), JSON.stringify(eq.rows.map((r) => r.body)));
  ok('the reply names the surface, not its id', /runs lwage, as the model implies it/.test(b.report.says) && !/sp__response/.test(b.report.says), b.report.says);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
