// How hard Logos pushes back, and where it stops.
//
// CHALLENGE was one of eight moves listed beside ACKNOWLEDGE and LEAVE SPACE,
// which is a design that loses: agreeing is easier, reads as helpful in the
// moment, and a model under agreeableness pressure will quietly under-pick the
// one move somebody opened a thinking environment to get.
//
// So the baseline is raised. That is a change with two obvious ways to go
// wrong, and the assertions here are mostly about those rather than about the
// pushing:
//
//   CONTRARIANISM. A challenge that arrives every turn regardless of merit
//   carries no information — push on everything and pushing means nothing.
//   The prompt has to say so, and has to say what to do when the person is
//   simply right.
//
//   CONTEMPT. "Rude" and "challenging" are not the same axis. Blunt about the
//   argument is the register; blunt about the PERSON ends the conversation the
//   product exists to have. The prompt has to draw that line explicitly.
//
// And the default has to leave room: the Challenger style (lib/conversation-
// style.ts) is where somebody goes for more push, so the default stops short
// of pushing in every reply.

import { LOGOS_CHAT_PROMPT as P } from './.tmp/logos.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== the challenge is no longer one option among eight ===');
{
  ok('it is called out as the under-used move', /you will under-use/i.test(P));
  ok('and the reason is named', /agreeing is easier/i.test(P));
  ok('unearned agreement is called worthless', /Agreement they did not earn is worth nothing/i.test(P));
  ok('the bar for pushing is stated as low', /the bar for pushing is LOW/i.test(P));
  ok('the CHALLENGE move points at the section', /Reach for this more readily/i.test(P));
}

console.log('\n=== it says what to push ON, concretely ===');
{
  // A general instruction to "be more challenging" produces bluster. A list
  // of things to look for produces a specific objection.
  for (const [what, re] of [
    ['an unexamined assumption', /assumption doing structural work/i],
    ['a conclusion past its evidence', /outrun the evidence/i],
    ['an overloaded word', /carrying more weight than it can hold/i],
    ['a contradiction between turns', /contradict each other/i],
    ['a decision dressed as a question', /decision already made, being dressed as a question/i],
    ['a stated reason that is not the real one', /not the real reason/i],
  ]) ok(what, re.test(P));

  ok('it gives the register in actual sentences', /That does not follow/.test(P));
  ok('the objection comes first', /Lead with the objection/i.test(P));
  ok('no softening preamble', /Do not open with agreement in order to soften/i.test(P));
  ok('hedges are named as weakening, not gentling',
    /not a gentler challenge, it is a weaker one/i.test(P));
}

console.log('\n=== the contrarianism guard ===');
{
  ok('manufacturing a challenge is forbidden', /NEVER MANUFACTURE IT/.test(P));
  ok('contrarianism is named as worse than agreeableness',
    /Contrarianism is worse than agreeableness/i.test(P));
  ok('and the reason is information, not politeness',
    /if you push on everything, pushing means nothing/i.test(P));
  ok('being right gets acknowledged', /When they are right, say so/i.test(P));
  ok('sound reasoning is accepted', /the honest move is to accept it/i.test(P));
  ok('no inventing flaws to seem rigorous', /Never invent a flaw to seem rigorous/i.test(P));
  ok('no arguing a side you do not hold', /never argue a side you do not hold/i.test(P));
  ok('nothing already conceded gets re-litigated', /already conceded/i.test(P));
}

console.log('\n=== challenging is not the same as rude ===');
{
  // The request that prompted this said "more rude lol" and then corrected
  // itself to "challenge". The prompt has to hold that distinction even
  // though the two arrive in the same breath.
  ok('the target is the reasoning', /REASONING YOU HIT, NEVER THEM/.test(P));
  ok('contempt is named and refused', /contempt/i.test(P));
  ok('and its cost is named', /ends the conversation you are trying to have/i.test(P));
  ok('no sarcasm at their expense', /No sarcasm at their expense/i.test(P));
  ok('no point-scoring', /no scoring points/i.test(P));
  ok('they must not be made to defend themselves',
    /defend themselves instead of the claim/i.test(P));
  ok('the reason for hardness is respect', /taking them seriously enough to argue with/i.test(P));
}

console.log('\n=== validation openers are gone ===');
{
  ok('the ban exists', /Do not open on validation/.test(P));
  for (const phrase of ["That's a great question", 'Good point', 'That makes sense', 'Absolutely']) {
    ok(`"${phrase}" is named`, P.includes(phrase));
  }
  ok('and why they are worse before a disagreement',
    /a tell that one is coming/i.test(P));
}

console.log('\n=== the default still leaves room to push harder ===');
{
  // The dials are gone — the Conversation Style is the one personality, and
  // the Challenger is where somebody goes for more push. The default itself
  // must stay short of "in every reply", or that style has nowhere to go.
  ok('the default is deliberately softer than every-reply pushing',
    /you will see one most turns/i.test(P) && !/in every reply/i.test(P.split('NEVER MANUFACTURE')[0]));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
