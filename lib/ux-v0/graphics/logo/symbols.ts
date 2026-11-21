// lib/ux-v0/graphics/logo/symbols.ts — symbols constructed, never chosen from a library: twenty-five construction
// methods (convergence, interlock, a letter built of modules, a letter cut from a solid, a monogram, radial repetition,
// a fold, strata, an orbit, a split, a grid with one cell apart, a wave, an organic form, a spiral, angles, an emblem,
// a mascot, a bridge, a single traced line, steps, an aperture, a seed, a letter symbol, pixels, a frame broken open),
// each a parametric procedure: the same method with other parameters is another mark. Each says what it can mean (so
// a concept can be argued from the brief), its geometry and its traits; the clichés a method could fall into are
// declared so a brief's avoid list can refuse it. After building, a mark is refined optically: fitted, its visual
// centre placed a touch above the middle, and strokes thickened until the mark survives at 32 px.

import { rng, ribbonOutline, type Rng } from '../generative/util';
import { arcNodes, type BezierPath } from '../geometry';
import {
  arc,
  bar,
  boundsOfParts,
  circle,
  fitMark,
  halfPlane,
  intersect,
  join,
  leaf,
  line,
  mapMark,
  path,
  pebble,
  polar,
  polygon,
  rect,
  ring,
  rotate,
  S,
  scaleAbout,
  sector,
  smooth,
  squircleOf,
  strokeArea,
  subtract,
  translate,
  type Mark,
  type MarkPart,
  type P2,
  type PartStroke,
} from './geom';
import { counterOf, glyphOf, sidesOf, type LetteringStyle } from './glyphs';
import { centroid, inkOf, rasterize, survivalAt } from './raster';

import { METHOD_IDS, type MethodId } from './constants';
export { METHOD_IDS, type MethodId };
export type Geometry = 'geometric' | 'organic' | 'typographic' | 'modular' | 'pictorial';

export interface MarkCtx {
  r: Rng;
  name: string;
  initials: string;
  /** the stroke weight for line-built marks, in mark units (60 fine … 170 heavy) */
  sw: number;
  /** 0 sharp corners … 1 round */
  soft: number;
  creature?: string;
  /** cliché ids to stay clear of */
  avoid: ReadonlySet<string>;
}

export interface MethodSpec {
  id: MethodId;
  label: string;
  geometry: Geometry;
  /** what the construction can stand for */
  meanings: readonly string[];
  /** the temperament it brings */
  traits: readonly string[];
  /** how it is built, said plainly */
  how: string;
  /** the cliché it could fall into in some industries */
  risk?: string;
  /** reads as a technology aesthetic */
  tech?: boolean;
  /** uses the brand's letters */
  letters?: boolean;
  build: (c: MarkCtx) => Mark;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const C: P2 = [S / 2, S / 2];
const strokeOf = (width: number, c: MarkCtx, join: 'round' | 'miter' = c.soft > 0.45 ? 'round' : 'miter'): PartStroke => ({ width: Math.round(width), cap: c.soft > 0.45 ? 'round' : 'square', join });
const style = (c: MarkCtx, weight: number, width = 1): LetteringStyle => ({ weight, width, tracking: 1, terminal: c.soft > 0.45 ? 'round' : 'square', join: c.soft > 0.45 ? 'round' : 'miter', slant: 0 });
const mk = (method: MethodId, parts: MarkPart[], params: Mark['params'], notes: string[] = []): Mark => ({ method, parts, params, notes });
/** A ray from a point outward (a half bar), for parallel gaps between slices. */
const ray = (deg: number, w: number, from: P2 = C, len = 900) => bar(from[0] + Math.cos((deg * Math.PI) / 180) * (len / 2), from[1] + Math.sin((deg * Math.PI) / 180) * (len / 2), deg, w, len / 2);
/** A letter's centrelines placed with its box centred on a point, at cap height h; and its width and stroke. */
function letterAt(ch: string, c: MarkCtx, weight: number, h: number, at: P2 = C, width = 1) {
  const g = glyphOf(ch, style(c, weight, width), h) ?? glyphOf('O', style(c, weight, width), h)!;
  const p = translate(g.path, at[0] - g.w / 2, at[1] - h / 2);
  return { path: p, w: g.w, h, sw: weight * h, dots: g.dots.map(([x, y]) => [x + at[0] - g.w / 2, y + at[1] - h / 2] as P2) };
}
const squircle = squircleOf;
function archShape(x: number, y: number, w: number, h: number): BezierPath {
  const r = w / 2;
  return path({ closed: true, nodes: [{ x, y: y + h }, { x: x + w, y: y + h }, ...arcNodes(x + r, y + r, r, r, 0, -Math.PI)] });
}

/** The cells of a coarse grid a letter covers (for modular and pixel letters). */
function letterCells(ch: string, c: MarkCtx, rows: number): { cols: number; on: boolean[][] } {
  const g = glyphOf(ch, style(c, 0.22), 1000) ?? glyphOf('O', style(c, 0.22), 1000)!;
  const cols = clamp(Math.round(rows * (g.w / 1000) * 1.05), 3, rows + 2);
  const segs: [P2, P2][] = [];
  for (const s of g.path.subpaths) {
    const pts: P2[] = [];
    for (let i = 0; i < s.nodes.length; i++) {
      const a = s.nodes[i];
      const b = s.nodes[(i + 1) % s.nodes.length];
      if (i === s.nodes.length - 1 && !s.closed) break;
      const p0: P2 = [a.x, a.y];
      const p1: P2 = a.out ?? p0;
      const p3: P2 = [b.x, b.y];
      const p2: P2 = b.in ?? p3;
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        const u = 1 - t;
        pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
      }
    }
    for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
  }
  const on: boolean[][] = [];
  for (let j = 0; j < rows; j++) {
    on.push([]);
    for (let i = 0; i < cols; i++) {
      const x = ((i + 0.5) / cols) * g.w;
      const y = ((j + 0.5) / rows) * 1000;
      let near = Infinity;
      for (const [a, b] of segs) {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const L2 = dx * dx + dy * dy || 1;
        const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / L2, 0, 1);
        near = Math.min(near, Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t)));
      }
      on[j].push(near <= Math.max(1000 / rows, g.w / cols) * 0.5);
    }
  }
  return { cols, on };
}

// ── the methods ──

const convergence = (c: MarkCtx): Mark => {
  const n = c.r.pick([3, 4, 5]);
  const outline = c.r.pick(['disc', 'square'] as const);
  const mode = c.r.pick(['cut', 'explode'] as const);
  const hub = c.r.between(40, 100);
  const gap = Math.max(34, c.sw * 0.42);
  const turn = c.r.between(0, 360 / n);
  const accent = c.r.chance(0.5) ? c.r.int(0, n - 1) : -1;
  const parts: MarkPart[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = turn + (i * 360) / n;
    const a1 = a0 + 360 / n;
    let slice = outline === 'disc' ? sector(500, 500, 400, a0, a1) : intersect(sector(500, 500, 700, a0, a1), rect(110, 110, 780, 780, c.soft * 120));
    let cuts: BezierPath[] | undefined = [ray(a0, gap), ray(a1, gap), circle(500, 500, hub)];
    if (mode === 'explode') {
      const mid = ((a0 + a1) / 2) * (Math.PI / 180);
      slice = translate(slice, Math.cos(mid) * gap * 0.8, Math.sin(mid) * gap * 0.8);
      cuts = undefined;
    }
    parts.push({ name: `Slice ${i + 1}`, path: slice, ...(cuts ? { cuts } : {}), tone: i === accent ? 2 : 0 });
  }
  return mk('convergence', parts, { n, outline, mode, hub: Math.round(hub), turn: Math.round(turn) });
};

