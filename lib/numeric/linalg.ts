// lib/numeric/linalg.ts
//
// DENSE LINEAR ALGEBRA, COMPUTED — the factorizations and spaces a matrix
// carries, for any matrix Logos is handed, never a table of known answers.
//
//   lu            PA = LU, partial pivoting          det · solve · inverse
//   rref          reduced row echelon form, with its pivot columns — exact
//                 over the rationals when every entry is one (lib/objects/
//                 rational.ts), in floating point with a scaled tolerance
//                 otherwise
//   factorCR      A = C R (Strang, "Elimination and Factorization A = CR"):
//                 C the first r independent columns, R = [I F]P the nonzero
//                 rows of rref(A), and the nullspace basis X = Pᵀ[−F; I]
//   subspaces     the four fundamental subspaces, each with a basis, its
//                 dimension, and the orthogonality that ties them checked
//   qr            Householder, A = QR                 lstsq · projection
//   eigenvalues   any real square matrix: balancing, Householder reduction
//                 to Hessenberg form, Francis double-shift QR — real and
//                 complex eigenvalues alike
//   eigen         + eigenvectors (inverse iteration), algebraic and geometric
//                 multiplicities, and whether the matrix is diagonalizable
//   eigSym        symmetric matrices: cyclic Jacobi, orthonormal eigenvectors
//   svd           one-sided Jacobi: A = U Σ Vᵀ        rank · pinv · cond
//
// Every result can be checked against its definition (reconstruct, residual)
// and the tests do exactly that on random matrices; nothing here is looked up.
//
// PURE. No React, no network.

import { div as qdiv, isZero as qIsZero, mul as qmul, neg as qneg, parseQ, q, safe as qsafe, sub as qsub, toNumber, type Q } from '../objects/rational';

export type Mat = number[][];
export type Vec = number[];
export interface Complex {
  re: number;
  im: number;
}

const EPS = 2.220446049250313e-16;

// ── basics ──────────────────────────────────────────────────────────

export const shape = (A: Mat): [number, number] => [A.length, A[0]?.length ?? 0];
export const zeros = (m: number, n: number): Mat => Array.from({ length: m }, () => new Array(n).fill(0));
export const identity = (n: number): Mat => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
export const clone = (A: Mat): Mat => A.map((r) => r.slice());
export const transpose = (A: Mat): Mat => {
  const [m, n] = shape(A);
  return Array.from({ length: n }, (_, j) => Array.from({ length: m }, (_, i) => A[i][j]));
};
export function matmul(A: Mat, B: Mat): Mat {
  const [m, k] = shape(A);
  const [k2, n] = shape(B);
  if (k !== k2) throw new Error(`cannot multiply ${m}×${k} by ${k2}×${n}`);
  const C = zeros(m, n);
  for (let i = 0; i < m; i++)
    for (let p = 0; p < k; p++) {
      const a = A[i][p];
      if (a === 0) continue;
      for (let j = 0; j < n; j++) C[i][j] += a * B[p][j];
    }
  return C;
}
export const matvec = (A: Mat, x: Vec): Vec => A.map((r) => r.reduce((s, a, j) => s + a * x[j], 0));
export const dot = (a: Vec, b: Vec) => a.reduce((s, x, i) => s + x * b[i], 0);
export const norm2 = (a: Vec) => Math.hypot(...a);
export const column = (A: Mat, j: number): Vec => A.map((r) => r[j]);
export const fromColumns = (cols: Vec[], m: number): Mat => Array.from({ length: m }, (_, i) => cols.map((c) => c[i]));
export const frobenius = (A: Mat) => Math.sqrt(A.reduce((s, r) => s + r.reduce((t, x) => t + x * x, 0), 0));
export const maxAbs = (A: Mat) => A.reduce((s, r) => Math.max(s, ...r.map(Math.abs)), 0);
export const sub = (A: Mat, B: Mat): Mat => A.map((r, i) => r.map((x, j) => x - B[i][j]));
export const isFiniteMat = (A: unknown): A is Mat =>
  Array.isArray(A) &&
  A.length > 0 &&
  A.every((r) => Array.isArray(r) && r.length === (A[0] as unknown[]).length && r.every((x) => typeof x === 'number' && Number.isFinite(x))) &&
  (A[0] as unknown[]).length > 0;

/** The tolerance below which a computed number is treated as zero, scaled to the matrix. */
export const tolFor = (A: Mat) => Math.max(...shape(A)) * EPS * Math.max(1, maxAbs(A)) * 64;

// ── LU with partial pivoting ────────────────────────────────────────

export interface LU {
  /** unit lower triangular */
  L: Mat;
  U: Mat;
  /** row i of PA is row perm[i] of A */
  perm: number[];
  /** sign of the permutation, for the determinant */
  sign: 1 | -1;
  singular: boolean;
}

