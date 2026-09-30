// The representation engine, checked against mathematics and against itself.
//
// WHAT THIS SUITE IS FOR. The engine's claim is that one set of primitives and
// one compiler can carry many subjects — so the failure that matters is not "a
// picture looked wrong", it is "a domain needed its own code". Every block
// below drives the SAME functions with a different model from the benchmark
// library, and the assertions are about the mathematics (does the contour lie
// on the level set? does the integrator conserve what it should? is the slice
// the function's own value?) rather than about pixels.
//
// The second half is about honesty, which is the other half of the claim: a
// fidelity that is earned by the code path rather than asserted by the model,
// a provenance that survives the trip to the conversation, and a projection
// that says it is one.

import {
  sanitizeModel, sanitizeObject, affectedBy, dependenciesOf, overallFidelity,
  setParam, setTime, objectOf, paramOf, byKind, FIDELITY_SAYS, OBJECT_KINDS, RELATIONS,
} from './.tmp/schema.mjs';
import { LIMITS, extentOf, thin, pointsOf, resolutionFor } from './.tmp/primitives.mjs';
import {
  surfaceMesh, crossSection, contour, levelSets, vectorField, integrate,
  trajectoryLine, streamlines, scatter, dataSurface, parametricSurface, parametricCurve,
} from './.tmp/sample.mjs';
import { buildObject, buildModel, buildSlice, buildContours, buildLevel, scopeOf } from './.tmp/compile.mjs';
import { buildSpec, chooseRepresentation, toCartesian, fitBox, projectionNote } from './.tmp/spec.mjs';
import { expand } from './.tmp/mechanism.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { modelStateFrom, applyOps, describeChanges, compare, asProvenance } from './.tmp/model-state.mjs';
import { LIBRARY, modelById, saddle, lorenz, orbit, pointCharge, torus, volatilitySurface, doublePendulum, photonPath, bivariateGaussian, terrain } from './.tmp/library.mjs';
import { vizModelBlock, parseVizOps, sanitizeModelState } from './.tmp/viz-model.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('=== the schema holds what a model is, and refuses what it is not ===');
{
  const m = sanitizeModel(saddle());
  ok('a benchmark model survives sanitising', !!m && m.objects.length === 2);
  ok('  with its controls', m.params.map((p) => p.id).join(',') === 'a,b');
  ok('  and its definitions intact', objectOf(m, 'z').definition === 'a*x^2 - b*y^2');

  ok('junk is not a model', sanitizeModel(null) === null && sanitizeModel({ id: 'x' }) === null);
  const dirty = sanitizeModel({
    id: 'dirty',
    title: 'T',
    objects: [
      { id: 'a', kind: 'not-a-kind', label: 'A', fidelity: 'wishful', meaning: 'M'.repeat(900) },
      { id: 'bad id!', kind: 'point', label: 'B' },
      { id: 'c', kind: 'point', label: 'C', relations: [{ to: 'nowhere', as: 'causes' }] },
    ],
    params: [{ id: 'p', value: 99, min: 0, max: 1 }, { id: 'q', value: 1, min: 5, max: 5 }],
  });
  ok('an unknown kind becomes an annotation', dirty.objects[0].kind === 'annotation');
  // THE ONE THAT MATTERS: a model cannot talk its way up the fidelity ladder.
  ok('  an invented fidelity becomes the modest one', dirty.objects[0].fidelity === 'conceptual');
  ok('  a long meaning is cut', dirty.objects[0].meaning.length <= 300);
  ok('  a malformed id is dropped', dirty.objects.length === 2);
  ok('  a relation to nothing is dropped', !dirty.objects[1].relations);
  ok('  a value outside its range is clamped', dirty.params[0].value === 1);
  ok('  an empty range is not a control', dirty.params.length === 1);

  ok('every kind and relation is a stable noun',
    OBJECT_KINDS.every((k) => /^[a-z-]+$/.test(k)) && RELATIONS.every((r) => /^[a-z-]+$/.test(r)));
}

