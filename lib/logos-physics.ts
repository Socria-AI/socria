// lib/logos-physics.ts
//
// Objects, simulated — with the real arithmetic underneath.
//
// WHAT THIS IS FOR. Every picture Logos draws today comes from an expression
// the model wrote: `diagram` hands the model a set of primitives and it authors
// the coordinates itself. That is right for a titration curve or a free-body
// sketch, and it is wrong the moment somebody asks for a black hole, because
// the interesting content is not the shape — it is that the event horizon of a
// ten-solar-mass hole is 29.5 km across, that its innermost stable orbit sits
// at exactly three Schwarzschild radii, that spinning it up to 0.9 moves that
// orbit inward by a factor of two and raises the accretion efficiency from 5.7%
// to 15.6%. A model writing coordinates cannot give you those. It can only
// write numbers that look like them.
//
// So: the model names the object and sets the starting values. EVERY NUMBER IN
// THE PICTURE AND IN THE READOUTS IS COMPUTED HERE. The same discipline as
// Verify Mode in Core 4 — the value is computed in code, in a separate step,
// rather than produced by something that is only trying to sound right.
//
// WHY PURE, AND SEPARATE FROM THE RENDERER. Physics you can test is physics you
// can trust. Nothing here touches React, the network, the clock or a canvas; it
// takes numbers and returns numbers, so `test/physics.test.mjs` can check the
// Schwarzschild radius of the Sun against the value in the literature, check
// that the Kerr formulae collapse to the Schwarzschild ones at zero spin, and
// check that a photon passing far from the hole bends by 4GM/bc² — which is the
// measurement that made Einstein famous in 1919.
//
// SI THROUGHOUT, INTERNALLY. Every function takes and returns SI base units.
// Solar masses, astronomical units and degrees exist only at the edges: in the
// parameter definitions a person moves, and in `say()`, which chooses the unit a
// human would actually use. A single unit system inside is the difference
// between a library and a pile of conversion bugs.

// ── constants ───────────────────────────────────────────────────────
//
// CODATA 2018 and IAU nominal values. `c` and `k` are exact by definition of
// the metre and the kelvin; the others carry their measured uncertainty, which
// is far below anything visible on a slider.

export const PHYS = {
  /** gravitational constant, m³ kg⁻¹ s⁻² */
  G: 6.6743e-11,
  /** speed of light in vacuum, m/s — exact */
  c: 299792458,
  /** reduced Planck constant, J·s */
  hbar: 1.054571817e-34,
  /** Boltzmann constant, J/K — exact */
  kB: 1.380649e-23,
  /** standard gravity, m/s² — exact by definition */
  g0: 9.80665,
  /** solar mass, kg (IAU nominal) */
  Msun: 1.98847e30,
  /** Earth mass, kg */
  Mearth: 5.9722e24,
  /** solar radius, m (IAU nominal) */
  Rsun: 6.957e8,
  /** astronomical unit, m — exact by definition */
  AU: 1.495978707e11,
  /** Julian year, s — exact */
  year: 31557600,
  /** light year, m */
  ly: 9.4607304725808e15,
  /** parsec, m */
  pc: 3.0856775814913673e16,
  /** density of dry air at 15 °C, sea level, kg/m³ */
  rhoAir: 1.225,
} as const;

/** √27 — the critical impact parameter of a Schwarzschild hole, in r_g. */
export const B_CRIT = Math.sqrt(27);

// ── saying a number the way a person would ──────────────────────────

export type Unit = 'm' | 's' | 'kg' | 'K' | 'm/s' | 'm/s2' | 'W' | 'J' | 'N' | 'rad' | 'none';

interface Step {
  /** how many SI units this one is */
  size: number;
  /**
   * The magnitude at which this step takes over, when that is not its own
   * size. Only `c` needs it: half the speed of light is better said as 0.5 c
   * than as 149,896 km/s, but Earth's orbital speed is not better said as
   * 0.0001 c — so the step is worth a tenth of its own size.
   */
  from?: number;
  /** what to print after the number, as LaTeX */
  tex: string;
}

/**
 * The ladders, largest first.
 *
 * WHY LADDERS AND NOT SI PREFIXES. A black hole's horizon is better said in
 * kilometres than in 29,532 metres, and a supermassive one's is better said in
 * astronomical units than in 10¹⁰ km — but nobody says "decametres", and
 * "39 Gm" is not a length anybody pictures. These are the units the subject's
 * own literature uses, which is the only test that matters for a readout.
 */
