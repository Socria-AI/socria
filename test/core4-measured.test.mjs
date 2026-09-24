// The two stages that MEASURE rather than read.
//
// Everything else in Core 4 hands a weaker model text the reply model already
// holds, which is why an adversarial audit reproduced sixteen of nineteen
// claimed remainders with a system prompt (docs/CORE-4-ARCHITECTURE.md §5″).
// These two run the model on inputs the conversation never contained — a
// premise set with one premise removed, and the same question asked
// independently several times — so what they produce is generated rather than
// recalled, and a prompt cannot reach it at any length.
//
// What this suite pins is the part that can be got wrong silently: which
// premises are chosen, what is DISCARDED rather than reported, and above all
// the asymmetry in calibration — a weak model agreeing with itself must never
// become confidence in the reply.

import { buildProblem } from './.tmp/problem.mjs';
import {
  testDependencies, renderCounterfactual, targetOf, candidates, CF_FLOOR, MAX_ABLATIONS,
  testContradictions, renderContradictions, contradictionCandidates,
} from './.tmp/counterfactual.mjs';
import {
  calibrate, renderCalibration, claimOf, cluster, sameAnswer, SAMPLES, SPLIT_AT,
} from './.tmp/calibration.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const e = (over) => ({
  id: 'e1', conversationId: 'c1', projectId: null, userId: 'u', turn: 1,
  kind: 'claim', text: 'a thing', owner: 'user', stance: 'asserts', basis: 'quoted',
  quote: 'q', status: 'active', private: false, createdAt: 1, updatedAt: 1, ...over,
});
const ST = { currentGoal: 'raise', currentFocus: 'churn', blockingUnknown: '', turn: 4 };

/** A client that answers every call with the same canned JSON. */
const canned = (obj, log) => ({
  complete: async (req) => {
    if (log) log.push(req);
    return { text: typeof obj === 'function' ? obj(req, log) : JSON.stringify(obj) };
  },
  stream: () => { throw new Error('not used'); },
});

// ─────────────────────────────────────────────────────────────────────

console.log('=== the conclusion under test is theirs, and the furthest along ===');
{
  const p = buildProblem([
    e({ id: 'c', kind: 'claim', text: 'churn is 4.1% monthly' }),
    e({ id: 'd', kind: 'decision', text: 'raise in March', turn: 3 }),
    e({ id: 's', kind: 'conclusion', text: 'we lose 40% of logos a year', turn: 2 }),
  ], [], ST);
  ok('a decision beats a conclusion beats a claim', targetOf(p)?.id === 'd', targetOf(p)?.id);

  const socriaOnly = buildProblem([
    e({ id: 'x', kind: 'decision', text: 'raise in March', owner: 'socria' }),
  ], [], ST);
  ok('Socria testing its own reasoning back at them is not the job', targetOf(socriaOnly) === null);
  ok('nothing on the table means nothing to test', targetOf(buildProblem([], [], ST)) === null);
}

