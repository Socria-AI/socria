# Core 4: the architecture as it exists

A living description of what Core 4 does **today**, on `dev`. Not a plan:
if something is here, it is in the code, and each section names where. What
was decided and why is in `CORE-4-COGNITIVE-DESIGN.md`; what has been
measured, including where Core 4 loses, is in `CORE-4-EVALS.md`; what is
being tested next is in `CORE-4-EXPERIMENTS.md`. The earlier map of the
pre-Core-4-loop architecture, and the hostile review that preceded this
work, are in git history (`693c930`) and `CORE-4-STRATEGY.md`.

**The objective:** increase human capability while preserving meaningful
human agency. **The loop:** UNDERSTAND → ALLOCATE → INTERVENE → MEASURE →
LEARN — operationalised in code, state and decision logic. The reply model
receives the decision; it is not asked to make it.

---

## 1. One Core 4 turn

`POST /api/chat` with `model: 'core-4'` (`app/api/chat/route.ts`). The
client sends the conversation; the server holds everything Core 4 knows.

| # | Step | Where | What happens |
|---|---|---|---|
| 1 | Auth, rate limit, validation | `route.ts` | Core 4 requires an account. |
| 2 | Project + memory recall + **prepare** (in parallel) | `route.ts`, `lib/mind/pipeline.ts`, `lib/core4/turn.ts prepareTurn` | The Project (if any) is loaded first, then Mind Graph recall and `prepareTurn` run concurrently. |
| 3 | UNDERSTAND: explicit signals | `lib/core4/signals.ts` | Deterministic reading of the person's own words: "just tell me", "don't give me the answer", "I'm learning this", "I'm a senior engineer", "graded homework", "stop asking", "I already said that", frustration, corrections, feedback. Negation-aware. The Project's instructions are read the same way, as a standing contract. |
| 4 | UNDERSTAND: load | `lib/core4/store.ts` | Last turn's Cognitive State for this conversation and the relevant part of the Reasoning Ledger, in parallel. |
| 5 | UNDERSTAND: read | `lib/cognition/engine.ts readState` | One cheap-model JSON call (5 s timeout) over the transcript, the prior state and what is already considered. Reports evidence, never traits. Cannot mark anything explicit and cannot set directness. |
| 6 | UNDERSTAND: merge | `lib/core4/merge.ts` | Precedence: the person's words now > the Project contract > what persisted > the reader's inference. Inferred fields are sticky (a contrary reading must be at least as confident). "Just tell me" fades after two turns; "don't tell me" holds until they say otherwise. The previous turn's outcome is attached to its memo. |
| 7 | Corrections | `lib/core4/ledger.ts disputeTurn` | "That's not what I meant" marks their ledger entries from the previous turn *disputed*. |
| 8 | MEASURE (before): budget + diminishing returns | `lib/core4/budget.ts`, `questions.ts` | The question budget is priced from the transcript (any interrogative content: explicit, disguised, closing offers), streak and density. Diminishing returns are detected from explicit signals (one suffices) or inferred ones (two must agree). |
| 9 | Verify Mode, exact | `lib/core4/verify.ts exactCheck` | Arithmetic in an attempt is computed exactly **before** the move is chosen; a computed verdict overrides the reader's. |
| 10 | ALLOCATE | `lib/core4/allocation.ts` | Who does which part of the thinking, with a machine-readable rationale and a withhold (what, reason, evidence, source) — or none. |
| 11 | INTERVENE | `lib/core4/intervene.ts` | One move, with type, reason code, intended outcome, human work preserved, AI work performed, confidence, whether the guard must read it, max questions, token budget. |
| 12 | Verify Mode, checker | `lib/cognition/engine.ts checkWork` | Only when something is withheld and arithmetic could not settle it: a separate cheap-model call judges the attempt (4 s timeout). Its expected answer never reaches the reply model; a confident verdict that contradicts the reader re-decides the move. |
| 13 | Prompt assembled | `lib/socria-prompt.ts buildSystemPrompt` | Core 4 prompt v2, imported profile, Project, Mind Graph, then the state block, the verify block, the move block — in that order, last before the transcript. No thread memory, no Thinking Journey. |
| 14 | Generate | `route.ts core4Reply`, `lib/core4/model.ts` | Through the model seam. **Buffered** if the move withholds or raises a perspective (so the guard reads the whole draft); otherwise **streamed** through the sentence gate. |
| 15 | Answer Guard 2.0 | `lib/core4/guard2.ts`, `turn.ts guardReply` | Deterministic first; cheap model only for what structure cannot decide, and only to *delete* sentences. One regeneration by the reply model if needed; the retry is always re-checked; a failing retry is never shipped (`fallbackReply`). |
| 15′ | Stream gate | `lib/core4/stream-gate.ts` | Streamed moves: sentences go out as they complete, but any interrogative (explicit, disguised, offer) is held; released if exposition follows (rhetorical), otherwise shipped only within the budget. Sycophantic openers are removed. Code passes through. |
| 16 | LEARN: write back | `turn.ts finishTurn` | Before the stream closes: ledger entries (attributed in code), links, the carried-forward state with this turn's memo, the content-free trace, capability evidence, and the previous turn's outcome on its own row. |
| 17 | Mind Graph writeback | `route.ts` → `remember()` via `waitUntil` | After the response, kept alive by `waitUntil`. |

