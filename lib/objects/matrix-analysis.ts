// lib/objects/matrix-analysis.ts
//
// WHAT A MATRIX IS — Strang's picture of it, computed from its entries.
//
// The matrix object of thought (matrix.ts) is about elimination: the steps a
// person takes and what each does. This is the other half — what the matrix
// IS, whatever steps anyone takes:
//
//   its rank, and its four fundamental subspaces, each with a basis and its
//     dimension (r, n − r, r, m − r) — exact, as fractions, wherever the
//     entries are;
//   A = CR: its independent columns, and how every column is made of them;
//   for a square matrix, its determinant (exact), eigenvalues and
//     eigenvectors, and whether it can be diagonalized;
//   its singular values and condition number;
//   for a 2 × 2, what it does to the plane, in words: a rotation, a
//     reflection, a shear, a projection, a stretch along two directions;
//   for an augmented matrix, what Ax = b has: one solution, none, or a
//     particular one plus the null space.
//
// Every number is computed here, from the entries, by lib/numeric/linalg.ts
// and exact rational arithmetic; none is recalled. A learner working by hand
// is not shown these unless they ask (`guarded` in matrix.ts) — the steps are
// theirs to take.
//
// PURE.

import { eigen, subspaces, svd, cond, type Mat } from '@/lib/numeric/linalg';
import { div, isZero, mul, neg, parseQ, say, sub, toNumber, ZERO, type Q } from './rational';
import type { MatrixState } from './matrix';

const fmt = (v: number) => {
  const r = Number(v.toPrecision(4));
  return (Object.is(r, -0) ? '0' : String(r)).replace(/^-/, '−');
};

/** A float that came from rational arithmetic, back as a fraction: p/q with q ≤ 10⁴, when one is within 10⁻⁹. */
export function frac(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) < 1e-12) return '0';
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, x = Math.abs(v);
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(x);
    [h1, h0] = [a * h1 + h0, h1];
    [k1, k0] = [a * k1 + k0, k1];
    if (k1 > 10_000) break;
    if (Math.abs(h1 / k1 - Math.abs(v)) < 1e-9 * Math.max(1, Math.abs(v))) {
      const s = `${v < 0 ? '−' : ''}${h1}${k1 === 1 ? '' : `/${k1}`}`;
      return s;
    }
    const f = x - a;
    if (f < 1e-15) break;
    x = 1 / f;
  }
  return fmt(v);
}

const vec = (v: readonly number[]) => `(${v.map(frac).join(', ')})`;
const columns = (M: Mat): number[][] => (M.length && M[0].length ? M[0].map((_, j) => M.map((r) => r[j])) : []);

/** The determinant, exactly, by elimination in rationals. */
function detExact(m: Q[][]): Q {
  const a = m.map((r) => r.slice());
  const n = a.length;
  let d: Q = { n: 1, d: 1 };
  for (let c = 0; c < n; c++) {
    let p = c;
    while (p < n && isZero(a[p][c])) p++;
    if (p === n) return ZERO;
    if (p !== c) {
      [a[p], a[c]] = [a[c], a[p]];
      d = neg(d);
    }
    d = mul(d, a[c][c]);
    for (let r = c + 1; r < n; r++) {
      if (isZero(a[r][c])) continue;
      const f = div(a[r][c], a[c][c]);
      for (let k = c; k < n; k++) a[r][k] = sub(a[r][k], mul(f, a[c][k]));
    }
  }
  return d;
}

/** Reduced row echelon form, exactly. */
function rrefExact(m: Q[][]): { R: Q[][]; pivots: number[] } {
  const a = m.map((r) => r.slice());
  const rows = a.length;
  const cols = a[0].length;
  const pivots: number[] = [];
  let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    let p = r;
    while (p < rows && isZero(a[p][c])) p++;
    if (p === rows) continue;
    [a[p], a[r]] = [a[r], a[p]];
    const lead = a[r][c];
    for (let k = 0; k < cols; k++) a[r][k] = div(a[r][k], lead);
    for (let i = 0; i < rows; i++) {
      if (i === r || isZero(a[i][c])) continue;
      const f = a[i][c];
      for (let k = 0; k < cols; k++) a[i][k] = sub(a[i][k], mul(f, a[r][k]));
    }
    pivots.push(c);
    r++;
  }
  return { R: a, pivots };
}

