// lib/guide/tracking.ts — KEEPING AN ARROW ON THE LID AS THE CAMERA MOVES (Socria Live AR Guidance).
//
// A frame is read by a model once per question (and briefly again to check a
// step). Between those, the overlays have to stay on their objects while a
// hand holds a phone: so the browser follows each anchored object itself, on a
// small greyscale copy of the picture (160 pixels across), by matching the
// patch the object was last seen in against the new frame in a window around
// where it was. Cheap — a few thousand comparisons per object, a dozen times a
// second — and nothing leaves the device.
//
// Each match carries a confidence. While it is high the overlay stays anchored;
// when it drops (the object left the frame, the light changed, the camera
// swung away) the overlay is not drawn on a guess: it falls back to a 2D
// annotation at the edge of the screen saying where to point the camera
// (lib/guide/session.ts placeOverlays).
//
// PURE. Works on plain arrays; the component hands in canvas pixels.

import type { Box, Pt } from './overlay';

export interface Gray {
  w: number;
  h: number;
  /** one byte per pixel, row by row */
  px: Uint8Array;
}

/** RGBA pixels (a canvas's ImageData) as luminance. */
export function toGray(rgba: ArrayLike<number>, w: number, h: number): Gray {
  const px = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < px.length; i++, j += 4) px[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return { w, h, px };
}

/** How much the picture changed between two frames, 0…1 (mean absolute difference, sampled). */
export function frameChange(a: Gray, b: Gray): number {
  if (a.w !== b.w || a.h !== b.h || !a.px.length) return 1;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.px.length; i += 3) {
    sum += Math.abs(a.px[i] - b.px[i]);
    n++;
  }
  return n ? sum / n / 255 : 0;
}

/** A box in pixels of a frame, inside it. */
function toPixels(box: Box, g: Gray) {
  const x = Math.max(0, Math.min(g.w - 2, Math.round(box.x * g.w)));
  const y = Math.max(0, Math.min(g.h - 2, Math.round(box.y * g.h)));
  const w = Math.max(2, Math.min(g.w - x, Math.round(box.w * g.w)));
  const h = Math.max(2, Math.min(g.h - y, Math.round(box.h * g.h)));
  return { x, y, w, h };
}

/** The patch's own contrast: a blank wall cannot be followed, and should not pretend to be. */
function contrast(g: Gray, x: number, y: number, w: number, h: number, step: number): number {
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let j = 0; j < h; j += step)
    for (let i = 0; i < w; i += step) {
      const v = g.px[(y + j) * g.w + x + i];
      sum += v;
      sq += v * v;
      n++;
    }
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sq / n - mean * mean));
}

export interface Track {
  box: Box;
  /** 0…1: how well the patch matched where it was found */
  confidence: number;
  /** how far it moved, in frame widths/heights */
  dx: number;
  dy: number;
}

/**
 * Where the object in `box` (as seen in `prev`) is in `next`: the best match of its patch within `radius` of
 * where it was (as a fraction of the frame width), sampled so that a large box costs no more than a small one.
 */
export function trackBox(prev: Gray, next: Gray, box: Box, radius = 0.12): Track {
  return matchPatch(prev, box, next, box, radius);
}

/** The most one pixel's difference counts for (of 255). */
const CAP = 48;

/**
 * The patch at `srcBox` in `src`, looked for in `next` within `radius` of `near` (where it was last followed to).
 *
 * WHY THE SOURCE IS NOT ALWAYS THE LAST FRAME. Matching each frame against the one before lets small errors pile up:
 * where part of the patch changes (a hand moving across it, a screen, a flame, the test pattern's turning mouth),
 * the best match each frame can sit a pixel off, and the box walks away from its object a pixel at a time. So an
 * anchor keeps the frame it was last PLACED on — by a reading of the picture or by the person's hand — and every
 * frame is matched against that patch, searched around where it was last followed to. Errors cannot accumulate;
 * when the object really changes (turned round, much nearer), the match falls, and the overlay says so instead of
 * guessing.
 */