const interlock = (c: MarkCtx): Mark => {
  const R = 230;
  const w = clamp(c.sw * 1.05, 70, 150);
  const d = R * c.r.between(0.55, 0.82);
  const axis = c.r.pick([0, 0, 45, 90, -30]);
  const open = c.r.chance(0.2);
  const gap = w * 0.34;
  const rc = R - w / 2;
  const ca: P2 = [500 - d, 500];
  const cb: P2 = [500 + d, 500];
  const h = Math.sqrt(Math.max(1, rc * rc - d * d));
  const top: P2 = [500, 500 - h];
  const bottom: P2 = [500, 500 + h];
  const around = (p: P2) => rect(p[0] - w * 1.4, p[1] - w * 1.4, w * 2.8, w * 2.8);
  const bandA = ring(ca[0], ca[1], R + gap, w + gap * 2);
  const bandB = ring(cb[0], cb[1], R + gap, w + gap * 2);
  let ringA = ring(ca[0], ca[1], R, w);
  if (open) ringA = subtract(ringA, sector(ca[0], ca[1], R + 10, 150, 210));
  const ringB = ring(cb[0], cb[1], R, w);
  const parts: MarkPart[] = [
    { name: 'Link A', path: ringA, cuts: [intersect(bandB, around(top))], tone: 0 },
    { name: 'Link B', path: ringB, cuts: [intersect(bandA, around(bottom))], tone: c.r.chance(0.5) ? 1 : 0 },
  ];
  const turned = parts.map((p) => ({ ...p, path: rotate(p.path, axis), cuts: p.cuts?.map((q) => rotate(q, axis)) }));
  return mk('interlock', turned, { offset: Math.round(d), axis, open, weight: Math.round(w) });
};

const modular = (c: MarkCtx): Mark => {
  const ch = c.initials[0] ?? 'S';
  const rows = c.r.pick([5, 5, 7]);
  const { cols, on } = letterCells(ch, c, rows);
  const cell = 760 / Math.max(rows, cols);
  const gut = c.r.pick([0, cell * 0.08, cell * 0.14]);
  const x0 = 500 - (cols * cell) / 2;
  const y0 = 500 - (rows * cell) / 2;
  const at = (i: number, j: number) => j >= 0 && j < rows && i >= 0 && i < cols && on[j][i];
  const mods: BezierPath[] = [];
  const ends: BezierPath[] = [];
  const s = (cell - gut) / cell;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      if (!on[j][i]) continue;
      const x = x0 + i * cell;
      const y = y0 + j * cell;
      const N = at(i, j - 1);
      const E = at(i + 1, j);
      const So = at(i, j + 1);
      const W = at(i - 1, j);
      const count = +N + +E + +So + +W;
      let m: BezierPath;
      if (!N && !W && E && So) m = sector(x + cell, y + cell, cell, 180, 270);
      else if (!N && !E && W && So) m = sector(x, y + cell, cell, 270, 360);
      else if (!So && !E && W && N) m = sector(x, y, cell, 0, 90);
      else if (!So && !W && E && N) m = sector(x + cell, y, cell, 90, 180);
      else if (count === 0) m = circle(x + cell / 2, y + cell / 2, cell / 2);
      else m = rect(x, y, cell, cell, c.soft * cell * 0.18);
      m = scaleAbout(m, s, s, [x + cell / 2, y + cell / 2]);
      (count === 1 && c.r.chance(0.18) && !ends.length ? ends : mods).push(m);
    }
  const parts: MarkPart[] = [{ name: `Modules of ${ch}`, path: join(...mods), tone: 0 }];
  if (ends.length) parts.push({ name: 'Accent module', path: join(...ends), tone: 2 });
  return mk('modular', parts, { letter: ch, rows, cols, gutter: Math.round(gut) });
};

const negative = (c: MarkCtx): Mark => {
  const ch = c.initials[0] ?? 'S';
  const container = c.r.pick(['circle', 'squircle', 'arch', 'square'] as const);
  const weight = c.r.between(0.15, 0.23);
  const lh = c.r.between(400, 520);
  const place = c.r.pick(['centre', 'centre', 'low', 'bleed'] as const);
  const at: P2 = place === 'low' ? [500, 560] : place === 'bleed' ? [560, 520] : [500, 500];
  const L = letterAt(ch, c, weight, place === 'bleed' ? lh * 1.25 : lh, at, c.r.between(0.92, 1.12));
  const cutter = strokeArea(L.path, L.sw);
  const base = container === 'circle' ? circle(500, 500, 400) : container === 'squircle' ? squircle(500, 500, 400) : container === 'arch' ? archShape(130, 100, 740, 800) : rect(110, 110, 780, 780, c.soft * 110);
  return mk('negative', [{ name: 'Container', path: base, cuts: [cutter], tone: 0 }], { letter: ch, container, weight: Math.round(weight * 100) / 100, place });
};

const monogram = (c: MarkCtx): Mark => {
  const letters = (c.initials.length >= 2 ? c.initials : `${c.initials}${c.name.replace(/[^A-Za-z]/g, '').toUpperCase()[1] ?? c.initials}`).slice(0, 2);
  const [a, b] = [letters[0], letters[1] ?? letters[0]];
  const weight = c.r.between(0.1, 0.17);
  const h = 560;
  const st = style(c, weight, c.r.between(0.86, 1.08));
  const ga = glyphOf(a, st, h) ?? glyphOf('O', st, h)!;
  const gb = glyphOf(b, st, h) ?? glyphOf('O', st, h)!;
  const sw = weight * h;
  const share = sidesOf(a)?.[1] === 'v' && sidesOf(b)?.[0] === 'v' && a !== b;
  const mode = share ? c.r.pick(['share', 'share', 'overlap'] as const) : c.r.pick(['overlap', 'stack'] as const);
  const enclosed = c.r.chance(0.35);
  let pa: BezierPath;
  let pb: BezierPath;
  if (mode === 'share') {
    const total = ga.w + gb.w - sw;
    pa = translate(ga.path, 500 - total / 2, 500 - h / 2);
    pb = translate(gb.path, 500 - total / 2 + ga.w - sw, 500 - h / 2);
  } else if (mode === 'stack') {
    pa = translate(ga.path, 500 - ga.w / 2 - h * 0.12, 500 - h * 0.62);
    pb = translate(gb.path, 500 - gb.w / 2 + h * 0.12, 500 - h * 0.38);
  } else {
    const ov = Math.min(ga.w, gb.w) * 0.42;
    const total = ga.w + gb.w - ov;
    pa = translate(ga.path, 500 - total / 2, 500 - h / 2);
    pb = translate(gb.path, 500 - total / 2 + ga.w - ov, 500 - h / 2);
  }
  const parts: MarkPart[] =
    mode === 'share'
      ? [
          { name: `Letter ${a}`, path: pa, stroke: strokeOf(sw, c), tone: 0 },
          { name: `Letter ${b}`, path: pb, stroke: strokeOf(sw, c), tone: c.r.chance(0.4) ? 1 : 0 },
        ]
      : [
          { name: `Letter ${a}`, path: strokeArea(pa, sw), cuts: [strokeArea(pb, sw + Math.max(30, sw * 0.6))], tone: 0 },
          { name: `Letter ${b}`, path: strokeArea(pb, sw), tone: 1 },
        ];
  if (enclosed) parts.push({ name: 'Enclosure', path: circle(500, 500, 450), stroke: strokeOf(sw * 0.45, c), tone: 0 });
  return mk('monogram', parts, { letters, mode, weight: Math.round(weight * 100) / 100, enclosed });
};

const radial = (c: MarkCtx): Mark => {
  const counts = c.avoid.has('hexagon') ? [5, 7, 8, 9, 10, 12] : [5, 6, 7, 8, 9, 12];
  const n = c.r.pick(counts);
  const kind = c.r.pick(['petal', 'bar', 'dot', 'tri', 'blade'] as const);
  const R = c.r.between(200, 280);
  const size = clamp((2 * Math.PI * R) / n, 120, 260);
  const twist = kind === 'bar' || kind === 'tri' ? c.r.pick([18, 32, -24, 40]) : c.r.pick([0, 0, 18, 32, -22]);
  const turn = c.r.between(0, 360 / n);
  const inner = c.r.chance(0.3);
  const accent = c.r.chance(0.45) ? c.r.int(0, n - 1) : -1;
  const mods: BezierPath[] = [];
  const acc: BezierPath[] = [];
  const ringOf = (count: number, radius: number, sz: number, off: number, main: boolean) => {
    for (let i = 0; i < count; i++) {
      const a = off + (i * 360) / count;
      const p = polar(500, 500, radius, a);
      let m: BezierPath;
      if (kind === 'petal') m = leaf(p[0], p[1], sz * 0.42, sz * 1.25, a + 90 + twist);
      else if (kind === 'bar') m = rotate(rect(p[0] - sz * 0.16, p[1] - sz * 0.62, sz * 0.32, sz * 1.24, sz * 0.16 * c.soft), a + 90 + twist, p);
      else if (kind === 'dot') m = circle(p[0], p[1], sz * (i % 2 && main ? 0.24 : 0.34));
      else if (kind === 'tri') {
        const q = (k: number, rr: number) => polar(p[0], p[1], rr, a + twist + k);
        m = polygon([q(0, sz * 0.6), q(130, sz * 0.42), q(230, sz * 0.42)], 18 * c.soft + 4);
      } else m = subtract(circle(p[0], p[1], sz * 0.5), circle(...polar(p[0], p[1], sz * 0.26, a + 90 + twist), sz * 0.46));
      (main && i === accent ? acc : mods).push(m);
    }
  };
  ringOf(n, R, size, turn, true);
  if (inner) ringOf(n, R * 0.48, size * 0.5, turn + 180 / n, false);
  const parts: MarkPart[] = [];
  if (mods.length) parts.push({ name: 'Ring of forms', path: join(...mods), tone: 0 });
  if (acc.length) parts.push({ name: 'Accent form', path: join(...acc), tone: 2 });
  return mk('radial', parts, { n, kind, radius: Math.round(R), twist, inner });
};

