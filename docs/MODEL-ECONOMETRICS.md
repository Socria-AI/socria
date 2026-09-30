# Curriculum-driven architecture: what econometrics exposed

> Do not "teach Logos econometrics" by filling the codebase with econometrics.
> Use econometrics to teach us what the universal modelling system is missing.

The source was a compressed digest of an introductory econometrics text, supplied
as an **engineering document**: eleven computational stages, eighteen chapters
each with an "implication for Logos", a list of cross-cutting commitments, a
thirteen-rung benchmark ladder, and an explicit architecture-requirements list.
It is used here to find holes, not to add features. Nothing below mentions wages,
markets or education outside a test fixture or a comment recording a failure.

## The failure it started from

```
wage = β₀ + β₁·educ + β₂·exper + β₃·exper²
β₀ = 5, β₁ = 2.5, β₂ = 1.2, β₃ = −0.03     (the person's own hypotheses)
```

Reproduced exactly before any change:

```
capability       : mathematical
says             : "nothing in it computes yet … needs observations —
                    wage, educ, exper, exper2 for each case"
response surface : b0 + (b1) * x + (b2) * y + (b3) * exper2
primitives drawn : 0
```

No observations are required to **evaluate** that function. The reason the engine
asked for them was structural: `EstimationDecl.x` was a list of **column names**,
so the only way to say `exper²` was to declare a third, independent regressor
called `exper2` — and nothing could ever bind it, because there is no such
quantity. The surface put `educ` on x and `exper` on y and treated `exper²` as a
quantity to be *held at some value*. There is no value to hold it at: it varies
with the axis it was excluded from.

**`exper²` is not a variable. It is a transformation of `exper`, and the IR had no
way to say so.** Every other symptom — the wrong capability grade, the wrong
readiness message, the empty box — follows from that one gap.

## The taxonomy, and where each concept landed

The digest's chapters map onto four kinds of gap. Only the third and fourth
needed new primitives.

| the book's concept | already in Logos as | verdict |
|---|---|---|
| dependent variable, regressors, parameters, disturbance | `specification` object + `estimation` block; expanded into `variable` / `coefficient` / `residual` objects | existed |
| observations, named columns | `DataBlock.columns` | existed |
| OLS, fitted values, residuals, R², SEs, t | `estimate()` → `Fit` | existed |
| classical vs heteroskedasticity-robust SEs | `robust: true` → HC1; `Fit.se` names the basis | existed |
| the within transform, lagged outcomes | `method: 'ols-fe'` / `'ols-lag'` | existed, as *method flags* — now subsumed by terms |
| operations distinct from models | `Operation`, `route`, `operationsOn`, `plan`, `askFor` | existed — Phase 4 was already met |
| the epistemic ladder | `Origin` × `Fidelity`, earned by the code path | existed, with **one state missing** (below) |
| dependency and invalidation | `affectedBy` | existed, **too broad** (below) |
| representation by structure | `chooseRepresentation` | existed |
| **logs, quadratics, interactions, indicators, lags, differences, demeaning** | *nothing* | **added: terms** |
| **marginal effects, elasticities, turning points** | *nothing* — `rearrange` was a `future` solver returning the string "a symbolic backend" | **added: an expression tree and a differentiator** |
| **time and entity indices** | a column called `C_t` was a *label* | **added: `DataBlock.index`** |
| hypotheses as first-class objects | — | not built |
| IV / 2SLS, identification | — | not built; named unsupported |
| logit / probit / Tobit / selection | — | not built; **now named** unsupported |
| unit roots, cointegration, forecasting | differencing exists as a term | partial; diagnostics not built |

## What was added

### `lib/model/expr.ts` — an expression tree, and a real derivative

`compileExpr` produces a **closure**: evaluable, and structurally opaque. There
was nothing to differentiate. This parses the same grammar (the same closed name
set, the same implicit multiplication, the same normalisation) into a tree, and:

- **`differentiate`** applies the rules. Exact for polynomials, products,
  quotients, chains, logs, exponentials, roots and the trigonometric and
  hyperbolic families. **Refused by name** for `floor`, `ceil`, `round`, `sign`,
  `step`, a remainder and the two-argument functions — because those are flat
  between jumps and undefined at them, and reporting 0 would be true almost
  everywhere and wrong exactly where a model is interesting.
- **`simplify`** folds the identities, so `∂/∂x` of `b0 + b1·x + b2·x²` reads
  `b1 + b2 * 2 * x` rather than
  `0 + (0 * x + b1 * 1) + (0 * x^2 + b2 * (2 * x^1 * 1))`.
- **`print`** goes back into the grammar it came from, so a derivative compiles
  and evaluates through the existing evaluator with no second engine.
