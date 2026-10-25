// INTERACTION FRICTION REGULATION — what can be observed (lib/mr/ifr.ts).
//
// Each detector is tested on a realistic transcript where it should fire and
// on the near-misses where it must not: a false positive changes how Socria
// helps somebody who asked for nothing, so the negatives matter as much as
// the positives. Then the invariants every observation keeps: weak readings
// stay weak, nothing psychological is ever 'observed', evidence is
// content-free, and the same input gives the same output.

import * as M from './.tmp/mr-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;

const params = M.paramsFor(M.MR_POLICY_VERSION);
const u = (content) => ({ role: 'user', content });
const a = (content) => ({ role: 'assistant', content });

/** Observations at their newest message (or at user turn k). */
function at(messages, ctx = {}, k = null) {
  const turns = M.turnsOf(messages);
  return M.observeTurn(turns, k ?? turns.length - 1, { params, ...ctx });
}
const codes = (obs) => obs.map((o) => o.code);
const has = (obs, c) => obs.some((o) => o.code === c);
const get = (obs, c) => obs.find((o) => o.code === c);
const explicitOf = (obs) => codes(obs).filter((c) => c.startsWith('explicit.'));

// A reply that explains (no questions), about `n` words.
const EXPLAIN_SENTENCE = 'The derivative measures how fast a function changes as its input changes, and the power rule brings the exponent down in front.';
const explanation = (n = 60) => {
  const w = EXPLAIN_SENTENCE.split(' ').length;
  return Array.from({ length: Math.ceil(n / w) }, () => EXPLAIN_SENTENCE).join(' ');
};
const ANSWERED = 'Sure. Here is how it works: the power rule says you multiply by the exponent and subtract one from it, so x^3 becomes 3x^2.';

console.log('\n=== turnsOf: their messages with the replies around them ===');
{
  const msgs = [a('Hi, what are we working on?'), u('derivatives'), a('Great, let us start.'), u('ok'), u('one more thing')];
  const t = M.turnsOf(msgs);
  ok('one view per user message, indexed 0..n-1', t.length === 3 && t.map((x) => x.index).join() === '0,1,2', J(t.map((x) => x.index)));
  ok('`at` is the message index', t.map((x) => x.at).join() === '1,3,4', J(t.map((x) => x.at)));
  ok('reply / prevReply are the assistant messages right after / before', t[0].prevReply === 'Hi, what are we working on?' && t[0].reply === 'Great, let us start.' && t[1].prevReply === 'Great, let us start.' && t[1].reply === null && t[2].prevReply === null && t[2].reply === null);
  const newest = { ...t[2].signals, stopQuestions: true };
  const t2 = M.turnsOf(msgs, newest);
  ok('`newest` stands in for the last user message only', t2[2].signals === newest && t2[1].signals.stopQuestions === false);
  const long = M.turnsOf([u('x '.repeat(5000) + ' stop asking me questions')]);
  ok('readSignals reads at most IFR_READ_CHARS of a message', M.IFR_READ_CHARS === 6000 && long[0].signals.stopQuestions === false);
}

console.log('\n=== a short message is a weak hypothesis, and nothing more ===');
for (const w of ['ok', 'k', 'sure', 'fine', 'hm', 'yeah', 'cool', 'ok.', 'idk']) {
  const obs = at([u('what is a derivative'), a(ANSWERED), u(w)]);
  ok(`"${w}" after an answer → only weak.short_reply`, J(codes(obs)) === J(['weak.short_reply']), J(codes(obs)));
}
{
  const o = get(at([u('what is a derivative'), a(ANSWERED), u('ok')]), 'weak.short_reply');
  ok('weak.short_reply is a hypothesis at weak strength, confidence ≤ 0.25', o.provenance === 'hypothesis' && o.strength === 'weak' && o.confidence <= 0.25, J(o));
  ok('the first message of a conversation is not a short "reply"', at([u('ok')]).length === 0);
  for (const w of ['2x', 'x = 3', 'next', 'go on', 'continue?'])
    ok(`"${w}" is an attempt or a request, not a short reply`, !has(at([u('what is the derivative of x^2'), a(ANSWERED), u(w)]), 'weak.short_reply'));
  const s = at([u('explain limits'), a(explanation(80)), u('shorter')]);
  ok('"shorter" is their word (explicit.shorter), not a short reply', has(s, 'explicit.shorter') && !has(s, 'weak.short_reply'), J(codes(s)));
  const terse = at([u('what is a limit'), a(ANSWERED), u('ok'), a(ANSWERED), u('sure'), a(ANSWERED), u('fine')]);
  const tr = get(terse, 'weak.terse_run');
  ok('three short replies in a row → weak.terse_run, hypothesis/weak, ≤ 0.3', tr && tr.provenance === 'hypothesis' && tr.strength === 'weak' && tr.confidence <= 0.3 && tr.refs.length === 3, J(terse));
  ok('...and still no frustration, no unproductive questions', !has(terse, 'explicit.frustration') && !has(terse, 'observed.unproductive_questions'));
  const two = at([u('what is a limit'), a(ANSWERED), u('ok'), a(ANSWERED), u('sure')]);
  ok('two short replies are not a run', !has(two, 'weak.terse_run') && has(two, 'weak.short_reply'));
}

