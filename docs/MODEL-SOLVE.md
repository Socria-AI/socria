# Solving a system of equations

> A system of equations is not a picture. If Logos claims to compute a model,
> the equations must actually run. And the number of variables does not
> determine the number of visual dimensions.

## The failure

```
Qd = 120 - 2Pc
Qs = -20 + 3Pp
Pc = Pp + t,   t = 10
Qd = Qs
```

Four relationships that determine four unknowns exactly. Logos kept the
equations, made the five controls, graded the model, and drew **an empty 3D
Cartesian cube** captioned *"drawn to make the idea legible, not computed."*

No equilibrium. No curves. No prices.

Reproduced before any change (`test/model-algebra.test.mjs`, *the failure, as it
was*):

```
choice        : surface3d, 3 dimensions
primitives    : 0
fidelity      : conceptual
```

Three separate defects produced that one box.

### 1. There was no algebra

`SOLVERS` carried a `symbolic` entry marked `future: true` whose `requires()`
returned the string *"a symbolic backend"*. That was the whole of the engine's
algebra. Nothing anywhere attempted to solve anything. `solve` was not even one
of the operations the router knew about.

### 2. The equations were not in the model

There was no place to put them. A `system` block held differential equations; a
`mechanism` held parts; an `estimation` held a specification. Simultaneous
algebraic relations had no representation, so they survived only as prose inside
labels — which meant representation selection could not see them, the router
could not route them, and the dependency graph could not reach them.

### 3. Representation was chosen from object kinds

`chooseRepresentation` asked what kinds of object the model contained. It found
`surface`, and a surface is the one shape three dimensions exist for. So the
choice was made from a label, by a function that had never been told there were
equations, and the surfaces themselves had no expression to evaluate — hence
three dimensions of nothing.

## What exists now

### The backend: `lib/model/algebra.ts`

A real linear solver, in real code. Nothing in it asks a language model for
arithmetic.

**Reading an equation into a row, without a computer-algebra system.** A linear
expression is by definition `e(x) = k + Σ cᵢxᵢ`, so its coefficients can be read
off by *evaluating* it — which the engine already knows how to do:

```
k  = e(0, 0, …, 0)
cᵢ = e(eᵢ) − k
```

**Linearity is checked, not assumed.** If `e` is linear then `e(2eᵢ) − k = 2cᵢ`
and `e(eᵢ + eⱼ) − k = cᵢ + cⱼ`. A square, a product of two unknowns, a sine or a
reciprocal fails one of those, and the solver refuses by name — *"`x * y = 10`
has x and y multiplied together, and this solver does linear systems"* — rather
than returning a confident wrong row.

**Gaussian elimination with partial pivoting**, then the residual `‖Ax − b‖∞`
measured against the original rows. Six outcomes, because each is a different
thing to tell somebody:

| status | what it means | what it asks for |
|---|---|---|
| `solved` | exactly one answer | — |
| `overdetermined-consistent` | extra equations that agree | — |
| `underdetermined` | fewer independent relations than unknowns | one more relationship, naming which unknown is free |
| `inconsistent` | the equations contradict | a relationship removed or corrected |
| `nonlinear` | outside this backend | a backend this engine does not have |
| `invalid` | not an equation, or the elimination did not converge | — |

**Tolerances are scaled, not absolute**: `max(1e-12, magnitude · 1e-10)`. A
market in whole currency units and a circuit in microamps cannot share a fixed
epsilon, and a fixed one silently calls a real coefficient zero in the second
case.

### The IR: `EquationsDecl`

```ts
equations?: {
  unknowns: string[];              // what to solve for
  relations: string[];             // each one `left = right`
  units?: Record<string, string>;  // what each unknown is measured in
  about?: string;                  // free text; the solver never branches on it
}
```

Sanitised like every other input: relations must contain `=`, unknowns must be
legal identifiers, both or neither, capped.

**Knowns come from the symbol table** (`lib/model/symbols.ts`), which is the same
table the compiler's scope, the router and the inspector read. A control, a
fitted coefficient and a declared constant all count the same way, and there is
no second opinion about what is bound. An unknown nothing binds is *reported*,
never filled in with zero.

### The operation: `solve`

`solve` is in `OPERATIONS`; `ALGEBRA` is a `Solver` in the registry declaring
`does: ['solve']`. It is routed, planned, blocked and explained by exactly the
machinery every other solver goes through — `route`, `operationsOn`, `plan`,
`askFor`. There is no parallel path.

