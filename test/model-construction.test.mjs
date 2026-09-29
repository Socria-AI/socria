// Asking Logos to BUILD something, as opposed to talking about it.
//
// THE FAILURE THIS SUITE IS WRITTEN AGAINST, verbatim:
//
//   "Create a simple economic model showing the relationship between years of
//    education and wages. Use education as the independent variable and wages
//    as the dependent variable. Represent the model visually and make its
//    variables manipulable."
//
// What came back was one node on the Thinking Map — "relationship between
// education and wages" — and a paragraph describing what such a model would be.
// Nothing was built, and nothing recorded that anything had failed to be built.
//
// There were three separate causes and each one is tested here:
//
//   1. NOTHING READ THE ACTION. A turn carried a `context` (what kind of work)
//      and never an ask (what they wanted DONE), so a construction request and a
//      musing about the same subject were indistinguishable downstream.
//   2. THE ON-RAMP REQUIRED COMPUTABILITY. buildProposal refused anything with
//      no runnable object, which made a specified-but-unfitted model —
//      Wage = β₀ + β₁·Education + u with no data — literally unbuildable.
//   3. A SPECIFICATION COULD NOT EXIST WITHOUT DATA. EstimationDecl.data was
//      required, so there was no way to express the model at all.
//
// The suite is deliberately about the MECHANISM rather than about wages. Every
// assertion that mentions education is paired with one in mechanics, gravity or
// arithmetic, because a fix that only works on the example is not a fix.

import {
  ACTIONS,
  BUILDING_ACTIONS,
  isBuilding,
  sanitizeAsk,
  settle,
  unanswered,
} from './.tmp/ask.mjs';
import { buildProposal } from './.tmp/propose.mjs';
import { sanitizeModel } from './.tmp/schema.mjs';
import { capabilityOf, missingStructure, route } from './.tmp/solve.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { EMPTY_WORKSPACE, addPart, modelFor, openFromProposal, removeObject, undo } from './.tmp/docs.mjs';
import { estimate, specificationLine } from './.tmp/estimate.mjs';
import { sanitizeMap } from './.tmp/logos.mjs';
import { LOGOS_CHAT_PROMPT, buildMapPrompt } from './.tmp/logos.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

/** The proposal the extractor should now produce for the original request. */
const WAGE_SPEC = {
  id: 'wage_education',
  title: 'Wage on education',
  domain: 'econometrics',
  objects: [
    {
      id: 'spec',
      kind: 'specification',
      label: 'Wage explained by education',
      meaning: 'a simple linear specification',
      // NO DATA, NO METHOD. That is the point.
      estimation: { y: 'wage', x: ['education'] },
    },
  ],
  params: [],
};

console.log('=== 1. the action is read, and it is not the subject ===');
{
  // The distinction the whole fix rests on: same topic, opposite asks.
  const discuss = sanitizeAsk({ action: 'explore', artifact: 'answer', topic: 'education and wages' });
  const build = sanitizeAsk({
    action: 'construct',
    artifact: 'model',
    topic: 'education and wages',
    formal: { outcome: 'wage', inputs: ['education'] },
  });
  ok('a musing about a subject is not a construction', discuss && !isBuilding(discuss.action));
  ok('a request to build it is', build && isBuilding(build.action));
  ok('  and they can carry the identical topic', discuss.topic === build.topic);

  // The structure they named is kept, because it is the evidence they were
  // specifying rather than wondering.
  ok('the structure they named survives', build.formal.outcome === 'wage');
  ok('  including what explains it', build.formal.inputs.join() === 'education');

  // THE METHOD IS NEVER OURS. An ask may only report a method the person named.
  const noMethod = sanitizeAsk({ action: 'construct', artifact: 'model', formal: { outcome: 'y', inputs: ['x'] } });
  ok('no method is invented when none was named', noMethod.formal.method === undefined);

  // A default action would reintroduce the bug: an unreadable ask that silently
  // became `discuss` is exactly how a construction request gets absorbed.
  ok('an unreadable ask is null, never a default', sanitizeAsk({ action: 'ponder' }) === null);
  ok('  and so is nonsense', sanitizeAsk('build me a model') === null);
  ok('  and so is nothing', sanitizeAsk(undefined) === null);

  // A building action with no artifact named means a model, not prose — the one
  // inference made here, and made so nothing downstream has to ask.
  ok('construct with no artifact means a model',
    sanitizeAsk({ action: 'construct' }).artifact === 'model');
  ok('explain with no artifact means an answer',
    sanitizeAsk({ action: 'explain' }).artifact === 'answer');

  ok('every building action is an action', BUILDING_ACTIONS.every((a) => ACTIONS.includes(a)));
}