console.log('\n=== their words: steps, direct answers, quizzes ===');
{
  const o = at([u('how do I solve 2x + 3 = 11?'), a('What could you do first to isolate x?'), u('just show me the steps')]);
  ok('"just show me the steps" → explicit.show_steps + explicit.direct_answer', has(o, 'explicit.show_steps') && has(o, 'explicit.direct_answer'), J(codes(o)));
  const ss = get(o, 'explicit.show_steps');
  ok('...strong, explicit, with a ref to their message and no text', ss.provenance === 'explicit' && ss.strength === 'strong' && ss.confidence >= 0.9 && J(ss.refs) === J([{ turn: 1, role: 'user', code: 'explicit.show_steps' }]), J(ss));
  ok('"show me the steps" → steps, not a request for the answer', J(explicitOf(at([u('show me the steps for long division')]))) === J(['explicit.show_steps']), J(at([u('show me the steps for long division')])));
  for (const t of ['can you explain it step by step?', 'walk me through the steps', 'list the steps', 'step by step please', 'what are the steps to file a 1099'])
    ok(`"${t}" → show_steps`, has(at([u(t)]), 'explicit.show_steps'));
  for (const t of ['I worked through it step by step and got 12', "I'll do it step by step myself", "don't show me the steps, I want to try", 'the dance has eight steps'])
    ok(`"${t}" → no show_steps`, !has(at([u(t)]), 'explicit.show_steps'), J(codes(at([u(t)]))));

  const q = at([u('quiz me on derivatives')]);
  ok('"quiz me on derivatives" → explicit.quiz + wants_questions, not direct_answer', has(q, 'explicit.quiz') && has(q, 'explicit.wants_questions') && !has(q, 'explicit.direct_answer'), J(codes(q)));
  const pp = at([u('just give me a practice problem on limits')]);
  ok('"just give me a practice problem" asks for a problem, not the answer', has(pp, 'explicit.quiz') && !has(pp, 'explicit.direct_answer'), J(codes(pp)));
  for (const t of ['test me on the French revolution', 'give me another practice question'])
    ok(`"${t}" → quiz`, has(at([u(t)]), 'explicit.quiz'), J(codes(at([u(t)]))));
  // keeping the answer theirs is not a quiz (round 4): no question is added, and a "stop asking" stands
  for (const t of ["I want to work it out myself, don't tell me the answer", 'give me a hint'])
    ok(`"${t}" → own_try, not a quiz, not the answer`, has(at([u(t)]), 'explicit.own_try') && !has(at([u(t)]), 'explicit.quiz') && !has(at([u(t)]), 'explicit.direct_answer'), J(codes(at([u(t)]))));
  const iv = at([u('write 5 interview questions for my candidate')]);
  ok('questions written for somebody else are content, not a wish to be asked', !has(iv, 'explicit.wants_questions') && !has(iv, 'explicit.quiz'), J(codes(iv)));
  ok('"just tell me" → direct_answer', has(at([u('just tell me the answer')]), 'explicit.direct_answer'));
  ok('"you do it" (delegation) → direct_answer', has(at([u('write it for me')]), 'explicit.direct_answer'));
  ok("\"don't just tell me the answer\" → no direct_answer", !has(at([u("don't just tell me the answer")]), 'explicit.direct_answer'));
}

console.log('\n=== quoted text is not their instruction ===');
for (const t of ['he said "stop asking questions" and I laughed', 'my teacher wrote “just tell me the answer” on the board', '> stop asking me questions\n\nwhat does this quote mean?', 'the error is `too long` — why?', '```\n// TODO: make it shorter, stop asking\n```'])
  ok(`${J(t.slice(0, 40))}… → nothing explicit`, explicitOf(at([u(t)])).length === 0, J(codes(at([u(t)]))));

console.log('\n=== Socria kept asking, and it went nowhere ===');
{
  const msgs = [
    u('how do I find the derivative of x^3?'),
    a('Good question. What do you remember about the power rule?'),
    u('idk'),
    a('No problem. What happens to the exponent when you differentiate a power of x?'),
    u('just tell me'),
  ];
  const o = at(msgs);
  ok('two asking replies answered by "idk" and "just tell me" → question_streak + unproductive_questions', has(o, 'observed.question_streak') && has(o, 'observed.unproductive_questions'), J(codes(o)));
  const up = get(o, 'observed.unproductive_questions');
  ok('...observed, moderate, ~0.75', up.provenance === 'observed' && up.strength === 'moderate' && Math.abs(up.confidence - 0.75) < 0.051, J(up));
  ok('...refs: each asking reply and each answer that did not advance, as codes', J(up.refs) === J([
    { turn: 1, role: 'assistant', code: 'reply.asked' }, { turn: 2, role: 'user', code: 'answer.direct_request' },
    { turn: 0, role: 'assistant', code: 'reply.asked' }, { turn: 1, role: 'user', code: 'answer.dont_know' },
  ]), J(up.refs));
  ok('question_streak: observed, moderate ~0.7', get(o, 'observed.question_streak').strength === 'moderate' && Math.abs(get(o, 'observed.question_streak').confidence - 0.7) < 0.051);

  const tried = at([
    u('how do I find the derivative of x^3?'),
    a('What do you remember about the power rule?'),
    u('you bring the exponent down in front and then lower the power by one'),
    a('Right. So what does that give for x^3?'),
    u('three times x squared, I think, because the power goes from three to two'),
  ]);
  ok('the same streak answered with real attempts → a streak, but not unproductive', has(tried, 'observed.question_streak') && !has(tried, 'observed.unproductive_questions'), J(codes(tried)));

  const one = at([u('how do I find the derivative of x^3?'), a('What do you remember about the power rule?'), u('idk')]);
  ok('one asking reply and an "idk" is not a streak', !has(one, 'observed.question_streak') && !has(one, 'observed.unproductive_questions'), J(codes(one)));

  const math = at([u('differentiate x^3'), a('What is the exponent here?'), u('3'), a('And what do you get when you bring it down?'), u('3x^2')]);
  ok('short answers that are attempts ("3", "3x^2") advance', !has(math, 'observed.unproductive_questions'), J(codes(math)));

  const decided = at([u('differentiate x^3'), a('What is the exponent here?'), u('three'), a('And what do you get?'), u('three x two')], { verdictsByTurn: { 1: [{ status: 'refuted' }] }, verdicts: [{ status: 'verified' }] });
  ok('answers the engine decided are attempts, whatever their length', !has(decided, 'observed.unproductive_questions'), J(codes(decided)));

  const oks = at([u('help me plan my week'), a('What are your fixed commitments?'), u('ok'), a('Which day is the busiest one?'), u('sure')]);
  ok('"ok", "sure" after two asking replies count only as links in the streak', has(oks, 'observed.unproductive_questions') && has(oks, 'weak.short_reply') && !has(oks, 'explicit.frustration'), J(codes(oks)));

  const mixed = at([u('help me plan my week'), a('What are your fixed commitments?'), u('work 9 to 5 on weekdays, gym on tuesday and thursday evenings'), a('Which day is the busiest one?'), u('ok')]);
  ok('one answer that advanced breaks it: no unproductive_questions', !has(mixed, 'observed.unproductive_questions') && has(mixed, 'observed.question_streak'), J(codes(mixed)));

  const quiz = at([u('quiz me on capitals'), a('What is the capital of France?'), u('idk'), a('What is the capital of Spain?'), u('quiz me on something easier')]);
  ok('asking for questions is not "no progress"', !has(quiz, 'observed.unproductive_questions'), J(codes(quiz)));

  const offers = at([u('what is 2+2'), a('It is 4. Does that make sense?'), u('ok'), a('Glad to help. Want me to explain more?'), u('sure')]);
  ok('closing offers ("does that make sense?") are not asking replies', !has(offers, 'observed.question_streak'), J(codes(offers)));
}

