// WHOSE WORK IS THIS? — selective cognitive offloading.
//
// THE REPORT: "make a story" produced a whole story. Nobody had said whether
// they were handing that over or doing it, and the guess arrived as a finished
// artifact — which decided it for them.
//
// TRACED, AND NOT WHAT THE REPORT IMPLIES. No layer had failed. Nothing was
// withheld (correct: council D6 withholds only on an explicit statement, and
// "you probably wanted to write this yourself" is exactly the paternal
// inference the allocator exists to stop). The move was ANSWER (correct: they
// asked). The ceiling was the full one (a request, and requests are exempt
// from the length policy). The gap was that no layer asked the one question
// Human-First exists to ask: IS THIS PERSON HANDING ME THIS WORK, OR DOING IT?
//
// THE ANSWER IS AN OWNERSHIP READ, NOT A REFUSAL AND NOT A SCOPE INTERVIEW.
// "Yours, or mine?" is one line and settles it. "Who is it for, how long, what
// tone?" is four questions about things they may not have decided yet, and is
// how a helpful system becomes an exhausting one.
//
// HALF THIS SUITE IS THE OPPOSITE FAILURE, which is on record from runs 4-6:
// an expert asking for a thing and getting an interview. Every "must not ask"
// case below is load-bearing, and three gates stand in front of the question:
// the work must be substantial, nothing they have said may already settle it,
// and a question must be available.

import { EMPTY_STATE } from './.tmp/state.mjs';
import { readSignals, NO_SIGNALS } from './.tmp/signals.mjs';
import { allocate, ownershipRead } from './.tmp/allocation.mjs';
import { budgetFrom, diminishingReturns } from './.tmp/budget.mjs';
import { selectIntervention, renderDecision } from './.tmp/intervene.mjs';
import { mergeState, recordTurn } from './.tmp/merge.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

function turn(said, over = {}, history = []) {
  const state = { ...EMPTY_STATE, currentFocus: said, history, ...over };
  const signals = said ? readSignals(said) : NO_SIGNALS;
  const dim = diminishingReturns(state, signals, []);
  const budget = budgetFrom(state, signals, history.filter((h) => h.asked).length, 0, dim);
  const allocation = allocate({ state, signals, contract: NO_SIGNALS, lastUserText: said });
  const decision = selectIntervention({ state, allocation, budget, diminishing: dim, signals, considered: [], lastUserText: said });
  return { allocation, decision, block: renderDecision(decision, allocation), own: allocation.ownership };
}
const read = (t, over = {}) => ownershipRead(t, readSignals(t), { ...EMPTY_STATE, ...over });

const CREATE = { taskKind: 'create', work: 'creation', latest: 'request' };
const TALK = { taskKind: 'explore', work: 'conversation', latest: 'request' };
const THINK = { taskKind: 'decide', work: 'judgment', latest: 'request' };
const asked = (r) => r.decision.maxQuestions === 1 && r.decision.type === 'CLARIFY';

// ─────────────────────────────────────────────────────────────────────

