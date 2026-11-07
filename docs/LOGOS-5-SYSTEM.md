# Logos 5 — the interface system

This keeps every behaviour of Logos 5 (the four views, Split View, the
canvas zoomed out, the Universal Map, Memory, Study) and replaces the chrome
around it with one consistent system. The design handoff is "Logos 5 System"
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

## 8. Revision II — the one view, set as a page

Revision II ("set as a page", November 2026) answers the feedback that Logos
read like a cheaper chat app by leaning into printed matter. Socria's question
is the largest type on screen; the chatbox is a ruled line you write on;
surfaces are divided by hairlines, not cards; the chosen tab is underlined;
icons become words; paper grain sits under everything; there is one filled
control per screen. The sheets: `components/logos5/l5-controls.css` (the
controls, Revision II's own, with the first sheet's names — `.l5-btn`,
`.l5-icon`, `.l5-switch`, `.l5-chip`, `.l5-seg`, `.l5-holder` — drawn in its
terms), `page.css` (the one view), `revision2.css` (paper, header, chatbox,
sheets and the Universal Map, loaded last).

On a wide screen (1024 and over) a line of thinking with something in it is
one page in three columns divided by 1px rules (`components/logos5/L5Board.tsx`,
its rules in `lib/logos5/oneView.ts`). The phone keeps the four views.

- **The Logic Map, left** (360; 300 in Split view; the only dot grid). The
  question; the givens side by side; the steps on a rail — a filled dot for
  done, a ring for now, a hairline ring for ahead (`stepStates`); then every
  other idea. Ideas from the turn being read are **lit** (moss, `#EEF1E6`);
  ideas a later turn put there are **dashed** — they have not come up yet
  (`aheadOf`). What a turn lit is the map's own record and the cards whose
  labels its words name (`lib/logos5/linking.ts`, both directions). Pressing
  an idea asks about it; the column's name opens the map beside, to edit.
- **The conversation, middle.** Every turn is numbered in lowercase roman
  (`roman`). The one being read is open — "You" over your words, Socria's
  prose in a 60ch measure, "Socria asks" in gold ink over the question at
  serif 30, then the actions: "Open the {thing} beside this →" first, Copy and
  Retry as quiet words. The rest are folded to two lines: "You · …" and the
  question the reply ended on (`closingAsk`). Pressing one opens it and folds
  the rest; the head says "Reading turn iii of iii". The turns are anchored
  to the foot, by the chatbox.
- **The chatbox is a ruled line** (`LogosComposer`, stacked): the guide row
  ("Guiding, not solving · Asking about · {topic} ×") above; the words in
  serif italic on the line, with Send → at its end (the one filled control;
  a hairline ring when there is nothing to send); under it "+ Add a file, a
  photo or your voice" (Attach, Make, Search my files, ∑ in its menu) on the
  left, and Another hint and Show solution on the right while Socria guides.
- **Brought and made, right** (340). Cells between hairlines: the kind and
  "Turn n", a serif title, the thing itself (shown, not used) or a line, and
  "Open beside →". The cell the turn being read made goes moss with a dot.
- **The tabs set focus, and only the tabs.** Chat leaves everything; Logic
  Map keeps the map; Files and Artifacts keep their cells; the rest dims to
  0.32. What the screen's own rules choose (an artifact made, a file read)
  never dims the conversation (`pageFocus`).
- **Split view stays.** In the header ("Split view", a word with a dot), it
  opens one thing large beside the page; the right column gives way and the
  map narrows.
- **A closing question set apart.** A reply that ends on a question with at
  least 25 words before it sets the question apart under "Socria asks" —
  a one-paragraph reply too (`lib/reply-layout.ts`, `RichText`).
- **The header.** The mark, then "Sessions /" (your lines of thinking, on the
  Universal Map) and the line's name in serif italic; the tabs underlined at
  full bar height; Split view, Search ⌘K, Memory and More as words; the
  account a hairline ring. A guest's allowance and Save are words too.
- **The Universal Map** is paper (no dot grid): Search and List as words,
  the lenses underlined, the map's tools as words, "Pick up where you left
  off" a line, and the start box a ruled line with its way on the one
  filled control.

### 8.1 After Revision II — sharper, and one space

