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
