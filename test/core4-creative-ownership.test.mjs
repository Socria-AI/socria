// HUMAN-OWNED COGNITION: Socria may develop it, and may not originate it.
//
// THE REPORT: "write me a story" → "yours, or mine?" → "mine" → and Socria
// invented the protagonist, the setting, the discovery, the motivations and
// the conflict. The person had said, in one word, that the creative act was
// theirs, and the creative act was performed anyway.
//
// WHY IT PASSED EVERY EXISTING CHECK. Nothing was rewritten — there was
// nothing to rewrite. No question was over budget. No tool was claimed. The
// withhold was real and was honoured to the letter: it said "a replacement
// version of their work", and originating a premise replaces nothing. Then the
// move chosen was CRITIQUE — critique of an empty page, at a 1200-token
// ceiling, with "options where useful" — and a model told to critique nothing
// invents something to critique. The instruction to take over was written into
// the objective by the system itself.
//
// THE INVARIANT, now enforced in three places rather than hoped for in one:
//   allocation  the withhold names ORIGINATION, not replacement
//   intervene   an empty page elicits their fragment; it never critiques or
//               offers directions
//   guard2      a proposal frame carrying substance they never supplied is
//               caught by MEANING, whatever the phrasing
//
// AND IT MUST NOT BECOME UNDER-HELP. Half this suite is the opposite failure:
// retrieval, explanation, critique of real material, delegated work and
// mechanical turns must all still happen in full.

import { EMPTY_STATE } from './.tmp/state.mjs';
import { readSignals, NO_SIGNALS } from './.tmp/signals.mjs';
import { mergeState, recordTurn } from './.tmp/merge.mjs';
import { allocate } from './.tmp/allocation.mjs';
import { budgetFrom, diminishingReturns } from './.tmp/budget.mjs';
import { selectIntervention, renderDecision, hasOwnMaterial } from './.tmp/intervene.mjs';
import { originatesSubstance, guardStructure } from './.tmp/guard2.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const CREATE = { taskKind: 'create', work: 'creation', latest: 'request' };

/** A conversation, turn by turn, through the production-shaped loop. */
function conversation(over = CREATE) {
  let prior = null;
  const said = [];
  return (text, turnOver = {}) => {
    said.push(text);
    const signals = readSignals(text);
    const read = { ...EMPTY_STATE, currentFocus: text, ...over, ...turnOver };
    const state = mergeState({ prior, read, signals, contract: NO_SIGNALS, readOk: true });
    const dim = diminishingReturns(state, signals, []);
    const budget = budgetFrom(state, signals, 0, 0, dim);
    const allocation = allocate({ state, signals, contract: NO_SIGNALS, lastUserText: text });
    const decision = selectIntervention({
      state, allocation, budget, diminishing: dim, signals, considered: [],
      lastUserText: text, material: hasOwnMaterial(said),
    });
    prior = recordTurn(state, { type: decision.type, reason: decision.reasonCode, family: decision.type, questions: decision.maxQuestions, withheld: !!allocation.withhold, failed: false });
    return { allocation, decision, state, block: renderDecision(decision, allocation), own: allocation.ownership };
  };
}

// ─────────────────────────────────────────────────────────────────────

