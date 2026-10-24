// THE LOGOS RUNTIME — lib/runtime (docs/LOGOS-5-RUNTIME.md §4).
//
// Six subsystems, each pure, each held down here:
//   orchestrate   Alex's rules A–D read from the turn; when the map pass runs;
//                 when memory is written; the stepped history window; one
//                 table of models
//   state         the cognitive state, in code: domain, work, preferences —
//                 and nothing that labels the person
//   allocation    Core 4's CognitiveSplit, inherited: what Socria does,
//                 supports, and leaves to them; an explicit hand-over honoured
//   behavior      a compact core and blocks that join only when needed; the
//                 same bytes turn after turn; the withholding stance gone
//   epistemic     citations that name nothing removed; claims labelled;
//                 disagreeing sources found
//   representation  the workspace as typed, linked entities; search

import * as R from './.tmp/runtime-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;
const route = (text, o = {}) => R.routeTurn({ text, ...o });

console.log('\n=== orchestrate: Alex\'s rules, read from the turn ===');
for (const t of ['what is tax incidence', 'why is the sky blue?', 'I think we should launch in March', 'help me think through this offer', 'ok thanks', 'what does this argument rest on more broadly in economics?'.replace('what does this argument rest on more broadly in economics?', 'tell me about the history of Rome'), 'can you explain the structure of a cell?'])
  ok(`A conversation: "${t}" stays in Chat`, route(t).intent === 'conversation' && route(t).reveal === null, J(route(t)));
for (const t of ['map out my argument for moving to Berlin', 'audit my reasoning here', 'break down the logic of this argument', 'show me the structure', 'make a causal diagram of the causes', 'draw a decision tree for this', 'what does my plan rest on?', 'what does my whole plan rest on?', 'open the logic map', 'turn this into a mind map', 'stress-test my thesis'])
  ok(`D structure: "${t}" opens the Logic Map`, route(t).intent === 'structure' && route(t).reveal?.view === 'logic_map', J(route(t)));
for (const t of ['plot y = x^2', 'build a model of a pendulum', 'simulate a falling ball', 'make me flashcards for chapter 3', 'quiz me on the French revolution', 'graph sin(x) from 0 to 2pi', 'make a study plan for finals', 'visualize the data'])
  ok(`C visual: "${t}" opens Artifacts beside the conversation`, route(t).intent === 'visual' && route(t).reveal?.view === 'artifacts' && route(t).reveal?.beside === 'chat', J(route(t)));
ok('B ingest: a document arriving keeps Chat (Content fills in the background)', route('here are my notes', { attachments: [{ kind: 'doc' }] }).intent === 'ingest' && route('here are my notes', { attachments: [{ kind: 'doc' }] }).reveal === null);
ok('  an image alone is conversation, not ingestion', route('what is this?', { attachments: [{ kind: 'image' }] }).intent === 'conversation');
ok('  a structure request with a document is still structure', route('map out the argument in this paper', { attachments: [{ kind: 'doc' }] }).intent === 'structure');
ok('a command handled in code is the fast path', route('remove the pricing node', { command: true }).intent === 'command' && R.pathOf({ intent: 'command', checked: false }) === 'fast');
ok('paths: conversation standard, checked verified, visual verified', R.pathOf({ intent: 'conversation', checked: false }) === 'standard' && R.pathOf({ intent: 'conversation', checked: true }) === 'verified' && R.pathOf({ intent: 'visual', checked: false }) === 'verified');

console.log('\n=== orchestrate: when the map pass runs ===');
const need = (o) => R.needsMap({ route: route(o.text ?? 'we should launch in March'), view: 'chat', filler: false, turnsSinceMap: 1, neverDrawn: false, ...o });
ok('an ordinary turn in Chat: no map pass', need({}).map === false && need({}).why === 'not-needed');
ok('structure asked for: map pass', need({ text: 'map out my argument' }).map === true && need({ text: 'map out my argument' }).why === 'structure');
ok('something to build: map pass (the engine builds it)', need({ text: 'build a model of a pendulum' }).map === true);
ok('the Logic Map is the open view: map pass (live while looked at)', need({ view: 'logic_map' }).map === true && need({ view: 'logic_map' }).why === 'open');
ok('…but never for an "ok"', need({ view: 'logic_map', filler: true }).map === false);
ok(`never drawn: first pass after ${R.MAP_FIRST_AFTER} substantive turns`, need({ neverDrawn: true, turnsSinceMap: R.MAP_FIRST_AFTER - 1 }).map === false && need({ neverDrawn: true, turnsSinceMap: R.MAP_FIRST_AFTER }).map === true && need({ neverDrawn: true, turnsSinceMap: R.MAP_FIRST_AFTER }).why === 'cadence');
ok(`then every ${R.MAP_EVERY}`, need({ turnsSinceMap: R.MAP_EVERY - 1 }).map === false && need({ turnsSinceMap: R.MAP_EVERY }).map === true);
ok('the old behaviour, switched on: every turn', need({ everyTurn: true }).map === true && need({ everyTurn: true, filler: true }).map === false);
{
  const msgs = [
    { role: 'user', content: 'old turn with no time' },
    { role: 'user', content: 'before', at: 100 },
    { role: 'assistant', content: 'reply', at: 150 },
    { role: 'user', content: 'after one', at: 200 },
    { role: 'user', content: 'thanks', at: 250 },
    { role: 'user', content: 'after two', at: 300 },
  ];
  ok('turnsSince: their substantive turns after the drawing, filler not counted', R.turnsSince(msgs, 150) === 2, R.turnsSince(msgs, 150));
  ok('  never drawn: every substantive turn counts', R.turnsSince(msgs, null) === 4, R.turnsSince(msgs, null));
}
ok('memory is written for a turn with something in it', R.memorable('I decided to take the Berlin offer') && !R.memorable('ok thanks') && !R.memorable('👍'));