const LADDERS: Record<Unit, Step[]> = {
  m: [
    { size: PHYS.pc, tex: '\\,\\mathrm{pc}' },
    { size: PHYS.ly, tex: '\\,\\mathrm{ly}' },
    { size: PHYS.AU, tex: '\\,\\mathrm{AU}' },
    { size: PHYS.Rsun, tex: '\\,R_\\odot' },
    { size: 1e3, tex: '\\,\\mathrm{km}' },
    { size: 1, tex: '\\,\\mathrm{m}' },
    { size: 1e-3, tex: '\\,\\mathrm{mm}' },
    { size: 1e-6, tex: '\\,\\mu\\mathrm{m}' },
    { size: 1e-9, tex: '\\,\\mathrm{nm}' },
  ],
  s: [
    { size: 1e9 * PHYS.year, tex: '\\,\\mathrm{Gyr}' },
    { size: 1e6 * PHYS.year, tex: '\\,\\mathrm{Myr}' },
    { size: PHYS.year, tex: '\\,\\mathrm{yr}' },
    { size: 86400, tex: '\\,\\mathrm{d}' },
    { size: 3600, tex: '\\,\\mathrm{h}' },
    { size: 60, tex: '\\,\\mathrm{min}' },
    { size: 1, tex: '\\,\\mathrm{s}' },
    { size: 1e-3, tex: '\\,\\mathrm{ms}' },
    { size: 1e-6, tex: '\\,\\mu\\mathrm{s}' },
  ],
  kg: [
    { size: PHYS.Msun, tex: '\\,M_\\odot' },
    { size: PHYS.Mearth, tex: '\\,M_\\oplus' },
    { size: 1e3, tex: '\\,\\mathrm{t}' },
    { size: 1, tex: '\\,\\mathrm{kg}' },
    { size: 1e-3, tex: '\\,\\mathrm{g}' },
  ],
  K: [
    { size: 1e9, tex: '\\,\\mathrm{GK}' },
    { size: 1e6, tex: '\\,\\mathrm{MK}' },
    { size: 1e3, tex: '\\,\\mathrm{kK}' },
    { size: 1, tex: '\\,\\mathrm{K}' },
    { size: 1e-6, tex: '\\,\\mu\\mathrm{K}' },
    { size: 1e-9, tex: '\\,\\mathrm{nK}' },
  ],
  'm/s': [
    { size: PHYS.c, from: 0.1 * PHYS.c, tex: '\\,c' },
    { size: 1e3, tex: '\\,\\mathrm{km/s}' },
    { size: 1, tex: '\\,\\mathrm{m/s}' },
  ],
  // ACCELERATION IS NOT SPEED, and the ladder is where that gets confused: a
  // tidal stretch of 1.9 × 10⁸ m/s² came out as "61.9 c" while looking exactly
  // like a number somebody meant. Earth gravity is the unit anybody actually
  // reasons in for this quantity.
  'm/s2': [
    { size: PHYS.g0, tex: '\\,g' },
    { size: 1, tex: '\\,\\mathrm{m/s^2}' },
  ],
  W: [
    { size: 1e12, tex: '\\,\\mathrm{TW}' },
    { size: 1e9, tex: '\\,\\mathrm{GW}' },
    { size: 1e6, tex: '\\,\\mathrm{MW}' },
    { size: 1e3, tex: '\\,\\mathrm{kW}' },
    { size: 1, tex: '\\,\\mathrm{W}' },
  ],
  J: [
    { size: 1e15, tex: '\\,\\mathrm{PJ}' },
    { size: 1e12, tex: '\\,\\mathrm{TJ}' },
    { size: 1e9, tex: '\\,\\mathrm{GJ}' },
    { size: 1e6, tex: '\\,\\mathrm{MJ}' },
    { size: 1e3, tex: '\\,\\mathrm{kJ}' },
    { size: 1, tex: '\\,\\mathrm{J}' },
  ],
  N: [
    { size: 1e9, tex: '\\,\\mathrm{GN}' },
    { size: 1e6, tex: '\\,\\mathrm{MN}' },
    { size: 1e3, tex: '\\,\\mathrm{kN}' },
    { size: 1, tex: '\\,\\mathrm{N}' },
  ],
  rad: [{ size: 1, tex: '\\,\\mathrm{rad}' }],
  none: [{ size: 1, tex: '' }],
};

/** Three significant figures, without an exponent when one is not needed. */
function sig(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const mag = Math.abs(v);
  if (mag >= 1e6 || mag < 1e-4) {
    const exp = Math.floor(Math.log10(mag));
    const mant = v / Math.pow(10, exp);
    return `${mant.toFixed(digits - 1)}\\times 10^{${exp}}`;
  }
  const dp = Math.max(0, digits - 1 - Math.floor(Math.log10(mag)));
  // Only a trailing ".000" goes, never a significant zero: stripping /\.?0+$/
  // turned √27 = 5.196 into "5.2", which is two significant figures wearing the
  // costume of three. "10.0" is still written 10, because the zeros there carry
  // nothing a reader wants.
  return v.toFixed(Math.min(6, dp)).replace(/\.0+$/, '');
}

