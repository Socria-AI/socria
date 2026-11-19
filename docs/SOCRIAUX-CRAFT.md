# SocriaUX: four methods against the generated look

## Why

Asked how some design tools make designs that do not look generated, and whether SocriaUX could do the same, four methods stood out. Each is a habit of a careful studio:

1. **Know the generated looks, and stay off them unless asked.**
2. **Plan before drawing, then critique the plan.** Named colours, the type, one layout idea, one bold move, and one detail only this subject has.
3. **Build within the designer's own design system** when they have one, and check every design against it before showing it.
4. **Compose layouts from validated pieces** (stacks, grids, proportions), not from a short list of fixed layouts, and never from raw code.

All four are now in SocriaUX. None of them makes a model call. They run in code on the engine's directions, its studies and every generated design.

## 1 · The looks generated pages share (`lib/ux-v0/tells.ts`)

A **tell** is a combination of choices, not one choice. Cream alone is fine. Cream with a serif headline and a terracotta accent is the look.

| Tell | What it is |
|---|---|
| `cream-serif-terracotta` | a warm cream ground, a serif display face, a terracotta accent |
| `black-acid-pop` | a near-black ground with one acid-green or vermilion accent and nothing else |
| `hairline-columns` | newspaper hairline rules boxing every part, with numbered sections |
| `purple-blue-gradient` | a purple-to-blue gradient opening on white |
| `emoji-markers` | emoji as section markers |
| `all-centred` | everything centred |
| `rounded-everything` | rounded corners on every box |
| `accent-rail-cards` | an accent bar down the side of rounded cards |

Tells are detected in three places:

- **On a direction**, before anything is drawn: its palette (by hue, saturation and lightness, not exact colours), its faces, its corners and its look.
- **On a design's spec.**
- **On the rendered page**, from the audit's counts: gradients, emoji used as markers, accent rails, centred blocks.

**What the designer asked for is theirs.** A tell is kept when it is asked for:

- in their words, read with negatives ("not centred" asks for the opposite);
- in their decisions (alignment centred, round corners);
- in colours that are their own: a palette they gave or locked, colours sampled from a reference, or a design system.

**Where nobody asked:**

- **The engine moves the direction off the look and says so.** "Kept off …, a look generated pages share."
- **A brief draft whose proposed palette shows one is flagged.**
- **The evaluation reports it in a design, with a fix.** A change of palette is offered, not made.

**Four languages that sat on these looks were reworked:**

- **Journal** (was Broadsheet): white instead of paper, a sans body face instead of serif on serif.
- **Quiet luxury**: a stone ground instead of cream.
- **Market label** (was Hand and table): grotesque display faces instead of Fraunces, on white.
- **After dark**: a deep ground of its own hue instead of black with one neon accent.

Soft ground now puts Fraunces last among its display faces. Two palette strategies were added for these, `stone` and `deep`. Quiet text on a `deep` ground is checked against the surface as well as the background.

## 2 · Plan, then critique (`lib/ux-v0/plan.ts`)

Every direction states its plan before anything is drawn, the way a studio's lead would:

- **Colours:** 4–6 of them, each named plainly ("stone", "deep teal", "near-black") with its role.
- **Type:** a display face used with restraint, a body face, and a utility face when there is one.
- **The layout idea**, in one line.
- **One bold move** it can actually draw: the headline set huge, one part on a field of the accent, one picture edge to edge, one figure set very large, a sharply uneven split, a framed picture, or one moment of motion.
- **One detail only this subject has**, shown as content: a yoga class's level and the room's °C, a bakery's oven times, a lab's °C, % RH and hPa. When the designer wrote a line with a number in it, that line comes first. For a subject with nothing known, nothing is invented: the plan says the detail is still to find.

**The critique** looks for what makes a plan generic:

- a generated look nobody asked for;
- no move the design can draw;
- two loud moves;
- a default type pair;
- numbering on parts that are not a sequence;
- no subject detail.

What code can change, it changes before anyone sees the direction. It picks another move, quiets the extra loud ones, gives the headline face the language's second body face, and takes numbering off. It never acts against a lock. What it cannot settle stays open and is said.

**The move is drawn, everywhere:**

- **In the direction's own fields**, so the study and the generated design start from it.
- **In every study.** 60 of 60 measured studies show their own move.
- **In every generated design.** `holdSignature` draws the move and quiets every other loud move. Anything fixed or locked is left alone.

**What the designer decided is a move already made.** An uneven arrangement they asked for is the plan's bold move and is never evened out. "Side by side", as decided, stays even.

**In the interface:** each direction card has a plan band. It shows the one bold move, the subject's detail, the colours by name, and what was checked before the designer saw it.

**The model's part:** the art-direction model may propose the detail and the move, which suits a subject it knows better than the code does. Both are validated: a move the design cannot draw is not taken.

## 3 · Building within a design system (`lib/ux-v0/design-system.ts`)

In the Living Brief, under **Design system**, the designer can attach their own.

**Formats:**

- W3C design tokens (`$value`, `$type`, aliases, composite typography);
- Style Dictionary and Tokens Studio JSON;
- flat JSON;
- CSS custom properties, including a dark block and `var()` references;
- guidelines in Markdown, read for rules and components.

**Two ways in:**

- **Files.** They are read in the browser. Nothing in them is run.
- **A public GitHub repository** (`/api/ux-v0/design-system`). The request must be signed in and is rate-limited. Only `api.github.com` and `raw.githubusercontent.com` are asked, with the owner, repository, branch and folder checked before they go in a URL. No redirect is followed. At most 8 files are fetched, each capped and timed out. A server-side `GITHUB_TOKEN`, when set, is sent to GitHub only.

