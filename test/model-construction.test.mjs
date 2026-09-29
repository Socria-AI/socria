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
import { buildProposal, revalidate } from './.tmp/propose.mjs';
import { affectedBy, sanitizeModel } from './.tmp/schema.mjs';
import { capabilityOf, missingStructure, plan, route } from './.tmp/solve.mjs';
import { unpack } from './.tmp/unpack.mjs';
import { EMPTY_WORKSPACE, addPart, modelFor, openFromProposal, removeObject, sanitizeWorkspace, undo } from './.tmp/docs.mjs';
import { estimate, specificationLine } from './.tmp/estimate.mjs';
import { sanitizeMap } from './.tmp/logos.mjs';
import { sanitizeViz } from './.tmp/logos-viz.mjs';
import { buildSpec } from './.tmp/spec.mjs';
import { buildModel } from './.tmp/compile.mjs';
import { modelStateFrom } from './.tmp/model-state.mjs';
import { forgetRuns, runFor, seriesOf } from './.tmp/system.mjs';
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

console.log('\n=== 13. THE PATH, not the engine ===');
{
  // WHY THIS SECTION EXISTS, and it is the most valuable one in the file.
  //
  // Every assertion above this point called buildProposal directly. They all
  // passed while the feature was DEAD IN THE PRODUCT, because two rules about
  // DRAWINGS were deleting the proposal before the engine ever saw it:
  // sanitizeViz returns null for a partless diagram (right, for a picture) and
  // sanitizeMap drops a scene whose kind does not carry its own subject when
  // the work is not mathematical (also about drawings). The prompt's canonical
  // shape was {"kind":"diagram","propose":{…}} with no parts, so it hit both.
  //
  // A test that starts at the engine cannot see that. This one starts where
  // the server does: the raw JSON an extractor returns.

  const raw = {
    context: 'analysing',
    ask: { action: 'construct', artifact: 'model', formal: { outcome: 'wage', inputs: ['education'] } },
    nodes: [{ id: 'q', type: 'question', label: 'does education raise wages?' }],
    edges: [],
    propose: {
      id: 'wage_education', title: 'Wage on education', domain: 'econometrics',
      objects: [{ id: 'spec', kind: 'specification', label: 'Wage explained by education',
                  estimation: { y: 'wage', x: ['education'] } }],
      params: [],
    },
  };

  const m = sanitizeMap(raw);
  ok('a proposal survives sanitizeMap', !!m.propose);
  ok('  at the top level, where a model belongs', !!m.propose && !m.viz);
  ok('  with the ask beside it', m.ask?.action === 'construct');
  ok('  and the thinking still mapped', m.nodes.length === 1);

  // The legacy inlet: a response in flight may still nest it.
  const nested = sanitizeMap({
    ...raw, propose: undefined,
    viz: { kind: 'diagram', propose: raw.propose },
  });
  ok('a proposal nested in a partless diagram is still rescued', !!nested.propose);
  ok('  and the empty diagram is still not drawn', !nested.viz);

  // …and it reaches the engine from there.
  const made = openFromProposal(EMPTY_WORKSPACE, m.propose, { at: 1 });
  ok('the rescued proposal builds', !!made.doc);

  // THE ROUND TRIP. A built model is re-validated on every read — from
  // storage, from a browser, from a collaborator. revalidate required
  // computability while buildProposal accepts a formal statement, so a
  // specified model was built once and destroyed on reload, silently.
  if (made.doc) {
    const back = sanitizeWorkspace(made.workspace);
    ok('a specified model survives the read path', back.docs.length === 1);
    ok('  keeping its revisions', back.docs[0]?.revisions.length === 1);
    ok('  and its id', back.docs[0]?.id === made.doc.id);

    // The two halves of the boundary must agree, in both directions.
    ok('revalidate accepts what buildProposal built',
      revalidate(modelFor(made.doc)) !== null);
  }

  // And prose must still be refused by BOTH halves, or the boundary is a sieve.
  const prose = { id: 'p', title: 'Notes', params: [], objects: [{ id: 'a', kind: 'annotation', label: 'a note' }] };
  ok('prose is refused on the way in', buildProposal(prose).ok === false);
  ok('  and on the way back', revalidate(prose) === null);
}

