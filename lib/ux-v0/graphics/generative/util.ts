// lib/ux-v0/graphics/generative/util.ts — the engine's small tools: a seeded random source and weighted choice, points
// and boxes in the frame's own coordinates, curves sampled as polylines, and paths written the way the document keeps
// them (path data in a 0–100 box, the node's box giving it its size).

import { hash32 } from '../styles/hash';

export type P2 = [number, number];
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── a seeded random source ──

export interface Rng {
  (): number;
  between(lo: number, hi: number): number;
  int(lo: number, hi: number): number;
  pick<T>(list: readonly T[]): T;
  chance(p: number): boolean;
  /** one key, by weight (keys with no weight never come up; all zero: the first key) */
  weighted<T extends string>(w: Partial<Record<T, number>>): T;
  /** an independent stream for one part of the work, so adding a choice elsewhere changes nothing here */
  fork(salt: string | number): Rng;
}

/** A deterministic random source (mulberry32), seeded from any words and numbers: the same seed, the same design. */
export function rng(...seed: (string | number)[]): Rng {
  let a = hash32(seed.join('|')) >>> 0 || 0x9e3779b9;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.between = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.pick = (list) => list[Math.floor(next() * list.length) % Math.max(1, list.length)];
  next.chance = (p) => next() < p;
  next.weighted = <T extends string>(w: Partial<Record<T, number>>): T => {
    const entries = (Object.entries(w) as [T, number][]).filter(([, v]) => Number.isFinite(v) && v > 0);
    if (!entries.length) return Object.keys(w)[0] as T;
    const total = entries.reduce((s, [, v]) => s + v, 0);
    let r = next() * total;
    for (const [k, v] of entries) if ((r -= v) <= 0) return k;
    return entries[entries.length - 1][0];
  };
  next.fork = (salt) => rng(...seed, 'fork', salt);
  return next;
}

// ── numbers, points, boxes ──

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const round2 = (v: number) => Math.round(v * 100) / 100;
export const dist = (a: P2, b: P2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const deg = (rad: number) => (rad * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;
export const centre = (b: Box): P2 => [b.x + b.w / 2, b.y + b.h / 2];
export const around = (cx: number, cy: number, w: number, h = w): Box => ({ x: cx - w / 2, y: cy - h / 2, w, h });
export const inset = (b: Box, d: number): Box => ({ x: b.x + d, y: b.y + d, w: Math.max(1, b.w - d * 2), h: Math.max(1, b.h - d * 2) });
export const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h);
export const overlaps = (a: Box, b: Box, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
export function intersect(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}
export function bboxOf(points: readonly P2[], pad = 0): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: x0 - pad, y: y0 - pad, w: Math.max(1, x1 - x0 + pad * 2), h: Math.max(1, y1 - y0 + pad * 2) };
}
/** A point turned about a centre, by degrees. */
export function turn(p: P2, c: P2, degrees: number): P2 {
  const a = rad(degrees);
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a)];
}

// ── curves as polylines ──

export function cubic(p0: P2, p1: P2, p2: P2, p3: P2, n = 48): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}
export function lengthOf(pts: readonly P2[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}
/** The point and the unit tangent a share t (0–1) of the way along a polyline. */
export function along(pts: readonly P2[], t: number): { p: P2; tan: P2 } {
  const total = lengthOf(pts);
  let want = clamp(t, 0, 1) * total;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (want <= d || i === pts.length - 1) {
      const k = d ? Math.min(1, want / d) : 0;
      const tx = (pts[i][0] - pts[i - 1][0]) / (d || 1);
      const ty = (pts[i][1] - pts[i - 1][1]) / (d || 1);
      return { p: [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)], tan: [tx, ty] };
    }
    want -= d;
  }
  return { p: pts[0] ?? [0, 0], tan: [1, 0] };
}
/** A polyline offset sideways (along its normals) by d. */
export function offsetLine(pts: readonly P2[], d: number): P2[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = dist(a, b) || 1;
    return [p[0] - ((b[1] - a[1]) / len) * d, p[1] + ((b[0] - a[0]) / len) * d];
  });
}

// ── paths ──

export type Seg = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number] | ['Q', number, number, number, number] | ['Z'];

export const polySegs = (pts: readonly P2[], closed = false): Seg[] => [...pts.map((p, i): Seg => [i ? 'L' : 'M', p[0], p[1]]), ...(closed ? [['Z'] as Seg] : [])];

/** A smooth curve through points (Catmull–Rom as cubic Béziers), open or closed. */
export function smoothSegs(pts: readonly P2[], closed = false, tension = 0.5): Seg[] {
  if (pts.length < 3) return polySegs(pts, closed);
  const n = pts.length;
  const at = (i: number) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  const out: Seg[] = [['M', pts[0][0], pts[0][1]]];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const k = tension / 3;
    out.push(['C', p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k, p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k, p2[0], p2[1]]);
  }
  if (closed) out.push(['Z']);
  return out;
}

