// The simulated objects, checked against the world.
//
// WHY THIS SUITE IS DIFFERENT FROM EVERY OTHER ONE HERE. The rest of the
// visualisation tests ask whether a picture was drawn correctly. These ask
// whether it was drawn about something TRUE — and that is a question with
// published answers, so the assertions are values from the literature rather
// than values from our own code:
//
//   the Schwarzschild radius of the Sun is 2.953 km
//   the innermost stable circular orbit of a non-spinning hole is 6 r_g
//   a maximally spinning disk converts 32% of what falls in, against 5.7%
//   Jupiter, at 5.2044 AU, takes 11.862 years and moves at 13.7 km/s
//   a driven oscillator resonates BELOW its natural frequency, and not at all
//     once the damping ratio passes 1/√2
//   light passing at b bends by 4GM/bc² — the 1919 eclipse measurement
//
// None of those can be made to pass by writing the formula down wrong twice,
// which is the failure mode a self-consistent suite has no defence against.
//
// The last block is about a different kind of truth: that the MODEL cannot
// reach into the physics. It may name an object and nudge a starting value.
// It may not widen a range, and if it tries, the range it gets is the physical
// one — because a spin slider that runs past 1 produces a picture that goes on
// looking convincing while meaning nothing.

import {
  PHYS, B_CRIT, blackHole, iscoEnergy, ergosphereAt, orbitPeriod, redshift, tidal,
  deflectionWeak, photonPath, orbit, speedAt, eccentricAnomaly, positionAt,
  oscillator, oscillatorAt, projectile, say, sayText, ratio, percent,
  COSMO, ageNow, ageAt, gStar, hubbleAt, recombinationZ, lastScatteringZ, equalityZ,
  heliumFraction, temperatureAt, kTeV, epochs, speciesAt,
  gravityPreset, gravityRun, gravityStep, energy, recentre, barycentre,
  discTemperature, eddingtonRate, observedTemperature, doppler, orbitalBeta, blackbodyRGB,
  criticalImpact,
  kerrShadow,
  circularOrbit,
  frameDragging,
} from './.tmp/logos-physics.mjs';
import { ELEMENTS, element, bySymbol, elementColour, darkenForPaper, primordial } from './.tmp/elements.mjs';
import { sanitizeViz, buildFrame, SIM_OBJECTS, VIZ_KINDS } from './.tmp/logos-viz.mjs';
import { sanitizeMap, CONTEXT_LABEL } from './.tmp/logos.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
/** within `tol` as a FRACTION of the expected value */
const near = (a, b, tol) => Math.abs(a - b) <= Math.abs(b) * tol;
const okNear = (n, a, b, tol, unit = '') =>
  ok(n, near(a, b, tol), `got ${a}${unit}, expected ${b}${unit} (±${tol * 100}%)`);

console.log('=== the Schwarzschild geometry, against the textbook ===');
{
  const sun = blackHole(PHYS.Msun, 0);
  okNear('the Sun’s Schwarzschild radius is 2.953 km', sun.rs, 2953, 0.001, ' m');
  okNear('  Earth’s is 8.87 mm', blackHole(PHYS.Mearth, 0).rs, 0.00887, 0.002, ' m');
  ok('the horizon of a still hole IS the Schwarzschild radius', sun.horizon === sun.rs);
  ok('  and it has no inner horizon', sun.innerHorizon === 0);
  okNear('the photon sphere is 3 r_g', sun.photonSphere / sun.rg, 3, 1e-9);
  okNear('the ISCO is 6 r_g', sun.isco / sun.rg, 6, 1e-9);
  okNear('the shadow is √27 r_g', sun.shadow / sun.rg, Math.sqrt(27), 1e-12);
  // The shadow is the number a telescope measures, and it is 2.6 times the
  // horizon — the distinction the picture exists to make.
  okNear('  which is 2.6 Schwarzschild radii, not 1', sun.shadow / sun.rs, 2.598, 0.001);
  okNear('accretion efficiency is 5.72% of mc²', sun.efficiency, 0.0572, 0.005);
  okNear('  the orbital energy at the ISCO is √(8/9)', iscoEnergy(6, 0), Math.sqrt(8 / 9), 1e-9);
  // For comparison, and it is the comparison that makes the number mean
  // something: hydrogen fusion manages 0.7%.
  ok('  which beats fusion by a factor of eight', sun.efficiency / 0.007 > 8);
}

console.log('\n=== Kerr, and that it reduces to Schwarzschild ===');
{
  // THE CHEAPEST CHECK THAT THE ALGEBRA WAS TRANSCRIBED RIGHT. Every Kerr
  // expression has a Schwarzschild limit, and a sign error in the ISCO root
  // survives every other test but not this one.
  const still = blackHole(PHYS.Msun, 0);
  const barely = blackHole(PHYS.Msun, 1e-9);
  for (const k of ['horizon', 'photonSphere', 'isco', 'efficiency']) {
    okNear(`  ${k} at a★ → 0 matches the still hole`, barely[k], still[k], 1e-6);
  }

  const fast = blackHole(PHYS.Msun, 0.998);
  okNear('at the Thorne limit the ISCO is 1.237 r_g', fast.isco / fast.rg, 1.237, 0.002);
  okNear('  and efficiency reaches 32%', fast.efficiency, 0.321, 0.01);
  okNear('  the horizon has shrunk toward r_g', fast.horizon / fast.rg, 1.0632, 0.002);
  ok('  the two horizons have nearly merged', fast.innerHorizon / fast.horizon > 0.87);

  // Spin drags orbits inward, monotonically. Stated as a property rather than
  // as five more numbers: it is the behaviour the slider is for.
  let prev = Infinity, monotone = true;
  for (let a = 0; a <= 0.99; a += 0.05) {
    const r = blackHole(PHYS.Msun, a).isco / blackHole(PHYS.Msun, a).rg;
    if (r > prev + 1e-9) monotone = false;
    prev = r;
  }
  ok('spinning it up always moves the ISCO inward', monotone);

  ok('spin never passes the Thorne limit, however it is asked',
    blackHole(PHYS.Msun, 5).spin === 0.998 && blackHole(PHYS.Msun, -3).spin === 0);

  // The ergosphere: horizon at the poles, 2 r_g at the equator, always.
  const e = blackHole(PHYS.Msun, 0.9);
  okNear('the ergosphere meets the horizon at the pole', ergosphereAt(e, 0), e.horizon, 1e-9);
  okNear('  and reaches 2 r_g at the equator', ergosphereAt(e, Math.PI / 2), 2 * e.rg, 1e-12);
  ok('  which does not depend on the spin at all', e.ergosphere === blackHole(PHYS.Msun, 0.1).ergosphere);
}

