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

// ════════════════════════════════════════════════════════════════════
// MECHANISMS — parts, not features
// ════════════════════════════════════════════════════════════════════
//
// THE TEST THESE EXIST TO PASS. A single spring–mass–damper and a chain of three
// are the SAME MODEL with more rows: no new component, no new renderer, no new
// code path. If the second needed anything the first did not, the grammar would
// be a pair of demos wearing one name.

/** TEST 11 — one mass, one spring, one damper. The analytic case, so it can be checked. */
export function oscillator(): Model {
  return {
    id: 'oscillator',
    title: 'A mass on a spring, with damping',
    domain: 'mechanics',
    aspect: 'equal',
    equations: ['m ẍ + c ẋ + k x = F(t)', 'assembled from the parts rather than written out'],
    assumptions: [
      'One translational degree of freedom: the mass moves along the axis and nothing else.',
      'The spring is linear and the damper is viscous — both are the definitions of those parts here, not approximations to a measured one.',
      'x is displacement from rest, so the drawn rest position is a drawing choice and the displacement is computed.',
    ],
    params: [
      param('m', 'mass', 1, 0.1, 5, 'The mass. It sets how slowly the system responds to the same force.', 0.1),
      param('k', 'stiffness', 20, 1, 100, 'The spring constant. Raising it raises the natural frequency as √(k/m).', 1),
      param('c', 'damping', 0.6, 0, 12, 'The damping coefficient. Past 2√(km) the motion stops oscillating at all.', 0.1),
      param('x0', 'start', 1, -2, 2, 'Where the mass starts, as a displacement from rest.', 0.05),
      param('f0', 'drive', 0, 0, 20, 'The amplitude of a driving force. At zero the system is left to itself.', 0.5),
      param('w', 'drive rate', 4, 0.1, 20, 'How fast the driving force oscillates. Near √(k/m) it resonates.', 0.1),
    ],
    time: { t: 0, min: 0, max: 20, rate: 1, units: 's' },
    objects: [
      {
        id: 'mech',
        kind: 'component',
        label: 'The mechanism',
        meaning:
          'One body, one spring to the wall and one damper to the wall, assembled into equations of motion and integrated. Every part below is an object in its own right.',
        mechanism: {
          along: 'line',
          bodies: [{ id: 'm1', mass: 'm', x0: 'x0', v0: 0, label: 'the mass', at: 3 }],
          springs: [{ id: 'k1', between: ['m1', 'ground'], value: 'k', label: 'the spring' }],
          dampers: [{ id: 'c1', between: ['m1', 'ground'], value: 'c', label: 'the damper' }],
          forces: [{ id: 'f1', on: 'm1', expr: 'f0 * sin(w * t)', label: 'the driving force' }],
          dt: 0.004,
          steps: 5000,
        },
        depends: ['m', 'k', 'c', 'x0', 'f0', 'w'],
        provenance: { origin: 'computation', detail: 'assembled from the parts, then RK4 on the assembled system' },
      },
    ],
  };
}