const segPoints = (s: Seg): P2[] =>
  s[0] === 'Z'
    ? []
    : s[0] === 'C'
      ? [
          [s[1], s[2]],
          [s[3], s[4]],
          [s[5], s[6]],
        ]
      : s[0] === 'Q'
        ? [
            [s[1], s[2]],
            [s[3], s[4]],
          ]
        : [[s[1], s[2]]];

/** Path data in the frame's coordinates, as the program carries it. */
export const segsToD = (segs: readonly Seg[]) =>
  segs
    .map((s) =>
      s[0] === 'Z'
        ? 'Z'
        : `${s[0]}${s
            .slice(1)
            .map((v) => round2(v as number))
            .join(' ')}`,
    )
    .join(' ');

/** Path data read back (absolute commands M L H V C S Q T Z only; anything else refuses the whole path). */
export function parseD(d: string): Seg[] | null {
  if (typeof d !== 'string' || d.length > 20000 || /[^MLHVCSQTZ0-9eE.,\s+-]/.test(d)) return null;
  const toks = d.match(/[MLHVCSQTZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const out: Seg[] = [];
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastC: P2 | null = null;
  let lastQ: P2 | null = null;
  const num = () => {
    const v = Number(toks[i++]);
    return Number.isFinite(v) ? v : NaN;
  };
  while (i < toks.length) {
    if (/^[A-Z]$/i.test(toks[i])) cmd = toks[i++].toUpperCase();
    if (!cmd) return null;
    if (cmd === 'Z') {
      out.push(['Z']);
      cx = sx;
      cy = sy;
      cmd = '';
      lastC = lastQ = null;
      continue;
    }
    const need = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2 }[cmd as 'M'] ?? 0;
    if (i + need > toks.length) return null;
    const v = Array.from({ length: need }, num);
    if (v.some((n) => Number.isNaN(n))) return null;
    if (cmd === 'M') {
      out.push(['M', v[0], v[1]]);
      [cx, cy, sx, sy] = [v[0], v[1], v[0], v[1]];
      cmd = 'L';
      lastC = lastQ = null;
    } else if (cmd === 'L' || cmd === 'H' || cmd === 'V') {
      const x = cmd === 'V' ? cx : v[0];
      const y = cmd === 'H' ? cy : cmd === 'V' ? v[0] : v[1];
      out.push(['L', x, y]);
      [cx, cy] = [x, y];
      lastC = lastQ = null;
    } else if (cmd === 'C' || cmd === 'S') {
      const c1: P2 = cmd === 'C' ? [v[0], v[1]] : lastC ? [2 * cx - lastC[0], 2 * cy - lastC[1]] : [cx, cy];
      const [x2, y2, x, y] = cmd === 'C' ? [v[2], v[3], v[4], v[5]] : [v[0], v[1], v[2], v[3]];
      out.push(['C', c1[0], c1[1], x2, y2, x, y]);
      lastC = [x2, y2];
      lastQ = null;
      [cx, cy] = [x, y];
    } else {
      const q1: P2 = cmd === 'Q' ? [v[0], v[1]] : lastQ ? [2 * cx - lastQ[0], 2 * cy - lastQ[1]] : [cx, cy];
      const [x, y] = cmd === 'Q' ? [v[2], v[3]] : [v[0], v[1]];
      out.push(['Q', q1[0], q1[1], x, y]);
      lastQ = q1;
      lastC = null;
      [cx, cy] = [x, y];
    }
    if (out.length > 4000) return null;
  }
  return out.length && out[0][0] === 'M' ? out : null;
}

/** The box a path's points fill (control points included, so a curve is never cut). */
export const segsBox = (segs: readonly Seg[], pad = 0): Box => bboxOf(segs.flatMap(segPoints), pad);

/** Path data rewritten in a 0–100 box over `box` (the document's own convention for a path's shape). */
export function segsIn100(segs: readonly Seg[], box: Box): string {
  const X = (x: number) => round2(((x - box.x) / (box.w || 1)) * 100);
  const Y = (y: number) => round2(((y - box.y) / (box.h || 1)) * 100);
  return segs
    .map((s) => {
      if (s[0] === 'Z') return 'Z';
      const v = s.slice(1) as number[];
      return `${s[0]}${v.map((n, i) => (i % 2 ? Y(n) : X(n))).join(' ')}`;
    })
    .join(' ');
}

/** A closed outline around an open polyline, `w` wide (a ribbon, a brush stroke), as points. */
export function ribbonOutline(pts: readonly P2[], w: (t: number) => number): P2[] {
  const n = pts.length;
  const left: P2[] = [];
  const right: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const len = dist(a, b) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const half = w(i / Math.max(1, n - 1)) / 2;
    left.push([pts[i][0] + nx * half, pts[i][1] + ny * half]);
    right.push([pts[i][0] - nx * half, pts[i][1] - ny * half]);
  }
  return [...left, ...right.reverse()];
}

/** A smooth value-noise in one dimension (for organic wobble), deterministic per seed. */
export function noise1(seed: number) {
  const g = (i: number) => (hash32(`${seed}|${i}`) % 10000) / 5000 - 1;
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const s = f * f * (3 - 2 * f);
    return lerp(g(i), g(i + 1), s);
  };
}