/**
 * An SI number as a person would say it: the right unit off the ladder, three
 * significant figures, as LaTeX ready for a readout.
 *
 * Deliberately not clever about zero or about negatives — a negative energy is
 * a real and important quantity in orbital mechanics, and printing it as such
 * is the point.
 */
export function say(value: number, unit: Unit, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  const ladder = LADDERS[unit];
  const mag = Math.abs(value);
  const step = ladder.find((s) => mag >= (s.from ?? s.size)) ?? ladder[ladder.length - 1];
  return `${sig(value / step.size, digits)}${step.tex}`;
}

/** A plain ratio or count, with no unit attached. */
export function ratio(value: number, digits = 3): string {
  return sig(value, digits);
}

/** A fraction as a percentage, for efficiencies. */
export function percent(value: number, digits = 3): string {
  return `${sig(value * 100, digits)}\\%`;
}

// ════════════════════════════════════════════════════════════════════
// BLACK HOLE — Schwarzschild and Kerr
// ════════════════════════════════════════════════════════════════════
//
// Everything is written in terms of the GRAVITATIONAL RADIUS r_g = GM/c²,
// because that is how the literature writes it and because it makes the
// Schwarzschild results memorable: the horizon is at 2 r_g, the photon sphere
// at 3, the innermost stable circular orbit at 6, the shadow at √27 ≈ 5.196.
// Multiplying out to metres happens once, at the end.
//
// Spin is the dimensionless a★ = Jc/GM², which runs 0 to 1. Real holes are
// thought not to exceed ≈0.998 (the Thorne limit — radiation captured from the
// disk carries a spin-down torque that stops it), so the slider stops there.

export interface BlackHole {
  /** mass, kg */
  M: number;
  /** dimensionless spin a★ = Jc/GM², 0 … 0.998 */
  spin: number;
  /** gravitational radius GM/c², m */
  rg: number;
  /** Schwarzschild radius 2GM/c², m — the horizon when the hole is not spinning */
  rs: number;
  /** outer event horizon, m. Kerr: r_g(1 + √(1−a★²)); equals r_s at a★ = 0 */
  horizon: number;
  /** inner (Cauchy) horizon, m. Zero when a★ = 0 */
  innerHorizon: number;
  /** the ergosphere at the equator, m — always 2 r_g, independent of spin */
  ergosphere: number;
  /** prograde circular photon orbit, m. 3 r_g at a★ = 0, r_g at a★ = 1 */
  photonSphere: number;
  /** retrograde circular photon orbit, m. 4 r_g at a★ = 1 */
  photonSphereRetro: number;
  /** innermost stable circular orbit, prograde, m. 6 r_g at a★ = 0 */
  isco: number;
  /** what an accretion disk can convert to light, as a fraction of mc² */
  efficiency: number;
  /** apparent radius of the shadow to a distant observer, m — √27 r_g, non-spinning */
  shadow: number;
  /** Hawking temperature, K */
  hawkingT: number;
  /** total power radiated as Hawking radiation, W */
  hawkingPower: number;
  /** time to evaporate completely, s */
  evaporation: number;
  /** surface gravity at the horizon, m/s² (Schwarzschild κ = c⁴/4GM) */
  surfaceGravity: number;
  /** area of the outer horizon, m² */
  area: number;
  /** Bekenstein–Hawking entropy, in units of k_B */
  entropy: number;
}

/** A spin clamped to the physical range, with the Thorne limit at the top. */
export function clampSpin(a: number): number {
  return Math.min(0.998, Math.max(0, Number.isFinite(a) ? a : 0));
}

/**
 * Everything a Kerr hole of this mass and spin determines.
 *
 * The Kerr expressions below reduce to the Schwarzschild ones at a★ = 0, which
 * is asserted in the tests rather than assumed — it is the cheapest possible
 * check that the algebra was transcribed correctly, and it catches sign errors
 * in the ISCO root immediately.
 */
