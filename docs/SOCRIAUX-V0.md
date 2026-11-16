# SocriaUX v0 — plan and master checklist

**Route:** `socria.app/ux-v0` · **Branch:** `dev` · **Status:** built on `dev` and verified with a scripted model (see *Verification* below). Still open: the real-model run (D9), the dogfooding benchmark (D10), and two items that need a signed-in session (2.6, 2.7).

SocriaUX v0 is a design environment with three capabilities: **Socratic design generation** (intent → questions → moodboard → brief → a real interface), **design import and inspection** (HTML and images, element and area selection), and **Socratic critique** (contextual reasoning cards on a selection). The design is the workspace; reasoning is attached to it. It is not a chatbot and not a website builder.

Every task below is checked off only after it has been tested. A task that is built but not verified stays open.

---

## Phase 0 — Inspection (done)

### Git

- [x] Repository inspected. The working tree was clean, with no stashes and nothing uncommitted to preserve.
- [x] `dev` exists on the remote; switched to it (`dev` tracks `origin/dev`). It is 7 commits ahead of `main` and 0 behind, so it already contains `main`, including Logos 6 and the first SocriaUX (`/ux`, merged in #5).
- [x] Nothing is done on `main`. v0 lives on `dev` only.

### What exists and will be reused

| Need | Existing piece | How v0 uses it |
|---|---|---|
| Visual language | `components/logos5/l5-controls.css`: the house system (Logos 5.5 Revision II and Logos 6). One filled ink control per surface, every other action a word (`.l5-link`), chosen state underlined (`.l5-tab`), hairline cells (`.l5-cell`), floating panels as `.l5-sheet` (paper, hairline, square corners, no shadow), the ruled-line composer (`.l5-compose`), the label (`.l5-label`), and serif questions (`.l5-asks-q`). | v0 is drawn in these classes under `.lg-tokens`. There are no pills, chips, badges, drop shadows or pulsing dots. |
| Card pattern | `components/logos6/ChallengeCard.tsx` lays out a finding as one sentence, then what it rests on, then actions as words (*Keep*, *Dismiss*, *Discuss*, *More*). It can also say "This holds up". | The model for reasoning cards. |
| Not agreeing blindly, not criticising everything | `lib/challenge/challenge-gate.ts` is Logos 6's gate in code. A finding must quote real material and be specific; unsure findings become questions; findings are capped; and "holds up" is a valid answer. | A **critique gate** works the same way. Every issue must cite something measured or present in the selection (a computed style, its text, a size, a check result); otherwise it becomes a question. "This works" is allowed. |
| Measured design facts | `lib/ux/audit.ts`: WCAG contrast, target size, small text, competing primaries, density, near-alignment. | Applied to the computed styles of the real DOM, and passed to the model as facts. |
| Pan, zoom, fit | `lib/canvas.ts`: camera, zoom about the pointer, wheel reading, `fitCamera`. | Used for both the image and the HTML canvas. |
| Model calls | `lib/model-router.ts` (ladders: `gpt-6-luna → gpt-5.6-luna → gpt-4o-mini`; `PRICES`; `costOf`), `lib/openai-usage.ts` (`tracked()`: per-call usage, parameters shaped per model), `lib/model-params.ts` (`cannotSee` steps down when a model refuses an image). | Every v0 call goes through these. |
| Gate on model routes | `auth()`, `mayUse`, `enforceRateLimit(…, 'aux')`, `sleepGate` and `meterFor` (the weekly token allowance), `withMeter`, `sleepAnswer`. | Identical to `/api/logos/challenge` and `/api/ux/reason`. |
| Persistence | Supabase via `supabaseAdmin`, filtered by `user_id` (`supabase/schema.sql`, `rls.sql`). The private files bucket `lib/file-originals-store.ts` keeps each person's files in one folder, already listed in the export and removed with the account. Existing IndexedDB stores (`lib/docs/client.ts`, `lib/preview/originals.ts`) show the browser-side pattern. | Project documents go to a new table; uploaded originals go to the existing bucket; browser copies go to IndexedDB. |
| Feature switches | `lib/logos6/switches.ts`: on in dev, previews and local; off in production until switched on. | `NEXT_PUBLIC_SOCRIAUX_V0` follows the same rule, so `/ux-v0` cannot appear in production by accident, even after `dev` is merged. |
| Relaunch gate | `lib/takeover.ts` (APP and THINKING_API lists; `test/takeover.test.mjs`). | `/ux-v0` is an app path; its model routes are thinking routes. |
| Guards in tests | `test/route-boundary.test.mjs` (every route refuses strangers), `test/account-data-complete.test.mjs` (every table deleted and exported), `test/ux-consistency.test.mjs` (house colours, weights, focus ring), `test/sleep.test.mjs` (metered routes). | v0 must pass all of them unchanged. |

### What does not fit and will not be used

- **Serper and Tavily** (`lib/logos-explore.ts runSearch`) return web and Google results with no licence information. They are not used for the moodboard.
- **The first SocriaUX (`/ux`)** has a conversation thread with alternating bubbles, which this spec rules out, and it predates the Logos 6 house system (it uses pills and shadows). v0 is a separate product at its own route. `/ux` is left exactly as it is; only its measured checks are reused.
- There is no HTML sanitiser in the codebase. v0 needs one for imports.

### Environment constraint, found during inspection

This development sandbox **cannot reach the OpenAI API or any image API** (Openverse, Unsplash, Pexels and Wikimedia were all refused by its network policy). Everything can be built and tested here with a scripted model and a scripted image provider. Running the real workflows and the dogfooding benchmark needs either network access plus keys for this sandbox, or a run on the dev preview (decision D9).

---

## Decisions to approve

Each has a recommendation. Approving the checklist approves the recommendations unless you say otherwise.

| # | Decision | Recommendation |
|---|---|---|
| D1 | Where it lives | `/ux-v0` with `/api/ux-v0/*`, new `lib/ux-v0/` and `components/ux-v0/`. `/ux` is untouched. Behind `NEXT_PUBLIC_SOCRIAUX_V0`: on in dev, previews and local; off in production. |
| D2 | Moodboard image source | **As built (revised after a live check):** every licensed library is asked at once and the results are interleaved, so the board draws on all of them. **Openverse** needs no key; it is asked from the person's own browser, as openverse.org does, because its limits (20 a minute, 200 a day) apply per caller, and a server asking for everyone would share one allowance across all users. **Unsplash** (`UNSPLASH_ACCESS_KEY`, with photographer credit and Unsplash's download ping) and **Pexels** (`PEXELS_API_KEY`) are asked by the server, where the keys stay. Never Google or Serper. Libraries answer short queries, so the model writes two or three words, and a query that finds too little is retried by its two-word pairs. Pages are fetched whole (20 at a time), served a few images per click, and cached: 24 h on the server, and for the session in the browser. Images already seen in a project never return. |
| D3 | How designs are generated | The model writes a **structured design specification**: tokens (palette, type pair, scale, radius, density) plus an ordered list of sections, each with a kind, a variant and its content. **Our own renderer** turns that into HTML and CSS. The model never writes raw HTML or JavaScript. Iteration patches a token or one section, so the whole page is never regenerated for a small change. It is safe, cheap, inspectable and deterministic to test. Trade-off: variety is bounded by the section library, so the library has to be built with real craft (D3a). |
| D3a | Section library for v0 | Websites: nav, hero (four variants), feature grid, split (image and text), gallery, quote or testimonial, stats, logos, pricing, FAQ, CTA, form, footer. App screens: shell (sidebar or top bar), stat cards, chart (drawn in SVG from data), table, list, form, mobile frame. Images come only from the approved moodboard, credited automatically. |
| D4 | Rendering uploaded HTML safely | An iframe with an **opaque origin**: `sandbox="allow-scripts"` and never `allow-same-origin`, so it cannot reach cookies, storage or the app. A Content-Security-Policy is injected first, blocking network calls (`connect-src 'none'`). Forms, popups, top-level navigation and meta refresh are removed. A small inspector script inside reports selections to the app by `postMessage`, and those messages are validated and treated as untrusted. The uploaded page's own scripts are **off by default**, with a per-project switch to run them inside the same sandbox. Single-file HTML only: relative files such as `./style.css` cannot resolve and are reported as missing. |
| D5 | Model | `SOCRIAUX_MODEL`, default `gpt-6-luna`, for every SocriaUX call regardless of plan, with the router's step-down ladder on refusal. Seven kinds of call, and no others: discovery turn, alternative direction, brief synthesis, brief refinement, spec generation, spec patch, critique (including follow-ups). JSON-schema outputs where the model accepts them, always validated in code. Images are sent as a **crop plus a small context thumbnail**, never the full image on every call. A text summary of an uploaded image is made once and reused. |
| D6 | Persistence | Device-first in **IndexedDB**: projects and artifacts, so nothing is lost if a request fails. Signed-in users also sync the project document (no binaries) to a new table `ux_v0_projects`, and uploaded originals to the existing private files bucket. Generated designs need no file storage, because they are re-rendered from the spec. The new table is added to account deletion and the export. |
| D7 | Cost and limits | Each response carries its token usage and cost (`costOf`). A new table `ux_v0_usage` records calls, tokens and US$ per user, per project and per day. Limits: the existing `aux` rate limit and weekly token allowance, plus per-user daily caps (`SOCRIAUX_DAILY_CALLS`, default 300; `SOCRIAUX_DAILY_GENERATIONS`, default 40). The project shows its running cost. |
| D8 | Accounts | Anything that calls the model or searches images needs a Socria account. Importing, viewing, selecting and inspecting work signed out. |
| D9 | Testing with the real model | **Recommended:** allow `api.openai.com`, `api.openverse.org` and `api.unsplash.com` in this sandbox's network and enter an OpenAI key (and optionally an Unsplash key) through the secure credential form. I can then run Workflows A and B and the branding benchmark for real here. **Alternative:** I deliver with scripted-model tests, and you run the real workflows on the dev preview. |
| D10 | Dogfooding assignment | **Recommended:** the SocriaUX launch page, a real Socria branding piece that exercises the moodboard, typography and imagery. You may prefer another, such as a Socria One page or an event page. |

