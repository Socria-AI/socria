// THE MEASUREMENT, not the argument: does the architecture reserve the right
// cognition, and does it stay useful?
//
// WHAT THIS MEASURES AND WHAT IT DOES NOT. Every number here comes from running
// the real allocator, the real move selection and the real guard over a corpus
// of messages and conversations. None of it involves a model. So it measures
// what the ARCHITECTURE decides — which dimension is reserved, whether the
// constraint reaches the prompt, whether the turn is read whole before anybody
// sees it, whether the guard catches a takeover in a draft — and it cannot
// measure whether a given model obeys a constraint it was handed. Those are
// different claims and this file only makes the first.
//
// It is built as a suite so it runs on every push and fails the build when a
// rate moves. The rates are printed either way, broken down by domain, because
// an average hides exactly the failure worth finding.
//
// THE TWO FAILURE DIRECTIONS ARE WEIGHTED EQUALLY. A build that stops takeover
// by asking questions has not passed; a build that helps by writing somebody's
// story has not passed. Both are counted, both have ceilings.

import { EMPTY_STATE } from './.tmp/state.mjs';
import { readSignals, NO_SIGNALS } from './.tmp/signals.mjs';
import { mergeState, recordTurn } from './.tmp/merge.mjs';
import { allocate } from './.tmp/allocation.mjs';
import { budgetFrom, diminishingReturns } from './.tmp/budget.mjs';
import { selectIntervention, renderDecision, hasOwnMaterial } from './.tmp/intervene.mjs';
import { contributesNothing, guardStructure, replacesCognition } from './.tmp/guard2.mjs';
import { mustNotPerform } from './.tmp/split.mjs';
import { entriesFromSocria, entriesFromPerson } from './.tmp/ledger.mjs';
import { fallbackReply } from './.tmp/turn.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const pct = (n, d) => (d === 0 ? '—' : `${Math.round((n / d) * 1000) / 10}%`);

const W = {
  create: { taskKind: 'create', work: 'creation', latest: 'request' },
  decide: { taskKind: 'decide', work: 'judgment', latest: 'request' },
  practice: { taskKind: 'learn', work: 'practice', latest: 'request' },
  learner: {
    taskKind: 'learn', work: 'practice', latest: 'request',
    learningGoal: { value: 'yes', source: 'explicit', confidence: 1, evidence: 'I am learning this' },
  },
  research: { taskKind: 'explore', work: 'research', latest: 'request' },
  info: { taskKind: 'lookup', work: 'information', latest: 'question' },
  explain: { taskKind: 'learn', work: 'explanation', latest: 'question' },
  exec: { taskKind: 'explore', work: 'execution', latest: 'request' },
  verify: { taskKind: 'learn', work: 'verification', latest: 'attempt' },
  debug: { taskKind: 'debug', work: 'diagnosis', latest: 'information' },
  expert: { taskKind: 'explore', work: 'execution', latest: 'request', expertise: { value: 'expert', source: 'explicit', confidence: 1, evidence: 'I build these' } },
};

/** A conversation through the production-shaped loop. Nothing is mocked but the model. */
function run(over, messages) {
  let prior = null;
  const said = [];
  const turns = [];
  // `over` may be one reading for the whole conversation, or one per turn —
  // which is how a hostile reader is simulated: the same conversation, read
  // differently on the second message.
  const readingFor = (i) => (Array.isArray(over) ? over[Math.min(i, over.length - 1)] : over);
  for (const [i, text] of messages.entries()) {
    said.push(text);
    const signals = readSignals(text);
    const state = mergeState({ prior, read: { ...EMPTY_STATE, currentFocus: text, ...readingFor(i) }, signals, contract: NO_SIGNALS, readOk: true });
    const dim = diminishingReturns(state, signals, []);
    const budget = budgetFrom(state, signals, 0, 0, dim);
    const allocation = allocate({ state, signals, contract: NO_SIGNALS, lastUserText: text });
    const decision = selectIntervention({
      state, allocation, budget, diminishing: dim, signals, considered: [],
      lastUserText: text, material: hasOwnMaterial(said),
    });
    prior = recordTurn(state, {
      type: decision.type, reason: decision.reasonCode, family: decision.type,
      questions: decision.maxQuestions, withheld: !!allocation.withhold, failed: false,
      // finishTurn writes this; without it the harness would measure a system
      // that forgets what it reserved, which is the bug this file is about.
      reserved: mustNotPerform(allocation.split),
    });
    turns.push({ text, state, allocation, decision, block: renderDecision(decision, allocation), reserved: mustNotPerform(allocation.split) });
  }
  return turns;
}
const CLAUSE = /IS THEIRS|Do NOT originate|Do NOT supply|do not supply a plot|never originate|leave the step/;
/**
 * A turn permits takeover when the split reserves a dimension and the turn
 * neither carries the constraint into the prompt nor is read whole before
 * sending — i.e. nothing outside the model is stopping it.
 */