export function matchPatch(src: Gray, srcBox: Box, next: Gray, near: Box, radius = 0.12, samples = 16): Track {
  const p = toPixels(srcBox, src);
  const q = toPixels({ x: near.x, y: near.y, w: srcBox.w, h: srcBox.h }, next);
  // sample the patch on a grid of at most ~16×16 points (more for the camera's own move, below)
  const step = Math.max(1, Math.round(Math.max(p.w, p.h) / samples));
  const r = Math.max(2, Math.round(radius * next.w));
  const flat = contrast(src, p.x, p.y, p.w, p.h, step) < 6;
  let best = Infinity;
  let bx = 0;
  let by = 0;
  // coarse to fine: every other offset first (from 0, so standing still is always tried), then the neighbours of the
  // six best — one best alone can sit in the wrong valley of a repeating texture (a label, a grille, a weave)
  const coarse: { m: number; x: number; y: number }[] = [];
  const tryAt = (ox: number, oy: number, keep = false) => {
    const nx = q.x + ox;
    const ny = q.y + oy;
    if (nx < 0 || ny < 0 || nx + p.w > next.w || ny + p.h > next.h) return;
    let sad = 0;
    let n = 0;
    for (let j = 0; j < p.h; j += step) {
      const a = (p.y + j) * src.w + p.x;
      const b = (ny + j) * next.w + nx;
      for (let i = 0; i < p.w; i += step) {
        // each pixel's difference is capped: a small part that changes a lot (a hand across it, a glint) cannot
        // outweigh the rest of the patch, which is still the object
        const d = Math.abs(src.px[a + i] - next.px[b + i]);
        sad += d > CAP ? CAP : d;
        n++;
      }
      if (sad / n > best + 40) return; // already worse than the best by a wide margin
    }
    const m = sad / n;
    if (keep) coarse.push({ m, x: ox, y: oy });
    if (m < best) {
      best = m;
      bx = ox;
      by = oy;
    }
  };
  const r2 = r - (r % 2);
  for (let oy = -r2; oy <= r2; oy += 2) for (let ox = -r2; ox <= r2; ox += 2) tryAt(ox, oy, true);
  for (const c of coarse.sort((p1, p2) => p1.m - p2.m).slice(0, 6)) for (let oy = c.y - 1; oy <= c.y + 1; oy++) for (let ox = c.x - 1; ox <= c.x + 1; ox++) tryAt(ox, oy);
  if (!Number.isFinite(best)) return { box: { ...near, w: srcBox.w, h: srcBox.h }, confidence: 0, dx: 0, dy: 0 };
  // a mean difference of 0 is a perfect match; 40 (of 255) is a poor one
  let confidence = Math.max(0, Math.min(1, 1 - best / 40));
  if (flat) confidence = Math.min(confidence, 0.3);
  const fx = (q.x + bx) / next.w;
  const fy = (q.y + by) / next.h;
  const moved: Box = {
    x: Math.max(0, Math.min(1 - srcBox.w, fx)),
    y: Math.max(0, Math.min(1 - srcBox.h, fy)),
    w: srcBox.w,
    h: srcBox.h,
  };
  return { box: moved, confidence, dx: moved.x - near.x, dy: moved.y - near.y };
}

/** An object as the browser follows it between looks. */
export interface Anchor {
  id: string;
  box: Box;
  confidence: number;
  /** when it was last matched with confidence, ms */
  seenAt: number;
  /**
   * the frame it was last placed on (by a reading or by hand) and where on it — what every frame is matched against;
   * `spread`: the patch has texture across it (a label), not just in one part (a hand on a plain lid)
   */
  ref?: { frame: Gray; box: Box; spread: boolean };
  /** how far the camera has moved since that frame, as last measured (fractions of the frame) */
  shift?: Pt;
  /** how far the object itself has been moved since that frame, beyond the camera's move */
  own?: Pt;
}

/** An anchor placed on a frame: by a reading of the picture, or by the person's hand. */
export function placeAnchor(id: string, box: Box, confidence: number, frame: Gray | null | undefined, now: number): Anchor {
  return { id, box, confidence, seenAt: now, ...(frame && frame.px.length > 1 ? { ref: { frame, box, spread: textureSpread(frame, box) } } : {}) };
}