console.log('\n=== the quantum and the tidal ===');
{
  const sun = blackHole(PHYS.Msun, 0);
  okNear('Hawking temperature of a solar-mass hole is 61.7 nK', sun.hawkingT, 6.17e-8, 0.005, ' K');
  okNear('  it evaporates in 2.1 × 10⁶⁷ years', sun.evaporation / PHYS.year, 2.1e67, 0.02);
  // Bigger is colder, and by exactly one power.
  okNear('doubling the mass halves the temperature', blackHole(2 * PHYS.Msun, 0).hawkingT * 2, sun.hawkingT, 1e-9);
  okNear('  and lengthens the life eightfold', blackHole(2 * PHYS.Msun, 0).evaporation, 8 * sun.evaporation, 1e-9);

  // Why falling into a small hole is worse than falling into a big one — the
  // one fact about black holes that runs opposite to intuition.
  const small = blackHole(10 * PHYS.Msun, 0);
  const big = blackHole(1e8 * PHYS.Msun, 0);
  ok('tides at the horizon are lethal for a stellar hole',
    tidal(small, small.horizon, 1.8) / PHYS.g0 > 1e6);
  ok('  and gentle for a supermassive one', tidal(big, big.horizon, 1.8) / PHYS.g0 < 1e-3);

  ok('redshift diverges at the horizon', !Number.isFinite(redshift(sun, sun.rs)));
  okNear('  and is 0.225 at three Schwarzschild radii', redshift(sun, 3 * sun.rs), 0.2247, 0.005);
  // Kepler's third law survives general relativity in these coordinates, which
  // is worth pinning because it is so nearly too good to be true.
  okNear('the ISCO period is 2π√(r³/GM) exactly',
    orbitPeriod(sun, sun.isco), 2 * Math.PI * Math.sqrt(sun.isco ** 3 / (PHYS.G * sun.M)), 1e-12);
}

console.log('\n=== light, actually integrated ===');
{
  // THE 1919 MEASUREMENT. Far from the hole the integrated path must reproduce
  // Einstein's 4GM/bc², and it is the one result here that was checked against
  // the sky before it was checked against a computer.
  // The first-order term alone is only good to a few per cent by b = 100, so
  // the far rays are checked against it and the nearer ones against the series
  // it is the first term of. Asserting 4/b at b = 100 would be asserting the
  // integrator is WORSE than it is.
  okNear('b = 1000 r_g bends by 4GM/bc\u00B2, to a third of a per cent', photonPath(1000).deflection, 4 / 1000, 0.004);
  // And against the series 4/b is the first term of, where the integration is
  // good to about a hundredth of a per cent — which is the real claim, and a
  // far stronger one than agreeing with the leading term.
  const series = (b) => 4 / b + (15 * Math.PI) / (4 * b * b) + 128 / (3 * b ** 3);
  // Stopping at 50: by b = 20 it is the SERIES that has run out of terms, not
  // the integration, and tightening the tolerance there would be asserting
  // that the exact answer should agree with an approximation to it.
  for (const b of [1000, 200, 100, 50]) {
    okNear(`b = ${b} r_g matches the post-Newtonian series`, photonPath(b).deflection, series(b), 0.0006);
  }
  // Converged: refining the step by a factor of sixteen moves nothing that a
  // three-figure readout could show.
  okNear('  and it is converged, not merely close',
    photonPath(100).deflection, photonPath(100, { steps: 48000, maxTurn: 16 * Math.PI }).deflection, 1e-5);
  const sun = blackHole(PHYS.Msun, 0);
  okNear('  and the same in SI, through deflectionWeak',
    deflectionWeak(sun, 500 * sun.rg), photonPath(500).deflection, 0.02);

  // The second-order term is real and shows up where it should.
  ok('at 20 r_g the bend clearly exceeds the first-order value', photonPath(20).deflection > 1.15 * (4 / 20));

  ok('below √27 the photon is captured', photonPath(B_CRIT - 0.01).captured);
  ok('  above it, it escapes', !photonPath(B_CRIT + 0.01).captured);
  ok('  and a captured ray reaches the horizon', photonPath(3).periapsis < 2.01);
  // The photon ring: just outside critical, the ray loops the hole before
  // leaving. This is what makes the bright circle in a real image.
  ok('just outside critical it loops the hole more than once',
    photonPath(B_CRIT + 0.0001).deflection > 2 * Math.PI);
  ok('  and the deflection grows without bound as b → b_crit',
    photonPath(B_CRIT + 0.0001).deflection > photonPath(B_CRIT + 0.01).deflection);

  // The integration must not depend on where it was started, or the "bend"
  // being reported is an artefact of the window rather than a fact about the
  // spacetime. This is the assertion that caught measuring against π.
  const a = photonPath(12).deflection;
  const c = photonPath(12, { steps: 9000, maxTurn: 20 * Math.PI }).deflection;
  okNear('the result does not depend on the step count', a, c, 0.005);
  ok('a path is returned to draw', photonPath(8).points.length > 50);
}

console.log('\n=== Kerr: the spin is in the light, not only in the labels ===');
{
  // THE NUMBERS THIS SECTION PINS ARE THE TEXTBOOK ONES. Each is a value a
  // physicist would recognise on sight, which is the point: an integrator and a
  // closed form that agree with each other but not with the literature are two
  // mistakes, not a check.
  const crit0 = criticalImpact(0);
  okNear('at rest the capture threshold is √27 both ways', crit0.prograde, B_CRIT, 1e-12);
  ok('  with the retrograde one the mirror of it', crit0.retrograde === -crit0.prograde);

  const crit = criticalImpact(0.998);
  okNear('near the extremal limit co-rotating light survives to 2 r_g', crit.prograde, 2, 0.06);
  okNear('  while light going the other way is swallowed out at 7', crit.retrograde, -7, 0.01);
  ok('  which is the asymmetry a spinning hole HAS', Math.abs(crit.retrograde) > 3 * crit.prograde);

  // The integrator against the closed form, at three spins, both senses. This is
  // the assertion that the rays are computed in the metric the figure claims.
  for (const a of [0.3, 0.7, 0.95]) {
    const c = criticalImpact(a);
    ok(`a★ = ${a}: a co-rotating ray inside the threshold is captured`,
      photonPath(c.prograde - 0.05, { spin: a }).captured);
    ok(`  and outside it escapes`, !photonPath(c.prograde + 0.05, { spin: a }).captured);
    ok(`  a counter-rotating ray inside is captured`,
      photonPath(c.retrograde + 0.05, { spin: a }).captured);
    ok(`  and outside it escapes`, !photonPath(c.retrograde - 0.05, { spin: a }).captured);
    // The same aiming distance, the two senses: one gets out, the other does not.
    const between = (c.prograde + Math.abs(c.retrograde)) / 2;
    ok(`  the same b is captured one way round and not the other`,
      !photonPath(between, { spin: a }).captured && photonPath(-between, { spin: a }).captured);
  }

  // Spin changes the PATH, not only the verdict.
  const bendPro = photonPath(8, { spin: 0.9 }).deflection;
  const bendRet = photonPath(-8, { spin: 0.9 }).deflection;
  ok('at the same aiming distance the two senses bend by different amounts', Math.abs(bendPro - bendRet) > 1e-3);
  ok('  and light going against the rotation is bent more', bendRet > bendPro);
  okNear('  while at a★ = 0 the two are identical',
    photonPath(8, { spin: 0 }).deflection, photonPath(-8, { spin: 0 }).deflection, 1e-12);

  // What the integrator does when it cannot finish, which is the honest half.
  const hard = photonPath(criticalImpact(0.9).prograde + 0.0005, { spin: 0.9, maxTurn: 4 * Math.PI });
  ok('a ray that runs out of sweep says so', hard.truncated || hard.decidedBy === 'threshold');
  ok('  and its verdict is attributed to the threshold, not to the path',
    !hard.truncated ? true : hard.decidedBy === 'threshold');
  ok('an ordinary ray is decided by the integration itself',
    photonPath(9, { spin: 0.5 }).decidedBy === 'integration');
  ok('every ray reports which way round it went',
    photonPath(9, { spin: 0.5 }).sense === 'prograde' && photonPath(-9, { spin: 0.5 }).sense === 'retrograde');
}

