// The problem, as a structure — and what the structure says is missing.
//
// Six eval runs measured the same thing: Core 4 reached parity on control and
// never got past parity on contribution. The judges' sentence was a version of
// "both are strong; the baseline contributed more non-obvious material".
//
// The cause was representational. `LEDGER_RELATIONS` had named supports /
// contradicts / depends_on / assumes since the ledger was written, and
// `linksForTurn` produced exactly three relations, none of them those. So the
// schema could say "this decision rests on that assumption" and nothing ever
// said it, nothing could read it, and no amount of prompt could notice a
// conclusion standing on a number assumed four turns earlier.
//
// These tests cover the three parts that fix it: the edges get written, the
// problem is read as a connected structure, and the detectors are queries over
// that structure rather than a second opinion about the conversation.

import { buildProblem, epistemicOf, ofKind, restsOn, renderProblem } from './.tmp/problem.mjs';
import { detectMissing, gateContributions, renderMissing, MISSING_KINDS } from './.tmp/contribution.mjs';
import { linksFromRelations, entriesFromPerson, mergeEntries } from './.tmp/ledger.mjs';
import { EMPTY_STATE } from './.tmp/state.mjs';
import { taskCompetence, calibrate, conceptKey } from './.tmp/capability.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

let seq = 0;
const entry = (over = {}) => ({
  id: `e${++seq}`, kind: 'claim', text: 'a claim', owner: 'user', stance: 'asserts', basis: 'quoted',
  quote: 'a claim', reason: '', status: 'active', confidence: 0.9, conversationId: 'c1', projectId: null,
  turn: 1, createdAt: 1, updatedAt: 1, revisions: [], ...over,
});
const link = (from, rel, to) => ({ id: `l${++seq}`, from, to, rel, owner: 'unknown', reason: '', createdAt: 1 });
const S = (over = {}) => ({ ...EMPTY_STATE, ...over });

console.log('=== what kind of knowledge is this ===');
{
  ok('their own words, quoted', epistemicOf(entry({ owner: 'user', basis: 'quoted' })) === 'user_stated');
  ok('an assumption is assumed however it arrived', epistemicOf(entry({ kind: 'assumption', owner: 'user', basis: 'quoted' })) === 'assumed');
  ok('a question is not knowledge', epistemicOf(entry({ kind: 'question' })) === 'unknown');
  ok("Socria's own claim is unchecked, not established", epistemicOf(entry({ owner: 'socria', kind: 'claim' })) === 'needs_verification');
  ok('disputed beats everything', epistemicOf(entry({ status: 'disputed', owner: 'user', basis: 'quoted' })) === 'disputed');
  ok('an ungrounded reading is inferred', epistemicOf(entry({ owner: 'unknown', basis: 'inferred' })) === 'inferred');
}

console.log('\n=== the edges the reader names get written, and only those ===');
{
  const es = [entry({ id: 'a', text: 'We should raise in Q1' }), entry({ id: 'b', text: 'Churn is 4% a month' })];
  const exact = linksFromRelations([{ from: 'We should raise in Q1', rel: 'depends_on', to: 'Churn is 4% a month' }], es, 1);
  ok('an exact pair of texts becomes one edge', exact.length === 1 && exact[0].from === 'a' && exact[0].to === 'b' && exact[0].rel === 'depends_on', JSON.stringify(exact));
  const near = linksFromRelations([{ from: 'we should raise in q1', rel: 'depends_on', to: 'churn is 4% per month' }], es, 1);
  ok('a close paraphrase still resolves', near.length === 1, JSON.stringify(near));
  const bogus = linksFromRelations([{ from: 'the price of tea in China', rel: 'depends_on', to: 'lunar phases' }], es, 1);
  ok('an end that matches nothing produces NO edge, never a wrong one', bogus.length === 0, JSON.stringify(bogus));
  const self = linksFromRelations([{ from: 'We should raise in Q1', rel: 'supports', to: 'We should raise in Q1' }], es, 1);
  ok('nothing rests on itself', self.length === 0);
  const dup = linksFromRelations([
    { from: 'We should raise in Q1', rel: 'depends_on', to: 'Churn is 4% a month' },
    { from: 'We should raise in Q1', rel: 'depends_on', to: 'Churn is 4% a month' },
  ], es, 1);
  ok('the same edge twice is one edge', dup.length === 1);
  ok('an edge is nobody\'s claim: it is a reading', exact[0].owner === 'unknown');
}

