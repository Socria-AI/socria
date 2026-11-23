# SocriaUX — the Generative Creative Engine

> **Historical.** The workspace and generation engines this describes were replaced by the design workspace, where the model writes each design as HTML and CSS (`docs/SOCRIAUX-REBUILD.md`). Old projects open there, carried over as drawn; what remains of these engines, and why, is listed in that document.

SocriaUX Graphics no longer chooses a design from stored layouts. For every expressive graphic (posters, social
posts, ads, announcements, campaign pieces, presentation covers) the default path now works like this:

1. It reads the brief creatively.
2. It turns the chosen language (or, with none, a direction drawn from the brief) into principles.
3. It conceives a concept.
4. It builds that concept as a validated Design Program.
5. It compiles the program into native, editable objects.

Templates, style constructions and composition families still exist, but only as optional starting points and as
vocabulary.

No model is called. The reasoning is deterministic code: a generative grammar sampled with seeds, held to
constraints, and judged by measurements. The Design Program is a structured, validated instruction format, so a
model's output could pass through the same gate, but no model path is switched on.

## 1. The audit: where the repetition came from

All file locations are in the repository. The repetition was measured, not assumed: one brief, ten generations per
style, with different seeds and directions, through the previous pipeline (script at the end of this section).

| Style | Constructions used | Distinct structures | Headline placements |
| --- | --- | --- | --- |
| Contemporary minimalism | minimal-void ×10 | 1 | 1 |
| Bauhaus | bauhaus-asym ×10 | 1 | 1 |
| Neo-brutalism | raw-blocks ×10 | 1 | 1 |
| Art Nouveau | nouveau-arch ×10 | 1 | 1 |
| Y2K | chrome-y2k ×10 | 5 (decoration only) | 1 |
| Psychedelic | psychedelic-flow ×10 | 1 | 1 |
| Swiss | grid-columns ×10 | 1 | 1 |
| Risograph | overprint ×10 | 1 | 1 |
| Luxury editorial | luxury-centred ×10 | 1 | 1 |
| No style | swiss ×8, minimal ×2 | 5 | 2 |

The causes, in the code:

- **The style picked the layout.** In `lib/ux-v0/graphics/compose.ts`, `planFor` replaced the archetype with
  `run.construction` whenever a style was set. `styles/apply.ts` (`constructionFor`) returned
  `list[(index ?? 0) % list.length]`, and the index was 0 unless a Board passed one. So every style always gave its
  first construction. Each profile lists one or two constructions (`styles/library-*.ts`, `composition.constructions`).
- **The archetype was a decision tree.** `planFor` chose one of six hand-written layouts (type-poster, image-full,
  image-split, minimal, swiss, statement) from the direction's language, axis and intensity. The same brief therefore
  always gave the same archetype.
- **Layouts had fixed geometry.** Each entry in `LAYOUTS` placed objects at fixed proportions. For example,
  `type-poster` put the headline at `x.H * 0.16` and the mass at `x.W * 0.42`.
- **Seeds changed ornament only.** `contextFor(…, seed)` varied motifs and jitter, never structure.
- **Every direction was styled.** `GraphicsWorkspace.proposeFor` gave each of the three directions its own language
  (`styledOptions`). Three directions were three styles, so three constructions; only changing style changed the
  structure.
- **Boards rotated through constructions, then recoloured.** `boards/plan.ts` (`composeMaterial`, via `styleIndex`)
  cycled through a style's one or two constructions. After that `planFor` turned the palette instead (inverse, then
  the accent as ground), which is colour-only variation.
- **Keywords chose layouts.** `vocabulary.ts` mapped brief words ("procedural", "halftone", "collage") to whole
  archetypes.
- **No model and no memory.** The composer said "without a model" in the workspace. Nothing remembered what had
  been made.

The audit script was a scratch file. Its result is the table above, and the same measurement is repeated with the
templates engine in the benchmark (§6).

## 2. The architecture

All modules are in `lib/ux-v0/graphics/generative/`.

