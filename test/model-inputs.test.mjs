// A FREE INPUT NEEDS A DOMAIN. A DATASET IS A DIFFERENT THING ENTIRELY.
//
// THE FAILURE, reproduced exactly before the supply roles existed. A wage
// relationship with the person's own coefficients, asked to be evaluated over
// education and experience, with no ranges stated:
//
//   says        : "needs observations — wage, education, experience, exper_pow2
//                  for each case"
//   surface over: null
//   sampled over: x ∈ [−3, 3], y ∈ [−3, 3]      ← invented by the engine
//   box         : ±11.99 on x and y, so the mesh filled a quarter of it
//   picture     : a narrow vertical sheet
//
// Education from minus three to three years, inside a box four times too wide,
// under a caption asking for data. Two mistakes with one cause: NOTHING
// DISTINGUISHED A FREE INPUT FROM AN OBSERVED VARIABLE. A regressor was a column
// name, so the only way to have values was a dataset — and when the picture
// needed a window anyway, the engine invented one instead of asking for the
// thing it actually needed.
//
// Evaluating z = f(x, y) at chosen values of x and y is a DIFFERENT OPERATION
// from estimating f's coefficients from observations of x, y and z, and the
// inputs play a different role in each. Nothing below is about econometrics: it
// is the difference between the argument of a function and a measurement of it.

import { buildProposal, revalidate } from './.tmp/propose.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { buildSpec } from './.tmp/spec.mjs';
import { buildObject } from './.tmp/compile.mjs';
import { sanitizeModel } from './.tmp/schema.mjs';
import { affectedBy } from './.tmp/deps.mjs';
import { askFor, route } from './.tmp/solve.mjs';
import { symbolTable, freeInputs, withoutDomain } from './.tmp/symbols.mjs';
import { inputsOf, cursorFor } from './.tmp/derive.mjs';
import { modelStateFrom } from './.tmp/model-state.mjs';
import { parseVizOps, isModelOp } from './.tmp/viz-model.mjs';
import { EMPTY_WORKSPACE, applyModelOps, modelFor, openFromProposal } from './.tmp/docs.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, eps = 1e-9) => Number.isFinite(a) && Math.abs(a - b) < eps;
const P = (id, label, value, min, max, step) => ({ id, label, value, min, max, ...(step ? { step } : {}) });
const mesh = (spec) => {
  const m = spec.primitives.find((p) => p.p === 'mesh');
  return m ? m.rows.flat().filter(Boolean) : [];
};
const span = (pts, k) => (pts.length ? Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k])) : 0);
const supplyOf = (m, id) => symbolTable(m).by.get(id)?.supply;

/** The model from the report, exactly: coefficients as controls, terms, optional ranges. */
const wage = (over, b3 = -0.03) => ({
  id: 'wage_model', title: 'Hypothetical wage model',
  params: [
    P('beta0', 'intercept', 5, -20, 40, 0.5), P('beta1', 'education coefficient', 2.5, 0, 10, 0.1),
    P('beta2', 'experience coefficient', 1.2, 0, 5, 0.1), P('beta3', 'experience squared coefficient', b3, -0.2, 0.2, 0.005),
  ],
  objects: [{ id: 'wage_spec', kind: 'specification', label: 'wage on education and experience',
    estimation: {
      y: 'wage', x: ['education', 'experience', 'exper_pow2'],
      terms: { exper_pow2: { op: 'pow', of: 'experience', by: 2 } },
      coefficients: { intercept: 'beta0', education: 'beta1', experience: 'beta2', exper_pow2: 'beta3' },
      ...(over ? { over } : {}),
    } }],
});
const DOMAINS = { education: [0, 20], experience: [0, 40] };