**What is read:**

- colours by role: background, surface, text, quiet text, accent, on accent, lines;
- faces, the type scale, spacing and corners;
- rules and components.

**Faces SocriaUX cannot serve** are drawn with the nearest face it can, and the brief says so: "Söhne Breit is drawn with Inter".

**Built within:**

- **Locked into the brief.** The system's colours, type and corners are locked as rules, and its rules join the brief's. Every direction keeps them and differs only in composition.
- **Checked before showing.** Every design is checked against the system. Where it leaves it, the evaluation gives the change that puts it back, and locks do not hold that change back, because the system is the designer's.
- **Asked first.** A refinement that would leave the system is asked about before it is made.

**Detach** takes the system off the brief.

## 4 · Layout pieces (`lib/ux-v0/compose.ts`)

A **compose** section is built from pieces:

| Piece | What it is |
|---|---|
| stack | a row or a column, with a gap and an alignment |
| grid | up to 4 columns in proportion (5 : 7, 2 : 1 : 1), a gap, an alignment |
| box | pieces on a ground of their own: the page's, the alternate, the accent, inverted |
| text | an eyebrow, a title, a heading, a lead, body text, a caption or a quote |
| figure | a value and its label |
| image | one of the section's pictures, by its index, at a proportion |
| button | primary, secondary or a link |
| list | a few items, plain, numbered or ruled |
| rule | a line |

**It is still no code:**

- The model writes pieces as data, held to their shape: known pieces only, at most 4 levels deep, 48 pieces and 8 children each, every text capped, one title per section.
- The renderer turns them into markup from its own classes and numbers.
- Nothing the model wrote reaches the page as markup, style or a URL.
- Boxes use the same grounds as sections, so text and buttons keep their contrast.
- A title is capped by its column's width, so it cannot overflow.

**A new plan, `composed`, opens a page with a section composed from pieces.** Its arrangement is drawn per project:

- words beside a picture at a considered proportion, on either side;
- a figure set large beside the words;
- a caption set against the picture.

A sharply uneven proportion is used only when it is the plan's move. In the section editor, a composed section's columns can be changed, and its sides swapped.

## Measured

Every measure here comes from a run with **no model call and no live GitHub call**.

### The craft benchmark (`test/browser/ux-v0/craft-bench.mjs`)

15 of 15 checks passed.

| Measure | Result |
|---|---|
| Generated looks | 720 directions in 10 languages: **0** show one nobody asked for; the engine moved 63 off one |
| Plans | 180 of 180 directions state a whole plan; 180 found a detail only their subject has; 180 have a move they can draw |
| The move, drawn | 60 of 60 studies make at most one loud move, their own; **60 of 60 show it** |
| Moves chosen | headline set huge 79, one moment of motion 35, uneven split 28, field of colour 21, framed picture 9, one picture edge to edge 8 |
| Design system | a sample system with unservable faces: 24 of 24 directions keep its colours, faces and corners; 24 of 24 studies pass the check against it |
| Layout pieces | 97 of 360 site directions open with a composed section; 13 different composed openings among 49 openings in all |
| In a browser | 66 studies at 1280 and 390 px: 0 scroll sideways, 0 with text below contrast, 0 showing a generated look on the page, every composed opening is the page's h1 |

### The layout benchmark, rerun

18 of 18 checks passed. Decisions hold in 60 of 60 directions, uneven among them.

While this was being built, it found a real fault: the plan was evening out splits the designer had asked to be uneven (39 of 60 held). A decided layout now counts as the plan's move.

### The interface, and the other benchmarks

- **The interface run** (`ui-qa.mjs`) passed 59 of 59 checks against a production build (`next start`), at five widths. New in it:
  - a design system attached from its files, its colours, faces (one drawn with a stand-in, said) and rule shown;
  - every direction's plan band naming one bold move and the subject's detail, with the system's accent and ground among its colours;
  - the generated booking drawn in the system's own accent.
- **The booking benchmark** passed 62 of 62. **The overhaul benchmark** passed 52 of 52.

### Tests

- 602 unit checks, including:
  - tells;
  - plans;
  - decided moves;
  - design-system parsing in every format;
  - GitHub import against a stubbed fetch;
  - layout pieces.
- All 382 suites of the repository's test run.

## Limits

- **No live model call was made.** The model's part (a subject detail and a move in the art direction, compose sections in a generated design) is parsed and validated against the strict fake only. How often a real model writes good compose sections is untested; whatever it writes, code holds it to its shape.
- **GitHub import is untested against live GitHub.** It was tested with a stubbed fetch: a missing repository, GitHub's rate limit, vendored and oversized files skipped, a file larger than its listing said, and every request made with redirects refused. Private repositories are not supported.
- **Faces are stand-ins.** A system's own face is drawn with the nearest face SocriaUX serves unless it is one of them, and the brief says which. Brand fonts are not uploaded.
- **Tells are heuristics.** They are measured on colours, faces, corners and the look, and on the rendered page's counts. No picture is judged by eye, and a look not on the list is not caught.
- **The headline set huge is the most common move** (79 of 180). Pages without pictures have fewer moves to choose from.
- **One brief in 20 projects fell from 42 to 40 distinct structures**, because a split that is not the move is kept from being sharply uneven. The bar is 40 ([SOCRIAUX-LAYOUT.md](SOCRIAUX-LAYOUT.md)).
- **Booking screens are not composed from pieces.** The booking stays the trusted component, with its own layouts and settings.

## Running it

```bash
node -e "import('./test/helpers/build.mjs').then((m) => m.buildAll())"
```

```bash
UXV0_OUT=/tmp/craft node test/browser/ux-v0/craft-bench.mjs
```
