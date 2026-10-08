// Fields on grids, judged by exact solutions: a sine mode decays as
// e^{−απ²t/L²}; a step relaxes as its Fourier series says; insulated ends
// conserve heat, and a flux through one adds exactly what it carries; a
// Gaussian spreads with variance growing as 2Dt; Gray–Scott keeps its trivial
// state and grows a pattern from a seed — and an unstable step is refused.
import { heat1D, heatModes, thomas, reactionDiffusion2D, grayScott, transport1D, heatSeries, cyclicThomas, field2D } from './.tmp/fields.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const maxErr = (xs, us, f) => Math.max(...xs.map((x, i) => Math.abs(us[i] - f(x))));
const trap = (xs, us) => us.reduce((s, u, i) => s + (i === 0 || i === us.length - 1 ? u / 2 : u), 0) * (xs[1] - xs[0]);

console.log('=== the tridiagonal solve ===');
{
  const x = thomas([0, -1, -1, -1], [2, 2, 2, 2], [-1, -1, -1, 0], [1, 0, 0, 1]);
  ok('Thomas solves the discrete Laplacian exactly', x.every((v) => Math.abs(v - 1) < 1e-14), x.join());
}

console.log('=== a sine mode decays as e^{−απ²t} ===');
{
  const exact = (t) => (x) => Math.exp(-(Math.PI ** 2) * t) * Math.sin(Math.PI * x);
  const run = (n, dt) => heat1D({ x0: 0, x1: 1, n, alpha: 1, left: { type: 'dirichlet', value: 0 }, right: { type: 'dirichlet', value: 0 }, init: (x) => Math.sin(Math.PI * x) }, 0.1, { dt, keep: 2 });
  const a = run(40, 0.002);
  const ea = maxErr(a.x, a.u.at(-1), exact(0.1));
  // the five-point second difference shifts the decay rate by (πh)²/12: about 2·10⁻⁴ here
  ok('Crank–Nicolson, 40 cells: within the (πh)²/12 truncation of the exact solution', ea < 2.5e-4, ea);
  const b = run(80, 0.001);
  const eb = maxErr(b.x, b.u.at(-1), exact(0.1));
  ok('… and second order: halving h and dt quarters the error', ea / eb > 3.5 && ea / eb < 4.5, ea / eb);
  const im = heat1D({ x0: 0, x1: 1, n: 40, alpha: 1, left: { type: 'dirichlet', value: 0 }, right: { type: 'dirichlet', value: 0 }, init: (x) => Math.sin(Math.PI * x) }, 0.1, { dt: 0.002, scheme: 'implicit', keep: 2 });
  ok('implicit Euler is first order in time: worse at the same step, still close', maxErr(im.x, im.u.at(-1), exact(0.1)) > ea && maxErr(im.x, im.u.at(-1), exact(0.1)) < 5e-3);
  ok('the run says what it did', /Crank–Nicolson/.test(a.stats.scheme) && a.stats.steps === 50);
}

console.log('=== a step relaxes as its Fourier series says (Atlas: 1D transient rod) ===');
{
  // the jump sampled at its midpoint, as the series has it — sampling it at one side adds an O(h) error of its own
  const u0 = (x) => (x > 0.25 && x < 0.75 ? 1 : Math.abs(x - 0.25) < 1e-12 || Math.abs(x - 0.75) < 1e-12 ? 0.5 : 0);
  const series = heatModes(u0, 1, 0.5, 400);
  const rod = (n, dt) => heat1D({ x0: 0, x1: 1, n, alpha: 0.5, left: { type: 'dirichlet', value: 0 }, right: { type: 'dirichlet', value: 0 }, init: u0 }, 0.02, { dt, keep: 2 });
  const r = rod(200, 2e-5);
  const e = maxErr(r.x, r.u.at(-1), (x) => series(x, 0.02));
  ok('against the 400-mode series at t = 0.02: within 10⁻⁴', e < 1e-4, e);
  const r2 = rod(400, 1e-5);
  const e2 = maxErr(r2.x, r2.u.at(-1), (x) => series(x, 0.02));
  ok('… converging at second order', e / e2 > 3 && e / e2 < 5, e / e2);
  ok('the series reproduces its own start, away from the jumps', Math.abs(series(0.5, 0) - 1) < 0.01 && Math.abs(series(0.1, 0)) < 0.01);
}

