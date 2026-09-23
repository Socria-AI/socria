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
ok('"don\'t just give me the answer" is NOT a request for it', S("please don't just give me the answer").directness === 'no_answer', S("please don't just give me the answer").directness);
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
