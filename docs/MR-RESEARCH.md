# Metacognitive Regulation — research readiness

What exists so that a controlled evaluation of Human-First AI and MR (a
university study is being considered for Spring 2027) can be run on Socria
without changing the product to do it — and what does not exist, because it
must not exist until a study is approved.

> **Nothing in this repository enrolls anybody.** The one experiment that is
> defined is inactive. Research participation can only be recorded by an
> approved study's own consent flow, which is not built. No production user is,
> or can become, a participant through anything shipped here.

## 1. Conditions

The proposal's benchmark has four variants. They are real, selectable runtime
conditions (`lib/mr/types.ts` `ARMS`), not a separate prototype:

| Arm | What reaches the reply | What is measured |
|---|---|---|
| `baseline` | Logos as it is. MR folds the conversation for measurement only. | everything below |
| `prompt_reflection` | one fixed self-reflection instruction in the turn (`lib/mr/experiment.ts` `REFLECTION_BLOCK`); no state, nothing enforced | the same |
| `state_only` | MR's state rendered into the turn as context (`stateBlock`); nothing enforced | the same |
| `full` | MR's decision, enforced (`lib/mr/execute.ts`) | the same |

and a second factor inside `full`: IFR on or off (`LOGOS_IFR`). `shadow`
(`LOGOS_MR=shadow`) runs any arm's decisions without enforcing them — useful
before a study to estimate how often an arm would act.

Every arm runs the same fold (`lib/mr/state.ts`) over the same rule set —
every rule family, the same outcome model, the same integrity checks — so the
decisions MR would make and the outcome measures over them are computed the
same way in every condition; only what reaches the reply differs. Three
precisions, because they bound what a comparison can say:

- In the comparison arms (and in `shadow`), the fold estimates what the full
  condition **would** decide given the replies as they were actually sent. It
  is not a replay of the full arm: had MR enforced, the replies — and so the
  later turns — would have been different.
- With IFR off, IFR's rules are still folded: their decisions are recorded
  with the uncertainty code `not_enforced` and judged against the replies as
  sent, so friction outcomes exist in the IFR-off arm too. They never enter
  the decision in force, the strategy, or the integrity checks that act on it.
- When the person switched MR off (or their settings could not be read),
  nothing of theirs is folded at all — not even as a would-be decision — and
  the exposure row records only the condition. Such turns are not comparable
  units; they are excluded by construction.

## 2. Assignment

`lib/mr/experiment.ts`:

- `bucket(unit, salt)` — `sha256(salt:unit)` mapped to [0, 1); stable across
  requests, deployments and machines; roughly uniform (tested over 10,000
  units).
- `armFor(spec, unit)` — weighted, stable assignment to an `ArmSpec`.
- `resolveCondition(...)` — the order in which a turn's condition is decided,
  top first: MR off for the deployment → baseline; a shared room → excluded;
  a settings read that failed → baseline (fail closed); the person's own MR
  "off" → baseline; **an active experiment named by `LOGOS_MR_EXPERIMENT`
  whose id equals the study id the person consented to** → the assigned arm;
  otherwise the deployment's arm.
- The unit is the Clerk user id, read on the server. The client cannot choose
  or see its arm (the request body's `surface` is never used for assignment).
- `EXPERIMENTS['mr-pilot-2027s']` is defined with five equal-weight arms
  (`baseline`, `prompt_reflection`, `state_only`, `full`+IFR, `full` without
  IFR) and `active: false`. Activating it is a code change reviewed with the
  study's approval, not a setting.

Exposure is logged: every regulated turn writes one `exposure` ledger row with
the arm, the IFR factor, shadow, the source of the condition, the experiment
id and the policy version.

## 3. Versions

- **Policy version** (`MR_POLICY_VERSION`, `lib/mr/config.ts` `STRATEGIES`):
  every threshold MR acts on, frozen per version. A decision carries the
  version it was made under. `LOGOS_MR_POLICY=<version>` pins an earlier one.
- **State and ledger shape** (`MR_STATE_VERSION`).
- **Research event shape** (`RESEARCH_EVENT_VERSION`, `lib/mr/research.ts`).
- **Experiment id** on every exposure row of an enrolled participant.
- The persona and runtime versions already in `X-Socria-Runtime`
  (`logos5-v2`, ...).

MR's decisions are a pure function of their inputs: the transcript, the
policy version, the condition, ACS's move for the turn (which itself depends
on Core 4's allocator, the Project's instructions and elapsed time), the maths
engine's verdicts, the person's length setting, the standing preferences
carried in with their consent, their reset, and — only with
`LOGOS_MR_DELIBERATE=on` — a model's choice from the menu. Given all of those,
a turn can be recomputed exactly. **The ledger does not hold all of them.** It
keeps codes: no transcript (by design), and not ACS's full move. So a study
that wants to replay its conversations under a new policy needs the
transcripts from its own, consented collection, and should log ACS's move code
per turn alongside; the ledger alone supports counting what MR did, not
re-deriving it.

## 4. What is collected, and what is not

**Product telemetry and research data are separate.** The product writes:

- `mr_ledger` (table, `supabase/schema.sql`): content-free rows — arm, codes,
  turn indices, policy version, MR's own milliseconds, whether the turn's
  decision changed the reply (`enforced`) — for a signed-in person's own
  conversation, not off the record, not in a shared room, not incognito (a
  failed incognito read counts as incognito), and only when the store is on.
  180-day retention: never read or exported past it, purged at write and
  daily. Exported with the account, deleted with the account, with "forget
  what Socria worked out", and with the conversation.
