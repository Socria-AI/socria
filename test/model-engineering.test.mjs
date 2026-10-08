// The engineering examples in the docs: every one is a proposal the on-ramp
// builds, and every number its check states is held here to the closed form
// it claims to match. If one of these fails, the docs are saying something the
// engine does not do.
import { ENGINEERING, SCENE_EXAMPLES, curveAt, curveExtremes, stateAt, stateMax, runEnd, withParam, fieldRun, frontSpeed } from './.tmp/engineering.mjs';
import { heatSeries } from './.tmp/fields.mjs';
import { buildProposal } from './.tmp/propose.mjs';
import { readScene } from './.tmp/scene-intent.mjs';
import { SCENE, massOf, sceneMass } from './.tmp/scene.mjs';
import { sectionOf, worldBox, rotationMatrix } from './.tmp/scene-geometry.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const rel = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1e-300, Math.abs(b));
const ex = (id) => ENGINEERING.find((e) => e.id === id);
const M = (id) => ex(id).model();

console.log('=== every example builds through the on-ramp, and says what it computes ===');
{
  ok('a lot of examples, across the disciplines', ENGINEERING.length >= 25 && new Set(ENGINEERING.map((e) => e.discipline)).size === 8, ENGINEERING.length);
  for (const e of ENGINEERING) {
    const b = buildProposal(e.model());
    ok(`${e.id} builds`, b.ok, b.ok ? '' : b.refusal.says);
    const c = e.check(e.model());
    ok(`${e.id} has a check with numbers in it`, /\d/.test(c) && !/NaN|undefined|Infinity/.test(c), c);
    ok(`${e.id} says what to ask, what it builds and what to look at`, e.ask.length > 30 && e.builds.length > 30 && e.look.length > 30);
  }
  ok('ids are unique', new Set(ENGINEERING.map((e) => e.id)).size === ENGINEERING.length);
}

console.log('=== engines ===');
{
  const m = M('otto-diesel');
  ok('Otto at r = 10, γ = 1.4: 1 − 10^−0.4', rel(curveAt(m, 'otto', 10), 1 - 10 ** -0.4, 1e-12));
  ok('Diesel below Otto at the same compression', curveAt(m, 'diesel', 10) < curveAt(m, 'otto', 10));
  const sc = M('slider-crank');
  const x = curveExtremes(sc, 'x');
  ok('the stroke is 2r', rel(x.max - x.min, 0.08, 1e-6), x.max - x.min);
  ok('top dead centre at θ = 0: r + l', rel(curveAt(sc, 'x', 0), 0.18, 1e-12));
  const fw = M('flywheel');
  ok('E = ¼ m r² ω² at 3000 rpm', rel(curveAt(fw, 'e', 3000), 0.25 * 50 * 0.09 * (100 * Math.PI) ** 2, 1e-12));
}

console.log('=== mechanisms and vibration ===');
{
  ok('mass–spring–damper: the eigenvalues −ζωₙ ± iωₙ√(1−ζ²)', /−0\.3 \+ 4\.46i/.test(ex('msd').check(M('msd'))));
  const tm = ex('two-mass').check(M('two-mass'));
  ok('two masses: the engine’s ±iω are the hand-computed natural frequencies', /0 \+ 13\.1i/.test(tm) && /0 \+ 5\.41i/.test(tm) && /5\.412 and 13\.07/.test(tm), tm);
  const pd = ex('pendulum').check(M('pendulum'));
  ok('pendulum: a stable spiral below, saddles at ±π', /stable spiral at \(0, 0\)/.test(pd) && /saddle at \(3\.14, 0\)/.test(pd) && /saddle at \(−3\.14, 0\)/.test(pd), pd);
  ok('… the saddles’ eigenvalues from λ² + bλ − g/L = 0', /2\.99, −3\.29/.test(pd));
  const dp = ex('double-pendulum').check(M('double-pendulum'));
  ok('double pendulum: the largest exponent positive', /exponents: 1\.\d+|exponents: 0\.[5-9]/.test(dp), dp);
  const r = M('resonance');
  const pk = curveExtremes(r, 'x', 40000);
  ok('resonance peaks at √(k/m − c²/2m²)', rel(pk.at, Math.sqrt(20 - 0.18), 1e-3), pk.at);
}