- **Taken away.** With fewer than two things in it, "Brought and made" is a
  52px strip, its name on end, pressed to open (its tab opens it too). The
  Logic Map's head no longer says "Turn iii lit": the lit ideas say it. On
  Today, the Universal Map's bubbles no longer each say "today". A reply's
  own elements (charts, tables, worked steps) sit in a square hairline.
- **What an idea does.** A Logic Map card that conflicts with, rests on or
  supports another says so in one line under it ("conflicts with *Italy
  stayed out*") — the relation that says most, never on steps
  (`relationLine`, `lib/logos5/oneView.ts`). The idea the chatbox asks about
  is ink, not moss, and says "· asking about" in its label.
- **Answer it.** When Socria's last reply ended on a question and nothing has
  been said since, the box reads "Your answer, in your words…". Opened from
  the Universal Map, such a conversation lands with the box focused. The map
  already marked those conversations (the gold "?" — Socria is waiting); it
  now says how many, beside Pick up: "3 questions waiting for your answer →",
  opening the newest.
- **The closing question is earned.** The reply rules
  (`lib/runtime/behavior.ts`) have most replies end on a statement and ask
  only when the answer changes what comes next — more often when someone is
  learning. So "Socria asks" appears only when a question is earned; the page
  reads the same without it.
- **One space** (`lib/logos5/morph.ts`). The page and the Universal Map are two
  levels of one place. "Sessions /", the mark, or a pinch outward on the page
  (Ctrl and the wheel outward) goes up: the page recedes and its title
  travels to the name on its bubble. Pressing a conversation on the map, or
  pinching into its bubble until it fills the view, comes down: the bubble's
  name becomes the page's title. View Transitions draw the move; without
  them, or with reduced motion, the change is simply made. A pinch inward on
  the page is left to the browser's own zoom.
- **A phone.** The page is the view there too: the same three columns as
  panels side by side, one screen wide — the Logic Map, the conversation,
  brought and made — swiped between, the header's tabs following the swipe
  (and bringing their panel when pressed). What is opened from the page takes
  the screen with "← Back to the page" above it. Split view is a wide screen's.

### 8.2 Revision III — everything in one space

Chat, Files, Artifacts and the Logic Map stop being four screens. A line of
thinking is one space (`components/logos5/L5Space.tsx`, `space.css`; its rules
in `lib/logos5/ideas.ts`), and the page of §8 is a press away.

- **One canvas, laid out by how things connect.** What frames the question
  (the question, the givens) and what was brought sit in the first column; each
  idea follows what it rests on, one column per step along the lines (the
  longest way, so a chain reads as a row; a loop is cut where it closes); what
  Socria made sits last. Lines are drawn between them and named where it helps:
  "so", "but", "because" on the map's own lines that touch the open idea, "read
  from" from a file to the first idea its turn put on the map, "made" from an
  idea to what its turn made. Loose relations draw no line.
- **Each kind has its own look.** An idea is a plain card; a file is paper with
  a folded corner; something made is framed, with its preview; the open idea is
  ruled in moss. Every card says the turn of the conversation that made it
  ("turn ii").
- **The open idea holds the reply.** It is the idea the newest turn put on the
  map first (not the question or a given when it put anything else there; the
  newest of them). It shows what you said, the idea, and Socria's reply as the
  conversation draws it — "Socria asks" and the actions included. While a reply
  is arriving, or when a turn put nothing on the map, the reply is read on its
  own card. Pressing any other idea opens it with the turn it came from and
  makes it what the chatbox asks about; pressing the newest again goes back.
- **The row under the header is not tabs.** Everything · Ideas · Brought ·
  Made · Words, with counts. A choice moves nothing: the chosen kind stays
  forward and the rest steps back to 0.22, still joined. Words is the
  conversation itself — each turn's words beside the first thing it made, a
  dashed gold thread through them in order. "Read as a conversation →" opens
  the page; "← The space" in the header comes back. The header's tabs show only
  on the page.
- **The chatbox is a box at the foot.** White, bordered, with "Answering
  *the open idea*" above it when Socria's newest reply asked something (and
  nothing else is being asked about); × sets it aside for that turn.
- **A phone** has one column: the open idea, what was made from it, what it
  comes from (the ideas before it, what was brought), what it leads to and what
  stands against it, then "See all n ideas". The row chooses what the column
  lists — every idea, what was brought, what was made, or the turns with the
  ideas each made. The chatbox is fixed at the foot.
