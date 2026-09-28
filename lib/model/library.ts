// lib/model/library.ts
//
// THE BENCHMARK, AND IT IS DATA.
//
// Ten models that between them exercise every primitive the engine has:
// surfaces from expressions and from parametric maps, contours, cross
// sections, vector fields, integrated trajectories in two, three and four
// state components, position maps, polar and geographic coordinates, and
// supplied data. NOT ten components — there is no SaddleVisualizer and there
// will not be one. Each is a `Model`: objects with meanings, controls with
// ranges, and definitions as text, handed to the same compiler.
//
// THAT IS THE TEST. If a new domain needs a new renderer, the architecture has
// failed; the way to add one is to write another of these. The suite asserts
// what each produces (test/model-engine.test.mjs), which is how "general"
// stops being a claim in a comment.
//
// ON THE TWO THAT LOOK LIKE DATA AND ARE NOT. The volatility surface and the
// terrain are STATED FUNCTIONS, and both say so in their assumptions and carry
// `model-derived` rather than `data-derived`. Inventing an options chain or an
// elevation raster to make a demo look real would be exactly the fabrication
// this product refuses; a stated form exercises the same primitives and lies
// about nothing.

import type { Model } from './schema';

const param = (
  id: string,
  label: string,
  value: number,
  min: number,
  max: number,
  means?: string,
  step?: number
) => ({ id, label, value, min, max, ...(means ? { means } : {}), ...(step ? { step } : {}) });

/** TEST 1 — a saddle. Surfaces, axes, level sets, cross-sections. */
export function saddle(): Model {
  return {
    id: 'saddle',
    title: 'A saddle',
    domain: 'multivariable calculus',
    equations: ['z = a·x² − b·y²'],
    assumptions: ['Drawn over a square domain; the surface continues outside it.'],
    params: [
      param('a', 'a', 1, -2, 2, 'The curvature along x. Negative flips the saddle into a dome in that direction.'),
      param('b', 'b', 1, -2, 2, 'The curvature along y.'),
    ],
    layers: [
      { id: 'surface', label: 'Surface' },
      { id: 'levels', label: 'Level sets', on: false },
    ],
    objects: [
      {
        id: 'z',
        kind: 'surface',
        label: 'z = a·x² − b·y²',
        meaning:
          'The height of the surface above each point of the plane. Where the two curvatures have opposite signs the point at the origin is a saddle: a minimum along one direction and a maximum along the other.',
        definition: 'a*x^2 - b*y^2',
        over: { x: [-3, 3], y: [-3, 3] },
        depends: ['a', 'b'],
        layer: 'surface',
        fidelity: 'model-derived',
        provenance: { origin: 'equation' },
        appearance: 'the mesh, rising along one axis and falling along the other',
      },
      {
        id: 'origin',
        kind: 'point',
        label: 'Critical point',
        meaning: 'Where both partial derivatives vanish. It is a saddle rather than an extremum whenever a and b have the same sign.',
        value: 0,
        depends: ['a', 'b'],
        fidelity: 'model-derived',
        provenance: { origin: 'equation' },
        relations: [{ to: 'z', as: 'derived-from', why: 'it is a property of the surface, not a separate object' }],
      },
    ],
  };
}

/** TEST 2 — a torus. Parametric geometry, occlusion, camera. */
export function torus(): Model {
  return {
    id: 'torus',
    title: 'A torus',
    domain: 'geometry',
    equations: ['r(u, v) = ((R + c·cos v)·cos u, (R + c·cos v)·sin u, c·sin v)'],
    params: [
      param('r', 'R', 2, 0.6, 4, 'The distance from the centre of the hole to the centre of the tube.'),
      param('c', 'r', 0.7, 0.1, 2, 'The radius of the tube itself. Past R the torus intersects itself.'),
    ],
    objects: [
      {
        id: 'skin',
        kind: 'surface',
        label: 'The torus',
        meaning:
          'A surface of revolution: a circle of radius r swept around an axis at distance R. When r exceeds R it passes through itself, which the drawing shows rather than prevents.',
        defs: {
          px: '(r + c*cos(v))*cos(u)',
          py: '(r + c*cos(v))*sin(u)',
          pz: 'c*sin(v)',
        },
        over: { u: [0, 6.283185], v: [0, 6.283185] },
        depends: ['r', 'c'],
        detail: 44,
        fidelity: 'model-derived',
        provenance: { origin: 'equation' },
        appearance: 'the ring-shaped mesh',
      },
    ],
  };
}