- `user_profiles.mr`: the person's own settings (MR on/off, carrying "from now
  on" preferences across conversations, a reset time), two content-free
  markers the server keeps (`revokedStanding`: rules their words took back;
  `forgotten`: hashes of conversations deleted in the last day), and — set
  only by a study's consent flow — `research: { studyId, consentedAt }`.

**Research data does not exist until it is exported**, by an authorised
analyst, for one study, through `lib/mr/research.ts`:

- `toResearchEvents(rows, { studyId, secret, settings, now? })` returns
  nothing unless the person's `research.studyId` is that study; only rows
  created at or after `consentedAt`, after their last reset, and (with `now`,
  which the export script passes) inside the 180-day window; user and conversation ids replaced by HMAC
  pseudonyms under a study secret (`pseudonym`, which refuses a secret shorter
  than 32 characters); timestamps coarsened to the day; records flattened to an
  allow-list of scalar codes (`MINIMAL_FIELDS`) — any value that is not a code,
  a number or a boolean is dropped.
- Exposure events carry `enforced` and `modelDeliberated`; they never carry
  `local`, which on its own would reveal that a conversation touched a
  sensitive subject.
- No message text exists anywhere MR writes, so none can be exported.

## 5. What a study still needs (not built, on purpose)

| Needed | Why it is not here |
|---|---|
| IRB (or equivalent) approval, protocol, consent language | Not an engineering artefact. Nothing should enroll before it exists. |
| A consent flow that sets `user_profiles.mr.research` | Its wording and process come from the approved protocol. `/api/mr` refuses to set `research`. |
| Independent post-tests (problems solved without Socria, delayed retention checks) | The outcome model marks independent performance, retention and autonomy `unknown` inside a conversation (`lib/mr/outcome.ts`). Measuring them needs tasks outside the product and a schedule — the study's instrument. |
| User-rated control and satisfaction instruments | The product records only what people say in conversation; a validated questionnaire is the study's. |
| Running the export against production | `scripts/mr-research-export.mjs` is the wiring (consented participants only, pseudonymised, refuses without a registered study id, a ≥32-character secret, service-role credentials and `--approved`). It has not been run against a real database; the transformation it uses is tested. |
| Activation of `mr-pilot-2027s` | A reviewed code change after approval. |

## 6. Reproducible benchmark

`node evals/mr/run.mjs` drives the real route through every arm on the
scenario set (`evals/mr/scenarios.mjs`) with a simulated assistant
(`evals/mr/sim-model.mjs`) and writes `summary.json` and `report.md` with
bootstrap intervals (`evals/mr/analyze.mjs`, seeded). Same code, same seed,
same numbers. `--live` runs the same scenarios against the real model with a
key; its results are observational and are labelled so.

## 7. Validity limits (also `lib/mr/research.ts` `VALIDITY_LIMITS`)

- MR's readers are English regular expressions. Other languages, sarcasm and
  indirect phrasing are missed — misses mean MR does nothing, which biases any
  comparison toward no effect, not toward a false one.
- Outcome measures in a conversation are structural (did the reply contain
  steps, did it ask, did they ask again), not semantic: a reply can have steps
  and still be wrong. Epistemic Control and the maths engine check
  correctness separately; MR does not.
- Satisfaction ("thanks") is recorded as satisfaction and never counted as
  learning or as a success on its own.
- "Independent performance" inside a conversation is a single engine-verified
  attempt after a reply that kept the answer back — one observation, not
  capability. Retention and autonomy are unknown without a delayed independent
  instrument.
- Participants cannot be blind to what the assistant does, and novelty effects
  are likely early in any arm.
- The simulated benchmark says nothing about people; a live run says how one
  model version followed the instructions on these scenarios, nothing more.
- Arms differ in prompt length (the reflection and state arms add text); a
  difference between them can include that.
- Outcome rows outside the full arm judge the replies as sent against what MR
  would have asked of them; they measure how often unregulated help happened
  to do it, not what MR would have achieved.

## 8. A pre-registration skeleton

Fill before any data is looked at; do not move a threshold afterwards
(the same protocol as docs/CORE-4-EXPERIMENTS.md).

| | |
|---|---|
| Claim | e.g. "IFR reduces unnecessary questions without reducing task success." |
| Arms | `full` vs `full_no_ifr` (and `baseline`, `prompt_reflection` for the architecture claim) |
| Unit and assignment | consented participants, `mr-pilot-2027s`, `armFor` |
| Primary measure | e.g. unnecessary questions per conversation (ledger `outcome` friction: `questionsAsked` counts every question put to them except a closing offer; recorded in every arm, as would-be outcomes outside the full arm) |
| Guardrails | task completion, user-control compliance — non-inferior within a stated margin (`lib/mr/adaptation.ts` `PROMOTION_CRITERIA`) |
| Independent outcome | the study's post-test, not the product's measures |
| Sample size | from a power calculation on the primary measure; `promotionVerdict` refuses fewer than 200 per arm |
| Analysis | paired or between-unit bootstrap intervals (`evals/mr/analyze.mjs`), the evidence level from `evidenceLevel` (I–IV, the proposal's table) |
| Fails if | the primary interval includes zero, or any guardrail is worse beyond the margin |
| If it fails | the policy is not promoted; the result is reported anyway |
