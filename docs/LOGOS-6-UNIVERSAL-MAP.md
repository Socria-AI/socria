# Logos 6 — the Universal Map, one map at four scales

The Universal Map is where Socria opens: every line of thinking a person has had, drawn by subject. Logos 6
makes it one spatial map at four temporal scales, drawn with level of detail, with a way to find anything on it
and a way back. This note says what changed, how it works, where it lives, and what was measured.

## What changed

- **The Timeline view is gone.** Month and All Time used to switch to a line through time
  (`components/logos5/UniverseTime.tsx`, `lib/logos5/timeline.ts`), with its own scrubber, lanes, week stepper
  and "↩ find it in time" links. Those files, their styles (about 580 lines of `universe.css`), the View menu's
  "in order" note, the Timeline parts of the guide and the What's New demo, and the old Timeline test are
  removed. No data was touched: conversations, timestamps, links, notes, stars and hidden ones are read exactly
  as before. An arrangement saved while the Timeline existed (`mode: 'timeline'`) still reads, as All Time.
- **Today | Week | Month | All Time** are now scales of the same map, not separate views.
- **The map is laid out once**, from every conversation; a scale only says which are lit. Nothing moves when the
  scale changes, and a subject's neighbourhood stays where it was.
- **Level of detail** decides how much is drawn for how far away the map is seen, independently of the scale.
- **Find on your map** (`/` or ⌘K) searches conversations, subjects and ideas. Choosing a result widens the
  scale if needed, flies the camera there, points it out and opens its card. **Back to where you were**
  (Backspace) returns the camera.
- **Performance.** Placement is quicker. A scale change costs a few milliseconds rather than a full layout.
  Panning and zooming were profiled in a browser and the costs found were fixed (measured below).

## The four scales (`lib/logos5/scales.ts`)

| Scale | What is on it |
|---|---|
| Today | conversations with activity on the person's current local calendar day |
| Week | activity in the rolling seven days that end today (today and the six days before) |
| Month | activity in the rolling thirty days that end today |
| All Time | every conversation |

- **Activity** is the last time something happened in a conversation, never earlier than when it was begun
  (`activityOf`). A conversation begun last week and worked on this morning is on Today.
- **The person's own time zone**: windows start at a local midnight and are counted in calendar days, so a change
  of the clocks inside a window neither adds nor takes away a day (tested across the October change in London).
- **Cumulative, always**: Today ⊆ Week ⊆ Month ⊆ All Time. The counts on the selector are the same sets counted.
- **The selected scale is kept** with the person's arrangement, as before.
- **Empty or sparse**: an empty scale says so plainly ("No sessions recorded today…") and offers the narrowest
  wider scale that holds something ("Week · 7 conversations →"). A sparse scale is drawn at its own size. The
  camera fits what is lit, so a quiet Today is never stretched to look like more, and no older conversation is
  pulled in to fill it.

## One layout, four scales (`lib/logos5/bubbles.ts`)

The layout has two stages:

- `bubblePlaces(input)` is expensive and done once from all conversations. It finds where every subject, session
  disc and quick-question dot goes, plus the joins and spokes.
- `bubbleLayout(input, places)` is cheap and done per scale. From what is lit, it works out each subject's
  **region**, the curves between subjects, the memories, the card, the bounds and the place of the + button.

How a scale is drawn:

- **A region** is the circle round what of a subject is lit (`regionOf`): the whole circle when nearly all of it
  is lit, a smaller one round the lit part otherwise. A subject with nothing lit has no region at that scale.
- **Changing scale** fades out what leaves and fades in what arrives. Regions ease to their new size, and the
  camera glides to fit the new set.
- **The placement is cached** in `UniverseBubbles.tsx` (`useMemo` on `placeIn`) and is not invalidated by a scale
  change. Two things used to invalidate it, and both were fixed:
  - "homes" depended on the whole arrangement object, which changes with the scale;
  - opened subjects were let go on a scale change.
- **Nothing is invented.** Every disc and dot is a real conversation, a curve is drawn only when both its ends are
  lit, and an aggregated region counts exactly the conversations lit in it.

## Level of detail (`lib/logos5/mapLod.ts`)

The scale says *what* belongs on the map; the zoom says *how* it is drawn. The two never decide for each other.

