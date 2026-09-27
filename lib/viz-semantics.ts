// lib/viz-semantics.ts
//
// WHAT EACH THING ON A SURFACE IS — the registries the conversation reads.
//
// WHY IT IS SEPARATE FROM THE SURFACES. A surface is a render function: it
// turns numbers into SVG sixty times a second, and none of that is a place to
// keep sentences. Meaning does not change per frame — the accretion disc is an
// accretion disc whether or not the camera moved — so it is declared once,
// here, as plain data that a test can read and a reviewer can check. Only the
// handful of facts that really are live ("2 of 6 captured") are filled in by
// the render, through `SurfaceRender.live`.
//
// THE RULE THIS FILE KEEPS. Every entry says how its object was obtained, and
// says it honestly. The light rays are integrated null geodesics and say so.
// The disc's geometry is a drawn set of rings — flared, depth-sorted, but
// drawn — while its COLOUR is computed from a temperature; the entry says both,
// because a reader who is told "the disc is computed" will reasonably think
// the shape of it means something.
//
// WHY `appearance` MATTERS MORE THAN IT LOOKS. "What's the blue?" is the
// question that started this. Somebody who does not yet have the vocabulary
// points with a colour, a position or a shape, and an assistant that cannot
// turn "the blue" into an object answers with a hedge. Every entry carries the
// words a person would actually use.

import type { VizEntity } from './viz-model';
import type { VizObject, VizScene, Tone } from './logos-viz';

