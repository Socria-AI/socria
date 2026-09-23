# Core 4: the architecture as built

A map of what Core 4 actually does today, measured against the Core 4 thesis
(the product and cognitive-architecture specification). Written from a full
read of the code on `dev` at `4316b8d`: eight subsystem reviews, then a
critic who re-read the code to correct them. Line numbers are from that
commit. The next batch of work is in `CORE-4-NEXT-BATCH.md`, and the
Foundation Model Limit Ledger it starts is `evals/ledger.json`.

The short version: Core 4 has more real architecture than a system prompt,
and less than it appears to. The router, question pressure, the structural
Answer Guard and the Mind Graph core are genuine and worth keeping. But the
Cognitive State is rebuilt from nothing every turn and never kept, there is
no cognitive-work classification and no tool stage, five memories reach the
model at once, and nothing measures whether any of it beats the same model
with a good prompt.

---

## 1. A Core 4 turn, as it runs today

One stateless `POST /api/chat` with `model: 'core-4'`. The client holds the
conversation and sends all of it, plus several older memory blobs.

| # | Step | Where | Notes |
|---|---|---|---|
| 1 | Auth, rate limit, validation | `app/api/chat/route.ts:106-145` | Core 4 needs an account. No usage metering: Core 4 is bounded only by the per-request rate limit. |
| 2 | Easter egg short-circuit | `route.ts:157-175` | Returns before state, graph or guard. |
| 3 | Older context assembled | `route.ts:180-217` | The Thinking Journey is still built for Core 4. `body.memory` (thread memory) is passed on **unsanitized**. |
| 4 | Attachments rendered | `route.ts:264-272`, `lib/chat-attachments.ts` | Files as labelled text, images as a one-time description. |
| 5 | **Cognitive State read** | `route.ts:303-312`, `lib/cognition/engine.ts:109-140` | One gpt-4o-mini JSON call over the last 8,000 chars. `prior` is always `null`, so the state is rebuilt from scratch every turn. No timeout. |
| 6 | **Intervention routed** | `lib/cognition/router.ts:292-406` | Deterministic first-match rule table, plus question pressure measured from the transcript. |
| 7 | **Mind Graph recall** | `route.ts:338-372`, `lib/mind/pipeline.ts:92-190` | Loads the whole graph, lexical spreading activation, 2 s timeout. Runs *after* the state so `currentFocus` can seed it, but that seed rarely matches (see §4). |
| 8 | System prompt assembled | `lib/socria-prompt.ts:2114-2218` | Core 4 prompt, then thread memory, imported profile, journey, Project, graph, state, move. About 2k tokens bare, up to about 9k. |
| 9 | Frontier call | `route.ts:500-540` | `OPENAI_MODEL_CORE_4` or `gpt-5.6-sol`, temperature 0.7, flat `max_tokens: 500`, no tools. A broad "model error" regex falls back to gpt-4o. |
| 10 | **Answer Guard** (9 of 12 moves) | `route.ts:556-608`, `lib/cognition/guard.ts` | Guarded moves are buffered, not streamed: a structural check, then a gpt-4o-mini check, then possibly one regenerate. **The regenerate output is never re-checked.** EXPLAIN, DIRECT and RETRIEVE stream unchecked. |
| 11 | Mind Graph writeback | `route.ts:625-643`, `pipeline.ts:204-298` | `remember()` fired after the stream closes, not awaited, no `waitUntil`. gpt-4o-mini extraction, gate, apply, persist. |
| 12 | Client background passes | `app/chat/page.tsx:1586-1587`, `1082-1100` | For Core 4 too: the thread-memory extractor every turn, the journey extractor every 4th turn (which also writes flat person-memory entries). The comment above it says this doesn't happen for Core 4; it does. |

Critical path before the first word: plan lookup (Supabase, sometimes Clerk)
→ state (mini call) → graph load → activation → frontier generation, plus
guard and a possible retry on guarded moves. All serial. On guarded moves the
person sees nothing until the whole draft has been generated and checked.

The Cognitive State is not stored, returned or passed anywhere after the
turn. What `remember()` learned (which beliefs were superseded) is also
thrown away before the next turn.

## 2. Against the target loop

| Target stage | Today | Status |
|---|---|---|
| Relevant Mind Graph activation | Step 7, after the state; focus seeding barely works; graph never informs state, router or guard | Partial, wrong order |
| Cognitive State update | Step 5, rebuilt each turn, never persisted | Partial |
| Cognitive-work classification | None; folded into a conversation-level `taskKind` | Missing |
| Intervention selection | Step 6, deterministic, testable | Real, with gaps |
| Tool / representation selection | None. No tool calling anywhere in Core 4 | Missing |
| Frontier intelligence | Step 9 | Real, OpenAI-coupled |
| Candidate response + Answer Guard | Step 10, guarded moves only | Partial |
| Cognitive State update after the turn | None | Missing |
| Mind Graph writeback | Step 11, fire-and-forget | Real, fragile |

