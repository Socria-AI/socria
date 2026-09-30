// NOTHING IS INVENTED, NOTHING IS TRIMMED IN SILENCE, AND AN EMPTY PICTURE SAYS SO.
//
// Eleven defects, all of them found by RUNNING the engine rather than reading
// it, and every one of them the same disease in a different costume: the engine
// producing something other than what the model says, with nothing anywhere
// recording the difference.
//
//   the run cache      keyed on the model id, the object id, the version and the
//                      controls — and not on the equations or the initial
//                      conditions. Five n-body systems of 2, 6, 7, 9 and 12
//                      bodies, each built fresh, ALL reported "8 states" and drew
//                      the two-body orbit.
//   the state cap      24 in system.ts against 12 bodies × 4 states in
//                      gravity.ts. Six bodies fitted. The seventh threw
//                      `Cannot read properties of null (reading 'eval')`.
//   the sanitiser      trimmed a thirty-body declaration to twelve and a
//                      seventy-state system to twenty-four, recording neither.
//   a trajectory       with no stated start began at (1, 1) — including the
//                      library's own double pendulum, whose chaos benchmark had
//                      been flinging both arms at 1 rad/s instead of releasing
//                      them from rest.
//   a trajectory       given dx and dz and no dy ran dz as the second component.
//   a surface          whose expression has no value anywhere returned a mesh of
//                      2304 nulls, noted "48 × 48 grid", graded `model-derived`.
//   a curve            the same, as a polyline with no points.
//   an extent          the engine picked read exactly like one the model chose.
//   a note             called the step count the state count: "3001 states".
//   `set`              was not in MODEL_OPS, so a reply moving a control never
//                      reached the document: undo could not undo it.
//   statedFormally     did not list `equations`, so a system of three relations
//                      in four unknowns was refused outright and destroyed on
//                      reload.

import { buildProposal, revalidate } from './.tmp/propose.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { buildSpec } from './.tmp/spec.mjs';
import { buildObject } from './.tmp/compile.mjs';
import { sanitizeModel, MODEL_CAPS } from './.tmp/schema.mjs';
import { STATE_CAP, forgetRuns, runFor } from './.tmp/system.mjs';
import { BODY_CAP } from './.tmp/gravity.mjs';
import { statedFormally, route } from './.tmp/solve.mjs';
import { MODEL_OPS, isModelOp } from './.tmp/viz-model.mjs';
import { modelStateFrom } from './.tmp/model-state.mjs';
import { unanswered } from './.tmp/ask.mjs';
import { LIBRARY } from './.tmp/library.mjs';
import { EMPTY_WORKSPACE, applyModelOps, modelFor, openFromProposal } from './.tmp/docs.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, eps = 1e-9) => Number.isFinite(a) && Math.abs(a - b) < eps;

/** An n-body system, all of them sharing one model id on purpose. */
const nbody = (n, id = 'grav') => ({
  id, title: `${n} bodies`, params: [],
  objects: [{ id: 'g', kind: 'system', label: 'System', gravity: {
    units: 'astronomical',
    bodies: Array.from({ length: n }, (_, i) => ({
      id: `b${i}`, label: `body ${i}`, mass: i === 0 ? 1 : 1e-6,
      x: i === 0 ? 0 : i, y: 0, vx: 0, vy: i === 0 ? 0 : 1,
    })),
  } }],
});

