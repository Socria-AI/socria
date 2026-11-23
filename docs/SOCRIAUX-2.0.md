# SocriaUX 2.0 — the creative platform

Describe → understand → generate → inspect → refine → export, in one conversation beside one canvas. This document is
the audit, what was built, how it was verified, and an honest classification of every feature. Numbers quoted here
were measured in this repository on the commit that adds this file (`test/platform.test.mjs`, the browser benchmark
`test/browser/ux-v0/platform-qa.mjs`, the full suite, `tsc`, `next build`).

Nothing in this work calls a model: no paid inference was used, and every model route is refused in the browser
benchmark. Where a model would help (reading words the engine cannot read plainly, writing a creative question), the
existing model stages remain and are used when the workspace configures one; everything verified here is the engine's
own.

---

## 1. Summary

SocriaUX already had a studio home with one composer, intent recognition, dynamic discovery questions, a generative
graphics engine with a typed document model, a full direct-manipulation editor, creative plans read from words and
carried out by an executor, concepts, design systems and critique for websites. The 2.0 gaps were in what a designer
does *after* the first design: combining designs, asking for alternatives without losing the original, vague asks
("make it more interesting"), identities ("a premium architectural studio identity"), commenting on objects,
controls that genuinely change the design, judging the result as rendered pixels, finding references on the
internet, and remembering the brief while editing. All of these are now implemented in the product and exercised in
the browser against the built app.

## 2. Audit findings (Phase A)

| Area | Found in the repository | Gap for 2.0 |
| --- | --- | --- |
| Entry and conversation | `components/ux-v0/studio/*`, `lib/ux-v0/studio/director.ts`, `intent.ts` (deterministic, six modes) | research asks answered with "paste a link" only |
| Questioning | `lib/ux-v0/studio/discovery.ts` (1–3 dynamic questions, palettes/faces/moods generated per brief) | — (done in the previous round) |
| Document model | `lib/ux-v0/graphics/doc.ts`: stable ids, roles, 34 operations, validation, history | one set of tokens for every artboard; no comments |
| Creative edits | `creative/plan.ts`, `interpret.ts`, `execute.ts`, model stage `creative-edit` | references resolved over "other artboards" only (an ordinal bug: "the second" missed when it was the one in front); one source per change; vague asks always became a question; identities fell to the nearest theme |
| Alternatives | explore (N compositions in the same language) | "try something completely different" changed the design in front (as a preview) instead of adding one |
| Controls | inspector edits raw properties | no controls generated for the design |
| Comments | none on graphics (websites have cards) | — |
| Evaluation | structural checks (`check.ts`), aesthetic cost in the composer, website audits | nothing measured from rendered pixels |
| Research | Openverse removed earlier (`types.ts` kept only the legacy provider name) | no internet search at all |
| Memory | conversation persisted with the project, decisions with sources | the model's reading had no brief, comments or artboard order |

## 3. Root causes

1. **A single visual language per document.** `GraphicDoc.tokens` was shared by every artboard, so a second design in
   another direction could not keep its own palette and faces: any edit on it read and rewrote the first one's.
2. **References relative to the artboard in front.** `conceptRefs` lists kept concepts then *other* artboards, so
   ordinals counted from a list that excludes the current board.
3. **Words without a decision.** The reader mapped vague words to a fixed question and identities to themes; nothing
   measured the design first.
4. **No pixels.** All judgement was structural; what a gradient, a texture or a form puts behind words was invisible.

## 4. Architecture (what was added)

```
conversation (studio rail / ask bar)
   │ words
   ▼
GraphicEditor.ask ── logo edits ─ answers ─ critique ─ brand ─ synthesis ─ alternatives ─ creative reader ─ precise reader
                                                                          │                 │
                                     creative/synthesis.ts    creative/alternatives.ts    interpret.ts → improve.ts
                                                                                                        identity.ts
                                                                          ▼
                                                creative/execute.ts (board view: the artboard's own tokens)
                                                                          ▼
                                     visualReview.ts → graphics/visual.ts (rendered pixels, bounded repair)
                                                                          ▼
                                                              preview → apply / discard / next words
```

