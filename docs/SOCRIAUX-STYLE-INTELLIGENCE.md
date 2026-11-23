# SocriaUX — Style Intelligence 1.0

> **Historical.** The workspace and generation engines this describes were replaced by the design workspace, where the model writes each design as HTML and CSS (`docs/SOCRIAUX-REBUILD.md`). Old projects open there, carried over as drawn; what remains of these engines, and why, is listed in that document.

Design languages for SocriaUX Graphics and Boards: a library of 75 styles, each a validated profile (its Style DNA) that changes what is built — the construction of the frame, the type, the geometry, the colour, the surface, the picture treatment, the ornament — not only its colours. Styles are chosen from a brief, blended, explored, compared, read from a reference picture, changed in words, kept as one's own, and shared by every material of a board. Modern design is one choice among many, never the default.

Everything is deterministic and runs in the browser. No model is called, and nothing here needs one: where a model could later propose a style, its answer is validated against the library first (`validateStyleRequest`, `styleMenu`).

## Architecture

The Graphics document stays the single source of truth. A style is one optional field on a document (`style`), a direction (`style`) and a board's design system (`style`); everything else a style decides is written into ordinary, editable objects of the document. Nothing is a picture of a style.

```
words, a brief, a reference picture, a person's controls
        │
        ▼
interpret.ts ─ the request (primary, influences, strength, borrowed dimensions, sliders, medium, tone, brand)
registry.ts  ─ search and retrieval over the library (never the whole library per call)
        │
        ▼
blend.ts     ─ one coherent profile from a selection (effectiveDNA): one dominant language, influences by dimension
        │
        ▼
apply.ts     ─ the profile as palette, faces, vocabulary and a construction (runFor); a direction dressed (styledDirection)
        │
        ▼
compose.ts   ─ planFor takes the style's construction; constructions-a/b.ts build it with the composer's own kit
        │
        ▼
check.ts     ─ the same checks and bounded repair as every graphic (readability first)
evaluate.ts  ─ fidelity per dimension, repetition across designs
```

| Module | What it is |
|---|---|
| `graphics/styles/schema.ts` | The Style DNA schema (versioned, `STYLE_SCHEMA = 1`): identity, typography, geometry, composition, colour, texture, imagery, ornament, constraints, generation metadata. `normalizeStyleDNA` holds any profile to the schema and to what SocriaUX can draw (faces it loads, primitives, patterns, effects and constructions it has); idempotent. The 49 constructions and their variants. |
| `graphics/styles/library-*.ts` | The 75 profiles: 20 historical, 15 contemporary, 15 digital, 15 print, 10 cultural. Data only: adding a style is adding an entry. |
| `graphics/styles/registry.ts` | The library, normalized once and cached; `styleById` (custom styles first), `searchStyles` (names, phrases, subjects, tones, decades, facets), `styleMenu` (a compact menu a model could be given). |
| `graphics/styles/interpret.ts` | Plain words read into a request (`interpretStyle`); `selectStyles` chooses for a brief (subject, tone, audience, kind, picture; diversity by category and construction; what was shown is avoided; no unconditional modern default); `validateStyleRequest` for anything from outside. |
| `graphics/styles/blend.ts` | `StyleSelection` (primary, secondary, tertiary, strength, borrowed dimensions, density, experimentation, ornament, a construction by hand, a lock, flat colour, the custom styles it names, a seed key) and `effectiveDNA`. |
| `graphics/styles/apply.ts` | Palette within the style's variation (brand colours mapped or adopted, contrast ensured), faces, the visual vocabulary, the construction (`constructionFor`, with variant kinship), `runFor`, `styledDirection`. |
| `graphics/styles/constructions-kit.ts`, `constructions-a.ts`, `constructions-b.ts`, `constructions.ts` | The 42 style constructions (and 7 the composer already had): how each language organises a frame. Each handles portrait, square and landscape, places and cuts the designer's picture where the style places pictures, never invents a word, keeps words on solid ground or plates, and sizes its panels to the words set on them (`panelAround`). |
| `graphics/styles/propose.ts` | `styledOptions`: a brief's directions, each in a language chosen from the brief (one it names first). |
| `graphics/styles/edit.ts` | Style changes in words (`readStyleEdit`), an artboard rebuilt in a language with what is the designer's kept (`restyleArtboard`), flat colour (`flatOps`), a selection's type in a language (`typeOps`), quick sketches for previews. |
| `graphics/styles/reference.ts` | A reference picture read into a profile (`readReference`): measured, never copied; `selectionFromReferences` for "use as the style", "its visual language, not its layout" and "typography from A, colours from B". |
| `graphics/styles/custom.ts` | Custom styles: from words, a selection, a design, manual controls, brand guidelines (and references); duplicate, rename, organise in folders; a validated library; JSON export and import. |
| `graphics/styles/evaluate.ts` | Fidelity per dimension plus coherence, the brief, readability and editability, with checkpoints for a person; signatures and repetition across designs. |
| `graphics/styles/hash.ts` | The one seeded hash the style modules use (FNV-1a with a finishing mix). |
| `boards/style.ts` | A board's language changed as one previewed step (`planRestyle`). |
| `components/ux-v0/graphics/StyleExplorer.tsx` | The Styles panel and the Style Explorer. |
| `components/ux-v0/graphics/styleLibrary.ts` | The person's library, kept in this browser. |

