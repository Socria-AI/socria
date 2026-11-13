# The challenge benchmark

The offline test the challenge has to pass before any user sees it (docs/LOGOS-6-PLAN.md §7.B, H1 and H3).

## The cases

- **The set.** `cases.json` holds 80 cases, checked by `validate.mjs`. That is 15 with planted flaws in each of four segments, plus 20 sound cases (5 per segment) with nothing planted.
- **The segments.** A student's essay or argument, a founder's plan or decision, a researcher's claim or method, and a UX designer's research synthesis.
- **Documents.** At least 10 cases come with documents, where the flaw (or the soundness) shows only against the source.
- **Planted flaws.** Each one names its kind, the words it lives in, and 2 to 4 keys a correct finding must mention.

The cases were written for this benchmark, so they still need checking by someone from each segment, as the plan asks. Some of them rest on outside facts rather than the text alone:

| Case | Outside fact |
|---|---|
| stu-19 | Most UK medical schools require A-level chemistry. |
| des-09 | #9AA0A6 on white is about 2.6:1, which fails WCAG AA. |
| res-18 | University email accounts are usually closed after graduation. |
| stu-09 (a sound case) | The Black Death and the Statute of Labourers. |
| stu-01 | The withdrawal of federal troops in 1877. |

**The spread of kinds.** There are 133 planted flaws, and each segment leans the way its material does: founders towards risk, researchers towards claims that go further than their support. "Missing evidence" is the rarest kind (8 flaws).

**How lexical recall matches.** A finding counts when it names two of a flaw's keys, or one key while quoting the flaw's words. The keys were checked against that rule: a finding written as the flaw and quoting it matches its own flaw and no other in its case.

## The three systems

`run.mjs` runs all three on the same model.

| System | What it is |
|---|---|
| `logos6` | The shipped engine. The structure's findings are found in code, the model is prompted (`lib/challenge/challenge-prompt.ts`), and every finding goes through the gate (`lib/challenge/challenge-gate.ts`). |
| `plain` | What a frontier assistant does: the person's messages, then "What am I missing?", with no structure and no gate. |
| `logos55` | Logos 5.5's Challenge panel on the line's main card (`lib/logos-explore.ts`). |

## Running it

```
node evals/challenge/validate.mjs                 # the dataset is what it claims
node evals/challenge/run.mjs                      # live: needs OPENAI_API_KEY
node evals/challenge/run.mjs --structure-only     # no model: the structure alone (Logos 6's fallback)
node evals/challenge/run.mjs --fake               # a scripted model: checks the plumbing, proves nothing
node evals/challenge/grade.mjs --run evals/challenge/runs/<dir>
```

`grade.mjs` scores each run in three ways.

**Lexical measures:**
- recall of planted flaws;
- findings and "holds up" on sound cases;
- quotes re-checked;
- generic phrasing.

**Blind judge packets.** These are shuffled per case, and the key is kept apart. A rater marks every finding as one of:
- **new**: a real weakness the person hadn't raised;
- **known**: real, but already theirs;
- **wrong**: not a real weakness.

**Report.** It covers the plan's gates and lists every case where Logos 6 lost.

## The gates

| Gate | Threshold |
|---|---|
| Quotes | 100% of the quotes shown are real |
| Precision | At least 0.8 (judged) |
| Wrong | Under 10% (judged) |
| H1 | Recall no lower than the plain prompt's, and precision at least 15 points higher |
| H3 | "Holds up" on at least half the sound cases, with at most one finding per sound case on average |

## Status

### The one run that needs no model

`--structure-only`, on 13 November 2026, measured Logos 6's fallback: what the structure alone finds when no model answers.

| Measure | Result |
|---|---|
| Planted flaws found | 1 of 133 |
| Findings raised on the 20 sound cases | None |
| Quotes real | Every one |

Only 11 of the 80 cases come with a map, and the planted flaws live in the person's words. So the fallback is safe but thin. The model is what finds flaws, which is why the live run decides.

### What is still to do

- **Live run.** Not yet done. This sandbox can't reach the model, so the live run waits for an environment with a key.
- **Judged half.** This needs raters.
- **Until both are done:** the challenge stays behind its switch in production (`NEXT_PUBLIC_LOGOS6_CHALLENGE`). The proactive flag stays off everywhere.
