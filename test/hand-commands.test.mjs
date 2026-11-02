// WHAT YOU SAY WHILE YOUR HANDS ARE ON (lib/logos5/hand-commands.ts).
//
// Voice works alongside the hands: point, and say what to do. What must hold:
// a command is read only as a whole, plain command, in the place it means
// something (AR Mode's moves only in AR Mode, the pointer's only while hands
// are on); everything else — any question about "this" — is left for Socria;
// and nothing said here destroys anything by itself (taking a card off the map
// is ARMED, for a yes).

import { readHandCommand, findCard, plainSaid } from './.tmp/ar-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;
const AR = { ar: true, hands: true };
const HANDS = { ar: false, hands: true };
const NONE = { ar: false, hands: false };
const said = (t, ctx) => J(readHandCommand(t, ctx));

console.log('\n=== as said ===');
ok('punctuation, case, "please" and "Socria," in front fall away', plainSaid('Socria, please ZOOM in!') === 'zoom in' && plainSaid('Could you zoom in for me?') === 'zoom in', plainSaid('Socria, please ZOOM in!'));

console.log('\n=== in AR Mode ===');
for (const [t, want] of [
  ['zoom in', { act: 'zoom', dir: 1 }],
  ['Zoom out.', { act: 'zoom', dir: -1 }],
  ['make it bigger', { act: 'zoom', dir: 1 }],
  ['turn left', { act: 'turn', dir: -1 }],
  ['rotate the map clockwise', { act: 'turn', dir: 1 }],
  ['fit the map', { act: 'fit' }],
  ['show me everything', { act: 'fit' }],
  ['research this', { act: 'research' }],
  ['look into that', { act: 'research' }],
  ['challenge this', { act: 'challenge' }],
  ['explore this one', { act: 'explore' }],
  ['take this off the map', { act: 'remove' }],
  ['remove this', { act: 'remove' }],
  ['deselect', { act: 'deselect' }],
  ['show the room', { act: 'room', shown: true }],
  ['hide room', { act: 'room', shown: false }],
  ['leave AR mode', { act: 'leave' }],
  ['done', { act: 'leave' }],
  ['select the rent idea', { act: 'select', label: 'rent' }],
  ['go to Lisbon', { act: 'select', label: 'lisbon' }],
])
  ok(`“${t}”`, said(t, AR) === J({ kind: 'ar', cmd: want }), said(t, AR));

console.log('\n=== questions stay questions ===');
for (const t of ['what supports this?', 'why does this matter', 'is this true', 'explain this to me', 'zoom in on the second argument and tell me what it means', 'take the job or stay?', 'I think this is wrong'])
  ok(`“${t}” is for Socria`, readHandCommand(t, AR) === null && readHandCommand(t, HANDS) === null, said(t, AR));

console.log('\n=== the pointer, while hands are on ===');
for (const [t, want] of [
  ['click', { kind: 'pointer', act: 'click' }],
  ['open this', { kind: 'pointer', act: 'click' }],
  ['tap that', { kind: 'pointer', act: 'click' }],
  ['scroll down', { kind: 'pointer', act: 'scroll', dir: 1 }],
  ['scroll up', { kind: 'pointer', act: 'scroll', dir: -1 }],
  ['zoom in', { kind: 'pointer', act: 'zoom', dir: 1 }],
  ['hide the camera', { kind: 'camera', shown: false }],
  ['show camera view', { kind: 'camera', shown: true }],
  ['stop hand tracking', { kind: 'hands', on: false }],
  ['open AR mode', { kind: 'open-ar' }],
])
  ok(`“${t}”`, said(t, HANDS) === J(want), said(t, HANDS));
ok('"click" with no hands on is not a command — there is nothing to click with', readHandCommand('click', NONE) === null);
ok('  nor is "stop hand tracking" when there is nothing to stop', readHandCommand('stop hand tracking', NONE) === null);
ok('"use my hands" starts them, from anywhere', said('use my hands', NONE) === J({ kind: 'hands', on: true }) && said('start hand tracking', NONE) === J({ kind: 'hands', on: true }));
ok('AR Mode can be opened by voice', said('AR mode', NONE) === J({ kind: 'open-ar' }));
ok('AR Mode’s own moves are AR Mode’s: "turn left" outside it is not a command', readHandCommand('turn left', HANDS) === null);
ok('an over-long turn is never a command', readHandCommand('zoom in ' + 'and then '.repeat(20), AR) === null);

console.log('\n=== the card a name means ===');
const cards = [
  { id: 'd1', label: 'Move to Lisbon for the design job?' },
  { id: 'c1', label: 'Rent drops by a third' },
  { id: 'b1', label: 'I have stopped learning here' },
  { id: 'v1', label: 'Work I am proud of' },
];
ok('by a word in it', findCard(cards, 'rent')?.id === 'c1');
ok('by most of its words, in any order', findCard(cards, 'stopped learning')?.id === 'b1' && findCard(cards, 'the Lisbon job')?.id === 'd1');
ok('the whole label', findCard(cards, 'work I am proud of')?.id === 'v1');
ok('nothing like it is nothing', findCard(cards, 'quantum gravity') === null && findCard(cards, '') === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
