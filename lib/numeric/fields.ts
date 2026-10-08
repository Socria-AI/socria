// lib/numeric/fields.ts
//
// FIELDS ON GRIDS — quantities that vary over space as well as time, stepped
// by methods whose accuracy and stability are known and stated.
//
//   heat1D            u_t = (α u_x)_x + q(x, t, u) on [x₀, x₁], Dirichlet or
//                     Neumann at each end. Crank–Nicolson (second order in
//                     space and time, unconditionally stable), the tridiagonal
//                     system solved exactly by the Thomas algorithm; a source
//                     treated explicitly. Fully implicit Euler on request, for
//                     a start with a discontinuity, where Crank–Nicolson rings.
//   reactionDiffusion2D
//                     two species on a periodic grid: u_t = D_u ∇²u + f(u, v),
//                     v_t = D_v ∇²v + g(u, v) — Gray–Scott, FitzHugh–Nagumo
//                     media, anything of that form. Forward Euler with the
//                     five-point Laplacian, which is stable only for
//                     dt ≤ h²/(4·max D): the step is checked against that bound
//                     and refused above it rather than allowed to blow up.
//   heatModes         the exact Fourier-series solution of the 1D problem with
//                     homogeneous Dirichlet ends, as the reference the solver is
//                     judged by.
//
// PURE. Numbers in, numbers out.

export type Bound = { type: 'dirichlet'; value: number | ((t: number) => number) } | { type: 'neumann'; flux: number | ((t: number) => number) };

export interface Heat1D {
  x0: number;
  x1: number;
  /** interior intervals: the grid has n + 1 points */
  n: number;
  /** diffusivity, constant or by position */
  alpha: number | ((x: number) => number);
  left: Bound;
  right: Bound;
  init: (x: number) => number;
  /** a source term q(x, t, u), treated explicitly */
  source?: (x: number, t: number, u: number) => number;
}

export interface FieldRun {
  x: number[];
  /** the times kept */
  t: number[];
  /** u[k] is the field at t[k] */
  u: number[][];
  stats: { steps: number; dt: number; scheme: string; stable: string };
}

const at = (b: number | ((t: number) => number), t: number) => (typeof b === 'number' ? b : b(t));

/** Solve a tridiagonal system a_i x_{i−1} + b_i x_i + c_i x_{i+1} = d_i (Thomas). */
export function thomas(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): number[] {
  const n = b.length;
  const cp = new Array(n).fill(0);
  const dp = new Array(n).fill(0);
  cp[0] = c[0] / b[0];
  dp[0] = d[0] / b[0];
  for (let i = 1; i < n; i++) {
    const m = b[i] - a[i] * cp[i - 1];
    cp[i] = i < n - 1 ? c[i] / m : 0;
    dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
  }
  const x = new Array(n).fill(0);
  x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  return x;
}

/**
 * The 1D diffusion equation, stepped from t = 0 to tEnd. The grid is uniform;
 * a Neumann end imposes −α u_x (left) or α u_x (right) = flux through a ghost
 * point, so a zero flux is an insulated end. Snapshots are kept at `keep`
 * evenly spaced times (and always the first and last).
 */
