// A REQUEST TO MAKE A THING IS NOT A THOUGHT ABOUT THE THING.
//
// Reported from the product: "generate me a black hole" produced a paragraph
// explaining that making one would require collapsing a massive star, and a map
// node of kind `concept` called "Black hole creation". The product ships a Kerr
// black hole with real geodesics and sliders.
//
// The classifier's rule for "is this a construction" ends in a list of verbs
// that does not contain "generate". This suite is the deterministic half that
// does not depend on a prompt being read the right way — and the first
// assertion in it is the sentence that was reported.

import { wantedSimulation, correctionNote, SIM_WORDS } from './.tmp/wants.mjs';
import { SIM_OBJECTS } from './.tmp/logos-viz.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== the reported sentence ===');
{
  const w = wantedSimulation('generate me a black hole');
  ok('“generate me a black hole” is a request for the black hole', w?.object === 'black-hole', JSON.stringify(w));
  ok('  and it says which words made it one', w?.asked === 'generate' && w?.named === 'black hole', JSON.stringify(w));
  ok('  and can say so in a sentence', /black hole simulation/.test(correctionNote(w)), correctionNote(w ?? {}));
}

console.log('\n=== the two lists have not drifted apart ===');
{
  // A name here the renderer does not have is a promise of a picture; a name
  // there that is missing here is a request that keeps becoming a concept node.
  for (const id of Object.keys(SIM_WORDS)) {
    ok(`${id} is something the renderer actually has`, SIM_OBJECTS.includes(id), SIM_OBJECTS.join(','));
  }
  for (const id of SIM_OBJECTS) {
    ok(`${id} has words somebody would type for it`, (SIM_WORDS[id]?.length ?? 0) > 0);
  }
}

console.log('\n=== every shipped simulation, asked for in the registers people use ===');
{
  const SAID = [
    ['generate me a black hole', 'black-hole'],
    ['make a black hole', 'black-hole'],
    ['can you do a black hole', 'black-hole'],
    ['show me the event horizon', 'black-hole'],
    ['I want an accretion disk', 'black-hole'],
    ['simulate the big bang', 'big-bang'],
    ['draw an expanding universe', 'big-bang'],
    ['plot a two-body orbit', 'orbit'],
    ['build me a pendulum', 'oscillator'],
    ['render a projectile', 'projectile'],
    ['Generate Me A Black Hole', 'black-hole'],
    ['generate me a black hole please', 'black-hole'],
  ];
  for (const [said, want] of SAID) {
    ok(`“${said}” → ${want}`, wantedSimulation(said)?.object === want, JSON.stringify(wantedSimulation(said)));
  }
  // The longest alias wins, so the object is named by what they actually wrote.
  ok('the longest name they used is the one reported',
    wantedSimulation('make me an accretion disk')?.named === 'accretion disk',
    JSON.stringify(wantedSimulation('make me an accretion disk')));
}

console.log('\n=== and a question about the subject is still a question ===');
{
  // The same failure pointing the other way: answering a question with a
  // simulation nobody asked for.
  const NOT = [
    'what is a black hole?',
    'how do black holes form?',
    'why does nothing escape a black hole',
    'tell me about the big bang',
    'explain how to model a pendulum',
    'can you explain what an orbit is',
    'should i model this as an oscillator',
    'I am wondering whether to simulate the orbit',
    'what is a regression model?',
    'create a model with wage as the dependent variable',
    'add years of experience to it',
    '',
    'generate me a report',
    'make me a sandwich',
  ];
  for (const said of NOT) {
    ok(`“${said}” is not a request for a simulation`, wantedSimulation(said) === null, JSON.stringify(wantedSimulation(said)));
  }
  // …but an imperative that happens to end in a question mark still is.
  ok('“simulate a black hole?” is still a request',
    wantedSimulation('simulate a black hole?')?.object === 'black-hole');
}

console.log('\n=== nothing it is handed can make it throw ===');
{
  for (const junk of [null, undefined, 42, {}, [], true, 'x'.repeat(5000)]) {
    let threw = null;
    try { wantedSimulation(junk); } catch (e) { threw = e; }
    ok(`${JSON.stringify(junk)?.slice(0, 20)} is survivable`, threw === null, String(threw));
  }
  ok('an over-long message is declined rather than scanned', wantedSimulation('black hole generate ' + 'x'.repeat(3000)) === null);
  // A regex metacharacter in an alias would be a live pattern without escaping.
  ok('aliases are matched literally', wantedSimulation('generate me a black.hole') === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