console.log('\n=== a change reaches what it reaches, and nothing else ===');
{
  const m = sanitizeModel(bivariateGaussian());
  ok('moving a control reaches the surface that declares it', affectedBy(m, ['rho']).includes('f'));
  ok('  and a control nothing declares reaches nothing', affectedBy(m, ['nonexistent']).length === 0);

  const moved = setParam(m, 'rho', 0.5);
  ok('the model is a new version', (moved.version ?? 0) === (m.version ?? 0) + 1);
  ok('  the old one is untouched', paramOf(m, 'rho').value === 0);
  ok('  and it records what moved and what that reached',
    moved.lastChange.what === 'rho' && moved.lastChange.to === 0.5 && moved.lastChange.affected.includes('f'));
  ok('a value outside the range is clamped, not refused', setParam(m, 'rho', 99).params.find((p) => p.id === 'rho').value === 0.9);
  ok('setting a control to what it already is changes nothing', setParam(m, 'rho', 0) === m);

  const deps = dependenciesOf(m, 'f');
  ok('an object can say what it rests on', deps.params.map((p) => p.id).sort().join(',') === 'mx,my,rho,sx,sy');

  // A picture is only as computed as its least computed part.
  ok('the modest fidelity wins over a set',
    overallFidelity([{ fidelity: 'numerically-computed' }, { fidelity: 'conceptual' }]) === 'conceptual');
}

console.log('\n=== the samplers are right about the mathematics ===');
{
  // A surface, and its own values.
  const f = (x, y) => x * x - y * y;
  const s = surfaceMesh('z', f, { min: -2, max: 2 }, { min: -2, max: 2 }, 16);
  ok('a surface samples its own function', near(s.value.rows[0][0].z, f(-2, -2), 1e-9));
  ok('  and reports the grid it used', /16 × 16/.test(s.note));
  ok('  a request above the cap comes back capped and says so',
    /capped/.test(surfaceMesh('z', f, { min: 0, max: 1 }, { min: 0, max: 1 }, 400).note));
  ok('  a hole in the function is a hole in the mesh',
    surfaceMesh('z', (x) => (x < 0 ? NaN : 1), { min: -1, max: 1 }, { min: 0, max: 1 }, 4).value.rows[0][0] === null);

  // Contours: every point on a level set must actually be at that level.
  const grid = surfaceMesh('z', f, { min: -2, max: 2 }, { min: -2, max: 2 }, 48);
  const c = contour('z', grid.rows, 1);
  ok('a contour is produced', c.value.length > 4);
  const worst = Math.max(...c.value.flatMap((seg) => seg.at.map((p) => Math.abs(f(p.x, p.y) - 1))));
  // Marching squares is exact for the bilinear interpolant, so the error is
  // the interpolation error of the grid — small, and bounded by the cell.
  ok('  and every point on it is at that level', worst < 0.02, String(worst));
  ok('  a level outside the range produces nothing', contour('z', grid.rows, 99).value.length === 0);
  ok('  a family of levels spans the surface', levelSets('z', grid.rows, 6).value.length > 20);

  // The ambiguous cell has to resolve the same way twice.
  const again = contour('z', grid.rows, 1);
  ok('  and contouring is deterministic', JSON.stringify(again.value) === JSON.stringify(c.value));

  // A cross-section is the function's own value, not the mesh's.
  const cut = crossSection('z', f, 'y', 0.5, { min: -2, max: 2 }, 40);
  const pts = cut.value.flatMap((r) => r.at);
  ok('a cross-section is the function itself', pts.every((p) => near(p.z, f(p.x, 0.5), 1e-9)));
  ok('  at the plane it was asked for', pts.every((p) => p.y === 0.5));

  // A field: direction exact, length declared.
  const vf = vectorField('e', (x, y) => ({ x, y }), { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } }, 6);
  ok('a field samples its own components', vf.value.at.length === 36);
  ok('  and says how the arrows are scaled', /magnitude|percentile/.test(vf.note));
  const steep = vectorField('e', (x, y) => ({ x: x / (x * x + y * y + 1e-6), y: 0 }), { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } }, 8);
  ok('  a field that spans orders of magnitude says it was clipped', steep.value.clipped === true && /clipped/.test(steep.note));
}