---

## Shared data structures (`lib/ux-v0/types.ts`)

Everything passes between client, routes and model as these shapes, each with a normaliser in the repository's style (no new validation dependency). Every document read or received is normalised; nothing unvalidated reaches storage or the renderer.

- **`DesignProject`**: `id`, `name`, `mode` (`create` | `critique`), `intent`, `discovery` (questions asked, answers given, working understanding), `brief` (`DesignBrief`, plus its approval state), `spec` (`DesignSpec` and its version history), `artifact` (`ImportedArtifact` | `GeneratedArtifact`), `moodboard` (`MoodboardRef[]`), `cards` (`ReasoningCard[]`), `usage` (calls, tokens, US$), `createdAt`, `updatedAt`.
- **`ImportedArtifact`**: `kind` (`html` | `png` | `jpg` | `svg`), file name, bytes, natural size, a storage key (IndexedDB, and the bucket when synced), the runs-scripts flag, missing resources.
- **`GeneratedArtifact`**: spec version and viewport. Its HTML is derived, never stored.
- **`SelectionContext`**:
  - `type` (`element` | `region`), `artifactId`, viewport.
  - For an element: tag, role, accessible name, visible text, DOM path, attributes subset, computed styles subset, bounding box.
  - For a region: rectangle in artifact pixels, intersecting elements (HTML) with their coverage, crop data URL (images, at most 1024 px).
  - `surrounding`: parent chain, section heading, siblings and nearby text.
  - `measured`: check results such as contrast, target size and font size.
