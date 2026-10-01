// ONE AUTHORITATIVE BINDING BETWEEN A MODEL QUANTITY AND AN EXECUTABLE SYMBOL.
//
// THE FAILURE THIS SUITE IS WRITTEN AGAINST, reproduced exactly before the fix:
//
//   params the UI shows : b0=5, b1=0.7, b2=0.2
//   expression          : spec__b0 + (spec__b1) * x + (spec__b2) * y
//   reports missing     : a value for spec__b0 | spec__b1 | spec__b2
//   primitives drawn    : 0
//
// An interface that knew the values, an executor that asked for names nothing
// had, and an empty three-dimensional box between them rendered as though the
// job had succeeded.
//
// The cause was a CONVENTION PRETENDING TO BE A BINDING: expandEstimation
// invented canonical coefficient ids and then resolved each to a control by
// exact id-string equality against that invented convention — which the author
// could not have known, because those objects do not exist until the expander
// runs.
//
// Every assertion below is numerical or structural. None of them snapshots a
// mesh and calls it a pass.

import { buildProposal } from './.tmp/propose.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { askFor, route, plan } from './.tmp/solve.mjs';
import { buildSpec } from './.tmp/spec.mjs';
import { buildObject, scopeOf } from './.tmp/compile.mjs';
import { sanitizeModel, setParam } from './.tmp/schema.mjs';
import { affectedBy } from './.tmp/deps.mjs';
import { symbolTable, bindings, known, resolve, machineOf, symbolLines } from './.tmp/symbols.mjs';
import { readSystem } from './.tmp/system.mjs';
import { LIBRARY } from './.tmp/library.mjs';
import { EMPTY_WORKSPACE, modelFor, openFromProposal, sanitizeWorkspace } from './.tmp/docs.mjs';
import { applyModelOps } from './.tmp/docs.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

/** Every finite vertex of whatever this object drew. A Mesh keeps `rows`. */
function vertices(spec, id) {
  const p = spec.primitives.find((q) => q.of === id);
  if (!p) return [];
  if (p.p === 'mesh') return p.rows.flat().filter(Boolean);
  if (Array.isArray(p.at)) return p.at;
  return [];
}

/** The ADL model from the live failure, with the binding declared however. */
const adl = (opts = {}) => ({
  id: 'consumption', title: 'Quarterly consumer spending', domain: 'econometrics',
  params: opts.params ?? [
    { id: 'b0', label: 'Intercept', value: 5, min: -20, max: 40, step: 0.5 },
    { id: 'b1', label: 'Income coefficient', value: 0.7, min: 0, max: 2, step: 0.01 },
    { id: 'b2', label: 'Lagged consumption coefficient', value: 0.2, min: 0, max: 1, step: 0.01 },
  ],
  objects: [{
    id: 'spec', kind: 'specification', label: 'Consumption on income and lagged consumption',
    estimation: {
      y: 'C_t', x: ['Y_t', 'C_lag'],
      over: { Y_t: [0, 100], C_lag: [0, 100] },
      ...(opts.coefficients === null ? {} : { coefficients: opts.coefficients ?? { intercept: 'b0', Y_t: 'b1', C_lag: 'b2' } }),
    },
  }],
});