// ═══ every quantity is classified, and not by what it looks like ════
console.log('\n=== the four supply roles ===');
{
  const m = unpack(buildProposal(wage(DOMAINS), { at: 1 }).model);
  ok('β₀…β₃ are PARAMETERS', ['beta0', 'beta1', 'beta2', 'beta3'].every((p) => supplyOf(m, p) === 'parameter'));
  ok('  and so are the coefficient objects they drive',
    ['wage_spec__b0', 'wage_spec__b1', 'wage_spec__b3'].every((c) => supplyOf(m, c) === 'parameter'),
    JSON.stringify(['wage_spec__b0', 'wage_spec__b1'].map((c) => supplyOf(m, c))));
  ok('education is a FREE INPUT', supplyOf(m, 'wage_spec__x0') === 'input', supplyOf(m, 'wage_spec__x0'));
  ok('experience is a FREE INPUT', supplyOf(m, 'wage_spec__x1') === 'input', supplyOf(m, 'wage_spec__x1'));
  ok('wage is DERIVED, not an input', supplyOf(m, 'wage_spec__y') === 'derived', supplyOf(m, 'wage_spec__y'));
  ok('exper² is DERIVED from experience, not an input of its own',
    supplyOf(m, 'wage_spec__x2') === 'derived', supplyOf(m, 'wage_spec__x2'));
  // A SURFACE IS NOT A QUANTITY. It is a shape, so it is not in the symbol table
  // at all — which is right: you cannot bind a value to a mesh.
  ok('a surface is not a quantity at all', supplyOf(m, 'wage_spec__response') === undefined);
  ok('but the value read off it is derived',
    supplyOf(m, 'wage_spec__response__at') === 'derived', supplyOf(m, 'wage_spec__response__at'));
  ok('exactly two free inputs', freeInputs(symbolTable(m)).length === 2,
    JSON.stringify(freeInputs(symbolTable(m)).map((q) => q.display)));
  ok('  and both have a domain', withoutDomain(symbolTable(m)).length === 0);
  ok('  which the model stated', freeInputs(symbolTable(m)).every((q) => q.domainFrom === 'specification'));

  // WITH A DATASET the same variables are OBSERVED, and nothing else changes.
  const observed = unpack(sanitizeModel({
    id: 'obs', title: 'with observations', params: [],
    data: { s: { label: 'cases', columns: { wage: [1, 2, 3, 4], education: [1, 2, 3, 4], experience: [2, 1, 4, 3] } } },
    objects: [{ id: 'sp', kind: 'specification', label: 'wage on education and experience',
      estimation: { method: 'ols', y: 'wage', x: ['education', 'experience'], data: 's' } }],
  }));
  ok('with a dataset attached the inputs become OBSERVED',
    supplyOf(observed, 'sp__x0') === 'observed' && supplyOf(observed, 'sp__x1') === 'observed',
    `${supplyOf(observed, 'sp__x0')} / ${supplyOf(observed, 'sp__x1')}`);
  ok('  and the outcome too', supplyOf(observed, 'sp__y') === 'observed', supplyOf(observed, 'sp__y'));
  // A FITTED COEFFICIENT IS DERIVED; A SUPPOSED ONE IS A PARAMETER. Both are
  // used BY the relationship, and the difference that matters is whether you may
  // move it: a number somebody set is theirs to change, and a number a fit
  // produced is not — moving it would contradict the fit it came out of.
  ok('  and a FITTED coefficient is derived, not a parameter',
    symbolTable(observed).by.get('sp__b1')?.supply === 'derived',
    String(symbolTable(observed).by.get('sp__b1')?.supply));
  ok('  while a SUPPOSED one is a parameter you may move',
    supplyOf(unpack(buildProposal(wage(DOMAINS), { at: 1 }).model), 'wage_spec__b1') === 'parameter');
}