export function lu(A: Mat): LU {
  const n = A.length;
  if (shape(A)[1] !== n) throw new Error('LU here is for square matrices');
  const U = clone(A);
  const L = identity(n);
  const perm = Array.from({ length: n }, (_, i) => i);
  let sign: 1 | -1 = 1;
  let singular = false;
  const tol = tolFor(A);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(U[i][k]) > Math.abs(U[p][k])) p = i;
    if (Math.abs(U[p][k]) <= tol) {
      singular = true;
      continue;
    }
    if (p !== k) {
      [U[p], U[k]] = [U[k], U[p]];
      [perm[p], perm[k]] = [perm[k], perm[p]];
      for (let j = 0; j < k; j++) [L[p][j], L[k][j]] = [L[k][j], L[p][j]];
      sign = (sign * -1) as 1 | -1;
    }
    for (let i = k + 1; i < n; i++) {
      const m = U[i][k] / U[k][k];
      L[i][k] = m;
      if (m === 0) continue;
      for (let j = k; j < n; j++) U[i][j] -= m * U[k][j];
      U[i][k] = 0;
    }
  }
  return { L, U, perm, sign, singular };
}

export function det(A: Mat): number {
  const exact = exactMatrix(A);
  if (exact) {
    const d = detExact(exact);
    if (d) return toNumber(d);
  }
  const { U, sign } = lu(A);
  return U.reduce((p, r, i) => p * r[i], sign as number);
}

/** Solve Ax = b for square nonsingular A; null when A is singular. */
export function solve(A: Mat, b: Vec): Vec | null {
  const { L, U, perm, singular } = lu(A);
  if (singular) return null;
  const n = A.length;
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) y[i] = b[perm[i]] - L[i].slice(0, i).reduce((s, l, j) => s + l * y[j], 0);
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let j = i + 1; j < n; j++) s -= U[i][j] * x[j];
    x[i] = s / U[i][i];
  }
  return x;
}

export function inverse(A: Mat): Mat | null {
  const n = A.length;
  const cols: Vec[] = [];
  for (let j = 0; j < n; j++) {
    const e = new Array(n).fill(0);
    e[j] = 1;
    const x = solve(A, e);
    if (!x) return null;
    cols.push(x);
  }
  return fromColumns(cols, n);
}

// ── exact rationals, when the matrix allows them ────────────────────

/** The matrix as exact rationals, or null when any entry is not one (an irrational, a huge number). */
export function exactMatrix(A: unknown): Q[][] | null {
  if (!Array.isArray(A) || !A.length) return null;
  const out: Q[][] = [];
  for (const row of A) {
    if (!Array.isArray(row)) return null;
    const r: Q[] = [];
    for (const x of row) {
      const v = typeof x === 'object' && x && 'n' in (x as object) ? (x as Q) : parseQ(typeof x === 'number' ? decimalText(x) : x);
      if (!v) return null;
      r.push(v);
    }
    out.push(r);
  }
  return out;
}

/** A float as the decimal a person typed, so 0.1 reads as 1/10 and not 3602879701896397/36028797018963968. */
function decimalText(x: number): string | number {
  if (Number.isInteger(x)) return x;
  const s = String(x);
  return /e/i.test(s) || s.replace(/^-?\d*\./, '').length > 9 ? NaN : s;
}

function detExact(A: Q[][]): Q | null {
  const n = A.length;
  if (A.some((r) => r.length !== n)) return null;
  const M = A.map((r) => r.slice());
  let d = q(1);
  try {
    for (let k = 0; k < n; k++) {
      let p = k;
      while (p < n && qIsZero(M[p][k])) p++;
      if (p === n) return q(0);
      if (p !== k) {
        [M[p], M[k]] = [M[k], M[p]];
        d = qneg(d);
      }
      d = qmul(d, M[k][k]);
      for (let i = k + 1; i < n; i++) {
        if (qIsZero(M[i][k])) continue;
        const f = qdiv(M[i][k], M[k][k]);
        for (let j = k; j < n; j++) M[i][j] = qsub(M[i][j], qmul(f, M[k][j]));
      }
      if (!qsafe(d) || M.some((r) => r.some((x) => !qsafe(x)))) return null;
    }
  } catch {
    return null;
  }
  return d;
}

// ── reduced row echelon form and A = CR ─────────────────────────────

export interface RREF {
  R: Mat;
  /** the pivot columns, in order — the first r independent columns of A */
  pivots: number[];
  rank: number;
  /** computed in exact rational arithmetic (true) or floating point with a tolerance */
  exact: boolean;
  /** the exact entries, when exact */
  Rq?: Q[][];
}

/**
 * rref(A), column by column as Strang describes: a column whose lower part is
 * all zero joins F (dependent); otherwise its largest entry becomes the pivot
 * and the rest of the column is cleared above and below.
 */
export function rref(A: Mat | Q[][], opts: { tol?: number; exact?: boolean } = {}): RREF {
  const Aq = opts.exact === false ? null : exactMatrix(A);
  if (Aq) {
    const r = rrefExact(Aq);
    if (r) return r;
  }
  const M = (A as unknown[][]).map((row) => row.map((x) => (typeof x === 'number' ? x : toNumber(x as Q))));
  return rrefFloat(M, opts.tol);
}

