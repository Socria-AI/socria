// lib/ux-v0/graphics/vectorops.ts — the geometry of objects: outlines, transforms, paths read from SVG data.
//
// Every shape object can say what its outline is as an editable Bézier path in its own box (a rectangle with rounded
// corners, an ellipse, a star, a recipe of the shape grammar, a parametric primitive, a path), and where its box sits
// in its parent (translate, rotate about the centre, skew, flip: the same transform the renderer writes). From those
// two, booleans combine objects exactly where they are, "convert to path" keeps how a shape looks while making every
// node editable, and stroke outlines and offsets work on the shape as drawn. SVG path data (M L H V C S Q T A Z, both
// cases; arcs become cubic Béziers) is read into the same paths, for imports and stored paths alike.

import { shapeRings, smoothShape, svgPath } from '../shape';
import {
  booleanRegions,
  ellipseSub,
  flatten,
  mapPath,
  outlineRings,
  offsetRings,
  pathBounds,
  polySub,
  primPath,
  regionPath,
  regularPoints,
  roundPoly,
  scalePath,
  smoothThrough,
  type BNode,
  type BezierPath,
  type BoolMode,
  type P2,
  type Subpath,
} from './geometry';
import type { Base, Node, ShapeNode } from './doc';

// ── affine transforms (SVG's matrix(a b c d e f): x' = a x + c y + e, y' = b x + d y + f) ──

export type Mat = [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];
export const mul = (m: Mat, n: Mat): Mat => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
export const apply = (m: Mat, x: number, y: number): P2 => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
const rotate = (deg: number): Mat => {
  const a = (deg * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
};
const about = (m: Mat, cx: number, cy: number): Mat => mul(translate(cx, cy), mul(m, translate(-cx, -cy)));

/** A node's box transform (local → parent): translate, rotate about the centre, skew and flip about the centre. The
 * renderer writes exactly this. */
export function nodeMatrix(n: Pick<Base, 'x' | 'y' | 'w' | 'h' | 'rotation' | 'skewX' | 'skewY' | 'flipX' | 'flipY'>): Mat {
  const cx = n.w / 2;
  const cy = n.h / 2;
  let m = translate(n.x, n.y);
  if (n.rotation) m = mul(m, about(rotate(n.rotation), cx, cy));
  if (n.skewX || n.skewY) m = mul(m, about([1, Math.tan(((n.skewY ?? 0) * Math.PI) / 180), Math.tan(((n.skewX ?? 0) * Math.PI) / 180), 1, 0, 0], cx, cy));
  if (n.flipX || n.flipY) m = mul(m, about([n.flipX ? -1 : 1, 0, 0, n.flipY ? -1 : 1, 0, 0], cx, cy));
  return m;
}
export const transformPath = (p: BezierPath, m: Mat): BezierPath => mapPath(p, (x, y) => apply(m, x, y));

/** An SVG transform attribute as a matrix (matrix, translate, scale, rotate, skewX, skewY); identity when unread. */
export function parseTransform(s: string | undefined | null): Mat {
  let m: Mat = IDENTITY;
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(s))) {
    const v = (hit[2].match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    let t: Mat = IDENTITY;
    switch (hit[1]) {
      case 'matrix':
        if (v.length === 6) t = v as Mat;
        break;
      case 'translate':
        t = translate(v[0] ?? 0, v[1] ?? 0);
        break;
      case 'scale':
        t = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
        break;
      case 'rotate':
        t = v.length >= 3 ? about(rotate(v[0]), v[1], v[2]) : rotate(v[0] ?? 0);
        break;
      case 'skewX':
        t = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    if (t.every(Number.isFinite)) m = mul(m, t);
  }
  return m;
}

// ── SVG path data ──

const MAX_PATH_NODES = 4000;

/** Arc parameters (SVG's endpoint form) as cubic Béziers: [c1, c2, end][]. */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, phiDeg: number, fa: boolean, fs: boolean, x2: number, y2: number): [P2, P2, P2][] {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[[x1, y1], [x2, y2], [x2, y2]]];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / (den || 1e-12)));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= Math.PI * 2;
  if (fs && dt < 0) dt += Math.PI * 2;
  const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / segs;
  const k = (4 / 3) * Math.tan(step / 4);
  const out: [P2, P2, P2][] = [];
  const pt = (t: number): P2 => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const der = (t: number): P2 => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  for (let i = 0; i < segs; i++) {
    const a = t1 + step * i;
    const b = a + step;
    const p0 = pt(a);
    const p3 = i === segs - 1 ? ([x2, y2] as P2) : pt(b);
    const d0 = der(a);
    const d1 = der(b);
    out.push([[p0[0] + d0[0] * k, p0[1] + d0[1] * k], [p3[0] - d1[0] * k, p3[1] - d1[1] * k], p3]);
  }
  return out;
}

