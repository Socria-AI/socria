# Logos 5 — one workspace, conversation first

Logos 5 rebuilds the Logos surface's frontend. The model entry, the
routes, the map pass, the displays, documents, memory and every saved
conversation are the same; what a person sees and touches is new.

The direction in one line: **a calm conversation that grows a workspace
beside it when there is something to show — never a graph forced onto a
chat.**

And for studying: **drop your files, say what for, and Socria sorts them into
topics in their own words, makes practice from them when asked, and checks
it — with the conversation and its Logic Map one step away.** Every line of
thinking is also on one map — and that map is home: the **Universal Map**,
every past conversation as a node (a major session a hub, a quick question
an ambient dot), grouped as today's learning, by week or by subject, with the
old list of chats put away. On the **Night** theme it is a night sky.

The redesign (§6–7) turns the line of thinking around: **the map is the
screen.** Components, Artifacts and the Logic Map are three views of one line
of thinking, switched in the header; the conversation folds away to a
composer floating over the map, and a card is asked about where it is. What
Socria remembers has a place of its own, drawn as a mind: the **Mind Graph**.

## 1. What was wrong with Logos 4's screen

Measured on dev before the rebuild (390×844 and 1440×900):

| Problem | Where |
|---|---|
| The conversation was a one-line "peek" under the map. Reading a reply meant unfolding a dock. | `ws-dock`, LogosApp `wsDock` |
| Every turn put the map first, even "I have two job offers…", whose map was two awkward cards ("User: I have two job offers…"). | the default layout |
| Two rows of tabs (surfaces, then lenses) and a toolbar of five controls before anyone had said anything. | `Workspace` head, `lg-tools` |
| The free-plan meter took a full row on every screen, always. | `.lg-allow` |
| A reply streamed as one flat line and only became formatted when it finished. | `SocriaPending` → `Inline` |
| No way to stop an answer, retry it, or edit what was sent. | — |
| Nothing connected a card on the map to the turn it came from, or a turn to the cards it made. | — |
| On a phone, an empty map filled the screen; the composer sat under it. | narrow `Workspace` |

## 2. The model

*The line of thinking described here — thread first, the stage beside it — is
how Logos 5 first shipped. The redesign in §6 makes the map the screen; the
thread, the composer and every turn's actions are the same pieces.*

**Three regions, shown only when they have something to hold.**

1. **The thread** — always there. Editorial: Socria's words in a readable
   measure, the person's in quiet cards. Formatting while it streams. Stop,
   retry, edit, copy, reply on every turn that can have them.
2. **The stage** — the workspace: the Thinking Map, displays (charts, plans,
   comparisons…), documents, models, 3D. It is the existing workspace
   machinery (`Workspace`, `renderPanel`, every panel), drawn without the old
   dock and header. Closed by default; opened by the person, by asking for it
   ("show the map", "open the chart"), or by something being *made* — a
   display, a document, a model. A map that grows from ordinary talk does not
   open it: the header's **Map · N** says it is there.
3. **The rail** — put away in Logos 5 (§5): home is the Universal Map, and the
   rail is under the menu's "Manage conversations". Lines of thinking and
   projects (`LogosRail`), a drawer on narrow screens.

**Progressive disclosure, specifically:**
- The meter appears only near a limit (≤ 3 left) or at it.
- Model, depth, attach and capture live inside the composer's own footer.
- Synthesize, Draft, Save as image, the guide and the style sheet live in one
  "More" menu; Synthesize also sits on the stage, where the map is.
- Message actions appear on hover/focus, are always visible on touch and on
  the latest reply.

## 3. Chat drives the workspace, the workspace answers back

- **Commands** — the deterministic readers already in `send()` (map edits,
  view and interface requests, display requests, scene descriptions) now
  also open the stage on what they changed.
- **Effects in the thread** — under a reply, what the turn did to the
  workspace: "＋3 on the map", "Chart · Expenses". Hover lights those cards on
  the map; press opens the stage on them.
- **Selection lights the thread** — select a card on the map and the messages
  it came from are marked in the thread, with a chip to step between them.
- **Point & Ask** — any selection (card, bar, cell, passage, expression)
  rides on the composer as "Asking about …", as in Logos 4.

### How a card knows its messages (no new stored field)

`map.history` records every change with its time and cause (`lib/map-history.ts`).
A `turn` change happens after the reply to the person's last message, so the
cards it added belong to the latest user message at or before the change.
For cards older than the 30 kept changes, a word-overlap match against the
person's own messages stands in, and only above a threshold. Pure, tested:
`lib/logos5/linking.ts`. Nothing is added to the saved message or session
shape, so every existing conversation reads exactly as before.

## 4. Study: files into topics, practice, and the Logic Map on request

A study is begun from the Universal Map's box (§5) — there is no start
screen any more: notes, slides or an exam review are dropped on the box (or
anywhere on the map) or added with its clip, read in the browser and shown
as chips, and sent with ↑, with a line to say what for if there is one. What
they are for is read from those words and the files (`intentOf`). The map
says "Sorting your files into topics…" until the board is there; with only
words, ↑ starts the conversation exactly as before.

| Screen | What it holds |
|---|---|
| **1 Components** | The files as topics on a board — foundations left, what builds on them to the right, linked. Each card: its kind, a title, the files' own sentence, where it is (◇ Ch5 · p.2), how many passages back it, and **Recommended start** on one. Under the board: "Socria · sorted 3 files into 7 topics — Where do you want to start?", with **Study & review**, **Deep analysis** and **Recommend for me**. Pressing a topic dims the rest and opens it: every quote with its file and page (pressing one opens the passage), and **Practice this · Explain it simply · Challenge me · Ask why → Logic Map**. |
| **2 Practice** | Made when asked. Bookkeeping becomes a journal-entry table (Event · Account · Debit · Credit) with the files' numbers, a hint per event that never names the answer, and the accounting equation to complete. Anything else becomes fill-in-the-blank cut from the files' own sentences. **Check my answers**: each line ✓ or ✗, the score, "Debits equal credits", "The equation holds", and each gap with the whole entry, why, and its page; then **Try 3 more like these** or **Why? → Logic Map**. |
| **3 Logic Map** | The conversation and its Thinking Map — the Logos 5 screen above. "On request": a question asked anywhere, Explain, Challenge, Ask why, or Deep analysis goes here, with the topic riding along as Point & Ask. |

**What is promised, and where it is kept (`lib/logos5/study.ts`):**
- *Every quote is the file's own words, with its page.* The model only
  points at passages by key (`1:p3.12`); the words shown are cut from the
  passage. A quote the passage does not hold is replaced by the passage's own
  nearest sentence; a topic nothing in the files backs is dropped.
- *Nothing is generated until you ask.* Sorting is one call
  (`/api/logos/organize`); practice is made on "Practice this"
  (`/api/logos/practice`, journal entries only — fill-in-the-blank needs no
  model).
- *Your numbers.* An event is kept only when every number in it is in the
  passage it cites; an entry only when its debits equal its credits and its
  amounts are the passage's (or one step of arithmetic on two of them — a
  month of six months' rent).
- *Checked when you submit.* Exact, in the browser: account names folded
  (salaries ≈ wages, A/R ≈ accounts receivable), lines matched by account in
  either order, an amount right only on the right side. A check is never
  trusted from storage — it is worked out again from the answers.
- When no model answers, the files are sorted by their own headings, and
  the board says so; when journal entries cannot be made, the topic's own
  sentences become fill-in-the-blank, and the page says so.

**Kept with the line of thinking.** The whole study — topics, quotes,
practice, what was typed, what was checked — is one display in the map
(`lib/objects/display-study.ts`, kind `study`, internal, two states), so it
saves, syncs and shares like any display and every older conversation keeps
its shape. The organizing turn is written into the conversation (your words
and files, then what Socria did), so the documents belong to it and every
later question carries them. The reply model is told the topics, and never
the answers to practice not yet submitted.

## 5. Home: the Universal Map

Logos 5 opens on the **Universal Map**. Its shape follows the PRD "Clearer
Structures and UI" (Workspace Navigation & History): instead of hiding past
conversations in a sidebar list, every past study session is on one spatial
map —

- past topics are **visual nodes**, grouped intuitively — by subject, for
  **Today** and **This week**, and in order for **This month** and **All
  time**;
- **major study sessions are larger "Hubs"**, while **quick one-off
  questions stay smaller ambient dots**;
- it shows **how topics connect across courses over time**.

And the PRD's rules for the whole app hold here: **zero mandatory homework**
(nothing has to be filed or categorised to be placed — everything is
organised passively first), and **shape consistency** (a conversation is
always a round node; the Logic Map keeps its squares, hexagons, spiky nodes
and rhombuses for what is inside one).

