# Core 4: evaluations

What has been measured, how, and what it showed — including where Core 4
loses. The architecture being measured is in `CORE-4-ARCHITECTURE.md`; the
decisions and their reversal conditions are in `CORE-4-COGNITIVE-DESIGN.md`;
what is being tested next is in `CORE-4-EXPERIMENTS.md`.

**The standing question.** Would Core 4 actually be better than the same
model with the strongest Human-First system prompt we can write? Not "does it
follow its own rules" — that is what the unit tests are for — but "would a
person rather think with it". Until that is shown, Core 4 is a hypothesis.

---

## 1. Phase 0: the failures, reproduced before they were fixed

Before any fix, `test/core4-p0-reproduce.test.mjs` was written against the
code as it stood (`b8a8004`) and run. **23 of 24 checks failed** — each a
confirmed defect, not a style preference:

| Failure | What the old code did |
|---|---|
| A wrong attempt was a reason to withhold (debug, decide, create, explore) | CHALLENGE withheld "the correct answer and the reasoning that reaches it" |
| Debugging was a reason to withhold | ASK withheld "the diagnosis"; HINT withheld "the step they are one nudge away from taking" |
| The question budget priced one label | After 2, 3 or 5 questions in a row, HINT and CHALLENGE could still end in a question |
| An all-question "hint" after four questions was not stopped | the guard passed it |
| An empty (failed) state read routed to ASK | failure defaulted to interrogation |
| TEACH was over-policed | stating the rule and handing back the application was rejected |
| Core 4 received the older memory layers | thread memory and the Thinking Journey reached the prompt |

After the implementation, the same file passes 24/24. It stays in the suite.

## 2. The deterministic suites

| Suite | What it proves | Checks |
|---|---|---|
| `core4-p0-reproduce` | the Phase 0 failures stay fixed | 24 |
| `core4-signals-questions` | explicit-signal reading (with negation, and the phrasings the pilot missed), the interrogative counter | 61 |
| `core4-policy` | merge precedence, budget, diminishing returns, allocation (incl. 144 inferred-only states: zero withholds), the engine, every decision well-formed | 87 |
| `core4-guard-ledger` | Guard 2.0 both sides, stream gate, novelty gate, ledger attribution, corrections, capability counting, content-free trace, Verify Mode, markdown-safe deletion | 99 |
| `core4-turn-e2e` | multi-turn through the real route: persistence, outcomes, guard retry re-checked, fallback, private verify value, ledger owners, correction API, off the record, conversation-delete cascade, forget-all | 94 |
| `core4-data-inventory` | every stored column is documented (council D15) | 57 |
| `core4-questions-e2e` | the McCombs conversation through the route | 28 |
| `core-4` | the prompt v2 contract | 66 |

These prove the machinery does what it says **when the model reports what
the tests script**. They cannot prove that Core 4 is better. That is the
harness's job.

## 3. The comparison harness (`evals/core4/`)

**Arms.**
- **Core 4**: the real `/api/chat` route, bundled in-process
  (`lib/build.mjs`), with only Supabase, Clerk and `server-only` swapped.
  Every model call goes through the model seam.
- **Baseline**: the same model, the strongest Human-First prompt we could
  write (`baseline-prompt.md`: answer by default, correct wrong attempts,
  withhold only when asked, one question at most, track what the person
  already considered, peer not teacher, no tools claimed), plus a *generous*
  memory — the verbatim transcripts of every earlier session. The baseline
  is not allowed to lose because it forgot. It was written to beat Core 4,
  not to lose to it.

**Model roles, stepwise.** No production API key exists in the development
environment, so completions are produced by agents standing in for the
model (`step.mjs`, `lib/clients.mjs`). Each pending request carries the
exact system prompt and messages the pipeline sent; the player writes the
completion; the scenario replays from a cache keyed by (role, system,
messages). Only the first missing completion of a replay is ever requested,
so no answer is wasted on a request computed from a fallback. Separate
player agents serve each arm, so no player sees both arms' prompts, and
players are forbidden to read the scenario files, the results or the code:
they see requests only. With `--live` and a key, the production client
answers instead — the only mode whose outputs are the production model's own.

**Known biases of stepwise play (stated, not hidden).**
- Both arms are played by a Claude-class model, not the production model.
  The comparison is "architecture + prompt vs strongest prompt, on the same
  model"; it does not show the result transfers to GPT-5.6.
- A player may follow long system prompts more (or less) faithfully than
  the production model; Core 4's prompt is longer.
