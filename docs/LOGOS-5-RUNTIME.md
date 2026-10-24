# Logos 5 — the unified runtime

Logos 5 replaces the separate Core product. One surface for thinking,
writing, learning, researching, modelling and creating; Core 4's cognitive
machinery becomes infrastructure underneath it; Alex Tran's four-view
interface (`Logos 5 Comments (v2)`) is how a person reaches it.

This document is the architecture audit (§1–§3), the runtime it produced
(§4), the interface (§5), memory (§6), how it is measured (§7), how it is
switched and rolled back (§8), and what is not finished (§9). Line references
are to the tree at the time of the audit and drift; the function names do not.

---

## 1. What was there

Four read-only audits — Core 4 and the Logos 4 engine, memory, documents and
artifacts and persistence, and the Logos 5 interface against Alex's
specification — each verified "used by" with grep rather than by reading
comments. The short version:

**Core 4** (`lib/core4/`, used by `app/api/chat`) is a deterministic decision
layer around one model reader:

- `readState` (`lib/cognition/engine.ts`) — **a model call every turn**
  (`gpt-4o-mini`, 2 s budget) that fills a large `CognitiveState`, merged with
  the person's explicit words taking precedence (`merge.ts`).
- `splitFor` (`split.ts`) — the **CognitiveSplit**: eight dimensions
  (reasoning, metacognition, judgment, creativity, retrieval, representation,
  verification, mechanical) × four roles (perform, share, scaffold, human).
  Pure.
- `allocate` (`allocation.ts`) — eight modes, a quoted reason for anything
  withheld (no quote, no withholding). Pure.
- `selectIntervention` (`intervene.ts`, 17 moves), `questionBudget`
  (`budget.ts`), `SentenceGate` (`stream-gate.ts`), `considered.ts` (novelty),
  `contribution.ts` (what is missing), `voice.ts`, `signals.ts`. All pure.
- Verification: `exactCheck`, `computeAsked`, `statedSlips` (pure);
  `checkWork`, `guardModel` and counterfactual ablation (model calls,
  conditional); `lib/accuracy` (pure, shared with Logos).
- Web: `webIntent` (a deterministic gate — never on a sensitive or
  off-the-record turn), `runResearch` over Serper/Tavily, numbered citations.
  Wired into Core 4 only; citations are checked only on buffered turns.
- A reasoning ledger, history, capability evidence and a per-turn trace, all
  persisted.

**Logos** (`app/api/logos/chat`, `app/api/logos/map`) had its own engine
(`lib/cognition/assist.ts`, nine modes) that reused Core 4's budget, gate,
signals and question tools — but **not** the split or the allocation — and
recorded no state, ledger or trace. Per turn: one streamed reply (Sol), a
**full map extraction** (Terra since this week, ~19k tokens of instructions),
a Mind Graph write (`gpt-4o-mini`), and every fourth turn a second memory
write to a different store (`/api/update-understanding`).

**Memory** is two person-memory stores written on the same Logos turns (the
Mind Graph tables and `user_profiles.understanding`), with separate
tombstones. The Mind Graph has provenance and a review flow for *changes*,
but: a model's `stated` label is never checked against what the person
actually wrote; a file can assert facts about the person; changes the model
proposes take effect before anyone reviews them; recalled memory reaches the
prompt with no provenance; the Logos 5 atlas shows "Confirmed" and "You said
it" for nodes nobody confirmed and nobody said; hand edits keep no previous
value and are not protected from the next extraction; off-the-record Logos
turns still reach the understanding pass.

**Documents** are read in the browser or by `/api/files/read`, kept on the
device (IndexedDB), lettered A–Z per conversation, retrieved by BM25 per turn
(no embeddings), cited as `[A3.12]`, and checked client-side. Block ids are
positional. **Artifacts** — scenes, model documents, objects, displays, the
study board — all live inside `conversations.map`; nothing records which
message made them. The draft lives in `conversations.draft`.

**The interface** had three views (Components · Artifacts · Logic Map), no
chat view (the conversation folded beside them), ordinary chat landing on the
Logic Map, a header of eleven controls, "+ View" only inside the Logic Map,
no global search, the "Where do you want to start? Test yourself / Deep
analysis" card, a heavily serif chrome, a composer with its attach button
under the text, "Thinking…" dots and no processing milestones, Universal Map
titles that were the first message verbatim, a "Your map, not a list"
banner, a legend, and a Today lens that fell back to the last day worked.

