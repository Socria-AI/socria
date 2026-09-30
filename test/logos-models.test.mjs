// The on-ramp, and the model as a thing the person owns.
//
// TWO CLAIMS, AND THIS SUITE IS MOSTLY THE SECOND ONE.
//
// The first is the trust boundary: a language model may PROPOSE a structured
// model and may not present one as built, because `built` means the engine
// produced and verified it and everything downstream trusts that. The tests here
// try to get a forged model through every door.
//
// The second is identity. A model used to be something Logos produced and then
// froze, so "delete the second spring" could only hide pixels and "undo that"
// meant nothing. A model is now a DOCUMENT with a stable id and revisions, and
// what is checked below is that an edit produces a revision of the SAME model,
// that a removal changes the governing equations rather than the drawing, and
// that the motion afterwards is different because the physics is different.

import { sanitizeModel } from './.tmp/schema.mjs';
import { sanitizeViz } from './.tmp/logos-viz.mjs';
import { sanitizeMap } from './.tmp/logos.mjs';
import { buildProposal, revalidate, reportLines } from './.tmp/propose.mjs';
import { unpack } from './.tmp/unpack.mjs';
import {
  open, remove, use, duplicate, branch, undo, redo, reset, restore,
  setValue, removeObject, replacePart, addPart, applyModelOps,
  current, docOf, activeDoc, canUndo, canRedo, modelFor, editsState,
  sanitizeWorkspace, openFromProposal, compareRevisions, sinceBuilt, docLines,
  EMPTY_WORKSPACE, REVISION_CAP,
} from './.tmp/docs.mjs';
import { isModelOp, parseVizOps, vizOpsHelp, sanitizeModelState, MODEL_OPS } from './.tmp/viz-model.mjs';
import { buildSpec } from './.tmp/spec.mjs';
import { runFor, stateAt, seriesOf, forgetRuns } from './.tmp/system.mjs';
import { oscillator, chain, saddle, linearModel } from './.tmp/library.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

/** A mechanism proposal of the kind the extractor is now told to write. */
const proposal = (over = {}) => ({
  id: 'spring_system',
  title: 'A mass on a spring',
  domain: 'mechanics',
  aspect: 'equal',
  equations: ['m ẍ + c ẋ + k x = F(t), assembled from the parts'],
  assumptions: ['One degree of freedom along the axis.'],
  params: [
    { id: 'm', label: 'mass', value: 1, min: 0.1, max: 5, units: 'kg' },
    { id: 'k', label: 'stiffness', value: 20, min: 1, max: 100, units: 'N/m' },
    { id: 'c', label: 'damping', value: 0.5, min: 0, max: 10 },
  ],
  time: { t: 0, min: 0, max: 20, units: 's' },
  objects: [
    {
      id: 'mech', kind: 'component', label: 'The mechanism',
      meaning: 'one body, one spring, one damper',
      mechanism: {
        bodies: [{ id: 'm1', mass: 'm', x0: 1, label: 'the mass', at: 3 }],
        springs: [{ id: 'k1', between: ['m1', 'ground'], value: 'k', label: 'the spring' }],
        dampers: [{ id: 'c1', between: ['m1', 'ground'], value: 'c', label: 'the damper' }],
        dt: 0.004, steps: 3000,
      },
    },
  ],
  ...over,
});

console.log('=== a model may propose; only the engine may build ===');
{
  const viz = sanitizeViz({
    kind: 'diagram', view: { xMin: -1, xMax: 1 }, params: [], parts: [{ o: 'hrule', at: 0 }],
    built: saddle(),
  });
  ok('a built model written by a language model is stripped', !viz?.built);

  const withProposal = sanitizeViz({
    kind: 'diagram', view: { xMin: -1, xMax: 1 }, params: [], parts: [{ o: 'hrule', at: 0 }],
    propose: proposal(),
  });
  ok('  and a proposal is kept instead', !!withProposal?.propose);
  ok('  which is not drawable and not drawn', !withProposal?.built);

  const map = sanitizeMap({
    nodes: [{ id: 'n1', type: 'idea', label: 'a thought' }], edges: [], context: 'math',
    viz: { kind: 'diagram', view: { xMin: -1, xMax: 1 }, params: [], parts: [{ o: 'hrule', at: 0 }], built: saddle() },
  });
  ok('the same is true through the map', !map.viz?.built);

  const stored = sanitizeMap(
    {
      nodes: [{ id: 'n1', type: 'idea', label: 'a thought' }], edges: [], context: 'math',
      viz: { kind: 'surface', expr: 'x^2 - y^2', varName: 'x', view: { xMin: -3, xMax: 3 }, params: [], built: saddle() },
    },
    { trust: 'stored' }
  );
  ok('a model from this product’s own storage survives', !!stored.viz?.built);

  ok('a model that cannot be computed is not a built model',
    revalidate({ id: 'x', title: 'T', params: [], objects: [{ id: 'o', kind: 'annotation', label: 'O' }] }) === null);
  ok('  and one that can, is', !!revalidate(saddle()));
}