- Core 4's cheap-model roles (state, guard, checker, extraction) are played
  by the same strong model, so the reader is *better* than production's
  gpt-4o-mini. Reader error is under-represented; see `CORE-4-EXPERIMENTS.md`
  E3 for the ablation that addresses this.

**The corpus.** `evals/core4/scenarios/`: **150 scenarios, 379 scripted
user turns**, 18 categories — expert 20, learning 20, direct-answer 15,
decision 15, research 10, adversarial 10, math 7, debugging 5, longitudinal
6, already-considered 6, high-stakes 5, factual 5, creative 5, reflective 5,
changing-goals 4, repeated-questioning 4, no-answer-request 4,
expertise-mismatch 4. Multi-turn throughout; 2–3 session longitudinal
scenarios with days between sessions. Every expectation is a behavioural
property (`maxQuestions`, `mustAnswer`, `mustNotReveal` regexes,
`alreadyConsidered`, `mustContribute`, `mustChallenge`, `mustReference`,
`noQuestionEnding`, `stance`) — never an expected sentence. Later user turns
are written to make sense whatever a reasonable assistant said.

**Grading (`grade.mjs`).** Three layers, so the result never rests on an
LLM judge alone:
1. **Deterministic metrics** with the guard's own counter: questions per
   reply, replies ending in a question, disguised questions, closing offers,
   sycophantic openers, length, and every `mustNotReveal` leak — checked
   against each turn's `expect`.
2. **Blind pairwise judgment**: each scenario completed on both arms becomes
   a packet with the transcripts as A and B; which is which is decided by a
   salted hash and kept in `key.json`, which judges never see. Judges rate
   each turn's properties and preference, and the scenario overall
   (helpfulness, agency, peer, friction).
3. **Blind human evaluation** (`human-pack.mjs`): a self-contained page per
   rater, stratified by category, same blinding, exporting the same judgment
   format; `grade.mjs --judgments judgments-human/<rater>` produces the same
   report from people. Where the model judge and people disagree, the
   people's result is reported.

## 4. Results

### Pilot — a development run, not evidence

A stratified pilot of 14 scenarios (~40 turns, Core 4 and the A1 baseline)
was run to shake out the harness. **It is not a measurement**, for three
reasons, all stated here rather than buried:

- **Blinding broke.** When a scenario's first session finished, `step.mjs`
  printed the finished sessions — including each turn's `expect` block — so
  model players on both arms saw the grading criteria mid-scenario
  (`expert-008` and `changing-goals-001` from their second session on). The
  players reported it themselves. Fixed: step output is now status and the
  pending request only.
- **The code under test changed** during and after it (the fixes below and
  the council's first batch), so its transcripts describe a Core 4 that no
  longer exists.
- It never had the council's primary comparator (B+).

What it was good for was finding defects by reading real transcripts. It has already paid for
itself: reading the first generated Core 4 transcripts found four real
defects, all now fixed with regression tests:

1. **A guard deletion broke the reply's markdown** (`expert-008`, session 2):
   the sentence splitter split "**Revenue.**" from its sentence, so deleting
   the sentence left "** Enforcement…". Fixed in `sentencesOf` and a single
   markdown-safe `deleteSentences`.
2. **The novelty gate deleted the most valuable sentence** of the same reply —
   the revenue quantification against the $40M pledge, which is exactly
   what the scenario expects — because the sentence *used* the person's
   stated facts. Using a fact is not re-raising it; the gate now deletes
   only for repeating what can be raised (objections, alternatives,
   questions, assumptions, hypotheses, uncertainties).

3. **An explicit "don't tell me" was missed** (`learning-020`, turn 1):
   "I'd rather work out the pattern than memorise a table, so nudge me,
   don't tell me" read as no signal, so Core 4 corrected in full instead of
   holding the ending back. The signal reader now recognises bare "don't
   tell me" (only where the clause ends), "I'd rather work it out", "on my
   own", "nudge me", "point me in the right direction" — and still not
   "don't tell me how to…". This is the recall risk E4 names.
4. **The novelty gate broke a correct answer** (`direct-answer-006`): the
   person had ruled out `NETWORKDAYS`; the answer was `NETWORKDAYS.INTL`;
   the gate matched on the shared word and deleted the start of the
   formula. With finding 2 that is two harmful deletions in about twenty
   gated turns — past E5's pre-registered 3% threshold — so **E5's reversal
   was applied**: word overlap may now delete only a re-asked *question*;
   an overlapping *statement* goes to the model check, which is told that
   using, applying, quantifying or contrasting a considered item is not
   raising it, and to leave a sentence alone when unsure.

5. **Verify Mode checked the wrong problem** (`math-001`): the exact path took
   an arithmetic expression from one of *Socria's* earlier replies (its own
   counterexample), computed it, and told the reply model the person's
   correct proof was "incorrect (computed exactly)". The player noticed and
   declined to invent a correction. Fixed per council D13: only expressions
   the person posed, never dates/versions/doses/money, final stated value
   compared.
