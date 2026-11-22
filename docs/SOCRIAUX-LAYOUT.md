# SocriaUX: layouts the designer decides, and the rest varied per project

## Why

Two questions led here: does SocriaUX follow templates, and is every design really its own? Measured before this change:

- **The same brief gave identical directions**, in every project.
- **20 booking briefs gave 60 directions but only 4–5 distinct booking structures.** A structure is the parts, the layout of each and how each is set (`lib/ux-v0/structure.ts`).
- **Generated defaults had the generated look.** Nobody chose the centred opening, the grid of icon cards or the rounded cards everywhere.

The aim: layouts follow what the designer decides; what they leave open differs from project to project and stays within the direction's look. Nothing defaults to the habits of generated pages.

## What the designer decides (`lib/ux-v0/layout.ts`)

Four decisions shape a layout more than any other. They live in the brief, as `brief.layout`:

| Decision | Values |
|---|---|
| What comes first | depends on the kind of work: for a booking, the times, the thing being booked, or a picture of the place; for a dashboard, the key figures, the trend or the detailed list; for a portfolio, the work, a statement or one big picture; for a form, the form alone or why it is asked beside it |
| Arrangement | one column, side by side, uneven, layered |
| Alignment | to one side, centred |
| Pictures | none, beside the words, pictures lead |

Space (density), grid, width and corners stay in the brief's exact specifications, as before.

Each decision records where it came from, and the brief says so:

1. **The designer's words.** "Asymmetric, the times first, not centred" is read with the phrase it came from. A negative counts: "not centred" is a decision for one side.
2. **Their answer to the layout question.**
3. **What they set in the Living Brief.** This is final. "SocriaUX decides" leaves a decision open on purpose, and old words do not take it back.
4. **The instruction a brief rewrite was asked with.** This is the newest word, so it can change any of the above.

A layout the model writes into a brief is dropped. These decisions are settled in code, never by the model.

## The one layout question

Discovery asks at most one layout question: what someone should see first. It asks about priority, not grids.

- **When.** Never before the first answer while the model still has a question (who it is for comes first). Never as a third question in a turn, never when the designer's words already say what leads, and never twice.
- **Drawn.** Each answer is drawn as a grey sketch that carries the designer's own words: their subject and their name. "You decide" is drawn as an open sketch beside them.
- **No model call.** The question is SocriaUX's own (`withLayoutQuestion` in `lib/ux-v0/discovery.ts`). A question about hierarchy that the model writes gives way to it, and the model is told not to ask one.
- **Free when discovery is done.** If discovery was already ready when it was asked, answering it costs no further turn: the brief reads the answer.

## What is varied: settings, within each language, seeded per project

A booking and an opening (hero) now have **settings** as well as a layout (`SHAPE_FIELDS` in `lib/ux-v0/spec.ts`):

| Section | Settings |
|---|---|
| Booking | side; times as tiles, rows or pills; the choice shown in a card, plainly or beside the button; proportion; density; heading alignment |
| Opening | alignment; which side the words sit on; where they sit over a picture; line length; headline size; the words' share beside a picture |

How the settings behave:

- **Only what is drawn.** Each layout offers only the settings it draws (`SHAPE_EFFECTIVE`). A test renders every one with a non-default value and checks that a rule of the page's own CSS selects an element with it, so no control is decorative.
- **Each language has its ranges.** Every visual language sets these within its own ranges (`RANGES`), so two Swiss designs differ but both read as Swiss.
- **What is decided holds.** Decided values hold in every direction. An even split stays even and an uneven one stays uneven; a booking led by what is booked keeps its card first.
- **Seeded per project.** The seed includes the project's id (`saltOf`). One project draws the same directions every time, in the browser and on the server alike. Another project with the same brief draws others.
- **Each language's own choice.** For a project, each language also chooses between its two favourite layouts and plans, not always the first. Alternative languages that are nearly as good as each other are nudged per project.

Colours and type the brief sets are not varied. They are the designer's.

## Where the decisions hold

- **Directions.** `composeDirections` filters plans and booking layouts by the decisions, then sets each direction's settings.
- **Studies and generated designs.** `fitToIntent` calls `honourLayout`, whatever the model drew. The decided lead comes first. No pictures means none. An opening or booking the decisions rule out becomes one they allow, and the direction's own choice is kept when it is allowed. A form led by why it is asked sits beside it; one led by the form alone stands on its own. A decided alignment and arrangement hold.
- **Existing designs.** A decision changed in the brief can be applied to an existing design in place ("Apply to the design", `briefToDesign`) without redrawing it.
- **The generator.** The generator is told the decisions, and that the rest is its to vary.
- **Fixed or locked sections.** A section the designer fixed or locked is never touched.

