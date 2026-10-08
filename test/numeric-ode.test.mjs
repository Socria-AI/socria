// The integrator, checked against solutions known in closed form — the
// error it promises is the error it delivers — and its events against the
// exact crossing times.
import { integrate, rk4 } from './.tmp/ode.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== accuracy against exact solutions ===');
{
  // harmonic oscillator: x'' = −x, x(0)=1, v(0)=0 → x = cos t
  const f = (t, y) => [y[1], -y[0]];
  for (const tol of [1e-6, 1e-9, 1e-12]) {
    const r = integrate(f, 0, [1, 0], 20, { rtol: tol, atol: tol * 1e-2 });
    const last = r.y[r.y.length - 1];
    const err = Math.hypot(last[0] - Math.cos(20), last[1] + Math.sin(20));
    ok(`cos t to t = 20 at rtol ${tol}: error ${err.toExponential(1)}`, err < 300 * tol, String(err));
  }
  const loose = integrate(f, 0, [1, 0], 20, { rtol: 1e-4 });
  const tight = integrate(f, 0, [1, 0], 20, { rtol: 1e-10 });
  ok('a tighter tolerance takes more steps', tight.stats.accepted > loose.stats.accepted);
  // energy of the oscillator stays put
  const e = tight.y.map(([x, v]) => x * x + v * v);
  ok('energy drifts by less than 1e-8 over three periods', Math.max(...e) - Math.min(...e) < 1e-8);
  // decay y' = −2y
  const d = integrate((t, y) => [-2 * y[0]], 0, [3], 5, { rtol: 1e-10, atol: 1e-14 });
  ok('exponential decay matches 3e^{−2t}', Math.abs(d.y.at(-1)[0] - 3 * Math.exp(-10)) < 1e-12);
  // a time-dependent right-hand side: y' = cos t → y = sin t
  const s = integrate((t) => [Math.cos(t)], 0, [0], 7, { rtol: 1e-11, atol: 1e-13 });
  ok("time enters the right-hand side: y' = cos t", Math.abs(s.y.at(-1)[0] - Math.sin(7)) < 1e-9);
  // backwards in time
  const b = integrate(f, 0, [1, 0], -4, { rtol: 1e-10, atol: 1e-12 });
  ok('integrates backwards in time', Math.abs(b.y.at(-1)[0] - Math.cos(-4)) < 1e-8 && b.t.at(-1) === -4);
}

console.log('=== dense output ===');
{
  const ts = Array.from({ length: 101 }, (_, i) => i * 0.1);
  const r = integrate((t, y) => [y[1], -y[0]], 0, [0, 1], 10, { rtol: 1e-10, atol: 1e-12, tEval: ts });
  ok('samples exactly at the times asked for', r.t.length === 101 && r.t.every((t, i) => t === ts[i]));
  const worst = Math.max(...r.t.map((t, i) => Math.abs(r.y[i][0] - Math.sin(t))));
  ok(`between steps the 4th-order interpolant is accurate (${worst.toExponential(1)})`, worst < 1e-8, String(worst));
}

console.log('=== events: zero crossings located exactly ===');
{
  // x = cos t crosses zero, falling, at π/2 + 2kπ
  const r = integrate((t, y) => [y[1], -y[0]], 0, [1, 0], 20, { rtol: 1e-10, atol: 1e-12, events: [{ g: (t, y) => y[0], direction: -1 }] });
  // π/2 + 6π ≈ 20.4 lies beyond t = 20
  const expect = [Math.PI / 2, Math.PI / 2 + 2 * Math.PI, Math.PI / 2 + 4 * Math.PI];
  ok('only the falling crossings inside [0, 20], all three', r.events.length === 3, String(r.events.length));
  ok('each to 1e-9', r.events.every((e, i) => Math.abs(e.t - expect[i]) < 1e-9), JSON.stringify(r.events.map((e) => e.t)));
  // a projectile, stopped when it lands
  const g = 9.81;
  const p = integrate((t, y) => [y[2], y[3], 0, -g], 0, [0, 0, 10, 20], 100, { rtol: 1e-10, events: [{ g: (t, y) => y[1], direction: -1, terminal: true }] });
  const tLand = (2 * 20) / g;
  ok('a terminal event stops the run at the landing time', p.stats.stopped === 'event' && Math.abs(p.t.at(-1) - tLand) < 1e-9 && Math.abs(p.y.at(-1)[0] - 10 * tLand) < 1e-7, `${p.t.at(-1)} vs ${tLand}`);
}

console.log('=== honest about trouble ===');
{
  // blow-up in finite time: y' = y², y(0) = 1 → y = 1/(1 − t), singular at t = 1
  const r = integrate((t, y) => [y[0] * y[0]], 0, [1], 2, { maxSteps: 20000 });
  ok('a finite-time blow-up does not claim to reach t = 2', r.stats.stopped !== 'done' && r.t.at(-1) < 1.0001, `${r.stats.stopped} at t = ${r.t.at(-1)}`);
  // stiff van der Pol, μ = 1000: an explicit method needs a vast number of steps
  const mu = 1000;
  const v = integrate((t, y) => [y[1], mu * (1 - y[0] * y[0]) * y[1] - y[0]], 0, [2, 0], 3000, { maxSteps: 5000 });
  ok('a stiff problem hits the step ceiling and says so', v.stats.stopped === 'max-steps', v.stats.stopped);
}

console.log('=== fixed-step RK4 ===');
{
  const r = rk4((t, y) => [y[1], -y[0]], 0, [1, 0], Math.PI * 2, 0.01);
  ok('one period of the oscillator, to RK4 accuracy', Math.abs(r.y.at(-1)[0] - 1) < 1e-8 && r.t.length === 629);
  const coarse = rk4((t, y) => [-y[0]], 0, [1], 1, 0.1);
  const fine = rk4((t, y) => [-y[0]], 0, [1], 1, 0.05);
  const ratio = Math.abs(coarse.y.at(-1)[0] - Math.exp(-1)) / Math.abs(fine.y.at(-1)[0] - Math.exp(-1));
  ok(`fourth order: halving dt cuts the error by ~16 (${ratio.toFixed(1)})`, ratio > 14 && ratio < 18);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
