# Scientific modeling in Logos 3

This report covers what was built from the course material (2.26, 12.006,
Strang's linear algebra, the compendium and the Engineering CAD Atlas), what
is still unsupported, and what to show.

## In one paragraph

Logos 3 started this work integrating ordinary differential equations with
RK4 and drawing curves and surfaces. It now also has:
- **Fields**, on a line or a plane: heat, transport, reaction, and shocks.
- **Maps** with their bifurcation diagrams, including Feigenbaum's δ computed
  from each map's own cycles.
- **Poincaré sections** of flows.
- **Strang's analysis of any matrix**: the four subspaces, A = CR,
  eigenvalues and singular values.
- **Buckingham Π groups** from the units a model carries.
- **Boundary-value problems** solved by shooting, returning every solution.
- **A conversational geometry panel**, with exact section properties and
  masses.

The rules are the same throughout:
- **Domain-independent.** Nothing branches on what a model is about. A field
  is a field whether it holds heat or a population, and a map is a map whether
  it counts rabbits or iterates the logistic equation.
- **It refuses rather than guesses.** A missing starting value, an unstated
  boundary, a species called T (which is time) or a step above the stability
  bound is named, not filled in.
- **It checks its own work.** Wherever a closed form, a conservation law or a
  known constant exists, the run is compared with it, and the result is said.

There are 1,339 checks across the suites below, and all 173 test suites pass.

## What was built

### The numerical core — `lib/numeric/`

| module | what it does | held to |
|---|---|---|
| `linalg.ts` | exact rational RREF, A = CR, the four subspaces, LU, Householder QR, least squares, symmetric and general eigenproblems with eigenvectors and diagonalizability, SVD, rank, pseudoinverse, condition number, projectors | 596 checks, including Strang's worked examples |
| `ode.ts` | Dormand–Prince 5(4) with error control, dense output and event location | analytic solutions and event times (17) |
| `roots.ts` | Brent; Newton from many starts | (14) |
| `dynamics.ts` | fixed points and their classification (flows and maps); continuation; Lyapunov spectra (flows and maps) with Kaplan–Yorke dimension; Poincaré sections; orbits, cobwebs, bifurcation diagrams; periodic points; Feigenbaum's constants from superstable cycles | Lorenz, Hénon, logistic, Feigenbaum (46) |
| `fields.ts` | 1D heat by Crank–Nicolson; `transport1D`, with up to four species of diffusion, Rusanov transport and Strang-split reaction, ends held or fluxed or on a ring; `field2D`, with up to four species on a plane, periodic, insulated or held edges, and refusal above the stability bound; exact Fourier series for checking | series, conservation, Rankine–Hugoniot, Fisher speed (46) |
| `dimensional.ts` | units as written into the seven base dimensions; Buckingham Π from the exact null space, in Buckingham's own form | pendulum, drag, Nusselt, Fourier (30, with `bvp`) |
| `bvp.ts` | two-point boundary-value problems by shooting, returning every solution in the range scanned | sin x, x³, Bratu's two solutions and its fold |

### In the model engine — what a Logos proposal can now declare

| declaration | what the engine does with it | views |
|---|---|---|
| `system` (existing) | fixed points with eigenvalues, nullclines, Lyapunov exponents; the Poincaré section when three or more states keep crossing a plane | Phase portrait, **Poincaré section**, How it behaves |
| **`pde`** | a quantity at every point of a line or a plane, stepped by diffusion, transport and reaction; conservation and exact-series self-checks | **Over space and time** (heat map), **The field**, **Surface** |
| **`map`** | x at the next step from x now: period, Lyapunov exponents, fixed points with multipliers, Feigenbaum's δ for one-humped maps | **Iterates**, **Cobweb**, **Bifurcation diagram** |
| parameters with units | Buckingham Π groups, listed in the Inspector | — |

The reply model is taught both new blocks, with worked examples.

The renderer gained:
- heat maps, with a viridis or diverging colour scale;
- planes drawn to scale;
- point clouds over 4,000 points drawn as one image (a bifurcation diagram was
  38,400 SVG circles);
- playback at the model's own rate, so a two-hour run replays in seconds.

Design notes: [MODEL-FIELDS.md](MODEL-FIELDS.md),
[MODEL-MAPS.md](MODEL-MAPS.md), [MODEL-VIEWS.md](MODEL-VIEWS.md).

### Objects of thought

A matrix object gains **What it is**, computed from its entries:
- rank, and the four subspaces with exact bases;
- A = CR;
- the exact determinant, eigenvalues with eigenvectors, singular values and
  the condition number;
- a 2 × 2's action on the plane, in words (rotation, reflection, shear,
  projection, stretch);
