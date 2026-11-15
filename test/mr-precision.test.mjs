// METACOGNITIVE REGULATION — PRECISION (policy mr-2026.11.1).
//
// What is held down, on real transcripts with ACS's real move (chooseAssist)
// as the input MR regulates:
//   • the readers: an open or underspecified first request (the networking
//     case), "I'm stuck" with and without their work on the table, a
//     correction, "I know that", a question asked for something already
//     said, a question asked again, background said again, a re-ask after a
//     long reply, fixes that did not work, and a new topic — each on the
//     transcripts where it must fire and the near-misses where it must not;
//   • the fast loop: what each reading changes, and that ACS's budget, their
//     words, their stop, the Answer Guard and ACS's own move all come first;
//     clear questions change nothing;
//   • the measures: the shape of a reply and how their next message met it,
//     recorded as codes and counts, and never read by anything that
//     regulates;
//   • the invariants: the rule order (a question is never widened), every
//     decision bounded, justified and traceable, most turns doing nothing;
//   • the pin: under mr-2026.10.1 none of it happens.

import * as MR from './.tmp/mr-under-test.mjs';
import { readSignals } from './.tmp/signals.mjs';
import { chooseAssist } from './.tmp/assist.mjs';

const M = MR;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
/** Deep equality whatever the key order (a sanitized record is rebuilt in its schema's order). */
const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
const same = (x, y) => J(sorted(x)) === J(sorted(y));
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const u = U;
const a = A;
const FULL = { arm: 'full', ifr: true, shadow: false, source: 'deployment' };
const PV = MR.MR_POLICY_VERSION;
const PV10 = 'mr-2026.10.1';

/** MR's input for the newest message of a transcript, with ACS's real move unless one is given. */
function input(messages, o = {}) {
  const last = messages[messages.length - 1].content;
  const signals = readSignals(last);
  const history = messages.slice(0, -1);
  const assist = o.assist ?? chooseAssist({ lastUserText: last, history, guard: !!o.guard, signals });
  return {
    conversationKey: o.key ?? 'conv_p',
    messages,
    signals,
    acs: { assist, core: o.core ?? null, split: null },
    turnState: {
      work: o.work ?? 'conversation',
      domain: o.math ? 'math' : 'general',
      intent: 'conversation',
      exchange: { kind: 'task' },
      preferences: { questions: 'normal', answerFirst: false, guard: !!o.guard, learning: null, expertise: null, style: null },
      objective: '',
      understanding: { right: 0, wrong: 0, saidStuck: false },
      ...(o.turnState ?? {}),
    },
    context: {
      guard: !!o.guard,
      length: o.length ?? null,
      maxReply: 700,
      shared: false,
      accuracy: { check: false, computed: false, math: !!o.math, theirs: o.theirs ?? [] },
      ...(o.material !== undefined ? { material: o.material } : {}),
    },
    condition: o.condition ?? FULL,
    ...(o.carried ? { carried: o.carried } : {}),
    env: { LOGOS_MR: 'on', ...(o.env ?? {}) },
    now: o.now ?? (() => 0),
  };
}
/** Every regulated turn of this suite, with the move ACS made, for the invariants (I2). */
const RUNS = [];
const run = (messages, o = {}) => {
  const i = input(messages, o);
  const r = MR.regulateTurn(i);
  RUNS.push({ messages, o, acs: i.acs.assist, r });
  return r;
};
const acsOf = (messages, o = {}) => {
  const last = messages[messages.length - 1].content;
  return chooseAssist({ lastUserText: last, history: messages.slice(0, -1), guard: !!o.guard, signals: readSignals(last) });
};
const rec = (r, trigger) => r.state.interventions.filter((i) => i.decision.trigger === trigger).pop();
const nowCodes = (r) => r.state.observations.filter((o) => o.turn === r.state.turn).map((o) => o.code);

// ── the readers ──────────────────────────────────────────────────────
const params = M.paramsFor(PV);
const params10 = M.paramsFor(PV10);
/** Observations at their newest message (or at user turn k). */
function at(messages, ctx = {}, k = null) {
  const turns = M.turnsOf(messages);
  return M.observeTurn(turns, k ?? turns.length - 1, { params, ...ctx });
}
const at10 = (messages, ctx = {}) => at(messages, { ...ctx, params: params10 });
const codes = (obs) => obs.map((o) => o.code);
const has = (obs, c) => obs.some((o) => o.code === c);
const get = (obs, c) => obs.find((o) => o.code === c);
const refCodes = (o) => (o ? o.refs.map((r) => r.code) : []);

// A reply that explains (no questions), about `n` words (mr-ifr's fixture).
const EXPLAIN_SENTENCE = 'The derivative measures how fast a function changes as its input changes, and the power rule brings the exponent down in front.';
const explanation = (n = 60) => {
  const w = EXPLAIN_SENTENCE.split(' ').length;
  return Array.from({ length: Math.ceil(n / w) }, () => EXPLAIN_SENTENCE).join(' ');
};
const ANSWERED = 'Sure. Here is how it works: the power rule says you multiply by the exponent and subtract one from it, so x^3 becomes 3x^2.';

const Q = 'Why is AI not solving problems?';
const GOOD = 'In short, AI does well on narrow problems with clear goals and lots of examples, and badly where goals are fuzzy or the data is thin. Do you mean in your own work, or AI in general?';
const WINDOWS = 'On Windows, open Settings, then System, then Storage, and turn on Storage Sense. It clears temporary files and old downloads automatically, and you can run it now from the same page.';
const APPROACH =
  'Substitution works by spotting a function and its derivative sitting together inside the integral. Here the inner function is x squared, and its derivative, 2x, sits right beside the exponential, so changing the variable turns the whole thing into the integral of e to a single variable, which you already know how to integrate.';
const SUGGEST1 =
  'Start by forgetting the network on the laptop and joining it again with the password, then turn off the power saving setting for the wireless adapter in Device Manager, because Windows often switches the adapter off to save battery and that drops the connection every few minutes.';
const SUGGEST2 =
  "Next, update the wireless driver from the laptop maker's support page rather than through Windows Update, and move the router to a channel that fewer neighbours use, since a crowded channel or an outdated driver are the two most common reasons a connection keeps falling over.";
const LONG300 = [
  'A resume stands out when a recruiter can see within a few seconds what you did and why it mattered.',
  'Most recruiters skim each page for well under a minute before deciding whether to read it properly.',
  'Lead every bullet with a strong verb and end it with a measurable result wherever you have one.',
  'Numbers such as revenue grown, hours saved or customers served are easier to trust than adjectives.',
  'Tailor the top third of the page to the specific role, because that is where attention lands first.',
  'A short summary of two lines can frame your experience, but only if it names the job you want.',
  'Cut duties that anyone in your position would have had, and keep the things only you achieved.',
  'Group skills by kind, such as languages, tools and methods, rather than listing them in one long line.',
  'Keep the layout plain, with one clear font and consistent spacing, so automated screeners can parse it.',
  'Put education after experience once you have worked for a few years, unless the degree is the point.',
  'Projects outside work count too, especially when they show the skills the advert asks for by name.',
  'Mirror the wording of the advert where it is honest to do so, since screeners often match exact terms.',
  'Two pages are fine for a long career, but a single page reads better for early roles and internships.',
  'Remove photographs, dates of birth and other personal details that invite bias and add nothing.',
  'Ask a friend in the same field to read it cold and tell you what they remember after thirty seconds.',
  'Save the final version as a file named after you and the role, which looks careful when it arrives.',
  'Keep a longer master document with everything, and trim a copy for each application you send out.',
  'Check every date, title and company name twice, because small errors suggest carelessness elsewhere.',
  'Link to a portfolio or a public profile only when it is current and supports what the page claims.',
  'Above all, make each line answer the silent question a hiring manager asks: what will this person do for us?',
].join(' ');
const S1 = 'Most enterprise AI projects stall because the training data sits scattered across separate systems that were never designed to share records.';
const S2 = 'Integrating the model with existing workflows and approval chains usually takes far longer than building the model itself, so budgets run dry first.';

console.log('\n=== R1: the networking case, read as an open request ===');
{
  const obs = at([u(Q)]);
  ok('"Why is AI not solving problems?" → exactly observed.open_request', J(codes(obs)) === J(['observed.open_request']), J(codes(obs)));
  const o = get(obs, 'observed.open_request');
  ok('  observed, moderate, 0.6', o && o.provenance === 'observed' && o.strength === 'moderate' && o.confidence === 0.6, J(o));
  ok(
    '  refs name what was counted, each {turn 0, user}',
    o && J(o.refs) === J(['request.open', 'request.first', 'request.broad_subject', 'request.vague_outcome'].map((code) => ({ turn: 0, role: 'user', code }))),
    J(o?.refs)
  );
  ok('  under mr-2026.10.1: nothing', at10([u(Q)]).length === 0, J(codes(at10([u(Q)]))));
}

console.log('\n=== R2: open requests, and the questions that are not ===');
const OPEN_FIRE = [
  'Why is AI not solving problems?',
  "Why can't AI do anything useful?",
  'why isnt tech fixing anything',
  'Why does technology not solve problems?',
  "Why isn't AI fixing anything yet?",
  "How come technology still can't solve real problems?",
  "Why doesn't software ever change things?",
  'So why is AI still not solving real problems?',
  'Why aren’t companies solving real problems?',
  "Why don't governments fix anything?",
  'Why is machine learning not solving real-world problems?',
];
const OPEN_SILENT = [
  'Why is the sky blue?',
  'Why is Python slow?',
  "Why doesn't my code work?",
  'Why is the API not returning data?',
  'Why do vaccines not cause autism?',
  'Why did the Roman empire fall?',
  "What's wrong with this sentence?",
  'Why is 0.1 + 0.2 not 0.3?',
  'Why do things fall?',
  'Why is AI not solving problems in my company? We use a chatbot for support tickets.',
  "Why don't you just tell me the answer?",
  'Why is nothing working out for me?',
  'Why is life not fair?',
  "What's wrong with modern art?",
  "Why don't people vote?",
  "Why don't people recycle?",
  "Why don't people exercise?",
  "Why don't people read anymore?",
  "Why don't people tip anymore?",
  "Why can't people sleep?",
  "Why aren't people vaccinated?",
  "Why aren't things cheaper?",
  "Why aren't people happier?",
  "Why doesn't the chatbot remember things?",
  'Why is AI not solving problems in healthcare?',
  'How will technology change the world?',
  'Is AI overhyped?',
  "Why doesn't the button do anything?",
  'Why is technology so expensive?',
  'Will AI take jobs?',
  'Why do startups fail?',
  'Why is AI not solving my problems?',
];
{
  for (const t of OPEN_FIRE) ok(`"${t}" → open_request`, has(at([u(t)]), 'observed.open_request'), J(codes(at([u(t)]))));
  for (const t of OPEN_SILENT) {
    const quiet = !has(at([u(t)]), 'observed.open_request') && !has(at([u(t)], { material: false }), 'observed.open_request');
    ok(`"${t}" → no open_request (nothing on screen or unknown)`, quiet, J([codes(at([u(t)])), codes(at([u(t)], { material: false }))]));
  }
  ok('the networking question with a "detailed" setting → none', !has(at([u(Q)], { length: 'detailed' }), 'observed.open_request'));
  const follow = at([u(Q), a(GOOD), u('Why are companies not using it for problems then?')]);
  ok('a same-topic follow-up → neither open_request nor new_topic', !has(follow, 'observed.open_request') && !has(follow, 'observed.new_topic'), J(codes(follow)));
  const moved = at([u('how do I convert 5 miles to km'), a('Multiply by 1.609: about 8 km.'), u(Q)]);
  // (review fix A.9: after the first turn Branch A needs nothing but chit-chat before it — "how do I convert 5 miles to km" is a request of their own)
  ok('the networking question as a new topic after a request of their own → no open_request', !has(moved, 'observed.open_request'), J(moved));
  const afterHi = at([u('hi'), a('Hi! What can I help you with?'), u(Q)]);
  ok('the networking question after "hi" → open_request with request.new_topic', J(refCodes(get(afterHi, 'observed.open_request'))) === J(['request.open', 'request.new_topic', 'request.broad_subject', 'request.vague_outcome']), J(afterHi));
  ok('  …and observed.new_topic', has(moved, 'observed.new_topic'), J(codes(moved)));
  const nt = get(moved, 'observed.new_topic');
  ok('  new_topic refs: request.new_topic at this turn, request.previous at the one before', nt && J(nt.refs) === J([{ turn: 1, role: 'user', code: 'request.new_topic' }, { turn: 0, role: 'user', code: 'request.previous' }]), J(nt?.refs));
  ok('  under mr-2026.10.1: neither', !has(at10([u('how do I convert 5 miles to km'), a('Multiply by 1.609: about 8 km.'), u(Q)]), 'observed.open_request') && !has(at10([u('how do I convert 5 miles to km'), a('Multiply by 1.609: about 8 km.'), u(Q)]), 'observed.new_topic'));
}

console.log('\n=== R3: what they point at is not in the conversation (live only) ===');
const REFERENT_FIRE = ['How do I fix this?', 'Help me fix this bug.', 'Solve this equation', 'How do I approach this problem?', 'Can you explain this?', 'Why does this happen?', 'How do I do it?', 'I need help with this one'];
const REFERENT_SILENT = ['Write a unit test for this function please', 'Can you explain this proof that root 2 is irrational?', 'What does this mean?', 'Fix the typo in line 3 of my code', "I'm stuck on this proof"];
{
  const o = get(at([u('How do I fix this?')], { material: false }), 'observed.open_request');
  ok('"How do I fix this?" with nothing on screen → open_request with request.missing_referent', refCodes(o).includes('request.missing_referent'), J(o));
  ok('  refs exactly request.open, request.first, request.missing_referent, request.nothing_shown', o && J(refCodes(o)) === J(['request.open', 'request.first', 'request.missing_referent', 'request.nothing_shown']), J(refCodes(o)));
  ok('  with something on screen → none', !has(at([u('How do I fix this?')], { material: true }), 'observed.open_request'));
  ok('  with the screen unknown → none', !has(at([u('How do I fix this?')]), 'observed.open_request'));
  ok('  as their second message → none', !has(at([u('My laptop keeps restarting.'), a(WINDOWS), u('How do I fix this?')], { material: false }), 'observed.open_request'));
  for (const t of REFERENT_FIRE) ok(`"${t}" first, nothing on screen → missing referent`, refCodes(get(at([u(t)], { material: false }), 'observed.open_request')).includes('request.missing_referent'), J(codes(at([u(t)], { material: false }))));
  for (const t of REFERENT_SILENT) ok(`"${t}" first, nothing on screen → no open_request`, !has(at([u(t)], { material: false }), 'observed.open_request'), J(codes(at([u(t)], { material: false }))));
  ok('under mr-2026.10.1: none', !has(at10([u('How do I fix this?')], { material: false }), 'observed.open_request'));
}

console.log('\n=== R4: "I\'m stuck" ===');
const STUCK_FIRE = [
  "I'm stuck",
  "ok I'm stuck on this step",
  "I'm still stuck on step 3",
  "I've been stuck on this part all day",
  "I tried factoring and now I'm stuck",
  "I'm stuck on this proof",
  "I'm stuck on my essay intro",
  "I don't know where to start",
  "honestly I don't know what to do next",
  'no idea how to start',
  "I've hit a wall",
  'I’m stuck again, help',
  "I set u = x^2 but now I'm stuck on the next step",
];
const STUCK_SILENT = [
  "I'm stuck in traffic, can you keep it quick?",
  'my car is stuck in the snow',
  'the door is stuck',
  "I'm stuck on why the sky is blue",
  "I'm stuck on the problem of evil",
  "I'm stuck on the train",
  "she's stuck on step 3",
  "she said: I'm stuck",
  'I was stuck yesterday but figured it out',
  'I followed the steps and it still did not work',
  "What's the next step after installing node?",
  "I'm stuck with this laptop for another year",
  'my build is stuck at 90%',
  "I'm stuck at the airport, any tips?",
  "My friend said I'm stuck in a rut",
  'Where do I start with learning Python?',
  'I have to solve it step by step for the exam but I get stuck at part two',
  "I'm feeling stuck on my essay intro and I don't know why.",
  'still stuck in traffic',
  // "I got" is read as the past since the review fixes (A.3): "I got stuck again but figured it out"
  'I got stuck on step 3',
];
const INTEGRATE = [u('help me integrate 2x e^(x^2)'), a(explanation(80))];
{
  for (const t of STUCK_FIRE) {
    const s = get(at([...INTEGRATE, u(t)]), 'explicit.stuck');
    ok(`"${t}" → explicit.stuck (strong 0.85) with stuck.shown and stuck.own_work`, s && s.provenance === 'explicit' && s.strength === 'strong' && s.confidence === 0.85 && refCodes(s).includes('stuck.shown') && refCodes(s).includes('stuck.own_work'), J(s ?? codes(at([...INTEGRATE, u(t)]))));
  }
  // (stuck.unseen is live only: it needs the route to say nothing is on their screen, material === false)
  const alone = get(at([u("I'm stuck")], { material: false }), 'explicit.stuck');
  ok('"I\'m stuck" as a first message, nothing on screen → stuck.unseen, no own_work', alone && refCodes(alone).includes('stuck.unseen') && !refCodes(alone).includes('stuck.own_work') && !refCodes(alone).includes('stuck.shown'), J(alone));
  ok('  its first ref is explicit.stuck at their turn', alone && J(alone.refs[0]) === J({ turn: 0, role: 'user', code: 'explicit.stuck' }), J(alone?.refs));
  const migrate = get(at([u("We need to migrate our 2TB MySQL database to Postgres with zero downtime and I don't know where to start")]), 'explicit.stuck');
  ok('the migration message → stuck.shown, without own_work (Socria\'s task)', migrate && refCodes(migrate).includes('stuck.shown') && !refCodes(migrate).includes('stuck.own_work'), J(migrate));
  for (const t of STUCK_SILENT) {
    const quiet = !has(at([u(t)]), 'explicit.stuck') && !has(at([...INTEGRATE, u(t)]), 'explicit.stuck');
    ok(`"${t}" → no explicit.stuck`, quiet, J([codes(at([u(t)])), codes(at([...INTEGRATE, u(t)]))]));
  }
  const afterAnswer = at([u('what is a derivative'), a(ANSWERED), u("I'm stuck")]);
  ok('after a reply, "I\'m stuck" is not a short reply (weak.short_reply) under 11.1', has(afterAnswer, 'explicit.stuck') && !has(afterAnswer, 'weak.short_reply'), J(codes(afterAnswer)));
  ok('  …while "ok" still gives exactly weak.short_reply', J(codes(at([u('what is a derivative'), a(ANSWERED), u('ok')]))) === J(['weak.short_reply']), J(codes(at([u('what is a derivative'), a(ANSWERED), u('ok')]))));
  ok('under mr-2026.10.1: no explicit.stuck', !has(at10([...INTEGRATE, u("I'm stuck")]), 'explicit.stuck') && !has(at10([u("I'm stuck")]), 'explicit.stuck'));
}

console.log('\n=== R5: still stuck ===');
const stuckRefsOfR5 = (obs) => refCodes(get(obs, 'explicit.stuck'));
const R5 = [u("I'm stuck on the next step"), a(SUGGEST1), u('still stuck')];
{
  const obs = at(R5);
  const s = get(obs, 'explicit.stuck');
  ok('"still stuck" after an earlier stuck → explicit.stuck with stuck.again', s && refCodes(s).includes('stuck.again'), J(obs));
  const rs = get(obs, 'observed.repeated_stuck');
  // (refs are user-turn indices, as in R8 and R9: their "still stuck" is user turn 1, the stuck before it user turn 0)
  ok('  …and observed.repeated_stuck with refs [explicit.stuck at turn 1, stuck.before at turn 0]', rs && J(rs.refs) === J([{ turn: 1, role: 'user', code: 'explicit.stuck' }, { turn: 0, role: 'user', code: 'stuck.before' }]), J(rs));
  ok('  repeated_stuck is observed, moderate 0.8', rs && rs.provenance === 'observed' && rs.strength === 'moderate' && rs.confidence === 0.8, J(rs));
  for (const t of ['nope, still stuck', 'stuck again', 'still stuck on the same step'])
    ok(`"${t}" after an earlier stuck → explicit.stuck`, has(at([u("I'm stuck on the next step"), a(SUGGEST1), u(t)]), 'explicit.stuck'), J(codes(at([u("I'm stuck on the next step"), a(SUGGEST1), u(t)]))));
  // (residual F26: with a task on the table and a reply between, a first "still stuck" is their stuck — not again, and
  // nothing to repeat; with no task on the table it is still nothing)
  const first = at([u('help me integrate 2x e^(x^2)'), a(SUGGEST1), u('still stuck')]);
  ok('"still stuck" with no earlier stuck but their integral on the table → explicit.stuck, not stuck.again, no repeated_stuck', has(first, 'explicit.stuck') && !stuckRefsOfR5(first).includes('stuck.again') && !has(first, 'observed.repeated_stuck'), J(codes(first)));
  const podcast = [u('Can you recommend a history podcast?'), a('Try Fall of Civilizations: long episodes, calm narration.'), u('still stuck')];
  ok('"still stuck" with no earlier stuck and no task on the table → no explicit.stuck', !has(at(podcast), 'explicit.stuck'), J(codes(at(podcast))));
  ok('a single stuck → no repeated_stuck', !has(at([...INTEGRATE, u("I'm stuck")]), 'observed.repeated_stuck'));
  const far = [u("I'm stuck on the next step"), a(SUGGEST1), u('ok thanks'), a(ANSWERED), u('what about the next part'), a(ANSWERED), u('and then?'), a(ANSWERED), u("I'm stuck on the next step")];
  ok('stuck at turn 0 and again at turn 4 → no repeated_stuck', !has(at(far), 'observed.repeated_stuck'), J(codes(at(far))));
  ok('under mr-2026.10.1: neither', !has(at10(R5), 'explicit.stuck') && !has(at10(R5), 'observed.repeated_stuck'));
}

console.log('\n=== R6: a correction ===');
const R6 = [u('How do I free up disk space?'), a(WINDOWS), u('No, I meant on my Mac')];
const CORRECTED_FIRE = ['No, I meant on my Mac', 'no I meant the other one', "that's not what I meant, I meant at my company", 'Sorry, I mean the 2019 version', 'I meant Python, not Java', 'Sorry, I was asking about the API, not the UI', 'you misunderstood my question', 'Not what I asked for', 'actually I meant the tax year'];
const CORRECTED_SILENT = ['I meant to ask earlier, how do I export?', "no, I mean it's fine", 'I mean it', 'I mean, it works but it is slow', 'as I said in my essay, the war ended in 1918', 'What I meant in my essay is unclear', 'I mean that as a compliment', 'No offense meant', 'I was talking about this with my wife yesterday', 'No, the capital is Sydney', 'quiz me — no, I meant just tell me'];
{
  const c = get(at(R6), 'explicit.corrected');
  ok('"No, I meant on my Mac" after a reply → explicit.corrected (strong 0.85)', c && c.provenance === 'explicit' && c.strength === 'strong' && c.confidence === 0.85 && J(c.refs) === J([{ turn: 1, role: 'user', code: 'explicit.corrected' }]), J(at(R6)));
  ok('the same words as a first message → nothing', at([u('No, I meant on my Mac')]).length === 0, J(codes(at([u('No, I meant on my Mac')]))));
  for (const t of CORRECTED_FIRE) ok(`"${t}" after a reply → corrected`, has(at([R6[0], R6[1], u(t)]), 'explicit.corrected'), J(codes(at([R6[0], R6[1], u(t)]))));
  for (const t of CORRECTED_SILENT) ok(`"${t}" after a reply → no corrected`, !has(at([R6[0], R6[1], u(t)]), 'explicit.corrected') && !has(at([u(t)]), 'explicit.corrected'), J(codes(at([R6[0], R6[1], u(t)]))));
  ok('under mr-2026.10.1: no explicit.corrected', !has(at10(R6), 'explicit.corrected'));
}

console.log('\n=== R7: "I know that" ===');
const R7 = [u('Explain recursion.'), a(explanation(200)), u('I know what recursion is, I want to know when to avoid it')];
const KNOWS_FIRE = ['I know what recursion is, I want to know when to avoid it', 'I know that already', "Yes, I'm aware.", 'we covered this', 'skip the basics please', 'I know the basics. How do I tune it?'];
const KNOWS_SILENT = ["I know you're busy", 'I know, right?', 'I know that you said X', "I don't know that", 'I know a guy who does this'];
{
  const kt = get(at(R7), 'explicit.knows_that');
  ok('R7 → explicit.knows_that (strong 0.8)', kt && kt.provenance === 'explicit' && kt.strength === 'strong' && kt.confidence === 0.8, J(at(R7)));
  ok('  refs: their words, and the reply that explained', kt && J(kt.refs) === J([{ turn: 1, role: 'user', code: 'explicit.knows_that' }, { turn: 0, role: 'assistant', code: 'reply.explained' }]), J(kt?.refs));
  for (const t of KNOWS_FIRE) ok(`"${t}" after an explanation → knows_that`, has(at([R7[0], R7[1], u(t)]), 'explicit.knows_that'), J(codes(at([R7[0], R7[1], u(t)]))));
  for (const t of KNOWS_SILENT) ok(`"${t}" after an explanation → no knows_that`, !has(at([R7[0], R7[1], u(t)]), 'explicit.knows_that'), J(codes(at([R7[0], R7[1], u(t)]))));
  for (const t of KNOWS_FIRE) ok(`"${t}" after a reply that only asked → no knows_that`, !has(at([u('Explain recursion.'), a('What do you know already?'), u(t)]), 'explicit.knows_that'));
  ok('under mr-2026.10.1: none', !has(at10(R7), 'explicit.knows_that'));
}

