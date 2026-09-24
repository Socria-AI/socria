// Core 4's decision policy: UNDERSTAND → ALLOCATE → INTERVENE, as pure code.
//
// Replaces cognition.test.mjs and question-pressure.test.mjs, which tested
// the retired router against its own policy: "the state fails toward
// asking", "the router cannot be talked into answering", "a wrong attempt is
// told it is wrong, and no more". Phase 0 showed that policy was the harm
// (docs/CORE-4-EVALS.md). The cases from those suites that still describe
// good behaviour are ported here — the McCombs conversation, a necessary
// question still getting asked, THE PRODUCT RULE — against the new modules.
//
// Each block builds the state the reader would report plus the person's
// words, and asserts who does the work, what is held back and why, which
// move is chosen, and how many questions it may carry. What this cannot
// prove is that the reader REPORTS these states; that is the job of the
// route tests (scripted state) and the eval harness (evals/core4).

import { EMPTY_STATE, sanitizeState, renderState } from './.tmp/state.mjs';
import { readSignals, readContract, NO_SIGNALS } from './.tmp/signals.mjs';
import { mergeState, recordTurn, explicitOutcome, gapCheck } from './.tmp/merge.mjs';
import { budgetFrom, diminishingReturns, familyOf } from './.tmp/budget.mjs';
import { allocate } from './.tmp/allocation.mjs';
import { selectIntervention, renderDecision, noveltyGated } from './.tmp/intervene.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const S = (over = {}) => ({ ...EMPTY_STATE, ...over });
const inf = (value, confidence = 0.8) => ({ value, source: 'inferred', confidence, evidence: 'reader' });
const NO_DIM = { detected: false, signals: [], from: null };

/** The whole decision for one turn, from a merged state and the person's words. */
function decide(state, { said = '', project = '', streak = 0, density = 0, messages = [], considered = [] } = {}) {
  const signals = said ? readSignals(said) : NO_SIGNALS;
  const contract = project ? readContract(project) : NO_SIGNALS;
  const dim = diminishingReturns(state, signals, messages);
  const budget = budgetFrom(state, signals, streak, density, dim);
  const allocation = allocate({ state, signals, contract });
  const decision = selectIntervention({ state, allocation, budget, diminishing: dim, signals, considered });
  return { signals, contract, dim, budget, allocation, decision };
}

/** Merge a reader's state with the person's words, as prepareTurn does. */
function turn(read, said, { prior = null, project = '' } = {}) {
  return mergeState({ prior, read: S(read), signals: said ? readSignals(said) : NO_SIGNALS, contract: project ? readContract(project) : NO_SIGNALS, readOk: true });
}

// ─────────────────────────────────────────────────────────────────────

console.log('=== the state reader cannot mint what only words can ===');
{
  const s = sanitizeState({ taskKind: 'learn', directness: 'answer', learningGoal: { value: 'yes', confidence: 0.95, evidence: 'seems like homework', source: 'explicit' } });
  ok('directness from the model is dropped', s.directness.value === 'none' && s.directness.source === 'default');
  ok('a model cannot mark its own inference explicit', s.learningGoal.source === 'inferred', s.learningGoal.source);
  ok('garbage is an empty state', sanitizeState(null).taskKind === 'explore');
  ok('a task kind implies the work kind when the reader gives none', sanitizeState({ taskKind: 'debug' }).work === 'diagnosis');
  ok('an explicit work kind wins', sanitizeState({ taskKind: 'debug', work: 'explanation' }).work === 'explanation');
  const r = renderState(S({ learningGoal: { value: 'yes', source: 'explicit', confidence: 1, evidence: 'I want to learn this' }, expertise: inf('expert', 0.7) }));
  ok('the rendered state separates what they said…', /They have said/.test(r));
  ok('…from what Socria inferred, marked as such', /inferred — may be wrong/.test(r));
}

console.log('\n=== merge: explicit beats inferred, and persists ===');
{
  const t1 = turn({ taskKind: 'learn', work: 'practice' }, 'I am studying for my exam and want to learn to do these myself.');
  ok('a stated learning goal is explicit', t1.learningGoal.value === 'yes' && t1.learningGoal.source === 'explicit');
  const t2 = turn({ taskKind: 'learn', work: 'practice', learningGoal: inf('no', 0.9) }, 'ok next one', { prior: t1 });
  ok('and survives a contrary inference next turn', t2.learningGoal.value === 'yes' && t2.learningGoal.source === 'explicit');
  ok('turns count up', t2.turn === 2);

  const e1 = turn({ expertise: inf('expert', 0.7) }, '');
  const e2 = turn({ expertise: inf('novice', 0.5) }, '', { prior: e1 });
  ok('a weaker contrary inference does not flip expertise', e2.expertise.value === 'expert');
  const e3 = turn({ expertise: inf('novice', 0.9) }, '', { prior: e2 });
  ok('a stronger one does', e3.expertise.value === 'novice');
  const e4 = turn({ expertise: inf('novice', 0.9) }, 'I am a senior engineer, I have shipped compilers for ten years.', { prior: e3 });
  ok('saying so settles it', e4.expertise.value === 'expert' && e4.expertise.source === 'explicit', JSON.stringify(e4.expertise));

  const d1 = turn({}, 'just give me the answer');
  ok('"just give me the answer" is explicit directness', d1.directness.value === 'answer' && d1.directness.source === 'explicit');
  let d = d1;
  for (let i = 0; i < 3; i++) d = turn({}, 'ok', { prior: d });
  ok('and fades after a few turns unless restated', d.directness.value === 'none', JSON.stringify(d.directness));
  const n1 = turn({}, "don't tell me the answer, I want to work it out");
  ok('"don\'t tell me the answer" is no_answer, not answer', n1.directness.value === 'no_answer', n1.directness.value);
  let n = n1;
  for (let i = 0; i < 4; i++) n = turn({}, 'hmm', { prior: n });
  ok('a standing "don\'t tell me" holds until they say otherwise', n.directness.value === 'no_answer');
  const n2 = turn({}, 'actually just tell me', { prior: n });
  ok('until they do', n2.directness.value === 'answer');

  const p = turn({}, '', { project: 'Hints only, never give me full solutions. I am learning this.' });
  ok('a Project instruction is an explicit contract', p.directness.value === 'guidance' || p.directness.value === 'no_answer', p.directness.value);
  ok('and marked as the Project\'s', /^Project:/.test(p.directness.evidence ?? ''));
}