export function blackHole(massKg: number, spinIn = 0): BlackHole {
  const M = Math.max(1e-30, massKg);
  const a = clampSpin(spinIn);
  const rg = (PHYS.G * M) / (PHYS.c * PHYS.c);
  const rs = 2 * rg;

  // Horizons: the two roots of Δ = r² − 2r + a² (in r_g). They merge at a★ = 1.
  const root = Math.sqrt(Math.max(0, 1 - a * a));
  const horizon = rg * (1 + root);
  const innerHorizon = rg * (1 - root);

  // Circular photon orbits in the equatorial plane. The prograde one moves in
  // to r_g as the hole spins up; the retrograde one moves out to 4 r_g.
  const photon = (sign: 1 | -1) => 2 * rg * (1 + Math.cos((2 / 3) * Math.acos(sign * a)));
  const photonSphere = photon(-1);
  const photonSphereRetro = photon(1);

  // Bardeen–Press–Teukolsky. Z1 and Z2 have no separate meaning; they are the
  // two intermediate groupings the closed form is written with.
  const Z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const Z2 = Math.sqrt(3 * a * a + Z1 * Z1);
  const iscoR = 3 + Z2 - Math.sqrt(Math.max(0, (3 - Z1) * (3 + Z1 + 2 * Z2)));
  const isco = rg * iscoR;

  // The binding energy at the ISCO is what a disk can radiate away before the
  // gas falls in: 5.7% of mc² for a still hole, ~32% at the Thorne limit. For
  // comparison, hydrogen fusion releases 0.7%.
  const efficiency = 1 - iscoEnergy(iscoR, a);

  // What you would actually SEE. Not the horizon: light passing within √27 r_g
  // is captured, so the dark disk on the sky is 2.6 Schwarzschild radii across,
  // not 1. (Held at the non-spinning value — a spinning hole's shadow is not a
  // circle, and quoting one radius for it would be the kind of number that
  // looks right and is not.)
  const shadow = B_CRIT * rg;

  const hawkingT = (PHYS.hbar * PHYS.c ** 3) / (8 * Math.PI * PHYS.G * M * PHYS.kB);
  // Page's coefficient for a hole radiating photons and gravitons only.
  const hawkingPower = (PHYS.hbar * PHYS.c ** 6) / (15360 * Math.PI * PHYS.G ** 2 * M ** 2);
  const evaporation = (5120 * Math.PI * PHYS.G ** 2 * M ** 3) / (PHYS.hbar * PHYS.c ** 4);
  const surfaceGravity = PHYS.c ** 4 / (4 * PHYS.G * M);

  // Kerr horizon area: 8π r_g r_+ (which is 16π r_g² for Schwarzschild).
  const area = 8 * Math.PI * rg * horizon;
  const entropy = (PHYS.kB * area * PHYS.c ** 3) / (4 * PHYS.G * PHYS.hbar * PHYS.kB);

  return {
    M, spin: a, rg, rs, horizon, innerHorizon,
    ergosphere: 2 * rg,
    photonSphere, photonSphereRetro, isco, efficiency, shadow,
    hawkingT, hawkingPower, evaporation, surfaceGravity, area, entropy,
  };
}

/**
 * Specific energy of a prograde circular orbit at radius r (in r_g).
 *
 * E = (r² − 2r + a√r) / (r √(r² − 3r + 2a√r)). At r = 6, a = 0 this is √(8/9),
 * so the binding energy is 1 − 0.9428 = 5.72% — the number every account of
 * accretion quotes, and the tests pin it.
 */
export function iscoEnergy(r: number, a: number): number {
  const s = Math.sqrt(r);
  const denom = r * Math.sqrt(Math.max(1e-12, r * r - 3 * r + 2 * a * s));
  return (r * r - 2 * r + a * s) / denom;
}

/**
 * The ergosphere's outer edge at colatitude θ, in metres.
 *
 * r_E(θ) = r_g(1 + √(1 − a★²cos²θ)): it touches the horizon at the poles and
 * bulges out to 2 r_g at the equator, which is why the region exists at all —
 * between the two surfaces nothing can stay still, however hard it thrusts.
 */
export function ergosphereAt(bh: BlackHole, theta: number): number {
  const ct = Math.cos(theta);
  return bh.rg * (1 + Math.sqrt(Math.max(0, 1 - bh.spin * bh.spin * ct * ct)));
}

/**
 * Coordinate orbital period of a circular orbit at radius r.
 *
 * T = 2π√(r³/GM), exactly Kepler's third law — which is true in Schwarzschild
 * coordinates as well as in Newton's theory, and is one of the few places
 * general relativity leaves an elementary result alone.
 */
export function orbitPeriod(bh: BlackHole, r: number): number {
  return 2 * Math.PI * Math.sqrt(r ** 3 / (PHYS.G * bh.M));
}

/**
 * Gravitational redshift of light emitted at r and received far away.
 *
 * 1 + z = 1/√(1 − r_s/r). Returns Infinity at the horizon, which is not a bug
 * to smooth over: it is the statement that the horizon is where light can no
 * longer get out, and a readout that says ∞ there is telling the truth.
 */
export function redshift(bh: BlackHole, r: number): number {
  const x = 1 - bh.rs / r;
  if (x <= 0) return Infinity;
  return 1 / Math.sqrt(x) - 1;
}