Failure directions are chosen, not accidental: no reader → carry the last
state forward (never an empty state that routes toward asking); no guard
model → keep the deterministic verdict; no store → lose one turn of
continuity, never the reply; a reader or checker timeout never blocks the
turn.

## 2. The modules

### Explicit signals — `lib/core4/signals.ts`
Pure regex-and-negation reading of the latest message (`readSignals`) and of
Project instructions (`readContract`). Code, quotes and attachments are
stripped first. The latest directness statement in a message wins; a request
for the answer inside a refusal ("don't just give me the answer") is not a
request. Tested in `test/core4-signals-questions.test.mjs`.

### Cognitive State v2 — `lib/cognition/state.ts`, `lib/core4/merge.ts`
Compact and explicit about provenance. Every field that could be a guess is
an `Inferred<T>`: `{value, source: explicit|observed|inferred|default,
confidence, evidence, since}`. Fields: task and work kind, learning goal,
expertise, stakes, directness, authorship, stuck, attempt, mastery evidence,
positions, tensions, the items the person raised this turn (`consideredNow`,
each with a verbatim quote, stance and reason), the last outcome, the last
eight turn memos, question preference, turn number. `renderState` shows the
model what they **said** separately from what Socria **inferred**, and the
latter is marked "may be wrong — never state it to them as fact".
Persisted per conversation in `core4_state`.

### Cognitive Allocation — `lib/core4/allocation.ts`
Modes: `AI_EXECUTES`, `AI_EXPLAINS`, `AI_VERIFIES`, `SHARED_REASONING`,
`AI_ASSISTS`, `HUMAN_LEADS`, `HUMAN_PRACTICES`, `HUMAN_REFLECTS`.
**Withholding requires an explicit source** — the message, earlier in the
conversation, or the Project — and one of five reasons: `practice_goal`,
`requested_no_answer`, `authorship`, `assessment_integrity`,
`agency_boundary`. An inference never withholds anything (tested
exhaustively: 144 inferred-only states, zero withholds). A wrong attempt gets
the correction; a bug gets the fix; "just tell me" beats everything except
graded work they will submit, where the method is explained fully with an
analogous worked example and the submittable answer is held back — said once,
plainly. The latest explicit statement beats a standing Project instruction,
and the rationale records the override. The first withholding in a
conversation is announced with how to get the answer.

### Intervention Engine — `lib/core4/intervene.ts`
Selectable moves: ANSWER, EXPLAIN, CORRECT, VERIFY, CRITIQUE, CHALLENGE,
CONTRIBUTE, CONNECT, SYNTHESIZE, QUESTION, CLARIFY, HINT, EXECUTE, CALCULATE,
RETRIEVE, REFLECT, GET_OUT_OF_THE_WAY. RESEARCH, MODEL and VISUALIZE are in
the type only: there are no tools in this path, and the prompt says so.
Defaults are CONTRIBUTE (thinking together) or ANSWER (asked), never ASK.
QUESTION and CLARIFY cannot be selected when the budget is spent. CLARIFY for
a genuine blocker says what can already be said first. Diminishing returns
switch strategy and the switch is recorded. Every decision carries
`reasonCode, reason, intendedOutcome, humanWorkPreserved, aiWorkPerformed,
confidence, guardRequired, maxQuestions, objective, avoid, switchedFrom,
maxTokens`.

