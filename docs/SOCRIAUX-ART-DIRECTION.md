# SocriaUX art direction

**Branch:** `dev` · **Applies to:** `/ux-v0` (Create) · **Core idea:** human-directed creativity, AI-powered execution.

SocriaUX's generated designs looked generic: the same centred hero, icon-card grids, rounded boxes and letter-spaced labels, whatever the brief. This change adds an **art-direction stage** before anything is drawn, a **renderer driven by that direction**, a **layout planner**, and a **check of the drawn page** with bounded automatic revisions. The designer can set as much or as little of the direction as they want, and what they decide is kept.

---

## 1. Audit: why every design looked the same

The pipeline was safe and deterministic (the model writes a `DesignSpec`; `lib/ux-v0/render.ts` draws it), but nothing in it decided what a page should *look like*. Reading the code end to end:

| Where | What it did | Effect |
|---|---|---|
| `render.ts` `css()` | One stylesheet for every brief. A brief could change only the palette, two fonts, a three-step scale, a radius and one of five `style` flags (which changed an eyebrow colour or a rule). | Every page shared one grid (1200 px wrapper), one type ratio, the same heads, buttons, spacing and breakpoints. |
| `render.ts` markup | Uppercase letter-spaced eyebrows above every heading; filled and outlined buttons that lift on hover; features as an icon above a title; rounded CTA boxes; centred section heads. | The look of a thousand template sites. |
| `spec.ts` library | Stock SaaS vocabulary: centred and split heroes, icon-card grids, pricing cards, an accordion FAQ, a CTA box. No statement or poster hero, no index or columns, no pull quote or giant numerals. | Even a perfect model could only assemble the generic page. |
| `spec.ts` defaults | Fraunces with Inter, soft radius. | The default type pair of generated design. |
| `design.ts` prompt | One shot: tokens and sections in a single call, no concept, no stated voice, nothing telling the model what to avoid. | The model's own habits ("Elevate your…", three features with icons) went straight to the page. |
| Diversity | No mechanism. Two different briefs only differed in colour. | Low variety between projects. |
| Quality | Nobody looked at the rendered page. | Overflows, weak hierarchy or cramped phones reached the designer. |
| Control | Refine patches could change any token silently. | Approved decisions could drift during iteration. |

## 2. What changed

### 2.1 The art-direction stage

`lib/ux-v0/direction.ts`. A direction is a decision, shown to the designer before generation: a **visual language**, a palette, a type pair, a concept, a voice for the copy, how the page is composed, how imagery is treated, and what the direction **refuses**.

**Twelve visual languages**, each a whole system rather than a theme: *Broadsheet* (printed review), *Swiss grid*, *Quiet luxury*, *Poster*, *Hand and table* (craft), *Geometric paper* (Socria-like), *Instrument panel* (developer tools), *White cube* (gallery), *Soft ground* (care and wellness), *Public service*, *After dark*, and *Two-colour print* (riso). Each sets fonts from the allowlist, a type ratio, weight and case, label style, grid, alignment, width, rhythm, containers, rules, buttons, image frame and treatment, motifs (numbering, flat shapes, marquee, captions, giant numerals, pull quotes, icons), a palette strategy, second ink, preferred section variants, grounds for sections, and concept, voice and composition text.

**The engine** (deterministic, free, about 30 ms) proposes three:

1. It scores each language against the brief. What the brief says about the look counts most (visual direction ×2, layout ×1.2, objective ×1, goals ×0.6, audience ×0.5, personality ×1.2). The designer's own notes count most of all (×4, and synonyms like "risograph" or "newspaper" +8). Words in *avoid* and clashes (an after-dark look for a GP practice) count against.
2. The **first** option is the faithful reading: the best fit, with the brief's approved palette and type **exactly as approved**.
3. The **second** and **third** maximise a mix of fit and *distance* from those already chosen (`directionDistance`, 20 weighted attributes from grid and containers to ground and accent hue), so the three always differ visibly.
4. **Asking again** shows languages not yet seen; a seeded generator varies fonts and parameters within a language.

**The model's part** (`/api/ux-v0/direct`, one small call): it writes each option's name, concept, rationale, voice (with an example headline), composition, imagery and refusals for this brand, and may choose better faces from the list. `parseDirections` lays its words over the engine's options. A font off the list, a display face as body text, a change to a locked group, or an unrequested change of language is dropped. The browser shows the engine's three at once and replaces their words when the model answers. If the model fails, the engine's options stay.

### 2.2 Human control: as much or as little as the designer wants

