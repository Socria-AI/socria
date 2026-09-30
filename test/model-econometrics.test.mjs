// THE TEXTBOOK LADDER, RUN AGAINST THE ENGINE.
//
// Derived from the compressed digest of an introductory econometrics text the
// user supplied as an ARCHITECTURE SOURCE. Not its exercises and not its
// examples: its computational arc, which the digest states as eleven stages and
// a thirteen-rung benchmark ladder. Every model below is written here from
// scratch to exercise a STRUCTURE the book introduces, and the numbers are
// worked out by hand so a wrong answer is visible rather than plausible.
//
// WHAT EACH RUNG ASSERTS, because the brief asked for exactly this list:
//
//   the IR              — the structure the engine actually holds
//   the operation       — which of evaluate / derive / estimate / solve / read
//   the backend         — which registered solver ran it, by id
//   the number          — checked against arithmetic done by hand
//   the provenance      — user, computation, dataset; never the wrong one
//   the representation  — the family chosen, and why it is not the other one
//   the mutation        — what changes when a parameter moves, and what does not
//   the readiness       — what is refused, and whether it is refused for the
//                         right reason
//
// AND WHAT IT REFUSES TO DO: claim a rung works because the engine can describe
// it. Rungs K, L and M are asserted UNSUPPORTED — the assertions below check
// that the engine says so by name rather than producing something plausible.

import { buildProposal, revalidate } from './.tmp/propose.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { buildSpec, chooseRepresentation } from './.tmp/spec.mjs';
import { buildObject } from './.tmp/compile.mjs';
import { sanitizeModel } from './.tmp/schema.mjs';
import { affectedBy } from './.tmp/deps.mjs';
import { askFor, plan, route } from './.tmp/solve.mjs';
import { estimate } from './.tmp/estimate.mjs';
import { marginalOf } from './.tmp/derive.mjs';
import { termColumn, termLabel, termNeeds, isPointwise } from './.tmp/terms.mjs';
import { derivativeOf } from './.tmp/expr.mjs';
import { EMPTY_WORKSPACE, applyModelOps, modelFor, openFromProposal } from './.tmp/docs.mjs';

let pass = 0, fail = 0;
const results = [];
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, eps = 1e-6) => Number.isFinite(a) && Math.abs(a - b) < eps;
const rung = (id, verdict, note) => results.push({ id, verdict, note });

const P = (id, label, value, min, max, step) => ({ id, label, value, min, max, ...(step ? { step } : {}) });
const built = (m) => {
  const b = buildProposal(m, { at: 1 });
  return b.ok ? { model: unpack(b.model), report: b.report } : { refusal: b.refusal };
};
const solverFor = (m, id, op) => {
  const r = route(m, m.objects.find((o) => o.id === id), op);
  return r.status === 'runnable' ? r.solver.id : `${r.status}`;
};
const vertices = (spec, of) => {
  const p = spec.primitives.find((q) => q.of === of);
  if (!p) return [];
  if (p.p === 'mesh') return p.rows.flat().filter(Boolean);
  return Array.isArray(p.at) ? p.at : [];
};

// ═══ A — a deterministic expression, no dataset ═════════════════════
//
// Digest rung A: "Q = 100 - 2P. Evaluate and plot over a user-specified P range.
// No dataset required." The structure is one dependent quantity over one input.
console.log('\n=== A. a deterministic relationship, evaluated ===');
{
  const m = built({
    id: 'demand', title: 'A demand relationship', domain: 'economics',
    params: [P('a', 'choke price intercept', 100, 0, 300, 1), P('b', 'slope', -2, -10, 0, 0.1)],
    // WRITTEN IN THE MODEL'S OWN VARIABLE. `over: {p: …}` names the quantity the
    // curve varies over, so the expression is in `p` and not in `x` — a
    // coordinate letter is not an execution identity either.
    objects: [{ id: 'q', kind: 'curve', label: 'quantity demanded', definition: 'a + b * p', over: { p: [0, 50] } }],
  }).model;
  ok('A: it builds and computes', !!m);
  ok('A: the model names its own variable', !!m.objects.find((o) => o.id === 'q')?.over?.p);
  ok('A: operation is evaluate', askFor(m, 'evaluate').status === 'runnable');
  ok('A: backend is the sampler', solverFor(m, 'q', 'evaluate') === 'sample', solverFor(m, 'q', 'evaluate'));
  ok('A: estimate is not even offered', askFor(m, 'estimate').status === 'unsupported',
    JSON.stringify(askFor(m, 'estimate').status));
  const spec = buildSpec(m);
  ok('A: representation is the plane', spec.dimensionality === 2, String(spec.dimensionality));
  ok('A: it is labelled computed', spec.fidelity === 'model-derived', spec.fidelity);
  const pts = vertices(spec, 'q');
  ok('A: real samples', pts.length > 100, String(pts.length));
  // At p = 20 the relationship says 100 - 40 = 60.
  const at20 = pts.reduce((best, q) => (Math.abs(q.x - 20) < Math.abs(best.x - 20) ? q : best));
  ok('A: the number is right', near(at20.y, 100 + -2 * at20.x, 1e-9), JSON.stringify(at20));
  ok('A: no observation is invented', !m.data);
  // …and a model that declares one variable and writes another is refused with
  // both halves named, rather than drawn empty.
  const mismatch = sanitizeModel({
    id: 'mismatch', title: 'a window over the wrong name',
    params: [P('a', 'a', 100, 0, 300, 1), P('b', 'b', -2, -10, 0, 0.1)],
    objects: [{ id: 'q', kind: 'curve', label: 'quantity', definition: 'a + b * p', over: { x: [0, 50] } }],
  });
  const bad = buildObject(mismatch, mismatch.objects[0]);
  ok('A: naming one variable and writing another is refused', bad.primitives.length === 0);
  ok('A:   naming the one it cannot find', /something called p/.test(bad.problem ?? ''), bad.problem);
  rung('A  deterministic expression', 'WORKS', 'evaluated by the sampler; 2D; no data asked for');
}