function rrefExact(A: Q[][]): RREF | null {
  const m = A.length;
  const n = A[0].length;
  const M = A.map((r) => r.slice());
  const pivots: number[] = [];
  let row = 0;
  try {
    for (let col = 0; col < n && row < m; col++) {
      let p = -1;
      for (let i = row; i < m; i++) if (!qIsZero(M[i][col])) {
        p = i;
        break;
      }
      if (p < 0) continue;
      [M[p], M[row]] = [M[row], M[p]];
      const piv = M[row][col];
      for (let j = col; j < n; j++) M[row][j] = qdiv(M[row][j], piv);
      for (let i = 0; i < m; i++) {
        if (i === row || qIsZero(M[i][col])) continue;
        const f = M[i][col];
        for (let j = col; j < n; j++) M[i][j] = qsub(M[i][j], qmul(f, M[row][j]));
      }
      if (M.some((r) => r.some((x) => !qsafe(x)))) return null;
      pivots.push(col);
      row++;
    }
  } catch {
    return null;
  }
  return { R: M.map((r) => r.map(toNumber)), Rq: M, pivots, rank: pivots.length, exact: true };
}

function rrefFloat(A: Mat, tolIn?: number): RREF {
  const [m, n] = shape(A);
  const M = clone(A);
  const tol = tolIn ?? tolFor(A);
  const pivots: number[] = [];
  let row = 0;
  for (let col = 0; col < n && row < m; col++) {
    let p = row;
    for (let i = row + 1; i < m; i++) if (Math.abs(M[i][col]) > Math.abs(M[p][col])) p = i;
    if (Math.abs(M[p][col]) <= tol) {
      for (let i = row; i < m; i++) M[i][col] = 0;
      continue;
    }
    [M[p], M[row]] = [M[row], M[p]];
    const piv = M[row][col];
    for (let j = col; j < n; j++) M[row][j] /= piv;
    for (let i = 0; i < m; i++) {
      if (i === row) continue;
      const f = M[i][col];
      if (f === 0) continue;
      for (let j = col; j < n; j++) M[i][j] -= f * M[row][j];
      M[i][col] = 0;
    }
    pivots.push(col);
    row++;
  }
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if (Math.abs(M[i][j]) <= tol) M[i][j] = 0;
  return { R: M, pivots, rank: pivots.length, exact: false };
}

export interface CR {
  /** m × r: the independent columns of A */
  C: Mat;
  /** r × n: the nonzero rows of rref(A) — [I F] with its columns permuted */
  R: Mat;
  pivots: number[];
  /** the dependent columns' indices */
  free: number[];
  rank: number;
  /** r × (n − r): how each dependent column is a combination of the independent ones */
  F: Mat;
  /** n × (n − r): a basis for the nullspace — Pᵀ[−F; I], one special solution per free column */
  nullspace: Mat;
  exact: boolean;
  /** exact text of R's entries ("3", "-1/2"), when exact */
  Rtext?: string[][];
}

export function factorCR(A: Mat, opts: { tol?: number; exact?: boolean } = {}): CR {
  const [m, n] = shape(A);
  const e = rref(A, opts);
  const r = e.rank;
  const pivots = e.pivots;
  const free = Array.from({ length: n }, (_, j) => j).filter((j) => !pivots.includes(j));
  const C = A.map((row) => pivots.map((j) => row[j]));
  const R = e.R.slice(0, r).map((row) => row.slice());
  const F = R.map((row) => free.map((j) => row[j]));
  const X = zeros(n, free.length);
  free.forEach((fj, k) => {
    X[fj][k] = 1;
    pivots.forEach((pj, i) => (X[pj][k] = -R[i][fj]));
  });
  void m;
  return {
    C,
    R,
    pivots,
    free,
    rank: r,
    F,
    nullspace: X,
    exact: e.exact,
    ...(e.exact && e.Rq ? { Rtext: e.Rq.slice(0, r).map((row) => row.map((x) => (x.d === 1 ? String(x.n) : `${x.n}/${x.d}`))) } : {}),
  };
}

export interface Subspaces {
  m: number;
  n: number;
  rank: number;
  /** bases as columns */
  columnSpace: Mat;
  rowSpace: Mat;
  nullspace: Mat;
  leftNullspace: Mat;
  dims: { column: number; row: number; null: number; leftNull: number };
  /** ‖A · nullspace‖ and ‖Aᵀ · leftNullspace‖ — zero when the bases are right */
  residual: { null: number; leftNull: number };
  exact: boolean;
}

/** The four fundamental subspaces of A (Strang ch. 3), each with a basis and its dimension. */
export function subspaces(A: Mat): Subspaces {
  const [m, n] = shape(A);
  const cr = factorCR(A);
  const crT = factorCR(transpose(A));
  const N = cr.nullspace;
  const Y = crT.nullspace;
  const res = (M: Mat, B: Mat) => (B[0]?.length ? maxAbs(matmul(M, B)) : 0);
  return {
    m,
    n,
    rank: cr.rank,
    columnSpace: cr.C,
    rowSpace: transpose(cr.R),
    nullspace: N,
    leftNullspace: Y,
    dims: { column: cr.rank, row: cr.rank, null: n - cr.rank, leftNull: m - cr.rank },
    residual: { null: res(A, N), leftNull: res(transpose(A), Y) },
    exact: cr.exact && crT.exact,
  };
}

