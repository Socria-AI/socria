// lib/ux-v0/graphics/creative/forms.ts — the forms a theme or a quality brings to a design, drawn as editable vectors.
//
// A cloud theme needs clouds; "abstract organic forms" need soft irregular masses; "more futuristic" may want fine
// technical lines. Each form here is generated, never taken from a library: a cumulus is computed from overlapping
// lobes cut by a soft base (its abstraction moving it from billowing and irregular, to stylised, to a few geometric
// circles and a pill), a blob from a closed curve through jittered points, a ridge from a skyline of peaks. Every form
// is an ordinary shape node of the document (a path in a 0–100 box, an ellipse, a star, a rectangle), so it can be
// selected, recoloured, moved and edited like anything else. Placement keeps to where the words are not.

import { newId, type Node, type Paint, type ShapeNode } from '../doc';

export const FORM_KINDS = ['cloud', 'organic', 'wave', 'leaf', 'orb', 'sparkle', 'line', 'grid', 'mountain', 'block', 'ring', 'petal', 'flame', 'snow', 'drop', 'sun', 'none'] as const;
export type FormKind = (typeof FORM_KINDS)[number];

export const FORM_LABEL: Record<FormKind, string> = {
  cloud: 'clouds',
  organic: 'organic forms',
  wave: 'waves',
  leaf: 'leaves',
  orb: 'orbs',
  sparkle: 'sparkles',
  line: 'fine lines',
  grid: 'a technical grid',
  mountain: 'mountain ridges',
  block: 'architectural blocks',
  ring: 'rings',
  petal: 'petals',
  flame: 'flames',
  snow: 'snowflakes',
  drop: 'drops',
  sun: 'a sun',
  none: 'no forms',
};

/** A seeded random stream: the same seed, the same forms. */
export function rng(seed: number): () => number {
  let s = Math.floor(seed) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const n2 = (v: number) => String(Math.round(v * 100) / 100);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Pt {
  x: number;
  y: number;
}
interface Lobe {
  x: number;
  y: number;
  r: number;
}

/** A circular arc as cubic Béziers (each at most a quarter turn), from a0 to a1 (radians, y down, a1 > a0). */
function arcPath(c: Lobe, a0: number, a1: number, map: (p: Pt) => Pt): string {
  let out = '';
  const steps = Math.max(1, Math.ceil((a1 - a0) / (Math.PI / 2)));
  const d = (a1 - a0) / steps;
  const k = (4 / 3) * Math.tan(d / 4) * c.r;
  for (let i = 0; i < steps; i++) {
    const t0 = a0 + d * i;
    const t1 = t0 + d;
    const p0 = { x: c.x + c.r * Math.cos(t0), y: c.y + c.r * Math.sin(t0) };
    const p3 = { x: c.x + c.r * Math.cos(t1), y: c.y + c.r * Math.sin(t1) };
    const p1 = map({ x: p0.x - k * Math.sin(t0), y: p0.y + k * Math.cos(t0) });
    const p2 = map({ x: p3.x + k * Math.sin(t1), y: p3.y - k * Math.cos(t1) });
    const e = map(p3);
    out += ` C ${n2(p1.x)} ${n2(p1.y)} ${n2(p2.x)} ${n2(p2.y)} ${n2(e.x)} ${n2(e.y)}`;
  }
  return out;
}

/** Where two lobes cross, the upper of the two points (null when they do not overlap). */
function upperCrossing(a: Lobe, b: Lobe): Pt | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d === 0 || d >= a.r + b.r || d <= Math.abs(a.r - b.r)) return null;
  const along = (a.r * a.r - b.r * b.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a.r * a.r - along * along));
  const mx = a.x + (along * dx) / d;
  const my = a.y + (along * dy) / d;
  const p1 = { x: mx + (h * dy) / d, y: my - (h * dx) / d };
  const p2 = { x: mx - (h * dy) / d, y: my + (h * dx) / d };
  return p1.y < p2.y ? p1 : p2;
}

