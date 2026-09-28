# The substrate

Logos does not hold a catalogue of simulations. It holds a small set of
primitives, and every model — a black hole, a spring chain, an epidemic, a
regression — is **data** written against them. This document is what those
primitives are, what actually computes, and what is still an interface.

```
SystemModel (lib/model/schema.ts)
    ↓  composable declaration blocks: system, mechanism, estimation, data
COMPUTATION ROUTER (lib/model/solve.ts)
    ↓  which engine, or what is missing, or honestly unsupported
ENGINE            sampler · RK4 integrator · mechanism assembler · least squares
    ↓  computed state
REPRESENTATION    buildSpec chooses the form; panels share the one run
    ↓
MANIPULATION      applyOps → dependency propagation → recomputation
    ↓
CHAT              modelStateFrom: every object, its state, its provenance, its level
```

## The blocks

A `ModelObject` is not forced to be a surface or a trajectory. It carries the
**block** that says what it is, and the router dispatches on the block:

| block | what it declares | engine |
| --- | --- | --- |
| `defs` / `definition` | expressions over a domain | expression sampler |
| `system` | named states, `d(name)/dt` for each, stop condition, observations, an invariant | RK4 (`lib/model/system.ts`) |
| `mechanism` | bodies, springs, dampers, forces | assembler → RK4 (`lib/model/mechanism.ts`) |
| `estimation` | `y`, `x[]`, a data block, and a **method the person chose** | least squares (`lib/model/estimate.ts`) |
| `data` | a grid, points, a series, or named columns | data reader |

Adding a domain means writing a block and registering a solver. It does not mean
a component, a renderer, or a page.

## What the state-space layer unlocked

The old ODE primitive had **four states named x, y, z, w**. That is enough for a
double pendulum and *nothing larger* — three masses on springs (six states), an
SIR model with an invariant, a two-loop circuit could not be expressed at all.
`system.ts` takes any number of named states with their own right-hand sides, so:

- `oscillator` — 1 body, 2 states, checked against the analytic damped solution
- `chain` — 3 bodies, 6 states, **the same code**, no new component
- `epidemic` — 3 compartments, an invariant the integrator is judged by
- `circuit` — the mechanical equation with other names, same integrator

One incidental fix made this possible: the expression tokenizer did not accept
underscores, so `x_m1`, `i_L` and `v_C` were unparseable — and any parameter id
containing an underscore was silently unplottable.

## Mechanisms: parts that assemble themselves

`assemble()` turns bodies, springs, dampers and forces into
`dvᵢ/dt = [Σ springs + Σ dampers + Σ forces] / mᵢ` **symbolically**, so `k₂` stays
the parameter `k₂` into the right-hand side and moving its slider changes the
equations rather than requiring reassembly.

`expand()` then turns each part into a **real ModelObject** with its own kind,
meaning, parameter dependencies and typed relations. That one move is why
selection is semantic with no new UI: a spring is an entity the conversation can
be asked about, a node in the dependency walk, and a thing with provenance —
through machinery that already existed.

A body is drawn at its rest position **plus its computed displacement at the
clock's instant** (interpolated between integrator steps). Nothing moves by a
formula that resembles motion.

## Estimation, and the line it will not cross

`estimate()` fits what the person specified: OLS on the normal equations,
classical or HC1 errors, the within transform for unit effects, lag construction
for a series. Collinear regressors are **refused**, not answered. Rows with
missing values are dropped and reported. Intervals appear only where the degrees
of freedom support the normal approximation. Every fit carries the sentence that a
fitted coefficient is a conditional association.

**With no method declared, nothing is fitted.** The candidates come back with what
each needs, what each commits you to, and what the data appears to be — as
evidence for the person's decision, not as a recommendation. `METHODS` contains no
"recommended". `UNSUPPORTED` names what is absent (instruments, clustered errors,
random effects, unit-root tests, any critical value) so the choice is made knowing
it.

## Capability levels, and the one that is not awarded

`capabilityOf(model)` reports the highest level the model's **own contents**
support: structural → mathematical → computational → dynamic → data-grounded,
with the reason and what the next level would take. There is deliberately **no
research-grade level** a function can hand out; that is a judgement about
methodology and validation, and a function awarding it would be doing the
reviewing.

## Representation earns its form

`chooseRepresentation` decides from the model, and says why:

- a mechanism → **2D**, because perspective would make the near spring longer
- a system → 2D for two states, 3D for three or more, with a projection note
- one regressor → the **fitted line**; several → a **coefficient plot**, because a
  plane through seven regressors shows two and hides five
- a series stays a series; a graph stays a graph

`spec.panels` carries secondary views built from **the same run**, with the clock
as a cursor in each. Not separate integrations that look similar — the test reads
the run directly and compares values.

## What is real, and what is an interface

| solver | status |
| --- | --- |
| expression sampler | real |
| RK4 integrator | real, checked against an analytic oscillator, orbit closure and energy drift |
| mechanism assembler | real, checked against the analytic damped solution |
| least squares (OLS, within, lags, HC1) | real, checked against generated coefficients and the dummy-variable identity |
| data reader | real |
| symbolic algebra | **interface only** — declared so the gap is visible |
| constrained optimisation | **interface only** |
| Monte Carlo / stochastic processes | **interface only** |
| PDE / field solver | **interface only** |

A future solver never reports `runnable`. `route()` returns it as `unsupported`
with what a backend would need.

## What this does not do

- **No PDEs, no optimisation, no stochastic processes, no symbolic calculus.**
  Interfaces exist; nothing is behind them.
- **No topology grammar beyond bodies on a line.** Pendulums, rigid bodies,
  pulleys and linkages are written as `system` blocks directly; a second
  assembler would sit beside the first without changing the integrator.
- **One integrator, fixed step.** No stiff solver, no symplectic integrator, no
  adaptive step. A stiff system will drift, and the invariant readout is how you
  find out.
- **No figure-to-model extraction.** A research figure cannot yet be uploaded and
  structured; the blocks it would produce exist, the reader does not.
- **Econometrics stops at least squares.** See `UNSUPPORTED`.

## Tests

| suite | covers |
| --- | --- |
| `test/model-systems` (210) | n-state systems, the analytic oscillator, energy drift, six-state chains, coupling removal, mechanism placement from computed state, routing, capability levels, OLS against generated coefficients, the within/dummy identity, lag accounting, the method-choice refusal, panels sharing one run |
| `test/model-engine` (236) | the whole library builds, stays inside budget, attributes every primitive, and refuses honestly where it cannot draw |
| `test/physics` (318) | the closed forms and integrators behind the physics models |