// ═══ B — simple OLS on supplied observations ════════════════════════
//
// Digest rung B. y = 3 + 2x exactly, so the fit must recover it exactly and the
// residuals must be zero — which is the sharpest possible test of an estimator.
console.log('\n=== B. simple least squares ===');
{
  const xs = [1, 2, 3, 4, 5, 6];
  const m = built({
    id: 'ols1', title: 'y on x', params: [],
    data: { s: { label: 'six cases', columns: { x: xs, y: xs.map((x) => 3 + 2 * x) } } },
    objects: [{ id: 'spec', kind: 'specification', label: 'y on x',
      estimation: { method: 'ols', y: 'y', x: ['x'], data: 's' } }],
  }).model;
  const got = estimate(m, m.objects.find((o) => o.id === 'spec'));
  ok('B: it fits', got.ok, got.ok ? '' : JSON.stringify(got.missing ?? got.choice?.says));
  ok('B: intercept 3', near(got.fit.terms[0].value, 3, 1e-9), String(got.fit.terms[0]?.value));
  ok('B: slope 2', near(got.fit.terms[1].value, 2, 1e-9), String(got.fit.terms[1]?.value));
  ok('B: R² is 1', near(got.fit.r2, 1, 1e-12), String(got.fit.r2));
  ok('B: residuals are zero', got.fit.residuals.every((r) => Math.abs(r) < 1e-9));
  ok('B: n is 6', got.fit.n === 6);
  ok('B: fitted values exist', got.fit.fitted.length === 6);
  ok('B: standard errors are reported', got.fit.terms.every((t) => Number.isFinite(t.se)));
  ok('B: backend is least squares', solverFor(m, 'spec', 'estimate') === 'ols', solverFor(m, 'spec', 'estimate'));
  const coef = m.objects.find((o) => o.id === 'spec__b1');
  ok('B: the coefficient is an object', !!coef);
  // A FITTED COEFFICIENT WAS COMPUTED, FROM DATA. `computation` is where it came
  // from; `data-derived` is what it is worth. Both had to be right: the fidelity
  // field was absent altogether, so an estimate graded conceptual.
  ok('B: its origin is a computation', coef?.provenance?.origin === 'computation', coef?.provenance?.origin);
  ok('B: graded data-derived', coef?.fidelity === 'data-derived', coef?.fidelity);
  ok('B: and the detail names the method and the data',
    /least squares on “s” \(ols\)/.test(coef?.provenance?.detail ?? ''), coef?.provenance?.detail);
  rung('B  simple OLS', 'WORKS', 'exact recovery of a noiseless line, SEs, R², residuals, fitted values');
}

// ═══ C — several regressors ═════════════════════════════════════════
//
// Digest rung C: partial effects and coefficient intervals. y = 1 + 2x + 3z,
// with x and z varying independently so the design is not collinear.
console.log('\n=== C. several regressors ===');
{
  const x = [1, 2, 3, 4, 5, 6, 7, 8];
  const z = [2, 1, 4, 3, 6, 5, 8, 7];
  const m = built({
    id: 'ols2', title: 'y on x and z', params: [],
    data: { s: { label: 'eight cases', columns: { x, z, y: x.map((v, i) => 1 + 2 * v + 3 * z[i]) } } },
    objects: [{ id: 'spec', kind: 'specification', label: 'y on x and z',
      estimation: { method: 'ols', y: 'y', x: ['x', 'z'], data: 's' } }],
  }).model;
  const got = estimate(m, m.objects.find((o) => o.id === 'spec'));
  ok('C: it fits', got.ok);
  ok('C: intercept 1', near(got.fit.terms[0].value, 1, 1e-8), String(got.fit.terms[0]?.value));
  ok('C: ∂y/∂x is 2, holding z', near(got.fit.terms[1].value, 2, 1e-8), String(got.fit.terms[1]?.value));
  ok('C: ∂y/∂z is 3, holding x', near(got.fit.terms[2].value, 3, 1e-8), String(got.fit.terms[2]?.value));
  ok('C: k counts the intercept', got.fit.k === 3, String(got.fit.k));
  ok('C: df is n − k', got.fit.df === 5, String(got.fit.df));
  ok('C: adjusted R² is reported separately', Number.isFinite(got.fit.adjR2));
  // Collinearity: the digest calls this out, and the estimator refuses rather
  // than reporting coefficients nobody can interpret.
  const coll = sanitizeModel({
    id: 'coll', title: 'collinear', params: [],
    data: { s: { label: 'n', columns: { x, w: x.map((v) => 2 * v), y: x } } },
    objects: [{ id: 'spec', kind: 'specification', label: 'y on x and w',
      estimation: { method: 'ols', y: 'y', x: ['x', 'w'], data: 's' } }],
  });
  const bad = estimate(coll, coll.objects[0]);
  ok('C: perfect collinearity is refused', !bad.ok);
  ok('C:   and named', /collinear/.test((bad.missing ?? [])[0]?.because ?? ''), JSON.stringify(bad.missing));
  rung('C  multiple regressors', 'WORKS', 'partial effects exact; k, df, adjusted R²; perfect collinearity refused. No variance-inflation diagnostic for NEAR collinearity');
}