/** TEST 3 — the field of a point charge. Vectors, parameter propagation. */
export function pointCharge(): Model {
  return {
    id: 'point-charge',
    title: 'The field of a point charge',
    domain: 'electromagnetism',
    equations: ['E = k·q·r̂ / r²'],
    assumptions: [
      'One stationary charge in empty space, in units where k = 1.',
      'Arrow length is clipped so the field is readable near the charge; direction is exact everywhere.',
    ],
    params: [param('q', 'charge', 1, -3, 3, 'The charge. Negative reverses every arrow.')],
    layers: [{ id: 'field', label: 'Field' }, { id: 'charge', label: 'Charge' }],
    objects: [
      {
        id: 'e',
        kind: 'field',
        label: 'Electric field',
        meaning:
          'The force per unit charge a test charge would feel at each point. It falls as the inverse square of distance, which is why the arrows near the charge are clipped rather than drawn to scale.',
        defs: {
          fx: 'q*x/(x^2 + y^2 + 0.04)^1.5',
          fy: 'q*y/(x^2 + y^2 + 0.04)^1.5',
        },
        over: { x: [-3, 3], y: [-3, 3] },
        depends: ['q'],
        detail: 40,
        layer: 'field',
        fidelity: 'model-derived',
        provenance: { origin: 'equation', detail: 'Coulomb’s law, softened at the origin so the singularity does not blank the picture' },
        appearance: 'the grid of arrows, pointing away from the charge when it is positive',
      },
      {
        id: 'source',
        kind: 'particle',
        label: 'The charge',
        meaning: 'The source of the field, at the origin.',
        value: 0,
        layer: 'charge',
        depends: ['q'],
        fidelity: 'conceptual',
        provenance: { origin: 'user' },
        relations: [{ to: 'e', as: 'causes', why: 'the field is the charge’s, and vanishes with it' }],
      },
    ],
  };
}

/** TEST 4 — a bivariate Gaussian. Statistical surface, covariance. */
export function bivariateGaussian(): Model {
  return {
    id: 'bivariate-gaussian',
    title: 'A bivariate normal density',
    domain: 'statistics',
    equations: [
      'f(x, y) = exp(−Q/2) / (2π·σx·σy·√(1−ρ²)), Q the standardised quadratic form',
    ],
    assumptions: ['A density, so the height is probability per unit area and the volume under it is one.'],
    params: [
      param('mx', 'μx', 0, -2, 2, 'The centre along x.'),
      param('my', 'μy', 0, -2, 2, 'The centre along y.'),
      param('sx', 'σx', 1, 0.3, 2, 'The spread along x.'),
      param('sy', 'σy', 1, 0.3, 2, 'The spread along y.'),
      param('rho', 'ρ', 0, -0.9, 0.9, 'The correlation. It tilts the ellipse of equal density; it is not a causal claim.'),
    ],
    layers: [{ id: 'density', label: 'Density' }, { id: 'levels', label: 'Contours', on: false }],
    objects: [
      {
        id: 'f',
        kind: 'surface',
        label: 'The density',
        meaning:
          'Probability per unit area. Its contours are ellipses; ρ rotates them, and the two σ set their widths.',
        definition:
          'exp(-(((x-mx)/sx)^2 - 2*rho*((x-mx)/sx)*((y-my)/sy) + ((y-my)/sy)^2)/(2*(1-rho^2)))/(6.283185*sx*sy*sqrt(1-rho^2))',
        over: { x: [-4, 4], y: [-4, 4] },
        depends: ['mx', 'my', 'sx', 'sy', 'rho'],
        detail: 56,
        layer: 'density',
        fidelity: 'model-derived',
        provenance: { origin: 'equation' },
        appearance: 'the single hill; its footprint is an ellipse whose tilt is the correlation',
      },
    ],
  };
}

