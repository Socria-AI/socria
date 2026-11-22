// lib/ux-v0/graphics/logo/raster.ts — a mark drawn on a grid of pixels, so what a logo does at 16 px can be measured
// rather than guessed: scanline fills (even-odd, cuts subtracted), strokes by distance, ring text as a band of letters;
// binary morphology (an opening removes strokes thinner than a pixel at the target size, a closing fills gaps narrower
// than one); connected components (parts and counters); centroid and symmetry; a distance transform for stroke
// consistency; how much of the mark relies on colour alone; and an occupancy signature for comparing marks. Pure
// numbers from the geometry, deterministic, fast enough to run on every concept.

import { flatten } from '../geometry';
import type { Box, Mark, P2 } from './geom';

export interface Raster {
  n: number;
  /** 0 the ground, else the tone + 1 of the part on top */
  px: Uint8Array;
}

/** The mark drawn on an n×n grid covering a square box. */
export function rasterize(m: Mark, n: number, box: Box): Raster {
  const px = new Uint8Array(n * n);
  const size = Math.max(box.w, box.h);
  const pw = size / n;
  const ox = box.x + box.w / 2 - size / 2;
  const oy = box.y + box.h / 2 - size / 2;
  const step = Math.max(1, pw / 2);
  const fillMask = (rings: readonly P2[][]): Uint8Array => {
    const mask = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      const y = oy + (j + 0.5) * pw;
      const xs: number[] = [];
      for (const ring of rings)
        for (let k = 0; k < ring.length; k++) {
          const [x1, y1] = ring[k];
          const [x2, y2] = ring[(k + 1) % ring.length];
          if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
        }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((xs[k] - ox) / pw - 0.5));
        const i1 = Math.min(n - 1, Math.floor((xs[k + 1] - ox) / pw - 0.5));
        for (let i = i0; i <= i1; i++) mask[j * n + i] = 1;
      }
    }
    return mask;
  };
  for (const part of m.parts) {
    const tone = part.tone + 1;
    if (part.ringText) {
      // the words around the edge, as a band of letters with spaces between them
      const t = part.ringText;
      const pitch = t.size * 0.72;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = ox + (i + 0.5) * pw - t.cx;
          const y = oy + (j + 0.5) * pw - t.cy;
          const d = Math.hypot(x, y);
          if (Math.abs(d - t.r) > t.size * 0.36) continue;
          const along = (Math.atan2(y, x) + Math.PI) * t.r;
          if (along % pitch < pitch * 0.62) px[j * n + i] = tone;
        }
    }
    const f = flatten(part.path, step);
    if (part.stroke) {
      const half = part.stroke.width / 2;
      const segs: [P2, P2][] = [];
      f.rings.forEach((ring, k) => {
        for (let q = 1; q < ring.length; q++) segs.push([ring[q - 1], ring[q]]);
        if (f.closed[k] && ring.length > 2) segs.push([ring[ring.length - 1], ring[0]]);
      });
      if (!segs.length) continue;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const [a, b] of segs) {
        x0 = Math.min(x0, a[0], b[0]);
        y0 = Math.min(y0, a[1], b[1]);
        x1 = Math.max(x1, a[0], b[0]);
        y1 = Math.max(y1, a[1], b[1]);
      }
      const i0 = Math.max(0, Math.floor((x0 - half - ox) / pw));
      const i1 = Math.min(n - 1, Math.ceil((x1 + half - ox) / pw));
      const j0 = Math.max(0, Math.floor((y0 - half - oy) / pw));
      const j1 = Math.min(n - 1, Math.ceil((y1 + half - oy) / pw));
      const cut = part.cuts?.length ? fillMask(part.cuts.flatMap((c) => flatten(c, step).rings)) : null;
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          if (cut?.[j * n + i]) continue;
          const x = ox + (i + 0.5) * pw;
          const y = oy + (j + 0.5) * pw;
          for (const [a, b] of segs) {
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const L2 = dx * dx + dy * dy;
            const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0;
            if (Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t)) <= half) {
              px[j * n + i] = tone;
              break;
            }
          }
        }
      continue;
    }
    const fill = fillMask(f.rings.filter((_, k) => f.closed[k]));
    if (part.cuts?.length) {
      // each cut subtracted on its own (a cut is a region; two cuts overlapping still both cut)
      for (const c of part.cuts) {
        const cm = fillMask(flatten(c, step).rings);
        for (let q = 0; q < fill.length; q++) if (cm[q]) fill[q] = 0;
      }
    }
    for (let q = 0; q < fill.length; q++) if (fill[q]) px[q] = tone;
  }
  return { n, px };
}