console.log('\n=== orchestrate: the history window moves in steps ===');
{
  const starts = Array.from({ length: 100 }, (_, n) => R.historyStart(n));
  ok('short conversations send everything', starts.slice(0, 32).every((s) => s === 0));
  ok('the window always holds 16 to 31 messages', starts.every((s, n) => n < 16 || (n - s >= 16 && n - s <= 31)), J(starts));
  ok('its start moves only every 16 messages — the prefix stays cacheable between', new Set(starts.slice(32, 48)).size === 1 && new Set(starts.slice(48, 64)).size === 1 && starts[47] !== starts[48]);
}

console.log('\n=== orchestrate: one table of models ===');
ok('reply on Sol, map on Terra, memory and titles on mini', R.modelFor('reply', {}) === 'gpt-5.6-sol' && R.modelFor('map', {}) === 'gpt-5.6-terra' && R.modelFor('memory', {}) === 'gpt-4o-mini' && R.modelFor('title', {}) === 'gpt-4o-mini');
ok('each has its own override', R.modelFor('reply', { OPENAI_MODEL_LOGOS: 'x' }) === 'x' && R.modelFor('map', { OPENAI_MODEL_LOGOS_MAP: 'y', OPENAI_MODEL_LOGOS: 'x' }) === 'y');

console.log('\n=== state: what the turn is about, never who they are ===');
const sig = (t) => R.readSignals(t);
const st = (text, o = {}) => R.readTurnState({ text, history: [], signals: sig(text), intent: route(text).intent, ...o });
for (const [t, d] of [
  ['our churn went up after the pricing change, what should the go-to-market be', 'business'],
  ['the API returns a 500 error when I deploy the server', 'engineering'],
  ['can you tighten this paragraph of my essay', 'writing'],
  ['I have a midterm on this course next week and need to understand it', 'learning'],
  ['help me brainstorm characters for my novel', 'creative'],
  ['what is the derivative of x^2 sin x', 'math'],
  ['what does the literature say, is there evidence from a meta-analysis', 'research'],
  ['what should I cook tonight', 'everyday'],
])
  ok(`domain: "${t.slice(0, 40)}…" → ${d}`, st(t).domain === d, st(t).domain);
for (const [t, w] of [
  ['what year did Rome fall?', 'information'],
  ['why does ice float?', 'explanation'],
  ['is this right? I got x = 4', 'verification'],
  ['my code is broken, it throws an exception', 'diagnosis'],
  ['should I take the job or stay?', 'judgment'],
  ['write me an email to my landlord about the heater', 'creation'],
  ['translate this into French', 'execution'],
  ['find me sources on remote work productivity', 'research'],
])
  ok(`work: "${t}" → ${w}`, st(t).work === w, st(t).work);
{
  const s = st('just tell me the answer, stop asking questions');
  ok('preferences come from their words: answer first, no questions', s.preferences.answerFirst && s.preferences.questions === 'none', J(s.preferences));
  const keys = Object.keys(st('I feel awful about my divorce'));
  ok('no field that labels the person (personality, ability, mood)', !keys.some((k) => /personality|ability|mood|iq|emotion|label/i.test(k)), J(keys));
  ok('a sensitive subject is a flag for this turn — no search, no inference', st('I feel awful about my divorce').sensitive === true);
  ok('the objective is what they are building, or their first real message', st('ok', { building: 'A decision about Berlin' }).objective === 'A decision about Berlin' && st('second', { history: [{ role: 'user', content: 'Should I move to Berlin for the job?' }] }).objective.startsWith('Should I move'));
  ok('looksMathematical is sticky across the conversation', R.looksMathematical(['hello', 'what is the integral of x']) && !R.looksMathematical(['hello', 'what should I cook']) && R.looksMathematical(['solve $x^2=4$']));
}