/** TEST 12 — three masses in a chain. The same grammar, four springs, three dampers. */
export function chain(): Model {
  return {
    id: 'chain',
    title: 'Three masses on springs',
    domain: 'mechanics',
    aspect: 'equal',
    equations: ['M ẍ + C ẋ + K x = F(t) for three coupled degrees of freedom', 'assembled from the parts'],
    assumptions: [
      'Three translational degrees of freedom along one axis.',
      'Every spring and damper is linear; the couplings are what make the modes.',
      'Displacements are from each body’s own rest position.',
    ],
    params: [
      param('m', 'mass', 1, 0.2, 4, 'All three masses together, so the mode shapes stay legible.', 0.1),
      param('k', 'stiffness', 30, 1, 120, 'The stiffness of every spring.', 1),
      param('kc', 'coupling', 12, 0, 80, 'The stiffness of the two springs BETWEEN the masses. At zero they are three independent oscillators.', 1),
      param('c', 'damping', 0.3, 0, 8, 'The damping on each body.', 0.05),
      param('x0', 'first start', 1, -2, 2, 'How far the first mass is pulled before release. The others start at rest.', 0.05),
    ],
    time: { t: 0, min: 0, max: 24, rate: 1, units: 's' },
    objects: [
      {
        id: 'mech',
        kind: 'component',
        label: 'The chain',
        meaning:
          'Three bodies, four springs and three dampers. Six states — three displacements and three velocities — which the four-state trajectory primitive could not have expressed at all.',
        mechanism: {
          along: 'line',
          bodies: [
            { id: 'm1', mass: 'm', x0: 'x0', label: 'first mass', at: 2 },
            { id: 'm2', mass: 'm', x0: 0, label: 'second mass', at: 4 },
            { id: 'm3', mass: 'm', x0: 0, label: 'third mass', at: 6 },
          ],
          springs: [
            { id: 'k1', between: ['ground', 'm1'], value: 'k', label: 'wall to first' },
            { id: 'k2', between: ['m1', 'm2'], value: 'kc', label: 'first to second' },
            { id: 'k3', between: ['m2', 'm3'], value: 'kc', label: 'second to third' },
            { id: 'k4', between: ['m3', 'ground'], value: 'k', label: 'third to wall' },
          ],
          dampers: [
            { id: 'c1', between: ['ground', 'm1'], value: 'c', label: 'first damper' },
            { id: 'c2', between: ['m2', 'ground'], value: 'c', label: 'second damper' },
            { id: 'c3', between: ['m3', 'ground'], value: 'c', label: 'third damper' },
          ],
          dt: 0.004,
          steps: 6000,
        },
        depends: ['m', 'k', 'kc', 'c', 'x0'],
        provenance: { origin: 'computation', detail: 'assembled from the parts, then RK4 on the assembled system' },
      },
    ],
  };
}

// ════════════════════════════════════════════════════════════════════
// SYSTEMS THAT ARE NOT MECHANISMS — the same integrator, no new code
// ════════════════════════════════════════════════════════════════════

/** TEST 13 — an epidemic. Three states, no geometry, no springs: a system is a system. */
export function epidemic(): Model {
  return {
    id: 'epidemic',
    title: 'An epidemic, compartment by compartment',
    domain: 'epidemiology',
    equations: ['dS/dt = −βSI/N', 'dI/dt = βSI/N − γI', 'dR/dt = γI'],
    assumptions: [
      'The population mixes uniformly and is closed: nobody arrives, nobody leaves, and the three compartments always sum to N.',
      'One infectious period for everybody, with no age structure, no behaviour and no spatial spread.',
      'This is the textbook SIR model. It is a way of thinking about an epidemic, not a forecast of one.',
    ],
    params: [
      param('beta', 'transmission', 0.4, 0.05, 1.5, 'Contacts per day that would transmit. β/γ is the basic reproduction number.', 0.01),
      param('gamma', 'recovery', 0.1, 0.02, 0.6, 'The rate of leaving the infectious compartment: 1/γ is the mean infectious period in days.', 0.01),
      param('i0', 'initial cases', 10, 1, 1000, 'How many are infectious on day zero.', 1),
      param('n', 'population', 10000, 100, 1e6, 'The size of the closed population.', 100),
    ],
    time: { t: 0, min: 0, max: 200, rate: 8, units: 'days' },
    objects: [
      {
        id: 'sir',
        kind: 'system',
        label: 'The SIR system',
        meaning:
          'Three compartments and the flows between them, integrated. The total is declared as an invariant so the integration can be judged by whether it kept it.',
        system: {
          states: [
            { name: 'S', init: 'n - i0', units: 'people', means: 'still susceptible' },
            { name: 'I', init: 'i0', units: 'people', means: 'currently infectious' },
            { name: 'R', init: 0, units: 'people', means: 'recovered or removed' },
          ],
          rhs: {
            S: '0 - beta * S * I / n',
            I: 'beta * S * I / n - gamma * I',
            R: 'gamma * I',
          },
          observe: { total: 'S + I + R', incidence: 'beta * S * I / n' },
          invariant: 'total',
          dt: 0.05,
          steps: 4000,
          method: 'rk4',
        },
        // The phase plane the epidemiologist reads: susceptible against infectious.
        defs: { px: 'S', py: 'I' },
        depends: ['beta', 'gamma', 'i0', 'n'],
        fidelity: 'numerically-computed',
        provenance: { origin: 'computation', detail: 'RK4 on the stated compartment equations' },
      },
    ],
  };
}

