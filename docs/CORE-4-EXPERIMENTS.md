# Core 4: experiments

Each experiment is a falsifiable claim about one mechanism, with the arms,
the measure, the threshold that would count as failure, and what we do if
it fails. Results go in `CORE-4-EVALS.md`; decisions they change go in
`CORE-4-COGNITIVE-DESIGN.md`. An experiment that cannot fail is not listed.

Measures are kept separate on purpose and never added together:
**task performance** (did this conversation get the job done),
**augmented performance** (how far they got with Socria),
**independent capability** (what they later do without help, measured only
in a later conversation), **satisfaction** (would they rather have had this
reply), and **engagement/retention** (not a quality measure at all).

| # | Claim | Arms | Measure | Fails if | If it fails |
|---|---|---|---|---|---|
| E0 | Core 4 beats the strongest-prompt baseline on the same model | Core 4 vs baseline, full corpus | blind pairwise preference (model judge **and** ≥2 human raters, ≥40 scenarios each) | Core 4 preferred in <50% of decided scenarios, or loses any category with n≥5 by ≥20 points | Report it. Find the mechanism responsible via E1–E6; remove or change it; re-run. Do not ship Core 4 as the default. **Status: FAILS, on the category clause only (run 6, the last 34 held-out scenarios: 16–16–2 vs A1, 18–10–6 vs B+, overreach 0/82; but expert 1–4 vs A1 and learning 1–3–1 vs B+ at n = 5). Before that: run 5 16–18–8 / 15–18–9; run 4 15–26–9 / 16–20–14. Model judges only. 15–26–9 vs A1 and 16–20–14 vs B+; decision lost 0–5 to both. Before that, run 3 (26 dev scenarios) was 11–11–4 vs A1 and 8–12–6 vs B+. Mechanisms found and changed: lower token ceilings and a brevity default on decisions and expert work; missed and too-narrow withholds. Not yet run with human raters. Core 4 is not the default.** |
| E1 | Forced moves help more than they hurt | Core 4 vs Core 4-envelope (engine sets only the budget, withhold and avoid-list; the model picks the move) | pairwise preference; "controller-caused regressions" = turns judged worse where the trace shows a move forced from inferred-only evidence | envelope preferred overall, or regressions >5% of turns | Move to the envelope for inferred-only states; keep forcing only on explicit evidence. **Run 1 showed controller-caused regressions in at least 4 of 24 scenarios (well over 5% of turns); the envelope is now the default (`e29bb4c`). Runs 2 and 3 measured the envelope against the same baselines: 5 → 11 → 11 scenario wins vs A1, and no run 3 loss traces to a forced move.** |
| E2 | The question budget reduces friction without losing necessary questions | Core 4 vs Core 4 with budget off | replies with any question; turns where a needed clarifying question was missing (judge) | missing-needed-question rate rises by >2 points | Loosen the blocker exception. |
| E3 | The state reader earns its latency | Core 4 with reader vs signals-only state (no model read) | preference; p50/p95 time to first token | no preference gain with ≥300 ms added at p50 | Drop the reader; keep explicit signals and persistence. |
| E4 | Explicit signals are precise enough to outrank inference | labelled set: ≥30 positives and ≥30 near-miss negatives per pattern (negation, reported speech, quoted assignments, pasted text) | per-pattern precision/recall | precision <0.9 for any pattern that can withhold or force a move | Demote that pattern to "inferred-high": it may shape delivery but never withhold. |
| E5 | The novelty gate removes repetition without removing value | Core 4 vs gate off, on `already-considered`, `expert`, `decision`, `longitudinal` | judge: "raised something already considered" rate; "deleted something valuable" rate (judge sees the pre-guard draft) | valuable-deletion rate >3% of gated turns | Restrict deletion to model-confirmed REDUNDANT only; lexical matches only annotate. **Triggered in the pilot (2 of ~20 gated turns) and applied**, except for re-asked questions. |
| E6 | Answer Guard 2.0's model pass is worth its latency | guard deterministic-only vs deterministic+model | overreach leaks on `mustNotReveal` turns; underhelp; added latency | no reduction in leaks and ≥500 ms added on withheld turns | Deterministic only. |
| E7 | Verify Mode's separation stops leaks without hurting correction quality | Core 4 vs Core 4 with the checker's answer given to the reply model | `mustNotReveal` leaks on practice turns; correction quality on non-withheld turns | no leak reduction | Remove the checker call; keep exact arithmetic. |
| E8 | Persistence across turns changes behaviour for the better | Core 4 vs Core 4 with state rebuilt each turn | changing-goals, repeated-questioning, longitudinal categories | no preference difference | Stop persisting the inferred parts; keep explicit signals and the ledger. |
| E9 | The ledger's attribution holds in real use | 50 generated multi-turn conversations | audit: any Socria idea recorded or rendered as the person's; any `unknown` entry said back as theirs | any instance | Tighten grounding; add the case as a regression test. |
| E10 | Independent capability, not just performance (longitudinal) | real users only, with consent | concept-level: unassisted success in a later conversation after help, Core 4 vs baseline cohort | no difference after ≥4 weeks, n≥100 per arm | Report it; the capability claim is withdrawn until a mechanism shows effect. |
| E11 | The problem model earns its place: structure the transcript cannot hold changes the reply | Core 4 vs Core 4 with `buildProblem` returning an empty model (edges dropped, detectors inert) | power-user suite; `mustContribute`; per-turn: did the reply name something whose evidence is a dependency across ≥2 turns | no difference in `mustContribute`, or the raised findings are ones the transcript alone supports | The structure is decoration. Delete `problem.ts` and `contribution.ts` and keep the reader's `relations` only if the graph view uses them. |
| E12 | Detected contributions are worth raising, and raising them does not cost restraint | Core 4 vs Core 4 with `renderMissing` suppressed | power-user suite + 20 ordinary scenarios; judge: novel-contribution rate, paternalistic, manufactured-novelty rate on the control scenario | paternalistic or manufactured novelty rises at all on the control, or the novel-contribution rate does not rise | Raise only the highest-confidence kinds (HIDDEN_ASSUMPTION, CONTRADICTION, STALE_BELIEF) and drop the heuristic ones. |
| E13 | Task-scoped competence beats one label per person | Core 4 vs Core 4 with `calibrate()` disabled (global expertise only) | `expertise-mismatch` + the matched expert/novice pair; judge: calibration failures in both directions | no reduction in "lectured an expert" or "dropped a novice into jargon" | Keep the reader's single estimate; delete `taskCompetence`. The capability table then goes back to serving the Memory page only. |
| E14 | The checker is worth running when nothing is withheld | current Core 4 vs Core 4 with the checker re-gated on `allocation.withhold` | every scenario where the person offers checkable work; correctness of the verdict the reply asserts; added p50/p95 latency | verdict accuracy does not improve, or p95 rises >600 ms on those turns | Re-gate it, and stop putting the reader's guess in the prompt as fact — say nothing about correctness instead. |
| E15 | `coverage` closes the substance gap without reopening the padding one | Core 4 vs Core 4 with `coverageFor` pinned to `normal` | power-user suite rerun (run 9) + the 34 run-6 held-out scenarios; mean words, judge helpfulness, friction, paternalistic, and `expect.maxSentences`/`answersOnly` violations | helpfulness does not rise on the `complete` turns, or friction rises above 2.5, or any turn where the person named a length runs past it | The reading was wrong: length was a symptom, not the cause. Revert `coverage` to a constant and look at what the extra 145 words in the baseline's replies actually contained. **Pre-registered before run 9. Predicted from run 8: `complete` fires on 12 of 22 turns; those turns should gain substance, the other 10 should not move.** |

## Protocol notes

- **Pre-register** the threshold before running; do not move it after.
- **Stepwise runs** (agents playing the model) are for development. A claim
  about the product needs E0 **live**, on the production model.
- **Human raters** see the page `evals/core4/human-pack.mjs` builds: blind,
  no expectations shown, stratified by category. Two raters per scenario for
  agreement; disagreements are reported, not averaged away.
- **No online learning.** Outcome labels are recorded per turn; they may
  inform a change only through an experiment here and a council decision.
- **Consent.** No experiment uses a real person's conversations without
  explicit consent for that use.
