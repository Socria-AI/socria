# SocriaUX — creative language into design

> You talk to SocriaUX in creative language. It turns that language into design decisions, and the engine carries
> them out. You never have to adapt how you think to what the editor can do.

This document covers the rework of natural-language editing and of concepts in the Graphics editor, and the boards
that use it. It records:

- why broad creative instructions failed;
- the architecture that replaced the old path;
- the vocabulary the plans are written in;
- how the model is used, and what happens when it cannot be reached;
- how concepts became structured and editable;
- what the interface shows;
- how it was verified, including the rendered designs;
- what it does not do.

## The audit — why "make it cloud themed" failed

Before this rework, asking "I want to make it cloud themed" got this answer: *SocriaUX could not read that as a
change it can make without a model.* The cause was the architecture, not the wording of a prompt.

| Where | What was there | Why broad instructions failed |
| --- | --- | --- |
| `lib/ux-v0/graphics/edit.ts` `readGraphicEdit` | A flat list of rules for one object or a predefined edit: bigger, smaller, move, contrast, a colour, a face, an adaptation, a few composition moves | There was no notion of a theme, a quality of the whole, or a decision. Words outside the rules returned `null`. A compound instruction matched its first rule and dropped the rest. |
| `components/ux-v0/graphics/GraphicEditor.tsx` `ask()` | `readGraphicEdit` or nothing | There was no model path for edits at all: no call kind, no route, no schema. When the reader found nothing, the person was told the editor had no model. |
| `components/ux-v0/boards/BoardWorkspace.tsx` `ask()` | `readBoardEdit` or the same message | The same dead end on boards. |
| The document | The design's decisions existed only as node properties | Nothing recorded "this concept's palette, type, forms, ground, depth, mood", so there was nothing to keep, reject on its own, compare, or take from another concept. |
| The engine | Composition constraints, styles and patterns | Nothing could draw a theme's forms (clouds, waves, drops…) as editable shapes, and nothing could carry a palette into an existing design role by role. |

## The architecture

The words become a **plan**, the plan is checked, and the **engine** carries it out:

1. The model (when it can help) or the deterministic **reader** (always) writes a `CreativePlan`.
2. `normalizePlan` holds the plan to its shape.
3. `executePlan` carries it out with engine operations.
4. `refineDoc` checks the artboard that changed.
5. The result is shown as a **preview**, to apply or to discard.

So the model decides *what* should change; the graphics engine performs the change.

| File | What it is |
| --- | --- |
| `lib/ux-v0/graphics/creative/plan.ts` | **The plan.** `intent` (object, global, composition, typography, style, brand, content, redesign, theme, concept), `keep`, `changes` (theme, palette, type, composition, forms, background, depth, mood, content, object, revert, concept), at most one `question`, and `by` (model or reader). `normalizePlan` holds a plan to its shape. |
| `lib/ux-v0/graphics/creative/lexicon.ts` | **The vocabulary.** 16 themes, 25 qualities, 15 palette shifts, the type characters with real pairings, and `tokensOf`, which builds readable tokens from a palette. |
| `lib/ux-v0/graphics/creative/forms.ts` | **Theme forms as editable vector shapes**, placed so they stay off the words. |
| `lib/ux-v0/graphics/creative/decisions.ts` | **A concept's decisions**: the creative record, what restores each decision, and the decisions read from the design and said in words. |
| `lib/ux-v0/graphics/creative/interpret.ts` | **The reader.** It splits words into clauses and reads each one. It knows when its reading is plain (`certain`). |
| `lib/ux-v0/graphics/creative/execute.ts` | **The executor**, decision by decision, recording what restores each decision. |
| `lib/ux-v0/graphics/creative/concepts.ts` | **Concepts**: keep, revisit, let go, and the references a plan can take decisions from. |
| `lib/ux-v0/graphics/creative/model.ts` | **What the model is told**: the compact reading of the design, the instructions, and the strict JSON schema. |
| `app/api/ux-v0/graphic-edit/route.ts` | **The model stage** `creative-edit`. |
| `components/ux-v0/graphics/creativePlanner.ts` | **The planner**: the reader always, the model when it can help, and the fallback. |
| `components/ux-v0/graphics/ConceptPanel.tsx` | **The Concept tab and the side-by-side comparison.** |

### `normalizePlan`: what a plan may not carry

It drops:

- an unknown decision, theme, quality, form or shift;
- a colour that is not `#rrggbb`;
- a font that is not on the list;
- a number out of bounds (it is clamped);
- **content text that does not appear in the person's words**;
- any change to a decision the same plan keeps;
- a question with fewer than two answers, and any answers beyond four.

