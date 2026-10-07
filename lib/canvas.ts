// The canvas: how a person moves around a map, and nothing else.
//
// Three things a hand can do on a map, and they change three different things:
//
//   drag the empty canvas      → the VIEWPORT   (this file: where you look from)
//   drag a card                → the LAYOUT     (lib/canvas-store.ts: where it sits)
//   edit a card or a relation  → the MODEL      (lib/map-edit.ts: what it says)
//
// None of them may reach into another. The camera here is presentational: it
// is never written into the map, never sent to a model, never shared with a
// collaborator. It is plain arithmetic so it can be tested without a browser.
//
//   screen = world · k + (x, y)

export interface Camera {
  /** screen offset of the world origin, in CSS pixels */
  x: number;
  y: number;
  /** scale: 1 is one world pixel to one screen pixel */
  k: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 3;
/** Fitting never magnifies past 1:1 — a two-card map is not blown up to fill the panel. */
export const FIT_MAX = 1;
/** A press that travels less than this is a click, not a drag (CSS px). */
export const DRAG_SLOP_MOUSE = 4;
/** Fingers wobble; a tap must survive a few pixels of it. */
export const DRAG_SLOP_TOUCH = 8;
/** Arrow keys on the canvas move it by this much. */
export const KEY_PAN = 60;
/** Arrow keys on a card move it by this much (Shift: four times). */
export const KEY_NUDGE = 16;

export const IDENTITY: Camera = { x: 0, y: 0, k: 1 };
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export const clampZoom = (k: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));

export function toWorld(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - cam.x) / cam.k, y: (sy - cam.y) / cam.k };
}

export function toScreen(cam: Camera, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * cam.k + cam.x, y: wy * cam.k + cam.y };
}

export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { x: cam.x + dx, y: cam.y + dy, k: cam.k };
}

/**
 * Zoom to `k`, keeping the world point under (px, py) exactly where it is on
 * screen — the property that makes zooming feel like moving toward something
 * rather than the map sliding away from the pointer.
 */
export function zoomAt(cam: Camera, k: number, px: number, py: number): Camera {
  const to = clampZoom(k);
  const w = toWorld(cam, px, py);
  return { x: px - w.x * to, y: py - w.y * to, k: to };
}

/** The CSS transform that puts the world under this camera. */
export function cameraTransform(cam: Camera): string {
  return `translate(${round(cam.x)}px, ${round(cam.y)}px) scale(${Math.round(cam.k * 10000) / 10000})`;
}

const round = (v: number) => Math.round(v * 100) / 100;

export function sameCamera(a: Camera, b: Camera, eps = 0.5): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.k - b.k) < 0.001;
}

// ── what a wheel event means ─────────────────────────────────────────

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  /** 0 pixels, 1 lines, 2 pages */
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export type WheelIntent = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number };

/**
 * A wheel event is three different gestures wearing one event type.
 *
 *   trackpad pinch       ctrlKey is set by the browser          → zoom, finely
 *   mouse wheel notch    lines, or a large whole-number delta   → zoom, a step
 *   trackpad two-finger  small fractional deltas, often sideways → pan
 *
 * Shift with a mouse wheel pans sideways, as it does everywhere else.
 */
export function readWheel(e: WheelLike): WheelIntent {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  const dx = e.deltaX * unit;
  const dy = e.deltaY * unit;
  if (e.ctrlKey || e.metaKey) {
    // A pinch sends many small deltas; each is a small, proportional step.
    const f = Math.exp(-clamp(dy, -60, 60) * 0.012);
    return { kind: 'zoom', factor: f };
  }
  const notch = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));
  if (e.shiftKey) return { kind: 'pan', dx: -(dx || dy), dy: 0 };
  if (notch) return { kind: 'zoom', factor: Math.exp(-clamp(dy, -240, 240) * 0.0018) };
  return { kind: 'pan', dx: -dx, dy: -dy };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── two fingers ──────────────────────────────────────────────────────

export interface Pt {
  x: number;
  y: number;
}

/**
 * Two-finger pinch and pan in one: the world point that was under the
 * fingers' midpoint at the start stays under their midpoint now, scaled by
 * how far apart they have moved. Computed from the gesture's START every
 * time, never accumulated frame to frame, so it cannot drift.
 */
export function pinchCamera(start: Camera, a0: Pt, b0: Pt, a1: Pt, b1: Pt): Camera {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1;
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y) || 1;
  const k = clampZoom(start.k * (d1 / d0));
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const w = toWorld(start, m0.x, m0.y);
  return { x: m1.x - w.x * k, y: m1.y - w.y * k, k };
}

// ── fitting ──────────────────────────────────────────────────────────

export function boundsOf(rects: Iterable<Rect>): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * The camera that shows all of `content` inside a `vw × vh` viewport, less
 * whatever the insets cover (tabs on a side, a control strip), with `pad`
 * of air around it. Never magnifies past `maxK`; never shrinks past `minK` —
 * below that the content is centred (or aligned to its start) instead, so a
 * very large map is shown legibly from somewhere sensible rather than as a
 * grey smudge.
 */
