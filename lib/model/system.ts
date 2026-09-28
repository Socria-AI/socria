// lib/model/system.ts
//
// STATE THAT EVOLVES — the general one, with as many named states as a system has.
//
// WHAT THIS REPLACES, AND WHY IT IS THE MOST IMPORTANT FILE IN THIS PASS. The
// engine could already integrate: `trajectory` objects run RK4 on a right-hand
// side (compile.ts). But the state was four components called x, y, z and w, and
// the right-hand sides were called dx…dw. That is enough for a double pendulum
// and for nothing larger, so every system with five or more states — three masses
// on springs, an SIR model with vital dynamics, a two-loop circuit, a four-stock
// flow — could not be expressed AT ALL. Not badly: not at all. It was the single
// hardest ceiling in Logos, and it was two lines of naming.
//
// So a system here declares its own states by NAME, in any number up to a cap,
// with its own right-hand sides, its own stopping condition and its own derived
// observations. Nothing about it is domain-specific: masses, populations,
// concentrations, currents, stocks and prices are the same object, and the
// mechanism grammar (mechanism.ts) and the domain libraries build one of these
// rather than each carrying an integrator.
//
// WHAT IT IS NOT. It is not a solver library and not a PDE engine. It is one
// explicit method — RK4 at a fixed step — behind an interface the router can
// route to (solve.ts), so a stiff system or a symplectic one can be added as
// another method later without anything above this file changing.
//
// PURE: expressions in, numbers out. No React, no clock, no storage.

import { compileExpr } from '@/lib/logos-math';
import { integrate } from './sample';
import { scopeOf } from './compile';
import type { Model, ModelObject, StateVarDecl, SystemDecl as Decl } from './schema';

/** How many named states one system may carry. Beyond this, the picture is the problem. */
export const STATE_CAP = 24;
/** How many steps any one run may take. Bounded, because a slider is attached to it. */
export const STEP_CAP = 20_000;
/** How many derived observations may ride along with a run. */
export const OBSERVE_CAP = 8;

/** Re-exported from the schema, where the block lives so a model validates without a solver. */
export type StateVar = StateVarDecl;

export type SystemDecl = Decl;

export interface Run {
  /** the state names, in the order the rows are in */
  names: string[];
  t: number[];
  /** y[i] is the state at t[i] */
  y: number[][];
  /** the declared observations, each a series as long as t */
  observed: Record<string, number[]>;
  /** why it ended, when it did not simply run out of steps */
  stopped: 'boundary' | 'diverged' | null;
  /** what the integrator did, in words, for the honest note on a picture */
  note: string;
  dt: number;
  steps: number;
}

export interface Missing {
  /** what is absent */
  what: string;
  /** what it would let us do */
  unlocks: string;
}

/**
 * Read a system declaration off an object, or say exactly what is missing.
 *
 * REFUSING IS THE FEATURE. A system with no initial value for one of its states
 * cannot be integrated, and the alternative to saying so is picking a number —
 * which produces a trajectory, and a trajectory is read as a result. Every
 * return here is either a runnable system or a list of what a person would have
 * to supply, in their terms.
 */
export function readSystem(
  model: Model,
  o: ModelObject
): { ok: true; decl: SystemDecl } | { ok: false; missing: Missing[] } {
  const decl: SystemDecl | undefined = o.system;
  const missing: Missing[] = [];
  if (!decl || !Array.isArray(decl.states) || !decl.states.length) {
    return { ok: false, missing: [{ what: 'the state variables', unlocks: 'anything at all: a system with no state has nothing to evolve' }] };
  }
  const names = decl.states.map((v) => v.name);
  const scope = scopeOf(model);
  const known = [...Object.keys(scope), ...names, 't'];

  for (const v of decl.states) {
    if (!decl.rhs?.[v.name]) {
      missing.push({ what: `d${v.name}/dt`, unlocks: `how ${v.means ?? v.name} changes — without it this state cannot move` });
      continue;
    }
    const f = compileExpr(decl.rhs[v.name], known);
    if (!f) missing.push({ what: `a readable expression for d${v.name}/dt`, unlocks: 'integration; the one given did not compile' });
    if (typeof v.init === 'string') {
      const e = compileExpr(v.init, known);
      if (!e || !Number.isFinite(e.eval(scope))) {
        missing.push({ what: `a starting value for ${v.name}`, unlocks: 'a numerical run; it can stay symbolic until then' });
      }
    } else if (!Number.isFinite(v.init)) {
      missing.push({ what: `a starting value for ${v.name}`, unlocks: 'a numerical run; it can stay symbolic until then' });
    }
  }
  if (missing.length) return { ok: false, missing };
  return { ok: true, decl };
}