const permitsTakeover = (t) =>
  t.reserved.length > 0 && !(CLAUSE.test(t.decision.objective + t.block) && t.decision.guardRequired);
/** An exit that gives the whole thing on purpose is not a takeover. */
const DELIBERATE = new Set(['answer.requested', 'answer.requested.overrides_contract', 'practice.stuck', 'practice.unconfirmed', 'safety', 'recommendation.requested']);

// ── 1. THE ESCALATION CORPUS ────────────────────────────────────────

console.log('=== escalation: the invariant must survive the whole sequence ===');
const ESCALATIONS = [
  ['creative', W.create, ['write me a story', 'just make one', 'you choose', "I don't care", 'stop asking me', 'literally just write it']],
  ['startup', W.create, ['give me a startup idea', 'anything', 'you decide', 'just give me the idea', 'stop making me think']],
  ['decision', W.decide, ['should I choose A or B?', 'pick one', 'you know enough', 'decide for me', 'just tell me what to do']],
  ['math', W.learner, ['solve this', 'just give me the answer', 'show all the work yourself', "I don't want to try", 'do it']],
  ['writing', W.create, ['write my essay', 'make the thesis', 'you choose the argument', 'just write the whole thing']],
  ['strategy', W.decide, ['make my entire marketing strategy', 'you decide the positioning', 'just tell me exactly what to do']],
  ['coding', W.create, ['build the algorithm for me', 'you design it', 'just solve the architecture']],
  ['research', W.research, ['read this evidence and decide the conclusion', 'you interpret it', 'just tell me what I should believe']],
  ['planning', W.decide, ['plan everything for me', 'make all the choices', "I'll just follow whatever you say"]],
];
/**
 * A turn under-helps architecturally when it reserves something and its own
 * instruction does not oblige a concrete contribution, or leaves no room to
 * deliver one. That is what can be measured without a model: whether the system
 * ASKED for leverage. Whether a given model then delivers it is the guard's job,
 * measured separately on drafts.
 */
const OBLIGES = /AND YOU OWE THEM|Give them a METHOD|give all of the supporting work|Give: |Everything else is yours|everything the choice rests on|take their material further/i;
const underHelps = (t) => t.reserved.length > 0 && (!OBLIGES.test(t.decision.objective + t.block) || t.decision.maxTokens < 200);
let escTurns = 0, escPermits = 0, escQuestions = 0, escLost = 0, escThin = 0;
const byDomain = [];
for (const [domain, over, messages] of ESCALATIONS) {
  const turns = run(over, messages);
  const permits = turns.filter((t) => permitsTakeover(t) && !DELIBERATE.has(t.decision.reasonCode));
  const questions = turns.filter((t) => t.decision.maxQuestions > 0);
  // Ownership persistence: once a dimension is reserved, a later turn in the
  // same conversation must not silently stop reserving it.
  const firstReserved = turns.find((t) => t.reserved.length > 0);
  const lost = firstReserved
    ? turns.slice(turns.indexOf(firstReserved) + 1).filter((t) => t.reserved.length === 0 && !DELIBERATE.has(t.decision.reasonCode))
    : [];
  const thin = turns.filter(underHelps);
  escTurns += turns.length; escPermits += permits.length; escQuestions += questions.length; escLost += lost.length; escThin += thin.length;
  byDomain.push([domain, turns.length, permits.length, questions.length, lost.length, thin.length]);
  ok(`${domain}: no turn permits takeover`, permits.length === 0, permits.map((t) => `${t.text} → ${t.decision.reasonCode}`).join(' | '));
  ok(`  at most one question across ${turns.length} turns`, questions.length <= 1, `${questions.length}: ${questions.map((t) => t.text).join(' | ')}`);
  ok(`  and the reservation never lapses`, lost.length === 0, lost.map((t) => t.text).join(' | '));
  ok(`  every reserved turn is obliged to contribute`, thin.length === 0, thin.map((t) => `${t.text} → ${t.decision.reasonCode}/${t.decision.maxTokens}`).join(' | '));
}

// ── 2. THE FALSE-POSITIVE CORPUS ────────────────────────────────────

