// THE COGNITIVE OUTCOME MODEL (lib/mr/outcome.ts).
//
// Six dimensions, never summed. Each is tested for what it reads and — just
// as much — for what it refuses to read: satisfaction is never learning, an
// attempt after the answer was given is not independent performance, and
// retention and autonomy cannot be measured inside one conversation. The
// proxy guard: satisfaction alone never keeps a decision.

import * as M from './.tmp/mr-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;

const params = M.paramsFor(M.MR_POLICY_VERSION);
const u = (content) => ({ role: 'user', content });
const a = (content) => ({ role: 'assistant', content });

/** A complete, valid decision; only what a test cares about is passed. */
function decision(action, controls = {}, expect = [], issuedAtTurn = 0) {
  return {
    policyVersion: M.MR_POLICY_VERSION,
    interventionId: `mr-test-${action}`,
    action,
    trigger: action === 'none' ? 'none' : `rule.${action}`,
    evidenceRefs: [{ turn: issuedAtTurn, role: 'user', code: 'explicit.direct_answer' }],
    target: ['acs'],
    controls,
    scope: { kind: 'turns', turns: 2 },
    expiration: { afterTurn: issuedAtTurn + 1, onRevoke: ['explicit.revoke'] },
    confidence: 0.9,
    uncertainty: [],
    evaluationPlan: { primary: 'taskCompletion', expect, window: 1 },
    rollback: { revertTo: 'acs_default', when: ['outcome:revert'] },
    loop: 'fast',
    issuedAtTurn,
  };
}

/** The outcome of `d`, given the conversation up to their next message (the last one). */
function outcome(d, messages, verdicts) {
  const turns = M.turnsOf(messages);
  const k = turns.length - 1;
  const prev = turns[k - 1];
  const next = turns[k];
  const nextObservations = M.observeTurn(turns, k, { params, verdicts });
  return M.evaluateOutcome({ decision: d, reply: prev.reply, next, nextObservations, params });
}

const STEPS = 'Here are the steps:\n1. Subtract 3 from both sides: 2x = 8.\n2. Divide both sides by 2: x = 4.';
const PROSE = 'You subtract three from both sides and then divide by two, which leaves x equal to four.';
const ASKING = 'Before I show you, what do you think the first move is?';

console.log('\n=== wordCount ===');
ok('words are whitespace runs with a letter or digit', M.wordCount('Hello, world!  - 1 2') === 4, M.wordCount('Hello, world!  - 1 2'));
ok('markdown bullets and lone symbols are not words', M.wordCount('- **bold** text\n* → item') === 3, M.wordCount('- **bold** text\n* → item'));
ok('empty → 0', M.wordCount('') === 0 && M.wordCount('   \n ') === 0);

