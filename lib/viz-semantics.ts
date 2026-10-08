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
import { modelSummary, SURFACE_SCIENCE } from './surface-science';
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
    label: 'Shadow (capture outline)',
    meaning:
      'How large the hole looks to a distant observer, and what shape. Bigger than the horizon, because light passing near is bent into it: √27 GM/c² — about 2.6 Schwarzschild radii — in every direction when the hole is still. Once it spins it is NOT a circle; co-rotating light escapes from closer in, so one side is pushed in toward 2 GM/c² and the other bulges to 7.',
    from: 'closed-form',
    model: 'Kerr shadow curve (Bardeen 1973), from the spherical photon orbits',
    depends: ['m', 'spin', 'tilt'],
    appearance:
      'a faint dashed outline noticeably wider than the black ball — a circle at zero spin, and flat-edged on one side at high spin',
    relations: [
      'A ray aimed inside it cannot get back out, and the threshold differs by which way round the ray goes.',
      'It is not a surface: nothing is there. It is where light that came too close never came back.',
    ],
  },
  {
    id: 'disc',
    type: 'surface',
    label: 'Accretion disc',
    meaning:
      'The gas spiralling in, drawn as fourteen flared rings between the innermost stable orbit and the outer radius you set. The SHAPE is drawn geometry; the colour and brightness are computed.',
    from: 'closed-form',
    model:
      'Shakura–Sunyaev temperature profile, with the Kerr lapse and the locally measured orbital speed in the Doppler factor, per patch',
    depends: ['tilt', 'outer', 'edd', 'm', 'spin'],
    appearance:
      'the broad pale-blue ellipse, the widest thing on screen — blue because the computed temperature near the inner edge is of order 10⁵ K and that temperature is converted to its blackbody colour; the side coming toward you is brighter because of relativistic beaming, not because of lighting',
    layer: 'disc',
    relations: [
      'Its inner edge sits at the ISCO for its own sense of rotation, so spin moves it — and a disc running against the spin starts much further out and radiates a tenth as much.',
      'It is not a solid object and it is not to scale in thickness.',
      'The image is not ray-traced: you are not seeing the far side lensed over the top of the hole, which a real image of one shows.',
    ],
  },
  {
    id: 'matter',
    type: 'body',
    label: 'Gas parcels',
    meaning:
      'Sample parcels of the disc, each carried round at the Kerr orbital rate for its own radius — Ω = ±1/(r̃^{3/2} ± a★), which is Kepler’s law when the hole is still and is not once it spins. They reverse direction when the disc does. How many there are and where they start is a choice about legibility; only the rate is computed.',
    from: 'closed-form',
    model: 'Kerr circular-orbit angular velocity',
    depends: ['matter', 'outer', 'spin'],
    appearance: 'small dots moving within the disc, coloured like the ring they sit in',
    layer: 'matter',
  },
  {
    id: 'rays',
    type: 'trajectory',
    label: 'Light rays',
    meaning:
      'Photon paths, each one integrated as a null geodesic in the metric the figure is titled after — R(r) and φ̇ in Boyer–Lindquist, by Runge–Kutta — not drawn as a bent curve. Half the fan goes round with the hole’s rotation and half against it, because a beam of parallel light passing a spinning hole is exactly that, and the two halves are captured at different aiming distances.',
    from: 'integrated',
    model: 'Kerr null geodesics in the equatorial plane; Schwarzschild is the a = 0 case of the same integration',
    depends: ['rays', 'spread', 'bsel', 'spin', 'm'],
    appearance:
      'the dark olive-green curves sweeping past the hole; a captured one is rust-coloured and dashed, and the one nearest your chosen aiming distance is drawn heavier',
    layer: 'rays',
    relations: [
      'A moving dot runs along each path to show its direction — not the speed of light.',
      'Within a few hundredths of the critical aiming distance the number of loops diverges, so the drawn path can stop unfinished; the capture verdict then comes from the exact threshold, and the readout says so.',
    ],
  },
  {
    id: 'photon',
    type: 'boundary',
    label: 'Photon sphere',
    meaning:
      'Where light can orbit. At zero spin that is 1.5 Schwarzschild radii in any plane, and it is drawn as two great circles because it really is a sphere. Once the hole spins there is no single radius — light going round with the rotation orbits far closer in than light going against it — so the two equatorial orbits are drawn instead, and the sphere is not, because there is not one.',
    from: 'closed-form',
    model: 'r_ph = 2r_g[1 + cos(⅔ arccos(∓a★))], both senses',
    depends: ['m', 'spin'],
    appearance: 'the gold dashed circle, or two of them at high spin',
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
/**
 * The model behind each surface: its name, what it holds fixed, what it solves.
 *
 * DERIVED, NOT WRITTEN HERE. These three arrays used to be typed out beside each
 * surface, and one of them said the light rays were integrated in Schwarzschild
 * for exactly as long as that was true — and then for a while after it was not.
 * A sentence beside the code is a claim nobody re-reads. They now come from the
 * science blocks in lib/surface-science.ts, which lib/model/science.ts validates
 * and test/surface-science pins, so a surface cannot disagree with its own model.
 */
export const SURFACE_MODEL: Record<
  string,
  { model: string; assumptions: string[]; equations: string[] }
> = Object.fromEntries(
  Object.entries(SURFACE_SCIENCE).map(([id, meta]) => [id, modelSummary(meta)])
);

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

/** A position on the x axis, to the window's own resolution. */
function atX(x: number, width: number): string {
  const step = Math.pow(10, Math.floor(Math.log10(Math.max(width, 1e-9) / 200)));
  const r = Math.round(x / step) * step;
  const v = Math.abs(r) < step / 2 ? 0 : r;
  return String(Number(v.toPrecision(4))).replace('-', '−');
}

/** "0", "0 and 1", "−2, −1, 0 and 3 more" */
function listOf(xs: string[]): string {
  const shown = xs.slice(0, 3);
  const more = xs.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0] ?? '';
}