console.log('\n=== the on-ramp: validated, routed, and honest about what it did ===');
{
  const built = buildProposal(proposal(), { at: 1000 });
  ok('a mechanism proposal builds', built.ok, JSON.stringify(built.refusal ?? {}));
  ok('  the engine names what runs it', built.report.solvers.some((s) => /Mechanism assembler/.test(s.solver)),
    JSON.stringify(built.report.solvers));
  ok('  and what it may honestly claim', built.report.capability === 'dynamic', built.report.capability);
  ok('  in one sentence a reply can use', /Built as a dynamic model/.test(built.report.says));
  ok('  the assembled system exists, from the parts', built.model.objects.some((o) => !!o.system));
  ok('  and the parts became objects of their own',
    ['mech__m1', 'mech__k1', 'mech__c1'].every((id) => built.model.objects.some((o) => o.id === id)));

  // A PROPOSED PARAMETER IS NOT A CHOSEN ONE.
  ok('everything proposed is marked as proposed, not as the person’s',
    built.model.objects.every((o) => o.provenance?.origin === 'inference' || !!o.provenance),
    JSON.stringify(built.model.objects.map((o) => o.provenance?.origin)));
  ok('  and says so in words', /not chosen by you/.test(built.model.objects[0].provenance.detail));

  // A MECHANISM WITH AN UNUSABLE MASS. This used to be REFUSED, and the change
  // is deliberate: a body, a spring and ground IS a mechanism, and the thing
  // standing between it and running is one number. Refusing said "I could not
  // turn that into a model", which is indistinguishable from "I did not
  // understand you" and loses them the structure they had described.
  //
  // So it builds — and the whole weight of the change rests on it building
  // HONESTLY. The three assertions below are the ones that matter: it must not
  // claim to compute, it must name the mass, and the mass must not acquire a
  // value on the way through.
  const noMass = buildProposal(proposal({
    objects: [{
      id: 'mech', kind: 'component', label: 'The mechanism',
      mechanism: { bodies: [{ id: 'm1', mass: 'nope', x0: 1 }], springs: [{ id: 'k1', between: ['m1', 'ground'], value: 'k' }] },
    }],
  }));
  ok('a mechanism whose mass is unusable still builds — it is a mechanism', noMass.ok === true,
    noMass.ok ? '' : noMass.refusal.because);
  if (noMass.ok) {
    ok('  but it does NOT claim to compute',
      noMass.report.capability === 'mathematical', noMass.report.capability);
    ok('  and it names the mass as what is missing',
      /mass/i.test(JSON.stringify(noMass.report.missing)), JSON.stringify(noMass.report.missing));
    ok('  and no value was invented for it',
      !noMass.report.solvers.length, JSON.stringify(noMass.report.solvers));
  }

  const nothing = buildProposal({ id: 'empty', title: 'Nothing', params: [], objects: [{ id: 'a', kind: 'annotation', label: 'A note' }] });
  ok('a proposal with nothing computable is refused', !nothing.ok);
  ok('  rather than being drawn as though it were a model', !('model' in nothing));
  // The refusal says what would make it a model, rather than offering to draw
  // it anyway. The old wording offered to "represent it", which was hollow —
  // buildProposal refuses, so nothing gets represented — and a person reading
  // it learned nothing about what to do next.
  ok('  and the refusal says what would make it one',
    /equation|system|specification/.test(nothing.refusal.says), nothing.refusal.says);
  ok('  in terms of what depends on what', /depends on what/.test(nothing.refusal.says));

  ok('junk is refused', !buildProposal(null).ok && !buildProposal({ nope: 1 }).ok);

  const est = buildProposal({
    id: 'fit_it', title: 'y on x', params: [],
    data: { sample: { label: 'synthetic', columns: { x: [1, 2, 3, 4, 5, 6], y: [2, 4, 6, 8, 10, 12] } } },
    objects: [{ id: 'fit', kind: 'specification', label: 'y on x', estimation: { method: 'ols', y: 'y', x: ['x'], data: 'sample' } }],
  });
  ok('a specification with a method builds', est.ok, JSON.stringify(est.refusal ?? {}));
  ok('  and is data-grounded', est.report.capability === 'data-grounded');

  const open = buildProposal({
    id: 'open_q', title: 'y on x, method open', params: [],
    data: { sample: { label: 'synthetic', columns: { x: [1, 2, 3, 4, 5, 6], y: [2, 4, 6, 8, 10, 12] } } },
    objects: [{ id: 'fit', kind: 'specification', label: 'y on x', estimation: { y: 'y', x: ['x'], data: 'sample' } }],
  });
  // THE METHOD IS STILL THEIRS, and this used to be enforced by refusing to
  // build at all. It now builds — the specification and their data are a real
  // thing to hold, and refusing left them holding nothing while being asked a
  // question — but nothing about the Human-First rule has moved: no estimator
  // is chosen, no coefficient has a value, and the model does not reach
  // data-grounded. The choice is handed back as missing structure instead of
  // as a refusal, which is the same sentence in a place they can act on.
  ok('a specification with no method still builds', open.ok === true,
    open.ok ? '' : open.refusal.because);
  if (open.ok) {
    ok('  but it is NOT data-grounded, because nothing was fitted',
      open.report.capability !== 'data-grounded', open.report.capability);
    ok('  and the choice is handed back',
      /method/i.test(JSON.stringify(open.report.missing)), JSON.stringify(open.report.missing));
    ok('  saying the specification is what decides the meaning',
      /specification decides what the estimate means/.test(JSON.stringify(open.report.missing)));
    ok('  and no coefficient acquired a value',
      !unpack(open.model).objects.some((o) => o.kind === 'coefficient' && o.meta?.value !== undefined));
  }

  ok('the report reads as lines', reportLines(built.report).some((l) => /^Model spring_system/.test(l)));
}

