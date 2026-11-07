// lib/guide/sketch.ts — HOW SOCRIA DRAWS ON THE PICTURE: by hand, the way a friend marks up a photo.
//
// Not boxes and crosshairs. A loop drawn round the thing, that tilts a little and runs past where it began; an
// arrow that bows as a hand sweeps it, with a head of two strokes; the way round drawn as an arc of the lid seen
// from a little above; a tick when a step is done.
//
// Every wobble comes from a small random seeded by the object it belongs to, so a loop keeps its shape as the
// camera moves — it is moved and stretched with its object, never redrawn differently from one frame to the next.
//
// PURE. Strings of SVG path data from boxes and points (screen pixels).

import type { Box, Pt } from './overlay';

/** A small seeded random (mulberry32 over a string hash): the same seed draws the same wobble, every frame. */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const rot = (x: number, y: number, a: number): Pt => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });

/** A smooth curve through points (Catmull-Rom, as cubic Béziers). */
export function smooth(pts: readonly Pt[], closed = false): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${r1(pts[0].x)} ${r1(pts[0].y)} L${r1(pts[1].x)} ${r1(pts[1].y)}`;
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${r1(P[1].x)} ${r1(P[1].y)}`;
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[i + 2];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(p2.x)} ${r1(p2.y)}`;
  }
  return closed ? `${d} Z` : d;
}

/** The points of a hand-drawn loop round a box (exported for tests: it must enclose the box). */
export function loopPoints(b: Box, seed: string, pad = 10): Pt[] {
  const rnd = seeded(`${seed}:loop`);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  // an ellipse through the box's corners would be √2 its half-size; a hand goes round a little wider than that
  const rx = (b.w / 2) * 1.2 + pad;
  const ry = (b.h / 2) * 1.2 + pad;
  const tilt = (rnd() - 0.5) * 0.12;
  const start = -2.35 + (rnd() - 0.5) * 0.5; // the upper left, where a right hand starts a circle
  const sweep = Math.PI * 2 + 0.4 + rnd() * 0.25; // round, and on past where it began
  const n = 28;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = start + sweep * t;
    // the hand drifts outwards as it comes round, so the end passes the start instead of landing on it
    const drift = 1 + 0.07 * t + (rnd() - 0.5) * 0.03;
    const p = rot(Math.cos(a) * rx * drift, Math.sin(a) * ry * drift, tilt);
    pts.push({ x: cx + p.x, y: cy + p.y });
  }
  return pts;
}

/** A loop drawn round a box by hand: an ellipse that wobbles, tilts a little and runs past its start. */
export function loopPath(b: Box, seed: string, pad = 10): string {
  return smooth(loopPoints(b, seed, pad));
}

/** A head of two strokes at `tip`, pointing along (ux, uy). */
function headAt(tip: Pt, ux: number, uy: number, size: number, rnd: () => number): string {
  const spread = 0.5 + (rnd() - 0.5) * 0.14;
  const l = rot(ux, uy, Math.PI - spread);
  const r = rot(ux, uy, Math.PI + spread);
  const s2 = size * (0.86 + rnd() * 0.1);
  return `M${r1(tip.x + l.x * size)} ${r1(tip.y + l.y * size)} L${r1(tip.x)} ${r1(tip.y)} L${r1(tip.x + r.x * s2)} ${r1(tip.y + r.y * s2)}`;
}

/** A curved arrow by hand from a to b: one bowed sweep, and a head of two strokes that follows the curve. */
export function arrowPaths(a: Pt, b: Pt, seed: string, head = 15): { shaft: string; head: string; mid: Pt } {
  const rnd = seeded(`${seed}:arrow`);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bow = (0.12 + rnd() * 0.1) * len * (rnd() < 0.5 ? -1 : 1);
  const c = { x: a.x + dx / 2 + nx * bow, y: a.y + dy / 2 + ny * bow };
  const shaft = `M${r1(a.x)} ${r1(a.y)} Q${r1(c.x)} ${r1(c.y)} ${r1(b.x)} ${r1(b.y)}`;
  // the curve's last direction is from its control point to its end
  const tl = Math.hypot(b.x - c.x, b.y - c.y) || 1;
  const size = Math.min(head, len * 0.35);
  // the point halfway along a quadratic: where a word about the arrow sits
  const mid = { x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y };
  return { shaft, head: headAt(b, (b.x - c.x) / tl, (b.y - c.y) / tl, size, rnd), mid };
}

/**
 * The way round, drawn as an arc of an ellipse — a lid seen from a little above — with its head at the end.
 * Anticlockwise (as seen from above, which is how a lid is opened) runs along the front from left to right,
 * which on the screen is anticlockwise too.
 */
export function turnPaths(
  c: Pt,
  rx: number,
  ry: number,
  dir: 'ccw' | 'cw',
  seed: string,
  head = 13,
  opts: { start?: number; sweep?: number } = {}
): { arc: string; head: string; end: Pt } {
  const rnd = seeded(`${seed}:turn`);
  const sgn = dir === 'ccw' ? -1 : 1;
  // start at the front: lower left going anticlockwise, lower right going clockwise (unless told where)
  const a0 = opts.start ?? (dir === 'ccw' ? 2.55 : 0.59);
  const sweep = (opts.sweep ?? 4.2) + rnd() * 0.3;
  const n = 22;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + sgn * sweep * (i / n);
    const w = 1 + (rnd() - 0.5) * 0.04;
    pts.push({ x: c.x + Math.cos(a) * rx * w, y: c.y + Math.sin(a) * ry * w });
  }
  const end = pts[n];
  const before = pts[n - 1];
  const tl = Math.hypot(end.x - before.x, end.y - before.y) || 1;
  return { arc: smooth(pts), head: headAt(end, (end.x - before.x) / tl, (end.y - before.y) / tl, head, rnd), end };
}

/** A gentle curve from a label to its object. */
export function leaderPath(a: Pt, b: Pt, seed: string): string {
  const rnd = seeded(`${seed}:leader`);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = (0.1 + rnd() * 0.12) * len * (dx >= 0 ? 1 : -1);
  const c = { x: a.x + dx / 2 + (-dy / len) * bow, y: a.y + dy / 2 + (dx / len) * bow };
  return `M${r1(a.x)} ${r1(a.y)} Q${r1(c.x)} ${r1(c.y)} ${r1(b.x)} ${r1(b.y)}`;
}

/** A tick, in one stroke: down to the corner, then a longer sweep up. `s` is its size. */
export function tickPath(x: number, y: number, s: number): string {
  return `M${r1(x)} ${r1(y + s * 0.55)} L${r1(x + s * 0.36)} ${r1(y + s * 0.9)} Q${r1(x + s * 0.58)} ${r1(y + s * 0.42)} ${r1(x + s)} ${r1(y + s * 0.06)}`;
}

/** A short wavy underline, as a pen runs under a word. */
export function underlinePath(x: number, y: number, w: number, seed: string): string {
  const rnd = seeded(`${seed}:under`);
  const n = Math.max(3, Math.round(w / 28));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) pts.push({ x: x + (w * i) / n, y: y + (rnd() - 0.5) * 3 + (i / n) * 1.5 });
  return smooth(pts);
}

/** Where a word about a box sits: above it, left-aligned — or below when there is no room above. */
export function tagSpot(b: Box, stage: { w: number; h: number }, top = 64): { x: number; y: number; below: boolean } {
  const below = b.y - 44 < top;
  const x = Math.max(12, Math.min(stage.w - 140, b.x));
  return below ? { x, y: Math.min(stage.h - 36, b.y + b.h + 16), below } : { x, y: b.y - 16, below };
}