console.log('\n=== Kerr: the shadow, the orbits and the disc ===');
{
  const still = kerrShadow(0);
  ok('with no spin the shadow is a circle', still.circular);
  okNear('  of √27 r_g', still.alphaMax, B_CRIT, 1e-9);
  okNear('  in every direction', still.betaMax, B_CRIT, 1e-9);

  const fast = kerrShadow(0.998, Math.PI / 2);
  ok('spinning, it is not a circle', !fast.circular);
  okNear('  flat-edged at 2 r_g on the co-rotating side', -fast.alphaMin, 2, 0.06);
  okNear('  and reaching 7 r_g on the other', fast.alphaMax, 7, 0.01);
  okNear('  while its height stays about √27', fast.betaMax, B_CRIT, 0.01);
  ok('  which is the D-shape Bardeen derived', fast.alphaMax + fast.alphaMin > 4);
  ok('seen down the spin axis it is round again',
    Math.abs(kerrShadow(0.998, 0.02).alphaMax - Math.abs(kerrShadow(0.998, 0.02).alphaMin)) < 0.2);

  const sun = blackHole(PHYS.Msun, 0);
  const o = circularOrbit(sun, sun.isco);
  okNear('at the Schwarzschild ISCO the gas moves at exactly c/2', o.beta, 0.5, 1e-12);
  okNear('  its clock runs at 1/√2 of infinity’s', o.redshift, Math.SQRT2, 1e-12);
  okNear('  and the lapse there is √(2/3)', o.lapse, Math.sqrt(2 / 3), 1e-12);
  ok('  nothing is dragged when nothing spins', o.drag === 0);
  okNear('  and the period is Kepler’s exactly',
    o.period, 2 * Math.PI * Math.sqrt(sun.isco ** 3 / (PHYS.G * sun.M)), 1e-12);

  ok('inside the photon orbit there is no circular orbit at all',
    !circularOrbit(sun, 2.5 * sun.rg).exists);
  ok('  between the photon orbit and the ISCO there is one, but not a stable one',
    circularOrbit(sun, 4 * sun.rg).exists && !circularOrbit(sun, 4 * sun.rg).stable);
  ok('  and outside the ISCO it is stable', circularOrbit(sun, 8 * sun.rg).stable);

  const spun = blackHole(PHYS.Msun, 0.9);
  ok('frame dragging is there when the hole spins', frameDragging(spun, 6 * spun.rg) > 0);
  ok('  and falls off with distance', frameDragging(spun, 6 * spun.rg) > frameDragging(spun, 20 * spun.rg));
  const pro = circularOrbit(spun, 6 * spun.rg, 'prograde');
  const ret = circularOrbit(spun, 6 * spun.rg, 'retrograde');
  ok('co-rotating and counter-rotating gas at one radius do not keep the same time',
    Math.abs(pro.period - ret.period) / pro.period > 0.05);
  ok('  and they go opposite ways', Math.sign(pro.omega) !== Math.sign(ret.omega));

  // The retrograde disc, which used to be drawn at the right radius with the
  // wrong temperature because the prograde efficiency was reused for it.
  const ext = blackHole(PHYS.Msun, 0.998);
  okNear('the prograde ISCO reaches 1.237 r_g at the Thorne limit', ext.isco / ext.rg, 1.2371, 0.002);
  okNear('  while a retrograde disc is held out at 9', ext.iscoRetro / ext.rg, 8.9944, 0.002);
  okNear('  radiating 32% of what falls in one way round', ext.efficiency, 0.3210, 0.01);
  okNear('  and 3.8% the other', ext.efficiencyRetro, 0.0378, 0.02);
  ok('  which are different numbers, and now both exist', ext.efficiency > 5 * ext.efficiencyRetro);
  ok('at rest the two senses agree exactly',
    Math.abs(sun.isco - sun.iscoRetro) < 1e-6 && Math.abs(sun.efficiency - sun.efficiencyRetro) < 1e-9);

  const mdot = eddingtonRate(ext, 0.1);
  const mdotRetro = eddingtonRate(ext, 0.1, 'retrograde');
  ok('a retrograde disc needs far more gas for the same light', mdotRetro > 5 * mdot);
  const rr = 12 * ext.rg;
  ok('and one radius is two temperatures, depending which way the disc turns',
    Math.abs(observedTemperature(ext, rr, mdot, 0, 'prograde').T - observedTemperature(ext, rr, mdot, 0, 'retrograde').T) > 1);

  // Surface gravity and the Hawking temperature now carry the spin.
  okNear('at rest the surface gravity is c⁴/4GM', sun.surfaceGravity, PHYS.c ** 4 / (4 * PHYS.G * PHYS.Msun), 1e-12);
  ok('and it falls as the hole spins up', ext.surfaceGravity < 0.2 * sun.surfaceGravity);
  ok('  taking the Hawking temperature with it', ext.hawkingT < 0.2 * sun.hawkingT);
  okNear('  which at rest is ħc³/8πGMk_B',
    sun.hawkingT, (PHYS.hbar * PHYS.c ** 3) / (8 * Math.PI * PHYS.G * PHYS.Msun * PHYS.kB), 1e-9);
}

