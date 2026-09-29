// lib/model/solve.ts
//
// WHICH ENGINE RUNS THIS, AND WHAT MAY BE CLAIMED OF THE RESULT.
//
// THE PROBLEM THIS SOLVES. Computation used to be chosen by a switch on an
// object's `kind` inside the compiler (compile.ts): a surface got sampled, a
// trajectory got integrated, and anything else got nothing. That is fine while
// there are five kinds of computation and impossible at fifty — and worse, it
// put the decision inside the thing that draws, so "can this be computed?" could
// only be answered by trying to draw it.
//
// So the decision moves here. A SOLVER declares what it handles, what it needs,
// what it produces and what fidelity that carries; the ROUTER picks one; and the
// answer when nothing fits is a list of what is missing rather than a blank
// picture. Adding a backend — a stiff integrator, a symbolic differentiator, a
// real optimiser, a statistics library behind a network call — is registering a
// solver, and nothing above this file changes.
//
// THE THREE HONEST ANSWERS, and this file is built so there is always exactly
// one of them:
//
//   RUNNABLE     a solver handles it and everything it needs is present.
//   INCOMPLETE   a solver handles it and something is missing — named, in the
//                person's terms, with what supplying it would unlock.
//   UNSUPPORTED  nothing here computes this kind of thing. Said plainly, with
//                what WOULD be needed, rather than a plausible drawing.
//
// CAPABILITY LEVELS are the same honesty applied to a whole model: structural,
// mathematical, computational, dynamic, data-grounded. There is deliberately no
// sixth level awarded by this code — "research-grade" is a judgement about
// methodology, validation and provenance that a function should not hand out.
//
// PURE. Nothing here computes anything itself; it decides what could, and says
// what is stopping it.

import { estimate } from './estimate';
import { readMechanism } from './mechanism';
import { readSystem, type Missing } from './system';
import type { Fidelity, Model, ModelObject } from './schema';

export type SolverKind =
  | 'sampling'      // evaluate an expression over a domain
  | 'ode'           // integrate a state through time
  | 'assembly'      // turn parts into equations, then integrate
  | 'estimation'    // fit a specification to data
  | 'data'          // read and arrange supplied numbers
  | 'symbolic'      // manipulate expressions rather than numbers
  | 'optimisation'
  | 'stochastic'
  | 'graph'
  | 'pde';

export interface Solver {
  id: string;
  label: string;
  kind: SolverKind;
  /** the fidelity a successful run of THIS solver earns */
  produces: Fidelity;
  /** does it handle this object at all */
  handles: (model: Model, o: ModelObject) => boolean;
  /** what is missing before it could run. Empty means runnable. */
  requires: (model: Model, o: ModelObject) => Missing[];
  /** one line for a reader: what it does and by what method */
  method: string;
  /** what it is checked against, where there is such a check */
  checkedAgainst?: string;
  /** present when the solver is an interface with nothing behind it yet */
  future?: true;
}

// ── the solvers that exist ──────────────────────────────────────────

const has = (o: ModelObject, keys: readonly string[]) => keys.some((k) => !!o.defs?.[k]);

export const SAMPLING: Solver = {
  id: 'sample',
  label: 'Expression sampler',
  kind: 'sampling',
  produces: 'model-derived',
  method: 'evaluates the stated expression over a bounded grid or parameter range (lib/model/sample.ts)',
  handles: (_m, o) =>
    ['surface', 'volume', 'curve', 'line', 'ray', 'field', 'plane', 'region', 'boundary', 'mesh'].includes(o.kind),
  requires: (_m, o) => {
    if (o.definition || has(o, ['z', 'f', 'fx', 'fy', 'fz', 'px', 'py', 'pz'])) return [];
    return [{ what: 'an expression to evaluate', unlocks: 'drawing this from the mathematics rather than by hand' }];
  },
  checkedAgainst: 'known closed forms for the benchmark surfaces (test/model-engine)',
};

