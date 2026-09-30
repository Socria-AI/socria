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
import { solveSystem } from './algebra';
import { namesIn } from './deps';
import { bindings, resolve, symbolTable } from './symbols';
import { readGravity } from './gravity';
import { readMechanism } from './mechanism';
import { expressionOf, marginalOf } from './derive';
import { readSystem, type Missing } from './system';
import { COORDINATES, sampledOver, type Fidelity, type Model, type ModelObject } from './schema';

/**
 * WHAT SOMEBODY WANTS DONE TO A MODEL — as distinct from what the model is,
 * and from which backend would do it.
 *
 * THE FAILURE THIS ANSWERS. Asked for a wage equation with β₁ and β₂ set to
 * hypothetical values, Logos built the model correctly, refused to pretend it
 * had been estimated — correctly — and then drew NOTHING, announcing "nothing
 * in it computes yet".
 *
 * That was wrong, and the wrongness was architectural. `capabilityOf(model)`
 * and `missingStructure(model)` asked ONE question — "can this model compute?"
 * — and a specification's one registered operation is `estimate`, which needs
 * observations. So a missing dataset blocked the entire model, including the
 * part of it that had nothing to do with data: β₀ + β₁·education + β₂·experience
 * is an ordinary expression, and the sampler sitting right there would have
 * evaluated it (`handles: true, requires: []`, verified) had anything asked.
 *
 * NOT ESTIMATED DOES NOT MEAN NOT COMPUTABLE. A model can be unestimated and
 * evaluable, unsimulatable and visualisable, incomplete and representable. So
 * capability is asked PER OPERATION, and one model may be blocked for one and
 * runnable for another at the same time.
 *
 * The same distinction outside econometrics: a symbolic dynamical system is
 * visualisable and not simulatable while its initial conditions are missing; an
 * objective is visualisable and not optimisable with no backend; a PDE is
 * representable and not solvable without boundary conditions.
 */
export const OPERATIONS = [
  /** work out the value of what is written, from the values that are there */
  'evaluate',
  /**
   * differentiate what is written, and get a slope.
   *
   * A DISTINCT OPERATION, not a flavour of evaluate, and the econometrics digest
   * is the reason it is here: from chapter 6 on, a quadratic term exists so that
   * a marginal effect is NOT a coefficient and an interaction exists so that an
   * effect is not a single number. Both are questions about a derivative, and a
   * system that can only evaluate can answer neither. It needs no observations —
   * a derivative is a fact about the expression — which is exactly why it must
   * not be lumped in with `estimate`.
   */
  'derive',
  /** run it forward through time */
  'simulate',
  /** fit it to supplied observations */
  'estimate',
  /** arrange supplied numbers as they are */
  'read',
  /** find the best point subject to what constrains it */
  'optimise',
  /** find the values that satisfy a set of equations at once */
  'solve',
  /** rearrange the mathematics rather than compute with it */
  'rearrange',
] as const;
export type Operation = (typeof OPERATIONS)[number];