/** The black hole, as it is actually drawn (components/surfaces/BlackHoleSurface.tsx). */
export const BLACK_HOLE_ENTITIES: VizEntity[] = [
  {
    id: 'horizon',
    type: 'boundary',
    label: 'Event horizon',
    meaning:
      'The surface of no return: the radius inside which every future path leads inward. It is drawn as a sphere rather than a filled circle because it is one.',
    from: 'closed-form',
    model: 'Kerr (Boyer–Lindquist), reducing to Schwarzschild at spin 0',
    depends: ['m', 'spin'],
    appearance:
      'the solid black ball at the centre, with a faint wireframe of latitudes and meridians on the half facing you',
    layer: undefined,
    relations: ['Everything else on the screen is measured in units of its Schwarzschild radius.'],
  },
  {
    id: 'shadow',
    type: 'boundary',
    label: 'Shadow (capture radius)',
    meaning:
      'How large the hole looks to a distant observer — √27 GM/c², about 2.6 Schwarzschild radii. It is bigger than the horizon because light passing near is bent into it.',
    from: 'closed-form',
    depends: ['m', 'spin'],
    appearance: 'a faint dashed circle noticeably wider than the black ball',
    relations: ['A ray aimed inside this radius cannot get back out.'],
  },
  {
    id: 'disc',
    type: 'surface',
    label: 'Accretion disc',
    meaning:
      'The gas spiralling in, drawn as fourteen flared rings between the innermost stable orbit and the outer radius you set. The SHAPE is drawn geometry; the colour and brightness are computed.',
    from: 'closed-form',
    model: 'Shakura–Sunyaev temperature profile, with Doppler beaming and gravitational redshift applied per patch',
    depends: ['tilt', 'outer', 'edd', 'm', 'spin'],
    appearance:
      'the broad pale-blue ellipse, the widest thing on screen — blue because the computed temperature near the inner edge is of order 10⁵ K and that temperature is converted to its blackbody colour; the side coming toward you is brighter because of relativistic beaming, not because of lighting',
    layer: 'disc',
    relations: [
      'Its inner edge sits at the ISCO, so spin moves it.',
      'It is not a solid object and it is not to scale in thickness.',
    ],
  },
  {
    id: 'matter',
    type: 'body',
    label: 'Gas parcels',
    meaning:
      'Sample parcels of the disc, each carried round at the Keplerian rate for its own radius and dragged faster by spin. They are a sample of the flow, not a count of anything.',
    from: 'closed-form',
    depends: ['matter', 'outer', 'spin'],
    appearance: 'small dots moving within the disc, coloured like the ring they sit in',
    layer: 'matter',
  },
  {
    id: 'rays',
    type: 'trajectory',
    label: 'Light rays',
    meaning:
      'Photon paths, each one integrated as a null geodesic — d²u/dφ² + u = 3u² by Runge–Kutta — not drawn as a bent curve. Where one ends inside the capture radius it was captured, and it is drawn differently.',
    from: 'integrated',
    model: 'Schwarzschild null geodesics in the equatorial plane',
    depends: ['rays', 'spread', 'bsel'],
    appearance:
      'the dark olive-green curves sweeping past the hole; a captured one is rust-coloured and dashed, and the one nearest your chosen aiming distance is drawn heavier',
    layer: 'rays',
    relations: ['A moving dot runs along each path to show its direction.'],
  },
  {
    id: 'photon',
    type: 'boundary',
    label: 'Photon sphere',
    meaning:
      'Where light can orbit — 1.5 Schwarzschild radii for a non-spinning hole. Drawn as two great circles so it reads as a sphere.',
    from: 'closed-form',
    depends: ['m'],
    appearance: 'the gold dashed circle',
    layer: 'photon',
    relations: ['It is INSIDE the capture radius at 2.6 r: the two are different things and are often confused.'],
  },
  {
    id: 'isco',
    type: 'boundary',
    label: 'ISCO',
    meaning:
      'The innermost stable circular orbit: closer in than this, no circular orbit is stable and matter falls. 3 Schwarzschild radii at spin 0, moving inward with prograde spin and outward against it.',
    from: 'closed-form',
    model: 'Bardeen–Press–Teukolsky root',
    depends: ['spin', 'm'],
    appearance: 'the thin teal ring around the hole, inside the disc',
    layer: 'isco',
    relations: ['It sets where the disc can begin, which is why spin changes the disc temperature.'],
  },
  {
    id: 'ergo',
    type: 'region',
    label: 'Ergosphere',
    meaning:
      'The region outside the horizon where nothing can stand still: spacetime itself is dragged round. It exists only when the hole is spinning, and is drawn only then.',
    from: 'closed-form',
    depends: ['spin'],
    appearance: 'a rust-coloured dashed outline, flattened at the poles',
    layer: 'ergo',
  },
  {
    id: 'labels',
    type: 'label',
    label: 'Radius labels',
    meaning:
      'The three printed radii — horizon, photon orbit, ISCO — each pushed out from its own surface so they do not stack on one another.',
    from: 'closed-form',
    layer: 'labels',
  },
];

/** The Big Bang surface (components/surfaces/BigBangSurface.tsx). */
export const BIG_BANG_ENTITIES: VizEntity[] = [
  {
    id: 'shell',
    type: 'surface',
    label: 'Expansion shells',
    meaning:
      'Three great circles whose radius tracks the LOG of the scale factor, with a few earlier shells left behind as a wake. The log is deliberate: a grows by 10³² across this history and a linear radius would be unwatchable.',
    from: 'illustrative',
    depends: ['logA'],
    appearance: 'the thin circles making a sphere, growing as the clock runs',
    layer: 'shell',
    relations: ['It shows the ORDER of magnitude of the expansion, not a physical size.'],
  },
  {
    id: 'content',
    type: 'body',
    label: 'What exists at this moment',
    meaning:
      'A sample of the particle content at the current temperature — which species are present is computed from kT against their thresholds, and once nuclei exist the mixture is the computed primordial one.',
    from: 'closed-form',
    depends: ['logA', 'n', 'om', 'ol', 'h0'],
    appearance:
      'the scattered coloured dots inside the shell; colour is the particle family (quarks rust, leptons blue, photons gold, neutrinos teal) and, once there are nuclei, the element colour a chemist would read',
    layer: 'particles',
  },
  {
    id: 'fog',
    type: 'region',
    label: 'Opacity',
    meaning:
      'A wash over the whole sphere while the universe is still opaque — before last scattering, light cannot cross it, which is why nothing can be seen from earlier than that.',
    from: 'closed-form',
    depends: ['om', 'ol', 'h0', 'logA'],
    appearance: 'a faint tinted disc behind everything, present only in the early eras',
    layer: 'particles',
  },
  {
    id: 'timeline',
    type: 'axis',
    label: 'Timeline',
    meaning:
      'The history as one axis in log scale factor, ticked at each epoch. Ticks for speculative eras are drawn differently from established ones.',
    from: 'closed-form',
    appearance: 'the horizontal line along the bottom with tick marks',
    layer: 'track',
  },
  {
    id: 'head',
    type: 'marker',
    label: 'Where you are',
    meaning: 'The dot on the timeline marking the moment currently being shown.',
    from: 'closed-form',
    depends: ['logA'],
    appearance: 'the filled dot on the bottom axis',
    layer: 'track',
  },
];

