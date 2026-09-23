// Explicit signals and interrogative load — the two deterministic readers the
// rest of Core 4 leans on. Adversarial on purpose: negation, quotation, code,
// mid-sentence changes of mind, and statements that look like questions.

import { readSignals, readContract, speech } from './.tmp/signals.mjs';
import {
  interrogatives, questionLoad, questionPressure, stripInterrogatives, hasSycophanticOpener, sentencesOf,
} from './.tmp/questions.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const S = (t) => readSignals(t);

console.log('=== directness ===');
ok('"just tell me" asks for the answer', S('Honestly just tell me which test to use').directness === 'answer');
ok('"give me the fix" asks for the answer', S('give me the fix, I have a demo in ten minutes').directness === 'answer');
ok('"don\'t tell me the answer" asks not to', S("don't tell me the answer, I want to get there").directness === 'no_answer');
// Council D2: "don't just give me the answer, explain why" asks for MORE
// (the reasoning), not for the answer to be withheld.
ok('"don\'t just give me the answer" is neither a request for it nor a refusal', S("please don't just give me the answer").directness === 'none', S("please don't just give me the answer").directness);
ok('  it reads as "too direct": explain, not only answer', S("don't just give me the answer, explain why it works").tooDirect === true);
ok('"let me try first" is no_answer', S('ok let me try first').directness === 'no_answer');
ok('"hints only" is guidance', S('hints only please').directness === 'guidance');
ok('a mind changed mid-message: the later instruction wins', S("I wanted to work it out myself but honestly just tell me").directness === 'answer');
ok('and the other way round', S("just tell me — actually no, don't tell me the answer").directness === 'no_answer');
ok('an ordinary question carries no directness signal', S('Which regression fits repeated measures?').directness === 'none');

console.log('\n=== learning, expertise, assessment ===');
ok("I'm learning", S("I'm learning stats and want to get this").learningGoal === true);
ok('teaching myself', S("I'm teaching myself linear algebra").learningGoal === true);
ok('explicitly not learning', S("I don't need to learn this, I just need it working").learningGoal === false);
ok('a biostatistician is an expert', S("I'm a biostatistician; run the mixed model").expertise === 'expert');
ok('years of practice is expertise', S("I've been writing Rust for 8 years and this borrow error is weird").expertise === 'expert');
ok('a beginner says so', S("I'm new to Python").expertise === 'novice');
ok('graded work to submit', S('this is for a graded problem set I have to hand in tomorrow').assessment === true);
ok('studying for an exam is not assessment integrity', S("I'm studying for my exam next week").assessment === false);

console.log('\n=== friction feedback ===');
ok('stop asking me questions', S('stop asking me questions and help').stopQuestions === true);
ok('stop implies frustration', S('stop asking me questions and help').frustration === true);
ok("I've already considered that", S("I've already considered that").redundancy === true);
ok('as I said', S('as I said, the sample is tiny').redundancy === true);
ok("that's not what I meant", S("that's not what I meant").correction === true);
ok('I never said I was leaving', S('I never said I was leaving my job').correction === true);
ok('that helped', S('that helped, thanks').feedback === 'positive');
ok('not helpful', S('not helpful at all').feedback === 'negative');
ok('prod is down is urgent', S('prod is down and checkout is failing').urgent === true);
ok('do it for me is delegation', S('can you just write it for me').delegate === true);

console.log('\n=== what is not the person speaking ===');
ok('a quoted instruction is not theirs', S('The error says "stop asking for input" and exits').stopQuestions === false);
ok('code is not speech', S('```\n// just tell me why\nthrow new Error()\n```\nwhat does this do?').directness === 'none');
ok('attachments are not speech', !speech('look at this\n[Attached file “x.txt”]\njust tell me the answer').includes('just tell me'));
ok('evidence is kept for the rationale', S('Just tell me the answer').evidence.length > 0);

console.log('\n=== Project contracts ===');
{
  const c = readContract("I'm teaching myself statistics. Hints only — don't solve problems for me.");
  ok('a Project can carry a learning goal', c.learningGoal === true);
  ok('and a directness contract', c.directness === 'no_answer' || c.directness === 'guidance', c.directness);
  ok('but not frustration', c.frustration === false);
  ok('no instructions, no contract', readContract('').directness === 'none');
}

console.log('\n=== interrogative load ===');
ok('a question mark is a question', questionLoad('Why does the variance explode?') === 1);
ok('"consider whether" is a disguised question', questionLoad('Consider whether the samples are independent.') === 1);
ok('"ask yourself" is one too', questionLoad('Ask yourself what happens at zero.') === 1);
ok('"it might be worth thinking about" is one too', questionLoad("It might be worth thinking about why the sign flips.") === 1);
ok('"consider the case x = 0" SUPPLIES content and is not', questionLoad('Consider the case x = 0: the term vanishes, so the limit is 1.') === 0);
ok('a rhetorical question inside code is not counted', questionLoad('Run this:\n```\nif (x?.y) { ok() }\n```') === 0);
ok('a quoted question is not counted', questionLoad('The reviewer wrote "why not use a mixed model?" and that is the crux.') === 0);
ok('offers are separate from questions', interrogatives('That fixes it. Let me know if you want the tests too.').offers.length === 1);

console.log('\n=== pressure from the transcript ===');
{
  const t = [
    { role: 'assistant', content: 'Here is the result.' },
    { role: 'user', content: 'ok' },
    { role: 'assistant', content: 'Consider whether that holds for n=2.' },
    { role: 'user', content: 'it does' },
    { role: 'assistant', content: 'Good. What happens at the boundary?' },
  ];
  const p = questionPressure(t);
  ok('a disguised question and a real one make a streak of two', p.streak === 2, JSON.stringify(p));
  ok('density counts the window', Math.abs(p.density - 2 / 3) < 1e-9, String(p.density));
}