export const OPERATION_SAYS: Record<Operation, string> = {
  evaluate: 'work out what the model says, from the values it has',
  derive: 'differentiate what it says, and get a slope',
  simulate: 'run it forward through time',
  estimate: 'fit it to observations',
  read: 'show the supplied numbers as they are',
  optimise: 'find the best point subject to the constraints',
  solve: 'find the values that satisfy the equations at once',
  rearrange: 'manipulate the expressions symbolically',
};

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
  /**
   * WHICH OPERATIONS THIS SOLVER OFFERS.
   *
   * A solver may offer more than one, and more importantly ONE OBJECT MAY BE
   * CLAIMED BY DIFFERENT SOLVERS FOR DIFFERENT OPERATIONS — which is the whole
   * point. A specification is `estimate`d by least squares and `evaluate`d by
   * the sampler, and asking about the wrong one is what made a model with two
   * hypothetical coefficients report that nothing in it computed.
   */
  does: readonly Operation[];
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
  does: ['evaluate'],
  id: 'sample',
  label: 'Expression sampler',
  kind: 'sampling',
  produces: 'model-derived',
  method: 'evaluates the stated expression over a bounded grid or parameter range (lib/model/sample.ts)',
  handles: (_m, o) =>
    ['surface', 'volume', 'curve', 'line', 'ray', 'field', 'plane', 'region', 'boundary', 'mesh'].includes(o.kind),
  requires: (m, o) => {
    // A SHAPE READ OFF DATA NEEDS NO EXPRESSION. The compiler has always drawn
    // a surface from a grid of measurements; the router did not know, so it
    // reported such an object `incomplete` — invisible until the compiler
    // started asking the router before drawing, at which point a perfectly
    // good data grid stopped being drawn at all. The router must know what the
    // compiler can do, or one of them is wrong about the same object.
    if (o.data && m.data?.[o.data]) return [];
    const wrote = o.definition || has(o, ['z', 'f', 'fx', 'fy', 'fz', 'px', 'py', 'pz']);
    if (!wrote) {
      return [{ what: 'an expression to evaluate', unlocks: 'drawing this from the mathematics rather than by hand' }];
    }
    // AN EXPRESSION IS ONLY EVALUABLE IF ITS NAMES CAN BE BOUND, and this only
    // checked that an expression EXISTED. So a wage surface written as
    // β₀ + β₁·education + β₂·experience with β₀ never given a value came back
    // `runnable`, and every height on it was NaN — the exact remaining degree
    // of freedom somebody asked to have named, reported instead as ready.
    //
    // The axes are bound by the sampler and the clock by the model; everything
    // else must be a quantity the symbol table has a value for. Asked through
    // the table rather than against a hand-built set, so that "what may be
    // evaluated" is decided in the same place as "what the scope contains".
    //
    // The previous version listed params and objects-with-a-numeric-`value`,
    // which is a THIRD spelling of the binding rule and disagreed with both of
    // the others — an object whose value lived on `meta` or `defs` counted as
    // unbound here and as bound in the scope, or the reverse.
    // ── A NAMED INPUT NEEDS A DOMAIN, AND NOBODY MAY INVENT ONE ─────
    //
    // `meta.axes` records that this object's coordinates stand for NAMED
    // quantities: `x` is education, `y` is experience. A window the engine picks
    // is a reasonable rendering default for an anonymous coordinate and is a
    // MODELLING DECISION for a named quantity — and taken silently it produced a
    // wage surface over education from minus three to three years, inside a box
    // four times wider than the mesh in it.
    //
    // So the range is asked for, by name, as a DOMAIN. Never as observations:
    // evaluating a function over a range of education and estimating its
    // coefficients from measurements of education are different operations, and
    // only the second needs a dataset.
    const named = typeof o.meta?.axes === 'string' ? String(o.meta.axes).split(',').map((n) => n.trim()) : [];
    if (named.length) {
      const letters = ['x', 'y', 'z'];
      const noRange = named
        .map((label, i) => ({ label, letter: letters[i] }))
        .filter(({ letter }) => letter && !o.over?.[letter]);
      if (noRange.length) {
        return noRange.map(({ label }) => ({
          what: `a range for ${label}`,
          because:
            `${label} is a FREE INPUT here: the relationship is evaluated over it, so it needs a range — ` +
            `say what values of ${label} are worth looking at. It does not need observations; nothing has to have been measured for this to be computed.`,
          unlocks: `evaluating the relationship over ${named.join(' and ')}, which needs no data at all`,
        }));
      }
    }

    const table = symbolTable(m);
    // THE SAMPLER'S OWN VARIABLES, which include whatever the model called them.
    // A fixed set of coordinate letters here meant `Q = 100 − 2P` over a range of
    // P was reported as needing "something called p" — a demand for a value for
    // the very quantity the curve varies. The router and the compiler read the
    // same rule from the same place now (schema.ts sampledOver), because every
    // time those two have kept their own copy they have disagreed in silence.
    const axes = new Set([
      ...COORDINATES,
      ...sampledOver(o, 1, []),
      ...sampledOver(o, 2, []),
    ]);
    const mentioned = new Set<string>();
    for (const e of [o.definition, ...Object.values(o.defs ?? {})]) {
      for (const n of namesIn(e)) if (!axes.has(n)) mentioned.add(n);
    }
    const gaps: Missing[] = [];
    for (const n of mentioned) {
      const q = resolve(table, n);
      if (q && q.value !== undefined) continue;
      // A NAME WITH NOTHING BEHIND IT AT ALL is different from a quantity the
      // model knows and has not been given a value, and the sentence says which.
      gaps.push(
        q
          ? {
              what: `a value for ${q.display}${q.display === q.id ? '' : ` (${q.id})`}`,
              unlocks: `evaluating ${o.label} — the model has this quantity and nothing has given it a number`,
            }
          : {
              what: `something called ${n}`,
              unlocks: `evaluating ${o.label} — the expression mentions it and this model has no such quantity`,
            }
      );
    }
    return gaps;
  },
  checkedAgainst: 'known closed forms for the benchmark surfaces (test/model-engine)',
};

