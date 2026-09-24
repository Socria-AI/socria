// "Write me a story" came back as a long generic story.
//
// THE REPORT, and what made it a Human-First failure rather than a length one:
// nobody had asked for a story about anything. The reply was a guess at what
// somebody wanted, delivered as a finished artifact — and making the guess
// WAS the work. Whatever the story was about, it was not theirs.
//
// TRACED, not guessed. Every layer behaved as designed. Nothing was withheld,
// which is correct: council D6 withholds only on an explicit statement, and
// inferring "you probably want to write this yourself" is exactly the paternal
// reading the allocator was built to stop. The move was ANSWER, which is
// correct: they asked. The ceiling was 1200, because `proportionFor` exempts
// anything that reads as a request. So the gap was not in any of them — it was
// that no layer asked the question Human-First exists to ask: would producing
// this take over the work that was the point?
//
// THE FIX IS A READ, NOT A REFUSAL (allocation.ts generationRead). Four
// answers, and the two that change anything both still produce real work:
//
//   delegated   they said the output is what they want → make it
//   scoped      the ask determines the artifact → make it
//   unscoped    a bare imperative with nothing to decide what the thing is →
//               a small real piece of it, then the one question that settles
//               the rest
//   developing  they asked to develop it → material to develop WITH, never the
//               artifact, which would end the activity
//
// HALF THIS SUITE IS THE OPPOSITE FAILURE, which is on record from runs 4-6:
// an expert asking for a thing and getting an interview instead. Every
// "must still be produced" case below is load-bearing.

import { EMPTY_STATE } from './.tmp/state.mjs';
import { readSignals, NO_SIGNALS } from './.tmp/signals.mjs';
import { allocate, generationRead } from './.tmp/allocation.mjs';
import { budgetFrom, diminishingReturns } from './.tmp/budget.mjs';
import { selectIntervention, renderDecision } from './.tmp/intervene.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

/** One full turn, from their words to the decision the prompt is built from. */
function turn(said, over = {}, history = []) {
  const state = { ...EMPTY_STATE, currentFocus: said, history, ...over };
  const signals = said ? readSignals(said) : NO_SIGNALS;
  const dim = diminishingReturns(state, signals, []);
  const budget = budgetFrom(state, signals, history.filter((h) => h.asked).length, 0, dim);
  const allocation = allocate({ state, signals, contract: NO_SIGNALS, lastUserText: said });
  const decision = selectIntervention({ state, allocation, budget, diminishing: dim, signals, considered: [], lastUserText: said });
  return { allocation, decision, block: renderDecision(decision, allocation) };
}
const read = (t, over = {}) => generationRead(t, readSignals(t), { ...EMPTY_STATE, ...over });

const CREATE = { taskKind: 'create', work: 'creation', latest: 'request' };
const TALK = { taskKind: 'explore', work: 'conversation', latest: 'request' };

// ─────────────────────────────────────────────────────────────────────

console.log('=== the reported bug ===');
{
  const r = turn('write me a story', CREATE);
  ok('it is no longer a finished artifact’s ceiling', r.decision.maxTokens <= 450, String(r.decision.maxTokens));
  ok('  the allocator is what decided that', r.allocation.generation === 'unscoped' && r.allocation.reasonCode === 'creation.unscoped');
  ok('  and nothing is withheld or refused', r.allocation.withhold === null);
  // The distinction the whole fix rests on: this is not "ask them what they
  // want". They get a real piece of writing, first.
  // Asserted on the RENDERED block, not on the objective: an unforced turn
  // never prints its objective (council D1 — the model picks the move), so an
  // instruction left there would reach nobody. That is how the first version
  // of this fix would have failed silently.
  ok('the reply still contains real work, and it comes first',
    /make a SMALL, REAL piece of it/.test(r.block) && /put it first/.test(r.block));
  ok('  and it is explicitly not the finished thing', /not the finished thing/.test(r.block));
  ok('  nor a description of the thing', /Not a description of what you would write/.test(r.block));
  ok('one question, at most, and never a menu',
    /ask the ONE thing that most decides the rest/.test(r.block) && /not a menu of options/.test(r.block));
  ok('  budgeted as one', r.decision.maxQuestions === 1);
  ok('no apologising and no offering to write more',
    /do not apologise for the length/.test(r.block) && /do not close by offering to write more/.test(r.block));
  ok('  and the SCOPE clause is what carries it', /^SCOPE: they asked you to make something/m.test(r.block));
}

