// lib/ux-v0/shape.ts — shapes constructed for a design from parameters, not picked from a set.
//
// The renderer used to know six flat shapes (a circle, an arch, a square, a quarter, a diamond and one blob) and two
// image frames (an arch, a circle). Every design that used shapes drew from those eight. A shape is now a RECIPE: a
// construction method and a handful of continuous parameters, so the space of shapes is as large as the parameters
// allow and each design's shapes are its own (lib/ux-v0/form.ts derives them from the direction).
//
//   poly      a polygon of its own: how many corners, how regular, how rounded, mirror-symmetric or not
//   organic   a silhouette drawn from overlaid waves: pebbles, drops, fluid outlines
//   super     a parametric figure (the superformula): stars, petals, rounded squares, everything between
//   stepped   a structural outline of steps, notches, protrusions and voids, at right angles (traced from a grid)
//   radial    rays or a fan about a centre, a sector cut away
//   rings     concentric rings, true or eccentric
//   shards    a figure cut into fragments by straight cuts and pulled apart
//   arc       a thick arc, even or tapering: an abstract curve
//   edge      a band whose top edge is a wave, steps, teeth or a tear (a section's edge, a cut transition)
//   custom    points, or an SVG path, written by the designer or the model in a 0–100 box
//
// Every recipe can also be turned, warped (a wave through it, a twist) and cut (a void, a notch, a gap).
//
// A shape is geometry in a 0–100 box: one or more closed rings, read even-odd (a ring inside a ring is a hole; rings
// apart are parts). From it come the forms the page uses, all responsive because they are in percentages:
//
//   clipPolygon    a CSS clip-path polygon (pictures in irregular containers, shapes as planes); rings joined by
//                  zero-width bridges under the even-odd rule, so voids and fragments survive in one polygon
//   svgPath        an SVG path (outlines, procedural pictures), smoothed for the curved kinds
//   outsidePolygon a CSS shape-outside polygon: text wrapping around a shape
//   morphFrom      the same points on the box's edge: a rectangle that becomes the shape (a clip-path transition)
//
// The geometry is deterministic: the same recipe is the same shape, so a design stores recipes, never geometry.
// Nothing here is a model's markup: a custom path is parsed into points and redrawn by this module.

export const SHAPE_KINDS = ['poly', 'organic', 'super', 'stepped', 'radial', 'rings', 'shards', 'arc', 'edge', 'custom'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const SHAPE_SAYS: Record<ShapeKind, string> = {
  poly: 'a polygon of its own',
  organic: 'an organic silhouette',
  super: 'a parametric figure',
  stepped: 'a stepped, structural outline',
  radial: 'rays about a centre',
  rings: 'concentric rings',
  shards: 'a figure cut into fragments',
  arc: 'a thick arc',
  edge: 'a band with a shaped edge',
  custom: 'a drawn outline',
};

export type Pt = [number, number];
export type Ring = Pt[];

export interface ShapeRecipe {
  kind: ShapeKind;
  seed: number;
  /** what the construction counts: corners, lobes, rays, rings, cuts, steps (2–24) */
  n: number;
  /** 0 a regular figure … 100 a wild one */
  irregular: number;
  /** 0 straight edges and hard corners … 100 fluid */
  curve: number;
  /** degrees, −180 … 180 */
  turn: number;
  /** 0 whole … 100 a large void, notch or gap */
  cut: number;
  /** 0 true … 100 distorted: a wave through the figure, a twist */
  warp: number;
  /** mirror-symmetric about its upright axis */
  mirror?: true;
  /** custom: points in a 0–100 box */
  points?: Pt[];
  /** custom: an SVG path in a 0–100 box (M L H V C S Q T Z, absolute or relative; no arcs) */
  path?: string;
}

/** Points on a single-ring shape: every single-ring shape has this many, so any two can morph into each other. */
export const RING_POINTS = 96;

const TAU = Math.PI * 2;
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const int = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? clampN(n, lo, hi) : d;
};

function rng(seed: number) {
  let a = (seed || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small stable hash of words: seeds for shapes named by their place. */
export function shapeSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 2147483646) + 1;
}

// ── recipes, held to their shape ────────────────────────────────────────

const MAX_CUSTOM_POINTS = 64;
const MAX_PATH = 900;

/** A recipe as written (by the engine, the designer or the model), held to its ranges; null when it draws nothing. */
export function normalizeRecipe(v: unknown): ShapeRecipe | null {
  const r = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  if (!r) return null;
  const kind = (SHAPE_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as ShapeKind) : null;
  if (!kind) return null;
  const out: ShapeRecipe = {
    kind,
    seed: int(r.seed, 1, 2147483646, 1),
    n: int(r.n, 2, 24, kind === 'rings' ? 3 : kind === 'shards' ? 3 : 6),
    irregular: int(r.irregular, 0, 100, 30),
    curve: int(r.curve, 0, 100, 40),
    turn: int(r.turn, -180, 180, 0),
    cut: int(r.cut, 0, 100, 0),
    warp: int(r.warp, 0, 100, 0),
    ...(r.mirror === true ? { mirror: true as const } : {}),
  };
  if (kind === 'custom') {
    const pts = Array.isArray(r.points)
      ? (r.points as unknown[])
          .map((p) => (Array.isArray(p) && p.length >= 2 ? ([Number(p[0]), Number(p[1])] as Pt) : null))
          .filter((p): p is Pt => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]))
          .slice(0, MAX_CUSTOM_POINTS)
          .map(([x, y]) => [round1(clampN(x, 0, 100)), round1(clampN(y, 0, 100))] as Pt)
      : [];
    const path = typeof r.path === 'string' ? r.path.slice(0, MAX_PATH) : '';
    if (pts.length >= 3 && ringArea(pts) > 4) out.points = pts;
    else if (path && parsePath(path)) out.path = path.replace(/\s+/g, ' ').trim();
    else return null;
  }
  return out;
}

