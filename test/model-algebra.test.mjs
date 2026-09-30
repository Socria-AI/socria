// A SYSTEM OF EQUATIONS IS NOT A PICTURE.
//
// THE FAILURE THIS SUITE IS WRITTEN AGAINST, reproduced exactly before the fix
// (and reproduced again below, in `the failure, as it was`):
//
//   Qd = 120 - 2Pc
//   Qs = -20 + 3Pp
//   Pc = Pp + t,   t = 10
//   Qd = Qs
//
//   built             : yes
//   equations kept    : yes
//   controls made     : yes
//   equilibrium       : NOT COMPUTED
//   drawn             : an empty 3D cartesian cube
//   footer            : "drawn to make the idea legible, not computed"
//
// Four relationships that determine four unknowns exactly, and nothing anywhere
// attempted to solve them: `SOLVERS` carried a `symbolic` entry marked
// `future: true` and that was the whole of the engine's algebra.
//
// WHAT IS ASSERTED HERE. Every number below is checked against an answer worked
// out by hand, and the residual is checked too — a solve that produces the right
// numbers by luck and cannot say how close it came is not a solve. The general
// cases come first on purpose: economics is the LAST section of this file, and
// if the machinery only worked there it would fail every section above it.

import { readFileSync } from 'node:fs';
import { linearize, solveLinear, solveSystem } from './.tmp/algebra.mjs';
import { axesFor, expandEquations, figureFor, solutionFor } from './.tmp/equations.mjs';
import { buildProposal } from './.tmp/propose.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { buildSpec, chooseRepresentation } from './.tmp/spec.mjs';
import { buildObject } from './.tmp/compile.mjs';
import { sanitizeModel } from './.tmp/schema.mjs';
import { affectedBy } from './.tmp/deps.mjs';
import { OPERATIONS, askFor, operationsOn, route } from './.tmp/solve.mjs';
import { EMPTY_WORKSPACE, applyModelOps, modelFor, openFromProposal } from './.tmp/docs.mjs';
import { parseVizOps } from './.tmp/viz-model.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, eps = 1e-9) => Number.isFinite(a) && Math.abs(a - b) < eps;

/** A bare system, with no model around it: the solver on its own. */
const solve = (relations, unknowns, knowns = {}) => solveSystem(relations, unknowns, knowns);

// ── THE SOLVER, ON THE CASES THE BRIEF NAMES ────────────────────────
{
  // TEST A: two independent equations, two unknowns.
  const a = solve(['x + y = 10', '2 * x - y = 5'], ['x', 'y']);
  ok('A: status solved', a.status === 'solved', a.status);
  ok('A: x = 5', near(a.values?.x, 5), String(a.values?.x));
  ok('A: y = 5', near(a.values?.y, 5), String(a.values?.y));
  ok('A: rank 2', a.rank === 2, String(a.rank));
  ok('A: residual reported and zero', near(a.residual, 0), String(a.residual));
  ok('A: says the answer', /x = 5/.test(a.says) && /y = 5/.test(a.says), a.says);

  // TEST B: one equation, two unknowns.
  const b = solve(['x + y = 10'], ['x', 'y']);
  ok('B: underdetermined', b.status === 'underdetermined', b.status);
  ok('B: no values invented', b.values === undefined);
  ok('B: names the free unknown', (b.free ?? []).includes('y'), JSON.stringify(b.free));
  ok('B: asks for one more relationship', /one more relationship/i.test(b.says), b.says);

  // TEST C: two equations that contradict each other.
  const c = solve(['x + y = 10', 'x + y = 12'], ['x', 'y']);
  ok('C: inconsistent', c.status === 'inconsistent', c.status);
  ok('C: no values invented', c.values === undefined);
  ok('C: says they contradict', /contradict/i.test(c.says), c.says);
  ok('C: names the impossible requirement', /0 = /.test(c.says), c.says);

  // TEST D: two equations that are the same equation twice.
  const d = solve(['2 * x + 2 * y = 20', 'x + y = 10'], ['x', 'y']);
  ok('D: underdetermined, not solved', d.status === 'underdetermined', d.status);
  ok('D: rank 1, not 2', d.rank === 1, String(d.rank));
  ok('D: no values invented', d.values === undefined);

  // TEST E: three equations, three unknowns.
  //   x + y + z = 6 ; 2x - y + z = 3 ; -x + 2y + 3z = 14   →  x = 1, y = 2, z = 3
  const e = solve(['x + y + z = 6', '2*x - y + z = 3', '-x + 2*y + 3*z = 12'], ['x', 'y', 'z']);
  ok('E: solved', e.status === 'solved', e.status);
  ok('E: x = 1', near(e.values?.x, 1), String(e.values?.x));
  ok('E: y = 2', near(e.values?.y, 2), String(e.values?.y));
  ok('E: z = 3', near(e.values?.z, 3), String(e.values?.z));
  ok('E: rank 3', e.rank === 3);
  ok('E: residual zero', near(e.residual, 0, 1e-12), String(e.residual));

  // …and one more equation that follows from those three: consistent, and said
  // to be extra rather than counted as new information.
  const over = solve(
    ['x + y + z = 6', '2*x - y + z = 3', '-x + 2*y + 3*z = 12', 'x + z = 4'],
    ['x', 'y', 'z']
  );
  ok('overdetermined and consistent', over.status === 'overdetermined-consistent', over.status);
  ok('  still the same answer', near(over.values?.x, 1) && near(over.values?.z, 3));
  ok('  rank is 3, not 4', over.rank === 3, String(over.rank));
  ok('  says the extra one follows', /follow/.test(over.says), over.says);

  // …and one more that CONTRADICTS them: caught, not averaged.
  const clash = solve(
    ['x + y + z = 6', '2*x - y + z = 3', '-x + 2*y + 3*z = 12', 'x + z = 9'],
    ['x', 'y', 'z']
  );
  ok('an extra equation that disagrees is inconsistent', clash.status === 'inconsistent', clash.status);
}

