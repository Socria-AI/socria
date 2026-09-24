// Proportional response length, and the filler that makes a reply sound like a
// chatbot.
//
// THE REPORT THAT PRODUCED THIS SUITE: "I'm worried about whether I'm doing
// enough for McCombs" came back as a paragraph — a line of reassurance, the
// worry restated, two pieces of advice that would fit any applicant, and a
// closing question. Traced: that message reached CONTRIBUTE at maxTokens 1200,
// the same ceiling as a full analytical answer, with an objective asking for
// "the overlooked assumption, the missing variable, the stronger
// counterargument".
//
// WHY LENGTH IS NOT THE SIGNAL, which is the trap the obvious fix falls into:
// the worry is ten words and "Here are my churn numbers and the raise timing,
// what breaks?" is eleven. A word count cannot separate them. What separates
// them is whether they asked for something and whether they gave anything to
// work with.
//
// HALF THIS SUITE IS THE OPPOSITE FAILURE. The first implementation trimmed the
// churn question to 220 tokens — a real question about real material, gutted —
// which is worse than the verbosity it was fixing, because a person can skim a
// long reply and cannot recover a missing one. Every "must NOT be trimmed" case
// below is load-bearing.

import { EMPTY_STATE } from './.tmp/state.mjs';
import { readSignals, readContract, NO_SIGNALS } from './.tmp/signals.mjs';
import { allocate } from './.tmp/allocation.mjs';
import { budgetFrom, diminishingReturns } from './.tmp/budget.mjs';
import { selectIntervention, renderDecision, proportionFor } from './.tmp/intervene.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

/** One full turn decision from a message plus the state the reader would report. */
function decide(said, over = {}, project = '') {
  const state = { ...EMPTY_STATE, currentFocus: said, ...over };
  const signals = said ? readSignals(said) : NO_SIGNALS;
  const contract = project ? readContract(project) : NO_SIGNALS;
  const dim = diminishingReturns(state, signals, []);
  const budget = budgetFrom(state, signals, 0, 0, dim);
  const allocation = allocate({ state, signals, contract });
  const decision = selectIntervention({ state, allocation, budget, diminishing: dim, signals, considered: [], lastUserText: said });
  return { decision, allocation, block: renderDecision(decision, allocation) };
}

const REFLECTIVE = { taskKind: 'explore', work: 'reflection', latest: 'information' };
const CHATTY = { taskKind: 'explore', work: 'conversation', latest: 'information' };

// ─────────────────────────────────────────────────────────────────────

console.log('=== the reported bug: a short open worry got a paragraph ===');
{
  const r = decide("I'm worried about whether I'm doing enough for McCombs", REFLECTIVE);
  ok('it is no longer given an essay\'s ceiling', r.decision.maxTokens <= 220, String(r.decision.maxTokens));
  ok('  and is marked brief', r.decision.proportion === 'brief', r.decision.proportion);
  ok('the block asks for one or two sentences', /one or two sentences/.test(r.block));
  ok('  and for one true specific thing rather than coverage', /ONE true, specific thing/.test(r.block));
}

console.log('\n=== the named filler, because "be concise" is advice and these are sentences ===');
{
  const b = decide("I don't know if the essay angle is right", CHATTY).block;
  ok('no reassuring them a feeling is normal', /Do not reassure them that a feeling is normal/.test(b));
  ok('no restating what they just said', /Do not restate what they just said/.test(b));
  ok('no advice that would fit anyone', /would fit anyone in their position/.test(b));
  ok('  and it says why that is worthless', /if it would fit anyone, it helps no one/.test(b));
  ok('no unrequested option lists', /Do not list options they did not ask for/.test(b));
  ok('no closing offer to help further', /do not close by offering to help further/.test(b));
}

console.log('\n=== a question is not required: an observation can be the better reply ===');
{
  const b = decide("I'm worried about whether I'm doing enough for McCombs", REFLECTIVE).block;
  ok('an observation is allowed to stand alone', /plain observation is often better than a question/.test(b));
  ok('  and the reply need not end in one', /does not have to end in one/.test(b));
  ok('  while a genuine blocker may still be asked, once', /ask for the ONE thing/.test(b));
  const r = decide("I'm worried about whether I'm doing enough for McCombs", REFLECTIVE);
  ok('and no question is budgeted for it anyway', r.decision.maxQuestions === 0);
}

