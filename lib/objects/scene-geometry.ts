// lib/objects/scene-geometry.ts
//
// THE GEOMETRY OF A LIVE 3D SCENE, COMPUTED — one source for what is drawn and
// for what the conversation is told. Lengths are metres; the scene is y-up
// (the floor is y = 0). Where a shape is given in mathematical axes — a
// surface z = f(x, y), a curve (x(t), y(t), z(t)) — math z is up:
// (x, y, z)ₘₐₜₕ → (x, z, −y)ₛ꜀ₑₙₑ, a rotation, so handedness is kept.
//
//   profile          the cross-section an extruded shape is swept from:
//                    a regular polygon, a star, an annulus, or the person's
//                    own corners — with its exact area and perimeter
//   surfaceGrid      z = f(x, y) sampled from the expression on a grid
//   revolveProfile   r(y) sampled, for a surface of revolution
//   tubePath         (x(t), y(t), z(t)) sampled, for a tube along a curve
//   localBox         each shape's extent about its own origin
//   worldBox         after scale, rotation (XYZ Euler, degrees) and position
//   measure          volume and surface area: exact formulas for the
//                    primitives, numerical (and said to be) for the rest
//
// Nothing here is a picture of a shape: every number comes from the shape's
// dimensions or from evaluating the person's expression.
//
// PURE.

import { compileExpr } from '@/lib/logos-math';

export type Vec3 = [number, number, number];

export interface ShapeLike {
  shape: string;
  dims: Record<string, number>;
  exprs?: Record<string, string>;
  pos: Vec3;
  rot: Vec3;
  scale: Vec3;
}

// ── cross-sections ──────────────────────────────────────────────────

export interface Profile {
  /** counter-clockwise outer boundary, in the shape's own x–z plane (metres) */
  outer: [number, number][];
  holes: [number, number][][];
  area: number;
  perimeter: number;
}

export function polygonArea(pts: readonly [number, number][]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function polygonPerimeter(pts: readonly [number, number][]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += Math.hypot(x2 - x1, y2 - y1);
  }
  return s;
}

const ccw = (pts: [number, number][]) => (polygonArea(pts) < 0 ? [...pts].reverse() : pts);

/** "x,z | x,z | …" (or ";" between them) → points; null when fewer than three, or not numbers. */
export function parsePoints(raw: string | undefined): [number, number][] | null {
  if (!raw) return null;
  const pts = raw
    .split(/[;|]/)
    .map((p) => p.split(',').map((v) => Number(v.trim())))
    .filter((p) => p.length === 2 && p.every(Number.isFinite)) as [number, number][];
  return pts.length >= 3 && pts.length <= 64 ? pts : null;
}

/**
 * A NACA four-digit section, from the published formulas (Abbott & von
 * Doenhoff): thickness yₜ = 5t·c[0.2969√ξ − 0.1260ξ − 0.3516ξ² + 0.2843ξ³ −
 * 0.1036ξ⁴] (the closed-trailing-edge coefficient), camber yc a parabola either
 * side of its peak at p·c, and each surface offset along the normal to the
 * camber line. Cosine spacing along the chord, so the leading edge — where the
 * curvature is — gets its share of the points. The chord runs along x, centred
 * on its middle; the section's thickness is the profile's second coordinate.
 */
