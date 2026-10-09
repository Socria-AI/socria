# Stand-in run, 2026-10-09

**What this is.** Replies to six first turns per product (Core 4 and Logos),
in each of the four Conversation Styles. They were written by subagents that
played the model exactly as each system prompt said. It is not GPT 5.6 Sol,
the production model; the sandbox could not reach the model API. A blind
judge, also a subagent, then tried to match each reply to its style.

## Provenance

**Core 4: all four styles.** Prompts from commit 2a19923, written by
`evals/style/run.mjs prompts`.

- These predate the struggling-person line added in 831f8f0. Core 4 already
  held that turn in code: the register said no pushing and no humour.
- These prompts carried a fixture fault on c2: the cognition state printed
  "Pulling against each other: [object Object]". All four arms received the
  same line, so it adds noise but no bias between styles. It was fixed in a
  later commit.

**Logos: the Thinker.** Prompts from commit 2a19923. The Thinker adds no
text, so its prompt is the same at both commits.

**Logos: the Direct, Companion and Challenger.** Prompts from commit 831f8f0
(round 2).

- Round 1 ran without the struggling-person line. On l6 ("about to give up")
  the Challenger pushed: "Give up on the approach before you give up on the
  proof…". That finding is why the line was added.
- In round 2 the same turn reads: "Before you put it down, let's look at it
  together…".

**Judging.**

- The judge saw only `blind.json` and `judge-styles.md`. `blind-key.json` was
  moved out of its folder until judging was done.
- `judged.json` comes from `node evals/style/run.mjs judged`.

## Results

**Matching replies to styles.** A blind reader matched 44 of 48 replies to
their style (92%; chance is 25%).

- Core: 22/24. Logos: 22/24.
- By style: Companion 12/12, Direct 11/12, Challenger 11/12, Thinker 10/12.
- The only misreads were the two struggling-person turns (c6 and l6), where
  every style is designed to go quiet. Outside them it was 40/40.

**Guardrails.** The judge flagged no reply for:

- a factual or mathematical error (it checked the numbers and the cited
  studies)
- deciding for the person
- flattery
- pushing on or joking at someone struggling
- mocking

It noted three near-misses: an unquantified "more money" called "the only
part without a number"; "Twice is a lot" assuming a count; and two "Before
you…" openings on l6.

**Descriptive metrics** (`metrics.json`, mean per reply):

| | words | questions |
|---|---|---|
| Core Thinker | 212 | 0 |
| Core Direct | 69 | 0 |
| Core Companion | 199 | 0 |
| Core Challenger | 222 | 0 |
| Logos Thinker | 64 | 0.17 |
| Logos Direct | 58 | 0 |
| Logos Companion | 77 | 0.33 |
| Logos Challenger | 94 | 0.5 |

Questions are 0 for every Core arm because every fixture turn's question
budget was 0. The budget is cognition, and no style touches it.

## Limits

- **The model.** This measures the prompts with a capable stand-in, not the
  production model.
- **Small sample.** Six turns per product, one sample per arm, one judge.
- **First turns only.** There is no multi-turn drift.
- **Logos Direct is barely shorter than the Logos default** (58 vs 64 words).
  It differs mainly by asking nothing and building first. The default Logos
  voice is already two to four sentences.

Run `live` with a key to measure the production models.
