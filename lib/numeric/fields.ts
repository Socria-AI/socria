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

// ── many species on a line: diffusion, transport and reaction ─────────
//
// transport1D steps  u_t = (D(x) u_x)_x − F(u)_x + R(x, t, u⃗)  for each of up
// to four species, on a line with an end condition at each end or on a ring.
//
//   diffusion   Crank–Nicolson, the tridiagonal system solved exactly (Thomas;
//               on a ring, the cyclic system by Sherman–Morrison). Second
//               order, unconditionally stable.
//   transport   the flux F(u) through each face by Rusanov's (local
//               Lax–Friedrichs) rule: first order in space, monotone, and it
//               smears a shock over a few cells rather than ringing.
//   reaction    whatever the rates say, from the fields at the step's start.
//
// Transport and reaction are stepped explicitly by Heun's method (second
// order, and stable for this flux up to a Courant number of one) in two half
// steps either side of the implicit diffusion: Strang splitting, second order
// in time overall. With neither, a step is Crank–Nicolson exactly, and the
// result is heat1D's.
//
// The step adapts to the transport's own speed — dt ≤ 0.9·h / max|F′(u)| — and
// lands on every time kept. A field that stops being finite ends the run, and
// says when; a run that would need more steps than its budget stops there and
// says so.

/** An end condition: a value held there, or a flux into the domain through it (0 is insulated). */
export type End = { type: 'value'; at: (t: number) => number } | { type: 'flux'; at: (t: number) => number };

export interface Transport1D {
  x0: number;
  x1: number;
  /** grid intervals: n + 1 nodes with ends, n on a ring */
  n: number;
  periodic?: boolean;
  species: {
    /** diffusivity at every node; a face takes the mean of its two */
    D: ArrayLike<number>;
    left?: End;
    right?: End;
    init: ArrayLike<number>;
  }[];
  /** the rates at every node, written into out[s], from the fields at time t */
  react?: (t: number, u: Float64Array[], out: Float64Array[]) => void;
  /** the transported flux F_s(u) at every node, and its speed |∂F_s/∂u_s| there, for the species that are transported */
  flux?: (t: number, u: Float64Array[], F: Float64Array[], speed: Float64Array[]) => void;
  /** which species the flux carries */
  transported?: boolean[];
}

export interface Transport1DRun {
  x: number[];
  /** the times kept */
  t: number[];
  /** u[s][k] is species s at t[k] */
  u: Float64Array[][];
  stats: {
    steps: number;
    dtMin: number;
    dtMax: number;
    scheme: string;
    /** why it ended early, and when */
    stopped: null | { why: 'diverged' | 'budget'; at: number };
  };
}

/** Thomas into typed arrays, no allocation: a_i x_{i−1} + b_i x_i + c_i x_{i+1} = d_i. `cp`, `dp` are scratch. */
function thomasInto(a: Float64Array, b: Float64Array, c: Float64Array, d: Float64Array, x: Float64Array, cp: Float64Array, dp: Float64Array, n: number): void {
  cp[0] = c[0] / b[0];
  dp[0] = d[0] / b[0];
  for (let i = 1; i < n; i++) {
    const m = b[i] - a[i] * cp[i - 1];
    cp[i] = i < n - 1 ? c[i] / m : 0;
    dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
  }
  x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
}

/**
 * The cyclic tridiagonal system — a ring, where a_0 couples x_{n−1} and c_{n−1}
 * couples x_0 — by Sherman–Morrison: two ordinary solves and a correction.
 */
export function cyclicThomas(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): number[] {
  const n = b.length;
  const A = Float64Array.from(a), B = Float64Array.from(b), C = Float64Array.from(c), D = Float64Array.from(d);
  const x = new Float64Array(n);
  cyclicInto(A, B, C, D, x, n, { bb: new Float64Array(n), z: new Float64Array(n), u: new Float64Array(n), cp: new Float64Array(n), dp: new Float64Array(n) });
  return Array.from(x);
}

