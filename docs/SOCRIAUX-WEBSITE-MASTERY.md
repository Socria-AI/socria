# SocriaUX — website mastery

What this round builds on, what it adds, and how each part was checked. Website creation only.

## Checkpoint A — the audit (before any change)

SocriaUX already had most of the pipeline the brief describes. This round fills specific gaps rather than adding a
parallel architecture.

| Pillar | Already there | Partial | Missing |
| --- | --- | --- | --- |
| 1 Visual design | 17 visual languages, creative reading, Creative DNA, design plan, composition strategy and composer, shape grammar and systems, 74 faces with display / vertical / turned / outline / variable type, restraint (nothing recomposed when nothing is asked) | Decisions exist across the direction (look, tokens, plan, strategy, form, DNA) but not as one record with reasons and verification. Composed parts can leave empty areas; lone shape planes read as placeholders. | A decision record checked against the rendered page; checks for empty areas and lone planes |
| 2 Creative range | Three directions with controlled divergence, hybrids, originality audit with justification, composition explorer, rejected compositions remembered | — | A benchmark of 20 different briefs |
| 3 Motion and interaction | Motion engine (reveals, stagger, parallax, pinned story, scrub, cursor, magnetic, masks, SVG drawing, view transitions), motion from the direction, reduced motion; phone menu, accordion, gallery lightbox, filters, table sort and filter, chart keys, configurator, booking, form validation; 3D scene with fallback | — | Tabs, image comparison, horizontal scroll |
| 4 Editing | Stable identity of every drawn element (`data-ux-section` + `data-ux-path` → the spec), element and area selection, quick edits in words, look adjustments, model edits as one typed patch, section editor, locks (sections, art-direction groups, DNA), held compositions, undo / redo, 30 versions | The version list shows versions but cannot restore one as new, compare or keep one. Targets by order ("the second section") or name ("the mobile navigation") are not read. | Confining an edit to what was asked ("keep everything else exactly the same"); link destinations |
| 5 Production | Checks at 1440 / 834 / 390 (overflow, contrast, targets, images, measure, collisions, scripts), interactive parts tried in place, credits, focus styles, reduced motion | The navigation links work; buttons, the brand and footer links are `href="#"`. Forms say "sent (a prototype)". No automated alt / label / heading-order / landmark checks in the product. | Meta description, Open Graph, canonical, structured data; an export that builds and deploys (only one HTML file existed) |
| 6 Creative intelligence | Adaptive questioning, living brief with decisions and locks, reference DNA with likes and dislikes, direction fidelity checks, reasons for shapes and composition | The approved direction does not travel with the downloaded page. | — |
| 7 Evaluation | Brief → direction → plan and critique → generation → held in code → drawn in the browser at three widths → findings with fixes → at most two repair rounds; budgets, telemetry, model routing, deterministic before model | Quality is one penalty score. A repair is not checked for regressions. Judgement and deterministic failure are not separated. | Weighted dimensions with separate release gates |

## The plan, in the order it is built

The order puts the slices that can be verified end to end first.

1. **Links, site settings, forms, metadata.** Every button and link goes to a part of the page, a destination the
   designer set, or is marked as unlinked and reported. Forms post to a configured destination or say they are not
   connected. The head gets a description, Open Graph tags, a canonical URL and structured data, only from facts on
   the page or settings the designer gave.
2. **Website export.** A folder that builds and serves without SocriaUX: markup, styles, scripts, assets, a
   zero-dependency build, documentation, the design and its direction. It is tested by building and serving it in a
   clean directory.
3. **Evaluation.** Accessibility and composition checks in the rendered-page audit. Quality gates (weighted
   dimensions, separate release gates). Repairs reverted when they make things worse. The decision record.
4. **Precision editing.** Scope read from the instruction and enforced on the result. Targets by order, name and
   selection. History: what changed, restore, compare, keep.
5. **Interactions.** Tabs, image comparison, horizontal scroll.
6. **Benchmark and verification.** Twenty briefs, all existing benches, build, docs.

## What was built

**Pillar 5: production-grade websites.**

- **Links** (`lib/ux-v0/links.ts`). Every button, brand, footer and composed link goes, in order, to:
  1. the destination the designer set;
  2. the part of the page its words name ("Book a table" → the booking);
  3. nowhere yet, marked `data-ux-unlinked` and reported. Never a silent `#`.