console.log('\n=== R8: a question asked for something already said, and asked again ===');
const R8a = [u('my laptop is slow'), a('Which operating system are you on?'), u('I already told you, Windows 11')];
const R8b = [u('my laptop is slow'), a('Which operating system are you using?'), u('Windows 11'), a('Got it. Which operating system are you using right now?'), u('as I said, Windows')];
const ALREADY_FIRE = ['I already told you, Windows 11', "like I said, it's for my team", 'you already asked me that', "I've already answered that", "As I said, budget doesn't matter", 'I just said that!'];
const ALREADY_SILENT = ['I already tried restarting it', 'I already know Python', 'as I said in my essay, the war ended in 1918', 'I already told you this in the session yesterday', "I don't know, I already said I don't know"];
{
  const rq = get(at(R8a), 'observed.redundant_question');
  ok('R8a → observed.redundant_question (moderate 0.8)', rq && rq.provenance === 'observed' && rq.strength === 'moderate' && rq.confidence === 0.8, J(at(R8a)));
  ok('  refs: the asking reply, and their answer saying it was already said', rq && J(rq.refs) === J([{ turn: 0, role: 'assistant', code: 'reply.asked' }, { turn: 1, role: 'user', code: 'answer.redundant' }]), J(rq?.refs));
  for (const t of ALREADY_FIRE) ok(`"${t}" after an asking reply → redundant_question`, has(at([R8a[0], R8a[1], u(t)]), 'observed.redundant_question'), J(codes(at([R8a[0], R8a[1], u(t)]))));
  for (const t of ALREADY_SILENT) ok(`"${t}" after an asking reply → no redundant_question`, !has(at([R8a[0], R8a[1], u(t)]), 'observed.redundant_question'), J(codes(at([R8a[0], R8a[1], u(t)]))));
  ok('"I already told you, Windows 11" after a reply that asked nothing → none', !has(at([R8a[0], a(WINDOWS), u('I already told you, Windows 11')]), 'observed.redundant_question'));
  const quiz = at([u('quiz me on capitals'), a('What is the capital of Peru?'), u('Lima')]);
  ok('"Lima" while a quiz runs → none', !has(quiz, 'observed.redundant_question'), J(codes(quiz)));

  const b = at(R8b);
  const rpq = get(b, 'observed.repeated_question');
  ok('R8b → observed.repeated_question (moderate 0.75)', rpq && rpq.provenance === 'observed' && rpq.strength === 'moderate' && rpq.confidence === 0.75, J(codes(b)));
  ok('  refs: reply.asked at turn 1, reply.asked_before at turn 0', rpq && J(rpq.refs) === J([{ turn: 1, role: 'assistant', code: 'reply.asked' }, { turn: 0, role: 'assistant', code: 'reply.asked_before' }]), J(rpq?.refs));
  ok('  …plus redundant_question, and no unproductive_questions', has(b, 'observed.redundant_question') && !has(b, 'observed.unproductive_questions'), J(codes(b)));
  const same = at([u('my laptop is slow'), a('Which operating system are you using?'), u('Windows 11'), a('Which operating system are you using?'), u('Windows, as I mentioned')]);
  // (review fix D.10, N12: a short asking reply said again word for word after a different message of theirs is a re-ask, not a re-send)
  ok('identical short asking replies after a different message → repeated_question', has(same, 'observed.repeated_question'), J(codes(same)));
  const resent = at([u('my laptop is slow'), a('Which operating system are you using?'), u('my laptop is slow'), a('Which operating system are you using?'), u('Windows')]);
  ok('  the same message sent again and answered the same way (a re-send) → no repeated_question', !has(resent, 'observed.repeated_question'), J(codes(resent)));
  const reasked = at([u('quiz me on capitals'), a('What is the capital of Peru?'), u('Quito'), a('Not quite. What is the capital of Peru?'), u('Lima')]);
  ok('a quiz question re-asked → no repeated_question', !has(reasked, 'observed.repeated_question'), J(codes(reasked)));
  const sense = at([u('explain derivatives'), a(explanation(60) + ' Does that make sense?'), u('yes'), a(ANSWERED + ' Does that make sense?'), u('ok')]);
  ok('"Does that make sense?" endings → no repeated_question', !has(sense, 'observed.repeated_question'), J(codes(sense)));
  const think = at([u('explain derivatives'), a(explanation(60) + ' What do you think?'), u('not sure'), a(ANSWERED + ' What do you think?'), u('hmm')]);
  ok('"What do you think?" endings → no repeated_question', !has(think, 'observed.repeated_question'), J(codes(think)));
  const sums = at([u('quiz me on times tables'), a('What is 7 × 8?'), u('56'), a('Right. What is 7 × 9?'), u('63')]);
  ok('"What is 7 × 8?" then "What is 7 × 9?" → no repeated_question', !has(sums, 'observed.repeated_question'), J(codes(sums)));
  ok('under mr-2026.10.1: neither', !has(at10(R8a), 'observed.redundant_question') && !has(at10(R8b), 'observed.repeated_question'));
}

console.log('\n=== R9: background said again ===');
const R9 = (middle = 'What about our support tickets?', r1 = S1 + ' ' + S2 + ' Most of the rest is change management.', r2 = S1 + ' ' + S2 + ' For tickets, start by labelling a few hundred past cases.') => [
  u('Why do AI projects fail?'),
  a(r1),
  u(middle),
  a(r2),
  u('how long would that take?'),
];
{
  const rb = get(at(R9()), 'observed.repeated_background');
  ok('R9 → observed.repeated_background (moderate 0.7)', rb && rb.provenance === 'observed' && rb.strength === 'moderate' && rb.confidence === 0.7, J(codes(at(R9()))));
  ok('  refs: reply.repeats at turn 1, reply.repeated at turn 0', rb && J(rb.refs) === J([{ turn: 1, role: 'assistant', code: 'reply.repeats' }, { turn: 0, role: 'assistant', code: 'reply.repeated' }]), J(rb?.refs));
  ok('silent when they asked for it again ("can you summarise that again?")', !has(at(R9('can you summarise that again?')), 'observed.repeated_background'), J(codes(at(R9('can you summarise that again?')))));
  ok('silent under a "detailed" setting', !has(at(R9(), { length: 'detailed' }), 'observed.repeated_background'));
  ok('silent with explanation(200) as both replies (one sentence, said again)', !has(at(R9(undefined, explanation(200), explanation(200))), 'observed.repeated_background'));
  const same = S1 + ' ' + S2 + ' Most of the rest is change management.';
  ok('silent with identical replies', !has(at(R9(undefined, same, same)), 'observed.repeated_background'));
  ok('silent with one sentence repeated', !has(at(R9(undefined, S1 + ' Most of the rest is change management.', S1 + ' For tickets, start by labelling a few hundred past cases.')), 'observed.repeated_background'));
  ok('under mr-2026.10.1: none', !has(at10(R9()), 'observed.repeated_background'));
}

console.log('\n=== R10: their re-ask after a long reply ===');
const R10 = [u('How do I make my resume stand out?'), a(LONG300), u('ok but so what should I do?')];
{
  ok('LONG300 is at least 240 words', M.wordCount(LONG300) >= 240, M.wordCount(LONG300));
  const la = get(at(R10), 'observed.late_answer');
  ok('R10 → observed.late_answer (moderate 0.65)', la && la.provenance === 'observed' && la.strength === 'moderate' && la.confidence === 0.65, J(codes(at(R10))));
  ok('  refs: the long reply, and their re-ask', la && J(la.refs) === J([{ turn: 0, role: 'assistant', code: 'reply.long' }, { turn: 1, role: 'user', code: 'request.reask' }]), J(la?.refs));
  for (const t of ["You didn't answer my question.", "So what's the bottom line?", 'which one?'])
    ok(`"${t}" after a 300-word reply → late_answer`, has(at([R10[0], R10[1], u(t)]), 'observed.late_answer'), J(codes(at([R10[0], R10[1], u(t)]))));
  ok('the same words after a 120-word reply → silent', !has(at([R10[0], a(explanation(120)), R10[2]]), 'observed.late_answer'));
  for (const t of ['About 50k. What should I do first?', 'how do I fix my bike chain?', "that doesn't answer it, I need one for video editing"])
    ok(`"${t}" after a 300-word reply → silent`, !has(at([R10[0], R10[1], u(t)]), 'observed.late_answer'), J(codes(at([R10[0], R10[1], u(t)]))));
  ok('under mr-2026.10.1: none', !has(at10(R10), 'observed.late_answer'));
}

console.log('\n=== R11: fixes that did not work ===');
const R11 = (last = 'same error again') => [u('My laptop wifi keeps dropping.'), a(SUGGEST1), u("still doesn't work"), a(SUGGEST2), u(last)];
{
  const ff = get(at(R11()), 'observed.fix_failed');
  ok('R11 → observed.fix_failed (moderate 0.7) with 4 refs', ff && ff.provenance === 'observed' && ff.strength === 'moderate' && ff.confidence === 0.7 && ff.refs.length === 4, J(codes(at(R11()))));
  ok(
    '  refs: suggestion, still failing, suggestion, still failing',
    ff && J(ff.refs) === J([{ turn: 0, role: 'assistant', code: 'reply.suggested' }, { turn: 1, role: 'user', code: 'report.still_failing' }, { turn: 1, role: 'assistant', code: 'reply.suggested' }, { turn: 2, role: 'user', code: 'report.still_failing' }]),
    J(ff?.refs)
  );
  ok('a single report → none', !has(at([u('My laptop wifi keeps dropping.'), a(SUGGEST1), u("still doesn't work")]), 'observed.fix_failed'));
  ok('"I followed the steps and it still did not work" once → none', !has(at([u('My laptop wifi keeps dropping.'), a(SUGGEST1), u('I followed the steps and it still did not work')]), 'observed.fix_failed'));
  for (const t of ["I still don't get it", 'Every time I run the script it crashes', 'it works now', "that still doesn't make sense to me"])
    ok(`"${t}" as the second report → none`, !has(at(R11(t)), 'observed.fix_failed'), J(codes(at(R11(t)))));
  ok('under mr-2026.10.1: none', !has(at10(R11()), 'observed.fix_failed'));
}

console.log('\n=== R12: a short answer to a single question advances ===');
{
  const plan = [u('help me plan my week'), a('What are your fixed commitments?'), u('work'), a('Which day is busiest?'), u('monday')];
  ok('"work", "monday" after two single questions → no unproductive_questions under 11.1', !has(at(plan), 'observed.unproductive_questions'), J(codes(at(plan))));
  ok('  …and unproductive_questions under mr-2026.10.1', has(at10(plan), 'observed.unproductive_questions'), J(codes(at10(plan))));
  const oks = at([u('help me plan my week'), a('What are your fixed commitments?'), u('ok'), a('Which day is the busiest one?'), u('sure')]);
  ok('"ok", "sure" still give unproductive_questions under 11.1', has(oks, 'observed.unproductive_questions'), J(codes(oks)));
  const chrome = at([u('my browser is slow'), a('Which browser are you using?'), u('chrome'), a('Which version is it?'), u('the latest')]);
  ok('"chrome" after a single wh-question advances', !has(chrome, 'observed.unproductive_questions'), J(codes(chrome)));
}

const R_TRANSCRIPTS = [
  [u(Q)],
  [u('how do I convert 5 miles to km'), a('Multiply by 1.609: about 8 km.'), u(Q)],
  [u(Q), a(GOOD), u('Why are companies not using it for problems then?')],
  [...INTEGRATE, u("I'm stuck on the next step")],
  R5,
  R6,
  R7,
  R8a,
  R8b,
  R9(),
  R10,
  R11(),
  [u('help me plan my week'), a('What are your fixed commitments?'), u('work'), a('Which day is busiest?'), u('monday')],
];

console.log('\n=== R13: the invariants every observation keeps ===');
{
  const PROV = new Set(['observed', 'explicit', 'estimate', 'hypothesis']);
  const STR = new Set(['strong', 'moderate', 'weak']);
  const all = [];
  for (const msgs of R_TRANSCRIPTS) {
    const turns = M.turnsOf(msgs);
    turns.forEach((_, k) => all.push(...M.observeTurn(turns, k, { params, work: 'information', length: 'standard', ...(k === turns.length - 1 ? { material: false } : {}) })));
  }
  ok('the corpus reads every one of the 11 new codes', ['explicit.stuck', 'explicit.corrected', 'explicit.knows_that', 'observed.open_request', 'observed.redundant_question', 'observed.repeated_question', 'observed.repeated_background', 'observed.repeated_stuck', 'observed.late_answer', 'observed.fix_failed', 'observed.new_topic'].every((c) => has(all, c)), J([...new Set(codes(all))]));
  ok('every code is an OBSERVATION_CODE; provenance and strength are valid; 0 ≤ confidence ≤ 1', all.every((o) => M.OBSERVATION_CODES.includes(o.code) && PROV.has(o.provenance) && STR.has(o.strength) && o.confidence >= 0 && o.confidence <= 1));
  ok('weak.* is always a weak hypothesis at ≤ 0.3', all.filter((o) => o.code.startsWith('weak.')).every((o) => o.provenance === 'hypothesis' && o.strength === 'weak' && o.confidence <= 0.3));
  ok('nothing else is a hypothesis; explicit.* is always explicit; observed.* never explicit', all.every((o) => (o.code.startsWith('weak.') ? true : o.provenance !== 'hypothesis') && (!o.code.startsWith('explicit.') || o.provenance === 'explicit') && (!o.code.startsWith('observed.') || o.provenance === 'observed')));
  ok('every observation has at least one ref', all.every((o) => o.refs.length > 0));
  const refs = all.flatMap((o) => o.refs);
  ok('refs are content-free: {turn, role, code} only, codes are code-shaped', refs.every((r) => J(Object.keys(r).sort()) === J(['code', 'role', 'turn']) && Number.isInteger(r.turn) && /^[a-z_]+(?:\.[a-z_]+)+$/.test(r.code)), J(refs.find((r) => !/^[a-z_]+(?:\.[a-z_]+)+$/.test(r.code))));
  // ("stuck" is a code word itself: explicit.stuck)
  const words = ['laptop', 'windows', 'resume', 'recursion', 'wifi', 'monday', 'mac', 'tickets', 'miles'];
  ok('no word of the transcripts appears in any observation', !words.some((w) => J(all).toLowerCase().includes(w)), words.find((w) => J(all).toLowerCase().includes(w)));
  const sorted = (obs) => obs.every((o, i) => i === 0 || M.OBSERVATION_CODES.indexOf(obs[i - 1].code) < M.OBSERVATION_CODES.indexOf(o.code));
  ok('each turn\'s observations are in OBSERVATION_CODES order, each code at most once', R_TRANSCRIPTS.every((msgs) => { const t = M.turnsOf(msgs); return t.every((_, k) => sorted(M.observeTurn(t, k, { params }))); }));
  ok('the same input gives the same output', R_TRANSCRIPTS.every((msgs) => J(at(msgs)) === J(at(msgs))));
  ok('OBSERVATION_CODES: 45, the 11 new ones in place', M.OBSERVATION_CODES.length === 45 && M.OBSERVATION_CODES.indexOf('explicit.stuck') === M.OBSERVATION_CODES.indexOf('explicit.confused') + 1 && M.OBSERVATION_CODES.indexOf('observed.new_topic') === M.OBSERVATION_CODES.indexOf('observed.practice') + 1, M.OBSERVATION_CODES.length);

  const big = [];
  for (let i = 0; i < 24; i++) big.push(u(('please explain the next part of the proof and why it holds ' + i + ' ').repeat(90)), a(explanation(400) + ' What do you think comes next?'));
  big.push(u('x'.repeat(6000)));
  const t0 = Date.now();
  const bt = M.turnsOf(big);
  bt.forEach((_, k) => M.observeTurn(bt, k, { params }));
  const ms = Date.now() - t0;
  ok(`25 long turns (6000-character messages) observed in ${ms} ms (< 1500)`, ms < 1500, ms);
}

// ── the fast loop ────────────────────────────────────────────────────
const NEW_RULES = [
  'ifr.explicit.corrected',
  'mr.explicit.knows_that',
  'ifr.observed.redundant_question',
  'mr.observed.repeated_stuck',
  'ifr.observed.late_answer',
  'ifr.observed.repeated_background',
  'mr.explicit.stuck',
  'mr.observed.fix_failed',
  'ifr.explicit.stuck',
  'ifr.observed.open_request',
];
const NEW_CODES = ['explicit.stuck', 'explicit.corrected', 'explicit.knows_that', 'observed.repeated_stuck', 'observed.redundant_question', 'observed.repeated_question', 'observed.late_answer', 'observed.repeated_background', 'observed.open_request', 'observed.fix_failed', 'observed.new_topic'];
const freshNew = (r) => r.fresh.filter((d) => NEW_RULES.includes(d.trigger));
const DIAGNOSE_ASK = 'ONE THING THEY HAVE NOT SAID DECIDES THE ANSWER. Lead with';
const DIAGNOSE_STATE = 'ONE THING THEY HAVE NOT SAID DECIDES THE ANSWER, AND THIS TURN ASKS NOTHING.';
const STUCK_ASK = 'THEY ARE STUCK AND THE WORK IS NOT IN THE CONVERSATION. In a sentence or two';
const STUCK_STATE = 'THEY ARE STUCK AND THE WORK IS NOT IN THE CONVERSATION, AND THIS TURN ASKS NOTHING.';
const SHORT_ASKED = 'SHORT: a few sentences. They asked for less.';
const SHORT_OBSERVED = 'SHORT: a few sentences. The point first; nothing this conversation has already said, and no background they did not ask for.';
const SUBSTITUTION = [U('I want to learn substitution: integrate 2x e^(x^2) dx'), A(APPROACH), U("I set u = x^2 but now I'm stuck on the next step")];
const MIGRATE = "We need to migrate our 2TB MySQL database to Postgres with zero downtime and I don't know where to start";
const INFORM = { mode: 'inform', forced: true, questions: 0, scaffold: 'none', selfExplain: false, retrieval: false, reasons: ['fact'] };
const CARRIED_SHORTER = { key: 'verbosity:shorter', value: 'shorter', provenance: 'explicit', turn: 0, refs: [], confidence: 0.9, expiresAfterTurn: null };
const NOT_IN_CONTROL = (r) => !/ONE THING|THEY ARE STUCK|CHECK BEFORE/.test(r.block);
const pref0 = (r) => r.state.preferences.some((p) => p.key === 'questions:0');

const acsQ = chooseAssist({ lastUserText: Q, history: [], guard: false, signals: readSignals(Q) });
const D1 = run([U(Q)]);

console.log('\n=== D1: the networking case ===');
{
  const r = D1;
  ok('ACS reads it as explain, one question', acsQ.mode === 'explain' && acsQ.questions === 1, J(acsQ));
  ok('a diagnose, from the open-request reading', r.decision.trigger === 'ifr.observed.open_request' && r.decision.action === 'diagnose', `${r.decision.action} ${r.decision.trigger}`);
  ok('  controls: diagnose, one question at the tail, a 360-token ceiling', J(r.decision.controls) === J({ strategy: 'diagnose', questionBudget: { max: 1, enforcement: 'tail' }, verbosity: { ceilingTokens: 360 } }), J(r.decision.controls));
  ok('  ACS\'s move and budget stand: explain, one question', r.assist.questions === 1 && r.assist.mode === 'explain', J(r.assist));
  ok('  ceiling 360; check-ins are not dropped (the diagnostic may be offer-shaped)', r.ceiling === 360 && r.gate.dropCheckIns === false, J({ c: r.ceiling, g: r.gate }));
  ok('  the block: the point first, then the single question, short for a stated reason', r.block.includes('ONE THING THEY HAVE NOT SAID DECIDES THE ANSWER') && r.block.includes('Then ask the single question') && r.block.includes('SHORT: a few sentences. The point first'), r.block);
  ok('  …and never "they asked for less" or "lead with what they asked for"', !r.block.includes('They asked for less') && !r.block.includes('Lead with what they asked for'), r.block);
  ok('  traced: a=diagnose, t=open_request, c=q1t,s:diagnose,v360, no check-in drop', /;a=diagnose;/.test(r.trace) && /;t=ifr\.observed\.open_request;/.test(r.trace) && /c=q1t,s:diagnose,v360/.test(r.trace) && !/g=[a-z]*k/.test(r.trace), r.trace);
  ok('  turn-scoped, expiring after turn 0', J(r.decision.scope) === J({ kind: 'turn' }) && r.decision.expiration.afterTurn === 0, J(r.decision.scope));
  ok('  uncertainty: inferred from the transcript, the goal reading inferred', r.decision.uncertainty.includes('inferred_from_transcript') && r.decision.uncertainty.includes('goal_reading_inferred'), J(r.decision.uncertainty));
  ok('  its contract holds', J(MR.checkDecision(r.decision, { knownPolicies: Object.keys(MR.STRATEGIES), ruleControls: MR.RULE_CONTROLS, turn: 0 })) === '[]', J(MR.checkDecision(r.decision, { knownPolicies: Object.keys(MR.STRATEGIES), ruleControls: MR.RULE_CONTROLS, turn: 0 })));
}

console.log('\n=== D2: paraphrases ===');
for (const t of OPEN_FIRE) {
  const acs = acsOf([U(t)]);
  const r = run([U(t)], { assist: acs });
  ok(`"${t}" → a=diagnose, never more questions than ACS allowed`, r.decision.action === 'diagnose' && r.assist.questions <= acs.questions, `${r.decision.action} q=${r.assist.questions}/${acs.questions} ${acs.mode}`);
}

console.log('\n=== D3: never widened ===');
{
  const r = run([U(Q)], { assist: { ...acsQ, questions: 0 } });
  ok('ACS allows no question: none is added', r.assist.questions === 0, r.assist.questions);
  ok('  the line states the reading instead of asking', r.block.includes('AND THIS TURN ASKS NOTHING') && r.block.includes('naming that reading') && !r.block.includes('Then ask the single question'), r.block);
}

console.log('\n=== D4: their stop stands ===');
{
  const r = run([U('stop asking me questions'), A('Understood.'), U(Q)]);
  ok('a hard no-questions gate, traced q0h', r.gate.hardNoQuestions === true && /q0h/.test(r.trace), r.trace);
  ok('  the diagnose line in its no-question form, beside their stop', r.block.includes(DIAGNOSE_STATE) && r.block.includes('THEY ASKED NOT TO BE ASKED QUESTIONS'), r.block);
  ok('  no goal_drift', ![...r.integrity, ...r.state.integrity].some((f) => f.code === 'goal_drift'), J(r.integrity));
  ok('  their stop is still active', rec(r, 'ifr.explicit.stop_questions')?.status === 'active', J(rec(r, 'ifr.explicit.stop_questions')?.status));
}

console.log('\n=== D5: ACS\'s move decides what can carry a diagnose ===');
{
  const r = run([U(Q)], { assist: INFORM });
  const by = r.decision.constrainedBy ?? [];
  ok('an inform move: strategy, question and ceiling taken out by the ACS layer', ['acs:strategy', 'acs:questionBudget', 'acs:verbosity'].every((x) => by.includes(x)), J(by));
  ok('  nothing enforced, no block', r.enforced === false && r.block === '', J({ e: r.enforced, b: r.block }));
  const t = run([U(Q)], { assist: { ...acsQ, target: 'card' } });
  ok('a move about something they pointed at (assist.target): acs:strategy', (t.decision.constrainedBy ?? []).includes('acs:strategy'), J(t.decision.constrainedBy));
  // (residual F24: a missing referent stays on a fact given or a check — "Translate this", "Can you check this?" with
  // nothing there: its line says what is needed, as a statement when ACS put no question; this assertion said the
  // diagnose goes before the fix)
  const m = run([U('How do I fix this?')], { material: false, assist: INFORM, carried: [CARRIED_SHORTER] });
  const mb = m.decision.constrainedBy ?? [];
  ok('a missing-referent decision on an inform move under a carried "shorter": the diagnose stays (no question: ACS put none), their ceiling stays', !mb.includes('acs:strategy') && m.decision.controls.strategy === 'diagnose' && m.assist.questions === 0 && /WHAT THEY POINT AT IS NOT IN THE CONVERSATION[^\n]*as a statement, not a question/.test(m.block) && m.decision.controls.verbosity?.ceilingTokens === 360 && m.ceiling === 360, J({ mb, c: m.decision.controls, ceiling: m.ceiling, b: m.block }));
  const mt = run([U('How do I fix this?')], { material: false, assist: { ...acsQ, target: 'card' } });
  ok('  …but not on a move about something they pointed at (assist.target): acs:strategy', (mt.decision.constrainedBy ?? []).includes('acs:strategy'), J(mt.decision.constrainedBy));
}

console.log('\n=== D6: asked directly ===');
{
  const r = run([U('Why is AI not solving problems? Just give me the short answer.')]);
  // Deviation from the spec's literal "a=direct": with direct_answer and shorter both said this turn, compose takes the
  // action of the newest rule in RULES order (shorter), as it always has (10.1 does the same). What matters is that the
  // answer is given directly and no diagnose is made.
  ok('"…Just give me the short answer." → the direct strategy, no diagnose', r.decision.controls.strategy === 'direct' && /;a=(?:direct|shorter);/.test(r.trace) && /s:direct/.test(r.trace) && !/s:diagnose/.test(r.trace) && !freshNew(r).length, r.trace);
  const s = run([U('Why is AI not solving problems? Keep it short.')]);
  ok('"…Keep it short." → a=shorter, and "They asked for less."', s.decision.action === 'shorter' && s.block.includes(SHORT_ASKED) && !/s:diagnose/.test(s.trace), `${s.trace} ${s.block}`);
  const w = run([U('Solve 2x + 3 = 11.'), A('Hint: start by taking 3 away from both sides.'), U('just give me the full worked solution')]);
  ok('"just give me the full worked solution" → a=direct, q0, "Give it now and first"', w.decision.action === 'direct' && w.assist.questions === 0 && w.block.includes('Give it now and first'), `${w.trace} ${w.block}`);
  ok('  …and no diagnose, stuck or check line', NOT_IN_CONTROL(w), w.block);
}

console.log('\n=== D6b: precedence backstops in constrain() ===');
{
  // A diagnose or a next step never stands beside their request for the answer or the steps, and a ceiling MR set
  // itself never stands against their "detailed" setting or that request; their own "shorter" does.
  const base = (controls, trigger) => ({ ...D1.decision, trigger, controls });
  const ci = (decision, said, o = {}) => M.constrain({ decision, acs: acsQ, core: null, signals: readSignals('just tell me'), said: new Set(said), guard: false, math: false, length: o.length ?? null, maxReply: 700, recentAsking: [], ...(o.pin ? {} : { triggers: [decision.trigger], evidence: [] }) });
  for (const strategy of ['diagnose', 'next_step']) {
    for (const code of ['explicit.direct_answer', 'explicit.show_steps']) {
      const c = ci(base({ strategy }, 'ifr.observed.open_request'), [code]);
      ok(`${strategy} with ${code} said this turn → user_instruction:strategy`, c.constrainedBy.includes('user_instruction:strategy') && !c.controls.strategy, J(c));
    }
  }
  const cap = base({ verbosity: { ceilingTokens: 360 } }, 'ifr.observed.late_answer');
  ok('MR\'s own ceiling under a "detailed" setting → user_instruction:verbosity', ci(cap, [], { length: 'detailed' }).constrainedBy.includes('user_instruction:verbosity'));
  ok('  …and under "just tell me" this turn', ci(cap, ['explicit.direct_answer']).constrainedBy.includes('user_instruction:verbosity'));
  ok('  their own "shorter" (carried) stays under "detailed"', !ci(base({ verbosity: { ceilingTokens: 360 } }, 'ifr.explicit.shorter'), [], { length: 'detailed' }).constrainedBy.includes('user_instruction:verbosity'));
  ok('  …and so does a ceiling with "shorter" said this turn', !ci(cap, ['explicit.direct_answer', 'explicit.shorter']).constrainedBy.includes('user_instruction:verbosity'));
  ok('  without the precision context (a 10.1 decision) nothing is taken', !ci(cap, [], { length: 'detailed', pin: true }).constrainedBy.length, J(ci(cap, [], { length: 'detailed', pin: true })));
}