/** Tidal stretch across a body of height h, in m/s². Δa = 2GMh/r³. */
export function tidal(bh: BlackHole, r: number, h: number): number {
  return (2 * PHYS.G * bh.M * h) / r ** 3;
}

/** Einstein's weak-field deflection: α = 4GM/bc², valid when b ≫ r_g. */
export function deflectionWeak(bh: BlackHole, b: number): number {
  return (4 * PHYS.G * bh.M) / (PHYS.c * PHYS.c * b);
}

export interface PhotonPath {
  /** the impact parameter it was fired with, in r_g */
  b: number;
  /** true when it crossed the horizon instead of escaping */
  captured: boolean;
  /** how far it was bent, in radians — 0 when captured */
  deflection: number;
  /** closest approach, in r_g; Infinity if it never turned */
  periapsis: number;
  /** the path itself, in r_g, as (x, y) with the hole at the origin */
  points: { x: number; y: number }[];
}

/**
 * A photon's actual path past the hole, by integrating the null geodesic.
 *
 * THE EQUATION. With u = r_g/r and φ the azimuth, a light ray in Schwarzschild
 * spacetime obeys
 *
 *     d²u/dφ² + u = 3u²
 *
 * — Newton's straight line is the same equation without the 3u² on the right,
 * so the entire bending of light is that one term. RK4 on the pair (u, u′),
 * stepping in φ from far away until the ray either crosses the horizon (u ≥ ½)
 * or gets back out to where it started.
 *
 * WHY NOT THE FORMULA. There is a closed form in elliptic integrals, and it is
 * both slower to evaluate and useless for drawing: what the picture needs is
 * the path, not the endpoint. Integrating gives both, and the deflection it
 * reports can be checked against 4GM/bc² in the weak field — which the tests do,
 * because an integrator that silently loses accuracy is worse than no
 * integrator at all.
 *
 * `b` is the impact parameter in units of r_g. Below √27 ≈ 5.196 the photon is
 * captured; just above it, the ray loops the hole one or more times before
 * escaping, which is what produces the photon ring in a real image.
 */
export function photonPath(b: number, opts?: { steps?: number; maxTurn?: number }): PhotonPath {
  const steps = opts?.steps ?? 3000;
  const maxTurn = opts?.maxTurn ?? 8 * Math.PI;
  const dphi = maxTurn / steps;
  // Far enough out that the 3u² term is negligible there, and always outside
  // the ray's own turning point — a fixed 40 r_g cannot integrate a ray whose
  // closest approach is 50.
  const start = Math.max(40, 6 * Math.abs(b));
  let u = 1 / start;
  // (du/dφ)² = 1/b² − u²(1 − 2u), taken POSITIVE: u is 1/r, so a ray heading
  // inward has r falling and therefore u rising. Starting it negative sends the
  // photon straight back out along the way it came, and every ray then reports
  // a deflection of zero — which looks like a physics result and is a sign.
  const rad = 1 / (b * b) - u * u * (1 - 2 * u);
  if (rad <= 0) {
    // Fired from outside its own turning point: it is already receding.
    return { b, captured: false, deflection: 0, periapsis: start, points: [] };
  }
  let up = Math.sqrt(rad);

  const d2u = (uu: number) => 3 * uu * uu - uu;
  const pts: { x: number; y: number }[] = [];
  let phi = 0;
  let periapsis = start;
  let captured = false;
  let rEnd = start;

  for (let i = 0; i < steps; i++) {
    const r = 1 / u;
    rEnd = r;
    if (r < periapsis) periapsis = r;
    pts.push({ x: r * Math.cos(phi), y: r * Math.sin(phi) });

    // Crossing the horizon ends the ray. 2 r_g in these units is u = 0.5.
    if (u >= 0.5) { captured = true; break; }
    // Past the turning point and climbing away again (u falling): once it is
    // back out beyond where it started, the rest of the ray is a straight line
    // off the edge of the picture.
    if (r > start && up < 0) break;

    // RK4 on (u, u′).
    const k1u = up,                 k1p = d2u(u);
    const k2u = up + (dphi / 2) * k1p, k2p = d2u(u + (dphi / 2) * k1u);
    const k3u = up + (dphi / 2) * k2p, k3p = d2u(u + (dphi / 2) * k2u);
    const k4u = up + dphi * k3p,       k4p = d2u(u + dphi * k3u);
    u += (dphi / 6) * (k1u + 2 * k2u + 2 * k3u + k4u);
    up += (dphi / 6) * (k1p + 2 * k2p + 2 * k3p + k4p);
    phi += dphi;
    if (!Number.isFinite(u) || u <= 0) break;
  }

  // THE BEND IS MEASURED AGAINST THE ASYMPTOTES, NOT AGAINST π.
  //
  // π is the angle a straight line sweeps between its ends at INFINITY. This
  // integration runs between two finite radii, where a straight line sweeps
  // 2·arccos(b/r) instead — so comparing against π reported every weak-field
  // ray as bending by nothing at all, which is a plausible-looking wrong
  // answer and the worst kind. arcsin(b/r) at each end is the piece of the
  // asymptote outside the integrated arc; adding both back recovers the true
  // deflection, and the result then stops depending on where the ray started,
  // which is the check that it is right.
  const tail = (r: number) => Math.asin(Math.min(1, b / r));
  const deflection = captured ? 0 : Math.max(0, phi + tail(start) + tail(rEnd) - Math.PI);
  return { b, captured, deflection, periapsis, points: pts };
}