// ═══ D — functional form: logs, quadratics, interactions ════════════
//
// Digest rung D, and the rung the reported failure was on. Three regressors over
// TWO variables, because exper² is a transformation and not a third variable.
console.log('\n=== D. functional form, and the failure that started this ===');
{
  const wage = (b3 = -0.03) => ({
    id: 'wage', title: 'A hypothetical wage relationship', domain: 'econometrics',
    params: [P('b0', 'β₀', 5, -20, 40, 0.5), P('b1', 'β₁ education', 2.5, 0, 10, 0.1),
      P('b2', 'β₂ experience', 1.2, 0, 5, 0.1), P('b3', 'β₃ experience squared', b3, -0.2, 0.2, 0.005)],
    objects: [{ id: 'spec', kind: 'specification', label: 'wage on education and experience',
      estimation: {
        y: 'wage', x: ['educ', 'exper', 'exper_pow2'],
        terms: { exper_pow2: { op: 'pow', of: 'exper', by: 2 } },
        coefficients: { intercept: 'b0', educ: 'b1', exper: 'b2', exper_pow2: 'b3' },
        over: { educ: [0, 20], exper: [0, 40] },
      } }],
  });
  const b = built(wage());
  const m = b.model;
  ok('D: it builds as COMPUTATIONAL, not merely stated', b.report.capability === 'computational', b.report.capability);
  ok('D: the report does not claim nothing computes',
    !/nothing in it computes yet/.test(b.report.says), b.report.says);
  ok('D: evaluate is runnable with no data at all', askFor(m, 'evaluate').status === 'runnable');
  ok('D: estimate is blocked, and only estimate', askFor(m, 'estimate').status === 'blocked');
  ok('D:   for the right reason', /observations/.test(askFor(m, 'estimate').says), askFor(m, 'estimate').says);
  // THE IR: three regressors, two axes, one of them a term.
  const resp = m.objects.find((o) => o.id === 'spec__response');
  ok('D: the surface is over two axes', resp?.meta?.axes === 'educ,exper', String(resp?.meta?.axes));
  ok('D: nothing is held', resp?.meta?.held === undefined, String(resp?.meta?.held));
  ok('D: the squared term is a function of its axis', /\(y\^2\)/.test(resp?.defs?.z ?? ''), resp?.defs?.z);
  ok('D: no free symbol survives', !/exper/.test(resp?.defs?.z ?? ''), resp?.defs?.z);
  ok('D: the window belongs to the base variable', JSON.stringify(resp?.over) === '{"x":[0,20],"y":[0,40]}',
    JSON.stringify(resp?.over));
  // THE NUMBER: at educ = 12, exper = 10 → 5 + 30 + 12 − 3 = 44.
  const spec = buildSpec(m);
  const pts = vertices(spec, 'spec__response');
  ok('D: the surface is computed', pts.length > 1000, String(pts.length));
  const at = pts.reduce((bst, p) => (Math.abs(p.x - 12) + Math.abs(p.y - 10) < bst.d ? { d: Math.abs(p.x - 12) + Math.abs(p.y - 10), p } : bst), { d: Infinity, p: null }).p;
  ok('D: and right', near(at.z, 5 + 2.5 * at.x + 1.2 * at.y - 0.03 * at.y * at.y, 1e-9), JSON.stringify(at));
  ok('D: nothing reports a missing picture', !spec.notes.some((n) => n.problem),
    JSON.stringify(spec.notes.filter((n) => n.problem)));
  ok('D: three dimensions is legitimate here', spec.dimensionality === 3, String(spec.dimensionality));
  // PROVENANCE: the βs are the person's hypotheses, not estimates.
  const b3o = m.objects.find((o) => o.id === 'spec__b3');
  ok('D: β₃ is a USER HYPOTHESIS', b3o?.provenance?.origin === 'user', b3o?.provenance?.origin);
  ok('D:   and says it carries no standard error',
    /no standard error, no interval and no significance/.test(b3o?.provenance?.detail ?? ''), b3o?.provenance?.detail);
  ok('D:   graded model-derived, not data-derived', b3o?.fidelity === 'model-derived', b3o?.fidelity);
  ok('D: NOT an estimate', b3o?.provenance?.origin !== 'computation');
  ok('D: the surface says it is not a fit',
    /not a fit, a prediction or an observation/.test(resp?.meaning ?? ''), '');
  ok('D: and that the coefficients were set as hypotheses',
    resp?.meta?.basis === 'user-set hypothetical coefficients', String(resp?.meta?.basis));
  ok('D: no standard error is invented anywhere',
    !m.objects.some((o) => typeof o.uncertainty?.plusMinus === 'number'));
  // DERIVE: the marginal effect, symbolically.
  const dExper = m.objects.find((o) => o.id === 'spec__response__d_exper');
  const dEduc = m.objects.find((o) => o.id === 'spec__response__d_educ');
  ok('D: ∂wage/∂exper exists as an object', !!dExper);
  ok('D:   = β₂ + 2β₃·exper', dExper?.meta?.expr === 'b2 + b3 * 2 * x', String(dExper?.meta?.expr));
  ok('D:   and varies', dExper?.meta?.constant === false);
  ok('D:   produced by a computation', dExper?.provenance?.origin === 'computation', dExper?.provenance?.origin);
  ok('D:   differentiated, not approximated',
    /differentiated symbolically/.test(dExper?.provenance?.detail ?? ''), dExper?.provenance?.detail);
  ok('D: ∂wage/∂educ is constant', dEduc?.meta?.constant === true);
  ok('D:   and reads as its value', /= 2\.5/.test(buildObject(m, dEduc).note), buildObject(m, dEduc).note);
  // At exper = 10, β₂ + 2β₃·exper = 1.2 − 0.6 = 0.6.
  //
  // READ FROM ITS OWN PANEL. A slope is a different quantity against a shared
  // axis — currency-per-year against experience, beside currency against
  // education and experience — so it is plotted on its own axes rather than
  // inside the surface's box, which it was distorting.
  const panel = (buildSpec(m).panels ?? []).find((p) => p.of === 'spec__response__d_exper');
  ok('D: the slope is its own panel, not a mark in the surface\'s box', !!panel,
    JSON.stringify((buildSpec(m).panels ?? []).map((p) => p.of)));
  const slope = panel?.at ?? [];
  const s10 = slope.reduce((bst, p) => (Math.abs(p.x - 10) < Math.abs(bst.x - 10) ? p : bst), { x: Infinity, y: NaN });
  ok('D: the slope at exper ≈ 10 is 1.2 − 0.06·exper',
    near(s10.y, 1.2 - 0.06 * s10.x, 1e-9), JSON.stringify(s10));
  ok('D: derive is a first-class operation', askFor(m, 'derive').status === 'runnable');
  ok('D:   with a real backend', solverFor(m, 'spec__response', 'derive') === 'differentiate',
    solverFor(m, 'spec__response', 'derive'));
  // MUTATION: β₃ reaches the surface and the slope that involves it, not the other.
  const hit = affectedBy(m, ['b3']);
  ok('D: β₃ reaches the surface', hit.includes('spec__response'));
  ok('D:   and ∂/∂exper', hit.includes('spec__response__d_exper'));
  ok('D:   and NOT ∂/∂educ, which does not involve it', !hit.includes('spec__response__d_educ'), JSON.stringify(hit));
  // …and moving it through the document recomputes.
  let ws = openFromProposal(EMPTY_WORKSPACE, wage(), { at: 1 }).workspace;
  const id = ws.docs[0].id;
  const zAt = () => {
    const mm = modelFor(ws.docs.find((d) => d.id === id));
    const p = vertices(buildSpec(mm), 'spec__response');
    return p.reduce((bst, q) => (Math.abs(q.x - 12) + Math.abs(q.y - 10) < bst.d ? { d: Math.abs(q.x - 12) + Math.abs(q.y - 10), z: q.z } : bst), { d: Infinity, z: NaN }).z;
  };
  const before = zAt();
  ws = applyModelOps(ws, [{ op: 'set', id: 'b3', value: -0.06 }], { at: 2 }).workspace;
  const after = zAt();
  ok('D: moving β₃ changes the computed surface', !near(before, after, 1e-9), `${before} → ${after}`);
  ok('D:   by exactly the amount the term says', near(before - after, 0.03 * 100, 0.4), String(before - after));
  ws = applyModelOps(ws, [{ op: 'undo' }], { at: 3 }).workspace;
  ok('D: undo restores it', near(zAt(), before, 1e-9));
  // SAVE AND RELOAD keeps the canonical state, terms and all.
  const round = revalidate(sanitizeModel(modelFor(ws.docs.find((d) => d.id === id))));
  ok('D: it survives a reload', !!round);
  ok('D:   with the term intact',
    round?.objects.find((o) => o.estimation)?.estimation?.terms?.exper_pow2?.op === 'pow', '');
  ok('D:   and still computes after it', vertices(buildSpec(unpack(round)), 'spec__response').length > 1000);

  // LOG and INTERACTION, the other two functional forms on this rung.
  const logm = built({
    id: 'logwage', title: 'log wage on education', params: [P('c0', 'β₀', 1, 0, 5, 0.1), P('c1', 'β₁', 0.08, 0, 1, 0.01)],
    objects: [{ id: 'spec', kind: 'specification', label: 'log wage on education',
      estimation: { y: 'log_wage', x: ['educ'], terms: { log_wage: { op: 'log', of: 'wage' } },
        coefficients: { intercept: 'c0', educ: 'c1' }, over: { educ: [0, 20] } } }],
  }).model;
  ok('D: a logged OUTCOME is expressible', !!logm.objects.find((o) => o.id === 'spec__response'));
  const inter = built({
    id: 'inter', title: 'an interaction', params: [
      P('d0', 'β₀', 1, 0, 5, 0.1), P('d1', 'β₁', 2, 0, 5, 0.1), P('d2', 'β₂', 3, 0, 5, 0.1), P('d3', 'β₃', 0.5, 0, 2, 0.05)],
    objects: [{ id: 'spec', kind: 'specification', label: 'y on x, z and their interaction',
      estimation: { y: 'y', x: ['x', 'z', 'x_x_z'], terms: { x_x_z: { op: 'interact', with: ['x', 'z'] } },
        coefficients: { intercept: 'd0', x: 'd1', z: 'd2', x_x_z: 'd3' }, over: { x: [0, 10], z: [0, 10] } } }],
  }).model;
  const ir = inter.objects.find((o) => o.id === 'spec__response');
  ok('D: an interaction is over two axes, not three', ir?.meta?.axes === 'x,z', String(ir?.meta?.axes));
  ok('D:   and is the product of them', /\(x \* y\)/.test(ir?.defs?.z ?? ''), ir?.defs?.z);
  const dx = inter.objects.find((o) => o.id === 'spec__response__d_x');
  ok('D: an interacted effect DEPENDS on the other variable',
    dx?.meta?.constant === false && /z/.test(String(dx?.meta?.expr)), String(dx?.meta?.expr));
  rung('D  functional form', 'WORKS',
    'polynomial, log and interaction terms as structure; two axes for three regressors; marginal effects differentiated symbolically; exact numbers');
}