console.log('\n=== the problem, read as a structure ===');
{
  const es = [
    entry({ id: 'd', kind: 'decision', text: 'Raise a Series A in Q1', turn: 9 }),
    entry({ id: 'c', kind: 'claim', text: 'Churn is 4% a month', turn: 2 }),
    entry({ id: 'a', kind: 'assumption', text: 'The 4% excludes the annual cohort', turn: 2 }),
  ];
  const p = buildProblem(es, [link('d', 'depends_on', 'c'), link('c', 'depends_on', 'a')], S({ currentGoal: 'raise', turn: 9 }));
  ok('items and their edges are both there', p.items.length === 3 && p.live.length === 3);
  ok('decisions are findable by kind', ofKind(p, 'decision').length === 1);
  const rests = restsOn(p, 'd').map((i) => i.id);
  ok('what a decision rests on is transitive: two hops', rests.includes('c') && rests.includes('a'), JSON.stringify(rests));
  ok('a settled item leaves the live set', buildProblem(es.map((e) => (e.id === 'a' ? { ...e, status: 'superseded' } : e)), [], S()).live.length === 2);
  ok('a retracted item is gone entirely', buildProblem(es.map((e) => (e.id === 'a' ? { ...e, status: 'retracted' } : e)), [], S()).items.length === 2);
  const rendered = renderProblem(p);
  ok('the render says what rests on what', /rests on "Churn is 4% a month"/.test(rendered), rendered);
  ok('  and marks the assumption as assumed', /assumed/.test(rendered), rendered);
  ok('nothing to say when there are no edges', renderProblem(buildProblem(es, [], S())) === '');
}