console.log('\n=== D7: clear questions — MR does nothing ===');
const CLEAR = ['Why is the sky blue?', 'What is the capital of Australia?', 'How do I reverse a linked list in Java?', 'Explain photosynthesis', 'Why is Python slow?', 'What are the main causes of inflation?', 'Why did the Roman empire fall?', "Why don't people vote?", 'Why do startups fail?', 'Is AI used in hospitals?', 'Convert 5 miles to km'];
for (const t of CLEAR) {
  for (const material of [undefined, false]) {
    const acs = acsOf([U(t)]);
    const r = run([U(t)], { assist: acs, material });
    ok(`"${t}"${material === false ? ' (nothing on screen)' : ''} → none: no trigger, no block, no ceiling, ACS's move untouched`, r.decision.action === 'none' && r.decision.trigger === 'none' && r.block === '' && r.ceiling === null && r.assist === acs, `${r.decision.action} ${r.decision.trigger} ${r.trace}`);
  }
}

console.log('\n=== D8: the arms, and the pin ===');
{
  const sh = run([U(Q)], { assist: acsQ, condition: { ...FULL, shadow: true } });
  ok('shadow: decided, not enforced — no block, ACS\'s move untouched', sh.enforced === false && sh.block === '' && sh.assist === acsQ && /;enf=0;/.test(sh.trace) && /;a=diagnose;/.test(sh.trace), sh.trace);
  const bl = run([U(Q)], { condition: { arm: 'baseline', ifr: true, shadow: false, source: 'deployment' } });
  ok('baseline: no block', bl.block === '' && bl.ceiling === null, bl.trace);
  const off = run([U(Q)], { condition: { ...FULL, ifr: false } });
  const offRec = rec(off, 'ifr.observed.open_request');
  ok('IFR off: the decision is recorded as not enforced, with no block', offRec && offRec.decision.uncertainty.includes('not_enforced') && off.block === '' && off.enforced === false && off.ceiling === null, J({ u: offRec?.decision.uncertainty, b: off.block, t: off.trace }));
  const pin = run([U(Q)], { env: { LOGOS_MR_POLICY: PV10 } });
  ok('pinned to mr-2026.10.1: a=none, and the trace says so', /;a=none;/.test(pin.trace) && /pv=mr-2026\.10\.1/.test(pin.trace) && pin.block === '' && pin.ceiling === null, pin.trace);
  ok('  …and none of the new codes is observed', !pin.state.observations.some((o) => NEW_CODES.includes(o.code)), J(pin.state.observations.map((o) => o.code)));
  const det = run([U(Q)], { length: 'detailed' });
  ok('a "detailed" setting: none', det.decision.action === 'none' && det.block === '', det.trace);
}

console.log('\n=== D9: what they point at is not in the conversation ===');
{
  const r = run([U('How do I fix this?')], { material: false });
  ok('first message, nothing on screen → a=diagnose, c=q1t,s:diagnose, no ceiling', r.decision.action === 'diagnose' && /c=q1t,s:diagnose(?:;|$)/.test(r.trace) && r.ceiling === null, r.trace);
  ok('  the missing-referent line, asking for the one thing it needs to see', r.block.includes('WHAT THEY POINT AT IS NOT IN THE CONVERSATION') && r.block.includes('ask for the one thing you need to see'), r.block);
  const shown = run([U('How do I fix this?')], { material: true });
  ok('with something on screen → none', shown.decision.action === 'none' && shown.block === '', shown.trace);
  const q0 = run([U('How do I fix this?')], { material: false, assist: { ...acsOf([U('How do I fix this?')]), questions: 0 } });
  ok('with no question to spend → the statement form', q0.block.includes('WHAT THEY POINT AT IS NOT IN THE CONVERSATION') && q0.block.includes('as a statement, not a question') && !q0.block.includes('ask for the one thing you need to see'), q0.block);
}

console.log('\n=== D10: stuck, with their work on the table ===');
{
  const r = run(SUBSTITUTION);
  ok('a next step, from their "I\'m stuck"', r.decision.trigger === 'mr.explicit.stuck' && r.decision.action === 'next_step', `${r.decision.action} ${r.decision.trigger}`);
  ok('  controls: next_step, no question', J(r.decision.controls) === J({ strategy: 'next_step', questionBudget: { max: 0, enforcement: 'tail' } }), J(r.decision.controls));
  ok('  the move: a hint (or the steps), no question, check-ins dropped', ['hint', 'steps'].includes(r.assist.scaffold) && r.assist.questions === 0 && r.gate.dropCheckIns === true, J({ a: r.assist, g: r.gate }));
  ok('  the line: one concrete step, and how they can tell it worked', r.block.includes('THEY ARE STUCK WITH WORK ON THE TABLE') && r.block.includes('how they can tell it worked'), r.block);
  ok('  not filed as a preference for no questions', !pref0(r), J(r.state.preferences));
  const g = run(SUBSTITUTION, { guard: true, math: true });
  ok('under the Answer Guard: the step as a hint, the answer kept theirs', g.block.includes('the answer itself stays theirs') && (g.decision.constrainedBy ?? []).includes('app_policy:guard:strategy.keeps_answer'), `${J(g.decision.constrainedBy)} ${g.block}`);
  const trace = '```\nTraceback (most recent call last):\n  File "app.py", line 12, in <module>\n    main()\n  File "app.py", line 8, in main\n    total = sum(values) / len(values)\n  File "stats.py", line 3, in mean\n    return total / count\nZeroDivisionError: division by zero when the input list is empty\n```\n';
  const p = run([U(trace + "I'm stuck, it still crashes")]);
  ok('a pasted stack trace with "I\'m stuck, it still crashes" → next_step (what they pasted is their work)', p.decision.action === 'next_step' && p.decision.trigger === 'mr.explicit.stuck', `${p.decision.action} ${p.decision.trigger} ${J(nowCodes(p))}`);
}

console.log('\n=== D11: stuck, with nothing visible ===');
{
  const acs = acsOf([U("I'm stuck")]);
  const r = run([U("I'm stuck")], { assist: acs, material: false });
  ok('"I\'m stuck" → one locating question, within ACS\'s budget', r.decision.trigger === 'ifr.explicit.stuck' && r.decision.action === 'diagnose' && r.assist.questions === acs.questions && acs.questions === 1, `${r.trace} acs=${J(acs)}`);
  // (with nothing before it the line asks what they are working on, not for a generic pointer: stuck.first, review fix D.5)
  ok('  the stuck line, asking one plain question; no ceiling', r.block.includes('THEY ARE STUCK AND THE WORK IS NOT IN THE CONVERSATION.') && r.block.includes('plain question') && r.ceiling === null, r.block);
  const acs2 = acsOf([U("I don't know where to start")]);
  const s = run([U("I don't know where to start")], { assist: acs2, material: false });
  ok('"I don\'t know where to start" (ACS explain, no question) → the statement form, no question', acs2.questions === 0 && s.block.includes(STUCK_STATE) && s.assist.questions === 0, `${J(acs2)} ${s.block}`);
  const m = run([U(MIGRATE)]);
  ok('the migration message → none (Socria\'s task: ACS\'s help stands)', m.decision.action === 'none', m.trace);
}

console.log('\n=== D12: stuck, and what comes before it ===');
{
  const r = run([U("I'm stuck, just give me the answer")]);
  ok('"I\'m stuck, just give me the answer" → direct, and no stuck decision', r.decision.controls.strategy === 'direct' && /;a=direct;/.test(r.trace) && !r.fresh.some((d) => /\.explicit\.stuck$/.test(d.trigger)), r.trace);
  const q = run([U('quiz me on capitals'), A('What is the capital of Peru?'), U("I'm stuck")]);
  // (the spec's "Keep it a quiz" is not a line MR has ever rendered; the quiz line is "THEY ASKED TO BE QUIZZED OR TO
  // PRACTISE. Keep the challenge theirs…", and changing it would break the 10.1 pin)
  ok('"I\'m stuck" in a quiz → no stuck decision; the quiz stands', !q.fresh.some((d) => /\.explicit\.stuck$/.test(d.trigger)) && rec(q, 'mr.explicit.quiz')?.status === 'active' && q.block.includes('THEY ASKED TO BE QUIZZED') && q.block.includes('Keep the challenge theirs'), `${q.trace} ${q.block}`);
  const s = run(R5);
  ok('still stuck → one worked example', s.decision.trigger === 'mr.observed.repeated_stuck' && /s:worked_example/.test(s.trace) && s.block.includes('one fully worked example'), `${s.trace} ${s.block}`);
  const g = run(R5, { guard: true, math: true });
  ok('  under the Answer Guard: of an analogous problem', g.block.includes('ANALOGOUS problem'), g.block);
}

console.log('\n=== D13: a correction ===');
{
  const r = run(R6);
  ok('the answer first, no question', r.decision.trigger === 'ifr.explicit.corrected' && J(r.decision.controls) === J({ answerFirst: true, questionBudget: { max: 0, enforcement: 'tail' } }) && J(r.decision.scope) === J({ kind: 'turn' }), `${r.trace} ${J(r.decision.controls)}`);
  ok('  the line', r.block.includes('THEY CORRECTED YOUR READING OF THE QUESTION. Lead with what they asked for'), r.block);
  ok('  not read as unproductive questions, a repeated request or frustration', !['observed.unproductive_questions', 'observed.repeated_request', 'explicit.frustration'].some((c) => nowCodes(r).includes(c)), J(nowCodes(r)));
  ok('  not filed as a preference for no questions', !pref0(r), J(r.state.preferences));
  const s = run([U('stop asking me questions'), A('Understood.'), ...R6]);
  ok('their earlier stop stays active and hard', rec(s, 'ifr.explicit.stop_questions')?.status === 'active' && s.gate.hardNoQuestions === true, s.trace);
  const g = run(R6, { guard: true });
  ok('under the Answer Guard (answerFirst taken): the kept form of the line', (g.decision.constrainedBy ?? []).includes('app_policy:guard:answerFirst') && g.block.includes('THEY CORRECTED YOUR READING OF THE QUESTION. Work from the question as they now put it'), `${J(g.decision.constrainedBy)} ${g.block}`);
}

console.log('\n=== D14: "I know that" ===');
{
  const r = run(R7);
  ok('less scaffolding, from their words; no ceiling', r.decision.trigger === 'mr.explicit.knows_that' && J(r.decision.controls) === J({ scaffolding: 'less' }) && r.block.includes('THEY KNOW THE BACKGROUND') && r.ceiling === null, `${r.trace} ${r.block}`);
  ok('  not a preference', !r.state.preferences.some((p) => p.turn === r.state.turn), J(r.state.preferences));
  const n = run([...R7, A(explanation(100)), U("I don't get it")]);
  const k = rec(n, 'mr.explicit.knows_that');
  ok('"I don\'t get it" next: it has ended (revoked by their confusion, or expired)', k && ((k.status === 'revoked' && k.endReason === 'revoke:explicit.confused') || k.status === 'expired'), J(k && { s: k.status, e: k.endReason }));
}

console.log('\n=== D15: questions asked for what was said, and asked again ===');
{
  const r = run(R8a);
  ok('R8a → fewer questions, the answer first', r.decision.trigger === 'ifr.observed.redundant_question' && /c=q0t,qw1\/3,first/.test(r.trace) && r.block.includes('THE QUESTIONS HAVE NOT BEEN HELPING'), `${r.trace} ${r.block}`);
  const n = run([...R8a, A('Then open Task Manager and look at what is using the processor.'), U('you can ask me questions again')]);
  const k = rec(n, 'ifr.observed.redundant_question');
  ok('"you can ask me questions again" revokes it', k && k.status === 'revoked' && k.endReason.startsWith('revoke:'), J(k && { s: k.status, e: k.endReason }));
  const idk = run([U('how do I find the derivative of x^3?'), A('Good question. What do you remember about the power rule?'), U('idk'), A('No problem. What happens to the exponent when you differentiate a power of x?'), U('idk')]);
  ok('the two-"idk" streak still gives unproductive_questions as the trigger', idk.decision.trigger === 'ifr.observed.unproductive_questions', idk.trace);
  const tell = run([U('how do I find the derivative of x^3?'), A('Good question. What do you remember about the power rule?'), U('idk'), A('No problem. What happens to the exponent when you differentiate a power of x?'), U('just tell me')]);
  ok('  …and so does mr-ifr\'s "idk", "just tell me" streak', tell.decision.trigger === 'ifr.observed.unproductive_questions' && !freshNew(tell).length, tell.trace);
}

console.log('\n=== D16: their re-ask after a long reply ===');
{
  const r = run(R10);
  ok('the point first, short for a stated reason, ceiling 360', r.decision.trigger === 'ifr.observed.late_answer' && r.block.includes('THEY ASKED AGAIN FOR THE POINT') && r.block.includes(SHORT_OBSERVED) && r.ceiling === 360, `${r.trace} ${r.block}`);
  const d = run(R10, { length: 'detailed' });
  ok('a "detailed" setting takes MR\'s ceiling out; the answer still comes first', (d.decision.constrainedBy ?? []).includes('user_instruction:verbosity') && d.ceiling === null && d.decision.controls.answerFirst === true, `${J(d.decision.constrainedBy)} ${d.trace}`);
}

console.log('\n=== D17: fixes that did not work ===');
{
  const r = run(R11());
  ok('a check before another fix', r.decision.trigger === 'mr.observed.fix_failed' && /;a=check_first;/.test(r.trace) && J(r.decision.controls) === J({ verification: 'suggest' }), `${r.trace} ${J(r.decision.controls)}`);
  ok('  the line, traced c=check, and never "verify out loud"', r.block.includes('CHECK BEFORE ANOTHER FIX') && /c=check/.test(r.trace) && !r.block.includes('VERIFY OUT LOUD'), `${r.trace} ${r.block}`);
}

console.log('\n=== D18: the SHORT line says what the ceiling rests on ===');
{
  const long = explanation(300);
  const verbose = [U('what is entropy'), A(long), U('and enthalpy?'), A(long), U('and free energy'), A(long), U('ok so which one matters here')];
  const r = run(verbose);
  ok('three long replies (verbose_replies) → SHORT_OBSERVED under 11.1', nowCodes(r).includes('observed.verbose_replies') && r.block.includes(SHORT_OBSERVED) && !r.block.includes('They asked for less'), `${J(nowCodes(r))} ${r.block}`);
  const p = run(verbose, { env: { LOGOS_MR_POLICY: PV10 } });
  ok('  …and "They asked for less." under 10.1, as before', p.block.includes(SHORT_ASKED), p.block);
  const tl = [U('explain limits'), A(explanation(200)), U('too long')];
  ok('"too long" → "They asked for less." under both', run(tl).block.includes(SHORT_ASKED) && run(tl, { env: { LOGOS_MR_POLICY: PV10 } }).block.includes(SHORT_ASKED), run(tl).block);
  const full = [...verbose, A(long), U('just give me the full worked solution')];
  const f = run(full);
  ok('their verbose_replies ceiling, then "just give me the full worked solution": no ceiling under 11.1', (f.decision.constrainedBy ?? []).includes('user_instruction:verbosity') && f.ceiling === null, `${J(f.decision.constrainedBy)} ${f.trace}`);
  ok('  …and the old ceiling of 360 under 10.1', run(full, { env: { LOGOS_MR_POLICY: PV10 } }).ceiling === 360, run(full, { env: { LOGOS_MR_POLICY: PV10 } }).trace);
}

console.log('\n=== D19: the conversation moves on ===');
{
  const base = [U('my laptop is slow'), A('Which operating system are you on?'), U('I already told you, Windows 11'), A('Then open Task Manager, look at the Startup tab and turn off the apps you do not need at login.')];
  const r = run([...base, U(Q)]);
  const k = rec(r, 'ifr.observed.redundant_question');
  ok('redundant_question in force, then a new topic → revoked by the new topic', k && k.status === 'revoked' && k.endReason === 'revoke:observed.new_topic', J(k && { s: k.status, e: k.endReason }));
  const s = run([U('stop asking me questions'), A('Understood.'), ...base, U(Q)]);
  ok('  a standing stop from before stays active', rec(s, 'ifr.explicit.stop_questions')?.status === 'active' && rec(s, 'ifr.observed.redundant_question')?.endReason === 'revoke:observed.new_topic', J(s.state.interventions.map((i) => [i.decision.trigger, i.status, i.endReason])));
  // (review fix A.9: after "my laptop is slow" the open request is not read — they have said something of their own; with only their stop before it, it is)
  ok('  after their own laptop question, the new question is not read as an open request', !s.fresh.some((d) => d.trigger === 'ifr.observed.open_request'), `${s.trace} ${s.block}`);
  const s2 = run([U('stop asking me questions'), A('Understood.'), U(Q)]);
  ok('  with only their stop before it, the new question is an open request: diagnose, in its no-question form', s2.fresh.some((d) => d.trigger === 'ifr.observed.open_request') && s2.block.includes(DIAGNOSE_STATE) && s2.assist.questions === 0, `${s2.trace} ${s2.block}`);
}

console.log('\n=== D20: the clarification followed through ===');
const D20 = [U(Q), A(GOOD), U('In my own work, we tried it for support tickets')];
{
  const r = run(D20);
  ok('their answer → no new decision, no new topic', r.decision.action === 'none' && !nowCodes(r).includes('observed.new_topic'), `${r.trace} ${J(nowCodes(r))}`);
  ok('  ACS asks nothing this turn (its own streak); the reaction is an answer', r.assist.questions === 0 && r.state.react?.answered === 'answer', J({ q: r.assist.questions, react: r.state.react }));
  const d0 = rec(r, 'ifr.observed.open_request');
  const o = d0 && r.state.outcomes.find((x) => x.interventionId === d0.decision.interventionId);
  ok('  the turn-0 diagnose: delivered, kept', o && o.taskCompletion.value === 'delivered' && o.regulation === 'keep', J(o));
}

console.log('\n=== D21: reversible ===');
{
  const r = run([U(Q), A(GOOD), U('just tell me')]);
  const d0 = rec(r, 'ifr.observed.open_request');
  const o = d0 && r.state.outcomes.find((x) => x.interventionId === d0.decision.interventionId);
  ok('after a diagnose, "just tell me": the turn-0 outcome reverts, on their words', o && o.regulation === 'revert' && d0.endReason === 'revoke:explicit.direct_answer', J({ o: o?.regulation, e: d0?.endReason }));
  ok('  …and the answer is given directly', r.decision.action === 'direct', r.trace);
  const bg = run(R9());
  // (turn-scoped since the review fixes, B.3: a ceiling MR inferred holds for the reply it was read for)
  ok('background said again → shorter, for the turn, with the honest SHORT line', bg.decision.trigger === 'ifr.observed.repeated_background' && bg.decision.action === 'shorter' && J(bg.decision.scope) === J({ kind: 'turn' }) && bg.ceiling === 360 && bg.block.includes(SHORT_OBSERVED), `${bg.trace} ${bg.block}`);
  const rb = run([...R9(), A('A few weeks for a first pass.'), U('more detail please')]);
  const k = rec(rb, 'ifr.observed.repeated_background');
  ok('repeated_background in force, then "more detail please": revoked, no ceiling', k && k.status === 'revoked' && k.endReason === 'revoke:explicit.longer' && rb.ceiling === null, J(k && { s: k.status, e: k.endReason, c: rb.ceiling }));
}

console.log('\n=== D22: a freeze stops MR\'s readings, not their words ===');
{
  const obs = [...at([u(Q)]), ...at([u("I'm stuck")], { material: false })].sort((x, y) => M.OBSERVATION_CODES.indexOf(x.code) - M.OBSERVATION_CODES.indexOf(y.code));
  const out = M.decide({ turn: 0, observations: obs, active: [], params, policyVersion: PV, conversationKey: 'conv_p', ifr: true, frozen: true, carryAcross: false, now: null, lastMrStrategyChange: null });
  ok('frozen: the open request is skipped (noted), "I\'m stuck" still decides', out.notes.includes('frozen:ifr.observed.open_request') && out.decisions.some((d) => d.trigger === 'ifr.explicit.stuck'), J({ n: out.notes, d: out.decisions.map((d) => d.trigger) }));
}

console.log('\n=== D23: dwell ===');
{
  // (review fixes A.9, A.10: eight broad questions running are one topic now — every broad subject is one topic word —
  // and after the first turn Branch A needs nothing but chit-chat before it, so the reader reads the first one only)
  const qs = [Q, "Why don't governments fix anything?", "Why doesn't software ever change things?", "Why aren't companies solving real problems?", "Why can't robots do anything useful?", "How come medicine still can't solve real problems?", "Why don't politicians fix anything?", "Why isn't crypto helping with real issues?"];
  const replies = ['Models predict text well but lack grounding, memory and reliable tools.', 'Mostly incentives: elections reward visible short-term wins over slow structural repair.', 'Code mostly automates existing processes rather than redesigning them.', 'Quarterly targets reward safe incremental products over risky bets.', 'Manipulation in unstructured spaces remains very hard.', 'Clinical trials take years, and regulators demand strong evidence.', 'Coalitions need compromise, which dilutes bold plans.'];
  const msgs = [];
  const read = [];
  let last = null;
  for (let i = 0; i < qs.length; i++) {
    msgs.push(U(qs[i]));
    read.push(has(at([...msgs]), 'observed.open_request') ? 1 : 0);
    last = run([...msgs]);
    if (i < replies.length) msgs.push(A(replies[i]));
  }
  ok('eight broad questions running: only the first is read as an open request', J(read) === J([1, 0, 0, 0, 0, 0, 0, 0]), J(read));
  ok('  no excessive_intervention', ![...last.integrity, ...last.state.integrity].some((f) => f.code === 'excessive_intervention'), J(last.state.integrity));
  // the dwell rule itself, on the policy: the same reading on eight turns running (re-stamped), MR's own strategy change carried
  const open0 = get(at([u(Q)]), 'observed.open_request');
  const openAt = (turn) => ({ ...open0, turn, refs: open0.refs.map((r) => ({ ...r, turn })) });
  const got = [];
  let change = null;
  let skipped = null;
  for (let turn = 0; turn < 8; turn++) {
    const out = M.decide({ turn, observations: [openAt(turn)], active: [], params, policyVersion: PV, conversationKey: 'conv_p', ifr: true, frozen: false, carryAcross: false, now: null, lastMrStrategyChange: change });
    const issued = out.decisions.some((d) => d.trigger === 'ifr.observed.open_request');
    got.push(issued ? 1 : 0);
    if (issued) change = turn;
    else skipped ??= out;
  }
  ok('  the same open-request reading on eight turns running → a diagnose on alternate turns only', J(got) === J([1, 0, 1, 0, 1, 0, 1, 0]), J(got));
  ok('  the skipped turn: dwell holds the strategy, and the rule issues nothing at all', skipped && skipped.notes.includes('dwell:ifr.observed.open_request') && skipped.notes.includes('partial:ifr.observed.open_request') && !skipped.decisions.some((d) => d.trigger === 'ifr.observed.open_request'), J(skipped));
}

// ── measures and outcome ─────────────────────────────────────────────
const ESSAY = [
  'Artificial intelligence has been discussed for many decades in universities and in industry. Opinions about its promise have changed a great deal over that time.',
  'Early researchers expected rapid progress across many fields. Progress came more slowly than they hoped, and funding rose and fell with each wave of enthusiasm.',
  'Modern systems learn from very large collections of examples. Their strengths and weaknesses depend heavily on the kind of data they have seen.',
  'Businesses and governments have adopted these tools at different speeds. Some sectors report clear gains while others report disappointment and wasted effort.',
  'There are many perspectives on what all of this means for the future. Which part of this matters most in your own work? Are you thinking of a particular industry?',
].join('\n\n');
const FRENCH = "L'intelligence artificielle progresse rapidement, mais elle ne résout pas encore tous les problèmes des entreprises. Les équipes doivent d'abord organiser leurs données et former leurs collègues avant de voir des résultats concrets.";
const CODE_ONLY = '```python\nfor row in rows:\n    print(row)\n```';
const SHAPE_VALUES = new Set(['yes', 'no', 'unknown']);
const contentFree = (reply, m) => {
  const vals = Object.values(m);
  const scalar = vals.every((v) => typeof v === 'number' || typeof v === 'boolean' || SHAPE_VALUES.has(v));
  const text = J(vals).toLowerCase();
  const words = [...new Set(reply.toLowerCase().match(/[a-zà-ÿ]{4,}/g) ?? [])].filter((w) => w !== 'unknown');
  return scalar && !words.some((w) => text.includes(w));
};

console.log('\n=== O1: the shape of a reply ===');
{
  const e = M.replyShape(ESSAY);
  ok('ESSAY: 5 paragraphs, 2 questions, nothing actionable (-1)', e.paragraphs === 5 && e.questions === 2 && e.firstActionable === -1, J(e));
  const g = M.replyShape(GOOD);
  ok('GOOD: the point first (0), one question, one explicit question', g.firstActionable === 0 && g.questions === 1 && g.explicitQuestions === 1, J(g));
  const st = M.replyShape('1. Open Settings.\n2. Turn on Storage Sense.');
  ok('two numbered steps: steps 2, actionable at 0', st.steps === 2 && st.firstActionable === 0, J(st));
  const ns = M.replyShape('Next, write du = 2x dx, so the integral becomes the integral of e^u du.');
  ok('"Next, write du = 2x dx…": nextStep yes', ns.nextStep === 'yes', J(ns));
  const fr = M.replyShape(FRENCH);
  ok('French: not English, unreadable (-2), next step unknown', fr.english === false && fr.firstActionable === -2 && fr.nextStep === 'unknown', J(fr));
  const co = M.replyShape(CODE_ONLY);
  ok('code only: -2', co.firstActionable === -2, J(co));
  for (const [name, reply] of [['ESSAY', ESSAY], ['GOOD', GOOD], ['WINDOWS', WINDOWS], ['FRENCH', FRENCH], ['LONG300', LONG300]])
    ok(`${name}: the measure is ints, booleans and codes, with no word of the reply`, contentFree(reply, M.replyShape(reply)), J(M.replyShape(reply)));
  const m = M.measureReply(D1, GOOD);
  ok('measureReply on the networking turn: measure version 1, the shape, and the echoes', m && m.mv === 1 && m.questions === 1 && m.repeatedSentences === 0 && m.repeatedQuestion === false && typeof m.askWords === 'number', J(m));
  ok('  the log code', M.replyMeasuresCode(m) === `w${m.words}p${m.paragraphs}q${m.questions}a${m.firstActionable}r${m.repeatedSentences}` && /^w\d+p\d+q\d+a-?\d+r\d+$/.test(M.replyMeasuresCode(m)), M.replyMeasuresCode(m));
  ok('  the fixed line sent: fallback only', J(M.measureReply(D1, 'Sorry.', { fallback: true })) === J({ mv: 1, fallback: true }) && M.replyMeasuresCode({ mv: 1, fallback: true }) === 'fallback');
  ok('  an empty reply: no measure', M.measureReply(D1, '   ') === null);
}