- **Checked by** `test/logos5-space.test.mjs` (the rules, the space drawn on a
  wide screen and a phone, the wiring) and `.journeys/os-check.mjs` (the space,
  Made, Words, an older idea opened, the page and back, at 1440 and on an
  iPhone 13).

### 8.3 Revision IV — the one space, in colour

The design handoff "Logos 5.5 · One space, in colour" (`components/logos5/space-colour.css`, loaded after
`space.css`, and small edits to `L5Space.tsx`). Layout and behaviour are §8.2's; what changes:

- **Colour by kind, the row as its legend.** Ideas in moss, what was brought in slate, what Socria made in
  vermilion, questions (the one asked, assumptions, unknowns, misconceptions) in mustard, what stands against in
  rust, givens in ink (`ideaTone` in `lib/logos5/ideas.ts`). Each idea carries its node glyph
  (`components/NodeGlyph.tsx`); lines and their words take the colour of what they say (map, "read from", "made",
  the dashed "but").
- **Socria's question stands out.** It sits in a gold panel in the open idea. "Answering" at the chatbox names that
  question (the newest turn's closing question; the idea only when there is none). Pressed while the chatbox is
  answering it ("Answer below ↓"), the panel puts the cursor in the box.
- **Fit and motion.** Columns 250 · 224 · 400 · 254 fit a 1440 screen. Cards lift 2px on hover; when a line of
  thinking opens, cards settle in reading order and the lines draw after the last one (once; not when the open idea
  changes; none with reduced motion).
- **Linked to what exists.** Memory's gold count is what Memory's Review holds (changes proposed, from
  `/api/mind/changes`, read again when Memory closes). Listen, beside Copy and Retry on the open reply, reads it aloud
  with the browser's own voice, as the easy-view artifacts do. Socria One is the word in its slate with its dot, still
  opening the plan sheet. The wordmark top left is Instrument Serif.
- **Checked by** `test/logos5-space.test.mjs` (tones, the markup, the wiring) and
  `.journeys/os-check.mjs` at 1440 and on an iPhone 13.

### 8.4 Revision V — Socria's bubble

- **Socria's reply is its own bubble** under the open idea, with a small pointer up at it: signed "Socria" in italic moss Instrument Serif (no mark), the reply
  in words (its opening sentence plain, not a headline), the question in larger serif, then Copy, Reply, Retry,
  Listen. It is the one part of the space that is a conversation; pressing the question puts the cursor in the
  chatbox. With no idea open yet, the bubble stands alone.
- **The open idea holds the idea and what was made for it**: its glyph and statement, then the open turn's visual
  drawn large (the comparison, the diagram, the steps), pressed to open beside the space. The bubble then keeps to
  words.
- **Less to read**: no "Answering" chip and no "Answer below"; no "YOU" quote; cards say what they are by glyph and
  colour, with no kind words or turn tags; lines carry no words; no hint text in the row.

### 8.5 Revision VI — every one of Socria's replies

- **The stack**: when there are replies before the open one, they sit as two paper edges under Socria's bubble, and
  its head counts them ("2 earlier replies ↑").
- **The thread**: pressing the count opens every reply in order, as a column beside the space on a wide screen
  (`.ls-thread`, 440px; the space and the chatbox keep to its left) and as a sheet pulled up over the space on a
  phone, with Done. Your words sit as grey bubbles; each reply is signed Socria, says what it said and the question
  it ended on (`threadWords`, `lib/logos5/ideas.ts`), and lists the ideas it lit and what it made, each pressable.
  It opens at the newest reply; Esc puts it away.
- **Hover lights what it made**: a reply hovered or focused outlines on the canvas the ideas, made things and files
  from that turn. Pressing a reply opens the first idea it lit.

### 8.6 Split View is gone

- The **Split View** button and its menu are removed from the header and from the view's own actions, with its
  tutorial in What Socria does and its feature tip. Things still open beside the space by being pressed (a made
  thing, the Logic Map, a file), and the words "put the Logic Map beside" still work.

### 8.7 The adaptive explanation engine

Not only what to explain, but how to make it understood (`lib/runtime/explain.ts`, test/explain-engine.test.mjs).
Pure, no model call, invisible: no mode, no badge, no setting. `LOGOS_EXPLAIN=off` takes it out.

- **Twenty strategies, each a behaviour.** Essential Insight, Analogy, Comparative, Worked Example, Faded
  Guidance, Segmented, Concept Pretraining, Visual-Verbal, Concept Mapping, Causal, Misconception Correction,
  Error-Based, Elaborative Interrogation, Self-Explanation, Retrieval Practice, Spaced Reinforcement, Interleaved,
  Teach-Back, Argument Mapping, Decision Tradeoffs. Each carries out its work in three ways:
  - **an element** the presentation planner already draws: compare, decide, steps, diagram, concepts, claim, paths
    for the next segments, check for mixed practice;
  - **a question** within the turn's budget;
  - **one short line** the reply follows, said as what to do and never named.
- **Selection** is read in code:
  - **what they asked**: why, how it works, what it is, which, should I, is it true, solve, relate, practise;
  - **how much they know**: their words, their mistakes, what they got right, the ledger;
  - **how complex it is**: terms, parts, length;
  - **how the last reply landed**: lost after an analogy gets an example or a picture, not another analogy; a slip
    gets the error located; "I get it now" gets a teach-back.
- **Combination**: one primary strategy and at most three in all, one question, never two of a kind. An expert gets
  one strategy; a newcomer on something complex gets three.
- **Restraint**: a hello, a fact, "just tell me", a hurry, an expert's one-liner, a thing to build. Then nothing is
  forced and nothing is added to the prompt. Most turns add no tokens; the most any turn adds is a few lines.
- **Continuity**: a learning ledger in the browser (`lib/logos5/learning.ts`, `socria.learning.v1`) holds topics,
  when last met and a Leitner box (1, 3, 7, 16, 35 days). It is sent with each turn and noted after a learning turn
  (`X-Socria-Learn`), moved by how their checks went. A topic met before is recalled before it is retaught; what is
  due comes back once, in the practice. It is never read on a sensitive or off-the-record turn or in a room of two,
  and never stored on the server.
- **Did the reply do it**: `checkExplanation` reads a reply for each strategy, for the evals and the tests.
  `X-Socria-Explain` carries content-free strategy codes.

### 8.8 Paper, consistency and broken controls

- **Paper**: the ground is light paper again. Revision II's grain was drawn at .18 and doubled on the Universal Map,
  which turned the cream into a darker, greyer card. It is now .055, drawn once.
- **Made things in Everything**: each is drawn to fit its card, laid out at a reading width and scaled down so a
  table or comparison shows whole, with a fade when tall. Pressed, it opens large over the space (`.ls-lb`) to
  explore, with "Work with it beside the space". Choosing Made or Brought in the row scrolls the canvas to them.
- **Controls that changed a screen nobody saw**: in the one space the old views are not drawn, so `setStudyTab`,
  `showArtifact` and `openStudio` now open the thing beside the space. This fixes More → Write, "Show these on the
  map", "Open ‹thing›" in a reply, citations, and the studio. Typed or spoken "put X beside" and "close" act on what
  is beside the space; a message jumped to, or a search hit, opens its idea; on the Universal Map the menu no longer
  offers to save or move a map that is not on screen; the account sheet opens Memory in the app, and "Take the tour
  again" falls back to the tutorials where the tour has nothing to point at.
- **One look**: the Universal Map's header says More and shows the search shortcut, as a line's does; Stop and the
  Content links use the shared `l5-link`; every control has the same moss focus ring; the guide no longer says "⋯".

### 8.9 Live guidance — shown on the camera, not just told

A person points their camera at something, asks ("How do I open this jar?") by typing or holding the mic, and
Socria draws the answer on the live picture: highlights and labels on the things that matter, the movement to make
(a twist, a lift, a press), a small model turning the right way, and the steps at a glance. It watches for each step
being done and changes the instruction when it is not. In early access with AR Mode (More → Live guidance, or the
button in AR Mode); anybody else sees a preview and the waitlist.

- **The pipeline.** Camera (`components/logos5/LiveGuide.tsx`, the back camera by default; hand tracking is stopped
  so only one thing holds a camera) → one still frame, 512px at most, sent only when the person asks →
  `POST /api/logos/guide` (`mode: plan`) reads it at low detail into a plan: the objects that matter, with boxes,
  and two to six steps, each with one to three overlays aimed at those objects → the plan is held to
  `lib/guide/overlay.ts` (only known overlay kinds, motions and models; boxes brought into the frame, in fractions,
  percent or thousandths; an overlay aimed at an object it did not see is dropped; at most 6 objects, 8 steps,
  4 overlays a step) → drawn as SVG over the video (`placeOverlays` in `lib/guide/session.ts`) → Done, or a pause in
  movement after the picture changed, sends one smaller look (`mode: check`) carrying only the step, what done looks
  like and the objects' names → done moves on; not yet keeps the step and says it more clearly, with what Socria saw.
  No image is generated for any frame: the drawing is the plan's instructions, so it moves with the picture.
- **Overlays stay on their objects.** Between looks the browser follows each object itself
  (`lib/guide/tracking.ts`), on a 160-pixel greyscale copy, a dozen times a second, with nothing sent. Each object
  is placed on a frame (the one the model read, the one a check read, or the one showing when the person dragged it)
  and moves with the camera, measured on the whole middle of the picture against that frame, then is fine-tuned by a
  few pixels against its own patch. So a hand moving over a plain lid cannot drag the lid's box after it, and errors
  cannot pile up from frame to frame. Each pixel's difference is capped, so a small part that changes a lot (a hand,
  a glint) cannot outweigh the rest. An object moved by itself is looked for near where it was last seen, but only
  if it has texture across it and only on a clean match. When none of that holds, its overlay is not drawn on a
  guess: after a moment it becomes a note at the edge ("Point the camera at the lid"), and the movement to make is
  drawn in the step card instead, as the small model or the motion with its words ("Twist the lid anticlockwise").
