// lib/hand-pointer.ts — A HAND AS A POINTER, for all of Logos 5.
//
// AR Mode moves the Logic Map with your hands (lib/logos5/ar.ts). Everywhere
// else in Logos 5 — the Universal Map, the canvas, the chat, Artifacts,
// Content, Memory — the hand is a pointer: the views already know what to do
// with a pointer (drag, click, scroll, zoom), so the hand is turned into one
// rather than every view being taught hands.
//
//   · the cursor is where the hand aims — the index tip when pointing, the
//     pinch when pinching — smoothed, so it does not jitter;
//   · a pinch is a press: closing it presses, moving it drags, opening it
//     releases (a quick pinch is therefore a click);
//   · both hands pinching zoom, about the point between them;
//   · losing the hand cancels whatever it was pressing, so a hand leaving the
//     frame never leaves a drag stuck down.
//
// The camera's frame is not the screen. Nobody can reach the edges of the
// frame — the hand leaves the picture and is lost — so a central box of the
// frame is spread over the whole screen (CONTROL_BOX).
//
// PURE. No DOM, no camera, no clock: readings in, intents out. What an intent
// does to the page is components/logos5/HandControl.tsx.

import { TwoHandTracker, type HandRead, type Pose } from './hand-gestures';

export interface Pt {
  x: number;
  y: number;
}

/** The part of the camera's frame that is spread over the whole screen (fractions of the frame, mirrored). */
export const CONTROL_BOX = { x0: 0.14, x1: 0.86, y0: 0.1, y1: 0.78 } as const;

/** A point in the camera's frame (0…1, already mirrored) as a point on a screen of w × h. */
export function frameToScreen(p: Pt, w: number, h: number, box: { x0: number; x1: number; y0: number; y1: number } = CONTROL_BOX): Pt {
  const fx = (p.x - box.x0) / (box.x1 - box.x0);
  const fy = (p.y - box.y0) / (box.y1 - box.y0);
  return { x: Math.max(0, Math.min(1, fx)) * w, y: Math.max(0, Math.min(1, fy)) * h };
}

export type PointerIntent =
  | { kind: 'hover'; x: number; y: number }
  | { kind: 'press'; x: number; y: number }
  | { kind: 'drag'; x: number; y: number }
  | { kind: 'release'; x: number; y: number }
  /** a press that must not complete — the hand was lost, or a second hand came in */
  | { kind: 'cancel' }
  /** both hands: zoom by `scale` (> 1 is in) about (x, y) */
  | { kind: 'zoom'; x: number; y: number; scale: number };

export interface PointerStep {
  intents: PointerIntent[];
  /** where to draw the cursor, and whether it is pressing; null when no hand is seen */
  cursor: { x: number; y: number; pressed: boolean; both: boolean } | null;
  pose: Pose;
  hands: number;
}

/**
 * One hand, steadied: the aim smoothed, and a pose believed only once it has
 * lasted `settle` ms — so a hand on its way from pointing to pinching does
 * not press half-way. Unlike lib/hand-gestures.ts GestureTracker it arms
 * nothing: a pointer only presses and releases.
 */
export class HandCursor {
  private aim: Pt | null = null;
  private believed: Pose = 'none';
  private candidate: Pose = 'none';
  private since = 0;

  constructor(
    private settle = 90,
    private smoothing = 0.5
  ) {}

  reset() {
    this.aim = null;
    this.believed = 'none';
    this.candidate = 'none';
  }

  read(hand: HandRead, at: Pt, now: number): { aim: Pt; pose: Pose; pressed: boolean } {
    const k = this.smoothing;
    this.aim = this.aim ? { x: this.aim.x * k + at.x * (1 - k), y: this.aim.y * k + at.y * (1 - k) } : { ...at };
    if (hand.pose !== this.candidate) {
      this.candidate = hand.pose;
      this.since = now;
    }
    if (this.candidate !== this.believed && now - this.since >= this.settle) this.believed = this.candidate;
    return { aim: this.aim, pose: this.believed, pressed: this.believed === 'pinch' };
  }
}

/**
 * Hands, frame by frame, as pointer intents. Feed it the hands seen this frame
 * — read by lib/hand-gestures.ts readHand, mirrored, with `aim` and `palm`
 * already on the screen (frameToScreen) — and the time.
 */
export class HandPointer {
  private cursor = new HandCursor();
  private two = new TwoHandTracker();
  private pressed = false;
  private zooming = false;
  /** after two hands, the one left must open before it can press again — or letting go of one hand would press */
  private mustOpen = false;

  reset() {
    this.cursor.reset();
    this.two.reset();
    this.pressed = false;
    this.zooming = false;
    this.mustOpen = false;
  }

  /** Whether a press is under way — what a caller must cancel if it stops listening part-way. */
  get pressing() {
    return this.pressed;
  }

  step(hands: readonly HandRead[], now: number): PointerStep {
    const intents: PointerIntent[] = [];
    if (!hands.length) {
      if (this.pressed) intents.push({ kind: 'cancel' });
      this.reset();
      return { intents, cursor: null, pose: 'none', hands: 0 };
    }

    const both = hands.length >= 2 && hands.slice(0, 2).every((h) => h.pose === 'pinch' || h.pinch > 0.8);
    if (both) {
      if (this.pressed) {
        intents.push({ kind: 'cancel' });
        this.pressed = false;
      }
      const z = this.two.read(hands[0], hands[1]);
      if (z && Math.abs(z.scale - 1) > 1e-3) intents.push({ kind: 'zoom', x: z.mid.x, y: z.mid.y, scale: z.scale });
      this.zooming = true;
      this.mustOpen = true;
      const mid = z?.mid ?? { x: (hands[0].palm.x + hands[1].palm.x) / 2, y: (hands[0].palm.y + hands[1].palm.y) / 2 };
      return { intents, cursor: { x: mid.x, y: mid.y, pressed: true, both: true }, pose: 'pinch', hands: hands.length };
    }
    if (this.zooming) {
      this.two.reset();
      this.zooming = false;
    }

    const c = this.cursor.read(hands[0], hands[0].aim, now);
    if (!c.pressed) this.mustOpen = false;
    const { x, y } = c.aim;
    if (c.pressed && !this.pressed && !this.mustOpen) {
      this.pressed = true;
      intents.push({ kind: 'press', x, y });
    } else if (c.pressed && this.pressed) {
      intents.push({ kind: 'drag', x, y });
    } else if (!c.pressed && this.pressed) {
      this.pressed = false;
      intents.push({ kind: 'release', x, y });
    } else {
      intents.push({ kind: 'hover', x, y });
    }
    return { intents, cursor: { x, y, pressed: this.pressed, both: false }, pose: c.pose, hands: hands.length };
  }
}

/** How far a press may travel and still be a click rather than a drag, in screen px. */
export const CLICK_SLOP = 10;

/**
 * A two-hand zoom as the `wheel` event a trackpad pinch sends: ctrlKey set,
 * deltaY negative to zoom in. Views that zoom on a pinch zoom on this.
 */
export function zoomWheelDelta(scale: number): number {
  if (!(scale > 0) || !Number.isFinite(scale)) return 0;
  return Math.max(-120, Math.min(120, -Math.log(scale) * 240));
}