console.log('\n=== O2: every measure says what kind of evidence it is ===');
{
  const want = {
    none: ['mv', 'fallback'],
    observed: ['content', 'askWords', 'words', 'sentences', 'paragraphs', 'questions', 'explicitQuestions', 'opensWithQuestion', 'wordsBeforeQuestion', 'openerSentences', 'steps', 'code', 'english', 'repeatedSentences', 'repeatedQuestion', 'prevAsked', 'answered', 'noAdvance', 'repeatRequest', 'newTopic', 'attempt', 'verdict', 'independent', 'clarified'],
    explicit: ['corrected', 'stuck', 'knewIt', 'redundantWords', 'confused', 'saidUnderstood', 'askedShorter', 'askedLonger', 'negative'],
    estimate: ['firstActionable', 'wordsBeforeActionable', 'paragraphsBeforeActionable', 'nextStep', 'checkSuggested'],
    hypothesis: ['alreadyGiven', 'relevance'],
  };
  const P = M.MEASURE_PROVENANCE;
  const byKind = (k) => Object.keys(P).filter((x) => P[x] === k).sort();
  for (const k of Object.keys(want)) ok(`${k}: exactly as specified`, J(byKind(k)) === J([...want[k]].sort()), J(byKind(k)));
  ok('no other kind is used', Object.values(P).every((v) => Object.keys(want).includes(v)), J([...new Set(Object.values(P))]));
  const react = run(D20).state.react;
  const measured = { ...M.measureReply(D1, GOOD), ...react };
  ok('every field measureReply and reactionAt produce has a provenance', Object.keys(measured).every((k) => k in P) && Object.keys(M.measureReply(D1, GOOD)).length > 15 && Object.keys(react).length === 21, J(Object.keys(measured).filter((k) => !(k in P))));
}

console.log('\n=== O3: the delivery tests of a diagnose ===');
{
  const d = D1.decision;
  const pass = (reply) => Object.fromEntries(M.deliveryChecks(d, reply).map((c) => [c.test, c.result]));
  const g = pass(GOOD);
  ok('GOOD passes answer_first, one_question and shorter', g.answer_first === 'pass' && g.one_question === 'pass' && g.shorter === 'pass', J(g));
  const e = pass(ESSAY);
  ok('ESSAY fails one_question: partial', e.one_question === 'fail' && M.deliveredFor(d, ESSAY) === 'partial', J(e));
  const w = pass('Which do you mean: AI in your own work, or AI in general? In short, it does well on narrow problems with clear goals.');
  ok('a reply that opens with "Which do you mean?" fails answer_first', w.answer_first === 'fail', J(w));
  const ns = run(SUBSTITUTION).decision;
  ok('"just tell me" after a diagnose contradicts it', M.contradictingPreference(d, new Set(['explicit.direct_answer'])) === 'explicit.direct_answer');
  ok('"stop asking" after a next step does not (it asked nothing)', M.contradictingPreference(ns, new Set(['explicit.stop_questions'])) === null, M.contradictingPreference(ns, new Set(['explicit.stop_questions'])));
  ok('"stop asking" after a diagnose does', M.contradictingPreference(d, new Set(['explicit.stop_questions'])) === 'explicit.stop_questions');
  ok('"show me the steps" after a next step does', M.contradictingPreference(ns, new Set(['explicit.show_steps'])) === 'explicit.show_steps');
}

console.log('\n=== O4: how their next message met the reply ===');
{
  const react = (messages, ctx = {}) => {
    const turns = M.turnsOf(messages);
    const k = turns.length - 1;
    return M.reactionAt(turns, k, { params, ...ctx }, M.observeTurn(turns, k, { params, ...ctx }));
  };
  ok('"chrome" after a single wh-question: an answer', react([u('my browser is slow'), a('Which browser are you using?'), u('chrome')])?.answered === 'answer');
  ok('"ok": no advance', react([u('my browser is slow'), a('Which browser are you using?'), u('ok')])?.answered === 'no_advance');
  const c = react([u('How do I free up disk space?'), a('Which operating system are you on?'), u('No, I meant on my Mac')]);
  ok('a correction: an answer, corrected', c?.answered === 'answer' && c.corrected === true, J(c));
  ok('"got it, that makes sense now": said they understood (said, not shown)', react([u('explain derivatives'), a(explanation(80)), u('got it, that makes sense now')])?.saidUnderstood === true);
  const seven = [u('what is 7 x 9?'), a('Try it yourself first: what do you get?'), u('63')];
  ok('independent: verified with an engine verdict and nothing given away', react(seven, { verdicts: [{ status: 'verified' }] })?.independent === 'verified', J(react(seven, { verdicts: [{ status: 'verified' }] })));
  ok('  without a verdict it is never verified (an attempt at most)', react(seven)?.independent === 'attempt' || react(seven)?.independent === 'none', J(react(seven)));
  ok('  with the answer given first ("the answer is 63"), none, whatever the verdict', react([u('what is 7 x 9?'), a('The answer is 63.'), u('63')], { verdicts: [{ status: 'verified' }] })?.independent === 'none');
  const follow = [...D20, a('Then start with a few hundred labelled tickets and measure how often the model routes them correctly.'), u('ok, how long does labelling take?')];
  ok('D20\'s next turn, no re-ask: clarified yes', react(follow)?.clarified === 'yes', J(react(follow)));
  ok('  with "I already told you": clarified no', react([...D20, a('Then start with a few hundred labelled tickets and measure how often the model routes them correctly.'), u('I already told you, support tickets')])?.clarified === 'no');
  ok('the first message: no reaction', react([u(Q)]) === null && run([U(Q)]).state.react === undefined);
  const pinned = run(D20, { env: { LOGOS_MR_POLICY: PV10 } }).state.react;
  ok('a measure, recorded under the 10.1 pin too, the same', pinned && J(pinned) === J(run(D20).state.react), J(pinned));
}

console.log('\n=== O5: estimates and hypotheses never regulate ===');
{
  const LATE = 'Laptops slow down for many reasons over the years. Background programs pile up, storage fills, and updates add features that need more memory. Heat also plays a part when the fans are dusty. Open Task Manager and turn off the startup apps you do not need.';
  ok('the fixture: its actionable sentence comes late', M.replyShape(LATE).firstActionable >= 3, J(M.replyShape(LATE)));
  const late = run([U('How do I speed up my laptop?'), A(LATE), U('And what about the battery?')]);
  ok('a reply whose only feature is a late actionable sentence → action none', late.decision.action === 'none', late.trace);
  const given = run([U('my laptop operating system is Windows 11 and it is slow'), A('Which operating system is your laptop on?'), U('Windows 11')]);
  ok('react.alreadyGiven with no words saying so → action none', given.state.react?.alreadyGiven === true && given.state.react.redundantWords === false && given.decision.action === 'none', J({ r: given.state.react, t: given.trace }));
  const r = run(D20);
  const turns = M.turnsOf(D20);
  const d0 = rec(r, 'ifr.observed.open_request');
  const oi = d0 && { decision: d0.decision, reply: turns[0].reply, next: turns[1], nextObservations: M.observeTurn(turns, 1, { params }), params };
  ok('evaluateOutcome is the same with and without the reaction beside it', !!oi && !!r.state.react && J(M.evaluateOutcome(oi)) === J(M.evaluateOutcome({ ...oi, react: r.state.react })), J(d0));
  const r2 = run(D20);
  delete r2.state.react;
  ok('  the fold\'s outcomes do not depend on it', J(r.state.outcomes) === J(r2.state.outcomes));
  ok('no observation code is an estimate or hypothesis measure', !M.OBSERVATION_CODES.some((c) => /actionable|next_step|already_given|relevance|understood/.test(c)), J(M.OBSERVATION_CODES.filter((c) => /actionable|next_step|already_given|relevance|understood/.test(c))));
  const EXPECTS = ['questions=0', 'questions<=1', 'steps_delivered', 'answer_first', 'shorter', 'worked_example', 'executed', 'challenge_preserved', 'edit_as_asked', 'verification_stated', 'asks_one', 'no_reveal', 'edits_only', 'says_what_was_checked'];
  ok('DELIVERY_EXPECTS: the same 14 keys as before, nothing for an estimate', J(Object.keys(M.DELIVERY_EXPECTS)) === J(EXPECTS), J(Object.keys(M.DELIVERY_EXPECTS)));
}

console.log('\n=== O6: proxies ===');
{
  const UNK = { value: 'unknown', provenance: 'none', refs: [] };
  const frictionOnly = { interventionId: 'abc', turn: 3, taskCompletion: UNK, satisfaction: UNK, friction: { value: { questionsAsked: 0, repeatRequests: 0, complaints: 0, turnsToUseful: 0 }, provenance: 'observed', refs: [] }, independentPerformance: UNK, retention: UNK, autonomy: UNK, regulation: 'inconclusive' };
  const fs = M.checkOutcomeUse([frictionOnly], 'capability', { reactions: [{}] });
  ok('a capability claim from friction and a reaction is named as such', fs.length === 1 && fs[0].code === 'proxy_gaming' && fs[0].detail === 'capability_from:friction+reaction', J(fs));
  ok('  without reactions, unchanged', M.checkOutcomeUse([frictionOnly], 'capability')[0].detail === 'capability_from:friction');
  ok('  reactions are not interaction evidence', M.checkOutcomeUse([], 'interaction', { reactions: [{}] })[0].detail === 'interaction_without_evidence');
  const ci = (mean, half, n = 400) => ({ mean, lo: mean - half, hi: mean + half, n });
  const report = (primary) => ({
    candidate: 'full',
    baseline: 'baseline',
    randomized: true,
    arms: [
      { arm: 'full', n: 400, metrics: { [primary]: ci(0.3, 0.02), task_success: ci(0.9, 0.01), control_compliance: ci(0.97, 0.01) } },
      { arm: 'baseline', n: 400, metrics: { [primary]: ci(0.5, 0.02), task_success: ci(0.9, 0.01), control_compliance: ci(0.96, 0.01) } },
    ],
    primary,
    guardrails: ['task_success', 'control_compliance'],
    independentOutcomeMeasured: false,
    longitudinal: false,
    comparedAgainst: ['baseline'],
  });
  for (const p of ['words_per_reply', 'one_question_when_wanted']) {
    const v = M.promotionVerdict(report(p));
    ok(`"${p}" as the primary → not promoted: primary_is_engagement_proxy`, v.promote === false && v.reasons.includes('primary_is_engagement_proxy'), J(v));
  }
}

console.log('\n=== O7: the ledger keeps the measures, as codes ===');
{
  const base = { v: 1, arm: 'full', ifr: true, shadow: false, source: 'deployment' };
  const reply = M.measureReply(D1, GOOD);
  const react = run(D20).state.react;
  const kept = M.sanitizeRecord('exposure', { ...base, reply, react });
  ok('an exposure record keeps the reply measures and the reaction', kept && same(kept.reply, reply) && same(kept.react, react), J(kept));
  ok('  a string with a space anywhere refuses the record', M.sanitizeRecord('exposure', { ...base, reply: { ...reply, nextStep: 'yes please' }, react }) === null && M.sanitizeRecord('exposure', { ...base, reply, react: { ...react, answered: 'an answer' } }) === null);
  const ctx = { userId: 'user_p', conversationKey: 'conv_p', now: 1_800_000_000_000, arm: 'full' };
  const d1 = M.rowsForTurn({ ...D1, reply }, ctx);
  const dec = d1.find((x) => x.kind === 'decision');
  ok('the networking turn\'s decision row keeps strategy diagnose', dec && dec.record.controls.strategy === 'diagnose', J(dec?.record.controls));
  ok('  its exposure row carries the reply measures', d1.find((x) => x.kind === 'exposure')?.record.reply?.mv === 1);
  const d17 = M.rowsForTurn(run(R11()), ctx).find((x) => x.kind === 'decision');
  ok('the fix-failed turn\'s decision row keeps verification suggest', d17 && d17.record.controls.verification === 'suggest', J(d17?.record.controls));
}

// ── the invariants ───────────────────────────────────────────────────
console.log('\n=== I1: the rule order, and every new rule gated ===');
const RULE_ORDER = [
  'ifr.explicit.stop_questions',
  'ifr.explicit.show_steps',
  'ifr.explicit.direct_answer',
  'mr.explicit.quiz',
  'mr.explicit.own_try',
  'ifr.explicit.shorter',
  'mr.explicit.simpler',
  'mr.explicit.verify',
  'mr.explicit.edit_only',
  'ifr.explicit.corrected',
  'mr.explicit.knows_that',
  'ifr.observed.unproductive_questions',
  'ifr.observed.redundant_question',
  'ifr.observed.repeated_confusion',
  'mr.observed.failed_attempts',
  'mr.observed.repeated_stuck',
  'ifr.observed.repeated_request',
  'ifr.observed.late_answer',
  'ifr.observed.verbose_replies',
  'ifr.observed.repeated_background',
  'mr.explicit.stuck',
  'ifr.observed.routine_task',
  'mr.observed.fix_failed',
  'ifr.explicit.stuck',
  'ifr.observed.open_request',
];
{
  ok('RULES are in the specified order', J(M.RULES.map((r) => r.id)) === J(RULE_ORDER), J(M.RULES.map((r) => r.id)));
  const stub = { turn: 0, obs: [], params, standing: false, bounded: false, carryAcross: false, now: null, inForce: new Set() };
  for (const id of NEW_RULES) {
    const rule = M.RULES.find((r) => r.id === id);
    ok(`${id}: its controls are ones it may set`, rule && Object.keys(rule.controls(stub)).every((k) => M.RULE_CONTROLS[id].includes(k)), J(rule && Object.keys(rule.controls(stub))));
  }
  const maxOf = (r) => r.controls(stub).questionBudget?.max;
  const zeroAt = M.RULES.map((r, i) => (maxOf(r) === 0 ? i : -1)).filter((i) => i >= 0);
  const oneAt = M.RULES.map((r, i) => (maxOf(r) === 1 && r.id !== 'mr.explicit.quiz' ? i : -1)).filter((i) => i >= 0);
  ok('every rule that allows one question (but the quiz) comes after every rule that allows none', oneAt.length === 2 && oneAt.every((i) => zeroAt.every((z) => i > z)), J({ oneAt: oneAt.map((i) => M.RULES[i].id), lastZero: M.RULES[Math.max(...zeroAt)].id }));

  const FIX = {
    'ifr.explicit.corrected': R6,
    'mr.explicit.knows_that': R7,
    'ifr.observed.redundant_question': R8a,
    'mr.observed.repeated_stuck': R5,
    'ifr.observed.late_answer': R10,
    'ifr.observed.repeated_background': R9(),
    'mr.explicit.stuck': SUBSTITUTION,
    'mr.observed.fix_failed': R11(),
    'ifr.explicit.stuck': [u("I'm stuck")],
    'ifr.observed.open_request': [u(Q)],
  };
  // (stuck with nothing visible is read live only, with nothing on their screen)
  const FIX_CTX = { 'ifr.explicit.stuck': { material: false } };
  for (const id of NEW_RULES) {
    const rule = M.RULES.find((r) => r.id === id);
    const msgs = FIX[id];
    const obs = at(msgs, FIX_CTX[id] ?? {});
    const ctx = { ...stub, turn: M.turnsOf(msgs).length - 1, obs };
    const withNow = { ...ctx, now: { assist: acsOf(msgs), core: null, maxReply: 700 } };
    ok(`${id}: fires on its fixture, and its when() reads nothing of now`, obs.some((o) => rule.on.includes(o.code)) && rule.when(ctx) === true && rule.when(withNow) === rule.when(ctx), J(codes(obs)));
    ok(`${id}: its when() is false under mr-2026.10.1`, rule.when({ ...ctx, params: params10 }) === false && rule.when({ ...withNow, params: params10 }) === false);
  }
}

console.log('\n=== I2: bounded, justified, traceable ===');
{
  const made = RUNS.flatMap((x) => freshNew(x.r).map((d) => ({ ...x, d })));
  const bad = (pred) => made.filter((m) => !pred(m)).map((m) => `${m.d.trigger}@${m.d.issuedAtTurn}`);
  ok(`${made.length} decisions from the new rules in this suite, from all ten`, made.length > 30 && NEW_RULES.every((id) => made.some((m) => m.d.trigger === id)), J(NEW_RULES.filter((id) => !made.some((m) => m.d.trigger === id))));
  const ctxOf = (d) => ({ knownPolicies: Object.keys(M.STRATEGIES), ruleControls: M.RULE_CONTROLS, turn: d.issuedAtTurn });
  ok('  every one passes its own contract', bad((m) => !M.checkDecision(m.d, ctxOf(m.d)).some((f) => f.severity === 'block')).length === 0, J(bad((m) => !M.checkDecision(m.d, ctxOf(m.d)).some((f) => f.severity === 'block'))));
  ok('  rests on evidence, as codes', bad((m) => m.d.evidenceRefs.length > 0 && m.d.evidenceRefs.every((e) => Number.isInteger(e.turn) && /^[a-z_]+(?:\.[a-z_]+)+$/.test(e.code))).length === 0);
  ok('  is bounded: a turn, or no more than observedTurns', bad((m) => m.d.scope.kind === 'turn' || (m.d.scope.kind === 'turns' && m.d.scope.turns <= params.observedTurns)).length === 0, J(made.map((m) => m.d.scope)));
  ok('  expires', bad((m) => m.d.expiration.afterTurn !== null).length === 0);
  ok('  rolls back on a reverting outcome', bad((m) => m.d.rollback.when.includes('outcome:revert')).length === 0);
  ok('  never more questions than ACS allowed', bad((m) => m.r.assist.questions <= m.acs.questions).length === 0, J(bad((m) => m.r.assist.questions <= m.acs.questions)));
  // (no ceiling means the route's own 700 stands)
  ok('  never a ceiling above the route\'s 700', bad((m) => (m.r.ceiling ?? 700) <= 700).length === 0);
  ok('  the same turn again gives the same intervention id', bad((m) => MR.regulateTurn(input(m.messages, m.o)).fresh.some((x) => x.interventionId === m.d.interventionId)).length === 0);
}

console.log('\n=== I3: most turns do nothing ===');
{
  const ORDINARY = ['How do I reverse a linked list in Java?', 'Write a unit test for this function please', 'I wrote a test for the parser but it fails on empty input', 'I have a question about my tax return', 'Quick question: is Python pass by reference?', "What's the next step after installing node?", 'Is the shorter path always the optimal one in Dijkstra?', 'My cover letter is too long, can you help me cut it to one page', 'Can you make my resume more concise?', "What's a simpler way to compute the gcd?", 'Is it true that water boils at 100C everywhere?', 'How do you know if a number is prime?', 'I need to verify my account, where do I click?', 'I double-checked the units and they are right', "I'm lost in this city, which bus goes downtown?", "I don't understand why my build fails on CI", 'Go back to the second paragraph and check the date', 'You can ask my manager about it', 'I always forget the quadratic formula', 'Every time I run the script it crashes', 'Give me some questions for my book club', 'Make me a quiz for my 5th graders', "I'll practice it tonight", 'I need to practice my speech, help me write it', 'The recipe has five steps', 'I followed the steps and it still did not work', "It's way too long since we last spoke", 'Come on in, the door is open', 'Convert 5 miles to km', 'Fix the typo in line 3 of my code', "I'm stuck in traffic, can you keep it quick?", 'My car is stuck in the snow, what should I do?', "I'm stuck on the problem of evil", 'I meant to ask earlier: how do I export a PDF?', "No, I mean it's fine, carry on", 'As I said in my essay, the war ended in 1918', "I'm stuck on why the sky is blue", "She said she's stuck on step 3", 'I already tried restarting it', "I know you're busy, but one more thing: how do I sort a list?", 'The test still fails on CI', 'Why is the sky blue?', 'Why is Python slow?', "Why doesn't my code work?", "Why don't people vote?", "Why aren't people vaccinated?", "Why doesn't the chatbot remember things?", 'Why is AI not solving problems in healthcare?', 'Where do I start with learning Python?'];
  const NEAR = [...STUCK_SILENT, ...CORRECTED_SILENT, ...KNOWS_SILENT, ...ALREADY_SILENT, ...OPEN_SILENT, ...REFERENT_SILENT.filter((t) => !/stuck/.test(t))];
  const all = [...new Set([...ORDINARY, ...NEAR, ...CLEAR, 'ok', 'k', 'sure'])];
  const hits = [];
  for (const t of all) {
    for (const [msgs, o] of [[[U(t)], {}], [[U(t)], { material: false }], [[U('help me with this'), A(explanation(80)), U(t)], {}], [[U('help me with this'), A(explanation(80)), U(t)], { material: false }]]) {
      const r = MR.regulateTurn(input(msgs, o));
      const f = freshNew(r);
      if (f.length) hits.push([t, msgs.length, o.material, f.map((d) => d.trigger)]);
    }
  }
  ok(`${all.length} ordinary messages, near-misses and clear questions, first and after an explanation → no decision from a new rule`, hits.length === 0, J(hits));
  for (const w of ['ok', 'k', 'sure']) ok(`"${w}" → nothing new`, freshNew(run([U('help me with this'), A(explanation(80)), U(w)])).length === 0 && freshNew(run([U('my browser is slow'), A('Which browser are you using?'), U(w)])).length === 0);
}

console.log('\n=== I4: their own "check it" is never replaced by MR\'s suggested check ===');
{
  const dec = (id, v, trigger) => ({ policyVersion: PV, interventionId: id, action: 'verify', trigger, evidenceRefs: [{ turn: 0, role: 'user', code: 'explicit.verify' }], target: ['epistemic'], controls: { verification: v }, scope: { kind: 'turn' }, expiration: { afterTurn: 0, onRevoke: [] }, confidence: 1, uncertainty: [], evaluationPlan: { primary: 'taskCompletion', expect: [], window: 1 }, rollback: { revertTo: 'acs_default', when: ['outcome:revert'] }, loop: 'fast', issuedAtTurn: 0 });
  const explicitVerify = dec('aaaa', 'explicit', 'mr.explicit.verify');
  const suggest = { ...dec('bbbb', 'suggest', 'mr.observed.fix_failed'), action: 'check_first' };
  ok('compose([their verify, MR\'s suggest]) → explicit', M.compose([explicitVerify, suggest], 0, PV, 'conv_p').controls.verification === 'explicit');
  ok('  in either order', M.compose([suggest, explicitVerify], 0, PV, 'conv_p').controls.verification === 'explicit');
  ok('  MR\'s suggest alone stays suggest', M.compose([suggest], 0, PV, 'conv_p').controls.verification === 'suggest');
}

// ── REVIEW FIXES — readers (1) ───────────────────────────────────────
// The reader fixes of the review (fix plan A.1, A.3–A.6, D.1 and D.5 for the
// stuck reader, D.11's N14/N15, D.14, D.15, D.19): each reproduction as a
// fire or must-not-fire fixture, with the near-misses a fix could newly catch,
// and the 10.1 pin unchanged on every one of them.
const QUADRATIC = [u('How do I solve x^2-5x+6=0?'), a('To solve a quadratic, move everything to one side, factor if you can, and otherwise use the quadratic formula. The discriminant tells you how many real roots there are, and checking your roots by substituting them back is a good habit.')];
const stuckDecision = (r) => r.fresh.some((d) => /\.explicit\.stuck$|\.observed\.repeated_stuck$/.test(d.trigger));
const stuckRefsOf = (obs) => refCodes(get(obs, 'explicit.stuck'));

console.log('\n=== RF1: fixes that did not work — what counts as a failure (A.1: F1, F17) ===');
{
  const BUILD1 = 'The error usually means the module path is wrong. Check that the import uses a relative path such as ./utils and that the file name matches its case exactly, because Linux file systems are case sensitive while macOS and Windows usually are not, so it can work locally and fail on the server.';
  const BUILD2 = 'Then the build cache may be stale. Delete the node_modules folder, the .next folder and the lock file, run npm install again, and restart the dev server so that it picks up the renamed files instead of the cached ones it compiled before you made the change.';
  const ARCS = {
    wifi: [u('My laptop wifi keeps dropping.'), a(SUGGEST1), u("I did that but it still doesn't work."), a(SUGGEST2)],
    build: [u('My Next.js build fails with Module not found: utils.'), a(BUILD1), u('I fixed the path but it still fails with the same error.'), a(BUILD2)],
  };
  const FAIL_FIRE = [
    'Still the same error.', "It's still not working", "still isn't working", 'still not loading', 'Still drops.', 'still happening', 'still no luck', "didn't help", "Didn't work.", "Nope, didn't work", "Tried it, didn't work",
    "Didn't fix it", "Didn't change anything", "That didn't solve it", "That didn't do anything", "That didn't do it", 'Same error', 'Same thing.', 'Same problem.', 'Same issue.', 'Same result', 'Still the same', 'No change', 'No difference',
    'It made no difference', 'It still freezes', "Still won't boot", "It still won't turn on", 'Still slow', "It's still so slow", 'Still disconnecting', 'Still having the issue', 'The problem is still there', 'The error is still there', 'It keeps happening',
    'Tried that, no luck', 'Still no internet', "It's doing the same thing", "Doesn't work", 'Not working', 'Still nothing', 'Still getting a 404', 'Still getting the same error', "I did that and it's still dropping", "That didn't work either", 'It crashed again.', 'same error again',
  ];
  const FAIL_SILENT = [
    'Ran it again and no errors, thanks!', 'Tried again, no errors this time!', 'I ran it again and it does not crash anymore.', 'Ran the build again: zero errors, all tests pass!', 'Still no errors after a restart, so I think we are good.',
    'Still no drops since this morning, so I think that fixed it!', 'Tried again and nothing is broken now. Thank you!', 'It works now! Weirdly the old branch still fails, but I do not care about that one.', 'OK it works. Out of curiosity, why did it still fail the first time?',
    'Thank you! Is it normal that the linter still errors on unused imports?', 'It worked! The other laptop still drops but that one is ancient.', 'Works now. My phone still crashes the app sometimes, separate issue.',
    "I still don't get it", 'Every time I run the script it crashes', 'it works now', "that still doesn't make sense to me", 'That did it, thanks!', 'got it working!', 'all good now', 'none of it worked but I found a fix myself and it works now',
  ];
  for (const [name, arc] of Object.entries(ARCS)) {
    for (const t of FAIL_FIRE) ok(`[${name}] "${t}" as the second report → fix_failed`, has(at([...arc, u(t)]), 'observed.fix_failed'), J(codes(at([...arc, u(t)]))));
    for (const t of FAIL_SILENT) ok(`[${name}] "${t}" → no fix_failed`, !has(at([...arc, u(t)]), 'observed.fix_failed'), J(codes(at([...arc, u(t)]))));
  }
  const r = run([...ARCS.build, U('Ran it again and no errors, thanks!')]);
  ok('the build arc ending "no errors, thanks!" → no check-first line', !r.block.includes('CHECK BEFORE ANOTHER FIX') && !r.fresh.some((d) => d.trigger === 'mr.observed.fix_failed'), `${r.trace} ${r.block}`);
  ok('a single "Didn\'t work." → none (it takes two reports)', !has(at([u('My laptop wifi keeps dropping.'), a(SUGGEST1), u("Didn't work.")]), 'observed.fix_failed'));
  ok('M.stillFails reads the clause, not the sentence: "I fixed the path but it still fails" yes, "the linter still errors" no', M.stillFails('I fixed the path but it still fails with the same error.') && !M.stillFails('Is it normal that the linter still errors on unused imports?'));
  ok('under mr-2026.10.1: none of them', [...FAIL_FIRE.slice(0, 8), ...FAIL_SILENT.slice(0, 4)].every((t) => !has(at10([...ARCS.wifi, u(t)]), 'observed.fix_failed')));
}