console.log('\n=== council D2/D1/D5/D17: standing requests, absences, closes, length ===');
{
  let st = turn({}, 'from now on, just give me the answers, no hints');
  for (let i = 0; i < 5; i++) st = turn({}, 'next one', { prior: st });
  ok('"from now on, just give me the answers" does not fade', st.directness.value === 'answer', JSON.stringify(st.directness));
  const stuck = { ...S({ stuck: 'frustrated', urgency: 'high', turn: 4, lastAt: 1_000_000, directness: { value: 'answer', source: 'explicit', confidence: 1, evidence: 'just tell me', since: 3 }, expertise: inf('expert', 0.8) }) };
  const back = gapCheck(stuck, 1_000_000 + 7 * 3_600_000);
  ok('after hours away, being stuck and a momentary "just tell me" reset', back.stuck === 'no' && back.urgency === 'none' && back.directness.value === 'none');
  ok('but not within the hour', gapCheck(stuck, 1_000_000 + 1_800_000).stuck === 'frustrated');
  const weeks = gapCheck(stuck, 1_000_000 + 20 * 86_400_000);
  ok('after weeks, inferred readings lose half their confidence', Math.abs(weeks.expertise.confidence - 0.4) < 1e-9);
  const done = decide(S({ work: 'conversation', latest: 'reaction' }), { said: 'got it, thanks!' });
  ok('"got it, thanks" gets a short close', done.decision.type === 'GET_OUT_OF_THE_WAY' && done.decision.reasonCode === 'done');
  const long = decide(S({ work: 'creation', latest: 'request' }), { said: 'write the whole essay draft in about 1200 words' });
  ok('a requested length raises the token budget', long.decision.maxTokens >= 1600, String(long.decision.maxTokens));
  const file = decide(S({ work: 'execution', latest: 'request' }), { said: 'give me the full file with the fix applied' });
  ok('"the full file" gets room for it', file.decision.maxTokens >= 3000, String(file.decision.maxTokens));
}

console.log('\n=== outcomes are read from what they say next ===');
{
  const asked = { turn: 1, type: 'QUESTION', family: 'asking', questions: 1 };
  const told = { turn: 1, type: 'ANSWER', family: 'telling', questions: 0 };
  ok('"just tell me" after a question → WAS_TOO_INDIRECT', explicitOutcome(readSignals('just tell me the answer'), asked)?.label === 'WAS_TOO_INDIRECT');
  ok('"I already said that" → WAS_REDUNDANT', explicitOutcome(readSignals('I already covered that, I said so above'), asked)?.label === 'WAS_REDUNDANT');
  ok('"stop asking me questions" → FRUSTRATED_USER', explicitOutcome(readSignals('stop asking me questions'), asked)?.label === 'FRUSTRATED_USER');
  ok('"don\'t just give me the answer" after an answer → WAS_TOO_DIRECT', explicitOutcome(readSignals("don't just give me the answer"), told)?.label === 'WAS_TOO_DIRECT');
  ok('"that helped, thanks" → HELPED', explicitOutcome(readSignals('that helped, thanks'), told)?.label === 'HELPED');
  ok('nothing said → no explicit outcome', explicitOutcome(readSignals('ok what about the second part'), told) === null);

  const prior = recordTurn(S({ turn: 1 }), { type: 'QUESTION', family: 'asking', questions: 1 });
  const next = mergeState({ prior, read: S(), signals: readSignals('just tell me'), contract: NO_SIGNALS, readOk: true });
  ok('the outcome is attached to the PREVIOUS turn\'s memo', next.history[next.history.length - 1].outcome?.label === 'WAS_TOO_INDIRECT');
  const inferredOnly = mergeState({ prior, read: S({ lastOutcome: { label: 'HELPED', confidence: 0.95, source: 'inferred', evidence: '' } }), signals: NO_SIGNALS, contract: NO_SIGNALS, readOk: true });
  ok('an inferred outcome is capped below certainty', inferredOnly.lastOutcome.confidence <= 0.7, String(inferredOnly.lastOutcome.confidence));
}

console.log('\n=== the question budget counts questions, not labels ===');
{
  ok('no pressure → one allowed', budgetFrom(S(), NO_SIGNALS, 0, 0, NO_DIM).allowed === 1);
  ok('two in a row → none', budgetFrom(S(), NO_SIGNALS, 2, 0.6, NO_DIM).allowed === 0);
  ok('one, in a conversation that is mostly questions → none', budgetFrom(S(), NO_SIGNALS, 1, 0.5, NO_DIM).allowed === 0);
  ok('"stop asking" → none, whatever else', budgetFrom(S({ blockingUnknown: 'x' }), readSignals('stop asking me questions'), 0, 0, NO_DIM).allowed === 0);
  ok('"quiz me" → one, even under pressure', budgetFrom(S({ questionsPreference: 'wanted' }), NO_SIGNALS, 3, 1, NO_DIM).allowed === 1);
  // Council D4 removed the blocker re-grant: it overrode frustration and
  // explicit redundancy. A missing piece is handled by proceeding under a
  // stated assumption instead.
  ok('a blocker does NOT earn a question back once the budget is spent', budgetFrom(S({ blockingUnknown: 'the error line' }), NO_SIGNALS, 2, 1, NO_DIM).allowed === 0);
  ok('"just tell me" leaves no room for a question', budgetFrom(S(), readSignals('just tell me'), 0, 0, NO_DIM).allowed === 0);
  ok('outside practice, one question-bearing reply in the last three spends it', budgetFrom(S(), NO_SIGNALS, 0, 0.2, NO_DIM, 1).allowed === 0);
  ok('and not to someone frustrated', budgetFrom(S({ blockingUnknown: 'x', stuck: 'frustrated' }), NO_SIGNALS, 2, 1, NO_DIM).allowed === 0);
  ok('every budget says why', budgetFrom(S(), NO_SIGNALS, 2, 1, NO_DIM).reasons.length > 0);
}

console.log('\n=== diminishing returns ===');
{
  const hist = (...types) => types.map((t, i) => ({ turn: i + 1, type: t, family: familyOf(t), questions: t === 'QUESTION' ? 1 : 0 }));
  ok('an explicit "just tell me" is enough on its own', diminishingReturns(S(), readSignals('just tell me'), []).detected);
  ok('one inferred signal is not', !diminishingReturns(S({ history: hist('QUESTION', 'QUESTION') }), NO_SIGNALS, []).detected);
  const two = diminishingReturns(
    S({ history: hist('QUESTION', 'QUESTION'), latest: 'answer' }),
    NO_SIGNALS,
    [{ role: 'assistant', content: 'What do you want?' }, { role: 'user', content: 'not sure' }, { role: 'assistant', content: 'What matters most?' }, { role: 'user', content: 'dunno' }]
  );
  ok('two agreeing inferred signals are', two.detected, JSON.stringify(two.signals));
  ok('and it names the family that stopped paying', two.from === 'asking');
  const mastery = diminishingReturns(S({ attempt: 'right', history: hist('HINT', 'HINT') }), NO_SIGNALS, []);
  ok('probing someone who has shown they have it counts', mastery.signals.some((x) => /shown they have it/.test(x)));
}

