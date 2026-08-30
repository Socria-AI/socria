import { readDrift, DRIFT_DISMISS_LIMIT } from './.tmp/topic-drift.mjs';
let pass=0, fail=0;
const ok=(n,c,x='')=>c?pass++:(fail++,console.log('FAIL',n,x));

const CALC = {
  title: 'Calculus — Limits',
  context: 'math',
  recent: [
    'what is lim x->3 of 2x + 5',
    'Both sides approach the same height. What do you notice about the readings?',
    'they both go to 11',
    'So what does that tell you about the two-sided limit?',
    'it exists and equals 11',
    'And what would have to be true for it not to exist?',
  ],
};
const ESSAY = {
  title: 'English Essay',
  recent: [
    'help me tighten this paragraph about industrialisation',
    'Which sentence is doing the least work for you here?',
    'probably the third one, it repeats the second',
    'What would the paragraph lose if you cut it?',
    'nothing really',
  ],
};
const CAREER = {
  title: 'Should I take the offer',
  recent: [
    'I got a job offer but the salary is lower',
    'What does the lower salary buy you?',
    'more interesting work I think, and a better manager',
    'Which of those would you regret losing more?',
    'the manager honestly',
  ],
};

console.log('=== G: must FLAG (clearly misfiled) ===');
for (const [msg, base] of [
  ['Write an Instagram caption announcing my clothing brand.', CALC],
  ['Can you rewrite this LinkedIn caption for my startup?', CALC],
  ['what should I put on my resume for the interview next week', ESSAY],
  ['help me debug this typescript function, the api endpoint keeps failing', CALC],
]) {
  const v = readDrift({message: msg, ...base});
  ok('flags — '+msg.slice(0,42), v.flag===true, v.reason);
  if (v.flag) console.log('   ✓', msg.slice(0,46), '→', v.domain);
}

console.log('\n=== H + the whole false-positive surface: must NOT flag ===');
const NEG = [
  ['Why does changing the denominator affect this?', CALC],
  ['How does the denominator affect the limit?', CALC],
  ['why does it not exist if the sides are different', CALC],
  ['ok so what happens if I make delta smaller', CALC],
  ['can you explain that last part again more slowly', CALC],
  ['wait, I do not follow the step before that one', CALC],
  ['what about when the function is undefined there', CALC],
  ['How does money factor into this?', CAREER],
  ['what if I asked them for more equity instead', CAREER],
  ['is it worth staying for another year', CAREER],
  ['can you make the tone less formal', ESSAY],
  ['what should the title be', ESSAY],
  ['I want the conclusion to land harder', ESSAY],
  ['by the way, unrelated, can you write me a tweet', CALC],   // they said so themselves
  ['new topic: help me with my resume', CALC],                  // ditto
  ['thanks', CALC],
  ['why?', CALC],
  ['keep going', CALC],
];
for (const [msg, base] of NEG) {
  const v = readDrift({message: msg, ...base});
  ok('quiet — '+msg.slice(0,44), v.flag===false, 'FLAGGED: '+v.reason);
}

console.log('\n=== guards against firing at all ===');
ok('short conversation: never', readDrift({message:'Write an Instagram caption for my brand', recent:['hi','hello there'], title:'x'}).flag===false);
ok('after enough dismissals: never', readDrift({message:'Write an Instagram caption announcing my clothing brand.', ...CALC, dismissals: DRIFT_DISMISS_LIMIT}).flag===false);
ok('one dismissal still flags', readDrift({message:'Write an Instagram caption announcing my clothing brand.', ...CALC, dismissals: 1}).flag===true);
ok('unrecognisable subject: never', readDrift({message:'what do you think about the kestrel nesting on the ledge outside', ...CALC}).flag===false);
ok('conversation with no domain: never', readDrift({message:'Write an Instagram caption for my clothing brand today', recent:['hey','how are you','fine thanks','good to hear','yep']}).flag===false);

console.log('\n=== a rate we can live with ===');
const flagged = NEG.filter(([m,b]) => readDrift({message:m, ...b}).flag).length;
console.log(`  false positives across ${NEG.length} legitimate messages: ${flagged}`);
ok('zero false positives', flagged===0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