The earlier versions — one force-laid-out mind map, then Project frames of
cards with Columns and a Timeline — are replaced. What the person arranged in
them still reads (below).

**The page** ("Your map, not a list", the person's own design): "Everything
you've studied" and **Your map, *not a list*** at the top left, with which day
or week it is and where to pick up under it; the four lenses at the top right,
set in the serif, the one chosen on a dark pill that slides to it, with the
map's few tools under them; at the foot, what the marks mean on the left and
**the box that searches or starts** on the right. The header keeps the Socria
mark, the count, List and the account — the box is no longer in it.

**On the map** (Today and This week — `lib/logos5/bubbles.ts`,
`components/logos5/UniverseBubbles.tsx`; who counts as what is
`lib/logos5/spatial.ts`):
- **Each subject is a large dashed circle**, named round its upper edge in
  letter-spaced capitals — its field and its own name, "ACCOUNTING · ACCT
  2301", or the name alone when that says it ("MATHEMATICS", "EVERYTHING
  ELSE").
- **A real study session is a disc** in its subject's colour (a shade deeper,
  so the white name inside it reads), its name set inside it in the serif and,
  under that, when — "today", "yesterday", "Tue", "last week", "Oct 5" — and,
  when the disc is large enough, what it holds: "today · 3 files · 7 topics".
  A session is a study, something made in it, three turns or more, or a map
  that grew. The more it holds, the larger (View can make it how recent it is,
  or all alike); one of the day's, and the one to pick up, is never small. The
  first of a subject is in its colour, the others a shade lighter. Each
  touches the session closest to it in time, joined to it by a short line.
- **A quick one-off question is a dot** on a spoke from the session of its
  subject nearest it in time, its words beside it on the side away from the
  rest of the map. Where there is no room for its words they are there when it
  is pointed at. A Core chat this surface does not hold — signed out, where the
  two histories are kept apart — is known only by its name and is a ringed
  dot; signed in, a Core chat is a conversation here like any other (below).
- **Where to pick up wears a pale halo.** A gold **?** marks a question Socria
  asked that is waiting; a star, a starred one.
- **What joins two subjects is a dashed curve** from one session to the other,
  and the one that matters most says why on a card at the top of its arc: a
  link the person drew first — **"You linked these"**, in their words (the
  pencil on the card writes them, the × takes the link away) — then an idea
  both come back to: **"One idea, two subjects** — Accounting and Economics both
  come back to *present value*." Each card says when the two were opened.
  Pressing another curve brings its card.
- **Your Projects are always on it**, whichever lens: a Project with
  conversations here is a circle drawn as yours — a solid ring in its own
  colour, its colour's dot before its name and "Project" after it; one with
  nothing here is folded under the rest, its name, how many it holds and a few
  dots, and pressed it opens with its newest; an empty one says "Empty — drag
  one here". They come first in the folded rows, in your order, and **+ New
  project** waits at the end: pressed, it asks for a name; with conversations
  dropped on it, it makes the Project with them in it. An archived Project is
  not drawn.
- The circles are packed side by side, wider than tall; on a phone one under
  another, read from the top. Nothing sits on anything: no two discs touch, no
  dot or words are on a disc, no two words cross, everything of a subject is
  inside its circle, and the card sits clear of all of it.
- Nothing is made up. A line of thinking with nothing in it is not drawn.

**How much of it: Today · This week · This month · All time.** The two
short stretches are a map — what joins up and what stands alone. The two long
ones are a line through time, the oldest on the left and the newest on the
right, where something half-remembered is found by scrolling back towards the
left ("In order", below). Pressing the lens shown again fits the map, or goes
back to today on the line.

**Today** — the day's sessions, haloed where to pick up (before anything
today, the last day something was: "Nothing yet today · last worked on Tue Oct
20"), and **the earlier conversations they build on**: one the person linked
to one of the day's first, then an idea in common, then the same subject or
Project — each in its subject's circle, its reason said when it is pointed at
("shares 'Accrual basis'", "you linked these"); round each subject drawn, its
quick questions of the last three weeks. **Up to three other subjects worked
on in the last three weeks are folded** under the rest — their name, an arrow
and a few dots ("BIOLOGY · BIOL 1306 →"); pressed, one opens with its newest
few, and Fold puts it back. Nothing older is drawn: the rest is in This week
and in order. (It used to be drawn round the day as a field with a sector to
each subject, which on a real history was the whole history again under a
dozen subjects' names.)

**This week** — the week's conversations by subject: what was worked on this
week; ‹ and › under the page's name step to the weeks before, which show what
began in them, and "Back to this week" returns.
- **Projects** are subjects in their own colour (the one Project Home shows).
- **The subjects read from the conversations** (`lib/logos5/subjects.ts`)
  — no filing needed. The surest reading wins: the course a study was sorted
  under ("ACCT 2301 · Exam 2"); a course code in a conversation's name, first
  question or topic; the field Socria's map named while it thought
  (`map.ask.domain`); the kind of picture it drew (supply and demand is
  economics); its words against a short list of fields. A field with exactly
  one course in it joins that course. A name the map gives that is a field
  here already by another name is that field (Astrophysics is Physics,
  Econometrics Statistics, AI or UX design Computer science, Journalism
  Writing); a vague one ("General", "Personal decision-making", "Education")
  makes no subject of its own — the conversation's words decide.
- **A conversation about a Project's subject but not filed in it** is shown in
  that Project and counted by its name in "+ 1 about it · File it" — never
  filed without the person.
- **Everything else**: what nothing places clearly, and a lone quick question
  (one dot is not a subject yet). Never a wrong subject because one had to be
  chosen.
- **↩ and a date** by a subject's name: the last of that subject before the
  week. Pressed, All time opens there, and lights it.
- A subject folded by the person stays folded, saying how many it holds.

**Each lens comes in drawn.** Switching, the pill slides to the lens; on the
map the circles open, the sessions rise into place a few at a time, the joins
and spokes are drawn out to what they hang from, the quick questions settle
with their words, the curves across subjects are drawn along, and the card
arrives last; on the line the newest rise first, back from today, and each
thread is drawn along. Another week comes in the same way. With reduced
motion asked for, everything is simply there.

**In order: This month and All time** (`lib/logos5/timeline.ts`,
`components/logos5/UniverseTime.tsx`) — the long stretches as a line through
time, so a conversation is remembered by roughly when it was.
- **Each stays where it began.** A conversation is placed at its first
  message and never moves; opening it again does not carry it to the end.
  Under its name, as everywhere, is when it was last worked on.
- **What followed on is joined.** Conversations about the same subject (a
  Project, or the course or field read from them), each begun within a week of
  the one before, are one thread — beads on a line, named at its start, the
  name held at the left edge while the thread runs on past it.
- **Recent and old stay apart.** After a longer gap a subject starts a new
  thread; no line is drawn across the gap. Before it, **↩ and a date** — the
  last of that subject before it: pressed, the line goes there and lights it.
- **Quick questions** on their own sit along the floor, under the threads.
- **Rows that stay put.** Lanes are worked out over the whole history, in
  order, so nothing that came before is moved by what comes after, and a
  subject keeps to the row it had when that row is free.
- **Quiet stretches folded.** More than two weeks with nothing begun is
  folded down to one mark that names the dates.
- **Names never sit on each other**: under a star, over it, or only on its
  card — given out by what matters most, a long conversation before a quick
  one and then the one worked on last, so what was being done today is named.
- **Getting along it.** It opens at today. Trackpad, finger, wheel and arrow
  keys move it; so does dragging the empty line; "‹ Earlier 21" and "Later ·
  Today →" go a screen at a time and back to today. The whole history is a bar
  at the foot — every conversation a tick in its colour, the window looked
  through — that can be dragged or pressed. Weeks and months are marked over
  it, this week is shaded, and now is a line.
- **Searching** lights what was found (the rest dims, the bar marks it in
  gold) and brings the newest of it into view.
- **Its card** has "See that week as a map"; a card on the map has "Find it
  in time".
- **This month** is the same line from the first: what began this month.

Today is the default; the lens chosen is remembered.

**Arranging** (on the map; `lib/logos5/arrange.ts`):
- **Drag a conversation into another subject's circle** (on a touch screen,
  hold it a moment first) and it is given that subject (kept with the
  arrangement; "Its own subject" on its card gives it back) — **into a
  Project's**, folded or empty ones too, it is filed there; onto **+ New
  project**, a Project is made with it in it.
- Pointed at, a subject's name offers **Fold** (This week; on Today, a subject
  opened from folded), and for a subject read from the conversations, **Make
  it a Project** (made, with them filed in it, in one undoable step). A
  Project's dot changes its colour and a double-click renames it — both the
  Project's own.