console.log('\n=== stopping questions is standing; frustration is only their word ===');
{
  const s = at([u('stop asking me questions')]);
  ok('"stop asking me questions" → stop_questions, standing (a standing kind)', get(s, 'explicit.stop_questions')?.standing === true, J(s));
  ok('...and NOT explicit.frustration (readSignals sets it on any stop; a stop is not a feeling)', !has(s, 'explicit.frustration'), J(codes(s)));
  ok('...and no explicit.standing: no "from now on" was said', !has(s, 'explicit.standing'));
  const f = at([u('ugh, stop asking me questions')]);
  ok('"ugh, stop asking me questions" → frustration (their word) + stop', has(f, 'explicit.frustration') && has(f, 'explicit.stop_questions'), J(codes(f)));
  const fr = get(at([u('this is frustrating, I have been stuck for an hour')]), 'explicit.frustration');
  ok('"this is frustrating" → explicit.frustration, explicit, never observed', fr && fr.provenance === 'explicit', J(fr));
  ok('"come online at 5" is not "come on"', !has(at([u('stop asking me questions, I will come online at 5')]), 'explicit.frustration'));
}

console.log('\n=== standing: "from now on" ===');
{
  const o = at([u('explain limits'), a(explanation(300)), u('From now on, keep your answers short')]);
  ok('"from now on, keep your answers short" → shorter (standing) + explicit.standing', get(o, 'explicit.shorter')?.standing === true && has(o, 'explicit.standing') && get(o, 'explicit.standing').standing === true, J(o));
  const st = at([u('From now on, stop asking me questions')]);
  ok('"from now on, stop asking me questions" → standing stop + explicit.standing', get(st, 'explicit.stop_questions')?.standing === true && has(st, 'explicit.standing'));
  const always = at([u('I always forget the chain rule, can you explain it in simpler terms')]);
  ok('"I always forget…" is not a standing instruction (readSignals horizon alone is not enough)', has(always, 'explicit.simpler') && !has(always, 'explicit.standing') && !get(always, 'explicit.simpler').standing, J(always));
  ok('"always give me the answer first" is', has(at([u('please always give me the answer first, just tell me')]), 'explicit.standing'));
  const feel = at([u('from now on I feel so confused by this')]);
  ok('a feeling is never made standing', !has(feel, 'explicit.standing'), J(codes(feel)));
}

console.log('\n=== revoking an earlier instruction ===');
{
  const base = [u('stop asking me questions'), a(ANSWERED), u('thanks'), a(ANSWERED)];
  const r = at([...base, u('ok, you can ask me questions again')]);
  ok('"you can ask me questions again" after a stop → explicit.revoke (+ wants_questions)', has(r, 'explicit.revoke') && has(r, 'explicit.wants_questions'), J(codes(r)));
  const q = at([...base, u('quiz me on this')]);
  const rv = get(q, 'explicit.revoke');
  ok('asking to be quizzed while a stop stands is a revocation, with refs to both turns and what it takes back (questions)', rv && J(rv.refs) === J([{ turn: 2, role: 'user', code: 'explicit.wants_questions' }, { turn: 0, role: 'user', code: 'explicit.stop_questions' }, { turn: 2, role: 'user', code: 'revoke.questions' }]), J(q));
  ok('without an earlier stop, "quiz me" revokes nothing', !has(at([u('what is a limit'), a(ANSWERED), u('quiz me on this')]), 'explicit.revoke'));
  const twice = at([u('stop asking me questions'), a(ANSWERED), u('ask me questions again'), a(ANSWERED), u('quiz me')]);
  ok('a stop already revoked is not revoked again', !has(twice, 'explicit.revoke'), J(codes(twice)));
  for (const t of ['go back to how you were', 'never mind, ask away'])
    ok(`"${t}" → revoke`, has(at([u(t)]), 'explicit.revoke'));
  ok("\"don't go back to how you were\" → no revoke", !has(at([u("don't go back to how you were")]), 'explicit.revoke'));
}

