// lib/ux-v0/graphics/patterns.ts — procedural patterns: generators with parameters, never pictures.
//
// A pattern object stores a generator's kind, its parameters (a seed among them) and its inks. Drawing it runs the
// generator, which is plain deterministic code (no model, no evaluated text): the same parameters always give the same
// marks, so a pattern can be saved, reopened, edited and exported without drift, and "another one" is a new seed. The
// marks are merged by ink and stroke into a handful of <path> elements however many there are, kept within a budget
// (MAX_MARKS), and cached by their parameters, so a dense field stays light to draw and quick to redraw.
//
// Every generator shares the same controls: a seed, rotation, jitter (randomness of position), size variation, colour
// variation (how often the other inks are used), a ramp (denser or larger toward an edge, the centre or the edges)
// and an edge fade; each adds its own (spacing, weight, counts, curves). A pattern draws within its box, clipped to it,
// to an ellipse, or to one of the geometry primitives' outlines (its boundary).

import { noise2, rng, type P2, type ParamSpec } from './geometry';

export type PatternCategory = 'grid' | 'radial' | 'organic' | 'technical' | 'generative';
export interface PatternLabel {
  x: number;
  y: number;
  text: string;
  size: number;
  ink: number;
  anchor?: 'start' | 'middle' | 'end';
}
export interface PatternOut {
  /** merged marks: one entry per ink and stroke width (absent: filled) */
  paths: { d: string; ink: number; stroke?: number }[];
  labels: PatternLabel[];
  /** how many marks were drawn */
  count: number;
  /** the budget stopped the generator early */
  capped: boolean;
  /** the frame the marks are in (larger than the box when rotated) and its rotation about the box centre */
  frame: { x: number; y: number; w: number; h: number; rotation: number };
}
interface Ctx {
  w: number;
  h: number;
  p: Record<string, number>;
  rnd: () => number;
  noise: (x: number, y: number) => number;
  /** one mark: path data, an ink, a stroke width (absent: filled) */
  mark(d: string, ink?: number, stroke?: number): void;
  label(l: PatternLabel): void;
  /** the ink for a mark, by the colour variation */
  ink(): number;
  /** the ramp and edge fade at a point of the frame (0–1): how much of the pattern is there */
  amount(x: number, y: number): number;
  /** the size variation for a mark (a multiplier) */
  vary(): number;
  /** the jitter for a mark (an offset in px, at most `scale`/2) */
  jit(scale: number): P2;
  full(): boolean;
  inks: number;
}
export interface PatternSpec {
  kind: string;
  label: string;
  category: PatternCategory;
  keywords: string[];
  params: ParamSpec[];
  build(c: Ctx): void;
  says: string;
}

export const MAX_MARKS = 6000;
const P = (key: string, label: string, min: number, max: number, def: number, step = 1): ParamSpec => ({ key, label, min, max, step, def });
const n1 = (v: number) => (Math.round(v * 10) / 10).toString();
const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The controls every generator has (after its own). */
export const COMMON_PARAMS: readonly ParamSpec[] = [
  P('seed', 'Seed', 1, 9999, 7),
  P('rotation', 'Rotation', -180, 180, 0),
  P('jitter', 'Randomness', 0, 100, 0),
  P('variation', 'Size variation', 0, 100, 0),
  P('colorVar', 'Colour variation', 0, 100, 0),
  P('ramp', 'Ramp (− sparser, + denser)', -100, 100, 0),
  P('rampDir', 'Ramp toward (bottom, top, right, left, centre, edges)', 0, 5, 0),
  P('edge', 'Edge fade', 0, 100, 0),
];

// ── path pieces ──
const circleD = (x: number, y: number, r: number) => `M${n1(x - r)} ${n1(y)}a${n1(r)} ${n1(r)} 0 1 0 ${n1(2 * r)} 0a${n1(r)} ${n1(r)} 0 1 0 ${n1(-2 * r)} 0`;
const rectD = (x: number, y: number, w: number, h: number) => `M${n1(x)} ${n1(y)}h${n1(w)}v${n1(h)}h${n1(-w)}z`;
const polyD = (pts: readonly P2[], closed = true) => `M${pts.map(([x, y]) => `${n1(x)} ${n1(y)}`).join('L')}${closed ? 'z' : ''}`;
const lineD = (a: P2, b: P2) => `M${n1(a[0])} ${n1(a[1])}L${n1(b[0])} ${n1(b[1])}`;
const ngon = (x: number, y: number, r: number, sides: number, rot = -Math.PI / 2, inner?: number): P2[] => {
  const pts: P2[] = [];
  const n = inner ? sides * 2 : sides;
  for (let i = 0; i < n; i++) {
    const a = rot + (i * TAU) / n;
    const k = inner && i % 2 ? inner : 1;
    pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]);
  }
  return pts;
};
const arcD = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return `M${n1(cx + Math.cos(a0) * r)} ${n1(cy + Math.sin(a0) * r)}A${n1(r)} ${n1(r)} 0 ${large} ${a1 > a0 ? 1 : 0} ${n1(cx + Math.cos(a1) * r)} ${n1(cy + Math.sin(a1) * r)}`;
};
const sectorD = (cx: number, cy: number, r: number, a0: number, a1: number) => `M${n1(cx)} ${n1(cy)}L${n1(cx + Math.cos(a0) * r)} ${n1(cy + Math.sin(a0) * r)}A${n1(r)} ${n1(r)} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} 1 ${n1(cx + Math.cos(a1) * r)} ${n1(cy + Math.sin(a1) * r)}z`;

/** n positions from a to b whose density follows f (t: 0 at a, 1 at b). */
export function spread(n: number, a: number, b: number, f: (t: number) => number): number[] {
  if (n <= 0) return [];
  const K = 256;
  const cdf = [0];
  for (let i = 1; i <= K; i++) cdf.push(cdf[i - 1] + Math.max(0.04, f((i - 0.5) / K)));
  const total = cdf[K];
  const out: number[] = [];
  let i = 1;
  for (let j = 0; j < n; j++) {
    const target = ((j + 0.5) / n) * total;
    while (i < K && cdf[i] < target) i++;
    const t = (i - 1 + (target - cdf[i - 1]) / Math.max(1e-9, cdf[i] - cdf[i - 1])) / K;
    out.push(a + t * (b - a));
  }
  return out;
}

/** Points no closer than r (Bridson's Poisson-disc sampling), seeded, within w × h. */
function poisson(w: number, h: number, r: number, rnd: () => number, cap: number): P2[] {
  const cell = r / Math.SQRT2;
  const gw = Math.ceil(w / cell);
  const gh = Math.ceil(h / cell);
  if (gw * gh > 400_000) return [];
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts: P2[] = [];
  const active: number[] = [];
  const put = (p: P2) => {
    pts.push(p);
    active.push(pts.length - 1);
    grid[Math.floor(p[1] / cell) * gw + Math.floor(p[0] / cell)] = pts.length - 1;
  };
  put([rnd() * w, rnd() * h]);
  while (active.length && pts.length < cap) {
    const ai = Math.floor(rnd() * active.length);
    const base = pts[active[ai]];
    let found = false;
    for (let k = 0; k < 18; k++) {
      const a = rnd() * TAU;
      const d = r * (1 + rnd());
      const q: P2 = [base[0] + Math.cos(a) * d, base[1] + Math.sin(a) * d];
      if (q[0] < 0 || q[1] < 0 || q[0] >= w || q[1] >= h) continue;
      const gx = Math.floor(q[0] / cell);
      const gy = Math.floor(q[1] / cell);
      let ok = true;
      for (let y = Math.max(0, gy - 2); y <= Math.min(gh - 1, gy + 2) && ok; y++)
        for (let x = Math.max(0, gx - 2); x <= Math.min(gw - 1, gx + 2); x++) {
          const idx = grid[y * gw + x];
          if (idx >= 0 && Math.hypot(pts[idx][0] - q[0], pts[idx][1] - q[1]) < r) {
            ok = false;
            break;
          }
        }
      if (ok) {
        put(q);
        found = true;
        break;
      }
    }
    if (!found) active.splice(ai, 1);
  }
  return pts;
}