console.log('=== heat is conserved, or changes by exactly what crosses an end ===');
{
  const ins = heat1D({ x0: 0, x1: 2, n: 100, alpha: 0.3, left: { type: 'neumann', flux: 0 }, right: { type: 'neumann', flux: 0 }, init: (x) => Math.exp(-((x - 0.6) ** 2) / 0.02) }, 1.5, { dt: 0.002, keep: 5 });
  const H0 = trap(ins.x, ins.u[0]);
  ok('insulated ends: the total stays what it was', ins.u.every((u) => Math.abs(trap(ins.x, u) - H0) < 1e-10 * Math.max(1, H0)), ins.u.map((u) => trap(ins.x, u) - H0).join());
  ok('… and spreads toward the mean', Math.max(...ins.u.at(-1)) - Math.min(...ins.u.at(-1)) < Math.max(...ins.u[0]) - Math.min(...ins.u[0]));
  const g = 0.7;
  const fed = heat1D({ x0: 0, x1: 1, n: 100, alpha: 1, left: { type: 'neumann', flux: g }, right: { type: 'neumann', flux: 0 }, init: () => 0 }, 2, { dt: 0.001, keep: 3 });
  ok('a flux g in through one end adds g·t, exactly', Math.abs(trap(fed.x, fed.u.at(-1)) - g * 2) < 1e-9, trap(fed.x, fed.u.at(-1)));
  const fixed = heat1D({ x0: 0, x1: 1, n: 50, alpha: 1, left: { type: 'dirichlet', value: 3 }, right: { type: 'dirichlet', value: 1 }, init: () => 0 }, 5, { dt: 0.01, keep: 2 });
  ok('held at two temperatures, it settles to the straight line between them', maxErr(fixed.x, fixed.u.at(-1), (x) => 3 - 2 * x) < 1e-9);
  const src = heat1D({ x0: 0, x1: 1, n: 100, alpha: 1, left: { type: 'dirichlet', value: 0 }, right: { type: 'dirichlet', value: 0 }, init: () => 0, source: () => 2 }, 5, { dt: 0.01, keep: 2 });
  ok('a uniform source settles to x(1 − x)', maxErr(src.x, src.u.at(-1), (x) => x * (1 - x)) < 1e-6, maxErr(src.x, src.u.at(-1), (x) => x * (1 - x)));
}

console.log('=== two species on a periodic plane ===');
{
  const n = 64;
  const N = n * n;
  const flat = (f) => Float64Array.from({ length: N }, (_, c) => f(c % n, Math.floor(c / n)));
  // diffusion alone: mass conserved, a Gaussian's variance grows by 2Dt per axis
  const D = 0.5;
  const s0 = 3;
  const g = flat((i, j) => Math.exp(-(((i - 32) ** 2 + (j - 32) ** 2) / (2 * s0 * s0))));
  const r = reactionDiffusion2D({ n, h: 1, Du: D, Dv: D, react: () => [0, 0], u0: g, v0: new Float64Array(N) }, 10, { dt: 0.2, keep: 2 });
  const u = r.u.at(-1);
  const mass = (a) => a.reduce((s, v) => s + v, 0);
  ok('diffusion alone conserves the total', Math.abs(mass(u) - mass(g)) < 1e-9 * mass(g));
  const m = mass(u);
  let vx = 0;
  for (let c = 0; c < N; c++) vx += u[c] * ((c % n) - 32) ** 2;
  ok('a Gaussian’s variance grows as σ² + 2Dt', Math.abs(vx / m - (s0 * s0 + 2 * D * 10)) < 0.05, vx / m);
  const bad = reactionDiffusion2D({ n, h: 1, Du: 1, Dv: 0.5, react: () => [0, 0], u0: g, v0: g }, 1, { dt: 0.3 });
  ok('a step above h²/(4D) is refused, not run', 'refused' in bad && /stability limit/.test(bad.refused));
  // Gray–Scott
  const F = 0.037, k = 0.06;
  const still = reactionDiffusion2D({ n: 32, h: 1, Du: 0.2, Dv: 0.1, react: grayScott(F, k), u0: new Float64Array(1024).fill(1), v0: new Float64Array(1024) }, 200, { dt: 1, keep: 2 });
  ok('Gray–Scott: (u, v) = (1, 0) everywhere stays so', still.u.at(-1).every((v) => v === 1) && still.v.at(-1).every((v) => v === 0));
  const seed = (i, j) => (Math.abs(i - 32) < 5 && Math.abs(j - 32) < 5 ? 1 : 0);
  const gs = reactionDiffusion2D({ n, h: 1, Du: 0.2, Dv: 0.1, react: grayScott(F, k), u0: flat((i, j) => 1 - 0.5 * seed(i, j)), v0: flat((i, j) => 0.25 * seed(i, j)) }, 3000, { dt: 1, keep: 3 });
  const v = gs.v.at(-1);
  const area = v.filter((x) => x > 0.1).length;
  ok('… and from a seed, a pattern grows beyond it', area > 2 * 100, area);
  ok('… staying bounded', v.every((x) => x >= -1e-9 && x < 1) && gs.u.at(-1).every((x) => x > -1e-9 && x <= 1 + 1e-9));
  ok('… and the run says how it was stepped', /forward Euler/.test(gs.stats.method) && gs.stats.limit === 1.25);
}

