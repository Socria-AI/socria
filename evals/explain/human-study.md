# Does the explanation engine help people learn? A study to run with real learners

The offline evaluation (docs/LOGOS-5-SYSTEM.md §8.11) shows how expert judges rated
replies written by a stand-in model. It does not show that anyone learned more. This
is the study that would show that. Nothing in it is automated, and nothing here has
been run.

## The question

With the same model, the same app and the same allowance, do people who learn a
concept with the engine on (arm A) answer a new question about it better, a day later,
than people with the engine off (arm B), or with one strong tutoring prompt and no
runtime (arm C, `evals/explain/strong-prompt.md`)?

Primary outcome: the score on a transfer question answered **24 to 72 hours later,
without the conversation open**. Secondary: the same-session transfer score, the number
of turns to the first correct answer, the time spent, and a one-question rating ("How
well do you understand this now?", 1 to 7). The rating is reported, never used as
evidence of learning: people rate fluent explanations highly whether or not they learned.

## Who

Adults (18+) who chose to take part, recruited outside Socria's own users so that no
one's real conversations or ledger are touched. Exclude anyone who scores full marks on
the pre-test for a topic: they get a different topic.

Size: for a difference of 0.4 standard deviations on the delayed score (a medium effect
for tutoring interventions), two-sided, alpha 0.05, power 0.8, about 100 people per arm
compared. For A against B alone, 200 people. Fewer than that is a pilot, and must be
reported as one.

## Materials

The 24 held-out scenarios in `evals/explain/heldout.json` were written for this and
were never used to tune the engine. Each key under the evaluation's keys gives the
learner's starting point, the opening message, and a transfer question with its answer.
For each topic, prepare:

1. A pre-test: two short questions on the topic, scored 0 to 2 each.
2. The opening message, which the participant may reword in their own words.
3. The transfer question from the key, and a second one written by someone who has not
   seen the replies, on the same idea in a different setting.
4. A marking guide (0 wrong, 1 partly, 2 right) written before any answers are seen.

## Procedure

1. Consent, then the pre-test.
2. Random assignment to A, B or C, stratified by pre-test score. The participant is not
   told which arm they are in. The interface is identical in every arm; only the server
   flag differs (`LOGOS_EXPLAIN=off` for B; for C, a build that sends only the strong
   prompt, which does not exist yet: `evals/explain/arm-c.mjs` only writes the requests
   offline).
3. Up to 10 minutes of conversation on the topic, starting from the opening message.
   They may ask anything, and answer or ignore any question Socria asks.
4. The same-session transfer question, with the conversation closed.
5. The delayed transfer questions 24 to 72 hours later, by email link, with no access to
   the conversation.

Use a test account per participant, with the ledger empty at the start. Clear it and
delete the account afterwards (the ledger lives only in that browser;
`lib/logos5/learning.ts`).

## Marking

Two markers who do not know the arm score every answer against the guide. Report their
agreement (Cohen's kappa) and settle disagreements by discussion before unblinding.

## Analysis, fixed before the data

- Primary: delayed transfer score by arm, as a linear model with the pre-test score as
  a covariate and topic as a random effect. Report the A−B and A−C differences with 95%
  intervals, not just p-values.
- Report every arm's mean, the number who dropped out before the delayed test, and
  whether dropout differed by arm.
- If A is no better than C, say so. That would mean the runtime does not beat a
  well-written prompt, and is worth knowing.

## Privacy and ethics

- Get ethics approval where the study is run.
- Participants use test accounts. No real user's conversations, memory or ledger are
  used or read.
- Keep the conversations only as long as marking needs them. Report results only in
  aggregate.
