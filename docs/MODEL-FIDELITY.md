# Model fidelity

**Accuracy is not photorealism.** Socria's figures are abstract on purpose — thin
lines on cream paper, wireframes, contours, restrained colour — and that choice
is only defensible if the model underneath is exact and says so in a form
something can check. A beautiful figure and a wrong model look identical from
outside. This document is the difference from inside.

The chain every advanced representation runs through:

```
ScienceMeta        what is claimed: equations, constants, ranges, methods, sources
    ↓              validateScience — refuses what cannot be supported
computed state     produced by the domain code, which owns the numbers
    ↓              canCompute — refuses to draw what was not computed
representation     the semantic layer: what each mark stands for, and is not
    ↓
the renderer       may simplify APPEARANCE, never MEANING
```

| file | what it holds |
| --- | --- |
| `lib/model/science.ts` | the vocabulary and the rules: `ScienceMeta`, `validateScience`, `canCompute`, `explain`, `scienceLines`, `fidelitySpread` |
| `lib/surface-science.ts` | one block per advanced surface, and the only place any of it is stated; `SURFACE_MODEL` is derived from it |
| `lib/logos-physics.ts` | the physics: closed forms and integrators, pure, no rendering |
| `lib/viz-semantics.ts` | what each drawn mark is, for a reader pointing at the screen |

## Fidelity levels

`Fidelity` (in `lib/model/schema.ts`) is per **output**, not per figure:

| level | means |
| --- | --- |
| `conceptual` | drawn to make an idea legible; not a result |
| `model-derived` | evaluated from the stated mathematical relationships |
| `data-derived` | taken from supplied data |
| `simulated` | stepped forward by this model's own simulation |
| `numerically-computed` | produced by a real numerical method — its shape is a result |

A model's **declared** fidelity is the *weakest* of its outputs, and
`validateScience` refuses a block that declares more. `fidelitySpread` reports
both ends and which outputs sit at each, because a single headline is wrong in
one direction or the other for any figure with mixed parts.

## The four rules the validator enforces

1. **Nothing may claim more than it can support.** A `numerically-computed`
   output must name a solver that exists in the same block; `model-derived` must
   name an equation; `data-derived` must name a dataset. Every `from` must
   resolve, and nothing may cite itself.
2. **A control may not leave the model's domain of validity.** A parameter's
   offered `range` must sit inside its `valid` range — otherwise the picture is
   wrong at the end of the slider and nothing says so.
3. **An illustrative element must say what it is not.** A coordinate grid around
   a black hole is a representation of geometry; a reader will take a drawn
   surface for a surface unless told, so `notA` is required.
4. **A failed computation is not a drawing.** `canCompute` returns refusals for
   missing or non-finite values and *reports* every clamp instead of absorbing
   it. A surface that fails it says the model could not be computed.

Plus one consistency rule: an output and the representation that draws it must
agree about how real they are. A computed result drawn as an illustration, or an
illustration presented as computed, is refused.

## The black-hole audit, and what it found

The figure was titled *Kerr geometry*. Its algebraic quantities — horizons,
ergosphere, photon orbits, ISCO, radiative efficiency — were genuine Kerr closed
forms and correct. Six things were not:

| found | was | now |
| --- | --- | --- |
| **light paths** | integrated in **Schwarzschild** at every spin; the assumptions list disclosed it | equatorial **Kerr** null geodesics in Boyer–Lindquist, RK4 on `r̈ = R′/2r⁴ − 2ṙ²/r` with φ carried alongside; Schwarzschild is the a★ = 0 case of the same code |
| **capture threshold** | one number, √27 r_g, at every spin | the exact pair from `criticalImpact(a★)`: ±√27 at rest, **+2.11 / −7.00** at the Thorne limit |
| **the shadow** | a circle held at the non-spinning radius | the **Kerr shadow curve** (Bardeen 1973) — flat-edged at 2 r_g on the co-rotating side, bulging to 7 on the other, and circular again seen down the axis at 4.83 r_g |
| **frame dragging** | `drag = 1 + 0.9·a★`, a factor chosen to look like dragging | Ω = ±1/(r̃^{3/2} ± a★) and ω = 2a★r̃/(r̃⁴ + a★²r̃² + 2a★²r̃), both exact, both reducing to Kepler and to zero |
| **retrograde discs** | drawn at the retrograde ISCO with the **prograde** efficiency and temperature | `iscoRetro` and `efficiencyRetro` as first-class fields; the disc, its rate, its temperature and its Eddington rate all take the sense of rotation |
| **Doppler factor** | the **coordinate** speed √(GM/r)/c, and √(1 − r_s/r) for the gravitational part | the locally measured Kerr speed (exactly c/2 at the Schwarzschild ISCO, where the old formula said 0.41c) and the Kerr lapse |