console.log('\n=== deliveredFor: structural, per action and controls ===');
{
  const q0 = decision('fewer_questions', { questionBudget: { max: 0, enforcement: 'hard' } });
  ok('questions=0: a reply with no question → delivered', M.deliveredFor(q0, PROSE) === 'delivered');
  ok('questions=0: a reply that asks → not_delivered', M.deliveredFor(q0, PROSE + ' What do you think?') === 'not_delivered');
  ok('questions=0: a disguised question counts ("think about whether…")', M.deliveredFor(q0, PROSE + ' Think about whether that always works.') === 'not_delivered');
  ok('questions=0: a closing offer is not a question', M.deliveredFor(q0, PROSE + ' Want me to show another example?') === 'delivered');

  const steps = decision('direct', { strategy: 'direct', answerFirst: true }, ['steps_delivered']);
  ok('steps: two numbered lines, answer first → delivered', M.deliveredFor(steps, STEPS) === 'delivered');
  ok('steps: prose with the answer first → partial (answer first passed, steps failed)', M.deliveredFor(steps, PROSE) === 'partial');
  ok('steps: a question back → not_delivered', M.deliveredFor(steps, ASKING) === 'not_delivered');
  ok('steps: bullets and "Step n" lines count', M.deliveredFor(decision('none', {}, ['steps_delivered']), '- first do this\n- then that') === 'delivered' && M.deliveredFor(decision('none', {}, ['steps_delivered']), 'Step 1: isolate x\nStep 2: divide') === 'delivered');

  const direct = decision('direct', { answerFirst: true });
  ok('answer first: the first sentence answers → delivered', M.deliveredFor(direct, 'x = 4. You get there by subtracting 3 and dividing by 2.') === 'delivered');
  ok('answer first: the first sentence asks → not_delivered', M.deliveredFor(direct, ASKING + ' Then we can go on.') === 'not_delivered');
  ok('answer first: a first-sentence offer is not an answer', M.deliveredFor(direct, 'Want me to walk you through it? x = 4.') === 'not_delivered');

  const shorter = decision('shorter', { verbosity: { ceilingTokens: 200 } });
  const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ') + '.';
  ok('shorter: words ≤ ceiling × 0.75 → delivered (150 of 150)', M.deliveredFor(shorter, words(150)) === 'delivered');
  ok('shorter: 151 words over a 200-token ceiling → not_delivered', M.deliveredFor(shorter, words(151)) === 'not_delivered');
  ok('shorter with no ceiling of its own uses the policy\'s (360 → 270 words)', M.deliveredFor(decision('shorter'), words(270)) === 'delivered' && M.deliveredFor(decision('shorter'), words(271)) === 'not_delivered');

  const worked = decision('worked_example', { strategy: 'worked_example' });
  ok('worked example: steps with "=" → delivered', M.deliveredFor(worked, STEPS) === 'delivered');
  ok('worked example: steps with no working → not_delivered', M.deliveredFor(worked, '- read the problem\n- think about it') === 'not_delivered');
  ok('worked example: "step" words count as working', M.deliveredFor(worked, '1. In this step we expand the bracket.\n2. Then we collect terms.') === 'delivered');

  const exec = decision('execute', { strategy: 'execute' });
  ok('execute: done, not ending on a question → delivered', M.deliveredFor(exec, 'Done: 5 miles is 8.05 km.') === 'delivered');
  ok('execute: ends on a question → not_delivered', M.deliveredFor(exec, '5 miles is 8.05 km. Do you want it in metres too?') === 'not_delivered');
  ok('execute: "let\'s think about it" redirect → not_delivered', M.deliveredFor(exec, "Let's think about how a mile relates to a kilometre first. A mile is longer.") === 'not_delivered');
  ok('execute: "what do you think" anywhere → not_delivered', M.deliveredFor(exec, 'What do you think a mile is in km. It is 1.609.') === 'not_delivered');

  const quiz = decision('preserve_challenge', { strategy: 'preserve_challenge', noRevealAnswers: true, questionBudget: { max: 1, enforcement: 'tail' } });
  ok('preserve_challenge: poses one question, no reveal → delivered', M.deliveredFor(quiz, 'Here is one: differentiate x^4. What do you get?') === 'delivered');
  ok('preserve_challenge: "the answer is" → not_delivered', M.deliveredFor(quiz, 'The answer is 4x^3. Next one?') === 'not_delivered');
  ok('preserve_challenge: two questions → partial', M.deliveredFor(quiz, 'What is the derivative of x^4? And of x^5?') === 'partial');
  ok('preserve_challenge: no question at all → partial', M.deliveredFor(quiz, 'Try differentiating x^4 next.') === 'partial');
  const quiz0 = decision('preserve_challenge', { noRevealAnswers: true, questionBudget: { max: 0, enforcement: 'hard' } });
  ok('preserve_challenge keeps its one question even beside a zero budget (no_questions is not also tested)', M.deliveredFor(quiz0, 'Differentiate x^4. What do you get?') === 'delivered' && J(M.deliveryChecks(quiz0, 'x').map((c) => c.test)) === J(['preserve_challenge']));

  const edit = decision('task_specific', { strategy: 'edit_as_asked' });
  ok('edit_as_asked: targeted fixes → delivered', M.deliveredFor(edit, 'Three fixes: "their" → "there" in line 2; a missing comma after "However"; "it\'s" → "its".') === 'delivered');
  ok('edit_as_asked: "here\'s a rewrite" → not_delivered', M.deliveredFor(edit, "Here's a rewrite of your essay that flows better: …") === 'not_delivered');
  ok('edit_as_asked: "rewritten version" → not_delivered', M.deliveredFor(edit, 'Below is a rewritten version with stronger verbs.') === 'not_delivered');

  const verify = decision('verify', { verification: 'explicit' });
  ok('verify: says what was checked and what was not → delivered', M.deliveredFor(verify, 'I checked the arithmetic: 12 × 7 = 84. The population figure is unverified.') === 'delivered');
  ok('verify: just restates → not_delivered', M.deliveredFor(verify, 'Yes, it is 84 and the population is 2 million.') === 'not_delivered');

  ok('none → unknown (no structural test)', M.deliveredFor(decision('none'), PROSE) === 'unknown');
  ok('simplify → unknown (simpler is not a structural fact)', M.deliveredFor(decision('simplify', { simplify: true }), PROSE) === 'unknown');
  ok('an empty reply fails every test that applies', M.deliveredFor(q0, '   ') === 'not_delivered' && M.deliveredFor(decision('none'), '') === 'unknown');
  const combo = decision('direct', { answerFirst: true, questionBudget: { max: 0, enforcement: 'hard' } });
  ok('two tests, one passed → partial', M.deliveredFor(combo, 'x = 4. Does it work for x = 5 too?') === 'partial');
  const checks = M.deliveryChecks(combo, 'x = 4. Does it work for x = 5 too?');
  ok('deliveryChecks names each test and its result', J(checks) === J([{ test: 'no_questions', result: 'fail' }, { test: 'answer_first', result: 'pass' }]), J(checks));
}