- **Shift-drag** (or **Select**) chooses several: **New Project from these**,
  move them, star them, hide them.
- On This week, **double-click the map** to write a note on it. **Link to…**
  on a card draws your own link to another; its card says what joins them,
  in your words.
- **Star** puts a conversation in the strip under the page's name; **Hide**
  takes it off the map (View → Hidden brings it back; search still finds it).
- **Undo** and **Redo** (⌘Z, ⇧⌘Z) cover all of it, filing included. The
  lens, and how the map looks, are preferences, not undoable steps.
- Where a conversation sits inside its subject is the map's to work out, so
  that nothing sits on anything; on the line time places everything.

**View** holds the rest: Core chats on or off, the ideas subjects share
(their curves); labels (minimal keeps a quick question's words, and what a
session holds, until pointed at), colour (by subject, kind or recency) and
size (by depth, recency, or the same); which subjects are shown (also "All
subjects ▾" under the lenses); **saved views**; Hidden, Add a note, Reset
layout (every folded subject open again); and, signed in, **Everything
remembered** (the Mind Atlas). On the line it holds only what applies there.

**One box finds or starts**, at the foot of the map — and it is where every
line of thinking begins: **Logos 5 opens on the map**, whatever there is, and
there is no "What are you working on?" screen. "Search or start something
new…" (press `/`) searches names, ideas and where conversations stand; what
does not match dims, its list opens upward, and Enter opens the first match.
Its round ↑, or its last choice, begins a new line of thinking with the typed
words as the first question; with nothing typed and nothing added, ↑ asks for
words rather than opening an empty one. Files dropped on it, or anywhere on
the map, or added with its clip are sorted into topics (§4). It carries the
model and how far it goes, as the composer does; begun from a Project's home
it says it will start in that Project; an opening chosen elsewhere waits in
it to be made the person's own. Empty, it offers where to pick up.

**Getting around.**
- Pressing a conversation opens its card: where it stands, Socria's open question,
  its ideas, and Continue, Star, Move to…, Link to…, Hide — and File it there
  when it is suggested for a Project. Pressing again, or Enter, opens it.
- Pointing at a conversation lights what it is joined to.
- Arrow keys go to the nearest conversation that way. Scroll moves the map, and pinch
  or ⌘/Ctrl-scroll zooms (`lib/canvas.ts`). The map refits when its room
  changes, unless it has been moved by hand.
- **List** in the header opens a column of every conversation by subject,
  starred first. The menu's "Manage conversations" brings back the rail.
- The Socria mark always comes back here.

**Celestial.** On the Celestial theme (Settings → Theme; everyone's, like
Dark — it was called Night, and keeps that key, so a choice made under the old
name holds) the whole app is read under a sky (`components/CelestialSky.tsx`,
`lib/celestial.ts`, `app/celestial.css`): a deep field generated the same
every time — thousands of faint stars, the Milky Way as a band of grain and
light with dust lanes through it, violet and teal nebulae — wheeling once an
hour, its brightest stars twinkling, now and then a shooting star. The map is a
star chart over it: two layers of nearer dust drift at their own depths as it
is moved; sessions are stars lit from inside, where to pick up has a corona and
a cross of light; subjects are orbits whose dashes slowly turn, quick questions
twinkle, a link you made is a gold trail with a comet running along it; the
words sit on glass. Dark and One draw light discs with dark words on their own
grounds; Paper and White as designed. Under reduced motion it all holds still.

**It travels.** The arrangement is kept in this browser and, signed in, in
the account (`user_profiles.universal_map` through `/api/profile`, the newer
copy winning). It holds only the person's choices — never a conversation's
words — and is bounded and checked on every read. One kept before reads as
All time when it grouped all of it some older way (by subject, by week, a
Project map, Columns, a Timeline). Places put by hand on the old star map are
kept in it, unused: the map now works out where each sits.

"Organize it" and "Practice this" write into the line of thinking they began
in, even if another is opened while they work.

### Core 4 and Logos 5: one history

Signed in, every conversation is a conversation of Logos 5, the ones begun in
Core 4 included (`lib/logos5/merge.ts`):
- **On the map, in the List, in search, once.** A Core chat is drawn from its
  words and its map, as a line of thinking is — no second tile beside it with
  its name alone, and no "Core chats" switch in View while there are none to
  put away.
- **Opened here.** Pressed on the map, in the List, in the Mind Atlas or the
  Mind Graph, it opens inside Logos 5 — and from Core 4's rail or a Project's
  home too, which used to choose the plain "Logos" and so landed on Logos 2
  while Logos 1 is held back. A map it never had is drawn when it is opened,
  as before (`owesExtraction`).
- **The ones from before, brought in once.** The first time Logos 5 opens on
  an account, every Core chat is moved here (`POST /api/conversations/merge`):
  its `kind` and nothing else — not its words, title, memory, map, draft,
  Project or when it was last worked on. Never an incognito one. Once per
  account, recorded as the `logos.merged` milestone (`lib/first-run.ts`), so
  a second device does not do it again and starting onboarding over does not
  either. The Core 4 screen stays for whoever picks it; a chat begun there
  afterwards opens there from its rail and is on this map all the same.
- **Their maps, drawn in the background.** One at a time, newest first, paced
  (2.5s apart) and at most 150 a day per browser, through the ordinary map
  pass — which spends nothing of the month's allowance; "Drawing maps for your
  chats · 3 of 12" shows while it runs. Each is written alone (`PATCH
  /api/conversations` with `firstMap`): never the messages, never over a map
  already there, never onto a shared conversation. A visit cut short carries
  on the next time; one the pass cannot draw is drawn when it is opened.
- **Not for a chat kept quiet.** One the person took off the record or kept to
  itself (Core 4's `persistPolicy`), or one a private memory came from — a
  weighty conversation, whose memories never reach Logos (invariant 3,
  `lib/mind/types.ts`) — is brought in like the rest, and its map is drawn
  only if they open it here. When the server cannot tell, none are drawn in
  the background.
- **Not a way into a reward.** A map drawn in the background is marked
  `unopened`, and the 5-Node Challenge does not read it until the person opens
  the conversation in Logos (`lib/rewards/challenge-rule.ts`) — which is when
  a Core chat's map used to be drawn at all — so who qualifies is as before.

## 6. The map is the screen

A line of thinking is three views of the same material, switched in the
header — **Components · Artifacts · Logic Map**, each counted:

- **Components** — the topics the files were sorted into (§4's board and
  topic panel). With no files yet: "Nothing to sort yet.", a place to drop
  them (they are sorted straight away), and what was said in the conversation,
  each a press from its message.
- **Artifacts** — everything made in the conversation: displays (charts,
  plans, comparisons, documents' figures) and practice sets, one at a time at
  full size, the others in a strip above it. Each says "made from the
  conversation". Something new arriving opens it here.
- **Logic Map** — the workspace (§2's stage, every panel and lens, "+ View",
  Synthesize), the Thinking Map in it.

It opens on Components while there is little on the map, on the Logic Map
after that; a new artifact switches to Artifacts.

**The conversation folds away.** Beside the view is the conversation — "4
turns · fold it away ›" — or, folded, a composer floating over the bottom of
the view. A reply that arrives while it is folded is shown over the composer
as it streams ("Open the conversation", or × to put it away), with its effects
("+2 on the map", "Chart · Spending") a press from what they made. Whether it
is open is kept per line of thinking, in this browser
(`socria.logos5.stage.v1`, `convo`); a visit with nothing on the map yet opens
it. The header's **Conversation · N** pill does the same.

**Asking about a card.** Pressing a card on the Logic Map opens "Asking
about" beside it — never under the composer, never past the map's edge: the
card's name, the last thing asked about it and Socria's answer (streaming, if
it is on its way), "Came from 2 messages ›" (the thread marks them), and
**Challenge it**, **What rests on this?**, "Why does this one matter?", or a
question of one's own. What is asked there is an ordinary turn of the
conversation with the card as its Point & Ask subject — nothing new is
stored — and its answer is read in the popover, not again over the composer.
The card's other actions are under "More about this card".

**A reply's closing question** is set apart in the serif italic, so the
question Socria asks back reads as one (`closingQuestion`; only when the cut
leaves bold, code, maths and links whole).

The header: the Socria mark (home), a small-caps eyebrow — the course, the
Project, or "Logos" — and the title in the serif; the switch in the middle;
the Conversation pill, the Mind Graph, the menu and the account on the right.
"Manage conversations" in the menu brings back the rail.

## 7. The Mind Graph

What Socria remembers about the person (the Mind Graph store, `lib/mind`,
read through `/api/mind?scope=logos` — nothing private) is its own place,
drawn as a mind (`lib/logos5/mindgraph.ts`, `components/logos5/MindGraph.tsx`).
The brain icon in a line of thinking's header, or **Mind Graph** on home,
opens it.

- **A neuron per memory**: its cell sized by how much it matters (importance,
  how often seen, confidence), a dendrite for each conversation it was learned
  in, an axon to each memory it informs. The weightiest of each region leads
  it, larger and darker.
- **Three regions**, by the kind the store gave it: **How you decide**
  (habits: preferences, beliefs, decisions, insights, values, patterns…),
  **What you are holding** (facts: people, places, events, givens) and **What
  you are working on** (projects, goals, plans). The store's own bookkeeping
  (conversations) is not drawn; nor is anything archived.
- Under each name, how it is known: "set by you", "seen in 3 lines of
  thinking", the one conversation it came from, or "since March".
- **All · Habits · Facts · Projects**, and **Find a memory**, which reaches the
  memories past the drawing's cap (36) as well.
- **A memory pressed**: "Habit · remembered", its words, *Learned from* (each
  conversation a press away), *Informs*, *First noticed*; **Edit**
  (`PATCH /api/mind/node`), **Show where** (opens the conversation it was
  learned in), **Forget this** (asks once more, then `DELETE`).
- Signed out it says memory lives with an account; if the store cannot be
  reached it says so, and nothing else changes.
- Every position is computed, deterministically. On a phone the regions are
  one under another, a memory to a row at the phone's own size, and the page
  scrolls.

## 8. Data

Unchanged: the session and message shapes (`lib/logos-sessions.ts`), the
`/api/conversations` contract, ids (`lg_…`, `m_…`), every localStorage key
Logos 4 reads, the `#lg-m-<id>` anchors and `.lg-composer textarea` the
resume and jump code look for. New, per browser only:
`socria.logos5.stage.v1` (stage open per line of thinking, its width, and
whether the conversation is open beside the map).

New for the Universal Map (§5): how the person arranged it, in
`socria.logos5.home.v1` in the browser and — signed in — the
`user_profiles.universal_map` column (`supabase/schema.sql`, safe to re-run),
read and written whole by `/api/profile` (`?only=universalMap`, and
`universalMap` in a PUT). Without the column the route says so (`null`, or
`unsaved: ['universalMap']`) and the browser's copy is the arrangement. It
holds the lens, places, cluster positions, orders, the subject given to a
conversation by hand (`subjectOf`), stars, hidden ones, links, notes, display
choices and saved views — no conversation's words — each bounded by
`parseArrangement`. Filing in a Project and a Project's name and colour are
the Project's own (`/api/conversations`, `/api/projects/[id]`); the Projects
list now returns each Project's colour.

Editing a sent message removes the messages after it, after an explicit
confirmation in place; the map is not rolled back and says so.

New for one history (§5): `POST /api/conversations/merge` → `{ moved, draw,
already, recorded }`, moving the `kind` of every non-incognito conversation not
already in Logos, once per account (`user_profiles.first_run`, milestone
`logos.merged`; without that column it still moves them and says
`recorded: false`; without `kind` it moves nothing, 409). `PATCH
/api/conversations` takes `{ id, firstMap }` — the map alone, onto a
conversation without one and not shared, stored with `unopened: true` — and
`{ id, opened: true }`, which takes the mark away; neither touches
`updated_at`. `unopened` is kept only when a map is read back from storage
(`sanitizeMap(…, { trust: 'stored' })`), so no extractor and no whole save can
set it. Per browser: `socria.logos5.mapsOwed.v1` (the ids whose maps are still
to be drawn) and `socria.logos5.mapsOwed.day.v1` (how many were drawn today).

And a fix the merge needed: a `PUT /api/conversations` without a `memory` now
leaves the stored memory as it is. Logos never sends one, so a Core chat
opened in Logos and saved there used to have its Core memory replaced by an
empty one; a client that sends a memory still replaces it, and a new row
starts empty. The older database's sidecar keeps it the same way.

## 9. Phones

The view is the screen: the header, then **Components · Artifacts · Logic
Map** across the full width, then the view. The conversation is a sheet at the
foot — a grip, "Conversation · N turns ▴", the last reply as one line, and the
composer; pulled up, it is two thirds of the screen with the map still in
sight above it. A card asked about opens its popover over the map. The Mind
Graph is a scrolling column. The composer keeps the safe area; text is 16px;
every control is at least 44px. The Universal Map reads top to bottom: the
lenses by their short names (Today · Week · Subject), clusters one under
another two hubs across, today's learning before what it builds on (its lines
faint until a star is pressed) and everything else; a star's card is a sheet
from the foot.

