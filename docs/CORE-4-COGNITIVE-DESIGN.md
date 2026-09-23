# Core 4: cognitive design decisions

The record of Cognitive Design Council #1. Twelve independent role reviews
(Cognitive Architect, Expert User / Peer Designer, Human-Agency Advocate,
Cognitive Offloading Critic, Friction Critic, Learning Science Reviewer,
Adversarial Product Critic, Evaluation Scientist, Memory / Reasoning
Representation Designer, Privacy Critic, Domain Stress Tester, Red Team)
each ruled APPROVE / MODIFY / REJECT on seventeen decisions (D1–D17) about a
straw architecture, reading the code where a claim turned on a fact. A
non-voting synthesis judge then resolved each decision on Socria's
objective — increase human capability while preserving meaningful agency —
the evidence, user agency, capability benefit, UX cost, engineering
complexity, testability and reversibility. It did not majority-vote: where
a minority was right, the minority won, and the decision says why.

Each decision below is recorded as the judge wrote it (issue, competing
proposals, disagreement, final decision, evidence, test, reversal
conditions), followed by its **implementation status** in the code today.
Status is stated plainly: most decisions are partially implemented, and
the parts not built are listed. `CORE-4-ARCHITECTURE.md` describes only
what exists.

## The global invariant

> Under uncertainty, no Core 4 component may give less help than the
> baseline arm would. Only an explicit, visible, scoped contract may reduce
> help.

Tested in part by `core4-policy` (144 inferred-only states, zero withholds;
explicit-only practice goals) and `core4-guard-ledger` (no canned text on
non-withheld turns; coherence floor).

## Decisions also forced by evidence, before the council finished

The pilot run's transcripts (see `CORE-4-EVALS.md`) produced one reversal
that the council independently reached in D9: **word overlap may not delete
a statement.** Two harmful deletions in about twenty gated turns — the
correct formula in `direct-answer-006`, the key computation in `expert-008`
— crossed the threshold pre-registered for E5, and the reversal was applied
before the judge's ruling arrived.

## A decision reversed by evidence: D1's minority position is now the default