// ── many species, transport, rings and planes ──────────────────────────
const C = (v) => ({ type: 'value', at: () => v });
const Q = (v) => ({ type: 'flux', at: () => v });
const grid = (x0, x1, n, ring = false) => Array.from({ length: ring ? n : n + 1 }, (_, i) => x0 + ((x1 - x0) * i) / n);
const fill = (xs, f) => Float64Array.from(xs, f);

console.log('=== the cyclic tridiagonal solve, on a ring ===');
{
  const n = 7;
  const a = Array.from({ length: n }, (_, i) => -1 - 0.1 * i), c = Array.from({ length: n }, (_, i) => -0.5 + 0.05 * i);
  const b = Array.from({ length: n }, () => 4), d = Array.from({ length: n }, (_, i) => Math.sin(i + 1));
  const x = cyclicThomas(a, b, c, d);
  const res = Math.max(...x.map((_, i) => Math.abs(a[i] * x[(i - 1 + n) % n] + b[i] * x[i] + c[i] * x[(i + 1) % n] - d[i])));
  ok('Sherman–Morrison: the corners are coupled, the residual is round-off', res < 1e-13, res);
}

console.log('=== transport1D is Crank–Nicolson when there is only diffusion ===');
{
  const n = 50, xs = grid(0, 1, n), dt = 0.001;
  const init = (x) => Math.sin(Math.PI * x) + 0.3 * Math.sin(3 * Math.PI * x);
  const a = transport1D({ x0: 0, x1: 1, n, species: [{ D: fill(xs, () => 1), left: C(0), right: C(0), init: fill(xs, init) }] }, 0.1, { dt, keep: 2 });
  const b = heat1D({ x0: 0, x1: 1, n, alpha: 1, left: { type: 'dirichlet', value: 0 }, right: { type: 'dirichlet', value: 0 }, init }, 0.1, { dt, keep: 2 });
  const diff = Math.max(...a.u[0].at(-1).map((v, i) => Math.abs(v - b.u.at(-1)[i])));
  ok('the same numbers as heat1D, to round-off', diff < 1e-13, diff);
  const exact = (x) => Math.exp(-(Math.PI ** 2) * 0.1) * Math.sin(Math.PI * x) + 0.3 * Math.exp(-9 * Math.PI ** 2 * 0.1) * Math.sin(3 * Math.PI * x);
  ok('… and the two modes decay as they should', maxErr(xs, Array.from(a.u[0].at(-1)), exact) < 5e-4, maxErr(xs, Array.from(a.u[0].at(-1)), exact));
  ok('it says it is Crank–Nicolson, and kept the times asked for', /Crank–Nicolson/.test(a.stats.scheme) && a.t.length === 2 && Math.abs(a.t[1] - 0.1) < 1e-15);
}