console.log('=== 1. the symbol table is the one binding ===');
{
  const m = unpack(buildProposal(adl(), { at: 1 }).model);
  const t = symbolTable(m);

  // One quantity, reachable by every name anybody uses for it.
  const viaId = resolve(t, 'spec__b1');
  ok('a coefficient resolves by its canonical id', !!viaId);
  ok('  by its machine symbol', resolve(t, machineOf('spec__b1'))?.id === viaId.id);
  ok('  and by the display name a person sees', resolve(t, 'β₁')?.id === viaId.id);
  ok('  all three being ONE quantity, not three',
    new Set([resolve(t, 'spec__b1').id, resolve(t, 'SPEC__B1').id, resolve(t, 'β₁').id]).size === 1);

  // …carrying the value, and saying where it came from.
  ok('it has the value the control holds', viaId.value === 0.7);
  ok('  and says a control is driving it', viaId.boundBy === 'control' && viaId.control === 'b1');
  ok('  with the role it plays', viaId.role === 'coefficient');

  // The control is itself a quantity, and it is the same number.
  ok('the control is in the table too', resolve(t, 'b1')?.value === 0.7);
  ok('  and is NOT confused with the coefficient it drives', resolve(t, 'b1').id !== viaId.id);

  // A display name is never an execution identifier.
  ok('the machine symbol is a legal identifier', /^[a-z][a-z0-9_]*$/.test(viaId.machine));
  ok('  and the display name need not be', viaId.display === 'β₁');

  // One scope, containing everything with a value — not just the controls.
  const scope = scopeOf(m);
  ok('the evaluation scope holds the control', scope.b1 === 0.7);
  ok('  AND the coefficient it drives', scope.spec__b1 === 0.7);
  ok('  which is what the expression can actually mention',
    Object.keys(bindings(t)).includes('spec__b1'));
}

console.log('\n=== 2. THE ACCEPTANCE TEST: a real computed plane ===');
{
  const m = unpack(buildProposal(adl(), { at: 1 }).model);
  const r = m.objects.find((o) => o.meta?.role === 'response');
  ok('the deterministic component exists', !!r);
  ok('  and it is evaluable NOW, with no data at all',
    route(m, r, 'evaluate').status === 'runnable');

  const spec = buildSpec(m);
  const pts = vertices(spec, r.id);
  ok('it draws real geometry', pts.length > 0, `${pts.length} vertices`);
  ok('  in three dimensions', spec.dimensionality === 3);

  // z = 5 + 0.7x + 0.2y, verified at every vertex rather than at a sample.
  let worst = 0;
  for (const p of pts) worst = Math.max(worst, Math.abs(p.z - (5 + 0.7 * p.x + 0.2 * p.y)));
  ok('EVERY vertex satisfies z = 5 + 0.7x + 0.2y', worst < 1e-9, `worst error ${worst}`);

  // …and the named points from the brief, by evaluating the compiled object.
  const at = (X, Y) => {
    let best = null, d = Infinity;
    for (const p of pts) {
      const e = Math.hypot(p.x - X, p.y - Y);
      if (e < d) { d = e; best = p; }
    }
    return best;
  };
  ok('f(0,0) = 5', near(at(0, 0).z, 5), String(at(0, 0).z));
  // The grid does not land exactly on 10, so the check is against the value
  // the equation gives AT THE SAMPLED POINT — which is the honest test of the
  // computation, and it is verified against the four named points by the
  // all-vertices check above.
  const p10 = at(10, 0);
  ok('f(x,0) follows the income coefficient', near(p10.z, 5 + 0.7 * p10.x), `${p10.x} → ${p10.z}`);
  const p01 = at(0, 10);
  ok('f(0,y) follows the lagged coefficient', near(p01.z, 5 + 0.2 * p01.y), `${p01.y} → ${p01.z}`);

  // Over THEIR ranges, not invented ones.
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  ok('over the income range they gave', Math.min(...xs) === 0 && Math.max(...xs) === 100);
  ok('over the lagged range they gave', Math.min(...ys) === 0 && Math.max(...ys) === 100);

  // Nothing fabricated.
  ok('no observations were invented', !m.data || !Object.keys(m.data).length);
  ok('no fit statistics anywhere', !/r2|rSquared|stderr|pValue/i.test(JSON.stringify(m)));
  ok('the surface is model-derived', r.fidelity === 'model-derived');
  ok('  attributed to the person as a hypothesis',
    r.provenance.origin === 'user' && /estimated from data/i.test(r.provenance.detail));
}

