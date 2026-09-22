// lib/mind/layout.ts
//
// Where the nodes go.
//
// Pure on purpose. The canvas in MindGraphView is the only thing that draws,
// and this is the only thing that decides positions — which means the layout
// can be tested without a DOM, and the drawing can be changed without
// touching the arithmetic underneath it.
//
// ONE SETTLE, THEN IT STOPS. No loop runs after the layout is found. That is
// what makes it correct under prefers-reduced-motion rather than merely
// tolerable: there is no animation to reduce, because the simulation has
// already finished by the time anything is painted.

export interface LayoutNode {
  id: string;
  /** the folder this belongs to — a node type */
  type: string;
}
/** [source, target] — the relationship name is the drawing's business. */
export type LayoutEdge = [string, string];

export interface Point { x: number; y: number }
export type Positions = Record<string, Point>;

/**
 * Force-directed placement: repulsion between every pair, springs along
 * edges, a weak pull toward the middle so nothing drifts off.
 *
 * `iters` is the caller's budget. The cost is O(n² · iters), so the caller
 * lowers it for a crowd — 200 for a few hundred nodes, 300 otherwise.
 */
export function settle(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  W: number,
  H: number,
  iters: number
): Positions {
  const n = nodes.length;
  const out: Positions = {};
  if (!n) return out;

  const P = new Float64Array(n * 2);
  const V = new Float64Array(n * 2);
  const idx: Record<string, number> = {};
  nodes.forEach((d, i) => (idx[d.id] = i));

  // A ring rather than random: deterministic, so the same graph settles the
  // same way twice. A layout that moves when nothing changed reads as the
  // memory having changed, which is a lie the canvas should not tell.
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = Math.min(W, H) * 0.34;
    P[i * 2] = W / 2 + Math.cos(a) * r * (0.6 + (i % 5) / 7);
    P[i * 2 + 1] = H / 2 + Math.sin(a) * r * (0.6 + (i % 3) / 5);
  }

  const E: [number, number][] = [];
  for (const [a, b] of edges) {
    const ia = idx[a];
    const ib = idx[b];
    if (ia !== undefined && ib !== undefined) E.push([ia, ib]);
  }

  const rep = Math.min(3200, 900_000 / n);
  const K = Math.max(58, Math.min(112, 900 / Math.sqrt(n)));

  for (let s = 0; s < iters; s++) {
    const cool = 1 - s / iters;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = P[i * 2] - P[j * 2];
        let dy = P[i * 2 + 1] - P[j * 2 + 1];
        let d2 = dx * dx + dy * dy;
        // Two nodes exactly on top of each other have no direction to
        // separate along; the index gives them one deterministically.
        if (d2 < 1) { d2 = 1; dx = (i % 7) - 3; dy = (j % 5) - 2; }
        const f = rep / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        V[i * 2] += fx; V[i * 2 + 1] += fy;
        V[j * 2] -= fx; V[j * 2 + 1] -= fy;
      }
    }
    for (const [a, b] of E) {
      const dx = P[b * 2] - P[a * 2];
      const dy = P[b * 2 + 1] - P[a * 2 + 1];
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = (d - K) * 0.04;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      V[a * 2] += fx; V[a * 2 + 1] += fy;
      V[b * 2] -= fx; V[b * 2 + 1] -= fy;
    }
    for (let i = 0; i < n; i++) {
      V[i * 2] += (W / 2 - P[i * 2]) * 0.013;
      V[i * 2 + 1] += (H / 2 - P[i * 2 + 1]) * 0.013;
      P[i * 2] += (V[i * 2] *= 0.82) * cool;
      P[i * 2 + 1] += (V[i * 2 + 1] *= 0.82) * cool;
    }
  }

  // Fit the BODY of the map, not its stragglers. Two far-flung nodes would
  // otherwise set the scale and shrink everything else into an unreadable
  // knot in the middle — so past sixty nodes the outer 3% is allowed off the
  // edge, and clamped back to it.
  const pad = 26;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) { xs.push(P[i * 2]); ys.push(P[i * 2 + 1]); }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const q = (arr: number[], t: number) =>
    arr[Math.min(arr.length - 1, Math.max(0, Math.round((arr.length - 1) * t)))];
  const lo = n > 60 ? 0.03 : 0;
  const hi = 1 - lo;
  const x0 = q(xs, lo), x1 = q(xs, hi), y0 = q(ys, lo), y1 = q(ys, hi);
  const sx = (W - pad * 2) / Math.max(1, x1 - x0);
  const sy = (H - pad * 2) / Math.max(1, y1 - y0);
  const k = Math.min(sx, sy);
  const ox = pad + (W - pad * 2 - (x1 - x0) * k) / 2;
  const oy = pad + (H - pad * 2 - (y1 - y0) * k) / 2;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  nodes.forEach((d, i) => {
    out[d.id] = {
      x: clamp(ox + (P[i * 2] - x0) * k, pad, W - pad),
      y: clamp(oy + (P[i * 2 + 1] - y0) * k, pad, H - pad),
    };
  });
  return out;
}