export function nacaSection(digits: { m: number; p: number; t: number }, c: number, n = 100): [number, number][] {
  const m = digits.m / 100;
  const p = digits.p / 10;
  const t = digits.t / 100;
  const upper: [number, number][] = [];
  const lower: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const xi = (1 - Math.cos((Math.PI * i) / n)) / 2;
    const yt = 5 * t * (0.2969 * Math.sqrt(xi) - 0.126 * xi - 0.3516 * xi ** 2 + 0.2843 * xi ** 3 - 0.1036 * xi ** 4);
    let yc = 0;
    let dyc = 0;
    if (m > 0 && p > 0) {
      if (xi < p) {
        yc = (m / (p * p)) * (2 * p * xi - xi * xi);
        dyc = ((2 * m) / (p * p)) * (p - xi);
      } else {
        yc = (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * xi - xi * xi);
        dyc = ((2 * m) / ((1 - p) * (1 - p))) * (p - xi);
      }
    }
    const th = Math.atan(dyc);
    upper.push([c * (xi - yt * Math.sin(th)) - c / 2, c * (yc + yt * Math.cos(th))]);
    lower.push([c * (xi + yt * Math.sin(th)) - c / 2, c * (yc - yt * Math.cos(th))]);
  }
  // trailing edge to leading edge over the top, back along the bottom: the two surfaces share
  // both ends, so each end appears once — the trailing edge as the top's last point, the leading
  // edge as the bottom's first
  return [...upper.slice(1).reverse(), ...lower.slice(0, n)];
}

export function profile(s: ShapeLike): Profile | null {
  const d = s.dims;
  if (s.shape === 'airfoil') {
    if (d.m > 0 && !(d.p > 0)) return null;
    const pts = ccw(nacaSection({ m: d.m, p: d.p, t: d.t }, d.c));
    return { outer: pts, holes: [], area: Math.abs(polygonArea(pts)), perimeter: polygonPerimeter(pts) };
  }
  if (s.shape === 'prism') {
    const n = Math.round(d.n);
    const pts: [number, number][] = Array.from({ length: n }, (_, i) => {
      const a = Math.PI / 2 + (2 * Math.PI * i) / n;
      return [d.r * Math.cos(a), d.r * Math.sin(a)];
    });
    return { outer: pts, holes: [], area: polygonArea(pts), perimeter: polygonPerimeter(pts) };
  }
  if (s.shape === 'star') {
    const n = Math.round(d.n);
    const pts: [number, number][] = Array.from({ length: 2 * n }, (_, i) => {
      const a = Math.PI / 2 + (Math.PI * i) / n;
      const r = i % 2 === 0 ? d.r : d.ri;
      return [r * Math.cos(a), r * Math.sin(a)];
    });
    return { outer: pts, holes: [], area: polygonArea(pts), perimeter: polygonPerimeter(pts) };
  }
  if (s.shape === 'ring') {
    const N = 96;
    const circ = (r: number) => Array.from({ length: N }, (_, i) => [r * Math.cos((2 * Math.PI * i) / N), r * Math.sin((2 * Math.PI * i) / N)] as [number, number]);
    // exact area and perimeter of the annulus — the 96-gon is only how it is drawn
    return { outer: circ(d.R), holes: [circ(d.r).reverse()], area: Math.PI * (d.R * d.R - d.r * d.r), perimeter: 2 * Math.PI * (d.R + d.r) };
  }
  if (s.shape === 'polygon') {
    const raw = parsePoints(s.exprs?.pts);
    if (!raw) return null;
    // centred on its own centroid of vertices, so it sits where it is placed
    const cx = raw.reduce((t, p) => t + p[0], 0) / raw.length;
    const cz = raw.reduce((t, p) => t + p[1], 0) / raw.length;
    const pts = ccw(raw.map(([x, z]) => [x - cx, z - cz] as [number, number]));
    return { outer: pts, holes: [], area: Math.abs(polygonArea(pts)), perimeter: polygonPerimeter(pts) };
  }
  return null;
}

// ── shapes from expressions ─────────────────────────────────────────

export interface Grid {
  /** (n+1)² vertices, scene coordinates, flattened xyz */
  positions: number[];
  /** triangles over cells whose four corners are all finite */
  indices: number[];
  minY: number;
  maxY: number;
  /** cells left out because f was undefined there */
  holes: number;
  area: number;
}