console.log('\n=== 3. the binding is DECLARED, never guessed — and a gap is a placeholder, not a blank ===');
{
  // THREE declared ways and no fourth: the coefficients map, the canonical id,
  // and the standard NOTATION (b1, beta_1, β₁ — exact, after normalising case,
  // underscores and subscripts). What never binds is resemblance: `beta`,
  // `b1x`, `coef`, `slope`. lib/model/binding.ts.
  const odd = adl({
    coefficients: null,
    params: [
      { id: 'beta', label: 'a coefficient', value: 5, min: -20, max: 40 },
      { id: 'b1x', label: 'nearly β₁', value: 0.7, min: 0, max: 2 },
      { id: 'coef', label: 'the other one', value: 0.2, min: 0, max: 1 },
    ],
  });
  const m = unpack(buildProposal(odd, { at: 1 }).model);
  const r = m.objects.find((o) => o.meta?.role === 'response');
  ok('nothing was matched by resemblance',
    !/\b(beta|b1x|coef)\b/.test(r?.defs?.z ?? ''), r?.defs?.z);

  // THE GAP IS FILLED WITH A PLACEHOLDER, AND SAID. This used to be the
  // empty-cube rule — "no geometry, and a stated reason" — and the stated
  // reason was the whole of what a person got: a blank frame captioned "β₁
  // needs a value". Now sanitizeModel writes a control for the unbound slot
  // (0 for the intercept, 1 for a slope, marked assumed: 'value'), the
  // surface draws at it, and every sentence about the picture says so.
  for (const id of ['spec__b0', 'spec__b1', 'spec__b2']) {
    const p = m.params.find((q) => q.id === id);
    ok(`  ${id} is a placeholder control`, !!p && p.assumed === 'value', JSON.stringify(p));
  }
  ok('  at 0 for the intercept and 1 for a slope',
    m.params.find((q) => q.id === 'spec__b0')?.value === 0 && m.params.find((q) => q.id === 'spec__b1')?.value === 1);
  ok('  the response binds to them', /spec__b1/.test(r?.defs?.z ?? '') && route(m, r, 'evaluate').status === 'runnable',
    `${r?.defs?.z} / ${route(m, r, 'evaluate').status}`);
  const spec = buildSpec(m);
  ok('  and the surface DRAWS', vertices(spec, r.id).length > 0);
  ok('  the carrier says they are placeholders',
    /β₀, β₁, β₂ are placeholders/.test(spec.notes.find((n) => n.of === 'spec')?.note ?? ''),
    spec.notes.find((n) => n.of === 'spec')?.note);
  ok('  the response says its basis is placeholders', /placeholder/.test(String(r?.meta?.basis)), String(r?.meta?.basis));
  ok('  and the coefficient is attributed as a placeholder, not a hypothesis',
    /PLACEHOLDER/.test(m.objects.find((o) => o.id === 'spec__b1')?.provenance?.detail ?? ''));
  ok('  the on-ramp reply names them',
    /β₀, β₁, β₂ have no value yet/.test(buildProposal(odd, { at: 1 }).report.says), buildProposal(odd, { at: 1 }).report.says);
  // A second sanitise adds nothing — the placeholder is a stored control now.
  const again = sanitizeModel(buildProposal(odd, { at: 1 }).model);
  ok('  sanitising again is idempotent', again.params.length === buildProposal(odd, { at: 1 }).model.params.length);
  // Moving the placeholder makes it the person's.
  const moved = setParam(buildProposal(odd, { at: 1 }).model, 'spec__b1', 0.4);
  ok('  moving it clears the placeholder mark', moved.params.find((q) => q.id === 'spec__b1')?.assumed === undefined);

  // THE NOTATION binds, exactly — see interaction-model.test.mjs for b0…b3;
  // here the spelled-out forms, by id and by label.
  const notation = unpack(buildProposal(adl({
    coefficients: null,
    params: [
      { id: 'beta_0', label: 'Intercept', value: 5, min: -20, max: 40 },
      { id: 'Beta1', label: 'Income coefficient', value: 0.7, min: 0, max: 2 },
      { id: 'c_lag_coef', label: 'β₂', value: 0.2, min: 0, max: 1 },
    ],
  }), { at: 1 }).model);
  const nr = notation.objects.find((o) => o.meta?.role === 'response');
  ok('beta_0, Beta1 and a control LABELLED β₂ bind by notation',
    /\bbeta_0\b/.test(nr?.defs?.z ?? '') && /\bBeta1\b/.test(nr?.defs?.z ?? '') && /\bc_lag_coef\b/.test(nr?.defs?.z ?? ''), nr?.defs?.z);
  ok('  and no placeholder was written for them', !notation.params.some((p) => p.assumed === 'value'));

  // The OTHER declared route: a control whose id IS the canonical id.
  const canonical = unpack(buildProposal(adl({
    coefficients: null,
    params: [
      { id: 'spec__b0', label: 'β₀', value: 5, min: -20, max: 40 },
      { id: 'spec__b1', label: 'β₁', value: 0.7, min: 0, max: 2 },
      { id: 'spec__b2', label: 'β₂', value: 0.2, min: 0, max: 1 },
    ],
  }), { at: 1 }).model);
  const cr = canonical.objects.find((o) => o.meta?.role === 'response');
  ok('a control named after the canonical id binds too',
    route(canonical, cr, 'evaluate').status === 'runnable');
}