console.log('\n=== explicit delegation is honoured, which is also Human-First ===');
{
  // Agency includes the right to delegate. This is the case that must NOT get
  // the smaller first move, and it is why the read is not a blanket gate on
  // generative asks.
  const r = turn('write this story for me, I just need the finished thing', CREATE);
  ok('they said the output is what they want', r.allocation.generation === 'delegated', String(r.allocation.generation));
  ok('  so the ceiling is the artifact’s', r.decision.maxTokens >= 1000, String(r.decision.maxTokens));
  ok('  and nothing asks them anything', r.decision.maxQuestions === 0);
  ok('  the reply is the thing itself', /creation\.delegated|execution/.test(r.decision.reasonCode), r.decision.reasonCode);

  for (const t of [
    'just write it, I don’t care what it’s about',
    'write the email, you decide the details',
    'draft it and I’ll edit — whatever you think',
    'write it up, ready to send',
  ]) ok(`"${t.slice(0, 40)}…" is delegation`, read(t) === 'delegated', String(read(t)));

  // Their standing instructions reach it too, not only this sentence.
  ok('"just tell me" is delegation', read('just tell me, write the post') === 'delegated');
  ok('"stop asking me questions" is delegation',
    generationRead('write the post', { ...readSignals('write the post'), stopQuestions: true }, EMPTY_STATE) === 'delegated');
}

console.log('\n=== a request that carries its own brief is produced ===');
{
  // A count, an audience, a purpose, a length, or material — any two, or one
  // in a request long enough to have said something.
  const scoped = [
    'give me three possible story premises',
    'write a 200 word cover letter for a junior analyst role at a bank',
    'draft an email to my landlord about the broken boiler, firm but not rude',
    'write a short poem about my grandmother’s garden for her birthday card',
  ];
  for (const t of scoped) {
    const r = turn(t, CREATE);
    ok(`"${t.slice(0, 44)}…" is produced`, r.allocation.generation === 'scoped', String(r.allocation.generation));
    ok('  at a real ceiling', r.decision.maxTokens >= 1000, String(r.decision.maxTokens));
  }
  // Their own material scopes it: a rewrite is determined by the thing itself.
  ok('a rewrite of what they pasted is scoped', read('rewrite my intro paragraph') === 'scoped');
  ok('a summary of their material is scoped', read('summarise this email thread') === 'scoped');
}

console.log('\n=== asking to develop it is not asking for it ===');
{
  for (const [t, over] of [
    ['help me develop a story idea', CREATE],
    ['help me think through what this email should say', TALK],
    ['help me brainstorm angles for this essay', TALK],
  ]) {
    const r = turn(t, over);
    ok(`"${t.slice(0, 42)}…" develops`, r.allocation.generation === 'developing', String(r.allocation.generation));
    ok('  and the piece is not written for them', /Do not write the piece itself/.test(r.block));
    ok('  they get concrete directions, not questions', /two or three concrete, specific directions/.test(r.block) && r.decision.maxQuestions === 0);
    ok('  with room to say them', r.decision.maxTokens >= 400, String(r.decision.maxTokens));
  }
}

console.log('\n=== MUST NOT FIRE: the turns that are not about making anything ===');
{
  // This is the half that stops the fix becoming the bug it replaced. A read
  // that fires here turns a debugging turn into an interview.
  const notGenerative = [
    'what is the default isolation level in Postgres?',
    'help me figure out why this build keeps failing',
    'is my proof of the intermediate value theorem right?',
    'so March then?',
    'I keep going back and forth on whether the gap year reads as evasive',
    'what does this error mean: TypeError: cannot read length of undefined',
  ];
  for (const t of notGenerative) ok(`"${t.slice(0, 44)}…" is not a generative ask`, read(t) === null, String(read(t)));

  const fact = turn('what is the default isolation level in Postgres?', { work: 'information', taskKind: 'lookup', latest: 'question' });
  ok('a factual question still answers directly', fact.decision.type === 'ANSWER' && fact.decision.maxTokens >= 1000);
  ok('  with no question back', fact.decision.maxQuestions === 0);
  ok('  and no small-start instruction', !/SCOPE:/.test(fact.block));

  const fix = turn('the checkout total is wrong for 3 of 200 orders, here is the function', { work: 'diagnosis', taskKind: 'debug', latest: 'information' });
  ok('a debugging turn is untouched', fix.allocation.generation === null && fix.decision.maxTokens >= 1000);

  const attempt = turn('I tried it and got 2x cos x, is that right?', { work: 'verification', latest: 'attempt', attempt: 'wrong' });
  ok('checking their work is untouched', attempt.allocation.generation === null || attempt.allocation.generation === 'scoped');
  ok('  and still gets the correction', /verify|correct/i.test(attempt.decision.reasonCode), attempt.decision.reasonCode);
}