console.log('\n=== 14. composition, not a demo: a star and its planets ===');
{
  // PART 43 OF THE BRIEF, and the point is that none of this is a named model.
  // "A star with N planets" is bodies + masses + positions + velocities +
  // Newtonian gravity, assembled into the same state system the integrator
  // already runs. There is no solar-system file, no preset, and no branch
  // anywhere on what the system is called.
  const star = (planets) => ({
    id: 'star_sys', title: `A star with ${planets.length} planet${planets.length === 1 ? '' : 's'}`,
    domain: 'astronomy',
    time: { t: 0.5, min: 0, max: 12, units: 'yr' },
    params: [],
    objects: [{
      id: 'g', kind: 'system', label: 'the system',
      gravity: {
        units: 'astronomical', dt: 0.002, steps: 4000,
        bodies: [
          { id: 'star', mass: 1, x: 0, y: 0, vx: 0, vy: 0, label: 'the star' },
          ...planets,
        ],
      },
    }],
  });

  const one = buildProposal(star([
    { id: 'p1', mass: 3e-6, x: 1, y: 0, vx: 0, vy: 6.2832, label: 'planet one' },
  ]), { at: 1 });
  ok('a star and one planet builds', one.ok === true, one.ok ? '' : one.refusal.because);
  ok('  as a dynamic model', one.ok && one.report.capability === 'dynamic');
  ok('  routed to the gravitational assembler',
    one.ok && one.report.solvers.some((s) => /Gravitational/.test(s.solver)),
    one.ok ? JSON.stringify(one.report.solvers) : '');

  // SEVEN planets, from the same primitive and no new code.
  const seven = buildProposal(star(
    Array.from({ length: 7 }, (_, i) => {
      const a = 0.6 + i * 0.7;
      return { id: `p${i + 1}`, mass: 3e-6, x: a, y: 0, vx: 0, vy: 6.2832 / Math.sqrt(a), label: `planet ${i + 1}` };
    })
  ), { at: 1 });
  ok('and seven planets builds from the same primitive', seven.ok === true,
    seven.ok ? '' : seven.refusal.because);
  if (seven.ok) {
    const m = unpack(seven.model);
    ok('  every body is an object of its own',
      ['star', 'p1', 'p4', 'p7'].every((b) => m.objects.some((o) => o.id === `g__${b}`)));
    ok('  and each says which states carry its position',
      m.objects.filter((o) => o.meta?.of === 'g').every((o) => !!o.meta.sx && !!o.meta.sy));
  }

  // THE ORBIT IS COMPUTED, NOT DRAWN. A circular orbit at 1 AU under G = 4π²
  // must close after exactly one year — that is the whole content of the
  // astronomical unit system, and it is a fact about the integration rather
  // than about anything anybody wrote down.
  if (one.ok) {
    forgetRuns();
    const m = unpack(one.model);
    const run = runFor(m, m.objects.find((o) => o.id === 'g'));
    ok('the system integrates', run.ok === true);
    if (run.ok) {
      const x = seriesOf(run.run, 'x1');
      const y = seriesOf(run.run, 'y1');
      const r = x.v.map((v, i) => Math.hypot(v, y.v[i]));
      ok('  the orbit is circular to 1e-3', Math.max(...r) - Math.min(...r) < 1e-3,
        `${Math.min(...r)}..${Math.max(...r)}`);
      const i1 = x.t.findIndex((t) => t >= 1);
      ok('  and closes after one year', Math.abs(x.v[i1] - 1) < 1e-3 && Math.abs(y.v[i1]) < 1e-3,
        `(${x.v[i1]}, ${y.v[i1]})`);
    }

    // AND IT DRAWS. Before the compiler learned that an object may name the
    // states holding its position, every gravitating body came back as "a
    // mechanism part whose mechanism is not in this model" — a model that
    // routed, integrated and graded `dynamic` while drawing nothing at all.
    const spec = buildSpec(m);
    const bodies = spec.notes.filter((n) => n.of.startsWith('g__'));
    ok('  every body draws', bodies.length > 0 && bodies.every((n) => !n.problem),
      JSON.stringify(bodies.map((n) => n.problem)));
    ok('  from the integration rather than from a formula',
      bodies.every((n) => n.fidelity === 'numerically-computed'));
  }

  // A BAD MASS NAMES THE BODY, not an internal state. This reported "a
  // readable expression for dvx0/dt — the one given did not compile" until
  // gravity was registered as a solver of its own: the router was asking the
  // generic integrator about an assembled right-hand side nobody had written.
  const bad = buildProposal({
    id: 'bad', title: 'Two bodies', params: [], objects: [{
      id: 'g', kind: 'system', label: 'the pair',
      gravity: { units: 'astronomical', bodies: [
        { id: 'a', mass: 1, x: 0, y: 0, vx: 0, vy: 0 },
        { id: 'b', mass: 'nope', x: 1, y: 0, vx: 0, vy: 6.28 },
      ] },
    }],
  }, { at: 1 });
  ok('a mistyped mass still builds — it is still a system', bad.ok === true);
  if (bad.ok) {
    const what = JSON.stringify(bad.report.missing);
    ok('  and the refusal names the body', /a mass for b/.test(what), what);
    ok('  not an assembled state nobody wrote', !/dvx|dvy/.test(what), what);
    ok('  and it does not claim to compute', bad.report.capability !== 'dynamic',
      bad.report.capability);
  }
}