function cyclicInto(a: Float64Array, b: Float64Array, c: Float64Array, d: Float64Array, x: Float64Array, n: number, s: { bb: Float64Array; z: Float64Array; u: Float64Array; cp: Float64Array; dp: Float64Array }): void {
  const alpha = a[0];
  const beta = c[n - 1];
  const gamma = -b[0];
  s.bb.set(b);
  s.bb[0] = b[0] - gamma;
  s.bb[n - 1] = b[n - 1] - (alpha * beta) / gamma;
  thomasInto(a, s.bb, c, d, x, s.cp, s.dp, n);
  s.u.fill(0);
  s.u[0] = gamma;
  s.u[n - 1] = beta;
  thomasInto(a, s.bb, c, s.u, s.z, s.cp, s.dp, n);
  const fact = (x[0] + (alpha * x[n - 1]) / gamma) / (1 + s.z[0] + (alpha * s.z[n - 1]) / gamma);
  for (let i = 0; i < n; i++) x[i] -= fact * s.z[i];
}

export function transport1D(
  p: Transport1D,
  tEnd: number,
  opts: { dt?: number; keep?: number; maxSteps?: number } = {}
): Transport1DRun {
  const ring = !!p.periodic;
  const n = Math.max(ring ? 3 : 2, Math.round(p.n));
  const N = ring ? n : n + 1;
  const h = (p.x1 - p.x0) / n;
  const x = Array.from({ length: N }, (_, i) => p.x0 + i * h);
  const K = p.species.length;
  const moved = p.transported ?? p.species.map(() => !!p.flux);
  // diffusivity at the nodes and at the faces (face i between node i and i+1, wrapping on a ring)
  const Dn = p.species.map((sp) => Float64Array.from({ length: N }, (_, i) => sp.D[i] ?? 0));
  const F = ring ? N : N - 1;
  const Df = Dn.map((d) => Float64Array.from({ length: F }, (_, i) => (d[i] + d[(i + 1) % N]) / 2));
  const Dmax = Math.max(0, ...Dn.map((d) => Math.max(...d)));
  const maxSteps = opts.maxSteps ?? 20_000;
  // accurate for diffusion (h²/2D), at least 200 steps, and room in the budget for landing on the times kept
  const dtBase = opts.dt ?? Math.max(tEnd / (0.8 * maxSteps), Math.min(Dmax > 0 ? (h * h) / (2 * Dmax) : Infinity, tEnd / 200));

  let u = p.species.map((sp) => Float64Array.from({ length: N }, (_, i) => sp.init[i] ?? NaN));
  const keep = Math.max(2, opts.keep ?? 101);
  const marks = Array.from({ length: keep }, (_, j) => (tEnd * j) / (keep - 1));
  const T: number[] = [0];
  const U: Float64Array[][] = u.map((v) => [v.slice()]);

  // scratch
  const R = Array.from({ length: K }, () => new Float64Array(N));
  const Fx = Array.from({ length: K }, () => new Float64Array(N));
  const Sp = Array.from({ length: K }, () => new Float64Array(N));
  const k1 = Array.from({ length: K }, () => new Float64Array(N));
  const mid = Array.from({ length: K }, () => new Float64Array(N));
  const ta = new Float64Array(N), tb = new Float64Array(N), tc = new Float64Array(N), td = new Float64Array(N), tx = new Float64Array(N);
  const cyc = { bb: new Float64Array(N), z: new Float64Array(N), u: new Float64Array(N), cp: new Float64Array(N), dp: new Float64Array(N) };
  const explicit = !!p.react || moved.some(Boolean);
  const held = (s: number, side: 'left' | 'right') => !ring && p.species[s][side]?.type === 'value';

  /** the explicit right-hand side at (t, v), into out */
  const rhs = (t: number, v: Float64Array[], out: Float64Array[]) => {
    for (const o of out) o.fill(0);
    if (p.react) p.react(t, v, out);
    if (p.flux && moved.some(Boolean)) {
      p.flux(t, v, Fx, Sp);
      for (let s = 0; s < K; s++) {
        if (!moved[s]) continue;
        const f = Fx[s], sp = Sp[s], w = v[s], o = out[s];
        // Rusanov through face i (between node i and i+1)
        const face = (i: number) => {
          const j = (i + 1) % N;
          return 0.5 * (f[i] + f[j]) - 0.5 * Math.max(Math.abs(sp[i]), Math.abs(sp[j])) * (w[j] - w[i]);
        };
        if (ring) {
          let prev = face(N - 1);
          for (let i = 0; i < N; i++) {
            const next = face(i);
            o[i] -= (next - prev) / h;
            prev = next;
          }
        } else {
          // an end that is not held passes what is carried at its own value
          let prev = f[0];
          for (let i = 0; i < N; i++) {
            const next = i < N - 1 ? face(i) : f[N - 1];
            o[i] -= (next - prev) / h;
            prev = next;
          }
        }
      }
    }
  };

  /** Heun's method over dt for the explicit terms, held ends left alone */
  const explicitStep = (t: number, dt: number) => {
    rhs(t, u, k1);
    for (let s = 0; s < K; s++) for (let i = 0; i < N; i++) mid[s][i] = u[s][i] + dt * k1[s][i];
    rhs(t + dt, mid, R);
    for (let s = 0; s < K; s++) {
      const lo = held(s, 'left') ? 1 : 0;
      const hi = held(s, 'right') ? N - 1 : N;
      for (let i = lo; i < hi; i++) u[s][i] += 0.5 * dt * (k1[s][i] + R[s][i]);
    }
  };

  /** Crank–Nicolson over dt for each diffusing species */
  const diffuse = (t: number, dt: number) => {
    const r = (0.5 * dt) / (h * h);
    for (let s = 0; s < K; s++) {
      const D = Dn[s], Fd = Df[s], w = u[s];
      if (!(Math.max(...D) > 0) && !(!ring && (p.species[s].left?.type === 'value' || p.species[s].right?.type === 'value'))) continue;
      const L = (i: number): number => {
        if (ring) {
          const im = (i - 1 + N) % N, ip = (i + 1) % N;
          return (Fd[i] * (w[ip] - w[i]) - Fd[im] * (w[i] - w[im])) / (h * h);
        }
        return (Fd[i] * (w[i + 1] - w[i]) - Fd[i - 1] * (w[i] - w[i - 1])) / (h * h);
      };
      for (let i = 0; i < N; i++) {
        if (!ring && i === 0) {
          const e = p.species[s].left;
          if (e?.type === 'value') {
            ta[0] = 0; tb[0] = 1; tc[0] = 0; td[0] = e.at(t + dt);
          } else {
            // the ghost w₋₁ = w₁ + 2h·q/D folded in: no division, so an end with no diffusivity still takes its flux
            const q0 = e ? e.at(t) : 0, q1 = e ? e.at(t + dt) : 0;
            ta[0] = 0; tb[0] = 1 + 2 * r * D[0]; tc[0] = -2 * r * D[0];
            td[0] = w[0] + 0.5 * dt * ((2 * D[0] * (w[1] - w[0])) / (h * h) + (2 * q0) / h) + 0.5 * dt * ((2 * q1) / h);
          }
          continue;
        }
        if (!ring && i === N - 1) {
          const e = p.species[s].right;
          if (e?.type === 'value') {
            ta[i] = 0; tb[i] = 1; tc[i] = 0; td[i] = e.at(t + dt);
          } else {
            const q0 = e ? e.at(t) : 0, q1 = e ? e.at(t + dt) : 0;
            ta[i] = -2 * r * D[i]; tb[i] = 1 + 2 * r * D[i]; tc[i] = 0;
            td[i] = w[i] + 0.5 * dt * ((2 * D[i] * (w[i - 1] - w[i])) / (h * h) + (2 * q0) / h) + 0.5 * dt * ((2 * q1) / h);
          }
          continue;
        }
        const fl = ring ? Fd[(i - 1 + N) % N] : Fd[i - 1];
        const fr = Fd[i];
        ta[i] = -r * fl; tb[i] = 1 + r * (fl + fr); tc[i] = -r * fr;
        td[i] = w[i] + 0.5 * dt * L(i);
      }
      if (ring) cyclicInto(ta, tb, tc, td, tx, N, cyc);
      else thomasInto(ta, tb, tc, td, tx, cyc.cp, cyc.dp, N);
      w.set(tx);
    }
  };

  let t = 0;
  let steps = 0;
  let dtMin = Infinity, dtMax = 0;
  let stopped: Transport1DRun['stats']['stopped'] = null;
  let next = 1;
  while (next < marks.length && !stopped) {
    if (steps >= maxSteps) {
      stopped = { why: 'budget', at: t };
      break;
    }
    let dt = Math.min(dtBase, marks[next] - t);
    if (p.flux && moved.some(Boolean)) {
      p.flux(t, u, Fx, Sp);
      let a = 0;
      for (let s = 0; s < K; s++) if (moved[s]) for (let i = 0; i < N; i++) a = Math.max(a, Math.abs(Sp[s][i]));
      if (a > 0) dt = Math.min(dt, (0.9 * h) / a);
    }
    if (explicit) explicitStep(t, dt / 2);
    diffuse(t, dt);
    if (explicit) explicitStep(t + dt / 2, dt / 2);
    t += dt;
    steps++;
    dtMin = Math.min(dtMin, dt);
    dtMax = Math.max(dtMax, dt);
    if (!u.every((v) => v.every(Number.isFinite))) {
      stopped = { why: 'diverged', at: t };
      break;
    }
    if (Math.abs(t - marks[next]) <= 1e-12 * Math.max(1, tEnd)) {
      t = marks[next];
      T.push(t);
      for (let s = 0; s < K; s++) U[s].push(u[s].slice());
      next++;
    }
  }
  const parts = ['Crank–Nicolson diffusion'];
  if (moved.some(Boolean)) parts.push('Rusanov transport');
  if (p.react) parts.push('reaction');
  return {
    x,
    t: T,
    u: U,
    stats: {
      steps,
      dtMin: Number.isFinite(dtMin) ? dtMin : 0,
      dtMax,
      scheme: explicit
        ? `${parts.join(', ')} — the explicit terms by Heun's method in half steps either side of the implicit diffusion (Strang splitting, second order in time${moved.some(Boolean) ? '; the transport first order in space' : ''})`
        : 'Crank–Nicolson (second order in space and time, unconditionally stable)',
      stopped,
    },
  };
}