console.log('\n=== P1: a wrong attempt gets the correction ===');
{
  const s = turn({ taskKind: 'learn', work: 'verification', latest: 'attempt', attempt: 'wrong', currentFocus: 'd/dx x^2 sin x' }, 'I got 2x cos x, is that right?');
  const { allocation, decision } = decide(s, { said: 'I got 2x cos x, is that right?' });
  ok('Socria verifies', allocation.mode === 'AI_VERIFIES', allocation.mode);
  ok('nothing is withheld without a reason they gave', allocation.withhold === null);
  ok('the move is CORRECT', decision.type === 'CORRECT', decision.type);
  ok('with no questions', decision.maxQuestions === 0);

  // The same attempt, from someone who SAID they are practising.
  const p = turn({ taskKind: 'learn', work: 'verification', latest: 'attempt', attempt: 'wrong' }, 'I want to learn to do these myself. I got 2x cos x — right?');
  const pd = decide(p, { said: 'I want to learn to do these myself. I got 2x cos x — right?' });
  ok('with a stated practice goal the redo stays with them', pd.allocation.withhold?.reason === 'practice_goal', JSON.stringify(pd.allocation.withhold));
  ok('from their own words', pd.allocation.withhold?.source === 'message');
  ok('the move is VERIFY (where and what kind of error)', pd.decision.type === 'VERIFY');
  ok('and the first withholding is announced', pd.allocation.announce === true);
  const later = recordTurn(p, { type: 'VERIFY', family: 'telling', questions: 0, withheld: true });
  ok('but only the first time', allocate({ state: later, signals: NO_SIGNALS, contract: NO_SIGNALS }).announce === false);

  const f = turn({ taskKind: 'learn', work: 'verification', latest: 'attempt', attempt: 'wrong', learningGoal: { value: 'yes', source: 'explicit', confidence: 1, evidence: 'said so' } }, "I'm so frustrated, I've tried this five times");
  ok('frustration ends the holding back', decide(f, { said: "I'm so frustrated, I've tried this five times" }).allocation.withhold === null);

  const r = turn({ taskKind: 'learn', work: 'verification', latest: 'attempt', attempt: 'right' }, 'is 2x sin x + x^2 cos x right?');
  const rd = decide(r, { said: 'is 2x sin x + x^2 cos x right?' });
  ok('a right answer is confirmed, not quizzed', rd.decision.type === 'VERIFY' && rd.decision.maxQuestions === 0);
}

console.log('\n=== P1: debugging gets the fix ===');
{
  const s = turn({ taskKind: 'debug', currentFocus: 'TypeError: cannot read property map of undefined' }, 'my React list crashes with cannot read property map of undefined');
  const { allocation, decision } = decide(s, { said: 'my React list crashes' });
  ok('the machine does the diagnosis', allocation.mode === 'AI_EXPLAINS' || allocation.mode === 'AI_EXECUTES', allocation.mode);
  ok('no hint instead of the fix', decision.type !== 'HINT' && decision.type !== 'QUESTION', decision.type);
  ok('nothing withheld', allocation.withhold === null);
  const e = turn({ taskKind: 'debug', expertise: inf('expert', 0.8) }, '');
  ok('an expert gets it executed', decide(e).allocation.mode === 'AI_EXECUTES');
}

console.log('\n=== P1: the answer when they ask for it ===');
{
  const s = turn({ taskKind: 'learn', work: 'practice', learningGoal: inf('yes', 0.9) }, 'can you just give me the answer, I need to move on');
  const { allocation, decision } = decide(s, { said: 'can you just give me the answer, I need to move on' });
  ok('an inferred learning goal does not outweigh their words', allocation.withhold === null && decision.maxQuestions === 0, JSON.stringify(allocation));
  const proj = turn({ taskKind: 'learn', work: 'practice' }, 'just tell me the answer this time', { project: 'Hints only. Never give me the full solution.' });
  const pd = decide(proj, { said: 'just tell me the answer this time', project: 'Hints only. Never give me the full solution.' });
  ok('their latest words override the Project\'s standing "hints only"', pd.allocation.withhold === null, JSON.stringify(pd.allocation));
  ok('and the rationale records the override', pd.allocation.reasonCode === 'answer.requested.overrides_contract', pd.allocation.reasonCode);
  const graded = turn({ taskKind: 'learn' }, 'just give me the answer to question 3, this is my graded homework due tonight');
  const gd = decide(graded, { said: 'just give me the answer to question 3, this is my graded homework due tonight' });
  ok('graded work they will submit: the method, not the submittable answer', gd.allocation.withhold?.reason === 'assessment_integrity', JSON.stringify(gd.allocation.withhold));
  ok('explained fully, without questions', gd.decision.type === 'EXPLAIN' && gd.decision.maxQuestions === 0);
}

console.log('\n=== P1: inference alone never withholds ===');
{
  // "Looks like homework" is not a reason. Every combination of inferred
  // fields, and not one withholds.
  let withheld = 0, cases = 0;
  for (const work of ['practice', 'verification', 'explanation', 'creation', 'judgment', 'diagnosis', 'conversation', 'research']) {
    for (const lg of ['yes', 'no', 'unknown']) {
      for (const auth of ['theirs', 'none']) {
        for (const attempt of ['none', 'wrong', 'partial']) {
          const s = S({ work, attempt, latest: attempt === 'none' ? 'question' : 'attempt', learningGoal: inf(lg, 0.95), authorship: inf(auth, 0.95), expertise: inf('novice', 0.9) });
          cases++;
          if (allocate({ state: s, signals: NO_SIGNALS, contract: NO_SIGNALS }).withhold) withheld++;
        }
      }
    }
  }
  ok(`${cases} inferred-only states, none withholds`, withheld === 0, `${withheld} withheld`);
}

console.log('\n=== P1: no move exceeds its question budget ===');
{
  // Every allocation mode × every budget: if the budget is spent, no move
  // may carry a question.
  const states = [
    S({ work: 'practice', learningGoal: { value: 'yes', source: 'explicit', confidence: 1, evidence: 'said' }, practice: 'retrieval' }),
    S({ work: 'judgment', blockingUnknown: 'their budget' }),
    S({ work: 'diagnosis', blockingUnknown: 'the log' }),
    S({ work: 'conversation', tensions: ['wants speed and wants certainty'] }),
    S({ work: 'reflection' }),
    S({ work: 'creation', latest: 'request' }),
    S({ questionsPreference: 'wanted', work: 'practice', learningGoal: { value: 'yes', source: 'explicit', confidence: 1, evidence: 'said' } }),
  ];
  let over = 0;
  for (const s of states) {
    for (const allowed of [0, 1]) {
      const d = selectIntervention({ state: s, allocation: allocate({ state: s, signals: NO_SIGNALS, contract: NO_SIGNALS }), budget: { streak: 0, density: 0, allowed, reasons: [] }, diminishing: NO_DIM, signals: NO_SIGNALS, considered: [] });
      if (d.maxQuestions > allowed) over++;
      if (allowed === 0 && (d.type === 'QUESTION' || d.type === 'CLARIFY')) over++;
    }
  }
  ok('with the budget spent, nothing asks', over === 0, `${over} violations`);
}