console.log('\n=== RF2: a stuck that is not about a piece of work (A.3: F3, F32, F12) ===');
{
  const EMOTIONAL = [
    "I don't know how to start, my dad just died.", "I don't know where to start, I just got dumped.", "I'm stuck, I feel like nothing will ever change.", "I'm so stuck. I can't stop crying.", "I've hit a wall. I'm exhausted and I hate everything.",
    "I'm stuck. My mom is in hospital and I can't focus.", "Honestly I'm stuck, I feel worthless.", "I've been stuck for weeks, I can't get out of bed.", "I'm really stuck. My marriage is falling apart.", "I don't know what to do next, my landlord is evicting us.",
    "Everything feels pointless lately. I'm stuck.", "My relationship is falling apart and I'm stuck.", "I failed my exam and I don't know what to do", "I need to vent, I'm stuck",
  ];
  const LIFE = [
    "I'm stuck with it now, the contract runs two years.", "I'm stuck, my flight got cancelled and I'm at the airport.", "I've been stuck all week, my car is in the shop.", 'I bought a car I hate and now I\'m stuck with it.', "Well, I'm stuck with it.",
    "I'm stuck at home with the flu.", "Thanks! I'm stuck with you now haha.", "I'm stuck here for another hour, tell me a joke.", "I'm stuck, my visa runs out on Friday.",
  ];
  const RESOLVED = [
    'I got stuck again, but then I saw my sign error and fixed it. x = 4!', 'I got stuck again but figured it out, thanks', "I'm stuck again lol jk, x = 4", "I've been stuck all day but that step made it click. x = 4.", 'I got stuck, but then I realised I forgot the minus sign. All good now.',
    'Im stuck lol jk', "I'm stuck. Kidding! Can you recommend a podcast?", "I'm stuck. Totally kidding, I got it! x = 4", 'Translate to Spanish: I am stuck.', "How do you say I'm stuck in French?",
  ];
  for (const t of [...EMOTIONAL, ...LIFE, ...RESOLVED]) {
    for (const h of [[], QUADRATIC]) {
      const obs = at([...h, u(t)], { material: false });
      const r = run([...h, U(t)], { material: false });
      ok(`${h.length ? 'after a maths exchange' : 'first'}: "${t}" → no explicit.stuck, no stuck decision`, !has(obs, 'explicit.stuck') && !stuckDecision(r) && !/THEY ARE STUCK/.test(r.block), `${J(codes(obs))} ${r.trace}`);
    }
  }
  // near-misses the gates must not eat
  for (const t of ["I'm stuck on question 3, it's due tomorrow", "I'm stuck on my essay intro, any tips?", "I'm stuck, I don't get how you got 3x", "I'm stuck, can you give me a hint?", "I'm stuck, but I figured out the first part"])
    ok(`"${t}" after a maths exchange → still explicit.stuck`, has(at([...QUADRATIC, u(t)]), 'explicit.stuck'), J(codes(at([...QUADRATIC, u(t)]))));
  ok('"I\'m stuck, my flight got cancelled…" stays silent even with a task in the window (STUCK_LIFE)', !has(at([...QUADRATIC, u("I'm stuck, my flight got cancelled and I'm at the airport.")]), 'explicit.stuck'));
  // (the window stops at a new topic; since fix plan A.10 a stuck message is never read as one, so "I'm stuck, what
  // would you do in my place?" sees the task before it: RF16)
  ok('a stuck among other words with no work in them: silent first, read with their task in the window', !has(at([u("I'm stuck, any thoughts on how to move on?")], { material: false }), 'explicit.stuck') && has(at([...QUADRATIC, u("I'm stuck, any thoughts on how to move on?")]), 'explicit.stuck'));
}

console.log('\n=== RF3: stuck, and help refused in the same message (A.3: F4, ref stuck.declines) ===');
{
  const DECLINES = [
    "I'm stuck. No hints, just let me think for a minute.", "I'm stuck but no hints please, I want to get there myself.", "I'm stuck, but don't give me the next step, I'll figure it out.", "I'm stuck on this one but I'd like to keep trying on my own, no hints please.",
    "I'm stuck, just let me vent for a second, I don't need help.", "I'm stuck but I don't want help yet.", "I'm stuck. Don't tell me anything yet.",
  ];
  for (const t of DECLINES) {
    const obs = at([...QUADRATIC, u(t)], { material: false });
    const r = run([...QUADRATIC, U(t)], { material: false });
    ok(`"${t}" → explicit.stuck with stuck.declines, and no stuck decision`, stuckRefsOf(obs).includes('stuck.declines') && !stuckDecision(r) && !/THEY ARE STUCK/.test(r.block), `${J(stuckRefsOf(obs))} ${r.trace}`);
  }
  for (const t of ["I'm stuck, can you give me a hint?", "I'm stuck, I don't want to give up", "I'm stuck on step 3"]) ok(`"${t}" → no stuck.declines`, !stuckRefsOf(at([...QUADRATIC, u(t)])).includes('stuck.declines'), J(stuckRefsOf(at([...QUADRATIC, u(t)]))));
  ok("the ref code is registered: IFR_REF_CODES.stuckDeclines === 'stuck.declines'", M.IFR_REF_CODES.stuckDeclines === 'stuck.declines' && M.IFR_REF_CODES.stuckFirst === 'stuck.first');
}

console.log('\n=== RF4: more of how people say they are stuck (A.3: F14) ===');
{
  const MORE_STUCK = [
    "I'm stuck here", "I'm stuck at this point", "I'm stuck on step 3 of the proof", "I'm stuck on the second part of the question", "I'm stuck on the bit where you divide", "I'm stuck on how to start the second paragraph", "I'm stuck on part b", "I'm stuck on question 3b",
    'stuck on q2a', 'Stuck on step 3', 'Stuck on this one', "I can't figure it out", "I can't figure this out", "I can't figure out what to do next", "I can't work out the next step", "I don't know what to do", "I don't know how to solve this", "I don't know how to approach this",
    'I have no idea what to do', "I'm not sure what to do next", 'Not sure what to do', "I'm not sure how to start", 'I have no idea where to start', 'Honestly I have no idea how to start', "I'm not sure how to continue", 'Not sure how to continue', 'no clue how to go on',
  ];
  for (const t of MORE_STUCK) {
    const s = get(at([...INTEGRATE, u(t)]), 'explicit.stuck');
    ok(`"${t}" after their exercise → explicit.stuck with stuck.shown and stuck.own_work`, s && refCodes(s).includes('stuck.shown') && refCodes(s).includes('stuck.own_work'), J(s ?? codes(at([...INTEGRATE, u(t)]))));
  }
  for (const t of ["I can't figure it out on my own", "I don't know what to do with my weekend", 'Stuck in traffic again', "I'm not sure how to start my car", "I'm stuck on the problem of evil", "I'm stuck with this laptop for another year"])
    ok(`"${t}" → no explicit.stuck`, !has(at([...INTEGRATE, u(t)]), 'explicit.stuck') && !has(at([u(t)], { material: false }), 'explicit.stuck'), J([codes(at([...INTEGRATE, u(t)])), codes(at([u(t)], { material: false }))]));
  ok('under mr-2026.10.1: none of them', MORE_STUCK.every((t) => !has(at10([...INTEGRATE, u(t)]), 'explicit.stuck')));
}

console.log('\n=== RF5: still stuck, said inside the message (A.3: F26; N15) ===');
{
  const NEXT = 'Next, write du = 2x dx, so the integral becomes the integral of e^u du. Then integrate e^u, which is just e^u, and put x^2 back in for u to finish.';
  const base = [u("I'm stuck on the next step"), a(NEXT)];
  for (const t of ['Tried that, still stuck', 'Still stuck here', 'Hmm, still stuck at the same spot', 'I tried it and still stuck', 'Thanks. Still stuck though.', 'I did that, still stuck on the same part', 'ok still stuck lol']) {
    const obs = at([...base, u(t)]);
    ok(`"${t}" after an earlier stuck → stuck again and observed.repeated_stuck`, stuckRefsOf(obs).includes('stuck.again') && has(obs, 'observed.repeated_stuck'), J(codes(obs)));
  }
  for (const t of ['still stuck in traffic', 'Still stuck. jk I got it', 'Tried that, still stuck in the elevator'])
    ok(`"${t}" → no stuck`, !has(at([...base, u(t)]), 'explicit.stuck'), J(codes(at([...base, u(t)]))));
  // (residual F26: the first "still stuck" with their integral on the table is read as their stuck — this assertion
  // said nothing before the fix; with nothing on the table it is still nothing)
  const firstStill = at([u('help me integrate 2x e^(x^2)'), a(NEXT), u('Tried that, still stuck')]);
  ok('"Tried that, still stuck" with no earlier stuck, their integral on the table → explicit.stuck (shown, own work), not again', has(firstStill, 'explicit.stuck') && !stuckRefsOf(firstStill).includes('stuck.again') && stuckRefsOf(firstStill).includes('stuck.shown') && !has(firstStill, 'observed.repeated_stuck'), J(firstStill));
  ok('"Tried that, still stuck" with nothing on the table → nothing', !has(at([u('Any good podcasts about Rome?'), a('Try The History of Rome by Mike Duncan.'), u('Tried that, still stuck')]), 'explicit.stuck'));
  const ss = at([...base, u('still stuck')]);
  ok('N15: "still stuck" read as stuck again is not also weak.short_reply', has(ss, 'explicit.stuck') && !has(ss, 'weak.short_reply'), J(codes(ss)));
  ok('  …"Still stuck here" neither', !has(at([...base, u('Still stuck here')]), 'weak.short_reply'));
  ok('  …while "ok" after the same reply still is', J(codes(at([...base, u('ok')]))) === J(['weak.short_reply']), J(codes(at([...base, u('ok')]))));
  ok('  …and under mr-2026.10.1 "still stuck" is the short reply it was', has(at10([...base, u('still stuck')]), 'weak.short_reply'));
}

console.log('\n=== RF6: the work is in the conversation — read across the topic (A.3: F27; N20) ===');
{
  const FLOWS = [
    [U('A ball is thrown straight up at 12 m/s. How high does it go? This is for my physics homework.'), A('Use v^2 = u^2 - 2gh with v = 0 at the top. What do you get when you plug in u = 12 and g = 9.8?'), U("I'm stuck, I don't know how to rearrange it.")],
    [U('Write a function that reverses a string in Python. It is for my CS class.'), A('Good one to practise. What do you think the first step is?'), U("I'm stuck")],
    [U('Balance this for my chemistry homework: Fe + O2 -> Fe2O3'), A('Start with oxygen. How many oxygen atoms are on each side?'), U("I'm stuck")],
    [U('Solve 2x + 3 = 11'), A('What could you do first to get 2x on its own?'), U("I'm stuck")],
    [U('What is the main theme of Of Mice and Men? I have to write an essay on it.'), A('Think about what George and Lennie want. What do you think their dream represents?'), U("I'm stuck")],
    [U('How do I find the area of a triangle with sides 3, 4 and 5? Homework.'), A('Do you notice anything special about the sides 3, 4 and 5?'), U("I'm stuck")],
    [U('Translate "the cat sleeps on the bed" into French for my homework.'), A('Start with the subject. Do you know the word for cat, and its gender?'), U("I'm stuck on this part")],
    // their problem two exchanges back
    [U('For my homework: a train leaves the station at 9am travelling at 60 km/h, and a second train leaves the same station at 10am travelling at 90 km/h on the same track in the same direction. At what time does the second train catch up with the first one?'), A('Nice problem. How far ahead is the first train when the second one sets off?'), U('60 km'), A('Right. Now how fast is the second train closing that gap each hour?'), U("I'm stuck")],
    // a problem Socria set them
    [U('Can you give me an integral to try?'), A('Sure. Try this one: integrate x^2 e^x dx.'), U("I'm stuck")],
    // a problem the reply set them in words, not symbols
    [U('help with chemistry'), A("Sure. Let's balance Fe + O2 -> Fe2O3 together. Can you balance the oxygen first?"), U("I'm stuck")],
    // their problem two turns back, a short acknowledgement between
    [U('A tank holds 500 litres and drains at 12 litres a minute while a pump refills it at 7 litres a minute. How long until it is empty? This is from my maths worksheet.'), A('Good. What is the net rate at which the tank loses water each minute?'), U('ok'), A('Think about the two rates together. Which one wins, and by how much?'), U("I'm stuck")],
  ];
  for (const m of FLOWS) {
    const obs = at(m, { material: false });
    ok(`"${m[0].content.slice(0, 50)}…" then "${m.at(-1).content}" → stuck.shown and stuck.own_work`, stuckRefsOf(obs).includes('stuck.shown') && stuckRefsOf(obs).includes('stuck.own_work') && !stuckRefsOf(obs).includes('stuck.unseen'), J(stuckRefsOf(obs)));
    for (const guard of [false, true]) {
      const r = run(m, { material: false, guard });
      ok(`  ${guard ? 'under the Answer Guard: ' : ''}a next step, never "THE WORK IS NOT IN THE CONVERSATION"`, r.decision.trigger === 'mr.explicit.stuck' && r.decision.action === 'next_step' && !r.block.includes('NOT IN THE CONVERSATION'), `${r.trace} ${r.block}`);
    }
  }
  // nothing of the work said: still unseen, and the window stops at a new topic
  const named = at([U('Can you help me with my homework?'), A('Sure, what is it?'), U("I'm stuck")], { material: false });
  ok('"Can you help me with my homework?" → "Sure, what is it?" → "I\'m stuck": the work is named, not shown → stuck.unseen', stuckRefsOf(named).includes('stuck.unseen'), J(stuckRefsOf(named)));
  const moved = at([U('Solve 2x + 3 = 11'), A('Subtract 3, then divide by 2: x = 4.'), U('What is the capital of Australia?'), A('Canberra.'), U("I'm stuck")], { material: false });
  ok('their exercise before a new topic does not count for a stuck after it', !stuckRefsOf(moved).includes('stuck.own_work'), J(stuckRefsOf(moved)));
}

console.log('\n=== RF7: what is on their screen, and nothing before it (D.1, D.5: N10, N20, N6) ===');
{
  const one = [u("I'm stuck on this step")];
  ok('"I\'m stuck on this step", something on screen (material) → stuck.shown and own work, no stuck.unseen', stuckRefsOf(at(one, { material: true })).includes('stuck.shown') && stuckRefsOf(at(one, { material: true })).includes('stuck.own_work') && !stuckRefsOf(at(one, { material: true })).includes('stuck.unseen'), J(stuckRefsOf(at(one, { material: true }))));
  ok('  …with an attachment on the message (attached) → stuck.shown', stuckRefsOf(at(one, { material: false, attached: true })).includes('stuck.shown'), J(stuckRefsOf(at(one, { material: false, attached: true }))));
  ok('  …with nothing on screen → stuck.unseen and stuck.first', J(stuckRefsOf(at(one, { material: false }))) === J(['explicit.stuck', 'stuck.unseen', 'stuck.first']), J(stuckRefsOf(at(one, { material: false }))));
  ok('  …with the screen unknown (a replay, or no route) → neither shown nor unseen', !stuckRefsOf(at(one)).some((c) => c === 'stuck.shown' || c === 'stuck.unseen'), J(stuckRefsOf(at(one))));
  ok('  attached: only a plain true counts', !stuckRefsOf(at(one, { material: false, attached: 'yes' })).includes('stuck.shown') && stuckRefsOf(at(one, { material: false, attached: 'yes' })).includes('stuck.unseen'));
  const shot = run([U("I'm stuck on this problem")], { material: true });
  ok('"I\'m stuck on this problem" with their photo on screen → a next step, never "NOT IN THE CONVERSATION"', shot.decision.action === 'next_step' && !shot.block.includes('NOT IN THE CONVERSATION'), `${shot.trace} ${shot.block}`);
  const proj = run([U("I'm stuck")], { material: true });
  ok('"I\'m stuck" with a project open (material, nothing pointed at) → no stuck decision: ACS\'s help stands', !stuckDecision(proj) && !proj.block.includes('NOT IN THE CONVERSATION'), proj.trace);
  const unknown = run([U("I'm stuck")]);
  ok('"I\'m stuck" with the screen unknown → no stuck decision', !stuckDecision(unknown), unknown.trace);
  ok('stuck.first only when nothing precedes it: not after an earlier message of theirs', !stuckRefsOf(at([u('hi'), a('Hi! What are you working on?'), u("I'm stuck")], { material: false })).includes('stuck.first'), J(stuckRefsOf(at([u('hi'), a('Hi! What are you working on?'), u("I'm stuck")], { material: false }))));
  ok('  …and not when the message itself shows the work', !stuckRefsOf(at([u(MIGRATE)], { material: false })).includes('stuck.first'), J(stuckRefsOf(at([u(MIGRATE)], { material: false }))));
}

console.log('\n=== RF8: a long message is not a paste (D.11: N14) ===');
{
  const sentence = 'The service should accept a request from the client and return the list of active orders sorted by date. ';
  const msg = (n) => "I'm stuck on this task. I need a backend service built for the shop and here is what it should do. " + sentence.repeat(n);
  const rows = [20, 56, 60, 80].map((n) => {
    const m = [U(msg(n))];
    const obs = at(m, { material: false });
    return { chars: msg(n).length, refs: stuckRefsOf(obs), a: run(m, { material: false }).decision.action };
  });
  ok('under and over 6000 characters: the same reading (shown, not their own work) and the same action', rows.some((r) => r.chars > 6000) && rows.some((r) => r.chars < 6000) && rows.every((r) => J(r.refs) === J(rows[0].refs) && r.a === rows[0].a) && rows[0].refs.includes('stuck.shown') && !rows[0].refs.includes('stuck.own_work'), J(rows));
  const later = [U(msg(80)), A(explanation(60)), U("I'm stuck")];
  ok('  a short "I\'m stuck" after that long message: not their paste either', !stuckRefsOf(at(later, { material: false })).includes('stuck.own_work'), J(stuckRefsOf(at(later, { material: false }))));
}

console.log('\n=== RF9: a correction (A.4: F7, F15, F19; D.14: N22) ===');
{
  const MONAD = 'In Haskell, a monad is a type with two operations, return and bind, that lets you chain computations which carry some context, such as possible failure or state, without writing the plumbing by hand each time.';
  const base = [u('What is a monad?'), a(MONAD)];
  const CORR_FIRE = [
    'Not that, I meant the Leibniz one', 'Thanks, but I meant the Leibniz one', 'Ok but I meant the Leibniz one', 'Right, but I meant the Leibniz one', 'Close, but I meant the Leibniz one', 'Oops, I meant the Leibniz one', 'Sorry, my bad. I meant the Leibniz monad',
    'Sorry, I should have been clearer. I meant Leibniz', "That's not what I'm asking", "that's not my question", "I didn't mean that", "I didn't ask about that", "I'm asking about Leibniz, not Haskell", "that's not it, I meant the philosophical one",
    'not quite, I meant the philosophical one', 'wrong one, I meant Leibniz', "You didn't answer my question", "That doesn't answer my question", 'I asked how to export them to a CSV file', 'My question was how to export to CSV', 'No, I asked about the philosophical one',
    "you still didn't answer the question", "No, I'm on a Mac", 'Actually I use a Mac', "That's for Windows. I have a Mac.", "I'm using macOS, not Windows", 'This is JavaScript, not Python', "No, I'm using Linux", "Actually I'm on Ubuntu",
  ];
  const CORR_QUIET = [
    'I mean yeah that makes sense', 'i mean thats fair', 'I mean sure, why not', "I mean you're right, thanks", 'I mean both work', 'I meant that as a compliment!', 'I meant it as a joke, relax', 'I meant every word.', 'No, I meant it, thank you so much!',
    'Not what I meant but honestly this is better', "No, I'm good", 'No, I have a question about something else', "No, I'm on it", 'Actually I have no idea', 'This is great, not too long', 'I asked my teacher about it and she said the same', 'My question was answered, thanks',
    "No, I'm fine thanks", 'Actually I have a follow-up question', 'I mean, thanks!', 'I asked about this in class yesterday',
  ];
  for (const t of CORR_FIRE) ok(`"${t}" after a reply → corrected`, has(at([...base, u(t)]), 'explicit.corrected'), J(codes(at([...base, u(t)]))));
  for (const t of CORR_QUIET) ok(`"${t}" after a reply → no corrected`, !has(at([...base, u(t)]), 'explicit.corrected'), J(codes(at([...base, u(t)]))));
  ok('none of them on a first message', CORR_FIRE.every((t) => !has(at([u(t)]), 'explicit.corrected')), J(CORR_FIRE.filter((t) => has(at([u(t)]), 'explicit.corrected'))));
  ok('under mr-2026.10.1: none', CORR_FIRE.every((t) => !has(at10([...base, u(t)]), 'explicit.corrected')));
  // the quiz they just accepted keeps its first question (F7)
  const quiz = [U('Explain photosynthesis'), A(explanation(60) + ' Want me to quiz you on it?'), U('I mean sure, why not')];
  const qr = run(quiz);
  ok('"I mean sure, why not" after "Want me to quiz you on it?" → no correction, ACS\'s question stands', !nowCodes(qr).includes('explicit.corrected') && qr.assist.questions === acsOf(quiz).questions && acsOf(quiz).questions >= 1, `${qr.trace} q=${qr.assist.questions}`);
  const mac = run([U('How do I free up disk space?'), A(WINDOWS), U("No, I'm on a Mac")]);
  ok('"No, I\'m on a Mac" after a Windows answer → the answer first, no question', mac.decision.trigger === 'ifr.explicit.corrected' && mac.assist.questions === 0, mac.trace);
}

console.log('\n=== RF10: "I know that" (A.5: F13, F20, F25; D.15: N23) ===');
{
  const base = [u('Explain loops.'), a(explanation(200))];
  const KNOW_FIRE = [
    'I know how loops work', 'I know how it works', 'I already know how for loops work', 'I know about loops', 'I know the theory', 'I know the concept', 'I know that part', 'I know that bit', 'I understand that part', 'I get that', 'I get that part', "I'm familiar with loops",
    "I'm already familiar with loops", "I'm not new to this", "I've done this before", 'No need to explain', "You don't need to explain loops", "I don't need the background", 'Skip the explanation', 'We went over this', 'Thanks, I know that part', 'Got it, I know that',
    'Right, but I know that already', 'Cool, I know that', 'You already said that', "You're repeating yourself", 'You already explained that', 'You keep repeating the same thing', 'I know, you said that already', 'Stop repeating yourself', 'we covered this in class',
  ];
  const KNOW_QUIET = [
    'I know that feeling', "I don't think we covered this", 'I know that now, thanks!', 'I know this now, thank you so much', 'Okay I know what photosynthesis means now', 'I am well aware now, thanks', "Yeah we covered that, but I still don't get the Calvin cycle.",
    'we covered this in class but I forgot how the Calvin cycle works', 'I know that already, but can you go over it again slowly?', "I get that you're busy", 'I know how you feel', "I've done this before but I forgot the steps", 'I know that thanks to you',
  ];
  for (const t of KNOW_FIRE) ok(`"${t}" after an explanation → knows_that`, has(at([...base, u(t)]), 'explicit.knows_that'), J(codes(at([...base, u(t)]))));
  for (const t of KNOW_QUIET) ok(`"${t}" after an explanation → no knows_that`, !has(at([...base, u(t)]), 'explicit.knows_that'), J(codes(at([...base, u(t)]))));
  ok('none of them after a reply that only asked', KNOW_FIRE.every((t) => !has(at([u('Explain loops.'), a('What do you know already?'), u(t)]), 'explicit.knows_that')));
  ok('under mr-2026.10.1: none', KNOW_FIRE.every((t) => !has(at10([...base, u(t)]), 'explicit.knows_that')));
  const forgot = run([...base, U('we covered this in class but I forgot how the Calvin cycle works')]);
  ok('"…but I forgot" → no "THEY KNOW THE BACKGROUND" line, and the reaction is not knewIt', !forgot.block.includes('THEY KNOW THE BACKGROUND') && forgot.state.react?.knewIt === false, `${forgot.trace} ${J(forgot.state.react)}`);
}

console.log('\n=== RF11: a question asked for what was already said (A.6: F8, F16) ===');
{
  const asked = [u('my laptop is slow'), a('Which operating system are you on?')];
  const SAID_FIRE = ['I told you', 'I told you already', 'I told you, Windows 11', 'I said Windows 11', 'I said that already', 'I already said Windows 11', 'I already told you Windows 11', 'I literally just said that', "You've already asked me that", 'You keep asking me the same thing', 'I already answered that question', 'See above', 'Read my first message', 'ugh I told you already'];
  const SAID_QUIET = ['I said no', 'I said, look, I need time', 'I told you about my sister', 'I said yes'];
  for (const t of SAID_FIRE) ok(`"${t}" after an asking reply → redundant_question`, has(at([...asked, u(t)]), 'observed.redundant_question'), J(codes(at([...asked, u(t)]))));
  for (const t of SAID_QUIET) ok(`"${t}" after an asking reply → no redundant_question`, !has(at([...asked, u(t)]), 'observed.redundant_question'), J(codes(at([...asked, u(t)]))));
  const DID_YOU = [
    ['That sounds frustrating. Have you mentioned it to HR?', ['I already mentioned it, but nothing changed.', 'Yes, I already mentioned it.']],
    ['Have you answered the email yet?', ['I already answered.', 'I already answered, I am waiting on them.', 'Yes I already answered it.']],
    ['Did you tell your partner how you feel?', ['I already said it.']],
  ];
  for (const [q, as] of DID_YOU) for (const t of as) ok(`"${q}" → "${t}": the answer to their question, no redundant_question`, !has(at([u('my manager keeps ignoring me'), a(q), u(t)]), 'observed.redundant_question'), J(codes(at([u('my manager keeps ignoring me'), a(q), u(t)]))));
  ok('"I already mentioned it" after a question about something else → redundant_question', has(at([u('my manager keeps ignoring me, I mentioned it to HR'), a('How long has this been going on?'), u('I already mentioned it')]), 'observed.redundant_question'));
  ok('under mr-2026.10.1: none', SAID_FIRE.every((t) => !has(at10([...asked, u(t)]), 'observed.redundant_question')));
}

