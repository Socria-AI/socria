# SocriaUX: the creative workspace, start to finish

**Branch:** `dev` · **Applies to:** `/ux-v0` (Create) · **Scope:** starting fresh only (no design-system import, no Figma, no enterprise features).

SocriaUX already had an art-direction engine (`docs/SOCRIAUX-ART-DIRECTION.md`) and a studio-style workspace (`docs/BRAND-TRIAL.md`). This overhaul works through the whole path a designer takes, and makes each step something they direct:

**Start → adaptive questions → Living Brief and moodboard → three art directions → canvas → refinement → export.**

Each part below says what the designer can now do, what SocriaUX does with it, and where it lives. Section 7 lists what was tested and how, and section 8 what this does not do.

---

## 1. Motion is part of the look

Before this, every generated page was still. Motion is now a group of the `Look` (`lib/ux-v0/spec.ts`), chosen, locked and refined like colour or type:

| Setting | Values |
|---|---|
| Feel | still, calm, measured, lively, kinetic |
| Entrance (sections arriving) | none, fade, rise, slide, scale, mask |
| Headline | none, fade, mask, words, letters |
| Hover | none, lift, underline, invert, zoom |
| Ease | gentle, out, expo, snap, linear |
| Sections | none, wipe, expand |
| Also | duration, stagger, distance, scroll-linked arrivals on or off, parallax strength, a nav that condenses on scroll |

`lib/ux-v0/motion.ts` turns a motion into CSS. There is no script, so it runs inside the sandbox and in the exported HTML:

- **The first screen arrives on load.** The headline arrives word by word or letter by letter, depending on the motion. A letter-by-letter headline over 42 characters falls back to words.
- **Everything else arrives as it scrolls into view.** This uses CSS scroll-driven animations (`animation-timeline: view()`) inside `@supports`. A browser without them shows the page without the arrivals.
- **Moving parts.** Parallax on pictures and flat shapes (never on arch, circle or offset frames, where it would break the frame), section wipes, a marquee that runs, and a highlighted word whose highlight sweeps in with its first letter.
- **Reduced motion.** Under `prefers-reduced-motion` nothing travels: the first screen fades in for 240 ms, and every other animation is off.
- **App screens move less.** Only the main area fades in, plus hovers. A working interface has no use for scroll theatre.
- **The canvas shows a design still** (it is drawn at full height, where scroll-driven motion means nothing). **Preview** (`components/ux-v0/Preview.tsx`) plays it in a real scrolling viewport at desktop, tablet and phone width, with *Replay* and a reduced-motion switch. The export plays it.

Motion is also read from the designer's words ("calm", "kinetic", "no parallax"), and the avoid list can rule it out entirely ("motion" → still). Each visual language has its own feels. "Minimal" steps the feel down one place and "louder" steps it up, unless the designer named a feel themselves.

## 2. The moodboard directs, it does not decorate

A reference now carries what the designer means by it (`lib/ux-v0/types.ts`, `lib/ux-v0/references.ts`, `components/ux-v0/Moodboard.tsx`):

- **Their note**, in their words ("the light, not the bar itself"). *SocriaUX reads* shows how SocriaUX understood it, so a misreading can be seen and corrected.
- **What to take from it, and what to leave**, from seven aspects: atmosphere, colour, typography, composition, imagery, texture, motion.
- **Key references** lead the reading. References under **Steer away** are read as things to avoid.
- **Its colours**, sampled from the picture in the browser, which can be kept as a palette. The second direction is built from them unless colour is locked.
- **Your own references**: dropped or chosen files, stored in this browser (IndexedDB) with the project, and deleted with it.

**Inspiration and content are kept apart, in code.** Only a picture marked *Use the picture on the page* can be placed in a design (`usableImages` in `spec.ts`). Every other reference is described to the model as inspiration, never handed over as an image to place, and a check flags any inspiration image that appears on the page anyway. Pictures from the libraries start as inspiration. Pictures kept by older projects stay usable, so existing designs do not change.

SocriaUX reads only the designer's words and the colours it samples. It does not see what is in a picture (section 8).

## 3. Direction is an art director's presentation

`components/ux-v0/DirectionBoard.tsx`. Each of the three directions is a spread, not a card:

- its name set in its own typeface, and its thesis;
- a desktop study and a phone study, drawn by the renderer itself as real pages in the direction;
- type and colour specimens, its atmosphere (the designer's own references, shown through the direction's picture treatment), its motion, and its composition;
- what it refuses;
- locks per group (palette, type, layout, motion, and others), *Preview in motion*, *Use this direction*, and *Not this one*, which replaces that one direction with a different language;
- *Change any part of it*, an editor with a Motion section.

There is no image generator. The studies are rendered pages and the atmosphere is the designer's own references, so nothing on the board pretends to be AI-made imagery.