### The expander: `lib/model/equations.ts`

`expandEquations` is the fourth declaration expander, and runs **last** in
`unpack()` — a solve's knowns come from the symbol table, so every valued
quantity has to be in place first.

Each solved unknown becomes a first-class object: `fidelity: 'model-derived'`,
`provenance: { origin: 'computation', detail: 'solved by elimination from 4
equations; residual 0.0e+0' }`. Not `user`, not `estimate`, not `data`. An
unknown the equations leave free gets no value and `origin: 'equation'` —
because an undetermined quantity must not read like a computed one.

**It replaces rather than skips, and it is the only expander that does.** A body
expanded out of a mechanism is the same body every time, because its identity is
structural. A solved value is not: it is derived from the parameter values as
they stand. Skipping an id that was already present is what made setting the tax
to 20 and then to 0 leave the equilibrium reading the t = 10 answer on a
document that had faithfully recorded both changes.

## The figure comes out of the equations

Getting the numbers right and still drawing nothing is a less wrong empty box,
not a figure. So the geometry is derived too, by `figureFor`.

**The only real question is which two axes.** Unknowns are not independent axes —
some are the same kind of quantity as each other, and two quantities of the same
kind belong on *one* axis. That question has a structural answer, taken in order:

1. **Declared units.** Same unit → same axis. Different units → never, whatever
   the algebra says.
2. **The algebraic form**, when units are absent: a row of the shape
   `c·u − c·v = k` says `v` is `u` shifted by `k`, and a shift is only meaningful
   between quantities of the same kind. `Qd = Qs` and `Pc = Pp + t` are both of
   that shape; `Qd = 120 − 2Pc` is not, and `x + y = 10` is not — which is why
   two lines crossing still get two axes.

Then:

- **Every other row is a locus.** It touches one unknown on each axis, and with
  the remaining unknowns held at their solved values it is a straight line, drawn
  from its own coefficients at two points. Two points exactly, because a linear
  relation is a line and sampling it forty times would be theatre. The slice is
  reported, not hidden: `held: ['pp']`.
- **The solution is a point** per axis-pair the relations use.
- **An offset is a segment.** `Pc = Pp + t` relates two unknowns on the price
  axis, so at the solution it is a segment from `Pp*` to `Pc*` whose length is
  `t`. Nothing here knows the word *tax*. Set `t = 0` and the segment has zero
  length and is not drawn, which is also correct.

Which group goes horizontal: the one more relations touch, and where that ties,
the one the author named first — a tie-break the author can see and control.

## Representation selection

`chooseRepresentation` now asks the model whether it carries relations, **before**
it asks what kinds of object it contains, and answers `plot2d` / 2 dimensions:

> *quantities related to one another by equations: the relationships are lines
> in the plane, and a third axis would be one nothing varies along*

Four unknowns is still the plane. Twelve would be. Variable count is not visual
dimensionality, and the branch is keyed on structure rather than on a count.

Two consequences follow for the frame. The axes are **named from the figure's own
groups** (`quantity (units)` × `price (currency)`) rather than `x` and `y`, since
the model has better names than the frame does; explicit `axis` objects still
win, because those are somebody's decision. And `aspectOf` stops forcing the box
square: two different kinds of quantity on the two axes is not a geometry, and
equal scales would make one of them unreadable while saying nothing true about
either.

## The footer was lying in the other direction

`buildSpec` labelled the view with the worst `fidelity` **declared on the
objects** — a field most authors and every expander leave unset. So a figure
whose every mark came out of a solver was captioned *"drawn to make the idea
legible, not computed."*

The compiler already returns what it actually did for each object
(`Built.fidelity`, assigned by the code path taken). That is what the caption is
made of now. Objects that drew nothing do not vote: their absence is reported as
a `problem`, not as a fidelity.

## Editing a relationship

`relate` and `unrelate` join the edit grammar:

```socria-viz
unrelate eq pc = pp + t
relate eq pc = pp * 2
```

The same verb as adding a spring, one level up. Dropping `Pc = Pp + t` does not
hide a line — it leaves four unknowns with three independent relationships, and
the reply says so from the solver rather than from prose:

> *Equilibrium now holds 3 relations: qd = a + b * pc; qs = c + d * pp; qd = qs.
> Not solved: 3 independent relationships for 4 unknowns, so this does not pin pp
> down. One more relationship involving pp would. The previous answer no longer
> holds and is not being shown as though it did.*