// ════════════════════════════════════════════════════════════════════
// TWO BODIES — Kepler and vis-viva
// ════════════════════════════════════════════════════════════════════

export interface Orbit {
  /** total mass, kg */
  M: number;
  /** standard gravitational parameter G(m₁+m₂), m³/s² */
  mu: number;
  /** semi-major axis, m */
  a: number;
  /** eccentricity, 0 … <1 */
  e: number;
  /** orbital period, s */
  period: number;
  /** closest approach, m */
  periapsis: number;
  /** furthest, m */
  apoapsis: number;
  /** speed at periapsis, m/s */
  vPeri: number;
  /** speed at apoapsis, m/s */
  vApo: number;
  /** mean orbital speed, m/s */
  vMean: number;
  /** specific orbital energy, J/kg — negative for a bound orbit */
  energy: number;
  /** specific angular momentum, m²/s */
  angularMomentum: number;
  /** how far the smaller body's own orbit is from the barycentre, m */
  r1: number;
  r2: number;
  /** escape speed at periapsis, m/s */
  vEscape: number;
}

/** A bound two-body orbit, from the two masses and the ellipse. */
export function orbit(m1: number, m2: number, aMetres: number, eIn: number): Orbit {
  const e = Math.min(0.995, Math.max(0, Number.isFinite(eIn) ? eIn : 0));
  const a = Math.max(1, aMetres);
  const M = Math.max(1e-30, m1) + Math.max(0, m2);
  const mu = PHYS.G * M;
  const period = 2 * Math.PI * Math.sqrt(a ** 3 / mu);
  const periapsis = a * (1 - e);
  const apoapsis = a * (1 + e);
  // Vis-viva at each end: v² = μ(2/r − 1/a).
  const vPeri = Math.sqrt(mu * (2 / periapsis - 1 / a));
  const vApo = Math.sqrt(mu * (2 / apoapsis - 1 / a));
  return {
    M, mu, a, e, period, periapsis, apoapsis, vPeri, vApo,
    vMean: (2 * Math.PI * a) / period,
    energy: -mu / (2 * a),
    angularMomentum: Math.sqrt(mu * a * (1 - e * e)),
    r1: (a * Math.max(0, m2)) / M,
    r2: (a * Math.max(1e-30, m1)) / M,
    vEscape: Math.sqrt((2 * mu) / periapsis),
  };
}

/** Speed anywhere on the orbit, from vis-viva. */
export function speedAt(o: Orbit, r: number): number {
  return Math.sqrt(Math.max(0, o.mu * (2 / r - 1 / o.a)));
}

/**
 * Kepler's equation, solved.
 *
 * M = E − e·sin E has no closed-form inverse, and it is the reason planets are
 * hard: the position at a given TIME is a different question from the position
 * at a given ANGLE, and only the second one is easy. Newton–Raphson converges
 * in a handful of iterations everywhere except very near e = 1.
 *
 * This is what lets the animation move the body at its real speed — fast
 * through periapsis, slow at the far end — instead of at a constant rate around
 * the ellipse, which is the thing Kepler's second law says does not happen.
 */
