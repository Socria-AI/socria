// Model fidelity, kept apart from visual fidelity.
//
// Socria's figures are abstract on purpose — thin lines on cream paper rather
// than a cinematic render — and that choice is only defensible if the model
// underneath is exact and SAYS SO in a form something can check. A beautiful
// figure and a wrong model look identical from outside. This suite is the
// difference from inside, in three parts:
//
//   1. the rules (lib/model/science.ts) — that a claim cannot exceed what
//      produced it, that a control cannot leave the model's validity, that an
//      illustrative mark must say what it is not, and that a failed computation
//      is refused rather than drawn.
//   2. the blocks (lib/surface-science.ts) — that the three advanced surfaces
//      pass those rules, and that what they claim matches what the code does.
//   3. the wiring — that the surfaces read one science block instead of
//      restating it, that the spin reaches the ray integration, and that the
//      conversation is given the model's own account of itself.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateScience, refusals, isSound, honestFidelity, fidelitySpread, rankOf,
  canCompute, explain, scienceLines, FIDELITY_RANK,
} from './.tmp/science.mjs';
import {
  BLACK_HOLE_SCIENCE, BIG_BANG_SCIENCE, ORBIT_SCIENCE, SURFACE_SCIENCE, modelSummary,
} from './.tmp/surface-science.mjs';
import { SURFACE_MODEL } from './.tmp/viz-semantics.mjs';
import { sanitizeModelState, vizModelBlock } from './.tmp/viz-model.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

/** A minimal valid block, to be broken one field at a time. */
const base = () => ({
  name: 'Test model',
  version: '1.0.0',
  domain: 'testing',
  fidelity: 'model-derived',
  coordinates: { system: 'Cartesian' },
  equations: [{ id: 'eq', text: 'y = 2x', says: 'the line', from: ['ref'] }],
  parameters: [{ id: 'x', says: 'the input', units: 'm', range: [0, 1], valid: [0, 1], outside: 'it means nothing' }],
  assumptions: ['x is real'],
  numerics: [{ id: 'solver', method: 'bisection', stopsOn: ['convergence'], checkedAgainst: 'the closed form' }],
  outputs: [{ id: 'y', says: 'the output', fidelity: 'model-derived', from: ['eq'] }],
  representations: [{ id: 'y', is: 'mathematical', shows: 'the line' }],
  limitations: ['it is a line'],
  references: [{ id: 'ref', label: 'Someone 1900', where: 'A Journal 1, 1', kind: 'paper' }],
});

console.log('=== a claim may not exceed what produced it ===');
{
  ok('the rank runs from drawn to computed',
    rankOf('conceptual') < rankOf('model-derived') && rankOf('model-derived') < rankOf('numerically-computed'));
  ok('  and every fidelity is in it', FIDELITY_RANK.length === 5);

  ok('a model’s fidelity is the WEAKEST of its outputs',
    honestFidelity([{ id: 'a', says: '', fidelity: 'numerically-computed' }, { id: 'b', says: '', fidelity: 'conceptual' }]) === 'conceptual');
  const spread = fidelitySpread([
    { id: 'a', says: '', fidelity: 'numerically-computed' },
    { id: 'b', says: '', fidelity: 'conceptual' },
  ]);
  ok('  while both ends are reported, with which parts they are',
    spread.strongest === 'numerically-computed' && spread.weakestOf.join() === 'b');

  const over = { ...base(), fidelity: 'numerically-computed' };
  ok('a headline above the parts is refused',
    refusals(over).some((p) => p.where === 'fidelity'), JSON.stringify(refusals(over)));

  const unbacked = { ...base(), outputs: [{ id: 'y', says: 'the output', fidelity: 'numerically-computed', from: ['eq'] }], fidelity: 'numerically-computed' };
  ok('“numerically computed” with no method named is refused',
    refusals(unbacked).some((p) => /names no numerical method/.test(p.says)));

  const unequationed = { ...base(), outputs: [{ id: 'y', says: 'the output', fidelity: 'model-derived' }] };
  ok('“follows from the mathematics” with no equation named is refused',
    refusals(unequationed).some((p) => /names no equation/.test(p.says)));

  const undataed = {
    ...base(),
    fidelity: 'data-derived',
    outputs: [{ id: 'y', says: 'the output', fidelity: 'data-derived', from: ['ref'] }],
  };
  ok('“from data” pointing at a paper rather than a dataset is refused',
    refusals(undataed).some((p) => /names no dataset/.test(p.says)));

  const dangling = { ...base(), outputs: [{ id: 'y', says: 'the output', fidelity: 'model-derived', from: ['nowhere'] }] };
  ok('a claim citing something that is not there is refused',
    refusals(dangling).some((p) => /not an equation, a method or a source/.test(p.says)));

  const selfCite = { ...base(), outputs: [{ id: 'y', says: 'the output', fidelity: 'model-derived', from: ['y'] }] };
  ok('  including one citing itself', refusals(selfCite).length > 0);
}