## 10. Switch

`NEXT_PUBLIC_LOGOS5=off` brings back the Logos 4 layout without a deploy of
code. Logos 2 is unchanged.

## 11. What is where

| Piece | File |
|---|---|
| The turn, the pending reply | `components/logos5/L5Message.tsx` |
| Header, menu, link bar, stage head, outline, the view switch, the Mind Graph button | `components/logos5/L5Chrome.tsx` |
| "Asking about": a card asked about on the map | `components/logos5/L5Ask.tsx`, `components/ThinkingMap.tsx` (`askCard`) |
| The Mind Graph (drawing; the view) | `lib/logos5/mindgraph.ts`, `components/logos5/MindGraph.tsx` |
| The screen's styles (the redesign last, over the others) | `components/logos5/l5.css`, `components/logos5/study.css`, `components/logos5/redesign.css` |
| Linking the thread and the map | `lib/logos5/linking.ts` |
| The switch and the stage's per-browser memory | `lib/logos5/flags.ts` |
| Rich reading (headings, code, quotes) and streaming formatting | `lib/rich-text.ts` (`{ rich: true }`), `components/RichText.tsx` (`rich`, `StreamingRichText`) |
| The composer, stacked, with Stop and "+" | `components/LogosComposer.tsx` (`layout="stacked"`) |
| Stop, retry, edit; the stage's open/close rules; the assembly | `components/LogosApp.tsx` (search `LOGOS 5`) |
| A card lit, or brought into view, from the thread | `components/ThinkingMap.tsx` (`linked`, `reveal`) |
| The study: intent, sorting kept to the files, the board's layout, practice, checking, the stored shape | `lib/logos5/study.ts` |
| What the model is asked for a study | `lib/logos5/study-ask.ts`, `lib/logos5/ask-json.ts` |
| Sorting and practice, server side | `app/api/logos/organize/route.ts`, `app/api/logos/practice/route.ts` |
| The study as a display in the map | `lib/objects/display-study.ts` |
| Intake, board, topic, practice; an empty Components; Artifacts | `components/logos5/Study.tsx`, `components/logos5/study.css` |
| Home: each conversation read for the map — its kind, where it stands, what it is about; shared ideas; search (pure) | `lib/logos5/universe.ts` |
| What a conversation is about, without asking: courses, codes, fields (pure) | `lib/logos5/subjects.ts` |
| Who is what on the map: sessions and quick questions, subjects' homes, Today and what it builds on (pure) | `lib/logos5/spatial.ts` |
| The map as subjects: circles, discs, spokes, folded subjects, packing, the curves across and the card over one (pure) | `lib/logos5/bubbles.ts` |
| In order: where each began, threads, lanes, the floor, quiet stretches, names, days (pure) | `lib/logos5/timeline.ts` |
| The line drawn: scrolling, ↩, the whole history at the foot, search, the card | `components/logos5/UniverseTime.tsx`, `universe.css` (search `in order`) |
| How the person arranged it: the model, its bounds, every change (pure); kept in the browser and the account | `lib/logos5/arrange.ts`, `components/logos5/useArrangement.ts`, `app/api/profile/route.ts` |
| The page (its name, the lenses, the legend, the box at its foot), the map drawn, the pieces; every theme, and the star chart on Celestial; coming in | `components/logos5/Universe.tsx`, `UniverseBubbles.tsx`, `UniverseParts.tsx`, `universe.css` |
| The themes, Celestial among them, and the picker | `lib/theme.ts`, `app/themes.css`, `components/account/ThemePicker.tsx` |
| Celestial's sky: generated, painted in idle time, behind the whole app | `lib/celestial.ts`, `components/CelestialSky.tsx`, `app/celestial.css` |
| Where home is wired in (start, file, a Project renamed or recoloured) | `components/LogosApp.tsx` (search `HOME, THE UNIVERSAL MAP`), `app/chat/page.tsx` (`updateProject`) |
| One history: which chats to bring in, the maps owed, the chats kept quiet, today's count (pure, and two storage helpers) | `lib/logos5/merge.ts` |
| Bringing them in, once | `app/api/conversations/merge/route.ts` |
| A map written alone, and the mark taken away (`firstMap`, `opened`); a save that leaves the memory | `app/api/conversations/route.ts` (`mapOnly`, PUT) |
| The move, the drawing, the chip, opening a Core chat here | `components/LogosApp.tsx` (search `THE CORE CHATS, BROUGHT IN`), `components/logos5/Universe.tsx` (`drawing`), `app/chat/page.tsx` (`onConversationsMoved`) |
| The challenge leaving an unopened map alone | `lib/rewards/challenge-rule.ts` |
| Driving it in a browser by hand | `scripts/dev/logos5-journey.mjs` (the map: `STEPS=talk,talk2,stage,convo,card,cardask,arts`; study: `STUDY_FILES=… STEPS=intake,board,topic,practice,fill,check,more,askwhy,reload`; home: `STEPS=start,seed,home,find,press,star,hide,undo,drag,lasso,note,viewmenu,mode,list` with `MODE=Today|Week|Month|All`; any of them on a theme with `THEME=night`) |