console.log('\n=== two bodies, against the solar system ===');
{
  // Jupiter: a = 5.2044 AU, e = 0.0489. Period 11.862 yr, perihelion 4.9501 AU,
  // speed at perihelion 13.72 km/s, at aphelion 12.44 km/s.
  const j = orbit(PHYS.Msun, 1.898e27, 5.2044 * PHYS.AU, 0.0489);
  okNear('Jupiter’s year is 11.86 years', j.period / PHYS.year, 11.862, 0.002);
  okNear('  perihelion 4.95 AU', j.periapsis / PHYS.AU, 4.9501, 0.001);
  okNear('  13.72 km/s at perihelion', j.vPeri, 13720, 0.01);
  okNear('  12.44 km/s at aphelion', j.vApo, 12440, 0.01);

  const earth = orbit(PHYS.Msun, PHYS.Mearth, PHYS.AU, 0.0167);
  okNear('Earth’s year is 365.25 days', earth.period / 86400, 365.25, 0.002);
  okNear('  at 29.78 km/s on average', earth.vMean, 29780, 0.005);

  // Kepler's third law says the period depends on `a` and NOTHING else — not
  // on the eccentricity. It is the counter-intuitive half of the law.
  const round = orbit(PHYS.Msun, 0, PHYS.AU, 0);
  const thin = orbit(PHYS.Msun, 0, PHYS.AU, 0.9);
  okNear('the period does not depend on eccentricity', round.period, thin.period, 1e-12);
  ok('  nor does the orbital energy', Math.abs(round.energy - thin.energy) < 1e-6);

  // Vis-viva, at both ends, from the general formula.
  okNear('vis-viva reproduces the periapsis speed', speedAt(j, j.periapsis), j.vPeri, 1e-9);
  okNear('  and the ratio of the two speeds is (1+e)/(1-e)',
    j.vPeri / j.vApo, (1 + j.e) / (1 - j.e), 1e-9);

  // Kepler's equation, solved rather than approximated.
  for (const e of [0, 0.3, 0.7, 0.9]) {
    const E = eccentricAnomaly(1.2, e);
    okNear(`  M = E - e sin E holds at e = ${e}`, E - e * Math.sin(E), 1.2, 1e-9);
  }

  // Kepler's SECOND law, as an actual measurement: equal areas in equal times.
  // The shaded sector in the picture is this, and if it were drawn at constant
  // angular rate instead the areas would differ by a factor of 30 here.
  const area = (o, t0, dt) => {
    let A = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const p = positionAt(o, t0 + (dt * i) / N);
      const q = positionAt(o, t0 + (dt * (i + 1)) / N);
      A += Math.abs(p.x * q.y - q.x * p.y) / 2;
    }
    return A;
  };
  const o = orbit(PHYS.Msun, 0, PHYS.AU, 0.8);
  okNear('equal times sweep equal areas, near and far',
    area(o, 0, 0.05), area(o, 0.5, 0.05), 0.01);
  ok('  and the body really is faster near the focus',
    positionAt(o, 0).v / positionAt(o, 0.5).v > 8);
}

console.log('\n=== a driven oscillator ===');
{
  const base = { m: 1, k: 100, c: 2, F: 10, w: 5 };
  const o = oscillator(base);
  okNear('ω₀ = √(k/m)', o.w0, 10, 1e-12);
  okNear('  ζ = c/2√(mk)', o.zeta, 0.1, 1e-12);
  okNear('  ω_d = ω₀√(1-ζ²)', o.wd, 10 * Math.sqrt(1 - 0.01), 1e-12);
  okNear('  Q = 1/2ζ', o.Q, 5, 1e-12);

  // THE THING EVERY TEXTBOOK GETS SLIGHTLY WRONG: resonance is not at the
  // natural frequency. It is below it, and above ζ = 1/√2 there is no peak
  // at all — the response just falls away from its static value.
  ok('resonance sits BELOW the natural frequency', o.wResonance < o.w0 && o.wResonance > 0);
  okNear('  at ω₀√(1-2ζ²)', o.wResonance, 10 * Math.sqrt(1 - 0.02), 1e-12);
  const heavy = oscillator({ ...base, c: 2 * Math.sqrt(1 * 100) * 0.8 });
  ok('  and past ζ = 1/√2 there is no peak', heavy.zeta > Math.SQRT1_2 && heavy.wResonance === 0);

  // The measured peak of the response curve agrees with the formula.
  let best = 0, bestW = 0;
  for (let w = 0.01; w < 30; w += 0.005) {
    const a = oscillator({ ...base, w }).amplitude;
    if (a > best) { best = a; bestW = w; }
  }
  okNear('the curve peaks where the formula says', bestW, o.wResonance, 0.002);
  okNear('  at the amplitude it says', best, o.peak, 0.001);

  // A quarter-turn lag exactly at ω₀, whatever the damping — the reliable
  // way to find resonance on a bench.
  for (const c of [0.5, 5, 18]) {
    okNear(`  phase is π/2 at ω₀ (c = ${c})`, oscillator({ ...base, c, w: 10 }).phase, Math.PI / 2, 1e-9);
  }

  // Released from rest, and settling on the steady state.
  okNear('the motion starts from rest at the origin', oscillatorAt(base, o, 0), 0, 1e-9);
  const late = oscillatorAt(base, o, 60 * o.tau);
  ok('  and settles into the steady state', Math.abs(late) <= o.amplitude * 1.001);
  // Undamped and undriven at its own frequency is the one case with a clean
  // closed form to check against.
  const free = { m: 1, k: 100, c: 0, F: 0, w: 1 };
  ok('with no damping and no drive it stays put', Math.abs(oscillatorAt(free, oscillator(free), 3)) < 1e-9);
}

console.log('\n=== a projectile, with and without the air ===');
{
  // With drag switched off the integrator must reproduce the schoolbook
  // parabola exactly. If it cannot do that, nothing it says about drag is
  // worth reading.
  const vac = projectile({ v0: 60, angle: 45, mass: 1, diameter: 0.1, cd: 0 });
  okNear('no drag reproduces v²sin2θ/g', vac.range, vac.vacuumRange, 0.001);
  okNear('  and the apex', vac.apex, vac.vacuumApex, 0.002);
  okNear('  landing at the launch speed', vac.impactSpeed, 60, 0.002);
  okNear('  and the launch angle', vac.impactAngle, 45, 0.01);
  okNear('  with the top exactly halfway', vac.apexAt / vac.range, 0.5, 0.005);

  // A baseball: 0.145 kg, 0.073 m across. Hit at 60 m/s it goes nothing like
  // the 367 m the parabola promises.
  const ball = projectile({ v0: 60, angle: 45, mass: 0.145, diameter: 0.073, cd: 0.47 });
  ok('drag costs a baseball most of its range', ball.range < 0.5 * ball.vacuumRange);
  ok('  it lands slower than it left', ball.impactSpeed < 60);
  ok('  and steeper than it was hit', ball.impactAngle > 45);
  ok('  with the top of the arc past halfway', ball.apexAt / ball.range > 0.5);
  ok('the vacuum parabola is returned for comparison', vac.vacuum.length > 50);

  // Terminal velocity, from the same k the trajectory used.
  const t = projectile({ v0: 1, angle: 89, mass: 0.145, diameter: 0.073, cd: 0.47 });
  okNear('terminal velocity for a baseball is about 33 m/s', t.terminal, 33, 0.1);

  // AND THE ONE EVERYONE KNOWS AND IS WRONG ABOUT: 45° is optimal only in
  // vacuum. With air, the best angle is lower — findable by moving the slider,
  // which is the point of building it this way.
  let bestAngle = 0, bestRange = 0;
  for (let a = 10; a <= 80; a += 1) {
    const r = projectile({ v0: 60, angle: a, mass: 0.145, diameter: 0.073, cd: 0.47 }).range;
    if (r > bestRange) { bestRange = r; bestAngle = a; }
  }
  ok('with air, the best angle is below 45°', bestAngle < 45 && bestAngle > 25, `${bestAngle}°`);
}