/**
 * Run it.
 *
 * Bounded by construction: the step count is capped, the state count is capped,
 * and a state that stops being finite ends the run with `stopped: 'diverged'`
 * rather than filling an array with NaN and drawing it.
 */
export function simulate(
  model: Model,
  o: ModelObject,
  opts?: { dt?: number; steps?: number; t0?: number }
): { ok: true; run: Run } | { ok: false; missing: Missing[] } {
  const read = readSystem(model, o);
  if (!read.ok) return read;
  const decl = read.decl;

  const states = decl.states.slice(0, STATE_CAP);
  const names = states.map((v) => v.name);
  const scope = scopeOf(model);
  const known = [...Object.keys(scope), ...names, 't'];

  const fns = names.map((n) => compileExpr(decl.rhs[n], known)!);
  const y0 = states.map((v) => {
    if (typeof v.init === 'number') return v.init;
    const e = compileExpr(v.init, known);
    return e ? e.eval(scope) : 0;
  });

  // THE SCOPE IS CASE-INSENSITIVE, because the expression grammar is.
  //
  // compileExpr lowercases both its allowed names and its tokens, so a state
  // called `S` is looked up as `s` at evaluation time. Writing only the original
  // casing left every uppercase state undefined — which in an SIR model meant an
  // integration that ran, produced numbers, and conserved nothing. It looked like
  // a physics result and was a lookup miss, which is exactly the class of failure
  // this architecture is supposed to make impossible: so both spellings go in.
  const at = (y: readonly number[], t: number) => {
    const sc: Record<string, number> = { ...scope, t };
    for (let i = 0; i < names.length; i++) {
      const v = y[i] ?? 0;
      sc[names[i]] = v;
      sc[names[i].toLowerCase()] = v;
    }
    return sc;
  };

  const stop = decl.stop ? compileExpr(decl.stop, known) : null;
  const dt = Math.max(1e-9, opts?.dt ?? decl.dt ?? 0.01);
  const steps = Math.max(1, Math.min(STEP_CAP, Math.floor(opts?.steps ?? decl.steps ?? 2000)));

  const out = integrate((t, y) => fns.map((f) => f.eval(at(y, t))), y0, {
    dt,
    steps,
    ...(opts?.t0 !== undefined ? { t0: opts.t0 } : {}),
    ...(stop ? { until: (t, y) => stop.eval(at(y, t)) > 0 } : {}),
  });

  // The observations, evaluated on the run rather than integrated alongside it:
  // they are functions OF the state, so computing them afterwards is exact and
  // keeps them out of the integrator's error budget.
  const observed: Record<string, number[]> = {};
  const obs = Object.entries(decl.observe ?? {}).slice(0, OBSERVE_CAP);
  for (const [key, expr] of obs) {
    const f = compileExpr(expr, known);
    if (!f) continue;
    observed[key] = out.value.t.map((t, i) => f.eval(at(out.value.y[i], t)));
  }

  return {
    ok: true,
    run: {
      names,
      t: out.value.t,
      y: out.value.y,
      observed,
      stopped: out.value.stopped ?? null,
      note: out.note,
      dt,
      steps,
    },
  };
}

/**
 * The state at a time, by interpolation between the steps that were taken.
 *
 * WHAT MAKES ANIMATION HONEST. A mechanism drawn at t = 3.7 has to be drawn from
 * the state the integrator produced, and the integrator's steps do not land on
 * 3.7. Interpolating between two computed states is a computed position; picking
 * a nearby step and calling it 3.7 is not, and moving a body by a formula that
 * looks like the motion is decoration.
 */
