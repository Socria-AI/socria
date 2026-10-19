# Logos 4

Logos 4 is the version demonstrated at MavMarket. It adds no new engine. It
unifies what Logos 3 (computation, models, simulation) and Logos 3.5
(everyday displays, documents, evolving memory) already do, behind one
decision about **how to help a person think on this turn**, plus four
features people reach for daily. The emphasis is on reliability, phones and
cost.

This file is the plan written after the audit (Phase 1). Each section names
what is reused, and what is new and why. The results section at the bottom is
filled in from measurements, not intentions.

---

## 1. What the audit found

| Area | Where | State | Logos 4 |
|---|---|---|---|
| Conversation | `app/api/logos/chat/route.ts` | One streamed reply per turn. The prompt (`LOGOS_CHAT_PROMPT`) already says: answer questions of fact, use maths modes, challenge readily, leave space. The accuracy plan computes mathematics and holds turns that need checking. | **Kept.** The new engine adds per-turn evidence and enforcement in front of the same prompt. |
| Question budget | `lib/core4/questions.ts`, `budget.ts`, `stream-gate.ts` | Core 4 limits questions and strips sycophantic openers. **Logos runs the gate in `filterOnly` mode, so neither reached Logos.** | **Reused.** The engine prices questions from the transcript, the gate enforces the price, and the sycophancy strip applies. |
| Explicit signals | `lib/core4/signals.ts` | Deterministic reading of "just tell me", "don't give me the answer", "stop asking", corrections, frustration, venting. | **Reused** verbatim as the engine's highest-authority input. |
| Verification | `lib/accuracy/*` | Symbolic and numeric checks; pushback handling; Answer Guard withholding. | **Reused.** The engine's `verify` mode is driven by the plan's own findings. |
| Core 4 selector | `lib/core4/allocation.ts`, `intervene.ts` | Needs a CognitiveState from a reader LLM call and is tuned to Core's chat. | **Not reused whole.** It would add a model call per turn and a second copy of Core's state machine. The engine composes the deterministic parts above instead. |
| Selection ("this") | `lib/workspace/focus.ts` | Typed focus (node, model object, parameter, input, display part), described from canonical state and sent with the turn. Display parts: data rows and columns, diagram nodes, matrix and function parts. Document passages travel separately as `docFocus`. | **Extended** for Point & Ask: table cells, passages, expressions; an explicit "Ask Socria" affordance; the asked-about object recorded on the message. |
| Persistence | `lib/logos-sessions.ts`, `/api/conversations` | A whole session (messages, map, draft, contexts) is saved with one PUT; the active session id and each map's camera are kept per browser. Not kept: thread scroll, the half-typed message, the selection, the open phone tab, the reading position. | **Instant Resume** keeps that view state per session in the browser: no database writes, and the right thing across screen sizes. |
| Displays | `lib/objects/display-*` | Deterministic words→data path (`dataFromWords`) for charts of the person's numbers; validated kinds; undo. | **Bugs found:** a `$1,200` amount is dropped and its label merged into the title; a "pie chart" request is drawn as bars by the words path. Fixed with tests. |
| Documents | `lib/docs/*` | Verbatim blocks with page and position ids; vision readings marked and `[illegible]` instead of guesses; numeric and sign checks; every citation graded verbatim, derived, interpretation or unsupported. | **Kept.** Integrated with Point & Ask (a selected passage is a focus); gaps fixed as testing finds them. |
| Memory | `lib/mind/*` | Mind Graph recall and remember; provenance (stated vs inferred); proposed changes; stale marks when something a belief rests on changes. | **Kept.** The engine reads a small map digest (unexamined assumptions, conflicts) so a challenge is grounded in the person's own map. |
| Uploads | `app/api/files/*`, composer attachments | Large files go to transient storage, deleted after reading. Composer images are downscaled and read, then kept inside the message. | **Quick Capture** keeps the composer's attachment shape (same sanitiser, same limits) in a private captures table. No new bucket. |
| Phone layout | `app/globals.css` (Logos mobile block) | One surface at a time; floating Conversation/Map switch. **Bug:** the toolbar's mobile padding at line 3101 is overridden by a later rule at line 7199, so the switch covers Synthesize and the model picker. Canvas displays overflow narrow screens. | Fixed, plus phone-specific work (section 5). |