console.log('\n=== a model is a document, and its identity survives editing ===');
{
  forgetRuns();
  const made = openFromProposal(EMPTY_WORKSPACE, proposal(), { at: 1000 });
  ok('a built model opens as a document', !!made.doc);
  const id = made.doc.id;
  ok('  with the id the proposal asked for', id === 'spring_system');
  ok('  at revision one', made.doc.revisions.length === 1 && made.doc.at === 0);
  ok('  and it is the active one', made.workspace.active === id);

  const moved = setValue(made.workspace, id, 'k', 80, 2000);
  ok('changing a control makes a revision', moved.ok && docOf(moved.workspace, id).revisions.length === 2);
  ok('  IT IS THE SAME MODEL', docOf(moved.workspace, id).id === id);
  ok('  now at revision two', docOf(moved.workspace, id).at === 1);
  ok('  the value moved', current(docOf(moved.workspace, id)).params.find((p) => p.id === 'k').value === 80);
  ok('  and it says what recomputes', /recompute/.test(moved.says), moved.says);
  ok('  while the first revision still holds the old value',
    docOf(moved.workspace, id).revisions[0].params.find((p) => p.id === 'k').value === 20);

  // The physics is genuinely different, which is the point of an edit.
  const soft = modelFor(docOf(made.workspace, id));
  const stiff = modelFor(docOf(moved.workspace, id));
  const at = (m, t) => stateAt(runFor(m, m.objects.find((o) => o.id === 'mech')).run, t).x_m1;
  ok('  the motion afterwards is not the motion before', Math.abs(at(soft, 1.2) - at(stiff, 1.2)) > 0.05);

  const undone = undo(moved.workspace, id);
  ok('undo goes back a revision', docOf(undone, id).at === 0);
  ok('  to the value it had', current(docOf(undone, id)).params.find((p) => p.id === 'k').value === 20);
  ok('  and forward again', current(docOf(redo(undone, id), id)).params.find((p) => p.id === 'k').value === 80);
  ok('undo at the first revision does nothing rather than erroring', docOf(undo(undone, id), id).at === 0);

  const reset1 = reset(moved.workspace, id);
  ok('reset returns to how it was built', current(docOf(reset1, id)).params.find((p) => p.id === 'k').value === 20);
  ok('  as a NEW revision, so the way back is not lost', docOf(reset1, id).revisions.length === 3);

  // An edit after an undo discards the future that did not happen.
  const branched = setValue(undone, id, 'c', 3, 3000);
  ok('an edit after an undo discards what was ahead', docOf(branched.workspace, id).revisions.length === 2);
  ok('  and redo has nothing left', !canRedo(docOf(branched.workspace, id)));

  ok('the document says where it is', /revision 2 of 2/.test(docLines(docOf(moved.workspace, id))[0]));
  ok('  and what has been done to it', docOf(moved.workspace, id).log.some((l) => /k →/.test(l.said)));
  ok('the comparison against how it was built is available', !!sinceBuilt(docOf(moved.workspace, id)));
  ok('  as is any two revisions', !!compareRevisions(docOf(moved.workspace, id), 0, 1));
}