// ── THE RUN CACHE IS KEYED ON WHAT THE RUN DEPENDS ON ───────────────
{
  forgetRuns();
  const states = [];
  for (const n of [2, 6, 7, 9, 12]) {
    const m = unpack(buildProposal(nbody(n), { at: 1 }).model);
    const got = runFor(m, m.objects.find((o) => o.id === 'g'));
    states.push(got.ok ? got.run.names.length : -1);
  }
  ok('each body count gets its own run', new Set(states).size === 5, JSON.stringify(states));
  ok('  and the state count is four per body', JSON.stringify(states) === JSON.stringify([8, 24, 28, 36, 48]),
    JSON.stringify(states));

  // The same declaration twice IS the same run — the cache still has to work.
  forgetRuns();
  const a = unpack(buildProposal(nbody(3), { at: 1 }).model);
  const r1 = runFor(a, a.objects.find((o) => o.id === 'g'));
  const r2 = runFor(a, a.objects.find((o) => o.id === 'g'));
  ok('an unchanged declaration is served from the cache', r1 === r2);

  // TWO MODELS, ONE ID, DIFFERENT EQUATIONS. buildProposal stamps version 1 on
  // every fresh proposal, so this is what a long-lived server actually sees.
  forgetRuns();
  const p = unpack(buildProposal({
    id: 'same', title: 'A', params: [], objects: [{ id: 's', kind: 'system', label: 'A',
      system: { states: [{ name: 'x', init: 1 }], rhs: { x: '0 - x' }, dt: 0.01, steps: 50 } }],
  }, { at: 1 }).model);
  const q = unpack(buildProposal({
    id: 'same', title: 'B', params: [], objects: [{ id: 's', kind: 'system', label: 'B',
      system: { states: [{ name: 'x', init: 1 }], rhs: { x: 'x' }, dt: 0.01, steps: 50 } }],
  }, { at: 1 }).model);
  const decay = runFor(p, p.objects[0]);
  const grow = runFor(q, q.objects[0]);
  const last = (r) => r.run.y[r.run.y.length - 1][0];
  ok('the same id with different equations is not the same run', last(decay) < 1 && last(grow) > 1,
    `${last(decay)} vs ${last(grow)}`);

  // …and different INITIAL CONDITIONS are a different run too.
  forgetRuns();
  const one = unpack(buildProposal({
    id: 'init', title: 'from 1', params: [], objects: [{ id: 's', kind: 'system', label: 'x',
      system: { states: [{ name: 'x', init: 1 }], rhs: { x: '0 - x' }, dt: 0.01, steps: 50 } }],
  }, { at: 1 }).model);
  const five = unpack(buildProposal({
    id: 'init', title: 'from 5', params: [], objects: [{ id: 's', kind: 'system', label: 'x',
      system: { states: [{ name: 'x', init: 5 }], rhs: { x: '0 - x' }, dt: 0.01, steps: 50 } }],
  }, { at: 1 }).model);
  ok('a different starting value is a different run',
    !near(last(runFor(one, one.objects[0])), last(runFor(five, five.objects[0]))));
}