export const ODE: Solver = {
  does: ['simulate'],
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
  does: ['simulate'],
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

export const GRAVITY: Solver = {
  does: ['simulate'],
  id: 'nbody',
  label: 'Gravitational assembler',
  kind: 'assembly',
  produces: 'numerically-computed',
  method:
    'writes the pairwise Newtonian accelerations of every body symbolically, then integrates the resulting state system with RK4 (lib/model/gravity.ts)',
  handles: (_m, o) => !!o.gravity,
  requires: (m, o) => {
    // ASKED OF THE THING THAT UNDERSTANDS IT. Before this solver existed, a
    // gravitating system was routed by ODE — because expandGravity patches an
    // assembled `system` onto the carrier — and ODE could only speak about the
    // assembled equations. A body whose mass was unreadable came back as "a
    // readable expression for dvx0/dt: the one given did not compile", which
    // is the internal name of a state nobody wrote, handed to somebody who
    // mistyped a mass. readGravity says "a mass for body b" instead.
    const read = readGravity(m, o);
    if (!read.ok) return read.missing;
    // Assembling is not enough — the same check ASSEMBLY makes, and for the
    // same reason: parts can be structurally sound and the assembled system
    // still unevaluable.
    const usable = readSystem(m, { ...o, system: read.system });
    return usable.ok ? [] : usable.missing;
  },
  checkedAgainst:
    'a circular two-body orbit closing on itself, and energy and momentum conservation over a full period (test/model-systems)',
};

export const ALGEBRA: Solver = {
  does: ['solve'],
  id: 'linear',
  label: 'Linear system solver',
  kind: 'symbolic',
  produces: 'model-derived',
  method:
    'reads each equation into a row by evaluating it at the unit vectors, checks it really is linear, then solves by Gaussian elimination with partial pivoting and validates the residual (lib/model/algebra.ts)',
  handles: (_m, o) => !!o.equations,
  requires: (m, o) => {
    const decl = o.equations!;
    const got = solveSystem(decl.relations, decl.unknowns, bindings(symbolTable(m)));
    if (got.status === 'solved' || got.status === 'overdetermined-consistent') return [];
    // EACH OUTCOME IS A DIFFERENT THING TO TELL SOMEBODY, and flattening them
    // into "it did not work" is what a refusal must never do. An
    // underdetermined system needs one more relationship; an inconsistent one
    // needs a relationship REMOVED or corrected; a nonlinear one needs a
    // backend this engine does not have.
    return [
      {
        what:
          got.status === 'underdetermined'
            ? `one more relationship — ${got.says}`
            : got.status === 'inconsistent'
              ? `the equations to agree — ${got.says}`
              : got.status === 'nonlinear'
                ? `a nonlinear solver — ${got.says}`
                : got.says,
        unlocks: 'the values that satisfy all of them at once, and everything derived from those',
      },
    ];
  },
  checkedAgainst:
    'systems with a known closed-form answer, a rank-deficient system, a contradictory one and a nonlinear one (test/model-algebra)',
};

/**
 * Differentiation, by the rules, over the expression tree.
 *
 * REGISTERED LIKE ANY OTHER SOLVER, which is the point: `derive` goes through
 * `route`, `operationsOn`, `plan` and `askFor` exactly as `evaluate` and
 * `estimate` do, so "what is ∂wage/∂exper?" is answered by the same readiness
 * machinery that answers "can this be fitted?" — and answered YES on a model
 * with no data, because a derivative needs none.
 *
 * It is `kind: 'symbolic'`, and it is the first solver of that kind that is not
 * `future: true`. The `rearrange` entry beside it still is: differentiating an
 * expression and solving one for a variable are different jobs, and only one of
 * them is implemented.
 */
export const CALCULUS: Solver = {
  does: ['derive'],
  id: 'differentiate',
  label: 'Symbolic differentiator',
  kind: 'symbolic',
  produces: 'model-derived',
  method:
    'parses the expression into a tree and applies the derivative rules to it — exact where a derivative exists, and refused by name where one does not, which is the case for floor, sign, round, a remainder and the two-argument functions (lib/model/expr.ts)',
  handles: (_m, o) => !!expressionOf(o) && !!o.over,
  requires: (m, o) => {
    const axes = ['x', 'y', 'z'].filter((k) => !!o.over?.[k]);
    const bad: Missing[] = [];
    for (const axis of axes) {
      const got = marginalOf(m, o, axis);
      if (!got.ok) {
        bad.push({
          what: 'a differentiable expression',
          because: got.why,
          unlocks: 'the marginal effect — how much the outcome moves per unit of that input',
        });
      }
    }
    return bad;
  },
  checkedAgainst:
    'derivatives worked out by hand for polynomials, logs, products, quotients, chains and interactions, and named refusals for the step functions (test/model-calculus)',
};

export const ESTIMATION: Solver = {
  does: ['estimate'],
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
  does: ['read'],
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
    does: ['rearrange'],
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
    does: ['optimise'],
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
    does: ['simulate'],
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
    does: ['simulate'],
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
/**
 * Everything registered, in the order the router considers them.
 *
 * ORDER IS THE MORE SPECIFIC DECLARATION FIRST. A carrier holding a `gravity`
 * or `mechanism` block also holds the `system` its expander assembled, so a
 * later ODE entry would happily claim it — and then answer every question
 * about it in terms of the assembled state names rather than the bodies and
 * springs the person actually wrote.
 */
// ORDER IS THE ANSWER TO "WHAT IS THE BEST THING ANY SOLVER CAN DO WITH THIS?",
// which is what `route` returns when no operation is named — so CALCULUS sits
// AFTER SAMPLING. Put earlier, it claimed every expression-bearing object and the
// build report read "Symbolic differentiator runs spec__response" for a surface
// that the sampler had evaluated. Differentiating a relationship is a secondary
// thing to do with it; working out what it says is the primary one.
export const SOLVERS: Solver[] = [ALGEBRA, GRAVITY, ASSEMBLY, ODE, ESTIMATION, DATA, SAMPLING, CALCULUS, ...FUTURE];

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
export function route(model: Model, o: ModelObject, operation?: Operation): Routed {
  for (const s of SOLVERS) {
    // ASKED ABOUT ONE OPERATION AT A TIME, when the caller names one. Without
    // this, the first solver that claims the object answers for every question
    // about it — so "can this be evaluated?" was answered by the estimator
    // saying "I have no data", and a model whose deterministic component the
    // sampler would have computed went dark. Omitting the operation keeps the
    // old meaning: the best thing any solver can do with it.
    if (operation && !s.does.includes(operation)) continue;
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
    why: operation
      ? `nothing registered ${operation}s a ${o.kind}`
      : `nothing registered computes a ${o.kind}`,
    wouldNeed: 'a solver that handles this kind of object, registered in lib/model/solve.ts',
  };
}

/**
 * EVERY OPERATION THIS OBJECT SUPPORTS, and what each one is waiting for.
 *
 * The honest full answer, and the one a reader actually wants: not "can this
 * compute" but "what can be done with this, and what would each take". A
 * specification with hypothetical coefficients comes back here as
 * `evaluate: runnable` and `estimate: incomplete, needs observations` — two
 * true statements about one object that the single-verdict `route` could only
 * ever give one of.
 */
export function operationsOn(model: Model, o: ModelObject): { operation: Operation; routed: Routed }[] {
  const out: { operation: Operation; routed: Routed }[] = [];
  for (const op of OPERATIONS) {
    if (!SOLVERS.some((s) => s.does.includes(op) && s.handles(model, o))) continue;
    out.push({ operation: op, routed: route(model, o, op) });
  }
  return out;
}

/**
 * What the model as a whole can do, per operation.
 *
 * `plan(model)` is the capability planner the brief asks for: for THIS model,
 * for EACH operation, what runs, what is blocked and on what. Nothing here
 * collapses to one yes or no, because the collapse is what produced an empty
 * picture beside a correctly built model.
 */
export interface OperationPlan {
  operation: Operation;
  says: string;
  /** objects a solver would run right now */
  runnable: { of: string; label: string; solver: string }[];
  /** objects a solver understands and cannot run yet, with what is missing */
  blocked: { of: string; label: string; solver: string; missing: Missing[] }[];
}

/**
 * Can this model be <operation>ed, and if not, what would it take?
 *
 * ALWAYS ANSWERS, which `plan` deliberately does not: `plan` lists the
 * operations that are live for a model, and an operation no solver can attempt
 * is simply absent from it. That silence is the empty-cube problem one level
 * up — asked to simulate a specification, the planner listed `evaluate` and
 * `estimate` and said nothing at all about simulation, so "can you run this
 * forward?" had no answer rather than an honest no.
 *
 * Three verdicts, and the third is the one that was missing: nothing here does
 * this to a model shaped like that, with what the model would need to acquire.
 */
export function askFor(
  model: Model,
  operation: Operation
): { operation: Operation; status: 'runnable' | 'blocked' | 'unsupported'; says: string; missing: Missing[] } {
  const runnable: string[] = [];
  const blocked: { label: string; missing: Missing[] }[] = [];
  for (const o of model.objects) {
    const r = route(model, o, operation);
    if (r.status === 'runnable') runnable.push(o.label);
    else if (r.status === 'incomplete') blocked.push({ label: o.label, missing: r.missing });
  }
  if (runnable.length) {
    return {
      operation,
      status: 'runnable',
      says: `${OPERATION_SAYS[operation]}: ${runnable.join(', ')}.`,
      missing: [],
    };
  }
  if (blocked.length) {
    return {
      operation,
      status: 'blocked',
      says: `${OPERATION_SAYS[operation]} — not yet: ${blocked
        .map((b) => `${b.label} needs ${b.missing.map((x) => x.what).join(', ')}`)
        .join('; ')}.`,
      missing: blocked.flatMap((b) => b.missing),
    };
  }
  // NOTHING IN THE MODEL IS EVEN A CANDIDATE. Said with what such a model would
  // have to contain, because "no" without that is indistinguishable from a bug.
  const need = NEEDS[operation];
  return {
    operation,
    status: 'unsupported',
    says: `Nothing in this model can be ${operation}d: ${need}`,
    missing: [{ what: need, unlocks: OPERATION_SAYS[operation] }],
  };
}

/**
 * What a model would have to contain for an operation to be attemptable.
 *
 * Structural, not a list of nouns: "a law saying how something changes" rather
 * than "a mechanism or a gravity block", because the answer has to stay true as
 * the substrate grows.
 */
const NEEDS: Record<Operation, string> = {
  evaluate: 'an expression, or a shape read off supplied numbers',
  derive:
    'a relationship written as an expression, and the inputs to take the slope with respect to. NOT observations: a derivative is a fact about the expression, so a quadratic whose coefficients somebody supplied as hypotheses has a marginal effect whether or not anything was ever measured',
  simulate:
    'a law saying how something CHANGES — states and their rates, parts that push and pull, or bodies that attract. A specification relating quantities at one moment is not one: it says what goes with what, not what follows what',
  estimate: 'a specification and observations to fit it to',
  read: 'supplied numbers, as a data block',
  optimise: 'an objective to maximise or minimise, and the constraints on it',
  solve: 'a set of equations and the unknowns to solve them for — quantities related to each other, rather than one written in terms of the rest',
  rearrange: 'an equation stated symbolically, and a symbolic backend — which is declared here and not implemented',
};

export function plan(model: Model): OperationPlan[] {
  const out: OperationPlan[] = [];
  for (const op of OPERATIONS) {
    const runnable: OperationPlan['runnable'] = [];
    const blocked: OperationPlan['blocked'] = [];
    for (const o of model.objects) {
      const r = route(model, o, op);
      if (r.status === 'runnable') runnable.push({ of: o.id, label: o.label, solver: r.solver.label });
      else if (r.status === 'incomplete') {
        blocked.push({ of: o.id, label: o.label, solver: r.solver.label, missing: r.missing });
      }
    }
    if (!runnable.length && !blocked.length) continue;
    out.push({
      operation: op,
      runnable,
      blocked,
      says: runnable.length
        ? `${OPERATION_SAYS[op]}: ${runnable.length} object${runnable.length === 1 ? '' : 's'} ready${
            blocked.length ? `, ${blocked.length} waiting on ${blocked[0].missing[0]?.what ?? 'something'}` : ''
          }`
        : `${OPERATION_SAYS[op]}: blocked — ${blocked
            .map((b) => `${b.label} needs ${b.missing.map((x) => x.what).join(', ')}`)
            .join('; ')}`,
    });
  }
  return out;
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
 * The objects that STATE A RELATIONSHIP FORMALLY.
 *
 * ONE LIST, EXPORTED, because two copies of it disagreed and the disagreement
 * was a bug somebody had to find twice. `capabilityOf` used it to decide
 * whether a model reaches `mathematical`, and `buildProposal` needs the same
 * test to decide whether a proposal is a model at all — and the first copy
 * listed definitions, defs, systems and mechanisms while the second also
 * counted specifications and gravitating bodies. So a wage equation built, and
 * then reported itself as `structural`: the on-ramp thought it was formally
 * stated and the capability ladder did not.
 *
 * A DECLARATION IS A FORMAL STATEMENT. `estimation` says what explains what;
 * `gravity` says what pulls on what; `system` says what changes how; a
 * `definition` or `defs` says what equals what. All four are mathematics
 * written down, and none of them needs to compute to be one — which is the
 * distinction the whole `mathematical` level exists to draw.
 */
export function statedFormally(model: Model): ModelObject[] {
  // EVERY DECLARATION BLOCK, AND `equations` WAS MISSING FROM THIS LIST.
  //
  // What that cost, measured: a system of four relations with only three of them
  // written down — a person halfway through building one — had no runnable
  // solver and no formal statement either, so buildProposal refused it outright
  // ("nothing in it is stated formally, and nothing in it can be computed yet")
  // and revalidate DESTROYED it on reload. The same defect a specification had
  // before "a specification is a model before it is fitted", repeated one
  // declaration later: a system of equations is a model before it is solvable,
  // and an underdetermined one is exactly the model whose missing relationship
  // the engine should be naming.
  return model.objects.filter(
    (o) =>
      !!o.definition ||
      !!o.defs ||
      !!o.system ||
      !!o.mechanism ||
      !!o.estimation ||
      !!o.gravity ||
      !!o.equations
  );
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

  const stated = statedFormally(model);
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
export function missingStructure(
  model: Model,
  operation?: Operation
): { of: string; label: string; missing: Missing[] }[] {
  const out: { of: string; label: string; missing: Missing[] }[] = [];
  for (const o of model.objects) {
    const r = route(model, o, operation);
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