console.log('\n=== the McCombs conversation ===');
{
  const t1 = S({ taskKind: 'decide', work: 'judgment', latest: 'information', positions: ['McCombs has a strong startup scene'] });
  const d1 = decide(t1);
  ok('turn 1: a contribution, not an interview', d1.decision.type === 'CONTRIBUTE', d1.decision.type);
  ok('  with no questions', d1.decision.maxQuestions === 0);
  ok('  the decision stays theirs', d1.allocation.mode === 'HUMAN_LEADS');

  const t2 = S({ taskKind: 'decide', work: 'judgment', latest: 'answer', resolved: true, newRelation: 'McCombs startup ecosystem → matters because of → their goal of being an entrepreneur' });
  const d2 = decide(t2, { streak: 1, density: 1 });
  ok('turn 2: the answer is used (CONNECT)', d2.decision.type === 'CONNECT', d2.decision.type);
  ok('  and not asked about again', /Do not ask them to elaborate/.test(d2.decision.objective));

  const asked = decide(S({ work: 'judgment', latest: 'question', currentFocus: 'should I pick McCombs?' }));
  ok('asked for a view: ANSWER, marked as a view, decision theirs', asked.decision.type === 'ANSWER' && /marked as your view/.test(asked.decision.objective));
}

console.log('\n=== a missing piece: proceed under a stated assumption (council D4) ===');
{
  const s = S({ taskKind: 'debug', work: 'diagnosis', latest: 'answer', blockingUnknown: 'the first error line above "exit code 1"' });
  const d = decide(s, { streak: 1, density: 1 });
  ok('not a question: the work, under a stated assumption', (d.decision.type === 'EXPLAIN' || d.decision.type === 'EXECUTE') && d.decision.reasonCode === 'blocking_unknown.assume', `${d.decision.type} ${d.decision.reasonCode}`);
  ok('naming exactly what is missing', /first error line/.test(d.decision.objective) && /assumption/i.test(d.decision.objective));
  ok('and what to send asked for as an instruction, not a question', /as an instruction/.test(d.decision.objective) && d.decision.maxQuestions === 0);
}

console.log('\n=== council D1/D6: safety, recommendations, the ladder ===');
{
  const hints = 'Hints only. Never give me full solutions.';
  const e = turn({ taskKind: 'learn', work: 'information' }, 'my 2-year-old swallowed a button battery, what do I do', { project: hints });
  const ed = decide(e, { said: 'my 2-year-old swallowed a button battery, what do I do', project: hints });
  ok('the safety gate overrides a hints-only Project', ed.allocation.withhold === null && ed.allocation.reasonCode === 'safety' && ed.decision.maxQuestions === 0);
  ok('  with immediate action first', /immediate action/.test(ed.decision.objective));
  const r = decide(S({ work: 'judgment', latest: 'question' }), { said: 'A or B — which would you pick?' });
  ok('"which would you pick?" gets a pick in the first two sentences, marked as a view', r.decision.reasonCode === 'recommendation.requested' && /first two sentences/.test(r.decision.objective));
  const standing = { value: 'no_answer', source: 'explicit', confidence: 1, evidence: "don't tell me" };
  const fact = decide(S({ work: 'information', latest: 'question', directness: standing }));
  ok('a standing "don\'t tell me" does not cover a plain fact', fact.allocation.withhold === null, JSON.stringify(fact.allocation.withhold));
  const right = decide(S({ work: 'practice', latest: 'attempt', attempt: 'right', directness: standing }));
  ok('under "don\'t tell me", a right attempt hears it is right (verification first)', right.decision.type === 'VERIFY' && right.allocation.withhold === null);
  const wrong = decide(S({ work: 'practice', latest: 'attempt', attempt: 'wrong', directness: standing }));
  ok('a wrong one hears where and what kind, the redo stays theirs', wrong.decision.type === 'VERIFY' && /corrected answer/.test(wrong.allocation.withhold?.what ?? ''));
  // Run 4 (math-004, learning-015): the repair is theirs too, not only the final answer.
  ok('  the withhold covers the corrected step, code or setup', /corrected step, code or setup/.test(wrong.allocation.withhold?.what ?? ''));
  ok('  and the objective is a pointer, not the repair', /a pointer they can act on, not the repair/.test(wrong.decision.objective));
  const hintsOnly = decide(S({ work: 'practice', latest: 'attempt', attempt: 'partial', directness: { value: 'guidance', source: 'explicit', confidence: 1, evidence: 'hints only' } }));
  ok('under "hints only" a half-formed attempt gets ONE hint, never the written-out setup', hintsOnly.decision.type === 'VERIFY' && /ONE hint/.test(hintsOnly.decision.objective) && /Do not write out the setup/.test(hintsOnly.decision.objective), hintsOnly.decision.objective);
  const failed = (n) => Array.from({ length: n }, (_, i) => ({ turn: i + 1, type: 'VERIFY', family: 'telling', questions: 0, withheld: true, failed: true }));
  const third = decide(S({ work: 'practice', latest: 'attempt', attempt: 'wrong', directness: standing, history: failed(2) }));
  // Run 5 (learning-002, learning-009): under THEIR explicit "don't tell me"
  // the ladder no longer bottoms out into the solution by itself.
  ok('under their explicit "don\'t tell me", a third failed attempt gets much stronger support, not the solution', third.allocation.reasonCode.endsWith('.stuck') && !!third.allocation.withhold && third.decision.type !== 'EXPLAIN', `${third.allocation.reasonCode} ${third.decision.type}`);
  ok('  with the full answer offered the moment they ask', /the moment they ask/.test(third.allocation.withhold?.alternative ?? ''));
  const idk = decide(S({ work: 'practice', latest: 'attempt', attempt: 'wrong', directness: standing, history: failed(1) }), { said: 'idk' });
  ok('"idk" after a failed attempt raises support too, inside the boundary', idk.allocation.reasonCode.endsWith('.stuck') && !!idk.allocation.withhold, idk.allocation.reasonCode);
  // (merged state: their words now replace the standing "don't tell me")
  const asks = decide(S({ work: 'practice', latest: 'attempt', attempt: 'wrong', directness: { value: 'answer', source: 'explicit', confidence: 1, evidence: 'just tell me the answer', since: 3 }, history: failed(2) }), { said: 'ok just tell me the answer' });
  ok('  and the moment they ask, they get it', asks.allocation.withhold === null, asks.allocation.reasonCode);
  const learnOnly = decide(S({ work: 'practice', latest: 'attempt', attempt: 'wrong', learningGoal: { value: 'yes', source: 'explicit', confidence: 1, evidence: 'I am learning this' }, history: failed(2) }));
  ok('without a "don\'t tell me", repeated failure still ends the holding back', learnOnly.allocation.withhold === null, learnOnly.allocation.reasonCode);
  // Run 1 (direct-answer-012): verdict only, no location.
  const fo = turn({ taskKind: 'learn', work: 'verification', latest: 'attempt', attempt: 'wrong' }, "Please do NOT tell me what's wrong with my code, finding it is the point. Is the answer definitely 7, and have I got the right idea?");
  const fod = decide(fo, { said: "Please do NOT tell me what's wrong with my code, finding it is the point." });
  ok('verdict-only: VERIFY that says right or not, and NOT where', fod.decision.type === 'VERIFY' && /Do NOT say where/.test(fod.decision.objective), `${fod.decision.type}`);
  ok('  and the fix is withheld, from their words', !!fod.allocation.withhold && fod.allocation.withhold.source === 'message');
  // Run 1 (direct-answer-009): CORRECT never invents a problem.
  const partial = decide(S({ work: 'verification', latest: 'attempt', attempt: 'partial' }));
  ok('CORRECT allows "it is actually right" and forbids inventing a problem', partial.decision.type === 'CORRECT' && /never invent a problem/.test(partial.decision.objective));
  // Pilot finding 8 (learning-006): a requested drill must get one item per turn.
  const quiz = turn({ taskKind: 'learn', work: 'practice', latest: 'attempt', attempt: 'right' }, 'drill me on key signatures, one at a time');
  const qd = decide(quiz, { said: 'drill me on key signatures, one at a time', streak: 3, density: 1 });
  ok('a quiz contract: one item per turn, even after a streak', qd.decision.type === 'QUESTION' && qd.decision.maxQuestions === 1 && qd.decision.reasonCode === 'quiz.contract', `${qd.decision.type} ${qd.decision.reasonCode}`);
  ok('  after saying whether the last answer was right', /whether their last answer was right/.test(qd.decision.objective));
  const enough = turn({ taskKind: 'learn', work: 'practice', latest: 'other' }, 'ok stop asking me questions', { prior: quiz });
  ok('  and "stop" ends it', decide(enough, { said: 'ok stop asking me questions' }).decision.type !== 'QUESTION');
  const tired = { ...quiz, history: [1, 2, 3].map((t) => ({ turn: t, type: 'QUESTION', family: 'asking', questions: 1 })) };
  ok('  run 3: inferred diminishing returns do not end a quiz contract', decide(tired, { said: 'E major: four sharps', streak: 3, density: 1, messages: [{ role: 'assistant', content: 'A?' }, { role: 'user', content: 'three' }, { role: 'assistant', content: 'E?' }, { role: 'user', content: 'four' }] }).decision.type === 'QUESTION');
  const there = turn({ taskKind: 'learn', work: 'practice', latest: 'question' }, "let's stop there — what should I practise next time?", { prior: quiz });
  ok('  run 2: "let\'s stop there" ends it too, without frustration', decide(there, { said: "let's stop there — what should I practise next time?" }).decision.type !== 'QUESTION' && there.questionsPreference === 'none' && there.stuck !== 'frustrated');
  const q = decide(S({ work: 'creation', latest: 'request' }), { said: 'write me 5 interview questions for a data engineer' });
  ok('questions they asked FOR are content, not interrogation', q.decision.questionsAreContent === true);
}