// ── WHAT IT REFUSES, AND SAYS IT REFUSES ────────────────────────────
{
  const products = solve(['x * y = 10', 'x + y = 7'], ['x', 'y']);
  ok('a product of two unknowns is refused', products.status === 'nonlinear', products.status);
  ok('  and named', /multiplied together/.test(products.says), products.says);

  const square = solve(['x^2 = 4'], ['x']);
  ok('a square is refused', square.status === 'nonlinear', square.status);
  ok('  and says which equation', /x\^2 = 4/.test(square.says), square.says);

  const trig = solve(['sin(x) = 0', 'x + y = 1'], ['x', 'y']);
  ok('a sine is refused', trig.status === 'nonlinear', trig.status);

  const recip = solve(['1 / x = 2'], ['x']);
  ok('a reciprocal is refused', recip.status === 'nonlinear' || recip.status === 'invalid', recip.status);

  const notEq = solve(['x + y'], ['x', 'y']);
  ok('something with no = is invalid', notEq.status === 'invalid', notEq.status);
  ok('  and says why', /one = sign/.test(notEq.says), notEq.says);

  const twoEq = solve(['x = y = 3'], ['x', 'y']);
  ok('two = signs is invalid', twoEq.status === 'invalid', twoEq.status);

  const nothing = solve(['x + y = 10'], []);
  ok('no unknowns is invalid', nothing.status === 'invalid', nothing.status);

  const noEquations = solveLinear([], ['x', 'y']);
  ok('no equations is underdetermined, not solved', noEquations.status === 'underdetermined');
  ok('  and says nothing relates them', /nothing relates/.test(noEquations.says), noEquations.says);

  // A NONLINEAR SYSTEM MUST NOT PRODUCE A CONFIDENT WRONG ROW. The probe would
  // happily read `x*y` as linear with the wrong coefficient if nobody checked.
  const row = linearize('x * y = 10', ['x', 'y'], {});
  ok('linearize refuses the row rather than guessing it', 'problem' in row, JSON.stringify(row));
}

// ── THE ARITHMETIC IS SCALED, NOT ABSOLUTE ──────────────────────────
{
  // A circuit in amps: coefficients of 1e-6, an answer of 1e-6. A fixed epsilon
  // calls every coefficient here zero and reports a singular system.
  const tiny = solve(['0.000001 * i1 + 0.000002 * i2 = 0.000005', 'i1 - i2 = 1'], ['i1', 'i2']);
  ok('microamps solve', tiny.status === 'solved', tiny.status);
  ok('  i1 = 7/3', near(tiny.values?.i1, 7 / 3, 1e-9), String(tiny.values?.i1));
  ok('  i2 = 4/3', near(tiny.values?.i2, 4 / 3, 1e-9), String(tiny.values?.i2));

  // …and the same system in millions.
  const huge = solve(['1e6 * a + 2e6 * b = 5e6', 'a - b = 1'], ['a', 'b']);
  ok('millions solve to the same numbers', near(huge.values?.a, 7 / 3, 1e-9), String(huge.values?.a));

  // Partial pivoting: a leading zero on the diagonal is not a failure.
  const pivot = solve(['0 * x + y = 2', 'x + y = 5'], ['x', 'y']);
  ok('a zero pivot is handled', pivot.status === 'solved', pivot.status);
  ok('  x = 3, y = 2', near(pivot.values?.x, 3) && near(pivot.values?.y, 2));
}

// ── KNOWNS COME FROM THE SYMBOL TABLE, NOT FROM A SECOND OPINION ────
{
  // A coefficient carrying a value — not a control — is a known. This is the
  // binding bug's other half: the solver must read the same table everything
  // else reads, or a quantity the model knows the value of is "missing".
  const m = sanitizeModel({
    id: 'fit', title: 'A relationship with a fitted slope', params: [],
    objects: [
      { id: 'slope', kind: 'coefficient', label: 'slope', value: 4 },
      { id: 'sys', kind: 'system', label: 'Where they meet', equations: {
        unknowns: ['u', 'v'], relations: ['v = slope * u', 'u + v = 10'] } },
    ],
  });
  const got = solutionFor(m, m.objects.find((o) => o.equations));
  ok('a fitted coefficient counts as known', got?.status === 'solved', got?.status);
  ok('  u = 2, v = 8', near(got?.values?.u, 2) && near(got?.values?.v, 8), JSON.stringify(got?.values));

  // An unknown nothing binds is not filled in with zero.
  const loose = sanitizeModel({
    id: 'loose', title: 'A relationship with no slope', params: [],
    objects: [{ id: 'sys', kind: 'system', label: 'Where they meet', equations: {
      unknowns: ['u', 'v'], relations: ['v = slope * u', 'u + v = 10'] } }],
  });
  const none = solutionFor(loose, loose.objects[0]);
  ok('an unbound name is not treated as zero', none?.status !== 'solved', JSON.stringify(none?.values));

  // Capital names: the grammar is case-insensitive and the solver must be too.
  const caps = solve(['Qd = 100 - 2 * P', 'Qd = -20 + 3 * P'], ['Qd', 'P']);
  ok('capitalised unknowns solve', caps.status === 'solved', caps.status);
  ok('  P = 24, Qd = 52', near(caps.values?.P, 24) && near(caps.values?.Qd, 52), JSON.stringify(caps.values));
}

