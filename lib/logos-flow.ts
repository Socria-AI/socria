// lib/logos-flow.ts
//
// A vector field, and what it is doing.
//
// WHAT THIS IS FOR. Every other viz kind draws a scalar: one height over one
// domain. A great deal of what people find hard is not a height but a FIELD —
// a direction and a magnitude at every point. A phase portrait, an electric
// field, a gradient, the flow of a fluid. You cannot draw any of them as a
// graph, and describing one in prose is how it stays abstract.
//
// So the object here is a pair of expressions, u(x, y) and v(x, y), and three
// ways of looking at them: arrows on a lattice, streamlines threaded through
// the arrows, and contour lines of a scalar underneath.
//
// NAVIER-STOKES, AND WHY THERE IS NO SOLVER HERE. The showpiece for this kind
// is fluid flow, and the temptation is to write a solver — a grid, a time
// step, a pressure projection. That is a different product, and it would be a
// worse one: a simulation hands over an answer with the reasoning sealed
// inside a numerical method nobody reads, which is the precise opposite of
// what this surface is for.
//
// It is also unnecessary. Navier-Stokes has been solved on paper for a
// handful of flows — Couette, Poiseuille, Stokes' oscillating plate,
// Taylor-Green, Lamb-Oseen — and every one of those solutions is a closed
// form that the existing expression grammar can already write. So the picture
// is exact rather than approximated, and it costs no numerics at all.
//
// What DOES need numerics is showing the equation working, and that is
// `momentumTerms` below: each term of Navier-Stokes evaluated by finite
// difference on the compiled expressions. No symbolic differentiation, no
// solver, and it is accurate enough that the suite can hold every shipped
// flow to actually BEING a solution — the momentum residual comes out around
// 1e-9. A sign error in a formula is then caught by the physics rather than
// by somebody squinting at the picture.

export interface Pt {
  x: number;
  y: number;
}

export interface FlowBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** A plane evaluator: the two velocity components, and optionally pressure. */
export interface Field2 {
  u: (x: number, y: number) => number;
  v: (x: number, y: number) => number;
  p?: (x: number, y: number) => number;
}

const finite = (n: number): boolean => typeof n === 'number' && Number.isFinite(n);

/* ── streamlines ─────────────────────────────────────────────────────
 *
 * A streamline is the curve everywhere tangent to the field: the path a
 * speck of dust takes if the field holds still. Integrated by RK4, the same
 * method the ODE kind uses, with one difference that matters for the
 * picture: each step is taken along the UNIT direction, so the arc length
 * per step is constant. Stepping by the raw vector instead would crawl
 * through slow regions and leap across fast ones, and the line would appear
 * to change resolution depending on the speed — which is information the
 * arrows already carry, told twice and badly.
 */
export function streamline(
  f: Field2,
  x0: number,
  y0: number,
  box: FlowBox,
  steps = 220
): Pt[] {
  const span = Math.max(box.xMax - box.xMin, box.yMax - box.yMin);
  const h = span / steps;
  // The unit direction, or null at a stagnation point where there is no
  // direction to take. Returning null stops the line rather than stepping
  // into a divide-by-zero, and a streamline that ENDS at a stagnation point
  // is the truth about that point.
  const dir = (x: number, y: number): Pt | null => {
    const a = f.u(x, y);
    const b = f.v(x, y);
    if (!finite(a) || !finite(b)) return null;
    const m = Math.hypot(a, b);
    if (!(m > 1e-9)) return null;
    return { x: a / m, y: b / m };
  };

  const run = (sign: 1 | -1): Pt[] => {
    const out: Pt[] = [];
    let x = x0;
    let y = y0;
    for (let i = 0; i < steps; i++) {
      const k1 = dir(x, y);
      if (!k1) break;
      const k2 = dir(x + ((sign * h) / 2) * k1.x, y + ((sign * h) / 2) * k1.y);
      if (!k2) break;
      const k3 = dir(x + ((sign * h) / 2) * k2.x, y + ((sign * h) / 2) * k2.y);
      if (!k3) break;
      const k4 = dir(x + sign * h * k3.x, y + sign * h * k3.y);
      if (!k4) break;
      x += ((sign * h) / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x);
      y += ((sign * h) / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y);
      if (!finite(x) || !finite(y)) break;
      // Off the board. A margin of one step so a line that grazes the edge
      // is not clipped a pixel early.
      if (x < box.xMin - h || x > box.xMax + h) break;
      if (y < box.yMin - h || y > box.yMax + h) break;
      out.push({ x, y });
    }
    return out;
  };

  const back = run(-1).reverse();
  return [...back, { x: x0, y: y0 }, ...run(1)];
}