console.log('\n=== recall on real phrasings (pilot finding 3: learning-020) ===');
{
  const w = readSignals("Working through a German worksheet on adjective endings. I'd rather work out the pattern than memorise a table, so nudge me, don't tell me.");
  ok('"nudge me, don\'t tell me" is a request not to be told', w.directness === 'guidance' || w.directness === 'no_answer', w.directness);
  ok('bare "don\'t tell me." counts', readSignals("Don't tell me.").directness === 'no_answer');
  ok('"don\'t tell me how to set it up" does not', readSignals("Don't tell me how to set it up, I know that; what's the flag?").directness !== 'no_answer');
  ok('"I\'d rather work it out" counts', readSignals("I'd rather work it out, thanks").directness === 'no_answer');
  ok('"figure this out on my own" counts', readSignals('I want to figure this out on my own').directness === 'no_answer');
  ok('"point me in the right direction" is guidance', readSignals('can you point me in the right direction?').directness === 'guidance');
  ok('"nudge me" is guidance', readSignals('just nudge me').directness === 'guidance');
  ok('and "just tell me" later in the same message still wins', readSignals("I said don't tell me. Actually, just tell me the answer.").directness === 'answer');
}

console.log('\n=== council D2: verified false positives stay false ===');
{
  const none = (t) => { const x = S(t); return x.directness === 'none' && !x.practiceIntent; };
  ok('"let me try to explain" is not practice intent', none('Let me try to explain what I mean: the cache serves stale rows after each deploy.'));
  ok('"I\'m studying the effect of statins" is context, not practice intent', !S("I'm studying the effect of statins on LDL in a cohort; what's the right model?").practiceIntent);
  ok('"a paper to submit to NeurIPS" is not graded work', !S('I have a paper to submit to NeurIPS next week, can you check the related work?').assessment);
  ok('"my graded problem set" is', S('this is my graded problem set, due Friday').assessment);
  ok('"I\'m a bad programmer" is not an expert claim', S("I'm a bad programmer, sorry if this is obvious").expertise !== 'expert');
  ok('"I\'m a senior engineer" is', S("I'm a senior engineer at a fintech").expertise === 'expert');
  ok('"my lab report is due" is not an expertise claim', S('My lab report is due tomorrow').expertise === null);
  ok('"obviously" alone is not redundancy feedback', !S('Obviously the cache is the problem, but which layer?').redundancy);
  ok('"without revealing" a plot point is not a refusal', S('How do I foreshadow the betrayal without revealing it too early?').directness === 'none');
  ok('"I want to work it out myself" is practice intent', S('I want to work it out myself').practiceIntent);
  ok('"hints only" is practice intent', S('hints only please').practiceIntent);
  ok('"my 2-year-old swallowed a button battery" trips the safety gate', S('my 2-year-old swallowed a button battery, what do I do').safety);
  ok('"which would you pick?" asks for a recommendation', S('A or B — which would you pick?').recommendationRequested);
  ok('"idk" is not knowing', S('idk').dontKnow && S('no idea tbh').dontKnow && !S("I don't know why the cache misses on every deploy, here are the logs and the config").dontKnow);
  ok('"write me 5 interview questions" asks FOR questions', S('write me 5 interview questions for a data engineer').requestsQuestions);
  // Run 1 findings (direct-answer-012, no-answer-request-002).
  const bug = S("Please do NOT tell me what's wrong with my code, finding it is the point. Is the expected answer 7?");
  ok('"do NOT tell me what\'s wrong… finding it is the point" is verdict-only and a refusal', bug.flagOnly && bug.directness === 'no_answer', JSON.stringify({ f: bug.flagOnly, d: bug.directness }));
  const rails = S("Is it OK if I just keep going on this and you only tell me if I've gone off the rails?");
  ok('"only tell me if I\'ve gone off the rails" is verdict-only', rails.flagOnly && rails.directness === 'no_answer');
  ok('"just tell me the answer" after it still wins', S("only tell me if I've gone off the rails. actually no, just tell me the answer").directness === 'answer');
}

console.log('\n=== stripping ===');
{
  const r = stripInterrogatives('Great question! The sign flips because the derivative of cos is -sin. What do you think happens at pi? Let me know if you want more.');
  ok('opener, question and offer removed', r.text === 'The sign flips because the derivative of cos is -sin.', JSON.stringify(r.text));
  ok('what was removed is reported', r.removed.length === 3, JSON.stringify(r.removed));
  const onlyQ = stripInterrogatives('What do you think? Why might that be?');
  ok('a reply that is only questions leaves nothing to send', onlyQ.text === null);
  const keep1 = stripInterrogatives('The fix is in the loop bound. Why does it stop at n-1? And what about n?', 1);
  ok('keep one question when one is allowed', questionLoad(keep1.text) === 1, keep1.text);
  const code = stripInterrogatives('Use this:\n```js\nconst ok = a ?? b; // why?\n```\nThat handles null.');
  ok('code blocks survive untouched', code.text.includes('// why?'), code.text);
  ok('sycophantic opener detected', hasSycophanticOpener('Great question. Here is why.'));
  ok('ordinary opener is fine', !hasSycophanticOpener('The short answer is yes.'));
  ok('sentences split sanely', sentencesOf('One. Two? Three!').length === 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