| The designer wants to… | What they do | What happens |
|---|---|---|
| Not think about it | **Approve and let SocriaUX choose** on the brief | The faithful direction is applied; generation runs. |
| Choose | **Use this direction** on one of three specimens | That direction is applied. |
| Steer | Write their own direction ("like a printed museum guide", "darker, no serifs", a hex) and what to avoid, then **Show three for this** | Directives are read in code (dark ground, serif or sans, capitals, corners, colour, louder or quieter, named fonts, no photographs) and applied to every option; fit follows their words. Each option says "From your notes: …". |
| Decide details | **Change any part of it**: colours, faces, scale, case, weight, grid, width, space, containers, buttons, corners, image treatment and frame, motifs, voice | Each change **locks** its group. Groups can be locked or unlocked directly. |
| Keep decisions | Locks | Locked groups survive *Show three others*, regeneration and "make it moodier" (which revises the direction and keeps the locks). A refine comment that would change a locked group is caught **in code** (`lockedChanges`). SocriaUX asks first, and the change happens only if the designer confirms. |
| Change later | A token or look change on the design | It becomes the direction's, so the next generation keeps it. |

Specimens in the Direction step are drawn by the same renderer the design uses, so what is chosen is what will be drawn.

### 2.3 A renderer driven by the look

`lib/ux-v0/render.ts` now writes only the rules a look uses, so different directions give different stylesheets:

- **Type:** a modular scale from the ratio (1.2 to 1.62), fluid from phone to desktop, with weight snapped to what the family really has, case and tracking, `*emphasis*` set as italic, accent, underline or highlight (italic only where a true italic is loaded), and five label styles.
- **Grid:** stack, editorial side-heads, Swiss columns, centred, asymmetric, poster, or modular cells. Plus width and alignment.
- **Surfaces:** containers (open, ruled, cards, bands, framed), rule weight, six button styles (solid, pill, outline, underlined link, heavy block, hard offset shadow), corners.
- **Imagery:** natural, muted, warm, mono, high-contrast, or a real two-ink **duotone** (an SVG colour filter computed from the palette), with plain, mounted, arch, circle or offset frames.
- **Motifs:** section numbers, flat geometric shapes in the direction's inks, a running marquee, figure captions, giant numerals, pull quotes, and icons only where the language uses them.
- **Grounds:** each section sits on a tone (page, alternate, accent, second ink, inverted). Every tone carries its own text, muted, rule, ink and button colours, each checked to read at 4.5:1 or better, and shape inks that show on it.
- **New section variants:** hero *statement* and *poster*, features *index* and *columns*, quote *pull*, stats *giant*, CTA *statement*, text *lead*.
- **Fonts:** the allowlist grew to 41 faces, among them Socria's own Old Standard TT and Geist, Anton, Unbounded, Gloock and Big Shoulders. Every request URL was checked against Google Fonts.
- **Back-compatibility:** specs saved before this change draw with the **classic** look, which reproduces the old renderer, so existing projects do not change.

### 2.4 The layout planner

`planLayout` (direction.ts) runs after generation. It uses the language's preferred variants where the model left a choice. It never builds two neighbouring sections the same way, allows at most two card grids, assigns grounds and spacing (a dramatic rhythm where the language has one), and never drops a picture a section carries. It leaves alone anything the designer fixed.

### 2.5 Generation that follows the direction

`generateSystem(brief, direction)` gives the model the approved concept, voice, composition, imagery, refusals and preferred variants. It also tells the model not to write tokens, and to avoid generic habits: stock phrases ("unlock", "elevate", "seamless", "welcome to"…), an eyebrow on every section, an icon grid by default, the stock section order. `parseGenerate` applies the direction's tokens and look **in code**, whatever the model returned.

### 2.6 Looking at the drawn page, and bounded revisions

The browser cannot photograph a sandboxed page, and the server has no browser, so SocriaUX **measures** what was drawn instead. `lib/ux-v0/audit-source.ts` runs inside the sandbox (part of the inspector) and reports:

- section boxes and grounds, and heading sizes and line counts;
- contrast of real text on its real ground;
- targets under 44 px, images that failed, anything wider than the screen, and line lengths;
- the generic page's habits: gradients, soft shadows, rounded boxes, letter-spaced capitals, centred text, emoji.

After every generation, **before the design is shown**, the workspace draws the page offscreen at **1280 and 390 px** (`components/ux-v0/measure.ts`, the same sandbox as the canvas). `lib/ux-v0/evaluate.ts` reads the measurements:

- **Findings** are scored by severity, with deterministic **fixes** where one exists:
  - a headline wider than the phone: step the type scale down;
  - text failing on a coloured band: move the section to the page's own ground;
  - weak hierarchy: step the type scale up;
  - identical neighbours: vary the variant.
