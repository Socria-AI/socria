// lib/model/sample.ts
//
// FROM A DEFINITION TO SOMETHING DRAWABLE, and nothing domain-specific in it.
//
// Every one of these takes a function or a dataset and returns primitives in
// model space. A surface is a surface whether it is z = x² − y², an implied
// volatility grid or an elevation raster; a trajectory is a trajectory whether
// the derivative came from Lorenz, an orbit or a portfolio. The samplers are
// where "the same picture for the same shape of thing" is actually enforced.
//
// WHAT EACH ONE OWES THE READER. A sampler must say what it did: an
// integrator returns the method it used and its step, a thinned dataset says
// it was thinned, a clipped field says it was clipped. Those strings end up in
// the object's `state` and in what the conversation is allowed to claim, which
// is why a silent approximation here would be a lie several layers away.
//
// Reuses lib/logos-viz3d for grid sampling and the unit-box frame, because
// that code is already the one the plot renderer trusts.

import { sampleSurface, zRange, type Range, type SurfSample } from '@/lib/logos-viz3d';
import { LIMITS, resolutionFor, thin, type Mesh, type P3, type Points, type Polyline, type Vectors } from './primitives';

export type Scalar2 = (x: number, y: number) => number;
export type Vector2 = (x: number, y: number) => { x: number; y: number };
export type Vector3 = (x: number, y: number, z: number) => { x: number; y: number; z: number };

export interface Sampled<T> {
  value: T;
  /** what was done, in the words the object will carry: "96 × 96 grid" */
  note: string;
}

// ── surfaces ────────────────────────────────────────────────────────

/**
 * z = f(x, y) as a mesh.
 *
 * The grid is capped rather than refused: a request for 400 intervals comes
 * back as the largest the budget allows, and the note says which — a picture
 * that silently ignores the number it was given is a picture nobody can
 * reason about.
 */
export function surfaceMesh(
  of: string,
  f: Scalar2,
  xr: Range,
  yr: Range,
  n = 48,
  opts?: { fill?: boolean; layer?: string; tone?: Mesh['tone'] }
): Sampled<Mesh> & { rows: SurfSample[][]; z: Range | null } {
  const res = resolutionFor(n);
  const rows = sampleSurface(f, xr, yr, res);
  const mesh: Mesh = {
    p: 'mesh',
    of,
    rows: rows.map((row) => row.map((s) => (s.z === null ? null : { x: s.x, y: s.y, z: s.z }))),
    ...(opts?.fill ? { fill: true } : {}),
    ...(opts?.layer ? { layer: opts.layer } : {}),
    ...(opts?.tone ? { tone: opts.tone } : {}),
  };
  return {
    value: mesh,
    rows,
    z: zRange(rows),
    note: `${res} × ${res} grid${res < Math.floor(n) ? ` (asked for ${Math.floor(n)}; capped)` : ''}`,
  };
}

/**
 * A cross-section: the curve where a surface meets a plane of constant x or y.
 *
 * THE SLICE IS COMPUTED FROM THE SAME FUNCTION, not interpolated from the
 * mesh. Reading it off the grid would make the cross-section an artefact of
 * the drawing resolution, and the whole point of "hold y constant" is that the
 * 2D view is exactly as true as the 3D one.
 */
export function crossSection(
  of: string,
  f: Scalar2,
  axis: 'x' | 'y',
  at: number,
  along: Range,
  n = 160,
  opts?: { layer?: string; tone?: Polyline['tone'] }
): Sampled<Polyline[]> {
  const res = Math.min(LIMITS.runPoints, Math.max(2, Math.floor(n)));
  const runs: Polyline[] = [];
  let run: P3[] = [];
  for (let i = 0; i <= res; i++) {
    const t = along.min + ((along.max - along.min) * i) / res;
    const x = axis === 'y' ? t : at;
    const y = axis === 'y' ? at : t;
    let z: number | null = null;
    try {
      const v = f(x, y);
      z = Number.isFinite(v) ? v : null;
    } catch {
      z = null;
    }
    if (z === null) {
      if (run.length > 1) runs.push({ p: 'polyline', of, at: run, ...opts });
      run = [];
      continue;
    }
    run.push({ x, y, z });
  }
  if (run.length > 1) runs.push({ p: 'polyline', of, at: run, ...opts });
  return { value: runs, note: `section at ${axis} = ${at}, ${res} samples of the function itself` };
}