### Question budget and diminishing returns — `lib/core4/budget.ts`, `questions.ts`
One counter for "a question" everywhere (engine, guard, gate, grader):
explicit `?` sentences, disguised interrogatives ("it might be worth
thinking about…", "ask yourself…", "what do you think"), and closing offers.
Budget: 0 after two asking replies in a row, or one asking reply in a
mostly-asking conversation, or on diminishing returns or frustration; 0
always after "stop asking"; 1 when they asked to be quizzed; a genuine
blocker earns one back below a streak of three.

### Already Considered and the novelty gate — `lib/core4/considered.ts`, `ledger.ts consideredView`
The already-considered record is a **view over the Reasoning Ledger**, not
a separate store: what the person raised, ruled out (and why), settled — and
what Socria already said — ranked by conversation, Project and relevance.
The move block lists it; the guard enforces it. Matching is lexical (stems,
synonyms, a damped overlap score): ≥0.6 REDUNDANT (sentence removed, or a
regeneration past it when everything is redundant), ≥0.34 UNCERTAIN (the
cheap model judges; it can only name sentences to delete). Sentences that
explicitly build past a covered item ("you've already ruled out X; …") are
not candidates. Gated: perspective moves always; ANSWER when thinking
together and there is a record; pure information answers never.

### Reasoning Ledger — `lib/core4/ledger.ts`
Entries (`claim, evidence, assumption, objection, alternative, hypothesis,
question, decision, uncertainty, conclusion` …) and links (`supports,
contradicts, derived_from, rejected_because, responds_to` …), each with owner
(`user | socria | unknown`), stance (`asserts, entertains, asks, rejects,
accepts, resolved`), basis (`quoted | paraphrased | inferred`), status,
confidence and revision history. **Attribution is enforced in code**: an
entry is the person's only if its quote is in their message, or it is a
close paraphrase that agrees on which shared concepts are negated. Anything
else is `unknown` — it can stop repetition but is never said back as theirs.
What Socria says is recorded as Socria's, from the text actually sent.
Adoption of a Socria idea creates a *new* user entry linked `derived_from`;
ownership is never rewritten. `toLogosGraph` renders the same substrate as
nodes and edges for Logos. Tables: `reasoning_entries`, `reasoning_links`.

### Answer Guard 2.0 — `lib/core4/guard2.ts`
Two-sided. **Overreach** (only when something is withheld): the private
verify value, gives-then-asks ("the rule is X… now try it yourself"), a
worked solution inside a HINT/VERIFY/QUESTION. **Underhelp**: questions over
budget (stripped), a reply that is only questions (regenerate; OVERRIDE_WITH_
DIRECT_ANSWER when the machine should do the work), deflection ("it depends
on your goals") to a direct request. **Novelty** (above). **Voice**:
sycophantic opener, closing offers. Actions: ALLOW, MODIFY_FOR_MORE_AGENCY,
MODIFY_FOR_MORE_HELP, OVERRIDE_WITH_DIRECT_ANSWER, REQUEST_CLARIFICATION. The
cheap model is consulted on withheld turns and uncertain novelty; its output
is used to delete named sentences or to trigger a frontier regeneration —
never shipped as prose.

### Verify Mode — `lib/core4/verify.ts`
Exact arithmetic via the Logos evaluator, before the move is chosen. A
separate checker call for everything else, only when something is withheld.
The reply model gets VERDICT / WHERE / KIND OF ERROR, never the expected
answer; the guard gets the expected answer (and its spellings) as hidden
values to keep out of the reply. Below 0.7 confidence the checker's verdict
is not claimed. When nothing is withheld, the correct answer is given to the
reply model so it can correct plainly.

### Outcomes, capability, telemetry — `merge.ts explicitOutcome`, `capability.ts`, `trace.ts`
Labels: HELPED, PARTIALLY_HELPED, WAS_TOO_DIRECT, WAS_TOO_INDIRECT,
WAS_REDUNDANT, CONFUSED_USER, UNLOCKED_PROGRESS, FRUSTRATED_USER, UNKNOWN —
from the person's words (explicit) or the reader (inferred, capped at 0.7).
Used in the next turn's selection (a move that just landed badly is not
repeated; friction outcomes feed diminishing returns). **No online learning**:
nothing updates policy automatically. Capability is **evidence events**
(demonstrated unassisted / assisted, self-corrected, misunderstanding,
needed the answer), per concept, counted — with independent capability
credited only in a *later conversation* than the help. The per-turn trace
is content-free (enums, counts, reason codes, timings, model ids, prompt
version).

### The model seam — `lib/core4/model.ts`
Every Core 4 model call (state, reply, retry, guard, verify, extract) goes
through `modelClient()`. Production is OpenAI, configured as before. The
eval harness installs its own client, so what is evaluated is the shipped
pipeline.

## 3. Memory, unified

| Layer | Holds | Written | Read by Core 4 |
|---|---|---|---|
| **User memory** (Mind Graph) | what Socria understands about the person: projects, goals, preferences, people, files | `remember()` after each turn | yes — recall, bounded, focused by Project |
| **Cognitive State** | where this conversation stands now | every turn | yes — state block |
| **Already Considered** | a view over the ledger | — | yes — move block + guard |
| **Reasoning Ledger** | the moves of their reasoning, attributed | every turn | yes — via Already Considered, RETRIEVE |
| **Capability evidence** | observable events per concept | every turn with an attempt | not in the prompt; Memory page and evals |
| **Intervention history** | memos in the state; content-free traces | every turn | memos yes; traces no |
| Thread memory, Thinking Journey | older per-thread and cross-thread summaries | **not for Core 4** | **no** |
| Flat person-memory | older top-k list | not for Core 4 | no |

Each concern has one home. Core 4 conversations get a title from a
title-only extractor path (`app/api/extract-memory`, `titleOnly`).

## 4. Privacy

- **Minimisation.** The state is compact and capped; the ledger stores short
  texts and quotes; traces store no text at all.
- **Provenance.** Every inferred field carries source, confidence and
  evidence; every ledger entry carries owner, basis and revisions.
- **No psychological inference as fact.** The reader is instructed to
  report evidence about the task, never traits; inferred fields are shown to
  the model as possibly wrong and never to be stated to the person as fact;
  an inference can never withhold anything.
- **Correction.** `/api/core4` + the Memory page: edit, disown ("not mine"),
  retract, restore, delete entries; set or reset inferred fields; forget a
  conversation's state or a concept's evidence. Every correction is recorded
  as the person's.
- **Deletion.** All five tables are in account deletion (`OWNED_TABLES`,
  checked by `test/account-data-complete`) and in "forget what Socria worked
  out" (`/api/account/memory`).
- **Export.** All five tables are in the account export, with a note on what
  is said versus inferred.
- **Retention.** Turn traces are purged after 180 days, at write time.
- **Row-level security.** Deny-by-default RLS on all five tables
  (`supabase/rls.sql`, checked by `test/rls-covers-schema`).
- **No training reuse.** None of it is used to train models; any research use
  would require explicit consent and a policy that does not exist yet.

## 5. Latency and cost

Added to a Core 4 turn, before the first token: the state read (cheap model,
≤5 s, usually well under 1 s of wall time relative to recall, which runs
concurrently), the state/ledger load (parallel), and — only on withheld
attempts — the checker (≤4 s). Buffered moves add the guard (deterministic:
negligible; cheap model on withheld turns and uncertain novelty: ≤5 s) and,
rarely, one regeneration. Streamed moves add nothing but the sentence gate.
Timings for every stage are in the trace (`ms`).

## 6. What is not built, and why

- **Tools** (search, code execution, visualisation). None in this path; the
  prompt says so. RESEARCH/MODEL/VISUALIZE exist only as types.
- **Embeddings** for the novelty matcher: lexical + cheap-model judge first;
  embeddings only if the evals show paraphrase misses that matter.
- **Online learning from outcomes.** Deliberately not: outcomes are recorded
  and used within the conversation; policy changes go through the council
  and the evals.
- **Logos on the ledger.** The substrate is Logos-shaped (`toLogosGraph`);
  Logos does not read it yet.