export const ODE: Solver = {
  id: 'rk4',
  label: 'ODE integrator (RK4)',
  kind: 'ode',
  produces: 'numerically-computed',
  method: 'fourth-order Runge–Kutta at a fixed step, with an optional stopping condition (lib/model/system.ts)',
  handles: (_m, o) => o.kind === 'system' || !!o.system || o.kind === 'trajectory',
  requires: (m, o) => {
    if (o.system) {
      const read = readSystem(m, o);
      return read.ok ? [] : read.missing;
    }
    if (o.kind === 'trajectory') {
      return has(o, ['dx', 'dy'])
        ? []
        : [{ what: 'right-hand sides for the state', unlocks: 'integration' }];
    }
    return [{ what: 'a system declaration: the states and how each one changes', unlocks: 'integration through time' }];
  },
  checkedAgainst:
    'an analytic damped oscillator, the closure of a Keplerian orbit, and energy drift on a conservative system (test/model-dynamics)',
};

export const ASSEMBLY: Solver = {
  id: 'mechanism',
  label: 'Mechanism assembler',
  kind: 'assembly',
  produces: 'numerically-computed',
  method:
    'assembles bodies, springs, dampers and forces into equations of motion, then integrates them with RK4 (lib/model/mechanism.ts)',
  handles: (_m, o) => !!o.mechanism || o.kind === 'component',
  requires: (m, o) => {
    const read = readMechanism(m, o);
    if (!read.ok) return read.missing;
    // ASSEMBLING IS NOT ENOUGH. The parts can be structurally sound and the
    // assembled equations still unreadable: a mass given as `nope` passes every
    // structural check, compiles to nothing, and integrates not at all. Before
    // this line the router called that runnable — so the capability came back
    // `dynamic`, the picture drew nothing, and the model claimed to be
    // integrating. The assembled system is checked against the model that will
    // evaluate it, which is the only check that means anything.
    const usable = readSystem(m, { ...o, system: read.system });
    return usable.ok ? [] : usable.missing;
  },
  checkedAgainst: 'the analytic solution of a single damped oscillator, and energy conservation with damping removed',
};

export const ESTIMATION: Solver = {
  id: 'ols',
  label: 'Least-squares estimator',
  kind: 'estimation',
  produces: 'data-derived',
  method:
    'ordinary least squares on the normal equations, with classical or HC1 standard errors, the within transform for unit effects, and lag construction for a time series (lib/model/estimate.ts)',
  handles: (_m, o) => !!o.estimation || o.kind === 'estimator' || o.kind === 'specification',
  requires: (m, o) => {
    const got = estimate(m, o);
    if (got.ok) return [];
    if ('choice' in got) {
      return [
        {
          what: 'a method, chosen by you',
          unlocks:
            'a fit. The specification decides what the estimate means, so it is not chosen here — the candidates and what each assumes are offered instead',
        },
      ];
    }
    return got.missing;
  },
  checkedAgainst:
    'a known-coefficient synthetic dataset, a textbook worked example, and the identity that within-unit estimates equal dummy-variable estimates (test/model-estimation)',
};

export const DATA: Solver = {
  id: 'data',
  label: 'Data reader',
  kind: 'data',
  produces: 'data-derived',
  method: 'arranges supplied numbers — a grid, a set of points, a series, named columns — without altering them',
  handles: (_m, o) => ['dataset', 'series', 'measurement', 'distribution'].includes(o.kind),
  requires: (m, o) => {
    if (o.data && m.data?.[o.data]) return [];
    if (o.defs || o.definition) return [];
    return [{ what: 'the numbers, as a data block', unlocks: 'showing the data rather than a picture of what it might look like' }];
  },
};

/**
 * Interfaces with nothing behind them yet.
 *
 * DECLARED RATHER THAN OMITTED, on purpose. A router that silently has no
 * optimiser answers "can you optimise this?" by producing nothing, and a reader
 * cannot tell that from a bug. These say what they would take, so the shape of
 * the gap is visible — and any of them becomes real by replacing `future` with a
 * `run`, with nothing above this file changing.
 */