const angleOf = (c: Lobe, p: Pt) => {
  const t = Math.atan2(p.y - c.y, p.x - c.x);
  return t < 0 ? t + Math.PI * 2 : t;
};

/**
 * A cumulus silhouette: lobes overlapping along the top, cut by a gently rounded base. Returned as a path in the 0–100
 * box, with the box's aspect (width ÷ height) so circles stay circles when the node is drawn at that proportion.
 */
export function cloudOutline(lobes: Lobe[], baseY: number, sag: number): { path: string; aspect: number } {
  const L = [...lobes].sort((p, q) => p.x - q.x);
  const first = L[0];
  const last = L[L.length - 1];
  const cut = (c: Lobe, side: -1 | 1): Pt => {
    const dy = clamp(baseY - c.y, -c.r * 0.98, c.r * 0.98);
    return { x: c.x + side * Math.sqrt(c.r * c.r - dy * dy), y: baseY };
  };
  const left = cut(first, -1);
  const right = cut(last, 1);
  const minX = Math.min(...L.map((c) => c.x - c.r), left.x);
  const maxX = Math.max(...L.map((c) => c.x + c.r), right.x);
  const minY = Math.min(...L.map((c) => c.y - c.r));
  const maxY = baseY + Math.max(0, sag);
  const W = maxX - minX || 1;
  const H = maxY - minY || 1;
  const map = (p: Pt): Pt => ({ x: ((p.x - minX) / W) * 100, y: ((p.y - minY) / H) * 100 });
  const start = map(left);
  let d = `M ${n2(start.x)} ${n2(start.y)}`;
  let from: Pt = left;
  for (let i = 0; i < L.length; i++) {
    const c = L[i];
    const to: Pt = i < L.length - 1 ? upperCrossing(c, L[i + 1]) ?? { x: c.x + c.r, y: c.y } : right;
    let a0 = angleOf(c, from);
    let a1 = angleOf(c, to);
    // over the top: the angle grows from the left of the lobe, through its top, to its right
    if (a0 < Math.PI / 2) a0 += Math.PI * 2;
    while (a1 <= a0) a1 += Math.PI * 2;
    if (a1 - a0 > Math.PI * 1.9) a1 = a0 + Math.PI * 1.9;
    d += arcPath(c, a0, a1, map);
    from = to;
  }
  // the base: a soft curve back to the start (straight when it does not sag)
  const e = map(left);
  if (sag > 0.01) {
    const c1 = map({ x: right.x - (right.x - left.x) * 0.3, y: baseY + sag });
    const c2 = map({ x: left.x + (right.x - left.x) * 0.3, y: baseY + sag });
    d += ` C ${n2(c1.x)} ${n2(c1.y)} ${n2(c2.x)} ${n2(c2.y)} ${n2(e.x)} ${n2(e.y)}`;
  } else d += ` L ${n2(e.x)} ${n2(e.y)}`;
  return { path: `${d} Z`, aspect: W / H };
}

/** The lobes of one cloud: more, smaller and less regular when literal; fewer and even as it grows abstract. */
export function cloudLobes(abstraction: number, rand: () => number): { lobes: Lobe[]; baseY: number; sag: number } {
  const a = clamp(abstraction, 0, 100) / 100;
  const n = a < 0.35 ? 5 + Math.floor(rand() * 3) : a < 0.7 ? 3 + Math.floor(rand() * 2) : 3;
  const irregular = (1 - a) * 0.45;
  const lobes: Lobe[] = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    // the middle lobes the tallest, as a cumulus builds
    const centred = 1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2 || 1);
    const r = 14 + 16 * centred * (0.7 + 0.3 * (1 - a)) + (rand() - 0.5) * 18 * irregular;
    if (i > 0) x += (lobes[i - 1].r + r) * (0.62 + rand() * 0.12 * (1 - a));
    lobes.push({ x, y: 0, r: Math.max(8, r) });
  }
  const baseY = 0;
  for (const l of lobes) l.y = baseY - l.r * (0.45 + (rand() - 0.5) * irregular * 0.6);
  return { lobes, baseY, sag: a < 0.5 ? 3 + rand() * 3 : 0 };
}