/** z = f(x, y) over [x0, x1] × [y0, y1], placed in the scene as (x, f, −y). */
export function surfaceGrid(s: ShapeLike): Grid | null {
  const f = s.exprs?.f;
  const c = f ? compileExpr(f, ['x', 'y']) : null;
  if (!c) return null;
  const { x0, x1, y0, y1 } = s.dims;
  const n = Math.max(4, Math.min(128, Math.round(s.dims.n || 48)));
  const positions: number[] = [];
  const finite: boolean[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * j) / n;
      let z = NaN;
      try {
        z = c.eval({ x, y });
      } catch {
        z = NaN;
      }
      const ok = Number.isFinite(z) && Math.abs(z) < 1e6;
      finite.push(ok);
      positions.push(x, ok ? z : 0, -y);
      if (ok) {
        minY = Math.min(minY, z);
        maxY = Math.max(maxY, z);
      }
    }
  const indices: number[] = [];
  let holes = 0;
  let area = 0;
  const P = (k: number): Vec3 => [positions[3 * k], positions[3 * k + 1], positions[3 * k + 2]];
  const tri = (a: number, b: number, c2: number) => {
    const A = P(a);
    const B = P(b);
    const C = P(c2);
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    area += 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
  };
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const cc = a + (n + 1);
      const d = cc + 1;
      if (!(finite[a] && finite[b] && finite[cc] && finite[d])) {
        holes++;
        continue;
      }
      indices.push(a, cc, b, b, cc, d);
      tri(a, cc, b);
      tri(b, cc, d);
    }
  if (!Number.isFinite(minY)) return null;
  return { positions, indices, minY, maxY, holes, area };
}

/** r(y) sampled over [y0, y1]: the profile a surface of revolution is turned from. Negative r is not a radius. */
export function revolveProfile(s: ShapeLike): { pts: [number, number][]; clipped: number } | null {
  const c = s.exprs?.r ? compileExpr(s.exprs.r, ['y']) : null;
  if (!c) return null;
  const { y0, y1 } = s.dims;
  const n = Math.max(8, Math.min(200, Math.round(s.dims.n || 64)));
  const pts: [number, number][] = [];
  let clipped = 0;
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    let r = NaN;
    try {
      r = c.eval({ y });
    } catch {
      r = NaN;
    }
    if (!Number.isFinite(r)) return null;
    if (r < 0) {
      clipped++;
      r = 0;
    }
    pts.push([r, y - (y0 + y1) / 2]);
  }
  return { pts, clipped };
}

/** (x(t), y(t), z(t)) in math axes, sampled over [t0, t1], returned in scene axes. */
export function tubePath(s: ShapeLike): Vec3[] | null {
  const e = s.exprs ?? {};
  const cx = e.x ? compileExpr(e.x, ['t']) : null;
  const cy = e.y ? compileExpr(e.y, ['t']) : null;
  const cz = e.z ? compileExpr(e.z, ['t']) : null;
  if (!cx || !cy || !cz) return null;
  const { t0, t1 } = s.dims;
  const n = Math.max(8, Math.min(1000, Math.round(s.dims.n || 200)));
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    let p: Vec3;
    try {
      p = [cx.eval({ t }), cz.eval({ t }), -cy.eval({ t })];
    } catch {
      return null;
    }
    if (!p.every(Number.isFinite)) return null;
    out.push(p);
  }
  return out;
}

const pathLength = (pts: readonly Vec3[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]), 0);

// ── extents ─────────────────────────────────────────────────────────

export interface Box3 {
  min: Vec3;
  max: Vec3;
}