/** TEST 14 — an RC–LC circuit. Inertia, restoring and dissipation again, with other names. */
export function circuit(): Model {
  return {
    id: 'circuit',
    title: 'A driven RLC loop',
    domain: 'electrical engineering',
    equations: ['L dq̈ + R q̇ + q/C = V(t)', 'written over the charge and the current'],
    assumptions: [
      'Lumped elements: the resistance, inductance and capacitance are each at a point, with no propagation along the wire.',
      'Linear components at every current — no saturation and no breakdown.',
      'The same three parts as a mass on a spring, which is why one integrator runs both.',
    ],
    params: [
      param('l', 'inductance', 1, 0.05, 5, 'The inductance, in henries. It plays the part mass plays in a mechanism.', 0.05),
      param('r', 'resistance', 0.5, 0, 10, 'The resistance, in ohms — the dissipative part.', 0.1),
      param('cap', 'capacitance', 0.05, 0.005, 1, 'The capacitance, in farads. 1/C is the restoring stiffness.', 0.005),
      param('v0', 'drive', 1, 0, 10, 'The amplitude of the driving voltage.', 0.1),
      param('w', 'drive rate', 4, 0.1, 30, 'How fast the source oscillates. Near 1/√(LC) it resonates.', 0.1),
    ],
    time: { t: 0, min: 0, max: 20, rate: 1, units: 's' },
    objects: [
      {
        id: 'loop',
        kind: 'system',
        label: 'The loop',
        meaning:
          'Charge and current as the two states. The equation is the mechanical one with the names changed, which is the point of having one grammar.',
        system: {
          states: [
            { name: 'q', init: 0, units: 'C', means: 'charge on the capacitor' },
            { name: 'i', init: 0, units: 'A', means: 'current round the loop' },
          ],
          rhs: {
            q: 'i',
            i: '(v0 * sin(w * t) - r * i - q / cap) / l',
          },
          observe: { energy: '0.5 * l * i^2 + 0.5 * q^2 / cap', voltage: 'v0 * sin(w * t)' },
          dt: 0.002,
          steps: 8000,
          method: 'rk4',
        },
        defs: { px: 'q', py: 'i' },
        depends: ['l', 'r', 'cap', 'v0', 'w'],
        fidelity: 'numerically-computed',
        provenance: { origin: 'computation', detail: 'RK4 on the loop equation' },
      },
    ],
  };
}

// ════════════════════════════════════════════════════════════════════
// ECONOMETRICS — the benchmark, and the method stays the person's
// ════════════════════════════════════════════════════════════════════
//
// SYNTHETIC DATA, SAID SO EVERYWHERE. These carry generated columns with known
// coefficients, because a benchmark needs an answer to be checked against and
// because presenting invented numbers as somebody's data would be the exact
// failure this architecture exists to prevent. Every data block says it is
// synthetic, and the provenance of every fitted coefficient says which dataset it
// came from.

/** Deterministic pseudo-random noise, so a benchmark is reproducible. */
function noise(n: number, scale: number, seed = 7): number[] {
  let x = seed;
  return Array.from({ length: n }, () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    const u = x / 2147483648;
    x = (x * 1103515245 + 12345) % 2147483648;
    const v = x / 2147483648;
    // Box–Muller, so the noise is normal rather than uniform.
    return scale * Math.sqrt(-2 * Math.log(Math.max(1e-12, u))) * Math.cos(2 * Math.PI * v);
  });
}

