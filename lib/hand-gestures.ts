// lib/hand-gestures.ts
//
// Twenty-one points into an intention.
//
// WHY THIS IS A SEPARATE, PURE FILE. Everything hard about gesture control is
// not the recognition — MediaPipe hands you the landmarks — it is the
// AMBIGUITY: a hand on its way from open to a fist passes through every pose
// in between, and a classifier that reports each frame honestly will fire
// "delete" while somebody is closing their hand to point. So the decisions
// that matter are about hysteresis, dwell and confirmation, and those are
// decisions about time rather than about geometry. Kept here, away from the
// camera, they can be tested by feeding a sequence of poses to a tracker and
// asserting what it did — which is the only way to be sure the delete gesture
// cannot fire by accident, and that is the one that has to be sure.
//
// NOTHING HERE TOUCHES THE DOM, THE CAMERA OR THE CLOCK. Time is passed in.
//
// THE RULE ABOUT DESTRUCTIVE ACTIONS. Pointing is instant, because a wrong
// hover costs nothing. Grabbing is instant, because it is reversible by
// letting go. Delete is never instant: it requires the pose to be held, and
// while it is held the caller is given the fraction elapsed so the person can
// see it coming and stop. A gesture interface that deletes on a frame's
// worth of evidence is one nobody will trust twice.

export interface Pt {
  x: number;
  y: number;
  z: number;
}

/** Which named poses the tracker can report. */
export const POSES = ['none', 'open', 'point', 'pinch', 'two', 'three', 'fist'] as const;
export type Pose = (typeof POSES)[number];

export interface HandRead {
  pose: Pose;
  /** how closed the thumb-and-index pinch is, 0 (apart) … 1 (touching) */
  pinch: number;
  /** which fingers are extended, thumb first */
  extended: boolean[];
  /** the point the hand is aiming with — the index tip, or the palm when not pointing */
  aim: { x: number; y: number };
  /** the palm centre, for moving something with the whole hand */
  palm: { x: number; y: number };
  /** how big the hand appears, as the wrist-to-middle-knuckle distance */
  size: number;
  /** left or right, as MediaPipe reports it (already mirror-corrected by the caller) */
  hand: 'left' | 'right' | 'unknown';
}

const TIP = [4, 8, 12, 16, 20];
const PIP = [3, 6, 10, 14, 18];
const MCP = [2, 5, 9, 13, 17];

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Is this finger straight?
 *
 * The tip further from the wrist than the middle joint is, scaled by the
 * hand's own size so it works at any distance from the camera. The thumb is
 * measured sideways instead: it folds across the palm rather than curling
 * toward the wrist, so the same test calls a closed thumb extended and every
 * fist reads as a four-finger pose.
 */
function isExtended(pts: Pt[], finger: number, size: number): boolean {
  const wrist = pts[0];
  if (finger === 0) {
    // the thumb, by how far the tip sits from the index knuckle
    return dist(pts[4], pts[5]) > size * 0.62;
  }
  return dist(pts[TIP[finger]], wrist) > dist(pts[PIP[finger]], wrist) * 1.06;
}

/** One hand's landmarks, read as a pose. Pure. */
export function readHand(
  pts: Pt[] | undefined,
  hand: HandRead['hand'] = 'unknown'
): HandRead | null {
  if (!pts || pts.length < 21) return null;
  const size = Math.max(1e-6, dist(pts[0], pts[9]));
  const extended = [0, 1, 2, 3, 4].map((f) => isExtended(pts, f, size));
  // Pinch as a fraction: touching at a tenth of the hand's size, open at half.
  const gap = dist(pts[4], pts[8]) / size;
  const pinch = Math.max(0, Math.min(1, (0.55 - gap) / 0.45));

  const palm = {
    x: (pts[0].x + pts[5].x + pts[17].x) / 3,
    y: (pts[0].y + pts[5].y + pts[17].y) / 3,
  };

  const up = extended.filter(Boolean).length;
  let pose: Pose;
  if (pinch > 0.72 && !extended[2] && !extended[3]) {
    // Thumb and index together with the rest down: the grab.
    pose = 'pinch';
  } else if (up === 0) {
    pose = 'fist';
  } else if (up === 1 && extended[1]) {
    pose = 'point';
  } else if (up === 2 && extended[1] && extended[2]) {
    pose = 'two';
  } else if (up === 3 && extended[1] && extended[2] && extended[3]) {
    pose = 'three';
  } else if (up >= 4) {
    pose = 'open';
  } else {
    pose = 'none';
  }

  return {
    pose,
    pinch,
    extended,
    aim: pose === 'pinch' ? { x: (pts[4].x + pts[8].x) / 2, y: (pts[4].y + pts[8].y) / 2 } : pose === 'point' ? { x: pts[8].x, y: pts[8].y } : palm,
    palm,
    size,
    hand,
  };
}

// ── from a pose to an intention ─────────────────────────────────────

export const ACTIONS = ['grab', 'research', 'challenge', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];

/** Which pose asks for which action, and whether it must be held. */
export const GESTURE: Record<Action, { pose: Pose; hold: number; label: string; says: string }> = {
  // Reversible the instant you let go, so it needs no confirmation at all.
  grab: { pose: 'pinch', hold: 0, label: 'Pinch', says: 'Pinch to pick a node up. Let go to drop it.' },
  // Additive: it asks a question of a node, and a stray one costs a moment.
  research: { pose: 'two', hold: 600, label: 'Two fingers', says: 'Two fingers, held, to research the node you are aiming at.' },
  challenge: { pose: 'three', hold: 600, label: 'Three fingers', says: 'Three fingers, held, to challenge it.' },
  // THE ONE THAT MUST NOT MISFIRE. A hand closing to point passes through a
  // fist, so this is the longest hold on the page and the only one that draws
  // its own countdown.
  delete: { pose: 'fist', hold: 1400, label: 'Fist', says: 'Close your hand and hold to delete. The ring shows how long is left — open your hand to stop.' },
};

