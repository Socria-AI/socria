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

A new line of thinking opens on one question — **What are you working on?**
— with a place to drop notes, slides or an exam review and a line to say
what for. Socria reads the words back ("Looks like: studying for an exam ·
nothing to set up — change it any time"). With files, **Organize it** sorts
them; with only words, **Ask** starts the conversation exactly as before.

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

- past topics are **visual nodes**, grouped intuitively: **Today's
  learning**, **By week**, **By subject**;
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

**A node** (`lib/logos5/spatial.ts`):
- **A hub** is a major session: a study, something made in it, three turns or
  more, or a map that grew. It is a star with its name, its kind and how long
  ago beside it. Its size is how much it holds (View can make it recency, or
  all alike).
- **A dot** is a quick one-off question — a Core chat is always one, since
  the map knows a chat only by its name. Beside hubs a dot is ambient: named
  when pointed at, found, chosen or seen up close. In a cluster of only a few
  dots, each is named.
- Marks: a gold **?** when Socria asked something unanswered; a count of
  what was made in it; a star when starred; a gold ring and "last here" on
  the one to pick up; a dashed ring on one shown in a Project for its subject
  but not filed there (below).
- Nothing is made up. A line of thinking with nothing in it is not drawn.
- Closer, it says more: far off, the hubs' names; nearer, their kind and when;
  up close, where each stands and the dots' names.

**By subject** — the map the person arranges.
- **Projects first**, each a cluster in its own colour (the one Project Home
  shows), in the order they were made or the person's own; an empty one too,
  to drop into.
- **Then the subjects read from the conversations** (`lib/logos5/subjects.ts`)
  — no filing needed. The surest reading wins: the course a study was sorted
  under ("ACCT 2301 · Exam 2"); a course code in a conversation's name, first
  question or topic; the field Socria's map named while it thought
  (`map.ask.domain`); the kind of picture it drew (supply and demand is
  economics); its words against a short list of fields. A field with exactly
  one course in it joins that course.
- **A conversation about a Project's subject but not filed in it** is shown in
  that Project with a dashed ring and counted in "+ 1 about it · File it" —
  never filed without the person.
- **Everything else** last: what nothing places clearly, and a lone quick
  question (one dot is not a subject yet). Never a wrong subject because one
  had to be chosen.
- Inside a cluster the hubs are a **constellation** joined in the order they
  were begun; the dots sit below them. A new conversation joins the end of
  its cluster; nothing already there moves.

**By week** — newest first: This week, Last week, then weeks back by their
dates; after eight weeks, months. Each cluster's hubs are joined in the order
they were worked on.

**Today's learning** — what was worked on today in the middle (or, before
anything today, the last day something was: "Where you left off"); round it,
**the earlier conversations it builds on** — an idea in common first, then the
same subject or Project — each joined to the one of today's it leads to, with
why under its name ("shares 'Accrual basis'", "also in ACCT 2301"); beyond
them, everything else as an ambient field, a sector to each subject, named at
its edge. On a phone the three are read top to bottom.