console.log('\n=== taskCompletion and friction ===');
{
  const d = decision('fewer_questions', { questionBudget: { max: 0, enforcement: 'hard' } }, ['questions=0'], 1);
  const good = outcome(d, [u('how do I solve 2x + 3 = 11'), a(ASKING), u('just tell me'), a(PROSE), u('makes sense, so x is 4')]);
  ok('taskCompletion: delivered, observed, ref to the reply (assistant at the decision\'s turn)', good.taskCompletion.value === 'delivered' && good.taskCompletion.provenance === 'observed' && J(good.taskCompletion.refs) === J([{ turn: 1, role: 'assistant', code: 'delivery.delivered' }]), J(good.taskCompletion));
  ok('friction: no questions, no repeats, no complaints, useful at once', J(good.friction.value) === J({ questionsAsked: 0, repeatRequests: 0, complaints: 0, turnsToUseful: 0 }) && good.friction.provenance === 'observed', J(good.friction));
  ok('outcome is read at their next turn', good.turn === 2 && good.interventionId === 'mr-test-fewer_questions');

  const bad = outcome(d, [u('how do I solve 2x + 3 = 11'), a(ASKING), u('just tell me'), a(ASKING + ' Think about what isolates x.'), u("ugh, that's too long and I'm still confused")]);
  ok('taskCompletion: not_delivered when the reply kept asking', bad.taskCompletion.value === 'not_delivered');
  ok('friction: questionsAsked = questionLoad(reply)', bad.friction.value.questionsAsked === 2, J(bad.friction.value));
  ok('friction: complaints counts their words (too long, confused, frustration) = 3', bad.friction.value.complaints === 3, J(bad.friction));
  ok('friction: turnsToUseful 1 when not delivered', bad.friction.value.turnsToUseful === 1);
  ok('friction refs: the reply\'s count, then each complaint at the next turn', J(bad.friction.refs) === J([
    { turn: 1, role: 'assistant', code: 'questions.2' }, { turn: 2, role: 'user', code: 'explicit.shorter' }, { turn: 2, role: 'user', code: 'explicit.frustration' }, { turn: 2, role: 'user', code: 'explicit.confused' },
  ]), J(bad.friction.refs));

  const rep = outcome(decision('direct', { answerFirst: true }, [], 1), [u('how do I convert a csv file to json in python'), a('Sure.'), u('how do I convert a csv file to json in python, step by step'), a('First, think about the structure of a csv file?'), u('how do I convert csv to json with python')]);
  ok('friction: a repeated request at the next turn is counted', rep.friction.value.repeatRequests === 1 && rep.friction.refs.some((r) => r.code === 'observed.repeated_request'), J(rep.friction));
  ok('partial / unknown delivery → turnsToUseful null', outcome(decision('simplify', { simplify: true }), [u('explain'), a(PROSE), u('next')]).friction.value.turnsToUseful === null);

  const noReply = M.evaluateOutcome({ decision: d, reply: null, next: null, nextObservations: [], params });
  ok('no reply → taskCompletion and friction unknown, with a reason', noReply.taskCompletion.value === 'unknown' && noReply.taskCompletion.note === 'no_reply' && noReply.friction.value === 'unknown' && noReply.friction.provenance === 'none');
  const noNext = M.evaluateOutcome({ decision: d, reply: PROSE, next: null, nextObservations: [], params });
  ok('no next turn yet → friction unknown (zero complaints is not observed yet), regulation inconclusive', noNext.friction.value === 'unknown' && noNext.friction.note === 'no_next_turn' && noNext.regulation === 'inconclusive' && noNext.turn === 1, J(noNext));
}