console.log('\n=== saying a number the way a person would ===');
{
  ok('kilometres for a stellar horizon', say(29532, 'm') === '29.5\\,\\mathrm{km}', say(29532, 'm'));
  ok('astronomical units for an orbit', say(5.2 * PHYS.AU, 'm').includes('AU'));
  ok('years for a period', say(11.86 * PHYS.year, 's').includes('\\mathrm{yr}'));
  ok('nanokelvin for a Hawking temperature', say(6.17e-8, 'K').includes('\\mathrm{nK}'));
  ok('Earth gravities for an acceleration', say(98.0665, 'm/s2') === '10\\,g', say(98.0665, 'm/s2'));
  ok('  and never c, which is a speed', !say(1e9, 'm/s2').includes(',c'));
  ok('fractions of c for a relativistic speed', say(PHYS.c / 2, 'm/s') === '0.500\\,c', say(PHYS.c / 2, 'm/s'));
  ok('  but ordinary orbital speeds stay in km/s', say(29780, 'm/s').includes('km/s'), say(29780, 'm/s'));
  // A trailing zero inside the significant figures is not noise. Stripping it
  // turned √27 = 5.196 into "5.2" — two figures dressed as three.
  ok('√27 keeps its third figure', ratio(B_CRIT) === '5.20', ratio(B_CRIT));
  ok('  while 10.0 is just 10', ratio(10) === '10', ratio(10));
  ok('percentages for efficiency', percent(0.0572) === '5.72\\%', percent(0.0572));
  ok('the unreadable is said so, not faked', say(Infinity, 'm') === '—' && say(NaN, 's') === '—');
}

console.log('\n=== the model names the object; the code owns the numbers ===');
{
  ok('simulation is a kind', VIZ_KINDS.includes('simulation'));
  // Every object the extractor may name must have a builder, and every builder
  // must be nameable — a count catches a new one added on only one side.
  ok('  with five objects', SIM_OBJECTS.length === 5);
  ok('  the universe among them', SIM_OBJECTS.includes('big-bang'));

  const scene = (raw) => sanitizeViz({ kind: 'simulation', view: { xMin: -28, xMax: 28 }, ...raw });

  // THE ASSERTION THIS WHOLE DESIGN EXISTS FOR. A model that declares a spin
  // slider running 0 to 99 gets 0 to 0.998, because the top of that range is a
  // fact about black holes and not a presentation choice.
  const wide = scene({ sim: { object: 'black-hole' }, params: [{ id: 'a', min: 0, max: 99, step: 1, value: 40 }] });
  const spin = wide.params.find((p) => p.id === 'a');
  ok('a range the model invented is discarded', spin.min === 0 && spin.max === 0.998, JSON.stringify(spin));
  ok('  and its value is clamped into the physical one', spin.value === 0.998);

  // It MAY set a starting value, and that value must survive its own careless
  // range — which it did not, at first: "10 solar masses" declared next to a
  // min/max of 0…1 arrived as 1, and the picture was of a different star.
  const m = scene({ sim: { object: 'black-hole' }, params: [{ id: 'm', min: 0, max: 1, step: 1, value: 10 }] })
    .params.find((p) => p.id === 'm');
  ok('a starting value survives the model’s own bad range', m.value === 10, JSON.stringify(m));

  // Eccentricity is called e everywhere orbits are written about. It is barred
  // elsewhere because it would shadow Euler's number in an expression — and a
  // simulation has no expression at all.
  const ecc = scene({ sim: { object: 'orbit' }, params: [{ id: 'e', min: 0, max: 1, step: 0.1, value: 0.9 }] })
    .params.find((p) => p.id === 'e');
  ok('a simulation may have an eccentricity slider', !!ecc && ecc.value === 0.9);
  ok('  but a function still may not', !sanitizeViz({ kind: 'function', expr: 'e*x', view: { xMin: -1, xMax: 1 }, params: [{ id: 'e', min: 0, max: 2, step: 0.1, value: 1 }] }).params.some((p) => p.id === 'e'));

  // AN UNKNOWN OBJECT IS REFUSED, AND THIS ASSERTION USED TO SAY THE OPPOSITE.
  //
  // It read "an object nobody implemented becomes the black hole", and the
  // comment above it said an unknown object "is not worth losing a picture
  // over". That reasoning is how "simulate the solar system" came back as a
  // three-body figure-eight and "simulate a pendulum in honey" came back as a
  // Kerr black hole with real general-relativistic readouts attached to
  // somebody else's subject. Losing the picture was never the cost; the cost
  // was showing a different subject under the person's own label.
  //
  // The five named objects are surfaces somebody wrote. A name that is not one
  // of them has no surface, and no picture is the honest answer.
  ok('an object nobody implemented is refused', scene({ sim: { object: 'tesseract' } }) === null);
  ok('  as is a missing one', scene({}) === null);
  ok('  and a named one still survives', scene({ sim: { object: 'orbit' } })?.sim?.object === 'orbit');
  // The model the request may ALSO have proposed is untouched by any of this:
  // it travels at the top level of the map, not inside the picture.
  const withModel = sanitizeMap({
    context: 'simulating',
    nodes: [], edges: [],
    viz: { kind: 'simulation', sim: { object: 'tesseract' }, title: 'a tesseract' },
    propose: { id: 'x', title: 'A tesseract', params: [], objects: [{ id: 's', kind: 'surface', label: 'it', defs: { z: 'x^2 - y^2' } }] },
  });
  ok('  while whatever structure WAS built survives the refusal', !!withModel.propose);
  ok('  and no picture is invented for it', !withModel.viz);

  // Every object draws, with readouts, and none of them carries an expression
  // the model wrote.
  for (const object of SIM_OBJECTS) {
    const sc = scene({ sim: { object }, expr: 'x^2 + 999' });
    const vals = Object.fromEntries(sc.params.map((p) => [p.id, p.value]));
    const f = buildFrame(sc, null, vals, { xMin: -28, xMax: 28, yMin: -20, yMax: 20 }, false);
    ok(`${object} draws`, f.objects.length > 2 && f.readouts.length > 4);
    ok(`  ${object} says what it is showing`, f.caption.length > 10);
    ok(`  ${object} has no ids that collide`, new Set(f.objects.map((o) => o.id)).size === f.objects.length);
    ok(`  ${object} produces only finite coordinates`,
      f.objects.every((o) =>
        (o.pts ?? o.lines?.flat() ?? []).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))));
    ok(`  ${object} has real numbers in every readout`, f.readouts.every((r) => r.value === null || r.value.length > 0));
  }

  // The Answer Guard reaches in here like anywhere else: a guarded readout is
  // null, so the number never enters the document and cannot be read back out
  // of the DOM.
  const sc = scene({ sim: { object: 'black-hole' } });
  const vals = Object.fromEntries(sc.params.map((p) => [p.id, p.value]));
  const held = buildFrame(sc, null, vals, { xMin: -28, xMax: 28, yMin: -20, yMax: 20 }, true);
  ok('the guard can hold a readout back', held.readouts.some((r) => r.value === null));
  ok('  while the picture itself still draws', held.objects.length > 2);

  // The sliders actually change the physics, rather than only the drawing.
  const at = (over) => {
    const s2 = scene({ sim: { object: 'black-hole' } });
    const v = { ...Object.fromEntries(s2.params.map((p) => [p.id, p.value])), ...over };
    return buildFrame(s2, null, v, { xMin: -28, xMax: 28, yMin: -20, yMax: 20 }, false);
  };
  const slow = at({ m: 10, a: 0 });
  const fast = at({ m: 10, a: 0.9 });
  const rd = (f, id) => f.readouts.find((r) => r.id === id).value;
  ok('spinning the hole moves the ISCO', rd(slow, 'isco') !== rd(fast, 'isco'), `${rd(slow, 'isco')} → ${rd(fast, 'isco')}`);
  ok('  and raises the efficiency', rd(slow, 'eff') !== rd(fast, 'eff'), `${rd(slow, 'eff')} → ${rd(fast, 'eff')}`);
  ok('changing the mass changes every length', rd(at({ m: 10 }), 'rs') !== rd(at({ m: 20 }), 'rs'));
  ok('aiming the ray inside b_crit captures it', /captur/i.test(rd(at({ b: 3 }), 'defl')));
  ok('  and outside it does not', !/captur/i.test(rd(at({ b: 9 }), 'defl')));
}