- **`rename` and `substitute`** are tree operations. The string trap is real:
  `exper` is a substring of `experience` and `x` appears inside `exp`.

Verified two ways in `test/model-calculus.test.mjs` (85 assertions): symbolically
against the form a person would write, **and numerically against a central
difference of the original**. The second check is the one a plausible-but-wrong
rule cannot survive.

### `lib/model/terms.ts` — a quantity built out of another quantity

One recursive structure covers every transformation the book introduces:

```ts
{ op: 'pow', of: 'exper', by: 2 }
{ op: 'log', of: 'wage' }
{ op: 'interact', with: ['educ', { op: 'indicator', of: 'region', level: 'south' }] }
{ op: 'lag', of: 'c', by: 1, over: 'time' }
{ op: 'diff', of: 'gdp', by: 1, over: 'time' }
{ op: 'demean', of: 'x', over: 'entity' }
```

Terms nest, to a bounded depth. Each carries a **structurally derived id** (so the
same transformation has the same identity across rebuilds and the dependency graph
joins up), a display name, its base quantities, and what it still needs.

**The distinction that does the real work:**

- **Pointwise** terms — `pow`, `log`, `exp`, `sqrt`, `inverse`, `interact` — *are
  expressions*. They evaluate at any values of their inputs, with no data, and
  they differentiate.
- **Over-the-sample** terms — `lag`, `lead`, `diff`, `demean`, `indicator` — are
  relationships between observations. `lag(c, 1)` is not a function of `c`; it is
  `c` at the previous period, and **without an ordering there is no previous
  period**.

That is "model capability ≠ operation readiness" enforced at the level of the
term. It is why the wage equation is evaluable and why
`c = β₀ + β₁·y + β₂·lag(c,1)` honestly is not — the engine says so and does not
fabricate a surface for it.

A lag orders **by the index**, not by the row order: a series handed over shuffled
still lags correctly, and the earliest period comes back `null` rather than 0,
because a lag with no predecessor is *absent* and a zero there is an observation
nobody made.

### `lib/model/derive.ts` — slopes as first-class computed objects

`derive` joins `OPERATIONS`; `CALCULUS` joins the solver registry with
`does: ['derive']`. It is routed, planned, blocked and explained by exactly the
machinery that answers "can this be fitted?" — and it answers **yes on a model
with no data**, because a derivative needs none.

Every relationship with named inputs gains one marginal-effect object per input:

```
∂wage / ∂educ    scalar, constant  = b1              → reads "= 2.5"
∂wage / ∂exper   curve,   varies   = b2 + b3 * 2 * x → 1.2 − 0.06·exper
```

A **constant** slope is a number to read; a **varying** one is a curve. That
difference *is* the content of "a quadratic term makes the marginal effect
nonconstant", and drawing a constant as a flat line would hide it. A slope that
cannot be produced is kept in the model as an object marked unsupported, because
silence about a derivative reads as "there isn't one".

### `DataBlock.index` — what makes an observation locatable

Keyed by **dimension**, not by role, so `time`, `entity`, `firm`, `region` and
`wave` are the same kind of thing and a term names which one it runs over. Values
may be strings, because an entity is usually a name.

### `sampledOver` — a coordinate letter is not an execution identity either

`x`, `y`, `z` were the only names an expression could use, so `Q = 100 − 2P` over
a range of `P` did not compile: the author had to rename their own variable. The
names a shape is sampled over now come from `over`, and **the router and the
compiler read that rule from the same place** — every time those two have kept
their own copy of a rule they have disagreed in silence.

## What was generalised, not added

- **The response surface's axes are the base variables, not the regressors.** One
  line (`decl.x.slice(0, 2)`) was the whole failure. Three regressors over two
  variables is a surface over two variables.
- **Three provenance states per coefficient, not two for the specification.** It
  was "a fit ran" or "nothing has been estimated" — so a coefficient the person
  supplied as a hypothesis was labelled *"a symbol in the specification"*. Now:
  `computation`/`data-derived` when fitted, **`user`/`model-derived` when somebody
  supposed it** (saying explicitly that it carries no standard error, no interval
  and no significance), `equation`/`conceptual` when it is only a symbol. Per
  coefficient, because a model may have some of each. The `fidelity` field was
  absent altogether, so an estimate from data graded *conceptual*.
- **A carrier is reported by what its parts computed.** A specification whose
  response surface evaluates is not a model that "does not compute" — the blocked
  operation is named in the note, and `askFor(model, 'estimate')` still answers
  blocked, which is where that question belongs.
- **An object with its own expression depends on its own expression.** The
  `derived-from` edge is for objects with no mathematics of their own. `∂w/∂educ`
  is `b1`, and moving β₃ was marking it stale. One edge, and it is the difference
  between a dependency graph and a broadcast.
