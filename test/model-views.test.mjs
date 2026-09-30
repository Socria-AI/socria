// ONE MODEL, MANY LINKED REPRESENTATIONS — ACROSS STRUCTURALLY DIFFERENT DOMAINS.
//
// THE PROBLEM THIS SUITE IS WRITTEN AGAINST. A built model already knows an
// enormous amount about itself — what each object is, what supplies its values,
// which operation produced it, which solver ran, what it rests on, what rests on
// it, what is missing and why — and almost none of it reached a reader.
// `chooseRepresentation` picked ONE representation and listed `alternatives` as
// bare strings, with no account of whether either was available, what it would
// show, or what it would take. The model contained far more structured
// information than the interface exposed.
//
// THE TEST THAT MATTERS IS THE CROSS-DOMAIN ONE. A registry that only works on
// the model it was written against is a hardcoded UI with extra steps. So every
// assertion below runs over models from different families — a surface, a
// vector field, an integrated system, a mechanism, an n-body problem, a fitted
// regression, an equation system, a conceptual map — and what is asserted is
// that each gets DIFFERENT and APPROPRIATE answers, and that the ones that do
// not apply are ABSENT rather than empty.

import { LIBRARY, modelById } from './.tmp/library.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { buildProposal } from './.tmp/propose.mjs';
import { buildSpec, chooseRepresentation } from './.tmp/spec.mjs';
import { buildObject } from './.tmp/compile.mjs';
import { sanitizeModel } from './.tmp/schema.mjs';
import { viewsFor, unavailable, primaryView, viewLines } from './.tmp/views.mjs';
import { operationsOn } from './.tmp/solve.mjs';
import { inspectModel, inspectObject, whyOf, whyLines, whatChanged, computationFacts, transparencyLine } from './.tmp/inspect.mjs';
import { modelStateFrom } from './.tmp/model-state.mjs';
import { EMPTY_WORKSPACE, applyModelOps, modelFor, openFromProposal } from './.tmp/docs.mjs';
import { inputsAwaiting } from './.tmp/derive.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const fam = (m) => new Set(viewsFor(m).map((v) => v.family));
const M = (id) => unpack(modelById(id));

/**
 * A CONCEPTUAL MODEL — no expression, no solver, nothing that computes.
 *
 * Built here because the benchmark library has none: every one of its nineteen
 * models computes something, so nothing in it tests the case the architecture
 * must handle most carefully. A reasoning structure is a model — it has objects,
 * meanings and relations — and the question is whether the registry offers it the
 * views it has and REFUSES the ones it does not, without claiming a backend.
 */
const CONCEPTUAL = () => unpack(sanitizeModel({
  id: 'reasoning', title: 'A line of argument', domain: 'reasoning',
  assumptions: ['Nothing here is computed; these are relationships somebody asserted.'],
  params: [],
  objects: [
    { id: 'claim', kind: 'node', label: 'The claim', meaning: 'what is being argued for',
      fidelity: 'conceptual', provenance: { origin: 'user', detail: 'stated' } },
    { id: 'reason', kind: 'node', label: 'The reason', meaning: 'why it is held',
      relations: [{ to: 'claim', as: 'influences', why: 'it is offered in support' }],
      fidelity: 'conceptual', provenance: { origin: 'user', detail: 'stated' } },
    { id: 'doubt', kind: 'node', label: 'The doubt', meaning: 'what would undercut it',
      relations: [{ to: 'reason', as: 'constrains', why: 'it bears on whether the reason holds' }],
      fidelity: 'conceptual', provenance: { origin: 'user', detail: 'stated' } },
  ],
}));