export function fitCamera(
  content: Rect,
  vw: number,
  vh: number,
  opts: { pad?: number; insets?: Insets; maxK?: number; minK?: number; align?: 'center' | 'start' } = {}
): Camera {
  const pad = opts.pad ?? 40;
  const ins = opts.insets ?? NO_INSETS;
  const maxK = opts.maxK ?? FIT_MAX;
  const minK = opts.minK ?? ZOOM_MIN;
  const aw = Math.max(40, vw - ins.left - ins.right - pad * 2);
  const ah = Math.max(40, vh - ins.top - ins.bottom - pad * 2);
  const raw = Math.min(aw / Math.max(1, content.w), ah / Math.max(1, content.h));
  const k = clampZoom(Math.min(maxK, Math.max(minK, raw)));
  const cx = ins.left + pad + aw / 2;
  const cy = ins.top + pad + ah / 2;
  const fits = content.w * k <= aw + 0.5 && content.h * k <= ah + 0.5;
  if (fits || opts.align !== 'start') {
    return {
      x: cx - (content.x + content.w / 2) * k,
      // too tall to fit even at the floor: start at the top, not the middle
      y: !fits && content.h * k > ah ? ins.top + pad - content.y * k : cy - (content.y + content.h / 2) * k,
      k,
    };
  }
  // reading order: the top of the content, centred across if it fits across
  const x = content.w * k <= aw ? cx - (content.x + content.w / 2) * k : ins.left + pad - content.x * k;
  return { x, y: ins.top + pad - content.y * k, k };
}

/** How much of `content` the camera leaves on screen, 0 to 1. */
export function visibleShare(cam: Camera, content: Rect, vw: number, vh: number): number {
  const a = toScreen(cam, content.x, content.y);
  const w = content.w * cam.k;
  const h = content.h * cam.k;
  const ix = Math.max(0, Math.min(vw, a.x + w) - Math.max(0, a.x));
  const iy = Math.max(0, Math.min(vh, a.y + h) - Math.max(0, a.y));
  const area = Math.max(1, w * h);
  return Math.min(1, (ix * iy) / area);
}

/**
 * The camera may wander, but never so far that the map is lost: at least
 * `keep` pixels of the content stay on screen on each axis. Applied after
 * every pan and zoom, so "where did it go?" never happens.
 */
export function keepInView(cam: Camera, content: Rect | null, vw: number, vh: number, keep = 80): Camera {
  if (!content) return cam;
  const left = content.x * cam.k + cam.x;
  const right = left + content.w * cam.k;
  const top = content.y * cam.k + cam.y;
  const bottom = top + content.h * cam.k;
  const kx = Math.min(keep, (right - left) / 2, vw / 2);
  const ky = Math.min(keep, (bottom - top) / 2, vh / 2);
  let { x, y } = cam;
  if (right < kx) x += kx - right;
  if (left > vw - kx) x -= left - (vw - kx);
  if (bottom < ky) y += ky - bottom;
  if (top > vh - ky) y -= top - (vh - ky);
  return { x, y, k: cam.k };
}

/** One frame of an eased move toward `to`; returns the target once close enough. */
export function easeCamera(from: Camera, to: Camera, t = 0.18): Camera {
  const next = {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    k: from.k + (to.k - from.k) * t,
  };
  return sameCamera(next, to, 0.4) ? to : next;
}

// ── which gesture a press becomes ────────────────────────────────────

export type PressTarget = { kind: 'canvas' } | { kind: 'node'; id: string } | { kind: 'control' };

/** Past the slop a press is a drag, and a drag is never also a click. */
export function isDrag(dx: number, dy: number, pointerType: string): boolean {
  const slop = pointerType === 'mouse' ? DRAG_SLOP_MOUSE : DRAG_SLOP_TOUCH;
  return Math.hypot(dx, dy) >= slop;
}

/**
 * Card edge to card edge, as a soft curve, leaving each card from the side
 * that faces the other. Used for any connection whose card the person has
 * moved by hand — the lens's own routing assumed the card was where the lens
 * put it, and is no longer true.
 */
export function routeBetween(a: Rect, b: Rect): { d: string; mx: number; my: number } {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  const dx = bcx - acx;
  const dy = bcy - acy;
  const horizontal = Math.abs(dx) * (a.h + b.h) > Math.abs(dy) * (a.w + b.w);
  let sx: number, sy: number, ex: number, ey: number, c1x: number, c1y: number, c2x: number, c2y: number;
  if (horizontal) {
    const dir = dx >= 0 ? 1 : -1;
    sx = acx + (dir * a.w) / 2;
    sy = acy;
    ex = bcx - (dir * b.w) / 2;
    ey = bcy;
    const bend = Math.max(24, Math.abs(ex - sx) / 2);
    c1x = sx + dir * bend;
    c1y = sy;
    c2x = ex - dir * bend;
    c2y = ey;
  } else {
    const dir = dy >= 0 ? 1 : -1;
    sx = acx;
    sy = acy + (dir * a.h) / 2;
    ex = bcx;
    ey = bcy - (dir * b.h) / 2;
    const bend = Math.max(20, Math.abs(ey - sy) / 2);
    c1x = sx;
    c1y = sy + dir * bend;
    c2x = ex;
    c2y = ey - dir * bend;
  }
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    d: `M ${r(sx)} ${r(sy)} C ${r(c1x)} ${r(c1y)} ${r(c2x)} ${r(c2y)} ${r(ex)} ${r(ey)}`,
    mx: r((sx + ex) / 2 + (c1x + c2x - sx - ex) * 0.375),
    my: r((sy + ey) / 2 + (c1y + c2y - sy - ey) * 0.375),
  };
}

/** A small deterministic hash, so a card's first position is the same on every load. */
export function hashUnit(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