The old solved values are gone from the model, the carrier draws nothing and says
why, and `undo` restores the relation and recomputes — because it goes through
`revise` like every other edit.

## What is verified

`test/model-algebra.test.mjs`, 181 assertions. Every number is checked against an
answer worked out by hand, and the residual is checked too — a solve that
produces the right numbers and cannot say how close it came is not a solve.

| | |
|---|---|
| A | `x + y = 10`, `2x − y = 5` → x = 5, y = 5, rank 2, residual 0 |
| B | `x + y = 10` → underdetermined, names `y`, asks for one more relationship |
| C | `x + y = 10`, `x + y = 12` → inconsistent, names the impossible `0 = …` |
| D | `2x + 2y = 20`, `x + y = 10` → rank **1**, underdetermined |
| E | three equations, three unknowns → x = 1, y = 2, z = 3, residual 0 |
| | a fourth equation that follows: `overdetermined-consistent`, rank still 3 |
| | a fourth that disagrees: `inconsistent`, not averaged |
| refusals | product, square, sine, reciprocal, no `=`, two `=`, no unknowns |
| scale | the same system in microamps and in millions gives the same answer |
| pivoting | a zero on the diagonal is handled, not divided by |
| market | t = 10 → **Pp 24, Pc 34, Q\* 52**; t = 20 → **20 / 40 / 40**; t = 0 → **28 / 64** |
| | the demand line satisfies the demand equation at both its ends |
| | the wedge is 10, then 20, then absent |
| | 2 dimensions, primitives > 0, `model-derived`, no object reporting a gap |
| others | a resistive circuit, a beam's two supports, a mixture — same code |
| delete | drop `Pc = Pp + t` → underdetermined, values gone, gap stated, undo recomputes |
| hardcoding | `algebra.ts` and `equations.ts` contain no `supply`, `demand`, `tax`, `price`, `equilibrium` or `domain ===` outside comments |

## What was stopping it working at all

The solver, the equation IR, the figure and the representation rule were all in
place, and the capability was **unreachable from the product**. Eleven defects,
every one found by running the engine rather than reading it.

### The on-ramp had never heard of the block

`lib/logos.ts` lists the blocks a proposal may carry — `mechanism`, `gravity`,
`system`, `estimation` — and stopped there. Nothing ever emitted an `equations`
block, so nothing was ever solved. Worse, the shape example showed a top-level
`"equations": [...]` field which is **prose for a reader**, inviting exactly the
mistake the original failure made: the relations written where nothing reads them.

Worse still, one line read:

> *WHEN NOT TO PROPOSE … when a picture already does it: a curve, a limit, **a
> market**, a distribution, a titration have kinds above, and a proposal would be
> a worse version of something that works.*

The prompt was telling the model not to propose for the exact case in the brief.
The block is now documented with a worked example, the prose list is marked as
prose, the market exemption is gone, and `test/logos-models.test.mjs` asserts all
of it so it cannot regress.

### `statedFormally` did not list `equations`

So a system of three relations in four unknowns — a person halfway through
building one — had no runnable solver and no formal statement either.
`buildProposal` refused it outright and `revalidate` destroyed it on reload. The
same defect a specification had before *"a specification is a model before it is
fitted"*, repeated one declaration later. A system of equations is a model before
it is solvable, and an underdetermined one is exactly the model whose missing
relationship the engine should be naming.

### `set` never reached the document

`applyModelOps` has a `case 'set'` whose comment says moving a control should be
undoable — and `MODEL_OPS` did not list `set`, so the op went only to the view.
A reply saying "set the tax to 20" moved the slider and the document never heard;
undo could not undo it and a reload reverted it. It now goes to both: the document
records it, and a surface with no document behind it keeps working sliders.

## And eight more, all the same disease

Every one of these is the engine producing something other than what the model
says, with nothing recording the difference.