console.log('\n=== a control may not leave the model’s validity ===');
{
  const past = { ...base(), parameters: [{ id: 'x', says: 'the input', units: 'm', range: [0, 5], valid: [0, 1], outside: 'nonsense' }] };
  ok('a slider that can be dragged past the mathematics is refused',
    refusals(past).some((p) => /holds only over/.test(p.says)), JSON.stringify(refusals(past)));
  const backwards = { ...base(), parameters: [{ id: 'x', says: 'x', units: 'm', range: [1, 0] }] };
  ok('a range that runs backwards is refused', refusals(backwards).length > 0);
  const unitless = { ...base(), parameters: [{ id: 'x', says: 'x', units: '' }] };
  ok('a parameter with no units is refused', refusals(unitless).some((p) => /no units/.test(p.says)));
  const silent = { ...base(), parameters: [{ id: 'x', says: 'x', units: 'm', range: [0, 1], valid: [0, 1] }] };
  ok('  and one that does not say what goes wrong outside is warned about',
    validateScience(silent).some((p) => p.severity === 'warns' && p.where === 'x'));
}

console.log('\n=== an illustrative mark must say what it is not ===');
{
  const mute = { ...base(), representations: [{ id: 'grid', is: 'illustrative', shows: 'the geometry' }] };
  ok('an illustration with no “this is not a surface” is refused',
    refusals(mute).some((p) => /must not be mistaken for/.test(p.says)));
  const empty = { ...base(), representations: [{ id: 'blob', is: 'mathematical', shows: '' }] };
  ok('a mark that stands for nothing is refused',
    refusals(empty).some((p) => /stands for nothing/.test(p.says)));

  const lying = {
    ...base(),
    fidelity: 'numerically-computed',
    outputs: [{ id: 'y', says: 'y', fidelity: 'numerically-computed', from: ['solver'] }],
    representations: [{ id: 'y', is: 'illustrative', shows: 'y', notA: 'real' }],
  };
  ok('a computed result drawn as an illustration is refused',
    refusals(lying).some((p) => /one of the two is wrong/.test(p.says)));
  const flattering = {
    ...base(),
    fidelity: 'conceptual',
    outputs: [{ id: 'y', says: 'y', fidelity: 'conceptual' }],
    representations: [{ id: 'y', is: 'computed', shows: 'y' }],
  };
  ok('  and a drawing presented as computed is refused',
    refusals(flattering).some((p) => /claims to be computed/.test(p.says)));
}

console.log('\n=== ids may repeat across lists, because one thing has two faces ===');
{
  ok('an output and the representation that draws it may share a name', isSound(base()));
  const twice = { ...base(), outputs: [...base().outputs, { id: 'y', says: 'again', fidelity: 'model-derived', from: ['eq'] }] };
  ok('  but two outputs may not', refusals(twice).some((p) => /two outputs share/.test(p.says)));
}

console.log('\n=== a failed computation is not a drawing ===');
{
  const meta = BLACK_HOLE_SCIENCE;
  const good = canCompute(meta, { m: 4, spin: 0.5, edd: 0.1, outer: 12, tilt: 0.3, bsel: 3 });
  ok('a full set of values computes', good.ok && !good.refusals.length);
  ok('  with nothing clamped', good.clamped.length === 0);

  const missing = canCompute(meta, { spin: 0.5, edd: 0.1, outer: 12, tilt: 0.3, bsel: 3 });
  ok('a missing parameter is refused, by name', !missing.ok && missing.refusals.some((r) => /\(m\)/.test(r)));

  const nan = canCompute(meta, { m: NaN, spin: 0.5, edd: 0.1, outer: 12, tilt: 0.3, bsel: 3 });
  ok('a value that is not a number is refused', !nan.ok && nan.refusals.some((r) => /not a number/.test(r)));

  const past = canCompute(meta, { m: 4, spin: 5, edd: 0.1, outer: 12, tilt: 0.3, bsel: 3 });
  ok('a value past the model is clamped', past.clamped.some((c) => c.id === 'spin' && c.to === 0.998));
  ok('  and the clamp is reported rather than silent', past.clamped[0].why.length > 10);
  ok('  while the rest still computes', past.ok);
}