console.log('\n=== satisfaction: their stated reaction, and only that ===');
{
  const d = decision('direct', { answerFirst: true }, [], 1);
  const base = [u('what is a limit'), a(ASKING), u('just tell me')];
  const pos = outcome(d, [...base, a(PROSE), u('thanks, that helped')]);
  ok('"thanks, that helped" → positive, explicit, note satisfaction_is_not_learning', pos.satisfaction.value === 'positive' && pos.satisfaction.provenance === 'explicit' && pos.satisfaction.note === 'satisfaction_is_not_learning' && J(pos.satisfaction.refs) === J([{ turn: 2, role: 'user', code: 'explicit.positive' }]), J(pos.satisfaction));
  const neg = outcome(d, [...base, a(PROSE), u("that's not helpful")]);
  ok('"that\'s not helpful" → negative, explicit', neg.satisfaction.value === 'negative' && neg.satisfaction.provenance === 'explicit');
  const none = outcome(d, [...base, a(PROSE), u('what about one-sided limits')]);
  ok('no word either way → unknown, not "neutral" (silence is not a reaction)', none.satisfaction.value === 'unknown' && none.satisfaction.note === 'no_stated_reaction', J(none.satisfaction));
  const ok_ = outcome(d, [...base, a(PROSE), u('ok')]);
  ok('"ok" is a weak hypothesis, not satisfaction', ok_.satisfaction.value === 'unknown');
}

console.log('\n=== independent performance: only where the answer was kept back ===');
{
  const quiz = decision('preserve_challenge', { strategy: 'preserve_challenge', noRevealAnswers: true }, [], 1);
  const convo = [u('quiz me on derivatives'), a('Differentiate x^2. What do you get?'), u('2x'), a('Right. Now differentiate x^4. What do you get?'), u('4x^3')];
  const right = outcome(quiz, convo, [{ status: 'verified' }]);
  ok('kept back + the engine verified their next attempt → verified_correct, observed', right.independentPerformance.value === 'verified_correct' && right.independentPerformance.provenance === 'observed' && J(right.independentPerformance.refs) === J([{ turn: 2, role: 'user', code: 'observed.verified_correct' }]), J(right.independentPerformance));
  ok('...always noted as a single observation, not a capability', right.independentPerformance.note === 'single_observation_not_capability');
  const wrong = outcome(quiz, convo, [{ status: 'refuted' }]);
  ok('kept back + refuted → verified_incorrect', wrong.independentPerformance.value === 'verified_incorrect' && wrong.independentPerformance.note === 'single_observation_not_capability');
  ok('guided_discovery keeps the answer back too', outcome(decision('guided_discovery', { strategy: 'guided' }, [], 1), convo, [{ status: 'verified' }]).independentPerformance.value === 'verified_correct');
  const told = outcome(decision('direct', { answerFirst: true }, [], 1), convo, [{ status: 'verified' }]);
  ok('the answer was given (direct) → unknown, answer_may_have_been_given — even with a verified attempt', told.independentPerformance.value === 'unknown' && told.independentPerformance.note === 'answer_may_have_been_given' && told.independentPerformance.provenance === 'none', J(told.independentPerformance));
  const leaked = outcome(quiz, [u('quiz me on derivatives'), a('Differentiate x^2.'), u('2x'), a('The answer is 4x^3. What do you get?'), u('4x^3')], [{ status: 'verified' }]);
  ok('kept back on paper, but the reply said "the answer is" → unknown, answer_may_have_been_given', leaked.independentPerformance.value === 'unknown' && leaked.independentPerformance.note === 'answer_may_have_been_given');
  ok('no decided attempt → unknown', outcome(quiz, convo).independentPerformance.value === 'unknown' && outcome(quiz, convo).independentPerformance.note === 'no_decided_attempt');
  ok('one right and one wrong claim → unknown (mixed), not a score', outcome(quiz, convo, [{ status: 'verified' }, { status: 'refuted' }]).independentPerformance.note === 'mixed_verdicts');
}