console.log('\n=== 2. a specification exists before it is fitted ===');
{
  const clean = sanitizeModel(WAGE_SPEC);
  ok('a specification with no data survives sanitising', !!clean);
  ok('  and carries no data block it was not given', clean.objects[0].estimation.data === undefined);
  ok('  and no method', clean.objects[0].estimation.method === undefined);

  const model = unpack(clean);
  const has = (id) => model.objects.some((o) => o.id === id);
  ok('the outcome is an object', has('spec__y'));
  ok('the regressor is an object', has('spec__x0'));
  ok('the intercept is an object', has('spec__b0'));
  ok('the slope is an object', has('spec__b1'));
  ok('the error term is an object', has('spec__u'));

  const b1 = model.objects.find((o) => o.id === 'spec__b1');
  ok('a coefficient with no data has NO value', b1.defs === undefined && b1.meta.value === undefined);
  ok('  and says it is a symbol', /symbol/.test(b1.provenance.detail));
  ok('  and is not attributed to anybody', b1.provenance.origin === 'equation');

  const y = model.objects.find((o) => o.id === 'spec__y');
  ok('a variable they named is attributed to them', y.provenance.origin === 'user');

  // §15: a specification relates; it does not establish cause.
  const x0 = model.objects.find((o) => o.id === 'spec__x0');
  const toY = x0.relations.find((r) => r.to === 'spec__y');
  ok('the regressor relates to the outcome', !!toY);
  ok('  and the relation is NOT causal', toY.as !== 'causes' && toY.as !== 'influences');
  ok('  and it says why', /does not by itself establish/.test(toY.why));
  ok('nothing anywhere in it claims causation',
    model.objects.every((o) => (o.relations ?? []).every((r) => r.as !== 'causes')));

  ok('the specification writes out', specificationLine(clean.objects[0]) === 'wage = β₀ + β₁·education + u');

  // Expansion is idempotent, because a model is unpacked on every build.
  ok('unpacking twice adds nothing', unpack(model).objects.length === model.objects.length);
}

console.log('\n=== 3. the on-ramp builds it ===');
{
  const built = buildProposal(WAGE_SPEC, { at: 1 });
  ok('THE ORIGINAL REQUEST NOW BUILDS', built.ok === true, built.ok ? '' : built.refusal.because);
  if (built.ok) {
    ok('  and it is honest about what it is', built.report.capability === 'mathematical');
    ok('  not claiming to compute', built.report.capability !== 'computational');
    ok('  and names what is missing', built.report.missing.length > 0);
    const what = built.report.missing.flatMap((m) => m.missing.map((x) => x.what)).join(' ');
    const unlocks = built.report.missing.flatMap((m) => m.missing.map((x) => x.unlocks)).join(' ');
    ok('  which is the observations', /observations/.test(what), what);
    ok('  and says a specification standing unfitted is a real state', /real state/.test(unlocks), unlocks);

    // §9: NOTHING IS FABRICATED.
    const m = built.model;
    ok('no data block was invented', m.data === undefined || Object.keys(m.data).length === 0);
    const flat = JSON.stringify(m);
    ok('no r-squared appears anywhere', !/r2|rSquared|r_squared/i.test(flat));
    ok('no standard error appears anywhere', !/stderr|standardError|pValue|p_value/i.test(flat));
  }
}