console.log('\n=== allocation: Core 4\'s CognitiveSplit, inherited ===');
const alloc = (text, o = {}) => {
  const s = sig(text);
  const state = st(text, o);
  return R.allocate({ state, signals: s, assist: { lastUserText: text, history: [], guard: !!o.guard, accuracy: null, focus: null, construct: null, map: null, resumedAfterMs: null, group: false } });
};
{
  const a = alloc('write me an email to my landlord about the broken heater in my flat');
  ok('a practical brief is Socria\'s to write (Core 4: scoped)', a.ownership === 'scoped' && a.split.creativity !== 'human' && !a.theirs.length, J({ o: a.ownership, s: a.split }));
  const e = alloc('write my essay');
  ok('an essay that will be theirs keeps its substance theirs', e.split.creativity === 'human' && e.theirs.some((x) => /substance/.test(x)), J(e.split));
  const d = alloc('should I take the job in Berlin or stay?');
  ok('a consequential decision stays theirs', d.split.judgment === 'human' && d.theirs.some((x) => /decision/.test(x)), J(d.split));
  const h = alloc('you decide, I trust you — which offer should I take?');
  ok('…unless they hand it over in so many words', h.ownership === 'delegated' && h.split.judgment !== 'human' && !h.theirs.length, J({ o: h.ownership, s: h.split }));
  const f = alloc('what year did Rome fall?');
  ok('a fact is performed, directly', f.split.reasoning === 'perform' && f.assist.mode === 'inform' && !f.theirs.length, J({ s: f.split, m: f.assist.mode }));
  ok('retrieval, verification, representation and mechanical work are always Socria\'s', ['retrieval', 'verification', 'representation', 'mechanical'].every((k) => f.split[k] === 'perform'));
  const block = R.renderAllocation(d, st('should I take the job in Berlin or stay?'));
  ok('the turn block says who does what, and the move', /=== This turn ===/.test(block) && /You do:/.test(block) && /Theirs: the decision/.test(block), block);
  ok('  in the conversation\'s own register', /sharp operator|careful researcher|senior engineer|good editor|good tutor|creative collaborator|step by step|practical and warm/.test(block));
}