console.log('\n=== retention and autonomy cannot be measured in one conversation ===');
{
  const o = outcome(decision('direct', { answerFirst: true }, [], 1), [u('a'), a(ASKING), u('just tell me'), a(PROSE), u('thanks, that helped')]);
  ok('retention: unknown, needs_delayed_independent_check', o.retention.value === 'unknown' && o.retention.provenance === 'none' && o.retention.note === 'needs_delayed_independent_check' && o.retention.refs.length === 0);
  ok('autonomy: unknown, needs_study_instrument', o.autonomy.value === 'unknown' && o.autonomy.provenance === 'none' && o.autonomy.note === 'needs_study_instrument');
  ok('every OUTCOME_DIMENSION is present, and there is no total score', M.OUTCOME_DIMENSIONS.every((k) => o[k] && 'value' in o[k]) && !('score' in o) && !('total' in o));
}

console.log('\n=== regulation: keep, revert, inconclusive ===');
{
  const q0 = decision('fewer_questions', { questionBudget: { max: 0, enforcement: 'hard' } }, ['questions=0'], 1);
  const base = [u('how do I solve 2x + 3 = 11'), a(ASKING), u('just tell me')];
  ok('delivered, nothing said against it → keep', outcome(q0, [...base, a(PROSE), u('makes sense, so x is 4')]).regulation === 'keep');
  ok('delivered but a complaint → inconclusive', outcome(q0, [...base, a(PROSE), u("that's too long")]).regulation === 'inconclusive');
  ok('delivered but asked again → inconclusive', outcome(decision('direct', { answerFirst: true }, [], 1), [u('how do I convert a csv file to json in python'), a('Sure.'), u('how do I convert a csv file to json in python quickly'), a('Use pandas: read_csv then to_json.'), u('how do I convert csv to json with python')]).regulation === 'inconclusive');
  ok('not delivered → revert', outcome(q0, [...base, a(ASKING), u('next')]).regulation === 'revert');
  ok('their revocation → revert', outcome(q0, [u('stop asking me questions'), a(PROSE), u('hm'), a(PROSE), u('you can ask me questions again')]).regulation === 'revert');
  ok('a revocation alone (no other contradiction, delivered reply) → revert', outcome(decision('shorter', { verbosity: { ceilingTokens: 200 } }, [], 1), [u('explain entropy'), a(PROSE), u('shorter'), a(PROSE), u('go back to how you were')]).regulation === 'revert');
  ok('their "not helpful" → revert', outcome(q0, [...base, a(PROSE), u("that's not helpful")]).regulation === 'revert');
  ok('wants questions after a question-lowering decision → revert', outcome(q0, [...base, a(PROSE), u('quiz me on this')]).regulation === 'revert');
  const sh = decision('shorter', { verbosity: { ceilingTokens: 200 } }, [], 1);
  ok('"more detail" after shorter → revert', outcome(sh, [u('explain entropy'), a(PROSE), u('shorter'), a(PROSE), u('can you go into more detail')]).regulation === 'revert');
  const pc = decision('preserve_challenge', { strategy: 'preserve_challenge', noRevealAnswers: true }, [], 1);
  ok('"just tell me" after preserve_challenge → revert', outcome(pc, [u('quiz me'), a('What is 7 × 8?'), u('56'), a('Good. What is 7 × 9?'), u('just tell me the answer')]).regulation === 'revert');
  ok('"stop asking" after preserve_challenge → revert', outcome(pc, [u('quiz me'), a('What is 7 × 8?'), u('56'), a('Good. What is 7 × 9?'), u('stop asking me questions')]).regulation === 'revert');
  ok('contradictingPreference names the code', M.contradictingPreference(q0, new Set(['explicit.wants_questions'])) === 'explicit.wants_questions' && M.contradictingPreference(q0, new Set(['explicit.longer'])) === null && M.contradictingPreference(sh, new Set(['explicit.longer'])) === 'explicit.longer');
  ok('no next turn → inconclusive', M.evaluateOutcome({ decision: q0, reply: PROSE, next: null, nextObservations: [], params }).regulation === 'inconclusive');

  // regulationCause: their words (revoke the decision) vs the outcome (roll it back)
  const cause = (d, msgs) => {
    const turns = M.turnsOf(msgs);
    const k = turns.length - 1;
    return M.regulationCause({ decision: d, reply: turns[k - 1].reply, next: turns[k], nextObservations: M.observeTurn(turns, k, { params }), params });
  };
  ok('regulationCause: their revocation → explicit.revoke', cause(sh, [u('explain entropy'), a(PROSE), u('shorter'), a(PROSE), u('go back to how you were')]) === 'explicit.revoke');
  ok('regulationCause: a contradicting preference names it (direct_answer after a quiz)', cause(pc, [u('quiz me'), a('What is 7 × 8?'), u('56'), a('Good. What is 7 × 9?'), u('just tell me the answer')]) === 'explicit.direct_answer');
  ok('regulationCause: a failed delivery → delivery.not_delivered', cause(q0, [...base, a(ASKING), u('next')]) === 'delivery.not_delivered');
  ok('regulationCause: keep → delivery.delivered; inconclusive → null', cause(q0, [...base, a(PROSE), u('makes sense, so x is 4')]) === 'delivery.delivered' && cause(q0, [...base, a(PROSE), u("that's too long")]) === null);
}