console.log('\n=== the premises worth spending a call on ===');
{
  const items = [
    e({ id: 'd', kind: 'decision', text: 'raise in March', turn: 4 }),
    e({ id: 'a', kind: 'assumption', text: 'the churn number holds through Q4' }),
    e({ id: 'v', kind: 'claim', text: 'the contractor build lands in March', owner: 'socria' }),
    e({ id: 'k', kind: 'evidence', text: 'the board approved the plan', basis: 'quoted' }),
    e({ id: 'q', kind: 'question', text: 'should we wait?' }),
    e({ id: 'short', kind: 'claim', text: 'yes' }),
  ];
  const p = buildProblem(items, [{ from: 'd', to: 'a', rel: 'depends_on' }], ST);
  const c = candidates(p, targetOf(p));
  const ids = c.map((x) => x.id);
  ok('an assumption the decision rests on comes first', ids[0] === 'a', ids.join(','));
  ok('a question is never a premise to ablate', !ids.includes('q'));
  ok('nor is a fragment too short to remove meaningfully', !ids.includes('short'));
  ok('nor the conclusion itself', !ids.includes('d'));
  ok('Socria\'s own unchecked claim IS worth testing — it is the system\'s guess wearing a claim\'s clothes', ids.includes('v'), ids.join(','));
  // RANK ORDERS, IT DOES NOT GATE. An earlier version filtered to rank > 0,
  // so only premises the READER had already marked assumed, unchecked or
  // edge-connected were ever probed — the one stage built to replace reader
  // assertions with measurement was picking its candidates from reader
  // assertions, and a plain stated fact was never tested at all. The E17
  // validator made 0 model calls on 24 labelled items before this was fixed.
  const plain = buildProblem([
    e({ id: 'd', kind: 'decision', text: 'Raise in March', turn: 4 }),
    e({ id: 'f1', kind: 'claim', text: 'Cash on hand is 15.2 million dollars', basis: 'quoted', owner: 'user' }),
    e({ id: 'f2', kind: 'claim', text: 'Net burn is 800 thousand a month', basis: 'quoted', owner: 'user' }),
  ], [], ST);
  const plainIds = candidates(plain, targetOf(plain)).map((x) => x.id);
  ok('a plainly stated fact with no reader flag is still probed', plainIds.includes('f1') && plainIds.includes('f2'), plainIds.join(','));
  ok(`at most ${MAX_ABLATIONS} are probed`, c.length <= MAX_ABLATIONS);
}

console.log('\n=== the removed premise is absent from the prompt, not negated ===');
{
  const log = [];
  const p = buildProblem([
    e({ id: 'd', kind: 'decision', text: 'raise in March', turn: 4 }),
    e({ id: 'a', kind: 'assumption', text: 'the churn number holds through Q4' }),
  ], [], ST);
  await testDependencies('k', p, ST, canned({ holds: false, instead: 'the raise moves to June', confidence: 0.9 }, log));
  ok('a call was made', log.length === 1, String(log.length));
  const body = log[0]?.messages[0].content ?? '';
  ok('the removed premise is named as REMOVED and treated as unknown', /REMOVED PREMISE \(treat as unknown, not as false\)/.test(body));
  ok('  and does not appear in the list to reason from', !/PREMISES[\s\S]*- the churn number holds through Q4[\s\S]*REMOVED/.test(body), body.slice(0, 300));
  ok('the ablation runs on the cheap model at temperature 0', log[0].temperature === 0 && log[0].json === true);
}

console.log('\n=== a verdict that settled nothing is discarded, not reported ===');
{
  const p = buildProblem([
    e({ id: 'd', kind: 'decision', text: 'raise in March', turn: 4 }),
    e({ id: 'a', kind: 'assumption', text: 'the churn number holds through Q4' }),
  ], [], ST);
  const unclear = await testDependencies('k', p, ST, canned({ holds: 'unclear', instead: '', confidence: 0.95 }));
  ok('"unclear" is never reported as robustness', unclear === null, JSON.stringify(unclear));
  const timid = await testDependencies('k', p, ST, canned({ holds: false, instead: 'it moves', confidence: CF_FLOOR - 0.01 }));
  ok('below the confidence floor it is dropped', timid === null);
  const shrug = await testDependencies('k', p, ST, canned({ holds: false, instead: '', confidence: 0.99 }));
  ok('"does not follow" with nothing to say instead is a shrug, not a finding', shrug === null);
  const broken = await testDependencies('k', p, ST, canned(() => 'not json at all'));
  ok('a malformed answer never throws the turn', broken === null);
}

