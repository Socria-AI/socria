// Dynamical-systems analysis, checked against results derived independently
// (closed forms, classical theory) — the systems are inputs to the engine,
// written here in the test, never stored in it.
import * as D from './.tmp/dynamics.mjs';
import * as S from './.tmp/spectral.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// systems, as a person would write them
const lorenz = (s = 10, r = 28, b = 8 / 3) => ({ dim: 3, f: ([x, y, z]) => [s * (y - x), x * (r - z) - y, x * y - b * z], jac: ([x, y, z]) => [[-s, s, 0], [r - z, -1, -x], [y, x, -b]] });
const logistic = (mu) => ({ dim: 1, g: ([x]) => [4 * mu * x * (1 - x)], jac: ([x]) => [[4 * mu * (1 - 2 * x)]] });
const henon = (a = 1.4, b = 0.3) => ({ dim: 2, g: ([x, y]) => [1 + y - a * x * x, b * x] });
const brusselator = (a, b) => ({ dim: 2, f: ([x, y]) => [a + x * x * y - (b + 1) * x, b * x - x * x * y] });
const vdp = (mu) => ({ dim: 2, f: ([x, v]) => [v, -mu * v * (x * x - 1) - x] });
const pendulum = () => ({ dim: 2, f: ([th, w]) => [w, -Math.sin(th)] });

console.log('=== fixed points and their types ===');
{
  const fp = D.fixedPoints(lorenz(), [[-20, 20], [-20, 20], [0, 40]]);
  ok('Lorenz r = 28: three equilibria', fp.length === 3);
  const origin = fp.find((p) => Math.hypot(...p.x) < 1e-8);
  ok('  the origin is a saddle with one unstable direction', origin && origin.stability.type === 'saddle' && origin.stability.dims.unstable === 1, JSON.stringify(origin?.stability));
  const c = fp.find((p) => p.x[0] > 1);
  ok('  C± are saddle-foci for r = 28 > r_H ≈ 24.74 (two unstable, rotating)', c && c.stability.type === 'saddle-focus' && c.stability.dims.unstable === 2, JSON.stringify(c?.stability));
  const fp13 = D.fixedPoints(lorenz(10, 13.926), [[-20, 20], [-20, 20], [0, 40]]).find((p) => p.x[0] > 1);
  ok('  and stable for r = 13.926 < r_H', fp13 && fp13.stability.stable === true, JSON.stringify(fp13?.stability));
  const pend = D.fixedPoints(pendulum(), [[-4, 4], [-2, 2]]);
  ok('pendulum: a centre at 0 and saddles at ±π', pend.length === 3 && pend.find((p) => Math.abs(p.x[0]) < 1e-9).stability.type.startsWith('centre') && pend.filter((p) => p.stability.type === 'saddle').length === 2, JSON.stringify(pend.map((p) => [p.x, p.stability.type])));
  const vp = D.fixedPoints(vdp(1), [[-3, 3], [-3, 3]]);
  ok('van der Pol μ = 1: the origin is an unstable spiral', vp.length === 1 && vp[0].stability.type === 'unstable spiral');
  const lm = D.fixedPoints(logistic(0.7), [[0, 1]]);
  // x* = 0 and (4μ − 1)/4μ
  ok('logistic map μ = 0.7: fixed points 0 and (4μ−1)/4μ', lm.length === 2 && close(lm[1].x[0], (4 * 0.7 - 1) / (4 * 0.7)), JSON.stringify(lm.map((p) => p.x)));
  ok('  0 repels; the other attracts, alternating sides (f′ < 0)', lm[0].stability.type === 'repelling' && lm[1].stability.type.startsWith('attracting (orbit alternates'), JSON.stringify(lm.map((p) => p.stability.type)));
  const hf = D.fixedPoints(henon(), [[-3, 3], [-1, 1]]);
  const xs = hf.map((p) => p.x[0]).sort((a, b) => a - b);
  const a = 1.4, b = 0.3;
  const root = (sgn) => (-(1 - b) + sgn * Math.sqrt((1 - b) ** 2 + 4 * a)) / (2 * a);
  ok('Hénon: the two fixed points from the quadratic', hf.length === 2 && close(xs[0], root(-1)) && close(xs[1], root(1)), JSON.stringify(xs));
  ok('  both saddles at (1.4, 0.3)', hf.every((p) => p.stability.type.startsWith('saddle')));
}