console.log('\n=== RF12: brevity asked in other words (D.19: N27) ===');
{
  for (const t of ['Please keep all your answers short from now on. What is TCP?', 'Be brief. What is TCP?', 'please be concise', 'Can you be succinct?', 'be brief please']) {
    const s = get(at([u(t)]), 'explicit.shorter');
    ok(`"${t}" → explicit.shorter for the conversation (no length.once), and nothing under 10.1`, s && !refCodes(s).includes('length.once') && !has(at10([u(t)]), 'explicit.shorter'), J([s, codes(at10([u(t)]))]));
  }
  for (const t of ['Help me be concise in my cover letter', 'I want to be brief', 'How do I be concise in interviews?', 'My teacher said be concise', 'be short with him', 'I need to be brief in my speech'])
    ok(`"${t}" → no explicit.shorter`, !has(at([u(t)]), 'explicit.shorter'), J(codes(at([u(t)]))));
  const TCP = Array.from({ length: 30 }, () => 'TCP is a connection oriented protocol that guarantees ordered delivery of bytes between two hosts.').join(' ');
  const r = run([U('Be brief. What is TCP?'), A(TCP), U('And UDP?')]);
  ok('"Be brief", a 300-word reply, then the next turn: the ceiling holds and the long reply is a control_violation', r.ceiling === 360 && [...r.integrity, ...r.state.integrity].some((f) => f.code === 'control_violation'), `${r.trace} ${J(r.state.integrity.map((f) => f.code))}`);
}

console.log('\n=== RF13: the readers stay cheap ===');
{
  const reply = (i) => Array.from({ length: 48 }, (_, j) => EXPLAIN_SENTENCE.replace('derivative', `idea ${i} ${j}`)).join(' ') + ' What do you get for the next step?';
  const said = ["I'm stuck, can you go over it?", 'still stuck', 'ok what about the next part of the proof, why does it hold?', "I don't know what to do", 'Thanks, but I meant the second case', 'I know how loops work', 'It still does not work', 'I told you already'];
  const msgs = [];
  for (let i = 0; i < 30; i++) msgs.push(u(`${said[i % said.length]} ${i}`), a(reply(i)));
  msgs.push(u("I'm stuck"));
  const t0 = Date.now();
  const turns = M.turnsOf(msgs);
  turns.forEach((_, k) => M.observeTurn(turns, k, { params, material: false }));
  const ms = Date.now() - t0;
  ok(`30 turns with 1000-word replies, every turn observed under 11.1 in ${ms} ms (< 1500)`, ms < 1500, ms);
}

// ── REVIEW FIXES — readers (2) and measures ─────────────────────────
// The second set of reader fixes (fix plan A.2, A.7–A.11, D.1's Branch A,
// D.9, D.10, D.12, D.13) and the measures that live in lib/mr/ifr.ts (C.2,
// C.5, C.7, C.11, C.12, D.10, D.11): each reproduction as a fire or
// must-not-fire fixture, with the near-misses a fix could newly catch, and
// the 10.1 pin unchanged on every reading.
const openOf = (messages, ctx = {}) => get(at(messages, ctx), 'observed.open_request');
const reactOf = (messages, ctx = {}) => {
  const turns = M.turnsOf(messages);
  const k = turns.length - 1;
  return M.reactionAt(turns, k, { params, ...ctx }, M.observeTurn(turns, k, { params, ...ctx }));
};

console.log('\n=== RF14: what they point at, handed over in the same message (A.2: F2, F24) ===');
{
  const HANDED = [
    'Answer this question: what is the capital of France?', 'Help with this question: why is the sky blue?', 'Help me with this question, why do cats purr?', 'Solve this equation: x squared equals four',
    'Solve this problem: a train leaves at noon going east', 'Fix this bug: the submit button does nothing', 'Fix this code: print hello world', 'Check this sentence: their going to the park',
    'Debug this function: def f(x): return x', 'I need help with this assignment: write about a hero', 'Can you solve this riddle: what has keys but no locks?', 'Explain this proof: root two is irrational',
    'Explain this error: TypeError undefined is not a function', 'Explain this error — undefined is not a function', 'Explain this error - undefined is not a function', 'Solve this equation please: x squared minus x equals zero',
    'Help me with this problem.\nA ball is thrown upward at ten metres per second.', 'Can you explain this?\nPhotosynthesis converts light into chemical energy.',
  ];
  const CHEER = ["Let's do this!", 'I can do it!', 'You can do it!', 'We can do this', "Let's start this", "Let's do it", "We'll do it"];
  for (const t of [...HANDED, ...CHEER]) ok(`"${t.replace(/\n/g, '\\n')}" first, nothing on screen → no open_request`, !openOf([u(t)], { material: false }), J(codes(at([u(t)], { material: false }))));
  const POINTER = [
    "Why isn't this working?", 'Why is it not working?', 'Why is this not working?', "Why doesn't this work?", "Why won't it work?", 'Why does it keep crashing?', 'Can you help me with this?', 'Help me with this', 'help me out with it please',
    'Can you look at this?', 'Can you review this?', 'Can you summarise this?', 'Summarize this', 'Can you proofread this?', 'Proofread this', 'Can you check this?', 'Could you check this for me?',
    // near-misses the hand-over test must not eat: one word after the comma is not the thing
    'How do I fix this, please?', 'Can you check this, thanks?',
  ];
  for (const t of POINTER) {
    const o = openOf([u(t)], { material: false });
    ok(`"${t}" first, nothing on screen → missing referent`, o && J(refCodes(o)) === J(['request.open', 'request.first', 'request.missing_referent', 'request.nothing_shown']), J(codes(at([u(t)], { material: false }))));
  }
  for (const t of ['Can you look at this later?', "Let's look at this together", "Why isn't this working out for me?", 'Can you help me with my essay?'])
    ok(`"${t}" → no missing referent`, !refCodes(openOf([u(t)], { material: false })).includes('request.missing_referent'), J(codes(at([u(t)], { material: false }))));
  for (const t of ["Why isn't this working?", 'Can you check this?']) {
    ok(`"${t}" with something on screen, or the screen unknown → none`, !openOf([u(t)], { material: true }) && !openOf([u(t)]));
    ok(`"${t}" as their second message → none`, !openOf([u('My laptop keeps restarting.'), a(WINDOWS), u(t)], { material: false }));
    ok(`"${t}" under mr-2026.10.1 → none`, !has(at10([u(t)], { material: false }), 'observed.open_request'));
  }
  const r = run([U("Why isn't this working?")], { material: false });
  ok('"Why isn\'t this working?" with nothing on screen → the missing-referent diagnose', r.fresh.some((d) => d.trigger === 'ifr.observed.open_request') && /WHAT THEY POINT AT IS NOT IN THE CONVERSATION/.test(r.block), `${r.trace} ${r.block}`);
  const h = run([U('Solve this equation: x squared equals four')], { material: false });
  ok('"Solve this equation: x squared equals four" → no diagnose, no "not in the conversation" line', !h.fresh.some((d) => d.trigger === 'ifr.observed.open_request') && !/NOT IN THE CONVERSATION/.test(h.block), `${h.trace} ${h.block}`);
}

console.log('\n=== RF15: the open request, Branch A (A.9: F11, F22, F23, F31; D.1: N5; D.12: N19) ===');
{
  const LIMITS = ["Why can't science solve everything?", "Why can't computers do everything?", "Why doesn't medicine fix everything?", "Why can't technology fix everything?", "How come computers can't do everything?", "Why can't AI do everything?", "Why can't software do everything?"];
  const TAILS = [
    'why is AI not solving problems, no questions', "Why can't AI do anything useful, just answer", "why isn't tech fixing anything, don't ask me anything", "Why don't governments fix anything, please explain in detail",
    'Why is AI not solving problems, tell me straight', 'Why is AI not solving problems, give me the full picture', "Why doesn't software ever change things, go deep", 'Why is AI not solving problems, skip the questions',
    'Why is AI not solving problems, in detail?', 'Why is AI not solving problems, explained in depth?', 'Why is AI not solving problems, in 500 words?', 'Why is AI not solving problems, give me a thorough answer?',
    'Why is AI not solving problems, step by step?', 'Why is AI not solving problems, with examples?', 'Why is AI not solving problems, in full?', 'Why is AI not solving problems - long answer please',
    'Why is AI not solving problems, no questions please?', 'Why is AI not solving problems, just answer?', 'Why is AI not solving problems, be thorough?',
  ];
  // by decision: their own case, served by an answer with its assumptions stated (and the things that are as often theirs)
  const OWN_CASE = ['Why is my team not productive?', 'How do I fix my sleep?', "Why isn't my business growing?", "Why aren't our sales improving?", "Why isn't AI working for me?", "Why isn't the internet working?", "Why doesn't the medicine work?", "Why don't people help?", "Why aren't people working?", 'Why is AI not solving problems like people expected?'];
  for (const t of [...LIMITS, ...TAILS, ...OWN_CASE]) {
    const quiet = !openOf([u(t)]) && !openOf([u(t)], { material: false });
    ok(`"${t}" → no open_request`, quiet, J(codes(at([u(t)], { material: false }))));
  }
  const r = run([U('Why is AI not solving problems, no questions')]);
  ok('"…, no questions" → no "Then ask the single question" and no ceiling', !/Then ask the single question/.test(r.block) && r.ceiling === null, `${r.trace} ${r.block}`);
  const WIDER = [
    "Why hasn't AI solved any problems?", "Why hasn't technology fixed anything?", "Why haven't governments done anything?", "Why hasn't AI changed anything?", 'Why has AI not solved real problems?', "Why hasn't AI delivered anything?",
    'Why are AI tools not solving problems?', 'Why are AI models not solving problems?', 'Why is AI not solving complex problems?', 'Why is AI not solving bigger problems?', "Why isn't AI solving the world's problems?",
    'Why is AI not solving problems in general?', 'Why is AI not solving problems at scale?', 'Why is AI not solving problems people care about?', 'Why is AI not solving problems for businesses?',
    "Why isn't AI working?", "Why doesn't AI work?", 'Why is AI not helping?', "Why isn't AI useful?", "Why isn't AI more useful?", "Why hasn't AI helped anyone?", "Why isn't education working?", 'Why is healthcare not improving?',
  ];
  for (const t of WIDER) ok(`"${t}" → open_request`, J(refCodes(openOf([u(t)]))) === J(['request.open', 'request.first', 'request.broad_subject', 'request.vague_outcome']), J(codes(at([u(t)]))));
  for (const t of [Q, "Why isn't AI working?"]) {
    ok(`"${t}" with a document or a photo on their screen → none (N5)`, !openOf([u(t)], { material: true }), J(codes(at([u(t)], { material: true }))));
    ok(`  …and with nothing on screen, or unknown (a replay) → read`, !!openOf([u(t)], { material: false }) && !!openOf([u(t)]));
    ok('  under mr-2026.10.1 → none', !has(at10([u(t)]), 'observed.open_request'));
  }
  const d = run([U(Q)], { material: true });
  ok('the networking question with a document on screen → no decision and no ceiling (MR changes nothing)', d.decision.action === 'none' && d.ceiling === null && d.block === '', `${d.trace} ${d.block}`);
  // after the first turn: a new topic, and nothing but chit-chat before it
  const MIDTHREAD = [
    [U('We tried an AI chatbot for our helpdesk tickets and it keeps giving wrong answers.'), A('That usually comes from thin training data: if past tickets are not labelled with their resolution, the bot has little to learn from. Start by tagging a few hundred resolved tickets with their category and fix.'), U("Why can't AI do anything useful?")],
    [U('Our hospital rolled out an AI triage tool last month and the nurses hate it.'), A('Adoption problems like that usually come from the tool adding clicks to an already busy workflow, or from alerts the nurses do not trust. Ask them which step it slows down.'), U('Why is AI not solving problems?')],
    [U('I run a small bakery and I tried using some scheduling tools for my staff.'), A('Scheduling tools work best when you give them hard constraints up front: opening hours, who can work which shifts, and how many people each shift needs.'), U('Why is technology not solving real problems?')],
    [U('My company spent a fortune on machine learning and got nothing out of it.'), A('That is common: most of the cost goes into data cleaning and integration, and projects stall before a model reaches production. What was the model supposed to do?'), U('Why is machine learning not solving real-world problems?')],
    [U('our support bot keeps giving customers the wrong refund amounts'), A('The model is probably missing your refund policy in its context. Add the policy document to the retrieval index and tell it to quote the policy line it used.'), U("Why can't AI do anything useful?")],
    [U('our hospital still faxes lab results between departments'), A('Many hospitals keep fax because the record systems in each department cannot exchange data, and replacing them is expensive and slow to certify.'), U('why isnt tech fixing anything')],
  ];
  for (const m of MIDTHREAD) {
    const r2 = run(m);
    ok(`after "${m[0].content.slice(0, 44)}…", "${m[2].content}" → no open_request, no diagnose`, !has(at(m), 'observed.open_request') && !r2.fresh.some((x) => x.trigger === 'ifr.observed.open_request'), `${J(codes(at(m)))} ${r2.trace}`);
  }
  ok('the helpdesk-chatbot follow-up is not even a new topic (AI and chatbots are one broad subject)', !has(at(MIDTHREAD[0]), 'observed.new_topic'), J(codes(at(MIDTHREAD[0]))));
  for (const hi of ['hi', 'hello there', 'Hey, how are you?']) {
    const o = openOf([u(hi), a('Hi! What can I help you with today?'), u(Q)]);
    ok(`"${hi}", a reply, then the networking question → open_request (request.new_topic)`, o && refCodes(o).includes('request.new_topic'), J(codes(at([u(hi), a('Hi! What can I help you with today?'), u(Q)]))));
  }
  ok('M.OPEN_REQUEST is anchored at the end: the question alone yes, with a clause after the comma no', M.OPEN_REQUEST.test(Q) && M.OPEN_REQUEST.test('Why is AI not solving problems yet?') && !M.OPEN_REQUEST.test('Why is AI not solving problems, no questions'));
}

console.log('\n=== RF16: a new topic, and a follow-up that is not one (A.10: F6, F31, F40; D.13: N21) ===');
{
  const FOLLOW = [
    ['Why is the sky blue?', 'Sunlight scatters off the molecules in the air, and shorter blue wavelengths scatter far more than red ones, so blue light reaches your eyes from every direction of the sky.', [
      'Can you give an example?', 'Why?', 'How so?', 'Then why are sunsets red?', 'What about on Mars?', 'Is that why the ocean looks blue too?', 'Can you explain it more simply?', 'Could you make that shorter?', 'Can you put that in bullet points?', 'What would a physicist say?',
      'Is this on the exam?', 'Who discovered that?', 'Wait, really?', 'Can you show me a diagram?', 'How do we know?', 'What does wavelength mean?', 'So at night what happens?', 'Could you rephrase that for a 10 year old?', 'What else should I read about this?', 'Can you quiz me on this?']],
    ['How do I make sourdough starter?', 'Mix equal weights of flour and water in a jar, cover it loosely, and keep it at room temperature. Each day, discard half and feed it fresh flour and water. After about a week it should bubble reliably and double after feeding.', [
      'How long until I can bake with it?', 'What kind of jar should I use?', 'Can I use whole wheat?', 'What if mine smells like nail polish?', 'Do I need to refrigerate it?', 'Can you write that as a checklist?', 'What temperature is best?', 'Thanks! What should I bake first?', 'How do I know when it is ready?', 'Can I give some to my friend?']],
    ['Help me write an email to my landlord about a broken heater.', 'Subject: Broken heater in flat 4B\n\nDear Mr Smith,\n\nThe heater in my flat stopped working on Monday. Could you arrange a repair this week? I am home most afternoons.\n\nThanks,\nAlex', [
      'Can you make it more polite?', 'Make it shorter', 'Can you add that I have a baby at home?', 'Should I send it today or wait?', 'How do I mention the deadline?', 'Can you translate it into Spanish?', 'Is it okay to cc his wife?', 'What if he ignores it?']],
    ['def add(a, b): return a + b -- why does add("1", 2) fail?', 'In Python, "1" is a string and 2 is an integer, and the + operator cannot combine those types, so it raises a TypeError. Convert first, e.g. int("1") + 2.', [
      'What about JavaScript?', 'Can you show me how to handle the error?', 'Should I use type hints?', 'How do I write a test for it?', 'Is there a linter that catches this?']],
  ];
  for (const [q, r, fs] of FOLLOW) for (const f of fs) {
    const m = [u(q), a(r), u(f)];
    ok(`"${f}" (after "${q.slice(0, 30)}…") → no new_topic, and react.newTopic false`, !has(at(m, { material: false }), 'observed.new_topic') && reactOf(m)?.newTopic === false, J(codes(at(m, { material: false }))));
  }
  const WIFI = [U('My laptop wifi keeps dropping every few minutes.'), A('Wi-Fi drops usually come from interference or a power-saving setting on the adapter. Open Device Manager, find the adapter, and untick "Allow the computer to turn off this device to save power". If that does not help, move the router to channel 1, 6 or 11.')];
  for (const f of ['just tell me how to fix it', 'can you explain that in more detail?', 'Is that safe to do?', 'Why would that help?', 'How long does that take?', 'Does that work on a Mac too?', 'What if I have no admin rights?']) {
    const r = run([...WIFI, U(f)]);
    ok(`"${f}" after the wifi explanation → react.newTopic false, no observed.new_topic`, r.state.react?.newTopic === false && !nowCodes(r).includes('observed.new_topic'), `${J(r.state.react)} ${J(nowCodes(r))}`);
  }
  const un = run([...WIFI, U('Unrelated: how do I make sourdough starter?')]);
  ok('"Unrelated: how do I make sourdough starter?" → react.newTopic true and observed.new_topic', un.state.react?.newTopic === true && nowCodes(un).includes('observed.new_topic'), `${J(un.state.react)} ${J(nowCodes(un))}`);
  ok('  the measure is the same under the 10.1 pin, which observes no new topic', run([...WIFI, U('Unrelated: how do I make sourdough starter?')], { env: { LOGOS_MR_POLICY: PV10 } }).state.react?.newTopic === true && !nowCodes(run([...WIFI, U('Unrelated: how do I make sourdough starter?')], { env: { LOGOS_MR_POLICY: PV10 } })).includes('observed.new_topic'));
  // same-thread follow-ups keep the question hold (N21)
  const base = [U('my laptop is slow'), A('Which operating system are you on?'), U('I already told you, Windows 11'), A('Then open Task Manager, look at the Startup tab and turn off the apps you do not need at login.')];
  for (const t of ['what about the fan noise?', 'and on my other PC?', 'How do I do that?', 'where is that tab?', 'and if that does not help?', 'Which ones are safe to turn off?', 'what else can I try?', 'is it the same on a Mac?', 'can you redo that but skip the history section']) {
    const r = run([...base, U(t)]);
    ok(`"${t}" → no new topic, redundant_question still active, no question`, !nowCodes(r).includes('observed.new_topic') && rec(r, 'ifr.observed.redundant_question')?.status === 'active' && r.assist.questions === 0, `${J(nowCodes(r))} ${rec(r, 'ifr.observed.redundant_question')?.status} q=${r.assist.questions}`);
  }
  const moved = at([u('how do I convert 5 miles to km'), a('Multiply by 1.609: about 8 km.'), u(Q)]);
  ok('the spec\'s case still a new topic: "how do I convert 5 miles to km", a reply, then the networking question', has(moved, 'observed.new_topic'), J(codes(moved)));
  // a stuck message is about the work in hand, so the stuck window reaches the task before it (R1's known miss)
  ok('"I\'m stuck, what would you do in my place?" after a maths exchange → not a new topic, read as stuck', !has(at([...QUADRATIC, u("I'm stuck, what would you do in my place?")]), 'observed.new_topic') && has(at([...QUADRATIC, u("I'm stuck, what would you do in my place?")]), 'explicit.stuck'), J(codes(at([...QUADRATIC, u("I'm stuck, what would you do in my place?")]))));
  ok('M.newTopicAt: the same reading asked twice of the same turn', (() => { const t = M.turnsOf([...WIFI, U('Unrelated: how do I make sourdough starter?')]); return M.newTopicAt(t, 1) === true && M.newTopicAt(t, 1) === true && M.newTopicAt(t, 0) === false; })());
}

console.log('\n=== RF17: the same question asked again (A.7: F9, F21; D.10: N12) ===');
{
  const SAME_SHAPE = {
    'two different equations, same-shaped tutoring question': [
      u('Help me solve 4x + 8 = 20, I want to understand it.'), a('Subtract 8 from both sides to get 4x = 12. Now, what number do you get when you divide both sides by 4?'), u('3'),
      a('Yes, x = 3. Try another: 5x - 10 = 15. Add 10 to both sides to get 5x = 25. What number do you get when you divide both sides by 5?'), u('5'),
    ],
    'two different words, vocab tutoring': [
      u('Help me learn some Spanish verbs.'), a('Let us start with comer, to eat. How would you say I eat in Spanish, using the first person form?'), u('como'),
      a('Perfect. Next, vivir, to live. How would you say I live in Spanish, using the first person form?'), u('vivo'),
    ],
    'code review, different functions': [
      u('Can you review my functions one at a time? First: def area(r): return 3.14*r*r'), a('It works, but use math.pi instead of 3.14 for precision. What should happen when the radius passed in is negative?'),
      u('Second one: def sqrt_safe(x): return x**0.5'), a('Same idea: x**0.5 on a negative gives a complex number. What should happen when the value passed in is negative?'), u('Raise ValueError I guess'),
    ],
  };
  for (const [name, m] of Object.entries(SAME_SHAPE)) {
    const r = run(m.map((x) => (x.role === 'user' ? U(x.content) : A(x.content))));
    ok(`${name} → no repeated_question, no "THE QUESTIONS HAVE NOT BEEN HELPING"`, !has(at(m), 'observed.repeated_question') && !/THE QUESTIONS HAVE NOT BEEN HELPING/.test(r.block), `${J(codes(at(m)))} ${r.trace}`);
  }
  // the digits count even with no practice in force
  const byFour = (n) => [u('How do I solve these?'), a('Start with 4x = 12. What number do you get when you divide both sides by 4?'), u('3'), a(`Good. Now 5x = 25. What number do you get when you divide both sides by ${n}?`), u('5')];
  ok('"…divide both sides by 4?" then "…by 5?" with no practice → no repeated_question', !has(at(byFour(5)), 'observed.repeated_question'), J(codes(at(byFour(5)))));
  ok('  "…by 4?" asked again → repeated_question (the near-miss stays read)', has(at(byFour(4)), 'observed.repeated_question'), J(codes(at(byFour(4)))));
  ok('a re-ask with words added ("…are you using right now?") is still the same question', has(at(R8b), 'observed.repeated_question'));
  // word for word, after their answer: a re-ask (N12)
  const Q1 = 'Which version of Python are you running on that machine?';
  const verbatim = [u('python keeps crashing on my laptop'), a(Q1), u('3.12'), a(Q1), u('I just said, 3.12')];
  ok('a short asking reply said again word for word after their answer → repeated_question', has(at(verbatim), 'observed.repeated_question'), J(codes(at(verbatim))));
  const vr = run(verbatim.map((x) => (x.role === 'user' ? U(x.content) : A(x.content))));
  ok('  …and the hold on questions follows (fewer questions)', vr.fresh.some((d) => d.trigger === 'ifr.observed.redundant_question'), vr.trace);
  ok('  re-sent: the same message, the same reply → none', !has(at([u('python keeps crashing on my laptop'), a(Q1), u('python keeps crashing on my laptop'), a(Q1), u('3.12')]), 'observed.repeated_question'));
  const LONGQ = explanation(60) + ' ' + Q1;
  ok('  a long reply said again word for word (over 40 words) → none (a re-send)', !has(at([u('python keeps crashing on my laptop'), a(LONGQ), u('3.12'), a(LONGQ), u('3.12 as I said')]), 'observed.repeated_question'));
  ok('  under mr-2026.10.1 → none', !has(at10(verbatim), 'observed.repeated_question'));
  // repeated_background keeps its exclusion of an identical reply (fixture repetition)
  const same = S1 + ' ' + S2 + ' Most of the rest is change management.';
  ok('repeated_background still leaves an identical reply out', !has(at(R9(undefined, same, same)), 'observed.repeated_background'));
  // KNOWN MISS (F21): a paraphrase with other words is not read; the transcript-level reading is a word count, not a meaning
  const para = [u('my laptop is slow'), a('Which operating system are you using?'), u('Windows 11'), a('Understood. What OS are you on?'), u('Windows 11, like I said')];
  ok('known miss: "What OS are you on?" after "Which operating system are you using?" → no repeated_question', !has(at(para), 'observed.repeated_question'), J(codes(at(para))));
}

console.log('\n=== RF18: their re-ask after a long reply (A.8: F10, F18) ===');
{
  const WHAT = [u('What is a Roth IRA?'), a(LONG300)];
  const WHY = [u('Why does my car click when I turn the key?'), a(LONG300)];
  for (const [h, t] of [[WHAT, 'Sure, how do I start it?'], [WHAT, 'Thanks, how do I do that?'], [WHAT, 'Ok how do I start it?'], [WHAT, 'Yeah, how do I use it?'], [WHAT, 'Cool, how do I use it?'], [WHY, 'ok how do I fix it?'], [WHY, 'Got it, how do I fix it?']])
    ok(`after "${h[0].content}" (300 words), "${t}" → no late_answer`, !has(at([...h, u(t)]), 'observed.late_answer'), J(codes(at([...h, u(t)]))));
  for (const t of ['ok how do I do it?', 'Sure, how do I start it?', 'but how do I actually fix it?'])
    ok(`after a how-to ("How do I make my resume stand out?", 300 words), "${t}" → late_answer`, has(at([R10[0], R10[1], u(t)]), 'observed.late_answer'), J(codes(at([R10[0], R10[1], u(t)]))));
  const PY = [u('Should I learn Python or JavaScript first?'), a(LONG300)];
  const REASKED = [
    'So which one should I pick?', 'So which should I choose?', 'Which one then?', 'Ok, so which one do I start with?', 'So which is better?', "What's the short answer?", 'Bottom line?', 'So is it yes or no?', 'So should I learn Python or not?',
    "So what's your recommendation?", 'What would you recommend?', 'So what do you suggest?', "So what's the verdict?", 'So the answer is?', 'And the answer is?', "You still didn't answer my question", "You didn't really answer my question",
    "That didn't answer my question", 'Can you just answer the question?',
    // (integration: "so which one is it?" was a documented miss)
    'So which one is it?', 'which one is it then?',
  ];
  for (const t of REASKED) ok(`"${t}" after a 300-word reply → late_answer`, has(at([...PY, u(t)]), 'observed.late_answer'), J(codes(at([...PY, u(t)]))));
  for (const t of ['Which one is best for video editing?', 'What would you recommend for a beginner on a budget?', 'Which is better for data science?', 'So should I learn Python or JavaScript if I want to build websites?', 'Which one is it, the first or the second?', 'Which one is it for web apps?'])
    ok(`"${t}" after a 300-word reply → no late_answer (more said: a new request)`, !has(at([...PY, u(t)]), 'observed.late_answer'), J(codes(at([...PY, u(t)]))));
  ok('"So which one should I pick?" after a 120-word reply → none', !has(at([PY[0], a(explanation(120)), u('So which one should I pick?')]), 'observed.late_answer'));
  ok('under mr-2026.10.1 → none', !has(at10([...PY, u('So which one should I pick?')]), 'observed.late_answer'));
  ok('"So which one is it?" after a 120-word reply → none; under mr-2026.10.1 → none', !has(at([PY[0], a(explanation(120)), u('So which one is it?')]), 'observed.late_answer') && !has(at10([...PY, u('So which one is it?')]), 'observed.late_answer'));
}