console.log('\n=== the drawing IS the physics, not a picture beside it ===');
{
  // THE ASSERTION THAT DECIDES WHETHER ANY OF THIS WAS WORTH BUILDING.
  //
  // A model authoring a `diagram` can draw a black hole that looks exactly
  // like this one. What it cannot do is guarantee that the circle it called
  // the event horizon is at r_+, that the disk's inner edge is at the ISCO,
  // and that both MOVE, correctly, when the spin slider moves. So the radii
  // that come out of the builder are checked against the radii that come out
  // of the physics — every one, at three spins.
  const draw = (over) => {
    const sc = sanitizeViz({
      kind: 'simulation', sim: { object: 'black-hole' }, view: { xMin: -6, xMax: 6 },
      // i = 0: the disk face-on, so a drawn radius is a radius rather than the
      // semi-minor axis of its projection.
      params: Object.entries({ m: 10, b: 7, i: 0, ...over }).map(([id, value]) => ({ id, min: -1e6, max: 1e6, step: 1, value })),
    });
    return buildFrame(sc, null, Object.fromEntries(sc.params.map((p) => [p.id, p.value])),
      { xMin: -30, xMax: 30, yMin: -21, yMax: 21 }, false);
  };
  const outer = (o) => Math.max(...(o.pts ?? o.lines[0]).map((q) => Math.hypot(q.x, q.y)));

  for (const spin of [0, 0.5, 0.95]) {
    const f = draw({ a: spin });
    const bh = blackHole(10 * PHYS.Msun, spin);
    const at = (id) => f.objects.find((o) => o.id === id);
    const rings = f.objects.filter((o) => /^disk\d+$/.test(o.id));
    const innerEdge = Math.min(...rings.map((r) => Math.max(...r.pts.map((q) => Math.hypot(q.x, q.y)))));
    // THE SHADOW IS ONLY A CIRCLE WHEN THE HOLE IS STILL, and this used to
    // assert the opposite: √27 r_g at every spin, which is what the code drew
    // and is wrong for any rotating hole. Co-rotating light escapes from closer
    // in, so the outline is pushed in on one side and bulges on the other, out
    // to the counter-rotating capture threshold.
    const crit = criticalImpact(spin);
    if (spin === 0) {
      okNear('a★ = 0: the shadow is a circle of √27 r_g', outer(at('shadow')), bh.shadow / bh.rg, 1e-9);
    } else {
      okNear(
        `a★ = ${spin}: the shadow reaches the counter-rotating threshold`,
        outer(at('shadow')), Math.abs(crit.retrograde), 0.01
      );
      const alphas = at('shadow').pts.map((q) => q.x);
      okNear(
        `  and is pushed in to the co-rotating one on the other side`,
        -Math.min(...alphas), crit.prograde, 0.02
      );
      ok(`  so it is not a circle`, Math.abs(crit.retrograde) - crit.prograde > 0.5);
    }
    okNear(`  the horizon at r_+`, outer(at('horizon')), bh.horizon / bh.rg, 1e-9);
    okNear(`  the photon ring at the photon sphere`, outer(at('photonring')), bh.photonSphere / bh.rg, 1e-9);
    okNear(`  and the disk stops at the ISCO`, innerEdge, bh.isco / bh.rg, 1e-9);
    ok(`  shadow > photon ring > horizon`, bh.shadow > bh.photonSphere && bh.photonSphere > bh.horizon);
  }

  // And the one a still picture can never show: spin it up and the disk's
  // inner edge really moves, from 6 r_g to under 2.
  const edge = (a) => {
    const f = draw({ a });
    return Math.min(
      ...f.objects
        .filter((o) => /^disk\d+$/.test(o.id))
        .map((r) => Math.max(...r.pts.map((q) => Math.hypot(q.x, q.y))))
    );
  };
  ok('spinning the hole pulls the disk inward on the canvas', edge(0) > 6 - 1e-9 && edge(0.95) < 2);

  // The ray drawn is the ray integrated: it ends at the horizon when captured
  // and far away when it is not.
  const tip = (b) => {
    const p = draw({ b }).objects.find((o) => o.id === 'photon').pts;
    return Math.hypot(p[p.length - 1].x, p[p.length - 1].y);
  };
  ok('a captured ray is drawn all the way to the horizon', tip(3) < 2.05);
  ok('  and an escaping one is drawn off the far side', tip(9) > 40);
}

console.log('\n=== the universe, against what is measured ===');
{
  const c = COSMO;
  // Every one of these is a published number, not one of ours.
  okNear('the universe is 13.797 billion years old', ageNow(c) / PHYS.year / 1e9, 13.797, 0.002);
  okNear('matter overtakes radiation at z = 3400', equalityZ(c), 3400, 0.01);
  okNear('half the electrons are captured by z = 1380', recombinationZ(c), 1380, 0.02);
  // RECOMBINATION AND LAST SCATTERING ARE NOT THE SAME EVENT, and conflating
  // them is the commonest error in a cosmology timeline. The microwave
  // background comes from the later one.
  okNear('  but the fog only clears at z = 1090', lastScatteringZ(c), 1089.9, 0.01);
  ok('  and that is later, not earlier', lastScatteringZ(c) < recombinationZ(c));
  const als = 1 / (1 + lastScatteringZ(c));
  okNear('  373,000 years after the start', ageAt(c, als) / PHYS.year / 1e3, 373, 0.02);
  okNear('  at 2970 K', temperatureAt(c, als), 2970, 0.01);

  // THE CHECK EVERY TEXTBOOK MAKES: kT ≈ 1 MeV at t ≈ 1 s. It only comes out
  // right because the radiation density carries g_*(T); with g_* held at its
  // present value this read 2.35 MeV.
  let lo = 1e-12, hi = 1e-8;
  for (let i = 0; i < 200; i++) { const m = Math.sqrt(lo * hi); if (ageAt(c, m) < 1) lo = m; else hi = m; }
  okNear('kT is about 1 MeV one second in', kTeV(temperatureAt(c, Math.sqrt(lo * hi))) / 1e6, 0.9, 0.12);
  okNear('g* above the top quark is 106.75', gStar(1.16e13), 106.75, 1e-9);
  okNear('  10.75 between the muon and the electron', gStar(1.16e10), 10.75, 1e-9);
  okNear('  and 3.38 today', gStar(c.T0), 3.38, 1e-9);

  okNear('a quarter of the mass ends as helium', heliumFraction(), 0.245, 0.06);
  ok('expansion accelerates today and decelerated early',
    hubbleAt(c, 1) > 0 && hubbleAt(c, 1e-4) > hubbleAt(c, 1));

  // The sliders have to MOVE these, or it is a timeline rather than a model.
  const heavy = { ...c, omegaM: 0.6, omegaL: 0.4 };
  ok('more matter moves equality earlier', equalityZ(heavy) > equalityZ(c));
  ok('  and changes the age', Math.abs(ageNow(heavy) - ageNow(c)) / ageNow(c) > 0.05);
  ok('  and moves last scattering', Math.abs(lastScatteringZ(heavy) - lastScatteringZ(c)) > 1);

  const eps = epochs(c);
  ok('the epochs run in order', eps.every((e, i) => i === 0 || e.a >= eps[i - 1].a));
  ok('  and the Planck era is marked as not established', eps[0].speculative === true);
  ok('  while nucleosynthesis is not', !eps.find((e) => e.id === 'nuc').speculative);
  ok('quarks are free early and confined later',
    speciesAt(c, 1e-12).some((s) => s.family === 'quark') && !speciesAt(c, 1).some((s) => s.family === 'quark'));
  ok('atoms exist only after the fog clears',
    !speciesAt(c, als * 0.5).some((s) => s.family === 'atom') && speciesAt(c, 1).some((s) => s.family === 'atom'));
}

