// lib/ux-v0/graphics/geometry.ts — editable vector geometry: Bézier paths, parametric primitives, booleans, offsets.
//
// A path is a list of subpaths, each a list of nodes: an anchor (x, y) and, optionally, the absolute position of the
// handle before it (in) and after it (out). A segment between two nodes is a straight line when neither handle is
// there, a cubic Bézier otherwise. Smooth nodes keep their two handles opposite; corner nodes move them freely. This is
// the representation the designer edits (anchors and handles on the canvas), the one primitives are built in, and
// the one booleans and offsets return, so every shape can become an editable path ("convert to path") without loss.
//
// PRIMITIVES are parametric: a kind and a few numbers (a star's points and inner radius, a wave's amplitude and
// frequency, a guilloché's petals and loops), drawn in the node's own box. Nothing here is a stored picture: the same
// parameters always give the same geometry (seeded where there is randomness), so a document stores parameters and
// the inspector edits them. Boolean operations, offsets and stroke outlines run on the flattened geometry through
// polygon-clipping (a robust Martinez–Rueda implementation) and come back as paths of corner nodes.

import polygonClipping, { type MultiPolygon, type Polygon as PcPolygon } from 'polygon-clipping';

export type P2 = [number, number];
export interface BNode {
  x: number;
  y: number;
  /** the handle before the anchor (absolute) */
  in?: P2;
  /** the handle after the anchor (absolute) */
  out?: P2;
  /** a smooth node keeps its handles opposite */
  smooth?: boolean;
}
export interface Subpath {
  closed: boolean;
  nodes: BNode[];
}
export interface BezierPath {
  subpaths: Subpath[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();
const TAU = Math.PI * 2;
const deg = (d: number) => (d * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── deterministic randomness ──

/** A seeded generator (mulberry32): the same seed, the same sequence. */
export function rng(seed: number): () => number {
  let a = (Math.floor(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 2D value noise in [-1, 1], seeded (a lattice of random values, interpolated). */
export function noise2(seed: number): (x: number, y: number) => number {
  const hash = (i: number, j: number) => {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
  };
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = fade(x - xi);
    const yf = fade(y - yi);
    const a = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * xf;
    const b = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * xf;
    return a + (b - a) * yf;
  };
}

// ── building paths ──

export const corner = (x: number, y: number): BNode => ({ x: r3(x), y: r3(y) });
export function polySub(pts: readonly P2[], closed = true): Subpath {
  return { closed, nodes: pts.map(([x, y]) => corner(x, y)) };
}

/** An arc of an ellipse as anchors with cubic handles (each piece at most a quarter turn). The first node has only
 * its out handle, the last only its in handle; join them to neighbours as needed. */
export function arcNodes(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): BNode[] {
  const span = a1 - a0;
  const pieces = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 2) - 1e-9));
  const step = span / pieces;
  const k = (4 / 3) * Math.tan(step / 4);
  const pt = (t: number): P2 => [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
  const d = (t: number): P2 => [-rx * Math.sin(t), ry * Math.cos(t)];
  const out: BNode[] = [];
  for (let i = 0; i <= pieces; i++) {
    const t = a0 + step * i;
    const [x, y] = pt(t);
    const [dx, dy] = d(t);
    const nd: BNode = { x: r3(x), y: r3(y), smooth: i > 0 && i < pieces };
    if (i > 0) nd.in = [r3(x - dx * k), r3(y - dy * k)];
    if (i < pieces) nd.out = [r3(x + dx * k), r3(y + dy * k)];
    out.push(nd);
  }
  return out;
}

/** A whole ellipse as one closed subpath of four smooth nodes. */
export function ellipseSub(cx: number, cy: number, rx: number, ry: number): Subpath {
  const nodes = arcNodes(cx, cy, rx, ry, 0, TAU);
  const last = nodes.pop()!;
  nodes[0].in = last.in;
  nodes[0].smooth = true;
  return { closed: true, nodes };
}

/** A polygon with each corner rounded by up to `r` (a number for all, or one per corner). */
export function roundPoly(pts: readonly P2[], r: number | readonly number[]): Subpath {
  const n = pts.length;
  if (n < 3) return polySub(pts);
  const nodes: BNode[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const rad = Array.isArray(r) ? (r as number[])[i] ?? 0 : (r as number);
    const l1 = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const l2 = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const cut = Math.min(rad, l1 / 2, l2 / 2);
    if (cut <= 0.01) {
      nodes.push(corner(p[0], p[1]));
      continue;
    }
    const a: P2 = [p[0] + ((prev[0] - p[0]) / l1) * cut, p[1] + ((prev[1] - p[1]) / l1) * cut];
    const b: P2 = [p[0] + ((next[0] - p[0]) / l2) * cut, p[1] + ((next[1] - p[1]) / l2) * cut];
    const k = 0.5523;
    nodes.push({ x: r3(a[0]), y: r3(a[1]), out: [r3(a[0] + (p[0] - a[0]) * k), r3(a[1] + (p[1] - a[1]) * k)] });
    nodes.push({ x: r3(b[0]), y: r3(b[1]), in: [r3(b[0] + (p[0] - b[0]) * k), r3(b[1] + (p[1] - b[1]) * k)] });
  }
  return { closed: true, nodes };
}

/** A smooth curve through points (Catmull–Rom, as cubic Béziers): closed or open. */
export function smoothThrough(pts: readonly P2[], closed: boolean, tension = 1): Subpath {
  const n = pts.length;
  if (n < 3) return polySub(pts, closed);
  const at = (i: number) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  const nodes: BNode[] = pts.map((p, i) => {
    const a = at(i - 1);
    const b = at(i + 1);
    const tx = ((b[0] - a[0]) / 6) * tension;
    const ty = ((b[1] - a[1]) / 6) * tension;
    const nd: BNode = { x: r3(p[0]), y: r3(p[1]), smooth: true };
    if (closed || i > 0) nd.in = [r3(p[0] - tx), r3(p[1] - ty)];
    if (closed || i < n - 1) nd.out = [r3(p[0] + tx), r3(p[1] + ty)];
    return nd;
  });
  return { closed, nodes };
}

export const regularPoints = (cx: number, cy: number, rx: number, ry: number, count: number, rot = -90, inner?: number): P2[] => {
  const pts: P2[] = [];
  const total = inner !== undefined ? count * 2 : count;
  for (let i = 0; i < total; i++) {
    const a = deg(rot) + (i * TAU) / total;
    const k = inner !== undefined && i % 2 ? inner : 1;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
};

// ── as SVG; mapped; measured ──

/** The path's SVG data (M, L, C, Z only). */
export function pathD(p: BezierPath): string {
  const out: string[] = [];
  for (const s of p.subpaths) {
    if (!s.nodes.length) continue;
    const seg = (a: BNode, b: BNode) => (a.out || b.in ? `C${n2(a.out?.[0] ?? a.x)} ${n2(a.out?.[1] ?? a.y)} ${n2(b.in?.[0] ?? b.x)} ${n2(b.in?.[1] ?? b.y)} ${n2(b.x)} ${n2(b.y)}` : `L${n2(b.x)} ${n2(b.y)}`);
    let d = `M${n2(s.nodes[0].x)} ${n2(s.nodes[0].y)}`;
    for (let i = 1; i < s.nodes.length; i++) d += seg(s.nodes[i - 1], s.nodes[i]);
    if (s.closed && s.nodes.length > 1) d += `${seg(s.nodes[s.nodes.length - 1], s.nodes[0])}Z`;
    out.push(d);
  }
  return out.join('');
}

/** Every anchor and handle mapped through f. */
export function mapPath(p: BezierPath, f: (x: number, y: number) => P2): BezierPath {
  const m = (pt?: P2) => (pt ? (f(pt[0], pt[1]).map(r3) as P2) : undefined);
  return {
    subpaths: p.subpaths.map((s) => ({
      closed: s.closed,
      nodes: s.nodes.map((nd) => {
        const [x, y] = f(nd.x, nd.y);
        const o: BNode = { x: r3(x), y: r3(y) };
        if (nd.in) o.in = m(nd.in);
        if (nd.out) o.out = m(nd.out);
        if (nd.smooth) o.smooth = true;
        return o;
      }),
    })),
  };
}
export const scalePath = (p: BezierPath, sx: number, sy: number, dx = 0, dy = 0) => mapPath(p, (x, y) => [x * sx + dx, y * sy + dy]);

/** The bounds of a path's anchors and handles (a little larger than the curve's own: enough for a box). */
export function pathBounds(p: BezierPath): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const ring of flatten(p).rings)
    for (const [x, y] of ring) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const cubicAt = (p0: P2, p1: P2, p2: P2, p3: P2, t: number): P2 => {
  const u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
};

/** The path as polylines (curves sampled finely enough for geometry): its rings, and whether each is closed. */
export function flatten(p: BezierPath, step = 1.5): { rings: P2[][]; closed: boolean[] } {
  const rings: P2[][] = [];
  const closed: boolean[] = [];
  for (const s of p.subpaths) {
    if (!s.nodes.length) continue;
    const pts: P2[] = [[s.nodes[0].x, s.nodes[0].y]];
    const seg = (a: BNode, b: BNode) => {
      if (!a.out && !b.in) return pts.push([b.x, b.y]);
      const p0: P2 = [a.x, a.y];
      const p1: P2 = a.out ?? p0;
      const p3: P2 = [b.x, b.y];
      const p2: P2 = b.in ?? p3;
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
      const k = clamp(Math.ceil(len / step), 3, 48);
      for (let i = 1; i <= k; i++) pts.push(cubicAt(p0, p1, p2, p3, i / k));
    };
    for (let i = 1; i < s.nodes.length; i++) seg(s.nodes[i - 1], s.nodes[i]);
    if (s.closed && s.nodes.length > 1) {
      seg(s.nodes[s.nodes.length - 1], s.nodes[0]);
      pts.pop();
    }
    rings.push(pts);
    closed.push(s.closed);
  }
  return { rings, closed };
}

/** The length of a path's curves (open and closed alike). */
export function pathLength(p: BezierPath): number {
  const f = flatten(p, 1);
  return f.rings.reduce((s, ring, i) => {
    let l = 0;
    for (let k = 1; k < ring.length; k++) l += Math.hypot(ring[k][0] - ring[k - 1][0], ring[k][1] - ring[k - 1][1]);
    if (f.closed[i] && ring.length > 1) l += Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]);
    return s + l;
  }, 0);
}

// ── editing a path ──

const swapNode = (nd: BNode): BNode => ({ x: nd.x, y: nd.y, ...(nd.out ? { in: nd.out } : {}), ...(nd.in ? { out: nd.in } : {}), ...(nd.smooth ? { smooth: true } : {}) });
/** The same path drawn the other way (each subpath's direction reversed). */
export function reversePath(p: BezierPath): BezierPath {
  return { subpaths: p.subpaths.map((s) => ({ closed: s.closed, nodes: [...s.nodes].reverse().map(swapNode) })) };
}

/** Two open subpaths joined into one, by their nearest ends; null when either is closed. */
export function joinSubpaths(a: Subpath, b: Subpath): Subpath | null {
  if (a.closed || b.closed || !a.nodes.length || !b.nodes.length) return null;
  const A0 = a.nodes[0];
  const A1 = a.nodes[a.nodes.length - 1];
  const B0 = b.nodes[0];
  const B1 = b.nodes[b.nodes.length - 1];
  const d = (p: BNode, q: BNode) => Math.hypot(p.x - q.x, p.y - q.y);
  const options: [number, BNode[]][] = [
    [d(A1, B0), [...a.nodes, ...b.nodes]],
    [d(A1, B1), [...a.nodes, ...[...b.nodes].reverse().map(swapNode)]],
    [d(A0, B0), [...[...a.nodes].reverse().map(swapNode), ...b.nodes]],
    [d(A0, B1), [...b.nodes, ...a.nodes]],
  ];
  options.sort((x, y) => x[0] - y[0]);
  const nodes = options[0][1];
  // ends that meet become one node
  const out: BNode[] = [];
  for (const nd of nodes) {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - nd.x, last.y - nd.y) < 0.01) {
      out[out.length - 1] = { ...last, ...(nd.out ? { out: nd.out } : {}) };
      continue;
    }
    out.push({ ...nd });
  }
  return { closed: false, nodes: out };
}