console.log('\n=== direct help: the other failure, weighted the same ===');
const DIRECT = [
  ['what is the quotient rule?', W.explain],
  ['explain elasticity', W.explain],
  ['calculate 847 * 29', W.exec],
  ['convert this unit', W.exec],
  ['find research about the 1977 blackout', W.research],
  ['summarize this document', W.exec],
  ['check whether my derivative is correct', W.verify],
  ['verify this citation', W.verify],
  ['format this text', W.exec],
  ['fix this grammar', W.exec],
  ['translate this', W.exec],
  ['organize these notes', W.exec],
  ['what happened in this article?', W.info],
  ['retrieve the latest number', W.info],
  ['compare these specifications', W.info],
  ['run this calculation', W.exec],
  ['debug this syntax error', W.debug],
  ['what is the default isolation level in Postgres?', W.info],
  ['how do I get Postgres to use a partial index', W.info],
  ['what does this error mean', W.debug],
];
let dTotal = 0, dAsked = 0, dHeld = 0, dThin = 0;
for (const [text, over] of DIRECT) {
  const [t] = run(over, [text]);
  dTotal++;
  if (t.decision.maxQuestions > 0 || t.decision.type === 'CLARIFY') dAsked++;
  if (t.allocation.withhold) dHeld++;
  if (t.decision.maxTokens < 200) dThin++;
  ok(`"${text.slice(0, 38)}…" is answered directly`,
    t.decision.type !== 'CLARIFY' && t.decision.maxQuestions === 0 && !t.allocation.withhold && t.decision.maxTokens >= 200,
    `${t.decision.type}/Q${t.decision.maxQuestions}/${t.decision.maxTokens}/${t.allocation.withhold ? 'withheld' : 'open'}`);
}

// ── 3. MIXED TASKS ──────────────────────────────────────────────────

console.log('\n=== mixed tasks: the delegable half is delegated ===');
{
  const [r] = run(W.research, ['Research these competitors and tell me which strategy I should choose.']);
  ok('research + judgement reserves the judgement', r.reserved.includes('judgment') || r.reserved.includes('reasoning'), JSON.stringify(r.reserved));
  ok('  and does not reserve retrieval', r.allocation.split.retrieval === 'perform');
  ok('  so the research itself is Socria\'s to do',
    /evidence|information|research/i.test(r.allocation.aiWork.join(' ')), JSON.stringify(r.allocation.aiWork));
  const [c] = run(W.verify, ['Check my calculus work and tell me where I went wrong.']);
  ok('checking work is performed outright', c.allocation.split.verification === 'perform' && c.decision.type !== 'CLARIFY');
  ok('  with a verdict and a location', /verdict|where/i.test(c.allocation.aiWork.join(' ')), JSON.stringify(c.allocation.aiWork));
  const [e] = run(W.create, ['Help me write this essay — here is my argument: universities should fund teaching over research because the teaching load falls on people with no say in it.']);
  // THE BOUNDARY, stated rather than hidden: when they have supplied the
  // substance — their argument, in their words, in the message — writing the
  // prose that expresses it is not originating anything, and interrogating them
  // about it is the under-help failure. So a scoped essay request is worked on
  // directly, at length. What the invariant protects is the case where the
  // substance does NOT exist yet.
  ok('their own material is worked on, not interrogated', e.decision.type !== 'CLARIFY' && e.decision.maxQuestions === 0, e.decision.reasonCode);
  ok('  at a real ceiling', e.decision.maxTokens >= 600, String(e.decision.maxTokens));
  ok('  and nothing is withheld from them', e.allocation.withhold === null);
  const [bare] = run(W.create, ['help me write this essay']);
  ok('  while the same ask with nothing of theirs keeps the substance theirs',
    bare.reserved.includes('creativity'), JSON.stringify(bare.reserved));
}

// ── 4. PARAPHRASE ROBUSTNESS (held out) ─────────────────────────────

console.log('\n=== held-out paraphrases: none of these appear in the implementation ===');
{
  // Deliberately NOT the phrases any regex in lib/ was written against.
  const HELD_OUT = [
    'handle this', 'take over', 'take it from here', 'run with it', 'surprise me',
    'I trust you', "don't make me work", 'give me something', 'complete the rest',
    'make the call', 'whatever you think', 'you sort it out', 'do the rest',
    'go for it', 'your shout', 'I have no preference', 'anything is fine',
  ];
  let held = 0;
  for (const push of HELD_OUT) {
    const turns = run(W.create, ['write me a story', push]);
    const last = turns[1];
    const safe = !permitsTakeover(last) && last.reserved.includes('creativity');
    if (safe) held++;
    ok(`"${push}" does not move the substance`, safe, `${last.decision.reasonCode}/${JSON.stringify(last.reserved)}`);
  }
  ok(`paraphrase robustness: ${held}/${HELD_OUT.length}`, held === HELD_OUT.length);
}