export interface MatrixAnalysis {
  /** the coefficient part's shape */
  m: number;
  n: number;
  rank: number;
  subspaces: {
    column: string[];
    row: string[];
    null: string[];
    leftNull: string[];
    dims: { column: number; row: number; null: number; leftNull: number };
  };
  /** A = CR: which columns are independent, and R exactly */
  cr: { pivots: number[]; R: string[][] };
  square?: { det: string; invertible: boolean; eigen: string[]; diagonalizable: boolean };
  singular: string[];
  condition?: string;
  /** a 2 × 2's action on the plane, in words */
  plane?: string;
  /** an augmented matrix's system */
  system?: string;
  /** the same, as sentences for the conversation */
  facts: string[];
}

/** What a 2 × 2 does to the plane, from its own numbers. */
function planeReading(A: number[][]): string {
  const [[a, b], [c, d]] = A;
  const det = a * d - b * c;
  const tol = 1e-12 * Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  const area = Math.abs(det) < tol ? '' : ` Areas are multiplied by ${frac(Math.abs(det))}${det < 0 ? ', and the plane is flipped over' : ''}.`;
  if ([a, b, c, d].every((v) => Math.abs(v) < tol)) return 'It sends every vector to zero.';
  if (Math.abs(det) < tol) {
    const col = Math.abs(a) + Math.abs(c) > tol ? [a, c] : [b, d];
    const nul = Math.abs(a) + Math.abs(b) > tol ? [-b, a] : [-d, c];
    return `It collapses the plane onto the line through ${vec(col)} — its column space — and everything along ${vec(nul)}, its null space, goes to zero.`;
  }
  const orth = Math.abs(a * a + c * c - 1) < 1e-9 && Math.abs(b * b + d * d - 1) < 1e-9 && Math.abs(a * b + c * d) < 1e-9;
  if (orth) {
    const ang = (Math.atan2(c, a) * 180) / Math.PI;
    if (det > 0) return `It is a rotation by ${fmt(ang)}°: lengths and angles are kept.`;
    return `It is a reflection across the line at ${fmt(ang / 2)}° to the x-axis: lengths are kept and the plane is flipped over.`;
  }
  const tr = a + d;
  const disc = tr * tr - 4 * det;
  if (disc < -tol) {
    const r = Math.sqrt(det);
    const th = (Math.acos(Math.max(-1, Math.min(1, tr / (2 * r)))) * 180) / Math.PI;
    return `Its eigenvalues are complex, r·e^{±iθ} with r = ${fmt(r)} and θ = ${fmt(th)}°: in the right basis it turns every vector by θ and scales it by r — no direction is kept.${area}`;
  }
  const l1 = (tr + Math.sqrt(Math.max(0, disc))) / 2;
  const l2 = (tr - Math.sqrt(Math.max(0, disc))) / 2;
  // an eigenvector, scaled so its largest entry is 1 — the same way the eigen line writes it
  const dirOf = (l: number) => {
    const v = Math.abs(b) > tol ? [b, l - a] : Math.abs(c) > tol ? [l - d, c] : Math.abs(a - l) < tol ? [1, 0] : [0, 1];
    const big = Math.abs(v[0]) >= Math.abs(v[1]) ? v[0] : v[1];
    return v.map((x) => x / big);
  };
  if (Math.abs(disc) <= tol) {
    if (Math.abs(b) < tol && Math.abs(c) < tol) return `It scales every vector by ${frac(l1)}.${area}`;
    return `It is a shear${Math.abs(l1 - 1) > tol ? ` with a stretch of ${frac(l1)}` : ''}: one direction, ${vec(dirOf(l1))}, is kept, and everything else slides along it — there is no second eigenvector.${area}`;
  }
  const sym = Math.abs(b - c) < tol;
  return `It stretches by ${frac(l1)} along ${vec(dirOf(l1))} and by ${frac(l2)} along ${vec(dirOf(l2))}${sym ? ' — perpendicular directions, because it is symmetric' : ''}${l1 < 0 || l2 < 0 ? '; a negative stretch reverses that direction' : ''}.${area}`;
}