export interface FormStyle {
  /** the main colour of the forms */
  color: string;
  /** a second colour for variety (abstract two-tone, gradients) */
  color2?: string;
  /** a third, for the far layer */
  color3?: string;
  /** 0 literal … 100 abstract */
  abstraction: number;
  /** 0 flat … 3 atmospheric */
  depth: number;
  /** a neon glow around linear forms, in this colour */
  glow?: string;
}

export interface FormBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 near … 1 far: far forms are smaller, paler and softer */
  far: number;
  /** set behind the words, faint (a composition with no clear room for them): the atmosphere they sit in */
  behind?: boolean;
}

const motif = (name: string, box: { x: number; y: number; w: number; h: number }, extra: Partial<ShapeNode>): ShapeNode =>
  ({
    id: newId('cf'),
    type: 'shape',
    role: 'motif',
    name,
    decorative: true,
    shape: 'rect',
    x: Math.round(box.x * 10) / 10,
    y: Math.round(box.y * 10) / 10,
    w: Math.max(2, Math.round(box.w * 10) / 10),
    h: Math.max(2, Math.round(box.h * 10) / 10),
    rotation: 0,
    opacity: 1,
    fill: null,
    ...extra,
  }) as ShapeNode;

const vgrad = (top: string, bottom: string): Paint => ({ type: 'linear', angle: 180, stops: [{ at: 0, color: top }, { at: 1, color: bottom }] }) as Paint;
const radial = (inner: string, outer: string): Paint => ({ type: 'radial', angle: 0, cx: 0.38, cy: 0.34, r: 0.75, stops: [{ at: 0, color: inner }, { at: 1, color: outer }] }) as Paint;

/** Softer and paler with distance (depth 2+), a soft shadow beneath near forms at depth 1+. */
function depthOf(far: number, depth: number): Pick<ShapeNode, 'opacity' | 'effects'> {
  const effects: ShapeNode['effects'] = [];
  if (depth >= 3 && far > 0.55) effects.push({ kind: 'blur', on: true, params: { radius: 1 + far * 3 } });
  if (depth >= 1 && far < 0.45) effects.push({ kind: 'drop-shadow', on: true, params: { dx: 0, dy: 6 + depth * 3, blur: 16 + depth * 8, spread: 0, opacity: 10 + depth * 5 }, color: '#1b2238' });
  return { opacity: depth >= 2 ? Math.round((1 - far * 0.45) * 100) / 100 : 1, ...(effects.length ? { effects } : {}) };
}