console.log('\n=== RF19: the same material asked for in another form (A.11: F5) ===');
{
  const V = [
    'Vaccines train the immune system by showing it a harmless piece or copy of a germ before the real infection ever arrives.',
    'The body responds by making antibodies and memory cells that recognise that specific germ the next time it appears.',
    'If the real germ shows up later, those memory cells react within hours instead of days, so the illness is milder or never starts.',
    'Boosters remind the immune system, topping up memory cells whose numbers slowly fall over the following months and years.',
  ];
  const FULLV = V.join(' ');
  const CASES = {
    'Can you put that in bullet points?': '- ' + V.join('\n- '),
    'Can you explain it more simply?': 'Think of it as a practice run. ' + V.slice(0, 3).join(' '),
    'Can you make that shorter?': V.slice(0, 3).join(' '),
    'Can you bold the key terms?': V[0].replace('immune system', '**immune system**') + ' ' + V[1].replace('antibodies', '**antibodies**') + ' ' + V[2] + ' ' + V[3],
    'Can you compare that with how antibiotics work?': V[0] + ' ' + V[1] + ' Antibiotics, by contrast, kill bacteria directly or stop them multiplying, and they do nothing against viruses.',
    'Can you rephrase that?': V[0] + ' ' + V[1] + ' ' + V[2],
    'Could you put it in a table?': V[0] + ' ' + V[1] + ' ' + V[3],
  };
  for (const [ask, reply] of Object.entries(CASES)) {
    const m = [u('How do vaccines work?'), a(FULLV), u(ask), a(reply), u('Thanks!')];
    ok(`"${ask}" and the reformatted reply → no repeated_background, no SHORT ceiling`, !has(at(m), 'observed.repeated_background') && !run(m.map((x) => (x.role === 'user' ? U(x.content) : A(x.content)))).fresh.some((d) => d.trigger === 'ifr.observed.repeated_background'), J(codes(at(m))));
  }
  const next = [u('How do vaccines work?'), a(FULLV), u('And what about mRNA vaccines specifically?'), a(V[0] + ' ' + V[1] + ' mRNA vaccines do this by giving your cells instructions to make a harmless spike protein for a short time.'), u('Interesting.')];
  ok('a new question answered with the same two sentences again → repeated_background (the near-miss stays read)', has(at(next), 'observed.repeated_background'), J(codes(at(next))));
  // a list, a table, a chart or an outline counts only as the form asked for, never as a thing named (integration review)
  const SHAPES = {
    'Make me a quick checklist of that.': '- ' + V.slice(0, 3).join('\n- '),
    'Can you list them?': '1. ' + V.slice(0, 3).join('\n2. '),
    'Put it into a numbered list.': '1. ' + V.slice(0, 3).join('\n2. '),
    'Can you tabulate that?': V[0] + ' ' + V[1] + ' ' + V[2],
    'Format it as a checklist.': '- ' + V.slice(0, 3).join('\n- '),
    'Compare them side by side.': V[0] + ' ' + V[1] + ' ' + V[3],
  };
  for (const [ask, reply] of Object.entries(SHAPES)) {
    const m = [u('How do vaccines work?'), a(FULLV), u(ask), a(reply), u('Thanks!')];
    ok(`"${ask}" and the reshaped reply → no repeated_background`, !has(at(m), 'observed.repeated_background'), J(codes(at(m))));
  }
  const DB1 = 'Database queries slow down when the table has no index on the columns you filter by, so the engine has to read every row to find the matches.';
  const DB2 = 'As the table grows, that full scan grows with it, which is why a query that was instant last year now takes seconds.';
  for (const [ask, tail] of [
    ['What about my orders table?', 'For orders, the usual filter is customer_id plus a date range.'],
    ['What format should the dates be in?', 'Dates are best stored as a proper timestamp type rather than as text.'],
    ['How do I add a column to the list of filters?', 'Adding a column to the filter changes which index the planner can use.'],
  ]) {
    const m = [u('Why are my Postgres queries getting slow?'), a(`${DB1} ${DB2} Most of the rest is tuning.`), u(ask), a(`${DB1} ${DB2} ${tail}`), u('how long would that take?')];
    ok(`"${ask}" names a table, a list or a format (asks for none) → background said again is read`, has(at(m), 'observed.repeated_background'), J(codes(at(m))));
  }
}

console.log('\n=== RF20: the measures (C.2, C.5, C.7, C.11, C.12; D.10, D.11: F37, F41, F43, F47, F48, N12, N13) ===');
{
  // replyEchoes is raw: an identical earlier reply is the most repetition there is (C.2, F37)
  const TWO = S1 + ' ' + S2;
  ok('M.replyEchoes: an identical whole reply → every sentence repeated', M.replyEchoes(TWO, [TWO]).repeatedSentences === 2, J(M.replyEchoes(TWO, [TWO])));
  const QR = 'Which version of Python are you running on that machine?';
  ok('  an identical asking reply → repeatedQuestion true', M.replyEchoes(QR, [QR]).repeatedQuestion === true);
  ok('  skipIdentical leaves them out (for a caller that must treat them as re-sends)', J(M.replyEchoes(TWO, [TWO], {}, { skipIdentical: true })) === J({ repeatedSentences: 0, repeatedQuestion: false }));
  ok('  a question three replies back counts (the measure looks back three; the reader two)', M.replyEchoes(QR, ['Thanks.', 'Got it.', QR]).repeatedQuestion === true && M.replyEchoes(QR, ['Thanks.', 'Got it.', 'Fine.', QR]).repeatedQuestion === false);
  ok('  digits count in a question: "…by 4?" and "…by 5?" are two questions', M.replyEchoes('What number do you get when you divide both sides by 5?', ['What number do you get when you divide both sides by 4?']).repeatedQuestion === false && M.replyEchoes('What number do you get when you divide both sides by 4?', ['What number do you get when you divide both sides by 4?']).repeatedQuestion === true);
  const asked = [U('my script will not run'), A(QR), U('3.12'), A(QR)];
  const r = run([...asked.slice(0, 3)]);
  const m = M.measureReply(r, QR);
  ok('measureReply of a word-for-word re-ask → repeatedQuestion true', m && m.repeatedQuestion === true, J(m));
  ok('reactionAt after a word-for-word re-ask → clarified "no"', reactOf([u('my script will not run'), a(QR), u('3.12'), a(QR), u('ok')])?.clarified === 'no', J(reactOf([u('my script will not run'), a(QR), u('3.12'), a(QR), u('ok')])));
  ok('  …and "yes" when the reply since moved on', reactOf([u('my script will not run'), a(QR), u('3.12'), a('Then install the requests package with pip and run it again.'), u('ok')])?.clarified === 'yes');
  // an attempt only where one can be made (C.5, F41)
  const OS = [u('My laptop wifi keeps dropping every few minutes.'), a('Wi-Fi drops usually come from interference or a power-saving setting on the adapter. Which operating system is the laptop running?')];
  for (const t of ['Windows 11', 'I already told you, Windows 11 on my laptop']) {
    const x = reactOf([...OS, u(t)]);
    ok(`"${t}" answering a diagnostic question → attempt false, independent none`, x && x.attempt === false && x.independent === 'none', J(x));
  }
  const py = reactOf([u('my script will not run'), a('Which version of Python are you running on that machine?'), u('3.12')]);
  ok('"3.12" answering "Which version of Python…?" → attempt false', py && py.attempt === false && py.independent === 'none', J(py));
  const tryIt = reactOf([u('what is 7 x 9?'), a('Try it yourself first: what do you get?'), u('63')]);
  ok('"63" after "Try it yourself first" (the answer held back) → attempt true, independent attempt', tryIt && tryIt.attempt === true && tryIt.independent === 'attempt', J(tryIt));
  const eq = reactOf([u('Solve 2x + 3 = 11'), a('Subtract 3 from both sides first. What do you get?'), u('2x = 8')]);
  ok('"2x = 8" on a maths turn → attempt true', eq && eq.attempt === true, J(eq));
  ok('  a verdict of the engine makes it a maths turn: "12" with a verdict → attempt true', reactOf([u('quick sum'), a('What is 7 + 5?'), u('12')], { verdicts: [{ status: 'verified' }] })?.attempt === true);
  ok('  the route\'s maths reading counts too (ObserveContext.math)', reactOf([...OS, u('Windows 11')], { math: true })?.attempt === true);
  // said they understood, in so many words (C.7, F43)
  const EXPL = OS[1].content.replace(' Which operating system is the laptop running?', ' Open Device Manager, find the adapter, and untick the power-saving box.');
  const said = (t) => reactOf([OS[0], a(EXPL), u(t)])?.saidUnderstood;
  for (const t of ['I see a different error now: adapter not found', 'got it working, the channel change fixed it', 'that helps a bit but it still drops at night', 'That helps, but it still drops at night', 'got it to run after a restart', 'I see what you mean but my router has no channel setting'])
    ok(`"${t}" → saidUnderstood false`, said(t) === false);
  for (const t of ['got it, that makes sense now', 'Got it, thanks!', 'Got it.', 'Ah, I see.', 'I see now', 'That helps, thanks', 'That makes sense, but why does it drop at night?', 'ok got it'])
    ok(`"${t}" → saidUnderstood true`, said(t) === true);
  // noAdvance only for an answer to a question (C.12, D.11: F48, N13)
  for (const t of ['thanks!', 'idk', 'just tell me how to fix it', 'ok', "I know that already, I did all of that", "that's not helpful at all"]) {
    const x = reactOf([OS[0], a(EXPL), u(t)]);
    ok(`"${t}" after a reply that asked nothing → answered not_asked, noAdvance none`, x && x.answered === 'not_asked' && x.noAdvance === 'none', J(x));
    const p = run([U(OS[0].content), A(EXPL), U(t)], { env: { LOGOS_MR_POLICY: PV10 } }).state.react;
    ok('  …and the same under the 10.1 pin', p && p.noAdvance === 'none', J(p));
  }
  ok('"idk" after a reply that asked → noAdvance dont_know still', reactOf([...OS, u('idk')])?.noAdvance === 'dont_know');
  ok('"ok" after a reply that asked → noAdvance short still', reactOf([u('my browser is slow'), a('Which browser are you using?'), u('ok')])?.noAdvance === 'short');
}

console.log('\n=== RF21: the readers stay cheap (D.9: N11) ===');
{
  const para = 'The main reason is that the network adapter goes to sleep to save power, and when it wakes up it has to renegotiate the connection with the router, which can take several seconds. ';
  const paste = 'Error at line 12: connection reset by peer while reading the response body from the upstream server. ';
  const shapes = {
    '30 turns, 1000-word replies': (() => { const m = []; for (let t = 0; t < 30; t++) { m.push(U(`Question number ${t} about my wifi adapter and why it keeps dropping when I move rooms?`)); if (t < 29) m.push(A(para.repeat(29) + ` Which router model do you have, number ${t}?`)); } return m; })(),
    '24 turns, 6000-character pastes, 800-word replies': (() => { const m = []; for (let t = 0; t < 24; t++) { m.push(U(`Here is the log from attempt ${t}, can you help? ` + paste.repeat(60))); if (t < 23) m.push(A(para.repeat(23) + ` Which router model do you have, number ${t}?`)); } return m; })(),
  };
  for (const [name, m] of Object.entries(shapes)) {
    const i = input(m);
    const times = [];
    for (let n = 0; n < 5; n++) {
      const t0 = Date.now();
      MR.regulateTurn({ ...i, now: () => 0 });
      times.push(Date.now() - t0);
    }
    times.sort((x, y) => x - y);
    ok(`${name}: regulateTurn under 11.1 in ${times[2]} ms, median of 5 (< 400)`, times[2] < 400, J(times));
  }
  const repeat = run(shapes['24 turns, 6000-character pastes, 800-word replies']);
  ok('  a paragraph said again in every reply, cut at the read limit, is one sentence, not two (no repeated_background)', !nowCodes(repeat).includes('observed.repeated_background'), `${repeat.trace} ${J(nowCodes(repeat))}`);
}

console.log('\n=== RF22: complete solutions — nothing added (D.17: N25) ===');
{
  // When their work or the reply is already complete, MR adds no question and no step: no new decision, and none of
  // the diagnose, stuck or check lines. A widened stuck, next-step, re-ask or failed-fix reader would show here first.
  const SOLVED = 'Subtract 3 from both sides to get 2x = 8, then divide both sides by 2, so x = 4. Check: 2(4) + 3 = 11, which matches.';
  const FIX = 'Turn off power saving for the wireless adapter in Device Manager, because Windows often switches it off to save battery and that drops the connection.';
  const FIX2 = 'Update the wireless driver from the maker support page rather than Windows Update, since an outdated driver is a common cause.';
  const FIX3 = 'Reset the network settings from Settings, then Network and Internet, then Advanced network settings, then Network reset.';
  const complete = [
    ['their finished solution as a first message, "Is this right?"', [U('Here is my solution: 2x + 3 = 11, so 2x = 8, so x = 4. Is this right?')]],
    ['their finished solution after a hint', [U('Solve 2x + 3 = 11'), A('Start by subtracting 3 from both sides.'), U('2x = 8, so x = 4. Done, I think that is it.')]],
    ['their finished solution after the hint they asked for (their own try still held, nothing new)', [U('Solve 2x + 3 = 11. Just a hint please.'), A('Start by subtracting 3 from both sides.'), U('Got it: 2x = 8, so x = 4. Thanks!')]],
    ['a finished reply, then "thanks, got it"', [U('Solve 2x + 3 = 11'), A(SOLVED), U('thanks, got it')]],
    ['a finished reply, then "great, that makes sense now"', [U('Solve 2x + 3 = 11'), A(SOLVED), U('great, that makes sense now')]],
    ['their working code, "Anything else to improve?"', [U('```python\ndef mean(xs):\n    if not xs:\n        return 0\n    return sum(xs) / len(xs)\n```\nThis works now. Anything else to improve?')]],
    ['a fix that worked', [U('My laptop wifi keeps dropping.'), A(FIX), U('that fixed it, thanks')]],
    ['a fix confirmed working after one failure', [U('My laptop wifi keeps dropping.'), A(FIX), U("still doesn't work"), A(FIX2), U('ok that fixed it!')]],
    ['a fix confirmed working after two failures', [U('My laptop wifi keeps dropping.'), A(FIX), U("still doesn't work"), A(FIX2), U('still not working'), A(FIX3), U('It works now, no drops all evening. Thank you!')]],
    ['their finished proof, "Is that right?"', [U('Prove that the sum of two even numbers is even.'), A('What does it mean for a number to be even?'), U('Even means 2k. So a = 2m and b = 2n, a + b = 2(m + n), which is even. Is that right?')]],
  ];
  for (const [name, m] of complete) {
    for (const [ctx, o] of [['', {}], [' (Answer Guard)', { guard: true }], [' (nothing on screen)', { material: false }]]) {
      const r = run(m, o);
      const acs = acsOf(m, o);
      ok(`${name}${ctx} → no new decision, no added question, no ONE THING / THEY ARE STUCK / CHECK BEFORE line`, !freshNew(r).length && NOT_IN_CONTROL(r) && r.assist.questions <= acs.questions, `${r.trace} ${J(freshNew(r).map((d) => d.trigger))}`);
    }
  }
  // …and a fix that worked ends the failed-fix reading: the third report is a success, not a third failure
  const fixed = at([U('My laptop wifi keeps dropping.'), A(FIX), U("still doesn't work"), A(FIX2), U('still not working'), A(FIX3), U('It works now, no drops all evening. Thank you!')]);
  ok('  after two failures, "It works now" is not read as a failure (no observed.fix_failed)', !has(fixed, 'observed.fix_failed'), J(codes(fixed)));
}

// ── RESIDUALS — after the verification of the fix pass ───────────────
// What the verifiers found left over or newly wrong after the review fixes, each reproduction as a fire or
// must-not-fire fixture with the near-misses the change could newly catch, and the 10.1 pin unchanged.
const STUCK_RULES = /\.explicit\.stuck$|\.observed\.repeated_stuck$/;
const ACTIVE_STUCK = (r) => r.state.interventions.some((x) => x.status === 'active' && STUCK_RULES.test(x.decision.trigger));
const SUBST = [u('Integrate x e^(x^2) dx. I set u = x^2 so du = 2x dx.'), a(APPROACH)];

console.log('\n=== RS1: a refusal of help is said, not reported (residual F4: STUCK_DECLINES) ===');
{
  const REFUSE = [
    "I'm stuck. No hints, just let me think for a minute.", "I'm stuck but no hints please, I want to get there myself.", "I'm stuck, but don't give me the next step, I'll figure it out.",
    "I'm stuck on this one but I'd like to keep trying on my own, no hints please.", "I'm stuck, just let me vent for a second, I don't need help.", "I'm stuck but I don't want help yet.", "I'm stuck. Don't tell me anything yet.",
    "I'm stuck, but without hints please.", "I'm stuck, let me have another go first.", "I'm stuck but I'll work it out, don't spoil it.",
  ];
  const REPORT = [
    'I have no clue where to start', 'No clue where to begin', "I'm stuck and the textbook is no help.", "I'm stuck, my notes give no hints on this step.", "I'm stuck. Let me try to explain what I did: I set u = x^2 and then got lost.",
    "I'm stuck, let me think out loud: du = 2x dx, so what now?", "I'm stuck and I found no answers online.", "I'm stuck, there are no solutions in the back of the book.", "I'm stuck, I need help.", "I'm stuck, no idea where to go from here.",
    "I'm stuck, I don't need help with the substitution, just the last step.",
  ];
  for (const t of REFUSE) {
    const obs = at([...SUBST, u(t)], { material: false });
    const r = run([...SUBST, U(t)], { material: false });
    ok(`"${t}" → stuck.declines, and no stuck decision`, stuckRefsOf(obs).includes('stuck.declines') && !stuckDecision(r), `${J(stuckRefsOf(obs))} ${r.trace}`);
  }
  for (const t of REPORT) {
    const obs = at([...SUBST, u(t)], { material: false });
    const r = run([...SUBST, U(t)], { material: false });
    ok(`"${t}" after their integral → stuck read without stuck.declines, and the next step`, has(obs, 'explicit.stuck') && !stuckRefsOf(obs).includes('stuck.declines') && r.decision.controls?.strategy === 'next_step', `${J(stuckRefsOf(obs))} ${r.trace}`);
  }
  const first = at([u('I have no clue where to start')], { material: false });
  ok('"I have no clue where to start" as a first message → stuck (first, unseen), no stuck.declines', has(first, 'explicit.stuck') && !stuckRefsOf(first).includes('stuck.declines') && stuckRefsOf(first).includes('stuck.first'), J(stuckRefsOf(first)));
  ok('M.STUCK_DECLINES: "no hints please" yes; "give no hints on this step", "is no help", "Let me try to explain", "let me think out loud" no', M.STUCK_DECLINES.test("I'm stuck, but no hints please.") && !M.STUCK_DECLINES.test('my notes give no hints on this step') && !M.STUCK_DECLINES.test('the textbook is no help.') && !M.STUCK_DECLINES.test('Let me try to explain what I did') && !M.STUCK_DECLINES.test('let me think out loud: du = 2x dx'));
}

console.log('\n=== RS2: more of how people say they are stuck (residual F14) ===');
{
  const MORE = [
    "help I'm stuck", 'No idea how to do this', "I can't work out how to do this", "I've hit a wall with this proof.", "I don't know where to start with this essay.", "I'm stuck on how to factor this", "I'm stuck again on the substitution.",
    "I'm stuck on the integration by parts part", "I'm stuck trying to solve this", "I'm stuck at simplifying", "I can't get past step 2", "I don't see how to solve it",
  ];
  for (const t of MORE) {
    const s = get(at([...INTEGRATE, u(t)]), 'explicit.stuck');
    ok(`"${t}" after their exercise → explicit.stuck with stuck.shown and stuck.own_work`, s && refCodes(s).includes('stuck.shown') && refCodes(s).includes('stuck.own_work'), J(s ?? codes(at([...INTEGRATE, u(t)]))));
  }
  for (const t of ["I'm stuck on how to tell my parents", "I'm stuck on how to do my taxes", "I'm stuck trying to get home", "I can't get past the bouncer", "I've hit a wall with my landlord", "help me, I'm stuck in traffic", "I don't know where to start with my wedding planning"])
    ok(`"${t}" → no explicit.stuck`, !has(at([...INTEGRATE, u(t)]), 'explicit.stuck') && !has(at([u(t)], { material: false }), 'explicit.stuck'), J([codes(at([...INTEGRATE, u(t)])), codes(at([u(t)], { material: false }))]));
  ok('under mr-2026.10.1: none of them', MORE.every((t) => !has(at10([...INTEGRATE, u(t)]), 'explicit.stuck')));
}

console.log('\n=== RS3: a stuck among words about life and the people around them (residual F3) ===');
{
  const LIFE = [
    "I feel stuck in life and I don't know what to do.", "I don't know what to do. I think my friend is angry with me.", "I don't know what to do anymore.", "I'm stuck, my sister won't talk to me.",
    "I don't know what to do, should I take the job in Berlin or stay?", "I'm stuck. My boss keeps moving the deadline and my partner is fed up.", "I can't figure it out, my parents keep fighting.",
  ];
  for (const t of LIFE) {
    for (const h of [[], QUADRATIC]) {
      const obs = at([...h, u(t)], { material: false });
      const r = run([...h, U(t)], { material: false });
      ok(`${h.length ? 'after a maths exchange' : 'first'}: "${t}" → no explicit.stuck, no stuck decision`, !has(obs, 'explicit.stuck') && !stuckDecision(r), `${J(codes(obs))} ${r.trace}`);
    }
  }
  // (a family member named puts a stuck aside whatever else is said — tenderText, fix plan A.3 — so the near-misses here name none)
  for (const t of ["I'm stuck on step 3, the hint in the book didn't help either", "I don't know what to do next, can you give me a hint?", "I'm stuck, it doesn't work anymore", "I'm stuck. I can't stop getting a negative discriminant."])
    ok(`"${t}" after a maths exchange → still explicit.stuck`, has(at([...QUADRATIC, u(t)]), 'explicit.stuck'), J(codes(at([...QUADRATIC, u(t)]))));
}

console.log('\n=== RS4: a stuck in a troubleshooting thread, and still stuck after it (regression of the stuck gate) ===');
{
  const EXPL = 'Wi-Fi drops usually come from interference or a power-saving setting on the adapter. Open Device Manager, find the adapter, and untick "Allow the computer to turn off this device to save power". If that does not help, move the router to channel 1, 6 or 11.';
  const wifi = [U('My laptop wifi keeps dropping every few minutes.'), A(EXPL)];
  for (const t of ["I'm stuck, I can't find Device Manager", "I'm stuck, where is the adapter?"]) {
    const r = run([...wifi, U(t)]);
    ok(`"${t}" after the steps → explicit.stuck (shown) and react.stuck true`, nowCodes(r).includes('explicit.stuck') && stuckRefsOf(r.state.observations.filter((o) => o.turn === r.state.turn)).includes('stuck.shown') && r.state.react?.stuck === true, `${J(nowCodes(r))} ${J(r.state.react)}`);
  }
  const again = run([...wifi, U("I'm stuck, I can't find Device Manager"), A('Press Windows+X and pick Device Manager from the menu; it lists every piece of hardware, and the adapter sits under Network adapters near the middle of the list.'), U('still stuck')]);
  ok('…a reply, then "still stuck" → stuck again, repeated_stuck, and a worked example', nowCodes(again).includes('observed.repeated_stuck') && again.decision.controls?.strategy === 'worked_example', again.trace);
  const spec = "I'm stuck. I need a backend service built for the shop and here is what it should do. " + 'The service should accept a request from the client and return the list of active orders sorted by date. '.repeat(20);
  ok('N14: "I\'m stuck." before a long description of the task → explicit.stuck (shown)', stuckRefsOf(at([u(spec)], { material: false })).includes('stuck.shown'), J(codes(at([u(spec)], { material: false }))));
  ok('  a stuck with no task on the table and nothing explained before it is still silent ("I\'m stuck, any thoughts on how to move on?")', !has(at([u('hi'), a('Hi! What can I help with?'), u("I'm stuck, any thoughts on how to move on?")], { material: false }), 'explicit.stuck'));
}

console.log('\n=== RS5: still stuck — the first one, and the fourth one (residual F26; the stuck chain) ===');
{
  for (const t of ['Tried that, still stuck', 'Did that, still stuck', 'Still stuck']) {
    const r = run([...SUBST, U(t)]);
    ok(`"${t}" as the first stuck after their integral and an explanation → explicit.stuck, a next step, ACS's question taken`, nowCodes(r).includes('explicit.stuck') && r.decision.controls?.strategy === 'next_step' && r.assist.questions === 0, r.trace);
  }
  ok('  under mr-2026.10.1: nothing', !has(at10([...SUBST, u('Tried that, still stuck')]), 'explicit.stuck'));
  // eight turns of one episode: no stuck turn falls back to ACS's question, and the worked example is not given twice running
  const R = (i) => `Reply number ${i}: here is something to try next, step by step, so you can see the move.`;
  const turns = [['Integrate x e^(x^2) dx. This is my homework, I want to understand it.', 'Substitution works by spotting a function and its derivative together. Here the inner function is x squared, and its derivative 2x sits beside the exponential.'], ["I set u = x^2 but now I'm stuck on the next step", R(1)], ...Array.from({ length: 6 }, (_, i) => ['still stuck', R(i + 2)])];
  let msgs = [];
  const got = [];
  for (const [t, reply] of turns) {
    msgs = [...msgs, U(t)];
    const r = run(msgs);
    got.push({ t, stuck: nowCodes(r).includes('explicit.stuck'), q: r.assist.questions, s: r.decision.controls?.strategy ?? null });
    msgs = [...msgs, A(reply)];
  }
  ok('every "still stuck" from the second to the seventh turn reads explicit.stuck', got.slice(1).every((x) => x.stuck), J(got));
  ok('  …and each takes a stuck move with no question (next step or worked example), never ACS\'s question', got.slice(1).every((x) => x.q === 0 && (x.s === 'next_step' || x.s === 'worked_example')), J(got));
  ok('  …never a worked example on two turns running', got.every((x, i) => !(i > 0 && x.s === 'worked_example' && got[i - 1].s === 'worked_example')), J(got));
}