/** TEST 15 — the simple linear model. y = β₀ + β₁x + u, fitted to data. */
export function linearModel(): Model {
  const n = 120;
  const x = Array.from({ length: n }, (_, i) => 1 + (9 * i) / (n - 1));
  const u = noise(n, 1.2, 11);
  const y = x.map((v, i) => 2.5 + 0.8 * v + u[i]);
  return {
    id: 'linear-model',
    title: 'A simple linear model',
    domain: 'econometrics',
    equations: ['y = β₀ + β₁x + u'],
    assumptions: [
      'Linear in the parameters, and the errors are uncorrelated with x — which is the assumption that decides whether β₁ is more than an association.',
      'The data here is SYNTHETIC, generated with β₀ = 2.5 and β₁ = 0.8 so the estimate has a known answer to be checked against.',
      'The method is declared in the model: ordinary least squares. Changing it is a modelling decision, not a setting.',
    ],
    params: [],
    data: {
      sample: {
        label: 'Synthetic sample, generated with β₀ = 2.5, β₁ = 0.8 and normal noise',
        source: 'generated in lib/model/library.ts — not measured',
        columns: { x, y },
      },
    },
    objects: [
      {
        id: 'fit',
        kind: 'specification',
        label: 'y on x',
        meaning: 'The specification and its estimates: two coefficients, their standard errors, the residuals and R².',
        estimation: { method: 'ols', y: 'y', x: ['x'], data: 'sample' },
        fidelity: 'data-derived',
        provenance: { origin: 'dataset', detail: 'least squares on the synthetic sample' },
      },
      {
        id: 'scatter',
        kind: 'dataset',
        label: 'The observations',
        meaning: 'The sample itself, plotted. Everything the fit knows came from these points.',
        data: 'sample',
        // WHICH two columns, said by the model: a table has many possible
        // scatters and picking one silently would be picking what the figure is
        // about (see fromData in compile.ts).
        defs: { x: 'x', y: 'y' },
        fidelity: 'data-derived',
      },
    ],
  };
}

/** TEST 16 — several regressors, one of them a control. */
export function multivariateModel(): Model {
  const n = 200;
  const x1 = Array.from({ length: n }, (_, i) => 1 + (9 * i) / (n - 1));
  const x2 = noise(n, 2, 5).map((v, i) => 4 + v + 0.3 * x1[i]);
  const u = noise(n, 1, 23);
  const y = x1.map((v, i) => 1.2 + 0.5 * v - 0.9 * x2[i] + u[i]);
  return {
    id: 'multivariate-model',
    title: 'A multivariate linear model',
    domain: 'econometrics',
    equations: ['y = β₀ + β₁x₁ + β₂x₂ + u'],
    assumptions: [
      'x₂ is correlated with x₁ by construction, so the two coefficients are not what either would be alone — which is the whole reason for including a control.',
      'SYNTHETIC data, generated with β = (1.2, 0.5, −0.9).',
      'Interpreting β₁ as “holding x₂ constant” is a statement about this specification, not about the world.',
    ],
    params: [],
    data: {
      sample: {
        label: 'Synthetic sample, β = (1.2, 0.5, −0.9), with x₂ correlated with x₁',
        source: 'generated in lib/model/library.ts — not measured',
        columns: { x1, x2, y },
      },
    },
    objects: [
      {
        id: 'fit',
        kind: 'specification',
        label: 'y on x₁ and x₂',
        meaning: 'Both regressors at once, with robust standard errors, so the coefficient on x₁ is conditional on x₂.',
        estimation: { method: 'ols', y: 'y', x: ['x1', 'x2'], data: 'sample', robust: true },
        fidelity: 'data-derived',
        provenance: { origin: 'dataset', detail: 'least squares with HC1 standard errors' },
      },
      {
        id: 'simple',
        kind: 'specification',
        label: 'y on x₁ alone',
        meaning:
          'The same data with x₂ left out, kept so the two can be compared: the coefficient on x₁ moves, and the difference IS the confounding.',
        estimation: { method: 'ols', y: 'y', x: ['x1'], data: 'sample' },
        fidelity: 'data-derived',
        provenance: { origin: 'dataset', detail: 'least squares, one regressor' },
        relations: [{ to: 'fit', as: 'approximates', why: 'the same question with one fewer control' }],
      },
      {
        id: 'scatter',
        kind: 'dataset',
        label: 'y against x₁',
        meaning:
          'The raw pair, so the fitted coefficient on x₁ can be compared with what the eye sees — they differ, because the fit holds x₂ constant and the eye cannot.',
        data: 'sample',
        defs: { x: 'x1', y: 'y' },
        fidelity: 'data-derived',
      },
    ],
  };
}