console.log('\n=== 15. unknown is never a demo ===');
{
  // PART 2. The named simulation objects are five surfaces somebody wrote. A
  // request naming something else has no surface, and the honest answer is no
  // picture — never the nearest one.
  const sim = (object) => sanitizeViz({ kind: 'simulation', title: 't', ...(object ? { sim: { object } } : {}) });
  ok('a named object survives', sim('black-hole')?.sim?.object === 'black-hole');
  ok('an unknown one is refused', sim('solar-system') === null);
  ok('  and is NOT turned into a black hole', sim('solar-system')?.sim?.object !== 'black-hole');
  ok('a missing one is refused too', sim(null) === null);

  // …and whatever structure the same turn DID build is untouched, because a
  // model travels at the top level and not inside the picture.
  const m = sanitizeMap({
    context: 'simulating', nodes: [], edges: [],
    viz: { kind: 'simulation', sim: { object: 'solar-system' }, title: 'the solar system' },
    propose: {
      id: 'sol', title: 'The inner planets', params: [], objects: [{
        id: 'g', kind: 'system', label: 'the system',
        gravity: { units: 'astronomical', bodies: [
          { id: 'sun', mass: 1, x: 0, y: 0, vx: 0, vy: 0 },
          { id: 'earth', mass: 3e-6, x: 1, y: 0, vx: 0, vy: 6.2832 },
        ] },
      }],
    },
  });
  ok('the refused picture does not take the model with it', !!m.propose);
  ok('  and no picture is invented', !m.viz);
  const made = openFromProposal(EMPTY_WORKSPACE, m.propose, { at: 1 });
  ok('  and the model builds', !!made.doc);
}