console.log('\n=== 4. and prose still does not ===');
{
  // The bar moved; it did not disappear. A bag of labelled annotations states
  // nothing formally and computes nothing, and must still be refused, or
  // `built` stops meaning anything.
  const prose = buildProposal({
    id: 'thoughts',
    title: 'Some thoughts about wages',
    objects: [
      { id: 'a', kind: 'annotation', label: 'education matters' },
      { id: 'b', kind: 'annotation', label: 'so does experience' },
    ],
    params: [],
  });
  ok('a bag of annotations is still refused', prose.ok === false);
  ok('  and the refusal says what would fix it',
    prose.ok === false && /equation|system|specification/.test(prose.refusal.says));

  ok('nothing at all is refused', buildProposal(null).ok === false);
  ok('a string is refused', buildProposal('a model of the economy').ok === false);
}

console.log('\n=== 5. the same architecture outside economics ===');
{
  // §17. None of these is a special case anywhere in the engine; each is a
  // declaration the same on-ramp unpacks, routes and judges.

  // A mechanism whose stiffness nobody has chosen: stated, not computable.
  const spring = buildProposal({
    id: 'sm', title: 'A mass on a spring', objects: [
      { id: 'mech', kind: 'component', label: 'the mechanism',
        mechanism: { bodies: [{ id: 'm1', mass: 'm', x0: 1 }], springs: [{ id: 'k1', between: ['m1', 'ground'], value: 'k' }] } },
    ], params: [],
  });
  ok('a mechanism with unchosen parameters still builds', spring.ok === true,
    spring.ok ? '' : spring.refusal.because);

  // Two bodies under gravity, fully specified: this one actually runs.
  const orbit = buildProposal({
    id: 'two', title: 'Two bodies', objects: [
      { id: 'g', kind: 'system', label: 'the pair',
        gravity: { bodies: [
          { id: 'a', mass: 1, x: 0, y: 0, vx: 0, vy: 0 },
          { id: 'b', mass: 0.001, x: 1, y: 0, vx: 0, vy: 6.28 },
        ], units: 'astronomical' } },
    ], params: [],
  });
  ok('a gravitating pair builds', orbit.ok === true, orbit.ok ? '' : orbit.refusal.because);

  // A plain function: computational, by the sampler.
  const surf = buildProposal({
    id: 'saddle', title: 'z = x² − y²', objects: [
      { id: 's', kind: 'surface', label: 'the saddle', defs: { z: 'x^2 - y^2' } },
    ], params: [],
  });
  ok('a stated function builds', surf.ok === true, surf.ok ? '' : surf.refusal.because);
  ok('  and reaches computational, because it actually computes',
    surf.ok && ['computational', 'dynamic', 'data-grounded'].includes(surf.report.capability));

  // The capability ladder tells them apart rather than flattening them.
  if (spring.ok && surf.ok) {
    ok('a stated model and a computable one are NOT given the same claim',
      spring.report.capability !== surf.report.capability,
      `${spring.report.capability} vs ${surf.report.capability}`);
  }
}