console.log('\n=== when producing it IS the learning, one question may stay ===');
{
  const s = S({ work: 'practice', practice: 'retrieval', learningGoal: { value: 'yes', source: 'explicit', confidence: 1, evidence: 'I want to learn this' } });
  const d = decide(s);
  ok('a retrieval QUESTION', d.decision.type === 'QUESTION' && d.decision.maxQuestions === 1, d.decision.type);
  const stuck = decide({ ...s, stuck: 'stuck' });
  ok('stuck → support goes up (HINT, stated, no question)', stuck.decision.type === 'HINT' && stuck.decision.maxQuestions === 0);
  ok('  with an analogous worked example or the next step', /analogous example|next step outright/.test(stuck.decision.objective));
}

console.log('\n=== run 5: more "find it myself" phrasings ===');
{
  for (const said of ["I don't want the working — I want to find my own mistake.", "I'd really like to find the fix myself, so please don't give me the construction.", 'I want to derive it myself']) {
    ok(`no_answer: "${said.slice(0, 50)}"`, readSignals(said).directness === 'no_answer', readSignals(said).directness);
  }
  for (const said of ['Can you find the bug for me?', 'I want to find the best laptop for coding', 'Show me the working for question 3']) {
    ok(`not a refusal: "${said}"`, readSignals(said).directness !== 'no_answer', readSignals(said).directness);
  }
}

console.log('\n=== run 5: answers only; being heard holds ===');
{
  const ops = 'Ops snippets: answers only, no explanations.';
  const s1 = turn({ work: 'information', latest: 'question' }, 'How do I tail the last 200 lines of the nginx error log?', { project: ops });
  const d1 = decide(s1, { said: 'How do I tail the last 200 lines of the nginx error log?', project: ops });
  ok('a Project\'s "answers only, no explanations" makes the reply the answer and nothing around it', s1.answersOnly === true && /answers only/.test(d1.decision.objective) && d1.decision.forced, `${d1.decision.maxTokens} ${d1.decision.forced}`);
  ok('  with no token cap: "the complete code, no explanations" is long and wanted', d1.decision.maxTokens >= 1200, String(d1.decision.maxTokens));
  const d2 = decide(turn({ work: 'information', latest: 'question' }, 'why does -F keep following after rotation?', { prior: s1, project: ops }), { said: 'why does -F keep following after rotation?', project: ops });
  ok('  but not when they ask why', !/They asked for answers only/.test(d2.decision.objective), d2.decision.objective);
  for (const said of ['answers only please', 'no explanations, just the command.', 'Just the query please']) ok(`answersOnly: "${said}"`, readSignals(said).answersOnly === true);
  // The review before run 6 found these all setting answers-only — some for a whole Project.
  for (const said of ['Can you explain the answers only section of the docs?', 'The answer is only valid for Postgres 15', 'Answer only in British English.', 'Only answer in Spanish please', 'Please answer only what I ask, and be thorough.', 'Answer only questions related to my thesis.', 'No commentary on formatting; focus on argument.', "There's no explanation for this behaviour in the docs. What's going on?", "There's no explanation for why he left me.", "There's no explanation.", 'The answer only works for positive n, right?', 'My teacher accepts answers only in simplest form.', "Please don't skip the explanation", 'Is it possible to prove this without any explanation of the lemma?']) {
    ok(`not answersOnly: "${said}"`, readSignals(said).answersOnly === false && readContract(said).answersOnly === false, String(readSignals(said).answersOnly));
  }
  for (const said of ['Why?', 'why?', 'Why do I need sudo?', 'How does that work?', 'why not use a set?']) ok(`"${said}" suspends answers-only`, readSignals(said).explainAsked === true);
  const fromNow = turn({ work: 'information', latest: 'question' }, 'From now on explain your answers please', { prior: s1 });
  ok('"from now on, explain" ends answers-only', fromNow.answersOnly === false);

  const vent = "I'm not asking what to do. I just need to say this somewhere that isn't going to tell me to update my brag doc.";
  ok('"I\'m not asking what to do" is wanting to be heard', readSignals(vent).vent === true);
  const h1 = turn({ work: 'reflection', latest: 'information' }, vent);
  const h3 = turn({ work: 'reflection', latest: 'information' }, "Anyway. I think I'm going to sit on it for a week before I say anything to my manager.", { prior: turn({ work: 'reflection', latest: 'reaction' }, 'Yeah. Or maybe I am just being petty about Dan.', { prior: h1 }) });
  ok('two turns later, still being heard, not advised', h3.heardOnly === true && decide(h3, { said: 'Anyway. I think I am going to sit on it for a week.' }).allocation.mode === 'HUMAN_REFLECTS', decide(h3).allocation.reasonCode);
  const h4 = turn({ work: 'judgment', latest: 'question' }, 'What would you say to my manager?', { prior: h3 });
  ok('  until they ask for it', h4.heardOnly === false && decide(h4, { said: 'What would you say to my manager?' }).allocation.mode !== 'HUMAN_REFLECTS');
}

