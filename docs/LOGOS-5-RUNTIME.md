# Logos 5 — the unified runtime

Logos 5 replaces the separate Core product. One surface for thinking,
writing, learning, researching, modelling and creating; Core 4's cognitive
machinery becomes infrastructure underneath it; Alex Tran's four-view
interface (`Logos 5 Comments (v2)`) is how a person reaches it.

This document is the architecture audit (§1–§3), the runtime it produced
(§4), the interface (§5), memory (§6), how it is measured (§7), how it is
switched and rolled back (§8), what is not finished (§9), the results (§10),
and how Socria reads the room — small talk, joking, something personal, a
brainstorm, a discussion, pushback, work (§11). Line references
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

- `lib/mind/ingest-text.ts` set `sourceNodeId` to the `src_` row id, so the
  Inspector's file list was always empty. Fixed (§6).
- Every storage write calls `sanitizeMap` without `trust:'stored'`, which
  strips `viz.built` on save (`app/api/conversations/route.ts`). Not changed
  here — it needs its own test of what a stored scene must keep.
- `docs/CORE-4-ARCHITECTURE.md` describes a `calibration.ts` that does not
  exist, four ablations where the code allows six, prompt "v6" where the code
  is v9. `docs/LOGOS-4.md` and `docs/ACCURACY.md` describe a filter-only
  stream gate that is now the full gate.
- `conversations.incognito` was documented as "never remembered" and no
  remember path read it. `remember()` now does (§6); nothing sets it yet.

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

The Mind Graph is the one person-memory store for Logos 5, and "inferences
never silently become facts" is now enforced in code, not only in the
extractor's instructions. Held by `test/mind-ground.test.mjs`, with
`test/logos5-memory.test.mjs` and `test/projects-e2e.test.mjs` updated.