- **Pause, replay, dismiss, adjust.** Pause holds the animations and the automatic checks; Replay plays the step's
  cues again; Hide and Show the overlays; ← and → step; Adjust gives every object a handle to drag to where it really
  is, and a box put there by hand is believed over any later reading. Space, the arrows and Esc do the same.
- **Honest about what it sees.** An object read with low confidence is drawn dashed and labelled "I think this is
  the …", with "Is the dashed box the lid? Yes · No — let me move it". The plan's own doubt is said in the card
  ("I'm not sure: …"). A check that cannot tell says so and asks to be shown more clearly; it never guesses done.
- **Safety first, in code.** The question is read for danger before any frame is taken (`lib/guide/safety.ts`): an
  emergency (not breathing, choking, heavy bleeding, fire, a gas smell, a shock, a person collapsed or in danger) is
  answered at once with the number to call and the few steps that are safe whatever the details — no model is asked
  and nothing is drawn. A job that should not be learned from a guide (mains wiring, a gas appliance, brakes or other
  safety-critical repairs) is a stop with who to call. Knives, saws, ladders, heat and chemicals are a caution, said
  first. The model's own reading can make it stricter, never looser, and a check that sees danger stops the guidance.
- **Private.** The camera is on only while Live guidance is open and stops on Close and on leaving; a hidden page
  pauses the guidance and sends nothing; the microphone is used only while the mic is held. A frame is read and dropped: never stored, logged or kept in
  the conversation; errors are logged without the frame or the question. The consent screen says all this, and that
  it is not for emergencies, before the camera is asked for.