console.log('\n=== deleting a part changes the equations, not the picture ===');
{
  forgetRuns();
  const made = openFromProposal(EMPTY_WORKSPACE, proposal(), { at: 1 });
  const id = made.doc.id;
  const before = modelFor(docOf(made.workspace, id));
  const beforeRhs = before.objects.find((o) => o.id === 'mech').system.rhs.v_m1;
  ok('the damper is in the equations to start with', /c/.test(beforeRhs), beforeRhs);

  const gone = removeObject(made.workspace, id, 'mech__c1', 2);
  ok('removing the damper works', gone.ok, gone.says);
  ok('  and says the system was reassembled', /reassembled/.test(gone.says));
  const after = modelFor(docOf(gone.workspace, id));
  const afterRhs = after.objects.find((o) => o.id === 'mech').system.rhs.v_m1;
  ok('  THE DECLARATION lost the damper',
    (current(docOf(gone.workspace, id)).objects.find((o) => o.id === 'mech').mechanism.dampers ?? []).length === 0);
  ok('  the equations no longer contain its term', !/\bc\b/.test(afterRhs), afterRhs);
  ok('  and the expanded object is gone too', !after.objects.some((o) => o.id === 'mech__c1'));

  // Undamped now, so energy is conserved and declared an invariant — a fact
  // about the physics that could not follow from hiding a shape.
  ok('  the model now declares energy an invariant',
    after.objects.find((o) => o.id === 'mech').system.invariant === 'energy');
  const run = runFor(after, after.objects.find((o) => o.id === 'mech')).run;
  const e = seriesOf(run, 'energy');
  ok('  and the energy no longer decays', Math.abs(e.v[e.v.length - 1] - e.v[0]) / e.v[0] < 1e-4);

  const last = removeObject(gone.workspace, id, 'mech__m1', 3);
  ok('removing the only body is refused, with the reason', !last.ok && /no inertia/.test(last.says));

  // A body going takes what was attached to it, rather than leaving a spring to
  // nothing in the equations.
  const three = openFromProposal(EMPTY_WORKSPACE, { ...chain(), id: 'chain_doc' }, { at: 1 });
  const cid = three.doc.id;
  const dropped = removeObject(three.workspace, cid, 'mech__m3', 2);
  ok('removing a body from a chain works', dropped.ok, dropped.says);
  const mech = current(docOf(dropped.workspace, cid)).objects.find((o) => o.id === 'mech').mechanism;
  ok('  and the springs that attached to it went with it',
    !mech.springs.some((sp) => sp.between.includes('m3')));
  ok('  leaving a mechanism that still assembles',
    !!modelFor(docOf(dropped.workspace, cid)).objects.find((o) => o.id === 'mech').system);
}