console.log('\n=== the model can say what one of its objects is ===');
{
  const m = BLACK_HOLE_SCIENCE;
  const rays = explain(m, 'rays');
  ok('a computed output says how it was computed', /numerical method|RK4/.test(rays), rays);
  ok('  and names the equations behind it', /R\(r\)/.test(rays));
  const wire = explain(m, 'horizon-wire');
  ok('an illustrative mark says what it is not', /It is not/.test(wire), wire);
  ok('  in the reader’s terms, not in a fidelity label', /no features/.test(wire));
  const shadow = explain(m, 'shadow');
  ok('the shadow says it is not a surface', /not/.test(shadow) && /never came back|nothing is there/.test(shadow), shadow);
  ok('a parameter says its units and its range', /dimensionless/.test(explain(m, 'spin')));
  ok('an equation says what it means', /capture thresholds/.test(explain(m, 'bcrit') ?? ''));
  ok('an id nobody knows gets null, not a guess', explain(m, 'the blue thing') === null);
}

console.log('\n=== the lines a model reads ===');
{
  const lines = scienceLines(BLACK_HOLE_SCIENCE, 200);
  const has = (re) => lines.some((l) => re.test(l));
  ok('it names the model and its version', has(/Kerr black hole.*v2\./));
  ok('it says which coordinates', has(/Boyer–Lindquist/));
  ok('it says who is looking', has(/Observer:/));
  ok('it names the solver and what it was checked against', has(/RK4/) && has(/checked against/));
  ok('it says where the solver cannot resolve', has(/cannot resolve/));
  ok('every output is labelled with its own fidelity',
    lines.filter((l) => /^Output —/.test(l)).every((l) => /\[(conceptual|model-derived|data-derived|simulated|numerically-computed)\]$/.test(l)));
  ok('the representation notes say what things are NOT', has(/NOT /));
  ok('the limitations are there', has(/Limitation:/));
  ok('  and come before the equations, so a truncated prompt keeps the caveats',
    lines.findIndex((l) => /^Limitation:/.test(l)) < lines.findIndex((l) => /^Equation —/.test(l)));
  ok('the sources are named', has(/Source: Bardeen 1973/));
  ok('it is bounded', scienceLines(BLACK_HOLE_SCIENCE, 6).length === 6);
  ok('a mixed model says both ends of what it claims',
    has(/Mixed:/) && has(/numerically-computed|its shape is a result/));
}

console.log('\n=== the three surfaces pass their own rules ===');
for (const [id, meta] of Object.entries(SURFACE_SCIENCE)) {
  const problems = validateScience(meta);
  ok(`${id} — sound`, isSound(meta), JSON.stringify(problems));
  ok(`${id} — no warnings either`, problems.length === 0, JSON.stringify(problems));
  ok(`${id} — names its coordinates`, !!meta.coordinates);
  ok(`${id} — states limitations`, meta.limitations.length >= 2);
  ok(`${id} — every parameter carries units`, (meta.parameters ?? []).every((p) => p.units));
  ok(`${id} — every computed output names a method`,
    meta.outputs.filter((o) => o.fidelity === 'numerically-computed' || o.fidelity === 'simulated')
      .every((o) => (o.from ?? []).some((f) => (meta.numerics ?? []).some((n) => n.id === f))));
  ok(`${id} — every method says what it was checked against`,
    (meta.numerics ?? []).every((n) => !!n.checkedAgainst));
  ok(`${id} — every source has a citation`, (meta.references ?? []).every((r) => r.where.length > 5));
}

