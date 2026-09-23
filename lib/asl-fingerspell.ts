// lib/asl-fingerspell.ts
//
// ASL fingerspelling from one hand's landmarks — a test bench, not a product.
//
// MediaPipe gives 21 points per hand. This reads the SHAPE they make — which
// fingers are straight, curled, hooked, together or crossed, where the thumb
// is, which way the hand points — and scores every letter against it. The
// answer is the best score, with that score as the confidence.
//
// What it can and cannot do, plainly:
//   - Static letters only: A B C D E F G H I K L O P Q R S U V W X Y, and the
//     "I love you" handshape. J and Z are traced in the air, so one frame
//     cannot see them. M, N and T differ only in where the thumb hides under
//     the fingers, which the tracker cannot reliably see.
//   - It spells; it does not translate signed WORDS. Almost every ASL word is
//     a movement, and reading movement needs a model trained on video.
//
// Shape is measured in the hand's own frame (wrist → middle knuckle is "up",
// pinky knuckle → index knuckle is "toward the thumb"), so the same letter
// reads the same on either hand and at any tilt. Only G/H/P/Q, which differ
// from L/U/K by where the hand POINTS, look at the picture's orientation.

export type P3 = { x: number; y: number; z: number };

export interface Reading {
  /** the letter, or a word for a word-shape ('I love you') */
  label: string;
  score: number;
}

export interface Features {
  ext: number[];      // index, middle, ring, pinky: 1 = straight
  curled: number[];   // folded into the palm
  hooked: number[];   // knuckle straight, finger bent over (X, E)
  curved: number[];   // gently bent (C, O)
  thumbOut: number;   // thumb held away from the hand (L, Y)
  fan: number;        // degrees between the index and pinky directions: 0 = together
  thumb: P3;          // thumb tip, hand frame, in palm lengths
  mcp: P3[];          // index..pinky knuckles, hand frame
  tips: P3[];         // index..pinky tips, hand frame
  touch: (a: number, b: number) => number;
  dist: (a: number, b: number) => number;
  up: number;         // index points up in the picture
  side: number;       //   … sideways
  down: number;       //   … down
}

const FINGERS = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

const sub = (a: P3, b: P3): P3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: P3, b: P3) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: P3) => Math.sqrt(dot(a, a));
const scale = (a: P3, k: number): P3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const norm = (a: P3) => scale(a, 1 / (len(a) || 1));
const cross = (a: P3, b: P3): P3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** Angle between two segments, degrees: 0 = straight on, 180 = folded back. */
function bendAt(a: P3, b: P3, c: P3): number {
  const u = norm(sub(b, a));
  const v = norm(sub(c, b));
  return (Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180) / Math.PI;
}

