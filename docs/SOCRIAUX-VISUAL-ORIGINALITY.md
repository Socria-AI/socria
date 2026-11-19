# SocriaUX — visual originality and compositional diversity

The order this work follows is the brief's: **the creative direction decides the design, the design decides the
composition, the composition decides the shapes.** Nothing here picks a layout from a list and restyles it.

```
Direction (words read · look · Creative DNA · moodboard)
  → shape system (form.ts: eight traits, each with what moved it)
  → compositional strategy (strategy.ts: spatial logic, type's role, pictures, navigation, how much to compose)
  → generation (the model is told the strategy and the shapes, and invents within them)
  → held in code (arrange.ts: the parts the strategy composes rebuilt from their own content, the navigation)
  → drawn (render.ts: masks, fragments, planes, wraps, vertical / turned / outline type, shaped edges, morphs)
  → checked (originality.ts habits · evaluate.ts strategy fidelity · the page audit at 1440 / 834 / 390)
  → explored on the canvas (CompositionExplorer: explore · compare · set aside · combine · nudge · use · hold)
```

## What was there before, and why it produced what it did

- **Shapes were a set of eight.** The renderer knew six flat marks (circle, arch, square, quarter, diamond, one blob)
  and two image frames (arch, circle). Every design that used shapes drew from those eight, so shapes repeated across
  projects by construction.
- **Composition stopped at the opening.** The previous round (`SOCRIAUX-CREATIVE-CEILING.md`) gave the opening a
  composed arrangement when the words asked. Every other part stayed in the library's layouts (a feature grid, a
  row of figures), whatever the direction said.
- **Patterns were read only partly.** The originality audit knew centred heroes, bento grids, rounded cards, the
  SaaS order, purple gradients, glass and generic type. It did not know pill buttons, three equal columns, an
  arrangement repeated down a page, decorative circles, gradient grounds or a flat typographic voice.
- **The direction's composition was prose.** "Off-grid, layered" reached the generator as words. Nothing in code
  decided the composition, so the model's habits won.

## The shape grammar (`lib/ux-v0/shape.ts`)

A shape is a **recipe**: a construction and continuous parameters (`n`, `irregular`, `curve`, `turn`, `cut`, `warp`,
`mirror`, a seed). There are ten constructions, one of them the designer's or the model's own points or path; the
parameters make the space of shapes continuous.

| Construction | What it draws |
| --- | --- |
| `poly` | A polygon of its own: how many corners, how regular, how rounded, mirror-symmetric or not. |
| `organic` | A silhouette drawn from overlaid waves: pebbles, drops, fluid outlines. |
| `super` | A superformula figure: stars, petals, rounded squares and everything between. |
| `stepped` | A structural outline of wings, notches, stairs and voids at right angles, traced from a grid. |
| `radial` | Rays or a fan about a centre, with a sector cut away. |
| `rings` | Concentric or eccentric rings (holes by the even-odd rule). |
| `shards` | A figure cut by straight cuts and pulled apart. |
| `arc` | A thick arc, even or tapering. |
| `edge` | A band whose top edge is a wave, steps, teeth or a tear (section edges). |
| `custom` | Points, or an SVG path (M L H V C S Q T Z; arcs and anything else refused), in a 0–100 box. |

Every recipe can also be turned, warped (a wave through it, a twist) and cut (a void, a notch, a gap).

**Outputs.** Geometry is rings in a 0–100 box, read even-odd, deterministic per recipe. It is drawn as:

- a CSS `clip-path: polygon()` in percentages, responsive. Voids and fragments are joined by zero-width bridges.
- an SVG path, smoothed for curved kinds.
- a CSS `shape-outside` polygon, for text wrap.
- a "morph-from" polygon: the same points carried to the box's edge, so a plain frame can transition into the shape.

Every single-ring shape has 96 points, so any two can morph. Masks must keep at least 55% of the picture.

## Shape systems derived from the direction (`lib/ux-v0/form.ts`)

A system is a point in eight traits: curvature, order, orthogonality, fragmentation, radiality, depth, energy and
scale contrast. Each trait is moved by:

- the creative reading's qualities (refusals already read);
- form words the reading does not hold (fluid, radial, fragmented, structural, scientific, diagonal…). A refused
  form word pushes the other way: "nothing fragmented" lowers fragmentation.
- the direction's look: corners, grid, containers, frames, its language's marks;
- the Creative DNA (the designer's, the references' and the brief's);
- the pictures SocriaUX made for the moodboard (contour, orbit, lattice…).

Each trait records what moved it, and the direction board can say why its shapes are what they are. From the traits
come the **vocabulary** (the two or three constructions that suit them, weighted) and each shape a place asks for: a
picture's mask, a mass behind words, an echo of a silhouette, a cut, a wrap, fragments, a section edge.

No "architecture → steps" table exists. In the benchmark the architecture studio's system came out stepped (right
angles 94, curvature 6), the fashion house's organic (curvature 68, depth 94), the science lab's rings, the artist's
shards, the festival's organic and radial, and the ceramics shop's organic. Each followed from its own words, look and
DNA, and each trait lists its reasons.

## The compositional strategy (`lib/ux-v0/strategy.ts`)

The strategy is decided before generation from the shape system, the DNA, the reading, the kind of work and what
must work. It covers:

- **Spatial logic.** Broken orthogonal grid, diagonal cascade, about a centre, spread across the field, or in layers.
  Each logic is scored from the traits and all five are ranked, so each composed part of a page takes the next one.
- **Grid, balance, overlap, bleed, air.**
- **Type's role.** Structural (display type carries the composition), editorial, quiet or functional. Also: labels
  standing upright, a turn, outline numerals, words wrapping a shape, and a weight sweep (variable faces only).
- **Pictures.** Shaped, fragmented, cropped hard, framed, or plain. A museum or a restrained brief shows works whole.
- **Navigation.** A bar, an index of chapters, a rail at the left edge, or a menu; the narrative linear or in chapters.
- **Shaped section edges.**
- **How many parts to compose.** None when nothing was asked: warmth, coolness and pace alone ask for nothing.
- **What stays conventional.** Booking, forms, prices, galleries, charts, tables, app screens.
- **What it avoids,** with every decision said and its reason.

A working screen gets the functional strategy: the library's layouts, conventional where convention serves.

**Told to the model.** The generator's prompt carries the strategy and three example recipes from the system, as a
direction to compose within, not a template. This adds about 3,000 characters (≈750 tokens) per generation.

**Held in code** (`lib/ux-v0/arrange.ts holdStrategy`). Whatever the model wrote:

- the parts the strategy composes are rebuilt from their own content by the composer, library layouts generated pages
  fall back on (feature grids, figure rows) first;
- the opening is composed too when the strategy composes two or more parts;
- the navigation takes the strategy's form, and chapters are numbered and indexed.

Left alone: locked parts, approved compositions, functional kinds, the pinned story's sequence, and parts the model
composed itself. The evaluation (`evaluate.ts`) reports a part that a later change turned back into a stock layout,
with a fix that restores it.

## The composer (`lib/ux-v0/composer.ts`)

The composer rebuilds a part from its own words and pictures on the 12-column field. Each logic is a placement
procedure with the content's own sizes and a seed of the part's own:

- **Orthogonal:** unequal spans, columns started off the expected lines, every other column a row lower.
- **Diagonal:** each point a step across and down, along a band or ribbon of the system.
- **Radial:** the picture cut to a radial figure, or the figure itself, with the points set around it at their angles.
- **Scattered:** best-candidate placement (each piece where it is farthest from the rest), read in order.
- **Layered:** a mass as the field's ground, a picture with its silhouette echoed behind it.

Rules the composer keeps:

- Words never land on words: a place already taken moves the words to the nearest free place.
- Only a title crosses a picture, set on strips of the ground.
- Display type belongs to the opening; later parts' titles stay a step below.
- Figures are set huge only when that is the direction's one loud move.
- Pieces are written in reading order, so a phone reads the part as one column, and its ornaments step aside.

## The pieces and the renderer

New in the composed-section vocabulary (`compose.ts`), all validated:

- `shape` planes: accent, ink, tint, line, ground (a cutout) or second ink; beneath or over pictures; kept on phones
  or not.