const fold = (c: MarkCtx): Mark => {
  const v = c.r.pick(['elbow', 'ribbon', 'facets'] as const);
  const gap = Math.max(26, c.sw * 0.3);
  if (v === 'elbow') {
    // a band rising, then folded over to run across: the fold a triangle of its back
    const wb = clamp(c.sw * 1.7, 120, 220);
    const x0 = c.r.between(150, 230);
    const top = c.r.between(150, 230);
    const up = polygon([
      [x0, 880],
      [x0 + wb, 880],
      [x0 + wb, top + wb + gap],
      [x0, top + gap * 0.2],
    ]);
    const across = polygon([
      [x0 + wb + gap * 0.6, top],
      [880, top],
      [880, top + wb],
      [x0 + wb + gap * 0.6, top + wb],
    ]);
    const crease = polygon([
      [x0, top],
      [x0 + wb, top],
      [x0 + wb, top + wb],
    ]);
    return mk(
      'fold',
      [
        { name: 'Rising band', path: up, tone: 0 },
        { name: 'Band across', path: across, tone: 0 },
        { name: 'Fold', path: crease, tone: 1 },
      ],
      { variant: v, band: Math.round(wb) },
    );
  }
  if (v === 'ribbon') {
    const wb = clamp(c.sw * 1.5, 110, 200);
    const peak = c.r.between(150, 260);
    const left = polygon([
      [140, 880],
      [140 + wb, 880],
      [500, peak + wb * 1.15],
      [500, peak],
    ]);
    const right = polygon([
      [500 + gap * 0.5, peak + gap],
      [860, 880],
      [860 - wb, 880],
      [500 + gap * 0.5, peak + wb * 1.15 + gap],
    ]);
    const crease = polygon([
      [500, peak],
      [500, peak + wb * 1.15],
      [500 + wb * 0.55, peak + wb * 0.5],
    ]);
    return mk(
      'fold',
      [
        { name: 'Rising band', path: left, tone: 0 },
        { name: 'Falling band', path: right, tone: 0 },
        { name: 'Fold', path: crease, tone: 1 },
      ],
      { variant: v, band: Math.round(wb), peak: Math.round(peak) },
    );
  }
  const k = c.r.int(4, 6);
  const pts: P2[] = [];
  for (let i = 0; i < k; i++) pts.push(polar(500, 500, c.r.between(300, 420), -90 + (i * 360) / k + c.r.between(-14, 14)));
  const centre: P2 = [500 + c.r.between(-60, 60), 500 + c.r.between(-60, 60)];
  const facets = pts.map((p, i) => polygon([centre, p, pts[(i + 1) % k]]));
  const shrink = (q: BezierPath, i: number) => {
    const a = pts[i];
    const b = pts[(i + 1) % k];
    const cx = (centre[0] + a[0] + b[0]) / 3;
    const cy = (centre[1] + a[1] + b[1]) / 3;
    return scaleAbout(q, 0.93, 0.93, [cx, cy]);
  };
  return mk(
    'fold',
    facets.map((f, i) => ({ name: `Facet ${i + 1}`, path: shrink(f, i), tone: i % 2 ? 1 : 0 })),
    { variant: v, facets: k },
  );
};

const strata = (c: MarkCtx): Mark => {
  const k = c.r.int(3, 6);
  const rhythm = c.r.pick(['even', 'thick-thin', 'growing'] as const);
  const unit = 720 / (k * 1.38);
  const heights = Array.from({ length: k }, (_, i) => (rhythm === 'even' ? unit : rhythm === 'thick-thin' ? (i % 2 ? unit * 0.55 : unit * 1.35) : unit * (0.55 + (i / Math.max(1, k - 1)) * 0.9)));
  const gap = unit * 0.36;
  const profile = c.r.pick(['hill', 'rise', 'wave', 'shift', 'letter'] as const);
  const align = c.r.pick(['left', 'centre', 'right'] as const);
  const ends = c.soft > 0.45 ? 'round' : c.r.pick(['square', 'angled'] as const);
  const phase = c.r.between(0, Math.PI * 2);
  const cells = profile === 'letter' ? letterCells(c.initials[0] ?? 'S', c, k) : null;
  const bands: BezierPath[] = [];
  let accent: BezierPath | null = null;
  const accentAt = c.r.chance(0.45) ? c.r.int(0, k - 1) : -1;
  const total = heights.reduce((s2, h) => s2 + h, 0) + gap * (k - 1);
  let y = 500 - total / 2;
  for (let i = 0; i < k; i++) {
    const t = k > 1 ? i / (k - 1) : 0.5;
    const bh = heights[i];
    let len = profile === 'hill' ? 300 + 500 * Math.sin(Math.PI * (0.15 + t * 0.7)) : profile === 'rise' ? 260 + 540 * t : profile === 'wave' ? 480 + 300 * Math.sin(Math.PI * 2 * t + phase) : 520;
    let x = align === 'left' ? 110 : align === 'right' ? 890 - len : 500 - len / 2;
    if (profile === 'shift') x = 110 + (380 - 0) * (0.5 + 0.5 * Math.sin(Math.PI * 1.5 * t + phase)) * 0.9;
    if (cells) {
      // a letter in stripes: each band spans the cells its row covers
      const row = cells.on[i];
      const first = row.indexOf(true);
      const last = row.lastIndexOf(true);
      const cw = 780 / cells.cols;
      if (first < 0) {
        y += bh + gap;
        continue;
      }
      x = 110 + first * cw;
      len = (last - first + 1) * cw;
    }
    const b =
      ends === 'angled'
        ? polygon([
            [x + bh * 0.5, y],
            [x + len, y],
            [x + len - bh * 0.5, y + bh],
            [x, y + bh],
          ])
        : rect(x, y, len, bh, ends === 'round' ? bh / 2 : c.soft * 20);
    if (i === accentAt) accent = b;
    else bands.push(b);
    y += bh + gap;
  }
  const parts: MarkPart[] = [{ name: 'Strata', path: join(...bands), tone: 0 }];
  if (accent) parts.push({ name: 'Accent stratum', path: accent, tone: 2 });
  return mk('strata', parts, { bands: k, profile, align, rhythm, ends });
};

const orbit = (c: MarkCtx): Mark => {
  const v = c.r.pick(['satellite', 'embrace', 'eclipse'] as const);
  if (v === 'eclipse') {
    const off = c.r.between(150, 230);
    const ang = c.r.between(-60, 30);
    const p = polar(500, 500, off, ang);
    const gap = Math.max(26, c.sw * 0.35);
    return mk(
      'orbit',
      [
        { name: 'Body', path: circle(500, 500, 330), cuts: [circle(p[0], p[1], 260 + gap)], tone: 0 },
        { name: 'Passing body', path: circle(p[0], p[1], 260), tone: c.r.chance(0.5) ? 1 : 2 },
      ],
      { variant: v, offset: Math.round(off), angle: Math.round(ang) },
    );
  }
  const core = c.r.between(150, 230);
  const R = core + c.r.between(110, 170);
  const a0 = c.r.between(-200, -90);
  const span = c.r.between(200, 290);
  const parts: MarkPart[] = [
    { name: 'Centre', path: circle(500, 500, core), tone: 0 },
    { name: 'Orbit', path: arc(500, 500, R, a0, a0 + span), stroke: strokeOf(c.sw * 0.85, c), tone: 0 },
  ];
  if (v === 'satellite') {
    const p = polar(500, 500, R, a0 + span + 24);
    parts.push({ name: 'Satellite', path: circle(p[0], p[1], c.sw * 0.7), tone: 2 });
  } else parts.push({ name: 'Second orbit', path: arc(500, 500, R + c.sw * 1.7, a0 + 180, a0 + 180 + span * 0.7), stroke: strokeOf(c.sw * 0.6, c), tone: 1, detail: true });
  return mk('orbit', parts, { variant: v, core: Math.round(core), radius: Math.round(R), span: Math.round(span) });
};