## 2. The Cognitive Interaction Engine — `lib/cognition/assist.ts`

One pure function, called once per Logos turn, with **no model call**. It
answers which kind of help this turn wants:

| Mode | When |
|---|---|
| `inform` | A question of fact or a quick calculation, or they asked for the answer outright. |
| `explain` | They asked how or why, or a concept is plainly missing. Scaffolded to what they have shown in this conversation. |
| `verify` | They offered work, or pushed back on a claim; the accuracy plan decides it. |
| `construct` | They asked for a model, chart or display to be built or changed. The reply points at what they can change, so they are working with it, not reading about it. |
| `challenge` | Their message rests on an assumption their own map marks as unexamined, or contradicts something already on it. |
| `perspective` | They asked Socria to decide. Give the considerations and the alternatives; the decision stays theirs. |
| `ask` | A question is the strongest move and the budget allows one. |
| `space` | Venting, brainstorming or mid-flow: a short beat, no question. |

Principles, applied only where they have support:

- **Adaptive scaffolding:** help scales with task difficulty and what this
  conversation shows (claims checked correct or wrong). It never infers traits
  or mastery from one message.
- **Self-explanation:** after a correct step in a learning context, at most
  one invitation to say why it works, inside the question budget.
- **Metacognition:** an unexamined assumption or a claim the engine refutes is
  named plainly.
- **Active construction:** for anything built, the reply points at what to
  change, not a description of it.
- **Calibrated reliance:** nothing is withheld unless they asked or the
  Answer Guard is on, and an explicit "just tell me" is honoured.
- **Retrieval practice and spacing:** only in a learning context, and only
  when they come back to a topic after a gap; one recall question, never
  imposed on anything else.

The decision is invisible. It renders one short block for the prompt and one
number for the stream gate (questions allowed), and its reason codes go to a
content-free header for tests and diagnosis.

## 3. The four features

- **Point & Ask:** any selectable thing becomes the focus: a map node, a
  model object or parameter, a chart point (row), a table cell, a diagram
  part, a document passage, a mathematical expression. An "Ask Socria" chip
  appears with it (desktop and touch), and the turn carries the object's id,
  type, content and links from canonical state. The user message records what
  it was about, so the thread still reads correctly later.
- **Instant Resume:** per-session view state in the browser: thread scroll,
  the half-typed message, the selection, the open phone tab, the reading
  position. Restored on return; anything that no longer exists is dropped
  quietly. A new line of thinking offers the most recent unfinished one,
  quoting the question waiting on them.
- **Quick Capture:** a note, idea or photo saved in two taps into a private
  inbox (`captures` table, row-level security, export and delete covered).
  Captures can be edited, deleted, or turned into a new line of thinking, a
  node on the current map, or an attachment in the composer. Nothing becomes
  a project or task by itself. Before the migration runs, or when signed out,
  the inbox lives on the device and says so.
- **Voice to Text:** a mic in the composer. Audio is recorded in the browser
  (MediaRecorder), transcribed by the existing model provider through
  `/api/transcribe`, and put into the composer for editing. Nothing is sent
  automatically, and audio is not stored.
  - Permission, cancel, retry, a two-minute cap, track cleanup and clear
    errors are all handled.
  - Hidden where the browser cannot record or no transcription key is set.

## 4. Feature flags

`lib/logos4/flags.ts`. Every Logos 4 feature can be switched off per
deployment (`NEXT_PUBLIC_LOGOS4_*=off`). They default **on** only where they
are complete and tested. Voice also needs a server transcription key, and the
mic is not drawn without it.

## 5. Phones

- **Toolbar override, fixed.** The control row's phone padding was written
  before its base rule and lost to it, so the floating Conversation/Map switch
  sat on Synthesize and the model picker. The phone rule now follows the base
  rule, clears the switch and the home indicator, and wraps instead of running
  off the left edge (`app/globals.css`, "the control row beside the composer").
