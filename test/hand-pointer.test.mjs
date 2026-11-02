// A HAND AS A POINTER, for all of Logos 5 (lib/hand-pointer.ts).
//
// Everywhere but AR Mode the hand is a pointer: the views already know what
// to do with one. What must hold is the part about time and about hands
// coming and going: a pinch presses only once it is meant (a hand passing
// through a pinch on its way somewhere presses nothing), a press always ends
// (released, or cancelled when the hand is lost or a second hand comes in),
// letting go of one of two hands never presses, and the camera's frame is
// spread over the screen so no corner needs a hand at the edge of the picture.

import { HandPointer, frameToScreen, zoomWheelDelta, CONTROL_BOX, CLICK_SLOP, stopHands, registerHandStop, handPointer, registerHandPointer } from './.tmp/ar-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// a hand as lib/hand-gestures.ts readHand would report it, already on the screen
const hand = (pose, x, y, extra = {}) => ({ pose, pinch: pose === 'pinch' ? 0.95 : 0.05, extended: [], aim: { x, y }, palm: { x, y: y + 40 }, size: 100, hand: 'right', ...extra });
const kinds = (s) => s.intents.map((i) => i.kind).join(',');

console.log('\n=== the camera frame, spread over the screen ===');
{
  const W = 1440, H = 900;
  const c = frameToScreen({ x: (CONTROL_BOX.x0 + CONTROL_BOX.x1) / 2, y: (CONTROL_BOX.y0 + CONTROL_BOX.y1) / 2 }, W, H);
  ok('the middle of the box is the middle of the screen', near(c.x, W / 2) && near(c.y, H / 2), J(c));
  const tl = frameToScreen({ x: CONTROL_BOX.x0, y: CONTROL_BOX.y0 }, W, H);
  const br = frameToScreen({ x: CONTROL_BOX.x1, y: CONTROL_BOX.y1 }, W, H);
  ok('its corners are the screen’s corners — no hand at the edge of the picture needed', near(tl.x, 0) && near(tl.y, 0) && near(br.x, W) && near(br.y, H));
  const out = frameToScreen({ x: 0.01, y: 0.99 }, W, H);
  ok('beyond the box, the cursor waits at the edge rather than leaving the screen', out.x === 0 && out.y === H);
  ok('the box sits in the frame, a margin all round', CONTROL_BOX.x0 > 0.05 && CONTROL_BOX.x1 < 0.95 && CONTROL_BOX.y0 > 0.02 && CONTROL_BOX.y1 < 0.95);
}

console.log('\n=== one hand: point, press, drag, release ===');
{
  const p = new HandPointer();
  let t = 0;
  let s = p.step([hand('point', 100, 100)], (t += 16));
  ok('pointing hovers', kinds(s) === 'hover' && s.cursor && !s.cursor.pressed, J(s));
  // a pinch is believed only once it has lasted a moment
  s = p.step([hand('pinch', 100, 100)], (t += 16));
  ok('  a pinch that has only just begun presses nothing yet', !s.intents.some((i) => i.kind === 'press'), kinds(s));
  for (let k = 0; k < 8; k++) s = p.step([hand('pinch', 100, 100)], (t += 16));
  const pressed = [];
  // replay to find the press
  const q = new HandPointer();
  let u = 0;
  q.step([hand('point', 100, 100)], (u += 16));
  for (let k = 0; k < 12; k++) pressed.push(...q.step([hand('pinch', 100, 100)], (u += 16)).intents);
  ok('  held, it presses — once', pressed.filter((i) => i.kind === 'press').length === 1, J(pressed.map((i) => i.kind)));
  ok('  and keeps dragging while held', pressed.filter((i) => i.kind === 'drag').length >= 3);
  let d = q.step([hand('pinch', 160, 130)], (u += 16));
  ok('moving the pinch drags, toward the hand (smoothed)', d.intents[0].kind === 'drag' && d.intents[0].x > 100 && d.intents[0].x < 160, J(d.intents));
  ok('  the cursor shows it pressing', d.cursor.pressed === true);
  let r = [];
  for (let k = 0; k < 10; k++) r.push(...q.step([hand('open', 160, 130)], (u += 16)).intents);
  ok('opening the hand releases — once', r.filter((i) => i.kind === 'release').length === 1 && !r.some((i) => i.kind === 'cancel'), J(r.map((i) => i.kind)));
  ok('  and then it hovers again', r[r.length - 1].kind === 'hover');
}

console.log('\n=== a hand passing through a pinch presses nothing ===');
{
  const p = new HandPointer();
  let t = 0;
  const all = [];
  for (const pose of ['open', 'open', 'pinch', 'point', 'point', 'pinch', 'open', 'open']) all.push(...p.step([hand(pose, 300, 300)], (t += 30)).intents);
  ok('poses that flicker past are not presses', !all.some((i) => i.kind === 'press'), J(all.map((i) => i.kind)));
}