- **`ReasoningCard`**: `id`, `projectId`, `selection`, `comment`, `reasoning`, `followUps[]`, `state` (`open` | `kept` | `dismissed`), `createdAt`. `reasoning` holds `read`, `verdict` (`works` | `mixed` | `problem` | `unclear`), `questions[]`, `principles[]` (each with how it applies here), `issues[]` (each with the evidence it cites), and `alternatives[]` (each with its trade-off).
- **`MoodboardRef`**: `id`, provider and provider id, image and thumbnail URL (only as returned by the provider), size, title, creator and creator URL, source URL, licence and licence URL, `category` (`imagery` | `texture` | `composition`), the query it came from, `state` (`proposed` | `kept` | `rejected`).
- **`DesignBrief`**: objective, audience, user goals, brand personality, visual direction, palette (named hex with roles), typography (display and body from an allowlist of Google Fonts, with rationale), layout direction, functional requirements, referenced moodboard ids, open questions.
- **`DesignSpec`**: tokens, then `sections[]` (`id`, `kind`, `variant`, `content`, `imageRefs`), then page type (`website` | `app-screen`).

---

## Phase 1 — Workspace foundation

**Scope:** the `/ux-v0` page, its project home and the empty workspace shell in the house system. No model calls.

- [x] **1.1 Route and switch.** `app/ux-v0/page.tsx` and `layout.tsx` with metadata; `lib/ux-v0/switch.ts`; `/ux-v0` added to the takeover APP list.
  *Accept:* the page renders in dev and preview; in production with the switch off it returns 404; `takeover.test` is updated and passes.
  *Verified:* The switch's rule is unit-tested: open in development and previews, closed in production unless switched on. `page.tsx` calls `notFound()` when it is closed. `takeover.test` passes. Run in development here; there is no preview deploy from this sandbox.
- [x] **1.2 Types and normalisers** (`lib/ux-v0/types.ts`).
  *Accept:* unit tests cover every shape, including hostile input, size caps and unknown fields dropped.
  *Verified:* Unit tests cover every shape, including hostile input, size caps and unknown fields.
- [x] **1.3 Device store** (IndexedDB wrapper modelled on `lib/preview/originals.ts`): projects and artifacts, with quota errors reported, not thrown.
  *Accept:* tests against an in-memory fake; a reload restores the open project.
  *Verified:* Tested in Chromium's real IndexedDB rather than an in-memory fake. A reload restores the project (Workflow B); a deletion survives a reload (checklist pass); a forced storage-full error is reported and the design still opens (checklist pass).