// ═══ every representation is DERIVED, never listed ══════════════════
console.log('\n=== the registry answers differently per model family ===');
{
  // A SURFACE gets a surface, its level sets, its cross-sections and its slopes.
  const saddle = M('saddle');
  ok('a surface offers a surface', fam(saddle).has('surface'));
  ok('  its level sets', fam(saddle).has('contour'));
  ok('  its cross-sections', fam(saddle).has('slice'));
  ok('  and its slopes', fam(saddle).has('derivative'));
  ok('  but not a trajectory', !fam(saddle).has('trajectory'));
  ok('  and not a residual', !fam(saddle).has('residual'));

  // A VECTOR FIELD gets a field and none of the surface's views.
  const field = M('point-charge');
  ok('a field offers a field', fam(field).has('field'));
  ok('  and not a surface', !fam(field).has('surface'));
  ok('  nor contours of one', !fam(field).has('contour'));

  // AN INTEGRATED SYSTEM gets a trajectory, a timeline, and a phase portrait
  // exactly when it has two or more states.
  const osc = M('oscillator');
  ok('a system offers its trajectory', fam(osc).has('trajectory'));
  ok('  a phase portrait, because it has two or more states', fam(osc).has('phase'));
  ok('  a timeline', fam(osc).has('timeline'));
  ok('  and its parts, because it is a mechanism', fam(osc).has('mechanism'));
  ok('  but no contours', !fam(osc).has('contour'));

  // A LORENZ ATTRACTOR has states but no clock, so no animation.
  const lorenz = M('lorenz');
  ok('a trajectory with no clock offers no animation', !fam(lorenz).has('animation'));
  ok('  while one with a clock does', fam(M('double-pendulum')).has('animation'));

  // A FITTED REGRESSION gets residuals and intervals; an unfitted one does not.
  const fitted = M('linear-model');
  ok('a fit offers its residuals', fam(fitted).has('residual'), JSON.stringify([...fam(fitted)]));
  const open = M('open-specification');
  ok('a specification with no method offers no residuals', !fam(open).has('residual'));
  ok('  and says what a residual view would take',
    unavailable(open).some((u) => u.family === 'residual' && /method you chose/.test(u.wouldNeed)),
    JSON.stringify(unavailable(open).filter((u) => u.family === 'residual')));

  // EVERY model has the floor: its own account of itself.
  for (const e of LIBRARY) {
    const m = unpack(e.build());
    ok(`${e.id} offers at least its own account`, fam(m).has('text'));
    ok(`  ${e.id} names a primary view`, !!primaryView(m), e.id);
    ok(`  ${e.id} says why each is available`, viewsFor(m).every((v) => !!v.because && !!v.shows));
    ok(`  ${e.id} earns each view's fidelity`, viewsFor(m).every((v) => !!v.fidelity));
  }
}

// ═══ what is NOT available says what it would take ══════════════════
console.log('\n=== the honest half ===');
{
  const saddle = M('saddle');
  const missing = unavailable(saddle);
  ok('a surface is told it has no trajectory', missing.some((u) => u.family === 'trajectory'));
  ok('  and what one would need',
    /a law saying how something CHANGES/.test(missing.find((u) => u.family === 'trajectory')?.wouldNeed ?? ''));
  ok('nothing is listed as unavailable that IS available',
    missing.every((u) => !fam(saddle).has(u.family)), JSON.stringify(missing.map((u) => u.family)));
  ok('a distribution is honestly unavailable everywhere',
    LIBRARY.every((e) => unavailable(unpack(e.build())).some((u) => u.family === 'distribution')));
  ok('  and says the backend does not exist',
    /this engine does not have/.test(missing.find((u) => u.family === 'distribution')?.wouldNeed ?? ''));
}

// ═══ a view declared without a renderer says so ═════════════════════
console.log('\n=== declared is not the same as drawn ===');
{
  const all = LIBRARY.flatMap((e) => viewsFor(unpack(e.build())));
  const declared = all.filter((v) => v.notDrawnYet);
  ok('some views are declared and not yet rendered', declared.length > 0);
  ok('  and every one of them says so rather than looking available',
    declared.every((v) => v.notDrawnYet === true));
  ok('  while the primary one always has a renderer',
    LIBRARY.every((e) => {
      const p = primaryView(unpack(e.build()));
      return !p || !p.notDrawnYet;
    }));
}

