// lib/model/engineering.ts
//
// ENGINEERING EXAMPLES — models written in exactly the form a Logos reply
// proposes them, so the docs can show what asking for each one builds, built by
// the same on-ramp (propose.ts) and computed by the same engine.
//
// EACH EXAMPLE CARRIES A CHECK: a sentence whose numbers the engine computes
// from the model on the page — a fixed point's eigenvalues, a run's value at a
// time, a curve evaluated at a point — and test/model-engineering.test.mjs
// holds every one to its closed form. A number in the docs is therefore a
// computation that has been checked, not a figure somebody typed.
//
// NOTHING HERE IS A NEW CAPABILITY. Every model uses blocks the engine already
// had: curves, systems, mechanisms. If one of these needed its own code, it
// would not belong in a list of what Logos does.
//
// PURE.

import { compileExpr } from '@/lib/logos-math';
import { scopeOf } from './compile';
import { behaviourOf } from './phase';
import { runFor } from './system';
import { unpack } from './unpack';
import { circuit, oscillator } from './library';
import type { Model, ModelObject } from './schema';

export type Discipline = 'Engines' | 'Mechanisms and vibration' | 'Electrical' | 'Structures' | 'Thermal and fluids' | 'Aerospace' | 'Chemical and process' | 'Control';

export interface EngineeringExample {
  id: string;
  discipline: Discipline;
  title: string;
  /** what to type — the words that ask for it */
  ask: string;
  /** what the engine builds, in a sentence or two */
  builds: string;
  /** which views to open, and what to watch in them */
  look: string;
  model: () => Model;
  /** a sentence whose numbers the engine computes from the model */
  check: (m: Model) => string;
}

const param = (id: string, label: string, value: number, min: number, max: number, units?: string, means?: string, step?: number) => ({
  id,
  label,
  value,
  min,
  max,
  ...(units ? { units } : {}),
  ...(means ? { means } : {}),
  ...(step ? { step } : {}),
});

const sig = (v: number, n = 4) => {
  const r = Number(v.toPrecision(n));
  return Object.is(r, -0) ? '0' : String(r).replace(/^-/, '−');
};

// ── computing a check ───────────────────────────────────────────────

/** A curve object's value at a point of its input, evaluated in the model's own scope. */
export function curveAt(m: Model, id: string, x: number): number {
  const o = m.objects.find((q) => q.id === id);
  if (!o) return NaN;
  const expr = o.definition ?? o.defs?.f;
  const v = Object.keys(o.over ?? {})[0] ?? 'x';
  const scope = scopeOf(m);
  const e = expr ? compileExpr(expr, [...Object.keys(scope), v, 'x']) : null;
  return e ? e.eval({ ...scope, [v.toLowerCase()]: x, x }) : NaN;
}

/** The curve sampled densely over its range: where it is largest, and how far it spans. */
export function curveExtremes(m: Model, id: string, n = 4000): { max: number; at: number; min: number; minAt: number } {
  const o = m.objects.find((q) => q.id === id)!;
  const [a, b] = Object.values(o.over ?? { x: [0, 1] })[0] as [number, number];
  let best = { max: -Infinity, at: a, min: Infinity, minAt: a };
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    const y = curveAt(m, id, x);
    if (!Number.isFinite(y)) continue;
    if (y > best.max) best = { ...best, max: y, at: x };
    if (y < best.min) best = { ...best, min: y, minAt: x };
  }
  return best;
}

/** The first object with a system, after mechanisms are assembled into one. */
export function systemObject(m: Model): { model: Model; o: ModelObject } | null {
  const u = unpack(m);
  const o = u.objects.find((q) => q.system);
  return o ? { model: u, o } : null;
}

/** A state's value at time t, by linear interpolation in the engine's own run. */
export function stateAt(m: Model, name: string, t: number): number {
  const s = systemObject(m);
  if (!s) return NaN;
  const r = runFor(s.model, s.o);
  if (!r.ok) return NaN;
  const i = r.run.names.indexOf(name);
  const k = r.run.t.findIndex((x) => x >= t);
  if (i < 0 || k < 0) return NaN;
  if (k === 0) return r.run.y[0][i];
  const f = (t - r.run.t[k - 1]) / (r.run.t[k] - r.run.t[k - 1]);
  return r.run.y[k - 1][i] + f * (r.run.y[k][i] - r.run.y[k - 1][i]);
}

/** A state's largest value over the run, and when. */
export function stateMax(m: Model, name: string, from = 0): { v: number; t: number } {
  const s = systemObject(m);
  const r = s ? runFor(s.model, s.o) : null;
  if (!r || !r.ok) return { v: NaN, t: NaN };
  const i = r.run.names.indexOf(name);
  let best = { v: -Infinity, t: NaN };
  r.run.t.forEach((t, k) => {
    if (t >= from && r.run.y[k][i] > best.v) best = { v: r.run.y[k][i], t };
  });
  return best;
}

/** How long the run lasted, and why it stopped. */
export function runEnd(m: Model): { t: number; stopped: string | null } {
  const s = systemObject(m);
  const r = s ? runFor(s.model, s.o) : null;
  if (!r || !r.ok) return { t: NaN, stopped: null };
  return { t: r.run.t[r.run.t.length - 1], stopped: r.run.stopped };
}

/** The fixed points the engine finds, written out. */
export function restSaid(m: Model): string {
  const s = systemObject(m);
  const b = s ? behaviourOf(s.model, s.o) : null;
  if (!b || !b.fixed.length) return 'no fixed point found';
  return b.fixed.map((f) => `${f.type} at (${f.at.map((v) => sig(v, 3)).join(', ')}), eigenvalues ${f.eig}`).join('; ');
}

export const withParam = (m: Model, id: string, value: number): Model => ({ ...m, params: m.params.map((p) => (p.id === id ? { ...p, value } : p)) });
const pv = (m: Model, id: string) => m.params.find((p) => p.id === id)?.value ?? NaN;

// ── a system, written once ──────────────────────────────────────────

function system(o: {
  id: string;
  label: string;
  meaning: string;
  states: { name: string; init: number | string; units?: string; means?: string }[];
  rhs: Record<string, string>;
  dt: number;
  steps: number;
  depends: string[];
  stop?: string;
  observe?: Record<string, string>;
  plane?: [string, string];
}): ModelObject {
  return {
    id: o.id,
    kind: 'system',
    label: o.label,
    meaning: o.meaning,
    system: { states: o.states, rhs: o.rhs, dt: o.dt, steps: o.steps, method: 'rk4', ...(o.stop ? { stop: o.stop } : {}), ...(o.observe ? { observe: o.observe } : {}) },
    ...(o.plane ? { defs: { px: o.plane[0], py: o.plane[1] } } : {}),
    depends: o.depends,
    fidelity: 'numerically-computed',
    provenance: { origin: 'computation', detail: 'RK4 on the stated equations' },
  } as ModelObject;
}

function curve(o: { id: string; label: string; meaning: string; definition: string; over: Record<string, [number, number]>; depends: string[]; units?: string }): ModelObject {
  return {
    id: o.id,
    kind: 'curve',
    label: o.label,
    meaning: o.meaning,
    definition: o.definition,
    over: o.over,
    depends: o.depends,
    ...(o.units ? { units: o.units } : {}),
    // the vertical axis is named for what the curve is, not "y"
    meta: { outcome: o.label },
    fidelity: 'model-derived',
    provenance: { origin: 'equation' },
  } as ModelObject;
}

// ════════════════════════════════════════════════════════════════════
// THE EXAMPLES
// ════════════════════════════════════════════════════════════════════