console.log('\n=== 4. it is not about econometrics ===');
{
  // REGRESSION TEST 2 of the brief: z = a·x² + b·y, a = 2, b = 3. No
  // specification, no coefficients, no economics — the same binding path.
  const generic = sanitizeModel({
    id: 'g', title: 'A generic surface', params: [
      { id: 'a', label: 'a', value: 2, min: 0, max: 5 },
      { id: 'b', label: 'b', value: 3, min: 0, max: 5 },
    ],
    objects: [{ id: 's', kind: 'surface', label: 'z', defs: { z: 'a * x^2 + b * y' }, over: { x: [-3, 3], y: [-3, 3] } }],
  });
  const spec = buildSpec(unpack(generic));
  const pts = vertices(spec, 's');
  ok('a generic surface draws', pts.length > 0);
  let worst = 0;
  for (const p of pts) worst = Math.max(worst, Math.abs(p.z - (2 * p.x * p.x + 3 * p.y)));
  ok('EVERY vertex satisfies z = 2x² + 3y', worst < 1e-9, `worst ${worst}`);

  // REGRESSION TEST 3: unusual names. Nothing may depend on `beta`, `spec` or
  // the word coefficient.
  const odd = sanitizeModel({
    id: 'o', title: 'Odd names', params: [
      { id: 'zqx_1', label: 'ζ', value: 4, min: 0, max: 9 },
      { id: 'w_2', label: 'ω₂', value: 0.5, min: 0, max: 2 },
    ],
    objects: [{ id: 'surf', kind: 'surface', label: 'z', defs: { z: 'zqx_1 * x + w_2 * y' }, over: { x: [0, 10], y: [0, 10] } }],
  });
  const op = vertices(buildSpec(unpack(odd)), 'surf');
  ok('unusual parameter names bind', op.length > 0);
  let w2 = 0;
  for (const p of op) w2 = Math.max(w2, Math.abs(p.z - (4 * p.x + 0.5 * p.y)));
  ok('  and compute correctly', w2 < 1e-9, `worst ${w2}`);

  // A name nothing has: refused, and NAMED, not silently NaN.
  const missing = sanitizeModel({
    id: 'mm', title: 'Missing', params: [],
    objects: [{ id: 'surf', kind: 'surface', label: 'z', defs: { z: 'kappa * x' }, over: { x: [0, 1], y: [0, 1] } }],
  });
  const mr = route(unpack(missing), unpack(missing).objects[0], 'evaluate');
  ok('an expression naming nothing is incomplete', mr.status === 'incomplete');
  ok('  and says the model has no such quantity',
    /no such quantity/.test(JSON.stringify(mr.missing)), JSON.stringify(mr.missing));
}