- **Words-needing issues** (a six-line headline, stock phrases) become "Ask SocriaUX to fix it" actions.
- At most **two rounds** of fixes are applied before the design appears, kept as one version (Undo shows the design as generated). The page never changes under the designer's hand. Nothing the designer locked or fixed is touched; those findings say why. Removing a picture is only ever offered, never done automatically.

The **Checks** tab shows the scores, what was fixed, what is left, and "what could make it look generic". After a change, the page is checked again and findings are reported, not acted on.

## 3. Verification

### Tests

- **Unit** (`test/ux-v0.test.mjs`, 237 checks), with these new ones:
  - **The engine:** three languages that differ, the faithful first option, the same three for the same brief, a clash never offered, new languages on asking again, the designer's words leading, locks surviving.
  - **The model's words:** laid over the engine's options, with off-list fonts, display faces as body text and locked groups rejected.
  - **The renderer:** three directions give three stylesheets; text reads on every ground; the planner varies neighbours and keeps pictures; tone and look patches work.
  - **The evaluator:** fixes, locks blocking them, pictures never removed automatically, stock phrases found, bounded rounds.
- **Routes** (`test/ux-v0-route.test.mjs`, 73 checks, with a scripted model):
  - `/direct` returns three directions written for the brand, keeps locks, and fails calmly;
  - `generate` applies the approved direction whatever the model writes, and revises it in words while keeping locks;
  - `refine` asks before changing a locked group, and goes through once the designer confirms;
  - signed-out callers are refused.
- **Browser** (Playwright, scripted model):
  - **Workflow A** now goes through the Direction step: three specimens, ask again with the designer's words, change one part (it locks), use it. Generation follows that direction; the checks run before the design appears (about 0.9 s in the browser), followed by change, undo, critique and versions.
  - **Workflow B, checklist (52), acceptance (33) and gallery (48):** pass.
  - **Found and fixed on the way:**
    - The *classic* look drew older designs' headlines smaller than before. It now uses the old sizes exactly.
    - Cards on coloured grounds tinted toward the text and fell to 3.9:1. Cards now keep text and muted text at 4.5:1 or better on every ground.
    - The audit counted lazy images that had not loaded yet as broken.
    - Fixes once landed after the design was shown. They now land before.
  - **The section check** now draws every kind and variant across the five classic styles and all twelve languages, with every section on a different ground.
- **Repository:** `npm test` (372 suites), `tsc --noEmit` and `next build`.

### Benchmark: nine briefs, before and after

`test/browser/ux-v0/benchmark.mjs`, real Chromium, real Google Fonts, real Openverse photographs (licensed, credited on the page).

**The briefs:**

- Socria's landing page, with its palette and type **locked** to the brandbook;
- the Socria One launch, brand locked plus the note "louder, it is a launch";
- a coffee bar, an architecture studio, a science festival, a GP practice, a boutique hotel, a jazz bar, and a Postgres developer tool.

The copy is hand-written, so the benchmark measures the design system rather than one model run. *Before* is the renderer as it was (git `e5e927a`), given the same copy, the brief's palette and type, and the old style that best matched. *After* is the engine's three directions, each planned, drawn at 1280 and 390 px, measured, and revised in at most two rounds.

| | Before | After |
|---|---|---|
| **Quality** (evaluator, 0–100: overflow, contrast, targets, images, hierarchy) | 87.4 | **99.9** (98.7 before the automatic fixes) |
| **Distinctiveness** (evaluator, 0–100: absence of generic habits, each listed) | 74 | **98.5** |
| **How different the looks for different briefs are** (look distance, 0–1) | 0.19 | **0.61** |
| How different screenshots for different briefs are (pixel distance, first option) | 0.46 | 0.44 |
| How different the three options for one brief are | one design only | look 0.60 · pixels 0.25 |
| Locks kept (palette and type for Socria and Socria One) | — | **all** |
| The faithful option keeps the approved palette and type | — | **9 of 9** |

**What the old pages failed on.** Questions in the FAQ were 28 px tall, too small to tap on a phone (Socria, Riverside). Placeholders on coloured bands read at 1.3–2.2:1 (Atelier Nord, Lumen). The new renderer fixes both, including for older designs drawn with the classic look.

**What the checks fixed on their own:**

- giant figures that overflowed a phone (Socria) were set as a row;
- a call to action whose text failed on its band (Maison Aurèle, *Hand and table*) was moved to the page's own ground.

**How to read the pixel numbers.** The faithful option keeps each brief's own palette and photographs, which dominate a downscaled screenshot. So across briefs the pixel difference barely moves, while the *looks* (type, grid, surfaces, imagery, motifs) became three times as different. Within a brief, the three options differ visibly.

