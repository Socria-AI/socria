# Logos 5 Memory: neural memory network mockups

High-fidelity PNG mockups of a redesigned Memory tab for Logos 5, made to judge
the look and the interaction model before anything was built. **It has since
been built** — `lib/logos5/memoryAtlas.ts` and `components/logos5/MemoryView.tsx`
(docs/LOGOS-5.md §7) — with "It changed — keep the newer" added to the store as
the `supersede` decision. A pin the person sets is still new (see the table).

The screens are static HTML (`src/`) drawn with Socria's Paper tokens
(`app/globals.css`, `components/logos5/l5.css`) and the app's own fonts
(Instrument Serif and Inter, from `app/fonts`). Every graph is computed by a
small deterministic layout in `src/memory.js`, so the same memories always
land in the same places. That is the behaviour the real view needs too.

The person and every memory are **illustrative**: one coherent person, Alex
Rivera, whose 39 memories (`src/data.js`) exercise every state. Each field
is one the Mind Graph store already keeps or can derive. There are no
confidence scores and no invented sources. Desktop is 1440×900 and mobile is
390×844, both at 2× pixel density.

## Index

| File | What it shows |
|---|---|
| `0-overview/desktop.png` | Board: all five desktop states with captions, plus the state legend |
| `0-overview/mobile.png` | Board: all five phone states with captions |
| `desktop/1-overview.png` | Overview: eight regions, every memory, relationships bundled between regions |
| `desktop/2-expanded-cluster.png` | Projects & Work opened in place; the other regions at the edges |
| `desktop/3-selected-memory.png` | A proposed decision selected: its relationships light up, inspector open |
| `desktop/4-changes.png` | Changes: how memory evolved, and what one change reached |
| `desktop/5-review.png` | Review: a possible contradiction, proposed changes, "noticed once" claims |
| `mobile/1-overview.png` … `5-review.png` | The same five states, designed for a phone |
| `src/` | `index.html`, `memory.css`, `memory.js`, `data.js`, `board.html`, `render.mjs` |

Re-render everything with `node mockups/logos-5-memory/src/render.mjs`. It
uses Playwright with Chromium. Pass `desktop 3` to render one screen.

## Design decisions

1. **An atlas, not a force layout.** Every region has a fixed home.
   Identity sits in the middle, and the other seven surround it. Regions
   that usually relate sit side by side: Goals between Recent Context and
   Open Questions, Questions next to Projects & Work. A region's size
   follows how much it holds, but its home never moves. The map is the
   same for everyone and on every visit, so it can be learned once.
   Physics-based layouts reshuffle as memories arrive; this one does not.
2. **Memories are neurons, relationships are fibres.**
   - A cell body is sized by `importance`, with a few quiet dendrites.
   - Connections inside a region are short curves in the region's colour.
   - Connections between regions are bundled into tracts. Each bundle
     leaves a lobe at the side facing the other region and bends around
     Identity rather than through it.
   - Every line is a relationship the store holds. None is decorative.
3. **Progressive disclosure by distance.**
   - **Overview:** every memory and its words, ranked so the important
     ones read first.
   - **An open region:** the region zooms in place. The others are pushed
     to the edges in the direction they lie, showing only the memories
     that connect here.
   - **A selected memory:** its own relationships light up, each with a
     plain word ("constrained by", "evidence for"), and everything else
     dims.
   - **On a phone:** the overview shows regions first (names, counts,
     what needs review, and only the strongest tracts). Zooming in reveals
     memories.
4. **One inspector, answering the questions people actually have.**
   - What is it?
   - What state is it in, in words?
   - Did Socria read a change?
   - Why does Socria remember it, with the conversation or file and an
     Open link?
   - What does it connect to?
   - How has it changed?

   The actions are the store's own: Edit, This isn't right, and Forget.
5. **Changes and Review are views, not pages.** They are tabs beside
   Network, with the same left list re-counted per view.
   - Changes is a timeline. Each card shows what it was, what it is now,
     the person's own words, the source, and what the change reached.
   - Review holds what waits for a decision. Each choice says, in plain
     words, what it will do. Rejecting a change restores exactly what
     was there.
6. **State is never colour alone.** Each state has a shape and a word:

   | State | Mark |
   |---|---|
   | Confirmed | solid outline |
   | Proposed | dashed outline |
   | Updated this week | soft gold ring |
   | Possible contradiction | triangle |
   | Older or replaced | faded |
   | Important | pin |

   The legend shows on the overview and folds to a single control once a
   region is open. Lists and the inspector repeat every state as text.
7. **Calm motion.** Selecting zooms gently (about 300 ms). When a memory
   changes, a single gold pulse runs once along the relationships the
   change reached; the mockups show it frozen as a dot on each lit line.
   With `prefers-reduced-motion` there is no pulse and no animated zoom,
   only a still highlight.
8. **The phone is designed for the hand.**
   - A full-screen network with pinch-to-zoom.
   - A bottom-sheet inspector with thumb-sized buttons.
   - A searchable, filterable list under every region. This is the
     fallback for large collections, and the accessible alternative to the
     graph.
   - The same atlas, folded into two columns, so neighbours stay
     neighbours.