| | what it did | what it does |
|---|---|---|
| **the run cache** | keyed on the model id, object id, version and controls — not on the equations or the initial conditions. Five n-body systems of 2, 6, 7, 9 and 12 bodies, each built fresh, **all** reported "8 states" and drew the two-body orbit. `buildProposal` stamps version 1 on every fresh proposal, so a server that builds two models the extractor called `market` hands the second the first's numbers. | keyed on a digest of the declaration — states, initial values, right-hand sides, stop, observables, step — plus the whole scope minus the clock |
| **the state cap** | 24 in `system.ts` against 12 bodies × 4 states in `gravity.ts`. Six bodies fitted; the seventh threw `Cannot read properties of null (reading 'eval')`, because `simulate` **sliced** the state list and rebuilt its name list from the slice, so every right-hand side naming body 7 stopped compiling and `compileExpr(...)!` handed back null | `STATE_CAP` is 64 (a nine-planet system is 36 and runs), `BODY_CAP` is derived from it, over the cap is **refused with the count**, and the non-null assertion is gone |
| **the sanitiser** | trimmed a 30-body declaration to 12 and a 70-state system to 24, recording neither. Forces are pairwise, so removing bodies changes how every remaining one moves: the model that ran was not the model proposed | every cap goes through `capped()`, which writes a line to `Model.dropped`; the report says *"Trimmed on the way in: …"* and the conversation is told. The sanitiser keeps more than the solvers will run, so a merely-too-big system reaches the solver's own refusal |
| **a trajectory's start** | defaulted to `1`. The library's own double pendulum declared its two starting **angles** as controls and left the angular velocities to the engine — so the flagship chaos benchmark had been flinging both arms at 1 rad/s instead of releasing them from rest | refused by name: *"it needs a starting value for x and a starting value for y. A path has to begin somewhere, and choosing where would be choosing the path."* The library model now states `y0: '0'`, `w0: '0'` |
| **a trajectory's components** | `['dx','dy','dz','dw'].filter(Boolean)` **compacted** the list, so a model giving `dx` and `dz` ran `dz` as the second component — whose expression names a state that no longer existed. It ran, drew a curve and reported no problem | positional with no holes; a gap names both the one given and the one missing |
| **an all-NaN surface** | `sqrt(-1 - x² - y²)` compiles perfectly and has no value anywhere. The sampler returned a mesh of 2304 nulls, the note read "48 × 48 grid" and the fidelity read `model-derived` — an empty picture captioned as a computation. Nothing upstream can catch it: the router's job is whether the expression compiles, and it does | refused, naming the window it looked in. A curve with fewer than two points likewise. A **partial** one draws and says how many samples had no value |
| **an extent** | `[-3, 3]` and `[0, 2π]` are rendering decisions, and the note gave a reader no way to tell them from a window the model chose | `rangeOf` returns where the extent came from, and the note says *"an extent this engine chose, which the model does not state"* |
| **a note** | called the step count the state count: a two-state system integrated for 3000 steps reported "3001 states". Non-finite steps were silently filtered, so a run that diverged halfway drew half a curve and reported the half as the whole | *"3001 points along the path"*, and the dropped steps are counted |
| **a refusal** | the estimator put *"1 observations cannot identify 2 coefficients"* in `unlocks` and `'a fit'` in `what` — and every reader shows `what`. The picture read *"not computed — it needs a fit"*, which answers "why is there no fit?" with "because it needs a fit" | `Missing.because` carries the sentence where naming the thing is circular; the reader prefers it, and *"it needs a stiffness for k1"* still reads as it did |
| **a response surface** | two axes and four regressors means the other two are **held** while the surface is drawn — and nothing said so. *"wage, as the model implies it"* over education and experience, with tenure quietly fixed at whatever a slider read | names what is held and at what, says *"It is a SLICE of the relationship, not the whole of it"*, and says when a held regressor has no value at all |

`test/model-honesty.test.mjs`, 89 assertions, covers all of them.

## What is still not there

- **Nonlinear systems.** Refused by name. A Newton solver is the obvious next
  backend and does not exist.
- **Inequalities.** `≤` is not an equation and nothing handles it. A feasible
  region is not a locus.
- **Symbolic rearrangement.** `rearrange` is still a `FUTURE` solver. The engine
  can solve `Pc = Pp + t` for `Pp` numerically; it cannot hand you the algebra.
- **Units as arithmetic.** `units` groups axes and labels them. Nothing checks
  that `Pc = Pp + t` is dimensionally consistent, or converts.
- **More than two axis groups.** They are held at their solved values and named
  as held. Linked views or small multiples would be better.
- **The `c·u − c·v = k` grouping is a heuristic** where units are absent, and it
  would wrongly group two unlike quantities that happen to be subtracted.
  Declaring units removes the guess.