// ═══ E — categorical information ════════════════════════════════════
//
// Digest rung E: "Binary treatment and interaction with a continuous regressor;
// preserve reference group." An indicator is a term; the reference level is
// whichever level nobody made an indicator for, which is a modelling decision
// and stays the author's.
console.log('\n=== E. categorical information ===');
{
  const region = ['north', 'south', 'north', 'south', 'north', 'south', 'north', 'south'];
  const x = [1, 2, 3, 4, 5, 6, 7, 8];
  // y = 1 + 2x + 5·(south)
  const y = x.map((v, i) => 1 + 2 * v + (region[i] === 'south' ? 5 : 0));
  const m = built({
    id: 'cat', title: 'y on x and region', params: [],
    data: { s: { label: 'eight cases', columns: { x, y }, index: { region } } },
    objects: [{ id: 'spec', kind: 'specification', label: 'y on x and a region dummy',
      estimation: { method: 'ols', y: 'y', x: ['x', 'south'], data: 's',
        terms: { south: { op: 'indicator', of: 'region', level: 'south' } } } }],
  }).model;
  const got = estimate(m, m.objects.find((o) => o.id === 'spec'));
  ok('E: an indicator term fits', got.ok, got.ok ? '' : JSON.stringify(got.missing));
  ok('E: the slope is 2', near(got.fit.terms[1].value, 2, 1e-8), String(got.fit.terms[1]?.value));
  ok('E: the group shift is 5', near(got.fit.terms[2].value, 5, 1e-8), String(got.fit.terms[2]?.value));
  ok('E: the reference group is the one with no indicator',
    !m.objects.find((o) => o.estimation)?.estimation?.terms?.north);
  // A level that does not occur is refused, not silently a column of zeros.
  const ghost = termColumn({ op: 'indicator', of: 'region', level: 'east' },
    { columns: { x, y }, index: { region }, n: 8 });
  ok('E: a level that does not occur is refused', !ghost.ok);
  ok('E:   and the levels present are listed', /north, south/.test(ghost.why ?? ''), ghost.why);
  // An indicator interacted with a continuous regressor: different slopes.
  const slopes = built({
    id: 'cat2', title: 'different slopes by group', params: [],
    data: { s: { label: 'eight cases', columns: { x, y }, index: { region } } },
    objects: [{ id: 'spec', kind: 'specification', label: 'y on x, south, and x·south',
      estimation: { method: 'ols', y: 'y', x: ['x', 'south', 'x_x_south'], data: 's',
        terms: {
          south: { op: 'indicator', of: 'region', level: 'south' },
          x_x_south: { op: 'interact', with: ['x', { op: 'indicator', of: 'region', level: 'south' }] },
        } } }],
  }).model;
  const g2 = estimate(slopes, slopes.objects.find((o) => o.id === 'spec'));
  ok('E: a nested indicator inside an interaction fits', g2.ok, g2.ok ? '' : JSON.stringify(g2.missing));
  ok('E:   and the interaction is ~0 when slopes really are equal',
    g2.ok && Math.abs(g2.fit.terms[3].value) < 1e-6, g2.ok ? String(g2.fit.terms[3]?.value) : '');
  rung('E  categorical information', 'WORKS',
    'indicator terms over an index, nested inside interactions; a missing level refused with the levels present; the reference group is the author\'s');
}