6. **A control character disabled negation.** A scripted edit had turned a
   regex `\b` into a literal backspace in the signal reader's negation check,
   so "don't just give me the answer" could read as a request for it. Found
   while implementing D2; a scan found no other instance.
7. **A decimal became a sentence boundary** (`changing-goals-001`): "take that
   out of the 6.7." reached the person as "7." — the same splitter defect as
   finding 1, in the old bundle.

The pattern across all four: every one came from **code deciding something
semantic on surface evidence** (a word overlap, a regex, a sentence
boundary). The counting and enforcement parts held up; the parts that
pretend to understand text are where Core 4 breaks. That is the council's
Agent 1 critique showing up in data, and it points the next changes at
moving semantic calls to the model (bounded by code), not at more rules.

**One directional observation from the pilot's deterministic metrics**
(development data, contaminated — reported because it is informative, not
because it is evidence): Core 4 and the A1 baseline were nearly identical on
every friction metric — 0.02 questions per reply each, 2% of replies with
any question, 0% ending in a question, one `mustNotReveal` leak each, all
`maxQuestions` expectations met by both. **The strong prompt alone already
avoids interrogation.** Whatever Core 4 adds, it is not visible in question
counts against a strong baseline; if it exists it has to show up in the
judged properties (contribution, correctness, withholding done right,
continuity) — which is what the measured run below is for.

### Run 1 — measured (in progress)