/**
 * TEST 5 — a volatility surface, σ(K, T).
 *
 * A STATED FORM, NOT A MARKET. The smile is a simple parameterisation with
 * named parameters, which exercises exactly the primitives a real surface
 * would (a quantity over two others, sliced at a maturity) without inventing
 * an options chain. A model built from a real chain would carry a data block
 * and come back `data-derived`; this one says what it is.
 */
export function volatilitySurface(): Model {
  return {
    id: 'vol-surface',
    title: 'An implied volatility surface',
    domain: 'quantitative finance',
    equations: ['σ(K, T) = base + skew·ln(K/F)/√T + smile·ln(K/F)²'],
    assumptions: [
      'A STATED functional form with named parameters — not market data, and not a calibration to any.',
      'The forward is held at 100; strikes and maturities are the axes.',
      'Nothing here is a price, a recommendation or a view.',
    ],
    params: [
      param('base', 'level', 0.2, 0.05, 0.6, 'The at-the-money level the whole surface sits at.'),
      param('skew', 'skew', -0.08, -0.4, 0.4, 'How much cheaper or dearer downside strikes are, per unit of log-moneyness.'),
      param('smile', 'smile', 0.06, 0, 0.4, 'The curvature: how volatility rises away from the money in both directions.'),
    ],
    layers: [{ id: 'surface', label: 'Surface' }],
    objects: [
      {
        id: 'sigma',
        kind: 'surface',
        label: 'σ(K, T)',
        meaning:
          'Implied volatility as a function of strike and maturity, under the stated form. A slice at one maturity is the smile; a slice at one strike is the term structure.',
        definition: 'base + skew*log(x/100)/sqrt(y) + smile*log(x/100)^2',
        over: { x: [60, 160], y: [0.08, 2] },
        depends: ['base', 'skew', 'smile'],
        detail: 48,
        layer: 'surface',
        fidelity: 'model-derived',
        provenance: { origin: 'equation', detail: 'the parameterisation stated above, with no market input' },
        appearance: 'the sheet rising away from the money, steeper at the short end',
      },
      { id: 'k', kind: 'axis', label: 'strike' },
      { id: 't', kind: 'axis', label: 'maturity (years)' },
      { id: 'v', kind: 'axis', label: 'implied vol' },
    ],
  };
}

/**
 * TEST 6 — terrain in geographic coordinates.
 *
 * Again a STATED function, over longitude and latitude, to exercise the
 * geographic coordinate system and the layering. Real terrain arrives as a
 * data block from a source that is named; this one carries no elevation claim
 * about anywhere on Earth.
 */
export function terrain(): Model {
  return {
    id: 'terrain',
    title: 'A surface over geographic coordinates',
    domain: 'earth science',
    equations: ['h(λ, φ) = amp·(sin(k·λ)·cos(k·φ) + 0.4·sin(2.7·k·λ))'],
    assumptions: [
      'A STATED function of longitude and latitude — not measured elevation, and not anywhere in particular.',
      'Longitude is scaled by cos(latitude) so a degree east and a degree north are drawn the same length locally.',
    ],
    params: [
      param('amp', 'relief', 400, 0, 2000, 'The vertical scale, in metres of the stated function.'),
      param('k', 'roughness', 1.6, 0.2, 4, 'How many undulations per degree.'),
      param('ex', 'exaggeration', 1, 0.2, 6, 'Vertical exaggeration — a drawing choice, not a measurement.'),
    ],
    layers: [{ id: 'relief', label: 'Relief' }],
    objects: [
      {
        id: 'h',
        kind: 'surface',
        label: 'Elevation',
        meaning:
          'The stated height at each point of the ground plane, drawn with the vertical exaggerated by the control of that name.',
        definition: 'ex*amp*(sin(k*x)*cos(k*y) + 0.4*sin(2.7*k*x))',
        over: { x: [-2, 2], y: [-2, 2] },
        depends: ['amp', 'k', 'ex'],
        detail: 52,
        layer: 'relief',
        fidelity: 'model-derived',
        provenance: { origin: 'equation' },
        meta: { coordinates: 'geographic' },
        appearance: 'the relief; its height is exaggerated by the control and is not a measured elevation',
      },
    ],
  };
}