console.log('\n=== 5. the model is the source of truth ===');
{
  // REGRESSION TEST 6: change β₁ and verify the NUMBERS move, not just a label.
  let ws = openFromProposal(EMPTY_WORKSPACE, adl(), { at: 1 }).workspace;
  const id = ws.docs[0].id;
  const before = vertices(buildSpec(modelFor(ws.docs[0])), 'spec__response');
  const bAt = before.find((p) => p.x === 0 && p.y === 0);
  ok('before: f(0,0) = 5', near(bAt.z, 5));

  const moved = applyModelOps(ws, [{ op: 'set', id: 'b1', value: 1.4 }], 2);
  ws = moved.workspace;
  const after = vertices(buildSpec(modelFor(ws.docs.find((d) => d.id === id))), 'spec__response');
  // NOT VACUOUS. An all-NaN surface drops every vertex, so a loop over an empty
  // list would report a worst error of zero and pass — which is exactly what
  // happened while the op shape was wrong, and is the reason this line exists.
  ok('the surface still has vertices after the change', after.length > 0, `${after.length}`);
  let worst = 0;
  for (const p of after) worst = Math.max(worst, Math.abs(p.z - (5 + 1.4 * p.x + 0.2 * p.y)));
  ok('after setting β₁ = 1.4 EVERY vertex follows the new equation',
    after.length > 0 && worst < 1e-9, `worst ${worst} over ${after.length}`);
  ok('  and the model, not the slider, holds it',
    modelFor(ws.docs.find((d) => d.id === id)).params.find((p) => p.id === 'b1').value === 1.4);
  ok('  and it is the SAME model, at a later revision',
    ws.docs.length === 1 && ws.docs[0].id === id && ws.docs[0].revisions.length > 1);

  // The change reaches the surface through the derived graph.
  const m = modelFor(ws.docs.find((d) => d.id === id));
  ok('changing the control reaches the surface', affectedBy(m, ['b1']).includes('spec__response'));
  ok('  and reaches the coefficient it drives', affectedBy(m, ['b1']).includes('spec__b1'));
}

console.log('\n=== 6. it survives being saved and read back ===');
{
  const made = openFromProposal(EMPTY_WORKSPACE, adl(), { at: 1 });
  const round = sanitizeWorkspace(JSON.parse(JSON.stringify(made.workspace)));
  ok('the document survives a round trip', round.docs.length === 1);
  const m = modelFor(round.docs[0]);
  const r = m.objects.find((o) => o.meta?.role === 'response');
  ok('  the binding survives', route(m, r, 'evaluate').status === 'runnable');
  const pts = vertices(buildSpec(m), r.id);
  ok('  and it still computes the same plane', pts.length > 0);
  let worst = 0;
  for (const p of pts) worst = Math.max(worst, Math.abs(p.z - (5 + 0.7 * p.x + 0.2 * p.y)));
  ok('  to the same numbers', worst < 1e-9, `worst ${worst}`);
}

console.log('\n=== 7. estimation stays blocked, and does not take the rest down ===');
{
  // REGRESSION TEST 7. No dataset: estimate is blocked, evaluate is not.
  const m = unpack(buildProposal(adl(), { at: 1 }).model);
  const p = plan(m);
  const ev = p.find((x) => x.operation === 'evaluate');
  const es = p.find((x) => x.operation === 'estimate');
  ok('evaluate is ready', !!ev && ev.runnable.length > 0);
  ok('estimate is blocked', !!es && es.blocked.length > 0);
  ok('  on the observations', /observations/.test(JSON.stringify(es.blocked)));
  ok('and the hypothetical surface is untouched by that',
    vertices(buildSpec(m), 'spec__response').length > 0);
}