console.log('=== against the series: ends held, ends insulated, a flux in ===');
{
  // a cold rod, its left end raised to 1: the line between the ends plus a sine series
  const n = 200, xs = grid(0, 1, n);
  const r = transport1D({ x0: 0, x1: 1, n, species: [{ D: fill(xs, () => 0.5), left: C(1), right: C(0), init: fill(xs, (x) => (x === 0 ? 1 : 0)) }] }, 0.2, { keep: 5 });
  const ref = heatSeries((x) => 0, 0, 1, 0.5, { left: 1, right: 0 }, 400);
  const errs = r.t.slice(1).map((t, k) => maxErr(xs, Array.from(r.u[0][k + 1]), (x) => ref(x, t)));
  ok('a rod whose end is raised: within 2·10⁻³ of the series at every time kept', errs.every((e) => e < 2e-3), errs.join());
  // insulated: a cosine series, and the heat in the rod stays put
  // the jump sits on a node, which takes the mean of its two sides — otherwise the grid moves it half a cell
  const step = (x) => (Math.abs(x - 0.7) < 1e-9 ? 0.6 : x < 0.7 ? 1 : 0.2);
  const ins = transport1D({ x0: 0, x1: 2, n: 100, species: [{ D: fill(grid(0, 2, 100), () => 1), left: Q(0), right: Q(0), init: fill(grid(0, 2, 100), step) }] }, 0.3, { keep: 4 });
  const cos = heatSeries(step, 0, 2, 1, 'insulated', 400);
  const xs2 = grid(0, 2, 100);
  const ce = ins.t.slice(1).map((t, k) => maxErr(xs2, Array.from(ins.u[0][k + 1]), (x) => cos(x, t)));
  ok('insulated ends: the cosine series, to 10⁻³', ce.every((e) => e < 1e-3), ce.join());
  const heat = ins.u[0].map((u) => trap(xs2, Array.from(u)));
  ok('… and the heat in it is conserved to round-off', heat.every((v) => Math.abs(v - heat[0]) < 1e-12), heat.join());
  // a flux of 0.4 in at the left, the right insulated: the heat rises by exactly 0.4 a unit time
  const fl = transport1D({ x0: 0, x1: 1, n: 80, species: [{ D: fill(grid(0, 1, 80), () => 0.2), left: Q(0.4), right: Q(0), init: fill(grid(0, 1, 80), () => 0) }] }, 0.5, { keep: 6 });
  const got = fl.u[0].map((u) => trap(grid(0, 1, 80), Array.from(u)));
  ok('a flux in adds exactly what it carries', got.every((v, k) => Math.abs(v - 0.4 * fl.t[k]) < 1e-12), got.join());
}

console.log('=== transport: round a ring, and a shock at the Rankine–Hugoniot speed ===');
{
  const n = 400, xs = grid(0, 1, n, true);
  const pulse = (x) => Math.exp(-(((x - 0.3) / 0.05) ** 2));
  const ring = transport1D(
    {
      x0: 0, x1: 1, n, periodic: true,
      species: [{ D: fill(xs, () => 0), init: fill(xs, pulse) }],
      flux: (t, u, F, sp) => { for (let i = 0; i < u[0].length; i++) { F[0][i] = u[0][i]; sp[0][i] = 1; } },
    },
    1,
    { keep: 3 }
  );
  const mass = ring.u[0].map((u) => u.reduce((s, v) => s + v, 0) / n);
  ok('carried once round a ring: the amount is kept to round-off', mass.every((m) => Math.abs(m - mass[0]) < 1e-13), mass.join());
  // its centre, by the circular mean, is back where it started
  const centre = (u) => { let cx = 0, cy = 0; u.forEach((v, i) => { cx += v * Math.cos(2 * Math.PI * xs[i]); cy += v * Math.sin(2 * Math.PI * xs[i]); }); return ((Math.atan2(cy, cx) / (2 * Math.PI)) + 1) % 1; };
  ok('… and arrives where it set out, within a cell', Math.abs(centre(ring.u[0][2]) - 0.3) < 1 / n, centre(ring.u[0][2]));
  ok('… smeared, as a first-order scheme must, and never above where it began', Math.max(...ring.u[0][2]) < 1 && Math.min(...ring.u[0][2]) >= -1e-12);
  ok('the step was set by the Courant number', Math.abs(ring.stats.dtMax - 0.9 / n) < 1e-12, ring.stats.dtMax);
  // Burgers: 1 behind, 0 ahead, the jump at 0.5 moves at (1 + 0)/2
  const nb = 400, xb = grid(0, 2, nb);
  const bur = transport1D(
    {
      x0: 0, x1: 2, n: nb,
      species: [{ D: fill(xb, () => 0), left: C(1), right: Q(0), init: fill(xb, (x) => (x < 0.5 ? 1 : 0)) }],
      flux: (t, u, F, sp) => { for (let i = 0; i < u[0].length; i++) { F[0][i] = 0.5 * u[0][i] ** 2; sp[0][i] = u[0][i]; } },
    },
    1,
    { keep: 2 }
  );
  const end = bur.u[0][1];
  const at = xb[end.findIndex((v) => v < 0.5)];
  ok('Burgers: the shock is at 0.5 + t/2 = 1.0, within two cells', Math.abs(at - 1) <= 2 * (2 / nb), at);
}