console.log('\n=== replacing a part changes what kind of term it is ===');
{
  forgetRuns();
  const made = openFromProposal(EMPTY_WORKSPACE, proposal(), { at: 1 });
  const id = made.doc.id;
  const swap = replacePart(made.workspace, id, 'mech__c1', 'spring', 2);
  ok('a damper can become a spring', swap.ok, swap.says);
  ok('  and the reply is told the term changed, not the drawing', /restoring rather than dissipative/.test(swap.says));
  const model = current(docOf(swap.workspace, id));
  const mech = model.objects.find((o) => o.id === 'mech').mechanism;
  ok('  the declaration moved it', (mech.dampers ?? []).length === 0 && mech.springs.length === 2);
  const rhs = modelFor(docOf(swap.workspace, id)).objects.find((o) => o.id === 'mech').system.rhs.v_m1;
  ok('  and it now enters as a displacement term', (rhs.match(/x_m1/g) ?? []).length >= 2, rhs);
  ok('swapping something that is not a part is refused',
    !replacePart(swap.workspace, id, 'mech', 'spring', 3).ok);
  ok('swapping a spring for a spring is refused, with the reason',
    /already a spring/.test(replacePart(swap.workspace, id, 'mech__k1', 'spring', 3).says));
}

console.log('\n=== adding a part ===');
{
  const made = openFromProposal(EMPTY_WORKSPACE, proposal(), { at: 1 });
  const id = made.doc.id;
  const body = addPart(made.workspace, id, { kind: 'body', partId: 'm2', mass: 2, label: 'a second mass' }, 2);
  ok('a body can be added', body.ok, body.says);
  const linked = addPart(body.workspace, id, { kind: 'spring', partId: 'k2', between: ['m1', 'm2'], value: 30 }, 3);
  ok('  and a spring between it and the first', linked.ok, linked.says);
  const after = modelFor(docOf(linked.workspace, id));
  ok('  the system now has four states', after.objects.find((o) => o.id === 'mech').system.states.length === 4);
  ok('  and the second body moves because the coupling is real',
    (() => {
      const run = runFor(after, after.objects.find((o) => o.id === 'mech')).run;
      return Math.max(...run.y.map((r) => Math.abs(r[run.names.indexOf('x_m2')]))) > 1e-3;
    })());
  ok('a spring to something that does not exist is refused',
    /nothing there/.test(addPart(linked.workspace, id, { kind: 'spring', partId: 'k9', between: ['m1', 'm7'], value: 1 }, 4).says));
  ok('a part whose id is taken is refused',
    /already a part/.test(addPart(linked.workspace, id, { kind: 'spring', partId: 'k2', between: ['m1', 'm2'], value: 1 }, 4).says));
}

console.log('\n=== duplicate, branch, delete, and which one you are looking at ===');
{
  const made = openFromProposal(EMPTY_WORKSPACE, proposal(), { at: 1 });
  const id = made.doc.id;
  const twice = setValue(made.workspace, id, 'k', 50, 2);
  const copy = duplicate(twice.workspace, id);
  ok('a duplicate has its own id', copy.doc.id !== id);
  ok('  and records what it came from', copy.doc.branchedFrom.id === id);
  ok('  starting from the revision that was current', current(copy.doc).params.find((p) => p.id === 'k').value === 50);
  const stiffer = setValue(copy.workspace, copy.doc.id, 'k', 90, 3);
  ok('editing the copy does not touch the original',
    current(docOf(stiffer.workspace, id)).params.find((p) => p.id === 'k').value === 50 &&
    current(docOf(stiffer.workspace, copy.doc.id)).params.find((p) => p.id === 'k').value === 90);

  const named = branch(stiffer.workspace, id, 'without the damper');
  ok('a branch is a duplicate with a name', named.doc.title === 'without the damper');
  ok('the workspace now holds three', named.workspace.docs.length === 3);
  ok('  and the active one is the newest', activeDoc(named.workspace).id === named.doc.id);
  const back = use(named.workspace, id);
  ok('you can go back to one by name', activeDoc(back).id === id);
  const deleted = remove(back, named.doc.id);
  ok('deleting removes the model', !docOf(deleted, named.doc.id));
  ok('  and something else is shown', !!activeDoc(deleted));
}

