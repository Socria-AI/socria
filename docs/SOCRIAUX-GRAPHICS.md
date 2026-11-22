# SocriaUX Graphics 1.0

A second medium for SocriaUX: posters, social posts, carousels, advertisements, covers, cards, labels, banners,
identity boards and infographics, composed from a brief, in a direction, as an **editable document** (text stays
text, shapes stay vectors, pictures stay the designer's files) and edited by hand or in words. Formats are presets of
one architecture, not separate tools.

Nothing in Graphics calls a model. The brief is read from the designer's words, the directions come from SocriaUX's
own art-direction engine, the composition is planned and placed in code, checked and repaired deterministically, and
changes asked in words are read into validated operations. **Model-backed composition and editing are not
implemented** (see *Not implemented*), so every number below is the cost of code running in a browser: $0.

## The audit: what Graphics is built on (checkpoint A)

| Reused | From | For |
| --- | --- | --- |
| Projects, saving, sync | `lib/ux-v0/store.ts`, `components/ux-v0/useV0Project.ts`, `/api/ux-v0/projects` | A graphic is a `DesignProject` with `medium: 'graphic'`; saved to IndexedDB on every change, synced for a signed-in designer, held by `normalizeProject` on the way in and out of the server |
| Art direction | `lib/ux-v0/direction.ts` `proposeDirections`, `paletteFor` | Three directions per graphic; or an approved website's direction (cross-medium brand) |
| Shape system | `lib/ux-v0/form.ts` `figureFor`, `lib/ux-v0/shape.ts` recipes | The direction's own figures (mass, echo, edge, mask) in compositions and in the Add panel |
| Typefaces | `lib/ux-v0/fonts.ts` (`FONTS`, `fontStylesheet`, `nearestWeight`, `advanceEm`) | Faces, weights, Google Fonts loading, approximate text measure |
| Contrast | `lib/ux-v0/spec.ts` `ensureContrast`, `lib/ux/audit.ts` `contrastRatio` | Inks chosen to read; the contrast check |
| Uploads | `components/ux-v0/uploads.ts` `addUpload` + IndexedDB artifacts | Pictures kept in the browser (validated type and size), referenced as `upload:<id>` |
| Brand layer | `components/brand/socria-brand.css`, `ux-v0.css` | The workspace's look (`.v0`, `sb-*`); `graphics.css` adds only the editor's own parts |
| Test harness | `test/helpers/build.mjs`, `test/browser/ux-v0/env.mjs`, `test/ux-v0-route.test.mjs` fakes | Unit, route and browser tests |

## Architecture

### The document (checkpoint C) — `lib/ux-v0/graphics/doc.ts`

A renderer-independent, versioned scene graph (`schema: 1`, `migrate()` for older schemas, refusing unknown ones):

- **Artboards**: size in px (screens) or pt (print) with dpi, bleed and safe area, a ground colour or transparency,
  a format id (`formats.ts`: 19 presets, from the Instagram post and story to A3, US Letter, a business card and a label).
- **Nodes**: `text` (font, weight, italic, size, leading, tracking, alignment, case, vertical, outline, auto height),
  `shape` (rect, ellipse, line, polygon, star, a path in a 0–100 box, or a recipe of the direction's shape system;
  fill or gradient, stroke with joins/caps/dash), `image` (an asset, cover/contain, focal point, ellipse or recipe
  mask, filters), `group` (with optional clip) and `chart` (bar, column, line, donut from given data, with its source
  and unit). Every node has a stable id, a role, a box with rotation about its centre, opacity, and locked/hidden flags.
- **Assets** (only `https:`, `data:image/…` and `upload:<id>` — `javascript:`, `file:`, `http:` are refused),
  **tokens** (palette and faces) and document-level **locks** (colours, typefaces).
- `normalizeDoc()` holds anything (a saved file, a synced copy, an operation's result) to this shape and says what
  it repaired: duplicate ids renumbered, unknown kinds and unsafe paths dropped, missing pictures removed, charts
  without numbers refused ("SocriaUX does not invent numbers").
- **Operations** (`applyOp`/`applyOps`): add, update, move, resize, remove, reorder, group, ungroup, duplicate, asset,
  artboard add/update/duplicate/remove/reorder, tokens, locks. Each is validated and **transactional** (a list applies
  whole or not at all, so the last valid document is never lost); a locked object, artboard, colour or typeface refuses
  the change and names what is locked.

### Rendering (checkpoint D) — `render.ts`, `text.ts`, `raster.ts`, `export.ts`

One renderer draws an artboard as SVG: the canvas shows it, the exports start from it, the home's thumbnails use it.
Text is laid out deterministically (`layoutText`) with a `Measure`: in the browser the canvas's `measureText` with the
face loaded (`canvasMeasure`), on a server an approximate measure from calibrated advance widths. **33 faces had no
calibration** and fell back to a generic average (wide faces like Syncopate overflowed by 12 %); they were measured in
Chromium with their Google Fonts files and added to `fonts.ts` (this also sharpens the website renderer's headline
sizing for those faces).

### The editor (checkpoint E) — `components/ux-v0/graphics/`

- `GraphicsWorkspace.tsx`: the project (brief → directions → design), the history (100 steps, each operation one
  step; saving never clears it), versions (named, the last 12 kept with the project), the change-in-words bar with
  preview / apply / discard, export, keyboard shortcuts, fonts loaded before text is measured.
- `GraphicCanvas.tsx`: the artboard at any zoom; click, shift-click, double-click into groups; drag to move,
  eight handles to resize (Shift keeps proportions), a handle to turn (Shift: 15°); snapping to the artboard's
  edges, centre and safe area and to other objects (Alt: off); rulers in the artboard's unit, a 12-column grid,
  the safe-area and bleed guides; wheel to pan, ⌘/Ctrl-wheel to zoom about the pointer, Space or the middle button
  to pan. A drag is previewed and committed once.
- `GraphicPanels.tsx`: Layers (hierarchy, rename, show/hide, lock, drag to reorder, selection synced with the
  canvas), Artboards (from presets, duplicate, reorder, delete, adapt to a format), Add (text, rectangle, ellipse,
  line, polygon, star, a shape of the direction, a chart, a picture), the Inspector (position, size with kept
  proportions, rotation, opacity; typography; fill, gradient and stroke; image fit, mask, focus and filters; chart
  data, kind and source; artboard size, ground, safe area and bleed; align and distribute for several; the checks).
- `GraphicBrief.tsx`: the brief (the sentence read into fields the designer corrects; a headline is required; the
  numbers to chart; pictures; a website's direction to take) and the three directions, each shown as the design
  composed and repaired, with why it is composed that way.
- Shortcuts: arrows (Shift ×10), Delete, ⌘Z / ⇧⌘Z / ⌘Y, ⌘D, ⌘G / ⇧⌘G, ⌘C / ⌘V, ⌘A, `[` / `]`, ⌘0 / ⌘= / ⌘−,
  Escape. They never act while a field is being typed in.

### The pipeline (checkpoints F, G, J)

1. **Brief** (`compose.ts readGraphicBrief`): the kind from the words, the format, the exact quoted words (an
   apostrophe inside a quote — "Earth’s" — never ends it), dates, mood. Missing facts become bracketed placeholders
   (`[Date]`), flagged by the checks, never invented text.
2. **Accent** (`accentFor`): a colour the brief names; else one its mood and subject suggest; else one of a dozen
   well-spread accents chosen by the project; the reason is said. Before this, every graphic inherited the default
   palette and two in three benchmark designs were green.
3. **Directions**: the website engine's `proposeDirections` on a brief made from the graphic's words and accent, each
   given to graphics by `graphicDirectionOf` (tokens, type habits, shape system, spatial logic, intensity). Or an
   approved website's direction, so a website and its graphics share one brand.
4. **Plan** (`planFor`), decided before anything is placed: the archetype (type poster, image split, image full,
   minimal, Swiss, statement, masthead, book, album, card, label, infographic, process, identity, banner, carousel),
   led by the direction's language (a white cube stays quiet, a Swiss grid shows its grid, a poster language fills
   the frame) and moved by the brief's mood, which outranks the direction's default volume; the ground (the language's
   own, ink, or the accent field); the shapes; each decision with its reason.
5. **Composition** (`composeBoard`): text measured as it is set and stacked from the foot up so nothing runs past the
   safe area; shapes coloured so the type reads on them; then `ensureWords`: any word of the brief a layout had no
   place for goes into the first free band, never on top of other words.
6. **Checks and bounded repair** (`check.ts`): overflow, a word broken mid-letter, outside the safe area, contrast
   sampled across where the lines really are (a headline crossing onto a pale shape with its last words is caught),
   too small for the format, words set over words, missing pictures, placeholders, objects lost off the artboard,
   empty artboards. Fixes are operations; `refineDoc` applies them at most twice and takes back a round that does not
   improve the result. Locked objects are reported, never changed.
7. **Changes in words** (`edit.ts readGraphicEdit`): read into operations scoped to the narrowest reasonable target
   (the selection, a named object, the artboard, the document), dry-run against the locks, previewed, applied as one
   history step and one named version. Covered: bigger/smaller, more editorial, contrast without moving anything,
   replace a picture, angular/organic shapes and pattern (offered as a preview with a question when there are no
   shapes), move X beneath Y, more experimental, a second version in another pairing, preserve/lock, adapt to a
   format, an infographic easier to read, a colour. "The headline" of a wordmark board is its wordmark. Words it does
   not understand are not guessed at: it says what it can do.
8. **Format adaptation** (`adaptBoard`): the content read back by role and re-laid on the new format's own grid by
   the same plan; the words exact, the type styles kept, never stretched.

### Export and the native file (checkpoint K)

| Export | How | What is true of it |
| --- | --- | --- |
| PNG, PNG at 2×, transparent PNG, JPEG | The renderer's SVG with every picture and face embedded, drawn into a canvas of the export size | Print artboards at their dpi (A4 at 300 dpi = 2480 × 3508 px); capped at 8000 px a side; a fallback face is said when a face could not be fetched |
| SVG | The same SVG, pictures embedded as data | Text stays text; faces are linked from Google Fonts (not embedded); sized in pt for print |
| PDF | A dependency-free writer (`pdfFromPages`) placing each artboard as a high-resolution JPEG page at its exact size | **Raster, RGB, no selectable text, no embedded fonts, not CMYK, no spot colours, not PDF/X**; MediaBox, TrimBox and BleedBox set when exported with bleed |
| ZIP | Every artboard as PNG | |
| `.socriaux.json` | `socriaux.graphic/1`: the document; opened through `normalizeDoc` | Uploaded pictures go by reference (the file itself stays in the browser that added it) |

### Integration (checkpoints B, H, I)

- Graphics is a project type: "Or, a graphic → Make a graphic" on the home (the typed sentence carries over), its
  own workspace, a label and thumbnail in the collection, versions, deletion that lets go of its uploaded pictures.
- Multi-artboard: carousels (cover, a slide per point, an ending), campaigns (four formats), identity boards (five
  artboards), business cards (front and back), duplicate and adapt.
- Cross-medium: a graphic can take any approved website direction in the browser; its colours, faces, shapes and
  type habits carry over and the source is named.

## Capabilities

**Implemented and verified** (by the tests and benches below):
the document model, validation, repair notes and migration refusal; all operations, transactional, with object,
artboard, colour and typeface locks; SVG rendering of text, shapes, recipes, gradients, masks, groups, clips, images
and charts; deterministic text layout with real-font measurement in the browser; the brief, three directions and
website directions; composition for 16 archetypes and every listed format; the accent read from the brief; every
brief word placed; the checks (including collisions and contrast across the line) and bounded repair; changes in words
with preview, apply, discard, undo and redo; the canvas (selection, move, resize, rotate, snapping, rulers, grid,
guides, zoom, pan); layers, artboards, add, pictures, brand, versions and the inspector; shortcuts; uploads kept in
the browser; format adaptation; PNG/JPEG/transparent PNG/SVG/PDF/PDF with bleed/ZIP exports through the real browser
path; the native file and hostile-file handling; saving, reopening, account sync isolation; the home entry and
thumbnails.

**Implemented but unverified**: drag-to-reorder in the Layers panel (code path exists, no browser test drives HTML5
drag and drop); the gradient and image-filter inspector fields beyond their unit-tested rendering; copy/paste across
artboards; the narrow-screen (≤ 860 px) layout of the workspace.

**Partially implemented**: hierarchical layers (nested shown, always expanded: no collapse); effects (image greyscale
and contrast only: no shadows or blur); boolean path operations (none: paths are drawn, not combined); text on a
path (none); reusable components (none as such: duplicate, copy/paste, document locks and the shared direction stand
in); the identity "Application" board uses the announcement composition, with `[Date]` / `[Place]` placeholders.

**Not implemented**: model-backed composition, critique and editing (no model is called anywhere in Graphics);
image generation (no provider wired; the brief's own pictures only); a library picker for licensed pictures inside
Graphics (the moodboard's libraries are not connected to it yet); CMYK, spot colours, PDF/X and embedded fonts in PDF;
selectable text in PDF; multi-user editing; pictures following a project to another device (they stay in the browser
that added them; the editor says so and leaves them blank).

**Blocked**: none.

## Testing

| Command | Result |
| --- | --- |
| `node test/graphics.test.mjs` | 68 passed, 0 failed |
| `node test/ux-v0.test.mjs` | 952 passed, 0 failed |
| `node test/ux-v0-route.test.mjs` | 192 passed, 0 failed (including: a graphic syncs for its owner as a graphic, its document whole, a script-address picture dropped on the way in, nobody else reads, lists or deletes it, signed out gets 401) |
| `UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/graphics-qa.mjs` | 55 passed, 0 failed, 0 model calls, 0 page errors (≈ 70 s) |
| `UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/graphics-bench.mjs` | 24 briefs, results below |
| `npx tsc --noEmit -p .` | clean |
| `npx next build` | passes |

The app server for the browser runs is the production build (`next start -p 3100`) started **with the Clerk keys
present at runtime** (placeholder keys are enough): `middleware.ts` runs Clerk only when they are, and without it
`auth()` throws, so the projects API answers 500 instead of 401.

### The twenty-six scenarios (Graphics 1.0, part 20), as run by `graphics-qa.mjs`

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Create a new graphics project | Passed: from the home, kept as `medium: 'graphic'`; the brief read from the sentence; a headline-less brief refused |
| 2 | Editable poster from a brief | Passed: three distinct directions shown as designs; text objects with the exact words, drawn as SVG text; A4 in pt with bleed and safe area |
| 3 | Social media graphic | Passed: 1080 × 1080 px, exact words, no borrowed pictures |
| 4 | Luxury advertisement | Passed: 1080 × 1350 px, exact words |
| 5 | Minimalist editorial cover | Passed: magazine format, masthead and headline exact |
| 6 | Multi-artboard carousel | Passed: 7 slides, every point exactly once |
| 7 | Brand identity graphic | Passed: wordmark, palette, typography, shapes, application |
| 8 | Structured infographic | Passed: chart of exactly 72/18/10 %, source and takeaway |
| 9 | Upload and position an image | Passed: kept in the browser (nothing uploaded to a server), drawn from its own file, nudged and placed exactly, deleted |
| 10 | Create and edit vector geometry | Passed: a star, 7 points, fill, stroke, exact size with kept proportions |
| 11 | Edit typography precisely | Passed: size, tracking, face, weight, words; the face really loaded |
| 12 | Move and resize objects | Passed: pointer drag by the exact distance at the zoom, corner resize, rotation, each undoable |
| 13 | Group and ungroup | Passed: places on the artboard unchanged both ways |
| 14 | Lock an object and modify nearby elements | Passed: the locked one refuses (said), the neighbour moves; a change in words is refused with a way forward |
| 15 | Targeted AI edit | Passed: previewed (document untouched), then only the subtitle moved; kept as a named version |
| 16 | Undo and redo an AI edit | Passed: exactly before / exactly after |
| 17 | Save and reopen | Passed: after a reload, from the collection, and as a `.socriaux.json` file |
| 18 | Duplicate an artboard | Passed: same words and objects under new ids |
| 19 | Adapt to a new format | Passed: a 1080 × 1920 story, re-laid, words and type style kept |
| 20 | Graphic from a website's direction | Passed: faces and colours carried over, the source named |
| 21 | Export PNG | Passed: 2480 × 3508 px for A4 at 300 dpi; transparent ground |
| 22 | Export SVG | Passed: text as text, faces linked, no script, sized in pt |
| 23 | Export PDF | Passed: one page per artboard at exact sizes; with bleed, the trim and bleed boxes |
| 24 | Multi-artboard export | Passed: 7 PNGs in a zip, a 7-page PDF |
| 25 | Recover from an invalid operation | Passed: a broken file refused (design unchanged), an operation list with one bad step refused whole, a file with a `javascript:` picture and markup in its words opened with the picture left out and nothing run; undoable |
| 26 | User isolation and asset access | Passed: signed out, the projects API refuses list, read, write and delete (401); another project carries none of this one's pictures; deleting a graphic lets go of its pictures and only those. Owner-only access between two signed-in users is verified through the real route handler in `ux-v0-route.test.mjs` (the browser run has no signed-in users) |

## Benchmark: 24 briefs (Graphics 1.0, part 17)

Each brief composed in its first (faithful) direction; words from the brief found exactly; findings left after the
bounded repair (high/medium); placeholders left for the designer; text wider than its box when measured in Chromium
with the real face; the PNG exported through the app's Export menu, compared with the design drawn on screen (mean
difference per channel at 240 px wide); composition and repair time in Node.

| # | Brief | Kind | Direction | Artboards | Composition | Words | Left | Placeholders | Real-face overflow | Export | Export vs screen | Compose |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Experimental typography poster | poster | Swiss grid (swiss) | 1 | swiss | 5/5 | 0/0 | 0 | none | 2480×3508 | 0.42% | 28.7 ms |
| 2 | Luxury fashion advertisement | ad | Quiet luxury (quiet-luxury) | 1 | image-split | 4/4 | 0/0 | 0 | none | 1080×1350 | 0.36% | 2.6 ms |
| 3 | University event flyer | poster | Poster (poster) | 1 | type-poster | 5/5 | 0/0 | 0 | none | 2550×3300 | 0.52% | 15.3 ms |
| 4 | Electronic music festival graphic | social | Signal (future) | 1 | type-poster | 5/5 | 0/0 | 0 | none | 1080×1080 | 0.80% | 7.8 ms |
| 5 | Corporate LinkedIn announcement | announcement | Instrument panel (utility) | 1 | minimal | 3/3 | 0/0 | 2 | none | 1200×1200 | 0.50% | 9 ms |
| 6 | Instagram carousel | carousel | Soft ground (organic) | 7 | carousel | 7/7 | 0/0 | 0 | none | 1080×1080 | 2.45% | 6.5 ms |
| 7 | Premium product advertisement | ad | White cube (gallery) | 1 | image-split | 4/4 | 0/0 | 0 | none | 1080×1350 | 0.39% | 8.2 ms |
| 8 | Minimalist album cover | album | White cube (gallery) | 1 | album | 2/2 | 0/0 | 0 | none | 3000×3000 | 0.71% | 18.5 ms |
| 9 | Editorial magazine cover | magazine | Market label (craft) | 1 | masthead | 6/6 | 0/0 | 2 | none | 2513×3263 | 0.64% | 2.6 ms |
| 10 | Book cover | book | Journal (broadsheet) | 1 | book | 2/2 | 0/0 | 0 | none | 1800×2700 | 0.48% | 13.6 ms |
| 11 | Independent creative studio identity | identity | Two-colour print (retro-print) | 5 | identity | 2/2 | 0/0 | 2 | none | 1920×1080 | 0.12% | 53.6 ms |
| 12 | Restaurant promotional graphic | social | Market label (craft) | 1 | image-split | 4/4 | 0/0 | 0 | none | 1080×1080 | 0.55% | 0.7 ms |
| 13 | Technology conference poster | poster | Instrument panel (utility) | 1 | minimal | 5/5 | 0/0 | 0 | none | 2480×3508 | 0.36% | 5.8 ms |
| 14 | Abstract art exhibition graphic | poster | White cube (gallery) | 1 | type-poster | 3/3 | 0/0 | 0 | none | 2480×3508 | 0.44% | 3.8 ms |
| 15 | Nonprofit awareness campaign | social | Journal (broadsheet) | 1 | swiss | 4/4 | 0/0 | 0 | none | 1080×1350 | 0.51% | 6.5 ms |
| 16 | Product launch banner | banner | Poster (poster) | 1 | banner | 4/4 | 0/0 | 0 | none | 1920×600 | 0.30% | 7.3 ms |
| 17 | Business card | card | Market label (craft) | 2 | card | 5/5 | 0/0 | 0 | none | 1004×650 | 0.65% | 4.5 ms |
| 18 | Brand identity presentation | identity | Instrument panel (utility) | 5 | identity | 2/2 | 0/0 | 2 | none | 1920×1080 | 0.18% | 57.5 ms |
| 19 | Scientific infographic | infographic | Instrument panel (utility) | 1 | infographic | 2/2 + data exact | 0/0 | 0 | none | 1080×1350 | 0.45% | 1.5 ms |
| 20 | Statistical comparison graphic | infographic | Swiss grid (swiss) | 1 | infographic | 2/2 + data exact | 0/0 | 0 | none | 1080×1350 | 0.52% | 0.7 ms |
| 21 | Educational diagram | infographic | Geometric paper (geometric) | 1 | process | 5/5 | 0/0 | 0 | none | 1080×1350 | 0.31% | 1.3 ms |
| 22 | Boutique packaging label | label | Raw structure (brutal) | 1 | label | 5/5 | 0/0 | 0 | none | 1181×1772 | 0.64% | 6.3 ms |
| 23 | Multi-format campaign | campaign | Market label (craft) | 4 | swiss | 5/5 | 0/0 | 0 | none | 1080×1080 | 0.83% | 22.7 ms |
| 24 | Website-to-graphics brand adaptation | poster | Journal (broadsheet) | 1 | swiss | 4/4 | 0/0 | 0 | none | 2480×3508 | 0.38% | 5.4 ms |

Totals: every brief's words exact (24/24) and both charts' numbers exact; 0 high and 0 medium findings left;
0 texts wider than their box with the real faces (24/24 faces loaded); 24/24 exports at the expected size, differing
from the screen by 0.56 % on average (2.45 % at most, the carousel's arrow glyph); changes in words 183/183 read and
valid with every word kept; ten in a row 10/10 with the history back to the start; 14 distinct compositions,
10 distinct grounds and 22 distinct face pairings across the 24; in 17 of 23 briefs the three directions differ in
composition or ground (the other 6 are kinds whose composition the kind fixes — carousel, album, book, card, label,
identity — where they differ in colour, faces and shapes); 8 placeholders in 4 briefs; 0 model calls; $0.

**Fixed because of the benchmark** (first run → final): words exact 17/24 → 24/24 (layouts with no place for a call to
action, a subtitle or a brand; a headline cut at an apostrophe); changes in words 175/183 → 183/183; real-face
overflow 1 → 0 (uncalibrated faces); collisions found by the new check 4 → 0 (layouts placed at fixed fractions);
two in three designs green → accents read from the brief.

**Subjective** (not scored; see the contact sheet the bench writes, `gfx-bench/sheet.png`): the type posters, the
Swiss posters, the book, magazine and label covers and the infographics read as considered; the minimal compositions
(5, 13) and the carousel cover for a "calm" brief are deliberately quiet and may read as sparse; pictures are the
repository's small fixtures, upscaled, so photographic quality is not representative.

## Cost and performance

- Model usage: none. Every stage is code in the browser (or Node in the benchmark).
- Composition and repair: median 6.5 ms per design in Node, 57.5 ms at most (the five identity boards); in the app,
  composition waits for the direction's faces to load first (the network), then takes a few milliseconds.
- PNG export through the app: median about 1.2 s, dominated by fetching and embedding the font files and decoding
  the pictures; A4 at 300 dpi is a 2480 × 3508 canvas.
- Known bottlenecks: the canvas re-renders the artboard's SVG once a frame during a drag (fine at the tested sizes;
  documents near the 800-object limit were not profiled); the PDF is raster, so a multi-page print PDF is large.

## Risks and limitations

- PDF is raster RGB with no embedded fonts and no CMYK: not a prepress file, and said so in the export menu.
- Uploaded pictures do not travel with a synced project; on another device they are left blank and named.
- Approximate text measure (Node, server) depends on the calibration table; the browser always measures the real face.
- The directions' palettes within one graphic share a hue (by design of the direction engine: colour is a brief
  decision); asking for three others varies the languages, not the hue.
- Placeholders such as `[Date]` are added where a kind expects a fact the brief did not give; they are flagged, never
  silently printed as content, but they need the designer.

## Continuation

1. A model-backed composer behind a budget and a validator: the model proposes a plan and content placement as
   operations, `applyOps` and the checks hold them (the same contract the edits use), with the deterministic composer
   as the fallback; then model critique of the rendered artboard, said as subjective.
2. Licensed pictures in Graphics: connect the moodboard's libraries (`/api/ux-v0/images`) to the Pictures panel,
   with credits and licences carried into the asset records and the exports.
3. A vector PDF writer (text as text with embedded subsets, vectors as paths), then CMYK conversion with an ICC
   profile and its verification, only then claimed.
4. Reusable components (a symbol and its instances) and saved type and colour styles shared across artboards.
5. Boolean path operations and editable path points; text on a path; shadows and blur.
6. Pictures that travel with a synced project (the private files bucket the website imports already use).
7. A browser test for Layers drag-to-reorder and the narrow-screen workspace.
