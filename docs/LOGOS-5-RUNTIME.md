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
  Inspector's file list is always empty. Fixed (§6).
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

`ActiveViewport = 'chat' | 'content' | 'artifacts' | 'logic_map'`, Chat the
default; Components renamed Content; Rules A–D route from the runtime's
intent; Split View (Open Beside) docks one panel beside the primary view, in
three sections; Synthesize moved into the Content and Logic Map headers; the
Mind button moved into the account menu; "← Universal Map" persistent at the
top left; global search on Cmd/Ctrl+K; the study start card gone; Inter for
all chrome; the omnibox at 768 px, 28 px radius, paperclip inside, Enter to
send, Shift+Enter for a newline, growing to 240 px; real processing states
from the route's own activity markers; Universal Map titles of at most seven
words derived from the topic, no banner or legend, Today meaning sessions
begun today in local time with the specified empty node, and the wheel
panning sideways on This month and All time.

## 6. Memory

The Mind Graph is the one person-memory store for Logos 5. Changes in this
pass: a `stated` claim about the person must be grounded in their own words
or it is stored as Socria's reading; a file can never assert something about
the person; proposed changes stay proposals until reviewed; recalled memory
carries its provenance into the prompt; the atlas says "Confirmed" only for
what the person confirmed and "You said it" only for what they said; nodes
can be confirmed; hand edits keep the value they replaced and are protected
from extraction; off-the-record turns never reach any memory store.

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

## 10. Results

Filled in when the work is complete.