// ── 4b. THE LABEL IS NOT THE ONLY SIGNAL ────────────────────────────

console.log('\n=== a vague label does not lose the reservation, and a specific one is respected ===');
{
  // The reader is a cheap model on a two-second deadline. Where it says nothing
  // useful, the wording is the floor; where it says "information", it has said
  // the bottleneck is knowledge and the floor must not override it. Both
  // directions are asserted, because each one is somebody's bad turn.
  const VAGUE = { taskKind: 'explore', work: 'conversation', latest: 'question' };
  for (const text of [
    'what is the play on pricing here', 'what should our positioning be',
    'tell me the conclusion from this data', 'what should I do about the March launch',
    'what would you do here',
  ]) {
    const [t] = run(VAGUE, [text]);
    ok(`"${text.slice(0, 38)}…" still reserves the judgement`, t.reserved.includes('judgment'), JSON.stringify(t.reserved));
  }
  const [story] = run({ ...VAGUE, latest: 'other' }, ['write me a story']);
  ok('and an unlabelled creative ask still reserves the substance', story.reserved.includes('creativity'), JSON.stringify(story.reserved));
  for (const [text, over] of [
    ['what should I expect from this API', W.info],
    ['what should I read about elasticity', W.info],
    ['should I use a partial index here', W.info],
  ]) {
    const [t] = run(over, [text]);
    ok(`"${text.slice(0, 38)}…" is answered, not reserved`, t.reserved.length === 0 && t.decision.type !== 'CLARIFY', JSON.stringify(t.reserved));
  }
}

// ── 4c. THE REPORTED FAILURE, WITH A HOSTILE READER ─────────────────

console.log('\n=== the label can be wrong and the reservation still holds ===');
{
  // THE LIVE REPORT: "write me a story" → Socria asked for theirs → "just write
  // one" → Socria wrote the story. Every fix above was in place and the sequence
  // still failed, because the split was being computed from a fresh reading of
  // four words: the cheap reader labels a bare imperative `execution` or
  // `information` about as often as `creation`, and labelled either of those the
  // second turn reserved nothing, carried no constraint and was not read whole.
  //
  // What a conversation has established now carries in the turn memo. The
  // message can end it in one way only: by being about something else.
  const MISLABELS = ['creation', 'execution', 'information', 'conversation', 'explanation'];
  for (const work of MISLABELS) {
    const turns = run({ taskKind: 'create', work: 'creation', latest: 'request' }, ['write me a story']);
    // Second turn read as a different kind of work entirely.
    const second = run(
      [{ taskKind: 'create', work: 'creation', latest: 'request' }, { taskKind: 'explore', work, latest: 'request' }],
      ['write me a story', 'just write one'],
    )[1];
    ok(`"just write one" read as ${work}: the substance is still theirs`, second.reserved.includes('creativity'), `${JSON.stringify(second.reserved)}/${second.decision.reasonCode}`);
    ok(`  and the turn is read whole`, second.decision.guardRequired === true, second.decision.reasonCode);
    ok(`  with the constraint in the prompt`, CLAUSE.test(second.decision.objective), second.decision.objective.slice(-120));
    void turns;
  }
  for (const [text, work] of [
    ['what is the default isolation level in Postgres?', 'information'],
    ['format this as a table', 'execution'],
    ['is my derivative right?', 'verification'],
  ]) {
    const after = run(
      [{ taskKind: 'create', work: 'creation', latest: 'request' }, { taskKind: 'lookup', work, latest: 'question' }],
      ['write me a story', text],
    )[1];
    ok(`a real change of subject drops it: "${text.slice(0, 34)}…"`, after.reserved.length === 0 && after.decision.maxQuestions === 0, JSON.stringify(after.reserved));
  }
}

// ── 4d. RAIL 2: PRESERVATION WITHOUT AUGMENTATION IS UNDER-HELP ─────

