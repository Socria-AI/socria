# SocriaUX — the creative engine overhaul

What was wrong with how SocriaUX understood, planned, made, changed and judged graphic design; what was rebuilt; how
it was verified; and what is still open. Every number here was measured in this repository on the commit that adds
this file. Nothing is claimed that was not run.

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
| 6 | **No truth check on outcomes.** A reader could report a change that changed nothing; nothing compared before and after. | `GraphicEditor.precise` returned true on any read | "Move the focal point right": reported as done, 0 objects changed. |
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
| J | Three changes, then "go back to the original colours" | Turn 3 reported done with 0 changes; turn 4 changed nothing. |

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
  evaluate.ts       measured: words present, cut/broken/colliding, scale, generic habits
  flow.ts           one look at the rendered picture by the director; corrections kept only if nothing gets worse
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
| `evaluate.ts` | Adherence, craft checks, scale, and the generic-habit detector. |
| `flow.ts` | The orchestration, once, for the browser and for the benchmark. At most one review per request; never a loop. |
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
  earlier state is restored from recorded values by code, not re-imagined.
- **Truthful outcomes**: what is said to the person is built from the comparison; a change that changed nothing is
  reported as nothing; every dropped or failed edit is listed.
- **Slop**: named in the instructions as defaults not to reach for; counted in code after every design; shown to the
  director when it reviews the render.
- **Render-and-evaluate**: the browser's own render of the artboard is sent to the director once (a real picture);
  its corrections are applied only if no measurable problem gets worse.
- **Design systems**: an attached system's colours and faces are passed as hard decisions and as brand rules; the
  existing brand guard still runs afterwards.
- **Cost discipline**: exact edits cost no model call; one call for an object-level change; at most three for a
  design or a change of feel (ask, one review); no loops.
