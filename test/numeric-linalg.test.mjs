// Dense linear algebra, checked against definitions — never against a table.
// Every factorization is multiplied back, every basis is tested for what it
// claims to span, every eigenpair for A v = λ v, on seeded random matrices;
// and Strang's A = CR examples come out exactly.
import * as L from './.tmp/linalg.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

// a seeded generator, so a failure reproduces
let seed = 20261008;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const rmat = (m, n, s = 4) => Array.from({ length: m }, () => Array.from({ length: n }, () => Math.round((rnd() * 2 - 1) * s * 1000) / 1000));
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const matClose = (A, B, tol = 1e-9) => A.length === B.length && A.every((r, i) => r.every((x, j) => close(x, B[i][j], tol)));
const isOrtho = (Q, tol = 1e-10) => L.maxAbs(L.sub(L.matmul(L.transpose(Q), Q), L.identity(Q[0].length))) < tol;

console.log('=== A = CR, exactly (Strang, "Elimination and Factorization A = CR") ===');
{
  const A = [[1, 2, 11, 17], [3, 7, 37, 57], [4, 9, 48, 74]];
  const f = L.factorCR(A);
  ok('rank 2, found exactly', f.rank === 2 && f.exact);
  ok('C = the first two columns', JSON.stringify(f.C) === JSON.stringify([[1, 2], [3, 7], [4, 9]]));
  ok('R = [I F] with F = [3 5; 4 6]', JSON.stringify(f.R) === JSON.stringify([[1, 0, 3, 5], [0, 1, 4, 6]]), JSON.stringify(f.R));
  ok('C R gives A back', matClose(L.matmul(f.C, f.R), A));
  ok('the nullspace is spanned by (−3, −4, 1, 0) and (−5, −6, 0, 1)', JSON.stringify(f.nullspace) === JSON.stringify([[-3, -5], [-4, -6], [1, 0], [0, 1]]), JSON.stringify(f.nullspace));
  ok('  and A X = 0', L.maxAbs(L.matmul(A, f.nullspace)) === 0);

  const B = [[1, 2, 3, 4], [1, 2, 4, 5]];
  const g = L.factorCR(B);
  ok('a dependent column between independent ones (P ≠ I): C = columns 1 and 3', JSON.stringify(g.pivots) === '[0,2]' && JSON.stringify(g.C) === JSON.stringify([[1, 3], [1, 4]]));
  ok('  R = [1 2 0 1; 0 0 1 1]', JSON.stringify(g.R) === JSON.stringify([[1, 2, 0, 1], [0, 0, 1, 1]]), JSON.stringify(g.R));
  ok('  C R = A', matClose(L.matmul(g.C, g.R), B));

  const P = [[2, 1, 3, 0], [3, 4, 7, 0], [1, 2, 3, -1]];
  const h = L.factorCR(P);
  ok('the preface matrix: columns 1, 2, 4 independent, column 3 = column 1 + column 2', JSON.stringify(h.pivots) === '[0,1,3]' && JSON.stringify(h.R) === JSON.stringify([[1, 0, 1, 0], [0, 1, 1, 0], [0, 0, 0, 1]]), JSON.stringify(h.R));
  ok('  rank 3: the column space is all of R³', h.rank === 3);

  const frac = L.factorCR([[2, 1], [1, 3], [4, 2]]);
  ok('fractions stay fractions', frac.exact && frac.rank === 2);
  const third = L.factorCR([[3, 1, 1], [1, 3, 1]]);
  ok('  and read as fractions', JSON.stringify(third.Rtext) === JSON.stringify([['1', '0', '1/4'], ['0', '1', '1/4']]), JSON.stringify(third.Rtext));
  const irr = L.factorCR([[Math.SQRT2, 1], [1, Math.SQRT1_2]]);
  ok('an irrational entry falls back to floating point — and still finds rank 1', !irr.exact && irr.rank === 1);
}

console.log('=== the four fundamental subspaces ===');
for (let t = 0; t < 30; t++) {
  const m = 2 + Math.floor(rnd() * 4);
  const n = 2 + Math.floor(rnd() * 5);
  const r = 1 + Math.floor(rnd() * Math.min(m, n));
  // a matrix of known rank r: (m × r)(r × n) with small integers
  const Bm = Array.from({ length: m }, () => Array.from({ length: r }, () => Math.floor(rnd() * 7) - 3));
  const Cm = Array.from({ length: r }, () => Array.from({ length: n }, () => Math.floor(rnd() * 7) - 3));
  const A = L.matmul(Bm, Cm);
  const s = L.subspaces(A);
  const rr = L.rank(A);
  ok(`#${t} rank agrees two ways (elimination ${s.rank}, SVD ${rr})`, s.rank === rr);
  ok(`#${t} dimensions: r + (n − r) = n and r + (m − r) = m`, s.dims.column + s.dims.null === n && s.dims.row + s.dims.leftNull === m);
  ok(`#${t} A N = 0 and Aᵀ Y = 0 (exact fractions, evaluated in floating point)`, s.residual.null < 1e-12 && s.residual.leftNull < 1e-12, JSON.stringify(s.residual));
  if (s.nullspace[0]?.length && s.rowSpace[0]?.length) ok(`#${t} the row space is perpendicular to the nullspace`, L.maxAbs(L.matmul(L.transpose(s.rowSpace), s.nullspace)) < 1e-9);
}