// ═══ the inspector: only what exists ════════════════════════════════
console.log('\n=== the inspector shows only what is there ===');
{
  for (const e of LIBRARY) {
    const m = unpack(e.build());
    const i = inspectModel(m);
    ok(`${e.id}: says what it is`, !!i.what && i.what.includes(m.title));
    ok(`  ${e.id}: no section is empty`, i.sections.every((s) => s.facts.length > 0),
      JSON.stringify(i.sections.filter((s) => !s.facts.length).map((s) => s.id)));
    ok(`  ${e.id}: every section has a one-line summary`, i.sections.every((s) => !!s.summary));
  }
  // A model with no data has no data fact; one with data has one.
  const noData = inspectModel(M('saddle'));
  ok('a model with no observations mentions none',
    !JSON.stringify(noData.sections).includes('observations of'));
  const withData = inspectModel(M('linear-model'));
  ok('a model with observations says how many',
    /\d+ observations of/.test(JSON.stringify(withData.sections)));
  // A conceptual model says so, rather than claiming a backend.
  const concept = CONCEPTUAL();
  ok('a conceptual model says no backend ran',
    /CONCEPTUAL/.test(transparencyLine(concept)), transparencyLine(concept));
  ok('  and offers the views it has', fam(concept).has('network'), JSON.stringify([...fam(concept)]));
  ok('  and none it does not', !fam(concept).has('surface') && !fam(concept).has('trajectory'));
  ok('  claiming no computation at all', computationFacts(concept).length === 0);
  // …and an integrating one never says "no computational backend ran". It may
  // still say "at least: conceptual" where part of it genuinely is.
  ok('  and an integrating one does not claim nothing ran',
    !/no computational backend ran/.test(transparencyLine(M('oscillator'))),
    transparencyLine(M('oscillator')));
  ok('  saying at best what it earned',
    /At best: NUMERICALLY COMPUTED/.test(transparencyLine(M('oscillator'))),
    transparencyLine(M('oscillator')));
}

// ═══ computation transparency: what actually ran ════════════════════
console.log('\n=== what actually computed ===');
{
  const osc = M('oscillator');
  const facts = computationFacts(osc);
  ok('the integrator names itself', facts.some((f) => /Runge–Kutta|rk4/i.test(f.value)), JSON.stringify(facts.map(f=>f.value.slice(0,60))));
  ok('  with its step and its count', facts.some((f) => /steps of dt/.test(f.value)));
  ok('  and the operation', facts.some((f) => f.label.startsWith('SIMULATE')));
  const fit = computationFacts(M('linear-model'));
  ok('an estimator names its observations and coefficients',
    fit.some((f) => /observations, \d+ coefficients/.test(f.value)), JSON.stringify(fit.map(f=>f.value.slice(0,70))));
  ok('  and which standard errors', fit.some((f) => /classical|HC1/.test(f.value)));
  const concept = computationFacts(CONCEPTUAL());
  ok('a conceptual model claims no backend', concept.length === 0, JSON.stringify(concept));
}

// ═══ why is this what it is — from the graph ════════════════════════
console.log('\n=== the dependency chain ===');
{
  const osc = M('oscillator');
  const body = osc.objects.find((o) => o.kind === 'body');
  const chain = whyOf(osc, body.id);
  ok('a part has a chain', chain.length > 1, JSON.stringify(chain.map((s) => s.label)));
  ok('  which bottoms out in something somebody set',
    chain.some((s) => s.origin === 'user'), JSON.stringify(chain.map((s) => s.origin)));
  ok('  and each step carries its own provenance', chain.every((s) => s.depth >= 0 && !!s.says));
  ok('  with depth increasing away from the thing', chain[0].depth === 0);
  // A cycle does not loop forever.
  const cyclic = unpack(sanitizeModel({
    id: 'cyc', title: 'a loop', params: [],
    objects: [
      { id: 'a', kind: 'scalar', label: 'a', definition: 'b + 1', depends: ['b'] },
      { id: 'b', kind: 'scalar', label: 'b', definition: 'a + 1', depends: ['a'] },
    ],
  }));
  ok('a cycle terminates', whyOf(cyclic, 'a').length <= 2, String(whyOf(cyclic, 'a').length));
  // The chain of a computed value reaches the thing that computed it.
  const wage = unpack(buildProposal({
    id: 'w', title: 'a relationship', params: [
      { id: 'b0', label: 'β₀', value: 5, min: 0, max: 10, step: 0.1 },
      { id: 'b1', label: 'β₁', value: 2, min: 0, max: 10, step: 0.1 }],
    objects: [{ id: 'sp', kind: 'specification', label: 'y on x',
      estimation: { y: 'y', x: ['x'], coefficients: { intercept: 'b0', x: 'b1' }, over: { x: [0, 10] } } }],
  }, { at: 1 }).model);
  const readout = wage.objects.find((o) => o.meta?.role === 'readout');
  const why = whyLines(wage, readout.id);
  ok('a computed value explains itself', why.length > 1, JSON.stringify(why));
  ok('  naming the expression it came from', /evaluated from/.test(why.join(' ')), why.join(' ').slice(0, 140));
}