console.log('=== the ten cases, by what they actually mean ===');
{
  // THE EXPECTATIONS IN THIS SECTION CHANGED, AND THE CHANGE IS THE POINT.
  //
  // They used to assert that "write a story" asked "yours, or mine?", and that
  // "just do it" and "decide for me" handed the work over. One line, answerable
  // in a word, and much better than the scope interview it replaced — but its
  // "mine" branch handed Socria the origination of somebody's work, and that is
  // not a thing Socria takes. The invariant is universal: there is no state in
  // which the meaningful cognition transfers. So the question is gone, unclear
  // resolves to theirs, and an instruction to get on with it moves the service
  // level — no questions, full length, everything around the substance — and
  // not who does the thinking.

  // 1. UNCLEAR CREATIVE — the original report.
  const story = turn('write a story', CREATE);
  ok('"write a story" leaves the substance with them', story.own === 'theirs', String(story.own));
  ok('  and asks for THEIRS rather than offering to take it',
    /^creation\.elicit/.test(story.decision.reasonCode), story.decision.reasonCode);
  // Asserted on the RENDERED block, not the objective, for the unforced case:
  // an unforced turn never prints its objective (council D1).
  // The elicit move is forced (its whole instruction lives in the objective), so
  // the objective is what reaches the model — the scope clause is for the
  // unforced case. Asserted where the words actually go.
  // THE OBJECTIVE CHANGED, AND THE CHANGE IS RAIL 2. Asking for their fragment
  // and nothing else preserved the cognition perfectly and left them exactly
  // where they were — "what kind of story do you want?" is the under-help
  // failure. The move now owes a METHOD for finding the material, and the
  // question is one line at the end of it.
  ok('  the objective owes them a method, not just a question',
    /Give them a METHOD/.test(story.decision.objective), story.decision.objective.slice(0, 90));
  ok('  pointed at what they already have rather than at invention',
    /ALREADY HAVE rather than at invention/.test(story.decision.objective));
  ok('  and still asks for theirs', /ask for whatever they have/.test(story.decision.objective));
  ok('  it never offers to do it instead', !/you do it for them/.test(story.block));
  ok('  and the contradicting default is replaced, not argued with',
    !/help fully: answer what they asked/.test(story.block));
  ok('  while forbidding the material itself',
    /Do NOT supply the material itself/.test(story.decision.objective));
  // The line that replaced "do not list the kinds": naming a kind of starting
  // point is the method, naming a specific one is the thing itself. That
  // distinction is what lets the move be useful without being a takeover.
  ok('  drawing the line at kind versus instance',
    /Naming a KIND of starting point is method; naming a specific one is the thing itself/.test(story.decision.objective));

  // 2. UNCLEAR REASONING — the half a generation-only reading misses.
  const solve = turn('solve this problem', { taskKind: 'learn', work: 'explanation', latest: 'request' });
  ok('"solve this problem" is read as substantial', solve.own !== null, String(solve.own));

  // 3. "DECIDE FOR ME" IS ANSWERED, AND NOT BY DECIDING.
  const decide = turn('decide for me', THINK);
  ok('"decide for me" does not transfer the decision', decide.own === 'theirs', String(decide.own));
  ok('  and nothing is asked', decide.decision.maxQuestions === 0 && decide.decision.type !== 'CLARIFY');
  ok('  the reply is everything the choice rests on', /judgment\.theirs/.test(decide.allocation.reasonCode), decide.allocation.reasonCode);
  ok('  including a view, marked as a view',
    decide.allocation.aiWork.some((w) => /view/.test(w)), JSON.stringify(decide.allocation.aiWork));

  // 4. COLLABORATION — the doing is the point.
  const brainstorm = turn('brainstorm with me', TALK);
  ok('"brainstorm with me" is theirs', brainstorm.own === 'theirs', String(brainstorm.own));
  // AND IT DOES NOT BECOME "generate ideas for me". With nothing of theirs on
  // the table the move is to draw out their first fragment — the ideas are the
  // thing they said they wanted to have. See core4-creative-ownership.
  ok('  so it asks for theirs rather than supplying its own',
    /^creation\.elicit/.test(brainstorm.decision.reasonCode), brainstorm.decision.reasonCode);
  ok('  with no examples, because an example is the creative act', /an example IS the creative act|an example is the creative act/.test(brainstorm.block));

  // 5. THE COMMONEST ONE IN A WORKING DAY.
  const email = turn('write this email', CREATE);
  ok('"write this email" leaves the substance with them', email.own === 'theirs', String(email.own));
  ok('  and asks for theirs rather than writing it', asked(email) || /^creation\.elicit/.test(email.decision.reasonCode));

  // 6. THEIR MATERIAL, THEIR ASK — no question earned, and Socria does the work.
  const improve = turn('improve my paragraph', CREATE);
  ok('"improve my paragraph" is scoped by their material', improve.own === 'scoped', String(improve.own));
  ok('  and is not interrogated', improve.decision.type !== 'CLARIFY');

  // 7. "GIVE ME THE ANSWER" on a knowledge gap is answered.
  const give = turn('give me the answer', { taskKind: 'learn', work: 'explanation', latest: 'request' });
  ok('"give me the answer" is not interrogated', give.decision.type !== 'CLARIFY', String(give.own));
  ok('  and it answers', give.decision.maxQuestions === 0);

  // 8. HUMAN OWNERSHIP, STATED AS A REQUEST FOR HELP.
  const figure = turn('help me figure it out', { taskKind: 'learn', work: 'explanation', latest: 'request' });
  ok('"help me figure it out" is theirs', figure.own === 'theirs', String(figure.own));
  ok('  and does not become an interview', figure.decision.type !== 'CLARIFY');

  // 9. "JUST DO IT" — the service level moves, the substance does not.
  const justDo = turn('just do it', CREATE);
  ok('"just do it" does not buy the substance', justDo.own === 'theirs', String(justDo.own));
  ok('  and asks nothing', justDo.decision.maxQuestions === 0);
  ok('  while every other part is done, at length',
    justDo.allocation.aiWork.length >= 3, JSON.stringify(justDo.allocation.aiWork));

  // 10. "DON'T DO IT FOR ME" — and the regex trap inside it.
  const dont = turn("don't do it for me", CREATE);
  ok('"don\'t do it for me" is theirs, not delegation', dont.own === 'theirs', String(dont.own));
  ok('  the delegation pattern inside its own negation does not win',
    readSignals("don't do it for me").delegate === false);
  ok('  and it asks for their material rather than about ownership',
    /^creation\.elicit/.test(dont.decision.reasonCode), dont.decision.reasonCode);
}

