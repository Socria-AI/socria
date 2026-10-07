# The canvas: moving around a map, and moving the cards on it

This came from outside feedback on Logos 3. Someone used it to work through a linear algebra question. Three things came back:

1. **Typing.** Expanding the conversation sometimes stopped them typing until they folded it away again.
2. **Moving around.** Getting around the map felt like scrolling a web page, not dragging a plane.
3. **Clumping.** Cards piled up, and there was no way to move one.

## Three hands, three things

| Gesture | Changes | Lives in | Shared |
|---|---|---|---|
| Drag the empty canvas, wheel, pinch | The viewport (camera) | `lib/canvas.ts`, a camera per lens in `lib/canvas-store.ts` | Never: each viewer has their own |
| Drag a card, or Alt+arrow | The visual layout (pins) | `lib/canvas-store.ts`, in localStorage `socria.canvas.v1:<session>` | Not yet. It is a separate document, so a room could sync it beside the map |
| Edit a card or a relation | The canonical model | `onEdit` → `lib/map-edit.ts`, then the session | Yes |

None of these reaches into another. Two guarantees follow:

- **Layout stays out of the map.** A drag never calls `onEdit`, never writes to the map, and never reaches a model. The map type has no coordinates.
- **Viewport stays out of shared state.** No viewer's camera is ever written to the map or to anything a collaborator receives.

## Root causes

### Composer (P0)

**Disabled while replying.**
- `disabled={busy}` was set on the textarea, so it refused focus and the caret while a reply streamed.
- A person reading the expanded conversation during a reply could not type. Folding it away seemed to help only because the reply had finished by then.
- **Fix:** the textarea is never disabled. Only sending waits, which `canSend` already enforced. The placeholder says "Keep writing — you can send once Socria has replied".

**The page jumped.**
- `bottomRef.scrollIntoView()` ran on every streamed token.
- `scrollIntoView` scrolls every ancestor, including `overflow: hidden` ones, so the whole workspace jumped.
- **Fix:** only the thread's own `scrollTop` changes, and only for someone already at the end of the thread.

**The composer could be pushed off-screen.**
- The dock was `flex: 0 0 auto` and its thread was 52vh tall.
- On a short screen the dock could take the whole stage and push the composer out.
- **Fix:**
  - The dock now shrinks: the thread and a synthesis shrink and scroll within themselves.
  - The composer, the tools and the row above them never shrink.
  - The stage keeps a floor of `min(26vh, 220px)`, in the narrow layout too.

### Navigation (P1)

**It scrolled like a page.**
- The map was a scroll container (`overflow: auto`) with a sizer and a scaled surface.
- **Fix:** it is now a canvas. The panel is `overflow: hidden`, and one world layer is moved by a single transform (`translate(x, y) scale(k)`) that is written to the DOM, not to React state.

### Clumping (P1)

There were four causes:

- **The graph clamp.** The simulation clamped every card inside the panel after separating them. At the edges, cards were pushed straight back into each other. The clamp is gone, and the camera follows the map instead.
- **One assumed card size.** Separation assumed every card was the same size. It now uses each card's measured size.
- **Squeezed laid-out lenses.** Structure and Evidence shrank their spacing to fit the panel's width. At 72 objects, cards overlapped into one smear.
  - Levels now wrap.
  - Spacing never drops below a card's width.
  - Evidence columns are as wide as their evidence.
- **A wrong height estimate.** `cardH` said every card was 42 or 58px tall. Real cards are 56, 75 or 94px. Every laid-out lens trusted the estimate and stacked tall cards into each other.

## Canvas interactions

**Mouse and trackpad**
- Drag empty paper to pan. Pressing the middle button pans from anywhere.
- A mouse wheel zooms around the pointer.
- A two-finger trackpad swipe pans.
- A trackpad pinch, which the browser sends as `ctrlKey`, zooms finely around the pointer.
- Shift with the wheel pans sideways.

**Touch**
- One finger pans.
- Two fingers pinch and pan at once. The camera is computed from the start of the gesture, so it cannot drift.
- Lifting one finger carries on as a pan.
- A tap opens a card.
- A finger can drag a card.

**Controls**
- `−`, `100%`, `+` and Fit. Fit shows all of the map.
- When some of the map is out of view, the Fit button shows a small dot.

