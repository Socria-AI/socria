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
  // 1. AMBIGUOUS CREATIVE — the report.
  const story = turn('write a story', CREATE);
  ok('"write a story" is ambiguous ownership', story.own === 'ambiguous', String(story.own));
  ok('  and asks one short line', asked(story) && story.decision.maxTokens <= 120, `${story.decision.type}/${story.decision.maxTokens}`);
  // Asserted on the RENDERED block, not the objective: an unforced turn never
  // prints its objective (council D1 — the model picks the move), so an
  // instruction left there would reach nobody.
  ok('  offering both readings', /you do it for them, or you work on it with them and it stays theirs/.test(story.block));
  ok('  answerable in a word', /Answerable in a word/i.test(story.block));
  ok('  and it does not start the work', /Do not begin the work/.test(story.block));
  ok('  nor name what it is doing', /do not name what you are doing/.test(story.block));
  ok('  and the contradicting default is replaced, not argued with',
    !/help fully: answer what they asked/.test(story.block));

  // 2. AMBIGUOUS REASONING — the half a generation-only reading misses.
  const solve = turn('solve this problem', { taskKind: 'learn', work: 'explanation', latest: 'request' });
  ok('"solve this problem" is ambiguous too', solve.own === 'ambiguous', String(solve.own));

  // 3. EXPLICIT DELEGATION OF JUDGEMENT.
  const decide = turn('decide for me', THINK);
  ok('"decide for me" is delegation', decide.own === 'delegated', String(decide.own));
  ok('  and nothing is asked', decide.decision.maxQuestions === 0 && decide.decision.type !== 'CLARIFY');

  // 4. COLLABORATION — the doing is the point.
  const brainstorm = turn('brainstorm with me', TALK);
  ok('"brainstorm with me" is theirs', brainstorm.own === 'theirs', String(brainstorm.own));
  ok('  so the piece is not written for them', /Do not write the piece itself/.test(brainstorm.block));
  ok('  and it is not a question', brainstorm.decision.maxQuestions === 0);

  // 5. AMBIGUOUS, AND THE COMMONEST ONE IN A WORKING DAY.
  const email = turn('write this email', CREATE);
  ok('"write this email" is ambiguous', email.own === 'ambiguous', String(email.own));
  ok('  and asks rather than writing it', asked(email));

  // 6. THEIR MATERIAL, THEIR ASK — no question earned.
  const improve = turn('improve my paragraph', CREATE);
  ok('"improve my paragraph" is scoped by their material', improve.own === 'scoped', String(improve.own));
  ok('  and is not interrogated', improve.decision.type !== 'CLARIFY');

  // 7. EXPLICIT DELEGATION.
  const give = turn('give me the answer', { taskKind: 'learn', work: 'explanation', latest: 'request' });
  ok('"give me the answer" is delegation', give.own === 'delegated' || give.decision.type !== 'CLARIFY', String(give.own));
  ok('  and it answers', give.decision.maxQuestions === 0);

  // 8. HUMAN OWNERSHIP, STATED AS A REQUEST FOR HELP.
  const figure = turn('help me figure it out', { taskKind: 'learn', work: 'explanation', latest: 'request' });
  ok('"help me figure it out" is theirs', figure.own === 'theirs', String(figure.own));
  ok('  and does not become an interview', figure.decision.type !== 'CLARIFY');

  // 9. "JUST DO IT".
  const justDo = turn('just do it', CREATE);
  ok('"just do it" is delegation', justDo.own === 'delegated', String(justDo.own));
  ok('  and asks nothing', justDo.decision.maxQuestions === 0);

  // 10. "DON'T DO IT FOR ME" — and the regex trap inside it.
  const dont = turn("don't do it for me", CREATE);
  ok('"don\'t do it for me" is theirs, not delegation', dont.own === 'theirs', String(dont.own));
  ok('  the delegation pattern inside its own negation does not win',
    readSignals("don't do it for me").delegate === false);
  ok('  and it is not asked whose it is — they said', dont.decision.type !== 'CLARIFY');
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
    ok(`latest=${latest}: ownership still decides`, r.own === 'ambiguous' && r.decision.type === 'CLARIFY', `${r.own}/${r.decision.type}/${r.decision.maxTokens}`);
    ok(`  and the ceiling is not the artifact's`, r.decision.maxTokens <= 120, String(r.decision.maxTokens));
  }
  // The same for the other side: a turn whose ownership is theirs must not be
  // rescued by the label either.
  for (const latest of ['information', 'other']) {
    const r = turn('help me develop this essay idea', { taskKind: 'create', work: 'creation', latest });
    ok(`latest=${latest}: theirs is honoured too`, r.own === 'theirs' && /Do not write the piece itself/.test(r.block), `${r.own}`);
  }
}