// ═══ a range is assumed and SAID; observations are never asked for ═════
console.log('\n=== readiness assumes a RANGE, says so, and never asks for data ===');
{
  // THE RULE CHANGED HERE, ON PURPOSE. This block used to assert that a named
  // input with no range left EVALUATE incomplete and the frame empty — "the
  // engine does not invent [-3, 3] for a named quantity". The objection was
  // right about the silence and the window, and wrong about the remedy: in
  // the product the declaration it waited for comes from a language model,
  // and every time it forgot, a person got a blank picture captioned "needs a
  // range". So a missing range is now an ASSUMED window, 0 to 10, carried on
  // the slider, the inspector and the picture's note — visible, and therefore
  // fixable. See lib/model/kinds.ts.
  const bare = unpack(buildProposal(wage(null), { at: 1 }).model);
  const resp = bare.objects.find((o) => o.id === 'wage_spec__response');
  const r = route(bare, resp, 'evaluate');
  ok('with no range, EVALUATE still runs', r.status === 'runnable', r.status);
  const table = symbolTable(bare);
  ok('  over an assumed window, and the table says so',
    freeInputs(table).every((q) => q.domainFrom === 'assumed' && q.domain[0] === 0 && q.domain[1] === 10),
    JSON.stringify(freeInputs(table).map((q) => [q.display, q.domain, q.domainFrom])));
  ok('  the response object carries the assumption in words',
    /education has no stated range and is drawn over 0 to 10/.test(String(resp.meta?.assumed)), String(resp.meta?.assumed));
  ok('  and so does the picture', /education has no stated range/.test(buildSpec(bare).notes.find((n) => n.of === 'wage_spec')?.note ?? ''),
    buildSpec(bare).notes.find((n) => n.of === 'wage_spec')?.note);
  ok('  and the surface DRAWS', buildSpec(bare).primitives.some((p) => p.p === 'mesh'));
  // It never ASKS for observations.
  ok('  NEVER for observations', !/observation/i.test(JSON.stringify(r.missing ?? [])));

  // ESTIMATE still asks for observations, because that is what estimate needs.
  ok('ESTIMATE still asks for observations', /observations/.test(askFor(bare, 'estimate').says));
  ok('  and is reported as ITS OWN operation waiting, not as the model failing',
    /ESTIMATE is waiting on/.test(buildProposal(wage(null), { at: 1 }).report.says),
    buildProposal(wage(null), { at: 1 }).report.says.slice(0, 120));
  ok('  with EVALUATE named first', (() => {
    const s = buildProposal(wage(null), { at: 1 }).report.says;
    return s.indexOf('EVALUATE') < s.indexOf('ESTIMATE');
  })());

  // …and the conversation is told what was assumed, so it never presents the
  // engine's default as the person's choice.
  const st = modelStateFrom(bare, buildSpec(bare), {});
  ok('the conversation is told the ranges were assumed',
    st.readouts.some((x) => /READ OR ASSUMED BY THE ENGINE/.test(x) && /education has no stated range/.test(x)), JSON.stringify(st.readouts));
  ok('  and that free inputs need ranges rather than observations',
    st.readouts.some((x) => /need RANGES rather than observations/.test(x)));
}

// ═══ with domains: a genuine two-input surface ══════════════════════
console.log('\n=== domain × domain → grid → surface ===');
{
  const b = buildProposal(wage(DOMAINS), { at: 1 });
  const m = unpack(b.model);
  ok('it builds computational', b.report.capability === 'computational', b.report.capability);
  ok('  and does not claim nothing computes', !/nothing in it computes/.test(b.report.says));
  ok('EVALUATE is runnable with no data at all', askFor(m, 'evaluate').status === 'runnable');
  const spec = buildSpec(m);
  const pts = mesh(spec);
  ok('the surface is sampled', pts.length > 1000, String(pts.length));
  ok('  across BOTH domains, not one', span(pts, 'x') > 0 && span(pts, 'y') > 0,
    `${span(pts, 'x')} × ${span(pts, 'y')}`);
  ok('  over education 0 to 20', near(Math.min(...pts.map((p) => p.x)), 0) && near(Math.max(...pts.map((p) => p.x)), 20));
  ok('  over experience 0 to 40', near(Math.min(...pts.map((p) => p.y)), 0) && near(Math.max(...pts.map((p) => p.y)), 40));
  ok('  and it is 3D, which is legitimate for two inputs', spec.dimensionality === 3);
  // THE DEGENERATE GEOMETRY. The box must hug the mesh, not be cubed around it.
  ok('the box is fitted, not equalised', spec.aspect === 'fit', spec.aspect);
  const boxX = spec.box.x[1] - spec.box.x[0];
  const boxY = spec.box.y[1] - spec.box.y[0];
  ok('  so the mesh fills it in x', span(pts, 'x') / boxX > 0.8, `${span(pts, 'x')} of ${boxX}`);
  ok('  and in y', span(pts, 'y') / boxY > 0.8, `${span(pts, 'y')} of ${boxY}`);
  ok('  which a cubed box would not', boxX !== boxY, `${boxX} vs ${boxY}`);
  ok('nothing reports a missing picture', !spec.notes.some((n) => n.problem),
    JSON.stringify(spec.notes.filter((n) => n.problem)));
  // The value, checked by hand at a grid point.
  const at = pts.reduce((bst, p) => (Math.abs(p.x - 12) + Math.abs(p.y - 10) < bst.d ? { d: Math.abs(p.x - 12) + Math.abs(p.y - 10), p } : bst), { d: Infinity, p: null }).p;
  ok('and every height is the relationship evaluated there',
    near(at.z, 5 + 2.5 * at.x + 1.2 * at.y - 0.03 * at.y * at.y, 1e-9), JSON.stringify(at));
  ok('no observation is invented', !m.data);
  ok('no standard error, interval or R² is anywhere',
    !/"se"|ci95|"r2"/.test(JSON.stringify(m.objects)));
}

