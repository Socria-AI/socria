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
| Core 4 `splitFor`, `allocate`'s rules | **Inherit** into the runtime's allocation — and since §13, `allocate` itself, over Core 4's state replayed from the conversation | Deterministic, tested, and the thing Logos lacked |
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

Withholding happened only under the Answer Guard they switched on — until
§13: Core 4's allocator now runs over the conversation, and it withholds on
the person's own words too (never on an inference), always saying what they
can have instead. `LOGOS_ALLOCATION=lite` is the block above, as it was.

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
| `LOGOS_PERSONA` | unset: the Logos 5 persona for the new Socria's screen — the one behind its access code, which sends `surface: 'logos5'` with every turn — and `LOGOS_CHAT_PROMPT` for any other Logos screen | `classic` restores `LOGOS_CHAT_PROMPT` everywhere; `v5` gives every Logos screen the Logos 5 persona |
| `NEXT_PUBLIC_LOGOS5_MAP_EVERY_TURN` | off | on restores a map pass on every turn |
| `LOGOS_ALLOCATION` | `core4`: Core 4's allocator over the replayed conversation (§13) | `lite` (or `off`) restores the split and the move alone; only the Answer Guard withholds |
| `LOGOS_MR` | on: Metacognitive Regulation (§14, docs/MR.md) | `off` (or 0/false/no): the route byte-identical to the one without it; `shadow` decides and traces without enforcing |
| `LOGOS_IFR`, `LOGOS_MR_ARM`, `LOGOS_MR_POLICY`, `LOGOS_MR_DELIBERATE`, `LOGOS_MR_STORE`, `LOGOS_MR_EXPERIMENT` | see docs/MR.md §7 | — |

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

## 12. Adaptive response rendering, push to talk, one setting

Asked for: "add voice to text for socria you can hold down then talk, push to
talk. also remove the model selection for socria entirely lol, only
conciseness" — and then adaptive response rendering: a reply that stays plain
conversation and becomes interactive only where that helps (a small chart, a
slider, a comparison, reasoning folded away, choices to tap, text to edit),
drawn from validated descriptions inside the conversation, larger work in the
existing Artifacts view, no new mode or tab, nothing fabricated, low tokens.

**What was there.** A reply was prose (`lib/rich-text.ts`, `components/RichText.tsx`).
Anything visual was a display (`lib/objects/display-*`) the map pass or a
display request built in Artifacts — never inside the conversation. The
runtime decided which view a turn needed (rules A–D, §4.1) but nothing decided
the shape of a reply. The composer's chip ("Logos 5 · Balanced") opened the
model picker: Core registers, Logos surfaces, depths. The mic was a toggle.

### What changed

1. **Push to talk** (`lib/logos4/voice.ts` holdOutcome, `components/useVoiceInput.ts`,
   `components/LogosComposer.tsx` HoldMic). Hold the mic — pointer captured, on
   touch too, or Space/Enter held on it — and talk; let go and the words land in
   the composer, never sent by themselves; slide away (64px) to cancel. A press
   shorter than 350ms says how it works instead of recording nothing; a click
   with no hold still starts and stops, for assistive technology.