**Keyboard**
- The canvas is focusable: arrows pan, `+` and `−` zoom, and `0` fits.
- On a card, Alt+arrow moves it.
- Escape closes the menu, then clears the focus.
- Tabbing to a card off-screen brings it into view.

**Following the map**
- Until the person moves the camera, it follows the map as it grows, with a legibility floor of 45% on the graph and 60% on laid-out lenses.
- After they move it, nothing re-centres it.
- Pressing Fit hands control back to following.
- The camera can never lose the map: some of it always stays on screen.

**Embedded maps.** Maps inside scrolling pages (the demo, the showcase, docs) are marked `embedded`. There, the wheel and a vertical swipe stay with the page, and only a pinch zooms the map.

## Moving a card

**During the drag**
- It works in the graph lens and in every laid-out lens: structure, flow, timeline, evidence, tensions and solve.
- Past a small threshold (4px for a mouse, 8px for touch) a press becomes a drag. A drag is never also a click.
- While a card is in the hand, the graph holds still.
- The lines follow the card every frame.
- In laid-out lenses, each connector carries `from` and `to`, so a moved card's lines are re-routed card edge to card edge.
- Escape, losing the window, or a cancelled pointer puts the card back.

**After the drop**
- The card is pinned where it was dropped, in that lens.
- No layout pass, chat turn or refresh moves it.
- In the graph, the cards that were not placed by hand make room around it. A placed card never moves for another.
- **Return to its place** in the card's menu hands it back to the layout. It is shown only on a placed card.

## Persistence

| What | Survives | Where |
|---|---|---|
| Placed cards | Refresh, chat turns, lens switches, Reset view | Per session, per lens, in localStorage |
| The graph's resting positions | Refresh. The same map opens looking the same | The same place, as `settled` |
| Camera | Refresh, unless it would now show only blank paper | The same place, per lens, with `moved` |

**Decided:** the camera is restored, as in any canvas tool. It is checked first, so a remembered view that no longer shows the map falls back to a fit. Reset view forgets cameras and keeps placed cards, because placed cards are the person's work.

**Not done:** layout does not go to the server. A different device sees the auto layout.

## Testing

**`test/logos3-canvas.test.mjs`** (104 checks) covers:
- the camera arithmetic: zoom under the pointer, pinch without drift, wheel intent, fit, keep-in-view, slop, re-routing;
- the layout store: pin and unpin, sanitising, bounded size, blocked storage, holding no content;
- 135 layouts (every fixture × every lens × widths 390, 800 and 1280) with no overlaps;
- the composer, thread and dock contracts;
- the wiring:
  - no React state per pointer move;
  - no clamp;
  - deterministic seeding;
  - the graph loop never paints over a laid-out lens;
  - embedded maps.

**In Chromium**, with the dev server and stubbed APIs:
- **A (composer):** laptop 1280×720, short 1280×600 and phone 390×844. Each covers expand, type, send, type during a reply, fold, unfold and type, and focus kept after sending.
- **Linear algebra session:**
  - pan by exactly the drag, with no menu and no text selected;
  - wheel zoom around the pointer, and Fit;
  - drag a card: it is lifted, dropped exactly where it was let go, no click fires and it does not drift;
  - a click still opens a card, and Return to its place is offered;
  - a chat turn adds a node while the placed card stays;
  - arrow keys and Alt+arrow;
  - refresh keeps it;
  - a laid-out lens re-routes the moved card's lines.
- **B (large graph):** 2, 5, 10, 25, 50 and 100 cards, with no overlaps at rest. A drag-pan across 100 cards, at 61fps idle.
- **Touch:** one-finger pan, two-finger pinch, tap opens a card, finger drag of a card with no menu.
- **C, cross-domain:** onboarding, launch, decision, argument, research, model, 72 objects and a contradictory map. For each, every canvas lens:
  - starts in view;
  - moves a card;
  - shows no overlaps;
  - keeps a graph-placed card through a new turn and a refresh;
  - keeps its positions out of the session.

## Remaining limits

- Layout is per browser. A collaborator, or the same person on another device, sees the auto layout.
- Dragging a card does not edit relations. Dropping a card onto another does nothing, by design.
- There is no multi-select drag, no snapping and no rubber-band selection. Logos is not a whiteboard.
- In laid-out lenses, a placed card keeps its place while the lens re-flows the others, so a placed card can end up near a re-flowed one. The graph lens separates them; laid-out lenses do not.
- The plot, the Board and Compare draw themselves to fit, and are not canvases.