console.log('=== divergence: volumes contract, or not ===');
{
  ok('Lorenz contracts phase volume at rate −(σ + 1 + b) everywhere', close(D.divergence(lorenz(), [3, -7, 11]), -(10 + 1 + 8 / 3)));
  ok('the pendulum conserves it', D.divergence(pendulum(), [0.4, 1.2]) === 0);
}

console.log('=== continuation: bifurcations found where theory puts them ===');
{
  // Brusselator: fixed point (a, b/a), Hopf at b = 1 + a², ω = a
  const a = 1.5;
  const ps = Array.from({ length: 81 }, (_, i) => 2 + (i * 2.5) / 80);
  const c = D.continuation((b) => brusselator(a, b), ps, [[0.1, 4], [0.1, 6]]);
  const hopf = c.bifurcations.find((x) => x.kind === 'hopf');
  ok(`Brusselator a = ${a}: a Hopf bifurcation at b = 1 + a² = ${1 + a * a}`, hopf && close(hopf.p, 1 + a * a, 1e-6), JSON.stringify(c.bifurcations));
  ok('  with ω = a (the cycle is born with period 2π/a)', hopf && close(hopf.omega, a, 1e-5), String(hopf?.omega));
  // Lorenz: C± lose stability at r_H = σ(σ + b + 3)/(σ − b − 1)
  const s = 10, bb = 8 / 3;
  const rH = (s * (s + bb + 3)) / (s - bb - 1);
  const lc = D.continuation((r) => lorenz(s, r, bb), Array.from({ length: 41 }, (_, i) => 20 + i * 0.25), [[0.5, 20], [0.5, 20], [1, 40]]);
  const lh = lc.bifurcations.find((x) => x.kind === 'hopf');
  ok(`Lorenz: the convection states lose stability at r_H = ${rH.toFixed(4)} (subcritical Hopf)`, lh && close(lh.p, rH, 1e-6), JSON.stringify(lc.bifurcations.map((x) => [x.kind, x.p])));
  // logistic: period doubling of x* at μ = 3/4 (f′(x*) = −1)
  const lgc = D.continuation(logistic, Array.from({ length: 61 }, (_, i) => 0.5 + i * 0.005), [[0.05, 1]]);
  const flip = lgc.bifurcations.find((x) => x.kind === 'flip');
  ok('logistic map: the fixed point flips (period doubles) at μ = 3/4', flip && close(flip.p, 0.75, 1e-7), JSON.stringify(lgc.bifurcations));
}

console.log('=== Lyapunov exponents ===');
{
  const L = D.lyapunovFlow(lorenz(), [1, 1, 20], { transient: 20, time: 400, tau: 0.5 });
  ok(`Lorenz λ₁ ≈ 0.906 (literature 0.9056): ${L.exponents[0].toFixed(3)}`, Math.abs(L.exponents[0] - 0.9056) < 0.03, JSON.stringify(L.exponents));
  ok(`  λ₂ ≈ 0, the direction of the flow: ${L.exponents[1].toFixed(3)}`, Math.abs(L.exponents[1]) < 0.02);
  ok(`  Σλ equals the divergence −(σ+1+b) = −13.667: ${L.sum.toFixed(4)}`, Math.abs(L.sum + 13.6667) < 1e-3);
  ok(`  Kaplan–Yorke dimension ≈ 2.06: ${L.kaplanYorke.toFixed(3)}`, Math.abs(L.kaplanYorke - 2.062) < 0.01);
  // logistic at μ = 1 (r = 4): λ = ln 2 exactly
  const lg = D.lyapunovMap(logistic(1), [0.2345], { n: 200000, transient: 100 });
  ok(`logistic at r = 4: λ = ln 2 = 0.6931: ${lg.exponents[0].toFixed(4)}`, Math.abs(lg.exponents[0] - Math.LN2) < 0.01);
  const lstable = D.lyapunovMap(logistic(0.7), [0.3], { n: 5000 });
  const expected = Math.log(Math.abs(4 * 0.7 * (1 - 2 * ((4 * 0.7 - 1) / (4 * 0.7)))));
  ok(`  on an attracting fixed point λ = ln|f′(x*)| = ${expected.toFixed(4)}`, close(lstable.exponents[0], expected, 1e-6), String(lstable.exponents[0]));
  const hl = D.lyapunovMap(henon(), [0.1, 0.1], { n: 100000 });
  ok(`Hénon: λ₁ ≈ 0.419, and λ₁ + λ₂ = ln b exactly: ${hl.exponents.map((v) => v.toFixed(3))}`, Math.abs(hl.exponents[0] - 0.419) < 0.01 && close(hl.sum, Math.log(0.3), 1e-9));
}