/** The shape's extent about its own origin, before scale, rotation and position. */
export function localBox(s: ShapeLike): Box3 | null {
  const d = s.dims;
  const sym = (hx: number, hy: number, hz: number): Box3 => ({ min: [-hx, -hy, -hz], max: [hx, hy, hz] });
  switch (s.shape) {
    case 'box':
      return sym(d.w / 2, d.h / 2, d.d / 2);
    case 'sphere':
      return sym(d.r, d.r, d.r);
    case 'cylinder':
    case 'cone':
      return sym(d.r, d.h / 2, d.r);
    case 'capsule':
      return sym(d.r, d.h / 2, d.r);
    case 'torus':
      // lying flat: the ring in the x–z plane
      return sym(d.R + d.r, d.r, d.R + d.r);
    case 'plane':
      return sym(d.w / 2, 0, d.d / 2);
    case 'prism':
    case 'star':
    case 'ring':
    case 'polygon':
    case 'airfoil': {
      const p = profile(s);
      if (!p) return null;
      const xs = p.outer.map((q) => q[0]);
      const zs = p.outer.map((q) => q[1]);
      return { min: [Math.min(...xs), -d.h / 2, Math.min(...zs)], max: [Math.max(...xs), d.h / 2, Math.max(...zs)] };
    }
    case 'surface': {
      const g = surfaceGrid(s);
      if (!g) return null;
      return { min: [d.x0, g.minY, -d.y1], max: [d.x1, g.maxY, -d.y0] };
    }
    case 'revolve': {
      const r = revolveProfile(s);
      if (!r) return null;
      const R = Math.max(...r.pts.map((p) => p[0]));
      const h = (d.y1 - d.y0) / 2;
      return sym(R, h, R);
    }
    case 'tube': {
      const pts = tubePath(s);
      if (!pts) return null;
      const r = d.r;
      const lo: Vec3 = [Infinity, Infinity, Infinity];
      const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
      for (const p of pts)
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], p[k] - r);
          hi[k] = Math.max(hi[k], p[k] + r);
        }
      return { min: lo, max: hi };
    }
  }
  return null;
}

/** Rotation matrix for XYZ Euler angles in degrees (the order Three.js uses by default). */
export function rotationMatrix(rot: Vec3): number[][] {
  const [ax, ay, az] = rot.map((v) => (v * Math.PI) / 180);
  const cx = Math.cos(ax), sx = Math.sin(ax);
  const cy = Math.cos(ay), sy = Math.sin(ay);
  const cz = Math.cos(az), sz = Math.sin(az);
  // R = Rx · Ry · Rz (intrinsic XYZ, as THREE.Euler 'XYZ')
  return [
    [cy * cz, -cy * sz, sy],
    [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
    [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
  ];
}

/** XYZ Euler angles (degrees) of a rotation matrix — the inverse of rotationMatrix. */
export function eulerOf(R: number[][]): Vec3 {
  const sy = Math.max(-1, Math.min(1, R[0][2]));
  const y = Math.asin(sy);
  let x: number;
  let z: number;
  if (Math.abs(sy) < 0.9999999) {
    x = Math.atan2(-R[1][2], R[2][2]);
    z = Math.atan2(-R[0][1], R[0][0]);
  } else {
    x = Math.atan2(R[2][1], R[1][1]);
    z = 0;
  }
  const deg = (v: number) => {
    const d = (v * 180) / Math.PI;
    const r = Math.round(d * 1e9) / 1e9;
    return Object.is(r, -0) ? 0 : r;
  };
  return [deg(x), deg(y), deg(z)];
}

export const matmul3 = (A: number[][], B: number[][]) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));

/** Turn by `deg` about a world axis, composed onto an existing orientation. */
export function rotateAbout(rot: Vec3, axis: 'x' | 'y' | 'z', deg: number): Vec3 {
  // turned only about this same axis so far: the angles add, and stay readable — (0, 225°, 0)
  // would otherwise come back as the equal but opaque (−180°, −45°, −180°)
  const k = { x: 0, y: 1, z: 2 }[axis];
  if (rot.every((v, i) => i === k || v === 0)) {
    const out: Vec3 = [0, 0, 0];
    let v = (((rot[k] + deg) % 360) + 360) % 360;
    if (v > 180) v -= 360;
    out[k] = Math.round(v * 1e9) / 1e9 || 0;
    return out;
  }
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const Rw = axis === 'x' ? [[1, 0, 0], [0, c, -s], [0, s, c]] : axis === 'y' ? [[c, 0, s], [0, 1, 0], [-s, 0, c]] : [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  return eulerOf(matmul3(Rw, rotationMatrix(rot)));
}

/** The axis-aligned box the shape occupies in the scene. */
export function worldBox(s: ShapeLike): Box3 | null {
  const b = localBox(s);
  if (!b) return null;
  const R = rotationMatrix(s.rot);
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < 8; k++) {
    const p = [k & 1 ? b.max[0] : b.min[0], k & 2 ? b.max[1] : b.min[1], k & 4 ? b.max[2] : b.min[2]].map((v, i) => v * s.scale[i]);
    for (let i = 0; i < 3; i++) {
      const w = R[i][0] * p[0] + R[i][1] * p[1] + R[i][2] * p[2] + s.pos[i];
      lo[i] = Math.min(lo[i], w);
      hi[i] = Math.max(hi[i], w);
    }
  }
  return { min: lo, max: hi };
}

