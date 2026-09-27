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
  /** the same unit as plain text, for anywhere that is not rendering LaTeX */
  txt: string;
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
    { size: PHYS.pc, tex: '\\,\\mathrm{pc}', txt: 'pc' },
    { size: PHYS.ly, tex: '\\,\\mathrm{ly}', txt: 'ly' },
    { size: PHYS.AU, tex: '\\,\\mathrm{AU}', txt: 'AU' },
    { size: PHYS.Rsun, tex: '\\,R_\\odot', txt: 'R☉' },
    { size: 1e3, tex: '\\,\\mathrm{km}', txt: 'km' },
    { size: 1, tex: '\\,\\mathrm{m}', txt: 'm' },
    { size: 1e-3, tex: '\\,\\mathrm{mm}', txt: 'mm' },
    { size: 1e-6, tex: '\\,\\mu\\mathrm{m}', txt: 'µm' },
    { size: 1e-9, tex: '\\,\\mathrm{nm}', txt: 'nm' },
  ],
  s: [
    { size: 1e9 * PHYS.year, tex: '\\,\\mathrm{Gyr}', txt: 'Gyr' },
    { size: 1e6 * PHYS.year, tex: '\\,\\mathrm{Myr}', txt: 'Myr' },
    { size: PHYS.year, tex: '\\,\\mathrm{yr}', txt: 'yr' },
    { size: 86400, tex: '\\,\\mathrm{d}', txt: 'd' },
    { size: 3600, tex: '\\,\\mathrm{h}', txt: 'h' },
    { size: 60, tex: '\\,\\mathrm{min}', txt: 'min' },
    { size: 1, tex: '\\,\\mathrm{s}', txt: 's' },
    { size: 1e-3, tex: '\\,\\mathrm{ms}', txt: 'ms' },
    { size: 1e-6, tex: '\\,\\mu\\mathrm{s}', txt: 'µs' },
  ],
  kg: [
    { size: PHYS.Msun, tex: '\\,M_\\odot', txt: 'M☉' },
    { size: PHYS.Mearth, tex: '\\,M_\\oplus', txt: 'M⊕' },
    { size: 1e3, tex: '\\,\\mathrm{t}', txt: 't' },
    { size: 1, tex: '\\,\\mathrm{kg}', txt: 'kg' },
    { size: 1e-3, tex: '\\,g', txt: 'g' },
  ],
  K: [
    { size: 1e9, tex: '\\,\\mathrm{GK}', txt: 'GK' },
    { size: 1e6, tex: '\\,\\mathrm{MK}', txt: 'MK' },
    { size: 1e3, tex: '\\,\\mathrm{kK}', txt: 'kK' },
    { size: 1, tex: '\\,\\mathrm{K}', txt: 'K' },
    { size: 1e-6, tex: '\\,\\mu\\mathrm{K}', txt: 'µK' },
    { size: 1e-9, tex: '\\,\\mathrm{nK}', txt: 'nK' },
  ],
  'm/s': [
    { size: PHYS.c, from: 0.1 * PHYS.c, tex: '\\,c', txt: 'c' },
    { size: 1e3, tex: '\\,\\mathrm{km/s}', txt: 'km/s' },
    { size: 1, tex: '\\,\\mathrm{m/s}', txt: 'm/s' },
  ],
  // ACCELERATION IS NOT SPEED, and the ladder is where that gets confused: a
  // tidal stretch of 1.9 × 10⁸ m/s² came out as "61.9 c" while looking exactly
  // like a number somebody meant. Earth gravity is the unit anybody actually
  // reasons in for this quantity.
  'm/s2': [
    { size: PHYS.g0, tex: '\\,g', txt: 'g' },
    { size: 1, tex: '\\,\\mathrm{m/s^2}', txt: 'm/s^2' },
  ],
  W: [
    { size: 1e12, tex: '\\,\\mathrm{TW}', txt: 'TW' },
    { size: 1e9, tex: '\\,\\mathrm{GW}', txt: 'GW' },
    { size: 1e6, tex: '\\,\\mathrm{MW}', txt: 'MW' },
    { size: 1e3, tex: '\\,\\mathrm{kW}', txt: 'kW' },
    { size: 1, tex: '\\,\\mathrm{W}', txt: 'W' },
  ],
  J: [
    { size: 1e15, tex: '\\,\\mathrm{PJ}', txt: 'PJ' },
    { size: 1e12, tex: '\\,\\mathrm{TJ}', txt: 'TJ' },
    { size: 1e9, tex: '\\,\\mathrm{GJ}', txt: 'GJ' },
    { size: 1e6, tex: '\\,\\mathrm{MJ}', txt: 'MJ' },
    { size: 1e3, tex: '\\,\\mathrm{kJ}', txt: 'kJ' },
    { size: 1, tex: '\\,\\mathrm{J}', txt: 'J' },
  ],
  N: [
    { size: 1e9, tex: '\\,\\mathrm{GN}', txt: 'GN' },
    { size: 1e6, tex: '\\,\\mathrm{MN}', txt: 'MN' },
    { size: 1e3, tex: '\\,\\mathrm{kN}', txt: 'kN' },
    { size: 1, tex: '\\,\\mathrm{N}', txt: 'N' },
  ],
  rad: [{ size: 1, tex: '\\,\\mathrm{rad}', txt: 'rad' }],
  none: [{ size: 1, tex: '', txt: '' }],
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
  const { n, step } = pick(value, unit);
  return `${sig(n, digits)}${step.tex}`;
}

