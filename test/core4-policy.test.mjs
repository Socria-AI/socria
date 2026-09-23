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
import { mergeState, recordTurn, explicitOutcome } from './.tmp/merge.mjs';
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
  ok('a wrong one hears where and what kind, the redo stays theirs', wrong.decision.type === 'VERIFY' && wrong.allocation.withhold?.what === 'the corrected final answer');
  const failed = (n) => Array.from({ length: n }, (_, i) => ({ turn: i + 1, type: 'VERIFY', family: 'telling', questions: 0, withheld: true, failed: true }));
  const third = decide(S({ work: 'practice', latest: 'attempt', attempt: 'wrong', directness: standing, history: failed(2) }));
  ok('the third failed attempt bottoms out: a full worked solution', third.allocation.reasonCode === 'practice.bottom_out' && third.allocation.withhold === null && third.decision.type === 'EXPLAIN');
  const idk = decide(S({ work: 'practice', latest: 'attempt', attempt: 'wrong', directness: standing, history: failed(1) }), { said: 'idk' });
  ok('"idk" after a failed attempt bottoms out sooner', idk.allocation.reasonCode === 'practice.bottom_out', idk.allocation.reasonCode);
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
  const v = decide(S({ taskKind: 'vent', work: 'reflection', latest: 'information' }));
  ok('being heard: REFLECT, no questions, nothing to fix', v.decision.type === 'REFLECT' && v.decision.maxQuestions === 0);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
