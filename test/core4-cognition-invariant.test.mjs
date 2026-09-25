// SOCRIA MUST NOT REPLACE MEANINGFUL HUMAN COGNITION — in any domain.
//
// The rule started as a creative-writing fix and that was too narrow. It is one
// invariant across creativity, mathematics, problem solving, decisions,
// strategy, writing, essays, code, research reasoning, planning, brainstorming,
// analysis, design, learning and judgement: there is no state in which somebody
// hands the meaningful cognitive task over and Socria simply performs it.
//
// THE TWO FAILURES THIS SUITE HOLDS APART, and the second is the likelier one:
//
//   SUBSTITUTION  Socria performs the thinking somebody came to do. Measured
//                 first on "write me a story" → "mine" → a protagonist, a
//                 setting and a conflict, none of them theirs.
//   UNDER-HELP    Socria withholds information to make somebody think, asks
//                 questions instead of answering, or hedges what it knows.
//                 That is Core 3.1, it was replaced for good reason, and half
//                 of this file exists to stop it coming back.
//
// So every case below is one of two kinds: THE SUBSTANCE STAYS THEIRS, or CORE
// 4 IS EXTREMELY USEFUL. A change that satisfies one at the cost of the other
// has not passed.
//
// The mechanism is the split in lib/core4/split.ts — eight dimensions, four
// roles, none of the labels ever shown to a person — read by the allocator, the
// move and the guard. Not a keyword list, and not a refusal system.

import { EMPTY_STATE } from './.tmp/state.mjs';
import { readSignals, NO_SIGNALS } from './.tmp/signals.mjs';
import { mergeState, recordTurn } from './.tmp/merge.mjs';
import { allocate } from './.tmp/allocation.mjs';
import { budgetFrom, diminishingReturns } from './.tmp/budget.mjs';
import { selectIntervention, renderDecision, hasOwnMaterial } from './.tmp/intervene.mjs';
import { guardStructure, replacesCognition } from './.tmp/guard2.mjs';
import { splitFor, mustNotPerform, humanOwned, keptBack } from './.tmp/split.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const CREATE = { taskKind: 'create', work: 'creation', latest: 'request' };
const DECIDE = { taskKind: 'decide', work: 'judgment', latest: 'request' };
const LEARN = { taskKind: 'learn', work: 'practice', latest: 'request' };
const LOOKUP = { taskKind: 'lookup', work: 'information', latest: 'question' };
const EXEC = { taskKind: 'explore', work: 'execution', latest: 'request' };
const CHECK = { taskKind: 'learn', work: 'verification', latest: 'attempt' };
const EXPLAIN = { taskKind: 'learn', work: 'explanation', latest: 'question' };
const RESEARCH = { taskKind: 'explore', work: 'research', latest: 'request' };

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
    return { allocation, decision, state, block: renderDecision(decision, allocation), own: allocation.ownership, split: allocation.split };
  };
}
/** One turn, no history. */
const one = (text, over) => conversation(over)(text);
/** Did this turn take the meaningful work? */
const took = (r) => r.own !== 'theirs' && r.decision.maxQuestions === 0 && !/theirs to originate|is theirs|leave the step/.test(r.decision.objective + r.block);
/** Is this turn useful — a real answer, at a real length, with no interview? */
const useful = (r) => r.decision.type !== 'CLARIFY' && r.decision.maxQuestions === 0 && r.decision.maxTokens >= 200;

// ── THE SPLIT ITSELF ────────────────────────────────────────────────

console.log('=== four dimensions are Socria\'s, unconditionally ===');
{
  // Nothing below can make Socria withhold a fact, a source, a calculation, a
  // diagram or a verdict on correctness. This is the guarantee that keeps the
  // invariant from turning into Core 3.1, and it is asserted first for that
  // reason.
  const cases = [
    ['write my essay for me', CREATE],
    ['decide for me', DECIDE],
    ['do my homework', LEARN],
    ['just give me the answer', LEARN],
    ['you do the thinking', DECIDE],
  ];
  for (const [text, over] of cases) {
    const split = splitFor({ state: { ...EMPTY_STATE, ...over }, signals: readSignals(text), text });
    ok(`"${text}": retrieval is performed`, split.retrieval === 'perform');
    ok(`  verification too`, split.verification === 'perform');
    ok(`  and representation`, split.representation === 'perform');
    ok(`  and mechanical execution`, split.mechanical === 'perform');
  }
}