export const FUTURE: Solver[] = [
  {
    id: 'symbolic',
    label: 'Symbolic algebra',
    kind: 'symbolic',
    produces: 'model-derived',
    method: 'would differentiate, simplify and rearrange expressions rather than evaluate them',
    handles: (_m, o) => o.kind === 'equation' && !!o.definition,
    requires: () => [{ what: 'a symbolic backend', unlocks: 'derivatives, simplification and solving for a variable rather than sampling' }],
    future: true,
  },
  {
    id: 'optimise',
    label: 'Constrained optimisation',
    kind: 'optimisation',
    produces: 'numerically-computed',
    method: 'would maximise or minimise an objective subject to the declared constraints',
    handles: (_m, o) => o.kind === 'objective',
    requires: () => [{ what: 'an optimisation backend', unlocks: 'an optimum, its active constraints and its sensitivity' }],
    future: true,
  },
  {
    id: 'monte-carlo',
    label: 'Stochastic simulation',
    kind: 'stochastic',
    produces: 'simulated',
    method: 'would sample a distribution or a stochastic process many times and summarise the ensemble',
    handles: (_m, o) => o.kind === 'distribution' && !!o.uncertainty,
    requires: () => [{ what: 'a stochastic backend and a declared process', unlocks: 'scenario ranges and ensemble statistics' }],
    future: true,
  },
  {
    id: 'pde',
    label: 'Field solver',
    kind: 'pde',
    produces: 'numerically-computed',
    method: 'would solve a partial differential equation over a mesh',
    handles: (_m, o) => o.kind === 'field' && !!o.defs?.pde,
    requires: () => [{ what: 'a PDE backend and a mesh', unlocks: 'heat, waves, flow and fields evolving in space as well as time' }],
    future: true,
  },
];

/** Everything registered, in the order the router considers them. */
export const SOLVERS: Solver[] = [ASSEMBLY, ODE, ESTIMATION, DATA, SAMPLING, ...FUTURE];

// ── routing ─────────────────────────────────────────────────────────

export type Routed =
  | { status: 'runnable'; solver: Solver }
  | { status: 'incomplete'; solver: Solver; missing: Missing[] }
  | { status: 'unsupported'; why: string; wouldNeed: string };

/**
 * Which solver runs this object, and whether it can.
 *
 * Order matters and is deliberate: the more specific declaration wins, so an
 * object carrying a mechanism is assembled rather than sampled even if it also
 * has an expression lying around. A FUTURE solver never reports runnable.
 */
export function route(model: Model, o: ModelObject): Routed {
  for (const s of SOLVERS) {
    if (!s.handles(model, o)) continue;
    const missing = s.requires(model, o);
    if (s.future) {
      return {
        status: 'unsupported',
        why: `${s.label} is an interface here, not an implementation: ${s.method}`,
        wouldNeed: missing[0]?.what ?? 'a backend',
      };
    }
    return missing.length ? { status: 'incomplete', solver: s, missing } : { status: 'runnable', solver: s };
  }
  return {
    status: 'unsupported',
    why: `nothing registered computes a ${o.kind}`,
    wouldNeed: 'a solver that handles this kind of object, registered in lib/model/solve.ts',
  };
}

// ── what a whole model can honestly claim ───────────────────────────

export const LEVELS = [
  'structural',     // 1: it can be represented — objects, relations, meanings
  'mathematical',   // 2: the relationships are stated formally
  'computational',  // 3: something can actually be evaluated
  'dynamic',        // 4: state evolves through time, by integration
  'data-grounded',  // 5: it is connected to supplied observations
] as const;
export type Level = (typeof LEVELS)[number];

export interface Capability {
  level: Level;
  /** what earns that level, by object id */
  because: string[];
  /** the levels it does NOT reach, and what is missing for each */
  short: { level: Level; missing: string }[];
  /** per object: what would run it, and what is stopping it */
  objects: { id: string; label: string; status: Routed['status']; solver?: string; missing?: Missing[] }[];
  /** one sentence a reader can be shown */
  says: string;
}

/**
 * What this model can honestly be said to do.
 *
 * NOT A SCORE AND NOT A BADGE. It is the highest level the model's own contents
 * support, the reason, and the list of what the next level would take — which is
 * the useful half, because a model at level 2 with one missing initial condition
 * is a very different thing from a model at level 2 with no equations.
 *
 * There is no 'research-grade' level here. Whether a model is fit for serious
 * analytical use depends on the methodology, the provenance and the validation,
 * and a function that awarded that would be doing the reviewing.
 */