// ── QR (Householder), least squares ─────────────────────────────────

export interface QRf {
  /** m × m orthogonal */
  Q: Mat;
  /** m × n upper triangular */
  R: Mat;
}

export function qr(A: Mat): QRf {
  const [m, n] = shape(A);
  const R = clone(A);
  let Q = identity(m);
  for (let k = 0; k < Math.min(m - 1, n); k++) {
    const x = R.slice(k).map((r) => r[k]);
    const alpha = -Math.sign(x[0] || 1) * norm2(x);
    const v = x.slice();
    v[0] -= alpha;
    const vn = norm2(v);
    if (vn < 1e-300) continue;
    for (let i = 0; i < v.length; i++) v[i] /= vn;
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let i = 0; i < v.length; i++) s += v[i] * R[k + i][j];
      for (let i = 0; i < v.length; i++) R[k + i][j] -= 2 * v[i] * s;
    }
    // Q ← Q H_k  (H symmetric)
    const Qn = clone(Q);
    for (let i = 0; i < m; i++) {
      let s = 0;
      for (let t = 0; t < v.length; t++) s += Q[i][k + t] * v[t];
      for (let t = 0; t < v.length; t++) Qn[i][k + t] -= 2 * s * v[t];
    }
    Q = Qn;
  }
  for (let i = 0; i < m; i++) for (let j = 0; j < Math.min(i, n); j++) R[i][j] = 0;
  return { Q, R };
}

export interface LeastSquares {
  x: Vec;
  /** b − A x̂: perpendicular to the column space */
  residual: Vec;
  /** A x̂: the projection of b onto the column space */
  projection: Vec;
  rank: number;
  /** ‖Aᵀ(b − Ax̂)‖ — zero for the true least-squares solution */
  normalEquationResidual: number;
}

/** Least squares via the SVD, so a rank-deficient A still gives the minimum-norm x̂. */
export function lstsq(A: Mat, b: Vec): LeastSquares {
  const P = pinv(A);
  const x = matvec(P.pinv, b);
  const projection = matvec(A, x);
  const residual = b.map((v, i) => v - projection[i]);
  const At = transpose(A);
  return { x, residual, projection, rank: P.rank, normalEquationResidual: norm2(matvec(At, residual)) };
}

// ── symmetric eigenproblem: cyclic Jacobi ───────────────────────────

export interface SymEigen {
  /** descending */
  values: Vec;
  /** columns, orthonormal, in the same order */
  vectors: Mat;
}

export function eigSym(S: Mat): SymEigen {
  const n = S.length;
  const A = clone(S);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) A[i][j] = A[j][i] = (A[i][j] + A[j][i]) / 2;
  const V = identity(n);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-30 * Math.max(1, frobenius(A) ** 2)) break;
    for (let p = 0; p < n; p++)
      for (let qq = p + 1; qq < n; qq++) {
        if (Math.abs(A[p][qq]) < 1e-300) continue;
        const theta = (A[qq][qq] - A[p][p]) / (2 * A[p][qq]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p];
          const akq = A[k][qq];
          A[k][p] = c * akp - s * akq;
          A[k][qq] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k];
          const aqk = A[qq][k];
          A[p][k] = c * apk - s * aqk;
          A[qq][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p];
          const vkq = V[k][qq];
          V[k][p] = c * vkp - s * vkq;
          V[k][qq] = s * vkp + c * vkq;
        }
      }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => A[b][b] - A[a][a]);
  return { values: order.map((i) => A[i][i]), vectors: V.map((row) => order.map((i) => row[i])) };
}

export const isSymmetric = (A: Mat, tol = tolFor(A)) => A.length === A[0]?.length && A.every((r, i) => r.every((x, j) => Math.abs(x - A[j][i]) <= tol));

// ── general real eigenvalues: balance → Hessenberg → Francis QR ─────

/**
 * Every eigenvalue of a real square matrix, complex ones included. The
 * classical route (EISPACK/Numerical Recipes balanc, Householder orthes,
 * hqr): balancing evens out row and column norms so rounding is shared
 * fairly; the Hessenberg form keeps each QR step O(n²); the implicit double
 * shift keeps complex conjugate pairs in real arithmetic.
 */
export function eigenvalues(Ain: Mat): Complex[] {
  const n = Ain.length;
  if (!n || shape(Ain)[1] !== n) throw new Error('eigenvalues are for square matrices');
  if (n === 1) return [{ re: Ain[0][0], im: 0 }];
  // 1-based working copy, as the algorithms are written
  const a: number[][] = [new Array(n + 1).fill(0)];
  for (let i = 0; i < n; i++) a.push([0, ...Ain[i]]);
  balance(a, n);
  hessenberg(a, n);
  return hqr(a, n);
}