// ═══ F — robust inference ═══════════════════════════════════════════
//
// Digest rung F: "Same OLS coefficients with conventional vs
// heteroskedasticity-robust SEs." The estimator and the variance estimator are
// separate choices, which is the architectural point.
console.log('\n=== F. robust inference ===');
{
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  // Deliberately fanning residuals, so the two variance estimators differ.
  const y = x.map((v, i) => 1 + 2 * v + (i % 2 ? 1 : -1) * v * 0.5);
  const mk = (robust) => {
    const m = built({
      id: robust ? 'rob' : 'cls', title: 'y on x', params: [],
      data: { s: { label: 'ten cases', columns: { x, y } } },
      objects: [{ id: 'spec', kind: 'specification', label: 'y on x',
        estimation: { method: 'ols', y: 'y', x: ['x'], data: 's', ...(robust ? { robust: true } : {}) } }],
    }).model;
    return estimate(m, m.objects.find((o) => o.id === 'spec'));
  };
  const c = mk(false);
  const r = mk(true);
  ok('F: both fit', c.ok && r.ok);
  ok('F: the coefficients are identical', near(c.fit.terms[1].value, r.fit.terms[1].value, 1e-12));
  ok('F: the standard errors are not', !near(c.fit.terms[1].se, r.fit.terms[1].se, 1e-9),
    `${c.fit.terms[1].se} vs ${r.fit.terms[1].se}`);
  ok('F: each says which basis it used', c.fit.se === 'classical' && r.fit.se === 'HC1',
    `${c.fit.se} / ${r.fit.se}`);
  ok('F: clustered and HAC errors are named as unsupported',
    /clustered, Newey–West/.test(JSON.stringify(estimate(
      (() => { const mm = built({ id: 'nm', title: 'y on x', params: [],
        data: { s: { label: 'ten', columns: { x, y } } },
        objects: [{ id: 'spec', kind: 'specification', label: 'y on x',
          estimation: { y: 'y', x: ['x'], data: 's' } }] }).model; return mm; })(),
      built({ id: 'nm', title: 'y on x', params: [],
        data: { s: { label: 'ten', columns: { x, y } } },
        objects: [{ id: 'spec', kind: 'specification', label: 'y on x',
          estimation: { y: 'y', x: ['x'], data: 's' } }] }).model.objects.find((o) => o.id === 'spec')
    ))), '');
  rung('F  robust inference', 'WORKS',
    'estimator and variance estimator are separate; classical and HC1 both real and labelled. Clustered and HAC named unsupported');
}