export function capabilityOf(model: Model): Capability {
  const objects = model.objects.map((o) => {
    const r = route(model, o);
    return {
      id: o.id,
      label: o.label,
      status: r.status,
      ...(r.status !== 'unsupported' ? { solver: r.solver.id } : {}),
      ...(r.status === 'incomplete' ? { missing: r.missing } : {}),
    };
  });

  const runnable = objects.filter((o) => o.status === 'runnable');
  const by = (kind: SolverKind) =>
    runnable.filter((o) => SOLVERS.find((s) => s.id === o.solver)?.kind === kind);

  const stated = model.objects.filter((o) => !!o.definition || !!o.defs || !!o.system || !!o.mechanism);
  const dynamic = [...by('ode'), ...by('assembly')];
  const grounded = by('estimation').length
    ? by('estimation')
    : by('data').filter((o) => {
        const obj = model.objects.find((x) => x.id === o.id);
        return !!obj?.data && !!model.data?.[obj.data];
      });

  let level: Level = 'structural';
  const because: string[] = [];
  if (stated.length) {
    level = 'mathematical';
    because.push(`${stated.length} object${stated.length === 1 ? '' : 's'} state their relationships formally`);
  }
  if (runnable.length) {
    level = 'computational';
    because.push(`${runnable.length} can be computed as declared`);
  }
  if (dynamic.length) {
    level = 'dynamic';
    because.push(`${dynamic.length} evolve${dynamic.length === 1 ? 's' : ''} through time by integration`);
  }
  if (grounded.length) {
    level = 'data-grounded';
    because.push(`${grounded.length} ${grounded.length === 1 ? 'is' : 'are'} connected to supplied data`);
  }

  const short: Capability['short'] = [];
  const at = LEVELS.indexOf(level);
  if (at < LEVELS.indexOf('mathematical')) {
    short.push({ level: 'mathematical', missing: 'no object states an equation, a system or a definition' });
  }
  if (at < LEVELS.indexOf('computational')) {
    const blocked = objects.filter((o) => o.status === 'incomplete');
    short.push({
      level: 'computational',
      missing: blocked.length
        ? blocked.map((b) => `${b.label}: ${b.missing?.map((m) => m.what).join(', ')}`).join('; ')
        : 'nothing here is of a kind that any registered solver computes',
    });
  }
  if (at < LEVELS.indexOf('dynamic')) {
    short.push({ level: 'dynamic', missing: 'no system of differential equations and no mechanism to assemble one from' });
  }
  if (at < LEVELS.indexOf('data-grounded')) {
    short.push({ level: 'data-grounded', missing: 'no object is attached to a data block or a fitted specification' });
  }

  return {
    level,
    because,
    short,
    objects,
    says:
      `This model is ${level}: ${because[because.length - 1] ?? 'it can be represented, and nothing in it is computed yet'}.` +
      (short.length ? ` It is not ${short[0].level}: ${short[0].missing}.` : ''),
  };
}

/**
 * Everything standing between this model and running, in one list.
 *
 * What a surface shows instead of a picture when it cannot compute — see §32 of
 * the brief and `canCompute` in science.ts, which does the same job for values
 * rather than structure.
 */
export function missingStructure(model: Model): { of: string; label: string; missing: Missing[] }[] {
  const out: { of: string; label: string; missing: Missing[] }[] = [];
  for (const o of model.objects) {
    const r = route(model, o);
    if (r.status === 'incomplete') out.push({ of: o.id, label: o.label, missing: r.missing });
  }
  return out;
}

/** The solvers that exist, for a reader asking what this can actually do. */
export function solverTable(): { id: string; label: string; kind: SolverKind; real: boolean; method: string }[] {
  return SOLVERS.map((s) => ({
    id: s.id,
    label: s.label,
    kind: s.kind,
    real: !s.future,
    method: s.method,
  }));
}
