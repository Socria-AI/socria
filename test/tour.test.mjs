// The first-run tour, and the four ways one ruins a morning.
//
// Running twice. Running for somebody already taught. Running against a
// control that is not on screen. Refusing to stop. None of them is a
// drawing bug, which is why none of this file is about drawing.

import { TOUR_STEPS, TOUR_KEY, ROMAN, shouldRunTour, nextStep, inkRect } from './.tmp/tour.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const READY = { done: false, signedIn: true, justOnboarded: false, blocked: false };

console.log('=== when it runs, and the many times it does not ===');
{
  ok('a signed-in newcomer', shouldRunTour(READY));
  ok('never twice', !shouldRunTour({ ...READY, done: true }));
  ok('not signed out', !shouldRunTour({ ...READY, signedIn: false }));
  ok('not over a sheet', !shouldRunTour({ ...READY, blocked: true }));
  // Both onboardings in one sitting is too much teaching at once.
  ok('not straight after the beginning', !shouldRunTour({ ...READY, justOnboarded: true }));
}

console.log('=== the steps ===');
{
  ok('four notes', TOUR_STEPS.length === 4, String(TOUR_STEPS.length));
  ok('anchors are unique', new Set(TOUR_STEPS.map((s) => s.anchor)).size === 4);
  ok('enough numerals for them', ROMAN.length >= TOUR_STEPS.length);
  for (const s of TOUR_STEPS) {
    // ANCHORED BY data-tour, never by a style class: this product's chat is
    // Tailwind utilities, so a class-based anchor is one restyle from
    // pointing at nothing, and a tour ringing the wrong control is worse
    // than no tour.
    ok(`${s.anchor}: the anchor is an attribute value`, /^[a-z]+$/.test(s.anchor), s.anchor);
    ok(`${s.anchor}: it is not a CSS selector`, !/[.#\s\[]/.test(s.anchor), s.anchor);
    ok(`${s.anchor}: has a place`, ['right', 'above', 'below'].includes(s.place), s.place);
    ok(`${s.anchor}: one emphasis`, (s.body.match(/<em>/g) || []).length === 1, s.body);
    ok(`${s.anchor}: it closes`, (s.body.match(/<\/em>/g) || []).length === 1, s.body);
    ok(`${s.anchor}: the note is short`, s.body.length <= 200, String(s.body.length));
    ok(`${s.anchor}: nothing is interpolated`, !s.body.includes('${'));
  }
  ok('the key is versioned', /v\d+$/.test(TOUR_KEY), TOUR_KEY);
}

console.log('=== it ends ===');
{
  ok('0 → 1', nextStep(0) === 1);
  ok('2 → 3', nextStep(2) === 3);
  ok('the last one ends it', nextStep(TOUR_STEPS.length - 1) === null);
  ok('past the end stays ended', nextStep(99) === null);
  // Walking it the whole way must terminate.
  let i = 0, guard = 0;
  while (i !== null && guard++ < 50) i = nextStep(i);
  ok('a full walk terminates', i === null && guard <= TOUR_STEPS.length + 1, String(guard));
}

console.log('=== the ring is drawn, not printed — and it holds still ===');
{
  const a = inkRect(10, 20, 100, 40);
  ok('it is a path', a.startsWith('M') && a.endsWith('Z'), a.slice(0, 20));
  ok('every number is finite', !/NaN|Infinity/.test(a), a.slice(0, 80));
  // THE POINT. A wobble from Math.random re-rolls on every scroll frame and
  // the ring shimmers; two renders of one step must be identical.
  ok('the same box gives the same ring', inkRect(10, 20, 100, 40) === a);
  ok('a different box gives a different ring', inkRect(11, 20, 100, 40) !== a);
  // And it is a wobble, not a deformation.
  const plain = `M17,20 L103,20`;
  ok('the wobble is small', Math.abs(parseFloat(a.split(',')[1]) - 20) < 1.2, a.slice(0, 24));
  for (const box of [[0,0,0,0], [-5,-5,10,10], [0,0,1e6,1e6]]) {
    ok(`degenerate box ${JSON.stringify(box)} does not throw`, !/NaN/.test(inkRect(...box)));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
