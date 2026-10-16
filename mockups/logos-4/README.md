# Logos 4: proposed feature mockups

PNG mockups of four proposed Logos 4 features, for judging how they look
and feel before anything is built. **Nothing here is shipped, and no
application code was changed.**

## How they were made

Each screen is the **current** Logos interface, rendered from the real
components, with the proposed feature drawn into it:

- the real components: `LogosRail`, `LogosMessage`, `LogosComposer`,
  `ThinkingMap` (with the `/logos` demo map), `ModelPicker` and `MapThumb`
- the app's own compiled stylesheet, served by the Next.js dev server
- the app's own fonts: Instrument Serif, Inter, and Kalam for handwriting

The new UI uses only the existing `--lg-*` tokens: cream paper, olive
primary, the tension colour for anything flagged. Where an existing pattern
fits, it is reused:

- Point & Ask grows out of the node action menu (Explore, Challenge,
  Research, Trace).
- Captures enter the composer as ordinary attachment chips.
- On phones, everything uses the Conversation / Map switch.

Two liberties are taken:

- The model picker reads "Logos 4" instead of "Logos 3.5".
- The phone layout uses the toolbar spacing that `globals.css` intends but
  does not currently get (see "A bug found on the way").

The people and documents are invented: Maya, the Dallas offer, the offer
letter and the ECON 2301 board. Desktop is 1440×900 and mobile is 390×844,
both at 2× pixel density.

## Index

| Folder | What to look at first |
|---|---|
| `0-overview/` | One board per feature and platform, showing every state in order with captions |
| `1-point-and-ask/` | `mobile/01-tap-map-node.png`: tap a node, the map pans it into view, a short sheet asks |
| `2-instant-resume/` | `mobile/01-continue-sheet-on-open.png`: one tap back into what is waiting on you |
| `3-quick-capture/` | `mobile/01-camera-capture.png`: camera first, the board's writing is read |
| `4-voice-to-text/` | `mobile/03-review-and-correct.png`: nothing is sent until reviewed |

### 1. Point & Ask

Select a map node, a point on a model, or a document passage, and ask about
exactly that.

**Desktop:**
1. select a node
2. type the question in place
3. the answer, linked back to the node (the node carries a marker, and the
   thread a "Show on map" link)
4. a point on a model
5. a passage
6. the question carried into the composer instead

**Mobile:**
1. tap a node
2. the question with its context in the composer
3. the answer, linked to the node
4. tap a point on a model
5. select a passage

Decisions:

- The ask field sits **above** the existing moves, not instead of them.
- On a phone the sheet is non-modal and half-height, and the map **pans and
  zooms** so the selected node stays visible above it.
- The answer says what it was about ("Asked about …"), so the thread still
  makes sense later.

### 2. Instant Resume

The start screen leads with the one thing to continue: the question
Socria asked that is still waiting on you. A model, a project and a draft
follow, each with where it was left.

When restored, earlier turns are dimmed, a "Where you stopped" divider marks
the place, and the half-written reply is kept.

On a phone, opening Logos shows a Continue sheet with a single full-width
button. This is the MavMarket case: someone who tried it at the booth comes
back later.

### 3. Quick Capture

Capture a note, a photo, a voice note or a link from anywhere: the header
button or ⌘⇧K on desktop, a camera-first sheet on a phone.

Captures wait in a **Captures** section at the top of the rail. From
there you can "Think about this", which starts a line of thinking, or
"Add to a line". They arrive in the composer as normal attachment chips.

Photos of boards have their writing read, so they can be searched.

### 4. Voice to Text

1. A mic sits beside Send.
2. While recording, the transcript appears live, with the not-yet-final
   words in grey. There is a timer, a waveform, Stop and Cancel.
3. Review: the text is fully editable. Uncertain words are underlined, and
   one "Check 1 word" strip offers a correction from context (here, the
   offer letter's "Southwest"). It never covers the text.
4. Once sent, the message carries "Dictated · 0:21 · audio not kept".

Nothing is sent automatically.

## Feasibility notes

**Point & Ask** mostly reuses what exists:

- `ThinkingMap` already has `onAskAbout`, `onSelectNode` and the node action
  menu.
- The composer already has a "replying to" chip slot.
- Chart points and passages need hit-testing in the model views and the
  document reader.

**Instant Resume** needs a "last place" per line of thinking: the scroll
position, the draft text and the last open question. The sessions table
already holds the messages and the map.

**Quick Capture** needs a new store: a captures table with the same row-level
security as everything else, plus a place for uploads. Reading the text in a
photo can reuse the existing image reading.

**Voice to Text** can start with the browser's speech recognition where
available, falling back to an upload to a transcription endpoint.

- **Audio:** "audio not kept" must be true in the implementation before that
  label ships.
- **Rate limiting:** the endpoint needs its own pool.
- **Corrections from context:** suggesting "Southwest" from the offer letter
  requires the transcript step to see the conversation's documents.

## A bug found on the way (in the current app)

On phones, the floating **Conversation / Map** switch covers the toolbar row
under the composer (Synthesize and the model picker).

`app/globals.css` line 3101 gives `.lg-tools` `padding-bottom: 56px` inside
the mobile media query, so the toolbar clears the switch. But the
unconditional `.logos-root .lg-tools { padding: 0 2px 4px; }` at line 7199
comes later in the file and wins.

These mockups show the intended spacing. The app does not have it today.
Worth fixing before a phone demo.