Run 1 (24 scenarios, blind judges; `CORE-4-EVALS.md`) had Core 4 losing to
the strong-prompt baseline 5–13–6 and to B+ 5–15–4, and Core 4's own traces
showed why: moves imposed on an **inferred** reading of the person — a
guessed "reflection", a reader-flagged tension, a creative idea routed to
CORRECT — narrowed what a stronger model would have done. That is exactly
the Cognitive Architect's (Agent 1) minority argument in D1, and it
violates the council's own global invariant. So as of `e29bb4c`, a move is
**imposed only on explicit or verified evidence**; otherwise the model
receives an envelope of constraints and chooses the move. The judge's D1
reversal condition ("reinstate forced selection if the envelope arm loses
to the forced arm at p<0.05 on ≥100 expert/decision turns") still stands.

## Implementation status at a glance

| Decision | Status |
|---|---|
| D1 — Turn loop order, the authority of select() over the frontier generator, and prompt/allocator consistency | PARTIAL |
| D2 — Deterministic explicit signals: precision, precedence, scope and missing signal types | PARTIAL |
| D3 — CognitiveState fields, provenance, confidence, hysteresis, persistence, rendering | PARTIAL |
| D4 — Question budget: what counts as a question, caps, and exemptions | PARTIAL |
| D5 — Diminishing-returns detector and strategy switching | NOT YET |
| D6 — When withholding is legitimate, its scope, bounds, precedence and overrides | PARTIAL |
| D7 — Intervention set and selection granularity | PARTIAL |
| D8 — Answer Guard 2.0: scope of deterministic edits, model layer, streaming, fallbacks, new checks | PARTIAL |
| D9 — Already-considered novelty gate: matcher, scope, enforcement | PARTIAL |
| D10 — Reasoning ledger substrate, attribution, correction, Mind Graph split, Logos | PARTIAL |
| D11 — Outcome labels and their use in selection | PARTIAL |
| D12 — Capability evidence: what counts, keys, independence, use | PARTIAL |
| D13 — Verify Mode: exact path safety, checker scope, verdict confidence, leakage | PARTIAL |
| D14 — Memory consolidation, cross-conversation preferences/contracts, sensitive-context protection | PARTIAL |
| D15 — Privacy of human modelling: persistence policy, scope, retention, consent, purpose limitation | PARTIAL |
| D16 — Evaluation harness validity | PARTIAL |
| D17 — Latency, cost and length budgets | PARTIAL |

---

## D1. Turn loop order, the authority of select() over the frontier generator, and prompt/allocator consistency

**Implementation status: PARTIAL.** Done: prompt purge (v3, now v5) with prompt-lint test; reader timeout 2 s with prior-state carry-forward; safety gate; buffering only on withhold; the envelope/forced split (the council's minority position, now the default after run 1, see the D1 reversal below): a move is imposed only on explicit or verified evidence; gap check after long absences. Not yet: promptManifest; decisionDelta logging; C4_EVAL ablation switches; speculative parallel checker; the fast path. Deviation: on reader failure an EXPLICIT withhold is kept (the council text says withhold forced null); an explicit request does not depend on the reader.

### Competing proposals

(a) Straw: signals→prefetch→readState→merge→allocate→budget→select(forced move)→verify→prompt→generate(buffer if guardRequired)→guard→writes. (b) Cognitive Architect and Adversarial Critic: in the thinking modes the engine emits an ENVELOPE (constraints) and the generator picks the move; forced moves only with explicit or demonstrated evidence. (c) Memory Designer and Red Team: apply corrections and grounding BEFORE the digest and render; add a gap check and a prompt manifest. (d) Friction Critic: a fast path when explicit signals already fix the allocation; buffer only when withholding. (e) Agency Advocate and Friction Critic: purge the default-withholding lines from CORE_4_PROMPT. (f) Offloading Critic and Learning Science: verify runs in parallel with readState on attempt-shaped turns; add an item tracker. (g) Evaluation Scientist: ablation switches plus counterfactual decisionDelta logging.

### Disagreement

The straw and most reviewers assume a deterministic select() picks the move on every turn. The Cognitive Architect and Adversarial Critic, both in the minority, argue that a cheap reader plus rules is less intelligent than the frontier generator it steers. They want move selection in SHARED_REASONING/HUMAN_LEADS/AI_ASSISTS reduced to constraints. The Expert User partly agrees (constraints, not scripts). The Friction, Red Team and Adversarial critics independently confirmed a serial critical path of up to about 30 s (5 s state, 4 s checker, buffered generation, 5 s guard, retry).

### Final decision

Order of stages:
1 signals: deterministic, reads only speech(latest) (quotes, code, blockquotes and attachments removed) plus Project instructions plus stored agency_contracts plus body.override.
2 prefetch, in parallel: core4_state, scoped ledger query (D10), Mind Graph, contracts, and last turn's promptManifest {consideredIds[], graphNodeIds[], stateFields[]}.
3 gapCheck(now − state.updatedAt). Over 6 h: reset stuck, urgency, momentary directness, lastOutcome and the diminishing history. Over 14 d: also halve inferred confidences and re-announce standing contracts once.
4 applyCorrections: targeted, before the digest (D10).
5 buildDigest: ≤12 lines with short ids c1..c12, owner and stance marked.
6 readState. Hard timeout 2 s. On failure: prior state plus signals, withhold forced null, maxQuestions ≤1, and ANSWER/EXPLAIN when latest is a question.
7 ground consideredNow (D10). Only grounded items are rendered as 'they raised'.
8 mergeState.
9 itemTracker: practiceItems ≤5, each {id: hash of normalized problem text, attempts, ladderLevel 0-5, maxAssistance, errorClass, status}.
10 safetyGate: stakes=high with urgency, or the harm lexicon (medical, poisoning, self-harm, legal deadline, money being lost now), forces AI_EXECUTES and logs contract_overridden:safety.
11 allocate, then 12 budget, then 13 select.

select() returns {primary, envelope:{maxQuestions, withhold, avoid[], form, lengthBudget}, forced:boolean}. forced=true only when (a) the move rests on an explicit/said or demonstrated/shown field, or (b) an enforced rule fires: withhold, budget=0 after an explicit stop, CORRECT on a verified wrong attempt, quiz or role-play contract, safety. Otherwise, in SHARED_REASONING, HUMAN_LEADS and AI_ASSISTS, the move block states only the constraints, and the realized move is classified afterwards for telemetry.

14 verify: only when withhold≠null AND an attempt is present. Run it speculatively in parallel with readState when a deterministic attempt detector fires.
15 generate. FAST PATH: when the allocation is fully determined by a STRONG loosening signal (directness=answer, delegate, stop-questions plus a plain request, urgency) and there is no withhold or tightening contract, readState runs concurrently and feeds only the writes. Buffer ONLY when withhold≠null. Everything else streams through the sentence gate (D8).
16 guard. 17 writes via waitUntil, with idem_key, plus the new promptManifest.

PROMPT: delete from CORE_4_PROMPT (lib/socria-prompt.ts ~1339, 1361, 1387, 1399, 1405) the lines 'let them generate before you reveal', 'first elicit enough of their thinking', 'Do not confuse … a request for directness with surrendering meaningful judgment', 'Advance one meaningful step at a time', 'Conversation should develop through turns, not exhaustive single responses' and 'When uncertain whether to say more, stop'. Replace them with: 'The move block decides what stays with them. If it has no WITHHOLD line, withhold nothing and complete the move in this reply.'

GLOBAL INVARIANT (in docs/CORE-4-COGNITIVE-DESIGN.md and tested): under uncertainty no Core 4 component may give less help than the baseline arm would. Only an explicit, visible, scoped contract may reduce help.

EVAL CONFIG: C4_EVAL={ablate:[signals|novelty|guardModel|diminishing|outcomeRules|verify|stateRender|ledger|fineSelect], oracle:{state?,allocation?}}, ignored when NODE_ENV=production. Each turn also logs decisionDelta: re-run the pure select() with each input neutralised and record whether the type, maxQuestions or withhold would change.

The substrate types move to lib/reasoning/substrate.ts, imported by core4 and Logos.

### Evidence

Objective and agency: a forced move built on a gpt-4o-mini guess can only make the frontier model worse on the turns where the reader misreads. The envelope keeps what code does well (counting, persistence, attribution, enforcing explicit contracts) and hands situational judgment to the stronger model, so the minority wins on capability benefit and reversibility. The prompt purge is required because the prompt lines above, which I confirmed exist, tell the generator to withhold by default. That would make allocate()'s positive-evidence rule cosmetic. Latency: buffering every PERSPECTIVE_MOVE (intervene.ts:48, including CONTRIBUTE, the default for experts) plus serial timeouts falls hardest on the target users. Ordering bugs confirmed by the Memory Designer (turn.ts renders raw consideredNow; the digest is built before disputeTurn) are fixed by moving grounding and correction earlier, at no added latency. Testability: decisionDelta costs no model calls and gives each component's decision-change rate.

### Test

(1) Unit: readState throws on 'What's the capital of Mongolia and why did it move?' ⇒ withhold null, no QUESTION/HINT, ANSWER. (2) Prompt-lint: none of the six deleted strings appears in CORE_4_PROMPT, and with withhold=null the assembled prompt contains no withhold or elicit-first instruction. (3) Correction turn: the reader input captured by the fake client does not list the disputed text. (4) Reader-stub echo item is not rendered as 'they raised just now'. (5) Hints-only Project plus 'my 2-year-old swallowed a button battery' ⇒ direct instructions, trace contract_overridden:safety. (6) +21 d resumed conversation ⇒ stuck and lastOutcome reset. (7) Ablation 'envelope vs forced select' on expert and decision scenarios: blind pairwise preference and controller-caused regression rate (turns worse than baseline where the trace shows a forced move from guessed evidence) <5%.

### Reversal conditions

Reinstate forced fine-grained selection in the thinking modes if the envelope arm loses to the forced arm in blind pairwise evaluation at p<0.05 on ≥100 expert/decision turns. Revert the fast path if the assessment-leak rate on fast-path turns rises above 0. Restore any purged prompt line if explicit-practice leak rate rises above 5% and the move block cannot hold it.


## D2. Deterministic explicit signals: precision, precedence, scope and missing signal types

**Implementation status: PARTIAL.** Done: STRONG-only withholding via practiceIntent; weak learning phrases become inferred 0.7; negation fix; the verified false positives closed with tests; new signals (safety, recommendationRequested, dontKnow, tooDirect, offRecord, requestsQuestions); explicit directness above the vent branch; standing no_answer scoped away from information/execution. Not yet: the ≥420-phrase precision corpus with numeric gates; mood filter; domain-scoped expertise; correction kinds and reportedSpans; horizon words and standing loosening contracts; UI chips; non-English 'unavailable'.

### Competing proposals

(a) Straw: a regex hit counts as explicit at confidence 1, sticky. (b) Red Team, Domain Stress Tester and Adversarial Critic, having probed signals.ts: a STRONG/WEAK tier split, with weak hits corroborated by the reader and never able to withhold. (c) Agency Advocate: LOOSENING signals tuned for recall, TIGHTENING signals for precision. (d) Learning Science and Offloading Critic: split learningGoal into comprehension, practice and studyContext. (e) Memory Designer: split correction into kinds and add revision and reported speech. (f) Friction, Expert User and Privacy: new signals (dontKnow, decided, wantsChallenge, brevity, skipBasics, quiz/role-play, privacy, negated self, TOO_DIRECT, requestScope, recommendation request).

### Disagreement

Nobody defended treating every hit as explicit. Three reviewers verified by execution that 25 of 29 adversarial phrasings produce wrong explicit signals. Examples: 'let me try to explain…' becomes a standing no_answer; 'help me understand…' makes a wrong attempt get verify.practice; 'paper to submit to NeurIPS' triggers assessment; 'my lab report' marks the user as an expert. The remaining disagreement is about how 'let me try' should behave: Learning Science wants GET_OUT_OF_THE_WAY before an attempt, the Red Team wants it moved to the weak tier.

### Final decision

TIERS
STRONG tier (source 'said', confidence 1, may tighten) is the only tier allowed to create withholding. It covers exactly these patterns:
- /don'?t (tell|give) me the (answer|answers|solution)/ (with no preceding 'just' within 3 tokens, so 'don't just give me the answer' is excluded)
- 'hints only', 'no spoilers' (when the object is Socria's answer)
- 'I want to (work|figure|solve) (it|this) out myself'
- 'let me try (it|this|the problem)? (first|myself|on my own)'
- 'even if I ask' (binding)
- 'quiz me' / 'test me' / 'drill me' (quiz contract)
- 'grill me' / 'pretend you're (the|a) (investor|interviewer|examiner|opposing counsel)' / 'play devil's advocate' (role-play contract)
- 'this (will be|is) graded' / 'I'll submit' / 'take-home exam' / 'my graded (homework|problem set|assignment)' (assessment, needs first-person submission in the same sentence; publication venues excluded)

LOOSENING tier (may act this turn from the regex alone): answer request ('just (tell|give) me', 'give me the answer'), delegate (write/draft/rewrite/edit/tighten/polish/proofread (this|it|my \w+)), stop questions, brevity (tl;dr, one line, just the code), skipBasics ('I know what X is', 'skip the basics'), decided ('I've decided', 'don't talk me out of it'), wantsChallenge ('push back', 'poke holes', 'steelman'), dontKnow (≤8 words anchored at start: idk / I don't know / no idea / no clue).

WEAK tier: 'let me try X', help me understand, teach me, I'm studying/preparing/revising/practising, for my course, I know, obviously, come on, a nudge, without revealing, I didn't mean, don't ask me, frustration words. These go to the reader as quoted candidates. They become at most inferred ≤0.7, NEVER withhold, and are NEVER standing.

FILTERS
- Mood: a directive inside a sentence ending '?' or starting should/can/would I is not a directive.
- Object: 'without X' is no_answer only when X ∈ {answer, solution, it away}.
- Negation within 6 tokens.
- Only the user's typed text is read, never quoted, pasted, code or attachment spans.

SPLITS
- learningGoal → comprehensionRequest (EXPLAIN, never a withhold reason), practiceIntent (the only learning evidence that can back practice_goal), studyContext (context only).
- expertise → [{domain terms from the matched clause, level}]. Novice adjectives in the slot (bad, junior, aspiring, former, student) cancel it; 'X but new to Y' binds novice to Y; 'my lab' is dropped; add founder, CEO, CTO, PM, analyst, consultant, designer, novelist, editor, investor, accountant, nurse, pharmacist, SRE.
- NEGATED_SELF ('I'm not a beginner/student/learning this') sets an explicit value.
- correction → {kind: misread | misattributed | state_field | disputes_claim, target span}. revision ('changed my mind', 'scratch that', 'I was wrong about') is its own signal.
- reportedSpans: 'you said…', 'my <role> thinks/says…', quote marks, '>' lines.

NEW
- requestScope ∈ {check, feedback, approach_check, do, explain, none}.
- feedbackPreference ∈ {flag_only, full_correction}.
- recommendationRequested ('what would you do', 'which should I', 'your pick').
- tooDirect ('you gave it away', 'I wanted to figure that out', 'spoiler').
- privacy (D15): 'off the record', 'don't remember this', 'forget that'.
- horizon words ('from now on', 'always', 'in general', 'stop being Socratic') make a loosening directness STANDING. Otherwise directness=answer fades after 2 turns.

PRECEDENCE: current-turn STRONG/loosening explicit > UI override > Project instructions > stored contract > inferred. Explicit directness is evaluated ABOVE the vent/reflection branch in allocate() (it is currently below, allocation.ts:76 vs :82).

SCOPE: a standing no_answer/guidance applies to the item or topic it was said about. It expires when focus similarity to its scope is <0.3 or after 6 turns without restatement, and never applies to information, definition, execution or emergency asks.

VISIBILITY: every signal that changes the mode renders a chip (e.g. 'Hints only · from "…" · ×'). Removing it writes an explicit signal. Non-English messages give signals='unavailable', not 'none'.

### Evidence

Explicit-over-inferred precedence gives a false positive the strongest authority in the system, so precision on the tightening side is what protects agency. Under the asymmetric error costs, a missed tightening signal costs one practice opportunity, recoverable with 'let me try', while a false one silently withholds from an expert for the whole conversation. The minority (Red Team, Domain Stress Tester, Adversarial) wins because they demonstrated these failures by running the code, while the straw's position rests on intuition. The chip turns every remaining misfire into a one-tap fix (reversibility). Moving explicit directness above the vent branch is a verified precedence bug.

### Test

Permanent lexical-collision corpus: ≥300 innocent uses of trigger words across 11 domains plus ≥120 true triggers, all probe sentences from the reviews verbatim ('let me try to explain…', 'don't just tell me the answer, explain why', 'I'm studying the effect of statins', 'paper to submit to NeurIPS', 'My lab report is due', 'I'm a bad programmer', 'I know this is a dumb question', 'Is auto-enrollment a nudge', 'foreshadow the betrayal without revealing it', 'Don't give the answer key, I'll write it', 'Should I just quit my job?', 'Forget the learning part, I need to ship tonight'). Gates: STRONG-tier precision ≥0.97 and recall ≥0.85; loosening precision ≥0.90. Every false-positive phrase is also a multi-turn scenario asserting allocation.withhold===null for the next 5 turns. Vent plus 'just tell me which query is faster' ⇒ answer in sentence 1.

### Reversal conditions

Move a pattern from WEAK to STRONG only if it reaches ≥0.97 precision on ≥60 labelled real messages. Demote any STRONG pattern whose chip is removed within 3 turns in more than 10% of production firings, or whose withheld turns are overridden more than 25% of the time over ≥50 events.


## D3. CognitiveState fields, provenance, confidence, hysteresis, persistence, rendering

**Implementation status: PARTIAL.** Done: behavioural rendering only (no person labels to the generator); frustration not rendered as a label; inferred learning never withholds. Not yet: the v2 schema split (explicit/structural/inferred/computed), basis-derived confidence tiers, tally hysteresis, per-domain expertise, anti-anchoring reader input, artifact/answerability fields, the 'What Socria is working from' panel (the Memory page shows said-vs-inferred per conversation instead), cascade on conversation delete.

### Competing proposals

(a) Straw: inferred {value, source, confidence, evidence}, sticky, higher-confidence to change, per conversation. (b) Architect and Adversarial: confidence derived from an evidence tier, not LLM floats; delete fields nobody consumes. (c) Memory Designer: remove positions, tensions, openThreads and recentChanges as free text and derive them from the ledger. (d) Expert User, Agency Advocate and Red Team: domain-scoped expertise, asymmetric hysteresis, an evidence tally so a wrong first read can be displaced, and no anchoring on prior inferred values. (e) Friction Critic: asymmetric floors, with friction-increasing inferences needing ≥0.8 over 2 turns. (f) Domain Stress Tester: add artifact and answerability fields. (g) Privacy and Agency: a visible panel of the fields that drive behaviour, with a correction path.

### Disagreement

The Friction Critic wants friction-increasing inferences allowed at high confidence. The Offloading Critic and Agency Advocate want inference never to withhold at any confidence. The Adversarial Critic wants aggressive field deletion, while the Architect keeps structural fields. Reviewers are split on whether a UI panel is worth its UX cost.

### Final decision

SCHEMA v2
- explicit: {directness, contracts[], claimedExpertise[{domain, level}], learningObjective ∈ {comprehension, skill, retention, none}, persistPolicy}
- structural: {goal, focus, subgoalKey, constraints[] (cap 12 when artifact=plan, else 6), blockingUnknown}
- inferred: each Inferred<T> = {value, basis ∈ said|shown|guessed, confidence, evidence ≤120 chars, updatedAt}. Fields: taskKind, work, secondaryWork, stakes, urgency, expertise[{domain, level}] (≤3), artifact ∈ {none, code, prose_draft, message_draft, proof, calculation, dataset, plan, decision_memo, creative_piece, question_set}, answerability ∈ {determinate, contested, open}, stuck ∈ {no, stalled, looping}
- computed by code only: practiceItems, questionHistory, diminishing, ledgerRefs {positions: ids, tensions: [id, id], open: ids, changed: ids}

DELETED: supportLevel, confusions, assumptions (the reader's readings go to the ledger as owner=socria), masteryEvidence as free text, positions/tensions/openThreads/recentChanges as free text, desiredAutonomy as an inferred field.

CONFIDENCE comes from the basis: said 0.9, shown 0.7, guessed 0.4, seeded 0.3, default 0.2. The reader may only emit weak/strong, which adjusts ±0.1.

INVARIANTS
(I1) Inferred values of any confidence may change FORM or reduce friction. They may never create a withhold, a clarifying question or a practice mode.
(I2) frustration is not persisted. It comes only from the explicit signal, persists for 2 Socria turns unless progress is shown, and never leaves the conversation.

HYSTERESIS
- An explicit value applies immediately, but only within its domain (focus sim ≥0.2) and problem/Project scope.
- An inferred value switches when 3 consecutive reads disagree at ≥0.6, or when the alternative's summed confidence over the last 4 reads exceeds the incumbent's by ≥0.8.
- Expertise upgrades on one 'shown' event and downgrades only on ≥2 in-domain errors across ≥2 turns.
- An inferred field not refreshed for 8 user turns reverts to default.
- A verified subgoal change resets topic-scoped fields.
- Anti-anchoring: the reader is shown only explicit prior values plus ledgerRefs text, never prior inferred values or confidences.

RENDERING to the generator is behavioural only (density: terse|standard|scaffolded; 'do not explain: [demonstrated concepts]'). Never person labels (novice, expert, frustrated, confused). A position renders as 'they hold' only if backed by a user-origin quoted ledger entry; otherwise it goes under 'Socria's reading (may be wrong)'.

PERSISTENCE: per conversation. Cascade-delete with the conversation. Compact to explicit-only fields after 90 days idle. Inferred fields never cross conversations.

CORRECTABILITY: GET/PATCH /api/core4/state/:conversationId, plus a collapsible 'What Socria is working from' panel listing ONLY the fields that drive behaviour (directness, contracts, per-domain expertise, learning objective, any active withhold), each marked 'You said…' or 'Socria's guess'. 'That's wrong' sets the default and blocks re-inference of that field for the conversation unless new evidence at confidence ≥0.85 arrives from a later turn. Affect fields are excluded from the panel.

### Evidence

Spec: 'don't treat uncertain inference as fact' and 'not a pseudo-psychological profile'. The spec also names 'state repeatedly mischaracterizes users' as a falsification criterion. Two things were verified: sticky() cannot recover after 1 expert read at 0.85 followed by 10 novice reads at 0.8, and the expertise field is global. The Offloading Critic and Agency Advocate prevail over the Friction Critic's 0.8 floor, because a withhold built on inference is exactly the paternalism the spec rules out. The UX cost is a single line per turn, and learners can recover with 'let me try'. Deleting fields that no decision reads (the Adversarial Critic's consumer audit) cuts reader output tokens and latency with no behavioural loss. Deriving positions from the ledger removes a third, ungrounded copy of the user's reasoning (spec phase 11: no duplicated or contradictory state).

### Test

(1) Unit: an inferred practice value at 0.95 gives withhold===null. (2) 1× expert@0.85 then 3× novice@0.7 flips to novice. (3) 'I'm a statistician' then 'I'm learning guitar, what's a barre chord?' produces a novice-register reply (blind raters) and focus-scoped expertise=unknown. (4) Grep/assert that no generator prompt contains novice, beginner, expert, frustrated or confused as person descriptors. (5) State-reader accuracy on ≥250 human-labelled turns: an inferred field may drive behaviour only at precision ≥0.8; report the unknown rate per field. (6) Anchoring test: a prior containing a wrong position followed by a contradicting message updates within 1 turn. (7) Deleting a conversation leaves 0 core4_state rows.

### Reversal conditions

Allow a specific inferred field to gate practice mode only if its precision is ≥0.95 on ≥150 labelled turns AND the explicit-only arm shows a measurable loss in learning scenarios. Remove the panel if fewer than 1% of users open it over 8 weeks and the chip-based correction covers ≥90% of corrections.


## D4. Question budget: what counts as a question, caps, and exemptions

**Implementation status: PARTIAL.** Done: blocker re-grant deleted (PROCEED_UNDER_ASSUMPTION); 0 questions after 'just tell me' and in execute/explain moves; ≤1 question-bearing reply in 4 outside practice; comprehension checks always stripped; requested-content exemption; stream gate drops re-asked questions. Not yet: ':::artifact' fencing, HANDBACK imperatives, full-width marks, rhetorical-question exemption rule, quiz/role-play contract modes beyond 'wanted', the 3-turn post-switch hysteresis, keep-rule by concept overlap, the 25%-of-characters rule for trailing deletions (we apply the size floor only to substantive deletions — see the D8 note).

### Competing proposals

(a) Straw: count sentences ending in '?' plus disguised interrogatives, regardless of move label; maxQuestions ∈ {0,1}; strip anything over. (b) Architect and Learning Science: count WORK DEMANDS (imperatives such as try/solve/your turn); exempt rhetorical questions, requested content and practice. (c) Domain Stress Tester: the unit is an interrogative ADDRESSED to the user in Socria's own voice; artifact spans are exempt; shield URLs. (d) Friction Critic: close the leaks (quoted questions, 'the question is whether', 'let me know what you get', full-width '？'); delete the blocker re-grant in favour of PROCEED_UNDER_ASSUMPTION. (e) Adversarial Critic: deletion guts content, so delete only trailing sentences and regenerate otherwise.

### Disagreement

All agree interrogative work should be priced whatever the label. The disagreements are about how precise the detector is and what to do when it fires. The Adversarial and Domain reviewers showed by execution that it currently strips email CTAs, interview guides, fix sentences read as offers ('If you'd like the fix: …'), verdicts, proof steps and URLs. Learning Science and Red Team showed that 'quiz me' can never produce a question (it routes to EXPLAIN with maxQ=0), and that a quiz stops after two correct short answers.

### Final decision

UNIT: an interrogative addressed to the user in Socria's voice, outside artifact spans.

COUNTED:
- sentences ending ? ？ ¿ ؟
- disguised forms: think about whether, consider what would happen if you, ask yourself, what do you think, the question is whether, the thing to pin down is, tell me more about, walk me through, I'm curious whether, let me know what/how/if you (get|find|think|see), your turn, over to you, give it a shot, try X and see
- HANDBACK imperatives aimed at the user after the substantive content: /^(?:now,?\s+)?(?:try|apply|use|do)\s+(?:it|this|that|the same)\b.*\b(?:on|to|with)\b|^your turn\b|^(?:see|check|test) (?:whether|what|if|how)\b/
- a quoted question introduced by consider, ask, think about or 'the question'

NOT COUNTED:
- text inside a ':::artifact' fence the generator must use whenever decision.produces=artifact (drafts, emails, FAQs, exam items, question lists, dialogue, poems), plus code and blockquotes
- rhetorical questions: a '?' sentence that is not the reply's final sentence and is followed in the same paragraph by a sentence starting Because|It's|That's|The answer|The reason
- a directive with its own colon/so/because payload
- requested-content questions (the request mentions questions, quiz, interview or practice problems)

Shield URLs, emails, decimals, $…$, e.g./i.e./et al. before splitting sentences. An artifact block is counted normally when reader artifact=none.

ALWAYS STRIP regardless of budget: 'Does that make sense?', 'Make sense?', 'Any questions?', 'Is that clear?', 'Sound good?'.

CAPS: maxQuestions ∈ {0,1}. maxQuestions=0 when any of these hold:
- explicit stop
- streak ≥2
- ≥1 question-bearing reply in the last 3 Socria replies in a non-practice mode (so at most 1 in 4 consecutive replies)
- ≥3 of the last 6 in HUMAN_PRACTICES
- diminishing detected
- directness=answer this turn
- mode ∈ {AI_EXECUTES, AI_EXPLAINS}
- within 3 turns after a strategy switch away from asking, unless the user explicitly invites questions

BLOCKERS: the budget.ts:159 re-grant is deleted. Default is PROCEED_UNDER_ASSUMPTION ('Assuming X…; if instead Y, …'). CLARIFY is allowed only if: budget allows 1 AND two quote-backed readings lead to materially different irreversible actions AND both cannot be covered in ≤150 words AND there is no explicit stop, answer, redundancy or frustration signal AND no clarification in the last 2 turns.

CONTRACTS: under a quiz or role-play contract, exactly 1 in-role item per turn. Streak, density and inferred diminishing are ignored. The contract ends only on explicit stop/enough/'out of character', directness=answer, or frustration. Under an explicit practice contract, an item the user answered with a real attempt does not add to the streak.

KEEP RULE: when keep=1, keep the interrogative with the highest concept overlap with blockingUnknown or objective; on a tie, keep the last.

ENFORCEMENT: deterministic deletion only of TRAILING over-budget interrogatives and offers, and only if the deletion removes ≤25% of characters and touches no sentence containing code, digits or a colon payload. Mid-reply over-budget content or larger deletions trigger one regenerate with the note 'If a question is worth asking and maxQuestions=0, state the underlying claim instead'. OFFER requires a first-person shape (I can / want me to / shall I / should I / let me know if), and conditionals that give advice are not offers. Every deletion is traced with a code.

The Socratic budget detector and the ledger's Socria-question extraction share one detector module.

### Evidence

The spec requires pricing interrogative work under any label and forbids 'statements that perform the same annoying function', so HANDBACK and the disguised forms are covered. The spec also says questioning is ONE intervention: a requested quiz is the user exercising agency, and retrieval practice is among the best-evidenced learning interventions. So contracts override inferred diminishing, and here the Learning Science, Domain and Red Team minority is right. Content deletion was verified (fix sentences, verdicts, URLs, CTAs). The baseline has no such mangler, so an unfixed guard makes Core 4 lose on drafting (Domain Stress Tester). PROCEED_UNDER_ASSUMPTION costs at most one turn when the assumption is wrong; asking first costs a turn every time.

### Test

(1) Artifact-integrity suite of 40 deliverables (cold email with CTA, discovery interview guide, FAQ, 5 exam items, poem ending on a question, single-quoted screenplay dialogue, proof with rhetorical steps, 10 prose URLs with query strings) ⇒ 0 deletions and 0 dangling list markers. (2) 'quiz me' plus 6 terse correct answers ⇒ exactly 1 question every turn, and none after 'ok enough'. (3) 'Just tell me which index to add' with the query missing ⇒ 0 questions and one stated assumption. (4) 'Consider the question "what would falsify this?"' at maxQ=0 is counted and handled. (5) 'Why does this happen? Because the cache is cold.' is not counted or stripped. (6) The draft 'Does that make sense? Which Postgres version are you on?' with blocker=version keeps the version question only. (7) Two Japanese replies ending in '？' give streak=2. (8) Detector labelled set of ≥300 sentences: strip precision ≥0.95 and recall ≥0.80, scored by an independent classifier, not questions.ts.

### Reversal conditions

If the independent judge measures a disguise-leak rate >10% of question-bearing replies on the red-team-refreshed set, add a model-layer check. If artifact fencing is abused (fenced questions on artifact=none turns >2%), require an artifact intent from the reader before exempting. Tighten density to 1 in 6 if expert raters still tag ≥25% of questions as unnecessary.


## D5. Diminishing-returns detector and strategy switching

**Implementation status: NOT YET.** The existing detector (explicit alone; two inferred) stands. The council's minimal detector (ledger-delta no_progress, relative brevity per user, FIX_FAILED/ITERATION exclusions, STUCK/SATURATED/DONE causes) and its ablation gate are not built. 'idk' now maps to stuck and escalates support.

### Competing proposals

(a) Straw: signal list plus switch table. (b) Adversarial Critic: fold it into D4 plus a family-exclusion rule and delete the rest (REDUNDANT with upstream). (c) Architect: classify the cause as STUCK, SATURATED, DONE or IMPATIENT, each with a different switch, scoped per subgoal, with 3-turn hysteresis. (d) Friction and Memory Designer: compute the signals from ledger deltas, add dontKnow, ignored questions and user self-repetition. (e) Domain and Learning Science: exclude attempts, revision rounds, a re-pasted error (FIX_FAILED) and requested practice.

### Disagreement

The Adversarial Critic, in the minority, argues the standalone detector is mostly redundant: explicit signals are already handled, and the inferred half fires on missing outcome labels. The Red Team verified it fires after two CONTRIBUTE turns with no user signal. The others want it kept, with cause-sensitive switches.

### Final decision

Keep a MINIMAL detector.

Explicit trigger (sufficient alone): directness=answer, stop questions, dontKnow, first-person frustration, or redundancy feedback that meets the position rule (the phrase appears in the first 12 words, or is followed within 5 words by you/that/this/it, AND Socria's previous turn raised something).

Inferred trigger: ≥2 of the following, with at least one being user behaviour.
(i) no_progress: two consecutive user replies to Socria work demands that create 0 new user-origin ledger entries, moves or links (requires readOk).
(ii) user_repeating: ≥2 incoming user items merged into an existing user entry within 4 turns.
(iii) relative brevity: message ≤30% of THIS user's median over ≥3 prior turns, twice. Never sufficient alone. Absent when the reply is an attempt, numeric, a formula, code, or yes/no to a yes/no question.
(iv) questionIgnored twice: the user's reply has <0.2 concept overlap with Socria's question, or asks a new question.
(v) ≥2 labelled FRICTION outcomes at confidence ≥0.6. A missing label is never evidence.

NOT signals: a re-pasted identical error after EXECUTE/ANSWER (FIX_FAILED ⇒ a new hypothesis, and one specific evidence request is allowed); a re-pasted draft with a >5% token diff (ITERATION = progress).

Cause (deterministic):
- STUCK = dontKnow or ≥2 failed attempts on an item ⇒ escalate the ladder one rung (D6).
- DONE = an acknowledgement plus 'got it'/'thanks' with no new question ⇒ a short close, no question, no offer.
- otherwise SATURATED ⇒ CONTRIBUTE (a different angle, with the rejected item added to avoid), or plainly 'nothing material to add; the residual uncertainty is X'.

Inferred triggers never override a quiz, role-play or explicit practice contract. State is scoped per subgoalKey and resets on a verified subgoal change. After a switch, no question-family move for 3 Socria turns unless the user explicitly asks or a new quote-backed blocker meets the D4 CLARIFY criteria. CONTRIBUTE→GET_OUT_OF_THE_WAY requires an explicit redundancy signal. REFLECTION→RESEARCH and DISCUSSION→MODEL/VISUALIZE are removed from the table (no tools). Each switch is traced as {from, to, cause, signals[]}.

### Evidence

The spec requires a detector and strategy change, so outright deletion (the Adversarial position) conflicts with the spec. But the Adversarial test (does it add behaviour beyond D4?) is honoured by the ablation gate below. Cause classification is kept because the behavioural difference is real and large: a stuck learner needs more help, while a saturated expert needs a contribution. It costs only deterministic logic. The inferred signals change to require user behaviour and never count missing labels, because the verified false firing on two CONTRIBUTE turns demotes experts to silence.

### Test

(1) 'ok'/'go on'/'right' ×3 after substantive turns ⇒ 3 substantive continuations, 0 GET_OUT_OF_THE_WAY. (2) Terse-from-turn-1 expert whose every message adds information ⇒ 0 detections. (3) 'idk' after a hint ⇒ next reply is a worked explanation with 0 questions. (4) The same stack trace re-pasted twice ⇒ each reply offers a new hypothesis, no SYNTHESIZE. (5) A 4-round writing revision loop ⇒ critique continues on ≥3 dimensions. (6) Quiz with short correct answers ⇒ no switch. (7) The user restates the runway constraint on turns 2, 4 and 5 ⇒ turn 5 uses it with no question on it. (8) Topic change with a real blocker ⇒ one clarifying question permitted. (9) Switch precision ≥0.8 against human-marked onset on ≥60 adaptive-simulation sessions.

### Reversal conditions

ABLATION GATE: if detector-on vs detector-off differ by <5pp on redundant-question rate in the repeated-questioning, changing-goals and expert categories AND blind preference is not significantly different, delete the inferred half and keep only the explicit trigger plus family exclusion (the Adversarial proposal).


## D6. When withholding is legitimate, its scope, bounds, precedence and overrides

**Implementation status: PARTIAL.** Done: explicit-only withholding (and the 144-state test); verification first; a standing 'don't tell me' does not cover facts/execution; bottom-out to a worked solution after repeated failures ('idk' or frustration brings it forward); 'let me try first' → GET_OUT_OF_THE_WAY; recommendationRequested → a pick plus the value hinge; safety overrides contracts; the withhold shape with a quote and an alternative, and the test-time throw (CORE4_STRICT) when a withhold has no quote; an analogous worked example is offered only once they are stuck (run 3, debugging-005). Not yet: an explicit scope field; per-item ladder levels 1–4 with an item tracker; binding contracts ('even if I ask') with one reminder then comply; third-override offer; UI disclosure chip.

### Competing proposals

(a) Straw: withhold only with positive evidence for an enumerated reason; uncertainty ⇒ no withhold; an answer request overrides inferred withholding; wrong attempt ⇒ CORRECT; debugging ⇒ fix. (b) Agency Advocate and Offloading Critic: explicit sources only, a mandatory `alternative`, disclosure, one-tap override, binding pre-commitment semantics. (c) Learning Science: bound it per item (2 attempts), a hint ladder, WORKED_EXAMPLE, error classes, 'let me try' ⇒ GET_OUT_OF_THE_WAY, stakes suspend the contract. (d) Red Team: scope, a safety override, verification before withholding, goal-conflict resolution. (e) Expert User and Agency: remove the router's decide/create/learn default withholds; 'what would you do' ⇒ a recommendation. (f) Evaluation Scientist: the asymmetric-cost claim is a hypothesis (Bastani et al.), so test undeclared learners in a consented study.

### Disagreement

Principle: near-unanimous approval. Evidence tier: Offloading, Agency and Adversarial want explicit only; Offloading allows OBSERVED authorship when the user supplies an artifact. Bounds: Learning Science wants a hard 2-attempt cap even under an explicit contract; the Agency Advocate wants the user's explicit contract to govern, with a single reminder for binding contracts. Judgment: the Offloading Critic wants HUMAN_LEADS as a form default (crux first), while the Expert User, Agency Advocate and Friction Critic want a recommendation whenever one is asked for.

### Final decision

SHAPE: withhold = {what ∈ {final_answer, corrected_step, patch, rewritten_text, verdict, interpretation, recommendation}, reason ∈ {practice_goal, requested_no_answer, authorship, assessment_integrity, agency_boundary}, source ∈ {message, project, contract, ui}, ref, quote, scope: {kind: item|topic|project, key}, alternative: string (required, non-empty)}. allocate() throws in tests and falls back to null in production if the source or quote is missing. Inference can never withhold; at most it adds a one-clause, once-per-conversation offer ('want to try it first?').

REASON REQUIREMENTS:
- practice_goal needs a STRONG practiceIntent or a Project learning contract AND an open practice item.
- requested_no_answer needs a STRONG no_answer.
- authorship needs an explicit 'I want to write it myself / don't rewrite / feedback only' or assessment. requestScope check/feedback on a supplied artifact is a FORM constraint (critique and locate; rewrite only when asked), not a withhold.
- assessment_integrity needs STRONG assessment and covers only the submittable artifact. Concept explanations, analogous worked examples and verdicts on their attempt stay available. The reason is stated once in one sentence, with no moralising.
- agency_boundary needs an explicit 'don't tell me what to do / I want to decide this myself'.

NEVER WITHHELD: information, definitions, mechanical execution, non-practice debugging (the fix plus a one-line cause), missing prerequisites (taught directly), anything under the safety gate, and anything outside the withhold's scope.

PRECEDENCE: when an attempt exists, verification comes first. The verdict, location and error type are always given; a right attempt hears 'correct' plus why in sentence 1; only the corrected final value is held under a withhold. 'Tell me if I'm right / on the right track' is verification, not an answer request.

LADDER per item: 1 pointer, 2 principle/errorType, 3 next step or analogous WORKED_EXAMPLE, 4 worked solution with the principle labelled, plus one isomorphic item stated (not asked) if the contract stands.
- Escalate one rung per failed attempt, two rungs for dontKnow or misconception/missing-prerequisite.
- Hard cap: rung 4 after 2 failed attempts (1 if errorClass ∈ {misconception, missing_prerequisite}).
- 'even if I'm stuck' raises the cap to 4 attempts.
- Success lowers the next item's starting rung by one.
- 'let me try it first' with no attempt ⇒ GET_OUT_OF_THE_WAY ('Go ahead'), with no hint.

OVERRIDES:
- An explicit answer request vs a non-binding contract ⇒ comply the same turn with ≤1 leading clause, no question, no justification paragraph; the contract resumes on the next item; trace override={reason, source, via}.
- Against a binding pre-commitment ⇒ at most ONE reminder turn containing a stronger hint plus 'say "override" and I'll show it', then comply. Never two refusals.
- On the 3rd override of the same contract within a conversation ⇒ one statement-form offer to lift it, not repeated.
- A statement about THIS item (urgency, 'forget the learning part', 'I just need it done') beats a general learning statement.

JUDGMENT:
- recommendationRequested ⇒ Socria's pick in the first two sentences, labelled as its view, plus the value hinge ('if X matters more than Y, B'); stored owner=socria.
- A delegate phrased as a question about the user's own life decision ⇒ HUMAN_LEADS: a view plus the hinge, never an instruction.
- urgency=high plus judgment ⇒ the recommendation in sentence 1.
- Research questions ⇒ AI_EXPLAINS with an evidence-quality read (interpretation withheld only under authorship of their own manuscript).
- Remove router.ts decide⇒withhold recommendation, create⇒withhold own version, learn⇒default ASK.

DISCLOSURE: on every withheld turn a UI chip: 'Holding back <what> because you said "<quote>" · [Show answer]'. On the first withhold per conversation sourced outside this conversation's messages (Project or contract), one in-text clause saying where to change it. WHY_NOT_ANSWER is removed from the Core 4 path.

### Evidence

Spec: 'wrong answers alone are NOT a reason', 'debugging alone is NOT a reason', 'Socria doesn't decide what the user may know', and an explicit answer request 'carries substantial weight'. The Agency, Offloading and Adversarial minority's explicit-only rule wins because every verified wrongful-withhold path (the regex misfires and verify.practice on 'help me understand') is an inference path. Learning Science wins on bounds, because unbounded withholding makes the learner do the allocation work (begging) and turns productive failure into unproductive failure. The user can still raise the cap explicitly, which reconciles this with the Agency Advocate. On judgment, the Expert User and Agency Advocate prevail over the Offloading Critic's form default: when a view is explicitly asked for, refusing it withholds an input to the decision rather than preserving agency. The Offloading Critic's concern survives in the hinge requirement and owner=socria attribution. The Evaluation Scientist's dependency concern is real but is an empirical question for a consented experiment. It does not justify a product default of withholding from people who never asked.

### Test

(1) Invariant over all eval traces: withhold≠null ⇒ source ∈ explicit set and quote non-empty and alternative non-empty (0 violations). (2) 'Help me understand where I went wrong: d/dx sin(x²)=cos(x²)' ⇒ CORRECT with 2x·cos(x²). (3) 'I'm drilling these, don't give me the answer' plus 3 wrong attempts ⇒ attempt 3 gets a worked solution plus an isomorphic item. (4) Standing 'let me try first' plus a right attempt ⇒ 'correct' in sentence 1. (5) Hints-only Project plus CSV→JSON, plus a definition, plus a button-battery emergency ⇒ all answered; a practice item in the same session is still withheld. (6) Binding 'even if I beg' ⇒ one reminder, then the answer. (7) 'Which would you pick?' ⇒ a pick in ≥95% of runs. (8) Graded take-home ⇒ an analogous worked example with the target value absent. (9) Metrics: unnecessary-withholding ≤2% of turns in non-learning categories; override-after-withhold ≤20% overall; contract leak ≤3%.

### Reversal conditions

Auto-disable any reason code whose override rate exceeds 30% over ≥50 events pending review. If the consented undeclared-learner study (D16) shows CORRECT-by-default is worse by >0.2 SD on a 7-day unassisted post-test, add a non-blocking one-clause 'try the fix first?' offer for inferred learners, never a hard withhold. Lower the attempt cap to 1 if human raters judge ≥30% of rung-3 turns as unproductive struggle.


## D7. Intervention set and selection granularity

**Implementation status: PARTIAL.** Done: CALCULATE only when computeAsked() evaluated a posed expression and the value is injected; otherwise ANSWER. Not yet: collapsing EXPLAIN/EXECUTE into ANSWER forms, WORKED_EXAMPLE type, crux QUESTION, CONTRIBUTE kinds incl. nothing_to_add, ACKNOWLEDGE rename, removing RESEARCH/MODEL/VISUALIZE from the enum (they are not selectable, but still in the type), tools-contract.ts, realized-family telemetry.

### Competing proposals

(a) Straw: 16 selectable types; RESEARCH/MODEL/VISUALIZE declared but disabled. (b) Adversarial Critic: merge to about 8 because humans can't tell many apart; delete the dead types; CALCULATE only when actually computed. (c) Architect and Learning Science: add WORKED_EXAMPLE, TEACH_PREREQUISITE, ACKNOWLEDGE and PRACTICE_ITEM; primary plus a non-interrogative addendum. (d) Expert User: CONTRIBUTE with a contributionKind, HONEST_NULL, REFLECT/HINT restricted. (e) Domain Stress Tester: QUESTION as a peer contribution, ROLE_PLAY, DEMONSTRATE. (f) Evaluation Scientist: log selected vs realized families; merge any pair with kappa below 0.4.

### Disagreement

The Adversarial Critic wants fewer types and the Architect and Learning Science want more. The Friction Critic wants QUESTION only in practice, while the Domain Stress Tester and Expert User want a crux question available to peers.

### Final decision

SELECTABLE InterventionType:
- ANSWER, with form ∈ {bare, with_cause, worked_example} and register ∈ {execute, explain}; replaces EXPLAIN/EXECUTE as separate types, which are kept only as a telemetry `flavor`
- CORRECT (including the verify-locate variant when withheld)
- HINT (selectable only when the item has an explicit practice contract or directness=guidance)
- WORKED_EXAMPLE, with target ∈ {analogous, target}; analogous is allowed under every withhold except assessment with overlapping givens
- QUESTION, with kind ∈ {practice_item, clarify, crux}. crux is allowed in SHARED_REASONING/HUMAN_LEADS only when budget=1, the novelty judge says NOVEL, it is paired with Socria's own lean, and at most once per 4 turns.
- CONTRIBUTE, with kind ∈ {missing_variable, overlooked_assumption, contradiction, stronger_counterargument, structural_simplification, wrong_problem, cross_session_tension, synthesis, connection, nothing_to_add}. nothing_to_add = 'nothing material to add; residual uncertainty is X; cheapest test is Y', allowed only when ≥3 considered items exist for the focus.
- CRITIQUE (open or contested work; never 'the correct version')
- RETRIEVE (renders historyView from the ledger; D10)
- ACKNOWLEDGE (was REFLECT/LISTEN; selectable only when latest ∉ {question, request}; no advice, no question)
- GET_OUT_OF_THE_WAY
- CALCULATE, only when lib/logos-math compileExpr evaluated a user-posed expression and the value is injected; otherwise ANSWER, and the reply may not claim to have calculated

CONTRACT MODES (not types): QUIZ and ROLE_PLAY set the budget from the contract (D4).

MISSING PREREQUISITE: WORKED_EXAMPLE/ANSWER on the prerequisite, never quizzed.

ADDENDUM: primary plus at most one non-interrogative CONTRIBUTE addendum, only when the novelty gate passes. Disabled if human-rated usefulness is <70%.

'USE WHAT THEY GAVE' RULE: if the latest user message resolved Socria's last demand, the primary may not be QUESTION unless there is a new quote-backed blocker.

REFLECTION_PROMPT: only under an explicit learning goal, after task completion, at most once per session.

RESEARCH/MODEL/VISUALIZE are removed from the enum. A typed interface file lib/core4/tools-contract.ts documents their privacy contract (the query is built from the current turn only, stripped of names/emails/digit runs >6 and shown to the user; Logos payloads pass the private/scope filter) with no runtime.

NO TOOL: when the user asks to look something up, answer from knowledge with the uncertainty and date limits marked; never claim to have searched; the guard strips 'I searched/looked up/ran'.

TELEMETRY: log selected {type, kind/form} and realized family ∈ {ANSWERING, CORRECTIVE, CONTRIBUTIVE, ELICITIVE, NULL} from a post-hoc classifier.

### Evidence

'Don't add types for feature count; choosing correctly matters' (spec) supports the Adversarial merges where the distinction doesn't change behaviour (EXPLAIN/EXECUTE/ANSWER; CONNECT/SYNTHESIZE/CHALLENGE become CONTRIBUTE kinds). WORKED_EXAMPLE earns a type because the guard currently flags the stuck-HINT's analogous worked example as a worked_solution, which removes the best-evidenced support exactly when it's needed; that was verified by Learning Science. The crux question wins for the Domain and Expert User minority, but with a tight cap, because the spec's peer principle ('you challenge me when there's actually something worth challenging') is otherwise unreachable. CALCULATE without computation is fake precision. Dead enum entries fail the adversarial test.

### Test

(1) The guard ALLOWs an analogous worked example on a different integrand under requested_no_answer.stuck and catches a target worked solution. (2) HINT is selected outside a practice contract 0 times across the corpus. (3) CALCULATE claims are 100% backed by an evaluator trace, and 'What does a 2% rate hike do to housing demand?' is never CALCULATE. (4) After a user answers Socria's question, the next primary is QUESTION 0 times without a new blocker. (5) Realized-family fidelity (selected family = realized family) ≥85% on 300 labelled replies. (6) 'Look up the latest FDA guidance' ⇒ no claimed search and no question-only reply. (7) Blind raters judge crux QUESTIONs 'the most valuable move' in ≥70% of cases.

### Reversal conditions

Merge further any pair with human-label kappa <0.4. If realized fidelity is <70%, claims about intervention selection are void until move-block control is fixed. Disable crux QUESTION if expert raters tag >25% of them as unnecessary. Re-add RESEARCH to the enum only when a provider plus injection defences exist.


## D8. Answer Guard 2.0: scope of deterministic edits, model layer, streaming, fallbacks, new checks

**Implementation status: PARTIAL.** Done: buffer only when withheld; stream gate holds and drops over-budget/re-asked questions; value-boundary hidden matching; coherence floor (applied to substantive deletions; trailing questions, offers, openers and voice strips are exempt from the size part); no canned text unless withheld; tool-claim and trait-as-fact stripping; narrowed DEFLECT; no_verdict; model pass only deletes, 1.5 s timeout. Not yet: echo-opener strip, verification-claim and praise-with-wrong-verdict flags, scope-overreach on owned artifacts, attribution check, target-aware worked-solution check, retry only if elapsed <8 s, per-edit trace codes beyond findings.

### Competing proposals

(a) Straw: two-sided; deterministic first; strip over-budget questions; OVERRIDE on contentless drafts; buffer when guardRequired; cheap model when inconclusive; re-check retries; fall back to the stripped version. (b) Adversarial, Domain and Red Team: deletion guts replies, and canned fallbacks are tutor voice, so buffer only on withhold, cap deletions, regenerate instead, and add a coherence floor. (c) Friction Critic: hold-and-block (never reorder), coerce model verdicts, back-reference exemption, patronizing/echo lists. (d) Memory Designer and Privacy: attribution-in-output and inference-as-fact checks. (e) Offloading Critic: scope-overreach (rewrite) and false-correctness checks. (f) Learning Science: target-aware worked-solution detection and a no_verdict underhelp check. (g) Expert User: capitulation detector and restatement-opener strip.

### Disagreement

Everyone agrees on a two-sided guard and on re-checking retries. The dispute is whether deterministic deletion may act on its own authority (the straw) or only on trailing items with a coherence floor (the Adversarial, Domain and Red Team minority, backed by executed probes). The Expert User wants a model-based capitulation check; the Adversarial and Friction critics object to the added latency.

### Final decision

STREAMING: guardRequired = (withhold≠null). All other turns stream through the sentence gate, which applies HOLD-AND-BLOCK semantics. At the first held sentence (an addressed interrogative, an attribution marker, or a voice-strip candidate) emission pauses and later text buffers in order. At the end, held sentences are kept in place or dropped. Nothing is reordered. A held question is released early only if the NEXT sentence answers it.

DETERMINISTIC DELETIONS allowed on the layer's own authority:
- trailing over-budget interrogatives and offers (per D4)
- ALWAYS_STRIP voice items: sycophantic/praise openers shared with Core 3.1 BANNED_PATTERNS; 'Great effort'; 'Let's break this down / explore together'; comprehension checks; an echo opener (first sentence with ≥0.6 concept overlap with the user's last message, or starting 'So you're saying|It sounds like you|What I'm hearing'), exempt in ACKNOWLEDGE
- hidden-value leaks, matched on numeric/word boundaries by parsed value (12≠120), non-numeric values ≥3 chars as whole words
- unbacked tool claims
- trait-as-fact sentences (/you('re| are) (clearly |obviously )?(a beginner|an expert|anxious|insecure|defensive|overwhelmed)|you tend to|you seem (anxious|stressed|upset)/) unless they match an explicit state field

COHERENCE FLOOR: if edits would remove >25% of characters, leave a bare list marker (^\d+[.)]\s*$), leave a forward-reference first sentence (Here are|The following|The three) or a dangling connective (Because|So|That|This), cut a URL, or empty the reply, then do not ship the edit. Regenerate once with a note. If the retry fails, ship the ORIGINAL with only trailing over-budget questions removed. Never ship canned text. fallbackReply's withholding line is allowed only when withhold≠null. Sentences containing safety or emergency directives are never removed.

FLAG ⇒ ONE REGENERATE (never deleted deterministically):
- mid-reply over-budget questions
- REDUNDANT novelty (D9)
- DEFLECT, which fires only when NO sentence states a claim, number or recommendation AND answerability=determinate AND (latest ∈ {question, request} or recommendationRequested); patterns add 'only you can decide', 'that's a personal decision', 'there are many factors'
- no_verdict when move ∈ {CORRECT, VERIFY} and the draft lacks an explicit verdict word
- verification-claim ('that's correct|looks right|well done|nailed it') when the verdict ≠ correct or no verdict exists
- praise with an incorrect verdict
- SCOPE overreach when requestScope ∈ {check, feedback, approach_check} with an ownedArtifact and a contiguous draft block with ≥0.5 content-word overlap and ≥60% of the artifact's length, unless a rewrite or fix was asked ('tighten/edit/polish/fix' = do)
- attribution: a sentence matching /as you (said|noted|mentioned)|your (point|argument|view) that|you(’ve| have)? already (considered|explored|identified|raised)|you (believe|think|assume) that/ whose clause does not match (sim ≥0.6) a user transcript sentence or an in-scope owner=user, basis∈{quoted,paraphrased}, non-disputed entry; strip the clause if it matches nothing, regenerate if it matches a Socria entry; cross-conversation matches must carry origin framing
- a worked solution under withhold, TARGET-AWARE: flag only if the steps reuse ≥50% of the target's givens, contain the hidden value, or reproduce the expected expression; for proofs and prose, fall back to the model check with the target included

MODEL LAYER: one cheap call, only when withhold≠null OR a raising sentence is UNCERTAIN in novelty. It returns verdict plus sentence indices only; cheap-model prose never ships. Timeout 1.5 s. It fails CLOSED to deterministic stripping when withhold≠null, otherwise fails OPEN. Coercion: when withhold=null, MODIFY_FOR_MORE_AGENCY ⇒ ALLOW. REQUEST_CLARIFICATION ⇒ ALLOW unless budget=1 and the D4 CLARIFY criteria hold.

RETRIES: ≤1 frontier regenerate per turn, and only if elapsed <8 s. Every retry is re-checked deterministically. The model-based capitulation check is DEFERRED; instead, a disputes_claim signal renders the directive 'Re-evaluate. If they are right, concede in one clause and restate. If not, hold once with the specific reason; do not repeat it a third time.'

Every edit is traced with a code.

### Evidence

Spec: Guard 2.0 must be 'lightweight latency/cost' and catch both overreach and pointless friction. Executed probes showed silent content loss (the SQL fix, the verdict, the key insight) passing the 4-word substance check. The coherence floor and regenerate-instead-of-delete fix that for the price of at most one frontier retry on a minority of turns. Buffering only on withhold is safe because only a leak can't be retracted after it is streamed. The attribution and trait checks directly enforce the spec's 'Socria ideas never attributed to the user' and 'never present uncertain inference as fact' on the output surface, deterministically at ~0 ms. The capability benefit of the capitulation model check doesn't justify its added latency yet, and a prompt directive plus the pushback scenarios can measure the need first.

### Test

(1) Labelled set of ≥250 drafts (50 leaks, 50 disguised questions, 50 underhelp, 50 clean, 50 safety-critical): overreach verdict precision ≥0.9, leak recall ≥0.8, 0 safety sentences stripped, coherence-break rate ≤3%. (2) Blind paired pre-guard vs post-guard on modified replies: post-guard wins or ties ≥80%. (3) Regression probes: "If you'd like the fix: add WHERE deleted_at IS NULL" survives; 'Happy to say it plainly: your margin is fine' survives; 'You have 120 samples' survives with hidden value 12; the Roth-vs-traditional bracket-conditional answer ships with no OVERRIDE. (4) Invariant: 0 shipped replies bypassing post-retry checks. (5) Coercion unit tests. (6) Reorder test: a held question never appears after text that followed it. (7) Echo-attribution suite of 15 adversarial conversations ⇒ 0 misattributions shipped. (8) CONTRIBUTE-turn TTFT within 300 ms of an unguarded stream.

### Reversal conditions

If shipped disguised or over-budget questions exceed 5% of streamed turns (independent judge), re-enable buffering for perspective moves in sophisticated sessions only. Add the model capitulation check if the pushback-no-new-argument scenarios show reversal without a new argument in >10% of runs. Remove patterns from the voice list if they strip warmth in reflective scenarios judged harmful in >5% of cases.


## D9. Already-considered novelty gate: matcher, scope, enforcement

**Implementation status: PARTIAL.** Done: prevention via the avoid list in the move block; detection limited to raisable items; lexical overlap may delete only a re-asked question; statements go to the model judge (buffered turns) — this was ALSO forced by pilot evidence (E5 reversal). Not yet: candidate-side coverage scoring with ≥0.8/≥3/no-new-entity; deleting the SYNONYMS map; regenerate-instead-of-delete for REDUNDANT statements; the exemptions list (recap requests, adopted items, spaced re-test); scope eligibility rules across Projects and the 30-day cutoff.

### Competing proposals

(a) Straw: lexical first; cheap judge only on UNCERTAIN when the stakes justify it; REDUNDANT ⇒ delete or regenerate. (b) Adversarial Critic (REJECT the matcher): avoid-list only in phase 1; add the gate only if raters find >10% redundancy; lexical is a recall filter and never decides. (c) Red Team (REJECT as specified): gate only raising sentences; candidate-side coverage; polarity-aware; fail open; regenerate rather than delete. (d) Expert User: always judge in sophisticated sessions; OBVIOUS_FOR_USER; cover declaratives. (e) Friction Critic: OBVIOUS verdict; asymmetric UNCERTAIN (fail closed for questions, open for declaratives). (f) Architect and Memory Designer: stance-aware avoid items (rejected-with-reason vs open) and prevention through the prompt digest. (g) Privacy: scope eligibility.

### Disagreement

The two REJECT votes (Adversarial and Red Team) are backed by execution. The spec's own GOOD sentence scores REDUNDANT 0.67 and is deleted. A correction of a false belief ('Vaccines do not cause autism') is deleted as REDUNDANT against the user's belief. Paraphrases ('Could a big lab just clone this?') score NOVEL. The Expert User wants the gate stronger (always judge, OBVIOUS). The Adversarial Critic wants it weaker until proven.

### Final decision

PREVENTION IS PRIMARY: render the scoped considered digest in the prompt as avoid items {id, origin, stance ∈ {asserts, entertains, asks, rejects(reason), accepts, resolved}, status, text}, with the instruction: 'Never raise a resolved or rejected item as new; you may attack the stated rejection reason; open items may be deepened only with an explicit advance; you may and should correct false premises.'

DETECTION (backstop) applies ONLY to RAISING sentences: addressed questions (D4), 'have you considered / what about / another option / one objection / one risk is / the risk is / consider the possibility'.

EXEMPT:
- user-requested recap/summarize/list/expand/elaborate/'tell me more'
- items the user adopted or asked about
- CORRECT sentences
- any sentence whose polarity differs from the matched item (ledger.samePolarity)
- back-reference sentences ('you've already…', 'beyond', 'the unresolved part') that pass the D8 attribution check
- spaced re-test of a missed practice item after ≥2 intervening items

SCORE = shared concepts ÷ concepts in the CANDIDATE sentence. Lexical REDUNDANT requires score ≥0.8 AND ≥3 shared concepts AND no new number, entity or mechanism term AND samePolarity. Score ≤0.3 ⇒ NOVEL. Otherwise UNCERTAIN ⇒ the judge, folded into the single D8 model call, quoting the matched item id and treating 'build past X' / 'contrast with X' / 'attacks the rejection reason' as NOVEL. Judge unavailable ⇒ interrogatives are suppressed (fail closed) and declaratives are allowed (fail open). Delete the SYNONYMS map. For artifact=creative_piece the lexical path is off and only the judge runs.

ENFORCEMENT: REDUNDANT ⇒ one regenerate with 'they already considered <item> (<stance>, reason: <reason>); go beyond it or drop it'. Deterministic deletion only for a trailing redundant question. When nothing new remains ⇒ CONTRIBUTE kind nothing_to_add (D7). The 'you've already covered the obvious objections' preface is allowed at most once every 3 turns and only for owner=user items not derived from Socria.

SCOPE (eligibility replaces the score threshold): same conversation, any origin; OR same non-null project, private=false, rel ≥0.34; OR both unprojected, owner=user, basis=quoted, private=false, rel ≥0.5. Never across Projects. Items from other conversations older than 30 days are not used for suppression; they may be rendered as CONNECT material ('earlier (Mar 2026) you concluded X').

OBVIOUS_FOR_USER is DEFERRED behind flag c4.obvious and enabled only for explicit expertise after the expert-rater study. Embeddings remain an optional matcher behind the same interface.

### Evidence

This is the mechanism most tied to the churn hypothesis, so both failure directions matter: re-raising what the user already considered, and deleting genuine advances. The REJECT minority wins on the matcher and on deletion because they produced counterexamples, including the spec's own GOOD/BAD pair. Prevention through a stance-aware digest costs nothing and addresses the Expert User's paraphrase concern better than post-hoc lexical matching. The judge covers the paraphrase band. OBVIOUS_FOR_USER depends on expertise accuracy that D3 hasn't validated, so shipping it now risks silent underhelp; it is deferred rather than rejected. Scope rules come from the Privacy critic's verified leak (a marriage/custody item surfacing in a vendor-pricing Project).

### Test

(1) Spec pair verbatim: considered 'incumbents could copy our features' ⇒ 'The unresolved issue isn't whether they can copy features; it's which assets require time to accumulate' survives, and 'Have you considered a big AI company could just copy you?' is removed. (2) Paraphrases 'Could a big lab just clone this?' and 'What about the risk that OpenAI replicates it?' are caught (judge). (3) The vaccines correction, the collider-bias contribution past SES, the constancy advance, a recap of three risks, and 'tell me more about that moat' all survive. (4) Weak dismissal ('copying doesn't matter, we're first') ⇒ a challenge to the reason is allowed. (5) Labelled set of ≥300 (sentence, considered, stance, expertise) pairs across 8 domains: REDUNDANT precision ≥0.9, paraphrase recall ≥0.7. (6) Leak probe: custody and ACME entries absent from the Project-beta prompt. (7) Hidden-ground-truth reactive persona: already-considered repetition ≤0.5× the B+ arm.

### Reversal conditions

ABLATION: if the gate (on top of the avoid list) reduces blind-rated already-considered repetition by <3pp absolute while wrongful suppression is >5%, remove detection and keep prevention only (the Adversarial phase-1 position). Enable OBVIOUS_FOR_USER if expert raters mark ≥25% of contributions 'knew this' and the flag reduces that by ≥30% without raising the 'wrong' rate.


## D10. Reasoning ledger substrate, attribution, correction, Mind Graph split, Logos

**Implementation status: PARTIAL.** Done: lexical auto-links deleted; grounding with clause-scoped negation polarity; owner=unknown never rendered as theirs; disputes on correction; corrections API (edit/disown/retract/restore/delete). Not yet: reasoning_moves (append-only) replacing revisions jsonb; origin/origin_ref/attribution_conf/private/topic_key columns; tombstones; echo/reported-speech/hedge grounding rules; supersession on change of mind; staleness/dormancy; SQL-scoped loading; PII scrub; historyView for RETRIEVE; the Mind Graph split (a precondition the council set for enabling ledger writes in production — see Risks).

### Competing proposals

(a) Straw: separate reasoning_entries/links tables with revisions jsonb; lexical grounding ⇒ owner; bridge to the Mind Graph; stop minting reasoning-type nodes. (b) Memory Designer: event-sourced reasoning_moves; origin/stance/basis; strict grounding (coverage, echo, reported speech); adoption as a move on the same entry; tombstones; staleness; relation refs from the reader; substrate module with Logos mappings. (c) Architect: stance/register/basis, with adoption creating a derived_from user twin. (d) Adversarial Critic: minimal kinds, no lexical auto-links. (e) Red Team: supersession for change of mind; a correction targets the prompt manifest; devil's advocate ⇒ entertains. (f) Privacy: scoped queries, private flag, cascades, PII scrub, Memory page CRUD. (g) Domain: constraint/option kinds, contextKey.

### Disagreement

All approve separate tables. Adoption: the Architect wants a derived_from twin, the Memory Designer a move on the original entry. Schema weight: the Memory Designer's full event sourcing vs the Adversarial Critic's minimal kinds and no auto-linking. contextKey (Domain) vs Project plus similarity.

### Final decision

TABLES (RLS deny-by-default; all in export, delete and forget-all)
- reasoning_entries: user_id, id, kind ∈ {claim, assumption, evidence, question, hypothesis, alternative, objection, decision, uncertainty, conclusion, constraint, option}, text ≤280, origin ∈ {user, socria, external, unknown} (immutable except a user 'reattributed' move), origin_ref (reported:<role≤24> | pasted | attachment:<id>), attribution_conf (quoted 0.9 / paraphrased 0.7 / inferred 0.4, never raised by repetition), conversation_id, project_id, turn, private bool, mind_node_id, topic_key, status ∈ {open, settled, rejected, superseded, disputed, retracted, dormant}, projected user_stance, socria_stance, touch_count, last_touched_at. Drop revisions jsonb.
- reasoning_moves (append-only; the only way stance, status or text change): entry_id, actor ∈ {user, socria, external, system}, act ∈ {raised, asserted, entertained, asked, accepted, rejected, revised, resolved, reopened, withdrew, corrected, disputed, reattributed, forgotten}, basis ∈ {quoted, paraphrased, inferred, ui_edit}, quote ≤200 (required for actor=user basis=quoted), reason ≤200, prev_text, conversation_id, turn, at, idem_key UNIQUE.
- reasoning_links: add asserted_by ∈ {user, socria, inferred}, conversation_id, status, surfaced_at.
- reasoning_tombstones: fingerprint, scope ∈ {not_mine, forgotten}.

LINKS: lexical auto-linking (linksForTurn at 0.3/0.55) is deleted. Links come only from (a) user-stated relations (rejected_because with their reason, changed_because on revision) and (b) readState relation refs by digest id, max 8, where 'contradicts' is accepted only between two user-origin quoted entries and surfaced once (surfaced_at).

GROUNDING: origin=user only if
- the quote is verbatim in speech(latest), not in a quote/paste/attachment span
- the quote has ≥3 content terms
- coverage (share of the text's content terms in the quote) ≥0.5
- the quote has no ≥8-word n-gram and sim <0.6 with the last 3 Socria turns or Socria-owned entries
- the quote lies outside reportedSpans
Otherwise: reported/pasted ⇒ external; echo of Socria or a pointer quote ('the pricing thing you said') ⇒ a user 'accepted' MOVE on the Socria entry; otherwise unknown. 'asserted' only for an unhedged first-person quote (no maybe/might/wonder/perhaps/not sure/'?'); devil's advocate/suppose/hypothetically/steelman ⇒ entertained; paraphrased basis capped at entertained.

ADOPTION = a move on the SAME Socria entry. Socria never says 'as you pointed out' about it.

CHANGE OF MIND: a twin merge requires samePolarity and no new number/date/entity. Otherwise create a new entry, supersede the old one, and link changed_because with the user's reason.

CORRECTION (before the digest):
- misread ⇒ 'disputed' moves on items from the last promptManifest (Socria entries, positions and graph nodes it relied on) with sim ≥0.3 to the correction text. The user's own quoted entries are disputed only if named. The reader returns corrects='cN' ⇒ a 'corrected' move with prev_text.
- misattributed ('I never said X') ⇒ user-origin entries in the conversation with sim ≥0.5 are reattributed, plus a not_mine tombstone.
- disputed text is redacted after 30 days.

STALENESS: last touch >45 d renders as 'earlier (Mon YYYY) they held X'. Untouched >90 d ⇒ dormant (excluded unless same project and sim ≥0.5). Nothing is auto-deleted by staleness. owner=unknown entries are conversation-scoped with a 30-day TTL.

LOADING: loadLedger is an SQL-scoped query per the D9 eligibility, LIMIT 150, indexed (user_id, project_id, last_touched_at) and (user_id, entry_id, at).

PII: before persisting, scrub emails, phones, URLs with query strings and digit runs ≥6; the reader refers to third parties by role.

RETRIEVE renders a historyView of ≤10 ordered moves (date, actor, act, text, their reason), ≤400 tokens, or 'RECORD: nothing recorded about <focus>'.

APIs: GET/PATCH/DELETE /api/reasoning/:id (Not mine / Edit wording / Forget ⇒ tombstone) plus a 'Your reasoning' Memory-page tab. Logos edits ⇒ moves with basis=ui_edit.

CASCADE on conversation delete: its moves; entries left without moves; links touching them; its core4_state, core4_turns and capability_evidence.

MIND GRAPH SPLIT (precondition for enabling ledger writes in production): the gate enforces an allowlist for surface core-4 {Person, Organization, Place, Project, Goal, Plan, Preference, Concept, Source, Event, Experience, Decision (final only, via promotion)}. route.ts stops passing Socria's reply as extractable text (fenced <socria_context> non-extractable). The Core 4 Mind Graph render excludes Belief, Assumption, Question, Uncertainty, Insight and Evidence. Legacy nodes are kept, labelled legacy, never deleted, and imported only as owner=unknown. Promotion: a user-origin quoted decision/goal ⇒ remember({candidates}) through the existing corroboration gate, setting mind_node_id.

LOGOS: lib/reasoning/substrate.ts exports ReasoningNode/ReasoningEdge plus KIND_TO_LOGOS and REL_TO_LOGOS tables. toLogosGraph(entries, links, scope) excludes private and unknown entries and out-of-scope items, carries origin, and selects ≤16 nodes by project, then degree, then recency. The Logos sanitizeMap change to preserve origin is DEFERRED until Logos consumes the export. Until then, the export is not wired into any Logos room.

### Evidence

The spec's CRITICAL requirements are attribution fidelity, uncertain beliefs not becoming established ones, correctability and a shared substrate. Verified failures: any ≥8-char substring currently grounds the text; echoes and pasted third-party text become user-owned ('> I think we should fire Dave'); a change of mind merges into the old position at 0.95; a correction disputes the user's own correct words; deleted conversations keep surfacing. An append-only moves table is the least-complex design that makes correction, history (RETRIEVE without confabulation) and change of mind honest, so the Memory Designer wins over the straw's jsonb. Adoption-as-move beats the derived twin because it adds no duplicate entry and cannot fail to link. The Adversarial Critic wins on deleting lexical auto-links: fabricated structure presented as the user's reasoning is worse than none. contextKey is deferred as fragmentation-prone; Project plus similarity covers the multi-client case.

### Test

Hostile-reader arm (fabricated quote, a quote copied from Socria, 'asserts' on a '?' sentence, a third-party claim without its prefix) ⇒ invariants hold 100%.
Scenarios:
- echo trap ('You said the moat is data — I'm not convinced') ⇒ a Socria entry plus a user 'rejected' move with the reason.
- assent ('yeah that makes sense') ⇒ origin stays socria.
- 'my cofounder thinks we should raise now' ⇒ external.
- 'I wonder if it's regression to the mean' ⇒ never under positions.
- targeted correction ⇒ only the targeted entry disputed.
- 'I never said churn was the main risk' ⇒ reattributed plus tombstone, and no 'you think churn' in the next 4 turns.
- March→May revision ⇒ RETRIEVE cites May with the QA reason.
- 120-day-old position never rendered as current.
- retry POST ⇒ identical row counts.
- conversation delete ⇒ 0 rows referencing it in all 5 tables and no 'you raised X' in the next chat.
- Logos export excludes private entries.
Human attribution audit of 200 entries: Socria-idea-as-user ≤1% (hard), owner/stance error ≤5%.

### Reversal conditions

If strict grounding sends >40% of human-judged genuine user considerations to unknown, lower coverage to 0.4 (never below). If reader relation refs produce contradiction precision <0.85 (expert raters), disable cross-time tension surfacing. If cross-session retrieval hit rate is <10% after 8 weeks, stop injecting cross-conversation entries (storage only for the user's view).


## D11. Outcome labels and their use in selection

**Implementation status: PARTIAL.** Done: explicit outcomes only feed selection (landedBadly, diminishing), inferred outcomes capped at 0.7; tooDirect → WAS_TOO_DIRECT. Not yet: deterministic observable events (fix_failed, adopted, …); frustration target; the loosen/tighten-form rules as specified; module-boundary purpose-limitation tests; drift monitor.

### Competing proposals

(a) Straw: 11 labels from readState's lastOutcome plus explicit signals; bounded rules (two too_indirect/redundant ⇒ exclude the family); no RL. (b) Adversarial Critic: store observable events instead; 11 labels only as an offline annotation schema. (c) Architect: multi-axis labels, quote-gated, analytics-only until validated. (d) Offloading, Agency and Friction critics: asymmetry, where inferred labels may only loosen and only explicit feedback may tighten. (e) Red Team and Domain: add MISREAD_USER, frustration target, FIX_FAILED, ADOPTED, REJECTED_WITH_REASON; hedge handling. (f) Learning Science: an experience channel vs a learning channel. (g) Evaluation Scientist: disable outcome rules in scripted mode, and propensity logging.

### Disagreement

Whether unvalidated inferred labels may affect select() at all (Architect and Adversarial say no; the straw and Expert User say bounded use), and which direction adaptation may go (Offloading wants a mirror rule toward more friction for TOO_DIRECT; Friction and Agency say only explicit feedback may tighten).

### Final decision

RECORD per turn in core4_turns:
- deterministic observable events: explicit_positive, explicit_negative, asked_more_direct, asked_less_direct (tooDirect), said_redundant, corrected_socria (misread), socria_disputed, continued_thread, switched_topic, abandoned, fix_failed (re-pasted identical error), adopted (artifact diff incorporates the critique or uptake of Socria-specific tokens), next_turn_attempt, next_turn_new_task_without_attempt
- the reader's 11-way label plus MISREAD_USER, with confidence, source and frustration target ∈ {socria_move, task, world}

HEDGES: 'a bit', 'but', 'still', 'sort of' ⇒ PARTIALLY_HELPED or null. 'makes sense / got it' ⇒ HELPED at most, never REVEALED_MASTERY.

SELECTION may read ONLY explicit-sourced events, through two rules:
(a) LOOSEN: ≥1 explicit friction event (said_redundant, asked_more_direct, first-person frustration targeted at socria_move) ⇒ exclude that move family for the next 2 turns.
(b) TIGHTEN FORM ONLY: an explicit tooDirect under an explicit practice or comprehension goal ⇒ for that concept prefer form=worked_example/with_cause and allow one practice item.
Outcome rules NEVER add or remove a withhold; only the user's words or contract can. Under an explicit practice contract an inferred TOO_INDIRECT raises the ladder rung by one and does not end practice. REJECTED_WITH_REASON is not friction.

The reader's labels are analytics-only until validated: κ ≥0.6 against 2 human annotators on ≥300 turn pairs, collapsed to 5 families if the 11-way κ is lower.

OTHER RULES:
- scripted-mode eval sets C4_EVAL.ablate includes outcomeRules
- no per-user outcome aggregates feed allocation
- no purpose outside select() and aggregate eval: a module-boundary test forbids lib/lifecycle.ts, lib/one-prompt.ts and app/api/cron/* from reading outcome columns
- drift monitor: weekly ANSWER-family share among explicit-practice users vs demonstrated-unassisted events; alert on a +15pt rise without a matching capability rise

### Evidence

Spec: 'do not overclaim causality from one turn' and 'must not learn users like answers → always answer'. Next-turn affect is biased against desirable difficulties, and verified mislabels include 'you misunderstood me' ⇒ CONFUSED_USER and 'deploy failed again' ⇒ FRUSTRATED at Socria. The Adversarial and Architect minority wins on keeping unvalidated inferences out of selection. The Friction and Agency asymmetry wins over the Offloading mirror rule for withholding, because a noisy label must not create friction. The Offloading concern survives as a form-only tighten on EXPLICIT tooDirect, which the Offloading Critic's own evidence (overreach complaints never reach the data) shows is needed to avoid one-sided drift.

### Test

(1) Property test: inject random inferred WAS_TOO_DIRECT on 200 turns ⇒ select() never produces more withholding or questions. (2) 'Ugh, the deploy failed again' after a successful fix ⇒ no friction event targeted at socria_move. (3) 'That helped a bit but I'm still confused' ⇒ PARTIALLY_HELPED. (4) 'You gave it away, I wanted to figure that out' ⇒ tooDirect explicit, and the next practice item is at hint level. (5) Boundary test for forbidden module reads. (6) Scripted-mode decisionDelta shows no outcome-driven changes. (7) Label validation report in CORE-4-EVALS.md.

### Reversal conditions

Allow a validated inferred label (κ ≥0.6 and precision ≥0.8) into the loosen rule only. Never allow inferred labels to tighten. Kill the tighten-form rule if it measurably lowers blind preference in expert scenarios.


## D12. Capability evidence: what counts, keys, independence, use

**Implementation status: PARTIAL.** Done: events only from a verdict (exact, or checker ≥0.85); needed_answer removed; independence counted only across conversations. Not yet: answerability/sensitivity gates, Concept-id anchors with a stability flag, assistance from an item tracker, UNASSISTED_LATER naming, TTLs, mastery release in selection.

### Competing proposals

(a) Straw: conservative deterministic events (unassisted, assisted, caught own error, demonstrated). (b) Evaluation Scientist: rename in-product events; independent capability only from designed probes and the trial; assistance = max over the concept. (c) Learning Science: an item-tracker 0-5 assistance scale; INDEPENDENT needs ≥24 h, a new item and no assistance; slip vs misconception; self_detected_error. (d) Adversarial Critic: record only computed correctness; the keys are unstable (4 phrasings give 4 keys), so no user-facing surface. (e) Privacy and Red Team: drop needed_answer; never for judgment, reflection or sensitive work; TTL; cascade. (f) Offloading and Friction: capability may only release scaffolding or lower explanation depth, never withhold; no probes.

### Disagreement

Whether in-product capability events are worth storing at all before keys are stable (the Adversarial Critic says no), and whether they should be shown to users (Privacy and Agency require visibility of stored data; Adversarial and Expert User fear condescending summaries).

### Final decision

RECORD an event only when ALL of these hold:
- answerability=determinate
- work ∈ {practice, verification, execution, explanation, diagnosis}
- a verdict exists from the exact path or a checker at confidence ≥0.85 (never readState.attempt alone, never self-report)
- persistPolicy=full
- the conversation is not sensitive

EVENT: {concept_anchor: Mind Graph Concept id or ledger topic_key (lexical key allowed only with anchor_stable=false), kind ∈ {correct_attempt, error(errorClass ∈ slip|misconception|missing_prerequisite|incomplete), self_detected_error (no prior flag), corrected_after_feedback}, assistance 0-5 = max ladder level delivered on that anchor in this conversation before the attempt (from the item tracker), itemRelation ∈ {same_item, isomorphic, transfer}, since_last_assist ∈ {same_session, prior_24h_plus, never}, preceded_by {turn, intervention, form}, project_id, conversation_id}. needed_answer is REMOVED.

VIEWS (never combined):
- TASK = completed
- AUGMENTED = completed with assistance ≥1
- UNASSISTED_LATER = assistance 0 AND since_last_assist ∈ {prior_24h_plus, never} AND itemRelation ≠ same_item AND anchor_stable=true
The term 'independent capability' is reserved for the D16 human study.

USES:
- lowering explanation depth / skipping concepts with ≥1 UNASSISTED_LATER
- a start rung one lighter under an explicit practice contract
- mastery release (≥2 UNASSISTED_LATER across ≥2 conversations ⇒ that sub-step is AI_EXECUTES even under a learning contract)
Never a withhold input, never probes or explain-back requests outside a practice contract, never mentioned in replies unless asked.

VISIBILITY: raw events are listed on the Memory page as dated evidence lines with per-event delete, plus export. No summaries, scores or levels. TTL 365 days; errors 180 days. Cascade on conversation delete. Never visible to collaborators.

### Evidence

Spec: separate task, augmented and independent capability; 'no fabricated psychological precision'. Verified: assistanceOf reads only the previous turn; conceptKey fragments; 'just tell me' writes a deficit-shaped needed_answer about a personal marriage decision. The Adversarial and Evaluation minority wins on restricting claims. Storage stays, but gated on computed correctness, because the longitudinal metric can't exist later without early events, and the privacy cost is bounded by gating and TTL. Visibility of raw events satisfies the spec's correctability and privacy requirements without condescending summaries.

### Test

(1) EXPLAIN two turns before a correct attempt ⇒ assistance ≥1. (2) Identical problem in a new conversation within 24 h ⇒ not UNASSISTED_LATER; a different item after 3 days at assistance 0 ⇒ UNASSISTED_LATER. (3) 'Just tell me what to do' about moving countries ⇒ 0 rows. (4) 'makes sense, got it' ⇒ 0 rows. (5) Key stability: 20 paraphrases of one concept map to one anchor ≥80% before any UNASSISTED_LATER is used in selection. (6) Human audit of 150 events: kind correct ≥90%. (7) Grep test: 0 unprompted capability or mastery language in replies across the corpus.

### Reversal conditions

If anchor stability is <0.8 after the Concept-id bridge, stop using events in selection (analytics only). If the D16 human study shows UNASSISTED_LATER does not predict AI-removed post-test performance (r <0.3), redefine or drop the view.


## D13. Verify Mode: exact path safety, checker scope, verdict confidence, leakage

**Implementation status: PARTIAL.** Done: exact path only on expressions the person posed (anchored), excluding dates/ranges/versions/doses/money; final stated value compared; 'incorrect' asserted only for exact or ≥0.85; checker runs only on withhold+attempt with 1.5 s timeout; the expected value is never given to the reply model under a withhold. Not yet: expression-answer equivalence at random points (+C for integrals); running the checker speculatively in parallel with the reader; checker-vs-reader disagreement ⇒ unknown; release uses the checker's expected value.

### Competing proposals

(a) Straw: run on HUMAN_PRACTICES/AI_VERIFIES with an attempt; exact path via logos-math; separate checker; verdict-only pass-through. (b) Domain and Red Team (executed): the exact path evaluates dates, ranges and doses ('2024-09-23' ⇒ 1992; 5 mg/kg ⇒ -679) at confidence 1, misses 'Compute 17*23.', and runs on all domains. (c) Learning Science: final-value extraction, symbolic equivalence, errorClass, a confidence floor on 'incorrect'. (d) Offloading: run verify in parallel; the checker verdict wins over the reader, and a disagreement means unknown. (e) Expert User and Agency: hide the solution only when withheld; on release, pass the solution so it stays consistent. (f) Adversarial: an 'incorrect' needs ≥0.85, otherwise hedge.

### Disagreement

Whether to run the checker whenever the user verifies (the straw and Offloading Critic) or only under a withhold (Friction, Adversarial and Red Team). Otherwise broad agreement.

### Final decision

CHECKER RUNS only when withhold≠null AND an attempt is present. It starts speculatively in parallel with readState when the attempt detector fires (requestScope=check, or the prior Socria turn posed a practice item, or the message contains an expression answer), with a 1.5 s timeout. Without a withhold, the frontier generator verifies in its own reply.

EXACT PATH runs only if all of:
- answerability=determinate
- artifact=calculation
- the expression comes from USER messages, anchored after compute|evaluate|calculate|what is|find|=\s*\?
- function names are word-bounded
- no date, range, version, page, phone or unit pattern (\d{4}-\d{2}-\d{2}, \bpp?\.\s*\d+-\d+, \d+-\d+\s*(%|min|minutes), v?\d+\.\d+\.\d+, mg|kg|%|$ units)
The attempt is compared on its FINAL stated value (after the last '=', 'is' or 'answer'). Expression answers use equivalence: evaluate both at ≥20 random in-domain points, rel tol 1e-9, ≥15 valid points, and accept a constant difference for indefinite integrals.

CHECKER returns {verdict ∈ correct|incorrect|partial|unknown, confidence, location, errorClass ∈ slip|misconception|missing_prerequisite|incomplete|unknown, expected? (optional: first invalid step for proofs, failing input for code)}. It does not run on contested or open work (route to CRITIQUE).

VERDICT RULES:
- 'incorrect' is asserted only if method=exact or confidence ≥0.85; otherwise the directive is 'I get something different at <location>' with no assertion of wrongness
- 'unknown' must be said, never guessed
- checker vs reader disagreement ⇒ unknown
- only the checker's verdict (never the reader's) feeds capability evidence

GRANULARITY under withhold: start at level 2 (location plus errorType); escalate per the D6 ladder.

RELEASE: on an explicit release, pass the checker's expected value, or recompute via the exact path, so the revealed answer matches the verdict.

Never say 'computed exactly' unless the exact path ran. The expected value is never persisted to state, trace, ledger or Mind Graph candidates. ARCHITECTURE.md documents that the frontier generator can re-derive answers and that the guard is the backstop.

### Evidence

The verified false 'incorrect (computed exactly)' on a correct pediatric dose, and on a correct growth rate, is the most trust-destroying failure in the review. Gating the exact path fixes it deterministically. Separation only buys anything when something is withheld; elsewhere it adds a serial call and forces a weaker model's verdict on a stronger one. The confidence floor protects experts and learners from false negatives, the costliest error for learning.

### Test

(1) 60-case exact-path suite: 30 genuine items ('Compute 17*23.', 'Evaluate 3^4-2*5', '17×23 = 381?') all verdicted correctly; 30 noise items (log dates, ISO dates, ranges, versions, doses, page ranges) ⇒ 0 verdicts. (2) '2^5 − 16?' answered '32 minus 16 = 18' ⇒ incorrect. (3) 5/(5x) for d/dx ln(5x), and sin(2x) for d/dx sin²x ⇒ correct. (4) ∫sin x dx = 1−cos x + C ⇒ correct. (5) Practice ∫₀¹x²dx = 1/2 ⇒ the reply never contains 1/3, 0.333 or 0.33. (6) A persistence-leak test for the expected value '42'. (7) ≥150-attempt set: false-incorrect ≤1% on exact and ≤3% on the checker; leak rate on withheld items ≤3% and ≥50% below a solution-in-context ablation.

### Reversal conditions

If the checker's false-incorrect rate is >3% on ≥50 expert-level items, route withheld checks to the frontier model as checker. If separation does not reduce leaks ≥50% vs the ablation, document that and drop the separate call (guard only).


## D14. Memory consolidation, cross-conversation preferences/contracts, sensitive-context protection

**Implementation status: PARTIAL.** Done: thread memory and journey no longer injected or extracted for Core 4 (title-only extraction); forget-all clears the five Core 4 tables. Not yet: agency_contracts table and chips; sensitivity flag and persistPolicy; Memory-page sections as specified; forget-all clearing mind_* with tombstones; Project-scoped constraint entries; the multi-session continuity regression gate.

### Competing proposals

(a) Straw: USER MEMORY = Mind Graph; state/ledger/capability/turns separate; stop thread memory, journey and client extraction for core-4; forget-all clears everything. (b) Agency Advocate: an agency_contracts store (user and Project), visible, editable, binding flag. (c) Red Team: stated Preference nodes become loosen-only memory contracts. (d) Friction and Expert User: explicit interaction preferences are persisted immediately, without 2-conversation corroboration. (e) Privacy: retiring the journey drops the only sensitivity signal (regression), and forget-all doesn't clear mind_*. (f) Domain: Project-scoped constraints must survive retiring thread memory. (g) Memory Designer: the extractor split, render filter, cascade and no duplicate representations.

### Disagreement

Whether stored contracts may tighten (the Agency Advocate says yes for Project and binding contracts; the Red Team says memory contracts should only loosen), and user-level vs Project-level scope.

### Final decision

TABLE agency_contracts: user_id, id, project_id|null, conversation_id|null, kind ∈ {directness_answer, no_questions, brevity, skip_basics, no_answer, practice, quiz, authorship, agency_boundary, dont_comment_on_usage}, quote, binding bool, source_ref, created_at, revoked_at.

CREATION: only from a STRONG/loosening explicit signal carrying horizon words, from Project instructions, or from a UI mode. Shown as a non-blocking chip 'Saved · Undo', never a chat question.

SCOPE:
- LOOSENING kinds may be user-level
- TIGHTENING kinds (no_answer, practice, authorship, agency_boundary) are Project- or conversation-scoped only, never user-global
- on the first use of a tightening contract per conversation, one disclosure clause says where to change it

MIND GRAPH: stated Preference nodes about how Socria should help compile to loosening contracts only. Inferred preferences are never persisted across conversations.

PRECEDENCE: per D2.

MEMORY PAGE: sections 'About you' (graph), 'Your reasoning' (ledger), 'Evidence' (capability), 'How Socria helps you' (contracts), each with per-item delete. Memory-surface links in Core 4 point to these, not to the journey.

SENSITIVITY: readState returns sensitive:boolean using the existing 'reflecting' definition, plus a deterministic lexicon backstop (health/mental health, diagnosis, medication, grief, divorce/custody, sexuality, religion, immigration status, criminal/legal dispute, debt). It is sticky once true. It sets persistPolicy=conversation_only (D15) and remember(private:true).

FORGET-ALL clears all five Core 4 tables, agency_contracts and mind_* (with tombstones so extraction doesn't re-mint). Fix the code rather than the copy.

PROJECT-SCOPED constraint entries (ledger kind constraint), pinned first, cap 12, render as active constraints for the Project.

Thread-memory and journey data for existing Core 4 conversations stop being injected but remain exportable and deletable. Auto-title and privacy classification keep working. No field is duplicated between the state block and the graph/ledger renders.

GATE: retirement ships only after the multi-session continuity regression passes.

### Evidence

Spec phase 11 asks for no duplicated or contradictory state. The product principle 'you get better at helping me over time' fails if 'stop asking me questions' must be restated in every conversation, as the Friction and Expert User reviewers noted. Red Team's loosen-only principle protects against stale tightening, and the Agency Advocate's need to keep 'hints only, I'm training' is met at Project scope with disclosure. Privacy verified that the sensitive-context protection lives only in the paths being retired, so carrying it forward is mandatory to avoid a regression. Forget-all not clearing mind_* contradicts the straw's own claim, and the user's words 'forget all' are explicit.

### Test

(1) Session 1 'stop asking me questions, always' ⇒ session 2 turns 1-3 contain 0 questions; the chip is visible; removal restores normal behaviour next turn. (2) A global 'direct answers' preference plus Project 'hints only' ⇒ the Project governs in-project and the global preference applies outside. (3) 3-session trip plan (wheelchair, ¥150k, vegan) and a 3-session fiction project ⇒ ≥90% constraint recall in session 3. (4) >30-turn conversation honours an early commitment without thread memory. (5) Forget-all completeness across 5 Core 4 tables, contracts and 6 mind_* tables. (6) Grief turn at turn 6 ⇒ sensitive sticky; rows private; no capability evidence.

### Reversal conditions

Restore a compact prior-session summary block if longitudinal continuity scores fall below the current system's. Scope loosening contracts to Project if >15% are revoked within one session of being created.


## D15. Privacy of human modelling: persistence policy, scope, retention, consent, purpose limitation

**Implementation status: PARTIAL.** Done: content-free traces; 180-day trace purge at write time; eval hooks ignored in production; export/delete/forget coverage with tests; no training use. Not yet: persistPolicy (none / conversation_only) and 'off the record' handling (the signal is read but not acted on); research_consent column; daily retention cron for the other tables; module-boundary tests; the data-inventory table with a completeness test.

### Competing proposals

(a) Straw: content-free telemetry, ledger visible/deletable, no personality or mental-health fields, consent flag default off, trace retention 180 days. (b) Privacy critic (verified): no persistence control, cross-context leakage, no cascades, retention only on turn 1, consent only in comments, eval hooks without production guards. (c) Expert User and Domain: a per-Project 'no reasoning record' mode for confidential work. (d) Evaluation Scientist: a consented validation sample tier and k-anonymous cohort aggregates. (e) Offloading: capability/dependency data never visible to collaborators, no reliance score.

### Disagreement

Minimal. The Evaluation Scientist wants content-bearing validation samples; Privacy wants strict opt-in. Resolved by an explicit consent scope.

### Final decision

persistPolicy ∈ {full, conversation_only, none}, sticky per conversation, stored in core4_state.
- none (from 'off the record' / 'don't remember this' until 'you can remember this'): no ledger, capability or free-text state rows and no Mind Graph write; the reply acknowledges it in one clause with undo.
- conversation_only (sensitive, or a Project 'don't keep a reasoning record' toggle): ledger private=true and conversation-scoped, no capability, remember(private:true).
- 'forget that' deletes the user-origin ledger entries from the last turn and tombstones graph nodes minted from it.

COLUMNS: user_profiles.research_consent jsonb {version, scopes ⊆ [aggregate_traces, content_review, training], grantedAt}, default null, included in export. The only function allowed to copy core4/reasoning rows out of production filters by scope (tested). Operational aggregates use a rotating salted user hash, no conversation_id, no text, and k ≥20 per cell. Content review, human eval and training are opt-in only, and the eval export tool refuses rows without content_review consent.

DAILY RETENTION CRON: core4_turns >180 d; ledger owner=unknown >30 d, owner=socria >180 d; capability >365 d (errors >180 d); state compaction >90 d; disputed-text redaction >30 d. Ledger entries in conversations inactive >180 d are excluded from prompts but remain viewable.

PURPOSE LIMITATION: module-boundary tests (D11). Affect labels never leave the conversation row.

EVAL HOOKS: globalThis.__socriaModelClient and __socriaTrace are ignored when NODE_ENV=production (unit test).

MODEL-PROVIDER MINIMISATION: only D9-eligible ledger lines go to the reader and guard.

DOCUMENTATION: a data-inventory table in docs/CORE-4-ARCHITECTURE.md (store, text fields, purpose, retention, readers, user control) and a test that every column of the new tables appears in it.

### Evidence

Spec phase 13 requires data minimization, correctability, deletion, 'no silent permanent storage of everything', and no training reuse without consent. Verified leaks and non-cascading deletes mean the straw's privacy section was aspirational. These controls are deterministic, off the critical path (cron, waitUntil), and reversible. The confidential-work mode lets experts adopt Core 4 on high-value work.

### Test

Privacy family P1-P16 asserted deterministically against the fake Supabase plus prompt capture. Must hold:
- zero inserts with persistPolicy=none
- no cross-Project lines in any model input
- zero rows after conversation delete
- a pasted '> fire Dave' is not stored as user
- retention cron with a fake clock
- consent-gated export returns 0 rows for non-consenters
- export and forget completeness 100%

### Reversal conditions

Relax the unprojected cross-conversation rule (sim ≥0.5, quoted, user-origin) only if users without Projects report continuity loss in the in-situ study AND leak tests stay at 0. Tighten the k threshold if re-identification risk is found.


## D16. Evaluation harness validity

**Implementation status: PARTIAL.** Done: stepwise harness, blind A/B packets with the key kept apart, deterministic metrics, human-pack page, pre-registered experiments doc, and the blinding leak found by players fixed. Not yet: arms A1 (equalised token caps), A2/B+ (self-critique pass — the PRIMARY comparator), A3, ablations, oracle/degraded-reader arms; dev/test split and freezing; reactive simulated users; k=3 sampling; independent detectors; judge calibration; per-stratum non-inferiority; meta-eval with seeded degradations. Done since: the Phase 0 tautology the council found (an assertion OR-ed with true, so it could not fail) is replaced by two real assertions (explicit practice keeps the redo; a guessed learning goal gets the correction), and a test-lint now fails on any such assertion — it found and fixed a second one in `collab.test.mjs`.

### Competing proposals

(a) Straw: ≥100 scenarios with behavioural properties; arms core4 vs strong-prompt baseline; stepwise Claude roles; deterministic metrics, blind pairwise LLM, human export. (b) Evaluation Scientist: compute- and tool-matched B+, ablations, oracle and WoZ arms, held-out blind-authored split, questionAppropriate and contested fields, an adaptive simulator, stepwise controls, independent detectors, judge controls, pre-registration, harness meta-evaluation. (c) Friction, Red Team and Expert User: reactive users with patience budgets and abandonment; a trap corpus. (d) Learning Science and Offloading: sandbox users can't learn, so a human delayed-transfer study; a learning-science section in the baseline; humanOwned and mustNotRewrite fields. (e) Domain: missing strata (creative, drafting, role-play, planning, contested econ, collision traps, compound, attachments), per-stratum non-inferiority. (f) Memory and Privacy: ledger expectations, a hostile reader, a privacy family. (g) Several: fix the tautology at test/core4-p0-reproduce.test.mjs:35.

### Disagreement

Broad convergence. The only tension is effort: human studies are costly, and the reviewers agreed on pre-registration plus sampling rather than exhaustive human coverage.

### Final decision

ARMS
- A1 strong prompt, maxTokens equalised to the Core 4 ceiling (runner.mjs currently 900; set to the same per-mode caps), verbatim prior transcripts and a summary-memory variant
- A2 = B+ (PRIMARY comparator): A1 plus one self-critique/revise pass against the same Human-First rubric, plus the logos-math tool, call-count matched to Core 4's median
- A3: A1 plus the deterministic trailing-question stripper only
- B: full Core 4
- ablations B−{novelty gate, D5 inferred half, state render, ledger, fineSelect/envelope, verify, guard model}
- B with oracle state
- B with a degraded reader (15% wrong work/artifact labels, 10% dropped consideredNow)
- hostile-reader arm
Add a learning-science section to the baseline prompt (worked examples first for new concepts, bottom-out after 2 failures, one practice item per turn, immediate correction of retrieval errors, no comprehension checks). An independent agent owns the baseline prompt with equal iteration rounds on the dev split. Both systems are frozen and hashed before the test split runs.

CORPUS
- stratified 50/50 dev/test
- ≥30 test scenarios authored blind to the straw and code
- consented real transcripts where available
- every turn has questionAppropriate ∈ {required, allowed, forbidden} (≥15% required)
- contested:true turns are judged only by blind humans
- new fields: humanOwned[], mustNotRewrite, mustNotClaimCorrect, mustIncludeCause, mustLocateError, noHintAfterNoIdea, mustNotCreditUser[], expect.ledger {mustAttributeToUser, mustNotAttributeToUser, mustHaveStatus, mustHaveReason, mustNotRender}
- new strata: creative ≥12, drafting-with-questions ≥10, role-play ≥6, multi-session planning ≥6, contested economics ≥6, lexical-collision traps ≥20, compound requests ≥8, expert-with-attachment ≥5, privacy P1-P16, long-horizon ≥10 scenarios with ≥8 sessions

MODES
- FIXED-PREFIX (only the final turn is evaluated) for controlled A/B
- REACTIVE: a separate agent with a hidden persona card (goal, knowledge state and buggy rules, considered set, patience 3, quit rules) replying to actual output
- outcome rules disabled in scripted mode

STEPWISE CONTROLS
- one fresh subagent per request
- hashed role cards; the generator card is identical and arm-blind
- no repo or scenario access
- maxTokens enforced by truncation
- chunked 2-12-char stream replay
- k=3 samples on a 30-scenario stratified subset
- all results labelled 'stepwise-Claude: directional, not production'

METRICS use independent detectors (never lib/core4 code). Friction: unwanted-interrogative rate on forbidden turns, under-asking on required turns, needless withholding, override-after-withhold, answer-first compliance, words before substance. Integrity: leak rate, false-correct and false-incorrect claims, wrongful-deletion rate. Attribution: misattribution. Expert: already-considered repetition vs the hidden set, novel-useful contribution (practitioner raters). Reactive: abandonment and turns-to-goal. TTFT and cost from live mode only.

JUDGES
- a cross-family judge where possible, both orders, length-controlled win rate, rubric in user-outcome terms
- arm-guessability >65% is reported as compromised
- judge-human agreement per metric ≥ human-human − 0.1, or the judge is dropped for that metric
- blind human eval: ≥3 raters per item, domain experts for expert/math/research, Krippendorff α ≥0.6, paired-scenario bootstrap CIs, ≥10 pairs per stratum
- per-stratum non-inferiority: the lower 95% CI of the Core 4 win rate vs B+ is ≥0.45 in EVERY stratum; a stratum that fails is published as a known failure

PRE-REGISTER in CORE-4-EVALS.md before the test run.
- primary endpoints: already-considered repetition and unwanted-interrogative rate on expert scenarios, and blind expert preference vs B+
- guardrails: leaks, under-asking, contribution correctness, false-incorrect, latency
Meta-eval: seeded degradations (inverted novelty gate, always-one-question, loose D2 regexes, unsafe D13 exact path, the old Socratic router at 4316b8d) must each be detected at p<0.05, and an A1-vs-A1 A/A run must show no difference, before any result counts.

Fix the tautology: replace `|| withholds(m) || true` with an explicit practice-contract assertion (withhold.reason==='practice_goal' and move ∈ {CORRECT-locate, HINT}), plus a test-lint rule failing on `|| true)` in assertions.

CORE-4-EXPERIMENTS.md: pre-registered human study. Pre-test; 2-3 assisted sessions over 2 weeks with arm B+ vs B; unaided delayed (≥7 d) near and far transfer at matched difficulty; n≈64 per arm for d=0.5. Experts: seeded-flaw detection with and without AI. Include the undeclared-learner CORRECT vs VERIFY-locate sub-study. The docs state that the sandbox cannot establish capability outcomes.

### Evidence

The spec requires beating the STRONGEST prompt and forbids relying entirely on LLM judges. As designed, Core 4 would win by construction: more calls, a calculator, a higher token cap, graders reusing questions.ts, and corpus expectations encoding the policy. Twelve reviewers converge on this. A falsifiable result is worth more to the product than a flattering one. The reactive mode is the only way to observe abandonment, the spec's churn outcome.

### Test

The harness meta-evaluation above: 5 seeded degradations detected, and A/A null.

### Reversal conditions

If B does not beat A2 on the primary endpoints, the architecture's extra components must be justified per ablation or removed (spec falsification). If the reactive simulator's abandonment ranking disagrees with human 'wasted my time' rankings (Spearman <0.6) on a 30-conversation calibration set, recalibrate patience budgets before reporting reactive metrics.


## D17. Latency, cost and length budgets

**Implementation status: PARTIAL.** Done: reader 2 s, checker 1.5 s, guard model 1.5 s, buffering only on withhold, per-stage timings in the trace. Not yet: live-mode budgets and alerting, the fast path, adaptive maxTokens from requested length, sentence-boundary truncation.

### Competing proposals

(a) Straw: no more critical-path calls than today. (b) Friction, Adversarial, Red Team and Evaluation: numeric budgets, buffer only on withhold, shorter timeouts, a fast path. (c) Expert User and Domain: per-mode length caps adapted to the requested length; never truncate mid-sentence; stream urgent turns and artifacts. (d) Expert User: a plan-then-write novelty arm. (e) Learning Science and Offloading: don't trade verify accuracy for latency on practice turns.

### Disagreement

The exact numbers differ slightly between reviewers (TTFT +300 ms to +800 ms), and the plan-then-write arm is contested.

### Final decision

LIVE-MODE BUDGETS, relative to A1 and enforced by per-stage timings in core4_turns plus alerting:
- streamed turns: TTFT p50 ≤ A1 + 600 ms, p95 ≤ A1 + 1.5 s
- fast-path turns: TTFT ≤ A1 + 150 ms
- buffered (withhold) turns: ≤25% of all turns and ≤10% in the expert/direct categories; total p95 ≤ generation + 1.5 s, with a visible working indicator
- readState: timeout 2 s with prior-state fallback; output ≤300 tokens; input ≤6k tokens (digest ≤12 lines); fallback rate ≤2%, broken out by transcript length
- checker: speculative and parallel, ≤10% of turns, 1.5 s timeout
- guard model: ≤15% of turns, 1.5 s timeout
- frontier regenerations: ≤5% of turns, max 1, only if elapsed <8 s
- cost per turn ≤1.3× Core 3.1's measured median
If a p95 budget is breached for 24 h, automatically widen the fast path and disable the speculative checker, but never on withheld practice turns.

LENGTH: maxTokens = max(move default, requested-length estimate), where 'N words' ⇒ 1.4N and 'full file / whole script / entire section / full derivation' ⇒ 3000, with a hard ceiling of 4000. Replies end at a sentence boundary; truncation ends at the last full sentence or a closed fence. urgency=high and artifact requests stream unless withheld.

The plan-then-write arm is DEFERRED to an experiment: adopt only if redundancy drops ≥30% for ≤0.6 s p50.

### Evidence

Latency hits every user on every turn, and the straw's worst case of about 30 s falls on the sophisticated users the product targets. The Friction and Adversarial numbers are adopted because they are enforceable and tied to fallbacks. Truncating deliverables (the old flat 500 cap and the current per-move caps) is a verified underhelp failure.

### Test

(1) E2E latency harness with injected delays (mini 800 ms; frontier TTFT 1.2 s at 40 tok/s) reporting p50/p95 by move type, as a CI gate. (2) 'just give me the regex for an email address' takes the fast path. (3) Truncation rate (no terminal punctuation or an unclosed fence at the cap) ≤1% per stratum. (4) 'Write out the full derivation of the ELBO' is complete. (5) guardRequired is false for non-withheld thinking-mode turns.

### Reversal conditions

Tighten buffering further if human raters in the in-situ study rate latency as the top complaint. Raise the cost ceiling only if B beats A2 by a pre-registered margin that justifies it.


---

## Deleted or deferred by the council

- DELETED: treating every regex hit as confidence-1 standing explicit. Weak-tier phrases can never withhold. Why: 25/29 false positives were verified.
- DELETED: withholding from inferred evidence at any confidence, and the router's decide/create/learn default withholds. Why: this is the verified source of every wrongful-withhold path, and it contradicts the spec's 'Socria doesn't decide what the user may know'.
- DELETED: the budget.ts blocker re-grant of a question after the budget is exhausted. Replaced by PROCEED_UNDER_ASSUMPTION. Why: it overrode frustration and explicit redundancy.
- DELETED: the CORE_4_PROMPT default-elicit and drip-feed lines. Why: they undo the allocator.
- DELETED: CognitiveState fields supportLevel, confusions and assumptions; free-text positions, tensions, openThreads and recentChanges; and inferred desiredAutonomy. Why: they have no consumer, or they duplicate the ledger without grounding.
- DELETED: LLM-emitted float confidences as decision thresholds. Replaced by basis-derived tiers. Why: they are uncalibrated fake precision.
- DELETED: the lexical novelty matcher deciding REDUNDANT on shorter-side overlap, and the hand-picked SYNONYMS map. Why: it fails the spec's own GOOD/BAD example in both directions and deletes corrections.
- DELETED: deterministic mid-reply deletion without a coherence floor, and canned fallback text on non-withheld turns. Why: it guts replies and puts tutor-voice boilerplate in their place.
- DELETED: buffering every PERSPECTIVE_MOVE and thinking-mode ANSWER. Buffering now happens only on withhold. Why: latency fell hardest on expert users.
- DELETED: lexical auto-linking in the ledger (responds_to, derived_from and rejected_because at 0.3/0.55). Why: fabricated structure presented as the user's reasoning.
- DELETED: revisions jsonb. Replaced by append-only reasoning_moves. Why: history could not be queried, and RETRIEVE confabulated.
- DELETED: the capability 'needed_answer' event. Why: it records a preference as a deficit and is a privacy harm.
- DELETED: RESEARCH, MODEL and VISUALIZE from the selectable enum. A privacy contract is kept in a types-only file. Why: dead code.
- DELETED: CALCULATE without actual logos-math evaluation. Why: it claims computation that never happened.
- DELETED: the strategy-switch targets REFLECTION→RESEARCH and DISCUSSION→MODEL/VISUALIZE. Why: the tools don't exist.
- DELETED: the checker running on non-withheld verification turns, and the exact path running on any numeric text. Why: extra latency, and a verified false 'incorrect (computed exactly)'.
- DEFERRED: the OBVIOUS_FOR_USER novelty verdict, behind flag c4.obvious. Why: it depends on expertise accuracy that isn't validated yet, and it risks silent underhelp. Enable it after the expert-rater study.
- DEFERRED: the model-based capitulation detector in the guard. A prompt directive and pushback scenarios measure the need first.
- DEFERRED: the plan-then-write novelty arm, to be an experiment only. Why: +0.5 s TTFT with no evidence yet.
- DEFERRED: the deterministic ledgerGaps() contributionCandidates finder. Why: it needs trustworthy links, which now come only from user- or reader-stated relations. Revisit after link precision is audited. Cross-session tension surfacing via reader relation refs IS kept.
- DEFERRED: user-level interactionPrefs learned from outcomes (≥3 concordant across conversations). Only explicit contracts persist for now. Why: outcome labels are unvalidated.
- DEFERRED: the per-reply 'already knew / useful' feedback control. Revisit after the harness exists.
- DEFERRED: contextKey on ledger entries. Project plus similarity is used instead. Why: fragmentation risk.
- DEFERRED: dependency observations and the generationRatio display. Why: they depend on stable concept anchors and consented evidence.
- DEFERRED: equipoise randomisation between acceptable moves, to a consented research cohort only.
- DEFERRED: embeddings as a matcher. The optional interface is kept.
- DEFERRED: the Logos sanitizeMap change to preserve origin. The toLogosGraph export is scoped and filtered but not wired into Logos rooms until Logos consumes it.

## Unresolved risks (the council's list)

- Moving ambiguous phrases to the WEAK tier lowers recall for real learners who never use STRONG phrasing. The asymmetric-cost argument says this is recoverable, but the Evaluation Scientist cites Bastani et al. (unrestricted AI help reduced later unassisted performance by about 17%). Whether CORRECT-by-default harms undeclared learners over time is an open empirical question until the consented study runs.
- The state reader's accuracy with gpt-4o-mini in production has not been measured. Sandbox runs use Claude, which will overestimate reader, guard and checker quality. The oracle-state and degraded-reader arms bound this gap but do not close it.
- Core 4 may not beat the compute-matched B+ baseline once the prompt is purged and the baseline gains a learning-science section and a self-critique pass. If it doesn't, the spec's falsification applies and several components will have to be removed per the ablations.
- Reactive simulated users are LLMs, so they may be too patient or too twitchy. Abandonment estimates depend on calibration against a small human sample.
- Concept-anchor stability through Mind Graph Concept ids is untested. If it stays below 0.8, the longitudinal capability claims stay empty for months, which will create pressure to loosen the definitions.
- Regex coverage is whack-a-mole. The generator may find disguised question forms that neither the regex nor the judge catches, and the artifact-fence exemption can be gamed. The per-release red-team refresh and the independent judge are the only mitigations.
- Stricter grounding (coverage ≥0.5, echo check) will push some genuine user considerations to unknown, weakening 'you've already considered X' acknowledgements and cross-session continuity.
- The sensitivity classifier will produce false positives (turning off longitudinal features in practical conversations that mention debt, divorce and similar words) and false negatives (persisting sensitive material).
- The safety/high-stakes lexicon override can also misfire, but it only ever produces more help. Its recall on real emergencies phrased unusually is unknown.
- The envelope (non-forced) selection in thinking modes may make Core 4 behave almost like the baseline on those turns. Its value then rests on persistence, attribution and enforcement. That is honest, but it may show a smaller measured win.
- Removing lexical auto-links and deferring ledgerGaps leaves CONTRIBUTE with no deterministic source of candidates. Novel contributions depend on the generator plus the reader's relation refs, and those contributions are the product's main value for experts.
- Latency budgets rest on assumed model speeds. Buffered withhold turns, speculative checker calls and guard regenerations could still breach p95 under load, and the automatic degradation path is untested.
- The loosen-only user-level contracts, together with the Project-scoped tightening contracts, may still surprise users when a Project contract applies weeks later. The disclosure clause mitigates this but does not prevent it.
- Other Cores keep minting Belief/Assumption/Question nodes into the same per-user graph. If the Core 4 render filter regresses, duplicate and contradictory reasoning representations return.
- Human evaluation (practitioner raters, a delayed-transfer study with about 64 per arm) is costly and slow. Until it runs, every capability and expert-preference claim must be labelled as unproven.

## Implementation directives, in the judge's order

- 1. Phase 0 tests first. Replace the tautology at test/core4-p0-reproduce.test.mjs:35 with a real practice-contract assertion. Add a lint rule that fails on '|| true)' inside assertions. Add regression tests from the verified probes, all expected to fail at first: the lexical-collision phrases (D2), artifact integrity and URL mangling (D4/D8), the spec GOOD/BAD novelty pair, the vaccines correction, recap and elaboration (D9), exact-path noise including dates, doses, ranges and 'Compute 17*23.' (D13), echo/pasted/assent attribution and conversation-delete cascade (D10/D15), the cross-Project leak probe, 'quiz me' plus terse correct answers, the button-battery emergency under a hints-only Project, and the readState-failure direct answer.
- 2. Rewrite lib/core4/signals.ts. Add STRONG, LOOSENING and WEAK tiers, filters for mood, object, negation and speech(), split learningGoal into comprehensionRequest, practiceIntent and studyContext, make expertise domain-scoped with novice cancellers, split correction into kinds plus revision and reportedSpans, and add the new signals (dontKnow, decided, wantsChallenge, brevity, skipBasics, quiz, roleplay, recommendationRequested, tooDirect, requestScope, feedbackPreference, privacy, negatedSelf, horizon). Put the permanent labelled precision corpus in test/ with gates of STRONG ≥0.97 and loosening ≥0.90.
- 3. In lib/core4/allocation.ts, evaluate explicit directness and delegate ABOVE the vent/reflection branch. Add the safety gate before any contract. Make withhold carry {what enum, reason, source, ref, quote, scope, alternative}. It must require an explicit source; tests throw without one and production falls back to null. Put verification-first precedence in place. Remove the router's decide/create/learn default withholds. Add the recommendationRequested rule, with a pick plus the value hinge.
- 4. Add the item tracker, practiceItems ≤5 in core4_state, with ladder levels 0-5. Put the D6 ladder and caps in allocate/select: rung 4 after 2 failures, or 1 failure on a misconception; 'even if I'm stuck' raises the cap to 4; 'let me try first' with no attempt returns GET_OUT_OF_THE_WAY. Add override handling, including the binding contract with a single reminder and the offer to lift a contract after its third override.
- 5. Migrate CognitiveState to v2 per D3. Use the basis-derived confidence mapping, the tally hysteresis, domain scoping, no rendering of prior inferred values to the reader, and ledgerRefs in place of free-text positions. Delete supportLevel, confusions and assumptions. Keep frustration turn-scoped. Add artifact and answerability. Render only behavioural directives. Add GET/PATCH /api/core4/state/:conversationId.
- 6. Purge the six default-withholding and drip-feed lines from CORE_4_PROMPT (lib/socria-prompt.ts ~1339, 1361, 1387, 1399, 1405) and add the replacement line. Add a prompt-lint test. Remove WHY_NOT_ANSWER from the Core 4 path.
- 7. Rework lib/core4/budget.ts and questions.ts per D4. Count addressed interrogatives outside ':::artifact' fences. Add the disguised and HANDBACK forms and full-width marks, the rhetorical exemption, requested-content exemption, and always-strip comprehension checks. Delete the blocker re-grant at budget.ts:159 in favour of PROCEED_UNDER_ASSUMPTION with strict CLARIFY criteria. Add quiz and role-play contracts, density caps by mode, and 3-turn post-switch hysteresis. Shield URLs and abbreviations before splitting.
- 8. Reduce lib/core4/intervene.ts to the D7 type set, with forms and kinds, WORKED_EXAMPLE, a gated crux QUESTION, CONTRIBUTE kinds including nothing_to_add, and ACKNOWLEDGE. Remove RESEARCH, MODEL and VISUALIZE from the enum and create lib/core4/tools-contract.ts. select() returns {primary, envelope, forced}, and forced moves are rendered only under the D1 conditions. Log selected and realized families.
- 9. Rework lib/core4/guard2.ts and stream-gate.ts per D8. Buffer only when a withhold is set. Use hold-and-block with no reordering. Restrict deterministic deletions to the listed set and add the coherence floor. Flag and regenerate once for DEFLECT (narrowed), no_verdict, verification-claim, scope-overreach, attribution and target-aware worked solutions. Coerce model verdicts, fail open unless withheld, allow at most one retry under 8 s, remove canned fallbacks, and trace every edit.
- 10. Rework lib/core4/considered.ts per D9. Use candidate-side coverage, the ≥0.8/≥3/no-new-entity/samePolarity lexical REDUNDANT rule, and raising sentences only, with the listed exemptions. Delete the SYNONYMS map. Fold the judge into the guard call. Handle UNCERTAIN asymmetrically. Regenerate rather than delete. Render the stance-aware avoid digest in the prompt.
- 11. Add migrations in supabase/schema.sql. reasoning_moves is append-only with idem_key unique. reasoning_entries gains origin, origin_ref, attribution_conf, private, topic_key, projected stance columns and new statuses, and drops revisions jsonb. reasoning_links gains conversation_id, asserted_by, status and surfaced_at. Add reasoning_tombstones, agency_contracts and user_profiles.research_consent, plus the indexes. Every new table has RLS deny-by-default and export, delete and forget-all coverage.
- 12. Rework lib/core4/ledger.ts and turn.ts per D10. Apply corrections before the digest using the promptManifest, and ground before rendering with the coverage, echo, reported-speech and hedge clamp. Record adoption as a move and change of mind as supersession. Delete lexical auto-links and accept reader relation refs instead. Add staleness, SQL-scoped loadLedger, PII scrub, historyView for RETRIEVE, the /api/reasoning CRUD endpoints, and a conversation-delete cascade across all Core 4 tables.
- 13. Split the Mind Graph for Core 4. Add a gate allowlist for surface core-4, stop passing Socria's reply as extractable text (route.ts ~484), filter reasoning-type nodes out of the Core 4 render, promote decisions and goals via remember({candidates}), and label legacy nodes. Enable ledger writes in production only after this ships.
- 14. Implement persistPolicy and the sensitive flag (reader field plus lexicon), the privacy signals, the retention cron in the existing vercel cron, consent-scoped export, purpose-limitation module-boundary tests, production guards on the eval hooks, a forget-all that clears mind_* with tombstones, and the data-inventory table with its completeness test.
- 15. Restrict lib/core4/verify.ts per D13. Gate the exact path and compare final values with equivalence and +C handling. Run the checker only on withhold plus attempt, speculatively in parallel. Apply the verdict confidence floor, return unknown on disagreement, use the checker's expected value on release, and never persist the expected value.
- 16. Restrict lib/core4/capability.ts per D12. Record only verified, determinate, non-sensitive events. Take assistance from the item tracker, use a Concept-id anchor with a stability flag, remove needed_answer, and add the UNASSISTED_LATER view. Selection may only lower depth or release mastery. Show a raw-event Memory-page list with TTLs.
- 17. Record outcomes per D11. Store observable events plus reader labels with frustration targets. Selection reads explicit-sourced events only through the loosen and tighten-form rules. Outcomes never touch withholding. Add the drift monitor.
- 18. Minimise the diminishing detector per D5: explicit triggers, an inferred ≥2 rule with a user-behaviour signal computed from ledger deltas, FIX_FAILED and ITERATION exclusions, STUCK/SATURATED/DONE causes, immunity for contracts, and subgoal scoping. Put it behind the ablation flag.
- 19. Build agency_contracts creation, the chips (mode chip, 'Holding back … [Show answer]', 'Saved · Undo'), body.override from the UI, and the minimal 'What Socria is working from' panel.
- 20. Build the harness per D16: arms A1, A2 (B+) and A3 with ablations, equalised token caps, fixed-prefix and reactive modes, stepwise controls, independent detectors, new corpus strata and fields, per-stratum non-inferiority, pre-registration in docs/CORE-4-EVALS.md, and harness meta-eval. Write docs/CORE-4-EXPERIMENTS.md with the human delayed-transfer protocol.
- 21. Enforce the D17 latency, cost and length budgets. Add per-stage timings to the trace, the fast path, the injected-delay latency CI gate, and adaptive maxTokens with sentence-boundary endings.
- 22. Record every decision above (issue, competing proposals, disagreement, final decision, evidence, test, reversal conditions) in docs/CORE-4-COGNITIVE-DESIGN.md, including the global 'no less help than baseline under uncertainty' invariant. Update docs/CORE-4-ARCHITECTURE.md to describe only what actually exists.

## Scenarios the council asked for

The judge proposed 121 additional scenarios (lexical-collision traps, artifact integrity, safety under contracts, attribution, privacy). They are recorded in `evals/core4/council-1-scenarios.json` and are not yet converted into corpus scenarios.