26 scenarios, stratified across all 18 categories, disjoint from the pilot
where possible; three arms — Core 4 (the code as of `c652dc7`, after council
batch 1), A1 (strongest prompt, equal token cap) and **B+** (A1 plus one
self-critique pass, the council's primary comparator); fresh player agents
per arm, none seeing another arm's prompts; fixed step output. Grading:
deterministic metrics, then blind pairwise judge agents per comparator (A/B
assignment by salted hash, key never shown, and no judge sees both
comparisons of the same scenario — the shared Core 4 transcript would
unblind it), then the human-rating page.

**Deviations, stated before the results:**
- **Excluded: `factual-002` and `learning-006`.** A Core 4 player edited three
  of its replies after the harness had used them (fixing two wrong caffeine
  figures, removing a sentence that gave away the next drill answer). A real
  model cannot do that, and it favours Core 4, so both scenarios are out of
  the primary comparison. Players are now told never to edit an answer.
- **A1 and B+ shared cache keys.** Their first request is identical, so the
  A1 player and the B+ players answered some of the same files concurrently
  and overwrote each other; some A1/B+ transcripts mix turns from different
  players. Every player was playing the same model with the same prompt, so
  each transcript is still a coherent sample of that arm, but it is a
  deviation. The cache is now namespaced per arm.
- **B+ ≈ A1 in stepwise play.** Every self-review returned the draft
  unchanged. With a model that already follows the rubric closely, one
  self-critique pass adds nothing here; this may differ for the production
  model.
- **Core 4 was measured with defects later fixed** (found by its players,
  fixed after the run): a requested drill got an explanation with no next
  item (`learning-006`, excluded anyway); "only tell me if I've gone off the
  rails" and "do NOT tell me what's wrong… finding it is the point" were not
  read, so the move was CORRECT (`no-answer-request-002`,
  `direct-answer-012` — the players followed the person's words over the
  move); CORRECT's instruction assumed an error in a plan that was right
  (`direct-answer-009`); advice starting "If you want…" containing "e.g." was
  half-deleted mid-reply (`adversarial-001`). Run 1 therefore measures a
  Core 4 slightly worse than the one on `dev` now.

**Deterministic metrics (24 scenarios, Core 4 vs A1):**

| | Core 4 | A1 |
|---|---|---|
| questions per reply | 0.00 | 0.13 |
| replies with any question | 0% | 10% |
| replies ending in a question | 0% | 3% |
| closing offers / sycophantic openers | 0% / 0% | 0% / 0% |
| mean words per reply | 226 | 271 |
| `mustNotReveal` leaks | 0 | 0 |
| `maxQuestions` expectations met | 59/59 | 57/59 |
| `noQuestionEnding` expectations met | 46/46 | 45/46 |

Core 4 asked nothing at all. That meets every question expectation in this
set, but zero is not automatically right: the corpus does not yet mark
turns where a question was *needed*, so under-asking is only visible in the
judged properties below.

**Blind judgments — Core 4 lost to both baselines.**

| | Core 4 preferred | Baseline preferred | Tie | n |
|---|---|---|---|---|
| vs A1 (strong prompt) — scenarios | 5 | **13** | 6 | 24 |
| vs A1 — turns | 15 | **27** | 19 | 61 |
| vs B+ (primary comparator) — scenarios | 5 | **15** | 4 | 24 |
| vs B+ — turns | 12 | **25** | 24 | 61 |

Per property (judge, Core 4 vs A1): `mustAnswer` 29/29 vs 29/29;
`mustChallenge` 9/10 vs 10/10; `alreadyConsidered` 15/17 vs 15/17;
**`mustContribute` 18/24 (75%) vs 24/24 (100%)**; **`mustReference` 7/9 (78%)
vs 9/9 (100%)**; `stance` 48/49 vs 44/49; paternalistic 0/61 vs 2/61;
overreach 1/61 vs 0/61; underhelp 1/61 vs 0/61. Mean scores (1–5):
helpfulness **4.25 vs 4.79**, agency 4.75 vs 4.83, peer 4.79 vs 4.75,
friction 1.79 vs 1.88. Against B+ the pattern is the same (helpfulness 4.33
vs 4.75; `mustContribute` 88% vs 100%).

Core 4 won `changing-goals-004`, `debugging-005`, `direct-answer-009`,
`reflective-005` and, against A1, `expert-013` (and, against B+,
`learning-007`). It was never paternalistic, and its stance was judged
right more often. **On the two things it exists to do better — contribute
something new, and carry earlier context forward — it did worse than the
same model with a good prompt and a plain transcript.** That falsifies the
claim that Core 4 as measured is better, and per the pre-registered rule
(E0, and council D16) its components must now justify themselves or go.

**Why it lost — from Core 4's own traces, not guessed.**
1. **Code imposed a narrower move than the model would have chosen, on an
   inferred reading of the person** — the failure the council's minority
   (Agent 1) predicted. A guessed "reflection" produced four turns of
   acknowledgement for someone who wanted a plan (`repeated-questioning-004`;
   also `longitudinal-006`). A reader-flagged tension forced CHALLENGE with
   "do not resolve it for them" and left someone stuck where the baseline
   gave the experiment that settled it (`decision-009`). A creative idea was
   routed to CORRECT, "say what is wrong and give the correct version"
   (`creative-002`).
2. **The already-considered framing suppressed continuity.** The block said
   "already on the table — do not raise any of these", which also covered
   facts the person had established; Core 4 then failed to bring back an
   earlier caveat that mattered (`expert-010`) and lost on `mustReference`.
3. **Signals missed an explicit boundary**: "tell me how to look, not what
   to change" (`debugging-002`) — the practice move said "say exactly where
   it goes wrong".
4. **A mid-reply deletion** left a broken fragment (`adversarial-001`; fixed
   after the run, see finding 7 above).
5. **Content errors by the player model** that the architecture neither
   caused nor caught: an inverted Lee-bounds assumption (`research-009`), a
   wrong first inference (`already-considered-004`).

**What changed because of it** (`e29bb4c`): a move is now imposed only on
explicit or verified evidence — the person's words, a contract, safety, a
computed or confidently checked verdict. Otherwise the model receives
constraints (the question budget, what they have established — to *use* —,
what has been raised — not to re-raise —, and "help fully") and chooses the
move itself. Being heard only when they say so; creative work gets
critique; a challenge includes Socria's read of how it resolves. This is
council D1's minority position, now the default because the data favoured
it; experiment E1 is reframed accordingly (`CORE-4-EXPERIMENTS.md`).

### Run 2 — the envelope model: closer, still behind

All 26 scenarios (no exclusions: no player edited an answer); only the
Core 4 arm regenerated (code at `e29bb4c`), against the **unchanged** run 1
A1 and B+ transcripts; fresh players; per-arm cache; new blind judges and
new blinding keys.

| | Core 4 | Baseline | Tie | n |
|---|---|---|---|---|
| vs A1 — scenarios (run 1 → run 2) | 5 → **11** | 13 → **13** | 6 → 2 | 26 |
| vs A1 — turns | **18** | **24** | 26 | 68 |
| vs B+ — scenarios (run 1 → run 2) | 5 → **8** | 15 → **14** | 4 → 4 | 26 |
| vs B+ — turns | **17** | **28** | 23 | 68 |

Judged properties vs A1 (run 1 → run 2, Core 4): `mustContribute` 75% →
92% (A1 96%); `mustReference` 78% → 82% (A1 100%); `alreadyConsidered` 88%
→ 94% (A1 88%); paternalistic 0%; underhelp 3% (A1 0%). Helpfulness 4.25 →
4.58 (A1 4.73); agency 4.88 (4.92); peer 4.81 (4.81); friction 1.92 (1.77).
Against B+: helpfulness 4.42 vs 4.77, peer 4.77 vs 4.96.

**Reading it honestly.** Core 4 is still behind both baselines. Against A1,
11–13 is within noise at n=26 (a sign test cannot distinguish it from
even); against B+, 8–14 is not good. Almost every loss is by the narrowest
margin. **Three losses — including both of Core 4's clear, margin-2 ones —
came from defects run 2's own players found and that were fixed only
after the run:** the next drill item deleted as a "re-asked question"
(`learning-006`), the person's own "7" hidden as the checker's value
(`direct-answer-012`), and a session-1 caveat never reaching session 2
(`expert-010`). The rest are content differences between two strong
replies (a slightly leaner cut list, a more complete set of drivers).
Nothing here shows Core 4 is better than a strong prompt; run 3 measures
whether those three fixes change that, instead of assuming they do.

### Run 3 — continuity fixed; level with A1, still behind B+

Same 26 scenarios, same protocol as run 2: only the Core 4 arm regenerated
(frozen bundle at `f34a446`, i.e. with run 2's three fixes and nothing
later), against the unchanged run 1 A1 and B+ transcripts; fresh players;
four new blind judges; new blinding keys. No player edited a used answer.

| | Core 4 | Baseline | Tie | n |
|---|---|---|---|---|
| vs A1 — scenarios (run 1 → 2 → 3) | 5 → 11 → **11** | 13 → 13 → **11** | 6 → 2 → **4** | 26 |
| vs A1 — turns | **16** | **16** | 36 | 68 |
| vs B+ — scenarios (run 1 → 2 → 3) | 5 → 8 → **8** | 15 → 14 → **12** | 4 → 4 → **6** | 26 |
| vs B+ — turns | **16** | **20** | 32 | 68 |

Judged properties, Core 4 vs A1 (vs B+ in brackets where it differs):
`mustReference` 82% → **100%** (11/11; both baselines 100%);
`alreadyConsidered` 100% (94%) vs 94%; `stance` 100% vs 88% (92%);
`mustContribute` **88% (92%) vs 100%**; paternalistic 0%; underhelp 0%;
overreach 1/68 (baselines 0). Helpfulness 4.69 vs 4.73 (4.58 vs 4.65);
agency 4.88 vs 4.92; peer 4.92 vs 4.92; friction 1.58 vs 1.69 (1.88 vs
1.81). Deterministic: 0.04 questions per reply (A1 0.12), no withheld-answer
leaks on either arm, `expect.maxQuestions` met 66/66 (A1 64/66).

**Judge noise, measured.** B+ is A1 plus a self-critique pass, and in 15 of
the 26 scenarios the pass changed nothing: the A1 and B+ transcripts are
byte-identical. Two different judges therefore scored the same Core 4
transcript against the same baseline transcript 15 times, and disagreed on
the scenario verdict **3 times out of 15** (`direct-answer-009` tie vs
Core 4, `factual-002` baseline vs Core 4, `learning-007` Core 4 vs tie),
always by one step. Across all 26, a flip of about ±3 scenarios is within
what one judge swap produces. That is the resolution of this instrument at
n=26, and every run-to-run difference above should be read against it.

**Reading it honestly.** Against A1 Core 4 is now level: 11–11 on
scenarios, 16–16 on turns. Against B+ it is still behind (8–12), though
the gap narrowed from 8–14, which is within noise. Nothing here shows Core 4
is *better* than a strong prompt. What it shows: continuity across
sessions, the thing run 2's fixes targeted, is now perfect on this set
(`mustReference` 11/11), and it keeps what was already Core 4's strength,
restraint with questions and not re-raising what the person had settled.
The deficit that remains is `mustContribute`, adding something the person
had not already said: 3 turns vs A1, 2 vs B+, in two scenarios; both
baselines 0.

**Where Core 4 won.** Wins are mostly margin 1. The clearest, margin 2 on
both judges, is `reflective-005`: it stayed with what she said and made one
precise observation per turn, where both baselines drifted into frameworks,
self-test questions and career advice she did not ask for. That is the
envelope model's "being heard only when they say so" doing its job.
`longitudinal-006`, `math-003`, `research-007` and
`repeated-questioning-004` were won against both baselines.

**Where it lost, and why.**
1. **A worked example that was the answer** (`debugging-005`, margin 2 on
   both judges, the only overreach flag). He asked not to be given the fix
   so he could fight the borrow checker. After his second wrong attempt,
   Core 4 showed the loop restructuring on an analogous toy problem. The
   example mapped one-to-one onto his code, so it gave him the fix. The
   cause was the default "they can have" line of every withhold, which
   offered "an analogous worked example" unconditionally. Fixed after the
   run: it is offered only once they are stuck (frustrated or looping). Two
   failed attempts plus "I don't know" or frustration, or three failed
   attempts, still bottom out to the full worked solution (council D6's
   ladder). Regression test in `core4-policy`.
2. **A wrong first inference by the player model** (`already-considered-004`,
   both judges): Core 4's first reply argued against the hypothesis that
   turned out right, the in-process timers phase-locked by the rollout. That
   is one `mustContribute` miss. The architecture neither caused nor caught
   it.
3. **Unverified numbers passed through** (`adversarial-010`, both judges,
   the other two `mustContribute` misses vs A1). Core 4 held the line on
   fabricated sourcing, but it did not flag that his 32,000 input was a
   sales lead's guess, which both baselines did. It also offered a
   remembered "$1–2B" figure credited to published reports. The tool-claim
   strip does not cover "published reports say".
4. The rest are content differences between two strong replies (a leaner
   cut list, a more honest update, a sharper next-step), mostly margin 1.
   Nothing in them traces to a Core 4 decision.

**Deviations.** Two of the four judges went off-protocol after writing their
judgments, and both reported it themselves. One ran a check that printed
other judges' one-line verdicts for different scenarios. The other used
another judge's helper script to validate its files, then re-read its own
packet. Neither changed a judgment after the fact; both runs are kept.

**What changed because of it:** the D6 ladder fix above. Fixes found by run
3's players (`6f3a5df`: an echo of Socria is never the person's idea; a
quiz contract survives inferred fatigue) and the Mind Graph recall fix
(`61c0934`) landed after run 3's frozen bundle, so run 3 does not measure
them.