console.log('\n=== 16. a part with no value is a question, not a deletion ===');
{
  // THE FABRICATION THIS REPLACES. A spring with no stiffness was DELETED by
  // the sanitiser. "A mass on a spring, stiffness to be decided" therefore
  // assembled to v̇ = (0)/(1) — a mass with no forces on it at all — routed
  // runnable, graded `dynamic`, and drew a motionless body at
  // `numerically-computed`. The spring was gone without a word and what the
  // person saw was a computed picture of nothing.
  const spring = {
    id: 'sm', title: 'A mass on a spring, stiffness to be decided', params: [],
    objects: [{ id: 'mech', kind: 'component', label: 'the mechanism',
      mechanism: { bodies: [{ id: 'm1', mass: 1, x0: 1 }], springs: [{ id: 'k1', between: ['m1', 'ground'] }] } }],
  };
  const clean = sanitizeModel(spring);
  ok('the spring survives sanitising', clean.objects[0].mechanism.springs?.length === 1);
  ok('  with no value, rather than not at all',
    clean.objects[0].mechanism.springs[0].value === undefined);

  const b = buildProposal(spring, { at: 1 });
  ok('it builds — it is still a mechanism', b.ok === true);
  if (b.ok) {
    ok('  but it does NOT claim to be dynamic', b.report.capability === 'mathematical',
      b.report.capability);
    ok('  and it names the stiffness', /stiffness for k1/.test(JSON.stringify(b.report.missing)));
    ok('  saying nobody has chosen one', /nobody has chosen one/.test(JSON.stringify(b.report.missing)));
    ok('  and nothing runs', b.report.solvers.length === 0);
  }

  // The same rule for a body whose mass nobody gave.
  const noMass = sanitizeModel({ ...spring, id: 'nm', objects: [{ ...spring.objects[0],
    mechanism: { bodies: [{ id: 'm1', x0: 1 }], springs: [{ id: 'k1', between: ['m1', 'ground'], value: 5 }] } }] });
  ok('a body with no mass survives too', noMass.objects[0].mechanism.bodies?.length === 1);
  const nb = buildProposal({ ...spring, id: 'nm2', objects: [{ ...spring.objects[0],
    mechanism: { bodies: [{ id: 'm1', x0: 1 }], springs: [{ id: 'k1', between: ['m1', 'ground'], value: 5 }] } }] }, { at: 1 });
  ok('  and the mass is what is missing', nb.ok && /mass for m1/.test(JSON.stringify(nb.report.missing)),
    nb.ok ? JSON.stringify(nb.report.missing) : nb.refusal.because);
}

console.log('\n=== 17. changing something recomputes what it reaches ===');
{
  // PART 17. This walked a `depends` array — unvalidated language-model output,
  // absent from every real proposal — plus three relation types the expanders
  // never emit. Executed on a standard SIR model, changing the infection rate
  // recomputed NOTHING. The graph is derived from the expressions now, which
  // is the one place that cannot drift because it is what gets evaluated.

  const sir = sanitizeModel({
    id: 'sir', title: 'SIR',
    params: [{ id: 'beta', label: 'beta', value: 0.3, min: 0, max: 1 },
             { id: 'gamma', label: 'gamma', value: 0.1, min: 0, max: 1 }],
    objects: [{ id: 's', kind: 'system', label: 'compartments', system: {
      states: [{ name: 'S', init: '999' }, { name: 'I', init: '1' }, { name: 'R', init: '0' }],
      rhs: { S: '0 - beta * S * I / 1000', I: 'beta * S * I / 1000 - gamma * I', R: 'gamma * I' },
    } }],
  });
  ok('the model declares no dependencies at all', sir.objects[0].depends === undefined);
  ok('and changing the infection rate still reaches the system',
    affectedBy(sir, ['beta']).includes('s'));
  ok('  as does the recovery rate', affectedBy(sir, ['gamma']).includes('s'));

  // A CARRIER AND ITS PARTS MOVE TOGETHER. A body is drawn from its carrier's
  // run, so a change reaching the carrier must reach the body. Before this,
  // changing the damping reached the damper object and neither the carrier
  // that owns the integration nor the body whose motion actually changed.
  const sm = buildProposal({
    id: 'sm2', title: 'spring-mass',
    params: [{ id: 'k', label: 'k', value: 20, min: 1, max: 100 },
             { id: 'c', label: 'c', value: 0.5, min: 0, max: 5 },
             { id: 'm', label: 'm', value: 1, min: 0.1, max: 5 }],
    objects: [{ id: 'mech', kind: 'component', label: 'the mechanism', mechanism: {
      bodies: [{ id: 'm1', mass: 'm', x0: 1 }],
      springs: [{ id: 'k1', between: ['m1', 'ground'], value: 'k' }],
      dampers: [{ id: 'c1', between: ['m1', 'ground'], value: 'c' }],
    } }],
  }, { at: 1 });
  ok('the mechanism builds', sm.ok === true);
  if (sm.ok) {
    const m = unpack(sm.model);
    for (const p of ['k', 'c', 'm']) {
      const reached = affectedBy(m, [p]);
      ok(`changing ${p} reaches the carrier that owns the run`, reached.includes('mech'),
        JSON.stringify(reached));
      ok(`  and the body whose motion changes`, reached.includes('mech__m1'),
        JSON.stringify(reached));
    }
  }

  // Gravity: one mass appears in every other body's acceleration.
  const g = buildProposal({
    id: 'g2', title: 'two bodies',
    params: [{ id: 'ms', label: 'star mass', value: 1, min: 0.1, max: 3 }],
    objects: [{ id: 'sys', kind: 'system', label: 'the pair', gravity: {
      units: 'astronomical',
      bodies: [{ id: 'a', mass: 'ms', x: 0, y: 0, vx: 0, vy: 0 },
               { id: 'b', mass: 3e-6, x: 1, y: 0, vx: 0, vy: 6.28 }],
    } }],
  }, { at: 1 });
  if (g.ok) {
    const reached = affectedBy(unpack(g.model), ['ms']);
    ok('changing one mass reaches every body that feels it',
      reached.includes('sys__a') && reached.includes('sys__b'), JSON.stringify(reached));
  }

  // AND IT MUST NOT REACH EVERYTHING. A graph that says "all of it" on every
  // change is as useless as one that says "none of it", and the old one could
  // be made to do exactly that by writing a name into `depends`.
  ok('a name nothing mentions reaches nothing',
    affectedBy(sir, ['nonexistent']).length === 0);
  ok('  and an unrelated control reaches nothing',
    affectedBy(sir, ['unrelated_knob']).length === 0);
}

