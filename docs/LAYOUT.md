# Layout reliability

Logos 6, November 2026. What keeps the app's parts from running over one another at every size. This covers what an
audit of the rendered app found, what was changed, how it is checked, and what is left.

The checks on the code are in `test/layout-reliability.test.mjs`. The rendered audit is described in section 4.

## 1. The rules

These are the rules the fixes below follow. New work should follow them too.

1. **Measure what you lay out.**
   - A layout that places content works from the size the content is drawn at, never from an assumed size.
   - The Mind Map measures every card before the page is painted, and again once the fonts load.
   - The space measures the chat box (`--ls-foot`, `L5Space.tsx`). Whatever must stop above the box reads that measurement: the Mind Map's frame, and the board's bottom padding.
2. **A frame with a definite height lets its content shrink.**
   - In a flex chain whose height comes from the screen, nothing inside sets a floor that pushes past the frame.
   - Use `min-height: 0`, not a fixed minimum.
   - A floor such as the canvas body's 360px belongs only where the container grows with its content.
3. **What floats over content has a ground of its own.**
   - The chat box floats over the board.
   - The lines over it (the objective, a note, the Enter hint) are read on the box's own paper ground, not across a card scrolled beneath them.
   - That ground is sized by the box itself, not by a fixed fade.
4. **A popover opens from what opened it, sized by the room it has.**
   - The objective's panel is anchored to its line, and is as tall as the room between the line and the top of its view, measured when it opens.
   - The views menu is drawn into the app's root and kept inside the window (`NavMover.tsx`, `menuPlace`).
   - Nothing is pinned to a guessed position on the screen.
5. **A row that can overflow scrolls from its start.**
   - A centred flex row wider than its box spills off both sides.
   - The part past the left edge cannot be scrolled to.
   - On a phone, a strip of tabs is start-aligned and scrolls: the space's views, and the conversation's tabs.
6. **Rows that can be too long for a phone wrap rather than squeeze.**
   - When the items in a row are squeezed below their content, they overlap.
   - The chat box's foot and the Enter hint wrap.
7. **Phones get the visible viewport.**
   - An overlay that should fit the screen uses `dvh`.
   - A panel in the page uses `svh`, which stays steady while the browser bar comes and goes, so nothing shifts as you scroll.
   - The `vh` declaration stays as the fallback line before it.