console.log('\n=== 8. the same binding, in mechanics and gravity ===');
{
  // The bug class, checked where it could equally have lived: a part whose
  // value is a control's id.
  const mech = buildProposal({
    id: 'sm', title: 'spring-mass',
    params: [{ id: 'k', label: 'stiffness', value: 20, min: 1, max: 100 },
             { id: 'm', label: 'mass', value: 2, min: 0.1, max: 5 }],
    objects: [{ id: 'mech', kind: 'component', label: 'the mechanism', mechanism: {
      bodies: [{ id: 'm1', mass: 'm', x0: 1 }],
      springs: [{ id: 'k1', between: ['m1', 'ground'], value: 'k' }],
    } }],
  }, { at: 1 });
  ok('a mechanism bound through controls builds', mech.ok === true, mech.ok ? '' : mech.refusal.because);
  ok('  and runs', mech.ok && mech.report.capability === 'dynamic', mech.ok ? mech.report.capability : '');

  const grav = buildProposal({
    id: 'g', title: 'a pair',
    params: [{ id: 'ms', label: 'star mass', value: 1, min: 0.1, max: 3 }],
    objects: [{ id: 'sys', kind: 'system', label: 'the pair', gravity: {
      units: 'astronomical',
      bodies: [{ id: 'a', mass: 'ms', x: 0, y: 0, vx: 0, vy: 0 },
               { id: 'b', mass: 3e-6, x: 1, y: 0, vx: 0, vy: 6.2832 }],
    } }],
  }, { at: 1 });
  ok('a gravitating mass bound through a control builds', grav.ok === true, grav.ok ? '' : grav.refusal.because);
  ok('  and runs', grav.ok && grav.report.capability === 'dynamic');

  // …and a part naming a control that does not exist is REPORTED, not zeroed.
  const bad = buildProposal({
    id: 'bad', title: 'unbound stiffness', params: [],
    objects: [{ id: 'mech', kind: 'component', label: 'the mechanism', mechanism: {
      bodies: [{ id: 'm1', mass: 1, x0: 1 }],
      springs: [{ id: 'k1', between: ['m1', 'ground'], value: 'nosuchknob' }],
    } }],
  }, { at: 1 });
  ok('an unbound stiffness does not claim to run', bad.ok && bad.report.capability !== 'dynamic',
    bad.ok ? bad.report.capability : 'refused');
  ok('  and names the stiffness', bad.ok && /stiffness for k1/.test(JSON.stringify(bad.report.missing)));
}

console.log('\n=== 9. what the inspector and the conversation are told ===');
{
  const m = unpack(buildProposal(adl(), { at: 1 }).model);
  const lines = symbolLines(symbolTable(m)).join('\n');
  ok('every quantity is listed with its value', /β₁ \[spec__b1\].*= 0\.7/.test(lines), lines.slice(0, 300));
  ok('  and with what is driving it', /driven by the control b1/.test(lines));

  const unboundModel = unpack(buildProposal(adl({ coefficients: null }), { at: 1 }).model);
  const ul = symbolLines(symbolTable(unboundModel)).join('\n');
  ok('an unbound quantity says so plainly', /NOT BOUND/.test(ul), ul.slice(0, 300));
}

console.log('\n=== 10. an operation nobody can perform says so ===');
{
  // THE RECURRENCE REQUEST. "Starting from C₀ = 40, hold Y at 60 for 12
  // quarters and show the trajectory." A specification relates quantities at
  // ONE moment; C_t and C_lag are two column names with no index semantics, so
  // the model genuinely cannot be run forward.
  //
  // What matters is that it SAYS SO. `plan` lists the operations that are live
  // and omits the rest, which left "can you simulate this?" with no answer at
  // all — the empty-cube problem one level up.
  const m = unpack(buildProposal(adl(), { at: 1 }).model);

  const sim = askFor(m, 'simulate');
  ok('simulate is unsupported for a specification', sim.status === 'unsupported');
  ok('  and says what such a model would need', /a law saying how something CHANGES/.test(sim.says));
  ok('  distinguishing relating from following',
    /what goes with what, not what follows what/.test(sim.says));
  ok('  carried as missing structure, not only prose', sim.missing.length > 0);

  // NOTHING IS FABRICATED in the meantime.
  const spec = buildSpec(m);
  ok('no trajectory is drawn', !spec.primitives.some((p) => /trajectory/.test(p.of)));
  ok('and the hypothetical surface is untouched by the refusal',
    vertices(spec, 'spec__response').length > 0);

  // The other two verdicts still come back right.
  ok('evaluate is runnable', askFor(m, 'evaluate').status === 'runnable');
  ok('estimate is blocked, not unsupported', askFor(m, 'estimate').status === 'blocked');
  ok('  which is a different answer from "nothing can do this"',
    askFor(m, 'estimate').status !== askFor(m, 'simulate').status);

  // …and a model that CAN be simulated says so, so the verdict is about the
  // model rather than about the operation being unimplemented.
  const dyn = unpack(buildProposal({
    id: 'sm', title: 'spring-mass',
    params: [{ id: 'k', label: 'k', value: 20, min: 1, max: 100 }],
    objects: [{ id: 'mech', kind: 'component', label: 'the mechanism', mechanism: {
      bodies: [{ id: 'm1', mass: 1, x0: 1 }],
      springs: [{ id: 'k1', between: ['m1', 'ground'], value: 'k' }],
    } }],
  }, { at: 1 }).model);
  ok('a mechanism CAN be simulated', askFor(dyn, 'simulate').status === 'runnable');
  ok('  and a specification cannot — the verdict is about the model',
    askFor(dyn, 'simulate').status !== askFor(m, 'simulate').status);
}