// ── level sets ──────────────────────────────────────────────────────

/**
 * Marching squares: the curve f(x, y) = level, from a sampled grid.
 *
 * WHY THE STANDARD ALGORITHM AND NOT A SEARCH. A contour drawn by walking the
 * grid and joining cells that "look close" wanders and self-crosses; marching
 * squares is exact for the bilinear interpolant, which is the surface the mesh
 * is actually drawing. The saddle case (two opposite corners inside) is
 * resolved by the cell average, the usual choice, and the alternative would be
 * a contour that connects the wrong pair and reads as a topological claim the
 * function does not make.
 *
 * Segments are returned unjoined. A consumer that wants closed loops can join
 * them; nothing in the renderer needs them joined, and joining introduces the
 * one failure mode (a wrong join) this algorithm exists to avoid.
 */
export function contour(
  of: string,
  rows: SurfSample[][],
  level: number,
  opts?: { layer?: string; tone?: Polyline['tone']; z?: 'level' | 'flat' }
): Sampled<Polyline[]> {
  const out: Polyline[] = [];
  const zOf = opts?.z === 'flat' ? 0 : level;
  const lerp = (a: SurfSample, b: SurfSample): P3 => {
    const za = a.z as number;
    const zb = b.z as number;
    const t = Math.abs(zb - za) < 1e-12 ? 0.5 : (level - za) / (zb - za);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: zOf };
  };
  for (let j = 0; j + 1 < rows.length; j++) {
    for (let i = 0; i + 1 < rows[j].length; i++) {
      const c = [rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]];
      if (c.some((s) => s.z === null)) continue;
      const above = c.map((s) => (s.z as number) >= level);
      const code = (above[0] ? 1 : 0) | (above[1] ? 2 : 0) | (above[2] ? 4 : 0) | (above[3] ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const e = [
        () => lerp(c[0], c[1]),
        () => lerp(c[1], c[2]),
        () => lerp(c[2], c[3]),
        () => lerp(c[3], c[0]),
      ];
      const seg = (a: number, b: number) =>
        out.push({ p: 'polyline', of, at: [e[a](), e[b]()], ...opts });
      switch (code) {
        case 1: case 14: seg(3, 0); break;
        case 2: case 13: seg(0, 1); break;
        case 3: case 12: seg(3, 1); break;
        case 4: case 11: seg(1, 2); break;
        case 6: case 9: seg(0, 2); break;
        case 7: case 8: seg(3, 2); break;
        case 5: case 10: {
          // The ambiguous cell. The average decides which way the two corners
          // are connected; the alternative is a coin toss that shows up as a
          // contour joining the wrong pair.
          const mean = (c.reduce((s, v) => s + (v.z as number), 0)) / 4;
          const flip = code === 5 ? mean < level : mean >= level;
          if (flip) { seg(3, 0); seg(1, 2); } else { seg(0, 1); seg(2, 3); }
          break;
        }
      }
      if (out.length >= LIMITS.runs) {
        return { value: out, note: `level ${level}: truncated at ${LIMITS.runs} segments` };
      }
    }
  }
  return { value: out, note: `level ${level}: ${out.length} segments, marching squares` };
}

/** A family of contours at even intervals through the surface's own range. */
export function levelSets(
  of: string,
  rows: SurfSample[][],
  count = 8,
  opts?: { layer?: string; tone?: Polyline['tone']; z?: 'level' | 'flat' }
): Sampled<Polyline[]> {
  const r = zRange(rows);
  if (!r) return { value: [], note: 'nothing finite to contour' };
  const n = Math.max(1, Math.min(24, Math.floor(count)));
  const out: Polyline[] = [];
  for (let k = 1; k <= n; k++) {
    const level = r.min + ((r.max - r.min) * k) / (n + 1);
    out.push(...contour(of, rows, level, opts).value);
    if (out.length >= LIMITS.runs) break;
  }
  return { value: out, note: `${n} levels between ${r.min.toPrecision(3)} and ${r.max.toPrecision(3)}` };
}