console.log('\n=== what the measurement earned the right to say ===');
{
  const p = buildProblem([
    e({ id: 'd', kind: 'decision', text: 'raise in March', turn: 4 }),
    e({ id: 'a', kind: 'assumption', text: 'the churn number holds through Q4' }),
  ], [], ST);
  const cf = await testDependencies('k', p, ST, canned({ holds: false, instead: 'the raise moves to June', confidence: 0.9 }));
  ok('a load-bearing premise is found', cf?.ablations[0].dependence === 'load_bearing', JSON.stringify(cf));
  const block = renderCounterfactual(cf);
  ok('the block names what falls over and what follows instead', /no longer follows/.test(block) && /moves to June/.test(block));
  ok('  and marks that the premise is an assumption, not a finding', /is an assumption, not a finding/.test(block));
  ok('  and says the finding was measured rather than inferred from wording', /measured by removing each premise/.test(block));
  ok('  and forbids describing the test itself', /Never describe the test/.test(block));
  ok('nothing at all when nothing was measured', renderCounterfactual(null) === '');

  // A conclusion that survives losing a CHECKED premise is not worth a
  // sentence — every sound argument has that property.
  const solid = buildProblem([
    e({ id: 'd', kind: 'decision', text: 'raise in March', turn: 4 }),
    e({ id: 'k', kind: 'evidence', text: 'the board approved the plan in writing', owner: 'external' }),
  ], [], ST);
  const robust = await testDependencies('k', solid, ST, canned({ holds: true, instead: '', confidence: 0.9 }));
  ok('robustness against an externally supported premise says nothing worth saying',
    renderCounterfactual(robust) === '', JSON.stringify(robust?.ablations));
}

console.log('\n=== calibration: what is sampled, and how often ===');
{
  const log = [];
  const p = buildProblem([
    e({ id: 'c', kind: 'conclusion', text: 'we are losing about 40% of logos a year at this rate', turn: 2 }),
    e({ id: 'd', kind: 'decision', text: 'raise in March', turn: 4 }),
  ], [], ST);
  ok('a decision is NOT sampled — re-deriving a choice measures nothing', claimOf(p)?.kind === 'conclusion', claimOf(p)?.kind);
  await calibrate('k', p, 'the transcript', canned({ answer: 'roughly 40%', basis: 'compounding' }, log));
  ok(`${SAMPLES} independent attempts are made`, log.length === SAMPLES, String(log.length));
  ok('at a temperature that lets them differ', log[0].temperature >= 0.8, String(log[0].temperature));
  const socria = buildProblem([e({ id: 's', kind: 'conclusion', text: 'a long enough conclusion of ours', owner: 'socria' })], [], ST);
  ok('only their claim is sampled, never Socria\'s', claimOf(socria) === null);
}

console.log('\n=== sameAnswer: the number usually IS the answer ===');
{
  // similarity() from considered.ts was the first thing tried here and it is
  // wrong for this job in two ways this suite caught: it scores two identical
  // short strings at 0 when every word is a stopword, and it scores "about 40%
  // a year" against "around 40% annually" at 0 — the same answer in different
  // words, the one case that MUST collapse.
  ok('the same quantity in different words is one answer', sameAnswer('about 40% a year', 'around 40% annually'));
  ok('identical strings are one answer even when every word is a stopword', sameAnswer('a a a a', 'a a a a'));
  ok('different quantities are different answers', !sameAnswer('about 40% a year', 'closer to 25% once cohorts are split'));
  ok('  even when only one digit apart', !sameAnswer('the figure is 49%', 'the figure is 40%'));
  ok('a trailing year does not split answers that agree on the figure that matters',
    sameAnswer('about 40% in 2026', '40%, measured over 2026'));
  ok('number-free answers fall back to what they are about', sameAnswer('the index is unusable', 'unusable index, not a costing problem'));
  ok('  and stay apart when they are about different things', !sameAnswer('the index is unusable', 'the planner is costing it wrong'));
  ok('an empty answer matches nothing', !sameAnswer('', 'about 40%'));
}