### Themes and qualities

**The 16 themes:** cloud, ocean, forest, space, sun, mountain, city, flowers, autumn, fire, winter, neon, tech, paper,
geometric and rain. Each theme defines:

- its forms;
- light and dark palettes;
- a sky gradient;
- a type character;
- its abstraction, depth, count and scale.

**The 25 qualities:** futuristic, editorial, sophisticated, premium, expressive, depth, alive, dramatic, original,
minimal, playful, calm, warm, cool, dark, light, colourful, muted, mono, retro, raw, modern, corporate, organic and
classic. Each quality maps to:

- palette shifts;
- a type character;
- changes to the forms;
- depth;
- a ground.

"Make it pop" is the expressive quality, so it acts. "Too generic" is original, "too plain" is expressive and "too
busy" is minimal. "Less X" and "too X" ask for the opposite quality.

### Theme forms

Forms are generated as **editable shape nodes**, not pictures.

**Clouds** are cumulus outlines made of overlapping lobes cut by a soft base, with an abstraction dial:

| Abstraction | What is drawn |
| --- | --- |
| Below 35: realistic | Five or more lobes, with a gradient |
| 35–72: stylised | Three or four lobes on a flat base |
| From 72: abstract | A pill with circles |
| From 90 | Overlapping discs |

**Other forms:** organic masses, waves, leaves, orbs, sparkles, lines, a glowing perspective grid, mountains, blocks,
rings, petals, flames, snow, drops and a sun.

**Placement:**

- Forms are placed in zones (sky, foot, edge, field) and kept away from the words, the logo, pictures and data.
- On a crowded layout a form shrinks. When it still cannot stay clear of the words, it is left out and the person is
  told why — a form never sits beneath the words.

### What the executor preserves

**Words**

- The words are never rewritten. Content changes only when the text is in the person's own words.

**The logo**

- The logo keeps its colours unless their contrast with the new ground falls below 2.4, and that is said.
- Its lettering is never retyped.

**Kept decisions and locks**

- Locked nodes are skipped.
- Locked colours or typefaces are said, never overridden.
- "Keep X" removes every change to X, even one implied by a theme or a quality.

**Composition**

- A quality keeps the composition; only "original" re-conceives it.

**Type**

- A theme changes the type only when the identity or the brand is asked to change.

**Forms**

- A quality does not replace forms that are already there; only "organic", which is a kind of form, does.

**Colour**

- A palette is carried role by role. Words map to the ink, a button's label to the accent's own text, and shapes to the
  ground or the accent. A dark logo is therefore never mistaken for a button label.
- A **graded ground is regraded**: each stop is read as the old ground leaning toward the accent, a supporting tone,
  the ink, white or black. It is drawn as the new ground leaning the same way, so a sky stays a sky in the new
  colours.
- The forms are redrawn in the new colours.

**The ground**

- The ground that shows is the one that changes: the topmost opaque full-bleed background shape. A composition can
  stack a "Paper" under a "Ground".

**After a new composition**

- The ground and forms decided since are put back on the new layout.

**Checking**

- Each change is checked and repaired by `refineDoc` (contrast, overflow, the safe margin), **on its own artboard
  only**: other artboards were not asked to change.

## The model, and when it cannot be reached

**When the model is asked**

- The reader reads every change at once, in the browser.
- When the reading is **plain** — one clear instruction, every clause read, nothing to ask, nothing about one object —
  that plan is used, because a model would write the same one.
- Otherwise the model reads the words:
  - several instructions in one breath;
  - words the reader could not place, such as "a rainy afternoon in Paris, a little wistful";
  - a question the reader would have to ask.

**What the route does**

- `/api/ux-v0/graphic-edit` runs through `stage-server.ts` like every other stage: sign-in, the rate limit, daily caps,
  budgets, one operation per action, the deadline, cancel and the call log.
- Stage `creative-edit` runs on the **economy** tier, with at most 1,400 output tokens.
- The answer is a **strict JSON schema** (`socriaux_creative_edit`): every object is closed, every field is required and
  nullable, and every list is bounded.

**What the model is told** — the compact reading from `readingOf`:

- the artboard;
- each object's role, kind, words (shortened), face, colour and position as percentages;
- the palette and type;
- each decision in words and where it came from;
- what is locked;
- the concepts kept;
- the last turns.

It is never sent pictures, paths or the document. The reading is held to its size again on the server
(`normalizeReading`).

**When it cannot be reached** (signed out, not configured, busy, over a limit, connection lost)