### Run 4 — held-out: Core 4 loses to the strong prompt

Runs 1–3 tuned Core 4 on the same 26 scenarios, which made them a
development set. Run 4 is the first **held-out** test: 50 scenarios never
used before, chosen by hash (40% of each category's unused scenarios, blind
to content) after the corpus critic's fixes. **All three arms were
regenerated** from one frozen bundle at `873c8a2` (prompt v5 and the D6
ladder fix), with 15 fresh players and 8 fresh blind judges (4 per
comparison), 124 turns per arm.

| | Core 4 | Baseline | Tie | n | sign test (decided) |
|---|---|---|---|---|---|
| vs A1 — scenarios | **15** | **26** | 9 | 50 | p = 0.12 |
| vs A1 — turns | 42 | 42 | 40 | 124 | |
| vs B+ — scenarios | **16** | **20** | 14 | 50 | p = 0.62 |
| vs B+ — turns | 31 | 34 | 59 | 124 | |

Margins: against A1, the baseline's 26 wins were 25 at margin 1 and 1 at
margin 2; Core 4's 15 were 11 at margin 1 and 4 at margin 2. Against B+:
19 + 1 against 14 + 2.

**E0 fails** (`CORE-4-EXPERIMENTS.md`). Core 4 is preferred in fewer than
half the decided scenarios against both baselines, and it loses the one
category with n ≥ 5 that decides it, **decision, 0–5 against both** (p =
0.06 each). Expert went 0–4 (3 ties) against A1 and 1–3 against B+.
Neither overall gap is significant at n = 50. The direction is consistent,
though, and nothing here supports calling Core 4 better than a strong
prompt. It is not ready to be the default.