## 3. What exists, what is partial, what is missing

### Cognitive State (`lib/cognition/state.ts`, `engine.ts`)
- **Exists:** 19 fields including task kind, latest move type, attempt, resolved, new relation, blocking unknown, positions, recent changes, current focus.
- **Partial:** `prior` is supported by `readState` but never passed. `supportLevel` is extracted and read by nothing.
- **Missing:** expertise, learning goal (is building this capability the point?), frustration, stakes, confidence, calibration, reliance and offloading risk, attempted approaches over time. There is also no per-request classification of the cognitive work.

### Intervention router (`lib/cognition/router.ts`)
- **Exists and good:** deterministic rules; ASK must be earned (`askWorth` against `1 + 1.5 × streak`); the streak is measured from the transcript the person actually saw; "use what they gave" after an answer. Well tested with scripted states.
- **Reachable:** LISTEN, OBSERVE, CONNECT, REFINE, SYNTHESIZE, CHALLENGE, ASK, HINT, TEACH, EXPLAIN, DIRECT, RETRIEVE.
- **Declared but never selected:** RESEARCH, CALCULATE, CLARIFY.
- **Missing from the thesis set:** COMPARE, VISUALIZE, SIMULATE, CALIBRATE, PREMORTEM, CONTINUE, CLOSE.
- **Problems:**
  - Question pressure constrains only the ASK *label*. HINT and CHALLENGE can end in questions at any streak, so the anti-interrogation mechanism can be bypassed by relabelling.
  - Rules 4 and 5 withhold the correction from anyone whose attempt is wrong, whatever their goal. That is Socratic by default for experts and productivity work.
  - `decide` plus high urgency routes to an unguarded DIRECT, which can hand over a consequential judgment.
  - A conversation-scoped `attempt` can re-trigger the same withholding CHALLENGE turn after turn, because nothing records it was already addressed.
  - Stated preferences (Project instructions, Preference nodes) never reach the router or the guard, so the guard can enforce a move *against* what the person asked for.

### Answer Guard (`lib/cognition/guard.ts`)
- **Exists and good:** structural layer (closing-question trim, one question for ASK, sentence caps, worked-solution and gives-then-asks detection), then a semantic leak check on gpt-4o-mini.
- **Partial:** runs only on the 9 guarded moves; checks withholding and structure, not sycophancy, epistemic overstatement, inference-as-fact, over-explaining or unnecessary questions.
- **Bugs:**
  - The regenerate retry ships unchecked.
  - A closing-question "revise" returns before the leak checks run.
  - `givesThenAsks` rejects TEACH for doing what TEACH is for: stating a definition, then inviting its use.

  The last two combine badly: an overblock swaps a good draft for an *unguarded* one.

### Mind Graph (`lib/mind/*`)
- **Exists and good:**
  - typed nodes and edges, statuses, provenance kinds (including `researched`, `calculated` and a `tool` surface, reserved but unused);
  - a structural write gate: register rules, corroboration across two conversations, substance, tombstones;
  - supersession that never overwrites, lexical entity resolution, Project affinity as a weighting, forgetting that holds;
  - a `remember({candidates})` seam for writes that skip the extractor.
- **Partial:**
  - Ontology gaps: no Constraint, Fact, Idea, Milestone or Object. The relation vocabulary lacks `changed_into`, `evidence_for` and `learned_from` (supersession uses `superseded_by`).
  - Metadata gaps: stored activation is never read; edge confidence is write-only; every new edge starts at strength 0.5.
  - Activation effectively reaches two hops.
- **Missing:**
  - The **why** of a belief change: only "changed from: <old content>" is stored.
  - Any **history retrieval**. "Why did we stop believing A?" can't be answered.
  - **Provenance rendered to the model.** It can't tell stated from inferred from researched.
  - Any path for tool results into the graph.
  - Speaker attribution: Socria's own claims can be stored as the person's.
- **Bugs:**
  - Edges and `replaces` / `conflictsWith` bypass the register gate.
  - `touchNodes` upserts partial rows into NOT NULL columns and swallows the error, so `last_accessed` never updates and recency scoring decays on creation time instead.
  - `remember()` can be lost when the function instance freezes.
  - Once the graph passes MAX_NODES it silently stops learning.
  - "Forget what Socria worked out" (`/api/account/memory`) never touches the graph.

### Tools and representation
- **Exists for Core 4:** document reading (PDF, Office, zip), image reading. Both run at attach time, started by the browser, not chosen by Core.
- **Exists elsewhere, unreachable from Core 4:** Logos's web search (Serper/Tavily), SSRF-hardened fetch, OAuth connectors, safe expression evaluator, visualization engine.
- **Missing:** any tool calling in the Core 4 route, orchestration, citations, computation over data, math rendering in Core chat, any bridge to Logos.
- **Conflict:** the Core 4 prompt tells the model to "research facts … calculate". It can't, and nothing stops it from saying it did.