const split = (c: MarkCtx): Mark => {
  const base = c.r.pick(['circle', 'square', 'triangle', 'letter'] as const);
  const angle = c.r.between(-55, 55) + c.r.pick([0, 90]);
  const shift = c.r.between(50, 120);
  const gap = Math.max(30, c.sw * 0.36);
  const shape =
    base === 'circle'
      ? circle(500, 500, 380)
      : base === 'square'
        ? rect(130, 130, 740, 740, c.soft * 90)
        : base === 'triangle'
          ? polygon(
              [
                [500, 120],
                [880, 840],
                [120, 840],
              ],
              40 * c.soft + 6,
            )
          : strokeArea(letterAt(c.initials[0] ?? 'S', c, 0.26, 640).path, 0.26 * 640);
  const d: P2 = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)];
  const nrm: P2 = [-d[1], d[0]];
  const a = translate(intersect(shape, halfPlane(500, 500, angle, 1)), (d[0] * shift) / 2 + (nrm[0] * gap) / 2, (d[1] * shift) / 2 + (nrm[1] * gap) / 2);
  const b = translate(intersect(shape, halfPlane(500, 500, angle, -1)), (-d[0] * shift) / 2 - (nrm[0] * gap) / 2, (-d[1] * shift) / 2 - (nrm[1] * gap) / 2);
  return mk(
    'split',
    [
      { name: 'First half', path: a, tone: 0 },
      { name: 'Second half', path: b, tone: c.r.chance(0.5) ? 1 : 0 },
    ],
    { base, angle: Math.round(angle), shift: Math.round(shift) },
  );
};

const grid = (c: MarkCtx): Mark => {
  const g = c.r.pick([3, 3, 4]);
  const cell = 720 / g;
  const size = cell * c.r.between(0.7, 0.84);
  const module = c.r.pick(['square', 'dot', 'square'] as const);
  const special = c.r.int(0, g * g - 1);
  const kind = c.r.pick(['out', 'turned', 'shape', 'missing'] as const);
  const mods: BezierPath[] = [];
  let sp: BezierPath | null = null;
  const draw = (cx: number, cy: number, sh: 'square' | 'dot', s = size) => (sh === 'dot' ? circle(cx, cy, s / 2) : rect(cx - s / 2, cy - s / 2, s, s, c.soft * s * 0.2));
  for (let j = 0; j < g; j++)
    for (let i = 0; i < g; i++) {
      const cx = 140 + (i + 0.5) * cell;
      const cy = 140 + (j + 0.5) * cell;
      if (j * g + i !== special) {
        mods.push(draw(cx, cy, module));
        continue;
      }
      if (kind === 'out') sp = draw(cx + cell * 0.38, cy - cell * 0.38, module);
      else if (kind === 'turned') sp = rotate(draw(cx, cy, 'square', size * 0.86), 45, [cx, cy]);
      else if (kind === 'shape') sp = draw(cx, cy, module === 'dot' ? 'square' : 'dot');
    }
  const parts: MarkPart[] = [{ name: 'Grid', path: join(...mods), tone: 0 }];
  if (sp) parts.push({ name: 'The cell apart', path: sp, tone: 2 });
  return mk('grid', parts, { size: g, module, special, kind });
};

const wave = (c: MarkCtx): Mark => {
  const base = c.r.pick(['circle', 'square', 'arch'] as const);
  const count = c.r.int(1, 3);
  const amp = c.r.between(30, 80);
  const freq = c.r.pick([1, 1.5, 2]);
  const tilt = c.r.pick([0, 0, -18, 16]);
  const phase = c.r.between(0, Math.PI * 2);
  const gap = Math.max(30, c.sw * 0.42);
  const spacing = 160;
  const cuts: BezierPath[] = [];
  for (let i = 0; i < count; i++) {
    const y = 500 + (i - (count - 1) / 2) * spacing;
    const pts: P2[] = [];
    for (let x = -60; x <= 1060; x += 20) pts.push([x, y + amp * Math.sin((x / 1000) * Math.PI * 2 * freq + phase + i * 0.7)]);
    cuts.push(rotate(strokeArea(line(pts), gap), tilt));
  }
  const shape = base === 'circle' ? circle(500, 500, 400) : base === 'square' ? rect(110, 110, 780, 780, c.soft * 110) : archShape(130, 100, 740, 800);
  return mk('wave', [{ name: 'Body', path: shape, cuts, tone: 0 }], { base, waves: count, amplitude: Math.round(amp), frequency: freq, tilt });
};

const organic = (c: MarkCtx): Mark => {
  const n = c.r.int(6, 9);
  const wob = c.r.between(0.07, 0.17);
  const v = c.r.pick(['counter', 'pair', 'seed'] as const);
  const main = pebble(500, 500, 370, 340, wob, n, c.r, c.r.between(0, 60));
  if (v === 'counter') {
    const hole = pebble(500 + c.r.between(-90, 90), 500 + c.r.between(-90, 40), c.r.between(90, 150), c.r.between(80, 140), wob, n, c.r);
    return mk('organic', [{ name: 'Form', path: main, cuts: [hole], tone: 0 }], { variant: v, points: n, wobble: Math.round(wob * 100) / 100 });
  }
  if (v === 'pair') {
    const small = pebble(690, 330, 170, 150, wob, n, c.r);
    const gap = Math.max(28, c.sw * 0.34);
    return mk(
      'organic',
      [
        { name: 'Large form', path: scaleAbout(main, 0.82, 0.82, [440, 560]), cuts: [scaleAbout(small, 1 + gap / 160, 1 + gap / 160, [690, 330])], tone: 0 },
        { name: 'Small form', path: small, tone: 1 },
      ],
      { variant: v, points: n },
    );
  }
  return mk('organic', [{ name: 'Form', path: main, cuts: [leaf(520, 500, 110, 300, c.r.between(-30, 30))], tone: 0 }], { variant: v, points: n });
};

const spiral = (c: MarkCtx): Mark => {
  const v = c.r.pick(['ribbon', 'ribbon', 'square'] as const);
  const turns = c.r.between(1.3, 2.2);
  if (v === 'square') {
    const pts: P2[] = [[500, 500]];
    let len = 80;
    let dir = 0;
    let p: P2 = [500, 500];
    const step = clamp(c.sw * 1.6, 110, 170);
    for (let i = 0; i < Math.round(turns * 4) + 2; i++) {
      const a = (dir * Math.PI) / 2;
      p = [p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len];
      pts.push(p);
      dir = (dir + 1) % 4;
      len += step / 2;
    }
    return mk('spiral', [{ name: 'Spiral', path: line(pts), stroke: strokeOf(c.sw * 0.85, c, 'miter'), tone: 0 }], { variant: v, turns: Math.round(turns * 10) / 10 });
  }
  const pts: P2[] = [];
  const N = 90;
  const T = turns * Math.PI * 2;
  const b = 360 / T;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * T;
    pts.push([500 + Math.cos(t) * (24 + b * t), 500 + Math.sin(t) * (24 + b * t)]);
  }
  const outline = ribbonOutline(pts, (t) => c.sw * (0.3 + t * 1.1));
  const thin = outline.filter((_, i) => i % 2 === 0);
  return mk('spiral', [{ name: 'Spiral', path: smooth(thin, true, 0.9), tone: 0 }], { variant: v, turns: Math.round(turns * 10) / 10 });
};