console.log('\n=== what the structure says is missing ===');
{
  const es = [
    entry({ id: 'd', kind: 'decision', text: 'Raise a Series A in Q1', turn: 9 }),
    entry({ id: 'c', kind: 'claim', text: 'Churn is 4% a month', turn: 2 }),
    entry({ id: 'a', kind: 'assumption', text: 'The 4% excludes the annual cohort', turn: 2 }),
  ];
  const p = buildProblem(es, [link('d', 'depends_on', 'c'), link('c', 'depends_on', 'a')], S({ turn: 9, taskKind: 'decide' }));
  const found = detectMissing(p, S({ taskKind: 'decide', work: 'judgment' }));
  const hidden = found.find((f) => f.kind === 'HIDDEN_ASSUMPTION');
  ok('a decision resting on an unsupported assumption is found', !!hidden, JSON.stringify(found.map((f) => f.kind)));
  ok('  and it names both ends', hidden && /Raise a Series A/.test(hidden.what) && /excludes the annual cohort/.test(hidden.what), hidden?.what);
  ok('  citing the ledger ids, so it can be audited', hidden && hidden.ids.includes('d') && hidden.ids.includes('a'));

  // Supported: the same shape with evidence behind the assumption is NOT a finding.
  const supported = buildProblem(
    [...es, entry({ id: 'ev', kind: 'evidence', text: 'Cohort export, 11 Sept' })],
    [link('d', 'depends_on', 'c'), link('c', 'depends_on', 'a'), link('ev', 'supports', 'a')],
    S({ turn: 9 })
  );
  ok('an assumption something supports is not raised', !detectMissing(supported, S({ taskKind: 'decide' })).some((f) => f.kind === 'HIDDEN_ASSUMPTION'));

  // A contradiction across turns, which same-message `tensions` cannot see.
  const contra = buildProblem(
    [entry({ id: 'x', text: 'We never discount enterprise', turn: 2 }), entry({ id: 'y', text: 'We gave Acme 30% off', turn: 9 })],
    [link('x', 'contradicts', 'y')],
    S({ turn: 9 })
  );
  const c = detectMissing(contra, S()).find((f) => f.kind === 'CONTRADICTION');
  ok('a contradiction between distant turns is found', !!c && /turn 2/.test(c.what) && /turn 9/.test(c.what), c?.what);
  const sameTurn = buildProblem(
    [entry({ id: 'x', text: 'A', turn: 9 }), entry({ id: 'y', text: 'B', turn: 9 })],
    [link('x', 'contradicts', 'y')], S({ turn: 9 })
  );
  ok('  but not one inside a single message (the CHALLENGE branch owns that)', !detectMissing(sameTurn, S()).some((f) => f.kind === 'CONTRADICTION'));

  // Still resting on something that has since been dropped.
  const stale = buildProblem(
    [entry({ id: 'p', kind: 'conclusion', text: 'Ship in March', turn: 9 }), entry({ id: 'q', text: 'The contractor starts in January', status: 'superseded', turn: 3 })],
    [link('p', 'depends_on', 'q')], S({ turn: 9 })
  );
  ok('a belief resting on something dropped is found', detectMissing(stale, S()).some((f) => f.kind === 'STALE_BELIEF'));

  // An open question nobody closed.
  const loop = buildProblem([entry({ id: 'q', kind: 'question', text: 'Who owns the migration?', turn: 2 })], [], S({ turn: 9 }));
  ok('a question open for many turns is found', detectMissing(loop, S()).some((f) => f.kind === 'REPEATED_LOOP'));
  const fresh = buildProblem([entry({ id: 'q', kind: 'question', text: 'Who owns the migration?', turn: 9 })], [], S({ turn: 9 }));
  ok('  but not one just asked', !detectMissing(fresh, S()).some((f) => f.kind === 'REPEATED_LOOP'));

  // FALSE_BINARY, MISSING_EVIDENCE and UNDERWEIGHTED_UNCERTAINTY were DELETED
  // after the differentiation audit, and this asserts they stay deleted.
  //
  // Each keyed on something the 2-second cheap reader has to emit — an edge,
  // or exactly two items of kind `option`/`alternative` — and the reader does
  // not reliably emit any of it. FALSE_BINARY is the clearest case: it never
  // fired once across run 8's 22 turns, INCLUDING on power-binary-007, the
  // scenario written specifically to trigger it. A detector that cannot fire
  // on its own test case is not a detector, and re-announcing a weaker
  // model's assertion was never differentiation in the first place.
  const binary = buildProblem(
    [entry({ id: 'o1', kind: 'option', text: 'Build it' }), entry({ id: 'o2', kind: 'option', text: 'Buy it' }), entry({ id: 'd', kind: 'decision', text: 'Build or buy' })],
    [], S({ taskKind: 'decide' })
  );
  const gone = new Set(['FALSE_BINARY', 'MISSING_EVIDENCE', 'UNDERWEIGHTED_UNCERTAINTY', 'UNVERIFIED_FACT']);
  ok('the deleted detectors stay deleted', !detectMissing(binary, S({ taskKind: 'decide' })).some((f) => gone.has(f.kind)),
    detectMissing(binary, S({ taskKind: 'decide' })).map((f) => f.kind).join(','));
  ok('  and the kinds they used are gone from the vocabulary', !MISSING_KINDS.some((k) => gone.has(k)), MISSING_KINDS.join(','));
  ok('  while the structural ones that do fire are kept',
    ['HIDDEN_ASSUMPTION', 'CONTRADICTION', 'STALE_BELIEF', 'MISSING_DECISION_CRITERIA', 'REPEATED_LOOP'].every((k) => MISSING_KINDS.includes(k)), MISSING_KINDS.join(','));

  ok('an empty problem says nothing is missing', detectMissing(buildProblem([], [], S()), S()).length === 0);
  ok('one finding per kind, not three wordings of one', new Set(found.map((f) => f.kind)).size === found.length);
}