/**
 * Is there texture across the patch — edges in at least three of its four quarters? A label, a grain, a pattern
 * has edges everywhere; a plain lid with a hand on it has edges only along the hand's outline. Only a patch with
 * texture across it is looked for on its own when it is not where the camera's move puts it: otherwise the search
 * would find the hand.
 */
export function textureSpread(g: Gray, box: Box): boolean {
  const p = toPixels(box, g);
  const hw = Math.max(1, Math.floor(p.w / 2));
  const hh = Math.max(1, Math.floor(p.h / 2));
  let textured = 0;
  for (const [qx, qy] of [[0, 0], [hw, 0], [0, hh], [hw, hh]]) {
    let edges = 0;
    let n = 0;
    for (let j = 0; j < hh; j++) {
      const y = p.y + qy + j;
      if (y + 1 >= g.h) break;
      for (let i = 0; i < hw; i++) {
        const x = p.x + qx + i;
        if (x + 1 >= g.w) break;
        const v = g.px[y * g.w + x];
        if (Math.abs(g.px[y * g.w + x + 1] - v) + Math.abs(g.px[(y + 1) * g.w + x] - v) > 20) edges++;
        n++;
      }
    }
    if (n && edges / n >= 0.2) textured++;
  }
  return textured >= 3;
}

/** Anchors are trusted above this; below it for longer than LOST_MS, an overlay falls back to the screen's edge. */
export const ANCHOR_OK = 0.55;
export const LOST_MS = 900;

/** The middle of the picture, matched as one patch to find how the camera moved. */
const MIDDLE: Box = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };

/** How well the patch at `srcBox` in `src` matches `next` at exactly `at` (0…1), on the same capped measure. */
function scoreAt(src: Gray, srcBox: Box, next: Gray, at: Pt, samples: number): number {
  const p = toPixels(srcBox, src);
  const nx = Math.round(at.x * next.w);
  const ny = Math.round(at.y * next.h);
  if (nx < 0 || ny < 0 || nx + p.w > next.w || ny + p.h > next.h) return 0;
  const step = Math.max(1, Math.round(Math.max(p.w, p.h) / samples));
  let sad = 0;
  let n = 0;
  for (let j = 0; j < p.h; j += step)
    for (let i = 0; i < p.w; i += step) {
      const d = Math.abs(src.px[(p.y + j) * src.w + p.x + i] - next.px[(ny + j) * next.w + nx + i]);
      sad += d > CAP ? CAP : d;
      n++;
    }
  return n ? Math.max(0, Math.min(1, 1 - sad / n / 40)) : 0;
}

/** The whole picture this close to the frame an anchor was placed on (mean difference, 0…1): the camera has not moved. */
export const SAME_VIEW = 0.05;
/** A new estimate of the camera's move must beat the last one by this much to replace it. */
const CAMERA_GAIN = 0.05;

/**
 * How far the camera has moved since `ref` (as fractions of the frame): the middle of the picture matched as one
 * large patch, searched near `from` (where it was last found). A hand, a flame or a turning part covers a little of
 * the middle; the table, the wall and everything still in the picture outvote it, so the estimate is the camera's
 * move and not the hand's.
 *
 * Two guards, for pictures with little that stays still (a plain wall, a screen, the test pattern's filling pie):
 * while the whole picture is still close to `ref`, the camera has not moved, whatever a search would say; and a new
 * estimate replaces the last only when it matches clearly better. A blank wall cannot be measured, and says so.
 */
export function cameraShift(ref: Gray, next: Gray, from: Pt = { x: 0, y: 0 }, radius = 0.12): { x: number; y: number; confidence: number } {
  if (frameChange(ref, next) < SAME_VIEW) return { x: 0, y: 0, confidence: 1 };
  const t = matchPatch(ref, MIDDLE, next, { ...MIDDLE, x: MIDDLE.x + from.x, y: MIDDLE.y + from.y }, radius, 32);
  const stay = scoreAt(ref, MIDDLE, next, { x: MIDDLE.x + from.x, y: MIDDLE.y + from.y }, 32);
  if (t.confidence < stay + CAMERA_GAIN) return { x: from.x, y: from.y, confidence: stay };
  return { x: t.box.x - MIDDLE.x, y: t.box.y - MIDDLE.y, confidence: t.confidence };
}