console.log('\n=== the integrator is a real integrator ===');
{
  // Against an analytic solution: ẋ = y, ẏ = −x is a unit circle.
  const run = integrate((_t, y) => [y[1], -y[0]], [1, 0], { dt: 0.01, steps: 628 });
  const last = run.value.y[run.value.y.length - 1];
  ok('RK4 closes a circle', near(Math.hypot(last[0], last[1]), 1, 1e-6), String(Math.hypot(last[0], last[1])));
  ok('  and comes back where it started after 2π', near(last[0], Math.cos(6.28), 1e-3) && near(last[1], -Math.sin(6.28), 1e-3));
  ok('  and says how it integrated', /Runge–Kutta 4/.test(run.note) && /dt = 0.01/.test(run.note));

  // Euler would drift outward by about 3% here; RK4 by about a part in 10⁸.
  const radii = run.value.y.map(([x, y]) => Math.hypot(x, y));
  ok('  without drifting', Math.max(...radii) - Math.min(...radii) < 1e-6);

  // A blow-up stops rather than filling memory with infinities.
  const blow = integrate((_t, y) => [y[0] * y[0] * 1e6], [1], { dt: 0.1, steps: 500 });
  ok('a divergent system stops when it stops being finite', blow.value.y.length < 500);

  const line = trajectoryLine('p', run.value, [0, 1, 0]);
  ok('a trajectory becomes a polyline', line.value.p === 'polyline' && line.value.at.length > 100);
  const big = integrate((_t, y) => [y[1], -y[0]], [1, 0], { dt: 0.0005, steps: 20000 });
  const thinned = trajectoryLine('p', big.value, [0, 1, 0]);
  ok('  a long run is thinned, and says it was thinned',
    thinned.value.at.length <= LIMITS.runPoints && /drawn as/.test(thinned.note));
}

console.log('\n=== the compiler earns the fidelity it reports ===');
{
  const m = sanitizeModel(saddle());
  const built = buildObject(m, objectOf(m, 'z'));
  ok('a surface from an expression is model-derived', built.fidelity === 'model-derived');

  const lz = sanitizeModel(lorenz());
  const traj = buildObject(lz, objectOf(lz, 'path'));
  ok('a trajectory that went through the integrator is numerically-computed',
    traj.fidelity === 'numerically-computed');
  ok('  and says so with the method and the step', /Runge–Kutta 4/.test(traj.note));

  const data = sanitizeModel({
    id: 'd', title: 'D',
    objects: [{ id: 'grid', kind: 'surface', label: 'G', data: 'obs', fidelity: 'numerically-computed' }],
    params: [],
    data: { obs: { xs: [0, 1], ys: [0, 1], z: [[1, 2], [3, 4]] } },
  });
  const fromData = buildObject(data, objectOf(data, 'grid'));
  // THE CLAIM CANNOT BE TALKED UP: the object said numerically-computed; the
  // code path was "read the numbers", so it comes back data-derived.
  ok('a surface read off data is data-derived, whatever it claimed', fromData.fidelity === 'data-derived');

  const broken = sanitizeModel({
    id: 'b', title: 'B',
    objects: [{ id: 's', kind: 'surface', label: 'S', definition: 'x ^^ &&' }],
    params: [],
  });
  const nope = buildObject(broken, objectOf(broken, 's'));
  ok('an expression that will not compile draws nothing', nope.primitives.length === 0);
  ok('  and says why rather than drawing half of it', /would not compile/.test(nope.problem));
}

