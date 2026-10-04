// lib/mind/ar.ts
//
// The geometry behind /mind-ar: the Mind Graph laid out in three dimensions,
// and a camera that orbits it, zooms into it and flies to a node. Kept here,
// pure, so the page is drawing and input and nothing else — and so a suite
// can hold the layout to being deterministic and the projection to being
// right.
//
// PURE. No DOM, no clock, no randomness: the same graph always lands in the
// same place, so a node is where you left it after a reload.

export interface ArNode {
  id: string;
  type: string;
  label: string;
  content?: string;
  importance?: number;
}
export interface ArEdge {
  sourceId: string;
  targetId: string;
  relationship?: string;
}
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export type Positions3 = Record<string, Vec3>;

/** The orbit camera: where it looks, from how far, at what angle. */
export interface ArCamera {
  /** the point the camera orbits, in graph space */
  pivot: Vec3;
  /** rotation about the vertical axis, radians */
  yaw: number;
  /** rotation about the horizontal axis, radians */
  pitch: number;
  /** distance from the pivot; smaller is closer */
  dist: number;
}

export const ZOOM = { min: 0.18, max: 4.5 } as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/**
 * A 3D force layout, normalised to the unit ball.
 *
 * Seeded on a Fibonacci sphere in id order (so it is deterministic and
 * evenly spread before a single step runs), then repulsion between every
 * pair, springs along edges and a weak pull to the centre. O(n² · iters), so
 * the caller lowers `iters` for a crowd.
 */
export function layout3d(nodes: readonly ArNode[], edges: readonly ArEdge[], iters = 160): Positions3 {
  const n = nodes.length;
  const out: Positions3 = {};
  if (!n) return out;
  const order = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const idx = new Map(order.map((nd, i) => [nd.id, i]));
  const P = order.map((nd, i) => {
    // Fibonacci sphere, nudged by the id so two graphs of the same size differ.
    const y = n === 1 ? 0 : 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const t = i * 2.399963229728653 + hash(nd.id) * 0.6;
    return { x: Math.cos(t) * r, y, z: Math.sin(t) * r };
  });
  const E = edges
    .map((e) => [idx.get(e.sourceId), idx.get(e.targetId)] as const)
    .filter((e): e is readonly [number, number] => e[0] !== undefined && e[1] !== undefined && e[0] !== e[1]);
  const k = 0.9 / Math.cbrt(Math.max(1, n));
  for (let it = 0; it < iters; it++) {
    const cool = 0.1 * (1 - it / iters) + 0.01;
    const D = P.map(() => ({ x: 0, y: 0, z: 0 }));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, dz = P[i].z - P[j].z;
        const d2 = dx * dx + dy * dy + dz * dz + 1e-4;
        const f = (k * k) / d2;
        D[i].x += dx * f; D[i].y += dy * f; D[i].z += dz * f;
        D[j].x -= dx * f; D[j].y -= dy * f; D[j].z -= dz * f;
      }
    }
    for (const [a, b] of E) {
      const dx = P[a].x - P[b].x, dy = P[a].y - P[b].y, dz = P[a].z - P[b].z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
      const f = (d - k) / d * 0.5;
      D[a].x -= dx * f; D[a].y -= dy * f; D[a].z -= dz * f;
      D[b].x += dx * f; D[b].y += dy * f; D[b].z += dz * f;
    }
    for (let i = 0; i < n; i++) {
      D[i].x -= P[i].x * 0.02; D[i].y -= P[i].y * 0.02; D[i].z -= P[i].z * 0.02;
      const m = Math.sqrt(D[i].x ** 2 + D[i].y ** 2 + D[i].z ** 2) || 1;
      const s = Math.min(m, cool) / m;
      P[i].x += D[i].x * s; P[i].y += D[i].y * s; P[i].z += D[i].z * s;
    }
  }
  // Centre, then scale so the furthest node sits on the unit sphere.
  const c = P.reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n, z: a.z + p.z / n }), { x: 0, y: 0, z: 0 });
  const R = Math.max(1e-6, ...P.map((p) => Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z)));
  order.forEach((nd, i) => {
    out[nd.id] = n === 1 ? { x: 0, y: 0, z: 0 } : { x: (P[i].x - c.x) / R, y: (P[i].y - c.y) / R, z: (P[i].z - c.z) / R };
  });
  return out;
}

/** A point in camera space: x right, y down, z into the screen. */
export function toCamera(p: Vec3, cam: ArCamera): Vec3 {
  const x0 = p.x - cam.pivot.x, y0 = p.y - cam.pivot.y, z0 = p.z - cam.pivot.z;
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const x1 = x0 * cy - z0 * sy;
  const z1 = x0 * sy + z0 * cy;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const y2 = y0 * cp - z1 * sp;
  const z2 = y0 * sp + z1 * cp;
  return { x: x1, y: -y2, z: z2 + cam.dist };
}

/**
 * Where a point lands on a screen of w × h, or null when it is behind the
 * camera (or so close it would fill the screen). `scale` is the size a unit
 * of graph space appears at that depth, for sizing dots and labels.
 */