console.log('\n=== THE PRODUCTION BLOCKER: it must not depend on how the message got labelled ===');
{
  // THE LIVE FAILURE. The ownership branch lived inside "they asked a question
  // or made a request", and the cheap reader labelled "make a story" as
  // `information` — so the branch never ran, the turn fell through to
  // CONTRIBUTE at the full 1200-token ceiling with no ownership clause at all,
  // and somebody got a whole story. The reader is a cheap model on a 2s
  // timeout; anything gated on its label is gated on a coin toss.
  for (const latest of ['request', 'question', 'information', 'other', 'reaction']) {
    const r = turn('make a story', { taskKind: 'create', work: 'creation', latest });
    ok(`latest=${latest}: the substance is still theirs`, r.own === 'theirs', `${r.own}/${r.decision.type}/${r.decision.maxTokens}`);
    // Not the artifact's ceiling, and no longer a two-sentence one either: the
    // method needs room. What stops an idea being smuggled in is the objective
    // and the guard, not the token count.
    ok(`  and the ceiling is not the artifact's`, r.decision.maxTokens <= 300, String(r.decision.maxTokens));
    ok(`  while the turn is read whole before anybody sees it`, r.decision.guardRequired === true);
    ok(`  and it asks for theirs rather than writing it`, /^creation\.elicit/.test(r.decision.reasonCode), r.decision.reasonCode);
  }
  // The same for the other side: a turn whose ownership is theirs must not be
  // rescued by the label either.
  for (const latest of ['information', 'other']) {
    const r = turn('help me develop this essay idea', { taskKind: 'create', work: 'creation', latest });
    ok(`latest=${latest}: theirs is honoured too`, r.own === 'theirs', String(r.own));
    ok(`  and originates nothing`, /^creation\.elicit/.test(r.decision.reasonCode) || /Do NOT originate/.test(r.block), r.decision.reasonCode);
  }
}

console.log('\n=== THE BLANK-REPLY BLOCKER: the question is the thing this product deletes ===');
{
  // MEASURED, and it is the worst failure a reply can have. A one-line question
  // is syntactically a closing offer, and Core 4 spends its life removing
  // exactly that shape: on the ownership question this replaced, three of five
  // natural phrasings were stripped to NOTHING by the sentence gate, so the
  // person got a blank message. The elicit question is the same shape and is
  // protected the same way — buffered past the gate, and exempted from the
  // offer strip in guard2 by reason code.
  const r = turn('write a story', CREATE);
  ok('the ask is read whole, never streamed through the gate', r.decision.guardRequired === true);
  ok('  which is what keeps a question-shaped reply from being deleted mid-stream', r.decision.type === 'CLARIFY');
  ok('  and it is the elicit question, which the strip exempts by name',
    r.decision.reasonCode === 'creation.elicit', r.decision.reasonCode);
  ok('the objective forbids the material itself, which is what stops a smuggled idea',
    /Do NOT supply the material itself/.test(r.decision.objective));
  ok('  and the guard reads the whole reply before it is sent', r.decision.guardRequired === true);
}

