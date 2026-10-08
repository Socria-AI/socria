// lib/model/phase.ts
//
// THE PHASE PORTRAIT, COMPUTED — a system's states against each other rather
// than against time, which is where its shape lives: where it settles, circles
// or runs away.
//
// WHAT IS IN IT, AND WHERE EACH PART COMES FROM.
//
//   the path       the run the model's other views draw (system.ts runFor), from
//                  the model's own starting state — one computation behind all
//   the field      the right-hand sides evaluated on a grid: the direction the
//                  state moves at each point of the plane
//   nullclines     where one rate is zero, traced by marching squares on the
//                  same right-hand sides
//   fixed points   where both rates are zero, found by Newton from a grid of
//                  starts (lib/numeric/dynamics.ts), each classified by the
//                  eigenvalues of its Jacobian — a stable spiral, a saddle …
//   other paths    integrated from other starting states with an adaptive
//                  Dormand–Prince method, to show the flow rather than one orbit
//
// ONLY WHEN THE PLANE IS THE WHOLE STATE. The field, the nullclines and the
// fixed points are properties of the plane only for a two-state system whose
// rates do not depend on time. For anything else the portrait is the path
// projected onto two of its states — and says that it is a projection, where a
// path can cross itself without the system doing so.
//
// NO DOMAIN APPEARS BELOW. PURE.

import { compileExpr } from '@/lib/logos-math';
import { integrate } from '@/lib/numeric/ode';
import { fixedPoints, lyapunovFlow, type FixedPoint } from '@/lib/numeric/dynamics';
import { scopeOf } from './compile';
import { readSystem, runFor } from './system';
import type { P3, Primitive } from './primitives';
import type { Model, ModelObject } from './schema';

export interface PortraitPoint {
  x: number;
  y: number;
  type: string;
  stable: boolean | null;
  /** the eigenvalues, written out */
  eig: string;
}

export interface Portrait {
  names: [string, string];
  /** the plane is the whole state of an autonomous system (true), or a projection (false) */
  whole: boolean;
  box: { x: [number, number]; y: [number, number] };
  primitives: Primitive[];
  fixed: PortraitPoint[];
  note: string;
}

const GRID = 17;
const NULL_N = 64;
const SEEDS = 3;

const fmt = (v: number) => {
  const r = Number(v.toPrecision(3));
  return Object.is(r, -0) ? '0' : String(r).replace(/^-/, '−');
};
const eigSaid = (fp: FixedPoint) =>
  fp.eigenvalues.map((z) => (Math.abs(z.im) > 1e-9 * Math.max(1, Math.abs(z.re)) ? `${fmt(z.re)} ${z.im < 0 ? '−' : '+'} ${fmt(Math.abs(z.im))}i` : fmt(z.re))).join(', ');

/** "a + b·t" mentions t; "rate" does not. */
const usesTime = (exprs: readonly string[]) => exprs.some((e) => /(^|[^A-Za-z0-9_])t([^A-Za-z0-9_(]|$)/.test(e));

/**
 * Do the rates change with time AT THE VALUES THEY HAVE NOW? Decided by
 * evaluating them, not by reading them: a drive written as f₀·sin(ωt) with
 * f₀ = 0 leaves a system that does not depend on time, and one that mentions t
 * and moves with it does. The rates are evaluated at states along the run and
 * at several times; any difference beyond rounding is a clock.
 */
function clocked(model: Model, names: string[], rhs: Record<string, string>, states: readonly (readonly number[])[]): boolean {
  if (!usesTime(names.map((n) => rhs[n]))) return false;
  const scope = scopeOf(model);
  const known = [...Object.keys(scope), ...names, 't'];
  const fs = names.map((n) => compileExpr(rhs[n], known));
  if (fs.some((f) => !f)) return true;
  const sample = states.filter((_, i) => i % Math.max(1, Math.floor(states.length / 6)) === 0).slice(0, 7);
  for (const y of sample) {
    let first: number[] | null = null;
    for (const t of [0, 0.37, 1.9, 5.3, 11.7]) {
      const sc: Record<string, number> = { ...scope, t };
      names.forEach((n, i) => {
        sc[n] = y[i];
        sc[n.toLowerCase()] = y[i];
      });
      const v = fs.map((f) => f!.eval(sc));
      if (!first) first = v;
      else if (v.some((x, i) => Math.abs(x - first![i]) > 1e-12 * Math.max(1, Math.abs(first![i])))) return true;
    }
  }
  return false;
}

function padded(lo: number, hi: number, frac = 0.15): [number, number] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [-1, 1];
  const span = hi - lo || Math.max(1, Math.abs(hi)) * 0.5;
  return [lo - span * frac, hi + span * frac];
}

