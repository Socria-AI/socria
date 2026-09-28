// lib/model/primitives.ts
//
// THE THINGS A RENDERER KNOWS HOW TO DRAW, AND THE ONLY THINGS IT KNOWS.
//
// The renderer must not understand economics, astrophysics or finance. It
// understands points, lines, meshes, vectors, regions and labels — and it is
// the model layer (lib/model/schema.ts) that knows a mesh is a volatility
// surface. That separation is the whole reason a new domain is a new MODEL
// and not a new component.
//
// EVERYTHING HERE IS IN MODEL SPACE. Not pixels, not the unit box: the
// quantities' own units, so a primitive is comparable with the numbers it came
// from, can be sliced and measured, and survives a camera move without being
// rebuilt. Projection happens once, in the renderer, through the frame
// (lib/logos-viz3d.ts place/project3) that already exists for exactly this.
//
// EVERY PRIMITIVE CARRIES `of`: the id of the ModelObject it draws. That one
// field is what makes a click resolve to a meaning, a layer toggle reach the
// right marks, and a recomputation replace only what moved.

import type { Tone } from '@/lib/logos-viz';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** What every primitive carries, whatever it draws. */
interface Marked {
  /** the ModelObject this is a drawing of */
  of: string;
  /** semantic colour role; the palette resolves it */
  tone?: Tone;
  /**
   * A colour that IS a computed quantity — a blackbody temperature, an
   * element's convention — and therefore cannot be one of five named roles.
   * The renderer prefers it over the tone, and the model says what it encodes.
   */
  color?: string;
  layer?: string;
  /** 0–1; used for uncertainty bands and for what is behind something else */
  alpha?: number;
}

/** Loose points: a scatter, a particle set, sampled observations. */
export interface Points extends Marked {
  p: 'points';
  at: P3[];
  /** radius in page units; a size that means something is a `sized` field */
  r?: number;
  /** per-point radius, where the size encodes a quantity */
  sized?: number[];
}

/** An open or closed run: a curve, a trajectory, an edge, a boundary. */
export interface Polyline extends Marked {
  p: 'polyline';
  at: P3[];
  closed?: boolean;
  dashed?: boolean;
  width?: number;
}

/**
 * A sampled surface as a grid of rows.
 *
 * `null` where the function has no value, and the renderer breaks its runs
 * there rather than drawing across the hole — a line over a pole is a line the
 * function does not contain.
 */
export interface Mesh extends Marked {
  p: 'mesh';
  rows: (P3 | null)[][];
  /** draw as a wireframe (the honest default) or as filled quads */
  fill?: boolean;
  /** per-vertex scalar, for colouring by a quantity rather than by role */
  scalar?: (number | null)[][];
}

/** Arrows: a vector field, a gradient, a force, a velocity. */
export interface Vectors extends Marked {
  p: 'vectors';
  at: P3[];
  /** the vector itself, in the quantity's units */
  dir: P3[];
  /**
   * How long an arrow of unit magnitude is drawn, in model units. Set by the
   * sampler from the field's own scale, so a field of tiny vectors is legible
   * without the picture claiming they are large.
   */
  scale: number;
  /** true when the lengths were clipped to keep the field readable */
  clipped?: boolean;
}

/** A filled area: a feasible region, a confidence band, a cross-section. */
export interface Region extends Marked {
  p: 'region';
  at: P3[];
}

/** A word placed in the scene, not on the chrome. */
export interface Label extends Marked {
  p: 'label';
  at: P3;
  text: string;
  anchor?: 'start' | 'middle' | 'end';
}

/**
 * The box, its ticks and its names.
 *
 * A primitive rather than renderer furniture because a view sometimes wants
 * two of them (small multiples), sometimes none (a structural graph), and
 * because the axis of a cross-section is a different axis from the axis of the
 * surface it was cut from.
 */
export interface Axes extends Marked {
  p: 'axes';
  /** the extent drawn, in model units */
  x: [number, number];
  y: [number, number];
  z?: [number, number];
  names?: [string, string, string?];
  /** grid lines per side; 0 for a bare box */
  grid?: number;
}

export type Primitive = Points | Polyline | Mesh | Vectors | Region | Label | Axes;

// ── what a picture is allowed to cost ───────────────────────────────
//
// A visualisation that freezes the application has failed at the only thing
// it exists for. These are not performance tuning: they are the contract that
// lets a sampler accept any request and return something drawable.

export const LIMITS = {
  /** points in one scatter */
  points: 4000,
  /** vertices in one polyline */
  runPoints: 4000,
  /** total polylines in a view */
  runs: 600,
  /** grid intervals per side of a mesh; (n+1)² vertices */
  meshN: 96,
  /** arrows in one field */
  arrows: 1200,
  /** primitives in one spec */
  primitives: 400,
} as const;

/** A grid resolution that fits the budget, never above the cap. */
export function resolutionFor(asked: number, cap = LIMITS.meshN): number {
  if (!Number.isFinite(asked) || asked < 2) return 2;
  return Math.min(cap, Math.floor(asked));
}

/**
 * Thin a list to at most `max`, keeping the ends and the shape.
 *
 * Used where a dataset is larger than the picture can hold. It is a stride,
 * not a random sample, because a trajectory thinned at random stops being a
 * trajectory — and the caller is expected to SAY that it was thinned.
 */
export function thin<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const out: T[] = [];
  const stride = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * stride)]);
  return out;
}

/** The extent of a set of points, per axis, or null when there is nothing. */
export function extentOf(pts: readonly P3[]): { x: [number, number]; y: [number, number]; z: [number, number] } | null {
  if (!pts.length) return null;
  const lo = { x: Infinity, y: Infinity, z: Infinity };
  const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
    lo.x = Math.min(lo.x, p.x); hi.x = Math.max(hi.x, p.x);
    lo.y = Math.min(lo.y, p.y); hi.y = Math.max(hi.y, p.y);
    lo.z = Math.min(lo.z, p.z); hi.z = Math.max(hi.z, p.z);
  }
  if (!Number.isFinite(lo.x) || !Number.isFinite(hi.x)) return null;
  const pad = (a: number, b: number): [number, number] =>
    b - a < 1e-9 ? [a - 1, b + 1] : [a, b];
  return { x: pad(lo.x, hi.x), y: pad(lo.y, hi.y), z: pad(lo.z, hi.z) };
}

/** Every point a primitive occupies, for fitting a box around a whole view. */
export function pointsOf(prim: Primitive): P3[] {
  switch (prim.p) {
    case 'points':
      return prim.at;
    case 'polyline':
    case 'region':
      return prim.at;
    case 'vectors':
      return prim.at;
    case 'label':
      return [prim.at];
    case 'mesh': {
      const out: P3[] = [];
      for (const row of prim.rows) for (const v of row) if (v) out.push(v);
      return out;
    }
    case 'axes':
      return [];
  }
}
