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
thinking is also one map: the **Universal Map**.

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
3. **The rail** — lines of thinking and projects (`LogosRail`), a drawer on
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

## 5. The Universal Map

Every line of thinking, each drawn as its mind graph — the topics its files
were sorted into and the ideas its Thinking Map grew — on one map, with the
ideas two conversations share drawn as bridges between them. A conversation
with no map is shown as itself and says "no map yet"; nothing is made up for
it. Press one to go there, or a card to go to it on its map. Drag to move,
wheel or buttons to zoom. Signed in, "Everything remembered" shows the Mind
Atlas (every chat, Core's too) in the same place. Pure layout:
`lib/logos5/universe.ts`. From the header (in the menu on a phone with a
study open).

## 6. Data

Unchanged: the session and message shapes (`lib/logos-sessions.ts`), the
`/api/conversations` contract, ids (`lg_…`, `m_…`), every localStorage key
Logos 4 reads, the `#lg-m-<id>` anchors and `.lg-composer textarea` the
resume and jump code look for. New, per browser only:
`socria.logos5.stage.v1` (stage open per line of thinking, and its width).

Editing a sent message removes the messages after it, after an explicit
confirmation in place; the map is not rolled back and says so.

## 7. Phones

The thread is the screen. The stage is a full-screen sheet over it, opened
from the header's **Map · N** or from an effect chip, closed with
"Conversation". The composer is sticky with the safe area; the text is 16px;
every control is at least 44px.

## 8. Switch

`NEXT_PUBLIC_LOGOS5=off` brings back the Logos 4 layout without a deploy of
code. Logos 2 is unchanged.

## 9. What is where

| Piece | File |
|---|---|
| The turn, the pending reply | `components/logos5/L5Message.tsx` |
| Header, menu, link bar, stage head, outline | `components/logos5/L5Chrome.tsx` |
| The screen's styles | `components/logos5/l5.css` |
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
| Intake, board, topic, practice, steps | `components/logos5/Study.tsx`, `components/logos5/study.css` |
| The Universal Map | `lib/logos5/universe.ts`, `components/logos5/Universe.tsx` |
| Driving it in a browser by hand | `scripts/dev/logos5-journey.mjs` (study steps: `STUDY_FILES=… STEPS=intake,board,topic,practice,fill,check,more,askwhy,universe,reload`) |

Core chat (`app/chat/page.tsx`) is not part of this change. Logos 2 keeps its
two columns. Everything Logos 3–4 could do is still reached from Logos 5: the
workspace panels, "+ View", every lens, displays, documents, models, Live 3D,
Synthesize, Draft, Capture, Voice, sharing and comments.

## 10. Results

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
| Organize it | "Socria · sorted 2 files into 7 topics"; seven cards in three columns with their quotes and pages; one **Recommended start**; the conversation holds the turn and what was done. |
| A topic pressed | The others dim; its panel lists the quote with "Ch5_Adjusting_Entries.pdf · p.3" and the four actions; the composer says "Asking about Accrued expenses". |
| Practice this | "Record the adjustments for March 31", made from ◇ Ch5 · p.3 and ◇ Exam 2 review sheet · p.1: two events, ten blanks, the equation from $26,850. |
| Filled (one entry right, one wrong, equity wrong), checked | 5 of 10; "Debits equal credits ✗", "The equation holds ✗"; two gaps, each with the whole entry, why, and its page; wrong rows tinted. |
| Try 3 more like these | A new set of three; the events already practised are sent along to be left out. |
| Ask why → Logic Map | Step 3 opens: the question asked about the topic (Point & Ask), the map beside it. |
| Universal Map, three lines of thinking | Each drawn as its graph — a study's topics, a conversation's ideas — and "no map yet" for the empty one. |
| Reload | The study is still there: seven cards, the steps. |
| Phone | The board a list, a topic a sheet, the journal table a stack (account, then debit and credit); the steps name only the open one; no horizontal scroll. |
| Page errors | None. |

Found and fixed on the way: class names that collided with the shared
thread's stylesheet (`.st-act` was hidden there), renamed `l5s-`; a cell
width rule that also matched the inputs inside it, which pushed the phone
table off the screen; links that jumped a column ran behind the cards
between, so only neighbouring columns are linked.

Tests: `test/logos5-linking.test.mjs` (20), `test/logos5-ui.test.mjs` (49),
`test/logos5-study.test.mjs` (78), `test/logos5-study-ui.test.mjs` (32), and
the existing suites, unchanged in what they hold.

**Not verified here:** a real model's sorting and journal entries (the stand-in's are canned from the files' headings and amounts — the code that keeps only what the files bear out is tested, the model's judgement is not), a signed-in Universal Map's "Everything remembered" (the Mind Atlas needs an account), a real model's streaming (the stand-in streams
canned text), a signed-in shared line of thinking (group view) on the new
screen, a reply's citation chips opening their passage (the stand-in does not
cite), and Live 3D in the stage. Each reuses code that was not
changed, but has not been watched working in Logos 5.