export function analyseMatrix(s: MatrixState): MatrixAnalysis | null {
  const all = s.rows.map((r) => r.map((v) => parseQ(v)));
  if (all.some((r) => r.some((v) => !v))) return null;
  const Qm = all as Q[][];
  const coef = s.aug ? Qm.map((r) => r.slice(0, -1)) : Qm;
  const m = coef.length;
  const n = coef[0]?.length ?? 0;
  if (!m || !n) return null;
  const A: Mat = coef.map((r) => r.map(toNumber));
  const sub4 = subspaces(A);
  const R = rrefExact(coef);
  const out: MatrixAnalysis = {
    m,
    n,
    rank: R.pivots.length,
    subspaces: {
      column: R.pivots.map((j) => vec(coef.map((r) => toNumber(r[j])))),
      row: R.R.slice(0, R.pivots.length).map((r) => `(${r.map(say).join(', ')})`),
      null: columns(sub4.nullspace).map(vec),
      leftNull: columns(sub4.leftNullspace).map(vec),
      dims: { column: R.pivots.length, row: R.pivots.length, null: n - R.pivots.length, leftNull: m - R.pivots.length },
    },
    cr: { pivots: R.pivots, R: R.R.slice(0, R.pivots.length).map((r) => r.map(say)) },
    singular: svd(A).S.map(fmt),
    facts: [],
  };
  const r = out.rank;
  const f = out.facts;
  f.push(`Rank ${r}: the column space and the row space have dimension ${r}; the null space ${n - r} (in ${n} dimensions) and the left null space ${m - r} (in ${m}).`);
  f.push(`Column space: spanned by column${r === 1 ? '' : 's'} ${R.pivots.map((j) => j + 1).join(', ')} of A — ${out.subspaces.column.join(', ') || 'nothing'}.`);
  f.push(`Row space: spanned by ${out.subspaces.row.join(', ') || 'nothing'} — the nonzero rows of its reduced echelon form.`);
  f.push(out.subspaces.null.length ? `Null space: spanned by ${out.subspaces.null.join(', ')} — one special solution of Ax = 0 for each free column.` : 'Null space: only the zero vector — the columns are independent.');
  f.push(out.subspaces.leftNull.length ? `Left null space: spanned by ${out.subspaces.leftNull.join(', ')} — the combinations of the rows that give zero.` : 'Left null space: only the zero vector — the rows are independent.');
  if (r > 0) f.push(`A = CR: C is column${r === 1 ? '' : 's'} ${R.pivots.map((j) => j + 1).join(', ')} of A, and R = [${out.cr.R.map((row) => row.join(' ')).join('; ')}] says how every column is made of them.`);
  if (m === n) {
    const d = detExact(coef);
    const e = eigen(A);
    const eig = e.distinct.map((p) => {
      const val = Math.abs(p.value.im) < 1e-10 ? frac(p.value.re) : `${fmt(p.value.re)} ${p.value.im < 0 ? '−' : '+'} ${fmt(Math.abs(p.value.im))}i`;
      const real = p.vector.every((c) => Math.abs(c.im) < 1e-10);
      // the eigenvector scaled so its largest entry is 1, which brings a rational one back to small fractions
      const big = real ? p.vector.reduce((acc, c) => (Math.abs(c.re) > Math.abs(acc) ? c.re : acc), 0) : 0;
      const v = real && Math.abs(big) > 1e-12 ? vec(p.vector.map((c) => c.re / big)) : '';
      return `${val}${p.algebraic > 1 ? ` (×${p.algebraic})` : ''}${v ? ` along ${v}` : ''}`;
    });
    out.square = { det: say(d), invertible: !isZero(d), eigen: eig, diagonalizable: e.diagonalizable };
    f.push(`det A = ${say(d)}${isZero(d) ? ': it is singular — no inverse' : ': it is invertible'}.`);
    f.push(`Eigenvalues: ${eig.join('; ')}${e.diagonalizable ? '' : ' — not diagonalizable: an eigenvalue repeats with too few eigenvectors'}. Their sum is the trace, ${frac(e.trace)}, and their product the determinant.`);
    if (!isZero(d)) out.condition = fmt(cond(A));
  }
  f.push(`Singular values: ${out.singular.join(', ')}${out.condition ? `; condition number ${out.condition}` : ''}.`);
  if (m === 2 && n === 2) {
    out.plane = planeReading(A);
    f.push(`On the plane: ${out.plane}`);
  }
  if (s.aug) {
    const full = rrefExact(Qm);
    const inconsistent = full.pivots.includes(n);
    if (inconsistent) out.system = 'Ax = b has no solution: b is not in the column space of A — elimination leaves a row 0 = nonzero.';
    else {
      const x: Q[] = Array.from({ length: n }, () => ZERO);
      full.pivots.forEach((c, i) => (x[c] = full.R[i][n]));
      const xp = `(${x.map(say).join(', ')})`;
      out.system =
        r === n
          ? `Ax = b has exactly one solution, x = ${xp}.`
          : `Ax = b has infinitely many solutions: x = ${xp} plus any combination of the ${n - r} special solution${n - r === 1 ? '' : 's'} in the null space.`;
    }
    f.push(out.system);
  }
  return out;
}

/** The analysis's sentences, for the facts a matrix object gives the conversation. */
export function analysisFacts(s: MatrixState): string[] {
  return analyseMatrix(s)?.facts ?? [];
}