| Level | Zoom | Drawn |
|---|---|---|
| far | ≤ 0.34 (back above 0.40) | each subject a soft region. A busy one (9 or more lit) is aggregated: its five largest sessions as pips, with its name and count over them; pressing it flies in. Non-overlapping subject names only (`namesFromFar`). Curves quieter. No joins, tethers or cards. |
| mid | between | subjects and their sessions. A session's words fade in as they become readable on screen. A session whose words are too small gets its name beside it where it fits without overlapping any name or disc (`tagsAt`). Joins inside subjects. |
| near | ≥ 0.82 (back below 0.72) | every conversation, every word, every line |

- **Hysteresis**: each boundary is crossed one way at one zoom and back at another, so a camera resting on a
  boundary never flickers between levels.
- **Culling**: what is drawn is culled to the view with a margin of 0.6 of its size (`viewOf`, `circleIn`). The
  culled set is recomputed only when the camera leaves it (`viewCovers`).
- **Budget**: each level draws at most 160 (far), 420 (mid) or 900 (near) sessions and dots one by one, the most
  important first (`withinBudget`). Whatever is chosen, pointed at, found or being dragged is always drawn.
- **Progressive drawing**: when more than 160 new conversations come into the drawing at once (a busy map going
  from far to mid), they are added 140 a frame, those at the middle of the view first (`revealOrder`).
- **Selection survives** level changes, because the selected, spotlit and active ones are always among those
  drawn.
- **Reduced motion**: glides become jumps and arrival animations are off. A change of scale still changes what is
  lit, but without movement.

## The camera (`components/logos5/UniverseBubbles.tsx`)

- **Kept out of React.** The camera lives in refs and is applied to the page directly, frame by frame. React hears
  of it only when what is drawn must change:
  - the level crosses a boundary;
  - the camera leaves the culled area;
  - the zoom changes by more than a factor of about 1.4;
  - the camera comes to rest (160 ms).
- **The zoom the CSS reads** (`--k`, used to size names and fade words) is written in steps of about 6%. It goes
  only to the map, and only when it has changed. The pan position goes only to the night sky that drifts with it.
  Writing either on every frame restyled every conversation on every frame.
- **Navigation**:
  - zoom is centred on the pointer (wheel, trackpad pinch, two-finger pinch on touch);
  - pan by drag or trackpad;
  - zoom is limited to 0.06–2.6;
  - Fit, `0`, `+` and `−` glide;
  - the arrow keys move from one lit conversation to the nearest in that direction, and Shift with an arrow pans;
  - pressing an aggregated subject flies to it;
  - double-click adds a note at any scale.
- **Glides** interpolate the zoom in log space, so going in and coming out feel the same speed (`camBetween`).
- **Recovery**: Fit (`0`) frames everything lit. Back (Backspace, or the pill) returns to the camera before the
  last jump, and keeps the last ten. When a search widens the scale, the camera is remembered *before* the
  widening (`MapNav.mark`), so Back returns to where the person was.

## Finding a conversation (`lib/logos5/mapSearch.ts`, `components/logos5/MapFind.tsx`)

- **A compact control** at the top of the map ("Find on your map", `/`) opens into a panel.
  - Empty, it lists **Recent**: the most recently active conversations.
  - Typed into, it finds **conversations** (by title, by the ideas their maps grew, by where they stand),
    **subjects** (by name, with how many they hold) and **ideas** (with the conversations that hold them). Each
    kind is grouped and marked as what it is.
  - Each result shows its title (with the words found marked), an excerpt when the match was not the title,
    its subject, and when it was last active ("2h ago", "Yesterday", "Oct 14").
  - A result outside the current scale says so: "Outside Today · shows in Week".
- **Choosing a result**:
  1. widens the scale to the narrowest one that shows it, if needed;
  2. glides the camera to it, near enough to read;
  3. spotlights it for a moment;
  4. opens its card, whose Continue opens the conversation.
  ⌘Enter, or the result's Open button, opens the conversation directly.
- **Keyboard**: ↑ and ↓ move through results, Enter goes, Escape clears and then closes. The field is a
  combobox with an active descendant.
- **While the panel is open**, the map dims what does not match. A jump closes the panel and keeps the words, so
  `/` brings the same results back.
- **Nothing leaves the browser**: the search reads only what the map already holds. There is no index and no
  request.

## Visual design

- **Subjects** sit in soft fields of their own colour, deeper from far away, with a hairline ring. The ring is
  dashed close up and solid from far away.
- **Typography**: names stay at one size on screen from far away. Words are never forced larger than their disc;
  they fade in as they become readable.