## 2. Decisions

| Area | Decision | Why |
|---|---|---|
| Core 4 `splitFor`, `allocate`'s rules | **Inherit** into the runtime's allocation | Deterministic, tested, and the thing Logos lacked |
| Core 4 `readState` (a model call per turn) | **Replace** with a deterministic state | The brief asks for a lightweight state; a 2 s model call on every turn is neither |
| Core 4 budget, gate, signals, questions, considered | **Inherit** (already shared) | Proven, pure |
| Logos 4 `chooseAssist` | **Refactor** — becomes the move inside the runtime's allocation | Two move deciders for one product was duplication |
| Core 4 web research | **Inherit** into Epistemic Control, behind the same gate | Already safe (sensitive and off-record turns never search) |
| `lib/accuracy` | **Inherit**, extended to facts, citations and sources | The math path works; facts had no equivalent |
| `LOGOS_CHAT_PROMPT` (17k characters) | **Replace** with a compact core plus blocks chosen per turn; the old one kept behind `LOGOS_PERSONA=classic` | Its stance ("you are the mirror", "never resolve it on the first pass", "the bar for pushing is low") is the withholding the brief retires |
| Per-turn map extraction | **Replace** with on request, while the Logic Map is open, and a light background cadence | Alex's Rule A, and the largest per-turn cost |
| `/api/update-understanding` from Logos | **Retire** for Logos 5 when the Mind Graph is on | A second memory store written on the same turns |
| Core 4 ledger, capability, counterfactual | **Keep** in Core 4; **not** carried into Logos 5 | Each is a model call or a store whose value in Logos is unmeasured; the brief asks for ablations before significant subsystems |
| `lib/cognition/guard.ts`, `router.ts`, `lib/core4/tools-contract.ts` | **Retire** later (test-only / dead) | Not removed in this pass: tests import them |
| The "Components" view | **Rename** to Content | Never persisted, so a rename with no migration |
| Study start card | **Retire** | Alex: no forced Study vs Deep Analysis choice |
| Core chat surface | **Retained, not offered** from Logos 5 | Logos 5 is the surface; Core conversations already open inside it (MG-2). Access and plans are unchanged |

Nothing is deleted from storage. No column is dropped. No stored shape is
rewritten.

## 3. Defects found on the way

Recorded here because some are outside this work and should not be lost:

- `lib/mind/ingest-text.ts` sets `sourceNodeId` to the `src_` row id, so the
  Inspector's file list is always empty. To be fixed with the memory stage (§6).
- Every storage write calls `sanitizeMap` without `trust:'stored'`, which
  strips `viz.built` on save (`app/api/conversations/route.ts`). Not changed
  here — it needs its own test of what a stored scene must keep.
- `docs/CORE-4-ARCHITECTURE.md` describes a `calibration.ts` that does not
  exist, four ablations where the code allows six, prompt "v6" where the code
  is v9. `docs/LOGOS-4.md` and `docs/ACCURACY.md` describe a filter-only
  stream gate that is now the full gate.
- `conversations.incognito` is documented as "never remembered" and no remember
  path reads it.

## 4. The runtime (`lib/runtime/`)

Six subsystems, one module each, **not six agents**: every one is a pure
function over the turn and the workspace, called in sequence by the route,
and most turns end in one model call.

```
            ┌───────────── the person's turn + the workspace ─────────────┐
            │                                                              │
   orchestrate.ts  → path (fast · standard · verified), intent, which view to
            │        reveal, which calls run, which model
   state.ts        → the cognitive state: objective, intent, domain, workspace,
            │        open questions, assumptions, preferences, progress
   allocation.ts   → CognitiveSplit + the move: what Socria does, supports,
            │        and leaves to them; the question budget
   behavior.ts     → the compact instructions for this turn
   epistemic.ts    → what may be asserted: evidence, sources, checks, labels
   representation.ts → the workspace as typed objects with ids and links
            │
            └──→ one reply (standard) · reply + evidence + checks (verified) · none (fast)
```

### 4.1 Inference Orchestration — `orchestrate.ts`

- **Fast path** — no model: map edits, scene and object commands, view and
  interface requests, displays made from the map. These were already
  deterministic in `send()`; the runtime names them.
- **Standard path** — one reply call. No map pass, no second memory store.
  The Mind Graph write runs only when the turn has something to remember.