/**
 * The exact solution of u_t = D u_xx on [x₀, x₁] — the reference a solver is
 * judged by:
 *   ends held at a and b: the straight line between them plus a sine series,
 *     u = s(x) + Σ bₘ e^{−D(mπ/L)²t} sin(mπ(x−x₀)/L), bₘ = (2/L)∫(u₀ − s) sin(…);
 *   both ends insulated: a cosine series about the mean,
 *     u = a₀ + Σ aₘ e^{−D(mπ/L)²t} cos(mπ(x−x₀)/L);
 *   one end held at a value and the other insulated: quarter-wave modes about
 *     that value, λₘ = (m − ½)π/L — sin(λₘ(x−x₀)) held on the left,
 *     cos(λₘ(x−x₀)) held on the right.
 * The coefficients by Simpson's rule on the initial condition.
 */
export function heatSeries(
  u0: (x: number) => number,
  x0: number,
  x1: number,
  D: number,
  ends: { left: number | 'insulated'; right: number | 'insulated' } | 'insulated',
  modes = 200,
  quad = 4000
): (x: number, t: number) => number {
  const L = x1 - x0;
  const q = quad % 2 ? quad + 1 : quad;
  const h = L / q;
  // the starting field is sampled once on the quadrature points, not once per mode
  const xq = Array.from({ length: q + 1 }, (_, i) => x0 + i * h);
  const u0q = xq.map(u0);
  const at0 = new Map(xq.map((x, i) => [x, u0q[i]]));
  const start = u0;
  u0 = (x: number) => at0.get(x) ?? start(x);
  const simpson = (f: (x: number) => number) => {
    let s = 0;
    for (let i = 0; i <= q; i++) s += (i === 0 || i === q ? 1 : i % 2 ? 4 : 2) * f(xq[i]);
    return (s * h) / 3;
  };
  if (ends !== 'insulated' && ends.left === 'insulated' && ends.right === 'insulated') ends = 'insulated';
  if (ends !== 'insulated' && (ends.left === 'insulated') !== (ends.right === 'insulated')) {
    // one end held, the other insulated: quarter-wave modes about the held value
    const heldLeft = ends.left !== 'insulated';
    const a = (heldLeft ? ends.left : ends.right) as number;
    const lam = (j: number) => ((j + 0.5) * Math.PI) / L;
    const mode = (j: number, x: number) => (heldLeft ? Math.sin(lam(j) * (x - x0)) : Math.cos(lam(j) * (x - x0)));
    const c = Array.from({ length: modes }, (_, j) => (2 / L) * simpson((x) => (u0(x) - a) * mode(j, x)));
    return (x, t) => c.reduce((acc, cm, j) => acc + cm * Math.exp(-D * lam(j) ** 2 * t) * mode(j, x), a);
  }
  if (ends === 'insulated') {
    const a0 = simpson(u0) / L;
    const a = Array.from({ length: modes }, (_, j) => ((2 / L) * simpson((x) => u0(x) * Math.cos(((j + 1) * Math.PI * (x - x0)) / L))));
    return (x, t) => a.reduce((acc, am, j) => acc + am * Math.exp(-D * (((j + 1) * Math.PI) / L) ** 2 * t) * Math.cos(((j + 1) * Math.PI * (x - x0)) / L), a0);
  }
  const lv = ends.left as number;
  const rv = ends.right as number;
  const s = (x: number) => lv + ((rv - lv) * (x - x0)) / L;
  const b = Array.from({ length: modes }, (_, j) => ((2 / L) * simpson((x) => (u0(x) - s(x)) * Math.sin(((j + 1) * Math.PI * (x - x0)) / L))));
  return (x, t) => b.reduce((acc, bm, j) => acc + bm * Math.exp(-D * (((j + 1) * Math.PI) / L) ** 2 * t) * Math.sin(((j + 1) * Math.PI * (x - x0)) / L), s(x));
}