export function heat1D(p: Heat1D, tEnd: number, opts: { dt?: number; keep?: number; scheme?: 'crank-nicolson' | 'implicit'; maxSteps?: number } = {}): FieldRun {
  const n = Math.max(2, Math.round(p.n));
  const h = (p.x1 - p.x0) / n;
  const x = Array.from({ length: n + 1 }, (_, i) => p.x0 + i * h);
  const al = x.map((xi) => (typeof p.alpha === 'number' ? p.alpha : p.alpha(xi)));
  // α at the half points, for (α u_x)_x in conservative form
  const ah = Array.from({ length: n }, (_, i) => (al[i] + al[i + 1]) / 2);
  const scheme = opts.scheme ?? 'crank-nicolson';
  const theta = scheme === 'implicit' ? 1 : 0.5;
  const amax = Math.max(...al);
  const dt = opts.dt ?? Math.min(tEnd / 50, (0.5 * h * h) / Math.max(amax, 1e-300));
  const steps = Math.min(opts.maxSteps ?? 200_000, Math.max(1, Math.ceil(tEnd / dt - 1e-9)));
  const k = tEnd / steps;
  let u = x.map(p.init);
  const keep = Math.max(2, opts.keep ?? 41);
  const marks = new Set(Array.from({ length: keep }, (_, j) => Math.round((j * steps) / (keep - 1))));
  const T: number[] = [0];
  const U: number[][] = [u.slice()];
  // L u at an interior point i (and at a Neumann boundary through its ghost)
  const L = (v: readonly number[], i: number, t: number): number => {
    if (i === 0) {
      if (p.left.type === 'dirichlet') return 0;
      // ghost v₋₁ = v₁ + 2h·flux/α  (−α u_x = flux at the left)
      const g = v[1] + (2 * h * at(p.left.flux, t)) / al[0];
      return (al[0] * (v[1] - 2 * v[0] + g)) / (h * h);
    }
    if (i === n) {
      if (p.right.type === 'dirichlet') return 0;
      const g = v[n - 1] + (2 * h * at(p.right.flux, t)) / al[n];
      return (al[n] * (g - 2 * v[n] + v[n - 1])) / (h * h);
    }
    return (ah[i] * (v[i + 1] - v[i]) - ah[i - 1] * (v[i] - v[i - 1])) / (h * h);
  };
  for (let s = 1; s <= steps; s++) {
    const t0 = (s - 1) * k;
    const t1 = s * k;
    const a = new Array(n + 1).fill(0);
    const b = new Array(n + 1).fill(1);
    const c = new Array(n + 1).fill(0);
    const d = new Array(n + 1).fill(0);
    for (let i = 0; i <= n; i++) {
      const q = p.source ? p.source(x[i], t0, u[i]) : 0;
      d[i] = u[i] + (1 - theta) * k * L(u, i, t0) + k * q;
      if (i === 0 && p.left.type === 'dirichlet') {
        b[0] = 1;
        d[0] = at(p.left.value, t1);
        continue;
      }
      if (i === n && p.right.type === 'dirichlet') {
        b[n] = 1;
        d[n] = at(p.right.value, t1);
        continue;
      }
      const r = (theta * k) / (h * h);
      if (i === 0) {
        // Neumann left: the ghost folds into the first row
        b[0] = 1 + 2 * r * al[0];
        c[0] = -2 * r * al[0];
        d[0] += (theta * k * (2 * h * at((p.left as { flux: number | ((t: number) => number) }).flux, t1)) * al[0]) / al[0] / (h * h);
      } else if (i === n) {
        b[n] = 1 + 2 * r * al[n];
        a[n] = -2 * r * al[n];
        d[n] += (theta * k * (2 * h * at((p.right as { flux: number | ((t: number) => number) }).flux, t1)) * al[n]) / al[n] / (h * h);
      } else {
        a[i] = -r * ah[i - 1];
        b[i] = 1 + r * (ah[i - 1] + ah[i]);
        c[i] = -r * ah[i];
      }
    }
    u = thomas(a, b, c, d);
    if (marks.has(s)) {
      T.push(t1);
      U.push(u.slice());
    }
  }
  return {
    x,
    t: T,
    u: U,
    stats: {
      steps,
      dt: k,
      scheme: scheme === 'implicit' ? 'implicit Euler (first order in time, unconditionally stable)' : 'Crank–Nicolson (second order in space and time, unconditionally stable)',
      stable: `r = α·dt/h² = ${((amax * k) / (h * h)).toPrecision(3)}${scheme === 'crank-nicolson' && (amax * k) / (h * h) > 1 ? ' — stable, but a sharp start may ring at this step' : ''}`,
    },
  };
}

/**
 * The exact solution of u_t = α u_xx on [0, L] with u(0) = u(L) = 0:
 * u = Σ bₙ e^{−α(nπ/L)² t} sin(nπx/L), bₙ = (2/L)∫₀ᴸ u₀ sin(nπx/L) dx,
 * the coefficients by Simpson's rule on the initial condition.
 */