## 4. The Living Brief is a specification

`components/ux-v0/BriefDoc.tsx`, `lib/ux-v0/brief.ts`. The brief has twelve parts: audience, experience, personality, colour, typography, layout, imagery, motion, function, accessibility, smaller screens and rules. Each part has a status:

| Status | Meaning |
|---|---|
| Suggested | written by SocriaUX, not yet agreed |
| Approved | agreed; if a later rewrite changes it, it goes back to *Suggested*, and the designer is told |
| Locked | a rule: kept word for word through any rewrite, and applied to every direction as a lock |
| SocriaUX decides | left to SocriaUX (also set when a question is answered *You decide*) |

There is an exact specification as well, for those who want one: type ratio, density, grid, width, corners, motion and contrast (AA or AAA). Each is *From the direction* unless set. **Rules** ("No capitals", "No rounded corners", "No animation") are read as hard constraints for every option, and checked on the page where they can be measured. A change to the brief can be applied to an existing design without regenerating it: only the visual parts that changed are applied, as a new version that *Undo* takes back.

**The questions adapt.** A topic already answered or delegated is not asked again, and any question can be answered *You decide*. *See directions* is there as soon as there is enough to go on. When the first intent is already detailed, the page says so, and the model is told to ask at most one question. That last part is a prompt instruction, tested here only with scripted answers.

## 5. Design knowledge, fidelity and precise refinement

- **Knowledge** (`lib/ux-v0/knowledge.ts`): 33 principles, each written as a rule with the reason it works. They cover typography, composition, hierarchy, colour, imagery, motion, interaction, responsiveness, accessibility, references and critique. Every finding the checks report gives its reason, as a "Why:" line. Generation is reminded of the eight that matter most for the chosen direction: a kinetic poster gets reminders about kinetic type and reduced motion, a public service does not. These are SocriaUX's own synthesis of long-standing practice; no gallery or course is fetched or claimed.
- **Fidelity** (`lib/ux-v0/evaluate.ts`): the checks compare the page with its direction (palette, type, motion), with the brief's locks, with AAA if asked for, with the rules, and with the moodboard (no inspiration picture placed). Each drift comes with a fix that restores it. A restore is not blocked by the lock it restores. The Checks panel shows a *faithful* score and *What it keeps*.
- **Precise refinement** (`lib/ux-v0/refine-local.ts`): 18 adjustments, each applied in code as one undoable version:
  - type: a new pairing from the language's own faces, larger, smaller;
  - colour: warmer, cooler, more contrast, dark or light ground;
  - layout: more experimental, calmer, more space, denser;
  - motion: calmer, livelier, none, more expressive interaction;
  - pictures: another treatment, another frame.

  Everyday requests are recognised and done at once, with no model call: "keep everything, but change the typography", "warmer colours", "reduce the motion intensity", "make the layout more experimental", "keep the composition, but make the interaction more expressive". An adjustment that would change a locked group is refused, with the reason.

## 6. Dogfooding, and what it found

`test/browser/ux-v0/dogfood.mjs` makes six kinds of project:

- Socria's promotional site;
- Socria One's product announcement;
- a climate lab's research site;
- an illustrator's experimental portfolio;
- a finance team's interface;
- a dance company's motion-rich site.

Each project is asked four ways:

- **minimal**: the brief alone;
- **detailed**: an exact grid, scale and motion, colour, layout and motion locked, and the rules "No capitals" and "No rounded corners";
- **extensive moodboard**: notes on references, sampled colours, a moving reference and a reference to steer away from;
- **experimental**: "more experimental: kinetic, asymmetric, oversized type, louder".

Every case was proposed, laid out, drawn with the real typefaces, photographed at 1280 and 390 px (and mid-arrival, for motion), measured, and looked at.

What the review found and fixed:

| Found | Fix |
|---|---|
| "No capitals" was read as *capitals* | negation is read before the word |
| "No rounded corners" kept pill buttons | square corners give square buttons |
| A locked palette reported false drift | the palette is normalised before comparing |
| The finance interface got a luxury showroom language | app screens favour interface languages, unless the designer's words ask otherwise |
| The interface scrolled sideways on a phone | one column with a zero minimum |
| A note, "the light, not the bar itself", was read as *a light ground*, and turned the dance company's dark stage white | only the colour of a page counts ("light background", "light and airy"); "the light" is atmosphere |
| "louder" and "oversized type" were not read | they are, as bigger, bolder type |
| "a asymmetric composition" | "an asymmetric composition" |
| The harness stubbed the fonts, so its photographs showed fallback faces | it loads the real faces through the proxy |
| Wide capitals (Unbounded) broke "DRAWINGS" mid-word on a phone, and pushed the playing page 21 px sideways | every headline size is capped so its longest word fits, from measured advances of all 41 faces (`advanceEm` in `fonts.ts`) |
| A one-column grid widened to its longest word ("DOWNLOADABLE") | zero-minimum tracks on every one-column grid |
| My own phone fix had overridden the interface's twelve-column grid on desktop | the one-column rule now applies below 1100 px only; a chart takes eight columns only beside a feed |
| A table with a "Status" column got a second one | the status goes in the column it has |
| Two overlapping area fills read as one muddy shape | only the subject is filled; a comparison is a dashed line, with a dashed key |
| A highlight showed as an empty block before its letters arrived | it sweeps in with its first letter |
| Three stat cards stacked one per row on a phone | two to a row |