/** SVG path data read into an editable path (every command, both cases; arcs as cubics); null when unreadable. */
export function parseD(d: string): BezierPath | null {
  if (typeof d !== 'string' || d.length > 400_000) return null;
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens || !/^[Mm]$/.test(tokens[0])) return null;
  const subpaths: Subpath[] = [];
  let cur: Subpath | null = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let lastC: P2 | null = null; // the last cubic control (for S)
  let lastQ: P2 | null = null; // the last quadratic control (for T)
  let count = 0;
  let i = 0;
  let cmd = '';
  const num = (): number => {
    const t = tokens[i];
    if (t === undefined || /[A-Za-z]/.test(t)) throw new Error('number expected');
    i++;
    const v = Number(t);
    if (!Number.isFinite(v)) throw new Error('bad number');
    return v;
  };
  // arc flags may be written without separators ("a10 10 0 01 5 5"): read them a character at a time
  const flag = (): boolean => {
    const t = tokens[i];
    if (t === undefined) throw new Error('flag expected');
    if (t === '0' || t === '1') {
      i++;
      return t === '1';
    }
    if (/^[01]\d/.test(t)) {
      tokens[i] = t.slice(1);
      return t[0] === '1';
    }
    throw new Error('bad flag');
  };
  const node = (nx: number, ny: number): BNode => ({ x: Math.round(nx * 1000) / 1000, y: Math.round(ny * 1000) / 1000 });
  const lineTo = (nx: number, ny: number) => {
    cur!.nodes.push(node(nx, ny));
    x = nx;
    y = ny;
  };
  const cubicTo = (c1: P2, c2: P2, nx: number, ny: number) => {
    const last = cur!.nodes[cur!.nodes.length - 1];
    last.out = [Math.round(c1[0] * 1000) / 1000, Math.round(c1[1] * 1000) / 1000];
    const nd = node(nx, ny);
    nd.in = [Math.round(c2[0] * 1000) / 1000, Math.round(c2[1] * 1000) / 1000];
    cur!.nodes.push(nd);
    x = nx;
    y = ny;
  };
  try {
    while (i < tokens.length) {
      if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
      else if (!cmd) return null;
      if (++count > MAX_PATH_NODES) break;
      const rel = cmd === cmd.toLowerCase();
      const ox = rel ? x : 0;
      const oy = rel ? y : 0;
      switch (cmd.toUpperCase()) {
        case 'M': {
          const nx = num() + ox;
          const ny = num() + oy;
          cur = { closed: false, nodes: [node(nx, ny)] };
          subpaths.push(cur);
          x = sx = nx;
          y = sy = ny;
          cmd = rel ? 'l' : 'L';
          lastC = lastQ = null;
          continue;
        }
        case 'Z': {
          if (cur) {
            cur.closed = true;
            const f = cur.nodes[0];
            const l = cur.nodes[cur.nodes.length - 1];
            if (cur.nodes.length > 1 && Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) {
              if (l.in) f.in = l.in;
              cur.nodes.pop();
            }
          }
          x = sx;
          y = sy;
          cur = null;
          lastC = lastQ = null;
          cmd = '';
          continue;
        }
      }
      if (!cur) {
        cur = { closed: false, nodes: [node(x, y)] };
        subpaths.push(cur);
      }
      switch (cmd.toUpperCase()) {
        case 'L':
          lineTo(num() + ox, num() + oy);
          lastC = lastQ = null;
          break;
        case 'H':
          lineTo(num() + ox, y);
          lastC = lastQ = null;
          break;
        case 'V':
          lineTo(x, num() + oy);
          lastC = lastQ = null;
          break;
        case 'C': {
          const c1: P2 = [num() + ox, num() + oy];
          const c2: P2 = [num() + ox, num() + oy];
          const nx = num() + ox;
          const ny = num() + oy;
          cubicTo(c1, c2, nx, ny);
          lastC = c2;
          lastQ = null;
          break;
        }
        case 'S': {
          const c1: P2 = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
          const c2: P2 = [num() + ox, num() + oy];
          const nx = num() + ox;
          const ny = num() + oy;
          cubicTo(c1, c2, nx, ny);
          lastC = c2;
          lastQ = null;
          break;
        }
        case 'Q': {
          const q: P2 = [num() + ox, num() + oy];
          const nx = num() + ox;
          const ny = num() + oy;
          cubicTo([x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y)], [nx + (2 / 3) * (q[0] - nx), ny + (2 / 3) * (q[1] - ny)], nx, ny);
          lastQ = q;
          lastC = null;
          break;
        }
        case 'T': {
          const q: P2 = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y];
          const nx = num() + ox;
          const ny = num() + oy;
          cubicTo([x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y)], [nx + (2 / 3) * (q[0] - nx), ny + (2 / 3) * (q[1] - ny)], nx, ny);
          lastQ = q;
          lastC = null;
          break;
        }
        case 'A': {
          const rx = num();
          const ry = num();
          const rot = num();
          const fa = flag();
          const fs = flag();
          const nx = num() + ox;
          const ny = num() + oy;
          for (const [c1, c2, e] of arcToCubics(x, y, rx, ry, rot, fa, fs, nx, ny)) cubicTo(c1, c2, e[0], e[1]);
          lastC = lastQ = null;
          break;
        }
        default:
          return null;
      }
    }
  } catch {
    if (!subpaths.some((s) => s.nodes.length > 1)) return null;
  }
  const kept = subpaths.filter((s) => s.nodes.length > 1 || (s.closed && s.nodes.length > 0));
  for (const s of kept) markSmooth(s);
  return kept.length ? { subpaths: kept } : null;
}