console.log('\n=== run 6: no "more than last time" on the first turn, none for someone being heard ===');
{
  const first = renderState({ ...EMPTY_STATE, stuck: 'stalled', turn: 1 });
  ok('turn 1 never says "more than last time"', !/more than last time/.test(first) && /they seem stuck/.test(first), first);
  ok('  a later turn does', /more than last time/.test(renderState({ ...EMPTY_STATE, stuck: 'stalled', turn: 3 })));
  ok('  and someone being heard gets no push to "support"', !/Support:/.test(renderState({ ...EMPTY_STATE, stuck: 'stalled', turn: 2, heardOnly: true })));
}

console.log('\n=== run 6: sentence counts, "I\'m lost", being heard ===');
{
  ok('"one sentence on why now" is an exact count', readSignals("Board slide needs one sentence on why we're doing this. Write it.").sentences === 1);
  ok('"two sentences framing…" too', readSignals('Draft me two sentences framing the comparability section').sentences === 2);
  for (const said of ['the first two sentences of my intro are weak', 'one sentence from your answer confused me']) ok(`no count in "${said}"`, readSignals(said).sentences === 0);
  const two = decide(S({ work: 'creation', latest: 'request' }), { said: 'Draft me two sentences framing the comparability section' });
  ok('  and the move says exactly that many', /write exactly that many/.test(two.decision.objective) && two.decision.forced);
  ok('"I\'m lost now." is not knowing', readSignals("So the -e isn't the default at all. I'm lost now.").dontKnow === true);
  for (const said of ["I'm lost in thought", 'I lost my keys']) ok(`not lost: "${said}"`, readSignals(said).dontKnow === false);
  const lost = decide(S({ work: 'practice', latest: 'attempt', attempt: 'partial', directness: { value: 'guidance', source: 'explicit', confidence: 1, evidence: 'hints only' } }), { said: "I'm lost now." });
  ok('under "hints only", "I\'m lost" raises support at once (verdict first)', lost.allocation.reasonCode.endsWith('.stuck') && /whether it is right/.test(lost.decision.objective), lost.allocation.reasonCode);
  for (const said of ["I don't want advice about audition prep. I've done the mock panels.", "I just needed to tell someone who isn't my teacher or my mum."]) ok(`being heard: "${said.slice(0, 50)}"`, readSignals(said).vent === true);
  ok('still not: "I don\'t want advice on the design, just review the code"', readSignals("I don't want advice on the design, just review the code").vent === false);
}

console.log('\n=== review before run 6: withhold and vent false positives ===');
{
  for (const said of ["I tried to fix it myself but it still fails, what's wrong?", 'I managed to fix the bug myself, now I want to know how to add tests', "I couldn't solve this on my own so here's my code", "Why can't I solve this myself? Explain the concept.", "Can you show me the proof? I'd rather not derive it myself", "I don't want the fix to break anything else. What should I change?", "I don't want the answer to be wrong, so double check it", "I don't want the solution to use recursion. Can you write it iteratively?", "Don't show me the working, I only want the final answer", 'Don\'t give me the proof, just the final number please', 'I want to fix my own bug report template, can you draft one?']) {
    ok(`not a refusal: "${said.slice(0, 60)}"`, readSignals(said).directness !== 'no_answer', readSignals(said).directness);
  }
  ok('"just the final number" after "don\'t give me the proof" is answers-only', readSignals('Don\'t give me the proof, just the final number please').answersOnly === true);
  for (const said of ["I'm not asking what to do about the bug, I'm asking why it happens", "I'm not asking for advice on the design, just review the code", 'Not asking for advice on stocks, just what a P/E ratio is', 'I just need to tell it apart from the other function — how?', "I just need to say it in French: how do you say 'good morning'?", 'i just need to tell this to my manager, how should I phrase it?']) {
    ok(`not venting: "${said.slice(0, 60)}"`, readSignals(said).vent === false);
  }
  // A one-off "give me a hint" still bottoms out; "hints only" does not.
  const failed2 = Array.from({ length: 2 }, (_, i) => ({ turn: i + 1, type: 'VERIFY', family: 'telling', questions: 0, withheld: true, failed: true }));
  const oneHint = decide(S({ work: 'practice', latest: 'attempt', attempt: 'wrong', directness: { value: 'guidance', source: 'explicit', confidence: 1, evidence: 'give me a hint' }, history: failed2 }));
  ok('a one-off "give me a hint" still bottoms out after repeated failure', oneHint.allocation.reasonCode === 'practice.bottom_out', oneHint.allocation.reasonCode);
  const hintsOnly2 = decide(S({ work: 'practice', latest: 'attempt', attempt: 'wrong', directness: { value: 'guidance', source: 'explicit', confidence: 1, evidence: 'hints only' }, history: failed2 }));
  ok('"hints only" does not', hintsOnly2.allocation.reasonCode.endsWith('.stuck') && /whether it is right and where it goes wrong/.test(hintsOnly2.decision.objective), `${hintsOnly2.allocation.reasonCode} ${hintsOnly2.decision.objective.slice(0, 80)}`);
}

console.log('\n=== an instruction must point at a heading the reply prompt has ===');
{
  const s = S({ work: 'judgment', taskKind: 'decide', latest: 'question' });
  const d = decide(s, { said: 'Which way would you go?', considered: ['they hold: the lease runs to 2029', 'they raised: moving the team is the real cost'] });
  const block = renderDecision({ ...d.decision, avoid: ['they raised: moving the team is the real cost'] }, d.allocation);
  const pointed = (d.decision.objective.match(/listed under "([^"]+)"/) ?? [])[1];
  ok('the objective names a heading', !!pointed, d.decision.objective.slice(-120));
  ok('  and the move block actually contains it', !pointed || block.includes(pointed), `${pointed} not in block`);
}