- Picture `mask`, `fragments` and `morph`.
- `flow`: words wrapping a shape (`shape-outside`), the shape a plane or a picture cut to it.
- Text `orient: vertical`, `rotate` (−12…12°, not running text), `stroke` (outline at display sizes) and
  `vary: weight` (a scroll-driven weight sweep, variable faces only, where the page plays).

Look-level additions (`spec.ts`):

- `look.form`, the system;
- `look.frame: 'shaped'`: the library's pictures cut to the system, each its own figure of the family;
- `look.edges: 'shaped'`: grounds of another tone meet along an edge of the system, kept in pixels at any size;
- nav variants `index` (numbered chapters) and `rail` (upright at the left edge on wide screens).

The motif's marks come from the system. Navigation links now go to the parts they name.

**Motion.** Shapes grow from their plain frame, and fragments gather to their places. All of it is gated by the
motion runtime (`body.mo-ready`), written only where the page plays, and absent under reduced motion.

**Responsive.** Below 900 px a field is one column in reading order. Upright words lie flat, turns are halved,
fragments pull in by half, and ornaments are hidden. A mask scales with its picture.

## Repeated habits (`lib/ux-v0/originality.ts`)

Added patterns:

- pill buttons;
- three equal columns;
- one arrangement repeated down the page;
- circles as decoration;
- gradient grounds;
- one typographic voice throughout;
- the familiar generated looks (from `tells.ts`).

Each is allowed where the direction justifies it, and says why. Round buttons on a fluid system are allowed; so are
circles on a radial one, columns for a comparison, and decoration that is the system's own shapes.

The fixes do not swap one habit for another. Three cards are **recomposed from their own content by the strategy**,
not turned into another stock layout.

## Exploration on the canvas (`components/ux-v0/CompositionExplorer.tsx`)

For a part that can be composed (or one already composed), the selection rail offers **Explore compositions**: three
alternatives that differ in structure (another logic, other treatments), each drawn by the real renderer. Actions:

- **Use this:** a new version Undo takes back; its composition is then **held** (`Section.held`). Words, pictures,
  ground and width rules can change. A change to its arrangement is asked about first (`heldTouched`). A new
  generation carries it over (`holdLocked`). The strategy and the repairs leave it alone.
- **Not this:** never proposed again in this project (`project.compositions.rejected`).
- **Combine:** where the first places things, with the second's treatments.
- **Nudges:** more asymmetric, more overlap, calmer, bolder type, more or less shape.
- **Approve / Release** for a part composed another way.

## Pictures and objects in the system's language

- **`form`** made pictures: a composition of the system's own shapes (a mass, its echoes, a cut, an outline).
- **`pattern`** made pictures: a repeat of its figures, as regular as the system is ordered and turned as it is
  kinetic.
- **A sculptural 3D form** (scene model `form`): a supershape whose numbers come from the system. An eased block for
  right angles, ribs for a radial system, lobes for a fluid one, twisted as it is kinetic. Drawn by SocriaUX's own
  WebGL runtime; its pixels are read back in the self-test.

## Technology chosen, per need

| Need | Chosen | Why not the others |
| --- | --- | --- |
| Irregular picture containers, shape planes, morphs | CSS `clip-path: polygon()` in % | Responsive, GPU-composited, interpolable between equal point counts. `clip-path: path()` is in pixels; CSS masks do not interpolate. |
| Outlines, made pictures | SVG | Resolution-independent and inspectable. Canvas needs a script and is not inspectable. |
| Text around a shape | CSS `shape-outside` | The platform's own wrap; nothing to compute at run time. |
| Section edges | `clip-path` with `calc(var(--edge-d) * h)` | Keeps the edge's depth in pixels at any width and height. |
| 3D | SocriaUX's own WebGL runtime | The sandboxed frame is static HTML with nonce-only scripts, so React Three Fiber cannot run there. Inlining Three.js into every render would slow the editor for every design to serve the few with a scene. |
| Motion of shapes | CSS transitions gated by the existing motion runtime | No new runtime and no new dependency. |

No dependency was added.

## The benchmark (`test/browser/ux-v0/originality-bench.mjs`)