export function eccentricAnomaly(meanAnomaly: number, e: number): number {
  const M = meanAnomaly;
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 40; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    const d = f / fp;
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/** Where the body is at a fraction `t` of one period, in metres from the focus. */
export function positionAt(o: Orbit, t: number): { x: number; y: number; r: number; v: number } {
  const M = 2 * Math.PI * (t - Math.floor(t));
  const E = eccentricAnomaly(M, o.e);
  const x = o.a * (Math.cos(E) - o.e);
  const y = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
  const r = Math.hypot(x, y);
  return { x, y, r, v: speedAt(o, r) };
}

// ════════════════════════════════════════════════════════════════════
// A DAMPED, DRIVEN OSCILLATOR
// ════════════════════════════════════════════════════════════════════

export interface Oscillator {
  /** undamped natural frequency, rad/s */
  w0: number;
  /** damping ratio: <1 under-damped, 1 critical, >1 over-damped */
  zeta: number;
  /** damped frequency, rad/s — zero when not under-damped */
  wd: number;
  /** quality factor 1/2ζ */
  Q: number;
  /** steady-state amplitude at the drive frequency, m */
  amplitude: number;
  /** how far the response lags the drive, rad */
  phase: number;
  /** the drive frequency that maximises amplitude, rad/s */
  wResonance: number;
  /** amplitude at that frequency, m */
  peak: number;
  /** amplitude ratio to the static deflection F₀/k */
  gain: number;
  /** e-folding time of the transient, s */
  tau: number;
  /** static deflection under a steady F₀, m */
  staticDeflection: number;
}

export interface OscInput {
  /** mass, kg */
  m: number;
  /** spring constant, N/m */
  k: number;
  /** viscous damping coefficient, N·s/m */
  c: number;
  /** drive amplitude, N */
  F: number;
  /** drive frequency, rad/s */
  w: number;
}

export function oscillator(i: OscInput): Oscillator {
  const m = Math.max(1e-9, i.m);
  const k = Math.max(1e-9, i.k);
  const c = Math.max(0, i.c);
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(m * k));
  const wd = zeta < 1 ? w0 * Math.sqrt(1 - zeta * zeta) : 0;
  const w = Math.max(0, i.w);

  // |H(ω)| = (F/m) / √((ω₀²−ω²)² + (2ζω₀ω)²)
  const den = Math.sqrt((w0 * w0 - w * w) ** 2 + (2 * zeta * w0 * w) ** 2);
  const amplitude = den > 0 ? i.F / m / den : Infinity;
  const phase = Math.atan2(2 * zeta * w0 * w, w0 * w0 - w * w);

  // Resonance sits BELOW ω₀, and vanishes above ζ = 1/√2 — a distinction that
  // the textbook phrase "resonance at the natural frequency" quietly loses.
  const canResonate = zeta < Math.SQRT1_2;
  const wResonance = canResonate ? w0 * Math.sqrt(1 - 2 * zeta * zeta) : 0;
  const peak = canResonate
    ? i.F / m / (2 * zeta * w0 * w0 * Math.sqrt(1 - zeta * zeta))
    : i.F / k;

  return {
    w0, zeta, wd,
    Q: zeta > 0 ? 1 / (2 * zeta) : Infinity,
    amplitude, phase, wResonance, peak,
    gain: amplitude / (i.F / k),
    tau: zeta > 0 ? 1 / (zeta * w0) : Infinity,
    staticDeflection: i.F / k,
  };
}

/**
 * Displacement at time t, transient included, released from rest at the origin.
 *
 * The exact solution, not a numerical one: the particular part is the
 * steady-state cosine, and the homogeneous part is fixed by x(0) = 0 and
 * ẋ(0) = 0. Showing the transient matters — the first few cycles of a driven
 * system look nothing like the steady state everybody plots, and the beat
 * between the two near resonance is the whole phenomenon.
 */
export function oscillatorAt(i: OscInput, o: Oscillator, t: number): number {
  const ss = o.amplitude * Math.cos(i.w * t - o.phase);
  const ss0 = o.amplitude * Math.cos(-o.phase);
  const ssv = i.w * o.amplitude * Math.sin(-o.phase);
  const s = o.zeta * o.w0;
  if (o.zeta < 1 && o.wd > 0) {
    const A = -ss0;
    const B = (-ssv - A * -s) / o.wd;
    return ss + Math.exp(-s * t) * (A * Math.cos(o.wd * t) + B * Math.sin(o.wd * t));
  }
  if (Math.abs(o.zeta - 1) < 1e-9) {
    const A = -ss0;
    const B = -ssv + s * A;
    return ss + Math.exp(-s * t) * (A + B * t);
  }
  const rt = o.w0 * Math.sqrt(o.zeta * o.zeta - 1);
  const r1 = -s + rt;
  const r2 = -s - rt;
  const A = (-ssv + r2 * -ss0) / (r2 - r1);
  const B = -ss0 - A;
  return ss + A * Math.exp(r1 * t) + B * Math.exp(r2 * t);
}

// ════════════════════════════════════════════════════════════════════
// A PROJECTILE, WITH THE AIR IN THE WAY
// ════════════════════════════════════════════════════════════════════

export interface ProjectileInput {
  /** launch speed, m/s */
  v0: number;
  /** launch angle above the horizontal, degrees */
  angle: number;
  /** mass, kg */
  mass: number;
  /** diameter, m */
  diameter: number;
  /** drag coefficient — 0.47 for a sphere, 0 for the vacuum case */
  cd: number;
  /** air density, kg/m³ */
  rho?: number;
  /** gravity, m/s² */
  g?: number;
}

