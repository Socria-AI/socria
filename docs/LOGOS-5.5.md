# Logos 5.5 — the interface system

Logos 5.5 keeps every behaviour of Logos 5 (the four views, Split View, the
canvas zoomed out, the Universal Map, Memory, Study) and replaces the chrome
around it with one consistent system. The design handoff is "Logos 5.5 System"
(November 2026): six type steps, four radii, four elevations and three control
states, applied to the Logic Map docked, the Logic Map folded with a card being
asked about, Study, Home with Memory on the Universal Map, and (VIII) one
board for a line of thinking, where the chatbox is the chat.

**Fill means do. Wash means here. A hairline means you can.**

This file says what was built, where, how it is held in place, and what is not
finished. The handoff's own reference (HTML) is not shipped.

---

## 1. One controls sheet — `components/logos5/l5-controls.css`

Loaded right after `l5.css` (`components/LogosApp.tsx`), and by the few pages
outside the app that draw the same keys (`UniverseParts.tsx`, `OnePrompt.tsx`,
`SocriaOneModal.tsx`). It replaces `buttons.css`, `buttons-soft.css` and the
artifact strip's key in `redesign.css`; all three are gone.

| Control | Class | Look |
|---|---|---|
| Primary (the one action a surface exists for) | `.l5-btn.is-primary` | primary fill, paper text; hover 12% darker and up 2px; at most one per surface |
| Secondary | `.l5-btn` | 1px edge on the surface's own paper; hover is the shade |
| Quiet | `.l5-btn.is-quiet` | no edge, ink 70 |
| Danger | `.l5-btn.is-danger` | tension text, tension at 40% for the edge |
| Small | `.is-sm` | 32 tall (40 by default); 44 hit area on touch |
| Icon | `.l5-icon` | a 32px circle, 16px glyph; `.is-framed`, `.is-send`, `.is-lg` |
| Close | `.l5-icon.l5-close` (`L5Close` in `L5Chrome.tsx`) | the one ×, top right of what it closes |
| Switch | `.l5-switch` / `.l5-switch-i` | a 36 tray, 28 items; the chosen one is the wash |
| Chip | `.l5-chip` | 32px hairline; a tapped chip becomes your message |
| Menu | `.l5-menu` / `.l5-mi` | radius 16 outside, 10 inside, items 36 tall, elevation 2 |
| Label | `.l5-label` | 10.5 / 600 / .18em / uppercase / ink 45 |
| Holder | `.l5-holder` (`.is-floating`, `.is-lit`) | panel paper, a rule, radius 16 |

**Selected is the wash, everywhere**: `aria-pressed`, `aria-selected`,
`aria-expanded` or `.is-on` give `rgba(primary, .08)` with primary text — no
inset shadow, no moss border, no moss fill, no ink wash. The older
pressed-in states across `l5.css`, `l5v.css`, `redesign.css`, `study.css` and
`voice.css` were rewritten to it.

The `--l5b-*` names other sheets read (`universe.css`, `voice.css`,
`study.css`, `objects.css`, `write.css`, `globals.css`) are kept and now say the
5.5 values, so those surfaces follow without being rewritten.

Migrations: `.l5-iconbtn` / `.l5-icon-btn` → `.l5-icon`; `.l5-menu-list` →
`.l5-menu` (items `.l5-mi`); `.l5-eyebrow`, `.l5c-k`, `.l5-ask-k` and
`.l5s-art-eyebrow` draw as `.l5-label`; `.l5x-x`, `.l5-ask-x`, `.l5m-x` and
`.l5-stage-x` are `L5Close`. The old class names that remain are hooks for
layout and tests, not looks.

## 2. Type, radii, colour

- **Six steps** in the workspace's sheets (`l5`, `l5v`, `redesign`, `study`,
  `canvas`, `tips`, `make-gallery`; `memory` up to 15.5): Display serif 32,
  Title serif 18, Prose 15.5, UI 13.5, Meta 12.5, Label 10.5. Glyph sizes (a
  × or an icon character) and a thumbnail's own type keep theirs; a field on a
  touch screen is 16, so the browser does not zoom into it.