console.log('\n=== a clause written for one move is not printed over another ===');
{
  // `allocate()` attaches the ownership read to EVERY allocation, including
  // the modes whose branches never act on it. Keyed on the allocation alone,
  // an EXPLAIN turn at a 1200-token ceiling was told to write four sentences
  // and stop — two instructions about length, disagreeing, in one prompt.
  const explain = turn('explain how to write a story arc', { taskKind: 'learn', work: 'explanation', latest: 'question' });
  ok('the read is still attached', explain.own !== null, String(explain.own));
  ok('  but the clause is not printed', !/WHICH PART OF THIS IS THEIRS/.test(explain.block));
  ok('  and the ceiling is the move\'s own', explain.decision.maxTokens >= 1000, String(explain.decision.maxTokens));
  // The clause is for the UNFORCED case; the elicit and develop moves are
  // forced and carry the same instruction in their objective instead.
  const develop = turn('take this further', { ...CREATE, authorship: { value: 'theirs', source: 'explicit', confidence: 1, evidence: 'mine' } }, []);
  ok('  while a move that owns the clause carries the instruction',
    /Do NOT originate|Do NOT supply the material itself|Do not supply a plot/.test(develop.decision.objective + develop.block), develop.decision.reasonCode);
}

console.log('\n=== a standing claim must need more than the word "I" ===');
{
  // MEASURED FALSE POSITIVES, before the fix: "I write this in Python
  // usually", "i do this every day at work", "I want to make it faster" and
  // "I will do this later" all set ownWork — which flips the conversation to
  // authorship-theirs permanently and makes Socria refuse to write anything.
  for (const t of ['I write this in Python usually', 'i do this every day at work', 'I want to make it faster', 'I will do this later', 'I write tests first']) {
    ok(`"${t}" is not a claim on the work`, readSignals(t).ownWork === false);
  }
  for (const t of ['I will write it myself', 'I want to do this on my own', "don't do it for me"]) {
    ok(`"${t}" is`, readSignals(t).ownWork === true);
  }
  // The short answer to the question still lands, because it is anchored.
  ok('"I\'ll do it" as a whole message still counts', readSignals("I'll do it").ownWork === true);
}

console.log('\n=== gate 1: mechanical work is never interrogated ===');
{
  // The friction of a clarification is only worth paying when the work is
  // worth owning. Nobody wants to be asked whether they meant to look up the
  // default isolation level themselves.
  for (const [t, over] of [
    ['what is the default isolation level in Postgres?', { work: 'information', taskKind: 'lookup', latest: 'question' }],
    ['convert this to UTC', { work: 'execution', latest: 'request' }],
    ['what does this error mean: TypeError: cannot read length of undefined', { work: 'diagnosis', taskKind: 'debug', latest: 'information' }],
    ['format this as a table', { work: 'execution', latest: 'request' }],
    ['remind me what the deadline was', { work: 'information', latest: 'question' }],
    ['how do i get Postgres to use a partial index', { work: 'information', latest: 'question' }],
  ]) {
    const r = turn(t, over);
    ok(`"${t.slice(0, 40)}…" is never asked whose it is`, r.decision.type !== 'CLARIFY' && r.own !== 'ambiguous', `${r.own}/${r.decision.type}`);
  }
  ok('and a debugging turn is outside this entirely', read('help me figure out why this build keeps failing', { work: 'diagnosis' }) === null);
  ok('as is checking their attempt', read('is this right?', { latest: 'attempt', attempt: 'wrong' }) === null);
}

