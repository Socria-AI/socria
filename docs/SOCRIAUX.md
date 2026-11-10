# SocriaUX — `/ux`

A design workspace with a reasoning system beside it. The design is the centre
of the screen; SocriaUX questions, teaches, critiques and helps build it, and
everything it proposes lands back on the design or the map as a suggestion the
designer accepts or dismisses.

## Where things are

| Part | File |
|---|---|
| The project, its reducer, normalisation | `lib/ux/model.ts` |
| Measured checks (contrast, target size, labels, hierarchy, density, alignment…) | `lib/ux/audit.ts` |
| What the model is told, the three modes, the moves, the reply sanitiser | `lib/ux/reasoning.ts` |
| An artboard as flow-layout HTML/CSS | `lib/ux/codegen.ts` |
| Templates and the worked example | `lib/ux/templates.ts` |
| The browser store | `lib/ux/storage.ts` |
| One reasoning turn | `app/api/ux/reason/route.ts` |
| Synced projects (signed in) | `app/api/ux/projects/route.ts` |
| The page | `app/ux/page.tsx` → `components/ux/UXStudio.tsx` |
| Workspace, canvas, map, panels | `components/ux/*` |

## What it reuses

- **Auth and gating**: Clerk `auth()`, `mayUse` (access grants), the `aux` rate
  limit, the week's tokens (`sleepGate`), the token meter — the same gate as
  `/api/logos/explore`.
- **Models**: `chooseAuxModel` / `firstAccepted` from `lib/model-router.ts`, by
  tier, with the usual step-down ladder; `tracked()` usage logging.
- **Canvas**: the camera maths of `lib/canvas.ts` (zoom about the pointer, wheel
  reading, fit, curved routes between cards) for both the design canvas and the
  map.
- **Rendering**: `RichText` for SocriaUX's replies; Logos tokens (`.lg-tokens`)
  and the root fonts.
- **Storage**: Supabase through `supabaseAdmin`, filtered by `user_id`.

## What is new and separate

- One table, `ux_projects` (one jsonb document per project) — in
  `supabase/schema.sql` and `supabase/rls.sql`, deleted with the account and
  included in the data export. **Re-run both SQL files** to enable sync; without
  the table, projects stay in the browser and the workspace says so.
- `/ux` is an app path for the relaunch gate (`lib/takeover.ts`) and
  `/api/ux/reason` is a thinking route, so the campaign treats them as it treats
  Logos 5.

## Behaviour worth knowing

- **Three modes.** Guided discovery (default) leads with questions *and* the
  explanation needed to answer them; Instructional teaches; Direct assistance
  recommends and implements. A request for code or a fact is answered directly in
  every mode, and the model is told which questions it already asked.
- **The model never sees pixels.** Uploaded screenshots stay in the browser; the
  model reasons from the elements and annotations placed over them.
- **Nothing is written by the model.** Annotations and map nodes come back as
  pending suggestions; element ids it invents are unpinned, links to nodes that
  do not exist are dropped (`parseReply`).
- **Checks are measured, not judged**, and every finding speaks in three
  registers — the question (guided), the explanation (instructional), the fix
  (direct).

## Deferred

Real-time collaboration, Figma import, multi-select and grouping, component
libraries, prototyping links between screens, and comparing alternatives side by
side with a diff view.

Tests: `npm test -- ux` (`test/ux.test.mjs`, `test/ux-route.test.mjs`).
