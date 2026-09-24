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
receives the decision: always the constraints (question budget, anything
held back and why, what the person has established and already raised),
and a specific move **only when the person asked for it or a verified fact
settles it**. Otherwise the stronger model chooses the move itself — run 1
showed a cheap reader's guesses narrowing it (`CORE-4-EVALS.md`).

---

## 1. One Core 4 turn

`POST /api/chat` with `model: 'core-4'` (`app/api/chat/route.ts`). The
client sends the conversation; the server holds everything Core 4 knows.

| # | Step | Where | What happens |
|---|---|---|---|
| 1 | Auth, rate limit, validation | `route.ts` | Core 4 requires an account. |
| 2 | Project + memory recall + **prepare** (in parallel) | `route.ts`, `lib/mind/pipeline.ts`, `lib/core4/turn.ts prepareTurn` | The Project (if any) is loaded first, then Mind Graph recall and `prepareTurn` run concurrently. |
| 3 | UNDERSTAND: explicit signals | `lib/core4/signals.ts` | Deterministic reading of the person's own words, in tiers (council D2): only STRONG phrasing ("I want to work it out myself", "don't tell me the answer", "hints only", "let me try it first", graded work they will submit) can lead to anything being withheld; "I'm studying X", "help me understand" are context. Also: "just tell me", "stop asking", "I already said that", "idk", "which would you pick?", "you gave it away", emergencies (the safety signal), requests FOR questions, corrections, feedback. Negation-aware; code, quotes and attachments are not read. The Project's instructions are read the same way, as a standing contract. |
| 4 | UNDERSTAND: load | `lib/core4/store.ts` | Last turn's Cognitive State for this conversation and the relevant part of the Reasoning Ledger, in parallel. |
| 5 | UNDERSTAND: read | `lib/cognition/engine.ts readState` | One cheap-model JSON call (2 s timeout) over the transcript, the prior state and what is already considered. Reports evidence, never traits. Cannot mark anything explicit and cannot set directness. |
| 6 | UNDERSTAND: merge | `lib/core4/merge.ts` | Precedence: the person's words now > the Project contract > what persisted > the reader's inference. Inferred fields are sticky (a contrary reading must be at least as confident). "Just tell me" fades after two turns; "don't tell me" holds until they say otherwise. The previous turn's outcome is attached to its memo. |
| 7 | Corrections | `lib/core4/ledger.ts disputeTurn` | "That's not what I meant" marks their ledger entries from the previous turn *disputed*. |
| 8 | MEASURE (before): budget + diminishing returns | `lib/core4/budget.ts`, `questions.ts` | The question budget is priced from the transcript (any interrogative content: explicit, disguised, closing offers), streak and density. Diminishing returns are detected from explicit signals (one suffices) or inferred ones (two must agree). |
| 9 | Verify Mode, exact | `lib/core4/verify.ts exactCheck` | Arithmetic in an attempt is computed exactly **before** the move is chosen; a computed verdict overrides the reader's. |
| 9′ | PROBLEM MODEL | `lib/core4/problem.ts buildProblem` | The live ledger read as a connected structure, not a list: each item with an epistemic reading (assumed / unchecked / disputed / user-stated, derived from columns that already exist) and the dependency edges the reader named this turn plus the ones stored from earlier turns. A **view**, not a store — same sentences, one place. Scoped to this conversation, plus the same Project when there is one; never a private entry outside its own conversation. Pure; no model call. |
| 9″ | MISSING CONTRIBUTION | `lib/core4/contribution.ts detectMissing` | What is ABSENT, asked before the move is chosen: a conclusion resting on an unsupported assumption, a contradiction between distant turns, a belief still resting on something dropped, a load-bearing claim with no evidence, a decision with nothing bounding it, a two-option framing, a question open for many turns. Pure queries over the graph. Gated by the same novelty classifier the guard uses (excluding the finding's own subjects) and by task-scoped expertise; at most one is raised. |
| 9‴ | EXPERTISE, per task | `lib/core4/capability.ts taskCompetence` | What they have SHOWN on this concept, counted from verified events in `capability_evidence` — which had been written every turn and never read back. Conservative and asymmetric: two unassisted successes for 'expert', one miss pulls back. Their own words are never overridden. |
| 10 | ALLOCATE | `lib/core4/allocation.ts` | Who does which part of the thinking, with a machine-readable rationale and a withhold (what, reason, evidence, source) — or none. |
| 11 | INTERVENE | `lib/core4/intervene.ts` | One move, with type, reason code, intended outcome, human work preserved, AI work performed, confidence, whether the guard must read it, max questions, token budget, **coverage** (how much of what matters this reply should cover — `complete` only on a high-stakes turn for someone with demonstrated expertise, on a move that carries substance, with nothing withheld) — and whether it is **forced**. Forced only on explicit or verified evidence (their words, a contract, safety, a computed/checked verdict, an injected calculation); otherwise the move block renders constraints only ("No move is imposed"). |
| 11′ | MEASURE, not read — counterfactual | `lib/core4/counterfactual.ts testDependencies` | The conclusion the person has landed on, with ONE premise removed, re-derived on the cheap model. Does it still follow? Up to 4 ablations in parallel, 2.5 s ceiling, `coverage === 'complete'` only. The output is generated by intervention, not recalled from context: **the first stage in Core 4 that no system prompt can reproduce**, because producing it requires running the model on a premise set the person never wrote. Replaces `problem.ts`'s ASSERTED dependency edges with measured ones, which is also why it does not wait on E16. |
| 11″ | MEASURE, not read — calibration | `lib/core4/calibration.ts calibrate` | The claim carrying the turn, asked independently 5 times at temperature 1, clustered. A single forward pass cannot know its own variance, so this is information that does not exist in one call. **Strictly one-directional**: wide disagreement is reported, agreement is never reported as confidence — a weak model agreeing with itself is not evidence, and a stage that can only lower a claim's standing cannot be used to inflate one. |
| 12 | Verify Mode, checker | `lib/cognition/engine.ts checkWork` | Whenever they offered something to check and arithmetic could not settle it — not only under a withhold, which was the old gate and meant the checker ran on 6 of the 38 turns in run 6 that had checkable work, the other 32 shipping the cheap reader's guess as fact. A separate cheap-model call judges the attempt (1.5 s timeout). Its expected answer never reaches the reply model; a confident verdict that contradicts the reader re-decides the move. |
| 13 | Prompt assembled | `lib/socria-prompt.ts buildSystemPrompt` | Core 4 prompt v6 (v5 added the baseline's peer instruction, contributing what they have not considered, after run 3; v6 lets decisions and expert analysis be complete rather than brief, after run 4), imported profile, Project, Mind Graph, then the state block, the verify block, the move block — in that order, last before the transcript. No thread memory, no Thinking Journey. |
| 14 | Generate | `route.ts core4Reply`, `lib/core4/model.ts` | Through the model seam. **Buffered** only if something is withheld (so the guard reads the whole draft before anything is sent); otherwise **streamed** through the sentence gate (council D8 — buffering every perspective move put the latency on expert turns). |
| 15 | Answer Guard 2.0 | `lib/core4/guard2.ts`, `turn.ts guardReply` | Deterministic first; cheap model only for what structure cannot decide, and only to *delete* sentences. One regeneration by the reply model if needed; the retry is always re-checked; a failing retry is never shipped (`fallbackReply`). |
| 15′ | Stream gate | `lib/core4/stream-gate.ts` | Streamed moves: sentences go out as they complete, but any interrogative (explicit, disguised, offer, comprehension check) is held; released if exposition follows (rhetorical), otherwise shipped only within the budget, and never if it re-asks something already considered. Questions the person asked FOR pass straight through. Sycophantic openers are removed. Code passes through. |
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

### Standing requests, absences, privacy modes — `merge.ts`, `signals.ts`
"From now on, just give me answers" is standing; a bare "just tell me" fades
after two turns. "Only tell me if I've gone off the rails" / "don't tell me
what's wrong, finding it is the point" / "tell me how to look, not what to
change" set a sticky verdict-only preference. A requested quiz or drill is a
contract: exactly one item per turn, after saying whether the last answer
was right. After six hours away momentary state resets (stuck, urgency, a
momentary "just tell me", the last outcome); after two weeks inferred
readings lose half their confidence. "Off the record" stops everything
from being kept (no ledger, no capability evidence, no free text in the
saved state, no Mind Graph write) until "you can remember this"; a
sensitive subject (health, grief, divorce, immigration, debt…) makes the
conversation conversation-only — its ledger entries are private to it, no
capability evidence is kept, its Mind Graph memories are written private.

### Cognitive Allocation — `lib/core4/allocation.ts`
Modes: `AI_EXECUTES`, `AI_EXPLAINS`, `AI_VERIFIES`, `SHARED_REASONING`,
`AI_ASSISTS`, `HUMAN_LEADS`, `HUMAN_PRACTICES`, `HUMAN_REFLECTS`.
A **safety gate** comes first: harm now (an emergency, a poisoning, money
being taken) suspends every contract and gets immediate direct
instructions. Explicit directness is evaluated before "being heard".
**Withholding requires an explicit source** and carries the person's quote
and what they can have instead (both required; a withhold without a quote
throws in tests and degrades to helping in production) — the message, earlier in the
conversation, or the Project — and one of five reasons: `practice_goal`,
`requested_no_answer`, `authorship`, `assessment_integrity`,
`agency_boundary`. An inference never withholds anything (tested
exhaustively: 144 inferred-only states, zero withholds). A wrong attempt gets
the correction; a bug gets the fix; "just tell me" beats everything except
graded work they will submit, where the method is explained fully with an
analogous worked example and the submittable answer is held back — said once,
plainly. The latest explicit statement beats a standing Project instruction,
and the rationale records the override. Being heard (acknowledgement only)
happens only when they say so ("I just need to vent", "don't want
advice") — an inferred "reflection" never narrows help. Creative work and
judgement are critiqued, never "corrected". The first withholding in a
conversation is announced with how to get the answer. A standing "don't
tell me" never covers a plain fact, a definition or mechanical work.
**Verification first**: an attempt under "hints only" still hears whether
it is right (and a right one hears it first). **The ladder bottoms out**:
after repeated failed attempts on an item (sooner after "idk" or
frustration) Socria works it fully with the principle named, and the next
item is theirs again. "Let me try it first" with nothing tried gets "go
ahead". "Which would you pick?" gets a pick, marked as a view, with the
value that would flip it.

### Intervention Engine — `lib/core4/intervene.ts`
Moves: ANSWER, EXPLAIN, CORRECT, VERIFY, CRITIQUE, CHALLENGE, CONTRIBUTE,
CONNECT, SYNTHESIZE, QUESTION, CLARIFY, HINT, EXECUTE, CALCULATE, RETRIEVE,
REFLECT, GET_OUT_OF_THE_WAY. RESEARCH, MODEL and VISUALIZE were removed
(council D7): there are no tools in this path. Their privacy contract, for
when tools exist, is written down in `lib/core4/tools-contract.ts`.
Defaults are CONTRIBUTE (thinking together) or ANSWER (asked), never ASK.
QUESTION and CLARIFY cannot be selected when the budget is spent. CLARIFY for
a genuine blocker says what can already be said first. Diminishing returns
switch strategy and the switch is recorded. Every decision carries
`reasonCode, reason, intendedOutcome, humanWorkPreserved, aiWorkPerformed,
confidence, guardRequired, maxQuestions, objective, avoid, switchedFrom,
maxTokens, coverage`.

**`coverage`** (`minimal | normal | complete`) is how much of what matters the
reply should cover, computed from the state the allocator already read. Run 8
measured why it has to exist: on 12 of 22 turns the state block said `stakes:
high, expertise: expert`, the prompt names exactly that case as the exception
to its own "1-3 short paragraphs" default, and nothing carried the reading to
it — so Core 4 answered in 280 words to a prompt-only baseline's 425 and lost
6 of 8 scenarios on substance while winning friction 1.75 to 3.00. Rendered
inside the move block, where the prompt's Precedence section puts it above the
general guidance, and above an objective that caps how much to add ("one
sentence on it. Then stop"). Gated hard, because the opposite failure is on
record too (runs 4-6 lost expert turns for padding): substantive moves only,
both conditions required, **never beside a withhold** — "cover everything that
matters" next to "keep this from them" resolves as a leak — and any length the
person named wins outright.

### Question budget and diminishing returns — `lib/core4/budget.ts`, `questions.ts`
One counter for "a question" everywhere (engine, guard, gate, grader):
explicit `?` sentences, disguised interrogatives ("it might be worth
thinking about…", "ask yourself…", "what do you think"), and closing offers.
Budget (council D4): 0 after two asking replies in a row, or when a
question-bearing reply is among the last three outside practice (at most
one in four), or after "just tell me", or on diminishing returns or
frustration; 0 always after "stop asking"; 1 when they asked to be quizzed.
There is **no question re-granted for a blocker**: when something only they
can supply is missing, Socria proceeds under a stated assumption and says
what to send as an instruction, not a question. Comprehension checks ("Does
that make sense?") are always stripped.

### Already Considered and the novelty gate — `lib/core4/considered.ts`, `ledger.ts consideredView`
The already-considered record is a **view over the Reasoning Ledger**, not
a separate store: what the person raised, ruled out (and why), settled — and
what Socria already said — ranked by conversation, Project and relevance.
**Prevention is primary**: the move block lists it, stance and all, and
tells the model not to raise any of it as new. Detection is a backstop. Only things that can be *raised* are gated —
objections, alternatives, questions, assumptions, hypotheses, uncertainties
(and Socria's own objections and questions); facts and decisions they hold
are shown as context but never grounds for deletion. Matching is lexical
(stems, synonyms, a damped overlap score) as a **filter**: ≥0.6 on a
re-asked *question* deletes it; any other overlap ≥0.34 goes to the cheap
model, which may only name sentences to delete and is told that using,
applying or contrasting a considered item is not raising it. (Lexical
deletion of statements was removed after the pilot — see
`CORE-4-EVALS.md`, findings 2 and 4.) Sentences that
explicitly build past a covered item ("you've already ruled out X; …") are
not candidates. On streamed turns (nothing withheld) only a re-asked
*question* can be dropped, by the stream gate; the model check of
statements runs only on buffered turns. A re-raised statement on a streamed
turn is therefore not caught — a known limit, measured by E5.

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
ownership is never rewritten. There are no lexical auto-links (council D10): a link drawn from word
overlap would be structure presented as reasoning the person never stated.
`toLogosGraph` renders the same substrate as nodes and edges for Logos. Tables: `reasoning_entries`, `reasoning_links`.

### Answer Guard 2.0 — `lib/core4/guard2.ts`
Runs on the whole draft only when something is withheld; on streamed turns
its questions-and-openers part is done by the stream gate. Two-sided. **Overreach** (only when something is withheld): the private
verify value, gives-then-asks ("the rule is X… now try it yourself"), a
worked solution inside a HINT/VERIFY/QUESTION. **Underhelp**: questions over
budget (stripped), a reply that is only questions (regenerate; OVERRIDE_WITH_
DIRECT_ANSWER when the machine should do the work), deflection ("it depends
on your goals") to a direct request. **Novelty** (above). **Voice**:
sycophantic opener, closing offers, comprehension checks, claims of tools
Socria does not have ("I searched…"), inferences about the person stated as
fact. **Verdict**: a CORRECT/VERIFY with no verdict is sent back. Hidden
values are matched as values (a hidden 4.2 is not in 14.2). A **coherence
floor** stops any edit that would leave the reply dangling, or remove more
than a quarter of its substance; the draft is regenerated instead. When
nothing is withheld, a reply that cannot be fixed ships as it was, minus
over-budget questions — never canned text. Actions: ALLOW, MODIFY_FOR_MORE_AGENCY,
MODIFY_FOR_MORE_HELP, OVERRIDE_WITH_DIRECT_ANSWER, REQUEST_CLARIFICATION. The
cheap model is consulted on withheld turns and uncertain novelty; its output
is used to delete named sentences or to trigger a frontier regeneration —
never shipped as prose.

### Verify Mode — `lib/core4/verify.ts`
Exact arithmetic via the Logos evaluator, before the move is chosen — only
on an expression **the person posed** (after "compute", "what is", "= ?"),
never one from Socria's replies, never dates, ranges, versions, doses or
money, comparing their **final stated value** (council D13; a pilot run had
marked a correct proof wrong against a number from Socria's own reply).
CALCULATE is only chosen when the value was actually computed and is given
to the model; otherwise the move is ANSWER, which may not claim to have
calculated. A
separate checker call for everything else, only when something is withheld.
The reply model gets VERDICT / WHERE / KIND OF ERROR, never the expected
answer; the guard gets the expected answer (and its spellings) as hidden
values to keep out of the reply. Below 0.85 confidence the checker's "incorrect"
is not claimed. When nothing is withheld, the correct answer is given to the
reply model so it can correct plainly.

### Outcomes, capability, telemetry — `merge.ts explicitOutcome`, `capability.ts`, `trace.ts`
Labels: HELPED, PARTIALLY_HELPED, WAS_TOO_DIRECT, WAS_TOO_INDIRECT,
WAS_REDUNDANT, CONFUSED_USER, UNLOCKED_PROGRESS, FRUSTRATED_USER, UNKNOWN —
from the person's words (explicit) or the reader (inferred, capped at 0.7).
Used in the next turn's selection (a move that just landed badly is not
repeated; friction outcomes feed diminishing returns). **No online learning**:
nothing updates policy automatically. Capability is **evidence events**
(demonstrated unassisted / assisted, self-corrected, misunderstanding),
recorded only on a real verdict (computed, or a checker at ≥0.85) — never
the reader's opinion, and never "needed the answer", which recorded a
preference as a deficit — per concept, counted — with independent capability
credited only in a *later conversation* than the help. The per-turn trace
is content-free (enums, counts, reason codes, timings, model ids, prompt
version).

### Measured, not read — `lib/core4/counterfactual.ts`, `lib/core4/calibration.ts`

**The one structural answer to "is this just prompting?"**

§5″ refuted sixteen of nineteen claimed remainders, and the sixteen had one
property in common: every one of them hands a WEAKER model text the reply
model already holds. The state reader, the problem model, the detectors, the
allocator — all re-readings. You cannot beat a model at reading by reading
harder. The three survivors were all cases where Socria held information the
transcript does not contain.

So these two stages do not read. They run the model on inputs the conversation
never contained, which is the only instrument API-only access provides:

**Counterfactual dependency testing.** `problem.ts` builds "X rests on Y" from
a cheap model's guess about the transcript — an assertion, prompt-reproducible,
and per E16 not even stable (0 relations in run 8, 3 in run 9, same
conversation). This ablates a premise instead: remove it, re-derive, see if the
conclusion moved.

> "Remove *the churn number holds through Q4* — which is an assumption, not a
> finding — and *raise in March* no longer follows; instead the raise moves to
> June."

No prompt produces that at any length, because producing it means executing the
model against a premise set nobody wrote. It works on turn one, and it makes
the dependency edges a measurement rather than a claim.

**Calibration from sampled disagreement.** A model asked how sure it is answers
from the same forward pass that produced the answer. How much that answer MOVES
when asked again is information no single pass contains. Five independent
attempts, clustered, and the spread reported.

**The asymmetry is the design, not a detail.** This runs on the cheap model. A
weak model agreeing with itself five times means almost nothing — it can be
confidently, repeatably wrong, and small models excel at that. A weak model
*disagreeing* with itself is direct evidence the question is not settled by the
material available. So agreement is **never** rendered, at all: a stage that
can only lower a claim's standing cannot be used to inflate one. That is what
makes it safe to run on a cheap model.

**What is discarded rather than reported**, in both: any ablation below
`CF_FLOOR` (0.55); any `"unclear"` verdict, which is a premise not tested
rather than a premise cleared; any "does not follow" with nothing to say about
what follows instead; robustness against an already-checked premise, which is
true of every sound argument; fewer than 3 returning samples, because two
answers that differ is a coin on its edge.

**Cost, and where it lands.** Gated to `coverage === 'complete'` — high stakes
AND demonstrated expertise, substantive move, nothing withheld — plus at least
two live problem items. Up to 9 cheap parallel calls, 2.5 s ceiling each, both
failing to `null`. On the ordinary turn neither fires and D17's per-turn cost
ceiling holds; on these turns it is deliberately exceeded, because they are the
turns where someone is about to act on their own reasoning. `E17`/`E18`
pre-register what would kill each.

### The model seam — `lib/core4/model.ts`
Every Core 4 model call (state, reply, retry, guard, verify, extract) goes
through `modelClient()`. Production is OpenAI, configured as before. The
eval harness installs its own client, so what is evaluated is the shipped
pipeline; installed clients and the trace sink are ignored when
NODE_ENV=production.

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

### Data inventory

Every column of every Core 4 table (council D15). `test/core4-data-inventory`
fails if a column in `supabase/schema.sql` is missing here.

| Store | Columns | Holds text from the person? | Purpose | Retention | Read by | Their control |
|---|---|---|---|---|---|---|
| `core4_state` | `user_id`, `conversation_id`, `state`, `updated_at` | yes, in `state` (goal, focus, positions, quotes of what they raised; evidence for inferred fields) — emptied when off the record | carry where a conversation stands to its next turn | until the conversation or account is deleted | the Core 4 turn for that conversation only | view/set/reset fields and forget the state on the Memory page; delete with the conversation; forget-all; export |
| `reasoning_entries` | `user_id`, `id`, `kind`, `text`, `owner`, `stance`, `basis`, `quote`, `reason`, `status`, `confidence`, `conversation_id`, `project_id`, `private`, `turn`, `revisions`, `created_at`, `updated_at` | yes (`text`, `quote`, `reason`; identifiers scrubbed) — not written when off the record | the already-considered record; attribution; RETRIEVE | until deleted | the same conversation, the same Project, or recent relevant entries, in Core 4 prompts; the Memory page | edit, not mine, retract, restore, delete; delete with the conversation; forget-all; export |
| `reasoning_links` | `user_id`, `id`, `from_id`, `to_id`, `rel`, `owner`, `reason`, `created_at` | `reason` only | relations between entries (none are drawn automatically) | until an endpoint is deleted | the Memory page (Logos export) | deleted with either entry; forget-all; export |
| `core4_turns` | `user_id`, `conversation_id`, `turn`, `created_at`, `trace`, `outcome_label`, `outcome_confidence`, `outcome_source` | **no** — enums, counts, codes, timings only | measure which moves help, and cost/latency | 180 days, purged at write time | aggregate evaluation only | delete with the conversation; forget-all; export |
| `capability_evidence` | `user_id`, `id`, `concept`, `event`, `assistance`, `conversation_id`, `turn`, `confidence`, `at` | `concept` is a few key words from what they worked on | count what they have shown they can do, only on a real verdict | until deleted | the Memory page; evaluation | delete per concept; delete with the conversation; forget-all; export |

## 5. Latency and cost

Added to a Core 4 turn, before the first token: the state read (cheap model,
≤2 s, usually well under 1 s of wall time relative to recall, which runs
concurrently), the state/ledger load (parallel), and — only on withheld
attempts — the checker (≤1.5 s). Buffered (withheld) moves add the guard (deterministic:
negligible; cheap model: ≤1.5 s) and,
rarely, one regeneration. Streamed moves add nothing but the sentence gate.
Timings for every stage are in the trace (`ms`).

## 5′. What the architecture audit found (2026-09-24)

Nine subsystems were mapped against the code, then cross-checked for
duplicate concepts and dead structure. The documentation was not trusted;
every claim was verified against a file and a line. What it found, kept here
because a map of the real thing is worth more than a description of the
intended one:

**Fixed as a result.**
- A withheld value inside a fenced code block was detected and shipped: the
  delete shields fences, the leak detector reads through them, and nothing
  re-checked the result. `without()` now verifies its own output.
- The private checker ran only under a withhold — 6 of the 38 turns in run 6
  that offered checkable work. The other 32 shipped the cheap reader's guess
  as fact, visibly wrong twice.
- Off the record missed `relations`, so a conversation nobody was supposed to
  keep still wrote the person's sentences into `core4_state`.
- An instruction pointed at "Already on the table", a heading that exists
  only in the state reader's input, not in the reply prompt.
- Ledger links were written every turn and never read back on the reply path;
  capability evidence likewise.

**Known and not yet fixed** (see §6).
- The Answer Guard runs only on withheld turns, so the novelty gate, the
  redundancy check and the tool-claim strip never see the ordinary majority.
- The novelty matcher is lexical: ~10% recall on paraphrase at the deletion
  threshold. Already Considered is therefore closer to decorative than its
  name suggests, and this is the single biggest weakness in the system.
- A withhold with a blank quote fails OPEN in production and silently: the
  withhold becomes null, which also turns the guard off for that turn.
- `supportLevel` and `assumptions` are computed every turn and read by
  nothing; 11 of 36 state fields reach a decision.
- In a default deployment `OPENAI_MODEL_CORE_4` is unset and the configured
  id is rejected, so Core 4 answers on the fallback model. It is not in
  `.env.example`.

## 5″. What the adversarial prompt-reproducibility audit found (2026-09-24)

Twenty-six agents, read-only, over every subsystem. The question put to each:
*could a single sufficiently good system prompt, given the same frontier model
and the same raw transcript including earlier sessions, produce the same
OBSERVABLE behaviour?* Default answer YES; a claimed remainder survives only
if it is (a) a determinism a sampled model cannot give, (b) information
genuinely not in the transcript, or (c) a guarantee about what is ABSENT.
"More reliable", "more consistent", "cheaper" were ruled out in advance as
engineering conveniences rather than capabilities. Every claimed remainder was
then handed to a separate adversary told to refute it and to default to
refuted.

**19 remainders claimed. 16 refuted. 3 survived, all narrower than claimed.**

Refuted — a prompt does these, and the code is kept (where it is kept) for
token cost and enforceability, not because it adds a capability: the state
reader, `mergeState`, explicit signals, allocation mode selection, move
selection, the forced/envelope split, **`coverage`**, the question budget,
`consideredView`, attribution, **the problem model**, **missing-contribution
detection**, the guard's cheap-model pass, exact arithmetic, the private
checker, and the cross-session recall block.

Survived, in their narrowed form:
1. **Out-of-band correction.** A Memory-page PATCH/DELETE is an event no
   transcript records, so the next turn's prompt can differ on the strength of
   something a transcript-only prompt cannot see. Narrowest true form: one
   line moves between two lists, or disappears. It carries **no** guarantee
   about the reply.
2. **Explicitly corrected state fields.** `correctState` stamps
   `source: 'explicit'`, and `mergeState`'s stickiness then outranks every
   later model inference permanently. That is a value deliberately placed
   outside anything the reply model can derive.
3. **Mind Graph recall past the context window.** When the archive exceeds
   what the product puts in context, the block carries a distilled
   restatement of sessions whose text is absent. Conditional on the archive
   overflowing — which across the whole 160-scenario corpus is **never**.

**Read that honestly.** All three survivors are about *memory the person
edits or that outgrew the window*. Not one of them is about the reasoning
layers — the problem model, the detectors, the allocator, the intervention
engine and `coverage` are all, on this analysis, things a strong prompt does
too. The measured runs agree: on short conversations Core 4 and a strong
prompt trade wins.

**The defects it found, verified in code and fixed.**
- `guard2.without()` re-checked the kept draft against the SENTENCES it had
  just deleted rather than the withheld VALUES, so a withhold guarantee rested
  on an unstated invariant about sentence re-segmentation. Could not be made
  to leak — the fenced case the function exists for is caught either way — but
  fixed.
- `maxQuestions` is a hard cap on buffered turns and on the TAIL of streamed
  ones only: a question with exposition after it is released by
  `flushHeldInline`, because council D4 forbids cutting from the middle of a
  reply. Now documented on the field and pinned by tests.
- **`deleteCapability` did not delete the conclusion.** The calibrated
  expertise (`source: 'observed'`) was persisted into `core4_state`, where
  stickiness keeps it ahead of later inference — so removing the evidence
  removed the Memory-page row and left the judgement running in every
  conversation that had recorded it. The calibration is now computed per turn
  and never written back; it recomputes from `capability_evidence`, so it
  lasts exactly as long as the evidence the person controls.

## 6. What is not built, and why

- **Tools** (search, code execution, visualisation). None in this path; the
  prompt says so. The RESEARCH/MODEL/VISUALIZE move types were removed
  (council D7); `lib/core4/tools-contract.ts` holds the privacy contract a
  future tool must meet.
- **Embeddings** for the novelty matcher: lexical + cheap-model judge first;
  embeddings only if the evals show paraphrase misses that matter.
- **Online learning from outcomes.** Deliberately not: outcomes are recorded
  and used within the conversation; policy changes go through the council
  and the evals.
- **Logos on the ledger.** The substrate is Logos-shaped (`toLogosGraph`);
  Logos does not read it yet.