console.log('\n=== gate 2: anything they have said settles it ===');
{
  // Standing contracts, not a new system: the same signals and state fields
  // the allocator already treats as instructions.
  ok('a bare "write the summary" is read as substantial', read('write the summary', {}) === 'ambiguous');
  const direct = turn('write the summary', { ...CREATE, directness: { value: 'answer', source: 'explicit', confidence: 1, evidence: 'just tell me' } });
  // A standing "just tell me" buys silence, not authorship: nothing is asked,
  // and the substance is still theirs to originate.
  ok('  and with it recorded, nothing is asked', direct.decision.maxQuestions === 0 && direct.decision.type !== 'CLARIFY', `${direct.own}/${direct.decision.type}`);
  ok('  while the substance stays theirs', direct.own === 'theirs', String(direct.own));

  const theirs = turn('write the conclusion', { ...CREATE, authorship: { value: 'theirs', source: 'explicit', confidence: 1, evidence: 'it has to be my own words' } });
  ok('a standing authorship claim keeps it theirs', theirs.own === 'theirs', String(theirs.own));
  ok('  and the withhold machinery, not a new one, handles it', !!theirs.allocation.withhold);

  const practising = turn('solve it', { taskKind: 'learn', work: 'practice', latest: 'request', learningGoal: { value: 'yes', source: 'explicit', confidence: 1, evidence: 'I want to learn this' } });
  ok('an explicit practice goal keeps it theirs', practising.own === 'theirs' || practising.allocation.mode === 'HUMAN_PRACTICES', `${practising.own}/${practising.allocation.mode}`);

  ok('"stop asking me questions" delegates outright',
    read('write the post and stop asking me questions') === 'delegated');
}

console.log('\n=== gate 3: asked once, and never at the cost of the work ===');
{
  // ONE QUESTION, AND ONLY WHEN IT IS AVAILABLE. The question left is the useful
  // one — what have you got? — and asking it twice in a row is the loop Core 4
  // exists to prevent. When it cannot be asked, the words they DID use become
  // the material and the turn works with exactly those.
  const already = [{ type: 'CLARIFY', reason: 'creation.elicit', asked: true }];
  const again = turn('write a poem', CREATE, already);
  ok('having asked once, it does not ask again', again.decision.type !== 'CLARIFY', again.decision.type);
  ok('  it works with their own words instead', again.decision.reasonCode === 'creation.elicit.again', again.decision.reasonCode);
  ok('  taking them literally', /take them literally and work with exactly those/.test(again.decision.objective));
  ok('  and still originating nothing',
    /Do NOT supply a plot, character, premise, theme, title, concept, name or direction of your own/.test(again.decision.objective));
  ok('  at a ceiling a finished artifact cannot fit inside', again.decision.maxTokens <= 250, String(again.decision.maxTokens));

  const spent = [{ type: 'ANSWER', asked: true }, { type: 'ANSWER', asked: true }];
  const noBudget = turn('write a poem', CREATE, spent);
  ok('with the question budget spent it does not ask either', noBudget.decision.type !== 'CLARIFY');

  const told = turn('write a poem, and stop asking me questions', CREATE);
  ok('told not to ask, it does not', told.decision.type !== 'CLARIFY', told.decision.type);
  ok('  and the substance is still theirs', told.own === 'theirs', String(told.own));
}