/** Nodes whose two handles point opposite ways are smooth nodes (what an editor shows and keeps). */
function markSmooth(s: Subpath) {
  for (const nd of s.nodes) {
    if (!nd.in || !nd.out) continue;
    const ax = nd.x - nd.in[0];
    const ay = nd.y - nd.in[1];
    const bx = nd.out[0] - nd.x;
    const by = nd.out[1] - nd.y;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (la > 1e-6 && lb > 1e-6 && Math.abs((ax * bx + ay * by) / (la * lb) - 1) < 1e-3) nd.smooth = true;
  }
}

// ── an object's outline ──

const SMOOTH_SAMPLE = (s: string) => s; // svgPath output is already path data

/** A shape's outline as an editable path in its own box (0–w, 0–h); null for what has no outline. */
export function shapeBezier(n: ShapeNode): BezierPath | null {
  const { w, h } = n;
  switch (n.shape) {
    case 'rect':
      return { subpaths: [n.radius ? roundPoly([[0, 0], [w, 0], [w, h], [0, h]], Math.min(n.radius, w / 2, h / 2)) : polySub([[0, 0], [w, 0], [w, h], [0, h]])] };
    case 'ellipse':
      return { subpaths: [ellipseSub(w / 2, h / 2, w / 2, h / 2)] };
    case 'line':
      return { subpaths: [polySub([[0, h / 2], [w, h / 2]], false)] };
    case 'polygon':
      return { subpaths: [polySub(regularPoints(w / 2, h / 2, w / 2, h / 2, n.sides ?? 6))] };
    case 'star':
      return { subpaths: [polySub(regularPoints(w / 2, h / 2, w / 2, h / 2, n.sides ?? 5, -90, n.inner ?? 0.45))] };
    case 'path': {
      const p = parseD(n.path ?? '');
      return p ? scalePath(p, w / 100, h / 100) : null;
    }
    case 'recipe': {
      if (!n.recipe) return null;
      const rings = shapeRings(n.recipe);
      if (!rings.length) return null;
      const p = parseD(SMOOTH_SAMPLE(svgPath(rings, smoothShape(n.recipe))));
      return p ? scalePath(p, w / 100, h / 100) : null;
    }
    case 'prim':
      return n.prim ? primPath(n.prim, w, h) : null;
    case 'bezier':
      return n.bez ? scalePath(n.bez, w / 100, h / 100) : null;
  }
  return null;
}

/** A shape's outline in its parent's coordinates (its box transform applied). */
export function shapeInParent(n: ShapeNode): BezierPath | null {
  const p = shapeBezier(n);
  return p ? transformPath(p, nodeMatrix(n)) : null;
}

/** A live boolean of a group's shapes, in the group's own coordinates; the first shape is the subject when
 * subtracting. Text, pictures and charts take no part (they have no outline here). */
