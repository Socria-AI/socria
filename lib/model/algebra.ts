// lib/model/algebra.ts
//
// SOLVING A SYSTEM OF EQUATIONS — with real linear algebra, in real code.
//
// WHAT WAS HERE BEFORE: nothing. `SOLVERS` carried a `symbolic` entry marked
// `future: true` whose `requires` returned "a symbolic backend", and that was
// the whole of the engine's algebra. So a model stating
//
//     Qd = 120 − 2·Pc
//     Qs = −20 + 3·Pp
//     Pc = Pp + t,   t = 10
//     Qd = Qs
//
// — four relationships that determine four unknowns exactly — built, graded
// `mathematical`, routed every object to `unsupported`, and drew nothing.
// There was no step at which anything attempted to solve it.
//
// WHY LINEAR FIRST, AND WHY THAT IS NOT A SHORTCUT. A general computer-algebra
// system is a large project and most of it would go unused. A linear system is
// the case that actually turns up — market equilibrium, a resistive circuit,
// a static force balance, a mass balance, a mixture, a budget constraint, two
// lines crossing — and it is the case where the answer is EXACT and the method
// is a page of arithmetic that can be checked. What matters is that the
// arithmetic is done HERE, by this file, and never by a language model.
//
// HOW AN EXPRESSION BECOMES A ROW, without a computer-algebra system.
//
// A linear expression e over unknowns x₁…xₙ is, by definition,
//
//     e(x) = k + Σ cᵢ·xᵢ
//
// so its coefficients can be READ OFF by evaluating it, which is something the
// engine already does:
//
//     k  = e(0, 0, …, 0)
//     cᵢ = e(eᵢ) − k          where eᵢ is the i-th unit vector
//
// That is exact for anything linear and needs no parser beyond `compileExpr`.
// And the same trick CHECKS linearity rather than assuming it: if e is linear
// then e(2eᵢ) − k must equal 2cᵢ, and e(eᵢ + eⱼ) − k must equal cᵢ + cⱼ. A
// square, a product of two unknowns, a sine or a reciprocal fails one of those,
// and this file refuses instead of returning a confident wrong row. That
// refusal is the honest boundary of a linear backend, stated in its own terms.
//
// PURE. No network, no clock, no React. The only thing it needs from the rest
// of the engine is an expression evaluator.

import { compileExpr } from '@/lib/logos-math';

/** How a solve came out. Each is a different thing to tell somebody. */
export type SolveStatus =
  /** exactly one answer, and here it is */
  | 'solved'
  /** consistent, but the equations do not pin every unknown down */
  | 'underdetermined'
  /** more equations than unknowns, and they agree */
  | 'overdetermined-consistent'
  /** the equations contradict each other; there is no answer */
  | 'inconsistent'
  /** an equation is not linear in the unknowns, which this backend cannot do */
  | 'nonlinear'
  /** something was not an equation, or named nothing */
  | 'invalid';

export interface LinearRow {
  /** one coefficient per unknown, in the unknowns' own order */
  coefficients: number[];
  /** the constant, moved to the right-hand side: Σ cᵢxᵢ = rhs */
  rhs: number;
  /** the equation this came from, for a reader and for a refusal */
  from: string;
}

export interface Solved {
  status: SolveStatus;
  /** the unknowns, in the order the coefficients are in */
  unknowns: string[];
  /** the answer, when there is exactly one */
  values?: Record<string, number>;
  /** how many independent equations there really are */
  rank: number;
  /** the largest |Ax − b| over the rows, which is what makes the answer checkable */
  residual?: number;
  /** unknowns the equations leave free, when they leave any */
  free?: string[];
  /** why, in the person's terms — always present, including on success */
  says: string;
  /** the rows, so a reader can see what was actually solved */
  rows?: LinearRow[];
}

/**
 * How close to zero counts as zero.
 *
 * SCALED, not absolute. A market in whole currency units and a circuit in
 * microamps cannot share a fixed epsilon, and a fixed one silently calls a real
 * coefficient zero in the second case. This is the double-precision floor
 * multiplied by the size of the numbers actually in play.
 */
function tolerance(magnitude: number): number {
  return Math.max(1e-12, magnitude * 1e-10);
}

/**
 * Turn `lhs = rhs` into a row over the unknowns.
 *
 * Returns null when the equation is not linear in them, or when either side
 * will not evaluate — and says which, so the refusal can name the equation.
 */