/** One form of the kind, drawn in the box. Most kinds give one node; a few (an abstract cloud, a flower) give several. */
export function drawForm(kind: FormKind, box: FormBox, style: FormStyle, seed: number): Node[] {
  const rand = rng(seed);
  const a = clamp(style.abstraction, 0, 100);
  const c2 = style.color2 ?? style.color;
  const d0 = depthOf(box.far, style.depth);
  // behind the words they are only atmosphere: faint, never a shape the words have to fight
  const d = box.behind ? { ...d0, opacity: Math.min(d0.opacity ?? 1, 0.34) } : d0;
  switch (kind) {
    case 'cloud': {
      if (a >= 72) {
        // abstract: a pill with circles on it, or (most abstract) overlapping discs in two tones
        const out: Node[] = [];
        const h = box.h;
        if (a >= 90) {
          const r = h * 0.62;
          out.push(motif('Cloud (abstract disc)', { x: box.x, y: box.y + h * 0.2, w: r, h: r }, { shape: 'ellipse', fill: style.color, ...d }));
          out.push(motif('Cloud (abstract disc)', { x: box.x + r * 0.55, y: box.y, w: r * 1.15, h: r * 1.15 }, { shape: 'ellipse', fill: c2, ...d }));
          out.push(motif('Cloud (abstract disc)', { x: box.x + r * 1.3, y: box.y + h * 0.28, w: r * 0.8, h: r * 0.8 }, { shape: 'ellipse', fill: style.color, ...d }));
          return out;
        }
        const pillH = h * 0.42;
        out.push(motif('Cloud (abstract)', { x: box.x, y: box.y + h - pillH, w: box.w, h: pillH }, { shape: 'rect', radius: pillH / 2, fill: style.color, ...d }));
        const r1 = h * 0.62;
        out.push(motif('Cloud (abstract)', { x: box.x + box.w * 0.18, y: box.y + h - pillH - r1 * 0.55, w: r1, h: r1 }, { shape: 'ellipse', fill: style.color, ...d }));
        const r2 = h * 0.45;
        out.push(motif('Cloud (abstract)', { x: box.x + box.w * 0.5, y: box.y + h - pillH - r2 * 0.5, w: r2, h: r2 }, { shape: 'ellipse', fill: style.color, ...d }));
        return out;
      }
      const { lobes, baseY, sag } = cloudLobes(a, rand);
      const { path, aspect } = cloudOutline(lobes, baseY, sag);
      const w = box.w;
      const h = w / aspect;
      const fill = a < 35 && style.depth >= 1 ? vgrad(style.color, style.color3 ?? c2) : style.color;
      return [motif(a < 35 ? 'Cloud' : 'Cloud (stylised)', { x: box.x, y: box.y + Math.max(0, box.h - h), w, h }, { shape: 'path', path, fill, ...d })];
    }
    case 'organic': {
      // a closed curve through jittered points: smooth and calm when abstract, irregular when literal
      const n = 6 + Math.floor(rand() * 3);
      const jitter = 0.12 + (1 - a / 100) * 0.22;
      const pts: Pt[] = [];
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2 + rand() * 0.25;
        const r = 50 * (1 - jitter + rand() * jitter * 2);
        pts.push({ x: 50 + Math.cos(t) * r * 0.98, y: 50 + Math.sin(t) * r * 0.98 });
      }
      // flat colour, the two tones taking turns: a cut, calm mass (depth comes from shadow and overlap, not a glow)
      return [motif('Organic form', box, { shape: 'path', path: smoothClosed(pts), fill: seed % 2 ? c2 : style.color, rotation: Math.round(rand() * 40 - 20), ...d })];
    }
    case 'wave': {
      const k = 2 + Math.floor(rand() * 2);
      let p = 'M 0 40';
      for (let i = 0; i < k; i++) {
        const x0 = (i / k) * 100;
        const x1 = ((i + 0.5) / k) * 100;
        const x2 = ((i + 1) / k) * 100;
        p += ` Q ${n2(x0 + (x1 - x0) / 2)} ${n2(10 + rand() * 15)} ${n2(x1)} 40 Q ${n2(x1 + (x2 - x1) / 2)} ${n2(70 - rand() * 15)} ${n2(x2)} 40`;
      }
      return [motif('Wave', box, { shape: 'path', path: `${p} L 100 100 L 0 100 Z`, fill: style.color, ...d })];
    }
    case 'leaf':
      return [motif('Leaf', box, { shape: 'path', path: 'M 50 0 C 92 22 94 72 50 100 C 6 72 8 22 50 0 Z', fill: style.color, rotation: Math.round(rand() * 120 - 60), ...d })];
    case 'petal': {
      const out: Node[] = [];
      const k = 5 + Math.floor(rand() * 3);
      const pw = box.w * 0.32;
      const ph = box.h * 0.5;
      for (let i = 0; i < k; i++) {
        const t = (i / k) * Math.PI * 2;
        const cx = box.x + box.w / 2 + Math.cos(t) * box.w * 0.22 - pw / 2;
        const cy = box.y + box.h / 2 + Math.sin(t) * box.h * 0.22 - ph / 2;
        out.push(motif('Petal', { x: cx, y: cy, w: pw, h: ph }, { shape: 'path', path: 'M 50 0 C 92 22 94 72 50 100 C 6 72 8 22 50 0 Z', fill: i % 2 ? c2 : style.color, rotation: Math.round((t * 180) / Math.PI + 90), ...d }));
      }
      out.push(motif('Flower centre', { x: box.x + box.w * 0.4, y: box.y + box.h * 0.4, w: box.w * 0.2, h: box.h * 0.2 }, { shape: 'ellipse', fill: style.color3 ?? c2, ...d }));
      return out;
    }
    case 'orb':
      return [motif('Orb', box, { shape: 'ellipse', fill: style.depth >= 1 ? radial(c2, style.color) : style.color, ...d })];
    case 'sun':
      return [motif('Sun', box, { shape: 'ellipse', fill: style.depth >= 1 ? radial(c2, style.color) : style.color, ...d })];
    case 'sparkle':
      return [motif('Sparkle', box, { shape: 'star', sides: 4, inner: 0.22 + (a / 100) * 0.2, fill: style.color, rotation: Math.round(rand() * 30), ...d })];
    case 'snow':
      return [motif('Snowflake', box, { shape: 'star', sides: 6, inner: 0.28, fill: style.color, rotation: Math.round(rand() * 30), ...d })];
    case 'drop':
      return [motif('Drop', box, { shape: 'ellipse', fill: null, stroke: { color: style.color, width: Math.max(1, box.w * 0.04) }, ...d })];
    case 'ring':
      return [motif('Ring', box, { shape: 'ellipse', fill: null, stroke: { color: style.color, width: Math.max(1, box.w * (0.02 + rand() * 0.03)) }, opacity: d.opacity, ...(style.glow ? { effects: [{ kind: 'glow', on: true, params: { size: 10, spread: 0, opacity: 75 }, color: style.glow }] } : {}) })];
    case 'flame':
      return [motif('Flame', box, { shape: 'path', path: 'M 50 0 C 80 35 100 55 100 72 C 100 90 78 100 50 100 C 22 100 0 90 0 72 C 0 55 20 35 50 0 Z', fill: style.depth >= 1 ? vgrad(c2, style.color) : style.color, ...d })];
    case 'mountain': {
      const peaks = 3 + Math.floor(rand() * 3);
      let p = 'M 0 100 L 0 70';
      for (let i = 0; i < peaks; i++) {
        const x = ((i + 0.5) / peaks) * 100;
        p += ` L ${n2(x)} ${n2(8 + rand() * 40)} L ${n2(((i + 1) / peaks) * 100)} ${n2(55 + rand() * 25)}`;
      }
      return [motif('Ridge', box, { shape: 'path', path: `${p} L 100 100 Z`, fill: style.color, ...d })];
    }
    case 'block': {
      const out: Node[] = [];
      const k = 5 + Math.floor(rand() * 4);
      const bw = box.w / k;
      for (let i = 0; i < k; i++) {
        const bh = box.h * (0.35 + rand() * 0.65);
        out.push(motif('Block', { x: box.x + i * bw, y: box.y + box.h - bh, w: bw * 0.92, h: bh }, { shape: 'rect', fill: i % 3 === 1 ? c2 : style.color, ...d }));
      }
      return out;
    }
    case 'line': {
      // fine parallel lines: a technical rule set
      const out: Node[] = [];
      const k = 5 + Math.floor(rand() * 4);
      const th = Math.max(0.6, Math.min(box.w, box.h) * 0.008);
      for (let i = 0; i < k; i++) out.push(motif('Line', { x: box.x, y: box.y + (box.h / k) * i, w: box.w * (0.45 + rand() * 0.55), h: th }, { shape: 'rect', fill: style.color, opacity: 0.85, ...(style.glow ? { effects: [{ kind: 'glow', on: true, params: { size: 6, spread: 0, opacity: 70 }, color: style.glow }] } : {}) }));
      return out;
    }
    case 'grid': {
      // a floor in perspective: rails converging on a vanishing point above the horizon, rungs closing up with distance
      const out: Node[] = [];
      const th = Math.max(0.8, box.h * 0.012);
      const glow = style.glow ? { effects: [{ kind: 'glow', on: true, params: { size: 8, spread: 0, opacity: 70 }, color: style.glow }] } : {};
      const rails = 9;
      let p = '';
      for (let i = 0; i <= rails; i++) {
        const xb = -40 + (180 / rails) * i;
        p += `M 50 0 L ${n2(xb)} 100 `;
      }
      out.push(motif('Floor rails', box, { shape: 'path', path: p.trim(), fill: null, stroke: { color: style.color, width: th }, opacity: 0.9, ...glow }));
      for (let j = 1; j <= 6; j++) {
        const t = (j / 6) ** 1.8;
        out.push(motif('Floor rung', { x: box.x, y: box.y + box.h * t, w: box.w, h: th }, { shape: 'rect', fill: style.color, opacity: 0.35 + t * 0.55, ...glow }));
      }
      out.push(motif('Horizon', { x: box.x, y: box.y, w: box.w, h: th * 1.5 }, { shape: 'rect', fill: style.color2 ?? style.color, ...glow }));
      return out;
    }
    case 'none':
      return [];
  }
}