- **The page washes in behind the header**, so the header stays readable when the map passes under it.
- **"Start something new"** fades out before it is too small to read.
- **Core chats** are filled lightly when zoomed out, where an open ring would be lost.
- **Light and dark themes** are both styled, and on a phone the search takes a full row under the scales.
- **The conversations blink.** The forty most recently active conversations on the map glint now and then, each at
  its own pace, so they never blink together (`blinkers` in `lib/logos5/universe.ts`; each glint is a layer of its
  own while it runs, so the number is capped):
  - a session's disc brightens and a ring of its colour opens a little way out from it;
  - a quick question's dot fills with light and its ring opens further.

  The newer a conversation, the more often it glints (`blinkOf` in `lib/logos5/universe.ts`): every 2.6s for one
  touched today, down to every 6.2s for one two months old or more. Each has a phase of its own, worked out from its
  id, so a conversation always blinks the same way.
  - What a search finds blinks faster (every 1.8s).
  - What a search leaves out, what is leaving the map and what is being moved do not blink.
  - While something is gone to (from search, Recent or Back), only it blinks, and its ring opens out three times.
  - In Celestial the glints are gold, and the stars keep twinkling after the map has come in. Before, the twinkle
    stopped once the map settled, and it now dims further (to 25%).
  - The glints stand down while the camera moves (pan, zoom, pinch, keys or a glide) and come back when it rests.
    The map is marked `data-moving` once when a move starts and cleared once it ends, never on every frame.
  - The glint uses opacity and transform only, and nothing moves under reduced motion.

## Performance

All figures were measured in this repository's container: 4 vCPUs, and headless Chromium with **software
rasterisation and no GPU**. Raster costs are therefore higher than on most real devices, but GPU raster was not
measured.

- **Fixtures** are synthetic conversations from `scripts/map-fixtures.mjs`.
- **Browser figures** come from `scripts/verify-map.mjs --perf` at 1440 × 900.
- **Frame figures** are gaps between `requestAnimationFrame` callbacks. A measurement counts only if the camera
  actually moved during it (`moves`).

### Layout and search (Node, pure functions)

| Conversations | Placement, once | before Logos 6 tuning | Scale pass | Search |
|---|---|---|---|---|
| 60 | 9 ms | 11 ms | 0.6–2.7 ms | 1.2 ms |
| 400 | 39 ms | 44 ms | 0.7–3.9 ms | 3.4 ms |
| 1,500 | 169 ms | 375 ms | 1.1–5.1 ms | 9.8 ms |
| 3,000 | 531 ms | 1,362 ms | 1.6–9.6 ms | 20 ms |

- **Before the two-stage split**, every scale switch redid the whole layout: about 460 ms at 1,500 conversations
  and 2 s at 3,000.
- **The placement speed-up** comes from a grid for the collision test and from scoring each direction once. It
  produces identical output: checked on 96 cases (4 sizes × 3 seeds × desktop and phone × 4 scales).

### In the browser

- **Scale switch**, measured from the click to the second frame after it:
  - now 22–93 ms at every size (most runs 25–57 ms);
  - before the cache fix, 270 ms at 1,500 conversations and 767 ms at 3,000.
- **Pan at middle zoom, 3,000 conversations**, profiled:

  | Fix | Raster | Main thread |
  |---|---|---|
  | none | 3,360 ms | stalls of 480–630 ms |
  | dashes per ring capped (`pathLength`, at most 1,600 units) | 373 ms | no frame over 50 ms |

- **1,500 conversations**: style recalculation fell from 635 ms to 37 ms after the per-frame custom properties
  were moved off the map root.
- **400 conversations, middle zoom**:
  - dropping the drawing-in masks from the curves once the map has arrived: raster 1,763 ms → about 820 ms;
  - giving the lines their own compositing layer: about 450 ms.

Final run on the final code, frame gaps in ms, with counts of frames over 50 ms (the same harness run repeatedly at
400 conversations varied by several frames either way):

| Conversations | Fitted: pan | Fitted: wheel zoom | Middle zoom: pan (drawn) | Close: pan (drawn) | Elements at fit | Heap |
|---|---|---|---|---|---|---|
| 60 | max 17, 0 of 78 | max 83, 5 of 50 | max 50, 0 of 64 (60) | max 33, 0 of 68 (60) | 490 | 17 MB |
| 400 | max 67, 2 of 46 | max 317, 16 of 45 | max 83, 4 of 44 (391) | max 50, 1 of 49 (168) | 322 | 21–23 MB |
| 1,500 | max 83, 2 of 54 | max 117, 5 of 56 | max 33, 0 of 63 (31) | max 33, 0 of 72 (18) | 309 | 22–32 MB |
| 3,000 | max 67, 1 of 48 | max 233, 4 of 56 | max 33, 0 of 55 (0) | max 33, 0 of 76 (0) | 298 | 29–30 MB |

