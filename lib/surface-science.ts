// lib/surface-science.ts
//
// WHAT EACH ADVANCED SURFACE IS, AS SCIENCE — one block per model, and the only
// place any of it is stated.
//
// The registry in lib/viz-semantics.ts says what each drawn MARK is, for a
// reader pointing at the screen. This says what the MODEL is: the equations, the
// coordinates, the solver and its settings, where each number is valid, what was
// computed and what was drawn, what the model cannot do, and where it all comes
// from. Both are read by the conversation; only this one is checked by
// lib/model/science.ts, which refuses a block that claims more than it supports.
//
// WHY THEY ARE SEPARATE FILES AND ONE SOURCE. The surface used to carry three
// hand-written arrays — a model name, some assumptions, some equations — and the
// physics module carried the actual mathematics. Two statements of one thing
// drift: the arrays said the rays were integrated in Schwarzschild long after
// that was the plan and not yet the code, and nothing could catch it. Now the
// surfaces and the chat read this, the suite validates it, and a claim here that
// the code does not support is a failing test rather than a sentence nobody
// re-read.

import type { ScienceMeta } from './model/science';

// ════════════════════════════════════════════════════════════════════
// BLACK HOLE — Kerr, equatorial
// ════════════════════════════════════════════════════════════════════

export const BLACK_HOLE_SCIENCE: ScienceMeta = {
  name: 'Kerr black hole with a thin accretion disc',
  version: '2.0.0',
  domain: 'general relativity, accretion physics',
  // The weakest output is the disc's drawn thickness and the sampled parcels,
  // which are illustrative — so the BLOCK is conceptual even though its central
  // results are integrated. That is the rule working as intended: the headline
  // cannot outrun the weakest part, and the per-output fidelities below say
  // exactly which parts are which.
  fidelity: 'conceptual',
  coordinates: {
    system: 'Boyer–Lindquist, equatorial plane (θ = π/2)',
    note:
      'φ winds without bound as r → r₊, so a ray reaching the horizon is stopped just outside it; that is the chart running out, not the spacetime',
  },
  units: {
    lengths: 'gravitational radii r_g = GM/c² internally; Schwarzschild radii r_s = 2r_g on screen',
    times: 'seconds, from r_g/c',
    note: 'every length scales with the mass, so the figure is the same shape for a stellar and a supermassive hole',
  },
  observer:
    'a distant observer at rest, viewing the disc at the tilt set by the control; the shadow outline is drawn on that observer’s sky',
  equations: [
    {
      id: 'horizons',
      text: 'r± = r_g(1 ± √(1 − a★²))',
      says: 'the two horizons are the roots of Δ = r² − 2r + a²; they merge at the extremal limit',
      from: ['kerr63', 'mtw'],
    },
    {
      id: 'ergosphere',
      text: 'r_E(θ) = r_g(1 + √(1 − a★²cos²θ))',
      says: 'the static limit: inside it nothing can hold still, however hard it thrusts',
      from: ['kerr63'],
    },
    {
      id: 'photon-orbit',
      text: 'r_ph = 2r_g[1 + cos(⅔ arccos(∓a★))]',
      says: 'the equatorial circular photon orbits, co-rotating (−) and counter-rotating (+)',
      from: ['bpt72'],
      valid: 'equatorial orbits only; off the equator the spherical photon orbits span a range of radii',
    },
    {
      id: 'isco',
      text: 'r_ISCO = r_g[3 + Z₂ ∓ √((3 − Z₁)(3 + Z₁ + 2Z₂))]',
      says: 'the innermost stable circular orbit, prograde (−) and retrograde (+)',
      from: ['bpt72'],
    },
    {
      id: 'isco-energy',
      text: 'E(r) = (r² − 2r + a★√r) / (r√(r² − 3r + 2a★√r))',
      says: 'the specific energy of a circular orbit; 1 − E at the ISCO is what a disc can radiate',
      from: ['bpt72', 'nt73'],
    },
    {
      id: 'omega',
      text: 'Ω = ± c/r_g · 1/(r̃^{3/2} ± a★)',
      says: 'the orbital angular velocity — Kepler’s third law at a★ = 0, and not once the hole spins',
      from: ['bpt72'],
    },
    {
      id: 'drag',
      text: 'ω = 2a★r̃ / (r̃⁴ + a★²r̃² + 2a★²r̃) · c/r_g',
      says: 'the dragging of inertial frames: the angular velocity of a locally non-rotating observer',
      from: ['mtw'],
      valid: 'equatorial',
    },
    {
      id: 'lapse',
      text: 'α = r̃√Δ̃/√A, A = r̃⁴ + a★²r̃² + 2a★²r̃',
      says: 'how slowly a local clock runs relative to infinity',
      from: ['mtw'],
    },
    {
      id: 'beta',
      text: 'β = |Ω − ω|√A / (r̃ α c)',
      says: 'orbital speed as a local non-rotating observer measures it — the β that belongs in a Doppler factor',
      from: ['mtw'],
    },
    {
      id: 'orbit-redshift',
      text: 'u^t = (1 + a★r̃^{-3/2}) / √(1 − 3/r̃ + 2a★r̃^{-3/2})',
      says: 'time dilation for gas in a circular orbit; it diverges at the photon orbit, where no orbit exists',
      from: ['bpt72'],
    },
    {
      id: 'geodesic',
      text: 'R(r) = (r² + a★² − a★b)² − Δ(b − a★)²,  ṙ² = R/r⁴,  φ̇ = [(b − a★) + a★(r² + a★² − a★b)/Δ]/r²',
      says: 'equatorial null geodesics, with the photon’s two constants written as one impact parameter b = L/E',
      from: ['chandra83', 'mtw'],
      valid: 'equatorial photons; b is signed, positive co-rotating',
    },
    {
      id: 'geodesic-2',
      text: 'r̈ = R′(r)/2r⁴ − 2ṙ²/r',
      says: 'the same motion with the square root differentiated away, so the turning point keeps its sign',
      from: ['chandra83'],
    },
    {
      id: 'bcrit',
      text: 'b_c = (r_ph² + a★² ± a★√Δ)/(a★ ± √Δ)',
      says: 'the exact capture thresholds: ±√27 r_g at rest, +2 and −7 at the extremal limit',
      from: ['bpt72', 'chandra83'],
    },
    {
      id: 'shadow',
      text:
        'ξ = −(r³ − 3r² + a★²r + a★²)/(a★(r − 1)),  η = −r³(r³ − 6r² + 9r − 4a★²)/(a★²(r − 1)²),  α = −ξ/sin i,  β = ±√(η + a★²cos²i − ξ²cot²i)',
      says: 'the outline of the shadow on a distant observer’s sky — a circle of √27 r_g only when the hole is still',
      from: ['bardeen73'],
    },
    {
      id: 'ss-temperature',
      text: 'σT⁴ = 3GMṀ/8πr³ · (1 − √(r_in/r))',
      says: 'the thin-disc temperature profile, falling as r^{-3/4} in the outer disc',
      from: ['ss73', 'nt73'],
      valid: 'optically thick, geometrically thin, radiatively efficient discs — roughly 1–30% of the Eddington rate',
    },
    {
      id: 'doppler',
      text: 'δ = 1/[γ(1 − β cos θ)], brightness ∝ δ⁴, T_obs = δ α T_em',
      says: 'relativistic beaming and the lapse together: why one side of a disc image is brighter and bluer',
      from: ['luminet79', 'mtw'],
    },
    {
      id: 'kappa',
      text: 'κ = (r₊ − r₋)c²/(2(r₊² + a★²r_g²)) ,  T_H = ħκ/2πck_B',
      says: 'surface gravity and the Hawking temperature that follows from it; both fall to zero at the extremal limit',
      from: ['hawking75', 'mtw'],
    },
  ],
  constants: [
    { symbol: 'G', value: 6.6743e-11, units: 'm³ kg⁻¹ s⁻²', source: 'CODATA 2018' },
    { symbol: 'c', value: 299792458, units: 'm/s', source: 'SI definition, exact' },
    { symbol: 'ħ', value: 1.054571817e-34, units: 'J s', source: 'CODATA 2018, exact' },
    { symbol: 'k_B', value: 1.380649e-23, units: 'J/K', source: 'SI definition, exact' },
    { symbol: 'σ', value: 5.670374419e-8, units: 'W m⁻² K⁻⁴', source: 'CODATA 2018' },
    { symbol: 'M☉', value: 1.98892e30, units: 'kg', source: 'IAU nominal solar mass' },
  ],
  parameters: [
    {
      id: 'm',
      symbol: 'M',
      says: 'the mass of the hole',
      units: '10⁶ solar masses',
      range: [1, 12],
      valid: [1e-6, 1e5],
      outside:
        'the geometry is scale-free and stays exact, but the disc model assumes a radiation-cooled thin disc, which no longer describes the flow',
    },
    {
      id: 'spin',
      symbol: 'a★',
      says: 'the dimensionless spin; negative means the disc runs against the rotation',
      units: 'dimensionless (Jc/GM²)',
      range: [-0.998, 0.998],
      valid: [-0.998, 0.998],
      outside:
        'above a★ = 1 a Kerr solution has no horizon at all, and 0.998 is the Thorne limit that accretion itself enforces',
    },
    {
      id: 'edd',
      says: 'the accretion rate, as a fraction of the Eddington rate',
      units: 'dimensionless',
      range: [0.01, 0.3],
      valid: [0.005, 0.3],
      outside:
        'below about half a per cent the flow is not radiatively efficient and above about a third of Eddington radiation pressure thickens it — either way the thin-disc profile stops applying',
    },
    {
      id: 'outer',
      says: 'how far out the disc is drawn',
      units: 'Schwarzschild radii',
      range: [4, 40],
      valid: [1, 1000],
      outside: 'a real disc extends much further; this is the drawn extent, not a physical edge',
    },
    {
      id: 'tilt',
      says: 'the inclination of the disc to the line of sight',
      units: 'radians',
      range: [-1.2, 1.2],
      valid: [-1.5708, 1.5708],
      outside: 'beyond edge-on the same geometry repeats',
    },
    {
      id: 'bsel',
      symbol: 'b',
      says: 'the aiming distance of the highlighted ray',
      units: 'Schwarzschild radii',
      range: [0.5, 12],
      valid: [0, 1000],
      outside: 'a negative impact parameter is the same ray on the other side, with the opposite sense',
    },
  ],
  initial: [
    'each ray starts at r₀ = max(40, 6|b|) r_g, inbound, with ṙ from R(r₀) — far enough out that the curvature terms there are negligible and always outside its own turning point',
    'the disc is in circular Keplerian orbit at every radius, prograde unless the spin control is negative',
  ],
  boundary: [
    'a ray is stopped at r = 1.003 r₊ and reported captured',
    'a ray is stopped once it is back outside r₀ and moving outward',
    'the disc has an inner edge at the ISCO for its own sense of rotation',
  ],
  assumptions: [
    'Motion is equatorial: the rays and the orbits are computed in the plane θ = π/2, so nothing here shows an inclined orbit or an off-equator photon.',
    'The disc is optically thick, geometrically thin and in circular Keplerian orbit; its drawn thickness is for legibility, not to scale.',
    'The disc’s colour is the observed blackbody temperature — the emitted profile, the lapse and the Doppler factor — and light bending along the way OUT is not applied to it. The rays show that bending; the disc image does not include it.',
    'The hole is in vacuum: the disc’s own mass does not alter the geometry.',
    'Nothing here is time-dependent physics. The clock moves the gas round the orbits the model computed; it does not evolve the disc.',
  ],
  numerics: [
    {
      id: 'rk4-null',
      method: 'RK4 on the second-order radial equation for equatorial null geodesics, with φ carried along by the same weights',
      order: 4,
      steps:
        'adaptive: h = min(0.005r, 0.0025r²/|b|, 0.35Δ), capped at 12,000 steps and 8π of sweep',
      stopsOn: ['crossing 1.003 r₊', 'returning outside the start radius while outbound', 'the step or sweep cap'],
      checkedAgainst:
        'the weak-field series 4/b + 15π/4b² + 128/3b³ to better than 0.06%, and the exact capture thresholds ±√27 at a★ = 0 and +2.11/−7.00 at a★ = 0.998 (test/physics)',
      fails:
        'within a few hundredths of the critical impact parameter the number of loops diverges logarithmically and the sweep cap is reached; the path drawn is then unfinished and the capture verdict comes from the exact threshold instead, which the ray reports as decidedBy: threshold',
    },
  ],
  outputs: [
    { id: 'horizon', says: 'the outer event horizon radius', fidelity: 'model-derived', units: 'm', from: ['horizons'] },
    { id: 'ergo', says: 'the static limit surface', fidelity: 'model-derived', units: 'm', from: ['ergosphere'] },
    { id: 'photon', says: 'the equatorial circular photon orbits, both senses', fidelity: 'model-derived', units: 'm', from: ['photon-orbit'] },
    { id: 'isco', says: 'the innermost stable circular orbit for the disc’s sense of rotation', fidelity: 'model-derived', units: 'm', from: ['isco'] },
    { id: 'efficiency', says: 'the fraction of infalling mass a disc can radiate', fidelity: 'model-derived', from: ['isco-energy'] },
    { id: 'shadow', says: 'the outline of the shadow on the observer’s sky', fidelity: 'model-derived', units: 'r_g', from: ['shadow'] },
    { id: 'rays', says: 'the path of each photon, and whether it escapes', fidelity: 'numerically-computed', from: ['geodesic', 'geodesic-2', 'rk4-null'] },
    { id: 'bcrit', says: 'the capture thresholds for both senses', fidelity: 'model-derived', units: 'r_g', from: ['bcrit'] },
    { id: 'disc-temperature', says: 'the observed temperature of each patch of the disc', fidelity: 'model-derived', units: 'K', from: ['ss-temperature', 'doppler', 'lapse', 'beta'] },
    { id: 'orbit-rate', says: 'how fast the gas goes round at each radius, and which way', fidelity: 'model-derived', units: 'rad/s', from: ['omega', 'drag'] },
    { id: 'hawking', says: 'the Hawking temperature, from the Kerr surface gravity', fidelity: 'model-derived', units: 'K', from: ['kappa'] },
    // The weakest parts, named as such. They are why the block's own fidelity is
    // conceptual: a reader looking at the disc's thickness is looking at a
    // drawing, and the figure must not tell them otherwise.
    { id: 'disc-thickness', says: 'how thick the disc is drawn', fidelity: 'conceptual' },
    // Split, because the two halves are not the same claim: how fast a parcel
    // goes round is computed from the Kerr orbital angular velocity, and WHICH
    // parcels are drawn — how many, where they start — is a choice about
    // legibility. One entry for both would have made a drawn sample look like a
    // simulation of the gas.
    { id: 'parcel-rate', says: 'how fast each parcel goes round, and which way', fidelity: 'model-derived', units: 'rad/s', from: ['omega'] },
    { id: 'parcels', says: 'which sample parcels are drawn, and where they start', fidelity: 'conceptual' },
  ],
  representations: [
    {
      id: 'horizon-wire',
      is: 'illustrative',
      shows: 'that the horizon is a sphere and not a hole punched in the page',
      notA:
        'a structure on the horizon: the horizon has no features, and the latitudes and meridians are drawn to make a ball read as a ball',
    },
    {
      id: 'disc-thickness',
      is: 'illustrative',
      shows: 'that the disc is a surface with a near and a far edge that can occlude',
      notA: 'the real thickness, which is far smaller than drawn and is not computed here',
    },
    {
      id: 'parcels',
      is: 'illustrative',
      shows:
        'the sense and rate of the flow: each parcel goes round at the computed Kerr rate for its own radius, so the inner ones visibly outrun the outer ones and reverse when the spin does',
      notA:
        'a count of anything or a simulation of the gas — how many parcels there are and where they start is a choice about legibility, and only their rate is computed',
      encodes: 'colour is the observed temperature of the ring the parcel sits in',
    },
    {
      id: 'rays',
      is: 'computed',
      shows: 'the integrated path of each photon',
      encodes:
        'a captured ray is rust-coloured and dashed; the ray nearest the aiming distance you chose is drawn heavier; a moving dot shows the direction of travel and not the speed of light',
    },
    {
      id: 'shadow',
      is: 'mathematical',
      shows: 'the outline of what is dark to a distant observer, from the Kerr shadow curve',
      notA: 'a surface at that radius — nothing is there; it is where light that came too close never came back',
    },
    {
      id: 'labels',
      is: 'illustrative',
      shows: 'the three marked radii as numbers',
      notA: 'part of the model: they are pushed apart on screen so they do not stack, so their positions are not to scale',
    },
  ],
  limitations: [
    'Off-equatorial motion is not modelled. A photon out of the plane obeys a third constant of motion (Carter’s Q) that nothing here computes.',
    'The disc image does not ray-trace. You are not seeing the far side of the disc lensed over the top of the hole, which is the most striking feature of a real image of one.',
    'The Hawking power and evaporation time are the Schwarzschild expressions; their spin corrections are a separate calculation and are not applied.',
    'The gas is test matter: no magnetic fields, no viscous heating beyond the Shakura–Sunyaev profile, no radiation transport, no jet.',
    'Nothing crosses the horizon in the figure. What happens inside is outside what this model computes, and the coordinates used could not describe it anyway.',
  ],
  references: [
    { id: 'kerr63', label: 'Kerr 1963', where: 'Phys. Rev. Lett. 11, 237', kind: 'paper', year: 1963, doi: '10.1103/PhysRevLett.11.237' },
    { id: 'bl67', label: 'Boyer & Lindquist 1967', where: 'J. Math. Phys. 8, 265', kind: 'paper', year: 1967, doi: '10.1063/1.1705193' },
    { id: 'bpt72', label: 'Bardeen, Press & Teukolsky 1972', where: 'Astrophys. J. 178, 347', kind: 'paper', year: 1972, doi: '10.1086/151796' },
    { id: 'bardeen73', label: 'Bardeen 1973', where: 'in Black Holes (Les Houches), ed. DeWitt & DeWitt, 215', kind: 'book', year: 1973 },
    { id: 'ss73', label: 'Shakura & Sunyaev 1973', where: 'Astron. Astrophys. 24, 337', kind: 'paper', year: 1973 },
    { id: 'nt73', label: 'Novikov & Thorne 1973', where: 'in Black Holes (Les Houches), 343', kind: 'book', year: 1973 },
    { id: 'mtw', label: 'Misner, Thorne & Wheeler 1973', where: 'Gravitation, ch. 33', kind: 'book', year: 1973 },
    { id: 'thorne74', label: 'Thorne 1974', where: 'Astrophys. J. 191, 507 — the a★ ≤ 0.998 limit', kind: 'paper', year: 1974, doi: '10.1086/152991' },
    { id: 'hawking75', label: 'Hawking 1975', where: 'Commun. Math. Phys. 43, 199', kind: 'paper', year: 1975, doi: '10.1007/BF02345020' },
    { id: 'luminet79', label: 'Luminet 1979', where: 'Astron. Astrophys. 75, 228 — the first image of a thin disc around a hole', kind: 'paper', year: 1979 },
    { id: 'chandra83', label: 'Chandrasekhar 1983', where: 'The Mathematical Theory of Black Holes, ch. 7', kind: 'book', year: 1983 },
    { id: 'eht19', label: 'EHT Collaboration 2019', where: 'Astrophys. J. Lett. 875, L1 — the measured shadow of M87*', kind: 'paper', year: 2019, doi: '10.3847/2041-8213/ab0ec7' },
  ],
};