2. **One setting** (`components/logos5/ConcisePicker.tsx`). Concise · Balanced ·
   Detailed, on Core 4's dial and in its storage, sent as `length`. The route
   says it once in the stable prompt (nothing for Balanced) and sets the reply's
   ceiling: 480, 700, 1,200 tokens (`lib/runtime/behavior.ts` lengthLine,
   replyCeiling). Logos 5 answers at Balanced depth — the dial is length, never
   how carefully — and the model picker is left only on the Logos 4 screen.
   *Fixed on the way:* the composer's tools strip clipped the sheet of anything
   opened from it (the model picker's too); the sheet now opens above the
   composer box, inside the screen on a phone.
3. **A vocabulary of six** (`lib/inline-ui.ts`). A reply may hold a fenced
   ` ```ui ` block of JSON: a chart (bar, line, pie), a slider, a comparison,
   reasoning, choices, a draft. Each is sanitised into one canonical shape or
   dropped — labels cleaned, limits on points, series, rows, steps and length;
   a pie is one non-negative whole; a slider's formula is compiled by the math
   engine's parser over exactly its single-letter variables and must give a
   number where it starts. Nothing in a spec is ever run as code.
4. **The offer, decided in code** (`lib/runtime/presentation.ts`, called by the
   route after allocation). Which elements a reply *may* use this turn: a chart
   for their own named amounts; a slider for a quantity that moves with
   something they can vary; a comparison for options set against each other; a
   draft for practical writing they handed over; choices for an open request
   for help, only where a question may go; folded reasoning for a check, or a
   call Socria may weigh in on. Never on a greeting, a joke or something
   personal, never on a turn another view answers, never reasoning that is
   theirs to do or a conclusion on a decision that is theirs, two at most, and
   not the same element a third reply running. Only the offered elements'
   grammar is sent — a line each, after the history, outside the cached
   prefix — and the ceiling grows by 350 tokens (700 for a draft) so a spec is
   never cut off. Most turns are offered nothing.
5. **Epistemic Control on the stream.** The sentence gate hands each finished
   fence to `gateInlineBlock`: a chart's numbers must be ones they gave or this
   turn's sources carried, or it is replaced by a line saying a chart was left
   out; illustrative numbers are drawn only labelled as examples; a comparison's
   figures that nothing checked are marked; choices need the question budget;
   under the Answer Guard no reasoning and no calculator; no lean on a decision
   that is theirs, no draft of writing that is theirs; at most two; a block that
   is cut off or invalid is dropped; what passes goes out canonical, on a line
   of its own. The math check reads each block as the words it stands for
   (`contentForCheck`), so a reasoning step's arithmetic is checked like a
   sentence.
6. **Representation.** A block is words wherever a picture cannot go: in the
   history the model reads back (`contentForHistory`: "[shown inline — chart:
   …]", cheaper than the JSON and no stale chart re-emitted), the map pass's
   transcript, memory, the reply's own checks, search, Copy, and the older
   surfaces that do not draw elements. What the person does with one — a
   slider's values, the choice tapped, a draft's edits, reasoning unfolded, the
   artifact it opened as — is kept on the message (`ui`), cleaned by
   `/api/conversations` and kept in the local store.
7. **Drawn in the conversation** (`components/inline/InlineUI.tsx`, `inline.css`):
   the reply's column, its hairline and radius, its type. Charts measure their
   width so their words keep their size on a phone, hold zero on a bar's axis,
   light a mark under the pointer or a tap with the others stepping back, and
   carry a table for screen readers; a pie names every slice with its amount and
   a share that adds to 100. Series colours are a validated set (lightness,
   chroma, colour-blind separation, contrast) on Paper and White, and on the
   Dark, One and Celestial grounds; one series is the theme's own colour; on
   Celestial an element sits on the surface, not the stars.
8. **Deterministic interactions, no model call.** A slider computes in the
   browser and is kept when the hand stops; a tapped choice is simply their next
   message (what they had typed stays); a draft is edited, undone and copied in
   place. A chart opens in Artifacts as a data display and a comparison as a
   comparison — real objects, made once; pressed again, what was made opens. A
   calculation stays the calculator in the reply: Artifacts has no view of a
   lone function, and an object nobody can see is not offered.

### Cost, measured

The ten turns of §7, the recorder, four characters a token: the same 23 calls;
the reply's input 40,108 → 40,212 tokens over the ten — one turn of ten was
offered an element (+418 characters), nine are byte for byte as before; the
cacheable prefix unchanged (81,408). Run over 43 everyday messages the planner
offered nothing to 25 (greetings, thanks, a hard day, a joke, explanations,
facts, map or plot requests); an offer is under 700 characters for one element
and under 1,000 for two (both held by the suite).

### Tested

- `test/inline-ui.test.mjs` (125): every shape's validation, including code
  in a formula; each epistemic check; the gate on a reply streamed one, three,
  seven and fifty characters at a time; the words a block becomes; state
  cleaning; a chart and a comparison accepted as real displays; the planner on
  plain talk, other views, explanations and each element's cases; each
  component drawn (accessible names, a table for screen readers, escaped words,
  nothing drawn for an invalid block, a placeholder while one arrives).
- `test/runtime-route.test.mjs` (+20, through the real route): a hello offered
  nothing; their amounts offered a chart, after the history; the chart of their
  numbers arriving whole; invented numbers refused with the notice; two at
  most; cut-off and unknown blocks dropped; code untouched; no choices when
  they asked for no questions; nothing under the guard; no draft of their own
  essay; a practical email as a draft; history read back as a line; the length
  line and ceilings; room for an element; `LOGOS_INLINE=off`.
- `test/logos4-capture-voice.test.mjs` (push to talk), `test/logos3.test.mjs`
  (Logos 5's depth). The full suite, the type check and `next build`.
- In the browser, against the local stand-ins (`scripts/dev/fake-openai.mjs`
  now answers an offered turn with the element it was offered), desktop and a
  390px phone, Paper, Dark and Celestial: all six drawn and no JSON anywhere;
  a hovered or tapped bar's value; Copy gives words; a slider moved, a draft
  edited and reasoning unfolded all kept across a reload; a chart opened in
  Artifacts as an editable chart keeping "Your numbers", once; a tapped choice
  sent as the next message and then still, the choice marked; their amounts
  through the real route drawn as a chart, a "thanks" with nothing, an email as
  a draft; Concise carried on the request and kept across a reload, the only
  picker left in Logos 5; hold to talk — "Listening… let go to add it · slide
  away to cancel" — and the words in the composer; no sideways scroll on the
  phone, tick labels at 11px.

### Not shown, and limits

- **How the live model uses it.** No key here. Whether a real model takes the
  offers sparingly and writes valid specs is not measured; the gate means a
  wrong one is dropped, never drawn — at the cost of an element the model meant
  to show.
- The planner reads English patterns, as the exchange reader does (§11).
- A chart is drawn only from numbers the person gave or a source this turn: the
  model's own estimates go in words, or in a chart labelled as examples.
- In a shared line of thinking, what one person does with an element stays on
  their screen until a reload (the share routes append turns; they do not carry
  a message's state).
- Choices can be tapped on the latest reply only, while nothing is being
  answered.

### Switches and rollback

**Behind the access code.** The Logos 5 persona — and with it the inline
elements, the length setting and the turn's allocation — is the new Socria's,
and so is chosen per request: the Logos 5 screen, which only someone who has
entered the code sees (lib/new-socria.ts), says so with `surface: 'logos5'`;
a Logos 4 screen sends nothing and keeps `LOGOS_CHAT_PROMPT`, with the rest of
the runtime (the citation checks, the stepped history, the move engine's
fixes). The gate is a rollout, not a security boundary: a request that claims
the surface gets a different voice and nothing it could not otherwise use.

`LOGOS_INLINE=off` offers nothing and drops any block a reply writes anyway;
stored conversations still draw theirs. The data is additive: a message's `ui`
is optional, cleaned where it is saved, ignored by older code — no migration.
The length uses the key Core 4 already had. Reverting the commit brings back
the toggle mic and the model picker.

## 13. Core 4's allocation, whole

Logos 5 had Core 4's **split** (`splitFor`, `ownershipRead`) and nothing
around it. Core 4's **allocator** — the eight modes, the withhold contract,
the practice ladder — and the state it decides over stayed in Core 4. The
person asked for it, and for whatever else of Core 4 would help Logos 5 most.

### What Logos 5 lacked

- **Memory of what they said.** Signals were read from the newest message
  alone (`readSignals(last.content)`). "I want to work these out myself" on the
  first message was gone by the third; "this is graded" was gone by the next
  ask; a Project's "hints only" was never read at all.
- **The ladder.** Nothing remembered the attempts before this one, so nothing
  could bottom out: endless hints to somebody genuinely stuck, or nothing held
  back for somebody who asked.
- **Calibration by mode.** A wrong attempt always got "help them repair that
  step", even from someone who never said they were practising; Core 4 gives
  that person the correction and keeps the redo only for someone who asked.
- **A withhold anyone could see.** The Answer Guard (a switch) was the only
  way anything was held back, and the reply was never told what to keep, why
  in their words, or what they could have instead.

### How: the conversation, replayed (`lib/runtime/replay.ts`)

Core 4 keeps its state in a store and fills it with a model call every turn.
Logos 5 does neither, and does not start: the transcript the client already
sends is replayed through **Core 4's own** `mergeState`, `allocate` and
`recordTurn`, one message of theirs at a time, with the runtime's
deterministic readers standing in for Core 4's model reader. The same rules,
decided by the same code — a standing "don't tell me" holds until they say
otherwise, a bare "just tell me" fades, a stated learning goal stays stated,
being heard holds until they ask — and nothing written anywhere. Earlier
attempts are decided again by the math engine (the last four messages of
theirs), which is the ladder's evidence. A Project's standing instructions
are read as Core 4 reads them, as the contract (`getProject`, only the
person's own Project, never in a shared room).

What the readers cannot see — an inferred learning goal, inferred expertise,
stakes — stays at Core 4's defaults. Core 4's allocator was built for that: an
inference never withholds anything, so a missing reading only means more help.

### What the reply now gets

`allocation.ts` keeps the Logos move (it reads evidence the allocator does not:
the engine's verdicts, their map, what they selected) and makes it obey the
allocation (`reconcile`): a thing they asked to produce is never informed;
being heard is room; the bottom of the ladder is a worked explanation;
graded work is the method in full; a turn they handed over asks nothing.
Safety is never touched. Then, in the turn's block, only where Core 4 decided
something:

- **The withhold, in Core 4's words** — `KEEP WITH THEM` (what), `BECAUSE THEY
  SAID` (their words — Core 4 will not withhold without a quote),
  `THEY CAN HAVE` (the alternative, always the longer list), and the line that
  it is not a style note. The first one in a conversation is announced once:
  they can have it by asking.
- **The reason**, for the modes worth a line: verify and confirm, verify and
  correct, verify and keep the redo, practise, bottom out, stuck inside a
  boundary, graded, their newer word over their Project's, being heard, "you
  decide" (the view, plainly — the choice stays theirs), "just write it"
  (everything but the substance, at full length).
- **What the turn owes them** whenever the split keeps something with them —
  Core 4's `CONTRIBUTION`: preservation without augmentation is under-help.
- **No computed answer** reaches a turn that is holding it back: the accuracy
  plan is drawn again with the result withheld, as Core 4 does.
- **The trace** (`X-Socria-Runtime`): `alloc=<mode>:<reason>` and
  `held=<reason>[:announced]` — codes only, never their words.

### Two things beyond Core 4

- **Graded stays graded.** Core 4 reads "this is for my graded assignment" from
  the message that says it, and its state has nowhere to keep it, so the next
  "just give me the answer" handed the submittable answer over. In the replay,
  once said it rides on every later request for the answer, quoting their
  words, until they say it is not graded.
- **A computation they ask for while practising is the exercise.** "What is the
  derivative of…" reads to the readers as a question of fact, and Core 4 never
  holds a fact back. Where the engine computed an answer to what they asked and
  they have said in so many words that they are practising, it is read as the
  practice it is. Anyone else asking the same thing gets the answer.

### Changed from the Logos 5 that was

Core 4's invariant comes with its allocator, and two hand-overs Logos 5 used to
honour in full now are not, by design: **"just write the whole essay for me"**
gets everything but the substance — structure, craft, every mechanical part,
at full length, no questions — with the premise and the ideas still theirs;
**"you decide"** gets Socria's view, plainly and marked as a view, with what
would flip it — the choice stays theirs. A practical brief ("write an email to
my landlord about the heater") is still simply written. `LOGOS_ALLOCATION=lite`
restores the old behaviour.

### Deliberately not brought over

| Core 4 piece | Why not |
|---|---|
| `readState` (a model call every turn) | Replaced by the deterministic readers (§2); the replay needs no model |
| The state store, the reasoning ledger, capability evidence | Storage whose value in Logos is unmeasured (§2); the transcript is already the state, and the Logic Map is Logos's ledger |
| `guardModel`, counterfactual ablation (`guard2.ts`, `counterfactual.ts`) | Extra model calls on a turn; Logos already checks a reply's mathematics by computation and its citations against the evidence |
| `selectIntervention` (17 moves) | Two move deciders for one product was the duplication §2 removed; the Logos move is kept and made to obey the allocation |

### Cost and limits, measured

Pure and deterministic: no model call, no network, nothing stored. Measured
on this machine, warm: an eighty-message conversation of prose replays in a
median 18 ms, one of maths attempts in 6 ms. The first call in a fresh server
process pays roughly 400 ms to compile the readers' patterns, most of which the
route's own readers compile anyway. What keeps it there: the engine re-checks at
most four earlier messages; only the last twelve of theirs are read in full and
allocated (Core 4 itself remembers eight), and anything older is folded in for
its words alone; and an earlier message's intent is not read — the costliest
reader, and one that changes nothing the allocator decides. The readers are English
patterns; what the engine cannot decide (a bare "x = 5" is read as a
definition, not an answer) cannot count towards the ladder. Not verified: how
a live model honours `KEEP WITH THEM` — the tests check what the reply is
told, with the model replaced.

### Tested

`test/runtime.test.mjs` (the replay: a goal said earlier holds and is quoted;
the ladder from the transcript; the right attempt confirmed; "I'm lost"; a
fact never held; their newest word wins; graded stays graded, announced once,
until taken back; the Project contract and its override; being heard; harm;
"you decide"; "just write it"; a brief still written; small talk untouched;
determinism; an eighty-message replay under a second, as a guard against a
regression rather than a benchmark) and `test/runtime-route.test.mjs`
(through the real route: the withhold in their words, the computed answer held
back, the trace, `LOGOS_ALLOCATION=lite`, the classic persona untouched, graded
twice, a fact).

## 14. Metacognitive Regulation

A supervisory control plane over this runtime: whether the help is working,
and a typed, scoped, expiring adjustment when the evidence says it is not —
their explicit words first, never a weak signal — enforced in code where it
says so (the move, the question budget at the gate, a hard "no questions",
mid-reply check-ins when questions were taken away, `max_tokens`) and
measured where it can only be asked for. It reuses what is here rather than
duplicating it: `readSignals` (narrowed by its own readers before precedence
acts on it), `interrogatives` and the stream gate, the Core 4 withhold and the Answer Guard (which it may never loosen),
the maths engine's verdicts, the persist policy. On by default; `LOGOS_MR=off` turns it off.
Everything — the seven modules, Interaction Friction Regulation, precedence,
persistence and privacy, the benchmark, what is and is not verified — is in
docs/MR.md; what exists for a future study is in docs/MR-RESEARCH.md.

One defect it fixes when on, found by its audit: "stop asking me questions"
held for one turn only (the replayed Core 4 state that remembered it was
discarded by `allocate`); under MR it holds for the conversation, hard, until
they take it back.


## 15. The Logic Map is the ideas; Artifacts is what was made

The owner's direction: the Logic Map is the map of the person's ideas,
whatever the subject, in the different shapes their thinking can take; the
graphs and everything else made are Artifacts; and what to make can be chosen
before asking.

**What was wrong.** The Logic Map was the Thinking Map with every lens it can
draw. For quantitative work (`availableLenses`: a maths conversation, a scene,
a built model) that meant the plot, the worked solution and the objects being
worked on, and no web or hierarchy of the ideas at all. A conversation about a
function opened the Logic Map on the function.

**What changed.**

- `lib/logos-layout.ts`: `IDEA_LENSES` (graph, structure, flow, timeline,
  tensions, evidence, matrix: the same set the router already sends to the
  Logic Map, `MAP_LENSES` in `orchestrate.ts`) and `MADE_LENSES` (plot, solve,
  work). `ideaLenses(map)` is the shapes of this map's thinking plus the web
  and the hierarchy whenever there are ideas on it; `ideaLead` opens on the
  shape being built, else the comparison, else the web.
- `components/ThinkingMap.tsx`: a `shapes` prop. `'ideas'` offers
  `ideaLenses`; a made lens offers that lens alone (no tab bar). Unset, the
  map is Logos 3's, unchanged.
- `components/LogosApp.tsx`: the Logic Map panel, and the map docked beside
  in Split View, draw `'ideas'`. Artifacts gains **Solution** (the working,
  step by step) and **Working** (a matrix or function worked on as itself)
  beside the existing **Plot**, each drawn on its own lens; displays and 3D
  scenes stay artifacts of their own, so the Working item is offered only for
  objects that are neither. A worked solution drawn by the map in the
  background marks Artifacts new; it never takes the screen unasked.
- **Choosing what to make** (`lib/logos5/make.ts`,
  `components/logos5/MakePicker.tsx`): a **Make** control beside the length
  dial in the composer, and **+ Make** / the empty Artifacts in the Artifacts
  view. The choices are chart, comparison table, timeline, study plan,
  checklist, flowchart, pros and cons, Venn diagram, plot, simulation and 3D
  model. A choice is said in words ("Make a chart: rent 1200, food 400"), so
  the same readers that answer a typed request answer it (`routeTurn`,
  `readDisplayRequest`, the map pass): nothing new on the server, no extra
  model call, and the conversation shows what was asked. With nothing typed
  it is made from the conversation so far; it clears once sent. Shapes of the
  thinking (mind map, argument map, decision tree) are not on the list; those
  are the Logic Map's.

**Tested.** `test/logic-map-ideas.test.mjs`: the two lens sets are disjoint;
maths, essay, process and model maps offer only idea shapes, always with the
web and the hierarchy, and open on one of them (a process as its flow, maths
and models on the web); Logos 3's `availableLenses` still offers the solution
and the plot; every Make choice, typed or not, routes as something to make
and opens Artifacts, and each display choice is read as the kind it names.

**Limits.** A maths conversation's web draws the same nodes the solution chain
does (its steps among its ideas); the map pass is not asked to extract
anything different. The home screen's composer (a new line of thinking) has no
Make control yet; the conversation's composer does.

## 16. Intelligent presentation: the shape of the thought, not a list

Asked for: Logos 5 kept answering like a conventional chatbot (an overview of
microeconomics came back as a list of bold terms and their definitions). The
shape of a reply should follow the shape of the thought: prose by default, a
list when one is earned or asked for, and a native, interactive element where
it really helps comprehension, chosen with no second model call.

### What was there (the audit)

- **The decision.** One reply call. What shape a reply may take was already
  decided in code by `lib/runtime/presentation.ts` (§12): six inline elements
  (chart, slider, comparison, folded reasoning, choices, draft), each offered
  only where plausible, its grammar sent after the history, outside the cache.
  Explanations were deliberately offered nothing ("prose is the explanation").
- **The rule.** `LOGOS5_CORE` (HOW YOU SPEAK) said "plain prose, structure
  only when it helps", then listed the marks the surface draws, among them
  `**bold**` list labels and hyphen/numbered lists. "When it helps" is decided
  by the model's habit: an overview became bold-term bullets.
- **The rest, reused unchanged.** The stream gate (`lib/core4/stream-gate.ts`)
  hands each finished ```ui fence to `gateInlineBlock`; specs are sanitised to
  one canonical shape or dropped; a block cut off mid-stream is dropped; the
  renderer (`components/inline/InlineUI.tsx`) shows a placeholder while one
  arrives; every block reads as words for copying, history, memory, search and
  older surfaces (`contentAsText`, `contentForHistory`, `contentForCheck`);
  what the person does with one is kept on the message (`ui`). The four views
  (§5) and rules A–D, Allocation, the Answer Guard, Epistemic Control and MR
  all sit before this and are not changed by it.

### What changed

1. **The rule** (`lib/runtime/behavior.ts`, persona `logos5-v3`): "A reply
   takes the shape of the thought. Prose by default: an explanation connects
   ideas in sentences, never bolded terms with definitions; a short answer
   stays short. A list only when the content is one (steps in order, things to
   gather) or they ask for one. No 'Key points' or 'In summary'." The marks
   the surface draws are unchanged. The core stays inside its size budget (55%
   of the Logos 3.5 prompt), and the offer marker never appears in the cached
   part.
2. **Two elements** (`lib/inline-ui.ts`), sanitised, gated and drawn like the
   six:
   - **concepts**: the parts of a subject (3–7), each a name, a line, more to
     read when opened, and links to the other parts (only to parts named in the
     same overview; unknown and self links are dropped). Drawn as cards: open
     one and its explanation shows (in a panel under the cards, or on a phone
     directly under the card), the parts it connects to, either way, are lit
     and a press away. On the latest reply, **Go deeper** asks for more on that
     part and **See how they connect** asks, in words, for the Logic Map
     ("Map out how these connect: …"), so the screen follows rule D with the
     conversation beside it. The part opened is kept with the message.
   - **sequence**: steps (numbered, ticked off as they are done, kept) or a
     timeline (every event against its date; one undated event makes it steps).
     An item with more to say opens in place.
3. **The planner** (`lib/runtime/presentation.ts`) offers them where they fit:
   concepts for a subject with several parts asked about as a whole (an
   overview, its main ideas or branches, a field named on its own: "what is
   microeconomics?"); a timeline where the order of events is the point; steps
   for a process. Never when they asked for a list, never on a brainstorm, on
   writing they are making, on practice, checking or fixing work, never under
   the Answer Guard, and steps never for something whose working is theirs
   (Core 4's split). A single idea ("what is tax incidence?", "why did the
   Roman Republic fall?") is still prose. Still at most two elements, and not
   the same one a third reply running.
4. **The gate** drops concepts and sequences under the Answer Guard, and steps
   when working it out is theirs. The reply's ceiling grows by 700 tokens when
   an overview is offered (450 for steps) so a spec is never cut off and lost.
5. **The views.** Nothing is moved to another view by this. Things made on
   request still open in Artifacts (rule C: "give me a timeline of the French
   Revolution" is something to make), structure still opens the Logic Map
   (rule D), and an overview reaches the Logic Map only when the person presses
   "See how they connect".

### Cost

No new model call and no new infrastructure. A turn offered nothing (most
turns) is byte for byte the same apart from the core's rule, which is in the
cached prefix (it changes once, with the persona version). An offer is 524
characters for an overview, 415 for steps or a timeline, 758 for both, after
the history and outside the cache. The reply's ceiling grows only when an
element is offered, and only what the reply writes is billed.

### Measured, and not

- **Offline, the same 30 prompts before and after** (`node evals/logos5/presentation.mjs`,
  `evals/logos5/results/presentation.json`; before = `55bce15`): what each
  reply is told. Ten prompts are offered something different: every
  multi-concept prompt and two of five general explanations (the overview and
  the field named alone) are now offered an overview; three processes and
  timelines a sequence. Casual talk, explicit list requests and the five
  "UI unnecessary" prompts (a fact, a conversion, history as a story, writing
  they are making, a brainstorm) are offered nothing, before and after. This
  measures the instructions, not a model's replies.
- **Not measured: what a live model does with them.** There is no key here.
  `evals/logos5/scenarios.json` now holds a `presentation` group (12
  scenarios) and `grade.mjs` checks the shape of each reply (list lines,
  bold-label lists, headings, which element was drawn — `shapeOf`), so
  `OPENAI_API_KEY=… node evals/logos5/run.mjs --only pres-` against this
  checkout and `--root` a worktree of `55bce15` gives the before and after.
  Until then, no claim is made that replies contain fewer lists or that
  comprehension improved.

### Tested

- `test/presentation.test.mjs` (91): the ten categories asked for (general
  explanations, casual talk, explicit lists, multi-concept explanations,
  comparisons, mathematics, complex reasoning, UI unnecessary, malformed or
  unsupported elements, streaming and fallback) through the planner, the core
  prompt, the sanitiser, the gate (streamed 1, 3, 7 and 50 characters at a
  time; a reply ending inside a block; the guard; `LOGOS_INLINE=off`), the
  words a block becomes, and the components (accessible names, states kept,
  escaped words, actions only where they can act).
- `test/runtime-route.test.mjs` (+6, through the real route): an overview is
  offered the concepts grammar after the history and arrives whole; a list
  asked for is offered nothing; under the guard nothing is offered and a block
  written anyway is dropped; the rule is in the cached prefix; the ceiling.
- `test/logos5-eval.test.mjs`: the shape grader on the list habit and on prose
  with an overview.
- In the browser against the local stand-ins (`scripts/dev/fake-openai.mjs`
  answers an offered overview, steps or timeline), desktop and a 390px phone:
  the overview drawn with no JSON, a part opened (under its card on the phone,
  drawn once), a connection followed, the part kept across a reload, "See how
  they connect" opening the Logic Map, steps ticked off ("1 of 4 done"), a
  timeline against its dates, no sideways scroll, no page errors.

### Limits

- Whether the live model takes the offers well, and writes fewer lists when
  it is offered nothing, is the open question above.
- The planner reads English patterns, like the rest of the runtime's readers.
  A subject asked about in other words ("what should I know going into
  econ 101?") may get prose rather than an overview, which is the safe miss.
- A maths conversation can bring the Answer Guard up; under it no overview,
  steps or timeline are offered or shown, by design.
- In a shared line of thinking, an opened part or a ticked step stays on the
  screen of the person who did it until a reload (as §12).

### Switches and rollback

`LOGOS_INLINE=off` offers nothing and drops any block, the new two included.
The data is additive (two optional state fields, `picked` and `done`). Reverting
the commit restores `logos5-v2` and the six elements; a reply saved with an
overview or a sequence then shows its prose and nothing for the block, which
older code does not know (it never shows JSON).

## 17. Guests, and one surface

The owner's words: "guests can have access to logos 5 … remove the old chat
interface entirely … but only 1 chat 1 map". What was archived, and what
still works, is in `docs/ARCHIVE.md`; this is how the guest part works.

**One line of thinking, and its map.** A guest (signed out, no access key)
opens Logos 5 as anyone else does: no cover, no key asked for. The first turn
claims a guest pass. `POST /api/logos/guest` with the line of thinking's id
sets `socria_guest`, an HMAC-signed, httpOnly, lax cookie scoped to
`/api/logos` that names that one session for 30 days (`lib/guest-pass.ts`;
the key is derived from `CLERK_SECRET_KEY`, so there is no new secret).
`/api/logos/chat` and `/api/logos/map` take a guest turn only in the session
the pass names (the map request now carries `sessionId`); anything else is a
401 with `guestLimit`, and a claim for a second session is a 403. Nothing is
spent on a refused turn.

On the screen (`components/LogosApp.tsx`), starting a second line of
thinking, or sending in one, opens `components/logos5/GuestWall.tsx`: "One
line of thinking, and its map", with Sign up free (focused), Keep going with
this one, and Sign in; Escape closes it. A 401 with `guestLimit` from either
route puts the turn back in the box and opens the same note.

**It comes with them.** On the first sign-in, a signed-out browser's lines of
thinking that have messages (up to five) are saved to the account and are no
longer kept on the device.

**What bounds a guest.** A cleared cookie can claim again. What bounds that is
the anonymous rate limit per address, as before: the pass only names a
session, and grants nothing a signed-out browser could not already do.

**What the Core rail held.** It was the only place that listed what others had
shared with someone, and the only way to type an invite code. Both are in
Logos 5 now: **Shared with you** is a group under their own conversations in
the Universal Map's List (`components/logos5/Universe.tsx`), and **Join with a
code** is in the More menu and under that group.

**Checked.** `test/guest.test.mjs` (30): the pass (signature, expiry, a forged
pass or another session refused), the claim route, both routes refusing a
guest with no pass or in another session, and the screen. `test/make-gallery.test.mjs`
renders Shared with you and checks where each shared thing opens. In the
browser against the local stand-ins, desktop and a 390px phone: Logos 5 opens
with no cover; the first turn claims a signed httpOnly pass for `/api/logos`;
the reply and the map answer 200 for that line of thinking; a second one opens
the note with Sign up free focused; Escape closes it; nothing more is sent to
Socria. No page errors. (Shared with you needs a signed-in browser, which the
stand-ins cannot give, so it is checked rendered, not clicked.)

## 18. Artifacts: drawn once, inside their card, chosen by sight

The owner's words: "artifacts are very buggy and need lots of fixing and i'd
hardcode some of them templates. and make the gui of selecting artifacts more
visual like you can see examples of them before choosing instead of just
small buttons". The screenshot: a Venn diagram of mitosis and meiosis asked
for, and Artifacts listing a "Picture" of overlapping triangles on axes that
spilled over the strip, and a second "Plot: The functions, plotted".

**What was wrong, and what changed.**

- *A picture over everything.* The picture layer is placed against its nearest
  positioned ancestor, and the card was not one, so the layer took the whole
  main column and covered the strip's pills. `.l5s-art-body` is now positioned,
  and a model, panel or 3D view in it has a height of its own and clips
  (`components/logos5/redesign.css`).
- *One ask, answered twice.* Told to draw whenever someone says "diagram", the
  map pass drew its own picture of the request beside the display. The rule
  that dropped that copy for charts now holds for every display kind: when a
  display is made, a picture invented this turn is dropped and one already on
  screen stays (`app/api/logos/map`, ONE ANSWER TO ONE ASK). A copy saved
  before the fix is not listed when its title names a display that is here.
- *The plot, listed twice.* The plot lens draws the picture or the model when
  there is one, so it is an artifact of its own only for functions nothing
  else draws, and "show me the plot" opens whatever draws it. These rules are
  one pure module now, `lib/logos5/artifacts.ts` (`pictureRepeatsDisplay`,
  `mapArtifacts`, `plotArtifact`), which `LogosApp` reads.
- *A phone's composer.* With something chosen to make, the composer's tool row
  widened the whole view past the screen and cut off the send button. The view
  can no longer be wider than the screen (`.l5v-body { min-width: 0 }`), and on
  a phone, with a choice made, the length dial shows only its icon.

**Templates, hardcoded.** Each choice that fills a display names its template:
a kind and the view it opens on (`lib/logos5/make.ts`, `template`).

| Choice | Template |
|---|---|
| Chart | data |
| Comparison table | compare, matrix |
| Timeline | plan, timeline |
| Study plan | plan, calendar (asked as "a study calendar") |
| Checklist | plan, checklist |
| Flowchart | diagram, flow |
| Pros and cons | crossroads, compare |
| Venn diagram | venn, venn |

The words a choice sends are read as exactly that kind and view, and the
asked-for view is held to when a display is drafted
(`lib/objects/display-propose.ts`), so what comes back is the template that
was shown. Two did not match before: the study plan previewed a board but
named no view, and pros and cons previewed Crossroads' centre but opens on its
comparison. A plot, a simulation and a 3D model are built by the engine and
have no display template.

**Seen before it is chosen.** `components/logos5/MakeGallery.tsx` is a card per
choice, each showing its template drawn by the display's own figure over the
catalogue's example (`sampleObject` in `components/display/Gallery.tsx`), or a
small drawing for what the engine builds. The preview is a picture, hidden
from assistive technology and inert, and the whole card is one button. The
empty Artifacts view shows the gallery under its heading, **+ Make** opens it
under the strip, and the composer's Make opens it small in its sheet (two to a
row on a phone). Choosing still works as before: the composer asks what it is
about, and the choice is said in words.

**Checked.** `test/make-gallery.test.mjs` (100): every template is a real kind
and view, and each choice's words (with something typed, with numbers, with
nothing typed) are read as it; every preview opens on its view; the gallery's
cards, buttons, inert previews and pressed state; the artifact rules; the
containment and phone CSS. Mutation-checked: changing a template's view back
to a board, or a preview that is no longer inert, fails it.
`test/display-e2e.test.mjs` (+4, through the real map route): "Make a Venn
diagram of mitosis and meiosis" makes the Venn diagram and keeps no picture of
it; a picture already on screen stays; with no display asked for, the map's
own picture is still drawn. In the browser, desktop and a 390px phone: the
screenshot's session with the picture inside its card, the pills pressable and
no second Plot; the gallery of eleven, each drawn; choosing Venn asks "Of
what? e.g. mitosis and meiosis"; the composer's sheet is the same gallery with
Venn marked; the send button stays in view with a choice made; no sideways
scroll, no page errors.

## 19. Four views, four jobs

The owner's brief: Chat converses, Content is read, Artifacts are made, the
Logic Map tracks. "Artifacts should primarily be user-requested or explicitly
accepted by the user"; ordinary explanations stay conversational; no extra
model calls, latency or cost; Core 4's Cognitive Allocation, Behavioral and
Epistemic Control and MR kept as they are.

**Kept.** Everything that decides a view already existed and still decides it:
the router's rules A–D (`lib/runtime/orchestrate.ts routeTurn`), what a sent
turn does to the screen (`lib/logos5/views.ts afterSend`, `onMade`), the
presentation planner and its inline elements (`lib/runtime/presentation.ts`),
the map pass and its sanitizer (`app/api/logos/map`), Content's cards derived
from the messages (`lib/logos5/content.ts`), the conversation's cards
(`components/logos5/L5Message.tsx`), Content's readers (`ContentView.tsx`) and
the artifact rules (`lib/logos5/artifacts.ts`). Allocation, behaviour, the
epistemic blocks and MR were not touched; a write-up turn still carries them
(the e2e suite checks the turn block is there).

**What was wrong (the audit).**

- *Pictures nobody asked for.* The map prompt said to draw "when seeing the
  idea move would teach it", so any map pass — the background cadence included
  — could put a picture in Artifacts. "How does American football work?" could
  come back with a field.
- *Made lenses listed unasked.* The plot, the working and the thing worked on,
  drawn by the map from any mathematical conversation, appeared in Artifacts
  with a "new" mark.
- *Requests with no route.* "Build a football simulator so I can learn by
  playing" and "can you show me a diagram of the field?" were conversation, so
  nothing opened.
- *A table swallowed.* "Can you put that in a table?" matched the Logic Map's
  comparison lens: the browser opened the map, ran a map pass and never sent
  the message to Socria.
- *No place to read.* "Write me detailed study notes on…" came back as pages in
  the conversation.
- *The map as an encyclopedia.* A learning conversation was mapped as a concept
  map of the subject — every term an explanation mentioned — rather than of
  the conversation.

**What changed.**

- *Chat.* An explanation stays prose. "How does X work?" may now carry one
  compact element, a sequence (`sequence:how-it-works`), which the reply may
  use or not; the core prompt says things are built when asked, and that
  where one would truly help (learning a game by playing it) it is offered in
  one line, the choice theirs (`LOGOS5_CORE`, THINGS BUILT, same length as
  before).
- *Content.* A request for something substantial to keep — notes, a guide, a
  report, a cheat sheet, "a detailed explanation of" — routes `reading`
  (`READING`). The reply is told it is a write-up read in Content (`WRITE_UP`,
  after the history), with room for it (the ceiling +1100), whatever the inline
  switch. Content lists it as a card ("Written by Socria · N words") and reads
  it as a document, headings drawn (`WriteUpReader`); the conversation shows
  its title, its opening and "Read it in Content", never the pages twice; while
  it arrives the thread says "Writing in Content" and counts words. A short
  summary, an email or their own essay are not write-ups.
- *Artifacts.* Rule C now also answers "show me a diagram of…" (`visual:show`),
  "build/make/create a … simulator, game, app, calculator, tracker,
  dashboard…" (`visual:make`, a thing named — "make a decision" is not one), and
  a plain yes to Socria's own offer to make something (`visual:accepted`; a yes
  to a question is not). The map pass keeps a picture only when the turn asked
  for one or said yes to an offer of one; a picture already on screen stays and
  is kept current while the talk is about it, the same kind
  (`app/api/logos/map`, A PICTURE IS MADE WHEN IT IS ASKED FOR; the prompt's
  NOT ASKED, NOT DRAWN). The map's made lenses are listed once asked for in
  words or taken from one quiet offer under the latest reply ("The functions
  here can be plotted. Plot them in Artifacts · Not now"); taken and declined
  are kept per line of thinking on this device. Artifacts is marked new only
  when a display or model was really added.
- *Logic Map.* THE MAP TRACKS THIS CONVERSATION, NOT THE SUBJECT: an
  explanation becomes at most one node for what it established, attached to
  the question it answered; a learning conversation is its questions, the gist
  of each answer, what was then understood or doubted, and the next question.
- *Tables.* `tableInReply`: a table of the answer is asked of Socria and stays
  in Chat; the map's comparison opens only when the map, a matrix or their
  options are named. Both browser shortcuts ask it first.

**The football example, as it runs.** "How does American football work? It's
confusing." — conversation; Chat answers, offered a compact sequence (the four
downs); nothing opens and Artifacts gets no mark; the map pass, when the
cadence runs it, adds the question and the gist of the answer, and keeps no
field it might have drawn. "And how does scoring work?" — a follow-up node.
"Can you build a football simulator so I can learn by playing?" — `visual:make`:
Artifacts opens beside the conversation and the map pass runs. The engine has
no football game to build; it builds what its kinds can, and the reply says
what it lets them do or that it could not.

**Cost.** No model call was added. The write-up block (542 characters) is sent
only on write-up turns, after the history, so the cached prefix is unchanged;
the +1100 output ceiling is a ceiling, spent only if written. The map
instructions grew by about 1,150 characters (1.5%), in their cached static
prefix. LOGOS5_CORE is 13,870 characters, inside its budget (55% of the chat
prompt). Deciding which replies are write-ups reads each request with the
router, which reads every display a request could name — about 2 ms a request —
so it is remembered per message and per conversation: 0.55 ms a render for a
400-message conversation, and one reading per message added.

**Checked.** `test/four-views.test.mjs` (106): prose conversations, lightweight
elements, explicit requests to make, nothing made because it could be,
write-ups (routing, shape, card, reader, streaming, a reply cut off, an empty
one), the Logic Map's instructions, lists and tables, several views answering
at once, and the cost of reading a long conversation.
`test/four-views-e2e.test.mjs` (20, through the real map and chat routes):
unasked pictures dropped, asked ones kept, a yes to an offer kept, a picture on
screen kept current and never replaced by one nobody asked for; the write-up
block, its ceiling, with inline elements off; the football explanation offered
only a sequence. Mutation-checked: with the map's gate removed, four fail.
`test/display-e2e.test.mjs` and `test/representation-e2e.test.mjs` now expect
the extractor's unasked picture to be dropped. The full suite: 280 suites
pass. In the browser (local stand-ins, desktop and a 390px phone): the football
explanation in Chat with its four-downs sequence and no mark on Artifacts; the
table request answered in Chat; the write-up as a card, its pages not in the
thread, "Read it in Content" opening it with its headings; the simulator
request opening Artifacts; the Logic Map never opening by itself; no page
errors.

**Limits.** What the model then writes is set by instructions, not measured
live: whether the reply uses the offered sequence, how well a write-up is
structured, how the extractor maps a learning conversation. The readers are
English. The made-lens offers are remembered per device. "Compare X and Y in a
table" still makes a comparison in Artifacts, as the display reader always
has. The engine cannot build a real football game.

**Switches and rollback.** `LOGOS_INLINE=off` turns off inline elements only;
write-ups are still filed in Content. Each part is its own change: the map's
gate in `app/api/logos/map`, the routes in `routeTurn`, the write-up path in
`presentation.ts` and `content.ts`.

## 20. Split View, redone: the views side by side

The owner's words: "split view is the artifact / logic map whatever the user
chooses … split views only shows what the user has open in the tabs …
artifacts / what's in logic map from split view into there (for example CAD
should be artifact)".

**What it was.** A drawer of ten workspace panels in three sections — Math
Plotting, Interactive Modeling, Studio (CAD), Displays, Thinking Map
Structure, Trace, Inspector, Mind, Parameters, the Conversation — each docked
beside the open view as a panel of its own. Five of them were things
Artifacts already held (a plot, a model, a 3D scene, a display) or the Logic
Map itself, drawn a second way; the rest were a model's tools and the memory.

**What it is now** (`lib/logos5/views.ts`, `components/logos5/L5Views.tsx`).
Two of the four views side by side: the one open, and beside it the
conversation, Content, the Logic Map, or Artifacts on an artifact chosen by
name. The pane beside is drawn by the same body its tab draws (`viewEl`), so it
shows exactly what that tab shows. The menu (`splitMenu`) offers only what this
line of thinking has: Content once something is brought, the Logic Map once it
holds ideas, each artifact by its title and kind; a view is never beside
itself. Choosing the tab that is beside swaps the two, so both stay on screen.

**Where the panels went.**

| Was in Split View | Now |
|---|---|
| Math Plotting, Interactive Modeling, Displays | the plot, the model, each display: artifacts, in Artifacts |
| Studio (CAD) | CAD: every 3D scene is an artifact labelled CAD; **Make → CAD** opens a new 3D studio in Artifacts, and the next description builds in it (Live 3D's own reader, no model call) |
| Thinking Map Structure | the Logic Map, as a view beside |
| Parameters, Inspector, Trace | the model's own tools, opened beside it inside its card (`components/logos5/ModelTools.tsx`): Parameters, Inspector, History |
| Mind | Memory, in the account menu, where it already lived |

"Show the parameters", "close the trace" and "show the model beside the map"
still work: a model's tool opens or closes inside its artifact, and the map
beside the model is the Logic Map with Artifacts beside it
(`screenForRequest`). A new studio is kept open if something asked for earlier
arrives while it is still empty; what arrived is listed beside it.

**Checked.** `test/logos5-views.test.mjs` (120): choosing, swapping, opening
and closing a view beside, `splitMenu` from every view, surface requests.
`test/split-view.test.mjs` (30): the shell, the menu, the model's tools
(rendered), CAD, and no trace of the old drawer. `test/logic-map-ideas`,
`test/make-gallery` and `test/logos5-shell` updated for CAD and the new menu.
In the browser (local stand-ins), desktop: a chart opens Artifacts with the
conversation beside; choosing Chat swaps them and the chart is drawn beside as
its tab draws it; the menu lists "Logic Map · 1 idea" and the chart by name and
none of the old panels; the Logic Map opens beside; Make → CAD opens a new 3D
studio and "a box 2 m wide, 1 m deep and 0.5 m tall" is built in it as a CAD
scene. A 390px phone: no Split View (one view at a time), and CAD opens and
builds in the Artifacts view from its own composer. No page errors.

**Limits.** The model's tools were checked by rendering, not in the browser:
the local stand-in cannot build a model. The 3D panel still names itself "Live
3D" inside its card, and its messages say "Built in Live 3D".

## 21. Any artifact, from a few primitives

The owner's words: "the user should be able to choose what artifact on prompt,
any artifact, it doesn't have to be in the list, the user can make their own
artifact and save the template, it's completely generative, so make a few
primitives but make sure it works too".

**The kind** (`lib/objects/display-custom.ts`). A custom artifact is a display
like the others — an object of thought, drawn, edited, undone, synced and read
back to the conversation — whose state is a list of blocks, each one of eleven
primitives:

| Primitive | What it is |
|---|---|
| text | a title, a heading, a paragraph or a note |
| list | items — a checklist when it can be ticked |
| table | columns of text, numbers, ticks, or a calc (a formula over the row's own cells and the artifact's numbers), with totals |
| number | something the person sets: a field, a stepper or a slider |
| value | something worked out, live, from a formula |
| chart | bars, a line or a pie, from a table's columns or its own points |
| progress | a checklist's ticks, a table's ticks, or a formula over a maximum |
| choice | options to pick, one or several, optionally with an answer to check |
| field | somewhere to write |
| timer | a countdown |
| group | a few blocks side by side |

Formulas are read by the kind alone — numbers, + − × ÷ ^ %, comparisons, the ids
of numbers and values, a table's column (`log.kcal`, for sum, avg, min, max,
count), a list's ticks (`steps.done`, `steps.total`) and round, floor, ceil, abs,
sqrt, pow, clamp and if. Nothing is ever run as code; a formula that does not
read, a division by zero or a loop of values leaning on each other is shown as
no value ("—"), never guessed. A tick is 1 and an empty tick 0. Every change is
an operation (set, tick, add/change/remove an item, change a cell, add/remove a
row), so it undoes and syncs; what the person set or wrote is theirs, and
Socria may not change it. "Set servings to 6", "tick milk" and "add bread to
the shopping list" are read as those operations.

**Asked for.** Make has **Your own** — "Describe it — e.g. a habit tracker for
exercise, reading and sleep" — which asks, in words, "Make a custom artifact:
…". A request for something no other kind is, by what it is ("make me a habit
tracker", "build a grade calculator", "make a pomodoro timer"), is read as one
too; "I want to make a tracker for my startup" is not. The map pass drafts it in
the same proposal pass as every display (no new call), offered the custom kind
alone when it was named, and the kind's sanitizer decides what of the draft is
kept: no block that is not a primitive, at most forty blocks, labels and text
capped, control characters out, ids a formula can name.

**Templates** (`lib/logos5/templates.ts`). **Save as template** on a custom
artifact keeps its blocks under its name, on this device (the 24 most recent;
saved again under the same name, the newer replaces it). Make shows them under
**Yours**, each drawn by the artifact's own figure as it was saved, each
removable. Picked, the request says so in words — "Make a custom artifact from
my template “Habit tracker”: piano practice" — and the template travels with
the message (`LogosMsg.make`); the map pass reads it through the kind's
sanitizer, never as written, hands it over by its shape (every block, a few of
a table's rows and a list's items as examples) and tells the proposal pass to
keep its blocks, kinds, labels, units and formulas and write its content for
what is asked now. What comes back says which template it was made from.

**Cost.** No model call was added: a custom artifact is drafted by the existing
display pass. Its description adds 3,064 characters (about 770 tokens) to that
pass's prompt only when no kind was named and every kind is offered; named, the
pass sees the custom kind alone (4,619 characters in all). Nothing is added to
the reply or the map instructions.

**Checked.** `test/custom-artifacts.test.mjs` (106): every primitive kept, junk
dropped, ids, limits; formulas, including code and properties that must not
read; calc cells, totals, values, progress and charts; every operation and the
authorship rules; words read as operations; what the conversation is told
(answers withheld while learning); requests that are and are not custom
artifacts; the drafting prompt with and without a template; the template store
(save, replace, order, remove, a broken store, a stored template the kind would
not keep, the limit); the figure drawing every primitive; Make's "Your own" and
Yours. `test/custom-artifacts-e2e.test.mjs` (14, through the real routes): a
custom artifact drafted and made, a pomodoro timer asked for by what it is, a
template handed to the pass and the result saying so, a template carrying junk
read through the kind first (mutation-checked: trusting it as written fails), a
large template handed over by its shape, a
draft the kind cannot hold and a declined one adding nothing, and the reply
told something is being built. In the browser (local stand-ins), desktop and a
390px phone: Make → Your own → "a habit tracker for exercise, reading and
sleep" makes a table of habits by day with a calc column, progress, a stepper
and a field; ticking updates the days, the total and the bar; the stepper
moves and Undo takes it back; Save as template puts it under Yours in Make;
picking it with "piano practice and stretching" makes the same columns again
for those, saying it was made from the template; the template can be removed.
The browser run found one bug the unit tests had missed — an empty tick read as
no value, so a row of ticks added up to nothing — now fixed and tested.

**Limits.** What the model drafts for a given description is not measured
here: the stand-in model drafts a fixed habit tracker. The primitives cannot
hold logic beyond formulas — no randomness, no rules that change other blocks,
no game loop — so a "football simulator" can be a tracker or a quiz, not a game.
Templates are kept per device. The timer's running is not saved (a countdown is
not a change to the artifact). A choice's answer is in the state the browser
holds, hidden only by the figure.