- The reader's plan carries on.
- The model is left alone for 2 minutes, or 30 minutes when it cannot answer at all.
- **The person is never told about models.** They hear what will change. When nothing in their words can be acted on,
  they get one question whose answers work.

**Cost**

- Most creative changes are read plainly in the browser and cost nothing.
- A change the model reads is one economy-tier call, logged and priced like every other stage.

## Concepts you work with

A concept is a starting point to work from, not a proposal to accept or reject.

**Its decisions are kept with it**

- Each **artboard** carries its own creative record, `Artboard.creative`, so each artboard is a concept.
- The record holds the theme, forms, ground, depth, qualities and type character.
- It also holds where each decision came from (the engine, you, or another concept) and up to three restores per
  decision.
- A copy of an artboard keeps its decisions, pointing at its own copies of the forms.

**Each decision can be changed or rejected on its own**

- "Undo the typography change", "I don't like the new colours", or *Put back* on a decision restores only that one.

**Concepts can be kept and revisited**

- `GraphicDoc.concepts` keeps up to eight concepts, each an artboard as it was, with its palette and type.
- Going back to one puts it on the artboard. Whatever was there is kept first, so nothing is lost.

**Concepts can be combined**

- "The typography of concept 2" takes one decision from another concept and keeps everything else.
- The same is offered at a tap in the Concept tab and in the side-by-side view.

**Explore without starting over**

- *Explore a copy* places an editable copy beside the original.
- *Another interpretation* re-conceives the composition and keeps the decisions.
- *New concepts* shows four new compositions.
- *Compare* lays the current artboard, the kept concepts and the other artboards side by side, each drawn with what it
  decided.

## The interface

**The ask bar**

- It reads any creative change, as it always read precise ones.
- While the model reads, it says *Reading the change…*, with *Cancel*.
- A question's answers are shown as buttons, as they would be said; typing an answer works too.
- Every change is previewed, then applied or discarded.
- The ask bar stays open while a preview waits:
  - the next change builds on the preview: the preview is taken, and the new change is previewed on top; undo takes
    each back in turn;
  - "no, …" turns the preview down and makes the new change instead;
  - a short "apply", "yes" or "keep it" applies it. "Keep the typography but change the background" is a new change,
    never read as a yes.
- What one object should do, or one of the editor's own commands — a colour for the selected shape, "adapt it to a
  story", "make the headline bigger" — still goes to the precise reader first whenever the words hold no creative
  decision.

**The Concept tab**

- The concept's idea, art direction and strategies.
- Each of the seven decisions in words (the serif voice), with swatches and a chip saying where it came from: *as
  conceived*, *your call* or *from a concept*.
- A few moves for each decision on its own, such as Warmer, Editorial, More abstract or Graded.
- *Put back* on a decision that has changed.
- The concepts kept, with *Go back to it*, *Its type*, *Its colours*, *Its forms* and *Let go*.
- The composition moves from before.

**Boards**

- A creative change said to the board ("make it cloud themed", "more sophisticated") is planned once.
- It is carried out on each graphic (the selected ones, or all) and previewed on the board.
- A change about one object belongs inside a material, and the person is told so.

**The header badge**

- The badge that said *No model calls · $0* now says *Made in your browser*.
- Its tooltip explains that a change the browser cannot read plainly is read by the model, within the person's budget.

**Where the Studio rail is open**

- Answers arrive as text, numbered.
- The rail waits up to 50 seconds for a reply, since a model reading takes longer than a precise edit.

## Verification

All of it was verified without a real model or the network. The model was always scripted.

**Unit tests** — `test/creative.test.mjs`, 93 checks:

- the reader on every example given in the request (broad, ambiguous, targeted, compound, redesign, concepts);
- `normalizePlan` against what a model might send;
- the strict schema: every object closed and fully required, every list bounded;
- the executor's preservation of the words, the logo, kept decisions and locks;
- each decision turned down on its own;
- the ground and forms following the palette;
- forms staying off the words, through five changes on a crowded square;
- concepts kept, revisited (with nothing lost), combined, copied, bounded and round-tripped through `normalizeDoc`;
- the compact reading and its server-side bounds.

**Route tests** — `test/ux-v0-route.test.mjs`, with a scripted OpenAI:

- signed out: refused, nothing asked;
- no words or no design: no call;
- a strict-schema plan with an invalid font, a non-colour, invented copy and an unknown quality is cleaned before the
  browser sees it;
- the request carries the instructions, the vocabulary, the words, the reading and the turns, and no pictures;
- a question comes back as a question;
- prose with no plan is never turned into one;
- an upstream failure is a calm error that never mentions models;
- each reading is logged on the `creative-edit` stage, priced.

