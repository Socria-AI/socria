# Live 3D (experimental)

You describe a 3D scene and it is built as you type. The result is a real,
editable scene graph that lives in the line of thinking. It is a
**geometric preview**: shapes, sizes and positions, computed exactly.
Nothing in it is weighed, stressed or simulated, and it says so in the
panel, in its facts and in the reply model's rules. Physically validated
models live in `lib/model/` and have their own fidelity contract
(`lib/model/science.ts`).

## Where it lives: an object of thought, not a parallel system

The scene is a kind in the objects substrate (`lib/objects/core.ts`), so it
gets what every object gets:

- **Storage.** It lives in the map (`ThinkingMap.objects`), so it persists,
  restores and syncs with the line of thinking and its shared rooms.
- **Every state is computed.** Each state after the first comes from an
  operation the scene kind computes.
- **Provenance.** Each step records who chose it.
- **Re-checked on load.** A stored history whose states do not follow from
  their steps is cut on load (`sanitizeSpace`).
- **Shared selection.** Selecting a part is the workspace's shared focus
  ("About box of Scene"), and its facts go to the conversation.
- **The conversation knows it.** The reply model is told what the scene
  holds through `objectsBlock`, with a rule that a scene is not a physical
  model.

Nothing new stores state. The 3D view, the parts list, the inspector and the
map card are all views of the scene's current state.

## The parts

| file | what it is |
|---|---|
| `lib/objects/scene-geometry.ts` | the geometry, computed: profiles, surface grids, revolved profiles, tube paths, extents, rotation (identical to `THREE.Euler 'XYZ'`), volume and area — exact formulas, or numerical and said to be |
| `lib/objects/scene.ts` | the kind: nodes with stable ids, dimensions, placement, look and support (`on`); the operations; `settle`; the facts |
| `lib/objects/scene-intent.ts` | the reader: a description into the kind's own operations, clause by clause |
| `lib/objects/scene-plan.ts` | the scene seen from above, for the map card |
| `components/scene3d/geometry.ts` | a part as Three.js geometry, built from the same functions |
| `components/scene3d/SceneCanvas.tsx` | the React Three Fiber view: orbit, select, the transform gizmo, the preview ghosted |
| `components/scene3d/ScenePanel.tsx` | the panel: describe, preview, Build; parts; inspector; undo by description |

### A part keeps its identity

A node's id comes from a counter: `box1`, `sphere2`. An id is never reused,
even after its part is removed. Every edit, whether described, typed into the
inspector or dragged with the gizmo, changes that node in place. Nothing is
regenerated.

### What rests on what is structure

A node can rest on the floor or on another node (`on`, with an offset
`off`). `settle` places every resting part from the bottom of the stack up.
When the box under a sphere grows, moves or turns, the sphere stays on it,
and the step says so. Lifting a part takes it off its support. Removing a
support leaves what rested on it where it was, resting on nothing.

### Shapes

| shape | how it is made |
|---|---|
| box, sphere, cylinder, cone, torus, plane, capsule | dimensions |
| prism (n sides), star (n points), ring (annulus) | extrusions of computed profiles |
| polygon | an extrusion of the person's own corners |
| surface | z = f(x, y) evaluated on a grid; cells where f is undefined are left out and counted |
| revolve | r(y) turned about the vertical axis |
| tube | a tube along the curve (x(t), y(t), z(t)), evaluated wherever Three asks for a point |

Shapes given by an equation stand at their own coordinates, so a point on
them reads true. They are not lifted onto the floor.

Volumes and areas:
- **Exact** for the primitives and extrusions (Pappus for the torus; the
  annulus formula for the ring, not its drawn 96-gon).