// ── THE CAPS AGREE WITH EACH OTHER ──────────────────────────────────
{
  ok('the state cap holds everything the body cap can build', BODY_CAP * 4 <= STATE_CAP,
    `${BODY_CAP} bodies × 4 = ${BODY_CAP * 4} against ${STATE_CAP}`);
  ok('a nine-body system fits', 9 * 4 <= STATE_CAP);
  ok('the sanitiser keeps more states than the integrator will run',
    MODEL_CAPS.statesKept > MODEL_CAPS.states, `${MODEL_CAPS.statesKept} vs ${MODEL_CAPS.states}`);
  ok('  and more bodies than the assembler will take', MODEL_CAPS.bodies > BODY_CAP,
    `${MODEL_CAPS.bodies} vs ${BODY_CAP}`);
  ok('the integrator cap IS the schema cap', STATE_CAP === MODEL_CAPS.states);

  // Seven bodies used to throw. Nine is a solar system.
  for (const n of [7, 9, 12]) {
    let threw = null;
    try {
      const spec = buildSpec(unpack(buildProposal(nbody(n, `g${n}`), { at: 1 }).model));
      ok(`${n} bodies draw`, spec.primitives.length > 0, `${spec.primitives.length} primitives`);
      ok(`  ${n} bodies produce only finite coordinates`,
        spec.primitives.every((pr) => (pr.at ? (Array.isArray(pr.at) ? pr.at : [pr.at]) : [])
          .every((v) => Number.isFinite(v.x) && Number.isFinite(v.y))));
    } catch (e) {
      threw = e;
    }
    ok(`${n} bodies do not throw`, !threw, threw ? `${threw.constructor.name}: ${threw.message}` : '');
  }

  // Over the cap is REFUSED, with the count, and nothing is drawn.
  const over = buildProposal(nbody(BODY_CAP + 1, 'gover'), { at: 1 });
  ok('over the body cap still builds as a stated model', over.ok, over.ok ? '' : over.refusal.because);
  const overSpec = buildSpec(unpack(over.model));
  ok('  but draws nothing', overSpec.primitives.length === 0);
  const note = overSpec.notes.find((x) => x.of === 'g');
  ok('  and says the cap and the count', /at most \d+ bodies/.test(note?.problem ?? ''), note?.problem ?? '');
  ok('  naming the number given', new RegExp(`has ${BODY_CAP + 1}`).test(note?.problem ?? ''), note?.problem ?? '');

  // A system declared above the RUN cap but below the sanitiser's is refused
  // with its own true count, rather than trimmed to the limit and run.
  const big = (k) => sanitizeModel({ id: 'big', title: 'Too many', params: [], objects: [
    { id: 's', kind: 'system', label: 'Big', system: {
      states: Array.from({ length: k }, (_, i) => ({ name: `s${i}`, init: 1 })),
      rhs: Object.fromEntries(Array.from({ length: k }, (_, i) => [`s${i}`, `0 - s${i}`])) } }] });
  const k = STATE_CAP + 6;
  const kept = big(k);
  ok(`a ${k}-state system survives the sanitiser intact`, kept.objects[0].system.states.length === k,
    String(kept.objects[0].system.states.length));
  const bigSpec = buildSpec(unpack(kept));
  ok('  and is refused by the integrator with its own count',
    new RegExp(`at most ${STATE_CAP} states — this one has ${k}`).test(bigSpec.notes[0]?.problem ?? ''),
    bigSpec.notes[0]?.problem ?? '');
  ok('  drawing nothing rather than two thirds of it', bigSpec.primitives.length === 0);
}

// ── WHAT THE SANITISER REMOVES IS ON THE RECORD ─────────────────────
{
  const many = MODEL_CAPS.bodies + 6;
  const built = buildProposal(nbody(many, 'gmany'), { at: 1 });
  ok('a trimmed proposal still builds', built.ok);
  ok('  and the model carries what was removed', (built.model.dropped ?? []).length > 0,
    JSON.stringify(built.model.dropped));
  ok('  naming the count given and the count kept',
    new RegExp(`${many} given, ${MODEL_CAPS.bodies} kept`).test((built.model.dropped ?? []).join(' ')),
    JSON.stringify(built.model.dropped));
  ok('  the report says it out loud', /Trimmed on the way in/.test(built.report.says), built.report.says);
  ok('  and the report carries it structurally', (built.report.dropped ?? []).length > 0);

  // …and it survives a round trip, because a model is re-sanitised on every save
  // and the second pass has nothing left to trim.
  const again = sanitizeModel(built.model);
  ok('the record survives re-sanitising', (again.dropped ?? []).length > 0, JSON.stringify(again.dropped));

  // …and the conversation is told.
  const st = modelStateFrom(built.model, buildSpec(unpack(built.model)), {});
  ok('the conversation is told what was trimmed',
    st.readouts.some((r) => /TRIMMED ON THE WAY IN/.test(r)), JSON.stringify(st.readouts.slice(-2)));

  // A model within every cap carries no record at all — not an empty one.
  const fine = buildProposal(nbody(3, 'gfine'), { at: 1 });
  ok('a model within the caps carries no record', fine.model.dropped === undefined);
  ok('  and its report says nothing about trimming', !/Trimmed/.test(fine.report.says), fine.report.says);
}