**Stage tables** — `test/ux-v0.test.mjs` now lists `creative-edit` among the structured stages and in the routing table,
on the economy tier. The whole suite (`node test/run.mjs`) passes: 396 suites.

**Rendered designs** — two designs taken through broad, ambiguous, targeted, compound and redesign instructions:

- a poster: 13 instructions;
- a crowded square social post: 10 instructions.

Each result was rendered to PNG and looked at.

The render inspection found bugs that tests alone had not, all fixed:

- A composition stacks a "Paper" under a "Ground". The executor was regrading the hidden one.
- The `tokens` operation ignored `accent2`, so an old accent survived every palette change (this affected boards'
  system sync too).
- A dark palette left the light sky gradient behind the words, which `refineDoc` then patched with "a ground of its
  own".
- Grey grounds took a hue they never had when cooled or warmed, giving an olive "futuristic".
- Forms were placed over the words on crowded layouts.
- A dark logo was matched to the button-label role and turned near-black on a dark ground.
- "Make it more editorial" and "make it more dramatic" went to the old one-object rules instead of the whole design.
- "I don't like the new colours" was read as a "like".

The browser QA's screenshots found more, also fixed:

- A face the design had not used yet was measured before it arrived, against a stand-in font. Heavier type for
  "more dramatic" then broke mid-word once the real face was drawn. A change that brings a new face now fetches it and
  fits the words again before the preview is shown. Both passes use the same moment, so the forms are the same.
- A colour said with a shape selected, and "adapt it to a story", went to the creative path instead of the precise
  reader.
- A creative instruction starting with "Keep…" was taken as "apply" for a waiting preview.
- While a preview waited, the ask box was replaced by Apply and Discard, which stopped continuous iteration.

**Browser QA** — `test/browser/ux-v0/creative-qa.mjs`, in the production build, with the model route scripted in the
browser.

The production build is made with `NEXT_PUBLIC_SOCRIAUX_V0=on` and placeholder Clerk keys. Placeholder keys of a
development instance make Clerk's middleware redirect a fresh browser to its handshake, so the check sets a placeholder
dev-browser cookie in its own browser context. The visit stays a plain signed-out one.

It covers:

- the cloud theme read plainly, with no model call;
- a colour said with a shape selected, kept as the precise edit of that shape;
- the ask box kept while a preview waits; "no, …" turning a preview down; a new change building on a preview, and undo
  taking it back;
- a model-read instruction, checking what it was sent;
- one question answered at a tap;
- the route refused, with the browser carrying on silently and leaving the model alone;
- unreadable words getting a working question;
- a decision moved alone and put back alone;
- a concept kept, compared and gone back to;
- heavier type fitted to its real face, with nothing left for the checks to fix;
- no page errors.

| Run | Result |
| --- | --- |
| `UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/creative-qa.mjs` | 28 passed, 0 failed |
| `… graphics-qa.mjs` (the existing Graphics scenarios, for regressions) | 58 passed, 0 failed |
| `… boards-qa.mjs` (the existing Boards scenarios; words it cannot read now get one question instead of "could not read that") | 62 passed, 0 failed |
| `node test/run.mjs` | all 396 suites pass |
| `npx tsc --noEmit -p .` and `npx next build` | clean |

The shared browser helper (`env.mjs`) sets the placeholder dev-browser cookie for forwarded runs, so every check works
against a server started with placeholder keys.

## What it does not do

**The real model has not been run on these instructions.**

- No paid inference was used, and this environment's network allows no provider.
- What the model would write is constrained by the schema and validated, but its taste is unmeasured here.
- An evaluation on the real model, like `sol-eval.mjs`, is the next step, and needs approval for its cost.

**The model is consulted only when the reader is not sure.** A plain instruction ("make it more sophisticated") is
read in the browser. This is on purpose, for cost and speed.

**Themes are a catalogue of 16.**

- A world outside it maps to the nearest theme the words name.
- Otherwise it gets a quality reading, or a question.
- The model can only choose among the catalogue's themes, forms and qualities.

**Theme forms are vector shapes, not imagery.** Nothing generates a photograph of clouds; the image provider stays off
by default.

**Putting a decision back is limited.**

- It goes back up to three changes per decision, per artboard.
- A decision put back after a later change to another decision restores its own values. The other decisions keep
  theirs.

**Board-level creative changes apply one plan to every graphic.** They do not yet update the board's Master Design
System; a material changed this way diverges from the system as a local override.