export interface Projectile {
  /** the path, in metres */
  points: { x: number; y: number }[];
  /** horizontal distance to landing, m */
  range: number;
  /** greatest height, m */
  apex: number;
  /** horizontal distance at which the apex occurs, m */
  apexAt: number;
  /** time of flight, s */
  duration: number;
  /** speed at impact, m/s */
  impactSpeed: number;
  /** angle below the horizontal at impact, degrees */
  impactAngle: number;
  /** terminal velocity for this body, m/s */
  terminal: number;
  /** range the same launch would have in vacuum, m */
  vacuumRange: number;
  /** apex the same launch would have in vacuum, m */
  vacuumApex: number;
  /** the vacuum parabola, for comparison */
  vacuum: { x: number; y: number }[];
}

/**
 * Quadratic drag, integrated. There is no closed form, and that is the point.
 *
 * The vacuum parabola is the first thing anybody learns and is wrong by a
 * factor of two for a real cannonball — a 45° launch is not the best angle once
 * air is in the way, and the trajectory is visibly asymmetric, steeper coming
 * down than going up. Both facts fall straight out of integrating
 *
 *     dv/dt = −g ĵ − k|v|v,      k = ½ρC_dA/m
 *
 * and neither survives the textbook treatment. The vacuum curve is returned
 * alongside so the difference is the picture rather than a claim about it.
 */
export function projectile(i: ProjectileInput): Projectile {
  const g = i.g ?? PHYS.g0;
  const rho = i.rho ?? PHYS.rhoAir;
  const A = Math.PI * (Math.max(1e-6, i.diameter) / 2) ** 2;
  const k = (0.5 * rho * Math.max(0, i.cd) * A) / Math.max(1e-9, i.mass);
  const th = (i.angle * Math.PI) / 180;

  let x = 0, y = 0;
  let vx = i.v0 * Math.cos(th);
  let vy = i.v0 * Math.sin(th);
  const pts: { x: number; y: number }[] = [{ x: 0, y: 0 }];

  // A fixed small step rather than an adaptive one: the flight is seconds long,
  // 4000 steps is far inside the error budget of a picture, and a deterministic
  // step count keeps the frame reproducible — which everything else here is.
  const dt = 0.002;
  const accel = (ux: number, uy: number) => {
    const s = Math.hypot(ux, uy);
    return { ax: -k * s * ux, ay: -g - k * s * uy };
  };

  let t = 0;
  let apex = 0;
  let apexAt = 0;
  for (let n = 0; n < 60000; n++) {
    const a1 = accel(vx, vy);
    const a2 = accel(vx + (dt / 2) * a1.ax, vy + (dt / 2) * a1.ay);
    const a3 = accel(vx + (dt / 2) * a2.ax, vy + (dt / 2) * a2.ay);
    const a4 = accel(vx + dt * a3.ax, vy + dt * a3.ay);
    const nvx = vx + (dt / 6) * (a1.ax + 2 * a2.ax + 2 * a3.ax + a4.ax);
    const nvy = vy + (dt / 6) * (a1.ay + 2 * a2.ay + 2 * a3.ay + a4.ay);
    const nx = x + ((vx + nvx) / 2) * dt;
    const ny = y + ((vy + nvy) / 2) * dt;

    if (ny < 0 && y >= 0) {
      // Land exactly on the ground by interpolating the last step.
      const f = y / (y - ny);
      x += (nx - x) * f;
      t += dt * f;
      vx += (nvx - vx) * f;
      vy += (nvy - vy) * f;
      pts.push({ x, y: 0 });
      y = 0;
      break;
    }
    x = nx; y = ny; vx = nvx; vy = nvy; t += dt;
    if (y > apex) { apex = y; apexAt = x; }
    if (n % 5 === 0) pts.push({ x, y });
  }

  const vacT = (2 * i.v0 * Math.sin(th)) / g;
  const vacuum: { x: number; y: number }[] = [];
  for (let n = 0; n <= 120; n++) {
    const tt = (vacT * n) / 120;
    vacuum.push({ x: i.v0 * Math.cos(th) * tt, y: i.v0 * Math.sin(th) * tt - 0.5 * g * tt * tt });
  }

  return {
    points: pts,
    range: x,
    apex,
    apexAt,
    duration: t,
    impactSpeed: Math.hypot(vx, vy),
    impactAngle: (Math.atan2(-vy, vx) * 180) / Math.PI,
    terminal: k > 0 ? Math.sqrt(g / k) : Infinity,
    vacuumRange: (i.v0 * i.v0 * Math.sin(2 * th)) / g,
    vacuumApex: (i.v0 * Math.sin(th)) ** 2 / (2 * g),
    vacuum,
  };
}