// ═══ selection is canonical, so every view means the same "this" ════
console.log('\n=== linked selection ===');
{
  const model = {
    id: 'sel', title: 'a relationship', params: [
      { id: 'b0', label: 'β₀', value: 5, min: 0, max: 10, step: 0.1 },
      { id: 'b1', label: 'β₁', value: 2, min: 0, max: 10, step: 0.1 }],
    objects: [{ id: 'sp', kind: 'specification', label: 'y on x',
      estimation: { y: 'y', x: ['x'], coefficients: { intercept: 'b0', x: 'b1' }, over: { x: [0, 10] } } }],
  };
  let ws = openFromProposal(EMPTY_WORKSPACE, model, { at: 1 }).workspace;
  const id = ws.docs[0].id;
  const doc = () => modelFor(ws.docs.find((d) => d.id === id));
  ok('nothing is selected to begin with', doc().selected === undefined);
  const picked = applyModelOps(ws, [{ op: 'select', id: 'sp__b1' }], { at: 2 });
  ws = picked.workspace;
  ok('selecting writes canonical state', doc().selected === 'sp__b1', String(doc().selected));
  ok('  and says what was selected', /β₁/.test(picked.said.join(' ')), picked.said.join(' '));
  // EVERY VIEW READS IT. The chat state is one of those views.
  const st = modelStateFrom(doc(), buildSpec(doc()), {});
  ok('the conversation is handed the selection', st.selected === 'sp__b1', String(st.selected));
  ok('  with the object, not a pixel', st.readouts.some((r) => /SELECTED — this is what "this" means/.test(r)));
  ok('  and its dependency chain', st.readouts.some((r) => /WHY IT IS WHAT IT IS/.test(r)));
  ok('  and what else can be looked at', st.readouts.some((r) => /REPRESENTATIONS AVAILABLE/.test(r)));
  ok('  and the structured view list', (st.views ?? []).length > 0, String((st.views ?? []).length));
  ok('    each one with why it is available', (st.views ?? []).every((v) => !!v.because));

  // CLICKING AROUND MUST NOT FILL THE HISTORY.
  const before = ws.docs.find((d) => d.id === id).revisions.length;
  for (const target of ['sp__b0', 'sp__b1', 'sp__y']) {
    ws = applyModelOps(ws, [{ op: 'select', id: target }], { at: 3 }).workspace;
  }
  const after = ws.docs.find((d) => d.id === id).revisions.length;
  ok('three more selections add no revisions', after === before, `${before} → ${after}`);
  ok('  and the last one stuck', doc().selected === 'sp__y', String(doc().selected));
  // …but a real edit does, and undo steps past the whole run of selections.
  ws = applyModelOps(ws, [{ op: 'set', id: 'b1', value: 4 }], { at: 4 }).workspace;
  ok('an edit does add a revision', ws.docs.find((d) => d.id === id).revisions.length === after + 1);
  ws = applyModelOps(ws, [{ op: 'undo' }], { at: 5 }).workspace;
  ok('  and undo returns the value, not a click', doc().params.find((p) => p.id === 'b1').value === 2);

  // A selection that names nothing is refused.
  const ghost = applyModelOps(ws, [{ op: 'select', id: 'nothing_here' }], { at: 6 });
  ok('selecting something absent is refused', !ghost.changed);
  // …and it survives a save.
  ok('the selection survives a reload', sanitizeModel(doc()).selected === 'sp__y');
}

