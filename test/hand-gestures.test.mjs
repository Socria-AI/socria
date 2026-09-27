// Twenty-one points into an intention — and the one that must not misfire.
//
// WHY THIS SUITE EXISTS AT ALL. Everything hard about gesture control is not
// the geometry, it is the AMBIGUITY: a hand on its way from open to a fist
// passes through every pose in between, so a classifier that reports each
// frame honestly will fire "delete" while somebody is closing their hand to
// point at something. Those are decisions about TIME, and time is the thing a
// person testing by waving at a webcam cannot check — you cannot hold a pose
// for exactly 1.39 seconds to see whether the guard holds.
//
// So the tracker takes `now` as an argument and the hands are synthesised.
// Feeding it a sequence and asserting what it did is the only way to be sure
// that a hand passing through a fist does not delete anything, and that is the
// one assertion on this page that really matters.

import {
  readHand, GestureTracker, TwoHandTracker, aimedAt, GESTURE, ACTIONS, POSES,
} from './.tmp/hand-gestures.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

// ── a hand, built by hand ───────────────────────────────────────────
//
// MediaPipe's 21 points, laid out as a flat hand at the origin: the wrist at
// the bottom, four fingers up, the thumb out to the side. `up` says which are
// extended; a curled finger has its tip pulled back toward the wrist, which
// is exactly what the classifier measures.
function hand({ up = [1, 1, 1, 1, 1], pinch = false, at = [0.5, 0.5], scale = 1 } = {}) {
  const [cx, cy] = at;
  const s = 0.18 * scale;
  const pts = new Array(21);
  const put = (i, x, y) => (pts[i] = { x: cx + x * s, y: cy + y * s, z: 0 });
  put(0, 0, 0.5); // wrist
  // the four fingers: knuckle, two joints, tip — straight up, or curled back
  const cols = [-0.3, -0.1, 0.1, 0.3];
  [1, 2, 3, 4].forEach((f, k) => {
    const x = cols[k];
    const mcp = 5 + k * 4;
    put(mcp, x, 0.1);
    if (up[f]) {
      put(mcp + 1, x, -0.12);
      put(mcp + 2, x, -0.3);
      put(mcp + 3, x, -0.48);
    } else {
      // curled: the tip comes back toward the wrist, nearer than the middle joint
      put(mcp + 1, x, -0.02);
      put(mcp + 2, x, 0.16);
      put(mcp + 3, x, 0.3);
    }
  });
  // the thumb, out to the side when extended and across the palm when not
  if (pinch) {
    // tip meets the index tip
    const idx = pts[8];
    put(1, -0.5, 0.35); put(2, -0.62, 0.2); put(3, -0.6, 0);
    pts[4] = { x: idx.x + 0.004, y: idx.y + 0.004, z: 0 };
  } else if (up[0]) {
    put(1, -0.5, 0.35); put(2, -0.7, 0.18); put(3, -0.85, 0.0); put(4, -1.0, -0.15);
  } else {
    put(1, -0.4, 0.35); put(2, -0.42, 0.22); put(3, -0.3, 0.14); put(4, -0.18, 0.1);
  }
  return pts;
}

const POSE = {
  open: () => hand({ up: [1, 1, 1, 1, 1] }),
  fist: () => hand({ up: [0, 0, 0, 0, 0] }),
  point: () => hand({ up: [0, 1, 0, 0, 0] }),
  two: () => hand({ up: [0, 1, 1, 0, 0] }),
  three: () => hand({ up: [0, 1, 1, 1, 0] }),
  pinch: () => hand({ up: [0, 1, 0, 0, 0], pinch: true }),
};