/**
 * Where F is zero over the box, as polylines: marching squares on an n × n grid,
 * with the crossings placed by linear interpolation and the segments chained.
 */
export function zeroSet(F: (x: number, y: number) => number, box: { x: [number, number]; y: [number, number] }, n = NULL_N): { x: number; y: number }[][] {
  const [x0, x1] = box.x;
  const [y0, y1] = box.y;
  const X = (i: number) => x0 + ((x1 - x0) * i) / n;
  const Y = (j: number) => y0 + ((y1 - y0) * j) / n;
  const v: number[][] = [];
  for (let j = 0; j <= n; j++) {
    v.push([]);
    for (let i = 0; i <= n; i++) {
      const f = F(X(i), Y(j));
      v[j].push(Number.isFinite(f) ? f : NaN);
    }
  }
  const segs: [string, string][] = [];
  const pts = new Map<string, { x: number; y: number }>();
  // an edge's crossing, keyed by the edge so neighbouring cells share it
  const cross = (i0: number, j0: number, i1: number, j1: number): string | null => {
    const a = v[j0][i0];
    const b = v[j1][i1];
    if (!Number.isFinite(a) || !Number.isFinite(b) || (a > 0) === (b > 0) || a === b) return null;
    const key = i0 === i1 ? `v${i0},${Math.min(j0, j1)}` : `h${Math.min(i0, i1)},${j0}`;
    if (!pts.has(key)) {
      const s = a / (a - b);
      pts.set(key, { x: X(i0) + (X(i1) - X(i0)) * s, y: Y(j0) + (Y(j1) - Y(j0)) * s });
    }
    return key;
  };
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const e = [cross(i, j, i + 1, j), cross(i + 1, j, i + 1, j + 1), cross(i, j + 1, i + 1, j + 1), cross(i, j, i, j + 1)].filter((k): k is string => k !== null);
      if (e.length === 2) segs.push([e[0], e[1]]);
      else if (e.length === 4) {
        // a saddle cell: pair by the centre's sign
        const c = (v[j][i] + v[j][i + 1] + v[j + 1][i] + v[j + 1][i + 1]) / 4;
        if ((c > 0) === (v[j][i] > 0)) segs.push([e[0], e[1]], [e[2], e[3]]);
        else segs.push([e[0], e[3]], [e[1], e[2]]);
      }
    }
  // chain the segments into runs
  const by = new Map<string, number[]>();
  segs.forEach(([a, b], k) => {
    by.set(a, [...(by.get(a) ?? []), k]);
    by.set(b, [...(by.get(b) ?? []), k]);
  });
  const used = new Set<number>();
  const out: { x: number; y: number }[][] = [];
  for (let k = 0; k < segs.length; k++) {
    if (used.has(k)) continue;
    used.add(k);
    const chain = [segs[k][0], segs[k][1]];
    for (const end of [1, 0]) {
      for (;;) {
        const tip = end ? chain[chain.length - 1] : chain[0];
        const next = (by.get(tip) ?? []).find((s) => !used.has(s));
        if (next === undefined) break;
        used.add(next);
        const other = segs[next][0] === tip ? segs[next][1] : segs[next][0];
        if (end) chain.push(other);
        else chain.unshift(other);
      }
    }
    out.push(chain.map((key) => pts.get(key)!));
  }
  return out.filter((c) => c.length >= 2);
}

/**
 * The phase portrait of a system, or null when it has fewer than two states or
 * does not run. Everything in it is computed; nothing is sketched.
 */