/** The gravity sandbox (components/surfaces/GravitySurface.tsx). */
export const GRAVITY_ENTITIES: VizEntity[] = [
  {
    id: 'bodies',
    type: 'body',
    label: 'Bodies',
    meaning:
      'The masses being integrated. Their positions come from velocity-Verlet stepping of Newtonian gravity with softening — there is no formula producing these paths; they are computed one step at a time.',
    from: 'integrated',
    model: 'Newtonian N-body, velocity Verlet (symplectic), softened',
    depends: ['preset', 'speed', 'rate'],
    appearance: 'the filled circles, sized by the cube root of mass and coloured one per body',
    layer: 'bodies',
  },
  {
    id: 'trails',
    type: 'trajectory',
    label: 'Trails',
    meaning: 'Where each body has actually been, kept to the length you set. The trail is the record of the integration, not a fitted curve.',
    from: 'integrated',
    depends: ['trail'],
    appearance: 'the thin coloured paths behind each body',
    layer: 'trails',
  },
  {
    id: 'com',
    type: 'marker',
    label: 'Barycentre',
    meaning:
      'The centre of mass of the whole system. In an isolated system it should not accelerate, which makes it a check on the integration as much as a feature of it.',
    from: 'closed-form',
    appearance: 'the small cross',
    layer: 'com',
  },
];

export const SURFACE_ENTITIES: Record<string, VizEntity[]> = {
  'black-hole': BLACK_HOLE_ENTITIES,
  'big-bang': BIG_BANG_ENTITIES,
  orbit: GRAVITY_ENTITIES,
};

/** What each surface is actually solving, and what it holds fixed. */
export const SURFACE_MODEL: Record<
  string,
  { model: string; assumptions: string[]; equations: string[] }
> = {
  'black-hole': {
    model: 'Kerr geometry, equatorial; Shakura–Sunyaev disc',
    assumptions: [
      'The light rays are integrated in the Schwarzschild metric, so spin bends the geometry of the marked radii but not the ray paths.',
      'The disc is optically thick and geometrically thin, and its drawn thickness is for legibility rather than to scale.',
      'Lengths are in Schwarzschild radii; the mass slider scales all of them together.',
    ],
    equations: [
      'd²u/dφ² + u = 3u² (null geodesics, u = 1/r)',
      'T(r) from Shakura–Sunyaev with the Eddington rate',
      'δ = 1/[γ(1 − β cos θ)], brightness ∝ δ⁴',
    ],
  },
  'big-bang': {
    model: 'FLRW, Friedmann equation with a relativistic degrees-of-freedom staircase',
    assumptions: [
      'Homogeneous and isotropic throughout — this is a thermal history, not a structure simulation.',
      'The drawn sphere is the log of the scale factor, not a size.',
      'Anything before about a picosecond is extrapolation, and the timeline marks those epochs as speculative rather than hiding them.',
    ],
    equations: [
      'H² = H₀²(Ω_r a⁻⁴ + Ω_m a⁻³ + Ω_Λ)',
      'T(a) = T₀/a, with g*(T)',
      'Saha for recombination; last scattering taken separately',
    ],
  },
  orbit: {
    model: 'Newtonian gravity, integrated',
    assumptions: [
      'Point masses with a softening length, so a close pass does not diverge.',
      'The step SIZE belongs to the setup; the speed control changes how many steps you watch, never how coarsely they are taken.',
      'The energy-drift readout is the integrator marking its own work.',
    ],
    equations: ['a_i = Σ_j Gm_j (r_j − r_i)/(|r_j − r_i|² + ε²)^{3/2}', 'velocity Verlet'],
  },
};