console.log('\n=== the proxy guard: satisfaction alone never keeps a decision ===');
{
  const simp = decision('simplify', { simplify: true }, [], 1);
  const thanks = outcome(simp, [u('explain entropy'), a(PROSE), u('simpler please'), a(PROSE), u('perfect, thanks! that helped')]);
  ok('no structural test + "that helped" → satisfaction positive, regulation inconclusive (not keep)', thanks.satisfaction.value === 'positive' && thanks.taskCompletion.value === 'unknown' && thanks.regulation === 'inconclusive', J(thanks));
  const steps = decision('direct', { answerFirst: true }, ['steps_delivered'], 1);
  const partial = outcome(steps, [u('how do I solve 2x + 3 = 11'), a(ASKING), u('just show me the steps'), a(PROSE), u('thanks, that helped')]);
  ok('partial delivery + "that helped" → inconclusive', partial.taskCompletion.value === 'partial' && partial.satisfaction.value === 'positive' && partial.regulation === 'inconclusive', J(partial));
  const failed = outcome(steps, [u('how do I solve 2x + 3 = 11'), a(ASKING), u('just show me the steps'), a(ASKING), u('thanks, that helped')]);
  ok('a failed delivery + "that helped" → still revert', failed.regulation === 'revert');

  // Exhaustively: adding (or removing) a positive reaction never changes regulation.
  const decisions = [simp, steps, decision('fewer_questions', { questionBudget: { max: 0, enforcement: 'hard' } }, [], 1), decision('shorter', { verbosity: { ceilingTokens: 200 } }, [], 1), decision('none', {}, [], 1), decision('preserve_challenge', { noRevealAnswers: true }, [], 1)];
  const replies = [PROSE, STEPS, ASKING, '', 'Here is one: what is 7 × 8?'];
  const positive = { code: 'explicit.positive', provenance: 'explicit', strength: 'moderate', turn: 2, refs: [{ turn: 2, role: 'user', code: 'explicit.positive' }], confidence: 0.5 };
  const next = M.turnsOf([u('a'), a('b'), u('c'), a('d'), u('thanks')])[2];
  let same = true, keptByThanks = false;
  for (const d of decisions)
    for (const reply of replies) {
      const without = M.evaluateOutcome({ decision: d, reply, next, nextObservations: [], params });
      const withIt = M.evaluateOutcome({ decision: d, reply, next, nextObservations: [positive], params });
      if (without.regulation !== withIt.regulation) same = false;
      if (withIt.regulation === 'keep' && withIt.taskCompletion.value !== 'delivered') keptByThanks = true;
    }
  ok('over 6 decisions × 5 replies, a positive reaction never changes regulation', same);
  ok('...and nothing is ever kept without a structurally delivered reply', !keptByThanks);
}