/** A recipe's stable key: the same key is the same shape. */
export function shapeKey(r: ShapeRecipe): string {
  if (r.kind === 'custom') return `custom:${r.points ? r.points.map((p) => p.join(',')).join(' ') : r.path}`;
  return `${r.kind}:${r.seed}:${r.n}:${r.irregular}:${r.curve}:${r.turn}:${r.cut}:${r.warp}:${r.mirror ? 1 : 0}`;
}

/**
 * A shape's character, coarsely: its construction and the bands its parameters fall in. Two shapes with one
 * signature read as the same move (the same rounded pentagon, the same pebble), whatever their seeds: for the
 * repetition measures, which should count a repeated idea, not a repeated seed.
 */
export function figureSignature(r: ShapeRecipe): string {
  if (r.kind === 'custom') return 'custom';
  const band = (v: number) => (v < 34 ? 'lo' : v < 67 ? 'mid' : 'hi');
  return `${r.kind}/${r.kind === 'poly' || r.kind === 'super' || r.kind === 'radial' ? Math.min(r.n, 12) : r.kind === 'rings' || r.kind === 'shards' ? Math.min(r.n, 5) : ''}/${band(r.irregular)}/${band(r.curve)}${r.cut >= 34 ? '/cut' : ''}${r.warp >= 34 ? '/warp' : ''}`;
}

// ── geometry ────────────────────────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10;

function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function centroid(r: Ring): Pt {
  let x = 0;
  let y = 0;
  for (const p of r) {
    x += p[0];
    y += p[1];
  }
  return [x / r.length, y / r.length];
}

function rotate(r: Ring, a: number, c: Pt = [0, 0]): Ring {
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  return r.map(([x, y]) => [c[0] + (x - c[0]) * cs - (y - c[1]) * sn, c[1] + (x - c[0]) * sn + (y - c[1]) * cs]);
}

/** Corners rounded: each corner replaced by a curve from a point along the edge before it to one along the edge after. */
function roundCorners(r: Ring, amount: number, steps = 4): Ring {
  if (amount <= 0.02 || r.length < 3) return r;
  const out: Ring = [];
  const n = r.length;
  for (let i = 0; i < n; i++) {
    const p0 = r[(i - 1 + n) % n];
    const p1 = r[i];
    const p2 = r[(i + 1) % n];
    const l1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const d = Math.min(l1, l2) * 0.5 * Math.min(1, amount);
    if (d <= 1e-6) {
      out.push(p1);
      continue;
    }
    const a: Pt = [p1[0] + ((p0[0] - p1[0]) * d) / l1, p1[1] + ((p0[1] - p1[1]) * d) / l1];
    const b: Pt = [p1[0] + ((p2[0] - p1[0]) * d) / l2, p1[1] + ((p2[1] - p1[1]) * d) / l2];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * p1[0] + t * t * b[0], u * u * a[1] + 2 * u * t * p1[1] + t * t * b[1]]);
    }
  }
  return out;
}

/** Corners cut at 45°: a chamfer of `d` along each edge (precise architecture, not soft). */
function bevel(r: Ring, d: number): Ring {
  if (d <= 0) return r;
  const out: Ring = [];
  const n = r.length;
  for (let i = 0; i < n; i++) {
    const p0 = r[(i - 1 + n) % n];
    const p1 = r[i];
    const p2 = r[(i + 1) % n];
    const l1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.min(d, l1 / 3, l2 / 3);
    out.push([p1[0] + ((p0[0] - p1[0]) * k) / l1, p1[1] + ((p0[1] - p1[1]) * k) / l1], [p1[0] + ((p2[0] - p1[0]) * k) / l2, p1[1] + ((p2[1] - p1[1]) * k) / l2]);
  }
  return out;
}