// ── measures ────────────────────────────────────────────────────────

export interface Measure {
  /** m³; null for a shape that does not enclose a volume (a surface, a plane) */
  volume: number | null;
  /** m²; null when a stretch makes it more than a formula */
  area: number | null;
  /** 'exact' — a closed form; 'numerical' — integrated or summed over the drawn mesh */
  how: 'exact' | 'numerical';
  note?: string;
}

const simpson = (f: (x: number) => number, a: number, b: number, n = 400) => {
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
};

export function measure(s: ShapeLike): Measure {
  const d = s.dims;
  const [sx, sy, sz] = s.scale;
  const vs = Math.abs(sx * sy * sz);
  const uniform = Math.abs(sx - sy) < 1e-9 && Math.abs(sy - sz) < 1e-9;
  const as = uniform ? sx * sx : NaN;
  const out = (volume: number | null, area: number | null, how: Measure['how'] = 'exact', note?: string): Measure => ({
    volume: volume === null ? null : volume * vs,
    area: area === null || !uniform ? null : area * as,
    how,
    ...(note ? { note } : !uniform && area !== null ? { note: 'stretched unevenly, so its surface area is not a scaled formula' } : {}),
  });
  switch (s.shape) {
    case 'box':
      return out(d.w * d.h * d.d, 2 * (d.w * d.h + d.h * d.d + d.w * d.d));
    case 'sphere':
      return out((4 / 3) * Math.PI * d.r ** 3, 4 * Math.PI * d.r ** 2);
    case 'cylinder':
      return out(Math.PI * d.r * d.r * d.h, 2 * Math.PI * d.r * (d.r + d.h));
    case 'cone':
      return out((Math.PI * d.r * d.r * d.h) / 3, Math.PI * d.r * (d.r + Math.hypot(d.r, d.h)));
    case 'torus':
      return out(2 * Math.PI * Math.PI * d.R * d.r * d.r, 4 * Math.PI * Math.PI * d.R * d.r, 'exact', d.r > d.R ? 'the tube is wider than the ring, so the torus overlaps itself; the formula counts the overlap twice' : undefined);
    case 'capsule': {
      const len = Math.max(0, d.h - 2 * d.r);
      return out(Math.PI * d.r * d.r * len + (4 / 3) * Math.PI * d.r ** 3, 2 * Math.PI * d.r * len + 4 * Math.PI * d.r * d.r);
    }
    case 'plane':
      return out(null, d.w * d.d, 'exact', 'a plane has no thickness, so no volume');
    case 'prism':
    case 'star':
    case 'ring':
    case 'polygon': {
      const p = profile(s);
      if (!p) return { volume: null, area: null, how: 'exact' };
      return out(p.area * d.h, 2 * p.area + p.perimeter * d.h);
    }
    case 'airfoil': {
      const p = profile(s);
      if (!p) return { volume: null, area: null, how: 'numerical' };
      return out(p.area * d.h, 2 * p.area + p.perimeter * d.h, 'numerical', `the NACA section sampled at ${2 * 100} points along its surface (cosine spacing); its area ${p.area.toPrecision(4)} m² and the rest are that polygon's`);
    }
    case 'surface': {
      const g = surfaceGrid(s);
      return { volume: null, area: g && uniform ? g.area * as : null, how: 'numerical', note: g ? `an open surface — its area summed over the ${Math.round(d.n || 48)}² drawn grid${g.holes ? `; ${g.holes} cells left out where f is undefined` : ''}` : undefined };
    }
    case 'revolve': {
      const c = s.exprs?.r ? compileExpr(s.exprs.r, ['y']) : null;
      if (!c) return { volume: null, area: null, how: 'numerical' };
      const r = (y: number) => Math.max(0, c.eval({ y }));
      const dr = (y: number) => (r(y + 1e-6) - r(y - 1e-6)) / 2e-6;
      const V = simpson((y) => Math.PI * r(y) ** 2, d.y0, d.y1);
      const A = simpson((y) => 2 * Math.PI * r(y) * Math.sqrt(1 + dr(y) ** 2), d.y0, d.y1);
      return out(V, A, 'numerical', 'π∫r(y)² dy and 2π∫r√(1 + r′²) dy by Simpson’s rule (the open ends not counted)');
    }
    case 'tube': {
      const pts = tubePath(s);
      if (!pts) return { volume: null, area: null, how: 'numerical' };
      const L = pathLength(pts);
      return out(Math.PI * d.r * d.r * L, 2 * Math.PI * d.r * L, 'numerical', `πr² and 2πr times the curve’s length ${L.toPrecision(4)} m — exact only where the tube does not overlap itself`);
    }
  }
  return { volume: null, area: null, how: 'exact' };
}