console.log('\n=== every benchmark compiles, and each exercises something different ===');
{
  for (const entry of LIBRARY) {
    const m = sanitizeModel(entry.build());
    ok(`${entry.id}: is a model`, !!m, entry.id);
    const spec = buildSpec(m);
    // A mechanism's parts become objects during the build (expand, in
    // lib/model/mechanism.ts), so the set of objects a primitive may belong to is
    // the EXPANDED one. Comparing against the declaration would say a spring's
    // primitive belongs to nothing, which is the opposite of what is true.
    // `unpack`, not `expand`. This read `expand(m)` — the MECHANISM expander
    // alone — so it checked the primitives against a partial expansion and
    // would have failed for anything a gravity or estimation declaration
    // produced. Whatever the compiler draws from, this must be the same thing.
    const drawnFrom = unpack(m);
    const drawn = spec.primitives.length;
    // A model may legitimately draw nothing: `open-specification` has no method
    // chosen, so there is no fit and nothing to plot — and the note says exactly
    // that. What must never happen is drawing something anyway.
    // The wording moved when routing became per-operation: the estimator's
    // refusal is now the router's "a method, chosen by you" rather than a
    // sentence the compiler wrote. Both spellings are accepted so the escape
    // is about the STATE — the person has not chosen an estimator — rather
    // than about one phrasing of it.
    const refusedOnPurpose = spec.notes.some((n) =>
      /no method has been chosen|a method, chosen by you/.test(n.problem ?? '')
    );
    ok(`  ${entry.id}: draws something, or says why not`,
      drawn > 0 || refusedOnPurpose, `${drawn} primitives`);
    ok(`  ${entry.id}: nothing it could not draw`,
      spec.notes.every((n) => !n.problem) || refusedOnPurpose,
      JSON.stringify(spec.notes.filter((n) => n.problem)));
    ok(`  ${entry.id}: stays inside the budget`, drawn <= LIMITS.primitives);
    ok(`  ${entry.id}: every primitive knows the object it draws`,
      spec.primitives.every((p) => drawnFrom.objects.some((o) => o.id === p.of)));
    ok(`  ${entry.id}: the box is finite`,
      [spec.box.x, spec.box.y, spec.box.z].every(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a));
  }

  // …and the primitives they reach for genuinely differ.
  const kindsOf = (id) => new Set(buildSpec(sanitizeModel(modelById(id))).primitives.map((p) => p.p));
  ok('a surface model draws a mesh', kindsOf('saddle').has('mesh'));
  ok('a field model draws vectors', kindsOf('point-charge').has('vectors'));
  ok('a trajectory model draws a polyline', kindsOf('lorenz').has('polyline'));
  ok('a parametric model draws a mesh too, from a different path', kindsOf('torus').has('mesh'));
}

console.log('\n=== the benchmarks are right, not merely drawn ===');
{
  // Orbit: a circular start must close. This is the integrator marking its own
  // work — an orbit that spirals is the classic sign of a first-order method.
  const m = sanitizeModel(orbit());
  const path = buildObject(m, objectOf(m, 'path')).primitives[0].at;
  const radii = path.map((p) => Math.hypot(p.x, p.y));
  ok('a circular orbit stays circular', Math.max(...radii) - Math.min(...radii) < 0.01,
    `${Math.min(...radii).toFixed(4)}–${Math.max(...radii).toFixed(4)}`);

  // Lorenz: chaos is the point, so two nearby starts must separate.
  const a = buildObject(sanitizeModel(lorenz()), objectOf(sanitizeModel(lorenz()), 'path')).primitives[0].at;
  const nudged = setParam(sanitizeModel(lorenz()), 'x0', 1.001);
  const b = buildObject(nudged, objectOf(nudged, 'path')).primitives[0].at;
  const apart = Math.hypot(a[a.length - 1].x - b[b.length - 1].x, a[a.length - 1].y - b[b.length - 1].y);
  ok('two Lorenz starts a thousandth apart end up far apart', apart > 1, String(apart));
  ok('  while they begin together', Math.hypot(a[0].x - b[0].x, a[0].y - b[0].y) < 0.01);

  // The photon. Geometric units: the horizon is at r = 2 and the critical
  // aiming distance is 3√3 ≈ 5.196.
  const closest = (mm) => {
    const pts = buildObject(mm, objectOf(mm, 'ray')).primitives[0].at;
    return Math.min(...pts.map((p) => Math.hypot(p.x, p.y)));
  };
  const wide = sanitizeModel(photonPath());
  const nearer = setParam(wide, 'b', 6);
  ok('a ray aimed wider passes further out', closest(wide) > closest(nearer),
    `${closest(wide).toFixed(2)} vs ${closest(nearer).toFixed(2)}`);
  ok('  and both of those escape', closest(nearer) > 2);
  // THE ONE THE PHYSICS DECIDES, NOT THE DRAWING: inside 3√3 it is captured,
  // and the trajectory ends at the horizon instead of carrying on.
  const captured = setParam(wide, 'b', 4);
  ok('a ray aimed inside the critical distance is captured', closest(captured) <= 2.01,
    String(closest(captured)));
  ok('  and the trajectory says where it ended',
    /stopped at the boundary/.test(buildObject(captured, objectOf(captured, 'ray')).note));

  // The saddle: a slice at y = 0 is a parabola opening the way a says.
  const sd = sanitizeModel(saddle());
  const slice = buildSlice(sd, objectOf(sd, 'z'), 'y', 0);
  const zs = slice.value.flatMap((r) => r.at);
  ok('a slice of the saddle at y = 0 is a·x²', zs.every((p) => near(p.z, 1 * p.x * p.x, 1e-9)));
  const flipped = buildSlice(setParam(sd, 'a', -1), objectOf(sd, 'z'), 'y', 0);
  ok('  and it follows the control', flipped.value[0].at.some((p) => p.z < 0));

  // The Gaussian integrates to about one, which is what makes it a density.
  const g = sanitizeModel(bivariateGaussian());
  const mesh = buildObject(g, objectOf(g, 'f')).primitives[0];
  let volume = 0;
  const dx = 8 / (mesh.rows[0].length - 1);
  for (const row of mesh.rows) for (const v of row) if (v) volume += v.z * dx * dx;
  ok('the bivariate density integrates to about one', near(volume, 1, 0.02), String(volume));
}