// ════════════════════════════════════════════════════════════════════
// THE BIG BANG — a thermal history
// ════════════════════════════════════════════════════════════════════

export const BIG_BANG_SCIENCE: ScienceMeta = {
  name: 'FLRW thermal history',
  version: '1.1.0',
  domain: 'cosmology',
  fidelity: 'conceptual',
  coordinates: {
    system: 'comoving, with the scale factor a(t) normalised to 1 today',
    note: 'homogeneous and isotropic by assumption — there is no space here in which structure could form',
  },
  units: { times: 'seconds from the singularity; the timeline is logarithmic', note: 'temperatures in K, energies in eV' },
  observer: 'nobody in particular: this is the history of the whole, not a view from a place in it',
  equations: [
    {
      id: 'friedmann',
      text: 'H² = H₀²(Ω_r g(T) a⁻⁴ + Ω_m a⁻³ + Ω_Λ)',
      says: 'the expansion rate at each scale factor, with the radiation term tracking the species that are still relativistic',
      from: ['planck18'],
    },
    { id: 'temperature', text: 'T(a) = T₀/a, adjusted across each annihilation', says: 'the universe cools as it expands, in steps where a species drops out', from: ['kolb-turner'] },
    { id: 'saha', text: 'x²/(1 − x) = (1/η)(m_e k_B T/2πħ²)^{3/2} e^{−B/k_BT}/n_γ', says: 'the ionisation fraction, which is what fixes recombination', from: ['kolb-turner'] },
    { id: 'bbn', text: 'Y_p ≈ 2(n/p)/(1 + n/p) at freeze-out, with neutron decay in the delay', says: 'the primordial helium fraction, from the neutron-to-proton ratio', from: ['kolb-turner'] },
  ],
  constants: [
    { symbol: 'H₀', value: 67.66, units: 'km s⁻¹ Mpc⁻¹', source: 'Planck 2018 TT,TE,EE+lowE+lensing+BAO' },
    { symbol: 'Ω_m', value: 0.3111, units: 'dimensionless', source: 'Planck 2018' },
    { symbol: 'Ω_Λ', value: 0.6889, units: 'dimensionless', source: 'Planck 2018' },
    { symbol: 'T₀', value: 2.7255, units: 'K', source: 'FIRAS/COBE' },
    { symbol: 'η', value: 6.1e-10, units: 'dimensionless', source: 'baryon-to-photon ratio, Planck 2018' },
  ],
  parameters: [
    { id: 'h0', symbol: 'H₀', says: 'the expansion rate today', units: 'km s⁻¹ Mpc⁻¹', range: [60, 75], valid: [50, 90], outside: 'nothing in the equations breaks, but the value leaves what any measurement supports' },
    { id: 'om', symbol: 'Ω_m', says: 'the matter density', units: 'dimensionless', range: [0.1, 0.6], valid: [0, 1], outside: 'a closed or empty universe is a different history, and the epoch fits here assume neither' },
  ],
  initial: ['the integration starts at the earliest epoch the model is willing to draw and runs forward in log a'],
  boundary: ['Ω_r + Ω_m + Ω_Λ = 1 — flat, by assumption, not by fit'],
  assumptions: [
    'Homogeneous and isotropic at every time: this is a thermal history, not a structure simulation, and nothing here forms a galaxy.',
    'Flat geometry, with the three densities summing to one.',
    'The drawn sphere is the logarithm of the scale factor. It is not a size and the universe has no edge in it.',
  ],
  numerics: [
    {
      id: 'epoch-solve',
      method: 'closed-form Friedmann integration in log a, with Saha solved by bisection for recombination',
      stopsOn: ['reaching the present scale factor'],
      checkedAgainst: 'the age of the universe (13.8 Gyr), the CMB temperature, z of recombination ≈ 1100 and Y_p ≈ 0.245 (test/physics)',
    },
  ],
  outputs: [
    { id: 'expansion', says: 'the scale factor and expansion rate through time', fidelity: 'model-derived', from: ['friedmann', 'epoch-solve'] },
    { id: 'temperature', says: 'the temperature at each time', fidelity: 'model-derived', units: 'K', from: ['temperature'] },
    { id: 'recombination', says: 'when the universe became transparent', fidelity: 'model-derived', from: ['saha', 'epoch-solve'] },
    { id: 'helium', says: 'the primordial helium fraction', fidelity: 'model-derived', from: ['bbn'] },
    { id: 'early-epochs', says: 'anything before about a picosecond', fidelity: 'conceptual', from: ['friedmann'] },
    { id: 'sphere', says: 'the drawn extent of the universe', fidelity: 'conceptual' },
  ],
  representations: [
    { id: 'sphere', is: 'illustrative', shows: 'the logarithm of the scale factor, so ten orders of magnitude fit on a screen', notA: 'a size, an edge, or a place you could stand outside of' },
    { id: 'early-epochs', is: 'illustrative', shows: 'the electroweak era and earlier, drawn in a different ink because the physics is not settled', notA: 'a prediction — before roughly a picosecond this is extrapolation, and the timeline marks it as such rather than hiding it' },
  ],
  limitations: [
    'No structure formation, no perturbations, no baryon acoustic oscillations: the model is exactly homogeneous.',
    'Before about 10⁻¹² s the physics is not settled, and those epochs are drawn as speculative rather than computed.',
    'Neutrino masses are neglected; the radiation term treats them as massless throughout.',
  ],
  references: [
    { id: 'planck18', label: 'Planck Collaboration 2018 VI', where: 'Astron. Astrophys. 641, A6', kind: 'paper', year: 2020, doi: '10.1051/0004-6361/201833910' },
    { id: 'kolb-turner', label: 'Kolb & Turner 1990', where: 'The Early Universe, chs. 3–4', kind: 'book', year: 1990 },
  ],
};