**What conversations share** is named between them in their own words
("Monthly runway"), with a dotted line to each — across Projects and subjects
too, which is how a topic is seen connecting courses. An idea in three or
more is a **theme**. Pressing one chooses the conversations that share it.
(Today's learning leaves them out: its ring already says why each is there.)

Changing the lens moves the stars to their new places rather than redrawing
them, so it can be seen where each went. Today's learning is the default; the
lens chosen is remembered.

**Arranging** (By subject; `lib/logos5/arrange.ts`):
- **Drag a star** anywhere in its cluster; with **Snap into place** (on by
  default) it lands on a place, trading with whatever was there, and nothing
  else moves. **Into another subject**, it is given that subject (kept with
  the arrangement; "Its own subject" on its card gives it back). **Into a
  Project**, it is filed there.
- **Drag a cluster by its name** to move it with everything in it. Pointed
  at, its name offers **Fold**, and for a subject read from the
  conversations, **Make it a Project** (made, with them filed in it, in one
  undoable step). A Project's dot changes its colour and a double-click
  renames it — both the Project's own.
- **Shift-drag** (or **Select**) chooses several: **New Project from these**,
  move them, star them, hide them, or put them back in order.
- **Double-click the map** to write a note on it. **Link to…** on a card draws
  your own link to another, which you can name.
- **Star** puts a conversation in the strip at the top; **Hide** takes it off
  the map (View → Hidden brings it back; search still finds it).
- **Undo** and **Redo** (⌘Z, ⇧⌘Z) cover all of it, filing included. The
  lens, and how the map looks, are preferences, not undoable steps.
- Today's learning and By week are arranged by time; there a drag moves the
  map.

**View** holds the rest: the order inside a subject; Core chats on or off,
the shared ideas, snapping; labels (minimal, titles or ideas), colour (by
subject, kind or recency) and size (by depth, recency, or the same); which
subjects are shown; **saved views**; Hidden, Add a note, Tidy up, Reset layout;
and, signed in, **Everything remembered** (the Mind Atlas).

**One box finds or starts.** "Find or start…" in the header (press `/`)
searches names, ideas and where conversations stand; what does not match
dims, and Enter opens the first match. Otherwise its last choice begins a new
line of thinking with the typed words as the first question.

**Getting around.**
- Pressing a star opens its card: where it stands, Socria's open question,
  its ideas, and Continue, Star, Move to…, Link to…, Hide — and File it there
  when it is suggested for a Project. Pressing again, or Enter, opens it.
- Pointing at a star lights what it is joined to.
- Arrow keys go to the nearest star that way. Scroll moves the map, and pinch
  or ⌘/Ctrl-scroll zooms (`lib/canvas.ts`). The map refits when its room
  changes, unless it has been moved by hand.
- **List** in the header opens a column of every conversation by subject,
  starred first. The menu's "Manage conversations" brings back the rail.
- The Socria mark always comes back here.

**Night.** On the Night theme (Settings → Theme; everyone's, like Dark) the
map is a night sky: drifting star dust a little slower than the map, now and
then a shooting star, each cluster a nebula in its subject's colour, each hub
a glinting star, each dot a faint far one, constellations in faint light and
what conversations share in gold. Paper, White, Dark and One draw the same map
in their own colours.

**It travels.** The arrangement is kept in this browser and, signed in, in
the account (`user_profiles.universal_map` through `/api/profile`, the newer
copy winning). It holds only the person's choices — never a conversation's
words — and is bounded and checked on every read. One kept before the lenses
reads as By subject (a Project map or Columns) or By week (a Timeline); its
pins in a Project still hold.

"Organize it" and "Practice this" write into the line of thinking they began
in, even if another is opened while they work.

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
| The Universal Spatial Map: hubs and dots, subjects' homes, Today's learning, By week, By subject, placing and snapping (pure) | `lib/logos5/spatial.ts` |
| How the person arranged it: the model, its bounds, every change (pure); kept in the browser and the account | `lib/logos5/arrange.ts`, `components/logos5/useArrangement.ts`, `app/api/profile/route.ts` |
| The view, the map, the pieces; the map's look on every theme, and the sky on Night | `components/logos5/Universe.tsx`, `UniverseSky.tsx`, `UniverseParts.tsx`, `universe.css` |
| The themes, Night among them, and the picker | `lib/theme.ts`, `app/themes.css`, `components/account/ThemePicker.tsx` |
| Where home is wired in (start, file, a Project renamed or recoloured) | `components/LogosApp.tsx` (search `HOME, THE UNIVERSAL MAP`), `app/chat/page.tsx` (`updateProject`) |
| Driving it in a browser by hand | `scripts/dev/logos5-journey.mjs` (the map: `STEPS=talk,talk2,stage,convo,card,cardask,arts`; study: `STUDY_FILES=… STEPS=intake,board,topic,practice,fill,check,more,askwhy,reload`; home: `STEPS=start,seed,home,find,press,star,hide,undo,drag,lasso,note,viewmenu,mode,list` with `MODE=Today|Week|Subject`; any of them on a theme with `THEME=night`) |

Core chat (`app/chat/page.tsx`) is not part of this change. Logos 2 keeps its
two columns. Everything Logos 3–4 could do is still reached from Logos 5: the
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
| "Find or start…" with "Should I take the job in Austin?" | A line of thinking begun with those words as its first question; back home, a large card with where it stands, Socria's open question marked, and **Pick up where you left off**. |
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