// ── fields ──────────────────────────────────────────────────────────

/**
 * A vector field on a grid.
 *
 * THE ARROW LENGTH IS A CHOICE AND IS DECLARED. Real fields span orders of
 * magnitude — a point charge is 10⁴ times stronger near the charge than at the
 * edge — so drawing true lengths gives one enormous arrow and a page of dots.
 * Lengths are clipped at the 90th percentile of magnitude and the sampler says
 * it clipped, so the picture reads as "direction everywhere, magnitude
 * comparable within a range" rather than as a false claim about scale.
 */
export function vectorField(
  of: string,
  F: Vector2 | Vector3,
  box: { x: Range; y: Range; z?: Range },
  n = 9,
  opts?: { layer?: string; tone?: Vectors['tone'] }
): Sampled<Vectors> {
  const nz = box.z ? Math.max(2, Math.floor(n / 2)) : 1;
  const res = Math.max(2, Math.floor(n));
  const at: P3[] = [];
  const dir: P3[] = [];
  const mag: number[] = [];
  const cap = LIMITS.arrows;

  for (let k = 0; k < nz; k++) {
    const z = box.z ? box.z.min + ((box.z.max - box.z.min) * k) / Math.max(1, nz - 1) : 0;
    for (let j = 0; j < res; j++) {
      const y = box.y.min + ((box.y.max - box.y.min) * (j + 0.5)) / res;
      for (let i = 0; i < res; i++) {
        const x = box.x.min + ((box.x.max - box.x.min) * (i + 0.5)) / res;
        let v: { x: number; y: number; z?: number };
        try {
          v = box.z ? (F as Vector3)(x, y, z) : (F as Vector2)(x, y);
        } catch {
          continue;
        }
        const vz = (v as { z?: number }).z ?? 0;
        if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(vz)) continue;
        const m = Math.hypot(v.x, v.y, vz);
        if (m === 0) continue;
        at.push({ x, y, z });
        dir.push({ x: v.x, y: v.y, z: vz });
        mag.push(m);
        if (at.length >= cap) break;
      }
      if (at.length >= cap) break;
    }
    if (at.length >= cap) break;
  }

  if (!at.length) {
    return {
      value: { p: 'vectors', of, at: [], dir: [], scale: 1, ...opts },
      note: 'the field has no finite vectors in this box',
    };
  }

  const sorted = [...mag].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)] || sorted[sorted.length - 1];
  const span = Math.min(box.x.max - box.x.min, box.y.max - box.y.min);
  // An arrow at the 90th percentile spans about one grid cell: long enough to
  // read as a direction, short enough that the field is not a thicket.
  const scale = (span / res) / (p90 || 1);
  const clipped = sorted[sorted.length - 1] > p90 * 1.001;

  return {
    value: { p: 'vectors', of, at, dir, scale, ...(clipped ? { clipped: true } : {}), ...opts },
    note:
      `${at.length} samples` +
      (clipped
        ? '; arrow length clipped at the 90th percentile, so lengths compare within the field and not across its extremes'
        : '; arrow length proportional to magnitude'),
  };
}

// ── trajectories ────────────────────────────────────────────────────

/**
 * Runge–Kutta 4, on a state vector of any size.
 *
 * THE ONE GENERAL INTEGRATOR. Every trajectory in the product — a Lorenz
 * attractor, a double pendulum, a streamline, an orbit — is this function with
 * a different derivative, which is what makes "numerically-computed" a claim
 * the engine can actually keep. RK4 rather than Euler because Euler's error
 * shows up as a spiral where the physics has a closed orbit, and a reader
 * cannot tell that artefact from a result.
 *
 * It returns the method and the step so the object can carry them: a
 * trajectory that does not say how it was integrated is a curve somebody drew.
 */