// ════════════════════════════════════════════════════════════════════
// GRAVITY — n bodies, integrated
// ════════════════════════════════════════════════════════════════════

export const ORBIT_SCIENCE: ScienceMeta = {
  name: 'Newtonian n-body gravity',
  version: '1.1.0',
  domain: 'classical mechanics',
  // The trajectories and the drift are the simulation; the trail length behind
  // each body is a drawing choice, and that is the weakest part, so it sets what
  // the block may declare. The outputs below say which is which.
  fidelity: 'conceptual',
  coordinates: { system: 'inertial Cartesian, recentred on the barycentre' },
  units: { lengths: 'AU', times: 'days', note: 'masses in solar masses' },
  equations: [
    {
      id: 'gravity',
      text: 'a_i = Σ_j Gm_j(r_j − r_i)/(|r_j − r_i|² + ε²)^{3/2}',
      says: 'each body is pulled by every other, with a softening length so a close pass does not divide by zero',
      from: ['newton'],
    },
    { id: 'energy', text: 'E = Σ½m_iv_i² − Σ_{i<j} Gm_im_j/|r_i − r_j|', says: 'the total energy, which a good integrator nearly conserves', from: ['newton'] },
  ],
  constants: [{ symbol: 'G', value: 6.6743e-11, units: 'm³ kg⁻¹ s⁻²', source: 'CODATA 2018' }],
  parameters: [
    { id: 'speed', says: 'how many steps are watched per second', units: 'steps/s', range: [0, 4], valid: [0, 8], outside: 'the step SIZE never changes with this; only how fast you watch it' },
  ],
  initial: ['one of the presets: a two-body ellipse, a hierarchical triple, or the figure-eight three-body solution'],
  boundary: ['none — bodies are free to leave, and an ejected body keeps going'],
  assumptions: [
    'Point masses, Newtonian gravity, no relativity: a close pass that would precess measurably in reality does not here.',
    'The softening length ε is a numerical device, not a size: it keeps a near-collision finite and is reported with the setup.',
    'The step SIZE belongs to the setup. The speed control changes how many steps you watch, never how coarsely they are taken.',
  ],
  numerics: [
    {
      id: 'verlet',
      method: 'velocity Verlet at fixed step',
      order: 2,
      steps: 'fixed, set by the preset',
      stopsOn: ['the reader pausing it'],
      checkedAgainst: 'Kepler’s third law for the two-body preset and the closed figure-eight solution, plus the energy drift readout (test/physics)',
      fails: 'a genuinely close encounter, where a fixed step cannot resolve the acceleration and the drift readout rises visibly',
    },
  ],
  outputs: [
    { id: 'trajectories', says: 'where each body goes', fidelity: 'simulated', from: ['gravity', 'verlet'] },
    { id: 'drift', says: 'how much total energy the integration has lost or gained', fidelity: 'numerically-computed', from: ['energy', 'verlet'] },
    { id: 'trails', says: 'how much of each path is drawn behind a body', fidelity: 'conceptual' },
  ],
  representations: [
    { id: 'trails', is: 'illustrative', shows: 'where a body has been, so the shape of an orbit is legible at a glance', notA: 'anything physical — the length of a trail is a drawing choice' },
    { id: 'drift', is: 'computed', shows: 'the integrator marking its own work: the fractional change in total energy since the start', encodes: 'it rises when the step cannot resolve a close pass, which is the signal not to trust that part of the run' },
  ],
  limitations: [
    'Newtonian only: no precession from general relativity, no radiation of gravitational waves.',
    'Bodies are points, so no tides, no spin, no collisions — two bodies at the same place are softened rather than merged.',
  ],
  references: [
    { id: 'newton', label: 'Newton 1687', where: 'Principia, Book I', kind: 'book', year: 1687 },
    { id: 'chenciner-montgomery', label: 'Chenciner & Montgomery 2000', where: 'Ann. Math. 152, 881 — the figure-eight solution', kind: 'paper', year: 2000 },
  ],
};

// ── the registry ────────────────────────────────────────────────────

export const SURFACE_SCIENCE: Record<string, ScienceMeta> = {
  'black-hole': BLACK_HOLE_SCIENCE,
  'big-bang': BIG_BANG_SCIENCE,
  orbit: ORBIT_SCIENCE,
};

/**
 * The one-line model name, the assumptions and the equations a surface shows —
 * DERIVED from the block above rather than written beside it.
 *
 * This is the whole reason the block exists in one place. The surfaces used to
 * carry their own arrays, and an array beside the code is a claim nobody
 * re-reads: one of them said the rays were integrated in Schwarzschild for as
 * long as they were, and no test could have known. Now there is one statement,
 * the suite validates it, and a surface cannot disagree with its own model.
 */
export function modelSummary(meta: ScienceMeta): {
  model: string;
  assumptions: string[];
  equations: string[];
} {
  return {
    model: `${meta.name}${meta.coordinates ? ` — ${meta.coordinates.system}` : ''}`,
    // The limitations come first: a reader skimming a short list is best served
    // by what the model CANNOT do, which is the half that is easy to omit.
    assumptions: [...meta.limitations.slice(0, 3), ...meta.assumptions],
    equations: meta.equations.map((e) => e.text),
  };
}