/** A subpath cut at node `i`: an open one in two; a closed one opened there. */
export function splitSubpath(s: Subpath, i: number): Subpath[] {
  const n = s.nodes.length;
  if (n < 2 || i < 0 || i >= n) return [s];
  if (s.closed) {
    const nodes = [...s.nodes.slice(i), ...s.nodes.slice(0, i), { ...s.nodes[i] }];
    nodes[0] = { ...nodes[0] };
    delete nodes[0].in;
    delete nodes[nodes.length - 1].out;
    return [{ closed: false, nodes }];
  }
  if (i === 0 || i === n - 1) return [s];
  const left = s.nodes.slice(0, i + 1).map((x) => ({ ...x }));
  const right = s.nodes.slice(i).map((x) => ({ ...x }));
  delete left[left.length - 1].out;
  delete right[0].in;
  return [
    { closed: false, nodes: left },
    { closed: false, nodes: right },
  ];
}

/** A node inserted on segment `seg` (from node seg to seg+1) at parameter t, the curve kept exactly (de Casteljau). */
export function insertNode(s: Subpath, seg: number, t = 0.5): Subpath {
  const n = s.nodes.length;
  if (n < 2) return s;
  const i = clamp(Math.floor(seg), 0, s.closed ? n - 1 : n - 2);
  const a = s.nodes[i];
  const b = s.nodes[(i + 1) % n];
  const p0: P2 = [a.x, a.y];
  const p1: P2 = a.out ?? p0;
  const p3: P2 = [b.x, b.y];
  const p2: P2 = b.in ?? p3;
  const lerp = (u: P2, v: P2): P2 => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t];
  const nodes = s.nodes.map((x) => ({ ...x }));
  if (!a.out && !b.in) {
    const m = lerp(p0, p3);
    nodes.splice(i + 1, 0, corner(m[0], m[1]));
    return { closed: s.closed, nodes };
  }
  const q0 = lerp(p0, p1);
  const q1 = lerp(p1, p2);
  const q2 = lerp(p2, p3);
  const r0 = lerp(q0, q1);
  const r1 = lerp(q1, q2);
  const m = lerp(r0, r1);
  nodes[i] = { ...nodes[i], out: [r3(q0[0]), r3(q0[1])] };
  const j = (i + 1) % n;
  nodes[j] = { ...nodes[j], in: [r3(q2[0]), r3(q2[1])] };
  nodes.splice(i + 1, 0, { x: r3(m[0]), y: r3(m[1]), in: [r3(r0[0]), r3(r0[1])], out: [r3(r1[0]), r3(r1[1])], smooth: true });
  return { closed: s.closed, nodes };
}

/** A node removed (a subpath keeps at least two). */
export function removeNode(s: Subpath, i: number): Subpath {
  if (s.nodes.length <= 2) return s;
  return { closed: s.closed, nodes: s.nodes.filter((_, k) => k !== i) };
}

/** A node made smooth (its handles set along its neighbours' direction) or a corner (its handles taken away). */
export function setSmooth(s: Subpath, i: number, smooth: boolean): Subpath {
  const n = s.nodes.length;
  const nodes = s.nodes.map((x) => ({ ...x }));
  const nd = nodes[i];
  if (!nd) return s;
  if (!smooth) {
    delete nd.in;
    delete nd.out;
    delete nd.smooth;
    return { closed: s.closed, nodes };
  }
  const prev = s.closed ? s.nodes[(i - 1 + n) % n] : s.nodes[Math.max(0, i - 1)];
  const next = s.closed ? s.nodes[(i + 1) % n] : s.nodes[Math.min(n - 1, i + 1)];
  const tx = (next.x - prev.x) / 6;
  const ty = (next.y - prev.y) / 6;
  nd.in = [r3(nd.x - tx), r3(nd.y - ty)];
  nd.out = [r3(nd.x + tx), r3(nd.y + ty)];
  nd.smooth = true;
  return { closed: s.closed, nodes };
}

/** An anchor moved (its handles with it), or a handle moved (the opposite one mirrored when the node is smooth). */
export function moveNodePart(s: Subpath, i: number, part: 'anchor' | 'in' | 'out', x: number, y: number): Subpath {
  const nodes = s.nodes.map((q) => ({ ...q }));
  const nd = nodes[i];
  if (!nd) return s;
  if (part === 'anchor') {
    const dx = x - nd.x;
    const dy = y - nd.y;
    nd.x = r3(x);
    nd.y = r3(y);
    if (nd.in) nd.in = [r3(nd.in[0] + dx), r3(nd.in[1] + dy)];
    if (nd.out) nd.out = [r3(nd.out[0] + dx), r3(nd.out[1] + dy)];
  } else {
    nd[part] = [r3(x), r3(y)];
    const other = part === 'in' ? 'out' : 'in';
    if (nd.smooth && nd[other]) {
      const len = Math.hypot(nd[other]![0] - nd.x, nd[other]![1] - nd.y);
      const dl = Math.hypot(x - nd.x, y - nd.y) || 1;
      nd[other] = [r3(nd.x - ((x - nd.x) / dl) * len), r3(nd.y - ((y - nd.y) / dl) * len)];
    }
  }
  return { closed: s.closed, nodes };
}

/** Ramer–Douglas–Peucker: the fewest points within `tol` of the line. */
export function simplifyPoints(pts: readonly P2[], tol: number): P2[] {
  if (pts.length < 3) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [x1, y1] = pts[a];
    const [x2, y2] = pts[b];
    const L = Math.hypot(x2 - x1, y2 - y1);
    let far = -1;
    let dist = 0;
    for (let i = a + 1; i < b; i++) {
      // a closed ring starts and ends at one point: its distance from that point then
      const d = L < 1e-9 ? Math.hypot(pts[i][0] - x1, pts[i][1] - y1) : Math.abs((y2 - y1) * pts[i][0] - (x2 - x1) * pts[i][1] + x2 * y1 - y2 * x1) / L;
      if (d > dist) (dist = d), (far = i);
    }
    if (far > 0 && dist > tol) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** A path with fewer nodes: its curves sampled, the points thinned within `tol`, curves kept smooth where they were. */
export function simplifyPath(p: BezierPath, tol = 1.2): BezierPath {
  const f = flatten(p, 0.8);
  return {
    subpaths: f.rings.map((ring, i) => {
      const src = p.subpaths[i];
      const wasSmooth = src?.nodes.some((nd) => nd.smooth || nd.in || nd.out);
      const pts = simplifyPoints(f.closed[i] ? [...ring, ring[0]] : ring, tol);
      if (f.closed[i]) pts.pop();
      return wasSmooth && pts.length >= 3 ? smoothThrough(pts, f.closed[i]) : polySub(pts, f.closed[i]);
    }),
  };
}

/** Every node made smooth (a flowing version of the same outline). */
export function smoothPath(p: BezierPath): BezierPath {
  return { subpaths: p.subpaths.map((s) => smoothThrough(s.nodes.map((nd) => [nd.x, nd.y] as P2), s.closed)) };
}

/** Points of a path pushed by a wave (a distortion that keeps it editable): amplitude in path units. */
export function distortPath(p: BezierPath, amount: number, frequency: number, seed = 1): BezierPath {
  const nz = noise2(seed);
  return mapPath(p, (x, y) => [x + nz(x * frequency * 0.05, y * frequency * 0.05) * amount, y + nz(y * frequency * 0.05 + 31, x * frequency * 0.05 + 17) * amount]);
}

/** A path between two paths (t from 0 to 1), node by node where their structure matches; null when it does not. */
export function interpolatePaths(a: BezierPath, b: BezierPath, t: number): BezierPath | null {
  if (a.subpaths.length !== b.subpaths.length || a.subpaths.some((s, i) => s.nodes.length !== b.subpaths[i].nodes.length)) return null;
  const mix = (u?: P2, v?: P2, du?: P2, dv?: P2): P2 | undefined => (u || v ? [r3((u ?? du!)[0] + ((v ?? dv!)[0] - (u ?? du!)[0]) * t), r3((u ?? du!)[1] + ((v ?? dv!)[1] - (u ?? du!)[1]) * t)] : undefined);
  return {
    subpaths: a.subpaths.map((s, i) => ({
      closed: s.closed,
      nodes: s.nodes.map((nd, k) => {
        const q = b.subpaths[i].nodes[k];
        const o: BNode = { x: r3(nd.x + (q.x - nd.x) * t), y: r3(nd.y + (q.y - nd.y) * t) };
        const inn = mix(nd.in, q.in, [nd.x, nd.y], [q.x, q.y]);
        const out = mix(nd.out, q.out, [nd.x, nd.y], [q.x, q.y]);
        if (inn) o.in = inn;
        if (out) o.out = out;
        if (nd.smooth && q.smooth) o.smooth = true;
        return o;
      }),
    })),
  };
}

// ── holding a stored path to its shape ──

const MAX_NODES = 4000;
/** A Bézier path from storage or a model, held to its shape: finite numbers in range, sensible counts; null if empty. */
export function normalizeBezier(v: unknown, box = 100): BezierPath | null {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  if (!Array.isArray(o.subpaths)) return null;
  let count = 0;
  const lim = box * 20;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? clamp(x, -lim, lim) : NaN);
  const pt = (x: unknown): P2 | undefined => {
    if (!Array.isArray(x) || x.length !== 2) return undefined;
    const a = num(x[0]);
    const b = num(x[1]);
    return Number.isFinite(a) && Number.isFinite(b) ? [r3(a), r3(b)] : undefined;
  };
  const subpaths: Subpath[] = [];
  for (const s of o.subpaths.slice(0, 200)) {
    const r = s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
    if (!Array.isArray(r.nodes)) continue;
    const nodes: BNode[] = [];
    for (const nd of r.nodes) {
      if (count >= MAX_NODES) break;
      const q = nd && typeof nd === 'object' ? (nd as Record<string, unknown>) : {};
      const x = num(q.x);
      const y = num(q.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const o2: BNode = { x: r3(x), y: r3(y) };
      const i = pt(q.in);
      const ou = pt(q.out);
      if (i) o2.in = i;
      if (ou) o2.out = ou;
      if (q.smooth === true) o2.smooth = true;
      nodes.push(o2);
      count++;
    }
    if (nodes.length >= 2 || (nodes.length === 1 && r.closed !== true)) subpaths.push({ closed: r.closed === true && nodes.length >= 3, nodes });
  }
  return subpaths.length ? { subpaths } : null;
}

// ── parametric primitives ──

export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
}
export type PrimCategory = 'basic' | 'geometric' | 'organic' | 'decorative' | 'technical';
export interface PrimitiveSpec {
  kind: string;
  label: string;
  category: PrimCategory;
  /** words a search or a request may use for it */
  keywords: string[];
  params: ParamSpec[];
  /** drawn as lines (a stroke, no fill) by default */
  stroked?: boolean;
  /** even-odd: rings inside rings are holes */
  evenodd?: boolean;
  /** the geometry in the node's box (w × h) */
  build: (p: Record<string, number>, w: number, h: number) => BezierPath;
}
export interface Prim {
  kind: string;
  params: Record<string, number>;
}

