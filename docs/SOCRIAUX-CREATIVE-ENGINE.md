# SocriaUX — the creative engine overhaul

What was wrong with how SocriaUX understood, planned, made, changed and judged graphic design; what was rebuilt; how
it was verified; and what is still open. Every count here was measured in this repository on the commit that adds
this file, from documents that were really built and rendered. Two things were **not** measured and are marked as
such wherever they appear: latency, and token cost through the provider's API (section 5 says why).

Scope: the existing creative engine for graphics (posters, covers, social graphics, announcements: `lib/ux-v0/graphics`).
No product feature, creation mode, provider, integration or dependency was added.

---

## 1. Audit: what actually happened to a request

Traced end to end (`components/ux-v0/graphics/GraphicsWorkspace.tsx`, `GraphicEditor.tsx`, `lib/ux-v0/graphics/*`).

**A new design.** The brief's words were read by regular expressions (`generative/reading.ts`, `generative/lexicon.ts`);
a direction was picked from style profiles and a generated language; a concept was drawn from a seeded procedure
(`generative/concept.ts`), built into a program (`construct.ts`), compiled and checked. The workspace then said
"Composed and checked in N ms, **without a model**." No model ever read the brief or decided anything about a graphic.

**A change asked in words.** In order: logo edits, critique words, brand words, combining artboards, alternatives —
then a regex reader (`creative/interpret.ts`). When the reader was "certain" its plan was used and no model was asked.
Otherwise a model was asked — but only to fill a *plan* in a closed vocabulary (`creative/plan.ts`): one of **16 themes**,
**25 qualities**, 7 composition moves, fixed palette shifts and type characters. Each of those is a fixed recipe in
`creative/lexicon.ts`; for example `premium` is always "a deep ground with a metallic accent, a luxurious face, fewer
forms, depth 1, a gradient". The model could not name an object, set a size, move anything or draw anything. When
nothing matched, the person got a canned question ("A theme / More refined / Bolder / A completely new idea").

### Root causes

| # | Root cause | Evidence in code | What the person saw |
|---|---|---|---|
| 1 | **No creative reasoning in generation.** Graphics were made entirely by procedures seeded from keyword matches. | `generative/engine.ts` ("No model is called"); `GraphicsWorkspace.composeIn` | Arbitrary decoration: a bar chart on a housing lecture poster, a pie chart on a music poster, a starburst for an exhibition about light. |
| 2 | **Intent was matched, not understood.** A regex lexicon decided what words meant; the model was a fallback. | `creativePlanner.planChange`: `if (read.certain) → reader` | "Cloud themed" = literal clouds on a blue gradient. "Sophisticated" = desaturate and swap to Bodoni. |
| 3 | **The model's answer was confined to the lexicon.** Its schema allowed only catalogue ids; it never saw objects as things it could change. | `creative/model.ts CREATIVE_PLAN_SCHEMA`, `readingOf` (no ids) | Any request outside 16 themes × 25 qualities collapsed to the nearest recipe: generic and repetitive by construction. |
| 4 | **Changes were recipes run over the whole artboard**, not edits to objects. | `creative/execute.ts` (theme → remove forms, add theme forms, regrade ground, repaint) | Broad requests destroyed the composition; "untouched: 0 objects" in 4 of 7 baseline edits. |
| 5 | **Preservation was a hint, not a guarantee.** "Keep" only removed a decision from the plan; composition moves still relaid every object. | `plan.ts` keep ↔ decision filter; `execute.ts` rethink | "Keep the logo and typography" moved the logo and doubled the headline. |
| 6 | **No truth check on outcomes.** What was said came from the plan, not from the result; nothing compared before and after. | `GraphicEditor.precise` returned true on any read; the sentence shown was the plan's label | "Move the focal point toward the right" replaced the whole composition (23 objects removed, 22 added), left the title broken into a narrow column and unreadable — and was reported as "the visual focus moved to the right". |
| 7 | **No memory of states.** The model's context had the last four turns as sentences; nothing recorded what a turn replaced. | `recentRef` (six strings) | "Go back to the original colours": nothing happened. |
| 8 | **Evaluation was structural only**; nothing with judgement ever looked at the render. | `check.ts`, `visual.ts` (contrast/coverage) | Words over forms and an unreadable headline (D, G) were shown as finished. |