console.log('\n=== gravity, stepped forward ===');
{
  // THE PROPERTY THAT MAKES IT WATCHABLE. A symplectic integrator's energy
  // error oscillates; Euler's accumulates. Over six thousand steps that is the
  // difference between an orbit and a spiral, and it is asserted rather than
  // trusted.
  for (const which of ['two', 'figure8', 'inner', 'binary', 'cluster']) {
    const p = gravityPreset(which);
    const b0 = recentre(p.bodies);
    const E0 = energy(b0, p.eps);
    const b1 = gravityRun(b0, p.dt, 6000, p.eps);
    const drift = Math.abs((energy(b1, p.eps) - E0) / E0);
    ok(`${which}: energy holds over 6000 steps`, drift < 1e-3, `${(drift * 100).toExponential(2)}%`);
  }

  // A circular orbit is the case with an exact answer, so it is the one the
  // integrator can be marked against: after a full period it must be back.
  const p = gravityPreset('two');
  const b0 = recentre(p.bodies);
  const T = 2 * Math.PI * Math.sqrt(PHYS.AU ** 3 / (PHYS.G * (PHYS.Msun + PHYS.Mearth)));
  const steps = Math.round(T / p.dt);
  const after = gravityRun(b0, T / steps, steps, p.eps);
  const d0 = Math.hypot(b0[1].x - b0[0].x, b0[1].y - b0[0].y);
  const d1 = Math.hypot(after[1].x - after[0].x, after[1].y - after[0].y);
  okNear('one orbit returns to the same radius', d1, d0, 1e-4);
  ok('  and to the same place', Math.hypot(after[1].x - b0[1].x, after[1].y - b0[1].y) < d0 * 0.02);

  // Momentum is conserved exactly by the scheme, not approximately.
  const c0 = barycentre(b0);
  const c1 = barycentre(gravityRun(b0, p.dt, 500, p.eps));
  ok('the system does not push itself', Math.abs(c1.px - c0.px) < Math.abs(c0.m * 1e-6) + 1e-9);
  ok('recentring removes the drift', Math.abs(barycentre(recentre(b0)).px) < 1e-9 * b0[0].m);

  // The figure eight is a real solution and must still be one after a while:
  // all three masses equal, and the configuration bounded.
  const f = gravityPreset('figure8');
  const fb = gravityRun(recentre(f.bodies), f.dt, 9000, f.eps);
  const span = Math.max(...fb.map((b) => Math.hypot(b.x, b.y)));
  ok('the figure eight stays bounded', span < 3 * PHYS.AU, `${(span / PHYS.AU).toFixed(2)} AU`);
  ok('  with its three masses equal', new Set(f.bodies.map((b) => b.m)).size === 1);
}

console.log('\n=== what a disc looks like, and why ===');
{
  const bh = blackHole(1e7 * PHYS.Msun, 0);
  const mdot = eddingtonRate(bh, 0.1);
  ok('the disc is cold at the inner edge, where there is no torque',
    discTemperature(bh, bh.isco, mdot) === 0);
  // The hottest ring is NOT the innermost: the profile peaks at (49/36)·r_in.
  let best = 0, bestR = 0;
  for (let f = 1.001; f < 6; f += 0.002) {
    const T = discTemperature(bh, bh.isco * f, mdot);
    if (T > best) { best = T; bestR = f; }
  }
  okNear('  and peaks at 49/36 of the inner radius', bestR, 49 / 36, 0.01);
  ok('  then falls away outward', discTemperature(bh, bh.isco * 20, mdot) < best);

  // A BIGGER HOLE IS A COOLER DISC. T goes as M^-1/4, which is why an AGN
  // disc peaks in the ultraviolet and a stellar one in X-rays.
  const small = blackHole(10 * PHYS.Msun, 0);
  const tSmall = discTemperature(small, small.isco * 1.36, eddingtonRate(small, 0.1));
  ok('a stellar hole runs far hotter than a supermassive one', tSmall > best * 10);

  // The lopsidedness, which is the whole reason a real image looks the way it
  // does: the approaching side is beamed about an order of magnitude brighter.
  const near = doppler(0.3, 1);
  const far = doppler(0.3, -1);
  ok('the approaching side is brighter', near.boost > far.boost);
  okNear('  by about twelve times at 0.3c', near.boost / far.boost, 11.9, 0.1);
  ok('  and bluer', near.delta > 1 && far.delta < 1);
  // EXACTLY c/2, and the old expectation of c/√6 was the mistake.
  //
  // √(GM/r)/c at r = 6r_g is 1/√6 = 0.408 — the COORDINATE speed, which is the
  // one quantity that must not go into a Doppler factor. What a local observer
  // measures at the Schwarzschild ISCO is v = √(M/(r − 2M)) = c/2 exactly, and
  // the beaming was understated by a fifth at the very radius where all of it
  // happens. The assertion now pins the exact value.
  ok('gas at the ISCO of a still hole moves at exactly c/2, as a local observer measures it',
    Math.abs(orbitalBeta(bh, bh.isco) - 0.5) < 1e-9, `${orbitalBeta(bh, bh.isco)}`);

  // Observed temperature folds in the climb out of the well as well as the
  // motion, so one ring at one emitted temperature is not one colour.
  const a = observedTemperature(bh, bh.isco * 2, mdot, 1).T;
  const b = observedTemperature(bh, bh.isco * 2, mdot, -1).T;
  ok('one ring is two colours, near side and far', a > b * 1.3);
  const rgbHot = blackbodyRGB(20000), rgbCool = blackbodyRGB(2000);
  ok('hot is blue and cool is red', rgbHot[2] > rgbHot[0] && rgbCool[0] > rgbCool[2]);
}