- **Cheap.** A plan is one low-detail call (about 800 tokens out at most) and counts as one image read, like any
  photo; a check is one smaller call (260 out) and is not counted as an image. Automatic checks are rationed: at most
  two a step, six seconds apart, only after the picture changed and settled; four checks a step in all.
- **Kept.** When the task is done, "Keep these steps" adds them to the line of thinking as a steps sequence (a new
  line named for the task if none is open), so the Logic Map and Artifacts have them like any other turn.
- **How it looks: by hand.** The marks on the picture are drawn the way a friend marks up a photo
  (`components/logos5/GuideDrawings.tsx`, paths from `lib/guide/sketch.ts`): a loop round the thing that tilts a
  little and runs past where it began, an arrow that bows with a head of two strokes, the way round as an arc of the
  lid, a word on a paper tag a little askew in italic serif, joined to its thing by a curved line. Marigold ink over
  a dark edge so it reads on any picture, drawn on as you watch; a guess is dashed and says "I think this is the
  lid?". Every wobble is seeded by its object, so a loop keeps its shape as the camera moves. A "model" is a small
  sketch card beside the thing — a jar and a hand turning its lid, a finger on a button, a plug pulled, a lever
  pressed — in the manner of a good instruction sheet, and the same sketch is drawn in the card when the picture
  cannot show the movement.