## 22. Socria Voice (experimental)

The owner's words: "make the entire Logos 5 workspace operable through natural
speech, with full voice parity with typed chat … Route spoken instructions
through the existing Logos 5 runtime … Do not create a separate voice chatbot
… Socria must respond in text within the existing chat, not through
synthesized speech … Do not simulate unsupported functionality or claim voice
parity where underlying tools are missing."

**What there was.** The composer's hold-to-talk mic (Logos 4, Voice to Text:
`components/useVoiceInput.ts`, `app/api/transcribe`, `lib/logos4/voice.ts`):
one recording, transcribed into the box, never sent. And one dispatcher for
every turn — `send()` in `components/LogosApp.tsx` — which already reads the
workspace's own commands (objects, the Live 3D scene, a lens or surface asked
for by name, a command to the map) before anything goes to the chat route,
where Cognitive Allocation, MR, memory, the map pass and the artifacts are. So
parity had one rule: **a spoken turn is a typed turn**. Everything the person
could do by typing in the conversation works said, because it is sent the
same way. What could only be done by a press — a tab, Split View, Undo, Start
writing, Retry — had no words; those were the gaps, and they were filled for
typed and spoken turns alike.

**The path.** Microphone → a recogniser → one turn (it ends at a pause) →
Voice's own few words, if it is one of them → a "yes" first, if it could take
something away → `send(text, …, 'voice')` → the workspace's commands, done
here, or the chat route → the workspace changes on screen and Socria answers
in text, in the conversation. Nothing is spoken back; no speech synthesis is
used anywhere.