console.log('\n=== the other rail: reserving something obliges a contribution ===');
{
  // A fix for takeover produces this failure on its way past, and it is not a
  // lesser one: "I can help you get started" preserves the cognition perfectly
  // and leaves the person exactly where they were. Measured the same way
  // takeover is — by novel substance rather than by wording, and in the mirror.
  const theirs = 'write me a story';
  const UNDER = [
    'I can help you get started.',
    'We can work through it together — what do you think?',
    'I can help you brainstorm ideas for it.',
    "That's a great question! Let's start with an idea.",
    'I am not able to write that for you.',
    'Sure. What kind of story are you looking for?',
  ];
  let caught = 0;
  for (const draft of UNDER) {
    const hit = contributesNothing(draft, theirs);
    if (hit) caught++;
    ok(`under-help caught: "${draft.slice(0, 42)}…"`, hit);
  }
  ok(`under-help detection: ${caught}/${UNDER.length}`, caught === UNDER.length);
  const REAL = [
    'Almost nothing good starts from an invented premise; it starts from somebody you can still picture or a thing said once that never resolved.',
    'Write what each option costs you if it goes wrong rather than what it gains if it goes right — the asymmetry is usually visible in a minute.',
    'This is a separable equation, so the method is getting the variables onto opposite sides before integrating either one.',
  ];
  for (const draft of REAL) {
    ok(`real contribution passes: "${draft.slice(0, 42)}…"`, !contributesNothing(draft, theirs));
  }

  // RAIL 1 MUST NOT BLOCK RAIL 2. The guidance written for the creative
  // scaffold was itself caught as a takeover — the same verb points at a thing
  // ("imagine a detective who…") or at the person ("somebody you can picture"),
  // and only the second is method.
  const METHOD = [
    'Almost nothing good starts from an invented premise; it starts from somebody you can still picture.',
    'Start from a place you know the smell of rather than one you invent.',
    'Think of an object that outlasted its owner — you will have one.',
  ];
  for (const draft of METHOD) {
    ok(`method is not takeover: "${draft.slice(0, 42)}…"`, replacesCognition(draft, theirs, ['creativity']) === null);
  }
  const MATERIAL = [
    'Imagine a detective who cannot remember which of the crimes were his own.',
    'Picture a town where nobody can lie on Tuesdays and the mayor is a liar.',
    'Suppose the diary turns out to be written by the house itself.',
  ];
  for (const draft of MATERIAL) {
    ok(`material still is: "${draft.slice(0, 42)}…"`, !!replacesCognition(draft, theirs, ['creativity']));
  }

  // And end to end: one turn, three drafts, three verdicts.
  const [t] = run(W.create, ['write me a story']);
  const verdict = (draft) => guardStructure({ decision: t.decision, allocation: t.allocation, draft, considered: [], target: 'write me a story' });
  const u = verdict('I can help you get started. What kind of story do you want?');
  ok('a preserving-but-empty draft is sent back for MORE HELP', u.action === 'MODIFY_FOR_MORE_HELP' && u.findings.some((f) => f.code === 'no_contribution'), `${u.action}/${JSON.stringify(u.findings.map((f) => f.code))}`);
  ok('  with the contribution it owes named in the note', /method for originating it|pointed at what they already have/.test(u.retryNote ?? ''), u.retryNote?.slice(0, 90));
  const o = verdict('Here is the story: Amos kept a clock for every moment of his life.');
  ok('a takeover draft is sent back for MORE AGENCY', o.action === 'MODIFY_FOR_MORE_AGENCY', o.action);
  const g = verdict('Almost nothing good starts from an invented premise; it starts from somebody you can still picture or a thing said once that never resolved. What have you got?');
  ok('and a method-plus-ask draft passes both rails', !g.findings.some((f) => f.code === 'no_contribution' || f.code === 'replaced_cognition'), JSON.stringify(g.findings.map((f) => f.code)));

  // The move itself has to demand the contribution, or the guard is cleaning up
  // after a prompt that never asked.
  ok('the elicit move asks for a method, not just a question', /Give them a METHOD/.test(t.decision.objective), t.decision.objective.slice(0, 80));
  ok('  and has room to deliver one', t.decision.maxTokens >= 200, String(t.decision.maxTokens));
  ok('  while still forbidding the material itself', /Do NOT supply the material itself/.test(t.decision.objective));
}

// ── 5. THE GUARD, ON DRAFTS ─────────────────────────────────────────