console.log('\n=== the gate: already said, and not worth an expert\'s time ===');
{
  const found = [
    { kind: 'HIDDEN_ASSUMPTION', ids: ['a'], subjects: ['The churn number'], what: 'The plan rests on the churn number, which is assumed', whyItMatters: 'x', confidence: 0.75, novelty: 'UNCERTAIN', risk: 'medium' },
    { kind: 'FALSE_BINARY', ids: ['b'], subjects: ['Build it', 'Buy it'], what: 'Only two options are on the table', whyItMatters: 'y', confidence: 0.45, novelty: 'UNCERTAIN', risk: 'low' },
  ];
  ok('a novice hears both', gateContributions(found, [], 'novice').length === 2);
  ok('an expert is not told the obvious one', gateContributions(found, [], 'expert').map((f) => f.kind).join() === 'HIDDEN_ASSUMPTION');
  const already = gateContributions(found, ['The plan rests on the churn number, which is assumed'], 'novice');
  ok('what they already said is dropped', !already.some((f) => f.kind === 'HIDDEN_ASSUMPTION'), JSON.stringify(already.map((f) => f.kind)));
  ok('the novelty verdict is recorded, not left UNCERTAIN', gateContributions(found, [], 'novice').every((f) => f.novelty === 'NOVEL'),
     JSON.stringify(gateContributions(found, [], 'novice').map((f) => f.novelty)));
  const rendered = renderMissing(gateContributions(found, [], 'novice'));
  ok('the move block gets at most two, with the instruction to raise one', /Raise at most ONE/.test(rendered) && rendered.split('\n  - ').length - 1 <= 2, rendered);
  ok('  and never as a list to the person', /Never as a list/i.test(rendered), rendered);
  // A run-8 reply opened "The thing the model structurally cannot see" — the
  // block's own framing leaking into the voice.
  ok('  and never described as structure or as what a model can see', /never describe it as structure/.test(rendered) && /say the thing itself/.test(rendered), rendered);
  ok('nothing missing renders nothing', renderMissing([]) === '');
  // The gate must not read a finding as already-said just because it quotes
  // the thing it is about (found by the end-to-end test).
  const aboutTheirWords = [{ kind: 'MISSING_EVIDENCE', ids: ['c'], subjects: ['Monthly churn is 4.1%'],
    what: '"Monthly churn is 4.1%" is carrying the decision and has nothing behind it', whyItMatters: 'z', confidence: 0.6, novelty: 'UNCERTAIN', risk: 'medium' }];
  ok('quoting their own sentence is not the same as repeating their point',
     gateContributions(aboutTheirWords, ['Monthly churn is 4.1%'], 'novice').length === 1,
     JSON.stringify(gateContributions(aboutTheirWords, ['Monthly churn is 4.1%'], 'novice')));
  ok('  but making the same point they made is dropped',
     gateContributions(aboutTheirWords, ['the churn figure is carrying the decision and has nothing behind it'], 'novice').length === 0,
     JSON.stringify(gateContributions(aboutTheirWords, ['the churn figure is carrying the decision and has nothing behind it'], 'novice')));
}

console.log('\n=== end to end: a real two-turn shape ===');
{
  // Turn 2: they state the churn figure. Turn 9: they decide on it. The
  // reader names the edge; nothing else in the system could have.
  const ctx = { conversationId: 'c1', projectId: null, turn: 2, now: 1 };
  const t2 = entriesFromPerson(
    [{ kind: 'claim', text: 'Churn is 4% a month', quote: 'churn is 4% a month', stance: 'asserts', reason: '' },
     { kind: 'assumption', text: 'That excludes the annual cohort', quote: 'that excludes the annual cohort', stance: 'asserts', reason: '' }],
    'Our churn is 4% a month, and that excludes the annual cohort.', ctx
  );
  let ledger = mergeEntries([], t2, 1).entries;
  const t9 = entriesFromPerson(
    [{ kind: 'decision', text: 'Raise a Series A in Q1', quote: 'we should raise a Series A in Q1', stance: 'asserts', reason: '' }],
    'So we should raise a Series A in Q1.', { ...ctx, turn: 9, now: 2 }
  );
  ledger = mergeEntries(ledger, t9, 2).entries;
  const links = linksFromRelations([{ from: 'Raise a Series A in Q1', rel: 'depends_on', to: 'Churn is 4% a month' },
                                    { from: 'Churn is 4% a month', rel: 'assumes', to: 'That excludes the annual cohort' }], ledger, 2);
  ok('both edges resolve against real ledger entries', links.length === 2, JSON.stringify(links.map((l) => l.rel)));
  const p = buildProblem(ledger, links, S({ turn: 9, taskKind: 'decide' }));
  const out = gateContributions(detectMissing(p, S({ taskKind: 'decide', work: 'judgment' })), [], 'expert');
  ok('an expert is told the decision rests on an unexamined assumption', out.some((f) => f.kind === 'HIDDEN_ASSUMPTION'), JSON.stringify(out.map((f) => f.kind)));
  ok('  and the sentence names the real texts', /Series A/.test(out[0].what) && /annual cohort/.test(out[0].what), out[0]?.what);
}