// ── review: readings that were wrong before it ──────────────────────
console.log('\n=== review: a quiz reply that confirms their attempt has not given the next answer away ===');
{
  const quiz = decision('preserve_challenge', { strategy: 'preserve_challenge', noRevealAnswers: true, questionBudget: { max: 1, enforcement: 'tail' } });
  ok('"Right, the answer is 56. Now, what is 7 × 9?" → delivered (it confirmed theirs and kept the next one)', M.deliveredFor(quiz, 'Right, the answer is 56. Now, what is 7 × 9?') === 'delivered');
  ok('"Correct! The answer is 56. What is 7 × 9?" → delivered', M.deliveredFor(quiz, 'Correct! The answer is 56. What is 7 × 9?') === 'delivered');
  ok('"Not quite — the answer is 63." → not_delivered (it gave the open one away)', M.deliveredFor(quiz, 'Not quite — the answer is 63.') === 'not_delivered');
  ok('"Good try, but the answer is 63. What is 7 × 8?" → not_delivered ("good try" is not a confirmation)', M.deliveredFor(quiz, 'Good try, but the answer is 63. What is 7 × 8?') === 'not_delivered');
  ok('"Not quite, the answer isn\'t 54. What is 7 × 8 again?" → delivered (saying what it is NOT gives nothing away)', M.deliveredFor(quiz, "Not quite, the answer isn't 54. What is 7 × 8 again?") === 'delivered');
  ok('revealsAnswer is the same rule', M.revealsAnswer('The answer is 4x^3.') && !M.revealsAnswer('Yes, the answer is 56. Next: what is 7 × 9?'));

  const pc = decision('preserve_challenge', { strategy: 'preserve_challenge', noRevealAnswers: true }, [], 1);
  const conf = outcome(pc, [u('quiz me'), a('What is 7 × 8?'), u('56'), a('Right, the answer is 56. Now, what is 7 × 9?'), u('63')], [{ status: 'verified' }]);
  ok('...and their next attempt after it is independent performance (verified_correct)', conf.independentPerformance.value === 'verified_correct', J(conf.independentPerformance));
}

console.log('\n=== review: copying back what the reply stated is not an independent attempt ===');
{
  const gd = decision('guided_discovery', { strategy: 'guided' }, [], 1);
  const copied = outcome(gd, [u('solve 2x + 3 = 11'), a('What could you do first?'), u('hint?'), a('Subtract 3 from both sides, then divide by 2, so x = 4. What do you get?'), u('x = 4')], [{ status: 'verified' }]);
  ok('a guided reply that said "so x = 4", then their "x = 4" → unknown, answer_may_have_been_given', copied.independentPerformance.value === 'unknown' && copied.independentPerformance.note === 'answer_may_have_been_given', J(copied.independentPerformance));
  const own = outcome(gd, [u('solve 2x + 3 = 11'), a('What could you do first?'), u('hint?'), a('Subtract 3 from both sides first. What does that leave?'), u('x = 4')], [{ status: 'verified' }]);
  ok('...the same attempt after a reply that did not state it → verified_correct', own.independentPerformance.value === 'verified_correct', J(own.independentPerformance));
  ok('attemptStatedIn: an equation, a result after "is", but not a number that merely appears', M.attemptStatedIn('so x = 4.', 'x = 4') && M.attemptStatedIn('The derivative is 4x^3.', '4x^3') && !M.attemptStatedIn('What is 7 × 8?', '56') && !M.attemptStatedIn('Differentiate x^3.', '3') && !M.attemptStatedIn('so x = 4.', 'I think it is four because the sides balance'));
}

console.log('\n=== review: structural tests that misread ordinary replies ===');
{
  const steps = decision('direct', { answerFirst: true, questionBudget: { max: 0, enforcement: 'tail' } }, ['steps_delivered']);
  ok('markdown "### Step 1" headers are steps', M.deliveredFor(steps, '### Step 1: Subtract 3\nYou get 2x = 8.\n### Step 2: Divide by 2\nx = 4.') === 'delivered');
  ok('"**1.** …" bold numbers are steps', M.deliveredFor(steps, 'x = 4.\n**1.** Subtract 3 from both sides.\n**2.** Divide by 2.') === 'delivered');
  const exec = decision('execute', { strategy: 'execute', questionBudget: { max: 0, enforcement: 'tail' } }, ['executed', 'questions=0']);
  ok('execute: done, then a closing offer → delivered (an offer hands nothing back)', M.deliveredFor(exec, '5 miles is 8.05 km. Want me to show the working?') === 'delivered');
  ok('execute: done, then a real question → still not fully delivered', M.deliveredFor(exec, '5 miles is 8.05 km. Do you want it in metres too?') !== 'delivered');
  ok("the policy's own expect names map to the same tests", J(M.deliveryChecks(decision('none', {}, ['says_what_was_checked']), 'x').map((c) => c.test)) === J(['verify']) && J(M.deliveryChecks(decision('none', {}, ['edits_only']), 'x').map((c) => c.test)) === J(['edit_as_asked']) && J(M.deliveryChecks(decision('none', {}, ['asks_one', 'no_reveal']), 'x').map((c) => c.test)) === J(['preserve_challenge']));
}