console.log('\n=== the hand lost mid-press ===');
{
  const p = new HandPointer();
  let t = 0;
  for (let k = 0; k < 12; k++) p.step([hand('pinch', 200, 200)], (t += 16));
  ok('it is pressing', p.pressing === true);
  const s = p.step([], (t += 16));
  ok('losing the hand cancels the press — nothing is left held down', kinds(s) === 'cancel' && s.cursor === null && p.pressing === false, J(s));
  const again = p.step([], (t += 16));
  ok('  and says so once', again.intents.length === 0);
}

console.log('\n=== two hands zoom ===');
{
  const p = new HandPointer();
  let t = 0;
  for (let k = 0; k < 12; k++) p.step([hand('pinch', 400, 400)], (t += 16));
  ok('one hand is pressing', p.pressing);
  let s = p.step([hand('pinch', 400, 400), hand('pinch', 600, 400)], (t += 16));
  ok('a second pinching hand cancels the press — two hands on the page are not also one hand on a card', s.intents[0].kind === 'cancel' && !p.pressing, kinds(s));
  ok('  the cursor sits between the hands', s.cursor.both && near(s.cursor.x, 500) && near(s.cursor.y, 440), J(s.cursor));
  s = p.step([hand('pinch', 350, 400), hand('pinch', 650, 400)], (t += 16));
  const z = s.intents.find((i) => i.kind === 'zoom');
  ok('pulling them apart zooms in, about the point between them', z && z.scale > 1.4 && near(z.x, 500), J(s.intents));
  s = p.step([hand('pinch', 400, 400), hand('pinch', 600, 400)], (t += 16));
  ok('  and together zooms out', s.intents.find((i) => i.kind === 'zoom')?.scale < 1);
  // let go of one hand, the other still pinching: no press until it opens
  const after = [];
  for (let k = 0; k < 12; k++) after.push(...p.step([hand('pinch', 400, 400)], (t += 16)).intents);
  ok('letting go of one hand never presses with the other', !after.some((i) => i.kind === 'press'), J(after.map((i) => i.kind)));
  for (let k = 0; k < 8; k++) p.step([hand('open', 400, 400)], (t += 16));
  const fresh = [];
  for (let k = 0; k < 12; k++) fresh.push(...p.step([hand('pinch', 400, 400)], (t += 16)).intents);
  ok('  once it has opened, a new pinch presses as usual', fresh.filter((i) => i.kind === 'press').length === 1);
}

console.log('\n=== the zoom, as the wheel a trackpad pinch sends ===');
{
  ok('zooming in is a negative delta, out a positive one (the trackpad pinch convention)', zoomWheelDelta(1.2) < 0 && zoomWheelDelta(0.8) > 0);
  ok('  sized by how far the hands moved', Math.abs(zoomWheelDelta(1.5)) > Math.abs(zoomWheelDelta(1.1)));
  ok('  and bounded, so a jump in the reading is not a leap', Math.abs(zoomWheelDelta(50)) <= 120 && Math.abs(zoomWheelDelta(0.01)) <= 120);
  ok('  nonsense is no zoom at all', zoomWheelDelta(NaN) === 0 && zoomWheelDelta(-1) === 0 && zoomWheelDelta(1) === 0);
  ok('a press that travels less than this is a click', CLICK_SLOP >= 6 && CLICK_SLOP <= 16);
}

console.log('\n=== reaching the hands without loading them (lib/hand-bus.ts) ===');
{
  // the session registers its own Stop as it loads (AR Mode's code, bundled here, loads it): a Stop with nothing on is harmless
  let threw = null;
  let first = false;
  try {
    first = stopHands();
  } catch (e) {
    threw = e;
  }
  ok('the session puts its Stop on the bus as it loads; a Stop with nothing on does nothing harmful', first === true && !threw, threw);
  ok('  and with no hand pointer following, there is nothing for "click" to use', handPointer() === null);
  let stopped = 0;
  registerHandStop(() => stopped++);
  ok('Stop reaches the registered session at once — nothing to download first', stopHands() === true && stopped === 1);
  const calls = [];
  registerHandPointer({ click: () => (calls.push('click'), 'More'), scroll: (d) => (calls.push('scroll ' + d), true), zoom: (k) => (calls.push('zoom ' + k), false) });
  const hp = handPointer();
  ok('while the pointer follows the hands, a spoken command reaches it', !!hp && hp.click() === 'More' && hp.scroll(-1) === true && hp.zoom(1.25) === false && calls.join('|') === 'click|scroll -1|zoom 1.25', calls.join('|'));
  registerHandPointer(null);
  ok('  and once it lets go, nothing is left to act on', handPointer() === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
