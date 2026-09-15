// lib/logos-viz3d.ts
//
// Three dimensions, drawn with the two-dimensional renderer.
//
// Nothing here renders anything. It projects: a point in space becomes a point
// on the page, and everything the surface builder needs — the mesh, the box,
// the slice, the sorting order — is expressed as lists of those. The existing
// renderer then draws them exactly as it draws a curve, which is the whole
// reason this is a file of arithmetic rather than a second renderer.
//
// WHY NOT A 3D LIBRARY. Socria's plots are ink on paper: thin lines, a lot of
// white, nothing shaded or glossy. A WebGL surface would look like a different
// product, cost a dependency larger than the app, and give up every feature
// the 2D pipeline already provides — the sliders, the sweep animation, the
// Answer Guard, the readouts, the export. An orthographic projection is forty
// lines of trigonometry and keeps all of it.
//
// WHY ORTHOGRAPHIC AND NOT PERSPECTIVE. A perspective camera makes equal
// quantities look unequal — the far end of an axis is shorter than the near
// end — which is precisely the reading a mathematical picture must not
// distort. Orthographic keeps parallel lines parallel and equal steps equal,
// which is why almost every textbook surface is drawn this way.

export interface Pt3 {
  x: number;
  y: number;
  z: number;
}

export interface Pt2 {
  x: number;
  y: number;
}

/** Where the camera is: two angles, in radians. */
export interface Camera {
  /** rotation about the vertical axis — spin the model on its turntable */
  yaw: number;
  /** how far above the horizontal the camera sits — 0 is edge-on */
  pitch: number;
}

/**
 * A point in space, on the page — plus how far away it is.
 *
 * `depth` is what makes the painter's algorithm possible: draw larger depths
 * first and the near part of the surface covers the far part. It is not used
 * for scaling, because this is an orthographic camera and distance does not
 * change size.
 */
export function project3(p: Pt3, cam: Camera): Pt2 & { depth: number } {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  // Spin about the z axis first: this is the turntable.
  const rx = p.x * cy - p.y * sy;
  const ry = p.x * sy + p.y * cy;

  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  return {
    x: rx,
    // Tilt: the y axis lies down as the camera rises, and z stands up.
    y: p.z * cp - ry * sp,
    depth: ry * cp + p.z * sp,
  };
}

/** Map a value from its own range onto [-1, 1]; a flat range maps to 0. */
export function norm(v: number, lo: number, hi: number): number {
  if (!(hi > lo)) return 0;
  return ((v - lo) / (hi - lo)) * 2 - 1;
}

export interface Range {
  min: number;
  max: number;
}

/**
 * The unit cube a scene is normalised into.
 *
 * Every axis is squeezed to [-1, 1] before projection, so a surface over
 * x ∈ [0, 100] and z ∈ [0, 0.4] is legible instead of being a horizontal
 * smear. That is a deliberate distortion and the axis labels carry the real
 * numbers, exactly as a contour map does.
 */
export interface Frame3 {
  x: Range;
  y: Range;
  z: Range;
}

export function toUnit(p: Pt3, f: Frame3): Pt3 {
  return {
    x: norm(p.x, f.x.min, f.x.max),
    y: norm(p.y, f.y.min, f.y.max),
    z: norm(p.z, f.z.min, f.z.max),
  };
}

/** Project a point given in the scene's own units. */
export function place(p: Pt3, f: Frame3, cam: Camera): Pt2 & { depth: number } {
  return project3(toUnit(p, f), cam);
}

/**
 * The twelve edges of the bounding box, as polylines.
 *
 * Drawn because a surface floating in white space has no scale and no
 * orientation: the box is what tells you which way is up and how far the
 * domain runs. Returned as three separate polylines rather than twelve
 * segments so the renderer draws the whole cage as one path.
 */
export function boxLines(f: Frame3, cam: Camera): Pt2[][] {
  const c = (x: number, y: number, z: number) => project3({ x, y, z }, cam);
  const bottom = [c(-1, -1, -1), c(1, -1, -1), c(1, 1, -1), c(-1, 1, -1), c(-1, -1, -1)];
  const top = [c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1), c(-1, -1, 1)];
  const posts: Pt2[][] = [
    [c(-1, -1, -1), c(-1, -1, 1)],
    [c(1, -1, -1), c(1, -1, 1)],
    [c(1, 1, -1), c(1, 1, 1)],
    [c(-1, 1, -1), c(-1, 1, 1)],
  ];
  return [bottom, top, ...posts];
}

/** One sampled point of a surface, in scene units. Null z is a gap. */
export interface SurfSample {
  x: number;
  y: number;
  z: number | null;
}