export function stateAt(run: Run, t: number): Record<string, number> {
  const out: Record<string, number> = { t };
  if (!run.t.length) return out;
  const last = run.t.length - 1;
  if (t <= run.t[0]) {
    run.names.forEach((n, i) => (out[n] = run.y[0][i]));
    for (const [k, v] of Object.entries(run.observed)) out[k] = v[0];
    out.t = run.t[0];
    return out;
  }
  if (t >= run.t[last]) {
    run.names.forEach((n, i) => (out[n] = run.y[last][i]));
    for (const [k, v] of Object.entries(run.observed)) out[k] = v[last];
    out.t = run.t[last];
    return out;
  }
  // Uniform steps, so the index is arithmetic; a bisection would be the same
  // answer more slowly, and this runs once per frame.
  const span = run.t[last] - run.t[0];
  const guess = Math.min(last - 1, Math.max(0, Math.floor(((t - run.t[0]) / span) * last)));
  let i = guess;
  while (i > 0 && run.t[i] > t) i--;
  while (i < last - 1 && run.t[i + 1] < t) i++;
  const f = (t - run.t[i]) / Math.max(1e-12, run.t[i + 1] - run.t[i]);
  run.names.forEach((n, k) => (out[n] = run.y[i][k] + f * (run.y[i + 1][k] - run.y[i][k])));
  for (const [k, v] of Object.entries(run.observed)) out[k] = v[i] + f * (v[i + 1] - v[i]);
  return out;
}

/** One state or observation as a series, for a plot against time. */
export function seriesOf(run: Run, name: string): { t: number[]; v: number[] } | null {
  const i = run.names.indexOf(name);
  if (i >= 0) return { t: run.t, v: run.y.map((row) => row[i]) };
  const obs = run.observed[name];
  if (obs) return { t: run.t, v: obs };
  return null;
}

/** Two states against each other: a phase portrait, which is where a system's shape lives. */
export function phaseOf(run: Run, a: string, b: string): { x: number[]; y: number[] } | null {
  const i = run.names.indexOf(a);
  const j = run.names.indexOf(b);
  if (i < 0 || j < 0) return null;
  return { x: run.y.map((r) => r[i]), y: run.y.map((r) => r[j]) };
}

/**
 * How far a conserved quantity drifted over the run.
 *
 * THE INTEGRATOR MARKING ITS OWN WORK. A model that declares an invariant —
 * energy, a total population, charge — gets a number saying how well the
 * integration kept it, and that number is the reader's evidence about whether to
 * believe the run. A simulation with no such check is a picture with decimals.
 */
export function driftOf(run: Run, name: string): { from: number; to: number; relative: number } | null {
  const s = seriesOf(run, name);
  if (!s || s.v.length < 2) return null;
  const from = s.v[0];
  const to = s.v[s.v.length - 1];
  const scale = Math.max(1e-12, Math.abs(from));
  return { from, to, relative: (to - from) / scale };
}

// ── one run per model state, not one per frame ──────────────────────
//
// A run depends on the parameters, the initial conditions and the step — and NOT
// on the clock: integrating once covers every t the reader can scrub to. So the
// result is cached against the parameter values, and animation replays a computed
// run rather than recomputing it sixty times a second. Changing a parameter
// changes the key, which is what makes "change k and watch it move differently" a
// recomputation rather than a redraw.

const RUNS = new Map<string, { ok: true; run: Run } | { ok: false; missing: Missing[] }>();

function keyOf(model: Model, o: ModelObject): string {
  const params = model.params.map((p) => `${p.id}=${p.value}`).join(',');
  return `${model.id}:${o.id}:${model.version ?? 0}:${params}`;
}

export function runFor(
  model: Model,
  o: ModelObject,
  opts?: { dt?: number; steps?: number }
): { ok: true; run: Run } | { ok: false; missing: Missing[] } {
  const key = keyOf(model, o) + (opts ? `:${opts.dt ?? ''}/${opts.steps ?? ''}` : '');
  const held = RUNS.get(key);
  if (held) return held;
  const made = simulate(model, o, opts);
  // Bounded, because dragging a slider sweeps a lot of keys.
  if (RUNS.size > 64) RUNS.clear();
  RUNS.set(key, made);
  return made;
}

/** Forget the cached runs. For tests, and for a host that has changed the data. */
export function forgetRuns(): void {
  RUNS.clear();
}