const P = (key: string, label: string, min: number, max: number, def: number, step = 1): ParamSpec => ({ key, label, min, max, step, def });
const SEED = P('seed', 'Seed', 1, 9999, 7);
const path1 = (...subpaths: Subpath[]): BezierPath => ({ subpaths });
const boxPts = (w: number, h: number): P2[] => [
  [0, 0],
  [w, 0],
  [w, h],
  [0, h],
];
const rotatePts = (pts: readonly P2[], cx: number, cy: number, a: number): P2[] => pts.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
/** Points in a unit square scaled to the box. */
const fit = (pts: readonly P2[], w: number, h: number): P2[] => pts.map(([x, y]) => [x * w, y * h]);
type PcGeom = PcPolygon | MultiPolygon;
const roundGeom = (g: PcGeom, q: number): PcGeom => JSON.parse(JSON.stringify(g), (_k, v) => (typeof v === 'number' ? Math.round(v / q) * q : v));
/** A polygon-clipping operation that never throws: on the library's rare sweep-line failure (near-coincident edges)
 * it is tried again on coordinates rounded to a fine grid, then to a coarser one; if it still cannot be done, the
 * error is thrown for the caller to say (never a wrong shape returned quietly). */
export function pcOp(op: 'union' | 'intersection' | 'difference' | 'xor', ...geoms: PcGeom[]): MultiPolygon {
  const usable = geoms.filter((g) => g.length);
  if (!usable.length) return [];
  const run = (gs: PcGeom[]) => (polygonClipping[op] as (g: PcGeom, ...r: PcGeom[]) => MultiPolygon)(gs[0], ...gs.slice(1));
  let last: unknown = null;
  for (const q of [0, 1e-3, 1e-2]) {
    try {
      return run(q ? usable.map((g) => roundGeom(g, q)) : usable);
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`The shapes could not be combined (${(last as Error)?.message?.slice(0, 80) ?? 'geometry error'}).`);
}
const mpToPath = (mp: MultiPolygon): BezierPath => ({ subpaths: mp.flatMap((poly) => poly.map((ring) => polySub(ring.slice(0, ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? -1 : undefined) as P2[]))) });
const ringOf = (s: Subpath): P2[] => flatten(path1(s)).rings[0] ?? [];
const pc = (ring: readonly P2[]): PcPolygon => [[...ring, ring[0]] as [number, number][]];

function blobPoints(seed: number, lobes: number, irregular: number, cx: number, cy: number, rx: number, ry: number, count = 24): P2[] {
  const R = rng(seed);
  const phases = Array.from({ length: 4 }, () => R() * TAU);
  const amps = [0.12, 0.08, 0.05, 0.03].map((a) => a * (irregular / 50));
  const pts: P2[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * TAU;
    let r = 1 + Math.sin(t * lobes + phases[0]) * amps[0];
    r += Math.sin(t * (lobes + 1) + phases[1]) * amps[1] + Math.sin(t * (lobes * 2 - 1) + phases[2]) * amps[2] + Math.sin(t * 7 + phases[3]) * amps[3];
    r = clamp(r, 0.35, 1.35);
    pts.push([cx + Math.cos(t) * rx * r, cy + Math.sin(t) * ry * r]);
  }
  // held inside the box
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const sx = (rx * 2) / (Math.max(...xs) - Math.min(...xs) || 1);
  const sy = (ry * 2) / (Math.max(...ys) - Math.min(...ys) || 1);
  const mx = Math.min(...xs);
  const my = Math.min(...ys);
  return pts.map(([x, y]) => [cx - rx + (x - mx) * sx, cy - ry + (y - my) * sy]);
}

/** A band around a centre line (its thickness along it) as one closed outline. */
function band(center: readonly P2[], thick: (t: number) => number): Subpath {
  const top: P2[] = [];
  const bot: P2[] = [];
  for (let i = 0; i < center.length; i++) {
    const a = center[Math.max(0, i - 1)];
    const b = center[Math.min(center.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L;
    const ny = dx / L;
    const th = thick(i / (center.length - 1)) / 2;
    top.push([center[i][0] + nx * th, center[i][1] + ny * th]);
    bot.push([center[i][0] - nx * th, center[i][1] - ny * th]);
  }
  return smoothThrough([...top, ...bot.reverse()], true);
}

/** Lines (open subpaths) from point lists. */
const lines = (...ls: P2[][]): BezierPath => ({ subpaths: ls.filter((l) => l.length >= 2).map((l) => polySub(l, false)) });

function sectorPath(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, inner: number, roundCaps = false): BezierPath {
  if (Math.abs(a1 - a0) >= TAU - 1e-3) {
    return inner > 0 ? path1(ellipseSub(cx, cy, rx, ry), ellipseSub(cx, cy, rx * inner, ry * inner)) : path1(ellipseSub(cx, cy, rx, ry));
  }
  const outer = arcNodes(cx, cy, rx, ry, a0, a1);
  if (inner <= 0) {
    return path1({ closed: true, nodes: [corner(cx, cy), ...outer] });
  }
  const back = arcNodes(cx, cy, rx * inner, ry * inner, a1, a0);
  if (roundCaps) {
    const mid = (a: number): P2 => [cx + Math.cos(a) * rx * (1 + inner) * 0.5, cy + Math.sin(a) * ry * (1 + inner) * 0.5];
    const capR = (rx * (1 - inner)) / 2;
    const [ex, ey] = mid(a1);
    const [sx, sy] = mid(a0);
    const capEnd = arcNodes(ex, ey, capR, (ry * (1 - inner)) / 2, a1, a1 + Math.PI);
    const capStart = arcNodes(sx, sy, capR, (ry * (1 - inner)) / 2, a0 + Math.PI, a0 + TAU);
    const join = (list: BNode[][]) => {
      const out: BNode[] = [];
      for (const part of list)
        for (const nd of part) {
          const last = out[out.length - 1];
          if (last && Math.hypot(last.x - nd.x, last.y - nd.y) < 0.6) {
            out[out.length - 1] = { ...last, ...(nd.out ? { out: nd.out } : {}) };
            continue;
          }
          out.push({ ...nd });
        }
      const first = out[0];
      const end = out[out.length - 1];
      if (out.length > 2 && Math.hypot(first.x - end.x, first.y - end.y) < 0.6) {
        out[0] = { ...first, ...(end.in ? { in: end.in } : {}) };
        out.pop();
      }
      return out;
    };
    return path1({ closed: true, nodes: join([outer, capEnd, back, capStart]) });
  }
  return path1({ closed: true, nodes: [...outer, ...back] });
}

export const PRIMITIVES: readonly PrimitiveSpec[] = [
  // ── basic ──
  { kind: 'rounded-rect', label: 'Rounded rectangle', category: 'basic', keywords: ['rectangle', 'rounded', 'card', 'box', 'square'], params: [P('radius', 'Corner radius', 0, 50, 18)], build: (p, w, h) => path1(roundPoly(boxPts(w, h), (Math.min(w, h) * p.radius) / 100)) },
  { kind: 'circle', label: 'Circle', category: 'basic', keywords: ['circle', 'dot', 'round', 'disc'], params: [], build: (_p, w, h) => path1(ellipseSub(w / 2, h / 2, Math.min(w, h) / 2, Math.min(w, h) / 2)) },
  { kind: 'triangle', label: 'Triangle', category: 'basic', keywords: ['triangle', 'pyramid'], params: [P('apex', 'Apex position', 0, 100, 50), P('rounding', 'Rounding', 0, 30, 0)], build: (p, w, h) => path1(roundPoly(fit([[p.apex / 100, 0], [1, 1], [0, 1]], w, h), (Math.min(w, h) * p.rounding) / 100)) },
  {
    kind: 'arrow',
    label: 'Arrow',
    category: 'basic',
    keywords: ['arrow', 'pointer', 'direction', 'next'],
    params: [P('shaft', 'Shaft thickness', 5, 90, 36), P('head', 'Head length', 10, 80, 38), P('double', 'Double-headed', 0, 1, 0)],
    build: (p, w, h) => {
      const t = (h * p.shaft) / 100 / 2;
      const hl = (w * p.head) / 100;
      const c = h / 2;
      if (p.double >= 0.5) {
        const hl2 = Math.min(hl, w / 2.2);
        return path1(polySub([[0, c], [hl2, 0], [hl2, c - t], [w - hl2, c - t], [w - hl2, 0], [w, c], [w - hl2, h], [w - hl2, c + t], [hl2, c + t], [hl2, h]]));
      }
      return path1(polySub([[0, c - t], [w - hl, c - t], [w - hl, 0], [w, c], [w - hl, h], [w - hl, c + t], [0, c + t]]));
    },
  },
  { kind: 'arrow-line', label: 'Arrow line', category: 'technical', keywords: ['arrow', 'connector', 'leader', 'line'], stroked: true, params: [P('head', 'Head size', 2, 40, 10), P('double', 'Double-headed', 0, 1, 0)], build: (p, w, h) => {
    const s = (Math.min(w, h * 4) * p.head) / 100 + 4;
    const c = h / 2;
    const ls: P2[][] = [[[0, c], [w, c]], [[w - s, c - s * 0.6], [w, c], [w - s, c + s * 0.6]]];
    if (p.double >= 0.5) ls.push([[s, c - s * 0.6], [0, c], [s, c + s * 0.6]]);
    return lines(...ls);
  } },
  { kind: 'line', label: 'Straight line', category: 'basic', keywords: ['line', 'rule', 'stroke'], stroked: true, params: [P('angle', 'Angle', -90, 90, 0)], build: (p, w, h) => {
    const a = deg(p.angle);
    const L = Math.min(Math.abs(Math.cos(a)) > 1e-3 ? w / Math.abs(Math.cos(a)) : Infinity, Math.abs(Math.sin(a)) > 1e-3 ? h / Math.abs(Math.sin(a)) : Infinity);
    const dx = (Math.cos(a) * L) / 2;
    const dy = (Math.sin(a) * L) / 2;
    return lines([[w / 2 - dx, h / 2 - dy], [w / 2 + dx, h / 2 + dy]]);
  } },
  // ── geometric ──
  { kind: 'polygon', label: 'Regular polygon', category: 'geometric', keywords: ['polygon', 'pentagon', 'hexagon', 'shape'], params: [P('sides', 'Sides', 3, 24, 6), P('rounding', 'Rounding', 0, 40, 0), P('rotation', 'Turn', -180, 180, 0)], build: (p, w, h) => path1(roundPoly(regularPoints(w / 2, h / 2, w / 2, h / 2, Math.round(p.sides), -90 + p.rotation), (Math.min(w, h) * p.rounding) / 100)) },
  { kind: 'star', label: 'Star', category: 'geometric', keywords: ['star', 'sparkle', 'asterisk'], params: [P('points', 'Points', 3, 24, 5), P('inner', 'Inner radius', 10, 95, 45), P('rounding', 'Rounding', 0, 30, 0), P('rotation', 'Turn', -180, 180, 0)], build: (p, w, h) => path1(roundPoly(regularPoints(w / 2, h / 2, w / 2, h / 2, Math.round(p.points), -90 + p.rotation, p.inner / 100), (Math.min(w, h) * p.rounding) / 100)) },
  { kind: 'ring', label: 'Ring', category: 'geometric', keywords: ['ring', 'donut', 'circle', 'halo', 'annulus'], evenodd: true, params: [P('thickness', 'Thickness', 4, 95, 24)], build: (p, w, h) => sectorPath(w / 2, h / 2, w / 2, h / 2, 0, TAU, 1 - p.thickness / 100) },
  { kind: 'arc', label: 'Arc', category: 'geometric', keywords: ['arc', 'curve', 'bow', 'segment'], params: [P('start', 'Start angle', -360, 360, 180), P('sweep', 'Sweep', 5, 355, 180), P('thickness', 'Thickness', 4, 95, 22), P('caps', 'Round ends', 0, 1, 1)], build: (p, w, h) => sectorPath(w / 2, h / 2, w / 2, h / 2, deg(p.start), deg(p.start + p.sweep), 1 - p.thickness / 100, p.caps >= 0.5) },
  { kind: 'sector', label: 'Sector', category: 'geometric', keywords: ['sector', 'pie', 'slice', 'quarter', 'half circle'], params: [P('start', 'Start angle', -360, 360, -90), P('sweep', 'Sweep', 5, 359, 90)], build: (p, w, h) => sectorPath(w / 2, h / 2, w / 2, h / 2, deg(p.start), deg(p.start + p.sweep), 0) },
  { kind: 'wedge', label: 'Wedge', category: 'geometric', keywords: ['wedge', 'annular', 'segment', 'slice'], params: [P('start', 'Start angle', -360, 360, -60), P('sweep', 'Sweep', 5, 359, 120), P('inner', 'Inner radius', 0, 90, 45)], build: (p, w, h) => sectorPath(w / 2, h / 2, w / 2, h / 2, deg(p.start), deg(p.start + p.sweep), p.inner / 100) },
  { kind: 'trapezoid', label: 'Trapezoid', category: 'geometric', keywords: ['trapezoid', 'trapezium'], params: [P('top', 'Top width', 0, 100, 60), P('rounding', 'Rounding', 0, 30, 0)], build: (p, w, h) => path1(roundPoly(fit([[(1 - p.top / 100) / 2, 0], [1 - (1 - p.top / 100) / 2, 0], [1, 1], [0, 1]], w, h), (Math.min(w, h) * p.rounding) / 100)) },
  { kind: 'parallelogram', label: 'Parallelogram', category: 'geometric', keywords: ['parallelogram', 'slant', 'italic block'], params: [P('slant', 'Slant', -45, 45, 22), P('rounding', 'Rounding', 0, 30, 0)], build: (p, w, h) => {
    const s = (p.slant / 100) * w;
    return path1(roundPoly(s >= 0 ? [[s, 0], [w, 0], [w - s, h], [0, h]] : [[0, 0], [w + s, 0], [w, h], [-s, h]], (Math.min(w, h) * p.rounding) / 100));
  } },
  { kind: 'diamond', label: 'Diamond', category: 'geometric', keywords: ['diamond', 'lozenge'], params: [P('rounding', 'Rounding', 0, 30, 0)], build: (p, w, h) => path1(roundPoly(fit([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]], w, h), (Math.min(w, h) * p.rounding) / 100)) },
  { kind: 'rhombus', label: 'Rhombus', category: 'geometric', keywords: ['rhombus', 'skewed diamond'], params: [P('skew', 'Skew', -80, 80, 35)], build: (p, w, h) => {
    const k = p.skew / 200;
    return path1(polySub(fit([[0.5 + k, 0], [1, 0.5], [0.5 - k, 1], [0, 0.5]], w, h)));
  } },
  { kind: 'hexagon', label: 'Hexagon', category: 'geometric', keywords: ['hexagon', 'hex', 'honeycomb'], params: [P('pointy', 'Pointed top', 0, 1, 0), P('rounding', 'Rounding', 0, 40, 0)], build: (p, w, h) => path1(roundPoly(regularPoints(w / 2, h / 2, w / 2, h / 2, 6, p.pointy >= 0.5 ? -90 : 0), (Math.min(w, h) * p.rounding) / 100)) },
  { kind: 'octagon', label: 'Octagon', category: 'geometric', keywords: ['octagon', 'stop sign'], params: [P('rounding', 'Rounding', 0, 40, 0)], build: (p, w, h) => path1(roundPoly(regularPoints(w / 2, h / 2, w / 2, h / 2, 8, -90 + 22.5), (Math.min(w, h) * p.rounding) / 100)) },
  { kind: 'chevron', label: 'Chevron', category: 'geometric', keywords: ['chevron', 'arrowhead', 'pointer', 'tag'], params: [P('depth', 'Point depth', 5, 60, 30), P('notch', 'Tail notch', 0, 60, 30)], build: (p, w, h) => {
    const d = (w * p.depth) / 100;
    const nt = (w * p.notch) / 100;
    return path1(polySub([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h], [nt, h / 2]]));
  } },
  { kind: 'cross', label: 'Cross (×)', category: 'geometric', keywords: ['cross', 'x', 'times', 'close', 'saltire'], params: [P('thickness', 'Arm thickness', 6, 60, 22)], build: (p, w, h) => {
    const t = p.thickness / 100 / 2;
    const plus: P2[] = [[0.5 - t, 0], [0.5 + t, 0], [0.5 + t, 0.5 - t], [1, 0.5 - t], [1, 0.5 + t], [0.5 + t, 0.5 + t], [0.5 + t, 1], [0.5 - t, 1], [0.5 - t, 0.5 + t], [0, 0.5 + t], [0, 0.5 - t], [0.5 - t, 0.5 - t]];
    const k = 1 / Math.SQRT2;
    const rot = rotatePts(plus.map(([x, y]) => [0.5 + (x - 0.5) * k * 1.4, 0.5 + (y - 0.5) * k * 1.4]), 0.5, 0.5, Math.PI / 4);
    return path1(polySub(fit(rot, w, h)));
  } },
  { kind: 'plus', label: 'Plus', category: 'geometric', keywords: ['plus', 'add', 'cross', 'swiss cross'], params: [P('thickness', 'Arm thickness', 6, 70, 28), P('rounding', 'Rounding', 0, 20, 0)], build: (p, w, h) => {
    const t = p.thickness / 100 / 2;
    return path1(roundPoly(fit([[0.5 - t, 0], [0.5 + t, 0], [0.5 + t, 0.5 - t], [1, 0.5 - t], [1, 0.5 + t], [0.5 + t, 0.5 + t], [0.5 + t, 1], [0.5 - t, 1], [0.5 - t, 0.5 + t], [0, 0.5 + t], [0, 0.5 - t], [0.5 - t, 0.5 - t]], w, h), (Math.min(w, h) * p.rounding) / 100));
  } },
  { kind: 'crescent', label: 'Crescent', category: 'geometric', keywords: ['crescent', 'moon', 'eclipse'], params: [P('phase', 'Phase', 10, 90, 38), P('angle', 'Turn', -180, 180, 0)], build: (p, w, h) => {
    const outer = ringOf(ellipseSub(w / 2, h / 2, w / 2, h / 2));
    const off = (p.phase / 100) * w;
    const a = deg(p.angle);
    const inner = ringOf(ellipseSub(w / 2 + Math.cos(a) * off, h / 2 + Math.sin(a) * off * (h / w), w / 2 * 0.94, h / 2 * 0.94));
    return mpToPath(pcOp('difference', pc(outer), pc(inner)));
  } },
  { kind: 'capsule', label: 'Capsule', category: 'geometric', keywords: ['capsule', 'pill', 'button', 'lozenge'], params: [], build: (_p, w, h) => path1(roundPoly(boxPts(w, h), Math.min(w, h) / 2)) },
  { kind: 'superellipse', label: 'Superellipse', category: 'geometric', keywords: ['superellipse', 'squircle', 'rounded square'], params: [P('n', 'Squareness', 15, 120, 40, 1)], build: (p, w, h) => {
    const n = p.n / 10;
    const pts: P2[] = [];
    for (let i = 0; i < 96; i++) {
      const t = (i / 96) * TAU;
      const c = Math.cos(t);
      const s = Math.sin(t);
      pts.push([w / 2 + (w / 2) * Math.sign(c) * Math.abs(c) ** (2 / n), h / 2 + (h / 2) * Math.sign(s) * Math.abs(s) ** (2 / n)]);
    }
    return path1(polySub(pts));
  } },
  { kind: 'rounded-polygon', label: 'Rounded polygon', category: 'geometric', keywords: ['rounded polygon', 'soft polygon', 'pebble polygon'], params: [P('sides', 'Sides', 3, 12, 5), P('rounding', 'Rounding', 5, 50, 24)], build: (p, w, h) => path1(roundPoly(regularPoints(w / 2, h / 2, w / 2, h / 2, Math.round(p.sides)), (Math.min(w, h) * p.rounding) / 100)) },
  { kind: 'speech-bubble', label: 'Speech bubble', category: 'basic', keywords: ['speech', 'bubble', 'quote', 'chat', 'dialogue'], params: [P('radius', 'Corner radius', 0, 50, 16), P('tail', 'Tail position', 5, 95, 22), P('tailSize', 'Tail size', 6, 40, 18)], build: (p, w, h) => {
    const th = (h * p.tailSize) / 100;
    const bh = h - th;
    const tx = (w * p.tail) / 100;
    const tw = Math.max(8, w * 0.08);
    const pts: P2[] = [[0, 0], [w, 0], [w, bh], [Math.min(w, tx + tw), bh], [tx - tw * 0.4, h], [Math.max(0, tx - tw * 0.1), bh], [0, bh]];
    const r = (Math.min(w, bh) * p.radius) / 100;
    return path1(roundPoly(pts, [r, r, r, 0, 0, 0, r]));
  } },
  { kind: 'callout', label: 'Callout', category: 'technical', keywords: ['callout', 'label', 'tooltip', 'pointer box'], params: [P('radius', 'Corner radius', 0, 40, 6), P('pointer', 'Pointer length', 10, 60, 30)], build: (p, w, h) => {
    const ph = (h * p.pointer) / 100;
    const bh = h - ph;
    const r = (Math.min(w, bh) * p.radius) / 100;
    return path1(roundPoly([[0, 0], [w, 0], [w, bh], [w * 0.18, bh], [0, h], [w * 0.06, bh], [0, bh]], [r, r, r, 0, 0, 0, r]));
  } },
  { kind: 'bracket', label: 'Bracket', category: 'technical', keywords: ['bracket', 'brace', 'frame corner'], stroked: true, params: [P('depth', 'Depth', 5, 50, 18), P('both', 'Both sides', 0, 1, 1)], build: (p, w, h) => {
    const d = (w * p.depth) / 100;
    const ls: P2[][] = [[[d, 0], [0, 0], [0, h], [d, h]]];
    if (p.both >= 0.5) ls.push([[w - d, 0], [w, 0], [w, h], [w - d, h]]);
    return lines(...ls);
  } },
  { kind: 'corner-ornament', label: 'Corner ornament', category: 'decorative', keywords: ['corner', 'ornament', 'flourish', 'scroll'], stroked: true, params: [P('curl', 'Curl', 0, 100, 60), P('lines', 'Lines', 1, 4, 2)], build: (p, w, h) => {
    const subs: Subpath[] = [];
    for (let i = 0; i < Math.round(p.lines); i++) {
      const o = (i * Math.min(w, h)) / 14;
      const c = (p.curl / 100) * Math.min(w, h) * 0.3;
      subs.push({ closed: false, nodes: [{ x: o, y: h, out: [o, h * 0.4] }, { x: o + c, y: o + c, in: [o, o + c * 1.6], out: [o + c * 1.6, o], smooth: true }, { x: w, y: o, in: [w * 0.4, o] }] });
    }
    return path1(...subs);
  } },
  // ── organic ──
  { kind: 'blob', label: 'Blob', category: 'organic', keywords: ['blob', 'organic', 'pebble', 'fluid', 'amoeba', 'soft shape'], params: [SEED, P('lobes', 'Lobes', 2, 12, 3), P('irregular', 'Irregularity', 0, 100, 55)], build: (p, w, h) => path1(smoothThrough(blobPoints(p.seed, Math.round(p.lobes), p.irregular, w / 2, h / 2, w / 2, h / 2, 14), true)) },
  { kind: 'wave', label: 'Wave', category: 'organic', keywords: ['wave', 'water', 'sea', 'undulating', 'section edge'], params: [P('amplitude', 'Amplitude', 0, 50, 14), P('frequency', 'Waves', 1, 12, 2, 0.5), P('phase', 'Phase', 0, 360, 0), P('level', 'Level', 0, 100, 40)], build: (p, w, h) => {
    const pts: P2[] = [];
    const n = Math.max(8, Math.round(p.frequency * 8));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([t * w, (h * p.level) / 100 + Math.sin(t * TAU * p.frequency + deg(p.phase)) * ((h * p.amplitude) / 100)]);
    }
    const top = smoothThrough(pts, false);
    return path1({ closed: true, nodes: [...top.nodes.map((q, i) => (i === top.nodes.length - 1 ? { ...q, out: undefined } : i === 0 ? { ...q, in: undefined } : q)), corner(w, h), corner(0, h)] });
  } },
  { kind: 'wave-lines', label: 'Wavy lines', category: 'organic', keywords: ['wavy lines', 'waves', 'ripples', 'flowing lines', 'water lines'], stroked: true, params: [P('lines', 'Lines', 1, 24, 6), P('amplitude', 'Amplitude', 0, 40, 10), P('frequency', 'Waves', 0.5, 12, 3, 0.5), P('drift', 'Phase drift', 0, 180, 30)], build: (p, w, h) => {
    const subs: Subpath[] = [];
    const count = Math.round(p.lines);
    for (let k = 0; k < count; k++) {
      const y0 = count === 1 ? h / 2 : (h * (k + 0.5)) / count;
      const pts: P2[] = [];
      const n = Math.max(8, Math.round(p.frequency * 8));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push([t * w, y0 + Math.sin(t * TAU * p.frequency + deg(p.drift * k)) * ((h * p.amplitude) / 100 / Math.max(1, count * 0.6))]);
      }
      subs.push(smoothThrough(pts, false));
    }
    return path1(...subs);
  } },
  { kind: 'ribbon', label: 'Ribbon', category: 'organic', keywords: ['ribbon', 'band', 'twist', 'streamer', 'flowing band', 'irregular ribbon'], params: [SEED, P('twists', 'Twists', 0.5, 6, 1.5, 0.5), P('amplitude', 'Amplitude', 0, 45, 22), P('thickness', 'Thickness', 4, 60, 22), P('taper', 'Taper', 0, 100, 40)], build: (p, w, h) => {
    const R = rng(p.seed);
    const ph = R() * TAU;
    const center: P2[] = [];
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      center.push([t * w, h / 2 + Math.sin(t * TAU * p.twists * 0.5 + ph) * ((h * p.amplitude) / 100) + Math.sin(t * TAU * 1.3 + ph * 2) * h * 0.03]);
    }
    return path1(band(center, (t) => Math.max(1, (h * p.thickness) / 100) * (1 - (p.taper / 100) * Math.abs(Math.cos(t * Math.PI * p.twists)) * 0.85)));
  } },
  { kind: 'fluid-curve', label: 'Fluid curve', category: 'organic', keywords: ['curve', 'flowing', 'swoosh', 'fluid line', 'scribble'], stroked: true, params: [SEED, P('points', 'Turns', 3, 10, 5), P('sweep', 'Sweep', 10, 100, 60)], build: (p, w, h) => {
    const R = rng(p.seed);
    const pts: P2[] = [];
    const n = Math.round(p.points);
    for (let i = 0; i < n; i++) pts.push([(w * i) / (n - 1), h / 2 + (R() - 0.5) * h * (p.sweep / 100)]);
    return path1(smoothThrough(pts, false));
  } },
  { kind: 'irregular-polygon', label: 'Irregular polygon', category: 'organic', keywords: ['irregular', 'polygon', 'geometric motif', 'angular', 'shard', 'rock', 'crystal'], params: [SEED, P('sides', 'Sides', 3, 14, 6), P('irregular', 'Irregularity', 0, 100, 55)], build: (p, w, h) => {
    const R = rng(p.seed);
    const n = Math.round(p.sides);
    const pts: P2[] = [];
    for (let i = 0; i < n; i++) {
      const a = ((i + (R() - 0.5) * (p.irregular / 100) * 0.8) / n) * TAU - Math.PI / 2;
      const r = 1 - (p.irregular / 100) * 0.45 * R();
      pts.push([w / 2 + Math.cos(a) * (w / 2) * r, h / 2 + Math.sin(a) * (h / 2) * r]);
    }
    return path1(polySub(pts));
  } },
  { kind: 'leaf', label: 'Leaf', category: 'organic', keywords: ['leaf', 'petal', 'botanical', 'organic silhouette'], params: [P('width', 'Width', 20, 100, 55), P('bend', 'Bend', -40, 40, 8)], build: (p, w, h) => {
    const k = p.width / 100;
    const b = (p.bend / 100) * w;
    return path1({ closed: true, nodes: [{ x: w / 2, y: 0, out: [w / 2 + (w * k) / 1.1 + b, h * 0.3], in: [w / 2 - (w * k) / 1.1 + b, h * 0.3] }, { x: w / 2 + b * 0.3, y: h, in: [w / 2 + (w * k) / 1.1 + b, h * 0.75], out: [w / 2 - (w * k) / 1.1 + b, h * 0.75] }] });
  } },
  { kind: 'drop', label: 'Drop', category: 'organic', keywords: ['drop', 'teardrop', 'droplet', 'water'], params: [P('point', 'Point length', 10, 70, 40)], build: (p, w, h) => {
    const r = Math.min(w / 2, h * (1 - p.point / 100) * 0.62);
    const cy = h - r;
    const nodes = arcNodes(w / 2, cy, r, r, deg(-20), deg(200));
    return path1({ closed: true, nodes: [corner(w / 2, 0), ...nodes.map((q) => ({ ...q }))] });
  } },
  { kind: 'wavy-circle', label: 'Wavy circle', category: 'organic', keywords: ['wavy circle', 'scalloped', 'flower', 'badge', 'seal', 'rosette'], params: [P('waves', 'Waves', 3, 40, 12), P('amplitude', 'Depth', 1, 30, 8)], build: (p, w, h) => {
    const pts: P2[] = [];
    const n = 144;
    const a = p.amplitude / 100;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      const r = 1 - a + a * Math.cos(t * Math.round(p.waves));
      pts.push([w / 2 + (Math.cos(t) * r * w) / 2, h / 2 + (Math.sin(t) * r * h) / 2]);
    }
    return path1(smoothThrough(pts, true, 0.9));
  } },
  { kind: 'distorted-ring', label: 'Distorted ring', category: 'organic', keywords: ['distorted ring', 'organic ring', 'wobbly circle', 'halo'], evenodd: true, params: [SEED, P('distortion', 'Distortion', 0, 100, 45), P('thickness', 'Thickness', 5, 80, 20)], build: (p, w, h) => {
    const outer = blobPoints(p.seed, 3, p.distortion, w / 2, h / 2, w / 2, h / 2, 20);
    const k = 1 - p.thickness / 100;
    const inner = blobPoints(p.seed + 11, 4, p.distortion * 0.8, w / 2, h / 2, (w / 2) * k, (h / 2) * k, 20);
    return path1(smoothThrough(outer, true), smoothThrough(inner, true));
  } },
  { kind: 'curved-band', label: 'Curved band', category: 'organic', keywords: ['curved band', 'swoosh', 'tapered arc', 'crescent band'], params: [P('sweep', 'Sweep', 30, 330, 200), P('thickness', 'Thickness', 4, 60, 22), P('taper', 'Taper', 0, 100, 70)], build: (p, w, h) => {
    const center: P2[] = [];
    const n = 32;
    const a0 = deg(180 - p.sweep / 2 + 90);
    for (let i = 0; i <= n; i++) {
      const a = a0 + (deg(p.sweep) * i) / n;
      center.push([w / 2 + Math.cos(a) * w * 0.4, h / 2 + Math.sin(a) * h * 0.4]);
    }
    return path1(band(center, (t) => Math.max(0.5, (Math.min(w, h) * p.thickness) / 100) * (1 - (p.taper / 100) * (1 - Math.sin(t * Math.PI)))));
  } },
  { kind: 'cutout', label: 'Abstract cutout', category: 'organic', keywords: ['cutout', 'holes', 'void', 'pierced', 'abstract cutout'], evenodd: true, params: [SEED, P('holes', 'Holes', 1, 6, 3), P('radius', 'Corner radius', 0, 40, 12)], build: (p, w, h) => {
    const R = rng(p.seed);
    const subs: Subpath[] = [roundPoly(boxPts(w, h), (Math.min(w, h) * p.radius) / 100)];
    const n = Math.round(p.holes);
    for (let i = 0; i < n; i++) {
      const rr = Math.min(w, h) * (0.08 + R() * 0.14);
      const cx = rr + R() * (w - rr * 2);
      const cy = rr + R() * (h - rr * 2);
      subs.push(smoothThrough(blobPoints(p.seed + i * 13, 3, 60, cx, cy, rr, rr * (0.7 + R() * 0.6), 10), true));
    }
    return path1(...subs);
  } },
  { kind: 'contour', label: 'Contour lines', category: 'organic', keywords: ['contour', 'topographic', 'map lines', 'elevation', 'nested'], stroked: true, params: [SEED, P('levels', 'Levels', 2, 16, 7), P('irregular', 'Irregularity', 0, 100, 55)], build: (p, w, h) => {
    const subs: Subpath[] = [];
    const n = Math.round(p.levels);
    const R = rng(p.seed);
    const ox = (R() - 0.5) * 0.25;
    const oy = (R() - 0.5) * 0.25;
    for (let i = 0; i < n; i++) {
      const k = 1 - i / n;
      const cx = w * (0.5 + ox * (1 - k));
      const cy = h * (0.5 + oy * (1 - k));
      subs.push(smoothThrough(blobPoints(p.seed + i * 3, 3, p.irregular, cx, cy, (w / 2) * k, (h / 2) * k, 16), true));
    }
    return path1(...subs);
  } },
  { kind: 'flow-lines', label: 'Flow lines', category: 'organic', keywords: ['flow lines', 'flowing lines', 'streamlines', 'currents', 'hair lines'], stroked: true, params: [SEED, P('lines', 'Lines', 2, 40, 14), P('bend', 'Bend', 0, 100, 55)], build: (p, w, h) => {
    const nz = noise2(p.seed);
    const subs: Subpath[] = [];
    const n = Math.round(p.lines);
    for (let k = 0; k < n; k++) {
      const y0 = (h * (k + 0.5)) / n;
      const pts: P2[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push([t * w, y0 + nz(t * 2.2, k * 0.18) * h * 0.35 * (p.bend / 100)]);
      }
      subs.push(smoothThrough(pts, false));
    }
    return path1(...subs);
  } },
  // ── decorative ──
  { kind: 'burst', label: 'Burst', category: 'decorative', keywords: ['burst', 'starburst', 'badge', 'explosion', 'seal', 'sale'], params: [P('rays', 'Rays', 6, 64, 18), P('inner', 'Inner radius', 30, 95, 78)], build: (p, w, h) => path1(polySub(regularPoints(w / 2, h / 2, w / 2, h / 2, Math.round(p.rays), -90, p.inner / 100))) },
  { kind: 'sunburst', label: 'Sunburst', category: 'decorative', keywords: ['sunburst', 'rays', 'sun', 'radial', 'retro rays'], params: [P('rays', 'Rays', 4, 48, 16), P('width', 'Ray width', 10, 90, 50)], build: (p, w, h) => {
    const n = Math.round(p.rays);
    const subs: Subpath[] = [];
    const R = Math.hypot(w, h) / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const half = ((TAU / n) * (p.width / 100)) / 2;
      subs.push(polySub([[w / 2, h / 2], [w / 2 + Math.cos(a - half) * R, h / 2 + Math.sin(a - half) * R], [w / 2 + Math.cos(a + half) * R, h / 2 + Math.sin(a + half) * R]]));
    }
    // the rays reach the corners, and stop at the box
    return mpToPath(pcOp('intersection', pc(boxPts(w, h)), pcOp('union', ...subs.map((q) => pc(ringOf(q))))));
  } },
  { kind: 'rays', label: 'Radial lines', category: 'decorative', keywords: ['radial lines', 'rays', 'burst lines', 'sun lines', 'radial'], stroked: true, params: [P('rays', 'Lines', 8, 240, 72), P('inner', 'Inner radius', 0, 90, 20), P('jitter', 'Length variation', 0, 100, 0), SEED], build: (p, w, h) => {
    const R = rng(p.seed);
    const ls: P2[][] = [];
    const n = Math.round(p.rays);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const outer = 1 - (p.jitter / 100) * R() * 0.6;
      ls.push([[w / 2 + (Math.cos(a) * w * p.inner) / 200, h / 2 + (Math.sin(a) * h * p.inner) / 200], [w / 2 + (Math.cos(a) * w * outer) / 2, h / 2 + (Math.sin(a) * h * outer) / 2]]);
    }
    return lines(...ls);
  } },
  { kind: 'concentric', label: 'Concentric rings', category: 'decorative', keywords: ['concentric', 'rings', 'target', 'ripple', 'circles'], stroked: true, params: [P('rings', 'Rings', 2, 40, 9), P('offset', 'Eccentricity', 0, 100, 0)], build: (p, w, h) => {
    const n = Math.round(p.rings);
    const subs: Subpath[] = [];
    for (let i = 0; i < n; i++) {
      const k = 1 - i / n;
      const off = (p.offset / 100) * (1 - k) * 0.5;
      subs.push(ellipseSub(w / 2 + off * w * 0.5, h / 2 + off * h * 0.3, (w / 2) * k, (h / 2) * k));
    }
    return path1(...subs);
  } },
  { kind: 'nested-polygons', label: 'Nested polygons', category: 'decorative', keywords: ['nested', 'polygons', 'vortex', 'tunnel', 'spirograph squares'], stroked: true, params: [P('sides', 'Sides', 3, 12, 4), P('count', 'Count', 2, 30, 10), P('twist', 'Twist', 0, 45, 9)], build: (p, w, h) => {
    const subs: Subpath[] = [];
    const n = Math.round(p.count);
    for (let i = 0; i < n; i++) {
      const k = 1 - i / n;
      subs.push(polySub(regularPoints(w / 2, h / 2, (w / 2) * k, (h / 2) * k, Math.round(p.sides), -90 + p.twist * i)));
    }
    return path1(...subs);
  } },
  { kind: 'spiral', label: 'Spiral', category: 'decorative', keywords: ['spiral', 'swirl', 'vortex', 'coil', 'hypnotic'], stroked: true, params: [P('turns', 'Turns', 1, 14, 5), P('growth', 'Logarithmic', 0, 1, 0)], build: (p, w, h) => {
    const pts: P2[] = [];
    const total = Math.round(p.turns * 48);
    for (let i = 0; i <= total; i++) {
      const t = i / total;
      const r = p.growth >= 0.5 ? (Math.exp(t * 3) - 1) / (Math.exp(3) - 1) : t;
      const a = t * p.turns * TAU;
      pts.push([w / 2 + (Math.cos(a) * r * w) / 2, h / 2 + (Math.sin(a) * r * h) / 2]);
    }
    return path1(smoothThrough(pts, false));
  } },
  { kind: 'guilloche', label: 'Guilloché', category: 'decorative', keywords: ['guilloche', 'guilloché', 'rosette', 'banknote', 'security pattern', 'spirograph', 'engraved'], stroked: true, params: [P('petals', 'Petals', 3, 36, 12), P('loops', 'Loops', 1, 8, 3), P('depth', 'Depth', 5, 95, 45)], build: (p, w, h) => {
    const pts: P2[] = [];
    const petals = Math.round(p.petals);
    const loops = Math.round(p.loops);
    const total = 720;
    const d = p.depth / 100;
    for (let i = 0; i <= total; i++) {
      const t = (i / total) * TAU * loops;
      const r = 1 - d / 2 + (d / 2) * Math.cos(petals * t / loops + Math.sin(t) * 0.2);
      const a = t + (d * 0.35 * Math.sin(petals * t)) / petals;
      pts.push([w / 2 + (Math.cos(a) * r * w) / 2, h / 2 + (Math.sin(a) * r * h) / 2]);
    }
    return path1(polySub(pts, false));
  } },
  { kind: 'topographic', label: 'Topographic rings', category: 'decorative', keywords: ['topographic', 'terrain', 'contour map', 'elevation rings'], stroked: true, params: [SEED, P('levels', 'Levels', 3, 24, 11), P('roughness', 'Roughness', 0, 100, 70)], build: (p, w, h) => {
    const nz = noise2(p.seed);
    const subs: Subpath[] = [];
    const n = Math.round(p.levels);
    for (let k = 0; k < n; k++) {
      const lv = 1 - k / n;
      const pts: P2[] = [];
      for (let i = 0; i < 40; i++) {
        const t = (i / 40) * TAU;
        const r = lv * (1 + nz(Math.cos(t) * 1.6 + k * 0.15, Math.sin(t) * 1.6) * 0.35 * (p.roughness / 100));
        pts.push([w / 2 + (Math.cos(t) * r * w) / 2, h / 2 + (Math.sin(t) * r * h) / 2]);
      }
      subs.push(smoothThrough(pts, true));
    }
    return path1(...subs);
  } },
  { kind: 'fragments', label: 'Angular fragments', category: 'decorative', keywords: ['fragments', 'shards', 'shattered', 'broken', 'angular', 'geometric motif', 'irregular geometric'], params: [SEED, P('pieces', 'Cuts', 1, 9, 4), P('spread', 'Spread', 0, 30, 8)], build: (p, w, h) => {
    const R = rng(p.seed);
    let pieces: P2[][] = [boxPts(w, h)];
    for (let c = 0; c < Math.round(p.pieces); c++) {
      const next: P2[][] = [];
      for (const poly of pieces) {
        const a = R() * Math.PI;
        const cx = w * (0.2 + R() * 0.6);
        const cy = h * (0.2 + R() * 0.6);
        const big = Math.hypot(w, h) * 2;
        const dx = Math.cos(a) * big;
        const dy = Math.sin(a) * big;
        const half: PcPolygon = [[[cx - dx, cy - dy], [cx + dx, cy + dy], [cx + dx - dy, cy + dy + dx], [cx - dx - dy, cy - dy + dx], [cx - dx, cy - dy]]];
        const sub = pc(poly);
        const inA = pcOp('intersection', sub, half);
        const inB = pcOp('difference', sub, half);
        for (const mp of [inA, inB]) for (const pg of mp) if (pg[0].length > 3) next.push(pg[0].slice(0, -1) as P2[]);
      }
      pieces = next.length ? next : pieces;
    }
    const s = (p.spread / 100) * Math.min(w, h);
    const moved = pieces.map((poly) => {
      const cx = poly.reduce((t, q) => t + q[0], 0) / poly.length;
      const cy = poly.reduce((t, q) => t + q[1], 0) / poly.length;
      const L = Math.hypot(cx - w / 2, cy - h / 2) || 1;
      const ox = ((cx - w / 2) / L) * s * (0.4 + R());
      const oy = ((cy - h / 2) / L) * s * (0.4 + R());
      const k = 1 - (p.spread / 100) * 0.6;
      return poly.map(([x, y]) => [w / 2 + (x - w / 2) * k + ox, h / 2 + (y - h / 2) * k + oy] as P2);
    });
    return path1(...moved.map((q) => polySub(q)));
  } },
  { kind: 'frame', label: 'Frame', category: 'decorative', keywords: ['frame', 'border', 'passe-partout', 'outline box'], evenodd: true, params: [P('thickness', 'Thickness', 1, 30, 6), P('corner', 'Corners (square, notched, rounded, double)', 0, 3, 0)], build: (p, w, h) => {
    const t = (Math.min(w, h) * p.thickness) / 100;
    const style = Math.round(p.corner);
    const outer = boxPts(w, h);
    const inner: P2[] = [[t, t], [w - t, t], [w - t, h - t], [t, h - t]];
    if (style === 1) {
      const c = t * 2.5;
      const notch = (x0: number, y0: number, x1: number, y1: number): P2[] => [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]];
      return path1(polySub(notch(0, 0, w, h)), polySub(notch(t, t, w - t, h - t)));
    }
    if (style === 2) return path1(roundPoly(outer, t * 3), roundPoly(inner, t * 2));
    if (style === 3) {
      const t2 = t * 0.35;
      return path1(polySub(outer), polySub([[t2, t2], [w - t2, t2], [w - t2, h - t2], [t2, h - t2]]), polySub([[t, t], [w - t, t], [w - t, h - t], [t, h - t]]), polySub([[t + t2, t + t2], [w - t - t2, t + t2], [w - t - t2, h - t - t2], [t + t2, h - t - t2]]));
    }
    return path1(polySub(outer), polySub(inner));
  } },
  { kind: 'border', label: 'Decorative border', category: 'decorative', keywords: ['border', 'zigzag', 'scallop', 'dotted border', 'ornamental edge', 'teeth'], params: [P('style', 'Style (zigzag, scallops, dots, squares)', 0, 3, 0), P('size', 'Size', 1, 12, 3), P('inset', 'Inset', 0, 20, 2)], build: (p, w, h) => {
    const s = (Math.min(w, h) * p.size) / 100;
    const ins = (Math.min(w, h) * p.inset) / 100;
    const style = Math.round(p.style);
    const subs: Subpath[] = [];
    // along each edge of the inset box, motifs pointing inward
    const edge = (x0: number, y0: number, x1: number, y1: number) => {
      const L = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(2, Math.round(L / (s * 2)));
      const ux = (x1 - x0) / L;
      const uy = (y1 - y0) / L;
      const nx = -uy;
      const ny = ux;
      const step = L / n;
      for (let i = 0; i < n; i++) {
        const ax = x0 + ux * step * i;
        const ay = y0 + uy * step * i;
        const bx = ax + ux * step;
        const by = ay + uy * step;
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        if (style === 0) subs.push(polySub([[ax, ay], [bx, by], [mx + nx * s, my + ny * s]]));
        else if (style === 1) subs.push({ closed: true, nodes: [corner(ax, ay), ...arcNodes(mx, my, step / 2, step / 2, Math.atan2(ay - my, ax - mx), Math.atan2(ay - my, ax - mx) + Math.PI * (nx * (ay - my) - ny * (ax - mx) > 0 ? -1 : 1)).slice(1)] });
        else if (style === 2) subs.push(ellipseSub(mx + nx * s * 0.6, my + ny * s * 0.6, s * 0.38, s * 0.38));
        else subs.push(polySub([[ax + ux * step * 0.2, ay + uy * step * 0.2], [bx - ux * step * 0.2, by - uy * step * 0.2], [bx - ux * step * 0.2 + nx * s, by - uy * step * 0.2 + ny * s], [ax + ux * step * 0.2 + nx * s, ay + uy * step * 0.2 + ny * s]]));
      }
    };
    edge(ins, ins, w - ins, ins);
    edge(w - ins, ins, w - ins, h - ins);
    edge(w - ins, h - ins, ins, h - ins);
    edge(ins, h - ins, ins, ins);
    return path1(...subs);
  } },
  { kind: 'truchet', label: 'Modular tiles', category: 'decorative', keywords: ['modular', 'truchet', 'tiles', 'quarter circles', 'pattern blocks', 'bauhaus'], params: [SEED, P('cells', 'Cells across', 2, 16, 4), P('style', 'Style (quarter circles, triangles, arcs)', 0, 2, 0)], build: (p, w, h) => {
    const R = rng(p.seed);
    const n = Math.round(p.cells);
    const cw = w / n;
    const rows = Math.max(1, Math.round(h / cw));
    const ch = h / rows;
    const subs: Subpath[] = [];
    const style = Math.round(p.style);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < n; i++) {
        const x = i * cw;
        const y = j * ch;
        const rot = Math.floor(R() * 4);
        const cx = rot === 0 || rot === 3 ? x : x + cw;
        const cy = rot < 2 ? y : y + ch;
        if (style === 1) {
          const pts: P2[] = [[x, y], [x + cw, y], [x + cw, y + ch], [x, y + ch]];
          subs.push(polySub([pts[rot], pts[(rot + 1) % 4], pts[(rot + 2) % 4]]));
        } else if (style === 2) {
          const a0 = [0, Math.PI / 2, Math.PI, -Math.PI / 2][rot];
          subs.push(sectorPath(cx, cy, cw, ch, a0, a0 + Math.PI / 2, 0.55).subpaths[0]);
        } else {
          const a0 = rot === 0 ? 0 : rot === 1 ? Math.PI / 2 : rot === 2 ? Math.PI : -Math.PI / 2;
          subs.push({ closed: true, nodes: [corner(cx, cy), ...arcNodes(cx, cy, cw, ch, a0, a0 + Math.PI / 2)] });
        }
      }
    return path1(...subs);
  } },
  // ── technical ──
  { kind: 'grid', label: 'Line grid', category: 'technical', keywords: ['grid', 'graph paper', 'technical grid', 'blueprint', 'lines'], stroked: true, params: [P('cols', 'Columns', 1, 60, 12), P('rows', 'Rows', 1, 60, 12)], build: (p, w, h) => {
    const ls: P2[][] = [];
    for (let i = 0; i <= Math.round(p.cols); i++) ls.push([[(w * i) / p.cols, 0], [(w * i) / p.cols, h]]);
    for (let j = 0; j <= Math.round(p.rows); j++) ls.push([[0, (h * j) / p.rows], [w, (h * j) / p.rows]]);
    return lines(...ls);
  } },
  { kind: 'isometric-grid', label: 'Isometric grid', category: 'technical', keywords: ['isometric', 'iso grid', 'triangular grid', 'axonometric'], stroked: true, params: [P('cells', 'Cells across', 2, 40, 10)], build: (p, w, h) => {
    const s = w / Math.round(p.cells);
    const ls: P2[][] = [];
    const t30 = Math.tan(Math.PI / 6);
    for (let x = 0; x <= w + 1e-6; x += s) ls.push([[x, 0], [x, h]]);
    const span = w * t30;
    for (let c = -span; c <= h + span; c += s * t30 * 2) {
      ls.push([[0, c], [w, c + w * t30]]);
      ls.push([[0, c + w * t30], [w, c]]);
    }
    // clipped to the box
    return { subpaths: ls.map((l) => clipLine(l[0], l[1], w, h)).filter((c): c is P2[] => !!c && Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]) > 0.5).map((c) => polySub(c, false)) };
  } },
  { kind: 'perspective-grid', label: 'Perspective grid', category: 'technical', keywords: ['perspective grid', 'horizon', 'vanishing point', 'retro grid', 'synthwave floor'], stroked: true, params: [P('horizon', 'Horizon', 0, 90, 40), P('vanish', 'Vanishing point', 0, 100, 50), P('lines', 'Lines', 4, 60, 18), P('rows', 'Rows', 3, 30, 10)], build: (p, w, h) => {
    const hy = (h * p.horizon) / 100;
    const vx = (w * p.vanish) / 100;
    const ls: P2[][] = [];
    const n = Math.round(p.lines);
    for (let i = 0; i <= n; i++) {
      const bx = -w + (3 * w * i) / n;
      const c = clipLine([vx, hy], [bx, h], w, h);
      if (c) ls.push(c);
    }
    const rows = Math.round(p.rows);
    for (let j = 1; j <= rows; j++) {
      const y = hy + (h - hy) * (j / rows) ** 2;
      ls.push([[0, y], [w, y]]);
    }
    ls.push([[0, hy], [w, hy]]);
    return lines(...ls);
  } },
  { kind: 'line-system', label: 'Line system', category: 'technical', keywords: ['parallel lines', 'hatching', 'line system', 'stripes', 'repeated lines', 'speed lines'], stroked: true, params: [SEED, P('count', 'Lines', 2, 120, 24), P('angle', 'Angle', -90, 90, 0), P('variation', 'Spacing variation', 0, 100, 0), P('length', 'Length variation', 0, 100, 0)], build: (p, w, h) => {
    const R = rng(p.seed);
    const n = Math.round(p.count);
    const a = deg(p.angle);
    const cx = w / 2;
    const cy = h / 2;
    const diag = Math.hypot(w, h);
    const ls: P2[][] = [];
    let acc = 0;
    const steps = Array.from({ length: n }, () => 1 + (R() - 0.5) * (p.variation / 50));
    const total = steps.reduce((s2, x) => s2 + x, 0);
    for (let i = 0; i < n; i++) {
      acc += steps[i];
      const off = (acc / total - 0.5) * diag;
      const half = (diag / 2) * (1 - (p.length / 100) * R());
      const ox = -Math.sin(a) * off;
      const oy = Math.cos(a) * off;
      const c = clipLine([cx + ox - Math.cos(a) * half, cy + oy - Math.sin(a) * half], [cx + ox + Math.cos(a) * half, cy + oy + Math.sin(a) * half], w, h);
      if (c) ls.push(c);
    }
    return lines(...ls);
  } },
  { kind: 'annotation', label: 'Technical annotation', category: 'technical', keywords: ['annotation', 'dimension', 'measurement', 'crosshair', 'registration mark', 'ruler', 'ticks', 'technical'], stroked: true, params: [P('kind', 'Kind (dimension, crosshair, registration, ruler)', 0, 3, 0), P('ticks', 'Ticks', 2, 40, 10)], build: (p, w, h) => {
    const k = Math.round(p.kind);
    if (k === 1) {
      const r = Math.min(w, h) * 0.32;
      return { subpaths: [polySub([[0, h / 2], [w, h / 2]], false), polySub([[w / 2, 0], [w / 2, h]], false), ellipseSub(w / 2, h / 2, r, r)] };
    }
    if (k === 2) {
      const r = Math.min(w, h) * 0.36;
      return { subpaths: [polySub([[0, h / 2], [w, h / 2]], false), polySub([[w / 2, 0], [w / 2, h]], false), ellipseSub(w / 2, h / 2, r, r), ellipseSub(w / 2, h / 2, r * 0.55, r * 0.55)] };
    }
    if (k === 3) {
      const n = Math.round(p.ticks);
      const ls: P2[][] = [[[0, h], [w, h]]];
      for (let i = 0; i <= n * 2; i++) ls.push([[(w * i) / (n * 2), h], [(w * i) / (n * 2), h - (i % 2 ? h * 0.35 : h * 0.8)]]);
      return lines(...ls);
    }
    const c = h / 2;
    const a = Math.min(h * 0.4, w * 0.05);
    return lines([[0, 0], [0, h]], [[w, 0], [w, h]], [[0, c], [w, c]], [[a, c - a * 0.7], [0, c], [a, c + a * 0.7]], [[w - a, c - a * 0.7], [w, c], [w - a, c + a * 0.7]]);
  } },
];