// ── AN EMPTY PICTURE IS NOT A SUCCESSFUL COMPUTATION ────────────────
{
  const surf = sanitizeModel({ id: 'nan', title: 'No value', params: [], objects: [
    { id: 's', kind: 'surface', label: 'root of a negative', definition: 'sqrt(0 - 1 - x^2 - y^2)' }] });
  const b = buildObject(surf, surf.objects[0]);
  ok('a surface with no value anywhere draws nothing', b.primitives.length === 0);
  ok('  and says so', /no value anywhere/.test(b.problem ?? ''), b.problem ?? '');
  ok('  naming the window it looked in', /-3 to 3/.test(b.problem ?? ''), b.problem ?? '');
  ok('  and is not graded as computed', b.fidelity !== 'model-derived', b.fidelity);

  const curve = sanitizeModel({ id: 'nanc', title: 'No value', params: [], objects: [
    { id: 'c', kind: 'curve', label: 'root of a negative', definition: 'sqrt(0 - 1 - x^2)' }] });
  const bc = buildObject(curve, curve.objects[0]);
  ok('a curve with no value anywhere draws nothing', bc.primitives.length === 0);
  ok('  and says so', /fewer than two points/.test(bc.problem ?? ''), bc.problem ?? '');

  // A PARTIAL one draws, and says how much was left out.
  const half = sanitizeModel({ id: 'half', title: 'Half a value', params: [], objects: [
    { id: 'c', kind: 'curve', label: 'root of x', definition: 'sqrt(x)' }] });
  const bh = buildObject(half, half.objects[0]);
  ok('a curve with some value draws', bh.primitives.length === 1);
  ok('  and says how many points had none', /had no value and were left out/.test(bh.note), bh.note);

  // …and a whole one says nothing about dropping anything.
  const whole = sanitizeModel({ id: 'whole', title: 'A parabola', params: [], objects: [
    { id: 'c', kind: 'curve', label: 'a parabola', definition: 'x^2' }] });
  ok('a complete curve reports no gaps', !/left out/.test(buildObject(whole, whole.objects[0]).note));
}

// ── AN EXTENT THE ENGINE CHOSE SAYS SO ──────────────────────────────
{
  const mine = sanitizeModel({ id: 'ext', title: 'No window', params: [], objects: [
    { id: 's', kind: 'surface', label: 'a paraboloid', definition: 'x^2 + y^2' }] });
  const b = buildObject(mine, mine.objects[0]);
  ok('an engine-chosen extent is declared as such',
    /an extent this engine chose/.test(b.note), b.note);
  ok('  with the numbers', /x from -3 to 3/.test(b.note), b.note);

  const theirs = sanitizeModel({ id: 'ext2', title: 'A window', params: [], objects: [
    { id: 's', kind: 'surface', label: 'a paraboloid', definition: 'x^2 + y^2',
      over: { x: [0, 10], y: [0, 10] } }] });
  ok('a model-stated extent says nothing',
    !/this engine chose/.test(buildObject(theirs, theirs.objects[0]).note),
    buildObject(theirs, theirs.objects[0]).note);

  const byControl = sanitizeModel({ id: 'ext3', title: 'A control', params: [
    { id: 'x', label: 'x', value: 1, min: 0, max: 10 }], objects: [
    { id: 'c', kind: 'curve', label: 'a line', definition: '2 * x' }] });
  ok('an extent from a control says nothing either',
    !/this engine chose/.test(buildObject(byControl, byControl.objects[0]).note));
}