// ── where the matter is ─────────────────────────────────────────────

/**
 * The centroid of the solid in its own frame (before scale, rotation and
 * position): the origin for every shape symmetric about it; a quarter of the
 * height above the base for a cone; the area centroid of an extruded outline
 * (the outline is centred on its corners, which is not the same point);
 * Simpson's rule for a revolved shape; the length-weighted middle of a tube's
 * curve. Null for a shape that encloses no volume.
 */
export function centroid(s: ShapeLike): Vec3 | null {
  const d = s.dims;
  switch (s.shape) {
    case 'box':
    case 'sphere':
    case 'cylinder':
    case 'capsule':
    case 'torus':
    case 'prism':
    case 'star':
    case 'ring':
      return [0, 0, 0];
    case 'cone':
      // the apex is at +h/2: the centroid of a solid cone is a quarter of the height above its base
      return [0, -d.h / 4, 0];
    case 'polygon':
    case 'airfoil': {
      const p = profile(s);
      if (!p) return null;
      const pts = p.outer;
      let a = 0, cx = 0, cz = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x1, z1] = pts[i];
        const [x2, z2] = pts[(i + 1) % pts.length];
        const k = x1 * z2 - x2 * z1;
        a += k;
        cx += (x1 + x2) * k;
        cz += (z1 + z2) * k;
      }
      a /= 2;
      return a ? [cx / (6 * a), 0, cz / (6 * a)] : null;
    }
    case 'revolve': {
      const c = s.exprs?.r ? compileExpr(s.exprs.r, ['y']) : null;
      if (!c) return null;
      const r = (y: number) => Math.max(0, c.eval({ y }));
      const mid = (d.y0 + d.y1) / 2;
      const V = simpson((y) => Math.PI * r(y) ** 2, d.y0, d.y1);
      const M = simpson((y) => Math.PI * r(y) ** 2 * (y - mid), d.y0, d.y1);
      return V ? [0, M / V, 0] : null;
    }
    case 'tube': {
      const pts = tubePath(s);
      if (!pts) return null;
      let L = 0;
      const c: Vec3 = [0, 0, 0];
      for (let i = 1; i < pts.length; i++) {
        const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
        L += l;
        for (let k = 0; k < 3; k++) c[k] += ((pts[i][k] + pts[i - 1][k]) / 2) * l;
      }
      return L ? (c.map((v) => v / L) as Vec3) : null;
    }
  }
  return null;
}

