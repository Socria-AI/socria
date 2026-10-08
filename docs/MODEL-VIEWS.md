# One model, many linked representations

> A Logos model should not be a visualization the user looks at. It should be an
> environment the user can explore.

## The gap

A built model already knows an enormous amount about itself — what each object
is, what supplies its values, which operation produced it, which solver ran, what
it rests on, what rests on it, what is missing and why. Almost none of it reached
a reader. `chooseRepresentation` picked **one** representation and listed
`alternatives` as bare strings (`['plot2d', 'table']`) with no account of whether
either was available, what it would show, or what it would take.

The model contained far more structured information than the interface exposed.
That is not a rendering problem: nothing enumerated the possibilities.

## What was built

Three pure modules and one component. No renderer was added and no domain is
named anywhere in them.

### `lib/model/views.ts` — the representation registry

`viewsFor(model)` derives every representation the model can honestly offer, from
its **structure** and from the **operation planner** — never from a list somebody
wrote or a language model's idea of what charts exist. Each carries a stable id,
the object it is a view of, its dimensionality, the gestures it supports, its
**earned** fidelity, what it shows, and *why it is available*.

The registry gives structurally different answers per family, which is the whole
test:

| model | views |
|---|---|
| saddle surface | surface, contour, slice, table, derivative, sensitivity, structure, equation, text |
| point charge | field, structure, equation, text |
| Lorenz attractor | trajectory, timeline, structure, equation, text — **no animation**, it has no clock |
| double pendulum | trajectory, timeline, **animation** |
| spring–mass–damper | trajectory, **phase**, timeline, animation, **mechanism** |
| fitted regression | …**residual** |
| specification with no method | no residual — and *"would need a method you chose"* |

`unavailable(model)` is the half that keeps the other half honest: what is **not**
available and what each would take. A registry that lists only what works reads as
a complete catalogue of the possible.

A family declared without a renderer reports `notDrawnYet` rather than being
hidden — so "what else can I look at" is complete, and adding a renderer is a
change in one place.

### `lib/model/inspect.ts` — the Model Inspector

`inspectModel` and `inspectObject` answer the eight questions — what is this,
what is in it, what is happening now, what actually computed, where did it come
from, what is it waiting for, what does it depend on, what else can I look at —
in sections that are **absent when they do not apply**. An empty section reads as
a category the model was measured against and failed.

**Every line is read, never composed.** `supply` from the symbol table, `origin`
and `fidelity` from provenance the code path earned, the solver from the router,
the chain from the dependency graph, the gaps from the operation planner. A
language model may read this aloud; it cannot invent a line of it.

- **`whyOf(model, id)`** walks the dependency graph backwards, bottoming out in
  things somebody supplied or a dataset holds. Cycles terminate.
- **`computationFacts`** is the transparency layer: *"Runge–Kutta 4, 4000 steps of
  dt = 0.005; 8 states"*, *"482 observations, 5 coefficients, 477 degrees of
  freedom; HC1 standard errors"* — the solver's own account, not a sentence about
  solving. A conceptual model returns **nothing**, and says *"no computational
  backend ran."*
- **`whatChanged`** reports what moved, what recomputed, **and what did not** —
  the half usually missing and usually the more informative.

### Canonical selection and cursors

`Model.selected` joins `Model.at`. Both are canonical, saved, and undoable —
because linked views stay in step by **reading one selection** rather than by
messaging each other, and because "ask about this" must be handed an *identity*.

Both **coalesce** in the document's history: a change of the same kind
immediately after one of that kind replaces the top revision. Clicking around a
model does not leave undo stepping back through every click, and a drag does not
leave it stepping back one frame at a time. Structural edits never coalesce.

### `components/model/Understand.tsx`

The surface of the two modules, mounted *beside* the picture rather than inside
it — the picture is one view of the model, and so is this. A Views row, the
selected object with its chain, what changed, and the model's sections with
progressive disclosure (everything closed but "what is happening now"). Clicking
a view or a step **selects canonically**; "Ask about this" hands the id to the
composer.

## Verified

`test/model-views.test.mjs`, 222 assertions, across nineteen library models plus a
conceptual one built in the test because the library has none:

- every model names a primary view, and every view says why it is available and
  what it earns
- a surface offers contours and slices and **not** a trajectory; a field offers
  neither; a system with two states offers a phase portrait and one with no clock
  offers no animation; a fit offers residuals and an unfitted specification does
  not
- nothing listed as unavailable is available
- no inspector section is ever empty
- a conceptual model claims **no** backend and offers **no** computed views
- the chain bottoms out in `origin: 'user'`, and a cycle terminates
- three selections in a row add **zero** revisions; a real edit adds one, and undo
  returns the value rather than a click
- change → invalidate → recompute → the same views remain available, and the
  inspector reports the new value

## The phase portrait, drawn (lib/model/phase.ts)

The `phase` family was declared and not drawn. It is now a frame, computed:

- **Always:** the run the other views draw, plotted as one state against
  another.
- **When the plane is the whole state:** a two-state system whose rates do
  not change with time at their current values. That is decided by
  evaluating the rates, so a drive written f₀·sin(ωt) with f₀ = 0 counts as
  autonomous. The frame then adds:
  - the field, with the right-hand sides evaluated on a 17 × 17 grid;
  - both nullclines, traced by marching squares;
  - paths from other starting states, integrated by Dormand–Prince;
  - the fixed points, found by Newton from a grid of starts and classified
    by their Jacobian's eigenvalues.
- **Otherwise:** the frame is marked `partial`, a projection onto two of the
  states. No field is claimed.

The Inspector gains **How it behaves** for any system:
- its fixed points, each with its eigenvalues and what nearby states do;
- for an autonomous system of up to six states, Lyapunov exponents by
  Benettin's method, said to be a finite-time estimate, with the
  Kaplan–Yorke dimension when the largest is positive.

Checked against closed forms (`test/model-phase.test.mjs`):
- **Damped oscillator:** eigenvalues −c/2m ± i√(k/m − (c/2m)²).
- **Van der Pol:** μ/2 ± i√(1 − μ²/4).
- **Lotka–Volterra:** a saddle at the origin, and a centre at (d/c, a/b)
  with frequency √(ad).
- **Lorenz:**
  - fixed points C± at (±√(β(r−1)), ±√(β(r−1)), r−1);
  - exponents that sum to −(σ + 1 + β);
  - a Kaplan–Yorke dimension of 2.06.

## Architectural debt

1. **Most families are declared, not drawn.** `table`, `matrix`, `structure`,
   `sensitivity` and `diagnostic` report `notDrawnYet`. The registry is real and
   the renderers are not; the honest consequence is that the Views row currently
   offers more than it can open. Marked in the data and in the UI rather than
   hidden.
2. **Linked interaction is one-directional.** Selecting from the Understand panel
   writes canonical state and everything re-reads it. Clicking a *point on the
   surface* still sets only the object selection, not the `(x, y)` cursor — the
   machinery exists (`Model.at`) and the renderer does not yet write to it.
3. **`SpecPanel` and `ViewSpec` are two abstractions for one idea.** Panels are
   built eagerly in `buildSpec`; views are enumerated lazily. They should be one,
   with a panel being a view that has been opened.
4. **No multi-view layout.** Views can be enumerated and selected; there is no
   workspace that holds several open at once. That is the next piece, and the
   registry is the thing it would be built on.
5. **`chooseRepresentation` still exists beside the registry** and decides the
   main frame's dimensionality. It should become `primaryView`.
6. **Sensitivity is declared and not computed.** The differentiator can produce
   ∂output/∂parameter; nothing calls it for that yet.