console.log('\n=== length, simplicity, verification, writing ===');
{
  const after = (t) => at([u('explain recursion'), a(explanation(200)), u(t)]);
  for (const t of ['too long', "that's way too long", 'tl;dr', 'shorter please', 'keep it short', 'explain it in one sentence', 'briefly, what is it', 'wall of text, get to the point'])
    ok(`"${t}" → shorter`, has(after(t), 'explicit.shorter'), J(codes(after(t))));
  ok('"in under 100 words" → shorter (under the policy ceiling)', has(after('say it in under 100 words'), 'explicit.shorter'));
  ok('"in about 400 words" is not "shorter"', !has(after('write it in about 400 words'), 'explicit.shorter'));
  for (const t of ['which route is shorter?', 'my essay is too long, can you help me cut it', "don't make it shorter"])
    ok(`"${t}" → no shorter`, !has(after(t), 'explicit.shorter'), J(codes(after(t))));
  ok('"it\'s too long" as an opening message (no reply to be too long) → no shorter', !has(at([u("it's too long")]), 'explicit.shorter'));
  for (const t of ['can you go into more detail', 'explain more', 'can you elaborate', "that's too short"])
    ok(`"${t}" → longer`, has(after(t), 'explicit.longer'));
  ok('"an elaborate plan" is not a request', !has(at([u('help me make an elaborate plan for the party')]), 'explicit.longer'));
  for (const t of ['explain it like I\'m five', 'in plain English please', 'ELI5', 'that is too technical', 'can you dumb it down'])
    ok(`"${t}" → simpler`, has(after(t), 'explicit.simpler'));
  ok('"simplify 2x + 4x" is algebra, not a request for simpler', !has(at([u('simplify 2x + 4x')]), 'explicit.simpler'));
  for (const t of ['are you sure?', 'can you double-check that', 'cite your sources', 'x = 4, is that right?'])
    ok(`"${t}" → verify`, has(after(t), 'explicit.verify'));
  for (const t of ['how do I verify my email address', "I'll double-check it tomorrow"])
    ok(`"${t}" → no verify`, !has(at([u(t)]), 'explicit.verify'), J(codes(at([u(t)]))));

  const g = at([u('just fix the grammar in my essay, don\'t rewrite it')], { work: 'creation' });
  ok('"just fix the grammar in my essay" → edit_only + writing_task', has(g, 'explicit.edit_only') && has(g, 'observed.writing_task'), J(codes(g)));
  ok('...writing_task rests on their words: provenance observed', get(g, 'observed.writing_task').provenance === 'observed');
  for (const t of ['only proofread it', 'just check spelling', 'only the typos please'])
    ok(`"${t}" → edit_only`, has(at([u(t)]), 'explicit.edit_only'));
  const code = at([u("don't rewrite the function, just fix the bug")]);
  ok('"don\'t rewrite the function" → edit scope, but not a writing task', has(code, 'explicit.edit_only') && !has(code, 'observed.writing_task'), J(codes(code)));
  const own = at([u("I want to write it myself, it's my cover letter")]);
  ok('"I want to write it myself, it\'s my cover letter" → own_work + writing_task', has(own, 'explicit.own_work') && has(own, 'observed.writing_task'), J(codes(own)));
  const est = at([u("I want to write it myself")], { work: 'creation' });
  ok('own_work with the runtime reading creation → writing_task, ref work.creation (what it rests on)', J(get(est, 'observed.writing_task')?.refs) === J([{ turn: 0, role: 'user', code: 'work.creation' }]), J(est));
}

console.log('\n=== confusion after an explanation, again ===');
{
  const msgs = [
    u('what is a derivative'),
    a(explanation(70)),
    u("I still don't get it"),
    a(explanation(90)),
    u("that doesn't make sense"),
  ];
  const o = at(msgs);
  const rc = get(o, 'observed.repeated_confusion');
  ok('confused twice, each after a reply that explained → repeated_confusion', !!rc && has(o, 'explicit.confused'), J(codes(o)));
  ok('...observed, moderate, ~0.8, refs: each explaining reply and each confusion', rc.provenance === 'observed' && rc.strength === 'moderate' && Math.abs(rc.confidence - 0.8) < 0.051 && J(rc.refs) === J([
    { turn: 0, role: 'assistant', code: 'reply.explained' }, { turn: 1, role: 'user', code: 'explicit.confused' },
    { turn: 1, role: 'assistant', code: 'reply.explained' }, { turn: 2, role: 'user', code: 'explicit.confused' },
  ]), J(rc));
  const c1 = get(at(msgs.slice(0, 3)), 'explicit.confused');
  ok('"I still don\'t get it" → explicit.confused, strong', c1 && c1.provenance === 'explicit' && c1.strength === 'strong', J(c1));
  ok('once is not repeated', !has(at(msgs.slice(0, 3)), 'observed.repeated_confusion'));
  const qOnly = at([u('what is a derivative'), a('What do you think a rate of change is?'), u("I'm confused"), a('What happens to y when x grows?'), u("I'm lost")]);
  ok('confusion after question-only replies is not a failed explanation', has(qOnly, 'explicit.confused') && !has(qOnly, 'observed.repeated_confusion'), J(codes(qOnly)));
  const later = at([...msgs, a(explanation(60)), u('oh ok that helps, thanks')]);
  ok('repeated confusion is read at a confused turn only (not after "that helps")', !has(later, 'observed.repeated_confusion') && has(later, 'explicit.positive'), J(codes(later)));
  for (const t of ["I don't understand why my build fails", "it doesn't make sense that this returns null", "I'm confused about which laptop to buy"])
    ok(`"${t}" → not confusion about an explanation`, !has(at([u(t)]), 'explicit.confused'), J(codes(at([u(t)]))));
  for (const t of ["I'm still confused", "I don't follow", 'you lost me', "I'm completely lost now", "I still don't see why"])
    ok(`"${t}" → confused`, has(at([u('x'), a(explanation()), u(t)]), 'explicit.confused'));
}

console.log('\n=== the engine\'s verdicts ===');
{
  const msgs = [u('find the derivative of x^3'), a('Try it: what do you get?'), u('x^2'), a('Not quite. Try again?'), u('3x')];
  const f = at(msgs, { verdictsByTurn: { 1: [{ status: 'refuted' }] }, verdicts: [{ status: 'refuted' }] });
  const fa = get(f, 'observed.failed_attempts');
  ok('two refuted attempts in the window → failed_attempts, observed, strong', fa && fa.provenance === 'observed' && fa.strength === 'strong' && J(fa.refs) === J([{ turn: 1, role: 'user', code: 'verdict.refuted' }, { turn: 2, role: 'user', code: 'verdict.refuted' }]), J(f));
  ok('...and this turn\'s refuted verdict → verified_incorrect, strong, 1.0', get(f, 'observed.verified_incorrect')?.confidence === 1 && get(f, 'observed.verified_incorrect').strength === 'strong');
  ok('one refuted attempt is not "repeatedly"', !has(at(msgs, { verdicts: [{ status: 'refuted' }] }), 'observed.failed_attempts'));
  const fixed = at([...msgs, a('Close. One more go?'), u('3x^2')], { verdictsByTurn: { 1: [{ status: 'refuted' }], 2: [{ status: 'refuted' }] }, verdicts: [{ status: 'verified' }] });
  ok('a verified attempt since ends it', !has(fixed, 'observed.failed_attempts') && has(fixed, 'observed.verified_correct'), J(codes(fixed)));
  const old = at([u('a'), a('b'), u('c'), a('d'), u('e'), a('f'), u('g'), a('h'), u('i'), a('j'), u('k'), a('l'), u('m'), a('n'), u('o')], { verdictsByTurn: { 0: [{ status: 'refuted' }], 1: [{ status: 'refuted' }] }, verdicts: [] });
  ok('refutations older than the last 6 turns do not count', !has(old, 'observed.failed_attempts'), J(codes(old)));
  const viaMap = at(msgs, { verdictsByTurn: { 1: [{ status: 'refuted' }], 2: [{ status: 'refuted' }] } });
  ok('this turn\'s verdicts may come from verdictsByTurn when ctx.verdicts is absent', has(viaMap, 'observed.failed_attempts') && has(viaMap, 'observed.verified_incorrect'));
  ok('no verdicts → no verdict observations', !codes(at(msgs)).some((c) => c.startsWith('observed.verified') || c === 'observed.failed_attempts'));
}

