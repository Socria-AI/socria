// lib/logos5/mapLod.ts — HOW MUCH DETAIL THE UNIVERSAL MAP DRAWS, FOR HOW FAR AWAY IT IS SEEN.
//
// Level of detail as games do it: the scale (lib/logos5/scales.ts) says WHAT belongs on the map; the camera's
// zoom says HOW it is drawn. The two never decide for each other, so All Time can still be zoomed into one
// conversation and Today can still be seen from far away.
//
//   far    the shape of what they know: each subject a soft region with its name kept readable, a busy one
//          drawn as one region with how many it holds (aggregated: its conversations are not drawn one by one,
//          and pressing it goes in), the links between subjects, few words
//   mid    subjects and their sessions; names on the larger discs; the joins inside a subject
//   near   every conversation, every word, every line
//
// The level changes with hysteresis — it goes down at one zoom and comes back up at a higher one — so a camera
// resting on a boundary never flickers between two levels. What is drawn is also culled to the view (with a
// margin, so a quick pan does not show an empty edge) and capped by a budget, the most important first.
//
// PURE.

export type Lod = 'far' | 'mid' | 'near';

/** Where each level begins, in camera zoom, going down (to the level below) and up (back to it). */
export const LOD_AT = {
  /** below this, far; above `farUp`, mid again */
  farDown: 0.34,
  farUp: 0.4,
  /** above this, near; below `nearDown`, mid again */
  nearUp: 0.82,
  nearDown: 0.72,
} as const;

/** The level for a zoom, given the level before (hysteresis: a boundary is crossed one way at one zoom, back at another). */
export function lodFor(k: number, prev: Lod | null): Lod {
  if (prev === 'far') return k > LOD_AT.farUp ? (k >= LOD_AT.nearUp ? 'near' : 'mid') : 'far';
  if (prev === 'near') return k < LOD_AT.nearDown ? (k <= LOD_AT.farDown ? 'far' : 'mid') : 'near';
  if (k <= LOD_AT.farDown) return 'far';
  if (k >= LOD_AT.nearUp) return 'near';
  return 'mid';
}

export interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * What of the world the camera sees, with a margin around it (a share of the view's own size), in world units:
 * what is culled to. Camera: screen = world × k + (x, y).
 */
export function viewOf(cam: { x: number; y: number; k: number }, w: number, h: number, margin = 0.5): View {
  const k = cam.k || 1;
  const mx = w * margin;
  const my = h * margin;
  return { x0: (-cam.x - mx) / k, y0: (-cam.y - my) / k, x1: (w - cam.x + mx) / k, y1: (h - cam.y + my) / k };
}

/** Does a circle (or a box) touch the view? */
export const circleIn = (v: View, x: number, y: number, r: number): boolean => x + r >= v.x0 && x - r <= v.x1 && y + r >= v.y0 && y - r <= v.y1;
export const boxIn = (v: View, b: { x: number; y: number; w: number; h: number }): boolean => b.x + b.w >= v.x0 && b.x <= v.x1 && b.y + b.h >= v.y0 && b.y <= v.y1;

/**
 * Does the view still hold the part of the world the camera now shows? A culled set is recomputed only when
 * the camera has gone past the margin it was culled with (or zoomed out past it), never every frame.
 */
export function viewCovers(culled: View, cam: { x: number; y: number; k: number }, w: number, h: number): boolean {
  const now = viewOf(cam, w, h, 0);
  return now.x0 >= culled.x0 && now.y0 >= culled.y0 && now.x1 <= culled.x1 && now.y1 <= culled.y1;
}

/** A subject this busy is drawn as one region when the map is seen from far away. */
export const AGGREGATE_AT = 9;

/** Is a subject drawn as one region, at this level, with this many of its conversations on the map? */
export const aggregated = (lod: Lod, shown: number): boolean => lod === 'far' && shown >= AGGREGATE_AT;

/**
 * The most a level draws one by one (sessions and quick questions together); past it, the least important
 * — the smallest, the oldest — wait until the camera comes closer. Generous enough that no ordinary map meets it.
 */
export const BUDGET: Record<Lod, number> = { far: 160, mid: 420, near: 900 };

/**
 * Which of the candidates are drawn under a budget: all of them when they fit, otherwise the most important
 * first (a higher score first; the id breaks a tie, so the same map always draws the same ones). Those kept
 * always include `keep` (what is chosen, pointed at, or found), whatever the budget.
 */
export function withinBudget<T extends { id: string; score: number }>(items: readonly T[], budget: number, keep: ReadonlySet<string> = new Set()): T[] {
  if (items.length <= budget) return [...items];
  const must = items.filter((i) => keep.has(i.id));
  const rest = items.filter((i) => !keep.has(i.id)).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  return [...must, ...rest.slice(0, Math.max(0, budget - must.length))];
}

/**
 * PROGRESSIVE DRAWING. When the camera comes close enough that many conversations are drawn at once (a busy map
 * going from far to mid), they are added over a few frames rather than in one long one: those already drawn and
 * those that must be (chosen, pointed at, found) first, then the rest nearest the middle of the view first, so the
 * part being looked at fills in first. Fewer than `PROGRESSIVE_AT` new ones are all drawn at once.
 */
export const PROGRESSIVE_AT = 160;
/** How many more each frame, while drawing progressively. */
export const PER_FRAME = 140;

/**
 * The order to draw in, or null when everything new can simply be drawn now. `first`: how many of the order are
 * drawn straight away (those already there and those that must be); the rest follow `PER_FRAME` at a time.
 */
export function revealOrder<T extends { id: string; x: number; y: number }>(
  items: readonly T[],
  before: ReadonlySet<string>,
  must: ReadonlySet<string>,
  centre: { x: number; y: number }
): { order: string[]; first: number } | null {
  const fresh = items.filter((i) => !before.has(i.id) && !must.has(i.id));
  if (fresh.length <= PROGRESSIVE_AT) return null;
  const now = items.filter((i) => before.has(i.id) || must.has(i.id)).map((i) => i.id);
  const d = (i: T) => (i.x - centre.x) ** 2 + (i.y - centre.y) ** 2;
  return { order: [...now, ...fresh.sort((a, b) => d(a) - d(b) || (a.id < b.id ? -1 : 1)).map((i) => i.id)], first: now.length };
}

/**
 * The subject names worth showing from far away: the largest first, then any that do not overlap one already
 * kept (in screen space, at the given zoom). A subject name never overlaps another: one that would waits.
 */
export function namesFromFar<T extends { key: string; x: number; y: number; r: number; w: number }>(regions: readonly T[], k: number, max = 24): Set<string> {
  const kept: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const out = new Set<string>();
  for (const g of [...regions].sort((a, b) => b.r - a.r || (a.key < b.key ? -1 : 1))) {
    if (out.size >= max) break;
    // the name sits over the region's centre at a fixed screen size: its box, in screen units
    const cx = g.x * k;
    const cy = g.y * k;
    const box = { x0: cx - g.w / 2 - 6, y0: cy - 14, x1: cx + g.w / 2 + 6, y1: cy + 14 };
    if (kept.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
    kept.push(box);
    out.add(g.key);
  }
  return out;
}

/**
 * A SESSION'S NAME BESIDE IT, when its own words are too small to read at this zoom: which ones get one. Each
 * name is a box under its disc at one size on screen; they are given out the largest disc first, and one that
 * would overlap a name already given, or any other disc drawn (`others`: every disc on the map, not only those
 * wanting a name; the candidates themselves when not given), waits. Screen space: world × k. At most `max`.
 */
export function tagsAt<T extends { id: string; x: number; y: number; r: number; w: number }>(
  discs: readonly T[],
  k: number,
  max = 60,
  others: readonly { id: string; x: number; y: number; r: number }[] = discs
): Set<string> {
  type B = { x0: number; y0: number; x1: number; y1: number; id: string };
  const hit = (a: B, b: Omit<B, 'id'>) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const round: B[] = others.map((d) => ({ id: d.id, x0: (d.x - d.r) * k, y0: (d.y - d.r) * k, x1: (d.x + d.r) * k, y1: (d.y + d.r) * k }));
  const kept: B[] = [];
  const out = new Set<string>();
  const order = [...discs].sort((a, b) => b.r - a.r || (a.id < b.id ? -1 : 1));
  for (const d of order) {
    if (out.size >= max) break;
    const cx = d.x * k;
    const top = (d.y + d.r) * k + 4;
    const box = { id: d.id, x0: cx - d.w / 2 - 3, y0: top, x1: cx + d.w / 2 + 3, y1: top + 17 };
    if (kept.some((b) => hit(b, box)) || round.some((b) => b.id !== d.id && hit(b, box))) continue;
    kept.push(box);
    out.add(d.id);
  }
  return out;
}

/** Ease in and out, for a camera that glides (0..1 → 0..1). */
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * A camera between two others, for a glide: the zoom is interpolated in log space (so going in and coming out
 * feel the same speed), and the point under the middle of the view travels in a straight line.
 */
export function camBetween(a: { x: number; y: number; k: number }, b: { x: number; y: number; k: number }, t: number, w: number, h: number): { x: number; y: number; k: number } {
  const e = easeInOut(Math.max(0, Math.min(1, t)));
  const k = Math.exp(Math.log(a.k) + (Math.log(b.k) - Math.log(a.k)) * e);
  // the world point at the view's centre for each, interpolated
  const ca = { x: (w / 2 - a.x) / a.k, y: (h / 2 - a.y) / a.k };
  const cb = { x: (w / 2 - b.x) / b.k, y: (h / 2 - b.y) / b.k };
  const cx = ca.x + (cb.x - ca.x) * e;
  const cy = ca.y + (cb.y - ca.y) * e;
  return { x: w / 2 - cx * k, y: h / 2 - cy * k, k };
}
