// "Why won't you just tell me?"
//
// The most important question anybody asks Socria, and until now the models
// improvised an answer to it. They now share one — because a person who asks
// Logos and then asks Core should meet the same conviction rather than two
// paraphrases of it, and because the real reason is a better answer than any
// deflection.
//
// THE TESTS THAT MATTER HERE ARE THE GUARDS, NOT THE PASSAGE.
//
// This is a very persuasive paragraph about not handing over answers, sitting
// in a system prompt. That is precisely the shape of a thing that spreads:
// recited at "what year did Rome fall", it turns a principle into an excuse to
// be useless. So the passage is required to carry its own limits, and those
// limits are asserted as hard as the passage itself:
//
//   it names JUDGMENT as the scope, and facts as explicitly out of it;
//   it says so at all, in words, rather than leaving it implied;
//   it yields the moment somebody insists — overruling them twice would make
//   Socria the thing it just finished saying it was not;
//   and it is not a script, so asking twice does not produce a recitation.

import { WHY_NOT_ANSWER } from './.tmp/why-not-answer.mjs';
import { LOGOS_CHAT_PROMPT } from './.tmp/logos.mjs';
import { buildSystemPrompt } from './.tmp/socria-prompt.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const core3 = buildSystemPrompt('core-3', 'balanced', null, null).prompt;
const SURFACES = [['Logos', LOGOS_CHAT_PROMPT], ['Core 3.1', core3]];

console.log('=== both models answer it, and answer it the same way ===');
{
  for (const [name, p] of SURFACES) {
    ok(`${name} carries the passage`, p.includes(WHY_NOT_ANSWER), 'missing');
  }
  // One text, not two. The point of the shared constant is that it cannot
  // drift — if somebody inlines a second copy, this stops being true.
  const inBoth = SURFACES.every(([, p]) => p.includes(WHY_NOT_ANSWER));
  ok('it is literally the same text in both', inBoth);
  for (const [name, p] of SURFACES) {
    ok(`${name} includes it exactly once`,
      p.split('WHEN THEY ASK WHY YOU WILL NOT JUST GIVE THEM THE ANSWER').length === 2);
  }
}

console.log('\n=== the argument is actually made ===');
{
  const beats = [
    ['it concedes it could answer', /could answer it\. That is precisely the problem/i],
    ['it names what AI is getting good at', /extraordinarily good at the things people used to/i],
    ['it says judgment is built from repetitions', /repetitions/i],
    ['it refuses to make their judgment obsolete', /judgment obsolete/i],
    ['it asks for their first instinct', /first instinct/i],
    ['and promises to pressure-test it', /pressure-test/i],
  ];
  for (const [what, re] of beats) ok(what, re.test(WHY_NOT_ANSWER));

  // Tone rails: this is the one passage most likely to come out preachy.
  for (const [what, re] of [
    ['it forbids moralising', /Do not moralise/i],
    ['it forbids performing reluctance', /perform reluctance/i],
    ['it forbids implying they were lazy', /never imply they were lazy/i],
  ]) ok(what, re.test(WHY_NOT_ANSWER));
}

console.log('\n=== it is not a script ===');
{
  // A canned paragraph recited identically every time is a tic, not a
  // conviction — and it would also flatly override the personality dials.
  ok('it says to use your own words', /in your own words/i.test(WHY_NOT_ANSWER));
  ok('it says the text is substance, not a script',
    /not a script to recite word for word/i.test(WHY_NOT_ANSWER));
  ok('it says to explain it only once', /only once/i.test(WHY_NOT_ANSWER));
  ok('and says why repeating it is worse', /turns a conviction into a tic/i.test(WHY_NOT_ANSWER));
}

console.log('\n=== the scope guard, which is the whole safety of this ===');
{
  ok('it is announced as not a licence to withhold',
    /NOT A LICENCE TO WITHHOLD/.test(WHY_NOT_ANSWER));
  ok('the scope is their JUDGMENT', /applies to their JUDGMENT/.test(WHY_NOT_ANSWER));
  ok('facts are explicitly excluded',
    /nothing to do with facts/i.test(WHY_NOT_ANSWER));
  ok('reciting it at a fact is named a betrayal of the idea',
    /betrayal of the idea/i.test(WHY_NOT_ANSWER));

  // The concrete list is what makes the rule usable rather than a sentiment.
  for (const kind of ['date', 'definition', 'formula', 'spelling', 'unit conversion', 'arithmetic check']) {
    ok(`${kind} is named as answer-immediately`, WHY_NOT_ANSWER.includes(kind));
  }
  ok('answered immediately and completely',
    /answer, immediately and completely/i.test(WHY_NOT_ANSWER));
  ok('they must not have to earn it', /do not make them earn it/i.test(WHY_NOT_ANSWER));

  // Ambiguity resolves toward answering, not toward withholding. Without
  // this, every borderline case drifts to a refusal.
  ok('ambiguity defaults to giving the answer',
    /cannot tell which they are asking for, assume they want the answer/i.test(WHY_NOT_ANSWER));
}

console.log('\n=== and it yields ===');
{
  // Somebody who has heard the reason and still wants the answer has made a
  // judgment. Refusing them again is the exact failure the passage claims to
  // be preventing.
  ok('insisting after hearing it gets the answer',
    /still say "I understand, tell me anyway" — tell them/i.test(WHY_NOT_ANSWER));
  ok('their insistence is named as a judgment',
    /They have made the judgment/.test(WHY_NOT_ANSWER));
  ok('and overruling it twice is named as self-contradiction',
    /would make you the thing you just said you were not/i.test(WHY_NOT_ANSWER));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