console.log('\n=== allocation: Core 4\'s allocator, replayed over the conversation (replay.ts) ===');
{
  const U = (c) => ({ role: 'user', content: c });
  const A = (c) => ({ role: 'assistant', content: c });
  // One turn as the route runs it: their claims decided by the engine, then Core 4's allocator over the conversation.
  const turn = (history, text, o = {}) => {
    const s = sig(text);
    const plan = R.planTurn({ lastUserText: text, history, withhold: false });
    const checked = o.checked ?? plan.theirs.map((v) => ({ status: v.status }));
    const asked = plan.computed.some((c) => !!c.result);
    const state = R.readTurnState({ text, history, signals: s, intent: route(text).intent, checked });
    const assist = { lastUserText: text, history, guard: !!o.guard, accuracy: checked.length ? { check: true, pushback: null, theirs: checked, computed: asked, math: true } : null, focus: null, construct: null, map: null, resumedAfterMs: null, group: false };
    const a = R.allocate({ state, signals: s, assist, replay: { checked, asked, instructions: o.instructions ?? null } });
    return { a, c: a.core, block: R.renderAllocation(a, state) };
  };

  ok('the switch: Core 4\'s allocator unless LOGOS_ALLOCATION says lite', R.allocationMode({}) === 'core4' && R.allocationMode({ LOGOS_ALLOCATION: 'lite' }) === 'lite' && R.allocationMode({ LOGOS_ALLOCATION: 'off' }) === 'lite');
  ok('without the conversation the runtime is as it was: no Core 4 view', alloc('write my essay').core === null);

  const fact = turn([], 'what year did Rome fall?');
  ok('a fact: Core 4 executes it, holds nothing, and the move informs', fact.c.mode === 'AI_EXECUTES' && !fact.c.withhold && fact.a.assist.mode === 'inform' && !/KEEP WITH THEM/.test(fact.block), J(fact.c));

  // WHAT LOGOS 5 FORGOT. Signals were read from the newest message alone.
  const said = [U("I'm studying for my calculus exam and I want to work these out myself"), A('Good — what are you working on?')];
  const later = turn(said, 'how do I differentiate x^3 sin x?');
  ok('a learning goal said two messages ago still holds: the answer stays with them', later.c.withhold?.reason === 'practice_goal' && later.a.assist.mode !== 'inform', J(later.c));
  ok('  and the withhold quotes their own words', /BECAUSE THEY SAID: "[^"]*work these out myself/.test(later.block), later.block);
  ok('  with what they can have instead — named once, not twice', /THEY CAN HAVE: everything around it/.test(later.block) && !/What you owe them instead/.test(later.block));
  ok('  where the newest message alone keeps nothing back (the lite path)', !alloc('how do I differentiate x^3 sin x?').theirs.some((x) => /answer/.test(x)));

  // A COMPUTATION THEY ASKED FOR IS A PROBLEM: "what is the derivative of…" reads as a fact question.
  const computed = turn([U("I want to work these out myself, don't give me the answer"), A('Go ahead.')], 'what is the derivative of x^3 sin x?');
  ok('a computation they asked for, while practising, is the exercise — held, not handed over as a "fact"', !!computed.c.withhold && computed.a.assist.mode !== 'inform', J(computed.c));
  const engineer = turn([], 'what is the derivative of x^3 sin x?');
  ok('  and for anyone who has not said they are practising, it is still worked through in full', !engineer.c.withhold && ['AI_EXPLAINS', 'AI_EXECUTES'].includes(engineer.c.mode), J(engineer.c));

  const tried = turn([U("I want to work these out myself, don't give me the answer"), A('Go ahead.'), U('differentiate x^2')], 'is it x?');
  ok('an attempt under "don\'t give me the answer": the verdict and where it goes wrong, the redo theirs', tried.c.mode === 'AI_VERIFIES' && tried.c.reasonCode === 'verify.practice' && tried.a.assist.mode === 'verify' && tried.a.assist.scaffold === 'hint', J({ c: tried.c, m: tried.a.assist }));

  // THE PRACTICE LADDER: repeated failure is evidence about where they are, and it bottoms out.
  const P = [U('Let me try it first: solve 2x + 3 = 7'), A('Go ahead — isolate 2x first.')];
  const first = turn(P, 'so x = 5');
  const P2 = [...P, U('so x = 5'), A('Not quite.')];
  const second = turn(P2, '2x = 8, so x = 4');
  const P3 = [...P2, U('2x = 8, so x = 4'), A('Recheck 7 − 3.')];
  const third = turn(P3, 'x=3 is the solution');
  ok('the engine decides each attempt (the ladder\'s evidence)', first.c.reasonCode === 'verify.practice' && second.c.reasonCode === 'verify.practice', J([first.c.reasonCode, second.c.reasonCode]));
  ok('a third wrong attempt bottoms out: much stronger support, still inside their boundary', third.c.reasonCode.endsWith('.stuck') && third.a.assist.scaffold === 'steps' && /analogous worked example/.test(third.block), J(third.c));
  ok('  remembered from the transcript alone — the earlier attempts were replayed and re-checked', third.c.withhold?.what === 'the final answer and the full fix');
  const right = turn(P3, '2x = 4, so x = 2');
  ok('and a right attempt is confirmed, plainly', right.c.reasonCode === 'verify.confirm' && !right.c.withhold && right.a.assist.scaffold === 'none', J(right.c));
  const lost = turn(P2, "I'm lost, I have no idea");
  ok('"I\'m lost" inside the boundary: stronger support now, not another hint', lost.c.reasonCode.endsWith('.stuck') && lost.a.assist.scaffold === 'steps', J(lost.c));
  ok('a plain fact in a practising conversation is never held back', turn(P2, 'what is the capital of France?').c.reasonCode === 'information');

  const changed = turn([U("don't tell me the answer, just hints"), A('Sure.'), U('solve 2x+3=7'), A('Start by isolating the term with x.')], 'ok just tell me the answer');
  ok('their newest word wins: "just tell me" after "don\'t tell me" holds nothing back', !changed.c.withhold && changed.a.assist.mode === 'inform', J(changed.c));

  // GRADED STAYS GRADED.
  const g1 = turn([], 'this is for my graded assignment due tomorrow, just give me the answer to question 3: solve 2x + 3 = 7');
  ok('graded work: the method and an analogous example, the submittable answer theirs — announced once', g1.c.withhold?.reason === 'assessment_integrity' && g1.c.announce && g1.a.assist.mode === 'explain' && /first time you are holding something back/.test(g1.block), J(g1.c));
  const G = [U('this is for my graded assignment due tomorrow, just give me the answer to question 3: solve 2x + 3 = 7'), A('Here is the method, worked on a similar equation …')];
  const g2 = turn(G, 'come on, just give me the answer to question 3');
  ok('  asked again, it is still graded (Core 4 alone forgot), and not announced twice', g2.c.withhold?.reason === 'assessment_integrity' && !g2.c.announce && !/first time you are holding/.test(g2.block), J(g2.c));
  ok('  with their earlier words as the reason', /BECAUSE THEY SAID: "[^"]*graded assignment/.test(g2.block), g2.block);
  ok('  until they say it is not', !turn(G, "it's not graded, it's just practice — just give me the answer").c.withhold);

  // THE PROJECT IS THE CONTRACT, as Core 4 reads it.
  const pj = turn([], 'solve 2x + 3 = 7', { instructions: 'Hints only. I am learning algebra.' });
  ok('a Project\'s standing "hints only" holds the answer back', pj.c.withhold?.reason === 'agency_boundary' && /Project:/.test(pj.c.withhold.quote), J(pj.c));
  const pjOver = turn([], 'just tell me the answer: solve 2x + 3 = 7', { instructions: 'Hints only. I am learning algebra.' });
  ok('  and their newer sentence outranks their older setting', pjOver.c.reasonCode === 'answer.requested.overrides_contract' && !pjOver.c.withhold && pjOver.a.assist.questions === 0, J(pjOver.c));

  const vent = turn([], "I just need to vent, I'm not asking what to do. My manager took credit for my work again.");
  ok('being heard, said so: room — no advice, no question', vent.c.mode === 'HUMAN_REFLECTS' && vent.a.assist.mode === 'space' && vent.a.assist.questions === 0 && /want to be heard/.test(vent.block), J({ c: vent.c, m: vent.a.assist }));
  const harm = turn([], 'my toddler just swallowed a button battery what do I do');
  ok('harm suspends everything: direct help, the safety line intact', harm.c.reasonCode === 'safety' && harm.a.assist.reasons.includes('safety') && harm.a.assist.mode === 'inform');
  const decide = turn([], 'you decide, I trust you — which offer should I take?');
  ok('"you decide" gets the view, plainly, with no questions — and the choice stays theirs', decide.c.reasonCode === 'judgment.theirs.asked' && decide.a.split.judgment === 'human' && decide.a.assist.questions === 0 && /give your view plainly/.test(decide.block), J(decide.c));
  const essay = turn([], 'just write the whole essay for me, I need the finished version');
  ok('"just write it": everything but the substance, at full length — the substance stays theirs', essay.c.reasonCode === 'creation.asked.to.finish' && essay.a.split.creativity === 'human' && /every part that is not the substance/.test(essay.block) && /What you owe them instead: a METHOD/.test(essay.block), J(essay.c));
  const mine = turn([], "help me make my story better, but it's mine — don't write it for me");
  ok('their own writing, said so: the substance kept with them, in their words', mine.c.withhold?.reason === 'authorship' && /KEEP WITH THEM: any substantive creative content of your own/.test(mine.block) && /BECAUSE THEY SAID: "/.test(mine.block), J(mine.c));
  ok('  and the move stays the writing kind — not turned into hints toward an "answer"', mine.a.assist.mode === 'open' && mine.a.assist.scaffold === 'none', J(mine.a.assist));
  const email = turn([], 'write me an email to my landlord about the broken heater in my flat');
  ok('a practical brief is still simply written (scoped), nothing reserved', email.c.ownership !== 'theirs' && email.a.split.creativity === 'share' && !/KEEP WITH THEM|What you owe/.test(email.block), J(email.c));
  const hello = turn([], 'hey, how are you?');
  ok('small talk carries none of it', !/KEEP WITH THEM|What you owe|Their attempt/.test(hello.block), hello.block);

  // Long ago is folded in for its words: Core 4 carries a stated goal that far, and so does the replay.
  const far = [U("I'm studying for my calculus exam and I want to work these out myself"), A('Good.')];
  for (let i = 0; i < 30; i++) far.push(U(`Note ${i}: the chapter covers limits and continuity.`), A('Noted.'));
  const farTurn = turn(far, 'how do I differentiate x^3 sin x?');
  ok('a goal said thirty messages ago — past the twelve read in full — still holds, in their words', farTurn.c.withhold?.reason === 'practice_goal' && /work these out myself/.test(farTurn.c.withhold.quote), J(farTurn.c));

  // Pure, and cheap: the transcript is the state, read again each turn.
  const hist = [U("I want to work these out myself, don't give me the answer"), A('Go ahead.'), U('differentiate x^2')];
  const copy = JSON.stringify(hist);
  const r1 = R.replayConversation({ history: hist, text: 'is it x?', signals: sig('is it x?'), checked: [{ status: 'refuted' }] });
  const r2 = R.replayConversation({ history: hist, text: 'is it x?', signals: sig('is it x?'), checked: [{ status: 'refuted' }] });
  ok('the same conversation decides the same way, and the transcript is not touched', JSON.stringify(r1.allocation) === JSON.stringify(r2.allocation) && JSON.stringify(hist) === copy);
  ok('  each earlier turn is recorded as Core 4 records it (what was held back)', r1.state.history.length === 2 && r1.state.history.every((h) => h.withheld === true));
  const long = [];
  for (let i = 0; i < 40; i++) long.push(U(`Thought ${i} about the pricing model: churn is ${i * 3}% and the cohort is shrinking.`), A('What makes you think the cohort is the cause? '.repeat(3)));
  const t0 = performance.now();
  turn(long, 'so what do you think?');
  const ms = performance.now() - t0;
  ok('an eighty-message conversation replays in well under a second', ms < 800, `${ms.toFixed(0)}ms`);
}