export const ENGINEERING: EngineeringExample[] = [
  // ── engines ───────────────────────────────────────────────────────
  {
    id: 'otto-diesel',
    discipline: 'Engines',
    title: 'Otto and Diesel cycle efficiency',
    ask: 'Plot the ideal Otto and Diesel cycle efficiencies against compression ratio, with γ and the cutoff ratio as controls.',
    builds: 'Two curves over the compression ratio: η = 1 − r^(1−γ) for the Otto cycle and η = 1 − r^(1−γ)·(ρ^γ − 1)/(γ(ρ − 1)) for the Diesel cycle, both air-standard.',
    look: 'Move γ and both curves move; raise the cutoff ratio ρ and the Diesel curve falls further below the Otto one at the same compression.',
    model: () => ({
      id: 'otto-diesel',
      title: 'Air-standard Otto and Diesel efficiencies',
      domain: 'thermodynamics',
      equations: ['η_Otto = 1 − r^(1−γ)', 'η_Diesel = 1 − r^(1−γ)·(ρ^γ − 1)/(γ(ρ − 1))'],
      assumptions: ['Air-standard cycles: an ideal gas with constant specific heats, reversible compression and expansion. Real engines fall well short of these.'],
      params: [param('gamma', 'ratio of specific heats γ', 1.4, 1.1, 1.67, undefined, 'For air at room temperature, about 1.4.', 0.01), param('rho', 'cutoff ratio ρ', 2, 1.1, 4, undefined, 'How far the Diesel combustion stroke expands at constant pressure.', 0.1)],
      units: { r: '' },
      objects: [
        curve({ id: 'otto', label: 'Otto efficiency', meaning: 'The ideal efficiency of the spark-ignition cycle.', definition: '1 - r^(1 - gamma)', over: { r: [2, 20] }, depends: ['gamma'] }),
        curve({ id: 'diesel', label: 'Diesel efficiency', meaning: 'The ideal efficiency of the compression-ignition cycle.', definition: '1 - r^(1 - gamma) * (rho^gamma - 1) / (gamma * (rho - 1))', over: { r: [2, 20] }, depends: ['gamma', 'rho'] }),
      ],
    }),
    check: (m) => `At a compression ratio of 10 the ideal Otto efficiency is ${sig(100 * curveAt(m, 'otto', 10), 3)}% and the Diesel, with ρ = ${pv(m, 'rho')}, ${sig(100 * curveAt(m, 'diesel', 10), 3)}%.`,
  },
  {
    id: 'slider-crank',
    discipline: 'Engines',
    title: 'Piston motion in a slider-crank',
    ask: 'Model a piston engine’s slider-crank: piston position against crank angle, with the crank radius and the rod length as controls, and the piston speed at 3000 rpm.',
    builds: 'The piston’s distance from the crank axis, x(θ) = r·cos θ + √(l² − r²·sin² θ), and its speed at a set engine speed — both exact expressions of the crank angle.',
    look: 'The stroke is the curve’s height, and it is 2r whatever l is. Shorten the rod and the motion grows less like a sine: the speed peaks earlier than 90°.',
    model: () => ({
      id: 'slider-crank',
      title: 'A slider-crank',
      domain: 'kinematics',
      // position and speed are different quantities: open on the position, with the speed one view away
      view: 'curve:x',
      equations: ['x = r cos θ + √(l² − r² sin² θ)', 'v = −r ω [sin θ + r sin 2θ / (2√(l² − r² sin² θ))]'],
      assumptions: ['Rigid links and an in-line cylinder: no offset, no clearance, no elasticity.'],
      params: [param('r', 'crank radius', 0.04, 0.01, 0.1, 'm', 'Half the stroke.', 0.001), param('l', 'rod length', 0.14, 0.05, 0.4, 'm', 'Centre to centre of the connecting rod. It must be longer than r.', 0.001), param('rpm', 'engine speed', 3000, 500, 8000, 'rpm', 'How fast the crank turns.', 50)],
      units: { theta: 'rad' },
      objects: [
        curve({ id: 'x', label: 'piston position', meaning: 'Distance from the crank axis to the piston pin.', definition: 'r * cos(theta) + sqrt(l^2 - r^2 * sin(theta)^2)', over: { theta: [0, 6.283185307] }, depends: ['r', 'l'], units: 'm' }),
        curve({ id: 'v', label: 'piston speed', meaning: 'The piston’s velocity at the set engine speed.', definition: '0 - r * (rpm * 2 * pi / 60) * (sin(theta) + r * sin(2 * theta) / (2 * sqrt(l^2 - r^2 * sin(theta)^2)))', over: { theta: [0, 6.283185307] }, depends: ['r', 'l', 'rpm'], units: 'm/s' }),
      ],
    }),
    check: (m) => {
      const x = curveExtremes(m, 'x');
      const v = curveExtremes(m, 'v');
      return `The stroke is ${sig(x.max - x.min)} m — twice the crank radius — and at ${pv(m, 'rpm')} rpm the piston reaches ${sig(Math.max(v.max, -v.min), 3)} m/s, at ${sig((Math.abs(v.min) > v.max ? v.minAt : v.at) * (180 / Math.PI), 3)}° of crank.`;
    },
  },
  {
    id: 'flywheel',
    discipline: 'Engines',
    title: 'Energy in a flywheel',
    ask: 'How much energy does a 50 kg solid steel flywheel of radius 0.3 m store at different speeds?',
    builds: 'The stored energy E = ½·I·ω² with I = ½·m·r² for a solid disc, as a curve over the speed in rpm.',
    look: 'Doubling the speed quadruples the energy; doubling the radius at the same mass does the same.',
    model: () => ({
      id: 'flywheel',
      title: 'A flywheel’s stored energy',
      domain: 'rotational dynamics',
      equations: ['E = ½ I ω²', 'I = ½ m r² (a solid disc)'],
      assumptions: ['A uniform solid disc, spinning about its axis; losses ignored.'],
      params: [param('m', 'mass', 50, 1, 500, 'kg', undefined, 1), param('rad', 'radius', 0.3, 0.05, 1.5, 'm', undefined, 0.01)],
      units: { rpm: 'rpm' },
      objects: [curve({ id: 'e', label: 'stored energy', meaning: 'Kinetic energy of rotation.', definition: '0.5 * (0.5 * m * rad^2) * (rpm * 2 * pi / 60)^2', over: { rpm: [0, 6000] }, depends: ['m', 'rad'], units: 'J' })],
    }),
    check: (m) => `At 3000 rpm it holds ${sig(curveAt(m, 'e', 3000) / 1000, 3)} kJ; at 6000 rpm, ${sig(curveAt(m, 'e', 6000) / 1000, 3)} kJ — four times as much.`,
  },

  // ── mechanisms and vibration ──────────────────────────────────────
  {
    id: 'msd',
    discipline: 'Mechanisms and vibration',
    title: 'A mass, a spring and a damper',
    ask: 'Model a 1 kg mass on a 20 N/m spring with a 0.6 N·s/m damper, released from 1 m.',
    builds: 'A mechanism — one body, one spring and one damper to the wall — assembled into equations of motion and integrated. Nothing is a formula for the answer: the motion is computed.',
    look: 'Open the phase portrait: the run spirals into a stable spiral at rest. Raise the damping past 2√(km) and the fixed point turns into a stable node — the motion stops oscillating.',
    model: oscillator,
    check: (m) => {
      const k = pv(m, 'k');
      const mm = pv(m, 'm');
      const c = pv(m, 'c');
      return `The engine finds a ${restSaid(m)}. By hand: ωₙ = √(k/m) = ${sig(Math.sqrt(k / mm))} rad/s and ζ = c/(2√(km)) = ${sig(c / (2 * Math.sqrt(k * mm)), 3)}, so the eigenvalues should be −ζωₙ ± iωₙ√(1−ζ²).`;
    },
  },
  {
    id: 'two-mass',
    discipline: 'Mechanisms and vibration',
    title: 'Two masses, two natural frequencies',
    ask: 'Two 1 kg masses in a line: the first on a 100 N/m spring to the wall, joined to the second by a 50 N/m spring. What are its natural frequencies?',
    builds: 'A two-body mechanism. With no damping its rest point is a centre in four dimensions, and the eigenvalues of the assembled system are ±iω for each mode.',
    look: 'The Inspector’s “How it behaves” lists the eigenvalues: their imaginary parts are the two natural frequencies. Add damping with the control and they gain negative real parts.',
    model: () => ({
      id: 'two-mass',
      title: 'Two masses on springs',
      domain: 'vibration',
      equations: ['M ẍ + C ẋ + K x = 0', 'assembled from the parts'],
      assumptions: ['Linear springs and viscous dampers, one degree of freedom per mass, motion along one line.'],
      params: [param('m1', 'first mass', 1, 0.1, 10, 'kg', undefined, 0.1), param('m2', 'second mass', 1, 0.1, 10, 'kg', undefined, 0.1), param('k1', 'spring to the wall', 100, 1, 500, 'N/m', undefined, 1), param('k2', 'spring between them', 50, 1, 500, 'N/m', undefined, 1), param('c', 'damping between them', 0, 0, 10, 'N·s/m', undefined, 0.1)],
      units: { x: 'm', v: 'm/s' },
      time: { t: 0, min: 0, max: 10, rate: 1, units: 's' },
      objects: [
        {
          id: 'mech',
          kind: 'component',
          label: 'The two masses',
          meaning: 'Two bodies, two springs and a damper, assembled into equations of motion and integrated.',
          mechanism: {
            along: 'line',
            bodies: [
              { id: 'a', mass: 'm1', x0: 0.1, v0: 0, label: 'the first mass', at: 2 },
              { id: 'b', mass: 'm2', x0: 0, v0: 0, label: 'the second mass', at: 4 },
            ],
            springs: [
              { id: 's1', between: ['a', 'ground'], value: 'k1', label: 'the spring to the wall' },
              { id: 's2', between: ['a', 'b'], value: 'k2', label: 'the spring between' },
            ],
            dampers: [{ id: 'd1', between: ['a', 'b'], value: 'c', label: 'the damper between' }],
            dt: 0.002,
            steps: 5000,
          },
          depends: ['m1', 'm2', 'k1', 'k2', 'c'],
          provenance: { origin: 'computation', detail: 'assembled from the parts, then RK4' },
        } as ModelObject,
      ],
    }),
    check: (m) => {
      const s = systemObject(m);
      const b = s ? behaviourOf(s.model, s.o) : null;
      const eig = b?.fixed[0]?.eig ?? '';
      // M⁻¹K for the two-mass chain: [[(k1+k2)/m1, −k2/m1], [−k2/m2, k2/m2]]
      const a = (pv(m, 'k1') + pv(m, 'k2')) / pv(m, 'm1');
      const d = pv(m, 'k2') / pv(m, 'm2');
      const bc = (pv(m, 'k2') / pv(m, 'm1')) * (pv(m, 'k2') / pv(m, 'm2'));
      const tr = a + d;
      const det = a * d - bc;
      const w1 = Math.sqrt((tr - Math.sqrt(tr * tr - 4 * det)) / 2);
      const w2 = Math.sqrt((tr + Math.sqrt(tr * tr - 4 * det)) / 2);
      return `The engine’s eigenvalues at rest: ${eig}. From the eigenvalues of M⁻¹K by hand, the natural frequencies are ${sig(w1)} and ${sig(w2)} rad/s.`;
    },
  },
  {
    id: 'pendulum',
    discipline: 'Mechanisms and vibration',
    title: 'A pendulum, swinging far',
    ask: 'Model a damped pendulum released from 2.5 rad — not the small-angle one — with length and damping as controls.',
    builds: 'θ̈ = −(g/L)·sin θ − b·θ̇ as a two-state system, sin θ and all: the small-angle approximation would be a different, wrong, model at this amplitude.',
    look: 'The phase portrait shows the whole story: a stable spiral hanging straight down, and saddles at ±π — the inverted positions, balanced but unstable.',
    model: () => ({
      id: 'pendulum',
      title: 'A damped pendulum',
      domain: 'mechanics',
      equations: ['θ̈ = −(g/L) sin θ − b θ̇'],
      assumptions: ['A point mass on a massless rigid rod; viscous damping proportional to the angular speed.'],
      params: [param('g', 'gravity', 9.81, 1, 25, 'm/s²', undefined, 0.01), param('len', 'length', 1, 0.1, 5, 'm', undefined, 0.01), param('b', 'damping', 0.3, 0, 3, '1/s', undefined, 0.01), param('th0', 'starting angle', 2.5, -3.1, 3.1, 'rad', undefined, 0.01)],
      units: { th: 'rad', om: 'rad/s' },
      time: { t: 0, min: 0, max: 30, rate: 1, units: 's' },
      objects: [system({ id: 'swing', label: 'The pendulum', meaning: 'Angle and angular speed, integrated.', states: [{ name: 'th', init: 'th0', units: 'rad', means: 'angle from straight down' }, { name: 'om', init: 0, units: 'rad/s', means: 'angular speed' }], rhs: { th: 'om', om: '0 - (g / len) * sin(th) - b * om' }, dt: 0.005, steps: 6000, depends: ['g', 'len', 'b', 'th0'], plane: ['th', 'om'] })],
    }),
    check: (m) => `The engine finds a ${restSaid(m)}.`,
  },
  {
    id: 'double-pendulum',
    discipline: 'Mechanisms and vibration',
    title: 'A double pendulum, and why it is unpredictable',
    ask: 'Why is a double pendulum unpredictable? Model one released from 2.2 and 2.4 rad.',
    builds: 'The full equations of motion of two equal arms, integrated — no approximation, because an approximate chaotic trajectory looks exactly like a real one and is wrong.',
    look: 'The Inspector’s “How it behaves” estimates the Lyapunov exponents: the largest is positive, so two nearly identical releases separate exponentially. That is what unpredictable means here.',
    model: () => {
      const den = '(2 - cos(2*a - 2*c))';
      return {
        id: 'double-pendulum-system',
        title: 'A double pendulum',
        domain: 'mechanics',
        equations: ['equal masses and equal unit lengths, the full nonlinear equations'],
        assumptions: ['Equal point masses on massless rigid arms of equal length; no friction.'],
        params: [param('g', 'gravity', 9.81, 1, 20, 'm/s²', undefined, 0.01), param('a0', 'upper angle', 2.2, -3.1, 3.1, 'rad', undefined, 0.01), param('c0', 'lower angle', 2.4, -3.1, 3.1, 'rad', undefined, 0.01)],
        units: { a: 'rad', b: 'rad/s', c: 'rad', d: 'rad/s' },
        time: { t: 0, min: 0, max: 20, rate: 1, units: 's' },
        objects: [
          system({
            id: 'arms',
            label: 'The two arms',
            meaning: 'Both angles and both angular speeds, integrated.',
            states: [{ name: 'a', init: 'a0', units: 'rad', means: 'upper arm angle' }, { name: 'b', init: 0, units: 'rad/s', means: 'upper arm speed' }, { name: 'c', init: 'c0', units: 'rad', means: 'lower arm angle' }, { name: 'd', init: 0, units: 'rad/s', means: 'lower arm speed' }],
            rhs: {
              a: 'b',
              b: `(0 - g*2*sin(a) - g*sin(a - 2*c) - 2*sin(a - c)*(d^2 + b^2*cos(a - c)))/${den}`,
              c: 'd',
              d: `(2*sin(a - c)*(2*b^2 + 2*g*cos(a) + d^2*cos(a - c)))/${den}`,
            },
            dt: 0.002,
            steps: 10000,
            depends: ['g', 'a0', 'c0'],
            plane: ['a', 'c'],
          }),
        ],
      };
    },
    check: (m) => {
      const s = systemObject(m);
      const b = s ? behaviourOf(s.model, s.o) : null;
      const l = b?.lyapunov?.exponents ?? [];
      return l.length ? `The engine’s finite-time Lyapunov exponents: ${l.map((v) => sig(v, 3)).join(', ')} per second — the largest positive, so nearby releases diverge exponentially.` : 'No exponents could be estimated.';
    },
  },
  {
    id: 'resonance',
    discipline: 'Mechanisms and vibration',
    title: 'Resonance of a driven oscillator',
    ask: 'Plot the steady-state amplitude of a driven mass–spring–damper against the driving frequency.',
    builds: 'The amplitude X(ω) = F₀/√((k − mω²)² + (cω)²) — the exact steady-state response — as a curve over the drive frequency.',
    look: 'Lower the damping and the peak grows sharper and taller; it sits just below √(k/m), at √(k/m − c²/2m²).',
    model: () => ({
      id: 'resonance',
      title: 'Resonance',
      domain: 'vibration',
      equations: ['X(ω) = F₀ / √((k − mω²)² + (cω)²)'],
      assumptions: ['Linear spring and viscous damper, sinusoidal forcing, after the transient has died away.'],
      params: [param('m', 'mass', 1, 0.1, 10, 'kg', undefined, 0.1), param('k', 'stiffness', 20, 1, 100, 'N/m', undefined, 1), param('c', 'damping', 0.6, 0.05, 10, 'N·s/m', undefined, 0.05), param('f0', 'force amplitude', 1, 0.1, 10, 'N', undefined, 0.1)],
      units: { w: 'rad/s' },
      objects: [curve({ id: 'x', label: 'steady-state amplitude', meaning: 'How far the mass swings once the drive has taken over.', definition: 'f0 / sqrt((k - m * w^2)^2 + (c * w)^2)', over: { w: [0, 10] }, depends: ['m', 'k', 'c', 'f0'], units: 'm' })],
    }),
    check: (m) => {
      const e = curveExtremes(m, 'x', 20000);
      const k = pv(m, 'k'), mm = pv(m, 'm'), c = pv(m, 'c');
      return `The curve peaks at ω = ${sig(e.at)} rad/s with amplitude ${sig(e.max, 3)} m; the formula √(k/m − c²/2m²) puts the peak at ${sig(Math.sqrt(k / mm - (c * c) / (2 * mm * mm)))} rad/s.`;
    },
  },

  // ── electrical ────────────────────────────────────────────────────
  {
    id: 'rlc',
    discipline: 'Electrical',
    title: 'A driven RLC loop',
    ask: 'Model a series RLC circuit — 1 H, 0.5 Ω, 0.05 F — driven by a 1 V sine at 4 rad/s.',
    builds: 'The loop equation L·q̈ + R·q̇ + q/C = V(t) over the charge and the current, integrated — the same grammar as a mass on a spring with the names changed.',
    look: 'Against time, the current settles into a steady oscillation once the transient has decayed. Slide the drive rate toward 1/√(LC) and the amplitude climbs.',
    model: circuit,
    check: (m) => {
      const L = pv(m, 'l'), R = pv(m, 'r'), C = pv(m, 'cap'), V = pv(m, 'v0'), w = pv(m, 'w');
      const late = stateMax(m, 'i', 12);
      return `After the transient, the engine’s run reaches a current of ${sig(late.v, 3)} A; the steady-state formula V₀/√(R² + (ωL − 1/ωC)²) gives ${sig(V / Math.sqrt(R * R + (w * L - 1 / (w * C)) ** 2), 3)} A. Resonance is at 1/√(LC) = ${sig(1 / Math.sqrt(L * C))} rad/s.`;
    },
  },
  {
    id: 'rc',
    discipline: 'Electrical',
    title: 'An RC circuit charging',
    ask: 'A 10 kΩ resistor charging a 100 µF capacitor from a 5 V supply: how fast does it charge?',
    builds: 'dv/dt = (Vₛ − v)/(RC) as a one-state system, integrated from empty.',
    look: 'Against time, the voltage rises and flattens. After one time constant τ = RC it has covered 1 − 1/e of the way.',
    model: () => ({
      id: 'rc',
      title: 'RC charging',
      domain: 'circuits',
      equations: ['dv/dt = (Vₛ − v)/(RC)'],
      assumptions: ['An ideal resistor and capacitor and a stiff supply.'],
      params: [param('res', 'resistance', 10000, 100, 100000, 'Ω', undefined, 100), param('cap', 'capacitance', 0.0001, 0.000001, 0.001, 'F', undefined, 0.000001), param('vs', 'supply', 5, 1, 24, 'V', undefined, 0.1)],
      units: { v: 'V' },
      time: { t: 0, min: 0, max: 5, rate: 1, units: 's' },
      objects: [system({ id: 'cap', label: 'The capacitor voltage', meaning: 'Charging through the resistor.', states: [{ name: 'v', init: 0, units: 'V', means: 'voltage across the capacitor' }], rhs: { v: '(vs - v) / (res * cap)' }, dt: 0.001, steps: 5000, depends: ['res', 'cap', 'vs'] })],
    }),
    check: (m) => {
      const tau = pv(m, 'res') * pv(m, 'cap');
      return `After one time constant, τ = RC = ${sig(tau, 3)} s, the engine’s run reads ${sig(stateAt(m, 'v', tau), 4)} V — ${sig((100 * stateAt(m, 'v', tau)) / pv(m, 'vs'), 3)}% of the supply, against 1 − 1/e = 63.2%.`;
    },
  },
  {
    id: 'vanderpol',
    discipline: 'Electrical',
    title: 'A Van der Pol oscillator',
    ask: 'Model a Van der Pol oscillator with μ = 1 — the vacuum-tube circuit that keeps itself oscillating.',
    builds: 'ẍ − μ(1 − x²)ẋ + x = 0 as a two-state system: negative damping at small amplitude, positive at large.',
    look: 'The phase portrait: the rest point repels — an unstable spiral — and every path, from inside or outside, winds onto the same loop, the limit cycle, of amplitude about 2.',
    model: () => ({
      id: 'vanderpol',
      title: 'A Van der Pol oscillator',
      domain: 'electronics',
      equations: ['ẍ − μ(1 − x²)ẋ + x = 0'],
      assumptions: ['The dimensionless form; time in units of the circuit’s natural period over 2π.'],
      params: [param('mu', 'μ', 1, 0.05, 5, undefined, 'How strongly the circuit feeds energy in at small amplitude.', 0.05)],
      units: { x: '', y: '' },
      time: { t: 0, min: 0, max: 40, rate: 1 },
      objects: [system({ id: 'osc', label: 'The oscillator', meaning: 'x and its rate, integrated.', states: [{ name: 'x', init: 0.5 }, { name: 'y', init: 0 }], rhs: { x: 'y', y: 'mu * (1 - x^2) * y - x' }, dt: 0.01, steps: 4000, depends: ['mu'], plane: ['x', 'y'] })],
    }),
    check: (m) => `The engine finds an ${restSaid(m)}, and the run’s late amplitude is ${sig(stateMax(m, 'x', 25).v, 3)}.`,
  },

  // ── structures ────────────────────────────────────────────────────
  {
    id: 'cantilever',
    discipline: 'Structures',
    title: 'A cantilever’s deflection',
    ask: 'How far does a 2 m steel cantilever with a 100 mm square section bend under 1 kN at its tip? Show the deflected shape.',
    builds: 'The Euler–Bernoulli deflection w(x) = P·x²·(3L − x)/(6EI) along the beam, with load, modulus and second moment as controls.',
    look: 'The tip deflection is PL³/(3EI): halve the depth of the section and I drops eightfold, and the tip goes eight times further.',
    model: () => ({
      id: 'cantilever',
      title: 'A cantilever with a tip load',
      domain: 'structures',
      equations: ['w(x) = P x² (3L − x) / (6 E I)', 'δ_tip = P L³ / (3 E I)'],
      assumptions: ['Euler–Bernoulli: small deflections, plane sections stay plane, linear elastic. Shear deformation and self-weight ignored. A preview of the formula — not a check of a real member against a code.'],
      params: [param('p', 'tip load', 1000, 0, 20000, 'N', undefined, 50), param('e', 'Young’s modulus', 200e9, 1e9, 300e9, 'Pa', 'Steel is about 200 GPa.', 1e9), param('i2', 'second moment of area', 8.333e-6, 1e-7, 1e-4, 'm⁴', 'A 100 mm square section: b·h³/12 = 8.33 × 10⁻⁶ m⁴.', 1e-7)],
      units: { x: 'm' },
      objects: [curve({ id: 'w', label: 'deflection', meaning: 'How far the beam has moved down at each point along it.', definition: 'p * x^2 * (3 * 2 - x) / (6 * e * i2)', over: { x: [0, 2] }, depends: ['p', 'e', 'i2'], units: 'm' })],
    }),
    check: (m) => `The engine evaluates the tip at ${sig(curveAt(m, 'w', 2) * 1000, 3)} mm; PL³/(3EI) is ${sig(((pv(m, 'p') * 8) / (3 * pv(m, 'e') * pv(m, 'i2'))) * 1000, 3)} mm.`,
  },
  {
    id: 'simply-supported',
    discipline: 'Structures',
    title: 'A simply supported beam',
    ask: 'A 6 m simply supported steel beam (I = 8 × 10⁻⁵ m⁴) with a 10 kN point load at midspan: show the deflection.',
    builds: 'The exact deflection for a central point load, symmetric about midspan: w(x) = P·m·(3L² − 4m²)/(48EI), with m the distance to the nearer support.',
    look: 'The largest deflection is at midspan, PL³/(48EI) — a sixteenth of the cantilever’s at the same span and load.',
    model: () => ({
      id: 'simply-supported',
      title: 'A simply supported beam, central load',
      domain: 'structures',
      equations: ['w(x) = P m (3L² − 4m²) / (48 E I), m = L/2 − |x − L/2|'],
      assumptions: ['Euler–Bernoulli, linear elastic, small deflections; pinned at both ends.'],
      params: [param('p', 'central load', 10000, 0, 100000, 'N', undefined, 500), param('e', 'Young’s modulus', 200e9, 1e9, 300e9, 'Pa', undefined, 1e9), param('i2', 'second moment of area', 8e-5, 1e-6, 1e-3, 'm⁴', undefined, 1e-6)],
      units: { x: 'm' },
      objects: [curve({ id: 'w', label: 'deflection', meaning: 'Downward deflection along the beam.', definition: 'p * (3 - abs(x - 3)) * (3 * 6^2 - 4 * (3 - abs(x - 3))^2) / (48 * e * i2)', over: { x: [0, 6] }, depends: ['p', 'e', 'i2'], units: 'm' })],
    }),
    check: (m) => `At midspan the engine reads ${sig(curveAt(m, 'w', 3) * 1000, 3)} mm; PL³/(48EI) is ${sig(((pv(m, 'p') * 216) / (48 * pv(m, 'e') * pv(m, 'i2'))) * 1000, 3)} mm.`,
  },
  {
    id: 'buckling',
    discipline: 'Structures',
    title: 'Euler buckling of a column',
    ask: 'Plot the Euler buckling load of a steel column against its length, for pinned, fixed and cantilevered ends.',
    builds: 'P_cr = π²EI/(KL)² as a curve over the length, with the effective-length factor K as a control (1 pinned–pinned, 0.5 fixed–fixed, 2 for a flagpole).',
    look: 'Double the length and the load a column can carry before buckling quarters. Fix both ends and it carries four times as much.',
    model: () => ({
      id: 'buckling',
      title: 'Euler buckling',
      domain: 'structures',
      equations: ['P_cr = π² E I / (K L)²'],
      assumptions: ['An ideal straight, slender, elastic column with a centred load. Real columns buckle earlier: imperfections and yield are not in this formula.'],
      params: [param('e', 'Young’s modulus', 200e9, 1e9, 300e9, 'Pa', undefined, 1e9), param('i2', 'second moment of area', 8.333e-6, 1e-7, 1e-4, 'm⁴', undefined, 1e-7), param('kf', 'effective length factor K', 1, 0.5, 2, undefined, '1 pinned–pinned, 0.7 pinned–fixed, 0.5 fixed–fixed, 2 fixed–free.', 0.1)],
      units: { len: 'm' },
      objects: [curve({ id: 'pcr', label: 'critical load', meaning: 'The axial load at which the ideal column buckles.', definition: 'pi^2 * e * i2 / (kf * len)^2', over: { len: [1, 8] }, depends: ['e', 'i2', 'kf'], units: 'N' })],
    }),
    check: (m) => `A 3 m column with these properties buckles at ${sig(curveAt(m, 'pcr', 3) / 1e6, 3)} MN; at 6 m, ${sig(curveAt(m, 'pcr', 6) / 1e6, 3)} MN — a quarter.`,
  },
  {
    id: 'torsion',
    discipline: 'Structures',
    title: 'Shear stress in a shaft',
    ask: 'What diameter does a solid steel shaft need to carry 500 N·m without the shear stress passing 40 MPa?',
    builds: 'The torsion formula for a solid circular shaft, τ = 16T/(πd³), as a curve over the diameter.',
    look: 'Read off where the curve crosses the stress you allow. Because τ goes as 1/d³, a little more diameter buys a lot less stress.',
    model: () => ({
      id: 'torsion',
      title: 'Shaft torsion',
      domain: 'machine design',
      equations: ['τ_max = T r / J = 16 T / (π d³)'],
      assumptions: ['A solid circular shaft in pure torsion, elastic; no stress concentrations, no combined bending.'],
      params: [param('tq', 'torque', 500, 10, 5000, 'N·m', undefined, 10)],
      units: { d: 'm' },
      objects: [curve({ id: 'tau', label: 'peak shear stress', meaning: 'At the surface of the shaft.', definition: '16 * tq / (pi * d^3)', over: { d: [0.01, 0.08] }, depends: ['tq'], units: 'Pa' })],
    }),
    check: (m) => `At 40 mm the engine gives ${sig(curveAt(m, 'tau', 0.04) / 1e6, 3)} MPa; at 50 mm, ${sig(curveAt(m, 'tau', 0.05) / 1e6, 3)} MPa.`,
  },

  // ── thermal and fluids ────────────────────────────────────────────
  {
    id: 'cooling',
    discipline: 'Thermal and fluids',
    title: 'Newton cooling',
    ask: 'A 0.5 kg aluminium part at 200 °C cools in 20 °C air with h = 25 W/m²K over 0.02 m². How long until it is at 50 °C?',
    builds: 'dT/dt = −hA(T − T∞)/(mc) as a one-state system — a lumped body, one temperature throughout.',
    look: 'Against time, the excess temperature falls by e every time constant mc/(hA).',
    model: () => ({
      id: 'cooling',
      title: 'A body cooling',
      domain: 'heat transfer',
      equations: ['m c dT/dt = −h A (T − T∞)'],
      assumptions: ['Lumped capacitance: the body is one temperature throughout (a small Biot number). Constant h; radiation neglected.'],
      params: [param('h', 'heat transfer coefficient', 25, 2, 200, 'W/m²K', undefined, 1), param('area', 'surface area', 0.02, 0.001, 0.5, 'm²', undefined, 0.001), param('mass', 'mass', 0.5, 0.01, 10, 'kg', undefined, 0.01), param('cp', 'specific heat', 900, 100, 5000, 'J/kgK', 'Aluminium is about 900 J/kgK.', 10), param('tinf', 'air temperature', 20, -20, 60, '°C', undefined, 1), param('t0', 'starting temperature', 200, 20, 600, '°C', undefined, 1)],
      units: { temp: '°C' },
      time: { t: 0, min: 0, max: 3600, rate: 60, units: 's' },
      objects: [system({ id: 'body', label: 'The body', meaning: 'Its temperature, integrated.', states: [{ name: 'temp', init: 't0', units: '°C', means: 'temperature' }], rhs: { temp: '0 - h * area * (temp - tinf) / (mass * cp)' }, dt: 1, steps: 4000, depends: ['h', 'area', 'mass', 'cp', 'tinf', 't0'] })],
    }),
    check: (m) => {
      const tau = (pv(m, 'mass') * pv(m, 'cp')) / (pv(m, 'h') * pv(m, 'area'));
      return `The time constant mc/(hA) is ${sig(tau, 3)} s. After it, the engine’s run reads ${sig(stateAt(m, 'temp', tau), 4)} °C; the excess should have fallen to 1/e of 180 °C, which is ${sig(20 + 180 / Math.E, 4)} °C.`;
    },
  },
  {
    id: 'tank',
    discipline: 'Thermal and fluids',
    title: 'A tank draining',
    ask: 'A 1 m² tank holds 2 m of water and drains through a 20 cm² hole in its floor. How long does it take to empty?',
    builds: 'Torricelli: dh/dt = −(a/A)·√(2gh), integrated until the level reaches the floor — the run stops itself there.',
    look: 'Against time the level falls fastest at first; the last half-metre takes as long as the first 1.5 m. The run ends when the tank is empty, and says so.',
    model: () => ({
      id: 'tank',
      title: 'A draining tank',
      domain: 'fluids',
      equations: ['dh/dt = −(a/A) √(2 g h)'],
      assumptions: ['An ideal orifice with no losses (discharge coefficient 1), a free surface much wider than the hole, quasi-steady flow.'],
      params: [param('ta', 'tank area', 1, 0.1, 10, 'm²', undefined, 0.1), param('ha', 'hole area', 0.002, 0.0001, 0.05, 'm²', undefined, 0.0001), param('h0', 'starting level', 2, 0.1, 10, 'm', undefined, 0.1), param('g', 'gravity', 9.81, 1, 25, 'm/s²', undefined, 0.01)],
      units: { h: 'm' },
      time: { t: 0, min: 0, max: 400, rate: 20, units: 's' },
      objects: [system({ id: 'level', label: 'The water level', meaning: 'Height of the surface above the hole.', states: [{ name: 'h', init: 'h0', units: 'm', means: 'water level' }], rhs: { h: '0 - (ha / ta) * sqrt(2 * g * abs(h))' }, dt: 0.05, steps: 20000, stop: '0.0005 - h', depends: ['ta', 'ha', 'h0', 'g'] })],
    }),
    check: (m) => {
      const end = runEnd(m);
      const k = pv(m, 'ta') / pv(m, 'ha');
      const g = pv(m, 'g');
      const toStop = k * (Math.sqrt((2 * pv(m, 'h0')) / g) - Math.sqrt((2 * 0.0005) / g));
      const toEmpty = k * Math.sqrt((2 * pv(m, 'h0')) / g);
      return `The run stops itself ${end.stopped === 'boundary' ? 'when the level is within half a millimetre of the floor' : 'when it runs out of steps'}, at t = ${sig(end.t, 4)} s; Torricelli puts that moment at ${sig(toStop, 4)} s, and the tank empties completely at (A/a)·√(2h₀/g) = ${sig(toEmpty, 4)} s.`;
    },
  },
  {
    id: 'nozzle-area',
    discipline: 'Thermal and fluids',
    title: 'Area–Mach relation in a nozzle',
    ask: 'Plot the isentropic area ratio A/A* against Mach number for air.',
    builds: 'A/A* = (1/M)·[(2/(γ+1))(1 + (γ−1)M²/2)]^((γ+1)/(2(γ−1))) — the relation every converging–diverging nozzle is designed from.',
    look: 'The curve has its minimum, exactly 1, at M = 1: the throat. Every other area ratio has two Mach numbers, one subsonic and one supersonic.',
    model: () => ({
      id: 'nozzle-area',
      title: 'Isentropic area ratio',
      domain: 'compressible flow',
      equations: ['A/A* = (1/M) [(2/(γ+1)) (1 + (γ−1)/2 M²)]^((γ+1)/(2(γ−1)))'],
      assumptions: ['Steady, adiabatic, frictionless (isentropic) flow of a perfect gas; quasi-one-dimensional. Not valid through a shock.'],
      params: [param('gamma', 'ratio of specific heats γ', 1.4, 1.1, 1.67, undefined, 'For air at room temperature, about 1.4.', 0.01)],
      units: { mach: '' },
      objects: [curve({ id: 'ar', label: 'area ratio A/A*', meaning: 'The duct area needed, relative to the throat, to reach each Mach number.', definition: '(1 / mach) * ((2 / (gamma + 1)) * (1 + (gamma - 1) / 2 * mach^2))^((gamma + 1) / (2 * (gamma - 1)))', over: { mach: [0.2, 3.5] }, depends: ['gamma'] })],
    }),
    check: (m) => {
      const e = curveExtremes(m, 'ar', 20000);
      return `The engine evaluates A/A* = ${sig(curveAt(m, 'ar', 2), 5)} at M = 2 (exactly 1.6875 for γ = 1.4), and the minimum ${sig(e.min, 5)} at M = ${sig(e.minAt, 4)}.`;
    },
  },
  {
    id: 'pipe-loss',
    discipline: 'Thermal and fluids',
    title: 'Pressure drop in a pipe',
    ask: 'What is the pressure drop along 10 m of 50 mm pipe carrying water, as the flow speed rises? Use a friction factor of 0.02.',
    builds: 'Darcy–Weisbach, Δp = f·(L/D)·ρv²/2, as a curve over the flow speed.',
    look: 'The loss grows as the square of the speed: twice the flow costs four times the pressure. The friction factor is a value you give — Logos does not compute it from the roughness or the Reynolds number.',
    model: () => ({
      id: 'pipe-loss',
      title: 'Darcy–Weisbach',
      domain: 'fluids',
      equations: ['Δp = f (L/D) ρ v² / 2'],
      assumptions: ['Fully developed flow; the friction factor is given, not derived (for turbulent flow it would come from the Colebrook equation or a Moody chart).'],
      params: [param('f', 'friction factor', 0.02, 0.008, 0.1, undefined, undefined, 0.001), param('len', 'pipe length', 10, 1, 1000, 'm', undefined, 1), param('dia', 'diameter', 0.05, 0.005, 1, 'm', undefined, 0.001), param('rho', 'density', 1000, 1, 2000, 'kg/m³', undefined, 1)],
      units: { v: 'm/s' },
      objects: [curve({ id: 'dp', label: 'pressure drop', meaning: 'Loss along the pipe.', definition: 'f * (len / dia) * rho * v^2 / 2', over: { v: [0, 5] }, depends: ['f', 'len', 'dia', 'rho'], units: 'Pa' })],
    }),
    check: (m) => `At 2 m/s the engine gives ${sig(curveAt(m, 'dp', 2) / 1000, 3)} kPa; at 4 m/s, ${sig(curveAt(m, 'dp', 4) / 1000, 3)} kPa.`,
  },

  // ── aerospace ─────────────────────────────────────────────────────
  {
    id: 'rocket',
    discipline: 'Aerospace',
    title: 'The rocket equation',
    ask: 'Plot the Tsiolkovsky rocket equation: Δv against mass ratio, with the specific impulse as a control.',
    builds: 'Δv = I_sp·g₀·ln(m₀/m_f) as a curve over the mass ratio.',
    look: 'The logarithm is the whole story of rocketry: each extra km/s costs the same multiple of mass, not the same amount.',
    model: () => ({
      id: 'rocket',
      title: 'The rocket equation',
      domain: 'astronautics',
      equations: ['Δv = I_sp g₀ ln(m₀ / m_f)'],
      assumptions: ['One stage, no gravity or drag losses, constant exhaust velocity.'],
      params: [param('isp', 'specific impulse', 300, 50, 500, 's', 'Kerosene and oxygen are around 300 s; hydrogen and oxygen around 450 s.', 1)],
      units: { ratio: '' },
      objects: [curve({ id: 'dv', label: 'Δv', meaning: 'The change in speed the stage can produce.', definition: 'isp * 9.80665 * ln(ratio)', over: { ratio: [1, 15] }, depends: ['isp'], units: 'm/s' })],
    }),
    check: (m) => `With a mass ratio of 10 and I_sp = ${pv(m, 'isp')} s, the engine gives Δv = ${sig(curveAt(m, 'dv', 10), 4)} m/s.`,
  },
  {
    id: 'kepler',
    discipline: 'Aerospace',
    title: 'Orbital period and altitude',
    ask: 'Plot the period of a circular Earth orbit against its altitude.',
    builds: 'Kepler’s third law, T = 2π√(a³/μ), with a = R⊕ + altitude and μ for the Earth, as a curve over the altitude in km.',
    look: 'Low orbit is about ninety minutes; the curve reaches a day at about 35 786 km — geostationary orbit.',
    model: () => ({
      id: 'kepler',
      title: 'Orbital period',
      domain: 'orbital mechanics',
      equations: ['T = 2π √(a³/μ)'],
      assumptions: ['A circular orbit about a spherical Earth, two bodies only.'],
      params: [param('mu', 'μ (Earth)', 398600.4418, 398000, 399000, 'km³/s²', undefined, 0.1)],
      units: { alt: 'km' },
      objects: [curve({ id: 'period', label: 'orbital period', meaning: 'Time for one orbit.', definition: '2 * pi * sqrt((6378.137 + alt)^3 / mu) / 60', over: { alt: [200, 40000] }, depends: ['mu'], units: 'min' })],
    }),
    check: (m) => `At 400 km (the space station’s height) the engine gives ${sig(curveAt(m, 'period', 400), 4)} minutes; at 35 786 km, ${sig(curveAt(m, 'period', 35786) / 60, 4)} hours.`,
  },
  {
    id: 'lift',
    discipline: 'Aerospace',
    title: 'Lift against airspeed',
    ask: 'A light aircraft with a 16 m² wing at C_L = 0.5: plot the lift against airspeed at sea level.',
    builds: 'L = ½·ρ·v²·S·C_L as a curve over the airspeed.',
    look: 'The lift coefficient is an input you supply — the engine does not compute aerodynamics, so it cannot tell you what C_L a wing has. It computes what follows from it.',
    model: () => ({
      id: 'lift',
      title: 'Lift',
      domain: 'aerodynamics',
      equations: ['L = ½ ρ v² S C_L'],
      assumptions: ['C_L is given, not computed: no airfoil analysis, no stall.'],
      params: [param('rho', 'air density', 1.225, 0.3, 1.3, 'kg/m³', undefined, 0.001), param('s', 'wing area', 16, 1, 100, 'm²', undefined, 0.5), param('cl', 'lift coefficient', 0.5, 0, 1.6, undefined, undefined, 0.01)],
      units: { v: 'm/s' },
      objects: [curve({ id: 'l', label: 'lift', meaning: 'The aerodynamic force supporting the aircraft.', definition: '0.5 * rho * v^2 * s * cl', over: { v: [0, 100] }, depends: ['rho', 's', 'cl'], units: 'N' })],
    }),
    check: (m) => `At 70 m/s the engine gives ${sig(curveAt(m, 'l', 70) / 1000, 3)} kN of lift.`,
  },

  // ── chemical and process ──────────────────────────────────────────
  {
    id: 'consecutive',
    discipline: 'Chemical and process',
    title: 'Consecutive reactions A → B → C',
    ask: 'Model A → B → C with k₁ = 0.5/min and k₂ = 0.2/min. When is the intermediate B at its peak?',
    builds: 'Three first-order rate equations, integrated from pure A.',
    look: 'Against time, B rises and falls. It peaks at t* = ln(k₁/k₂)/(k₁ − k₂) — move either rate and watch the peak move.',
    model: () => ({
      id: 'consecutive',
      title: 'Consecutive first-order reactions',
      domain: 'chemical kinetics',
      equations: ['dA/dt = −k₁A', 'dB/dt = k₁A − k₂B', 'dC/dt = k₂B'],
      assumptions: ['Irreversible first-order steps at constant temperature in a well-mixed vessel.'],
      params: [param('k1', 'k₁', 0.5, 0.01, 2, '1/min', undefined, 0.01), param('k2', 'k₂', 0.2, 0.01, 2, '1/min', undefined, 0.01)],
      units: { a: 'mol/L', b: 'mol/L', c: 'mol/L' },
      time: { t: 0, min: 0, max: 40, rate: 1, units: 'min' },
      objects: [system({ id: 'rxn', label: 'The three species', meaning: 'Concentrations, integrated.', states: [{ name: 'a', init: 1, units: 'mol/L', means: 'A' }, { name: 'b', init: 0, units: 'mol/L', means: 'B' }, { name: 'c', init: 0, units: 'mol/L', means: 'C' }], rhs: { a: '0 - k1 * a', b: 'k1 * a - k2 * b', c: 'k2 * b' }, dt: 0.01, steps: 4000, depends: ['k1', 'k2'], observe: { total: 'a + b + c' }, plane: ['a', 'b'] })],
    }),
    check: (m) => {
      const pk = stateMax(m, 'b');
      const k1 = pv(m, 'k1'), k2 = pv(m, 'k2');
      return `The engine’s run peaks at B = ${sig(pk.v, 4)} mol/L at t = ${sig(pk.t, 4)} min; ln(k₁/k₂)/(k₁ − k₂) = ${sig(Math.log(k1 / k2) / (k1 - k2), 4)} min.`;
    },
  },
  {
    id: 'arrhenius',
    discipline: 'Chemical and process',
    title: 'Arrhenius: rate against temperature',
    ask: 'Plot an Arrhenius rate constant from 250 to 500 K with an activation energy of 50 kJ/mol.',
    builds: 'k(T) = A·exp(−Eₐ/(RT)) as a curve over the temperature.',
    look: 'The rule of thumb that a reaction doubles its rate every 10 K is roughly true near room temperature for Eₐ around 50 kJ/mol — read it off the curve.',
    model: () => ({
      id: 'arrhenius',
      title: 'Arrhenius rate',
      domain: 'chemical kinetics',
      equations: ['k = A exp(−Eₐ/(R T))'],
      assumptions: ['A temperature-independent pre-exponential factor and activation energy.'],
      params: [param('pre', 'pre-exponential factor A', 1e10, 1e5, 1e15, '1/s', undefined, 1e5), param('ea', 'activation energy', 50000, 10000, 200000, 'J/mol', undefined, 1000)],
      units: { temp: 'K' },
      objects: [curve({ id: 'k', label: 'rate constant', meaning: 'How fast the reaction goes at each temperature.', definition: 'pre * exp(0 - ea / (8.314462618 * temp))', over: { temp: [250, 500] }, depends: ['pre', 'ea'], units: '1/s' })],
    }),
    check: (m) => `From 300 K to 310 K the engine’s rate constant grows by a factor of ${sig(curveAt(m, 'k', 310) / curveAt(m, 'k', 300), 3)}.`,
  },

  // ── control ───────────────────────────────────────────────────────
  {
    id: 'pd',
    discipline: 'Control',
    title: 'Position control with PD feedback',
    ask: 'A 1 kg mass held at zero by a PD controller with Kp = 25 and Kd = 2. How does it settle? What changes as Kd rises?',
    builds: 'The closed loop m·ẍ = −Kp·x − Kd·ẋ as a two-state system.',
    look: 'The phase portrait shows a stable spiral: it overshoots and rings. Drag Kd past 2√(Kp·m) = 10 and the fixed point becomes a stable node — critically damped, then overdamped, with no overshoot.',
    model: () => ({
      id: 'pd',
      title: 'PD position control',
      domain: 'control',
      equations: ['m ẍ = −K_p x − K_d ẋ'],
      assumptions: ['An ideal actuator: no saturation, no delay, no sensor noise.'],
      params: [param('m', 'mass', 1, 0.1, 10, 'kg', undefined, 0.1), param('kp', 'K_p', 25, 0, 200, 'N/m', undefined, 0.5), param('kd', 'K_d', 2, 0, 40, 'N·s/m', undefined, 0.1), param('x0', 'start offset', 1, -2, 2, 'm', undefined, 0.05)],
      units: { x: 'm', v: 'm/s' },
      time: { t: 0, min: 0, max: 10, rate: 1, units: 's' },
      objects: [system({ id: 'loop', label: 'The closed loop', meaning: 'Position and velocity under feedback.', states: [{ name: 'x', init: 'x0', units: 'm' }, { name: 'v', init: 0, units: 'm/s' }], rhs: { x: 'v', v: '(0 - kp * x - kd * v) / m' }, dt: 0.005, steps: 2000, depends: ['m', 'kp', 'kd', 'x0'], plane: ['x', 'v'] })],
    }),
    check: (m) => `With K_d = ${pv(m, 'kd')} the engine finds a ${restSaid(m)}. With K_d = 14 it finds a ${restSaid(withParam(m, 'kd', 14))}.`,
  },
  {
    id: 'pi-motor',
    discipline: 'Control',
    title: 'Motor speed with PI control',
    ask: 'Hold a motor at 100 rad/s with a PI controller: J = 0.01 kg·m², friction b = 0.1 N·m·s, K = 0.5, Kp = 1, Ki = 5. Does it settle without error?',
    builds: 'Two states — the speed and the integral of its error — under ω̇ = (−bω + K(Kp·e + Ki·z))/J and ż = e = ω_ref − ω.',
    look: 'Against time, the speed rises to 100 rad/s and stays: the integral term removes the steady-state error a proportional controller would leave. The fixed point is at ω = ω_ref exactly.',
    model: () => ({
      id: 'pi-motor',
      title: 'PI speed control',
      domain: 'control',
      equations: ['J ω̇ = −b ω + K (K_p e + K_i z)', 'ż = e = ω_ref − ω'],
      assumptions: ['A linear motor model, no current limit, continuous-time control.'],
      params: [param('jm', 'inertia J', 0.01, 0.001, 1, 'kg·m²', undefined, 0.001), param('bf', 'friction b', 0.1, 0, 1, 'N·m·s', undefined, 0.01), param('km', 'motor gain K', 0.5, 0.01, 5, 'N·m/V', undefined, 0.01), param('kp', 'K_p', 1, 0, 20, 'V·s/rad', undefined, 0.1), param('ki', 'K_i', 5, 0, 50, 'V/rad', undefined, 0.1), param('wr', 'target speed', 100, 0, 300, 'rad/s', undefined, 1)],
      units: { w: 'rad/s', z: 'rad' },
      time: { t: 0, min: 0, max: 5, rate: 1, units: 's' },
      objects: [system({ id: 'drive', label: 'The drive', meaning: 'Speed and the integrated error.', states: [{ name: 'w', init: 0, units: 'rad/s', means: 'speed' }, { name: 'z', init: 0, units: 'rad', means: 'integral of the speed error' }], rhs: { w: '(0 - bf * w + km * (kp * (wr - w) + ki * z)) / jm', z: 'wr - w' }, dt: 0.0005, steps: 10000, depends: ['jm', 'bf', 'km', 'kp', 'ki', 'wr'], plane: ['w', 'z'] })],
    }),
    check: (m) => `The engine finds a ${restSaid(m)}; after 5 s the run reads ${sig(stateAt(m, 'w', 4.99), 5)} rad/s.`,
  },
];