Core chat (`app/chat/page.tsx`) keeps its screen; its list lets go of the
chats brought into Logos 5, and its rail and a Project's home open them there
(`logosToOpen`). Logos 2 keeps its two columns. Everything Logos 3–4 could do is still reached from Logos 5: the
workspace panels, "+ View", every lens, displays, documents, models, Live 3D,
Synthesize, Draft, Capture, Voice, sharing and comments.

## 12. Results

Measured on dev before shipping, not intended. Browser runs used the local
stand-ins (fake model, fake database), at 1440×900 and 390×844:

| Journey | Result |
|---|---|
| Plain conversation | The thread only; no workspace opened. The reply says "+2 on the map"; the header offers **Map · 2** with a dot for something new. |
| "Chart my spending as a pie: …" | The workspace opened beside the thread on the chart; the reply says "+1 on the map" and "Chart · Spending". |
| A card selected on the map | The thread marks the message it came from and the bar says "came from this message"; the composer says "Asking about …" (Point & Ask). |
| "+2 on the map" hovered, then pressed | The two cards lit on the map; pressing opens the workspace on them. |
| Retry the latest reply | Replaced in place (4 messages before and after). |
| Edit a sent message | It and what followed were replaced by the new turn and its answer. |
| Stop before the first word | The message went back into the composer, unsent. |
| Phone | The conversation is the screen; the workspace is a sheet with "← Conversation"; the rail is a drawer; no horizontal scroll. |
| A PDF attached, then asked about | Read on attach; the workspace opened on the document beside the thread; the reply says "Document · Q3 report". |
| Logos 2 | Unchanged. |
| Page errors | None in any run. |

Defects found and fixed on the way:
- A global `.mv-stage` rule (`aspect-ratio: 3/4`, the homepage's) matched a
  class name and stretched the screen to 1920px, pushing the composer off it.
  The class is now `l5-sheet-on`, and the frame's height is explicit.
- A map card's action menu opened upward past the panel's top and hid
  "Ask Socria". It now keeps inside the panel and scrolls.
- A note landing under the latest reply was left below the fold; it now
  stays in view for someone already at the end.

### The study path

Browser runs with the stand-ins (a fake model that sorts by the files'
headings and makes entries from their dollar amounts), two real PDFs made
for the purpose ("Ch5_Adjusting_Entries.pdf", 5 pages; "Exam 2 review
sheet.pdf", 2 pages), at 1440×900 and 390×844:

| Journey | Result |
|---|---|
| Drop both, "help me get ready for exam 2 on thursday" | Both read ("5 pages · read", "2 pages · read"); "Looks like: studying for an exam"; **Organize it**. |
| Organize it | "Socria · sorted 2 files into 7 topics"; the lead row — the start in the middle with its tab, the two topics with most sources beside it — and the rest as smaller cards beneath, linked; chips name pages, or a review's questions ("Review Q3", "Review Q5–Q6"); the conversation holds the turn and what was done. |
| A topic pressed | The others dim; its panel lists the quote with "Ch5_Adjusting_Entries.pdf · p.3" and the four actions; the composer says "Asking about Accrued expenses". |
| Practice this | "Record the adjustments for March 31", made from ◇ Ch5 · p.3 and ◇ Exam 2 review sheet · p.1: two events, ten blanks, the equation from $26,850. |
| Filled (one entry right, one wrong, equity wrong), checked | 5 of 10; "Debits equal credits ✗", "The equation holds ✗"; two gaps, each with the whole entry, why, and its page; wrong rows tinted. |
| Try 3 more like these | A new set of three; the events already practised are sent along to be left out. |
| Ask why → Logic Map | Step 3 opens: the question asked about the topic (Point & Ask), the map beside it. |
| Home, three lines of thinking | The Universal Map: three clusters — a study's topics, a conversation's ideas, a chart's one card — "3 lines of thinking"; no rail. |
| Find "team" | 1 found, 2 dimmed. |
| List | The rail as a column (a drawer on a phone); put away again by its button, or a tap beside it. |
| A cluster pressed | That line of thinking opens; the map is gone until the mark is pressed. |
| Reload | Opens on the Universal Map. |
| Reload | The study is still there: seven cards, the steps. |
| Phone | Home fills the screen (mark, List, +, menu); the board a list, a topic a sheet, the journal table a stack (account, then debit and credit); the steps name only the open one; no horizontal scroll. |
| Page errors | None. |

Found and fixed on the way to the Universal Map as home: clusters and their
names overlapped (spacing now keeps a box for each name); the List button
stayed marked after a tap beside the drawer put it away; and, once, on a cold
development server, a study was filed into the line of thinking open before
it — not reproduced since, but "Organize it" and "Practice this" now write
only into the one they began in.

Found and fixed on the way: class names that collided with the shared
thread's stylesheet (`.st-act` was hidden there), renamed `l5s-`; a cell
width rule that also matched the inputs inside it, which pushed the phone
table off the screen; links that jumped a column ran behind the cards
between, so only neighbouring columns are linked.

Tests: `test/logos5-linking.test.mjs` (20), `test/logos5-ui.test.mjs` (49),
`test/logos5-study.test.mjs` (90), `test/logos5-study-ui.test.mjs` (49),
`test/logos5-mindgraph.test.mjs` (28), and the existing suites, unchanged in
what they hold.

**Not verified here:** a real model's sorting and journal entries (the stand-in's are canned from the files' headings and amounts — the code that keeps only what the files bear out is tested, the model's judgement is not), a signed-in Universal Map's "Everything remembered" (the Mind Atlas needs an account), Core chats on the Universal Map in a browser (the local stand-in has none; their layout and bridges are tested), a real model's streaming (the stand-in streams
canned text), a signed-in shared line of thinking (group view) on the new
screen, a reply's citation chips opening their passage (the stand-in does not
cite), and Live 3D in the stage. Each reuses code that was not
changed, but has not been watched working in Logos 5.

### The redesign: the map is the screen

Browser runs with the stand-ins, at 1440×900 and 390×844. The Mind Graph
needs an account, so it was watched with its two reads (`/api/mind`,
`/api/mind/atlas`) answered by a fixture of fourteen memories — the real
component, on the real page's styles.

| Journey | Result |
|---|---|
| Two turns about two job offers | The Logic Map, counted 6, with the conversation open beside it ("2 turns · fold it away ›"); the reply's closing question set in the serif italic. |
| Conversation folded | The composer floats over the foot of the map; the header pill reads **Conversation · 3**. |
| A card pressed, then "Why does this one matter?" asked in it | "Asking about" opened beside the card, whole, above the composer: the question, the answer as it streamed, "Came from one message ›", the chips; the composer stayed "Reply to Socria…", and the answer was not shown again over it. |
| "Chart my spending as a pie: …" | **Artifacts · 1**: "Artifact · Chart · made from the conversation". |
| Two PDFs dropped, organized, a topic, practice, checked | Components · 7 (the board, the topic panel); the checked set in Artifacts ("Artifact · Practice · made from the conversation", 0 of 2, two gaps with their pages). |
| Reload | Home, the Universal Map. |
| Home, List | The contents column: "Your Universal Map · 1 line of thinking", the line of thinking under "Lines of thinking", 6 ideas · now. |
| Mind Graph, fourteen memories | Three regions named and apart; leads larger; axons between what informs what; a memory pressed: "Habit · remembered", Learned from three conversations, Informs, First noticed 6 weeks ago, Edit · Show where · Forget this. Habits: 6; "rent": 1. |
| Phone | The tabs across the width; the conversation a sheet at the foot (the last reply as one line, the composer); pulled up, two thirds of the screen; a card's popover over the map; the Mind Graph a scrolling column; no horizontal scroll. |
| Page errors | None. |