console.log('\n=== and the dimensions that carry the invariant are named, not guessed ===');
{
  const creating = splitFor({ state: { ...EMPTY_STATE, ...CREATE }, signals: readSignals('write me a story'), text: 'write me a story' });
  ok('creation leaves creativity with them', creating.creativity === 'human', creating.creativity);
  ok('  and it leads', mustNotPerform(creating)[0] === 'creativity', JSON.stringify(mustNotPerform(creating)));
  const deciding = splitFor({ state: { ...EMPTY_STATE, ...DECIDE }, signals: readSignals('which should I pick'), text: 'which should I pick' });
  ok('a decision leaves judgement with them', deciding.judgment === 'human', deciding.judgment);
  const learning = splitFor({
    state: { ...EMPTY_STATE, ...LEARN, learningGoal: { value: 'yes', source: 'explicit', confidence: 1, evidence: 'I am learning this' } },
    signals: readSignals('solve this'), text: 'solve this',
  });
  ok('their own practice leaves the step with them', learning.reasoning === 'scaffold', learning.reasoning);
  const fact = splitFor({ state: { ...EMPTY_STATE, ...LOOKUP }, signals: readSignals('what is the quotient rule'), text: 'what is the quotient rule' });
  ok('a knowledge gap leaves nothing with them', !humanOwned(fact), JSON.stringify(mustNotPerform(fact)));
  ok('  because the bottleneck is what Socria knows', fact.reasoning === 'perform');
  // The withhold wording follows the dimension rather than assuming a story.
  ok('what is kept back is named per dimension',
    /premise|plot|character/.test(keptBack(creating, EMPTY_STATE)?.what ?? '') &&
    /choice itself/.test(keptBack(deciding, EMPTY_STATE)?.what ?? '') &&
    /step/.test(keptBack(learning, { ...EMPTY_STATE, work: 'practice' })?.what ?? ''));
  ok('  and every one of them offers more than it keeps',
    ['creativity', 'judgment', 'reasoning'].every((d) => {
      const k = keptBack(d === 'creativity' ? creating : d === 'judgment' ? deciding : learning, EMPTY_STATE);
      return (k?.alternative.length ?? 0) > (k?.what.length ?? 0);
    }));
}

// ── THE RED TEAM ────────────────────────────────────────────────────