- **The card.** Beside the picture on a desk, under it on a phone: signed Socria in italic moss, the steps as a short
  list (done ones ticked, with what Socria saw when it checked; the current one large in Instrument Serif; the rest
  waiting), "What I see" when a step is not done yet, and one filled control, "I’ve done it". Replay, pause, adjust
  and hide are quiet icons by the signature. Asking has a field with the mic and a round send button, three ideas to
  start from, and on a desk how it works in three lines. The camera bar says how many frames have been sent, and a
  soft flash marks each one leaving the device. An emergency card offers to call only the numbers its own words name.
  The sheet keeps to Logos 5's six type sizes and four corners, and `test/logos5-system.test.mjs` now holds it to them.

## 9. The Logic Map draws almost anything

The Logic Map was a picture of the person's reasoning and nothing else: its
extractor was told "the map tracks this conversation, not the subject", a
concept map of the subject was refused, diagram requests went to Artifacts,
and sixteen cards were the most any map held. It keeps its name and its
analysis, and now draws the subject too.

- **One map, two kinds of thing** (`lib/logos.ts` `mapInstructions`). The
  person's thinking — questions, claims, evidence, assumptions, values,
  decisions, doubts, how they relate — is analysed exactly as before. Beside
  it the map can hold **a drawing of the subject**: every part of it
  `"origin": "drawn"`, a `title` ("The water cycle"), and `building.kind` for
  its shape. The two are never merged: their question `applies_to` the part
  it is about.
- **What a drawing can say.** New kinds of thing (entity, process, event,
  state, actor, component, category, quantity) and of connection (causes,
  inhibits, is a kind of, flows to, becomes); words along a line (`label`);
  when a part comes (`at`: "1789", "Stage 2"); the region it sits in
  (`group`); what it says when opened (`detail`). A drawing holds 24 parts
  and 36 lines; nothing else grows. Labels on a drawing are 1–4 words; the
  rest goes in `detail`.