console.log('\n=== the same request again ===');
{
  const o = at([u('how do I convert a csv file to json in python'), a('You could use pandas. Have you installed it?'), u('how do I convert csv to json with python')]);
  const rr = get(o, 'observed.repeated_request');
  ok('the same request reworded → repeated_request, moderate ~0.7, refs to both messages', rr && rr.strength === 'moderate' && J(rr.refs) === J([{ turn: 1, role: 'user', code: 'request.repeat' }, { turn: 0, role: 'user', code: 'request.original' }]), J(o));
  ok('a different question is not a repeat', !has(at([u('how do I convert a csv file to json in python'), a(ANSWERED), u('how do I sort a list of dictionaries by a key')]), 'observed.repeated_request'));
  ok('"another practice problem" again is asking for more, not the same thing', !has(at([u('give me another practice problem on derivatives please'), a('Differentiate x^5.'), u('give me another practice problem on derivatives please')]), 'observed.repeated_request'));
  ok('short messages (under 4 content words) are never compared', !has(at([u('what is pi'), a(ANSWERED), u('what is pi')]), 'observed.repeated_request'));
  const far = at([u('how do I convert a csv file to json in python'), a('a'), u('one two three four five'), a('b'), u('six seven eight nine ten'), a('c'), u('eleven twelve thirteen fourteen'), a('d'), u('how do I convert a csv file to json in python')]);
  ok('only their previous 3 messages are compared', !has(far, 'observed.repeated_request'), J(codes(far)));
}

console.log('\n=== replies far longer than the messages they answered ===');
{
  const long = explanation(300);
  const msgs = [u('what is entropy'), a(long), u('and enthalpy?'), a(long), u('and free energy'), a(long), u('ok so which one matters here')];
  const v = get(at(msgs), 'observed.verbose_replies');
  ok('three ~300-word replies to short messages → verbose_replies, moderate ~0.65', v && v.strength === 'moderate' && Math.abs(v.confidence - 0.65) < 0.051 && v.refs.length === 3 && v.refs.every((r) => r.role === 'assistant'), J(v));
  ok('their length setting "detailed" → not verbose', !has(at(msgs, { length: 'detailed' }), 'observed.verbose_replies'));
  const mid = [u('what is entropy'), a(long), u('and enthalpy?'), a(explanation(150)), u('and free energy'), a(long), u('ok')];
  ok('one reply under params.verboseWords breaks the run', !has(at(mid), 'observed.verbose_replies'));
  const asked = [u('what is entropy'), a(long), u('explain enthalpy in more detail'), a(long), u('and free energy'), a(long), u('ok')];
  ok('a long reply to "in more detail" is not verbose', !has(at(asked), 'observed.verbose_replies'));
  const paste = 'Here is my lab report: ' + 'The sample was heated to 300 kelvin and the pressure recorded each minute. '.repeat(4);
  const pasted = [u(paste), a(long), u(paste), a(long), u(paste), a(long), u('thanks')];
  ok('long replies to long messages are not verbose (the ratio)', !has(at(pasted), 'observed.verbose_replies'));
}

console.log('\n=== what kind of work is on the table ===');
{
  const r = get(at([u('convert 5 miles to km')], { work: 'execution' }), 'observed.routine_task');
  ok('work=execution → routine_task, moderate, its ref naming the runtime\'s reading it rests on (work.execution)', r && r.provenance === 'observed' && r.strength === 'moderate' && J(r.refs) === J([{ turn: 0, role: 'user', code: 'work.execution' }]), J(r));
  ok('work=information → routine_task', has(at([u('what is the capital of Peru')], { work: 'information' }), 'observed.routine_task'));
  ok('a stated learning goal → not routine', !has(at([u("I'm learning unit conversion, convert 5 miles to km")], { work: 'execution' }), 'observed.routine_task'));
  ok('work=explanation → not routine', !has(at([u('why is the sky blue')], { work: 'explanation' }), 'observed.routine_task'));
  ok('no work reading → nothing', !has(at([u('convert 5 miles to km')]), 'observed.routine_task'));

  const p = [u("I'm learning calculus for my exam"), a(ANSWERED), u('what is the derivative of sin x'), a(ANSWERED), u('and of cos x')];
  const pr = get(at(p, { work: 'information' }), 'observed.practice');
  ok('a learning goal two turns back still stands → observed.practice, ref to where it was said', pr && pr.provenance === 'observed' && J(pr.refs) === J([{ turn: 0, role: 'user', code: 'explicit.learning_goal' }]), J(pr));
  ok('...and a lookup during practice is not routine', !has(at(p, { work: 'information' }), 'observed.routine_task'));
  ok('"let\'s stop there for today" ends it', !has(at([...p, a(ANSWERED), u("let's stop there for today")]), 'observed.practice'));
  ok('a quiz is practice from the turn it is asked', has(at([u('quiz me on derivatives')]), 'observed.practice'));
  ok('"stop asking me questions" ends a quiz', !has(at([u('quiz me on derivatives'), a('What is the derivative of x^2?'), u('stop asking me questions')]), 'observed.practice'));
}