console.log('\n=== 3D has to earn it ===');
{
  const why = (m) => chooseRepresentation(sanitizeModel(m));
  ok('a quantity over two others earns three dimensions', why(saddle()).dimensionality === 3);
  ok('  and says why', /varies over two others/.test(why(saddle()).why));
  ok('a plane curve does not', why({
    id: 'p', title: 'P', params: [],
    objects: [{ id: 'c', kind: 'curve', label: 'y = x²', definition: 'x^2' }],
  }).dimensionality === 2);
  ok('  and says why not', /perspective box/.test(why({
    id: 'p', title: 'P', params: [],
    objects: [{ id: 'c', kind: 'curve', label: 'c', definition: 'x^2' }],
  }).why));
  ok('a dependency structure is a graph, not geometry', why({
    id: 'g', title: 'G', params: [],
    objects: [
      { id: 'n1', kind: 'node', label: 'A' }, { id: 'n2', kind: 'node', label: 'B' }, { id: 'n3', kind: 'node', label: 'C' },
    ],
  }).kind === 'graph');
  ok('a series against time is a timeline', why({
    id: 's', title: 'S', params: [],
    objects: [{ id: 'v', kind: 'series', label: 'v' }],
  }).kind === 'timeline');
  ok('a model with no geometry gets no picture', why({
    id: 'n', title: 'N', params: [], objects: [{ id: 'a', kind: 'assumption', label: 'A' }],
  }).kind === 'text');
  ok('a two-state system is drawn in the plane', why(orbit()).dimensionality === 2 || why(orbit()).kind === 'simulation');
  ok('a three-state system earns the third', why(lorenz()).dimensionality === 3);

  // The choice is a choice: it names what else would have worked.
  ok('and it offers its alternatives', why(saddle()).alternatives.includes('plot2d'));

  // A projection must say it is one.
  ok('a projection says how many dimensions it is not showing',
    /10-dimensional/.test(projectionNote(['x', 'y', 'z'], 10)));
  ok('  and says nothing when nothing is hidden', projectionNote(['x', 'y'], 2) === null);
}

console.log('\n=== coordinates are converted once, at the edge ===');
{
  const p = toCartesian({ x: 2, y: Math.PI / 2, z: 3 }, 'polar');
  ok('polar becomes cartesian', near(p.x, 0, 1e-9) && near(p.y, 2, 1e-9) && p.z === 3);
  const s = toCartesian({ x: 1, y: Math.PI / 2, z: 0 }, 'spherical');
  ok('spherical becomes cartesian', near(s.x, 1, 1e-9) && near(s.z, 0, 1e-9));
  const g = toCartesian({ x: 10, y: 60, z: 100 }, 'geographic');
  ok('geographic scales longitude by the latitude', near(g.x, 10 * Math.cos((60 * Math.PI) / 180), 1e-9));
  ok('cartesian is left alone', toCartesian({ x: 1, y: 2, z: 3 }, 'cartesian').x === 1);
}