function balance(a: number[][], n: number) {
  const RADIX = 2;
  const sqrdx = RADIX * RADIX;
  let last = false;
  let guard = 0;
  while (!last && guard++ < 1000) {
    last = true;
    for (let i = 1; i <= n; i++) {
      let r = 0;
      let c = 0;
      for (let j = 1; j <= n; j++)
        if (j !== i) {
          c += Math.abs(a[j][i]);
          r += Math.abs(a[i][j]);
        }
      if (c && r) {
        let g = r / RADIX;
        let f = 1;
        const s = c + r;
        while (c < g) {
          f *= RADIX;
          c *= sqrdx;
        }
        g = r * RADIX;
        while (c > g) {
          f /= RADIX;
          c /= sqrdx;
        }
        if ((c + r) / f < 0.95 * s) {
          last = false;
          g = 1 / f;
          for (let j = 1; j <= n; j++) a[i][j] *= g;
          for (let j = 1; j <= n; j++) a[j][i] *= f;
        }
      }
    }
  }
}

/** Householder reduction to upper Hessenberg form (similarity, so eigenvalues are kept). */
function hessenberg(a: number[][], n: number) {
  for (let m = 2; m < n; m++) {
    // column m−1, rows m..n
    let scale = 0;
    for (let i = m; i <= n; i++) scale += Math.abs(a[i][m - 1]);
    if (scale === 0) continue;
    const ort: number[] = new Array(n + 1).fill(0);
    let h = 0;
    for (let i = n; i >= m; i--) {
      ort[i] = a[i][m - 1] / scale;
      h += ort[i] * ort[i];
    }
    const g = ort[m] > 0 ? -Math.sqrt(h) : Math.sqrt(h);
    h -= ort[m] * g;
    ort[m] -= g;
    // H A
    for (let j = m; j <= n; j++) {
      let f = 0;
      for (let i = n; i >= m; i--) f += ort[i] * a[i][j];
      f /= h;
      for (let i = m; i <= n; i++) a[i][j] -= f * ort[i];
    }
    // (H A) H
    for (let i = 1; i <= n; i++) {
      let f = 0;
      for (let j = n; j >= m; j--) f += ort[j] * a[i][j];
      f /= h;
      for (let j = m; j <= n; j++) a[i][j] -= f * ort[j];
    }
    a[m][m - 1] = scale * g;
    for (let i = m + 1; i <= n; i++) a[i][m - 1] = 0;
  }
}

