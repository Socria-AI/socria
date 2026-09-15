// The first map, and the four ways a coach-mark sequence ruins somebody's day.
//
// The bug in something like this is never the arrow. It is showing up twice,
// showing up for the wrong person, showing up over an empty map, or refusing
// to die. So that is what this suite is about.

import {
  STEPS, byId, advance, shouldStart, finish, isRunning, indexOf,
  IDLE, DONE, ONBOARDING_KEY,
} from './.tmp/onboarding.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const READY = { signedIn: true, completed: false, nodes: 5, busy: false, composing: false };

console.log('=== it opens for the right person, at the right moment ===');
{
  ok('a new signed-in person with a real map', shouldStart(READY));

  // THE ONE THAT MATTERS: never twice.
  ok('never for someone who has done it', !shouldStart({ ...READY, completed: true }));

  ok('not signed out', !shouldStart({ ...READY, signedIn: false }));

  // Pointing at a map that is still being drawn points at nothing.
  ok('not while a reply is streaming', !shouldStart({ ...READY, busy: true }));

  // NEVER INTERRUPT A SENTENCE.
  ok('not while they are typing', !shouldStart({ ...READY, composing: true }));

  // Two boxes is not a map, and "look what Socria drew" over two boxes
  // undersells the thing it is selling.
  for (const n of [0, 1, 2, 3]) {
    ok(`not over ${n} nodes`, !shouldStart({ ...READY, nodes: n }));
  }
  for (const n of [4, 5, 9, 40]) {
    ok(`yes over ${n} nodes`, shouldStart({ ...READY, nodes: n }));
  }
}

console.log('\n=== it advances on what they DID, never on a clock ===');
{
  let s = IDLE;
  ok('idle until the map appears', !isRunning(s));

  // Only the map can open it. A card pressed beforehand is somebody using
  // the product, and interrupting that to explain it would be absurd.
  ok('a stray press does not open it', advance(IDLE, 'node-pressed').at === 'idle');
  ok('a stray action does not open it', advance(IDLE, 'action-taken').at === 'idle');

  s = advance(s, 'map-drew');
  ok('the map opens it', s.at === 'drawn');
  ok('and it is running', isRunning(s));

  // The wrong signal must not skip a beat the person never saw.
  ok('the map drawing again changes nothing', advance(s, 'map-drew').at === 'drawn');
  ok('an action out of order changes nothing', advance(s, 'action-taken').at === 'drawn');

  s = advance(s, 'node-pressed');
  ok('pressing a card moves on', s.at === 'press');
  ok('pressing a second card does not', advance(s, 'node-pressed').at === 'press');

  s = advance(s, 'action-taken');
  ok('choosing an action moves on', s.at === 'opens');
  ok('the last beat holds', advance(s, 'action-taken').at === 'opens');
  ok('...and holds against everything', advance(advance(s, 'map-drew'), 'node-pressed').at === 'opens');
}

console.log('\n=== it dies when asked, from anywhere ===');
{
  for (const from of [IDLE, { at: 'drawn' }, { at: 'press' }, { at: 'opens' }]) {
    ok(`skip from ${from.at}`, advance(from, 'skip').at === 'done');
  }
  ok('finishing is done', finish().at === 'done');
  ok('done is not running', !isRunning(DONE));

  // AND IT STAYS DEAD. Every signal against a finished sequence.
  for (const sig of ['map-drew', 'node-pressed', 'action-taken', 'skip']) {
    ok(`${sig} cannot resurrect it`, advance(DONE, sig).at === 'done');
  }
}

console.log('\n=== the copy has to earn its interruption ===');
{
  ok('exactly three beats', STEPS.length === 3, String(STEPS.length));
  ok('a fourth would be a tour', STEPS.length < 4);

  const ids = STEPS.map((s) => s.id);
  ok('no duplicate steps', new Set(ids).size === ids.length);
  ok('they run drawn → press → opens',
    JSON.stringify(ids) === JSON.stringify(['drawn', 'press', 'opens']), JSON.stringify(ids));

  for (const s of STEPS) {
    ok(`${s.id}: has a title`, !!s.title && s.title.length <= 40, s.title);
    ok(`${s.id}: the body is short`, s.body.length > 20 && s.body.length <= 220, String(s.body.length));
    ok(`${s.id}: says what to do`, !!s.cue && s.cue.length <= 40, s.cue);
    ok(`${s.id}: has somewhere to point`, ['map', 'node', 'panel'].includes(s.anchor), s.anchor);

    // It must not teach the noun before the motion. A person does not need
    // the phrase "Thinking Map" to use one.
    ok(`${s.id}: no jargon in the title`, !/thinking map|logos|node|entity/i.test(s.title), s.title);
    // It talks to a person about their own reasoning.
    ok(`${s.id}: speaks to them`, /\byou|your\b/i.test(s.body + s.cue), s.body);
  }

  ok('byId finds each one', STEPS.every((s) => byId(s.id) === s));
  ok('an unknown id does not throw', !!byId('nonsense'));
}

console.log('\n=== the progress dots ===');
{
  ok('idle has no index', indexOf(IDLE) === -1);
  ok('done has no index', indexOf(DONE) === -1);
  ok('first is 0', indexOf({ at: 'drawn' }) === 0);
  ok('second is 1', indexOf({ at: 'press' }) === 1);
  ok('last is 2', indexOf({ at: 'opens' }) === 2);
}

console.log('\n=== the flag ===');
{
  ok('the key is versioned', /v\d+$/.test(ONBOARDING_KEY), ONBOARDING_KEY);
  ok('and namespaced', ONBOARDING_KEY.startsWith('socria.'), ONBOARDING_KEY);
}

console.log('\n=== a full run, the way a person does it ===');
{
  let s = IDLE;
  const seen = [];
  s = advance(s, 'map-drew'); seen.push(s.at);
  s = advance(s, 'node-pressed'); seen.push(s.at);
  s = advance(s, 'action-taken'); seen.push(s.at);
  s = finish(); seen.push(s.at);
  ok('drawn → press → opens → done',
    JSON.stringify(seen) === JSON.stringify(['drawn', 'press', 'opens', 'done']), JSON.stringify(seen));
  // And the next session does not start it again.
  ok('it will not start again', !shouldStart({ ...READY, completed: true }));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