// ── A PATH HAS TO BEGIN SOMEWHERE, AND NOBODY PICKS IT FOR YOU ──────
{
  const loose = sanitizeModel({ id: 'tr', title: 'No start', params: [], objects: [
    { id: 't', kind: 'trajectory', label: 'path', defs: { dx: '0 - y', dy: 'x' } }] });
  const b = buildObject(loose, loose.objects[0]);
  ok('a trajectory with no stated start draws nothing', b.primitives.length === 0);
  ok('  and asks for the start by name', /a starting value for x/.test(b.problem ?? ''), b.problem ?? '');
  ok('  for every component it needs', /a starting value for y/.test(b.problem ?? ''), b.problem ?? '');
  ok('  rather than beginning at 1', !b.primitives.length);

  const stated = sanitizeModel({ id: 'tr2', title: 'A start', params: [], objects: [
    { id: 't', kind: 'trajectory', label: 'path', defs: { dx: '0 - y', dy: 'x', x0: '1', y0: '0' } }] });
  const bs = buildObject(stated, stated.objects[0]);
  ok('a stated start runs', bs.primitives.length > 0, bs.problem ?? '');
  const first = bs.primitives.find((pr) => pr.p === 'polyline')?.at?.[0];
  ok('  from where it says', near(first?.x, 1) && near(first?.y, 0), JSON.stringify(first));
  ok('  and the note counts POINTS, not states', /points along the path/.test(bs.note), bs.note);
  ok('  never calling the step count a state count', !/\d+ states/.test(bs.note), bs.note);

  // THE COMPONENTS ARE THE STATE, IN ORDER.
  const gap = sanitizeModel({ id: 'tr3', title: 'Gap', params: [], objects: [
    { id: 't', kind: 'trajectory', label: 'path', defs: { dx: '0 - y', dz: 'x', x0: '1' } }] });
  const bg = buildObject(gap, gap.objects[0]);
  ok('a gap in the components is refused', bg.primitives.length === 0);
  ok('  naming both the one given and the one missing',
    /states dz but not dy/.test(bg.problem ?? ''), bg.problem ?? '');

  // THE LIBRARY'S OWN DOUBLE PENDULUM was the model this caught: it declared
  // its two starting ANGLES as controls and left the angular velocities to the
  // engine, which supplied 1 — so the chaos benchmark had been integrating a
  // pendulum flung at 1 rad/s on both arms rather than released from rest. It
  // says y0 = 0 and w0 = 0 now, and the assertion is that it runs at all.
  const dp = LIBRARY.find((e) => e.id === 'double-pendulum').build();
  const dpSpec = buildSpec(dp);
  ok('the double pendulum draws', dpSpec.primitives.some((pr) => pr.p === 'polyline'));
  ok('  with no gaps reported', !dpSpec.notes.some((n) => n.problem),
    JSON.stringify(dpSpec.notes.filter((n) => n.problem)));
  ok('  and states both angular velocities rather than inheriting them',
    dp.objects[0].defs.y0 === '0' && dp.objects[0].defs.w0 === '0',
    JSON.stringify({ y0: dp.objects[0].defs.y0, w0: dp.objects[0].defs.w0 }));
  // Released from rest at a nonzero angle, the lower bob starts BELOW the pivot
  // and the first point of the path is the map evaluated at the stated angles.
  const path = dpSpec.primitives.find((pr) => pr.p === 'polyline');
  ok('  starting where the stated angles put it',
    near(path.at[0].x, Math.sin(2.2) + Math.sin(2.4), 1e-9), JSON.stringify(path.at[0]));
}

// ── A SYSTEM OF EQUATIONS IS A MODEL BEFORE IT IS SOLVABLE ──────────
{
  const half = { id: 'half', title: 'Three of four relations', params: [
    { id: 'a', label: 'a', value: 120, min: 0, max: 300 },
    { id: 'b', label: 'b', value: -2, min: -10, max: 0 },
    { id: 'c', label: 'c', value: -20, min: -100, max: 100 },
    { id: 'd', label: 'd', value: 3, min: 0, max: 10 }],
    objects: [{ id: 'eq', kind: 'system', label: 'Equilibrium', equations: {
      unknowns: ['qd', 'qs', 'pc', 'pp'],
      relations: ['qd = a + b * pc', 'qs = c + d * pp', 'qd = qs'] } }] };

  ok('an equations block counts as formally stated',
    statedFormally(sanitizeModel(half)).length === 1,
    String(statedFormally(sanitizeModel(half)).length));

  const built = buildProposal(half, { at: 1 });
  ok('an underdetermined system builds', built.ok, built.ok ? '' : built.refusal.because);
  ok('  graded as stated rather than computational', built.report.capability === 'mathematical',
    built.report.capability);
  ok('  and survives a reload', revalidate(sanitizeModel(half)) !== null);
  const m = unpack(built.model);
  const spec = buildSpec(m);
  ok('  drawing nothing', spec.primitives.length === 0);
  ok('  and naming the missing relationship',
    /one more relationship/.test(spec.notes.find((n) => n.of === 'eq')?.problem ?? ''),
    spec.notes.find((n) => n.of === 'eq')?.problem ?? '');
  ok('  with the operation routed as incomplete, not unsupported',
    route(m, m.objects.find((o) => o.equations), 'solve').status === 'incomplete');

  // …and the ask check knows the unknowns are names the model holds.
  ok('an unknown counts as a name the model has',
    unanswered({ action: 'construct', artifact: 'model', topic: 't',
      formal: { outcome: 'qd', inputs: ['pc'], states: ['pp'] } }, sanitizeModel(half)).length === 0,
    JSON.stringify(unanswered({ action: 'construct', artifact: 'model', topic: 't',
      formal: { outcome: 'qd', inputs: ['pc'], states: ['pp'] } }, sanitizeModel(half))));
}