console.log('\n=== expertise changes the pitch of every teaching move, not one fork ===');
{
  const E = (value, source = 'observed', confidence = 0.65) => ({ value, source, confidence, evidence: 'shown' });
  const expert = decide(S({ work: 'explanation', latest: 'question', expertise: E('expert') }), { said: 'Why does the planner pick a seq scan here?' });
  ok('an expert is not taught the basics', /no ground-up teaching|no definitions of terms they used correctly/.test(expert.decision.objective), expert.decision.objective.slice(-160));
  const novice = decide(S({ work: 'explanation', latest: 'question', expertise: E('novice') }), { said: 'Why does the planner pick a seq scan here?' });
  ok('a novice gets the principle named and the steps explicit', /name the principle|steps explicit/.test(novice.decision.objective), novice.decision.objective.slice(-160));
  ok('  and they are not the same instruction', expert.decision.objective !== novice.decision.objective);
  const guessy = decide(S({ work: 'explanation', latest: 'question', expertise: { value: 'expert', source: 'inferred', confidence: 0.3, evidence: 'used a word' } }));
  ok('a weak guess changes nothing', !/no ground-up teaching/.test(guessy.decision.objective));
  const heard = decide(S({ work: 'reflection', latest: 'information', expertise: E('expert') }), { said: 'I just need to say this somewhere.' });
  ok('being heard has no register to calibrate', !/no ground-up teaching/.test(heard.decision.objective), heard.decision.type);
}

console.log('\n=== run 4: a substantive move has the baseline\'s ceiling ===');
{
  const judged = decide(S({ work: 'judgment', taskKind: 'decide', latest: 'request' }), { said: 'Here is my plan and my numbers — what am I missing?' });
  ok('a judgement reply may run as long as the strongest prompt\'s', judged.decision.maxTokens >= 1200, `${judged.decision.type} ${judged.decision.maxTokens}`);
  const tension = decide(S({ work: 'judgment', latest: 'information', tensions: ['wants speed and certainty'] }));
  ok('so may a challenge', tension.decision.maxTokens >= 1200 || tension.decision.type !== 'CHALLENGE', `${tension.decision.type} ${tension.decision.maxTokens}`);
}

console.log('\n=== run 4: missed "find it myself" phrasings ===');
{
  for (const said of ['I want to get there myself — no rewritten query, please.', 'Do not tell me the trick, do not name it, and do not write SQL. I want to have found it.', "So for this one, don't hand me the answer.", "I can take it from here — don't finish it for me."]) {
    ok(`no_answer: "${said.slice(0, 50)}"`, readSignals(said).directness === 'no_answer', readSignals(said).directness);
  }
  for (const said of ['I want to get there by 5pm', 'How do I get there from the station?', 'Can you find it for me?', 'She said she wanted to crack it herself']) {
    ok(`not a refusal: "${said}"`, readSignals(said).directness === 'none', readSignals(said).directness);
  }
}

console.log('\n=== run 3: an analogous worked example only once they are stuck (D6 ladder) ===');
{
  const said = "Don't give me the answer, I want to understand the borrow checker by fighting it";
  const fight = turn({ taskKind: 'learn', work: 'diagnosis', latest: 'attempt', attempt: 'wrong' }, said);
  const a = allocate({ state: fight, signals: NO_SIGNALS, contract: NO_SIGNALS });
  ok('a withhold on their words', !!a.withhold && a.withhold.quote.length > 0, a.reasonCode);
  ok('  offers the principle and a verdict, not a worked example', !/worked example/.test(a.withhold.alternative) && /principle/.test(a.withhold.alternative), a.withhold.alternative);
  const looping = allocate({ state: { ...fight, stuck: 'looping' }, signals: NO_SIGNALS, contract: NO_SIGNALS });
  ok('  looping on it → an analogous worked example is on offer', /analogous worked example/.test(looping.withhold?.alternative ?? ''), looping.reasonCode);
}

console.log('\n=== THE PRODUCT RULE (withheld only because they said so) ===');
{
  const s = turn({ taskKind: 'learn', work: 'practice', latest: 'attempt', attempt: 'partial', currentFocus: 'differentiating x^2 sin x' }, 'I am learning derivatives and want to work these out myself — here is what I have so far');
  const d = decide(s, { said: 'I am learning derivatives and want to work these out myself' });
  ok('the answer stays with them', d.allocation.withhold?.what === 'the answer' || d.allocation.withhold?.what === 'the corrected final answer', JSON.stringify(d.allocation.withhold));
  ok('and the move is guarded', d.decision.guardRequired === true);
  const block = renderDecision(d.decision, d.allocation);
  ok('the block says what to keep with them, and why', /KEEP WITH THEM/.test(block) && /practice goal/.test(block));
  ok('the block never names itself to the person', /Do not narrate it, name it/.test(block));
}

console.log('\n=== vent, and a plain request ===');
{
  const v = decide(S({ taskKind: 'vent', work: 'reflection', latest: 'information' }), { said: "I just need to vent, I don't want advice" });
  ok('being heard, when they SAID so: REFLECT, no questions, nothing to fix', v.decision.type === 'REFLECT' && v.decision.maxQuestions === 0);
  // Run 1 (repeated-questioning-004, longitudinal-006): an INFERRED
  // "reflection" gave acknowledgement to people who wanted help.
  const g = decide(S({ taskKind: 'vent', work: 'reflection', latest: 'information' }));
  ok('a GUESSED "reflection" does not narrow help to acknowledgement', g.decision.type !== 'REFLECT' && g.decision.type !== 'GET_OUT_OF_THE_WAY', g.decision.type);
  const cre = decide(S({ taskKind: 'create', work: 'creation', latest: 'attempt', attempt: 'partial' }));
  ok('run 1 (creative-002): creative work is critiqued, never "corrected"', cre.decision.type !== 'CORRECT', cre.decision.type);
  ok('council D1: an inference-driven move is not imposed', decide(S({ work: 'judgment', latest: 'information' })).decision.forced === false);
  ok('  the person\'s own request is', decide(S({ work: 'information', latest: 'question' }), { said: 'just tell me' }).decision.forced === true);
  const l = decide(S({ taskKind: 'lookup', work: 'information', latest: 'question', currentFocus: 'when was McCombs named' }));
  ok('a fact: ANSWER', l.decision.type === 'ANSWER');
  const c = decide(S({ work: 'information', latest: 'question', currentFocus: 'how much is 15% of 2400' }));
  ok('a calculation: CALCULATE', c.decision.type === 'CALCULATE', c.decision.type);
  const r = decide(S({ work: 'information', latest: 'question', currentFocus: 'why did we decide to drop the second option' }));
  ok('their own earlier reasoning: RETRIEVE, attributed', r.decision.type === 'RETRIEVE' && /Socria’s suggestion is Socria’s/.test(r.decision.objective));
}