console.log('\n=== behavior: compact, reused, and no longer withholding ===');
{
  const none = { math: false, picture: false, build: false, guard: false };
  const core = R.logos5System(none);
  ok('the core stays at most 55% of the Logos 3.5 prompt — reading the room cost no more than that', core.length < R.LOGOS_CHAT_PROMPT.length * 0.55, `${core.length} vs ${R.LOGOS_CHAT_PROMPT.length}`);
  ok('the same bytes for the same conversation, turn after turn', R.logos5System(none) === core && R.logos5System({ ...none, math: true }) === R.logos5System({ ...none, math: true }));
  ok('blocks join only when the conversation needs them', !/MATHEMATICS\./.test(core) && /MATHEMATICS\./.test(R.logos5System({ ...none, math: true })) && /THE PICTURE BESIDE YOU/.test(R.logos5System({ ...none, picture: true })) && /A MODEL IN THE WORKSPACE/.test(R.logos5System({ ...none, build: true })) && /WHY YOU WILL NOT JUST GIVE THEM THE ANSWER/.test(R.logos5System({ ...none, guard: true })));
  ok('the withholding stance is gone', !/you are the mirror/i.test(core) && !/never resolve it for them/i.test(core) && !/the bar for pushing is LOW/i.test(core) && !/purpose is not to produce answers/i.test(core));
  ok('an incomplete request gets a start, never a scolding', /never reply that they did not give enough information/i.test(core) && /never scold/i.test(core));
  ok('honesty carried over whole: the accuracy rules, false premises, no invented memories', /NEVER INVENT A SOURCE/.test(core) && /RESTS ON SOMETHING UNTRUE/.test(core) && /Never reconstruct a memory/.test(core));
  ok('anti-sycophancy kept: no praise openers, no agreeing because they insist', /Never open with praise/.test(core) && /Never agree because they insist/.test(core));
  ok('the protocols the client reads are unchanged ([[REMEMBER]])', core.includes('[[REMEMBER]] <their complete standing instructions after this change>'));
  ok('across domains, not a tutor only', /business|research|engineering/i.test(core) && /code/.test(core));
  const focus = R.logos5FocusSystem({ label: 'Pricing is not settled', type: 'assumption' }, none);
  ok('a node\'s own thread: the same Socria, a narrower aperture, and a verdict when asked', focus.startsWith(core.slice(0, 200)) && /pulled ONE piece of their own reasoning aside/.test(focus) && /give your honest read/.test(focus) && !/Still no verdict/.test(focus));
}