console.log('\n=== it does not bring back constant questioning ===');
{
  // The unscoped move asks at most one, and only if the budget has one. A
  // second one in a row is exactly the loop Core 4 was built to stop.
  const spent = [{ type: 'ANSWER', asked: true }, { type: 'ANSWER', asked: true }];
  const r = turn('write me a poem', CREATE, spent);
  ok('with the budget spent, it asks nothing', r.decision.maxQuestions === 0, String(r.decision.maxQuestions));
  ok('  and says what it assumed instead', /say in one clause what you assumed/.test(r.block));
  ok('  while still producing the small real piece', /make a SMALL, REAL piece of it/.test(r.block));

  // "Stop asking me questions" is an instruction, and it outranks the read.
  const told = turn('write me a poem, and stop asking me questions', CREATE);
  ok('an instruction not to ask is honoured outright', told.decision.maxQuestions === 0);
  ok('  by treating it as delegation', told.allocation.generation === 'delegated');
}

console.log('\n=== analytical work: delegation and authorship differ the same way ===');
{
  const unscoped = turn('write a competitive analysis', { taskKind: 'create', work: 'creation', latest: 'request' });
  ok('a bare "write an analysis" is unscoped', unscoped.allocation.generation === 'unscoped', String(unscoped.allocation.generation));

  const scoped = turn('write a competitive analysis of the three EV charging networks we discussed, for the board', { taskKind: 'create', work: 'creation', latest: 'request' });
  ok('the same ask with its subject and audience is produced', scoped.allocation.generation === 'scoped', String(scoped.allocation.generation));
  ok('  at a real ceiling', scoped.decision.maxTokens >= 1000);

  const theirs = turn('help me think through the argument for the board', TALK);
  ok('thinking it through with them is development', theirs.allocation.generation === 'developing', String(theirs.allocation.generation));
}

console.log('\n=== the priority order, as behaviour ===');
{
  // 1. their instructions 2. Human-First allocation 3. completion 4. style.
  // Style must never be able to shrink a reply below the work the allocator
  // assigned: a Concise preference cannot delete the small real piece.
  const concise = turn('write me a story', CREATE);
  ok('the allocator’s ceiling survives the length policy', concise.decision.proportion === 'normal' && concise.decision.maxTokens === 420);
  // And an explicit length they asked for still wins over everything.
  const twoLines = turn('write me a story in two sentences', CREATE);
  ok('a length they stated is theirs', twoLines.decision.proportion === 'normal');
}

console.log('\n=== style cannot decide what work is taken over ===');
{
  // The priority order is 1. their instructions 2. Human-First allocation
  // 3. task completion 4. personality/readability/style. The communication
  // dials change HOW a reply is written; they must not be able to change WHAT
  // Socria does with somebody's work — in either direction.
  const withPrefs = (prefs) => {
    const said = 'write me a story';
    const state = { ...EMPTY_STATE, currentFocus: said, ...CREATE };
    const signals = readSignals(said);
    const dim = diminishingReturns(state, signals, []);
    const budget = budgetFrom(state, signals, 0, 0, dim);
    const allocation = allocate({ state, signals, contract: NO_SIGNALS, lastUserText: said });
    const decision = selectIntervention({ state, allocation, budget, diminishing: dim, signals, considered: [], lastUserText: said, prefs });
    return { allocation, decision, block: renderDecision(decision, allocation) };
  };
  for (const prefs of [
    { readability: 'simple', length: 'concise' },
    { readability: 'advanced', length: 'detailed' },
    { readability: 'standard', length: 'standard' },
  ]) {
    const r = withPrefs(prefs);
    const tag = `${prefs.readability}/${prefs.length}`;
    ok(`${tag}: the allocation is unchanged`, r.allocation.generation === 'unscoped');
    ok(`${tag}: the ceiling is the allocator's`, r.decision.maxTokens === 420, String(r.decision.maxTokens));
    ok(`${tag}: the small real piece survives`, /make a SMALL, REAL piece of it/.test(r.block));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