const angle = (c: MarkCtx): Mark => {
  const v = c.r.pick(['zig', 'rising', 'folded'] as const);
  const sw = clamp(c.sw, 70, 160);
  if (v === 'zig') {
    // an asymmetric zigzag, ending in a dot: a path with a destination
    const k = c.r.int(2, 3);
    const pts: P2[] = [];
    let x = 160;
    for (let i = 0; i <= k; i++) {
      pts.push([x, i % 2 ? c.r.between(240, 320) : c.r.between(660, 760)]);
      x += c.r.between(170, 260);
    }
    const end = pts[pts.length - 1];
    return mk(
      'angle',
      [
        { name: 'Zigzag', path: line(pts), stroke: strokeOf(sw, c), tone: 0 },
        { name: 'Destination', path: circle(Math.min(880, end[0] + sw * 1.6), end[1] - sw * 1.2, sw * 0.72), tone: 2 },
      ],
      { variant: v, peaks: k },
    );
  }
  if (v === 'rising') {
    // parallel strokes of rising length from one baseline: momentum without an arrow
    const n = c.r.int(3, 4);
    const lean = c.r.between(18, 34);
    const parts: MarkPart[] = [];
    const pitch = sw * 1.75;
    for (let i = 0; i < n; i++) {
      const len = 260 + (i / Math.max(1, n - 1)) * 420;
      const x = 260 + i * pitch;
      const dx = Math.tan((lean * Math.PI) / 180) * len;
      parts.push({
        name: `Stroke ${i + 1}`,
        path: line([
          [x, 820],
          [x + dx, 820 - len],
        ]),
        stroke: strokeOf(sw, c),
        tone: i === n - 1 && c.r.chance(0.5) ? 2 : 0,
      });
    }
    return mk('angle', parts, { variant: v, strokes: n, lean: Math.round(lean) });
  }
  // one line folded back on itself at two angles (an N, a Z, a lightning of its own), cut where it crosses nothing
  const a = c.r.between(30, 60);
  const pts: P2[] = [
    [200, 820],
    [420, 200 + c.r.between(0, 80)],
    [600, 640 + c.r.between(-60, 60)],
    [820, 180 + c.r.between(0, 60)],
  ];
  return mk('angle', [{ name: 'Folded line', path: line(pts), stroke: strokeOf(sw, c, 'miter'), tone: 0 }], { variant: v, angle: Math.round(a) });
};

const emblem = (c: MarkCtx): Mark => {
  const inner = c.r.pick(['letter', 'radial', 'wave', 'strata'] as const);
  const sub = METHODS[inner].build({ ...c, r: c.r.fork('inner'), sw: c.sw * 0.9 });
  const fitted = fitMark(sub, 380);
  const t = c.name.toUpperCase();
  const parts: MarkPart[] = [
    { name: 'Outer ring', path: circle(500, 500, 460), stroke: strokeOf(Math.max(22, c.sw * 0.32), c), tone: 0 },
    { name: 'Inner ring', path: circle(500, 500, 305), stroke: strokeOf(Math.max(14, c.sw * 0.2), c), tone: 0, detail: true },
    { name: 'Ring text', path: circle(500, 500, 382), ringText: { text: t, cx: 500, cy: 500, r: 382, size: 70 }, tone: 0 },
    ...fitted.parts.map((p) => ({ ...p, name: `Centre: ${p.name}` })),
  ];
  return mk('emblem', parts, { inner, text: t });
};

const mascot = (c: MarkCtx): Mark => {
  const kind = c.creature ?? c.r.pick(['owl', 'fox', 'bear', 'cat', 'bird'] as const);
  const eye = (x: number, y: number, r: number) => circle(x, y, r);
  if (kind === 'owl') {
    const body = pebble(500, 540, 300, 360, 0.04, 8, c.r);
    const eyes = [ring(400, 450, 105, 40), ring(600, 450, 105, 40)];
    return mk(
      'mascot',
      [
        { name: 'Body', path: body, cuts: [circle(400, 450, 110), circle(600, 450, 110)], tone: 0 },
        {
          name: 'Ear tufts',
          path: join(
            polygon(
              [
                [260, 300],
                [330, 140],
                [390, 260],
              ],
              14,
            ),
            polygon(
              [
                [740, 300],
                [670, 140],
                [610, 260],
              ],
              14,
            ),
          ),
          tone: 0,
        },
        { name: 'Eyes', path: join(...eyes, eye(400, 450, 30), eye(600, 450, 30)), tone: 0 },
        {
          name: 'Beak',
          path: polygon(
            [
              [470, 530],
              [530, 530],
              [500, 600],
            ],
            10,
          ),
          tone: 2,
        },
      ],
      { creature: kind },
    );
  }
  if (kind === 'fox') {
    const head = polygon(
      [
        [180, 330],
        [500, 260],
        [820, 330],
        [500, 840],
      ],
      60 * c.soft + 20,
    );
    return mk(
      'mascot',
      [
        { name: 'Head', path: head, cuts: [leaf(390, 520, 60, 120, -30), leaf(610, 520, 60, 120, 30)], tone: 0 },
        {
          name: 'Ears',
          path: join(
            polygon(
              [
                [200, 340],
                [250, 120],
                [400, 290],
              ],
              16,
            ),
            polygon(
              [
                [800, 340],
                [750, 120],
                [600, 290],
              ],
              16,
            ),
          ),
          tone: 0,
        },
        {
          name: 'Muzzle',
          path: polygon(
            [
              [430, 640],
              [570, 640],
              [500, 800],
            ],
            24,
          ),
          tone: 1,
        },
      ],
      { creature: kind },
    );
  }
  if (kind === 'bear') {
    return mk(
      'mascot',
      [
        { name: 'Head', path: circle(500, 540, 330), cuts: [eye(400, 480, 34), eye(600, 480, 34)], tone: 0 },
        { name: 'Ears', path: join(circle(270, 280, 100), circle(730, 280, 100)), tone: 0 },
        { name: 'Snout', path: ellipse2(500, 640, 140, 105), cuts: [ellipse2(500, 605, 48, 32)], tone: 1 },
      ],
      { creature: kind },
    );
  }
  if (kind === 'cat') {
    const head = pebble(500, 560, 330, 290, 0.03, 8, c.r);
    return mk(
      'mascot',
      [
        { name: 'Head', path: head, cuts: [leaf(400, 520, 46, 120, 0), leaf(600, 520, 46, 120, 0)], tone: 0 },
        {
          name: 'Ears',
          path: join(
            polygon(
              [
                [200, 420],
                [240, 140],
                [420, 300],
              ],
              16,
            ),
            polygon(
              [
                [800, 420],
                [760, 140],
                [580, 300],
              ],
              16,
            ),
          ),
          tone: 0,
        },
        {
          name: 'Nose',
          path: polygon(
            [
              [470, 620],
              [530, 620],
              [500, 660],
            ],
            8,
          ),
          tone: 2,
        },
      ],
      { creature: kind },
    );
  }
  if (kind === 'fish' || kind === 'whale') {
    return mk(
      'mascot',
      [
        { name: 'Body', path: rotate(leaf(460, 500, 340, 640, 0, 0.62), 90, [460, 500]), cuts: [eye(300, 450, 34)], tone: 0 },
        {
          name: 'Tail',
          path: polygon(
            [
              [760, 500],
              [900, 360],
              [900, 640],
            ],
            20,
          ),
          tone: 0,
        },
      ],
      { creature: kind },
    );
  }
  // a bird (and any other creature): a round body, a wing, a beak
  return mk(
    'mascot',
    [
      { name: 'Body', path: circle(470, 530, 300), cuts: [eye(400, 420, 32), leaf(560, 580, 150, 300, 60)], tone: 0 },
      { name: 'Wing', path: leaf(560, 580, 110, 250, 60), tone: 1 },
      {
        name: 'Beak',
        path: polygon(
          [
            [740, 420],
            [870, 460],
            [740, 500],
          ],
          10,
        ),
        tone: 2,
      },
    ],
    { creature: 'bird' },
  );
};
const ellipse2 = (cx: number, cy: number, rx: number, ry: number) => scaleAbout(circle(cx, cy, rx), 1, ry / rx, [cx, cy]);