console.log('\n=== feedback: satisfaction only ===');
{
  const pos = get(at([u('x'), a(ANSWERED), u('thanks, that helped')]), 'explicit.positive');
  ok('"thanks, that helped" → explicit.positive, confidence ≤ 0.6 (satisfaction, not learning)', pos && pos.provenance === 'explicit' && pos.confidence <= 0.6, J(pos));
  const neg = get(at([u('x'), a(ANSWERED), u("that's not helpful")]), 'explicit.negative');
  ok('"that\'s not helpful" → explicit.negative, strong', neg && neg.strength === 'strong');
}

// ── review: false positives that changed how Socria helps ─────────────
// Each of these fired before the review, and each would have changed the
// help for somebody who asked for nothing: a quiz holds the answer back for
// the whole conversation, "shorter" is a conversation-long ceiling, "longer"
// revokes their "keep it short", wants_questions revokes their "stop asking".
const after = (t) => at([u('help me with this'), a(explanation(80)), u(t)]);
const none = (t, ...cs) => {
  const o = after(t);
  return cs.every((c) => !has(o, c));
};

console.log('\n=== review: their own next question is not a quiz ===');
for (const t of ['Next question: how do I sort a list in python?', 'Another question, how do I reverse a string', 'One more question - what is a closure?', 'I have one more question, though', 'Another question. How do I sort a dict?'])
  ok(`"${t}" → no quiz, no wants_questions`, none(t, 'explicit.quiz', 'explicit.wants_questions'), J(codes(after(t))));
for (const t of ['Correct! Next question?', 'another question please', 'ok, one more problem'])
  ok(`"${t}" (the whole message) → quiz`, has(after(t), 'explicit.quiz'), J(codes(after(t))));

console.log('\n=== review: code tests, questions for others, and somebody else testing them ===');
for (const t of ['write me a test for this function', 'give me a test case for the parser', 'show me a problem with my code', 'give me some questions to ask at the interview', 'give me questions I can ask the interviewer', 'can I get a question answered about taxes', 'Can I have a question about the homework?', 'the exam will test me on chapter 3', 'the doctor will examine me tomorrow', 'you always ask me questions', 'why do you quiz me'])
  ok(`"${t}" → no quiz, no wants_questions`, none(t, 'explicit.quiz', 'explicit.wants_questions'), J(codes(after(t))));
for (const t of ['give me a practice test on chapter 3', 'can you test me on chapter 3', 'could you quiz me on this', 'can I have another problem'])
  ok(`"${t}" → quiz`, has(after(t), 'explicit.quiz'), J(codes(after(t))));

console.log('\n=== review: a negated wish to be asked is not one ===');
for (const t of ["don't quiz me", 'please don\'t test me on this', "I don't want you to quiz me"])
  ok(`"${t}" → no wants_questions, no quiz`, none(t, 'explicit.wants_questions', 'explicit.quiz'), J(codes(after(t))));
{
  const stop = [u('stop asking me questions'), a(ANSWERED), u('thanks'), a(ANSWERED)];
  ok('"don\'t quiz me" while a stop stands does not revoke it', !has(at([...stop, u("don't quiz me")]), 'explicit.revoke'), J(codes(at([...stop, u("don't quiz me")]))));
  const dq = after("don't quiz me, just tell me the answer");
  ok('"don\'t quiz me, just tell me the answer" → direct_answer (readSignals\' unnegated "quiz me" does not cancel it)', has(dq, 'explicit.direct_answer') && !has(dq, 'explicit.quiz'), J(codes(dq)));
  const both = at([...stop, u('stop asking me questions and quiz me tomorrow')]);
  ok('a stop and "quiz me" in one message is a stop: no wants_questions, no quiz, no revocation of the earlier stop', has(both, 'explicit.stop_questions') && !has(both, 'explicit.wants_questions') && !has(both, 'explicit.quiz') && !has(both, 'explicit.revoke'), J(codes(both)));
}

console.log('\n=== review: shorter is about the reply, not their text or a comparison ===');
for (const t of ['can you make my essay shorter', 'My essay needs to be shorter.', 'make this paragraph more concise', 'Which is shorter, the train or the bus?', "I'll take the shorter one.", 'The second answer is shorter.', 'tl;dr: I need help with my resume', 'Briefly, I work at a bank and need help', 'In a nutshell, my problem is the API times out', "it's too long to wait for the bus", 'which of these two sentences is shorter?', 'my essay is about 200 words, can you check the grammar', "I don't need it shorter", "I don't want you to make it shorter"])
  ok(`"${t}" → no shorter`, none(t, 'explicit.shorter'), J(codes(after(t))));
for (const t of ['much shorter please', 'a bit shorter please', 'tl;dr?', "that's too long to read", 'answer in 50 words or less', 'keep it to two sentences', 'my essay is fine, but keep your answers short'])
  ok(`"${t}" → shorter`, has(after(t), 'explicit.shorter'), J(codes(after(t))));

console.log('\n=== review: longer, simpler, verify, steps — requests only ===');
for (const t of ["I don't want more detail, just the answer", 'no more detail please', 'if I go further down the road will I find it', 'I read an in-depth article on this', 'The report goes into more detail on page 4', 'Our client wants more depth in the analysis', 'tell me more about the French revolution'])
  ok(`"${t}" → no longer`, none(t, 'explicit.longer'), J(codes(after(t))));
ok('"I don\'t want more detail, just tell me the answer" → direct_answer, and not longer', has(after("I don't want more detail, just tell me the answer"), 'explicit.direct_answer') && none("I don't want more detail, just tell me the answer", 'explicit.longer'));
for (const t of ['Can you go deeper?', 'explain it in depth', 'more detail please', 'I need more detail on step 2'])
  ok(`"${t}" → longer`, has(after(t), 'explicit.longer'), J(codes(after(t))));
for (const t of ['The second method is simpler.', 'Is there a simpler way to do this?', 'This approach is way simpler.'])
  ok(`"${t}" → no simpler`, none(t, 'explicit.simpler'), J(codes(after(t))));
ok('"explain it in a simpler way" → simpler', has(after('explain it in a simpler way'), 'explicit.simpler'));
for (const t of ['Is this true for negative numbers?', 'Is that true of all primes?', 'how do you know when to use the chain rule?', 'I need to double-check with my professor', 'how do I verify that the certificate is valid', "Are you sure you can do this? It's a big file"])
  ok(`"${t}" → no verify`, none(t, 'explicit.verify'), J(codes(after(t))));