/**
 * Where to start the streamlines.
 *
 * A jittered lattice rather than a square one: an exact grid of seeds in a
 * smooth field produces streamlines that sit in visible rows, and the eye
 * reads the rows as structure in the flow when they are structure in the
 * seeding. The offset is a fixed function of the index — no clock, no
 * randomness, so the same field always draws the same picture.
 */
export function seedPoints(box: FlowBox, nx = 7, ny = 5): Pt[] {
  const out: Pt[] = [];
  const w = box.xMax - box.xMin;
  const h = box.yMax - box.yMin;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const off = ((i * 7 + j * 3) % 5) / 5 - 0.5;
      out.push({
        x: box.xMin + (w * (i + 0.5 + off * 0.45)) / nx,
        y: box.yMin + (h * (j + 0.5 - off * 0.45)) / ny,
      });
    }
  }
  return out;
}

/* ── arrows ──────────────────────────────────────────────────────────
 *
 * One arrow per lattice point, each drawn as polylines so the whole field is
 * a single mesh rather than hundreds of objects.
 *
 * Length carries speed, but COMPRESSED: raw proportional length makes a
 * field with any real dynamic range unreadable, because the fast arrows
 * overlap their neighbours into a smear while the slow ones vanish. A square
 * root keeps the ordering — longer still means faster — inside a range that
 * fits the lattice.
 */
export function quiver(f: Field2, box: FlowBox, nx = 17, ny = 12): Pt[][] {
  const lines: Pt[][] = [];
  const dx = (box.xMax - box.xMin) / nx;
  const dy = (box.yMax - box.yMin) / ny;
  const cell = Math.min(dx, dy);

  // One pass to find the fastest arrow, so the scaling is a property of the
  // whole field and not of each arrow separately.
  let vmax = 0;
  const at: { x: number; y: number; a: number; b: number; m: number }[] = [];
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) {
      const x = box.xMin + i * dx;
      const y = box.yMin + j * dy;
      const a = f.u(x, y);
      const b = f.v(x, y);
      if (!finite(a) || !finite(b)) continue;
      const m = Math.hypot(a, b);
      if (!finite(m)) continue;
      if (m > vmax) vmax = m;
      at.push({ x, y, a, b, m });
    }
  }
  if (!(vmax > 0)) return lines;

  for (const q of at) {
    if (!(q.m > 1e-9)) continue;
    const len = cell * 0.92 * Math.sqrt(q.m / vmax);
    if (!(len > 1e-9)) continue;
    const ux = (q.a / q.m) * len;
    const uy = (q.b / q.m) * len;
    const tx = q.x - ux / 2;
    const ty = q.y - uy / 2;
    const hx = q.x + ux / 2;
    const hy = q.y + uy / 2;
    lines.push([{ x: tx, y: ty }, { x: hx, y: hy }]);
    // The head: two barbs swept back from the tip. Drawn in data units, so
    // they lean with the arrow rather than always pointing the same way.
    const bl = len * 0.34;
    const ang = Math.atan2(uy, ux);
    const barb = (t: number): Pt => ({
      x: hx - bl * Math.cos(ang + t),
      y: hy - bl * Math.sin(ang + t),
    });
    lines.push([barb(0.42), { x: hx, y: hy }, barb(-0.42)]);
  }
  return lines;
}

/* ── contours ────────────────────────────────────────────────────────
 *
 * Marching squares. The backdrop is drawn as LINES rather than as a filled
 * heat map for two reasons: the renderer's primitives are strokes, so a
 * heat map would need a new one; and a contour is the more honest picture
 * anyway — it shows where a quantity is equal to itself, which is the thing
 * you want to see about pressure or vorticity, and it does not need a colour
 * key to be read.
 */