const bridge = (c: MarkCtx): Mark => {
  const v = c.r.pick(['arch', 'keystone', 'arcade'] as const);
  const sw = clamp(c.sw, 70, 150);
  if (v === 'arch') {
    const r = c.r.between(240, 320);
    return mk('bridge', [{ name: 'Arch', path: path({ closed: false, nodes: [{ x: 500 - r, y: 820 }, ...arcNodes(500, 520, r, r, Math.PI, Math.PI * 2), { x: 500 + r, y: 820 }] }), stroke: strokeOf(sw, c), tone: 0 }], {
      variant: v,
      radius: Math.round(r),
    });
  }
  if (v === 'keystone') {
    // an arch of voussoirs: blocks around a half circle, held apart by joints, the keystone in the accent
    const n = c.r.pick([5, 7, 9]);
    const R = 360;
    const inner = R - clamp(c.sw * 1.6, 120, 200);
    const joint = Math.max(20, c.sw * 0.22);
    const parts: MarkPart[] = [];
    for (let i = 0; i < n; i++) {
      const a0 = 180 + (i * 180) / n;
      const a1 = a0 + 180 / n;
      const block = sector(500, 700, R, a0, a1, inner);
      parts.push({ name: i === (n - 1) / 2 ? 'Keystone' : `Voussoir ${i + 1}`, path: block, cuts: [ray(a0, joint, [500, 700]), ray(a1, joint, [500, 700])], tone: i === (n - 1) / 2 ? 2 : 0 });
    }
    return mk('bridge', parts, { variant: v, blocks: n });
  }
  const k = c.r.int(2, 3);
  const w = 760 / k;
  const cuts = Array.from({ length: k }, (_, i) => archShape(120 + i * w + w * 0.18, 420, w * 0.64, 520));
  return mk('bridge', [{ name: 'Arcade', path: rect(120, 200, 760, 640, c.soft * 40), cuts, tone: 0 }], { variant: v, arches: k });
};

const trace = (c: MarkCtx): Mark => {
  const v = c.r.pick(['rose', 'rose', 'meander'] as const);
  if (v === 'rose') {
    const k = c.r.pick([3, 5, 1.5, 2.5, 7 / 3]);
    const q = k === 1.5 || k === 2.5 ? 2 : k === 7 / 3 ? 3 : 1;
    const span = Math.PI * (q * (k % 1 === 0 && k % 2 === 1 ? 1 : 2));
    const pts: P2[] = [];
    const N = Math.round(18 * k * q + 24);
    for (let i = 0; i < N; i++) {
      const t = (i / N) * span;
      const r = 360 * Math.cos(k * t);
      pts.push([500 + r * Math.cos(t), 500 + r * Math.sin(t)]);
    }
    return mk('trace', [{ name: 'One line', path: smooth(pts, true, 1), stroke: strokeOf(c.sw * 0.55, c, 'round'), tone: 0 }], { variant: v, k: Math.round(k * 100) / 100 });
  }
  const pts: P2[] = [];
  for (let i = 0; i < 6; i++) pts.push([180 + i * 128 + c.r.between(-40, 40), 500 + (i % 2 ? -1 : 1) * c.r.between(150, 300)]);
  return mk('trace', [{ name: 'One line', path: smooth(pts, false, 1.2), stroke: strokeOf(c.sw * 0.75, c, 'round'), tone: 0 }], { variant: v });
};

const steps = (c: MarkCtx): Mark => {
  const v = c.r.pick(['stairs', 'stack'] as const);
  const k = c.r.int(3, 5);
  if (v === 'stairs') {
    const sx = 760 / k;
    const sy = 760 / k;
    const pts: P2[] = [[120, 880]];
    for (let i = 0; i < k; i++) {
      pts.push([120 + i * sx, 880 - (i + 1) * sy]);
      pts.push([120 + (i + 1) * sx, 880 - (i + 1) * sy]);
    }
    pts.push([880, 880]);
    return mk('steps', [{ name: 'Steps', path: polygon(pts, c.soft * 40), tone: 0 }], { variant: v, steps: k });
  }
  const s = c.r.between(320, 420);
  const d = (760 - s) / (k - 1);
  const parts: MarkPart[] = [];
  const gap = Math.max(26, c.sw * 0.32);
  for (let i = 0; i < k; i++) {
    const x = 120 + i * d;
    const y = 880 - s - i * d;
    const next = i < k - 1 ? rect(120 + (i + 1) * d - gap, 880 - s - (i + 1) * d - gap, s + gap * 2, s + gap * 2, c.soft * 40) : null;
    parts.push({ name: `Block ${i + 1}`, path: rect(x, y, s, s, c.soft * 40), ...(next ? { cuts: [next] } : {}), tone: i === k - 1 ? (c.r.chance(0.5) ? 2 : 0) : 0 });
  }
  return mk('steps', parts, { variant: v, blocks: k });
};

const aperture = (c: MarkCtx): Mark => {
  const n = c.r.pick(c.avoid.has('hexagon') ? [5, 7, 8] : [5, 6, 7, 8]);
  const rho = c.r.between(80, 150);
  const twist = c.r.between(24, 44);
  const gap = Math.max(22, c.sw * 0.28);
  const R = 400;
  const disc = circle(500, 500, R);
  const parts: MarkPart[] = [];
  const accent = c.r.chance(0.4) ? c.r.int(0, n - 1) : -1;
  for (let i = 0; i < n; i++) {
    const t0 = (i * 360) / n;
    const t1 = ((i + 1) * 360) / n;
    const p1 = polar(500, 500, rho, t0);
    const p2 = polar(500, 500, rho, t1);
    const p3 = polar(500, 500, R * 1.5, t1 + twist);
    const p4 = polar(500, 500, R * 1.5, t0 + twist);
    const blade = intersect(polygon([p1, p2, p3, p4]), disc);
    const edge = (a: P2, b: P2) => bar((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI, gap, Math.hypot(b[0] - a[0], b[1] - a[1]));
    parts.push({ name: `Blade ${i + 1}`, path: blade, cuts: [edge(p1, p4), edge(p2, p3)], tone: i === accent ? 2 : 0 });
  }
  return mk('aperture', parts, { blades: n, opening: Math.round(rho), twist: Math.round(twist) });
};

const seed = (c: MarkCtx): Mark => {
  const v = c.r.pick(['sprout', 'cross', 'trio', 'pod'] as const);
  if (v === 'pod') return mk('seed', [{ name: 'Pod', path: leaf(500, 500, 520, 800, c.r.between(-25, 25), 0.6), cuts: [circle(500, 520, c.r.between(70, 110))], tone: 0 }], { variant: v });
  const n = v === 'sprout' ? 2 : v === 'cross' ? 4 : 3;
  const spread = v === 'sprout' ? c.r.between(28, 44) : 360 / n;
  const leaves: MarkPart[] = [];
  for (let i = 0; i < n; i++) {
    const a = v === 'sprout' ? -90 + (i ? spread : -spread) : -90 + i * spread + c.r.between(-6, 6);
    const p = polar(500, v === 'sprout' ? 760 : 500, v === 'sprout' ? 260 : 210, a);
    leaves.push({ name: `Leaf ${i + 1}`, path: leaf(p[0], p[1], v === 'sprout' ? 220 : 190, v === 'sprout' ? 520 : 400, a + 90), tone: i === 0 && c.r.chance(0.4) ? 1 : 0 });
  }
  return mk('seed', leaves, { variant: v, leaves: n });
};

const letterSymbol = (c: MarkCtx): Mark => {
  const ch = c.initials[0] ?? 'S';
  const weight = c.r.between(0.19, 0.27);
  const L = letterAt(ch, c, weight, 700);
  const counter = counterOf(ch);
  const options = ['crop', 'stem-cut', 'two-tone', 'extended'] as const;
  const v = counter && c.r.chance(0.45) ? 'counter-dot' : c.r.pick(options);
  if (v === 'counter-dot' && counter) {
    const cx = 500 - L.w / 2 + counter[0] * L.w;
    const cy = 150 + counter[1] * 700;
    return mk(
      'letter',
      [
        { name: `Letter ${ch}`, path: L.path, stroke: strokeOf(L.sw, c), tone: 0 },
        { name: 'Counter dot', path: circle(cx, cy, Math.max(40, L.sw * 0.55)), tone: 2 },
      ],
      { letter: ch, variant: v, weight: Math.round(weight * 100) / 100 },
    );
  }
  if (v === 'crop') {
    // the letter a little larger than its frame, pushed toward one corner: cropped on two sides, still read
    const big = letterAt(ch, c, weight * 0.9, 860, [500 + c.r.between(40, 110), 500 + c.r.between(40, 100)]);
    return mk(
      'letter',
      [
        { name: `Cropped ${ch}`, path: intersect(strokeArea(big.path, big.sw), rect(150, 150, 700, 700, c.soft * 60)), tone: 0 },
        { name: 'Frame', path: rect(150, 150, 700, 700, c.soft * 60), stroke: strokeOf(Math.max(16, c.sw * 0.18), c), tone: 0, detail: true },
      ],
      { letter: ch, variant: v },
    );
  }
  if (v === 'stem-cut') {
    const ang = c.r.between(25, 60);
    return mk('letter', [{ name: `Letter ${ch}`, path: strokeArea(L.path, L.sw), cuts: [bar(500, 500, ang, Math.max(30, L.sw * 0.4))], tone: 0 }], { letter: ch, variant: v, angle: Math.round(ang) });
  }
  if (v === 'two-tone' && L.path.subpaths.length > 1) {
    const [first, ...rest] = L.path.subpaths;
    return mk(
      'letter',
      [
        { name: `Letter ${ch}`, path: { subpaths: [first] }, stroke: strokeOf(L.sw, c), tone: 0 },
        { name: `${ch}, second stroke`, path: { subpaths: rest }, stroke: strokeOf(L.sw, c), tone: 2 },
      ],
      { letter: ch, variant: 'two-tone' },
    );
  }
  // the last stroke carried on past the letter: a gesture
  const subs = L.path.subpaths;
  const last = subs[subs.length - 1];
  const end = last.nodes[last.nodes.length - 1];
  const prev = last.nodes[last.nodes.length - 2] ?? end;
  const dx = end.x - prev.x;
  const dy = end.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  const tail = line([
    [end.x, end.y],
    [end.x + (dx / len) * 260, end.y + (dy / len) * 260],
  ]);
  return mk(
    'letter',
    [
      { name: `Letter ${ch}`, path: L.path, stroke: strokeOf(L.sw, c), tone: 0 },
      { name: 'Extended stroke', path: tail, stroke: strokeOf(L.sw, c), tone: 0 },
    ],
    { letter: ch, variant: 'extended' },
  );
};

const pixel = (c: MarkCtx): Mark => {
  const ch = c.initials[0] ?? 'S';
  const rows = c.r.pick([7, 8, 9]);
  const { cols, on } = letterCells(ch, c, rows);
  const cell = 760 / Math.max(rows, cols);
  const gut = cell * c.r.between(0.08, 0.18);
  const x0 = 500 - (cols * cell) / 2;
  const y0 = 500 - (rows * cell) / 2;
  const mods: BezierPath[] = [];
  let accent: BezierPath | null = null;
  const pick = c.r.int(0, 999);
  let count = 0;
  const total = on.flat().filter(Boolean).length;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      if (!on[j][i]) continue;
      const m = rect(x0 + i * cell + gut / 2, y0 + j * cell + gut / 2, cell - gut, cell - gut, c.soft * cell * 0.12);
      if (count++ === pick % Math.max(1, total)) accent = m;
      else mods.push(m);
    }
  const parts: MarkPart[] = [{ name: `Pixels of ${ch}`, path: join(...mods), tone: 0 }];
  if (accent) parts.push({ name: 'Accent pixel', path: accent, tone: 2 });
  return mk('pixel', parts, { letter: ch, rows, cols });
};