// ── SOLVE IS A FIRST-CLASS OPERATION ────────────────────────────────
const crossing = () => ({
  id: 'lines', title: 'Two lines', params: [
    { id: 'k', label: 'intercept', value: 10, min: 0, max: 40, step: 1 },
  ],
  objects: [{ id: 'sys', kind: 'system', label: 'Where they cross', equations: {
    unknowns: ['x', 'y'], relations: ['x + y = k', '2 * x - y = 5'] } }],
});
{
  ok('solve is in the operation list', OPERATIONS.includes('solve'), JSON.stringify(OPERATIONS));

  const built = buildProposal(crossing(), { at: 1 });
  ok('a system of equations builds', built.ok, built.ok ? '' : built.refusal.says);
  const m = unpack(built.model);
  const carrier = m.objects.find((o) => o.equations);
  ok('  graded computational', built.report.capability === 'computational', built.report.capability);
  ok('  routes solve as runnable', route(m, carrier, 'solve').status === 'runnable',
    JSON.stringify(route(m, carrier, 'solve')));
  ok('  by a real solver, not an interface', route(m, carrier, 'solve').solver?.id === 'linear');
  ok('  and operationsOn lists solve',
    operationsOn(m, carrier).some((v) => v.operation === 'solve'),
    JSON.stringify(operationsOn(m, carrier).map((v) => v.operation)));
  const asked = askFor(m, 'solve');
  ok('  askFor(solve) is runnable', asked.status === 'runnable', JSON.stringify(asked));

  // The solved unknowns exist as objects, with computed provenance.
  const xs = m.objects.find((o) => o.id === 'sys__x');
  ok('each unknown becomes an object', !!xs);
  ok('  carrying the value', near(xs?.meta?.value, 5), String(xs?.meta?.value));
  ok('  graded model-derived', xs?.fidelity === 'model-derived', xs?.fidelity);
  ok('  with computation as its origin', xs?.provenance?.origin === 'computation', xs?.provenance?.origin);
  ok('  NOT user, estimated or observed',
    !['user', 'estimate', 'data'].includes(xs?.provenance?.origin ?? ''), xs?.provenance?.origin);
  ok('  and the residual in its provenance', /residual/.test(xs?.provenance?.detail ?? ''), xs?.provenance?.detail);

  // …and an unknown the equations DO NOT determine says so, rather than reading
  // as a computed zero.
  const thin = unpack(sanitizeModel({
    id: 'thin', title: 'Half a system', params: [],
    objects: [{ id: 'sys', kind: 'system', label: 'One relationship', equations: {
      unknowns: ['x', 'y'], relations: ['x + y = 10'] } }],
  }));
  const free = thin.objects.find((o) => o.id === 'sys__y');
  ok('an undetermined unknown has no value', free?.meta?.value === undefined);
  ok('  and is not graded computed', free?.fidelity === 'conceptual', free?.fidelity);
  ok('  and its origin is the equation, not a computation', free?.provenance?.origin === 'equation');
}

// ── REPRESENTATION: THE FAILURE, AS IT WAS, AND AS IT IS NOW ────────
{
  // THE OLD SHAPE. A proposal that names the relationships in labels and carries
  // surface objects with nothing to evaluate: three dimensions chosen from the
  // kind alone, nothing drawn, and captioned as a deliberate illustration.
  const before = sanitizeModel({
    id: 'market', title: 'Market with a tax', params: [{ id: 't', label: 'tax', value: 10, min: 0, max: 50 }],
    objects: [
      { id: 'demand', kind: 'surface', label: 'Demand: Qd = 120 - 2Pc' },
      { id: 'supply', kind: 'surface', label: 'Supply: Qs = -20 + 3Pp' },
    ],
  });
  const wasSpec = buildSpec(before);
  ok('the old shape chose three dimensions', wasSpec.dimensionality === 3);
  ok('  and drew nothing', wasSpec.primitives.length === 0);
  ok('  which is the empty cube, reproduced', wasSpec.dimensionality === 3 && !wasSpec.primitives.length);
  ok('  …and at least now says why', wasSpec.notes.every((n) => n.of === 'demand' || n.of === 'supply' ? !!n.problem : true));

  // THE NEW SHAPE. The same relationships, written as relations.
  const m = unpack(buildProposal(crossing(), { at: 1 }).model);
  const choice = chooseRepresentation(m);
  ok('an equation system chooses the plane', choice.dimensionality === 2, JSON.stringify(choice));
  ok('  and says why in terms of the structure', /lines in the plane/.test(choice.why), choice.why);

  // FOUR UNKNOWNS IS STILL THE PLANE. The rule under test is that the number of
  // variables does not set the number of visual dimensions.
  const four = unpack(buildProposal({
    id: 'four', title: 'Four unknowns', params: [],
    objects: [{ id: 'sys', kind: 'system', label: 'Four', equations: {
      unknowns: ['p', 'q', 'r', 's'],
      relations: ['p + q = 10', 'p - q = 2', 'r = p + 1', 's = q * 2'] } }],
  }, { at: 1 }).model);
  ok('four unknowns is still two dimensions', chooseRepresentation(four).dimensionality === 2);
}