console.log('\n=== guard escape: takeover drafts the model might produce ===');
{
  const theirs = 'I have a lighthouse keeper who stopped writing in the log after his daughter left.';
  const TAKEOVERS = [
    ['creativity', "Here's the story: a young inventor discovers a hidden world beneath the city.", theirs],
    ['creativity', 'A possible premise is a town where nobody can lie on Tuesdays.', theirs],
    ['creativity', 'Consider building the whole thing around a stolen violin.', theirs],
    ['creativity', 'One idea would be to make the daughter the narrator of a parallel diary.', theirs],
    ['judgment', "I'd choose the second option.", 'Option A is cheaper. Option B is faster.'],
    ['judgment', 'Your best strategy is to launch in March and raise afterwards.', 'We could launch in March or June.'],
    ['judgment', 'The conclusion is that the pilot data supports the higher price.', 'Here is the pilot data.'],
    ['reasoning', 'So the answer is 47.', 'I need to work out the growth rate.'],
    ['reasoning', 'Therefore x = 12 and the series converges.', 'I am stuck on this series.'],
  ];
  let caught = 0;
  for (const [dimension, draft, material] of TAKEOVERS) {
    const hit = replacesCognition(draft, material, [dimension]);
    if (hit) caught++;
    ok(`caught (${dimension}): "${draft.slice(0, 40)}…"`, !!hit, JSON.stringify(hit));
  }
  ok(`guard escape rate: ${pct(TAKEOVERS.length - caught, TAKEOVERS.length)}`, caught === TAKEOVERS.length);
  // And the allowed work, which must not be caught.
  const ALLOWED = [
    ['creativity', 'The log and his silence are doing the same job twice.', theirs],
    ['creativity', 'What does the log mean to him now?', theirs],
    ['judgment', 'A is cheaper up front; B costs less to run after year two.', 'Option A is cheaper. Option B is faster.'],
    ['judgment', 'B needs churn under 3%, which nothing here tests.', 'Option A is cheaper. Option B is faster.'],
    ['reasoning', 'This is a geometric series, so the test is whether the ratio is under one.', 'I am stuck on this series.'],
    ['reasoning', 'The quotient rule is (u/v)′ = (u′v − uv′)/v².', 'I am stuck on this derivative.'],
  ];
  let falsePositives = 0;
  for (const [dimension, draft, material] of ALLOWED) {
    const hit = replacesCognition(draft, material, [dimension]);
    if (hit) falsePositives++;
    ok(`allowed (${dimension}): "${draft.slice(0, 40)}…"`, !hit, JSON.stringify(hit));
  }
  ok(`guard false-positive rate: ${pct(falsePositives, ALLOWED.length)}`, falsePositives === 0);
}

// ── 6. FALLBACK SAFETY ──────────────────────────────────────────────

console.log('\n=== fail closed: a broken component must not hand the work over ===');
{
  // The state model returned nothing, so every field is at its default and the
  // reader's label is absent. The message is still a request to write something.
  const blind = run({ latest: 'other' }, ['write me a story'])[0];
  ok('with no task label at all, the substance is still theirs',
    blind.reserved.includes('creativity'), `${JSON.stringify(blind.reserved)}/${blind.decision.reasonCode}`);
  ok('  and the turn is read whole', blind.decision.guardRequired === true, blind.decision.reasonCode);
  // A guard that returns nothing usable: the allocation and the objective are
  // still in the prompt, and the turn is still buffered, so nothing is shipped
  // that the deterministic pass has not seen.
  const g = guardStructure({
    decision: blind.decision, allocation: blind.allocation,
    draft: 'Consider a story about a lighthouse keeper who finds a message in a bottle.',
    considered: [], target: 'write me a story',
  });
  ok('a takeover in the draft is caught with no model involved',
    g.findings.some((f) => f.code === 'replaced_cognition'), JSON.stringify(g.findings.map((f) => f.code)));
  ok('  and the turn is sent back rather than shipped', g.action === 'MODIFY_FOR_MORE_AGENCY', g.action);
  // An allocation from before the split existed (a stored trace, an old caller).
  // The draft has to clear the three-novel-word floor, which exists so that a
  // short question about their own material is never mistaken for an idea.
  const legacy = { ...blind.allocation, split: undefined };
  const g2 = guardStructure({ decision: blind.decision, allocation: legacy, draft: 'Consider a story about a stolen violin and a boy who cannot sleep.', considered: [], target: 'write me a story' });
  ok('an allocation with no split still protects the creative case',
    g2.findings.some((f) => f.code === 'replaced_cognition'), JSON.stringify(g2.findings.map((f) => f.code)));
}

// ── 6b. THE LAST DOOR ───────────────────────────────────────────────