function pick(value: number, unit: Unit) {
  const ladder = LADDERS[unit];
  const mag = Math.abs(value);
  const step = ladder.find((s) => mag >= (s.from ?? s.size)) ?? ladder[ladder.length - 1];
  return { n: value / step.size, step };
}

/**
 * The same number, as PLAIN TEXT rather than LaTeX.
 *
 * `say` renders for a KaTeX readout. An SVG <text> node is not KaTeX, and
 * feeding it the LaTeX put "157\\,\\mathrm{kK}" on the screen, backslashes and
 * all — a unit system leaking its notation into a picture. Same ladder, same
 * significant figures, a suffix a person can read.
 */
export function sayText(value: number, unit: Unit, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  const { n, step } = pick(value, unit);
  const body = sig(n, digits).replace(/\\times 10\^\{(-?\d+)\}/, '×10^$1');
  return `${body}${step.txt ? ' ' + step.txt : ''}`;
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

// ════════════════════════════════════════════════════════════════════
// WHAT AN ACCRETION DISC LOOKS LIKE, AND WHY
// ════════════════════════════════════════════════════════════════════
//
// The disc is the part of a black hole picture people actually recognise, and
// almost every drawing of one gets its colour from taste. It does not come
// from taste. A thin disc radiates as a blackbody whose temperature follows
// from the mass falling through it (Shakura–Sunyaev), which makes the inner
// edge blue-white and the outer edge red — and then the near side, coming
// toward you at a good fraction of c, is beamed brighter and blued further
// while the far side is dimmed and reddened. That asymmetry is the single
// most recognisable feature of a real image of one, and it is arithmetic.

/**
 * Effective temperature of a thin disc at radius r, in kelvin.
 *
 * T(r) = [ 3GMṀ / (8πσr³) · (1 − √(r_in/r)) ]^¼ — the standard thin-disc
 * profile. The bracket goes to zero at the inner edge, because there is no
 * torque there to dissipate: the disc's hottest ring is not its innermost one
 * but sits a little outside it, at r = (49/36)·r_in, which is a detail worth
 * keeping because it is visible.
 */
export function discTemperature(bh: BlackHole, r: number, mdot: number): number {
  if (r <= bh.isco) return 0;
  const sigma = 5.670374419e-8;
  const br = 1 - Math.sqrt(bh.isco / r);
  const t4 = ((3 * PHYS.G * bh.M * mdot) / (8 * Math.PI * sigma * r ** 3)) * br;
  return t4 > 0 ? Math.pow(t4, 0.25) : 0;
}

/** Accretion rate, in kg/s, that radiates a given fraction of the Eddington luminosity. */
export function eddingtonRate(bh: BlackHole, fraction = 0.1): number {
  // L_Edd = 4πGMm_p c / σ_T, and Ṁ = L / ηc².
  const mp = 1.67262192369e-27;
  const sigmaT = 6.6524587321e-29;
  const lEdd = (4 * Math.PI * PHYS.G * bh.M * mp * PHYS.c) / sigmaT;
  return (fraction * lEdd) / (Math.max(0.01, bh.efficiency) * PHYS.c * PHYS.c);
}

/**
 * How much brighter, and how much bluer, a patch of the disc looks.
 *
 * Special relativity does all of it. A patch moving with speed β at angle θ to
 * the line of sight has Doppler factor
 *
 *     δ = 1 / [ γ(1 − β cos θ) ]
 *
 * and a blackbody seen through it looks δ times hotter, while its surface
 * brightness goes as δ⁴ — the beaming exponent for a continuum source. The
 * near side of the disc therefore blazes and the far side nearly vanishes,
 * which is not an artistic choice about a black hole picture, it is the
 * reason the real ones look lopsided.
 *
 * `cosTheta` is +1 for a patch coming straight at the observer.
 */
export function doppler(beta: number, cosTheta: number): { delta: number; boost: number } {
  const b = Math.min(0.999, Math.max(0, beta));
  const gamma = 1 / Math.sqrt(1 - b * b);
  const delta = 1 / (gamma * (1 - b * cosTheta));
  return { delta, boost: delta ** 4 };
}

/** Orbital speed as a fraction of c for a circular orbit at r (Schwarzschild). */
export function orbitalBeta(bh: BlackHole, r: number): number {
  // v = √(GM/r) in these coordinates; at the ISCO of a still hole that is c/√6.
  return Math.min(0.999, Math.sqrt((PHYS.G * bh.M) / r) / PHYS.c);
}

/**
 * A blackbody's colour, as sRGB in 0…255.
 *
 * Planck's law through the CIE colour-matching functions is the right way and
 * is a hundred lines of tabulated data; this is the standard piecewise fit to
 * the same curve (good to a few percent over 1000–40000 K), which is far
 * inside what a screen can show. Below 1000 K it clamps to a dull red rather
 * than going black, because a disc ring that renders as the background is a
 * ring the reader will read as absent rather than as cold.
 */
export function blackbodyRGB(kelvin: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  const clamp255 = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66
    ? 99.4708025861 * Math.log(t) - 161.1195681661
    : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [clamp255(r), clamp255(g), clamp255(b)];
}

/**
 * What temperature a patch of disc APPEARS to have, from far away.
 *
 * Three things act on it and all three are real: the blackbody temperature it
 * radiates at, the Doppler factor from its orbital motion, and the
 * gravitational redshift of climbing out of the hole's well, √(1 − r_s/r).
 * Together they are why one side of a real image is blue-white and the other
 * is dim and red — a variation of two or three across a ring that is all at
 * one emitted temperature.
 */
export function observedTemperature(
  bh: BlackHole,
  r: number,
  mdot: number,
  cosTheta: number
): { T: number; boost: number } {
  const emitted = discTemperature(bh, r, mdot);
  const grav = Math.sqrt(Math.max(0, 1 - bh.rs / r));
  const { delta, boost } = doppler(orbitalBeta(bh, r), cosTheta);
  return { T: emitted * delta * grav, boost: boost * grav ** 4 };
}

/** `blackbodyRGB` as a CSS colour, with an alpha for how bright it is. */
export function blackbodyCSS(kelvin: number, alpha = 1): string {
  const [r, g, b] = blackbodyRGB(kelvin);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0.04, alpha)).toFixed(3)})`;
}

// ════════════════════════════════════════════════════════════════════
// THE BIG BANG — a thermal history, integrated
// ════════════════════════════════════════════════════════════════════
//
// WHAT THIS IS AND IS NOT. It is the standard hot Big Bang: a radiation-then-
// matter-then-Λ universe whose expansion follows the Friedmann equation, whose
// temperature follows from the expansion, and whose contents change as that
// temperature falls past the mass of each species. Everything below is
// computed from six numbers — the density parameters and H₀ — rather than
// drawn from a table of epochs.
//
// It is NOT a simulation of structure, and it does not pretend to be. Nothing
// here integrates a fluid or forms a galaxy. What it does is the thing the
// pictures in books cannot: let somebody move Ω_m or Ω_Λ and watch
// recombination move, or turn the radiation content up and watch matter–
// radiation equality slide past it.
//
// BEFORE ~10⁻¹² s THE PHYSICS IS NOT SETTLED, and the model says so rather
// than drawing confident lines through it. The electroweak epoch and anything
// earlier is marked `speculative`, which the renderer draws differently. A
// model that renders the Planck era in the same ink as nucleosynthesis is
// making a claim nobody can make.

export const COSMO = {
  /** Hubble constant today, km/s/Mpc */
  H0: 67.66,
  /** matter density parameter */
  omegaM: 0.3111,
  /** dark energy */
  omegaL: 0.6889,
  /** photons + neutrinos today */
  omegaR: 9.182e-5,
  /** CMB temperature today, K */
  T0: 2.7255,
  /** baryon-to-photon ratio */
  eta: 6.1e-10,
} as const;

export interface Cosmology {
  H0: number;
  omegaM: number;
  omegaL: number;
  omegaR: number;
  T0: number;
}

/**
 * Effective relativistic degrees of freedom at temperature T.
 *
 * WHY THIS IS NOT OPTIONAL. Radiation density is g_* times a constant times
 * T⁴, and g_* is 3.38 today but 106.75 above the top quark — a factor of
 * thirty. Treating it as constant, which is what "Ω_r a⁻⁴" alone does, puts
 * the first second of the universe in the wrong place by a factor of a few:
 * the check everybody knows, kT ≈ 1 MeV at t ≈ 1 s, came out at 2.35 MeV
 * before this existed.
 *
 * A staircase, at the standard thresholds, in the standard order: each species
 * drops out of the count as kT falls below its mass. It ignores the smooth
 * shape of each transition and the small reheating of the photons when the
 * electrons go — which also makes T ∝ 1/a slightly wrong across e± annihilation
 * — and neither is visible at the resolution of a picture.
 */
export function gStar(kelvin: number): number {
  const mev = kTeV(kelvin) / 1e6;
  if (mev > 300) return 106.75;   // everything, above the top quark
  if (mev > 180) return 96.25;    // minus top
  if (mev > 80e3 / 1e3) return 86.25;
  if (mev > 4200) return 75.75;   // minus the heavy bosons
  if (mev > 1777) return 72.25;   // minus bottom
  if (mev > 1270) return 61.75;   // minus tau
  if (mev > 150) return 51.25;    // minus charm — still a quark–gluon plasma
  if (mev > 105.7) return 17.25;  // hadrons: pions, muons, e±, ν, γ
  if (mev > 0.511) return 10.75;  // muons gone: e±, three ν, γ
  return 3.38;                    // after e± annihilation: γ and neutrinos
}

/** H₀ in s⁻¹. */
export function hubbleSI(H0: number): number {
  return (H0 * 1000) / PHYS.pc / 1e6;
}

/**
 * The Friedmann equation, as a function of the scale factor.
 *
 * H(a)² = H₀²[ Ω_r a⁻⁴ + Ω_m a⁻³ + Ω_Λ ] — the whole expansion history in one
 * line, and the reason the epochs below do not have to be put in by hand: the
 * a⁻⁴ term dominates early, the a⁻³ term takes over at equality, and Λ takes
 * over at the end, each because of its own exponent.
 */
export function hubbleAt(c: Cosmology, a: number): number {
  const x = Math.max(1e-40, a);
  const h0 = hubbleSI(c.H0);
  // The radiation term carries g_*(T)/g_*(today): without it the first second
  // lands in the wrong place (see gStar).
  const g = gStar(c.T0 / x) / 3.38;
  return h0 * Math.sqrt((c.omegaR * g) / x ** 4 + c.omegaM / x ** 3 + c.omegaL);
}

/**
 * Cosmic time at scale factor a, in seconds — by integrating da/(aH).
 *
 * Logarithmic in a, because the interesting range spans forty orders of
 * magnitude and a linear grid would spend every step in the last billion
 * years. Simpson's rule over that log grid is good to well under a percent
 * against the analytic radiation- and matter-dominated limits, which the tests
 * check at both ends.
 */
export function ageAt(c: Cosmology, a: number, steps = 2000): number {
  const hi = Math.log(Math.max(1e-40, a));
  const lo = Math.log(1e-40);
  const h = (hi - lo) / steps;
  // t = ∫ da/(aH) = ∫ dlna / H
  const f = (lna: number) => 1 / hubbleAt(c, Math.exp(lna));
  let sum = f(lo) + f(hi);
  for (let i = 1; i < steps; i++) sum += f(lo + i * h) * (i % 2 ? 4 : 2);
  return (sum * h) / 3;
}

/** The age of the universe now, in seconds. */
export function ageNow(c: Cosmology): number {
  return ageAt(c, 1);
}

/** Radiation temperature at scale factor a, in kelvin: T = T₀/a. */
export function temperatureAt(c: Cosmology, a: number): number {
  return c.T0 / Math.max(1e-40, a);
}

/** Energy per particle at temperature T, in electronvolts. */
export function kTeV(kelvin: number): number {
  return (PHYS.kB * kelvin) / 1.602176634e-19;
}

/**
 * When the universe stopped being opaque.
 *
 * Recombination is a Saha problem, and solving it properly is worth the
 * fifteen lines: the answer moves when the baryon density moves, which is
 * exactly what a reader turning Ω_m wants to see. The ionised fraction x obeys
 *
 *     x²/(1−x) = (1/n_b)(m_e kT/2πħ²)^{3/2} e^{−B/kT},   B = 13.6 eV
 *
 * and "recombination" is where x falls to a half. Reported as a redshift,
 * because that is the number everyone quotes (≈1100) and it is the one that
 * can be checked.
 */
export function recombinationZ(c: Cosmology, etaB = COSMO.eta): number {
  const me = 9.1093837015e-31;
  const B = 13.605693 * 1.602176634e-19;
  const x = (z: number) => {
    const T = c.T0 * (1 + z);
    const kT = PHYS.kB * T;
    // photon number density, then baryons from the ratio
    const nGamma = 0.2436 * (kT / (PHYS.hbar * PHYS.c)) ** 3;
    const nB = etaB * nGamma;
    const rhs =
      (1 / nB) * Math.pow((me * kT) / (2 * Math.PI * PHYS.hbar ** 2), 1.5) * Math.exp(-B / kT);
    if (!Number.isFinite(rhs)) return rhs > 0 ? 1 : 0;
    // x²/(1−x) = rhs  →  x = (−rhs + √(rhs² + 4rhs))/2
    return (-rhs + Math.sqrt(rhs * rhs + 4 * rhs)) / 2;
  };
  // x falls with z; bisect for x = 0.5.
  let lo = 200;
  let hi = 5000;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (x(mid) > 0.5) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/**
 * LAST SCATTERING, which is not the same event as recombination.
 *
 * `recombinationZ` finds where half the electrons have been captured — the
 * Saha half-ionisation point, z ≈ 1380. The number everybody quotes, z ≈ 1090,
 * is later: it is where the optical depth to Thomson scattering falls through
 * one and the photons stop being scattered at all. Conflating them is the
 * commonest error in a cosmology timeline, so both are here under their own
 * names, and it is THIS one the microwave background comes from.
 *
 * Hu & Sugiyama's fitting formula, which is accurate to a fraction of a per
 * cent over the parameter range anybody will move these sliders across, and —
 * the point — moves when the densities move.
 */
export function lastScatteringZ(c: Cosmology, omegaB = 0.04897): number {
  const h = c.H0 / 100;
  const wb = Math.max(1e-4, omegaB * h * h);
  const wm = Math.max(1e-3, c.omegaM * h * h);
  const g1 = (0.0783 * Math.pow(wb, -0.238)) / (1 + 39.5 * Math.pow(wb, 0.763));
  const g2 = 0.56 / (1 + 21.1 * Math.pow(wb, 1.81));
  return 1048 * (1 + 0.00124 * Math.pow(wb, -0.738)) * (1 + g1 * Math.pow(wm, g2));
}

/** Matter–radiation equality, as a redshift: where Ω_m a⁻³ = Ω_r a⁻⁴. */
export function equalityZ(c: Cosmology): number {
  return c.omegaM / c.omegaR - 1;
}

/**
 * The particle content at a temperature, as what a reader would name.
 *
 * Species appear when kT is comparable to what it costs to make them and
 * vanish when it is not, so this is thresholds rather than a table of eras —
 * turn the temperature and the contents change for a reason.
 */
export interface Species {
  id: string;
  label: string;
  /** roughly what kT it takes to have these about, in eV */
  threshold: number;
  /** what it is, which is what the colour is keyed to */
  family: 'quark' | 'gluon' | 'lepton' | 'boson' | 'photon' | 'neutrino' | 'hadron' | 'nucleus' | 'atom';
}

export const SPECIES: Species[] = [
  { id: 'quark', label: 'quarks', threshold: 2e8, family: 'quark' },
  { id: 'gluon', label: 'gluons', threshold: 2e8, family: 'gluon' },
  { id: 'wz', label: 'W, Z', threshold: 8e10, family: 'boson' },
  { id: 'higgs', label: 'Higgs', threshold: 1.25e11, family: 'boson' },
  { id: 'tau', label: 'taus', threshold: 1.777e9, family: 'lepton' },
  { id: 'muon', label: 'muons', threshold: 1.057e8, family: 'lepton' },
  { id: 'electron', label: 'electrons', threshold: 5.11e5, family: 'lepton' },
  { id: 'photon', label: 'photons', threshold: 0, family: 'photon' },
  { id: 'neutrino', label: 'neutrinos', threshold: 0, family: 'neutrino' },
  { id: 'proton', label: 'protons', threshold: -1, family: 'hadron' },
  { id: 'neutron', label: 'neutrons', threshold: -1, family: 'hadron' },
  { id: 'helium', label: 'helium nuclei', threshold: -2, family: 'nucleus' },
  { id: 'hydrogen', label: 'hydrogen atoms', threshold: -3, family: 'atom' },
];

/** Which species are around at this temperature, given where we are in the history. */
export function speciesAt(c: Cosmology, a: number): Species[] {
  const T = temperatureAt(c, a);
  const eV = kTeV(T);
  const zNow = 1 / a - 1;
  const zRec = recombinationZ(c);
  const out: Species[] = [];
  for (const s of SPECIES) {
    if (s.threshold >= 0) {
      // free quarks and gluons are confined below the QCD scale (~150 MeV)
      if ((s.family === 'quark' || s.family === 'gluon') && eV < 1.5e8) continue;
      if (eV >= s.threshold) out.push(s);
    } else if (s.threshold === -1) {
      // nucleons: after confinement, always
      if (eV < 1.5e8) out.push(s);
    } else if (s.threshold === -2) {
      // helium: after nucleosynthesis, which finishes around 30 keV
      if (eV < 3e4) out.push(s);
    } else if (s.threshold === -3) {
      // neutral atoms: after recombination
      if (zNow < zRec) out.push(s);
    }
  }
  return out;
}

export interface Epoch {
  id: string;
  label: string;
  /** what happens, in one line */
  what: string;
  /** the scale factor it begins at */
  a: number;
  /** true where the physics is not settled and the picture should say so */
  speculative?: boolean;
}

/**
 * The named epochs, positioned by their own physics wherever that is possible.
 *
 * Equality and recombination are COMPUTED from the cosmology, so moving Ω_m
 * moves them — which is the whole reason this is a model rather than a
 * timeline. The early ones are fixed by particle masses, which do not depend
 * on the cosmology. The first two are marked speculative: before about a
 * picosecond the physics is extrapolation, and a picture that draws the Planck
 * era in the same ink as nucleosynthesis is making a claim nobody can make.
 */
export function epochs(c: Cosmology): Epoch[] {
  const aOfT = (eV: number) => c.T0 / ((eV * 1.602176634e-19) / PHYS.kB);
  const zEq = equalityZ(c);
  const zRec = recombinationZ(c);
  return [
    { id: 'planck', label: 'Planck', what: 'Gravity is not separable from the rest. Nothing here is established physics.', a: aOfT(1.22e28), speculative: true },
    { id: 'inflation', label: 'Inflation', what: 'A brief enormous expansion, inferred from what the sky looks like rather than observed.', a: aOfT(1e24), speculative: true },
    { id: 'ew', label: 'Electroweak', what: 'The electroweak force separates; W and Z become massive.', a: aOfT(1e11) },
    { id: 'quark', label: 'Quark–gluon plasma', what: 'Quarks and gluons are free. This state has been made in a collider.', a: aOfT(1e9) },
    { id: 'hadron', label: 'Hadrons form', what: 'Quarks confine into protons and neutrons. Antimatter annihilates and a residue of matter is left.', a: aOfT(1.5e8) },
    { id: 'nuc', label: 'Nucleosynthesis', what: 'Protons and neutrons fuse. A quarter of the mass ends as helium, and almost nothing heavier.', a: aOfT(1e5) },
    { id: 'eq', label: 'Matter takes over', what: 'Matter density passes radiation density; structure can begin to grow.', a: 1 / (1 + zEq) },
    { id: 'rec', label: 'Recombination', what: 'Half the electrons have been captured. The gas is still thick enough to scatter light.', a: 1 / (1 + zRec) },
    { id: 'ls', label: 'Last scattering', what: 'The fog clears: photons stop being scattered and fly free. That light is the microwave background, and it is still arriving.', a: 1 / (1 + lastScatteringZ(c)) },
    { id: 'dark', label: 'The dark ages', what: 'Neutral gas, no stars yet, nothing radiating but the cooling background.', a: 1 / (1 + 100) },
    { id: 'stars', label: 'First light', what: 'The first stars ignite and begin to re-ionise the gas around them.', a: 1 / (1 + 20) },
    { id: 'now', label: 'Now', what: 'Dark energy has taken over, and the expansion is accelerating.', a: 1 },
  ];
}

/**
 * Primordial helium, computed rather than quoted.
 *
 * The mass fraction of ⁴He is essentially all of the neutrons that survive to
 * nucleosynthesis: Y ≈ 2n/(n+p). The neutron-to-proton ratio freezes out at
 * about kT = 0.8 MeV at the equilibrium value e^{−Δm/kT}, and then decays for
 * the few hundred seconds it takes the deuterium bottleneck to clear. Two
 * lines of arithmetic give 0.24, which is one of the most precisely tested
 * numbers in cosmology.
 */
export function heliumFraction(freezeOutMeV = 0.8, delaySeconds = 264): number {
  const dm = 1.29333; // neutron − proton, MeV
  const tau = 879.4; // free neutron lifetime, s
  const ratio = Math.exp(-dm / freezeOutMeV) * Math.exp(-delaySeconds / tau);
  return (2 * ratio) / (1 + ratio);
}

// ════════════════════════════════════════════════════════════════════
// GRAVITY, N BODIES OF IT
// ════════════════════════════════════════════════════════════════════
//
// The two-body orbit further up has a closed form, which is why it can be
// drawn exactly. Three bodies do not, and have not since Poincaré — so the
// only honest way to show three is to integrate them, and the only honest way
// to integrate them is with a scheme that does not quietly leak energy.
//
// VELOCITY VERLET, NOT EULER, AND THE REASON IS VISIBLE. Forward Euler on an
// orbit spirals outward: the error is one-signed, so the orbit gains energy
// every step and a "stable" system drifts apart on screen over a minute. Verlet
// is symplectic — its energy error oscillates instead of accumulating — so a
// circular orbit stays a circle for as long as anyone watches. `energy()` is
// exported so a test can assert that rather than a reader having to trust it.
//
// SOFTENING, AND WHAT IT COSTS. The 1/r² force goes to infinity as two bodies
// touch, and a close pass with a fixed step then throws one to the other side
// of the screen. The force is therefore computed with (r² + ε²) in place of
// r², which is standard for N-body work and is a real approximation: below the
// softening length the model is no longer Newton's. The tests pin the energy
// drift rather than pretending the softening is free.

export interface Body {
  /** kilograms */
  m: number;
  /** metres */
  x: number;
  y: number;
  /** metres per second */
  vx: number;
  vy: number;
}

/** Total energy of the system, in joules: the thing that must not drift. */
export function energy(bodies: readonly Body[], softening = 0): number {
  let ke = 0;
  let pe = 0;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    ke += 0.5 * a.m * (a.vx * a.vx + a.vy * a.vy);
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      const r = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + softening * softening);
      pe -= (PHYS.G * a.m * b.m) / r;
    }
  }
  return ke + pe;
}

/** Centre of mass, and the momentum of the whole system. */
export function barycentre(bodies: readonly Body[]): { x: number; y: number; px: number; py: number; m: number } {
  let m = 0;
  let x = 0;
  let y = 0;
  let px = 0;
  let py = 0;
  for (const b of bodies) {
    m += b.m;
    x += b.m * b.x;
    y += b.m * b.y;
    px += b.m * b.vx;
    py += b.m * b.vy;
  }
  return { x: m ? x / m : 0, y: m ? y / m : 0, px, py, m };
}

function accelerations(bodies: readonly Body[], eps: number): { ax: number; ay: number }[] {
  const out = bodies.map(() => ({ ax: 0, ay: 0 }));
  const e2 = eps * eps;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const r2 = dx * dx + dy * dy + e2;
      const inv = 1 / (r2 * Math.sqrt(r2));
      const gi = PHYS.G * bodies[j].m * inv;
      const gj = PHYS.G * bodies[i].m * inv;
      out[i].ax += gi * dx;
      out[i].ay += gi * dy;
      out[j].ax -= gj * dx;
      out[j].ay -= gj * dy;
    }
  }
  return out;
}

/**
 * One velocity-Verlet step. Pure: it returns a new array and mutates nothing,
 * so a caller can keep the previous state for a trail without copying by hand.
 */
export function gravityStep(bodies: readonly Body[], dt: number, eps: number): Body[] {
  const a0 = accelerations(bodies, eps);
  const half = bodies.map((b, i) => ({
    ...b,
    x: b.x + b.vx * dt + 0.5 * a0[i].ax * dt * dt,
    y: b.y + b.vy * dt + 0.5 * a0[i].ay * dt * dt,
  }));
  const a1 = accelerations(half, eps);
  return half.map((b, i) => ({
    ...b,
    vx: b.vx + 0.5 * (a0[i].ax + a1[i].ax) * dt,
    vy: b.vy + 0.5 * (a0[i].ay + a1[i].ay) * dt,
  }));
}

/** Run `n` steps. Substepping is the caller's business; this just iterates. */
export function gravityRun(bodies: readonly Body[], dt: number, n: number, eps: number): Body[] {
  let s = bodies as Body[];
  for (let i = 0; i < n; i++) s = gravityStep(s, dt, eps);
  return s;
}

export type GravityPreset = 'two' | 'figure8' | 'inner' | 'binary' | 'cluster';

/**
 * Starting conditions worth watching, each chosen because it shows something
 * the others cannot.
 *
 *   two      a circular orbit — the case with an exact answer, so the
 *            integrator can be checked against it by eye as well as by test
 *   figure8  Chenciner and Montgomery's three equal masses chasing each other
 *            round a figure of eight. It is a real solution of the three-body
 *            problem, discovered in 2000, and it is stable enough to watch.
 *            Nothing about it is obvious, which is the point.
 *   inner    the real inner solar system, at real masses and distances
 *   binary   a close pair with a distant third — the commonest arrangement in
 *            the sky, and the one where the third body's orbit visibly wobbles
 *   cluster  a dozen bodies with no plan, which is how you see that three is
 *            already the hard case and twelve is not harder in kind
 */
export function gravityPreset(which: GravityPreset): { bodies: Body[]; dt: number; eps: number; span: number } {
  const AU = PHYS.AU;
  const Ms = PHYS.Msun;
  if (which === 'figure8') {
    // The published solution, in units where G = m = 1, scaled to something
    // with a sun's mass and an AU so the readouts carry real units.
    const L = AU;
    const T = Math.sqrt((L * L * L) / (PHYS.G * Ms));
    const V = L / T;
    const p = [0.97000436, -0.24308753];
    const v = [-0.93240737, -0.86473146];
    return {
      bodies: [
        { m: Ms, x: p[0] * L, y: p[1] * L, vx: (-v[0] / 2) * V, vy: (-v[1] / 2) * V },
        { m: Ms, x: -p[0] * L, y: -p[1] * L, vx: (-v[0] / 2) * V, vy: (-v[1] / 2) * V },
        { m: Ms, x: 0, y: 0, vx: v[0] * V, vy: v[1] * V },
      ],
      dt: T / 900,
      eps: L * 1e-3,
      span: 1.6 * L,
    };
  }
  if (which === 'inner') {
    const planet = (aAU: number, m: number) => {
      const r = aAU * AU;
      return { m, x: r, y: 0, vx: 0, vy: Math.sqrt((PHYS.G * Ms) / r) };
    };
    return {
      bodies: [
        { m: Ms, x: 0, y: 0, vx: 0, vy: 0 },
        planet(0.387, 3.301e23),
        planet(0.723, 4.867e24),
        planet(1.0, PHYS.Mearth),
        planet(1.524, 6.417e23),
      ],
      dt: 3600 * 6,
      eps: 1e8,
      span: 1.9 * AU,
    };
  }
  if (which === 'binary') {
    const r = 0.5 * AU;
    const v = Math.sqrt((PHYS.G * Ms) / (4 * r));
    const far = 6 * AU;
    return {
      bodies: [
        { m: Ms, x: -r, y: 0, vx: 0, vy: -v },
        { m: Ms, x: r, y: 0, vx: 0, vy: v },
        { m: 0.2 * Ms, x: far, y: 0, vx: 0, vy: Math.sqrt((PHYS.G * 2 * Ms) / far) },
      ],
      dt: 3600 * 12,
      eps: 1e8,
      span: 7 * AU,
    };
  }
  if (which === 'cluster') {
    // Deterministic pseudo-random, so the same cluster comes back every time:
    // a scene that is different on every reload cannot be talked about.
    let seed = 20260926;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const bodies: Body[] = [];
    for (let i = 0; i < 12; i++) {
      const r = (0.4 + 2.2 * Math.sqrt(rnd())) * AU;
      const th = rnd() * Math.PI * 2;
      const m = (0.2 + rnd() * 1.4) * Ms;
      const v = Math.sqrt((PHYS.G * 6 * Ms) / r) * (0.55 + rnd() * 0.35);
      bodies.push({
        m,
        x: r * Math.cos(th),
        y: r * Math.sin(th),
        vx: -v * Math.sin(th),
        vy: v * Math.cos(th),
      });
    }
    // SOFTENING AND STEP ARE NOT DECORATION HERE. At eps = 3 × 10⁹ m and a
    // six-hour step this system gained four hundred per cent of its own energy
    // in four thousand steps: two bodies passed close, the force spiked between
    // samples, and one of them left. Twelve bodies have close passes constantly,
    // so the softening has to be a real fraction of the typical separation.
    return { bodies, dt: 3600 * 1.5, eps: 0.05 * AU, span: 3.2 * AU };
  }
  const r = AU;
  return {
    bodies: [
      { m: Ms, x: 0, y: 0, vx: 0, vy: 0 },
      { m: PHYS.Mearth, x: r, y: 0, vx: 0, vy: Math.sqrt((PHYS.G * Ms) / r) },
    ],
    dt: 3600 * 6,
    eps: 1e8,
    span: 1.4 * AU,
  };
}

/** Drop the system's net drift, so the picture does not wander off the page. */
export function recentre(bodies: readonly Body[]): Body[] {
  const c = barycentre(bodies);
  const vx = c.m ? c.px / c.m : 0;
  const vy = c.m ? c.py / c.m : 0;
  return bodies.map((b) => ({ ...b, x: b.x - c.x, y: b.y - c.y, vx: b.vx - vx, vy: b.vy - vy }));
}