8. **Stacking is a short scale, and this pass raised nothing on it.** Inside the space, the order is:

   | What | z-index |
   |---|---|
   | Cards | 3 or below |
   | The bottom fade | 4 |
   | The chat box | 5 |
   | The chat box's ground | -1, inside the box's own stacking context (the box is positioned by a transform) |
   | A popover inside the box | 30, inside the box's context |
   | Floating menus (drawn into the app's root) | 1000 |
   | Sheets and dialogs | their own layers |

   Every fix below came from position, size or overflow, not from a larger z-index.
9. **No layout shift, and motion as before.**
   - Measurement happens before paint (`useLayoutEffect`). A late font re-measures once.
   - The Mind Map fits itself again after measuring only while the view is still the fit's own. Once the person has moved it, it stays.
   - Nothing new animates. Smooth scrolling still gives way to reduced motion.

## 2. What the audit found, and what became of it

| # | Where | What was wrong | Root cause | Now |
|---|---|---|---|---|
| 1 | Mind Map, Ideas and Logic | A card with a long title ran over the card below it. | Rows and layers were stepped by a fixed card height (64px), but cards grow with their words. | Cards are measured and every row or layer is stepped by its tallest card (`ideasPlaces` and `logicPlaces` take `heightOf`). Titles stop at four lines, the subtitle at one. Centres, bounds, group hulls and arrowheads use the drawn heights. |
| 2 | Mind Map, Logic | A line's label sat under a tall card ("sits inside" hidden under a goal). | Labels were placed at the middle of the two cards' centres, which lies inside the taller card. | `edgeEnds` (`graph.ts`): the label sits in the middle of the part of the line seen between the cards, and the arrow ends at the target card's edge as drawn. |
| 3 | Mind Map, short screens (720px tall) | The map ran on under the chat box. Its last cards sat under the objective line. | The canvas body's `min-height: 360px` was more than the frame the space gives it, so it overflowed its frame. | Inside the space, the body gives way (`.ls-mind .tc-body { min-height: 0 }`). |
| 4 | Mind Map, first view | The map was fitted before its cards were measured, so its last row was out of view. | The fit used the assumed heights. | It is fitted again once the cards are measured, while the view is still untouched. |
| 5 | Everything | The objective line, and anything else over the chat box, was drawn across the cards beneath it ("12 ideas · 1 decision" through a quiz question). | The fade at the foot of the board is a fixed 150px. The chat box grew taller than that when the objective line came. | The box has a ground of its own, its own size, soft at the edges (`.ls-chat::before`). |
| 6 | Objective panel, phones and tablets | The panel covered the very line that opened it, and the top of the chat box. | It was `position: fixed` 140px from the foot of the screen, a guess at the box's height. | It opens up from its line at every width, as tall as the room above the line, measured on opening and on resize. |
| 7 | Chat box foot, small phones (360px) | The length dial shrank to its chevron under "Add as idea", and "Add as idea" ran past the box's edge. | Three items in a row that could not wrap, squeezed below their content. | The row wraps. "Add as idea" is spaced by the row's gap, not by a margin that indented it on a line of its own. |
| 8 | Enter hint, phones | Four lines: the ↵ alone, the sentence, then "Ask Socria instead" alone. | The sentence was sized by its whole length, so it wrapped onto a line of its own. | The words start beside the ↵ and wrap there, so the hint takes three lines on a small phone. |
| 9 | Conversation view, phones and tablets | "← The space" started 52px off the screen and could not be reached, and the last tab was cut off. | A centred row of tabs wider than the screen, which did not scroll. | On a phone the row is start-aligned and scrolls, like the space's own tabs. |
| 10 | Panels on phones | Panels sized `calc(100vh - …)` could run under a phone's browser bar. | `vh` is the largest viewport, the one with the bar hidden. | `dvh` for overlays (the Universal Map's narrow panel, the camera intro, the style sheet). `svh` for panels in the page (the artifact and model panels, Write's side panel, the kept-artifact editor, a full-size plot). |
| 11 | Conversation view's bar, about 1000–1280px wide, views on the left (the default) | The tabs ran over "Search" and its key ("Mind MaSearch Ctrl K"). | The bar does measure when the tabs and the name are too wide for their place, and moves the tabs to the middle. But the measurement was cleared by an effect of its own, which ran after the measuring on the first paint. So the tabs stayed put and overflowed until the window was resized. | The measurement belongs to the place and the name it was taken for (`L5Views.tsx`). A new name is measured afresh, and nothing clears it after. |
| 12 | Mind Map's list of the chat's work, phones | The list ran off the left of the screen. | It was right-aligned to its button, and on a phone the tools row puts the button in the middle. | On a narrow canvas the list opens across the canvas, under its tools. |
| 13 | Conversation view, the column of what was brought and made | A graph's preview showed its legend and the top of its plot, then stopped at a hard edge. | Each preview was drawn at full size and cut to the cell's 220px. | Made things (a graph, a quiz, a drawing) are drawn as the board draws them: whole, at 55%, fading at the foot. Files keep their picture. |

What the audit flagged that was not a fault:
- **Content scrolled under the chat box on a phone.** The board scrolls, and its foot is padded by the box's measured height, so everything can be brought above the box.
- **Popovers covering what is beneath them.** The objective panel and the views menu each have their own ground.
- **The space's tabs on a phone.** They are a scrolling strip, and the last one peeks at the edge.
- **The board's first view on a 1280px screen.** It frames the open reply and what it made, so the column of ideas before it starts partly scrolled off.

## 3. Components changed

| File | Change |
|---|---|
| `lib/logos6/graph.ts` | `CARD_W` and `CARD_H` exported, layouts by drawn height (`HeightOf`), `edgeEnds` |
| `components/logos6/ThinkingCanvas.tsx` | Card measurement, layout by drawn heights, lines and labels from `edgeEnds`, refit after measuring |
| `components/logos6/thinking-canvas.css` | Title clamped to four lines, subtitle to one; the list of the chat's work across a narrow canvas |
| `components/logos5/space.css` | The chat box's ground; the map's body gives way inside the space |
| `components/logos6/ObjectiveLine.tsx`, `objective.css` | The panel anchored to its line and sized by the room above it |
| `components/logos5/revision2.css`, `l5-controls.css`, `components/logos6/logos6.css` | The chat box's foot wraps; the conversation's tabs scroll from their start on a phone |
| `components/logos6/omnibox.css` | The Enter hint wraps beside its ↵ |
| `components/logos5/L5Views.tsx` | The bar's measured need kept for the place and name it was measured for |
| `components/logos5/page.css` | Made things' previews beside the conversation drawn whole and small |
| `components/logos5/universe.css`, `live-guide.css`, `redesign.css`, `components/write/write.css`, `components/display/kept.css`, `display.css`, `app/globals.css` | `dvh` and `svh` beside `vh` |

## 4. How it is checked

**On the code.** `node test/run.mjs layout-reliability` checks:
- no two Mind Map cards meet when laid out by drawn heights, in Ideas and Logic. With the old fixed height they did, and the test shows it;
- rows and layers are stepped by the tallest card;
- with nothing measured yet, the layout is the one it always was;
- labels lie between the cards, on the line, for cards of different heights, at a slant and when cards overlap;
- the CSS rules behind every fix above, so a later edit that undoes one fails.

**Rendered.** The app was built with esbuild, with sign-in stubbed and its server mocked, and driven in Chromium with Playwright. This harness is not part of the repository.
- **Fixture:** a deliberately stressful conversation:
  - a long title;
  - twelve cards with long labels and ten lines;
  - a quiz with long questions;
  - a graph with a long title;
  - an attached document;
  - an objective with milestones;
  - a long reply with lists, an unbroken word and code.
- **States** (22):
  - the home screen and the Everything view;
  - the objective panel;
  - a draft with the Enter hint;
  - the chat box's "+ Add" menu and its length dial;
  - the Mind Map in Ideas, Logic and Structure, with a card open and with the chat's work open;
  - Artifacts, an expanded quiz and Files;
  - the conversation view, and the same with a graph beside it;
  - the views menu, with the views moved to the top and to the right;
  - the Universal Map's introduction and its sessions;
  - search.
- **Sizes** (8):
  - large desktop, 1920×1080;
  - laptop, 1440×900;
  - small laptop, 1280×720;
  - narrow laptop, 1100×760;
  - landscape tablet, 1180×820;
  - iPad Mini;
  - iPhone 13;
  - a 360×640 phone.
- **What it flags,** read in the page:
  - the page scrolling sideways;
  - a control cut off at the screen's edge, told apart from one peeking out of a scrolling strip;
  - a control more than a third hidden by a clipping parent;
  - a control with something else on top at its centre;
  - text clipped with no ellipsis or clamp;
  - two pieces of text drawn over each other with nothing opaque between them.
- **What it skips:** screen-reader-only text, the inside of closed menus, and text an opaque panel covers.
- **Each state starts clean:** stored state is cleared on every load, so a draft or a moved set of views never carries into the next state.
- Every state was also looked at in its screenshot.

Results, counting only the faults (the kinds that are not a peek, and not a popover over what it covers):

| Fault (22 states × 8 sizes = 176) | Before | After |
|---|---|---|
| Text drawn over other text | 56, in 35 states | 0 |
| Controls cut off at the screen's edge (not in a scrolling strip) | 16, in 8 states | 0 |
| Controls hidden by a clipping parent (not in a scrolling strip) | 14, in 8 states | 0 |
| Controls under a fixed layer | 32, in 8 states | 5: the views menu, open, over the rail it belongs to |
| Text clipped with no ellipsis, the page scrolling sideways | 0 | 0 |

"Before" is the code this pass started from (ee83667), audited with the same harness, fixture and states, so the two columns compare like with like.

Controls under the chat box's ground, or under an open menu or panel, are counted apart. Each was looked at: content scrolled beneath the box, which the board's padding lets you bring above it, or a popover over what it covers.

## 5. Limits

- **Lines in Ideas still pass behind cards** when they join cards that are not next to each other. Ideas is a grid ordered so that connected cards sit near each other. It is not a layout that routes lines around cards. Logic, which is about the lines, lays out in layers.
- **A phone with a long draft gives the chat box most of the screen.** The box grows with what is typed, and the Enter hint and the guide's two ways out add lines. Nothing overlaps, but on a 360×640 phone about a third of the screen is left for the board while typing.
- **The rendered audit is a local harness, not a test the suite runs.** It needs a browser and a mocked app. The checks the suite does run are on the layout code and on the CSS rules.