for (const t of ['how do you know that?', 'is it correct?', 'are you sure about that'])
  ok(`"${t}" → verify`, has(after(t), 'explicit.verify'), J(codes(after(t))));
for (const t of ['I have to solve it step by step for the exam but I get stuck at part two', 'They show it step by step in the lecture', "I'll list the steps tomorrow", 'Step by step, I got the answer 12', 'I need to explain it step by step to my class'])
  ok(`"${t}" → no show_steps`, none(t, 'explicit.show_steps'), J(codes(after(t))));
ok('"the only grammar rule I remember is i before e" → no edit_only', none('the only grammar rule I remember is i before e', 'explicit.edit_only'));

console.log('\n=== review: readSignals readings IFR does not take as said ===');
for (const t of ['just give me a minute to think', 'just give me a sec'])
  ok(`"${t}" → no direct_answer (time to think, not the answer)`, none(t, 'explicit.direct_answer'), J(codes(after(t))));
ok('"just give me a sec, then just tell me the answer" → still direct', has(after('just give me a sec, then just tell me the answer'), 'explicit.direct_answer'));
ok('"let me know when it is ready" → no own_work', none('let me know when it is ready', 'explicit.own_work'), J(codes(after('let me know when it is ready'))));
ok('"just do it and let me know" → direct_answer (the delegation "let me" had cancelled)', has(after('just do it and let me know'), 'explicit.direct_answer') && !has(after('just do it and let me know'), 'explicit.own_work'), J(codes(after('just do it and let me know'))));
for (const t of ['come on over to my place later', "I'll come on Tuesday"])
  ok(`"${t}" → no frustration`, none(t, 'explicit.frustration'), J(codes(after(t))));
ok('"come on, just tell me" → frustration (their word)', has(after('come on, just tell me'), 'explicit.frustration'));
ok('"I always ask too many questions, just tell me the answer" → direct, but not standing (a habit, not an instruction)', has(after('I always ask too many questions, just tell me the answer'), 'explicit.direct_answer') && none('I always ask too many questions, just tell me the answer', 'explicit.standing'));

console.log('\n=== review: counts that must not run together ===');
{
  const nums = at([u('what is 15% of 80 dollars in total'), a('It is 12 dollars.'), u('what is 20% of 80 dollars in total')]);
  ok('the next problem with different numbers is not a repeated request', !has(nums, 'observed.repeated_request'), J(codes(nums)));
  const same = at([u('what is 15% of 80 dollars in total'), a('Let us think about percentages first.'), u('so what is 15% of 80 dollars in total')]);
  ok('...the same numbers asked again is', has(same, 'observed.repeated_request'), J(codes(same)));
  const msgs = [u('find the derivative of x^3'), a('Try it: what do you get?'), u('x^2'), a('Not quite. Try again?'), u('3x'), a('Close. Again?'), u('3 x to the 2')];
  const unc = at(msgs, { verdictsByTurn: { 1: [{ status: 'refuted' }], 2: [{ status: 'refuted' }] }, verdicts: [{ status: 'unchecked' }] });
  ok('an "unchecked" claim since two refutations neither ends the run nor adds to it', has(unc, 'observed.failed_attempts') && J(get(unc, 'observed.failed_attempts').refs.map((r) => r.turn)) === J([1, 2]), J(codes(unc)));
  const onlyUnc = at(msgs, { verdictsByTurn: { 1: [{ status: 'unchecked' }], 2: [{ status: 'unchecked' }] }, verdicts: [{ status: 'unchecked' }] });
  ok('"unchecked" is never a failure', !has(onlyUnc, 'observed.failed_attempts') && !has(onlyUnc, 'observed.verified_incorrect'));
}

console.log('\n=== review: what a revocation takes back; when a quiz ends ===');
{
  const scope = (t) => get(after(t), 'explicit.revoke')?.refs.map((r) => r.code);
  ok('"you can ask me questions again" takes back questions only', J(scope('you can ask me questions again')) === J(['explicit.revoke', 'revoke.questions']), J(scope('you can ask me questions again')));
  ok('"go back to how you were" takes back everything', J(scope('go back to how you were')) === J(['explicit.revoke', 'revoke.all']), J(scope('go back to how you were')));
  const quiz = [u('quiz me on derivatives'), a('What is the derivative of x^2?'), u('2x'), a('Right. And of x^3?')];
  ok('a quiz ends when they ask for the answer: no observed.practice after "just tell me the answer"', !has(at([...quiz, u('just tell me the answer')]), 'observed.practice'));
  ok('...or the steps', !has(at([...quiz, u('show me the steps')]), 'observed.practice'));
  const goal = [u("I'm learning calculus for my exam"), a(ANSWERED), u('what is the derivative of sin x'), a(ANSWERED)];
  ok('a stated learning goal does not end on "just tell me this one"', has(at([...goal, u('just tell me this one')]), 'observed.practice'));
}

console.log('\n=== review: ordinary messages say nothing about how to help ===');
{
  const ORDINARY = ['How do I reverse a linked list in Java?', 'Write a unit test for this function please', 'I wrote a test for the parser but it fails on empty input', 'I have a question about my tax return', 'Quick question: is Python pass by reference?', "What's the next step after installing node?", 'Is the shorter path always the optimal one in Dijkstra?', 'My cover letter is too long, can you help me cut it to one page', 'Can you make my resume more concise?', "What's a simpler way to compute the gcd?", 'Is it true that water boils at 100C everywhere?', 'How do you know if a number is prime?', 'I need to verify my account, where do I click?', 'I double-checked the units and they are right', "I'm lost in this city, which bus goes downtown?", "I don't understand why my build fails on CI", 'Go back to the second paragraph and check the date', 'You can ask my manager about it', 'I always forget the quadratic formula', 'Every time I run the script it crashes', 'Give me some questions for my book club', 'Make me a quiz for my 5th graders', "I'll practice it tonight", 'I need to practice my speech, help me write it', 'The recipe has five steps', 'I followed the steps and it still did not work', "It's way too long since we last spoke", 'Come on in, the door is open', 'Convert 5 miles to km', 'Fix the typo in line 3 of my code'];
  const ACTED = ['explicit.quiz', 'explicit.wants_questions', 'explicit.stop_questions', 'explicit.shorter', 'explicit.longer', 'explicit.simpler', 'explicit.verify', 'explicit.show_steps', 'explicit.edit_only', 'explicit.revoke', 'explicit.direct_answer', 'explicit.frustration', 'explicit.standing'];
  const hits = ORDINARY.map((t) => [t, codes(after(t)).filter((c) => ACTED.includes(c))]).filter(([, c]) => c.length);
  ok(`${ORDINARY.length} ordinary messages → none of the codes the policy acts on`, hits.length === 0, J(hits));
}