export function linearize(
  equation: string,
  unknowns: readonly string[],
  knowns: Record<string, number>
): { row: LinearRow } | { problem: string } {
  const halves = equation.split('=');
  if (halves.length !== 2) {
    return { problem: `“${equation}” is not an equation: it needs exactly one = sign` };
  }
  // MOVED TO ONE SIDE FIRST. `lhs = rhs` becomes `lhs − (rhs) = 0`, so a single
  // expression carries the whole equation and one probe answers for both sides.
  const whole = `(${halves[0].trim()}) - (${halves[1].trim()})`;
  const names = [...unknowns, ...Object.keys(knowns)];
  const fn = compileExpr(whole, names);
  if (!fn) return { problem: `“${equation}” would not compile over ${names.join(', ')}` };

  const at = (point: Record<string, number>): number => {
    const scope: Record<string, number> = { ...knowns };
    for (const u of unknowns) scope[u.toLowerCase()] = point[u] ?? 0;
    return fn.eval(scope);
  };

  const zero: Record<string, number> = {};
  const k = at(zero);
  if (!Number.isFinite(k)) return { problem: `“${equation}” does not evaluate to a number` };

  const coefficients: number[] = [];
  for (const u of unknowns) {
    const one = at({ [u]: 1 });
    if (!Number.isFinite(one)) return { problem: `“${equation}” does not evaluate when ${u} is 1` };
    const c = one - k;

    // LINEARITY, CHECKED RATHER THAN ASSUMED. Doubling the input must double
    // the coefficient's contribution; anything with a square, a product of two
    // unknowns, a sine or a reciprocal in it will not.
    const two = at({ [u]: 2 });
    if (!Number.isFinite(two) || Math.abs(two - k - 2 * c) > tolerance(Math.abs(c) + Math.abs(k) + 1)) {
      return { problem: `“${equation}” is not linear in ${u}, and this solver does linear systems` };
    }
    // …AND ON THE OTHER SIDE OF ZERO. abs(x), max(0, x) and sqrt(x²) are
    // linear on 0, 1, 2 and not at −1; probing only non-negative points let
    // abs(x) = −3 come back "solved, x = −3, residual 0".
    const minus = at({ [u]: -1.3 });
    if (!Number.isFinite(minus) || Math.abs(minus - k + 1.3 * c) > tolerance(Math.abs(c) + Math.abs(k) + 1)) {
      return { problem: `“${equation}” is not linear in ${u} (it bends on the other side of zero), and this solver does linear systems` };
    }
    coefficients.push(c);
  }

  // …and no cross terms: e(eᵢ + eⱼ) − k must be cᵢ + cⱼ. One pass over the
  // pairs, which is the only way a product of two unknowns shows itself.
  for (let i = 0; i < unknowns.length; i++) {
    for (let j = i + 1; j < unknowns.length; j++) {
      const both = at({ [unknowns[i]]: 1, [unknowns[j]]: 1 });
      const want = k + coefficients[i] + coefficients[j];
      const scale = Math.abs(want) + Math.abs(k) + 1;
      if (!Number.isFinite(both) || Math.abs(both - want) > tolerance(scale)) {
        return {
          problem: `“${equation}” has ${unknowns[i]} and ${unknowns[j]} multiplied together, and this solver does linear systems`,
        };
      }
    }
  }

  // lhs − rhs = 0  →  Σ cᵢxᵢ = −k
  return { row: { coefficients, rhs: -k, from: equation } };
}

/**
 * Gaussian elimination with partial pivoting.
 *
 * Partial pivoting rather than the naive version because the naive version
 * divides by whatever happens to be on the diagonal, and a zero or a tiny value
 * there turns a perfectly good system into nonsense. Choosing the largest
 * available pivot is the standard remedy and costs one scan per column.
 */
