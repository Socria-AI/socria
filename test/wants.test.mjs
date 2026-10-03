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

import {
  wantedSimulation,
  correctionNote,
  SIM_WORDS,
  bareRequest,
  hasSurface,
  answersOutright,
  answersInstead,
  isThatSimulation,
  simulationBlock,
} from './.tmp/wants.mjs';
import { SIM_OBJECTS, SURFACE_OBJECTS } from './.tmp/logos-viz.mjs';

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

console.log('\n=== polite forms of the request are requests ===');
{
  // "Can you make me a black hole?" is the most ordinary way to ask for one,
  // and it opened with "can you" and ended with "?" — read as a question.
  for (const said of [
    'generate black hole',
    'can you make me a black hole?',
    'could you please simulate a black hole?',
    'hey, can you show me a black hole?',
    'please generate a black hole',
    'black hole simulation',
  ]) {
    ok(`“${said}” → black-hole`, wantedSimulation(said)?.object === 'black-hole', JSON.stringify(wantedSimulation(said)));
  }
  // …and the questions stay questions.
  for (const said of ['can you explain how to model a black hole?', 'how do I simulate a black hole?', 'could you tell me about black holes?']) {
    ok(`“${said}” is still a question`, wantedSimulation(said) === null, JSON.stringify(wantedSimulation(said)));
  }
}

console.log('\n=== a bare request asks for the object and nothing else ===');
{
  const BARE = [
    'generate black hole',
    'generate me a black hole',
    'can you make me a black hole?',
    'show me a 3d black hole',
    'black hole simulation',
    'simulate a supermassive spinning black hole',
    'simulate the big bang',
    'simulate an orbit',
  ];
  for (const said of BARE) {
    const w = wantedSimulation(said);
    ok(`“${said}” is bare`, !!w && bareRequest(said, w), JSON.stringify(w));
  }
  const OWN = [
    'simulate light bending around a black hole',
    'simulate a black hole of 10 solar masses',
    'model the orbit of mars around the sun',
    'build me a pendulum with a 2 kg bob',
    'make a black hole and show me how the shadow depends on spin and inclination of the observer',
  ];
  for (const said of OWN) {
    const w = wantedSimulation(said);
    ok(`“${said}” says something of its own`, !!w && !bareRequest(said, w), JSON.stringify(w));
  }
  ok('nothing it is handed makes it throw', [null, 7, {}, ''].every((x) => bareRequest(x, { object: 'black-hole', named: 'black hole', asked: 'make' }) === false));
}

console.log('\n=== which simulations have a surface of their own ===');
{
  ok('every surface object is a simulation the engine ships', SURFACE_OBJECTS.every((o) => SIM_OBJECTS.includes(o)), SURFACE_OBJECTS.join(','));
  ok('the black hole, the universe and an orbit do', ['black-hole', 'big-bang', 'orbit'].every(hasSurface));
  ok('an oscillator and a projectile are graphs, and are plotted', !hasSurface('oscillator') && !hasSurface('projectile'));
}

console.log('\n=== OUTRIGHT: a bare request for a surface is answered by it ===');
{
  const bh = wantedSimulation('generate black hole');
  ok('a bare black hole, nothing drawn: the surface answers', answersOutright(bh, true, null));
  ok('  whatever the extractor drew instead', answersOutright(bh, true, { kind: 'diagram' }));
  ok('  but not when it already drew exactly that', !answersOutright(bh, true, { kind: 'simulation', sim: { object: 'black-hole' } }));
  ok('a request with something of its own is left to the engine', !answersOutright(bh, false, null));
  const osc = wantedSimulation('make a pendulum');
  ok('a bare oscillator is left to the engine: it can build one properly', !answersOutright(osc, true, null));
  ok('nothing asked, nothing answered', !answersOutright(null, true, null));
  ok('isThatSimulation reads the object', isThatSimulation({ kind: 'simulation', sim: { object: 'orbit' } }, wantedSimulation('simulate an orbit')));
}

console.log('\n=== INSTEAD: after the engine has tried ===');
{
  const w = wantedSimulation('make a pendulum');
  const none = { scene: false, proposed: false, built: false, missing: 0 };
  ok('nothing proposed, nothing drawn: the simulation answers', answersInstead(w, false, none));
  ok('a proposal that wrote nothing down: the simulation answers', answersInstead(w, false, { ...none, proposed: true }));
  ok('a refusal naming what their own system lacks stands', !answersInstead(w, false, { ...none, proposed: true, missing: 1 }));
  ok('  unless they described nothing for it to lack', answersInstead(w, true, { ...none, proposed: true, missing: 1 }));
  ok('a model that built is the answer', !answersInstead(w, true, { ...none, proposed: true, built: true }));
  ok('a scene the extractor drew is the answer', !answersInstead(w, true, { ...none, scene: true }));
  ok('no named simulation, no stand-in', !answersInstead(null, true, none));
}

console.log('\n=== what the reply is told on a turn the surface answers ===');
{
  const b = simulationBlock(wantedSimulation('generate black hole'));
  ok('it says what is opening', /Logos is opening its own simulation/.test(b) && /Kerr black hole/.test(b), b);
  ok('  and what can be moved', /mass and spin/.test(b));
  ok('  and not to ask which aspect first', /Do not ask what they want to understand/.test(b));
  ok('every surface has a brief', SURFACE_OBJECTS.every((o) => simulationBlock({ object: o, named: o, asked: 'make' }).length > 0));
  ok('a plotted simulation has none (the reply is never told about it)', simulationBlock({ object: 'oscillator', named: 'spring', asked: 'make' }) === '');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