export function contour(
  g: (x: number, y: number) => number,
  box: FlowBox,
  level: number,
  nx = 48,
  ny = 34
): Pt[][] {
  const segs: Pt[][] = [];
  const dx = (box.xMax - box.xMin) / nx;
  const dy = (box.yMax - box.yMin) / ny;

  // Sample once into a grid; every cell reads four neighbours out of it, so
  // sampling per cell would evaluate the expression four times over.
  const z: number[][] = [];
  for (let i = 0; i <= nx; i++) {
    z[i] = [];
    for (let j = 0; j <= ny; j++) {
      const v = g(box.xMin + i * dx, box.yMin + j * dy);
      z[i][j] = finite(v) ? v : NaN;
    }
  }

  // Where along an edge the level sits, by linear interpolation.
  const cross = (pa: Pt, va: number, pb: Pt, vb: number): Pt => {
    const d = vb - va;
    const t = Math.abs(d) < 1e-12 ? 0.5 : (level - va) / d;
    const k = Math.min(1, Math.max(0, t));
    return { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k };
  };

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const x0 = box.xMin + i * dx;
      const y0 = box.yMin + j * dy;
      const x1 = x0 + dx;
      const y1 = y0 + dy;
      const c: { p: Pt; v: number }[] = [
        { p: { x: x0, y: y0 }, v: z[i][j] },
        { p: { x: x1, y: y0 }, v: z[i + 1][j] },
        { p: { x: x1, y: y1 }, v: z[i + 1][j + 1] },
        { p: { x: x0, y: y1 }, v: z[i][j + 1] },
      ];
      // A cell touching a hole in the domain is skipped whole. Interpolating
      // against NaN would place a vertex at an arbitrary point and draw a
      // contour through a region where the quantity does not exist.
      if (c.some((q) => !finite(q.v))) continue;

      // The level crosses an edge when its two ends straddle it. Collecting
      // the crossings and joining them in pairs handles every case including
      // the ambiguous saddle, which simply gets both of its segments.
      const hits: Pt[] = [];
      for (let k = 0; k < 4; k++) {
        const a = c[k];
        const b = c[(k + 1) % 4];
        if (a.v === level) hits.push(a.p);
        else if ((a.v < level) !== (b.v < level)) hits.push(cross(a.p, a.v, b.p, b.v));
      }
      for (let k = 0; k + 1 < hits.length; k += 2) segs.push([hits[k], hits[k + 1]]);
    }
  }
  return segs;
}

/**
 * A set of evenly spaced contour levels, and the lines for all of them.
 *
 * The levels are chosen from the field's own range so the picture works
 * whatever the quantity is: a pressure in pascals and a vorticity in inverse
 * seconds both get the same number of lines across whatever range they
 * happen to occupy. A field that is flat to within rounding gets none, which
 * is correct — there is nothing to show.
 */