console.log('\n=== 11. one identifier grammar ===');
{
  // SIX GRAMMARS DISAGREED. The evaluator's is the only one that decides
  // whether an expression can be computed, so it is now the only one — and a
  // name it cannot express is refused at the door rather than admitted and
  // found unusable four layers down.
  //
  // What that cost, verified before the fix: a control called `growth-rate`
  // was reported by symbolTable, known(), bindings() and resolve() as legal,
  // valued and bindable; compileExpr could never bind it; namesIn saw two
  // names; the router's diagnosis invented quantities; and affectedBy saw no
  // edge at all, so moving the slider marked nothing stale.
  const hyphen = sanitizeModel({
    id: 'h', title: 'H',
    params: [{ id: 'growth-rate', label: 'growth rate', value: 0.5, min: 0, max: 2 },
             { id: 'plain', label: 'plain', value: 1, min: 0, max: 2 }],
    objects: [],
  });
  ok('a name no expression can mention is refused', !hyphen.params.some((p) => p.id === 'growth-rate'));
  ok('  and a legal one beside it survives', hyphen.params.some((p) => p.id === 'plain'));
  ok('so known() never lies about what can be bound',
    known(symbolTable(hyphen)).every((n) => /^[a-z][a-z0-9_]*$/i.test(n)));

  // A MODEL's own id is not a quantity and keeps its hyphens.
  const slug = sanitizeModel({ id: 'linear-model', title: 'L', params: [], objects: [] });
  ok('a model id may still be a slug', slug?.id === 'linear-model');

  // Every quantity id in the shipped library already satisfies it — checked so
  // narrowing the grammar cannot have silently dropped real stored work.
  let offenders = 0;
  for (const entry of LIBRARY) {
    const m = entry.model ?? entry;
    for (const p of m.params ?? []) if (!/^[a-z][a-z0-9_]*$/i.test(p.id)) offenders++;
    for (const o of m.objects ?? []) if (!/^[a-z][a-z0-9_]*$/i.test(o.id)) offenders++;
  }
  ok('no shipped model loses a quantity to the narrower grammar', offenders === 0, `${offenders}`);
}

console.log('\n=== 12. two names that differ only in case are one name ===');
{
  // THE WORST BUG IN THE AUDIT. The state dedupe compared exactly while the
  // evaluator is case-insensitive, so `S` and `s` were both kept and then
  // collapsed into one slot at run time — the integrator solved a DIFFERENT
  // system from the one declared, with no refusal and no note. Measured: with
  // S' = -S and a second state s, S lost 0.37 over a step where it should have
  // lost 63.2.
  const m = sanitizeModel({
    id: 'c', title: 'C', params: [],
    objects: [{ id: 's', kind: 'system', label: 's', system: {
      states: [{ name: 'S', init: 100 }, { name: 's', init: 1 }],
      rhs: { S: '0 - S', s: '0 * s' }, dt: 1, steps: 1,
    } }],
  });
  const states = m.objects[0].system.states;
  ok('the collision is refused at the door', states.length === 1, JSON.stringify(states));
  ok('  keeping the first, not the last', states[0].name === 'S');
  ok('  so the system that runs IS the system declared', states[0].init === 100);
}

