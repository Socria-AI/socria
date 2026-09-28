# The representation engine

The layer that turns a structured model into something a person can look at,
turn, cut, move and ask about — and the foundation Logos 2 is meant to grow
from. It ships in Logos 1 as one renderer, one schema and ten benchmark
models; it is deliberately not ten visualisers.

## The shape of it

```
                     the person
                          ↕
                       Socria                     lib/viz-model.ts (the seam)
                          ↕
                   STRUCTURED MODEL               lib/model/schema.ts
              objects · relations · provenance
                          ↓
                    COMPUTATION                   lib/model/compile.ts
        expressions evaluated · systems integrated · data read
                          ↓
              VISUALIZATION SPECIFICATION         lib/model/spec.ts
        primitives in model space · box · layers · time · fidelity
                          ↓
                     RENDERER                     components/model/ModelView.tsx
                     2D and 3D
                          ↕
                   MANIPULATION                   lib/model/state.ts
        change → propagate → recompute what moved → say what changed
```

Each layer knows only the one below it. The renderer understands points,
lines, meshes, arrows, regions and words; it does not know what a volatility
surface is. A domain is expressed by *building a model*, and if a domain ever
needs its own renderer, this design has failed.

## The files

| file | what it holds |
|---|---|
| `lib/model/schema.ts` | what a model IS: object kinds, relations, provenance, fidelity, controls, time, data blocks, the sanitiser, the dependency walk |
| `lib/model/primitives.ts` | what a renderer can draw, in model space, with the caps that keep a picture drawable |
| `lib/model/sample.ts` | definitions → primitives: surface grids, marching-squares contours, cross-sections, vector fields, RK4 integration, streamlines, scatters, parametric curves and surfaces |
| `lib/model/compile.ts` | the engine: compiles an object's text definitions (through Logos's own evaluator) and assigns the fidelity the code path earned |
| `lib/model/spec.ts` | the drawable instruction, the coordinate systems, and `chooseRepresentation` — which picture, and why |
| `lib/model/state.ts` | the bridge to the conversation: the model as state, ops applied with propagation, comparison |
| `lib/model/library.ts` | the ten benchmarks, as data |
| `components/model/ModelView.tsx` | the one renderer, hosted in the existing surface frame |

## The rules that are not negotiable

**Fidelity is earned by the code path, never claimed by the model.** A surface
evaluated from an expression comes back `model-derived`; a trajectory that went
through the integrator comes back `numerically-computed`; a mesh read off
supplied numbers comes back `data-derived`; anything else stays `conceptual`. A
model that says `simulated` and supplies no way to simulate is reported as what
actually happened. The view's own label is the *modest* one of its parts,
because a picture is only as computed as its least computed part.

**Provenance travels.** Every object may say where its numbers came from —
user, inference, equation, computation, simulation, dataset, source, default —
and that sentence reaches the conversation, so "where did this number come
from?" has an answer rather than a guess.

**Nothing is fabricated.** Two benchmarks look like data and are not: the
volatility surface is a stated functional form and the terrain is a stated
function over geographic coordinates. Both say so in their assumptions and
both carry `model-derived`. Inventing an options chain or an elevation raster
to make a demo look real is the exact failure this architecture exists to
prevent.

**3D has to earn it.** `chooseRepresentation` returns its reason and its
alternatives. A quantity over two others earns three dimensions; a plane curve
does not; a dependency structure is a graph; a series against time is a
timeline. A projection of something higher-dimensional must say so
(`projectionNote`).

**A change is local.** `affectedBy` walks the declared dependencies, the
caller recompiles only those objects, and the rest of the picture — and the
camera, and the selection — is left alone.

## Adding a model

Write data. A model needs an id, a title, objects with meanings, and controls
with ranges; mathematics is text in the evaluator's grammar, so it survives
being saved, sent to somebody else, and written by a conversation.

```ts
{
  id: 'saddle', title: 'A saddle',
  params: [{ id: 'a', label: 'a', value: 1, min: -2, max: 2 }],
  objects: [{
    id: 'z', kind: 'surface', label: 'z = a·x² − y²',
    meaning: 'The height of the surface above each point of the plane.',
    definition: 'a*x^2 - y^2', over: { x: [-3, 3], y: [-3, 3] },
    depends: ['a'], provenance: { origin: 'equation' },
  }],
}
```

A trajectory adds `defs` — `dx`…`dw` for up to four state components, `x0`…`w0`
as expressions for where it starts, `px`/`py`/`pz` for where a state IS (a
pendulum's state is two angles; an angle is not a position), and `stop` for
where it ends.

## What is deliberately not built yet

- **External solvers.** The architecture has the seam (a model states its
  system; something integrates it) but every computation here is in-process.
  PDEs, optimisation and symbolic work need a real backend, and pretending
  otherwise would break the rule above.
- **Data-driven geography.** Coordinates and layers are in; no real dataset
  ships, on purpose.
- **Comparison as a view.** `compare()` computes what differs between two
  states of one model; drawing them side by side, overlaid or as a difference
  is not built.
- **Collaboration on a model.** Logos's multiplayer is untouched and unaware
  of models; shared model state is a Logos 2 problem and the schema is shaped
  to allow it (`version`, `lastChange`).
- **Export.** A model is already a serialisable document; nothing writes one
  to a file yet.

## Where to look at it

`/model` — the bench: ten models, one renderer, with what each exercises and
why the engine chose the dimensionality it chose. Not linked from the product.

`test/model-engine.test.mjs` — 182 assertions, and the ones worth reading are
the mathematical ones: a contour whose every point is at its level, an
integrator that closes a circle to one part in 10⁶, two Lorenz starts a
thousandth apart that end up far apart, a ray captured inside 3√3, a density
that integrates to one.