export const inkOf = (r: Raster): Uint8Array => r.px.map((v) => (v ? 1 : 0));
export const countOf = (mask: Uint8Array) => mask.reduce((s, v) => s + v, 0);

const discOffsets = (r: number): P2[] => {
  const out: P2[] = [];
  const R = Math.ceil(r);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= r * r + 1e-9) out.push([dx, dy]);
  return out;
};

export function erode(mask: Uint8Array, n: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const off = discOffsets(r);
  const out = new Uint8Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      if (!mask[j * n + i]) continue;
      let keep = 1;
      for (const [dx, dy] of off) {
        const x = i + dx;
        const y = j + dy;
        if (x < 0 || y < 0 || x >= n || y >= n || !mask[y * n + x]) {
          keep = 0;
          break;
        }
      }
      out[j * n + i] = keep;
    }
  return out;
}

export function dilate(mask: Uint8Array, n: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const off = discOffsets(r);
  const out = new Uint8Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      if (!mask[j * n + i]) continue;
      for (const [dx, dy] of off) {
        const x = i + dx;
        const y = j + dy;
        if (x >= 0 && y >= 0 && x < n && y < n) out[y * n + x] = 1;
      }
    }
  return out;
}

/** How much of a mark survives at a size: strokes thinner than a pixel there are lost, gaps narrower than one fill.
 * 1 when nothing is lost. The raster's n should be several times the size. */
export function survivalAt(ink: Uint8Array, n: number, sizePx: number): { score: number; lost: number; filled: number } {
  const r = n / sizePx / 2;
  const area = Math.max(1, countOf(ink));
  const opened = dilate(erode(ink, n, r), n, r);
  const closed = erode(dilate(ink, n, r), n, r);
  let lost = 0;
  let filled = 0;
  for (let q = 0; q < ink.length; q++) {
    if (ink[q] && !opened[q]) lost++;
    if (!ink[q] && closed[q]) filled++;
  }
  return { score: Math.max(0, 1 - (lost + filled * 0.7) / area), lost: lost / area, filled: filled / area };
}

/** Connected parts of the ink, and its counters (enclosed spaces of the ground), 4-connected. */
export function components(ink: Uint8Array, n: number): { parts: number; holes: number } {
  const seen = new Uint8Array(n * n);
  let parts = 0;
  let holes = 0;
  const stack: number[] = [];
  for (let s = 0; s < n * n; s++) {
    if (seen[s]) continue;
    const v = ink[s];
    let border = false;
    let size = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const q = stack.pop()!;
      size++;
      const i = q % n;
      const j = (q - i) / n;
      if (i === 0 || j === 0 || i === n - 1 || j === n - 1) border = true;
      const next = [i > 0 ? q - 1 : -1, i < n - 1 ? q + 1 : -1, j > 0 ? q - n : -1, j < n - 1 ? q + n : -1];
      for (const t of next)
        if (t >= 0 && !seen[t] && ink[t] === v) {
          seen[t] = 1;
          stack.push(t);
        }
    }
    if (v) {
      if (size > 1) parts++;
    } else if (!border && size > 1) holes++;
  }
  return { parts, holes };
}

/** The ink averaged into a smaller grid (what a screen shows at that size), then read as ink where half covered. */
export function downsample(ink: Uint8Array, n: number, size: number): Uint8Array {
  const out = new Uint8Array(size * size);
  const k = n / size;
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      let s = 0;
      let c = 0;
      for (let y = Math.floor(j * k); y < Math.floor((j + 1) * k); y++)
        for (let x = Math.floor(i * k); x < Math.floor((i + 1) * k); x++) {
          s += ink[y * n + x];
          c++;
        }
      out[j * size + i] = c && s / c >= 0.5 ? 1 : 0;
    }
  return out;
}

/** The ink's centre of mass, 0–1 of the grid. */
export function centroid(ink: Uint8Array, n: number): P2 {
  let sx = 0;
  let sy = 0;
  let c = 0;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++)
      if (ink[j * n + i]) {
        sx += i + 0.5;
        sy += j + 0.5;
        c++;
      }
  return c ? [sx / c / n, sy / c / n] : [0.5, 0.5];
}

