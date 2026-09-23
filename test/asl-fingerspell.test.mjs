// ASL fingerspelling from hand landmarks.
//
// A real hand is not available to a test, so hands are BUILT: a wrist, four
// knuckles, and each finger as a chain whose joints bend by the angles a
// signer's would. The thumb is placed where the letter puts it. Each letter
// is then read on the right hand, the mirrored left hand, and the hand turned
// in space — the classifier measures shape in the hand's own frame, so all
// three must agree. What this proves is that the letter rules are coherent
// and distinct from one another; how well MediaPipe's landmarks on a real
// hand land inside them is a question only the camera page can answer.

import {
  classify,
  score,
  features,
  step,
  asEnglish,
  EMPTY_SPELLER,
  HOLD_MS,
  SPACE_MS,
} from './.tmp/asl-fingerspell.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const rad = (d) => (d * Math.PI) / 180;
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const unit = (a) => mul(a, 1 / Math.hypot(a.x, a.y, a.z));
const lerp = (a, b, t) => add(a, mul(add(b, mul(a, -1)), t));

// Hand frame: x toward the thumb, y up the palm, z out of the palm toward
// the camera (fingers curl toward -z... i.e. toward the viewer).
const WRIST = { x: 0, y: 0, z: 0 };
const KNUCKLE = [
  { x: 0.33, y: 0.95, z: 0 },
  { x: 0.1, y: 1.0, z: 0 },
  { x: -0.12, y: 0.95, z: 0 },
  { x: -0.32, y: 0.85, z: 0 },
];
const LENGTHS = [
  [0.45, 0.27, 0.2],
  [0.5, 0.3, 0.22],
  [0.46, 0.28, 0.2],
  [0.36, 0.22, 0.18],
];
const SPREAD = [0.1, 0, -0.08, -0.18];

const EXT = [0, 0, 0];
const CURL = [75, 100, 60];
const HOOK = [10, 95, 65];
const CURVE = [30, 45, 30];

function finger(i, [a, b, c], spread = SPREAD[i]) {
  const base = unit({ x: spread, y: 1, z: 0 });
  const dir = (deg) => add(mul(base, Math.cos(rad(deg))), mul({ x: 0, y: 0, z: -1 }, Math.sin(rad(deg))));
  const m = KNUCKLE[i];
  const p = add(m, mul(dir(a), LENGTHS[i][0]));
  const d = add(p, mul(dir(a + b), LENGTHS[i][1]));
  const t = add(d, mul(dir(a + b + c), LENGTHS[i][2]));
  return [m, p, d, t];
}

/** A whole hand: finger angles, optional spreads, and where the thumb tip goes. */
function hand({ fingers, spreads = [], thumb }) {
  const f = fingers.map((ang, i) => finger(i, ang, spreads[i] ?? SPREAD[i]));
  const cmc = { x: 0.3, y: 0.22, z: 0 };
  const tip = typeof thumb === 'function' ? thumb(f) : thumb;
  const bulge = { x: 0.08, y: 0, z: -0.05 };
  const t2 = add(lerp(cmc, tip, 0.4), bulge);
  const t3 = add(lerp(cmc, tip, 0.72), mul(bulge, 0.5));
  return [WRIST, cmc, t2, t3, tip, ...f.flat()];
}

/** Hand frame → picture: rolled by `roll` degrees, optionally mirrored. */
function toImage(pts, roll = 0, mirror = false) {
  const c = Math.cos(rad(roll)), s = Math.sin(rad(roll));
  return pts.map((p) => {
    const x = c * p.x - s * p.y;
    const y = s * p.x + c * p.y;
    const X = 0.5 + 0.22 * (mirror ? -x : x);
    return { x: X, y: 0.7 - 0.22 * y, z: p.z * 0.22 };
  });
}