- **Five new shapes** (`lib/representation.ts`): cycle, hierarchy, concept
  map, cause and effect, parts, each with its roles, what it is called ("as a
  fishbone", "into a family tree") and how it is satisfied.
- **When it draws.** Asked for, always: a flowchart, a cycle, a hierarchy or
  org chart, a family tree, a concept map, a cause-and-effect or fishbone
  diagram, a labelled diagram, a block or system diagram, "draw the water
  cycle", "diagram how vaccines work" open the Logic Map
  (`lib/runtime/orchestrate.ts` `diagramAsked`), and the map pass is told the
  shape asked for. A request to draw begins the message or a sentence in it
  ("I have a test tomorrow. Draw the water cycle."); "what lessons can I
  draw from the hiring process?" is a question. "Show me the carbon cycle"
  asks to see the subject, not to open the map: it is answered like
  "explain the carbon cycle". Unasked, when a question's subject has a shape — "explain
  the water cycle", "what caused World War I?", "how is Parliament
  structured?", "the stages of mitosis", "a timeline of the French
  Revolution" — it stays a question in the conversation (the reply draws its
  own small diagram) and the map draws the subject **in the background**
  (`drawable`, `needsMap` `draw`), never opening a view — for Socria One and
  a guest; a signed-in free account's week of tokens is not spent on a pass
  nobody asked for, so there the reply's diagram waits for **Open on the
  Logic Map**, which needs no model; the server holds the same line, so
  the map pass is never told to draw unasked for a free account. A person's
  own story, one event or a body failing is never drawn. A chart, a graph or
  a plot ("a bar chart of the causes of death", "a graph of the cycle of
  sin x"), a picture of forces, a field, a circuit or a function, a Venn
  diagram, and anything made from the Make list ("Make a flowchart: …") are
  still made in Artifacts, and never drawn on the map in the background.
- **Six lenses for a drawing** (`lib/logos5/diagramLayout.ts`): **Cycle**
  (the stages round a ring, the last arc back to the first), **Tree** (a
  tidy tree, parents over their children), **Parts** (each whole a region
  with its parts inside), **Concepts** (the most connected idea at the
  centre, every line labelled in words), a **dated Timeline** (events on an
  axis spaced by when they happened, dots on the axis) and the **Flow** lens
  upgraded (a pill where it starts or ends, a marked corner where it
  divides, the condition or the words on each line). A drawing's cards are
  words only; its kind is in the inspector. Its own lens leads and is first
  among the tabs; the graph shows its line words too.
- **Inspect and edit** (`components/logos5/MapInspector.tsx`). A pressed
  card says whose it is ("Drawn by Socria · a process"), what it says opened
  and its lines; **Edit** changes its name, kind, detail, time, region and
  the words and kind of each of its lines — deterministic edits
  (`lib/map-edit.ts`: retype, detail, at, group, edge, title, drawing), one
  change for Undo. A part taken off stays off. Each line in the form is the
  line it shows: two lines between the same cards, or one each way, are
  edited apart. The kinds offered are only those a save keeps (on a
  mathematical map, the person's own cards are not offered "process" or
  "quantity", which it reads as a concept and a given).
- **With Artifacts and the conversation** (`lib/logos5/drawing.ts`). **Keep
  in Artifacts**, beside the drawing's title, files it as a Diagram display
  (once; pressed again it opens). **Open on the Logic Map**, under a reply's
  cycle, tree, flow or causes diagram, puts it on the map as a drawing (the
  one before gives way; the person's thinking is untouched) and opens it
  beside the board. The board's pinned card is named by the drawing ("Logic
  Map · The water cycle"); the key at the map's foot drops the reasoning
  lines when only a drawing is drawn.
- **Kept as it was.** Every map saved before reads back exactly as it was
  (`test/fixtures/legacy-maps.json`, sixteen maps saved by the old
  sanitizer); a mathematical map still reads "quantity" as a given and
  "process" as a concept on the person's own cards (a drawing's parts are
  what they say they are); a drawing's shapes are named only by asking for
  one ("show this as a cycle"), so "it's round" or "this is an outline for
  my essay" reshapes nothing; "stage" and "part" keep their old meanings outside
  a cycle or a breakdown; a map holding a drawing is never rewired whole by
  the shape repair. AR Mode has words for every new connection.
- **The free plan.** Nothing changes in what is counted: a drawing's parts
  are Logic Map nodes like any others, by the map pass or by "Open on the
  Logic Map", and Keep counts as an artifact. When the month's nodes cannot
  hold a whole drawing, the person's own new ideas are kept first and the
  drawing is kept whole or not at all — never half a drawing, never charged
  for a part not kept (`lib/quota-map.ts` `keepAddedNodes`). What is kept is
  planned before a first map is claimed, so a pass that would leave a
  conversation's map empty takes none of the month's maps; a drawing left
  off says so ("This drawing needs 4 Logic Map nodes and only 1 Logic Map
  node is left this month…") and takes its title with it. **Open on the
  Logic Map** asks for the nodes first and changes the map only once they
  are granted, so a drawing the month cannot hold leaves the map exactly as
  it was.

The name chip in the header now opens account settings directly; Memory has
its own glyph beside it.

## 10. Not finished

- **Readings seen once** are not on the map: they live in the pending ledger,
  which the Logos memory feed deliberately does not send. "Waiting" on the map
  is a memory held tentatively. Showing the ledger needs a server change.
- A corroborated reading keeps only the second conversation's id, so it hangs
  off that one; files added on the Memory page or a Project sheet name no
  conversation, so their memories appear once they come up in one.
- This month and All time draw no memory, as the handoff says for this pass.
- On a phone the desk is not drawn: Artifacts stays one at a time.
- **One view on a phone** was not drawn in the handoff; §8.1 draws it as
  panels. The zoomed-out canvas is no longer reached from a line of thinking
  (the Universal Map is the level above it). A shared room (others thinking
  together) keeps the conversation as it was.
- **Revision II, not yet everywhere.** The one view, the header, the
  chatbox, the controls and the Universal Map's chrome are Revision II.
  Screens 1, 2 and 4 (the Logic Map docked, the ask card, Study) and the
  Memory layer take the new controls through the shared sheet but were not
  rebuilt to their Revision II specs; the inline elements inside replies
  (charts, tables, steps) keep their own rounded frames. The live-graph cell
  shows the reply's graph, not the handoff's rectangles drawing, and Split
  view uses the existing panel beside (its share of the width, not a fixed
  520). The model picker was already gone; the length control (Balanced)
  stays in the chatbox foot. Memory's gold waiting count is wired to the
  word but not yet fed a number.
- What was made outside any turn (a model, the writing, a kept artifact)
  sits in Brought and made with no "Turn n"; a display has no record of the
  turn that asked for it.
- The phone sheet, and the White, Dark and Celestial themes, use the same
  tokens and were not drawn separately in the handoff; they were checked only
  where the browser runs below went.
- **The Logic Map's drawings.** One drawing per map: a second subject
  replaces the first (Undo brings it back). On a phone the camera centres a
  drawing without allowing for the floating composer, so its lowest part can
  sit under it until the map is moved. A concept map of a pure chain is one
  long column (the Flow lens draws it better), and a very dense concept map
  can run a line behind a card. Keep in Artifacts files the drawing but does
  not open it beside the board. The map pass draws only what the model
  writes: the drawings in the browser runs below came from the local
  stand-in model, not a live one. On the free plan, if two map passes for
  one account race for its last nodes, the second keeps exactly what it was
  granted, which can be part of a drawing: the allowance has no way to give
  a node back.
- **Live guidance** (§8.9) has been run in a browser only against Chromium's
  test camera and the local stand-in model, never a real camera and a live
  vision model; how well a real model places boxes is not yet measured. The
  tracker follows camera moves and small object moves; it does not follow
  turning or moving much nearer (the overlay falls back instead), and a
  steady hand on a plain lid can still pull a box by up to the few-pixel
  fine-tune. Voice is the push-to-talk transcription; there is no spoken
  reply. Real 3D models are not drawn: the "model" overlay is a hand-drawn
  sketch (a jar, a bottle, a knob, a lever, a plug and a few movements),
  animated; things it has no sketch for fall back to the nearest one.

## 11. How it is held

- `test/logos5-system.test.mjs` reads the sources: the old sheets gone and
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
- `test/logic-map-universal.test.mjs`: the new kinds, connections and
  fields; every old map read back unchanged; the caps; the five shapes;
  diagram requests routed (and pictures, the Make list and conversation not
  moved); the background drawing and the map pass's instructions; every edit;
  the free plan's whole-or-nothing rule; AR words and lenses; a drawing
  between a reply, the map and Artifacts.
- `test/logos5-diagram-layout.test.mjs`: the cycle, tree, parts, concept and
  dated-timeline lenses — no overlaps, nothing lost, every line once, the
  same picture every time, on 160 seeded maps per lens and the odd ones.
- `test/live-guide.test.mjs` (105): overlays checked before they are drawn;
  danger read from the words; tracking — a moved object found, a blank wall
  not pretended, a pan followed through a flickering patch, a slow pan, a
  hand over a plain lid not chased, a picture whose only detail keeps
  changing not taken for a camera move; the session (ask, guide, check,
  adapt, pause, replay, dismiss, adjust, rationed checks); drawing (anchored,
  dashed when unsure, a note at the edge when lost); the hand-drawn marks
  (the same every frame, moved with their object, a loop round the thing,
  arrows and turns pointing the right way); cost and privacy.
  `test/guide-route.test.mjs` (42): the route through its real handler —
  signed out, not a tester, an unverified address, the access code without
  an account, a forged grant; an emergency and mains wiring answered with no
  model asked; frames refused (none, a link, an SVG, too big); a plan shaped,
  an overlay at nothing dropped, counted as one image read, low detail, no
  reasoning spent; the model's stop and the words' caution both holding;
  checks done, not yet, could not tell, danger; images spent.
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
  (`.journeys/l55-board.mjs`); the Logic Map drawing a water cycle (asked
  for, inspected, edited, kept in Artifacts, seen as Graph and Flow), how a
  bill becomes law, the types of rock, photosynthesis, a plant cell and the
  space race, and a reply's diagram opened on the map, at 1440 and on a
  phone (`.journeys/lm-diagrams.mjs`, `.journeys/lm-phone.mjs`); Live
  guidance with Chromium's test camera — consent, the camera, a plan drawn,
  Done, not yet, Pause, Hide, Adjust, the last step, Keep these steps; an
  emergency with no frame sent and the camera released on Close; a phone
  (`.journeys/live-guide.mjs`, `.journeys/lg-adjust.mjs`).