- **Stated means said** (`lib/mind/ground.ts`, applied in `remember()` before
  any register decides). A claim the extractor labels stated, established or
  tentative must be carried by the person's own words in the turn — their
  half, never Socria's reply, never the text of a file they attached — by most
  of its name or two words of its content, with the same polarity ("I'm not
  vegetarian" does not ground "Vegetarian"; negation is read word by word). One
  their words do not carry is stored as Socria's reading (`inferred`): a claim
  about the person then waits for a second conversation, as every inference
  does. The name read deterministically from their sentence is exempt. This
  applies to Core 4's turns too — it is the same pipeline.
- **A file is not the person.** Knowledge in a file (a concept or insight that
  is not about them) is `researched`; a claim about them from a file is kept
  `tentative` and may never reword their own words; things that happened stay
  as the file says them. A person a search or a sum turned up is tentative.
- **Recall says where each memory came from**: `[said]`, `[confirmed]`,
  `[file]`, `[source]`, `[reading]` on every line (`whereFrom`,
  `lib/mind/types.ts`), and the block tells the reply never to present a
  reading as something they said. The standing profile that travels on every
  turn now carries only what they said or confirmed, marked so, and no longer
  calls itself "true".
- **They can confirm.** "That's right" on a memory (PATCH `confirm`,
  `confirmNode`) holds it as theirs. Once they have written, edited, confirmed
  or disputed a memory, extraction reinforces it but never rewords it
  (`touchedByThem`). A hand edit records the words it replaced (`prior`) and
  its history shows them; provenance is bounded the way every record is.
- **The Memory page tells the truth**: "Confirmed" only for what they
  confirmed; "In your words", "From your file", "From a source", "Socria's
  reading" otherwise; "You said it" only when they did; a change they turned
  down is not called confirmed; the solid mark is "Current".
- **Private and off the record.** A sighting in a private conversation never
  waits in the pending ledger (it could otherwise corroborate a claim
  elsewhere). An incognito conversation is never remembered — checked inside
  `remember()`, where every surface's write passes. The older understanding
  profile learns nothing from a conversation taken off the record or read as
  sensitive.
- **One store.** With the Mind Graph on, Logos 5 no longer also writes the
  older understanding profile; it is still read as a fallback when the graph
  has nothing to say, as before.
- **Fixed on the way**: file ingestion recorded the stored file's row id where
  the Source node's id belongs, so the Memory inspector's list of files was
  always empty.

Not done: proposed rewordings are still applied and then reviewed (rejecting
one restores the earlier words, and both prompt and page say it is
unconfirmed) rather than held aside until confirmed; nothing in the product
sets a conversation incognito yet.

## 7. Measurement

Three instruments, in `evals/logos5/`. Results and their limits are in §10.

**Cost per interaction, offline** — `node evals/logos5/measure.mjs`. The real
routes (Logos, its map pass, the title, the older understanding profile, Core
4) built from a checkout and driven through one scripted ten-turn
conversation — talk, an "ok", a factual question, structure asked for, a
decision matrix asked for, a "thanks" — with the database and auth swapped as
in `evals/accuracy` and the model replaced by a recorder
(`evals/logos5/fake-model.mjs`) that keeps every request. Counted: calls by
purpose; input tokens (estimated at four characters per token); and the
leading prefix each call repeats byte for byte from the previous call of its
kind — what a provider prompt cache could serve (OpenAI's rule: ≥ 1024
tokens, in 128-token steps), an upper bound since a cache also depends on
timing. Not counted: output tokens and model latency — a recorder answers
instantly. The figures are deterministic; `evals/logos5/results/measure.json`
holds them turn by turn.

**Behaviour, truthfulness, product, personality, live** — `OPENAI_API_KEY=…
node evals/logos5/run.mjs`. Thirty-one scenarios (`scenarios.json`) through
the real Logos route (`--surface core4|both` for Core 4), graded by
`evals/logos5/grade.mjs` with no judge model: answering rather than
withholding, scaffolded options rather than a scolding fallback, a delegated
answer given, no hedging on settled facts, a false premise corrected, a real
mistake owned and a wrong correction refused, no invented memory, no
fabricated sources or tool runs, saying what cannot be checked, and — read
from the route's own trace — the view it chose. Sixteen of them are the
`personality` group (§11): greetings, "how are you feeling?", thanks and
goodbye, a joke and banter, good news and a hard day, a brainstorm, a big
question, pushback, technical work — graded for the assistant's stock lines,
a turn toward work, a claimed feeling or day, a recited disclaimer, a pep
talk, good news turned into next steps, a closing summary, capitulation,
taking a position, length and exclamation marks, and the exchange the
runtime read; the summary counts, by group, how often a reply ended on a
question. Ablations: `--persona
classic`, `--runtime off`; before/after: `--root <worktree>`. Without a key it
says so and produces nothing. The graders are held to canned replies by
`test/logos5-eval.test.mjs`.

**Routing and exchanges, offline** — the same command runs the runtime's
readers against 38 labelled turns for the view (`routing.json`) and 46 for
the kind of exchange (`exchanges.json`), with no model, and the suite runs
both on every push.

## 8. Switches and rollback

| Switch | Default | Off means |
|---|---|---|
| `LOGOS_RUNTIME` | on | the route as it was: old prompt assembly, no epistemic checks, 24-message window |
| `LOGOS_PERSONA` | `v5` | `classic` restores `LOGOS_CHAT_PROMPT` |
| `NEXT_PUBLIC_LOGOS5_MAP_EVERY_TURN` | off | on restores a map pass on every turn |

`NEXT_PUBLIC_LOGOS5=off` still brings back the Logos 4 screen for a
deployment (lib/logos5/flags.ts). The four views (§5) are not behind a switch
of their own: they change no stored data, so reverting their commit is the
rollback.

**Data.** No schema changed and no stored row was rewritten. What is new is
additive and optional, so older code reads it and ignores it: a map's
`drawnAt`; a memory's provenance entries for a confirmation ("confirmed by
you") and an edit's `prior`; per-device keys for the Content canvas
(`socria.logos5.content.v1`) and Split View's width
(`socria.logos5.beside.v1`). The memory rules (§6) decide what is written from
now on; they do not touch what is already stored — a claim stored as stated
before them stays stated. Reverting the memory commit restores the old rules
for new writes. Nothing here needs a migration to roll back.

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
- **Not finished yet.** The evaluation harness and measurements (§7).
  Proposed rewordings are applied-then-reviewed rather than held aside (§6).

## 10. Results

As of the last commit of this work on `dev`. Nothing here was deployed to
production, and nothing was run against a live model: this environment has
no key, so every figure below is either deterministic or measured with a
recording model, and says which.

**Checks.** 255 test suites pass (`node test/run.mjs`), the type check is
clean, and `next build` succeeds (its one warning — `unpdf`'s `import.meta`
— predates this work). New suites: `runtime`, `runtime-route`,
`logos5-views`, `logos5-shell`, `mind-ground`, `logos5-eval`.

**The interface, in a browser.** A journey through the real app against the
local stand-ins (`scripts/dev/logos5-views-journey.mjs`) passes on a 1440 px
desktop and a 390 px phone, in Paper and in Night: Chat first; rule A (a
question stays in Chat, no map pass), B (a document read into Content, the
screen stays, "Added to Content" under the turn), C (a chart opens Artifacts
beside the conversation), D (structure opens the Logic Map, the reply beside
it); the Logic Map drawn once when opened stale; Split View's three sections
and Escape; a Content card dragged and kept; ⌘K search finding and opening
another line of thinking; the Universal Map with no banner, legend or hint
and an exact Today. axe (WCAG 2 A/AA) found nothing on Chat, the Logic Map,
Split View, Content or search, in either theme or on the phone — after the
journey caught the colour fallbacks the Paper theme lacked (§5). Signed out
only: the Memory page's "That's right" is held by a render test, not a
signed-in browser session.

**Cost per interaction, measured offline** (`evals/logos5/measure.mjs`; ten
turns, the same conversation; tokens estimated at four characters each;
input only; "cacheable" an upper bound):

| | model calls | map passes | input tokens | cacheable | not cacheable |
|---|---|---|---|---|---|
| Logos before (runtime off, Logos 3.5 prompt, map every turn) | 32 | 9 | ≈265,800 | ≈228,200 | ≈37,600 |
| **Logos 5** (logos5-v2, §11) | **23** | **3** | **≈112,100** | **≈81,400** | **≈30,700** |
| Logos 5 with the Logos 3.5 prompt | 23 | 3 | ≈139,800 | ≈107,100 | ≈32,700 |
| Logos 5 with the Logic Map open throughout | 29 | 9 | ≈232,300 | ≈200,200 | ≈32,100 |
| Core 4 (as its page drove it) | 34 | — | ≈92,200 | ≈68,200 | ≈23,900 |

Read plainly: over these ten turns Logos 5 sends 28% fewer model calls and
58% fewer input tokens than Logos did, and 18% fewer of the tokens no cache
could serve. Most of it is the map pass — each is ≈20,000 tokens of
extractor instructions, and it now runs three times instead of nine; the
reply prompt is well under the old one (≈4,000 tokens a turn against ≈6,800 —
the persona alone is ≈27,700 of the saving); "ok" and "thanks" no longer cost
a memory extraction; the second memory store is gone; one title call is
added. With the Logic Map open the whole time the map costs what it did, by
design. Core 4 sends fewer tokens because it draws no map, and more calls
(a state reading every turn). Not measured: output tokens, and latency — the
reply is still one model call per turn and the map pass already ran beside
it, so time to the first word is the reply model's, unchanged by this work;
the routes' own work is ≈70 ms a turn either way.

**Routing, offline.** 38 of 38 labelled turns read as labelled — after one
fix the set itself found ("what does my whole plan rest on?" was read as
talk). The set was written alongside the rules: a regression check, not a
benchmark.

**Behaviour and truthfulness, live: not run.** The scenarios (fifteen then,
thirty-one with §11's) and their graders are in place and the graders are
tested; the numbers need
`OPENAI_API_KEY=… node evals/logos5/run.mjs`, then the same with
`--persona classic` and `--runtime off` for the ablations, and `--root` on a
worktree of `e8aaeb4` for before and after. Until then nothing here claims
the reply behaves better, and nothing claims hallucinations are gone: what
is shown is that the code now removes citations that name nothing, labels
claims against the evidence it had, refuses to store an unsaid claim as said,
and tells the reply where each memory came from.

## 11. Reading the room (logos5-v2)

Reported by the owner: "hi, how are you?" or "how are you feeling?" got "I'm
here and ready to assist" and a question about goals or next steps — scripted,
productivity-minded, a help desk. Corrected where it came from, not with a
handful of greeting replies.

**What made it sound like that.** Each was found in the real route — the reply
prompt dumped for fifteen conversational messages through the harness
`test/runtime-route.test.mjs` uses — before anything changed:

1. *The voice.* The core cast Socria as help "for whatever someone is working
   on" — "Useful first … make the next step obvious" — and said nothing about a
   hello, a joke, good news, a hard day, or being asked about itself.
2. *Every turn framed as work.* The turn's block (`allocation.ts`) opened every
   turn, "hey" included, with "Be practical and warm: the useful answer first"
   and "You do: look things up …, and do the arithmetic".
3. *Readers that took talk for work.* "how are you feeling?" begins "how are",
   so it was forced to EXPLAIN (`lib/cognition/assist.ts` wantsExplanation);
   "I got the internship!!" begins "I got", so it was forced to VERIFY
   (offersWork); "what's up?" was a question of fact; and "how are you doing
   today?" says "today" with a question mark, so Core 4's web gate searched
   for it — or, with no provider, the reply was told the lookup had failed and
   to list databases to try (`lib/core4/web.ts`, `epistemic.ts`).
4. *A tutor's moves on talk.* A hello after a day away on something they were
   learning got a forced recall question; something personal that touched an
   assumption on their map could be met with a challenge.
5. *A question invited on every turn.* "QUESTIONS: at most one, and only if it
   is the strongest thing to say" rode on nearly every turn.
6. *A leftover.* The Conversation Style footer described the default Logos
   voice as having "its refusal to open warmly" — Logos 3.5's.
7. *Formatting.* A reply's closing question is set apart in the serif italic
   (§5); on "You?" at the end of two lines, it read as a tutor's prompt.

**What changed.**

- **The exchange, read in code** (`lib/cognition/register.ts`, no model call):
  social, playful, personal, brainstorm, discussion, disagreement,
  conversation, task. Small talk needs every clause of the message to be
  social; anything with work in it is a task (a feeling or a joke it carries
  gets a word, then the work); pushback needs Socria to have said something,
  and a bare "no" to Socria's question is an answer; a bare "yes", "ok" or "got
  it" once the conversation is under way carries it on, with no line of its
  own; a feeling counts only when it was said this turn, and nothing is kept. The
  state carries it (`TurnState.exchange`) and the trace names it
  (`X-Socria-Runtime: … exchange=social`).
- **The turn's block.** Work keeps its allocation in full: the domain, who does
  what, what is theirs, the move. Talk gets one line about the exchange, a line
  on honesty when they asked about Socria, and a length cue from their own
  message. What is theirs — a decision, the substance of their writing — is
  said whenever Core 4's split reserves it, in any register. Plain conversation
  with nothing to say sends nothing.
- **The readers.** Small talk and messages that only ask about Socria are
  conversation before any work reader runs; a greeting or a "quick question:"
  in front of a request is taken off before the readers that look at how it
  begins; "how are you…" is not a request to explain; "I got" is work offered
  only before a result ("I got x = 4"); "do you think I should … or …" is a
  decision.
- **The move engine.** No move imposed on small talk or joking; no recall
  question on a hello or something personal; no challenge on something
  personal; nothing said about questions when one is allowed.
- **The web.** Small talk is never a lookup — Core 4's gate and the runtime's
  reading of what a turn needs — so no search and no "the lookup did not run".
- **The stream gate.** The help desk's lines — "How can I help you today?",
  "Is there anything else…", "What would you like to work on?", "I'm here and
  ready to assist", "I'd be happy to help" — are offers: dropped when they
  close a reply, kept mid-reply. On Logos, a reply that was nothing but such
  offers goes out as written rather than as an empty turn; a question over the
  person's limit never does, and Core 4 keeps its own rule (a draft that is only
  a question it may not ask sends nothing).
- **The core** (`PERSONA_VERSION` `logos5-v2`): who Socria is (curious, warm,
  plain-spoken, dry, constructively skeptical — "a sharp friend to think with:
  not a help desk, not a tutor running a lesson"); READ THE ROOM, kind by kind;
  the stock lines named and banned; no template; a question asked because the
  answer is wanted; ABOUT YOU — an AI, no feelings or day claimed, no
  disclaimer recited; knowing their work no reason to bring it up. The task
  guidance, honesty, disagreement, who does what, the workspace, style and
  memory carry over.
- **The rest.** The style footer describes no voice. The closing question is
  set apart only after a reply with substance — 25 words before it, a question
  of four or more — checked in a browser against the local stand-ins.

**What stayed.** Human-First (the call and the substance stay theirs, and say
so whenever the split reserves them), Cognitive Allocation (Core 4's split,
unchanged, on every task), Epistemic Control (the citation checks, the evidence
labels and the accuracy plan, unchanged), and one model call per reply.

**Cost, measured** (§10's ten turns, the recorder, four characters a token):
the same 23 model calls; the reply's input +323 tokens a turn (≈36,900 →
≈40,100 over the ten), all of it in the cacheable prefix — the core grew by
≈1,480 characters and stays under 55% of the Logos 3.5 prompt, a bound the
suite holds — while the tokens no cache could serve fell by 96. Across fifteen
conversational messages the turn's block went from 7,730 characters to 4,522.

**Tested.** `test/runtime-register.test.mjs` (the reader, the readers it fixed,
the block for each kind, the move engine, the gate, the core);
`test/runtime-route.test.mjs` (each kind through the real route: what the reply
is told, the trace, no search for "how are you doing today?" with a provider
configured, the help desk's lines kept from the person, never an empty turn);
`test/core4-web.test.mjs`; `test/logos5-eval.test.mjs` (the new graders on
canned replies; 46 of 46 labelled exchanges, written alongside the reader — a
regression check, not a benchmark). The full suite (256), the type check and
`next build` pass (its one warning, `unpdf`'s `import.meta`, predates this).

**Not shown.** How the live model now replies. Everything above is what the
model is told and what the gate lets reach the person; the sixteen personality
scenarios need `OPENAI_API_KEY=… node evals/logos5/run.mjs`, with
`--persona classic`, or `--root` on a worktree of `3d3db5d`, to compare. The
readers are English patterns: in another language a turn gets no exchange line
and the core's guidance alone. Core 4's split still reserves the decision when
a sentence merely contains "decide" ("how cities decide what to build") —
Core 4's reading, left as it is.

**Rollback.** `LOGOS_PERSONA=classic` speaks with the Logos 3.5 prompt;
`LOGOS_RUNTIME=off` drops the exchange reading with the rest of the runtime.
The fixes in shared code apply in every mode: the "how are you" and "I got"
misreads and the question line in the Logos 4 engine, the decision reader, and
— on Core 4 as well — the gate's help-desk offers and the web gate's refusal of
small talk. No stored data changed.