console.log('=== LU, solve, inverse, det ===');
for (let t = 0; t < 20; t++) {
  const n = 2 + (t % 6);
  const A = rmat(n, n);
  const f = L.lu(A);
  const PA = f.perm.map((i) => A[i]);
  ok(`#${t} PA = LU`, matClose(L.matmul(f.L, f.U), PA, 1e-10));
  const x = Array.from({ length: n }, () => rnd());
  const b = L.matvec(A, x);
  const y = L.solve(A, b);
  ok(`#${t} solve recovers x`, y && y.every((v, i) => close(v, x[i], 1e-7)));
  const inv = L.inverse(A);
  ok(`#${t} A A⁻¹ = I`, inv && L.maxAbs(L.sub(L.matmul(A, inv), L.identity(n))) < 1e-8);
  const e = L.eigenvalues(A);
  // det = product of eigenvalues
  let pr = { re: 1, im: 0 };
  for (const z of e) pr = { re: pr.re * z.re - pr.im * z.im, im: pr.re * z.im + pr.im * z.re };
  ok(`#${t} det = Π λ`, close(L.det(A), pr.re, 1e-7) && Math.abs(pr.im) < 1e-6 * Math.max(1, Math.abs(pr.re)), `${L.det(A)} vs ${pr.re}`);
}
ok('a singular matrix is said to be singular', L.solve([[1, 2], [2, 4]], [1, 2]) === null && L.det([[1, 2], [2, 4]]) === 0);
ok('det is exact for an exact matrix', L.det([[1, 2, 3], [4, 5, 6], [7, 8, 10]]) === -3);

console.log('=== eigenvalues: real, complex, repeated, defective ===');
{
  const rot = L.eigenvalues([[0, -1], [1, 0]]);
  ok('a rotation by 90°: ±i', rot.length === 2 && rot.every((z) => Math.abs(z.re) < 1e-12 && close(Math.abs(z.im), 1)), JSON.stringify(rot));
  // companion matrix of (x − 1)(x − 2)(x − 3) = x³ − 6x² + 11x − 6
  const comp = L.eigenvalues([[6, -11, 6], [1, 0, 0], [0, 1, 0]]).map((z) => z.re).sort();
  ok('the roots of a cubic as a companion matrix: 1, 2, 3', [1, 2, 3].every((v, i) => close(comp[i], v, 1e-9)), JSON.stringify(comp));
  // (x² + 1)(x − 2): ±i and 2
  const c2 = L.eigenvalues([[2, -1, 2], [1, 0, 0], [0, 1, 0]]);
  ok('mixed real and complex: 2 and ±i', c2.some((z) => close(z.re, 2) && Math.abs(z.im) < 1e-9) && c2.filter((z) => Math.abs(Math.abs(z.im) - 1) < 1e-9).length === 2, JSON.stringify(c2));
  const J = L.eigen([[2, 1], [0, 2]]);
  ok('a Jordan block: λ = 2 twice, one eigenvector — not diagonalizable', J.distinct.length === 1 && J.distinct[0].algebraic === 2 && J.distinct[0].geometric === 1 && !J.diagonalizable);
  const I2 = L.eigen([[3, 0], [0, 3]]);
  ok('3I: λ = 3 twice, a whole plane of eigenvectors — diagonalizable', I2.distinct[0].geometric === 2 && I2.diagonalizable);
  const markov = L.eigen([[0.8, 0.3], [0.2, 0.7]]);
  ok('a Markov matrix has λ = 1, with the steady state as its eigenvector', markov.distinct.some((p) => close(p.value.re, 1) && close(p.vector[0].re / p.vector[1].re, 1.5, 1e-9)));
}
for (let t = 0; t < 40; t++) {
  const n = 2 + (t % 7);
  const A = rmat(n, n, 3);
  const E = L.eigen(A);
  const sum = E.pairs.reduce((s, p) => s + p.value.re, 0);
  ok(`#${t} trace = Σ λ (n = ${n})`, close(sum, E.trace, 1e-8), `${sum} vs ${E.trace}`);
  ok(`#${t} every eigenpair satisfies A v = λ v`, E.pairs.every((p) => p.residual < 1e-7 * Math.max(1, Math.hypot(p.value.re, p.value.im))), JSON.stringify(E.pairs.map((p) => p.residual)));
  ok(`#${t} complex eigenvalues come in conjugate pairs`, E.pairs.filter((p) => p.value.im > 0).length === E.pairs.filter((p) => p.value.im < 0).length);
}
for (let t = 0; t < 20; t++) {
  const n = 2 + (t % 6);
  const B = rmat(n, n);
  const S = L.matmul(L.transpose(B), B);
  const j = L.eigSym(S);
  const g = L.eigenvalues(S).map((z) => z.re).sort((a, b) => b - a);
  ok(`#${t} symmetric: Jacobi and Francis QR agree`, j.values.every((v, i) => close(v, g[i], 1e-8)), `${j.values} vs ${g}`);
  ok(`#${t} the eigenvectors are orthonormal`, isOrtho(j.vectors));
  ok(`#${t} S = Q Λ Qᵀ`, matClose(L.matmul(L.matmul(j.vectors, j.values.map((v, i) => j.values.map((_, k) => (i === k ? v : 0)))), L.transpose(j.vectors)), S, 1e-9));
  ok(`#${t} BᵀB is positive semidefinite`, j.values.every((v) => v > -1e-9));
}

