# SocriaUX Graphics — creative-ceiling expansion

A larger visual vocabulary for SocriaUX Graphics and Boards: parametric shapes, editable Bézier paths, booleans, a gradient and colour engine, a non-destructive effect stack, procedural pattern generators, advanced typography, masks and blend modes, picture adjustments, a vocabulary planner that chooses among all of these for a brief, edits in words that use them, and the canvas controls to do every one of them by hand.

Everything is an editable document property. No new capability is a picture of itself, and none needs a model.

## Architecture

The Graphics document (`lib/ux-v0/graphics/doc.ts`, `GFX_SCHEMA = 1`) stays the single source of truth. Every addition is an optional field, so Graphics 1.0 documents open unchanged. `normalizeDoc` is still the only way in, and operations (`applyOp`/`applyOps`) are still the only way a document changes, whole or not at all.

| Module | What it is |
|---|---|
| `graphics/geometry.ts` | Bézier paths (anchors, in/out handles, smooth and corner nodes, open and closed subpaths), path editing (insert, remove, move with mirrored handles, smooth/corner, reverse, split, join, simplify, smooth, distort, interpolate), 60 parametric primitives in five families, booleans, offsets and stroke outlines through `polygon-clipping` |
| `graphics/vectorops.ts` | Each shape's outline as an editable path, node transforms (translate, rotate, skew, flip), SVG path data parsing (all commands; arcs become cubics), live booleans, outline stroke, offset, and blending between any two outlines |
| `graphics/paint.ts` | Colour parsing (hex, rgb(a), hsl(a), the 148 CSS names), harmonies, linear-light mixing, and linear, radial, conic and mesh gradients with repeat, period, turns, interpolation space and opacity; twelve presets, tintable to a palette |
| `graphics/effects.ts` | 34 effects, each with typed parameters and colours, compiled in order into one SVG filter per object; two (gradient overlay, extrusion) are drawn by the renderer; twelve presets |
| `graphics/patterns.ts` | 24 procedural generators with shared controls (seed, rotation, randomness, size and colour variation, a ramp toward an edge or the centre, an edge fade) and their own; deterministic, bounded (`MAX_MARKS` = 6000), cached, merged into a few paths |
| `fonts.ts` | Graphics' own list of faces (`GRAPHIC_FONTS`): the 74 website faces, plus three variable faces only Graphics offers (Anybody, Roboto Flex, Recursive), plus Fraunces loaded with its optical size, softness and wonk axes. Websites keep their own list, lookups and stylesheets exactly as before, so the model's menu, the schemas, design-system imports and headline fitting are unchanged |
| `graphics/text.ts` | Layout now measures mixed-style runs, keeps where each word came from, and adds paragraph spacing; `textPathLength` and `fitToPath` for text on paths |
| `graphics/render.ts` | Draws all of the above as SVG: gradients beyond SVG's own (conic as fine sectors, mesh as rows blended by masks, linear light as interpolated stops), effects, blend modes and isolation, group masks (by silhouette or brightness, inverted or not), live booleans, patterns, text on paths, warps, echoes, runs, variable axes, OpenType features, picture adjustments, crops and vignettes, skew and flip |
| `graphics/svgimport.ts` | Untrusted SVG read by a tokenizer of SocriaUX's own (no DOM, nothing evaluated): editable paths, text, pictures and groups; scripts, handlers, foreign objects, external references and entity declarations refused; embedding offered for files that lean on what cannot be edited |
| `graphics/vocabulary.ts` | The style a brief asks for (24 styles, read from style words and the direction's language, never from the quoted copy) and its vocabulary: motifs, a pattern, type and picture treatments, effects, a gradient, palette use, complexity and density |
| `graphics/capabilities.ts` | One registry of everything above (213 capabilities: 60 primitives, 24 patterns, 34 effects, 16 gradient and colour entries, 16 type treatments, 12 blend modes, 3 masks, 12 operations, 12 compositions, 24 styles), searchable in words; the menu a model would be given; `validateVisualPlan` and `validateOps`, which hold anything a model returns to the registry before it touches a design |
| `graphics/vocabedit.ts` | Edits in words that use the vocabulary, with guards for what the words say to keep |
| `graphics/compose.ts` | Twelve new compositions, the vocabulary placed on Graphics 1.0's own compositions, a strategy record on every plan |
| `boards/*` | One vocabulary per board, shared by every material; board-wide edits applied to each material's own document |
| `components/ux-v0/graphics/CeilingPanels.tsx` | The shape and pattern library with search, and the inspector's new sections |
| `components/ux-v0/graphics/GraphicCanvas.tsx` | Bézier node editing on the canvas |

## Schema additions (all optional)

- **Any object:** `blend` (12 modes), `effects` (a stack), `skewX`, `skewY`, `flipX`, `flipY`.
- **Shapes:** `shape: 'prim'` with `prim` (a primitive's kind and parameters), `shape: 'bezier'` with `bez` (a path in a 0–100 box), `rule: 'evenodd'`, `strokes` (up to four extra strokes beneath), and any gradient as `fill`.
- **Text:**
  - `fill` (a gradient, or `null` for an outline)
  - `path` (arc, circle, wave or custom)
  - `warp` (wave, rise, perspective, bulge or stagger)
  - `axes` (variable axes, held to the face's own ranges)
  - `kerning`, `features` (OpenType, from an allow-list), `paragraph`
  - `runs` (mixed weight, italic, colour, face or decoration)
  - `repeat` (an echo), `decoration`
- **Pictures:** `adjust` (brightness, contrast, saturation, hue, temperature, blur, vignette) and `crop`.
- **Groups:** `mask` (`alpha` or `luminance`, the first child masks the rest), `maskInvert`, `isolate`, and `boolean` (union, subtract, intersect or exclude, live).
- **Patterns:** a new node type `pattern`, with `gen`, `params`, 1–4 `colors` and a `bound` (box, ellipse or a primitive's outline).
- **Documents:** `swatches` and `vocabulary`.

## New operations

- **Vector operations:**
  - `boolean`, `flatten`, `outline-stroke`, `offset`, `combine`, `blend`
  - `path` (simplify, smooth, reverse, roughen, close, open)
  - `repeat` (linear, radial, grid), `mirror`
- **Arranging and compositing:** `align`, `distribute`, `mask`.
- **The document's palette and vocabulary:** `swatches`, `vocabulary`.

Every new operation is validated and transactional like the others, and refuses locked objects by name.

## The vocabulary and the AI

`vocabularyFor` reads a brief's style cues. It weighs words that name a style ("brutalist", "generative", "halftone") above words that only suggest one through the subject ("a film night", "a conference"). Quoted copy is never read: “Raw, from the Alentejo hills” is honey, not brutalism. The direction's language and the brief's kind break ties.

- **Modifiers** change how the chosen style is used rather than which style it is: monochrome, glitch, grain, neon, riso.
- **Choosing a composition:** when the words ask clearly (strength 2 or more), the style may choose one of the twelve new compositions (radial, diagonal, collage, layered, typographic, modular, technical, organic, abstract, halftone, cinematic, procedural). It never chooses one that would drop the designer's picture.
- **Dressing:** otherwise the vocabulary dresses Graphics 1.0's own compositions. It adds a type treatment, picture treatments, the vocabulary's shapes in place of the direction's figures, a pattern where there is room, and a texture on the ground.

Model output never becomes drawing code. A model-produced visual plan goes through `validateVisualPlan`, which drops unknown names (each said) and clamps numbers. Model-produced operations go through `validateOps`, which refuses an unknown operation, or any batch that does not apply as a whole, and changes nothing. `capabilityMenu()` is the registry as a model would see it. No model is called by any of this; the composer is deterministic code.

## Edits in words (`vocabedit.ts`)

Read in code into targeted, validated operations on what is already there. Nothing is regenerated.

| Words | Result |
|---|---|
| “Replace the circular motif with an irregular vector ribbon.” | That motif becomes the ribbon primitive (seeded); its box and paint are kept |
| “Add a subtle halftone treatment to the image.” | A gentle halftone on the pictures only |
| “Make the headline follow a curved path.” | The headline on an arc, its size fitted to the path |
| “Use a more complex geometric background.” | A tessellation, denser and in more inks, or the existing background pattern changed |
| “Reduce the number of decorative elements.” | The smaller half of the ornaments removed (undo brings them back) |
| “Add a grain texture without changing the layout.” | Grain on the ground's paper layer; nothing moves |
| “Create a more dramatic composition using the same colors. Keep the typography unchanged.” | Shapes enlarged across the frame with hard shadows, the ground inverted within the palette; the type untouched (the guard) |
| “Create a dense radial line pattern behind the headline.” | The radial generator, dense, behind the headline |
| “Generate an irregular geometric motif using the campaign accent color.” | A seeded irregular polygon in the accent, where the words leave room |
| “Make the background feel more organic and fluid.” | A flow field in the background |
| “Create a technical grid with subtle annotations.” | The technical generator with coordinates and crosshairs, faint |
| “Generate a repeating wave pattern that becomes denser toward the bottom.” | Waves with a downward ramp |

Guards apply across sentences:

- “keep the typography unchanged” — the type is not touched.
- “using the same colours” — only colours the design already has, in any role.
- “without changing the layout” — nothing moves.

## Boards

- **One vocabulary per board.** A board's system carries one vocabulary, read from the board's brief when the board starts and kept with the system.
- **Same identity, different execution.** Every material is composed with that vocabulary, each in its own composition: Boards still turn siblings through different compositions.
- **Board-wide edits** (“add a grain texture to every material”) are read on each material's own document and applied there, as `material-update` operations. Nothing is regenerated, and locked materials are left alone.

## The canvas

**Shapes tab.** Basic, Geometric, Organic, Decorative, Technical, Procedural and Custom, each with drawn previews and a search over every shape and pattern. Custom holds a Bézier path, SVG import (file or pasted code) and embedding.

**Inspector, by section:**

- A primitive's parameters and kind, with a new seed on request.
- A pattern's generator, parameters, seed, inks and boundary.
- **Fill:** colour, harmonies, the design's swatches, linear, radial, conic or mesh, with stops, angle, centre, radius, turns, repeat, period, opacity, linear light and presets.
- **Strokes:** colour, width, ends, joins and dashes, plus extra strokes beneath.
- **Path operations:** convert, edit nodes, outline stroke, simplify, smooth, reverse, roughen, close, open, offset and fill rule.
- **More type:** path, warp, echo, ink, line, paragraphs, kerning, OpenType, variable axes, and mixed styles by word.
- **Adjust and crop**, for pictures.
- **Compositing and transform:** blend, skew, flip, mirrored copy, repeat, and for groups mask, invert, boolean, flatten, isolate and clip.
- **Effects:** add from eight categories, presets, and for each effect on/off, reorder, settings and remove.

**Several objects selected:** booleans, combine, masks (silhouette, brightness, cut-out), blend between two shapes, and align and space to the selection or the artboard.

**Node editing.** Double-click a path, or choose Edit nodes:

- Drag an anchor or a handle; a smooth node's other handle follows.
- Alt-click a node to make it smooth or a corner.
- Double-click the path to add a node; Delete removes the picked one.
- Escape (or Done) leaves.

Every drag is one step of history.

## Export

The renderer writes standard SVG. PNG, JPEG and PDF are the same SVG drawn by the browser (`raster.ts`), so effects, masks, patterns, blend modes and gradients export as they show. The benchmark measures this: the canvas and the export path differ by a median of 0 and at worst 0.49 (mean channel difference on 0–255) across thirty designs. SVG export links its faces, including fonts used only by runs, and the IBM Plex Mono of technical pattern labels.

## Results

### Unit tests

| Suite | Result |
|---|---|
| `test/graphics-ceiling.test.mjs` (the 24 functional tests and the rest) | 98 passed |
| `test/graphics.test.mjs` (Graphics 1.0) | 70 passed |
| `test/boards.test.mjs` | 104 passed |
| `test/ux-v0.test.mjs` (websites) | 953 passed |
| The whole repository (`npm test`) | 385 of 385 suites passed |

### Browser checks

Against `next start`:

| Script | Result |
|---|---|
| `ceiling-qa.mjs` | 47 passed |
| `graphics-qa.mjs` | 55 passed |
| `boards-qa.mjs` | 62 passed |
| `ui-qa.mjs` | 85 passed |
| `mastery-qa.mjs` | 22 passed |

### Websites unchanged

`web-identity.mjs` renders every page the section bench draws with commit `4c269cf`'s modules and with these, then compares them byte for byte: 1,800 pages (each section kind and variant across 25 style runs, all 17 visual languages among them), each language's direction, and every face's lookups, weights, advances and stylesheet. Result: 2,866 comparisons, none different. Graphics' new faces and axes live in their own list (`GRAPHIC_FONTS`), so nothing a website chooses, loads or measures moved.

### Benchmark

`gfx-ceiling-bench.mjs`, thirty briefs, against commit `4c269cf`:

| Measure | 4c269cf | Now |
|---|---|---|
| Distinct compositions | 12 | 21 |
| Most designs sharing one composition | 10 | 3 |
| Layout systems recorded | — (not recorded) | 12 |
| Styles read | — (none) | 23 |
| Type treatments | 2 | 12 |
| Text hierarchies (roles by size) | 10 | 9 |
| Colour relationships (ground × palette use) | 5 | 5 |
| Picture treatments | 2 | 5 |
| Shape kinds used | 8 | 21 |
| Shape families used | 2 | 6 |
| Pattern generators used | 0 | 10 |
| Effect kinds used | 0 | 11 |
| Designs sharing a full signature | 13 | 0 |
| Words exact | 30/30 | 30/30 |
| High findings left | 0 | 0 |
| Median composition time (varies with load) | 2.3 ms | 1.7 ms |

Text hierarchies and colour relationships did **not** diversify. The vocabulary changes what a design is made of and how it is composed, not the order its words are ranked in or how its palette is assigned to the ground. That is the next piece of work.

## Limitations, said plainly

- **Backdrop blur.** Blur of what lies behind an object is not offered: SVG filters cannot read the backdrop. Blur of the object itself is.
- **Perspective-style transforms are affine:** skew, a perspective warp of type by letter size, and a perspective grid primitive. No projective transform of pictures.
- **Text to outlines is not offered.** Every type transformation here keeps the text as text, so none needs it.
- **Text on paths is one line.** Mixed-style runs are not drawn on paths or on warped text.
- **The three Graphics-only faces have no measured advance widths.** Text set in them is sized from generic widths, so a fitted line can run slightly long or short.
- **Mesh gradients are row-blended grids** (2×2 or 3×3) with eased stops, not free mesh patches.
- **SVG import approximates:**
  - A gradient's extent.
  - Pattern fills become a flat colour.
  - Stylesheets (`<style>`, classes) are not applied.
  - Filters, masks and clip paths in the file are not carried over. Embedding is offered instead.
- **Booleans and offsets return paths of corner nodes.** Curves are flattened at about 1 px.
- **Exports:**
  - PDF pages are pictures, not vector PDF.
  - No CMYK.
  - SVG export links its faces from Google Fonts rather than embedding them.
- **Benchmark limits:**
  - It draws with system fonts in both paths: fidelity is measured for the graphics features, not for faces.
  - Hierarchy and colour are measured coarsely.

## Technical debt

- `compose.ts` has grown past 1,600 lines. The new compositions and the vocabulary placement belong in a module of their own.
- The inspector's sections are one large component (`CeilingPanels.tsx`). The path, effect and type sections should split.
- **Run the checks.** Both are needed:
  - `test/graphics-ceiling.test.mjs`
  - `ceiling-qa.mjs`
- `vectorops.ts` parses SVG path data with a different parser from `shape.ts`. Graphics 1.0's `path` shapes still render through the older one, for exact backwards compatibility.
- The board-wide edit applies the graphics edit reader per artboard. A board with many carousels could batch it.