/** N points spaced evenly along a ring by length (for curves: no corners to keep). */
function resampleEven(r: Ring, N: number): Ring {
  const n = r.length;
  const seg = r.map((p, i) => Math.hypot(r[(i + 1) % n][0] - p[0], r[(i + 1) % n][1] - p[1]));
  const total = seg.reduce((s, x) => s + x, 0);
  if (total <= 0) return r;
  const out: Ring = [];
  let i = 0;
  let acc = 0;
  for (let k = 0; k < N; k++) {
    const target = (k / N) * total;
    while (acc + seg[i] < target && i < n - 1) acc += seg[i++];
    const t = seg[i] > 0 ? (target - acc) / seg[i] : 0;
    const a = r[i];
    const b = r[(i + 1) % n];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** N points on a ring keeping every corner it has, the rest spread along its edges by length (for polygons). */
function resampleKeep(r: Ring, N: number): Ring {
  const n = r.length;
  if (n >= N) return r;
  const seg = r.map((p, i) => Math.hypot(r[(i + 1) % n][0] - p[0], r[(i + 1) % n][1] - p[1]));
  const total = seg.reduce((s, x) => s + x, 0) || 1;
  const extra = N - n;
  const raw = seg.map((l) => (extra * l) / total);
  const per = raw.map(Math.floor);
  let left = extra - per.reduce((s, x) => s + x, 0);
  raw
    .map((x, i) => [x - Math.floor(x), i] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (left > 0) {
        per[i]++;
        left--;
      }
    });
  const out: Ring = [];
  for (let i = 0; i < n; i++) {
    const a = r[i];
    const b = r[(i + 1) % n];
    out.push(a);
    for (let k = 1; k <= per[i]; k++) {
      const t = k / (per[i] + 1);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** A convex ring split by the line through `p` along angle `a`: the parts on each side (one when it misses). */
function splitConvex(r: Ring, p: Pt, a: number): Ring[] {
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const side = (q: Pt) => (q[0] - p[0]) * nx + (q[1] - p[1]) * ny;
  const left: Ring = [];
  const right: Ring = [];
  for (let i = 0; i < r.length; i++) {
    const q1 = r[i];
    const q2 = r[(i + 1) % r.length];
    const s1 = side(q1);
    const s2 = side(q2);
    if (s1 >= 0) left.push(q1);
    if (s1 <= 0) right.push(q1);
    if ((s1 > 0 && s2 < 0) || (s1 < 0 && s2 > 0)) {
      const t = s1 / (s1 - s2);
      const x: Pt = [q1[0] + (q2[0] - q1[0]) * t, q1[1] + (q2[1] - q1[1]) * t];
      left.push(x);
      right.push(x);
    }
  }
  return [left, right].filter((x) => x.length >= 3 && ringArea(x) > 1e-4);
}

/** Even-odd: is a point inside the rings? */
function insideAll(rings: readonly Ring[], x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
    }
  }
  return inside;
}

// ── the constructions ──────────────────────────────────────────────────

function polyRaw(R: () => number, s: ShapeRecipe): Ring[] {
  const n = clampN(s.n, 3, 12);
  const irr = s.irregular / 100;
  let pts: Ring = [];
  if (s.mirror) {
    // the right half, mirrored: a figure balanced about its upright axis, irregular within its half
    const k = Math.floor(n / 2);
    if (n % 2) pts.push([0, -(1 - irr * 0.3 * R())]);
    const right: Ring = [];
    for (let i = 0; i < k; i++) {
      const a = -Math.PI / 2 + ((i + 0.5 + (R() - 0.5) * irr * 0.8) / k) * Math.PI;
      const r = 1 - irr * 0.5 * R();
      right.push([Math.max(0.05, Math.cos(a) * r), Math.sin(a) * r]);
    }
    pts.push(...right, ...[...right].reverse().map(([x, y]) => [-x, y] as Pt));
  } else {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * TAU + (R() - 0.5) * irr * (TAU / n) * 0.75;
      const r = 1 - irr * 0.55 * R();
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }
  pts = roundCorners(pts, (s.curve / 100) * 0.95, 6);
  return [pts];
}

function organicRaw(R: () => number, s: ShapeRecipe): Ring[] {
  const lobes = clampN(s.n, 2, 7);
  const irr = s.irregular / 100;
  // a long, slow wave for its stance; a few faster ones for its lobes; quieter the more fluid it is asked to be
  const calm = 0.55 + (s.curve / 100) * 0.45;
  const terms = [
    { f: 2, a: 0.08 + R() * 0.12, ph: R() * TAU },
    ...Array.from({ length: 3 }, (_, k) => ({ f: lobes + k, a: ((0.05 + irr * 0.2) * R()) / (1 + k * 0.7) / calm, ph: R() * TAU })),
  ];
  const sum = terms.reduce((x, t) => x + t.a, 0);
  const k = sum > 0.62 ? 0.62 / sum : 1;
  const pts: Ring = [];
  for (let i = 0; i < RING_POINTS; i++) {
    const th = -Math.PI / 2 + (i / RING_POINTS) * TAU;
    // mirrored: cosines about the upright axis only, so both halves answer each other
    const r = 1 + terms.reduce((x, t) => x + t.a * k * (s.mirror ? Math.cos(t.f * (th + Math.PI / 2)) : Math.sin(t.f * th + t.ph)), 0);
    pts.push([Math.cos(th) * r, Math.sin(th) * r]);
  }
  return [pts];
}

const SUPER_M = [2, 3, 4, 6, 8, 12, 16];

function superRaw(R: () => number, s: ShapeRecipe): Ring[] {
  // symmetry counts that divide the ring's points, so every tip of a star lands on a point
  const m = SUPER_M.reduce((best, x) => (Math.abs(x - s.n) < Math.abs(best - s.n) ? x : best), 4);
  const cv = s.curve / 100;
  const irr = s.irregular / 100;
  const n1 = 0.3 + cv * cv * 10;
  const n2 = 0.7 + (1 - irr) * 1.5 + R() * 0.4;
  const n3 = s.mirror ? n2 : n2 * (0.7 + irr * R() * 0.9);
  const pts: Ring = [];
  for (let i = 0; i < RING_POINTS; i++) {
    const ph = (i / RING_POINTS) * TAU;
    const v = Math.pow(Math.abs(Math.cos((m * ph) / 4)), n2) + Math.pow(Math.abs(Math.sin((m * ph) / 4)), n3);
    const r = v > 1e-9 ? Math.min(40, Math.pow(v, -1 / n1)) : 40;
    pts.push([Math.cos(ph - Math.PI / 2) * r, Math.sin(ph - Math.PI / 2) * r]);
  }
  const max = Math.max(...pts.map(([x, y]) => Math.hypot(x, y)));
  return [pts.map(([x, y]) => [x / max, y / max] as Pt)];
}

/** The outline of a grid's filled cells: outer rings and voids, at right angles, collinear points removed. */
function traceCells(cells: number[][]): Ring[] {
  const H = cells.length;
  const W = cells[0].length;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && cells[y][x] === 1;
  const edges = new Map<string, Pt[]>();
  const addEdge = (a: Pt, b: Pt) => {
    const k = `${a[0]},${a[1]}`;
    const list = edges.get(k) ?? [];
    list.push(b);
    edges.set(k, list);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!on(x, y)) continue;
      if (!on(x, y - 1)) addEdge([x, y], [x + 1, y]);
      if (!on(x + 1, y)) addEdge([x + 1, y], [x + 1, y + 1]);
      if (!on(x, y + 1)) addEdge([x + 1, y + 1], [x, y + 1]);
      if (!on(x - 1, y)) addEdge([x, y + 1], [x, y]);
    }
  const rings: Ring[] = [];
  const take = (k: string): Pt | undefined => {
    const list = edges.get(k);
    if (!list?.length) return undefined;
    const b = list.shift()!;
    if (!list.length) edges.delete(k);
    return b;
  };
  for (;;) {
    const startKey = edges.keys().next().value as string | undefined;
    if (startKey === undefined) break;
    const start = startKey.split(',').map(Number) as Pt;
    const ring: Ring = [start];
    let at = take(startKey);
    let guard = 0;
    while (at && guard++ < 4000) {
      if (at[0] === start[0] && at[1] === start[1]) break;
      ring.push(at);
      at = take(`${at[0]},${at[1]}`);
    }
    // collinear points out: only the corners remain
    const corners = ring.filter((p, i) => {
      const a = ring[(i - 1 + ring.length) % ring.length];
      const b = ring[(i + 1) % ring.length];
      return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
    });
    if (corners.length >= 4) rings.push(corners);
  }
  return rings;
}

function steppedRaw(R: () => number, s: ShapeRecipe): Ring[] {
  const G = 12;
  const irr = s.irregular / 100;
  const cells = Array.from({ length: G }, () => Array.from({ length: G }, () => 0));
  const set = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    for (let y = Math.max(0, y0); y < Math.min(G, y1); y++) for (let x = Math.max(0, x0); x < Math.min(G, x1); x++) cells[y][x] = v;
  };
  // a core block, then wings, notches and stairs at its sides and corners: an L, a T, a U, a stair, a cantilever
  const cw = 6 + Math.floor(R() * 4);
  const ch = 6 + Math.floor(R() * 4);
  const cx0 = Math.floor(R() * (G - cw + 1));
  const cy0 = Math.floor(R() * (G - ch + 1));
  const cx1 = cx0 + cw;
  const cy1 = cy0 + ch;
  set(cx0, cy0, cx1, cy1, 1);
  const ops = clampN(s.n, 1, 7);
  for (let k = 0; k < ops; k++) {
    const op = R();
    const side = Math.floor(R() * 4);
    const len = 2 + Math.floor(R() * (2 + irr * 4));
    const deep = 2 + Math.floor(R() * (1 + irr * 3));
    if (op < 0.38) {
      // a wing: a block run out from one side of the core toward the edge of the field
      const ay = cy0 + Math.floor(R() * Math.max(1, ch - len + 1));
      const ax = cx0 + Math.floor(R() * Math.max(1, cw - len + 1));
      const reach = 1 + Math.floor(R() * 3);
      if (side === 0) set(cx0 - reach, ay, cx0, ay + len, 1);
      else if (side === 1) set(cx1, ay, cx1 + reach, ay + len, 1);
      else if (side === 2) set(ax, cy0 - reach, ax + len, cy0, 1);
      else set(ax, cy1, ax + len, cy1 + reach, 1);
    } else if (op < 0.72) {
      // a notch out of a corner of the core
      const x0 = side % 2 ? cx1 - len : cx0;
      const y0 = side < 2 ? cy0 : cy1 - deep;
      set(x0, y0, x0 + len, y0 + deep, 0);
    } else {
      // a stair down from a corner: each step a cell in and a cell down
      const steps = 2 + Math.floor(R() * 3);
      for (let i = 0; i < steps; i++) {
        const w = steps - i;
        if (side === 0) set(cx0, cy0 + i, cx0 + w, cy0 + i + 1, 0);
        else if (side === 1) set(cx1 - w, cy0 + i, cx1, cy0 + i + 1, 0);
        else if (side === 2) set(cx0, cy1 - 1 - i, cx0 + w, cy1 - i, 0);
        else set(cx1 - w, cy1 - 1 - i, cx1, cy1 - i, 0);
      }
    }
  }
  // a void: a courtyard, a light well
  if (s.cut >= 34) {
    // inside the core, with at least two cells of wall around it, so it stays a void and not a notch
    const size = Math.min(cw - 4, ch - 4, 2 + Math.floor((s.cut / 100) * 3));
    if (size >= 1) {
      const vx = cx0 + 2 + Math.floor(R() * Math.max(1, cw - 4 - size + 1));
      const vy = cy0 + 2 + Math.floor(R() * Math.max(1, ch - 4 - size + 1));
      set(vx, vy, vx + size, vy + size, 0);
    }
  }
  // one piece: the largest connected part, so nothing floats free
  const seen = cells.map((row) => row.map(() => false));
  let best: Pt[] = [];
  for (let y = 0; y < G; y++)
    for (let x = 0; x < G; x++) {
      if (!cells[y][x] || seen[y][x]) continue;
      const part: Pt[] = [];
      const stack: Pt[] = [[x, y]];
      seen[y][x] = true;
      while (stack.length) {
        const [px, py] = stack.pop()!;
        part.push([px, py]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx >= 0 && ny >= 0 && nx < G && ny < G && cells[ny][nx] && !seen[ny][nx]) {
            seen[ny][nx] = true;
            stack.push([nx, ny]);
          }
        }
      }
      if (part.length > best.length) best = part;
    }
  const keep = Array.from({ length: G }, () => Array.from({ length: G }, () => 0));
  for (const [x, y] of best) keep[y][x] = 1;
  let rings = traceCells(keep).map((r) => r.map(([x, y]) => [x / G - 0.5, y / G - 0.5] as Pt));
  if (!rings.length) rings = [[[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]];
  // precise architecture is chamfered; a soft one rounded
  if (s.curve >= 70) rings = rings.map((r) => roundCorners(r, (s.curve - 60) / 80, 3));
  else if (s.curve >= 30) rings = rings.map((r) => bevel(r, ((s.curve - 20) / 100) * 0.08));
  return rings;
}