export function integrate(
  deriv: (t: number, y: readonly number[]) => number[],
  y0: readonly number[],
  opts: {
    dt: number;
    steps: number;
    t0?: number;
    /**
     * When to stop early, because the system left the region the model is
     * about: a ray that crossed a horizon, a body that escaped, a state that
     * left the domain where the equations mean anything.
     *
     * Returning true STOPS. It is not an error condition — a trajectory that
     * ends at a boundary has ended, and integrating past it produces numbers
     * that look like a result and are not one.
     */
    until?: (t: number, y: readonly number[]) => boolean;
  }
): Sampled<{ t: number[]; y: number[][]; stopped?: 'boundary' | 'diverged' }> {
  const dt = opts.dt;
  const steps = Math.max(1, Math.min(200_000, Math.floor(opts.steps)));
  let t = opts.t0 ?? 0;
  let y = [...y0];
  const ts: number[] = [t];
  const ys: number[][] = [[...y]];
  let stopped: 'boundary' | 'diverged' | undefined;
  const add = (a: readonly number[], b: readonly number[], s: number) =>
    a.map((v, i) => v + b[i] * s);

  for (let n = 0; n < steps; n++) {
    const k1 = deriv(t, y);
    const k2 = deriv(t + dt / 2, add(y, k1, dt / 2));
    const k3 = deriv(t + dt / 2, add(y, k2, dt / 2));
    const k4 = deriv(t + dt, add(y, k3, dt));
    const next = y.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    if (next.some((v) => !Number.isFinite(v))) {
      stopped = 'diverged';
      break;
    }
    y = next;
    t += dt;
    ts.push(t);
    ys.push([...y]);
    if (opts.until?.(t, y)) {
      stopped = 'boundary';
      break;
    }
  }
  return {
    value: { t: ts, y: ys, ...(stopped ? { stopped } : {}) },
    note:
      `Runge–Kutta 4, ${ys.length - 1} steps of dt = ${dt}` +
      (stopped === 'boundary'
        ? '; stopped at the boundary this model states'
        : stopped === 'diverged'
          ? '; stopped where the solution stopped being finite'
          : ''),
  };
}

/** A trajectory as a polyline, from three of its state components. */
export function trajectoryLine(
  of: string,
  run: { t: number[]; y: number[][] },
  pick: [number, number, number] | ((y: readonly number[], t: number) => P3),
  opts?: { layer?: string; tone?: Polyline['tone']; width?: number }
): Sampled<Polyline> {
  const take =
    typeof pick === 'function'
      ? pick
      : (y: readonly number[]) => ({ x: y[pick[0]] ?? 0, y: y[pick[1]] ?? 0, z: y[pick[2]] ?? 0 });
  const pts = run.y.map((y, i) => take(y, run.t[i])).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  const kept = thin(pts, LIMITS.runPoints);
  return {
    value: { p: 'polyline', of, at: kept, ...opts },
    note: kept.length < pts.length ? `${pts.length} states, drawn as ${kept.length}` : `${pts.length} states`,
  };
}

/**
 * Streamlines: trajectories of a field, from seeds.
 *
 * The same integrator, because a streamline IS a trajectory — of position
 * under the field rather than of a state under a law. Saying so in one place
 * is the difference between a general engine and two that drift apart.
 */
export function streamlines(
  of: string,
  F: Vector2,
  seeds: readonly { x: number; y: number }[],
  opts: { dt: number; steps: number; layer?: string; tone?: Polyline['tone'] }
): Sampled<Polyline[]> {
  const runs: Polyline[] = [];
  for (const s of seeds.slice(0, 64)) {
    const run = integrate((_, y) => {
      const v = F(y[0], y[1]);
      return [v.x, v.y];
    }, [s.x, s.y], { dt: opts.dt, steps: opts.steps });
    const line = trajectoryLine(of, run.value, (y) => ({ x: y[0], y: y[1], z: 0 }), {
      ...(opts.layer ? { layer: opts.layer } : {}),
      ...(opts.tone ? { tone: opts.tone } : {}),
    });
    if (line.value.at.length > 1) runs.push(line.value);
  }
  return { value: runs, note: `${runs.length} streamlines, Runge–Kutta 4 at dt = ${opts.dt}` };
}

// ── data ────────────────────────────────────────────────────────────