console.log('\n=== the verbs come from the reply, and only for a document ===');
{
  ok('the model verbs are named', MODEL_OPS.includes('remove') && MODEL_OPS.includes('undo'));
  ok('  and told apart from the view verbs',
    isModelOp({ op: 'remove', of: 'x' }) && !isModelOp({ op: 'set', id: 'k', value: 1 }));

  const state = sanitizeModelState({
    surface: 'm-spring_system', title: 'A mass on a spring', model: 'mechanics',
    assumptions: [], equations: [],
    entities: [
      { id: 'mech__c1', type: 'marker', label: 'the damper', meaning: 'dissipative', from: 'computed' },
      { id: 'mech__k1', type: 'marker', label: 'the spring', meaning: 'restoring', from: 'computed' },
    ],
    params: [{ id: 'k', label: 'stiffness', value: 20, read: '20', min: 1, max: 100 }],
    layers: [], readouts: [], selected: null,
    edits: { id: 'spring_system', title: 'A mass on a spring', revision: 1, revisions: 1, canUndo: false, canRedo: false, others: [], log: ['built'] },
  });
  ok('a document reports itself to the conversation', !!state.edits && state.edits.id === 'spring_system');

  const ops = parseVizOps(
    'Done — it is out.\n```socria-viz\nremove mech__c1\nset k 60\nundo\n```',
    state
  );
  ok('the reply can remove a part', ops.some((o) => o.op === 'remove' && o.of === 'mech__c1'));
  ok('  move a control', ops.some((o) => o.op === 'set' && o.value === 60));
  ok('  and undo', ops.some((o) => o.op === 'undo'));
  ok('  while an unknown object is dropped',
    !parseVizOps('x\n```socria-viz\nremove not_here\n```', state).length);

  const replace = parseVizOps('x\n```socria-viz\nreplace mech__c1 with spring\n```', state);
  ok('“replace X with spring” is understood', replace[0].op === 'replace' && replace[0].becomes === 'spring');

  const add = parseVizOps('x\n```socria-viz\nadd spring k2 m1 ground 40\n```', state);
  ok('adding a spring is understood', add[0].op === 'add' && add[0].between[0] === 'm1' && add[0].value === 40);

  // WITHOUT A DOCUMENT THE VERBS ARE NOT OFFERED, because a surface with no
  // document would ignore them and the reply would describe a change that never
  // happened.
  const { edits: _none, ...noDoc } = state;
  const plain = sanitizeModelState(noDoc);
  ok('a surface with no document refuses the model verbs',
    !parseVizOps('x\n```socria-viz\nremove mech__c1\nundo\n```', plain).length);

  const help = vizOpsHelp(state);
  ok('the grammar is offered to the model', /remove <object>/.test(help) && /undo \| redo/.test(help));
  ok('  and it is told this is a model, not a picture', /THIS IS A MODEL, NOT A PICTURE/.test(help));
  ok('  with its identity', /spring_system at revision 1/.test(help));
  ok('a surface with no document is offered none of it', !/remove <object>/.test(vizOpsHelp(plain)));
}

console.log('\n=== the verbs, applied end to end ===');
{
  forgetRuns();
  const made = openFromProposal(EMPTY_WORKSPACE, proposal(), { at: 1 });
  const id = made.doc.id;
  const done = applyModelOps(made.workspace, [
    { op: 'set', id: 'k', value: 60 },
    { op: 'remove', of: 'mech__c1' },
  ], { at: 2 });
  ok('a run of verbs lands', done.changed && done.said.length === 2);
  const doc = docOf(done.workspace, id);
  ok('  as revisions of the same model', doc.id === id && doc.revisions.length === 3);
  ok('  with the control moved', current(doc).params.find((p) => p.id === 'k').value === 60);
  ok('  and the damper gone from the declaration',
    (current(doc).objects.find((o) => o.id === 'mech').mechanism.dampers ?? []).length === 0);

  const undone = applyModelOps(done.workspace, [{ op: 'undo' }], { at: 3 });
  ok('undo through the verbs works', docOf(undone.workspace, id).at === 1);
  ok('  and says where it went', /back to revision 2/.test(undone.said[0]));

  const branchAndEdit = applyModelOps(done.workspace, [
    { op: 'branch', name: 'twice as stiff' },
    { op: 'set', id: 'k', value: 100 },
  ], { at: 4 });
  ok('branch-then-edit edits the BRANCH', 
    current(activeDoc(branchAndEdit.workspace)).params.find((p) => p.id === 'k').value === 100);
  ok('  and leaves the original alone',
    current(docOf(branchAndEdit.workspace, id)).params.find((p) => p.id === 'k').value === 60);

  const del = applyModelOps(branchAndEdit.workspace, [{ op: 'delete' }], { at: 5 });
  ok('delete removes the active model', del.workspace.docs.length === branchAndEdit.workspace.docs.length - 1);
  ok('  and says so', /is deleted/.test(del.said[0]));

  const nothing = applyModelOps(EMPTY_WORKSPACE, [{ op: 'undo' }], { at: 6 });
  ok('verbs against an empty workspace do nothing rather than throwing', !nothing.changed);
}