### Evaluation
- **Exists:** about 75 deterministic suites, including real-route e2e tests that bundle the actual chat handler with fake Supabase, Clerk and OpenAI.
- **Missing:**
  - any live Core 4 eval;
  - any comparison against the same model with the strongest Socria prompt;
  - any model-swap arm;
  - any Limit Ledger (known model failures live only in code comments);
  - any measure of state-reader accuracy, guard precision and recall, or intervention fit.
- **Bug:** the fake OpenAI's catch-all returns `{"verdict":"approve"}` for any unscripted non-stream call. In `projects-e2e` and `attachments-e2e` the guard's regenerate path therefore ships that literal text as the reply, and the assertions don't notice.

## 4. Duplicated and conflicting systems

1. **Five memories in one prompt.** Thread memory (client-held, lags 1–2 turns), imported profile (static, up to about 2k tokens), Thinking Journey (lags up to 4 turns, rendered whole), Mind Graph (lags one turn) and Cognitive State (this turn). One goal or decision can appear up to five times at different freshness. Only prose ("the live conversation wins") reconciles them.
2. **"Did they change their mind?" is decided four ways.** State `recentChanges`, the extractor's `replaces`, the thread-memory extractor's "REPLACE the old entry" (which *deletes* history, against the thesis) and the journey rewrite. They never share a verdict, and `remember()`'s report is discarded.
3. **Two authorities choose the move.** The router chooses, and the base prompt's Human-First, Learning and Direct Answers sections still tell the model to choose. The prompt never says which wins; the move block wins only by coming last. The router is currently more Socratic than the prompt.
4. **Concealment versus epistemics.** Older memory blocks say "never reveal a memory system exists"; the Core 4 prompt says "distinguish what is remembered". They're in the same prompt.
5. **Memory surfaces disagree.** `/memory` shows the Mind Graph and says it's the whole truth; the chat rail's "What Socria remembers" opens the journey. Forgetting in one doesn't forget in the other.
6. **Logos's ThinkingMap and the Mind Graph** are unrelated object models with no bridge.
7. **Core 3.1's living-understanding pass and conversation controller** do, for Core 3.1, much of what Core 4's state and router do, with different code. Their voice detectors (`BANNED_PATTERNS`) would serve Core 4's guard and don't.
8. **State-before-graph ordering is paid for, not earned.** It adds a full serial mini-model call before the first database read, and the focus seed it exists for rarely matches, because it compares an un-normalized sentence against normalized labels.

## 5. Behaviour controlled only by prompt text

These are the behaviours nothing in code computes, checks or enforces:

- epistemic labelling (known, inferred, remembered, calculated, researched);
- anti-sycophancy, no praise, no therapy tone, no heading spam, no disclaimers;
- length and over-answering on EXPLAIN, DIRECT and RETRIEVE;
- no reflexive closing question on unguarded moves;
- tool use;
- more directness under frustration;
- the scaffolding ladder and fading;
- adapting to expertise;
- reconciling stale memory against the live conversation;
- not treating jokes or hypotheticals as belief when reasoning in-turn;
- representation choice (not even mentioned in the prompt).

In the graph's own writes: register classification and change detection are the extractor model's judgement alone.

The Core 4 base prompt itself is 97 lines, about 2k tokens. By the prompt review's estimate, roughly 40% is the only control over what it describes, about 35% repeats decisions the router now makes (which is where the conflicts come from), and about 25% is aspiration with little behavioural effect.

## 6. Where the model's own habits leak through

Unmitigated or prompt-only:

- **Confident fabrication of research or arithmetic.** No tools, and no check that a factual answer is grounded.
- **Verbosity on unguarded moves.** The flat 500-token cap truncates mid-sentence instead of disciplining.
- **Sycophancy and praise.**
- **Headings and lists.**
- **Hedging, and inference stated as fact.**
- **The cheap guard model's voice replacing the frontier model's.** Its "revise" text ships verbatim.
- **Prompt injection.** Instructions inside attached documents or image text can steer the main call; only the graph extractor fences material as data.

Well mitigated: reflexive questions on *guarded* moves (a deterministic trim), and trait-minting from one afternoon (the corroboration ledger).

## 7. What to keep as it is

- the deterministic router and transcript-measured question pressure;
- the structural guard layer;
- fail-soft memory with timeouts, and renderers that pass plain strings;
- the Mind Graph core: gate, pending corroboration, tombstones, supersession without overwrite, Project affinity;
- the document reader and its zip-bomb and secrets protections;
- the real-route in-process e2e harness (once its fake is fixed);
- the Memory page and Projects.

These are the parts of Core 4 that already behave like architecture rather than instructions.