The model in use was never the limit: for graphics it was barely used. The renderer was not the limit either: the
document model, the program gate, the compiler and the solver were already capable of far more than the procedures
asked of them (`generative/program.ts` even says "a model could write one too").

### Baseline, rendered

`ENGINE=rules node test/browser/ux-v0/creative-engine-bench.mjs` runs the engine as it was. Sheets:
`docs/creative-engine/before-edits.png`, `before-H.png`, `before-I.png`, `before-J.png`; numbers in
`docs/creative-engine/before-report.json`.

| Test | Instruction | What the old engine did (measured from the documents, seen in the render) |
|---|---|---|
| A | Make this cloud themed. | 15 objects removed, 5 clip-art clouds added on a blue gradient; 0 objects untouched; logo moved. |
| B | More sophisticated and atmospheric. | Colours desaturated, faces swapped to Bodoni; composition unchanged. |
| C | Like a premium architecture studio. | The composition replaced by sets of horizontal rules; the supporting line runs off its plate; 0 objects untouched. |
| D | Keep the logo and typography. Redesign everything else. | Logo moved; headline size 78 → 152 and overlapped by a blob, unreadable; 0 objects untouched. |
| E | Make the headline slightly smaller. | Correct: 1 object changed, 22 untouched. |
| F | More cinematic (imagery, lighting, background, typography). | A dark overlay and a heavier face; the bar chart stays; no change to composition or imagery. |
| G | Make it better. | 23 objects removed, 32 added; words collide; the headline is illegible. |
| H/I | New designs for six subjects | Unrelated decorative devices (charts, bursts, grids, scribbles) chosen by seed. |
| J | Three changes, then "go back to the original colours" | Turn 3 replaced the composition (23 removed, 22 added) and left the title unreadable; turn 4 changed nothing and the original colours did not come back. |

---

## 2. What was rebuilt

One idea: **a creative director (the model) decides; the engine validates, builds, checks and renders.** The
director reads what the person means against the design as it is, decides, and answers in the engine's own
instrument — a design *program* for a new design, *edits by object id* for a change. Nothing it writes is trusted or
executed: everything passes the same gates a hand on the canvas passes.

```
the person's words ──► (exact change to something named?) ──► precise reader, in code, no model
        │ no
        ▼
  protect.ts        what they said to keep, read from the words (enforced in code, whatever is answered)
  sheet.ts          the design as it is: every object by id, what it IS, type, colour, place; palette by role
  record.ts         the project: the idea, the journal of turns (kept / turned down / what each replaced)
        ▼
  principles.ts + prompts.ts ──► the director (Claude Sonnet 5.5) ──► one JSON answer
        ▼
  schema.ts         held to its shape: ids that exist, faces in the library, colours, bounds; dropped = said
        ▼
  design.ts → compose.ts composeProgram     (a design: scale → program gate → compile → solver → checks)
  apply.ts                                   (a change: guard → doc operations → refit → contrast → diff)
        ▼
  evaluate.ts       measured: words present, cut/broken/colliding/covered, scale, generic habits, the stock structure
  flow.ts           one look at the rendered picture by the director; corrections held to what the change touched,
                    and kept only if nothing measurable gets worse
        ▼
  journal.ts        what really changed, object by object; the turn written with what it replaced
```

New modules, all under `lib/ux-v0/graphics/director/`:

| File | What it is |
|---|---|
| `principles.ts` | The one instruction text for every creative call: understand before acting (six levels of intent), reason briefly, design quality with no house style, the lazy defaults named as things not to reach for, the instrument (written from the registries, so it cannot describe what the engine does not draw), the three answers. Identical for every call, so the provider's prompt cache serves it. |
| `prompts.ts` | What differs per call, kept apart by what it is: task, the person's words, content to set, what was already decided, the project, the brand, the design sheet. |
| `sheet.ts` | The design read for the director: stable ids, semantic roles ("main headline", "plate behind words", "large form (path)"), type, colour by palette role, boxes in a 1000-unit frame, reading order; and the project memory. |
| `schema.ts` | The three answers (design, edit, review) held to their shape. Everything dropped is listed, never silent. |
| `frame.ts` | One coordinate frame (1000 units wide) for every format, scaled to the artboard before the gate. |
| `design.ts` | A directed design made into a document through the existing program gate, compiler and solver. |
| `protect.ts` | What the person said to keep, read from their words and enforced on every edit. |
| `apply.ts` | Edits carried out as validated document operations; text refitted; contrast held; outcome compared. |
| `journal.ts`, `record.ts` | What a change did, measured; the turn kept with the exact values it replaced; restore from them. |
| `evaluate.ts` | Adherence, craft checks, scale, words covered by a form (judged line by line, where the words sit), and the generic-habit detector, which also finds the stock poster structure. |
| `flow.ts` | The orchestration, once, for the browser and for the benchmark. At most one review per request; never a loop. After a change that was not a redesign, the review's corrections are held to what the change touched (`withinScope`). |
| `tier.ts` | Which requests are exact (tried in code first; economy tier) and which need the premium tier. |

Changed: `GraphicsWorkspace.tsx` (designs are made by the director; the engine composes only when it cannot be
reached, and says so), `GraphicEditor.tsx` (exact edits in code, everything creative to the director, the old reader
only as a fallback that says it is one; every applied or discarded change is journaled), `compose.ts`
(`composeProgram`, `compileOnBoard`), `doc.ts` (`Artboard.directed`), routes `graphic-design` (new stage for an
existing capability) and `graphic-edit`. Removed: `creative/model.ts` and `creativePlanner.ts` (the plan-in-a-lexicon
model path), with its schema.

### How each requirement is met

- **Levels of intent** (object / element / composition / aesthetic / conceptual / global): the director must classify
  the request and say what it affects and preserves before it answers (`understanding`); the level decides whether a
  picture travels with the request and whether the result is reviewed.
- **Semantic understanding**: the sheet says what each object is, not just where it is.
- **Preservation**: read from the words in code, told to the director, and enforced on its answer; unrelated objects
  cannot change because edits are by id and the result is compared with what was there.
- **Continuity**: the idea and a journal travel with the artboard; turned-down proposals are marked as such; an
  earlier state is restored from recorded values by code, not re-imagined — and a restore of one side of a turn
  (its colours, its type, its layout) leaves standing what later turns changed on purpose.
- **Truthful outcomes**: what is said to the person is built from the comparison; a change that changed nothing is
  reported as nothing; every dropped or failed edit is listed.
- **Slop**: named in the instructions as defaults not to reach for; counted in code after every design; shown to the
  director when it reviews the render.
- **Render-and-evaluate**: the browser's own render of the artboard is sent to the director once (a real picture);
  its corrections are applied only if no measurable problem gets worse, and after an edit only where the edit
  reached (a correction to something the person never mentioned is listed and not applied).
- **Design systems**: an attached system's colours and faces are passed as hard decisions and as brand rules; the
  existing brand guard still runs afterwards.
- **Cost discipline**: exact edits cost no model call; one call for an object-level change; two for a design or a
  change of feel (the ask, then one review); no loops.

---

## 3. Benchmark: what was run, and how

`test/browser/ux-v0/creative-engine-bench.mjs` runs tests A–K on real documents and renders every one of them in
Chromium with the real typefaces measured (`settle`), not estimated.

- `ENGINE=rules` — the engine as it was. No model. This is the **before**.
- `ENGINE=director BENCH_LIVE=agents` — the new engine. The orchestration is the product's own (`flow.ts`
  `designFlow`, `editFlow`): the product's instructions, messages, gates, executor, journal and measures. Only the
  transport differs. Each request (the instructions, the message, and the rendered picture when one travels) was
  written to a file and answered by **Claude Sonnet** running as a separate agent that was given those files and
  nothing else; its JSON answer was read back and carried through the engine. 45 requests were answered this way
  (32 make up the final run; the rest were superseded as the engine was corrected, and are kept too).
  Every answer is kept in `docs/creative-engine/answers/`.