- **Four radii**: 999 for every action, 16 for holders, 10 inside a holder, 6
  for marks. Your words are `16px 16px 6px 16px`. Map nodes keep their own.
- **No blur** anywhere in the workspace; no press travel; no lit, lipped
  primary.
- **Colour on its job**: the "something new" dot is primary, not gold;
  Socria's question is ink (green is yours); Memory's eight regions draw in one
  ink (`--l5mm-region`) — told apart by place and label; counts are plain
  tabular type, never badges.

The Universal Map's sheet (`universe.css`) is left as it is: the newest part
of the handoff ("Universal Map + Memory") says the map does not change.

## 3. The header and the switch

`L5TopBar` (`components/logos5/L5Views.tsx`): 56px, a rule below, the paper.
Start: the mark (home), a rule, a label (Project · Study · Line of thinking)
and the line's name in italic serif. Middle: the switch — **Chat · Files n ·
Artifacts n · Logic Map** (`L5Switch`, a tablist with arrow keys, Home/End and a
roving tab stop). End: Search ⌘K (quiet), Memory (signed in), More, the account.

- **Files** is the Content view's name now (`lib/logos5/views.ts`
  `VIEW_LABELS`, `SPLIT_NAMES`; the id stays `content`), and every sentence
  that names the view says Files ("Added to Files", "Written in Files").
- **The canvas stays.** Since 1 November a line of thinking opens zoomed out;
  it still does. Zoomed out, no view is chosen in the switch; pressing one
  brings it close. The "Back to chat" bar is gone — the switch is the way
  between views.