function hqr(a: number[][], n: number): Complex[] {
  const wr = new Array(n + 1).fill(0);
  const wi = new Array(n + 1).fill(0);
  let anorm = 0;
  for (let i = 1; i <= n; i++) for (let j = Math.max(i - 1, 1); j <= n; j++) anorm += Math.abs(a[i][j]);
  let nn = n;
  let t = 0;
  let p = 0;
  let q2 = 0;
  let r = 0;
  let s = 0;
  let w = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  while (nn >= 1) {
    let its = 0;
    let l: number;
    do {
      for (l = nn; l >= 2; l--) {
        s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]);
        if (s === 0) s = anorm;
        if (Math.abs(a[l][l - 1]) <= EPS * s) {
          a[l][l - 1] = 0;
          break;
        }
      }
      x = a[nn][nn];
      if (l === nn) {
        wr[nn] = x + t;
        wi[nn--] = 0;
      } else {
        y = a[nn - 1][nn - 1];
        w = a[nn][nn - 1] * a[nn - 1][nn];
        if (l === nn - 1) {
          p = 0.5 * (y - x);
          q2 = p * p + w;
          z = Math.sqrt(Math.abs(q2));
          x += t;
          if (q2 >= 0) {
            z = p + (p >= 0 ? Math.abs(z) : -Math.abs(z));
            wr[nn - 1] = wr[nn] = x + z;
            if (z) wr[nn] = x - w / z;
            wi[nn - 1] = wi[nn] = 0;
          } else {
            wr[nn - 1] = wr[nn] = x + p;
            wi[nn - 1] = -(wi[nn] = z);
          }
          nn -= 2;
        } else {
          if (its === 60) throw new Error('the eigenvalue iteration did not converge');
          if (its === 10 || its === 20 || its === 40) {
            // exceptional shift
            t += x;
            for (let i = 1; i <= nn; i++) a[i][i] -= x;
            s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          ++its;
          let m: number;
          for (m = nn - 2; m >= l; m--) {
            z = a[m][m];
            r = x - z;
            s = y - z;
            p = (r * s - w) / a[m + 1][m] + a[m][m + 1];
            q2 = a[m + 1][m + 1] - z - r - s;
            r = a[m + 2][m + 1];
            s = Math.abs(p) + Math.abs(q2) + Math.abs(r);
            p /= s;
            q2 /= s;
            r /= s;
            if (m === l) break;
            const u = Math.abs(a[m][m - 1]) * (Math.abs(q2) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
            if (u <= EPS * v) break;
          }
          for (let i = m + 2; i <= nn; i++) {
            a[i][i - 2] = 0;
            if (i !== m + 2) a[i][i - 3] = 0;
          }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k][k - 1];
              q2 = a[k + 1][k - 1];
              r = 0;
              if (k !== nn - 1) r = a[k + 2][k - 1];
              if ((x = Math.abs(p) + Math.abs(q2) + Math.abs(r)) !== 0) {
                p /= x;
                q2 /= x;
                r /= x;
              }
            }
            const sq = Math.sqrt(p * p + q2 * q2 + r * r);
            s = p >= 0 ? sq : -sq;
            if (s !== 0) {
              if (k === m) {
                if (l !== m) a[k][k - 1] = -a[k][k - 1];
              } else a[k][k - 1] = -s * x;
              p += s;
              x = p / s;
              y = q2 / s;
              z = r / s;
              q2 /= p;
              r /= p;
              for (let j = k; j <= nn; j++) {
                p = a[k][j] + q2 * a[k + 1][j];
                if (k !== nn - 1) {
                  p += r * a[k + 2][j];
                  a[k + 2][j] -= p * z;
                }
                a[k + 1][j] -= p * y;
                a[k][j] -= p * x;
              }
              const mmin = nn < k + 3 ? nn : k + 3;
              for (let i = l; i <= mmin; i++) {
                p = x * a[i][k] + y * a[i][k + 1];
                if (k !== nn - 1) {
                  p += z * a[i][k + 2];
                  a[i][k + 2] -= p * r;
                }
                a[i][k + 1] -= p * q2;
                a[i][k] -= p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  const out: Complex[] = [];
  for (let i = 1; i <= n; i++) out.push({ re: wr[i], im: wi[i] });
  // largest real part first; a conjugate pair with the positive imaginary part first
  return out.sort((u, v) => v.re - u.re || v.im - u.im);
}

// ── eigenvectors, multiplicities ────────────────────────────────────

export interface EigenPair {
  value: Complex;
  /** unit 2-norm; real when the eigenvalue is real */
  vector: Complex[];
  /** times the value repeats among the eigenvalues */
  algebraic: number;
  /** dimension of its eigenspace — less than `algebraic` means a Jordan block */
  geometric: number;
  /** ‖A v − λ v‖ */
  residual: number;
}

export interface Eigen {
  pairs: EigenPair[];
  /** one entry per distinct eigenvalue */
  distinct: EigenPair[];
  diagonalizable: boolean;
  /** trace = Σλ and det = Πλ, checked */
  trace: number;
  det: number;
}

export function eigen(A: Mat): Eigen {
  const n = A.length;
  const vals = eigenvalues(A);
  const scale = Math.max(1, maxAbs(A));
  const same = (u: Complex, v: Complex) => Math.hypot(u.re - v.re, u.im - v.im) <= 1e-6 * scale;
  const groups: Complex[][] = [];
  for (const v of vals) {
    const g = groups.find((gr) => same(gr[0], v));
    if (g) g.push(v);
    else groups.push([v]);
  }
  const pairs: EigenPair[] = [];
  const distinct: EigenPair[] = [];
  for (const g of groups) {
    const lam: Complex = { re: g.reduce((s, v) => s + v.re, 0) / g.length, im: g.reduce((s, v) => s + v.im, 0) / g.length };
    if (Math.abs(lam.im) <= 1e-12 * scale) lam.im = 0;
    let geometric = 1;
    let basis: Complex[][] = [];
    if (lam.im === 0) {
      // the eigenspace: nullspace of A − λI, with a tolerance that tracks how well λ is known
      const M = A.map((r, i) => r.map((x, j) => x - (i === j ? lam.re : 0)));
      const sv = svd(M);
      const tol = Math.max(1e-9 * scale, 1e3 * EPS * scale * n) * (g.length > 1 ? 1e3 : 1);
      const nullCols = sv.S.map((sgm, k) => [sgm, k] as const).filter(([sgm]) => sgm <= tol).map(([, k]) => k);
      geometric = Math.max(1, Math.min(g.length, nullCols.length || 1));
      if (nullCols.length) basis = nullCols.slice(0, geometric).map((k) => column(sv.V, k).map((re) => ({ re, im: 0 })));
    }
    if (!basis.length) basis = [inverseIteration(A, lam)];
    const vec = normalizeComplex(basis[0], lam.im === 0);
    const residual = eigResidual(A, lam, vec);
    const pair: EigenPair = { value: lam, vector: vec, algebraic: g.length, geometric, residual };
    distinct.push(pair);
    for (let k = 0; k < g.length; k++) {
      const b = basis[Math.min(k, basis.length - 1)];
      const v = normalizeComplex(b, lam.im === 0);
      pairs.push({ ...pair, vector: v, residual: eigResidual(A, lam, v) });
    }
  }
  const trace = A.reduce((s, r, i) => s + r[i], 0);
  return { pairs, distinct, diagonalizable: distinct.every((p) => p.geometric === p.algebraic), trace, det: det(A) };
}

function eigResidual(A: Mat, lam: Complex, v: Complex[]): number {
  let s = 0;
  for (let i = 0; i < A.length; i++) {
    let re = 0;
    let im = 0;
    for (let j = 0; j < A.length; j++) {
      re += A[i][j] * v[j].re;
      im += A[i][j] * v[j].im;
    }
    re -= lam.re * v[i].re - lam.im * v[i].im;
    im -= lam.re * v[i].im + lam.im * v[i].re;
    s += re * re + im * im;
  }
  return Math.sqrt(s);
}

/** Unit length; a real eigenvector made real and its largest entry positive, so signs are stable. */
function normalizeComplex(v: Complex[], real: boolean): Complex[] {
  let k = 0;
  let big = -1;
  v.forEach((z, i) => {
    const m = Math.hypot(z.re, z.im);
    if (m > big) {
      big = m;
      k = i;
    }
  });
  // rotate so the largest entry is real and positive
  const ph = Math.atan2(v[k].im, v[k].re);
  const c = Math.cos(-ph);
  const s = Math.sin(-ph);
  let out = v.map((z) => ({ re: z.re * c - z.im * s, im: z.re * s + z.im * c }));
  const nrm = Math.sqrt(out.reduce((t, z) => t + z.re * z.re + z.im * z.im, 0)) || 1;
  out = out.map((z) => ({ re: z.re / nrm, im: real ? 0 : z.im / nrm }));
  return out;
}

/** (A − σI) x_{k+1} = x_k with σ a hair off λ: converges to λ's eigenvector in a step or two. */
function inverseIteration(A: Mat, lam: Complex): Complex[] {
  const n = A.length;
  const scale = Math.max(1, maxAbs(A));
  const sigma: Complex = { re: lam.re + 1e-10 * scale, im: lam.im + (lam.im ? 1e-10 * scale : 0) };
  let x: Complex[] = Array.from({ length: n }, (_, i) => ({ re: 1 / Math.sqrt(n) + 0.01 * i, im: lam.im ? 0.007 * (i + 1) : 0 }));
  for (let it = 0; it < 4; it++) {
    const y = complexSolve(A, sigma, x);
    if (!y) break;
    const nrm = Math.sqrt(y.reduce((t, z) => t + z.re * z.re + z.im * z.im, 0));
    if (!(nrm > 0) || !Number.isFinite(nrm)) break;
    x = y.map((z) => ({ re: z.re / nrm, im: z.im / nrm }));
  }
  return x;
}

/** Solve (A − σI) y = b in complex arithmetic, partial pivoting. */
function complexSolve(A: Mat, sigma: Complex, b: Complex[]): Complex[] | null {
  const n = A.length;
  const re = A.map((r, i) => r.map((x, j) => x - (i === j ? sigma.re : 0)));
  const im = A.map((r, i) => r.map((_, j) => (i === j ? -sigma.im : 0)));
  const bre = b.map((z) => z.re);
  const bim = b.map((z) => z.im);
  for (let k = 0; k < n; k++) {
    let p = k;
    let best = Math.hypot(re[k][k], im[k][k]);
    for (let i = k + 1; i < n; i++) {
      const m = Math.hypot(re[i][k], im[i][k]);
      if (m > best) {
        best = m;
        p = i;
      }
    }
    if (best === 0) {
      re[k][k] = 1e-300;
      im[k][k] = 0;
    }
    if (p !== k) {
      [re[p], re[k]] = [re[k], re[p]];
      [im[p], im[k]] = [im[k], im[p]];
      [bre[p], bre[k]] = [bre[k], bre[p]];
      [bim[p], bim[k]] = [bim[k], bim[p]];
    }
    const dr = re[k][k];
    const di = im[k][k];
    const dd = dr * dr + di * di;
    for (let i = k + 1; i < n; i++) {
      // f = a_ik / a_kk
      const fr = (re[i][k] * dr + im[i][k] * di) / dd;
      const fi = (im[i][k] * dr - re[i][k] * di) / dd;
      if (fr === 0 && fi === 0) continue;
      for (let j = k; j < n; j++) {
        re[i][j] -= fr * re[k][j] - fi * im[k][j];
        im[i][j] -= fr * im[k][j] + fi * re[k][j];
      }
      bre[i] -= fr * bre[k] - fi * bim[k];
      bim[i] -= fr * bim[k] + fi * bre[k];
    }
  }
  const x: Complex[] = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sr = bre[i];
    let si = bim[i];
    for (let j = i + 1; j < n; j++) {
      sr -= re[i][j] * x[j].re - im[i][j] * x[j].im;
      si -= re[i][j] * x[j].im + im[i][j] * x[j].re;
    }
    const dr = re[i][i];
    const di = im[i][i];
    const dd = dr * dr + di * di;
    if (!(dd > 0)) return null;
    x[i] = { re: (sr * dr + si * di) / dd, im: (si * dr - sr * di) / dd };
  }
  return x.every((z) => Number.isFinite(z.re) && Number.isFinite(z.im)) ? x : null;
}

// ── SVD: one-sided Jacobi ───────────────────────────────────────────

export interface SVD {
  /** m × k, orthonormal columns (k = min(m, n)) */
  U: Mat;
  /** k singular values, descending */
  S: Vec;
  /** n × n orthogonal when m ≥ n; n × k when m < n */
  V: Mat;
}

export function svd(A: Mat): SVD {
  const [m, n] = shape(A);
  if (m < n) {
    const t = svd(transpose(A));
    return { U: t.V, S: t.S, V: t.U };
  }
  const U = clone(A);
  const V = identity(n);
  for (let sweep = 0; sweep < 80; sweep++) {
    let rotated = false;
    for (let i = 0; i < n - 1; i++)
      for (let j = i + 1; j < n; j++) {
        let alpha = 0;
        let beta = 0;
        let gamma = 0;
        for (let k = 0; k < m; k++) {
          alpha += U[k][i] * U[k][i];
          beta += U[k][j] * U[k][j];
          gamma += U[k][i] * U[k][j];
        }
        if (Math.abs(gamma) <= 1e-15 * Math.sqrt(alpha * beta) || gamma === 0) continue;
        rotated = true;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (let k = 0; k < m; k++) {
          const uki = U[k][i];
          const ukj = U[k][j];
          U[k][i] = c * uki - s * ukj;
          U[k][j] = s * uki + c * ukj;
        }
        for (let k = 0; k < n; k++) {
          const vki = V[k][i];
          const vkj = V[k][j];
          V[k][i] = c * vki - s * vkj;
          V[k][j] = s * vki + c * vkj;
        }
      }
    if (!rotated) break;
  }
  const sig = Array.from({ length: n }, (_, j) => Math.sqrt(U.reduce((s, r) => s + r[j] * r[j], 0)));
  const order = sig.map((s, j) => [s, j] as const).sort((a, b) => b[0] - a[0]).map(([, j]) => j);
  const S = order.map((j) => sig[j]);
  const Vs = V.map((row) => order.map((j) => row[j]));
  const Us = U.map((row) => order.map((j) => (sig[j] > 1e-300 ? row[j] / sig[j] : 0)));
  // complete U's columns for zero singular values, so U stays orthonormal
  completeOrthonormal(Us, S);
  return { U: Us, S, V: Vs };
}

function completeOrthonormal(U: Mat, S: Vec) {
  const [m, k] = shape(U);
  const tol = (S[0] || 1) * 1e-12;
  for (let j = 0; j < k; j++) {
    if (S[j] > tol && Math.abs(norm2(column(U, j)) - 1) < 1e-6) continue;
    // Gram–Schmidt a standard basis vector against the columns already kept
    for (let e = 0; e < m; e++) {
      const v = new Array(m).fill(0);
      v[e] = 1;
      for (let c = 0; c < k; c++) {
        if (c === j) continue;
        if (c > j && !(S[c] > tol)) continue;
        const col = column(U, c);
        const p = dot(col, v);
        for (let i = 0; i < m; i++) v[i] -= p * col[i];
      }
      const nv = norm2(v);
      if (nv > 1e-6) {
        for (let i = 0; i < m; i++) U[i][j] = v[i] / nv;
        break;
      }
    }
  }
}

/** Numerical rank from the singular values, with the usual tolerance max(m,n)·ε·σ₁. */
export function rank(A: Mat, tol?: number): number {
  const { S } = svd(A);
  const t = tol ?? Math.max(...shape(A)) * EPS * (S[0] || 0) * 10;
  return S.filter((s) => s > t).length;
}

export function pinv(A: Mat, tol?: number): { pinv: Mat; rank: number } {
  const [m, n] = shape(A);
  const { U, S, V } = svd(A);
  const t = tol ?? Math.max(m, n) * EPS * (S[0] || 0) * 10;
  const P = zeros(n, m);
  let r = 0;
  S.forEach((s, k) => {
    if (s <= t) return;
    r++;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) P[i][j] += (V[i][k] * U[j][k]) / s;
  });
  return { pinv: P, rank: r };
}

/** σ_max / σ_min; Infinity for a singular matrix. */
export function cond(A: Mat): number {
  const { S } = svd(A);
  const lo = S[S.length - 1];
  return lo > 0 ? S[0] / lo : Infinity;
}

/** Projection onto the column space of A: P = A A⁺. */
export function projector(A: Mat): Mat {
  return matmul(A, pinv(A).pinv);
}

// ── formatting helpers the views share ──────────────────────────────

export const fmtComplex = (z: Complex, digits = 4): string => {
  const r = Number(z.re.toPrecision(digits));
  const i = Number(Math.abs(z.im).toPrecision(digits));
  if (!z.im) return String(r);
  return `${r === 0 ? '' : r}${z.im < 0 ? ' − ' : r === 0 ? '' : ' + '}${i === 1 ? '' : i}i`.replace(/^ \+ /, '');
};