console.log('\n=== THE BLANK-REPLY BLOCKER: the question is the thing this product deletes ===');
{
  // MEASURED, and it is the worst failure a reply can have. The ownership
  // question is syntactically a closing offer — "do you want me to write it,
  // or would you rather write it yourself?" — and Core 4 spent its life
  // removing exactly that shape. Three of five natural phrasings were stripped
  // to NOTHING by the sentence gate, so the person got a blank message.
  const r = turn('write a story', CREATE);
  ok('the ask is read whole, never streamed through the gate', r.decision.guardRequired === true);
  ok('  which is what keeps an offer-shaped reply from being deleted mid-stream', r.decision.type === 'CLARIFY');
  ok('the prompt forbids the offer shape outright', /never as an offer of help/.test(r.block));
  ok('  naming the three phrasings that produced it', /do not name what you are doing|would you like me to/.test(r.block) && /shall I/.test(r.block));
  ok('  and gives the shape that survives', /"yours, or mine\?" is the shape/i.test(r.block));
}

console.log('\n=== a clause written for one move is not printed over another ===');
{
  // `allocate()` attaches the ownership read to EVERY allocation, including
  // the modes whose branches never act on it. Keyed on the allocation alone,
  // an EXPLAIN turn at a 1200-token ceiling was told to write four sentences
  // and stop — two instructions about length, disagreeing, in one prompt.
  const explain = turn('explain how to write a story arc', { taskKind: 'learn', work: 'explanation', latest: 'question' });
  ok('the read is still attached', explain.own === 'ambiguous', String(explain.own));
  ok('  but the clause is not printed', !/AT MOST FOUR SENTENCES/.test(explain.block));
  ok('  and the ceiling is the move\'s own', explain.decision.maxTokens >= 1000, String(explain.decision.maxTokens));
  ok('  while the move that asked for it still gets it',
    /WHOSE WORK IS THIS/.test(turn('write a story', CREATE).block));
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
  ok('a standing "just tell me" delegates', read('write the summary', {}, ) === 'ambiguous');
  const direct = turn('write the summary', { ...CREATE, directness: { value: 'answer', source: 'explicit', confidence: 1, evidence: 'just tell me' } });
  ok('  and with it recorded, nothing is asked', direct.own === 'delegated', String(direct.own));

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
  // A second ownership question in a row is the loop Core 4 exists to prevent.
  const already = [{ type: 'CLARIFY', asked: true }];
  const again = turn('write a poem', CREATE, already);
  ok('having asked once, it does not ask again', again.decision.type !== 'CLARIFY', again.decision.type);
  ok('  it starts instead of stalling', again.decision.reasonCode === 'ownership.start', again.decision.reasonCode);
  ok('  bounded to four sentences', /AT MOST FOUR SENTENCES/.test(again.block));
  ok('  at a ceiling a finished artifact cannot fit inside', again.decision.maxTokens === 200, String(again.decision.maxTokens));
  ok('  and it says what it took the job to be', /what you took the job to be/.test(again.block));
  ok('  in its own words, not as a form', /Not a labelled "Assumption:" line/.test(again.block));

  const spent = [{ type: 'ANSWER', asked: true }, { type: 'ANSWER', asked: true }];
  const noBudget = turn('write a poem', CREATE, spent);
  ok('with the question budget spent it also starts', noBudget.decision.type !== 'CLARIFY');

  const told = turn('write a poem, and stop asking me questions', CREATE);
  ok('told not to ask, it does not', told.decision.type !== 'CLARIFY' && told.own === 'delegated');
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
    prior = recordTurn(state, { type: decision.type, asked: decision.maxQuestions > 0, withheld: !!allocation.withhold, failed: false });
    return { allocation, decision, state };
  };

  const t1 = step('write a story');
  ok('turn 1 asks whose it is', t1.decision.type === 'CLARIFY' && t1.decision.maxQuestions === 1);

  const t2 = step('yours');
  ok('turn 2 hears the answer', t2.allocation.ownership === 'delegated', String(t2.allocation.ownership));
  ok('  and is given room to actually write it', t2.decision.maxTokens >= 1000, String(t2.decision.maxTokens));
  ok('  with no question back', t2.decision.maxQuestions === 0 && t2.decision.type !== 'CLARIFY');
  ok('  and the delegation is recorded as a contract', t2.state.authorship.source === 'explicit', `${t2.state.authorship.value}/${t2.state.authorship.source}`);

  const t3 = step('write another one, about a lighthouse');
  ok('turn 3 does not ask again', t3.decision.type !== 'CLARIFY', t3.decision.type);
  ok('  because the contract is read back', t3.allocation.ownership === 'delegated', String(t3.allocation.ownership));
  ok('  and it writes', t3.decision.maxTokens >= 1000, String(t3.decision.maxTokens));
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
    prior = recordTurn(state, { type: decision.type, asked: decision.maxQuestions > 0, withheld: !!allocation.withhold, failed: false });
    return { allocation, decision, state };
  };
  step('write a story');
  const mine = step('mine');
  ok('"mine" keeps the work', mine.allocation.ownership === 'theirs', String(mine.allocation.ownership));
  const next = step('write another one, about a lighthouse');
  ok('  and it stays theirs on the next turn too', next.allocation.ownership === 'theirs', String(next.allocation.ownership));
  ok('  without asking again', next.decision.type !== 'CLARIFY');
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
    ok(`${prefs.readability}/${prefs.length}: still the ownership question`, d.type === 'CLARIFY' && d.maxTokens <= 120);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