/** TEST 17 — panel data: the same units through time, with unit effects. */
export function panelModel(): Model {
  const units = 12;
  const periods = 10;
  const unit: number[] = [];
  const time: number[] = [];
  const x: number[] = [];
  const y: number[] = [];
  const u = noise(units * periods, 0.6, 31);
  let row = 0;
  for (let i = 0; i < units; i++) {
    // A fixed effect per unit, deliberately correlated with x: pooled least
    // squares is then biased and the within estimate is not, which is what the
    // benchmark is for.
    const alpha = -3 + i * 0.7;
    for (let t = 0; t < periods; t++) {
      unit.push(i);
      time.push(t);
      const xv = 2 + 0.25 * alpha + 0.4 * t + noise(1, 0.5, 101 + row)[0];
      x.push(xv);
      y.push(alpha + 0.6 * xv + u[row]);
      row++;
    }
  }
  return {
    id: 'panel-model',
    title: 'A panel, with unit effects',
    domain: 'econometrics',
    equations: ['y_it = α_i + β x_it + u_it'],
    assumptions: [
      'Every unit has its own level α_i, and here it is correlated with x by construction — so pooling the data gives a different answer from the within estimate, and the difference is the point.',
      'SYNTHETIC data, generated with β = 0.6 and a unit effect that rises across units.',
      'Fixed effects remove what is constant within a unit. They do not remove what varies over time inside a unit, and nothing here claims they do.',
    ],
    params: [],
    data: {
      sample: {
        label: 'Synthetic panel: 12 units × 10 periods, β = 0.6, unit effects correlated with x',
        source: 'generated in lib/model/library.ts — not measured',
        columns: { unit, time, x, y },
      },
    },
    objects: [
      {
        id: 'within',
        kind: 'specification',
        label: 'Within units (fixed effects)',
        meaning:
          'Each unit’s own mean subtracted from its own rows, then least squares. The coefficient is about variation inside units.',
        estimation: { method: 'ols-fe', y: 'y', x: ['x'], data: 'sample', unit: 'unit', time: 'time' },
        fidelity: 'data-derived',
        provenance: { origin: 'dataset', detail: 'the within transform, then least squares' },
      },
      {
        id: 'pooled',
        kind: 'specification',
        label: 'Pooled (no unit effects)',
        meaning:
          'The same data with the unit ignored. Kept for the comparison: its coefficient is pulled by the between-unit differences.',
        estimation: { method: 'ols', y: 'y', x: ['x'], data: 'sample' },
        fidelity: 'data-derived',
        provenance: { origin: 'dataset', detail: 'least squares on the pooled rows' },
        relations: [{ to: 'within', as: 'contradicts', why: 'the two estimates disagree, and which one answers the question is a modelling choice' }],
      },
      {
        id: 'scatter',
        kind: 'dataset',
        label: 'Every observation',
        meaning:
          'All units and periods together. The cloud slopes more steeply than the within estimate, because it contains the differences between units as well as the variation inside them.',
        data: 'sample',
        defs: { x: 'x', y: 'y' },
        fidelity: 'data-derived',
      },
    ],
  };
}