export const PRIMITIVE_BY_KIND = new Map(PRIMITIVES.map((p) => [p.kind, p]));
export const PRIM_CATEGORIES: readonly { id: PrimCategory; label: string }[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'geometric', label: 'Geometric' },
  { id: 'organic', label: 'Organic' },
  { id: 'decorative', label: 'Decorative' },
  { id: 'technical', label: 'Technical' },
];

/** A line segment clipped to the box (Liang–Barsky); null when it misses it. */
export function clipLine(a: P2, b: P2, w: number, h: number): P2[] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const tests: [number, number][] = [
    [-dx, a[0]],
    [dx, w - a[0]],
    [-dy, a[1]],
    [dy, h - a[1]],
  ];
  for (const [pp, q] of tests) {
    if (pp === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / pp;
    if (pp < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [
    [a[0] + dx * t0, a[1] + dy * t0],
    [a[0] + dx * t1, a[1] + dy * t1],
  ];
}

/** Defaults for a primitive's parameters. */
export function primDefaults(kind: string): Prim | null {
  const s = PRIMITIVE_BY_KIND.get(kind);
  return s ? { kind, params: Object.fromEntries(s.params.map((q) => [q.key, q.def])) } : null;
}

/** A primitive from storage or a model, held to its registry entry (unknown kinds refused, every parameter clamped,
 * unknown parameters dropped). */
export function normalizePrim(v: unknown): Prim | null {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const spec = typeof o.kind === 'string' ? PRIMITIVE_BY_KIND.get(o.kind) : undefined;
  if (!spec) return null;
  const given = o.params && typeof o.params === 'object' ? (o.params as Record<string, unknown>) : {};
  const params: Record<string, number> = {};
  for (const q of spec.params) {
    const raw = given[q.key];
    const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : q.def;
    params[q.key] = clamp(q.step >= 1 ? Math.round(n) : n, q.min, q.max);
  }
  return { kind: spec.kind, params };
}

const primCache = new Map<string, BezierPath>();
/** A primitive's geometry in a w × h box (cached: the same parameters always give the same path). */
export function primPath(prim: Prim, w: number, h: number): BezierPath {
  const key = `${prim.kind}|${Object.entries(prim.params)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')}|${Math.round(w * 10)}|${Math.round(h * 10)}`;
  const hit = primCache.get(key);
  if (hit) return hit;
  const spec = PRIMITIVE_BY_KIND.get(prim.kind);
  const path = spec ? spec.build({ ...primDefaults(prim.kind)!.params, ...prim.params }, Math.max(1, w), Math.max(1, h)) : { subpaths: [] };
  if (primCache.size > 600) primCache.delete(primCache.keys().next().value as string);
  primCache.set(key, path);
  return path;
}

// ── booleans, offsets, outlines ──

export type BoolMode = 'union' | 'subtract' | 'intersect' | 'exclude';

/** A shape's rings (even-odd) as one region polygon-clipping understands: each ring xor-ed in. */
function region(rings: readonly P2[][]): MultiPolygon {
  const usable = rings.filter((r) => r.length >= 3);
  if (!usable.length) return [];
  if (usable.length === 1) return [pc(usable[0])];
  return pcOp('xor', pc(usable[0]), ...usable.slice(1).map(pc));
}

/** Two or more regions combined (the first is the subject when subtracting). */
export function booleanRegions(shapes: readonly P2[][][], mode: BoolMode): MultiPolygon {
  const regs = shapes.map(region).filter((r) => r.length);
  if (!regs.length) return [];
  const [first, ...rest] = regs;
  if (!rest.length) return first;
  return pcOp(mode === 'union' ? 'union' : mode === 'subtract' ? 'difference' : mode === 'intersect' ? 'intersection' : 'xor', first, ...rest);
}

/** A region as a path of corner nodes (even-odd: holes are rings inside rings). */
export function regionPath(mp: MultiPolygon): BezierPath {
  return mpToPath(mp);
}

const circlePoly = (x: number, y: number, r: number, seg = 14): PcPolygon => {
  const ring: [number, number][] = [];
  for (let i = 0; i < seg; i++) ring.push([x + Math.cos((i / seg) * TAU) * r, y + Math.sin((i / seg) * TAU) * r]);
  ring.push(ring[0]);
  return [ring];
};
const quadPoly = (a: P2, b: P2, r: number): PcPolygon | null => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return null;
  const nx = (-dy / L) * r;
  const ny = (dx / L) * r;
  return [[[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]]];
};

/** The region within r of a set of polylines (round joins and ends): a stroke as an area. */
function bufferLines(rings: readonly P2[][], closed: readonly boolean[], r: number): MultiPolygon {
  const parts: PcPolygon[] = [];
  rings.forEach((ring0, i) => {
    const simple = simplifyPoints(closed[i] ? [...ring0, ring0[0]] : ring0, Math.max(0.05, r / 6));
    // each point once (a closed ring's start is not its end again), no zero-length edges
    const pts: P2[] = [];
    for (const q of simple) if (!pts.length || Math.hypot(q[0] - pts[pts.length - 1][0], q[1] - pts[pts.length - 1][1]) > 1e-6) pts.push(q);
    if (closed[i] && pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts.pop();
    const edges = closed[i] ? pts.length : pts.length - 1;
    for (let k = 0; k < edges; k++) {
      const q = quadPoly(pts[k], pts[(k + 1) % pts.length], r);
      if (q) parts.push(q);
    }
    for (const q of pts) parts.push(circlePoly(q[0], q[1], r));
  });
  if (!parts.length) return [];
  // in batches, so a long outline stays quick
  let acc: MultiPolygon = [parts[0]];
  for (let i = 1; i < parts.length; i += 48) acc = pcOp('union', acc, ...parts.slice(i, i + 48));
  return acc;
}

/** A closed shape grown (d > 0) or shrunk (d < 0) by |d|; open lines are stroked by |d|. */
export function offsetRings(rings: readonly P2[][], closed: readonly boolean[], d: number): MultiPolygon {
  const shape = region(rings.filter((_, i) => closed[i]));
  const edge = bufferLines(rings, closed, Math.abs(d));
  if (d >= 0) return shape.length ? pcOp('union', shape, edge) : edge;
  return shape.length ? pcOp('difference', shape, edge) : [];
}

/** A stroke of width `width` as an area: for closed shapes the band around the outline, for open lines the line drawn
 * thick (round ends). */
export function outlineRings(rings: readonly P2[][], closed: readonly boolean[], width: number): MultiPolygon {
  return bufferLines(rings, closed, Math.max(0.1, width / 2));
}

/** A path's area (closed rings, even-odd), for tests and checks. */
export function regionArea(mp: MultiPolygon): number {
  let a = 0;
  for (const poly of mp)
    poly.forEach((ring, i) => {
      let s = 0;
      for (let k = 0; k < ring.length - 1; k++) s += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
      a += (i === 0 ? 1 : -1) * Math.abs(s / 2);
    });
  return a;
}
export { region as regionOf };