console.log('=== electrical ===');
{
  const m = M('rlc');
  const i = stateMax(m, 'i', 12).v;
  ok('RLC: the run’s steady current within 2% of V₀/|Z|', rel(i, 1 / Math.sqrt(1.25), 0.02), i);
  const rc = M('rc');
  ok('RC: 1 − 1/e of the supply after one time constant', rel(stateAt(rc, 'v', 1), 5 * (1 - 1 / Math.E), 1e-4), stateAt(rc, 'v', 1));
  const vdp = M('vanderpol');
  ok('Van der Pol: the limit cycle’s amplitude about 2', rel(stateMax(vdp, 'x', 25).v, 2.0, 0.02));
}

console.log('=== structures ===');
{
  ok('cantilever tip PL³/(3EI) = 1.6 mm', rel(curveAt(M('cantilever'), 'w', 2), (1000 * 8) / (3 * 200e9 * 8.333e-6), 1e-12));
  ok('simply supported midspan PL³/(48EI)', rel(curveAt(M('simply-supported'), 'w', 3), (10000 * 216) / (48 * 200e9 * 8e-5), 1e-12));
  ok('… symmetric', rel(curveAt(M('simply-supported'), 'w', 1), curveAt(M('simply-supported'), 'w', 5), 1e-12));
  const b = M('buckling');
  ok('Euler: π²EI/L² at 3 m', rel(curveAt(b, 'pcr', 3), (Math.PI ** 2 * 200e9 * 8.333e-6) / 9, 1e-12));
  ok('… fixed–fixed carries four times as much', rel(curveAt(withParam(b, 'kf', 0.5), 'pcr', 3), 4 * curveAt(b, 'pcr', 3), 1e-12));
  ok('torsion 16T/(πd³) at 50 mm', rel(curveAt(M('torsion'), 'tau', 0.05), (16 * 500) / (Math.PI * 0.05 ** 3), 1e-12));
}

console.log('=== thermal and fluids ===');
{
  const c = M('cooling');
  ok('Newton cooling: the excess falls by e in mc/(hA)', rel(stateAt(c, 'temp', 900) - 20, 180 / Math.E, 1e-4), stateAt(c, 'temp', 900));
  const t = M('tank');
  const end = runEnd(t);
  const toStop = 500 * (Math.sqrt(4 / 9.81) - Math.sqrt(0.001 / 9.81));
  ok('Torricelli: the run stops itself at the level the formula says, to 0.1%', end.stopped === 'boundary' && rel(end.t, toStop, 1e-3), `${end.t} vs ${toStop}`);
  const n = M('nozzle-area');
  ok('A/A* = 1.6875 at M = 2', rel(curveAt(n, 'ar', 2), 1.6875, 1e-12));
  ok('… with its minimum 1 at the throat, M = 1', rel(curveAt(n, 'ar', 1), 1, 1e-12) && rel(curveExtremes(n, 'ar', 20000).minAt, 1, 1e-3));
  ok('Darcy–Weisbach at 2 m/s: 8 kPa', rel(curveAt(M('pipe-loss'), 'dp', 2), 8000, 1e-12));
}

console.log('=== aerospace ===');
{
  ok('Δv = 300 g₀ ln 10', rel(curveAt(M('rocket'), 'dv', 10), 300 * 9.80665 * Math.log(10), 1e-12));
  const k = M('kepler');
  ok('geostationary: one sidereal day, 23.93 h', rel(curveAt(k, 'period', 35786) / 60, 23.934, 1e-3), curveAt(k, 'period', 35786) / 60);
  ok('400 km: about 92.6 minutes', rel(curveAt(k, 'period', 400), 92.56, 1e-3));
  ok('lift at 70 m/s', rel(curveAt(M('lift'), 'l', 70), 0.5 * 1.225 * 4900 * 16 * 0.5, 1e-12));
}