console.log('=== a hand is read as a pose ===');
{
  for (const [name, make] of Object.entries(POSE)) {
    const r = readHand(make());
    ok(`${name} reads as ${name}`, r && r.pose === name, r ? r.pose : 'null');
  }
  ok('every pose it can report is in POSES',
    Object.keys(POSE).every((p) => POSES.includes(p)));
  ok('nothing at all is null', readHand(undefined) === null && readHand([]) === null);
  ok('a partial hand is null, not a guess', readHand([{ x: 0, y: 0, z: 0 }]) === null);

  // Scale independence: the same pose at half the size is the same pose. A
  // classifier that measures in raw frame units works at one distance only.
  for (const [name, make] of Object.entries(POSE)) {
    const small = readHand(hand({ ...{ up: [1,1,1,1,1] }, ...(name === 'fist' ? { up: [0,0,0,0,0] } : name === 'point' ? { up: [0,1,0,0,0] } : name === 'two' ? { up: [0,1,1,0,0] } : name === 'three' ? { up: [0,1,1,1,0] } : name === 'pinch' ? { up: [0,1,0,0,0], pinch: true } : {}), scale: 0.45, at: [0.2, 0.8] }));
    ok(`  ${name} still reads at half the size, across the frame`, small && small.pose === name, small ? small.pose : 'null');
  }

  // Pinch is a number as well as a pose, because a caller may want the degree.
  ok('a closed pinch reads near 1', readHand(POSE.pinch()).pinch > 0.7);
  ok('  and an open hand near 0', readHand(POSE.open()).pinch < 0.3);
  // Where a hand is aiming depends on what it is doing: a pointing finger
  // aims with its tip, a fist with its palm.
  const pt = readHand(POSE.point());
  ok('pointing aims with the fingertip, above the palm', pt.aim.y < pt.palm.y);
}

console.log('\n=== the tracker will not believe a flicker ===');
{
  // A pose has to persist before it is believed. Without that, a hand moving
  // between poses reports a burst of whatever it passed through.
  const t = new GestureTracker(120);
  ok('one frame of a fist is not a fist', t.read(readHand(POSE.fist()), 0).pose !== 'fist');
  ok('  nor is it after 100ms', t.read(readHand(POSE.fist()), 100).pose !== 'fist');
  ok('  but it is after the settle', t.read(readHand(POSE.fist()), 130).pose === 'fist');
  // Losing the hand resets everything rather than leaving a pose believed.
  ok('no hand means no pose', t.read(null, 200).pose === 'none');
}

console.log('\n=== THE ONE THAT MUST NOT MISFIRE ===');
{
  // A hand closing to point passes THROUGH a fist. If a fist fired on sight,
  // pointing at something would delete it — which is the failure that makes a
  // gesture interface untrustworthy after exactly one occurrence.
  const t = new GestureTracker(120);
  let fired = null;
  // 400ms of fist on the way past, then open again
  for (let now = 0; now <= 400; now += 16) {
    const r = t.read(readHand(POSE.fist()), now);
    if (r.fired) fired = r.fired;
  }
  for (let now = 416; now <= 700; now += 16) {
    const r = t.read(readHand(POSE.open()), now);
    if (r.fired) fired = r.fired;
  }
  ok('passing through a fist deletes nothing', fired === null, String(fired));

  // Held long enough, it fires — once.
  const t2 = new GestureTracker(120);
  let fires = 0;
  for (let now = 0; now <= 4000; now += 16) {
    const r = t2.read(readHand(POSE.fist()), now);
    if (r.fired === 'delete') fires++;
  }
  ok('held past the threshold, it fires', fires >= 1);
  ok('  exactly once, however long it is held', fires === 1, `${fires}`);

  // And the hold is reported while it runs, so the person can see it coming
  // and stop — which is the whole reason it is a hold.
  const t3 = new GestureTracker(120);
  let sawProgress = false;
  for (let now = 0; now <= 900; now += 16) {
    const r = t3.read(readHand(POSE.fist()), now);
    if (r.holding && r.holding.action === 'delete' && r.holding.at > 0.2 && r.holding.at < 1) sawProgress = true;
  }
  ok('the countdown is visible while it runs', sawProgress);

  // Letting go part way through starts again from zero rather than resuming.
  const t4 = new GestureTracker(120);
  for (let now = 0; now <= 900; now += 16) t4.read(readHand(POSE.fist()), now);
  for (let now = 916; now <= 1200; now += 16) t4.read(readHand(POSE.open()), now);
  let firedAfter = null;
  for (let now = 1216; now <= 1216 + 900; now += 16) {
    const r = t4.read(readHand(POSE.fist()), now);
    if (r.fired) firedAfter = r.fired;
  }
  ok('releasing part way through starts the count again', firedAfter === null);

  // Delete is held longest of all the actions, on purpose.
  ok('delete is the longest hold there is',
    ACTIONS.every((a) => a === 'delete' || GESTURE[a].hold < GESTURE.delete.hold));
  ok('  and grabbing needs no hold at all, being reversible', GESTURE.grab.hold === 0);
}