console.log('\n=== 18. silence is impossible ===');
{
  // THE CHANGE THIS LOCKS IN. The compiler's default branch returned an empty
  // Built with no note and NO PROBLEM — so an object of a kind no renderer
  // handles was simply absent, with nothing anywhere saying why. Twenty-eight
  // of the forty-eight kinds landed there. A model could be built, routed,
  // graded and drawn with most of its contents invisible and no account given.
  const m = sanitizeModel({
    id: 'mixed', title: 'some of each', params: [], objects: [
      { id: 'surf', kind: 'surface', label: 'a saddle', defs: { z: 'x^2 - y^2' }, over: { x: [-2, 2], y: [-2, 2] } },
      { id: 'obj', kind: 'objective', label: 'maximise utility' },
      { id: 'con', kind: 'constraint', label: 'px·x + py·y ≤ m' },
      { id: 'note', kind: 'annotation', label: 'a remark' },
      { id: 'ax', kind: 'axis', label: 'the x axis' },
    ],
  });
  const built = buildModel(m);
  const by = Object.fromEntries(built.map((b) => [b.of, b]));

  ok('a surface with a definition draws', by.surf.primitives.length > 0);
  ok('  and says nothing is wrong', !by.surf.problem);

  // A GAP NAMES ITSELF.
  ok('an objective says nothing draws it yet', !!by.obj.problem);
  ok('  naming the kind', /objective/.test(by.obj.problem));
  ok('  with the right article', /draws an objective/.test(by.obj.problem), by.obj.problem);
  ok('  and says the object is still in the model', /in the model/.test(by.obj.problem));
  ok('a constraint does the same', /draws a constraint/.test(by.con.problem ?? ''));

  // …BUT A THING THAT IS MEANT TO BE READ IS NOT A GAP.
  ok('an annotation is not reported as missing', !by.note.problem);
  ok('  and says what it is', /note on the model/.test(by.note.note));
  ok('an axis belongs to the frame, not to the objects', !by.ax.problem);

  // THE ROUTER AND THE COMPILER MUST NOT DISAGREE. Every kind a real solver
  // claims to handle must have a compile case, or the model grades
  // `computational` and produces no marks — which is the worst of both
  // answers and is what `series`, `distribution` and a defs-declared surface
  // all did.
  for (const [kind, shape] of [
    ['series', { data: 'd' }],
    ['distribution', { data: 'd' }],
    ['dataset', { data: 'd' }],
  ]) {
    const one = sanitizeModel({
      id: 'k', title: kind, params: [],
      // Points are [x, y, z] triples — the block's own shape, not objects.
      data: { d: { label: 'numbers', points: [[0, 1, 0], [1, 2, 0], [2, 4, 0]] } },
      objects: [{ id: 'o', kind, label: kind, ...shape }],
    });
    const b = buildModel(one)[0];
    const r = route(one, one.objects[0]);
    if (r.status === 'runnable') {
      ok(`${kind}: the router says runnable and the compiler draws it`,
        b.primitives.length > 0 && !b.problem, b.problem ?? 'no primitives');
    }
  }

  // AND THE BUDGET SAYS SO. The loop breaks when the primitive budget runs
  // out, and every remaining object used to be dropped with no record — a
  // large model quietly showed a prefix of itself.
  const many = sanitizeModel({
    id: 'many', title: 'a lot', params: [],
    objects: Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`, kind: 'surface', label: `surface ${i}`,
      defs: { z: 'x^2 - y^2' }, over: { x: [-2, 2], y: [-2, 2] },
    })),
  });
  const lots = buildModel(many);
  ok('every object is accounted for, drawn or not', lots.length === many.objects.length,
    `${lots.length} of ${many.objects.length}`);
  const cut = lots.filter((b) => b.problem && /budget/.test(b.problem));
  ok('  and anything the budget cut off says so', cut.length === 0 || cut.every((b) => /in the model/.test(b.problem)));
}

console.log('\n=== 19. capability is per operation, not one verdict ===');
{
  // THE FAILURE. A wage equation with β₀, β₁, β₂ set as hypotheses built
  // correctly, refused to pretend it had been estimated — correctly — and drew
  // NOTHING, announcing "nothing in it computes yet". It was wrong: the
  // sampler would have evaluated β₀ + β₁·education + β₂·experience the moment
  // anything asked, and nothing asked, because a specification's one
  // registered operation is `estimate` and `estimate` needs observations.
  const wage = (params, over) => ({
    id: 'wage_model', title: 'Wages on education and experience', domain: 'econometrics',
    params,
    objects: [{ id: 'spec', kind: 'specification', label: 'Wage on education and experience',
      estimation: { y: 'wage', x: ['education', 'experience'], ...(over ? { over } : {}) } }],
  });
  const HYP = [
    { id: 'spec__b0', label: 'β₀', value: 10, min: -20, max: 40, step: 0.5 },
    { id: 'spec__b1', label: 'β₁ (education)', value: 2.5, min: 0, max: 10, step: 0.1 },
    { id: 'spec__b2', label: 'β₂ (experience)', value: 1.2, min: 0, max: 10, step: 0.1 },
  ];
  const OVER = { education: [8, 20], experience: [0, 30] };

  const b = buildProposal(wage(HYP, OVER), { at: 1 });
  ok('the model builds', b.ok === true, b.ok ? '' : b.refusal.because);
  const m = unpack(b.model);

  // THE TWO TRUE STATEMENTS, at the same time, about the same model.
  const resp = m.objects.find((o) => o.meta?.role === 'response');
  ok('the deterministic component exists as an object', !!resp);
  ok('  and it can be EVALUATED now', route(m, resp, 'evaluate').status === 'runnable');
  ok('  while the specification cannot be ESTIMATED',
    route(m, m.objects.find((o) => o.id === 'spec'), 'estimate').status === 'incomplete');
  ok('  and asking about estimation does not answer for evaluation',
    route(m, resp, 'evaluate').status !== route(m, m.objects.find((o) => o.id === 'spec'), 'estimate').status);

  // The planner says both, per operation.
  const p = plan(m);
  const ev = p.find((x) => x.operation === 'evaluate');
  const es = p.find((x) => x.operation === 'estimate');
  ok('the plan reports evaluate as ready', !!ev && ev.runnable.length > 0);
  ok('the plan reports estimate as blocked', !!es && es.blocked.length > 0);
  ok('  on the observations', /observations/.test(JSON.stringify(es.blocked)));
  ok('and the model is no longer graded as computing nothing',
    b.ok && b.report.capability === 'computational', b.ok ? b.report.capability : '');

  // AND IT DRAWS — three dimensions, over the ranges THEY gave.
  const spec = buildSpec(m);
  ok('it draws', spec.primitives.length > 0);
  ok('  in three dimensions', spec.dimensionality === 3);
  ok('  over the ranges they named',
    resp.over.x[0] === 8 && resp.over.x[1] === 20 && resp.over.y[1] === 30);
  ok('  with no problem reported for it', !spec.notes.find((n) => n.of === resp.id)?.problem);

  // NOTHING IS FABRICATED.
  const flat = JSON.stringify(m);
  ok('no observations were invented', !m.data || Object.keys(m.data).length === 0);
  ok('no R², standard error or p-value anywhere', !/r2|rSquared|stderr|pValue/i.test(flat));
  ok('the surface is model-derived, not data-derived', resp.fidelity === 'model-derived');
  ok('  and says the values are the person’s hypotheses',
    resp.provenance.origin === 'user' && /nothing here is estimated from data/.test(resp.provenance.detail));
  ok('  and refuses to call itself a conditional expectation',
    /NOT a conditional expectation/.test(resp.meaning));

  // THE REMAINING DEGREE OF FREEDOM IS NAMED, NOT INVENTED.
  const noB0 = buildProposal(wage(HYP.filter((x) => x.id !== 'spec__b0'), OVER), { at: 1 });
  const m2 = unpack(noB0.model);
  const r2 = route(m2, m2.objects.find((o) => o.meta?.role === 'response'), 'evaluate');
  ok('with β₀ unspecified it is incomplete, not runnable', r2.status === 'incomplete');
  ok('  and β₀ is what it names', /spec__b0/.test(JSON.stringify(r2.missing)));
  // Named BY ITS DISPLAY NAME, through the symbol table — "a value for β₀
  // (spec__b0)" rather than a bare internal identifier. A person is owed the
  // name they used, and the canonical id beside it so the two are known to be
  // one quantity.
  ok('  described as a quantity the model has and nothing has valued',
    /nothing has given it a number/.test(JSON.stringify(r2.missing)), JSON.stringify(r2.missing));
  ok('  and named as β₀, not only as an internal id',
    /β₀/.test(JSON.stringify(r2.missing)), JSON.stringify(r2.missing));
  ok('  and no value was invented for it',
    !m2.params.some((q) => q.id === 'spec__b0'));

  // MANIPULATION COMES FROM THE EQUATION. The surface IS the expression, so a
  // change to a coefficient reaches it through the dependency graph rather
  // than through any visual transform.
  for (const c of ['spec__b0', 'spec__b1', 'spec__b2']) {
    ok(`changing ${c} reaches the surface`, affectedBy(m, [c]).includes(resp.id),
      JSON.stringify(affectedBy(m, [c])));
  }
  ok('and the surface is literally the equation',
    /spec__b1/.test(resp.defs.z) && /spec__b2/.test(resp.defs.z), resp.defs.z);

  // A SPECIFICATION WITH NO VALUES AT ALL still says what it is waiting for,
  // and does not pretend to draw.
  const bare = buildProposal(wage([], undefined), { at: 1 });
  const m3 = unpack(bare.model);
  const r3 = m3.objects.find((o) => o.meta?.role === 'response');
  ok('a specification with no values still forms the component', !!r3);
  ok('  and reports every coefficient as missing',
    route(m3, r3, 'evaluate').status === 'incomplete');

  // …AND THE CONVERSATION IS TOLD BOTH THINGS.
  const said = JSON.stringify(modelStateFrom(m, buildSpec(m)).science);
  ok('chat is told evaluation is ready', /work out what the model says/.test(said), said.slice(0, 200));
  ok('chat is told estimation is blocked', /fit it to observations: blocked/.test(said));
  ok('chat is told the surface is not an estimate', /NOT estimated/.test(said));
  ok('  nor a conditional expectation', /NOT a conditional expectation/.test(said));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