/** 0 below `a`, 1 above `b`, linear between (reversed when a > b). */
export function ramp(v: number, a: number, b: number): number {
  if (a === b) return v >= a ? 1 : 0;
  const t = (v - a) / (b - a);
  return Math.max(0, Math.min(1, t));
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const all = (...xs: number[]) => Math.min(...xs);

/**
 * `world` is MediaPipe's metric 3D landmarks (best for shape); `image` the
 * normalised picture landmarks (for which way the hand points). `aspect` is
 * the picture's width / height, so image x and y are in the same units.
 */
export function features(world: P3[], image: P3[], aspect = 1): Features {
  const w0 = world[0];
  const s = len(sub(world[9], w0)) || 1;
  const upV = norm(sub(world[9], w0));
  const across = sub(world[5], world[17]);
  const sideV = norm(sub(across, scale(upV, dot(across, upV))));
  const nV = cross(upV, sideV);
  const local = (p: P3): P3 => {
    const d = sub(p, w0);
    return { x: dot(d, sideV) / s, y: dot(d, upV) / s, z: dot(d, nV) / s };
  };
  const dist = (a: number, b: number) => len(sub(world[a], world[b])) / s;
  const touch = (a: number, b: number) => 1 - ramp(dist(a, b), 0.2, 0.4);

  const ext: number[] = [];
  const curled: number[] = [];
  const hooked: number[] = [];
  const curved: number[] = [];
  for (const [m, p, d, t] of FINGERS) {
    const bend = bendAt(world[m], world[p], world[d]) + bendAt(world[p], world[d], world[t]);
    const knuckle = bendAt(w0, world[m], world[p]);
    ext.push(1 - ramp(bend, 35, 80));
    // Thresholds from a real fist, not only from built hands: MediaPipe put
    // its knuckles at 41-57° and its finger joints at 156-191° in total, so
    // "curled" starts well below where a drawn fist would suggest.
    curled.push(ramp(bend, 100, 140) * ramp(knuckle, 22, 38));
    hooked.push(ramp(bend, 85, 125) * (1 - ramp(knuckle, 18, 32)));
    curved.push(ramp(bend, 35, 60) * (1 - ramp(bend, 135, 165)));
  }

  // How far the fingers fan out: the angle between the index and pinky
  // directions, in the plane of the palm. Tip-to-tip distance cannot say
  // this, because the pinky is shorter and its tip sits lower anyway.
  const flat = (a: number, b: number) => {
    const d = local(world[b]);
    const o = local(world[a]);
    return Math.atan2(d.x - o.x, d.y - o.y);
  };
  // Wrapped to ±180°: two directions either side of "down" are close
  // together, not 300° apart.
  let turn = flat(5, 8) - flat(17, 20);
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  const fan = Math.abs(turn) * (180 / Math.PI);

  // Which way the index finger points in the PICTURE (y grows downward).
  const dx = (image[8].x - image[5].x) * aspect;
  const dy = image[8].y - image[5].y;
  const l = Math.hypot(dx, dy) || 1;

  return {
    ext,
    curled,
    hooked,
    curved,
    // Out = the thumb tip well to the thumb side of the index knuckle. A
    // thumb along the side of a fist (A) sits just past it; across the palm
    // (B, S) it is on the other side.
    thumbOut: ramp(local(world[4]).x - local(world[5]).x, 0.22, 0.45),
    fan,
    thumb: local(world[4]),
    mcp: [5, 9, 13, 17].map((i) => local(world[i])),
    tips: [8, 12, 16, 20].map((i) => local(world[i])),
    touch,
    dist,
    up: ramp(-dy / l, 0.45, 0.75),
    side: ramp(Math.abs(dx) / l, 0.65, 0.85),
    down: ramp(dy / l, 0.45, 0.75),
  };
}

const I = 0, M = 1, R = 2, K = 3; // index, middle, ring, pinky

/** Every letter's score for one hand shape, best first. */
export function score(f: Features): Reading[] {
  const not = (v: number) => 1 - v;
  const fold = (i: number) => Math.max(f.curled[i], f.hooked[i], 1 - f.ext[i] > 0.9 ? 0.8 : 0);
  // "These fingers are down" means EVERY one of them: an average let one
  // raised finger through, and L read as A.
  const down3 = all(fold(M), fold(R), fold(K));
  const fist4 = all(...f.curled);
  const together = not(ramp(f.dist(8, 12), 0.22, 0.35));
  const apart = ramp(f.dist(8, 12), 0.3, 0.45);
  const crossed = ramp(f.tips[M].x - f.tips[I].x, -0.02, 0.08);
  const betweenIM = (f.mcp[I].x + f.mcp[M].x) / 2;
  const t = f.thumb;
  const lowestTip = Math.min(...f.tips.map((p) => p.y));
  const pairV = all(f.ext[I], f.ext[M], fold(R), fold(K));

  const letters: Record<string, number> = {
    // Fists, told apart by where the thumb is.
    A: all(fist4, ramp(t.x - f.mcp[I].x, -0.12, 0.02), ramp(t.y, 0.4, 0.6)),
    S: all(fist4, not(ramp(t.x - betweenIM, -0.02, 0.12)), ramp(t.x - f.mcp[R].x, -0.15, 0.0), ramp(t.y - lowestTip, -0.05, 0.1)),
    E: all(...f.hooked, not(ramp(t.y - lowestTip, -0.05, 0.1)), not(f.thumbOut)),
    // Open hands.
    B: all(...f.ext, not(ramp(f.fan, 16, 28)), not(f.thumbOut), not(ramp(t.x - f.mcp[I].x, -0.05, 0.1))),
    C: all(...f.curved, ramp(f.dist(4, 8), 0.3, 0.45), not(ramp(f.dist(4, 8), 1.0, 1.3))),
    O: all(avg([f.curved[I], f.curved[M], Math.max(f.curved[R], f.curled[R])]), f.touch(4, 8)),
    // One finger up.
    D: all(f.ext[I], down3, f.touch(4, 12), not(f.side)),
    F: all(f.touch(4, 8), f.ext[M], f.ext[R], f.ext[K], not(f.ext[I])),
    I: all(f.ext[K], fold(I), fold(M), fold(R), not(f.thumbOut)),
    Y: all(f.ext[K], fold(I), fold(M), fold(R), f.thumbOut),
    'I love you': all(f.ext[I], f.ext[K], fold(M), fold(R), f.thumbOut),
    L: all(f.ext[I], down3, f.thumbOut, f.up),
    G: all(f.ext[I], down3, f.side, not(f.touch(4, 12))),
    Q: all(f.ext[I], down3, f.down),
    X: all(f.hooked[I], down3, not(f.ext[I])),
    // Two or three fingers up.
    U: all(pairV, together, not(crossed), f.up),
    V: all(pairV, apart, not(f.touch(4, 10)), not(f.touch(4, 11)), f.up),
    K: all(pairV, Math.max(f.touch(4, 10), f.touch(4, 11)), f.up),
    P: all(f.ext[I], fold(R), fold(K), f.down, Math.max(f.touch(4, 10), f.touch(4, 11))),
    H: all(pairV, together, f.side),
    R: all(pairV, crossed),
    W: all(f.ext[I], f.ext[M], f.ext[R], fold(K)),
  };
  return Object.entries(letters)
    .map(([label, s]) => ({ label, score: Math.round(s * 1000) / 1000 }))
    .sort((a, b) => b.score - a.score);
}

/** The single best reading, or null when nothing is convincing. */
export function classify(world: P3[], image: P3[], aspect = 1, threshold = 0.5): Reading | null {
  if (world.length < 21 || image.length < 21) return null;
  const best = score(features(world, image, aspect))[0];
  return best && best.score >= threshold ? best : null;
}

// ── turning a stream of readings into text ─────────────────────────

export interface SpellerState {
  text: string;
  /** the label being held, and since when */
  holding: string | null;
  since: number;
  /** a label is written once per hold; it must be released before it repeats */
  written: string | null;
  /** last time a hand was seen, for word breaks */
  lastSeen: number;
  recent: (string | null)[];
}

export const EMPTY_SPELLER: SpellerState = { text: '', holding: null, since: 0, written: null, lastSeen: 0, recent: [] };

/** How long a letter must be held to be written, and how long a pause makes a space. */
export const HOLD_MS = 700;
export const SPACE_MS = 1300;
const WINDOW = 9;

/**
 * One frame in, the new state out. A letter is written once it has been the
 * majority of the last few frames for HOLD_MS; the same letter again needs a
 * release in between (so "LL" is L, relax, L). No hand for SPACE_MS after a
 * letter ends the word. A word-shape ("I love you") is written as words.
 */
export function step(state: SpellerState, reading: Reading | null, now: number, handSeen: boolean): SpellerState {
  const recent = [...state.recent, reading?.label ?? null].slice(-WINDOW);
  const counts = new Map<string | null, number>();
  for (const r of recent) counts.set(r, (counts.get(r) ?? 0) + 1);
  let major: string | null = null;
  let most = 0;
  for (const [k, n] of counts) if (n > most) { major = k; most = n; }
  if (most < Math.ceil(recent.length * 0.6)) major = null;

  let { text, holding, since, written, lastSeen } = state;
  if (handSeen) lastSeen = now;
  else if (text && !text.endsWith(' ') && lastSeen && now - lastSeen > SPACE_MS) text += ' ';

  if (major !== holding) {
    holding = major;
    since = now;
    if (major !== written) written = null;
  }
  if (holding && holding !== written && now - since >= HOLD_MS) {
    if (holding.length > 1) text += (text && !text.endsWith(' ') ? ' ' : '') + holding + ' ';
    else text += holding;
    written = holding;
  }
  if (!holding) written = null;
  return { text, holding, since, written, lastSeen, recent };
}

/** The transcript as plain English: words in sentence case, spacing tidied. */
export function asEnglish(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!t) return '';
  return t.replace(/\bi\b/g, 'I').replace(/^./, (c) => c.toUpperCase());
}