**Fidelity to the human.**

- The faithful option kept the brief's approved palette and type in all nine briefs. Locked palettes and type held through *asking again* for Socria and Socria One.
- The notes "louder, it is a launch" moved Socria One's first option from *Geometric paper* to *Poster* and ruled out *Quiet luxury*.
- Notes of "darker, like an evening bar, no serifs" on the coffee bar gave an after-dark first option, sans headlines on every option, and square corners from "avoid rounded" (unit tests).

**Socria's own pages.** With the brandbook locked:

- The landing page's first direction is *Geometric paper*: Old Standard TT questions, Geist for everything operated, paper ground, deep moss for the one filled control, and flat arch, circle, quarter and diamond shapes in moss and apricot (the engine's second ink for this palette lands on the brand's apricot). There are no gradients or shadows.
- The Socria One launch is *Poster*: the same faces at a larger scale, a moss marquee and colour fields.

These are the pages most likely to be used as they stand.

### Latency and cost

| | Before | After |
|---|---|---|
| Choosing directions (engine, in the browser) | — | 24 ms, no model, no cost |
| Rendering a design | ~2 ms | 1.3 ms |
| Checking before it is shown (two offscreen frames, at most three measurements) | — | about 0.9 s in the browser (workflow A); the audit itself 18 ms a page |
| Model calls for one design | `generate` | `direct` (once per round of directions, optional), then `generate` |
| Estimated cost at `gpt-6-luna` prices, from the benchmark's prompt sizes | US$0.00062 | US$0.0015 (generate ~2,000 input tokens instead of ~1,780; `direct` ~2,800 tokens) |

The extra cost is about a tenth of a US cent per round of directions, and nothing when the designer lets SocriaUX choose. The checks cost nothing: they run in the browser and call no model. The only new paid call is `direct`, and the Direction step works without it: the engine's three appear at once, and the model's words replace theirs only when it answers.


## 4. Limitations

- **No real model here.** This sandbox cannot reach the OpenAI API (D9 in `docs/SOCRIAUX-V0.md`). The model's part was tested with a scripted model in route tests and the browser workflow, and the benchmark used hand-written copy. Two things therefore remain unmeasured: whether `gpt-6-luna` writes concepts as good as the engine's templates (or better), and whether it follows the anti-generic rules.
- **No pixel-level model critique in production.** The checks measure the laid-out DOM, not pixels: SocriaUX cannot capture the sandboxed page from outside it, and there is no server-side browser. Real screenshots are used in the benchmark (where I reviewed them visually during development). A vision-model review of each generation would need a server-side renderer and would add cost per generation; it is not built.
- **The distinctiveness score is a heuristic.** It counts known generic habits and lists them so a designer can disagree; it is not a measure of taste.
- **Language fit is keyword-based.** It reads the brief's words, not their meaning, so an unusual brief can get a mediocre first option. The designer's notes override it, and the model can swap a language when the notes ask for one.
- **Copy quality is the model's.** The planner and renderer make weak copy look intentional, but cannot rewrite it. Stock phrases are flagged, with a one-click request to rewrite them.
- **The engine's concept text is templated.** Without the model, every brand gets the same sentence shape for a given language.
- **A reload in the second after a change can still lose it** (found during verification, older than this change). Saves waited for a 300 ms pause that a stream of small updates could postpone indefinitely; they now happen at most 1.5 s after the first unsaved change, and a save is attempted when the page is hidden or left. A guaranteed write on reload would need a synchronous rescue copy; it is not built.

## 5. Files

| Piece | File |
|---|---|
| Visual languages, the engine, locks, the planner, the model's prompts | `lib/ux-v0/direction.ts` |
| The look (types, normaliser, classic look), new variants, tone and look patches | `lib/ux-v0/spec.ts` |
| The renderer | `lib/ux-v0/render.ts` |
| Colour arithmetic | `lib/ux-v0/color.ts` |
| Fonts (41, weights and italics per family) | `lib/ux-v0/fonts.ts` |
| The audit that runs in the sandbox | `lib/ux-v0/audit-source.ts` (inside `inspector.ts`) |
| Findings, scores, fixes | `lib/ux-v0/evaluate.ts` |
| Generation and refinement prompts | `lib/ux-v0/design.ts` |
| Routes | `app/api/ux-v0/direct` (new), `generate`, `refine` |
| The Direction step, offscreen measuring, Checks | `components/ux-v0/DirectionBoard.tsx`, `measure.ts`, `Workspace.tsx` |
| Benchmark | `test/browser/ux-v0/benchmark.mjs`, `benchmark-briefs.mjs` |