console.log('\n=== manipulation is local, and it says what it reached ===');
{
  const m = sanitizeModel(bivariateGaussian());
  const spec = buildSpec(m);
  const state = modelStateFrom(m, spec);
  // OVER THE EXPANDED MODEL. The entity list is what the conversation reads, and
  // it is built from the unpacked model — so a surface's differentiated slopes
  // are in it, which is the point: a reader should be able to ask about
  // ∂f/∂x. The stored model does not carry them.
  ok('the conversation is handed every object', state.entities.length === unpack(m).objects.length,
    `${state.entities.length} vs ${unpack(m).objects.length}`);
  ok('  with what each one is', state.entities[0].meaning.length > 20);
  ok('  and how it was actually produced', state.entities[0].relations.some((r) => /How it was produced/.test(r)));
  ok('  and where its numbers came from', state.entities[0].relations.some((r) => /Where it came from/.test(r)));
  ok('  and the view says what it is', state.readouts.some((r) => /This view/.test(r)));
  ok('  and what it can be asked to do', (state.can ?? []).includes('slice'));

  const clean = sanitizeModelState(state);
  ok('the state survives the trip to the server', !!clean && clean.entities.length === state.entities.length);
  const block = vizModelBlock(clean);
  ok('  and the prompt block carries the fidelity', /evaluated from the relationships/.test(block));
  ok('  and offers the model verbs', /slice x\|y/.test(block));

  const ops = parseVizOps('```socria-viz\nset rho 0.5\nslice y 1\nview 2d\n```', clean);
  ok('a reply may slice and flatten a model-backed view', ops.length === 3);
  const applied = applyOps(m, ops);
  ok('  the control moved on the model', paramOf(applied.model, 'rho').value === 0.5);
  ok('  the slice is a view, not a change to the model', applied.view.slice.at === 1 && applied.view.slice.axis === 'y');
  ok('  and only what depends on it is recomputed', applied.recompute.join(',') === 'f');
  ok('  with a sentence for what happened', /ρ to 0.5/.test(describeChanges(applied.model, applied.changes)));

  // A working surface with no model behind it is offered none of this.
  const plain = sanitizeModelState({ ...state, can: [] });
  ok('a view with no model cannot be sliced', parseVizOps('```socria-viz\nslice y 1\n```', plain).length === 0);

  // Rebuilding locally must reuse what did not move.
  const before = buildSpec(m);
  const after = buildSpec(applied.model, { only: applied.recompute, keep: undefined });
  ok('a local rebuild returns the objects that moved', after.primitives.every((p) => p.of === 'f'));
  ok('  and the full build still returns everything', before.primitives.length >= after.primitives.length);
}

console.log('\n=== comparison is between two states of one model ===');
{
  const a = sanitizeModel(saddle());
  const b = setParam(a, 'a', -1.5);
  const c = compare(a, b);
  ok('the difference is named', c.differs.length === 1 && c.differs[0].id === 'a');
  ok('  with both values', c.differs[0].a === 1 && c.differs[0].b === -1.5);
  ok('  and what should look different', c.affected.includes('z'));
  ok('two identical states differ in nothing', compare(a, a).differs.length === 0);
}

console.log('\n=== time is a dimension, not a decoration ===');
{
  const m = sanitizeModel(doublePendulum());
  ok('a model with time carries it', !!m.time && m.time.max === 20);
  const moved = setTime(m, 5);
  ok('  and can be moved to an instant', moved.time.t === 5);
  ok('  clamped to its own extent', setTime(m, 999).time.t === 20);
  const still = sanitizeModel(saddle());
  ok('a model with nothing moving has no clock', !still.time && !buildSpec(still).time);
  ok('  and a model that moves offers one', !!buildSpec(m).time);
}