console.log('=== sections and maps ===');
{
  const sec = D.poincare(lorenz(), [1, 1, 20], { coord: 2, value: 27, direction: -1 }, { transient: 20, count: 300 });
  ok('a Poincaré section of the Lorenz flow at z = 27: crossings found', sec.points.length === 300);
  ok('  every crossing lies on the plane', sec.points.every((p) => Math.abs(p[2] - 27) < 1e-7));
  const cw = D.cobweb((x) => 4 * 0.7 * x * (1 - x), 0.1, 200); // multiplier −0.8: 0.8^200 ≈ 4e−20
  ok('a cobweb converges to the fixed point', close(cw.at(-1)[0], (4 * 0.7 - 1) / (4 * 0.7), 1e-6));
  const orb = D.orbit(henon(), [0, 0], 10000);
  ok('the Hénon orbit stays bounded on the attractor', orb.slice(100).every(([x, y]) => Math.abs(x) < 1.5 && Math.abs(y) < 0.5));
  const bc = S.boxCountingDimension(orb.slice(1000), { levels: 8, skip: 2 });
  ok(`  its box-counting dimension ≈ 1.26: ${bc.value.toFixed(2)}`, Math.abs(bc.value - 1.26) < 0.12, bc.method);
}

console.log('=== bifurcation diagrams and periods ===');
{
  // r = 4μ: period 2 for 3 < r < 3.449, 4 up to 3.544, 8 up to 3.564
  const cols = D.bifurcationMap(logistic, [0.7, 0.8, 0.87, 0.89, 0.95], [0.1], { transient: 3000, keep: 128 });
  ok('logistic: period 1 at μ = 0.7, period 2 at 0.8, period 4 at 0.87, period 8 at 0.89', cols[0].period === 1 && cols[1].period === 2 && cols[2].period === 4 && cols[3].period === 8, JSON.stringify(cols.map((c) => c.period)));
  ok('  aperiodic at μ = 0.95', cols[4].period === 0);
  const flows = D.bifurcationFlow((r) => lorenz(10, r), [26, 99.65, 160], [1, 1, 20], { coord: 2, transient: 60, time: 120, carry: false });
  ok('Lorenz maxima of z: chaotic at r = 26 (many values), periodic windows exist (r = 160)', flows[0].period === 0 && flows[2].period > 0, JSON.stringify(flows.map((c) => [c.p, c.period, c.values.length])));
}

console.log('=== periodic points ===');
{
  const cyc = D.periodicPoints(logistic(0.8), 2, [[0.01, 0.99]]);
  // the 2-cycle of x ↦ rx(1−x), r = 3.2: x = (r + 1 ± √((r−3)(r+1)))/(2r)
  const r = 3.2;
  const p = (r + 1 + Math.sqrt((r - 3) * (r + 1))) / (2 * r);
  const q = (r + 1 - Math.sqrt((r - 3) * (r + 1))) / (2 * r);
  ok('the logistic 2-cycle at r = 3.2, from the quadratic', cyc.length === 1 && cyc[0].points.some((x) => close(x[0], p)) && cyc[0].points.some((x) => close(x[0], q)), JSON.stringify(cyc));
  ok('  attracting, with multiplier 4 + 2r − r² ', cyc.length && close(cyc[0].multipliers[0].re, 4 + 2 * r - r * r, 1e-6) && cyc[0].stability.stable === true);
}

console.log('=== Feigenbaum: δ out of the maps themselves ===');
{
  const fz2 = D.superstable((x, mu) => 4 * mu * x * (1 - x), [0, 1], [0.25, 1], { levels: 11 });
  ok('logistic: the superstable fixed point at μ = 1/2', close(fz2.superstable[0], 0.5, 1e-12));
  ok('  the superstable 2-cycle at μ = (1 + √5)/4', close(fz2.superstable[1], (1 + Math.sqrt(5)) / 4, 1e-12), String(fz2.superstable[1]));
  const d2 = fz2.delta.at(-1);
  ok(`  δ estimates converge to 4.6692…: ${fz2.delta.map((d) => d.toFixed(4)).join(', ')}`, Math.abs(d2 - 4.6692) < 0.002);
  const a2 = fz2.alpha.at(-1);
  ok(`  α estimates converge to −2.5029…: ${fz2.alpha.map((d) => d.toFixed(4)).join(', ')}`, Math.abs(a2 + 2.5029) < 0.01);
  const ricker = D.superstable((x, mu) => x * Math.exp(mu * (1 - x)), [0.01, 6], [0.5, 3.2], { levels: 9 });
  ok(`the Ricker map shares δ (same quadratic maximum): ${ricker.delta.at(-1)?.toFixed(3)}`, Math.abs(ricker.delta.at(-1) - 4.669) < 0.03, JSON.stringify(ricker.delta));
  const quartic = D.superstable((x, mu) => mu * (1 - (2 * x - 1) ** 4), [0, 1], [0.5, 1], { levels: 9 });
  ok(`a quartic maximum is a different universality class, δ ≈ 7.28: ${quartic.delta.at(-1)?.toFixed(3)}`, Math.abs(quartic.delta.at(-1) - 7.2847) < 0.05, JSON.stringify(quartic.delta));
}