/** Line segments joined end to end into polylines (contours come out of marching squares as loose segments). */
function chain(segs: readonly [P2, P2][]): P2[][] {
  const key = (p: P2) => `${Math.round(p[0] * 4)},${Math.round(p[1] * 4)}`;
  const ends = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of s) {
      const k = key(p);
      const l = ends.get(k);
      if (l) l.push(i);
      else ends.set(k, [i]);
    }
  });
  const used = new Uint8Array(segs.length);
  const out: P2[][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line: P2[] = [segs[i][0], segs[i][1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const tip = dir ? line[line.length - 1] : line[0];
        const next = (ends.get(key(tip)) ?? []).find((j) => !used[j]);
        if (next === undefined) break;
        used[next] = 1;
        const s = segs[next];
        const far = key(s[0]) === key(tip) ? s[1] : s[0];
        if (dir) line.push(far);
        else line.unshift(far);
      }
    }
    out.push(line);
  }
  return out;
}

const fieldAt = (c: Ctx, x: number, y: number, f: number) => c.noise(x * f, y * f) * 0.65 + c.noise(x * f * 2.1 + 17, y * f * 2.1 - 9) * 0.35;

export const PATTERNS: readonly PatternSpec[] = [
  {
    kind: 'dots',
    label: 'Dot grid',
    category: 'grid',
    keywords: ['dots', 'dot grid', 'polka', 'spots', 'dotted'],
    params: [P('scale', 'Spacing', 4, 240, 24), P('size', 'Dot size %', 5, 100, 36), P('stagger', 'Offset rows', 0, 1, 1), P('shape', 'Shape (circle, square, diamond)', 0, 2, 0)],
    says: 'a grid of dots',
    build(c) {
      const s = c.p.scale;
      let row = 0;
      for (let y = s / 2; y < c.h + s; y += c.p.stagger ? s * 0.866 : s, row++)
        for (let x = (c.p.stagger && row % 2 ? s : s / 2); x < c.w + s; x += s) {
          if (c.full()) return;
          const a = c.amount(x, y);
          if (a <= 0.02) continue;
          const [jx, jy] = c.jit(s);
          const r = (s * c.p.size) / 200 * c.vary() * (0.25 + 0.75 * a);
          const px = x + jx;
          const py = y + jy;
          if (c.p.shape === 1) c.mark(rectD(px - r, py - r, r * 2, r * 2), c.ink());
          else if (c.p.shape === 2) c.mark(polyD([[px, py - r * 1.25], [px + r * 1.25, py], [px, py + r * 1.25], [px - r * 1.25, py]]), c.ink());
          else c.mark(circleD(px, py, r), c.ink());
        }
    },
  },
  {
    kind: 'halftone',
    label: 'Halftone field',
    category: 'grid',
    keywords: ['halftone', 'newsprint', 'screen', 'ben-day', 'dot gradient', 'comic dots'],
    params: [P('scale', 'Screen', 4, 120, 14), P('field', 'Field (linear, radial, noise)', 0, 2, 0), P('angle', 'Gradient angle', -180, 180, 90), P('max', 'Largest dot %', 20, 140, 100)],
    says: 'a halftone screen whose dots swell across the field',
    build(c) {
      const s = c.p.scale;
      const ang = (c.p.angle * Math.PI) / 180;
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
      const half = (Math.abs(ux) * c.w + Math.abs(uy) * c.h) / 2;
      for (let y = s / 2; y < c.h + s; y += s)
        for (let x = s / 2; x < c.w + s; x += s) {
          if (c.full()) return;
          let t: number;
          if (c.p.field === 1) t = 1 - Math.min(1, Math.hypot(x - c.w / 2, y - c.h / 2) / (Math.hypot(c.w, c.h) / 2));
          else if (c.p.field === 2) t = clamp(0.5 + fieldAt(c, x, y, 1 / (s * 9)) * 0.9, 0, 1);
          else t = clamp(((x - c.w / 2) * ux + (y - c.h / 2) * uy) / (half * 2) + 0.5, 0, 1);
          const r = (s / 2) * (c.p.max / 100) * t * c.amount(x, y) * c.vary();
          if (r < 0.25) continue;
          const [jx, jy] = c.jit(s);
          c.mark(circleD(x + jx, y + jy, r), c.ink());
        }
    },
  },
  {
    kind: 'lines',
    label: 'Line field',
    category: 'grid',
    keywords: ['lines', 'line field', 'parallel lines', 'hatching', 'pinstripe', 'rules'],
    params: [P('scale', 'Spacing', 2, 200, 12), P('weight', 'Weight', 0.25, 40, 1.5, 0.25), P('dash', 'Dash length (0 solid)', 0, 200, 0)],
    says: 'parallel lines',
    build(c) {
      const n = Math.max(1, Math.round(c.h / c.p.scale));
      const ys = spread(n, 0, c.h, (t) => c.amount(c.w / 2, t * c.h));
      for (const y0 of ys) {
        if (c.full()) return;
        const [, jy] = c.jit(c.p.scale);
        const y = y0 + jy;
        const wgt = Math.max(0.1, c.p.weight * c.vary());
        if (!c.p.dash) {
          c.mark(lineD([0, y], [c.w, y]), c.ink(), wgt);
          continue;
        }
        const ink = c.ink();
        let d = '';
        for (let x = (c.rnd() - 1) * c.p.dash * 2; x < c.w; x += c.p.dash * 2) d += lineD([Math.max(0, x), y], [Math.min(c.w, x + c.p.dash), y]);
        c.mark(d, ink, wgt);
      }
    },
  },
  {
    kind: 'grid',
    label: 'Line grid',
    category: 'grid',
    keywords: ['grid', 'graph paper', 'square grid', 'lattice', 'modular grid'],
    params: [P('scale', 'Cell', 4, 400, 32), P('weight', 'Weight', 0.25, 20, 1, 0.25), P('major', 'Major line every', 0, 20, 4), P('majorWeight', 'Major weight', 0.25, 30, 2.5, 0.25)],
    says: 'a square grid',
    build(c) {
      const s = c.p.scale;
      for (let i = 0, x = 0; x <= c.w + 0.5; x += s, i++) {
        if (c.full()) return;
        const major = c.p.major > 0 && i % c.p.major === 0;
        c.mark(lineD([x, 0], [x, c.h]), major ? 0 : c.ink(), major ? c.p.majorWeight : c.p.weight);
      }
      for (let i = 0, y = 0; y <= c.h + 0.5; y += s, i++) {
        if (c.full()) return;
        const major = c.p.major > 0 && i % c.p.major === 0;
        c.mark(lineD([0, y], [c.w, y]), major ? 0 : c.ink(), major ? c.p.majorWeight : c.p.weight);
      }
    },
  },
  {
    kind: 'checker',
    label: 'Checkerboard',
    category: 'grid',
    keywords: ['checkerboard', 'checker', 'chequered', 'chess', 'racing flag'],
    params: [P('scale', 'Square', 4, 400, 40)],
    says: 'a checkerboard',
    build(c) {
      const s = c.p.scale;
      for (let j = 0, y = 0; y < c.h; y += s, j++)
        for (let i = 0, x = 0; x < c.w; x += s, i++) {
          if (c.full()) return;
          if ((i + j) % 2) continue;
          if (c.amount(x + s / 2, y + s / 2) < c.rnd()) continue;
          c.mark(rectD(x, y, s, s), c.inks > 1 && c.rnd() < c.p.colorVar / 100 ? 1 : 0);
        }
    },
  },
  {
    kind: 'stripes',
    label: 'Stripes',
    category: 'grid',
    keywords: ['stripes', 'bands', 'striped', 'awning', 'bars'],
    params: [P('scale', 'Period', 4, 600, 48), P('ratio', 'Band width %', 5, 95, 50)],
    says: 'bands of colour',
    build(c) {
      const n = Math.max(1, Math.round(c.h / c.p.scale));
      const ys = spread(n, 0, c.h, (t) => c.amount(c.w / 2, t * c.h));
      for (let i = 0; i < ys.length; i++) {
        if (c.full()) return;
        const gap = i < ys.length - 1 ? ys[i + 1] - ys[i] : c.p.scale;
        const bw = gap * (c.p.ratio / 100) * c.vary();
        c.mark(rectD(0, ys[i] - bw / 2, c.w, bw), c.ink());
      }
    },
  },
  {
    kind: 'diagonal',
    label: 'Diagonal stripes',
    category: 'grid',
    keywords: ['diagonal stripes', 'hazard', 'candy stripe', 'barber', 'slanted lines'],
    params: [P('scale', 'Period', 4, 400, 28), P('ratio', 'Band width %', 5, 95, 35)],
    says: 'diagonal bands',
    build(c) {
      PATTERN_BY_KIND.get('stripes')!.build(c);
    },
  },
  {
    kind: 'radial',
    label: 'Radial lines',
    category: 'radial',
    keywords: ['radial lines', 'rays', 'sunburst', 'starburst', 'radiating', 'explosion', 'speed lines'],
    params: [P('count', 'Rays', 4, 720, 96), P('inner', 'Inner radius %', 0, 95, 12), P('cx', 'Centre x %', -50, 150, 50), P('cy', 'Centre y %', -50, 150, 50), P('weight', 'Weight', 0.25, 30, 1.5, 0.25), P('taper', 'Wedges', 0, 1, 0), P('lengthVar', 'Length variation', 0, 100, 0)],
    says: 'lines radiating from a centre',
    build(c) {
      const cx = (c.p.cx / 100) * c.w;
      const cy = (c.p.cy / 100) * c.h;
      const R = Math.hypot(Math.max(cx, c.w - cx), Math.max(cy, c.h - cy)) + 2;
      const r0 = R * (c.p.inner / 100);
      const n = Math.round(c.p.count);
      for (let i = 0; i < n; i++) {
        if (c.full()) return;
        const a = (i / n) * TAU + ((c.rnd() - 0.5) * c.p.jitter * TAU) / (n * 100);
        const len = R * (1 - (c.p.lengthVar / 100) * c.rnd());
        const mid: P2 = [cx + Math.cos(a) * (r0 + len) * 0.5, cy + Math.sin(a) * (r0 + len) * 0.5];
        if (c.amount(mid[0], mid[1]) < c.rnd()) continue;
        if (c.p.taper) {
          const da = (TAU / n) * 0.5 * c.vary();
          c.mark(polyD([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a - da / 2) * len, cy + Math.sin(a - da / 2) * len], [cx + Math.cos(a + da / 2) * len, cy + Math.sin(a + da / 2) * len]]), c.ink());
        } else c.mark(lineD([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * len, cy + Math.sin(a) * len]), c.ink(), Math.max(0.1, c.p.weight * c.vary()));
      }
    },
  },
  {
    kind: 'concentric',
    label: 'Concentric rings',
    category: 'radial',
    keywords: ['concentric', 'rings', 'target', 'ripples', 'sonar', 'moire', 'circles'],
    params: [P('scale', 'Spacing', 2, 300, 18), P('weight', 'Weight', 0.25, 40, 2, 0.25), P('sides', 'Sides (0 circle)', 0, 12, 0), P('cx', 'Centre x %', -50, 150, 50), P('cy', 'Centre y %', -50, 150, 50), P('twin', 'Second centre (moiré) %', 0, 50, 0)],
    says: 'rings around a centre',
    build(c) {
      const centres: P2[] = [[(c.p.cx / 100) * c.w, (c.p.cy / 100) * c.h]];
      if (c.p.twin > 0) centres.push([centres[0][0] + (c.p.twin / 100) * c.w, centres[0][1]]);
      for (const [cx, cy] of centres) {
        const R = Math.hypot(Math.max(cx, c.w - cx), Math.max(cy, c.h - cy));
        const n = Math.max(1, Math.round(R / c.p.scale));
        const rs = spread(n, c.p.scale / 2, R, (t) => c.amount(cx, cy + t * R * 0.999));
        for (const r of rs) {
          if (c.full()) return;
          const wgt = Math.max(0.1, c.p.weight * c.vary());
          if (c.p.sides >= 3) c.mark(polyD(ngon(cx, cy, r, c.p.sides)), c.ink(), wgt);
          else c.mark(circleD(cx, cy, r), c.ink(), wgt);
        }
      }
    },
  },
  {
    kind: 'symbols',
    label: 'Symbol grid',
    category: 'grid',
    keywords: ['symbols', 'plus signs', 'crosses', 'icons pattern', 'marks', 'confetti', 'memphis'],
    params: [P('scale', 'Spacing', 6, 300, 40), P('size', 'Size %', 10, 100, 40), P('shape', 'Shape (plus, cross, circle, ring, triangle, square, star, mixed)', 0, 7, 0), P('spin', 'Random turn', 0, 100, 0), P('weight', 'Line weight', 0.5, 20, 2, 0.5)],
    says: 'a grid of symbols',
    build(c) {
      const s = c.p.scale;
      for (let y = s / 2; y < c.h + s / 2; y += s)
        for (let x = s / 2; x < c.w + s / 2; x += s) {
          if (c.full()) return;
          if (c.amount(x, y) < c.rnd()) continue;
          const [jx, jy] = c.jit(s);
          const px = x + jx;
          const py = y + jy;
          const r = (s * c.p.size) / 200 * c.vary();
          const shape = c.p.shape === 7 ? Math.floor(c.rnd() * 7) : c.p.shape;
          const turn = (c.rnd() - 0.5) * (c.p.spin / 100) * TAU;
          const rot = (pts: P2[]) => pts.map(([qx, qy]): P2 => [px + (qx - px) * Math.cos(turn) - (qy - py) * Math.sin(turn), py + (qx - px) * Math.sin(turn) + (qy - py) * Math.cos(turn)]);
          const ink = c.ink();
          if (shape === 0 || shape === 1) {
            const k = shape === 1 ? Math.PI / 4 : 0;
            const a1 = turn + k;
            c.mark(lineD([px - Math.cos(a1) * r, py - Math.sin(a1) * r], [px + Math.cos(a1) * r, py + Math.sin(a1) * r]) + lineD([px + Math.sin(a1) * r, py - Math.cos(a1) * r], [px - Math.sin(a1) * r, py + Math.cos(a1) * r]), ink, c.p.weight);
          } else if (shape === 2) c.mark(circleD(px, py, r), ink);
          else if (shape === 3) c.mark(circleD(px, py, r), ink, c.p.weight);
          else if (shape === 4) c.mark(polyD(rot(ngon(px, py, r, 3))), ink);
          else if (shape === 5) c.mark(polyD(rot(ngon(px, py, r * 1.2, 4, Math.PI / 4))), ink);
          else c.mark(polyD(rot(ngon(px, py, r, 5, -Math.PI / 2, 0.45))), ink);
        }
    },
  },
  {
    kind: 'tessellation',
    label: 'Tessellation',
    category: 'grid',
    keywords: ['tessellation', 'tiles', 'hexagons', 'triangles', 'mosaic', 'honeycomb', 'cubes', 'geometric motif'],
    params: [P('scale', 'Tile', 6, 400, 48), P('tile', 'Tile (triangle, hexagon, cube, brick)', 0, 3, 1), P('gap', 'Gap %', 0, 60, 8)],
    says: 'a tiling of geometric tiles',
    build(c) {
      const s = c.p.scale;
      const k = 1 - c.p.gap / 100;
      const shrink = (pts: P2[]): P2[] => {
        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
        const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
      };
      const put = (pts: P2[], ink: number) => {
        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
        const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        if (c.amount(cx, cy) < c.rnd()) return;
        c.mark(polyD(shrink(pts)), ink);
      };
      if (c.p.tile === 0) {
        const hh = s * 0.866;
        for (let j = 0, y = 0; y < c.h + hh; y += hh, j++)
          for (let i = -1, x = -s; x < c.w + s; x += s / 2, i++) {
            if (c.full()) return;
            const up = (i + j) % 2 === 0;
            put(up ? [[x, y + hh], [x + s / 2, y], [x + s, y + hh]] : [[x, y], [x + s, y], [x + s / 2, y + hh]], up ? c.ink() : c.inks > 1 && c.p.colorVar === 0 ? 1 % c.inks : c.ink());
          }
      } else if (c.p.tile === 1) {
        const r = s / 2;
        const hw = r * Math.sqrt(3);
        for (let j = 0, y = 0; y < c.h + r * 2; y += r * 1.5, j++)
          for (let x = j % 2 ? hw / 2 : 0; x < c.w + hw; x += hw) {
            if (c.full()) return;
            put(ngon(x, y, r, 6, -Math.PI / 2), c.ink());
          }
      } else if (c.p.tile === 2) {
        const r = s / 2;
        const hw = r * Math.sqrt(3);
        for (let j = 0, y = 0; y < c.h + r * 2; y += r * 1.5, j++)
          for (let x = j % 2 ? hw / 2 : 0; x < c.w + hw; x += hw) {
            if (c.full()) return;
            const hex = ngon(x, y, r, 6, -Math.PI / 2);
            const o: P2 = [x, y];
            put([hex[0], hex[1], o, hex[5]], 0);
            put([hex[1], hex[2], hex[3], o], 1 % c.inks);
            put([o, hex[3], hex[4], hex[5]], 2 % c.inks);
          }
      } else {
        const bh = s / 2;
        for (let j = 0, y = 0; y < c.h; y += bh, j++)
          for (let x = j % 2 ? -s / 2 : 0; x < c.w; x += s) {
            if (c.full()) return;
            put([[x, y], [x + s, y], [x + s, y + bh], [x, y + bh]], c.ink());
          }
      }
    },
  },
  {
    kind: 'waves',
    label: 'Wave field',
    category: 'organic',
    keywords: ['waves', 'wave lines', 'wavy', 'ripples', 'sine', 'undulating', 'water lines', 'repeating wave'],
    params: [P('scale', 'Spacing', 2, 200, 16), P('amplitude', 'Amplitude', 0, 300, 14), P('wavelength', 'Wavelength', 8, 1200, 140), P('drift', 'Phase drift', 0, 100, 12), P('weight', 'Weight', 0.25, 30, 1.5, 0.25), P('wobble', 'Organic wobble', 0, 100, 0)],
    says: 'waving lines',
    build(c) {
      const n = Math.max(1, Math.round(c.h / c.p.scale));
      const ys = spread(n, -c.p.amplitude, c.h + c.p.amplitude, (t) => c.amount(c.w / 2, clamp(t, 0, 1) * c.h));
      const step = Math.max(2, Math.min(c.p.wavelength / 16, 12));
      ys.forEach((y0, i) => {
        if (c.full()) return;
        const phase = (i * c.p.drift * TAU) / 100;
        const amp = c.p.amplitude * c.vary();
        const pts: P2[] = [];
        for (let x = 0; x <= c.w + step; x += step) {
          const wob = c.p.wobble ? fieldAt(c, x, y0, 1 / 220) * c.p.wobble * 0.6 : 0;
          pts.push([x, y0 + Math.sin((x / c.p.wavelength) * TAU + phase) * amp + wob]);
        }
        c.mark(polyD(pts, false), c.ink(), Math.max(0.1, c.p.weight));
      });
    },
  },
  {
    kind: 'contours',
    label: 'Topographic contours',
    category: 'organic',
    keywords: ['contours', 'topographic', 'topography', 'isolines', 'terrain', 'map lines', 'elevation'],
    params: [P('scale', 'Feature size', 20, 1200, 260), P('levels', 'Levels', 2, 40, 14), P('weight', 'Weight', 0.25, 12, 1.2, 0.25)],
    says: 'contour lines of a seeded terrain',
    build(c) {
      const cell = Math.max(4, Math.min(c.w, c.h) / 90);
      const gw = Math.ceil(c.w / cell) + 1;
      const gh = Math.ceil(c.h / cell) + 1;
      const f = 1 / c.p.scale;
      const v = new Float32Array(gw * gh);
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) v[j * gw + i] = fieldAt(c, i * cell, j * cell, f);
      const L = Math.round(c.p.levels);
      let lo = Infinity;
      let hi = -Infinity;
      for (const x of v) {
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
      for (let l = 1; l <= L; l++) {
        const iso = lo + ((hi - lo) * l) / (L + 1);
        const segs: [P2, P2][] = [];
        for (let j = 0; j < gh - 1; j++)
          for (let i = 0; i < gw - 1; i++) {
            const a = v[j * gw + i];
            const b = v[j * gw + i + 1];
            const cc = v[(j + 1) * gw + i + 1];
            const d = v[(j + 1) * gw + i];
            const idx = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (cc > iso ? 2 : 0) | (d > iso ? 1 : 0);
            if (idx === 0 || idx === 15) continue;
            const x = i * cell;
            const y = j * cell;
            const lerp = (p: number, q: number) => (iso - p) / (q - p || 1e-9);
            const T: P2 = [x + lerp(a, b) * cell, y];
            const R: P2 = [x + cell, y + lerp(b, cc) * cell];
            const B: P2 = [x + lerp(d, cc) * cell, y + cell];
            const Lf: P2 = [x, y + lerp(a, d) * cell];
            switch (idx) {
              case 1: case 14: segs.push([Lf, B]); break;
              case 2: case 13: segs.push([B, R]); break;
              case 3: case 12: segs.push([Lf, R]); break;
              case 4: case 11: segs.push([T, R]); break;
              case 6: case 9: segs.push([T, B]); break;
              case 7: case 8: segs.push([Lf, T]); break;
              case 5: segs.push([Lf, T], [B, R]); break;
              case 10: segs.push([T, R], [Lf, B]); break;
            }
          }
        const ink = c.ink();
        for (const line of chain(segs)) {
          if (c.full()) return;
          const mid = line[Math.floor(line.length / 2)];
          if (c.amount(mid[0], mid[1]) < c.rnd()) continue;
          c.mark(polyD(line, false), ink, l % 5 === 0 ? c.p.weight * 2 : c.p.weight);
        }
      }
    },
  },
  {
    kind: 'isometric',
    label: 'Isometric',
    category: 'technical',
    keywords: ['isometric', 'iso grid', 'cubes', '3d grid', 'axonometric', 'blocks'],
    params: [P('scale', 'Edge', 6, 300, 36), P('mode', 'Draw (grid, cubes, dots)', 0, 2, 0), P('weight', 'Weight', 0.25, 12, 1, 0.25)],
    says: 'an isometric lattice',
    build(c) {
      const s = c.p.scale;
      const hw = s * 0.866;
      if (c.p.mode === 0) {
        for (let x = -c.h * 2; x < c.w + c.h * 2; x += hw * 2) {
          if (c.full()) return;
          c.mark(lineD([x, 0], [x + c.h / Math.tan(Math.PI / 6), c.h]), c.ink(), c.p.weight);
          c.mark(lineD([x, 0], [x - c.h / Math.tan(Math.PI / 6), c.h]), c.ink(), c.p.weight);
        }
        for (let x = 0; x <= c.w; x += hw) c.mark(lineD([x, 0], [x, c.h]), c.ink(), c.p.weight);
        return;
      }
      for (let j = 0, y = 0; y < c.h + s * 2; y += s * 1.5, j++)
        for (let x = j % 2 ? hw : 0; x < c.w + hw * 2; x += hw * 2) {
          if (c.full()) return;
          if (c.amount(x, y) < c.rnd()) continue;
          if (c.p.mode === 2) {
            c.mark(circleD(x, y, Math.max(0.5, c.p.weight * 1.5) * c.vary()), c.ink());
            continue;
          }
          const top: P2[] = [[x, y - s], [x + hw, y - s / 2], [x, y], [x - hw, y - s / 2]];
          const left: P2[] = [[x - hw, y - s / 2], [x, y], [x, y + s], [x - hw, y + s / 2]];
          const right: P2[] = [[x, y], [x + hw, y - s / 2], [x + hw, y + s / 2], [x, y + s]];
          c.mark(polyD(top), 0);
          c.mark(polyD(left), 1 % c.inks);
          c.mark(polyD(right), 2 % c.inks);
        }
    },
  },
  {
    kind: 'modular',
    label: 'Modular tiles',
    category: 'grid',
    keywords: ['modular', 'bauhaus', 'tiles', 'quarter circles', 'geometric tiles', 'module', 'swiss pattern'],
    params: [P('scale', 'Module', 8, 400, 64), P('set', 'Set (curves, angles, mixed)', 0, 2, 0), P('fill', 'Filled share %', 10, 100, 80)],
    says: 'a grid of modules: quarter circles, halves, triangles and squares',
    build(c) {
      const s = c.p.scale;
      for (let y = 0; y < c.h; y += s)
        for (let x = 0; x < c.w; x += s) {
          if (c.full()) return;
          if (c.rnd() > (c.p.fill / 100) * c.amount(x + s / 2, y + s / 2)) continue;
          const pick = c.p.set === 2 ? Math.floor(c.rnd() * 7) : c.p.set === 0 ? Math.floor(c.rnd() * 4) : 4 + Math.floor(c.rnd() * 3);
          const q = Math.floor(c.rnd() * 4);
          const corners: P2[] = [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
          const ink = c.ink();
          if (pick === 0) {
            const [cx, cy] = corners[q];
            const a0 = (q * Math.PI) / 2;
            c.mark(sectorD(cx, cy, s, a0, a0 + Math.PI / 2), ink);
          } else if (pick === 1) {
            const mids: P2[] = [[x + s / 2, y], [x + s, y + s / 2], [x + s / 2, y + s], [x, y + s / 2]];
            const a0 = (q * Math.PI) / 2;
            c.mark(sectorD(mids[q][0], mids[q][1], s / 2, a0, a0 + Math.PI), ink);
          } else if (pick === 2) c.mark(circleD(x + s / 2, y + s / 2, s * 0.42), ink);
          else if (pick === 3) c.mark(arcD(corners[q][0], corners[q][1], s / 2, (q * Math.PI) / 2, (q * Math.PI) / 2 + Math.PI / 2) + arcD(corners[q][0], corners[q][1], s, (q * Math.PI) / 2, (q * Math.PI) / 2 + Math.PI / 2), ink, Math.max(1, s / 14));
          else if (pick === 4) c.mark(polyD([corners[q], corners[(q + 1) % 4], corners[(q + 2) % 4]]), ink);
          else if (pick === 5) c.mark(rectD(x + s * 0.12, y + s * 0.12, s * 0.76, s * 0.76), ink);
          else c.mark(rectD(x, y + (q % 2 ? 0 : s / 2), s, s / 2), ink);
        }
    },
  },
  {
    kind: 'scatter',
    label: 'Scatter',
    category: 'organic',
    keywords: ['scatter', 'scattered', 'confetti', 'specks', 'random dots', 'sprinkles', 'stars field'],
    params: [P('scale', 'Spacing', 3, 300, 22), P('size', 'Size', 0.5, 60, 3, 0.5), P('shape', 'Shape (dot, square, dash, plus)', 0, 3, 0), P('clump', 'Clumping', 0, 100, 0)],
    says: 'marks scattered evenly at random',
    build(c) {
      const pts = poisson(c.w, c.h, c.p.scale, c.rnd, MAX_MARKS);
      for (const [x, y] of pts) {
        if (c.full()) return;
        const cl = c.p.clump ? clamp(0.5 + fieldAt(c, x, y, 1 / (c.p.scale * 6)) * 1.4, 0, 1) : 1;
        if (c.amount(x, y) * (1 - (c.p.clump / 100) * (1 - cl)) < c.rnd()) continue;
        const r = c.p.size * c.vary();
        const ink = c.ink();
        if (c.p.shape === 1) c.mark(rectD(x - r, y - r, r * 2, r * 2), ink);
        else if (c.p.shape === 2) {
          const a = c.rnd() * TAU;
          c.mark(lineD([x - Math.cos(a) * r * 2, y - Math.sin(a) * r * 2], [x + Math.cos(a) * r * 2, y + Math.sin(a) * r * 2]), ink, Math.max(0.5, r * 0.6));
        } else if (c.p.shape === 3) c.mark(lineD([x - r * 1.5, y], [x + r * 1.5, y]) + lineD([x, y - r * 1.5], [x, y + r * 1.5]), ink, Math.max(0.5, r * 0.5));
        else c.mark(circleD(x, y, r), ink);
      }
    },
  },
  {
    kind: 'noise-dashes',
    label: 'Noise field',
    category: 'generative',
    keywords: ['noise field', 'noise', 'hatch', 'stipple', 'grass', 'fur', 'brush strokes', 'vector field'],
    params: [P('scale', 'Spacing', 3, 120, 12), P('length', 'Length', 1, 120, 10), P('turbulence', 'Turbulence', 1, 100, 25), P('weight', 'Weight', 0.25, 12, 1.2, 0.25)],
    says: 'short strokes turned by a noise field',
    build(c) {
      const s = c.p.scale;
      const f = (c.p.turbulence / 100) * 0.012 + 0.0008;
      for (let y = s / 2; y < c.h; y += s)
        for (let x = s / 2; x < c.w; x += s) {
          if (c.full()) return;
          if (c.amount(x, y) < c.rnd()) continue;
          const [jx, jy] = c.jit(s);
          const px = x + jx;
          const py = y + jy;
          const a = fieldAt(c, px, py, f) * Math.PI * 2;
          const l = (c.p.length / 2) * c.vary();
          c.mark(lineD([px - Math.cos(a) * l, py - Math.sin(a) * l], [px + Math.cos(a) * l, py + Math.sin(a) * l]), c.ink(), c.p.weight);
        }
    },
  },
  {
    kind: 'flow',
    label: 'Flow field',
    category: 'generative',
    keywords: ['flow field', 'flow lines', 'fluid', 'streamlines', 'currents', 'hair', 'organic lines', 'generative lines'],
    params: [P('scale', 'Spacing', 4, 200, 18), P('steps', 'Length (steps)', 4, 200, 40), P('step', 'Step', 1, 20, 4, 0.5), P('turbulence', 'Turbulence', 1, 100, 30), P('weight', 'Weight', 0.25, 12, 1.2, 0.25), P('curl', 'Curl', 0, 100, 50)],
    says: 'curves following a seeded flow field',
    build(c) {
      const s = c.p.scale;
      const f = (c.p.turbulence / 100) * 0.01 + 0.0006;
      const k = 1 + (c.p.curl / 100) * 3;
      for (let y = s / 2; y < c.h; y += s)
        for (let x = s / 2; x < c.w; x += s) {
          if (c.full()) return;
          if (c.amount(x, y) < c.rnd()) continue;
          const [jx, jy] = c.jit(s);
          let px = x + jx;
          let py = y + jy;
          const pts: P2[] = [[px, py]];
          const steps = Math.round(c.p.steps * c.vary());
          for (let i = 0; i < steps; i++) {
            const a = fieldAt(c, px, py, f) * Math.PI * k;
            px += Math.cos(a) * c.p.step;
            py += Math.sin(a) * c.p.step;
            if (px < -s || py < -s || px > c.w + s || py > c.h + s) break;
            pts.push([px, py]);
          }
          if (pts.length > 2) c.mark(polyD(pts, false), c.ink(), c.p.weight);
        }
    },
  },
  {
    kind: 'particles',
    label: 'Particles',
    category: 'generative',
    keywords: ['particles', 'particle trails', 'dust', 'swarm', 'stardust', 'motion particles'],
    params: [P('scale', 'Spacing', 6, 200, 30), P('steps', 'Trail', 2, 80, 16), P('size', 'Particle size', 0.5, 20, 3, 0.5), P('turbulence', 'Turbulence', 1, 100, 30)],
    says: 'particles drifting along a flow, shrinking as they go',
    build(c) {
      const s = c.p.scale;
      const f = (c.p.turbulence / 100) * 0.01 + 0.0006;
      for (let y = s / 2; y < c.h; y += s)
        for (let x = s / 2; x < c.w; x += s) {
          if (c.full()) return;
          if (c.amount(x, y) < c.rnd()) continue;
          const [jx, jy] = c.jit(s);
          let px = x + jx;
          let py = y + jy;
          const ink = c.ink();
          const base = c.p.size * c.vary();
          for (let i = 0; i < c.p.steps; i++) {
            const r = base * (1 - i / c.p.steps);
            if (r < 0.3) break;
            c.mark(circleD(px, py, r), ink);
            const a = fieldAt(c, px, py, f) * Math.PI * 2;
            px += Math.cos(a) * r * 2.2;
            py += Math.sin(a) * r * 2.2;
          }
        }
    },
  },
  {
    kind: 'spiro',
    label: 'Parametric curves',
    category: 'generative',
    keywords: ['spirograph', 'parametric', 'rose curve', 'lissajous', 'hypotrochoid', 'mathematical', 'rosette', 'harmonograph'],
    params: [P('curve', 'Curve (spirograph, rose, Lissajous)', 0, 2, 0), P('a', 'First term', 1, 24, 5), P('b', 'Second term', 1, 24, 3), P('c', 'Third term %', 0, 100, 60), P('copies', 'Rotated copies', 1, 24, 1), P('weight', 'Weight', 0.25, 12, 1, 0.25), P('size', 'Size %', 10, 140, 90)],
    says: 'a mathematical curve, repeated round its centre',
    build(c) {
      const cx = c.w / 2;
      const cy = c.h / 2;
      const R = (Math.min(c.w, c.h) / 2) * (c.p.size / 100);
      const a = c.p.a;
      const b = c.p.b;
      const k3 = c.p.c / 100;
      const N = 1400;
      for (let copy = 0; copy < c.p.copies; copy++) {
        if (c.full()) return;
        const rot = (copy / c.p.copies) * TAU;
        const pts: P2[] = [];
        for (let i = 0; i <= N; i++) {
          const t = (i / N) * TAU * (c.p.curve === 0 ? b : 1);
          let x: number;
          let y: number;
          if (c.p.curve === 0) {
            const Rr = 1;
            const r = b / a;
            x = (Rr - r) * Math.cos(t) + k3 * Math.cos(((Rr - r) / r) * t);
            y = (Rr - r) * Math.sin(t) - k3 * Math.sin(((Rr - r) / r) * t);
            const m = Math.abs(Rr - r) + k3 || 1;
            x /= m;
            y /= m;
          } else if (c.p.curve === 1) {
            const rr = Math.cos((a / b) * t * b) * (1 - k3 * 0.5) + k3 * 0.5;
            const tt = t * b;
            x = rr * Math.cos(tt);
            y = rr * Math.sin(tt);
          } else {
            x = Math.sin(a * t + k3 * Math.PI);
            y = Math.sin(b * t);
          }
          pts.push([cx + (x * Math.cos(rot) - y * Math.sin(rot)) * R, cy + (x * Math.sin(rot) + y * Math.cos(rot)) * R]);
        }
        c.mark(polyD(pts, false), c.ink(), c.p.weight);
      }
    },
  },
  {
    kind: 'truchet',
    label: 'Truchet maze',
    category: 'organic',
    keywords: ['truchet', 'maze', 'labyrinth', 'network', 'curly', '10 print', 'diagonal maze', 'organic network'],
    params: [P('scale', 'Tile', 6, 300, 40), P('style', 'Style (arcs, diagonals, triangles)', 0, 2, 0), P('weight', 'Weight', 0.5, 40, 3, 0.5)],
    says: 'tiles turned at random that join into a maze',
    build(c) {
      const s = c.p.scale;
      for (let y = 0; y < c.h; y += s)
        for (let x = 0; x < c.w; x += s) {
          if (c.full()) return;
          if (c.amount(x + s / 2, y + s / 2) < c.rnd()) continue;
          const flip = c.rnd() < 0.5;
          const ink = c.ink();
          if (c.p.style === 0) {
            if (flip) c.mark(arcD(x, y, s / 2, 0, Math.PI / 2) + arcD(x + s, y + s, s / 2, Math.PI, Math.PI * 1.5), ink, c.p.weight);
            else c.mark(arcD(x + s, y, s / 2, Math.PI / 2, Math.PI) + arcD(x, y + s, s / 2, -Math.PI / 2, 0), ink, c.p.weight);
          } else if (c.p.style === 1) c.mark(flip ? lineD([x, y], [x + s, y + s]) : lineD([x + s, y], [x, y + s]), ink, c.p.weight);
          else c.mark(polyD(flip ? [[x, y], [x + s, y], [x, y + s]] : [[x + s, y], [x + s, y + s], [x, y + s]]), ink);
        }
    },
  },
  {
    kind: 'network',
    label: 'Organic network',
    category: 'generative',
    keywords: ['network', 'constellation', 'plexus', 'nodes', 'connections', 'mesh lines', 'neural', 'connected dots'],
    params: [P('scale', 'Spacing', 8, 300, 48), P('reach', 'Reach (× spacing)', 1, 3, 1.6, 0.1), P('node', 'Node size', 0, 20, 2.5, 0.5), P('weight', 'Line weight', 0.25, 8, 0.75, 0.25)],
    says: 'points joined to their neighbours',
    build(c) {
      const pts = poisson(c.w, c.h, c.p.scale, c.rnd, 1600).filter(([x, y]) => c.amount(x, y) >= c.rnd());
      const reach = c.p.scale * c.p.reach;
      const ink = c.ink();
      let d = '';
      let n = 0;
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
          const dist = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
          if (dist < reach) {
            d += lineD(pts[i], pts[j]);
            if (++n > MAX_MARKS / 2) break;
          }
        }
      if (d) c.mark(d, ink, c.p.weight);
      if (c.p.node > 0) for (const [x, y] of pts) {
        if (c.full()) return;
        c.mark(circleD(x, y, c.p.node * c.vary()), c.ink());
      }
    },
  },
  {
    kind: 'technical',
    label: 'Technical grid',
    category: 'technical',
    keywords: ['technical grid', 'blueprint', 'engineering', 'annotations', 'crosshairs', 'registration marks', 'ruler', 'coordinates', 'schematic'],
    params: [P('scale', 'Cell', 6, 200, 20), P('major', 'Major every', 2, 20, 5), P('weight', 'Weight', 0.25, 4, 0.5, 0.25), P('labels', 'Coordinates', 0, 1, 1), P('marks', 'Crosshairs and marks', 0, 1, 1)],
    says: 'a fine technical grid with major lines, crosshairs, rulers and coordinates',
    build(c) {
      const s = c.p.scale;
      const M = Math.round(c.p.major);
      let i = 0;
      for (let x = 0; x <= c.w + 0.5; x += s, i++) c.mark(lineD([x, 0], [x, c.h]), 0, i % M === 0 ? c.p.weight * 2.2 : c.p.weight);
      i = 0;
      for (let y = 0; y <= c.h + 0.5; y += s, i++) c.mark(lineD([0, y], [c.w, y]), 0, i % M === 0 ? c.p.weight * 2.2 : c.p.weight);
      const big = s * M;
      if (c.p.marks) {
        for (let y = big; y < c.h; y += big)
          for (let x = big; x < c.w; x += big) {
            if (c.full()) return;
            const r = s * 0.6;
            c.mark(lineD([x - r, y], [x + r, y]) + lineD([x, y - r], [x, y + r]), 1 % c.inks, c.p.weight * 3);
          }
        // ruler ticks along the top and left edges
        for (let x = 0; x <= c.w; x += s / 2) c.mark(lineD([x, 0], [x, (x / s) % 1 ? s * 0.25 : s * 0.5]), 1 % c.inks, c.p.weight * 1.5);
        for (let y = 0; y <= c.h; y += s / 2) c.mark(lineD([0, y], [(y / s) % 1 ? s * 0.25 : s * 0.5, y]), 1 % c.inks, c.p.weight * 1.5);
      }
      if (c.p.labels) {
        const size = Math.max(5, Math.min(11, s * 0.42));
        let k = 0;
        for (let x = big; x < c.w; x += big) c.label({ x: x + 2, y: s * 0.5 + size + 2, text: String(++k).padStart(2, '0'), size, ink: 1 % c.inks });
        k = 0;
        for (let y = big; y < c.h; y += big) c.label({ x: s * 0.5 + 3, y: y - 3, text: String.fromCharCode(65 + (k++ % 26)), size, ink: 1 % c.inks });
      }
    },
  },
  {
    kind: 'abstract',
    label: 'Abstract composition',
    category: 'generative',
    keywords: ['abstract', 'abstract composition', 'memphis', 'bauhaus shapes', 'geometric composition', 'shapes collage', 'constructivist'],
    params: [P('count', 'Shapes', 3, 80, 18), P('shapeSize', 'Size % of the box', 4, 80, 26), P('lineShare', 'Line share %', 0, 100, 30)],
    says: 'a seeded arrangement of circles, halves, bars, arcs and lines',
    build(c) {
      const n = Math.round(c.p.count);
      const cols = Math.max(1, Math.round(Math.sqrt((n * c.w) / c.h)));
      const rows = Math.max(1, Math.ceil(n / cols));
      for (let i = 0; i < n; i++) {
        if (c.full()) return;
        const gx = ((i % cols) + 0.5) * (c.w / cols);
        const gy = (Math.floor(i / cols) + 0.5) * (c.h / rows);
        const [jx, jy] = c.jit(Math.min(c.w / cols, c.h / rows) * 2);
        const x = gx + jx;
        const y = gy + jy;
        if (c.amount(x, y) < c.rnd()) continue;
        const s = Math.min(c.w, c.h) * (c.p.shapeSize / 100) * (0.45 + c.rnd() * 0.75) * c.vary();
        const kind = c.rnd() * 100 < c.p.lineShare ? 5 + Math.floor(c.rnd() * 2) : Math.floor(c.rnd() * 5);
        const a = Math.floor(c.rnd() * 4) * (Math.PI / 2);
        const ink = c.ink();
        if (kind === 0) c.mark(circleD(x, y, s / 2), ink);
        else if (kind === 1) c.mark(sectorD(x, y, s / 2, a, a + Math.PI), ink);
        else if (kind === 2) c.mark(rectD(x - s / 2, y - s / 8, s, s / 4), ink);
        else if (kind === 3) c.mark(polyD(ngon(x, y, s / 2, 3, a)), ink);
        else if (kind === 4) c.mark(rectD(x - s / 3, y - s / 3, (s * 2) / 3, (s * 2) / 3), ink);
        else if (kind === 5) c.mark(arcD(x, y, s / 2, a, a + Math.PI), ink, Math.max(1, s / 22));
        else c.mark(lineD([x - Math.cos(a + 0.6) * s / 2, y - Math.sin(a + 0.6) * s / 2], [x + Math.cos(a + 0.6) * s / 2, y + Math.sin(a + 0.6) * s / 2]), ink, Math.max(1, s / 30));
      }
    },
  },
];