// ── A SLICE IS NOT THE WHOLE SURFACE ────────────────────────────────
{
  const wage = (extra) => unpack(sanitizeModel({ id: 'wage', title: 'Wage', params: [
    { id: 'b0', label: 'β₀', value: 5, min: 0, max: 20 },
    { id: 'b1', label: 'β₁', value: 0.7, min: 0, max: 2 },
    { id: 'b2', label: 'β₂', value: 0.2, min: 0, max: 2 },
    { id: 'b3', label: 'β₃', value: 0.1, min: 0, max: 2 },
    ...(extra ? [{ id: 'tenure', label: 'tenure', value: 5, min: 0, max: 30 }] : [])],
    objects: [{ id: 'spec', kind: 'specification', label: 'wage on three things', estimation: {
      y: 'wage', x: ['education', 'experience', 'tenure'],
      coefficients: { intercept: 'b0', education: 'b1', experience: 'b2', tenure: 'b3' },
      over: { education: [8, 20], experience: [0, 30] } } }] }));

  const withHold = wage(true);
  const resp = withHold.objects.find((o) => o.id === 'spec__response');
  ok('a third regressor is named as held', resp.meta.held === 'tenure', String(resp.meta.held));
  ok('  with the value it is held at', /tenure at 5/.test(resp.meta.heldSays), resp.meta.heldSays);
  ok('  and the object says it is a slice', /It is a SLICE of the relationship/.test(resp.meaning), '');
  ok('  naming which two vary', /Only education and experience vary here/.test(resp.meaning), '');
  ok('  and it still draws', buildSpec(withHold).primitives.length > 0);

  // …and where the held regressor has no value, that is what is said.
  const noHold = wage(false);
  const resp2 = noHold.objects.find((o) => o.id === 'spec__response');
  ok('a held regressor with no value says so',
    /nothing has given a value/.test(resp2.meta.heldSays ?? ''), resp2.meta.heldSays ?? '');

  // A two-regressor specification is the whole surface and claims nothing else.
  const two = unpack(sanitizeModel({ id: 'w2', title: 'Wage', params: [
    { id: 'b0', label: 'β₀', value: 5, min: 0, max: 20 },
    { id: 'b1', label: 'β₁', value: 0.7, min: 0, max: 2 },
    { id: 'b2', label: 'β₂', value: 0.2, min: 0, max: 2 }],
    objects: [{ id: 'spec', kind: 'specification', label: 'wage on two things', estimation: {
      y: 'wage', x: ['education', 'experience'],
      coefficients: { intercept: 'b0', education: 'b1', experience: 'b2' },
      over: { education: [8, 20], experience: [0, 30] } } }] }));
  const resp3 = two.objects.find((o) => o.id === 'spec__response');
  ok('two regressors hold nothing', resp3.meta.held === undefined);
  ok('  and the surface does not call itself a slice', !/SLICE/.test(resp3.meaning));
}