- **The honesty list gained the class it omitted.** Limited dependent variables —
  a whole chapter — were not in `UNSUPPORTED`. A list that omits a class reads as
  coverage.

## The ladder

`test/model-econometrics.test.mjs`, 140 assertions. Every number is checked
against arithmetic done by hand; the unsupported rungs assert that the engine
*says so by name*.

| | rung | verdict |
|---|---|---|
| A | deterministic expression | **WORKS** — sampled, 2D, no data asked for |
| B | simple OLS | **WORKS** — exact recovery of a noiseless line; SEs, R², residuals, fitted values |
| C | multiple regressors | **WORKS** — partial effects exact; perfect collinearity refused. No variance-inflation diagnostic for *near* collinearity |
| D | functional form | **WORKS** — polynomial, log and interaction terms; two axes for three regressors; marginal effects differentiated |
| E | categorical information | **WORKS** — indicators over an index, nested in interactions; a missing level refused with the levels present |
| F | robust inference | **WORKS** — estimator and variance estimator separate; classical and HC1 both real and labelled |
| G | time and lags | **WORKS** — lag/lead/diff over a declared index, ordered by it; the lost first period dropped and reported |
| H | simultaneous solve | **WORKS** — Gaussian elimination with residual validation |
| I | panel / difference in differences | **WORKS** — composed from indicator and interaction terms; **no DiD-specific code exists** |
| J | fixed effects | **WORKS** — the within transform as a term; a unit-constant regressor demeans to zero |
| K | IV / 2SLS | **NOT IMPLEMENTED** — named unsupported |
| L | limited dependent variables | **NOT IMPLEMENTED** — named unsupported |
| M | nonstationary series | **PARTIAL** — the transformations exist; the diagnostics do not |

Rung I is the test of whether the primitives are the right ones: a
difference-in-differences estimate is not a new estimator, it is least squares on
two indicators and their interaction, and it came out to 7.000000 with no code
that knows what a difference in differences is.

## The second failure: a domain is not a dataset

The wage model then reached the live path with terms, computed geometry and
manipulable coefficients — and still said **"education and experience needs
observations"**, and still drew a narrow vertical sheet. Reproduced:

```
says        : "needs observations — wage, education, experience, exper_pow2 …"
surface over: null
sampled over: x ∈ [−3, 3], y ∈ [−3, 3]      ← invented by the engine
box         : ±11.99 on x and y, so the mesh filled a quarter of it
```

Education from minus three to three years, inside a box four times too wide.
**Nothing distinguished a free input from an observed variable.** A regressor was
a column name, so the only way to have values was a dataset — and when the picture
needed a window anyway, the engine invented one instead of asking for the thing it
actually needed.

### Four supply roles, derived from structure

`Quantity.supply` on the symbol table — never declared, for the same reason
fidelity is never declared:

| | | |
|---|---|---|
| `parameter` | used **by** the relationship | β₁ = 2.5. Moving it changes the function |
| `input` | the relationship is evaluated **over** it | education. Needs a **range**. Moving it changes where you are reading |
| `observed` | its values come from a dataset | what ESTIMATE needs and EVALUATE never does |
| `derived` | computed from other objects | the outcome, a fitted coefficient, a slope, a value at a point |

A **fitted** coefficient is `derived` and a **supposed** one is `parameter` — both
are used by the relationship, and the difference that matters is whether you may
move it. A number a fit produced is not yours to drag.

### A domain comes from four stated places, and never from the engine

The object's own window, the specification's `over`, a control of that name, or —
where there are observations — **the range of the data itself**, which is not an
invented window but the extent of what was measured. Absent all four, `SAMPLE` is
`incomplete` and asks:

> *a range for education — education is a FREE INPUT here: the relationship is
> evaluated over it, so it needs a range. It does not need observations; nothing
> has to have been measured for this to be computed.*

### The report is per operation

The status line was a flat list, so the headline was a dataset that only ESTIMATE
wants. It now reads from `plan()`: **EVALUATE is waiting on … ESTIMATE is waiting
on …**, in the operations' own order.

### A free input is a control, and a different kind

`Model.at` is canonical: where each input is standing, saved, undoable, defaulting
to the middle of the stated range (a question about *looking*, not about the
model). The `at` verb joins the edit grammar beside `set`, ModelView gains an
**Inputs** group, and the relationship gains a readout — the value at the point
currently selected, which is the PREDICT operation and what the person asked for
in so many words.

### Three more bugs this exposed

- **A graph is a graph whichever way it says so.** `aspectOf` read `definition`
  only, and a response surface states its mathematics in `defs.z` — so the box was
  made cubic and the surface rendered as a sheet.