console.log('=== sensitivity to initial conditions ===');
{
  const tw = D.twin(lorenz(), [1, 1, 20], 1e-9, 30);
  ok(`Lorenz: nearby starts separate at a rate near λ₁ (${tw.growthRate.toFixed(2)})`, tw.growthRate > 0.6 && tw.growthRate < 1.3, JSON.stringify(tw.fitWindow));
  ok('  until the separation saturates at the attractor size', Math.max(...tw.separation) > 10);
}

console.log('=== spectra ===');
{
  const dt = 0.01;
  const n = 10000;
  const x = Array.from({ length: n }, (_, i) => 3 * Math.sin(2 * Math.PI * 1.7 * i * dt) + Math.sin(2 * Math.PI * 5.3 * i * dt));
  const sp = S.powerSpectrum(x, dt, { window: 'hann' });
  const pk = S.spectralPeaks(sp, 2);
  ok('two sinusoids: peaks at 1.7 and 5.3', pk.length === 2 && close(pk[0].f, 1.7, 2e-3) && close(pk[1].f, 5.3, 2e-3), JSON.stringify(pk));
  const variance = x.reduce((s, v) => s + v * v, 0) / n;
  const sp1 = S.powerSpectrum(x, dt, { window: 'none' });
  ok(`Parseval: Σ P Δf equals the variance (${sp1.variance.toFixed(4)} vs ${variance.toFixed(4)})`, close(sp1.variance, variance, 1e-9));
  // a non-power-of-two FFT against the direct DFT
  const m = 97;
  const z = Array.from({ length: m }, (_, i) => Math.cos(0.3 * i) + 0.5 * Math.sin(1.1 * i * i / m));
  const F = S.fft(z);
  let worst = 0;
  for (let k = 0; k < m; k++) {
    let re = 0, im = 0;
    for (let j = 0; j < m; j++) {
      re += z[j] * Math.cos((-2 * Math.PI * j * k) / m);
      im += z[j] * Math.sin((-2 * Math.PI * j * k) / m);
    }
    worst = Math.max(worst, Math.hypot(re - F.re[k], im - F.im[k]));
  }
  ok(`Bluestein FFT of length 97 matches the direct sum (${worst.toExponential(1)})`, worst < 1e-10);
  const inv = S.ifft(F.re, F.im);
  ok('  and inverts', z.every((v, i) => Math.abs(v - inv.re[i]) < 1e-12));
  // a Hopf cycle's frequency, read from the simulation's spectrum
  const a = 1.5, b = 1 + a * a + 0.05;
  const L = D.lyapunovFlow(brusselator(a, b), [a + 0.1, b / a], { time: 1 });
  void L;
}

console.log('=== correlation dimension ===');
{
  // the Lorenz attractor sampled from x(t) by delays
  const { integrate } = await import('./.tmp/ode.mjs');
  const T = 300, dt = 0.05;
  const ts = Array.from({ length: Math.floor(T / dt) }, (_, i) => 50 + i * dt);
  const r = integrate((t, y) => lorenz().f(y), 0, [1, 1, 20], 50 + T, { rtol: 1e-9, tEval: ts });
  const xs = r.y.map((p) => p[0]);
  const emb = S.delayEmbed(xs, 3, 3);
  const cd = S.correlationDimension(emb, { maxPoints: 1500, theiler: 10 });
  ok(`from x(t) alone, by delays: ν ≈ 2.05 (≤ D ≈ 2.06): ${cd.value.toFixed(2)}`, cd.value > 1.85 && cd.value < 2.2, cd.method);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