export const PATTERN_BY_KIND = new Map(PATTERNS.map((p) => [p.kind, p]));
export const PATTERN_CATEGORIES: readonly { id: PatternCategory; label: string }[] = [
  { id: 'grid', label: 'Grids & repeats' },
  { id: 'radial', label: 'Radial' },
  { id: 'organic', label: 'Organic' },
  { id: 'technical', label: 'Technical' },
  { id: 'generative', label: 'Generative' },
];

const PX_KEYS = new Set(['scale', 'weight', 'majorWeight', 'amplitude', 'wavelength', 'step', 'length', 'node', 'dash']);
/** Whether a generator's parameter is a length in px (it scales with the design; a share or a count does not). */
export function isPxParam(kind: string, key: string): boolean {
  if (key === 'size') return kind === 'scatter' || kind === 'particles';
  if (key === 'scale') return kind !== 'abstract';
  return PX_KEYS.has(key);
}

/** Every parameter a generator takes: its own, then the shared controls. */
export function patternParams(kind: string): ParamSpec[] {
  const s = PATTERN_BY_KIND.get(kind);
  return s ? [...s.params, ...COMMON_PARAMS.filter((q) => !s.params.some((o) => o.key === q.key))] : [];
}

/** A generator's parameters with their defaults (a few generators start turned: diagonal stripes at 45°). */
export function patternDefaults(kind: string): Record<string, number> | null {
  if (!PATTERN_BY_KIND.has(kind)) return null;
  const p = Object.fromEntries(patternParams(kind).map((q) => [q.key, q.def]));
  if (kind === 'diagonal') p.rotation = 45;
  if (kind === 'halftone') p.rotation = 0;
  return p;
}

