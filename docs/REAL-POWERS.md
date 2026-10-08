# Fractional powers, and curves drawn as they are

y = x^(2/3) is defined for every real x. It is even, with a cusp at the origin.
Logos 3 drew only its right half. This covers why, what changed, and how it is
tested.

## What was wrong

The parser read the expression correctly. The faults were in five places after
it.

1. **Evaluation.** Every evaluator computed `^` with `Math.pow`. JavaScript
   has no real answer for a negative base and a fractional exponent:
   `Math.pow(-8, 2/3)` is NaN. So x^(2/3), x^(1/3), x^(−1/3) and ∛x were NaN
   for every negative x, in the scalar evaluator, the column evaluator and the
   Taylor series (`lib/logos-math.ts`). The model engine (`lib/model/expr.ts`,
   `lib/model/terms.ts`) did the same.
2. **The fraction was lost.** The model engine printed 2/3 as `0.666666666667`.
   That is no longer a fraction with an odd denominator. So even a correct
   evaluator could not have read it as a cube root, and the printed derivative
   `0.666666666667 * x^-0.333333333333` was NaN at x = −8.
3. **Domain.** Nothing distinguished "no real value here" (x^(1/2) for x < 0)
   from "a value JavaScript cannot compute". Both were NaN. The plotter drew
   nothing, so x^(2/3) looked like a function defined only for x ≥ 0.
4. **Sampling and rendering.** The adaptive sampler refined only where values
   changed fast. Near a cusp the values change slowly, so the tip could fall
   between two samples and be cut off flat. A jump (floor x, sign x) was
   joined by a vertical riser, because nothing told the renderer to lift the
   pen there.
5. **Explanation.** Socria was told the expression and the window, but not
   where the curve was actually drawn, or which power convention the plotter
   uses. It could describe the curve from its own assumptions rather than
   from the picture. The extractor that picks the window could also start it
   at 0 for a curve that continues to the left.

## The convention

`lib/real-power.ts` holds it, in one place. For an exponent that is a fraction
p/q in lowest terms:

- **q odd:** x^(p/q) is the real q-th root of x, raised to the p. It is real
  for negative x too: (−8)^(1/3) = −2, (−8)^(2/3) = 4, (−8)^(−1/3) = −1/2.
- **q even:** no real value for x < 0: (−4)^(1/2), (−16)^(3/4).
- **No fraction at all** (π, √2): no real value for x < 0.

Integers, non-negative bases and non-finite operands are exactly `Math.pow`.

By the time a power is evaluated, 2/3 is the float 0.6666666666666666. The
fraction is **recovered** from the float with continued fractions. It is
accepted only within a few units in the last place, with a denominator of at
most 10,000. So 2/3, −1/3 and 5/3 are themselves; the 2/3 − 1 of a derivative
is −1/3; a typed 0.2 is 1/5 (odd, so real for x < 0); 0.25 is 1/4 and 0.7 is
7/10 (even, so not). This is a general rule, not a list of special cases.

## What changed, layer by layer

- **Evaluation** (`lib/logos-math.ts`): scalar, column and per-element powers
  go through `realPow`. A column with one exponent recovers the fraction once
  (`realPowInto`). Taylor series of a fractional power about a negative point
  use (−1)^p · (−a)^α. `cbrt` uses the same path. A cusp or an even root of a
  negative number still has no series.
- **The model engine** (`lib/model/expr.ts`, `lib/model/terms.ts`): powers use
  `realPow`, including constant folding. A number that is an exact small
  fraction prints as one, `(2/3)`. So the derivative of x^(2/3) prints as
  `(2/3) * x^(-1/3)` and is real on both sides. Short decimals still print
  short (0.1 + 0.2 → 0.3).
- **Sampling** (`lib/logos-viz.ts` `sampleAdaptive`, `lib/logos-math.ts`
  `samplePlot`):
  - The sampler also refines where the curve bends: the chord midpoint is more
    than 1/1000 of the window's height off the curve. This draws a cusp as a
    point.
  - Where refinement runs out and the values still differ a lot, `findBreak`
    bisects the interval:
    - a difference that stays the same size is a **jump**;
    - one that grows, or a midpoint with no value, is a **pole**;
    - one that shrinks is a steep but continuous stretch, and stays joined.
  - A break is a NaN marker tagged `jump` or `pole`, and the renderers already
    lift the pen at NaN. So x^(1/9) and atan(1000x) stay unbroken. tan x
    breaks at every pole, and floor x is drawn as treads with no risers.
- **Rendering**: the graphing view, the map's small plots and the function
  object's figure (`components/objects/ObjectFigure.tsx`, which now uses the
  same adaptive sampler) all draw from those samples.
- **Explanation**:
  - Each curve in the picture's state now says **where it is drawn**
    (`curveCoverage` in `lib/viz-semantics.ts`), for example:
    - "drawn unbroken across the whole window"
    - "drawn only from x ≈ 0 rightward"
    - "runs off to infinity at x ≈ 0"
    - "jumps at x ≈ −3, −2, −1 and 4 more"
    - "no real value for x from −1 to 1"
  - When a picture has a fractional power in it, the convention goes with it:
    in the picture's stated assumptions (`components/MathViz.tsx`) and in the
    scene block (`sceneBlock`).
  - The extractor (`lib/logos.ts`) is told to write exponents as fractions and
    to frame both sides of an odd-root power unless the person asked for a
    range.

## Tests

`test/real-power.test.mjs` (85 checks) covers:

- **Fraction recovery:** lowest terms, decimals, float noise, π and √2
  refused.
- **Negative bases:** odd and even roots, negative exponents, symmetry and
  oddness, agreement with `Math.cbrt`.
- **Every evaluator:** scalar, column, LaTeX forms, slider exponents, Taylor
  series about −8.
- **The model engine:** printing, symbolic derivatives checked against
  numerical ones at negative x, folding.
- **Sampling:**
  - the cusp drawn as a point in a window that does not centre it;
  - vertical tangents and steep continuous curves left unbroken;
  - poles of 1/x, tan x and x^(−1/3) broken with nothing joining the branches;
  - floor's jumps drawn as treads;
  - the gap in √(x² − 1);
  - sin(x)/x drawn through;
  - the sampling budget.
- **What Socria is told:** coverage text, the convention in the prompt, the
  entity state.
- **The function object:** points, slopes and extremes left of 0, and an even
  root still undefined there.

A browser check (not committed) opened the graphing view in Logos 3 and
verified the drawn path of y = x^(2/3): one stroke from the left edge to the
right, symmetric, lowest at x = 0, steep on both sides of the tip. A message
sent from that view carried "drawn unbroken across the whole window" and the
convention to the chat route. A second scene with tan x, floor x, x^(−1/3) and
√x drew no vertical stroke across any pole or jump. Its pieces were 5, 13, 2
and 1.

## Limits

- **A decimal is the fraction it spells.** x^0.667 is 667/1000, which has an
  even denominator, so it has no real value for x < 0. That is correct by the
  convention, but it is not x^(2/3). The extractor is told to write "x^(2/3)",
  never "x^0.667".
- **A window someone chose is kept.** If a window starting at 0 is asked for,
  the left half is outside it.
- **The model engine keeps its own break rule** (`segmentsOf` in
  `lib/model/sample.ts`). It finds poles from the samples rather than by
  bisection, and it deliberately draws a step with its riser. Its values are
  now correct, so x^(2/3) in a model is drawn on both sides.
- **Socria's words still come from the model.** It is now given what was
  drawn and how powers are read, but nothing forces its prose to match.