export function heatModes(u0: (x: number) => number, L: number, alpha: number, modes = 200, quad = 2000): (x: number, t: number) => number {
  const b: number[] = [];
  const h = L / quad;
  for (let m = 1; m <= modes; m++) {
    let s = 0;
    for (let i = 0; i <= quad; i++) {
      const x = i * h;
      const w = i === 0 || i === quad ? 1 : i % 2 ? 4 : 2;
      s += w * u0(x) * Math.sin((m * Math.PI * x) / L);
    }
    b.push(((2 / L) * s * h) / 3);
  }
  return (x, t) => b.reduce((acc, bm, j) => acc + bm * Math.exp(-alpha * ((((j + 1) * Math.PI) / L) ** 2) * t) * Math.sin(((j + 1) * Math.PI * x) / L), 0);
}

// ── two species on a periodic plane ─────────────────────────────────

export interface ReactionDiffusion {
  /** cells per side */
  n: number;
  /** cell size */
  h: number;
  Du: number;
  Dv: number;
  /** the reaction: [du/dt, dv/dt] from the local values */
  react: (u: number, v: number) => [number, number];
  u0: Float64Array | number[];
  v0: Float64Array | number[];
}

export interface Field2DRun {
  n: number;
  t: number[];
  u: Float64Array[];
  v: Float64Array[];
  stats: { steps: number; dt: number; limit: number; method: string };
}

/**
 * Two species reacting and diffusing on an n × n periodic grid, by forward
 * Euler with the five-point Laplacian. REFUSES a step above the stability
 * bound h²/(4·max D) — a run that would grow without bound is not returned as
 * a picture.
 */
export function reactionDiffusion2D(p: ReactionDiffusion, tEnd: number, opts: { dt?: number; keep?: number; maxSteps?: number } = {}): Field2DRun | { refused: string } {
  const n = p.n;
  const N = n * n;
  const limit = (p.h * p.h) / (4 * Math.max(p.Du, p.Dv, 1e-300));
  const dt = opts.dt ?? 0.9 * limit;
  if (dt > limit * (1 + 1e-12)) return { refused: `a step of ${dt} is above the stability limit h²/(4·max D) = ${limit.toPrecision(4)} for forward Euler; take a smaller one` };
  const steps = Math.min(opts.maxSteps ?? 200_000, Math.max(1, Math.ceil(tEnd / dt - 1e-9)));
  const k = tEnd / steps;
  let u = Float64Array.from(p.u0);
  let v = Float64Array.from(p.v0);
  let un = new Float64Array(N);
  let vn = new Float64Array(N);
  const keep = Math.max(2, opts.keep ?? 11);
  const marks = new Set(Array.from({ length: keep }, (_, j) => Math.round((j * steps) / (keep - 1))));
  const T: number[] = [0];
  const Us: Float64Array[] = [u.slice()];
  const Vs: Float64Array[] = [v.slice()];
  const ih2 = 1 / (p.h * p.h);
  for (let s = 1; s <= steps; s++) {
    for (let j = 0; j < n; j++) {
      const jm = ((j - 1 + n) % n) * n;
      const jp = ((j + 1) % n) * n;
      const j0 = j * n;
      for (let i = 0; i < n; i++) {
        const im = (i - 1 + n) % n;
        const ip = (i + 1) % n;
        const c = j0 + i;
        const lu = (u[j0 + im] + u[j0 + ip] + u[jm + i] + u[jp + i] - 4 * u[c]) * ih2;
        const lv = (v[j0 + im] + v[j0 + ip] + v[jm + i] + v[jp + i] - 4 * v[c]) * ih2;
        const [fu, fv] = p.react(u[c], v[c]);
        un[c] = u[c] + k * (p.Du * lu + fu);
        vn[c] = v[c] + k * (p.Dv * lv + fv);
      }
    }
    [u, un] = [un, u];
    [v, vn] = [vn, v];
    if (marks.has(s)) {
      T.push(s * k);
      Us.push(u.slice());
      Vs.push(v.slice());
    }
  }
  return { n, t: T, u: Us, v: Vs, stats: { steps, dt: k, limit, method: 'forward Euler, five-point Laplacian, periodic edges' } };
}

/** Gray–Scott: u + 2v → 3v, fed at rate F and drained at F + k. */
export const grayScott = (F: number, k: number) => (u: number, v: number): [number, number] => {
  const uvv = u * v * v;
  return [-uvv + F * (1 - u), uvv - (F + k) * v];
};
