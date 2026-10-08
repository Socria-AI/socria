// Fields on grids, judged by exact solutions: a sine mode decays as
// e^{−απ²t/L²}; a step relaxes as its Fourier series says; insulated ends
// conserve heat, and a flux through one adds exactly what it carries; a
// Gaussian spreads with variance growing as 2Dt; Gray–Scott keeps its trivial
// state and grows a pattern from a seed — and an unstable step is refused.
import { heat1D, heatModes, thomas, reactionDiffusion2D, grayScott } from './.tmp/fields.mjs';

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
