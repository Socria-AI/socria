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
| `core4-turn-e2e` | multi-turn through the real route: persistence, outcomes, guard retry re-checked, fallback, private verify value, ledger owners, correction API, forget-all | 78 |
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
where possible; three arms — Core 4 (current code, after council batch 1),
A1 (strongest prompt, equal token cap) and **B+** (A1 plus one self-critique
pass, the council's primary comparator); fresh player agents per arm, none
seeing another arm's prompts; fixed step output. Grading: deterministic
metrics, then blind pairwise judge agents per comparator (A/B assignment by
salted hash, key never shown), then the human-rating page. Results will be
recorded here as they are — including losses.

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
- **The latency cost** of the state read and buffered moves has not been
  measured against a live model.