/**
 * Sample z = f(x, y) on a grid.
 *
 * `n` is the number of INTERVALS per side, so the grid has (n+1)² points. A
 * non-finite value becomes null rather than being dropped, because the hole
 * has to stay in place — a surface with a pole in it should show the pole,
 * not quietly close over it.
 */
export function sampleSurface(
  f: (x: number, y: number) => number,
  xr: Range,
  yr: Range,
  n: number
): SurfSample[][] {
  const rows: SurfSample[][] = [];
  for (let j = 0; j <= n; j++) {
    const y = yr.min + ((yr.max - yr.min) * j) / n;
    const row: SurfSample[] = [];
    for (let i = 0; i <= n; i++) {
      const x = xr.min + ((xr.max - xr.min) * i) / n;
      let z: number | null = null;
      try {
        const v = f(x, y);
        z = Number.isFinite(v) ? v : null;
      } catch {
        z = null;
      }
      row.push({ x, y, z });
    }
    rows.push(row);
  }
  return rows;
}

/** The finite z range of a sampled grid, or null when nothing was finite. */
export function zRange(rows: SurfSample[][]): Range | null {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    for (const s of row) {
      if (s.z === null) continue;
      if (s.z < min) min = s.z;
      if (s.z > max) max = s.z;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  // A constant surface is a plane, and a plane still needs a box with height
  // or it collapses to a line and reads as a rendering failure.
  if (max - min < 1e-9) return { min: min - 1, max: max + 1 };
  return { min, max };
}

/**
 * The wireframe, as polylines in page space.
 *
 * Both families of lines — one along x, one along y — because a surface drawn
 * with only one reads as a set of unrelated curves rather than a sheet.
 *
 * A run BREAKS at a null sample instead of jumping the gap. This is the same
 * rule the 2D curve follows at a pole, and for the same reason: a line drawn
 * across a hole is a line the function does not contain.
 */
export function surfaceLines(
  rows: SurfSample[][],
  f: Frame3,
  cam: Camera
): Pt2[][] {
  const lines: Pt2[][] = [];
  const n = rows.length;
  const push = (run: Pt2[]) => {
    if (run.length > 1) lines.push(run);
  };

  for (let j = 0; j < n; j++) {
    let run: Pt2[] = [];
    for (let i = 0; i < rows[j].length; i++) {
      const s = rows[j][i];
      if (s.z === null) {
        push(run);
        run = [];
        continue;
      }
      run.push(place({ x: s.x, y: s.y, z: s.z }, f, cam));
    }
    push(run);
  }
  for (let i = 0; i < rows[0].length; i++) {
    let run: Pt2[] = [];
    for (let j = 0; j < n; j++) {
      const s = rows[j][i];
      if (s.z === null) {
        push(run);
        run = [];
        continue;
      }
      run.push(place({ x: s.x, y: s.y, z: s.z }, f, cam));
    }
    push(run);
  }
  return lines;
}

/**
 * The cross-section at one value of y: the 2D graph hiding inside the 3D one.
 *
 * This is the answer to "what IS a partial derivative" and to half of what
 * people find hard about multivariable calculus — hold y still and you are
 * back to a curve you already understand. Returned in page space, and broken
 * at gaps like everything else.
 */
export function sliceLines(
  f3: (x: number, y: number) => number,
  atY: number,
  xr: Range,
  frame: Frame3,
  cam: Camera,
  n = 96
): Pt2[][] {
  const lines: Pt2[][] = [];
  let run: Pt2[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xr.min + ((xr.max - xr.min) * i) / n;
    let z: number | null = null;
    try {
      const v = f3(x, atY);
      z = Number.isFinite(v) ? v : null;
    } catch {
      z = null;
    }
    if (z === null) {
      if (run.length > 1) lines.push(run);
      run = [];
      continue;
    }
    run.push(place({ x, y: atY, z }, frame, cam));
  }
  if (run.length > 1) lines.push(run);
  return lines;
}

/**
 * The plane the slice is cut on, as a quadrilateral in page space.
 *
 * Drawn faintly behind the cross-section so the slice reads as a cut through
 * the solid rather than as a second curve that happens to be a different
 * colour.
 */
export function slicePlane(atY: number, frame: Frame3, cam: Camera): Pt2[] {
  const y = norm(atY, frame.y.min, frame.y.max);
  return [
    project3({ x: -1, y, z: -1 }, cam),
    project3({ x: 1, y, z: -1 }, cam),
    project3({ x: 1, y, z: 1 }, cam),
    project3({ x: -1, y, z: 1 }, cam),
  ];
}

/** Painter's order: far things first, so near things are drawn over them. */
export function byDepth<T extends { depth: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.depth - a.depth);
}