- **A slope is a different plot.** ∂wage/∂exper is currency-per-year against
  experience; the surface is currency against education and experience. Sharing
  one box made a 20-unit mesh sit in a 43-unit frame. Slopes are panels now.
- **`derive` does not draw, so it does not vote on whether something can be
  drawn.** A relationship with unbound coefficients is not evaluable and is
  perfectly differentiable — and one runnable operation was masking the other's
  gap, turning "it needs a value for β₀" into "compiles but has a value at fewer
  than two points".

### The acceptance test

`test/model-inputs.test.mjs`, 83 assertions. β₀–β₃ classify as parameters,
education and experience as free inputs, wage and exper² as derived; EVALUATE
needs no dataset; both domains sample; the box fits the mesh; the value at
education 12 / experience 10 is **44**, at β₃ = −0.06 is **41**, and undo restores
it; ESTIMATE stays blocked; nothing observed is invented. Plus the generic
regressions: `z = x + y`, `z = x² + y²`, `z = a·x + b·y` with manipulable a and b,
`y = a·x` with one input, and `z = a·x` with no range — which reports **DOMAIN
REQUIRED**, not observations.

## What remains unsupported, precisely

- **IV / 2SLS and identification.** Needs instrument/endogenous/exogenous roles on
  variables, a first stage, relevance and overidentification diagnostics, rank and
  order conditions.
- **Limited dependent variables.** Needs a variable *type* system (binary, count,
  censored) that constrains estimator choice, a link function, and likelihood
  optimisation. Least squares on a 0/1 outcome runs when explicitly asked for —
  it is the linear probability model, a real choice — and is never selected for
  the person.
- **Hypothesis tests with critical values.** `t` is reported as a ratio with no
  threshold implied; there is no F test, no Wald test, no p-value, no restriction
  object.
- **Unit roots, cointegration, forecasting.** Differencing and lags exist as
  terms. No stationarity diagnostic, no spurious-regression warning, no forecast
  horizon or forecast uncertainty.
- **Clustered, HAC and Driscoll–Kraay standard errors; random effects; GLS; WLS.**
- **The FE variance correction.** A within regression run through `demean` terms
  gives the right coefficients and standard errors that do not account for the
  estimated unit means. `method: 'ols-fe'` does account for them. **The two paths
  disagree, and that is architectural debt, recorded below.**
- **Near-collinearity diagnostics.** Perfect collinearity is refused; a variance
  inflation factor or condition number is not computed.
- **Assumptions as objects.** `Model.assumptions` is still a list of prose. The
  digest asks for exogeneity, homoskedasticity, independence, stationarity and
  exclusion restrictions to be inspectable objects with provenance and per-operation
  relevance. They are not.
- **Symbolic rearrangement.** `rearrange` is still a `future` solver.
  Differentiating an expression and solving one for a variable are different jobs
  and only one is implemented.

## Architectural debt this sprint discovered

1. **Two ways to do a panel.** `method: 'ols-fe'` and a `demean` term both perform
   the within transform, and only the first corrects the degrees of freedom for
   the estimated unit means. The method flags (`ols-fe`, `ols-lag`) are the old,
   less general spelling of what terms now express; they should collapse into
   terms plus a *variance* option, and until they do a model can be written two
   ways that give different standard errors.
2. **`Model.equations` and an object's `equations` block are different things**
   with the same name — one is prose for a reader, the other is solved. The prompt
   now marks the first explicitly, which is a label on a hazard rather than the
   removal of one.
3. **No variable type system.** Nothing records that an outcome is binary, a
   regressor categorical, or a quantity strictly positive. Chapter 17 needs it,
   the indicator term half-implies it, and a log term silently drops non-positive
   rows because there is nowhere to say the quantity cannot be non-positive.
4. **The marginal-effect expander differentiates only relationships with `over`.**
   A quantity defined by an expression with no declared window gets no slopes,
   which is a reasonable default and not a principled one.
5. **`Fit` is not the structured `ComputationResult` the digest asks for.** It
   carries estimates, SEs, residuals, fitted values, R², df, warnings and the
   dropped-row account — but not a status enum, not a covariance matrix, not the
   assumptions used, and not its own dependency list.

## The one-line target, and where we are against it

> A human moves from research question → formal model → assumptions → data →
> operation → computation → diagnostics → visualisation → mutation →
> recomputation, with every epistemic commitment inspectable.

Formal model, operation, computation, visualisation, mutation and recomputation
are real. **Assumptions and diagnostics are the weakest link** — both are prose
where the digest asks for objects — and the research question is, correctly, not
the engine's to hold.