console.log('=== chemical and process ===');
{
  const m = M('consecutive');
  const pk = stateMax(m, 'b');
  const tstar = Math.log(2.5) / 0.3;
  ok('B peaks at ln(k₁/k₂)/(k₁ − k₂)', Math.abs(pk.t - tstar) < 0.02, pk.t);
  ok('… at the height the closed form gives', rel(pk.v, (0.5 / 0.3) * (Math.exp(-0.2 * tstar) - Math.exp(-0.5 * tstar)), 1e-4), pk.v);
  ok('Arrhenius: the ratio from 300 K to 310 K', rel(curveAt(M('arrhenius'), 'k', 310) / curveAt(M('arrhenius'), 'k', 300), Math.exp((50000 / 8.314462618) * (1 / 300 - 1 / 310)), 1e-10));
}

console.log('=== control ===');
{
  const c = ex('pd').check(M('pd'));
  ok('PD: a spiral at K_d = 2 with eigenvalues −1 ± i√24', /stable spiral/.test(c) && /−1 \+ 4\.9i/.test(c), c);
  ok('… a node past critical damping', /stable node at \(0, 0\), eigenvalues −2\.1, −11\.9/.test(c));
  const pi = ex('pi-motor').check(M('pi-motor'));
  ok('PI: rest at the target speed, with z* = bω_ref/(K·K_i)', /stable node at \(100, 4\)/.test(pi), pi);
  ok('… and the run gets there', rel(stateAt(M('pi-motor'), 'w', 4.99), 100, 1e-4));
}

console.log('=== fields: a rod, a shock, a front and a pattern ===');
{
  const rod = M('rod');
  const run = fieldRun(rod);
  const end = run.u[0].at(-1).at(-1);
  const ref = heatSeries(() => 20, 0, 0.5, 1.2e-5, { left: 100, right: 'insulated' }, 400, 4000)(0.5, 7200);
  ok('rod: the insulated end after two hours, against the quarter-wave series (Atlas benchmark 25)', rel(end, ref, 1e-4), `${end} vs ${ref}`);
  ok('rod: the run states its own check against the series, and it is small', run.checks.some((c) => /series/.test(c.what) && c.value < 1e-3));
  const cu = withParam(rod, 'alpha', 1.1e-4);
  ok('rod: copper’s diffusivity heats the far end far sooner', fieldRun(cu).u[0].at(-1).at(-1) > end + 30);
  const sh = fieldRun(M('shock'));
  const grad = (k) => Math.max(...sh.u[0][k].map((v, i, u) => Math.abs(u[(i + 1) % u.length] - v))) / (sh.x[1] - sh.x[0]);
  ok('shock: it steepens — the steepest slope grows twentyfold by t = 0.3', grad(30) > 20 * grad(0), `${grad(0)} → ${grad(30)}`);
  ok('shock: on a ring ∫u dx is kept to round-off', sh.checks.some((c) => /∫u/.test(c.what) && c.value < 1e-12));
  const fr = M('front');
  const v = frontSpeed(fieldRun(fr));
  ok('front: Fisher’s speed 2√(rD), approached from below', v > 1.9 && v < 2, v);
  // At every corner the controls reach, the front stays at least two cells wide. Its speed stays below 2√(rD), and
  // within 5% of Bramson's: x(t) = c*·t − (3/2)√(D/r)·ln t, so over the window measured the mean speed lags c* by
  // (3/2)√(D/r)·ln(t₂/t₁)/(t₂ − t₁).
  for (const [D, r] of [[2, 2], [0.5, 2], [2, 0.5], [0.5, 0.5]]) {
    const run = fieldRun(withParam(withParam(fr, 'D', D), 'r', r));
    const s2 = frontSpeed(run);
    const c = 2 * Math.sqrt(D * r);
    const L = 100;
    const t1 = (0.3 * L) / c, t2 = (0.8 * L) / c;
    const bramson = c - (1.5 * Math.sqrt(D / r) * Math.log(t2 / t1)) / (t2 - t1);
    ok(`front at D = ${D}, r = ${r}: below 2√(rD) = ${c}, within 5% of Bramson's ${bramson.toFixed(3)}`, s2 < c && Math.abs(s2 - bramson) < 0.05 * bramson, s2);
  }
  const gs = fieldRun(M('patterns'));
  const share = (k) => gs.u[1][k].filter((x) => x > 0.1).length / gs.u[1][k].length;
  ok('patterns: v spreads from a 1.6% seed over more than a quarter of the plane', share(0) < 0.02 && share(gs.t.length - 1) > 0.25, share(gs.t.length - 1));
  ok('patterns: the run is a plane of 64 × 64 cells, its frames kept for the clock', gs.dim === 2 && gs.x.length === 64 && gs.y.length === 64 && gs.t.length === 31);
}

