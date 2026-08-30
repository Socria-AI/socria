import { readMathSignal, readMathTopic, shouldShowMath, MATH_FADE_MS } from './.tmp/math-context.mjs';
let pass=0, fail=0;
const ok=(n,c,x='')=>c?pass++:(fail++,console.log('FAIL',n,x));
const S=(composer, recent=[], context, hasViz)=>readMathSignal({composer, recent, context, hasViz});

console.log('=== A: Writing Mode — no maths ===');
for (const t of [
  'Help me improve the argument in this paragraph.',
  'Can you make this sound less formal?',
  'Rewrite this LinkedIn caption for my startup.',
  'I want the second paragraph to land harder.',
  'What should the title be?',
]) ok('A: none — '+t.slice(0,34), S(t)==='none', S(t));

console.log('\n=== B: Math Mode is always available ===');
ok('B: context=math is strong', S('ok', [], 'math')==='strong');
ok('B: a scene on the plot is strong', S('hmm', [], undefined, true)==='strong');
ok('B: limit phrasing is strong', S('Help me understand lim x→3 (2x+5).')==='strong');

console.log('\n=== C: general chat that turns mathematical ===');
for (const t of ['Graph y = x^2', 'Why does lim x->3 of this equal 7?', 'what is the derivative of sin(x)', 'integrate x^2 dx', "f'(x) = ?", 'solve 3x + 4 = 19']) {
  ok('C: strong — '+t.slice(0,30), S(t)==='strong', S(t));
}

console.log('\n=== I: one equation in an essay must not flip the world ===');
ok('I: single equation is not strong on its own', S('As Einstein wrote, the whole thing rests on one line.')==='none');
const essay = ['Help me improve this paragraph.', 'The tone is too stiff in the second half.', 'Can you tighten the conclusion?'];
ok('I: an essay conversation stays none', S('I mention E = mc^2 in the intro.', essay)!=='strong', S('I mention E = mc^2 in the intro.', essay));

console.log('\n=== conversation carries weight ===');
const calc = ['what is lim x->3 of 2x+5', 'so the two sides both approach 11', 'why does the denominator matter'];
ok('mid-calculus, typing "ok so"', S('ok so', calc)!=='none', S('ok so', calc));
ok('mid-essay, typing "ok so"', S('ok so', essay)==='none');

console.log('\n=== weak alone never opens it ===');
ok('weak signal does not open', shouldShowMath('weak', false, 0, 1000)===false);
ok('none does not open', shouldShowMath('none', false, 0, 1000)===false);
ok('strong opens', shouldShowMath('strong', false, 0, 1000)===true);

console.log('\n=== anti-flicker: backspacing through "lim" ===');
// type l-i-m then delete it; the button must not blink
let showing=false, lastStrong=0, t=0;
const step=(text)=>{ t+=120; const sig=S(text); if(sig==='strong') lastStrong=t; showing=shouldShowMath(sig, showing, lastStrong, t); return showing; };
const typed=['l','li','lim','lim ','lim x','lim x-','lim x->','lim x->3'];
const back =['lim x->','lim x-','lim x','lim ','lim','li','l',''];
const onWhileTyping = typed.map(step);
ok('opens once "lim" is there', onWhileTyping.at(-1)===true);
const onWhileDeleting = back.map(step);
ok('stays open through the whole deletion (no blink)', onWhileDeleting.every(Boolean), JSON.stringify(onWhileDeleting));
// and eventually goes when the signal is long gone
t += MATH_FADE_MS + 1000;
ok('closes after the fade window', shouldShowMath('none', true, lastStrong, t)===false);

console.log('\n=== topics ===');
for (const [text, want] of [
  ['lim x->3 of 2x+5', 'limits'],
  ['what is the derivative of x^2', 'derivatives'],
  ['integrate x^2 from 0 to 2', 'integrals'],
  ['graph sin(x) and cos(x)', 'trig'],
  ['solve for x', 'general'],
]) { const got = readMathTopic({composer:text, recent:[]}); ok(`topic ${want}`, got===want, got); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
