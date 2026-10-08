// lib/model/dynamics-examples.ts
//
// DYNAMICS AND CHAOS, BUILT BY THE ENGINE — the examples on the docs page of
// that name. Each is a proposal in exactly the form a Logos reply sends, and
// each "check" is the engine's own arithmetic on it: a period, a Lyapunov
// exponent, Feigenbaum's δ out of the map's own superstable cycles, a fixed
// point and its eigenvalues. test/model-map.test.mjs and
// test/model-dynamics-examples.test.mjs hold every number to what is known.

import { feigenbaumOf, mapBehaviour, sectionOf } from './iterate';
import { behaviourOf } from './phase';
import { unpack } from './unpack';
import type { EngineeringExample } from './engineering';
import type { Model, ModelObject } from './schema';

export type Topic = 'Maps and chaos' | 'Flows and attractors';

export interface DynamicsExample extends Omit<EngineeringExample, 'discipline'> {
  topic: Topic;
}

const sig = (v: number, n = 4) => {
  const r = Number(v.toPrecision(n));
  return Object.is(r, -0) ? '0' : String(r).replace(/^-/, '−');
};
const param = (id: string, label: string, value: number, min: number, max: number, means?: string, step?: number) => ({ id, label, value, min, max, ...(means ? { means } : {}), ...(step ? { step } : {}) });
const first = (m: Model, key: 'map' | 'system'): { model: Model; o: ModelObject } | null => {
  const u = unpack(m);
  const o = u.objects.find((q) => !!q[key]);
  return o ? { model: u, o } : null;
};
const mapObject = (id: string, label: string, meaning: string, map: NonNullable<ModelObject['map']>): ModelObject =>
  ({ id, kind: 'system', label, meaning, map, fidelity: 'numerically-computed', provenance: { origin: 'computation', detail: 'the map, stepped exactly' } }) as ModelObject;
const flowObject = (id: string, label: string, meaning: string, system: NonNullable<ModelObject['system']>, depends: string[]): ModelObject =>
  ({ id, kind: 'system', label, meaning, system, depends, fidelity: 'numerically-computed', provenance: { origin: 'computation', detail: 'RK4 on the stated equations' } }) as ModelObject;