/** An arbitrary rigid turn in 3D, for the metric landmarks. */
function turn(pts, a = 0.6, b = -0.4, g = 0.9, mirror = false) {
  return pts.map((p0) => {
    let p = mirror ? { ...p0, x: -p0.x } : p0;
    p = { x: p.x, y: p.y * Math.cos(a) - p.z * Math.sin(a), z: p.y * Math.sin(a) + p.z * Math.cos(a) };
    p = { x: p.x * Math.cos(b) + p.z * Math.sin(b), y: p.y, z: -p.x * Math.sin(b) + p.z * Math.cos(b) };
    p = { x: p.x * Math.cos(g) - p.y * Math.sin(g), y: p.x * Math.sin(g) + p.y * Math.cos(g), z: p.z };
    return mul(p, 0.08); // metres, roughly
  });
}

const tipOf = (i) => (f) => add(f[i][3], { x: 0, y: 0, z: 0.02 });
const pipOf = (i) => (f) => add(f[i][1], { x: 0.03, y: 0, z: -0.03 });

const THUMB_OUT = { x: 1.0, y: 0.75, z: 0 };
const THUMB_SIDE = { x: 0.46, y: 0.72, z: -0.18 };
const THUMB_ACROSS = { x: 0.02, y: 0.62, z: -0.36 };
const THUMB_PALM = { x: 0.08, y: 0.55, z: -0.08 };
const THUMB_UNDER = { x: 0.12, y: 0.52, z: -0.3 };

const POSES = {
  A: { fingers: [CURL, CURL, CURL, CURL], thumb: THUMB_SIDE },
  S: { fingers: [CURL, CURL, CURL, CURL], thumb: THUMB_ACROSS },
  E: { fingers: [HOOK, HOOK, HOOK, HOOK], thumb: THUMB_UNDER },
  B: { fingers: [EXT, EXT, EXT, EXT], spreads: [0.03, 0, -0.03, -0.06], thumb: THUMB_PALM },
  C: { fingers: [CURVE, CURVE, CURVE, CURVE], thumb: { x: 0.55, y: 0.6, z: -0.55 } },
  O: { fingers: [CURVE, CURVE, CURVE, CURVE], thumb: tipOf(0) },
  D: { fingers: [EXT, CURVE.map((v) => v * 2.2), CURL, CURL], thumb: tipOf(1) },
  F: { fingers: [CURVE.map((v) => v * 1.6), EXT, EXT, EXT], thumb: tipOf(0) },
  I: { fingers: [CURL, CURL, CURL, EXT], thumb: THUMB_ACROSS },
  Y: { fingers: [CURL, CURL, CURL, EXT], thumb: THUMB_OUT },
  'I love you': { fingers: [EXT, CURL, CURL, EXT], thumb: THUMB_OUT },
  L: { fingers: [EXT, CURL, CURL, CURL], thumb: THUMB_OUT },
  X: { fingers: [HOOK, CURL, CURL, CURL], thumb: THUMB_ACROSS },
  U: { fingers: [EXT, EXT, CURL, CURL], spreads: [0.0, 0.0], thumb: THUMB_ACROSS },
  V: { fingers: [EXT, EXT, CURL, CURL], spreads: [0.35, -0.12], thumb: THUMB_ACROSS },
  K: { fingers: [EXT, EXT, CURL, CURL], spreads: [0.3, -0.1], thumb: pipOf(1) },
  R: { fingers: [EXT, EXT, CURL, CURL], spreads: [-0.35, 0.22], thumb: THUMB_ACROSS },
  W: { fingers: [EXT, EXT, EXT, CURL], spreads: [0.25, 0, -0.25], thumb: tipOf(3) },
  // Same shapes as L / U / K / G, pointed another way in the picture.
  G: { fingers: [EXT, CURL, CURL, CURL], thumb: { x: 0.62, y: 0.9, z: -0.1 }, roll: 90 },
  H: { fingers: [EXT, EXT, CURL, CURL], spreads: [0.0, 0.0], thumb: THUMB_ACROSS, roll: 90 },
  Q: { fingers: [EXT, CURL, CURL, CURL], thumb: { x: 0.62, y: 0.9, z: -0.1 }, roll: 180 },
  P: { fingers: [EXT, EXT, CURL, CURL], spreads: [0.3, -0.1], thumb: pipOf(1), roll: 165 },
};