- for an augmented matrix, what Ax = b has.

All of it is hidden while a learner works the elimination by hand.

### Live 3D, from the CAD Atlas

The panel already had: describe a scene, preview it, build it, undo it by
description. The description is now typed in the chat, which is the only text
box in Logos: the panel previews it as it is typed, and sending it builds it.
This work added:
- NACA four-digit airfoils (Atlas benchmark 29);
- materials and nominal densities, with mass and centre of mass;
- exact section properties of any extruded outline (area, centroid, second
  moments);
- a revolved contour's throat;
- copies around a circle, rows centred on what they rest on, and gaps.

The panel calls itself a *geometric preview*: nothing in it is loaded or
stressed.

### Documentation, live

- **[Engineering in Logos 3](/docs/logos-3-engineering).** 30 models across
  eight disciplines, each built live from its proposal with its numbers
  computed: cycles, mechanisms, circuits, beams, a heated rod, a shock, a
  reaction front and Gray–Scott patterns. It also has 15 CAD-style designs
  drawn in 3D, from a ball bearing to a truss.
- **[Dynamics and chaos in Logos 3](/docs/logos-3-dynamics).** The road to
  chaos, universality, the Hénon attractor, the Lorenz butterfly with its
  section, and predator–prey cycles.

Every "Computed" line on both pages is also asserted in the tests. All 35 live
models were checked in Chromium.

## What remains unsupported

**From the courses**
- **2.26, fluids.**
  - No Navier–Stokes and no CFD: no flow around a body, no boundary layers.
  - Transport is on a line only. The plane is diffusion and reaction.
  - No wave equation (second order in time).
  - Compressible flow appears as closed forms (nozzle area ratio), not as a
    solver.
- **12.006, nonlinear dynamics.**
  - Poincaré sections use one plane: the third state at its mean.
  - No stroboscopic section for forced flows.
  - No two-parameter bifurcation diagrams.
  - Continuation of unstable branches is in the numerical core but not drawn.
  - No coupled map lattices.
- **Strang.**
  - Matrix objects hold exact rationals, so a rotation by 30° cannot be held
    exactly (one by atan(4/3) can).
  - No 3D transformation view.
  - Jordan forms are reported only as "not diagonalizable".

**In the engine**
- **Boundary-value problems** are solved in the numerical core but are not yet
  a declaration a model can carry or a view the person can open.
- **Dimensional analysis** lists Π groups. It does not check that a model's
  equations are dimensionally consistent, and expressions do not convert
  units.
- **Fields run on the page's own thread.** A 64 × 64 Gray–Scott run is about
  a second each time a control moves; there is no worker yet. A plane is
  stepped explicitly, so a stiff reaction needs a small step, and the engine
  refuses a step above the diffusion bound rather than going implicit.
- **Not built:** stochastic models (SDEs, Monte Carlo ensembles), constrained
  optimisation, and statistics beyond least squares. They remain declared,
  not drawn.

**From the CAD Atlas**
- No sketches with constraints.
- No B-rep, booleans, fillets, chamfers, lofts or shells.
- No assemblies, joints or linkages.
- No finite-element stress or CFD.
- No GD&T and no materials database (densities are nominal and said to be).
- No involute gear teeth.
- No STEP or CAD import or export.

