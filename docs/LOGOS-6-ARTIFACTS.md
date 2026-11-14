# Logos 6 artifacts: changed, not remade

This document covers the artifact redesign of November 2026: mind maps, the editor, one identity across the conversation and Artifacts, changes made in place (by the person, by plain words, by Socria), and the visual checks every artifact passes before it is shown.

It extends `docs/VISUAL-EXPLANATIONS.md` (what is drawn, and when) and `docs/LOGOS-6.md` (the rest of Logos 6). Nothing here is behind a switch: it is on wherever Logos 5 is.

---

## 1. The pipeline

An artifact goes through these steps, each in one place:

1. **What the turn needs.** The planner (`lib/runtime/presentation.ts`) reads the turn and offers forms. It never forces a picture: prose stays the answer when a picture would not explain more.
2. **What it is allowed to be.** The validator (`lib/inline-ui.ts` `sanitizeInlineSpec`) is the schema. Anything it refuses is never drawn.
3. **What protects the person.** The gate (`checkInlineSpec`) applies the answer guard, keeps figures to sources, and allows one live thing per reply.
4. **Whether it will read.** The QA pass (`lib/artifact-qa.ts`, below) lays it out at the widths it will be seen at, puts right what can be put right, and reports the rest.
5. **Drawing.** Each kind has its own renderer (`components/inline/InlineUI.tsx`).
6. **Something to work with.** Interacting with it is not editing it; Keep, Edit and Socria's changes make it persist.

---

## 2. Mind maps

A mind map is a diagram with `"view": "mind"` (`lib/inline-ui.ts`):

- **Shape.** One centre. The plain `[from, to]` edges form a tree, four levels deep at most, so every part except the centre has exactly one parent.
- **Links across branches.** Up to 8 typed links, `[from, to, kind]`. The kinds are `causes`, `leads`, `needs` and `relates`. Each is drawn in its own style and named in a legend.
- **Model and layout are separate.** The model is the spec. `mindLayout` (`lib/inline-diagram.ts`) computes positions from it and is deterministic: the same map, width and folds always give the same picture.
- **Layout.** Two sides on a wide screen, one side on a narrow one.
  - It reorganises rather than shrinks. When two sides would not fit, it tries one side. When neither fits, it scrolls inside its own box at full size and never widens the column it sits in.
  - Labels wrap to two lines with words kept whole. A part's box is sized for its own type (the centre is larger and bold).
  - On a phone the boxes are narrower so small maps fit.
- **What a person can do with it in the conversation:**
  - search (once a map has more than eight parts);
  - fold and unfold any part with parts beneath it; large maps start folded below their first levels;
  - select a part to highlight its branch and open its panel: what it is part of, what it holds, and its links;
  - all of it by keyboard: every part and fold is a button with a spoken label.
- **Restructuring.** "Edit the map" puts it on the Logic Map, where its branches stay part-of and its links keep their kinds (`lib/logos5/drawing.ts`). Edit (section 4) changes it in place. Socria can restructure it (section 6).

Explicit requests such as "make a mind map of X" still go to the Logic Map, as before. Inline mind maps answer "how do X fit together", "the big picture" and similar.

---

## 3. One identity

Keep files an element in Artifacts as a kept display (`lib/objects/display-kept.ts`): one object with versions, provenance, undo and redo, saved with the line of thinking.

Once kept, the conversation draws **the kept artifact as it now stands**, not the reply's original (`InlineHost.resolve`):

- A change made in Artifacts, in the editor or by Socria shows where the element was first drawn.
- What a person does with it there (a slider moved) is done to the artifact, through the `state` op.
- The element notes how often it has changed since it was kept.
- If what was kept is deleted, the reply's own element is drawn again.

Using an element is a step that Undo takes back, but it is not a version. Consecutive uses by the same person merge into one step (`OpDef.coalesce`), so scrubbing a slider thirty times never pushes real changes out of the history.

---

## 4. The editor

Every keepable element has **Edit** beside Keep. Edit is the only way into the editor; moving, opening and choosing are using the element.

Edit keeps the element if it is not kept yet, then opens it in Artifacts with its editor open (`components/display/KeptFigure.tsx`):

- **Live preview.** The artifact is shown large, with the controls for its kind beside it, in `components/display/SpecEditor.tsx`. The controls go below it wherever the editor has less than 760 px, such as a panel beside the board, a split or a phone. The controls are:
  - graph: equations, window, sliders, points, shading and rectangles, marked features;
  - force diagram: forces and their sliders;
  - step-through: what it holds and each step;
  - simulation: x(t), y(t), time range and sliders;
  - diagram and mind map: how it is shown, each part with where it hangs, and links with their kinds;
  - sequence and overview: items;
  - working: steps;
  - equation: terms;
  - pros and cons: each side.

  A kind with no controls of its own says that it is changed by asking. There are no fake fields.