// ── many species on a plane ──────────────────────────────────────────

export interface Field2D {
  /** cells across and up; cell (i, j) is centred at (x₀ + (i + ½)hx, y₀ + (j + ½)hy) */
  nx: number;
  ny: number;
  hx: number;
  hy: number;
  /** periodic edges wrap; insulated edges pass nothing; held edges are held at each species' `edge` value */
  edges: 'periodic' | 'insulated' | 'held';
  species: { D: number; init: ArrayLike<number>; edge?: number }[];
  /** the rates at every cell, written into out[s] */
  react?: (t: number, u: Float64Array[], out: Float64Array[]) => void;
}

export interface Field2DManyRun {
  nx: number;
  ny: number;
  t: number[];
  /** u[s][k] is species s at t[k], row by row (index j·nx + i) */
  u: Float64Array[][];
  stats: { steps: number; dt: number; limit: number; method: string; stopped: null | { why: 'diverged'; at: number } };
}

/**
 * Up to four species reacting and diffusing on a grid of cells, by forward
 * Euler with the five-point Laplacian. REFUSES a step above the stability
 * bound 1 / (2·max D·(1/hx² + 1/hy²)) — a run that would grow without bound
 * is not returned as a picture — and a run larger than its budget of
 * cell-steps, which could not be computed under a slider.
 */