- **Site settings** (`spec.site`, designer-only; a model's `site` patch is refused): description, address, form
  destination, language, link destinations. A new generation keeps them.
- **Forms.** Every field has a name. A published form posts to the configured destination once its answers are
  checked; anywhere else it says plainly that nothing was sent.
- **Head.** Meta description, Open Graph, canonical, JSON-LD. They come only from the page's own words and the
  designer's settings: no invented address or business fact.
- **Every website** has a `<main>` landmark and a skip link.
- **Export** (`lib/ux-v0/export-site.ts`). A folder that builds and serves without SocriaUX:
  - `index.html` with no inline script, `styles.css`, the runtimes as files, made pictures as assets;
  - a zero-dependency `npm run build` (reads `SITE_URL`, `FORM_ACTION`, `STRICT`) and `npm run preview`;
  - README (build, deploy, environment variables, what is not connected, how it was designed), CREDITS,
    `netlify.toml` and `vercel.json` with a Content Security Policy, and `socriaux.json`.
  - Downloaded as a zip from a new **Publish** rail, which also holds a readiness list, the site settings and every
    link's destination.

**Part 7: evaluation and refinement.**

- **The rendered-page audit now reads** alt text, control names, labels, heading order, page titles, landmarks,
  unresolved and broken links, empty bands, and shape planes that touch nothing.
- **Fixes.** A composed field's empty rows are closed in code. A lone shape is offered for removal, never removed
  without the designer.
- **Quality** (`lib/ux-v0/quality.ts`): six weighted dimensions, using the mandate's weights as configurable
  hypotheses. A dimension with nothing measured is left out, not guessed.
- **Release gates**, kept apart from the score: accessibility, security (no inline handler, no script address, no
  link that runs code, forms only to https or email) and critical function. Each passes, waits on the designer, or
  fails.
- **Failures are kept apart from judgements.**
- **Regression check.** A repair round now takes back any fix that makes another part worse.
- **The decision record** (`lib/ux-v0/decisions.ts`): the approved direction's eleven decision areas, each with
  its reason and whether the drawn page keeps it.
- All of this is shown at the top of the Checks rail.

**Pillar 4: surgical editing.**

- **`lib/ux-v0/scope.ts`** reads what an instruction may touch: "only", "just", "everything except",
  "without changing", ordinals, named parts, the selection. It holds a model's change to that scope and says what it
  put back.
- **`lib/ux-v0/targeted.ts`** does these in code: another picture for a named part; organic or angular shapes (one
  shape, a part's shapes, or the page's system); a compact phone navigation; motion intensity.
- **`lib/ux-v0/history.ts`** says what changed between versions, restores a version as a new one, and keeps chosen
  versions through the 30-version cap. All three are in the Versions rail.
- **Shape planes now carry their element path,** so a finding or the canvas can point at one.

**Pillar 3: interactions.**

- **Tabs**, top or side: ARIA tabs with arrow keys, Home and End.
- **Before and after**: a slider moved by keyboard, range input or pointer drag; or side by side.
- **A horizontal rail** for feature sequences: a named region the keyboard can scroll.
- **Each works without scripts first.** Every tab panel and both pictures stay readable, and no control appears
  until it works.
- **Each is tried in place** by the rendered-page audit's self-test.

**Pillar 6: intent.** "A website … where guests book a table" is now a website that takes bookings, not a booking
screen. A booking screen still wins when it is said outright.

## Verification

| Check | Result |
| --- | --- |
| `node test/ux-v0.test.mjs` | 952 passed, 0 failed |
| `node test/run.mjs` (repository) | all 382 suites passed |
| `npx tsc --noEmit -p .` | clean |
| `next build` (v0 switch on) | passed; its one warning (`unpdf`, unrelated) predates this work |
| `export-bench.mjs` | 46/46: two sites exported, built (`STRICT=1` fails while unconnected), served, checked in a browser |
| `interactions-qa.mjs` | 15/15 |
| `mastery-qa.mjs` (built app) | 22/22: Publish, the zip read back, Checks, three targeted edits in code, Versions; no model route called |
| `explore-qa.mjs`, `ui-qa.mjs` (built app) | 17/17, 85/85 |
| `sections.mjs` (four shards) | all 3,600 renders clean (72 variants, 25 style and palette runs) |
| `production-bench.mjs`, `dna-bench.mjs`, `craft-bench.mjs`, `layout-bench.mjs` | 101/101, 58/58, 15/15, 18/18 |

## Cost

- No model call was added, and none was made: spend US$0.
- The deterministic checks are in-browser measurements and string checks. The one change to model input is the
  generator's library menu, now 1,246 characters (about 310 tokens) longer for the two new kinds and the rail.

## Not done, or partly

- **The twenty-brief benchmark (Part 8) was not built.** The checks above cover two exported sites, eleven named
  scenarios and every section; the twenty-brief differentiation and latency table is still to do.
- **Subjective critique by a vision model** was not run (no authorisation for paid calls). The judgements are
  deterministic heuristics, said as judgements.
- **Editing precision** counts the scoped edits a project has made (and how many had to be held to scope). With no
  edits yet, it is left out of the score.
- **Accessibility is checked, not certified.** The audit and axe-core cover common WCAG failures; nothing here
  claims full WCAG 2.2 AA compliance.
- **PDF and design-file export are not part of the website export.** It is a static site.
