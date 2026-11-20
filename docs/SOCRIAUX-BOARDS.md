# SocriaUX Boards

Many materials, one Master Design System, one canvas. A board is a project type of its own (next to websites and
graphics). From one request ("a launch campaign: two posters, two Instagram graphics, a website and a product mockup;
annotate the design decisions") SocriaUX plans every material, proposes three design systems to choose between, then
composes every material **in the one system chosen**, each as its own composition. The results go on an infinite
canvas, arranged as a campaign overview, with notes that explain the design decisions from facts that can be checked.

It is **not** a multi-direction concept generator. The three systems on offer are alternatives for the whole board;
once one is chosen, every material shares it.

Nothing in Boards calls a model. Request reading, planning, composition, checks, notes, sync and changes in words are
all deterministic code running in the browser. The cost is $0, and the run fails its tests if any model route is asked.

## Architecture

```
request ─▶ brief ─▶ Master Design System ─▶ material plan ─▶ compositions ─▶ materials ─▶ board layout ─▶ notes ─▶ checks
 plan.ts    plan.ts   pipeline.ts (art-       plan.ts          plan.ts +        pipeline.ts   layout.ts      annotate.ts  evaluate.ts
                      direction engine, or                     graphics/        (bounded
                      a website's approved                     compose.ts       pool, status,
                      direction)                                                retry)
```

Boards reuses what SocriaUX already has. Nothing is a second generator or editor:

| Need | Reused |
| --- | --- |
| design systems | the art-direction engine (`lib/ux-v0/direction.ts` `proposeDirections`), or a website's approved direction |
| graphics | the Graphics engine: `composeGraphic` / `planFor` (with a sibling override), `checkDoc` / `refineDoc`, `renderArtboard`, the raster/PDF/SVG exporters |
| editing a graphic | `GraphicEditor`, the Graphics editor itself, extracted from `GraphicsWorkspace` and mounted over the board |
| the website | the website generator: `parseGenerate` builds a real website project in the system; `renderDesign` + `buildSandboxDoc` show its live page; the website workspace edits it; `exportSite` packages it |
| persistence | the project store and `useV0Project` (browser first, account sync), `normalizeProject` on every read and write |

### Board / artboard / website preview / mockup / annotation

Board content is heterogeneous, not forced into one rendering format:

- **Board** (`BoardState`): the workspace. It holds the system, the materials, what is on the canvas (nodes), the connectors, the board's own pictures, background, arrangement and versions.
- **Graphic material**: an editable `GraphicDoc` (the Graphics document model). The board owns it, and it records its token bindings.
- **Website material**: a **reference** (`projectId`) to a website project of its own. The board shows its real page, live in a sealed frame; it never holds a copy of it.
- **Mockup material**: a vector scene (phone, poster on a wall, packaging box, billboard, laptop) that **references** a source graphic and draws it. It follows every change to its source, and its source can be swapped. The source stays a material of its own.
- **Nodes**: a material's placement (its size on the board is only how large it is *shown*), notes, headings, reference pictures and the design-system overview. Connectors tie notes to what they explain.

## Files

| File | What it does |
| --- | --- |
| `lib/ux-v0/boards/model.ts` | Data model, normalization (references validated, caps), `BoardOp` and `applyBoardOp(s)`: operations applied all or none; locked nodes refuse change; untouched objects keep their identity |
| `lib/ux-v0/boards/system.ts` | `MasterDesignSystem`; `systemFromDirection`; token **bindings** recorded at composition; `overridesOf`; `propagate` (keeps overrides, repairs around them, re-binds repairs); `resetOverrides`; `refineKeepingOverrides` |
| `lib/ux-v0/boards/plan.ts` | `readBoardRequest` (materials in mention order, quoted words as content, details such as "every Friday in July"); `planMaterials`; `composeMaterial`, where siblings differ in composition and palette use (`overrideFor`, `paletteTurn`); `websiteAnswer` |
| `lib/ux-v0/boards/pipeline.ts` | `proposeSystems`, `systemFromWebsite`, `startBoard`; `generate` (bounded pool, status per material, one automatic variant retry, failure isolation, cancellation); `finishOps`; `interruptedOps` |
| `lib/ux-v0/boards/sync.ts` | `syncSystem`: identify → update → repair → re-note → report, as one undoable step |
| `lib/ux-v0/boards/layout.ts` | `presentSize`; `arrange` (campaign overview with shelf-packed sections, sections, grid, rows, sequence; locked nodes respected); `collisions` |
| `lib/ux-v0/boards/annotate.ts` | Notes written from facts with **claims**; `verifyNotes` finds stale notes; rewrites happen in place (ids and positions kept) |
| `lib/ux-v0/boards/evaluate.ts` | `evaluateBoard` (10 dimensions); `refineBoardOps` (bounded) |
| `lib/ux-v0/boards/edit.ts` | `readBoardEdit`: board changes asked in words, read into operations or named actions |
| `lib/ux-v0/boards/mockup.ts` | Mockup scenes nesting the source SVG |
| `lib/ux-v0/boards/website.ts` | `websiteConcept` (a real website project in the system); `websiteDrift`; `syncWebsite` (a new version, the earlier one kept) |
| `lib/ux-v0/boards/export.ts` | System overview SVG, website schematic, board overview SVG, manifest, board file |
| `components/ux-v0/boards/BoardWorkspace.tsx` | The workspace: brief → system → board; generation; history; versions; the editor overlay; changes in words; the sync review; exports |
| `components/ux-v0/boards/BoardCanvas.tsx` | The infinite canvas: pan, zoom, marquee, drag with snapping guides, resize, groups, connectors, virtualization and level of detail |
| `components/ux-v0/boards/BoardPanels.tsx` | Materials (status, retry, keep), System (token editor), Add, Checks, Versions, Inspector (real size vs board size, local overrides with reset, mockup controls) |
| `components/ux-v0/boards/boardRender.ts` | Browser drawing with caches; the overview export (PNG/PDF/SVG); the materials export (zip + `manifest.json`) |
| `components/ux-v0/graphics/GraphicEditor.tsx` | The Graphics editor, extracted so Graphics and Boards share one editor |
| `components/ux-v0/graphics/faces.ts` | Font loading and measuring, picture addresses (shared) |

## Data model (abridged)

```ts
interface MasterDesignSystem {
  version: 1; id; name;
  direction: { name; language; concept? };
  personality: string[];
  tokens: { colors: { background, surface, text, muted, accent, accentText, line }; fonts: { display, body }; accent2? };
  weights: { display; body };
  type: { case: 'upper' | 'sentence'; tracking; role? };
  composition: { axis?; intensity; density };
  shape: FormSystem | null; motifs; imagery; logo; constraints: string[];
  accentWhy?; source?: { projectId; name }; art?: ArtDirection;
}
type Material = GraphicMaterial | WebsiteMaterial | MockupMaterial; // + id, name, purpose, status, error?, revision
interface GraphicMaterial { type: 'graphic'; role; brief: GraphicBrief; variant; doc: GraphicDoc | null; bindings: Bindings; plan?; findings?; accepted? }
interface WebsiteMaterial { type: 'website'; projectId; view: 'desktop' | 'mobile'; created }
interface MockupMaterial { type: 'mockup'; template: 'phone' | 'poster-wall' | 'box' | 'billboard' | 'laptop'; source: { material; artboard } | null }
interface Bindings { nodes: Record<nodeId, { color?, fill?, stroke?, font?, weight?, case? : TokenKey }>; boards: Record<artboardId, { background?: TokenKey }> }
type BoardNode = MaterialNode | NoteNode /* text, generated, about, claims */ | HeadingNode | ReferenceNode | SystemNode;
```

Statuses are `planned → generating → rendering → ready | failed`. A material is said ready only once its document
exists. A page closed mid-generation leaves no material "generating": on reopening, such materials are marked failed
(interrupted), to be retried alone.

## The pipeline

- **Bounded concurrency**: at most 3 materials in progress at once. Mockups follow once their sources are made.
- **Retry**: if a composition leaves high-severity findings that the bounded repair could not fix, it is composed once more in the next variant. If findings still remain, it is marked failed, with its reason and its draft kept.
- **Failure isolation**: one material failing never touches another. "Retry this one" reruns only that material, and every other material object stays identical.
- **Cost**: no model calls, so $0; the header says so. **Stop after these** cancels the remaining work; what was not started stays planned (never reported as made).

## Design system sync (`sync.ts`)

A token change is **proposed first**. The proposal lists every material: updated (with the number of properties),
uses nothing that changed, follows its source (mockups), a project of its own (websites), or not composed yet.
Applied, it does this:

1. Only properties **bound** to a changed token *and still holding its old value* are set to the new value.
2. A property holding something else is the designer's **local override**. It is kept and listed. It is reset only if the designer ticks "Reset … too" in the proposal, or uses Reset in the inspector.
3. The bounded repair (contrast, overflow) runs **around** overrides: it never changes them. If a change makes an override unreadable, that is said instead. A colour the repair adjusts is re-bound to the token it now equals, so it is never mistaken for an override.
4. Generated notes are rewritten in place, so they stay true.
5. Everything goes in as one undo step, and the board as it was before is kept in Versions.

Nothing is composed again: no "full regeneration for deterministic token changes". A website is a project with its
own history, so the system reaches it only when asked ("apply the same typography system to the website"), as a new
version of it with the earlier version kept.

## Operations and changes in words

Every change is a `BoardOp` list, applied all or none and undone as one step: node-add/move/set/update/remove, group,
ungroup, connect, disconnect, material-add/update/remove/duplicate, system, background, annotations, arrangement,
asset and note-write. Locked nodes refuse change, and an unknown operation is refused, never ignored.
`readBoardEdit` reads, for example:

| Words | Result |
| --- | --- |
| "Arrange these materials into two rows" | `arrange(rows)`, previewed, then applied |
| "Make all the posters slightly larger on the board" | larger presentation sizes only (artboards unchanged) |
| "Move the mockups to the right side" | node moves |
| "Keep the first three materials exactly as they are" | locks |
| "Regenerate only the second poster" | that material composed again (a new variant), the rest untouched |
| "Create another Instagram graphic using this campaign" | a new material in the system |
| "Apply the same typography system to the website mockup" | a website sync (typefaces only), as a new version |
| "Change the campaign's accent color" | a proposed system change → sync |
| "Make the overall board presentation more polished" | campaign overview + notes rewritten |
| "Add annotations explaining the visual system" | notes written again from the facts |

Words it cannot read are not guessed at.

## Notes (annotations)

Each generated note is made of **claims**: facts read off the material, such as the face its headline is really set
in, its composition archetype, its ground, its format, or the design a mockup shows. `verifyNotes` reads the facts
again, and a note whose facts changed is shown as stale, with what changed. Notes say nothing relative to other
materials and invent no rationale. A note the designer rewrites becomes theirs and is never rewritten.

## Export

- **One material** (inspector) or **the selected / all materials** (Export menu): each material in its own folder and its own formats. Graphics go as PNG at export resolution, SVG with text kept as text, and PDF for print sizes. Mockups go as PNG. Websites go as their website package (built by the same `exportSite` as the website workspace). `manifest.json` names every file by material id and records the shared system. "All" adds the board overview (without notes) and the board file.
- **The board overview**: the board as arranged, as PNG (with or without notes), PDF or SVG. It is a presentation, not the materials. Websites appear in it as a schematic of their page, said as such (the browser cannot draw a live frame into a picture).
- **The board file** (`.socriaux-board.json`): reopens the board. Websites stay referenced by id.

The PDFs contain high-resolution RGB pictures: not CMYK, no embedded fonts, no vector text.

## Persistence and ownership

A board is saved like any project: browser first, then the signed-in account copy, through `normalizeProject` →
`normalizeBoard`. Normalization keeps stable ids and drops references to missing materials. A mockup may only present
a graphic on the same board, and a website reference must be a project id. Every query on the account copy filters on
the user's id, so another person's board cannot be read, listed, written or deleted (401/404). A website id from
someone else resolves to nothing, and the board shows "not in this browser, or not yours". Versions keep up to 6
snapshots.

## Verification

| Command | Result |
| --- | --- |
| `node test/run.mjs` (every suite in the repository) | 384 suites passed |
| `node test/boards.test.mjs` | 104 passed, 0 failed |
| `node test/graphics.test.mjs` | 70 passed, 0 failed |
| `node test/ux-v0.test.mjs` | 953 passed, 0 failed |
| `node test/ux-v0-route.test.mjs` (includes board isolation: owner only, held to shape, 401 signed out) | 199 passed, 0 failed |
| `UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/boards-qa.mjs` | 62 passed, 0 failed, 0 model calls, 0 page errors (≈ 60 s) |
| `… graphics-qa.mjs` (Graphics, with the extracted editor) | 55 passed, 0 failed |
| `… ui-qa.mjs` / `… mastery-qa.mjs` (Websites) | 85 / 22 passed, 0 failed |
| every-section render bench (`sections.mjs`, 4 shards) | 3,600 renders, all clean |
| `npx tsc --noEmit` and `next build` | clean; the build passes |

`boards-qa.mjs` runs the twenty tests of the brief through the interface: create a board; coordinated posters;
mixed formats; auto-arrange; manual move; zoom and pan; save and reopen; edit one material; update a shared token;
preserve local overrides; generate notes; edit notes; link the website preview; mockups from graphics; retry one
failed material; undo board operations; export one material; batch export; export the board overview; preserve
websites and graphics. It also runs the extra cases (unreadable words, locked materials, a missing website project,
interrupted generation, unauthorized access) and a 36-material board. That board took 698 ms to generate and arrange.
At fit, all 36 are drawn; zoomed far out, all 36 are plain blocks; zoomed in on one, only 4 are drawn.

## Changes outside Boards

Each change below is behaviour-preserving or a bug fix, and each is covered by tests:

- **Graphics**: the edit view of `GraphicsWorkspace` was extracted into `GraphicEditor` (controlled: a document in, `onChange` out, history kept inside), so a board's graphics use the Graphics editor itself. Font loading, measuring and picture addresses moved to `components/ux-v0/graphics/faces.ts`. The markup and class names are unchanged, and `graphics-qa` passes 55/55 against it.
- **Graphics edits in words**: a bare colour (`#ff00aa`) with something selected now colours it, as the ask bar's own example promised. Before, it needed a verb ("make it #ff00aa").
- **Website renderer** (`lib/ux-v0/render.ts`): the hero's longest-word fit assumed the whole viewport (`100vw − 40px`). In a statement hero beside its art, a hero under a measure, or a text column capped at 820 px, a word could therefore break in the middle at desktop widths. 4 of 42 website concepts did, at 1,280 px. The fit is now the room the headline really has: the page measure, the 820 px text column, the measure, the column beside the art (from 760 px up), or half a split. That makes 0 of 42. Font sizes only ever get smaller, and only where a long word was the limit.
- **Projects**: `medium: 'board'` with `board: BoardState` in `DesignProject`; `normalizeProject` / `summarize` handle it; the home shows a board door and board thumbnails (the overview, without notes).

## Limitations

- Graphics are composed by SocriaUX's deterministic engine; no image generation is used. Pictures on materials come from the designer's uploads.
- The overview export draws websites as a schematic, not a screenshot. The live page shows on the canvas and goes out as its own package.
- Mockups are flat vector scenes (with an affine box face), not photographic renders.
- Board versions are whole snapshots (up to 6). A very large board with many versions can exceed the 2 MB account-sync limit; it is then kept in the browser only, and the header says so.
- Board-level checks are structural (consistency, differentiation, hierarchy, export readiness, note accuracy, overlaps), not taste.