- **What holds.** Every change is run through the validator. The preview always shows the last version that holds. A field that does not hold yet (a half-typed formula, or a link to a part that is not there) says so in a line. It never takes the curve out of the picture: `droppedBy` in `lib/artifact-edit.ts` catches what the validator would quietly leave out. What was typed stays as typed.
- **Autosave.** A change that holds is saved after 0.9 seconds as one step that says what changed. The step carries only what changed (op `edit`, from `editsBetween`); the whole version (op `spec`) is sent only when that is shorter, because a step keeps at most 6000 characters a value.
- **Undo and redo.** The shell's ⌘Z and ⇧⌘Z, which are seeks, so nothing is erased.
- **Versions.** Each change, who made it and when. Choosing one shows it. Changing an earlier version replaces the later ones, and the panel says so.
- **Duplicate.** Copies the version showing as an artifact of its own (op `branch`).
- **Export.** Data (JSON), picture (SVG with its styles written in), or image (PNG at twice the size).
- **Ask.** Words the artifact can read are applied at once, such as "add the curve y = 2 + x called supply", "x from -5 to 5" or "add Costs under Operations". Anything else goes to Socria as a turn about this artifact by name.

The editor's controls only propose. Every change is a step of the object, so it saves, undoes and syncs like any other.

---

## 5. Changes in place: the edit engine

Every change, from the editor, the person's words or Socria, comes down to edits at paths inside the artifact's spec (`lib/artifact-edit.ts`):

- **The operations.** `add`, `replace` and `remove`, at paths of keys and list positions (`/nodes/3/label`, `/curves/-`).
- **Applied all or none.** The edits are applied to a copy and the result is validated whole. They are refused when:
  - the result would not be valid;
  - the type would change;
  - the validator would drop something that was added;
  - nothing would change.
- **Paths are plain.** No `__proto__`, `prototype` or `constructor`, and `/type` is never written.
- **What changed is said by the code.** `specChanges` and `changeSaid` produce, for example, “added “Memory cells” under “Adaptive immunity””. The model never writes this description.

**Plain words** (`readEdit`) are read only when they plainly are an edit. A typed message is heard against a kept element only while that element is in hand, meaning open in Artifacts (`readOpScope: 'in-hand'`), because phrases like "call it a day" or "remove the …" are also said about other things.

---

## 6. Socria changes the artifact in place

`lib/artifact-focus.ts` handles the cases where someone says "Add a branch for memory cells", "make the tax 2" or "show it as a tree":

1. **Is it a change?** `asksToChange` looks for an edit verb in the imperative. A question about the artifact is not a change, and nor are idioms such as "make sense of this" or "show me how".
2. **Which artifact?** `editTargetOf` picks, in this order:
   - the kept artifact open in Artifacts (the client sends `inHand`);
   - otherwise, the last keepable element in Socria's previous reply, as what it was kept as if it was kept.

   It never looks further back.
3. **What the model is told.** `editFocusBlock` gives the artifact's JSON and reference, how to write the change, each kind's fields, and that nothing else changes and no new copy is drawn.
4. **The gate.** `gateEditBlock`, in the route's stream gate, checks the model's edit block whole against that artifact:
   - one that holds goes out in canonical form, with what it changes said by the code;
   - one that would not hold becomes a sentence saying it was not made;
   - one nobody asked for, one naming another artifact, and a second one in the same reply become nothing.
5. **Landing it.** `landEdit` runs on the client when the reply lands. It applies the change as Socria's step.
   - A reply's element that was not kept yet is kept first and linked to where it was drawn.
   - If the change no longer holds, because the artifact moved on in the meantime, nothing is made and nothing is kept.
   - Each block is applied once: the step carries the block's key.
6. **The edit card.** `InlineEdit` shows what changed and the artifact as it now stands (the same one), with **Open in Artifacts** and **Undo this change** while it is the latest step. It says when the change was undone, changed again since, or not made.

In copied text and in the history the model reads back, an edit block is a sentence ("Changed “…” in place: …"), never JSON.

---

## 7. Visual QA

There are two layers.

### Before display

`lib/artifact-qa.ts` `qaInline` is passed to the gate as `InlineContext.qa`. It lays each element out at 1100, 720, 420 and 320 px using the same layout code that draws it, and checks for:

- **overlap**: two parts drawn on top of each other;
- **bounds**: a part drawn outside its figure;
- **collision**: a link across a mind map passing through a part it does not join;
- **clipped-label**: a label cut to two lines, which is still whole in the part's panel and text;
- **window**: a graph whose window shows none of a curve;
- **crowded**: a diagram too narrow for its boxes at a width, so it is drawn as its list there.

It puts right what does not change what the element says. A graph's height is refitted to its curves and says so. Everything else is reported. `qaFaults` names the findings a person should never meet.

### In a real browser

`scripts/verify-artifacts.mjs` (`npm run verify:artifacts`) bundles `scripts/artifact-gallery.tsx`, which contains every kind of element drawn by the real components with the app's stylesheets. It opens the gallery in Chromium at 1280 and 390 px and checks:

- **Overflow.** The page never scrolls sideways, and a block overflows only inside a box made to scroll.
- **Labels.** No two labels in a figure overlap, none is cut off by its figure, and a label written in a box stays inside it.
- **Size.** No type under 11 px, measured at the size it is drawn, so a figure scaled down to fit cannot pass.
- **Contrast.** 4.5:1 against what is behind the text: the box it is written in, or the ground (3:1 for large type).
- **Interactions.** A fold opens by keyboard, a part opens its panel by keyboard and by pointer, search finds and counts, and a slider moved by keyboard changes what the graph reads.

It writes a PNG of each block at each width.

### What these checks have already caught and put right

- A two-sided mind map whose wider side ran off the figure.
- Fold counts drawn past the map's edge.
- A large map drawn wider than its column and then scaled down to about 7 px type. It now reorganises (one side) or scrolls at full size.
- Wide maps widening a phone's column. The scroll box now has `contain: inline-size`.
- Centre labels wider than their box, because the box was sized for smaller type.
- Labels at 10.5 px. All inline labels are now at least 11 px, and exponents are at least 11 px.
- Links between two stacked parts drawn as stubs. They now go round the column's outer side.
- The editor beside the board squeezing the element to about 70 px beside its controls. Its columns now follow the room it has (a container query); under 760 px the controls go below.
- The shared display labels (the kind, the provenance line, column heads) at 10.5 px. They are now 11 px too.

---

## 8. Backward compatibility

- **Old kept elements** open as before. Their history is replayed with the new ops available, and they gain versions, Edit and Export.
- **Old replies** draw exactly as before. Edit blocks are new; an old client would show nothing for them.
- **Kept elements** keep up to 30 versions, up from 8.
- **Every other kind's** `readOp` is unchanged. Only the kept kind hears words in hand.
- **The route.** Its edit context is added only on a change asked for, with an artifact to change. The QA hook is passed only by the Logos route; any other caller of `gateInlineBlock` is unchanged.

---

## 9. Tests

- `test/artifacts-l6.test.mjs` covers:
  - the edit engine and plain words;
  - the kept element's history;
  - mind maps: validation, folds, no overlap at five widths, rendering, search, selection and panel;
  - the editor's controls by kind;
  - in-hand words;
  - `droppedBy`.
- `test/artifact-editor.test.mjs` uses the editor in jsdom: Edit, typing, autosave, half-written formulas, words, Socria, versions, a version shown, Redo, Duplicate, Export and read-only.
- `test/artifact-focus.test.mjs` covers change intent, the target, the focus block, the gate, landing, one identity, the edit card, merged uses, and mind maps on the Logic Map.
- `test/artifact-focus-e2e.test.mjs` runs the real reply route with a scripted model: the model is told the artifact; canonical, refused and unasked edits; in hand.
- `test/artifact-qa.test.mjs` covers mind maps of every shape at four widths, collisions, crowded diagrams, graph windows and the gate's repair.
- `scripts/verify-artifacts.mjs` runs the rendered checks above. It is not part of `npm test` because it needs Chromium.

---

## 10. Limits

- **No live model was run.** Every Socria edit was tested with a scripted model. How often a real model writes a good edit block is unmeasured.
- **The five-second comprehension standard is a design target, not a measurement.** No study has been run.
- **Charts, comparisons and decisions open their own larger displays when kept.** Socria cannot change them in place through edit blocks.
- **An edit is applied only in the line of thinking on screen.** It is applied when the reply lands while that line is open. A reply that lands while another line is open is not applied later.
- **The harness uses system fonts.** The app's own fonts can differ slightly in width. The layout estimates text width rather than measuring it, and the rendered check is what catches a label that runs past its box.
- **Phone scrolling.** A mind map wider than a phone scrolls inside its box. Folding keeps the start small, but a fully opened large map still scrolls.