// ── THE FIGURE COMES OUT OF THE EQUATIONS ───────────────────────────
{
  const m = unpack(buildProposal(crossing(), { at: 1 }).model);
  const carrier = m.objects.find((o) => o.equations);
  const fig = figureFor(m, carrier);
  ok('there is a figure', !!fig);
  ok('  x on one axis, y on the other', fig.h.of.join() === 'x' && fig.v.of.join() === 'y',
    `${fig.h.of.join()} / ${fig.v.of.join()}`);
  ok('  both relations are lines in it', fig.loci.length === 2, String(fig.loci.length));
  ok('  crossing at the solution', fig.points.length === 1 && near(fig.points[0].x, 5) && near(fig.points[0].y, 5),
    JSON.stringify(fig.points));
  // The lines are the equations, not a shape: check them AT their own endpoints.
  const l1 = fig.loci.find((l) => /x \+ y/.test(l.from));
  ok('  x + y = 10 has slope -1 through (0,10)',
    l1.at.every((p) => near(p.x + p.y, 10, 1e-9)), JSON.stringify(l1.at));
  const l2 = fig.loci.find((l) => /2 \* x - y/.test(l.from));
  ok('  2x - y = 5 holds at both its ends',
    l2.at.every((p) => near(2 * p.x - p.y, 5, 1e-9)), JSON.stringify(l2.at));

  const drawn = buildObject(m, carrier);
  ok('  and it draws', drawn.primitives.length > 0, drawn.problem ?? '');
  ok('  as model-derived', drawn.fidelity === 'model-derived', drawn.fidelity);
  ok('  with the residual in the note', /residual/.test(drawn.note), drawn.note);
  const poly = drawn.primitives.filter((p) => p.p === 'polyline');
  ok('  two polylines, one per relation', poly.length === 2, String(poly.length));
  ok('  every vertex finite', poly.flatMap((p) => p.at).every((v) => Number.isFinite(v.x) && Number.isFinite(v.y)));
  ok('  and a point at the answer',
    drawn.primitives.some((p) => p.p === 'points' && p.at.some((v) => near(v.x, 5) && near(v.y, 5))));

  // A SOLVED UNKNOWN IS NOT A MISSING PICTURE.
  const solvedX = buildObject(m, m.objects.find((o) => o.id === 'sys__x'));
  ok('a solved unknown reports no missing picture', !solvedX.problem, solvedX.problem ?? '');
  ok('  and says its value instead', /= 5/.test(solvedX.note), solvedX.note);

  // THE FOOTER IS WHAT THE ENGINE DID, NOT WHAT THE AUTHOR DECLARED.
  const spec = buildSpec(m);
  ok('the view is labelled model-derived', spec.fidelity === 'model-derived', spec.fidelity);
  ok('  not conceptual', spec.fidelity !== 'conceptual');
  ok('  no object reports a gap', !spec.notes.some((n) => n.problem),
    JSON.stringify(spec.notes.filter((n) => n.problem)));
  ok('  the axes are named from the system', spec.axisNames[0] === 'x' && spec.axisNames[1] === 'y',
    JSON.stringify(spec.axisNames));
  ok('  and the box is not forced square', spec.aspect === 'fit', spec.aspect);
}

// ── AXES COME FROM STRUCTURE, AND UNITS OVERRIDE THE STRUCTURE ──────
{
  const mk = (units) => sanitizeModel({
    id: 'axes', title: 'Grouping', params: [],
    objects: [{ id: 'sys', kind: 'system', label: 'Grouping', equations: {
      unknowns: ['qa', 'qb', 'pa', 'pb'],
      relations: ['qa = 100 - 2 * pa', 'qb = -20 + 3 * pb', 'pa = pb + 10', 'qa = qb'],
      ...(units ? { units } : {}) } }],
  });
  const plain = mk(null);
  const gp = axesFor(plain.objects[0].equations, solutionFor(plain, plain.objects[0]));
  ok('two groups from the algebra alone', gp.length === 2, JSON.stringify(gp.map((g) => g.of)));
  ok('  the pair joined by an offset shares an axis',
    gp.some((g) => g.of.includes('qa') && g.of.includes('qb')) && gp.some((g) => g.of.includes('pa') && g.of.includes('pb')),
    JSON.stringify(gp.map((g) => g.of)));
  ok('  and says what joined them', /shifts one by a constant/.test(gp[0].why), gp[0].why);

  // A SUM IS NOT AN OFFSET. `x + y = 10` must not put x and y on one axis, or
  // two lines crossing would collapse onto a number line.
  const sum = solve(['x + y = 10', '2 * x - y = 5'], ['x', 'y']);
  const gs = axesFor({ unknowns: ['x', 'y'] }, sum);
  ok('a sum does not group its unknowns', gs.length === 2, JSON.stringify(gs.map((g) => g.of)));

  // DECLARED UNITS BLOCK A GROUPING THE FORM WOULD MAKE.
  const split = mk({ qa: 'units', qb: 'units', pa: 'dollars', pb: 'euros' });
  const gu = axesFor(split.objects[0].equations, solutionFor(split, split.objects[0]));
  ok('different declared units are never one axis',
    !gu.some((g) => g.of.includes('pa') && g.of.includes('pb')), JSON.stringify(gu.map((g) => g.of)));

  // …and the same units join two unknowns the algebra never linked.
  const joined = sanitizeModel({
    id: 'joined', title: 'Same unit', params: [],
    objects: [{ id: 'sys', kind: 'system', label: 'Same unit', equations: {
      unknowns: ['h1', 'h2', 'w'],
      relations: ['h1 = 2 * w', 'h2 = 3 * w', 'w = 4'],
      units: { h1: 'm', h2: 'm', w: 's' } } }],
  });
  const gj = axesFor(joined.objects[0].equations, solutionFor(joined, joined.objects[0]));
  ok('the same declared unit is one axis',
    gj.some((g) => g.of.includes('h1') && g.of.includes('h2')), JSON.stringify(gj.map((g) => g.of)));
}

