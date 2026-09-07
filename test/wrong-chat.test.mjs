// The message that went to the wrong conversation.
//
// Three screens into a thread about tangent lines, the next thing typed is
// "what do I say to my landlord". The tab was open; it went in.
//
// What used to happen is the interesting part. Core 3.1's first and strongest
// rule is ANSWER THE CHANGE, NOT THE MESSAGE — read the latest turn against
// the whole thread and say what is now clearer. That rule is right almost
// always and exactly wrong here: applied to a misfiled message it produces a
// confident bridge between two unrelated things, because the model has been
// told the thread is one thought and it will find a way to make that true.
// Nobody believes the bridge, and it is the most AI-sounding thing the product
// can do — not wrong about a fact, but visibly pattern-matching rather than
// reading.
//
// So there are two halves to test, and the second matters more:
//
//   the passage both models carry, which must say "notice it, joke, then
//   answer anyway" and must not become a filing clerk; and
//   the detector that decides whether the interface offers to move it, whose
//   entire job is to refuse — missing a misfiled message costs a shrug, and
//   interrupting somebody who meant what they said costs their trust in every
//   future prompt.

import { WRONG_CHAT } from './.tmp/wrong-chat.mjs';
import { LOGOS_CHAT_PROMPT } from './.tmp/logos.mjs';
import { buildSystemPrompt } from './.tmp/socria-prompt.mjs';
import { readDrift, DRIFT_DISMISS_LIMIT } from './.tmp/topic-drift.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const core3 = buildSystemPrompt('core-3', 'balanced', null, null).prompt;
const SURFACES = [['Logos', LOGOS_CHAT_PROMPT], ['Core 3.1', core3]];

console.log('=== both models carry it, and carry the same one ===');
{
  for (const [name, p] of SURFACES) {
    ok(`${name} has the passage`, p.includes(WRONG_CHAT), 'missing');
  }
  // The point of the shared constant is that it cannot drift into two
  // versions with different manners. Inlining a second copy breaks this.
  for (const [name, p] of SURFACES) {
    ok(`${name} carries exactly one copy`, p.split(WRONG_CHAT).length === 2);
  }
}

console.log('\n=== it forbids the failure it exists for ===');
{
  // The whole reason this file exists: not "be careful", but "do not invent
  // the connection", said in words, because the surrounding prompt actively
  // instructs the opposite behaviour.
  ok('it names inventing a connection', /invent a connection|Manufacturing the link/i.test(WRONG_CHAT));
  ok('and forbids it outright', /DO NOT invent a connection/.test(WRONG_CHAT));
  ok('it says the instinct to connect is wrong here',
    /instinct is wrong here|that instinct is wrong/i.test(WRONG_CHAT));
}

console.log('\n=== noticing is a wink, not a gate ===');
{
  ok('it asks for humour', /humour|humor|wink|Light,/i.test(WRONG_CHAT));
  ok('it keeps the remark short', /half a sentence|half-sentence/i.test(WRONG_CHAT));
  // The half that would otherwise be forgotten. A remark that stops the
  // answer is a worse experience than no remark at all.
  ok('the question still gets answered', /answer it properly anyway/i.test(WRONG_CHAT));
  ok('help is never withheld pending confirmation',
    /never withhold help until they confirm/i.test(WRONG_CHAT));
  ok('and it is said once', /Say it ONCE/.test(WRONG_CHAT));
  ok('a second remark is named as nagging', /nagging/i.test(WRONG_CHAT));
  ok('it is not a template', /never a template|in your own words/i.test(WRONG_CHAT));
}

console.log('\n=== and it is stopped from becoming a filing clerk ===');
{
  // Same shape of guard as WHY_NOT_ANSWER: an instruction to comment on where
  // a message was sent will metastasise into commenting on everything unless
  // the limits are written down.
  ok('deliberate subject changes are exempt',
    /change subject on purpose|not a mistake/i.test(WRONG_CHAT));
  ok('short meta turns are exempt', /keep going|explain that again/i.test(WRONG_CHAT));
  ok('unfamiliar is not unrelated',
    /unfamiliar subject is not an unrelated one/i.test(WRONG_CHAT));
  ok('and unfamiliarity means silence', /Stay quiet/i.test(WRONG_CHAT));
  ok('they may know a connection you do not', /may know something you do not/i.test(WRONG_CHAT));
  ok('being wrong is handled', /if they say they meant it, drop it/i.test(WRONG_CHAT));
  ok('and never raised again', /never raise it again/i.test(WRONG_CHAT));
  ok('it is never framed as their error', /never treat this as an error on their part/i.test(WRONG_CHAT));
  ok('and never a warning on anything surprising',
    /never let it become a warning/i.test(WRONG_CHAT));
}