console.log('\n=== research and challenge ===');
{
  const run = (make, ms) => {
    const t = new GestureTracker(120);
    let fired = null;
    for (let now = 0; now <= ms; now += 16) {
      const r = t.read(readHand(make()), now);
      if (r.fired) fired = r.fired;
    }
    return fired;
  };
  ok('two fingers held research', run(POSE.two, 1200) === 'research');
  ok('three fingers held challenge', run(POSE.three, 1200) === 'challenge');
  ok('  and a brush past neither', run(POSE.two, 300) === null && run(POSE.three, 300) === null);
  ok('an open hand does nothing at all', run(POSE.open, 3000) === null);
  ok('  and so does pointing', run(POSE.point, 3000) === null);
}

console.log('\n=== grabbing ===');
{
  const t = new GestureTracker(120);
  let g = false;
  for (let now = 0; now <= 400; now += 16) g = t.read(readHand(POSE.pinch()), now).grabbing;
  ok('a pinch grabs', g);
  for (let now = 416; now <= 700; now += 16) g = t.read(readHand(POSE.open()), now).grabbing;
  ok('  and opening the hand lets go', !g);
  ok('  with no hold needed either way', GESTURE.grab.hold === 0);
}

console.log('\n=== aim ===');
{
  // The aim is smoothed, because an unsmoothed fingertip jitters by a few per
  // cent of the frame — at arm's length, enough to slide off what you meant.
  const t = new GestureTracker(120, 0.6);
  t.read(readHand(hand({ up: [0,1,0,0,0], at: [0.2, 0.2] })), 0);
  const jumped = t.read(readHand(hand({ up: [0,1,0,0,0], at: [0.8, 0.8] })), 16);
  ok('a jump is followed, but not instantly', jumped.aim.x > 0.2 && jumped.aim.x < 0.74, `${jumped.aim.x}`);
  // It converges on where the hand is AIMING, which for a pointing hand is the
  // index tip rather than the middle of the hand — so the target is asked of
  // the reader rather than assumed to be the position the hand was built at.
  const target = readHand(hand({ up: [0, 1, 0, 0, 0], at: [0.8, 0.8] })).aim.x;
  let last = jumped.aim.x;
  for (let now = 32; now <= 600; now += 16) last = t.read(readHand(hand({ up: [0,1,0,0,0], at: [0.8, 0.8] })), now).aim.x;
  ok('  and it gets there', Math.abs(last - target) < 0.005, `${last} vs ${target}`);

  // Nodes are caught within a radius, because a pointing finger is not a mouse.
  const nodes = [{ id: 'a', x: 0.2, y: 0.2 }, { id: 'b', x: 0.8, y: 0.8 }];
  ok('the node you are near is the one you get', aimedAt(nodes, { x: 0.23, y: 0.22 }, 0.1)?.id === 'a');
  ok('  the nearest wins when two are in range',
    aimedAt([{ id: 'a', x: 0.5, y: 0.5 }, { id: 'b', x: 0.54, y: 0.5 }], { x: 0.53, y: 0.5 }, 0.2)?.id === 'b');
  ok('  and nothing is caught out of range', aimedAt(nodes, { x: 0.5, y: 0.5 }, 0.05) === null);
}

console.log('\n=== two hands ===');
{
  const t = new TwoHandTracker();
  const L = (x) => readHand(hand({ at: [x, 0.5] }));
  ok('one hand is not a two-hand gesture', t.read(L(0.3), null) === null);
  t.read(L(0.3), L(0.5));
  const apart = t.read(L(0.2), L(0.6));
  ok('moving the hands apart scales up', apart && apart.scale > 1, JSON.stringify(apart));
  const together = t.read(L(0.35), L(0.45));
  ok('  and together scales down', together && together.scale < 1);
  // Losing a hand forgets the previous reading, so the next pair does not
  // report the whole gap as one enormous jump.
  t.read(null, null);
  const first = t.read(L(0.1), L(0.9));
  ok('the first frame after a gap moves nothing', first && first.scale === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