- **Verified path** — when a check is justified: mathematics (`lib/accuracy`),
  a question that needs current information (the web gate), a question about
  attached documents, a pushback on an earlier answer, a request to build
  something (the map/engine pass), a request for structure (the Logic Map).

Intent (Alex's Rules A–D) is read deterministically from the turn by the
detectors that already exist (`wantedSimulation`, `readDisplayRequest`,
`constructAsk`, view requests) plus a structure reader. The client and the
server call the same function, so the view that opens and the work that runs
cannot disagree.

**The map pass** runs: on a structure or build request; while the Logic Map is
the open view; on opening the Logic Map when the map is behind the
conversation; and in the background once a line of thinking has three
substantive turns, then every fourth (so the Universal Map, search and the
5-node rewards challenge still see maps — see §9).

**Model routing** — one table: reply on Sol (`OPENAI_MODEL_LOGOS`), the map
on Terra (`OPENAI_MODEL_LOGOS_MAP`), memory extraction and titles on
`gpt-4o-mini`. **Prompt caching**: stable instructions first and alone in
their message, then history, then the turn; the history window moves in
steps of sixteen instead of one, so it stays cacheable in long conversations.

### 4.2 Cognitive State — `state.ts`

Derived every turn from the conversation and the workspace, never by a model,
never stored as memory: the objective, this turn's intent, the domain
(business, research, engineering, writing, learning, creative, mathematics,
everyday), what is open in the workspace, open questions and assumptions
(from the map's digest), assistance preferences (their explicit words:
"just tell me", "fewer questions", the Answer Guard, the Conversation Style),
and progress. No personality labels; nothing about health, beliefs or
identity is inferred.

### 4.3 Cognitive Allocation — `allocation.ts`

Core 4's `splitFor` decides each dimension's owner from the state; the move
comes from the Logos 4 engine; the result is rendered as one short block:

- *Socria does*: calculations (computed, never recalled), formatting,
  retrieval, explanations of established facts — directly.
- *Socria supports*: reasoning — a hint and a check when they are learning,
  the full answer when they are not.
- *Theirs*: consequential decisions (Socria lays out what the decision rests
  on and, when asked, says what it would weigh — the call stays theirs), and
  the substance of writing that will be theirs (structure, critique and
  sharper versions of their sentences, not a finished essay from nothing).

Withholding happens only under the Answer Guard they switched on.

### 4.4 Behavioral Control — `behavior.ts`

A compact core (who Socria is, how it speaks, how it handles questions,
disagreement, uncertainty, incomplete requests and memory) and blocks chosen
per turn (mathematics, documents, the picture, building a model, the guard).
The voice is a capable colleague's: direct, warm, practical, intellectually
honest — never a scold, never flattering, never a therapist, never a Socratic
performance. An incomplete request is met with a concrete start and the two
or three directions it could go, not with a demand for more information.

### 4.5 Epistemic Control — `epistemic.ts`

Before the reply: what kind of claim the turn asks for (a fact, a current
fact, a figure, a reading of their documents, a calculation, an opinion, a
creative task) and what evidence exists (their documents' passages, web
sources when the gate opens and a provider is configured, the engine's
computations, memory with its provenance). Evidence is given ids
(`[A3.12]`, `[W2]`) and the rules: cite only those, say when nothing
settles a claim, report conflicts between sources.

While and after the reply, deterministically: every citation must name
evidence that was given (an invented `[W7]` or a link that no source carried
is removed as the reply streams); figures in a factual answer are checked
against the evidence; claims are labelled **supported**, **qualified**,
**unverified** or **contradicted**; conflicting sources are detected before
the reply and named in it. A contradicted or fabricated claim triggers the
existing corrective retry (held turns) or a correction after the reply
(streamed turns). Ordinary reasoning, brainstorming and creative work are not
gated: the checks apply to claims of fact.

### 4.6 Representation — `representation.ts`

A typed index over what already exists — conversations, messages, documents
and passages, artifacts (scenes, models, objects, displays, practice,
writing), map nodes and edges, writing cards — with stable ids
(`conv:`, `msg:`, `doc:`, `blk:`, `obj:`, `model:`, `node:`, `write:`,
`card:`), provenance (person, Socria, source, computed) and the links that
exist (attaches, cites, stands-for, drafted-from, grounds, about). It is
derived, not a second store, so it cannot drift from the data. Search
(Cmd/Ctrl+K), the Content view and provenance chips read it. Hand-authored
map labels are protected from the extractor (§6).

## 5. The interface (Alex's specification)

Implemented in `components/LogosApp.tsx` over three pure modules —
`lib/logos5/views.ts` (the state machine), `lib/logos5/title.ts`,
`lib/logos5/content.ts` + `contentBoard.ts` — and the shell in
`components/logos5/L5Views.tsx`, `ContentView.tsx`, `GlobalSearch.tsx`,
`l5v.css`. Held by `test/logos5-views.test.mjs` (the modules),
`test/logos5-shell.test.mjs` (the wiring) and browser journeys on desktop and a
390 px phone in Paper and Night, with axe (WCAG 2 A/AA) clean on Chat, the
Logic Map, Split View, Content and search.

**Four views.** `Screen = { view: 'chat' | 'content' | 'artifacts' |
'logic_map', beside: BesideId | null }`, per line of thinking, this visit only.
A line of thinking opens on Chat. "Components" is Content everywhere it is
said. The tab row is a tablist (arrow keys, Home/End) with what each view holds
counted, and a dot when something arrived in a view that is not open (a reply
while Chat is away, something made in the background, the map grown).

**Rules A–D, from the runtime's own reading** (`routeTurn`, the same function
the server runs), applied once when a turn is sent (`afterSend`):
A talk stays in Chat — from another view on a wide screen the conversation
docks beside it, so what they were looking at stays; the Logic Map never opens
for talk. B documents are read into Content in the background and said under
the turn ("Added to Content · file · Open Content"); the screen does not move.
C something asked to be made opens Artifacts with the conversation beside it;
a display, a model or a plot that lands because the turn asked is selected
there (`onMade`); one made in the background marks the tab and moves nothing.
D structure asked for opens the Logic Map — with the conversation beside it on
a wide screen, so the reply is read beside the map it draws (Alex's text is
silent on this; without it the reply streamed off screen). A question asked on
a card's popover is answered there and moves nothing. A surface named in words
("open the display", "the model beside the map") maps onto views
(`screenForRequest`) instead of rearranging a workspace.