Found and fixed on the way: the popover opened under a card near the foot
and was cut off by the map's edge, under the floating composer (it now goes
beside the card, kept above the composer — the map is told how much room the
composer takes, `--lg-menu-reserve`); pressing a card also made it the composer's subject, so it was asked
about in two places; the answer to a card's question was shown in the
popover and again over the composer; a phone's open sheet stopped 59px short
of the screen's foot (top and maximum height fought); the workspace's caption
ran under its own buttons; the home header's buttons sat in the middle when
there was no switch; a memory-heavy region's outer ring left the Mind Graph's
drawing (rings now draw in past the second); the name of the lower region sat
on a memory of the upper one; on a phone the Mind Graph was the desktop
drawing shrunk to unreadable — it has its own layout now.

**Not verified here:** the Mind Graph against a real account's memory (the
store's reads and writes are unchanged and their routes tested; the view was
watched with a fixture), Edit and Forget against the store, and a signed-in
home's "Mind Graph" pill.

### The Universal Map, rebuilt

Browser runs at 1440×900 and 390×844, two ways:
- **The real app**, with the stand-ins. Signed out, so there are no Projects.
- **A harness.** The real component on the real page's styles, with four
  stand-in Projects (one empty), twelve lines of thinking over two months,
  and three Core chats. Its host answers filing, a new Project, a rename and
  a colour the way /chat does (`moveSession`, `createProject`,
  `updateProject`), and logs each.

