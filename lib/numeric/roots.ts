// lib/numeric/roots.ts
//
// FINDING WHERE THINGS ARE ZERO — all of them, not just the nearest.
//
//   brent        one root in a bracket [a, b] with a sign change, to tolerance
//   allRoots     EVERY root of f on an interval: a scan for sign changes and
//                for near-touches (a double root never changes sign), each
//                refined, each labelled with its branch — the slope's sign —
//                so an implicit relation with two solutions (subsonic and
//                supersonic, weak and strong) returns both, said apart
//   newton       a system F(x) = 0 by Newton's method with a backtracking
//                line search, from the Jacobian
//   multiStart   newton from a lattice of starting points over a box, the
//                solutions de-duplicated — the fixed points of a system
//
// PURE.

export interface Root {
  x: number;
  /** f′'s sign at the root: the branch, when an equation has several */
  slope: number;
  /** a root where f touches zero without crossing (an even multiplicity) */
  touching?: boolean;
}

export function brent(f: (x: number) => number, a: number, b: number, tol = 1e-14, maxIter = 200): number | null {
  let fa = f(a);
  let fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return null;
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) return null;
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let it = 0; it < maxIter; it++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = e = b - a;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      let p: number;
      let q: number;
      const s = fb / fa;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : xm > 0 ? tol1 : -tol1;
    fb = f(b);
    if (!Number.isFinite(fb)) return null;
  }
  return b;
}

export interface AllRootsOptions {
  /** scan points (default 2000) */
  samples?: number;
  /** scan on a logarithmic grid (both ends must be positive) */
  log?: boolean;
  tol?: number;
  /** |f| below this counts as touching zero, scaled by the scan's typical |f| */
  touchTol?: number;
}

export function allRoots(f: (x: number) => number, lo: number, hi: number, opts: AllRootsOptions = {}): Root[] {
  const n = Math.max(16, opts.samples ?? 2000);
  const tol = opts.tol ?? 1e-13;
  const xs: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    xs.push(opts.log && lo > 0 && hi > 0 ? lo * Math.pow(hi / lo, s) : lo + (hi - lo) * s);
  }
  const fs = xs.map((x) => {
    const v = f(x);
    return Number.isFinite(v) ? v : NaN;
  });
  const typical = median(fs.filter(Number.isFinite).map(Math.abs)) || 1;
  const touchTol = (opts.touchTol ?? 1e-9) * typical;
  const roots: Root[] = [];
  const slopeAt = (x: number) => {
    const h = 1e-6 * Math.max(1, Math.abs(x));
    return (f(x + h) - f(x - h)) / (2 * h);
  };
  for (let i = 0; i < n; i++) {
    const a = xs[i];
    const b = xs[i + 1];
    const fa = fs[i];
    const fb = fs[i + 1];
    if (!Number.isFinite(fa) || !Number.isFinite(fb)) continue;
    if (fa === 0) {
      // landing exactly on a root: a crossing if the neighbours disagree in sign, a touch if they agree
      const before = i > 0 ? fs[i - 1] : NaN;
      if (Number.isFinite(before) && before * fb > 0) roots.push({ x: a, slope: 0, touching: true });
      else roots.push({ x: a, slope: Math.sign(slopeAt(a)) });
      continue;
    }
    if (fa * fb < 0) {
      // a sign change across a pole is not a root: f must be small near it
      const r = brent(f, a, b, tol);
      if (r !== null && Math.abs(f(r)) <= Math.max(1e-6 * typical, 1e3 * touchTol)) roots.push({ x: r, slope: Math.sign(slopeAt(r)) });
    }
  }
  if (Number.isFinite(fs[n]) && fs[n] === 0) roots.push({ x: xs[n], slope: Math.sign(slopeAt(xs[n])) });
  // touches: a local minimum of |f| that reaches (nearly) zero without a sign change
  for (let i = 1; i < n; i++) {
    const [p, c, q] = [fs[i - 1], fs[i], fs[i + 1]].map(Math.abs);
    if (!(c <= p && c <= q) || fs[i - 1] * fs[i + 1] <= 0) continue;
    const xm = golden((x) => Math.abs(f(x)), xs[i - 1], xs[i + 1]);
    if (Math.abs(f(xm)) <= touchTol && !roots.some((r) => Math.abs(r.x - xm) < 1e-7 * Math.max(1, Math.abs(xm)))) roots.push({ x: xm, slope: 0, touching: true });
  }
  return roots.sort((u, v) => u.x - v.x).filter((r, i, arr) => i === 0 || Math.abs(r.x - arr[i - 1].x) > 1e-10 * Math.max(1, Math.abs(r.x)));
}