console.log('\n=== 6. what happened is settled against what was asked ===');
{
  const askedFor = sanitizeAsk({ action: 'construct', artifact: 'model' });
  const justTalking = sanitizeAsk({ action: 'explore', artifact: 'answer' });

  // Built: no failure, whatever was asked.
  ok('a build is a build', settle(askedFor, { proposed: true, built: true }).got === true);
  ok('  with no failure', settle(askedFor, { proposed: true, built: true }).failure === undefined);

  // THE ORIGINAL BUG, named: asked to construct, nothing even proposed.
  const silent = settle(askedFor, { proposed: false, built: false });
  ok('asked to build and nothing proposed is a routing failure', silent.failure === 'intent-routing');
  ok('  and it says the fault is ours', /fault here/.test(silent.says));

  // Proposed, refused for want of numbers — theirs to supply, not a bug.
  const noData = settle(askedFor, {
    proposed: true, built: false,
    missing: [{ label: 'the fit', missing: [{ what: 'observations — wage, education for each case' }] }],
  });
  ok('missing observations is classified as data', noData.failure === 'missing-data');
  ok('  and names what is needed', /wage, education/.test(noData.says));

  // Proposed, refused for want of a part.
  const noPart = settle(askedFor, {
    proposed: true, built: false,
    missing: [{ label: 'the mechanism', missing: [{ what: 'a value for the mass' }] }],
  });
  ok('a missing part is classified as structure', noPart.failure === 'missing-structure');

  // Not a model at all.
  const junk = settle(askedFor, { proposed: true, built: false, because: 'the proposal was not a model: it had no id, no title, or nothing the engine recognised' });
  ok('unrecognisable input is an invalid model', junk.failure === 'invalid-model');

  // Nothing was asked to be built, so nothing failing to build is not a failure.
  const quiet = settle(justTalking, { proposed: false, built: false });
  ok('an ordinary turn is not a failure', quiet.wanted === false && quiet.failure === undefined);

  // §22: the result governs, never the ask.
  ok('an ask cannot make a model exist', settle(askedFor, { proposed: true, built: false }).got === false);
  ok('a model that built counts even when nobody asked',
    settle(justTalking, { proposed: true, built: true }).got === true);
  ok('no ask at all is not a failure', settle(null, { proposed: false, built: false }).failure === undefined);
}

console.log('\n=== 7. built is not the same as built what was asked for ===');
{
  const asked = sanitizeAsk({
    action: 'construct', artifact: 'model',
    formal: { outcome: 'wage', inputs: ['years of education', 'experience'] },
  });
  const built = buildProposal(WAGE_SPEC, { at: 1 });
  ok('the model builds', built.ok === true);
  if (built.ok) {
    const left = unanswered(asked, unpack(built.model));
    ok('a variable they named and did not get is reported', left.includes('experience'), left.join());
    // "years of education" and "education" are the same variable; demanding an
    // exact match would report every model as incomplete.
    ok('  and a near name is not falsely reported', !left.includes('years of education'), left.join());
    ok('  nor is the outcome', !left.includes('wage'));
    ok('nothing is reported when nothing was named',
      unanswered(sanitizeAsk({ action: 'construct' }), unpack(built.model)).length === 0);
  }
}

console.log('\n=== 8. and then they can change it ===');
{
  // §13's follow-ups, run in order against one document, because the point is
  // that the model keeps its identity across all of them.
  let ws = EMPTY_WORKSPACE;
  const made = openFromProposal(ws, WAGE_SPEC, { at: 1 });
  ok('the model opens as a document', !!made.doc);
  ws = made.workspace;
  const id = made.doc.id;

  // "Add years of work experience."
  const added = addPart(ws, id, { kind: 'variable', partId: 'experience' }, 2);
  ok('a variable can be added', added.ok === true, added.says);
  ws = added.workspace;
  let m = modelFor(ws.docs.find((d) => d.id === id));
  ok('  the specification now has two regressors',
    m.objects.find((o) => !!o.estimation).estimation.x.join() === 'education,experience');
  ok('  it is the SAME model, not a new one', ws.docs.length === 1 && ws.docs[0].id === id);
  ok('  and the equation gained a term',
    specificationLine(m.objects.find((o) => !!o.estimation)) === 'wage = β₀ + β₁·education + β₂·experience + u');
  ok('  with a second slope as an object', m.objects.some((o) => o.id.endsWith('__b2')));

  // "Remove education."
  const removed = removeObject(ws, id, `${m.objects.find((o) => !!o.estimation).id}__x0`, 3);
  ok('a regressor can be removed', removed.ok === true, removed.says);
  ws = removed.workspace;
  m = modelFor(ws.docs.find((d) => d.id === id));
  ok('  education is gone from the specification',
    !m.objects.find((o) => !!o.estimation).estimation.x.includes('education'));
  ok('  experience remains', m.objects.find((o) => !!o.estimation).estimation.x.includes('experience'));
  ok('  and it is still the same model', ws.docs.length === 1 && ws.docs[0].id === id);

  // "Undo that."
  // `undo` moves the document's pointer and returns the workspace itself —
  // there is nothing that can fail about stepping back one revision.
  const before = modelFor(ws.docs.find((d) => d.id === id)).objects.find((o) => !!o.estimation).estimation.x.join();
  ws = undo(ws, id);
  m = modelFor(ws.docs.find((d) => d.id === id));
  ok('the removal can be undone', m.objects.find((o) => !!o.estimation).estimation.x.join() !== before);
  ok('  and education is back',
    m.objects.find((o) => !!o.estimation).estimation.x.includes('education'));

  // The things that must NOT be removable, because they are not parts.
  const spec = m.objects.find((o) => !!o.estimation);
  const killY = removeObject(ws, id, `${spec.id}__y`, 4);
  ok('the outcome cannot be deleted', killY.ok === false);
  ok('  and it says why', /nothing on the left/.test(killY.says));
  const killU = removeObject(ws, id, `${spec.id}__u`, 4);
  ok('the error term cannot be deleted', killU.ok === false);
  const killB1 = removeObject(ws, id, `${spec.id}__b1`, 4);
  ok('a coefficient cannot be deleted on its own', killB1.ok === false);

  // Down to one regressor, the last one is protected too.
  let solo = removeObject(ws, id, `${spec.id}__x1`, 5);
  ok('the second regressor goes', solo.ok === true);
  const specId = spec.id;
  const lastOne = removeObject(solo.workspace, id, `${specId}__x0`, 6);
  ok('the last regressor is protected', lastOne.ok === false);
  ok('  and says what to do instead', /add another variable/i.test(lastOne.says));

  // Adding rubbish.
  const dup = addPart(ws, id, { kind: 'variable', partId: 'education' }, 7);
  ok('a duplicate regressor is refused', dup.ok === false);
  const self = addPart(ws, id, { kind: 'variable', partId: 'wage' }, 7);
  ok('the outcome cannot also explain itself', self.ok === false);
}