export function contourSet(
  g: (x: number, y: number) => number,
  box: FlowBox,
  levels = 9
): Pt[][] {
  let lo = Infinity;
  let hi = -Infinity;
  const NX = 36;
  const NY = 26;
  for (let i = 0; i <= NX; i++) {
    for (let j = 0; j <= NY; j++) {
      const v = g(
        box.xMin + ((box.xMax - box.xMin) * i) / NX,
        box.yMin + ((box.yMax - box.yMin) * j) / NY
      );
      if (!finite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!finite(lo) || !finite(hi)) return [];
  const span = hi - lo;
  if (!(span > 1e-9)) return [];
  const out: Pt[][] = [];
  for (let k = 1; k <= levels; k++) {
    for (const s of contour(g, box, lo + (span * k) / (levels + 1))) out.push(s);
  }
  return out;
}

/* ── the equation, term by term ──────────────────────────────────────── */

export interface MomentumTerms {
  /** ∂u/∂t — the flow speeding up where you are standing */
  unsteady: number;
  /** (u·∇)u — the parcel being carried somewhere the flow is different */
  advection: number;
  /** −(1/ρ)∂p/∂x — the push from high pressure toward low; null with no p */
  pressure: number | null;
  /** ν∇²u — momentum leaking sideways into slower neighbours */
  viscous: number;
  /** what is left over. Zero means this really is a solution. */
  residual: number | null;
  /** ∇·u — zero means nothing is being created or destroyed */
  divergence: number;
}

/**
 * Every term of the x-momentum equation at one point, by finite difference.
 *
 *   ∂u/∂t + (u·∇)u = −(1/ρ)∇p + ν∇²u
 *
 * Central differences throughout, which are second-order accurate and cost
 * two evaluations per derivative. The step is 1e-4: large enough that the
 * subtraction does not lose its significant digits to floating point, small
 * enough that the truncation error stays far below anything visible. Both
 * failure modes are real and they pull in opposite directions, so this is not
 * a number to nudge without re-running the residual test.
 *
 * `time` is passed as a function of t rather than read from a closure so the
 * unsteady term can be taken at all: the field at one instant cannot tell you
 * how it is changing. Fields with no time dependence pass the same evaluator
 * and get ∂u/∂t = 0, correctly.
 */
export function momentumTerms(
  at: (t: number) => Field2,
  nu: number,
  x: number,
  y: number,
  t = 0,
  h = 1e-4
): MomentumTerms {
  const f = at(t);
  const d = (g: (x: number, y: number) => number, ax: number, ay: number) => ({
    dx: (g(ax + h, ay) - g(ax - h, ay)) / (2 * h),
    dy: (g(ax, ay + h) - g(ax, ay - h)) / (2 * h),
    lap:
      (g(ax + h, ay) - 2 * g(ax, ay) + g(ax - h, ay)) / (h * h) +
      (g(ax, ay + h) - 2 * g(ax, ay) + g(ax, ay - h)) / (h * h),
  });

  const U = d(f.u, x, y);
  const V = d(f.v, x, y);
  const u0 = f.u(x, y);
  const v0 = f.v(x, y);

  const unsteady = (at(t + h).u(x, y) - at(t - h).u(x, y)) / (2 * h);
  const advection = u0 * U.dx + v0 * U.dy;
  const viscous = nu * U.lap;
  const pressure = f.p ? -(f.p(x + h, y) - f.p(x - h, y)) / (2 * h) : null;
  const divergence = U.dx + V.dy;

  return {
    unsteady,
    advection,
    pressure,
    viscous,
    residual: pressure === null ? null : unsteady + advection - pressure - viscous,
    divergence,
  };
}

/* ── the flows that have been solved ─────────────────────────────────
 *
 * Every one of these is an exact solution of the incompressible
 * Navier-Stokes equations, written in the evaluator's own grammar. They are
 * exported rather than inlined into the prompt so the suite can compile each
 * one and check that it really does satisfy the equation — which is a test of
 * the physics, not of the rendering, and the only kind that catches a
 * transposed sign in a formula.
 *
 * Density is 1 throughout, which is the usual convention and folds ρ into the
 * pressure. Parameter names are at most two characters because that is what
 * the slider extractor accepts.
 */
export interface FlowSolution {
  id: string;
  title: string;
  /** the x-component of velocity */
  u: string;
  /** the y-component */
  v: string;
  /** pressure, where the flow has one; density is folded into it */
  p?: string;
  /**
   * The values the CHECK runs at, which are not always the values that draw
   * the best picture. Stokes' plate is only a solution when k = sqrt(ω/2ν),
   * so the three cannot be chosen independently — the suite pins them to a
   * consistent set and the scene is free to look nicer.
   */
  at: Record<string, number>;
  /** the viscosity the momentum balance holds at */
  checkNu?: number;
  /**
   * Whether this satisfies the MOMENTUM equation exactly.
   *
   * False does not mean wrong. The Lamb-Oseen core below is regularised so it
   * has no singularity to draw, which costs exactness and keeps the shape —
   * a legitimate trade for a picture, and a lie if it were not said out loud.
   * Everything here is divergence-free either way, and the suite checks that
   * separately, because an incompressible flow that creates fluid is not a
   * picture of anything.
   */
  exact: boolean;
  /** what the picture is FOR — one sentence, and no result in it */
  note: string;
}

export const FLOW_SOLUTIONS: FlowSolution[] = [
  {
    id: 'taylor-green',
    title: 'The Taylor\u2013Green vortex',
    u: 'cos(x)*sin(y)*exp(-2*nu*t)',
    v: '-sin(x)*cos(y)*exp(-2*nu*t)',
    p: '-(cos(2*x)+cos(2*y))/4*exp(-4*nu*t)',
    at: { nu: 0.07, t: 0.6 },
    checkNu: 0.07,
    exact: true,
    note: 'A lattice of counter-rotating vortices dying away. Hold the clock still and move \u03bd instead: the whole decay is that one number.',
  },
  {
    id: 'couette',
    title: 'Couette flow',
    u: 'w*(y+1)/2',
    v: '0',
    p: '0',
    at: { w: 1 },
    checkNu: 0.4,
    exact: true,
    note: 'One wall dragged past another. The straight profile is viscosity alone, with nothing else acting on the fluid.',
  },
  {
    id: 'poiseuille',
    title: 'Poiseuille flow',
    u: 'g*(1-y^2)/(2*nu)',
    v: '0',
    p: '-g*x',
    at: { g: 0.5, nu: 0.5 },
    checkNu: 0.5,
    exact: true,
    note: 'A channel driven by a pressure difference. The parabola is the pressure gradient and viscosity in balance at every height.',
  },
  {
    id: 'stokes-second',
    title: 'Stokes\u2019 oscillating plate',
    u: 'exp(-k*y)*cos(w*t-k*y)',
    v: '0',
    p: '0',
    // k = sqrt(w / 2nu). With w = 2 and nu = 1 that is exactly 1.
    at: { k: 1, w: 2, t: 0.4 },
    checkNu: 1,
    exact: true,
    note: 'A wall shaken back and forth. Run the clock and watch how little of the motion reaches up into the fluid.',
  },
  {
    id: 'lamb-oseen',
    title: 'The Lamb\u2013Oseen vortex',
    u: '-y/(x^2+y^2+0.04)*(1-exp(-(x^2+y^2)/(4*nu*t+0.2)))',
    v: 'x/(x^2+y^2+0.04)*(1-exp(-(x^2+y^2)/(4*nu*t+0.2)))',
    at: { nu: 0.05, t: 1 },
    exact: false,
    note: 'A single vortex spreading outward. The core grows with time, which is viscosity carrying rotation into fluid that was still.',
  },
];
