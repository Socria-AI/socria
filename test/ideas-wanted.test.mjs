// MIND MAPS WHEN THEY HELP — whether a line of thinking's ideas are spread across the Everything view (November 2026).
//
// What is held down (lib/runtime/ideas-wanted.ts):
//   • a conversation of answers — a sum worked, a concept explained, a graph drawn, a fact checked, code fixed — keeps
//     its ideas folded, a press away;
//   • they are drawn when asked for (a mind map, the big picture, how the parts fit together), when the subject has a
//     shape worth seeing (causes, a structure), or when the person is thinking something through (a decision, what
//     if, brainstorming, an essay's argument, research);
//   • one such turn is enough, and the conversation stays one of ideas;
//   • "ok" and "thanks" decide nothing.
// How the space draws the fold is held down in test/logos5-space.test.mjs.

import * as I from './.tmp/inline-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 600))));
const J = JSON.stringify;

const ANSWERS = [
  'why is the integral of x^2-2x from 0 to 3 zero?',
  'what is a definite integral?',
  'integrate x^2-2x from 0 to 3',
  'plot y = x^2 - 2x',
  'how do Riemann sums approximate the integral of x^2 from 0 to 2?',
  'solve 2x + 3 = 11',
  'what is the capital of Peru?',
  'fix this bug: TypeError: cannot read properties of undefined',
  'explain derivatives as the slope of a tangent line',
  'how does binary search work?',
  'what is the net force on a box pulled at 30 degrees?',
  'explain photosynthesis',
];
const IDEAS = [
  ['should I take the job in London or stay in Manchester?', 'exploring'],
  ['make me a mind map of the causes of WW1', 'asked'],
  ['how do the parts of a cell fit together?', 'asked'],
  ['give me the big picture of machine learning', 'asked'],
  ['what caused World War 1?', 'shape'],
  ['what if the Roman Empire never fell?', 'exploring'],
  ['brainstorm ideas for my startup', 'exploring'],
  ["I'm trying to figure out whether to switch my major to philosophy", 'exploring'],
  ['help me think through my essay on free will', 'exploring'],
  ['what are the pros and cons of remote work?', 'exploring'],
  ['is it worth learning Latin?', 'exploring'],
  ['I think social media makes people lonelier because it replaces real contact with performance, but I am not sure how to argue it', 'exploring'],
];

console.log('\n=== a conversation of answers keeps its ideas folded ===');
{
  const wrong = ANSWERS.filter((t) => I.ideasWhyOf(t) !== 'answers').map((t) => [t, I.ideasWhyOf(t)]);
  ok(`${ANSWERS.length} questions with answers fold the ideas`, wrong.length === 0, J(wrong));
  ok('a calculus conversation, start to finish, folds them', I.ideasWanted(['what is a definite integral?', 'ok', 'why is the integral of x^2-2x from 0 to 3 zero?', 'thanks!']).show === false);
  ok('…and says why', I.ideasWanted(['what is a definite integral?']).why === 'answers');
}

console.log('\n=== asked for, needed, or exploring: drawn ===');
{
  const wrong = IDEAS.filter(([t, w]) => I.ideasWhyOf(t) !== w).map(([t, w]) => [t, w, I.ideasWhyOf(t)]);
  ok(`${IDEAS.length} turns that want the ideas, each for its reason`, wrong.length === 0, J(wrong));
  const turned = I.ideasWanted(['what is a definite integral?', 'plot y = x^2 - 2x', 'what if area below the axis counted as positive?']);
  ok('one exploring turn is enough, wherever it comes', turned.show && turned.why === 'exploring', J(turned));
  const asked = I.ideasWanted(['solve 2x + 3 = 11', 'can you map this out for me?']);
  ok('a map asked for, mid-conversation', asked.show && asked.why === 'asked', J(asked));
}

console.log('\n=== nothing said, nothing decided ===');
{
  ok('"ok" and "thanks" decide nothing', I.ideasWhyOf('ok') === 'none' && I.ideasWhyOf('thanks!') === 'none');
  ok('an empty conversation draws nothing it has not got', J(I.ideasWanted([])) === J({ show: false, why: 'none' }));
  ok('read the same way twice', I.ideasWhyOf('should I take the job in London or stay in Manchester?') === 'exploring');
}

console.log(`\nideas wanted: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