/**
 * WHERE A CURVE IS DRAWN, read off the very points that were drawn: across
 * the whole window or only part of it, and where the pen lifts — a pole, a
 * jump, or a stretch with no real value.
 *
 * So an explanation of the curve can describe the curve that is there. When
 * x^(2/3) was drawn only for x ≥ 0, the model explaining it had nothing but
 * the formula and its own sense of what a fractional power does — and the
 * picture and the explanation could disagree. Now both read from the same
 * evaluation. It is what anyone looking can see, never a computed answer:
 * where the curve is, not what it means.
 */
export function curveCoverage(
  pts: readonly { x: number; y: number; brk?: 'jump' | 'pole' }[],
  varName = 'x'
): string | null {
  if (!Array.isArray(pts) || pts.length < 2) return null;
  const x0 = pts[0].x;
  const x1 = pts[pts.length - 1].x;
  const width = x1 - x0;
  if (!(width > 0)) return null;
  const v = varName || 'x';
  const runs: [number, number][] = [];
  const poles: number[] = [];
  const jumps: number[] = [];
  const holes: number[] = [];
  let start: number | null = null;
  let last = 0;
  for (const p of pts) {
    if (Number.isFinite(p.y)) {
      if (start === null) start = p.x;
      last = p.x;
      continue;
    }
    if (start !== null) runs.push([start, last]);
    start = null;
    if (p.brk === 'jump') jumps.push(p.x);
    else if (p.brk === 'pole' || p.y === Infinity || p.y === -Infinity) poles.push(p.x);
    else holes.push(p.x);
  }
  if (start !== null) runs.push([start, last]);
  if (!runs.length) return `nothing drawn: no real value anywhere in the window`;

  const at = (x: number) => atX(x, width);
  const near = width * 0.01;
  const from = runs[0][0];
  const to = runs[runs.length - 1][1];
  const lead = from - x0 > near;
  const trail = x1 - to > near;
  const bits: string[] = [];
  if (!lead && !trail) bits.push('drawn across the whole window');
  else if (lead && !trail) bits.push(`drawn only from ${v} ≈ ${at(from)} rightward; nothing to its left`);
  else if (!lead && trail) bits.push(`drawn only up to ${v} ≈ ${at(to)}; nothing to its right`);
  else bits.push(`drawn only between ${v} ≈ ${at(from)} and ${at(to)}`);

  // the breaks inside what is drawn, by kind; a wide gap is a stretch with no real value
  const gaps: string[] = [];
  for (let i = 0; i + 1 < runs.length; i++) {
    const a = runs[i][1];
    const b = runs[i + 1][0];
    if (b - a > width * 0.02 && !poles.some((x) => x > a && x < b) && !jumps.some((x) => x > a && x < b)) {
      gaps.push(`${at(a)} to ${at(b)}`);
    }
  }
  const inside = (xs: number[]) => [...new Set(xs.filter((x) => x > from && x < to).map(at))];
  const p = inside(poles);
  const j = inside(jumps);
  const h = inside(holes).filter((x) => !p.includes(x) && !j.includes(x));
  if (p.length) bits.push(`runs off to infinity at ${v} ≈ ${listOf(p)}`);
  if (j.length) bits.push(`jumps at ${v} ≈ ${listOf(j)}`);
  if (gaps.length) bits.push(`no real value for ${v} from ${listOf(gaps)}`);
  else if (h.length) bits.push(`a gap at ${v} ≈ ${listOf(h)}`);
  if (bits.length === 1 && !lead && !trail) bits[0] = 'drawn unbroken across the whole window';
  const said = bits.join('; ');
  return said.length > 118 ? `${said.slice(0, 117)}…` : said;
}

/**
 * Turn the objects a plot actually drew into entities.
 *
 * `scene.expr` is the one piece of real meaning available — the expression the
 * figure is of — so it is attached to the marks, with where each curve is
 * drawn (curveCoverage), and nothing more is claimed.
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
    // where a curve is actually drawn, and where the pen lifts
    const coverage = ob.o === 'curve' && Array.isArray(ob.pts) ? curveCoverage(ob.pts, scene?.varName) : null;
    out.push({
      id,
      type: kind.type,
      label: label.slice(0, 60),
      meaning: `${kind.what} in this figure${scene?.expr ? `, which plots ${scene.expr}` : ''}.`,
      // A plot draws what an expression says; nothing here is integrated.
      from: 'closed-form',
      ...(bits.length ? { appearance: bits.join('; ') } : {}),
      ...(coverage ? { state: coverage } : {}),
    });
    if (out.length >= 48) break;
  }
  return out;
}