/** A smooth closed path through points (Catmull-Rom as cubic Béziers), in the 0–100 box. */
export function smoothClosed(pts: Pt[]): string {
  const n = pts.length;
  let d = `M ${n2(pts[0].x)} ${n2(pts[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = { x: clamp(p1.x + (p2.x - p0.x) / 6, 0, 100), y: clamp(p1.y + (p2.y - p0.y) / 6, 0, 100) };
    const c2 = { x: clamp(p2.x - (p3.x - p1.x) / 6, 0, 100), y: clamp(p2.y - (p3.y - p1.y) / 6, 0, 100) };
    d += ` C ${n2(c1.x)} ${n2(c1.y)} ${n2(c2.x)} ${n2(c2.y)} ${n2(p2.x)} ${n2(p2.y)}`;
  }
  return `${d} Z`;
}

// ── where forms go ──

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where each kind of form wants to be: clouds float high, waves and ridges sit on the foot, leaves frame the edges. */
const ZONE: Record<FormKind, 'sky' | 'foot' | 'edge' | 'field' | 'centre'> = {
  cloud: 'sky',
  organic: 'field',
  wave: 'foot',
  leaf: 'edge',
  orb: 'field',
  sparkle: 'field',
  line: 'edge',
  grid: 'foot',
  mountain: 'foot',
  block: 'foot',
  ring: 'field',
  petal: 'edge',
  flame: 'foot',
  snow: 'field',
  drop: 'field',
  sun: 'sky',
  none: 'field',
};

const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Boxes for `count` forms of a kind on a board of size W×H, kept off the boxes to avoid (the words, the logo, pictures):
 * the best of many seeded candidates each time, scored by what they cover, what they crowd and where the kind wants
 * to be. Bands (waves, ridges, skylines, grids) take the width of the foot.
 */
export function placeForms(kind: FormKind, W: number, H: number, avoid: readonly Rect[], count: number, scale: number, seed: number): FormBox[] {
  const rand = rng(seed * 7 + 3);
  const zone = ZONE[kind];
  const out: FormBox[] = [];
  if (kind === 'none' || count <= 0) return out;
  const unit = Math.min(W, H);
  if (kind === 'grid') return [{ x: -W * 0.02, y: H * 0.68, w: W * 1.04, h: H * 0.34, far: 0.1 }];
  if (zone === 'foot') {
    const layers = Math.max(1, Math.min(3, count));
    // the bands rise no higher than the lowest words, when there is room beneath them
    const lowest = avoid.reduce((m, b) => (b.y + b.h > H * 0.45 ? Math.max(m, b.y + b.h) : m), 0);
    const room = lowest ? H - lowest : H;
    const cap = room >= H * 0.08 ? room / H : 1;
    for (let i = 0; i < layers; i++) {
      const hh = H * Math.min(cap * (1 - i * 0.18), (0.16 + i * 0.06) * clamp(scale, 0.5, 1.8));
      out.push({ x: -W * 0.02, y: H - hh + H * 0.02 * i, w: W * 1.04, h: hh, far: layers > 1 ? 1 - i / (layers - 1) : 0.2 });
    }
    // far bands first, so the near one is drawn over them
    return out.sort((p, q) => q.far - p.far);
  }
  if (zone === 'centre' || kind === 'sun') {
    const s = unit * 0.36 * clamp(scale, 0.5, 1.8);
    const free = clearSpot(W, H, s, s, avoid, out, rand, 'sky');
    return free ? [{ ...free, far: 0.6 }] : [];
  }
  for (let i = 0; i < count; i++) {
    const far = count > 1 ? i / (count - 1) : 0.3;
    const sizeK = (kind === 'sparkle' || kind === 'snow' || kind === 'drop' ? 0.08 : kind === 'cloud' ? 0.42 : kind === 'leaf' || kind === 'petal' ? 0.2 : 0.3) * clamp(scale, 0.4, 2) * (1 - far * 0.45) * (0.85 + rand() * 0.3);
    const w = unit * sizeK * (kind === 'cloud' ? 1.5 : 1);
    const h = kind === 'cloud' ? w * 0.5 : kind === 'leaf' ? w * 1.6 : w;
    const spot = clearSpot(W, H, w, h, avoid, out, rand, zone);
    if (spot) out.push({ ...spot, far });
  }
  // a composition with no clear room: the forms go behind the words, faint, as the atmosphere they sit in (the
  // rendered result is then checked for legibility, and repaired if a word would not read)
  if (!out.length) {
    for (let i = 0; i < Math.min(count, 3); i++) {
      const w = unit * (kind === 'cloud' ? 0.63 : kind === 'sparkle' || kind === 'snow' || kind === 'drop' ? 0.1 : 0.32) * clamp(scale, 0.4, 2) * (0.8 + rand() * 0.3);
      const h = kind === 'cloud' ? w * 0.5 : kind === 'leaf' ? w * 1.6 : w;
      out.push({ ...bestSpot(W, H, w, h, avoid, out, rand, zone), far: 0.7 + i * 0.1, behind: true });
    }
  }
  // far forms first (drawn beneath)
  return out.sort((p, q) => q.far - p.far);
}

/**
 * A place for a form that stays off the words: the best spot at its size, else at a smaller size, else none — a
 * crowded layout gets fewer or smaller forms, never forms beneath its words.
 */
function clearSpot(W: number, H: number, w: number, h: number, avoid: readonly Rect[], placed: readonly Rect[], rand: () => number, zone: string): Rect | null {
  for (let k = 1; k > 0.4; k *= 0.8) {
    const r = bestSpot(W, H, w * k, h * k, avoid, placed, rand, zone);
    const covered = avoid.reduce((sum, b) => sum + overlap(r, b), 0) / (r.w * r.h);
    if (covered <= 0.02) return r;
  }
  return null;
}

function bestSpot(W: number, H: number, w: number, h: number, avoid: readonly Rect[], placed: readonly Rect[], rand: () => number, zone: string): Rect {
  let best: Rect = { x: (W - w) / 2, y: (H - h) / 2, w, h };
  let bestScore = Infinity;
  for (let k = 0; k < 60; k++) {
    // a little past the edges is allowed: forms may run off the frame, the words never do
    const x = -w * 0.25 + rand() * (W - w * 0.5);
    const yBias = zone === 'sky' ? rand() * rand() : zone === 'edge' ? (rand() < 0.5 ? rand() * 0.25 : 0.75 + rand() * 0.25) : rand();
    const y = -h * 0.2 + yBias * (H - h * 0.6);
    const r = { x, y, w, h };
    const covered = avoid.reduce((s, b) => s + overlap(r, b), 0) / (w * h);
    const crowded = placed.reduce((s, b) => s + overlap(r, b), 0) / (w * h);
    const edgeLove = zone === 'edge' ? Math.min(x, W - x - w, y, H - y - h) / Math.min(W, H) : 0;
    const score = covered * 10 + crowded * 2.5 + edgeLove * 1.5 + rand() * 0.05;
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}