// ═══ free inputs are manipulable canonical state ════════════════════
console.log('\n=== a free input is a control, and a different kind ===');
{
  const m = unpack(buildProposal(wage(DOMAINS), { at: 1 }).model);
  const inputs = inputsOf(m);
  ok('the free inputs are exposed with their ranges', inputs.length === 2, JSON.stringify(inputs));
  ok('  education over 0 to 20', inputs.some((q) => q.id === 'education' && q.min === 0 && q.max === 20));
  ok('  experience over 0 to 40', inputs.some((q) => q.id === 'experience' && q.min === 0 && q.max === 40));
  ok('  each sitting in the middle until moved', inputs.every((q) => q.at === (q.min + q.max) / 2));
  ok('and a cursor is clamped to its own range', cursorFor({ at: { education: 999 } }, 'education', [0, 20]) === 20);

  // THE READOUT: the relationship at the point currently selected.
  const readout = m.objects.find((o) => o.meta?.role === 'readout');
  ok('there is a value read at that point', !!readout);
  ok('  computed, not observed', readout?.provenance?.origin === 'computation', readout?.provenance?.origin);
  ok('  graded model-derived', readout?.fidelity === 'model-derived');
  // midpoint: educ 10, exper 20 → 5 + 25 + 24 − 12 = 42
  ok('  and right at the midpoint', /= 42 /.test(buildObject(m, readout).note), buildObject(m, readout).note);

  // MOVING ONE IS A MODEL EDIT, undoable, and distinct from moving a parameter.
  let ws = openFromProposal(EMPTY_WORKSPACE, wage(DOMAINS), { at: 1 }).workspace;
  const id = ws.docs[0].id;
  const doc = () => modelFor(ws.docs.find((d) => d.id === id));
  const valueNow = () => {
    const mm = doc();
    const r = mm.objects.find((o) => o.meta?.role === 'readout');
    const note = buildObject(mm, r).note;
    // The LAST `= number` in the note: the label carries `education = 12,
    // experience = 10` before the value itself.
    const all = [...note.matchAll(/=\s*(-?[\d.]+)/g)].map((x) => Number(x[1]));
    return all[all.length - 1];
  };
  const moved = applyModelOps(ws, [{ op: 'at', id: 'education', value: 12 }], { at: 2 });
  ws = moved.workspace;
  ok('moving a free input changes canonical state', doc().at?.education === 12, JSON.stringify(doc().at));
  ok('  and says it did not change the relationship',
    /has not changed/.test(moved.said.join(' ')), moved.said.join(' '));
  ws = applyModelOps(ws, [{ op: 'at', id: 'experience', value: 10 }], { at: 3 }).workspace;
  ok('  the value follows: 5 + 30 + 12 − 3 = 44', near(valueNow(), 44), String(valueNow()));
  // …and moving a PARAMETER changes the function, which also moves the value.
  ws = applyModelOps(ws, [{ op: 'set', id: 'beta3', value: -0.06 }], { at: 4 }).workspace;
  ok('moving a parameter changes the function: 5 + 30 + 12 − 6 = 41', near(valueNow(), 41), String(valueNow()));
  ws = applyModelOps(ws, [{ op: 'undo' }], { at: 5 }).workspace;
  ok('  and undo restores it', near(valueNow(), 44), String(valueNow()));
  // Out of range is clamped, with the range named.
  const far = applyModelOps(ws, [{ op: 'at', id: 'education', value: 999 }], { at: 6 });
  ok('a cursor outside the range is clamped', modelFor(far.workspace.docs[0]).at?.education === 20);
  ok('  and says so', /as far as the range you gave goes/.test(far.said.join(' ')), far.said.join(' '));
  // A name that is not a free input is refused with the list.
  const ghost = applyModelOps(ws, [{ op: 'at', id: 'beta1', value: 3 }], { at: 7 });
  ok('moving something that is not a free input is refused', !ghost.changed);
  ok('  listing what is', /education, experience/.test(ghost.said.join(' ')), ghost.said.join(' '));

  // The verb survives the reply grammar, and is a MODEL op.
  const parsed = parseVizOps('```socria-viz\nat education 14\n```',
    { params: [], layers: [], entities: [{ id: 'wage_spec', label: 'spec' }], edits: { can: [] } });
  ok('the reply grammar parses it', parsed.length === 1 && parsed[0].op === 'at' && parsed[0].value === 14,
    JSON.stringify(parsed));
  ok('  and it reaches the document, not the view', isModelOp({ op: 'at', id: 'education', value: 1 }));

  // Save and reload keeps the cursor.
  const round = revalidate(sanitizeModel(doc()));
  ok('a reload keeps where the inputs are standing', round?.at?.education === 12, JSON.stringify(round?.at));

  // The conversation is told what it can move, and that ranges are not data.
  const st = modelStateFrom(m, buildSpec(m), {});
  ok('the conversation is told about the free inputs',
    st.readouts.some((x) => /FREE INPUTS/.test(x) && /RANGES rather than observations/.test(x)), '');
}