// ── plots ────────────────────────────────────────────────────────────
//
// A plot is not a simulation and must not be described as one. What can be
// said about a drawn curve is honest and thin: what kind of mark it is, what
// colour it was given, and the label the builder wrote on it. So that is all
// this says. Where the builder named a thing, the name is used; where it did
// not, the entry says what it is and stops, because inventing a meaning for
// "the teal curve" is precisely the failure this whole module exists to stop.

const TONE_WORDS: Record<Tone, string> = {
  primary: 'olive green',
  accent: 'teal',
  tension: 'rust',
  muted: 'grey',
  ghost: 'very faint grey',
  u1: 'purple (one of yours)',
  u2: 'green (one of yours)',
  u3: 'amber (one of yours)',
  u4: 'blue (one of yours)',
};

const KIND_OF: Record<string, { type: VizEntity['type']; what: string }> = {
  curve: { type: 'curve', what: 'a plotted curve' },
  point: { type: 'point', what: 'a marked point' },
  segment: { type: 'curve', what: 'a straight segment' },
  arrow: { type: 'curve', what: 'an arrow' },
  region: { type: 'region', what: 'a shaded region' },
  sequence: { type: 'point', what: 'a sequence of discrete terms' },
  mesh: { type: 'field', what: 'a set of lines drawn as one mark — a grid or a direction field' },
  vrule: { type: 'axis', what: 'a vertical reference line' },
  hrule: { type: 'axis', what: 'a horizontal reference line' },
  label: { type: 'label', what: 'a text label' },
};

/**
 * Turn the objects a plot actually drew into entities.
 *
 * `scene.expr` is the one piece of real meaning available — the expression the
 * figure is of — so it is attached to the marks and nothing more is claimed.
 */
export function entitiesFromFrame(objects: VizObject[], scene?: VizScene | null): VizEntity[] {
  const out: VizEntity[] = [];
  const seen = new Set<string>();
  for (const ob of objects) {
    const id = String((ob as { id?: unknown }).id ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const kind = KIND_OF[ob.o] ?? { type: 'curve' as const, what: 'a drawn mark' };
    const tone = (ob as { tone?: Tone }).tone;
    const colour = (ob as { color?: string }).color;
    const label = String((ob as { label?: unknown; text?: unknown }).label ?? (ob as { text?: unknown }).text ?? '') || id;
    const bits: string[] = [];
    if (colour) bits.push(`drawn in a colour that encodes a computed quantity (${colour})`);
    else if (tone && TONE_WORDS[tone]) bits.push(`drawn in ${TONE_WORDS[tone]}`);
    out.push({
      id,
      type: kind.type,
      label: label.slice(0, 60),
      meaning: `${kind.what} in this figure${scene?.expr ? `, which plots ${scene.expr}` : ''}.`,
      // A plot draws what an expression says; nothing here is integrated.
      from: 'closed-form',
      ...(bits.length ? { appearance: bits.join('; ') } : {}),
    });
    if (out.length >= 48) break;
  }
  return out;
}