export function booleanPath(children: readonly Node[], mode: BoolMode): BezierPath {
  const shapes: P2[][][] = [];
  for (const c of children) {
    if (c.hidden) continue;
    let p: BezierPath | null = null;
    if (c.type === 'shape') p = shapeInParent(c);
    else if (c.type === 'group' && c.boolean) p = transformPath(booleanPath(c.children, c.boolean), nodeMatrix(c));
    if (!p) continue;
    shapes.push(flatten(p, 1).rings);
  }
  return regionPath(booleanRegions(shapes, mode));
}

/** A path, box and placement for a node that becomes a path: the outline baked into the parent's coordinates (its
 * rotation, skew and flip included), stored in a 0–100 box that is the outline's own bounds. */
export function asBezierNode(path: BezierPath): { x: number; y: number; w: number; h: number; bez: BezierPath } | null {
  const b = pathBounds(path);
  if (!(b.w > 0.01) && !(b.h > 0.01)) return null;
  const w = Math.max(1, b.w);
  const h = Math.max(1, b.h);
  return { x: b.x, y: b.y, w, h, bez: mapPath(path, (px, py) => [((px - b.x) / w) * 100, ((py - b.y) / h) * 100]) };
}

/** A shape's stroke as an area (outline stroke), in the parent's coordinates. */
export function strokeOutline(n: ShapeNode): BezierPath | null {
  const p = shapeInParent(n);
  if (!p || !n.stroke) return null;
  const f = flatten(p, 1);
  return regionPath(outlineRings(f.rings, f.closed, n.stroke.width));
}

/** A shape grown (d > 0) or shrunk (d < 0) by |d| px, in the parent's coordinates. */
export function offsetOutline(n: ShapeNode, d: number): BezierPath | null {
  const p = shapeInParent(n);
  if (!p) return null;
  const f = flatten(p, 1);
  return regionPath(offsetRings(f.rings, f.closed, d));
}

// ── blending two outlines (interpolation) ──

function resample(ring: readonly P2[], n: number, closed: boolean): P2[] {
  const pts = closed ? [...ring, ring[0]] : [...ring];
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = lens[lens.length - 1] || 1;
  const out: P2[] = [];
  let k = 1;
  for (let i = 0; i < n; i++) {
    const t = (i / (closed ? n : n - 1)) * total;
    while (k < lens.length - 1 && lens[k] < t) k++;
    const u = (t - lens[k - 1]) / Math.max(1e-9, lens[k] - lens[k - 1]);
    out.push([pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * u, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * u]);
  }
  return out;
}
const signedArea = (r: readonly P2[]) => r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0) / 2;

/** Two outlines brought to the same structure (each one's largest ring resampled to n points, turned the same way and
 * started at the nearest point), so a blend between any two shapes is possible: smooth curves through the points. */
export function blendPaths(a: BezierPath, b: BezierPath, t: number, n = 96): BezierPath | null {
  const pick = (p: BezierPath) => {
    const f = flatten(p, 1);
    let best = -1;
    let area = -1;
    f.rings.forEach((r, i) => {
      const ar = Math.abs(signedArea(r));
      if (r.length >= 2 && ar >= area) {
        area = ar;
        best = i;
      }
    });
    return best >= 0 ? { ring: f.rings[best], closed: f.closed[best] } : null;
  };
  const A = pick(a);
  const B = pick(b);
  if (!A || !B) return null;
  const closed = A.closed && B.closed;
  let ra = resample(A.ring, n, closed);
  let rb = resample(B.ring, n, closed);
  if (closed) {
    if (Math.sign(signedArea(ra)) !== Math.sign(signedArea(rb))) rb = rb.reverse();
    let bestK = 0;
    let bestD = Infinity;
    for (let k = 0; k < n; k += 2) {
      let d = 0;
      for (let i = 0; i < n; i += 4) d += Math.hypot(ra[i][0] - rb[(i + k) % n][0], ra[i][1] - rb[(i + k) % n][1]);
      if (d < bestD) {
        bestD = d;
        bestK = k;
      }
    }
    rb = rb.slice(bestK).concat(rb.slice(0, bestK));
  }
  ra = ra.map((p, i) => [p[0] + (rb[i][0] - p[0]) * t, p[1] + (rb[i][1] - p[1]) * t]);
  return { subpaths: [closed ? smoothThrough(ra.filter((_, i) => i % 3 === 0), true, 1) : polySub(ra, false)] };
}