- `ENGINE=director BENCH_LIVE=api` — the same, through the product's own call path (`askJson`, each stage's route).
  **Not run**: it needs `ANTHROPIC_API_KEY` in the environment, and none was available to this work. So latency,
  token usage, cache behaviour and cost through the API are **unmeasured**.

What this means for every "after" below: the designs and edits are a real model's answers to the product's real
prompts, built and rendered by the product's real engine. They are not the product's API path end to end.

The instructions were refined while the benchmark ran (section 6 lists each change). Answers are stored by request,
so answers given before a refinement were given under the earlier text. `answers/instructions-as-asked.md` is the
final text; `answers/first-round/` holds the five subject designs made before the structure refinement.

Visual inspection: every sheet in `docs/creative-engine/` was looked at, by the engineer doing this work and — for
the 15 reviews — by the model, from the rendered picture. No panel of designers rated anything. Where this
document says a result "reads" or "works", that is a judgement from looking at the render, not a measurement.

## 4. Results

Sheets: `compare-edits.png`, `compare-subjects.png`, `compare-continuity.png`, `compare-new-design.png` (before
above, after below), and the separate `before-*.png` / `after-*.png`. Numbers: `before-report.json`,
`after-report.json`. Each engine edits its own base design for the same brief ("Rooms for Living", a lecture series
on housing at an architecture studio) — the old engine's base is a tilted card over a bar chart; the new one is a
building cut open in section, six rooms for six evenings.

### A–G: one design, seven instructions

"Moved" = position or size changed. "Restyled only" = colour, stroke or opacity changed and nothing else (a new
palette repaints every object, so "changed" alone says little).

| | Instruction | Before (old engine) | After (creative director) |
|---|---|---|---|
| A | Make this cloud themed. | 15 objects removed, 5 added, 8 changed, **0 left alone**; logo moved. Clip-art clouds on a blue gradient; the composition gone. | **0 removed, 0 moved**; 6 added; 21 restyled only. Read as *aesthetic*: a sky palette, a ground that lightens downward, clouds drifting through the open rooms. Layout, drawing and words exactly where they were. |
| B | More sophisticated and atmospheric. | 19 changed, 3 removed; faces swapped to Bodoni, colours desaturated. | 0 removed, 2 moved, 4 added. The section becomes an evening scene: lamp and window cast light, hairline walls, italic serif subhead. Review found the details wrapping badly and fixed it. |
| C | Like a premium architecture studio. | 15 removed, 18 added, **0 left alone**; the design replaced by sets of rules. | 0 removed, 0 moved, 6 added: hairline walls, a section hatch, a dimension line, stone and brass for ochre and black, lighter type. Review: ship. |
| D | Keep the logo and typography. Redesign everything else. | Logo **moved**; headline size 78 → 152 under a blob, unreadable; 23 removed. | Logo **identical**; every face, size and weight **identical** (checked in code); 14 forms removed, 54 added: a drafted floor plan in cobalt and yellow, the headline moved beneath it. |
| E | Make the headline slightly smaller. | 1 object changed, 22 untouched. Correct. | 1 object changed (185 → 171), 20 untouched. Done in code, no model call. |
| F | More cinematic: imagery, lighting, background, typography. | A dark overlay and a heavier face; the bar chart stays; nothing done to imagery. | A night scene: near-black ground, the lit room blooming, lamp and window glowing, vignette and grain, italic subhead, tracked details — the four things named, changed together. First run: 4 of 21 edits rejected (see section 6); after the fix, 0. |
| G | Make it better. | 23 removed, 32 added, **0 left alone**; words collide; headline illegible. | 1 object changed, 20 untouched: the headline set larger and tighter to lead the sheet. Preserves what works. **Conservative** — see limitations. |

Failed operations in the final run: 0 in every test. Words kept exactly: every test, both engines.

### H: a new design from an open brief

"Create an experimental editorial poster for an independent architecture publication." Before: a seeded
composition with unrelated devices. After: *a plinth is the base that waits for something to stand on it* — a black
slab carrying PLINTH, a dashed ghost tower above it, its roof lifted off in vermilion ("The Unbuilt"). Review found
the ghost drawn solid and the subhead orphaned; both corrected.

### I: five unrelated subjects