Six identities (architecture studio, fashion house, science lab, experimental artist, music festival, ceramics shop)
plus a plain dentist page that must stay plain. They go through this checkout and the previous commit (3df371a). Both
get the same brief and the same conventional "model answer": a centred hero, feature cards, a row of figures, a
quote, a gallery, a story and a call to action. No model is called; the spend is US$0.

Measured, on this run:

| Measure | Before (3df371a) | Now |
| --- | --- | --- |
| Mean pairwise structural similarity across the six (1 = same page) | 0.49 | 0.43 |
| Spatial logics across the six | — | 5 (orthogonal, layered, radial, scattered, diagonal) |
| Shape vocabularies (distinct among 6) | — | 5 |
| Shape ideas shared between two projects (mean overlap) | — | 0.07 |
| The same mark drawn twice on one page | — | 0 in all six |
| Pictures integrated (cut, fragmented or crossed by words) | — | 6/6 on every page |
| Unjustified habits after repair | 2 on the ceramics page (decoration, circles) | 0 on every page |
| Overflow and collisions at 1440 / 834 / 390 | — | none |
| Generator prompt, characters | 14.9–15.7k | 17.8–18.7k |

The plain dentist page stays plain: nothing recomposed, nothing cut, no shaped edges, the navigation a bar.

The structural-similarity gain is modest (0.49 → 0.43). The previous engine already varied pages by visual language,
so most of what is new shows in shapes, pictures, edges and composed parts, not in the order of sections. The
"before" pages had already been repaired by their own engine's audit, so their habit counts are low too.

Other checks, all on this checkout:

- unit tests: 896; the repository's whole suite: 382 suites;
- `ceiling-bench.mjs` 71/71, `production-bench.mjs` 101/101, `dna-bench.mjs` 58/58, `craft-bench.mjs` 15/15,
  `layout-bench.mjs` 18/18;
- `sections.mjs`: all 3,350 renders clean (every section kind and variant, including the composed section, across
  the classic styles and all 17 languages, at 1440 and 390 px). It was run in four parallel shards with `RUNS`.
- the app walkthrough `ui-qa.mjs` 85/85, and `explore-qa.mjs` 17/17: explore, set aside (remembered), combine, nudge,
  use (held), release, links that go somewhere, no sideways scroll at 1440/1024/390, no script error.

## Limits, said plainly

- **No model was run.** How a real model composes with the new vocabulary and the strategy brief is unmeasured. What
  is measured is what SocriaUX holds in code whatever the model writes.
- **Five placement procedures.** The composer's spatial logics are five procedures with continuous parameters, not
  unlimited invention. The model can write any field, shape or path itself.
- **Six identities is a small sample.** Similarity was measured against one conventional answer per brief.
- **Navigation variants untriggered.** The rail and the index are implemented and unit-tested; none of the six briefs
  chose them.
- **Partial browser support.** Outline text uses `-webkit-text-stroke` (filled where unsupported). The weight sweep
  needs `animation-timeline: view()` and a variable face, and does nothing elsewhere.
- **Made pictures are abstract.** They stand in for real photographs; shapes cut real pictures the same way.
- **What the before/now sheets show.**
  - The change is concentrated in the middle of the page. Most openings keep the hero the model wrote: the strategy
    recomposes the opening only when it composes two or more parts and no reading arrangement was asked.
  - Some composed parts leave wide empty areas around small body text.
  - A muted shape plane with no photograph on it can read as a placeholder block (the architecture and artist pages).
  - These are judgements from looking at the screenshots, not measured.

## Fixed in passing

- **An endless loop in the workspace.** Kept made pictures were measured for DNA again on every change of the
  moodboard. The cause was a 120-character key and an address made pictures do not have. Fixed in
  `Workspace.tsx measuredAs`. It was found because `explore-qa.mjs` opens a project whose moodboard keeps made
  pictures.
- **Two older benches the previous commit (3df371a) had broken.** Running them against that commit's own code
  confirmed both failures were already there:
  - `dna-bench.mjs`: the dashboard's three directions were too alike, and a locked typeface was not held. Now the
    other two directions keep what the words ask outright and step their motion toward it rather than copying the
    whole reading, and typography or layout locked in the Creative DNA is respected.
  - `layout-bench.mjs`: 39 distinct structures where 40 are required. The widescreen language's booking settings were
    widened.