- **Numerical, and labelled so**, for revolved shapes (Simpson's rule), tubes
  (πr² times the curve's length) and surfaces (the area summed over the drawn
  grid).
- **No area** for a part stretched unevenly. The panel says why.

### The reader

`readScene(text, scene, {selected, last})` returns:
- the operations;
- a reading of each clause: what it understood, the problem if it
  understood nothing, any words it skipped, and notes on choices it made;
- the preview, which is exactly the state committing would compute.

What it reads:
- shapes and their synonyms;
- numbers with units (m, cm, mm, in, ft);
- `a × b × c` as width × depth × height (and it says so);
- colours, with light and dark shades, and finishes: matte, plastic, metal,
  glass, wireframe;
- placements: on top of, under, left or right of, in front of, behind,
  above (with a gap), next to, at (x, y, z), on the floor;
- edits: move, lift, rotate (about an axis, upside down, on its side),
  scale, "make it 2 m tall", "taller by 0.5", "twice as big", paint,
  "set the radius of the sphere to 2", "the box's height to 3", copy
  ("3 times to the right"), stack, rename, remove, clear, display unit;
- arrangements: a row, a stack or tower, a ring or a grid of N;
- shapes given by an equation, as listed above.

How it decides which part is meant:
- References are resolved against the scene: it, them, everything, "the red
  box", "the second sphere", "the biggest box", "all the cubes", "box 2", or
  a name the person gave.
- "It" means the part this same description last made or changed. Otherwise
  it is the selected part, then the part last made.
- When two parts match, it takes the one just made, then the selected one,
  then the most recent, and it says so.

What it refuses rather than guesses:
- It is a grammar, not a guesser. What it cannot read is reported clause by
  clause.
- An edit verb never makes something new.
- A clause whose only shape is a reference ("next to the box") makes
  nothing.
- A place the scene does not have ("on the dragon") is a problem, not a
  part put somewhere else.
- A clause that fails leaves no trace, either in the operations or in the
  scene later clauses are read against.
- Sizes nobody gave are defaults, marked as such on the part. A part with no
  place given goes beside what is already there, not inside it, and the note
  says so.

### Built, and undone, by description

Build applies the reading's operations through the workspace, one step each.
All the steps of one description share a timestamp, so **Undo** takes the
whole description back, and **Redo** puts it back. Edits made by hand are one
step each:
- **Inspector:** typing a size, a position, a turn, a stretch, a colour, a
  finish, an opacity or a support.
- **Gizmo:** one `transform` per drag, snapped to 5 cm, 15° and ×0.05 unless
  Snap is off. A drag the scene refuses springs back.

Someone who can only view or comment on a shared line of thinking cannot
change it. The panel says so, and `onObject` refuses the operation.

## Changes to the substrate this needed

- **The history cap kept a broken chain.** `apply` used to keep the first
  state and drop the ones after it once an object passed 40 states. The kept
  states then no longer followed from their steps, so the next load cut the
  whole history back to its start. A 45-part scene reloaded as an empty one.
  The cap now drops the oldest states, the start among them. It records how
  many went (`trimmed`), and the conversation is told. A kind can keep fewer
  states (`maxStates`); a scene keeps 24, because each state is the whole
  scene.
- **Operations can carry more.** A kind can allow more and longer arguments
  per operation (`argLimits`).
- **The rules always reach the reply model.** `objectsBlock` used to cut
  3,200 characters from the end, and a large scene would have cut the rules
  off. Now the object descriptions are shortened and the rules never are.
- **A step can carry its time** (`ObjectAction.at`), so one description's
  steps can be grouped.

## Verification

- `test/logos3-scene.test.mjs` (183 checks), covering:
  - every volume and area against its formula, and the numerical ones
    against cases with closed forms (a revolved line is a cone, 9π);
  - the rotation matrix against `THREE.Matrix4.makeRotationFromEuler`,
    entry by entry;
  - identity, support and its consequences;
  - the history re-computed on load, with forgeries cut, and a 45-part
    scene that survives a reload;
  - the facts, guarded and not;
  - the reader: sizes, units, arrangements, placements, edits, references,
    and what it refuses;
  - the plan view;
  - the workspace: what "+ View" offers, and the layout's pinned scene.
- Chromium, with WebGL through SwiftShader (`scripts/.probe-live3d*.mjs`,
  not kept):
  - type, preview, Build;
  - an edit to the selected part;
  - a ring of 8;
  - an inspector edit, then undo by description;
  - a problem read back with Build disabled;
  - "+ View", the map card's plan, and "Open in 3D".

## Not yet

- **Shapes and modelling operations:** no pyramids, booleans (cut, join),
  fillets, lofts, sweeps other than a tube along a curve, text, or imported
  meshes.
- **Constraints:** none beyond resting on something. Nothing is aligned,
  centred or spaced between parts, and overlaps are not detected.
- **The reader** only knows its vocabulary. Anything outside it is said back,
  not interpreted, and a description is not read by a language model.
- **Equation-shapes are in metres:** surfaces, tubes and revolved shapes are
  read in metres whatever the display unit.
- **No physics:** no mass, no material other than how it looks, no
  stability, no loads.
- **The reply model reads the scene as text.** It does not see the picture.
- **Limits:** 48 parts per scene and 24 states of undo.
- **WebGL is required** for the 3D view. Without it the panel says so, and
  the parts, inspector and description still work.