/** Parameters held to a generator's list: unknown keys dropped, numbers clamped and stepped. */
export function normalizePatternParams(kind: string, v: unknown): Record<string, number> | null {
  const defs = patternDefaults(kind);
  if (!defs) return null;
  const given = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const out: Record<string, number> = {};
  for (const q of patternParams(kind)) {
    const raw = given[q.key];
    const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : defs[q.key];
    out[q.key] = clamp(q.step >= 1 ? Math.round(n) : Math.round(n / q.step) * q.step, q.min, q.max);
  }
  return out;
}

const cache = new Map<string, PatternOut>();

/** The pattern's marks in its box (see the head of this file): deterministic and cached. */
export function runPattern(kind: string, params: Record<string, number>, w: number, h: number, inks: number): PatternOut {
  const key = `${kind}|${JSON.stringify(params)}|${Math.round(w)}|${Math.round(h)}|${inks}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const spec = PATTERN_BY_KIND.get(kind);
  const p = { ...(patternDefaults(kind) ?? {}), ...params };
  const rot = ((p.rotation ?? 0) * Math.PI) / 180;
  // a turned pattern is drawn in a frame large enough to cover the box at any angle
  const diag = Math.hypot(w, h);
  const fw = rot ? diag : w;
  const fh = rot ? diag : h;
  const fx = (w - fw) / 2;
  const fy = (h - fh) / 2;
  const rnd = rng(p.seed ?? 7);
  const noise = noise2(p.seed ?? 7);
  const buckets = new Map<string, { d: string[]; ink: number; stroke?: number }>();
  const labels: PatternLabel[] = [];
  let count = 0;
  let capped = false;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const rampDir = Math.round(p.rampDir ?? 0);
  const ramp = (p.ramp ?? 0) / 100;
  const edge = (p.edge ?? 0) / 100;
  const ctx: Ctx = {
    w: fw,
    h: fh,
    p,
    rnd,
    noise,
    inks: Math.max(1, inks),
    mark(d, ink = 0, stroke) {
      if (count >= MAX_MARKS) {
        capped = true;
        return;
      }
      count++;
      const sw = stroke === undefined ? undefined : Math.max(0.1, Math.round(stroke * 10) / 10);
      const k = `${ink % Math.max(1, inks)}|${sw ?? 'f'}`;
      const b = buckets.get(k);
      if (b) b.d.push(d);
      else buckets.set(k, { d: [d], ink: ink % Math.max(1, inks), ...(sw !== undefined ? { stroke: sw } : {}) });
    },
    label(l) {
      if (labels.length < 200) labels.push(l);
    },
    ink() {
      return inks > 1 && rnd() * 100 < (p.colorVar ?? 0) ? 1 + Math.floor(rnd() * (inks - 1)) : 0;
    },
    amount(x, y) {
      // the frame point in the box's own (unturned) coordinates
      const dx = x - fw / 2;
      const dy = y - fh / 2;
      const bx = w / 2 + dx * cos - dy * sin;
      const by = h / 2 + dx * sin + dy * cos;
      let a = 1;
      if (ramp) {
        const u = clamp(bx / w, 0, 1);
        const v = clamp(by / h, 0, 1);
        const centre = 1 - clamp(Math.hypot(u - 0.5, v - 0.5) / 0.7071, 0, 1);
        const t = rampDir === 0 ? v : rampDir === 1 ? 1 - v : rampDir === 2 ? u : rampDir === 3 ? 1 - u : rampDir === 4 ? centre : 1 - centre;
        const tt = ramp > 0 ? t : 1 - t;
        a *= 1 - Math.abs(ramp) + Math.abs(ramp) * tt;
      }
      if (edge) {
        const e = Math.min(bx, by, w - bx, h - by) / (Math.min(w, h) / 2);
        a *= clamp(e / edge, 0, 1);
      }
      return clamp(a, 0, 1);
    },
    vary() {
      return 1 - ((p.variation ?? 0) / 100) * rnd() * 0.85;
    },
    jit(scale) {
      const j = (p.jitter ?? 0) / 100;
      return j ? [(rnd() - 0.5) * scale * j, (rnd() - 0.5) * scale * j] : [0, 0];
    },
    full: () => count >= MAX_MARKS,
  };
  if (spec) spec.build(ctx);
  if (count >= MAX_MARKS) capped = true;
  const out: PatternOut = {
    paths: [...buckets.values()].map((b) => ({ d: b.d.join(''), ink: b.ink, ...(b.stroke !== undefined ? { stroke: b.stroke } : {}) })),
    labels,
    count,
    capped,
    frame: { x: fx, y: fy, w: fw, h: fh, rotation: p.rotation ?? 0 },
  };
  if (cache.size > 120) cache.delete(cache.keys().next().value as string);
  cache.set(key, out);
  return out;
}
