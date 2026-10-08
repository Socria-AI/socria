# Maps, chaos and Poincaré sections

A `system` declares rates; a `map` declares the next value itself:
x_{n+1} = f(x_n). Examples are a population counted once a generation, the
logistic map, the Hénon map, compound interest, or a discretized controller.
The map iterator (lib/model/iterate.ts) steps it exactly and then reads what
it does, using lib/numeric/dynamics.ts.

## The block

```json
{"id": "pop", "kind": "system", "label": "Population",
 "map": {"states": [{"name": "x", "init": 0.2}], "next": {"x": "r*x*(1 - x)"}, "steps": 400, "sweep": "r"}}
```

- **Every state needs `init` and a `next` value.** A missing one is refused
  by name. `next` may use the states, n and the parameters.
- **`steps`** defaults to 200, and says so.
- **`sweep`** names the control the bifurcation diagram runs across. If none
  is named, it is the first parameter `next` uses.
- **A map that depends on n has no fixed attractor to sweep,** so it is
  offered no diagram.

## What it computes

- **The iterates.** One state is drawn against n; two or more are drawn in
  their first two states.
- **The period** it settles into, read off the orbit's tail. "None within 64"
  is said as that.
- **Lyapunov exponents**, from products of Jacobians along the orbit,
  re-orthonormalized. They are finite-time estimates, and said to be.
- **Fixed points and their multipliers**, found by Newton from many starts in
  the box the orbit visits, then classified.
- **The cobweb** (one state): the orbit walked between y = f(x) and the
  diagonal.
- **The bifurcation diagram.** It takes 400 values of the swept control, each
  settled for 400 steps with 96 kept. A cycle counts only where its values are
  visibly apart: near r = 3 the logistic map is still alternating at 4×10⁻⁹
  after 400 steps, which a tolerance alone reads as period 2.
- **Feigenbaum's δ** (one-humped, one state). It is computed from the map's
  own superstable 2ⁿ-cycles, each found by bracketing from the last two, with
  the search starting a range's width below the control.
  - For the logistic map: r = 2, 1 + √5, 3.4986, 3.5546, …, and δ → 4.6692.
  - For μ·sin(πx): the same δ.
- **The Poincaré section** of a flow. This applies to a system of three or
  more states whose rates do not use t. It records every upward crossing of
  the third state through its mean, drawn in the first two.

## Views

| view | family | what it shows |
|---|---|---|
| Iterates | `trajectory` | the main picture: the iterates |
| Cobweb | `phase` | one-state maps |
| Bifurcation diagram | `bifurcation` | new |
| Poincaré section | `section` | new, for flows |

Point clouds of more than 4,000 points are drawn as one image in the plane.
This is the renderer's own change, for every model: a bifurcation diagram was
38,400 SVG circles.

## Verification

- `test/model-map.test.mjs` (40 checks):
  - the logistic map's fixed point 1 − 1/r with multiplier 2 − r, and x = 0
    repelling;
  - its periods 2 and 4 at r = 3.2 and 3.5;
  - chaos at r = 3.9, and the exponent ln 2 at r = 4;
  - its cobweb and bifurcation diagram (one, two, four and many values), with
    the first doubling found near r = 3;
  - Feigenbaum's δ for the logistic and sine maps;
  - the Hénon exponents 0.42 and −1.62, summing to ln b;
  - refusals;
  - the Lorenz section: hundreds of crossings on its plane.
- `test/model-dynamics-examples.test.mjs` (24 checks): the five docs examples
  build, open on their views, and their numbers hold:
  - Lorenz's C± at (±8.485, ±8.485, 27) with eigenvalues 0.094 ± 10.2i and
    −13.9;
  - Lotka–Volterra's centre at (d/c, a/b) with ±i√(ad).
- Chromium: *Dynamics and chaos in Logos 3* draws all five, with no errors.

## Not yet

- **Sections:** only one section plane, the third state at its mean. No
  stroboscopic section for a forced flow.
- **Bifurcations:** no continuation of unstable branches in the diagram, and
  no two-parameter diagrams.
- **Larger maps:** maps on lattices (coupled map lattices, cellular automata)
  are not built.