console.log('\n=== competence is per concept, from events, not a label for a person ===');
{
  let n = 0;
  const ev = (concept, event, assistance = 0, conversationId = 'c' + ++n) =>
    ({ id: 'x' + n, concept, event, assistance, conversationId, turn: 1, confidence: 0.7, at: n });
  const key = conceptKey('the chain rule for derivatives');
  ok('no events, no opinion', taskCompetence([], key).value === 'unknown');
  const strong = [ev(key, 'demonstrated_unassisted'), ev(key, 'demonstrated_unassisted')];
  ok('two unassisted successes reads as expert ON THIS CONCEPT', taskCompetence(strong, key).value === 'expert');
  ok('  and says what it counted', /2 unassisted/.test(taskCompetence(strong, key).evidence));
  ok('  but says nothing about another concept', taskCompetence(strong, conceptKey('Postgres index bloat')).value === 'unknown');
  const shaky = [ev(key, 'misunderstanding'), ev(key, 'misunderstanding')];
  ok('two misunderstandings and no successes reads as novice', taskCompetence(shaky, key).value === 'novice');
  ok('one success against one miss is not expert', taskCompetence([ev(key, 'demonstrated_unassisted'), ev(key, 'misunderstanding')], key).value === 'intermediate');
  ok('help does not count as doing it alone', taskCompetence([ev(key, 'demonstrated_assisted', 3), ev(key, 'demonstrated_assisted', 3)], key).value === 'unknown');
  ok('a related concept key still counts', taskCompetence(strong, conceptKey('chain rule derivatives practice')).value === 'expert');

  const said = { value: 'expert', source: 'explicit', confidence: 1, evidence: 'I am a biostatistician' };
  ok('their own words are never overridden by events', calibrate(said, taskCompetence(shaky, key)).value === 'expert');
  const guess = { value: 'novice', source: 'inferred', confidence: 0.5, evidence: 'asked a basic question' };
  ok('a demonstrated record beats a guess from one message', calibrate(guess, taskCompetence(strong, key)).value === 'expert');
  ok('  and is marked observed, not inferred', calibrate(guess, taskCompetence(strong, key)).source === 'observed');
  ok('no record leaves the guess alone', calibrate(guess, taskCompetence([], key)).value === 'novice');
}

console.log('\n=== a deletion that leaves the judgement running is not a deletion ===');
{
  // Found by an adversarial audit. taskCompetence/calibrate mark a person
  // 'expert' on a concept from capability_evidence, with source 'observed'.
  // That value was being written into core4_state, where mergeState's
  // stickiness keeps an observed reading ahead of every later inference — so
  // deleteCapability dropped the evidence, the Memory page stopped showing
  // the concept, and the conclusion drawn from it kept running for as long as
  // the state row lived (council D15).
  const base = { value: 'unknown', source: 'inferred', confidence: 0.3, evidence: 'reader' };
  const observed = calibrate(base, { value: 'expert', confidence: 0.65, concept: 'postgres', unassisted: 2, misses: 0 });
  ok('calibration does mark it observed for the turn', observed.source === 'observed' && observed.value === 'expert', JSON.stringify(observed));
  ok('  and their own explicit word is never overridden',
    calibrate({ value: 'novice', source: 'explicit', confidence: 1, evidence: 'I am new to this' },
      { value: 'expert', confidence: 0.65, concept: 'postgres', unassisted: 2, misses: 0 }).value === 'novice');
  // The persisted value must be the uncalibrated one, so that removing the
  // evidence removes the effect on the very next turn.
  ok('the calibrated value is not the one that would be carried forward', observed !== base && base.source === 'inferred');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