console.log('\n=== RS6: a correction, and what is not one (residual F7, F15, N22) ===');
{
  const MONAD = 'In Haskell, a monad is a type with two operations, return and bind, that lets you chain computations which carry some context, such as possible failure or state, without writing the plumbing by hand each time.';
  const REFUND = 'To get a refund, contact the seller first through the order page and ask for a return; if they do not answer within two weeks, open a claim with your card provider, who can reverse the charge under chargeback rules for goods that never arrived.';
  const WIFI_SET = 'On Windows, open Settings, go to Network and Internet, then Wi-Fi, and turn off Random hardware addresses. Then restart the laptop and see whether the drops stop.';
  const QUIET = [
    [MONAD, ['I mean what if we tried the other approach?', 'Wait, I mean the Calvin cycle part is the one I like best.', "I meant 'carpe diem' as my motto.", 'I mean the explanation was good though.', 'I mean the first one was clearer', "I mean you could also say it's like a burrito, right?"]],
    [REFUND, ['I asked if they could help and they said no.', 'I asked about it at the bank and they said to wait.', 'This is my first refund, not my last probably.']],
    [WIFI_SET, ['Nope, I have tried that already', "That's for later. I have another question.", 'I use a VPN, not sure if that matters', 'No, I have the latest driver installed', 'I use Chrome, not that it matters', 'I have the same problem on my phone, not just the laptop', "I'm on the second step, not sure what to click", 'No, I have no admin rights', 'I should have said thanks earlier, that worked.', 'I should have mentioned I already restarted it.']],
  ];
  const FIRE = [
    [MONAD, ['No, I meant the Leibniz one', 'I mean the Leibniz one', 'No, I asked about the philosophical one', 'This is for Python 3, not for Python 2']],
    [REFUND, ['No, I asked how to do it through PayPal', "I'm on PayPal, not a card. Does that change anything?"]],
    [WIFI_SET, ["No, it's a Mac", "I'm not on Windows, I use a Mac", "Wrong OS, it's a Mac", "I don't use Windows, I have a MacBook", "No, I'm on a Mac", "I'm using macOS, not Windows", "Sorry, I should have said, I'm on a Mac", 'I should have mentioned I use a Mac.']],
  ];
  for (const [reply, ts] of QUIET) for (const t of ts) {
    const m = [u('Tell me about it.'), a(reply), u(t)];
    const r = run([U('Tell me about it.'), A(reply), U(t)]);
    ok(`"${t}" after a reply → no corrected, and no correction line`, !has(at(m), 'explicit.corrected') && !r.block.includes('THEY CORRECTED YOUR READING'), `${J(codes(at(m)))} ${r.trace}`);
  }
  for (const [reply, ts] of FIRE) for (const t of ts) ok(`"${t}" after a reply → corrected`, has(at([u('Tell me about it.'), a(reply), u(t)]), 'explicit.corrected'), J(codes(at([u('Tell me about it.'), a(reply), u(t)]))));
  ok('under mr-2026.10.1: none of them', FIRE.every(([reply, ts]) => ts.every((t) => !has(at10([u('Tell me about it.'), a(reply), u(t)]), 'explicit.corrected'))));
}

console.log('\n=== RS7: "I know that", and a check or a joke that only sounds like it (residual F20, N23) ===');
{
  const base = [u('How do for loops work in Python?'), a(explanation(120))];
  for (const t of ['You already said that range starts at zero, right?', 'You already covered this? I missed it.', 'You already told me that would happen, and it did!', 'Can you stop repeating yourself? Just kidding, it helps.', 'Stop repeating the list, I mean in my code, it prints twice.', 'I know that, but please explain it once more', 'I know that, but could you go through it one more time?'])
    ok(`"${t}" after an explanation → no knows_that`, !has(at([...base, u(t)]), 'explicit.knows_that'), J(codes(at([...base, u(t)]))));
  for (const t of ['You already said that.', 'Can you stop repeating yourself?', 'You keep saying the same thing.', 'Stop repeating yourself, please.', 'You already explained that, thanks.', 'Stop repeating yourself and get to the point'])
    ok(`"${t}" after an explanation → knows_that`, has(at([...base, u(t)]), 'explicit.knows_that'), J(codes(at([...base, u(t)]))));
}

console.log('\n=== RS8: a failure report, and a question or news that only sounds like one (residual F1, F17) ===');
{
  const arc = [u('My laptop wifi keeps dropping.'), a(SUGGEST1), u("I did that but it still doesn't work."), a(SUGGEST2)];
  for (const t of ['Still there?', 'Still nothing from the landlord about the deposit.', 'The same thing, but for a desktop: does that work?', 'It keeps happening to my friends too, is it common?', 'Same question for my phone: does it apply?'])
    ok(`"${t}" after one failure report → no fix_failed`, !has(at([...arc, u(t)]), 'observed.fix_failed'), J(codes(at([...arc, u(t)]))));
  for (const t of ['Still nothing.', 'It keeps happening, what else can I try?', 'The same thing, unfortunately.', 'Same thing again.', 'The problem is still there.'])
    ok(`"${t}" after one failure report → fix_failed`, has(at([...arc, u(t)]), 'observed.fix_failed'), J(codes(at([...arc, u(t)]))));
}

console.log('\n=== RS9: a follow-up that shares a word with the thread is not a new topic (residual F40, N21) ===');
{
  const WIFI = [U('My laptop wifi keeps dropping every few minutes.'), A('Wi-Fi drops usually come from interference or a power-saving setting on the adapter. Open Device Manager, find the adapter, and untick "Allow the computer to turn off this device to save power". If that does not help, move the router to channel 1, 6 or 11.')];
  for (const f of ['Could my microwave be causing the interference?', "Could my neighbour's router be causing the interference?", 'Would a mesh system fix the drops?', 'Does the power-saving setting affect battery life?', 'Is a 5 GHz band less prone to interference?']) {
    const r = run([...WIFI, U(f)]);
    ok(`"${f}" after the wifi explanation → react.newTopic false, no observed.new_topic`, r.state.react?.newTopic === false && !nowCodes(r).includes('observed.new_topic'), `${J(r.state.react)} ${J(nowCodes(r))}`);
  }
  for (const f of ['Unrelated, but what is a good laptop for video editing under 1000 pounds?', 'Totally separate thing - my cat keeps scratching the sofa, how do I stop her?', 'Different question: how do I bake a sourdough loaf at home?']) {
    const r = run([...WIFI, U(f)]);
    ok(`"${f}" → a new topic said in so many words: react.newTopic true and observed.new_topic`, r.state.react?.newTopic === true && nowCodes(r).includes('observed.new_topic'), `${J(r.state.react)} ${J(nowCodes(r))}`);
  }
  const slow = [U('my laptop is slow'), A('Which operating system are you on?'), U('I already told you, Windows 11'), A('Then open Task Manager, look at the Startup tab and turn off the apps you do not need at login.')];
  for (const f of ['Can malware slow down Task Manager?', 'What does the Startup impact column mean?']) {
    const r = run([...slow, U(f)]);
    const hold = rec(r, 'ifr.observed.redundant_question');
    ok(`"${f}" inside the redundant window → no new topic, the question hold stays, q=0`, !nowCodes(r).includes('observed.new_topic') && hold?.status === 'active' && r.assist.questions === 0, `${J(nowCodes(r))} ${hold?.status} q=${r.assist.questions}`);
  }
}

console.log('\n=== RS10: what they point at, on a check or a fact move (residual F24) ===');
{
  for (const t of ['Can you check this?', 'Could you check this for me?', 'Can you check it?', 'Can you check my work?']) {
    const r = run([U(t)], { material: false });
    const acs = acsOf([U(t)]);
    ok(`"${t}" with nothing on screen (ACS: ${acs.mode}) → the missing-referent diagnose survives, its line goes out, q never above ACS's`, r.decision.controls?.strategy === 'diagnose' && !(r.decision.constrainedBy ?? []).includes('acs:strategy') && /WHAT THEY POINT AT IS NOT IN THE CONVERSATION/.test(r.block) && r.assist.questions <= acs.questions, `${r.trace} ${r.block}`);
  }
  for (const t of ['Translate this', 'Translate this please']) {
    const r = run([U(t)], { material: false });
    ok(`"${t}" with nothing on screen → missing referent, said as a statement (ACS put no question)`, refCodes(openOf([u(t)], { material: false })).includes('request.missing_referent') && r.assist.questions === 0 && /as a statement, not a question/.test(r.block), `${r.trace} ${r.block}`);
  }
  for (const t of ['What do you think of this?', 'Thoughts on this?'])
    ok(`"${t}" with nothing on screen → missing referent`, refCodes(openOf([u(t)], { material: false })).includes('request.missing_referent'), J(codes(at([u(t)], { material: false }))));
  for (const t of ['Translate this sentence into French: I love apples.', 'What do you think of this idea: a bakery that sells bread at night?', 'Thoughts on this: remote work beats the office?', 'Can you check my work schedule for clashes?', 'Translate "good morning" into German'])
    ok(`"${t}" → no missing referent`, !refCodes(openOf([u(t)], { material: false })).includes('request.missing_referent'), J(codes(at([u(t)], { material: false }))));
  ok('"Translate this" with something on screen, or under mr-2026.10.1 → none', !openOf([u('Translate this')], { material: true }) && !has(at10([u('Translate this')], { material: false }), 'observed.open_request'));
}

console.log('\n=== RS11: a broad open request under the guard or the scaffold layer (residual N9; N8) ===');
{
  const g = run([U(Q)], { guard: true });
  ok('the networking question under the Answer Guard → the open diagnose line, and the trace claims no kept answer', g.decision.controls?.strategy === 'diagnose' && g.block.includes('Lead with the one point that holds whichever way they mean it') && !(g.decision.constrainedBy ?? []).some((x) => /keeps_answer/.test(x)), `${g.trace} ${g.block}`);
  const P1 = "How come AI still can't solve real problems?";
  const i = input([U(P1)]);
  i.acs.split = { reasoning: 'scaffold' };
  const sc = MR.regulateTurn(i);
  ok('a broad question under the scaffold layer → the open diagnose line (no "gives nothing of their answer away"), no keeps_answer', sc.decision.controls?.strategy === 'diagnose' && !sc.block.includes('gives nothing of their answer away') && !(sc.decision.constrainedBy ?? []).some((x) => /keeps_answer/.test(x)), `${sc.trace} ${sc.block}`);
  const sw = input([...INTEGRATE, U("I'm stuck on the next step")]);
  sw.acs.split = { reasoning: 'scaffold' };
  const st = MR.regulateTurn(sw);
  ok('  near-miss: stuck with their work under the scaffold layer keeps its kept line and its keeps_answer', (st.decision.constrainedBy ?? []).includes('app_policy:scaffold:strategy.keeps_answer') && st.block.includes('the answer itself stays theirs'), `${st.trace} ${st.block}`);
  const ref = run([U('How do I fix this?')], { guard: true, material: false });
  ok('  near-miss: a missing referent under the guard is not a broad open request (its own line)', /WHAT THEY POINT AT IS NOT IN THE CONVERSATION/.test(ref.block), ref.block);
}

console.log('\n=== RS12: their own try said with "just give me hints" keeps the lines kept (own try read, rule stood down) ===');
{
  const red = [U('I need a stronger thesis for my essay on carbon taxes. I want to try it myself, just give me hints.'), A('Sure. What is the main argument your essay makes?'), U('I already told you, it is about carbon taxes.')];
  const r = run(red);
  ok('a question asked for what they said → the hint line, never "Give your best answer now"', r.block.includes('the answer itself stays theirs') && !r.block.includes('Give your best answer now'), `${r.trace} ${r.block}`);
  const cor = [U('Help me solve 3x + 5 = 20. I want to try it myself, just give me hints.'), A('Sure. What could you subtract from both sides first?'), U('No, I meant 3x - 5 = 20.')];
  const c = run(cor);
  ok('a correction → the kept correction line (work from the question as they put it)', c.block.includes('Work from the question as they now put it') && !c.block.includes('Lead with what they asked for'), `${c.trace} ${c.block}`);
  ok('under mr-2026.10.1: no block on either', run(red, { env: { LOGOS_MR_POLICY: PV10 } }).block === '' && run(cor, { env: { LOGOS_MR_POLICY: PV10 } }).block === '');
}

console.log('\n=== RS13: the next step outranks the shape and form notes (residual N3) ===');
{
  const r = run([...INTEGRATE, U("I'm stuck on the next step")]);
  ok('a next step → its line says it outranks the shape and form notes below', r.decision.controls?.strategy === 'next_step' && r.block.includes('This outranks the shape and form notes below'), r.block);
  ok('  under mr-2026.10.1: no such line', !run([...INTEGRATE, U("I'm stuck on the next step")], { env: { LOGOS_MR_POLICY: PV10 } }).block.includes('outranks'));
}

console.log('\n=== RS14: code asked for in a language is a request for code (residual N4: fullPieceAsked) ===');
{
  for (const t of ['ok, how do I do that in Python with psycopg?', 'show me the code in Go', 'Can you give me an example in JavaScript?', 'How would I do that using pandas?']) ok(`"${t}" → fullPieceAsked`, M.fullPieceAsked(t));
  for (const t of ['How do I say hello in French?', 'How do I learn Python?', 'How do I get to Rome?', 'How do I do that in Excel?', 'Is Python good for beginners?']) ok(`"${t}" → not fullPieceAsked`, !M.fullPieceAsked(t));
}

console.log('\n=== RS15: the measures (residual F38, F39, F43, F45; the gate leak; inline code) ===');
{
  const said = (t) => reactOf([U('Explain loops.'), A(explanation(60)), U(t)])?.saidUnderstood;
  for (const t of ['That helps a lot, thank you', 'that helps so much', 'That helps, thanks']) ok(`"${t}" → saidUnderstood`, said(t) === true);
  for (const t of ['that helps a lot but it still drops', 'that helps, but I am still confused']) ok(`"${t}" → not saidUnderstood`, said(t) === false);
  const shape = (t) => M.replyShape(t);
  const inl = shape('Use the `a ? b : c` form here.');
  ok('a "?" in inline code → no question, not opening with one, no words before one', inl.questions === 0 && inl.opensWithQuestion === false && inl.wordsBeforeQuestion === -1, J(inl));
  ok('a "?" in inline code mid-sentence ("Set it with `x ?? y` and you are done.") → the same', shape('Set it with `x ?? y` and you are done.').opensWithQuestion === false);
  ok('a tilde fence cut off by the ceiling → no question, code true', shape('Try this:\n\n~~~\nwhat? = 3\n').questions === 0 && shape('Try this:\n\n~~~\nwhat? = 3\n').code === true);
  ok('a question put to them with its reason after ("Can you tell me which router you have? Because the steps differ by brand.") → counted (the gate keeps it; the measure sees it)', shape('Can you tell me which router you have? Because the steps differ by brand.').questions === 1);
  ok('  near-miss: "Why does the cache serve old data? Because it was never invalidated." → no question', shape('Why does the cache serve old data? Because it was never invalidated.').questions === 0);
  const act = (t) => shape(t).firstActionable;
  for (const t of ['Back up your files before you start.', 'Check your phone is charged.', 'Download drivers that are signed.', 'Take two of them with water.', 'Find the adapter in Device Manager.']) ok(`"${t}" → actionable`, act(t) === 0, J(shape(t)));
  for (const t of ['Find my iPhone is a tracking service.', 'Connect four is a two-player game.', 'Restart policies decide when containers come back.']) ok(`"${t}" → not actionable (a noun phrase as the subject)`, act(t) !== 0, J(shape(t)));
  // afterReply counts what is put to them under a precision policy
  const hard = run([U('Write a JS function that clamps a number. Stop asking me questions, just write it.')]);
  const cut = 'Here it is:\n\n```js\nfunction clamp(x, lo, hi) {\n  return x < lo ? lo : x > hi ? hi : x; // why?\n';
  ok('a fence cut off by the ceiling under a hard stop → no questions control_violation', hard.gate.hardNoQuestions && !MR.afterReply(hard, cut, { questions: 0, claims: 0 }).some((f) => /^questions:/.test(f.detail)), J(MR.afterReply(hard, cut, { questions: 0, claims: 0 })));
  ok('  …and a question in prose still is one', MR.afterReply(hard, 'Here it is. Which bounds do you want?', { questions: 0, claims: 0 }).some((f) => /^questions:/.test(f.detail)));
  const heads = '## Why does this happen?\n\nThe cache keeps old values until it is invalidated, so the page shows stale data.';
  ok('a heading question under a hard stop → no control_violation', !MR.afterReply(hard, heads, { questions: 0, claims: 0 }).some((f) => f.code === 'control_violation' && /^questions:|opened_with_question/.test(f.detail)), J(MR.afterReply(hard, heads, { questions: 0, claims: 0 })));
  const hard10 = run([U('Write a JS function that clamps a number. Stop asking me questions, just write it.')], { env: { LOGOS_MR_POLICY: PV10 } });
  ok('  under mr-2026.10.1 afterReply counts as it did (the cut fence still counts)', MR.afterReply(hard10, cut, { questions: 0, claims: 0 }).some((f) => /^questions:/.test(f.detail)), J(MR.afterReply(hard10, cut, { questions: 0, claims: 0 })));
}

console.log('\n=== RS16: the work is the example in Socria\'s reply (residual N20) ===');
{
  const m = [U('What is integration by parts used for?'), A('It handles products of functions. For example: integrate x e^x dx. Pick u = x and dv = e^x dx.')];
  for (const t of ["I'm stuck", "I'm stuck on this step"]) {
    const r = run([...m, U(t)], { material: false });
    const refs = stuckRefsOf(r.state.observations.filter((o) => o.turn === r.state.turn));
    ok(`"${t}" after Socria's worked example, nothing on screen → stuck.shown, never "THE WORK IS NOT IN THE CONVERSATION"`, refs.includes('stuck.shown') && !refs.includes('stuck.unseen') && !/THE WORK IS NOT IN THE CONVERSATION/.test(r.block), `${J(refs)} ${r.trace} ${r.block}`);
  }
  const concept = run([U('What is a derivative?'), A('The rate of change of a function at a point.'), U("I'm stuck")], { material: false });
  ok('  near-miss: a one-line definition with no exercise in it → still unseen', stuckRefsOf(concept.state.observations.filter((o) => o.turn === concept.state.turn)).includes('stuck.unseen'), concept.trace);
}

console.log('\n=== FC: the final independent check (G1–G9) ===');
{
  const HW = [U('Solve 3x + 7 = 22 for my homework.'), A('Good start. What could you do to both sides so that the x term ends up on its own?')];
  const tOf = (r) => (/;t=([^;]+)/.exec(r.trace) ?? [])[1];
  // G1: the solution asked for beside "I'm stuck" — every stuck rule stands aside and ACS's help stands
  for (const t of ["I got 3x = 15 but I'm stuck. Walk me through the rest.", "I got 3x = 15 but I'm stuck. Can you solve it for me?", "I got 3x = 15 but I'm stuck. Give me the full solution please.", "I got 3x = 15 but I'm stuck. Tell me what x is.", "I got 3x = 15 but I'm stuck. What is x?", "I got 3x = 15 but I'm stuck. Can you do the rest?", "I got 3x = 15 but I'm stuck. Show me how to do it all the way through.", "I got 3x = 15 but I'm stuck. Explain the whole solution."]) {
    const r = run([...HW, U(t)]);
    ok(`G1 "${t}" → no stuck move (one step would hand over less than they asked for)`, !/^(?:mr\.explicit\.stuck|ifr\.explicit\.stuck|mr\.observed\.repeated_stuck)$/.test(tOf(r) ?? '') && !/THEY ARE STUCK/.test(r.block), `${r.trace} ${r.block}`);
  }
  const again = run([...HW, U("I'm stuck on the next step"), A('Next step: divide both sides by 3, because the 3 is multiplying x, and check that 3 times your answer gives 15.'), U('Still stuck. Show me the whole solution.')]);
  ok('G1 "Still stuck. Show me the whole solution." → no worked example of MR\'s', tOf(again) !== 'mr.observed.repeated_stuck' && !/THE EXPLANATION HAS NOT LANDED/.test(again.block), again.trace);
  for (const t of ["I got 3x = 15 but I don't know how to solve the rest", "I got 3x = 15 but now I'm stuck"])
    ok(`G1 near-miss "${t}" → still the next step`, tOf(run([...HW, U(t)])) === 'mr.explicit.stuck', run([...HW, U(t)]).trace);
  // G2: an exercise verb put to a pointer shows no work
  for (const t of ["I don't know how to solve this", "I'm stuck on how to solve it", "I'm stuck trying to simplify this", 'I have no idea how to solve this one']) {
    const r = run([U(t)], { material: false });
    ok(`G2 "${t}" (first message, nothing shown) → the locating move, never "WORK ON THE TABLE"`, tOf(r) === 'ifr.explicit.stuck' && !/WITH WORK ON THE TABLE/.test(r.block), `${r.trace} ${r.block}`);
  }
  for (const t of ["I'm stuck trying to solve 3x + 7 = 22", "I'm stuck on 3x + 7 = 22", "I'm stuck solving 3x + 7 = 22"])
    ok(`G2 near-miss "${t}" (the exercise named) → the next step`, tOf(run([U(t)], { material: false })) === 'mr.explicit.stuck', run([U(t)], { material: false }).trace);
  // G3: a pointer back to what they have just named is no missing referent
  for (const t of ['My sink is clogged, how do I fix it?', "My iPhone won't charge. How do I fix it?", 'My bike chain keeps slipping. How do I fix it?', 'My knee hurts after running, why does this happen?', 'My Excel formula returns #REF!, why is it not working?', 'My sourdough is too dense. Why does this happen?'])
    ok(`G3 "${t}" → no missing referent`, !has(at([u(t)], { material: false }), 'observed.open_request'), J(codes(at([u(t)], { material: false }))));
  for (const t of ['How do I fix this?', "Why isn't this working?", 'Can you check this?'])
    ok(`G3 near-miss "${t}" with nothing on screen → still read`, has(at([u(t)], { material: false }), 'observed.open_request'));
  // G4: still stuck after an unseen stuck and a locating question — the locating move again, not a worked example
  const unseenAgain = run([U("I'm stuck"), A('What are you working on? Paste the problem or the step you are on.'), U('still stuck')], { material: false });
  ok('G4 "still stuck" after an unseen stuck → the locating move, no worked example of a problem nobody has seen', tOf(unseenAgain) === 'ifr.explicit.stuck' && !/THE EXPLANATION HAS NOT LANDED/.test(unseenAgain.block), unseenAgain.trace);
  const q4 = run([U("I'm stuck on question 4")], { material: false });
  ok('G4 "I\'m stuck on question 4" → a part named is not the work shown: the locating move', tOf(q4) === 'ifr.explicit.stuck', q4.trace);
  // G5: a stop on questions in other words, under precision only
  for (const t of ['How do I fix this? Stop questioning me.', 'Why is AI not solving problems? No questions please.', 'Stop with the questions. What is a VPN?', 'Stop asking me follow-up questions. How do I reset my router?', 'Please stop ending every reply with a question. What is DNS?']) {
    const r = run([U(t)], { material: false });
    ok(`G5 "${t}" → their stop: a hard no-questions gate`, r.gate.hardNoQuestions === true && r.assist.questions === 0, r.trace);
    ok(`G5 "${t}" under mr-2026.10.1 → read as it was`, !has(at10([u(t)]), 'explicit.stop_questions') || has(at10([u(t)]), 'explicit.stop_questions') === has(at([u(t)], { params: params10 }), 'explicit.stop_questions'));
  }
  const nofollow = run([U("I'm stuck on question 4. No follow-up questions please.")], { material: false });
  ok('G5 stuck + "No follow-up questions please" → the stuck line asks nothing', nofollow.assist.questions === 0 && nofollow.gate.hardNoQuestions === true && !/as a plain question, and end there/.test(nofollow.block), `${nofollow.trace} ${nofollow.block}`);
  for (const t of ['There were no questions on the exam about this, why?', 'Stop asking me so many questions at once', 'No questions came up about the budget, is that normal?', 'My teacher said no questions in class, is that fair?'])
    ok(`G5 near-miss "${t}" → no stop`, !has(at([u(t)]), 'explicit.stop_questions'), J(codes(at([u(t)]))));
  // G6, G7: the precision lines say what outranks what beside the runtime's other lines
  const WIFI1 = 'This usually comes from the adapter or the router rather than your internet provider. Start by forgetting the network and joining it again, then turn off the power saving setting for the wireless adapter in Device Manager, because Windows often switches the adapter off to save battery and that drops the connection.';
  const WIFI2 = 'If that did not help, the driver is the next suspect. Next, update the wireless driver from the laptop maker support page rather than through Windows Update, and move the router to a less crowded channel, since an outdated driver or a crowded channel are the most common causes.';
  const ff = run([U('My laptop wifi keeps dropping.'), A(WIFI1), U('Tried that, it still keeps dropping.'), A(WIFI2), U('Nope, still the same.')]);
  ok('G6 the check line opens as a report that the fix did not work, not a disagreement', tOf(ff) === 'mr.observed.fix_failed' && ff.block.includes('This is a report that the fix did not work, not a disagreement: CHECK BEFORE ANOTHER FIX.'), `${ff.trace} ${ff.block}`);
  ok('G7 the open-request line outranks the shape and explanation notes after it', D1.block.includes('This outranks the shape and explanation notes below: the point and the question, not a walk through every cause.'), D1.block);
  // G8: a stuck on a line of its own after unfenced code
  const code = "def biggest(nums):\n    best = 0\n    for n in nums:\n        if n > best:\n            best = n\n    return best\nI'm stuck, it gives 0 for a list of negatives";
  const g8 = run([U('My assignment: write a function that returns the largest number in a list.'), A('What would you keep track of as you walk through the list?'), U(code)]);
  ok('G8 unfenced code, then "I\'m stuck" on its own line → the next step', tOf(g8) === 'mr.explicit.stuck', g8.trace);
  // G9: an irregular participle is the state of a thing done, not a setup put right
  const BOOK = 'Atomic Habits by James Clear is a practical, readable choice that explains how small changes compound over time, with concrete steps for building and breaking habits.';
  for (const t of ['No, I have read that one. Anything else?', 'No, I have heard that one already.', 'No, I have bought it already, something else?'])
    ok(`G9 "${t}" → no correction`, !has(at([u('Recommend a book on habits.'), a(BOOK), u(t)]), 'explicit.corrected'));
  ok('G9 near-miss "No, I\'m on a Mac" → still a correction', has(at([u('How do I take a screenshot?'), a('On Windows, press the Windows key, Shift and S together, then drag over the area you want to capture.'), u("No, I'm on a Mac")]), 'explicit.corrected'));
  // the pin
  ok('FC under mr-2026.10.1: none of these readings', !has(at10([u('How do I fix this? Stop questioning me.')]), 'observed.open_request') && !has(at10([...HW.map((m) => (m.role === 'user' ? u(m.content) : a(m.content))), u("I got 3x = 15 but I'm stuck. Walk me through the rest.")]), 'explicit.stuck'));
}

console.log(`\nmr precision: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
