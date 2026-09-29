# One binding between a quantity and its symbol

> The model is the source of truth. The slider is not. The renderer is not.
> Chat is not. Display symbols are not.

## The failure

```
Create a time-series econometric model of quarterly consumer spending.
C_t = β0 + β1·Y_t + β2·C_(t-1) + u_t
β0 = 5, β1 = 0.7, β2 = 0.2   (hypothetical)
```

Logos built the model correctly, understood the three values were hypotheses,
refused to claim they were estimated, chose a 3D Cartesian representation, and
rendered sliders reading **5**, **0.7** and **0.2**.

**The cube was empty.**

Reproduced before any change:

```
params the UI shows : b0=5, b1=0.7, b2=0.2
expression          : spec__b0 + (spec__b1) * x + (spec__b2) * y
reports missing     : a value for spec__b0 | spec__b1 | spec__b2
primitives drawn    : 0
```

The interface knew the values. The executor asked for names nothing had. Both
were right about their own half, and between them they produced a coordinate box
rendered as though the job had succeeded.

## Root cause

**A convention pretending to be a binding.**

`expandEstimation` invents canonical ids for the coefficients it creates —
`spec__b0`, `spec__b1`, … — and then resolved each to a control by **exact
id-string equality** against that invented convention:

```ts
if (model.params.some((p) => p.id === b)) return b;   // b = `${carrier.id}__b${i}`
```

Anything named otherwise — `b0`, `beta1`, `intercept` — did not bind, the symbol
stayed in the expression, and nothing could evaluate it.

Worse: **the author could not have known the convention.** Those coefficient
objects do not exist until the expander runs, so whoever writes the model has no
id to name a control after. The only way to bind was to guess an internal name.

### Three more failures on the same path

1. **`scopeOf` read `model.params` alone.** A coefficient carrying a perfectly
   good number — from an edit, from a fit, from the declaration — was invisible
   to every expression in the model.
2. **`SAMPLING.requires` had a third spelling of the binding rule** (params, plus
   objects with a numeric `.value`), disagreeing with both of the others.
3. **The compiler never asked the router.** An expression naming an unbound
   quantity compiled fine, evaluated to NaN at every point, dropped every point
   as non-finite, and returned a mesh whose note read *"48 × 48 grid"*.

## The fix

### `lib/model/symbols.ts` — the canonical symbol table

Every formal quantity has one identity and three names:

| | |
|---|---|
| `id` | `spec__b1` — the one identity every subsystem keys on |
| `display` | `β₁` — what a person sees; need not be a legal identifier |
| `machine` | `spec__b1` — what an expression may contain; always legal |
| `role` | `coefficient` |
| `value` | `0.7` |
| `boundBy` | `control` |
| `control` | `b1` |

`resolve(table, ref)` takes a canonical id, a machine symbol **or** a display
name and returns the same quantity. `bindings(table)` is the one place an
evaluation scope is built. `unbound(table, names)` is what the missing-structure
sentence is made of.

### A binding is declared, never guessed

Exactly three ways a value reaches a quantity, all of them things somebody wrote:

```
1. the declaration names the control     "coefficients": {"education": "b1"}
2. a control's id IS the canonical id    params: [{id: "spec__b1"}]
3. the quantity carries its own value    defs: {value: "0.7"}
```

There is **no fuzzy matching** — no prefix stripping, no looking for something
resembling `b1`, no special case for `beta`. A binding that guesses will one day
bind the wrong thing silently, which is the same disease in a later costume.
What replaces guessing is that an unbound quantity is **reported by its display
name**: *"a value for β₁ (spec__b1) — the model has this quantity and nothing has
given it a number."*

`EstimationDecl.coefficients` is the binding the author can actually write,
because it is keyed by the regressor's own name rather than by an id that does
not exist yet.

### The empty-cube rule, enforced

`buildObject` asks `route(model, o, 'evaluate')` **before drawing** and returns
the router's own missing-structure as the problem. The renderer does not
re-derive the mathematics or re-decide what is missing; it is told.

This immediately found a disagreement in the other direction: a surface backed by
a **data grid** needs no expression, the compiler has always drawn one, and the
router did not know — so `SAMPLING.requires` now accepts a real data block.

## The acceptance test, numerically

`test/model-binding.test.mjs`, 65 assertions. Not a snapshot of a mesh.

| | |
|---|---|
| vertices computed | 2401 |
| **every** vertex satisfies `z = 5 + 0.7x + 0.2y` | worst error **< 1e-9** |
| `f(0,0)` | **5** |
| over the ranges they gave | x ∈ [0,100], y ∈ [0,100] |
| observations invented | none |
| fit statistics anywhere | none |
| fidelity | `model-derived` |
| provenance | `user` — *"nothing here is estimated from data"* |

**Mutation.** `set b1 = 1.4` → same document, new revision, and **every** vertex
then satisfies `z = 5 + 1.4x + 0.2y` to 1e-9. The value lives in `Model.params`;
the slider reads it.

**Unbound.** Remove the binding: `incomplete`, **no geometry**, and the picture
says *"a value for β₀ (spec__b0); a value for β₁ (spec__b1); …"*.

**Not econometrics.** `z = 2x² + 3y` and `z = ζ·x + ω₂·y` with parameters named
`zqx_1` and `w_2` both compute to 1e-9 on the same path. Nothing depends on the
words beta, coefficient, spec or econometrics.

**Round trip.** Saved, re-read, re-validated: the binding survives and computes
the same numbers.

**Estimation stays blocked** on the observations, and does not take the
hypothetical surface down with it.

## Two bugs the tests caught in the fix itself

- **A shadowed binding.** The response block's `terms` hid the fit's own `terms`,
  so `intercept()`'s "has a fit run?" test read an always-non-empty array and β₀
  silently became `0` on a model nobody had fitted — filling in the exact degree
  of freedom the feature exists to name.
- **A vacuous pass in the test.** An all-NaN surface drops every vertex, so a
  loop over an empty list reports a worst error of zero and passes. The suite now
  asserts the vertex count before asserting the values.

## Still open

- **Cross-sections.** *"Hold previous consumption at 50."* `buildSlice` exists
  and the response surface qualifies; the phrasing is not wired.
- **Recurrence.** `C_t` and `C_(t-1)` are two column names with no index
  semantics. The model cannot yet express that they are one quantity at two
  times, so the recursive-dynamics request is **not supported** — and must be
  reported as a missing capability rather than fabricated.
- **Attaching data.** `lib/model/*` has no attachment path at all, so
  `missing-data` — the most common blocker in the system — cannot be resolved
  except in prose.