console.log('\n=== THE WHOLE LOOP, which is the only thing that matters ===');
{
  // Every assertion above is a single turn. The feature is three turns, and it
  // was broken at both seams: the answer turn was capped at 220 tokens with
  // "reply in one or two sentences" (a one-word message reads as an opening to
  // the length policy, and the question is engineered to be answered in one
  // word), and the delegation was recorded as authorship=shared and never read
  // back, so the turn after asked whose it was all over again.
  let prior = null;
  const step = (said) => {
    const signals = readSignals(said);
    const read = { ...EMPTY_STATE, currentFocus: said, ...CREATE };
    const state = mergeState({ prior, read, signals, contract: NO_SIGNALS, readOk: true });
    const dim = diminishingReturns(state, signals, []);
    const budget = budgetFrom(state, signals, 0, 0, dim);
    const allocation = allocate({ state, signals, contract: NO_SIGNALS, lastUserText: said });
    const decision = selectIntervention({ state, allocation, budget, diminishing: dim, signals, considered: [], lastUserText: said });
    // The same memo finishTurn writes — including `reason`, without which the
    // engine cannot tell one CLARIFY from another and asks the same question
    // twice.
    prior = recordTurn(state, { type: decision.type, reason: decision.reasonCode, family: decision.type, questions: decision.maxQuestions, withheld: !!allocation.withhold, failed: false });
    return { allocation, decision, state };
  };

  // THE LOOP THIS SUITE WAS WRITTEN FOR WAS "ask whose it is, hear 'yours',
  // write it". The middle step is gone: "yours" is somebody offering Socria the
  // origination of their work, and there is no state in which that transfers.
  // What the loop has to do now is stay USEFUL across the three turns without
  // ever asking the same thing twice and without ever writing their story.
  const t1 = step('write a story');
  ok('turn 1 asks for theirs, once', t1.decision.type === 'CLARIFY' && t1.decision.maxQuestions === 1);
  ok('  and it is the fragment question', t1.decision.reasonCode === 'creation.elicit', t1.decision.reasonCode);

  const t2 = step('yours');
  ok('turn 2 does not take the work', t2.allocation.ownership === 'theirs', String(t2.allocation.ownership));
  ok('  and does not ask again', t2.decision.type !== 'CLARIFY', t2.decision.type);
  // "yours" is somebody handing it over, so the reply does everything except the
  // one thing only they can supply — at length, and without a question.
  ok('  it does every other part instead',
    t2.decision.reasonCode === 'creation.asked.to.finish', t2.decision.reasonCode);
  ok('  with no question back', t2.decision.maxQuestions === 0);
  ok('  at a real ceiling, not a consolation reply', t2.decision.maxTokens >= 600, String(t2.decision.maxTokens));
  ok('  naming in one sentence the thing only they can give',
    /name the single thing only they can supply/.test(t2.decision.objective));

  const t3 = step('write another one, about a lighthouse');
  ok('turn 3 does not ask either', t3.decision.type !== 'CLARIFY', t3.decision.type);
  ok('  and the substance is still theirs', t3.allocation.ownership === 'theirs', String(t3.allocation.ownership));
  ok('  while a lighthouse — which is THEIRS — is something to work with',
    /lighthouse/.test(t3.state.currentFocus ?? ''), t3.state.currentFocus);
}

console.log('\n=== the same loop, the other way ===');
{
  let prior = null;
  const step = (said) => {
    const signals = readSignals(said);
    const state = mergeState({ prior, read: { ...EMPTY_STATE, currentFocus: said, ...CREATE }, signals, contract: NO_SIGNALS, readOk: true });
    const dim = diminishingReturns(state, signals, []);
    const allocation = allocate({ state, signals, contract: NO_SIGNALS, lastUserText: said });
    const decision = selectIntervention({ state, allocation, budget: budgetFrom(state, signals, 0, 0, dim), diminishing: dim, signals, considered: [], lastUserText: said });
    // The same memo finishTurn writes — including `reason`, without which the
    // engine cannot tell one CLARIFY from another and asks the same question
    // twice.
    prior = recordTurn(state, { type: decision.type, reason: decision.reasonCode, family: decision.type, questions: decision.maxQuestions, withheld: !!allocation.withhold, failed: false });
    return { allocation, decision, state };
  };
  step('write a story');
  const mine = step('mine');
  ok('"mine" keeps the work', mine.allocation.ownership === 'theirs', String(mine.allocation.ownership));
  const next = step('write another one, about a lighthouse');
  ok('  and it stays theirs on the next turn too', next.allocation.ownership === 'theirs', String(next.allocation.ownership));
  // It may ask ONCE for their material — the only move on an empty page under
  // their ownership — but never twice, and it never fills the page itself.
  ok('  and never originates the substance', !/two or three concrete, specific directions/.test(next.block));
  ok('  and having asked once, works from their words instead of asking again',
    mine.decision.reasonCode !== 'creation.elicit' || next.decision.reasonCode === 'creation.elicit.again',
    `${mine.decision.reasonCode} -> ${next.decision.reasonCode}`);
}