export function project(
  p: Vec3,
  cam: ArCamera,
  w: number,
  h: number
): { x: number; y: number; depth: number; scale: number } | null {
  const c = toCamera(p, cam);
  if (c.z < 0.06) return null;
  const f = Math.min(w, h) * 0.62;
  return { x: w / 2 + (c.x / c.z) * f, y: h / 2 + (c.y / c.z) * f, depth: c.z, scale: f / c.z };
}

/** Clamp a zoom distance to what the page allows. */
export function clampDist(d: number): number {
  return Math.max(ZOOM.min, Math.min(ZOOM.max, d));
}

/**
 * Zoom by a pinch: the distance between two fingers (or two hands) went from
 * `before` to `after`, so the camera moves in by the same ratio.
 */
export function pinchZoom(dist: number, before: number, after: number): number {
  if (!(before > 0) || !(after > 0)) return dist;
  return clampDist(dist * (before / after));
}

/** One step of easing toward a target camera; `t` is the fraction per frame. */
export function easeCamera(cur: ArCamera, target: Partial<ArCamera>, t: number): ArCamera {
  const lerp = (a: number, b: number | undefined) => (b === undefined ? a : a + (b - a) * t);
  return {
    pivot: target.pivot
      ? { x: lerp(cur.pivot.x, target.pivot.x), y: lerp(cur.pivot.y, target.pivot.y), z: lerp(cur.pivot.z, target.pivot.z) }
      : cur.pivot,
    yaw: lerp(cur.yaw, target.yaw),
    pitch: lerp(cur.pitch, target.pitch),
    dist: lerp(cur.dist, target.dist),
  };
}

/** The node nearest a screen point, within `radius` pixels, front-most first. */
export function pick(
  pos: Positions3,
  cam: ArCamera,
  w: number,
  h: number,
  sx: number,
  sy: number,
  radius = 28
): string | null {
  let best: string | null = null;
  let bestScore = Infinity;
  for (const [id, p] of Object.entries(pos)) {
    const s = project(p, cam, w, h);
    if (!s) continue;
    const d = Math.hypot(s.x - sx, s.y - sy);
    if (d > radius) continue;
    const score = d + s.depth * 4;
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

/**
 * A graph to show when there is no memory to show: signed out on this
 * deployment, memory not running, or nothing remembered yet. Labelled as a
 * sample on the page, never passed off as somebody's memory.
 */
export const SAMPLE_GRAPH: { nodes: ArNode[]; edges: ArEdge[] } = (() => {
  const nodes: ArNode[] = [
    { id: 's1', type: 'person', label: 'You', importance: 1, content: 'The centre of the graph: everything here is something Socria learned about how you think.' },
    { id: 's2', type: 'goal', label: 'Finish the thesis by June', importance: 0.9 },
    { id: 's3', type: 'project', label: 'Thesis: remote work and wellbeing', importance: 0.85 },
    { id: 's4', type: 'belief', label: 'Remote work is better for most people', importance: 0.7 },
    { id: 's5', type: 'assumption', label: '“most” = people like me', importance: 0.6 },
    { id: 's6', type: 'tension', label: 'Freedom ↔ boundaries', importance: 0.75 },
    { id: 's7', type: 'evidence', label: 'People who need the office to switch off', importance: 0.55 },
    { id: 's8', type: 'decision', label: 'Take the Berlin offer?', importance: 0.8 },
    { id: 's9', type: 'value', label: 'Learning over title', importance: 0.7 },
    { id: 's10', type: 'pattern', label: 'Treats money as progress', importance: 0.6 },
    { id: 's11', type: 'preference', label: 'Prefers questions to answers', importance: 0.5 },
    { id: 's12', type: 'concept', label: 'Opportunity cost', importance: 0.45 },
    { id: 's13', type: 'project', label: 'Bakery pricing', importance: 0.5 },
    { id: 's14', type: 'claim', label: 'The second tier is underpriced', importance: 0.45 },
    { id: 's15', type: 'question', label: 'What would make staying the right call?', importance: 0.55 },
  ];
  const E: [string, string, string][] = [
    ['s1', 's2', 'has_goal'], ['s2', 's3', 'part_of'], ['s3', 's4', 'argues'], ['s4', 's5', 'assumes'],
    ['s4', 's6', 'in_tension_with'], ['s6', 's7', 'supported_by'], ['s1', 's8', 'deciding'],
    ['s8', 's9', 'weighs'], ['s8', 's10', 'shows'], ['s10', 's9', 'contradicts'], ['s1', 's11', 'prefers'],
    ['s8', 's12', 'uses'], ['s1', 's13', 'works_on'], ['s13', 's14', 'claims'], ['s14', 's12', 'uses'],
    ['s8', 's15', 'raises'], ['s15', 's9', 'about'],
  ];
  return { nodes, edges: E.map(([sourceId, targetId, relationship]) => ({ sourceId, targetId, relationship })) };
})();