console.log('\n=== 9. with data, it actually estimates ===');
{
  // §14. The same specification, with observations, must produce COMPUTED
  // coefficients — and they must be the real least-squares answer, not a label.
  // y = 3 + 2x exactly, so the fit is known in advance.
  const withData = {
    id: 'fitted', title: 'Wage on education, fitted',
    objects: [{
      id: 'spec', kind: 'specification', label: 'fitted',
      estimation: { method: 'ols', y: 'wage', x: ['education'], data: 'sample' },
    }],
    params: [],
    data: { sample: { label: 'a small sample', columns: { education: [1, 2, 3, 4, 5], wage: [5, 7, 9, 11, 13] } } },
  };
  const built = buildProposal(withData, { at: 1 });
  ok('a specification with data builds', built.ok === true, built.ok ? '' : built.refusal.because);
  if (built.ok) {
    ok('  and it is data-grounded', built.report.capability === 'data-grounded');
    const m = unpack(built.model);
    const b1 = m.objects.find((o) => o.id === 'spec__b1');
    const b0 = m.objects.find((o) => o.id === 'spec__b0');
    ok('  the slope has a value now', b1.meta.value !== undefined);
    ok('  and it is the right one', Math.abs(b1.meta.value - 2) < 1e-9, String(b1.meta.value));
    ok('  the intercept too', Math.abs(b0.meta.value - 3) < 1e-9, String(b0.meta.value));
    ok('  and it is attributed to the computation', b1.provenance.origin === 'computation');
    ok('  naming the data and the method', /least squares/.test(b1.provenance.detail));
  }

  // Data present, method absent: THE CHOICE IS THEIRS and the engine says so
  // rather than picking one.
  const noMethod = { ...withData, id: 'nm', objects: [{ ...withData.objects[0], estimation: { y: 'wage', x: ['education'], data: 'sample' } }] };
  const clean = sanitizeModel(noMethod);
  const got = estimate(clean, clean.objects[0]);
  ok('no method means no estimate', got.ok === false);
  ok('  and the candidates are offered instead', 'choice' in got);
  ok('  saying the specification is the research', /yours to choose/.test(got.choice.says));
}