Two smaller ones: surface gravity and the Hawking temperature quoted the
Schwarzschild expressions at every spin, and now come from
κ = (r₊ − r₋)/2(r₊² + a★²) — so an extremal hole is cold, as it should be. And
the Eddington-rate slider ran to 1.0 where the thin-disc profile holds to about
0.3; it stops at 0.3 now, because rule 2 refuses the alternative.

### What was already right, and stays

The photon-orbit, ISCO and efficiency closed forms; the ergosphere's
r_E(θ); the Shakura–Sunyaev profile; the blackbody colour; the depth-sorted
scene; the weak-field check against 4GM/bc².

### The figure's own honesty, now explicit

- the **photon sphere** is drawn as a sphere only at a★ = 0, where it is one.
  Spinning, the two equatorial orbits are drawn instead, because there is no
  single radius.
- the **horizon wireframe** is `illustrative`, and says it is not structure on
  the horizon.
- the **disc thickness** is `conceptual`; only its colour and brightness are
  computed.
- the **parcels'** rate is computed and their *number and placement* are not, and
  those are two separate outputs.
- a ray that cannot be resolved reports `decidedBy: 'threshold'` — the path drawn
  is unfinished and the verdict came from the exact algebra, which the readout
  says out loud.

## Model-aware chat

`VizModelState.science` carries `scienceLines(meta)` into the prompt: the model
and version, the coordinates, the observer, the solver with its stopping
conditions and what it was checked against, each output with its own fidelity,
each representation's *not*, the limitations, the equations and the sources. The
prompt block instructs plainly: answer why a computed thing came out as it did
from the model's own numbers, never upgrade a drawing to a computation, and say
what a mark is *not* when asked what it is.

The black-hole surface also reports the highlighted ray in full — impact
parameter, the threshold for **its own sense of rotation**, where it turned,
whether the integration or the threshold decided it — so "why did that photon get
captured?" is answered from the integration rather than from a general account of
black holes.

## Adding a model

1. Write the domain code in a pure module. It owns the numbers; nothing in
   `lib/model` or a renderer is allowed to invent one.
2. Write a `ScienceMeta` block in `lib/surface-science.ts`. Per-output fidelity,
   `valid` ranges with `outside` notes, `numerics` with `stopsOn` and
   `checkedAgainst`, `representations` with `notA` for anything illustrative,
   `limitations`, and real references.
3. Add it to `SURFACE_SCIENCE`. `test/science-fidelity` then validates it, so a
   claim the code cannot support fails the build.
4. Pass the block to the surface (`science={...}`), and pin the physics against
   published values in `test/physics`.
5. Check against the accuracy test: what is computed, what is mathematical, what
   is conceptual, what is illustrative — and would a specialist asking "why is
   that there?" get a straight answer for every visible mark?

## What is deliberately not built

- **No ray-tracing of the disc image.** You are not seeing the far side lensed
  over the top of the hole. It is stated as a limitation rather than implied away.
- **No off-equatorial motion.** Carter's constant is not computed, so no inclined
  orbit and no off-plane photon.
- **No general-purpose solver library.** Logos is not MATLAB or COMSOL; the
  differentiation is connecting reasoning, model, computation, manipulation and
  provenance, not owning every integrator.
- **The other domains have the architecture, not yet the blocks.** Economics,
  statistics, quantitative finance, GIS, chemistry and biology inherit the rules
  the moment a `ScienceMeta` block is written for them — and until one is, they
  have `conceptual` fidelity and say so.

## Tests

| suite | covers |
| --- | --- |
| `test/physics` (318 assertions) | the closed forms against the literature, the integrator against the weak-field series and the exact Kerr thresholds, the shadow's shape at three spins and two inclinations, orbital kinematics reducing exactly to Kepler and to c/2 at the ISCO, retrograde ISCO/efficiency, spin-dependent surface gravity |
| `test/science-fidelity` (108) | every validator rule and its refusal, `canCompute`'s refusals and reported clamps, `explain` on outputs/representations/parameters, the prompt block, all three surface blocks passing clean, and that what each block claims is what the code does |