- [x] **1.4 Project home.** Two ways in, *Create a design* and *Critique a design*, plus a project list with open and delete.
  *Accept:* house classes only; one filled control; works at 390 px.
  *Verified:* Checklist pass: the list, open, an inline delete with *Keep it* focused (the app never uses the browser's own dialogs), Esc keeps it, and the home works at 390 px.
- [x] **1.5 Workspace shell.** Top bar with mark, name, project and save state. The centre canvas is dominant. A right rail holds cards, brief and moodboard as tabs that underline when chosen. The bottom composer is a ruled line showing the current context ("On: …").
  *Accept:* the canvas takes at least 60% of the width at 1440 px; there are no alternating chat bubbles anywhere; `ux-consistency.test` passes.
  *Verified:* At 1440 px the canvas takes 1060 px (74%). There are no chat bubbles, and `ux-consistency` passes. One deviation: the brief and the moodboard are canvas views (the steps), not rail tabs, because they are the main content of their stage. The rail holds Questions, Cards, Selection and Versions when creating, and Cards, Selection and File when critiquing.
- [x] **1.6 Canvas.** Pan and zoom with `lib/canvas.ts`, fit to screen, zoom keys (`+`, `−`, `0`), and a paper ground.
  *Accept:* zoom stays anchored at the pointer; fit works for tall pages and wide images.
  *Verified:* Acceptance pass: ⌘/Ctrl-wheel zoom stays anchored at the pointer to within 1%, and a 4000 px image fits (24%). Fit never enlarges past 100%, and a page too tall to fit starts at its top. The zoom keys are ⌘/Ctrl with =, − and 0 (checklist pass); the zoom buttons work too.

## Phase 2 — Design import

**Scope:** HTML, PNG, JPG and SVG into the canvas, safely.

- [x] **2.1 Upload and validation.** Picker plus drag and drop. Types are checked by extension *and* by their first bytes. Limits: HTML ≤ 2 MB, SVG ≤ 2 MB, PNG/JPG ≤ 15 MB. Empty files, wrong types and oversize files get a clear message.
  *Accept:* tests for each rejection; nothing partial is saved.
  *Verified:* Checklist pass: each of seven refusals gives its message (wrong type, empty, a .png or .jpg that isn't one, an .svg with no `<svg>`, oversize, binary HTML). A refused file leaves no project behind. Files arrive by picker, or by drop on the home page and on the import view.
- [x] **2.2 HTML sandbox document** (`lib/ux-v0/sandbox.ts`, pure). Parse with `DOMParser` (inert), strip `<script>` (unless the project allows scripts), inline handlers, forms' actions, `<meta http-equiv=refresh>`, `<base>` and existing CSP. Inject our CSP first, then the inspector.
  *Accept:* tests with hostile fixtures (script, `javascript:` URLs, meta refresh, form posts, `parent` and `top` access) show none of them work; malformed HTML still renders best-effort.
  *Verified:* Unit tests with hostile fixtures, plus Workflow B in Chromium: the page's script does not run; `parent`, storage and the network are unreachable; malformed HTML still renders.
- [x] **2.3 Inspector** (`lib/ux-v0/inspector.ts`, the script injected into the frame): hover outline, element pick, area query, highlight, a measure of the page height, and missing-resource reporting. Messages are typed and checked against the frame's window.
  *Accept:* Playwright reaches every message type; forged messages with the wrong shape are ignored.
  *Verified:* Playwright reaches ready, size, hover, select, area, missing, wheel and key. Forged messages (from the app's own window) and malformed ones (from the frame) are ignored (acceptance pass). This check found that the app accepted malformed selections; it now accepts only a well-formed capture.
- [x] **2.4 Viewports.** Desktop 1440, tablet 834, mobile 390, with page height measured from the document.
  *Accept:* switching keeps the selection where possible and re-measures.
  *Verified:* Tablet draws the page at 834 px and re-measures (checklist and acceptance passes). A viewport switch now keeps the selected element selected and re-measures its highlight; this was built during verification.
- [x] **2.5 Images and SVG on the canvas.** Aspect ratio kept, zoom and fit. SVG is drawn as an image (`<img>` from a blob URL), so scripts inside it never run.
  *Accept:* a 4000 px screenshot and a tiny icon both fit sensibly; an SVG containing a `<script>` renders without running it.
  *Verified:* Acceptance pass: a 4000 px screenshot fits, and a 16 px icon is shown at its own size, centred. Checklist pass: an SVG is drawn as an `<img>` from a blob URL, and its `<script>` never runs.
- [ ] **2.6 Error states.** Broken resources get one quiet line ("3 images could not load"); unreadable files explain why; a failed save keeps the device copy.
  *Accept:* each state is reproduced in a test.
  *Open:* Two of the three states are reproduced in tests (checklist pass): the one quiet line for missing linked files, and an unreadable image saying why. *A failed save keeps the device copy* concerns the signed-in sync, which this sandbox cannot run, so it is not yet reproduced.
- [ ] **2.7 Synced originals (signed in).** Uploaded originals go to the files bucket under the person's folder; project deletion removes them.
  *Accept:* covered by `account-data-complete`; route-boundary passes.
  *Open:* Built: originals go through the existing `/api/files/original` route to the private bucket, which account deletion and the export already cover, and deleting a project deletes its original. `account-data-complete` and `route-boundary` pass. The signed-in upload and delete themselves have not been run, because they need a signed-in session.

## Phase 3 — Selection

**Scope:** two selection methods producing one `SelectionContext`.

- [x] **3.1 Element selection (HTML).** Hover outline, click to select, `Esc` to clear, a breadcrumb to step up to the parent (section, card, form).
  *Accept:* buttons, headings, nav, cards, images, forms and sections can each be selected; their highlight survives scrolling and zoom.
  *Verified:* Acceptance pass: a navigation link, heading, image, card, button, field, form and section can each be selected, and the highlight stays on the element through zoom and panning. *Select its parent* steps up (checklist pass).
- [x] **3.2 Element capture.** Tag, role, accessible name, visible text, DOM path, an attribute subset, a computed-style subset (colour, background, font, size, weight, line height, spacing, radius, display), bounding box, and the surrounding context.
  *Accept:* a unit test of the builder; captured contexts stay under 6 KB.
  *Verified:* Unit tests of the builder. A selection stays under 6 KB (the crop image aside) whatever the frame sends: a budget built during verification trims in steps, keeping what was measured and the selector whole.
- [x] **3.3 Area selection.** Drag a rectangle over HTML, PNG, JPG or SVG, with clear boundaries and its size shown. Dragging again replaces it; `Esc` clears it.
  *Accept:* works at any zoom; a zero-size drag is ignored, not saved.
  *Verified:* Areas work on HTML, PNG, JPG and SVG, with the size shown. Esc clears. A click without a drag selects nothing. An area is measured in the image's own pixels at any zoom (acceptance pass).
- [x] **3.4 Area to DOM (HTML).** The elements intersecting the rectangle, with their coverage, and the smallest common container.
  *Accept:* a region over a card returns that card's heading, text and button.
  *Verified:* Acceptance pass: an area over a card returns its heading, text and button.
- [x] **3.5 Image crop.** The crop at natural resolution, downscaled to at most 1024 px, plus coordinates; SVG is rasterised for the crop.
  *Accept:* the crop matches the drawn rectangle on retina and non-retina screens.
  *Verified:* Acceptance pass: the same area gives an identical crop on 1× and 2× screens. An SVG area is rasterised (checklist pass).
- [x] **3.6 Measured facts for a selection.** Contrast against the actual background, target size, font size, interactive density and overlaps, reusing `lib/ux/audit.ts` maths.
  *Accept:* unit tests on computed-style fixtures.
  *Verified:* Contrast against the real background, target size, type size, line length and leading, alt text and labels, interactive density, and overlapping targets (overlap added during verification). Unit tests on fixtures.
- [x] **3.7 Keyboard access.** The selected element's parent, children and siblings are reachable from the keyboard; the selection is announced.
  *Accept:* an axe-core pass on the workspace shell.
  *Verified:* *Select its parent*, *First inside it*, *Previous* and *Next* are buttons the keyboard reaches. Each selection, or a step that goes nowhere, is announced in a polite live region. axe finds no serious or critical problems in the workspace shell (acceptance pass).

## Phase 4 — Reasoning engine (critique)

**Scope:** a comment on a selection becomes a reasoning card; follow-ups continue it.

- [x] **4.1 Model configuration.** `lib/ux-v0/model.ts`: `SOCRIAUX_MODEL` (default `gpt-6-luna`), its ladder, prices and cost.
  *Accept:* a unit test reads the environment; the model id is not hard-coded anywhere else.
  *Verified:* Unit tests read the environment. The model id appears nowhere outside `lib/ux-v0/model.ts`.
- [x] **4.2 Critique route** (`/api/ux-v0/critique`): the house gate (auth, rate limit, weekly allowance, meter, resting answer) and the daily caps.
  *Accept:* route test with a scripted model covering signed out (refused, nothing asked), a signed-in card, model failure (502 with a calm message, comment kept), and prose fallback; route-boundary, takeover and sleep tests pass.
  *Verified:* Route tests cover: signed out (refused, nothing asked), a signed-in card, a model failure (a calm 502), prose with JSON inside (used), and prose with none (an honest *could not form a grounded reading*). The comment is kept on its card with *Try again* (checklist pass). `route-boundary`, `takeover` and `sleep` pass.
- [x] **4.3 What the model is told.** The selection context, the measured facts, a compact description of the surrounding design (the cached artifact summary for images), the brief if there is one, the card's earlier turns, and the user's comment. Images go as a crop (`detail: high`) plus a 512 px thumbnail (`detail: low`).
  *Accept:* tests assert the full image is never resent once a summary exists, and the context stays under its token budget.
  *Verified:* Route tests: the crop goes at high detail with the thumbnail at low, and only the crop once a summary exists. A unit test holds the context to its budget: the last six turns, each part capped.
- [x] **4.4 Reasoning schema and critique gate.** Issues without cited evidence become questions; principles must be named and tied to this design; at most three issues and two questions; "works" is allowed.
  *Accept:* tests with replies that agree blindly, criticise everything, invent principles or quote things that are not there.
  *Verified:* Unit tests cover blind agreement, criticising everything (at most three issues), invented principles, and quotes that are not there (which become questions). Blind agreement is a fix from verification: *this works* over a failing measured fact becomes *mixed*, and the failure is put as the first question.
- [x] **4.5 Reasoning cards.** A numbered pin on the canvas at the selection, and the card in the rail: what it is on, your comment, the read, then the questions in the serif, the principles, issues with their evidence, and alternatives with trade-offs. Actions are words: *Keep*, *Dismiss*, *Reply*, *Show on design*.
  *Accept:* choosing a card restores its selection on the canvas; Playwright checks it.
  *Verified:* Workflow B and the acceptance pass: a numbered pin and the card, and *Show on design* restores the card's selection on the canvas.
- [x] **4.6 Follow-ups.** Replying from a card continues it with its history, inside the card rather than as a new bubble.
  *Accept:* a follow-up sends the card's earlier turns, and the model is told which questions it has already asked.
  *Verified:* Route tests and Workflow B: a follow-up sends the card's earlier turns, and the model is told what it already asked.
- [x] **4.7 Usage and cost.** The `ux_v0_usage` table, written with an upsert per user, project and day. Every response returns usage and cost, and the project shows its total.
  *Accept:* account deletion and export include the table; a test checks the arithmetic against `costOf`.
  *Verified:* Route tests: the ledger is written per user, project and day (against a stand-in database). A unit test checks usage against `costOf`, cached tokens included. Account deletion and the export include the table. The SQL itself runs on Supabase and has to be applied there (see *Known risks*).

## Phase 5 — Socratic generation

**Scope:** from an idea to a rendered, critiquable, iterable interface.

- [x] **5.1 Intent.** One serif line: "What do you want to make?", with examples. The project is created on the first answer.
  *Accept:* works signed out up to the first model call, which then asks the person to sign in.
  *Verified:* Acceptance pass: signed out, the project is created, and the first model call asks the person to sign in.
- [x] **5.2 Discovery route** (`/api/ux-v0/discover`). Each turn returns an updated working understanding, the next one or two questions (each with why it is asked, suggested answers and free text), moodboard queries only when the visual direction changed, and `readyForBrief`.
  *Accept:* tests show no question repeats, no more than two at once, it stops when ready, and an answer "I don't know" is handled.
  *Verified:* Unit tests: no repeats, at most two questions, it stops when ready, and *I don't know* is handled. That last one is a fix from verification: such an answer is no longer recorded as known, the topic can be asked again another way, and it does not count toward ready.
- [x] **5.3 Discovery surface.** The current question appears on the canvas beside the growing moodboard, never as a chat log. Earlier answers can be edited, which updates the understanding.
  *Accept:* a reviewer would not describe it as a chatbot; it works at 390 px.
  *Verified:* Workflow A and the checklist pass: the question sits beside the board, and editing an earlier answer re-runs the understanding. It works at 390 px (acceptance pass).
- [x] **5.4 Image route** (`/api/ux-v0/images`). Provider interface (Unsplash, Openverse, Pexels), licence fields kept, 24 h server cache per query, results excluding ids already seen in the project.
  *Accept:* tests with scripted providers, covering failure (the board says so and keeps what it has), no results, and rate limiting.
  *Verified:* Unit tests with scripted libraries cover a failure, rate limiting, nothing found, the 24 h server cache, interleaving, whole pages, the two-word fallback and re-ranking by the full query. On the board, a provider failure is said and the images already there stay (acceptance pass). **Live:** `moodboard-live.mjs` ran against the real Openverse. Long model queries that once found nothing filled every group with relevant, loaded, credited images; *More images*, *More like these*, the board's own search and *Replace* all worked; it used 7 searches in all.
- [x] **5.5 Moodboard board.** A visual collage grouped by imagery, texture and composition. Typography specimens are set in the real fonts (allowlisted Google Fonts, loaded inside the board only). Palettes are swatches with hex values and contrast.
  *Accept:* attribution and licence are visible on every image; nothing appears without a source.
  *Verified:* Every tile shows a short credit (“title” by creator, licence), linked to its source, with a link to the licence, never a library's long legal sentence; the generated page credits the same way. A reference without a library's https URL is refused, and a full board never lets go of a kept image (unit tests).
- [x] **5.6 Moodboard actions.** *Keep*, *Remove*, *Replace* (the next result for the same query), and *Another direction* (contrasting queries for one aspect). The board updates when the brief changes.
  *Accept:* a replaced image never comes back in the same project.
  *Verified:* *Replace* never brings back an image already seen (Workflow A, route tests, and live). *Another direction* works (checklist pass). A refinement that moves the brief's visual direction puts new images on the board; this was built during verification. Added since: *More like these* for each group, and a search box for the designer's own searches (live).
- [x] **5.7 Brief synthesis** (`/api/ux-v0/brief`). Produces a `DesignBrief` from the understanding and the kept references.
  *Accept:* every field is present; the palette is valid hex; fonts come from the allowlist; the references are real kept ids.
  *Verified:* Route and unit tests: every field is present, the palette is valid hex, the fonts come from the allowlist, and the references are real kept ids.
- [x] **5.8 Brief review and refinement.** The brief as an editable document; direct edits need no model call; *Refine* with words patches it; *Approve* locks the version that generation uses.
  *Accept:* edits survive a reload; the approved version is the one used.
  *Verified:* Checklist and acceptance passes: direct edits make no model call, *Refine* in words sends the edited brief, edits survive a reload, and the approved version is the one generation uses.
- [x] **5.9 Spec generation** (`/api/ux-v0/generate`). Produces a `DesignSpec` from the approved brief: tokens, sections, real copy (no lorem ipsum) and image references.
  *Accept:* validation rejects unknown kinds, missing content and images not on the moodboard; one call per generation.
  *Verified:* Unit and route tests: unknown kinds, missing content and images not on the board are rejected; one call per generation.
- [x] **5.10 Renderer** (`lib/ux-v0/render/`). Turns the spec into semantic, responsive HTML and CSS: the section library (D3a), tokens as CSS variables, focus states, image credits generated in the footer, and `data-ux-section` and `data-ux-path` on every element so it can be inspected.
  *Accept:* snapshot and accessibility tests per section kind and variant (contrast at least 4.5:1 for body text, targets at least 44 px on mobile); it renders in the same sandbox as imports.
  *Verified:* The renderer is one module, `lib/ux-v0/render.ts`. The section check rendered every kind and variant, 720 renders across five styles and three palettes, and each kept text at 4.5:1 (over images, at the worst case), gave 44 px targets at 390 px, and did not scroll sideways. A determinism unit test stands in for snapshots. Fixes made during verification: a form's *split* was being drawn as *centered*; app screens overflowed at 390 px; some targets were small; the full-bleed scrim now follows the text; an editorial eyebrow over an image was dark; an *accent ink* is now used where the accent colours text; galleries left holes.
- [x] **5.11 Live preview.** The generated design at three viewports; element and area selection and critique work exactly as on imports.
  *Accept:* Workflow B's steps pass on a generated design.
  *Verified:* Workflow A and the acceptance pass: element and area selection, and critique, on a generated design.
- [x] **5.12 Iteration** (`/api/ux-v0/refine`). A comment on a selection returns a typed patch: token, section content, section variant, add, remove or reorder, regenerate one section, or, only when the direction changes, regenerate all. Each is applied deterministically.
  *Accept:* a small change touches only its section; tests for each patch type and for rejected patches.
  *Verified:* Unit tests for every patch type (content, tokens, variant, images, replace, add, remove, move) and for refusals. A new direction is offered as a regeneration, not forced into a patch (route tests).
- [x] **5.13 Versions.** Every applied patch is a version, with undo and redo and an earlier version viewable.
  *Accept:* undo restores the exact earlier HTML.
  *Verified:* Undo and redo, and earlier versions viewable from Versions. Undo restores the exact earlier page (acceptance pass).

## Phase 6 — Quality assurance

- [x] **6.1** Imports: each type, hostile HTML, malformed HTML, broken resources, oversize and empty files.
  *Verified:* Every type, hostile HTML, malformed HTML, broken resources, oversize and empty files (unit tests, Workflow B, the checklist pass).
- [x] **6.2** Selection: element and area on HTML, PNG, JPG and SVG; replace and clear; zoom and viewport changes.
  *Verified:* Element and area selection on HTML, PNG, JPG and SVG; replace and clear; zoom and viewport changes (the checklist and acceptance passes).
- [ ] **6.3** Reasoning: relevance to the selection, the gate's behaviour, principles tied to the design, follow-up continuity.
  *Open:* Tested: the gate's behaviour and follow-up continuity. Whether the reasoning is relevant, and its principles tied to the design, needs the real model (D9).
- [ ] **6.4** Moodboard: relevance to the brief, no repeats, attribution present, provider failure.
  *Open:* Tested: no repeats, attribution, and provider failure. Relevance to the brief needs real images and the real model (D9).
- [ ] **6.5** Generation: the brief honoured, valid output, iteration touching only what was asked.
  *Open:* Tested: valid output, and iteration touching only what was asked. Whether the brief is honoured needs the real model (D9).
- [x] **6.6** Model failures: refusal, timeout and malformed output each degrade calmly without losing work.
  *Verified:* A failure gives a calm 502, malformed output is refused, and prose is handled (route tests). The comment is kept, with *Try again* (checklist pass). A refusal steps down the router's existing ladder.
- [ ] **6.7** Cost: tokens and US$ recorded for a full Workflow A and B. Target: under US$0.05 per workflow on `gpt-6-luna`.
  *Open:* This needs the real model (D9). The scripted runs record calls and US$ correctly; for example, Workflow A shows *US$0.0024 · 6 calls* from the scripted usage.
- [x] **6.8** Responsive: the workspace at 1440, 1024 and 390 px, with no horizontal overflow.
  *Verified:* No horizontal overflow at 1440, 1024 and 390 px in the workspace, nor on the home page or discovery at 390 px. At 390 px nothing that matters is clipped or covered either (the composer, its button, the steps and the mark), and the step tabs are 44 px tall. That last check was added after a screenshot showed the Create header and composer clipped at 390 px, which the overflow check alone had missed; both are fixed.
- [ ] **6.9** Full workflows A and B in Playwright with a scripted model and images, and again with the real model (D9).
  *Open:* Done with a scripted model: Workflows A and B, plus the checklist and acceptance passes. Not yet run with the real model (D9).
- [x] **6.10** Repository suite: `npm test`, `tsc --noEmit` and `next build` all pass on `dev`.
  *Verified:* `npm test` (all 372 suites, after rebasing onto the latest `dev`), `tsc --noEmit` and `next build` pass on `dev`.

### Definition of done

- **Workflow A (Create):** describe → answer questions → moodboard → review and refine the brief → generate → see it in the workspace → iterate. All seven steps are reliable.
- **Workflow B (Critique):** upload HTML or an image → view it → select an element or area → comment → contextual Socratic reasoning → principles → alternatives → continue on the card. All eight steps are reliable.

**Status:** both workflows run end to end and reliably with a scripted model, across four browser passes and the unit and route suites. They have not yet been run with the real model (D9).

### Dogfooding benchmark (D10)

Socria uses SocriaUX v0 for a real branding assignment. Passed only when:

- [ ] SocriaUX understood the objective and asked questions that changed the outcome.
- [ ] The moodboard's imagery is relevant and correctly licensed and credited.
- [ ] The generated design uses real copy, passes contrast, and works at 390 px.
- [ ] Critique found at least one real improvement, and iteration applied it without regenerating the page.
- [ ] Socria would publish the result. This is judged by you, not by me.

*Not yet run.* It needs the real model and image libraries (D9), and then your judgement.

---

## Verification

Every tick above is backed by a test that ran on `dev`:

- **Unit tests** (`test/ux-v0.test.mjs`): shapes, the spec and every patch type, the renderer, the sandbox, the inspector, selections and their facts and budget, the critique gate, discovery, the brief, model configuration, usage and providers.
- **Route tests** (`test/ux-v0-route.test.mjs`), with a scripted model and a stand-in database: the house gate, caps, the ledger, every route's happy path and its failures.
- **The moodboard against the real Openverse** (`test/browser/ux-v0/moodboard-live.mjs`), with only the model scripted.
- **Browser checks** (`test/browser/ux-v0/`, Playwright, with the model and image libraries scripted): Workflows A and B end to end, the checklist pass, the acceptance pass (axe included), the section check (every kind and variant, 720 renders), and the gallery check. Its README says how to run them.
- **The repository suite** (`npm test`), `tsc --noEmit` and `next build`.

Verification found and fixed real defects; each is noted on its item above. The largest showed up only against the real library: the queries the model was told to write (*morning light espresso bar marble counter*) found **no images at all** on Openverse, and half of every page fetched was thrown away. Others: malformed frame messages could create a selection; *this works* could pass over a failing measured fact; *I don't know* was recorded as an answer; a form's *split* was drawn as *centered*; app screens overflowed at 390 px; the Create header and composer were clipped at 390 px; text over full-bleed images could fall below 4.5:1; and a light accent made accent-coloured text unreadable.

## Out of scope for v0

A Figma replacement, collaboration or multiplayer, deployment or hosting, design-system management, a research suite, analytics dashboards, autonomous redesign, project management, multiple agents, generated imagery, new infrastructure, and anything not serving the three capabilities.

## Known risks

- **`gpt-6-luna` quality for spec generation.** The section library sets a quality floor. If needed, `SOCRIAUX_MODEL` can name a stronger model without code changes.
- **Whether `gpt-6-luna` accepts images.** If it refuses, the ladder steps down for that call (`cannotSee`), as Logos's read route already does.
- **Library limits.** Openverse allows each person 20 searches a minute and 200 a day; searching from the browser keeps that per person, and a busy library says so on the board. Unsplash's demo keys allow 50 requests an hour until Unsplash approves the app for production (5,000 an hour after); Pexels allows 200 an hour. With no keys set, the board draws on Openverse alone.
- **HTML imports that depend on JavaScript** render incompletely unless scripts are switched on. Imports referencing relative files lose those files, and the canvas says so.
- **Page scripts, when switched on,** run in the same sealed frame as the inspector. They still cannot reach Socria, its storage or the network, but they could post a well-formed but false selection. Scripts are off by default.
- **The database changes must be applied to Supabase** (`supabase/schema.sql` and `rls.sql`: `ux_v0_projects`, `ux_v0_usage`, `bump_ux_v0_usage`). Until then, signed-in sync and the usage ledger fail; everything on the device keeps working.