/** The ink's bounds on the grid, 0–1. */
export function inkBounds(ink: Uint8Array, n: number): Box {
  let x0 = n;
  let y0 = n;
  let x1 = -1;
  let y1 = -1;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++)
      if (ink[j * n + i]) {
        x0 = Math.min(x0, i);
        y0 = Math.min(y0, j);
        x1 = Math.max(x1, i);
        y1 = Math.max(y1, j);
      }
  return x1 < 0 ? { x: 0, y: 0, w: 1, h: 1 } : { x: x0 / n, y: y0 / n, w: (x1 - x0 + 1) / n, h: (y1 - y0 + 1) / n };
}

/** How alike the ink is to itself mirrored left–right, top–bottom, and turned half round (intersection over union). */
export function symmetry(ink: Uint8Array, n: number): { mirror: number; vertical: number; rotational: number } {
  const iou = (f: (i: number, j: number) => number) => {
    let both = 0;
    let any = 0;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = ink[j * n + i];
        const b = ink[f(i, j)];
        if (a && b) both++;
        if (a || b) any++;
      }
    return any ? both / any : 1;
  };
  return { mirror: iou((i, j) => j * n + (n - 1 - i)), vertical: iou((i, j) => (n - 1 - j) * n + i), rotational: iou((i, j) => (n - 1 - j) * n + (n - 1 - i)) };
}

/** How consistent the strokes are: the spread (coefficient of variation) of the ink's thickness along its ridges. */
export function strokeSpread(ink: Uint8Array, n: number): { spread: number; ridge: number } {
  const INF = 1e9;
  const d = new Float64Array(n * n);
  for (let q = 0; q < n * n; q++) d[q] = ink[q] ? INF : 0;
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= n || j >= n ? 0 : d[j * n + i]);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const q = j * n + i;
      if (!d[q]) continue;
      d[q] = Math.min(d[q], at(i - 1, j) + 3, at(i, j - 1) + 3, at(i - 1, j - 1) + 4, at(i + 1, j - 1) + 4);
    }
  for (let j = n - 1; j >= 0; j--)
    for (let i = n - 1; i >= 0; i--) {
      const q = j * n + i;
      if (!d[q]) continue;
      d[q] = Math.min(d[q], at(i + 1, j) + 3, at(i, j + 1) + 3, at(i + 1, j + 1) + 4, at(i - 1, j + 1) + 4);
    }
  const vals: number[] = [];
  for (let j = 1; j < n - 1; j++)
    for (let i = 1; i < n - 1; i++) {
      const v = d[j * n + i];
      if (v < 6) continue;
      let top = true;
      for (let dy = -1; dy <= 1 && top; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && d[(j + dy) * n + i + dx] > v) top = false;
      if (top) vals.push(v);
    }
  if (vals.length < 4) return { spread: 0, ridge: vals.length };
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  return { spread: sd / mean, ridge: vals.length };
}

/** The share of the mark's edges that are colour against colour (no ground between): what a one-colour version loses. */
export function colourReliance(r: Raster): number {
  const { n, px } = r;
  let tone = 0;
  let ground = 0;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const v = px[j * n + i];
      if (!v) continue;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const x = i + dx;
        const y = j + dy;
        if (x >= n || y >= n) continue;
        const w = px[y * n + x];
        if (!w) ground++;
        else if (w !== v) tone++;
      }
      if (i > 0 && !px[j * n + i - 1]) ground++;
      if (j > 0 && !px[(j - 1) * n + i]) ground++;
    }
  return tone + ground ? tone / (tone + ground) : 0;
}

/** The ink's occupancy in a coarse grid (each cell's share of ink), for comparing the structure of two marks. */
export function occupancy(ink: Uint8Array, n: number, g = 12): number[] {
  const b = inkBounds(ink, n);
  // the signature reads the mark within its own bounds, so the same form at another size or place reads alike
  const out = new Array(g * g).fill(0);
  const cnt = new Array(g * g).fill(0);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const u = (i / n - b.x) / b.w;
      const v = (j / n - b.y) / b.h;
      if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
      const c = Math.floor(v * g) * g + Math.floor(u * g);
      cnt[c]++;
      if (ink[j * n + i]) out[c]++;
    }
  return out.map((v, c) => (cnt[c] ? Math.round((v / cnt[c]) * 100) / 100 : 0));
}

/** How alike two occupancy signatures are, 0–1 (1 the same structure). */
export function likeness(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return 1 - d / a.length;
}