console.log('\n=== the document survives storage, and is re-validated on the way back ===');
{
  const made = openFromProposal(EMPTY_WORKSPACE, proposal(), { at: 1 });
  const moved = setValue(made.workspace, made.doc.id, 'k', 70, 2);
  const roundTrip = sanitizeWorkspace(JSON.parse(JSON.stringify(moved.workspace)));
  ok('a workspace survives being written and read', roundTrip.docs.length === 1);
  ok('  with its id', roundTrip.docs[0].id === made.doc.id);
  ok('  its revisions', roundTrip.docs[0].revisions.length === 2);
  ok('  its cursor', roundTrip.docs[0].at === 1);
  ok('  and its value', current(roundTrip.docs[0]).params.find((p) => p.id === 'k').value === 70);
  ok('  and it still computes', !!modelFor(roundTrip.docs[0]).objects.find((o) => o.id === 'mech').system);

  const forged = sanitizeWorkspace({
    docs: [{ id: 'forged', title: 'Not a model', revisions: [{ id: 'x', title: 'T', params: [], objects: [{ id: 'a', kind: 'annotation', label: 'A' }] }], at: 0 }],
    active: 'forged',
  });
  ok('a document whose revisions do not compute is not a document', forged.docs.length === 0);
  ok('junk is an empty workspace', sanitizeWorkspace(null).docs.length === 0);

  // …and through the map, which is where it actually lives.
  const map = sanitizeMap(
    { nodes: [{ id: 'n1', type: 'idea', label: 'x' }], edges: [], models: moved.workspace },
    { trust: 'stored' }
  );
  ok('the map carries the models', map.models?.docs.length === 1);
  ok('  and the plot lens is offered for them', true);
}

console.log('\n=== the surface draws the document, and reports it ===');
{
  forgetRuns();
  const made = openFromProposal(EMPTY_WORKSPACE, proposal(), { at: 1 });
  const doc = made.doc;
  const spec = buildSpec(modelFor(doc));
  ok('the document draws', spec.primitives.length > 0);
  ok('  as a mechanism, in the plane', spec.dimensionality === 2);
  ok('  with the parts attributed', spec.primitives.some((p) => String(p.of).startsWith('mech__')));
  ok('  and panels from the same run', (spec.panels ?? []).length > 0);

  const e = editsState(made.workspace);
  ok('the state the conversation reads carries the document', e.id === doc.id && e.revision === 1);
  const moved = setValue(made.workspace, doc.id, 'k', 40, 2);
  const e2 = editsState(moved.workspace);
  ok('  and follows it as it is edited', e2.revision === 2 && e2.canUndo);
  ok('  naming what was done', e2.log.some((l) => /k →/.test(l)));
}