The final run's results are in section 7.

## 7. Verification

See the final report for this change for the numbers of the last run. What was run:

- **Typecheck**: `npx tsc --noEmit -p .`.
- **Unit tests**: `node test/ux-v0.test.mjs`, now with sections for motion, the moodboard, Direction, the Living Brief, knowledge and refinement, and the dogfooding fixes. Also the full repo suite (`npm test`), including the route tests and the house consistency test.
- **Browser**: `sections.mjs` (every section kind and variant, every language and ground), `workflow-a-create.mjs`, `workflow-b-critique.mjs`, `checklist.mjs` and `acceptance.mjs` (which runs axe on the workspace) against the running app, with the model and libraries scripted.
- **Dogfooding**: `dogfood.mjs`, as in section 6. A word broken across two lines is detected from the text's line boxes. To make sure the detector works, it was run against the same headline with the fit removed: it catches the mid-word break, and the playing page's overflow is caught too.
- **Build**: `next build` with placeholder Clerk keys.

## 8. Limitations

- **No real model here.** This environment cannot reach the OpenAI API. Every model step (questions, brief, direction text, generation, critique) was tested with scripted responses, and the dogfood copy is hand-written. How well the real model writes in a direction, and whether it follows the knowledge and the rules, is unmeasured.
- **No image generation, and no vision.** SocriaUX does not make images, and it does not look inside the designer's references: it reads their notes and samples their colours. A reference with no note says only its colours.
- **Notes are read by keywords.** The light/light-ground misreading shows what that costs; others are possible. *SocriaUX reads* shows the reading so it can be corrected.
- **Motion is CSS only.** Arrivals, scroll-linked reveals, parallax, wipes, marquees, kinetic type and hovers. There are no scripted timelines, springs or physics, page transitions, scroll-scrubbed video or Lottie. Scroll-linked arrivals need a browser with CSS scroll-driven animations, and elsewhere the page is shown without them. The canvas shows designs still; Preview and the export play them. This is a foundation for motion design, not a motion tool.
- **Fit uses averages.** The measured advances are averages over common words, plus a 10% margin. A word made of unusually wide letters can still come close, and break-word remains the last resort.
- **Fidelity is measured against SocriaUX's own decisions.** A score of 100 means the page keeps its direction, locks and rules. It is not an independent judgement of quality.
- **The dogfood moodboard was the same for all six projects**, which is why three of them moved to the same gallery language. Two pages of one brand (Socria's site and its launch) get the same first direction, by design.

## 9. Files

| Piece | File |
|---|---|
| Motion: presets, words, CSS, kinetic headlines | `lib/ux-v0/motion.ts` (new), `lib/ux-v0/spec.ts` |
| Preview in motion | `components/ux-v0/Preview.tsx` (new) |
| References as direction: notes, aspects, content and inspiration, reading the board | `lib/ux-v0/references.ts` (new), `lib/ux-v0/types.ts`, `components/ux-v0/Moodboard.tsx`, `components/ux-v0/uploads.ts` (new) |
| Direction as a presentation | `components/ux-v0/DirectionBoard.tsx` |
| The Living Brief's statuses, rules and application to a design | `lib/ux-v0/brief.ts` (new), `components/ux-v0/BriefDoc.tsx`, `components/ux-v0/Discovery.tsx` |
| The engine: directives, the brief applied to directions, app fit | `lib/ux-v0/direction.ts` |
| Knowledge | `lib/ux-v0/knowledge.ts` (new) |
| Fidelity checks | `lib/ux-v0/evaluate.ts` |
| Precise refinement | `lib/ux-v0/refine-local.ts` (new) |
| Renderer: motion classes, word fit, one-column grids, app grid, tables, charts | `lib/ux-v0/render.ts` |
| Measured font advances | `lib/ux-v0/fonts.ts` |
| Prompts | `lib/ux-v0/design.ts`, `lib/ux-v0/discovery.ts` |
| Workspace wiring | `components/ux-v0/Workspace.tsx`, `components/ux-v0/V0App.tsx` |
| Dogfooding | `test/browser/ux-v0/dogfood.mjs` (new) |
| Unit tests | `test/ux-v0.test.mjs` |