console.log('\n=== MUST NOT BE TRIMMED: the opposite failure, which is worse ===');
{
  // The first implementation trimmed this to 220. A real question about real
  // material, gutted.
  const churn = decide('Here are my churn numbers and the raise timing. What breaks?', { taskKind: 'decide', work: 'judgment', latest: 'request', stakes: 'high' });
  ok('a real question keeps the move\'s ceiling', churn.decision.maxTokens >= 1200, String(churn.decision.maxTokens));
  ok('  and is not marked brief', churn.decision.proportion === 'normal');
  ok('  and carries no brevity instruction', !/one or two sentences/.test(churn.block));

  const asked = decide('How do I get Postgres to use a partial index here?', { work: 'information', latest: 'question' });
  ok('a plain question is answered properly', asked.decision.proportion === 'normal', String(asked.decision.maxTokens));

  const pasted = decide('This keeps failing: TypeError: cannot read length of undefined at cart.js:42 — the checkout total is wrong for 3 of 200 orders', { work: 'diagnosis', latest: 'information' });
  ok('material they pasted is material to work with', pasted.decision.proportion === 'normal');

  const attempt = decide('I tried it and got 2x cos x, is that right?', { work: 'verification', latest: 'attempt', attempt: 'wrong' });
  ok('work they showed is never trimmed on these grounds', attempt.decision.proportion === 'normal');

  const longThought = decide('I keep going back and forth on this. The interview went fine but they asked about the gap year twice and I gave a different answer each time, and now I am wondering whether the inconsistency reads as evasive or just as someone thinking out loud about something they have not settled, and whether to send a follow-up note addressing it directly or leave it alone entirely.', REFLECTIVE);
  ok('a long reflective message is not an opening', longThought.decision.proportion === 'normal', String(longThought.decision.maxTokens));

  const detail = decide('Explain in detail how the planner decides between a seq scan and an index scan', { work: 'explanation', latest: 'question' });
  ok('an explicit ask for detail wins outright', detail.decision.proportion === 'normal');
}

console.log('\n=== coverage still wins where it fired ===');
{
  // A consequential call for someone who works in the area has earned its
  // length by a stronger signal than the shape of one message.
  const expert = { value: 'expert', source: 'observed', confidence: 0.7, evidence: 'shown' };
  const high = { value: 'high', source: 'inferred', confidence: 0.8, evidence: 'reader' };
  const r = decide('So March then?', { taskKind: 'decide', work: 'judgment', latest: 'request', expertise: expert, stakes: high });
  if (r.decision.coverage === 'complete') {
    ok('a complete-coverage turn is not trimmed', r.decision.proportion === 'normal' && r.decision.maxTokens >= 1200, `${r.decision.coverage} ${r.decision.maxTokens}`);
    ok('  and keeps its completeness instruction', /COVERAGE:/.test(r.block));
  } else {
    ok('(coverage did not fire on this shape)', true, r.decision.coverage);
  }
}

console.log('\n=== their own words win in both directions ===');
{
  ok('a sentence count they asked for is untouched',
    decide('In one sentence: am I doing enough?', REFLECTIVE).decision.proportion === 'normal');
  ok('"answers only" is brief by their instruction',
    decide('answers only from now on', { work: 'information', latest: 'information' }).decision.proportion === 'brief');
  ok('a close stays a close', decide('got it, thanks', CHATTY).decision.proportion === 'brief');
}

console.log('\n=== moves already short are not told twice ===');
{
  // Saying "be brief" to a move whose objective is already one sentence is how
  // a short reply becomes a curt one.
  const vent = decide('honestly I am just exhausted by this whole thing', { taskKind: 'explore', work: 'reflection', latest: 'reaction' });
  ok('a short-by-nature move is left alone', vent.decision.proportion === 'normal', vent.decision.type);
  ok('  and it was already short', vent.decision.maxTokens <= 200, String(vent.decision.maxTokens));
  ok('  with no doubled brevity instruction', !/one or two sentences/.test(vent.block));
}

console.log('\n=== two regressions this change caused, pinned so they cannot return ===');
{
  // "Answers only, no explanations" means no prose AROUND the answer. It does
  // NOT mean a short answer, and "the complete code, no explanations" is long
  // and wanted (run 5). Mapping it to brief truncated the thing they asked for.
  const code = decide('the complete code, no explanations', { work: 'execution', latest: 'request' });
  ok('"answers only" does not cap the answer itself', code.decision.maxTokens > 220, String(code.decision.maxTokens));

  // With no message text there is no evidence this was a short open turn.
  // Defaulting to brief silently stripped the ceiling from every caller that
  // does not supply the text. Missing evidence is not evidence.
  const noText = decide('', { work: 'judgment', taskKind: 'decide', latest: 'request' });
  ok('absent message text never trims', noText.decision.proportion === 'normal', String(noText.decision.maxTokens));
}

console.log('\n=== an ordinary turn says nothing about length at all ===');
{
  const plain = decide('What is the default isolation level in Postgres?', { work: 'information', latest: 'question' });
  ok('no length block on a normal turn', !/^LENGTH:/m.test(plain.block), plain.block.slice(0, 200));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