function radialRaw(R: () => number, s: ShapeRecipe): Ring[] {
  const rays = clampN(s.n, 3, 24);
  const irr = s.irregular / 100;
  const inner = 0.35 + R() * 0.3;
  const gapFrom = R() * TAU;
  const gap = (s.cut / 100) * Math.PI * 0.9;
  const pts: Ring = [];
  let cutDone = false;
  for (let i = 0; i < rays * 2; i++) {
    const a = (i / (rays * 2)) * TAU;
    // a sector cut away: the points inside it fall to the centre, once
    const rel = (a - gapFrom + TAU) % TAU;
    if (gap > 0.05 && rel < gap) {
      if (!cutDone) pts.push([0, 0]);
      cutDone = true;
      continue;
    }
    const r = i % 2 === 0 ? 1 - irr * 0.45 * R() : inner * (1 - irr * 0.3 * R());
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return [roundCorners(pts, (s.curve / 100) * 0.9, 4)];
}

function ringsRaw(R: () => number, s: ShapeRecipe): Ring[] {
  const n = clampN(s.n, 2, 6);
  const irr = s.irregular / 100;
  const dir = R() * TAU;
  const out: Ring[] = [];
  for (let k = 0; k < n; k++) {
    const r = 1 - (k / n) * 0.82 * (1 + (R() - 0.5) * irr * 0.5);
    // eccentric rings drift toward one side, as growth rings and ripples do
    const off = k * irr * 0.07;
    const cx = Math.cos(dir) * off;
    const cy = Math.sin(dir) * off;
    const wobble = s.warp / 100;
    out.push(
      Array.from({ length: RING_POINTS }, (_, i) => {
        const th = (i / RING_POINTS) * TAU;
        const rr = r * (1 + wobble * 0.06 * Math.sin(3 * th + k));
        return [cx + Math.cos(th) * rr, cy + Math.sin(th) * rr] as Pt;
      }),
    );
  }
  return out;
}

function shardsRaw(R: () => number, s: ShapeRecipe): Ring[] {
  const cuts = clampN(s.n, 1, 5);
  const irr = s.irregular / 100;
  const base: Ring =
    s.curve >= 55
      ? Array.from({ length: 48 }, (_, i) => [Math.cos((i / 48) * TAU), Math.sin((i / 48) * TAU)] as Pt)
      : [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  let pieces: Ring[] = [base];
  const along = R() * Math.PI;
  for (let k = 0; k < cuts; k++) {
    // a calm hand cuts parallel slices; a wild one cuts at any angle
    const a = along + (R() - 0.5) * irr * Math.PI;
    const p: Pt = [(R() - 0.5) * 1.1, (R() - 0.5) * 1.1];
    pieces = pieces.flatMap((q) => splitConvex(q, p, a));
  }
  const total = ringArea(base);
  pieces = pieces.filter((q) => ringArea(q) > total * 0.015);
  const gap = 0.03 + (s.cut / 100) * 0.16;
  const c = centroid(base);
  return pieces.map((q) => {
    const qc = centroid(q);
    const dx = qc[0] - c[0];
    const dy = qc[1] - c[1];
    const d = Math.hypot(dx, dy) || 1;
    const moved = q.map(([x, y]) => [x + (dx / d) * gap, y + (dy / d) * gap] as Pt);
    return rotate(moved, (R() - 0.5) * (s.warp / 100) * 0.35, [qc[0] + (dx / d) * gap, qc[1] + (dy / d) * gap]);
  });
}

function arcRaw(R: () => number, s: ShapeRecipe): Ring[] {
  const sweep = clampN((0.3 + R() * 0.35 + (s.n % 4) * 0.08) * TAU, 0.6, TAU * 0.92);
  const t0 = 0.16 + (1 - s.irregular / 100) * 0.18;
  const taper = s.irregular / 100;
  const a0 = R() * TAU;
  const K = 40;
  const outer: Ring = [];
  const inner: Ring = [];
  for (let i = 0; i <= K; i++) {
    const u = i / K;
    const a = a0 + sweep * u;
    // a brush's weight: full at the start, thinning toward the end as much as the figure is irregular
    const t = t0 * (1 - taper * 0.75 * u);
    outer.push([Math.cos(a), Math.sin(a)]);
    inner.push([Math.cos(a) * (1 - t), Math.sin(a) * (1 - t)]);
  }
  const cap = (from: Pt, to: Pt, bulge: number): Ring => {
    if (s.curve < 50) return [];
    const mx = (from[0] + to[0]) / 2;
    const my = (from[1] + to[1]) / 2;
    const r = Math.hypot(to[0] - from[0], to[1] - from[1]) / 2;
    const base = Math.atan2(from[1] - my, from[0] - mx);
    return Array.from({ length: 7 }, (_, i) => {
      const a = base + bulge * ((i + 1) / 8) * Math.PI;
      return [mx + Math.cos(a) * r, my + Math.sin(a) * r] as Pt;
    });
  };
  const endCap = cap(outer[K], inner[K], 1);
  const startCap = cap(inner[0], outer[0], 1);
  return [[...outer, ...endCap, ...[...inner].reverse(), ...startCap]];
}

/** An edge's profile: heights 0 (top) … 1 (the band's full depth) across its width, at `k + 1` points. */
export function edgeProfile(s: ShapeRecipe, k = 24): number[] {
  const R = rng(s.seed);
  const n = clampN(s.n, 2, 24);
  const irr = s.irregular / 100;
  const out: number[] = [];
  if (s.curve >= 60) {
    const ph = R() * TAU;
    const ph2 = R() * TAU;
    for (let i = 0; i <= k; i++) {
      const x = i / k;
      out.push(0.5 + 0.38 * Math.sin(x * TAU * (n / 4) + ph) * (1 - irr * 0.4) + 0.12 * irr * Math.sin(x * TAU * n * 0.9 + ph2));
    }
  } else if (s.curve <= 25 && irr < 0.5) {
    // steps: whole levels, like a section through terraces
    const levels = Array.from({ length: n }, () => Math.round(R() * 3) / 3);
    for (let i = 0; i <= k; i++) out.push(levels[Math.min(n - 1, Math.floor((i / k) * n))]);
  } else if (irr >= 0.6) {
    // a tear: a walk that wanders
    let y = 0.5;
    for (let i = 0; i <= k; i++) {
      y = clampN(y + (R() - 0.5) * 0.45, 0.05, 0.95);
      out.push(y);
    }
  } else {
    // teeth: a triangle wave, n to the width
    for (let i = 0; i <= k; i++) {
      const ph = ((i / k) * n) % 1;
      out.push(0.1 + 0.8 * (ph < 0.5 ? ph * 2 : (1 - ph) * 2));
    }
  }
  return out.map((v) => Math.round(clampN(v, 0, 1) * 100) / 100);
}

function edgeRaw(s: ShapeRecipe): Ring[] {
  const prof = edgeProfile(s, 32);
  const depth = 0.25 + (s.cut / 100) * 0.5;
  const top: Ring = prof.map((h, i) => [i / (prof.length - 1), h * depth]);
  return [[...top, [1, 1], [0, 1]]];
}

// ── custom outlines: points, or a path of lines and curves ─────────────

/** A path's outline as rings (curves flattened), or null when it uses what this cannot read (arcs, junk). */
export function parsePath(d: string): Ring[] | null {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtZz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g);
  if (!tokens || tokens.join('').length < d.replace(/[\s,]/g, '').length * 0.9) return null;
  const rings: Ring[] = [];
  let ring: Ring = [];
  let cmd = '';
  let i = 0;
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let ctrl: Pt | null = null;
  let qctrl: Pt | null = null;
  const num = () => {
    const t = tokens[i++];
    const v = Number(t);
    if (t === undefined || !Number.isFinite(v)) throw new Error('number');
    return v;
  };
  const isNum = () => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]);
  const cubic = (p1: Pt, p2: Pt, p3: Pt) => {
    for (let k = 1; k <= 12; k++) {
      const t = k / 12;
      const u = 1 - t;
      ring.push([u * u * u * cur[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * cur[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
    cur = p3;
  };
  const quad = (p1: Pt, p2: Pt) => {
    for (let k = 1; k <= 10; k++) {
      const t = k / 10;
      const u = 1 - t;
      ring.push([u * u * cur[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * cur[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
    }
    cur = p2;
  };
  try {
    while (i < tokens.length) {
      if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
      else if (!cmd) return null;
      const rel = cmd === cmd.toLowerCase();
      const at = (x: number, y: number): Pt => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
      switch (cmd.toUpperCase()) {
        case 'M': {
          if (ring.length >= 3) rings.push(ring);
          cur = at(num(), num());
          start = cur;
          ring = [cur];
          cmd = rel ? 'l' : 'L';
          ctrl = qctrl = null;
          break;
        }
        case 'L':
          cur = at(num(), num());
          ring.push(cur);
          ctrl = qctrl = null;
          break;
        case 'H':
          cur = [rel ? cur[0] + num() : num(), cur[1]];
          ring.push(cur);
          ctrl = qctrl = null;
          break;
        case 'V':
          cur = [cur[0], rel ? cur[1] + num() : num()];
          ring.push(cur);
          ctrl = qctrl = null;
          break;
        case 'C': {
          const p1 = at(num(), num());
          const p2 = at(num(), num());
          const p3 = at(num(), num());
          cubic(p1, p2, p3);
          ctrl = p2;
          qctrl = null;
          break;
        }
        case 'S': {
          const p1: Pt = ctrl ? [2 * cur[0] - ctrl[0], 2 * cur[1] - ctrl[1]] : cur;
          const p2 = at(num(), num());
          const p3 = at(num(), num());
          cubic(p1, p2, p3);
          ctrl = p2;
          qctrl = null;
          break;
        }
        case 'Q': {
          const p1 = at(num(), num());
          const p2 = at(num(), num());
          quad(p1, p2);
          qctrl = p1;
          ctrl = null;
          break;
        }
        case 'T': {
          const p1: Pt = qctrl ? [2 * cur[0] - qctrl[0], 2 * cur[1] - qctrl[1]] : cur;
          const p2 = at(num(), num());
          quad(p1, p2);
          qctrl = p1;
          ctrl = null;
          break;
        }
        case 'Z':
          if (ring.length >= 3) rings.push(ring);
          ring = [];
          cur = start;
          ctrl = qctrl = null;
          if (isNum()) return null;
          break;
        default:
          return null;
      }
      if (rings.reduce((s, r) => s + r.length, 0) + ring.length > 600 || rings.length > 6) return null;
    }
  } catch {
    return null;
  }
  if (ring.length >= 3) rings.push(ring);
  const kept = rings.map((r) => r.map(([x, y]) => [clampN(x, 0, 100), clampN(y, 0, 100)] as Pt)).filter((r) => ringArea(r) > 4);
  return kept.length ? kept : null;
}

// ── the shape itself ─────────────────────────────────────────────────

const SMOOTH: readonly ShapeKind[] = ['organic', 'super', 'rings'];
const cache = new Map<string, Ring[]>();

/** Fitted to fill the 0–100 box in both directions: the place a shape is given decides its proportions. */
function fit(rings: Ring[]): Ring[] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rings)
    for (const [x, y] of r) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  const w = x1 - x0 || 1;
  const h = y1 - y0 || 1;
  return rings.map((r) => r.map(([x, y]) => [round1(((x - x0) / w) * 100), round1(((y - y0) / h) * 100)] as Pt));
}

/** The shape's rings in a 0–100 box. Deterministic; cached by recipe. */
export function shapeRings(s: ShapeRecipe): Ring[] {
  const key = shapeKey(s);
  const hit = cache.get(key);
  if (hit) return hit;
  let rings: Ring[];
  if (s.kind === 'custom') {
    rings = s.points ? [s.points.map((p) => [p[0], p[1]] as Pt)] : parsePath(s.path ?? '') ?? [[[0, 0], [100, 0], [100, 100], [0, 100]]];
  } else if (s.kind === 'edge') {
    rings = fit(edgeRaw(s)).map((r) => resampleKeep(r, RING_POINTS).map(([x, y]) => [round1(x), round1(y)] as Pt));
  } else {
    const R = rng(s.seed);
    const raw =
      s.kind === 'poly' ? polyRaw(R, s)
      : s.kind === 'organic' ? organicRaw(R, s)
      : s.kind === 'super' ? superRaw(R, s)
      : s.kind === 'stepped' ? steppedRaw(R, s)
      : s.kind === 'radial' ? radialRaw(R, s)
      : s.kind === 'rings' ? ringsRaw(R, s)
      : s.kind === 'shards' ? shardsRaw(R, s)
      : arcRaw(R, s);
    // turned, then warped: a wave through the figure and a twist about its centre
    const turn = (s.turn / 180) * Math.PI;
    const w = s.warp / 100;
    const ph1 = R() * TAU;
    const ph2 = R() * TAU;
    let shaped = raw.map((r) => (turn ? rotate(r, turn) : r));
    if (w > 0.02 && s.kind !== 'rings')
      shaped = shaped.map((r) =>
        r.map(([x, y]) => {
          const d = Math.hypot(x, y);
          const tw = w * 0.5 * d;
          const nx = x * Math.cos(tw) - y * Math.sin(tw);
          const ny = x * Math.sin(tw) + y * Math.cos(tw);
          return [nx + w * 0.16 * Math.sin(ny * 2.4 + ph1), ny + w * 0.1 * Math.sin(nx * 2.8 + ph2)] as Pt;
        }),
      );
    rings = fit(shaped);
    // one ring: always the same number of points, so any two shapes can morph into each other
    if (rings.length === 1) rings = [SMOOTH.includes(s.kind) || (s.kind === 'arc' && s.curve >= 50) || rings[0].length > RING_POINTS ? resampleEven(rings[0], RING_POINTS) : resampleKeep(rings[0], RING_POINTS)].map((r) => r.map(([x, y]) => [round1(x), round1(y)] as Pt));
  }
  if (cache.size > 400) cache.clear();
  cache.set(key, rings);
  return rings;
}

const pc = (n: number) => `${round1(n)}%`;

/**
 * A CSS clip-path for the shape: one polygon in percentages. Several rings (voids, fragments) are joined by bridges
 * that run out and back along one line, which the even-odd rule draws as nothing.
 */
export function clipPolygon(rings: readonly Ring[]): string {
  if (!rings.length) return 'none';
  if (rings.length === 1) return `polygon(${rings[0].map(([x, y]) => `${pc(x)} ${pc(y)}`).join(',')})`;
  const pts: Pt[] = [];
  const home = rings[0][0];
  rings.forEach((r, i) => {
    pts.push(...r, r[0]);
    if (i > 0) pts.push(home);
  });
  return `polygon(evenodd,${pts.map(([x, y]) => `${pc(x)} ${pc(y)}`).join(',')})`;
}

/** An SVG path in the 0–100 box; curved kinds smoothed through their points (Catmull–Rom as cubic curves). */
export function svgPath(rings: readonly Ring[], smooth = false): string {
  const f = (n: number) => String(round1(n));
  return rings
    .map((r) => {
      if (!smooth || r.length < 4) return `M${r.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
      const n = r.length;
      let d = `M${f(r[0][0])} ${f(r[0][1])}`;
      for (let i = 0; i < n; i++) {
        const p0 = r[(i - 1 + n) % n];
        const p1 = r[i];
        const p2 = r[(i + 1) % n];
        const p3 = r[(i + 2) % n];
        d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
      }
      return `${d}Z`;
    })
    .join('');
}

/** Whether a recipe's outline is drawn smoothed. */
export const smoothShape = (s: ShapeRecipe) => SMOOTH.includes(s.kind) || (s.kind === 'arc' && s.curve >= 50);

/**
 * A picture broken into fragments: the picture's box cut by the recipe's straight cuts (calm hands cut parallel, wild
 * ones at any angle), each piece with its clip-path and how far it is pulled from the centre (percent of the
 * picture) and turned. Each piece carries its part of the picture with it, so the picture itself is displaced.
 */
export function fragmentPieces(s: ShapeRecipe): { clip: string; dx: number; dy: number; turn: number }[] {
  const R = rng(s.seed);
  const cuts = clampN(s.n, 1, 5);
  const irr = s.irregular / 100;
  let pieces: Ring[] = [[[0, 0], [100, 0], [100, 100], [0, 100]]];
  const along = R() * Math.PI;
  for (let k = 0; k < cuts; k++) {
    const a = along + (R() - 0.5) * irr * Math.PI;
    const p: Pt = [50 + (R() - 0.5) * 55, 50 + (R() - 0.5) * 55];
    pieces = pieces.flatMap((q) => splitConvex(q, p, a));
  }
  pieces = pieces.filter((q) => ringArea(q) > 200);
  const gap = 1.2 + (s.cut / 100) * 4.5;
  return pieces.map((q) => {
    const [cx, cy] = centroid(q);
    const dx = cx - 50;
    const dy = cy - 50;
    const d = Math.hypot(dx, dy) || 1;
    return { clip: clipPolygon([q.map(([x, y]) => [round1(x), round1(y)] as Pt)]), dx: round1((dx / d) * gap), dy: round1((dy / d) * gap), turn: round1((R() - 0.5) * (s.warp / 100) * 4) };
  });
}

/**
 * A section's top edge as a clip-path: the edge's profile across the width, each point that far down a depth the
 * page sets (a CSS variable), so the edge keeps its depth in pixels at any width and height.
 */
export function edgeClip(s: ShapeRecipe, depth = '--edge-d'): string {
  const prof = edgeProfile(s, 24);
  const top = prof.map((h, i) => `${round1((i / (prof.length - 1)) * 100)}% calc(var(${depth}) * ${h})`);
  return `polygon(${top.join(',')},100% 100%,0% 100%)`;
}

/** A CSS shape-outside polygon from the shape's largest ring: what words flow around. */
export function outsidePolygon(rings: readonly Ring[]): string {
  if (!rings.length) return 'none';
  const big = rings.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
  // every other point is close enough for words to run along, and half the length to send
  const pts = big.length > 48 ? big.filter((_, i) => i % 2 === 0) : big;
  return `polygon(${pts.map(([x, y]) => `${pc(x)} ${pc(y)}`).join(',')})`;
}

/**
 * The shape's points carried out to its box's edge along lines from the centre: a rectangle with the same points,
 * so a picture's plain frame can become the shape (a clip-path transition). Null for shapes of several rings.
 */
export function morphFrom(rings: readonly Ring[]): string | null {
  if (rings.length !== 1) return null;
  const pts = rings[0].map(([x, y]) => {
    const dx = x - 50;
    const dy = y - 50;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return [50, 50] as Pt;
    const k = Math.min(Math.abs(dx) > 1e-6 ? 50 / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? 50 / Math.abs(dy) : Infinity);
    return [50 + dx * k, 50 + dy * k] as Pt;
  });
  return `polygon(${pts.map(([x, y]) => `${pc(x)} ${pc(y)}`).join(',')})`;
}

/** How much of its box a shape covers, 0–1 (even-odd, sampled): a picture cut to it must keep enough of itself. */
export function fillRatio(rings: readonly Ring[]): number {
  const G = 32;
  let hit = 0;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) if (insideAll(rings, ((i + 0.5) / G) * 100, ((j + 0.5) / G) * 100)) hit++;
  return hit / (G * G);
}

/** A shape in words, for the editor and the designer's notes: "a seven-sided polygon, softly rounded, turned 12°". */
export function describeShape(s: ShapeRecipe): string {
  const NUM = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const parts: string[] = [];
  const word = (n: number) => NUM[n] ?? String(n);
  if (s.kind === 'poly') parts.push(`${s.irregular >= 50 ? 'an irregular' : 'a'} ${word(clampN(s.n, 3, 12))}-sided polygon${s.mirror ? ', mirrored' : ''}`);
  else if (s.kind === 'stepped') parts.push(`a stepped outline${s.cut >= 34 ? ' with a void' : ''}`);
  else if (s.kind === 'radial') parts.push(`${word(clampN(s.n, 3, 24))} rays${s.cut >= 20 ? ', a sector cut away' : ''}`);
  else if (s.kind === 'rings') parts.push(`${word(clampN(s.n, 2, 6))} ${s.irregular >= 40 ? 'eccentric' : 'concentric'} rings`);
  else if (s.kind === 'shards') parts.push(`a figure cut ${word(clampN(s.n, 1, 5))} time${s.n === 1 ? '' : 's'} and pulled apart`);
  else if (s.kind === 'arc') parts.push(`${s.irregular >= 50 ? 'a tapering' : 'an even'} arc`);
  else parts.push(SHAPE_SAYS[s.kind]);
  if (s.kind !== 'custom' && s.kind !== 'organic' && s.kind !== 'rings') parts.push(s.curve >= 70 ? 'rounded' : s.curve >= 30 ? 'softened' : 'hard-cornered');
  if (s.turn && Math.abs(s.turn) >= 3) parts.push(`turned ${Math.abs(s.turn)}°`);
  if (s.warp >= 30) parts.push('warped');
  return parts.join(', ');
}