// ═══ A FRAME IS NEVER CLAIMED FOR SOMETHING THAT CANNOT BE DRAWN ════
//
// THE FAILURE THIS IS WRITTEN AGAINST, reported from the live product and
// reproduced exactly: a log-wage relationship whose second input had no range
// came back as an EMPTY 3D CARTESIAN CUBE. `viewsFor` had it right — the surface
// refuses, so only structure, sensitivity, equation and text were available — and
// `chooseRepresentation` looked at OBJECT KINDS, saw a `surface`, and returned
// surface3d in three dimensions anyway. Two answers to one question, disagreeing
// exactly where it mattered.
//
// An empty box is the most confident thing this engine can draw and the least
// honest.
console.log('\n=== the frame comes from what can be shown ===');
{
  const halfSpecified = unpack(buildProposal({
    id: 'half', title: 'one input has no range', params: [
      { id: 'a0', label: 'β₀', value: 1, min: 0, max: 5, step: 0.1 },
      { id: 'a1', label: 'β₁', value: 2, min: 0, max: 5, step: 0.1 },
      { id: 'a2', label: 'β₂', value: 3, min: 0, max: 5, step: 0.1 }],
    objects: [{ id: 'sp', kind: 'specification', label: 'y on x and z',
      estimation: { y: 'y', x: ['x', 'z'], coefficients: { intercept: 'a0', x: 'a1', z: 'a2' },
        over: { x: [0, 10] } } }],
  }, { at: 1 }).model);

  const choice = chooseRepresentation(halfSpecified);
  const spec = buildSpec(halfSpecified);
  ok('nothing draws', spec.primitives.length === 0, String(spec.primitives.length));
  ok('  so the frame is NOT three dimensions', choice.dimensionality === 2, String(choice.dimensionality));
  ok('  and not a surface', choice.kind !== 'surface3d', choice.kind);
  ok('  the spec agrees', spec.dimensionality === 2, String(spec.dimensionality));
  ok('  and the chooser agrees with the registry',
    choice.kind === (primaryView(halfSpecified)?.family === 'equation' ? 'equation' : choice.kind),
    `${choice.kind} vs ${primaryView(halfSpecified)?.family}`);
  ok('  the input with no range is still named as an input',
    inputsAwaiting(halfSpecified).some((q) => q.label === 'z'),
    JSON.stringify(inputsAwaiting(halfSpecified)));
  ok('    and says a range is what it needs, not observations',
    /does not need observations/.test(inputsAwaiting(halfSpecified)[0]?.why ?? ''),
    inputsAwaiting(halfSpecified)[0]?.why);

  // …and the moment it CAN be drawn, three dimensions are legitimate again.
  const whole = unpack(buildProposal({
    id: 'whole', title: 'both inputs have ranges', params: [
      { id: 'a0', label: 'β₀', value: 1, min: 0, max: 5, step: 0.1 },
      { id: 'a1', label: 'β₁', value: 2, min: 0, max: 5, step: 0.1 },
      { id: 'a2', label: 'β₂', value: 3, min: 0, max: 5, step: 0.1 }],
    objects: [{ id: 'sp', kind: 'specification', label: 'y on x and z',
      estimation: { y: 'y', x: ['x', 'z'], coefficients: { intercept: 'a0', x: 'a1', z: 'a2' },
        over: { x: [0, 10], z: [0, 10] } } }],
  }, { at: 1 }).model);
  ok('with both ranges it draws', buildSpec(whole).primitives.length > 0);
  ok('  and three dimensions are legitimate', chooseRepresentation(whole).dimensionality === 3);
  ok('  with no input left waiting', inputsAwaiting(whole).length === 0);

  // EVERY library model still gets a frame it can fill.
  for (const e of LIBRARY) {
    const m = unpack(e.build());
    const sp = buildSpec(m);
    ok(`${e.id}: never an empty frame with extent claimed`,
      sp.primitives.length > 0 || sp.dimensionality === 2,
      `${sp.primitives.length} primitives in ${sp.dimensionality}D`);
  }
}