// ── A REFUSAL SAYS WHY, NOT WHAT IT WOULD BE CALLED ─────────────────
{
  const collinear = sanitizeModel({ id: 'coll', title: 'A fit', params: [],
    data: { sample: { label: 'numbers', columns: { x: [1, 2, 3, 4], w: [2, 4, 6, 8], y: [1, 2, 3, 4] } } },
    objects: [{ id: 'spec', kind: 'specification', label: 'y on x and w', estimation: {
      method: 'ols', y: 'y', x: ['x', 'w'], data: 'sample' } }] });
  const b = buildObject(collinear, collinear.objects[0]);
  ok('a fit that cannot run says what is wrong', /collinear/.test(b.problem ?? ''), b.problem ?? '');
  ok('  rather than "it needs a fit"', !/it needs a fit/.test(b.problem ?? ''), b.problem ?? '');

  const thin = sanitizeModel({ id: 'thin', title: 'A fit', params: [],
    data: { sample: { label: 'numbers', columns: { x: [1], y: [2] } } },
    objects: [{ id: 'spec', kind: 'specification', label: 'y on x', estimation: {
      method: 'ols', y: 'y', x: ['x'], data: 'sample' } }] });
  const bt = buildObject(thin, thin.objects[0]);
  ok('one observation for two coefficients says the numbers',
    /1 observations? cannot identify 2 coefficients/.test(bt.problem ?? ''), bt.problem ?? '');

  // …and a missing NOUN still reads as one.
  const spring = sanitizeModel({ id: 'spring', title: 'A spring', params: [
    { id: 'm', label: 'mass', value: 1, min: 0.1, max: 5 }], objects: [
    { id: 'mech', kind: 'component', label: 'the mechanism', mechanism: {
      bodies: [{ id: 'm1', mass: 'm', x0: 1, label: 'the mass', at: 3 }],
      springs: [{ id: 'k1', between: ['m1', 'ground'], label: 'the spring' }] } }] });
  const bs = buildObject(unpack(spring), unpack(spring).objects.find((o) => o.id === 'mech'));
  ok('a missing quantity still reads as "it needs …"', /it needs a stiffness for/.test(bs.problem ?? ''),
    bs.problem ?? '');
}

// ── MOVING A CONTROL REACHES THE DOCUMENT ───────────────────────────
{
  const model = { id: 'ctl', title: 'One control', params: [
    { id: 'k', label: 'k', value: 2, min: 0, max: 10, step: 1 }],
    objects: [{ id: 'c', kind: 'curve', label: 'a line', definition: 'k * x' }] };
  let ws = openFromProposal(EMPTY_WORKSPACE, model, { at: 1 }).workspace;
  const id = ws.docs[0].id;
  const valueNow = () => modelFor(ws.docs.find((d) => d.id === id)).params.find((p) => p.id === 'k').value;
  const revisions = () => ws.docs.find((d) => d.id === id).revisions.length;

  ok('the control starts where the model put it', valueNow() === 2, String(valueNow()));
  const before = revisions();
  const done = applyModelOps(ws, [{ op: 'set', id: 'k', value: 7 }], { at: 2 });
  ws = done.workspace;
  ok('a set reaches the document', done.changed && valueNow() === 7, String(valueNow()));
  ok('  as a revision of its own', revisions() === before + 1, `${before} → ${revisions()}`);
  ws = applyModelOps(ws, [{ op: 'undo' }], { at: 3 }).workspace;
  ok('  which undo can undo', valueNow() === 2, String(valueNow()));

  // …and the version moves, which is what makes the view resync to it.
  ok('  and the revision carries a new version',
    modelFor(ws.docs.find((d) => d.id === id)).version !== undefined);

  // The classification still covers every structural verb.
  const src = MODEL_OPS.join(',');
  ok('the structural verbs are all classified as model ops',
    ['remove', 'add', 'replace', 'relate', 'undo', 'redo'].every((v) => src.includes(v)), src);
  ok('  and a view verb is not', !isModelOp({ op: 'layer', id: 'l', on: true }));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