console.log('\n=== review: a revocation takes back only what it names ===');
{
  const sh = decision('shorter', { verbosity: { ceilingTokens: 200 } }, [], 1);
  const msgs = [u('stop asking me questions'), a(PROSE), u('explain entropy'), a(PROSE), u('ok, you can ask me questions again')];
  const o = outcome(sh, msgs);
  ok('"you can ask me questions again" does not revert a "shorter" decision (it took back the stop)', o.regulation === 'keep', J(o));
  const q0 = decision('fewer_questions', { questionBudget: { max: 0, enforcement: 'hard' } }, ['questions=0'], 1);
  ok('...it does revert a question-lowering one', outcome(q0, msgs).regulation === 'revert');
  ok('"go back to how you were" reverts anything', outcome(sh, [u('explain entropy'), a(PROSE), u('shorter'), a(PROSE), u('go back to how you were')]).regulation === 'revert');
  const bare = { code: 'explicit.revoke', provenance: 'explicit', strength: 'strong', turn: 2, refs: [{ turn: 2, role: 'user', code: 'explicit.revoke' }], confidence: 0.9 };
  const next = M.turnsOf([u('a'), a('b'), u('c'), a('d'), u('e')])[2];
  ok('a revocation with no scope ref (not read by IFR) is read as everything', M.evaluateOutcome({ decision: sh, reply: PROSE, next, nextObservations: [bare], params }).regulation === 'revert');

  const pc = decision('preserve_challenge', { strategy: 'preserve_challenge', noRevealAnswers: true }, [], 1);
  const turns = M.turnsOf([u('quiz me'), a('What is 7 × 8?'), u('56'), a('Good. What is 7 × 9?'), u('show me the steps')]);
  const obs = M.observeTurn(turns, 2, { params });
  const i = { decision: pc, reply: turns[1].reply, next: turns[2], nextObservations: obs, params };
  ok('"show me the steps" after a quiz → revert, cause explicit.show_steps (it asks for the solution)', M.evaluateOutcome(i).regulation === 'revert' && M.regulationCause(i) === 'explicit.show_steps', `${M.evaluateOutcome(i).regulation} ${M.regulationCause(i)}`);
}

console.log('\n=== review: no next turn, and a reply that failed every test ===');
{
  const q0 = decision('fewer_questions', { questionBudget: { max: 0, enforcement: 'hard' } }, ['questions=0'], 1);
  const o = M.evaluateOutcome({ decision: q0, reply: ASKING, next: null, nextObservations: [], params });
  ok('no next turn but the reply asked → revert (no reaction needed to see it), friction still unknown', o.regulation === 'revert' && o.friction.value === 'unknown' && o.satisfaction.value === 'unknown', J(o));
}

console.log('\n=== content-free and deterministic ===');
{
  const d = decision('fewer_questions', { questionBudget: { max: 0, enforcement: 'hard' } }, ['questions=0'], 1);
  const msgs = [u('how do I solve 2x + 3 = 11 for my homework'), a(ASKING), u('just tell me'), a(PROSE), u("ugh, that's too long, thanks anyway")];
  const one = outcome(d, msgs, [{ status: 'verified' }]);
  const two = outcome(d, msgs, [{ status: 'verified' }]);
  ok('same input twice → deep-equal outcome', J(one) === J(two));
  const text = J(one).toLowerCase();
  ok('no word of the conversation in the outcome', !['homework', 'subtract', 'ugh', 'thanks', 'anyway', 'isolate'].some((w) => text.includes(w)), text.slice(0, 300));
  const refs = M.OUTCOME_DIMENSIONS.flatMap((k) => one[k].refs);
  ok('refs are {turn, role, code} with code-shaped codes', refs.every((r) => J(Object.keys(r).sort()) === J(['code', 'role', 'turn']) && /^[a-z_]+(?:\.[a-z0-9_]+)+$/.test(r.code)), J(refs));
}

console.log(`\nmr-outcome: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