// ═══ G — time, lags and a dynamic relationship ══════════════════════
//
// Digest rung G: "C_t = b0 + b1 Y_t + b2 C_(t-1) + u_t. Correctly bind lagged
// state." The lag is a TERM over a declared time index, not a variable whose
// label contains "t-1".
console.log('\n=== G. time and lags ===');
{
  const time = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const yInc = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
  // c_t = 2 + 0.5·y_t + 0.25·c_(t-1), started at c_1 = 7 and iterated exactly.
  const c = [7];
  for (let i = 1; i < 10; i++) c.push(2 + 0.5 * yInc[i] + 0.25 * c[i - 1]);
  const m = built({
    id: 'adl', title: 'consumption on income and its own past', params: [],
    data: { s: { label: 'ten periods', columns: { c, y: yInc }, index: { time } } },
    objects: [{ id: 'spec', kind: 'specification', label: 'consumption on income and lagged consumption',
      estimation: { method: 'ols', y: 'c', x: ['y', 'c_lag1'], data: 's',
        terms: { c_lag1: { op: 'lag', of: 'c', by: 1, over: 'time' } } } }],
  }).model;
  const got = estimate(m, m.objects.find((o) => o.id === 'spec'));
  ok('G: a lag term fits', got.ok, got.ok ? '' : JSON.stringify(got.missing));
  ok('G: the intercept is 2', near(got.fit.terms[0].value, 2, 1e-6), String(got.fit.terms[0]?.value));
  ok('G: the income coefficient is 0.5', near(got.fit.terms[1].value, 0.5, 1e-6), String(got.fit.terms[1]?.value));
  ok('G: the lag coefficient is 0.25', near(got.fit.terms[2].value, 0.25, 1e-6), String(got.fit.terms[2]?.value));
  ok('G: the first period is dropped, not zero-filled', got.fit.n === 9, String(got.fit.n));
  ok('G:   and the drop is reported', !!got.fit.dropped, JSON.stringify(got.fit.dropped));
  // A LAG WITH NO INDEX IS REFUSED, with the reason.
  const noIdx = sanitizeModel({
    id: 'noidx', title: 'no index', params: [],
    data: { s: { label: 'ten', columns: { c, y: yInc } } },
    objects: [{ id: 'spec', kind: 'specification', label: 'consumption on lagged consumption',
      estimation: { method: 'ols', y: 'c', x: ['y', 'c_lag1'], data: 's',
        terms: { c_lag1: { op: 'lag', of: 'c', by: 1, over: 'time' } } } }],
  });
  const bad = estimate(noIdx, noIdx.objects[0]);
  ok('G: a lag with no index is refused', !bad.ok);
  ok('G:   naming the index it needs', /no “time” index/.test((bad.missing ?? [])[0]?.because ?? ''),
    JSON.stringify(bad.missing));
  // A LAG CANNOT BE EVALUATED POINTWISE, and the engine says so rather than
  // drawing an empty surface.
  ok('G: a lag term is not pointwise', !isPointwise({ op: 'lag', of: 'c', by: 1, over: 'time' }));
  ok('G:   so no response surface is fabricated for it',
    !m.objects.some((o) => o.id === 'spec__response'), '');
  // THE ORDERING IS THE INDEX, not the row order.
  const shuffled = [...Array(10).keys()].sort((a, b) => (a * 7) % 10 - (b * 7) % 10);
  const sc = shuffled.map((i) => c[i]);
  const st = shuffled.map((i) => time[i]);
  const lag = termColumn({ op: 'lag', of: 'c', by: 1, over: 'time' },
    { columns: { c: sc }, index: { time: st }, n: 10 });
  ok('G: a shuffled series lags along the index', lag.ok);
  const firstPeriod = st.indexOf(1);
  ok('G:   the earliest period has no predecessor', lag.built.values[firstPeriod] === null);
  const third = st.indexOf(3);
  ok('G:   and period 3 lags to period 2, wherever the rows sit',
    near(lag.built.values[third], c[1], 1e-12), String(lag.built.values[third]));
  // Differences, the other temporal term.
  const d = termColumn({ op: 'diff', of: 'c', by: 1, over: 'time' },
    { columns: { c }, index: { time }, n: 10 });
  ok('G: a difference is available as a term', d.ok);
  ok('G:   and is exactly the change', near(d.built.values[2], c[2] - c[1], 1e-12));
  rung('G  time and lags', 'WORKS',
    'lag/lead/diff as terms over a declared index; ordered BY the index; the lost first period dropped and reported; no pointwise surface fabricated');
}

// ═══ H — a simultaneous system, solved ══════════════════════════════
//
// Digest rung H: "Supply/demand system with tax wedge. Solve equilibrium
// generically and update after parameter mutation." Landed in the previous
// sprint; asserted here as part of the ladder.
console.log('\n=== H. a simultaneous system ===');
{
  const mkt = (t) => ({
    id: 'mkt', title: 'a market with a tax',
    params: [P('a', 'a', 120, 0, 300, 1), P('b', 'b', -2, -10, 0, 0.1),
      P('c', 'c', -20, -100, 100, 1), P('d', 'd', 3, 0, 10, 0.1), P('t', 'tax', t, 0, 50, 1)],
    objects: [{ id: 'eq', kind: 'system', label: 'where it clears', equations: {
      unknowns: ['qd', 'qs', 'pc', 'pp'],
      relations: ['qd = a + b * pc', 'qs = c + d * pp', 'pc = pp + t', 'qd = qs'],
      units: { qd: 'units', qs: 'units', pc: 'currency', pp: 'currency' } } }],
  });
  const m = built(mkt(10)).model;
  const v = (id) => m.objects.find((o) => o.id === id)?.meta?.value;
  ok('H: it solves', near(v('eq__pp'), 24) && near(v('eq__pc'), 34) && near(v('eq__qd'), 52),
    JSON.stringify({ pp: v('eq__pp'), pc: v('eq__pc'), q: v('eq__qd') }));
  ok('H: by a real solver', solverFor(m, 'eq', 'solve') === 'linear', solverFor(m, 'eq', 'solve'));
  ok('H: in the plane, not a cube', buildSpec(m).dimensionality === 2);
  const m20 = built(mkt(20)).model;
  ok('H: and recomputes when the tax moves',
    near(m20.objects.find((o) => o.id === 'eq__pp')?.meta?.value, 20), '');
  rung('H  simultaneous solve', 'WORKS', 'Gaussian elimination with residual validation; 2D figure from the rows');
}