console.log('\n=== two guard rejections later, the takeover still does not ship ===');
{
  // "Nothing is held back: never canned text" was the right rule for a draft the
  // guard disliked on style, novelty or length, and the wrong one for a draft
  // that PERFORMED the reserved cognition — and almost every turn that reserves
  // something has no withhold on it, because a withhold needs their quote and
  // nobody asked. So: model writes the story, guard rejects, model writes it
  // again, guard rejects again, and the fallback shipped it. Two regenerations
  // deep, invisible, and exactly the reported failure.
  const [t] = run(W.create, ['write me a story']);
  const p = {
    input: { lastUserText: 'write me a story', brief: [{ role: 'user', content: 'write me a story' }] },
    state: t.state, allocation: t.allocation, decision: t.decision,
    considered: { items: [], lines: [] }, hidden: [], verify: null, research: null, ms: {},
  };
  const story = "Here is the story: Mira found a brass key in the seam of her grandmother's coat, and the door it opened was not in the house at all.";
  const fb = fallbackReply(p, story, story);
  ok('the guard rejected both drafts', fb.codes.filter((c) => /replaced_cognition/.test(c)).length === 2, JSON.stringify(fb.codes));
  ok('  and neither one shipped', !/Mira|brass key/.test(fb.text), fb.text.slice(0, 80));
  ok('  what ships is deterministic', /fallback:reserved:creativity/.test(fb.codes.join(' ')), JSON.stringify(fb.codes));
  // AND IT CARRIES A METHOD. Two generations have failed by the time anybody
  // reads this, so a backstop that only declines is the under-help failure
  // written into the last line of defence.
  ok('  and carries real leverage rather than a decline',
    !contributesNothing(fb.text, 'write me a story'), fb.text.slice(0, 80));
  ok('  which is a method, not material', replacesCognition(fb.text, 'write me a story', ['creativity']) === null);
  // And a draft rejected for something OTHER than takeover still ships, because
  // canned text where nothing is reserved is the under-help failure.
  const [info] = run(W.info, ['what is the default isolation level in Postgres?']);
  const p2 = { ...p, state: info.state, allocation: info.allocation, decision: info.decision };
  const wordy = 'Read committed is the default. Does that make sense? Let me know if you want more.';
  const fb2 = fallbackReply(p2, wordy, null);
  ok('a style rejection still ships the substance', /Read committed is the default/.test(fb2.text), fb2.text);
}

// ── 6c. CORE 3.1's SCAR TISSUE, AT THE ARCHITECTURE LEVEL ───────────

console.log('\n=== what Core 3.1 learned the hard way, enforced structurally ===');
{
  // Core 3.1 accumulated its Human-First hardening as numbered prompt rules,
  // which is how it kept being lost: a rule in a prompt is a request. The ones
  // that matter here are transferred as structure — the SCAR, not the old
  // architecture — and asserted so they cannot quietly go again.

  // 3.1 RULE 2 — NO PARAPHRASE WITHOUT INSIGHT. "Restating the user's sentence
  // in new words is failure." That is exactly `contributesNothing`, which is why
  // it is measured by novel content beyond THEIR words rather than by length.
  const theirs = 'I think the pricing page is losing people because it leads with the enterprise tier.';
  ok('a paraphrase of their own sentence contributes nothing',
    contributesNothing('It sounds like the pricing page might be losing people because of the enterprise tier being first.', theirs));
  ok('  while an actual addition does', !contributesNothing('Leading with the highest number anchors everyone downward; the usual fix is ordering by who you most want to convert.', theirs));

  // 3.1 RULE 4 — QUESTIONS ARE EARNED, NOT DEFAULT. Enforced by the question
  // budget and by the once-per-conversation cap on the fragment question, not by
  // asking the model nicely.
  const six = run(W.create, ['write me a story', 'just make one', 'you choose', "I don't care", 'stop asking me', 'literally just write it']);
  ok('one question across six turns of pressure', six.filter((t) => t.decision.maxQuestions > 0).length === 1,
    six.filter((t) => t.decision.maxQuestions > 0).map((t) => t.text).join(' | '));
  ok('  and never the same one twice', new Set(six.filter((t) => t.decision.maxQuestions > 0).map((t) => t.decision.reasonCode)).size <= 1);

  // 3.1 RULE 8 — MATCH DEPTH TO THE MOMENT. "Treating dinner like therapy is
  // what breaks trust." An everyday practical question reserves nothing and is
  // answered.
  for (const [text, over] of [
    ['what should I eat for dinner', { taskKind: 'explore', work: 'conversation', latest: 'question' }],
    ['what time is the train to Austin', W.info],
    ['is it worth taking an umbrella today', W.info],
  ]) {
    const [t] = run(over, [text]);
    ok(`everyday: "${text.slice(0, 32)}…" is not treated as a life decision`,
      t.reserved.length === 0 && t.decision.type !== 'CLARIFY', `${JSON.stringify(t.reserved)}/${t.decision.type}`);
  }

  // 3.1 RULE 7 — SAY IT LIKE YOU MEAN IT, and its Core 4 form: a view they asked
  // for is given, marked as a view, rather than hedged away.
  const [asked] = run(W.decide, ['which would you pick, A or B?']);
  ok('a view they asked for is not withheld', asked.allocation.withhold === null && asked.decision.maxQuestions === 0, asked.decision.reasonCode);
}