* `lib/ux-v0/graphics/doc.ts` — `Artboard.tokens` and `Artboard.direction` (an artboard's own visual language),
  `normalizeTokens`, `boardView` / `fromBoardView` / `withOwnTokens`; `GraphicDoc.comments` with the `comments`
  operation and `normalizeComments`. Older documents normalise unchanged (both fields optional).
* `creative/synthesis.ts` — reads absolute references ("the first", "version 3", "this one", "the other one", "the
  last", names, kept concepts), clauses with their decisions, "the rest", "combine the best elements" (by measure) and
  "merge these two" (a question); builds the combination on a new artboard from the composition's source and brings
  the typography role by role (face, weight, italic, case, tracking, leading, refitted), the colours, forms, ground and
  depth through the executor.
* `creative/alternatives.ts` — directions / compositions / same-look; the workspace composes new directions from the
  brief (`GraphicsWorkspace.alternativesFor`), each an artboard with its own tokens.
* `creative/improve.ts` — measures what holds a design back (composition, scale, accent, forms, depth, ground, faults)
  and plans the strongest moves with their reasons; when it already measures well and should be more interesting, it
  adds tension (scale, off-centre, a point of colour, atmosphere) and says so; a question only when "better" finds
  nothing wrong.
* `creative/identity.ts` — "turn this into a … identity": a visual language generated from the words
  (`languageDirection`: temperament, things named, the font library), its forms abstract when the subject has a world.
* `creative/scoped.ts` — a comment's words carried out on the commented objects alone.
* `creative/controls.ts` — controls generated from what the artboard holds, each bound to the engine that owns it.
* `graphics/visual.ts` + `components/ux-v0/graphics/visualReview.ts` — the artboard rendered twice in the browser
  (as it is; without its words) and measured: contrast of every text against the pixels really beneath its lines,
  visual weight, coverage, clutter, focus; repairs (an ink that reads, or a quiet panel), reviewed again (bounded).
* `lib/ux-v0/research/*` + `app/api/ux-v0/research` — a provider interface (Brave Search, Google Programmable Search,
  Serper) configured only by environment keys, results held to their shape, honest statuses.
* Memory: `readingOf(doc, board, dir, memory)` carries the brief, the artboards in order, open comments and chosen
  references to the model's creative-edit stage; the brief's named world is realised at generation
  (`studio/realise.ts briefRealisation`).

## 5–20. Feature by feature

Each line: **classification** — evidence.

| # | Feature | Classification | Evidence |
| --- | --- | --- | --- |
| 5 | One conversational entry, workflows by intent | Implemented and verified (existing) | studio home in `platform-qa` (poster, website, logo, research all begun from the one composer) |
| 6 | Natural-language creative edits (themes, qualities, keep/redesign) | Implemented and verified | benchmark tests 1, 3; `creative.test.mjs` 93/93 |
| 7 | Vague improvement measured from the design | Implemented and verified | test 2; `platform.test.mjs` §6 |
| 8 | Identities generated from words | Implemented and verified | test 4; `platform.test.mjs` §5 |
| 9 | Precise edits by degree ("slightly", "much", "30%") | Implemented and verified | test 5; `platform.test.mjs` §7 |
| 10 | Brand intent ("make this fit our brand") | Implemented but unverified in the browser | `GraphicEditor BRAND_INTENT`, `GraphicsWorkspace.brandFor` apply the named/linked/only published system via `applySystem`; unit-checked pattern; not driven in the browser run |
| 11 | Per-artboard visual language | Implemented and verified | `platform.test.mjs` §1; test 6a, 11 |
| 12 | Alternatives on artboards of their own | Implemented and verified | test 6a ("try something completely different"), test 12 (five versions) |
| 13 | Synthesis across artboards | Implemented and verified | test 6b; `platform.test.mjs` §2–3 |
| 14 | Inline comments on objects | Implemented and verified | browser: comment on the headline changes only it, kept as done; `platform.test.mjs` §9–10 |
| 15 | Creative controls bound to the design | Implemented and verified | test 7; `platform.test.mjs` §11 |
| 16 | Visual evaluation from rendered pixels, bounded repair, critique with repairs | Implemented and verified | composition note "Checked the rendered pixels"; critique in the browser; `platform.test.mjs` §12 (synthetic renders) |
| 17 | Research through a provider | Blocked for live use; implemented and verified with fakes | no search provider key is configured and the environment's network allows none of the providers' hosts; the product says so (test 8); providers, statuses and the UI verified with contract-shaped fakes (`platform.test.mjs` §13, test 8b) |
| 18 | Memory: brief, artboard order, comments, references in the model's reading | Implemented; reaching a model unverified | `platform.test.mjs` §14; no model was called |
| 19 | Creative understanding at generation (a world named in the brief) | Implemented and verified (unit) | `platform.test.mjs` §14 |
| 20 | Websites, logos | Implemented and verified (existing engines) | tests 9, 10 |

Capabilities that already existed and carry into 2.0 (kept working, not rebuilt):

| Capability | Classification | Evidence |
| --- | --- | --- |
| Live canvas: zoom, pan, select, multi-select, drag, resize, align, layers, group, duplicate, delete, text and colour editing, undo/redo, versions, several artboards | Implemented and verified | earlier graphics and ceiling browser checks; this run used selection, undo, the artboard picker and versions |
| One editable document model with stable ids and roles (34 operations, validated) | Implemented and verified | `graphics.test.mjs`, `platform.test.mjs` §1, §9 |
| Websites drawn in a sealed iframe (no scripts of the page reach the app) | Implemented and verified | test 9; `ux-v0.test.mjs` |
| Design systems: import, apply, conformance, propagation | Implemented and verified (earlier `dsi-qa`); the new “fit our brand” words path unverified in the browser | `GraphicsWorkspace.brandFor` |
| Boards (identity boards, coordinated materials) | Implemented and verified (earlier `boards-qa`, `boards.test.mjs` 104/104); not driven in this run | — |
| Critique of websites and uploaded designs | Implemented and verified (earlier rounds) | `workflow-b-critique.mjs` |
| Performance and cost | Targeted edits stay precise (no recomposition for a nudge); no model call anywhere in the benchmark; repairs, explore retries and new-direction rounds are bounded (≤ 2, ≤ 4, ≤ 4); fonts and models' readings cached | code, this run |
| Security | uploads and SVG sanitised as before; research results held to http(s) public names, linked `noopener noreferrer nofollow`, thumbnails loaded with no referrer; the research route rate-limited (`uxsearch`) and never fetching a result itself; provider keys only from the server environment, never sent to the browser or logged | `platform.test.mjs` §13, route code |

## 21. Benchmark results (browser, built app, no model)

The twelve required tests, run by `test/browser/ux-v0/platform-qa.mjs` against `next start` (screenshots and a JSON
record in the run's output folder). See the table at the end of this section for the run recorded with this commit.

Run recorded with this commit (`docs/socriaux-2.0-benchmark.json`): **23 passed, 0 failed**, no page errors, every
model route refused (no model was needed or used). Each line is what was checked, with what was measured or said.

| Test | Result | What the run measured or said |
| --- | --- | --- |
| Made from the studio | pass | “Composed and checked in 354 ms, without a model. Checked the rendered pixels: every text reads against what is really beneath it (the hardest at 15.5:1).” |
| 1 “Make this cloud themed.” | pass | clouds drawn as editable shapes, the sky graded, the words exactly kept. On this run's crowded composition the clouds were set faintly behind the words and that was said (“say ‘more space’ or ‘smaller clouds’ to give them room of their own”); every text still read (hardest 13:1). |
| 2 “Make it more interesting.” | pass | measured first: “It is crowded (4% left open). So: more space around everything; a graded ground …” — no question needed. (On a design that measures well it adds tension instead and says so; asked only when “better” finds nothing.) |
| 3 “Keep the typography and logo, but completely redesign the rest.” | pass | faces identical role by role, the logo the same logo, a new composition (structural similarity under 0.86), a new ground and palette (“darker, cooler, richer”), the words the person's own. |
| 4 “Turn this into a premium architectural studio identity.” | pass | “For a premium architectural studio identity, a language generated from those words: deep, quiet colour on ivory … Bodoni Moda for display, EB Garamond for reading, with the city's forms drawn abstractly.” New faces and colours; same words and arrangement. |
| 5 “Make the headline slightly smaller.” | pass | the headline alone, by under 10%; every other object byte-identical. |
| Comment on the headline (“make this warmer”) | pass | “Comment 1: headline: its colour warmer. Only the headline changed.” Kept as done, pinned. |
| 7 Controls | pass | ten controls generated for the design (“Fine lines — how many / how abstract / how large”, “Headline — size / weight (Bodoni Moda) / letter spacing”, “Sky — tone”, “Accent — hue”, “Depth”, “Room”); the headline grown by keyboard and read back exactly; depth moved; undo took it back. |
| 6 Two designs, then “Take the typography from the first and the visual composition from the second.” | pass | “Try something completely different” added “Japanese Modernist Editorial” on its own artboard with its own colours and faces; the combination is a new artboard built on its composition (similarity ≥ 0.9) set in the first's Bodoni Moda / EB Garamond, both sources unchanged, no structural fault, every text reading (hardest 16.3:1). |
| Critique | pass | “I rendered it and measured the pixels (396×560), then checked the objects. Every text was measured against what is beneath it: 3 of 3 read clearly. 1. The headline is small against the frame.” |
| 12 Five versions from one brief | pass | five artboards; pairwise structural similarity mean 0.584, max 0.742 (threshold for “the same structure” 0.86). |
| 11 Leaving and reopening | pass | every artboard, the comment, each artboard's own tokens, every turn of the conversation and the versions restored. |
| 8 “Find me some interesting references for an experimental architecture website.” | pass (blocked state) | “Searching the internet needs a search provider set up for this workspace (Brave Search, Google Programmable Search or Serper, each with its own key), and none is. Paste links to sites you admire, or add pictures …” — nothing invented. |
| 8b Result cards (scripted provider answer — a UI check only) | pass | three cards, each linked to its source with `rel="noopener noreferrer nofollow"`, each with “Use as a reference”. |
| 8c Choosing one | pass | read through the guarded site reader; unreachable here, and said so. |
| 9 Architecture studio website | pass | made without a model, its sections composed for the brief with a working contact form, framed in its sealed iframe, navigation present, nothing running off the side at phone width. |
| 10 Logo | pass | valid SVG (parsed in the browser), editable vector objects, ten concepts to choose from. |

Unit and suite results with this commit: `test/platform.test.mjs` 127/127; `creative` 93/93; `studio` 234/234;
`graphics` 72/72; `graphics-ceiling` 102/102; `boards` 104/104; `logo-engine` 132/132; `style-intelligence` 87/87;
`ux-v0` 933/933; `ux-v0-route` 225/225; the full suite (`npm test`): **all 397 suites passed**. `tsc --noEmit` clean;
`next build` succeeds.

What the screenshots showed (looked at, not only produced): the cloud-themed poster reads clearly with graded sky
and clouds; the identity is set in a refined serif in capitals with abstract rules; the combination is coherent (the
Japanese-modernist weave and composition with the first design's serif); the versions differ in structure (a banded
layout, an off-centre stack, …); the logo is a clean geometric wordmark with a dot-grid mark. Three issues the
screenshots exposed were fixed before this run: line forms blurred at “atmospheric” depth (blur is now for soft forms
only), a dark accent muddying a light graded ground (tinted less), and the Controls panel clipping at the right edge.

## 22. Files

New: `lib/ux-v0/graphics/creative/{synthesis,alternatives,identity,improve,scoped,controls}.ts`,
`lib/ux-v0/graphics/visual.ts`, `components/ux-v0/graphics/visualReview.ts`, `lib/ux-v0/research/{schema,providers-server}.ts`,
`app/api/ux-v0/research/route.ts`, `test/platform.test.mjs`, `test/helpers/platform-under-test.ts`,
`test/browser/ux-v0/platform-qa.mjs`, this document.

Changed: `lib/ux-v0/graphics/doc.ts`, `render.ts`, `edit.ts`, `creative/{concepts,decisions,execute,forms,interpret,lexicon,model,plan}.ts`,
`lib/ux-v0/graphics/generative/edits.ts` (explore versions measured apart), `lib/ux-v0/graphics/logo/brief.ts` (“a website
for Kanso, an architecture studio” reads the name),
`lib/ux-v0/studio/{director,realise,schema}.ts`, `lib/ux-v0/types.ts` (legacy note only), `lib/rate-limit.ts`
(`uxsearch`), `components/ux-v0/graphics/{GraphicEditor,GraphicCanvas,GraphicsWorkspace,creativePlanner}.ts(x)`,
`graphics.css`, `components/ux-v0/studio/{Conversation,ProjectConversation}.tsx`, `studio-home.css`,
`test/creative.test.mjs` (the vague-ask expectation moved from "always a question" to "measured"), `test/helpers/build.mjs`,
`test/browser/ux-v0/README.md`; the run record `docs/socriaux-2.0-benchmark.json`.

## 23. Dependencies

None added. Search providers are called with `fetch` through their official APIs, only when a key is configured.

## 24. Limitations, blockers and technical debt

* **Research is blocked here**: no provider key, and the network policy allows none of `api.search.brave.com`,
  `www.googleapis.com`, `google.serper.dev`. To enable: set `SOCRIAUX_RESEARCH_PROVIDER` and the provider's key, and
  allow its host. Each search spends that provider's quota (free tiers exist; usage beyond them is paid — approval
  needed before enabling).
* **No model in this environment**: the creative-edit and studio-question stages exist but were not exercised; the
  reader carries every benchmark. Memory added to the model's reading is verified as data, not as model behaviour.
* **Controls are generated deterministically** from the design's contents and decisions; no model proposes them.
* **The visual review is pixel analysis** (contrast beneath text, weight, coverage, edges, focus). It is not a visual
  judgement by a person or a model, and it is said as such. Faces that cannot be fetched are drawn in a stand-in face
  for the full render (said in the report); the legibility measure uses the render without words, so it is unaffected.
* **Alternatives in new directions** need the brief (graphics made from a brief); a board without one falls back to
  a bolder recomposition of a copy.
* **Brand intent** applies a design system through the existing `applySystem` (a version is kept), but was not driven
  in the browser run.
* **Undo across a brand application** goes through Versions (the editor's own history restarts when the workspace
  replaces the document).
* The editor component grew; extracting the comment, controls and critique flows into hooks is the next clean-up.