The open kernels that would carry these, by licence:
- Open CASCADE: LGPL-2.1, with an exception.
- Manifold: Apache-2.0.
- Gmsh, CalculiX and OpenFOAM: GPL, which matters for distribution.

## The strongest demonstrations and trailers

Ranked by how much each shows in a few seconds and how hard it is to fake.
Each is live on the docs pages today.

1. **The road to chaos** (Dynamics, *The road to chaos* + *The same cascade in
   another map*).
   - **Shot:** type "a population that grows by r but is limited by
     crowding — what happens as r rises?" The bifurcation diagram fills in:
     one branch, two, four, then chaos with its period-3 window. Then the
     line: "Feigenbaum's δ, computed from this map's own cycles: 4.6692."
     Cut to the sine map: different curve, same δ.
   - **Why:** the most recognisable picture in nonlinear science, and a
     constant of nature derived live rather than quoted.
2. **Patterns from a reaction** (Engineering, *Patterns from a reaction*).
   - **Shot:** a purple square seed. Press play, and Gray–Scott grows a
     self-replicating pattern that fills the plane. Nudge the feed rate and
     the pattern changes kind.
   - **Why:** the most visually arresting run Logos makes, and it is a PDE
     solve, not an animation.
3. **The Lorenz butterfly, cut open** (Dynamics, *The Lorenz butterfly, cut*).
   - **Shot:** the 3D path, then the Poincaré section collapsing it to thin
     curves. The Inspector lists the wings' centres at (±8.485, ±8.485, 27)
     with eigenvalues 0.094 ± 10.2i.
4. **Heat along a rod, checked against the exact answer** (Engineering,
   *Heat along a rod*: the Atlas's transient-rod benchmark).
   - **Shot:** the heat map fanning in from the hot end. Then the caption,
     stated by the engine: "within 0.0071% of the exact series."
   - **Why:** a trust shot, the one that says the pictures are computed.
5. **A shock forming** (Engineering, *A shock forming*).
   - **Shot:** a smooth wave steepening into a jump in Burgers' equation,
     with ∫u kept to 2 × 10⁻¹⁴ on the ring.
6. **CAD from a sentence** (Engineering, *CAD-style designs*).
   - **Shot:** "a ring of 9 steel balls around the outer race" becomes a ball
     bearing in 3D. "A steel I-beam …" comes with its exact second moment,
     I = 1.367 × 10⁻⁴ m⁴.
   - **Caveat:** keep the *geometric preview* label in frame.
7. **Strang in one keystroke.**
   - **Shot:** type a matrix, open *What it is*, and the four subspaces
     appear with exact bases.
   - **Why:** best aimed at students.
8. **A reaction front at 2√(rD)**, and **predator–prey cycles**. Good
   supporting shots, each with its theory number on screen.

**Not yet trailer-ready:** Bratu's two solutions (shooting is in the core but
not in the UI), and anything involving flow around a body.

**A 45-second cut.** Logistic cascade with δ (10 s) → Gray–Scott growing
(10 s) → Lorenz and its section (8 s) → rod vs exact series, the trust beat
(7 s) → bearing from a sentence (6 s) → close on "every number computed,
every one checked" (4 s).

## Verification at a glance

| suite | checks |
|---|---|
| numeric-linalg | 596 |
| logos3-scene | 231 |
| model-engineering | 177 |
| numeric-dynamics, numeric-fields | 46 each |
| model-pde | 43 |
| model-map, model-phase | 40 each |
| objects-matrix-analysis | 35 |
| numeric-dimensional-bvp | 30 |
| model-dynamics-examples | 24 |
| numeric-ode | 17 |
| numeric-roots | 14 |

All 173 test suites pass. The docs pages were checked in Chromium with WebGL:
every live model draws, with no console errors and no sideways overflow at
phone width.