export interface Progress {
  action: Action;
  /** 0 … 1 of the way to firing */
  at: number;
}

export interface TrackerOut {
  /** the pose the tracker believes, after smoothing */
  pose: Pose;
  /** an action that fired on THIS call, and only this one */
  fired: Action | null;
  /** an action being held, and how far through */
  holding: Progress | null;
  /** where the hand is aiming, smoothed */
  aim: { x: number; y: number };
  /** true while a pinch is closed — the caller drags with this */
  grabbing: boolean;
}

/**
 * The part that is about time.
 *
 * A pose must persist for `settle` milliseconds before the tracker believes
 * it. That is the hysteresis: without it, a hand moving between poses reports
 * a burst of whatever it passed through, and with a 1.4-second delete hold the
 * flicker is enough to restart the countdown forever so it never fires at all.
 *
 * Once believed, a held action accumulates only while the SAME pose continues.
 * Any change resets it. An action fires once, and then the pose is spent: it
 * cannot fire again until the hand has left that pose and come back, which is
 * what stops one long fist from deleting everything in sequence.
 */
export class GestureTracker {
  private believed: Pose = 'none';
  private candidate: Pose = 'none';
  private since = 0;
  private heldFrom = 0;
  private spent = false;
  private smoothed: { x: number; y: number } | null = null;

  constructor(
    private settle = 120,
    /** 0 = jump to the hand, 1 = never move. The aim is noisy at a distance. */
    private smoothing = 0.55
  ) {}

  reset() {
    this.believed = 'none';
    this.candidate = 'none';
    this.spent = false;
    this.smoothed = null;
  }

  read(hand: HandRead | null, now: number): TrackerOut {
    if (!hand) {
      this.reset();
      return { pose: 'none', fired: null, holding: null, aim: this.smoothed ?? { x: 0.5, y: 0.5 }, grabbing: false };
    }

    // Smooth the aim before anything reads it: an unsmoothed fingertip jitters
    // by a few per cent of the frame, which at arm's length is enough to slide
    // off the node you are pointing at.
    const k = this.smoothing;
    this.smoothed = this.smoothed
      ? { x: this.smoothed.x * k + hand.aim.x * (1 - k), y: this.smoothed.y * k + hand.aim.y * (1 - k) }
      : { ...hand.aim };

    if (hand.pose !== this.candidate) {
      this.candidate = hand.pose;
      this.since = now;
    }
    if (this.candidate !== this.believed && now - this.since >= this.settle) {
      this.believed = this.candidate;
      this.heldFrom = now;
      this.spent = false;
    }

    let fired: Action | null = null;
    let holding: Progress | null = null;
    for (const a of ACTIONS) {
      const g = GESTURE[a];
      if (g.pose !== this.believed) continue;
      if (g.hold <= 0) break;
      const at = Math.min(1, (now - this.heldFrom) / g.hold);
      if (at >= 1 && !this.spent) {
        fired = a;
        this.spent = true;
      } else if (at < 1) {
        holding = { action: a, at };
      }
      break;
    }

    return {
      pose: this.believed,
      fired,
      holding,
      aim: this.smoothed,
      grabbing: this.believed === 'pinch',
    };
  }
}

/**
 * Which node a hand is aiming at, if any.
 *
 * Generous on purpose — a node is caught within a radius around it rather than
 * only on it, because a pointing finger is not a mouse and nobody can hold one
 * inside twelve pixels. The nearest wins when several are in range.
 */
export function aimedAt<T extends { id: string; x: number; y: number }>(
  nodes: readonly T[],
  aim: { x: number; y: number },
  radius: number
): T | null {
  let best: T | null = null;
  let bestD = radius;
  for (const n of nodes) {
    const d = Math.hypot(n.x - aim.x, n.y - aim.y);
    if (d <= bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/**
 * Two hands, as a zoom and a turn.
 *
 * The distance between the hands scales the model and the angle between them
 * rolls it — the pinch-to-zoom everybody already knows, done with two hands in
 * the air. Returns the CHANGE since the previous reading, so a caller can add
 * it to whatever it already had, and null whenever there are not two hands to
 * read.
 */
export class TwoHandTracker {
  private last: { gap: number; angle: number } | null = null;

  read(a: HandRead | null, b: HandRead | null): { scale: number; roll: number } | null {
    if (!a || !b) {
      this.last = null;
      return null;
    }
    const gap = Math.hypot(a.palm.x - b.palm.x, a.palm.y - b.palm.y);
    const angle = Math.atan2(b.palm.y - a.palm.y, b.palm.x - a.palm.x);
    const prev = this.last;
    this.last = { gap, angle };
    if (!prev || prev.gap < 1e-4) return { scale: 1, roll: 0 };
    let roll = angle - prev.angle;
    // Across the ±π seam the shortest way round is the one that was meant.
    if (roll > Math.PI) roll -= 2 * Math.PI;
    if (roll < -Math.PI) roll += 2 * Math.PI;
    return { scale: gap / prev.gap, roll };
  }
}