/** TEST 7 — a double pendulum. Four state components and a position map. */
export function doublePendulum(): Model {
  // The equations of motion for equal masses and equal lengths, written over
  // the state (θ₁, ω₁, θ₂, ω₂) = (x, y, z, w). Long, and stated in full rather
  // than approximated, because an approximation drawn as a chaotic trajectory
  // would be indistinguishable from the real thing and wrong.
  const den1 = '(2 - cos(2*x - 2*z))';
  const dOmega1 =
    `(-g*(2)*sin(x) - g*sin(x - 2*z) - 2*sin(x - z)*(w^2 + y^2*cos(x - z)))/${den1}`;
  const dOmega2 =
    `(2*sin(x - z)*(2*y^2 + 2*g*cos(x) + w^2*cos(x - z)))/${den1}`;
  return {
    id: 'double-pendulum',
    title: 'A double pendulum',
    domain: 'classical mechanics',
    equations: ['θ̈₁ and θ̈₂ for equal masses and equal lengths, integrated as a first-order system'],
    assumptions: [
      'Equal masses, equal unit lengths, no friction, g as set.',
      'Sensitive to its initial angles: two nearby starts diverge, which is the point of the test rather than a defect.',
    ],
    params: [
      param('g', 'gravity', 9.81, 1, 20, 'The gravitational acceleration.'),
      param('x0', 'θ₁ start', 2.2, -3.14, 3.14, 'The first arm’s starting angle, from straight down.'),
      param('z0', 'θ₂ start', 2.4, -3.14, 3.14, 'The second arm’s starting angle.'),
    ],
    time: { t: 0, min: 0, max: 20, rate: 1, units: 's' },
    objects: [
      {
        id: 'path',
        kind: 'trajectory',
        label: 'The path of the lower bob',
        meaning:
          'Where the end of the second arm has actually been. It is integrated step by step because no formula produces it — that is what makes the system chaotic rather than merely complicated.',
        defs: {
          dx: 'y',
          dy: dOmega1,
          dz: 'w',
          dw: dOmega2,
          // The state is angles; a position is not an angle. The map from one
          // to the other is stated here, in the model, and evaluated per step.
          px: 'sin(x) + sin(z)',
          py: '0 - cos(x) - cos(z)',
        },
        depends: ['g', 'x0', 'z0'],
        meta: { dt: 0.004, steps: 4000 },
        fidelity: 'numerically-computed',
        provenance: { origin: 'computation', detail: 'Runge–Kutta 4 on the stated equations of motion' },
        appearance: 'the tangled curve the lower bob traces out',
      },
    ],
  };
}