export interface Folder {
  type: string;
  x: number;
  y: number;
  r: number;
  items: LayoutNode[];
}
export interface FolderLink {
  a: string; b: string; rel: string; n: number;
  ax: number; ay: number; bx: number; by: number;
}
export interface FoldedLayout {
  pos: Positions;
  groups: Folder[];
  links: FolderLink[];
}

/**
 * The same graph, one circle per type.
 *
 * Four hundred loose dots is a starfield: true, and unreadable. Grouping by
 * type gives the canvas the structure the list already has — the folders on
 * screen and the folders in the explorer are the same idea in two registers,
 * which is what lets somebody move between the views without relearning
 * anything.
 */
export function foldLayout(
  nodes: readonly LayoutNode[],
  edges: readonly (readonly [string, string, string])[],
  W: number,
  H: number
): FoldedLayout {
  const by: Record<string, LayoutNode[]> = {};
  for (const d of nodes) (by[d.type] = by[d.type] ?? []).push(d);
  const types = Object.keys(by).sort();

  const typeOf: Record<string, string> = {};
  for (const d of nodes) typeOf[d.id] = d.type;

  // One link per PAIR of folders, carrying how many real edges it stands for.
  // Drawing all of them would put four hundred lines between eleven circles.
  const seen: Record<string, { a: string; b: string; rel: string; n: number }> = {};
  const gEdges: LayoutEdge[] = [];
  for (const [a, b, rel] of edges) {
    const ta = typeOf[a];
    const tb = typeOf[b];
    if (!ta || !tb || ta === tb) continue;
    const key = ta < tb ? `${ta}|${tb}` : `${tb}|${ta}`;
    if (seen[key]) { seen[key].n++; continue; }
    seen[key] = { a: ta, b: tb, rel, n: 1 };
    gEdges.push([ta, tb]);
  }

  // Capped by the room available, so eleven folders never have to overlap to
  // fit. Without the cap a type with many members swells until it swallows
  // its neighbours.
  const cap = Math.sqrt((W * H * 0.4) / (Math.max(1, types.length) * Math.PI)) - 14;
  const R = (t: string) => Math.max(30, Math.min(150, cap, 34 + Math.sqrt(by[t].length) * 17));

  const C = settle(types.map((t) => ({ id: t, type: t })), gEdges, W, H, 300);

  // Then push them apart until none overlap. The spring layout gets the
  // arrangement right and the spacing wrong; this fixes only the spacing.
  for (let s = 0; s < 340; s++) {
    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        const A = C[types[i]];
        const B = C[types[j]];
        const want = R(types[i]) + R(types[j]) + 26;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        if (dist >= want) continue;
        const push = (want - dist) / 2 / dist;
        A.x -= dx * push; A.y -= dy * push;
        B.x += dx * push; B.y += dy * push;
      }
    }
    for (const t of types) {
      const r = R(t) + 12;
      C[t].x = Math.max(r, Math.min(W - r, C[t].x));
      C[t].y = Math.max(r, Math.min(H - r, C[t].y));
    }
  }

  const pos: Positions = {};
  const groups: Folder[] = [];
  for (const t of types) {
    const c = C[t];
    const r = R(t);
    const items = by[t];
    // Two rings past fourteen, so a crowded folder does not become a solid
    // ring of overlapping dots.
    const rings = items.length > 14 ? 2 : 1;
    items.forEach((d, i) => {
      const ring = rings === 1 ? 0 : i % 2;
      const per = rings === 1 ? items.length : Math.ceil(items.length / 2);
      const k = rings === 1 ? i : Math.floor(i / 2);
      const rad = r * (rings === 1 ? 0.62 : ring ? 0.78 : 0.44);
      const a = (k / Math.max(1, per)) * Math.PI * 2 - Math.PI / 2 + (ring ? 0.4 : 0);
      pos[d.id] = { x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad };
    });
    groups.push({ type: t, x: c.x, y: c.y, r, items });
  }

  return {
    pos,
    groups,
    links: Object.values(seen).map((l) => ({
      ...l,
      ax: C[l.a].x, ay: C[l.a].y, bx: C[l.b].x, by: C[l.b].y,
    })),
  };
}