console.log('\n=== 10. the map carries the ask, and trusts it for nothing ===');
{
  const m = sanitizeMap({
    context: 'analysing',
    ask: { action: 'construct', artifact: 'model', formal: { outcome: 'wage', inputs: ['education'] } },
    nodes: [{ id: 'q', type: 'question', label: 'does education raise wages?' }],
    edges: [],
  });
  ok('the map carries the ask', m.ask?.action === 'construct');
  ok('  alongside the context, not instead of it', m.context === 'analysing');

  const junk = sanitizeMap({ context: 'analysing', ask: { action: 'obliterate' }, nodes: [], edges: [] });
  ok('an unknown action is dropped entirely', junk.ask === undefined);

  // §25/§26: the map still updates. The two are connected, not interchangeable.
  ok('the thinking is still mapped', m.nodes.length === 1);
}

console.log('\n=== 11. the prompts say the right thing ===');
{
  const map = buildMapPrompt({ nodes: [], edges: [] }, '');

  // The action, asked before anything else.
  ok('the extractor is asked what they want DONE', /WHAT ARE THEY ASKING YOU TO DO/.test(map));
  ok('  and told it is not the same as the subject', /WHAT ARE THEY TALKING ABOUT/.test(map));
  ok('  with both sides of the distinction shown',
    /What is a regression model\?/.test(map) && /wage as the dependent variable/.test(map));
  ok('  and told to read the sentence, not the verbs', /NOT THE VERBS/.test(map));

  // Proposing routes on the ask, not on a list of subjects.
  ok('proposing is gated on the ask', /WHENEVER "ask\.action" IS construct/.test(map));
  ok('  and the old subject list is gone',
    !/a fitted specification — a regression, where the person has named the method/.test(map));
  ok('a specification is a model before it is fitted', /BEFORE IT IS FITTED/.test(map));
  ok('  and withholding it is forbidden', /DO NOT withhold the model because it cannot be fitted/.test(map));
  ok('  and so is inventing numbers to fit it', /DO NOT invent numbers so that it can be/.test(map));
  ok('fabricated statistics are named', /standard error, R², p-value, residual or fitted line/.test(map));
  ok('a specification is not a causal claim', /DOES NOT ESTABLISH CAUSE/.test(map));

  // The reply.
  ok('chat is told something gets made', /SOMETHING GETS MADE/.test(LOGOS_CHAT_PROMPT));
  ok('  and given the exact sentences not to write',
    /The model you are envisioning/.test(LOGOS_CHAT_PROMPT) &&
    /you would likely see/.test(LOGOS_CHAT_PROMPT));
  ok('  and forbidden from claiming the build', /Do not write "I've created the model"/.test(LOGOS_CHAT_PROMPT));
  ok('  and told what an unfitted model is', /A specification is a real model before it is fitted/.test(LOGOS_CHAT_PROMPT));
  ok('  and not to report statistics it does not have',
    /no R², no standard error, no p-value, no fitted line/.test(LOGOS_CHAT_PROMPT));
  ok('  and not to assert cause from a specification',
    /is a claim about the world that needs assumptions/.test(LOGOS_CHAT_PROMPT));
}

console.log('\n=== 12. the conversation is told what the model actually is ===');
{
  // §21/§28. The reply must be able to say "specified, not estimated" from the
  // model's own state rather than from imagination.
  const built = buildProposal(WAGE_SPEC, { at: 1 });
  ok('it builds', built.ok === true);
  if (built.ok) {
    const cap = capabilityOf(unpack(built.model));
    ok('the model knows what it is', cap.level === 'mathematical');
    ok('  and what it is not', cap.short.some((s) => s.level === 'computational'));
    const gaps = missingStructure(unpack(built.model));
    ok('  and what is standing in the way', gaps.length > 0);
    ok('  named as observations', /observations/.test(JSON.stringify(gaps)));

    const r = route(unpack(built.model), unpack(built.model).objects.find((o) => !!o.estimation));
    ok('the estimator is the solver that would run it', r.status === 'incomplete' && r.solver.id === 'ols');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