**Logic Map** is the Thinking Map and only it: the workspace layout is
normalised to a single map panel in Logos 5 (not written back, so a Logos 3
arrangement in the browser is untouched), "+ View" is gone, and the map's own
name row and colour key are hidden (the cards name their kinds). It is drawn
when it is worth its cost (§4.1 `needsMap`): structure or something to see
asked for, while it is the view, and on a light cadence; opened on a map older
than the conversation it is drawn again, once.

**Split View** replaces "+ View": one panel beside whichever view is open, in
Alex's three sections, built from the same catalogue "+ View" used (so each
panel opens configured for what is there), resizable by a separator that takes
the arrow keys, closed by Escape or its ×. Desktop only; a phone shows one
thing.

**Content** is a canvas of cards (documents, notes, pictures — each document
once): drag to place, drop onto another to stack, a menu to stack or unstack,
arrow keys to move, Enter to open; the arrangement is kept per line of
thinking on the device; the documents are never changed. Opened, a document is
read in its document view; the topics files were sorted into sit below, the
recommended one marked on its card — the "Where do you want to start?" panel is
gone. **Artifacts** holds everything made: the writing (once begun), models
and their pictures, the plot, Live 3D scenes, displays (not documents), practice.

**Top bar**: "← Universal Map" at the top left, the title, a new line of
thinking, search in the middle (⌘K / Ctrl K from anywhere), Split View, the ⋯
menu (Synthesize and the Universal Map are no longer in it; "Back to Socria
chat" is gone with the separate Core product), and the account. Memory moved
into the account chip's own menu. Synthesize is the Content and Logic Map
views' own action.

**Search** indexes the representation layer (§4.6) — every line of thinking,
what was said, documents and their passages (all documents this device has
read, loaded when the box opens), artifacts, writing and cards, map nodes — and
opens a result where it lives: a turn scrolled to in Chat, a passage selected in
Content, a card lit on the Logic Map. Typo tolerance is per word (one slip,
two in a long word).

**Omnibox**: one 28 px pill (the second box round it removed), ≤ 768 px,
centred, neutral shadow, the paperclip inside at its left; Enter sends,
Shift+Enter is a newline, an IME composition is never sent; it grows to 240 px
and then scrolls, and is re-measured when what it says changes (the longer
words shown while Socria replies used to leave it two lines tall on a phone).
While nothing has arrived the send button spins and nothing more is sent.

**Loading, truthfully**: the thread shows a shimmer and only milestones that
happened — files read on this device, Sent, the number of sources found (from
the server's `X-Socria-Sources` header), then "Writing the reply", and "Drawing
the Logic Map" while that pass runs. Sorting files shows its own steps.

**Type**: Inter and the system stack for the whole shell, base 15 px at
line-height 1.35, weights 400/500/600, the placeholder upright in the same
face. Muted text was raised to ≥ 4.5:1 — the Paper theme does not define
`--lg-ink-rgb`, so the stylesheet carries its Paper values as fallbacks.

**Universal Map**: no banner, no legend, no hint strip. Today is exactly what
was begun on this calendar day in local time (`dayBounds`), nothing earlier
however related, no Projects or subjects folded round it; an empty day is one
centred invitation, "No sessions recorded today. Start a chat to begin a new
map node." A node's label is at most seven words with an ellipsis
(`nodeLabel`), one line outside a node and clamped inside a hub's disc (a
single line there would cut most titles to two words). This month and All
time: the wheel pans sideways (Shift for up and down when there is more to
see; Ctrl/⌘ is zoom). Titles: deterministic from the first message
(`topicTitle`: "Help me study for this big bio test tomorrow night please" →
"Biology – Exam Review"), then once per conversation, for accounts only, a
small model names the topic as a concept (`/api/extract-memory`,
`titleStyle: 'topic'`) — never over a title the person chose. The Universal
Map stays where a returning person lands; a new line of thinking opens on Chat.

**Retired**: the folded/floating draggable conversation box
(`components/logos5/L5Line.tsx`, `lib/logos5/box.ts`) — Split View docks the
conversation instead; the phone's conversation sheet — on a phone the
conversation is the Chat view and the composer floats over the others.

## 6. Memory

The Mind Graph is the one person-memory store for Logos 5. The integrity
fixes the audit called for are the next stage of this work and are **not in
this commit**: a `stated` claim about the person grounded in their own words or
stored as Socria's reading; a file never asserting something about the person;
recalled memory carrying its provenance into the prompt; the atlas saying
"Confirmed" only for what the person confirmed; node-level confirmation; hand
edits keeping the value they replaced; off-the-record turns reaching no memory
store; Logos 5 no longer writing a second store. This section is rewritten
when they land.

## 7. Measurement

`evals/logos5/` — behaviour and truthfulness scenarios graded
deterministically, run through the real route against the live model (they
say so and exit when no key is set), with `--persona classic` for the
ablation and `--root` for before/after. `evals/logos5/cost.mjs` — model calls
and prompt sizes per interaction for scripted conversations through the real
routes, old orchestration against new. Results and their limits are in §10.

## 8. Switches and rollback

| Switch | Default | Off means |
|---|---|---|
| `LOGOS_RUNTIME` | on | the route as it was: old prompt assembly, no epistemic checks, 24-message window |
| `LOGOS_PERSONA` | `v5` | `classic` restores `LOGOS_CHAT_PROMPT` |
| `NEXT_PUBLIC_LOGOS5_MAP_EVERY_TURN` | off | on restores a map pass on every turn |

The interface (§5) is not behind a switch: it changes no stored data, so a
revert of its commit is the rollback. No data migration is needed to roll
any of this back: nothing stored was rewritten.

## 9. Not finished, or decided differently

Kept current as the work lands; see §10 for the final state.

- **Decided differently.** Rule D keeps the conversation beside the Logic Map
  on a wide screen (the reply would otherwise stream off screen). Hub labels on
  the Universal Map stay clamped to the lines their disc holds rather than one
  line. The Universal Map remains where a returning person lands (an earlier
  decision of the owner's); a new line of thinking opens on Chat. The floating,
  draggable conversation box built earlier is retired in favour of Split View.
  "Back to Socria chat" is gone from the Logos 5 menu with the separate Core
  product.
- **Costs that moved.** The map pass no longer follows every turn; it is drawn
  for structure or something to see, while the Logic Map is open, on a light
  background cadence, and once when the Logic Map is opened on a stale map. A
  stored map can therefore lag the conversation by up to three turns until one
  of those happens — this matters to anything that reads the stored map,
  including the 5-node rewards challenge. One small title call is added per new
  conversation, for accounts only.
- **Not finished yet.** The memory-integrity stage (§6); the evaluation
  harness and measurements (§7).

## 10. Results

Filled in when the work is complete.
