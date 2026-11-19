# SocriaUX — Creative DNA & Originality Engine

The Creative DNA is the design language a project is drawn from. SocriaUX reads it from the Living Brief and the
moodboard. The designer can leave it to SocriaUX, set any dimension or lock what must hold. It decides which
visual languages the directions use, how each direction is shaped, which plan and booking layout each takes, what
the generator is told, and what a later change may not quietly undo.

The Originality Audit reads a design for the patterns generated pages fall into by habit, and for repetition of the
designer's earlier work. Each pattern is allowed when the brief, the designer's words or the DNA justify it.
Anything nothing justifies gets one targeted change.

The whole engine is SocriaUX's own code, and it adds no model calls. It adds one short line to the generate and refine prompts.

```
Starting Fresh → Questioning → Living Brief → Moodboard → Creative DNA (optional) → Explore Directions → Canvas → Refinement
```

| Module | What it holds |
| --- | --- |
| `lib/ux-v0/dna.ts` | The dimensions, derivation, set/lock/release/delegate/add/remove, divergence, the engine's tables, shaping a direction, reading a design back, holding locks, the prompt line |
| `lib/ux-v0/ref-dna.ts` | A reference's DNA measured from its pixels (and frames, for a clip) |
| `components/ux-v0/ref-dna-loader.ts` | Drawing a reference small on a canvas in the browser and measuring it; CORS failures said honestly |
| `lib/ux-v0/explore.ts` | How three directions differ, row by row; the near-identical check |
| `lib/ux-v0/originality.ts`, `lib/ux-v0/signature.ts` | The Originality Audit, its scores and fixes; a design's signature for the repetition check |
| `components/ux-v0/DnaStudio.tsx`, `DnaParts.tsx`, `dna.css` | The DNA step, the fingerprint glyph, the styling (SocriaUX's own brand tokens only) |
| `lib/ux-v0/direction.ts` | `proposeDirections` steered by the DNA; `withDNA`; plans and booking layouts ranked by DNA |

## 1 · The dimensions

Five core dimensions, plus four that a kind of work adds:

| Dimension | Low ↔ High | What it draws |
| --- | --- | --- |
| Visual restraint | Minimal ↔ Expressive | ornament, a second ink, frames, boxes, button weight, how loud the page is |
| Composition | Structured ↔ Experimental | the grid, the rhythm, the opening and the proportions of the page |
| Typography | Functional ↔ Editorial | the type scale, the headline face and its weight, labels and emphasis |
| Motion | Subtle ↔ Immersive | arrivals, the headline, parallax, scroll |
| Visual density | Airy ↔ Dense | spacing, the measure, how much each screen holds |
| Colour | Quiet ↔ Vivid | how saturated the accent is (never the designer's own palette) |
| Imagery | Documentary ↔ Stylised | the treatment of pictures |
| Interaction | Calm ↔ Tactile | how buttons and links answer a pointer |
| Information | Glanceable ↔ Detailed | what a dashboard leads with |

Every site gets the five core dimensions plus colour. Sites, portfolios, editorial work and anything with pictures
also get imagery. Bookings, checkouts, forms, flows and apps get interaction; dashboards get information. The
designer can add any of the others and remove the ones they added.

**Adding a dimension** (the model is extendable):
1. Add the key to `DNA_EXTRA` and its words to `DNA_META`.
2. Give it a word lexicon in `WORDS`, priors in `KIND_PRIOR`, and its position in `LANGUAGE_DNA`, `PLAN_DNA` and `BOOKING_DNA`.
3. Add a branch in `shapeByDNA` saying what it moves, and a reading in `dnaOfDesign`.
4. Add a step in `holdToDNA` if a lock on it should be held.
5. Add tests.

The interface lists it automatically.

### Derivation

`deriveDNA(input, prior)` reads votes from four sources:
- **The kind of work**: a prior, weight 0.6.
- **The brief's decisions**: density and motion specs (weight 3), the layout arrangement (2.5), a centred alignment (1.5), dominant pictures (1), the headline face (1).
- **The designer's words**, read with negation. "Not busy" counts as airy. A negation reaches one word, never across a sentence.
- **The kept references**: measured, with what the designer takes (×2.2) or leaves behind (inverted), and references to steer away from pushed against.

Each dimension records its source (`brief`, `references`, `kind`) and up to three reasons. The interface shows
these, e.g. *"From your references — 'A class at rest': generous negative space (73% of the frame quiet)"*.

A fingerprint of the inputs (`dnaBasis`) means the DNA is read again only when something it reads has changed.

### What the designer decides

- **Set** a dimension (`setDim`). It becomes the designer's, at full strength, and survives every new derivation.
- **Lock** it (`lockDim`). It then holds through every direction, generation and change, as described below.
- **Give it back** (`releaseDim`), or hand **everything** back with the locks kept (`delegateAll`).
- **Approve a direction.** Where that direction leaned away from the DNA, the DNA follows it (`adoptLean`); the choice becomes the designer's.

The DNA is saved on the project (`DesignProject.dna`) and normalised on every load. A reference's measurement is
saved on the reference (`MoodboardRef.dna`), so it is never measured twice.

### How it changes the design (not prompt decoration)

- **The visual language.** `dnaSay` (0–0.7) is the DNA's share of the choice: 0.6 × the share of core dimensions the designer set or locked, plus 0.25 × the share read from references, plus 0.06 × the share read from the brief. A DNA derived from the brief barely moves the languages, because it is the brief's words again. A DNA the designer set dominates them. The language fit is blended `(1 − say) · fit + say · affinity` on the brief's own scale (`dnaFits`). A language the designer asked to avoid stays out whatever the DNA says.
- **Directives.** Where the designer's words are silent, the DNA supplies them: airy or dense, the motion feel, minimal or loud, colourful, serif.
- **Each direction's look** (`shapeByDNA`, look phase):
  - type scale, headline face, weight, mono labels, italic emphasis;
  - grid (strict / editorial / experimental bands; directions take different grids within a band), rhythm, alignment;
  - ornament, boxes, buttons, frames, a second ink;
  - motion feel, parallax, scroll, headline treatment;
  - spacing scale and measure;
  - accent saturation, picture treatment, hover;
  - all within the language's own vocabulary, never touching a group locked in the art direction.
- **Plans and booking layouts** are ranked by `PLAN_DNA` / `BOOKING_DNA` affinity in `composeDirections`. For example, a dashboard's figures-first, detail-first or trend-first plan.
- **Openings and proportions** (layout phase, after the plan): poster or editorial openings, uneven or even splits, what a dashboard leads with.
- **Locks held** (`holdToDNA`). Each direction is read (`dnaOfDirection`) and moved a step at a time, at most four rounds, toward every dimension the designer set or locked. It stops when the reading is within 12 points.
- **Generation.** The generator is told the DNA in one line (`dnaBrief`, at most about 125 tokens in the bench). Afterwards, `fitDNA` moves a generated page that drifted from a locked dimension back in code. The answer says which dimensions it held (`dnaHeld`).
- **Refinement.** The page is read before and after a patch (`lockedDnaMoves`). Moving a locked dimension away is asked about first, the same way a locked art-direction group is. This happens on the server for the model's patches and quick edits, and in the browser for quick edits and Adjust. The refine model is told the DNA too.

## 2 · Design DNA from references

`lib/ux-v0/ref-dna.ts` measures a picture drawn at 96 px on its long side in the browser:
- luminance and RMS contrast;
- chroma and Hasler–Süsstrunk colourfulness, hue families and warmth;
- Sobel edge density;
- negative space (flat 8 × 8 blocks);
- the centroid of visual weight;
- colour-aware mirror asymmetry;
- the direction of lines (diagonal vs square, so directionless noise counts as neither);
- a regular repeat (detrended autocorrelation, three or more repeats);
- grain.

For a clip, it measures the change between frames a fifth of a second apart, at three moments.

These measurements become votes on density, restraint, composition, colour and imagery, plus motion for clips. Each comes with plain
phrases, such as "generous negative space (66% of the frame quiet)" or "strong diagonals".

**What it does not claim:**
- No model looks at the picture.
- Typography and interaction get no vote from pixels.
- A library that does not allow its pictures to be read (no CORS) cannot be measured. The interface says so and offers to retry.

**Likes and dislikes.** In the DNA step the designer marks, aspect by aspect, what to take (+) and what to leave behind (−) from each reference. Those are the moodboard's existing `take` / `leave` fields, so both views stay in step.

**Never copied.** Only where a reference sits on these dimensions is kept: integers and short phrases. No positions, no layout, no content. The reference DNA's shape is tested.

**Calibration.** The measures were tuned on synthetic images (empty frames, noise, grids, stripes, gradients), on
the test fixtures and on eight real Openverse photos fetched for calibration only (not committed). The readings rank as expected. For density: a night street (43) < concrete (78) < a forest (90) < a crowded market (99). The diagonal Swiss poster reads as the most experimental composition. A minimal interior full of architectural lines reads as dense (85): the measures read visual detail, not mood.

## 3 · Explore Directions: controlled divergence

`divergentDNA(dna, slot)` gives each direction its own lean of the DNA:
- **Slot 0** is the DNA as it is.
- **Slot 1** leans bolder: composition +24, restraint +22, motion +20, typography +10, colour +15.
- **Slot 2** leans quieter.

Only dimensions SocriaUX placed move. What the designer set or locked is identical in all three, so the three
explore around the decisions instead of against them.

Each direction board shows:
- the lean it explores, in words;
- what the DNA changed in it;
- a fingerprint of its DNA against the project's.

The board also carries a strip naming the DNA the directions are drawn from, and a **How they differ** table. That table compares layout system, typography, composition, identity, interaction and motion. Each row is marked *each its own* or *shared*.

Two directions that differ in at most one aspect besides identity (colour and surfaces) are flagged as nearly one design (`compareDirections`). A shared aspect that is the designer's own doing says so (`sharedBecause`): their design system, a group kept in the art direction, a dimension set or locked, what the brief decided leads. When a designer has decided almost everything, the board says plainly that little is left to differ, and how to open it up: unlock a group, give a dimension back, or ask for three others.

## 4 · The Originality Audit

`auditOriginality` runs one pass over the spec, plus the rendered page's audit when there is one. It asks no model and does not loop.

| Pattern | Allowed when | Targeted change |
| --- | --- | --- |
| Centred hero | the designer decided a centred layout, or their words ask for it | the hero set to one side (split/editorial, or poster/statement for an experimental DNA) |
| Bento grid | their words ask for tiles | boxes off; the points set as an index/numbered list/columns |
| Rounded cards | round corners set in the brief, words ask for soft forms, or a tactile expressive DNA the designer set | quieter corners; open or ruled sections |
| SaaS template | a software product whose DNA is not experimental | features as a numbered list; a voice before the names |
| Purple / gradients | the palette is the designer's (locked, approved, design system) or their words ask | an accent moved out of the violet band; one ink |
| Frosted glass | their words ask for it (imported pages only: the renderer never draws it) | — |
| Recycled navigation | a software product whose stock links are real sections | links named after this page's own parts |
| Generic typography | the type is the designer's, or functional type on a working screen as the DNA says | a face with a voice; more contrast between headline and text |
| Decoration without meaning | their words ask, it is the direction's signature, or the DNA is expressive (brief, references or designer) | ornament without a reason taken off |
| Repeats an earlier design | never | a grid unlike the earlier design's |

Repetition is checked against the signatures of the designer's other projects in this browser (`ProjectSummary.signature`). A signature covers language, grid, opening, headline face, accent hue, surfaces, buttons and section order.

Four scores are kept: **distinctiveness**, **composition** (hierarchy, rhythm, section count against density, alignment, overflow, line length), **relevance** (the task's components present and placed, a way onward, behaviours that work in place) and **DNA consistency**.

A fix never touches a group locked in the art direction. All unjustified fixes apply together as one version Undo takes back.

## 5 · The interface

- **The DNA step** (between Brief and Direction; the brief's button now reads *Approve and set the Creative DNA*):
  - each dimension's position in a word, in Socria's voice face;
  - a hairline slider (keyboard-operable, with a spoken value);
  - where the value came from and why;
  - a lock (the thumb turns square when locked); *SocriaUX decides* on anything set; *SocriaUX decides everything*; add or remove dimensions;
  - beside them, a study drawn from the DNA by the real renderer, which redraws as the designer changes it;
  - what each reference measured, with + / − per aspect.

  One click (*Explore directions*) moves on, so delegating costs nothing. The whole step is optional: *Approve and let SocriaUX choose* still generates directly.
- **Direction boards**: the DNA strip, each direction's lean and fingerprint, *How they differ*.
- **Canvas → Checks**:
  - the design's DNA read back against the project's, with a consistency score;
  - *Bring it back to the DNA* when a set or locked dimension drifted (patches as one version);
  - the Originality Audit with its four scores, findings, allowed reasons and fixes.
- All of it uses SocriaUX's own brand tokens (paper, ink, moss; Cormorant, Geist) in `dna.css`. Generated pages are drawn only from their own tokens, so nothing of SocriaUX's identity reaches them.

## 6 · Performance and cost

Measured in `test/browser/ux-v0/dna-bench.mjs` in this container on 19 November 2026, over two runs. The second ran
alongside a production build, so it is the slower figure:
- Deriving the DNA: median 0.3–0.6 ms (max 4.7).
- Proposing three directions with a DNA: median 14.8–16.2 ms (12.7–14.6 ms without one).
- Auditing a design: median 0.3–0.4 ms (max 1.7).
- Measuring a reference: about 100–120 ms. That figure includes this harness's canvas decode and its transfer of the pixels to Node; the browser loader measures in place.
- **Model calls added: none.** The DNA line adds at most about 500 characters (≈ 125 tokens) to a generate or refine prompt.

The DNA is re-derived only when its basis changes. References are measured once, and the result is saved on the reference.

## 7 · Verification

| What | Result |
| --- | --- |
| Unit tests (`test/ux-v0.test.mjs`) | 681 passed (56 new: DNA, references, exploration, originality) |
| Route tests (`test/ux-v0-route.test.mjs`) | 168 passed (10 new: direct/generate/refine with DNA, held locks, challenges, malformed DNA ignored) |
| Five-brief bench (`dna-bench.mjs`) | 58 passed: luxury fashion, scientific dashboard, architecture studio, experimental portfolio, booking app |
| Interface (`ui-qa.mjs`, production build) | 80 passed at 1440 / 1280 / 1024 / 768 / 390 px, including the DNA step, keyboard setting, locks, the comparison and the checks panels |
| Typecheck and production build | clean |

The bench, for each brief:
1. **The same brief from a restrained and an expressive DNA.** It draws a different language, grid and motion, and the readings move the right way (composition, restraint and motion higher). The rendered first screens are 75–94% dissimilar, cell by cell, and the structure differs (0.25–0.5).
2. **Directions are distinct.** No pair is nearly one design (at most one aspect apart besides colour), and at least 3 of 6 aspects differ in all three (3–6 measured).
3. **Locks hold.** When SocriaUX is asked again, six directions keep a locked composition and typography. A change against a locked dimension is caught, and a page that drifted is moved back.
4. **References move the DNA.** Fixture references, measured in the browser, move it (for example, composition 61 → 30 and colour 35 → 18 for two quiet references on the fashion brief), and the directions follow.
5. **The audit.** A deliberately generic page is flagged on 7 patterns, and one pass of fixes leaves nothing unjustified (distinctiveness 35 → 100). The directions' own studies score 94–100 overall.
6. **Function.** Every booking direction's booking passes the behaviour runtime's self-test in place, and every dashboard direction has its figures, chart and table.

## 8 · Limits and what is not done

- **No model-based reading of references.** References are read from pixels only. An optional image-model reading was not built: it would add cost, and it could not be tested live here. Typographic hierarchy cannot be read from pixels, and no vote is cast for it.
- **Reference measuring depends on the image host allowing CORS.** Uploads always work. A library picture that cannot be read says so.
- **App screens vary less than websites.** On the dashboard, the DNA changes the plan (what leads), the chart, the face and the spacing. The screen's frame (header, figures, chart, table) is fixed by the work and by the renderer.
- **Derivation from words is lexical.** It reads words, so it can misread a sentence. Each dimension says why it sits where it does, and the designer can correct it in one move.
- **Repetition only covers this browser.** It is checked against this browser's projects (IndexedDB), not across devices or accounts.
- **No live provider was called.** No paid calls were made. The generate and refine prompt additions and the held locks were tested against the fake provider in the route tests.
- **Calibration is limited.** The pixel measures were calibrated on synthetic images, the fixtures and eight real photos, not a large labelled set.