console.log('\n=== clustering: the same answer in different words is one answer ===');
{
  const c1 = cluster(['about 40% a year', 'roughly 40% a year', 'around 40% annually']);
  ok('paraphrases collapse to one cluster', c1.length === 1 && c1[0].count === 3, JSON.stringify(c1));
  const c2 = cluster(['about 40% a year', 'closer to 25% once cohorts are split', 'no, the figure is 49%']);
  ok('genuinely different answers stay apart', c2.length === 3, JSON.stringify(c2));
  ok('the most common comes first', cluster(['a a a a', 'b b b b', 'a a a a'])[0].count === 2);
}

console.log('\n=== THE ASYMMETRY: agreement is never confidence ===');
{
  const p = buildProblem([
    e({ id: 'c', kind: 'conclusion', text: 'we are losing about 40% of logos a year at this rate', turn: 2 }),
  ], [], ST);
  // Five identical answers from a weak model. It may be repeatably wrong, and
  // small models are especially good at that.
  const agreed = await calibrate('k', p, 'ctx', canned({ answer: 'about 40% a year', basis: 'compounding' }));
  ok('five identical answers is not a split', agreed?.split === false && agreed?.agreement === 1, JSON.stringify(agreed));
  ok('and it reaches the prompt as NOTHING — a weak model agreeing with itself is not evidence',
    renderCalibration(agreed) === '', JSON.stringify(renderCalibration(agreed)));

  // Disagreement is different: the same inputs produced different outputs.
  let n = 0;
  const split = await calibrate('k', p, 'ctx', canned(() => {
    n += 1;
    const a = ['about 40% a year', 'closer to 25% once cohorts are split', 'the figure is 49%', 'about 40% a year', 'nearer 30% on a blended book'][n - 1];
    return JSON.stringify({ answer: a, basis: 'b' });
  }));
  ok('a wide spread is recorded as a split', split?.split === true && split.agreement < SPLIT_AT, JSON.stringify(split?.agreement));
  const block = renderCalibration(split);
  ok('  and THAT reaches the prompt', block.length > 0);
  ok('  as evidence the material does not determine it', /does not determine it/.test(block));
  ok('  explicitly not as evidence any one answer is right', /not evidence that any one of these is right/.test(block));
  ok('  forbidding the modal answer being passed off as the answer', /Do not present the most common version as the answer/.test(block));
  ok('  and forbidding any mention of sampling', /never mention attempts, samples, sampling/.test(block));
}

console.log('\n=== calibration fails safe ===');
{
  const p = buildProblem([
    e({ id: 'c', kind: 'conclusion', text: 'we are losing about 40% of logos a year at this rate', turn: 2 }),
  ], [], ST);
  ok('a malformed answer never throws', (await calibrate('k', p, 'ctx', canned(() => 'garbage'))) === null);
  let i = 0;
  const thin = await calibrate('k', p, 'ctx', canned(() => (++i <= 2 ? JSON.stringify({ answer: 'a real answer here' }) : 'broken')));
  ok('two samples is a coin on its edge, not a measurement', thin === null, JSON.stringify(thin));
  ok('nothing on the table means nothing to sample', (await calibrate('k', buildProblem([], [], ST), 'ctx', canned({ answer: 'x' }))) === null);
}