export const DYNAMICS: DynamicsExample[] = [
  {
    id: 'logistic',
    topic: 'Maps and chaos',
    title: 'The road to chaos',
    ask: 'A population grows by a factor r each generation but is held back by crowding: x′ = r·x(1 − x). What happens to it as r rises from 2.5 to 4?',
    builds: 'A map — x at the next step from x now — stepped from x = 0.2, with r as a control. Its bifurcation diagram sweeps r across the control’s range: at each of 400 values, 400 steps to settle and 96 kept.',
    look: 'The bifurcation diagram: one value, then two, four, eight — the period doubling faster and faster — and then chaos, broken by windows of order. The dashed line is r now; the Cobweb shows the same orbit as a walk between the graph and the diagonal.',
    model: () => ({
      id: 'logistic',
      title: 'The logistic map',
      domain: 'nonlinear dynamics',
      equations: ['xₙ₊₁ = r·xₙ(1 − xₙ)'],
      assumptions: ['Generations do not overlap; x is the population as a fraction of the most the habitat holds.'],
      params: [param('r', 'growth rate', 3.5, 2.5, 4, 'How much a generation multiplies when there is room.', 0.005)],
      view: 'bifurcation:pop',
      objects: [mapObject('pop', 'The population', 'The fraction of the habitat filled, generation by generation.', { states: [{ name: 'x', init: 0.2, means: 'population, as a fraction' }], next: { x: 'r*x*(1 - x)' }, steps: 400, sweep: 'r' })],
    }),
    check: (m) => {
      const f = first(m, 'map');
      if (!f) return 'not computed';
      const b = mapBehaviour(f.model, f.o);
      const fb = feigenbaumOf(f.model, f.o);
      if (!b || !fb) return 'not computed';
      return `At r = ${sig(m.params[0].value, 3)} ${b.says}. Its cycles of period 1, 2, 4, 8 are superstable at r = ${fb.superstable.slice(0, 4).map((v) => sig(v, 6)).join(', ')} — the second is 1 + √5 — and the ratio of successive gaps reaches ${sig(fb.delta[fb.delta.length - 1], 5)}: Feigenbaum’s δ, 4.6692.`;
    },
  },
  {
    id: 'sine-map',
    topic: 'Maps and chaos',
    title: 'The same cascade in another map',
    ask: 'Take a different hump — x′ = μ·sin(πx) — and sweep μ. Does it go to chaos the same way?',
    builds: 'The sine map, stepped and swept exactly as the logistic map was. Nothing about the logistic map is in it.',
    look: 'Its bifurcation diagram looks like the logistic map’s, and the ratio of its gaps is the same number. That sameness — universality — is why δ is a constant of nature rather than a property of one equation.',
    model: () => ({
      id: 'sine-map',
      title: 'The sine map',
      domain: 'nonlinear dynamics',
      equations: ['xₙ₊₁ = μ·sin(π xₙ)'],
      params: [param('mu', 'height of the hump', 0.85, 0.6, 1, undefined, 0.001)],
      view: 'bifurcation:s',
      objects: [mapObject('s', 'The sine map', 'One hump, of a different shape from the logistic map’s.', { states: [{ name: 'x', init: 0.3 }], next: { x: 'mu*sin(pi*x)' }, steps: 400, sweep: 'mu' })],
    }),
    check: (m) => {
      const f = first(m, 'map');
      const fb = f ? feigenbaumOf(f.model, f.o) : null;
      if (!fb) return 'not computed';
      return `Its superstable cycles sit at μ = ${fb.superstable.slice(0, 4).map((v) => sig(v, 5)).join(', ')}, …, and the ratio of the gaps between them reaches ${sig(fb.delta[fb.delta.length - 1], 5)} — the logistic map’s δ, from a map that shares nothing with it but a single hump.`;
    },
  },
  {
    id: 'henon',
    topic: 'Maps and chaos',
    title: 'A strange attractor',
    ask: 'Show the Hénon map, x′ = 1 − a·x² + y, y′ = b·x, at a = 1.4, b = 0.3.',
    builds: 'A two-state map stepped 4000 times from the origin; its Lyapunov exponents from products of Jacobians along the orbit.',
    look: 'The iterates trace a curved, folded band — zoom in and it is bands within bands. Nearby starts separate (one exponent positive) while areas shrink (their sum is ln b).',
    model: () => ({
      id: 'henon',
      title: 'The Hénon map',
      domain: 'nonlinear dynamics',
      equations: ['xₙ₊₁ = 1 − a xₙ² + yₙ', 'yₙ₊₁ = b xₙ'],
      params: [param('a', 'a', 1.4, 1, 1.4, undefined, 0.005), param('b', 'b', 0.3, 0.1, 0.4, undefined, 0.005)],
      objects: [mapObject('h', 'The Hénon map', 'Stretching and folding of the plane, step by step.', { states: [{ name: 'x', init: 0 }, { name: 'y', init: 0 }], next: { x: '1 - a*x^2 + y', y: 'b*x' }, steps: 4000, sweep: 'a' })],
    }),
    check: (m) => {
      const f = first(m, 'map');
      const b = f ? mapBehaviour(f.model, f.o) : null;
      if (!b?.lyapunov) return 'not computed';
      const B = m.params.find((p) => p.id === 'b')!.value;
      return `Its Lyapunov exponents are ${b.lyapunov.map((v) => sig(v, 3)).join(' and ')} per step: one positive, so nearby starts separate; their sum, ${sig(b.lyapunov[0] + b.lyapunov[1], 4)}, is ln b = ${sig(Math.log(B), 4)}, because every step multiplies area by b.`;
    },
  },
  {
    id: 'lorenz',
    topic: 'Flows and attractors',
    title: 'The Lorenz butterfly, cut',
    ask: 'Integrate the Lorenz system — σ = 10, ρ = 28, β = 8/3 — and show where its path crosses a plane.',
    builds: 'Three states and their rates, integrated by RK4; its fixed points and their eigenvalues; and the Poincaré section — every upward crossing of z through its mean.',
    look: 'The Path is the butterfly in three dimensions. The Poincaré section turns the flow into a map: the crossings fall on thin curves, never repeating. The Inspector lists the three fixed points and their eigenvalues.',
    model: () => ({
      id: 'lorenz',
      title: 'The Lorenz system',
      domain: 'nonlinear dynamics',
      equations: ['ẋ = σ(y − x)', 'ẏ = x(ρ − z) − y', 'ż = xy − βz'],
      params: [param('sigma', 'σ', 10, 1, 20, undefined, 0.1), param('rho', 'ρ', 28, 1, 40, undefined, 0.1), param('beta', 'β', 8 / 3, 1, 4, undefined, 0.01)],
      view: 'section:l',
      objects: [
        flowObject('l', 'The Lorenz system', 'Convection in a layer heated from below, reduced to three modes.', { states: [{ name: 'x', init: 1 }, { name: 'y', init: 1 }, { name: 'z', init: 1 }], rhs: { x: 'sigma*(y - x)', y: 'x*(rho - z) - y', z: 'x*y - beta*z' }, dt: 0.01, steps: 5000, method: 'rk4' }, ['sigma', 'rho', 'beta']),
      ],
    }),
    check: (m) => {
      const f = first(m, 'system');
      if (!f) return 'not computed';
      const b = behaviourOf(f.model, f.o);
      const s = sectionOf(f.model, f.o);
      if (!b || !s) return 'not computed';
      const rho = m.params.find((p) => p.id === 'rho')!.value;
      const beta = m.params.find((p) => p.id === 'beta')!.value;
      const c = Math.sqrt(beta * (rho - 1));
      const side = b.fixed.find((fp) => fp.at[0] > 1);
      return `The engine finds ${b.fixed.length} fixed points; the two wings’ centres sit at (±√(β(ρ − 1)), ±√(β(ρ − 1)), ρ − 1) = (±${sig(c, 4)}, ±${sig(c, 4)}, ${sig(rho - 1, 3)})${side ? `, found at (${side.at.map((v) => sig(v, 4)).join(', ')}) with eigenvalues ${side.eig}` : ''}. The path pierces its plane ${s.primitives[0].p === 'points' ? s.primitives[0].at.length : 0} times in the section.`;
    },
  },
  {
    id: 'predator-prey',
    topic: 'Flows and attractors',
    title: 'Predator and prey',
    ask: 'Rabbits grow at 0.6 a year and are eaten at 0.3 per fox; foxes die at 1 a year and grow at a third per rabbit eaten. Show the cycles.',
    builds: 'Lotka–Volterra as two states and their rates, integrated by RK4; its phase portrait with nullclines and its fixed points.',
    look: 'The Phase portrait: closed orbits around a centre, every one a cycle of boom and bust. The Inspector finds the centre at (d/c, a/b) with eigenvalues ±i√(ad).',
    model: () => ({
      id: 'predator-prey',
      title: 'Predator and prey',
      domain: 'population dynamics',
      equations: ['ẋ = a x − b x y', 'ẏ = c x y − d y'],
      params: [param('a', 'prey growth', 0.6, 0.1, 2, undefined, 0.01), param('b', 'predation', 0.3, 0.05, 1, undefined, 0.01), param('c', 'conversion', 1 / 3, 0.05, 1, undefined, 0.01), param('d', 'predator death', 1, 0.1, 2, undefined, 0.01)],
      view: 'phase:lv',
      objects: [
        flowObject('lv', 'Rabbits and foxes', 'Two populations, one eating the other.', { states: [{ name: 'x', init: 4, means: 'prey' }, { name: 'y', init: 1, means: 'predators' }], rhs: { x: 'a*x - b*x*y', y: 'c*x*y - d*y' }, dt: 0.02, steps: 3000, method: 'rk4' }, ['a', 'b', 'c', 'd']),
      ],
    }),
    check: (m) => {
      const f = first(m, 'system');
      const b = f ? behaviourOf(f.model, f.o) : null;
      if (!b) return 'not computed';
      const v = (id: string) => m.params.find((p) => p.id === id)!.value;
      const centre = b.fixed.find((fp) => fp.at[0] > 0.5);
      return `The engine finds a centre at (${centre ? centre.at.map((x) => sig(x, 4)).join(', ') : '—'}) with eigenvalues ${centre?.eig ?? '—'}; theory puts it at (d/c, a/b) = (${sig(v('d') / v('c'), 4)}, ${sig(v('a') / v('b'), 4)}) with ±i√(ad) = ±${sig(Math.sqrt(v('a') * v('d')), 4)}i.`;
    },
  },
];