console.log('\n=== what the black-hole block claims is what the code does ===');
{
  const m = BLACK_HOLE_SCIENCE;
  const eq = (id) => m.equations.find((e) => e.id === id);
  // THE FAILURE THIS CATCHES is the one that was actually there: a figure
  // titled Kerr whose light paths were Schwarzschild. If the geodesic equation
  // carries the spin, the integration it describes has to as well.
  ok('the geodesic equation carries the spin', /a★/.test(eq('geodesic').text));
  ok('  and the integrator takes a spin', /spin\?:/.test(read('lib/logos-physics.ts')));
  ok('  and the surface passes one', /photonPath\(b, \{ spin/.test(read('components/surfaces/BlackHoleSurface.tsx')));
  ok('  as does the 2D view', /photonPath\(bImpact, \{ spin \}\)/.test(read('lib/logos-viz.ts')));

  ok('the capture threshold is stated for both senses', /\+2 and −7|both senses/.test(eq('bcrit').says));
  ok('the shadow equation is the Kerr curve, not a radius', /ξ/.test(eq('shadow').text) && /sin i/.test(eq('shadow').text));
  ok('  and the surface draws that curve', /kerrShadow\(/.test(read('components/surfaces/BlackHoleSurface.tsx')));

  ok('the orbital rate is Kerr’s, not Kepler’s with a factor',
    /r̃\^\{3\/2\} ± a★/.test(eq('omega').text));
  ok('  and the ad-hoc dragging factor is gone from the surface',
    !/1 \+ 0\.9 \* vals\.spin/.test(read('components/surfaces/BlackHoleSurface.tsx')));
  ok('  with the parcels on the computed rate', /circularOrbit\(bh, r \* bh\.rs, sense\)/.test(read('components/surfaces/BlackHoleSurface.tsx')));

  ok('the Doppler factor uses the locally measured speed',
    /locally measured|α = r̃√Δ̃/.test(eq('beta').text + eq('lapse').text + eq('doppler').says));
  ok('  and the physics no longer uses the coordinate speed for it',
    !/Math\.sqrt\(\(PHYS\.G \* bh\.M\) \/ r\) \/ PHYS\.c/.test(read('lib/logos-physics.ts')));

  ok('the retrograde disc is a first-class case', /iscoRetro/.test(read('lib/logos-physics.ts')));
  ok('  and the surface computes its efficiency as such',
    /eddingtonRate\(bh, vals\.edd, sense\)/.test(read('components/surfaces/BlackHoleSurface.tsx')));

  ok('the Eddington control stops where the thin disc does',
    m.parameters.find((p) => p.id === 'edd').range[1] <= 0.3);
  ok('  and the slider agrees with the block',
    /id: 'edd'[^}]*max: 0\.3/.test(read('components/surfaces/BlackHoleSurface.tsx')));

  ok('the block admits the disc image is not ray-traced',
    m.limitations.some((l) => /ray-trace/.test(l)));
  ok('  and that off-equatorial motion is not modelled',
    m.limitations.some((l) => /Off-equatorial/.test(l)));
  ok('  and that the Hawking power is the Schwarzschild expression',
    m.limitations.some((l) => /Schwarzschild expressions/.test(l)));
}

console.log('\n=== one source, not three restatements ===');
{
  for (const id of ['black-hole', 'big-bang', 'orbit']) {
    const derived = modelSummary(SURFACE_SCIENCE[id]);
    ok(`${id} — the surface’s model line is derived from the block`,
      SURFACE_MODEL[id].model === derived.model, SURFACE_MODEL[id].model);
    ok(`${id} — as are its equations`,
      JSON.stringify(SURFACE_MODEL[id].equations) === JSON.stringify(derived.equations));
    ok(`${id} — and its assumptions lead with the limitations`,
      SURFACE_MODEL[id].assumptions[0] === SURFACE_SCIENCE[id].limitations[0]);
  }
  ok('nothing hand-writes the old arrays any more',
    !/'black-hole': \{\s*model: '/.test(read('lib/viz-semantics.ts')));
}

console.log('\n=== the conversation is given the model’s own account ===');
{
  const state = sanitizeModelState({
    surface: 'black-hole',
    title: 'Black hole',
    model: 'Kerr',
    assumptions: ['equatorial'],
    equations: ['R(r) = …'],
    science: scienceLines(BLACK_HOLE_SCIENCE),
    entities: [{ id: 'rays', type: 'trajectory', label: 'Light rays', meaning: 'paths', from: 'integrated' }],
    params: [{ id: 'spin', label: 'spin', value: 0.5, read: 'a = 0.500', min: -0.998, max: 0.998 }],
    layers: [{ id: 'rays', label: 'Light', on: true }],
    readouts: ['3 of 6 captured'],
    selected: 'rays',
  });
  ok('the science lines survive sanitising', (state.science ?? []).length > 10);
  const said = vizModelBlock(state);
  ok('  and reach the prompt', /THE MODEL, IN ITS OWN WORDS/.test(said));
  ok('  with the coordinates in them', /Boyer–Lindquist/.test(said));
  ok('  and the solver', /RK4/.test(said));
  ok('the prompt is told not to upgrade a drawing to a computation',
    /Never upgrade a drawing to a computation/.test(said));
  ok('  and to answer “why” from the model’s own numbers',
    /answered from the model’s own numbers/.test(said));
  ok('  and to say when a mark is not what it looks like',
    /is NOT something/.test(said));

  const junk = sanitizeModelState({
    surface: 'black-hole',
    title: 'Black hole',
    model: 'Kerr',
    assumptions: [],
    equations: [],
    science: 'not a list',
    entities: [{ id: 'rays', type: 'trajectory', label: 'Light rays', meaning: 'paths', from: 'integrated' }],
    params: [{ id: 'spin', label: 'spin', value: 0, read: 'a = 0', min: -1, max: 1 }],
    layers: [{ id: 'rays', label: 'Light', on: true }],
    readouts: [],
    selected: null,
  });
  ok('a science field that is not a list is dropped, not trusted', !!junk && junk.science === undefined);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