const frame = (c: MarkCtx): Mark => {
  const shape = c.r.pick(['square', 'arch'] as const);
  const el = c.r.pick(['diamond', 'half', 'letter', 'letter'] as const);
  const sw = clamp(c.sw * 0.7, 40, 110);
  const box = shape === 'square' ? rect(160, 200, 620, 620, c.soft * 80) : archShape(170, 180, 600, 660);
  const gap = Math.max(28, sw * 0.6);
  const side = c.r.pick(['left', 'bottom', 'right'] as const);
  const at: P2 = side === 'left' ? [170, 560] : side === 'bottom' ? [470, 830] : [770, 520];
  if (el === 'diamond') {
    const r = c.r.between(130, 180);
    const dia = polygon(
      [
        [at[0], at[1] - r],
        [at[0] + r, at[1]],
        [at[0], at[1] + r],
        [at[0] - r, at[1]],
      ],
      c.soft * 30,
    );
    return mk(
      'frame',
      [
        { name: 'Frame', path: box, stroke: strokeOf(sw, c), cuts: [scaleAbout(dia, 1 + gap / r, 1 + gap / r, at)], tone: 0 },
        { name: 'Breaking through', path: dia, tone: 2 },
      ],
      { shape, element: el, side },
    );
  }
  if (el === 'half' && side !== 'right') {
    const r = c.r.between(150, 200);
    const half = sector(at[0], at[1], r, side === 'left' ? 90 : side === 'bottom' ? 180 : -90, side === 'left' ? 270 : side === 'bottom' ? 360 : 90);
    return mk(
      'frame',
      [
        { name: 'Frame', path: box, stroke: strokeOf(sw, c), cuts: [circle(at[0], at[1], r + gap)], tone: 0 },
        { name: 'Half through', path: half, tone: 2 },
      ],
      { shape, element: el, side },
    );
  }
  const L = letterAt(c.initials[0] ?? 'S', c, 0.2, 400, [side === 'left' ? 260 : side === 'right' ? 700 : 470, side === 'bottom' ? 700 : 460]);
  return mk(
    'frame',
    [
      { name: 'Frame', path: box, stroke: strokeOf(sw, c), cuts: [strokeArea(L.path, L.sw + gap * 2)], tone: 0 },
      { name: `Letter ${c.initials[0] ?? 'S'}`, path: L.path, stroke: strokeOf(L.sw, c), tone: 2 },
    ],
    { shape, element: el, side },
  );
};