// ═══ I — panel structure and a difference in differences ════════════
//
// Digest rung I. THE ARCHITECTURAL POINT: a DiD estimate is not a new estimator.
// It is an OLS on two indicators and their interaction, so it composes out of
// primitives that already exist — which is the test of whether the primitives
// are the right ones.
console.log('\n=== I. panel structure and difference in differences ===');
{
  const entity = ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd'];
  const period = [1, 2, 1, 2, 1, 2, 1, 2];
  const treated = ['y', 'y', 'y', 'y', 'n', 'n', 'n', 'n'];
  // level 10, +3 over time for everyone, +7 for the treated after: DiD = 7.
  const yv = entity.map((_, i) =>
    10 + (period[i] === 2 ? 3 : 0) + (treated[i] === 'y' && period[i] === 2 ? 7 : 0));
  const m = built({
    id: 'did', title: 'a before-and-after comparison across groups', params: [],
    data: { s: { label: 'four units over two periods', columns: { y: yv },
      index: { entity, period, treated } } },
    objects: [{ id: 'spec', kind: 'specification', label: 'outcome on treatment, period and their interaction',
      estimation: { method: 'ols', y: 'y', x: ['tr', 'after', 'tr_x_after'], data: 's',
        terms: {
          tr: { op: 'indicator', of: 'treated', level: 'y' },
          after: { op: 'indicator', of: 'period', level: '2' },
          tr_x_after: { op: 'interact', with: [
            { op: 'indicator', of: 'treated', level: 'y' },
            { op: 'indicator', of: 'period', level: '2' }] },
        } } }],
  }).model;
  const got = estimate(m, m.objects.find((o) => o.id === 'spec'));
  ok('I: it fits', got.ok, got.ok ? '' : JSON.stringify(got.missing));
  ok('I: the untreated pre level is 10', near(got.fit.terms[0].value, 10, 1e-8), String(got.fit.terms[0]?.value));
  ok('I: the group difference is 0', near(got.fit.terms[1].value, 0, 1e-8), String(got.fit.terms[1]?.value));
  ok('I: the common time change is 3', near(got.fit.terms[2].value, 3, 1e-8), String(got.fit.terms[2]?.value));
  ok('I: THE DIFFERENCE IN DIFFERENCES IS 7', near(got.fit.terms[3].value, 7, 1e-8), String(got.fit.terms[3]?.value));
  ok('I: and it needed no new estimator', got.fit.method === 'ols', got.fit.method);
  rung('I  panel / difference in differences', 'WORKS',
    'composed from indicator and interaction terms over an entity-period index; no DiD-specific code exists. Parallel-trends is the author\'s assumption and is not checked');
}

// ═══ J — the within transform ═══════════════════════════════════════
//
// Digest rung J: "Panel regression using within transformation; distinguish
// time-invariant regressors that cannot be identified in FE."
console.log('\n=== J. the within transform ===');
{
  const entity = ['a', 'a', 'a', 'b', 'b', 'b', 'c', 'c', 'c'];
  const x = [1, 2, 3, 4, 6, 8, 2, 5, 11];
  const fx = { a: 100, b: 200, c: 300 };
  const y = x.map((v, i) => fx[entity[i]] + 2 * v);
  const within = termColumn({ op: 'demean', of: 'x', over: 'entity' },
    { columns: { x }, index: { entity }, n: 9 });
  ok('J: demeaning is available as a term', within.ok);
  ok('J:   and each group sums to zero',
    ['a', 'b', 'c'].every((g) => {
      const s = entity.reduce((acc, e, i) => (e === g ? acc + within.built.values[i] : acc), 0);
      return Math.abs(s) < 1e-12;
    }));
  const m = built({
    id: 'fe', title: 'within-unit variation', params: [],
    data: { s: { label: 'three units, three periods', columns: { x, y }, index: { entity } } },
    objects: [{ id: 'spec', kind: 'specification', label: 'y on x, within units',
      estimation: { method: 'ols', y: 'y_within', x: ['x_within'], data: 's', intercept: false,
        terms: {
          y_within: { op: 'demean', of: 'y', over: 'entity' },
          x_within: { op: 'demean', of: 'x', over: 'entity' },
        } } }],
  }).model;
  const got = estimate(m, m.objects.find((o) => o.id === 'spec'));
  ok('J: the within regression fits', got.ok, got.ok ? '' : JSON.stringify(got.missing));
  ok('J: it recovers the slope through the unit effects', near(got.fit.terms[0].value, 2, 1e-8),
    String(got.fit.terms[0]?.value));
  // A TIME-INVARIANT REGRESSOR CANNOT BE IDENTIFIED THIS WAY, and demeaning
  // makes it exactly zero — which the term reports rather than leaving the
  // estimator to call it collinear.
  const fixed = x.map((_, i) => ({ a: 1, b: 2, c: 3 }[entity[i]]));
  const flat = termColumn({ op: 'demean', of: 'g', over: 'entity' },
    { columns: { g: fixed }, index: { entity }, n: 9 });
  ok('J: a unit-constant regressor demeans to nothing',
    flat.ok && flat.built.values.every((v) => Math.abs(v) < 1e-12));
  const single = termColumn({ op: 'demean', of: 'x', over: 'entity' },
    { columns: { x: [1, 2] }, index: { entity: ['a', 'b'] }, n: 2 });
  ok('J:   and a one-observation group is flagged as carrying no information',
    /one observation/.test(single.built?.note ?? ''), single.built?.note);
  rung('J  fixed effects', 'WORKS',
    'the within transform as a term, per named grouping; recovers the slope through unit effects; a unit-constant regressor demeans to zero. The FE variance correction for estimated unit means is NOT applied — see the note in the report');
}

// ═══ K — instrumental variables ═════════════════════════════════════
console.log('\n=== K. instrumental variables (asserted UNSUPPORTED) ===');
{
  const m = built({
    id: 'iv', title: 'an endogenous regressor', params: [],
    data: { s: { label: 'cases', columns: { y: [1, 2, 3, 4], x: [1, 2, 3, 4], z: [2, 1, 4, 3] } } },
    objects: [{ id: 'spec', kind: 'specification', label: 'y on x, instrumented by z',
      estimation: { y: 'y', x: ['x'], data: 's' } }],
  }).model;
  const got = estimate(m, m.objects.find((o) => o.id === 'spec'));
  ok('K: no method is chosen for us', !got.ok && !!got.choice);
  ok('K: and IV is named as unsupported',
    /instrumental variables/.test(JSON.stringify(got.choice?.unsupported ?? [])), '');
  ok('K: there is no 2SLS estimator pretending otherwise',
    !JSON.stringify(got.choice?.candidates ?? []).match(/2sls|two.stage/i), '');
  rung('K  instrumental variables / 2SLS', 'NOT IMPLEMENTED',
    'named in the unsupported list. Needs: instrument/endogenous/exogenous roles on variables, a first stage, relevance and overidentification diagnostics, and rank checks');
}