- **A view's own actions** sit top right on it (`L5Layout` `actions`): **+
  View** (Split View's menu), Synthesize, AR Mode on the map, Zoom out.
- The header has no "+": **New line of thinking** is the first item in More, at
  any size.

## 4. The composer — four controls

`components/LogosComposer.tsx` (stacked): the words alone in their row; under
them **+** (Attach, Make, Search my files, ∑, Quick capture), the length
(`ConcisePicker`, "Balanced ⌄"), Voice (its glyph), Send (the one fill, a
32px circle, unfilled while there is nothing to send). The paperclip and the ∑
key left the row for "+". Make is opened from "+"
(`MakePicker` `open` / `onOpenChange` / `bare`): it shows a chip only once
something is chosen.

- The only white in the app is the composer on Paper (`--l5-composer`; the
  dark grounds use their surface). Elevation 1 docked, 2 folded.
- The placeholder is said, not labelled: serif italic 18, ink 45 — "Say what
  you actually think." in a line of thinking, "What are you actually trying to
  work out?" on an empty one.
- **"Asking about · {topic} ×"** — one line above the words when a card,
  topic or element is in scope (`.l5-asking`).
- **Folded** (the conversation not on screen), the first tool is
  **Conversation n** and a rule: it unfolds the conversation beside the view.

## 5. Screens 1 and 2 — the Logic Map

- **Docked**: the conversation beside the map docks on the **left** unless the
  person put it elsewhere (`besideSide`; a side once chosen is kept). Its
  head is a label ("Conversation") on the panel paper.
- **Turns**: your words in the wash, max 82%; Socria's reply unboxed prose with
  no name over it (in a group, names are still said); its closing question
  serif italic in ink; Copy · Retry · Reply as quiet words; "Asked about" a
  label on its own line, no box.
- **Canvas**: edges 1.5px at .75 — supports primary, depends on accent,
  conflicts tension and dashed, relates ink 25; the lens chosen is the wash; the
  legend is type at the foot ("supports · depends on · conflicts · relates · n
  ideas · up to date"), hidden while a card is asked about; the zoom tray is
  the map's own.
- **Asking about a card** (`L5Ask` inside the map's `.lg-acts.is-ask`): a
  holder — 310 wide, panel paper, a rule, radius 16, elevation 2, no blur; a
  label and the card's name in serif; your question a small bubble in the
  wash; the moves **Challenge it · Trace it back · Take it to research** as
  hairline chips; the input serif italic, Send unfilled until there is
  something to send. Focus, lit and dim are the map's existing states.

## 6. Screen 4 — Study, read left to right

`components/logos5/StudyDesk.tsx`, its facts in `lib/logos5/studyDesk.ts`, its
sheet `study-desk.css`. The Artifacts view of a study that has files, on a wide
screen, as the view (beside another view it stays the one-at-a-time strip):

- **Your files**, 300 wide on the panel paper: each file by what the person
  would call it ("Lecture 9 Adjusting Entries"), its line ("PDF · 7 topics · 5
  on your map"), and, opened, its topics. A topic is **on your map** (the
  filled dot) only when an idea on the Logic Map carries its name; otherwise
  the hairline ring — said in words too, and keyed at the foot. "start here"
  marks where Socria recommends starting. Topics from no file are listed under
  "From the conversation". **+** goes to Files to add more; the fold key puts
  the column away and "Your files n" brings it back.
- **What was made**, in the middle as cards (`.l5-holder`, two columns, gap
  16; one column when the middle is under 760 — measured by the middle, so the
  conversation beside takes its room). An artifact belongs to a topic when it
  was made for it (practice) or its title names it. Choosing a topic — the
  same choice as on Files' board — narrows the middle to it; "All kinds" picks
  a kind; "Show all n" takes both back.
- **The card the conversation points at** (`artKey`, the one last made or
  opened) is lit and scrolled into view.
- **Heavy things** — your writing, a model, a simulation, a 3D scene — are not
  drawn in a card; the card offers Open. Chosen (by you or by the
  conversation), they open at full size in the one-at-a-time view with
  "← All artifacts" back to the desk.
- **The conversation** docks on the **right** beside the desk unless the
  person put it elsewhere (`besideSide(screen, chat, fresh)`; the left stays
  the default beside the map).

## 7. Screen 3 — Memory on the Universal Map

The newest part of the handoff. The map itself does not change; memory is a
layer on it, shown by default when signed in and absent signed out.

- Each memory hangs off the conversation it came from, placed last so nothing
  else moves; between two subjects already joined by a shared idea it becomes
  that link's card (Edit · Forget). Its kind comes only from its provenance:
  "In your words", "From your file", or "Socria's reading".
- **The Memory key** sits between All subjects and View with the count of
  readings waiting; it is kept with the view (`display.memory`).
- A conversation's card gains **What it taught Socria**, with That's right
  and Not quite (the Memory view's own `PATCH /api/mind/node`).
- Private, off-the-record and sensitive conversations show nothing: the server
  never sends their memories, and the client drops any conversation whose
  messages do not fold to `full`.
- The detail, and what the data cannot yet say, is in `docs/LOGOS-5.md` §5
  (Memory on the map).

## 8. VIII · One view — one board, the chatbox is the chat

The newest part of the handoff. On a wide screen (1024 and over) a line of
thinking with something in it is one board, built on the canvas
(`components/logos5/L5Board.tsx`, its rules in `lib/logos5/oneView.ts`,
`board.css`). It is the line of thinking's only view there; the phone keeps
the four views and the zoomed-out canvas as they were.

- **The board.** The conversation runs down the middle as turn cards (your
  words in the wash, then Socria, "Turn n", the gist) on a spine; what each
  turn brought or made sits on the right, wired to its turn ("File ·
  Brought", "Artifact · Live graph"). The Logic Map is **one pinned card** on
  the left: the question first, then the ideas the turn being read put on the
  map (lit), then the rest — five, "+ n more ideas"; pressing an idea asks
  about it; pressing the card's name opens the map beside, to edit.
- **The chatbox is the chat.** The turn being read — the newest unless
  another was pressed — opens in full above the chatbox, drawn exactly as the
  conversation draws it (one renderer, `msgEl`, for both): "Socria · Turn 3
  of 3", ↑ ↓ through the turns, Fold. Folded, every turn is on the board and
  the chatbox's first tool is "Turn n ⌃". Sending opens the new turn above
  the chatbox. Under the reply, "{kind}, beside this turn →" opens what it
  made.
- **One line for the guide.** "Guiding, not solving" and "Asking about" are
  the chatbox's first line, with Another hint and Show solution at its end
  (`LogosComposer` `guide`); the bar that floated over the conversation is
  gone in Logos 5.
- **The tabs move the board.** Each brings its part forward and the rest
  steps back (the card stays opaque; what is in it fades); Logic Map opens
  all the ideas on the pinned card. The screen's own rules
  (`lib/logos5/views.ts`: what a sent turn does, rule C) are kept and read
  as the camera. The filters, the zoom group and Back to chat are gone; zoom
  is a tray in the corner (− % + fit).
- **Split View stays.** In the header ("Split View"), it opens one thing
  large beside the board — an artifact to use, the Logic Map to edit, a file
  to read — never the conversation, which is the chatbox. A card pressed on
  the board opens there too. The board fits itself to the room left; the
  reply and the chatbox stay full size. A study's Artifacts, beside the
  board, is the desk of §6.
- **Nothing floats over the board.** The view's own actions are gone from
  it: Synthesize and AR Mode are in More.

## 9. Not finished

- **Readings seen once** are not on the map: they live in the pending ledger,
  which the Logos memory feed deliberately does not send. "Waiting" on the map
  is a memory held tentatively. Showing the ledger needs a server change.
- A corroborated reading keeps only the second conversation's id, so it hangs
  off that one; files added on the Memory page or a Project sheet name no
  conversation, so their memories appear once they come up in one.
- This month and All time draw no memory, as the handoff says for this pass.
- On a phone the desk is not drawn: Artifacts stays one at a time.
- **One view on a phone** was not drawn in the handoff: a phone keeps the
  four views and the zoomed-out canvas. A shared room (others thinking
  together) keeps the conversation as it was.
- On the board, what was made outside any turn (a model, the writing, a
  kept artifact) sits at the foot beside the sheet, wired to no turn; a
  display has no record of the turn that asked for it.
- The phone sheet, and the White, Dark and Celestial themes, use the same
  tokens and were not drawn separately in the handoff; they were checked only
  where the browser runs below went.

## 10. How it is held

- `test/logos5-system-5-5.test.mjs` reads the sources: the old sheets gone and
  never imported; the three states; the one icon, menu, close and label; every
  reading size one of the six steps and every corner one of the four radii in
  the workspace's sheets; no blur, no press travel, no lit primary; the colour
  roles; the header, the switch (tablist, arrow keys, roving tab stop), Files;
  the four composer controls, Make under "+", the asking line, the white
  composer, Conversation n; the ask card's moves, the legend, and the
  conversation docked left.
- `test/logos5-study-desk.test.mjs`: what a file is and holds, on your map,
  which artifact belongs to which topic, what the middle shows, the desk drawn
  (files, topics, dots, cards, the lit card, heavy things not drawn, Show
  all), the conversation docked right, and the wiring in `LogosApp.tsx`.
- `test/logos5-one-view.test.mjs`: when the board is the view, what each
  tab brings forward, what may open beside (never the conversation), the
  turn the sheet reads and ↑ ↓, the ideas a turn lit, the pinned card's
  ideas, zoom; the board drawn (no bar, one pinned card, the turn being read
  off the board, wires, the tray) and the sheet; the wiring in LogosApp.
- `test/logos5-map-memory.test.mjs`: memory's kinds from provenance, where
  each hangs, what is left off, the key, the card, That's right / Not quite.
- The suites that asserted the old chrome (`logos5-shell`, `logos5-canvas`,
  `logos5-views`, `logos5-study-ui`, `four-views`, `ar-mode`,
  `onboarding-tips`, `ux-polish`, `logos3-chat-notes`) now assert the 5.5
  chrome.
- Browser: the real app with the local stand-ins at 1440×900 — a line of
  thinking zoomed out, Chat, the Logic Map with the conversation docked, the
  map folded, a card asked about, Files and Artifacts
  (`.journeys/l55-shots.mjs`); a study — two files sorted into topics,
  practice made, the desk, a topic chosen, the conversation beside on the
  right, the files folded (`.journeys/l55-study.mjs`); the board — three
  turns, a file, a drawing; a turn read; Fold; each tab; Split View with the
  Logic Map and with an artifact; at 1440, 1100 and a phone
  (`.journeys/l55-board.mjs`).