console.log('=== every letter, as built ===');
for (const [label, pose] of Object.entries(POSES)) {
  const h = hand(pose);
  const roll = pose.roll ?? 0;
  const top = score(features(turn(h), toImage(h, roll)));
  const right = classify(turn(h), toImage(h, roll));
  const left = classify(turn(h, 0.6, -0.4, 0.9, true), toImage(h, -roll, true));
  const tilted = classify(turn(h, -0.3, 0.7, -0.5), toImage(h, roll + 12));
  ok(
    `${label.padEnd(10)} right hand · left hand · tilted`,
    right?.label === label && left?.label === label && tilted?.label === label,
    `right=${right?.label}(${right?.score}) left=${left?.label} tilted=${tilted?.label}  top3=${top.slice(0, 3).map((r) => `${r.label}:${r.score}`).join(' ')}`
  );
}

console.log('\n=== a real hand, as MediaPipe saw it ===');
{
  // Landmarks captured from the live page, run over a photo of a fist with
  // the thumb up. The first version of the curl thresholds came only from
  // built hands and read this at 43% — below the line to write anything.
  const { readFileSync } = await import('node:fs');
  const real = JSON.parse(readFileSync(new URL('./fixtures/hand-fist-thumb-up.json', import.meta.url), 'utf8'));
  const r = classify(real.world, real.image, real.aspect);
  ok('a real fist with the thumb up reads as A, confidently', r?.label === 'A' && r.score >= 0.8, JSON.stringify(r));
}

console.log('\n=== not everything is a letter ===');
{
  const five = hand({ fingers: [EXT, EXT, EXT, EXT], spreads: [0.35, 0.1, -0.12, -0.35], thumb: THUMB_OUT });
  const r = classify(turn(five), toImage(five));
  ok('an open hand with fingers spread is no letter', r === null || !['B', 'W'].includes(r.label), JSON.stringify(r));
  ok('too few points is no letter', classify([], []) === null);
}

console.log('\n=== spelling: letters become text ===');
{
  const A = { label: 'A', score: 0.9 };
  const B = { label: 'B', score: 0.9 };
  let s = EMPTY_SPELLER;
  let t = 1000;
  const feed = (r, ms, seen = true) => {
    for (let e = 0; e < ms; e += 33) { s = step(s, r, t, seen); t += 33; }
  };
  feed(A, 300);
  ok('a letter held briefly is not written', s.text === '', JSON.stringify(s.text));
  feed(A, HOLD_MS);
  ok('held long enough, it is written once', s.text === 'A', JSON.stringify(s.text));
  feed(A, 2000);
  ok('holding it longer does not repeat it', s.text === 'A', JSON.stringify(s.text));
  feed(null, 300);
  feed(A, HOLD_MS + 300);
  ok('released and signed again, it repeats', s.text === 'AA', JSON.stringify(s.text));
  feed(B, HOLD_MS + 300);
  ok('a new letter follows', s.text === 'AAB', JSON.stringify(s.text));
  feed({ label: 'Q', score: 0.9 }, 66);
  feed(B, 200);
  ok('a flicker of another letter is ignored', s.text === 'AAB', JSON.stringify(s.text));
  feed(null, SPACE_MS + 200, false);
  ok('the hand leaving the picture ends the word', s.text === 'AAB ', JSON.stringify(s.text));
  feed({ label: 'I love you', score: 0.9 }, HOLD_MS + 200);
  ok('a word-shape is written as words', s.text === 'AAB I love you ', JSON.stringify(s.text));
  ok('as English', asEnglish(s.text) === 'Aab I love you', asEnglish(s.text));
  ok('a lone i is capitalised', asEnglish('HI I AM SAM ') === 'Hi I am sam');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