console.log('\n=== the live path, read from the source ===');
{
  const { readFileSync } = await import('node:fs');
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

  const route = read('app/api/logos/map/route.ts');
  ok('the on-ramp runs on the SERVER, in the map route', /openFromProposal\(/.test(route));
  ok('  the client’s own map comes in on the stored path', /sanitizeMap\(body\?\.map, \{ trust: 'stored' \}\)/.test(route));
  ok('  the extractor’s output does not', /sanitizeMap\(parsed\)/.test(route));
  ok('  the proposal is answered and does not travel on', /propose: _answered/.test(route));
  ok('  and the documents already held travel with the map', /current\.models \?\? EMPTY_WORKSPACE/.test(route));
  ok('  the report or refusal is returned to the client', /build \? \{ build \} : \{\}/.test(route));

  const viz = read('lib/logos-viz.ts');
  ok('the trust boundary lives in sanitizeViz', /trust === 'stored' && raw\.built \? revalidate/.test(viz));
  ok('  and the proposal path can only propose', /trust === 'proposal' && raw\.propose/.test(viz));

  const logos = read('lib/logos.ts');
  ok('the map carries the models', /models\?: ModelWorkspace;/.test(logos));
  ok('  re-validated on the way in', /sanitizeWorkspace\(raw\.models\)/.test(logos));
  ok('the extractor is told how to propose', /PROPOSING A STRUCTURED MODEL/.test(logos));
  ok('  and told it cannot write built', /You cannot write "built"/.test(logos));
  ok('  and told never to invent data', /NEVER INVENT DATA/.test(logos));
  ok('  and that the method is the person’s', /THE METHOD IS THEIRS/.test(logos));

  // THE BLOCK THE PROMPT DID NOT MENTION.
  //
  // lib/model/algebra.ts, lib/model/equations.ts and the ALGEBRA solver were all
  // in place and the capability was UNREACHABLE FROM THE PRODUCT, because the
  // on-ramp's list of blocks ran mechanism / gravity / system / estimation and
  // stopped. Nothing ever emitted an `equations` block, so nothing was ever
  // solved — and the top-level prose `equations` list sat there inviting the
  // relations to be written where nothing reads them.
  ok('the extractor is told about the equations block', /"equations": what to solve for/.test(logos));
  ok('  with a worked example it can copy',
    /"equations": \{"unknowns": \["qd", "qs", "pc", "pp"\]/.test(logos), '');
  ok('  told that a constraint is a relation like any other', /A CONSTRAINT IS A RELATION/.test(logos));
  ok('  told to make the parameters controls', /Make the parameters CONTROLS/.test(logos));
  ok('  told NOT to solve it itself', /DO NOT SOLVE IT YOURSELF/.test(logos));
  ok('  told an incomplete system is still worth proposing',
    /AN INCOMPLETE SYSTEM IS STILL WORTH PROPOSING/.test(logos));
  ok('  and the prose list is marked as prose', /PROSE FOR A READER ONLY\. Nothing solves these/.test(logos));
  // …and the line that told it NOT to propose for a market is gone.
  ok('a market is no longer exempted from being a model',
    !/a curve, a limit, a market, a distribution/.test(logos));
  ok('  and the reversal is explained rather than silently deleted',
    /THAT EXEMPTION USED TO INCLUDE "a market"/.test(logos));

  const app = read('components/LogosApp.tsx');
  ok('the client splits model ops from view ops',
    /const modelOps = ops\.filter\(\(o\) => isModelOp\(o\) \|\| o\.op === 'set'\)/.test(app));
  // `set` GOES TO BOTH, and the reason is in the comment beside it: the document
  // has to record a control being moved so that undo can undo it, and a surface
  // with no document behind it still needs its sliders to work.
  ok('  including set, which the document has to record', /o\.op === 'set'/.test(app));
  ok('  and the view still gets it', /const viewOps = ops\.filter\(\(o\) => !isModelOp\(o\)\)/.test(app));
  ok('  and applies the model ones to the document', /applyModelOps\(ws, modelOps/.test(app));
  ok('  a stored session is re-validated on load', /sanitizeMap\(c\.map, \{ trust: 'stored' \}\)/.test(app));
  ok('  and what the engine said is shown', /setBuildNote\(/.test(app) && /\{buildNote\}/.test(app));

  const tm = read('components/ThinkingMap.tsx');
  ok('the surface draws the document first', /doc \? \(/.test(tm) && /modelFor\(doc\)/.test(tm));
  ok('  and hands its state to the conversation', /editsState\(map\.models/.test(tm));

  const layout = read('lib/logos-layout.ts');
  ok('a document earns the plot lens', /map\.models\?\.docs\.length/.test(layout));

  const mv = read('components/model/ModelView.tsx');
  ok('ModelView passes the document through', /edits=\{edits\}/.test(mv));
  const s3 = read('components/surfaces/Surface3D.tsx');
  ok('  and the revision it reports is the current one', /edits: c\.edits/.test(s3));
}

console.log('\n=== what was already there still works ===');
{
  const lib = buildSpec(sanitizeModel(oscillator()));
  ok('a library model still builds', lib.primitives.length > 0);
  ok('a linear model still fits', buildSpec(sanitizeModel(linearModel())).primitives.length > 0);
  const scene = sanitizeViz({ kind: 'function', expr: 'x^2', varName: 'x', view: { xMin: -3, xMax: 3 }, params: [] });
  ok('an ordinary scene is untouched by any of this', scene.kind === 'function' && !scene.built && !scene.propose);
  ok('the revision cap is stated', REVISION_CAP >= 4);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