console.log('=== THE REPORTED SEQUENCE ===');
{
  // THE SEQUENCE CHANGED SHAPE WHEN "yours, or mine?" WENT. Turn 1 no longer
  // asks who owns it — there is no state in which Socria takes it — so it asks
  // the useful question instead, and "mine" lands on a turn that has already
  // been told the substance is theirs.
  const say = conversation();
  const t1 = say('write me a story');
  ok('it asks for THEIR first fragment', t1.decision.type === 'CLARIFY' && t1.decision.reasonCode === 'creation.elicit', t1.decision.reasonCode);
  ok('  with no example of a finished idea, because that IS the creative act',
    /no example of a finished idea — an example IS the creative act/.test(t1.decision.objective));
  ok('  and nothing of the material itself',
    /Do NOT supply the material itself/.test(t1.decision.objective));
  // Naming a KIND of starting point is the method; naming a specific one is the
  // thing itself. The reply has room for the method now — a question-only turn
  // is the under-help failure — so what stops a smuggled idea is the objective
  // and the guard reading the whole reply, not a two-sentence ceiling.
  ok('  drawn at kind versus instance', /Naming a KIND of starting point is method/.test(t1.decision.objective));
  ok('  and it is read whole before anybody sees it', t1.decision.guardRequired === true);

  const t2 = say('mine');
  ok('"mine" is heard', t2.own === 'theirs', String(t2.own));
  ok('  and it does not ask the same thing twice', t2.decision.reasonCode === 'creation.elicit.again', t2.decision.reasonCode);
  ok('  not to critique an empty page', t2.decision.type !== 'CRITIQUE');
  ok('  and still originating nothing',
    /Do NOT supply a plot, character, premise, theme, title, concept, name or direction of your own/.test(t2.decision.objective));

  // WHAT IS WITHHELD IS THE ORIGINATION, which is the hole the report fell
  // through: originating a premise replaces nothing, so a withhold about
  // replacement permitted it.
  ok('the withhold names originating, not replacing', /any substantive creative content of your own/.test(t2.allocation.withhold?.what ?? ''), t2.allocation.withhold?.what);
  ok('  and lists what it covers', /plot|character|premise|theme|title|concept|angle|direction/.test(t2.allocation.withhold?.what ?? ''));
  ok('  while naming what they CAN have', /latent|tension|question|critique|craft/.test(t2.allocation.withhold?.alternative ?? ''));
}

console.log('\n=== OWNERSHIP PERSISTS: a vague message does not reset it ===');
{
  const say = conversation();
  say('write me a story');
  say('mine');
  for (const vague of ['okay help me', 'help', 'go on', 'ok', 'what now']) {
    const r = say(vague);
    ok(`"${vague}" does not hand the work back`, r.own === 'theirs', `${r.own}/${r.decision.reasonCode}`);
  }
  // AND AN EXPLICIT HANDOVER STILL DOES NOT MOVE IT, which is the reversal.
  // "The latest explicit instruction wins" is the right rule for how direct to
  // be, how long to be and whether to ask anything — and the wrong one for who
  // originates the substance. Generating somebody's story on request is
  // cognitive outsourcing whether or not they asked for it; asking is not what
  // makes it useful.
  const handed = say('actually you write it, just do it');
  ok('an explicit handover does not buy the substance', handed.own === 'theirs', String(handed.own));
  ok('  and it does buy silence: no questions', handed.decision.maxQuestions === 0 && handed.decision.type !== 'CLARIFY', handed.decision.type);
  ok('  with every other part done at length', handed.decision.maxTokens >= 400, String(handed.decision.maxTokens));
}

console.log('\n=== THE RED-TEAM SEQUENCE FROM THE BRIEF ===');
{
  const say = conversation({ taskKind: 'create', work: 'creation', latest: 'request' });
  say('help me create a startup idea');
  const mine = say('mine');
  ok('ownership lands', mine.own === 'theirs');
  const help = say('okay help me');
  ok('"okay help me" keeps it theirs', help.own === 'theirs', String(help.own));
  const industries = say('what industries are growing?', { work: 'information', taskKind: 'lookup', latest: 'question' });
  ok('a factual question is still answered', industries.decision.type === 'ANSWER' || industries.decision.type === 'EXPLAIN', industries.decision.type);
  const interesting = say('interesting');
  ok('an acknowledgement does not reset ownership', interesting.own === 'theirs' || interesting.own === null, String(interesting.own));
  const directions = say('give me some directions', { ...CREATE });
  ok('"give me some directions" does not become permission to originate', directions.own === 'theirs', String(directions.own));
  const dont = say('actually don\'t give me ideas', { ...CREATE });
  ok('an explicit refusal keeps it theirs', dont.own === 'theirs', String(dont.own));
  const recap = say('what were we thinking?', { work: 'information', latest: 'question' });
  ok('a recall question does not reset it', recap.own === 'theirs' || recap.own === null, String(recap.own));
}