console.log('\n=== the periodic table ===');
{
  ok('all 118 elements are there', ELEMENTS.length === 118);
  ok('  numbered without a gap', ELEMENTS.every((e, i) => e.z === i + 1));
  ok('  each with a colour', ELEMENTS.every((e) => /^#[0-9A-Fa-f]{6}$/.test(e.colour)));
  ok('hydrogen is first and oganesson last', ELEMENTS[0].symbol === 'H' && ELEMENTS[117].symbol === 'Og');
  okNear('carbon weighs 12.011', element(6).mass, 12.011, 1e-9);
  okNear('  iron 55.845', bySymbol('Fe').mass, 55.845, 1e-9);
  ok('lookup ignores case', bySymbol('fe').z === 26 && bySymbol('FE').z === 26);
  ok('an unknown symbol is null, not a guess', bySymbol('Xx') === null && element(0) === null);

  // THE CONVENTION IS THE POINT: a chemist reads these colours.
  ok('oxygen is red', elementColour(8).toUpperCase() === '#FF0D0D');
  ok('nitrogen is blue', elementColour(7).toUpperCase() === '#3050F8');
  ok('sulfur is yellow', elementColour(16).toUpperCase() === '#FFFF30');
  ok('carbon is grey', elementColour('C').toUpperCase() === '#909090');

  // …but white hydrogen on cream paper is invisible, so the paper variant
  // darkens anything too pale — by one rule, not by hand.
  ok('hydrogen darkens for paper', elementColour('H', true) !== '#FFFFFF');
  ok('  and so does helium', elementColour('He', true).toLowerCase() !== '#d9ffff');
  ok('  while oxygen is left alone', darkenForPaper('#FF0D0D').toUpperCase() === '#FF0D0D');
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  ok('nothing survives the paper rule too pale to see',
    ELEMENTS.every((e) => lum(darkenForPaper(e.colour)) <= 0.63));

  // What the Big Bang actually made: hydrogen, a quarter helium, and nothing
  // heavier. Every carbon atom in a reader came later, in a star.
  const mix = primordial(heliumFraction());
  const total = mix.reduce((a, m) => a + m.fraction, 0);
  okNear('the primordial mixture adds to one', total, 1, 1e-6);
  ok('  and is only hydrogen, helium and a trace of lithium',
    mix.every((m) => ['H', 'He', 'Li'].includes(m.symbol)));
  ok('  with helium about a quarter by mass',
    mix.find((m) => m.symbol === 'He').fraction > 0.2);
}

console.log('\n=== a number said two ways ===');
{
  ok('the LaTeX form carries notation', say(29532, 'm') === '29.5\\,\\mathrm{km}');
  // An SVG <text> node is not KaTeX; feeding it the LaTeX printed the
  // backslashes on the screen.
  ok('the plain form carries none', sayText(29532, 'm') === '29.5 km', sayText(29532, 'm'));
  ok('  and still picks the right unit', sayText(5.2 * PHYS.AU, 'm').endsWith('AU'));
  ok('  including kelvin', sayText(6.17e-8, 'K') === '61.7 nK', sayText(6.17e-8, 'K'));
  ok('  and fractions of c', sayText(PHYS.c / 2, 'm/s') === '0.500 c', sayText(PHYS.c / 2, 'm/s'));
  ok('  with no LaTeX escape anywhere in it',
    ['m', 's', 'kg', 'K', 'm/s', 'm/s2', 'W', 'J', 'N'].every((u) => !sayText(1234, u).includes('\\')));
}

console.log('\n=== a readout is plain text, and a simulation is not mathematics ===');
{
  // REPORTED FROM THE RUNNING APP, with a screenshot of both.
  //
  // 1. The panel printed "29.5\\,\\mathrm{km}" with the backslashes showing. A
  //    readout's `tex` goes through KaTeX; its `value` is rendered straight
  //    into a <b>. say() returns LaTeX, so every number in every simulation
  //    leaked its notation onto the screen.
  const scene = (object) =>
    sanitizeViz({ kind: 'simulation', sim: { object }, view: { xMin: -28, xMax: 28 } });
  for (const object of SIM_OBJECTS) {
    const sc = scene(object);
    const f = buildFrame(sc, null, Object.fromEntries(sc.params.map((p) => [p.id, p.value])),
      { xMin: -30, xMax: 30, yMin: -21, yMax: 21 }, false);
    const leaks = f.readouts.filter((r) => r.value && /\\/.test(r.value));
    ok(`${object}: no LaTeX escapes in any readout value`, leaks.length === 0,
      leaks.map((r) => r.value).join(' | '));
    ok(`  ${object}: nor in the caption`, !/\\/.test(f.caption), f.caption);
    // The tex side still carries notation — it is the half that IS typeset.
    ok(`  ${object}: but the tex side still does`, f.readouts.some((r) => /\\|\^|_/.test(r.tex)));
  }

  // 2. "Simulate a black hole" came back labelled MATH. The cause was not the
  //    label: a scene only survived sanitizeMap if the work was called
  //    mathematical, so the extractor had to call a black hole mathematics to
  //    get it drawn at all.
  const asLearning = sanitizeMap({
    context: 'learning',
    nodes: [{ id: 'n1', type: 'concept', label: 'Black hole' }],
    edges: [],
    viz: { kind: 'simulation', sim: { object: 'black-hole' }, view: { xMin: -28, xMax: 28 } },
  });
  ok('a simulation survives without being called mathematics', !!asLearning.viz);
  ok('  and is named for what it is', asLearning.context === 'simulating');
  ok('  which reads "Simulating" on screen', CONTEXT_LABEL[asLearning.context] === 'Simulating');
  ok('  with no maths intent attached to it', asLearning.intent === undefined);

  // Even when the extractor DOES say math, a simulation is still a simulation.
  const asMath = sanitizeMap({
    context: 'math', intent: 'learning', nodes: [], edges: [],
    viz: { kind: 'simulation', sim: { object: 'orbit' }, view: { xMin: -6, xMax: 6 } },
  });
  ok('and it is not mathematics even when it was called that', asMath.context === 'simulating');

  // Nothing else moves: real mathematics keeps its label, its intent and its
  // scene, and a diagram still survives outside maths as it always did.
  const maths = sanitizeMap({
    context: 'math', intent: 'learning', nodes: [], edges: [],
    viz: { kind: 'function', expr: 'x^2', view: { xMin: -6, xMax: 6 } },
  });
  ok('real mathematics is untouched',
    maths.context === 'math' && maths.intent === 'learning' && maths.viz.kind === 'function');
  const diagram = sanitizeMap({
    context: 'learning', nodes: [], edges: [],
    viz: { kind: 'diagram', view: { xMin: -6, xMax: 6 }, parts: [{ o: 'point', x: 0, y: 0 }] },
  });
  ok('  and a diagram still carries its own subject', !!diagram.viz);

  // 3. The disc now carries a MEASURED colour rather than a palette role,
  //    because no role in the palette could stand for a temperature.
  const bhSc = scene('black-hole');
  const bhF = buildFrame(bhSc, null, Object.fromEntries(bhSc.params.map((p) => [p.id, p.value])),
    { xMin: -30, xMax: 30, yMin: -21, yMax: 21 }, false);
  const coloured = bhF.objects.filter((o) => o.color);
  ok('the disc rings carry a computed colour', coloured.length >= 10, `${coloured.length}`);
  ok('  and every one of them is a real CSS colour',
    coloured.every((o) => /^rgba?\(/.test(o.color)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
