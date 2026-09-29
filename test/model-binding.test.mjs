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
import { route, plan } from './.tmp/solve.mjs';
import { buildSpec } from './.tmp/spec.mjs';
import { buildObject, scopeOf } from './.tmp/compile.mjs';
import { sanitizeModel } from './.tmp/schema.mjs';
import { affectedBy } from './.tmp/deps.mjs';
import { symbolTable, bindings, resolve, machineOf, symbolLines } from './.tmp/symbols.mjs';
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

console.log('\n=== 3. the binding is DECLARED, never guessed ===');
{
  // No declaration, and no control named after the canonical id: unbound, and
  // reported. NOT fuzzily matched to `b1` because it looks similar.
  const m = unpack(buildProposal(adl({ coefficients: null }), { at: 1 }).model);
  const r = m.objects.find((o) => o.meta?.role === 'response');
  const routed = route(m, r, 'evaluate');
  ok('an unbound coefficient is incomplete', routed.status === 'incomplete');
  ok('  and nothing was matched by resemblance',
    !bindings(symbolTable(m)).spec__b1);
  ok('  the gap naming the quantity the person sees',
    /β₁/.test(JSON.stringify(routed.missing)), JSON.stringify(routed.missing));

  // THE EMPTY-CUBE RULE: no geometry, and a stated reason.
  const spec = buildSpec(m);
  ok('NOTHING is drawn for it', vertices(spec, r.id).length === 0);
  const note = spec.notes.find((n) => n.of === r.id);
  ok('  and the picture says why', !!note?.problem, JSON.stringify(note));
  ok('  rather than reporting a grid it did not compute', !/grid/.test(note?.note ?? ''));

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