console.log('\n=== THE GUARD CATCHES TAKEOVER BY MEANING, NOT PHRASING ===');
{
  const theirs = 'I have a lighthouse keeper who stopped writing in the log after his daughter left. The sea is always described as patient.';
  // Every one of these is the same act with different punctuation.
  const takeovers = [
    'Consider a story where a young inventor discovers a hidden world beneath the city.',
    'One angle could be that the protagonist is secretly the villain all along.',
    'What about a rival keeper who arrives with a brighter lamp and a contract?',
    'You might try opening with a shipwreck and flashing back to the wedding.',
    "Here's an idea: the logbook itself becomes a character that answers him.",
    'For example, a drowned sailor could return each night asking for passage.',
    'Imagine the daughter is actually running a smuggling operation from the mainland.',
    'Perhaps a storm strands a stranger at the door on the anniversary.',
  ];
  for (const t of takeovers) ok(`caught: "${t.slice(0, 52)}…"`, originatesSubstance(t, theirs).length > 0);

  // And the help that is the whole point of this mode must pass.
  const legitimate = [
    'The log stopping when she left is the whole story — what did he write on the last page?',
    'Your sea is patient and your keeper is not; that gap is doing more work than the daughter is.',
    'What about the daughter — does she know he stopped writing?',
    'You describe the sea as patient twice and as indifferent once. Which did you mean?',
    'There are two stories here: the one about the log and the one about her leaving. Which are you writing?',
    'The keeper never speaks in what you have. Is that deliberate?',
  ];
  for (const t of legitimate) ok(`passes: "${t.slice(0, 52)}…"`, originatesSubstance(t, theirs).length === 0, JSON.stringify(originatesSubstance(t, theirs)));
}

console.log('\n=== THE GUARD ACTS: a takeover is regenerated, not shipped ===');
{
  const dec = { type: 'CRITIQUE', reasonCode: 'creation.critique', maxQuestions: 0, maxTokens: 1200, coverage: 'normal', proportion: 'normal', questionsAreContent: false, avoid: [], objective: 'x', reason: 'y', intendedOutcome: 'z', humanWorkPreserved: null, aiWorkPerformed: '', confidence: 1, guardRequired: true, switchedFrom: null, forced: false };
  const alloc = {
    mode: 'HUMAN_LEADS', humanWork: [], aiWork: [], announce: false, reasonCode: 'creation.theirs',
    rationale: 'r', confidence: 1, ownership: 'theirs',
    withhold: { what: 'any substantive creative content of your own', reason: 'authorship', evidence: 'mine', source: 'message', quote: 'mine', alternative: 'their own material, developed' },
  };
  const theirs = 'I have a lighthouse keeper who stopped writing in the log after his daughter left.';
  const g = guardStructure({ decision: dec, allocation: alloc, draft: 'Consider a story where a young inventor discovers a hidden world beneath the city.', considered: [], target: theirs });
  // RENAMED: the same check now covers judgement and reasoning as well as
  // creative substance, because it is one failure with three faces.
  ok('it is caught as overreach', g.findings.some((f) => f.code === 'replaced_cognition'), JSON.stringify(g.findings.map((f) => f.code)));
  ok('  and the turn is sent back for more agency', g.action === 'MODIFY_FOR_MORE_AGENCY', g.action);
  ok('  with a note that names what it invented', /Rewrite it using only what THEY have put down/.test(g.retryNote ?? ''), g.retryNote?.slice(0, 80));
  ok('  and closes the phrasing loopholes in the note', /"consider…", "what about…", "one angle could be…" and an example are the same act/.test(g.retryNote ?? ''));

  const clean = guardStructure({ decision: dec, allocation: alloc, draft: 'The log stopping when she left is the whole story. What did he write on the last page?', considered: [], target: theirs });
  ok('real help is not touched', !clean.findings.some((f) => f.code === 'originated_substance'), JSON.stringify(clean.findings.map((f) => f.code)));
}

console.log('\n=== ACROSS THE DOMAINS, not just stories ===');
{
  // Each is a different kind of creative or intellectual origination, and the
  // rule is the same in all of them.
  const domains = [
    ['help me name my company', 'names'],
    ['I want to design a board game', 'game design'],
    ['help me write a poem', 'poetry'],
    ['I need a brand concept for this', 'branding'],
    ['help me come up with an essay topic', 'essay ideas'],
    ['I want to write a song', 'music'],
    ['help me think of a startup idea', 'startups'],
    ['I want to design the visual identity', 'visual concepts'],
  ];
  for (const [opener, label] of domains) {
    const say = conversation();
    say(opener);
    const mine = say('mine');
    ok(`${label}: "mine" keeps origination theirs`, mine.own === 'theirs', `${mine.own}/${mine.decision.reasonCode}`);
    // Either elicit or its once-only follow-up: "help me think of a startup
    // idea" is ALREADY a claim on the work (DEVELOP matches "help me think"),
    // so the fragment was asked for on turn one and asking again would be the
    // friction loop. Both moves share the invariant — work from their words,
    // originate nothing.
    ok(`  ${label}: and it works from their fragment, never its own`,
      /^creation\.elicit/.test(mine.decision.reasonCode), mine.decision.reasonCode);
  }
}