// ── DEPENDENCY PROPAGATION ──────────────────────────────────────────
{
  const m = unpack(buildProposal(crossing(), { at: 1 }).model);
  const reached = affectedBy(m, ['k']);
  ok('moving a control the relations use reaches the solutions',
    reached.includes('sys__x') && reached.includes('sys__y'), JSON.stringify(reached));
  ok('  and the system itself', reached.includes('sys'), JSON.stringify(reached));

  const unrelated = unpack(buildProposal({
    id: 'aside', title: 'One control the relations never use', params: [
      { id: 'k', label: 'intercept', value: 10, min: 0, max: 40 },
      { id: 'zoom', label: 'zoom', value: 2, min: 1, max: 9 },
    ],
    objects: [{ id: 'sys', kind: 'system', label: 'Where they cross', equations: {
      unknowns: ['x', 'y'], relations: ['x + y = k', '2 * x - y = 5'] } }],
  }, { at: 1 }).model);
  ok('a control the relations never mention reaches nothing',
    !affectedBy(unrelated, ['zoom']).includes('sys__x'), JSON.stringify(affectedBy(unrelated, ['zoom'])));
}

// ── THE ECONOMIC ACCEPTANCE TEST ────────────────────────────────────
//
// LAST, deliberately. Everything above is the machinery; this is one more model
// that goes through it, and there is no branch anywhere below that knows what a
// market is.
const market = (t = 10) => ({
  id: 'market', title: 'Market with a tax',
  params: [
    { id: 'a', label: 'demand intercept', value: 120, min: 0, max: 300, step: 1 },
    { id: 'b', label: 'demand slope', value: -2, min: -10, max: 0, step: 0.1 },
    { id: 'c', label: 'supply intercept', value: -20, min: -100, max: 100, step: 1 },
    { id: 'd', label: 'supply slope', value: 3, min: 0, max: 10, step: 0.1 },
    { id: 't', label: 'tax', value: t, min: 0, max: 50, step: 1 },
  ],
  objects: [{ id: 'eq', kind: 'system', label: 'Equilibrium', equations: {
    unknowns: ['qd', 'qs', 'pc', 'pp'],
    relations: ['qd = a + b * pc', 'qs = c + d * pp', 'pc = pp + t', 'qd = qs'],
    units: { qd: 'units', qs: 'units', pc: 'currency', pp: 'currency' },
    about: 'the quantity and the two prices at which the market clears' } }],
});

{
  const built = buildProposal(market(10), { at: 1 });
  ok('the market builds', built.ok, built.ok ? '' : built.refusal.says);
  const m = unpack(built.model);
  const carrier = m.objects.find((o) => o.equations);
  const got = solutionFor(m, carrier);
  ok('t = 10: Pp = 24', near(got.values.pp, 24), String(got.values.pp));
  ok('t = 10: Pc = 34', near(got.values.pc, 34), String(got.values.pc));
  ok('t = 10: Q* = 52', near(got.values.qd, 52), String(got.values.qd));
  ok('t = 10: Qd = Qs', near(got.values.qd, got.values.qs), `${got.values.qd} vs ${got.values.qs}`);
  ok('t = 10: residual checked and zero', near(got.residual, 0, 1e-9), String(got.residual));

  const spec = buildSpec(m);
  ok('t = 10: drawn in the plane', spec.dimensionality === 2, String(spec.dimensionality));
  ok('t = 10: NOT an empty cube', spec.primitives.length > 0, String(spec.primitives.length));
  ok('t = 10: labelled computed', spec.fidelity === 'model-derived', spec.fidelity);
  ok('t = 10: nothing reports a gap', !spec.notes.some((n) => n.problem),
    JSON.stringify(spec.notes.filter((n) => n.problem)));

  const fig = figureFor(m, carrier);
  ok('t = 10: quantity against price', fig.h.units === 'units' && fig.v.units === 'currency',
    `${fig.h.units} / ${fig.v.units}`);
  const demand = fig.loci.find((l) => /qd = /.test(l.from));
  ok('t = 10: the demand line IS the demand equation',
    demand.at.every((p) => near(p.x, 120 - 2 * p.y, 1e-9)), JSON.stringify(demand.at));
  const supply = fig.loci.find((l) => /qs = /.test(l.from));
  ok('t = 10: the supply line IS the supply equation',
    supply.at.every((p) => near(p.x, -20 + 3 * p.y, 1e-9)), JSON.stringify(supply.at));
  ok('t = 10: a wedge between the two prices', fig.gaps.length === 1, String(fig.gaps.length));
  ok('t = 10: and it is 10 long', near(fig.gaps[0].size, 10), String(fig.gaps[0]?.size));
  ok('t = 10: at the equilibrium quantity', near(fig.gaps[0].at, 52), String(fig.gaps[0]?.at));
  ok('t = 10: from Pp to Pc', near(fig.gaps[0].lo, 24) && near(fig.gaps[0].hi, 34), JSON.stringify(fig.gaps[0]));
}