console.log('\n=== every decision is well-formed ===');
{
  const seen = new Set();
  let bad = 0;
  const works = ['information', 'execution', 'explanation', 'practice', 'verification', 'diagnosis', 'judgment', 'creation', 'research', 'reflection', 'conversation'];
  const latests = ['question', 'request', 'attempt', 'answer', 'information', 'reaction', 'other'];
  const extras = [{}, { tensions: ['wants speed and certainty'] }, { newRelation: 'A → because → B' }, { blockingUnknown: 'the log' }, { positions: ['a', 'b', 'c'] }, { attempt: 'right' }, { practice: 'retrieval', learningGoal: { value: 'yes', source: 'explicit', confidence: 1, evidence: 'said' } }];
  for (const work of works) for (const latest of latests) for (const allowed of [0, 1]) for (const x of extras) {
    const s = S({ work, latest, attempt: latest === 'attempt' ? 'wrong' : 'none', ...x });
    const a = allocate({ state: s, signals: NO_SIGNALS, contract: NO_SIGNALS });
    const d = selectIntervention({ state: s, allocation: a, budget: { streak: 0, density: 0, allowed, reasons: [] }, diminishing: NO_DIM, signals: NO_SIGNALS, considered: [] });
    seen.add(d.type);
    const complete = d.reasonCode && d.reason && d.intendedOutcome && d.objective && d.aiWorkPerformed !== undefined && typeof d.confidence === 'number' && d.maxTokens > 0;
    // Council D8: buffered (guard reads the whole draft) ONLY when something is withheld.
    const guardOk = d.guardRequired === !!a.withhold;
    if (!complete || !guardOk) bad++;
  }
  ok('every decision carries type, reason, intended outcome, work split, confidence', bad === 0, `${bad} malformed`);
  ok('the engine reaches most of the vocabulary', seen.size >= 8, [...seen].join(','));
}

console.log('\n=== run 8: what the allocator knows about stakes reaches the length policy ===');
{
  // Run 8 measured the gap: Core 4 replied in 280 words where the prompt-only
  // baseline used 425, lost 6 of 8 scenarios, and every loss read as the
  // baseline carrying more substance — while Core 4's own state block on 12
  // of those 22 turns said `stakes: high, expertise: expert`. The prompt
  // already names that case as the exception to its brevity default; nothing
  // carried the reading to it.
  const E = (value, source = 'observed', confidence = 0.7) => ({ value, source, confidence, evidence: 'shown' });
  const high = { value: 'high', source: 'inferred', confidence: 0.8, evidence: 'reader' };
  const base = { work: 'judgment', taskKind: 'decide', latest: 'request', expertise: E('expert'), stakes: high };

  const consequential = decide(S(base), { said: 'Here are my churn numbers and the raise timing. What breaks?' });
  ok('a consequential call by someone who works in the area is covered completely', consequential.decision.coverage === 'complete', `${consequential.decision.type} ${consequential.decision.coverage}`);
  const block = renderDecision(consequential.decision, consequential.allocation);
  ok('  and the move block says so, where precedence puts it above the prompt default', /COVERAGE:/.test(block) && /completeness on what matters beats brevity/i.test(block));
  ok('  and it supersedes an objective that caps how much to add', /supersedes that cap/.test(block));
  ok('  without licensing padding', /do not reach for extra considerations to fill the space/i.test(block));
  // Each of these answers a padding failure a blind judge named in the E15
  // A/B (run 9 vs run 9b, the same system differing only in this line).
  ok('  and forbids a primer on the field they work in', /no primer on their own field/i.test(block));
  ok('  and forbids a point raised and withdrawn in the same breath', /concede in the same breath/i.test(block));
  ok('  and says covering what matters is the instruction, not length', /length is not/i.test(block));
  // complete fires ONLY when expertise is expert, but the expert calibration
  // clause attaches to TEACHING moves only — so on a CHALLENGE the no-basics
  // guarantee has to come from the coverage line or from nowhere.
  const challenging = decide(S({ ...base, work: 'judgment', latest: 'attempt', attempt: 'right' }), { said: 'Here is the design. Poke holes in it.' });
  if (challenging.decision.coverage === 'complete' && !['EXPLAIN','ANSWER','CORRECT','VERIFY','HINT','CALCULATE','EXECUTE'].includes(challenging.decision.type)) {
    ok('  a non-teaching move to an expert still gets the no-basics guarantee',
      /no primer on their own field/i.test(renderDecision(challenging.decision, challenging.allocation)), challenging.decision.type);
  } else {
    ok('  (the non-teaching expert case did not arise here)', true, `${challenging.decision.type} ${challenging.decision.coverage}`);
  }

  ok('low stakes is not a reason to cover everything',
    decide(S({ ...base, stakes: { value: 'low', source: 'inferred', confidence: 0.8, evidence: 'reader' } }), { said: 'What breaks?' }).decision.coverage === 'normal');
  ok('high stakes alone is not either — a novice gets the normal reply',
    decide(S({ ...base, expertise: E('novice') }), { said: 'What breaks?' }).decision.coverage === 'normal');
  ok('a weak guess at expertise does not unlock it',
    decide(S({ ...base, expertise: { value: 'expert', source: 'inferred', confidence: 0.3, evidence: 'used a word' } }), { said: 'What breaks?' }).decision.coverage === 'normal');

  // The opposite failure is on record too (runs 4-6: expert turns lost for
  // padding past a length the person asked for), so their own words win.
  ok('a sentence count they asked for wins outright',
    decide(S(base), { said: 'In one sentence: what breaks?' }).decision.coverage === 'minimal');
  ok('"answers only" wins outright',
    decide(S({ ...base, answersOnly: true }), { said: 'What breaks?' }).decision.coverage === 'minimal');
  ok('a close stays a close',
    decide(S(base), { said: 'Got it, thanks.' }).decision.coverage === 'minimal');

  // "Cover everything that matters" beside "keep this one thing from them"
  // is a contradiction, and the contradiction resolves as a leak.
  const heldSaid = 'I want to learn to do these myself. This is the SEC filing my board reads — I got 2x cos x, right?';
  const withheld = decide(turn({ taskKind: 'learn', work: 'verification', latest: 'attempt', attempt: 'wrong', expertise: E('expert'), stakes: high }, heldSaid), { said: heldSaid });
  ok('  (the withhold is real)', withheld.allocation.withhold?.reason === 'practice_goal', JSON.stringify(withheld.allocation.withhold));
  ok('  (and the state that would otherwise unlock it is real)', withheld.decision.type === 'VERIFY' && withheld.allocation.withhold !== null);
  ok('nothing is covered completely beside a withhold', withheld.decision.coverage === 'normal', `withhold=${!!withheld.allocation.withhold} coverage=${withheld.decision.coverage}`);

  // A hint that covers everything has stopped being a hint.
  const hinting = decide(S({ work: 'practice', practice: 'retrieval', stuck: 'stuck', expertise: E('expert'), stakes: high, learningGoal: { value: 'yes', source: 'explicit', confidence: 1, evidence: 'I want to learn this' } }));
  ok('  (the move really is one of the short ones)', ['HINT', 'QUESTION', 'CLARIFY', 'REFLECT', 'GET_OUT_OF_THE_WAY'].includes(hinting.decision.type), hinting.decision.type);
  ok('a move that is short by nature stays short', hinting.decision.coverage === 'minimal', `${hinting.decision.type} ${hinting.decision.coverage}`);

  ok('an ordinary turn says nothing about coverage at all',
    !/COVERAGE:/.test(renderDecision(decide(S({ work: 'explanation', latest: 'question' })).decision, decide(S({ work: 'explanation', latest: 'question' })).allocation)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