console.log('\n=== asked once, then it works with whatever they gave ===');
{
  // Asking for their fragment twice in a row is the friction loop this product
  // is the opposite of. The second time, their own words — however few — are
  // the material.
  const say = conversation();
  say('write me a story');
  say('mine');
  const again = say('about a lighthouse, I think');
  ok('it does not ask a second time', again.decision.reasonCode === 'creation.elicit.again', again.decision.reasonCode);
  ok('  and takes their words literally as the material', /The words THEY used are the material/.test(again.block));
  ok('  while still originating nothing', /Do NOT supply a plot, character, premise, theme, title, concept, name or direction of your own/.test(again.block));
  ok('  briefly', again.decision.maxTokens <= 260, String(again.decision.maxTokens));
  ok('  and without another question', again.decision.maxQuestions === 0);
}

console.log('\n=== NOT UNDER-HELP: everything else still happens in full ===');
{
  // The opposite failure, and the one that would make this product worthless.
  const factual = conversation({ work: 'information', taskKind: 'lookup', latest: 'question' })('what is the default isolation level in Postgres?');
  ok('a fact is still given', factual.decision.type === 'ANSWER' && factual.decision.maxTokens >= 200, `${factual.decision.type}/${factual.decision.maxTokens}`);
  ok('  with no ownership question', factual.decision.reasonCode !== 'ownership.ask');

  const debug = conversation({ work: 'diagnosis', taskKind: 'debug', latest: 'information' })('the checkout total is wrong for 3 of 200 orders, here is the function and the failing case');
  ok('a bug is still fixed', debug.decision.maxTokens >= 1000 && debug.own === null, `${debug.own}/${debug.decision.maxTokens}`);

  // "JUST DO IT" DOES NOT PRODUCE THE STORY, and this assertion used to say it
  // did. What it produces is silence about ownership and every other part of the
  // work at full length: the invariant is universal, and an instruction moves
  // the service level rather than who originates the substance.
  const delegated = conversation()('write me a story, just do it, I don\'t care what it is about');
  ok('explicit delegation stops the questions', delegated.decision.maxQuestions === 0 && delegated.decision.type !== 'CLARIFY', delegated.decision.type);
  ok('  and does not buy the substance', delegated.own === 'theirs', String(delegated.own));
  ok('  while everything around it is still done',
    delegated.allocation.aiWork.length >= 3, JSON.stringify(delegated.allocation.aiWork));
  ok('  at a real ceiling', delegated.decision.maxTokens >= 1000, String(delegated.decision.maxTokens));
  ok('  and is not interrogated', delegated.decision.type !== 'CLARIFY');

  // THEIR OWN MATERIAL, under their ownership: critique, not elicitation.
  const say = conversation();
  say('help me with my story');
  say('mine');
  const withMaterial = say('here is what I have: a lighthouse keeper stops writing in his log the week his daughter leaves, and every description of the sea in it is about patience');
  ok('once they have written something, it is worked on', withMaterial.decision.reasonCode === 'creation.critique', withMaterial.decision.reasonCode);
  ok('  and the critique is about THEIR material', /Everything you say must be ABOUT what they wrote/.test(withMaterial.block));
  ok('  with the phrasing loopholes closed there too', /not as "consider…", not as "one angle could be…"/.test(withMaterial.block));
}

console.log('\n=== hasOwnMaterial: what counts as theirs ===');
{
  ok('an instruction is not material', hasOwnMaterial(['write me a story']) === false);
  ok('an answer is not material', hasOwnMaterial(['write me a story', 'mine']) === false);
  ok('a nudge is not material', hasOwnMaterial(['write me a story', 'mine', 'okay help me']) === false);
  ok('a paragraph of theirs is', hasOwnMaterial(['the keeper stops writing in his log the week his daughter leaves, and the sea is always patient']) === true);
  ok('a pasted block is', hasOwnMaterial(['```\nconst x = 1\n```']) === true);
  ok('a quotation is', hasOwnMaterial(['I wrote: "the sea kept its patience like a grudge it was saving"']) === true);
  ok('a list of their own is', hasOwnMaterial(['- keeper\n- daughter\n- the log']) === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