console.log('\n=== 13. an initial condition is never invented ===');
{
  // readSystem's own docstring: "a system with no initial value for one of its
  // states cannot be integrated, and the alternative to saying so is picking a
  // number — which produces a trajectory, and a trajectory is read as a
  // result." The sanitiser was picking the number, BEFORE readSystem could
  // object, for eight different spellings of "absent".
  for (const [label, init] of [
    ['omitted', undefined], ['null', null], ['NaN', NaN],
    ['empty', ''], ['spaces', '  '],
  ]) {
    const m = sanitizeModel({
      id: 't', title: 'T', params: [{ id: 'r', label: 'r', value: 0.5, min: 0, max: 2 }],
      objects: [{ id: 's', kind: 'system', label: 's', system: {
        states: [{ name: 'x', ...(init !== undefined ? { init } : {}) }], rhs: { x: 'r * x' },
      } }],
    });
    const read = readSystem(m, m.objects[0]);
    ok(`init ${label}: refused rather than started at zero`, read.ok === false);
    if (!read.ok) {
      ok(`  naming the state`, /a starting value for x/.test(JSON.stringify(read.missing)));
    }
  }
  // …and a stated one still runs.
  const good = sanitizeModel({
    id: 't', title: 'T', params: [{ id: 'r', label: 'r', value: 0.5, min: 0, max: 2 }],
    objects: [{ id: 's', kind: 'system', label: 's', system: {
      states: [{ name: 'x', init: 2 }], rhs: { x: 'r * x' },
    } }],
  });
  ok('a stated starting value still runs', readSystem(good, good.objects[0]).ok === true);
}

console.log('\n=== 14. the empty-cube guard covers what is SIMULATED too ===');
{
  // My own regression: the guard asked route(…, 'evaluate'), and no solver
  // does `evaluate` on a system or a trajectory — so it was dead for
  // everything that is simulated rather than evaluated, and a mechanism whose
  // stiffness nobody chose drew its parts anyway, each captioned "placed at
  // its rest position plus its computed displacement" off a system assembled
  // from a fabricated zero.
  const spring = (value) => buildProposal({
    id: 'sm', title: 'spring', params: [],
    objects: [{ id: 'mech', kind: 'component', label: 'the mechanism', mechanism: {
      bodies: [{ id: 'm1', mass: 1, x0: 1 }],
      springs: [{ id: 'k1', between: ['m1', 'ground'], ...(value !== null ? { value } : {}) }],
    } }],
  }, { at: 1 });

  const un = spring(null);
  const unSpec = buildSpec(unpack(un.model));
  ok('an unchosen stiffness draws NOTHING', unSpec.primitives.length === 0,
    `${unSpec.primitives.length} primitives`);
  ok('  and the carrier says what is missing',
    /stiffness for k1/.test(unSpec.notes.find((n) => n.of === 'mech')?.problem ?? ''));
  ok('  framed as not computed rather than as a label',
    /not computed/.test(unSpec.notes.find((n) => n.of === 'mech')?.problem ?? ''));
  ok('  and its PARTS do not draw as computed either',
    !unSpec.notes.some((n) => n.of.startsWith('mech__') && /computed displacement/.test(n.note ?? '')));

  const got = spring(20);
  const gotSpec = buildSpec(unpack(got.model));
  ok('a chosen stiffness draws', gotSpec.primitives.length > 0);
  ok('  with no gaps', !gotSpec.notes.some((n) => n.problem), JSON.stringify(gotSpec.notes.filter((n) => n.problem)));
  ok('  and grades dynamic', got.report.capability === 'dynamic');

  // A DERIVED SURFACE KEEPS ITS OWN VERDICT. Inheriting the carrier's
  // unconditionally was wrong the other way: a specification's response
  // surface picked up the specification's blocked ESTIMATE — an operation it
  // does not use — and stopped drawing a plane it could compute.
  const wage = unpack(buildProposal(adl(), { at: 1 }).model);
  ok('a response surface is not blocked by its specification',
    vertices(buildSpec(wage), 'spec__response').length > 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
