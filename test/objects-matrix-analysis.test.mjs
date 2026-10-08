// What a matrix IS, computed from its entries (lib/objects/matrix-analysis.ts):
// rank and the four subspaces with exact bases, A = CR, the determinant,
// eigenvalues and singular values, a 2 × 2's action on the plane, and what
// Ax = b has — each held to Strang's own examples and to the definitions.
import { analyseMatrix, frac } from './.tmp/matrix-analysis.mjs';
import { MATRIX } from './.tmp/matrix.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const A = (rows, aug) => analyseMatrix({ rows: rows.map((r) => r.map(String)), ...(aug ? { aug: true } : {}) });
const parseVec = (s) => s.replace(/[()]/g, '').split(',').map((t) => { const v = t.trim().replace('−', '-'); const [n, d] = v.split('/'); return Number(n) / Number(d ?? 1); });
const mulv = (M, v) => M.map((r) => r.reduce((s, a, j) => s + a * v[j], 0));
const T = (M) => M[0].map((_, j) => M.map((r) => r[j]));

console.log('=== the four subspaces: dimensions and bases ===');
{
  const M = [[1, 2, 3], [2, 4, 6]];
  const a = A(M);
  ok('rank 1 of a 2 × 3: dimensions r, n − r, r, m − r = 1, 2, 1, 1', a.rank === 1 && a.subspaces.dims.null === 2 && a.subspaces.dims.leftNull === 1 && a.subspaces.dims.column === 1 && a.subspaces.dims.row === 1);
  ok('the special solutions (−2, 1, 0) and (−3, 0, 1), exactly', a.subspaces.null.join(' ') === '(−2, 1, 0) (−3, 0, 1)', a.subspaces.null.join(' '));
  ok('every null space vector is solved by A: Ax = 0', a.subspaces.null.every((s) => mulv(M, parseVec(s)).every((v) => Math.abs(v) < 1e-12)));
  ok('the left null space: yᵀA = 0', a.subspaces.leftNull.every((s) => mulv(T(M), parseVec(s)).every((v) => Math.abs(v) < 1e-12)));
  ok('the row space is perpendicular to the null space', a.subspaces.row.every((r) => a.subspaces.null.every((n) => Math.abs(parseVec(r).reduce((s, v, i) => s + v * parseVec(n)[i], 0)) < 1e-12)));
  ok('A = CR: C is column 1, R = [1 2 3]', a.cr.pivots.join() === '0' && a.cr.R[0].join(' ') === '1 2 3');
  const B = [[1, 3, 0, 2], [0, 0, 1, 4], [1, 3, 1, 6]];
  const b = A(B);
  ok('Strang’s 3 × 4 of rank 2: pivots in columns 1 and 3, a null space of dimension 2', b.rank === 2 && b.cr.pivots.join() === '0,2' && b.subspaces.dims.null === 2);
  ok('… R = [1 3 0 2; 0 0 1 4], exactly', b.cr.R.map((r) => r.join(' ')).join('; ') === '1 3 0 2; 0 0 1 4', b.cr.R.join(';'));
  ok('… and its special solutions solve Ax = 0', b.subspaces.null.every((s) => mulv(B, parseVec(s)).every((v) => Math.abs(v) < 1e-12)));
  ok('… the left null space: row 1 + row 2 − row 3 = 0', b.subspaces.leftNull.length === 1 && mulv(T(B), parseVec(b.subspaces.leftNull[0])).every((v) => Math.abs(v) < 1e-12));
}

console.log('=== square: determinant, eigenvalues, singular values ===');
{
  const s = A([[2, 1], [1, 2]]);
  ok('det exactly 3, invertible', s.square.det === '3' && s.square.invertible);
  ok('eigenvalues 3 along (1, 1) and 1 along (1, −1)', s.square.eigen.join('; ') === '3 along (1, 1); 1 along (1, −1)', s.square.eigen.join('; '));
  ok('singular values 3 and 1, condition 3', s.singular.join() === '3,1' && s.condition === '3');
  const f = A([['1/2', '1/3'], ['1/4', '1/5']]);
  ok('fractions stay exact: det(½ ⅓; ¼ ⅕) = 1/10 − 1/12 = 1/60', f.square.det === '1/60', f.square.det);
  const sing = A([[1, 2], [2, 4]]);
  ok('a singular matrix: det 0, no inverse, a zero singular value', sing.square.det === '0' && !sing.square.invertible && sing.singular[1] === '0');
  const r3 = A([[2, 0, 0], [0, 3, 4], [0, 4, 9]]);
  ok('a 3 × 3: det 2·(27 − 16) = 22, eigenvalues 1, 2 and 11', r3.square.det === '22' && ['1', '2', '11'].every((v) => r3.square.eigen.some((e) => e.startsWith(v + ' '))), r3.square.eigen.join('; '));
  ok('frac turns a rational float back into its fraction', frac(0.1 - 1 / 12) === '1/60' && frac(-2 / 3) === '−2/3' && frac(0.5) === '1/2');
}