console.log('\n=== the detector behind the offer refuses far more than it fires ===');
{
  // A real thread, so the fixtures are not tuned to pass.
  const calculus = [
    'I need the slope of the tangent line to x^2 at x=3',
    'Start with the secant through two nearby points and take the limit.',
    'so the derivative is the limit of the difference quotient',
    'Right — that is the definition. What does it give you at x=3?',
    'six',
    'Good. Now what does that number mean geometrically?',
  ];
  const base = { title: 'Solve for slope of tangent line', recent: calculus };

  const misfiled = readDrift({
    ...base,
    message: 'my manager keeps hinting at a promotion and I might quit anyway',
  });
  ok('a genuinely misfiled message fires', misfiled.flag === true, misfiled.reason);
  ok('and names where it belongs', misfiled.domain === 'career', misfiled.reason);

  // THE DETECTOR IS DELIBERATELY NARROWER THAN THE PASSAGE, and this is the
  // assertion that says so. It only fires when it can NAME both sides, so a
  // misfiled message about something it has no vocabulary for — rent, a
  // landlord — stays silent rather than guessing. That is the right trade for
  // a thing that interrupts the screen; the prompt half covers everything
  // else at no cost, because a half-sentence in a reply costs nothing when it
  // is wrong and a banner does.
  ok('an unnameable subject does not raise the offer',
    readDrift({ ...base, message: 'what should I say to my landlord about the rent' }).flag === false);

  // Everything below is a reason NOT to fire, which is the correct shape.
  const quiet = [
    ['a continuation', 'explain that again, I did not follow the limit part'],
    ['a bare why', 'why does that work'],
    ['staying on subject', 'what about the second derivative of that polynomial'],
    ['too short to judge', 'six?'],
    ['a signalled change', 'unrelated but what should I say to my landlord'],
    ['another signalled change', 'quick question, totally off topic — rent'],
  ];
  for (const [what, message] of quiet) {
    const v = readDrift({ ...base, message });
    ok(`${what} stays quiet`, v.flag === false, `${message} → ${v.reason}`);
  }

  // A brand-new conversation has no topic to diverge from, so the first
  // messages of every session are safe by construction.
  ok('a fresh session never fires',
    readDrift({ recent: calculus.slice(0, 2), message: 'what should I say to my landlord about rent' }).flag === false);

  // An unfamiliar subject is the commonest thing in the world. If neither
  // side can be named, silence.
  ok('an unnameable conversation never fires',
    readDrift({
      title: 'Thinking it over',
      recent: ['I have been turning something over', 'Say more.', 'it is hard to put words to', 'Try anyway.'],
      message: 'the whole shape of it keeps sliding away from me',
    }).flag === false);
}

console.log('\n=== and it stops asking somebody who keeps saying they meant it ===');
{
  const misfiled = {
    title: 'Solve for slope of tangent line',
    recent: [
      'I need the slope of the tangent line to x^2 at x=3',
      'Start with the secant through two nearby points.',
      'so the derivative is the limit of the difference quotient',
      'Right. What does it give you at x=3?',
    ],
    message: 'my manager keeps hinting at a promotion and I might quit anyway',
  };
  ok('it fires with no dismissals', readDrift({ ...misfiled, dismissals: 0 }).flag === true);
  ok('and one below the limit still fires',
    readDrift({ ...misfiled, dismissals: DRIFT_DISMISS_LIMIT - 1 }).flag === true);
  // Somebody whose work genuinely ranges across subjects has answered this
  // question enough times. Asking forever is how a helpful note becomes a
  // thing people learn to click past without reading.
  ok('at the limit it goes quiet for good',
    readDrift({ ...misfiled, dismissals: DRIFT_DISMISS_LIMIT }).flag === false);
  ok('and stays quiet past it',
    readDrift({ ...misfiled, dismissals: DRIFT_DISMISS_LIMIT + 9 }).flag === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
