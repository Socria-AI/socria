// Root finding: one root in a bracket, every root on an interval with its
// branch, and Newton for systems — checked against roots known exactly.
import { brent, allRoots, newton, multiStart, numJacobian } from './.tmp/roots.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const close = (a, b, tol = 1e-10) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

console.log('=== brent ===');
ok('√2 as the root of x² − 2', close(brent((x) => x * x - 2, 0, 2), Math.SQRT2, 1e-14));
ok('cos x = x', close(brent((x) => Math.cos(x) - x, 0, 1), 0.7390851332151607, 1e-14));
ok('no sign change, no root', brent((x) => x * x + 1, -1, 1) === null);

console.log('=== all roots, with their branches ===');
{
  const r = allRoots((x) => Math.sin(x), 0.5, 10);
  ok('sin x on [0.5, 10]: π, 2π, 3π', r.length === 3 && [Math.PI, 2 * Math.PI, 3 * Math.PI].every((v, i) => close(r[i].x, v, 1e-12)), JSON.stringify(r));
  ok('  with alternating slopes', r[0].slope === -1 && r[1].slope === 1 && r[2].slope === -1);
  // two branches of one relation: x + 1/x = 2.5 → x = 0.5 and 2
  const b = allRoots((x) => x + 1 / x - 2.5, 0.05, 10, { log: true });
  ok('a relation with two solutions gives both (0.5 and 2)', b.length === 2 && close(b[0].x, 0.5) && close(b[1].x, 2), JSON.stringify(b));
  ok('  labelled by branch: falling, then rising', b[0].slope === -1 && b[1].slope === 1);
  const touch = allRoots((x) => (x - 1) ** 2, -2, 3);
  ok('a double root, which never changes sign, is still found', touch.length === 1 && close(touch[0].x, 1, 1e-6) && touch[0].touching, JSON.stringify(touch));
  const pole = allRoots((x) => 1 / (x - 1), 0, 2);
  ok('a sign change across a pole is not a root', pole.length === 0, JSON.stringify(pole));
  const cubic = allRoots((x) => (x - 1) * (x - 2) * (x - 3), 0, 4);
  ok('three roots of a cubic', cubic.length === 3 && cubic.every((r, i) => close(r.x, i + 1)));
}

console.log('=== Newton for systems ===');
{
  // circle ∩ line: x² + y² = 4, y = x → (√2, √2)
  const F = ([x, y]) => [x * x + y * y - 4, y - x];
  const r = newton(F, [1, 0.5]);
  ok('converges to (√2, √2)', r.converged && close(r.x[0], Math.SQRT2) && close(r.x[1], Math.SQRT2), JSON.stringify(r));
  const J = numJacobian(F, [1, 2]);
  ok('the numerical Jacobian matches the analytic one (to central-difference accuracy)', close(J[0][0], 2, 1e-7) && close(J[0][1], 4, 1e-7) && close(J[1][0], -1, 1e-7) && close(J[1][1], 1, 1e-7), JSON.stringify(J));
  const all = multiStart(F, [[-3, 3], [-3, 3]]);
  ok('multi-start finds both intersections and no others', all.length === 2 && all.some((p) => close(p[0], -Math.SQRT2)) && all.some((p) => close(p[0], Math.SQRT2)), JSON.stringify(all));
  // the Lorenz fixed points at r = 28: origin and (±√(b(r−1)), ±√(b(r−1)), r − 1)
  const s = 10, b = 8 / 3, rr = 28;
  const L = ([x, y, z]) => [s * (y - x), x * (rr - z) - y, x * y - b * z];
  const fp = multiStart(L, [[-20, 20], [-20, 20], [0, 40]]);
  const c = Math.sqrt(b * (rr - 1));
  ok('Lorenz r = 28: exactly three equilibria, where theory puts them', fp.length === 3 && fp.some((p) => close(p[0], -c, 1e-8) && close(p[2], 27, 1e-8)) && fp.some((p) => Math.hypot(...p) < 1e-9) && fp.some((p) => close(p[0], c, 1e-8)), JSON.stringify(fp));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