- **Zoom control off content.** On a phone the map's 150px zoom bar sat over
  the chart it was zooming. Phones pinch to zoom, so only "show all of it"
  stays: one 40px square in the corner.
- **Usage bar on one line.** It wrapped to three rows on a 390px screen; it now
  scrolls sideways on one.
- **Composer at 16px**, so iOS does not zoom the page on focus.
- **Touch targets of at least 44px** for the mic, the capture inbox and the
  Point & Ask sheet's actions.
- **Point & Ask as a bottom sheet.** On a phone the workspace inspector (what
  is selected, "Ask about this", "Clear selection") docks to the bottom edge,
  full width, with thumb-sized actions.
- **Quick Capture as a bottom sheet** (88% of the screen), the Capture button
  as an icon in the control row.
- **Not changed:** a display on the map canvas is laid out at the canvas's
  width and can be wider than a phone at the default zoom. "Show all of it",
  a pinch, or the display's own tab (which draws it at the screen's width)
  bring it into view. Re-laying the canvas per screen width was not worth the
  risk to the desktop layout.

## 6. Everyday reliability

The words→chart path is deterministic, so each fix is held by a test
(`test/logos4-reliability.test.mjs`):

- **`$1,200` and "pie chart"** (the two audit bugs) were already fixed when
  this phase started; they are now held by tests in five phrasings.
- **A question before the numbers.** "Can you make a pie chart? Rent $1,200 /
  food $400" read "Rent" into the title and dropped its number. A sentence that
  ends before the numbers is now the request, and a spaced slash separates list
  items (`lib/objects/display-words.ts`).
- **"Show my spending as a pie: …"** was not recognised as a chart request at
  all without a chart verb. A form named for the numbers ("as a pie", "in a bar
  chart") now is, and "pie" in passing still is not
  (`lib/objects/display-request.ts`).

## 7. Memory

The engine reads a small digest of the map the client sends with each turn
(`lib/cognition/digest.ts`: unexamined assumptions, conflicts) and challenges
a message that leans on one, once (`challengeTarget` in
`lib/cognition/assist.ts`). The Mind Graph's recall is unchanged. Captures are
not memory: nothing in the inbox reaches the model until the person sends it.

## 8. Results

Measured on this branch, not intended:

| What | Result |
|---|---|
| Quick Capture route, store, cleaners | `test/logos4-capture-voice.test.mjs`: every capture is per-person (another account cannot read, edit, delete or overwrite one by id); retried saves and repeat device moves never duplicate; a remote image URL is refused; the 200-capture ceiling holds; a database without the table reads as "unavailable", not 500 |
| Voice route | Same suite: no key or flag → the mic is not offered; signed out without an access key → 401; non-audio, empty or over-4 MB recordings refused before any paid call; an unknown model name falls back to `whisper-1`; nothing about the audio is written |
| Chart from words | `test/logos4-reliability.test.mjs`: 29 checks, every number kept under its own label |
| Browser, 390×844 phone | Capture saved → "Think it through" opened a new line of thinking with it in the composer, unsent; the mic recorded a fake device, transcribed through the local stand-in, and put the words after "Compare" at the caret; no page errors; no horizontal page scroll |
| Not verified | A signed-in account inbox in a browser (the local harness has no real Clerk session; the route suite covers it), and transcription against the real provider (needs the deployment's key) |

## 9. Feature status

| Feature | Status |
|---|---|
| Cognitive Interaction Engine | Shipped (dev) |
| Point & Ask | Shipped (dev); phone bottom sheet |
| Instant Resume | Shipped (dev) |
| Quick Capture | Shipped (dev): `app/api/captures`, `components/CaptureInbox.tsx`. Accounts need the `captures` table from `supabase/schema.sql` + `rls.sql`; until it exists the inbox keeps captures on the device and says so |
| Voice to Text | Shipped (dev): `app/api/transcribe`, `components/useVoiceInput.ts`, the composer's mic. Uses `OPENAI_API_KEY`; `OPENAI_TRANSCRIBE_MODEL` optional |