// ═══ dependency: what a move reaches, and what it does not ══════════
console.log('\n=== what a change reaches ===');
{
  const m = unpack(buildProposal(wage(DOMAINS), { at: 1 }).model);
  const byBeta3 = affectedBy(m, ['beta3']);
  ok('β₃ reaches the surface', byBeta3.includes('wage_spec__response'));
  ok('  and the slope that involves it', byBeta3.includes('wage_spec__response__d_experience'), JSON.stringify(byBeta3));
  ok('  and NOT the slope that does not', !byBeta3.includes('wage_spec__response__d_education'), JSON.stringify(byBeta3));
  const byInput = affectedBy(m, ['education']);
  ok('moving the education cursor reaches the value read at that point',
    byInput.includes('wage_spec__response__at'), JSON.stringify(byInput));
}

// ═══ WHAT IT IS CAN SETTLE ITS RANGE ════════════════════════════════
//
// A binary variable takes 0 or 1. That is not a window anybody chooses, it is
// the quantity's own extent — so demanding a range for it is a category error,
// and it is the one that stopped a log-wage relationship in education and a
// female indicator from drawing at all.
console.log('\n=== a binary input needs no range ===');
{
  const logwage = (kinds) => ({
    id: 'lw', title: 'log wage on education and gender', params: [
      P('c0', 'intercept', 1, 0, 5, 0.1), P('c1', 'education coefficient', 0.08, 0, 0.5, 0.01),
      P('c2', 'female coefficient', -0.2, -1, 1, 0.05), P('c3', 'interaction coefficient', 0.01, -0.1, 0.1, 0.005)],
    objects: [{ id: 'spec', kind: 'specification', label: 'log wage on education and gender',
      estimation: {
        y: 'log_wage', x: ['educ', 'female', 'educ_female'],
        terms: { log_wage: { op: 'log', of: 'wage' }, educ_female: { op: 'interact', with: ['educ', 'female'] } },
        coefficients: { intercept: 'c0', educ: 'c1', female: 'c2', educ_female: 'c3' },
        ...(kinds ? { kinds } : {}),
        over: { educ: [8, 20] },
      } }],
  });

  // WITHOUT the kind: the NAME says it. `female` is an indicator by every
  // convention in the subject, and reading it as one — and saying so — is
  // what stopped this model drawing an empty frame in the product. A declared
  // kind still wins (below).
  const bare = unpack(buildProposal(logwage(null), { at: 1 }).model);
  const fem = symbolTable(bare).by.get('spec__x1');
  ok('an undeclared `female` is read as an indicator from its name',
    JSON.stringify(fem?.domain) === '[0,1]' && fem?.domainFrom === 'name', JSON.stringify([fem?.domain, fem?.domainFrom]));
  ok('  nothing is waiting on a range', withoutDomain(symbolTable(bare)).length === 0);
  ok('  and the surface draws', buildSpec(bare).primitives.some((p) => p.p === 'mesh'));
  ok('  with the reading said on the picture',
    /female is read as an indicator/.test(buildSpec(bare).notes.find((n) => n.of === 'spec')?.note ?? ''));
  ok('  a declared continuous kind turns the reading off',
    symbolTable(unpack(buildProposal(logwage({ female: 'continuous' }), { at: 1 }).model)).by.get('spec__x1')?.domainFrom === 'assumed');
  ok('  and `female_share` is not an indicator', (() => {
    const m = unpack(sanitizeModel({ id: 'fs', title: 't', params: [],
      objects: [{ id: 'sp', kind: 'specification', label: 'l', estimation: { y: 'y', x: ['female_share'] } }] }));
    return symbolTable(m).by.get('sp__x0')?.domainFrom === 'assumed';
  })());

  // WITH it: the range follows from what it is.
  const m = unpack(buildProposal(logwage({ female: 'binary' }), { at: 1 }).model);
  const female = symbolTable(m).by.get('spec__x1');
  ok('a declared binary has a range without being given one',
    JSON.stringify(female?.domain) === '[0,1]', JSON.stringify(female?.domain));
  ok('  and says the range came from what it IS', female?.domainFrom === 'type', String(female?.domainFrom));
  ok('  so nothing is waiting on a range', withoutDomain(symbolTable(m)).length === 0);
  const spec = buildSpec(m);
  const pts = mesh(spec);
  ok('  and the surface draws', pts.length > 1000, String(pts.length));
  ok('  over education and the indicator', span(pts, 'x') > 0 && span(pts, 'y') > 0);
  // log_wage = 1 + 0.08·educ − 0.2·female + 0.01·educ·female
  const at = pts.reduce((b, p) => (Math.abs(p.x - 16) + Math.abs(p.y - 1) < b.d ? { d: Math.abs(p.x - 16) + Math.abs(p.y - 1), p } : b), { d: Infinity, p: null }).p;
  ok('  exactly: at educ 16, female 1 it is 2.24',
    near(at.z, 1 + 0.08 * at.x - 0.2 * at.y + 0.01 * at.x * at.y, 1e-9), JSON.stringify(at));
  ok('  and nothing reports a missing picture', !spec.notes.some((n) => n.problem),
    JSON.stringify(spec.notes.filter((n) => n.problem)));

  // AN INDICATOR TERM SAYS SO BY ITS OWN DEFINITION, with no `kinds` entry.
  const implied = unpack(sanitizeModel({
    id: 'imp', title: 'a group shift', params: [
      P('d0', 'intercept', 1, 0, 5, 0.1), P('d1', 'shift', 2, 0, 5, 0.1)],
    data: { s: { label: 'cases', columns: { y: [1, 2, 3, 4] }, index: { region: ['north', 'south', 'north', 'south'] } } },
    objects: [{ id: 'sp', kind: 'specification', label: 'y on a region dummy',
      estimation: { y: 'y', x: ['south'], terms: { south: { op: 'indicator', of: 'region', level: 'south' } },
        coefficients: { intercept: 'd0', south: 'd1' } } }],
  }));
  const dummy = symbolTable(implied).by.get('sp__x0');
  // AN INDICATOR BUILT FROM A CATEGORICAL COLUMN IS DERIVED FROM IT, not a free
  // input of its own — which is the better answer than a range, and the same
  // reasoning that makes exper² derived rather than a third variable. Its values
  // follow from the column; nobody chooses them or a window for them.
  ok('an indicator term is derived from the column it reads',
    dummy?.supply === 'derived', `${dummy?.supply} ${JSON.stringify(dummy?.domain)}`);
  ok('  so nothing asks for a range for it',
    !withoutDomain(symbolTable(implied)).some((q) => q.id === 'sp__x0'),
    JSON.stringify(withoutDomain(symbolTable(implied)).map((q) => q.display)));

  // A FREE INPUT WITH A RANGE IS BOUND, so a slope that mentions another input
  // is drawable at that input's cursor rather than reported as missing a value.
  const slope = m.objects.find((o) => o.id === 'spec__response__d_educ');
  ok('a slope that depends on another input is not reported as missing a value',
    !buildObject(m, slope).problem, buildObject(m, slope).problem ?? '');
  ok('  and the router agrees with the scope about what is bound',
    route(m, slope, 'evaluate').status === 'runnable', route(m, slope, 'evaluate').status);
}