function golden(g: (x: number) => number, a: number, b: number): number {
  const R = (Math.sqrt(5) - 1) / 2;
  let c = b - R * (b - a);
  let d = a + R * (b - a);
  for (let i = 0; i < 100 && Math.abs(b - a) > 1e-15 * Math.max(1, Math.abs(a)); i++) {
    if (g(c) < g(d)) b = d;
    else a = c;
    c = b - R * (b - a);
    d = a + R * (b - a);
  }
  return (a + b) / 2;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// ── systems ─────────────────────────────────────────────────────────

export type VecFn = (x: readonly number[]) => number[];
export type JacFn = (x: readonly number[]) => number[][];

/** Central-difference Jacobian, for when no symbolic one is at hand. */
export function numJacobian(F: VecFn, x: readonly number[]): number[][] {
  const n = x.length;
  const f0 = F(x);
  const J = f0.map(() => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const h = 1e-6 * Math.max(1, Math.abs(x[j]));
    const xp = x.slice();
    const xm = x.slice();
    xp[j] += h;
    xm[j] -= h;
    const fp = F(xp);
    const fm = F(xm);
    for (let i = 0; i < f0.length; i++) J[i][j] = (fp[i] - fm[i]) / (2 * h);
  }
  return J;
}

export interface NewtonResult {
  x: number[];
  converged: boolean;
  iterations: number;
  residual: number;
}

export function newton(F: VecFn, x0: readonly number[], opts: { J?: JacFn; tol?: number; maxIter?: number } = {}): NewtonResult {
  const tol = opts.tol ?? 1e-12;
  const J = opts.J ?? ((x: readonly number[]) => numJacobian(F, x));
  let x = x0.slice();
  let fx = F(x);
  let r = Math.hypot(...fx);
  for (let it = 0; it < (opts.maxIter ?? 60); it++) {
    if (!Number.isFinite(r)) return { x, converged: false, iterations: it, residual: r };
    if (r <= tol * Math.max(1, Math.hypot(...x))) return { x, converged: true, iterations: it, residual: r };
    const Jx = J(x);
    const dx = solveSmall(Jx, fx.map((v) => -v));
    if (!dx) return { x, converged: false, iterations: it, residual: r };
    // backtracking: halve the step until the residual falls
    let lam = 1;
    let xn = x;
    let fn = fx;
    let rn = r;
    for (let k = 0; k < 30; k++) {
      xn = x.map((v, i) => v + lam * dx[i]);
      fn = F(xn);
      rn = Math.hypot(...fn);
      if (Number.isFinite(rn) && rn < (1 - 1e-4 * lam) * r) break;
      lam /= 2;
    }
    if (!(rn < r)) {
      // no descent: a full step anyway, once, then give up if it fails
      if (lam < 1e-8) return { x, converged: r <= 1e-9, iterations: it, residual: r };
    }
    x = xn;
    fx = fn;
    r = rn;
  }
  return { x, converged: r <= tol * Math.max(1, Math.hypot(...x)) * 1e3, iterations: opts.maxIter ?? 60, residual: r };
}

/** Gaussian elimination with partial pivoting for the Newton step; null when singular. */
function solveSmall(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    if (Math.abs(M[p][k]) < 1e-300) return null;
    [M[p], M[k]] = [M[k], M[p]];
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x.every(Number.isFinite) ? x : null;
}

/** Newton from a lattice over a box; distinct converged solutions inside the box (slightly widened). */
export function multiStart(F: VecFn, box: readonly (readonly [number, number])[], opts: { J?: JacFn; perAxis?: number; maxStarts?: number; tol?: number } = {}): number[][] {
  const dim = box.length;
  const per = opts.perAxis ?? Math.max(2, Math.min(9, Math.floor(Math.pow(opts.maxStarts ?? 400, 1 / dim))));
  const starts: number[][] = [];
  const idx = new Array(dim).fill(0);
  const total = Math.pow(per, dim);
  for (let s = 0; s < total; s++) {
    let k = s;
    for (let d = 0; d < dim; d++) {
      idx[d] = k % per;
      k = Math.floor(k / per);
    }
    // offset by half a cell, and a little irrational jitter so symmetric lattices do not sit on separatrices
    starts.push(idx.map((i, d) => box[d][0] + ((i + 0.5 + 0.0137 * (d + 1)) / per) * (box[d][1] - box[d][0])));
  }
  const out: number[][] = [];
  const widen = box.map(([a, b]) => [a - 0.05 * (b - a), b + 0.05 * (b - a)] as const);
  for (const x0 of starts) {
    const r = newton(F, x0, { J: opts.J, tol: opts.tol });
    if (!r.converged) continue;
    if (!r.x.every((v, d) => v >= widen[d][0] && v <= widen[d][1])) continue;
    const scale = Math.max(1, ...r.x.map(Math.abs));
    if (out.some((y) => Math.hypot(...y.map((v, i) => v - r.x[i])) < 1e-6 * scale)) continue;
    out.push(r.x.map((v) => (Math.abs(v) < 1e-12 * scale ? 0 : v)));
  }
  return out.sort((a, b) => a[0] - b[0] || (a[1] ?? 0) - (b[1] ?? 0));
}