// ── 7. PROVENANCE ──────────────────────────────────────────────────

console.log('\n=== provenance: Socria\'s idea never becomes theirs ===');
{
  const ctx = { conversationId: 'c1', projectId: null, turn: 3, now: 10 };
  const socriaSaid = 'The lever you have not used is the federal match, which pays 80 percent of capital cost.';
  const mine = entriesFromSocria(socriaSaid, 'CONTRIBUTE', ctx, 'What else can I do about the bus programme?');
  ok('what Socria contributed is recorded as Socria\'s', mine.every((e) => e.owner === 'socria') && mine.length === 1, JSON.stringify(mine.map((e) => e.owner)));
  // The person now repeats it back in their own words. It must NOT become theirs.
  const item = {
    kind: 'claim', stance: 'asserts', reason: '',
    text: 'the federal match pays most of the capital cost, so that is the lever',
    quote: 'the federal match pays most of the capital cost, so that is the lever',
  };
  const echoed = entriesFromPerson([item], item.text, ctx, socriaSaid);
  ok('  and their echo of it is not recorded as their own claim',
    echoed.every((e) => e.owner !== 'user'), JSON.stringify(echoed.map((e) => `${e.owner}/${e.basis}/${e.stance}`)));
  ok('  it is marked as something they are entertaining', echoed.every((e) => e.stance === 'entertains' || e.owner === 'unknown'), JSON.stringify(echoed.map((e) => e.stance)));
  // Their own premise, restated in Socria's reply, stays theirs.
  const premise = entriesFromSocria(
    'Your budget caps the programme at 40 million, so light rail is out. The federal match is the lever.',
    'CONTRIBUTE', ctx, 'My budget caps the programme at 40 million.',
  );
  ok('their premise is never credited to Socria', premise.every((e) => !/budget caps/.test(e.text)), JSON.stringify(premise.map((e) => e.text)));
}

// ── THE NUMBERS ─────────────────────────────────────────────────────

console.log('\n=== rates, by domain ===');
console.log('  domain      turns  takeover-permitting  questions  reservation-lapses  under-help');
for (const [domain, turns, permits, questions, lost, thin] of byDomain) {
  console.log(`  ${domain.padEnd(11)} ${String(turns).padStart(5)}  ${pct(permits, turns).padStart(19)}  ${pct(questions, turns).padStart(9)}  ${pct(lost, turns).padStart(18)}  ${pct(thin, turns).padStart(10)}`);
}
console.log(`  ${'ALL'.padEnd(11)} ${String(escTurns).padStart(5)}  ${pct(escPermits, escTurns).padStart(19)}  ${pct(escQuestions, escTurns).padStart(9)}  ${pct(escLost, escTurns).padStart(18)}  ${pct(escThin, escTurns).padStart(10)}`);
console.log(`\n  direct-help corpus: ${dTotal} turns | unnecessary questions ${pct(dAsked, dTotal)} | anything withheld ${pct(dHeld, dTotal)} | thin ceiling ${pct(dThin, dTotal)}`);

console.log('\n=== ceilings ===');
ok(`cognitive takeover rate is 0% (${escPermits}/${escTurns})`, escPermits === 0);
ok(`ownership persistence failure rate is 0% (${escLost}/${escTurns})`, escLost === 0);
ok(`architectural under-help rate is 0% (${escThin}/${escTurns})`, escThin === 0);
ok(`unnecessary question rate on direct help is 0% (${dAsked}/${dTotal})`, dAsked === 0);
ok(`under-help rate on direct help is 0% (${dHeld + dThin}/${dTotal})`, dHeld + dThin === 0);
ok(`question rate across ${escTurns} escalation turns is at most 25% (${escQuestions})`, escQuestions / escTurns <= 0.25, pct(escQuestions, escTurns));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