console.log('\n=== measured contradiction: the reader asserted it, now it gets tested ===');
{
  // The audit's sharpest finding: contribution.ts's CONTRADICTION fired only
  // from a `contradicts` edge, which exists only when the 2-second reader
  // already spotted the contradiction. That is a weaker model's assertion
  // wearing a measurement's clothes.
  const far = [
    e({ id: 'a', kind: 'claim', text: 'Reads never cross replicas, that is the invariant', turn: 1 }),
    e({ id: 'b', kind: 'claim', text: 'The staleness budget on balance reads is 200ms', turn: 7 }),
  ];
  const p = buildProblem(far, [{ from: 'a', to: 'b', rel: 'contradicts' }], { ...ST, turn: 8 });
  const cands = contradictionCandidates(p);
  ok('a reader-flagged pair is a candidate', cands.some((c) => c.source === 'reader'), JSON.stringify(cands.map((c) => c.source)));

  const confirmed = await testContradictions('k', p, canned({ compatible: false, conflict: 'a 200ms budget permits exactly the cross-replica read the invariant forbids', confidence: 0.9 }));
  ok('a pair that cannot both hold survives the test', confirmed.length === 1, JSON.stringify(confirmed));
  const block = renderContradictions(confirmed);
  ok('  and the block states the conflict, not the method', /do conflict/.test(block) && /permits exactly/.test(block));
  ok('  and forbids saying it was checked', /Do not say it was checked/.test(block));
  ok('  and says how far apart they were', /6 turns apart/.test(block), block);

  // THE FAILURE THAT MATTERS. A person refining a number is not contradicting
  // themselves, and telling them they did is worse than staying silent.
  const update = await testContradictions('k', p, canned({ compatible: true, conflict: '', confidence: 0.9 }));
  ok('an update the model judges compatible is dropped', update.length === 0);
  const unsure = await testContradictions('k', p, canned({ compatible: 'unclear', conflict: 'maybe', confidence: 0.9 }));
  ok('"unclear" is not a contradiction', unsure.length === 0);
  const timid = await testContradictions('k', p, canned({ compatible: false, conflict: 'x', confidence: CF_FLOOR - 0.01 }));
  ok('below the confidence floor it is dropped', timid.length === 0);
  const empty = await testContradictions('k', p, canned({ compatible: false, conflict: '', confidence: 0.99 }));
  ok('"they conflict" with nothing to say about what is a shrug', empty.length === 0);
  ok('a malformed answer never throws', (await testContradictions('k', p, canned(() => 'nonsense'))).length === 0);
  ok('nothing to compare means no calls', (await testContradictions('k', buildProblem([], [], ST), canned({ compatible: false }))).length === 0);
}

console.log('\n=== and it finds pairs the reader never flagged ===');
{
  // The point of measuring rather than repackaging: candidates come from the
  // structure too — same subject, different numbers, turns apart — which is
  // exactly the shape a reader misses in a long transcript.
  const noEdge = [
    e({ id: 'a', kind: 'claim', text: 'Monthly logo churn is running at 4.1 percent', turn: 1 }),
    e({ id: 'b', kind: 'claim', text: 'Monthly logo churn has been 2.2 percent all year', turn: 6 }),
    e({ id: 'c', kind: 'claim', text: 'The onboarding rebuild shipped in April', turn: 3 }),
  ];
  const p = buildProblem(noEdge, [], { ...ST, turn: 7 });
  const cands = contradictionCandidates(p);
  ok('same subject, different numbers, turns apart is a candidate',
    cands.some((c) => c.source === 'structure' && [c.a.id, c.b.id].sort().join('') === 'ab'), JSON.stringify(cands.map((c) => c.a.id + c.b.id + ':' + c.source)));
  ok('  with no reader edge anywhere', noEdge.every((x) => true) && cands.every((c) => c.source === 'structure'));
  ok('an unrelated statement is not paired with them', !cands.some((c) => c.a.id === 'c' || c.b.id === 'c'), JSON.stringify(cands.map((c) => c.a.id + c.b.id)));
  const adjacent = buildProblem([
    e({ id: 'a', kind: 'claim', text: 'Monthly logo churn is running at 4.1 percent', turn: 5 }),
    e({ id: 'b', kind: 'claim', text: 'Monthly logo churn has been 2.2 percent all year', turn: 5 }),
  ], [], { ...ST, turn: 6 });
  ok('two statements in the same breath are not a cross-turn contradiction', contradictionCandidates(adjacent).length === 0);
  ok('at most three pairs are ever put to a call', contradictionCandidates(buildProblem(
    Array.from({ length: 9 }, (_, i) => e({ id: 'x' + i, kind: 'claim', text: `Monthly logo churn measured ${i + 1}.5 percent in the window`, turn: i + 1 })),
    [], { ...ST, turn: 12 })).length <= 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