// ═══ THE REGISTRY CANNOT SILENTLY OMIT SOMETHING THAT DRAWS ═════════
//
// The empty-frame failure in the other direction, and the one that made the
// frame chooser dangerous to trust: a series with numbers in it DRAWS — the data
// solver reads it straight off the block — and no branch enumerated a `series`,
// so the registry reported nothing available and no extent was claimed for a
// picture that was there. A registry that enumerates by hand omits by hand.
console.log('\n=== nothing that draws is missing from the registry ===');
{
  // THE INVARIANT, STATED PRECISELY. Not "every object that draws is a view" —
  // a spring is a mark INSIDE the mechanism's view and a centre marker is a mark
  // inside the orbit's, and offering "a view of the spring" would be wrong. What
  // must hold is that an object that draws and is NOT a part of something else is
  // reachable as a view of its own, because otherwise the registry has a picture
  // it cannot name and the frame chooser has no reason to claim extent for it.
  const isPart = (o) =>
    ['mech', 'gravity', 'spec', 'of'].some((k) => typeof o.meta?.[k] === 'string') ||
    (o.relations ?? []).some((r) => r.as === 'contains');
  for (const e of LIBRARY) {
    const m = unpack(e.build());
    const all = viewsFor(m);
    const standalone = m.objects.filter(
      (o) => !isPart(o) && buildObject(m, o).primitives.length > 0
    );
    const orphans = standalone.filter((o) => !all.some((v) => v.of === o.id));
    ok(`${e.id}: every standalone object that draws has a view`, orphans.length === 0,
      JSON.stringify(orphans.map((o) => `${o.id}:${o.kind}`)));
  }
  // …and the frame follows: anything that produces marks gets extent claimed.
  for (const e of LIBRARY) {
    const m = unpack(e.build());
    const sp = buildSpec(m);
    if (!sp.primitives.length) continue;
    ok(`${e.id}: a picture that exists gets a frame`, viewsFor(m).some((v) => v.marks),
      JSON.stringify(viewsFor(m).map((v) => `${v.family}:${v.marks}`)));
  }
  // A series with numbers, specifically — the one that was missing.
  const series = unpack(sanitizeModel({
    id: 'ser', title: 'readings over time', params: [],
    data: { d: { label: 'readings', t: [0, 1, 2, 3], v: [1, 4, 9, 16] } },
    objects: [{ id: 'v', kind: 'series', label: 'the reading', data: 'd' }],
  }));
  ok('a series with numbers has a view', viewsFor(series).some((v) => v.of === 'v'),
    JSON.stringify(viewsFor(series).map((v) => v.family)));
  ok('  which occupies extent', viewsFor(series).some((v) => v.of === 'v' && v.marks));
  ok('  and it draws', buildSpec(series).primitives.length > 0);

  // A SOLVED EQUATION SYSTEM DRAWS ITS FIGURE, and the registry says so.
  const market = unpack(buildProposal({
    id: 'mkt', title: 'where it clears', params: [
      { id: 'a', label: 'a', value: 120, min: 0, max: 300, step: 1 },
      { id: 'b', label: 'b', value: -2, min: -10, max: 0, step: 0.1 },
      { id: 'c', label: 'c', value: -20, min: -100, max: 100, step: 1 },
      { id: 'd', label: 'd', value: 3, min: 0, max: 10, step: 0.1 }],
    objects: [{ id: 'eq', kind: 'system', label: 'where it clears', equations: {
      unknowns: ['qd', 'qs', 'pc', 'pp'],
      relations: ['qd = a + b * pc', 'qs = c + d * pp', 'pc = pp', 'qd = qs'],
      units: { qd: 'units', qs: 'units', pc: 'currency', pp: 'currency' } } }],
  }, { at: 1 }).model);
  ok('a solved system offers its figure', viewsFor(market).some((v) => v.of === 'eq' && v.marks),
    JSON.stringify(viewsFor(market).map((v) => `${v.family}:${v.marks}`)));
  ok('  and the relations as written, separately',
    viewsFor(market).some((v) => v.of === 'eq' && v.family === 'equation' && !v.marks));
  ok('  and the frame is claimed, because there is something in it',
    buildSpec(market).primitives.length > 0 && chooseRepresentation(market).dimensionality === 2);
}

