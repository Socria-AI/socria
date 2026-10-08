// lib/objects/scene-plan.ts
//
// A SCENE SEEN FROM ABOVE — each part's outline on the floor plane (x, z), as
// a map card draws it where a live 3D view would be too much. Computed from
// the same geometry the 3D view and the measurements use:
//
//   an upright extruded part (prism, star, ring, polygon) or a torus — its
//   outline, holes included, turned and placed;
//   anything else — the convex hull of points on its surface, turned by its
//   full orientation, which is its silhouette from above for every convex
//   shape (a box, a sphere, a cylinder, a cone, a capsule, a plane) and the
//   outline of its extent for the rest (a surface, a tube, a revolved shape).
//
// PURE.

import { localBox, profile, revolveProfile, rotationMatrix, surfaceGrid, tubePath, type Vec3 } from './scene-geometry';
import type { SceneNode, SceneState } from './scene';

export interface PlanPart {
  id: string;
  color: string;
  /** outer outline, then holes; each a list of (x, z) */
  rings: [number, number][][];
  /** its silhouette from above (true), or only the convex outline of its extent (false) */
  silhouette: boolean;
}

export interface Plan {
  parts: PlanPart[];
  /** x0, z0, x1, z1 over everything */
  bounds: [number, number, number, number] | null;
}

function hull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const circle = (r: number, y: number, n = 32): Vec3[] => Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), y, r * Math.sin((2 * Math.PI * i) / n)] as Vec3);

/** Points on the part's surface, in its own frame. */
function samples(n: SceneNode): Vec3[] {
  const d = n.dims;
  switch (n.shape) {
    case 'sphere':
      return [-0.75, -0.4, 0, 0.4, 0.75].flatMap((t) => circle(d.r * Math.sqrt(1 - t * t), d.r * t, 24)).concat([[0, d.r, 0], [0, -d.r, 0]]);
    case 'cylinder':
      return [...circle(d.r, -d.h / 2), ...circle(d.r, d.h / 2)];
    case 'cone':
      return [...circle(d.r, -d.h / 2), [0, d.h / 2, 0]];
    case 'capsule': {
      const c = d.h / 2 - d.r;
      return [-1, -0.5, 0, 0.5, 1].flatMap((t) => [...circle(d.r * Math.sqrt(1 - t * t), c + d.r * t, 16), ...circle(d.r * Math.sqrt(1 - t * t), -c - d.r * t, 16)]);
    }
    case 'torus':
      return [-1, -0.5, 0, 0.5, 1].flatMap((t) => circle(d.R + d.r * Math.sqrt(1 - t * t), d.r * t, 40));
    case 'surface': {
      const g = surfaceGrid(n);
      if (!g) return [];
      const out: Vec3[] = [];
      for (let i = 0; i < g.positions.length; i += 3) out.push([g.positions[i], g.positions[i + 1], g.positions[i + 2]]);
      return out;
    }
    case 'revolve': {
      const r = revolveProfile(n);
      return r ? r.pts.flatMap(([rad, y]) => circle(rad, y, 24)) : [];
    }
    case 'tube':
      return tubePath(n) ?? [];
    case 'prism':
    case 'star':
    case 'ring':
    case 'polygon':
    case 'airfoil': {
      const p = profile(n);
      return p ? p.outer.flatMap(([x, z]) => [[x, -d.h / 2, z] as Vec3, [x, d.h / 2, z] as Vec3]) : [];
    }
  }
  // box, plane: the corners of its extent are its corners
  const b = localBox(n);
  if (!b) return [];
  const out: Vec3[] = [];
  for (let k = 0; k < 8; k++) out.push([k & 1 ? b.max[0] : b.min[0], k & 2 ? b.max[1] : b.min[1], k & 4 ? b.max[2] : b.min[2]]);
  return out;
}

const upright = (n: SceneNode) => Math.abs(n.rot[0]) < 1e-9 && Math.abs(n.rot[2]) < 1e-9;

export function planOf(s: SceneState): Plan {
  const parts: PlanPart[] = [];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const n of s.nodes) {
    const R = rotationMatrix(n.rot);
    const place = ([x, y, z]: Vec3): [number, number] => {
      const p = [x * n.scale[0], y * n.scale[1], z * n.scale[2]];
      return [R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2] + n.pos[0], R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2] + n.pos[2]];
    };
    let rings: [number, number][][] = [];
    let silhouette = true;
    const prof = (n.shape === 'prism' || n.shape === 'star' || n.shape === 'ring' || n.shape === 'polygon') && upright(n) ? profile(n) : null;
    if (prof) rings = [prof.outer, ...prof.holes].map((ring) => ring.map(([x, z]) => place([x, 0, z])));
    else if (n.shape === 'torus' && upright(n)) rings = [circle(n.dims.R + n.dims.r, 0, 64), circle(Math.max(0, n.dims.R - n.dims.r), 0, 64).reverse()].map((c) => c.map(place));
    else {
      const pts = samples(n).map(place);
      if (pts.length < 3) continue;
      rings = [hull(pts)];
      // convex shapes: the hull of their surface is their silhouette; the rest, only its outline
      silhouette = n.shape === 'box' || n.shape === 'plane' || n.shape === 'cylinder' || n.shape === 'cone' || n.shape === 'sphere' || n.shape === 'capsule' || n.shape === 'prism';
    }
    for (const r of rings) for (const [x, z] of r) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    parts.push({ id: n.id, color: n.color, rings, silhouette });
  }
  return { parts, bounds: parts.length ? [x0, z0, x1, z1] : null };
}