- **The fitted view of a large map is far zoom**, so there are about 300 elements on the page however many
  conversations there are: busy subjects are aggregated.
- **The heaviest case is 400 conversations at middle zoom**: 391 discs drawn, about 2,700 elements. It still
  drops some frames while panning in this software-raster browser.
- **Zooming across the far-to-mid boundary on a busy map drops frames.** Several hundred discs arrive and are
  rasterised.
- **Progressive drawing helped a little.** Across three runs each at 400 conversations, slow zoom frames went
  from 16–18 to 12–15.
- **At 1,500 and 3,000, middle and close zoom draw few conversations here.** The zoom lands where few are
  culled in, so these rows are not a stress test.

### Interaction checks (`scripts/verify-map.mjs --flow`)

- **Search**: `/` opened Recent. "roman" found one conversation, marked "Outside Today · shows in Week".
- **Choosing it**:
  - the scale went from Today to Week;
  - the camera glided through 12–16 frames to a readable zoom;
  - the conversation was spotlit and its card opened;
  - the Back pill appeared.
- **Back** returned the camera to exactly where it was (the same transform), with and without reduced motion.
- **Reduced motion**: the camera jumped (one frame) instead of gliding.
- **Detail levels**, sampled after each wheel step (so coarsely):
  - going in, far became mid at zoom 0.48 and mid became near at 1.26;
  - coming out, near became mid at 0.62 and mid became far at 0.24.
- **Far view**: All Time with 120 conversations showed 6 aggregated subjects with 52 drawn. Pressing one flew in
  to the middle level, and `+`, `−` and `0` still worked afterwards: the map keeps keyboard focus after the
  button disappears.
- **Every quick question's dot has a size on screen**, at every level. This check exists because a rule added
  during this work, to anchor the spotlight ring, briefly made every dot an empty inline box; the stylesheet test
  now guards it too.
- **Search panel**: on a phone it spans 12–378 px of 390, with no horizontal scroll. The dark theme was checked
  too.

## Where it lives

| What | Where |
|---|---|
| The scales (pure) | `lib/logos5/scales.ts` |
| Level of detail, culling, budget, names, progressive order, glide (pure) | `lib/logos5/mapLod.ts` |
| Search, Recent, short dates (pure) | `lib/logos5/mapSearch.ts` |
| Placement and the scale pass, regions (pure) | `lib/logos5/bubbles.ts` (`bubblePlaces`, `bubbleLayout`, `regionOf`) |
| The map drawn: camera, levels, culling, progressive drawing, navigation handle | `components/logos5/UniverseBubbles.tsx` |
| The page: scale selector, counts, empty states, search wiring, Back | `components/logos5/Universe.tsx` |
| The search panel and the Back pill | `components/logos5/MapFind.tsx` |
| Styles | `components/logos5/universe.css` (section "THE UNIVERSAL MAP, ONE MAP AT FOUR SCALES") |
| Tests | `test/logos5-universal-map.test.mjs`, and the map sections of `test/logos5-study-ui.test.mjs` |
| Browser harness: screenshots, perf, interaction flow | `scripts/verify-map.mjs`, `scripts/map-gallery.tsx`, `scripts/map-fixtures.mjs` |

`node scripts/verify-map.mjs --out <dir> --shots --perf --flow --n 60,400,1500` runs the harness. Screenshots,
`perf.json` and `flow.json` are written to `<dir>`.

## Limitations

- **Frame times are from software rasterisation** in a headless browser. Zooming a map of several hundred
  conversations across the far-to-mid boundary still drops frames there, and real-device GPU figures were not
  measured.
- **The one-off placement** takes about half a second at 3,000 conversations, the first time the map opens with
  that many. Scale changes after that are cheap.
- **The tile limit was raised from 150 to 4,000** most recent conversations, as a guard against an unbounded
  list. All Time is everything up to that guard.
- **Once the map has arrived, curves no longer draw in.** Their drawing-in masks are dropped then, because each
  covered the whole map and was rasterised in every tile. A curve or memory tether that appears afterwards,
  through a widened scale or a memory loaded later, simply appears.
- **On very large regions the ring's dashes lengthen**, because the number of dashes per ring is capped.