| | Before | After, first round | After, second round |
|---|---|---|---|
| Ideas | devices chosen by seed (charts, bursts, grids) | one idea per subject, from the subject | the same |
| Mean structural similarity (0–1) | **0.516** | 0.711 | **0.617** |
| Highest pair | 0.687 | 0.884 (over the 0.86 "same structure" line) | 0.814 |
| Designs on the stock poster structure | 0 of 5 | **4 of 5** | **1 of 5** |
| Distinct display faces | 5 | 4 | 3 |
| Distinct grounds | 5 | 5 | 5 |

This is the most important finding of the benchmark, and it is not a clean win. The first round gave five real,
distinct ideas (a gold crescent in eclipse for the fashion house; a modular grid for the conference; a door swing
in plan for the open house; a shoreline at low tide for the gig; a disc and its afterimage for the exhibition) —
and set four of them on one skeleton: picture above, title beneath, a strip of details across the foot. The old
engine's structures were *more* varied than that, because they were random.

The fix was made where the cause was: structure became the first decision the director must state and justify, the
skeleton was named as a default, and the engine now detects it in code so it is counted and shown at review
(section 6). The five designs were asked again: one of five still uses the skeleton, similarity fell from 0.711 to
0.617, no pair is over the line. It remains above the old engine's 0.516, and typeface choice narrowed (Archivo and
Instrument Serif twice each). Varied structure by decision is better than varied structure by dice, but this is
"improved", not "solved".

### J: one project, four turns

| Turn | Before | After |
|---|---|---|
| 1. Make the colours warm and earthy. | palette changed | palette changed by role: clay, umber, rust, ochre; nothing moved |
| 2. Make the typography more expressive. | faces swapped | headline larger, tighter, italic; subhead into the same serif; colours kept |
| 3. Move the focal point toward the right. | **the whole composition replaced**: 23 objects removed, 22 added, the title broken into a narrow column and unreadable; reported as "the visual focus moved to the right" | 5 objects changed, none added or removed: headline flush right, the lit room and its lamp moved to the right-hand room |
| 4. Go back to the original colours. | **"This design already is what those words ask for."** Nothing restored. | the director answered `restore turn 1, colours`; the engine put back the exact palette. Italic type and the right-hand composition kept. |

Turn 4 exposed a real defect on its first run: restoring the colours also put the *original lit room* back, undoing
part of turn 3. Fixed in `apply.ts` (section 6) and re-run; the sheet shows the corrected result.

### K: generic habits, counted across all 14 designs of each run