/** TEST 18 — a time series, with its own past on the right-hand side. */
export function timeSeriesModel(): Model {
  const n = 160;
  const e = noise(n, 0.8, 47);
  const y: number[] = [];
  const t: number[] = [];
  for (let i = 0; i < n; i++) {
    t.push(i);
    const prev = i > 0 ? y[i - 1] : 5;
    y.push(1 + 0.7 * prev + 0.02 * i + e[i]);
  }
  return {
    id: 'time-series-model',
    title: 'A series against its own past',
    domain: 'econometrics',
    equations: ['y_t = c + φ y_{t−1} + δt + u_t'],
    assumptions: [
      'The past enters only through the lag included. Whether one lag is enough is a modelling judgement, and adding another is a different specification.',
      'SYNTHETIC data, generated with φ = 0.7 and a small trend.',
      'Nothing here tests for a unit root, for autocorrelation in the residuals, or for a structural break. Those are absent, not passed.',
    ],
    params: [],
    data: {
      sample: {
        label: 'Synthetic series of 160 periods, φ = 0.7 with a trend of 0.02 per period',
        source: 'generated in lib/model/library.ts — not measured',
        columns: { t, y },
      },
    },
    objects: [
      {
        id: 'ar1',
        kind: 'specification',
        label: 'One lag and a trend',
        meaning: 'Least squares with the previous period’s value and the period index as regressors.',
        estimation: { method: 'ols-lag', y: 'y', x: ['t'], data: 'sample', time: 't', lags: 1 },
        fidelity: 'data-derived',
        provenance: { origin: 'dataset', detail: 'least squares on the lagged series' },
      },
      {
        id: 'series',
        kind: 'series',
        label: 'The series itself',
        meaning: 'The observations in order, which is the representation a time series should keep.',
        data: 'sample',
        defs: { x: 't', y: 'y' },
        fidelity: 'data-derived',
      },
    ],
  };
}

/** TEST 19 — a specification with NO method, waiting on the person. */
export function openSpecification(): Model {
  const m = panelModel();
  return {
    ...m,
    id: 'open-specification',
    title: 'A question with the method still open',
    assumptions: [
      'The same panel as the fixed-effects benchmark, with NO method declared.',
      'This is what a model looks like before the methodological decision has been made: the data is here, the variables are identified, and nothing is estimated.',
      'Socria will not choose. It lists the candidates, what each one needs and what each one commits you to, and waits.',
    ],
    objects: [
      {
        id: 'open',
        kind: 'specification',
        label: 'y on x — method undecided',
        meaning:
          'A specification with no estimator chosen. The choice is the research, so it is the person’s: the alternatives and their assumptions are offered, and nothing is fitted until one is named.',
        estimation: { y: 'y', x: ['x'], data: 'sample', unit: 'unit', time: 'time' },
        fidelity: 'conceptual',
        provenance: { origin: 'user', detail: 'the variables identified; the method not yet chosen' },
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
  { id: 'oscillator', label: 'Mass, spring, damper', build: oscillator, tests: 'assembly from parts, two states, the analytic case' },
  { id: 'chain', label: 'Three masses on springs', build: chain, tests: 'the same grammar at six states — coupling, modes, no new code' },
  { id: 'epidemic', label: 'An epidemic (SIR)', build: epidemic, tests: 'three states, an invariant, a phase plane, no geometry' },
  { id: 'circuit', label: 'A driven RLC loop', build: circuit, tests: 'the mechanical equation with other names, on the same integrator' },
  { id: 'linear-model', label: 'Linear model', build: linearModel, tests: 'least squares against known coefficients, residuals, provenance' },
  { id: 'multivariate-model', label: 'Multivariate model', build: multivariateModel, tests: 'controls, robust errors, two specifications compared' },
  { id: 'panel-model', label: 'Panel with unit effects', build: panelModel, tests: 'the within transform against the pooled estimate' },
  { id: 'time-series-model', label: 'Series with a lag', build: timeSeriesModel, tests: 'lag construction, rows dropped and reported' },
  { id: 'open-specification', label: 'Method undecided', build: openSpecification, tests: 'the choice stays with the person; nothing is fitted' },
];

export function modelById(id: string): Model | null {
  return LIBRARY.find((m) => m.id === id)?.build() ?? null;
}