| Journey | Result |
|---|---|
| "Search or start something new…" with "Should I take the job in Austin?" | A line of thinking begun with those words as its first question; back home, a large card with where it stands, Socria's open question marked, and **Pick up where you left off**. |
| Six lines of thinking | The map: one frame, "Universal Map · 6" in the header, the idea two of them share named between them. |
| "rent" in the box | 3 found, 3 dimmed; the list offers each, with what matched, and to start "rent". |
| Arrow keys | From the conversation to pick up, to the nearest one each way. |
| A tile dragged onto its neighbour's place | The two traded places; nothing else moved. |
| Star, Hide, Undo | The star in the strip at the top; hidden, 6 → 5 and a line saying how to bring it back; Undo, back to 6. |
| Select, then drag across two | "2 chosen" — Star, Hide (signed out there are no Projects to file in; the harness below makes one). |
| Double-click the map, type, Enter | A note on the map, as wide as its words. |
| Columns; Timeline | A column per Project; a lane per Project across "Before this month … Today". |
| Harness: the map | Frames for ACCT 2301 (clay), Job hunt, Thesis (slate), the empty Side ideas ("Drag a line of thinking here to file it"), In no Project, Chats; "Monthly runway · 4" and "Accrual basis · 3" as themes. |
| Harness: zoom out, then in | Far: names only, the shared ideas as marks; near: where it stands and the small graph. |
| Harness: "Rent or buy a flat" dragged into Job hunt | Filed (the host's `moveSession`), and in that frame's order. |
| Harness: a frame by its name; its corner; its chevron | Moved with everything in it; two across → three; folded to "3 · latest: Exam 2: adjusting entries". |
| Harness: the frame's dot, then ochre; a double-click on "Side ideas" | The Project's colour and name changed (the host's `updateProject`). |
| Harness: two chosen → New Project from these → "Personal" | The Project made and both filed in it, in one undoable step. |
| Harness: Link to… → another → named | A dotted line between them, "same deadline" on it. |
| Harness: Columns — a card into Thesis, at the top; the Thesis column to the front | Filed and first in Thesis; Thesis the first column. |
| Harness: View → Colour by Kind → saved as "By kind" → Project → "By kind" | Each tile's edge back to the kind's colour. |
| Harness: arrow keys, then Enter | Right, down, left to "Practice: prepaid rent"; Enter opened it. |
| Harness: Hide, then View → Hidden → Show | In the tray ("still found by search"), and back on the map. |
| Harness: View → Everything remembered | The Mind Atlas in place, and "← Back to the map". |
| Phone | The box under the header; one row of views, Undo and View; the frames one under another, two across; a conversation's card a sheet from the foot; Columns a column at a time. No horizontal scroll. |
| Page errors | None. |

Found and fixed on the way:
- The find box's list opened under the map's own bar.
- A double-click on a frame's name, or on a note, landed on the map instead:
  the map held the pointer from the press. It now holds it only once a drag
  begins.
- A note wrapped one word to a line: the map's world has no width, so a note
  now takes the width of its words.
- A tile put down freely could land on its neighbour and hide under it, so
  snapping to the grid is the default, with trading places.
- One tile moved made the others close the gap. Now, once a frame is arranged
  by hand, the others stay where they are.
- A shared idea was named by its folded words ("accrual basi"); it now uses
  the conversations' own.
- A shared idea's label could sit on a frame's corner and hide the handle
  that widens it.
- Undo took back a switch between views; views and display are now
  preferences, not undoable steps.
- In Columns, a drag selected the page's text, and the Timeline's names and
  times did not stay put while scrolling.
- On a phone the map's bar took three rows; it now takes one, plus the
  strip.

Tests: `test/logos5-home.test.mjs` (93) holds the tiles, groups, layout,
shared ideas, search, timeline, and every change to an arrangement and its
bounds. `test/logos5-study-ui.test.mjs` (62) renders the empty home, the few
cards, the map with Projects, stars, notes and links, Columns, Timeline, Core
chats left off, and the List.

**Not verified here:**
- The account's copy of an arrangement against a real database: the route's
  read and write follow the existing tolerant pattern, and the column must be
  added to Supabase (`supabase/schema.sql`) before an account can hold it.
  Until then the browser's copy is the arrangement.
- Filing, a new Project, a rename and a colour change against the real
  Projects API: the harness stood in for /chat, which calls the same routes
  the rail and Project Home already use.
- Touch dragging on a real phone. Press-and-hold to pick up, and a touch
  that moves first scrolling instead, were checked only by reading the code.

### The Universal Spatial Map, and Night

The map rebuilt to the PRD "Clearer Structures and UI" (§5), and the Night
theme. Browser runs at 1440×900 and 390×844, on Paper and on Night:
- **The real app**, with the stand-ins, signed out (so no Projects or Core
  chats): five lines of thinking begun from the find box.
- **A harness**: the real component on the real page's styles, with four
  Projects (one empty), twenty-three conversations over seven weeks — studies,
  decisions, quick questions, Core chats, one suggested for a Project — and a
  host that logs filing and making a Project.

| Journey | Result |
|---|---|
| Real app, five begun today | Today's learning, "Universal Map · 5"; all five today's, as hubs. |
| Real app, By subject | Business, Money, Computer science — read from the conversations, nothing filed; Everything else once a subject is down to one quick question. |
| Real app, find "rent"; List; a star pressed; Star, Hide, Undo; View; arrow keys; Select across two; Continue | 2 found, 3 dimmed; the List by subject; the card; the star in the strip, 5 → 4 → 5; View by lens; the nearest star chosen; "2 chosen"; the line of thinking opened. No horizontal scroll at 390. |
| Harness, By subject | ACCT 2301 (with "+ 1 about it · File it" for a Core chat about debits), Job hunt, Thesis, the empty Side ideas, then Money, Economics, Mathematics, Biology, Everything else; "Monthly runway · 5" and "Accrual basis · 3" as themes, the first across a Project and Money. |
| Harness, By week | This week, Last week, then weeks by their dates; a topic coming back drawn across weeks. |
| Harness, Today's learning | Today's three in the middle; seven earlier ones round them, each with why ("shares 'Accrual basis'", "also in Thesis"); the rest a field by subject beyond. |
| Harness, a star dragged to Economics | Given that subject; "Its own subject" on its card would give it back. |
| Harness, a star dragged into Side ideas; "File it"; "Make it a Project" on Economics | Filed (the host's log); the suggested chat filed in ACCT 2301; "Economics" made with its four in it. |
| Harness, a star moved inside Job hunt, then Undo | It stayed where it was put; Undo put it back. |
| Harness, Fold on Thesis | "3 conversations, folded away". |
| Harness, a lens changed | The stars travel to their new places (543px for Exam 2, Subject → Week). |
| Night | The sky, nebulae in each subject's colour, glinting hubs, gold shared ideas; the header, the find box, the card and the phone's sheet in Night's colours. |
| Page errors | None. |

Found and fixed on the way:
- Today's learning drew the shared ideas as well as why each earlier one was
  there — the same thing twice, and the ring's own heading sat on a star's
  name. Today's lens now draws only what each builds on.
- "last here" floated over the cluster's name; it is in the star's caption.
- A cluster's buttons, though hidden, still took room and squeezed "Biology"
  to "B…"; they float over the name now, when it is pointed at.
- Far off, shared ideas on Night had dark boxes behind their marks, and the
  empty Project's hint sat on its name.
- Opening the List did not refit the map, cutting a subject off; it refits
  when its room changes, unless moved by hand.
- A finger's press counted as a hover on a phone and dimmed the rest.
- A link's words could sit on a star's name; they now go along its curve
  where they are clear.

**Logos 5 on every dark ground.** Logos 5 had been drawn for paper: its own
surfaces (`--l5-*`) and some fifty colours were written out as paper's, so on
Dark and One the words went light while the cards stayed cream. Every such
colour is now a token whose default is exactly paper's value
(`components/logos5/l5.css`, `redesign.css`, `study.css`; the Mind Graph's
neurons in `MindGraph.tsx`), and `app/themes.css` gives Dark, One and Night
their own ("Logos 5 on every dark ground"). Checked:
- Paper: the computed colours of every element in 25 states — a line of
  thinking (graph, "Asking about", the menu, editing, the folded composer, a
  chart, Artifacts, Components), the whole study path, and the phone — the
  same before and after; screenshots identical.
- Night, Dark and One: the conversation and its Logic Map, the study path from
  intake to a checked set, the menus and sheets, the Mind Graph, the phone.
  Words on a lit fill take the ground's colour; right and wrong are turned up
  to be read.
- Also fixed: two of the study's colours (`--st-no`, `--st-no-soft`) were
  named nowhere, so a failed file's bar and a wrong row on a phone had none;
  and on a dark ground a map card lifted on hover glowed with the ink's light
  instead of casting a shadow.

Tests: `test/logos5-spatial.test.mjs` holds the subjects, the homes, hubs and
dots, the three lenses, shared ideas and putting a star down;
`test/logos5-home.test.mjs` the reading and the arrangement;
`test/logos5-study-ui.test.mjs` renders the three lenses;
`test/themes.test.mjs` the five themes and the sky.

**Not verified here:** what a real account's conversations are read as — the
fields come from what the map model wrote (`map.ask.domain`) and a word list,
so some will land in Everything else or a neighbouring field until moved by
hand; the account's copy of the arrangement against a real database; dragging
on a real phone; One only by setting its attribute (the app puts a browser
without membership back on paper); the Mind Graph on Night only with neurons
drawn from its own markup (it needs a signed-in account). Left as they were:
a pie chart's white percentages sit on its light slices on a dark ground (the
display's renderer), and Logos 4's map legend keeps its cream strip there.

### One history: the Core chats in Logos 5

The two histories made one (§5, "Core 4 and Logos 5: one history").

- **The routes, end to end** (`test/merge-chats-e2e.test.mjs`, 53 checks, the
  real handlers on the stand-in database): a save without a memory keeps it,
  on the newer database and the older one's sidecar; the move takes every Core
  chat (an unmarked one too), newest first, and changes nothing else about any
  of them — words, memory, title, map, when; never an incognito one or someone
  else's; once per account, a first-run record added to and not replaced; the
  chats kept quiet (off the record, kept to itself, a private memory's source
  in the Mind graph or the person's memory) left out of what is drawn, and all
  of them when that cannot be read; a map written alone, never over one,
  never onto a shared conversation, never someone else's; the challenge not
  reading it until it is opened, and reading it after.
- **In a browser, signed in** (the real LogosApp with a stand-in for the
  sign-in and every request answered and recorded; 1440×900 and 390×844): the
  move asked for once; the host told which moved; maps drawn for the two
  allowed, newest first, never the quiet one; each saved as its map alone, no
  whole save while drawing; one tile per conversation; the chip, "Drawing maps
  for your chats · 1 of 2", gone when done; opened from the map inside Logos 5
  with its messages, and the mark taken away; a second visit asks for nothing
  again. No page errors.
- `test/logos5-home.test.mjs`: one tile per conversation when a chat is both
  held here and handed down by name. Full suite: 237 of 237. Typecheck and the
  production build pass.

Found and fixed on the way: Logos saved without a memory, which reset a Core
chat's memory every time it was opened and saved in Logos (above, §8).

**Not verified here:** against a real database and a real account — the move,
the first-run record and the background drawing were driven against stand-ins;
how long the background takes with years of chats (paced and capped by design,
not measured); the Universal Map's Today lens draws an older conversation not
tied to today's work as a dot, so a newly drawn chat may show as a hub only in
This week or on the line.

### In order: the Universal Map as a line through time

How much of the map is shown is now Today · This week · This month · All
time: the short stretches a map, the long ones a line through time (§5, "In
order"). By week and By subject as lenses are gone — the line is all of it in
time, and This week is the subject map, for one week at a time.

- **The layout** (`test/logos5-timeline.test.mjs`, 26 checks): oldest left,
  newest right; opening one again moves nothing; a subject's conversations
  within a week joined, a longer gap a new thread with ↩ to the last before
  it; quick ones on the floor; a new conversation at the end moves nothing
  that came before; a long quiet stretch folded and named; the days named;
  This month from the first; names never on top of each other, and the one
  worked on last named first.
- **The screens, rendered** (`test/logos5-study-ui.test.mjs`): the four
  lenses; This week by subject with its name, its count and a ↩ to where a
  subject was before, an empty Project left out; All time with every
  conversation on it, a Project's threads named, a Core chat as a ring joined
  to its subject, this week and now marked, the history at the foot, no
  Select; This month the same line. `test/logos5-home.test.mjs`: every older
  way of grouping all of it reads as All time.
- **In a browser** (the real component over the app's own styles, 35
  conversations from Aug 24 to today; 1440×900 and 390×844, Paper and Night):
  All time opens at today; a ↩ goes back to the last of its subject and lights
  it; the bar at the foot, pressed near its start, goes there; a search finds
  three, lights them and brings the newest into view; a card's "See that week
  as a map" opens the week of Sep 28 (its two Biology conversations joined by
  "Meiosis"); "Back to this week"; a ↩ on this week's map opens All time at
  that conversation; This month; Today. No page errors; no page wider than
  the screen.

Found and fixed on the way: the conversation worked on last went unnamed when
one begun a day before it took the place under the line — names are now given
out by importance; a starred one's star fell to a line of its own; a week
stepped to was not fitted, and its map sat low and cut off at the side — each
week is fitted from its name down; on a phone the quick questions' name sat on
the words above it.

**Not verified here:** a real account's years of conversations (the map keeps
the newest 150, as everywhere); dragging and the wheel on a real trackpad and
phone; screen readers on the line.

### Today, on a real history

Today kept drawing the whole history round the day: every other conversation
an ambient field outside the ring, a sector to each subject — and the map's
own free-form names made a subject each ("General", "Technical issue",
"Personal decision" and "Personal decision-making"), so a real account had two
dozen sectors over an ellipse of dots, and the view, zoomed out to hold them,
lost the names of the day's own quick questions.

- Today is the day and what it builds on, every one named, and nothing else;
  "37 more, in order · All time →" under it (`spatial.ts` byToday).
- A name the map gives that is a field already (Astrophysics, Econometrics,
  AI, UX design, Journalism…) is that field; a vague one makes no subject
  (`subjects.ts`). This also keeps This week's clusters and the line's
  threads to the subjects that are really there.
- Checked with a history shaped like the one reported (the last day worked,
  quick maths questions round it, forty more under twenty-five of the map's
  names), at 1440×900 on Paper and Night and at 390×844: twelve conversations,
  all twelve named, no subjects drawn round them; the line's threads under
  Physics, Computer science, Writing, Life, Mathematics rather than one each.
  `test/logos5-spatial.test.mjs` (79) holds both, and the screens' test the
  count under Today.


### Your map, not a list

The person's own design for the map: subjects as large dashed circles named
round their edge ("ACCOUNTING · ACCT 2301"), real study sessions as discs in
the subject's colour with their names inside ("Exam 2 review — today · 3 files
· 7 topics"), the one to pick up haloed, quick questions as dots on spokes with
their words beside them, a dashed curve across two subjects with a card that
says why ("You linked these"), a subject worked on lately folded to its name
and three dots ("BIOLOGY · BIOL 1306 →"), "Everything you've studied / Your
map, *not a list*" at the top left, the lenses at the top right, what the marks
mean and "Search or start something new…" at the foot. Asked for: exactly that,
the lenses in Instrument Serif, the box at the foot by default (where "149
more, in order" was), and more animation switching tabs.

- Today and This week are drawn by `lib/logos5/bubbles.ts` (pure,
  deterministic) and `components/logos5/UniverseBubbles.tsx`, which replace
  the star map (`UniverseSky.tsx` and the layouts in `spatial.ts`, removed;
  `spatial.ts` keeps subjects' homes, sessions and quick questions, and Today's
  plan). Inside a subject each session touches the one closest to it in time;
  each quick question hangs from the session nearest it in time, away from the
  rest of the map; the circles are packed wider than tall, one under another on
  a phone.
- What joins two subjects: a link the person drew first, then an idea both come
  back to; Today counts a linked conversation as what the day builds on, before
  any idea (`todayOf`). The card is placed clear of every disc, dot and word,
  the curve rising to it from each disc's edge. Its pencil writes the link's
  words, its × takes the link away; pressing another curve brings its card.
- Today shows, folded, up to three subjects worked on in the last three weeks
  but not today; pressed, one opens. This week keeps the person's folds.
- Kept: drag into another subject (file, or give it that subject), Select,
  links, notes (This week), Make it a Project, a Project's colour and name,
  "+ N about it · File them", ↩ to where a subject was before, the card, keys,
  zoom, View's labels, colour and size. Gone with the star map: placing by
  hand inside a subject, snapping, moving a cluster, Tidy up — places put by
  hand are kept in the arrangement, unused.
- The lenses are set in the serif, the chosen one on a dark pill that slides
  to it with a little spring; each lens and each week comes in drawn (the
  circles open, the sessions rise, joins and spokes and curves are drawn out,
  the questions settle, the card arrives last; on the line the newest rise
  first and the threads draw along). Reduced motion: none of it.
- The header no longer holds the find box; the map is fitted between the page's
  words at the top and the box at the foot, measured, so neither covers it.
- Checked in a browser with the design's own conversations (Accounting today,
  Economics linked, Biology lately) and with a real-shaped history (forty-nine
  conversations, nothing yet today): Today, This week and All time at
  1440×900 on Paper, Night and Dark, and at 390×844; frames taken while
  switching lenses. `test/logos5-bubbles.test.mjs` (55) holds the layout —
  nothing on anything, everything inside its circle, the card clear, the same
  conversations drawing the same map; `test/logos5-study-ui.test.mjs` the
  page; `test/logos5-spatial.test.mjs` the link first in Today.

### Projects, back on the map

Asked for: "add project organizations to the map too. add projects back." The
redraw had made a Project look like any subject, and one with nothing in
Today or This week was not on the map at all.

- Every Project (not archived) is on the map in both lenses
  (`lib/logos5/bubbles.ts`): a circle drawn as the person's — a solid ring in
  its own colour, its dot, "Project" — when something in it is here; folded
  under the rest with how many it holds when not (pressed, it opens with its
  newest, until the lens changes); "Empty — drag one here" when it has
  nothing. The folded rows take the Projects first, in the person's order,
  then the subjects worked on lately, and wrap rather than run off.
- **+ New project** at the end of them makes one by name, or — with
  conversations dropped on it — with them in it. Dropping onto a folded or
  empty Project files into it. "Your project" is in what the marks mean.
- Checked in a browser (Today and This week, Paper): a linked Project open, two
  folded, an empty one; a quick question dropped on "+ New project" made
  "Exam prep" with it in it, and one dropped on the empty Thesis was filed
  there. `test/logos5-bubbles.test.mjs` (63) holds where each goes and that
  nothing in the rows sits on anything.

### The map is where it starts

Asked for: "i would remove this screen lol, integrate the universal map as the
default view" — the "What are you working on?" screen a new line of thinking
opened on.

- Logos 5 shows the Universal Map whenever the line of thinking open has
  nothing in it and nothing under way (`components/LogosApp.tsx`,
  `emptyHere`), so it opens there for everyone — a new account included — and
  never on an empty conversation. The screen itself is gone
  (`StudyIntake` and its styles).
- Everything it did is in the map's box: words begin a line of thinking; files
  (dropped on the box or anywhere on the map, or added with the clip) are read
  there and sorted when sent — the map says "Sorting your files into topics…",
  waiting for an answer still coming if there is one, then the board opens —
  and the model picker rides in it. An opening chosen elsewhere goes into it;
  a Project's "new line of thinking" says it will start there.
- Checked in the real app (signed out, through the dev stand-ins): it opened
  on the map; "What is accrual accounting?" from the box opened that
  conversation answering; back on the map it was there; a chapter's notes
  added with the clip were sorted into four topics with Accruals and deferrals
  as the start. `test/logos5-study-ui.test.mjs` holds the box (its clip, what
  it accepts, the picker, a Project's start).

### "We killed the chatbot."

Asked for: "create a onboarding system for existing users explaining the new
socria briefly for users who log back in 'we killed the chatbot'".

- Three short beats over the map (`components/onboarding/WhatsNew.tsx`): *We
  killed the chatbot. Socria is a map of your thinking now.* — with every
  conversation they had counted and on it; *Your map, not a list.* — circles,
  discs, links, the four lenses; *Everything starts in one box.* — ask or drop
  notes in, Projects on the map. Each with a drawing that does what it says.
- Shown once, to whoever did something in Socria before the new one first
  opened for them (`lib/first-run.ts` `socria.opened`, `usedBefore`,
  `wantsWhatsNew`), on the map — and on Core's chat for an account, where its
  last button opens the map. Rules and failure states: `docs/ONBOARDING.md`.
- Checked in the real app (signed out, through the dev stand-ins): a history
  from before was told over the map ("All 3 of your conversations are on it —
  nothing was lost."), *Show me my map* lifted it to show the map, a reload did
  not bring it back, the testing replay did, Esc skipped it; a history begun on
  the new Socria was never told; a stranger got the premise instead. In the
  browser harness, every beat in Paper, Night and Dark at 1440 and 390, with
  the animations stepped frame by frame. `test/whats-new.test.mjs` holds who,
  when, where and what.

### Celestial

Asked for: "rename / modify the night theme a bit as well. make it celestial
and make it all space themed, stars, genuinely beautiful and it has to make me
awestruck and amazed".

- Night is **Celestial** now (`lib/theme.ts`; the key stays `night`). The
  whole app is read under a sky, not just the map: `components/CelestialSky.tsx`
  is mounted once at the root, watches the theme on `<html>`, and is nothing on
  any other theme.
- **The sky** (`lib/celestial.ts`) is generated from a seed, so it is the same
  on every visit and every machine: ~2,400 field stars in the colours stars come
  in, the Milky Way as ~12,000 grains gathered into clouds along a bent band,
  brightest and warmest at its core, two ragged dust lanes winding through it,
  rose knots of glowing gas, four nebulae drawn along filaments, and 34 bright
  stars lifted out of the picture to twinkle — eight crossed with light.
  Counts follow the screen's area; a phone sees the galaxy closer.
- **Painted once, never a stutter.** The light goes on a half-resolution canvas
  the browser scales up; the stars on a full-resolution one over it, in steps of
  a few milliseconds run while the page is idle (`skySteps`), shown with a fade
  when whole. Timed in headless Chromium: 60–300 ms in all, no step over ~40 ms
  (the largest is allocating the canvas). A blur pass cost 280 ms on its own and
  was taken out. Canvases are capped (2048 px on a phone, 3072 on a desktop).
- **It moves, gently.** The sky wheels once an hour; the bright stars twinkle on
  their own beats; three shooting stars fall on prime intervals. Under reduced
  motion it is the same sky, still.
- **The map is a star chart** (`components/logos5/universe.css`): its own ground
  steps aside; two layers of nearer dust (`--cel-dust`, a seamless tile the sky
  paints) drift at depth as the map moves; sessions are stars with a bright
  core and a bloom; where to pick up has a corona and a cross of light; the one
  you are in, chosen or found is ringed with light; subjects are orbits whose
  dashes turn; quick questions twinkle; a link carries a comet
  (`UniverseBubbles.tsx`, `.l5b-link-comet`); the card, the box, the lenses and
  the timeline's history strip are glass; the lens's pill is gold.
- **Everywhere else** (`app/celestial.css`): the grounds step aside, a
  conversation's column is glass, the logic map's notebook grid is quieter,
  the sky dims a little behind reading. "We killed the chatbot." and the
  premise float on the live sky with the app out of sight behind them.
- Fixed on the way, for every dark ground: the onboarding's rules and Skip were
  paper's dark ink on the night (now drawn from the theme's ink), the offer to
  see it drawn under Core's chat was a pale slab, and the theme picker's
  swatches could never show a picture (an inline `background` hid it) — so
  Celestial's swatch is now a small galaxy.
- Checked in the browser at 1440×900 and 390×844: the four lenses of the map,
  a conversation, Core's chat, the premise and the welcome back, the bare sky,
  switching the theme on and off live (the sky comes and goes, the dust with
  it) and reduced motion (nothing turns, twinkles or falls).
  `test/celestial.test.mjs` holds the sky's shape, its painting, where it is
  shown and the star chart; `test/themes.test.mjs` the name.