export function field2D(p: Field2D, tEnd: number, opts: { dt?: number; keep?: number; budget?: number } = {}): Field2DManyRun | { refused: string } {
  const { nx, ny, hx, hy } = p;
  const N = nx * ny;
  const K = p.species.length;
  const Dmax = Math.max(0, ...p.species.map((s) => s.D));
  const limit = Dmax > 0 ? 1 / (2 * Dmax * (1 / (hx * hx) + 1 / (hy * hy))) : Infinity;
  const dt = opts.dt ?? Math.min(0.9 * limit, tEnd / 100);
  if (dt > limit * (1 + 1e-12)) return { refused: `a step of ${dt} is above the stability limit 1/(2·max D·(1/hx² + 1/hy²)) = ${limit.toPrecision(4)} for forward Euler; take a smaller one` };
  const steps = Math.max(1, Math.ceil(tEnd / dt - 1e-9));
  const budget = opts.budget ?? 3e7;
  if (steps * N > budget) return { refused: `${steps} steps on ${nx} × ${ny} cells is ${(steps * N).toExponential(2)} cell-steps, more than the ${budget.toExponential(1)} a run may take — a coarser grid, a shorter run or a larger step within the limit` };
  const k = tEnd / steps;
  let u = p.species.map((s) => Float64Array.from({ length: N }, (_, i) => s.init[i] ?? NaN));
  let un = p.species.map(() => new Float64Array(N));
  const R = p.species.map(() => new Float64Array(N));
  const keep = Math.max(2, opts.keep ?? 31);
  const marks = new Set(Array.from({ length: keep }, (_, j) => Math.round((j * steps) / (keep - 1))));
  const T: number[] = [0];
  const U: Float64Array[][] = u.map((v) => [v.slice()]);
  const ihx = 1 / (hx * hx), ihy = 1 / (hy * hy);
  let stopped: Field2DManyRun['stats']['stopped'] = null;
  for (let s = 1; s <= steps; s++) {
    if (p.react) {
      for (const r of R) r.fill(0);
      p.react((s - 1) * k, u, R);
    }
    for (let q = 0; q < K; q++) {
      const w = u[q], o = un[q], D = p.species[q].D, r = R[q];
      const e = p.species[q].edge ?? 0;
      for (let j = 0; j < ny; j++) {
        const j0 = j * nx;
        for (let i = 0; i < nx; i++) {
          const c = j0 + i;
          const wc = w[c];
          let wl: number, wr: number, wd: number, wu: number;
          if (p.edges === 'periodic') {
            wl = w[j0 + ((i - 1 + nx) % nx)];
            wr = w[j0 + ((i + 1) % nx)];
            wd = w[((j - 1 + ny) % ny) * nx + i];
            wu = w[((j + 1) % ny) * nx + i];
          } else {
            // a ghost across each edge: equal to the cell (insulated) or reflected through the held value
            const g = (inside: boolean, v: number) => (inside ? v : p.edges === 'insulated' ? wc : 2 * e - wc);
            wl = g(i > 0, i > 0 ? w[c - 1] : 0);
            wr = g(i < nx - 1, i < nx - 1 ? w[c + 1] : 0);
            wd = g(j > 0, j > 0 ? w[c - nx] : 0);
            wu = g(j < ny - 1, j < ny - 1 ? w[c + nx] : 0);
          }
          const lap = (wl + wr - 2 * wc) * ihx + (wd + wu - 2 * wc) * ihy;
          o[c] = wc + k * (D * lap + (p.react ? r[c] : 0));
        }
      }
    }
    [u, un] = [un, u];
    if (!u.every((v) => v.every(Number.isFinite))) {
      stopped = { why: 'diverged', at: s * k };
      break;
    }
    if (marks.has(s)) {
      T.push(s * k);
      for (let q = 0; q < K; q++) U[q].push(u[q].slice());
    }
  }
  return {
    nx,
    ny,
    t: T,
    u: U,
    stats: {
      steps,
      dt: k,
      limit,
      method: `forward Euler, five-point Laplacian, ${p.edges} edges`,
      stopped,
    },
  };
}