console.log('\n=== invariants over a corpus ===');
{
  const corpus = [
    [u('how do I find the derivative of x^3?'), a('What do you remember about the power rule?'), u('idk'), a('What happens to the exponent?'), u('ugh just tell me, stop asking me questions'), a(explanation(300)), u('too long. from now on keep it short'), a(explanation(300)), u("I still don't get it"), a(explanation(300)), u('ok'), a(ANSWERED), u('sure'), a(ANSWERED), u('fine')],
    [u('quiz me on capitals'), a('What is the capital of France?'), u('Paris'), a('What is the capital of Peru?'), u('no idea'), a('What about Chile?'), u('just tell me the answers'), a('Lima and Santiago.'), u('you can ask me questions again')],
    [u('just fix the grammar in my essay'), a('Here are the fixes.'), u('are you sure? cite your sources'), a(ANSWERED), u('thanks, that helped')],
  ];
  const PROV = new Set(['observed', 'explicit', 'estimate', 'hypothesis']);
  const STR = new Set(['strong', 'moderate', 'weak']);
  const all = [];
  for (const msgs of corpus) {
    const turns = M.turnsOf(msgs);
    turns.forEach((_, k) => all.push(...M.observeTurn(turns, k, { params, work: 'information', verdictsByTurn: { 1: [{ status: 'refuted' }] }, length: 'standard' })));
  }
  ok('the corpus produces observations of many kinds', new Set(codes(all)).size >= 15, J([...new Set(codes(all))]));
  ok('every code is an OBSERVATION_CODE; provenance and strength are valid; 0 ≤ confidence ≤ 1', all.every((o) => M.OBSERVATION_CODES.includes(o.code) && PROV.has(o.provenance) && STR.has(o.strength) && o.confidence >= 0 && o.confidence <= 1));
  ok('weak.* is always a weak hypothesis at ≤ 0.3', all.filter((o) => o.code.startsWith('weak.')).every((o) => o.provenance === 'hypothesis' && o.strength === 'weak' && o.confidence <= 0.3));
  ok('nothing else is a hypothesis; explicit.* is always explicit; observed.* never explicit', all.every((o) => (o.code.startsWith('weak.') ? true : o.provenance !== 'hypothesis') && (!o.code.startsWith('explicit.') || o.provenance === 'explicit') && (!o.code.startsWith('observed.') || o.provenance === 'observed')));
  ok('frustration is never observed — only their word', all.filter((o) => o.code === 'explicit.frustration').every((o) => o.provenance === 'explicit'));
  ok('every observation has at least one ref', all.every((o) => o.refs.length > 0));
  const refs = all.flatMap((o) => o.refs);
  ok('refs are content-free: {turn, role, code} only, codes are code-shaped', refs.every((r) => J(Object.keys(r).sort()) === J(['code', 'role', 'turn']) && Number.isInteger(r.turn) && /^[a-z_]+(?:\.[a-z_]+)+$/.test(r.code)), J(refs.find((r) => !/^[a-z_]+(?:\.[a-z_]+)+$/.test(r.code))));
  const words = ['derivative', 'capital', 'grammar', 'essay', 'paris', 'sources', 'ugh', 'idk', 'lima'];
  ok('no word of the transcript appears in any observation', !words.some((w) => J(all).toLowerCase().includes(w)));
  const sorted = (obs) => obs.every((o, i) => i === 0 || M.OBSERVATION_CODES.indexOf(obs[i - 1].code) < M.OBSERVATION_CODES.indexOf(o.code));
  const turns = M.turnsOf(corpus[0]);
  ok('each turn\'s observations are in OBSERVATION_CODES order, each code at most once', turns.every((_, k) => sorted(M.observeTurn(turns, k, { params }))));
  ok('observeTurn out of range → []', M.observeTurn(turns, 99, { params }).length === 0 && M.observeTurn([], 0, { params }).length === 0);
}

console.log('\n=== determinism and cost ===');
{
  const msgs = [u('how do I find the derivative of x^3?'), a('What do you remember about the power rule?'), u('idk'), a('What happens to the exponent?'), u('just tell me')];
  const ctx = { params, work: 'execution', verdictsByTurn: { 1: [{ status: 'refuted' }] }, verdicts: [{ status: 'refuted' }] };
  const one = M.observeTurn(M.turnsOf(msgs), 2, ctx);
  const two = M.observeTurn(M.turnsOf(msgs), 2, ctx);
  const again = M.observeTurn(M.turnsOf(msgs), 2, ctx);
  ok('same input → deep-equal output (fresh views, and the memo)', J(one) === J(two) && J(two) === J(again) && one.length > 0);
  const every = M.observeEveryTurn(M.turnsOf(msgs), { params });
  ok('observeEveryTurn: one array per turn, equal to observeTurn at each', every.length === 3 && J(every[2]) === J(M.observeTurn(M.turnsOf(msgs), 2, { params, work: null })), J(every));

  const big = [];
  for (let i = 0; i < 24; i++) big.push(u(('please explain the next part of the proof and why it holds ' + i + ' ').repeat(90)), a(explanation(400) + ' What do you think comes next?'));
  big.push(u('x'.repeat(6000)));
  const t0 = Date.now();
  const bt = M.turnsOf(big);
  bt.forEach((_, k) => M.observeTurn(bt, k, { params }));
  const ms = Date.now() - t0;
  ok(`25 long turns (6000-character messages) observed in ${ms} ms (< 1500)`, ms < 1500, ms);
}

console.log(`\nmr-ifr: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