// ── MOVING THE TAX RECOMPUTES, ON ONE DOCUMENT ──────────────────────
{
  let ws = openFromProposal(EMPTY_WORKSPACE, market(10), { at: 1 }).workspace;
  const id = ws.docs[0].id;
  const read = () => {
    const m = modelFor(ws.docs.find((d) => d.id === id));
    return Object.fromEntries(
      m.objects.filter((o) => o.meta?.role === 'solution').map((o) => [o.label, o.meta.value])
    );
  };
  const wedge = () => {
    const m = modelFor(ws.docs.find((d) => d.id === id));
    return figureFor(m, m.objects.find((o) => o.equations))?.gaps ?? [];
  };

  const at10 = read();
  ok('on the document: t = 10 gives 24 / 34 / 52',
    near(at10.pp, 24) && near(at10.pc, 34) && near(at10.qd, 52), JSON.stringify(at10));

  ws = applyModelOps(ws, [{ op: 'set', id: 't', value: 20 }], { at: 2 }).workspace;
  const at20 = read();
  ok('t = 20: Pp = 20', near(at20.pp, 20), String(at20.pp));
  ok('t = 20: Pc = 40', near(at20.pc, 40), String(at20.pc));
  ok('t = 20: Q* = 40', near(at20.qd, 40), String(at20.qd));
  ok('t = 20: the wedge is 20', near(wedge()[0]?.size, 20), JSON.stringify(wedge()));

  ws = applyModelOps(ws, [{ op: 'set', id: 't', value: 0 }], { at: 3 }).workspace;
  const at0 = read();
  ok('t = 0: one price, 28', near(at0.pc, 28) && near(at0.pp, 28), JSON.stringify(at0));
  ok('t = 0: Q* = 64', near(at0.qd, 64), String(at0.qd));
  ok('t = 0: no wedge is drawn', wedge().length === 0, JSON.stringify(wedge()));

  // …and back, on the same document, by the model's own undo.
  ws = applyModelOps(ws, [{ op: 'undo' }], { at: 4 }).workspace;
  ok('undo returns to t = 20', near(read().pp, 20), JSON.stringify(read()));
  ok('  on the same document', ws.docs[0].id === id);

  // THE STALENESS BUG, PINNED. `expandEquations` skipped an id it had already
  // written, so a solved value survived the change that invalidated it and the
  // equilibrium read 24 / 34 / 52 at every tax.
  ok('the solve re-ran rather than being skipped as already present',
    !near(at10.pp, at20.pp) && !near(at20.pp, at0.pp));
  const m = modelFor(ws.docs.find((d) => d.id === id));
  ok('  and there is exactly one object per unknown',
    m.objects.filter((o) => o.meta?.role === 'solution').length === 4,
    String(m.objects.filter((o) => o.meta?.role === 'solution').length));
}

