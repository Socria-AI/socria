// The chips on the empty screen, and why they stopped being a replay button.
//
// A conversation's title IS the person's first message until something renames
// it, and source 4 offered a sentence title as itself. So the empty screen
// filled up with yesterday's questions — "I have two job offers and I keep
// going back and forth.", "why won't you just give me answers" — and pressing
// one re-sent that old message into a fresh conversation. Not a suggestion: a
// replay.
//
// The fixtures below are the real titles from that screen, so this suite is
// pinned to the thing that was actually wrong rather than to a tidy invention.
//
// The rule is: reduce the sentence to what it is ABOUT, or offer nothing.
// Returning null matters as much as extracting well — "why won't you just give
// me answers" leaves "answers" behind, which is not a subject anybody wants to
// go further into, and a chip that does not quite parse is worse than one
// fewer chip. That belief is already load-bearing elsewhere in this file's
// design, so it is asserted here too.

import { topicOf, buildStarters, isSentence, STARTER_COUNT } from './.tmp/starters.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== the titles that were on the screen ===');
{
  const cases = [
    ['Solve for slope of tangent line', 'slope of tangent line'],
    ['I have two job offers and I keep going back and forth.', 'two job offers'],
    ["why won't you just give me answers", null],
  ];
  for (const [title, want] of cases) {
    const got = topicOf(title);
    ok(`"${title.slice(0, 34)}" → ${want ?? 'nothing'}`, got === want, String(got));
  }
}

console.log('\n=== the frame comes off the front, and only the front ===');
{
  const cases = [
    ['graph me the limit as x approaches 2', 'limit as x approaches 2'],
    ['Draw a stress-strain curve', 'stress-strain curve'],
    ['I am studying calculus and I keep messing up', 'studying calculus'],
    ["I'm stuck on the chain rule", 'chain rule'],
    // "and" joining two nouns is not a clause break; "and" starting a new
    // clause is. Both spellings live in this list on purpose.
    ['Help me understand supply and demand', 'supply and demand'],
    ['what is the production possibilities curve', 'production possibilities curve'],
  ];
  for (const [title, want] of cases) {
    ok(`${title.slice(0, 30)} → ${want}`, topicOf(title) === want, String(topicOf(title)));
  }

  // Inner function words must survive: "the slope of the tangent line" is a
  // phrase, and stripping "of the" from the middle would destroy it.
  ok('inner "of the" survives',
    topicOf('Solve for the slope of the tangent line') === 'slope of the tangent line',
    String(topicOf('Solve for the slope of the tangent line')));
}

console.log('\n=== it stops at the first clause ===');
{
  ok('stops at "and"', topicOf('I have two job offers and I cannot choose') === 'two job offers');
  // "stuck" is itself framing, so what survives "because" is one word and the
  // chip is declined — the right outcome, reached through two rules at once.
  ok('stops at "because"', topicOf('I am stuck on recursion because it loops') === null,
    String(topicOf('I am stuck on recursion because it loops')));
  ok('and breaks on a clausal "and"',
    topicOf('I have two job offers and I keep going back') === 'two job offers');
  ok('but not on a joining "and"',
    topicOf('Help me understand supply and demand') === 'supply and demand');
  ok('stops at a comma', topicOf('I have a job offer, which I hate') === 'job offer');
  ok('stops at an em dash', topicOf('I have two offers — Berlin and Athens') === 'two offers');
}

console.log('\n=== nothing worth offering yields nothing ===');
{
  // One word left is either a bare noun that reads oddly after "More on", or —
  // far more often — the tail of a question that was never about a subject.
  for (const t of ['hey', 'hello there', 'ok', "why won't you just give me answers", 'what is it', 'help me']) {
    ok(`"${t}" is dropped`, topicOf(t) === null, String(topicOf(t)));
  }
  // And an implausibly long one: past nine words this is a paragraph, not a
  // subject, and clipping it would put an ellipsis inside a sent message.
  ok('a very long first clause is dropped',
    topicOf('I want to understand ' + 'the thing '.repeat(9)) === null);

  for (const junk of ['', '   ', '???']) {
    ok(`${JSON.stringify(junk)} is dropped`, topicOf(junk) === null);
  }
}

console.log('\n=== and the chips that come out of it ===');
{
  const chips = buildStarters({
    recent: [
      { title: 'Solve for slope of tangent line', updatedAt: 5 },
      { title: 'I have two job offers and I keep going back and forth.', updatedAt: 4 },
      { title: "why won't you just give me answers", updatedAt: 3 },
      { title: 'Ambition vs Security', updatedAt: 2 },
    ],
    fallback: ['I don’t know what decision to make', 'Help me think through this idea'],
  });

  ok('the screen is still full', chips.length === STARTER_COUNT, String(chips.length));

  const labels = chips.map((c) => c.label);
  ok('the tangent line became a subject', labels.includes('More on slope of tangent line'), labels.join(' | '));
  ok('the job offers became a subject', labels.includes('More on two job offers'), labels.join(' | '));
  ok('the unusable one is gone',
    !labels.some((l) => /just give me answers/i.test(l)), labels.join(' | '));

  // No chip DERIVED FROM HISTORY may be a verbatim replay of a past message.
  // The generic openings are sentences on purpose — they are written to be
  // sent, and were never anybody's old message — so they are exempt.
  const generic = new Set(['I don’t know what decision to make', 'Help me think through this idea']);
  for (const c of chips.filter((x) => !generic.has(x.prompt))) {
    ok(`"${c.label.slice(0, 30)}" is not a raw sentence replay`,
      !isSentence(c.prompt) || c.prompt.startsWith('More on'), c.prompt);
  }

  // A noun-phrase title never went through topicOf and is untouched.
  ok('a real title still takes "More on" whole',
    labels.includes('More on Ambition vs Security'), labels.join(' | '));

  // And the generic opening still gets the last slot, so an empty screen is
  // never only old topics.
  ok('a generic opening survives',
    labels.some((l) => /decision to make|think through this idea/i.test(l)), labels.join(' | '));
}

console.log('\n=== the better source still wins ===');
{
  // topicOf is the FALLBACK. The extractor's forward-looking questions are
  // explicitly forbidden "more on X" phrasing because they can do better, and
  // they must still rank first when they exist.
  const chips = buildStarters({
    suggestions: ['Work out what a per-unit tax does to that market'],
    recent: [{ title: 'Solve for slope of tangent line', updatedAt: 1 }],
    fallback: ['Help me think through this idea'],
  });
  ok('the extractor question is first',
    chips[0].prompt === 'Work out what a per-unit tax does to that market', chips[0].prompt);
  ok('and it is not prefixed with anything', !/^More on/.test(chips[0].prompt));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