/** A point in a part's own frame, in the scene. */
export function toWorld(s: ShapeLike, p: Vec3): Vec3 {
  const R = rotationMatrix(s.rot);
  const q = p.map((v, i) => v * s.scale[i]);
  return [0, 1, 2].map((i) => R[i][0] * q[0] + R[i][1] * q[1] + R[i][2] * q[2] + s.pos[i]) as Vec3;
}

/** A revolved shape's narrowest and end radii, from its own r(y): a nozzle's throat and its two ends. */
export function revolveThroat(s: ShapeLike): { rMin: number; yMin: number; rStart: number; rEnd: number } | null {
  const c = s.exprs?.r ? compileExpr(s.exprs.r, ['y']) : null;
  if (!c) return null;
  const { y0, y1 } = s.dims;
  const n = 2000;
  let best = { r: Infinity, y: y0 };
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    const r = c.eval({ y });
    if (Number.isFinite(r) && r < best.r) best = { r, y };
  }
  const rStart = c.eval({ y: y0 });
  const rEnd = c.eval({ y: y1 });
  if (![best.r, rStart, rEnd].every(Number.isFinite)) return null;
  return { rMin: best.r, yMin: best.y, rStart, rEnd };
}

/**
 * An extruded part's cross-section, from its own outline: area, centroid and
 * second moments of area about the centroid — I about x (∫z² dA) and about
 * z (∫x² dA) in the part's own x–z plane, stretch included.
 *
 * EXACT for every outline that is a polygon (a prism, a star, the person's own
 * corners): Green's theorem over the edges, holes subtracted. EXACT for the
 * ring from the annulus formulas, not its drawn 96-gon. Geometry only — the I
 * a bending formula needs, with no load anywhere.
 */
export function sectionOf(s: ShapeLike): { area: number; cx: number; cz: number; Ix: number; Iz: number } | null {
  if (!['prism', 'star', 'ring', 'polygon'].includes(s.shape)) return null;
  const [sx, , sz] = s.scale;
  let A = 0, Sx = 0, Sz = 0, Ixx = 0, Izz = 0;
  if (s.shape === 'ring') {
    const { R, r } = s.dims;
    A = Math.PI * (R * R - r * r);
    Ixx = Izz = (Math.PI * (R ** 4 - r ** 4)) / 4;
  } else {
    const p = profile(s);
    if (!p) return null;
    // each ring's signed integrals; the outline counts positive and each hole negative, whichever way they wind
    const ringOf = (pts: [number, number][], sign: 1 | -1) => {
      let a = 0, mx = 0, mz = 0, ix = 0, iz = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x0, z0] = pts[i];
        const [x1, z1] = pts[(i + 1) % pts.length];
        const k = x0 * z1 - x1 * z0;
        a += k / 2;
        mx += ((x0 + x1) * k) / 6;
        mz += ((z0 + z1) * k) / 6;
        ix += ((z0 * z0 + z0 * z1 + z1 * z1) * k) / 12;
        iz += ((x0 * x0 + x0 * x1 + x1 * x1) * k) / 12;
      }
      const w = sign * Math.sign(a || 1);
      A += w * a;
      Sx += w * mx;
      Sz += w * mz;
      Ixx += w * ix;
      Izz += w * iz;
    };
    ringOf(p.outer, 1);
    for (const h of p.holes) ringOf(h, -1);
  }
  if (!(A > 0)) return null;
  const cx = Sx / A;
  const cz = Sz / A;
  // about the centroid, then stretched: x by sx and z by sz
  const Ixc = Ixx - A * cz * cz;
  const Izc = Izz - A * cx * cx;
  return { area: A * sx * sz, cx: cx * sx, cz: cz * sz, Ix: Ixc * sx * sz ** 3, Iz: Izc * sx ** 3 * sz };
}