// ── DELETING A RELATIONSHIP, AND PUTTING IT BACK ────────────────────
{
  let ws = openFromProposal(EMPTY_WORKSPACE, market(10), { at: 1 }).workspace;
  const id = ws.docs[0].id;
  const m0 = modelFor(ws.docs.find((d) => d.id === id));
  ok('before: the equilibrium is there', near(m0.objects.find((o) => o.id === 'eq__pp')?.meta?.value, 24));

  const dropped = applyModelOps(ws, [{ op: 'relate', of: 'eq', is: 'pc = pp + t', drop: true }], { at: 2 });
  ws = dropped.workspace;
  ok('the relation can be dropped', dropped.changed, JSON.stringify(dropped.said));
  ok('  and the reply says what the system now is', /Not solved/.test(dropped.said.join(' ')), dropped.said.join(' '));
  ok('  naming what is missing', /one more relationship/i.test(dropped.said.join(' ')), dropped.said.join(' '));
  ok('  and that the old answer no longer holds',
    /no longer holds/.test(dropped.said.join(' ')), dropped.said.join(' '));

  const m1 = modelFor(ws.docs.find((d) => d.id === id));
  const pp1 = m1.objects.find((o) => o.id === 'eq__pp');
  ok('the old equilibrium is NOT still shown', pp1?.meta?.value === undefined, String(pp1?.meta?.value));
  ok('  and it is no longer graded computed', pp1?.fidelity === 'conceptual', pp1?.fidelity);
  const carrier1 = m1.objects.find((o) => o.equations);
  ok('  the system routes as incomplete', route(m1, carrier1, 'solve').status === 'incomplete',
    JSON.stringify(route(m1, carrier1, 'solve')));
  const drawn1 = buildObject(m1, carrier1);
  ok('  nothing is drawn', drawn1.primitives.length === 0);
  ok('  and the gap is stated, not hidden', /not computed/.test(drawn1.problem ?? ''), drawn1.problem ?? '');
  ok('  saying which unknown is now free', /pp|pc/.test(drawn1.problem ?? ''), drawn1.problem ?? '');

  const back = applyModelOps(ws, [{ op: 'undo' }], { at: 3 });
  ws = back.workspace;
  const m2 = modelFor(ws.docs.find((d) => d.id === id));
  ok('undo restores the relation and recomputes',
    near(m2.objects.find((o) => o.id === 'eq__pp')?.meta?.value, 24),
    String(m2.objects.find((o) => o.id === 'eq__pp')?.meta?.value));
  ok('  and it draws again', buildObject(m2, m2.objects.find((o) => o.equations)).primitives.length > 0);

  // Adding a DIFFERENT relationship is a different model, and it solves.
  const other = applyModelOps(
    applyModelOps(ws, [{ op: 'relate', of: 'eq', is: 'pc = pp + t', drop: true }], { at: 4 }).workspace,
    [{ op: 'relate', of: 'eq', is: 'pc = pp * 2' }],
    { at: 5 }
  );
  const m3 = modelFor(other.workspace.docs.find((d) => d.id === id));
  const pp3 = m3.objects.find((o) => o.id === 'eq__pp')?.meta?.value;
  // qd = 120 - 2(2pp) = 120 - 4pp ; qs = -20 + 3pp ; equal → 140 = 7pp → pp = 20
  ok('a replacement relationship solves to its own answer', near(pp3, 20), String(pp3));

  // A relation that is not there cannot be dropped, and says what is.
  const missing = applyModelOps(ws, [{ op: 'relate', of: 'eq', is: 'pc = pp + 99', drop: true }], { at: 6 });
  ok('dropping something absent is refused', !missing.changed);
  ok('  and lists what the system does relate', /pc = pp \+ t/.test(missing.said.join(' ')), missing.said.join(' '));

  // The verb survives the reply grammar it arrives in.
  const parsed = parseVizOps(
    '```socria-viz\nunrelate eq pc = pp + t\n```',
    { params: [], layers: [], entities: [{ id: 'eq', label: 'Equilibrium' }], edits: { can: [] } }
  );
  ok('the reply grammar parses an unrelate',
    parsed.length === 1 && parsed[0].op === 'relate' && parsed[0].drop === true && parsed[0].is === 'pc = pp + t',
    JSON.stringify(parsed));
  const parsedAdd = parseVizOps(
    '```socria-viz\nrelate eq pc = pp * 2\n```',
    { params: [], layers: [], entities: [{ id: 'eq', label: 'Equilibrium' }], edits: { can: [] } }
  );
  ok('  and a relate', parsedAdd.length === 1 && !parsedAdd[0].drop && parsedAdd[0].is === 'pc = pp * 2',
    JSON.stringify(parsedAdd));
  ok('  and refuses one with no = sign',
    parseVizOps('```socria-viz\nrelate eq nonsense\n```',
      { params: [], layers: [], entities: [{ id: 'eq', label: 'e' }], edits: { can: [] } }).length === 0);
  ok('  and refuses one naming something not on screen',
    parseVizOps('```socria-viz\nrelate ghost x = 1\n```',
      { params: [], layers: [], entities: [{ id: 'eq', label: 'e' }], edits: { can: [] } }).length === 0);
}

// ── THE SAME MACHINERY, ON THREE SUBJECTS THAT ARE NOT MARKETS ──────
{
  // A resistive circuit: two loop currents, Kirchhoff's voltage law.
  //   10 i1 + 5(i1 - i2) = 12 ; 20 i2 + 5(i2 - i1) = 0
  //   → 15 i1 - 5 i2 = 12 ; -5 i1 + 25 i2 = 0  →  i1 = 0.8571…, i2 = 0.1714…
  const circuit = solve(
    ['15 * i1 - 5 * i2 = 12', '-5 * i1 + 25 * i2 = 0'],
    ['i1', 'i2']
  );
  ok('a circuit solves', circuit.status === 'solved', circuit.status);
  ok('  i1 = 60/70', near(circuit.values.i1, 12 * 25 / 350, 1e-12), String(circuit.values.i1));
  ok('  i2 = i1/5', near(circuit.values.i2, circuit.values.i1 / 5, 1e-12));

  // A static force balance: two supports under a load, moments about one end.
  //   Ra + Rb = 900 ; 10 Rb = 900 * 4  →  Rb = 360, Ra = 540
  const beam = solve(['ra + rb = 900', '10 * rb = 900 * 4'], ['ra', 'rb']);
  ok('a force balance solves', near(beam.values.ra, 540) && near(beam.values.rb, 360), JSON.stringify(beam.values));

  // A mixture: 40 litres at 30% from stocks at 20% and 50%.
  //   x + y = 40 ; 0.2x + 0.5y = 12  →  y = 40/3, x = 80/3
  const mix = solve(['x + y = 40', '0.2 * x + 0.5 * y = 12'], ['x', 'y']);
  ok('a mixture solves', near(mix.values.y, 40 / 3, 1e-9) && near(mix.values.x, 80 / 3, 1e-9),
    JSON.stringify(mix.values));

  // Each of those draws, by the same code, with no domain anywhere.
  for (const [name, model] of [
    ['circuit', { id: 'circ', title: 'Two loops', params: [], objects: [
      { id: 'sys', kind: 'system', label: 'Loops', equations: {
        unknowns: ['i1', 'i2'], relations: ['15 * i1 - 5 * i2 = 12', '-5 * i1 + 25 * i2 = 0'] } }] }],
    ['beam', { id: 'beam', title: 'Two supports', params: [], objects: [
      { id: 'sys', kind: 'system', label: 'Supports', equations: {
        unknowns: ['ra', 'rb'], relations: ['ra + rb = 900', '10 * rb = 3600'] } }] }],
  ]) {
    const m = unpack(buildProposal(model, { at: 1 }).model);
    const spec = buildSpec(m);
    ok(`a ${name} draws in the plane`, spec.dimensionality === 2 && spec.primitives.length > 0,
      `${spec.dimensionality}D, ${spec.primitives.length} primitives`);
    ok(`  and is labelled computed`, spec.fidelity === 'model-derived', spec.fidelity);
  }
}