## Data mapping

Each row is marked as existing (the store holds it today), derivable (it can
be computed from data the store already holds) or new (it needs new data or
a new write).

| On screen | Where it comes from | Status |
|---|---|---|
| A memory, its words and type | `MindNode` label, content and type, via `GET /api/mind?scope=logos` | Exists |
| Private memories kept out | `scope=logos` already excludes them | Exists |
| The eight regions | `MindNode.type` mapped to a region. This extends `groupOf` in `lib/logos5/mindgraph.ts` from three groups to eight. Conversation nodes are skipped as bookkeeping. | Derivable |
| Relationships and their words | `MindEdge.relationship` (`KNOWN_RELATIONSHIPS`), read as plain words | Exists |
| Confirmed or proposed | `Provenance.review`; `status: tentative` is also drawn dashed | Exists |
| Updated this week | `MindNode.updatedAt` within 7 days | Derivable |
| Older or replaced | `status` is historical or superseded, or `activation` is low | Derivable |
| Possible contradiction | a `possible-conflict` change from `detectContradictions` | Exists |
| Important (pin) | `importance` ≥ 0.8 | Derivable |
| A pin the person sets | `PATCH /api/mind/node` does not accept `importance`, and there is no `pinned` flag | **New** |
| Why Socria remembers this | `Provenance` kind, surface, at and `conversationId`. Open can go straight to the passage via `messageId` and `charStart`/`charEnd`. Files come from Source nodes. | Exists |
| "In 2 conversations" | `MindNode.seen` | Exists |
| A memory's history | `evolutionOf(node)` plus its provenance | Exists |
| The Changes timeline | `changesOf`, via `GET /api/mind/changes` | Exists |
| "Reached N memories" | `Change.affected`, the same walk as `affectedBy` | Exists |
| Confirm or Not right on a change | `POST /api/mind/changes` with `confirm` or `reject`. Reject restores `prior`. | Exists |
| Both are true | `reject` on the possible contradiction. The link is tombstoned and never proposed again. | Exists |
| Forget the newer one | `forget`, offered only when `Change.canForget` is true | Exists |
| It changed — keep the newer | One decision in `reviewChange`, `supersede`, added when this was built: the tension becomes a change of position, recorded as theirs | Exists (added) |
| Edit, This isn't right, Forget | `PATCH /api/mind/node` (edit, `challenge`) and `DELETE` (tombstoned) | Exists |
| Noticed once, and Dismiss | `PendingClaim`; `DELETE /api/mind/node` with kind `pending` | Exists |
| "To review" counts per region | proposed changes grouped by the regions of their two sides | Derivable |
| Positions kept between visits | the fixed atlas plus seeded placement, a pure function of the data | Derivable |

The store's plain `confirm` on a possible contradiction marks both claims as
in tension. It stays available but is not one of the three choices shown, to
keep the decision simple.

## Implementation sketch

The view reuses the memory infrastructure throughout. There is no second
store and no competing graph: every read and write goes through the
existing `/api/mind` routes.

- **Pure layout: `lib/logos5/memoryAtlas.ts`.** This evolves
  `lib/logos5/mindgraph.ts`. It holds:
  - `regionOf(type)`;
  - the atlas homes for wide and narrow screens;
  - seeded placement inside each region, leaning toward the regions each
    memory connects to;
  - bundle routing;
  - collision-aware label placement;
  - the level-of-detail rules.

  It is deterministic. Adding a memory relaxes only its own region, and
  region homes never move. It gets unit tests for determinism, stability
  when one memory is added or removed, no overlapping labels, and the
  region mapping.
- **View: `components/logos5/MemoryView.tsx`.** This grows out of
  `components/logos5/MindGraph.tsx`, which already reads `/api/mind` and
  `/api/mind/atlas` and already edits and forgets through
  `/api/mind/node`. It adds:
  - the Network, Changes and Review tabs;
  - the inspector, and a bottom sheet under 600px;
  - the list fallback.

  Changes and Review read `GET /api/mind/changes` and decide through
  `POST /api/mind/changes`. After each write the view refetches, so
  persistence is the server's.
- **Scale.**
  - SVG up to a few hundred visible memories.
  - Beyond that, cull to the viewport with a quadtree, which is also used
    for hit-testing.
  - Draw cells and fibres on a canvas layer, keeping the words in
    SVG or HTML.
  - Show labels by level of detail: far shows regions and tracts; middle
    shows memories with their top labels; near shows every label and
    relationship word.
- **Access.**
  - Every memory is in the list view, with its state in words.
  - `/` focuses search.
  - Arrow keys walk along relationships.
  - Enter opens the inspector and Esc closes it.
  - Zoom and pan work by keyboard, wheel and pinch.
  - Reduced motion is honoured.
- **Browser journeys to test**, on desktop and phone:
  - open a region, select a memory, open its source;
  - confirm a change, and reject one (what was there comes back);
  - forget a memory (it is not learned again);
  - dismiss a noticed-once claim;
  - use the list fallback;
  - use reduced motion.