console.log('\n=== the picture degrades rather than freezing ===');
{
  ok('a mesh is capped', resolutionFor(10_000) === LIMITS.meshN);
  ok('a scatter is thinned', scatter('d', Array.from({ length: 50_000 }, (_, i) => ({ x: i, y: i, z: 0 }))).value.at.length <= LIMITS.points);
  ok('  and says it was thinned', /drawn as/.test(scatter('d', Array.from({ length: 50_000 }, (_, i) => ({ x: i, y: 0, z: 0 }))).note));
  ok('thinning keeps the ends', thin([1, 2, 3, 4, 5, 6, 7, 8, 9], 3).join(',') === '1,5,9');
  ok('a field is capped', vectorField('f', () => ({ x: 1, y: 1 }), { x: { min: 0, max: 1 }, y: { min: 0, max: 1 } }, 200).value.at.length <= LIMITS.arrows);

  const huge = { ...sanitizeModel(saddle()) };
  huge.objects = Array.from({ length: 500 }, (_, i) => ({ ...huge.objects[0], id: `z${i}` }));
  const spec = buildSpec(sanitizeModel(huge));
  ok('a model with hundreds of objects still returns a drawable spec', spec.primitives.length <= LIMITS.primitives);
}

console.log('\n=== it extends Logos rather than sitting beside it ===');
{
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const read = (p) => readFileSync(join(root, p), 'utf8');

  // The lens routes to the engine; it does not learn a domain to do it.
  const lens = read('components/ThinkingMap.tsx');
  ok('the plot lens can mount a model', /map\.viz\.built/.test(lens) && /<ModelView/.test(lens));
  ok('  without the existing routes being removed',
    /isSimulation\(map\.viz\)/.test(lens) && /<MathViz/.test(lens));

  // The renderer reuses the frame and the projection rather than copying them.
  const view = read('components/model/ModelView.tsx');
  ok('the renderer reuses the existing frame', /from '@\/components\/surfaces\/Surface3D'/.test(view));
  ok('  and the existing projection', /from '@\/lib\/logos-viz3d'/.test(view));
  // Comments are allowed to NAME what the code refuses to know — the header
  // of that file says exactly that — so the scan is of the code.
  const viewCode = view.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok('  and its code knows no domain', !/black hole|volatility|pendulum|lorenz/i.test(viewCode));

  // The engine's own files must not name a domain either: the day one does,
  // the generality has been quietly abandoned.
  for (const f of ['lib/model/schema.ts', 'lib/model/primitives.ts', 'lib/model/sample.ts', 'lib/model/spec.ts']) {
    const src = read(f);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    ok(`${f} names no domain in its code`,
      !/blackhole|volatility|pendulum|lorenz|accretion/i.test(code));
  }

  // ── THE TRUST BOUNDARY ────────────────────────────────────────
  //
  // This used to assert that a scene arriving from the extractor could carry a
  // built model, and that was the hole: `built` means the ENGINE produced and
  // verified this state, and everything downstream trusts it — the router runs
  // solvers on it, the renderer draws it as computed, the conversation is told
  // its numbers are results. A language model writing model-shaped JSON is not
  // that. So the default path now STRIPS it, and the only way to a built model
  // is buildProposal on the server (lib/model/propose.ts).
  const { sanitizeViz } = await import('./.tmp/logos-viz.mjs');
  const asProposal = sanitizeViz({
    kind: 'surface', expr: 'x^2 - y^2', varName: 'x', view: { xMin: -3, xMax: 3 },
    params: [], built: saddle(),
  });
  ok('a model may not present a built model', !asProposal?.built);
  const proposing = sanitizeViz({
    kind: 'diagram', view: { xMin: -1, xMax: 1 }, params: [],
    parts: [{ o: 'hrule', at: 0 }],
    propose: { id: 'm', title: 'A model', objects: [], params: [] },
  });
  ok('  it may propose one instead', !!proposing?.propose);
  const stored = sanitizeViz(
    {
      kind: 'surface', expr: 'x^2 - y^2', varName: 'x', view: { xMin: -3, xMax: 3 },
      params: [], built: saddle(),
    },
    { trust: 'stored' }
  );
  ok('a model from this product’s own storage is kept', !!stored?.built && stored.built.objects.length === 2);
  const notComputable = sanitizeViz(
    {
      kind: 'surface', expr: 'x', varName: 'x', view: { xMin: -1, xMax: 1 }, params: [],
      built: { id: 'x', title: 'T', objects: [{ id: 'o', kind: 'annotation', label: 'O' }], params: [] },
    },
    { trust: 'stored' }
  );
  ok('  …and one that no longer computes loses the claim rather than keeping it',
    !notComputable?.built);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