// ═══ what changed, what recomputed, what did not ════════════════════
console.log('\n=== what changed ===');
{
  const model = {
    id: 'chg', title: 'a relationship', params: [
      { id: 'b0', label: 'β₀', value: 5, min: 0, max: 10, step: 0.1 },
      { id: 'b1', label: 'β₁', value: 2, min: 0, max: 10, step: 0.1 },
      { id: 'idle', label: 'used by nothing', value: 1, min: 0, max: 9 }],
    objects: [{ id: 'sp', kind: 'specification', label: 'y on x',
      estimation: { y: 'y', x: ['x'], coefficients: { intercept: 'b0', x: 'b1' }, over: { x: [0, 10] } } }],
  };
  let ws = openFromProposal(EMPTY_WORKSPACE, model, { at: 1 }).workspace;
  const id = ws.docs[0].id;
  ws = applyModelOps(ws, [{ op: 'set', id: 'b1', value: 4 }], { at: 2 }).workspace;
  const m = modelFor(ws.docs.find((d) => d.id === id));
  const change = whatChanged(m);
  ok('it knows what changed', change?.what === 'β₁', String(change?.what));
  ok('  from what to what', change?.from === '2' && change?.to === '4', `${change?.from} → ${change?.to}`);
  ok('  what recomputed', change.reached.length > 0, JSON.stringify(change.reached.map((r) => r.label)));
  ok('  AND what did not, which is half the answer', change.untouched.length > 0,
    JSON.stringify(change.untouched.map((r) => r.label)));
  ok('  the unrelated control is not claimed to have moved',
    !change.reached.some((r) => r.of === 'idle'));
  ok('the conversation is told', modelStateFrom(m, buildSpec(m), {}).readouts.some((r) => /WHAT CHANGED/.test(r)));
  ok('a model nobody has changed reports nothing', whatChanged(M('saddle')) === null);
}

// ═══ inspecting one object, across families ═════════════════════════
console.log('\n=== what is this? ===');
{
  for (const [id, pick] of [
    ['oscillator', (m) => m.objects.find((o) => o.kind === 'body')],
    ['saddle', (m) => m.objects.find((o) => o.kind === 'surface')],
    ['point-charge', (m) => m.objects.find((o) => o.kind === 'field')],
    ['linear-model', (m) => m.objects.find((o) => o.meta?.role === 'coefficient')],

  ]) {
    const m = M(id);
    const o = pick(m);
    if (!o) { ok(`${id}: has something to inspect`, false, 'nothing matched'); continue; }
    const i = inspectObject(m, o.id);
    ok(`${id}: an object says what it is`, !!i && !!i.what, id);
    ok(`  ${id}: no empty section`, i.sections.every((s) => s.facts.length > 0));
    ok(`  ${id}: and it is about that object`, i.of === o.id);
  }
  // …including a purely conceptual one, which must inspect without claiming
  // anything was computed.
  const c = CONCEPTUAL();
  const ci = inspectObject(c, 'reason');
  ok('a conceptual object says what it is', !!ci && /why it is held/.test(JSON.stringify(ci.sections)));
  ok('  and claims no operation', !JSON.stringify(ci.sections).includes('would run it'));
  ok('inspecting something absent returns nothing', inspectObject(M('saddle'), 'ghost') === null);
}

// ═══ the whole loop: change → invalidate → recompute → every view ═══
console.log('\n=== the loop ===');
{
  const model = {
    id: 'loop', title: 'a surface', params: [
      { id: 'k', label: 'steepness', value: 1, min: 0.1, max: 4, step: 0.1 }],
    objects: [{ id: 's', kind: 'surface', label: 'z', defs: { z: 'k * (x^2 + y^2)' },
      over: { x: [-2, 2], y: [-2, 2] }, meta: { axes: 'x,y' } }],
  };
  let ws = openFromProposal(EMPTY_WORKSPACE, model, { at: 1 }).workspace;
  const id = ws.docs[0].id;
  const doc = () => modelFor(ws.docs.find((d) => d.id === id));
  const top = () => {
    const pts = buildSpec(doc()).primitives.find((p) => p.p === 'mesh')?.rows.flat().filter(Boolean) ?? [];
    return Math.max(...pts.map((p) => p.z));
  };
  const viewsBefore = viewsFor(doc()).length;
  const before = top();
  ws = applyModelOps(ws, [{ op: 'set', id: 'k', value: 2 }], { at: 2 }).workspace;
  ok('a parameter change recomputes the surface', Math.abs(top() - 2 * before) < 1e-6, `${before} → ${top()}`);
  ok('  and the same representations remain available', viewsFor(doc()).length === viewsBefore);
  ok('  and the inspector reports the new value',
    JSON.stringify(inspectModel(doc()).sections).includes('"value":"2"'),
    JSON.stringify(inspectModel(doc()).sections.find((s) => s.id === 'state')?.facts));
  ws = applyModelOps(ws, [{ op: 'undo' }], { at: 3 }).workspace;
  ok('  and undo puts it back', Math.abs(top() - before) < 1e-6);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