console.log('=== reaction: logistic growth, a Fisher front, and a blow-up stopped ===');
{
  const xs = grid(0, 1, 10);
  const lg = transport1D({ x0: 0, x1: 1, n: 10, species: [{ D: fill(xs, () => 0), init: fill(xs, () => 0.1) }], react: (t, u, out) => { for (let i = 0; i < u[0].length; i++) out[0][i] = u[0][i] * (1 - u[0][i]); } }, 5, { keep: 6 });
  const exact = (t) => 1 / (1 + 9 * Math.exp(-t));
  ok('the logistic equation at every node, to 10⁻⁵ (Heun, second order)', lg.t.every((t, k) => Math.abs(lg.u[0][k][5] - exact(t)) < 1e-5), lg.u[0].map((u) => u[5]).join());
  // Fisher–KPP: u_t = u_xx + u(1 − u) sends a front at 2√(rD) = 2, less the slow Bramson lag
  const n = 400, xf = grid(0, 200, n);
  const fk = transport1D(
    { x0: 0, x1: 200, n, species: [{ D: fill(xf, () => 1), left: C(1), right: Q(0), init: fill(xf, (x) => (x < 5 ? 1 : 0)) }], react: (t, u, out) => { for (let i = 0; i < u[0].length; i++) out[0][i] = u[0][i] * (1 - u[0][i]); } },
    60,
    { keep: 4 }
  );
  const front = (u) => { const i = u.findIndex((v) => v < 0.5); return xf[i - 1] + ((u[i - 1] - 0.5) / (u[i - 1] - u[i])) * (xf[i] - xf[i - 1]); };
  const speed = (front(fk.u[0][3]) - front(fk.u[0][2])) / (fk.t[3] - fk.t[2]);
  ok('a Fisher front travels at nearly 2√(rD) = 2 (1.9–2.02)', speed > 1.9 && speed < 2.02, speed);
  const bl = transport1D({ x0: 0, x1: 1, n: 4, species: [{ D: fill(grid(0, 1, 4), () => 0), init: fill(grid(0, 1, 4), () => 1) }], react: (t, u, out) => { for (let i = 0; i < u[0].length; i++) out[0][i] = u[0][i] ** 2; } }, 2, { keep: 3 });
  ok('u′ = u² from 1 leaves every number by t = 1: the run stops and says when', bl.stats.stopped?.why === 'diverged' && bl.stats.stopped.at > 0.9 && bl.stats.stopped.at < 1.3, JSON.stringify(bl.stats.stopped));
  const bud = transport1D({ x0: 0, x1: 1, n: 100, species: [{ D: fill(grid(0, 1, 100), () => 0), init: fill(grid(0, 1, 100), () => 1) }], flux: (t, u, F, sp) => { for (let i = 0; i < u[0].length; i++) { F[0][i] = 50 * u[0][i]; sp[0][i] = 50; } } }, 100, { keep: 2, maxSteps: 500 });
  ok('a run that needs more steps than its budget stops there, and says so', bud.stats.stopped?.why === 'budget' && bud.stats.steps === 500);
}

console.log('=== two species on a line, coupled ===');
{
  // A → B at rate k, B diffusing and A not: the total is conserved with insulated ends
  const n = 60, xs = grid(0, 1, n);
  const r = transport1D(
    {
      x0: 0, x1: 1, n,
      species: [
        { D: fill(xs, () => 0), init: fill(xs, (x) => Math.exp(-(((x - 0.5) / 0.1) ** 2))) },
        { D: fill(xs, () => 0.05), left: Q(0), right: Q(0), init: fill(xs, () => 0) },
      ],
      react: (t, u, out) => { for (let i = 0; i < u[0].length; i++) { out[0][i] = -2 * u[0][i]; out[1][i] = 2 * u[0][i]; } },
    },
    1,
    { keep: 3 }
  );
  const A = r.u[0].map((u) => trap(xs, Array.from(u)));
  const B = r.u[1].map((u) => trap(xs, Array.from(u)));
  ok('A decays as e^{−2t} wherever it is', Math.abs(A[2] / A[0] - Math.exp(-2)) < 1e-4, A[2] / A[0]);
  ok('A + B is conserved', A.every((a, k) => Math.abs(a + B[k] - A[0]) < 1e-6), A.map((a, k) => a + B[k]).join());
}