export function portraitOf(model: Model, o: ModelObject): Portrait | null {
  const read = readSystem(model, o);
  if (!read.ok) return null;
  const decl = read.decl;
  const names = decl.states.map((v) => v.name);
  if (names.length < 2) return null;
  const got = runFor(model, o);
  if (!got.ok) return null;
  const run = got.run;
  const [a, b] = [names[0], names[1]];
  const path = run.y.map((r) => ({ x: r[0], y: r[1] })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (path.length < 2) return null;
  const whole = names.length === 2 && !clocked(model, names, decl.rhs, run.y);
  const P = (x: number, y: number): P3 => ({ x, y, z: 0 });
  const prims: Primitive[] = [];
  const of = o.id;

  let box = {
    x: padded(Math.min(...path.map((p) => p.x)), Math.max(...path.map((p) => p.x))),
    y: padded(Math.min(...path.map((p) => p.y)), Math.max(...path.map((p) => p.y))),
  };

  if (!whole) {
    prims.push({ p: 'polyline', of, at: path.map((p) => P(p.x, p.y)), width: 2, tone: 'primary' });
    prims.push({ p: 'points', of, at: [P(path[0].x, path[0].y)], r: 3.5, tone: 'accent' });
    const why = names.length > 2 ? `the ${names.length}-state run seen in the plane of ${a} and ${b} — a projection, where the path may cross itself without the system doing so` : `${a} against ${b} for the run — its rates depend on time, so the plane does not fix the direction of motion and no field is drawn`;
    return { names: [a, b], whole: false, box, primitives: prims, fixed: [], note: `${why}; ${run.note}` };
  }

  // ── the plane is the whole state: the field, the nullclines, the fixed points ──
  const scope = scopeOf(model);
  const known = [...Object.keys(scope), ...names, 't'];
  const fa = compileExpr(decl.rhs[a], known);
  const fb = compileExpr(decl.rhs[b], known);
  if (!fa || !fb) return null;
  const at = (x: number, y: number) => {
    const sc: Record<string, number> = { ...scope, t: 0 };
    sc[a] = x;
    sc[a.toLowerCase()] = x;
    sc[b] = y;
    sc[b.toLowerCase()] = y;
    return sc;
  };
  const F = (x: number, y: number): [number, number] => {
    const sc = at(x, y);
    return [fa.eval(sc), fb.eval(sc)];
  };

  // fixed points over a box a little wider than the path, so one it circles is found
  const wide = { x: padded(box.x[0], box.x[1], 0.5), y: padded(box.y[0], box.y[1], 0.5) };
  const found = fixedPoints({ dim: 2, f: (y) => F(y[0], y[1]) }, [wide.x, wide.y], { maxStarts: 64 }).filter(
    (fp) => fp.residual < 1e-8 * Math.max(1, Math.hypot(...fp.x)) && fp.x.every(Number.isFinite)
  );
  for (const fp of found) {
    box = { x: [Math.min(box.x[0], fp.x[0] - 0.05 * (box.x[1] - box.x[0])), Math.max(box.x[1], fp.x[0] + 0.05 * (box.x[1] - box.x[0]))], y: [Math.min(box.y[0], fp.x[1] - 0.05 * (box.y[1] - box.y[0])), Math.max(box.y[1], fp.x[1] + 0.05 * (box.y[1] - box.y[0]))] };
  }
  const W = box.x[1] - box.x[0];
  const H = box.y[1] - box.y[0];

  // the field: arrows on a grid, the longest a cell long; lengths above the 90th percentile clipped, and said
  const at3: P3[] = [];
  const dir: P3[] = [];
  for (let j = 0; j < GRID; j++)
    for (let i = 0; i < GRID; i++) {
      const x = box.x[0] + ((i + 0.5) * W) / GRID;
      const y = box.y[0] + ((j + 0.5) * H) / GRID;
      const [u, w] = F(x, y);
      if (!Number.isFinite(u) || !Number.isFinite(w)) continue;
      at3.push(P(x, y));
      // in the box's own proportions, so the arrows point where the path goes on screen
      dir.push(P(u, w));
    }
  const mags = dir.map((d) => Math.hypot(d.x / W, d.y / H)).sort((p, q) => p - q);
  const cap = mags[Math.floor(0.9 * (mags.length - 1))] || mags[mags.length - 1] || 1;
  let clipped = false;
  const shown = dir.map((d) => {
    const m = Math.hypot(d.x / W, d.y / H);
    if (m > cap) {
      clipped = true;
      return P((d.x * cap) / m, (d.y * cap) / m);
    }
    return d;
  });
  if (at3.length) prims.push({ p: 'vectors', of, at: at3, dir: shown, scale: 0.9 / GRID / cap, clipped, tone: 'muted', layer: 'field' });

  // the nullclines: where each rate is zero
  const nullA = zeroSet((x, y) => F(x, y)[0], box);
  const nullB = zeroSet((x, y) => F(x, y)[1], box);
  for (const c of nullA.slice(0, 24)) prims.push({ p: 'polyline', of, at: c.map((q) => P(q.x, q.y)), dashed: true, tone: 'u1', layer: 'nullclines' });
  for (const c of nullB.slice(0, 24)) prims.push({ p: 'polyline', of, at: c.map((q) => P(q.x, q.y)), dashed: true, tone: 'u2', layer: 'nullclines' });

  // other paths, from a grid of starting states, for as long as the run itself
  const T = run.t[run.t.length - 1] - run.t[0] || 10;
  const far = { x: padded(box.x[0], box.x[1], 2), y: padded(box.y[0], box.y[1], 2) };
  let others = 0;
  for (let j = 0; j < SEEDS; j++)
    for (let i = 0; i < SEEDS; i++) {
      const y0 = [box.x[0] + ((i + 0.5) * W) / SEEDS, box.y[0] + ((j + 0.5) * H) / SEEDS];
      if (Math.hypot((y0[0] - path[0].x) / W, (y0[1] - path[0].y) / H) < 0.12) continue;
      try {
        const r = integrate((_t, y) => F(y[0], y[1]), 0, y0, T, {
          rtol: 1e-6,
          atol: 1e-9 * Math.max(W, H),
          maxSteps: 4000,
          tEval: Array.from({ length: 241 }, (_, k) => (T * k) / 240),
          events: [{ g: (_t, y) => Math.min(y[0] - far.x[0], far.x[1] - y[0], y[1] - far.y[0], far.y[1] - y[1]), direction: -1, terminal: true }],
        });
        const pts = r.y.filter((q) => q.every(Number.isFinite)).map((q) => P(q[0], q[1]));
        if (pts.length >= 2) {
          prims.push({ p: 'polyline', of, at: pts, tone: 'ghost', layer: 'flow' });
          others++;
        }
      } catch {
        // a path the integrator could not follow is left out; the count below says how many were drawn
      }
    }

  // the model's own path, over everything else
  prims.push({ p: 'polyline', of, at: path.map((p) => P(p.x, p.y)), width: 2, tone: 'primary' });
  prims.push({ p: 'points', of, at: [P(path[0].x, path[0].y)], r: 3.5, tone: 'accent' });

  const fixed: PortraitPoint[] = found.map((fp) => ({ x: fp.x[0], y: fp.x[1], type: fp.stability.type, stable: fp.stability.stable, eig: eigSaid(fp) }));
  for (const fp of fixed) {
    prims.push({ p: 'points', of, at: [P(fp.x, fp.y)], r: 4.5, tone: fp.stable === true ? 'primary' : fp.stable === false ? 'tension' : 'muted', layer: 'fixed points' });
    prims.push({ p: 'label', of, at: P(fp.x, fp.y + H * 0.035), text: fp.type, anchor: 'middle', layer: 'fixed points' });
  }

  const fixedSaid = fixed.length
    ? `${fixed.length} fixed point${fixed.length === 1 ? '' : 's'} — ${fixed.map((f) => `${f.type} at (${fmt(f.x)}, ${fmt(f.y)}), eigenvalues ${f.eig}`).join('; ')} (Newton from a grid of starts; classified by the Jacobian's eigenvalues, computed numerically)`
    : 'no fixed point in or near the window';
  const note =
    `the plane of ${a} and ${b} is the whole state, and the rates do not change with time at their current values, so every point has one direction of motion. ` +
    `Bold: the run from the model's own starting state (${run.note}). ` +
    `${others} thin path${others === 1 ? '' : 's'} from other starting states (Dormand–Prince, adaptive, relative tolerance 10⁻⁶). ` +
    `Arrows: d${a}/dt and d${b}/dt evaluated on a ${GRID} × ${GRID} grid${clipped ? ', the longest clipped to the 90th percentile so the rest stay readable' : ''}. ` +
    `Dashed: the nullclines, where d${a}/dt = 0 and where d${b}/dt = 0. ${fixedSaid}.`;
  return { names: [a, b], whole: true, box, primitives: prims, fixed, note };
}

// ── how a system behaves, as facts ──────────────────────────────────

export interface Behaviour {
  /** autonomous: the rates do not depend on time, so fixed points and exponents mean something */
  autonomous: boolean;
  fixed: { at: number[]; type: string; stable: boolean | null; eig: string }[];
  /** finite-time estimates of the Lyapunov spectrum, descending, when computed */
  lyapunov?: { exponents: number[]; sum: number; kaplanYorke?: number; method: string };
  /** what was searched and how, for the reader */
  how: string;
}

const BEHAVIOUR = new Map<string, Behaviour | null>();

/**
 * Where a system rests and how it moves near there — computed, never assumed.
 *
 * Fixed points: Newton from a grid of starts over a box around the run (the
 * run's extent, widened by half), each classified by its Jacobian's
 * eigenvalues. Lyapunov exponents, for an autonomous system of up to six
 * states: Benettin's method from the run's last state — a FINITE-TIME estimate,
 * said to be one; a positive largest exponent means nearby starts separate
 * exponentially over that time, which is what sensitivity to initial
 * conditions is.
 */
export function behaviourOf(model: Model, o: ModelObject): Behaviour | null {
  const read = readSystem(model, o);
  if (!read.ok) return null;
  const decl = read.decl;
  const names = decl.states.map((v) => v.name);
  const scope = scopeOf(model);
  const key = JSON.stringify({ id: o.id, rhs: decl.rhs, init: decl.states.map((v) => v.init), scope: Object.entries(scope).filter(([k]) => k !== 't').sort() });
  if (BEHAVIOUR.has(key)) return BEHAVIOUR.get(key)!;
  const done = (b: Behaviour | null) => {
    if (BEHAVIOUR.size > 48) BEHAVIOUR.clear();
    BEHAVIOUR.set(key, b);
    return b;
  };
  const got0 = runFor(model, o);
  const autonomous = !clocked(model, names, decl.rhs, got0.ok ? got0.run.y : [decl.states.map((v) => (typeof v.init === 'number' ? v.init : 0))]);
  if (!autonomous) return done({ autonomous, fixed: [], how: 'the rates depend on time at their current values, so the system has no fixed points or exponents in this sense' });
  const known = [...Object.keys(scope), ...names, 't'];
  const fs = names.map((n) => compileExpr(decl.rhs[n], known));
  if (fs.some((f) => !f)) return done(null);
  const f = (y: readonly number[]) => {
    const sc: Record<string, number> = { ...scope, t: 0 };
    names.forEach((n, i) => {
      sc[n] = y[i];
      sc[n.toLowerCase()] = y[i];
    });
    return fs.map((g) => g!.eval(sc));
  };
  const got = runFor(model, o);
  if (!got.ok) return done(null);
  const run = got.run;
  const box = names.map((_, i) => {
    const col = run.y.map((r) => r[i]).filter(Number.isFinite);
    return padded(Math.min(...col), Math.max(...col), 0.5);
  });
  const dim = names.length;
  const fixed =
    dim <= 6
      ? fixedPoints({ dim, f: (y) => f(y) }, box, { maxStarts: dim <= 2 ? 81 : dim === 3 ? 125 : 64 })
          .filter((fp) => fp.residual < 1e-8 * Math.max(1, Math.hypot(...fp.x)) && fp.x.every(Number.isFinite))
          .map((fp) => ({ at: fp.x, type: fp.stability.type, stable: fp.stability.stable, eig: eigSaid(fp) }))
      : [];
  let lyapunov: Behaviour['lyapunov'];
  const end = run.y[run.y.length - 1];
  if (dim >= 2 && dim <= 6 && end?.every(Number.isFinite)) {
    try {
      const ly = lyapunovFlow({ dim, f: (y) => f(y) }, end, { transient: 10, time: 60, tau: 0.5, rtol: 1e-7 });
      if (ly.exponents.every(Number.isFinite)) lyapunov = { exponents: ly.exponents, sum: ly.sum, ...(ly.kaplanYorke !== undefined ? { kaplanYorke: ly.kaplanYorke } : {}), method: ly.method };
    } catch {
      // an integration that fails says nothing; nothing is reported
    }
  }
  return done({
    autonomous,
    fixed,
    ...(lyapunov ? { lyapunov } : {}),
    how: dim <= 6 ? `fixed points searched by Newton from a grid of starts over the run's extent widened by half in each of ${dim} states` : `more than six states: no search for fixed points or exponents`,
  });
}