// ═══ L — a limited dependent variable ═══════════════════════════════
console.log('\n=== L. binary outcomes (asserted UNSUPPORTED) ===');
{
  const m = built({
    id: 'bin', title: 'a binary outcome', params: [],
    data: { s: { label: 'cases', columns: { y: [0, 0, 1, 1, 0, 1], x: [1, 2, 3, 4, 5, 6] } } },
    objects: [{ id: 'spec', kind: 'specification', label: 'a binary outcome on x',
      estimation: { y: 'y', x: ['x'], data: 's' } }],
  }).model;
  const got = estimate(m, m.objects.find((o) => o.id === 'spec'));
  ok('L: logit and probit are named as unsupported',
    /logit|probit|limited dependent/i.test(JSON.stringify(got.choice?.unsupported ?? [])),
    JSON.stringify(got.choice?.unsupported));
  // Least squares on a 0/1 outcome RUNS — it is the linear probability model,
  // which is a real choice — so the honest behaviour is to fit it when asked and
  // never to pick it silently.
  const lpm = built({
    id: 'lpm', title: 'a linear probability model', params: [],
    data: { s: { label: 'cases', columns: { y: [0, 0, 1, 1, 0, 1], x: [1, 2, 3, 4, 5, 6] } } },
    objects: [{ id: 'spec', kind: 'specification', label: 'a binary outcome on x',
      estimation: { method: 'ols', y: 'y', x: ['x'], data: 's' } }],
  }).model;
  const fit = estimate(lpm, lpm.objects.find((o) => o.id === 'spec'));
  ok('L: least squares on a 0/1 outcome runs when asked for', fit.ok);
  ok('L:   and is never chosen for the person', !estimate(m, m.objects.find((o) => o.id === 'spec')).ok);
  rung('L  limited dependent variables', 'NOT IMPLEMENTED',
    'logit, probit, Tobit and selection models named in the unsupported list. Needs: a variable TYPE system (binary/count/censored) constraining estimators, a link function, and likelihood optimisation. Least squares on a 0/1 outcome runs if explicitly asked for and is never selected for the person');
}

// ═══ M — nonstationary series ═══════════════════════════════════════
console.log('\n=== M. nonstationary series (PARTIAL) ===');
{
  const time = [...Array(12).keys()].map((i) => i + 1);
  const walk = [1];
  for (let i = 1; i < 12; i++) walk.push(walk[i - 1] + (i % 3 === 0 ? 2 : -1));
  const d = termColumn({ op: 'diff', of: 'w', by: 1, over: 'time' },
    { columns: { w: walk }, index: { time }, n: 12 });
  ok('M: differencing a series is available', d.ok);
  ok('M:   and is exact', near(d.built.values[5], walk[5] - walk[4], 1e-12));
  const got = estimate(
    built({ id: 'ns', title: 'a persistent series', params: [],
      data: { s: { label: 'twelve periods', columns: { w: walk }, index: { time } } },
      objects: [{ id: 'spec', kind: 'specification', label: 'a series on its own past',
        estimation: { y: 'w', x: ['w_lag1'], data: 's', terms: { w_lag1: { op: 'lag', of: 'w', by: 1, over: 'time' } } } }] }).model,
    { id: 'spec', estimation: { y: 'w', x: ['w_lag1'], data: 's', terms: { w_lag1: { op: 'lag', of: 'w', by: 1, over: 'time' } } } }
  );
  ok('M: unit-root and cointegration workflows are named as unsupported',
    /unit root|cointegration|stationarit/i.test(JSON.stringify(got.choice?.unsupported ?? []) + JSON.stringify(got.missing ?? [])),
    JSON.stringify(got.choice?.unsupported));
  rung('M  nonstationary series', 'PARTIAL',
    'differencing and lags are real terms, so the TRANSFORMATIONS exist. The DIAGNOSTICS do not: no unit-root test, no cointegration workflow, no spurious-regression warning, no forecast uncertainty');
}

// ═══ the honesty contract ═══════════════════════════════════════════
//
// The digest states it directly: "never claim estimation without data, never
// claim simulation without a backend, never invent observations, never turn a
// conceptual diagram into a computed result".
console.log('\n=== the honesty contract ===');
{
  const hypo = built({
    id: 'hyp', title: 'coefficients somebody supposed', params: [P('g0', 'β₀', 1, 0, 5, 0.1), P('g1', 'β₁', 2, 0, 5, 0.1)],
    objects: [{ id: 'spec', kind: 'specification', label: 'y on x',
      estimation: { y: 'y', x: ['x'], coefficients: { intercept: 'g0', x: 'g1' }, over: { x: [0, 10] } } }],
  }).model;
  ok('no data block is invented', !hypo.data);
  ok('no fit exists', !hypo.objects.some((o) => o.provenance?.origin === 'dataset'));
  ok('the surface says whose numbers they are',
    hypo.objects.find((o) => o.id === 'spec__response')?.provenance?.origin === 'user');
  ok('estimate is blocked until observations exist', askFor(hypo, 'estimate').status === 'blocked');
  ok('no R², standard error or interval is anywhere in the model',
    !/r2|"se"|ci95/.test(JSON.stringify(hypo.objects)), '');
  ok('and evaluating it is still allowed', askFor(hypo, 'evaluate').status === 'runnable');
  // A derivative that cannot be produced is refused rather than produced.
  const step = built({
    id: 'step', title: 'a step', params: [],
    objects: [{ id: 's', kind: 'curve', label: 'a step', definition: 'floor(x)', over: { x: [0, 10] } }],
  }).model;
  const refused = marginalOf(step, step.objects.find((o) => o.id === 's'), 'x');
  ok('an underivable slope is refused', !refused.ok);
  ok('  and named', /floor/.test(refused.why ?? ''), refused.why);
  const asObject = step.objects.find((o) => o.meta?.role === 'marginal');
  ok('  and kept in the model as unsupported rather than silently absent',
    asObject?.meta?.unsupported === true && asObject?.fidelity === 'conceptual', JSON.stringify(asObject?.meta));
}

console.log('\n════ THE LADDER ════');
for (const r of results) console.log(` ${r.verdict.padEnd(16)} ${r.id}\n                  ${r.note}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