/** TEST 8 — a two-body orbit. State (x, vx, y, vy) with a stated position map. */
export function orbit(): Model {
  return {
    id: 'orbit',
    title: 'A two-body orbit',
    domain: 'orbital mechanics',
    equations: ['r̈ = −μ r / |r|³'],
    assumptions: [
      'One body orbiting a fixed centre — the central mass does not move.',
      'Units are the model’s own: μ sets the strength, and the orbit follows from it and the starting speed.',
    ],
    params: [
      param('mu', 'μ', 1, 0.2, 4, 'The gravitational parameter of the central body.'),
      param('r0', 'start radius', 1, 0.4, 3, 'How far out the body starts.'),
      param('v0', 'start speed', 1, 0.2, 2.2, 'Its speed across the line to the centre. At √(μ/r₀) the orbit closes into a circle.'),
    ],
    time: { t: 0, min: 0, max: 40, rate: 1 },
    objects: [
      {
        id: 'path',
        kind: 'trajectory',
        label: 'The orbit',
        meaning:
          'The path the body actually takes under an inverse-square attraction, integrated forward. A closed ellipse means the integration is conserving what it should.',
        defs: {
          dx: 'y',
          dy: '0 - mu*x/(x^2 + z^2)^1.5',
          dz: 'w',
          dw: '0 - mu*z/(x^2 + z^2)^1.5',
          px: 'x',
          py: 'z',
          // The starting state, as expressions in the controls: out along x at
          // the start radius, moving across at the start speed.
          x0: 'r0',
          y0: '0',
          z0: '0',
          w0: 'v0',
        },
        depends: ['mu', 'r0', 'v0'],
        meta: { dt: 0.01, steps: 4000 },
        fidelity: 'numerically-computed',
        provenance: { origin: 'computation', detail: 'Runge–Kutta 4' },
        appearance: 'the closed curve around the centre',
      },
      {
        id: 'centre',
        kind: 'particle',
        label: 'The central body',
        meaning: 'Held fixed at the origin by assumption; a real two-body system would have both moving about their barycentre.',
        value: 0,
        fidelity: 'conceptual',
        provenance: { origin: 'user' },
      },
    ],
  };
}

/** TEST 9 — the Lorenz attractor. Three states, chaos, initial conditions. */
export function lorenz(): Model {
  return {
    id: 'lorenz',
    title: 'The Lorenz system',
    domain: 'dynamical systems',
    equations: ['ẋ = σ(y − x)', 'ẏ = x(ρ − z) − y', 'ż = xy − βz'],
    assumptions: [
      'A truncation of thermal convection, not a model of weather.',
      'Two starts a thousandth apart separate within a few seconds; the picture is one trajectory, not the attractor itself.',
    ],
    params: [
      param('sigma', 'σ', 10, 1, 20, 'The Prandtl number of the truncation.'),
      param('rho', 'ρ', 28, 1, 50, 'Below about 24.7 the trajectory settles; above it, it does not.'),
      param('beta', 'beta', 2.667, 0.5, 5, 'The geometric factor.'),
      param('x0', 'x₀', 1, -20, 20, 'Where the trajectory starts. Move it a little and see how long the two paths stay together.'),
    ],
    objects: [
      {
        id: 'path',
        kind: 'trajectory',
        label: 'The trajectory',
        meaning:
          'One solution, integrated forward from the starting point. The two lobes are not drawn — they are where this curve goes.',
        defs: {
          dx: 'sigma*(y - x)',
          dy: 'x*(rho - z) - y',
          dz: 'x*y - beta*z',
          y0: '1',
          z0: '1',
        },
        depends: ['sigma', 'rho', 'beta', 'x0'],
        meta: { dt: 0.006, steps: 5000 },
        fidelity: 'numerically-computed',
        provenance: { origin: 'computation', detail: 'Runge–Kutta 4 at dt = 0.006' },
        appearance: 'the double-lobed curve',
      },
    ],
  };
}

/**
 * TEST 10 — light past a black hole, in polar coordinates.
 *
 * The geodesic as a two-state system in u = 1/r against the angle, which is
 * the ordinary way to integrate it — and the position map turns (u, φ) into a
 * place. Nothing in the engine knows what a photon is: it integrates what the
 * model states and draws it where the model says.
 */