console.log('=== on a plane: field2D ===');
{
  // one Fourier mode on a periodic square decays at the discrete Laplacian's own rate
  const n = 32, L = 1, h = L / n;
  const cx = (i) => (i + 0.5) * h;
  const init = Float64Array.from({ length: n * n }, (_, c) => Math.sin((2 * Math.PI * cx(c % n)) / L));
  const D = 0.01;
  const run = field2D({ nx: n, ny: n, hx: h, hy: h, edges: 'periodic', species: [{ D, init }] }, 1, { keep: 2 });
  const lam = (4 / (h * h)) * Math.sin(Math.PI * h / L) ** 2; // the discrete eigenvalue
  const want = Math.pow(1 - run.stats.dt * D * lam, run.stats.steps);
  const ratio = run.u[0][1][Math.floor(n / 4)] / init[Math.floor(n / 4)];
  ok('a periodic mode decays exactly as forward Euler says it must', Math.abs(ratio - want) < 1e-12, `${ratio} vs ${want}`);
  ok('… which is the continuous e^{−4π²Dt} to 2·10⁻³', Math.abs(ratio - Math.exp(-4 * Math.PI ** 2 * D)) < 2e-3);
  // insulated edges keep what is inside; held edges pull it to their value
  const blob = Float64Array.from({ length: 16 * 16 }, (_, c) => ((c % 16) - 7.5) ** 2 + (Math.floor(c / 16) - 7.5) ** 2 < 9 ? 1 : 0);
  const ins = field2D({ nx: 16, ny: 16, hx: 1 / 16, hy: 1 / 16, edges: 'insulated', species: [{ D: 0.02, init: blob }] }, 2, { keep: 3 });
  const tot = ins.u[0].map((u) => u.reduce((s, v) => s + v, 0));
  ok('insulated edges: the total is kept to round-off', tot.every((v) => Math.abs(v - tot[0]) < 1e-10), tot.join());
  const hd = field2D({ nx: 16, ny: 16, hx: 1 / 16, hy: 1 / 16, edges: 'held', species: [{ D: 0.05, init: blob, edge: 0.25 }] }, 20, { keep: 2 });
  ok('held edges: the plate settles to the value they hold', hd.u[0][1].every((v) => Math.abs(v - 0.25) < 1e-3), Math.max(...hd.u[0][1].map((v) => Math.abs(v - 0.25))));
  // the same Gray–Scott as the two-species solver, number for number
  const m = 24, N = m * m;
  const u0 = Float64Array.from({ length: N }, (_, c) => (Math.abs((c % m) - 12) < 3 && Math.abs(Math.floor(c / m) - 12) < 3 ? 0.5 : 1));
  const v0 = Float64Array.from({ length: N }, (_, c) => (Math.abs((c % m) - 12) < 3 && Math.abs(Math.floor(c / m) - 12) < 3 ? 0.25 : 0));
  const gsr = grayScott(0.04, 0.06);
  const old = reactionDiffusion2D({ n: m, h: 1, Du: 0.16, Dv: 0.08, react: gsr, u0, v0 }, 200, { dt: 1, keep: 2 });
  const neu = field2D({ nx: m, ny: m, hx: 1, hy: 1, edges: 'periodic', species: [{ D: 0.16, init: u0 }, { D: 0.08, init: v0 }], react: (t, u, out) => { for (let c = 0; c < N; c++) { const [a, b] = gsr(u[0][c], u[1][c]); out[0][c] = a; out[1][c] = b; } } }, 200, { dt: 1, keep: 2 });
  const dGS = Math.max(...old.u[1].map((v, c) => Math.abs(v - neu.u[0][1][c])), ...old.v[1].map((v, c) => Math.abs(v - neu.u[1][1][c])));
  ok('Gray–Scott: the same numbers as reactionDiffusion2D', dGS < 1e-12, dGS);
  // refusals
  const big = field2D({ nx: 8, ny: 8, hx: 0.1, hy: 0.1, edges: 'periodic', species: [{ D: 1, init: new Float64Array(64) }] }, 1, { dt: 0.01 });
  ok('a step above the stability limit is refused, with the limit', 'refused' in big && /0\.002500/.test(big.refused), JSON.stringify(big));
  const huge = field2D({ nx: 200, ny: 200, hx: 0.01, hy: 0.01, edges: 'periodic', species: [{ D: 1, init: new Float64Array(40000) }] }, 10);
  ok('a run larger than its budget is refused, and says what would fit', 'refused' in huge && /coarser grid/.test(huge.refused));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