console.log('=== SVD ===');
for (let t = 0; t < 30; t++) {
  const m = 1 + Math.floor(rnd() * 6);
  const n = 1 + Math.floor(rnd() * 6);
  const A = rmat(m, n);
  const { U, S, V } = L.svd(A);
  const k = Math.min(m, n);
  const Sig = S.map((s, i) => S.map((_, j) => (i === j ? s : 0)));
  const Vk = V.map((r) => r.slice(0, k));
  ok(`#${t} A = U Σ Vᵀ (${m}×${n})`, matClose(L.matmul(L.matmul(U, Sig), L.transpose(Vk)), A, 1e-9));
  ok(`#${t} U and V have orthonormal columns`, isOrtho(U, 1e-9) && isOrtho(Vk, 1e-9));
  ok(`#${t} σ descending and ≥ 0`, S.every((s, i) => s >= 0 && (i === 0 || s <= S[i - 1] + 1e-12)));
  const ev = L.eigSym(L.matmul(L.transpose(A), A)).values.slice(0, k).map((v) => Math.sqrt(Math.max(0, v)));
  ok(`#${t} σ² are the eigenvalues of AᵀA`, S.every((s, i) => close(s, ev[i], 1e-7)), `${S} vs ${ev}`);
}
ok('a rank-one matrix has one nonzero singular value', L.rank([[1, 2, 3], [2, 4, 6], [3, 6, 9]]) === 1);
ok('the condition number of an orthogonal matrix is 1', close(L.cond([[0, 1], [1, 0]]), 1));

console.log('=== QR, least squares, projection ===');
for (let t = 0; t < 20; t++) {
  const m = 2 + Math.floor(rnd() * 5);
  const n = 1 + Math.floor(rnd() * m);
  const A = rmat(m, n);
  const { Q, R } = L.qr(A);
  ok(`#${t} Q orthogonal, R upper triangular, QR = A`, isOrtho(Q) && R.every((r, i) => r.every((x, j) => j >= i || x === 0)) && matClose(L.matmul(Q, R), A, 1e-9));
  const b = Array.from({ length: m }, () => rnd() * 4 - 2);
  const ls = L.lstsq(A, b);
  ok(`#${t} least squares: the error is perpendicular to the columns (Aᵀ(b − Ax̂) = 0)`, ls.normalEquationResidual < 1e-9);
  const P = L.projector(A);
  ok(`#${t} the projector is idempotent and symmetric`, matClose(L.matmul(P, P), P, 1e-8) && L.isSymmetric(P, 1e-9));
}
{
  // fit a line through points that lie on y = 2 + 3t, plus a point off it
  const t = [0, 1, 2, 3];
  const A = t.map((x) => [1, x]);
  const ls = L.lstsq(A, [2, 5, 8, 11]);
  ok('points on a line are fitted exactly', close(ls.x[0], 2) && close(ls.x[1], 3) && L.norm2(ls.residual) < 1e-12);
  const rd = L.lstsq([[1, 1], [1, 1], [1, 1]], [1, 2, 3]);
  ok('a rank-deficient system gets the minimum-norm solution', rd.rank === 1 && close(rd.x[0], 1) && close(rd.x[1], 1));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