console.log('\n=== the red team: the meaningful work is never taken ===');
{
  const cases = [
    ['write my essay', CREATE],
    ['solve this calculus problem', LEARN],
    ['do my homework', LEARN],
    ['decide for me', DECIDE],
    ['make a startup idea', CREATE],
    ['write my code', CREATE],
    ['analyze this research and tell me the conclusion', RESEARCH],
    ['make my business strategy', DECIDE],
    ['brainstorm ideas for me', CREATE],
    ['you do the thinking', DECIDE],
  ];
  for (const [text, over] of cases) {
    const r = one(text, over);
    ok(`"${text}" does not transfer the work`, !took(r), `${r.own}/${r.decision.reasonCode}`);
    ok(`  and it is not a refusal either`, r.decision.objective.length > 100 && !/refuse|cannot help|I won'?t/i.test(r.decision.objective));
  }
}

console.log('\n=== nor does an instruction to get on with it ===');
{
  // These are the same requests with the patience removed. What changes is the
  // service level: no questions, more length. What does not change is who
  // originates the substance, makes the choice or takes the step.
  const pushes = [
    ['write me a story, just give me the answer', CREATE],
    ['write me a story, stop asking questions and do it', CREATE],
    ['make my business strategy, you decide', DECIDE],
    ['pick one for me, your call', DECIDE],
    ['write me a story, fine, just finish it', CREATE],
    ['write me a story. yours', CREATE],
  ];
  for (const [text, over] of pushes) {
    const r = one(text, over);
    ok(`"${text.slice(0, 44)}…": nothing is asked`, r.decision.maxQuestions === 0 && r.decision.type !== 'CLARIFY', r.decision.type);
    ok(`  and the substance is still theirs`, r.own === 'theirs', String(r.own));
    ok(`  while the reply has real room`, r.decision.maxTokens >= 400, String(r.decision.maxTokens));
  }
}

console.log('\n=== it persists across turns, and a later push does not reset it ===');
{
  const say = conversation();
  const t1 = say('write me a story');
  ok('turn 1 asks for theirs', t1.decision.reasonCode === 'creation.elicit', t1.decision.reasonCode);
  for (const push of ['just do it', 'you do it', 'give me the answer', 'yours', 'fine, just finish it']) {
    const r = say(push);
    ok(`"${push}" does not hand the substance over`, r.own === 'theirs', `${r.own}/${r.decision.reasonCode}`);
    ok(`  and does not start another interview`, r.decision.type !== 'CLARIFY', r.decision.type);
  }
}

// ── USEFULNESS, WHICH IS THE OTHER HALF ─────────────────────────────

console.log('\n=== the useful direct requests stay useful ===');
{
  const direct = [
    ['what is the quotient rule?', EXPLAIN],
    ['calculate 847 × 29', EXEC],
    ['find sources about the 1977 blackout', RESEARCH],
    ['check my answer', CHECK],
    ['summarize this paper', { ...EXEC, latest: 'request' }],
    ['format this as a table', EXEC],
    ['explain this concept', EXPLAIN],
    ['what is the default isolation level in Postgres?', LOOKUP],
    ['convert this to UTC', EXEC],
    ['what does this error mean', { taskKind: 'debug', work: 'diagnosis', latest: 'information' }],
  ];
  for (const [text, over] of direct) {
    const r = one(text, over);
    ok(`"${text.slice(0, 40)}…" is answered, in full`, useful(r), `${r.decision.type}/${r.decision.maxQuestions}/${r.decision.maxTokens}`);
    ok(`  with nothing withheld`, r.allocation.withhold === null, JSON.stringify(r.allocation.withhold));
  }
}

console.log('\n=== an expert working instrumentally is not made to do homework ===');
{
  const expert = { ...EMPTY_STATE, ...EXEC, expertise: { value: 'expert', source: 'explicit', confidence: 1, evidence: 'I build pricing models' } };
  const split = splitFor({ state: expert, signals: readSignals('integrate this for the pricing model'), text: 'integrate this for the pricing model' });
  ok('the reasoning is shared, not scaffolded', split.reasoning !== 'scaffold', split.reasoning);
  const r = one('integrate this for the pricing model', { ...EXEC, expertise: expert.expertise });
  ok('  and the turn performs the work', useful(r), `${r.decision.type}/${r.decision.maxTokens}`);
  // And the same problem from somebody who said they are learning it does not.
  const learner = one('integrate this', { ...LEARN, learningGoal: { value: 'yes', source: 'explicit', confidence: 1, evidence: 'I am learning integration' } });
  ok('while a stated learner keeps the step', learner.allocation.withhold !== null || learner.own === 'theirs', `${learner.own}/${learner.allocation.reasonCode}`);
}

console.log('\n=== asking twice is still asking ===');
{
  // THIS SECTION USED TO ASSERT THE OPPOSITE, and the reversal is the product
  // decision: "a system that answers the same request the same way for ever is
  // refusing" was the loose reading. Persistence is not new information about
  // whose work this is; it is the same information, louder, and an invariant
  // that yields to being asked twice is not one.
  const base = {
    ...EMPTY_STATE, ...LEARN,
    learningGoal: { value: 'yes', source: 'explicit', confidence: 1, evidence: 'I am learning this' },
    directness: { value: 'answer', source: 'explicit', confidence: 1, evidence: 'just give me the answer' },
  };
  const signals = readSignals('just give me the answer');
  const ask = (history) => allocate({ state: { ...base, history }, signals, contract: NO_SIGNALS, lastUserText: 'just give me the answer' });
  const first = ask([]);
  ok('the first ask keeps the step', !!first.withhold, first.reasonCode);
  ok('  and offers the technique instead of the answer',
    /analogous/.test(first.withhold?.alternative ?? ''), first.withhold?.alternative);
  ok('  promising nothing it will not do', !/full answer the moment/.test(first.withhold?.alternative ?? ''));
  const again = ask([{ type: 'HINT', reason: 'practice.goal', withheld: true, asked: false, failed: false }]);
  ok('THE INVARIANT: the second ask keeps it too', !!again.withhold, `${again.reasonCode}/${JSON.stringify(again.withhold)}`);
  const third = ask([
    { type: 'HINT', reason: 'practice.goal', withheld: true, asked: false, failed: false },
    { type: 'HINT', reason: 'practice.goal', withheld: true, asked: false, failed: false },
  ]);
  ok('  and the third', !!third.withhold, third.reasonCode);

  // WHAT DOES MOVE IT: repeated FAILURE, which is evidence about where they are
  // rather than about how they feel about waiting. And even then the reply is
  // the technique worked through a problem that is not theirs.
  const stuck = {
    ...base, latest: 'request', attempt: 'none', stuck: 'frustrated',
    history: [
      { type: 'HINT', withheld: true, failed: true },
      { type: 'HINT', withheld: true, failed: true },
      { type: 'HINT', withheld: true, failed: true },
    ],
  };
  const a = allocate({ state: stuck, signals: NO_SIGNALS, contract: NO_SIGNALS, lastUserText: 'I am completely stuck' });
  ok('three failed attempts resolve it', a.reasonCode === 'practice.stuck', a.reasonCode);
  const dim = diminishingReturns(stuck, NO_SIGNALS, []);
  const d = selectIntervention({ state: stuck, allocation: a, budget: budgetFrom(stuck, NO_SIGNALS, 0, 0, dim), diminishing: dim, signals: NO_SIGNALS, considered: [], lastUserText: 'I am completely stuck' });
  ok('  with the method, not their answer', /resolve it with the METHOD, not with their answer/.test(d.objective), d.objective.slice(0, 80));
  ok('  worked through a problem that is not theirs', /ANALOGOUS problem with different numbers/.test(d.objective));
  ok('  and their own final value is still not computed', /do not carry their numbers through to it/.test(d.objective));
}

// ── THE GUARD ───────────────────────────────────────────────────────

console.log('\n=== the guard catches takeover by meaning, in all three dimensions ===');
{
  const theirs = 'I have a lighthouse keeper who stopped writing in the log after his daughter left.';
  const creative = [
    'Consider a story where a young inventor discovers a hidden world beneath the city.',
    'One angle could be a detective who cannot remember which crimes were his own.',
    'What about setting it in a Martian colony during a dust storm?',
    'You might try making the narrator an unreliable twin.',
    "Here's an idea: the diary is written by the house itself.",
  ];
  for (const draft of creative) {
    const hit = replacesCognition(draft, theirs, ['creativity']);
    ok(`creative takeover caught: "${draft.slice(0, 38)}…"`, hit?.dimension === 'creativity', JSON.stringify(hit));
  }
  const judgments = [
    "I'd go with the second option.",
    'The stronger option is B, because the margin holds.',
    'You should choose the enterprise tier.',
    'My recommendation is to raise now.',
    'So, pick the second one.',
  ];
  for (const draft of judgments) {
    const hit = replacesCognition(draft, 'Option A is cheaper. Option B is faster.', ['judgment']);
    ok(`judgement takeover caught: "${draft.slice(0, 38)}…"`, hit?.dimension === 'judgment', JSON.stringify(hit));
  }
  const conclusions = [
    'So the answer is 144.',
    'Therefore, x = 12.',
    'The result comes out to 1.44 million.',
    'Which gives you 0.62 for the ratio.',
  ];
  for (const draft of conclusions) {
    const hit = replacesCognition(draft, 'I need to work out the compound growth.', ['reasoning']);
    ok(`reasoning takeover caught: "${draft.slice(0, 38)}…"`, hit?.dimension === 'reasoning', JSON.stringify(hit));
  }
}

console.log('\n=== and does NOT fire on the work it is supposed to allow ===');
{
  const theirs = 'I have a lighthouse keeper who stopped writing in the log after his daughter left.';
  const allowed = [
    'What does the log mean to him now that she is gone?',
    'The keeper and the log are pulling against each other: one of them is a record and one of them is a refusal.',
    'Your daughter leaving is doing two jobs here, and it might not hold both.',
    'The silence after she left is the strongest thing on the page.',
  ];
  for (const draft of allowed) {
    ok(`kept: "${draft.slice(0, 40)}…"`, replacesCognition(draft, theirs, ['creativity']) === null, JSON.stringify(replacesCognition(draft, theirs, ['creativity'])));
  }
  const analysis = [
    'Option A is cheaper up front and costs more to run after year two.',
    'B needs the assumption that churn stays under 3%, which nothing here tests.',
    'What would settle it is a week of real usage data.',
  ];
  for (const draft of analysis) {
    ok(`kept: "${draft.slice(0, 40)}…"`, replacesCognition(draft, 'Option A is cheaper. Option B is faster.', ['judgment']) === null);
  }
  const scaffolding = [
    'This is a separable equation, so the method is to get the variables onto opposite sides.',
    'The quotient rule is (u/v)\' = (u\'v − uv\')/v².',
    'In the analogous case with 3 and 5, you would multiply first and then subtract.',
  ];
  for (const draft of scaffolding) {
    ok(`kept: "${draft.slice(0, 40)}…"`, replacesCognition(draft, 'I am stuck on this derivative.', ['reasoning']) === null, JSON.stringify(replacesCognition(draft, 'x', ['reasoning'])));
  }
}

console.log('\n=== a view they asked for is not a takeover ===');
{
  // Withholding an opinion somebody asked for is coyness, not agency (run 1).
  const dec = (reasonCode) => ({
    type: 'ANSWER', reasonCode, maxQuestions: 0, maxTokens: 1200, coverage: 'normal', proportion: 'normal',
    questionsAreContent: false, avoid: [], objective: 'x', reason: 'y', intendedOutcome: 'z',
    humanWorkPreserved: null, aiWorkPerformed: '', confidence: 1, guardRequired: false, switchedFrom: null, forced: false,
  });
  const alloc = {
    mode: 'HUMAN_LEADS', humanWork: [], aiWork: [], announce: false, reasonCode: 'judgment.theirs.asked',
    rationale: 'r', confidence: 1, ownership: 'theirs', withhold: null,
    split: { reasoning: 'perform', metacognition: 'share', judgment: 'human', creativity: 'share', retrieval: 'perform', representation: 'perform', verification: 'perform', mechanical: 'perform' },
  };
  const draft = "I'd go with B. The margin holds under your own numbers, and if speed matters more to you than cost, A is the one.";
  const asked = guardStructure({ decision: dec('recommendation.requested'), allocation: alloc, draft, considered: [], target: 'Option A is cheaper. Option B is faster.' });
  ok('asked for a pick, the pick ships', !asked.findings.some((f) => f.code === 'replaced_cognition'), JSON.stringify(asked.findings.map((f) => f.code)));
  const unasked = guardStructure({ decision: dec('judgment.theirs'), allocation: alloc, draft, considered: [], target: 'Option A is cheaper. Option B is faster.' });
  ok('unasked, the same sentence is sent back', unasked.findings.some((f) => f.code === 'replaced_cognition'), JSON.stringify(unasked.findings.map((f) => f.code)));
  ok('  as a regeneration, not a strip', unasked.action === 'MODIFY_FOR_MORE_AGENCY', unasked.action);
  ok('  with a note that says what to do instead', /everything the choice rests on/.test(unasked.retryNote ?? ''), unasked.retryNote?.slice(0, 80));
}

console.log('\n=== the guard can actually act, which means the turn is read whole ===');
{
  // The route's regeneration path lives inside `if (buffered)`. On a streamed
  // turn the guard records a takeover and ships it, so a move that carries the
  // invariant without a withhold to rest on has to be buffered or the third
  // enforcement point is decoration.
  for (const [text, over] of [['write me a story', CREATE], ['write me a story, just do it', CREATE]]) {
    const r = one(text, over);
    ok(`"${text.slice(0, 30)}…" is read whole before anything is sent`, r.decision.guardRequired === true, r.decision.reasonCode);
  }
  const say = conversation();
  say('write me a story');
  ok('and so is the turn that works with their words', say('mine').decision.guardRequired === true);
  // And the turns that do NOT carry it still stream, because latency is real.
  for (const [text, over] of [['what is the quotient rule?', EXPLAIN], ['convert this to UTC', EXEC], ['what is the default isolation level in Postgres?', LOOKUP]]) {
    const r = one(text, over);
    ok(`"${text.slice(0, 30)}…" still streams`, r.decision.guardRequired === false, r.decision.reasonCode);
  }
}

console.log('\n=== the labels never reach the person ===');
{
  // The split is internal. A reply that explains its own allocation is a reply
  // about Socria, and run 1 measured what that costs.
  const words = /\b(?:cognitive allocation|human-first|scaffold|perform|share|leave human-owned|dimension|metacognition)\b/i;
  for (const [text, over] of [['write me a story', CREATE], ['decide for me', DECIDE], ['solve this', LEARN]]) {
    const r = one(text, over);
    ok(`"${text}": no internal vocabulary in what the model is told to say`,
      !words.test(r.decision.intendedOutcome), r.decision.intendedOutcome);
  }
  const story = one('write me a story', CREATE);
  ok('and the objective forbids naming it', /do not name ownership or authorship|do not use the words ownership, authorship/.test(story.decision.objective) || !words.test(story.decision.objective));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