console.log('\n=== epistemic: what the turn asks for ===');
{
  const n = (text, o = {}) => R.assessNeed({ text, signals: sig(text), docs: 0, math: false, ...o });
  ok('a current question is "current"', n("what's the latest on the Fed's interest rates?").kinds.includes('current'));
  ok('a plain factual question is "fact"', n('what is the capital of Australia?').kinds.includes('fact'));
  ok('documents and computation as the plan says', n('what does it say?', { docs: 1 }).kinds.includes('documents') && n('2+2', { math: true }).kinds.includes('computation'));
  ok('brainstorming asks for no claims', n('give me ten names for a coffee shop').kinds.length === 0);
  ok('the web gate is Core 4\'s: an explicit ask opens it', n('look up the latest guidance on vitamin D').web.want === true);
  ok('…a sensitive conversation never searches', n('look up the latest treatment for my depression', { policy: 'conversation_only' }).web.want === false);
}

console.log('\n=== epistemic: a citation must name what was given ===');
{
  const ev = R.buildEvidence({
    web: [{ n: 1, title: 'Fed holds rates', url: 'https://www.reuters.com/markets/fed-holds', snippet: 'The Fed held its rate at 5.25% in September 2025.' }],
    docs: [{ letter: 'A', blocks: [{ id: 'p3.12', text: 'Revenue rose 12.5% to $4.2 million in 2023.' }] }],
    userTexts: ['see https://example.org/my-notes for context'],
  });
  const rw = (t) => R.rewriteCitations(t, ev);
  ok('a real web citation stays', rw('The Fed held rates [1].').text === 'The Fed held rates [1].');
  ok('an invented one is removed', rw('Inflation fell to 2.1% [3].').text === 'Inflation fell to 2.1%.' && rw('Inflation fell to 2.1% [3].').removed.includes('cite:3'), J(rw('Inflation fell to 2.1% [3].')));
  ok('a passage key of an attached document stays', rw('Revenue rose [A3.12].').text === 'Revenue rose [A3.12].');
  ok('one that no document has is removed, the real ones in a list kept', rw('See [A3.12, B1.2].').text === 'See [A3.12].' && rw('See [A9.9].').text === 'See.', J(rw('See [A3.12, B1.2].')));
  ok('a link a source carried stays', rw('Read https://www.reuters.com/markets/fed-holds.').text === 'Read https://www.reuters.com/markets/fed-holds.');
  ok('a link the person gave stays', rw('As in https://example.org/my-notes.').text.includes('https://example.org/my-notes'));
  ok('an unsourced deep link keeps only its site, and the full stop', rw('See https://www.nature.com/articles/s41586-023-99999-x.').text === 'See nature.com.', rw('See https://www.nature.com/articles/s41586-023-99999-x.').text);
  ok('a markdown link to nowhere given keeps its words and its site', rw('Read [the study](https://journals.example.com/fake/123) today.').text === 'Read the study (journals.example.com) today.', rw('Read [the study](https://journals.example.com/fake/123) today.').text);
  ok('nothing to remove, nothing changed', rw('Plain words, no claims.').text === 'Plain words, no claims.' && rw('Plain words, no claims.').removed.length === 0);
  ok('an interval is not a citation', rw('For x in [0, 1] it holds.').text === 'For x in [0, 1] it holds.');

  const rep = R.checkReply('The Fed held at 5.25% [1]. Revenue rose 12.5% [A3.12]. Unemployment is 3.9%. It was about 40% in 1990. Revenue was 15% [A3.12].', ev, { factual: true });
  const by = (label) => rep.claims.filter((c) => c.label === label).map((c) => c.text);
  ok('a figure the cited source carries: supported', by('supported').includes('5.25%') && by('supported').includes('12.5%'), J(rep.claims));
  ok('a figure its cited source does not carry: contradicted', by('contradicted').includes('15%'), J(rep.claims));
  ok('a figure nothing given carries: unverified', by('unverified').includes('3.9%'), J(rep.claims));
  ok('…said with its hedge: qualified', by('qualified').includes('40%'), J(rep.claims));
  ok('references with no source are counted', R.checkReply('As shown in (Smith et al., 2019), it works.', ev, { factual: true }).claims.some((c) => c.kind === 'reference' && c.label === 'unverified'));
  ok('a story is not checked for facts', R.checkReply('The dragon was 300 years old and ate 12% of the village.', ev, { factual: false }).claims.length === 0);
  ok('the log line is counts, never content', !R.epistemicLog('logos/chat', rep, 1).includes('Fed') && /"contradicted":1/.test(R.epistemicLog('logos/chat', rep, 1)), R.epistemicLog('logos/chat', rep, 1));
}