### Changes to existing modules

- `graphics/compose.ts`: a direction's `style` is honoured by `planFor` (the style's construction where the kind lets the composition be chosen; the style's vocabulary everywhere); a brief that names its technique ("generative, procedural", "a halftone pattern") is answered in any language: the style's own pattern where it has one, else the one the words ask for, in the style's inks, placed where the construction leaves room (`patternAsked`); `look` gains lower case, an exact tracking and a line height; Board siblings step through a style's constructions and, coming round again, take the palette another way (paper, ink, accent ground).
- `graphics/doc.ts`: `GraphicDoc.style`; a `style` operation (refused for a style SocriaUX does not have).
- `graphics/check.ts`: what is beneath a word is read by the real outline of each shape (turned, slanted and mirrored as drawn), a clipping or masking group hides what is outside it, a mask's own cut is not counted, gradients are read where the words sit, turned words are sampled along their turned band, a gradient fill is judged by its mean colour, and a firm outline counts toward legibility. The bounded repair is stricter and goes further. A fix is kept only when it makes the design better and brings no high finding it did not have: the fixes are tried together, then one by one, so a safe-area nudge can no longer push one line of words onto another. Words drawn with a gradient are recoloured by replacing the gradient, since changing their colour alone changed nothing on screen. When no one colour reads on everything beneath the words, they get a ground of their own, as a last resort: a plate of a palette colour they already read on, just beneath them in their own group and turned with them.
- `graphics/render.ts`: mixed styles (runs) are kept on warped words and on words set along a path. Before, a warp or a path drew the whole text in the node's own face, so a ransom-note headline (Dada: Alfa Slab One, an Abril Fatface ampersand, a Bebas Neue word) lost its mix of faces on the canvas and in every export while the document still had it. The benchmark's font check caught it (a face named in a run was never loaded).
- `graphics/edit.ts`: style changes in words come first, with the style lock respected.
- `graphics/state.ts`: directions keep their style and type settings.
- `fonts.ts`: 67 faces added to Graphics' own list (144 in all); the website list is exactly as it was.
- `boards/system.ts`, `pipeline.ts`, `plan.ts`, `model.ts`, `edit.ts`, `website.ts`: a system's `style`; proposed systems are styled from the brief; materials step through the style's constructions, counted across the board's graphics (`graphicIndex`), not per kind, so two posters and two posts of a two-construction language are four different builds; a material records the revision it was composed at (so a hand-edited one is told apart); board style edits in words; a board's website uses the nearest website faces for Graphics-only ones.

## The library

75 profiles, each complete. Historical: Bauhaus, Swiss International Typographic Style, Art Nouveau, Art Deco, Constructivism, De Stijl, Futurism, Dada, Surrealism, Arts and Crafts, Victorian Graphic Design, Jugendstil, Mid-Century Modern, Pop Art, Op Art, Psychedelic 1960s–1970s, Postmodernism, Memphis Design, New Wave Typography, Early Modernist Editorial. Contemporary: Contemporary Minimalism, Contemporary Maximalism, Neo-Brutalism, Editorial Luxury, Corporate Modernism, Experimental Editorial, Contemporary Swiss, Typographic Minimalism, Geometric Abstraction, Organic Modernism, Contemporary Collage, Experimental Typography, Monochromatic Editorial, High-Contrast Commercial, Premium Product Advertising. Digital: Y2K, Cyberpunk, Vaporwave, Synthwave, Retro Futurism, Solarpunk, Frutiger Aero, Webcore, Glitch, Digital Brutalism, Chrome Futurism, Early Internet Nostalgia, Techno-Industrial, Holographic Digital, Futuristic Technical. Print: Risograph, Screen Print, Letterpress, Punk Zine, Grunge, Photocopy Collage, Newspaper Editorial, Vintage Advertising, Retro Comic, Halftone Pop, Analog Film Editorial, Cut-Paper Collage, Handcrafted Poster, Experimental Printmaking, Underground Music Flyer. Cultural: Japanese Modernist Editorial, Japanese Woodblock-Inspired Graphics, Scandinavian Editorial, Italian Futurist Typography, Polish Poster School, Dutch Modernist Graphic Design, Latin American Constructivist-Inspired Graphics, Indian Modernist Poster Design, South Asian Hand-Painted Cinema Poster Traditions, Chinese Contemporary Typography.