export const METHODS: Record<MethodId, MethodSpec> = {
  convergence: {
    id: 'convergence',
    label: 'Convergence',
    geometry: 'geometric',
    meanings: ['collaboration', 'community', 'gathering', 'unity', 'focus', 'meeting', 'network', 'together'],
    traits: ['geometric', 'dynamic', 'bold'],
    how: 'slices of one form meeting at a centre, held apart by parallel gaps',
    build: convergence,
  },
  interlock: {
    id: 'interlock',
    label: 'Interlock',
    geometry: 'geometric',
    meanings: ['partnership', 'connection', 'trust', 'bond', 'together', 'link', 'collaboration'],
    traits: ['geometric', 'calm', 'trust'],
    how: 'two links passing over and under each other, the crossings cut live',
    build: interlock,
  },
  modular: {
    id: 'modular',
    label: 'Modular letter',
    geometry: 'modular',
    meanings: ['system', 'building', 'structure', 'craft', 'scale', 'learning', 'play'],
    traits: ['geometric', 'systematic', 'bold', 'playful'],
    how: 'the initial built from square and quarter-round modules on a grid',
    letters: true,
    build: modular,
  },
  negative: {
    id: 'negative',
    label: 'Negative letter',
    geometry: 'typographic',
    meanings: ['discovery', 'clarity', 'identity', 'essence', 'focus', 'openness', 'hidden'],
    traits: ['minimal', 'clever', 'calm'],
    how: 'a solid form with the initial cut out of it as negative space',
    letters: true,
    build: negative,
  },
  monogram: {
    id: 'monogram',
    label: 'Monogram',
    geometry: 'typographic',
    meanings: ['heritage', 'union', 'signature', 'family', 'founders', 'partnership', 'craft'],
    traits: ['classic', 'refined'],
    how: 'two initials sharing a stroke or passing one in front of the other',
    letters: true,
    build: monogram,
  },
  radial: {
    id: 'radial',
    label: 'Radial repetition',
    geometry: 'geometric',
    meanings: ['energy', 'growth', 'community', 'warmth', 'light', 'bloom', 'joy', 'gathering'],
    traits: ['warm', 'dynamic', 'playful'],
    how: 'one form repeated around a centre, turned, sometimes in two rings',
    risk: 'hexagon',
    build: radial,
  },
  fold: {
    id: 'fold',
    label: 'Fold',
    geometry: 'geometric',
    meanings: ['transformation', 'craft', 'paper', 'change', 'care', 'surprise', 'learning'],
    traits: ['geometric', 'clever', 'warm'],
    how: 'a band folded over itself or facets of a folded sheet, the fold shown as a second face',
    build: fold,
  },
  strata: {
    id: 'strata',
    label: 'Strata',
    geometry: 'geometric',
    meanings: ['layers', 'depth', 'landscape', 'accumulation', 'data', 'history', 'ground', 'calm'],
    traits: ['calm', 'systematic'],
    how: 'stacked bands whose lengths draw a profile (a hill, a rise, a letter)',
    build: strata,
  },
  orbit: {
    id: 'orbit',
    label: 'Orbit',
    geometry: 'geometric',
    meanings: ['care', 'movement', 'continuity', 'protection', 'cycle', 'attention', 'service'],
    traits: ['dynamic', 'calm'],
    how: 'a centre with a path around it, or one body passing another',
    risk: 'globe',
    build: orbit,
  },
  split: {
    id: 'split',
    label: 'Split',
    geometry: 'geometric',
    meanings: ['change', 'shift', 'duality', 'difference', 'breakthrough', 'decision', 'courage'],
    traits: ['dynamic', 'bold', 'modern'],
    how: 'a form cut along a line, its halves moved along the cut',
    build: split,
  },
  grid: {
    id: 'grid',
    label: 'Grid with one apart',
    geometry: 'modular',
    meanings: ['precision', 'individuality', 'order', 'choice', 'standing out', 'quality'],
    traits: ['systematic', 'minimal', 'precise'],
    how: 'a grid of modules with one cell moved, turned or changed',
    build: grid,
  },
  wave: { id: 'wave', label: 'Wave cut', geometry: 'organic', meanings: ['flow', 'water', 'sound', 'rhythm', 'calm', 'signal', 'travel'], traits: ['organic', 'calm', 'dynamic'], how: 'a solid form cut by waves of the ground', build: wave },
  organic: {
    id: 'organic',
    label: 'Organic form',
    geometry: 'organic',
    meanings: ['natural', 'human', 'comfort', 'wellbeing', 'earth', 'care', 'softness'],
    traits: ['organic', 'warm', 'soft'],
    how: 'a smooth irregular form with a counter or a companion form',
    risk: 'blob',
    build: organic,
  },
  spiral: {
    id: 'spiral',
    label: 'Spiral',
    geometry: 'organic',
    meanings: ['growth', 'evolution', 'unfolding', 'journey', 'time', 'discovery', 'learning'],
    traits: ['organic', 'dynamic'],
    how: 'a ribbon winding outward and thickening, or a squared spiral',
    build: spiral,
  },
  angle: {
    id: 'angle',
    label: 'Angles',
    geometry: 'geometric',
    meanings: ['progress', 'direction', 'forward', 'ambition', 'speed', 'momentum', 'energy'],
    traits: ['dynamic', 'bold', 'sharp'],
    how: 'an asymmetric zigzag to a destination, rising strokes, or one line folded at angles',
    build: angle,
  },
  emblem: {
    id: 'emblem',
    label: 'Emblem',
    geometry: 'pictorial',
    meanings: ['heritage', 'craft', 'quality', 'place', 'tradition', 'community', 'trust'],
    traits: ['classic', 'warm', 'serious'],
    how: 'rings with the name around them and a symbol at the centre',
    letters: true,
    build: emblem,
  },
  mascot: {
    id: 'mascot',
    label: 'Mascot',
    geometry: 'pictorial',
    meanings: ['friendly', 'character', 'play', 'approachable', 'companion', 'joy', 'children'],
    traits: ['playful', 'warm', 'young'],
    how: 'a character built from geometric parts, its features cut as negative space',
    build: mascot,
  },
  bridge: {
    id: 'bridge',
    label: 'Bridge',
    geometry: 'geometric',
    meanings: ['connection', 'access', 'passage', 'link', 'support', 'journey', 'together'],
    traits: ['calm', 'structural', 'trust'],
    how: 'an arch, an arch of voussoirs with its keystone, or an arcade',
    build: bridge,
  },
  trace: {
    id: 'trace',
    label: 'One line',
    geometry: 'organic',
    meanings: ['journey', 'continuity', 'creativity', 'flow', 'story', 'craft', 'play'],
    traits: ['expressive', 'organic'],
    how: 'one continuous line, never lifted, closing on itself or wandering',
    risk: 'infinity',
    build: trace,
  },
  steps: { id: 'steps', label: 'Steps', geometry: 'geometric', meanings: ['progress', 'growth', 'ascent', 'achievement', 'building', 'learning'], traits: ['systematic', 'dynamic'], how: 'ascending steps, or blocks stacked in depth', build: steps },
  aperture: {
    id: 'aperture',
    label: 'Aperture',
    geometry: 'geometric',
    meanings: ['focus', 'vision', 'clarity', 'opening', 'perspective', 'discovery', 'precision'],
    traits: ['geometric', 'precise'],
    how: 'twisted blades around an opening, held apart by gaps',
    risk: 'hexagon',
    build: aperture,
  },
  seed: {
    id: 'seed',
    label: 'Seed',
    geometry: 'organic',
    meanings: ['growth', 'beginning', 'nature', 'nurture', 'potential', 'care', 'health'],
    traits: ['organic', 'warm', 'natural'],
    how: 'leaf forms arranged as a sprout, a cross, a trio or a pod',
    risk: 'leaf',
    build: seed,
  },
  letter: {
    id: 'letter',
    label: 'Letter symbol',
    geometry: 'typographic',
    meanings: ['identity', 'confidence', 'signature', 'directness', 'clarity', 'name'],
    traits: ['bold', 'typographic'],
    how: 'the initial drawn heavy and changed: a dot in its counter, a crop, a cut, a second tone, a stroke carried on',
    letters: true,
    build: letterSymbol,
  },
  pixel: {
    id: 'pixel',
    label: 'Pixel letter',
    geometry: 'modular',
    meanings: ['digital', 'play', 'building', 'games', 'craft'],
    traits: ['systematic', 'playful'],
    how: 'the initial set in square pixels with one in the accent',
    tech: true,
    letters: true,
    build: pixel,
  },
  frame: {
    id: 'frame',
    label: 'Broken frame',
    geometry: 'geometric',
    meanings: ['opening', 'perspective', 'possibility', 'freedom', 'discovery', 'creativity'],
    traits: ['geometric', 'clever'],
    how: 'a frame with something breaking out through it, the frame cut where it crosses',
    build: frame,
  },
};

/** A mark built by a method from a seed, then refined optically (see the head of this file). */
export function buildMark(method: MethodId, seed: string, ctx: Omit<MarkCtx, 'r'>): Mark {
  const spec = METHODS[method];
  const raw = spec.build({ ...ctx, r: rng(seed, method) });
  return refineMark({ ...raw, params: { ...raw.params, seed } });
}

/** The mark fitted, centred optically and made to survive at 32 px (strokes thickened, at most three times). */
export function refineMark(m0: Mark, opts: { minAt?: number } = {}): Mark {
  const notes = [...m0.notes];
  let m = fitMark(m0, 820);
  const box = { x: 0, y: 0, w: S, h: S };
  let ink = inkOf(rasterize(m, 128, box));
  const [cx, cy] = centroid(ink, 128);
  const dx = (0.5 - cx) * S * 0.6;
  const dy = (0.49 - cy) * S * 0.6;
  if (Math.hypot(dx, dy) > 4) {
    m = mapMark(m, (x, y) => [x + dx, y + dy], 1);
    notes.push(`visual centre moved ${Math.round(Math.hypot(dx, dy) / 10)}% toward the optical centre (a touch above the middle)`);
  }
  const at = opts.minAt ?? 32;
  for (let i = 0; i < 3; i++) {
    ink = inkOf(rasterize(m, 128, box));
    const s = survivalAt(ink, 128, at);
    if (s.score >= 0.9 || !m.parts.some((p) => p.stroke)) break;
    m = { ...m, parts: m.parts.map((p) => (p.stroke ? { ...p, stroke: { ...p.stroke, width: Math.round(p.stroke.width * 1.18) } } : p)) };
    notes.push(`strokes thickened to hold at ${at} px`);
  }
  const b = boundsOfParts(m.parts);
  if (b.x < 30 || b.y < 30 || b.x + b.w > S - 30 || b.y + b.h > S - 30) m = fitMark(m, 820);
  return { ...m, notes };
}
