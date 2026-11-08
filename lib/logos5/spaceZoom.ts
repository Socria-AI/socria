// lib/logos5/spaceZoom.ts — ZOOMING THE ONE SPACE (Logos 5.5).
//
// The canvas of a line of thinking (components/logos5/L5Space.tsx) can be seen
// smaller, to take in more of it at once, or larger. These are its rules,
// kept pure so they can be held by tests: how far it goes, one step of the
// keys, what Fit chooses, and where the view stays while the size changes.

/** How far the space zooms: down to a third (a long line, whole on one screen), up to half as large again. */
export const SPACE_ZOOM = { min: 0.35, max: 1.6, step: 1.2 } as const;

/** A zoom, kept within the range and to two places (so 1/1.2·1.2 is 1 again, and the readout is exact). */
export function clampZoom(k: number): number {
  if (!Number.isFinite(k)) return 1;
  return Math.round(Math.min(SPACE_ZOOM.max, Math.max(SPACE_ZOOM.min, k)) * 100) / 100;
}

/** One press of + (dir 1) or − (dir −1). Steps through 100% exactly when they pass it. */
export function zoomStep(k: number, dir: 1 | -1): number {
  const next = dir > 0 ? k * SPACE_ZOOM.step : k / SPACE_ZOOM.step;
  if ((k < 1 && next > 1) || (k > 1 && next < 1)) return 1;
  return clampZoom(next);
}

/** A pinch (or Ctrl and the wheel): a smooth zoom by the wheel's travel. Outward (deltaY > 0) is smaller. */
export function zoomByWheel(k: number, deltaY: number): number {
  const d = Math.max(-50, Math.min(50, deltaY));
  return clampZoom(k * Math.exp(-d * 0.01));
}

/**
 * FIT: the zoom that shows the whole space — every card — in the view above the chatbox, never larger than it is.
 * `content` is the space's size at 100%; `view` is the canvas's; `foot` is what the chatbox covers at the bottom.
 */
export function fitZoom(content: { w: number; h: number }, view: { w: number; h: number }, foot = 0): number {
  if (content.w <= 0 || content.h <= 0 || view.w <= 0 || view.h <= 0) return 1;
  const room = Math.max(80, view.h - foot - 24);
  return clampZoom(Math.min(1, view.w / content.w, room / content.h));
}

/**
 * Where the view goes when the zoom changes from `from` to `to`, so the point under `at` (a point in the view, from its
 * top left — the pointer for a pinch, the middle for the keys) stays where it is.
 */
export function anchorScroll(scroll: { left: number; top: number }, at: { x: number; y: number }, from: number, to: number): { left: number; top: number } {
  const r = to / from;
  return { left: Math.max(0, (scroll.left + at.x) * r - at.x), top: Math.max(0, (scroll.top + at.y) * r - at.y) };
}

/** The readout: "80%". */
export const zoomLabel = (k: number) => `${Math.round(k * 100)}%`;