Judged properties, Core 4 vs A1 (vs B+): paternalistic **0/124** vs 3/124
(4/124); underhelp 0 vs 1 (0); overreach **3/124 vs 2** (4 vs 1);
`alreadyConsidered` **97% vs 89%** (92% vs 95%); `mustReference` 93% vs
86% (93% vs 93%); `mustContribute` 96% vs 96% (98% vs 98%); `stance` 95% vs
97% (97% vs 95%). Helpfulness 4.64 vs 4.76 (4.76 vs 4.80); peer 4.84 vs
4.74; friction 1.62 vs 1.82 (1.62 vs 1.76). Deterministic: 0.02 questions
per reply vs 0.20; 2% of replies ask anything vs 11%; one withheld-answer
leak by A1, none by Core 4; 260 vs 293 words per reply.

**Why it lost.**
1. **Coverage on decisions and expert work** (every decision and expert
   loss, all margin 1). The judges' reasons are nearly word for word the
   same: both strong, Core 4 "tighter", the baseline "contributed more
   non-obvious material" (a vesting cliff, a regulatory tailwind, a
   tu quoque cost). Core 4 wrote those turns under lower ceilings than the
   arm it was judged against: 900 tokens for ANSWER and 450 for CHALLENGE,
   against the baseline's 1200. Its prompt also defaults to "1–3 short
   paragraphs". Run 3's fix (the contribution instruction) made
   `mustContribute` equal, 96% vs 96%, so it did not fail to contribute.
   It contributed less.
