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
thinking is also one map — and that map is home: the **Universal Map**, every
conversation merged into one mind map, with the old list of chats put away.

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
   rail is under "List". Lines of thinking and projects (`LogosRail`), a drawer on
   narrow screens.

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

Logos 5 opens on the **Universal Map**, not on a list of chats. Every
conversation is merged into one mind map: each line of thinking drawn as its
own small graph — the topics its files were sorted into and the ideas its
Thinking Map grew — and each Core chat as a point of its own. The ideas two
conversations share are drawn as bridges, and the bridges pull what they join
together, so related thinking sits near itself and the whole reads as one map.

- **Open** a conversation by pressing it, or a card on it to open it there.
  **+ New** begins a line of thinking (the empty one already waiting, if there
  is one). The Socria mark, top left, always comes back here; so does
  "Universal Map" on a wide screen.
- **Find** an idea or a chat: what does not match dims; Enter opens the first.
  **All projects** narrows it to a Project. Drag to move; wheel, pinch or the
  buttons zoom; **Fit** brings everything back. Signed in, **Everything
  remembered** shows the Mind Atlas in the same place.
- **The chats on the left are put away.** The rail is still there, under
  **List** (and the menu), for renaming, deleting and filing in a Project — a
  drawer on a phone.
- Nothing is made up: a conversation with no map is drawn as itself and says
  "no map yet"; a line of thinking with nothing said in it is not drawn.
- It opens here unless a link, a Project or a first message chose a line of
  thinking, or there is nothing on the map yet (then it opens on "What are you
  working on?").
- Every position is computed, deterministically (`lib/logos5/universe.ts`):
  a spiral to start, a small fixed simulation — bridges pull, boxes that
  overlap push apart, a weak pull to the middle — then parting until nothing
  overlaps, the names under each cluster included.

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

**Home** (§5) has a contents column under **List** — every line of thinking
by its Project, then the rest, then chats; searchable; "Mind Graph →" at its
foot — and the shared ideas between two lines of thinking are named on their
bridges ("both talk about “runway”").

## 8. Data

Unchanged: the session and message shapes (`lib/logos-sessions.ts`), the
`/api/conversations` contract, ids (`lg_…`, `m_…`), every localStorage key
Logos 4 reads, the `#lg-m-<id>` anchors and `.lg-composer textarea` the
resume and jump code look for. New, per browser only:
`socria.logos5.stage.v1` (stage open per line of thinking, its width, and
whether the conversation is open beside the map).

Editing a sent message removes the messages after it, after an explicit
confirmation in place; the map is not rolled back and says so.

## 9. Phones

The view is the screen: the header, then **Components · Artifacts · Logic
Map** across the full width, then the view. The conversation is a sheet at the
foot — a grip, "Conversation · N turns ▴", the last reply as one line, and the
composer; pulled up, it is two thirds of the screen with the map still in
sight above it. A card asked about opens its popover over the map. The Mind
Graph is a scrolling column. The composer keeps the safe area; text is 16px;
every control is at least 44px.

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
| Home: the Universal Map (layout, search; the view, the List) | `lib/logos5/universe.ts`, `components/logos5/Universe.tsx`, `components/LogosApp.tsx` (search `HOME, THE UNIVERSAL MAP`) |
| Driving it in a browser by hand | `scripts/dev/logos5-journey.mjs` (the map: `STEPS=talk,talk2,stage,convo,card,cardask,arts`; study: `STUDY_FILES=… STEPS=intake,board,topic,practice,fill,check,more,askwhy,reload`; home: `STEPS=home,list,find,mind`) |

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