export function photonPath(): Model {
  return {
    id: 'photon-path',
    title: 'A light ray past a mass',
    domain: 'general relativity',
    equations: ['d²u/dφ² + u = 3u², with u = 1/r'],
    assumptions: [
      'Schwarzschild geometry, equatorial, in geometric units where GM/c² = 1 — so the horizon is at r = 2 and the critical aiming distance is 3√3 ≈ 5.196.',
      'Aimed closer than that, the ray is captured; the integration stops at the horizon rather than continuing past it, because a number produced past the end of a trajectory is not a result.',
      'Integrated in u against the angle, which is the ordinary way to do it and the reason the position map below turns (u, φ) into a place.',
    ],
    params: [
      param('b', 'aiming distance', 8, 2, 20, 'How far off centre the ray is aimed, in units of GM/c². Below 3√3 ≈ 5.196 it cannot get back out.'),
      param('r0', 'start radius', 30, 12, 80, 'How far out the ray starts. Far enough that it is travelling in a straight line when it does.'),
    ],
    objects: [
      {
        id: 'ray',
        kind: 'trajectory',
        label: 'The ray',
        meaning:
          'A null geodesic, integrated as u(φ). The bend is a result of the integration and not a drawn curve; how far it bends is set by the aiming distance alone. Aimed inside 3√3 it does not come back.',
        defs: {
          dx: 'y',
          dy: '3*x^2 - x',
          // (u, φ) → the plane. r is 1/u, and φ is the independent variable.
          px: 'cos(t)/x',
          py: 'sin(t)/x',
          // THE STARTING STATE IS THE PHYSICS, NOT A GUESS. At the start
          // radius u is 1/r₀, and the null condition (u′)² = 1/b² − u²(1−2u)
          // fixes how fast u is changing — so the aiming distance, and
          // nothing else, decides how far this ray bends.
          x0: '1/r0',
          y0: 'sqrt(max(1/b^2 - (1/r0)^2*(1 - 2/r0), 0.000001))',
          // It has ended when it crosses the horizon (u ≥ 1) or when it is
          // back out past where it began (u ≤ 1/r₀ again, on the way out).
          // Crossed the horizon (u ≥ ½, which is r ≤ 2), or back out past
          // twice where it began.
          stop: 'max(x - 0.5, 0.5/r0 - x)',
        },
        depends: ['b', 'r0'],
        meta: { dt: 0.002, steps: 4000 },
        fidelity: 'numerically-computed',
        provenance: { origin: 'computation', detail: 'Runge–Kutta 4 on the geodesic equation' },
        appearance: 'the curve sweeping past the centre, bent toward it',
      },
      {
        id: 'horizon',
        kind: 'curve',
        label: 'Horizon',
        meaning:
          'The Schwarzschild radius, drawn as a circle of radius 1 in these units. It is a boundary of the geometry, not an object the ray can touch.',
        defs: { px: 'cos(6.283185*s)', py: 'sin(6.283185*s)' },
        over: { s: [0, 1] },
        fidelity: 'model-derived',
        provenance: { origin: 'equation' },
        appearance: 'the small circle at the centre',
      },
    ],
  };
}

/** Every benchmark, by id — what the bench page lists and the suite walks. */
export const LIBRARY: { id: string; label: string; build: () => Model; tests: string }[] = [
  { id: 'saddle', label: 'Saddle surface', build: saddle, tests: 'surfaces, axes, level sets, cross-sections' },
  { id: 'torus', label: 'Torus', build: torus, tests: 'parametric geometry, occlusion, camera' },
  { id: 'point-charge', label: 'Point charge', build: pointCharge, tests: 'vector fields, clipping, parameter propagation' },
  { id: 'bivariate-gaussian', label: 'Bivariate normal', build: bivariateGaussian, tests: 'statistical surface, five controls, contours' },
  { id: 'vol-surface', label: 'Volatility surface', build: volatilitySurface, tests: 'a quantity over two others, slicing to 2D' },
  { id: 'terrain', label: 'Terrain', build: terrain, tests: 'geographic coordinates, exaggeration, layers' },
  { id: 'double-pendulum', label: 'Double pendulum', build: doublePendulum, tests: 'four states, a position map, time' },
  { id: 'orbit', label: 'Two-body orbit', build: orbit, tests: 'state evolution, closure as a check on the integrator' },
  { id: 'lorenz', label: 'Lorenz attractor', build: lorenz, tests: 'ODE integration, chaos, initial conditions' },
  { id: 'photon-path', label: 'Light past a mass', build: photonPath, tests: 'polar position map, integrated geodesic' },
];

export function modelById(id: string): Model | null {
  return LIBRARY.find((m) => m.id === id)?.build() ?? null;
}