/** Below this, the camera's move could not be measured: an anchor is not moved on it. */
const CAMERA_OK = 0.45;
/** How far (pixels of the tracking frame) an anchor may be fine-tuned from where the camera's move puts it. */
const FINE_PX = 3;
/** An object found away from where the camera's move puts it is believed only on a clean match. */
const MOVED_OK = 0.7;

/**
 * Follow every anchor from one frame to the next.
 *
 * An anchor placed on a frame (by a reading or by hand) moves with the CAMERA, measured against that frame, and is
 * then fine-tuned by a few pixels against its own patch: so a hand moving over the jar cannot drag the jar's box
 * after it, and nothing piles up from frame to frame. If the object no longer matches there, it may have been moved
 * itself (picked up, slid along the table): if it has texture across it, it is looked for near where it was last
 * seen, and believed only on a clean match. Otherwise it is marked unsure rather than chased: an overlay on the
 * wrong place is worse than a note saying where to point the camera. An anchor with no frame to be placed on is matched frame to frame.
 */
export function stepAnchors(anchors: readonly Anchor[], prev: Gray, next: Gray, now: number): Anchor[] {
  // one camera estimate per frame anchors were placed on: those placed together share it
  const cams = new Map<Gray, { x: number; y: number; confidence: number }>();
  return anchors.map((a) => {
    const ref = a.ref && a.ref.frame.w === next.w && a.ref.frame.h === next.h ? a.ref : null;
    if (ref) {
      let cam = cams.get(ref.frame);
      if (!cam) {
        cam = cameraShift(ref.frame, next, a.shift);
        cams.set(ref.frame, cam);
      }
      const measured = cam.confidence >= CAMERA_OK;
      const shift = measured ? { x: cam.x, y: cam.y } : (a.shift ?? { x: 0, y: 0 });
      const own = a.own ?? { x: 0, y: 0 };
      const at: Box = { ...ref.box, x: ref.box.x + shift.x + own.x, y: ref.box.y + shift.y + own.y };
      // where the camera's move (and any move of the object's own) puts it, fine-tuned a few pixels
      const near = matchPatch(ref.frame, ref.box, next, at, FINE_PX / next.w);
      const c1 = measured ? near.confidence : Math.min(near.confidence, cam.confidence);
      if (c1 >= MOVED_OK) return { ...a, shift, box: near.box, confidence: c1, seenAt: now };
      // not cleanly there: has the object itself been moved? Looked for near where it was last seen — only an object
      // with texture across it, and believed only on a clean match better than the one where the camera puts it
      const moved = ref.spread ? matchPatch(ref.frame, ref.box, next, a.box) : null;
      if (moved && moved.confidence >= MOVED_OK && moved.confidence > c1) {
        return { ...a, shift, own: { x: moved.box.x - ref.box.x - shift.x, y: moved.box.y - ref.box.y - shift.y }, box: moved.box, confidence: moved.confidence, seenAt: now };
      }
      if (c1 >= ANCHOR_OK) return { ...a, shift, box: near.box, confidence: c1, seenAt: now };
      return { ...a, shift, confidence: c1 };
    }
    const t = trackBox(prev, next, a.box);
    // a poor match does not move the box: it stays where it was last seen, marked unsure
    if (t.confidence < ANCHOR_OK) return { ...a, confidence: t.confidence };
    return { ...a, box: t.box, confidence: t.confidence, seenAt: now };
  });
}

/** Is this anchor lost — unsure for long enough that drawing on it would be a guess? */
export function isLost(a: Anchor | undefined, now: number): boolean {
  if (!a) return true;
  return a.confidence < ANCHOR_OK && now - a.seenAt > LOST_MS;
}

/** A downscaled size for tracking, keeping the camera's aspect: 160 across. */
export function trackSize(videoW: number, videoH: number, across = 160): { w: number; h: number } {
  if (!videoW || !videoH) return { w: across, h: Math.round((across * 3) / 4) };
  return { w: across, h: Math.max(8, Math.round((across * videoH) / videoW)) };
}
