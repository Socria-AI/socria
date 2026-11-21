# SocriaUX — Generative Design Engine 2.0

Template-independent graphics, original logos and brand identities. No model is called anywhere in this work; everything
runs in code, in the browser (and in Node for tests and benchmarks). Numbers below are measured, not estimated; the
benchmark and QA commands that produce them are listed at the end.

## 1. Phase A — the audit (evidence from commit 5317ff5, before this work)

| Dependency found | Where (at 5317ff5) | What it meant |
| --- | --- | --- |
| Only six kinds were generated | `lib/ux-v0/graphics/compose.ts:328` (`FREE_KINDS`), `:444` (`generative = … FREE_KINDS.includes(kind) && aspect ≤ 4`) | carousel, magazine, book, album, card, label, infographic, identity and banner always took a fixed archetype |
| Fixed layouts per kind | `compose.ts:341–376` (the `planFor` kind switch) | each of those kinds had one stored layout |
| Identity = a name typed in a font | `compose.ts:1122–1130` (`identityBoards`, `text(x, 'logo', name, …)`), `:1192` | no mark was ever constructed; the "logo" was live text |
| Silent fallback | `compose.ts:1022` (`if (!plan.composition) return LAYOUTS.statement(x, plan)`) | a missing composition plan quietly became a statement layout |
| Engine failure unhandled | `compose.ts:1008` (`generate(…)` with no recovery) | an engine error threw out of the composer |
| Every direction was a style | `components/ux-v0/graphics/GraphicsWorkspace.tsx:125` (`styledOptions(...)` for all options) | the three directions were always three style profiles |
| The system's logo was text only | `lib/ux-v0/boards/system.ts:60` (`logo: { text; asset? }`) | a board could not carry a generated mark |
| No per-run kerning | `lib/ux-v0/graphics/doc.ts:139` (`TextRun` without tracking) | custom spacing of a typeset wordmark was impossible (constructed lettering now does it, §3.2) |

All of these are changed by this work (§2–§5). Templates remain only as optional starting points (`engine: 'templates'`,
a hand-picked archetype, a composition family, a style's construction picked in the explorer), as before.

## 2. Graphics without templates (Phase B)

* **Every graphics kind is generated**: `GENERATIVE_KINDS` (`compose.ts`) adds album, book, magazine, card, label, banner,
  carousel and infographic to the six; the aspect window is 0.25–8.5. Each kind's needs are held as **constraints**, not
  layouts (`kindLead`): an album leads with an abstract or the given picture, a book with its title, a card and a label
  with generous space, an infographic with its data.
* **Magazine**: the masthead is held across the top (a reserved band); the engine composes the cover beneath it.
* **Carousel**: the cover is generated; every slide is generated in the cover's concept (its spatial principle, type
  strategy and colouring), with its own point as its words.