console.log('=== Live 3D examples read as written, and measure ===');
{
  for (const s of SCENE_EXAMPLES) {
    const r = readScene(s.say, { nodes: [], next: 1, unit: 'm' });
    ok(`${s.id}: every clause read, nothing skipped`, r.clauses.every((c) => c.understood && !c.skipped), JSON.stringify(r.clauses));
  }
  const at = (id) => readScene(SCENE_EXAMPLES.find((s) => s.id === id).say, { nodes: [], next: 1, unit: 'm' }).preview;
  const fw = at('flywheel-solid');
  ok('flywheel: 7850·π·0.3²·0.1 kg', SCENE.facts(fw, { guarded: false }).some((f) => /mass 222\.0 kg/.test(f)));
  const radial = at('radial');
  ok('radial: seven cylinders around the crankcase, facing out', radial.nodes.length === 8 && radial.nodes.slice(1).every((n) => Math.abs(Math.hypot(n.pos[0], n.pos[2]) - 0.4) < 1e-9));
  const flange = at('flange');
  ok('flange: eight bolts on a 240 mm circle, resting on it', flange.nodes.slice(1).every((n) => n.on === 'cylinder1' && Math.abs(Math.hypot(n.pos[0], n.pos[2]) - 0.12) < 1e-9) && flange.nodes.length === 9);
  const pipe = at('pipe');
  ok('pipe: π(R² − r²)·L of steel', SCENE.facts(pipe, { guarded: false }).some((f) => /mass 23\.43 kg/.test(f)));
  const noz = at('nozzle');
  ok('nozzle: the throat found, its area ratios, and no material', SCENE.partFacts(noz, noz.nodes[0].id).some((f) => /narrowest radius 0\.15 m/.test(f)) && noz.nodes[0].density === undefined);
  const wing = at('wing');
  ok('wing: planform area c·b and aspect ratio b/c', SCENE.partFacts(wing, wing.nodes[0].id).some((f) => /planform area 6\.000 m²; aspect ratio b²\/S = 2\.667/.test(f)));
  ok('wing: 12% thick, 180 mm on a 1.5 m chord', SCENE.partFacts(wing, wing.nodes[0].id).some((f) => /thickest 0\.18 m \(12% of the chord\)/.test(f)));
  // stretched only across its thickness, the section is no longer 12%: the fact follows the stretch
  const fat = { ...wing, nodes: wing.nodes.map((n) => ({ ...n, scale: [1, 1, 1.5] })) };
  ok('wing stretched 1.5× in thickness: 18% thick, planform unchanged', SCENE.partFacts(fat, fat.nodes[0].id).some((f) => /planform area 6\.000 m².*thickest 0\.27 m \(18% of the chord\)/.test(f)));
  const squashed = { ...noz, nodes: noz.nodes.map((n) => ({ ...n, scale: [2, 1, 1] })) };
  ok('nozzle stretched unevenly across: the radii are said to be its profile’s, the ratios unchanged', SCENE.partFacts(squashed, squashed.nodes[0].id).some((f) => /narrowest radius 0\.15 m \(of its profile, before the stretch\)/.test(f)) && SCENE.partFacts(squashed, squashed.nodes[0].id).some((f) => /area ratios \(r\/r_min\)²: 2\.507 and 39\.06/.test(f)));
  // the designs added for the docs' CAD gallery, each held to what it should measure
  const beam = at('ibeam');
  const b0 = beam.nodes[0];
  const Ib = 2 * ((0.2 * 0.015 ** 3) / 12 + 0.2 * 0.015 * 0.1425 ** 2) + (0.009 * 0.27 ** 3) / 12;
  const sb = sectionOf(b0);
  ok('I-beam: area 2·b·t_f + t_w·h_w, laid along z, 3 m long', rel(sb.area, 2 * 0.2 * 0.015 + 0.009 * 0.27, 1e-12) && rel(worldBox(b0).max[2] - worldBox(b0).min[2], 3, 1e-9) && rel(worldBox(b0).max[1] - worldBox(b0).min[1], 0.3, 1e-9));
  ok('I-beam: I about its strong axis by the parallel-axis theorem, 1.367×10⁻⁴ m⁴', rel(sb.Ix, Ib, 1e-9) && /1\.367×10⁻⁴ m⁴/.test(SCENE.partFacts(beam, b0.id).join(' ')));
  ok('I-beam: 7850 × A × 3 kg', rel(massOf(b0).kg, 7850 * sb.area * 3, 1e-12));
  const truss = at('truss');
  ok('truss: 11 bars, the posts a bay of 0.975 m apart', truss.nodes.length === 11 && truss.nodes.filter((n) => /^post/.test(n.name)).every((n, i, a) => i === 0 || rel(n.pos[0] - a[i - 1].pos[0], 0.975, 1e-9)));
  ok('truss: its mass is the bars’, 7850 × 0.15016 m³', rel(sceneMass(truss).kg, 7850 * (2 * 0.04 + 5 * 0.01 + 4 * 1.4 * 0.06 * 0.06), 1e-9));
  const brg = at('bearing');
  const balls = brg.nodes.filter((n) => n.shape === 'sphere');
  ok('bearing: nine balls on the 35 mm pitch circle, each touching both races at mid-height', balls.length === 9 && balls.every((n) => rel(Math.hypot(n.pos[0], n.pos[2]), 0.035, 1e-9) && rel(n.pos[1], 0.01, 1e-9)) && rel(0.035 - 0.01, brg.nodes[1].dims.R, 1e-12) && rel(0.035 + 0.01, brg.nodes[0].dims.r, 1e-12));
  const pul = at('pulley');
  const exact = 7870 * Math.PI * 2 * ((0.1 ** 3 - 0.08 ** 3) / 3);
  ok('pulley: its numerical mass agrees with π∫r² dy to 1e-6', rel(massOf(pul.nodes[0]).kg, exact, 1e-6) && massOf(pul.nodes[0]).how === 'numerical');
  const spk = at('sprocket');
  ok('sprocket: a 24-point star’s area n·r·rᵢ·sin(π/n), and its mass from it', rel(sectionOf(spk.nodes[0]).area, 24 * 0.1 * 0.088 * Math.sin(Math.PI / 24), 1e-12) && rel(massOf(spk.nodes[0]).kg, 7850 * 0.02 * 24 * 0.1 * 0.088 * Math.sin(Math.PI / 24), 1e-12));
  const hs = at('heatsink');
  const fins = hs.nodes.slice(1);
  ok('heat sink: ten fins on a 10 mm pitch, centred on the base and resting on it', fins.length === 10 && rel(Math.min(...fins.map((n) => n.pos[0])), -0.045, 1e-9) && rel(Math.max(...fins.map((n) => n.pos[0])), 0.045, 1e-9) && fins.every((n) => n.on === hs.nodes[0].id));
  ok('heat sink: 345.6 g of aluminium', rel(sceneMass(hs).kg, 2700 * (0.1 * 0.008 * 0.08 + 10 * 0.002 * 0.04 * 0.08), 1e-12));
  const vawt = at('vawt');
  const blades = vawt.nodes.filter((n) => /^blade/.test(n.name));
  ok('wind turbine: three blades 0.8 m from the mast, 120° apart, and no mass claimed', blades.length === 3 && blades.every((n) => rel(Math.hypot(n.pos[0], n.pos[2]), 0.8, 1e-9)) && sceneMass(vawt) === null);
  const rot = at('rotor');
  const rb = rot.nodes.filter((n) => /^blade/.test(n.name));
  // each blade's own "up" (its local y) leans 12° from the vertical: the copies keep the pitch
  const tilt = (n) => (Math.acos(rotationMatrix(n.rot)[1][1]) * 180) / Math.PI;
  ok('rotor: three blades around the hub, each still pitched 12°', rb.length === 3 && rb.every((n) => rel(Math.hypot(n.pos[0], n.pos[2]), 0.35, 1e-9) && Math.abs(tilt(n) - 12) < 1e-6), JSON.stringify(rb.map(tilt)));
  const spring = at('spring');
  ok('spring: its wire measured along the helix, said to be numerical', SCENE.partFacts(spring, spring.nodes[0].id).some((f) => /the curve’s length 3\.1\d\d m/.test(f)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