| Module | What it does |
| --- | --- |
| `reading.ts` | The creative reading: purpose, subject (33 domains in `lexicon.ts`), audience, medium, aspect, emotion (energy, warmth, tension, play, gravity), hierarchy, what the words offer (a short title, a numeral, an initial, an ampersand, pictures, data, a long title), constraints, complexity. It responds to the brief's own words. |
| `lexicon.ts` | Subjects and their visual metaphors (signal → waveform, growth → branch, plan → lattice…). There are 35 procedural motif kinds, each with traits (curvature, rigidity, what it wants: a path, a centre, a zone or an edge). |
| `principles.ts` | A style's DNA as principles: geometry, space, type, colour, imagery, ornament, texture, what to avoid. With no style, a direction is worked out from the brief and the direction's language. These become weights over 12 spatial principles, 11 operations, 6 material sources, 9 type strategies and 6 colour relationships, with floors so nothing is ever excluded. |
| `concept.ts` | The concept. It samples a lead (type, picture, abstract, geometric, organic, collage, data), a material source, a subject-derived motif, one or two spatial principles with continuous numbers, one to three operations, a type strategy, a colour relationship and a focal point. Each choice is weighted by the language, kept compatible with the others, and pushed away from earlier concepts. It says its idea, art direction, seven strategies and reasons. Constraints (a principle, a focus, a diagonal, asymmetry, room, the unexpected, the unconventional, "not AI-looking"…) steer it. |
| `space.ts` | The spatial principles as generators, not layouts: partition, field, axis, orbit, flow, strata, constellation, edge, layers, frame, grid and centre. Each takes the concept's numbers and returns zones (focal, type, details, quiet), lines, a path, a centre, cells and planes. |
| `motifs.ts` | 35 procedural motifs drawn as native paths and shapes, following the skeleton. A waveform's frequencies come from the title's letters, rings turn about the skeleton's centre, shards are cut inside the focal zone. |
| `typeset.ts` | The nine type strategies (monumental, column, axis, path, vertical, quiet, echo, numeral, framed). The words are always referenced from the brief, never written by the engine. |
| `program.ts` | The Design Program (§3). |
| `construct.ts` | Concept to program: ground and fields, frames, planes, the edge mass, focal material (motif, letterform or the designer's picture, treated), operations as real transformations (turned, layered, repeated, cut and slid, mirrored, printed out of register, masked with a pattern, interrupted), the second principle as an overlay, structure, accents, a gradient where the language paints in one, the language's pattern where there is room, the words. |
| `compile.ts` | Program to document: native nodes, palette-resolved colours, registry effects. Then the composition solver's hard rules. Then readability: words set in the system's own colours where they read, small clutter kept off the words, plates where words straddle grounds, text fitted to its path, nothing kept that lies wholly off the frame. |
| `evaluate.ts` | The structural signature (where the words sit and how large, where figures weigh, how much is empty, symmetry, bleed; never colour), similarity between signatures, and the aesthetic cost used to choose among variants. |
| `engine.ts` | End to end, bounded: up to 4 variants per concept, up to 6 concepts when the result is too close to something to be avoided. Also the independent interpretations used for directions. |
| `validate.ts` | Ten quality checks: brief fidelity, required content, coherence, style fidelity, readability, hierarchy, structural diversity, technical validity, editability, export fidelity. |
| `edits.ts` | Creative direction in words (§5). |
| `memory.ts` | What was chosen and turned down, kept bounded in the document. |
| `record.ts` | The concept record on each artboard (idea, structure, strategies, signature, the request that made it), and the request carried by directions. |

The default is decided in `planFor` in `compose.ts`. Expressive kinds at aspect ratios from 0.3 to 4 are generated
unless one of these was chosen: a Board's archetype, a construction picked in the Style Explorer, a composition
family, or `engine: 'templates'`. Kinds whose layout the kind decides (cards, labels, books, charts, carousels'
inner slides) keep their layouts.

## 3. The Design Program

The program is structured instructions between concept and document:

- **Instructions:** `rect`, `ellipse`, `path`, `prim`, `line`, `text`, `echo`, `details`, `image`, `pattern`,
  `group`.
- **Colours:** by palette role or as hex.
- **Paths:** absolute `M L H V C S Q T Z` only.
- **Primitives, patterns and effects:** from SocriaUX's registries.
- **Pictures:** by the designer's own index.
- **Essential words:** only by reference to the brief (`content: 'headline'`…). A program cannot write its own
  headline, so the wording is always exact.

`normalizeProgram` drops anything invalid and says what it dropped, never guessing. Limits:

- At most 240 drawn instructions. The words are never dropped by that bound.
- Groups at most three deep.
- No words inside groups.
- Numbers clamped.

Nothing in a program is executed as code.

## 4. Styles as principles; no style as a direction

A style now acts as weights. Bauhaus leans toward partitions, axes and primaries; Art Deco toward centres and frames.
Every principle keeps a floor, so five Bauhaus posters share Bauhaus faces, palette, geometry and texture but are five
different arrangements. Gradient languages (Y2K's chrome and iridescence, sunsets, neon) paint their focal forms and,
where their type is treated so, their letters in readable gradients.

With no style named, `principles.ts` works out a direction from the brief: its temperament, temperature and
structure. In the benchmark the no-style condition varies as much as the styled ones (§6).

## 5. Human control

The editor has a **Concept** tab. It shows the current artboard's idea, art direction and seven strategies, plus
one-click directions:

- Rethink the composition
- Something unexpected
- Another direction
- Keep the type, change the rest
- Less conventional
- Picture first
- An abstract motif
- Not generic
- More room
- Headline central
- Four alternatives

The same words work in the ask bar, along with the structural phrasings from the composition brief: "Move the visual
focus to the bottom-right", "Use a diagonal reading flow", "Try an asymmetrical structure", "Use a radial
composition", "Give me a more editorial arrangement", "Make the typography the focal point", "Show me five different
compositions"…

How changes apply:

- Every change is previewed, then applied or discarded, and undo takes it back.
- Words, pictures, the style and locked objects are kept.
- Small changes (the focus, room, a central headline) replay the current concept and are checked against their own
  goal.
- Large ones conceive a new concept away from the current structure.
- "Show me N" adds alternatives beside the design without replacing anything.
- A discarded concept is remembered as unwanted, and the next rethink stays away from it.

The three directions in the brief step are independent interpretations: three leads, three seeds. Each card shows its
idea.

## 6. The benchmark

Run it with `UXV0_OUT=… node test/browser/ux-v0/generative-bench.mjs 8`. It writes `report.json` and contact sheets.

**Setup:** one brief, ten conditions (nine styles and no style), eight generations each. Only the seed changes
between generations, and the engine remembers its last six designs. There is also a run with a photograph, and the
same seeds through the template pipeline for comparison.

**Measured on the final run:**
- **Within each style:** mean structural similarity 0.53–0.63; the template pipeline scores 0.89–1.00 (one
  construction per style).
- **Too-similar pairs within a style:** 1 of 280 (Minimalist editorial, at 0.87 against a 0.86 threshold).
- **Across all 80 designs:** 11 of 3,160 pairs over the threshold.
- **Choices used:** all 12 spatial principles, all 9 type strategies and 18 motif kinds. Per style: 4–6 principles,
  3–6 type strategies, 4–8 motifs.
- **High findings:** 0.
- **Quality checks:** 77 of 80 designs pass all ten. The three that do not:
  - a title only 1.5× the next text (hierarchy);
  - a structure 0.87 similar to an earlier one (diversity);
  - three medium readability findings.
- **With a photograph:** the picture is used in 6 of 6 designs; the engine led with geometry, an abstract idea, an
  organic form and the picture itself.
- **Speed:** about 11 ms per design across the run, including the template comparison and validation, with no model.

The contact sheets show the actual designs. Judging whether each design is good is left to the eye; nothing on the
sheets is scored by eye.

## 7. Tests

- `test/generative-engine.test.mjs` (49 checks) covers: reading, principles, concepts and constraints, the program
  gate, the compiler and the default path, diversity against the templates, pictures, creative edits (scope, goals,
  locks, reversibility), memory, Boards, templates as starting points, interpretations, and formats with readability
  and cost.
- Older tests that asserted "the style decides the construction" now assert the new architecture. The constructions
  are still tested through `engine: 'templates'`.
- Browser QA (`graphics-qa`, `style-qa`, `boards-qa`) and the website identity check pass.

## 8. Limits, honestly

- The reasoning is code, not a model. The concept space is large and combinatorial, but finite: twelve spatial
  principles, thirty-five motif kinds and nine type strategies, with continuous parameters. It invents arrangements
  by combination and constraint, not by open-ended imagination.
- Quality is held by rules and measurements (hierarchy, room, balance, readability, the document's checks). It is not
  an eye. Some generated designs are busier or quieter than a designer would choose. The contact sheets show it.
- The Design Program is model-ready, but no model writes one: paid inference was not authorised.
- Kinds with a fixed structure (business cards, labels, books, charts, carousel inner slides) keep their layouts.
- Continuity across carousel slides is not generative yet.