Cultural profiles describe design movements and their principles (the Polish school's painted metaphor, the Japanese modernists' single symbol and vertical axis, the Dutch modernists' square grid), never national clichés; each carries an authenticity note and its common mistakes.

## How a style shapes the construction

A style's composition names its constructions (`composition.constructions`, with a `variant`). The composer builds the first (a Board sibling, the next). Every construction is a layout of its own, not one template recoloured:

grid-columns (classic, corporate, bigtype, dutch, nordic) · bauhaus-asym · neoplastic · diagonal-dynamic (constructivist, speed, parole, kinetic) · nouveau-arch (nouveau, secession, crafts) · deco-axial · playbill (victorian, vintage) · masthead-columns (modernist, newspaper, mono) · pop-panel (pop, comic, halftone) · op-field · psychedelic-flow · memphis-scatter (memphis, atomic) · ransom-collage (punk, dada, xerox) · cut-paper · surreal-horizon · chrome-y2k (y2k, chrome) · neon-horizon (synth, vapor, cyber) · hud-frame (cyber, technical, chrome) · raw-blocks · raw-document · type-wall (brutal, swiss, newwave, experimental, flyer, futurist) · window-ui (web, geocities, vapor) · glitch-slices · overprint (riso, print) · screen-print · woodtype-stack (letterpress, hand) · film-editorial · vertical-axis (japan, china) · woodblock · painted-cinema · concrete-kinetic · flat-symbol (indian, painterly, hand) · minimal-void (minimal, type, nordic) · luxury-centred (editorial, product) · layered-planes (postmodern, newwave, dada, maximal) · ornate-border (crafts, victorian) · organic-arch (organic, solar) · soft-glass (aero, holo) · industrial-hazard · advert (vintage, commercial) · grunge-layers (grunge, printmaking) · editorial-split (experimental, luxury, mono).

## Blending

One language leads. The composition comes from the primary style (constructions are never averaged), and so do the faces unless typography is borrowed by name. An influence adds what the primary can carry, dimension by dimension, by strength: texture at any strength; ornament from 35%; geometry from 40%; a second accent and picture treatments from 50%; a gradient from 75%; a type treatment from 70%; a tertiary at half the strength. What the primary refuses (its `constraints.incompatible`) is left out and said, unless that dimension was asked for by name. Borrowed dimensions ("Swiss typography with Art Nouveau ornament") are taken whole. The person's density, experimentation and ornament override the profile's. A style lock holds the language through regeneration and edits in words.

## Intelligent selection

`selectStyles` scores every style against the brief's words (names, phrases, subjects, tones, decades, facets), leans by the kind of graphic, takes pictures into account, penalises the modern defaults unless asked, avoids what was already shown, adds a seeded nudge so projects differ, and keeps the three apart (no two of one category building the same way). A brief that names nothing gets an open, varied set rotated by the project. No question is asked.

## Style Explorer

In the editor's left column, the Styles panel names the language and its influences, and moves primary, influence, blend strength, density, experimentation and ornament (previewed on the canvas before they apply), with a lock. It also says how closely the artboard speaks its language: the fidelity reading, dimension by dimension with the reason for each score, and the checkpoints only a person can judge (never scored). With no brief to check the words against, the brief is left out rather than given a free 100. The Explorer (a full-width sheet over the canvas) browses the library by category, searches in plain words, and shows each style as a card: the design's own words composed in it, its period, what it is, what makes it, what it is for. Up to four can be compared side by side, the same words in each. A reference picture is read here. The person's own styles are made, renamed, duplicated, put in folders, exported and imported.

## Reference pictures

The picture is drawn small in the browser and measured (`ref-dna.ts`): negative space, detail, contrast, key, colourfulness and hue families, the run of its lines, symmetry, rhythm, grain; its palette is sampled. Composition, colour, texture and geometry are read from those; typography and ornament cannot be read from pixels and are taken from the nearest style, which the reading says. Nothing is copied: no positions, no words, no marks. The profile is a custom style in the same schema.

## Style changes in words

The ten the mandate names, and others like them, are read into targeted changes: "Make this more Art Deco" (an influence raised; more of its character when it already leads), "Reduce the brutalist influence" (read against the styles in the design), "Introduce risograph texture" (a dimension borrowed), "Make the typography more experimental", "Preserve the composition but change the style" (the composition kept by borrowing it), "Keep the colours but use Bauhaus geometry" (the colours and type kept), "Make this feel less like a tech startup", "Give it a vintage print aesthetic", "Remove the modern gradient treatment" (operations: gradients made flat, nothing rebuilt), "Make the layout more asymmetrical" (an asymmetric composition borrowed from a relative). A change that rebuilds is shown as a preview; the words as they now stand, approved pictures, locked objects, and locked colours and faces are kept; undo and the version history keep the original. With a text selected, a style's type is applied to the selection only. On a board, the same words change the campaign's language.

## Boards

A board's design system carries a style. Proposed systems are styled from the brief. Every material composes in the shared profile, each in its own construction (the board's graphics step through the style's constructions together, then take the palette another way when the style has fewer constructions than materials), so a poster, a post and a banner interpret one DNA rather than resizing one layout. Changing the board's language (`planRestyle`) carries the new palette and faces through every material's bindings (local overrides and locks kept and said), rebuilds the materials nobody has touched in the new language, keeps the arrangement of those edited by hand, and is applied as one step after a preview.

## Custom styles

Made from words, from the style in use (a blend and its sliders), from a design (its own colours and faces), by hand (a starting style, then its ground, ink and accent, headline face and case, density, ornament, surface and construction, set with controls), from brand guidelines (colours adopted exactly) or from a reference picture; duplicated, renamed (the id is kept, so designs that use it still find it), organised in folders; kept in this browser (`localStorage`, validated on every read); exported and imported as JSON (data only, validated, never replacing what is there). A design carries the custom styles it uses, so it reopens whole anywhere. Sharing a library with a team workspace is not available: there is no workspace store to share it through; a library moves as an exported file.

## Fidelity and repetition

`evaluateStyle` scores a design against its effective profile, from the document alone: typography (faces, case, tracking), colour (share of the palette, scheme), composition (symmetry and occupied area against the profile), geometry (the style's motifs among the shapes and patterns, by kind and by family; type-led styles are right to have few), texture (surface effects present), imagery (treatments), ornament, coherence (faces, nothing the style refuses), the brief (its words exact), readability (the checks' findings) and editability (native objects). Each score says why. What only a person can judge is listed as checkpoints and never scored. `signatureOf` and `repetition` compare designs by construction, an occupancy map of where words, shapes and pictures sit, hierarchy, faces, shapes and palette, so a set that shares a layout or differs only in colour is caught.

## Performance

The library is normalized once and cached. Search scores compiled phrases per profile. Composition is the composer's own pass (median 1.6 ms per design in the benchmark, the slowest 10.3 ms). Reference reading is arithmetic on a 96-pixel picture. Evaluation is one pass per design; repetition is n² over signatures. Nothing loops unbounded; nothing calls a model.

## Security

Profiles and selections from outside (storage, a file, a model) are validated against the schema and the registries before use: unknown faces, motifs, patterns, effects, constructions and styles are dropped and said; numbers clamped; names and descriptions stripped of markup and control characters; nothing in a profile is ever executed. A style that does not exist is refused by the document. Custom libraries are bounded (40 styles) and never shadow a built-in style. Reference pictures never leave the browser. SVG import, sanitisation and every existing guard are unchanged.

## Results

### Tests

`test/style-intelligence.test.mjs`: the twenty tests the mandate requires (profiles load; IDs unique; DNA validates; search works; selection persists; the primary shapes the composition; a secondary influences the right dimensions; strength changes the output; only supported operations are generated; unsupported ones fail safely; reference analysis yields valid data; manual edits are preserved; locked objects are unchanged; transformations are reversible; custom styles reopen; board materials share coherent DNA; local overrides stay intact; existing projects remain compatible; exports preserve appearance; websites are intact), then integration tests (a named style built first; three different languages for an open brief; the ten edits; a locked style held; board edits in words; fidelity, and an unchecked brief left out of it; two posters and two posts of a two-construction language built four ways; a brief that names its technique answered in any language, and nothing added when it names none) and the 75-style check, then the sweep: every style in each of its constructions, each palette turn and the A4, square and story formats (1,062 designs, about 2 seconds), every one readable after the bounded repair. The sweep found failures the benchmark could not reach, in palette turns and formats it does not draw: Bauhaus's asymmetry in landscape, the cut-paper words' plate on an ink ground, Constructivism's wedge under a mid-tone accent, the painted-cinema credits at the trim, and words over mixed grounds in general. Each is fixed at its cause, and the bounded repair gained its last resort. 87 assertions, all passing. `test/graphics.test.mjs` adds two (a ground for words no one colour can serve; a gradient replaced by the colour that reads; 72 in all). `test/graphics-ceiling.test.mjs` adds four: runs keep their face, weight and colour on staggered, waved and bulged words and along a path (102 in all).

### In the built app

`test/browser/ux-v0/style-qa.mjs` drives the production build in Chromium, by hand: three directions in three languages chosen from the brief; the Styles panel and its preview, apply and undo; the fidelity reading; the Explorer's cards, plain-words search, categories and comparison; a style previewed and applied with its words exact; edits in words (asymmetry, flat colour); the lock; a reference picture read and used; one's own styles (kept, renamed in place, made from words and by hand, exported, removed, imported); a reload; a board's three systems in three languages, every material in the one language, each built its own way; the board's language changed as one previewed step; no page errors; no model asked.

### The benchmark

`test/browser/ux-v0/style-bench.mjs`: the mandate's brief ("a promotional poster for a creative technology exhibition, with the event name, date, location and a short tagline") composed in all 75 styles, measured, and drawn in Chromium with the real faces.

| Measure | Result |
|---|---|
| Styles composed | 75 |
| Different constructions | 45 (the most common used by 4 of 75) |
| Different headline faces | 56 |
| Different headline treatments | 24 |
| Different grounds | 72 |
| Mean layout similarity (occupancy maps, 0–1) | 0.42 |
| Pairs with near-identical layouts (≥ 0.82) | 86 of 2,775 (3.1%) |
| Pairs that differ only in colour | 0 |
| Words exact | 75 of 75 |
| High findings left | 0 (medium: 3) |
| Faces that failed to load in the browser | 0 of 76 |
| Landscape (8 styles): high findings | 0 |
| With a photograph (8 styles): picture placed, high findings | 8 of 8, 0 |
| Fidelity (median, lowest) | 93; Art Deco 83 |
| Compose time (median, slowest) | 1.6 ms, 10.3 ms |

The failure conditions the mandate names, each measured: most outputs share a layout — passed (3.1% of pairs; most common construction 4 of 75); differences mostly colour — passed (0 pairs); near-identical typography — passed (56 faces, 24 treatments); geometry not reflecting the style — passed (1 design under the threshold); effects merely decorative — passed (4 designs under the threshold); everything looking like SaaS — passed (0 designs with the SaaS signature).

The ten required pairs, each structurally different (different constructions, layout similarity under 0.75, different headline faces): Swiss vs Bauhaus (0.33), Art Nouveau vs Art Deco (0.60), Digital Brutalism vs Neo-Brutalism (raw-document vs raw-blocks), Y2K vs Cyberpunk (0.68), Risograph vs Screen Print (0.49), Punk Zine vs Grunge (0.61), Contemporary Minimalism vs Editorial Luxury (0.05), Memphis vs Psychedelic (0.45), Constructivism vs De Stijl (0.40), Japanese Modernist Editorial vs Contemporary Swiss (0.23).

## Known limitations

- Fidelity is measured from documents, by rules. The benchmark's contact sheets are the evidence of quality, and a person's eye is the judge. No score is a model's opinion.
- Reference reading cannot see typography, or what an ornament means. Both are borrowed from the nearest style, and the reading says so.
- Workspace sharing of custom styles is not implemented (there is no workspace store). Libraries move as files.
- A style with fewer constructions than a board has materials repeats constructions: the repeats differ by how the palette is used (paper, ink, accent ground) and by format, not by construction.
- The bounded repair's last resort for words no one colour can serve is a plain plate beneath them. It reads, but it is plainer than the style's own devices; a designer may prefer to move the words.
- Style changes rebuild one artboard at a time in Graphics. A board restyle rebuilds untouched materials and re-skins edited ones.
- The benchmark covers one brief in portrait (with landscape and photograph samples); the sweep in the tests covers that brief in A4, square and story, through every construction and palette turn. Other kinds (banners, slides, menus) take the style's type, colour and vocabulary but keep their own compositions, and have not been swept per construction.
- PDF export remains high-resolution RGB pages (not CMYK, not selectable text); nothing here changes exports.