export function solveLinear(rows: LinearRow[], unknowns: readonly string[]): Solved {
  const n = unknowns.length;
  const m = rows.length;
  if (!n) return { status: 'invalid', unknowns: [...unknowns], rank: 0, says: 'there are no unknowns to solve for' };
  if (!m) {
    return {
      status: 'underdetermined',
      unknowns: [...unknowns],
      rank: 0,
      free: [...unknowns],
      says: `nothing relates ${unknowns.join(', ')}: ${n} unknown${n === 1 ? '' : 's'} and no equations`,
    };
  }

  // The augmented matrix, copied so the caller's rows are not disturbed.
  const a = rows.map((r) => [...r.coefficients, r.rhs]);
  const scale = Math.max(1, ...a.flat().map((v) => Math.abs(v)).filter(Number.isFinite));
  const eps = tolerance(scale);

  const pivotCol: number[] = [];
  let row = 0;
  for (let col = 0; col < n && row < m; col++) {
    // The largest remaining entry in this column, which is the pivot.
    let best = row;
    for (let r = row + 1; r < m; r++) if (Math.abs(a[r][col]) > Math.abs(a[best][col])) best = r;
    if (Math.abs(a[best][col]) <= eps) continue; // nothing here pins this unknown
    [a[row], a[best]] = [a[best], a[row]];

    const p = a[row][col];
    for (let c = col; c <= n; c++) a[row][c] /= p;
    for (let r = 0; r < m; r++) {
      if (r === row) continue;
      const f = a[r][col];
      if (Math.abs(f) <= eps) continue;
      for (let c = col; c <= n; c++) a[r][c] -= f * a[row][c];
    }
    pivotCol.push(col);
    row++;
  }
  const rank = pivotCol.length;

  // A ROW OF ZEROS WITH A NON-ZERO RIGHT-HAND SIDE SAYS 0 = something, which is
  // the arithmetic form of "these equations contradict each other".
  for (let r = 0; r < m; r++) {
    const allZero = a[r].slice(0, n).every((v) => Math.abs(v) <= eps);
    if (allZero && Math.abs(a[r][n]) > eps) {
      return {
        status: 'inconsistent',
        unknowns: [...unknowns],
        rank,
        rows,
        says:
          `these equations contradict each other — together they require 0 = ${a[r][n].toPrecision(4)}, ` +
          `so no values of ${unknowns.join(', ')} can satisfy all of them at once`,
      };
    }
  }

  if (rank < n) {
    const pinned = new Set(pivotCol);
    const free = unknowns.filter((_, i) => !pinned.has(i));
    return {
      status: 'underdetermined',
      unknowns: [...unknowns],
      rank,
      free,
      rows,
      says:
        `${rank} independent relationship${rank === 1 ? '' : 's'} for ${n} unknowns, so this does not pin ` +
        `${free.join(', ')} down. One more relationship involving ${free.length === 1 ? free[0] : `one of ${free.join(', ')}`} would.`,
    };
  }

  const values: Record<string, number> = {};
  for (let i = 0; i < rank; i++) values[unknowns[pivotCol[i]]] = a[i][n];

  // RESIDUALS, AGAINST THE ORIGINAL ROWS. Checked rather than assumed, because
  // elimination is where a solve goes quietly wrong and the answer looks the
  // same either way.
  let residual = 0;
  for (const r of rows) {
    let lhs = 0;
    for (let i = 0; i < n; i++) lhs += r.coefficients[i] * values[unknowns[i]];
    residual = Math.max(residual, Math.abs(lhs - r.rhs));
  }
  if (!Number.isFinite(residual) || residual > tolerance(scale) * 1e4) {
    return {
      status: 'invalid',
      unknowns: [...unknowns],
      rank,
      residual,
      rows,
      says: `the elimination did not converge: the answer leaves a residual of ${residual.toPrecision(3)}, so it is not being reported as a solution`,
    };
  }

  const over = m > rank;
  return {
    status: over ? 'overdetermined-consistent' : 'solved',
    unknowns: [...unknowns],
    values,
    rank,
    residual,
    rows,
    says: over
      ? `${m} equations for ${n} unknowns, and they agree: ${describe(values)}. The extra ${m - rank} ` +
        `follow${m - rank === 1 ? 's' : ''} from the rest rather than adding anything.`
      : describe(values),
  };
}

function describe(values: Record<string, number>): string {
  return Object.entries(values)
    .map(([k, v]) => `${k} = ${round(v)}`)
    .join(', ');
}

/** Trim floating-point fuzz for display without pretending to more precision. */
function round(v: number): number {
  const r = Number(v.toPrecision(12));
  return Object.is(r, -0) ? 0 : r;
}

/**
 * The whole job: equations and unknowns in, an answer or a named refusal out.
 *
 * `knowns` is every quantity the model has a value for — from the symbol table,
 * so a control, a fitted coefficient and a declared constant all count the same
 * and there is no second opinion about what is bound.
 */
export function solveSystem(
  equations: readonly string[],
  unknowns: readonly string[],
  knowns: Record<string, number>
): Solved {
  const rows: LinearRow[] = [];
  for (const e of equations) {
    const got = linearize(e, unknowns, knowns);
    if ('problem' in got) {
      return {
        status: got.problem.includes('not linear') || got.problem.includes('multiplied together')
          ? 'nonlinear'
          : 'invalid',
        unknowns: [...unknowns],
        rank: 0,
        says: got.problem,
      };
    }
    rows.push(got.row);
  }
  const solved = solveLinear(rows, unknowns);
  // CHECKED AGAINST THE EQUATIONS AS WRITTEN, not against the rows read off
  // them. A relation like min(3p, 30) passes every linearity probe on a
  // stretch where it is linear and is then "solved" at 72, above its own cap.
  // The only check that cannot be fooled is evaluating the originals.
  if (solved.status === 'solved' || solved.status === 'overdetermined-consistent') {
    const scope: Record<string, number> = { ...knowns };
    for (const u of unknowns) scope[u.toLowerCase()] = solved.values?.[u] ?? NaN;
    for (const e of equations) {
      const halves = e.split('=');
      if (halves.length !== 2) continue;
      const fn = compileExpr(`(${halves[0].trim()}) - (${halves[1].trim()})`, [...unknowns, ...Object.keys(knowns)]);
      const r = fn ? fn.eval(scope) : NaN;
      const scale = Math.max(1, ...Object.values(solved.values ?? {}).map((v) => Math.abs(v)));
      if (!Number.isFinite(r) || Math.abs(r) > tolerance(scale) * 1e4) {
        return {
          status: 'nonlinear',
          unknowns: [...unknowns],
          rank: solved.rank,
          says: `“${e}” does not hold at the values a linear solve gives (off by ${Number.isFinite(r) ? r.toPrecision(3) : 'NaN'}): it is not linear over the range that matters, and this solver does linear systems`,
        };
      }
    }
  }
  return solved;
}