| | Before | After |
|---|---|---|
| Purple or blue gradient grounds | 0 | 0 |
| Graded grounds | 3 | 2 (A's sky and F's vignette: both asked for) |
| Designs with glows, blurs or soft shadows | **7** | 2 (A's soft clouds, F's light: both asked for) |
| Rounded cards | 0 | 0 |
| Every line centred | 1 | 0 |
| Three or more typefaces | 3 | 0 |
| Stock poster structure | 0 | 2 (one subject design, and D's redesign) |

### Refinement: the 15 reviews

Each new design and each change of feel was looked at once, as a rendered picture. 10 found something and their
corrections were applied (a call to action wrapping onto two lines, a subhead colliding with a bar, a stray chord
across a shape, a ghost image smearing a title, a headline past the safe margin). 4 said ship. 1 reached for an
object the change had not touched and was held. 0 were reverted for making something measurably worse.

Read the other way: **two thirds of first-pass results had a visible flaw.** The review is doing necessary work,
not polish — and it is one look, so what it misses ships.

## 5. Cost and latency

**Latency: not measured.** The agents that answered took 25–44 s for a design and 11–21 s for a review, but that
includes an agent reading files with tools and is not the API's latency. What can be said without a measurement: a
new graphic went from milliseconds (no model) to one generation of roughly 1,000–3,000 output tokens plus one
short review. That is tens of seconds, not milliseconds, and it is the largest cost of this change to the person
using it. Exact edits ("make the headline smaller") are still carried out in code with no call at all.

**Tokens and cost: estimated from character counts, not measured**, and without reasoning tokens (billed as
output; unknown until the API path is run). At the prices in `lib/model-router.ts` for the model the stages route
to ($2 / $0.10 cached / $10 per million tokens):

| Call | Input (est.) | Output (est.) | Cold | With the instructions cached |
|---|---|---|---|---|
| New design | ~9,900 | ~900 | ~$0.03 | ~$0.011 |
| Review (with picture) | ~12,900 | ~140 | ~$0.027 | ~$0.008 |
| Edit by the director | ~12,800 | ~740 | ~$0.033 | ~$0.014 |
| Exact edit in code | 0 | 0 | $0 | $0 |

So a new graphic with its review is roughly $0.02–0.06, and a change of feel with its review about the same;
before, both were $0. The instructions are ~9,900 tokens and identical for every creative call, which is what makes
the cached column possible — whether the cache is in fact hit in production is unverified. Calls per request are
bounded in code: 0 for an exact edit, 1 for an object-level change, 2 for a design or a change of feel. There is
no loop.

Budgets already in the product apply to the new stages (`graphic-design` premium, `creative-edit` by tier,
`graphic-review` economy; `MAX_TOKENS` 7000 / 5000 / 2600).

## 6. What the benchmark found, and what was done about it

Found by running it, fixed in the engine, each with a test:

| Found | Cause | Fix |
|---|---|---|
| The baseline itself looked broken ("LIVIN / G") | the benchmark rendered with estimated type widths | renders now measure the real faces; baseline re-run and the audit corrected |
| An orange bar drawn over the last line of a subhead | the director placed a form after the words | `liftCoveredWords` in `composeProgram`; new material goes beneath words by default; a "covered" finding |
| Wave patterns far too heavy | pattern lengths scaled twice | `frame.ts scaleInstruction` |
| "Covered" reported where nothing was covered | judged by the whole text box | judged line by line, where the words sit |
| F: 4 of 21 edits rejected ("an ellipse without a valid box") | the design sheet writes boxes as `[x, y, w, h]`; the gate accepted only `{x,y,w,h}`. Reported truthfully as failed, never as done — but the fault was the engine's own inconsistency | both notations read (`frame.ts`, `schema.ts`) |
| A review deleted an arrow the person had not mentioned | nothing limited a review after an edit | `flow.ts withinScope`: corrections held to what the change touched; the rest listed, not applied |
| Restoring colours undid a later turn's choice of lit room | restore put back every recorded value regardless of later turns | a property a later kept turn changed is left; its colour follows the palette back by role |
| Four of five subjects on one skeleton | nothing made structure a decision | structure is the first stated decision; the skeleton named as a default; `stockStructure` detected in code |

Changes to the instruction text after some answers had been given: the pattern-units and add-order notes; "never
draw an opaque form over words"; the restore sentence; the review-scope sentence; the structure paragraph and the
`structure:` decision. Only the last was followed by asking again (the five subject designs).

## 7. Classification

*Verified* means: built, rendered, inspected, and covered by a test that passes. Where the evidence is the agents
run rather than the API path, that is said.

| Correction | Status |
|---|---|
| A model reads the brief and decides the design (was: no model at all) | **Implemented and verified** on the agents run; API path unverified |
| Edits by object id as validated operations (was: recipes over the whole artboard) | **Implemented and verified** |
| The closed lexicon removed from the model path (16 themes × 25 qualities) | **Implemented and verified** (`creative/model.ts`, `creativePlanner.ts` deleted; suite passes) |
| Levels of intent stated before acting | **Implemented and verified** (every edit answer carries it; it selects picture and review) |
| Preservation enforced in code ("keep the logo and typography") | **Implemented and verified** (D: identical; tests with hostile answers) |
| Unaffected content preserved | **Implemented and verified** (A, C: 0 moved, 0 removed; G: 20 of 21 untouched) |
| Truthful outcomes; nothing reported as done that changed nothing | **Implemented and verified** (J3; failed edits listed; "nothing changed" said) |
| Journal and exact restore | **Implemented and verified** (J4), after one defect found and fixed |
| Render-and-evaluate with a real picture, bounded to one look | **Implemented and verified** on the agents run (15 reviews); the browser path (`components/ux-v0/graphics/director.ts`) is **implemented but unverified** end to end |
| Slop named, detected in code, counted | **Implemented and verified** (K) |
| Structural repetition across subjects | **Partially implemented**: detected and reduced (4 of 5 → 1 of 5), not eliminated |
| Typeface variety across subjects | **Not implemented**: narrowed in the second round (3 distinct of 5) |
| One coherent instruction hierarchy, cacheable | **Implemented**; cache behaviour **unverified** |
| Design-system adherence passed as hard decisions | **Implemented but unverified**: covered by unit tests, not by a rendered benchmark with a system attached |
| Latency and cost within a viable range | **Blocked**: unmeasured without an API key in the session |
| Questioning | **Not changed** beyond the director's own optional question; audited lightly, left as it was |
| Logo, identity, carousel and card kinds; Boards; websites | **Not implemented**: still on the previous engine and reader |

## 8. Verification

- `npx tsc --noEmit`: clean.
- `node test/director.test.mjs`: 107 passed, 0 failed.
- `npm test`: all 398 suites passed.
- `next build`: passes (run before the commit that adds this section).
- ESLint: not run — the repository has no configuration for the installed version.
- Benchmark: before and after both run to completion, nothing pending.

To reproduce the after-run without a model, the stored answers can be replayed:
`BENCH_LIVE=agents ENGINE=director node test/browser/ux-v0/creative-engine-bench.mjs` with
`docs/creative-engine/answers/*.json` copied into the run's `exchange/` folder. To measure the API path: set
`ANTHROPIC_API_KEY` in the environment and run with `BENCH_LIVE=api`. That makes real, paid calls.

## 9. Files, dependencies, limitations, debt

**Dependencies added by this work: none.** (`@anthropic-ai/sdk` came with the earlier, approved move of the stages
to Claude.) No provider, integration, product feature or user-facing control was added.

**Files.** New: `lib/ux-v0/graphics/director/` (12 modules), `app/api/ux-v0/graphic-design/route.ts`,
`components/ux-v0/graphics/director.ts`, `test/director.test.mjs`, the two benchmark scripts, this document and
`docs/creative-engine/`. Changed: `GraphicsWorkspace.tsx`, `GraphicEditor.tsx`, `BoardWorkspace.tsx`,
`app/api/ux-v0/graphic-edit/route.ts`, `lib/ux-v0/graphics/{compose,doc}.ts`, `generative/program.ts`,
`lib/ux-v0/{model,ask,schemas,stage-server,types}.ts`, and five test files. Removed:
`lib/ux-v0/graphics/creative/model.ts`, `components/ux-v0/graphics/creativePlanner.ts`.

**Limitations.**

1. The API path has never been run. Latency, real token use, cache hits, refusals and timeouts under load are
   unknown. The fallback when the director cannot be reached (the old engine, saying so) is tested with fakes only.
2. The after-run is one sample per request. Nothing here says how much answers vary from one asking to the next.
3. "Make it better" (G) was answered with one change. It broke nothing, which the old engine could not say, but a
   designer would have found more. The instructions favour restraint on vague requests; that may be too much.
4. "Cloud themed" (A) still includes literal cloud shapes alongside the tonal change.
5. Structure and typeface repetition across subjects are reduced or untouched, as section 4 says.
6. Small type is the weakest craft area in the renders: a subhead set in too narrow a column (the art poster),
   details set very small (the architecture poster). The review did not flag either as wrong.
7. The review is the same model judging its own work, once. It caught 10 real flaws; it has blind spots.
8. "Covered", "floating shapes" and the stock structure are measured from boxes, not pixels. They are indicators.
9. The contrast guard overrode an accent the director chose for very large type (the conference's "2027"), because
   it measured under 3:1. Correct by the rule; arguably not what the design wanted.
10. Only posters, covers, social graphics and announcements are directed. Extra formats follow by adaptation, not
    by a decision about each format.
11. No person other than the engineer rated the output.

**Debt.** The previous reader, lexicon and executor (`lib/ux-v0/graphics/creative/`) remain as the fallback and for
Boards: two engines to keep. Habits are detected twice (the benchmark's own counter and `evaluate.ts`). The
benchmark stores answers by message, not by instruction text, so a change of instructions does not invalidate
them. The instructions are ~9,900 tokens: every call pays for them unless the cache holds.