2. **Overreach when they asked to find it themselves** (all of Core 4's
   overreach flags: learning-015, math-004, no-answer-request-003 vs B+,
   changing-goals-003 vs A1, learning-001 vs B+). There were two causes.
   Signals were missed ("I want to get there myself — no rewritten query",
   "don't tell me the trick… I want to have found it", "don't hand me the
   answer"), so no withhold was in place. And the withhold was too narrow:
   under "hints only" only "the corrected final answer" was held, while
   VERIFY asked for where it goes wrong "clearly enough that they can fix
   it", which for a setup question is the solution.

**Where it won** (both comparisons): reflective (it stayed a listener where
the baseline drifted into advice), creative (reading her data more
carefully), direct answers and high-stakes (the same substance, faster), a
switch of goal mid-conversation (changing-goals-003 vs B+), and several
learning scenarios where the baseline added homework nobody asked for. Its
paternalism was 0 in both comparisons.

**What changed because of it** (after the frozen bundle, so run 4 does not
measure any of it):
- `d17dcf3`: every substantive move gets the baseline's 1200-token ceiling.
  Prompt v6 says a consequential decision or an expert's analysis gets
  completeness on what matters, over brevity.
- `f0e5a3b`: the missed phrasings, with near-miss negatives. Under a
  withhold the corrected step, code or setup is held too. VERIFY gives a
  pointer, not the repair, and under "hints only" one hint.
- Found by run 4's players:
  - `8ded455`: a restated position supersedes the one they held.
    learning-012 told the model a student still held two positions they
    had just corrected.
  - `75c809a`: a quoted draft is not Socria asking them (expert-017).
    "They answered what Socria asked" only when it asked
    (direct-answer-003).

**Deviations.** A usage limit interrupted the run halfway; players were
restarted and resumed from the cache, and no answer was rewritten. Several
players stepped every scenario at the start (queuing requests early), and
three reopened already-answered request files to compare system prompts.
One skimmed the unchanging opening of later system prompts. Three players
reported errors in their own answers, left as written (a Minkowski-sign
remark, a significant-figures remark, "expected by chance" for 0.6 of 12).
No judge reported a deviation. There were no human raters. The instrument
is still model judges at n = 50.

### Run 5 — second held-out set: much closer, still behind

42 more scenarios never used before (~53% of each category's remaining
unused ones, chosen by hash). All three arms were regenerated from one
frozen bundle at `bf92557`, which carries every fix from run 4: the
1200-token ceilings, prompt v6, the missed phrasings, the wider withhold,
supersede, and the quoted-draft and "resolved" fixes. There were 13 fresh
players and 8 fresh blind judges; 111 turns per arm. The last ~34 unused
scenarios are kept for a final confirmatory run.

| | Core 4 | Baseline | Tie | n | sign test (decided) |
|---|---|---|---|---|---|
| vs A1 — scenarios (run 4 → 5) | 15 → **16** | 26 → **18** | 9 → **8** | 50 → 42 | p = 0.86 |
| vs A1 — turns | **31** | **40** | 40 | 111 | |
| vs B+ — scenarios (run 4 → 5) | 16 → **15** | 20 → **18** | 14 → **9** | 50 → 42 | p = 0.73 |
| vs B+ — turns | **29** | **36** | 46 | 111 | |

All 16 of Core 4's wins against A1, and all 15 against B+, were at
margin 1. The baseline won 12 by margin 1, 5 by margin 2 and 1 by margin 3
in each comparison. **Decisions moved from 0–5 to 1–2–1 against A1 and
2–2 against B+; expert from 0–4 to 2–3–1 against A1 and 3–2–1 against
B+.** The run 4 mechanism for those categories was the token ceilings and
the brevity default, and it no longer shows up in the judges' reasons.
E0 still fails: Core 4 is preferred in under half the decided scenarios,
and against B+ it loses learning 1–4.

Two things got **worse**. Overreach rose to 5/111 (from 3/124), three
withheld answers leaked (none in run 4), and agency fell to 4.64 vs 4.88
(A1) and 4.62 vs 4.93 (B+). Helpfulness was 4.52 vs 4.74 and 4.76 vs 4.86;
friction 1.86 vs 1.67 and 1.76 vs 1.81. Deterministic: 0.01 questions per
reply vs 0.09; 264 words per reply for both arms.

**Why it lost** (every loss at margin 2 or more):
1. **Bottoming out into the solution under an explicit "hints only"**
   (learning-002, learning-009 margin 3, both judges). Council D6's ladder
   forced the full worked solution after repeated failed attempts, so the
   person who had asked to work it out got "the fix is lo = mid + 1". Two
   turns later, when he asked a direct conceptual question, Core 4 hinted
   instead of answering. The baseline stayed inside the boundary and then
   answered. This is run 1's lesson again: a forced move beat the person's
   stated wish.
2. **More missed "find it myself" phrasings** ("I want to find my own
   mistake", "I don't want the working", "please don't give me the
   construction"; learning-017, learning-008).
3. **A Project's "answers only, no explanations" was not read**
   (adversarial-005, margin 2 against both): Core 4 kept explaining.
4. **"I'm not asking what to do" was not read as wanting to be heard**
   (reflective-001). Being heard also lasted only one message, so turn 3
   drifted into advice.
5. **Cross-session continuity on the second turn** (longitudinal-005,
   debugging-001). The last-conversation block vanished after turn 1 and
   never listed Socria's own earlier suggestions, so Core 4 could not own
   one when asked.

Where it won: math (2–0 against B+), factual (2–0 against B+), a mid-course
change of goal, repeated questioning, and already-considered (2–0 against
A1). Changes since, all after this run's frozen bundle:
- `0beb9c0`: the D6 reversal below, plus the phrasings in item 2.
- `871ce5d`: answers-only as a standing signal. Being heard holds until
  they ask. The last conversation stays on later turns that touch it and
  lists Socria's suggestions as Socria's.
- `0517f8a` (found by run 5's players): the extractor sees the whole
  conversation's nodes; `replaces` no longer duplicates a live label; the
  "accepted Socria's point" line is neutral and never used for a question;
  uncertainties are not "held".

**Deviations.** One player created a stray empty file in the cache and
deleted it at once; no answer was affected. One player wrote one extract
after reading only part of the request, and several put helper scripts in
the shared scratchpad. Four players reported errors in their own answers,
left as written. No judge reported a deviation. There were still no human
raters.

### Full corpus

Not yet run.

## 5. Known failures and open risks

- **The controller can be less intelligent than the generator it
  controls.** A cheap reader's misreading, passed through deterministic
  rules, can force a worse move than the frontier model would have chosen
  (council, Agent 1). Mitigated by never withholding on inference and by
  one-question budgets; not yet measured. E1 in `CORE-4-EXPERIMENTS.md`.
- **Explicit-signal false positives** (reported speech, quoted assignments)
  win over everything because explicit outranks inferred. Code and quotes
  are stripped; reported speech is not yet handled. E4.
- **Lexical novelty matching** misses paraphrase and can over-match short
  sentences; the cheap-model pass and the raisable-only gate reduce but do
  not remove this.
- **Defects in the 26 dev scenarios (runs 1–3), found by the corpus critic
  and left unedited so the runs stay comparable.** `repeated-questioning-004`
  scripts answers to questions the assistant may never have asked, which
  penalises an assistant that asked nothing. `longitudinal-006`'s
  `mustNotReveal` regex fires on a correctly hedged sentence. The withhold in
  `direct-answer-012` covers the part-2 trick, which he never asked to keep.
  `direct-answer-009` turn 2 and `decision-001` turn 2 measure little. Runs
  from 4 on use held-out scenarios, and the critic fixed this defect class in
  them.
- **The latency cost** of the state read and buffered moves has not been
  measured against a live model.