* **Infographic and diagrams**: two new Design Program instructions, validated like the others (`generative/program.ts`):
  `chart` (the brief's numbers only — a program can never supply a value; a share of 100 becomes a donut, a run of years
  a line; the source is said or asked for as an editable caption) and `list` (the brief's points, each its own text). A
  chart or list is never copied, turned or cut by an operation. Points given to other kinds (a magazine's cover lines)
  are set beside the concept, never instead of the picture.
* **Observable fallback**: if the engine throws, `plan.fallback` records why and the plan's notes say that a simple
  layout stands in and is *not* a generated design (`LAYOUTS.generative`); the composition-family path says the same
  instead of falling back silently.
* **Directions are not only styles**: the third direction is a **language generated from the brief**
  (`generative/language.ts`: `languageFor`, `languageDirection`) — a palette whose hues, saturation and depth follow the
  temperament the brief describes (and lean toward the things it names: bread is warm, the sea blue-green), with a type
  pairing from the open-licence faces SocriaUX serves; contrast is held (ink on paper ≥ 7:1, primary ≥ 3:1). Its card
  says "Generated from the brief · no style profile".

## 3. Logos (Phases C–H) — `lib/ux-v0/graphics/logo/`

### 3.1 Reading the brief (`brief.ts`)
Name exactly as written (quotes, "called/named X", "logo for X", ampersands kept: "Marrow & Pine"), initials, industry
(the lexicon's subjects), audience, personality, values, positioning, associations (things named), competitors, uses
(app icon, signage, packaging…), a category asked for, and what to avoid. **Clichés are avoided by default** (light
bulbs, brains, circuits, rockets, infinity loops, globes, swooshes, gradient blobs, hexagons, and an industry's obvious
picture such as a leaf for a green brand) unless the brief asks for one by name.

### 3.2 Lettering (`glyphs.ts`)
A constructed geometric alphabet (A–Z, 0–9, & . - ' !) drawn as stroke skeletons on a cap-height grid, emitted as
**editable Bézier paths**. Style parameters: weight, width, tracking, terminals, joins, slant. Round letters overshoot.
**Optical spacing** by side class (stem, round, diagonal, open arm) plus pair kerning (LT, AV, TO…). Modifications: a cut,
a ligature, a swash, a lifted letter, an accent letter, an inline. The word is built from its exact spelling and checked
letter by letter (`spelledExactly`); a character the alphabet lacks is said and the name is then set in a licensed face.
Typeset wordmarks use only the open-licence faces SocriaUX already serves (Google Fonts); their text stays live, and the
SVG export references the fonts rather than embedding them. Outlining keeps the source text in the record.

### 3.3 Geometry and symbols (`geom.ts`, `symbols.ts`, `raster.ts`)
Marks are built on SocriaUX's own vector library (`graphics/geometry.ts`): Bézier paths, rings, sectors, leaves,
superellipses, smooth closed forms, polygon-clipping booleans, stroke areas, affine transforms. **25 construction
methods** — convergence, interlock, modular letter, negative letter, monogram, radial repetition, fold, strata, orbit,
split, grid with one apart, wave cut, organic form, spiral, angles, emblem (with ring text), mascot, bridge/keystone arch,
one line, steps, aperture, seed, letter symbol, pixel letter, broken frame — each a parametric procedure, each declaring
what it can mean, its geometry, its temperament and any cliché it could fall into. **Optical refinement** after building:
fitted, visual centre moved toward the optical centre, strokes thickened until the mark survives at 32 px. Geometry is
validated (`geometryIssues`). Complexity is counted. Small sizes are measured on a raster (opening removes strokes
thinner than a pixel at the target size, closing fills gaps narrower than one).

### 3.4 Concepts (`concepts.ts`)
A concept is a method whose meanings answer the brief's words, built with its own parameters, with a wordmark
(constructed or typeset), a palette from the generated visual language, and its argument: **id, title, category, core
idea, symbolic rationale, construction, typography direction, geometry strategy, scalability, weaknesses** (including
honest resemblances: "an aperture is close to a camera iris"). An exploration spreads across the **15 categories**, never
reuses a method while another is unused, and refuses a mark whose silhouette is too like one already shown (an
occupancy signature, so a recolour never counts as a new concept).

### 3.5 Evaluation (`evaluate.ts`)
Twelve criteria from the geometry: distinctiveness, simplicity, memorability (labelled a proxy), scalability, legibility,
optical balance, geometry quality, conceptual coherence, brand relevance, versatility, technical validity, small-size
performance. Sizes 16/24/32/64/128/512 px; six colour tests (full, black, white, grayscale, one colour, reversed); seven
contexts (light, dark, app icon, web header, social avatar, business card, product mockup). Every evaluation carries:
*"Distinctiveness is measured against the concepts compared here and common clichés. It is not a trademark search: no
logo is claimed to be legally unique, registrable or clear to use."*

### 3.6 Lockups and variants (`build.ts`, `compose.ts`)
Horizontal, vertical (stacked), symbol, wordmark and emblem lockups with optical rules (a round symbol drawn a little
larger, symbols sized by height, the wordmark on the symbol's optical centre, clear space). Responsive variants, each an
exportable artboard: primary, horizontal, vertical, symbol only, wordmark only, black, reversed, small simplified (details
and ring text dropped, strokes heavier), app icon, favicon (64 px). Most are transparent.

### 3.7 Edits (`edits.ts`, `session.ts`)
The nine commands — more distinctive, reduce complexity, more balanced, a different conceptual direction, keep the
symbol / new wordmark, recognisable at small sizes, negative space on purpose, remove the technology aesthetic, a more
expressive wordmark — and six variation requests (five completely different concepts, a new visual direction, less
conventional, don't reuse the previous composition, a symbol instead of a wordmark, a new geometric idea). Targeted edits
leave the other part exactly as it was (a wordmark edit keeps the symbol's geometry byte for byte); goal-checked edits
say when they cannot improve their measure and keep the closest try beside the original; every edit adds concepts and
removes none. Edits are reproducible: a concept records its method, seed, weight, softness and named transforms
(`simplify`, `balance`, `negative`, `thick:k`, `cut:a`), and is rebuilt exactly from them (`rebuild.ts`).

### 3.8 In Graphics (UI)
A logo brief (or a brand-identity request) becomes the `logo` kind. **Brief → Concepts → Design**: the concepts stage
shows every concept with its argument and measured quality; compare (criterion by criterion), combine two, set aside,
explore further. The editor's **Logo tab**: the concept, lockup and colour version, the nine commands and the
explorations, the twelve criteria, the sizes strip, colour tests, contexts, lettering and symbol controls, approval, and
"Build the identity" / "Make a board from it". Words in the ask bar reach the logo edits. Every part of a mark is an
editable path on the canvas; cuts are live booleans or masks. The record (`logo/record.ts`) is normalised field by field
on load; a record cannot change the name's spelling.

## 4. Brand identity (Phase I) — `logo/identity.ts`
Built from the **approved** logo only: primary and secondary marks, a palette with roles and the contrast of each
pairing, a type system (the wordmark's face, or a licensed face of the constructed lettering's character, plus a reading
face), a motif and a pattern taken from the mark's own geometry, an icon style (the mark's stroke and corners on a 24 px
grid, with four sample icons), an imagery direction and guidelines (clear space, smallest sizes, don'ts). It comes out as
an editable identity sheet plus the ten variants, and as a **Master Design System** carrying the mark.

## 5. Boards (Phase J)
`MasterDesignSystem.logo` now carries the generated mark (its concept's parameters, rebuilt, never a picture). Materials
composed in that system place the approved logo where they set the brand's name, as **linked instances** (`link`,
`linkHash`; `logo/link.ts`). A new approved logo propagates through `propagate`: unedited instances are rebuilt, an
instance edited in a material is **kept as a local override and said**. A linked logo is never bound to the system's
tokens. "Make a board from it" creates a board with social, poster, card, presentation, website and packaging materials
planned in the identity's system. A bounded pass (`preferTokenColours`) moves words that the readability repair set in
pure white or black back to a system colour that reads as well, so token changes reach them.

## 6. Measured results

### Benchmarks (`test/browser/ux-v0/engine2-bench.mjs`)
* **A — one poster brief, 20 generations (only the seed changes)**: mean structural similarity 0.544 (max 0.786), 0 of 190
  pairs too similar; 8 spatial principles, 5 type strategies, 7 motifs; 19 of 20 pass all ten quality checks (one has 46
  medium readability findings, 0 high); 0 high findings overall; 0 fallbacks.
* **B — ten designs in each style**: mean within-style similarity Bauhaus 0.540, Swiss 0.503, Brutalism 0.594, Art Nouveau
  0.647, Y2K 0.536; too-similar pairs 0, 1, 0, 2, 0 of 45; across styles 0.555 mean (4 of 1,225 pairs too similar); 46 of
  50 pass all checks; 1 high finding (Art Nouveau #10).
* **C — 12 logo concepts for one fictional brand ("Tidewell")**: 12 categories, 11 construction methods plus one
  wordmark-only, 6 geometry types, 6 constructed and 6 typeset wordmarks (4 faces), 4 lockups, 4 negative-space marks;
  mean structural likeness 0.555, max 0.829, 0 pairs of the same structure; quality 0.82–0.99; explored in 2.6–3.0 s.
* **D — technical checks**: ten variants (nine transparent) exported as SVG with no broken numbers; the black version
  uses one colour (#111111); PNGs drawn in Chromium at 16, 24, 32, 64, 128 and 512 px have transparent corners (alpha 0)
  and ink; constructed spelling exact ("TIDEWELL"); the logo is 12 editable Bézier paths with one live boolean, no
  pictures; the native file round-trips with its 12 artboards, its record and the same mark rebuilt.
* **E — identity**: identity sheet + ten variants; social, poster, business card, slide and label materials composed
  independently in the identity's system, each carrying the linked logo (the card two), 0 high findings; a packaging
  mockup of the poster. The "website preview" here is a presentation-format hero; the live website concept is made by
  the Boards workspace in the browser.

### Tests and QA
See the commit message of this change for the final counts of: the full suite (`node test/run.mjs`), the logo suite
(`test/logo-engine.test.mjs`), graphics/boards/style/logo browser QA and the website identity check.

## 7. Limits, said plainly
* The constructed alphabet is capitals, figures and a few marks; lower-case or accented names are set in a licensed face.
* Typeset wordmarks get tracking, case and weight, but no per-pair kerning beyond the face's own (no per-run tracking in
  the document model).
* Mascots are partial: six geometric creatures plus a bird for any other.
* Distinctiveness, memorability and relevance are deterministic proxies; no logo is checked against a trademark register.
* Outlined text is not offered as an export option yet: constructed lettering is already paths; typeset wordmarks stay
  live text (fonts referenced, not embedded). No CMYK, no embedded fonts, no vector PDF are claimed.
* Three of 120 board materials in a 30-board sweep keep a white or black headline on a path, where no system colour reads
  well enough; those words then do not follow a token change (they stay readable).