/** Observations as points, thinned with the thinning declared. */
export function scatter(
  of: string,
  pts: readonly P3[],
  opts?: { layer?: string; tone?: Points['tone']; r?: number }
): Sampled<Points> {
  const kept = thin(pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)), LIMITS.points);
  return {
    value: { p: 'points', of, at: kept, ...opts },
    note: kept.length < pts.length
      ? `${pts.length} observations, drawn as ${kept.length} — a stride through the set, not a sample of it`
      : `${pts.length} observations`,
  };
}

/**
 * A surface through a grid of measured values.
 *
 * DATA, NOT A FUNCTION. The z values are the data's own; nothing is smoothed
 * or interpolated beyond the mesh the renderer draws between them, so the
 * shape on screen is the shape of the numbers. A model that wants a fitted
 * surface fits it first and says it fitted it.
 */
export function dataSurface(
  of: string,
  xs: readonly number[],
  ys: readonly number[],
  z: readonly (readonly number[])[],
  opts?: { fill?: boolean; layer?: string; tone?: Mesh['tone'] }
): Sampled<Mesh> & { rows: SurfSample[][] } {
  const rows: SurfSample[][] = [];
  const mrows: (P3 | null)[][] = [];
  for (let j = 0; j < ys.length; j++) {
    const row: SurfSample[] = [];
    const mrow: (P3 | null)[] = [];
    for (let i = 0; i < xs.length; i++) {
      const v = z[j]?.[i];
      const ok = typeof v === 'number' && Number.isFinite(v);
      row.push({ x: xs[i], y: ys[j], z: ok ? v : null });
      mrow.push(ok ? { x: xs[i], y: ys[j], z: v } : null);
    }
    rows.push(row);
    mrows.push(mrow);
  }
  return {
    value: { p: 'mesh', of, rows: mrows, ...(opts?.fill ? { fill: true } : {}), ...(opts?.layer ? { layer: opts.layer } : {}), ...(opts?.tone ? { tone: opts.tone } : {}) },
    rows,
    note: `${xs.length} × ${ys.length} measured values, drawn as given`,
  };
}

/** A parametric curve: r(t) for t over a range. */
export function parametricCurve(
  of: string,
  r: (t: number) => P3,
  tr: Range,
  n = 300,
  opts?: { layer?: string; tone?: Polyline['tone']; closed?: boolean; width?: number }
): Sampled<Polyline> {
  const res = Math.min(LIMITS.runPoints, Math.max(2, Math.floor(n)));
  const at: P3[] = [];
  for (let i = 0; i <= res; i++) {
    const t = tr.min + ((tr.max - tr.min) * i) / res;
    try {
      const p = r(t);
      if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) at.push(p);
    } catch {
      /* a hole in the parameterisation is a hole in the curve */
    }
  }
  return { value: { p: 'polyline', of, at, ...opts }, note: `${at.length} samples of t` };
}

/**
 * A parametric surface: r(u, v).
 *
 * The torus, the sphere, a surface of revolution and a Möbius band are all
 * this function with a different r — which is the test of whether the
 * primitive layer is general or is a list of shapes with names.
 */
export function parametricSurface(
  of: string,
  r: (u: number, v: number) => P3,
  ur: Range,
  vr: Range,
  n = 40,
  opts?: { fill?: boolean; layer?: string; tone?: Mesh['tone'] }
): Sampled<Mesh> {
  const res = resolutionFor(n);
  const rows: (P3 | null)[][] = [];
  for (let j = 0; j <= res; j++) {
    const v = vr.min + ((vr.max - vr.min) * j) / res;
    const row: (P3 | null)[] = [];
    for (let i = 0; i <= res; i++) {
      const u = ur.min + ((ur.max - ur.min) * i) / res;
      try {
        const p = r(u, v);
        row.push(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) ? p : null);
      } catch {
        row.push(null);
      }
    }
    rows.push(row);
  }
  return {
    value: { p: 'mesh', of, rows, ...(opts?.fill ? { fill: true } : {}), ...(opts?.layer ? { layer: opts.layer } : {}), ...(opts?.tone ? { tone: opts.tone } : {}) },
    note: `${res} × ${res} in (u, v)`,
  };
}