// ── A RELATION OVER ONE AXIS IS STILL A LINE ────────────────────────
{
  // `qd = 52` fixes the horizontal quantity and nothing else: a vertical line,
  // not a relation quietly left out of the picture.
  const m = unpack(buildProposal({
    id: 'fixed', title: 'A quantity held', params: [],
    objects: [{ id: 'sys', kind: 'system', label: 'Held', equations: {
      unknowns: ['q', 'p'], relations: ['q = 52', 'p = q / 2'] } }],
  }, { at: 1 }).model);
  const carrier = m.objects.find((o) => o.equations);
  const fig = figureFor(m, carrier);
  ok('a one-axis relation is drawn', fig.loci.length === 2, String(fig.loci.length));
  ok('  nothing is reported as off-plane', fig.offPlane.length === 0, JSON.stringify(fig.offPlane));
  const vertical = fig.loci.find((l) => /q = 52/.test(l.from));
  ok('  as a vertical line at q = 52', vertical.at.every((c) => near(c.x, 52)), JSON.stringify(vertical.at));
  ok('  spanning the other axis', !near(vertical.at[0].y, vertical.at[1].y));
  ok('  and it contributes no crossing point of its own', vertical.v === undefined, String(vertical.v));
  ok('  while the two-axis relation does', fig.points.length === 1, JSON.stringify(fig.points));
  ok('  at q = 52, p = 26', near(fig.points[0].x, 52) && near(fig.points[0].y, 26), JSON.stringify(fig.points));
  ok('  and it draws', buildObject(m, carrier).primitives.length > 0);
}

// ── A SURFACE THAT REALLY IS ONE STILL GETS THREE DIMENSIONS ────────
{
  // The 2D rule is "equations are lines in the plane", not "never 3D". A model
  // that also carries a surface with something to evaluate keeps its third axis.
  const m = unpack(buildProposal({
    id: 'both', title: 'A surface and a system', params: [],
    objects: [
      { id: 'surf', kind: 'surface', label: 'z over x and y', definition: 'x^2 - y^2' },
      { id: 'sys', kind: 'system', label: 'Where they cross', equations: {
        unknowns: ['u', 'v'], relations: ['u + v = 10', 'u - v = 2'] } },
    ],
  }, { at: 1 }).model);
  ok('a real surface keeps three dimensions', chooseRepresentation(m).dimensionality === 3,
    JSON.stringify(chooseRepresentation(m)));
  // …and a surface with NOTHING to evaluate does not win the argument.
  const empty = unpack(buildProposal({
    id: 'empty', title: 'A label and a system', params: [],
    objects: [
      { id: 'surf', kind: 'surface', label: 'Demand: Qd = 120 - 2Pc' },
      { id: 'sys', kind: 'system', label: 'Where they cross', equations: {
        unknowns: ['u', 'v'], relations: ['u + v = 10', 'u - v = 2'] } },
    ],
  }, { at: 1 }).model);
  ok('a surface with no expression does not', chooseRepresentation(empty).dimensionality === 2,
    JSON.stringify(chooseRepresentation(empty)));
}

// ── NO DOMAIN KNOWLEDGE IN THE MACHINERY ────────────────────────────
{
  const files = ['lib/model/algebra.ts', 'lib/model/equations.ts'];
  const banned = [
    /\bSupplyDemand/i, /\bTaxMarket/i, /EconomicEquilibrium/, /\bsupply\b/i, /\bdemand\b/i,
    /domain\s*===/, /\btax\b/i, /\bprice\b/i, /\bequilibrium\b/i,
  ];
  for (const f of files) {
    // The comments explain the failure that produced this code, so only the
    // CODE is searched: comment lines are the record of why, and removing them
    // to satisfy a grep would be the wrong trade.
    const code = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    for (const rx of banned) {
      ok(`${f} contains no ${rx.source}`, !rx.test(code),
        (code.split('\n').find((l) => rx.test(l)) ?? '').trim());
    }
  }
  // …and the solver is registered like any other, not reached directly.
  const src = readFileSync(new URL('../lib/model/solve.ts', import.meta.url), 'utf8');
  ok('the solver is in the registry', /export const ALGEBRA: Solver/.test(src));
  ok('  and declares which operation it does', /does: \['solve'\]/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