## Defaults that don't look generated

Where nothing was decided, `avoidGeneric` removes three habits, and says so in the design's notes:

- **A centred opening becomes one set to one side.** The fallback for an opening that loses its picture is now one side, not centred.
- **A grid of icon cards becomes a numbered list or plain columns.**
- **Rounded cards everywhere get softer corners.**

A designer who decides one of these gets it. A language that uses one on purpose keeps it: quiet luxury and organic centre; organic and craft round.

## In the interface

- **Questions.** The layout question shows its sketches (`components/ux-v0/LayoutSketch.tsx`, `Discovery.tsx`).
- **The Living Brief.** "How it is laid out" leads with the decisions. A sketch of what is decided sits beside four selects, each with "SocriaUX decides", above a line saying where each decision came from and what is left open (`BriefDoc.tsx`).
- **The section editor.** For a booking or an opening, the editor offers its settings. Segments apply at once. A range applies when it is let go, as one version that Undo takes back (`SectionEditor.tsx`). Each change is a `shape` patch, and the model can ask for the same.

## How it was verified

| Check | Result |
|---|---|
| Unit tests (`node test/ux-v0.test.mjs`) | 515 pass, 70 of them new |
| Route tests (`node test/ux-v0-route.test.mjs`) | 122 pass, 13 of them new |
| Layout benchmark (`test/browser/ux-v0/layout-bench.mjs`) | 18 checks pass |

The route tests cover:

- the question replacing the model's;
- the brief settling from words and answers;
- the model's layout being dropped;
- a rewrite keeping the designer's choice unless its instruction says otherwise;
- the server drawing exactly the browser's directions for a project;
- generation honouring the decisions.

The layout benchmark is offline and makes no model calls:

| Measure | Result |
|---|---|
| 20 booking briefs, 60 directions | **47 distinct booking structures** (46 when this was first built); 7 when the same directions are measured without settings or project salt; the most repeated structure appears 3× |
| One brief in 20 projects, 60 directions | **40 distinct structures** (42 when this was first built; see below); of 190 pairs of projects, 12 share the first direction's structure (17 before) and none share all three |
| Decisions held | 60 of 60 directions for each of: the class first, the times first, centred, uneven, no pictures; 30 of 30 for a site with the work first and centred |
| Where nothing was decided | 0 centred openings nobody chose (of 30); 0 rounded cards everywhere |
| In a browser | 60 booking studies at 1280 and 390 px: nothing scrolls sideways, every text reads on its ground, every booking passes its self-test (choose, confirm, change) |

The interface pass (`ui-qa.mjs`) drives the real app through all of this at five widths.

While building it, the benchmark found a real fault. The immersive booking's photo credit was white 12px text with nothing behind it, so on a light photo it could not be read. It now sits on its own dark backing.

## Limits

- **One brief in 20 projects fell from 42 to 40 distinct structures** when each direction gained a plan with one bold move ([SOCRIAUX-CRAFT.md](SOCRIAUX-CRAFT.md)). A split that is not a direction's move is kept from being sharply uneven, so fewer proportions are possible. The bar is 40. Fewer pairs of projects now open with the same structure (12, from 17).
- **47, not the 50 aimed for.** A booking screen is one component, and each language keeps a narrow range on purpose, so this is near what settings alone can give. More variety would need new layouts, not wider ranges.
- **The first direction keeps the brief's colours and type.** It is the faithful reading, so two projects with the same brief look alike in colour and type when the brief sets them. They differ in layout and settings.
- **Settings exist only for the booking and the opening.** Other kinds vary by layout and order only.
- **The sketches are diagrams, not previews.** They show what a decision means. The design itself is drawn by the renderer.
- **No live model call was made.** Whether a model's own drafts follow the decisions is untested; whatever it draws, the code enforces them.

## Running it

```bash
node -e "import('./test/helpers/build.mjs').then((m) => m.buildAll())"
```

```bash
UXV0_OUT=/tmp/layout node test/browser/ux-v0/layout-bench.mjs
```

**Since then:** every direction states a plan with one bold move and a detail only its subject has; the looks generated pages share are kept out unless asked for; a designer's design system can be built within; and openings can be composed from layout pieces. A layout the designer decided counts as the plan's one bold move. See [SOCRIAUX-CRAFT.md](SOCRIAUX-CRAFT.md).