console.log('\n=== the answer carries their words, or the protection is hollow ===');
{
  // FOUND BY THE RUNNER'S STRICT MODE, not by the suite: this file passed
  // standalone and crashed inside `npm test`, which sets CORE4_STRICT=1.
  // Council D6 requires a withhold to carry the person's own quote, and
  // without one `alloc` DROPS the withhold in production rather than throwing.
  // So somebody answering "mine" set authorship = theirs with an empty quote,
  // and the withhold meant to protect their work silently did not apply — the
  // protection was hollow exactly where it mattered.
  for (const t of ['mine', 'yours', 'mine i think', 'yours, go ahead']) {
    ok(`"${t}" is recorded with what they said`, readSignals(t).evidence.length > 0, JSON.stringify(readSignals(t).evidence));
  }
  // And the withhold it produces actually survives being built.
  const theirs = turn('write the conclusion', { ...CREATE, authorship: { value: 'theirs', source: 'explicit', confidence: 1, evidence: 'it has to be my own words' } });
  ok('the withhold exists and carries a quote', !!theirs.allocation.withhold?.quote, JSON.stringify(theirs.allocation.withhold?.quote));
}

console.log('\n=== a hedged answer is still an answer ===');
{
  // The question is written to be answerable in a word, so people answer it in
  // a word plus a hedge. Measured as unheard before this — the question was
  // asked and the answer ignored, which is worse than never asking.
  for (const t of ['yours, go ahead', 'definitely yours', 'yours please']) ok(`"${t}"`, readSignals(t).delegate === true);
  for (const t of ['mine i think', 'mine, let me try']) ok(`"${t}"`, readSignals(t).ownWork === true);
  // And a long sentence that merely contains the word is not an answer to it.
  ok('a sentence that merely contains "yours" is not',
    readSignals('the deadline is yours to set but the essay is what worries me').delegate === false);
}

console.log('\n=== the answer to the question is heard ===');
{
  // The loop closes through the signals the allocator already reads. An
  // ownership question whose answer is not heard is worse than never asking.
  ok('"yours" hands it over', readSignals('yours').delegate === true);
  ok('"you do it" hands it over', readSignals('you do it').delegate === true);
  ok('"mine" keeps it', readSignals('mine').ownWork === true);
  ok('"let me" keeps it', readSignals('let me').ownWork === true);
  ok('"I\'ll write it myself" keeps it', readSignals("I'll write it myself").ownWork === true);
  // And a long message that merely contains the word is not an answer to it.
  ok('a sentence about somebody else\'s work is not an answer',
    readSignals('the deadline is yours to set but the essay is what worries me').delegate === false);
}

console.log('\n=== a brief carries its own delegation ===');
{
  for (const t of [
    'write a 200 word cover letter for a junior analyst role at a bank',
    'draft an email to my landlord about the broken boiler, firm but not rude',
    'give me three possible story premises',
  ]) {
    const r = turn(t, CREATE);
    ok(`"${t.slice(0, 42)}…" is commissioned, not interrogated`, r.own === 'scoped' && r.decision.type !== 'CLARIFY', `${r.own}/${r.decision.type}`);
    ok('  at a real ceiling', r.decision.maxTokens >= 1000, String(r.decision.maxTokens));
  }
}

console.log('\n=== style cannot decide whose work it is ===');
{
  // 1. their instructions 2. Human-First allocation 3. completion 4. style.
  const withPrefs = (prefs) => {
    const said = 'write a story';
    const state = { ...EMPTY_STATE, currentFocus: said, ...CREATE };
    const signals = readSignals(said);
    const dim = diminishingReturns(state, signals, []);
    const budget = budgetFrom(state, signals, 0, 0, dim);
    const allocation = allocate({ state, signals, contract: NO_SIGNALS, lastUserText: said });
    return selectIntervention({ state, allocation, budget, diminishing: dim, signals, considered: [], lastUserText: said, prefs });
  };
  for (const prefs of [{ readability: 'simple', length: 'concise' }, { readability: 'advanced', length: 'detailed' }]) {
    const d = withPrefs(prefs);
    ok(`${prefs.readability}/${prefs.length}: the move is unchanged by presentation`, d.type === 'CLARIFY' && d.maxTokens <= 300, `${d.type}/${d.maxTokens}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
