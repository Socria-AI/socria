# Fields: quantities over space, stepped through time

A `system` is states that change in time only. A temperature along a rod, a
dye in a channel, a reaction front, a shock in a flow or a pattern on a
reacting plane is a state at every point. The `pde` block declares one, and
the field solver runs it.

## The block

```json
{"id": "rod", "kind": "field", "label": "Temperature along the rod",
 "pde": {"x": [0, 0.5], "n": 100,
         "species": [{"name": "temp", "init": "tcold", "D": "alpha", "units": "°C"}],
         "left": {"value": "thot"}, "right": {"flux": 0}, "tEnd": 7200}}
```

On a line:

    u_t = (D(x) u_x)_x − F(u)_x + R(u, x, t)

On a plane (`y` given):

    u_t = D ∇²u + R(u, x, y, t)

Each block carries one to four species.

| field | what it is |
|---|---|
| `x`, `y` | the extent: one span is a line, two make a plane |
| `n` | grid intervals per side. A line takes at most 400, a plane 128 × 128; a cap applied is said |
| `species[].init` | the starting field, an expression in x (and y) and the parameters. **Absent is refused**, not read as zero |
| `species[].D` | the diffusivity: a number or a parameter expression. On a line it may vary with x. Absent, the species does not spread |
| `species[].flux` | on a line, the transported flux F(u): `c*u` for a current, `u^2/2` for Burgers |
| `react` | each species' rate, in the species, x, (y), t and the parameters |
| `left`, `right` | a line's ends. `{"value": …}` holds the end at a value; `{"flux": …}` lets that much in, and `0` is insulated. Either may depend on t. A species may override them |
| `periodic` | a line that is a ring |
| `edges` | a plane's edges: `periodic`, `insulated` or `held` (held edges need each species' `edge` value) |
| `tEnd` | how long to run. Absent: to the end of the model's clock, else one diffusion time L²/D, and said |
| `dt`, `show` | the step, and which species the picture shows |

## What it refuses, and why

Everything is refused by name, in the person's terms (`readPde`):
- a field with no starting value;
- an end or an edge nobody stated, for a species that spreads or is carried;
- a negative diffusivity;
- a rate for a species the field does not carry;
- an expression that does not compile;
- transport on a plane (built for a line only);
- a species called x, y or t. Names are read without regard to case, so a
  temperature called `T` *is* time; the refusal suggests `temp` or `theta`;
- a plane whose step is above forward Euler's stability bound, or whose run
  is more than 3 × 10⁷ cell-steps. This is arithmetic, done before the run,
  so the router, the capability grade and the picture all hear it.

## How it is stepped (lib/numeric/fields.ts)

- **A line: `transport1D`.**
  - Diffusion: Crank–Nicolson. The tridiagonal system is solved exactly by
    Thomas, or on a ring as the cyclic system by Sherman–Morrison.
  - Transport: Rusanov's flux, which is monotone and first order in space.
  - Reaction and transport together: stepped by Heun's method in half steps
    either side of the implicit diffusion (Strang splitting, second order in
    time).
  - The step adapts to the transport's speed, at a Courant number of 0.9, and
    lands on every time kept.
  - With diffusion alone, the result is `heat1D`'s to round-off.
- **A plane: `field2D`.** Forward Euler with the five-point Laplacian on cells,
  with periodic, insulated or held edges.
- **Reaction terms are text, evaluated a column at a time** (`compileVectorExpr`
  in lib/logos-math.ts). The cost of reading the expression is paid once per
  step, not once per cell: about twenty times faster, and no code is generated
  from the text.

## It marks its own work

- **Conservation.** A closed field, with no reaction, keeps what it holds. A
  closed field is a ring, or every end of every spreading species stated
  insulated, or a plane with periodic or insulated edges. The run reports the
  relative drift.
- **The exact series.** One species diffusing at one rate, with its ends held
  at constants or insulated, has an exact Fourier series (`heatSeries`). The
  run reports its largest departure from it:
  - sine, for both ends held;
  - cosine, for both insulated;
  - quarter-wave, for one of each — the Atlas's transient rod.
- **Stopping.** A field that leaves the numbers stops and says when. So does a
  run that reaches its step budget.

All of this appears in the picture's note, and in the Inspector under
*How it ran*.

## The picture

- **A line:** the whole history at once — position across, time up, the value
  as colour (viridis; a diverging scale when the value runs both sides of
  zero), with a line at the clock's time.
- **A plane:** the field at the clock's time, drawn to scale, replayed as the
  clock plays.
- **Either:** *Surface* shows the same run as heights in three dimensions.
- **Playback:** the frame's clock now plays at the model's own `time.rate`. A
  two-hour run replays in seconds, not hours.

## Verification

- `test/numeric-fields.test.mjs` (46 checks):
  - against heat1D;
  - against the sine, cosine and flux-in solutions;
  - conservation;
  - a pulse round a ring;
  - Burgers' Rankine–Hugoniot speed;
  - logistic growth;
  - Fisher's front speed;
  - a blow-up stopped;
  - the discrete decay of a periodic mode;
  - Gray–Scott against the two-species solver;
  - both refusals.
- `test/model-pde.test.mjs` (43 checks):
  - what a proposal may say;
  - every refusal;
  - what the engine chooses, and says;
  - the router, the capability grade and the solver table;
  - the run's own checks;
  - the picture's primitives, axes and aspect;
  - one run per model state.
- `test/model-engineering.test.mjs`: the four docs examples.
  - The rod: within 10⁻⁴ of the series after two hours.
  - The shock: steepening twentyfold, with ∫u kept.
  - The front: within 5% of Bramson's speed and below 2√(rD) at every corner
    the controls reach.
  - The patterns: v spreading from a 1.6% seed over more than a quarter of
    the plane.
- Chromium: all four draw as heat maps with their scales, and the plane
  replays into its pattern.

## Not yet

- **Shape:** no unstructured mesh and no finite elements. A field lives on a
  line or a rectangle, not on the shape of a part.
- **Physics on a plane:** no transport (advection) on a plane, no
  Navier–Stokes, and no wave equation (second order in time).
- **Time stepping:** a plane is stepped explicitly. A stiff reaction needs a
  small step, and the engine refuses a step above the diffusion bound rather
  than going implicit.
- **Speed:** runs happen on the page's own thread, so a large plane is about a
  second of arithmetic each time a control moves.