// ════════════════════════════════════════════════════════════════════
// LIVE 3D — geometry described, and measured
// ════════════════════════════════════════════════════════════════════

export interface SceneExample {
  id: string;
  discipline: Discipline;
  title: string;
  /** what to type into the Live 3D line — read exactly as the panel reads it */
  say: string;
  /** what to notice */
  look: string;
}

export const SCENE_EXAMPLES: SceneExample[] = [
  {
    id: 'flywheel-solid',
    discipline: 'Engines',
    title: 'A steel flywheel',
    say: 'a steel cylinder 0.6 m in diameter and 0.1 m tall called flywheel',
    look: 'Its mass is computed from its exact volume and a nominal steel density, which the panel says is a typical value. Type a measured density to replace it.',
  },
  {
    id: 'radial',
    discipline: 'Engines',
    title: 'A radial engine’s layout',
    say: 'a steel cylinder 0.4 m in diameter and 0.3 m tall called crankcase, then an aluminium cylinder 0.12 m in diameter and 0.35 m tall at (0.4, 0.15, 0), rotate it 90 degrees about z, then copy it 6 times around a circle of radius 0.4',
    look: 'Seven cylinders pointing out from the crankcase, each turned to face outward — a layout, with masses, not a working engine: nothing here fires or turns.',
  },
  {
    id: 'spring',
    discipline: 'Mechanisms and vibration',
    title: 'A coil spring',
    say: 'a steel tube x = 0.05*cos(t), y = 0.05*sin(t), z = 0.008*t for t from 0 to 62.83 with tube radius 0.004',
    look: 'Ten turns of 8 mm wire, swept along the helix itself. Its length — and so its volume and mass — is measured along the curve: numerically, and said so. Its stiffness is not computed.',
  },
  {
    id: 'flange',
    discipline: 'Structures',
    title: 'A bolted flange',
    say: 'a steel cylinder 0.3 m in diameter and 0.02 m tall called flange, then a ring of 8 steel cylinders 0.016 m in diameter and 0.06 m tall on the flange with radius 0.12',
    look: 'Eight bolts on a 240 mm bolt circle, resting on the flange: move the flange and they go with it. Their preload, and the joint’s strength, are not computed.',
  },
  {
    id: 'pipe',
    discipline: 'Thermal and fluids',
    title: 'A length of pipe',
    say: 'a steel ring with outer radius 0.05 m and inner radius 0.045 m, 2 m thick',
    look: 'An annulus extruded 2 m: the volume of metal is exact, π(R² − r²)·L, and the mass follows from it.',
  },
  {
    id: 'nozzle',
    discipline: 'Aerospace',
    title: 'A bell nozzle’s contour',
    say: 'revolve r = 0.15 + 0.35*(y - 0.5)^2 for y from 0 to 2',
    look: 'A contour turned about its axis from your own r(y). The panel finds its narrowest radius — the throat — and the area ratios to it. The solid it turns is the shape of the passage the gas fills, not the wall around it, so it is given no material; and no thrust or flow is claimed.',
  },
  {
    id: 'wing',
    discipline: 'Aerospace',
    title: 'A wing from a NACA section',
    say: 'a NACA 2412 aluminium wing with chord 1.5 m and span 4 m',
    look: 'The section computed from the NACA formulas, extruded to the span, with its planform area and aspect ratio. Its lift is not computed — see the lift example above for what follows once C_L is given.',
  },
];