console.log('=== a 2 × 2 on the plane, in words ===');
{
  ok('[0 −1; 1 0] is a rotation by 90°', /rotation by 90°/.test(A([[0, -1], [1, 0]]).plane));
  // the object holds exact rationals, so a rotation it can hold is a Pythagorean one: (3/5, 4/5)
  ok('[3/5 −4/5; 4/5 3/5] is a rotation by atan(4/3) = 53.13°', /rotation by 53\.13°/.test(A([['3/5', '-4/5'], ['4/5', '3/5']]).plane), A([['3/5', '-4/5'], ['4/5', '3/5']]).plane);
  ok('[1 0; 0 −1] is a reflection across the x-axis', /reflection across the line at 0°/.test(A([[1, 0], [0, -1]]).plane));
  ok('[0 1; 1 0] is a reflection across the line at 45°', /reflection across the line at 45°/.test(A([[0, 1], [1, 0]]).plane));
  ok('[1 1; 0 1] is a shear, with one direction kept', /shear/.test(A([[1, 1], [0, 1]]).plane) && /\(1, 0\)/.test(A([[1, 1], [0, 1]]).plane));
  ok('[1 0; 0 0] collapses the plane onto a line', /collapses the plane onto the line through \(1, 0\)/.test(A([[1, 0], [0, 0]]).plane));
  ok('[2 1; 1 2] stretches along perpendicular directions, being symmetric', /stretches by 3 along \(1, 1\) and by 1 along \(1, −1\) — perpendicular/.test(A([[2, 1], [1, 2]]).plane));
  ok('[1 −2; 2 1] turns and scales: complex eigenvalues, r = √5', /complex/.test(A([[1, -2], [2, 1]]).plane) && /r = 2\.236/.test(A([[1, -2], [2, 1]]).plane));
  ok('[3 0; 0 3] scales everything by 3', /scales every vector by 3/.test(A([[3, 0], [0, 3]]).plane));
  ok('a negative determinant flips the plane over', /flipped over/.test(A([[2, 1], [3, 1]]).plane));
}

console.log('=== Ax = b, from the augmented matrix ===');
{
  ok('one solution, exactly: x = (−4, 9/2)', /exactly one solution, x = \(−4, 9\/2\)/.test(A([[1, 2, 5], [3, 4, 6]], true).system));
  ok('none: b is not in the column space', /no solution/.test(A([[1, 2, 3], [2, 4, 7]], true).system));
  ok('infinitely many: a particular solution plus the null space', /infinitely many solutions: x = \(2, 0\) plus any combination of the 1 special solution/.test(A([[1, 1, 2], [2, 2, 4]], true).system));
  ok('the coefficient part is what is analysed: 2 × 2, not 2 × 3', A([[1, 2, 5], [3, 4, 6]], true).n === 2);
}

console.log('=== in the matrix object: facts, and the learner’s guard ===');
{
  const st = { rows: [['1', '2', '3'], ['2', '4', '6']] };
  const open = MATRIX.facts(st, { guarded: false });
  const guarded = MATRIX.facts(st, { guarded: true });
  ok('unguarded, the conversation is told the subspaces and A = CR', open.some((f) => /Null space: spanned by \(−2, 1, 0\), \(−3, 0, 1\)/.test(f)) && open.some((f) => /A = CR/.test(f)));
  ok('guarded — someone working it out by hand — none of it is said', !guarded.some((f) => /Null space|A = CR|Eigenvalues|Rank \d:/.test(f)), guarded.join(' | '));
  ok('the object offers a “What it is” view', MATRIX.views.some((v) => v.id === 'analysis'));
  ok('entries that are not numbers are not analysed', analyseMatrix({ rows: [['x', '1'], ['1', '1']] }) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