// ═══ the generic regressions the architecture is judged on ══════════
//
// None of these is econometrics. They are the shapes the distinction has to hold
// for: two inputs, one input, parameters and inputs together, and a free input
// with no range at all.
console.log('\n=== generic: z = f(x, y) with supplied parameters ===');
{
  const plain = (def, over, params = []) => unpack(buildProposal({
    id: 'g', title: 'a relationship', params,
    objects: [{ id: 'z', kind: 'surface', label: 'z', defs: { z: def }, over,
      meta: { axes: Object.keys(over).join(',') } }],
  }, { at: 1 }).model);

  // z = x + y
  {
    const m = plain('x + y', { x: [0, 10], y: [0, 10] });
    const pts = mesh(buildSpec(m));
    ok('z = x + y samples across both', span(pts, 'x') > 0 && span(pts, 'y') > 0);
    ok('  and every height is x + y', pts.every((p) => near(p.z, p.x + p.y, 1e-9)));
  }
  // z = x² + y²
  {
    const m = plain('x^2 + y^2', { x: [-3, 3], y: [-3, 3] });
    const pts = mesh(buildSpec(m));
    ok('z = x² + y² computes', pts.length > 100);
    ok('  exactly', pts.every((p) => near(p.z, p.x * p.x + p.y * p.y, 1e-9)));
  }
  // z = a·x + b·y with manipulable a and b
  {
    const m = plain('a * x + b * y', { x: [0, 5], y: [0, 5] }, [P('a', 'a', 2, 0, 10, 0.1), P('b', 'b', 3, 0, 10, 0.1)]);
    const pts = mesh(buildSpec(m));
    ok('z = a·x + b·y computes at the stated a and b', pts.every((p) => near(p.z, 2 * p.x + 3 * p.y, 1e-9)));
    ok('  and a and b are parameters, not inputs',
      supplyOf(m, 'a') === 'parameter' && supplyOf(m, 'b') === 'parameter');
    ok('  which the dependency graph agrees about', affectedBy(m, ['a']).includes('z'));
  }
  // y = a·x, one free input
  {
    const m = unpack(buildProposal({
      id: 'line', title: 'a line', params: [P('a', 'slope', 3, 0, 10, 0.1)],
      objects: [{ id: 'y', kind: 'curve', label: 'y', defs: { f: 'a * x' }, over: { x: [0, 10] }, meta: { axes: 'x' } }],
    }, { at: 1 }).model);
    const line = buildSpec(m).primitives.find((p) => p.p === 'polyline');
    ok('y = a·x with one input is a curve', !!line && line.at.length > 10);
    ok('  computed exactly', line.at.every((p) => near(p.y, 3 * p.x, 1e-9)));
    ok('  in two dimensions, not three', buildSpec(m).dimensionality === 2);
  }
  // z = a·x with NO range for x — DOMAIN REQUIRED, never OBSERVATIONS REQUIRED.
  {
    const m = unpack(buildProposal({
      id: 'nodom', title: 'no range', params: [P('a', 'slope', 3, 0, 10, 0.1)],
      objects: [{ id: 'y', kind: 'curve', label: 'y', defs: { f: 'a * x' }, meta: { axes: 'dose' } }],
    }, { at: 1 }).model);
    const r = route(m, m.objects.find((o) => o.id === 'y'), 'evaluate');
    ok('a free input with no range makes EVALUATE incomplete', r.status === 'incomplete', r.status);
    const said = JSON.stringify(r.missing);
    ok('  reporting DOMAIN REQUIRED', /a range for dose/.test(said), said.slice(0, 140));
    ok('  and NOT observations', r.missing.every((x) => !/observation/i.test(x.what)),
      JSON.stringify(r.missing.map((x) => x.what)));
    ok('  and nothing is drawn over an invented window', buildSpec(m).primitives.length === 0);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