**Two recognisers** (`components/logos5/useSocriaVoice.ts`), chosen in the
notice before Voice first listens, and in its settings:

| | Your browser's speech recognition | Socria's transcription |
|---|---|---|
| where | Chrome, Edge, Safari (`SpeechRecognition`) | any browser that can read the microphone |
| words | appear as they are said (interim results) | a sentence at a time, after the pause |
| the turn ends | after the pace's pause since the last word | after the pace's pause in the microphone's level (`lib/voice/vad.ts`) |
| the audio goes | to the browser maker's speech service, as their own dictation does | to `/api/transcribe` (the provider already in use), one short WAV per turn (`lib/voice/wav.ts`), kept nowhere |

The level detector reads the room's floor as the microphone opens (its
quietest moment), then follows it — down at once, up only slowly, so speech,
which dips between words, keeps it low while a fan that came on later is soon
below the line; a turn starts after three loud frames (a click is not one),
ends after the pause, and is thrown away as noise when too short to be words.
400 ms from before the turn begins is kept so its first syllable is not cut;
most of the pause that ended it is cut off. A minute of speech is under 2 MB.

**Listening** (`lib/voice/speech.ts`, `lib/voice/recognizer.ts`). The pause
that ends a turn is Short, Medium or Long (0.9, 1.4, 2.3 s). The browser's
recogniser is started again after every turn and whenever it stops by itself
— but one that stops again and again without hearing anything is reported
rather than restarted forever, and a phone's (Android) is run one recognition
per turn, since in continuous mode it repeats itself. **Pause** releases the
microphone (the browser's red dot goes out); the tab going to the background
pauses Voice; five minutes without a word turn it off, and the panel says why.
Words heard when listening is paused or turned off mid-turn are not sent: they
go into the box. Errors are said in words a person can act on — the
microphone refused (with how to allow it), none found, the browser's service
unreachable (with Socria's transcription offered instead), a transcription that
failed (kept for Retry), a busy one (retried by itself after the time the
server asks), signed out (with the browser's recogniser offered).

**While Socria answers** — interruption. A turn said while an answer is
arriving waits, shown in the panel with Drop, and is sent when the answer
finishes; set to **Stop the answer**, speaking stops it and sends the turn.
"Stop" stops an answer at once, either way. Moving around ("open the Logic
Map") happens at once even then, said in the panel.

**Voice's own words** (`readControl`, whole turns only): "stop", "pause
listening", "stop listening", "what can I say", "start dictating" / "stop
dictating", "send" (when turns go into the box), "yes" / "no" (only while a
confirmation waits), and "…scratch that" at the end of a turn, which throws the
turn away. "Socria, …" in a conversation with others is @socria.

**Steps.** "Open the Logic Map, then add a branch called cost" is two turns:
split at "then", "after that" or ";" when a part is one of the workspace's
commands and every part is a real phrase ("if the rent goes up then I move" is
whole), and at a plain "and" only when every part is a command.

**The workspace in words** (`lib/logos5/commands.ts`, read in `send()` for
typed and spoken turns alike, whole turns only, done by the function its press
calls, and said in the conversation):

| Said | Done |
|---|---|
| "Open the Logic Map", "Go to Content", "Show me the chat", "Show Artifacts" | the view |
| "Put the Logic Map beside", "Split view with Content", "Show chat and the Logic Map side by side", "Close the split view" | Split View — only what this line of thinking has, as its menu offers |
| "Open the habit tracker", "Open the chart" | an artifact, by its name or a kind there is one of |
| "Open my rent conversation", "Go home", "Go back", "Start a new line of thinking", "Open my memory", "Search for rent", "Open quick capture" | another line of thinking, the Universal Map, Memory, search, the capture inbox |
| "Shorter answers", "More detail", "Normal length" | the length dial |
| "Undo the last edit", "Redo" | what is on screen: the writing's own history, an artifact's, the Logic Map's last change |
| "Start writing", "Synthesize", "Try again", "Save this as a template", "Map this conversation", "Save the map as an image", "Hide the bars" | the press of that name |
| "Select the rent idea", "Clear the selection" | the card in hand (Point & Ask): "challenge this" is then about it |
| "Capture: call the landlord" | kept in Quick Capture for later |

**The Logic Map in words** (`lib/map-edit.ts`). "Add a branch called cost"
(from the idea named — "…to budget" — else the one last touched, else the
idea at the centre), "add another branch about time" (beside the last one
added), "add a question: why is rent so high?". "That", "it" and "this" mean
the card selected, else the idea last touched: "rename that to housing", "mark
it as resolved", "remove that". With nothing touched, "that" is not a label to
look for. A command that only lacks its words asks for them — "add a branch"
→ "What should the new branch say?" → "cost" — and the next short turn
completes it; "never mind" lets it go. A refused edit ("“cost” is already on
the map") is said as refused; before this, the conversation said "Added…" for
an edit the map had refused. Undo and Redo replay the change onto the map as it
is now (`replayMapChange`): the map pass redraws after every answer, so what it
drew since stays, and an idea changed since is left as it is.

**The writing in words** (`lib/write/voice-edit.ts`, when the writing is open;
each edit one step of the writing's own Undo, through `WriteSpaceHandle.apply`):
"add a heading called Results", "type: …", "add a bullet: …", "make that a
heading", "bold that", "underline the last sentence", "change that heading to
Methods" ("that heading" is the one it is, or the one over it), "change the
title to …", "replace rent with housing", "delete that paragraph". The writing
is theirs: these are their own edits, said; Socria still never writes in it.
**Dictation** writes what is said: "comma", "period", "question mark", "new
line", "new paragraph"; a dictation starts a paragraph of its own (after the
block the caret is in, else at the end) and continues it, in mid-sentence lower
case; an edit said while dictating is done, not written.

**A "yes" first** (`lib/voice/risk.ts`). A spoken turn that would take
something away is shown back and waits for "yes" (or a press): removing ideas
from the map, deleting from the writing, an artifact's removal — each read by
the reader that would do it, so what is confirmed is exactly what would happen
— or plainly asking to delete or clear. Keeping something in memory, taking
something out of it, and sharing work are sensitive and wait too. A question
about deleting is a question; typed turns are not asked again.

**Said, and marked.** A spoken turn is saved with `via: 'voice'` (kept by the
conversations and shared-conversation routes) and shown with a microphone,
"Said". The chat route adds one block to that turn's own context — never the
cached prompt — telling Socria the turn was spoken: a word may be misheard and
punctuation guessed, read it for what was meant, ask where a mishearing would
change the meaning, and answer in text (306 characters, about 77 tokens, on
spoken turns only).

**On screen** (`components/logos5/SocriaVoice.tsx`, `voice.css`). **Voice**,
marked **Experimental**, beside the box (on a phone, the length dial becomes
its icon and the badge sits on the button's shoulder). The first press opens
the notice: what Voice does, where the audio goes for each recogniser, the
promises (the microphone off when paused, a yes before anything is taken
away, what is said is marked), the settings, Start Voice. While on, a panel
over the box says what it is doing — starting, listening, hearing (the words
as they are said, the unsettled ones lighter, a bar filling through the pause
that will end the turn, Send now, Cancel), turning a turn into text, Socria
answering, paused, a problem — with a turn waiting, a confirmation, and what
the last turn did; Pause/Resume, help, settings and off are one press, and all
can be said. Over the Universal Map and Memory the panel floats at the foot of
the screen, so Voice is never listening where it cannot be seen. The
hold-to-talk mic steps aside while Voice is on. The status is a polite live
region; the confirmation an alert dialog. `NEXT_PUBLIC_SOCRIA_VOICE=off` hides
it; it is drawn only in Logos 5, for someone who may send, where the browser
can listen.

**Checked.** `test/socria-voice.test.mjs` (171): settings, Voice's words,
steps; the level detector (start, a click, a breath, the pause filling, the
end, noise, the limit, the room's floor and a fan that comes on later, a new
pace); the browser's results and errors, restarts, Socria's transcription's
answers; the WAV; what waits for a yes; every workspace command and what is
not one; the missing words; every writing edit applied, dictation; map adds,
"that", select, undo and redo on a map that moved on; the button, the panel in
each state, the notice, settings and help; every example on the help card read
by the reader that does it; and, from the source, one dispatcher, the box left
alone, no speech synthesis, "said" saved, the microphone released. In the
browser (local stand-ins): a scripted recogniser, desktop and a 390px phone,
46 checks each — a question said, sent, marked and answered in text; the view
moved; branches added, "that" renamed, undone and redone; a removal waiting
for a yes, refused, then confirmed; the writing opened, a heading and a
paragraph written, bolded, "change that heading" … "methods", undone; a
delete waiting for a yes; dictation with punctuation and paragraphs; a turn
held while Socria answered and sent after; pause, resume, the tab in the
background; a failing recogniser; home and back; help; off; and typing still
working, with typed words left in the box while a turn is said. Socria's
transcription through Chromium's fake microphone (8): a turn found by its
level, one 61 KB WAV sent, transcribed, sent as a spoken turn; Pause sends
nothing more. These runs found five bugs the unit tests had not: dictation
continued the heading last edited; mid-sentence capitals; a refused map edit
said as done; the box-clearing helper calling itself (every typed send would
have failed — the source check caught it, and the journey now types); and a
steady hum read as speech.

**Limits.** Voice cannot attach a file (the picker is a press), act on a
reply's inline elements (a slider, a choice), or Edit, Reply to or Copy a
particular message; it can open but not manage Memory, sharing, or export.
Logos 5 has no way to delete an artifact, by a press or in words, so neither
has Voice. The real
recognisers' accuracy is not measured here: the runs use a scripted recogniser
and the stand-in transcription's canned text. On Android the browser's
recogniser decides when a turn ends (choose Socria's transcription to set the
pace); on iOS a restart may need a tap ("Your browser needs a tap to keep
listening"). Socria's transcription is one paid call per turn, under the voice
rate limit (12 a minute signed in, 6 with an access key). A command is a whole
turn: "open the map of Europe and explain it" goes to Socria, which answers in
words and cannot press anything.