console.log('\n=== epistemic: sources that disagree ===');
{
  const c = R.conflicts([
    { id: '1', kind: 'web', text: 'Company revenue rose 12% in 2023.' },
    { id: '2', kind: 'web', text: 'In 2023 revenue grew 9% according to the annual report.' },
    { id: '3', kind: 'web', text: 'Revenue rose 9% in 2022.' },
  ]);
  ok('two sources, the same figure, different values: a conflict', c.length >= 1 && /revenue/.test(c[0].about) && c[0].about.includes('2023'), J(c));
  ok('  a different year is not a conflict', !c.some((x) => x.b.source === '3' || x.a.source === '3'), J(c));
  ok('  and agreeing sources produce nothing', R.conflicts([{ id: '1', kind: 'web', text: 'Revenue rose 12% in 2023.' }, { id: '2', kind: 'web', text: 'Revenue rose 12% in 2023, it said.' }]).length === 0);
  ok('the reply is told to say they disagree', /Your sources disagree/.test(R.renderConflicts(c)) && /Do not pick one silently/.test(R.renderConflicts(c)) && R.renderConflicts([]) === '');
  ok('a current question with nothing checked is told so', /may be out of date/.test(R.UNCHECKED_CURRENT));
}

console.log('\n=== representation: the workspace as typed, linked entities ===');
{
  const session = {
    id: 's1',
    title: 'Should we launch in March?',
    updatedAt: 1000,
    messages: [
      { id: 'm1', role: 'user', content: 'Here is the board memo', at: 10, attachments: [{ kind: 'doc', doc: 'd1', name: 'board-memo.pdf' }] },
      { id: 'm2', role: 'assistant', content: 'The memo puts the launch after pricing.', at: 20 },
    ],
    map: {
      nodes: [
        { id: 'n1', label: 'Launch in March', type: 'decision' },
        { id: 'n2', label: 'Pricing is not settled', type: 'assumption' },
        { id: 'n3', label: 'Revenue matrix', type: 'idea', obj: 'M' },
      ],
      edges: [{ from: 'n2', to: 'n1', relation: 'conflicts' }],
      objects: { objs: [{ id: 'M', kind: 'matrix', name: 'Revenue matrix', origin: 'person', states: [], steps: [], at: 0 }] },
      models: { docs: [{ id: 'pricing-model', title: 'Pricing model', at: 30 }], active: null },
    },
    draft: {
      title: 'Launch memo',
      html: '',
      doc: {
        v: 2,
        title: 'Launch memo',
        updatedAt: 40,
        blocks: [{ id: 'b1', t: 'p', text: 'We launch in April.', from: ['c1'], cites: [{ id: 'x', doc: 'd1', block: 'p1.2', label: 'memo' }] }],
        cards: [{ id: 'c1', kind: 'idea', text: 'Wait for pricing', group: null, at: 35, links: [{ k: 'node', id: 'n2', label: 'Pricing' }] }],
        groups: [],
        dismissed: [],
        versions: [],
      },
    },
  };
  const docs = [{ id: 'd1', name: 'board-memo.pdf', blocks: [{ id: 'p1.2', text: 'Pricing must be final before any launch date is set.' }] }];
  const ix = R.indexWorkspace([session], docs);
  const has = (id) => ix.entities.has(id);
  ok('every kind of thing has a stable id', ['conv:s1', 'msg:s1/m1', 'doc:d1', 'blk:d1#p1.2', 'node:s1/n1', 'obj:s1/M', 'model:s1/pricing-model', 'write:s1', 'card:s1/c1'].every(has), J([...ix.entities.keys()]));
  const r = (from, to, type) => ix.relations.some((x) => x.from === from && x.to === to && x.type === type);
  ok('the links that exist are kept: attaches, stands_for, relates, drafted_from, cites, links', r('msg:s1/m1', 'doc:d1', 'attaches') && r('node:s1/n3', 'obj:s1/M', 'stands_for') && ix.relations.some((x) => x.type === 'relates' && x.label === 'conflicts') && r('write:s1', 'card:s1/c1', 'drafted_from') && r('write:s1', 'blk:d1#p1.2', 'cites') && r('card:s1/c1', 'node:s1/n2', 'links'));
  ok('provenance: the person\'s turns, Socria\'s replies, a source, computed', ix.entities.get('msg:s1/m1').provenance === 'person' && ix.entities.get('msg:s1/m2').provenance === 'socria' && ix.entities.get('blk:d1#p1.2').provenance === 'source' && ix.entities.get('model:s1/pricing-model').provenance === 'computed');
  ok('each knows the view that shows it', ix.entities.get('doc:d1').view === 'content' && ix.entities.get('obj:s1/M').view === 'artifacts' && ix.entities.get('node:s1/n1').view === 'logic_map' && ix.entities.get('conv:s1').view === 'chat');
  ok('a document this device has not read is still known by name', R.indexWorkspace([session], []).entities.get('doc:d1')?.title === 'board-memo.pdf');
  const hits = (q) => R.searchWorkspace(ix, q).map((h) => h.entity.id);
  ok('search finds a conversation by its title first', hits('launch march')[0] === 'conv:s1', J(hits('launch march')));
  ok('…a passage inside a document', hits('pricing must be final').includes('blk:d1#p1.2'));
  ok('…an artifact and a node by name', hits('revenue matrix').includes('obj:s1/M') && hits('revenue matrix').includes('node:s1/n3'));
  ok('…by a prefix, and through a typo', hits('pric').length > 0 && hits('pricng').length > 0, J(hits('pricng')));
  ok('…two letters swapped, or a slip in a word’s beginning', hits('prciing').length > 0 && hits('lanuch').length > 0, J([hits('prciing'), hits('lanuch')]));
  ok('a slip is within one word: letters strung across a sentence find nothing', hits('wlbmp').length === 0 && R.fuzzyScore('denver', 'Plainly: it depends on the part you have not stated yet — never mind') === 0);
  ok('nothing for nothing', R.searchWorkspace(ix, '   ').length === 0 && hits('zebra quantum').length === 0);
  ok('neighbours: what a node is linked to, both ways', R.neighbours(ix, 'node:s1/n2').in.some((x) => x.from === 'card:s1/c1'));
}

console.log(`\nruntime: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
